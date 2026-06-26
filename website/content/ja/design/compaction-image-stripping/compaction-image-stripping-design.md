# Compaction での画像除去 + トークン推定の修正

## 問題の概要

`ChatCompressionService` が（自動または手動で）トリガーされると、`historyToCompress` がそのままサマリモデルに送られます。これにより、品質、精度、コストの面で 2 つの問題が発生します。

1. **インライン画像 / ドキュメントのバイト列がサマリプロンプトにリークする。**
   添付ファイル（スクリーンショット、デザインモック、PDF など）を扱う MCP ツールは、`inlineData` パートを会話に直接配置します。圧縮パイプラインはそれらを除去しないため、サマリモデルは通常解釈できない生の base64 を受け取り、サイドクエリのペイロードが不必要に肥大化します。

2. **バイナリパートに対する `findCompressSplitPoint` のトークン推定が誤っている。**
   分割ポイントのアルゴリズムは `JSON.stringify(content).length` を使って文字数を履歴に割り当てています。1 MB の base64 画像（約 140 万文字）があると、1 つのエントリが約 35 万トークンに見え、実際のテキストを圧倒して分割位置が間違った場所に偏ります。Qwen-VL 画像の実際のトークンコストはせいぜい数千トークンです。推定処理ではバイナリパートを小さな定数として扱うべきです。

claude-code は `stripImagesFromMessages` で (1) に対処しています。qwen-code にはこの除去処理も、対応する文字数カウントの修正もありません。

この変更では両方を追加します。対象範囲は **compaction のサイドクエリ入力のみ**です。ライブの会話履歴、永続化（`chats/<sessionId>.jsonl`）、および次のターンでメインモデルに送信されるプロンプトは変更しません。スリミングは `chatCompressionService` 内で構築されるサイドクエリペイロードにのみ適用されます。

### 対象外（延期または却下）

- **大きなペーストのペーストキャッシュへの外部化。**
   以前の設計案では、巨大なテキストをハッシュ化して `~/.qwen/paste-cache/<sha>.txt` に保存し、プレースホルダに置き換えることを提案していました。しかし、claude-code の 2026-03 から 2026-05 のリリースを調査した結果、この案は却下しました。アップストリームの方針は、ユーザー入力をモデルに見える状態に保ち、プロンプトキャッシング（1時間のTTL設定、画像のダウンスケーリングなど）でコストを償却することであり、外部化ではありません。ユーザー入力をハッシュプレースホルダの背後に隠してしまうと、compaction によって元のテキストが消失した後に「意図のずれ」が生じるリスクがあります。後日再検討する場合は、`read_paste(hash)` をモデルが呼び出せる実際のツールとして実装するのが適切であり、サイレントな書き換えはすべきではありません。

## 現在の状態と目標

| 懸念事項                          | 現在の qwen-code                                  | claude-code の参考実装                                            | この変更後の目標                                                        |
| --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| compact プロンプト内の画像/ドキュメント | そのまま送信される                                | `stripImagesFromMessages` で `[image]` / `[document]` に置き換え | `[image: mime]` / `[document: mime]` プレースホルダとして送信           |
| バイナリパートのトークン推定      | `JSON.stringify().length`（大きく外れる）          | 固定予算として扱う                                                | 設定可能な定数（デフォルト 1,600 トークン / 約 6,400 文字）             |
| マイクロコンパクトの画像クリーンアップ | 未対応（アイドル時にテキストツール結果のみクリア） | 時間ベースの MC ですべてクリア                                   | マイクロコンパクトでも、ツール結果と一緒に古いインライン画像をクリア |

## 提案する変更

### レイヤー 1: compaction 入力のスリミング（`services/compactionInputSlimming.ts`）

`Content[]` を受け取り、スリム化された `Content[]` を返す新しい純粋モジュール。変換は 1 つ: インラインメディアの除去。すべての `Part` を走査します。`inlineData` または `fileData` を持つパートは、`[image: image/png]`（または `[document: application/pdf]`）形式の `text` パートに置き換えます。

qwen-code はツールが返すメディアを `functionResponse.parts` にアタッチします（これは標準の `@google/genai` の `FunctionResponse` スキーマに対する拡張です。`coreToolScheduler.createFunctionResponsePart` を参照）。スリマーはこのネストされた配列も再帰的に処理するため、`read_file` や MCP の添付ファイルを出力するツールが返す base64 画像も置き換えられます。

この変換は新しい `Content[]` 配列を返します。元の配列は決して変更されません。変換の結果変更がなければ、元の配列への参照がそのまま返されます（同一性が保たれます）。オーケストレーターは `chatCompressionService.ts` 内の `runSideQuery` の直前のステップとして `slimCompactionInput` を呼び出します。

### レイヤー 2: トークン推定の修正（`chatCompressionService.ts`）

`findCompressSplitPoint` は現在、文字数の割り当てに `JSON.stringify(content).length` を使用しています。これを `estimateContentChars` ヘルパーに置き換えます:

- `text` パートの場合: `text.length`
- `inlineData` / `fileData` パートの場合: `imageTokenEstimate * 4`（デフォルト 1,600 × 4 = 6,400 文字）
- `functionCall` / `functionResponse` パートの場合: `JSON.stringify(part).length`（既存の動作を維持）

これはスリミングモジュールが使用するのと同じ定数であるため、分割ポイントアルゴリズムが見積もる予算が、スリム化されたプロンプトが実際に消費するものと一致します。重複した走査を避けるため、`compress()` は `charCounts` を 1 回事前計算し、それを `findCompressSplitPoint` に渡します（新しいオプションの第 4 引数）。同じ配列は `MIN_COMPRESSION_FRACTION` ガードでも再利用されます。

### レイヤー 3: マイクロコンパクトの画像クリーンアップ（`microcompaction/microcompact.ts`）

`collectCompactablePartRefs` は 3 つのグループを返すようになります:

- `tool` — compact 可能な組み込みツールからの `functionResponse` パート。1 単位としてクリア: レスポンス出力はセンチネルに置き換えられ、`functionResponse.parts` も一緒に削除されます。
- `media` — user ロールのメッセージ内のトップレベルの `inlineData` / `fileData` パート（例: `@reference` で貼り付けられた画像）。`[Old inline media cleared: <mime>]` に置き換えられます。
- `nested-media` — **compact 不可能な**ツール（例: 名前が `COMPACTABLE_TOOLS` に含まれない MCP スクリーンショットツール）からの `functionResponse` パートで、`functionResponse.parts` 拡張フィールドに画像/ドキュメントを持つもの。ネストされたメディアのみが削除され、ツールのテキスト出力は保持されます。

各グループには独自の `keepRecent` 予算があります。`toolResultsNumToKeep: 1` と設定すると、各カテゴリ（ツール、メディア、ネストメディア）の最新のものを 1 つずつ保持します。つまり、合計で 1 エントリではなく、カテゴリごとに 1 エントリです。

MCP ツールサーバーから渡される mimeType 値は、プレースホルダ文字列に埋め込まれる前に `sanitizeMimeForPlaceholder` を通過します。スリマーとマイクロコンパクトはこのヘルパーを共有します。

### レイヤー 4: 設定（`config/config.ts`）

`chatCompression` 設定に 1 つの新しいフィールドを追加します:

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

さらに、運用/デバッグ用の環境変数オーバーライド `QWEN_IMAGE_TOKEN_ESTIMATE` も用意します。

## 主要な設計判断

**判断 1: `imageTokenEstimate = 1600`。**
Qwen-VL ファミリーは、`vl_high_resolution_images` なしの場合、画像あたり最大 1,280 ビジュアルトークンです。このフラグがある場合、最大 16,384 トークンになります。1,600 はやや高めの保守的な中間値です。過大評価すると compaction が早まります（安全）、過小評価すると compaction が遅くなります（危険）。非 VL モデル（Qwen3-Coder、qwen-code のデフォルト）の場合、この定数はトークン推定の正確性にのみ影響します。画像はそもそもモデルに届かないためです。

**判断 2: ライブ履歴ではなく、スリム化したコピーに対して除去を行う。**
`slimCompactionInput` は新しい配列を返します。`GeminiChat` に保存されているチャット履歴には影響しません。ローカル永続化（`.chats/<sessionId>.jsonl`）はユーザーが見た通りの完全な会話を保持するため、`--resume` は問題なく機能します。

**判断 3: マイクロコンパクトは画像を古いツール結果と一貫して扱う。**
時間ベースのアイドルトリガーは既に古いツール出力をクリアします。これをインライン画像にも拡張することで、ポリシーの一貫性が保たれ、既存の keepRecent ウィンドウが再利用されます。

**判断 4: ペーストストア / テキストの外部化は行わない。**
「対象外」セクションを参照。アップストリームのコンセンサス（claude-code 2026-03 → 2026-05）は、ユーザー入力をそのまま表示し、プロンプトキャッシングで償却することであり、外部化ではありません。

## 影響を受けるファイル

**新規ファイル**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**変更されるファイル**

- `packages/core/src/config/config.ts` — `ChatCompressionSettings` を拡張
- `packages/core/src/services/chatCompressionService.ts` — `runSideQuery` の前にスリミングを呼び出す; char-count ヘルパーを置き換え; スプリッター + ガード用に charCounts を 1 回事前計算
- `packages/core/src/services/chatCompressionService.test.ts` — base64 がサマリモデルに到達しないことを確認する結合テストを追加
- `packages/core/src/services/microcompaction/microcompact.ts` — 収集対象をインライン画像に拡張
- `packages/core/src/services/microcompaction/microcompact.test.ts` — 画像クリアのテスト

## 範囲の境界

**対象範囲**

- compaction 入力からインラインメディアを除去
- `findCompressSplitPoint` の文字数推定を修正
- アイドルトリガーでのマイクロコンパクト画像パートのクリーンアップ
- 1 つの設定と環境変数オーバーライド

**延期**

- 大きなペーストの外部化（上記「対象外」を参照）
- 復元ツール（`read_paste(hash)` など）
- 永続化層での重複排除
- `/context` ペーストの内訳表示
- スリミング統計のテレメトリイベント

## 未解決の質問

1. **プレースホルダテキストにハッシュを含め、将来の復元を可能にするべきか？**
   現時点では `[image: image/png]` のみを出力します。`read_paste` スタイルのツールが登場した場合、ID が必要になるかもしれません。当面はプレースホルダは情報提供のみを目的としており、元の画像はライブ履歴と永続化に残っています。
2. **`imageTokenEstimate = 1600` は、Anthropic / OpenAI プロキシ経由で提供される非 Qwen-VL モデルに対して正しいか？**
   Claude（画像は最大約 5K トークン）ではやや過小評価になる可能性がありますが、害はありません。影響があるのは分割ポイントのヒューリスティックのみであり、ユーザー向けモデルが実際に受け取るプロンプトには影響しません。
3. **`MIN_COMPRESSION_FRACTION` ゲートはスリム前の文字数で計算される。**
   画像が多いスライスは、5% のしきい値を超える可能性があります（推定では各画像が約 6,400 文字としてカウントされるため）。その後、スリム化によって `[image: …]` プレースホルダに縮小されます。その結果、サマリモデルはほとんどテキストコンテキストを受け取らなくなります。これは現時点では意図的です。サマリの役割は「ユーザーが X の画像を共有した」ことを記録することであり、スライスの大部分が視覚情報であってもです。ゲートの目的は「要約する価値があるほどの量があるか」であり、画像は妥当にそれを満たします。品質が低下する場合は、スリム後に再チェックするか、`imagesStripped` の割合に基づいてゲートにバイアスをかけることで再検討できます。