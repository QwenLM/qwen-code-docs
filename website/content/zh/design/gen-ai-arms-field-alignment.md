# GenAI 与 ARMS 字段对齐

## 范围与标准基线

本设计对齐第一组 Qwen Code span 属性，这些属性的名称、类型和含义在
OpenTelemetry GenAI 语义约定与阿里云 ARMS LLM Trace 之间是一致的。
它不改变 span 名称、span 类型、父子关系或重试拓扑。
它还记录了可选启用（opt-in）的仅 ARMS 终端用户身份扩展。

OpenTelemetry GenAI 约定仍处于 Development 状态。本变更固定到 commit
[`2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b`](https://github.com/open-telemetry/semantic-conventions-genai/tree/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b)：

- [Inference spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-spans.md)
- [Agent spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-agent-spans.md)
- [GenAI registry](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/model/gen-ai/registry.yaml)

流式属性是一个较窄的补充，固定到
[OpenTelemetry Semantic Conventions v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/gen-ai-spans.md)。
该补充仅采纳 `gen_ai.request.stream` 和
`gen_ai.response.time_to_first_chunk`；它不是对上述基线的整体升级。

ARMS 基线是 [LLM Trace 字段定义](https://help.aliyun.com/zh/arms/application-monitoring/developer-reference/llm-trace-field-definition-description)。
对任一基线的升级都需要重新生成并审查该矩阵。

## 字段契约

| Span         | 本阶段发出的标准属性                                                                                                                                                                                                     | 来源与省略规则                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM          | `gen_ai.operation.name`、`gen_ai.provider.name`、`gen_ai.conversation.id`、`gen_ai.request.model`                                                                                                                       | 在 span 创建时写入。Conversation ID 即现有的 session ID。                                                                                                                  |
| LLM request  | `gen_ai.request.choice.count`、`gen_ai.request.max_tokens`、`gen_ai.request.temperature`、`gen_ai.request.top_p`、`gen_ai.request.frequency_penalty`、`gen_ai.request.presence_penalty`、`gen_ai.request.stop_sequences` | 从第一个 provider 终态 SDK 请求对象读取。无效或不可用的值会被省略；不推断 SDK 或服务端默认值。                                                                              |
| LLM stream   | `gen_ai.request.stream`、`gen_ai.response.time_to_first_chunk`                                                                                                                                                           | 流式请求发出 `true`；非流式请求省略标准 stream 标志。首 chunk 时间在第一个归一化响应到达后以秒为单位发出。                                                                     |
| LLM input    | `gen_ai.input.messages`、`gen_ai.system_instructions`、`gen_ai.tool.definitions`                                                                                                                                         | 来自同一个首个 provider 终态请求的敏感紧凑 JSON。每个完整值在无效或超限时独立省略。                                                                                          |
| LLM response | `gen_ai.response.id`、`gen_ai.response.model`、`gen_ai.response.finish_reasons`                                                                                                                                          | 仅来自 provider 响应数据。缺失的响应 model 会被省略，而不是替换为请求 model。所有候选的 finish reason 按候选索引排序。                                                        |
| LLM output   | `gen_ai.output.type`、`gen_ai.output.messages`                                                                                                                                                                           | 输出类型仅在受支持的 Gemini/Vertex 请求设置下发出。敏感输出消息来自最后一次物理请求尝试，并保留每一个候选。                                                                    |
| LLM usage    | `gen_ai.usage.input_tokens`、`gen_ai.usage.output_tokens`、`gen_ai.usage.cache_read.input_tokens`、`gen_ai.usage.cache_creation.input_tokens`                                                                            | 仅接受 provider 上报的非负安全整数。显式的零会被保留。当只上报总量时，省略 input/output 而不是估算。                                                                          |
| Tool         | `gen_ai.operation.name=execute_tool`、`gen_ai.tool.name`、`gen_ai.tool.description`、`gen_ai.tool.type=function`、`gen_ai.tool.call.id`、`gen_ai.tool.call.arguments`、`gen_ai.tool.call.result`                         | description 是非敏感的静态注册表元数据。敏感参数反映实际执行的调用；result 仅在工具调用成功时发出。                                                                           |
| Agent        | `gen_ai.operation.name=invoke_agent`、`gen_ai.agent.name`、`gen_ai.agent.description`、`gen_ai.conversation.id`、可选的 `gen_ai.request.model`                                                                            | description 沿用现有的 1024 个 UTF-16 码元截断阈值，且绝不拆分代理对（surrogate pair）。内部调用 ID 保持私有。                                                                |

没有精确标准等价物的私有属性仍可用于兼容，除非在下方被明确列出移除。
具有精确等价物的私有别名和无效的 GenAI 别名会被直接移除，不设 dual-write
过渡期：

| 移除的属性                                              | 替代                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| LLM `qwen-code.model`                                  | `gen_ai.request.model`；交互 span 继续使用 `qwen-code.model`，因为它们不是 GenAI inference span                        |
| LLM `response_id`                                      | `gen_ai.response.id`；API 响应/错误日志保留其现有的 `response_id` schema                                              |
| LLM `input_tokens`                                     | 当 provider 上报 input 拆分时为 `gen_ai.usage.input_tokens`                                                           |
| LLM `output_tokens`                                    | 当 provider 上报 output 拆分时为 `gen_ai.usage.output_tokens`                                                         |
| LLM `cached_input_tokens`                              | 当 provider 上报缓存读取时为 `gen_ai.usage.cache_read.input_tokens`                                                    |
| `qwen-code.tool` Span `tool.name`                      | `gen_ai.tool.name`；blocked-on-user 和 hook span 继续使用 `tool.name`                                                 |
| `gen_ai.usage.cached_tokens`                           | 当 provider 上报缓存读取时为 `gen_ai.usage.cache_read.input_tokens`                                                    |
| LLM `llm_request.stream`                               | `gen_ai.request.stream`；按语义约定，流式发出 `true`，非流式省略该属性                                                  |
| `gen_ai.server.time_to_first_token`                    | 不发出；它与标准首 chunk 属性并不等价                                                                                  |
| `gen_ai.usage.reasoning_tokens`                        | 本基线中没有 ARMS/GenAI 公共属性；继续查询私有 `thoughts_token_count`                                                  |
| LLM `system_prompt*`                                   | `gen_ai.system_instructions`；OpenAI 的 system/developer 消息表示在 `gen_ai.input.messages` 中                         |
| LLM `tools`、`tool_schema` 事件                        | `gen_ai.tool.definitions`                                                                                              |
| LLM `response.model_output*`                           | `gen_ai.output.messages`                                                                                               |
| Tool `tool_input*`                                     | `gen_ai.tool.call.arguments`                                                                                           |
| Tool `tool_result*`                                    | `gen_ai.tool.call.result`                                                                                              |
| `tools_count`、hash/preview/length/truncation 元数据   | 没有标准等价物；移除                                                                                                    |

`gen_ai.response.finish_reasons` 现在为所有候选保留 provider 的原始字符串，
而不再是之前 Gemini 归一化后的值。现有按 `STOP` 或 `MAX_TOKENS` 等值过滤的
查询必须迁移到 provider 的值，例如 `stop`、`length`、`tool_calls` 或
`end_turn`。

`gen_ai.response.time_to_first_chunk` 使用一个单调计时器，从被包装的
provider 调用开始之前计时，直到 `LoggingContentGenerator` 观察到第一个归一化
`GenerateContentResponse`。Provider 适配器可能在原始协议帧到达日志包装器之前
对其过滤或合并，因此被适配器丢弃的帧（例如 OpenAI 管道的空响应过滤器）不计入
该测量，记录的值可能晚于真实的首个网络帧。在通过适配器过滤后幸存的
仅元数据和仅 usage 的归一化响应也计为 chunk。如果流稍后失败、中止或超时，
该属性会被保留；如果没有 chunk 到达则省略。

内部 `ttftMs` 计时器仍然是首个用户可见输出的延迟，并继续驱动
`ApiResponseEvent.ttft_ms`、`sampling_ms`、`output_tokens_per_second` 以及
API 请求拆分指标。因此，`duration_ms - gen_ai.response.time_to_first_chunk * 1000`
并不等于 `sampling_ms`。

现有的流式 Span 查询应将 `llm_request.stream=true` 替换为
`gen_ai.request.stream=true`；非流式 span 通过 `gen_ai.request.stream` 的
缺失来识别（旧的 `llm_request.stream=false` 过滤现在匹配零行）。Span 的
`ttft_ms` 仍可用于首个用户可见输出延迟；
`gen_ai.response.time_to_first_chunk` 是一个独立的标准属性，以秒为单位测量
首个归一化 chunk 的延迟。

## Provider 与 operation 解析

解析是对生效的 content-generator 配置的纯函数。它绝不返回 URL、凭证、
任意代理主机名，或从模型名推断的值。

1. Qwen OAuth 以及 `DASHSCOPE_PROXY_BASE_URL` 的精确匹配解析为
   `dashscope`。
2. 边界安全的主机名匹配可识别阿里云百炼（Alibaba Model Studio）端点和
   阿里内部网关、Azure OpenAI，以及受支持的第三方端点（DeepSeek、xAI、
   Mistral、MiniMax、Z.AI、ModelScope、MiMo、OpenRouter 和 Requesty）。
3. 如果主机未知，已知的 `apiKeyEnvKey` 可识别已配置的 provider。冲突时
   主机身份优先。
4. 未知端点回退到协议 provider：`openai`、`anthropic`、`gcp.gemini` 或
   `gcp.vertex_ai`。

OpenAI 兼容、Anthropic 和 Qwen OAuth 请求使用 operation `chat`。
Gemini 和 Vertex AI 请求使用 `generate_content`。

## 请求参数

请求属性在 provider 适配器应用了默认值、覆盖、不支持字段的移除和输出窗口
钳制之后收集，就在调用 provider SDK 之前。这是 Qwen Code 可见的最终 SDK
请求对象，而不是原始的逻辑配置或序列化后的 HTTP 请求体。逻辑 LLM span 只
记录其第一个这样的请求快照。

| 标准属性                              | OpenAI 兼容与 Qwen OAuth                                     | Anthropic          | Gemini 与 Vertex AI       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------ | ------------------------- |
| `gen_ai.request.choice.count`      | `n`                                                        | 不适用             | `config.candidateCount`   |
| `gen_ai.request.max_tokens`        | `max_tokens`、`max_completion_tokens` 或 `max_new_tokens` | `max_tokens`       | `config.maxOutputTokens`  |
| `gen_ai.request.temperature`       | `temperature`                                              | `temperature`      | `config.temperature`      |
| `gen_ai.request.top_p`             | `top_p`                                                    | `top_p`            | `config.topP`             |
| `gen_ai.request.frequency_penalty` | `frequency_penalty`                                        | 目前不发送         | `config.frequencyPenalty` |
| `gen_ai.request.presence_penalty`  | `presence_penalty`                                         | 目前不发送         | `config.presencePenalty`  |
| `gen_ai.request.stop_sequences`    | `stop`                                                     | `stop_sequences`   | `config.stopSequences`    |

有限数值和安全整数会被精确保留，包括失败的 provider 请求中的零和负值。
Choice count 为 1 时省略。Stop sequences 必须是完整的字符串数组；OpenAI 的
单字符串形式会被归一化为单元素数组。空数组会被保留，混合数组会被整体省略
而不是过滤。显式的适配器默认值会被记录，而隐式的 SDK 或服务端默认值不做
推断。

当存在多个 OpenAI 兼容的输出预算别名时，仅当所有存在的值都是有效的安全整数
且相等时，才发出标准最大值。冲突的值会被省略，因为兼容端点之间没有共同的
优先级规则。

## 内容与工具负载

敏感 GenAI 内容仅在启用 `telemetry.includeSensitiveSpanAttributes` 时收集。
Qwen Code 不读取 `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`，
因此只有一个内容采集开关。OpenAI 兼容、Anthropic、Gemini 和 Vertex 适配器
将其 provider 终态 SDK 请求和原始响应结构转换为本设计所固定的 JSON schema。

第一个物理请求尝试提供输入消息、系统指令和工具定义。响应按 generation 划分
边界：provider 回退或 required-thinking 重试会启动一个新的响应累加器，来自
更早尝试的迟到 chunk 会被忽略。流式累加器保留规范化部分（canonical parts）
而不是原始 chunk。部分失败会用 `error` 标记未完成的候选；一个成功响应中若
某候选缺少显式 finish reason，则省略完整的输出消息属性。

每个 JSON 属性都被紧凑序列化，并由
`telemetry.sensitiveSpanAttributeMaxLength` 独立限制。无效、循环引用、不完整
或超限的属性值会被整体省略；JSON 绝不被截断。在 `gen_ai.tool.definitions`
内部，`type` 和 `name` 是必需的身份标识，因此无效的身份标识会省略整个属性。
`parameters` 在标准 schema 中是可选的；当 provider 提供的参数 schema 无法
归一化为 Draft-07 时，只省略该可选属性，同时保留有序的工具身份列表。当
provider 显式发送或返回空数组和空对象时，它们会被保留。在默认 1 MiB 限制
下，应用端的理论上限约为每个 LLM span 4 MiB 敏感属性和每个 Tool span 2 MiB。
Collector 和后端可以施加更低的限制。

工具参数在执行前一刻从最终调用参数中采集，即在权限和编辑 hook 之后。工具
结果仅在调用成功且后处理成功后采集，来自返回给模型的最终
`FunctionResponse.response` 对象。两者的根都必须是 JSON 对象。
`gen_ai.tool.description` 来自静态注册表描述，不属于敏感信息；它被限制在
4096 个 UTF-16 码元内，保留代理对，并在缩短时追加 `…[truncated]`。Agent
描述和 span 错误保持其 1024 个码元的限制。

## 响应与 usage 的 provenance

Provider 转换器使用 `WeakMap` 将内部 provenance 附加到归一化的 Gemini usage
对象上。它记录缓存读取字段是否实际存在，以及 Anthropic 的缓存创建 token。
这保留了公共响应 JSON 形态，并让垃圾回收可以跟随归一化的 usage 对象。

当 OpenAI 兼容的 provider 只上报 `total_tokens` 时，归一化的总量仍可供现有
内部使用方使用，但不会合成 input/output 拆分，也不会发出任何标准 usage 属性。

OpenAI 的 `response.model`/`chunk.model` 和 Anthropic 消息 model 被保留为
`modelVersion`。缺失的 provider model 在追踪中保持缺失；请求 model 的回退
仍仅限于现有的 API 日志和 UI 行为。流合并会将最后已知的 provider model 和
usage provenance 带入终结响应。Anthropic `message_start` 的 input 和缓存
usage 被附加到其后第一个产出的 chunk 上，使得部分流失败时仍保留 provider
上报的 usage，而无需合成 output 计数。

## ARMS 配置

ARMS 自动 GenAI 应用识别需要该资源属性：

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

Qwen Code 不会注入该厂商专属的资源属性或 `gen_ai.span.kind`。ARMS 可以从
`gen_ai.operation.name` 推断 LLM、Tool 和 Agent 角色。

### ARMS 终端用户身份扩展

`gen_ai.user.id` 是 ARMS Span 的公共属性，不属于上面固定的 OpenTelemetry
GenAI 基线。Qwen Code 仅在运维者显式配置 `telemetry.userId` 或
`QWEN_TELEMETRY_USER_ID` 时发出它。该值在创建时放置在交互 Span 上，并通过
现有的进程内上下文传播到 LLM、Tool 和 Agent span，包括以链接为根的
fork/后台 agent。工具结果的延续（continuation）通过 prompt ID 解析到同一个
逻辑交互，而不改变 Span 的父子关系；该最小身份条目随现有的 30 分钟 Span
安全网 TTL 一起过期。

该值绝不被推断、生成、写入 Resource/logs/metrics，或放置在出站 Baggage 中。
Qwen Code 不做 `enduser.id` 或 `user.id` 的 dual-write。之前的
`telemetry.resourceAttributes.user.id` 仍是通用的 Resource 维度，迁移时必须
显式移除。由于该设置是全进程范围的，它仅在一个进程代表一个终端用户时受支持；
共享 daemon 和 channel 部署的请求级身份要等到其可信调用方身份可以端到端
接通后再做。

## 延迟处理的工作

- `seed` 和 `top_k` 在两个基线中具有不兼容的 ARMS 与 GenAI 类型。
- Embedding 在追踪之前需要一个正确的 requested-model 生命周期。
- ARMS 的 time-to-first-token 与 OpenTelemetry 的 time-to-first-chunk 在
  名称、单位和含义上都不同。Qwen Code 在发出标准
  `gen_ai.response.time_to_first_chunk` 的同时发出私有 `ttft_ms`，并且不
  承诺自动填充 ARMS 的首 token 仪表盘。
- 完整的 GenAI span 命名、CLIENT span 类型和逻辑重试拓扑是一个单独的合规
  项目。
