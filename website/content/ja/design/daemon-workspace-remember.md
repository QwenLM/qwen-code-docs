# Daemon Workspace Remember — セッションレスメモリインジェスト

> **ステータス**: 提案済み — [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884)（ブランチ `codex/sessionless-daemon-remember`）で実装中、まだマージされていません。

---

## 1. 課題

デーモンの管理メモリシステム（自動抽出、dream agent）は、以前メモリを書き込むためにアクティブなチャットセッションを必要としていました。これにより、以下の2つの問題が生じていました。

1. **設定UIからメモリを書き込めない** — web-shellの設定パネルは、表示されるチャットセッションを作成したり汚染したりせずに、ユーザーが提供したファクト（例：「常にTypeScript strict modeを使用する」）を保存する必要があります。
2. **セッションリストの汚染** — `/remember` コマンドを実行するためだけに使い捨てのセッションを作成すると、セッションリストにノイズが追加され、開いたことのないゴーストセッションが表示されてユーザーが混乱します。

解決策は、メモリ書き込みタスクをキューイングし、隠し `AgentHeadless` フォーク（セッションは作成されない）経由で実行し、ポーリングでステータスを公開する**セッションレスのワークスペースレベル remember エンドポイント**です。

---

## 2. 設計の概要

```
┌──────────────┐  POST /workspace/memory/remember   ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/remember/:id │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemoryRemember()
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     remember')          │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → runManagedRemember-  │
                                                     │    ByAgent (forked)     │
                                                     └─────────────────────────┘
```

主な特性:

- **セッション不要** — ブリッジはACP子プロセスが生成されることを保証しますが、ACPセッションの作成/ロード/再開は行いません。
- **直列実行** — タスクはpromise-chainレーンを通じて1つずつ実行され、管理メモリファイルシステムへの同時書き込みを防ぎます。
- **非表示** — フォークされたエージェントは `name: 'managed-auto-memory-remember'` で実行され、セッションリストには表示されません。
- **ケイパビリティの公開** — デーモンの `/capabilities` レスポンスに `workspace_memory_remember` が含まれ、サポートされる `modes: ['workspace', 'clean']` が提示されます。

---

## 3. APIエンドポイント

### 3.1 POST /workspace/memory/remember

新しいrememberタスクをキューに追加します。

**リクエスト:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `content` | `string` | yes | 記憶するファクト。最大64 KiB（UTF-8バイト長）。 |
| `contextMode` | `string` | no | `"workspace"`（デフォルト）— エージェントはワークスペースメモリのコンテキストを参照します。`"clean"` — エージェントは以前のユーザーメモリを参照しません。 |

**ヘッダー:**

- Authorization: Bearer <token>（必須）
- X-Qwen-Client-Id: <clientId>（オプション — タスクの可視性をスコープ制限）

**レスポンス 202 Accepted:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**エラーレスポンス:**

| ステータス | コード | 条件 |
| --- | --- | --- |
| 400 | `invalid_content` | コンテンツがない、空、またはサイズ超過 |
| 400 | `invalid_context_mode` | 認識されないcontextModeの値 |
| 400 | `invalid_client_id` | X-Qwen-Client-Idがブリッジに登録されていない |
| 409 | `managed_memory_unavailable` | ワークスペース用に管理メモリが設定されていない |
| 429 | `remember_queue_full` | 16件の保留タスクがすでにキューイングされている |
| 500 | `remember_failed` | 可用性チェックが予期せず例外をスローした |

### 3.2 GET /workspace/memory/remember/:taskId

タスクのステータスをポーリングします。

**ヘッダー:**

- Authorization: Bearer <token>（必須）
- X-Qwen-Client-Id: <clientId>（オプション — タスクを参照するには作成者と一致する必要がある）

**レスポンス 200 OK（queued/running）:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "result": null,
  "error": null
}
```

- `status` は、タスクが実行を開始したかどうかによって `"queued"` または `"running"` になります。
- `result`: `status === "completed"` の場合にのみ存在します（null以外）。
- `error`: `status === "failed"` の場合にのみ存在します（null以外）。

**レスポンス 200 OK（completed）:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "completed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:05.000Z",
  "result": {
    "summary": "Saved dark-mode preference to user memory.",
    "filesTouched": ["~/.qwen/memories/user/user.md"],
    "touchedScopes": ["user"]
  }
}
```

**レスポンス 200 OK（failed）:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "failed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:03.000Z",
  "error": {
    "code": "remember_path_escape",
    "message": "Remember agent touched a path outside managed memory."
  }
}
```

**エラーレスポンス:**

| ステータス | コード | 条件 |
| --- | --- | --- |
| 400 | `invalid_client_id` | X-Qwen-Client-Idが登録されていない |
| 404 | `remember_task_not_found` | タスクが存在しない、または別のクライアントに属している |

---

## 4. タスクのライフサイクル

```
            enqueue()
               │
               ▼
  ┌─────────────────────┐
  │       queued         │   (awaiting serial lane slot)
  └──────────┬──────────┘
             │  lane picks up
             ▼
  ┌─────────────────────┐
  │       running        │   (bridge.runWorkspaceMemoryRemember in progress)
  └──────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐    ┌──────────┐
│ completed│    │  failed  │
└──────────┘    └──────────┘
```

- **queued** — タスクが作成され、直列レーンで待機しています。
- **running** — ブリッジの呼び出しが進行中で、フォークされたエージェントが実行中です。
- **completed** — エージェントが正常に完了し、`result` が設定されます。
- **failed** — エージェントが例外をスローするかタイムアウトし、`error` が設定されます。

レーンには合計最大**1000タスク**まで保存されます（上限に達すると、終了済みタスクがFIFOで削除されます）。同時に保留中（queued + running）のタスクは最大**16タスク**までです。

---

## 5. 実装の詳細

### 5.1 Serial Task Lane (WorkspaceRememberTaskLane)

`packages/cli/src/serve/workspace-remember.ts` に配置されています。`Map<taskId, TaskRecord>` と単一のpromiseチェーン（`this.tail`）を維持します。各 `enqueue()` は、以下の処理を行う `run` 関数を追加します。

1. ステータスを `running` に設定します。
2. `bridge.runWorkspaceMemoryRemember({ content, contextMode })` を呼び出します。
3. 成功時: ステータスを `completed` に設定し、`result` を設定して、`memory_changed` イベントを公開します。
4. 失敗時: ステータスを `failed` に設定し、安定した公開エラーコードで `error` を設定します。

このレーンは厳密な直列化を保証します。一度に1つのrememberタスクのみが実行されるため、管理メモリへの同時ファイルシステム書き込みが防止されます。

### 5.2 Bridge Layer (HttpAcpBridge)

`BridgeInterface`（`packages/acp-bridge/src/bridgeTypes.ts`）に2つのメソッドが追加されました。

- `isWorkspaceMemoryRememberAvailable()` — 子プロセスで `qwen/control/workspace/memory/remember/availability` ext-methodを呼び出します。`boolean` を返します。キューイング前の高速な409失敗（fast-fail）に使用されます。
- `runWorkspaceMemoryRemember(request)` — `qwen/control/workspace/memory/remember` ext-methodを呼び出します。**300秒**（`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`）でタイムアウトします。セッションの作成やロードは行いません。

どちらのメソッドも `ensureChannel()` を呼び出し（必要に応じてACP子プロセスを生成）、その後アクティブなセッションがない場合はアイドルタイマーを再起動します。

### 5.3 ACP Child Execution (QwenAgent.extMethod)

`packages/cli/src/acp-integration/acpAgent.ts` 内の `workspaceMemoryRemember` のハンドラは以下の処理を行います。

1. `content`（空でない文字列、64 KiB以下）と `contextMode` を検証します。
2. `config.isManagedMemoryAvailable()` をチェックします。
3. **295秒**のabortシグナル（`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — ブリッジのタイムアウトよりわずかに短く、ブリッジのバックストップの前に子プロセスがabortすることを保証するため）を指定して `runManagedRememberByAgent()` を呼び出します。

### 5.4 Core Remember Logic (packages/core/src/memory/remember.ts)

`runManagedRememberByAgent()`:

1. プロジェクトの管理メモリインデックスからクリーンなメモリシステムプロンプトを構築します。
2. 必要に応じて以前のユーザーメモリを削除します（`contextMode === 'clean'` の場合）。
3. ファイルI/Oをメモリディレクトリのみに制限する `memoryScopedAgentConfig` を作成します。
4. 以下の設定でフォークされたヘッドレスエージェント（`runForkedAgent`）を実行します。
   - 名前: `managed-auto-memory-remember`
   - ツール: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - 最大ターン数: 6
   - 最大時間: 5分
5. 操作されたすべてのファイルが許可されたメモリパス内にあることを検証します（`classifyTouchedScopes`）。エージェントがメモリディレクトリ外に書き込んだ場合は `remember_path_escape` をスローします。
6. 操作されたスコープのメモリインデックスを再構築します。
7. `{ summary, filesTouched, touchedScopes }` を返します。

### 5.5 Memory-Scoped Agent Config (packages/core/src/memory/memory-scoped-agent-config.ts)

`createMemoryScopedAgentConfig()` は、権限が制限された `Config` ラッパーを作成します。このラッパーは以下の動作をします。

- **書き込みツール**（`write_file`, `edit`）: プロジェクトの自動メモリルートまたはユーザーメモリルート（`~/.qwen/memories`）内でのみ許可されます。
- **読み取りツール**（`read_file`, `grep`, `ls`）: `restrictReadsToMemoryPaths` がtrueの場合、メモリディレクトリ内でのみ許可されます。
- **シェル**: デフォルトで無効。有効な場合、読み取り専用コマンドのみが許可されます。
- パストラバーサルエスケープを防ぐためにシンボリックリンクを解決します。

---

## 6. イベント

### memory_changed (scope: managed)

rememberタスクが正常に完了すると、デーモンのSSEイベントストリーム（`GET /session/:id/events`）上で `scope: 'managed'` を持つ `memory_changed` イベントとして公開されます。セッションごとのイベントストリームを購読しているクライアントはこの通知を受信します。

**ペイロード:**

```json
{
  "type": "memory_changed",
  "data": {
    "scope": "managed",
    "source": "workspace_memory_remember",
    "taskId": "remember-a1b2c3d4-...",
    "touchedScopes": ["user", "project"]
  }
}
```

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `scope` | `"managed"` | ファイルベースの `memory_changed` イベントと区別するための値 |
| `source` | `string` | この機能では常に `"workspace_memory_remember"` |
| `taskId` | `string` | POSTで返されたタスクと関連付けられます |
| `touchedScopes` | `string[]` | 書き込まれたメモリスコープ: `"user"`, `"project"` |

`originatorClientId`（POST時に指定された場合）はイベントエンベロープに添付され、イベントバスが元のクライアントにルーティングできるようにします。

---

## 7. エラーハンドリング

### エラーコード

| コード | 発生元 | 意味 |
| --- | --- | --- |
| `invalid_content` | HTTPルート | コンテンツがない、空、または64 KiBを超えている |
| `invalid_context_mode` | HTTPルート | contextModeが `"workspace"` または `"clean"` ではない |
| `invalid_client_id` | HTTPルート | Client-Idヘッダーがブリッジの既知のセットにない |
| `managed_memory_unavailable` | ブリッジ / ACP子プロセス | ワークスペース用に管理メモリが設定されていない |
| `remember_queue_full` | タスクレーン | 保留タスクの上限16件に達した |
| `remember_path_escape` | コアrememberロジック | エージェントが管理メモリディレクトリ外のパスに書き込んだ |
| `remember_failed` | キャッチオール | 未分類のエージェントの失敗、タイムアウト、または内部エラー |
| `remember_task_not_found` | HTTPルート | 不明または許可されていないタスクIDに対するGET |

### タイムアウトチェーン

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

子プロセスはブリッジがタイムアウトする前にabortするため、トランスポートレベルのタイムアウトではなく、クリーンなエラーが伝播することが保証されます。

---

## 8. SDK統合

### TypeScript SDK (@qwen-code/sdk-typescript)

`DaemonClient` に2つの新しいメソッドが追加されました。

```typescript
// Queue a remember task
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Poll until terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'
```

### UIイベントの正規化

SDKの正規化機能は、生の `memory_changed` SSEイベント（`scope: 'managed'`）を `DaemonUiWorkspaceMemoryChangedEvent` にマッピングします。

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

これは既存の `workspace.memory.changed` イベントタイプを拡張するもので、以前はファイルベースのQWEN.md書き込みに対して `scope: 'workspace' | 'global'` のみを含んでいました。

---

## 9. 設計の根拠

### なぜセッションレスなのか？

CLIの `/remember` スラッシュコマンドはすでにセッション内で機能します。しかし、設定UIやプログラムによるSDK呼び出し元が、ファクトを永続化するためだけにセッションを作成する必要はありません。セッションは会話履歴、ターンの追跡、セッションリストでの可視性を意味しますが、これらはどれも使い捨てのメモリ書き込みには適用されません。

### なぜ直列実行なのか？

管理メモリシステムは、インデックス付きのマークダウンファイルにファクトを保存します。複数のrememberタスクからの同時書き込みは、インデックスを破損させたり、マージ競合を引き起こしたりする可能性があります。シングルスレッドのレーンは、最もシンプルで正しい解決策です。

### なぜタスクキューなのか（同期ではないのか）？

メモリの書き込みには、LLMエージェントがファクトをどこにどのように保存するかを決定する処理（ユーザースコープとプロジェクトスコープの選択、適切なファイルの選択、フォーマット設定など）が含まれます。これには2〜30秒かかります。同期HTTPリクエストではタイムアウトするか、クライアントがブロックされます。非同期キュー+ポーリングのパターンは、HTTPコントラクトをシンプルに保ち、クライアントが進捗UIを表示できるようにします。

### なぜcontextModeなのか？

- `"workspace"`（デフォルト）— rememberエージェントは既存のメモリをコンテキストとして参照するため、既存のエントリの重複排除や更新が可能になります。
- `"clean"` — エージェントは以前のユーザーメモリを参照しません。重複排除ロジックなしで新しい書き込みを強制したい場合（例：一括インポート）に便利です。

### なぜ読み取りをメモリパスに制限するのか？

rememberエージェントは、管理メモリディレクトリ内でのみ読み書きを行うべきです。これにより、細工された `content` によってエージェントが騙され、機密性の高いプロジェクトファイルを読み取ってメモリエンティティに漏洩させるプロンプトインジェクションのシナリオを防ぎます。