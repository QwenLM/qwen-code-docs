# デーモンアーキテクチャ

## 概要

`qwen serve` プロセスは **1デーモン = 1ワークスペース** です。単一の Express HTTP サーバーをホストし、`@qwen-code/acp-bridge` インスタンスを所有し、実際のエージェントランタイムを実行する ACP 子プロセス（`qwen --acp`）を起動します。複数のクライアント（CLI TUI、IDE コンパニオン、IM チャンネルボット、Web BFF、カスタムスクリプト）が HTTP + SSE 経由で接続し、1つの ACP セッションを共有するか（`sessionScope: 'single'`、デフォルト）、会話スレッドごとにセッションを分割します（`sessionScope: 'thread'`）。

ACP 子プロセス内では、MCP サーバーが `McpTransportPool`（F2）を通じてワークスペース全体で共有されます。（サーバー名 + 設定フィンガープリント）の組み合わせが 1つの MCP トランスポートにマッピングされ、セッションが何個検出しても同じトランスポートが使われます。ブリッジの `MultiClientPermissionMediator`（F3）は、4つのポリシーのいずれかに基づいて、接続されているすべてのクライアント間でパーミッションの承認を調整します。

このドキュメントは、残りのドキュメントセットが基盤とする**システムレベルの全体像**を示します。各重要フローは Mermaid シーケンス図として示されており、コンポーネントごとの実装詳細は他の 18 のドキュメントに記載されています。

## プロセストポロジー

```mermaid
flowchart LR
    subgraph clients["Clients"]
        WUI["Web UI<br/>(packages/webui/src/daemon)"]
        TUI["CLI TUI<br/>(packages/cli/src/ui/daemon)"]
        IDE["VS Code IDE<br/>(packages/vscode-ide-companion)"]
        CH["Channel bots<br/>(DingTalk / WeChat / Telegram / Feishu)"]
        SDK["Any SDK consumer<br/>(packages/sdk-typescript/src/daemon)"]
    end

    subgraph daemon["qwen serve process (one workspace)"]
        EXP["Express app<br/>(packages/cli/src/serve/server.ts)"]
        BR["AcpBridge<br/>(packages/acp-bridge/src/bridge.ts)"]
        MED["MultiClientPermissionMediator<br/>(F3)"]
        EB["EventBus per session<br/>(eventBus.ts)"]
        FS["WorkspaceFileSystem<br/>(cli/src/serve/fs/)"]
    end

    subgraph child["ACP child process (qwen --acp)"]
        AGT["QwenAgent runtime"]
        POOL["McpTransportPool<br/>(F2, core/src/tools)"]
        BDG["WorkspaceMcpBudget"]
    end

    subgraph external["External"]
        MCP1["MCP server A<br/>(stdio)"]
        MCP2["MCP server B<br/>(websocket)"]
    end

    WUI -- "HTTP+SSE" --> EXP
    TUI -- "HTTP+SSE" --> EXP
    IDE -- "HTTP+SSE (loopback)" --> EXP
    CH -- "HTTP+SSE" --> EXP
    SDK -- "HTTP+SSE" --> EXP

    EXP --> BR
    BR --> MED
    BR --> EB
    EXP --> FS

    BR -- "ACP NDJSON over stdio" --> AGT
    AGT --> POOL
    POOL --> BDG
    POOL -- "shared transport" --> MCP1
    POOL -- "shared transport" --> MCP2
```

デーモンプロセスと ACP 子プロセスは `AcpChannel`（デフォルト: 実際のサブプロセス stdio パイプペア、テスト用は `inMemoryChannel`）で接続されています。デーモンが行うすべてのことはこの分割によって形成されます。HTTP と SSE のトラフィックはデーモンで終端し、エージェントの意思決定とツール呼び出しは子プロセスで行われ、ブリッジが両者を接続します。

## パッケージマップ

```mermaid
flowchart TB
    subgraph serve["packages/cli/src/serve"]
        RQS["run-qwen-serve.ts<br/>(bootstrap)"]
        SRV["server.ts (Express)"]
        CAP["capabilities.ts"]
        AUTH["auth.ts"]
        FSM["fs/ (sandbox)"]
        DSP["daemon-status-provider.ts"]
    end

    subgraph br["packages/acp-bridge"]
        BR2["bridge.ts"]
        BC2["bridgeClient.ts"]
        EB2["eventBus.ts"]
        MED2["permissionMediator.ts"]
        ST2["status.ts"]
        CH2["channel.ts / spawnChannel.ts"]
    end

    subgraph core["packages/core/src/tools"]
        POOL2["mcp-transport-pool.ts"]
        ENT["mcp-pool-entry.ts"]
        WBG["mcp-workspace-budget.ts"]
        SMV["session-mcp-view.ts"]
    end

    subgraph sdk["packages/sdk-typescript/src/daemon"]
        DC["DaemonClient.ts"]
        DSC["DaemonSessionClient.ts"]
        EVT["events.ts"]
        SSE["sse.ts"]
        AUTHF["DaemonAuthFlow.ts"]
        UI["ui/* (#4328 + #4353)<br/>normalizer / transcript / store / render"]
    end

    subgraph adapters["Adapters"]
        WUIP["webui/src/daemon/<br/>DaemonSessionProvider.tsx"]
        TUIA["cli/src/ui/daemon/<br/>daemon-tui-adapter.ts"]
        CHB["channels/base/<br/>DaemonChannelBridge.ts"]
        DT["channels/dingtalk"]
        WX["channels/weixin"]
        TG["channels/telegram"]
        FS["channels/feishu"]
        IDEA["vscode-ide-companion/<br/>daemonIdeConnection.ts"]
    end

    RQS --> SRV
    RQS --> CAP
    RQS --> AUTH
    RQS --> FSM
    RQS --> BR2

    BR2 --> BC2
    BR2 --> EB2
    BR2 --> MED2
    BR2 --> CH2

    BR2 -.spawns.-> core
    POOL2 --> ENT
    POOL2 --> WBG
    POOL2 --> SMV

    WUIP --> DSC
    WUIP --> UI
    TUIA --> DSC
    CHB --> DSC
    DT --> CHB
    WX --> CHB
    TG --> CHB
    IDEA --> DSC

    DSC --> DC
    DC --> EVT
    DC --> SSE
    DC --> AUTHF
```

信頼境界は 3つあります。HTTP エッジ（`serve/auth.ts` ミドルウェアチェーン）、ブリッジから ACP 子プロセスへの境界（stdio 上の NDJSON、認証なし。子プロセスはブリッジを暗黙的に信頼）、エージェントから MCP サーバーへの境界（エージェントがホストに触れるツールを呼び出す可能性あり）。

## ワークフロー 1: HTTP リクエストのライフサイクル

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (SDK)
    participant MW as Middleware<br/>(CORS→host→log→bearer→rate-limit→JSON→telemetry→mutationGate)
    participant R as Route handler
    participant BR as AcpBridge
    participant BC as BridgeClient
    participant CH as ACP child

    C->>MW: POST /session/:id/prompt<br/>Authorization: Bearer …<br/>X-Qwen-Client-Id: …
    MW->>MW: denyBrowserOriginCors
    MW->>MW: hostAllowlist (DNS rebinding guard)
    MW->>MW: access-log hook
    MW->>MW: bearerAuth (constant-time compare)
    MW->>MW: rateLimit (when enabled)
    MW->>MW: express.json body parser
    MW->>MW: daemonTelemetryMiddleware
    MW->>MW: mutationGate (strict on mutating routes)
    MW->>R: req validated
    R->>BR: bridge.sendPrompt(sessionId, body, clientId)
    BR->>BC: client.sendPrompt(sessionId, …)
    BC->>CH: ACP JSON-RPC over stdin
    CH-->>BC: ACP response / notifications
    BC-->>BR: result
    BR-->>R: result
    R-->>C: 200 JSON
```

非ストリーミングルート（プロンプト、キャンセル、モデル切り替え、メタデータ、ワークスペース CRUD）は単一の JSON レスポンスとして終了します。ストリーミング出力はこの接続のチャンク HTTP ボディとしてではなく、SSE チャンネル上でアウトオブバンドで配信されます。ワークフロー 2 を参照してください。

## ワークフロー 2: SSE イベント配信とリプレイ

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant SR as GET /session/:id/events
    participant EB as EventBus<br/>(per session)
    participant BC as BridgeClient
    participant CH as ACP child

    C->>SR: GET …/events<br/>Last-Event-ID: 42 (optional)
    SR->>EB: subscribe(lastSeenId=42, maxQueued=N)
    EB-->>SR: replay frames 43..currentTail<br/>(from ring buffer)
    SR-->>C: NDJSON: id=43, type=session_update, …
    CH-->>BC: ACP notification (e.g. agent_message_chunk)
    BC->>EB: publish({type, data})
    EB-->>SR: enqueue id=N
    SR-->>C: id=N, type=…, data=…
    Note over EB,SR: If subscriber queue >= maxQueued,<br/>EventBus emits client_evicted terminal frame<br/>and closes subscriber.
```

リングバッファには上限があります（`eventRingSize`、デフォルト 8000）。`Last-Event-ID` がリングの先頭より古い再接続クライアントは、合成されたキャッチアップシグナルを受け取り、より深い状態を再構築するために `loadSession` / `resumeSession` を呼び出す必要があります。処理の遅いクライアントはキュー 75% 時に `slow_client_warning` を、上限到達時に `client_evicted` をトリガーします。

## ワークフロー 3: マルチクライアントパーミッション調整

```mermaid
sequenceDiagram
    autonumber
    participant CH as ACP child (agent)
    participant BC as BridgeClient.requestPermission
    participant MED as Mediator (policy)
    participant EB as EventBus
    participant C1 as Client A<br/>(originator)
    participant C2 as Client B

    CH->>BC: ACP requestPermission(requestId, options)
    BC->>MED: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    MED->>EB: publish permission_request<br/>(broadcast to subscribers)
    EB-->>C1: SSE permission_request
    EB-->>C2: SSE permission_request

    alt first-responder
        C2->>MED: POST /permission/:requestId optionId=allow
        MED-->>BC: resolved
        BC-->>CH: ACP response
        MED->>EB: permission_resolved
        C1->>MED: POST /permission/:requestId (late vote)
        MED-->>C1: 409 permission_already_resolved
    else designated
        C2->>MED: vote (clientId != originatorClientId)
        MED-->>C2: 403 permission_forbidden
        C1->>MED: vote (matches originator)
        MED-->>BC: resolved
    else consensus (N-of-M)
        C1->>MED: vote
        MED->>EB: permission_partial_vote (1/N)
        C2->>MED: vote
        MED->>EB: permission_partial_vote (2/N)
        Note over MED: when tally reaches quorum on one option, resolve
    else local-only
        C2->>MED: vote (remote)
        MED-->>C2: 403 permission_forbidden (remote_not_allowed)
        Note over MED,CH: blocks until a loopback voter resolves it
    end
```

クロスポリシーのエスケープハッチ: どのクライアントも `CANCEL_VOTE_SENTINEL` に投票することで、リクエストを `cancelled / agent_cancelled` として短絡させることができます。ブリッジは、通常の `optionId` フィールド経由でワイヤー呼び出し元がセンチネルを密輸するのを防ぎます（`InvalidPermissionOptionError`）。

## ワークフロー 4: MCP トランスポートプールの acquire / release / restart

```mermaid
sequenceDiagram
    autonumber
    participant S as Session in ACP child
    participant P as McpTransportPool
    participant SIF as spawnInFlight (dedup)
    participant E as PoolEntry
    participant BDG as WorkspaceMcpBudget
    participant SRV as MCP server

    S->>P: acquire(name, cfg, sessionId)
    P->>SIF: check inflight for (name+fingerprint)
    alt cached inflight
        SIF-->>P: existing promise
    else cold start
        P->>BDG: tryReserve(name)
        BDG-->>P: ok / refused
        alt refused
            P-->>S: BudgetExhaustedError
        else ok
            P->>E: new PoolEntry(...)
            E->>SRV: connect transport
            SRV-->>E: ready
            E-->>P: connected
        end
    end
    P->>P: sessionToEntries.add(sessionId, id)
    P-->>S: PooledConnection

    Note over S,P: Session uses entry, then…

    S->>P: release(id, sessionId)
    P->>E: detach session
    E->>E: arm drain timer (default 30s)
    Note over E: refs==0 → drain timer fires → close transport<br/>(MAX_IDLE_MS 5min hard cap survives attach/detach churn)

    Note over S,P: Operator restart flow…
    S->>P: restartByName(name, opts?)
    P->>E: drain + close
    P->>E: spawn replacement
    E->>SRV: reconnect
    P->>EB: publish mcp_server_restarted<br/>with stable entryIndex
    P-->>S: single result or {entries: RestartResult[]}
```

`releaseSession(sessionId)` は逆引き `sessionToEntries` インデックスを使って、セッションが保持するすべてのエントリを O(refs) でリリースします。デーモンのシャットダウン時、`drainAll()` は `draining` フラグを設定し（新規 acquire を拒否）、設定可能なタイムアウト以内にすべてのエントリがクローズするのを待ちます。

## ワークフロー 5: ライフサイクル — 起動とグレースフルシャットダウン

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operator (signal)
    participant RQS as runQwenServe
    participant APP as Express app
    participant BR as AcpBridge
    participant CH as ACP child

    Op->>RQS: qwen serve --workspace … --token …
    RQS->>RQS: validate flags + canonicalize workspace
    RQS->>RQS: allocate PermissionAuditRing
    RQS->>BR: createHttpAcpBridge(options)
    RQS->>APP: createServeApp(bridge, …)
    RQS->>APP: listen(host, port)
    RQS->>RQS: arm SIGINT / SIGTERM handlers

    Op->>RQS: SIGTERM
    RQS->>BR: dispose device-flow registry
    RQS->>BR: bridge.shutdown()
    BR->>CH: send graceful close (10s deadline)
    CH-->>BR: exit
    RQS->>APP: server.close() (5s force-close timer)
    APP->>APP: closeAllConnections() (+2s secondary)
    Note over Op,RQS: Second SIGTERM during shutdown →<br/>bridge.killAllSync() + process.exit(1) (orphan prevention)
```

2フェーズシャットダウンが重要な理由は、処理中の HTTP リクエスト、処理中の SSE サブスクライバー、ACP 子プロセスの処理中のツール呼び出しが、すべて有限のティアダウンウィンドウを必要とするためです。タイムアウトを超えてブロックが発生した場合、強制クローズパスが引き継ぎ、スタックした子プロセスがデーモンプロセスを生かし続けることを防ぎます。

## 重要ファイル

| 関心事              | ファイル                                                        |
| -------------------- | ----------------------------------------------------------- |
| ブートストラップ            | `packages/cli/src/serve/run-qwen-serve.ts`                    |
| Express アプリ          | `packages/cli/src/serve/server.ts`                          |
| ケイパビリティレジストリ  | `packages/cli/src/serve/capabilities.ts`                    |
| 認証ミドルウェア      | `packages/cli/src/serve/auth.ts`                            |
| ブリッジ               | `packages/acp-bridge/src/bridge.ts`                         |
| BridgeClient         | `packages/acp-bridge/src/bridgeClient.ts`                   |
| パーミッションメディエーター  | `packages/acp-bridge/src/permissionMediator.ts`             |
| EventBus             | `packages/acp-bridge/src/eventBus.ts`                       |
| MCP トランスポートプール   | `packages/core/src/tools/mcp-transport-pool.ts`             |
| ワークスペース MCP バジェット | `packages/core/src/tools/mcp-workspace-budget.ts`           |
| ワークスペース FS         | `packages/cli/src/serve/fs/`                                |
| SDK DaemonClient     | `packages/sdk-typescript/src/daemon/DaemonClient.ts`        |
| SDK SessionClient    | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` |
| イベントスキーマ         | `packages/sdk-typescript/src/daemon/events.ts`              |

## 参照

- デザイン issue: [#3803](https://github.com/QwenLM/qwen-code/issues/3803)（デーモン設計）、[#4175](https://github.com/QwenLM/qwen-code/issues/4175)（F シリーズマイルストーン）。
- ユーザーガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)。
- ワイヤープロトコルリファレンス: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)。
- F2 設計ドキュメント: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)。
- F2 設計ノート: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) コミット 4-6。
