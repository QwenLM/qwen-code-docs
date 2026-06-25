# コンパクション画像除去 + トークン推定修正

## 問題の概要

`ChatCompressionService` が（自動または手動で）起動すると、`historyToCompress` をそのまま要約モデルに送信します。これに関連する2つの問題が、品質・精度・コストを低下させています。

1. **インライン画像/ドキュメントのバイト列が要約プロンプトに漏れ出す。**
   MCP ツールが添付ファイル（スクリーンショット、デザインモックアップ、PDF）を返す際、`inlineData` パーツを会話に直接埋め込みます。圧縮パイプラインはこれらを除去しないため、要約モデルは通常解釈できない生の base64 データを受け取り、サイドクエリのペイロードが不必要に肥大化します。

2. **`findCompressSplitPoint` のトークン推定がバイナリパーツで誤っている。**
   分割点アルゴリズムは `JSON.stringify(content).length` を使って履歴の文字数を配分しています。1 MB の base64 画像（約 1.4M 文字）が含まれると、1エントリが約 35 万トークンに見え、実際のテキストを圧倒して誤った位置で分割されます。Qwen-VL 画像の実際のトークンコストはせいぜい数千トークンです。推定器はバイナリパーツを小さな定数として扱うべきです。

claude-code は (1) を `stripImagesFromMessages` で対処しています。qwen-code にはこの除去処理も対応する文字数カウント修正も存在しません。

この変更では両方を追加します。スコープは**コンパクションサイドクエリの入力のみ**です。ライブ会話履歴、永続化（`chats/<sessionId>.jsonl`）、および次のターンでメインモデルに送るプロンプトは変更されません。スリム化は `chatCompressionService` 内でビルドされるサイドクエリペイロードにのみ適用されます。

### スコープ外（延期または却下）

- **大量ペーストのペーストキャッシュへの外部化。** 本設計の初期案では、サイズ超過のテキストを `~/.qwen/paste-cache/<sha>.txt` にハッシュ化して保存しプレースホルダーに置き換えることを提案していました。しかし claude-code の 2026-03 〜 2026-05 リリースを調査した結果、却下しました。上流の方針は、ユーザー入力をモデルから見えるように保ち、外部化するのではなくプロンプトキャッシュ（1h TTL 設定、画像ダウンスケール）でコストを償却する方向です。ユーザー入力をハッシュプレースホルダーの裏に隠すと、コンパクションが元のテキストを圧縮した後に「意図のずれ」が生じるリスクがあります。将来的に再検討する場合は、暗黙の書き換えではなく、モデルが呼び出せる本物のツールとして `read_paste(hash)` を実装するのが正しいパターンです。

## 現状 vs 目標

| 懸念事項 | qwen-code 現状 | claude-code 参考実装 | 本変更後の目標 |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| コンパクションプロンプト内の画像/ドキュメント | そのまま送信 | `stripImagesFromMessages` で `[image]` / `[document]` に置換 | `[image: mime]` / `[document: mime]` プレースホルダーとして送信 |
| バイナリパーツのトークン推定 | `JSON.stringify().length`（大幅に不正確） | 固定バジェットとして扱う | 設定可能な定数（デフォルト 1,600 トークン / 約 6,400 文字） |
| マイクロコンパクションの画像クリーンアップ | 未対応（アイドル時にテキストツール結果のみクリア） | 時間ベースの MC ですべてクリア | マイクロコンパクションもツール結果と合わせて古いインライン画像をクリア |

## 提案する変更

### レイヤー 1: コンパクション入力スリム化（`services/compactionInputSlimming.ts`）

`Content[]` を受け取りスリム化した `Content[]` を返す新しい純粋モジュールです。変換処理は1つ: インラインメディア除去。すべての `Part` を走査し、`inlineData` または `fileData` を持つパーツを `[image: image/png]`（または `[document: application/pdf]`）形式の `text` パーツに置き換えます。

qwen-code はツールが返すメディアを `functionResponse.parts` に添付します（標準の `@google/genai` `FunctionResponse` スキーマへの拡張。`coreToolScheduler.createFunctionResponsePart` 参照）。スリマーはこのネストされた配列にも再帰的に処理するため、`read_file` や任意の MCP 添付ファイルを返すツールが返した base64 画像も置き換えられます。

変換は新しい `Content[]` 配列を返します。元の配列は変更されません。変換で変化がなかった場合は元の配列参照をそのまま返します（同一参照）。オーケストレーターは `chatCompressionService.ts` 内の `runSideQuery` 直前の最終ステップとして `slimCompactionInput` を呼び出します。

### レイヤー 2: トークン推定修正（`chatCompressionService.ts`）

`findCompressSplitPoint` は現在、文字数配分に `JSON.stringify(content).length` を使用しています。これを `estimateContentChars` ヘルパーに置き換えます:

- `text` パーツ: `text.length`
- `inlineData` / `fileData` パーツ: `imageTokenEstimate * 4`（デフォルト 1,600 × 4 = 6,400 文字）
- `functionCall` / `functionResponse` パーツ: `JSON.stringify(part).length`（既存の動作を維持）

これはスリム化モジュールが使用する定数と同じなので、分割点アルゴリズムが見るバジェットとスリム化されたプロンプトが実際に消費するバジェットが一致します。ウォークの重複を避けるため、`compress()` は `charCounts` を一度だけ事前計算して `findCompressSplitPoint` に渡します（新しい省略可能な第4引数）。同じ配列を `MIN_COMPRESSION_FRACTION` ガードにも再利用します。

### レイヤー 3: マイクロコンパクション画像クリーンアップ（`microcompaction/microcompact.ts`）

`collectCompactablePartRefs` は3つのグループを返すようになります:

- `tool` — コンパクション可能な組み込みツールの `functionResponse` パーツ。
  ユニットとしてクリア: レスポンス出力をセンチネルに置換し、`functionResponse.parts` も同時に削除。
- `media` — ユーザーロールメッセージのトップレベル `inlineData` / `fileData` パーツ（例: `@reference` で貼り付けた画像）。`[Old inline media cleared: <mime>]` に置換。
- `nested-media` — **コンパクション不可能な**ツール（例: `COMPACTABLE_TOOLS` に含まれない MCP スクリーンショットツール）の `functionResponse` パーツのうち、`functionResponse.parts` 拡張フィールドに画像/ドキュメントを持つもの。ネストされたメディアのみ削除し、ツールのテキスト出力は保持。

各種類に独自の `keepRecent` バジェットがあります。`toolResultsNumToKeep: 1` を設定すると、統合リスト全体で1件ではなく、各カテゴリの最新1件（tool 1件 + media 1件 + nested-media 1件）を保持します。

MCP ツールサーバーから取得した mimeType 値は、プレースホルダー文字列に埋め込む前に `sanitizeMimeForPlaceholder` で処理されます。スリマーとマイクロコンパクションはこのヘルパーを共有します。

### レイヤー 4: 設定（`config/config.ts`）

`chatCompression` 設定に新しいフィールドを1つ追加:

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

また、運用/デバッグ用の環境変数オーバーライド: `QWEN_IMAGE_TOKEN_ESTIMATE`。

## 主要な設計上の決定

**決定 1: `imageTokenEstimate = 1600`。**
Qwen-VL ファミリーは `vl_high_resolution_images` なしで画像あたり最大 1,280 ビジュアルトークン、フラグを有効にした場合は最大 16,384 トークンです。1,600 はやや高めに設定した保守的な中間値です — 過大推定は早めのコンパクション（安全）、過小推定は遅めのコンパクション（危険）につながります。非 VL モデル（Qwen3-Coder、qwen-code のデフォルト）では画像がモデルに届かないため、この定数はトークン推定の正確性にのみ影響します。

**決定 2: ライブ履歴ではなくスリム化されたコピーを除去する。**
`slimCompactionInput` は新しい配列を返します。`GeminiChat` に保存されたチャット履歴は変更されません。ローカル永続化（`.chats/<sessionId>.jsonl`）はユーザーが体験した完全な会話を保持するため、`--resume` は損失なく動作します。

**決定 3: マイクロコンパクションは画像を古いツール結果と同様に扱う。**
時間ベースのアイドルトリガーはすでに古いツール出力をクリアしています。インライン画像にも拡張することでポリシーの一貫性を保ち、既存の keepRecent ウィンドウを再利用します。

**決定 4: ペーストストアなし / テキスト外部化なし。**
スコープ外セクション参照。上流のコンセンサス（claude-code 2026-03 → 2026-05）は、ユーザー入力を可視のまま保ちプロンプトキャッシュで償却する方針であり、外部化はしません。

## 影響を受けるファイル

**新規ファイル**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**変更ファイル**

- `packages/core/src/config/config.ts` — `ChatCompressionSettings` を拡張
- `packages/core/src/services/chatCompressionService.ts` — `runSideQuery` 前にスリム化を呼び出す; 文字数カウントヘルパーを置き換え; charCounts を一度だけ事前計算してスプリッターとガードで使用
- `packages/core/src/services/chatCompressionService.test.ts` — base64 が要約モデルに届かないことを検証するワイヤーアップテストを追加
- `packages/core/src/services/microcompaction/microcompact.ts` — コレクションをインライン画像に拡張
- `packages/core/src/services/microcompaction/microcompact.test.ts` — 画像クリアのテスト

## スコープの境界

**スコープ内**

- コンパクション入力からインラインメディアを除去
- `findCompressSplitPoint` の文字数推定を修正
- アイドルトリガーでのマイクロコンパクション画像パーツのクリーンアップ
- 設定項目1つ + 環境変数オーバーライド

**延期**

- 大量ペーストの外部化（上記スコープ外参照）
- 再展開ツール（`read_paste(hash)` 等）
- 永続化レイヤーの重複排除
- `/context` ペースト内訳
- スリム統計のテレメトリイベント

## 未解決の疑問

1. **プレースホルダーテキストに将来の再展開のためのハッシュを含めるべきか？** 現在は `[image: image/png]` のみを出力しています。`read_paste` スタイルのツールが追加される場合、ID が必要になるかもしれません。今のところプレースホルダーは情報提供目的のみであり、元の画像はライブ履歴と永続化に残ります。
2. **`imageTokenEstimate = 1600` は Anthropic / OpenAI プロキシ経由で提供される非 Qwen-VL モデルに対して正しいか？** Claude（画像あたり最大 ~5K トークン）に対してはやや過小推定になる可能性がありますが、無害です: 分割点のヒューリスティックにのみ影響し、ユーザー向けモデルが見る実際のプロンプトには影響しません。
3. **`MIN_COMPRESSION_FRACTION` ゲートはスリム化前の文字数で計算される。** 画像の多いスライスは 5% 閾値を通過し（推定器で画像を ~6,400 文字ずつカウントするため）、スリム化後に `[image: …]` プレースホルダーに縮小される可能性があります。すると要約モデルにはほぼテキストコンテキストが届きません。これは現在意図的な動作です: 要約の役割はスライスの大部分がビジュアルであっても「ユーザーが X の画像を共有した」を記録することであり、ゲートの目的は「要約する価値があるか」の判断です — 画像はこれを合理的に満たします。品質が低下した場合は、スリム化後に再チェックするか、`imagesStripped` の割合でゲートにバイアスをかけることで再検討できます。
