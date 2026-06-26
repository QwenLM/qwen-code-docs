# セッションアイドルリーパー — 設計ドキュメント

**ステータス:** ドラフト  
**著者:** qinqi  
**日付:** 2026-06-08  
**スコープ:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. 問題の説明

### 1.1 現在の動作

一度作成されたブリッジセッションは、メモリ (`byId: Map<string, SessionEntry>`) に無期限に保持されます。破棄されるのは以下の場合のみです:

1. クライアントが明示的に `DELETE /session/:id` (`closeSession`) を呼び出す
2. 共有の `qwen --acp` 子プロセスがクラッシュする (`channel.exited` ハンドラ)
3. デーモンプロセスが `SIGTERM` / `SIGINT` を受信する (`shutdown`)

セッションに対する**自動的なアイドルタイムアウトはありません**。ハートビートタイムスタンプ (`sessionLastSeenAt`, `clientLastSeenAt`) は `recordHeartbeat` によって記録されますが、削除のために使用されることはありません（フィールドコメントには将来の「失効ポリシー (PR 24)」が参照されていますが、まだ実装されていません）。

### 1.2 影響

| シナリオ                                                                 | 症状                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| ユーザーが複数のブラウザタブを開き、`DELETE /session` を呼び出さずに閉じる | セッションが `byId` に蓄積され、それぞれが EventBus リング (~2-4 MB) を保持   |
| 20 セッション (デフォルトの `maxSessions`) が蓄積                          | 新しい `spawnOrAttach` で `SessionLimitExceededError` — ユーザーがロックアウト |
| 長時間実行されるデーモンとタブの頻繁な切り替え                             | EventBus リプレイリングと ACP 側のセッション状態でメモリが無制限に増加        |
| IDE 拡張機能の再起動 / クラッシュ                                          | 孤立したセッションが決してクリーンアップされない                             |

### 1.3 なぜ今か

デーモンは、長時間実行されるワークスペースサーバー（デスクトップアプリ、IDE 拡張機能、Web UI）としてますます使用されています。クライアントのクラッシュやネットワークの瞬断は日常的であり、明示的な `DELETE` に依存したクリーンアップは持続不可能です。

---

## 2. 設計目標

1. **クライアントが消失し、進行中のアクティブな作業がないアイドルセッションを自動的に再利用する。**
2. **アクティブなプロンプトがあるセッションは絶対に破棄しない** — 破棄すると、ユーザーから見える作業が静かに強制終了されます。
3. **永続化されたセッションデータは保持する** — インメモリのブリッジ状態のみが解放されます。ディスク上のトランスクリプト (`SessionService`) は変更されません。ユーザーは `session/load` または `session/resume` で復元できます。
4. **観測可能** — 個別の SSE イベントを発行し、クライアントがセッションが閉じられた理由（アイドルタイムアウト、明示的なクローズ、クラッシュ）を認識できるようにします。
5. **設定可能** — オペレーターやテストはタイムアウトを調整したり、リーパーを完全に無効にしたりできます。
6. **新しい依存関係 / コンポーネントは追加しない** — 既存のブリッジクロージャ内で完全に実装します。

### 非目標

- ワークスペースをまたがるセッション管理（これはゲートウェイの関心事です）。
- `maxSessions` 境界での LRU 削除（価値はあるが別の作業 — フォローアップとして追跡）。
- アイドルセッションの EventBus リング圧縮（20 セッション上限を考えると優先度低 — フォローアップとして追跡）。
- RSS ベースの適応的圧力（`process.memoryUsage()` のポーリングとポリシー設計が必要 — フォローアップとして追跡）。

---

## 3. アーキテクチャ

### 3.1 概要

```
Bridge クロージャ (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← 既存
├─ channelInfo: ChannelInfo               ← 既存
├─ idleTimer (チャネルレベル)              ← 既存
│
└─ sessionReaper: NodeJS.Timeout          ← 新規
     │
     ├─ byId を REAP_INTERVAL_MS ごとにスキャン
     ├─ アクティブなプロンプトがあるセッションをスキップ
     ├─ ライブ SSE サブスクライバーがいるセッションをスキップ
     ├─ アイドル TTL を超えたセッションをクローズ
     └─ session_closed { reason: 'idle_timeout' } を発行
```

### 3.2 既存のメカニズムとの関係

| メカニズム                                     | スコープ               | 管理するもの                                                                      |
| --------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer`     | チャネル (子プロセス)   | すべてのセッションがなくなったときに `qwen --acp` 子プロセスを強制終了            |
| **Session reaper** (本設計)                    | セッション (メモリエントリ) | アイドル状態の個別セッションをクローズ                                         |
| `ConnectionRegistry` スイープ                  | ACP-over-HTTP 接続     | `/acp` トランスポート層の接続を再利用 (異なるレイヤー)                            |
| `writerIdleTimeoutMs`                          | SSE サブスクライバー    | スタックした単一の SSE サブスクライバーを削除                                     |
| 切断リーパー (server.ts)                        | Spawn ハンドシェイク    | `POST /session` ハンドシェイク中に spawn 所有者が切断したセッションを再利用        |

2 つのメカニズムが連携してセッションライフサイクルのクリーンアップをカバーします:

1. **最終デタッチ時のクローズ** (プライマリ) — `detachClient` が最後の登録クライアントを削除し、かつ SSE サブスクライバーがいない場合、`closeSessionImpl` を介して即座にセッションがクローズされます。これは通常のパス（ユーザーがタブを閉じる → React のクリーンアップ → `POST /session/:id/detach`）を処理します。

2. **セッションアイドルリーパー** (バックストップ) — アクティブなプロンプトがなく、SSE サブスクライバーもおらず、設定された TTL 内にハートビートを受信していないセッションを定期的にスキャンします。これにより、クラッシュパス（ブラウザが強制終了、ネットワーク切断、`kill -9`）を捕捉します。デタッチリクエストが送信されなかったため、`clientIds` にはまだ登録クライアントが表示されますが、セッションは実質的に孤立しています。

---

## 4. 詳細設計

### 4.1 新しい設定オプション (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... 既存のフィールド ...

  /**
   * セッションリーパーが `byId` をアイドルセッションのためにスキャンする間隔（ミリ秒）。
   * デフォルト: 60_000 (1 分)。0 または Infinity を設定するとリーパーを完全に無効化。
   * タイマーは `.unref()` されます。
   */
  sessionReapIntervalMs?: number;

  /**
   * ライブ SSE サブスクライバーが ZERO かつ登録クライアントが ZERO のセッションで、
   * このミリ秒間ハートビートを受信していない場合、アイドルとみなされ再利用されます。
   *
   * デフォルト: 30 * 60_000 (30 分)。
   * 0 または Infinity を設定するとアイドル再利用を無効化。
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI サーフェス** (`qwen serve` フラグ):

```
--session-reap-interval-ms <ms>   リーパースキャン間隔 (デフォルト 60000, 0=無効)
--session-idle-timeout-ms <ms>    アイドルしきい値 (デフォルト 1800000, 0=無効)
```

### 4.2 セッションアイドル判定条件

以下の**すべて**が成立する場合、セッションは再利用の対象となります:

1. **アクティブなプロンプトがない**: `entry.promptActive === false`
2. **ライブ SSE サブスクライバーがいない**: `entry.events.subscriberCount === 0`
3. **アイドル時間がしきい値を超えている**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

注: リーパーは意図的に `clientIds.size` をチェックしません。デタッチが送信されなかったクラッシュパスをカバーします — `clientIds` にはまだ登録クライアントが表示されますが、セッションは実質的に孤立しています。通常のパス（クライアントがデタッチを送信）は代わりに最終デタッチ時のクローズで処理されます。

ここで `lastActivity(entry)` は次のように定義されます:

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` はエポックミリ秒 (Date.now() から);
  // `createdAt` は ISO 8601 文字列 — フォールバックとしてエポックミリ秒にパース。
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

注: `entry.createdAt` は `string` (ISO 8601) 型であり、数値ではありません。`Date.parse` はここでは安全です — 形式は常に `new Date().toISOString()` です (`createSessionEntry`, bridge.ts:1883 参照)。

**各ガードの根拠:**

| ガード                 | 理由                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| アクティブなプロンプトがない | ヘッドレス / 自律的なプロンプト（例: CLI パイプ、cron ジョブ）が SSE サブスクライバーなしで実行されている可能性があります。再利用すると作業が強制終了されます。 |
| SSE サブスクライバーがいない | 接続されたクライアントがアクティブに待機しています。ハートビートを送信していなくても、SSE 接続自体が生存性を証明します。        |
| アイドル時間がしきい値を超えている | グレース期間。一時的に切断されたクライアントがセッションを失わずに再接続できるようにします。                              |

### 4.3 再利用アクション

アイドル判定条件を満たした各セッションについて、リーパーは以下を呼び出します:

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

これにより、既存の `closeSession` パスが再利用されます:

1. `byId` / `defaultEntry` から削除
2. `permissionMediator.forgetSession` により保留中のパーミッションをキャンセル
3. `session_closed` イベントを発行 (`reason: 'idle_timeout'` 付き)
4. EventBus をクローズ
5. ACP 子プロセスに `connection.cancel()` を送信 (ベストエフォート)
6. 最後のセッションだった場合、チャネルで `startIdleTimer` をトリガー

**なぜ `killSession` ではなく `closeSession` なのか？**

`killSession` は spawn ハンドシェイク切断競合 (`requireZeroAttaches` ガード、`spawnOwnerWantedKill` トゥームストーン) のために設計された内部の強制再利用パスです。`closeSession` は、`session_closed` (ではなく `session_died`) を発行し、テレメトリーを正しく処理する、文書化されたクライアント向けパスです。リーパーは「不在のクライアントに代わってのグレースフルクローズ」であるため、`closeSession` が適切なセマンティクスです。

### 4.4 `closeSession` がクローズ理由を受け入れるように拡張

現在、`closeSession` は `session_closed` イベントで `reason: 'client_close'` をハードコードしています。これをパラメーター化可能にする必要があります。

**アプローチ:** `closeSession` に新しいオプションの `opts` パラメーターを追加します。`BridgeClientRequestContext` をオーバーロードするのではなく（これはクライアントリクエストスコープの型 — そこに `reason` を追加すると、「理由」はサーバー側の判断であり、クライアントがヘッダーで渡すものではないため、レイヤー違反になります）。

```typescript
// bridgeTypes.ts — 新しい型 + シグネチャ変更:
export interface CloseSessionOpts {
  /** session_closed イベントのデフォルトの 'client_close' 理由をオーバーライドします。 */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — 実装変更:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

既存の呼び出し元 (`DELETE /session/:id` ルート) は `opts` を渡さず、デフォルトで `'client_close'` になります。リーパーは `{ reason: 'idle_timeout' }` を渡します。

### 4.5 リーパーのライフサイクル

```typescript
// createHttpAcpBridge クロージャ内:

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
      // `undefined` context (クライアントなし) と `{ reason }` opts を渡す。
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

注: `bridgeImpl` は `createHttpAcpBridge` によって返されるブリッジオブジェクトを指すため、`closeSession` はクロージャスコープの状態に完全にアクセスできます。実際には、これはクロージャ内部の `closeSessionImpl` 関数への直接呼び出しとして実装されます。

**ライフサイクル統合:**

- `startSessionReaper()` はブリッジ構築時に呼び出されます（オプション検証後、既存の `channelIdleTimeoutMs` セットアップと一緒に）。
- `stopSessionReaper()` は `shutdown()` と `killAllSync()` の両方で呼び出されます。

### 4.6 既存の `closeSession` 呼び出し元との相互作用

| 呼び出し元                    | 影響                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| `DELETE /session/:id` ルート | なし — `opts` を渡さないため、デフォルトで `reason: 'client_close'`  |
| セッションリーパー (本設計)     | `opts: { reason: 'idle_timeout' }` を渡す                         |
| `detachClient` 遅延再利用     | `killSession` (ではなく `closeSession`) を呼び出す、影響なし        |
| `channel.exited` ハンドラ     | `session_died` を発行、影響なし                                     |
| `shutdown()`                 | `session_died` を理由 `daemon_shutdown` で発行、影響なし               |

### 4.7 並行性の安全性

リーパーコールバックは Node.js のイベントループ上で実行されます。主要な考慮事項:

- **`for...of` イテレーションは同期的です。** リーパーは各エントリのアイドル判定を同期的に評価し、一致するエントリに対して `closeSession(...).catch(...)` を実行します。ループ本体内に `await` はありません — すべてのクローズは単一のマイクロタスク境界でディスパッチされ、その後ループを終了します。
- **`byId.delete` は遅延されます。** `closeSession` 内では、`byId.delete` は最初の `await` (`notifyAgentSessionClose`) の後に実行されます。つまり、削除は `for...of` ループが完了した後のマイクロタスクで発生します。各 `closeSession` は異なるキーに対して動作するため、エイリアシングはありません。また、`for...of` は既にイテレーションを完了しているため、イテレーション途中の削除は問題になりません。
- **二重クローズ競合。** クライアントがリーパーの判定チェックと非同期の `closeSession` 実行の間に同じセッションに対して `DELETE /session/:id` を呼び出した場合、リーパーの `closeSession` は `SessionNotFoundError` をスローします (`.catch()` で捕捉)。安全です。
- **再接続競合。** クライアントがリーパーの判定チェックと `closeSession` 実行の間にセッションに再接続した場合（clientId の登録 / SSE のオープン）、`closeSession` は続行され、セッションをクローズします。クライアントは `session_closed` を受信し、再ロードする必要があります。このウィンドウは非常に狭く（同期 `setInterval` の 1 ティック）、結果は無害です — データ損失はなく、再ロードプロンプトが表示されるだけです。デフォルトの 30 分 TTL により、これは極めて稀です。
- リーパーがスキャンしている間に `spawnOrAttach` が新しいセッションを作成しても、それは認識されません（各ティックの開始時に `byId` エントリをイテレートします）。これは安全です — 新しいセッションはフレッシュであり、アイドルしきい値を満たしません。

### 4.8 ワイヤーフォーマットの変更

`session_closed` イベントの `data.reason` フィールドは既に存在し、値は `'client_close'` です。新しい値を 2 つ追加します:

- `'idle_timeout'` — アイドルリーパーによって発行される (クラッシュしたクライアントのバックストップ)
- `'last_client_detached'` — 最終デタッチ時のクローズによって発行される (通常のタブクローズ)

これは後方互換性があります — `reason === 'client_close'` をチェックする既存の SDK コードは単に新しい値にマッチせず、汎用の終端フレームハンドラ (`isTerminalLifecycleEvent`) は理由に関係なく `session_closed` を既に処理しています。

---

## 5. テスト計画

### 5.1 ユニットテスト (`bridge.test.ts`)

| #   | テスト                                                         | 説明                                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | アイドルセッションがタイムアウト後に再利用される                   | セッションを作成し、`sessionIdleTimeoutMs` を超えて時間を進め、リーパーティックをトリガーし、セッションが `byId` から削除され、`reason: 'idle_timeout'` で `session_closed` イベントが発行されることを確認 |
| 2   | アクティブなプロンプトがあるセッションは再利用されない               | セッションを作成し、プロンプトを開始し、時間を進め、リーパーティック後もセッションが存続することを確認                                                                          |
| 3   | ライブ SSE サブスクライバーがいるセッションは再利用されない         | セッションを作成し、その EventBus にサブスクライブし、時間を進め、セッションが存続することを確認                                                                                |
| 4   | 登録クライアントがいるセッションは再利用されない                   | セッションを作成し、clientId を登録し、時間を進め、セッションが存続することを確認                                                                                              |
| 5   | interval = 0 でリーパーが無効化される                            | `sessionReapIntervalMs: 0` を渡し、`setInterval` が設定されていないことを確認                                                                                                   |
| 6   | timeout = 0 でリーパーが無効化される                             | `sessionIdleTimeoutMs: 0` を渡し、`setInterval` が設定されていないことを確認                                                                                                   |
| 7   | シャットダウン時にリーパーが停止される                             | `shutdown()` を呼び出し、`clearInterval` が呼ばれたことを確認                                                                                                                  |
| 8   | closeSession の reason がデフォルトで 'client_close' になる     | 明示的な理由なしで `closeSession` を呼び出し、発行されたイベントが `reason: 'client_close'` であることを確認                                                                     |
| 9   | 明示的な理由を指定した closeSession                               | `reason: 'idle_timeout'` を指定して `closeSession` を呼び出し、発行されたイベントを確認                                                                                          |
| 10  | 1 ティックで複数のアイドルセッションが再利用される                   | 3 つのアイドルセッションを作成し、時間を進め、ティックをトリガーし、3 つすべてが再利用されることを確認                                                                          |
| 11  | TTL 内にハートビートがあるセッションは存続する                     | セッションを作成し、ハートビートを記録し、TTL 直下まで時間を進め、セッションが存続することを確認                                                                                |
| 12  | 最後のセッションが再利用された後にチャネルアイドルタイマーがトリガーされる | 1 つのセッション（チャネル上で最後）を作成し、それを再利用し、チャネルで `startIdleTimer` が呼ばれることを確認                                                                   |

### 5.2 統合テスト (`server.test.ts`)

| #   | テスト                                                                   | 説明                                                                                 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | `GET /health?deep=1` がリーパーでクリーンアップされたセッション数を反映する | デーモンを起動し、セッションを作成し、時間を進め、ヘルスエンドポイントが減少した数を表示することを確認 |
| 2   | SSE サブスクライバーが `reason: 'idle_timeout'` の `session_closed` を受信する | SSE を開き、切断し、TTL 前に再接続し、その後 TTL を期限切れにし、イベントを確認           |
---

## 6. 設定デフォルト値

| オプション               | デフォルト値           | 根拠                                                                                     |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs`  | 60,000（1分）          | 長時間の蓄積を防ぐのに十分な頻度であり、シンプルな Map スキャンで済むため、頻繁に実行しても負荷が低い |
| `sessionIdleTimeoutMs`   | 1,800,000（30分）      | 再接続に対して十分な猶予期間。`ConnectionRegistry.idleTtlMs` と合わせることでメンタルモデルの一貫性を保つ |

---

## 7. 可観測性

- **stderr ログ**: 各 reap のたびに `qwen serve: reaping idle session "<id>" (idle for Nms)` を出力。既存の `qwen serve:` プレフィックス規則に準拠。
- **テレメトリーイベント**: `session.close` で、operation は `qwen-code.daemon.bridge.operation: 'session.close'`（既存の `closeSession` テレメトリーパスを再利用）。
- **テレメトリーメトリクス**: `sessionLifecycle('close')`（既存のカウンターを再利用）。
- **SSE イベント**: `session_closed` で `data.reason: 'idle_timeout'` を送信。

---

## 8. 後続作業（スコープ外）

| 項目                                      | 説明                                                                                    | 優先度 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| `maxSessions` に達した際の LRU 削除        | 新しいセッションを拒否する代わりに、直近のアクティブ時刻が最も古いアイドルセッションを削除する | P1     |
| EventBus リングのコンパクト化              | 購読者が0のセッションのリングを縮小してメモリを節約する                                    | P2     |
| RSS ベースの適応的プレッシャー制御          | `process.memoryUsage().rss` を監視し、メモリが逼迫したらアイドル TTL を短くする            | P2     |
| ハートビートベースのクライアント活性確認    | 連続 N 回のハートビートウィンドウを見逃したクライアントを自動登録解除する                   | P2     |

---

## 9. リスクと対策

| リスク                                                                          | 対策                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaper が、ヘッドレスクライアントがまさに再接続しようとしているセッションを閉じてしまう | デフォルト TTL は30分と十分に長い。ヘッドレスクライアントはハートビートを送るべき。ディスク上のトランスクリプトは保持されるため、`session/load` で復元できる。   |
| Reaper 内で `closeSession` がスローされ、スキャンループ全体が停止する            | 各 close は個別の `.catch()` で処理されるため、1つの失敗が他の処理をブロックしない                                                                               |
| `byId` のイテレーション中に別のパスから `closeSession` が同時に実行される         | ES2015 Map のイテレーションは現在のキーや直前のキーの削除を許容する。二重 close は冪等（`byId.get` が undefined を返す → reaper の `.catch()` で `SessionNotFoundError` を捕捉） |
| 20のセッションを60秒ごとにスキャンするパフォーマンス                              | 無視できる程度 – 20回の Map 読み取り＋4フィールドのチェックのみ。I/O は発生しない。                                                                               |
| チャネルのアイドルタイマーとの相互作用                                            | 最後のセッションが reap されると、`closeSession` がチャネルの `startIdleTimer` を呼び出すため、追加のロジックは不要。                                               |