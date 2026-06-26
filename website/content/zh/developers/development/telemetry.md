# 基于 OpenTelemetry 的可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [基于 OpenTelemetry 的可观测性](#observability-with-opentelemetry)
  - [主要优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [阿里云遥测](#aliyun-telemetry)
    - [手动 OTLP 导出](#manual-otlp-export)
  - [本地遥测](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于收集器的导出（高级）](#collector-based-export-advanced)
  - [日志与指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)

## 主要优势

- **🔍 使用分析**：了解团队内部的交互模式与功能采用情况
- **⚡ 性能监控**：跟踪响应时间、Token 消耗及资源利用率
- **🐛 实时调试**：在瓶颈、故障和错误模式发生时即时识别
- **📊 工作流优化**：做出明智决策以改进配置和流程
- **🏢 企业治理**：跨团队监控使用情况、跟踪成本、确保合规性，并集成现有监控基础设施

## OpenTelemetry 集成

Qwen Code 的可观测性系统构建于 **[OpenTelemetry]** 之上——这是一个厂商中立、行业标准的可观测性框架，它提供：

- **通用兼容性**：导出到任何 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中使用一致的格式和采集方法
- **面向未来的集成**：与现有和未来的可观测性基础设施对接
- **无厂商锁定**：无需修改检测代码即可切换后端

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 配置

所有遥测行为均通过 `.qwen/settings.json` 文件控制。这些设置可通过环境变量或 CLI 标志覆盖。

| 设置                               | 环境变量                                           | CLI 标志                                                     | 描述                                                                                                                                                         | 值                 | 默认值                  |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                           | `--telemetry` / `--no-telemetry`                             | 启用或禁用遥测                                                                                                                                               | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                            | `--telemetry-target <local\|gcp>` _(已弃用)_                 | 信息性目标标签；不控制导出器路由——通过设置 `otlpEndpoint` 或 `outfile` 来配置数据发送位置                                                                      | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                     | `--telemetry-otlp-endpoint <URL>`                            | OTLP 收集器端点                                                                                                                                              | URL 字符串        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                     | `--telemetry-otlp-protocol <grpc\|http>`                     | OTLP 传输协议                                                                                                                                                | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`              | -                                                            | 针对 Traces 的单信号端点覆盖（仅 HTTP）                                                                                                                       | URL 字符串        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                | -                                                            | 针对 Logs 的单信号端点覆盖（仅 HTTP）                                                                                                                         | URL 字符串        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`             | -                                                            | 针对 Metrics 的单信号端点覆盖（仅 HTTP）                                                                                                                      | URL 字符串        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                           | `--telemetry-outfile <path>`                                 | 将遥测数据保存到文件（覆盖 OTLP 导出）                                                                                                                       | 文件路径          | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`     | 在遥测日志中包含提示词                                                                                                                                       | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | -                                                            | 将用户提示词、系统提示词、工具 I/O 和模型输出作为原生 span 属性（除了 log-to-span 桥接 span 之外）                                                            | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                            | 每个敏感原生 span 属性内容负载的最大 JavaScript 字符串长度。如果后端拒绝大属性，请设置更小的值。                                                             | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`) | -                                                            | 附加到每个导出 span / log / metric 的静态资源属性。参见下文 [Resource attributes](#resource-attributes)。                                                       | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`        | -                                                            | 在 metric 数据点上包含 `session.id`。**默认禁用**，以保护 metric 后端免受时间序列扇出影响。                                                                  | `true`/`false`    | `false`                 |

**关于布尔型环境变量的说明：** 对于布尔型设置（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`），将相应环境变量设置为 `true` 或 `1` 时启用该功能。任何其他值都会禁用。

**关于整型环境变量的说明：** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` 在设置时必须为正整数。无效值会导致遥测配置解析失败，而不是静默回退。

**敏感 span 属性：** 当启用 `includeSensitiveSpanAttributes` 时，会发生两件事：

1. **原生 span 属性（`qwen-code.interaction`、`api.generateContent*`、`tool.<name>`）** 包含逐字对话内容：
   - 用户提示词（`new_context`）
   - 系统提示词（`system_prompt`——每个会话全文本一次，基于 SHA-256 哈希去重；后续 span 仅携带 `system_prompt_hash`、`system_prompt_preview` 和 `system_prompt_length`）
   - 工具 Schema（作为 `tool_schema` 事件发出，同样基于哈希去重）
   - 工具输入（`tool_input`）和工具结果（`tool_result`）
   - 模型输出（`response.model_output`）

   每个内容负载会被截断到 `sensitiveSpanAttributeMaxLength` 个 JavaScript 字符串单位。默认值为 1 MiB（`1048576`），相较于之前的默认 60 KiB 有所提高；设置 `61440` 可保留旧的限制。该限制必须在 `1` 到 `104857600`（100 MiB）之间。对于带标签的属性，固定标签（如 `[USER PROMPT]`、`[TOOL INPUT: ...]` 和 `[TOOL RESULT: ...]`）计入该限制；截断标记也计入该限制。该限制以 JavaScript 字符串长度衡量，而非 UTF-8 字节。因此，非 ASCII 内容在 OTLP 导出后可能占用更多字节。对于大多数负载类型，截断会同时添加 `*_truncated` 和 `*_original_length`。系统提示词在截断时也会设置 `system_prompt_truncated`，但使用始终存在的 `system_prompt_length` 表示原始长度。

2. **Log-to-span 桥接 span**（当 HTTP trace 导出时没有配置 logs 端点时会用到）会保留其原有的 `prompt`、`function_args` 和 `response_text` 字段，而不是被丢弃。

⚠️ **安全警告：** 启用此标志会将完整的对话历史、`read_file` 读取的文件内容、shell 命令及其输出（包括环境变量或参数中的秘密信息）以及模型响应流式传输到配置的 OTLP 后端。请将该后端视为特权数据接收器。该标志默认为 `false`。

**成本/负载大小：** 一次较重的交互，在默认限制下（1 MiB 系统提示词加上 10 次工具调用，每次最多 1 MiB 输入 + 1 MiB 结果，再加上 1 MiB 模型输出），在 OTLP 压缩前可能产生约 ~22 MiB 的属性负载，以及在包含大型工具定义的工作区中每次发射的工具 Schema 最多 1 MiB。这是 Qwen Code 应用端的上限，并不保证每个收集器或后端都能接受如此大的单一属性。如果 span 被拒绝或丢弃，请降低 `sensitiveSpanAttributeMaxLength`（例如设为 `61440`）并监控导出器吞吐量。

此设置不会禁用 OTel 日志或其他遥测接收器中的敏感数据；非内部 API 响应遥测可以填充 `response_text`，因此 OTel 日志、UI 遥测和聊天记录可能独立于该设置接收到响应文本。QwenLogger 不包含 `response_text`。

**HTTP OTLP 信号路由：** 当使用 HTTP 协议（`otlpProtocol: "http"`）时，Qwen Code 会自动将信号特定路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）附加到基本 `otlpEndpoint` 上。例如，`http://collector:4318` 对于 traces 变为 `http://collector:4318/v1/traces`。如果 URL 已经以信号路径结尾，则按原样使用。单信号端点覆盖（`otlpTracesEndpoint` 等）优先级高于基本端点，并按原样使用。gRPC 协议使用基于服务的路由，不附加路径。

单信号端点环境变量也接受标准的 OpenTelemetry 名称：`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` 变体优先级高于 `OTEL_*` 变体。

有关所有配置选项的详细信息，请参见[配置指南](../../users/configuration/settings.md)。

### 资源属性

资源属性是静态的键值对，附加到通过 OTLP 导出的每个 span、log 和 metric 上。使用它们可以按团队、环境、部署区域或后端关心的任何维度来切分遥测数据。

两个来源，按优先级合并（低 → 高）：

1. 标准环境变量 `OTEL_RESOURCE_ATTRIBUTES`
2. `.qwen/settings.json` 中的 `telemetry.resourceAttributes`（键冲突时覆盖环境变量）

`OTEL_SERVICE_NAME` 是一个独立的转义方式——当设置时，它会覆盖来自任何其他源的 `service.name`（根据 OpenTelemetry 规范）。

#### 示例

**按团队/环境切分所有遥测数据：**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**通过 `service.name` 路由到每个租户的收集器：**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**舰队基线（`~/.qwen/settings.json`）+ 每主机覆盖：**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# 添加一次性的标签而不修改 settings：
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 保留键

某些键由运行时控制，无法被覆盖：

- `service.version`——始终设置为运行中的 CLI 版本。从任何源设置该键都会静默丢弃并发出警告。
- `session.id`——每次会话由运行时注入。用户从环境变量或 settings 中提供的值会被丢弃并发出警告。原因是 Resource 属性会自动附加到每个 metric 数据点上；允许用户覆盖会绕过下面[基数控制](#cardinality-controls)的限制。Span 和 log 始终携带 `session.id`。

`service.name` **不是**保留键；它遵循上述优先级链。

#### 格式

`OTEL_RESOURCE_ATTRIBUTES` 遵循 OpenTelemetry 规范：`key1=value1,key2=value2`，值使用百分号编码。值中的空格必须编码为 `%20`，**逗号编码为 `%2C`**（未编码的逗号会在错误边界分割值，后半部分会被丢弃为格式错误）。格式错误的键值对会被跳过并发出警告，而不会导致遥测启动失败。

#### 故障排查：当用户提供的属性似乎未生效时

保留键（`service.version`、`session.id`）、格式错误的键值对、非字符串的 settings 值以及无效的百分号编码都会静默丢弃，并通过 OpenTelemetry 诊断通道记录警告。该通道将日志路由到调试日志文件（`~/.qwen/log/otel-*.log`），**而不是**控制台，因此行为可能看起来像是静默失败。

如果自定义资源属性未出现在导出的遥测数据中：

1. 检查 `~/.qwen/log/otel-*.log` 中匹配 `cannot override`（保留键被丢弃）、`Skipping malformed`（环境变量对格式错误）或 `must be a string`（settings 值非字符串）的行。
2. 验证环境变量是否在 qwen-code 进程的环境中（不仅仅是 shell 中）设置，并且值已百分号编码。
3. 确认 `telemetry.enabled` 为 `true`——遥测初始化仅在启用时运行。

### 基数控制

度量在后端按属性集聚合——每个不同的属性值组合都会产生一个时间序列。将高基数字段（如 `session.id`）附加到 metric 上会导致时间序列与会话数量成比例扇出，迅速耗尽 metric 后端存储。

为了防止这种情况，Qwen Code 默认将高基数属性排除在 metric 数据点之外。Span 和 log 是按事件的，不受影响，因此它们仍会携带 `session.id` 用于 trace 和 log 关联。

#### `telemetry.metrics.includeSessionId`（默认：`false`）

将此设置为 `true`（通过 settings 或 `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`）会将 `session.id` 重新附加到每个 metric 数据点上。

⚠️ **警告：** 每个 CLI 会话都会创建一个新值。在舰队范围内保持此选项开启会导致 metric 存储爆炸。建议仅用于短期调试。对于长期会话关联，请改用 trace 或 log 后端进行查询。

#### 从早期版本迁移

在此版本之前，`session.id` 默认附加到 metric 上。如果你的 Prometheus 查询 / Grafana 仪表板 / 告警规则引用了 metric 上的 `session_id`，你有两个选择：

**选项 A**——恢复之前的行为用于短期调试：

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

或：

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**选项 B（推荐）**——将会话级分析从 metric 中移出。Span 和 log 仍然携带 `session.id`，trace / log 后端（Jaeger、Tempo、Loki、阿里云 SLS / ARMS Tracing）原生支持按会话切分，没有基数压力。

### 出站 fetch 的客户端 HTTP span

当遥测启用时，Qwen Code 会注册 `UndiciInstrumentation`，它为进程发起的每个出站 `fetch()` 请求创建一个客户端 HTTP span——包括 LLM SDK（`openai`、`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTP 客户端、`WebFetch` 工具以及任何 IDE 扩展的进程外调用。该 span 让您能够分别查看网络延迟（TTFB / 响应体传输）和上游模型处理时间，这是现有的 `api.generateContent` span 无法区分的。

这些 span 会发送到您**自己**的 OTLP 收集器（或文件 outfile），就像其他遥测数据一样——它们不会影响写入出站 HTTP 请求本身的内容。W3C `traceparent` 头是否也写入出站请求流，由一个**独立的、安全相关的设置**控制，详见下面[出站关联](#outbound-correlation-security-relevant)的文档。

**反馈循环避免。** OTel SDK 内部使用 `fetch` 上传 OTLP 数据。如果不加保护，对 `fetch` 的检测也会对这些上传进行追踪，而这些追踪本身又会被上传，从而造成无限循环。Qwen Code 的 undici 检测配置了一个 `ignoreRequestHook`，它会跳过与配置的 `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` 前缀匹配的 URL。在文件输出模式下，没有出站 HTTP 上传，因此该 hook 为空操作。

## 出站关联（安全相关）

这些设置**有意**与 `telemetry.*` 位于**不同的顶级命名空间**：telemetry 控制数据流向操作员自己的可观测性后端，而 `outboundCorrelation.*` 控制 qwen-code 将哪些客户端关联数据**写入到达第三方 LLM 提供者端点（DashScope、OpenAI、Anthropic 等）的出站 LLM API 请求流**。不同的接收者，不同的同意决策。**所有值默认关闭。** 关于此框架的详细讨论请参见 PR #4390 的评审讨论。

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // 默认值
}
```

当设置为 `false`（默认值）时，Qwen Code 会在 OTel SDK 上安装一个空操作的 `TextMapPropagator`。UndiciInstrumentation 仍然会为您的 OTLP 收集器创建客户端 HTTP span，但 `propagation.inject()` 是空操作，因此**不会将 `traceparent` 写入出站请求**。Trace ID 保持仅在操作员自己的收集器内部。

当设置为 `true` 时，SDK 的默认 W3C 复合传播器（`tracecontext` + `baggage`）会被安装，并且标准的 `traceparent` 头会被写入每个出站 `fetch`：

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

仅当 LLM 提供者也将数据报告到您的 OTel 收集器（用于跨进程 trace 拼接）时才选择加入——例如为 DashScope 服务的 ARMS Tracing。对于大多数操作员，该值为 `false`；跨厂商的 trace 延续是少数情况。
**依赖于 `telemetry.enabled: true`。** OTel SDK 仅在遥测启用时初始化，因此 `propagateTraceContext` 仅在该状态下生效。在遥测禁用时将其设为 `true` 是一个静默空操作——没有 SDK，没有传播器，也没有 `traceparent` 在网络上传输。在配置 ARMS+DashScope 关联时，请同时检查这两个标志：

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### 其他出站关联头

`X-Qwen-Code-Session-Id` 和 `X-Qwen-Code-Request-Id` **不属于此次 PR 的范围**。它们将在各自的后续 PR 中设计和提议，位于相同的 `outboundCorrelation.*` 命名空间下，每个都带有自己的威胁模型和操作员同意流程。PR #4390 审查（LaZzyMan）确立了原则：“遥测的工作范围不包括向 LLM 提供商发送标识符”；关联头的工作将移至单独的设计讨论，而不是归入遥测范畴。

## 阿里云遥测

### 手动 OTLP 导出

要在阿里云可观测监控 Prometheus 版（Managed Service for OpenTelemetry）中查看 Qwen Code 的遥测数据，请配置 Qwen Code 将数据导出到 ARMS 提供的 OTLP 端点。

仅设置 `"target": "gcp"` 并不能配置导出目的地。如果未设置 `otlpEndpoint`，Qwen Code 仍会默认使用 `http://localhost:4317`。如果设置了 `outfile`，它将覆盖 `otlpEndpoint`，遥测数据将写入文件而不是发送到阿里云。

1. 在 `.qwen/settings.json` 中启用遥测并设置 OTLP 端点：

   **选项 A：gRPC 协议**（标准 OTLP 端点）：

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **选项 B：HTTP 协议与按信号端点**（适用于使用非标准路径的后端，例如 `/api/otlp/traces` 而非 `/v1/traces`）：

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **注意：** 当使用 HTTP 协议且仅提供 `otlpEndpoint`（无按信号覆盖）时，Qwen Code 会将标准 OTLP 路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）附加到基础 URL。如果您的后端使用不同的路径，请使用选项 B 中所示的按信号端点覆盖。

2. 如果您的阿里云端点需要身份验证，请通过标准的 OpenTelemetry 环境变量（如 `OTEL_EXPORTER_OTLP_HEADERS` 或信号特定的变量）提供 OTLP 头部。Qwen Code 目前不在 `.qwen/settings.json` 中直接暴露 OTLP 认证头部。
3. 运行 Qwen Code 并发送提示。
4. 在可观测监控 Prometheus 版中查看遥测数据：
   - 产品概述：[什么是可观测监控 Prometheus 版？][aliyun-opentelemetry-overview]
   - 快速入门：[使用可观测监控 Prometheus 版][aliyun-opentelemetry-get-started]
   - 控制台入口：
     - 中国内地：[trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （旧版控制台：[tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国际站：[arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - 在控制台中，使用 `应用` 来检查链路和服务拓扑。
   - 要查找 OTLP 端点和访问信息：
     - **新版控制台**（`trace.console.aliyun.com` 或国际站）：导航至 `集成中心`。
     - **旧版控制台**（`tracing.console.aliyun.com`）：导航至 `集群配置` → `接入点信息`。

## 本地遥测

对于本地开发和调试，您可以在本地捕获遥测数据：

### 基于文件的输出（推荐）

1. 在 `.qwen/settings.json` 中启用遥测：

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **注意：** 当设置了 `outfile` 时，OTLP 导出会自动禁用。文件输出不需要 `target` 和 `otlpEndpoint` 设置，可以安全地从配置中省略。

2. 运行 Qwen Code 并发送提示。
3. 在指定的文件（例如 `.qwen/telemetry.log`）中查看日志和指标。

### 基于收集器的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   这将：
   - 下载并启动 Jaeger 和 OTEL 收集器
   - 为本地遥测配置您的工作区
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存到 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时（例如 `Ctrl+C`）停止收集器
2. 运行 Qwen Code 并发送提示。
3. 在 http://localhost:16686 查看链路，在收集器日志文件中查看日志/指标。

## 日志和指标

以下部分描述 Qwen Code 生成的日志和指标的结构。

- `sessionId` 作为公共属性包含在所有日志和指标中。

### 日志

日志是特定事件的时间戳记录。以下是 Qwen Code 记录的事件：

- `qwen-code.config`：该事件在启动时发生一次，包含 CLI 配置。
  - **属性**：
    - `model`（字符串）
    - `sandbox_enabled`（布尔值）
    - `core_tools_enabled`（字符串）
    - `approval_mode`（字符串）
    - `file_filtering_respect_git_ignore`（布尔值）
    - `debug_mode`（布尔值）
    - `truncate_tool_output_threshold`（数值）
    - `truncate_tool_output_lines`（数值）
    - `hooks`（字符串，以逗号分隔的钩子事件类型，若钩子被禁用则省略）
    - `ide_enabled`（布尔值）
    - `interactive_shell_enabled`（布尔值）
    - `mcp_servers`（字符串）
    - `output_format`（字符串："text" 或 "json"）

- `qwen-code.user_prompt`：该事件在用户提交提示时发生。
  - **属性**：
    - `prompt_length`（整数）
    - `prompt_id`（字符串）
    - `prompt`（字符串，如果 `log_prompts_enabled` 配置为 `false` 则排除该属性）
    - `auth_type`（字符串）

- `qwen-code.tool_call`：该事件在每次函数调用时发生。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject"、"auto_accept" 或 "modify"，如果适用）
    - `error`（如果适用）
    - `error_type`（如果适用）
    - `content_length`（整数，如果适用）
    - `metadata`（如果适用，字符串到任意值的字典）

- `qwen-code.file_operation`：该事件在每次文件操作时发生。
  - **属性**：
    - `tool_name`（字符串）
    - `operation`（字符串："create"、"read"、"update"）
    - `lines`（整数，如果适用）
    - `mimetype`（字符串，如果适用）
    - `extension`（字符串，如果适用）
    - `programming_language`（字符串，如果适用）
    - `diff_stat`（JSON 字符串，如果适用）：包含以下成员的 JSON 字符串：
      - `ai_added_lines`（整数）
      - `ai_removed_lines`（整数）
      - `user_added_lines`（整数）
      - `user_removed_lines`（整数）

- `qwen-code.api_request`：该事件在向 Qwen API 发起请求时发生。
  - **属性**：
    - `model`
    - `request_text`（如果适用）

- `qwen-code.api_error`：如果 API 请求失败，则发生该事件。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：该事件在收到 Qwen API 的响应时发生。
  - **属性**：
    - `model`
    - `status_code`
    - `duration_ms`
    - `error`（可选）
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text`（如果适用）
    - `auth_type`

- `qwen-code.tool_output_truncated`：当工具调用的输出过大并被截断时触发。
  - **属性**：
    - `tool_name`（字符串）
    - `original_content_length`（整数）
    - `truncated_content_length`（整数）
    - `threshold`（整数）
    - `lines`（整数）
    - `prompt_id`（字符串）

- `qwen-code.malformed_json_response`：当 Qwen API 的 `generateJson` 响应无法解析为 JSON 时触发。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：当 Qwen Code 切换到 flash 作为回退时触发。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：当用户执行斜杠命令时触发。
  - **属性**：
    - `command`（字符串）
    - `subcommand`（字符串，如果适用）

- `qwen-code.extension_enable`：当扩展被启用时触发
- `qwen-code.extension_install`：当扩展被安装时触发
  - **属性**：
    - `extension_name`（字符串）
    - `extension_version`（字符串）
    - `extension_source`（字符串）
    - `status`（字符串）
- `qwen-code.extension_uninstall`：当扩展被卸载时触发

### 指标

指标是随时间变化的行为的数值测量。以下是 Qwen Code 收集的指标（指标名称保持 `qwen-code.*` 以便兼容）：

- `qwen-code.session.count`（计数器，整数）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（计数器，整数）：统计工具调用次数。
  - **属性**：
    - `function_name`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject" 或 "modify"，如果适用）
    - `tool_type`（字符串："mcp" 或 "native"，如果适用）

- `qwen-code.tool.call.latency`（直方图，毫秒）：测量工具调用延迟。
  - **属性**：
    - `function_name`
    - `decision`（字符串："accept"、"reject" 或 "modify"，如果适用）

- `qwen-code.api.request.count`（计数器，整数）：统计所有 API 请求。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（如果适用）

- `qwen-code.api.request.latency`（直方图，毫秒）：测量 API 请求延迟。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（计数器，整数）：统计使用的 token 数量。
  - **属性**：
    - `model`
    - `type`（字符串："input"、"output"、"thought" 或 "cache"）

- `qwen-code.file.operation.count`（计数器，整数）：统计文件操作次数。
  - **属性**：
    - `operation`（字符串："create"、"read"、"update"）：文件操作类型。
    - `lines`（整数，如果适用）：文件中的行数。
    - `mimetype`（字符串，如果适用）：文件的 MIME 类型。
    - `extension`（字符串，如果适用）：文件的扩展名。
    - `model_added_lines`（整数，如果适用）：模型添加/更改的行数。
    - `model_removed_lines`（整数，如果适用）：模型删除/更改的行数。
    - `user_added_lines`（整数，如果适用）：用户在 AI 建议的更改中添加/更改的行数。
    - `user_removed_lines`（整数，如果适用）：用户在 AI 建议的更改中删除/更改的行数。
    - `programming_language`（字符串，如果适用）：文件的编程语言。

- `qwen-code.chat_compression`（计数器，整数）：统计聊天压缩操作
  - **属性**：
    - `tokens_before`（整数）：压缩前上下文中的 token 数量
    - `tokens_after`（整数）：压缩后上下文中的 token 数量