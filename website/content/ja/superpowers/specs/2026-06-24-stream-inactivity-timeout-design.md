# 設計: OpenAI 互換パイプライン用のストリーム非アクティブタイムアウト

- **日付:** 2026-06-24
- **コンポーネント:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **ステータス:** 承認済み設計 (7回の監査完了)、TDD対応準備完了
- **スコープ:** 対策#1 + #2 のみ (ウォッチドッグ + abort + 疑似的な ETIMEDOUT)。スコープ外: UIへの終端SSEイベント(#9)、非ストリーミングパス。

## 問題点

DataAgentのインシデント (「一直运行不返回」) の根本原因は、モデルゲートウェイ (Alibaba Cloud PrivateLink → DashScope/Bailian `compatible-mode`、qwen3.7-max) がリクエストを受け付けた (HTTP 200) ものの、**何もストリーミングしなかった**ことです — SSEボディは開いたまま約595秒間沈黙し、`finish_reason` もありませんでした。

qwen-code には有効な復旧手段がありませんでした:

- OpenAIクライアントの `timeout` (`DEFAULT_TIMEOUT = 120_000`) は **リクエストレベル** (接続 + レスポンスオブジェクトの取得) です。一度 `chat.completions.create({stream:true})` が高速な200の後にストリームを返すと、`for await` 中のチャンク間非アクティブには **上限がありません**。
- 唯一の非アクティブタイマー (`loggingContentGenerator.ts` の `STREAM_IDLE_TIMEOUT_MS = 5min`) は **テレメトリのみ** — OTel スパンを閉じてリークを防ぎますが、リクエストを中止したり例外をスローしたりは**しません**。

そのため、200応答後に沈黙するストリームは、接続が切れるか30分のインタラクションTTLが切れるまでハングし、コンテンツ再試行ループ (`NO_FINISH_REASON`) はストリームが完了しないため発動しません。

## 重要な洞察

トランスポート層は本来、アイドル状態のソケットに対して `ETIMEDOUT` を生成すべきでしたが、そうなりませんでした（ソケットはデータがなくても開いたまま）。解決策は、**トランスポートが欠いている非アクティブタイムアウトを追加し、それが生成できなかった `ETIMEDOUT` を合成する**ことです。これにより、サイレントストールは実際の読み取りタイムアウトと区別できなくなり、既存の再試行/バックオフ/フォールバックスタックで処理できるようになります。

## 検証済みメカニズム (監査)

1. `pipeline.executeStream` は `perRequestAc = createChildAbortController(parentSignal)` を作成し、`perRequestAc.signal` をSDKに渡します。これが実際に fetch をキャンセルするコントローラーです。1階層上のロギングラッパーは読み取り専用の signal のみを持っているため、ウォッチドッグは **パイプライン** 内に存在する必要があります。
2. `classifyRetryError` は `isRetryAbortError` (isAbortError || name==='CanceledError') を**最初に**チェックするため、任意の abort = `{kind:'abort', diagnosis:'fail-fast'}` = **再試行不可** となります。したがって、ウォッチドッグは生の AbortError を表面化してはなりません。
3. `getTransportCode(err)` は `err.code` / `err.cause.code` を読み取ります。`Object.assign(new Error(...), {code:'ETIMEDOUT'})` のようなプレーンな割り当て → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}` となります。
4. geminiChat のストリームトランスポート再試行は、`classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` で発動します (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`)。つまり、**最初のバイト / ゼロチャンク** のタイムアウト (まさに今回のインシデント) は自動再試行され、チャンク**後**のストールはトランスポートエラーとして表面化します (再試行なし — 許容範囲)。

## 決定事項 (確定)

| 決定                         | 選択                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| タイムアウト値と設定         | 新規 `contentGenerator.streamIdleTimeoutMs`、デフォルト **120000ms** |
| タイムアウト時の動作         | **Abort + 疑似的な ETIMEDOUT** (トランスポート再試行を再利用)  |
| PRスコープ                   | **#1 + #2 のみ** (終端SSEイベントは別PR)                       |
| 5分のテレメトリアイドルタイマー | **バックストップとして維持** (変更なし)                        |

## 設計

すべての変更は `packages/core/src/core/openaiContentGenerator/` 内。

### 1. 設定

`ContentGeneratorConfig` (`contentGenerator.ts`) に `streamIdleTimeoutMs?: number` を追加します。パイプラインはこれを `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS` (`120_000`) で解決します。値が `<= 0` の場合はウォッチドッグを無効化 (パススルー) します。

### 2. 非アクティブタイムアウトジェネレーター (`pipeline.ts`)

`processStreamWithLogging` の前に、**生のSDKチャンクストリーム** をラップするプライベート非同期ジェネレーター:

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // perRequestAc を abort → ソケット解放
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
          // ユーザーキャンセルはタイムアウトの再ラベル付けより優先。
          // プレーンな Error を使用 (DOMException ではない): エラーレッドアクションは
          // Object.create(getPrototypeOf(err)) でクローンするため、DOMException を
          // 破損する (その `name` はクローンにない内部スロットゲッター)。`name ===
          // 'AbortError'` は isAbortError を満たす。
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // perRequestAc を abort → fetch が停止
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
        // 我々が abort した後、孤児となった nextPromise は AbortError で reject される;
        // 未処理のリジェクションにならないよう飲み込む。
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // チャンク到着 → 次のループで新しいタイマー開始
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // 上記の abort が重要なクリーンアップ; return の失敗は無視。
    }
  }
}
```

タイマーは**生のチャンクごとにリセットされる**ため (思考/推論デルタを含む)、思考をストリーミングする長時間思考モデルが誤って中止されることはありません。本当の沈黙 (チャンクが `idleMs` 間ない) だけがトリップします。

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

### 3. `executeStream` への組み込み

ステージ1で `stream` を作成した後、ステージ2の前にラップします。ストリーミングリクエストは常にリクエストごとのコントローラーを使用するため、呼び出し元が親シグナルを提供しなかった場合でも、ウォッチドッグはSDKリクエストを中止できます:

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

- 200応答後に沈黙 (ゼロチャンク) → `idleMs` 後: fetch を abort + ETIMEDOUT をスロー → `{transport, retryable}` → トランスポート再試行 (×2, `!streamYieldedChunk`) → 自動回復。枯渇時にはトランスポートエラーとして表面化。
- チャンク後のストール → ETIMEDOUT がスロー。`streamYieldedChunk` が true のため、トランスポート再試行は**行われない** — エラーとして表面化 (中途再生成のリスクなし)。
- アクティブなストリーム (思考含む) → タイマーは各チャンクごとにリセットされ、トリップしない。
- 親/ユーザー abort → AbortError がそのまま伝播 (フェイルファストなユーザーキャンセル)。
- 5分のテレメリアイドルタイマーは、約120秒のウォッチドッグが先行するバックストップとなり、変更なし。

## スコープ外

- 再試行枯渇時の終端 `turn_error` SSE (#9) — 別PR。
- 非ストリーミング `execute()` — 既に120秒のリクエストレベルのタイムアウトで制限済み。

## テスト (TDD)

`pipeline.test.ts` で、`vi.useFakeTimers()` と制御可能なモックストリーム (N個のチャンクを yield した後、`next()` が解決しないPromiseを返す) を使用:

1. **ゼロチャンクストール** → ストリームを消費すると、`idleMs` 経過後に `code === 'ETIMEDOUT'` のエラーで reject される。
2. **チャンク後のストール** → yield されたチャンクは通過し、その後 `code === 'ETIMEDOUT'` で reject される。
3. **アクティブストリームによるタイマーリセット** → `idleMs` 以内にチャンクが到着する場合、ウォッチドッグはトリップせず、ストリームは正常に完了する。
4. **親 abort の優先** → タイムアウト時に親シグナルが abort されている場合、エラーは ETIMEDOUT ではなく AbortError になる。
5. **`streamIdleTimeoutMs <= 0` で無効化** → ハングしたストリームはタイマー経過時にスローしない (パススルー)。
6. **カスタム `streamIdleTimeoutMs`** → 設定された値が尊重される (デフォルトではなく設定されたミリ秒でトリップする)。
7. **孤児となったSDK `next()` のリジェクション** → ウォッチドッグがリクエストを abort した後、保留中の `next()` からの後続のSDK `AbortError` リジェクションは飲み込まれ、`unhandledRejection` を発行しない。