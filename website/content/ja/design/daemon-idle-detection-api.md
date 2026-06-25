# Daemon アイドル検出 API 設計

## 背景

### 問題

Qwen Daemon は複数のマシンに常駐サービスとしてデプロイされます。Daemon が長時間タスクを実行しない場合、マシンリソースを占有し続けることは無駄です。外部スケジューラー（K8s HPA / カスタム Scaler）は、Daemon がアイドル状態かどうかを判断し、スケールインして回収するための信頼できるシグナルを必要とします。

### 現状

現在利用可能なエンドポイント：

| エンドポイント                 | 返却情報                                          | 制限                                                                  |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /health?deep=true`        | `{ sessions, pendingPermissions }`                | session 数のみで、「session はあるがアイドル」と「session が稼働中」を区別できない |
| `GET /workspace/:cwd/sessions` | 各 session の `hasActivePrompt` + `clientCount` | 追加リクエストが必要で、時間軸の情報がない（最後の活動からどのくらい経過したか？） |

**本質的な欠如**：

1. 「アクティブな prompt があるか」を示す集計レベルの指標がない
2. 「最終活動時刻」がなく、外部システムがアイドル時間を計算するために独自に状態機械を管理する必要がある
3. SSE 接続数が公開されていない（内部では `activeSseCount` を管理しているが、`/health` で返していない）
4. channel（agent サブプロセス）の生存状態が公開されていない

## 設計目標

**単一の HTTP 呼び出しでアイドル判断を完結できる**エンドポイントを提供し、以下を満たす：

- 外部スケジューラーが 1 回の GET で回収可否を判断できる
- 時間軸をサポートし（どれくらいアイドルか）、外部での状態管理を不要にする
- 既存の `/health` の動作との後方互換性を維持する
- 追加依存なし、既存の内部状態を活用する

## 設計案

### `GET /health?deep=true` レスポンスの拡張

既存の `/health?deep=true` レスポンスにフィールドを追加する：

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- 既存フィールド（変更なし）---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- 新規フィールド ---
  "activePrompts": 1, // prompt を実行中の session 数
  "connectedClients": 3, // アクティブな SSE 接続数
  "channelAlive": true, // agent サブプロセスが生存しているか
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // 最終活動時刻（ISO 8601）
  "idleSinceMs": 120000, // 最終活動からの経過ミリ秒数
}
```

### フィールド定義

| フィールド         | 型               | 意味                                                                              |
| ------------------ | ---------------- | --------------------------------------------------------------------------------- |
| `activePrompts`    | `number`         | 現在 `promptActive === true` の session 数                                        |
| `connectedClients` | `number`         | 現在のアクティブな SSE 接続数（既存の `activeSseCount`）                          |
| `channelAlive`     | `boolean`        | agent サブプロセスが生存しているか（既存の `bridge.isChannelLive()`）             |
| `lastActivityAt`   | `string \| null` | 最後に prompt が開始または完了した ISO タイムスタンプ。daemon 起動後に一度も prompt がなければ `null` |
| `idleSinceMs`      | `number \| null` | `Date.now() - lastActivityAt`。活動記録がない場合は `null`                        |

### 「活動」の定義

以下のイベントを「活動」とみなし、`lastActivityAt` を更新する：

- prompt の実行開始（`promptActive` が false → true）
- prompt の完了/失敗（`promptActive` が true → false）
- 新規 session の作成（`spawnOrAttach` 成功）
- session の復元/ロード（`loadSession` / `resumeSession` 成功）

**活動とみなさない**イベント（誤判定を避けるため）：

- SSE の接続/切断
- ハートビート heartbeat
- `/health` リクエスト自体
- permission のリクエスト/レスポンス

### アイドル判断ルール（外部スケジューラー向け参考実装）

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """推奨回収条件：アイドルが閾値（デフォルト 5 分）を超えた場合"""
    if health["activePrompts"] > 0:
        return False  # タスクが実行中
    if health["connectedClients"] > 0:
        return False  # クライアントが接続中
    if health["idleSinceMs"] is None:
        # 一度も活動なし — 起動直後のコールドな daemon の可能性
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## 関連するコード変更

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

`AcpSessionBridge` インターフェースに追加：

```typescript
/** prompt を実行中の session 数 */
get activePromptCount(): number;

/** 最終活動タイムスタンプ（epoch ms）。一度も活動がなければ null */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

`createAcpSessionBridge` ファクトリ関数内に追加：

```typescript
// 新規状態トラッキング
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

以下の箇所で `touchActivity()` を呼び出す：

- `entry.promptActive = true`（~line 2528）— prompt 開始時
- `entry.promptActive = false`（~line 2551, 2559）— prompt 終了時
- `doSpawn` で session 作成成功後（~line 1906 付近）
- `restoreSession` 成功後

返却オブジェクトに公開：

```typescript
get activePromptCount() {
  let count = 0;
  for (const entry of byId.values()) {
    if (entry.promptActive) count++;
  }
  return count;
},

get lastActivityAt() {
  return lastActivityTimestamp;
},
```

### 3. `packages/cli/src/serve/server.ts`

`healthHandler`（~line 803）の `deep` ブランチを修正：

```typescript
const healthHandler = (req: Request, res: Response): void => {
  const deepQuery = req.query['deep'];
  const deep = deepQuery === '1' || deepQuery === 'true' || deepQuery === '';
  if (!deep) {
    res.status(200).json({ status: 'ok' });
    return;
  }
  try {
    const lastActivityAt = bridge.lastActivityAt;
    const now = Date.now();
    res.status(200).json({
      status: 'ok',
      // 既存
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // 新規
      activePrompts: bridge.activePromptCount,
      connectedClients: getActiveSseCount(),
      channelAlive: bridge.isChannelLive(),
      lastActivityAt:
        lastActivityAt !== null ? new Date(lastActivityAt).toISOString() : null,
      idleSinceMs: lastActivityAt !== null ? now - lastActivityAt : null,
    });
  } catch (err) {
    writeStderrLine(
      `qwen serve: /health deep probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: 'degraded' });
  }
};
```

### 4. `packages/cli/src/serve/server.test.ts`

以下をカバーするテストケースを追加：

- `/health?deep=true` が新フィールドを正しく返すこと
- session がない場合に `activePrompts === 0`、`idleSinceMs === null` となること
- prompt 実行中に `activePrompts > 0`、`idleSinceMs` が継続的に更新されること
- prompt 完了後に `idleSinceMs` が増加し始めること

### 5. `packages/acp-bridge/src/bridge.test.ts`

以下をカバーするテストケースを追加：

- prompt のライフサイクル中の `activePromptCount` の値変化
- 各活動イベント後に `lastActivityAt` が更新されること
- 複数 session が並行している場合に `activePromptCount` が正しく合算されること

## 変更ファイル一覧

| ファイル                                     | 変更種別          | 説明                                            |
| ---------------------------------------- | ------------- | ----------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts` | インターフェース拡張 | `activePromptCount`、`lastActivityAt` プロパティを追加 |
| `packages/acp-bridge/src/bridge.ts`      | ロジック実装      | `lastActivityTimestamp` トラッキングと getter を追加 |
| `packages/cli/src/serve/server.ts`       | HTTP レスポンス拡張 | `/health?deep=true` に新フィールドを追加          |
| `packages/cli/src/serve/server.test.ts`  | テスト          | health エンドポイントの新フィールドカバレッジを追加 |
| `packages/acp-bridge/src/bridge.test.ts` | テスト          | bridge プロパティのカバレッジを追加               |

## 互換性

- **後方互換**：新フィールドは追加のみで、既存フィールドの変更/削除はない
- **`GET /health`（非 deep）**：動作は変わらず、`{ "status": "ok" }` のみを返す
- **OTel Gauge**：既存の `registerDaemonGaugeCallbacks` に後から `activePrompts` gauge を追加することも可能だが、今回のスコープ外

## 今後の拡張（今回のスコープ外）

1. **自動 shutdown**：daemon に `--auto-shutdown-idle-ms` パラメータを組み込み、アイドルタイムアウト後に自動終了する（systemd/K8s Pod シナリオ向け）
2. **OTel メトリクス公開**：`activePrompts`、`idleSinceMs` を gauge として OTel meter に登録する
3. **Webhook コールバック**：アイドルが閾値を超えた際に外部システムへイベントをプッシュする
