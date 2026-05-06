# ツール使用サマリーの設計

> 並列ツールバッチ用の高速モデルラベル — 動機、Claude Code との競合分析、アーキテクチャ、および現在のフルモードレンダリングを決定した append-only な `<Static>` の設計根拠。
>
> ユーザー向けドキュメント: [ツール使用サマリー](../../users/features/tool-use-summaries.md)。

## 1. エグゼクティブサマリー

各ツールバッチの完了後、Qwen Code はバッチを要約する git コミットメッセージの件名形式のラベルを返す、短い高速モデル呼び出しを実行します。このラベルは、フルモードではインラインの薄表示 `● <label>` 行として表示され、コンパクトモードでは汎用的な `Tool × N` ヘッダーを置き換えます。生成は fire-and-forget で実行され、次のターンの API ストリームと並行して処理されるため、約 1 秒のレイテンシはメインモデルのストリーミングの裏に隠れます。

| 比較項目             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| トリガーポイント         | `query.ts` — ツールバッチの確定後                             | `useGeminiStream.ts` → `handleCompletedTools` — 同じライフサイクルポイント                       |
| 生成モデル      | `queryHaiku` 経由の Haiku                                                | `GeminiClient.generateContent` 経由の設定済み `fastModel`                                  |
| サブエージェントの動作     | `!toolUseContext.agentId` — メインセッションのみ                         | 暗黙的 — サブエージェントは `useGeminiStream` ではなく `agents/runtime/` を経由して実行                  |
| スケジューリング            | fire-and-forget、次のターンのストリーム出力直前に await    | fire-and-forget、解決時に履歴に追加                                         |
| 出力形式          | `ToolUseSummaryMessage` を SDK ストリームに yield                   | `HistoryItemToolUseSummary` を UI 履歴に追加 + 将来の SDK 利用向けにファクトリをエクスポート      |
| 機能フラグ                  | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` 環境変数、デフォルト **オフ**            | `experimental.emitToolUseSummaries` 設定（デフォルト **オン**）+ 環境変数による上書き                |
| 主なコンシューマー      | モバイル / SDK クライアント                                                  | CLI コンパクトモード + フルモード、将来の SDK                                                   |
| プロンプト                | git コミット件名形式、過去形、最も特徴的な名詞（そのまま移植） | 同一のシステムプロンプト                                                                    |
| 入力の切り詰め      | `truncateJson` 経由でツールフィールドごとに 300 文字                           | 同一                                                                                  |
| 意図プレフィックス         | アシスタントの最後のメッセージの先頭 200 文字                       | 同一                                                                                  |
| プロンプトキャッシュ        | Haiku 呼び出しで `enablePromptCaching: true`                         | 未接続（forked-agent ルートは利用可能。将来の最適化としてフラグ設定済み）               |
| ラベルの後処理 | 生モデルテキスト                                                        | `cleanSummary`（マークダウン、引用符、エラープレフィックスを削除。100 文字で制限、ReDoS 対策済み） |
| セッションの永続化   | ストリームのみ。各セッションで再生成                                 | UI 履歴のみ。`ChatRecordingService` は `tool_use_summary` エントリを永続化しない        |

## 2. Claude Code の実装分析

### 2.1 フロー

Claude Code は `query.ts` でツールループを実行します。ツールバッチが実行され結果が正規化されると、ジェネレーター関数は Haiku 呼び出しをフォークし、保留中の Promise を `nextPendingToolUseSummary` に保持したまま、次のターンの API 呼び出しを続行します。Haiku のレイテンシ（約 1 秒）はメインモデルのストリーミング（5〜30 秒）と重なるため、ユーザーに追加のレイテンシは認識されません。次のターンのコンテンツを出力する直前に、ジェネレーターは保留中のサマリーを await し、`tool_use_summary` メッセージをストリームに yield します。

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← summary Promise resolves during streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue with next turn
```

### 2.2 主要なソースファイル

| コンポーネント       | ファイル                                                       | 主要ロジック                                                                               |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ジェネレーター       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| トリガー         | `query.ts:1411-1482`                                       | `emitToolUseSummaries` フラグによるガード + サブエージェント除外。Haiku をフォークし Promise を保持           |
| Await + 出力    | `query.ts:1055-1060`                                       | 次のターンの境界で `pendingToolUseSummary` を await し、メッセージを yield                      |
| メッセージファクトリ | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| 機能フラグ    | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 設計上の判断

1. **ゲートがオンの場合、コンパクト/詳細状態に関係なく常に生成する。** サマリーはストリームレベルの成果物であり、レンダリングするかどうかは UI が決定する。
2. **ファーストクラスのメッセージ型として出力する。** `tool_use_summary` は SDK ストリーム内で `user`、`assistant`、`tool_result` と並び、`precedingToolUseIds` フィールドによりコンシューマーがバッチと関連付けられるようにする。
3. **サブエージェントは除外する。** `!toolUseContext.agentId` — サブエージェントの出力は上流で集約される。個々のサブエージェントバッチはノイズの多いラベルを生成し、メイン UI に表示されないため。
4. **デフォルトはオフ。** 環境変数のみのゲートにより、下流の SDK コンシューマーがオプトインしない限りコストはゼロに保たれる。CC ターミナル自体はこのメッセージをレンダリングしない。
5. **フィールドごとに 300 文字で入力を切り詰める。** プロンプトを肥大化させる単一の大きなツール結果という主要なコストリスクをカバーしつつ、ラベル生成に必要な十分なシグナルを保持する。

## 3. Qwen Code の実装

### 3.1 フロー

Qwen Code は同じライフサイクルポイント（`useGeminiStream.handleCompletedTools`）にフックするが、`ui.compactMode` の両側でレンダリングを行うため、SDK 連携なしでも CLI ユーザーにとって有用な機能となる。

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() for next turn (streaming starts)
           ↓
   ← summary Promise resolves during streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay renders:
    compactMode=false → ● <label> の独立した行
    compactMode=true  → 非表示。MainContent のルックアップが CompactToolGroupDisplay ヘッダーに注入
```

### 3.2 主要なソースファイル

| コンポーネント           | ファイル                                                                  | 主要ロジック                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| サービス             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`、`truncateJson`、`cleanSummary`、メッセージファクトリ |
| 設定ゲート         | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | 環境変数による上書き → 設定 → デフォルト (true)                                  |
| トリガー             | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | 高速モデル呼び出しを発火。解決時に addItem                                 |
| フルモードレンダリング    | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | `!compactMode` の場合に `● <label>` 行をレンダリング                              |
| コンパクトモードのルックアップ | `packages/cli/src/ui/components/MainContent.tsx`                      | `summaryByCallId` マップ → 各 tool_group への `compactLabel` プロップ            |
| コンパクトヘッダー      | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | ラベルが存在する場合、デフォルトの `Tool × N` を `<Summary> · N tools` に置き換え |
| マージ処理      | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | 隣接処理のため `tool_use_summary` をコンパクトモードで非表示として扱う              |
| UI 型             | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 `<Static>` の append-only 制約

この PR の中心的なアーキテクチャ上の判断は、**フルモードのラベルが tool_group 自体の装飾ではなく、独立した履歴アイテムである理由**にある。

Qwen Code は Ink の `<Static>` を介してトランスクリプトをレンダリングする。Static は append-only である。アイテムがターミナルバッファにコミットされると、`refreshStatic()` を呼び出してトランスクリプト全体をクリアして再レンダリングしない限り、Ink はその領域を再描画しない。これは CLI が依存するパフォーマンスモデルであり、静的アイテムはキーストロークごとに再レンダリングされない。

ここで、高速モデル呼び出しのタイミングを考慮する。

```
T0   ツールバッチ完了、tool_group が履歴にプッシュされる
T0+ε tool_group が <Static> を介してレンダリングされ、バッファにコミットされる
T0+1s 高速モデル呼び出しがラベルを返して解決する
```

T0+1s の時点で、すでにコミット済みの tool_group にラベルを後から追加することはできない。選択肢は 2 つある。

1. **tool_group の props を更新し、`refreshStatic()` を呼び出す。** 動作はするが、バッチごとにトランスクリプト全体の再描画が発生する。これはアプリ内で最もコストの高い UI 操作の 1 つであり、目に見えるフラッシュが発生する。見た目のためのラベルとしては許容できない。
2. **サマリーを tool_group の _後に_ 追加される新しい履歴アイテムとしてレンダリングする。** Static はこれをネイティブに処理する。新しいアイテムはクリーンに追加され、再描画は不要。

この PR ではフルモードでオプション 2 を採用する。`tool_use_summary` エントリは実際の履歴アイテムであり、`HistoryItemDisplay` によって単一の薄表示 `● <label>` 行としてレンダリングされる。`refreshStatic` は不要。

コンパクトモードは `mergeCompactToolGroups` のため動作が異なる。連続する tool_group がマージされると、`MainContent` はすでに `refreshStatic()` を呼び出している。これは既存のコードパスであり、履歴からルックアップしたラベルを使用してマージ済みグループを再レンダリングする。したがって、コンパクトモードではラベルがヘッダーの置き換えとして _実際に_ 適用される。同じラベルを 2 回レンダリングするのを防ぐため（1 回はコンパクトヘッダーとして、1 回は末尾の `● <label>` 行として）、`compactMode` が true の場合、`HistoryItemDisplay` は独立した行を非表示にする。

```
フルモード              コンパクトモード（マージあり）
───────────            ─────────────────────────
[tool_group]           [マージ済み tool_group — ルックアップ経由でヘッダー置き換え]
● <label>              (● <label> 行は非表示)
```

### 3.4 ゲートのセマンティクス

3 つのレイヤーがあり、優先順位の高い順に解決される。

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — 環境変数による上書き。最優先。
2. `settings.json` 内の `experimental.emitToolUseSummaries` — デフォルト `true`。
3. 暗黙的なスキップ — `config.getFastModel()` が `undefined` を返す場合、ゲートの状態に関係なく生成はスキップされる。エラーは発生せず、ユーザーに見える変化もない。

### 3.5 出力のクリーニング

モデルからの応答が履歴に追加される前に、`cleanSummary` が毎回実行される。

1. 最初の行のみを取得する（モデルの推論プレアンブルを削除）。
2. 箇条書きプレフィックス（`-`、`*`、`•`）を削除する。モデルがラベルをリスト項目として返す場合があるため。
3. 境界付き `{1,10}` 正規表現を使用して周囲の引用符/バックティックを削除する（CodeQL セーフ。実際のラベルに多数の引用符がラップされることはない）。
4. 一部のモデルが先頭に付加するプレフィックスラベル（`Label:`、`Summary:`、`Result:`、`Output:`）を削除する。
5. エラーメッセージ形式（`API error: ...`、`Error: ...`、`I cannot ...`、`I can't ...`、`Unable to ...`）を拒否する。空文字列を返し、履歴アイテムは追加されない。
6. 長さを 100 文字で厳密に制限する（モバイル UI は約 30 文字で切り詰める。余裕は CJK フレーズに対応するため）。

### 3.6 テレメトリ

サマリー生成呼び出しは `promptId: 'tool_use_summary_generation'` を設定するため、トークン使用量は `/stats` で個別に集計される。これにより、ユーザーはプロンプトの提案やメインセッションの使用量と混同することなく、この機能の正確な増分コストを確認できる。

## 4. Claude Code との差異（とその理由）

| 差異                                                                | 理由                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境変数ゲートに加えて設定レイヤーを追加                                   | Qwen Code は CLI でラベルをレンダリングするため、ユーザーはシェルごとの環境変数エクスポートではなく、永続的な切り替えスイッチを必要とする。                                                                                     |
| デフォルトをオフではなく **オン** に設定                                            | ラベルは両方の表示モードですぐにユーザーに表示される。`fastModel` を設定しているユーザーは、すでに高速モデル機能を利用する選択をしている。                                                     |
| 専用の `cleanSummary` 後処理                                 | Qwen Code は CC よりも多様なプロバイダーをサポートしており、一部のモデルは `Label:` を先頭に付加したり引用符で囲んだりする。境界で正規化することで UI の一貫性を保つ。                           |
| ストリームメッセージを出力するのではなく `HistoryItemToolUseSummary` を保存 | CLI ファーストの実装。SDK ストリームルートは今後の PR で対応。`ToolUseSummaryMessage` ファクトリはすでにその作業用にエクスポート済み。                                                   |
| プロンプトキャッシュはまだ接続されていない                                             | 別のモデルを設定していないユーザーにとって、高速モデルはメインモデルと同じであることが多い。キャッシュ共有の追加には `forkedAgent.ts` を介したルーティングが必要であり、フォローアップ課題として追跡中。 |
| 二重のレンダリングパス（フルモードのインライン + コンパクトモードのヘッダー）               | Qwen Code のデフォルトは `ui.compactMode: false` である。インラインのフルモードレンダリングがなければ、この機能はほとんどのユーザーに見えない。                                                      |

## 5. 既知の制限事項

- **セッションの永続化なし。** `tool_use_summary` はチャット記録の JSONL に書き込まれない。セッションを再開するとラベルは失われ、ツールグループはフォールバックとして汎用ヘッダーでレンダリングされる。優先度低：ユーザーがセッションを継続するにつれて、ラベルは自然に再生成される。
- **SDK ストリームへの出力未実装。** メッセージファクトリはエクスポートされているが、CLI はまだ `tool_use_summary` を SDK ブリッジに渡していない。今後の PR で対応。
- **プロンプトキャッシュなし。** 各バッチごとに新しい入力トークンコストが発生する。絶対値では無視できる程度（約 300 トークン）だが、1 ターンで数十バッチ実行する場合は測定可能なコストとなる。
- **マージされたコンパクトグループのサマリーは、最初のバッチのラベルを採用する。** ユーザーが 10 種類の異なるバッチを連続して実行した場合（タイトなループ、典型的ではない）、マージされたコンパクトヘッダーには先頭バッチの意図のみが表示される。トレードオフとして受け入れ済み：マージビューでバッチごとのラベルを展開するよりも、最初のものを採用する方が視覚的なノイズが少ない。
- **高速モデルが必須。** `fastModel` が設定されていない場合、生成はスキップされる。コストプロファイルを一定に保つため、メインモデルへのフォールバックは意図的に禁止されている。

## 6. 今後の作業

1. 既存のファクトリが下流で使用されるよう、`ToolUseSummaryMessage` を SDK ブリッジに接続する。
2. 繰り返し使用されるツール名のプレフィックスがプロバイダーキャッシュにヒットするよう、`enablePromptCaching` を有効にして `forkedAgent.ts` を介して生成をルーティングする。
3. オプション：`tool_use_summary` エントリを `ChatRecordingService` に永続化し、セッション再開時に再生する。
4. オプション：LLM 呼び出し前の高速パスとして、ツール名ごとのラベルショートカット（例：単一の `read_file` 呼び出しに対して常に `Read <filename>`）を実装する。