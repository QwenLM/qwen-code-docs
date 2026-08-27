# ケイパビリティとプロトコルバージョニング

## 概要

`GET /capabilities` はデーモンのプリフライトエンドポイントです。すべての SDK クライアントは、他のルートを呼び出す前にこれを読み取り、デーモンが使用するプロトコルバージョン、有効になっている機能タグ、およびデーモンが受け付けるワークスペースランタイムを把握する必要があります。契約（コントラクト）は以下の通りです。

- **プロトコルバージョンは `v1` のみです。** `SERVE_PROTOCOL_VERSION = 'v1'` であり、`SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']` です。v1 は内部的に追加のみ可能です。フレーム形状を破壊するような変更は v2 用に予約されています。
- **各タグには `since` バージョンがあります。** 将来の v2 デーモンは、v1 と v2 の両方のタグをアドバタイズできます。
- **一部のタグは条件付きです。** `CONDITIONAL_SERVE_FEATURES` に記載されたタグは、対応するデプロイトグルが有効な場合にのみアドバタイズされます。タグの存在は、その動作（ビヘイビア）が存在することを意味します。
- **ケイパビリティタグ = 動作のコントラクト。** 既存のタグの下に新しい動作を追加すると、古いタグをプリフライトしたクライアントが暗黙的に破壊される可能性があります。新しい動作には新しいタグが必要です。

完全なレジストリは `packages/cli/src/serve/capabilities.ts` にあります。

## 責務

- デーモンがアドバタイズする可能性のあるすべての機能を宣言する。
- アドバタイズされた機能をプロトコルバージョンとデプロイトグルでフィルタリングする。
- `getRegisteredServeFeatures()`（すべてのキー、未フィルタ）、`getAdvertisedServeFeatures(version, toggles)`（フィルタ済み）、および `getServeProtocolVersions()`（エンベロープ `{ current, supported }`）を公開する。
- 「タグが存在すれば動作も存在する」という不変条件を維持する。`server.test.ts` には、すべての条件付きタグがトグルオン時にアドバタイズされることを確認するテストが含まれています。述語なしで条件付きタグを追加すると、そのテストは失敗します。

## アーキテクチャ

### ケイパビリティエンベロープ

`/capabilities` は以下を返します。

```ts
{
  v: 1,                    // CAPABILITIES_SCHEMA_VERSION
  mode: 'http-bridge',
  features: ServeFeature[],
  workspaceCwd: string,
  workspaces?: Array<{ id: string, cwd: string, primary: boolean, trusted: boolean }>,
  protocol?: { current: 'v1', supported: ['v1'] },
  policy?: { permission: PermissionPolicy },
}
```

`workspaceCwd` は正規のプライマリワークスペースパスです（[`02-serve-runtime.md`](./02-serve-runtime.md) を参照）。現在のデーモンは `workspaces[]` を登録済みランタイムカタログとして使用します。`multi_workspace_sessions` は、複数のランタイムがアクティブであることを示します。`policy.permission` はアクティブなメディエーターポリシーです。

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // lists operation modes when a feature has modes
}
```

4 つの v1 タグは `modes` を使用します。

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` - クライアントは拒否動作に依存する前に `'enforce'` をプリフライトする必要があります。
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` - これはビルド時にサポートされるセットです。アクティブなポリシーは `policy.permission` にあります。
- `workspace_voice_transcription: { since: 'v1', modes: ['batch'] }` - デーモンが提供するトランスクリプションパス。
- `voice_transcribe: { since: 'v1', modes: ['streaming', 'batch'] }` - `/voice/stream` WebSocket で利用可能な 2 つのトランスクリプションパス。

### 条件付きタグ

```ts
export const CONDITIONAL_SERVE_FEATURES: ReadonlyMap<
  ServeFeature,
  (toggles: AdvertiseFeatureToggles) => boolean
> = new Map([
  ['require_auth', (t) => t.requireAuth === true],
  ['mcp_workspace_pool', (t) => t.mcpPoolActive === true],
  ['mcp_pool_restart', (t) => t.mcpPoolActive === true],
  ['allow_origin', (t) => t.allowOriginActive === true],
  [
    'prompt_absolute_deadline',
    (t) => typeof t.promptDeadlineMs === 'number' && t.promptDeadlineMs > 0,
  ],
  [
    'writer_idle_timeout',
    (t) =>
      typeof t.writerIdleTimeoutMs === 'number' && t.writerIdleTimeoutMs > 0,
  ],
  ['workspace_settings', (t) => t.persistSettingAvailable === true],
  ['workspace_voice', (t) => t.persistSettingAvailable === true],
  [
    'workspace_voice_transcription',
    (t) => t.voiceTranscriptionAvailable === true,
  ],
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  [
    'multi_workspace_session_rewind',
    (t) => t.multiWorkspaceSessionsEnabled === true,
  ],
  [
    'multi_workspace_session_shell',
    (t) =>
      t.multiWorkspaceSessionsEnabled === true &&
      t.sessionShellCommandEnabled === true,
  ],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
  ['voice_transcribe', (t) => t.voiceWsAvailable !== false],
]);
```

この `Map` はメンバーシップと述語を一緒に格納します。新しい条件付きタグを追加するには、2 つの連携した変更が必要です。

1. `SERVE_CAPABILITY_REGISTRY` にタグとその `since` バージョンを登録します。
2. その述語を `CONDITIONAL_SERVE_FEATURES` に追加します。

ベースラインタグは `Map` に存在せず、無条件でアドバタイズされます。これは意図的に、別の Set を使用するのではなく、存在しないことで表現されています。

### v1 タグ（ドメイン別にグループ化）

基盤: `health`, `daemon_status`, `capabilities`.

セッション: `session_create`, `session_id_override`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_info`, `session_prompt`, `session_mid_turn_message_mutation`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_archive`, `session_storage_conflict_repair`, `session_export`, `session_transcript`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_monitor_tool_correlation`, `session_stats`, `session_lsp`, `session_status`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (conditional), `session_language`, `session_rewind`, `session_hooks`, `session_branch`.

ストリーミング: `slow_client_warning`, `typed_event_schema`.

ID と heartbeat: `client_identity`, `client_heartbeat`.

権限: `session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`).

ワークスペースの読み取り専用スナップショット: `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_acp_status`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`.

拡張機能管理: `extension_management_v2` は、グローバルな `/extensions/*` カタログ/ミューテーション/オペレーションの契約と、ワークスペースアクティベーションの投影を追加します。これは公開されている `workspace_extensions` 互換性サーフェスおよび `workspace_qualified_rest_core` とは別物です。

ローカル拡張機能のインストール: `extension_local_path_install` は、両方の拡張機能インストールルートの既存の `source` フィールドにおいて、デーモンホスト上の絶対パスを許可します。プライマリワークスペースの互換性ルートもこれをサポートするため、`extension_management_v2` とは分離されています。また、クライアントは古いデーモンにローカルパスを送信してはなりません。

V2 拡張機能のバッチアクティベーション: `extension_batch_activation_v2` は、`extension_management_v2` にキューイングされたグローバルデフォルトアクティベーションおよび選択ワークスペースオーバーライドのバッチを追加します。古い V2 デーモンは単一のアクティベーションルートのみを公開するため、クライアントはこれを独立してプリフライトする必要があります。

ワークスペース修飾セッション読み取り: `workspace_persisted_transcript`, `workspace_session_export`, `workspace_archived_session_export`, `workspace_session_live_state`。アクティブおよびアーカイブのエクスポートタグは互いに、また `session_export` や `workspace_qualified_rest_core` とも独立しています。そのため、クライアントはエクスポートする正確なストレージ状態をプリフライトする必要があります。永続化トランスクリプトのページングは、バウンドされた読み取りポリシーの下で信頼されないセカンダリを許可します。両方のフルエクスポートパスは信頼されたのみです。`workspace_session_live_state` も同様に `workspace_qualified_rest_core` から独立しており、信頼されたのみです。選択されたランタイムのメモリ内のライブセッションスナップショットとカタログバージョンを提供し、信頼されないセカンダリの永続化読み取りポリシーをライブブリッジ状態には拡張しません。

ワークスペースのミューテーション（Wave 4 以降）: `workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_acp_preheat`, `workspace_tool_toggle`, **`workspace_settings`** (conditional), `workspace_permissions`, `workspace_init`, `workspace_github_setup`, `workspace_trust`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_read_cursor`, `workspace_file_write`, `workspace_file_upload`, **`workspace_reload`** (conditional).

MCP ガードレール: **`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_guardrail_events`, `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (conditional), **`mcp_pool_restart`** (conditional).

プロンプト制御: **`prompt_absolute_deadline`** (conditional), **`writer_idle_timeout`** (conditional), `non_blocking_prompt`.

認証: `auth_provider_install`, `auth_device_flow`, **`require_auth`** (conditional), **`allow_origin`** (conditional).

音声: **`workspace_voice`** (conditional), **`workspace_voice_transcription`** (conditional, `modes: ['batch']`), **`voice_transcribe`** (conditional, `modes: ['streaming', 'batch']`).

レート制限: **`rate_limit`** (conditional).

マルチワークスペースセッションルーティング: **`multi_workspace_sessions`** (conditional)、
**`multi_workspace_session_rewind`** (conditional)、および
**`multi_workspace_session_shell`** (conditional)。クライアントは
`session_rewind` を使用してプライマリセッションの rewind を利用できます。セカンダリの
ライブセッションには `multi_workspace_session_rewind` も 추가로必要です。シェルは
セカンダリセッションに対して、同等の `session_shell_command` と
`multi_workspace_session_shell` のペアを使用します。ACP ネイティブのクライアントは、
initialize が返す `_qwen.methods` を引き続き使用します。ACP rewind ベンダーメソッドは
アドバタイズされません。

太字のタグは `modes` を持つか、条件付きです。

## フロー

### デーモン側: エンベロープのアセンブル

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["isFeatureAvailableInProtocol でフィルタリング"]
    C --> D["各機能について CONDITIONAL_SERVE_FEATURES をチェック"]
    D --> E["はい: predicate(toggles) ? 含める : 除外"]
    D --> F["いいえ: 無条件で含める"]
    E --> G["ServeFeature[] を返す"]
    F --> G
    G --> H["エンベロープでラップ:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### クライアント側: 機能のプリフライト

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant D as GET /capabilities
    participant R as Route

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt yes
        C->>R: プール対応のレスポンス形状に依存する<br/>(例: /workspace/mcp/:server/restart からの entries[])
    else no
        C->>R: レガシーな単一エントリのレスポンス形状
    end
```

## 状態とライフサイクル

- `CAPABILITIES_SCHEMA_VERSION` はワイヤー上のエンベロープ形状のバージョンであり、現在は `1` です。エンベロープの破壊的変更がある場合にのみインクリメントします。
- `SERVE_PROTOCOL_VERSION = 'v1'` はプロトコル機能のバージョンです。v1 内の機能追加は追加のみ可能です。古いクライアントは、新しいタグをプリフライトしない限り新しい動作を確認できません。機能の削除は v2 の破壊的変更となります。
- `EVENT_SCHEMA_VERSION = 1` は SSE フレームの `v` フィールドです（[`09-event-schema.md`](./09-event-schema.md) を参照）。これは独立したバージョン軸です。イベントスキーマのインクリメントはプロトコルバージョンのインクリメントを意味せず、その逆も同様です。
- `session_resume` は `POST /session/:id/resume` の安定したデーモンケイパビリティです。基礎となる ACP メソッドがまだ `connection.unstable_resumeSession` という名前であるため、`unstable_session_resume` は非推奨のエイリアスとしてアドバタイズされ続けています。新しいクライアントは `session_resume` を機能検出する必要があります。

## 依存関係

- `/capabilities` レスポンスの構築時に `packages/cli/src/serve/server.ts` によって読み取られます。
- トグル入力は `runQwenServe` / `createServeApp` から渡されます。認証、MCP、オリジン、プロンプト、設定、シェル、レート制限、リロード、およびライブワークスペースランタイム数の状態を含みます。
- エンベロープ内のアクティブな `permission` ポリシーは `BridgeOptions.permissionPolicy` から取得され、これは `settings.json` の `policy.permissionStrategy` を読み取ります。

## 設定

| ソース                     | 設定項目                                                          | ケイパビリティへの影響                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI フラグ                 | `--require-auth`                                                  | `require_auth` をアドバタイズします。                                                                                                                                             |
| 環境変数                   | `QWEN_SERVE_NO_MCP_POOL=1`                                        | `mcp_workspace_pool` と `mcp_pool_restart` のアドバタイズを停止します。MCP イベントは `scope: 'workspace'` をスタンプしなくなります。                                                        |
| CLI フラグ                 | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`   | タグセットは変更しません（`mcp_guardrails` は常にアドバタイズされます）が、サーバーごとのリザベーションと拒否動作を変更します。                                          |
| CLI フラグ / 環境変数      | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1`                        | `rate_limit` をアドバタイズします。                                                                                                                                               |
| 組み込みオプション         | `persistSettingAvailable`                                         | `workspace_settings` と `workspace_voice` をアドバタイズします。                                                                                                                 |
| 組み込みオプション         | `voiceTranscriptionAvailable`                                     | `workspace_voice_transcription` をアドバタイズします。                                                                                                                            |
| CLI フラグ / 組み込みオプション | `--enable-session-shell` / `sessionShellCommandEnabled`       | `session_shell_command` をアドバタイズします。                                                                                                                                    |
| ランタイム状態             | 登録されたワークスペースランタイムが 2 つ以上                      | `multi_workspace_sessions` と `multi_workspace_session_rewind` をアドバタイズします。セッションシェルが実質的に有効な場合、`multi_workspace_session_shell` もアドバタイズします。 |
| 組み込みオプション         | `reloadAvailable`                                                 | `workspace_reload` をアドバタイズします。                                                                                                                                         |
| 組み込みオプション         | `voiceWsAvailable`                                                | `voice_transcribe` をアドバタイズします。                                                                                                                                         |
| `settings.json`            | `policy.permissionStrategy`                                       | エンベロープの `policy.permission` を設定します。                                                                                                                                     |

## 注意事項と既知の制限

- **`--require-auth` はプリフライトを隠蔽します。** `--require-auth` を指定すると、`/capabilities` を含むすべてのルートで Bearer 認証が必要になります。認証されていないクライアントは `caps.features.require_auth` をプリフライトできません。401 レスポンスボディが検出の手段となります。`require_auth` タグは、ハードニングされたデプロイの監査 UI 向けの認証済み確認です。
- **タグの存在は動作の存在を意味します。** 将来のコントリビューターが `since` をインクリメントせずに既存のタグの下に動作を追加した場合、古いタグをプリフライトしたクライアントが暗黙的に新しい動作を受け取る可能性があります。慣例として、新しい動作には新しいタグを付与します。
- **`unstable_*` タグは**、プロトコルのインクリメントなしに、バージョン間で形状が変更される**可能性があります。** これらに依存する場合は、SDK のバージョンを固定してください。
- ルートカタログは [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) にあります。このページでは意図的にその複製を行っていません。

## 参照

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts` (エンベロープのアセンブル)
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- ワイヤーリファレンス: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- 認証とデプロイガードレール: [`12-auth-security.md`](./12-auth-security.md)
