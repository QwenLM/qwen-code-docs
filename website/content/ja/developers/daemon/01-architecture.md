# デーモンアーキテクチャ

## 概要

`qwen serve` プロセスは **1 デーモン = 1 ワークスペース** です。単一の Express HTTP サーバーをホストし、`@qwen-code/acp-bridge` インスタンスを所有し、実際のエージェントランタイムを実行する 1 つの ACP 子プロセス (`qwen --acp`) を生成します。複数のクライアント（CLI TUI、IDE コンパニオン、IM チャネルボット、Web BFF、カスタムスクリプト）は HTTP + SSE を介して接続し、1 つの ACP セッションを共有するか（`sessionScope: 'single'`、デフォルト）、会話スレッドごとにセッションを分割します（`sessionScope: 'thread'`）。

ACP 子プロセス内では、MCP サーバーは `McpTransportPool`（F2）によってワークスペース全体で共有されます。つまり、（サーバー名 + 設定フィンガープリント）のタプルは、それを検出するセッションの数に関係なく、1 つの MCP トランスポートにマッピングされます。ブリッジの `MultiClientPermissionMediator`（F3）は、4 つのポリシーのいずれかの下で、接続されたすべてのクライアント間の権限投票を調整します。

このドキュメントは、このドキュメントセットの残り部分が基盤とする**システムレベルの全体像**を示します。各重要なフローは Mermaid シーケンス図で示され、コンポーネントごとの実装の詳細は他の 18 のドキュメントに記載されています。

## プロセストポロジ

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

デーモンプロセスと ACP 子プロセスは `AcpChannel`（デフォルト: 実際の子プロセスの stdio パイプペア、テストでは `inMemoryChannel`）で接続されています。デーモンが行うすべてのことは、この分割によって形作られます。HTTP と SSE のトラフィックはデーモンで終端し、エージェントの決定とツール呼び出しは子プロセスで発生し、ブリッジが両者を接続します。

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

3 つの信頼境界が重要です: HTTP エッジ（`serve/auth.ts` ミドルウェアチェーン）、ブリッジから ACP 子プロセスへの境界（stdio 上の NDJSON、認証なし、子プロセスはブリッジを暗黙的に信頼）、エージェントから MCP サーバーへの境界（エージェントはホストに触れるツールを呼び出す可能性があります）。

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

非ストリーミングルート（prompt、cancel、model switch、metadata、workspace CRUD）は、単一の JSON 応答として終了します。ストリーミング出力は、この接続上のチャンク化された HTTP ボディ**ではなく**、SSE チャネル上でアウトオブバンドで配信されます。ワークフロー 2 を参照してください。

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

リングバッファは有限です（`eventRingSize`、デフォルト 8000）。`Last-Event-ID` がリングの先頭より古い再接続クライアントは、合成されたキャッチアップ信号を受け取り、`loadSession` / `resumeSession` を呼び出してより深い状態を再構築する必要があります。低速クライアントは、キューフィル率 75% で `slow_client_warning` を、上限に達すると `client_evicted` をトリガーします。

## ワークフロー 3: マルチクライアント権限調整

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

ポリシー間エスケープハッチ: どのクライアントも `CANCEL_VOTE_SENTINEL` に投票することで、リクエストを `cancelled / agent_cancelled` としてショートサーキットできます。ブリッジは、ワイヤー呼び出し元が通常の `optionId` フィールドを介してセンチネルを注入することを防ぎます（`InvalidPermissionOptionError`）。

## ワークフロー 4: MCP トランスポートプールの取得/解放/再起動

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

`releaseSession(sessionId)` は逆方向の `sessionToEntries` インデックスを使用して、セッションが保持しているすべてのエントリを O(refs) で解放します。デーモンシャットダウン時には、`drainAll()` が `draining` フラグを設定し（新しい取得を拒否）、設定可能なタイムアウト下で全てのエントリがクローズするのを待ちます。

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

二段階シャットダウンが重要なのは、インフライトの HTTP リクエスト、インフライトの SSE サブスクライバ、および ACP 子プロセス内のインフライトのツール呼び出しすべてに、制限された終了ウィンドウが必要だからです。これらのデッドラインを超えて何かがブロックされると、強制クローズパスが引き継がれ、スタックした子プロセスがデーモンプロセスを生かし続けるのを防ぎます。

## 主要ファイル

| 関心事                   | ファイル                                                       |
| ----------------------- | -------------------------------------------------------------- |
| ブートストラップ          | `packages/cli/src/serve/run-qwen-serve.ts`                      |
| Express アプリ           | `packages/cli/src/serve/server.ts`                              |
| 機能レジストリ            | `packages/cli/src/serve/capabilities.ts`                        |
| 認証ミドルウェア          | `packages/cli/src/serve/auth.ts`                                |
| ブリッジ                 | `packages/acp-bridge/src/bridge.ts`                              |
| BridgeClient            | `packages/acp-bridge/src/bridgeClient.ts`                        |
| 権限メディエーター        | `packages/acp-bridge/src/permissionMediator.ts`                  |
| EventBus                | `packages/acp-bridge/src/eventBus.ts`                            |
| MCP トランスポートプール  | `packages/core/src/tools/mcp-transport-pool.ts`                  |
| ワークスペース MCP 予算   | `packages/core/src/tools/mcp-workspace-budget.ts`                |
| ワークスペース FS        | `packages/cli/src/serve/fs/`                                    |
| SDK DaemonClient        | `packages/sdk-typescript/src/daemon/DaemonClient.ts`             |
| SDK SessionClient       | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`      |
| イベントスキーマ          | `packages/sdk-typescript/src/daemon/events.ts`                   |

## 参考文献

- 設計イシュー: [#3803](https://github.com/QwenLM/qwen-code/issues/3803)（デーモン設計）、[#4175](https://github.com/QwenLM/qwen-code/issues/4175)（F シリーズマイルストーン）
- ユーザーガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- ワイヤープロトコルリファレンス: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- F2 設計文書: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)
- F2 設計ノート: イシュー [#4175](https://github.com/QwenLM/qwen-code/issues/4175) コミット 4-6