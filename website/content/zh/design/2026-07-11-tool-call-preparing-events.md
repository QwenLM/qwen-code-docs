# 工具调用准备事件

## 背景

Qwen Code 目前只在 provider 完成参数流式传输之后才发出工具调用。对于输入较大或较复杂的工具，生成这些参数所花的时间可能远长于执行工具本身。因此 ACP 客户端在这个高开销阶段看不到任何活动，用户可能误以为该轮次已经卡死。

provider 流在参数完成之前就已经暴露了稳定的工具身份：

- Anthropic 会在 `tool_use` 块的 `content_block_start` 中发送 `id` 和 `name`，然后以 `input_json_delta` 的形式发送参数片段。
- OpenAI 兼容 provider 通常在第一个 `choice.delta.tool_calls` 项中发送 `id` 和 `function.name`，然后追加参数片段。

Qwen Code 有意在 `content_block_stop` 或 `finish_reason` 之后才构造 Gemini 兼容的 `functionCall`。这一执行安全属性必须保持不变。

## 目标

让 ACP 客户端能够在模型仍在准备工具参数时渲染工具卡片，其生命周期如下：

```text
preparing -> in_progress -> completed | failed
```

早期事件只包含稳定的工具调用 ID 和工具名称。它绝不包含部分参数，也绝不启动工具执行。

## 范围

此变更支持集成客户端所使用的两条 provider 路径：

- Anthropic 及 Anthropic 兼容的流式响应。
- OpenAI 及 OpenAI 兼容的流式响应。

其他 provider 保持当前行为。由于准备元数据是可选的，它们会自然降级为现有的 `in_progress -> completed | failed` 生命周期。

此变更不改变：

- 工具权限检查；
- hook 顺序；
- 工具调度或执行；
- 模型对话历史；
- `functionCall` 或 `functionResponse` 的构造；
- 非 ACP 的输出格式。

## 设计

### 1. 内部响应元数据

通过模块本地的 `WeakMap` 将瞬时的工具准备元数据与每个 `GenerateContentResponse` 关联：

```ts
interface ToolCallPreparation {
  callId: string;
  toolName: string;
}
```

Provider 适配器将该元数据存储在顶层响应块上。它既不是可枚举的响应属性，也不是 Gemini `Part`，因此不会被序列化，Gemini 历史组装继续只能看到 text、thought 和完整的 `functionCall` 部分。共享 helper 提供带类型的存储和读取操作，避免在 ACP 中出现针对特定 provider 的强制转换。

### 2. Anthropic 生产者

在 `AnthropicContentGenerator.processStream()` 中，当 `content_block_start(tool_use)` 包含非空的 `id` 和 `name` 时，产出一个在其他方面为空的 Gemini 响应块，其中携带一个准备条目。

继续不变地累积 `input_json_delta`。在 `content_block_stop` 处，发出带有已解析参数的现有完整 `functionCall`。在该时点之前不暴露任何参数数据。

### 3. OpenAI 兼容生产者

在 `convertOpenAIChunkToGemini()` 中，在每个 `choice.delta.tool_calls` 项被传递给现有的流内本地工具调用解析器之后对其进行观察。当首次获得稳定的非空 ID 和名称时，将一个准备条目附加到当前响应块上。

在请求上下文内按工具调用 ID 去重。仅在存在 `finish_reason` 时才继续发出完整的 `functionCall`。未尽早暴露两个身份字段的 provider 只是保持现有行为。

### 4. ACP 消费者与状态转换

ACP `Session` 在收集完整 `functionCalls` 之前读取准备元数据。对于每个新的准备，它发出标准的 ACP `tool_call` 帧：

```ts
{
  status: 'pending',
  rawInput: {},
  _meta: {
    phase: 'preparing',
    toolName,
    // 现有的来源元数据仍然存在
  },
}
```

现有的执行路径之后会以 `status: 'in_progress'` 和完整参数发出相同的 `toolCallId`。现有的结果发出随后将该卡片完结为 `completed` 或 `failed`。

`TodoWrite` 保持其当前的特殊处理，不发出工具卡片。准备发出使用相同的过滤规则，因此不会创建执行路径有意压制的卡片。

### 5. 重试、回退、取消和流失败

每个活跃的 ACP 模型流都跟踪准备，直到流完成并把解析出的调用交给工具执行。当一个尝试因重试、模型回退、用户取消或流错误而被放弃时，ACP 会为每个剩余条目发出终态的 `tool_call_update`：

```ts
{
  status: 'failed',
  content: [],
  _meta: {
    phase: 'preparing',
    preparationDiscarded: true,
    toolName,
  },
}
```

`preparationDiscarded` 表示模型尝试在解析出的工具请求到达执行之前就被放弃了。它不是工具执行失败。集成客户端应该移除这一瞬时卡片，而不是渲染一个失败的工具。使用协议有效的终态状态可以确保较旧的客户端不会保留一个无限 pending 的卡片。

`RETRY` 现在会清除从被放弃尝试中收集的完整 `functionCalls`，与所有四条 ACP 流路径中现有的 `MODEL_FALLBACK` 行为一致。这可以防止来自失败尝试的已解析调用与来自替代尝试的调用一起执行。

当具有相同 ID 的完整 `functionCall` 到达且流正常结束时，ACP 将其交给现有的执行路径，而不发出 discarded 更新。如果流在解析出调用之后、执行之前失败，该准备仍会被丢弃。因此正常的工具错误继续走现有的结果路径，绝不会被标记为 discarded。

## 下游影响

- `GeminiChat` 和历史构建器忽略可选的顶层元数据，继续只持久化候选内容。
- 只包含准备元数据的响应不算作用户可见的输出，因此传输重试和模型回退保持其现有的输出前行为。
- 准备 ID 使用与完整 `functionCall` ID 相同的跨轮次规范化，在 provider 复用历史中的 ID 时保持 ACP 更新的关联。
- 核心 `Turn`、TUI 和非交互式 JSON 消费者保持当前行为，因为没有引入新的 Gemini `Part` 或服务器事件。
- ACP 是唯一选择使用该元数据并发出早期 UI 状态的消费者。
- Anthropic 和 OpenAI 兼容适配器共享相同的元数据契约，因此 ACP 没有针对特定 provider 的分支。

## 测试计划

### 核心 provider 测试

- Anthropic：`content_block_start(tool_use)` 在任何 `input_json_delta` 之前、也在最终 `functionCall` 之前产出准备元数据。
- Anthropic：缺少 ID 或名称时不发出准备元数据。
- OpenAI 兼容：第一个带有稳定 ID 和名称的 delta 发出一个准备条目；之后的参数 delta 不会重复发出。
- OpenAI 兼容：完整调用仍然只在 `finish_reason` 时出现，解析出的参数不变。
- OpenAI 兼容：缺少早期身份字段时回退到当前行为，不会产生无效的准备事件。
- GeminiChat：仅包含准备的块不会抑制传输重试、主模型回退，或经由多模型回退链的继续。
- GeminiChat：跨轮次重复的 provider ID 在准备元数据和完整调用中以一致的方式规范化。

### ACP 测试

- 准备元数据发出 `pending`，带 `_meta.phase = 'preparing'`，且没有部分输入。
- 完整调用复用相同的 ID，并以完整参数转换为 `in_progress`。
- 重试、回退、取消和流错误会以 `_meta.preparationDiscarded = true` 丢弃尚未到达工具执行的准备。
- 重试和模型回退在接受替代块之前，会清除从被放弃尝试中收集的完整调用。
- 已变为完整调用的准备在正常完成的流之后不会被丢弃，但如果该流在执行前失败则会被丢弃。
- `TodoWrite` 保持被压制。

### 回归验证

从各自的包目录运行聚焦的 provider 和 ACP 套件，然后在完成之前运行仓库的 build、typecheck 和 lint。rebase 到 v0.19.9 的实现已通过以下验证：

- 核心 provider 和流套件：649 项通过。
- ACP 生命周期套件：316 项通过。
- 仓库 build、工作空间 typecheck 和完整 lint：通过。
- 变更文件的 Prettier 和 diff 检查：通过。

## 验收标准

1. Anthropic 和 OpenAI 兼容的 ACP 轮次在稳定的工具身份可用时立即发出 pending 工具卡片。
2. 在完整参数就绪、现有的权限和执行路径运行之前，不会启动任何工具。
3. 完整调用和结果保持其当前的 ID、参数、顺序和历史表示。
4. 被放弃的尝试不会留下无限 pending 的准备卡片。
5. 没有准备元数据的 provider 行为与之前完全一致。
