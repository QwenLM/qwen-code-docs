# Async Memory Recall — 設計仕様書

**日付:** 2026-05-15
**ステータス:** 承認済み
**関連 Issue:** #3761, #3759
**関連 PR:** #3814, #3866

---

## 問題

`relevanceSelector.ts` は `AbortSignal.timeout(1_000)` を使用している（#3866 で導入）。初回セッションのコールドスタート時、qwen3.5-flash の平均応答時間は約 908 ms であり、1 秒のしきい値に常に達している。`resolveAutoMemoryWithDeadline` 内の外側の 2.5 秒デッドラインにより、すべての UserQuery で最大 2.5 秒ブロックされる可能性がある（たとえ常に呼び出しが失敗しても）。

根本原因：メインエージェントのリクエストパスは、モデルに送信する前に呼び出し結果を `await` している。呼び出し側クエリの遅延が直接ユーザー視認レイテンシに加算される。

---

## 設計

### 基本アイデア

UserQuery 時に呼び出しを実行し、決して `await` しない。結果は 2 つのタイミングで取得する。先に確定した方を使用する：

1. **UserQuery 消費ポイント** — `turn.run()` の直前に同期的に `settledAt !== null` をチェック。待機ゼロ：既に確定していれば使用、未確定ならスキップ。
2. **ToolResult 注入ポイント** — すべての ToolResult ターンで同じチェック。`requestToSend` 内の functionResponse 部分の**後に追記**される `system-reminder` としてメモリを注入し、モデルが次の応答の前にメモリコンテキストを得られるようにする（先頭ではなく末尾に追記：Qwen API では functionResponse が model の functionCall の直後に続く必要がある — 既存の `hasPendingToolCall` IDE コンテキストスキップで同じ制約がある）。

これは Claude Code 上流で使用されているパターン（`query.ts` 内の `startRelevantMemoryPrefetch` / `settledAt` ポーリング）と一致する。

---

## データ構造

### 新しい型 `MemoryPrefetchHandle`（`client.ts` 内）

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** promise.finally() により設定される。promise が確定するまで null。 */
  settledAt: number | null;
  /** メモリが注入された後に true — 二重注入を防ぐ。 */
  consumed: boolean;
  controller: AbortController;
};
```

### `GeminiClient` のフィールド変更

| 削除                                                         | 追加                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## 変更内容

### 1. `client.ts` — `resolveAutoMemoryWithDeadline` を削除

関数全体を削除する。`settledAt` フラグメカニズムに置き換える。

### 2. `client.ts` — UserQuery 実行パス

`resolveAutoMemoryWithDeadline` の呼び出しを次に置き換える：

```typescript
// 新しいハンドルをセットする前に、前の UserQuery からの実行中プレフェッチを中断する
// （呼び出しが確定する前にユーザーが再度入力した場合の、孤立したサイドクエリを防ぐ）。
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// 呼び出し元のシグナルをプレフェッチコントローラにブリッジする
// 親ターンでのユーザー中断（Ctrl-C / Esc）も呼び出しサイドクエリを終了させる。
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// await しない — すぐに続行
```

### 3. `client.ts` — UserQuery 消費ポイント（`await relevantAutoMemoryPromise` を置き換え）

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // 既に確定済み、即座に返る
  if (result.prompt) {
    // unshift（push ではない）：メモリを systemReminders の先頭に保持し、
    // UserQuery ターンで system-reminder ブロックの先頭になるようにする。
    // （ToolResult ターンでは requestToSend に追記して
    // functionCall / functionResponse のペアリングを維持する — 以下参照）。
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — ToolResult 注入ポイント（新規）

`requestToSend` が組み立てられた後、`turn.run()` の前に以下を追加：

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // 先頭ではなく追記（先頭にすると functionResponse 部分が前に来なくなる）。
      // ネイティブの Gemini パスでの functionCall/functionResponse の
      // ペアリングを壊さないようにする。
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — クリーンアップパス

ハンドルは2つの異なるメカニズムで解放される：

**5箇所の中断+クリア**（プレフェッチがまだ実行中：コントローラを中断してから参照を削除）。`pendingRecallAbortController?.abort()` + `= undefined` を次に置き換える：

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

該当箇所：`resetChat()`、`MaxSessionTurns` 早期リターン、`boundedTurns=0` 早期リターン、`SessionTokenLimitExceeded` 早期リターン、Arena 制御シグナル早期リターン。実行パス自体でも、前のプレフェッチがまだ実行中に新しい UserQuery が到着した場合、この中断+置き換えを実行する。

**2箇所のクリアのみ**（プレフェッチは既に確定しており消費中 — コントローラを中断する必要はなく、参照を削除するだけ）：

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

該当箇所：UserQuery 消費ポイント、ToolResult 注入ポイント。

### 6. `relevanceSelector.ts` — `AbortSignal.timeout(1_000)` を削除

組み合わせた `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` を削除し、`callerAbortSignal` を直接渡す。

---

## 動作比較

| シナリオ                                     | 変更前                         | 変更後                                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| モデル準備前に呼び出しが完了                 | UserQuery に注入、待機約0      | UserQuery に注入、待機約0                               |
| 呼び出しが遅い（コールドスタート）           | 最大 2.5 秒ブロック              | UserQuery をスキップ、最初の ToolResult に注入             |
| 呼び出しがタイムアウト（1秒）                | 中断、空の結果、メモリなし       | ハードタイムアウトなし；確定次第注入                |
| ツール呼び出しなし、呼び出しが遅い           | 最大 2.5 秒ブロック後スキップ   | UserQuery をスキップ、ToolResult の機会なし — 見逃し       |
| 呼び出し確定前にユーザーが2番目のメッセージ送信 | 2回目の呼び出しが1回目のハンドルと競合 | 2回目の UserQuery で新しいハンドル実行時に1回目を中断 |

---

## スコープ外

- メモリ注入形式の `system-reminder` から `tool-result` 添付への変更（CC スタイル）
- セッションごとのバイト予算スキップゲート
- 単語のみのプロンプトスキップゲート