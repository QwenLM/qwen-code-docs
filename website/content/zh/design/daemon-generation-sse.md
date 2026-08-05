# Daemon 无状态 generation SSE

## 目标

新增 `POST /session/:id/generate`，一个请求作用域的 SSE 端点，用于短小的无状态文本生成。调用方提供一个纯文本 `prompt`。ACP 子进程先解析配置的 fast model，当 fast model 缺失或无法解析时回退到会话的主模型。

## 契约

请求体为 `{ "prompt": string }`。prompt 必须非空，且 UTF-8 大小不超过 32 KiB。该端点发出 `started`、可选的 `thinking`、`delta`、`done` 和 `error` SSE 事件。它通过 `fetch` 消费，因为原生 `EventSource` 无法发送 POST 主体。

generation 与主对话隔离：它不读取或修改聊天历史，不使用主 system prompt 或 memory，并且总是发送 `tools: []`。客户端无法选择模型或生成设置。该契约与任务无关：翻译是第一个 Web Shell 消费方，但不是端点 schema 的一部分。

## 架构

路由向 `AcpSessionBridge` 请求一个 generation 流。bridge 创建一个请求 ID，并在向 ACP 子进程分发 `qwen/control/session/generation/start` 之前注册一个有界的请求作用域队列。子进程先尝试 `config.getFastModel()`，在解析期间回退到 `config.getModel()`，通过 `BaseLlmClient.resolveForModel` 创建匹配的 content generator，并消费 `generateContentStream`。chunk 通过 `qwen/notify/session/generation/event` 返回，并且只路由到已注册的请求队列。它们不会发布到会话 EventBus 或重放环。

客户端断开会发送 `qwen/control/session/generation/cancel`；子进程中止匹配的 controller。有界的 bridge 队列保护 daemon 免受慢速 HTTP 读取者的影响。HTTP 写入者遵守 `res.write()` 背压。

## 模型回退

回退只发生在选择时。缺失或无效的 fast model 会选择主模型。一旦 generation 开始，provider 失败即终止流；在已发出 delta 之后切换模型会导致输出重复或混杂。

## Web Shell 思考翻译

已完成的思考块在悬停时暴露翻译操作。思考块展开期间该操作保持可见。Web Shell 通过此端点发送翻译 prompt，并在 popover 中渲染 delta。最终的输入和输出 token 计数显示在译文下方。popover 可以取消进行中的请求，或丢弃缓存结果并重新翻译。无内容的 `thinking` 事件在不暴露推理的情况下报告进度。活跃的思考块绝不暴露该操作。已完成的翻译按语言、消息和内容缓存在页面内存中，因此重新打开 popover 不会再发起模型请求；页面刷新会清空缓存。

## 非目标

- 对话上下文或历史
- 工具调用
- 任意模型或采样覆盖
- SSE 重放或重连续接
- 任务注册表或任务特定 schema
- 对 `packages/core` 的修改
