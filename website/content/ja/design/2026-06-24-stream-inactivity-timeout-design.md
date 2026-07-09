# 設計: OpenAI 互換パイプラインのストリーミング非アクティブタイムアウト

- **日付:** 2026-06-24
- **コンポーネント:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **ステータス:** 承認済み設計（7回の監査済み）、TDD 準備完了
- **スコープ:** 対策 #1 + #2 のみ（ウォッチドッグ + abort + 合成 ETIMEDOUT）。スコープ外: UI へのターミナル SSE イベント (#9)、非ストリーミングパス。

## 問題

DataAgent のインシデント（「ずっと実行されて戻ってこない」）の根本原因は、モデルゲートウェイ（Aliyun PrivateLink → DashScope/Bailian `compatible-mode`、qwen3.7-max）がリクエストを受け入れた（HTTP 200）後、**何もストリーミングしなかった**ことにある。SSE ボディは約 595 秒間オープンかつサイレントなままで `finish_reason` が返ってこなかった。

qwen-code には効果的なリカバリがなかった:

- OpenAI クライアントの `timeout`（`DEFAULT_TIMEOUT = 120_000`）は**リクエストレベル**（接続 + レスポンスオブジェクトの取得）である。`chat.completions.create({stream:true})` が高速な 200 の後にストリームを返すと、`for await` 中のチャンク間の非アクティブ時間は**無制限**になる。
- 唯一の非アクティブタイマー（`loggingContentGenerator.ts` の `STREAM_IDLE_TIMEOUT_MS = 5min`）は**テレメトリ専用**である。これは OTel スパンをクローズしてリークを防ぐだけで、リクエストを abort したりスローしたりは**しない**。

その結果、200 を返した後のサイレントなストリームは、接続が切断されるか 30 分のインタラクション TTL に達するまでハングし、ストリームが完了しないため content-retry ループ（`NO_FINISH_REASON`）も機能しなかった。

## 重要な洞察

トランスポート層はアイドルソケットで `ETIMEDOUT` を生成する**べき**だったが、そうならなかった（ソケットはデータなしでオープンなままだった）。修正方法は、**トランスポートに欠けている非アクティブタイムアウトを追加し、トランスポートが出力に失敗した `ETIMEDOUT` を合成する**ことである。これにより、サイレントなストールを既存のリトライ/バックオフ/フォールバックスタックがすでに処理している実際の読み取りタイムアウトと区別できないようにする。

## 検証済みのメカニズム（監査）

1. `pipeline.executeStream` は `perRequestAc = createChildAbortController(parentSignal)` を作成し、`perRequestAc.signal` を SDK に渡す。これが実際に fetch をキャンセルするコントローラーである。1つ上のレイヤーの logging ラッパーは読み取り専用のシグナルしか持たないため、ウォッチドッグは**パイプライン**内に存在する必要がある。
2. `classifyRetryError` はまず `isRetryAbortError`（`isAbortError || name==='CanceledError'`）をチェックする → 任意の abort は `{kind:'abort', diagnosis:'fail-fast'}` = **リトライ不可**となる。したがって、ウォッチドッグは生の AbortError を表面化させては**ならない**。
3. `getTransportCode(err)` は `err.code` / `err.cause.code` を読み取る。単純な `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}` となる。
4. geminiChat の stream-transport-retry は `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk`（`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`）のときに発火する。したがって、**最初のバイト / ゼロチャンク**のタイムアウト（まさにインシデントと同じ状況）は自動リトライされ、チャンク**後**のストールはトランスポートエラーとして表面化する（リトライなし — 許容される）。

## 決定事項（ロック済み）

| 決定事項 | 選択 |
| --- | --- |
| タイムアウト値と設定 | 新しい `contentGenerator.streamIdleTimeoutMs`、デフォルト **120000ms** |
| タイムアウト時 | **Abort + 合成 ETIMEDOUT**（トランスポートリトライを再利用） |
| PR のスコープ | **#1 + #2 のみ**（ターミナル SSE イベントは別の PR） |
| 5分のテレメトリアイドルタイマー | **バックストップとして保持**（変更なし） |

## 設計

すべての変更は `packages/core/src/core/openaiContentGenerator/` 内で行う。

### 1. 設定

`ContentGeneratorConfig`（`contentGenerator.ts`）に `streamIdleTimeoutMs?: number` を追加する。パイプラインはこれを `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`（`120_000`）として解決する。値が `<= 0` の場合、ウォッチドッグは無効化される（パススルー）。

### 2. 非アクティブタイムアウトジェネレーター（`pipeline.ts`）

プライベートな非同期ジェネレーターが、`processStreamWithLogging` の前に**生の SDK チャンクストリーム**をラップする:

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborts perRequestAc → frees the socket
  parentSignal: AbortSignal | undefined,
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const it = source[Symbol.asyncIterator]();
  const streamStartedAt = Date.now();
  let chunksReceived = 0;
  try {
    while (true) {
      const nextPromise = it.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // User cancel takes precedence over our timeout relabel.
          // Use a plain Error (NOT DOMException): error redaction clones via
          // Object.create(getPrototypeOf(err)), which corrupts a DOMException
          // (its `name` is an internal-slot getter the clone lacks). `name ===
          // 'AbortError'` satisfies isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // abort perRequestAc → fetch tears down
            reject(
              new StreamInactivityTimeoutError(
                idleMs,
                chunksReceived,
                Date.now() - streamStartedAt,
              ),
            ); // code: 'ETIMEDOUT'
          }
        }, idleMs);
        timer.unref?.();
      });
      let result: IteratorResult<OpenAI.Chat.ChatCompletionChunk>;
      try {
        result = await Promise.race([nextPromise, timeout]);
      } catch (err) {
        // After we abort, the orphaned nextPromise rejects with AbortError;
        // swallow it so it is not an unhandled rejection.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // a chunk arrived → next loop starts a fresh timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // The abort above is the cleanup that matters; ignore return failures.
    }
  }
}
```

タイマーは**生のチャンクごと**（thinking/reasoning のデルタを含む）にリセットされるため、reasoning をストリーミングする長時間思考モデルが誤って abort されることはない。真のサイレント状態（`idleMs` 間チャンクなし）のみがトリガーとなる。

```ts
class StreamInactivityTimeoutError extends Error {
  readonly code = 'ETIMEDOUT' as const;

  constructor(
    readonly idleMs: number,
    readonly chunksReceived: number,
    readonly streamLifetimeMs: number,
  ) {
    super(`No stream activity for ${idleMs}ms (inactivity timeout)`);
    this.name = 'StreamInactivityTimeoutError';
  }
}
```

### 3. `executeStream` での配線

Stage 1 が `stream` を作成した後、Stage 2 の前にそれをラップする。ストリーミングリクエストは常にリクエストごとのコントローラーを使用するため、呼び出し元が親シグナルを提供していない場合でも、ウォッチドッグは SDK リクエストを abort できる:

```ts
const idleMs =
  this.contentGeneratorConfig.streamIdleTimeoutMs ??
  DEFAULT_STREAM_IDLE_TIMEOUT_MS;
const guarded =
  idleMs > 0
    ? withStreamInactivityTimeout(
        stream,
        idleMs,
        () => perRequestAc.abort(),
        parentSignal,
      )
    : stream;
// ...processStreamWithLogging(guarded, context, request) as today,
// keeping the existing drainThenCleanup wrapper.
```

## 変更後の動作

- 200 の後のサイレント（ゼロチャンク） → `idleMs` 経過後: fetch を abort + `ETIMEDOUT` をスロー → `{transport, retryable}` → トランスポートリトライ（×2、`!streamYieldedChunk`） → 自動リカバリ。リトライ枯渇時はトランスポートエラーとして表面化。
- いくつかのチャンク後のストール → `ETIMEDOUT` がスローされる。`streamYieldedChunk` が true のためトランスポートリトライは**されず**、エラーとして表面化する（リスクを伴う生成途中のリプレイなし）。
- アクティブなストリーム（thinking を含む） → チャンクごとにタイマーがリセットされ、トリガーされない。
- 親/ユーザーによる abort → `AbortError` が変更なく伝播される（fail-fast なユーザーキャンセル）。
- 5分のテレメトリアイドルタイマーは、約 120 秒のウォッチドッグが優先するバックストップとなり、変更されないまま残る。

## スコープ外

- リトライ枯渇時のターミナル `turn_error` SSE (#9) — 別の PR。
- 非ストリーミングの `execute()` — すでに 120 秒のリクエストレベルタイムアウトで制限されている。

## テスト（TDD）

`pipeline.test.ts` 内で、`vi.useFakeTimers()` と制御可能なモックストリーム（N 個のチャンクを yield した後、`next()` が決して解決されない promise を返す）を使用する:

1. **ゼロチャンクのストール** → `idleMs` を進めた後、ストリームを消費すると `code === 'ETIMEDOUT'` のエラーで reject される。
2. **チャンク後のストール** → yield されたチャンクが通過した後、`code === 'ETIMEDOUT'` で reject される。
3. **アクティブなストリームがタイマーをリセット** → `idleMs` 以内に到着するチャンクはウォッチドッグをトリガーせず、ストリームは正常に完了する。
4. **親 abort の優先** → タイムアウト時に親シグナルが abort されている場合、エラーは `ETIMEDOUT` ではなく `AbortError` になる。
5. **`streamIdleTimeoutMs <= 0` の場合無効** → ハングするストリームはタイマー進行時にスローしない（パススルー）。
6. **カスタム `streamIdleTimeoutMs`** → 設定された値が尊重される（デフォルトではなく、設定された ms でトリガーされる）。
7. **孤立した SDK `next()` の reject** → ウォッチドッグがリクエストを abort した後、保留中の `next()` からの後続の SDK `AbortError` reject は飲み込まれ、`unhandledRejection` を出力しない。