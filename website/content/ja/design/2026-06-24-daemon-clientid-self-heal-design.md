# Design: `invalid_client_id` 発生時の clientId 自己修復 (DaemonSessionClient)

- **Date:** 2026-06-24
- **Component:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Depends on:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **merged** (`84745d0f0`)
- **Status:** 実装済み（マージ済みの #5784 をベースに構築）

## 問題

daemon の再起動（またはセッションの再読み込み）後、daemon のインメモリ上のクライアント登録は消去されます。古いサーバー割り当ての `clientId` を保持しているフロントエンドは、その古い id を使って `POST /session/:id/prompt` を送信します。bridge の `resolveTrustedClientId` はそれを認識せず、`InvalidClientIdError` でプロンプトを拒否します。

観測された本番環境のインシデント（トレース `a76a31fe…`、daemon ログ 15:24）：セッションが異なる id `client_ac36fac9` で（再）読み込みされていたにもかかわらず、`client_d019b847` によってプロンプトが送信されたため、プロンプト送信クライアントは登録されませんでした。失敗がターンの終了イベントとして表面化されなかったため、UI は「処理中」のまま無限に停止しました。

PR #5784 は「表面化」の半分を修正します。`invalid_client_id` が**アドミッション（admission）時**にスローされるようになり、`POST /session/:id/prompt` は `202` の後のサイレントな非同期失敗ではなく、同期的な `400 invalid_client_id`（`promptId` なし）を返します。この設計は「自己修復」の半分を追加します。SDK がその `400` を受信すると、再登録して新しい `clientId` を取得し、プロンプトを一度だけリトライするため、ユーザーが手動で再送信することなくターンが進行します。

## 対象範囲

対象範囲（SDK のみ、`DaemonSessionClient`）：

- プロンプトのアドミッション呼び出しで `invalid_client_id` を検出する。
- （すでに復元された）セッションに対してクライアントを再登録し、新しいサーバー割り当ての `clientId` を取得する。
- 新しい `clientId` でプロンプトを**一度だけ**リトライする。

明示的に対象外（YAGNI）：

- SSE ストリームの再接続 — アプリケーション層の既存の責務のまま（dataworks アプリはすでに `reloadSession` / 再接続ロジックを所有している）。`invalid_client_id` はアドミッション呼び出しでのみ表面化し、SSE 待機時には決して表面化しない。
- 他の `clientId` を持つメソッド（`btw`、`shell`、ターン中のメッセージ、`cancel`、`heartbeat`）の自己修復。自己修復を行うのは `prompt()` のみ。
- daemon 再起動をまたいだ `clientId` の永続化。

## 重要な不変条件（ソースコードに対して検証済み）

1. **`invalid_client_id` はアドミッション時の拒否であるため、リトライは安全である。** `resolveTrustedClientId` は、ターンが登録される前、およびルートが `202` を発行する前に、`bridge.sendPrompt` 内で実行される。PR #5784 により、これは同期的にスローされ → 承認前に `400` となる → プロンプトは**決して実行されない**。したがって、リトライによってユーザーのメッセージが二重に実行されることはない。この不変条件が、リトライが安全であることの根拠全体である。これは #5784 に依存している。

2. **`registerClient` は決してスローせず、常に有効な id を生成する。** 未知の `requestedClientId` の場合、`createClientId()` にフォールバックし、新しい `client_<uuid>` を返す。スローするのは `resolveTrustedClientId`（prompt/cancel/… で使用）のみである。したがって、`load` / `resume` 呼び出しは常に利用可能な `clientId` を返す。

3. **復元レスポンスには常に登録された `clientId` が含まれる。** 既存エントリのファストパスとコールド復元パスの両方で、レスポンスに `clientId: registerClient(entry, req.clientId)` が設定される。（`types.ts` の「呼び出し元が clientId を提供した場合にのみエコーバックされる」という注釈は、復元ではなく `HeartbeatResult` に適用される）。

4. **再起動シナリオにおける正味の attach リークはなく、`close()` の正確性が向上する。** `resumeSession` は `attachCount++` を行う。参照カウントのデクリメントは `/detach` → `detachClient`（`attachCount--` + `unregisterClient`）である。`close()` → `DELETE /session/:id` → `closeSessionImpl` は**すべて破棄**する。これは `resolveTrustedClientId` を介して clientId を検証し、セッションを破棄（`byId.delete`）して、`attachCount` も一緒に破棄する。daemon の再起動は再起動前の attach を消去し、`reattach()` は正確に 1 つの attach を再確立し、その後の `close()` / 再起動はすべて破棄するため、正味のリークは発生しない。`closeSessionImpl` も clientId を検証するため、この変更前は古い id を使った再起動後の `close()` 自体が `InvalidClientIdError` をスローしていたことに注意。プロンプトトリガーの `reattach()` 後は `this.clientId` が有効になるため、`close()` は成功する。（`close()` 自体は自己修復されない — 対象外 — が、間接的に恩恵を受ける）。

5. **この変更は PR #5784 がなければ機能しない。** #5784 以前の daemon は `400 invalid_client_id` ではなく `202` の後の非同期失敗を返すため、述語がマッチせず、自己修復がトリガーされることはない。無害なノーオペレーション。

## 設計

すべての変更は `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` に限定される。

### 1. `isInvalidClientId(err): boolean`

```ts
function isInvalidClientId(err: unknown): boolean {
  return (
    err instanceof DaemonHttpError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { code?: unknown }).code === 'invalid_client_id'
  );
}
```

`./DaemonHttpError.js` から `DaemonHttpError` をインポートする必要がある。

### 2. `reattach(): Promise<void>` — single-flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // `invalid_client_id` を観測したすべての並行プロンプトを統合し、
  // 正確に 1 回だけ再登録する（余分な clientId / attachCount の孤立を防ぐ）。
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // bridge が古いものを検証する代わりに新しい登録を発行できるように、clientId を渡さない。
    // `workspaceCwd` を明示的に渡す。`restoreSession` は既存エントリのファストパスの前に
    // `resolveWorkspaceKey(req.workspaceCwd)` を呼び出し、そのヘルパーは絶対パスでない/
    // 未定義のパスでスローするため。
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // clientId のみを更新し、SSE カーソル
                                      // （lastSeenEventId）と状態はそのままにする
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` はシャローコピーであり、`DaemonSession.clientId` は `readonly` ではないため、インプレースのミューテーションは有効である。履歴の再生ではなく再登録のみが必要なため、`load` ではなく `resume` が使用される。

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // `invalid_client_id` 以外: 伝播させる
    await this.reattach();                  // スローする可能性あり → 伝播させる
    return await fn();                      // 正確に 1 回リトライ。再度スローした場合
                                            // （`invalid_client_id` を含む）、
                                            // 伝播させる — ループしない
  }
}
```

### 4. `prompt()` への組み込み

両方のパスでアドミッションのネットワーク呼び出しのみをラップし、ローカルスロットが一度だけ予約され、リトライ間で再利用されるように、`reservePromptSlot` / `releaseAdmission` はラッパーの外に保持する：

- ブロッキングパス（`!this.subscriptionActive`）：
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- 非ブロッキングパス：
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` はクロージャの**内部で**読み取られるため、リトライは更新された id を取得する。アドミッション以降（`_pendingPrompts` の登録と `promptId` による SSE ターンイベントのマッチング）は変更されない。SSE サブスクリプションは `sessionId` でキー付けされるため、`clientId` の変更後も存続する。

## エラーハンドリング

- `invalid_client_id` 以外のエラー（例: `500`、`SessionNotFoundError`、`DaemonPendingPromptLimitError`）：即座に伝播され、`reattach` は行われない。
- `reattach()` の失敗（セッションが本当に消滅した、ネットワークエラー）：伝播される — ユーザーはハングではなく実際のエラーを目にする。
- リトライの枯渇（リトライも `invalid_client_id` の場合）：伝播される。1 回のリトライに制限されており、ループしない。
- `AbortSignal`：ラップされた `prompt` / `promptNonBlocking` 呼び出しはエントリで `throwIfAborted()` を呼び出すため、abort 後のリトライは `AbortError` をスローする。（`resumeSession` には signal パラメータがない。実行中の `reattach` は abort 不可能 — これは許容される。短時間の単一の呼び出しであるため）。

## 既知の制限

- **珍しい個別エビクションのエッジケース：** セッションがメモリ内で存続している間に `clientId` がエビクションされた場合（リーク取り消し / `client_evicted`）、`reattach()` は一致する `/detach` なしで余分な attach（`attachCount++`）を追加する。`close()` はすべて破棄するため、唯一のリークウィンドウは、明示的な `close()` なしに放棄され、スタックした `attachCount` によってアイドル GC から保護されるセッション（1 つのセッションに制限）である。現実的なインシデントは daemon 再起動のケースであり、これはクリーンである。エンジニアリングで回避するのではなく、文書化しておく。

## テスト (TDD)

`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts` の既存の `recordingFetch` ハーネスを使用し、実際の `DaemonClient` を介して URL ごとにインターセプトする（実際の `failOnError` → `DaemonHttpError` のマッピングを行使する）。

1. **非ブロッキング自己修復：** 最初の `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`；`POST /session/s-1/resume` → 新しい `clientId: 'client-2'`；2 回目のプロンプト → `202`。アサーション：プロンプトが解決され、2 回目のプロンプトリクエストが `x-qwen-client-id: client-2` を運び、resume が 1 回呼び出される。
2. **ブロッキング自己修復**（`subscriptionActive` が false）：同上。ブロッキング `prompt` パス経由（リトライ時に `200` / `202` + ターン完了）。
3. **リトライの制限：** プロンプト → `400 invalid_client_id` が 2 回 → エラーが伝播する（resume が 1 回呼び出され、エラーが `DaemonHttpError` の `invalid_client_id` であることをアサーション）。
4. **無効でないエラーはリトライされない：** プロンプト → `500` → 即座に伝播され、`resume` は**決して**呼び出されない。
5. **reattach の失敗が伝播する：** プロンプト → `400 invalid_client_id`；resume → `404` / `500` → そのエラーが伝播する。
6. **Single-flight：** 2 つの並行 `prompt()` 呼び出しが両方とも `400 invalid_client_id` を取得 → `resume` は正確に 1 回呼び出される。両方のリトライが新しい id を使用する。