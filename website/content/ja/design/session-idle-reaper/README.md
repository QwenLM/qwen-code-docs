# Session Idle Reaper — 設計ドキュメント

**Status:** Draft  
**Author:** qinqi  
**Date:** 2026-06-08  
**Scope:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. 問題の概要

### 1.1 現在の動作

作成されたブリッジセッションは、メモリ上（`byId: Map<string, SessionEntry>`）に無期限で存在し続ける。破棄されるのは以下の場合のみである：

1. クライアントが明示的に `DELETE /session/:id`（`closeSession`）を呼び出した場合
2. 共有の `qwen --acp` 子プロセスがクラッシュした場合（`channel.exited` ハンドラー）
3. デーモンプロセスが `SIGTERM` / `SIGINT` を受信した場合（`shutdown`）

セッションに**自動アイドルタイムアウトは存在しない**。ハートビートのタイムスタンプ（`sessionLastSeenAt`、`clientLastSeenAt`）は `recordHeartbeat` によって記録されるが、削除目的では使用されていない（フィールドのコメントには「将来の失効ポリシー（PR 24）」が参照されているが、まだマージされていない）。

### 1.2 影響

| シナリオ                                                                        | 症状                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ユーザーが複数のブラウザタブを開き、`DELETE /session` を呼ばずに閉じた場合       | セッションが `byId` に蓄積し、それぞれが EventBus リング（約 2〜4 MB）を保持する |
| 20 セッション（デフォルトの `maxSessions`）が蓄積された場合                     | 新しい `spawnOrAttach` で `SessionLimitExceededError` — ユーザーがロックアウトされる |
| タブの増減が多い長期稼働のデーモン                                               | EventBus リプレイリングと ACP 側のセッション状態のメモリが無制限に増加する       |
| IDE 拡張機能の再起動 / クラッシュ                                               | 孤立したセッションがクリーンアップされない                                       |

### 1.3 対応が必要な理由

デーモンは、長期稼働のワークスペースサーバー（デスクトップアプリ、IDE 拡張機能、Web UI）としての利用が増えている。クライアントのクラッシュやネットワーク障害は日常的であり、クリーンアップを明示的な `DELETE` に依存するのは現実的ではない。

---

## 2. 設計の目標

1. **アイドル状態のセッションを自動回収する** — クライアントが不在で、進行中の作業がないセッションを対象とする。
2. **アクティブなプロンプトを持つセッションは絶対に破棄しない** — そうしなければ、ユーザーに見える作業がサイレントにキャンセルされてしまう。
3. **永続化されたセッションデータは保持する** — 解放されるのはメモリ上のブリッジ状態のみで、ディスク上のトランスクリプト（`SessionService`）はそのまま残る。ユーザーは `session/load` や `session/resume` で復元可能。
4. **観測可能にする** — クライアントがセッションが閉じられた理由（アイドルタイムアウト / 明示的なクローズ / クラッシュ）を把握できるよう、専用の SSE イベントを発行する。
5. **設定可能にする** — オペレーターやテストが タイムアウトを調整したり、リーパーを完全に無効化できるようにする。
6. **新たな依存関係 / コンポーネントを追加しない** — 既存のブリッジクロージャー内のみで実装する。

### 非目標

- クロスワークスペースのセッション管理（それはゲートウェイの関心事）。
- `maxSessions` 境界での LRU 削除（価値があるが別の作業 — フォローアップとして追跡）。
- アイドルセッションの EventBus リング圧縮（20 セッション上限を考えると優先度低 — フォローアップとして追跡）。
- RSS ベースのアダプティブ圧力（`process.memoryUsage()` のポーリングとポリシー設計が必要 — フォローアップとして追跡）。

---

## 3. アーキテクチャ

### 3.1 概要

```
Bridge closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← 既存
├─ channelInfo: ChannelInfo               ← 既存
├─ idleTimer (channel-level)              ← 既存
│
└─ sessionReaper: NodeJS.Timeout          ← 新規
     │
     ├─ scans byId every REAP_INTERVAL_MS
     ├─ skips sessions with active prompt
     ├─ skips sessions with live SSE subscribers
     ├─ closes sessions exceeding idle TTL
     └─ emits session_closed { reason: 'idle_timeout' }
```

### 3.2 既存のメカニズムとの関係

| メカニズム                                | スコープ                  | 管理対象                                                                         |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | チャンネル（子プロセス）  | 全セッションがなくなった際に `qwen --acp` 子プロセスをキル                       |
| **Session reaper**（本設計）              | セッション（メモリ上のエントリ） | アイドル状態の個別セッションをクローズ                                     |
| `ConnectionRegistry` sweep                | ACP-over-HTTP 接続        | `/acp` トランスポート層の接続を削除（異なるレイヤー）                             |
| `writerIdleTimeoutMs`                     | SSE サブスクライバー      | スタックした単一の SSE サブスクライバーを削除                                    |
| Disconnect reaper (server.ts)             | スポーンハンドシェイク    | `POST /session` ハンドシェイク中にスポーンオーナーが切断したセッションを削除     |

セッションライフサイクルのクリーンアップをカバーするために、2 つのメカニズムが連携して機能する：

1. **close-on-last-detach**（主要）— `detachClient` が最後に登録されたクライアントを削除し、かつ SSE サブスクライバーも残っていない場合、`closeSessionImpl` を通じてセッションが即座にクローズされる。これは通常のパスを処理する：ユーザーがタブを閉じる → React クリーンアップ → `POST /session/:id/detach`。

2. **Session idle reaper**（バックストップ）— アクティブなプロンプトも SSE サブスクライバーもなく、設定された TTL 内にハートビートを受信していないセッションを定期的にスキャンする。これはクラッシュのパスをカバーする：ブラウザが強制終了、ネットワーク切断、`kill -9` — デタッチリクエストが送信されなかったため、`clientIds` にはまだ登録済みのクライアントが表示されているが、セッションは事実上孤立している。

---

## 4. 詳細設計

### 4.1 新しい設定オプション（`BridgeOptions`）

```typescript
interface BridgeOptions {
  // ... 既存フィールド ...

  /**
   * セッションリーパーが `byId` をスキャンする間隔（ミリ秒）。
   * デフォルト: 60_000（1分）。0 または Infinity に設定するとリーパーが無効になる。
   * タイマーは `.unref()` される。
   */
  sessionReapIntervalMs?: number;

  /**
   * ライブ SSE サブスクライバーが 0 かつ登録済みクライアントが 0 のセッションが、
   * この時間（ミリ秒）の間ハートビートを受信しなかった場合、アイドルとみなされ削除される。
   *
   * デフォルト: 30 * 60_000（30分）。
   * 0 または Infinity に設定するとアイドル削除が無効になる。
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI のインターフェース**（`qwen serve` フラグ）：

```
--session-reap-interval-ms <ms>   Reaper scan interval (default 60000, 0=disable)
--session-idle-timeout-ms <ms>    Idle threshold (default 1800000, 0=disable)
```

### 4.2 セッションのアイドル判定

以下の**すべて**の条件を満たすセッションが削除の対象となる：

1. **アクティブなプロンプトがない**: `entry.promptActive === false`
2. **ライブの SSE サブスクライバーがない**: `entry.events.subscriberCount === 0`
3. **アイドル時間が超過している**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

注：リーパーは意図的に `clientIds.size` をチェックしない。デタッチが送信されなかったクラッシュのパスをカバーするためで、`clientIds` にはまだ登録済みのクライアントが表示されているが、セッションは事実上孤立している。通常のパス（クライアントがデタッチを送信する）は代わりに close-on-last-detach によって処理される。

`lastActivity(entry)` の定義：

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` はエポック ms（Date.now() 由来）;
  // `createdAt` は ISO 8601 文字列 — フォールバックとしてエポック ms にパース。
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

注：`entry.createdAt` は `string`（ISO 8601）として型付けされており、数値ではない。
`Date.parse` はここで安全 — フォーマットは常に `new Date().toISOString()` である
（`createSessionEntry`、bridge.ts:1883 を参照）。

**各ガードの根拠：**

| ガード              | 理由                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| アクティブなプロンプトがない | ヘッドレス / 自律型のプロンプト（CLIパイプ、cronジョブなど）が SSE サブスクライバーなしで実行されている可能性がある。削除すると作業がキャンセルされる。 |
| SSE サブスクライバーがない | 接続されたクライアントがアクティブにリスニングしている。ハートビートを送信していなくても、SSE 接続自体が生存を証明する。 |
| アイドル時間         | 短時間切断されたクライアントがセッションを失わずに再接続できるようにするための猶予期間。 |

### 4.3 削除アクション

アイドル判定を通過した各セッションに対して、リーパーは以下を呼び出す：

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

これにより既存の `closeSession` パスが再利用される：

1. `byId` / `defaultEntry` から削除
2. `permissionMediator.forgetSession` を通じて保留中の権限をキャンセル
3. `session_closed` イベントを発行（`reason: 'idle_timeout'` 付き）
4. EventBus をクローズ
5. ACP 子プロセスに `connection.cancel()` を送信（ベストエフォート）
6. 最後のセッションだった場合、チャンネル上で `startIdleTimer` をトリガー

**`closeSession` を使い `killSession` を使わない理由**

`killSession` は、スポーンハンドシェイクの切断競合（`requireZeroAttaches` ガード、`spawnOwnerWantedKill` トゥームストーン）向けに設計された内部強制削除パスである。`closeSession` は、`session_closed`（`session_died` ではない）を発行してテレメトリを正しく処理する、ドキュメント化されたクライアント向けパスである。リーパーは「不在のクライアントに代わる正常なクローズ」であるため、`closeSession` が適切なセマンティクスである。

### 4.4 クローズ理由を受け入れるための `closeSession` の拡張

現在、`closeSession` は `session_closed` イベントの `reason: 'client_close'` をハードコードしている。これをパラメータ化する必要がある。

**アプローチ：** `BridgeClientRequestContext` をオーバーロードするのではなく、`closeSession` に新しいオプションの `opts` パラメータを追加する（`BridgeClientRequestContext` はクライアントリクエストスコープの型であり、「reason」はサーバー側の決定でクライアントがヘッダーで渡すものではないため、追加するとレイヤー違反になる）。

```typescript
// bridgeTypes.ts — 新しい型 + シグネチャの変更:
export interface CloseSessionOpts {
  /** session_closed イベントのデフォルト 'client_close' 理由を上書きする。 */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — 実装の変更:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

既存の呼び出し元（`DELETE /session/:id` ルート）は `opts` を渡さず、デフォルトで `'client_close'` になる。リーパーは `{ reason: 'idle_timeout' }` を渡す。

### 4.5 リーパーのライフサイクル

```typescript
// createHttpAcpBridge クロージャー内:

const resolvedReapIntervalMs = resolvePositiveMs(
  opts.sessionReapIntervalMs,
  60_000,
);
const resolvedIdleTimeoutMs = resolvePositiveMs(
  opts.sessionIdleTimeoutMs,
  30 * 60_000,
);

let sessionReaper: ReturnType<typeof setInterval> | undefined;

function startSessionReaper(): void {
  if (resolvedReapIntervalMs <= 0 || resolvedIdleTimeoutMs <= 0) return;
  sessionReaper = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    for (const [id, entry] of byId) {
      if (entry.promptActive) continue;
      if (entry.events.subscriberCount > 0) continue;
      const lastActive = entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
      const idle = now - lastActive;
      if (idle < resolvedIdleTimeoutMs) continue;
      writeStderrLine(
        `qwen serve: reaping idle session ${JSON.stringify(id)} ` +
          `(idle for ${Math.round(idle / 1000)}s, threshold ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // `undefined` コンテキスト（クライアントなし）と `{ reason }` opts を渡す。
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: session reaper failed to close ${JSON.stringify(id)}: ${String(err)}`,
          );
        });
    }
  }, resolvedReapIntervalMs);
  sessionReaper.unref();
}

function stopSessionReaper(): void {
  if (sessionReaper !== undefined) {
    clearInterval(sessionReaper);
    sessionReaper = undefined;
  }
}
```

注：`bridgeImpl` は `createHttpAcpBridge` が返すブリッジオブジェクトを参照するため、`closeSession` はクロージャースコープの状態に完全にアクセスできる。実際には、これはクロージャー内部の `closeSessionImpl` 関数への直接呼び出しとして実装される。

**ライフサイクルの統合：**

- `startSessionReaper()` はブリッジ構築時（オプション検証後、既存の `channelIdleTimeoutMs` セットアップと並行して）に呼び出される。
- `stopSessionReaper()` は `shutdown()` と `killAllSync()` の両方で呼び出される。

### 4.6 既存の `closeSession` 呼び出し元との相互作用

| 呼び出し元                   | 影響                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `DELETE /session/:id` ルート | なし — `opts` 未渡し、デフォルトで `reason: 'client_close'`        |
| Session reaper（本設計）     | `opts: { reason: 'idle_timeout' }` を渡す                          |
| `detachClient` の遅延削除    | `killSession`（`closeSession` ではない）を呼び出すため影響なし     |
| `channel.exited` ハンドラー  | `session_died` を発行するため影響なし                              |
| `shutdown()`                 | `reason: daemon_shutdown` 付きで `session_died` を発行するため影響なし |

### 4.7 並行安全性

リーパーコールバックは Node.js のイベントループ上で実行される。主な考慮事項：

- **`for...of` のイテレーションは同期的。** リーパーは各エントリのアイドル判定を同期的に評価し、マッチするエントリに対して `closeSession(...).catch(...)` を発火する。ループ本体に `await` はなく、すべてのクローズは単一のマイクロタスク境界でディスパッチされ、その後ループが終了する。
- **`byId.delete` は遅延される。** `closeSession` 内で `byId.delete` が実行されるのは最初の `await`（`notifyAgentSessionClose`）の後。つまり削除はマイクロタスクで行われ、`for...of` ループが完了した後になる。各 `closeSession` は異なるキーを操作するため、エイリアシングは発生しない。また `for...of` はイテレーションを既に終了しているため、イテレーション中の削除も問題にならない。
- **ダブルクローズ競合。** リーパーの判定チェックと非同期の `closeSession` 実行の間に、クライアントが同じセッションの `DELETE /session/:id` を呼び出した場合、リーパーの `closeSession` は `SessionNotFoundError` をスローする（`.catch()` でキャッチされる）。安全。
- **再接続競合。** クライアントがリーパーの判定チェックと `closeSession` 実行の間にセッションに再接続（clientId を登録 / SSE を開く）した場合、`closeSession` は引き続き実行されてセッションがクローズされる。クライアントは `session_closed` を受信し、再ロードが必要になる。この窓は非常に狭く（1 同期 `setInterval` ティック）、影響は軽微 — データ損失はなく、再ロードプロンプトが表示されるだけ。デフォルトの 30 分 TTL により、これが発生する可能性は極めて低い。
- リーパーがスキャン中に `spawnOrAttach` が新しいセッションを作成しても検出されない（各ティックの開始時に `byId` エントリをイテレーションするため）。これは安全 — 新しいセッションはフレッシュなため、アイドル閾値を満たさない。

### 4.8 ワイヤーフォーマットの変更

`session_closed` イベントの `data.reason` フィールドはすでに `'client_close'` という値で存在している。新たに 2 つの値を追加する：

- `'idle_timeout'` — アイドルリーパーによって発行される（クラッシュしたクライアントのバックストップ）
- `'last_client_detached'` — close-on-last-detach によって発行される（通常のタブクローズ）

これは後方互換性がある — `reason === 'client_close'` をチェックする既存の SDK コードは新しい値にマッチしないが、汎用のターミナルフレームハンドラー（`isTerminalLifecycleEvent`）は理由に関係なく `session_closed` を処理する。

---

## 5. テスト計画

### 5.1 ユニットテスト（`bridge.test.ts`）

| #   | テスト                                                   | 説明                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | タイムアウト後にアイドルセッションが削除される             | セッションを作成し、`sessionIdleTimeoutMs` を経過させ、リーパーティックをトリガーして、セッションが `byId` から削除され、`reason: 'idle_timeout'` 付きの `session_closed` イベントが発行されることを検証 |
| 2   | アクティブなプロンプトを持つセッションは削除されない       | セッションを作成し、プロンプトを開始し、時間を進め、リーパーティック後もセッションが残ることを検証                                                                                       |
| 3   | ライブの SSE サブスクライバーを持つセッションは削除されない | セッションを作成し、その EventBus をサブスクライブし、時間を進め、セッションが残ることを検証                                                                                             |
| 4   | 登録済みクライアントを持つセッションは削除されない         | セッションを作成し、clientId を登録し、時間を進め、セッションが残ることを検証                                                                                                           |
| 5   | interval = 0 のときリーパーが無効になる                  | `sessionReapIntervalMs: 0` を渡し、`setInterval` が設定されないことを検証                                                                                                               |
| 6   | timeout = 0 のときリーパーが無効になる                   | `sessionIdleTimeoutMs: 0` を渡し、`setInterval` が設定されないことを検証                                                                                                                |
| 7   | シャットダウン時にリーパーが停止する                      | `shutdown()` を呼び出し、`clearInterval` が呼ばれたことを検証                                                                                                                          |
| 8   | closeSession の reason がデフォルトで 'client_close' になる | 明示的な reason なしで `closeSession` を呼び出し、発行されたイベントの `reason: 'client_close'` を検証                                                                                  |
| 9   | 明示的な reason 付きの closeSession                      | `reason: 'idle_timeout'` 付きで `closeSession` を呼び出し、発行されたイベントを検証                                                                                                    |
| 10  | 1 ティックで複数のアイドルセッションが削除される           | 3 つのアイドルセッションを作成し、時間を進め、ティックをトリガーして、3 つすべてが削除されることを検証                                                                                   |
| 11  | TTL 内のハートビートを持つセッションは残る               | セッションを作成し、ハートビートを記録し、TTL ぎりぎりまで時間を進め、セッションが残ることを検証                                                                                        |
| 12  | 最後のセッションが削除された後にチャンネルのアイドルタイマーがトリガーされる | チャンネル上に 1 つのセッション（最後）を作成し、削除して、チャンネル上で `startIdleTimer` が呼ばれたことを検証 |

### 5.2 インテグレーションテスト（`server.test.ts`）

| #   | テスト                                                                   | 説明                                                                                    |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` がリーパーでクリーンアップされたセッション数を反映する | デーモンを起動し、セッションを作成し、時間を進め、ヘルスエンドポイントが減少したカウントを示すことを検証 |
| 2   | SSE サブスクライバーが `reason: 'idle_timeout'` 付きの `session_closed` を受信する | SSE を開き、切断し、TTL 前に再接続し、TTL が切れるまで待って、イベントを検証 |

---

## 6. 設定のデフォルト値

| オプション              | デフォルト         | 根拠                                                                                                       |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60,000（1分）      | 蓄積を防ぐのに十分な頻度で、かつシンプルな Map スキャンであり頻繁な実行も安価                              |
| `sessionIdleTimeoutMs`  | 1,800,000（30分）  | 再接続のための十分な猶予期間。メンタルモデルの一貫性のため `ConnectionRegistry.idleTtlMs` に合わせている   |

---

## 7. 観測可能性

- **stderr ログ**: 各削除時に `qwen serve: reaping idle session "<id>" (idle for Nms)` を出力（既存の `qwen serve:` プレフィックス規則に準拠）。
- **テレメトリイベント**: `qwen-code.daemon.bridge.operation: 'session.close'` オペレーション付きの `session.close`（既存の `closeSession` テレメトリパスを再利用）。
- **テレメトリメトリクス**: `sessionLifecycle('close')`（既存のカウンターを再利用）。
- **SSE イベント**: `data.reason: 'idle_timeout'` 付きの `session_closed`。

---

## 8. フォローアップ作業（スコープ外）

| 項目                            | 説明                                                                            | 優先度 |
| ------------------------------- | ------------------------------------------------------------------------------- | ------ |
| `maxSessions` での LRU 削除     | 新しいセッションを拒否するのではなく、最も最近使用されていないアイドルセッションを削除する | P1     |
| EventBus リング圧縮             | サブスクライバーが 0 のセッションのリングを縮小してメモリを節約                   | P2     |
| RSS ベースのアダプティブ圧力    | `process.memoryUsage().rss` を監視し、メモリが逼迫したらアイドル TTL を短縮する  | P2     |
| ハートビートベースのクライアント生存確認 | N 回連続してハートビートウィンドウを逃したクライアントを自動登録解除する     | P2     |

---

## 9. リスクと軽減策

| リスク                                                                          | 軽減策                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リーパーが、ヘッドレスクライアントが再接続しようとしているセッションをクローズする | デフォルトの 30 分 TTL は十分な猶予がある。ヘッドレスクライアントはハートビートを送信すべき。ディスクのトランスクリプトは保持され、`session/load` で復元できる。                  |
| リーパー内の `closeSession` がスローしてスキャンループを阻害する                | 各クローズは独自の `.catch()` 内にある — 1 つの失敗が他をブロックしない                                                                                                           |
| 別のパスからの並行 `closeSession` 中に `byId` をリーパーがイテレーションする  | ES2015 の Map イテレーションは現在 / 前のキーの削除を許容する。ダブルクローズは冪等（`byId.get` が undefined を返す → リーパーの `.catch` でキャッチされる `SessionNotFoundError`）。 |
| 60 秒ごとに 20 セッションをスキャンするパフォーマンス                          | 軽微 — 20 回の Map 読み取りと各 4 フィールドのチェック。I/O なし。                                                                                                               |
| チャンネルアイドルタイマーとの相互作用                                          | 最後のセッションが削除されると、`closeSession` はすでにチャンネル上で `startIdleTimer` を呼び出す。追加のロジックは不要。                                                         |
