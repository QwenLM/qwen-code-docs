# 設計: `invalid_client_id` 発生時の clientId 自己修復 (DaemonSessionClient)

- **日付:** 2026-06-24
- **コンポーネント:** `packages/sdk-typescript` — `DaemonSessionClient`
- **依存関係:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **マージ済み** (`84745d0f0`)
- **ステータス:** 実装済み (マージ済みの #5784 をベースに構築)

## 問題

デーモンの再起動（またはセッションのリロード）後、デーモンのインメモリ上のクライアント登録は消去されます。古いサーバー割り当ての `clientId` を保持しているフロントエンドが、その古い ID を使って `POST /session/:id/prompt` を送信すると、ブリッジの `resolveTrustedClientId` はその ID を認識できず、`InvalidClientIdError` でプロンプトを拒否します。

実際のプロダクションインシデント（トレース `a76a31fe…`、デーモンログ 15:24）では、プロンプトが `client_d019b847` によって送信された一方、セッションは別の ID `client_ac36fac9` で（再）ロードされていたため、プロンプト送信クライアントは登録されていませんでした。この失敗がターン終了イベントとして通知されることがなかったため、UI は「処理中」のまま停止しました。

PR #5784 は「通知」側を修正します。`invalid_client_id` が **受理時** にスローされるようになり、`POST /session/:id/prompt` は `202` 応答＋サイレント非同期失敗ではなく、同期的な `400 invalid_client_id`（`promptId` なし）を返すようになります。本設計は **自己修復** 側を追加します。SDK が `400` を受け取ると、再登録して新しい `clientId` を取得し、プロンプトを 1 回再試行することで、ユーザーが手動で再送信しなくてもターンが継続します。

## 範囲

対象範囲（SDK のみ、`DaemonSessionClient`）:

- プロンプト受理呼び出しでの `invalid_client_id` の検出。
- （すでに復元済みの）セッションに対してクライアントを再登録し、新たにサーバー割り当ての `clientId` を取得。
- 新しい `clientId` でプロンプトを **1 回** 再試行。

明示的に対象外（YAGNI）:

- SSE ストリームの再接続 — アプリ層の既存の責務のまま（dataworks アプリは既に `reloadSession`/再接続ロジックを所有）。`invalid_client_id` は受理呼び出しでのみ発生し、SSE 待機では決して発生しません。
- 他の `clientId` を使用するメソッド（`btw`、`shell`、ターン中のメッセージ、`cancel`、`heartbeat`）の自己修復。自己修復するのは `prompt()` のみ。
- デーモンの再起動をまたいだ `clientId` の永続化。

## 主要な不変条件（ソースコードで確認済み）

1. **`invalid_client_id` は受理時の拒否であるため、再試行は安全です。**
   `resolveTrustedClientId` は `bridge.sendPrompt` 内で、ターンが登録される前、かつルートが `202` を発行する前に実行されます。PR #5784 により、これは同期的にスロー → 受理前に `400` を返す → プロンプトは **決して実行されません**。したがって、再試行によってユーザーのメッセージが二重実行されることはありません。この不変条件が再試行の安全性の根拠であり、#5784 に依存します。

2. **`registerClient` は決してスローせず、常に有効な ID を返します。** 未知の `requestedClientId` の場合は `createClientId()` にフォールスルーし、新しい `client_<uuid>` を返します。スローするのは `resolveTrustedClientId`（prompt/cancel/… で使用）のみです。したがって、`load`/`resume` の呼び出しは常に使用可能な `clientId` を返します。

3. **復元レスポンスには常に登録された `clientId` が含まれます。** 既存エントリの高速パスとコールドリストアパスの両方で、レスポンス内に `clientId: registerClient(entry, req.clientId)` が設定されます。（`types.ts` の「呼び出し元が clientId を指定した場合のみエコーバックされる」という注釈は `HeartbeatResult` に適用され、復元には適用されません。）

4. **再起動シナリオでネットアタッチリークは発生せず、`close()` の正確性が向上します。** `resumeSession` は `attachCount++` を行います。参照カウントのデクリメントは `/detach` → `detachClient`（`attachCount--` + `unregisterClient`）です。`close()` → `DELETE /session/:id` → `closeSessionImpl` は **全破壊** です。`resolveTrustedClientId` で clientId を検証した後、セッション全体を破棄します（`byId.delete`）。`attachCount` も一緒に破棄されます。デーモンの再起動により再起動前のアタッチは消去されます。`reattach()` は正確に 1 つのアタッチを再確立し、後続の `close()`/再起動でそれを完全に破棄します。ネットリークは発生しません。なお、`closeSessionImpl` も clientId を検証するため、この変更前は、再起動後に古い ID で `close()` を呼び出すとそれ自体が `InvalidClientIdError` をスローしていました。プロンプトトリガーの `reattach()` 後は、`this.clientId` が有効になるため `close()` は成功します。（`close()` 自体は自己修復されません — 対象外 — ですが間接的に恩恵を受けます。）

5. **PR #5784 がない場合、この変更は何の影響も与えません。** #5784 以前のデーモンは `202` 応答＋非同期失敗を返し、`400 invalid_client_id` を決して返さないため、条件が一致せず自己修復はトリガーされません。無害なノーオペレーションです。

## 設計

すべての変更は `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` に限定されます。

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

`DaemonHttpError` を `./DaemonHttpError.js` からインポートする必要があります。

### 2. `reattach(): Promise<void>` — シングルフライト

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // 同時に invalid_client_id を観測した複数のプロンプトを集約し、
  // 再登録を正確に 1 回実行する（余分な clientId / attachCount の放置を防止）。
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // clientId を渡さないことで、ブリッジに古い ID の検証ではなく新規登録を指示。
    // workspaceCwd を明示的に渡す: restoreSession は既存エントリの高速パスの前に
    // resolveWorkspaceKey(req.workspaceCwd) を呼び出し、このヘルパーは
    // 絶対パスまたは undefined 以外のパスでスローする。
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // clientId のみ更新し、SSE カーソル
                                      // (lastSeenEventId) と状態はそのままにする
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` はシャローコピーであり、`DaemonSession.clientId` は `readonly` ではないため、インプレースでの変更は有効です。履歴の再生ではなく再登録のみが必要なため、`load` ではなく `resume` を使用します。

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // invalid_client_id 以外: そのまま伝播
    await this.reattach();                  // スローする可能性あり → 伝播
    return await fn();                      // 正確に 1 回再試行; 再試行でもスロー
                                            // した場合（invalid_client_id 含む）は
                                            // 伝播 — ループなし
  }
}
```

### 4. `prompt()` への組み込み

両方のパスで受理ネットワーク呼び出しのみをラップし、`reservePromptSlot`/`releaseAdmission` はラッパーの外側に置くことで、ローカルスロットが一度予約され、再試行でも再利用されるようにします:

- ブロッキングパス (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- 非ブロッキングパス:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` はクロージャ **内側** で読み取られるため、再試行では更新された ID が使用されます。受理後の処理（`_pendingPrompts` への登録、`promptId` による SSE ターンイベントのマッチング）は変更されません。SSE サブスクリプションは `sessionId` でキー付けされているため、`clientId` の変更後も維持されます。

## エラーハンドリング

- `invalid_client_id` 以外のエラー（例: `500`、`SessionNotFoundError`、`DaemonPendingPromptLimitError`）: 即座に伝播、`reattach` は実行しません。
- `reattach()` の失敗（セッションが本当に存在しない、ネットワーク障害）: 伝播 — ユーザーはハングではなく実際のエラーを確認します。
- 再試行の枯渇（再試行でも `invalid_client_id`）: 伝播。1 回の再試行に制限され、ループはありません。
- `AbortSignal`: ラップされた `prompt`/`promptNonBlocking` 呼び出しはエントリで `throwIfAborted()` を実行するため、中断後の再試行は `AbortError` をスローします。（`resumeSession` にはシグナルパラメータはありません。進行中の `reattach` は中断不可ですが、これは単一の短い呼び出しであるため許容されます。）

## 既知の制限

- **まれな個別除外エッジケース:** セッションがメモリ上で生存している間に `clientId` が除外された場合（リーク排除 / `client_evicted`）、`reattach()` は対応する `/detach` なしでアタッチを追加します（`attachCount++`）。`close()` は全破壊であるため、リークの可能性があるのは、明示的な `close()` が行われずに放棄され、かつスタックした `attachCount` によってアイドル GC から保護されるセッション（最大 1 セッション）のみです。現実的なインシデントはデーモン再起動のケースであり、これは問題ありません。対処するよりも文書化します。

## テスト (TDD)

`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts` の既存の `recordingFetch` テストハーネスを使用し、実際の `DaemonClient` を介して URL でインターセプトします（実際の `failOnError` → `DaemonHttpError` へのマッピングを実行します）。

1. **非ブロッキング自己修復:** 最初の `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`; `POST /session/s-1/resume` → 新しい `clientId: 'client-2'`; 2 回目のプロンプト → `202`。アサーション: プロンプトが解決され、2 回目のプロンプトリクエストに `x-qwen-client-id: client-2` が含まれ、resume が 1 回呼び出されること。
2. **ブロッキング自己修復** (`subscriptionActive` が false): 同様に、ブロッキング `prompt` パス（再試行時に `200`/`202`+turn-complete）経由。
3. **再試行の制限:** プロンプト → `400 invalid_client_id` が 2 回 → エラーが伝播する（アサーション: resume が 1 回呼び出され、エラーは `DaemonHttpError` invalid_client_id であること）。
4. **invalid_client_id 以外のエラーは再試行しない:** プロンプト → `500` → 即座に伝播、`resume` は **決して** 呼び出されない。
5. **reattach の失敗が伝播する:** プロンプト → `400 invalid_client_id`; resume → `404`/`500` → そのエラーが伝播する。
6. **シングルフライト:** 2 つの同時 `prompt()` 呼び出しが両方とも `400 invalid_client_id` を受け取る → `resume` が正確に 1 回呼び出される。両方の再試行が新しい ID を使用する。