# 自動圧縮閾値リデザイン実装計画

> **エージェントワーカーへ:** 必須のサブスキル：`superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使用して、この計画をタスクごとに実装すること。ステップはチェックボックス（`- [ ]`）構文で追跡する。

**目標：** Qwen Code の自動圧縮における単一の割合ベースの閾値（70%）を、「割合 + 絶対」のハイブリッドな3層閾値ラダー（warn / auto / hard）にアップグレードする。同時に、圧縮呼び出し自体に `maxOutputTokens` 上限を設定し、思考を無効化し、障害サーキットブレーカを導入し、`lastPromptTokenCount` の遅延/初回ギャップを修正し、ユーザー設定面を整理する。

**アーキテクチャ:**

- `chatCompressionService.ts` に `computeThresholds(window)` を新規追加し、`{ warn, auto, hard }` を出力する。cheap-gate は `auto` を使用し、`sendMessageStream` エントリポイントに hard を追加して能動的に救済する。
- `tokenEstimation.ts` を新規作成し、ローカルの char/4 推定関数を提供する。これにより `lastPromptTokenCount` の「1ターンの遅延 + 初回が0」という2つのギャップを補償する。
- 障害処理を `hasFailedCompressionAttempt: boolean` の単一ロックから `consecutiveFailures: number` の3回サーキットブレーカにアップグレードする。
- 圧縮 sideQuery 呼び出しで思考をオフにし、`maxOutputTokens: 20K` を追加する。
- `chatCompression.contextPercentageThreshold` 設定フィールドを削除し、起動時に古い設定を検出した場合は stderr に警告を出力して無視する。
- `tipRegistry.ts` の3つの context-* ヒントを新しい閾値に追従するように書き換える。`/context` コマンドで3層の数値を表示する。

**技術スタック:** TypeScript, Vitest, `@google/genai`, 既存の `compactionInputSlimming` 推定ツール。

**マージ順序：** P6 → P7 → P1 → P2 → P4 → P3 → P5。各タスクは単一 PR の候補となる。

---

## ファイル構造

| パス                                                        | 操作      | 責任                                                                                        |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `packages/core/src/services/tokenEstimation.ts`             | 作成      | 文字ベースのトークン推定 + `estimatePromptTokens` エントリポイント                            |
| `packages/core/src/services/tokenEstimation.test.ts`        | 作成      | 推定関数の単体テスト                                                                          |
| `packages/core/src/services/chatCompressionService.ts`      | 変更      | 新しい定数 + `computeThresholds` の追加。cheap-gate を変更。思考をオフ + maxOutput を追加。障害カウントを変更。 |
| `packages/core/src/services/chatCompressionService.test.ts` | 変更      | computeThresholds の単体テスト + cheap-gate / sideQuery 設定のアサーション                    |
| `packages/core/src/core/geminiChat.ts`                      | 変更      | `sendMessageStream` エントリポイントに hard チェックを追加。`hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                 | 変更      | hard トリガー + サーキットブレーカ + 初回カバレッジの統合テスト                                 |
| `packages/core/src/config/config.ts`                        | 変更      | `ChatCompressionSettings` から `contextPercentageThreshold` を削除。起動時の警告              |
| `packages/cli/src/services/tips/tipRegistry.ts`             | 変更      | 3つの context-* ヒントを閾値の絶対比較に変更。`TipContext` に `thresholds` を追加               |
| `packages/cli/src/services/tips/tipRegistry.test.ts`        | 作成/変更 | ヒントのトリガー区間テスト                                                                    |
| `packages/cli/src/ui/commands/contextCommand.ts`            | 変更      | 新しい3層閾値を表示                                                                         |
| `packages/cli/src/ui/commands/contextCommand.test.ts`       | 変更      | 出力スナップショット                                                                        |
| `packages/cli/src/ui/AppContainer.tsx`                      | 変更      | `TipContext` 構築時に `thresholds` を注入                                                    |

---

## Phase P6 — 圧縮 sideQuery の思考オフ + maxOutputTokens 追加

最初の実装。これにより、後続の閾値の前提が信頼できるものになる。独立した PR。

### Task 1: chatCompressionService の sideQuery 呼び出しを変更

**ファイル:**

- 変更: `packages/core/src/services/chatCompressionService.ts:374-376`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`chatCompressionService.test.ts` の上部 import セクションに spy 用のエントリポイントを追加し、適切な describe 内にテストを追加する。`runSideQuery` はすでにモジュールエクスポートされているので、spyOn できる：

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery config', () => {
  it('passes maxOutputTokens=20_000 and includeThoughts=false to runSideQuery', async () => {
    const spy = vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>summary</state_snapshot>',
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
    } as any);

    const service = new ChatCompressionService();
    await service.compress(makeFakeChat(), {
      promptId: 'p',
      force: true,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 180_000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0]![1];
    expect(callArg.config?.thinkingConfig?.includeThoughts).toBe(false);
    expect(callArg.config?.maxOutputTokens).toBe(20_000);
  });
});
```

`makeFakeChat` / `makeFakeConfig` は既存のテストヘルパーを再利用する（ファイル内にすでにあればそのまま使い、なければインラインで最小限のスタブを作成する）。

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'passes maxOutputTokens=20_000'
```

期待結果: FAIL — 現在は `{ thinkingConfig: { includeThoughts: true } }` が渡されており、`maxOutputTokens` がない。

- [ ] **Step 3: 実装 — chatCompressionService.ts を修正**

[chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) の `config:` ブロック全体を置き換える：

```ts
const summaryResult = await runSideQuery(config, {
  purpose: 'chat-compression',
  model,
  maxAttempts: 1,
  systemInstruction: getCompressionPrompt(),
  contents: [
    ...slim.slimmedHistory,
    {
      role: 'user',
      parts: [
        {
          text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
        },
      ],
    },
  ],
  // 圧縮出力は maxOutputTokens で制限され、プロバイダ間で予測可能なリザーブを保証する
  // （docs/design/auto-compaction-threshold-redesign.md 参照）。
  // 思考は無効化されている。プロバイダごとの思考予算のセマンティクスが
  // 一貫していないため（Anthropic/OpenAI は別枠でカウント、Gemini はモデルによって異なる）。
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

ファイル上部の定数領域（`TOOL_ROUND_RETAIN_COUNT` の直後）に以下を追加：

```ts
/**
 * 圧縮 sideQuery 出力（思考が無効化されているためサマリテキストのみ）のハードキャップ。
 * claude-code の MAX_OUTPUT_TOKENS_FOR_SUMMARY (autoCompact.ts:30) に倣い、
 * 実際の圧縮出力の p99.99 に基づいている。
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

同時に `compress()` 内の token math セクション（約 line 436-437）の `"may include non-persisted tokens (thoughts)"` というコメントを修正する — 現在は thinking 出力が存在しないため、「compressionOutputTokenCount reflects the summary tokens only since thinking is disabled」に変更する。

- [ ] **Step 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期待結果: PASS（新テスト + 既存テストがリグレッションしないこと）

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

期待結果: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 圧縮 sideQuery 出力にキャップを設定し、思考を無効化

COMPACT_MAX_OUTPUT_TOKENS=20_000 を追加し、runSideQuery 呼び出しに
maxOutputTokens を渡し、thinkingConfig.includeThoughts を無効化。
claude-code の autoCompact リザーブに合わせることで、下流の閾値ラダー
(P1/P3) がプロバイダ間（Anthropic/OpenAI/Gemini は思考予算を一貫して
扱わない）でサマリ出力に予測可能な上限を頼りにできるようにする。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P7 — トークン推定による補償

`lastPromptTokenCount` の遅延/初回ギャップを修正する。3つの Task。

### Task 2: tokenEstimation.ts ユニットを新規作成

**ファイル:**

- 作成: `packages/core/src/services/tokenEstimation.ts`
- 作成: `packages/core/src/services/tokenEstimation.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/src/services/tokenEstimation.test.ts`：

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import {
  estimateContentTokens,
  estimatePromptTokens,
} from './tokenEstimation.js';

const textContent = (text: string): Content => ({
  role: 'user',
  parts: [{ text }],
});

describe('estimateContentTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('estimates plain text at ~chars/4', () => {
    // "hello world" = 11 chars → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('sums tokens across multiple messages', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('estimates inlineData via imageTokenEstimate', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('estimates functionCall (json-dense) at ~chars/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars で文字列化される。結果の JSON は短いが、
    // 比率（chars/2）により chars/4 パスよりも大きくなるはず。
    const result = estimateContentTokens([c]);
    expect(result).toBeGreaterThan(0);
  });
});

describe('estimatePromptTokens', () => {
  const history: Content[] = [
    textContent('older message a'),
    textContent('older message b'),
  ];
  const user = textContent('current user message');

  it('uses lastPromptTokenCount + user-message estimate when count > 0', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('falls back to full estimate when lastPromptTokenCount is 0', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

期待結果: FAIL — `tokenEstimation.ts` がまだ作成されていない。

- [ ] **Step 3: 実装 — tokenEstimation.ts を新規作成**

`packages/core/src/services/tokenEstimation.ts`：

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  DEFAULT_IMAGE_TOKEN_ESTIMATE,
  estimateContentChars,
} from './compactionInputSlimming.js';

/**
 * 文字ベースのトークン推定のための平均バイト/トークン。
 * claude-code の roughTokenCountEstimation デフォルト（tokens.ts）に準拠。
 */
const BYTES_PER_TOKEN = 4;

/**
 * Content オブジェクトのリストのトークン数を char/4 で推定する。
 *
 * `estimateContentChars` を再利用するため、inlineData / functionCall /
 * functionResponse は圧縮分割ポイントの計算時と同じ処理を受ける。
 * これにより、自動圧縮トリガーとスプリッターの間でサイズ認識の不一致を防ぐ。
 *
 * 送信前の閾値ゲートのみを対象とする。char/4 は控えめな下限値であり
 * （実際のトークナイザは ±30% 変動する）、これを使用して圧縮をトリガーする
 * （false-positive）のは安全だが、圧縮をスキップするために使用するのは
 * 安全ではない。
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  let totalChars = 0;
  for (const content of contents) {
    totalChars += estimateContentChars(content, imageTokenEstimate);
  }
  return Math.ceil(totalChars / BYTES_PER_TOKEN);
}

/**
 * 自動圧縮ゲートのための実効プロンプトトークン数を計算する。
 *
 * `lastPromptTokenCount`（前のターンの使用量メタデータからの値）には
 * 2つの不足がある：現在のユーザーメッセージと、初回送信時の初期値。
 * このヘルパーはローカル推定で両方のギャップを埋める。
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  if (lastPromptTokenCount > 0) {
    return (
      lastPromptTokenCount +
      estimateContentTokens([userMessage], imageTokenEstimate)
    );
  }
  return estimateContentTokens([...history, userMessage], imageTokenEstimate);
}
```

- [ ] **Step 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

期待結果: PASS

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 圧縮ゲート用のトークン推定ヘルパーを追加

estimateContentTokens / estimatePromptTokens を導入。既存の
estimateContentChars (compactionInputSlimming) を char/4 比率で
除算して構築。cheap-gate およびハード閾値チェックで生の
lastPromptTokenCount を置き換え、システムが (a) 現在のユーザー
メッセージと (b) 初回送信（API 報告カウントが0の場合）に
反応できるようにする。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: chatCompressionService の cheap-gate で推定を適用

**ファイル:**

- 変更: `packages/core/src/services/chatCompressionService.ts`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

本 Task は P1 の前に実装されるため、**既存の** `threshold * contextLimit` 式（70% * 200K = 140K）を使用し、`originalTokenCount` を `estimatePromptTokens(...)` に置き換える：

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress cheap-gate uses estimated tokens', () => {
  it('triggers compaction when API-reported tokens are below threshold but estimated tokens with the pending user message exceed it', async () => {
    // 200K ウィンドウの現在の閾値 = 0.7 * 200K = 140K
    // originalTokenCount = 135K（あと5K）
    // ユーザーメッセージ推定 ~10K → 145K、140K を超過
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K chars ≈ 10K tokens
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // runSideQuery をモックして compress の後続ステップが失敗しないようにする
    vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>x</state_snapshot>',
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    } as any);

    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 135_000,
      pendingUserMessage: userMessage,
    });
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });

  it('NOOPs when neither originalTokenCount nor estimated total reaches threshold', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 80_000,
      pendingUserMessage: {
        role: 'user',
        parts: [{ text: 'short' }],
      },
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });
});
```

`makeFakeChat({ historyChars })` はテストファイル内のインラインヘルパーである。`GeminiChat` のスタブを構築し、`getHistory()` が `historyChars` に近い長さの Content 配列を返すようにする（ファイルに既存のヘルパーがあればそれを再利用する）。

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses estimated tokens'
```

期待結果: FAIL — 現在の cheap-gate は `originalTokenCount` のみを見ており、NOOP と判定する。

- [ ] **Step 3: 実装 — compress() の cheap-gate を修正**

[chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) のこのブロックを修正する：

```ts
// 強制圧縮ではなく、かつ制限以下の場合は圧縮しない。これが
// 毎回の送信時の定常状態パスであり、以下の完全な
// `getHistory(true)` クローンのコストを支払う前に終了したい。
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < threshold * contextLimit) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

`CompressOptions` インターフェース（[:172-196](packages/core/src/services/chatCompressionService.ts:172)）に新しいフィールドを追加：

```ts
export interface CompressOptions {
  // ... 既存のフィールド ...
  /**
   * 送信予定のユーザーメッセージ。存在する場合、cheap-gate はその
   * 推定トークン数を `originalTokenCount`（前のターンの API 使用量のみを
   * 反映）に加算し、ゲートが実際のプロンプトサイズを認識できるようにする。
   * ユーザーメッセージを手元に持たない呼び出し元（例：手動 /compress force=true パス）
   * との後方互換性のためにオプション。
   */
  pendingUserMessage?: Content;
}
```

インポートを追加：`import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **Step 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期待結果: PASS

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): ユーザーメッセージ保留中に cheap-gate が推定トークンを使用

CompressOptions に `pendingUserMessage` を追加し、自動圧縮 cheap-gate
で estimatePromptTokens に渡すようにした。閾値チェックが送信直前の
ユーザーメッセージを考慮できていなかった「1ターンの遅延」ギャップを
解消。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: geminiChat の sendMessageStream エントリポイントで pendingUserMessage を透過的に渡す

**ファイル:**

- 変更: `packages/core/src/core/geminiChat.ts`
- 変更: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/src/core/geminiChat.test.ts` に追加：

```ts
describe('sendMessageStream first-turn estimation', () => {
  it('triggers auto-compaction on the very first send when inherited history is huge', async () => {
    // サブエージェントが大きな履歴を継承する / --continue シナリオをシミュレート：
    // lastPromptTokenCount = 0 だが、履歴はすでに auto 閾値に近い
    const chat = makeChatWithLargeInheritedHistory(/* ~150K chars相当 */);
    expect(chat.getLastPromptTokenCount()).toBe(0);

    const mockGen = mockContentGeneratorWithUsage({
      totalTokenCount: 80_000,
    });
    chat.setContentGenerator(mockGen);

    const stream = await chat.sendMessageStream(
      'qwen-test',
      { message: 'next user prompt' },
      'prompt-1',
    );
    // ストリームの最初のイベントを収集。COMPRESSED であるべき
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
ヘルパー `makeChatWithLargeInheritedHistory` をテストファイル内でインライン化：`GeminiChat` を構築し、`history` に 1500 個の単純な user/model content（各 100 chars、合計約 150K chars）を格納。

- [ ] **ステップ 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

期待結果: FAIL — 現在の `tryCompress` は `lastPromptTokenCount = 0` を使用しており、cheap-gate が NOOP と判定する。

- [ ] **ステップ 3: 実装 — sendMessageStream と tryCompress を変更**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) を次のように変更:

```ts
compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  false,
  params.config?.abortSignal,
  {
    pendingUserMessage: createUserContent(params.message),
  },
);
```

`tryCompress` 関数シグネチャ（約 [:460-478](packages/core/src/core/geminiChat.ts:460)）の `options` インターフェース `TryCompressOptions` に以下を追加:

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← 新規追加
}
```

`pendingUserMessage` を `service.compress` に透過的に渡す:

```ts
const { newHistory, info } = await service.compress(this, {
  // ... 既存のフィールド ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **ステップ 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

期待結果: PASS

- [ ] **ステップ 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **ステップ 6: コミット**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): sendMessageStream から tryCompress に pendingUserMessage を渡す

継承履歴後の初回送信時に lastPromptTokenCount が 0 となり、
cheap-gate が常に NOOP となる問題を解決。
estimatePromptTokens は、ユーザーメッセージが提供された場合、
そのケースで全履歴推定にフォールバックする。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## フェーズ P1 — 3 層しきい値定数 + computeThresholds + cheap-gate

### タスク 5: 定数と computeThresholds 関数の追加

**ファイル:**

- 変更: `packages/core/src/services/chatCompressionService.ts`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **ステップ 1: 失敗するテストを記述**

`chatCompressionService.test.ts` に以下を追加:

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('32K ウィンドウ — 全階層で比例フォールバック、hard は auto に劣化', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(window-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('128K ウィンドウ — 混合（warn=割合、auto/hard=絶対値）', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (割合が勝ち: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // 絶対値: window-33K (絶対値が勝ち: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // 絶対値: window-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('200K ウィンドウ — 絶対値が全階層を支配', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // 絶対値: auto-20K (絶対値が勝ち: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // 絶対値: 200K-33K
    expect(t.hard).toBe(177_000); // 絶対値: 200K-23K
  });

  it('1M ウィンドウ — 完全に絶対値', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('極端に小さいウィンドウ (10K) でもクラッシュせず、妥当な値を返す', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('しきい値は常に warn <= auto <= hard を満たす', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

期待結果: FAIL — `computeThresholds` が存在しない。

- [ ] **ステップ 3: 実装 — 定数と関数を追加**

[chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) の定数領域（`COMPACT_MAX_OUTPUT_TOKENS` の直後）に以下を追加:

```ts
/**
 * デフォルトの比例自動圧縮しきい値（従来のセマンティクスを
 * 小ウィンドウのフォールバック/セーフティネットとして保持）。
 */
export const DEFAULT_PCT = 0.7;

/**
 * Warn 階層の比例オフセット: warn-pct = PCT - WARN_PCT_OFFSET (= 0.6)。
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * 圧縮出力用に予約するトークン予算。COMPACT_MAX_OUTPUT_TOKENS に一致。
 * 思考が無効（タスク 1 参照）のため、maxOutputTokens が要約出力のハード制限となる。
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** auto しきい値と effectiveWindow の間の距離。 */
export const AUTOCOMPACT_BUFFER = 13_000;

/** warn しきい値と auto しきい値の間の距離。 */
export const WARN_BUFFER = 20_000;

/** hard しきい値と effectiveWindow の間の距離（claude-code の MANUAL_COMPACT_BUFFER）。 */
export const HARD_BUFFER = 3_000;

/** 自動圧縮の連続失敗サーキットブレーカー。 */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** UI の warn 階層がトリガーされるトークン数。 */
  warn: number;
  /** 自動圧縮がトリガーされるトークン数。 */
  auto: number;
  /** 自動圧縮が強制されるトークン数（失敗カウンターをリセット）。 */
  hard: number;
  /** ウィンドウから SUMMARY_RESERVE を差し引いた値。入力 + 要約に使用可能な予算。 */
  effectiveWindow: number;
}

/**
 * 与えられたコンテキストウィンドウに対して 3 階層しきい値ラダーを計算する。
 *
 * 各階層は `max(比例, 絶対値)` で決定:
 *   auto  = max(PCT * window,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * window, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // 小ウィンドウでは hard は auto に劣化
 *
 * 小ウィンドウ（絶対値ブランチが負になる場合）は自動的に比例ブランチにフォールバックする。
 * 大ウィンドウでは絶対値ブランチが支配的となり、無駄な予約をウィンドウの 30% ではなく約 33K に制限する。
 */
export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto);

  return { warn, auto, hard, effectiveWindow };
}
```

- [ ] **ステップ 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期待結果: PASS

- [ ] **ステップ 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **ステップ 6: コミット**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 3 階層圧縮ラダーのための computeThresholds を追加

比例フォールバック（小ウィンドウ）と絶対値予約（大ウィンドウ）を
組み合わせた warn/auto/hard しきい値を導入。
docs/design/auto-compaction-threshold-redesign.md の計算式に準拠。
32K/128K/200K/1M/極端小ウィンドウを網羅した完全カバレッジの純粋関数。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### タスク 6: cheap-gate を computeThresholds.auto に切り替え

**ファイル:**

- 変更: `packages/core/src/services/chatCompressionService.ts`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **ステップ 1: 失敗するテストを記述**

```ts
describe('compress cheap-gate が computeThresholds.auto を使用する', () => {
  it('200K ウィンドウ、originalTokenCount=160K の場合、NOOP（auto=167K 未満）', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 160_000,
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });

  it('200K ウィンドウ、originalTokenCount=168K の場合、ゲート通過', async () => {
    // 168K > 167K (auto)、cheap-gate 通過、curatedHistory フェーズへ
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // 実際の結果はモックされた sideQuery に依存。cheap-gate による早期 NOOP ではないことのみ確認
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses computeThresholds'
```

期待結果: FAIL — 現在のしきい値は `threshold * contextLimit = 0.7 * 200K = 140K` なので、160K は既に 140K を超えて cheap-gate 通過（アサーション①に違反）。168K も同様。

- [ ] **ステップ 3: 実装 — cheap-gate の計算式を切り替え**

[chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) の `if (!force) { ... }` ブロックを変更:

```ts
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const { auto } = computeThresholds(contextLimit);
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < auto) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

同時に [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214) の `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;` を削除。これにより `threshold` は cheap-gate で使用されなくなる。また line 221 の `threshold <= 0` ブランチも削除（暗黙的な無効化セマンティクスは P4 で詳細に対応）。

- [ ] **ステップ 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期待結果: PASS

- [ ] **ステップ 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **ステップ 6: コミット**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate が computeThresholds.auto を使用する

従来の `threshold * contextLimit` 計算式を computeThresholds.auto に
置き換え。比例フォールバックと絶対値予約を組み合わせる。
大ウィンドウ（>=128K）では、ゲートは 70% より遅くトリガーされるが、
固定約 33K を予約し、従来の式が無駄にしていた数万トークンの
コンテキストを解放する。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## フェーズ P2 — 失敗処理のアップグレード（1 回ロック → 3 回サーキットブレーカー）

### タスク 7: hasFailedCompressionAttempt → consecutiveFailures

**ファイル:**

- 変更: `packages/core/src/core/geminiChat.ts`
- 変更: `packages/core/src/services/chatCompressionService.ts`
- 変更: `packages/core/src/core/geminiChat.test.ts`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **ステップ 1: 失敗するテストを記述**

`geminiChat.test.ts`:

```ts
describe('圧縮失敗サーキットブレーカー', () => {
  it('2 回連続失敗を許容し、3 回目は NOOP する', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // 3 回連続失敗をトリガー:
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // 試行 1 失敗
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // 試行 2 失敗
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // 試行 3 は NOOP されるべき
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // service.compress が 3 回目はまったく呼ばれないことを確認（サーキットブレーカーが cheap-gate で NOOP）
    expect(getCompressCallCount()).toBe(2);
  });

  it('強制圧縮成功時にカウンターをリセットする', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // 失敗
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // 失敗
    // ユーザー手動 /compress
    await chat.tryCompress('p3', 'm', /* force */ true);
    // サーキットブレーカーはリセットされたはず
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'circuit breaker'
```

期待結果: FAIL — 現在は 1 回失敗で永久ロック。2 回目の send は既に cheap-gate で NOOP、3 回目も NOOP。しかしアサーション②では force 後に回復し、sendMessageStream が compress に到達することを期待。

- [ ] **ステップ 3: 実装 — フィールドを置き換え**

[geminiChat.ts](packages/core/src/core/geminiChat.ts) 内部フィールド（`hasFailedCompressionAttempt` を検索）:

```ts
// 置き換え前
private hasFailedCompressionAttempt = false;

// 置き換え後
private consecutiveFailures = 0;
```

[geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467) の `tryCompress` 関数で `service.compress` に渡すフィールド:

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← hasFailedCompressionAttempt を置き換え
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

[geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503) の失敗/成功ブランチ:

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... 既存のロジック ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← hasFailedCompressionAttempt = false を置き換え
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← hasFailedCompressionAttempt = true を置き換え
  }
}
```

[chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) の `CompressOptions` インターフェース:

```ts
export interface CompressOptions {
  // ... 既存のフィールド ...
  /**
   * このチャットにおける自動圧縮の連続失敗数。
   * MAX_CONSECUTIVE_FAILURES に達すると、force=true の成功呼び出しで
   * リセットされるまでゲートは試行を停止する。
   */
  consecutiveFailures: number;
  // hasFailedCompressionAttempt を削除
}
```

`compress()` 関数内 [:221](packages/core/src/services/chatCompressionService.ts:221) の cheap-gate チェック:

```ts
// 先に cheap-gate をチェック — これらは curated history を必要としない。
if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
  return {
    newHistory: null,
    info: {
      originalTokenCount: 0,
      newTokenCount: 0,
      compressionStatus: CompressionStatus.NOOP,
    },
  };
}
```

`const { ... } = opts;` の分割代入を更新し、`hasFailedCompressionAttempt` を `consecutiveFailures` に置き換える。

`chatCompressionService.test.ts` 内で `hasFailedCompressionAttempt: false/true` を渡している箇所をすべて `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES` に変更し、個別にテスト期待値を修正する。

- [ ] **ステップ 4: テストを実行して成功を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

期待結果: PASS

- [ ] **ステップ 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **ステップ 6: コミット**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): hasFailedCompressionAttempt をサーキットブレーカーに置き換え

1 回限りの永久ロックから 3 回のサーキットブレーカー
（MAX_CONSECUTIVE_FAILURES=3）に切り替え。
強制圧縮（手動 /compress、リアクティブオーバーフロー、hard 階層救済）が
成功するとカウンターをリセット。
claude-code の設計に準拠し、一時的な障害（レート制限、一時的なモデルエラー）
から自動圧縮がセッション終了まで無効になる問題を解消。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## フェーズ P4 — 設定面：contextPercentageThreshold 削除 + breaking-change 警告

### タスク 8: フィールド削除 + 起動時警告

**ファイル:**

- 変更: `packages/core/src/config/config.ts`
- 変更: `packages/cli/src/config/settingsSchema.ts`（参照がある場合）
- 変更: `packages/core/src/services/chatCompressionService.ts`
- 変更: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **ステップ 1: 失敗するテストを記述**

`packages/core/src/config/config.test.ts`（存在しない場合は作成）:

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold 非推奨化', () => {
  it('非推奨フィールドが設定されている場合、stderr に警告を出力する', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... 最小限の必須 Config パラメータ ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold は削除されました',
      ),
    );
    warnSpy.mockRestore();
  });

  it('非推奨フィールドがない場合、警告を出力しない', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... 最小限のパラメータ、chatCompression.contextPercentageThreshold なし ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

期待結果: FAIL — Config は現在このフィールドを完全に受け入れており、警告なし。

- [ ] **ステップ 3: 実装 — ChatCompressionSettings + Config コンストラクタを変更**

[config.ts:217-227](packages/core/src/config/config.ts:217):

```ts
export interface ChatCompressionSettings {
  /**
   * `findCompressSplitPoint` で履歴全体に文字数を按分する際の、
   * 単一のインライン画像/ドキュメントパートあたりの推定トークン数。
   * また、サイドクエリ圧縮プロンプトからインラインメディアを除去する際の
   * プレースホルダー予算としても使用される。デフォルト 1600。
   * 環境変数によるオーバーライド: `QWEN_IMAGE_TOKEN_ESTIMATE`。
   */
  imageTokenEstimate?: number;
}
```

（`contextPercentageThreshold` フィールドを削除）
[config.ts](packages/core/src/config/config.ts) で `params.chatCompression` を処理している箇所（約 line 933）を見つけ、代入の前に以下を追加します：

```ts
if (
  params.chatCompression &&
  typeof (params.chatCompression as Record<string, unknown>)
    .contextPercentageThreshold !== 'undefined'
) {
  console.warn(
    '[qwen-code] chatCompression.contextPercentageThreshold has been removed ' +
      'and is now controlled by built-in thresholds. Setting will be ignored.',
  );
}
this.chatCompression = params.chatCompression;
```

`chatCompressionService.ts` も同時にクリーンアップします：[:214-217](packages/core/src/services/chatCompressionService.ts:214) の部分は Task 6 ですでに削除されています。ファイル内に `chatCompressionSettings?.contextPercentageThreshold` またはエクスポートされた定数 `COMPRESSION_TOKEN_THRESHOLD` が残っていないか確認してください：

- `COMPRESSION_TOKEN_THRESHOLD` に参照がなくなった場合は、定数を削除します。
- まだ参照がある場合（例：telemetry やドキュメントなど）は、代わりに `DEFAULT_PCT` を参照するように変更します。

cli/config/settingsSchema.ts は変更不要です。`chatCompression` は引き続き `type: 'object'` であり、中にスキーマフィールドはありません（[settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)）。もしスキーマ内部に `contextPercentageThreshold` への参照がある場合は、削除します。

- [ ] **Step 4: テストを実行してパスすることを確認**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

Expected: PASS（既存の圧縮関連テストも含む）

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/config/config.ts packages/core/src/config/config.test.ts packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core)!: remove chatCompression.contextPercentageThreshold setting

The proportional threshold is now an internal constant (DEFAULT_PCT) and
the auto-compaction threshold is computed from a mixed proportional /
absolute formula (computeThresholds). User-facing tuning of the bare
percentage no longer maps to meaningful behavior on large-window models.

Existing settings.json files containing the field will log a one-line
stderr warning on startup; the field is otherwise ignored.

BREAKING CHANGE: chatCompression.contextPercentageThreshold is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P3 — hard 層による積極的な救済

### Task 9: sendMessageStream エントリに hard チェック + force compress を追加

**Files:**

- Modify: `packages/core/src/core/geminiChat.ts`
- Modify: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // 200K ウィンドウで構成：hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // 今回のユーザーメッセージ推定 + 176K が 177K を超える
    const userMessage = makeBigUserMessage(/* ~3K tokens */);
    const stream = await chat.sendMessageStream(
      'm',
      { message: userMessage },
      'p',
    );
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
    expect(getLastCompressCallForce()).toBe(true);
  });

  it('hard rescue resets consecutiveFailures before forcing', async () => {
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // 最初に 3 回失敗させて consecutiveFailures = 3 にする
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 4 回目：token が hard を超えるため、hard rescue がサーキットブレーカーをリセットし force=true にする
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

Expected: FAIL — 現在の sendMessageStream は常に `force=false` で tryCompress を呼び出します。

- [ ] **Step 3: 実装 — sendMessageStream エントリに hard 判定を追加**

[geminiChat.ts:560-567](packages/core/src/core/geminiChat.ts:560)：

```ts
// Hard-tier rescue: if pending prompt is large enough to risk overflow,
// force compress before the send and reset the failure counter so a
// session already in circuit-breaker NOOP can recover. This proactively
// covers what reactive overflow (line ~711) would otherwise catch
// after a wasted round-trip.
const contextLimit =
  this.config.getContentGeneratorConfig()?.contextWindowSize ??
  DEFAULT_TOKEN_LIMIT;
const { hard } = computeThresholds(contextLimit);
const pendingUserMessage = createUserContent(params.message);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  pendingUserMessage,
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;
if (shouldForceFromHard) {
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
  { pendingUserMessage },
);
```

注意：`createUserContent` は sendMessageStream 内部で [:569](packages/core/src/core/geminiChat.ts:569) で本来 1 回呼ばれます。ここでは先に呼び出しているため、[:569](packages/core/src/core/geminiChat.ts:569) の行 `const userContent = createUserContent(params.message);` は削除または `const userContent = pendingUserMessage;` に置き換えます。

import を追加：`import { computeThresholds } from '../services/chatCompressionService.js';`
import を追加：`import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Step 4: テストを実行してパスすることを確認**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Expected: PASS

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): hard-tier rescue forces compaction before oversized send

When estimated tokens cross computeThresholds.hard, sendMessageStream
now resets the consecutive-failure counter and calls tryCompress with
force=true. This pulls reactive overflow recovery forward to before
the send, saving one wasted round-trip and unblocking sessions whose
circuit breaker had latched off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P5 — UI の変更（tip の書き換え + /context 表示）

### Task 10: tipRegistry 内の 3 つの context-\* tip を書き換える

**Files:**

- Modify: `packages/cli/src/services/tips/tipRegistry.ts`
- Modify: `packages/cli/src/services/tips/tipRegistry.test.ts`（存在しない場合は作成）
- Modify: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`packages/cli/src/services/tips/tipRegistry.test.ts`：

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tipRegistry, type TipContext } from './tipRegistry.js';

const baseCtx: TipContext = {
  lastPromptTokenCount: 0,
  contextWindowSize: 200_000,
  sessionPromptCount: 10,
  sessionCount: 1,
  platform: 'darwin',
  thresholds: {
    warn: 147_000,
    auto: 167_000,
    hard: 177_000,
    effectiveWindow: 180_000,
  },
};

function tipById(id: string) {
  return tipRegistry.find((t) => t.id === id)!;
}

describe('context-* tip thresholds align with computeThresholds', () => {
  it('compress-intro fires between warn and auto', () => {
    const t = tipById('compress-intro');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 100_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 168_000 })).toBe(
      false,
    );
  });

  it('context-high fires between auto and hard', () => {
    const t = tipById('context-high');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      false,
    );
  });

  it('context-critical fires at or above hard', () => {
    const t = tipById('context-critical');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      true,
    );
  });

  it('falls back gracefully when thresholds undefined (legacy callers)', () => {
    const ctx = { ...baseCtx, thresholds: undefined };
    // 3 つの tip は thresholds がない場合、いずれもトリガーされない（比較できないため）
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

Expected: FAIL — `TipContext` に `thresholds` フィールドがありません。また、3 つの tip はまだ 50/80/95 パーセンテージでトリガーされています。

- [ ] **Step 3: 実装 — tipRegistry を変更**

[tipRegistry.ts:15-21](packages/cli/src/services/tips/tipRegistry.ts:15)：

```ts
import type { CompactionThresholds } from '@qwen-code/qwen-code-core';
import { DEFAULT_TOKEN_LIMIT } from '@qwen-code/qwen-code-core';

export type TipTrigger = 'startup' | 'post-response';

export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  /**
   * Three-tier auto-compaction thresholds, computed by callers.
   * Optional for backward compat; tip checks return false when missing.
   */
  thresholds?: CompactionThresholds;
}
```

`getContextUsagePercent` は保持します（他の startup tip で使用される可能性があるため）。ただし、context-\* tips はこれに依存しなくなります。

[tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37) の 3 つの tip の `isRelevant` を置き換えます：

```ts
export const tipRegistry: ContextualTip[] = [
  // --- Post-response contextual tips (priority: higher = more urgent) ---
  {
    id: 'context-critical',
    content:
      'Context near hard limit — auto-compact will force on next send. Consider /clear if you want to start fresh.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.hard,
    cooldownPrompts: 3,
    priority: 100,
  },
  {
    id: 'context-high',
    content: 'Context is getting full. Use /compress to free up space.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.auto &&
      ctx.lastPromptTokenCount < ctx.thresholds.hard,
    cooldownPrompts: 5,
    priority: 90,
  },
  {
    id: 'compress-intro',
    content: 'Long conversation? /compress summarizes history to free context.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.warn &&
      ctx.lastPromptTokenCount < ctx.thresholds.auto &&
      ctx.sessionPromptCount > 5,
    cooldownPrompts: 10,
    priority: 50,
  },

  // --- Startup tips ---  ← 変更なし
  // ... 以降の startup tips はそのまま ...
```

`packages/cli/src/ui/AppContainer.tsx:1150` 付近（コンテキストチップの構築箇所として既知）を次のように変更します：

```tsx
// pseudo — 実際のコードに応じて調整
const thresholds = computeThresholds(contextWindowSize);
const tipCtx: TipContext = {
  lastPromptTokenCount,
  contextWindowSize,
  sessionPromptCount,
  sessionCount,
  platform: process.platform,
  thresholds,
};
```

AppContainer.tsx に import を追加：

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Step 4: テストを実行してパスすることを確認**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

Expected: PASS

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/cli/src/services/tips/tipRegistry.ts packages/cli/src/services/tips/tipRegistry.test.ts packages/cli/src/ui/AppContainer.tsx
git commit -m "$(cat <<'EOF'
feat(cli): align context-* tips with new compaction thresholds

The three context-usage tips now compare tokenCount against the
warn/auto/hard ladder from computeThresholds instead of fixed 50/80/95
percentages. compress-intro fires between warn and auto, context-high
between auto and hard, context-critical at or above hard. Threshold
data is injected into TipContext from the AppContainer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 11: /context コマンドで 3 段階のしきい値を表示する

**Files:**

- Modify: `packages/cli/src/ui/commands/contextCommand.ts`
- Modify: `packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // warn と auto の間
    });
    expect(result).toMatch(/Warn threshold:\s+147[,.]?000/);
    expect(result).toMatch(/Auto threshold:\s+167[,.]?000/);
    expect(result).toMatch(/Hard threshold:\s+177[,.]?000/);
    expect(result).toMatch(/current tier:\s+warn/i);
  });

  it('correctly identifies "below warn" tier when tokens are low', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 50_000,
    });
    expect(result).toMatch(/current tier:\s+(safe|below warn|normal)/i);
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

Expected: FAIL — 現在の [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) では `(1 - threshold) * contextWindowSize` の式を使い、"autocompactBuffer" の数値 1 つだけを表示しています。

- [ ] **Step 3: 実装 — contextCommand の出力を変更**

[contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) の部分を置き換えます：

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... buildContextSummary または同等のエントリ内で：
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// フォーマット出力部分に追加：
const lines = [
  // ... 既存の出力 ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

注：`formatNum` は既存プロジェクト内の `.toLocaleString()` などです。ファイル内にない場合は、`(n: number) => n.toLocaleString('en-US')` をインラインで定義します。

同時に、`autocompactBuffer` を計算していた元のコード（[:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)）と `compressionThreshold` の使用を**削除**します。代わりに直接 `auto` を参照します。

- [ ] **Step 4: テストを実行してパスすることを確認**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

Expected: PASS

- [ ] **Step 5: 型チェック + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add packages/cli/src/ui/commands/contextCommand.ts packages/cli/src/ui/commands/contextCommand.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): /context shows three-tier thresholds and current tier

Replace the legacy single-buffer display with effective window + warn /
auto / hard threshold lines and a "current tier" label so users can see
exactly where in the ladder the session sits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 検収（最終フルリグレッション）

すべてのタスクを完了したら、最後にフルバリデーションを実行します：

- [ ] **Step 1: 全テスト**

```bash
npm test
```

Expected: すべてのワークスペースのテストが成功。

- [ ] **Step 2: 全型チェック**

```bash
npm run typecheck
```

- [ ] **Step 3: 全 lint**

```bash
npm run lint
```

- [ ] **Step 4: 手動 smoke test**

CLI を起動し、以下を実行：

1. `/context` —— 新しい 3 段階表示が適切か確認
2. 圧縮をトリガーする会話を実行（200K ウィンドウモデルを使用し、prompt を 170K+ まで入力）
3. `chatCompression.contextPercentageThreshold = 0.5` を設定して起動 —— stderr に非推奨警告が出力されるか確認
4. `--continue` を使用して巨大なセッションを復元し、最初の送信時に圧縮が初回推定パスでトリガーされるか確認

- [ ] **Step 5: PR 説明統一スクリプト（任意）**

PR が複数に分かれている場合、各 PR の説明で [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) をリンクし、Phase / Task を明記します。