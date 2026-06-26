# Tool-Use Summary 設計

> 並列ツールバッチに対する高速モデルによるラベル付け — 動機、Claude Codeとの競合分析、アーキテクチャ、および現在のフルモードレンダリングを決定づけた append-only-Static の根拠。
>
> ユーザードキュメント：[Tool-Use Summaries](../../users/features/tool-use-summaries.md)

## 1. エグゼクティブサマリ

各ツールバッチが完了した後、Qwen Codeは短い高速モデル呼び出しを行い、バッチを要約した git-commit-subject 風のラベルを返します。このラベルはフルモードでは行内の薄色 `● <label>` 行として表示され、コンパクトモードでは汎用的な `Tool × N` ヘッダーを置き換えます。生成は次のターンの API ストリームと並行して fire-and-forget で実行されるため、約1秒のレイテンシはメインモデルのストリーミングの背後に隠れます。

| 項目                   | Claude Code                                                                 | Qwen Code                                                                                            |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| トリガーポイント       | `query.ts` — ツールバッチ確定後                                           | `useGeminiStream.ts` → `handleCompletedTools` — 同じライフサイクルポイント                         |
| 生成モデル             | `queryHaiku` による Haiku                                                   | 設定された `fastModel` を `GeminiClient.generateContent` で使用                                     |
| サブエージェントの動作 | `!toolUseContext.agentId` — メインセッションのみ                            | 暗黙的 — サブエージェントは `agents/runtime/` を経由し、`useGeminiStream` は使用しない              |
| スケジューリング       | Fire-and-forget、次のターンのストリーム出力直前に await                       | Fire-and-forget、解決時に履歴に追加                                                                |
| 出力形状               | `ToolUseSummaryMessage` を SDK ストリームに出力                             | `HistoryItemToolUseSummary` を UI 履歴に追加 + 将来の SDK 利用に向けてファクトリをエクスポート        |
| ゲート                 | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` 環境変数、デフォルト **オフ**         | `experimental.emitToolUseSummaries` 設定（デフォルト **オン**）+ 環境変数による上書き                 |
| 主な消費者             | モバイル / SDK クライアント                                                | CLI コンパクトモード + フルモード、将来の SDK                                                         |
| プロンプト             | git-commit-subject、過去形、最も特徴的な名詞（逐語移植）                        | 同一のシステムプロンプト                                                                             |
| 入力トランケーション   | `truncateJson` で各ツールフィールド 300 文字                               | 同一                                                                                               |
| Intent プレフィックス  | アシスタントの最後のメッセージの先頭 200 文字                                | 同一                                                                                               |
| プロンプトキャッシング | Haiku 呼び出しで `enablePromptCaching: true`                               | 未実装（forked-agent ルートは利用可能；将来の最適化としてフラグ付け）                                    |
| ラベル後処理           | モデルテキストをそのまま使用                                                  | `cleanSummary`（マークダウン、引用符、エラープレフィックスを除去；最大100文字、ReDoS 対策済み）          |
| セッション永続化       | ストリームのみ；セッションごとに再生成                                        | UI 履歴のみ；`ChatRecordingService` は `tool_use_summary` エントリを永続化しない                        |

## 2. Claude Code 実装分析

### 2.1 フロー

Claude Code は `query.ts` でツールループを実行します。ツールバッチが実行され結果が正規化された後、ジェネレーター関数が Haiku 呼び出しをフォークし、保留中の Promise を `nextPendingToolUseSummary` に保持し、次のターンの API 呼び出しを続行します。Haiku のレイテンシ（約1秒）はメインモデルのストリーミング（5〜30秒）と重なるため、ユーザーには追加のレイテンシは見えません。次のターンのコンテンツを出力する直前に、ジェネレーターは保留中のサマリを await し、`tool_use_summary` メッセージをストリームに出力します。

```
ツールバッチ完了 → queryHaiku をフォーク（fire-and-forget）
                          ↓
               次のターンのストリーム開始
                          ↓
       ← サマリの Promise がストリーミング中に解決 →
                          ↓
       pendingToolUseSummary を await → ToolUseSummaryMessage を出力
                          ↓
                次のターンに進む
```

### 2.2 主要なソースファイル

| コンポーネント        | ファイル                                                    | 主要なロジック                                                                                   |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ジェネレーター        | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97`   | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })`            |
| トリガー              | `query.ts:1411-1482`                                        | `emitToolUseSummaries` ゲート + サブエージェント以外でガード；Haiku をフォーク；Promise を保持     |
| Await + 出力          | `query.ts:1055-1060`                                        | 次のターン境界で `pendingToolUseSummary` を await、メッセージを出力                               |
| メッセージファクトリ  | `utils/messages.ts:5105-5116`                               | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                                       |
| フィーチャーゲート    | `query/config.ts:23,36-38`                                  | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                         |

### 2.3 設計上の決定

1. **ゲートがオンの場合は常に生成する（コンパクト/詳細状態に関係なく）。** サマリはストリームレベルの成果物であり、UI が表示するかどうかを決定する。
2. **ファーストクラスのメッセージタイプとして出力する。** `tool_use_summary` は `user`、`assistant`、`tool_result` と並んで SDK ストリームに存在し、`precedingToolUseIds` フィールドでコンシューマーがバッチと関連付けられる。
3. **サブエージェントは除外される。** `!toolUseContext.agentId` — サブエージェントの出力は上流で集約される。個々のサブエージェントバッチはノイズの多いラベルを生成し、プライマリ UI には決して表示されない。
4. **デフォルトでオフ。** 環境変数のみのゲートにより、ダウンストリームの SDK コンシューマーがオプトインしない限りコストはゼロ。CC ターミナル自体はメッセージを表示しない。
5. **入力はフィールドあたり 300 文字にトランケーション。** 最大のコストリスク（単一の大きなツール結果によるプロンプトの膨張）をカバーしつつ、ラベルに十分なシグナルを残す。

## 3. Qwen Code 実装

### 3.1 フロー

Qwen Code は同じライフサイクルポイント (`useGeminiStream.handleCompletedTools`) にフックしますが、`ui.compactMode` の両側でレンダリングするため、SDK の配管なしでも CLI ユーザーにとって機能が役立ちます。

```
ツールバッチ完了 (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   generateToolUseSummary をフォーク (fire-and-forget)
           ↓
  submitQuery() で次のターン（ストリーミング開始）
           ↓
   ← サマリの Promise がストリーミング中に解決 →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay がレンダリング:
    compactMode=false → ● <label> 単独行
    compactMode=true  → 非表示；MainContent のルックアップが CompactToolGroupDisplay のヘッダーに注入
```

### 3.2 主要なソースファイル

| コンポーネント            | ファイル                                                                 | 主要なロジック                                                               |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| サービス                  | `packages/core/src/services/toolUseSummary.ts`                           | `generateToolUseSummary`、`truncateJson`、`cleanSummary`、メッセージファクトリ |
| 設定ゲート                | `packages/core/src/config/config.ts:getEmitToolUseSummaries`             | 環境変数による上書き → 設定 → デフォルト (true)                              |
| トリガー                  | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`      | 高速モデル呼び出しを起動、解決時に addItem                                   |
| フルモードレンダリング    | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`                  | `!compactMode` のときに `● <label>` 行をレンダリング                         |
| コンパクトモードルックアップ | `packages/cli/src/ui/components/MainContent.tsx`                         | `summaryByCallId` マップ → `compactLabel` プロパティを各 tool_group に       |
| コンパクトヘッダー        | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx`     | デフォルトの `Tool × N` を、ラベルがある場合は `<Summary> · N tools` に置き換え |
| マージ処理                | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                    | `tool_use_summary` をコンパクトモードでは非表示（隣接要素として扱う）          |
| UI 型                     | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`                 | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`                  |

### 3.3 `<Static>` append-only 制約

このPRの中心的なアーキテクチャ上の決定は、**フルモードのラベルがなぜ tool_group 自体の装飾ではなく、独立した履歴項目なのか** という点です。

Qwen Code は Ink の `<Static>` を介してトランスクリプトをレンダリングします。Static は append-only です。一度アイテムがターミナルバッファにコミットされると、`refreshStatic()` を呼び出してトランスクリプト全体をクリアして再レンダリングしない限り、Ink はその領域を再描画しません。これが CLI が依存するパフォーマンスモデルです — Static アイテムはキー入力ごとに再レンダリングされません。

ここで高速モデル呼び出しのタイミングを考えます。

```
T0   ツールバッチ完了、tool_group が履歴にプッシュされる
T0+ε tool_group が <Static> を通じてレンダリングされ、バッファにコミットされる
T0+1s 高速モデル呼び出しがラベルを返して解決
```

T0+1s の時点で、すでにコミットされた tool_group に遡ってラベルを追加することはできません。2つの選択肢があります。

1. **tool_group の props を更新し、`refreshStatic()` を呼び出す。** 機能はするが、バッチごとにトランスクリプト全体の再描画が発生する — アプリケーションで最もコストの高い UI 操作の1つ。目に見えるフラッシュが発生する。装飾的なラベルには許容できない。
2. **サマリを tool_group の**後**に追加される新しい履歴項目としてレンダリングする。** Static はこれをネイティブに処理する — 新しいアイテムはクリーンに追加され、再描画は不要。

本PRではフルモードでオプション2を採用しています。`tool_use_summary` エントリは実際の履歴項目であり、`HistoryItemDisplay` によって単一の薄色 `● <label>` 行としてレンダリングされます。`refreshStatic` は不要です。

コンパクトモードは `mergeCompactToolGroups` が異なります。連続する tool_group がマージされる場合、`MainContent` はすでに `refreshStatic()` を呼び出しています — これは既存のコードパスであり、履歴からルックアップされたラベルを使ってマージされたグループを再レンダリングします。そのためコンパクトモードでは、ラベルがヘッダーの置き換えとして**表示されます**。同じラベルが2回（コンパクトヘッダーとして1回、末尾の `● <label>` 行として1回）レンダリングされるのを避けるため、`HistoryItemDisplay` は `compactMode` が true の場合に単独行を非表示にします。

```
フルモード             コンパクトモード（マージあり）
───────────            ─────────────────────────
[tool_group]           [マージされた tool_group — ルックアップでヘッダー置き換え]
● <label>              (● <label> 行は非表示)
```

### 3.4 ゲートのセマンティクス

3つのレイヤーがあり、優先順位の高い順に解決されます。

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — 環境変数による上書き、最優先。
2. `settings.json` の `experimental.emitToolUseSummaries` — デフォルト `true`。
3. 暗黙のスキップ — `config.getFastModel()` が `undefined` を返す場合、ゲートの状態にかかわらず生成はスキップされる。エラーは発生せず、ユーザーに見える変化もない。

### 3.5 出力のクリーニング

`cleanSummary` はモデル応答ごとに履歴に追加される前に実行されます。

1. 最初の行のみを取得（モデルの推論前文を削除）。
2. 箇条書きのプレフィックス (`-`、`*`、`•`) を除去 — モデルがラベルをリストアイテムとして返すことがある。
3. 周囲の引用符/バッククォートを、上限付き `{1,10}` の正規表現で除去（CodeQL セーフ；実際のラベルにラップ引用符が10個以上あることはない）。
4. 一部のモデルが前置するプレフィックスラベル (`Label:`、`Summary:`、`Result:`、`Output:`) を除去。
5. エラーメッセージ形式 (`API error: ...`、`Error: ...`、`I cannot ...`、`I can't ...`、`Unable to ...`) を拒否 — 空文字列を返し、履歴項目は追加されない。
6. 長さを最大100文字にハードキャップ（モバイル UI では約30文字でトランケーションされる；余裕は中国語/日本語のフレーズに対応）。

### 3.6 テレメトリ

サマリ生成呼び出しは `promptId: 'tool_use_summary_generation'` を設定するため、そのトークン使用量は `/stats` で個別に計上されます。これによりユーザーは、プロンプト提案やメインセッションの使用量と混同することなく、この機能の正確な増分コストを確認できます。

## 4. Claude Code からの逸脱（とその理由）

| 逸脱                                                                  | 理由                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境変数ゲートに加えて設定レイヤーを追加                                  | Qwen Code は CLI でラベルをレンダリングする。ユーザーはシェルごとの環境変数エクスポートではなく、永続的なスイッチを必要とする。                                  |
| デフォルトを**オン**に変更                                              | ラベルは両方の表示モードで即座にユーザーに表示される。`fastModel` を設定するユーザーはすでに高速モデル機能を利用する意思がある。                                      |
| 専用の `cleanSummary` 後処理                                            | Qwen Code は CC よりも多様なプロバイダーをサポートしている。一部のモデルは `Label:` を前置したり引用符で囲んだりする。境界での正規化により UI の一貫性を保つ。              |
| ストリームメッセージを出力する代わりに `HistoryItemToolUseSummary` を保存 | CLI ファーストの実装。SDK ストリームルートは将来のPR。`ToolUseSummaryMessage` ファクトリはその作業のために既にエクスポートされている。                              |
| プロンプトキャッシングがまだ未実装                                      | 高速モデルは、別個のモデルを設定していないユーザーにとってはメインモデルと同じであることが多い。キャッシュ共有の追加には `forkedAgent.ts` 経由のルーティングが必要。フォローアップとして追跡中。 |
| デュアルレンダリングパス（フルモードインライン + コンパクトモードヘッダー） | Qwen Code のデフォルトは `ui.compactMode: false`。フルモードのインラインレンダリングがなければ、ほとんどのユーザーはこの機能を目にしない。                      |

## 5. 既知の制限事項

- **セッション永続化なし。** `tool_use_summary` はチャット記録 JSONL に書き込まれない。セッションを再開するとラベルは失われ、ツールグループは汎用ヘッダーでフォールバック表示される。優先度低：ユーザーがセッションを続行するにつれてラベルは自然に再生成される。
- **SDK ストリーム出力はまだない。** メッセージファクトリはエクスポートされているが、CLI はまだ SDK ブリッジに `tool_use_summary` を供給していない。フォローアップPR。
- **プロンプトキャッシングなし。** 各バッチで新たな入力トークンコストが発生する。絶対的には無視できる（約300トークン）が、1ターンあたり数十のバッチを実行する場合は測定可能。
- **マージされたコンパクトグループのサマリは、最初に寄与したバッチのラベルを採用する。** ユーザーが10個の異なるバッチを連続して発行した場合（タイトループ、典型的ではない）、マージされたコンパクトヘッダーには最初のバッチの意図のみが表示される。このトレードオフを受け入れている。マージビューでバッチごとのラベルを展開するのは、最初のラベルを取るよりも視覚的にノイズが多い。
- **高速モデルが必要。** 設定された `fastModel` がない場合、生成はスキップされる。コストプロファイルを制限するために、メインモデルへのフォールバックは意図的に禁止されている。

## 6. 将来の作業

1. `ToolUseSummaryMessage` を SDK ブリッジに配線し、既存のファクトリがダウンストリームで使用されるようにする。
2. `forkedAgent.ts` 経由で `enablePromptCaching` を有効にして生成をルーティングし、繰り返しのツール名プレフィックスがプロバイダーキャッシュにヒットするようにする。
3. 任意：`tool_use_summary` エントリを `ChatRecordingService` に永続化し、セッション再開時に再生する。
4. 任意：ツール名ごとのラベルショートカット（例：単一の `read_file` 呼び出しに対して常に `Read <filename>`）を、LLM 以前の高速パスとして実装する。