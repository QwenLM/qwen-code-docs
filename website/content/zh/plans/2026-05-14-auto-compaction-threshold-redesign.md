# 自动压缩阈值重设计实现计划

> **针对代理型工作者的说明：** 必需的子技能：使用超能力：子代理驱动开发（推荐）或超能力：执行计划来逐步实现此计划。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 将 Qwen Code 自动压缩的单层比例阈值（70%）升级为「比例 + 绝对」混合的三层阈值阶梯（warn / auto / hard），同时给压缩调用本身打上 `maxOutputTokens` 上限、关闭思考、引入失败熔断、修复 `lastPromptTokenCount` 的滞后/首轮缺口、清理用户配置面。

**架构：**

- `chatCompressionService.ts` 新增 `computeThresholds(window)` 输出 `{ warn, auto, hard }`；简版门控用 `auto`，`sendMessageStream` 入口增加 hard 主动救场。
- 新建 `tokenEstimation.ts` 提供本地 char/4 估算函数，补偿 `lastPromptTokenCount` 的「滞后一轮 + 首轮为 0」两个缺口。
- 失败处理从 `hasFailedCompressionAttempt: boolean` 单次锁升级为 `consecutiveFailures: number` 三次熔断。
- 压缩 sideQuery 调用关闭思考 + 增加 `maxOutputTokens: 20K`。
- 删除 `chatCompression.contextPercentageThreshold` 设置字段，启动时遇到旧配置输出 stderr 警告并忽略。
- `tipRegistry.ts` 三条 context-* tips 重写为跟随新阈值；`/context` 命令显示三层数值。

**技术栈：** TypeScript, Vitest, `@google/genai`, 现有 `compactionInputSlimming` 估算工具。

**合并顺序：** P6 → P7 → P1 → P2 → P4 → P3 → P5。每个 Task 都是一个独立 PR 候选。

---

## 文件结构

| 路径                                                        | 操作      | 责任                                                                                        |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `packages/core/src/services/tokenEstimation.ts`             | 创建      | 字符级 token 估算 + `estimatePromptTokens` 入口                                             |
| `packages/core/src/services/tokenEstimation.test.ts`        | 创建      | 估算函数单元测试                                                                            |
| `packages/core/src/services/chatCompressionService.ts`      | 修改      | 新增常量 + `computeThresholds`；修改简版门控；关闭 thinking + maxOutput；修改失败计数          |
| `packages/core/src/services/chatCompressionService.test.ts` | 修改      | computeThresholds 单测 + 简版门控 / sideQuery 配置断言                                      |
| `packages/core/src/core/geminiChat.ts`                      | 修改      | `sendMessageStream` 入口增加 hard 检查；`hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                 | 修改      | hard 触发 + 熔断器 + 首轮覆盖集成测试                                                       |
| `packages/core/src/config/config.ts`                        | 修改      | `ChatCompressionSettings` 删除 `contextPercentageThreshold`；启动时 warning                  |
| `packages/cli/src/services/tips/tipRegistry.ts`             | 修改      | 三条 context-* tips 改用阈值绝对比较；`TipContext` 增加 `thresholds`                         |
| `packages/cli/src/services/tips/tipRegistry.test.ts`        | 创建/修改 | tip 触发区间测试                                                                            |
| `packages/cli/src/ui/commands/contextCommand.ts`            | 修改      | 显示新三层阈值                                                                              |
| `packages/cli/src/ui/commands/contextCommand.test.ts`       | 修改      | 输出快照                                                                                    |
| `packages/cli/src/ui/AppContainer.tsx`                      | 修改      | 构造 `TipContext` 时注入 `thresholds`                                                       |

---

## 阶段 P6 — 压缩 sideQuery 关闭 thinking + 增加 maxOutputTokens

第一个落地，让后续阈值假设可信。独立 PR。

### Task 1: 修改 chatCompressionService 的 sideQuery 调用

**文件：**

- 修改：`packages/core/src/services/chatCompressionService.ts:374-376`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1: 编写失败的测试**

在 `chatCompressionService.test.ts` 顶部 import 部分增加 spy 入口，并在合适的 describe 内添加测试。`runSideQuery` 已经是模块导出，可以 spyOn：

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery 配置', () => {
  it('向 runSideQuery 传递 maxOutputTokens=20_000 和 includeThoughts=false', async () => {
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

`makeFakeChat` / `makeFakeConfig` 复用现有测试 helper（如果文件里已有，直接用；没有就内联一个最小存根）。

- [ ] **步骤 2: 运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'passes maxOutputTokens=20_000'
```

预期：FAIL — 现在传入的是 `{ thinkingConfig: { includeThoughts: true } }`，且没有 `maxOutputTokens`。

- [ ] **步骤 3: 实现 — 修改 chatCompressionService.ts**

替换 [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) 整段 `config:`：

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
  // 压缩输出受 maxOutputTokens 限制，以保证跨提供商的可预测预留（参见 docs/design/auto-compaction-threshold-redesign.md）。
  // 禁用思考，因为每个提供商的思考预算语义不一致（Anthropic/OpenAI 单独计算，Gemini 因模型而异）。
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

在文件顶部常量区（紧跟 `TOOL_ROUND_RETAIN_COUNT` 之后）添加：

```ts
/**
 * 压缩 sideQuery 输出的硬限制（仅摘要文本，因为思考已禁用）。
 * 对应 claude-code 的 MAX_OUTPUT_TOKENS_FOR_SUMMARY（autoCompact.ts:30），
 * 该值基于实际压缩输出的 p99.99。
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

同时清理 `compress()` 内 token 计算段（大约 line 436-437）那条 `"may include non-persisted tokens (thoughts)"` 注释 —— 现在不存在 thinking 输出了，把句子改成「compressionOutputTokenCount 仅反映摘要 token，因为思考已禁用」。

- [ ] **步骤 4: 运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

预期：PASS（新测试 + 现有测试不应回归）

- [ ] **步骤 5: 类型检查 + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

预期：无错误。

- [ ] **步骤 6: 提交**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 限制压缩 sideQuery 输出并禁用思考

新增 COMPACT_MAX_OUTPUT_TOKENS=20_000 并将 maxOutputTokens 传递给
runSideQuery 调用，禁用 thinkingConfig.includeThoughts。与 claude-code
的 autoCompact 预留保持一致，使得下游阈值阶梯（P1/P3）可以依赖压缩
摘要输出在跨提供商（Anthropic / OpenAI / Gemini 的思考预算处理方式
不一致）上的可预测上界。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 阶段 P7 — Token 估算补偿

修复 `lastPromptTokenCount` 的滞后/首轮缺口。3 个 Task。

### Task 2: 新建 tokenEstimation.ts 单元

**文件：**

- 创建：`packages/core/src/services/tokenEstimation.ts`
- 创建：`packages/core/src/services/tokenEstimation.test.ts`

- [ ] **步骤 1: 编写失败的测试**

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
  it('空数组返回 0', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('纯文本按 ~chars/4 估算', () => {
    // "hello world" = 11 个字符 → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('跨多条消息求和 token', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('通过 imageTokenEstimate 估算 inlineData', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('估算 functionCall（JSON 密集）按 ~chars/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars 会序列化；生成的 JSON 很短，但
    // 比例 (chars/2) 应使其 >= chars/4 路径。
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

  it('当 lastPromptTokenCount > 0 时使用其值 + 用户消息估算', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('当 lastPromptTokenCount 为 0 时回退到完整估算', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **步骤 2: 运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

预期：FAIL — `tokenEstimation.ts` 尚未创建。

- [ ] **步骤 3: 实现 — 新建 tokenEstimation.ts**

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
 * 基于字符数估算 token 的平均字节每 token。
 * 与 claude-code 的 roughTokenCountEstimation 默认值（tokens.ts）一致。
 */
const BYTES_PER_TOKEN = 4;

/**
 * 通过 char/4 估算 Content 对象列表的 token 数。
 *
 * 复用 `estimateContentChars`，使得 inlineData / functionCall /
 * functionResponse 在计算压缩分界点时获得相同的处理方式 —— 保持两个
 * 估算器同步可防止自动压缩触发器和分割器在大小上产生分歧。
 *
 * 仅用于发送前阈值门控。Char/4 是一个保守的下界（实际分词器变化 ±30%）；
 * 用它来触发压缩（假阳性）是安全的，但用它来跳过压缩则不安全。
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
 * 计算用于自动压缩门控的有效提示 token 数。
 *
 * `lastPromptTokenCount`（来自上一轮的使用量元数据）缺少两样东西：
 * 当前用户消息，以及首次发送时的初始值。此辅助函数通过本地估算来
 * 弥补这两个缺口。
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

- [ ] **步骤 4: 运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

预期：PASS

- [ ] **步骤 5: 类型检查 + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6: 提交**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 为压缩门控添加 token 估算辅助函数

引入基于现有 estimateContentChars（compactionInputSlimming）除以 char/4
比例构建的 estimateContentTokens / estimatePromptTokens。将替换简版门控
和 hard 阈值检查中原始 lastPromptTokenCount 的使用，使系统能够响应
(a) 当前用户消息和 (b) 首次发送（API 报告的数量为 0）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: 在 chatCompressionService 简版门控中应用估算

**文件：**

- 修改：`packages/core/src/services/chatCompressionService.ts`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1: 编写失败的测试**

本 Task 在 P1 之前落地，所以使用**现有的** `threshold * contextLimit` 公式（70% * 200K = 140K），只把 `originalTokenCount` 替换为 `estimatePromptTokens(...)`：

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress 简版门控使用估算 token', () => {
  it('当 API 报告的 token 低于阈值但加上待发送用户消息的估算 token 超过阈值时触发压缩', async () => {
    // 200K 窗口当前阈值 = 0.7 * 200K = 140K
    // originalTokenCount = 135K（差 5K）
    // 用户消息估算 ~10K → 145K，跨越 140K
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K chars ≈ 10K tokens
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // 模拟 runSideQuery 使 compress 后续步骤不崩溃
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

  it('当 originalTokenCount 和估算总量均未达到阈值时返回 NOOP', async () => {
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

`makeFakeChat({ historyChars })` 是测试文件内的内联 helper：构造 `GeminiChat` 替身，`getHistory()` 返回长度近似匹配 `historyChars` 的 Content 数组（如果文件已有 helper 则复用）。

- [ ] **步骤 2: 运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses estimated tokens'
```

预期：FAIL — 当前简版门控只看 `originalTokenCount`，会判定 NOOP。

- [ ] **步骤 3: 实现 — 修改 compress() 简版门控**

修改 [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) 这段：

```ts
// 如果未强制且未超过限制，则不进行压缩。这是每次发送时的稳态路径；
// 我们希望在下方的完整 `getHistory(true)` 克隆之前退出。
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

`CompressOptions` 接口（[:172-196](packages/core/src/services/chatCompressionService.ts:172)）增加新字段：

```ts
export interface CompressOptions {
  // ... 现有字段 ...
  /**
   * 待发送的用户消息。存在时，简版门控将其估算 token 数添加到
   * `originalTokenCount`（仅反映上一轮的 API 用量），使门控能感知
   * 真实的提示词大小。可选，用于向后兼容那些没有用户消息的调用方
   * （例如手动 /compress force=true 路径）。
   */
  pendingUserMessage?: Content;
}
```

增加 import：`import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **步骤 4: 运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

预期：PASS

- [ ] **步骤 5: 类型检查 + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6: 提交**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 当用户消息待发送时，简版门控使用估算 token

向 CompressOptions 添加 `pendingUserMessage`，并在自动压缩简版门控
中通过 estimatePromptTokens 使用它。修复了「滞后一轮」的缺口——阈值
检查错过了即将发送的用户消息。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: 在 geminiChat sendMessageStream 入口透传 pendingUserMessage

**文件：**

- 修改：`packages/core/src/core/geminiChat.ts`
- 修改：`packages/core/src/core/geminiChat.test.ts`

- [ ] **步骤 1: 编写失败的测试**

`packages/core/src/core/geminiChat.test.ts` 增加：

```ts
describe('sendMessageStream 首轮估算', () => {
  it('首次发送时，当继承历史很大时触发自动压缩', async () => {
    // 模拟子代理继承大历史 / --continue 场景：
    // lastPromptTokenCount = 0，但历史已填到接近 auto 阈值
    const chat = makeChatWithLargeInheritedHistory(/* ~150K chars worth */);
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
    // 收集 stream 的第一个事件，应是 COMPRESSED
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
helper `makeChatWithLargeInheritedHistory` 在测试文件里 inline：构造一个 `GeminiChat`，`history` 装入 1500 个简单 user/model content，每条 100 chars，总 ~150K chars。

- [ ] **步骤 2：运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

期望结果：FAIL — 当前 `tryCompress` 用的是 `lastPromptTokenCount = 0`，cheap-gate 判断 NOOP。

- [ ] **步骤 3：实现 — 修改 sendMessageStream 与 tryCompress**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) 改为：

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

`tryCompress` 函数签名（约 [:460-478](packages/core/src/core/geminiChat.ts:460)）的 `options` 接口 `TryCompressOptions` 加：

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← 新增
}
```

把 `pendingUserMessage` 透传给 `service.compress`：

```ts
const { newHistory, info } = await service.compress(this, {
  // ... 现有字段 ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **步骤 4：运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

期望结果：PASS

- [ ] **步骤 5：类型检查 + 代码风格检查**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6：提交**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): pass pendingUserMessage from sendMessageStream to tryCompress

Closes the 'first send after inherited history' gap where
lastPromptTokenCount is 0 and the cheap-gate would always NOOP.
estimatePromptTokens falls back to a full-history estimate in that
case once the user message is provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P1 — 三层阈值常量 + computeThresholds + cheap-gate

### Task 5: 添加常量与 computeThresholds 函数

**文件：**

- 修改：`packages/core/src/services/chatCompressionService.ts`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1：编写失败的测试**

`chatCompressionService.test.ts` 增加：

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('32K window — proportional fallback for all tiers, hard degrades to auto', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(window-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('128K window — mixed (warn=pct, auto/hard=abs)', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (pct wins: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // abs: window-33K (abs wins: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // abs: window-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('200K window — absolute takes over all tiers', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // abs: auto-20K (abs wins: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // abs: 200K-33K
    expect(t.hard).toBe(177_000); // abs: 200K-23K
  });

  it('1M window — fully absolute', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('extreme small window (10K) does not crash; returns sane values', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('thresholds always satisfy warn <= auto <= hard', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

期望结果：FAIL — `computeThresholds` 不存在。

- [ ] **步骤 3：实现 — 添加常量与函数**

在 [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) 文件常量区（紧跟 `COMPACT_MAX_OUTPUT_TOKENS`）加：

```ts
/**
 * Default proportional auto-compaction threshold (legacy semantics
 * preserved as a small-window fallback / safety net).
 */
export const DEFAULT_PCT = 0.7;

/**
 * Warn-tier proportional offset: warn-pct = PCT - WARN_PCT_OFFSET (= 0.6).
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * Token budget reserved for compression output. Matches COMPACT_MAX_OUTPUT_TOKENS
 * because thinking is disabled (see Task 1) so maxOutputTokens is the hard
 * ceiling on summary output.
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** Distance between auto threshold and effectiveWindow. */
export const AUTOCOMPACT_BUFFER = 13_000;

/** Distance between warn threshold and auto threshold. */
export const WARN_BUFFER = 20_000;

/** Distance between hard threshold and effectiveWindow (claude-code MANUAL_COMPACT_BUFFER). */
export const HARD_BUFFER = 3_000;

/** Auto-compaction consecutive-failure circuit breaker. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** Token count at which UI warn tier triggers. */
  warn: number;
  /** Token count at which auto-compaction triggers. */
  auto: number;
  /** Token count at which auto-compaction is forced (resets failure counter). */
  hard: number;
  /** Window minus SUMMARY_RESERVE; the budget available for input + summary. */
  effectiveWindow: number;
}

/**
 * Compute the three-tier threshold ladder for a given context window.
 *
 * Each tier is `max(proportional, absolute)`:
 *   auto  = max(PCT * window,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * window, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // hard degrades to auto for tiny windows
 *
 * Small windows (where the absolute branch goes negative) automatically fall
 * back to the proportional branch. Large windows are dominated by the absolute
 * branch, capping wasted reservation to ~33K instead of 30% of the window.
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

- [ ] **步骤 4：运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期望结果：PASS

- [ ] **步骤 5：类型检查 + 代码风格检查**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6：提交**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add computeThresholds for three-tier compaction ladder

Introduces warn/auto/hard thresholds combining proportional fallback
(small windows) with absolute reservation (large windows). Matches the
formula in docs/design/auto-compaction-threshold-redesign.md. Pure
function with full coverage across 32K/128K/200K/1M/extreme-small
windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6: cheap-gate 切换到 computeThresholds.auto

**文件：**

- 修改：`packages/core/src/services/chatCompressionService.ts`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
describe('compress cheap-gate uses computeThresholds.auto', () => {
  it('on a 200K window with originalTokenCount=160K, NOOP (below auto=167K)', async () => {
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

  it('on a 200K window with originalTokenCount=168K, proceeds past gate', async () => {
    // 168K > 167K (auto)，cheap-gate 放行，进入 curatedHistory 阶段
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // 实际结果取决于 mock 出来的 sideQuery；只验证不是被 cheap-gate 拦下的早期 NOOP
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses computeThresholds'
```

期望结果：FAIL — 当前阈值是 `threshold * contextLimit = 0.7 * 200K = 140K`，160K 已经超过 140K 直接 cheap-gate 放行（不符断言①）；168K 同理。

- [ ] **步骤 3：实现 — 切换 cheap-gate 公式**

修改 [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) 那段 `if (!force) { ... }` 块：

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

同时删除 [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214) 那段 `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;`，因为 `threshold` 现在不再被 cheap-gate 使用。同时去掉 line 221 那个 `threshold <= 0` 分支（隐式禁用语义，详细在 P4 处理）。

- [ ] **步骤 4：运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

期望结果：PASS

- [ ] **步骤 5：类型检查 + 代码风格检查**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6：提交**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate uses computeThresholds.auto

Replace the legacy `threshold * contextLimit` formula with
computeThresholds.auto, which combines proportional fallback with
absolute reservation. On large windows (>=128K) the gate now triggers
later than 70% but reserves a fixed ~33K, freeing tens of thousands of
context tokens that the old formula wasted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P2 — 失败处理升级（1 次锁 → 3 次熔断）

### Task 7: hasFailedCompressionAttempt → consecutiveFailures

**文件：**

- 修改：`packages/core/src/core/geminiChat.ts`
- 修改：`packages/core/src/services/chatCompressionService.ts`
- 修改：`packages/core/src/core/geminiChat.test.ts`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1：编写失败的测试**

`geminiChat.test.ts`：

```ts
describe('compression failure circuit breaker', () => {
  it('tolerates 2 consecutive failures, NOOPs the third', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // 触发 3 次连续失败：
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // attempt 1 fails
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // attempt 2 fails
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // attempt 3 should NOOP
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // 验证 service.compress 第 3 次根本没被调用（熔断器 NOOP 在 cheap-gate）
    expect(getCompressCallCount()).toBe(2);
  });

  it('resets counter on a successful force compress', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // fail
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // fail
    // 用户手动 /compress
    await chat.tryCompress('p3', 'm', /* force */ true);
    // 现在熔断器应该已重置
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'circuit breaker'
```

期望结果：FAIL — 当前一次失败就永久锁，第 2 次 send 已经被 cheap-gate NOOP，第 3 次也 NOOP，但断言 ② 期望 force 之后能恢复且 sendMessageStream 走得到 compress。

- [ ] **步骤 3：实现 — 替换字段**

[geminiChat.ts](packages/core/src/core/geminiChat.ts) 内部字段（grep `hasFailedCompressionAttempt`）：

```ts
// 替换前
private hasFailedCompressionAttempt = false;

// 替换后
private consecutiveFailures = 0;
```

[geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467) 的 `tryCompress` 函数传给 `service.compress` 的字段：

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← 取代 hasFailedCompressionAttempt
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

[geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503) 失败/成功分支：

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... 现有逻辑 ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← 取代 hasFailedCompressionAttempt = false
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← 取代 hasFailedCompressionAttempt = true
  }
}
```

[chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) 的 `CompressOptions` 接口：

```ts
export interface CompressOptions {
  // ... 现有字段 ...
  /**
   * Number of consecutive auto-compaction failures for this chat. When
   * it reaches MAX_CONSECUTIVE_FAILURES, the gate stops trying until a
   * successful force=true call resets it.
   */
  consecutiveFailures: number;
  // 删除 hasFailedCompressionAttempt
}
```

`compress()` 函数内 [:221](packages/core/src/services/chatCompressionService.ts:221) 那段 cheap-gate 检查：

```ts
// Cheap gates first — these don't need the curated history.
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

更新解构 `const { ... } = opts;` 把 `hasFailedCompressionAttempt` 替换成 `consecutiveFailures`。

`chatCompressionService.test.ts` 中所有传 `hasFailedCompressionAttempt: false/true` 的地方改为 `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES`，逐个修正测试期望。

- [ ] **步骤 4：运行测试以验证其通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

期望结果：PASS

- [ ] **步骤 5：类型检查 + 代码风格检查**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **步骤 6：提交**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): replace hasFailedCompressionAttempt with circuit breaker

Switches from a one-shot permanent lock to a three-strike circuit
breaker (MAX_CONSECUTIVE_FAILURES=3). Successful force compress
(manual /compress, reactive overflow, or hard-tier rescue) resets the
counter. Aligns with claude-code's design and unblocks recovery from
transient failures (rate limits, transient model errors) that
previously disabled auto-compaction for the rest of the session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P4 — 配置面：删除 contextPercentageThreshold + breaking-change 警告

### Task 8: 删除字段 + 启动 warning

**文件：**

- 修改：`packages/core/src/config/config.ts`
- 修改：`packages/cli/src/config/settingsSchema.ts`（如果有引用）
- 修改：`packages/core/src/services/chatCompressionService.ts`
- 修改：`packages/core/src/services/chatCompressionService.test.ts`

- [ ] **步骤 1：编写失败的测试**

`packages/core/src/config/config.test.ts`（如果不存在则创建）：

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold deprecation', () => {
  it('logs a stderr warning when the deprecated field is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimal required Config params ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold has been removed',
      ),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when the deprecated field is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimal params, no chatCompression.contextPercentageThreshold ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

期望结果：FAIL — Config 当前完全接受这个字段，无 warning。

- [ ] **步骤 3：实现 — 修改 ChatCompressionSettings + Config 构造函数**

[config.ts:217-227](packages/core/src/config/config.ts:217)：

```ts
export interface ChatCompressionSettings {
  /**
   * Estimated tokens for a single inline image / document part when
   * apportioning chars across history in `findCompressSplitPoint`.
   * Also used as the placeholder budget when stripping inline media
   * out of the side-query compaction prompt. Default 1600.
   * Env override: `QWEN_IMAGE_TOKEN_ESTIMATE`.
   */
  imageTokenEstimate?: number;
}
```

（删除 `contextPercentageThreshold` 字段。）
[config.ts](packages/core/src/config/config.ts) 找到 Config 构造函数中处理 `params.chatCompression` 的位置（约 line 933），在赋值前加：

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

`chatCompressionService.ts` 同时清理：[:214-217](packages/core/src/services/chatCompressionService.ts:214) 那段已经在 Task 6 删除，再检查文件里有没有残留 `chatCompressionSettings?.contextPercentageThreshold` 或导出的常量 `COMPRESSION_TOKEN_THRESHOLD`：

- 如果 `COMPRESSION_TOKEN_THRESHOLD` 已经无任何引用，删除该常量。
- 如果还有引用（比如 telemetry 或 doc），改为引用 `DEFAULT_PCT`。

cli/config/settingsSchema.ts 不需要改 —— `chatCompression` 仍然是 `type: 'object'`，里面没有 schema 字段（[settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)）。如果 schema 内部有对 `contextPercentageThreshold` 的引用，删除。

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

预期：PASS（包括既有压缩相关测试）

- [ ] **Step 5: 类型检查 + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: 提交**

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

## Phase P3 — hard 层主动救场

### Task 9: sendMessageStream 入口加 hard 检查 + force compress

**文件：**

- 修改：`packages/core/src/core/geminiChat.ts`
- 修改：`packages/core/src/core/geminiChat.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // 构造 200K 窗口：hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // 本轮 user message 估算 + 176K 越过 177K
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
    // 先制造 3 次失败，使 consecutiveFailures = 3
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 第 4 次：token 跨越 hard，hard rescue 重置熔断器并 force=true
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

预期：FAIL — sendMessageStream 当前永远以 `force=false` 调 tryCompress。

- [ ] **Step 3: 实现 — 在 sendMessageStream 入口加 hard 判断**

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

注意：`createUserContent` 在 sendMessageStream 内部本来在 [:569](packages/core/src/core/geminiChat.ts:569) 调一次；现在我们提前调，所以 [:569](packages/core/src/core/geminiChat.ts:569) 那行 `const userContent = createUserContent(params.message);` 可以删除/替换为 `const userContent = pendingUserMessage;`。

加 import：`import { computeThresholds } from '../services/chatCompressionService.js';`
加 import：`import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

预期：PASS

- [ ] **Step 5: 类型检查 + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: 提交**

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

## Phase P5 — UI 改动（tip 重写 + /context 显示）

### Task 10: tipRegistry 重写三条 context-\* tip

**文件：**

- 修改：`packages/cli/src/services/tips/tipRegistry.ts`
- 修改：`packages/cli/src/services/tips/tipRegistry.test.ts`（如不存在则创建）
- 修改：`packages/cli/src/ui/AppContainer.tsx`

- [ ] **Step 1: 编写失败测试**

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
    // 三条 tip 在缺 thresholds 时应该都不触发（不能比较）
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

预期：FAIL — `TipContext` 没有 `thresholds` 字段；三条 tip 仍按 50/80/95 百分比触发。

- [ ] **Step 3: 实现 — 改 tipRegistry**

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

保留 `getContextUsagePercent`（其他 startup tip 可能用到），但 context-\* tips 不再依赖它。

替换 [tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37) 三条 tip 的 `isRelevant`：

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

  // --- Startup tips ---  ← 保持不变
  // ... 后面 startup tips 不动 ...
```

`packages/cli/src/ui/AppContainer.tsx:1150` 那一带（已知是 contextual-tips 构造点），改为：

```tsx
// pseudo — 具体取决于现有代码
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

加 import 到 AppContainer.tsx：

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

预期：PASS

- [ ] **Step 5: 类型检查 + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: 提交**

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

### Task 11: /context 命令显示三层阈值

**文件：**

- 修改：`packages/cli/src/ui/commands/contextCommand.ts`
- 修改：`packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // 在 warn 与 auto 之间
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

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

预期：FAIL — 当前 [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) 用的是 `(1 - threshold) * contextWindowSize` 公式，只显示单个 "autocompactBuffer" 数。

- [ ] **Step 3: 实现 — 改 contextCommand 输出**

替换 [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) 那段：

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... 在 buildContextSummary 或类似入口里：
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// 在格式化输出部分追加：
const lines = [
  // ... 现有输出 ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

注：`formatNum` 是现有项目里的 `.toLocaleString()` 等；如未在文件内则 inline 一个 `(n: number) => n.toLocaleString('en-US')`。

同时**删除**原来计算 `autocompactBuffer` 的代码（[:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)）和对 `compressionThreshold` 的使用 —— 现在直接看 `auto`。

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

预期：PASS

- [ ] **Step 5: 类型检查 + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: 提交**

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

## 验收（最终全量回归）

落地所有 task 后，最后跑一遍全量校验：

- [ ] **Step 1: 全量测试**

```bash
npm test
```

预期：全部 workspace 测试通过。

- [ ] **Step 2: 全量 typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: 全量 lint**

```bash
npm run lint
```

- [ ] **Step 4: 手动 smoke**

启动 CLI，执行：

1. `/context` —— 看新三层显示是否合理
2. 跑一个会触发压缩的对话（可用 200K 窗口模型把 prompt 灌到 170K+）
3. 设置 `chatCompression.contextPercentageThreshold = 0.5` 启动 —— 看 stderr 是否打印 deprecation 警告
4. 用 `--continue` 恢复一个 huge session，首次 send 时压缩是否被首轮估算路径触发

- [ ] **Step 5: PR 描述统一脚本（可选）**

如果 PR 是分批提交的，每个 PR 描述里链接 [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) 并标注 Phase / Task。