# 自适应输出 Token 动态扩容设计

> 通过“低默认值 + 截断时自动扩容”的输出 Token 策略，将 GPU 插槽的过度预留减少约 4 倍。

## 问题

每个 API 请求都会根据 `max_tokens` 预留固定大小的 GPU 插槽。此前 32K Token 的默认值意味着每个请求都会预留 32K 的输出插槽，但 99% 的响应实际不足 5K Token。这导致 GPU 容量被过度预留了 4-6 倍，限制了服务器并发能力并增加了成本。

## 解决方案

将输出 Token 的默认上限设置为 **8K**。当响应被截断（模型达到 `max_tokens` 限制）时，自动使用 **64K** 的扩容限制重试一次。由于实际发生截断的请求不足 1%，该策略在显著降低平均插槽预留量的同时，仍能保障长文本响应的输出质量。

## 架构

```
                      ┌─────────────────────────┐
                      │   Request starts        │
                      │   max_tokens = 8K       │
                      └───────────┬─────────────┘
                                  │
                                  ▼
                      ┌─────────────────────────┐
                      │   Stream response       │
                      └───────────┬─────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                   finish_reason        finish_reason
                   != MAX_TOKENS        == MAX_TOKENS
                        │                   │
                        ▼                   ▼
                  ┌───────────┐   ┌─────────────────────┐
                  │   Done    │   │  Check conditions:   │
                  └───────────┘   │  - No user override? │
                                  │  - No env override?  │
                                  │  - Not already       │
                                  │    escalated?        │
                                  └─────────┬───────────┘
                                     YES    │    NO
                                  ┌─────────┴────┐
                                  │              │
                                  ▼              ▼
                          ┌─────────────┐  ┌──────────┐
                          │ Pop partial │  │  Done    │
                          │ model resp  │  │ (truncd) │
                          │ from history│  └──────────┘
                          │             │
                          │ Yield RETRY │
                          │ event       │
                          │             │
                          │ Re-send     │
                          │ max_tokens  │
                          │   = 64K     │
                          └─────────────┘
```

## Token 限制判定

有效的 `max_tokens` 按以下优先级顺序解析：

| 优先级 | 来源 | 值（已知模型） | 值（未知模型） | 扩容行为 |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ------------------------------ |
| 1（最高） | 用户配置 (`samplingParams.max_tokens`)            | `min(userValue, modelLimit)` | `userValue`           | 不扩容                  |
| 2           | 环境变量 (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`            | 不扩容                  |
| 3（最低）  |  capped 默认值                                       | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | 截断时扩容至 64K |

“已知模型”指在 `OUTPUT_PATTERNS` 中有明确配置的模型（通过 `hasExplicitOutputLimit()` 检查）。对于已知模型，有效值始终会被限制在模型声明的输出上限以内，以避免 API 报错。未知模型（自定义部署、自建端点）会直接透传用户设置的值，因为其后端可能支持更大的限制。

该逻辑在以下三个内容生成器中实现：

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI 兼容提供商
- `DashScopeProvider` — 继承自默认提供商的 `applyOutputTokenLimit()`
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic 提供商

## 扩容机制

扩容逻辑位于 `geminiChat.ts` 中，且特意放置在主重试循环**之外**。原因如下：

1. 重试循环用于处理瞬时错误（如限流、无效流、内容校验失败）
2. 截断并非错误——它是一次被提前截断的成功响应
3. 扩容后流产生的错误应直接向上抛出给调用方，而不应被重试逻辑捕获

### 扩容步骤（geminiChat.ts）

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Pop the partial model response from chat history
5. Yield RETRY event → UI discards partial output
6. Re-send the same request with maxOutputTokens: 64K
```

### RETRY 时的状态清理（turn.ts）

当 `Turn` 类接收到 RETRY 事件时，会清除累积状态以防止数据不一致：

- `pendingToolCalls` — 清除该状态，避免首次截断响应中已完成的 tool call 在扩容响应中重复执行，导致重复调用
- `pendingCitations` — 清除该状态，避免引用重复
- `debugResponses` — 清除该状态，避免残留过时的调试数据
- `finishReason` — 重置为 `undefined`，以便使用新响应的结束原因

## 常量

定义于 `tokenLimits.ts`：

| 常量                    | 值  | 用途                                                 |
| --------------------------- | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS` | 8,000  | 未设置用户覆盖时的默认输出 Token 限制 |
| `ESCALATED_MAX_TOKENS`      | 64,000 | 截断重试时使用的输出 Token 限制             |

## 设计决策

### 为什么默认值设为 8K？

- 99% 的响应不足 5K Token
- 8K 为稍长的响应提供了合理的缓冲空间，且不会触发不必要的重试
- 将平均插槽预留量从 32K 降至 8K（提升 4 倍）

### 为什么扩容限制设为 64K？

- 覆盖了绝大多数在 8K 处被截断的长输出
- 与众多现代模型（Claude Sonnet、Gemini 3.x、Qwen3.x）的输出限制相匹配
- 若设置更高的值（如 128K），将抵消那不足 1% 的扩容请求所带来的插槽优化收益

### 为什么不采用渐进式扩容（8K → 16K → 32K → 64K）？

- 每次重试都会增加延迟（必须重新生成完整响应）
- 单次重试是最简单的方案，且能覆盖几乎所有场景
- 8K 下的截断率不足 1%，意味着几乎不需要扩容；而真正需要扩容的请求，其所需 Token 数通常远超 16K

### 为什么将扩容逻辑放在重试循环之外？

- 截断属于成功场景，而非错误
- 扩容流产生的错误（如限流、网络故障）应直接向上抛出，而不是使用错误参数静默重试
- 保持重试循环专注于其原始设计目标（瞬时错误恢复）