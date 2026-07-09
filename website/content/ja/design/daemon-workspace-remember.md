# デーモンワークスペースメモリタスク — セッションレス管理メモリ

> **ステータス**: 提案済み — [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884)（ブランチ `codex/sessionless-daemon-remember`）で実装中、まだマージされていません。

---

## 1. 課題

デーモンの管理メモリシステム（自動抽出、ドリームエージェント）は、以前はメモリを書き込むためにアクティブなチャットセッションを必要としていました。これにより、以下の2つの問題が生じていました。

1. **設定UIがメモリを書き込めない** — web-shellの設定パネルは、表示されるチャットセッションを作成したり汚染したりせずに、ユーザーが提供した事実（例：「常にTypeScriptのstrictモードを使用する」）を保存する必要があります。
2. **セッションリストの汚染** — `/remember` コマンドを実行するためだけに使い捨てのセッションを作成すると、セッションリストにノイズが追加され、ユーザーが一度も開いていないゴーストセッションを見て混乱します。

解決策は、remember、forget、dreamタスクをキューに入れ、表示されるセッションを作成せずに実行し、ポーリング経由でステータスを公開する**セッションレスのワークスペースレベルメモリタスクAPI**です。

---

## 2. 設計の概要

```
┌──────────────┐  POST /workspace/memory/{task}      ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/{task}/:id  │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemory*
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     {task}')            │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → remember / forget /  │
                                                     │    dream core logic     │
                                                     └─────────────────────────┘
```

主な特性:

- **セッション不要** — ブリッジはACP子プロセスが生成されることを保証しますが、ACPセッションの作成/ロード/再開は行いません。
- **直列実行** — タスクはプロミスチェーンレーンを通じて1つずつ実行され、管理メモリファイルシステムへの同時書き込みを防ぎます。
- **非表示** — remember/dreamは非表示のエージェントを通じて実行され、forgetは非表示のメモリ設定を使用します。いずれの操作も表示されるセッションを作成しません。
- **機能の公開** — デーモンの `/capabilities` レスポンスに `workspace_memory_remember`、`workspace_memory_forget`、および `workspace_memory_dream` が含まれます。Rememberはさらに `modes: ['workspace', 'clean']` も公開します。

---

## 3. APIエンドポイント

### 3.1 `POST /workspace/memory/remember`

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
| `content` | `string` | yes | 記憶する事実。最大64 KiB（UTF-8バイト長）。 |
| `contextMode` | `string` | no | `"workspace"`（デフォルト）— エージェントはワークスペースメモリのコンテキストを参照します。`"clean"` — エージェントは以前のユーザーメモリを参照しません。 |

**ヘッダー:**

- `Authorization: Bearer <token>`（必須）
- `X-Qwen-Client-Id: <clientId>`（オプション — タスクの可視性をスコープ制限）

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
| 400 | `invalid_context_mode` | 認識できないcontextModeの値 |
| 400 | `invalid_client_id` | X-Qwen-Client-Idがブリッジに登録されていない |
| 409 | `managed_memory_unavailable` | ワークスペース用に管理メモリが設定されていない |
| 429 | `remember_queue_full` | 16件の保留タスクがすでにキューに入っている |
| 500 | `remember_failed` | 可用性チェックが予期せず例外をスローした |

### 3.2 `GET /workspace/memory/remember/:taskId`

タスクのステータスをポーリングします。

**ヘッダー:**

- `Authorization: Bearer <token>`（必須）
- `X-Qwen-Client-Id: <clientId>`（オプション — タスクを表示するには作成者と一致する必要があります）

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

### 3.3 `POST /workspace/memory/forget`

forgetタスクをキューに追加します。デーモンは一致する管理自動メモリエントリを選択し、セッションを作成せずに削除します。

**リクエスト:**

```json
{
  "query": "old preference"
}
```

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `query` | `string` | yes | 忘れるための自然言語の説明。最大64 KiB（UTF-8バイト長）。 |

初期レスポンスは `forget-...` タスクIDを含む `202 Accepted` です。終了するまで `GET /workspace/memory/forget/:taskId` をポーリングします。

**完了時の結果:**

```json
{
  "summary": "Forgot 1 memory entry.",
  "removedEntries": [
    {
      "topic": "project",
      "summary": "old preference",
      "filePath": "/path/to/memory.md"
    }
  ],
  "touchedTopics": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

forgetタスクのステータスをポーリングします。形状はrememberタスクのポーリングと一致しますが、`contextMode` フィールドがないことと、終了時の失敗では不明または不正なタスクIDに対して `forget_task_not_found` が使用される点が異なります。

### 3.5 `POST /workspace/memory/dream`

dreamタスクをキューに追加します。デーモンはセッションを作成せずに、管理自動メモリのdream圧縮フローを実行します。

**リクエスト:** 空のJSONオブジェクト、またはボディなし。

初期レスポンスは `dream-...` タスクIDを含む `202 Accepted` です。終了するまで `GET /workspace/memory/dream/:taskId` をポーリングします。

**完了時の結果:**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

dreamタスクのステータスをポーリングします。形状はrememberタスクのポーリングと一致しますが、`contextMode` フィールドがないことと、終了時の失敗では不明または不正なタスクIDに対して `dream_task_not_found` が使用される点が異なります。

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
- **running** — ブリッジ呼び出しが実行中であり、フォークされたエージェントが実行されています。
- **completed** — エージェントが正常に完了し、`result` が設定されます。
- **failed** — エージェントが例外をスローするかタイムアウトし、`error` が設定されます。

レーンには合計最大**1000タスク**まで保存されます（上限に達すると、終了済みタスクがFIFOで削除されます）。いつでも最大**16タスク**まで保留中（queued + running）にできます。Forgetとdreamタスクは、より小さい**保留タスク8件**の上限を共有するため、突発的な手動メンテナンスが自動remember処理に必要なすべてのスロットを消費することはありません。

---

## 5. 実装の詳細

### 5.1 直列タスクレーン（`WorkspaceRememberTaskLane`）

`packages/cli/src/serve/workspace-remember.ts` に配置されています。`Map<taskId, TaskRecord>` と単一のプロミスチェーン（`this.tail`）を維持します。各 `enqueue()` は、以下の処理を行う `run` 関数を追加します。

1. ステータスを `running` に設定します。
2. 一致するブリッジメソッド（`runWorkspaceMemoryRemember`、`runWorkspaceMemoryForget`、または `runWorkspaceMemoryDream`）を呼び出します。
3. 成功時: ステータスを `completed` に設定し、`result` を設定します。タスクが実際に管理メモリに触れた場合、`memory_changed` イベントを公開します。
4. 失敗時: ステータスを `failed` に設定し、`error` に安定した公開エラーコードを設定します。

レーンは厳密な直列化を保証します。ワークスペースメモリタスクは一度に1つだけ実行されるため、管理メモリへの同時ファイルシステム書き込みを防ぎます。

### 5.2 ブリッジ層（`HttpAcpBridge`）

`BridgeInterface`（`packages/acp-bridge/src/bridgeTypes.ts`）に追加されたワークスペースメモリメソッド:

- `isWorkspaceMemoryRememberAvailable()` — 子プロセスの `qwen/control/workspace/memory/remember/availability` 拡張メソッドを呼び出します。`boolean` を返します。キューイング前の高速失敗（409）に使用されます。
- `runWorkspaceMemoryRemember(request)` — `qwen/control/workspace/memory/remember` 拡張メソッドを呼び出します。**300秒**（`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`）でタイムアウトします。セッションの作成またはロードは行いません。
- `runWorkspaceMemoryForget(request)` — `qwen/control/workspace/memory/forget` 拡張メソッドを呼び出し、同じブリッジタイムアウトを使用します。セッションの作成またはロードは行いません。
- `runWorkspaceMemoryDream()` — `qwen/control/workspace/memory/dream` 拡張メソッドを呼び出し、同じブリッジタイムアウトを使用します。セッションの作成またはロードは行いません。

どちらのメソッドも `ensureChannel()` を呼び出し（必要に応じてACP子プロセスを生成）、その後アクティブなセッションがない場合はアイドルタイマーを再起動します。
### 5.3 ACP 子プロセスの実行 (`QwenAgent.extMethod`)

`packages/cli/src/acp-integration/acpAgent.ts` における `workspaceMemoryRemember`、`workspaceMemoryForget`、および `workspaceMemoryDream` のハンドラーは以下の処理を行います：

1. タスク固有の入力（remember の場合は `content`/`contextMode`、forget の場合は `query`）を検証します。
2. `config.isManagedMemoryAvailable()` をチェックします。
3. **295秒** のアボートシグナル（`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — ブリッジのタイムアウトよりわずかに短く設定し、ブリッジのバックストップより前に子プロセスがアボートされるようにします）を伴って、対応するコア操作を呼び出します。forget の場合、このシグナルは `MemoryManager.forget`、選択処理、モデル側のクエリ、および適用時のファイルシステム変更を通じて伝播されます。

### 5.4 コアの Remember ロジック (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. プロジェクトの管理対象メモリインデックスから、クリーンなメモリシステムプロンプトを構築します。
2. 必要に応じて、以前のユーザーメモリを削除します（`contextMode === 'clean'` の場合）。
3. ファイル I/O をメモリディレクトリのみに制限する `memoryScopedAgentConfig` を作成します。
4. 以下の設定で **フォークされたヘッドレスエージェント**（`runForkedAgent`）を実行します：
   - 名前: `managed-auto-memory-remember`
   - ツール: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - 最大ターン数: 6
   - 最大時間: 5分
5. 操作されたすべてのファイルが許可されたメモリパス内にあることを検証します（`classifyTouchedScopes`）。エージェントがメモリディレクトリ外に書き込んだ場合、`remember_path_escape` をスローします。
6. 操作されたスコープのメモリインデックスを再構築します。
7. `{ summary, filesTouched, touchedScopes }` を返します。

### 5.5 メモリスコープ限定エージェント設定 (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` は、以下の権限制限を持つ `Config` ラッパーを作成します：

- **書き込みツール**（`write_file`, `edit`）: プロジェクトの自動メモリルートまたはユーザーメモリルート（`~/.qwen/memories`）内でのみ許可されます。
- **読み取りツール**（`read_file`, `grep`, `ls`）: `restrictReadsToMemoryPaths` が true の場合、メモリディレクトリ内でのみ許可されます。
- **シェル**: デフォルトで無効。有効な場合、読み取り専用コマンドのみが許可されます。
- パストラバーサルによるエスケープを防ぐため、シンボリックリンクを解決します。

---

## 6. イベント

### `memory_changed` (scope: `managed`)

ワークスペースメモリタスクが正常に完了し、実際に管理対象メモリを操作した場合、デーモンの SSE イベントストリーム（`GET /session/:id/events`）上で `scope: 'managed'` を持つ `memory_changed` イベントとして発行されます。セッションごとのイベントストリームを購読しているクライアントは、この通知を受け取ります。

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
| `scope` | `"managed"` | ファイルベースの `memory_changed` イベントと区別するための識別子 |
| `source` | `string` | `"workspace_memory_remember"`、`"workspace_memory_forget"`、または `"workspace_memory_dream"` |
| `taskId` | `string` | POST で返されたタスクと関連付けられます |
| `touchedScopes` | `string[]` | 書き込まれたメモリスコープ: `"user"`、`"project"` |

`originatorClientId`（POST 時に指定された場合）はイベントエンベロープに添付され、イベントバスがそれを元のクライアントにルーティングできるようにします。

---

## 7. エラーハンドリング

### エラーコード

| コード | 発生元 | 意味 |
| --- | --- | --- |
| `invalid_content` | HTTP ルート | コンテンツが欠落している、空である、または 64 KiB を超えている |
| `invalid_context_mode` | HTTP ルート | contextMode が `"workspace"` または `"clean"` ではない |
| `invalid_query` | HTTP ルート | forget のクエリが欠落している、空である、または 64 KiB を超えている |
| `invalid_client_id` | HTTP ルート | Client-Id ヘッダーがブリッジの既知のセットにない |
| `managed_memory_unavailable` | ブリッジ / ACP 子プロセス | ワークスペースが管理対象メモリ用に構成されていない |
| `remember_queue_full` | タスクレーン | 16 件の保留中タスクの上限に達した |
| `remember_path_escape` | コア remember ロジック | エージェントが管理対象メモリディレクトリ外のパスに書き込んだ |
| `remember_failed` | 包括的エラー | 未分類のエージェントの失敗、タイムアウト、または内部エラー |
| `remember_task_not_found` | HTTP ルート | 不明または許可されていないタスク ID の GET |
| `forget_task_not_found` | HTTP ルート | 不明または許可されていない forget タスク ID の GET |
| `dream_task_not_found` | HTTP ルート | 不明または許可されていない dream タスク ID の GET |

### タイムアウトチェーン

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

子プロセスはブリッジがタイムアウトする前にアボートされるため、トランスポートレベルのタイムアウトではなく、クリーンなエラーが伝播することが保証されます。

---

## 8. SDK 統合

### TypeScript SDK (`@qwen-code/sdk-typescript`)

`DaemonClient` のワークスペースメモリメソッド:

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

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### UI イベントの正規化

SDK ノーマライザーは、生の `memory_changed` SSE イベント（`scope: 'managed'`）を `DaemonUiWorkspaceMemoryChangedEvent` にマッピングします：

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

これは既存の `workspace.memory.changed` イベントタイプを拡張するもので、以前はファイルベースの QWEN.md 書き込みに対して `scope: 'workspace' | 'global'` のみを含んでいました。

---

## 9. 設計の根拠

### なぜセッションレスなのか？

CLI の `/remember` スラッシュコマンドはすでにセッション内で機能します。しかし、設定 UI やプログラムによる SDK 呼び出し元が、単にファクトを永続化するためだけにセッションを作成する必要はありません。セッションは会話履歴、ターンの追跡、およびセッションリストでの可視性を意味しますが、これらはどれも使い捨てのメモリ書き込みには適用されません。

### なぜ直列実行なのか？

管理対象メモリシステムは、インデックス付きのマークダウンファイルにファクトを保存します。複数の remember タスクからの同時書き込みは、インデックスを破損させたり、マージ競合を引き起こしたりする可能性があります。シングルスレッドのレーンが、最もシンプルで正しい解決策です。

### なぜタスクキューなのか（非同期である理由）？

メモリの書き込みには、LLM エージェントがファクトを _どこに_、_どのように_ 保存するかを決定する処理（ユーザースコープとプロジェクトスコープの選択、適切なファイルの選択、フォーマット設定など）が含まれます。これには 2〜30 秒かかります。同期 HTTP リクエストではタイムアウトするか、クライアントがブロックされます。非同期キュー + ポーリングのパターンを採用することで、HTTP 契約をシンプルに保ち、クライアントが進捗 UI を表示できるようになります。

### なぜ `contextMode` なのか？

- `"workspace"`（デフォルト）— remember エージェントは既存のメモリをコンテキストとして参照するため、既存のエントリの重複排除や更新が可能になります。
- `"clean"` — エージェントは以前のユーザーメモリを参照しません。重複排除ロジックなしで新しい書き込みを強制したい場合（例: 一括インポート）に便利です。

### なぜ読み取りをメモリパスに制限するのか？

remember エージェントは、管理対象メモリディレクトリ内でのみ読み書きを行うべきです。これにより、細工された `content` によってエージェントが騙され、機密性の高いプロジェクトファイルを読み取ってメモリエンティティに漏洩させてしまうプロンプトインジェクションのシナリオを防ぎます。