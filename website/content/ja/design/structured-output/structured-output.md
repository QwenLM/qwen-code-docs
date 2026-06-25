# 構造化出力 (`--json-schema`) — 設計

このドキュメントは `--json-schema` ヘッドレス機能の実装上の決定事項をまとめたものです。ユーザー向けの使用方法は
[`docs/users/features/structured-output.md`](../../users/features/structured-output.md) にあります。

## 目的

ヘッドレス実行（`qwen -p`、パイプ stdin、または位置引数プロンプト）において、呼び出し元がモデルの最終回答をユーザー指定の JSON Schema に制約し、検証済みペイロードをスクリプトや下流ツールが直接消費できる機械可読出力として返せるようにする。プランニング中に発生するモデルの散文的な出力は許可されるが、実行はスキーマに適合したペイロードで終了しなければならず、自由形式のテキストで終了してはならない。

## アプローチ: パラメータスキーマがユーザースキーマである合成ツール

`--json-schema` が設定された場合、`Config.createToolRegistry` は合成ツール `structured_output` を登録する
([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts))。
その `parametersJsonSchema` はユーザーが渡したスキーマそのものであり、`execute()` は停止メッセージ `llmContent` を返す。ツール呼び出しインフラはすでに `parametersJsonSchema` に対して引数をクライアントサイドで検証する（`BaseDeclarativeTool.build()` 内の Ajv 経由）ため、「モデルがスキーマに適合した回答を返した」ことは「モデルが `structured_output` を正常に呼び出した」ことと等価になる。

これにより、次の 3 つのプロパティが自動的に得られる:

1. **専用バリデータパスが不要。** Ajv 依存の `validateToolParams` はすでに `BaseDeclarativeTool.build()` 内で実行され、`execute()` が呼ばれる前に非適合の引数を拒否する。
2. **標準リトライ動作。** バリデーション失敗は他のツールの引数エラーと同様にツール呼び出しエラーとしてモデルに表示される。モデルは Ajv メッセージを確認し、次のターンで修正できる。
3. **プロバイダー非依存。** Gemini、OpenAI、Anthropic はいずれもツールパラメータスキーマを同じ方法でシリアライズする（`DeclarativeTool` 抽象化経由）。合成ツールはすべてに対して機能する。

このツールは `alwaysLoad: true` で登録されるため、ToolSearch のオンデマンドロードインフラ（#3589 で導入 — まれにしか使われないツールを検索呼び出しの背後に置くことで公開ツールの表面積を小さく保ち、モデルが要求したときにのみフルスキーマをマウントする）によって隠されることはない。このフラグがなければ、モデルは終端コントラクトの存在を知ることができない。

## パース時バリデーションパイプライン

[`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) の `resolveJsonSchemaArg(raw)` は、スキーマが `Config.createToolRegistry` に到達する前に 4 つのチェックを実行する:

1. **ソース解決。** インライン JSON リテラルまたは `@path/to/file` のどちらも受け付ける。`@path` 形式は解決されたパスを最初に `stat` し、通常ファイル以外（FIFO、キャラクターデバイス、ディレクトリ）を拒否し、サイズを 4 MiB に制限し、JSON パース失敗時には汎用エラーを出力する（stderr にファイル内容のプレフィックスは含まない）。
2. **JSON 形状。** パース結果は非配列オブジェクトでなければならない — プリミティブ、ブール値、配列は明確なメッセージとともに拒否される。
3. **ルートがオブジェクトを受け入れる** —
   [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts)。
   関数呼び出し API は常にオブジェクトをツール引数として渡す。`{type: "array"}` のようなルートスキーマは使用不能なツールを登録してしまう。
   このウォークは `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not`、`if` / `then` / `else`、およびルート `$ref` を処理する。
4. **厳密な Ajv コンパイル** —
   [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts)。
   `strictSchema: true` の専用 Ajv インスタンスが `propertees` のようなタイポを検出する。これは緩やかなランタイムバリデータが無視してしまうものだ。

### `schemaRootAcceptsObject` の境界

このウォークは意図的にベストエフォートである。「これは絶対にオブジェクトを受け入れられない」という明確なケースを捕捉し、スキーマ全体の充足可能性解析が必要なものはランタイムの Ajv に委ねる。

**パース時に決定:**

| パターン                                                   | 結果                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `type` が存在し、`"object"` を含まない                     | 拒否                                                              |
| `type: ["object", "null"]` など                            | 受理                                                              |
| `const`: 非オブジェクト値                                  | 拒否                                                              |
| `enum`: オブジェクトメンバーなし（空を含む）               | 拒否                                                              |
| `anyOf`/`oneOf`: 空配列                                    | 拒否                                                              |
| `anyOf`/`oneOf`: オブジェクトを許容するブランチなし        | 拒否                                                              |
| `allOf`: `false` またはオブジェクトを拒否するブランチあり  | 拒否                                                              |
| ルート `$ref`（兄弟 `type` あり/なし）                     | 拒否                                                              |
| `not`: 単純な `{type: "object"}`（絞り込みキーワードなし） | 拒否                                                              |
| `not`: `{type: "object", required: […], …}` など           | 受理（絞り込みキーワードは一部のオブジェクトを充足可能にする。委ねる） |
| `if: true` + `then` がオブジェクトを拒否                  | 拒否                                                              |
| `if: false` + `else` がオブジェクトを拒否                 | 拒否                                                              |

**ランタイムの Ajv に委ねる:**

- `anyOf` / `oneOf` / `allOf` ブランチ内の `$ref`（不透明 — ローカル `$ref` 解決にはサイクル検出、JSON Pointer エスケープ、`$defs` vs `definitions` の処理が必要であり、パース時のベストエフォートチェックに対してコストが見合わない）。
- 値がオブジェクトスキーマである `if`（候補値に対してのみ決定可能）。
- `not.type` より複雑な否定された `anyOf` / `oneOf` / `const` パターン。
- 任意の `pattern` による ReDoS リスク（ユーザー提供。フラグは CLI 引数であり、ネットワーク入力ではないため脅威モデルは限定的）。

`maxSessionTurns` の終了パスは、一般的なスタック実行症状（モデルが `structured_output` を呼び出さない）とその 2 つの一般的な原因（ツールがパーミッションによって拒否された / スキーマが充足不能）を指す `--json-schema` 固有のヒントを追加し、ランタイムのフォールスルーにユーザー可視の診断情報を提供する。

## ランタイム: ターンディスパッチ

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
がランタイムのディスパッチを処理する。構造化出力に固有の部分は以下のとおり:

### プリスキャン + 兄弟ツール抑制

モデルが同じアシスタントターンで他のツールと一緒に `structured_output` を出力した場合、合成呼び出しが終端コントラクトとなる。`processToolCallBatch` のプリスキャンは `requestsToExecute` を **`structured_output` 呼び出しのみ** にフィルタリングするため、副作用を持つ兄弟ツール（`write_file`、`run_shell_command`、`edit` など）は実行されない。

バッチの例（`--json-schema` が有効な場合）:

| モデルの出力                                                     | 動作                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                          | `write_file` はスキップされる。`structured_output` が検証され、実行が終了する。                                                                                                                                                                                                                                                    |
| `[structured_output(bad-args), structured_output(good)]`         | 最初が Ajv バリデーション失敗。2 番目が成功。実行は 2 番目の呼び出しの引数で終了する。                                                                                                                                                                                                                                             |
| `[structured_output(bad-args), write_file(…)]`                   | `structured_output(bad)` が失敗する。`write_file` も（事前に抑制されているため）スキップされる。モデルは両方を受け取る: 構造化呼び出しの Ajv エラーメッセージと、副作用呼び出しに対する合成された `"Skipped: …"` tool_result。次のターンでモデルは両方を再発行するか、構造化呼び出しだけを修正する可能性がある。 |
| `[other_tool_a, other_tool_b]`（`structured_output` なし）       | プリスキャンは何もしない。両方のツールが通常どおり実行され、実行は**終了しない**。                                                                                                                                                                                                                                                 |

合成された "Skipped:" 本文には 2 つのバリエーションがある:

- **成功パス**（このターンで構造化呼び出しがコントラクトを取得した場合）:
  `"Skipped: this turn's structured_output contract took precedence as
the terminal output."` — セッションが直ちに終了し、（モデルも SDK も）それを処理しないため短い。
- **リトライパス**（構造化呼び出しが取得されず、モデルに次のターンが与えられる場合）: `"Re-issue this call in a separate turn if needed."` を追加する — これはモデルが対処できる唯一のケースである。

### メインターン / ドレインターンの同等性

`processToolCallBatch(batchRequests, setModelOverride)` は `runNonInteractive` 内で定義され、両方から呼び出される:

- メインターンループ（関数の先頭）。
- `drainOneItem`（cron プロンプト / バックグラウンドタスク通知返信ループ）。

ドレインターンが重要なのは、`structured_output` がセッション全体に登録されているため、cron ジョブや通知返信がツールを発火させる可能性があるからだ。ヘルパーは両方の呼び出し元を呼び出し時に同一に扱い、呼び出し元固有のバインディングは書き込む `modelOverride` 変数のみ — セッターとして渡される。

**ヘルパー後の終了フロー**は 2 つのサイトで異なる: メインターンパスは直接 `return emitStructuredSuccess()` を呼び出すが、ドレインターンパスは 2 段階の終了が必要（`processToolCallBatch` は結果をクロージャスコープの `structuredSubmission` にキャプチャし、`drainLocalQueue` がそれを確認してドレインループを停止し、ホールドバックループがそれを確認してブレークし `emitStructuredSuccess` を呼び出す）。どちらも同じ終端ブロックに収束するが、ドレインパスの余分な間接性は本質的なものだ — それなしではドレインループが構造化結果のキャプチャ後もキュー内のアイテムを処理し続けてしまう。

### 構造化成功終端ブロック

`emitStructuredSuccess()`（`runNonInteractive` 内で定義）は「有効な呼び出しを取得した、シャットダウンする」という共有パスだ:

1. `registry.abortAll()` がインフライトのバックグラウンドエージェントを中止する — 構造化出力コントラクトはシングルショットであり、`task_notification` と終端 emit でレースすべきではない。
2. 限定的なホールドバック（`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms）により、中止されたエージェントの自然なキャンセルハンドラーが終端の `task_notification` を出力して `localQueue` に格納する機会が与えられる。ループガードは `Date.now() < deadline && registry.hasUnfinalizedTasks()` であり、インフライトが何もない場合（典型的なパス）は即座に終了し、上限を超えてブロックしない。500 ms の上限はベストエフォートだ — 特定のエージェントの中止ハンドラーが予算を超えた場合、孤立した `task_started` イベントが負荷下で残る可能性がある。ループは中止シグナルをポーリング**しない**: ホールドバック中や後続の emit パス中に受信した SIGINT は、すでにキャプチャされた結果をショートサーキットしない。ホールドバックがなければ、stream-json コンシューマーは `task_notification` に対応する `task_started` イベントのないケースに頻繁に遭遇することになる。
3. `flushQueuedNotificationsToSdk(localQueue)` がまだキューに残っているすべてをドレインする。
4. `finalizeOneShotMonitors()`（冪等 — 2 回呼び出しても安全。ドレインターンパスはすでに呼び出し済み）。
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`。

### 失敗パス

| 原因                                                               | 終了コード                        | 表示                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| モデルがプレーンテキストのみを出力                                 | 1                                 | ターン数 + 切り詰めた `Output preview` を含むエラー。                                                                                                                                                                                                                                                  |
| モデルが `maxSessionTurns` ターン間 `structured_output` を呼ばない | 53                                | `Reached max session turns` + 一般的なスタック実行症状とその 2 つの原因を指す `--json-schema` ヒント。                                                                                                                                                                                                  |
| バリデーションが繰り返し失敗                                       | （最終的に max-turns で 53）      | 各失敗は次のターンで Ajv メッセージとともにモデルに表示される。                                                                                                                                                                                                                                         |
| 中止 / SIGINT                                                      | 130                               | キャンセルパス。通常、構造化結果は出力されないが、`emitStructuredSuccess()` のホールドバックループは中止シグナルをポーリングしない — キャプチャ後だが stdout 出力の前後に到着した SIGINT が結果をフラッシュする可能性がある。終了コードが信頼できるシグナルである。 |

## 出力エンベロープ

[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
のアダプタパイプラインは `structuredResult` の存在を（`!== undefined` ではなく `'structuredResult' in options` で）追跡する。これにより、空のスキーマで引数なしに `structured_output` を呼び出した場合でもコントラクトが保持される:

- `result` は `JSON.stringify(payload)` に強制される — アダプタが蓄積した自由形式のサマリーを上書きする。
- トップレベルの `structured_result` フィールドが文字列化された形式を再パースしたくないコンシューマーのために生のオブジェクトを保持する。
- `undefined` ペイロードは `null` に正規化される（両フィールドでリテラル JSON `null` としてレンダリングされる）ため、フィールドが無言で消えることはない。実際には、このフォールバックはほとんど到達されない: 上流の `turn.ts` が `(fnCall.args || {})` を適用してからサブミッションを保存するため、空のスキーマに対するゼロ引数呼び出しは `{}` として格納され、stdout で `{}` としてレンダリングされ、`null` にはならない。`?? null` ステップは厳密に undefined の場合に対する多重防御だ。

TEXT モードは `result` フィールド + 改行のみを stdout に書き込む（実行中に蓄積されたアシスタントの散文的な出力は破棄される — stderr にもミラーリングされない）。JSON モードは全イベントログを JSON 配列として出力し、`structured_result` はドキュメントルートではなく配列の最後の `type: "result"` 要素に格納される。stream-json モードは各メッセージを JSONL として 1 行ずつ出力し、終端の `result` 行に `structured_result` が含まれる。

## プライバシー: クロスサーフェスリダクション

`structured_output` 経由でサブミットされた引数はそのまま構造化ペイロードとなる。成功パスでは既に stdout に出力されており、バリデーション失敗リトライでは stdout に到達しない可能性がある。いずれの場合も、永続的なオンデバイスストレージに保存したり、テレメトリーによりオフデバイスにエクスポートしたりすることは、ペイロードをユーザーが求めた以上に長命なストレージに漏洩させる重複だ。リダクションルールは「結果にかかわらず、この合成ツールからのいかなる引数も保存しない」であり、「すでに stdout にあるものを重複排除する」ではない。

2 つのサーフェスがリダクションを必要とし、両方が同じプレースホルダー定数
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts) を共有する:

- `ToolCallEvent.function_args`（テレメトリー） — OTLP エクスポート、QwenLogger、ui-telemetry、チャット録画 UI イベントミラーをカバーする。
- `redactStructuredOutputArgsForRecording`（`geminiChat.ts` の `recordAssistantTurn` で使用） — オンディスクのチャット録画 JSONL をカバーする。場所は
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`。
  バリデーション失敗リトライもここに記録される — 各リトライの引数にも同じプレースホルダーが適用される。

共有定数により 2 つのサーフェス間のずれを防ぐ。ツール呼び出しメトリクス（期間、成功、決定）は保持される。

フック（`PreToolUse`、`PostToolUse`、`PostToolUseFailure`）は意図的に**リダクションされない** — フックコントラクトは「ツールが見るものを見る」であるため、生の `tool_input` を受け取る。これはユーザードキュメントのプライバシーセクションで「フックは生の引数を見る」という注意書きとして記載されており、オペレーターが機密データに対して `--json-schema` を実行する前に `tool_name` でフィルタリングするかフックサイドのリダクションを追加できるようにしている。

リダクションは意図的に**オンデバイス**の永続化サーフェス（テレメトリーエクスポート + チャット録画 JSONL）にスコープされる。スキーマ自体は `structured_output` 関数宣言の `parameters` ブロックとして毎回のリクエストでモデルプロバイダーに送信される — モデルはツール呼び出しコントラクトを満たすためにスキーマが必要なため、プロバイダーサイドのリダクションは不可能だ。ユーザードキュメントのプライバシーセクションでは、同じ理由から `enum` / `const` / `default` / `examples` / `description` ペイロードにシークレットを含めないよう警告している。

## パーミッションゲーティング

`structured_output` は意図的に `PermissionManager.CORE_TOOLS`（`--core-tools` 許可リストチェックの対象ツールセット）から除外されている — 他の合成ツール（`agent`、`exit_plan_mode`、`ask_user_question`、`task_stop`、`send_message`）と同様に。動的に検出されるツール（`skill`、MCP）は無関係な理由により許可リストをバイパスする別の除外カテゴリである。合成ツールは `--json-schema` が設定された場合のみ存在する。許可リスト機構に追加すると、`--core-tools read_file --json-schema X` が終端コントラクトを無言で削除してしまう。

明示的な `permissions.deny` ルールと `--exclude-tools` 設定は `PermissionManager.evaluate` → `isToolEnabled` 経由で引き続き適用される。両方が同じ拒否メカニズムを使用し、両方が登録を阻止する — ツール宣言がレジストリから削除されるため、モデルはそのツールを認識しない。典型的な結果としてモデルはプレーンテキストで回答する（終了コード 1）。モデルがテキストを生成せずに他のツールをループし続けた場合、最終的に `maxSessionTurns`（終了コード 53）に達し、`handleMaxTurnsExceededError` の `--json-schema` ヒントがユーザーに確認場所を示す。

**`--bare` との相互作用。** bare モードは設定 → CLI 設定ブリッジをショートサーキットする: `packages/cli/src/config/config.ts` は `mergedDeny` を `[...(bareMode ? [] : settings.permissions.deny), ...]` として構築するため、`--bare` 下では設定レベルの拒否（および `tools.exclude`）が削除される。argv レベルの `--exclude-tools` は無条件に `mergedDeny` に追加されるため、引き続き適用される。合成ツールはこれらすべてとは独立して登録される（`jsonSchema` によって駆動され、拒否リストではない）ため、設定のみによる `structured_output` の拒否は `--bare` 下で無言に無効化され、ツールは呼び出し可能な状態のままとなる。

## サブエージェントコンテキスト

`Config.createToolRegistry` は `forSubAgent: true` オプションを受け入れ、合成ツールの登録を抑制する。サブエージェントのオーバーライドはプロトタイプデリゲーション（`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`）を通じて親 Config を再利用し、`this.jsonSchema` はプロトタイプチェーンを通じて伝播する。このフラグがなければ、合成ツールはサブエージェントのレジストリにも登録され、サブエージェントがそれを呼び出すと「セッションが今すぐ終了する」という `llmContent` を受け取る — しかし、それを終端として検出するのは `runNonInteractive` のメイン / ドレインループのみであり、サブエージェントは実行を続けてコントラクトを履行できないツールにトークンを浪費してしまう。

> **メンテナーノート。** この抑制は `createToolRegistry(forSubAgent: true)` を通る単一の呼び出しパスにかかっている。この呼び出しパスをバイパスする将来のサブエージェントスポーンメカニズムは合成ツールをサブエージェントのレジストリに漏洩させ、トークンを無限に浪費する障害モードを再発させる。フェイルセーフの補完策として、`syntheticOutput.execute()` 内にサブエージェントコンテキストから呼び出された場合に `fatalError`（またはノーオペレーション）を返すランタイムガードを追加することが考えられる。2 番目のリークパスが現れた場合はこれを実装すること。

## MCP シャドウツールガード

`tool-registry.ts:registerTool` は名前の衝突を eager な `tools` マップだけでなく lazy な `factories` マップでも確認する。MCP サーバーが文字通り `structured_output` という名前のツールを検出した場合、eager ツール衝突に存在する自動修飾パスがファクトリ衝突にも発火する: MCP ツールは `mcp__<server>__structured_output` にリネームされ、合成ファクトリはベア名を保持する。このガードがなければ、MCP サーバーが構造化出力コントラクトを無言でハイジャックできてしまう。

## 互換性サーフェス

| 組み合わせ                                                       | 状態             | 根拠                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p`（または stdin、位置引数）                 | サポート         | プライマリヘッドレスパス。                                                                                                                      |
| `--json-schema` + `--output-format text`（デフォルト）           | サポート         | `JSON.stringify(payload)` + 改行。                                                                                                              |
| `--json-schema` + `--output-format json` / `stream-json`         | サポート         | `structured_result` フィールドが生のオブジェクトを保持する。                                                                                    |
| `--json-schema` + `--bare`                                       | サポート         | `--bare` はレジストリを `read_file`、`edit`、`run_shell_command` に制限するが、合成ツールはその最小セットと並行して登録される。                  |
| `--json-schema` + `-i`                                           | パース時に拒否   | TUI には合成ツールの終端コントラクトがない。                                                                                                    |
| `--json-schema` + `--input-format stream-json`                   | パース時に拒否   | シングルショットコントラクト vs. 長命プロトコル。                                                                                               |
| `--json-schema` + `--acp` / `--experimental-acp`                 | パース時に拒否   | ACP ループは独立している。                                                                                                                      |
| `--json-schema` + `--prompt-interactive`                         | パース時に拒否   | `-i` と同様。                                                                                                                                   |
| `--json-schema` + プロンプトなし + パイプ stdin なし             | パース時に拒否   | ヘッドレスにはプロンプトが必要。                                                                                                                |

## 検討した代替案

**スキーマ対応レスポンスプロンプティング（合成ツールなし）。** システムプロンプト経由でモデルに「このスキーマに一致する JSON で回答する」よう指示し、最終アシスタントメッセージをパースする方法。モデルには構文的な保証がない — 出力はフェンスされたり、雑談でプレフィックスされたり、フィールドをハルシネーションしたりする可能性があるため拒否した。ツール呼び出しバリデーションは `execute()` の前に関数呼び出しレイヤーによって強制され、構文的 + 意味的なハードガードが得られる。

**OpenAI の `response_format: {type: "json_schema", …}`。** プロバイダー固有であり、Gemini と Anthropic に対して並行実装が必要になる。合成ツールアプローチはプロバイダー非依存だ。

**バッチ内で structured_output をフィルタリングする代わりに先頭に並べ替える。** 構造化呼び出しがバリデーション失敗した場合に副作用を持つ兄弟ツールが実行できる。しかし、`--json-schema` のコントラクトは「構造化出力を生成する」ことであり、モデルがこのモードにある場合、兄弟の副作用はおそらく誤りだ。それらを完全に抑制する方がより安全であり、モデルは "Skipped:" tool_result を受け取り、次のターンで再発行できる。

**`schemaRootAcceptsObject` 内のローカル `$ref` 解決。** `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` のようなスキーマをパース時に捕捉できる。コスト（サイクル検出、JSON Pointer 構文、`$defs` vs `definitions`、部分ポインタ、リモート参照）が利益を上回るため現時点では拒否した。`maxSessionTurns` ヒントはすでに「スキーマが充足不能」を一般的な原因としてユーザーに示している。

## 未解決の作業

- スキーマ対応レスポンスバリデーションは、実際のユーザーが `--json-schema` 引数で壊滅的なバックトラッキングパターンに遭遇した場合、`pattern` ベースの ReDoS ガードを追加できる。
- SDK プロトコルの追加（Python / TypeScript / Java SDK が型付きの `structured_result` フィールドを公開する） — 別途追跡。
  [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001)（2026-05-11 にマージされずクローズ）は、cli/core の作業が着地する前にそのスコープをカバーしていたが、後継実装に取って代わられた。

## ファイルインデックス

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`、
  `schemaRootAcceptsObject`、yargs `.check` mutex ルール。
- `packages/cli/src/gemini.tsx` — TUI ガード、終了コード配管。
- `packages/cli/src/nonInteractiveCli.ts` —
  `processToolCallBatch`、`emitStructuredSuccess`、
  `suppressedOutputBody`、プレーンテキスト失敗パス。
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` —
  `structuredResult` → `result` + `structured_result` エンベロープ。
- `packages/core/src/config/config.ts` — `registerStructuredOutputIfRequested` での登録、`forSubAgent` スキップ。
- `packages/core/src/tools/syntheticOutput.ts` — 合成ツール +
  `STRUCTURED_OUTPUT_REDACTED_ARGS` プレースホルダー。
- `packages/core/src/tools/tool-registry.ts` — MCP シャドウツールのファクトリ衝突リネーム。
- `packages/core/src/telemetry/types.ts` — `function_args` リダクション。
- `packages/core/src/core/geminiChat.ts` —
  `redactStructuredOutputArgsForRecording`。
- `packages/core/src/utils/schemaValidator.ts` — 厳密な Ajv インスタンスを用いた `compileStrict`。
- `packages/cli/src/utils/errors.ts` —
  `handleMaxTurnsExceededError` の `--json-schema` ヒント。
