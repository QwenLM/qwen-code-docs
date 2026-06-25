# 自适应输出 Token 扩容设计

> 通过”低默认值 + 截断时扩容”策略，将输出 token 的 GPU slot 过度预留减少约 4 倍，并为超出扩容上限的响应提供多轮恢复机制。

## 问题

每个 API 请求都会预留与 `max_tokens` 成比例的固定 GPU slot。此前默认值为 32K token，即每个请求预留 32K 输出 slot，但 99% 的响应不超过 5K token。这导致 GPU 容量被过度预留 4-6 倍，限制了服务器并发能力并增加了成本。

## 解决方案

将默认输出 token 上限设为 **8K**。当响应被截断（模型触达 `max_tokens`）时：

1. **扩容**至模型的完整输出上限（未知模型以 64K 为下限）
2. 若仍被截断，**恢复**：将部分响应保留在历史记录中并注入续写消息，最多尝试 3 次
3. 若恢复次数耗尽，则回退到工具调度器的截断处理指引

由于实际被截断的请求不足 1%，该策略在保障长响应输出质量的同时，显著降低了平均 slot 预留量。

## 架构

```
Request (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Response truncated?     │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 1: Escalate to model output limit         │
│  ┌────────────────────────────────────────────┐  │
│  │ Pop partial response from history          │  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Re-send at max(64K, model output limit)    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Still truncated?        │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Multi-turn recovery (up to 3×)         │
│  ┌────────────────────────────────────────────┐  │
│  │ Keep partial response in history           │  │
│  │ Push user message: "Resume directly..."    │  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Re-send with updated history               │  │
│  │ Model continues from where it left off     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Succeeded?  │── Yes ──▶ Done ✓         │
│          └──────┬──────┘                          │
│                 │ No (still truncated)            │
│                 ▼                                 │
│          attempt < 3? ── Yes ──▶ loop back ↑      │
└───────────┬──────────────────────────────────────┘
            │ No (exhausted)
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Tool scheduler fallback                │
│  ┌────────────────────────────────────────────┐  │
│  │ Reject truncated Edit/Write tool calls     │  │
│  │ Return guidance: "You MUST split into      │  │
│  │ smaller parts — write skeleton first,      │  │
│  │ then edit incrementally."                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Token 限制判定

有效的 `max_tokens` 按以下优先级顺序确定：

| 优先级      | 来源                                                 | 值（已知模型）               | 值（未知模型）        | 扩容行为                                        |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1 (最高)    | 用户配置 (`samplingParams.max_tokens`)               | `min(userValue, modelLimit)` | `userValue`           | 不扩容                                          |
| 2           | 环境变量 (`QWEN_CODE_MAX_OUTPUT_TOKENS`)             | `min(envValue, modelLimit)`  | `envValue`            | 不扩容                                          |
| 3 (最低)    | 封顶默认值                                           | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | 扩容至模型上限（64K 下限）+ 恢复机制            |

“已知模型”指在 `OUTPUT_PATTERNS` 中有明确条目的模型（通过 `hasExplicitOutputLimit()` 检查）。对于已知模型，有效值始终会被限制在模型声明的输出上限以内，以避免 API 报错。未知模型（自定义部署、自托管端点）会直接透传用户设置的值，因为其后端可能支持更大的限制。

该逻辑在以下三个内容生成器中实现：

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI 兼容提供商
- `DashScopeProvider` — 继承自默认提供商的 `applyOutputTokenLimit()`
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic 提供商

## 扩容机制

扩容逻辑位于 `geminiChat.ts` 中，且被特意放置在主重试循环**之外**。原因如下：

1. 重试循环用于处理瞬时错误（速率限制、无效流、内容校验）
2. 截断并非错误——它是一次被提前截断的成功响应
3. 扩容后流产生的错误应直接向上抛出给调用方，而不应被重试逻辑捕获

### 扩容步骤 (`geminiChat.ts`)

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Compute escalated limit: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Pop the partial model response from chat history
6. Yield RETRY event (isContinuation: false) → UI discards partial output and resets buffers
7. Re-send the same request with maxOutputTokens: escalatedLimit
```

### 恢复步骤 (`geminiChat.ts`)

如果扩容后的响应同样被截断（`finishReason === MAX_TOKENS`），恢复循环最多运行 `MAX_OUTPUT_RECOVERY_ATTEMPTS`（3）次：

```
1. Partial model response is already in history (pushed by processStreamResponse)
2. Push a recovery user message: OUTPUT_RECOVERY_MESSAGE
3. Yield RETRY event (isContinuation: true) → UI keeps text buffer for continuation
4. Re-send with updated history (model sees its partial output + recovery instruction)
5. If still truncated and attempts remain, loop back to step 1
6. If recovery attempt throws (empty response, network error):
   - Pop the dangling recovery message from history
   - Break out of recovery loop
```

### RETRY 时的状态清理 (`turn.ts`)

当 `Turn` 类接收到 RETRY 事件时，会清除累积状态以防止不一致：

- `pendingToolCalls` — 清除以避免重复调用工具（若首次截断的响应中包含已完成的工具调用，且这些调用在扩容响应中重复出现）
- `pendingCitations` — 清除以避免重复引用
- `debugResponses` — 清除以避免残留的调试数据
- `finishReason` — 重置为 `undefined`，以便使用新响应的结束原因

`isContinuation` 标志会透传给 UI，以便 UI 决定是重置文本缓冲区（扩容）还是保留它们（恢复）。

## 常量

定义于 `geminiChat.ts` 和 `tokenLimits.ts` 中：

| 常量                           | 值     | 用途                                                    |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8,000  | 未设置用户覆盖值时的默认输出 Token 限制                 |
| `ESCALATED_MAX_TOKENS`         | 64,000 | 扩容下限（当模型限制未知时使用）                        |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | 扩容后的最大多轮恢复尝试次数                            |

有效的扩容限制为 `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`：

| 模型             | 扩容限制        |
| ---------------- | --------------- |
| Claude Opus 4.6  | 131,072 (128K)  |
| GPT-5 / o-series | 131,072 (128K)  |
| Qwen3.x          | 65,536 (64K)    |
| Unknown models   | 64,000 (下限)   |

## 设计决策

### 为什么默认值设为 8K？

- 99% 的响应不足 5K Token
- 8K 为稍长的响应提供了合理的余量，且不会触发不必要的重试
- 将平均槽位预留量从 32K 降至 8K（提升 4 倍）

### 为什么扩容至模型上限而非固定的 64K？

- 具有更高输出上限的模型（如 Claude Opus 128K、GPT-5 128K）此前被不必要地限制在 64K
- 使用模型的实际上限可覆盖绝大多数长输出，避免二次重试
- `ESCALATED_MAX_TOKENS`（64K）作为未知模型的下限，此时 `tokenLimit()` 会返回默认的 32K

### 为什么采用多轮恢复而非渐进式扩容？

- 渐进式扩容（8K → 16K → 32K → 64K）每次都需要重新生成完整响应
- 多轮恢复会保留部分响应并让模型继续生成，从而节省 Token 和延迟
- 与重新生成大型响应相比，恢复消息的开销极低（每次约 40 Token）
- 3 次尝试的限制在覆盖大多数实际场景的同时，防止了无限循环

### 为什么将扩容逻辑放在重试循环之外？

- 截断属于成功情况，而非错误
- 扩容后流产生的错误（速率限制、网络故障）应直接抛出，而不是使用错误的参数静默重试
- 保持重试循环专注于其原始目的（瞬时错误恢复）
- 恢复过程中的错误会被单独捕获，以避免中断整个对话