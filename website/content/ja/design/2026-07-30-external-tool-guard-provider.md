# Managed ACP 向けの外部ツールガードプロバイダー

ステータス: 実装設計
トラッキング issue: https://github.com/QwenLM/qwen-code/issues/8102
依存: https://github.com/QwenLM/qwen-code/pull/8032

## 問題とスコープ

Qwen Code はすでにパーミッションルールとフックをサポートしているが、それらの機構は
managed な `qwen serve` デプロイに対して、すべてのツールエグゼキューターの直前に必須の、
外部の、機械検証可能な判定を与えない。PR #8032 がそのエグゼキューター境界のコールバックを
追加する。本変更はそのコールバックを、managed ACP デプロイ向けの小さな外部プロバイダーに
接続する。

スコープは意図的に 1 つの判定のみ:

> ランタイム所有のセッションとプロンプトの identity、ランタイムが受け入れた
> ツール呼び出しの相関ラベル、正規のツール名、最終引数が与えられたとき、
> この呼び出しは今実行してよいか？

本変更はタスクプロトコル、結果コールバック、オブザーバー/リプレイサービス、汎用の
フック置換、明示的なデーモン制御/管理 API の認可レイヤーを追加しない。また、許可された
ツール実装を決定論的にすることや、プロバイダーが許可を選んだコマンドの挙動をサンドボックス化
することもしない。

## 安全性契約

- 有効化はプロセス起動時のみ: `off`（デフォルト）または `required`。
- `off` ではプロバイダーは構築されず、プロバイダー RPC も行われず、capability も
  広告されない。新しい入力が存在しないため、スタンドアロン CLI / 通常の ACP の挙動は
  不変。予約されたトークンの環境変数は、設定されていれば引き続き子孫の実行環境から
  スクラブされる。
- `required` では、デーモン起動時に認証付きバージョン付きハンドシェイクを行う。
  設定の欠落/無効、およびプロバイダーの利用不可/非互換はデーモン起動を失敗させる。
- 既存のパーミッションと `PreToolUse` ゲートを通過し最終実行境界に到達する、
  サポートされるすべてのトップレベル呼び出しは、上限付きの `prepare` リクエストを
  正確に 1 回行う。それ以前のパーミッション/フック拒否はプロバイダーリクエストを行わない。
  リトライはない。タイムアウト、キャンセル、トランスポート失敗、不正形式レスポンス、
  identity 不一致、明示的な拒否はエグゼキューターの実行を防ぐ。
- 継承した PR #8032 の順序は、パーミッション処理、`PreToolUse` フック、次に本 Guard、
  次に対象エグゼキューター。Guard は対象のツールエグゼキューターのみを認可する;
  フックの挙動は認可もサンドボックス化もしない。全効果の境界を必要とする managed
  デプロイは、フックを無効化するか、独立して信頼・統制しなければならない。
- スラッシュコマンドのアクションはモデル/ツールのスケジューリング前に解決され、
  Tool Guard の呼び出しではない。一部の組み込みはファイルや設定を直接変更しうる。
  下記で明示的に拒否するネストエージェントのエントリを除き、本変更はスラッシュコマンドを
  分類しない; managed ホストはスラッシュコマンド入力を拒否するか、
  `slashCommands.disabled` / `--disabled-slash-commands` で承認していないコマンドを
  無効化しなければならない。
- プロバイダーの認証情報は `qwen serve` プロセス内にとどまる。ACP 子プロセス、
  チャネルワーカー、ツールサブプロセス、MCP サーバー、フック、サブエージェントの環境には
  決してコピーされない。CLI は、ランタイム環境スナップショットが凍結される前に
  アンビエントトークンをキャプチャして削除する。
- 子から親への guard リクエストは既存のプライベート ACP チャネルを使用する。ブリッジは、
  そのチャネルが所有するセッションであり、かつそのプロンプト ID がブリッジのアクティブな
  プロンプト ID と等しい場合のみ受け入れる。
- すべての ACP チャネルは initialize レスポンスで `required-v1` を ACKしなければならず、
  子プロセスがプライベートマーカーを消費しエグゼキューターコールバックをインストールした
  ことを証明する。ACK の欠落や不一致は、Session が作成される前にチャネルを拒否する。
- Managed ACP はインタラクティブなサジェスチョン speculation ランタイムを開始しない。
  埋め込みが独立して PR #8032 の speculation パスに到達する場合も、apply 前に同じ
  コールバックが必要。
- V1 は、アクティブなフォアグラウンドの managed Prompt 中に行われるトップレベルの
  ツール呼び出しのみをサポートする。`agent`、`workflow`、`create_sub_session`、
  `send_message`、直接の `/fork` エントリポイント、エージェントによるワークスペース
  メモリの remember/dream 制御は、独立した AgentCore/Session を開始、再開、委譲できる前に
  拒否される。自動/cron ターンと復元されたバックグラウンドエージェントはアクティブな
  managed Prompt コンテキストを持たないため、その guard 付きツールは fail closed
  （失敗時は拒否）となる。
- `is_background=true` のトップレベルシェル呼び出しや `monitor` 呼び出しも、1 つの
  guard 付き呼び出しのまま: プロバイダーは最終引数を見て拒否できる。Guard は起動された
  プロセスを継続的に認可したり、新しいプロセス完了監査プロトコルを追加したりしない。
  フォアグラウンド完了を必要とする managed ポリシーは、それらの引数/ツール形状を
  拒否しなければならない。
- guard 付き MCP のトランスポートエラーは曖昧な結果として扱われ、自動的に
  再接続/リプレイされない。以前の許可は 2 回目の実行試行を認可できない。
- 既存の ACP `session/update` ツールライフサイクルイベントが引き続き実行観測の
  ソースである。プロバイダーリクエストとそれらのイベントは `sessionId`、`promptId`、
  `toolCallId` で相関する。

identity の強度は意図的に明示的:

- `sessionId` はデーモン/ACP Session が生成・所有;
- `promptId` はデーモンが生成し、呼び出し元メタデータを除去した後に再バインド;
- `toolCallId` はランタイムが受け入れた相関ラベル。モデルのツール呼び出しに由来しうる
  ため、認証主体でも独立した冪等性キーでもない;
- `requestId` は `qwen serve` が 1 回のプロバイダー RPC 用に生成。プロバイダーの
  判定操作の識別子だが、既存のライフサイクルイベントは完全な
  `(sessionId, promptId, toolCallId)` タプルで相関する。

## 設定

```bash
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

ルール:

- `--external-tool-guard-mode` は `off|required` を受け付け、デフォルトは `off`。
- `required` は、origin のみのループバック HTTP(S) エンドポイントと、制御文字を含まない
  最大 8192 UTF-16 コードユニットの非空トークンを `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN`
  から要求する。
- エンドポイントの userinfo、query、fragment、非ルートパスは拒否される。
- `localhost` はクライアントにより `127.0.0.1` にピン留めされる（HTTPS では `localhost`
  の SNI）; アンビエントな DNS やプロキシ設定を通じて解決されることはない。
- タイムアウトは 100〜30000 ms の整数。デフォルトは 3000 ms。
- `mode=required` なしのエンドポイントとトークンはプロバイダーを有効化しない。
  予約トークンは引き続き消費され、ツールに露出するのではなくスクラブされる。

## ランタイムのデータフロー

```mermaid
sequenceDiagram
    participant Host as "DataAgent / operator"
    participant Serve as "qwen serve"
    participant Guard as "External Guard"
    participant ACP as "private qwen --acp"
    participant Exec as "Tool executor"

    Host->>Serve: "start with mode=required"
    Serve->>Guard: "POST /v1/handshake (Bearer token)"
    Guard-->>Serve: "version + nonce + prepare capability"
    Serve->>ACP: "spawn; private ACP capability + required marker"
    ACP-->>Serve: "initialize acknowledgement: required-v1"
    Host->>Serve: "prompt"
    Serve->>ACP: "prompt + runtime-owned sessionId/promptId"
    ACP->>ACP: "permission + PreToolUse gates"
    ACP->>Serve: "private extMethod prepare(sessionId,promptId,toolCallId,name,args)"
    Serve->>Serve: "verify owned session + active prompt"
    Serve->>Guard: "POST /v1/prepare (exactly once)"
    Guard-->>Serve: "allow or deny"
    Serve-->>ACP: "decision"
    alt "allow"
        ACP->>Exec: "execute final invocation"
        ACP-->>Serve: "existing tool_call_update terminal event"
    else "deny / unknown / timeout / cancel"
        ACP-->>Serve: "existing EXECUTION_DENIED/cancelled terminal event"
    end
```

## ワイヤー契約

すべてのボディは UTF-8 の JSON と `Content-Type: application/json` を使用。リクエストは
`Authorization: Bearer <token>` を使用。リダイレクトはたどらない。レスポンスボディは
JSON パース前に上限が適用される。シリアライズされたリクエストは 1 MiB を超えてはならず、
レスポンスは 64 KiB を超えてはならず、拒否理由は 500 UTF-16 コードユニットを超えては
ならず制御文字を含んではならない。

最終のツール引数はアプリケーションデータであり、ソースコード、パス、クエリ、ツールに
渡された認証情報を含みうる。プロバイダーはそれらを機密として扱い、トランスポートが
ループバックであるというだけの理由で無分別に永続化してはならない。

ハンドシェイクリクエスト:

```json
{
  "protocolVersion": 1,
  "nonce": "runtime-random-value",
  "client": "qwen-code"
}
```

ハンドシェイクレスポンス:

```json
{
  "protocolVersion": 1,
  "nonce": "same-runtime-random-value",
  "capabilities": { "prepare": true }
}
```

Prepare リクエスト:

```json
{
  "protocolVersion": 1,
  "requestId": "runtime-random-value",
  "sessionId": "runtime-owned-session-id",
  "promptId": "runtime-owned-prompt-id",
  "toolCallId": "runtime-accepted-tool-call-correlation-id",
  "toolName": "canonical_tool_name",
  "arguments": { "final": "tool arguments" }
}
```

許可レスポンス:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": true
}
```

拒否レスポンス:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": false,
  "reason": "Safe user-visible policy reason"
}
```

未知のフィールド、誤ったバージョン/nonce/リクエスト ID、無効なブール値、サイズ超過の
ボディ、unsafe な拒否理由はプロトコル失敗であり、したがって拒否。

## ソース実装マップ

| 関心                                                                     | 実装ポイント                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CLI フラグ、トークンキャプチャ、serve 以外ブートストラップのスクラビング                 | `packages/cli/src/commands/serve.ts`、`packages/cli/src/cli.ts`                     |
| パブリックな組み込みオプション                                                     | `packages/cli/src/serve/types.ts`                                                   |
| 設定検証、ループバック HTTP クライアント、ハンドシェイク、レスポンスパース        | `packages/cli/src/serve/external-tool-guard-provider.ts`                            |
| プロバイダー構築、起動ハンドシェイク、capability とブリッジの配線         | `packages/cli/src/serve/run-qwen-serve.ts`                                          |
| 共有のプライベート ext-method とハンドラー型                                 | `packages/acp-bridge/src/status.ts`、`bridgeOptions.ts`                             |
| 所有セッション / アクティブプロンプトの検証                                    | `packages/acp-bridge/src/bridgeClient.ts`                                           |
| ブリッジ注入                                                            | `packages/acp-bridge/src/bridge.ts`                                                 |
| プライベート required マーカーのキャプチャ、トークンスクラビング、再起動時の保持 | `packages/cli/src/gemini.tsx`                                                       |
| セッションごとの Config 注入と子プロセスのコールバック                             | `packages/cli/src/acp-integration/acpAgent.ts`、`packages/cli/src/config/config.ts` |
| 必須の子 ACK と親側の受け入れ                    | `packages/cli/src/acp-integration/acpAgent.ts`、`packages/acp-bridge/src/bridge.ts` |
| エグゼキューター境界でのランタイムコンテキスト                                        | `packages/core/src/core/tool-invocation-guard.ts` と PR #8032 の 3 つの呼び出し箇所 |
| 条件付き機能広告                                           | `packages/cli/src/serve/capabilities.ts`                                            |

## 互換性と失敗時の挙動

| デプロイ                                             | 期待される挙動                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `qwen` インタラクティブ/ヘッドレス                            | 新しい入力がなければ既存の実行挙動は不変 |
| IDE が起動した `qwen --acp`                        | プロバイダーなし; プライベートマーカーなし                               |
| 新しいフラグなしの `qwen serve`                         | プロバイダーなし、capability なし、現在のプリヒート/リトライ挙動       |
| `qwen serve`、エンドポイント/トークンあり、mode 省略/off | プロバイダー/capability なし; 予約トークンは子プロセスからスクラブされる |
| `qwen serve`、required、有効なプロバイダー                 | capability を広告; サポートされるすべてのトップレベルツールが guard される |
| `qwen serve`、required、無効な設定/ハンドシェイク       | リスナーは起動しない                                          |
| required、子プロセスがインストール済み Guard を ACK しない   | Session 作成前に ACP チャネルを拒否                  |
| required のプロバイダーがターン中に失敗                  | 呼び出しは拒否になる; エグゼキューターカウントはゼロのまま           |
| required、サポート外のネスト/非表示 AgentCore エントリ    | ネスト実行開始前にローカルで拒否                  |
| required、MCP レスポンス喪失/接続クローズ       | 初回試行は失敗; 自動再接続やリプレイなし            |

capability は `external_tool_guard` で、required モードが起動ハンドシェイクを完了した
場合のみ広告される。

## 検証計画

ユニットおよび契約テストは以下を証明しなければならない:

1. 厳密なエンドポイント/設定検証;
2. 認証ハンドシェイク、nonce/バージョン/スキーマ検証とボディ上限;
3. 許可、明示的拒否、タイムアウト、中断、接続失敗、不正形式レスポンス（リトライなし）;
4. BridgeClient がプロバイダー呼び出し前に未知セッションと stale なプロンプト identity を
   拒否すること;
5. デフォルト off はプロバイダーを作成せず capability も広告しないこと;
6. トークンが ACP 子プロセスの実効環境に決して入らないこと;
7. required マーカーは既存の再起動パスを生き残りつつ、ツールが ACP プロセス環境を
   継承できる前に削除されること;
8. required モードはすべてのライブ ACP セッションの Config にコールバックを注入すること;
9. すべての required ACP チャネルは Session 作成前にインストール済みコールバックを
   ACKしなければならないこと;
10. managed ACP はサジェスチョン speculation を開始せず、別途呼び出された
    speculation パスも apply 前にコールバックを要求すること;
11. ネスト/委譲する `agent`、`workflow`、`create_sub_session`、`send_message`、
    直接の `/fork`、エージェントによるワークスペースメモリ制御は拒否され、一方
    アクティブな Prompt コンテキストのない自動/バックグラウンドターンは fail closed
    になること;
12. guard 付き MCP 接続エラーは 1 回の呼び出しを行い、再接続/リプレイなし;
13. managed ACP のエンドツーエンドケースで、プロバイダーの
    `sessionId/promptId/toolCallId` が既存の開始/ターミナルイベントと一致し、
    許可ではエグゼキューターカウントが 1、拒否/失敗では 0 であることを証明。

フォーカスされたパッケージテスト、リポジトリのビルド/typecheck/lint、デーモン E2E スイートを
実行する。PR レポートはコマンドと正確な結果を記録する。

## 非ゴールとフォローアップ

- Unix ドメインソケットトランスポート; v1 は origin のみのループバック HTTP(S)
  エンドポイントを使用。
- プロバイダー側の判定リプレイや冪等な再送信; Qwen Code はリトライを送信しない。
- ネスト/委譲実行の系譜（`agent`、`workflow`、`create_sub_session`、`send_message`、
  `/fork`）、エージェントによるワークスペースメモリ制御、将来の試行認識 Guard プロトコル。
  V1 は、サポート外の相関を主張するのではなく、それらのネスト/非表示エージェントの
  エントリポイントを拒否する。
- Qwen Code 内の結果報告や監査ストレージ。プロバイダーと DataAgent が自身の監査
  レコードを所有; Qwen Code は安定した相関キーと既存のライフサイクルイベントを提供。
- guard 付きで起動された後のバックグラウンドシェル/monitor プロセスの継続的認可や
  新しいターミナル結果契約。プロバイダーは最終のツール名と引数からそれらの呼び出しを
  拒否できる。
- ビジネス Task API、プラン承認、grant、DataAgent 固有のポリシー。
- フック実装の認可やサンドボックス化。`PreToolUse` は PR #8032 の契約により
  本エグゼキューター Guard の前に実行される。
- スラッシュコマンドアクションの認可。それらはツールスケジューラーの前に実行される;
  全効果の境界が必要な managed ホストは、スラッシュコマンド入力を拒否するか、本機能の
  外で厳格なデプロイ拒否リストを維持しなければならない。
- 許可されたツール実装やシェルコマンドのセマンティック検査やサンドボックス化。
  プロバイダーは正規名と最終引数に対して判定する; managed デプロイはその判定を
  既存のツールポリシーと分離境界と組み合わせなければならない。
- 明示的なデーモン REST/ACP 制御操作の認可; それらは引き続きデーモンの既存認証と
  API 契約が統制する。
