# 構造化出力 (`--json-schema`) — 設計

このドキュメントは、`--json-schema` ヘッドレス機能の実装上の決定事項をまとめたものです。ユーザー向けの使用方法は [`docs/users/features/structured-output.md`](../../users/features/structured-output.md) にあります。

## 目標

ヘッドレス実行（`qwen -p`、パイプからの標準入力、または位置引数でのプロンプト）において、呼び出し側がモデルの最終回答をユーザーが指定した JSON Schema に制約し、検証済みのペイロードをスクリプトやダウンストリームツールが直接消費できる機械可読な出力として提供できるようにします。モデルが計画段階で偶発的に散文を生成することは許容されますが、実行はスキーマに準拠したペイロードで終了しなければならず、自由形式のテキストであってはなりません。

## アプローチ: ユーザースキーマをパラメータスキーマとする合成ツール

`--json-schema` が設定されると、`Config.createToolRegistry` は合成ツール `structured_output` を登録します（[`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)）。その `parametersJsonSchema` はユーザーが渡したスキーマそのものです。`execute()` は停止メッセージ `llmContent` を返します。ツール呼び出し基盤は既に (`BaseDeclarativeTool.build()` 内で Ajv を介して) クライアントサイドで `parametersJsonSchema` に対する引数の検証を行っているため、「モデルがスキーマに準拠した回答を返した」ということは、「モデルが `structured_output` の呼び出しに成功した」ことに帰着します。

これにより、以下の3つの特性が自動的に得られます:

1. **専用のバリデータパスが不要。** Ajv ベースの `validateToolParams` は `BaseDeclarativeTool.build()` 内で既に実行されており、`execute()` が発火する前に非準拠の引数を拒否します。
2. **標準のリトライ動作。** 検証失敗は、他のツールの引数エラーと同様に、ツール呼び出しエラーとしてモデルに通知されます。モデルは Ajv メッセージを確認し、次のターンで修正できます。
3. **プロバイダに依存しない。** Gemini、OpenAI、Anthropic はすべて (`DeclarativeTool` 抽象化を介して) ツールパラメータスキーマを同じ方法でシリアライズするため、この合成ツールは3つすべてのプロバイダで機能します。

このツールは `alwaysLoad: true` で登録されるため、ToolSearch のオンデマンドロード機構（#3589 で導入 — 検索呼び出しの背後にほとんど使用されないツールを遅延させ、モデルが要求したときにのみ完全なスキーマをマウントすることで、公開されるツール面を小さく保つ）がモデルからツールを隠すことはありません。このフラグがなければ、モデルは終端契約の存在を知ることができません。

## パース時の検証パイプライン

[`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) 内の `resolveJsonSchemaArg(raw)` は、スキーマが `Config.createToolRegistry` に到達する前に4つのチェックを実行します:

1. **ソース解決。** インラインの JSON リテラルまたは `@path/to/file` のいずれかを受け付けます。`@path` 形式は最初に解決されたパスを `stat` し、非通常ファイル（FIFO、キャラクタデバイス、ディレクトリ）を拒否し、サイズを4 MiB に制限し、JSON パースに失敗した場合は汎用エラーを出力します（stderr にファイル内容のプレフィックスは付けません）。
2. **JSON の形状。** パース結果は非配列のオブジェクトでなければなりません — プリミティブ、ブール値、配列は明確なメッセージとともに拒否されます。
3. **ルートがオブジェクトを受け付けること。** — [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts)。関数呼び出し API は常にツール引数としてオブジェクトを渡します。`{type: "array"}` のようなルートスキーマは使用不可能なツールを登録することになります。このウォークは `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not`、`if` / `then` / `else`、およびルート `$ref` を処理します。
4. **厳格な Ajv コンパイル。** — [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts)。`strictSchema: true` を指定した専用の Ajv インスタンスにより、`propertees` のようなタイプミスを検出します。これは緩やかなランタイムバリデータでは黙って無視されます。

### `schemaRootAcceptsObject` の境界

このウォークは意図的にベストエフォートです。「これは決してオブジェクトを受け付けられない」という明確なケースを捕捉し、スキーマ全体の充足可能性分析が必要なケースは Ajv にランタイムで委ねます。

**パース時に決定:**

| パターン                                                | 結果                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `type` が存在し、`"object"` を含まない                 | 拒否                                                           |
| `type: ["object", "null"]` など                         | 受理                                                           |
| `const`: 非オブジェクト値                               | 拒否                                                           |
| `enum`: オブジェクトメンバーがない（空を含む）          | 拒否                                                           |
| `anyOf`/`oneOf`: 空の配列                               | 拒否                                                           |
| `anyOf`/`oneOf`: どのブランチもオブジェクトを認めない   | 拒否                                                           |
| `allOf`: いずれかのブランチが `false` またはオブジェクトを拒否 | 拒否                                                   |
| ルート `$ref`（兄弟 `type` の有無にかかわらず）          | 拒否                                                           |
| `not`: 裸の `{type: "object"}`（絞り込みキーワードなし） | 拒否                                                           |
| `not`: `{type: "object", required: […], …}` など         | 受理（絞り込みキーワードにより一部のオブジェクトが充足可能な場合があるため、先送り） |
| `if: true` + `then` がオブジェクトを拒否                 | 拒否                                                           |
| `if: false` + `else` がオブジェクトを拒否                | 拒否                                                           |

**ランタイムで Ajv に先送り:**

- `anyOf` / `oneOf` / `allOf` ブランチ内の `$ref` （不透明 — ローカルの `$ref` 解決には循環検出、JSON Pointer エスケープ、`$defs` と `definitions` の処理が必要になるため、パース時のベストエフォートチェックとしてはコストが便益を上回る）。
- 値がオブジェクトスキーマである `if` （候補値に対してのみ決定可能）。
- `not.type` よりも複雑な否定 `anyOf` / `oneOf` / `const` パターン。
- 任意の `pattern` ReDoS 露出（ユーザー提供のため、脅威モデルは限定的 — このフラグは CLI 引数であり、ネットワーク入力ではないため）。

`maxSessionTurns` 終了パスは、`--json-schema` 固有のヒントを追加し、よくある実行停止症状（モデルが `structured_output` を呼び出さなかった）とその2つの可能性のある原因（ツールが権限で拒否された / スキーマが充足不可能）をユーザーに示すため、ランタイムのフォールスルーにユーザーから見える診断情報が含まれます。

## ランタイム: ターンディスパッチ

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts) がランタイムディスパッチを処理します。構造化出力固有の詳細:

### 事前スキャン + 兄弟抑制

モデルが同じアシスタントターン内で `structured_output` を他のツールと一緒に発行した場合、合成呼び出しが終端契約となります。`processToolCallBatch` 内の事前スキャンは `requestsToExecute` を `structured_output` 呼び出し**のみ**にフィルタリングするため、副作用のある兄弟ツール（`write_file`、`run_shell_command`、`edit` など）は決して実行されません。

例（`--json-schema` がアクティブな場合）:

| モデルが発行する内容                                      | 動作                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                  | `write_file` はスキップされる。`structured_output` が検証され、実行が終了する。                                                                                                                                                                                                                                                |
| `[structured_output(不良引数), structured_output(良好)]` | 1つ目は Ajv 検証に失敗。2つ目は成功。2つ目の呼び出しの引数で実行が終了する。                                                                                                                                                                                                                               |
| `[structured_output(不良引数), write_file(…)]`           | `structured_output(不良)` は失敗。`write_file` もスキップされる（事前に抑制された）。モデルは両方を見る: structured 呼び出しに対する Ajv のエラーメッセージと、副作用呼び出しに対する合成された `"Skipped: …"` の tool_result。次のターンで、モデルは両方を再発行するか、structured 呼び出しだけを修正する可能性がある。 |
| `[other_tool_a, other_tool_b]`（`structured_output` なし） | 事前スキャンは作用しない。両方のツールが通常通り実行される。実行は終了**しない**。                                                                                                                                                                                                                                          |

合成された "Skipped:" 本文には2つのバリアントがあります:

- **成功パス**（structured 呼び出しがこのターンで契約を捕捉した場合）:
  `"Skipped: this turn's structured_output contract took precedence as
the terminal output."` — セッションは直ちに終了し、どのコンシューマ（モデルまたは SDK）もこれを処理しないため、短い。
- **リトライパス**（structured 呼び出しが捕捉されず、モデルに別のターンが与えられた場合）:
  `"Re-issue this call in a separate turn if needed."` を追加 — これはモデルがアクションを起こせる唯一のケース。

### メインターン / ドレインターンの同一性

`processToolCallBatch(batchRequests, setModelOverride)` は `runNonInteractive` 内で定義され、以下の両方から呼び出されます:

- メインターンループ（関数の先頭）。
- `drainOneItem`（cron プロンプト / バックグラウンドタスク通知応答ループ）。

`structured_output` はセッション全体で登録されるため、cron ジョブまたは通知応答がこのツールを発火する可能性もあります。このヘルパーは呼び出し時に両方の呼び出し元を同一に処理します。唯一の呼び出し元固有のバインディングは、書き込む `modelOverride` 変数です — セッターとして渡されます。

**ヘルパー後の終了フロー**は2つの場所で異なります:
メインターンパスは直接 `return emitStructuredSuccess()` を呼び出します。一方、ドレインターンパスでは2段階の終了が必要です（`processToolCallBatch` が結果をクロージャスコープの `structuredSubmission` に捕捉し、`drainLocalQueue` がそれをチェックしてドレインループを停止し、次にホールドバックループがそれをチェックして脱出し `emitStructuredSuccess` を呼び出します）。両者は同じ終端ブロックに収束しますが、ドレインパスの追加の間接参照は重要です — これがないと、structured の結果が捕捉された後もドレインループがキュー内のアイテムを処理し続けてしまいます。

### Structured 成功終端ブロック

`emitStructuredSuccess()`（これも `runNonInteractive` 内で定義）は、「有効な呼び出しを得たのでシャットダウンする」という共通パスです:

1. `registry.abortAll()` は進行中のバックグラウンドエージェントを中止します — structured 出力契約は単発であり、`task_notification` と競合して終端出力に影響を与えるべきではありません。
2. 制限付きホールドバック（`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ミリ秒）により、中止されたばかりのエージェントの自然なキャンセルハンドラが終端の `task_notification` を発行して `localQueue` に到達する機会を与えます。ループガードは `Date.now() < deadline && registry.hasUnfinalizedTasks()` であるため、飛行中のタスクがない場合（典型的なパス）は即座に待機を終了し、上限を超えてブロックすることはありません。500 ms の上限はベストエフォートです — 特定のエージェントの中止ハンドラがその予算を超えた場合、負荷が高いと孤立した `task_started` イベントが発生する可能性があります。ループはアボートシグナルをポーリング**しません**。ホールドバック中または後続の emit パス中に SIGINT を受信しても、既に捕捉された結果が短絡されることはありません。ホールドバックがないと、stream-json コンシューマは対応する `task_notification` なしで `task_started` イベントを日常的に目にすることになります。
3. `flushQueuedNotificationsToSdk(localQueue)` はキューに残っているすべてを排出します。
4. `finalizeOneShotMonitors()`（冪等 — 2回呼び出しても安全。ドレインターンパスは既に呼び出しています）。
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### 失敗パス

| 原因                                                             | 終了コード                     | 表面                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| モデルがプレーンテキストのみを生成                                  | 1                             | ターン数 + 切り詰められた `Output preview` を含むエラー。                                                                                                                                                                                                                    |
| モデルが `maxSessionTurns` ターンの間 `structured_output` を呼び出さない | 53                            | `Reached max session turns` + よくある実行停止症状とその2つの可能性のある原因を示す `--json-schema` ヒント。                                                                                                                                                             |
| 検証が繰り返し失敗                                                | （最終的に max-turns で53）      | 各失敗は Ajv メッセージとともに次のターンでモデルに通知される。                                                                                                                                                                                                          |
| 中断 / SIGINT                                                    | 130                           | キャンセルパス。通常は structured 結果は出力されないが、`emitStructuredSuccess()` のホールドバックループはアボートシグナルをポーリングしないため、捕捉後かつ stdout 出力前/中に SIGINT が到着すると、結果がフラッシュされる可能性がある。終了コードが信頼できるシグナルとなる。 |

## 出力エンベロープ

[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts) 内のアダプタパイプラインは、`structuredResult` の存在を（`!== undefined` ではなく `'structuredResult' in options` で追跡するため、モデルが空のスキーマで引数なしで `structured_output` を呼び出した場合でも契約が保持されます）:

- `result` は強制的に `JSON.stringify(payload)` に設定されます — アダプタが蓄積した自由形式のテキスト要約を上書きします。
- トップレベルの `structured_result` フィールドは、文字列化された形式を再パースしたくないコンシューマのために生のオブジェクトを保持します。
- `undefined` ペイロードは `null` に正規化され（両方のフィールドでリテラル JSON `null` としてレンダリングされる）、フィールドが黙って消えることを防ぎます。実際にはこのフォールバックが使用されることはめったにありません。上流では、`turn.ts` が `(fnCall.args || {})` を適用して送信を保存するため、空のスキーマに対する0引数呼び出しは `{}` として着地し、stdout では `{}` としてレンダリングされ、`null` にはなりません。`?? null` のステップは、厳密に undefined の場合に対する多層防御です。

TEXT モードは `result` フィールド + 改行のみを stdout に書き出します（実行中に蓄積された偶発的なアシスタントの散文は破棄され、stderr にはミラーリングされません）。JSON モードは完全なイベントログを JSON 配列として出力します。`structured_result` は、その配列の最後の `type: "result"` 要素に存在し、ドキュメントルートにはありません。Stream-json モードは各メッセージを JSONL として個別の行に出力します。終端の `result` 行が `structured_result` を保持します。

## プライバシー: クロスサーフェス編集

`structured_output` を介して送信された引数は、構造化ペイロードそのものです。成功パスでは既に stdout に出力されています。検証失敗のリトライでは stdout に出力されない可能性があります。いずれにせよ、それらを永続的なオンデバイスサーフェスに保存したり（またはテレメトリを通じてデバイス外にエクスポートしたり）することは、ユーザーが要求したよりも長寿命のストレージにペイロードが漏洩する重複となります。したがって、編集ルールは「結果にかかわらず、この合成ツールからの引数を決して永続化しない」であり、単に「既に stdout にあるものを重複排除する」ではありません。

編集が必要なサーフェスは2つあり、両方とも同じプレースホルダ定数 [`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts) を共有します:

- `ToolCallEvent.function_args`（テレメトリ） — OTLP エクスポート、QwenLogger、ui-telemetry、およびチャット記録 UI イベントミラーをカバーします。
- `redactStructuredOutputArgsForRecording`（`geminiChat.ts` の `recordAssistantTurn` で使用） — `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` のオンディスクチャット記録 JSONL をカバーします。検証失敗のリトライもここに着地します — 各リトライの引数も同じプレースホルダーを取得します。

共有定数により、2つのサーフェス間のずれを防ぎます。ツール呼び出しのメトリクス（期間、成功、決定）は保持されます。

フック（`PreToolUse`、`PostToolUse`、`PostToolUseFailure`）は意図的に**編集されません** — フック契約は「ツールが見るものを見る」であるため、生の `tool_input` を受け取ります。これはユーザードキュメントのプライバシーセクションで「フックは生の引数を見る」というコールアウトとして文書化されているため、オペレーターは `tool_name` でフィルタリングしたり、機密データに対して `--json-schema` を実行する前にフック側で編集を追加したりできます。

編集は意図的に**オンデバイス**の永続化サーフェス（テレメトリエクスポート + チャット記録 JSONL）に範囲が限定されています。スキーマ自体は、`structured_output` 関数宣言の `parameters` ブロックとして、すべてのリクエストで依然としてモデルプロバイダに送信されます — プロバイダ側での編集は不可能です。なぜなら、モデルがツール呼び出し契約を満たすためにスキーマが必要だからです。ユーザードキュメントのプライバシーセクションでは、同じ理由で、`enum` / `const` / `default` / `examples` / `description` のペイロードに機密情報を含めないようユーザーに警告しています。

## 権限ゲーティング

`structured_output` は、`PermissionManager.CORE_TOOLS`（`--core-tools` 許可リストチェックの対象となるツールのセット）から意図的に除外されています — 他の合成ツール（`agent`、`exit_plan_mode`、`ask_user_question`、`task_stop`、`send_message`）と同様です。動的に検出されるツール（`skill`、MCP）は、無関係な理由で許可リストをバイパスする別の除外カテゴリです。この合成ツールは `--json-schema` が設定されている場合にのみ存在します。これを許可リスト機構に追加すると、`--core-tools read_file --json-schema X` が終端契約を黙って削除することになります。

明示的な `permissions.deny` ルールと `--exclude-tools` 設定は、`PermissionManager.evaluate` → `isToolEnabled` を介して引き続き適用されます。両方とも同じ拒否メカニズムを使用し、両方とも登録を防止します — ツール宣言はレジストリから削除されるため、モデルはツールを決して見ることができません。典型的な結果は、モデルがプレーンテキストで応答することです（終了コード1）。モデルがテキストを生成せずに他のツールをループする場合、最終的に `maxSessionTurns`（終了コード53）に達し、`handleMaxTurnsExceededError` 内の `--json-schema` ヒントがユーザーに確認すべき場所を示します。
**`--bare` インタラクション。** ベアモードは settings → CLI の設定ブリッジを短絡します: `packages/cli/src/config/config.ts` は `mergedDeny` を `[...(bareMode ? [] : settings.permissions.deny), ...]` として構築し、settings レベルの拒否（および `tools.exclude`）は `--bare` では無視されます。argv レベルの `--exclude-tools` は無条件に `mergedDeny` に追加されるため、引き続き適用されます。合成ツールはこれらとは独立して登録されます（`jsonSchema` によって駆動され、拒否リストには依存しません）。そのため、`--bare` 下では `structured_output` の settings のみの拒否は暗黙的にノーオペレーションとなり、ツールは呼び出し可能なままです。

## サブエージェントコンテキスト

`Config.createToolRegistry` は `forSubAgent: true` オプションを受け付け、合成ツールの登録を抑制します。サブエージェントのオーバーライドはプロトタイプ委譲（`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`）を介して親の Config を再利用し、`this.jsonSchema` はプロトタイプチェーンを通じて伝播します。このフラグがないと、合成ツールがサブエージェントのレジストリにも登録され、サブエージェントがそれを呼び出すと "session ends now" という llmContent を受け取ります。しかし、`runNonInteractive` のメインループ / ドレインループのみがそれを終端として検出するため、サブエージェントは実行を続け、そのループが契約を尊重できないツールにトークンを浪費することになります。

> **メンテナー注記。** この抑制は、`createToolRegistry(forSubAgent: true)` という単一の呼び出し経路に依存しています。この経路をバイパスする将来のサブエージェント生成メカニズムは、合成ツールをサブエージェントのレジストリに漏洩させ、トークンを永遠に消費する障害モードを再導入します。フェイルセーフの補完策として、`syntheticOutput.execute()` 内にランタイムガードを追加し、サブエージェントコンテキストから呼び出された場合に `fatalError` を返す（または何もしない）ようにすることを検討してください。2 つ目の漏洩経路が現れたら実装してください。

## MCP シャドウツールガード

`tool-registry.ts:registerTool` は、即時ツールの `tools` マップだけでなく、遅延 `factories` マップの名前の衝突もチェックします。MCP サーバーが文字通り `structured_output` という名前のツールを発見した場合、即時ツールの衝突に対して存在する自動修飾パスは、ファクトリの衝突に対しても発動します。MCP ツールは `mcp__<server>__structured_output` にリネームされ、合成ファクトリはベア名を保持します。このガードがないと、MCP サーバーが構造化出力の契約をサイレントに乗っ取る可能性があります。

## 互換性マトリクス

| 組み合わせ                                              | 状態                 | 根拠                                                                                                                                 |
| -------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (または標準入力、位置引数)         | 対応              | 主要なヘッドレスパス。                                                                                                                    |
| `--json-schema` + `--output-format text` (デフォルト)     | 対応              | `JSON.stringify(payload)` + 改行。                                                                                                      |
| `--json-schema` + `--output-format json` / `stream-json` | 対応              | `structured_result` フィールドが生のオブジェクトを保持。                                                                                         |
| `--json-schema` + `--bare`                               | 対応              | `--bare` はレジストリを `read_file`、`edit`、`run_shell_command` に制限します。合成ツールはその最小セットと一緒に登録されます。 |
| `--json-schema` + `-i`                                   | パース時に拒否 | TUI には合成ツールのターミナル契約がありません。                                                                                      |
| `--json-schema` + `--input-format stream-json`           | パース時に拒否 | 単発契約と長期プロトコルの違い。                                                                                             |
| `--json-schema` + `--acp` / `--experimental-acp`         | パース時に拒否 | ACP ループは独立しています。                                                                                                                  |
| `--json-schema` + `--prompt-interactive`                 | パース時に拒否 | `-i` と同じ。                                                                                                                             |
| `--json-schema` + プロンプトなし + パイプ標準入力なし             | パース時に拒否 | ヘッドレスにはプロンプトが必要です。                                                                                                             |

## 検討された代替案

**スキーマ認識応答プロンプティング（合成ツールなし）。** システムプロンプトでモデルに「このスキーマに一致するJSONで応答せよ」と指示し、最後のアシスタントメッセージを解析する方法。モデルに構文的な保証がないため却下されました。出力がコードフェンスで囲まれたり、余計な発話が前置されたり、フィールドを幻覚したりする可能性があります。ツール呼び出しの検証は `execute()` の前に関数呼び出しレイヤーによって強制されるため、ハードな構文的＋意味的ガードが得られます。

**OpenAI の `response_format: {type: "json_schema", …}`。** プロバイダ固有であり、Gemini や Anthropic 用の並列実装が必要になります。合成ツールアプローチはプロバイダに依存しません。

**フィルタリングの代わりに structured_output をバッチの先頭に並べ替える。** 構造化呼び出しが検証に失敗した場合、副作用を持つ兄弟ツールを実行させる可能性があります。`--json-schema` の契約は「構造化出力を生成する」ことであるため、このモードでモデルが動作している場合、兄弟ツールの副作用はおそらく間違いです。それらを完全に抑制する方が安全です。モデルは "Skipped:" という tool_result を見て、別のターンで再発行できます。

**`schemaRootAcceptsObject` 内でのローカルな `$ref` 解決。** これにより、`{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` のようなスキーマをパース時に捕捉できます。現時点では却下されました。コスト（循環検出、JSON Pointer 構文、`$defs` と `definitions` の違い、部分ポインタ、外部参照）が利点を上回るためです。`maxSessionTurns` ヒントはすでに「スキーマが充足不可能である」ことを原因としてユーザーに示しています。

## 未解決の課題

- スキーマ認識応答検証は、現実のユーザーが `--json-schema` 引数で破滅的バックトラッキングパターンに遭遇した場合に、`pattern` ベースの ReDoS ガードを追加する可能性があります。
- SDK プロトコルの追加（Python / TypeScript / Java SDK が型付きの `structured_result` フィールドを公開する）— 別途追跡；[PR #4001](https://github.com/QwenLM/qwen-code/pull/4001)（2026-05-11 にマージされずクローズ）は、cli/core の作業が開始される前にその範囲をカバーしており、その後置き換えられました。

## ファイルインデックス

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`、`schemaRootAcceptsObject`、yargs `.check` のミューテックスルール。
- `packages/cli/src/gemini.tsx` — TUI ガード、終了コードの配線。
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`、`emitStructuredSuccess`、`suppressedOutputBody`、プレーンテキストの失敗パス。
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — `structuredResult` → `result` + `structured_result` のエンベロープ。
- `packages/core/src/config/config.ts` — `registerStructuredOutputIfRequested` による登録、`forSubAgent` スキップ。
- `packages/core/src/tools/syntheticOutput.ts` — 合成ツール + `STRUCTURED_OUTPUT_REDACTED_ARGS` プレースホルダー。
- `packages/core/src/tools/tool-registry.ts` — MCP シャドウツールのファクトリ衝突リネーム。
- `packages/core/src/telemetry/types.ts` — `function_args` の編集。
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`。
- `packages/core/src/utils/schemaValidator.ts` — 厳格な Ajv インスタンスを使用した `compileStrict`。
- `packages/cli/src/utils/errors.ts` — `handleMaxTurnsExceededError` の `--json-schema` ヒント。