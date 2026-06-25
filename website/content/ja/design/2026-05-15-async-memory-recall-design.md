# 非同期メモリリコール — 設計仕様

**Date:** 2026-05-15
**Status:** Approved
**Related issues:** #3761, #3759
**Related PRs:** #3814, #3866

---

## 問題

`relevanceSelector.ts` は `AbortSignal.timeout(1_000)`（#3866 で導入）を使用している。初回セッションのコールドスタート時、qwen3.5-flash の平均応答時間は約 908 ms であり、1 秒の閾値に常に到達してしまう。`resolveAutoMemoryWithDeadline` の外側にある 2.5 秒の締め切りにより、リコールが常に失敗する場合でも、各 UserQuery が最大 2.5 秒ブロックされる。

根本原因: メインエージェントのリクエストパスが、モデルへ送信する前にリコール結果を `await` している。リコールのサイドクエリが遅延すると、そのままユーザーが体感するレイテンシに直結する。

---

## 設計

### 基本コンセプト

UserQuery でリコールを起動し、`await` しない。最初に発生した以下の 2 つのタイミングで結果を消費する。

1. **UserQuery 消費ポイント** — `turn.run()` の直前で `settledAt !== null` を同期的にチェックする。待機ゼロ: すでに完了していれば使用し、そうでなければスキップ。
2. **ToolResult インジェクトポイント** — すべての ToolResult ターンで同じチェックを行う。`requestToSend` 内の functionResponse パーツの**後ろに追加**する形で、メモリを `system-reminder` としてインジェクトし、モデルが次のレスポンスを生成する前にメモリのコンテキストを提供する。（前置きではなく追加: Qwen API では functionResponse がモデルの functionCall の直後に続く必要があるため — 同じ制約については既存の `hasPendingToolCall` IDE コンテキストスキップも参照。）

このパターンは Claude Code の上流実装（`query.ts` 内の `startRelevantMemoryPrefetch` / `settledAt` ポーリング）と同一である。

---

## データ構造

### 新しい型 `MemoryPrefetchHandle`（`client.ts` 内）

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** promise.finally() によってセットされる。promiseが解決するまで null。 */
  settledAt: number | null;
  /** メモリがインジェクト済みの場合 true — 二重インジェクトを防止する。 */
  consumed: boolean;
  controller: AbortController;
};
```

### `GeminiClient` のフィールド変更

| 削除                                                         | 追加                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## 変更内容

### 1. `client.ts` — `resolveAutoMemoryWithDeadline` を削除

この関数を完全に削除する。`settledAt` フラグの仕組みに置き換えられる。

### 2. `client.ts` — UserQuery 起動パス

`resolveAutoMemoryWithDeadline` の呼び出しを以下に置き換える:

```typescript
// 新しいハンドルをセットする前に、前回の UserQuery から飛行中のプリフェッチを
// アボートする（ユーザーがリコール完了前に再入力した場合に孤立したサイドクエリを防ぐ）。
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// 呼び出し元のシグナルをプリフェッチコントローラーにブリッジして、
// 親ターンでのユーザーアボート（Ctrl-C / Esc）でリコールのサイドクエリも終了させる。
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
// await しない — 即座に続行する
```

### 3. `client.ts` — UserQuery 消費ポイント（`await relevantAutoMemoryPromise` の置き換え）

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // すでに完了済みのため即座に返る
  if (result.prompt) {
    // push ではなく unshift: UserQuery ターンでは system-reminder ブロックの
    // 先頭にメモリを配置するため。（ToolResult ターンでは functionCall /
    // functionResponse のペアリングを維持するために requestToSend に追加する
    // — 下記参照。）
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — ToolResult インジェクトポイント（新規）

`requestToSend` が組み立てられた後、`turn.run()` の前に以下を追加する:

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
      // functionResponse パーツを先頭に保ちつつ、モデルの
      // functionCall/functionResponse ペアリングをネイティブ Gemini パスで
      // 壊さないように追加（前置きではなく末尾に追加）する。
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — クリーンアップパス

ハンドルは 2 種類の異なる仕組みによって解放される:

**アボートしてクリアする 5 箇所**（プリフェッチがまだ保留中の場合、参照を破棄する前にコントローラーをアボートする）。`pendingRecallAbortController?.abort()` と `= undefined` を以下に置き換える:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

対象箇所: `resetChat()`、`MaxSessionTurns` の早期リターン、`boundedTurns=0` の早期リターン、`SessionTokenLimitExceeded` の早期リターン、Arena コントロールシグナルの早期リターン。また、起動パス自体も、前回のプリフェッチが飛行中に新しい UserQuery が到着した際にアボート後置換を行う。

**クリアのみの 2 箇所**（プリフェッチはすでに完了しており消費中 — アボートするコントローラーはなく、参照を破棄するだけ）:

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

対象箇所: UserQuery 消費ポイント、ToolResult インジェクトポイント。

### 6. `relevanceSelector.ts` — `AbortSignal.timeout(1_000)` を削除

`AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` の組み合わせを削除し、`callerAbortSignal` を直接渡す。

---

## 動作比較

| シナリオ                                       | 変更前                              | 変更後                                                         |
| ---------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| モデル準備前にリコールが完了する場合           | UserQuery でインジェクト、待機なし  | UserQuery でインジェクト、待機なし                             |
| リコールが遅い場合（コールドスタート）         | 最大 2.5 秒ブロック                 | UserQuery をスキップ、最初の ToolResult でインジェクト         |
| リコールがタイムアウトする場合（1 秒）         | アボート、空の結果、メモリなし      | ハードタイムアウトなし、完了次第インジェクト                   |
| ツール呼び出しなし、リコールが遅い場合         | 最大 2.5 秒ブロック後スキップ       | UserQuery をスキップ、ToolResult の機会もなし — 見逃し         |
| リコール完了前にユーザーが 2 通目を送信した場合 | 2 通目のリコールが 1 通目と競合     | 2 通目の UserQuery が新しいハンドルを起動すると 1 通目をアボート |

---

## スコープ外

- メモリインジェクトのフォーマットを `system-reminder` から `tool-result` アタッチメント（CC スタイル）に変更すること
- セッションごとのバイト予算スキップゲート
- 単語 1 語のプロンプトスキップゲート
