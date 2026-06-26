# Daemon アイドル検出インターフェース設計

## 背景

### 問題

Qwen Daemon は複数台のマシンに長期間稼働するサービスとしてデプロイされる。Daemon が長時間タスクを実行しない場合、マシンリソースを占有し続けるのは無駄である。外部スケジューラ（K8s HPA / カスタム Scaler）は、Daemon がアイドル状態かどうかを判断するための信頼できるシグナルを必要としており、スケールイン・リクレームを実行できるようにする必要がある。

### 現状

現在利用可能なインターフェース：

| インターフェース                   | 返却情報                                          | 制限                                                                  |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /health?deep=true`        | `{ sessions, pendingPermissions }`                | セッション数のみで、「セッションはあるがアイドル」と「セッションが作業中」を区別できない |
| `GET /workspace/:cwd/sessions` | 各セッションの `hasActivePrompt` + `clientCount`  | 追加のリクエストが必要であり、時間軸の情報（どのくらい活動していないか？）がない |

**主要な欠落**：

1. 集約レベルでの「アクティブな prompt があるか」の指標がない
2. 「最終活動時刻」がなく、外部システムが自分でステートマシンを維持してアイドル時間を計算する必要がある
3. SSE 接続数が公開されていない（内部では `activeSseCount` を管理しているが、`/health` では返されていない）
4. channel（agent サブプロセス）の生存状態が公開されていない

## 設計目標

**1回の HTTP 呼び出しでアイドル判定を完了できる**インターフェースを提供し、以下を満たす：

- 外部スケジューラが1回の GET でリクレーム可能か判断できる
- 時間軸（アイドル時間）をサポートし、外部で状態を維持する必要がない
- 既存の `/health` 動作と後方互換性がある
- 追加依存なし、既存の内部状態を利用する

## 方案

### `GET /health?deep=true` のレスポンス拡張

既存の `/health?deep=true` の返却にフィールドを追加する：

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- 既存フィールド（変更なし）---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- 新規フィールド ---
  "activePrompts": 1, // 現在 prompt を実行中の session 数
  "connectedClients": 3, // アクティブな SSE 接続数
  "channelAlive": true, // agent サブプロセスが生存しているか
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // 最終活動時刻（ISO 8601）
  "idleSinceMs": 120000, // 最終活動からの経過ミリ秒
}
```

### フィールド定義

| フィールド           | 型               | 意味                                                                              |
| ------------------ | ---------------- | --------------------------------------------------------------------------------- |
| `activePrompts`    | `number`         | 現在 `promptActive === true` の session 数                                      |
| `connectedClients` | `number`         | 現在アクティブな SSE 接続数（既存の `activeSseCount`）                                      |
| `channelAlive`     | `boolean`        | agent サブプロセスが生存しているか（既存の `bridge.isChannelLive()`）                             |
| `lastActivityAt`   | `string \| null` | 最後の prompt 開始または完了の ISO タイムスタンプ；daemon 起動後一度も prompt がない場合は `null` |
| `idleSinceMs`      | `number \| null` | `Date.now() - lastActivityAt`；活動記録がない場合は `null`                              |

### 「活動」の定義

以下のイベントを「活動」とみなし、`lastActivityAt` を更新する：

- prompt の実行開始（`promptActive` が false → true）
- prompt の完了/失敗（`promptActive` が true → false）
- 新しい session の作成（`spawnOrAttach` 成功）
- session の復元/ロード（`loadSession` / `resumeSession` 成功）

**活動とみなさない**イベント（誤判定を防ぐ）：

- SSE 接続/切断
- ハートビート heartbeat
- `/health` リクエスト自体
- permission リクエスト/レスポンス

### アイドル判定ルール（外部スケジューラ向け参考）

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """推奨リクレーム条件：アイドル時間が閾値（デフォルト5分）を超えた場合"""
    if health["activePrompts"] > 0:
        return False  # タスク実行中
    if health["connectedClients"] > 0:
        return False  # クライアント接続中
    if health["idleSinceMs"] is None:
        # 一度も活動なし — 起動直後の cold daemon である可能性
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## コード変更箇所

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

`AcpSessionBridge` インターフェースに以下を追加：

```typescript
/** 現在 prompt を実行中の session 数 */
get activePromptCount(): number;

/** 最終活動時刻（エポックミリ秒）、null は一度も活動なし */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

`createAcpSessionBridge` ファクトリ関数内：

```typescript
// 新規状態追跡
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

以下の箇所で `touchActivity()` を呼び出す：

- `entry.promptActive = true`（~line 2528）— prompt 開始
- `entry.promptActive = false`（~line 2551, 2559）— prompt 終了
- `doSpawn` による session 作成成功後（~line 1906 付近）
- `restoreSession` 成功後

返却オブジェクトで公開：

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

新規テストケースで以下をカバー：

- `/health?deep=true` が新しいフィールドを正しく返すこと
- session がない場合 `activePrompts === 0`、`idleSinceMs === null`
- prompt 実行中は `activePrompts > 0`、`idleSinceMs` が継続的に更新されること
- prompt 完了後 `idleSinceMs` が増加し始めること

### 5. `packages/acp-bridge/src/bridge.test.ts`

新規テストケースで以下をカバー：

- `activePromptCount` が prompt のライフサイクルで値が変化すること
- `lastActivityAt` が各活動イベント後に更新されること
- 複数 session の並行実行時に `activePromptCount` が正しく加算されること

## ファイル変更一覧

| ファイル                                     | 変更種別      | 説明                                            |
| ---------------------------------------- | ------------- | ----------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts` | インターフェース拡張      | 新規 `activePromptCount`、`lastActivityAt` プロパティ追加 |
| `packages/acp-bridge/src/bridge.ts`      | ロジック実装      | 新規 `lastActivityTimestamp` 追跡 + getter      |
| `packages/cli/src/serve/server.ts`       | HTTP レスポンス拡張 | `/health?deep=true` に新しいフィールド追加                  |
| `packages/cli/src/serve/server.test.ts`  | テスト          | health インターフェースの新規フィールドカバレッジ追加                      |
| `packages/acp-bridge/src/bridge.test.ts` | テスト          | bridge プロパティのカバレッジ追加                            |

## 互換性

- **後方互換性**：新しいフィールドは追加のみで、既存フィールドを変更・削除しない
- **`GET /health`（deep なし）**：動作は変わらず、引き続き `{ "status": "ok" }` のみを返す
- **OTel Gauge**：既存の `registerDaemonGaugeCallbacks` でオプションで `activePrompts` gauge を追加可能だが、今回の範囲外とする

## 将来の拡張（今回の範囲外）

1. **自動シャットダウン**：daemon に `--auto-shutdown-idle-ms` パラメータを組み込み、アイドル時間超過後に自ら終了する（systemd/K8s Pod 環境に適する）
2. **OTel メトリクス公開**：`activePrompts`、`idleSinceMs` を gauge として OTel meter に登録する
3. **Webhook コールバック**：アイドルタイムアウト時に外部システムへイベントをプッシュする