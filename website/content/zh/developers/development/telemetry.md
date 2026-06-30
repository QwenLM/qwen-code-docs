# 使用 OpenTelemetry 实现可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观测性](#observability-with-opentelemetry)
  - [核心优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [手动 OTLP 导出](#manual-otlp-export)
  - [本地 Telemetry](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于 Collector 的导出（高级）](#collector-based-export-advanced)
  - [日志和指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)
    - [Daemon 指标](#daemon-metrics)
    - [Spans](#spans)
    - [资源指标](#resource-metrics)
    - [性能监控（保留）](#performance-monitoring-reserved)

## 迁移说明

- `tool_output_truncated` 已重命名为 `qwen-code.tool_output_truncated` 以保持命名空间一致性——依赖旧名称进行过滤的下游消费者应更新其查询。

- `tool.call.latency` 直方图文档此前列出了 `decision` 属性——但该属性从未在直方图上设置（仅记录 `function_name`）。`tool.call.count` 计数器继续包含 `decision`。

- `qwen-code.file_operation` 日志事件和 `file.operation.count` 指标文档此前列出了 diff-stat 属性（`model_added_lines`、`model_removed_lines`、`user_added_lines`、`user_removed_lines`）——但这些属性从未在两者中设置。Diff-stat 数据可通过 `tool_call` 日志事件的 `metadata` 属性获取。

## 核心优势

- **🔍 使用分析**：了解团队中的交互模式和功能采用情况
- **⚡ 性能监控**：跟踪响应时间、Token 消耗和资源利用率
- **🐛 实时调试**：在瓶颈、故障和错误模式发生时进行识别
- **📊 工作流优化**：做出明智决策以改进配置和流程
- **🏢 企业治理**：监控跨团队使用情况、跟踪成本、确保合规性，并与现有监控基础设施集成

## OpenTelemetry 集成

基于 **[OpenTelemetry]**（供应商中立、行业标准的可观测性框架）构建，Qwen Code 的可观测性系统提供：

- **通用兼容性**：导出到任何 OpenTelemetry 后端（Aliyun、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中使用一致的格式和收集方法
- **面向未来的集成**：与现有和未来的可观测性基础设施连接
- **无供应商锁定**：在后端之间切换而无需更改检测代码

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 配置

所有遥测行为均通过 `.qwen/settings.json` 文件控制。这些设置可通过环境变量或 CLI 标志覆盖。

| 设置                           | 环境变量                                 | CLI 标志                                                 | 描述                                                                                                                                    | 值            | 默认值                 |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | 启用或禁用遥测                                                                                                                    | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(已弃用)_         | 信息目标标签；不控制导出器路由——设置 `otlpEndpoint` 或 `outfile` 以配置数据发送位置           | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | OTLP collector 端点                                                                                                                        | URL 字符串        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP 传输协议                                                                                                                        | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | Traces 的单信号端点覆盖（仅限 HTTP）                                                                                            | URL 字符串        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | Logs 的单信号端点覆盖（仅限 HTTP）                                                                                              | URL 字符串        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | Metrics 的单信号端点覆盖（仅限 HTTP）                                                                                           | URL 字符串        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | 将遥测数据保存到文件（覆盖 OTLP 导出）                                                                                                 | 文件路径         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | 在遥测日志中包含 prompts                                                                                                              | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | 将用户 prompts、系统 prompts、工具 I/O 和模型输出作为原生 span 属性包含在内（除了 log-to-span 桥接 span 之外）           | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | 每个敏感原生 span 属性内容负载的最大 JavaScript 字符串长度。如果你的后端拒绝大属性，请设置较低的值。 | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | 附加到每个导出的 span / log / metric 的静态资源属性。请参阅下方的[资源属性](#resource-attributes)。              | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | 在指标数据点上包含 `session.id`。**默认禁用**，以保护指标后端免受时间序列扇出的影响。                       | `true`/`false`    | `false`                 |

**关于布尔环境变量的说明：** 对于布尔设置（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`），将相应的环境变量设置为 `true` 或 `1` 将启用该功能。任何其他值都将禁用它。

**关于整数环境变量的说明：** 设置 `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` 时，它必须是正整数。无效值会导致遥测配置解析失败，而不是静默回退。

**敏感 span 属性：** 启用 `includeSensitiveSpanAttributes` 后，会发生两件事：

1. **原生 span 属性（`qwen-code.interaction`、`api.generateContent*`、`tool.<name>`）** 携带逐字对话内容：
   - 用户 prompts（`new_context`）
   - 系统 prompts（`system_prompt`——每个会话完整文本一次，通过 SHA-256 哈希去重；后续 span 仅携带 `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`）
   - 工具 schemas（作为 `tool_schema` 事件发出，同样进行哈希去重）
   - 工具输入（`tool_input`）和工具结果（`tool_result`）
   - 模型输出（`response.model_output`）

   每个内容负载在 `sensitiveSpanAttributeMaxLength` 个 JavaScript 字符串单位处截断。默认值为 1 MiB（`1048576`），从之前的 60 KiB 默认值提高；设置 `61440` 可保留旧上限。限制必须在 `1` 到 `104857600`（100 MiB）之间。对于带标签的属性，固定标签如 `[USER PROMPT]`、`[TOOL INPUT: ...]` 和 `[TOOL RESULT: ...]` 计入上限；截断标记也计入上限。限制以 JavaScript 字符串长度而非 UTF-8 字节数衡量。因此，非 ASCII 内容在 OTLP 导出后可能会占用更多字节。对于大多数负载类型，截断会同时添加 `*_truncated` 和 `*_original_length`。系统 prompts 在截断时也会设置 `system_prompt_truncated`，但使用始终存在的 `system_prompt_length` 表示原始长度。

2. **Log-to-span 桥接 span**（在未配置 logs 端点而导出 HTTP traces 时使用）保留其现有的 `prompt`、`function_args` 和 `response_text` 字段，而不是被丢弃。

⚠️ **安全警告：** 启用此标志会将完整的对话历史记录、`read_file` 读取的文件内容、shell 命令及其输出（包括环境变量或参数中的 secrets）以及模型响应流式传输到配置的 OTLP 后端。请将后端视为特权数据接收器。该标志默认为 `false`。

**成本 / 负载大小：** 在默认限制下（1 MiB 系统 prompt 加上 10 次工具调用，每次最多 1 MiB 输入 + 1 MiB 结果，加上 1 MiB 模型输出）的一次重度交互，在 OTLP 压缩前可产生高达约 22 MiB 的属性负载，加上在具有大型工具定义的工作区中每个发出的工具 schema 最多 1 MiB。这是 Qwen Code 的应用端上限，并不保证每个 collector 或后端都能接受这么大的单个属性。如果 span 被拒绝或丢弃，请降低 `sensitiveSpanAttributeMaxLength`（例如，降至 `61440`）并监控导出器吞吐量。

此设置不会禁用 OTel 日志或其他遥测接收器中的敏感数据；非内部 API 响应遥测可能会填充 `response_text`，因此 OTel 日志、UI 遥测和聊天记录可能会独立于此设置接收响应文本。QwenLogger 不包含 `response_text`。

**HTTP OTLP 信号路由：** 使用 HTTP 协议（`otlpProtocol: "http"`）时，Qwen Code 会自动将特定信号的路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）追加到基础 `otlpEndpoint`。例如，`http://collector:4318` 对于 traces 会变为 `http://collector:4318/v1/traces`。如果 URL 已经以信号路径结尾，则按原样使用。单信号端点覆盖（`otlpTracesEndpoint` 等）优先于基础端点并按原样使用。gRPC 协议使用基于服务的路由，不追加路径。

单信号端点环境变量也接受标准的 OpenTelemetry 名称：`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` 变体优先于 `OTEL_*` 变体。

有关所有配置选项的详细信息，请参阅[配置指南](../../users/configuration/settings.md)。

### 资源属性

资源属性是附加到通过 OTLP 导出的每个 span、log 和 metric 的静态键值对。使用它们按团队、环境、部署区域或后端关注的任何其他维度对遥测数据进行切片。

两个来源，按优先级顺序合并（从低到高）：

1. 标准的 `OTEL_RESOURCE_ATTRIBUTES` 环境变量
2. `.qwen/settings.json` 中的 `telemetry.resourceAttributes`（在键冲突时覆盖环境变量）

`OTEL_SERVICE_NAME` 是一个独立的逃生舱——设置后，它会覆盖来自任何其他来源的 `service.name`（根据 OpenTelemetry 规范）。

#### 示例

**按团队 / 环境切片所有遥测数据：**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**通过 `service.name` 路由到每租户 collector：**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**集群基线（`~/.qwen/settings.json`）+ 每主机覆盖：**

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
# 添加一次性标签而不修改设置：
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 保留键

某些键由运行时控制，无法覆盖：

- `service.version` —— 始终设置为正在运行的 CLI 版本。从任何来源设置它都会被静默丢弃并附带警告。
- `session.id` —— 运行时按会话注入。来自环境变量或设置的用户提供的值会被丢弃并附带警告。原因是资源属性会自动附加到每个指标数据点；允许用户覆盖将绕过下方的[基数控制](#cardinality-controls)。Spans 和 logs 始终携带 `session.id`。

`service.name` **未**保留；它遵循上述优先级链。

#### 格式

`OTEL_RESOURCE_ATTRIBUTES` 遵循 OpenTelemetry 规范：`key1=value1,key2=value2`，值进行百分号编码。值中的空格必须编码为 `%20`，**逗号编码为 `%2C`**（未编码的逗号会在错误的边界处拆分值，后半部分会因格式错误而被丢弃）。格式错误的键值对会被跳过并附带警告，而不是导致遥测启动失败。

#### 故障排除：当用户提供的属性似乎未生效时

保留键（`service.version`、`session.id`）、格式错误的键值对、非字符串设置值和无效的百分号编码都会被静默丢弃，并通过 OpenTelemetry 诊断通道记录警告。该通道路由到调试日志文件（`~/.qwen/log/otel-*.log`），**而不是**控制台，因此该行为可能看起来像是静默失败。

如果自定义资源属性未出现在导出的遥测数据中：

1. 检查 `~/.qwen/log/otel-*.log` 中是否有匹配 `cannot override`（保留键被丢弃）、`Skipping malformed`（错误的环境变量键值对）或 `must be a string`（非字符串设置值）的行。
2. 验证环境变量是否在 qwen-code 进程的环境中设置（而不仅仅是你的 shell），并且值已进行百分号编码。
3. 确认 `telemetry.enabled` 为 `true` —— 遥测初始化仅在启用时运行。

### 基数控制

指标在后端按属性集进行聚合——属性值的每种不同组合都会产生一个新的时间序列。将 `session.id` 等高基数附加到指标会导致时间序列扇出与会话数量成正比，这会迅速耗尽指标后端存储。

为了防止这种情况，Qwen Code 默认将高基数属性从指标数据点中移除。Spans 和 logs 是每事件独立的，不受影响，因此它们继续携带 `session.id` 以进行 trace 和 log 关联。

#### `telemetry.metrics.includeSessionId`（默认值：`false`）

将其设置为 `true`（通过设置或 `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`）会将 `session.id` 重新附加到每个指标数据点。

⚠️ **警告：** 每个 CLI 会话都会创建一个新值。在集群中保持开启会撑爆指标存储。仅建议用于短期调试。对于长期会话关联，请改为查询 trace 或 log 后端。

#### 从早期版本迁移

在此版本之前，`session.id` 默认附加到指标。如果你的 Prometheus 查询 / Grafana 仪表板 / 告警规则引用了指标上的 `session_id`，你有两个选项：

**选项 A** —— 恢复短期调试的先前行为：

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

**选项 B（推荐）** —— 将会话级分析从指标中移出。Spans 和 logs 仍然携带 `session.id`，并且 trace / log 后端（Jaeger、Tempo、Loki、Aliyun SLS / ARMS Tracing）原生处理每会话切片，而不会产生基数压力。

### 出站 fetch 的客户端 HTTP span

启用遥测后，Qwen Code 会注册 `UndiciInstrumentation`，为进程发起的每个出站 `fetch()` 请求创建客户端 HTTP span——包括 LLM SDK（`openai`、`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTP 客户端、`WebFetch` 工具以及任何 IDE 扩展的进程外调用。该 span 让你能够单独查看网络延迟（TTFB / 响应体传输），而不是上游模型处理时间，这是现有的 `api.generateContent` span 无法区分的。

这些 span 会发送到你的**自有** OTLP collector（或文件 outfile），就像其他遥测数据一样——它们不会影响写入出站 HTTP 请求本身的内容。W3C `traceparent` 标头是否也写入传出请求流，由下方[出站关联（与安全相关）](#outbound-correlation-security-relevant)中记录的**单独的、与安全相关的设置**控制。

**避免反馈循环。** OTel SDK 在内部使用 `fetch` 上传 OTLP 数据。如果没有保护，检测 `fetch` 会追踪这些上传，而这些上传本身又会被上传，从而导致无限循环。Qwen Code 的 undici 检测配置了 `ignoreRequestHook`，该钩子会跳过匹配配置的 `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` 前缀的 URL。在文件 outfile 模式下，没有出站 HTTP 上传，因此该钩子为空操作。

## 出站关联（与安全相关）

这些设置故意位于与 `telemetry.*` **单独的顶级命名空间**中：遥测控制数据流入操作员自己的可观测性后端，而 `outboundCorrelation.*` 控制 qwen-code 将哪些客户端关联数据写入**到达第三方 LLM 提供商端点（DashScope、OpenAI、Anthropic 等）的出站 LLM API 请求流**中。不同的接收者，不同的同意决定。**所有值默认关闭。** 有关框架原理，请参阅 PR #4390 审查讨论。
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

当设置为 `false`（默认值）时，Qwen Code 会在 OTel SDK 上安装一个无操作的 `TextMapPropagator`。UndiciInstrumentation 仍会为你的 OTLP collector 创建客户端 HTTP span，但 `propagation.inject()` 是无操作的，因此**不会将 `traceparent` 写入出站请求**。Trace ID 仅保留在 operator 的 collector 内部。

当设置为 `true` 时，会安装 SDK 默认的 W3C 复合 propagator（`tracecontext` + `baggage`），并在每次出站 `fetch` 时写入标准的 `traceparent` header：

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

此外，会在 shell 子进程（Bash tool、hooks、monitor）中设置 `TRACEPARENT` 和 `TRACESTATE` 环境变量，以便生成的命令能够参与同一个分布式 trace。

仅当 LLM provider 也向你的 OTel collector 上报数据以进行跨进程 trace 拼接时（例如，ARMS Tracing 服务于 DashScope），才启用此选项。对于大多数 operator，该值为 `false`；跨厂商的 trace 延续属于小众场景。

**依赖于 `telemetry.enabled: true`。** OTel SDK 仅在启用 telemetry 时初始化，因此 `propagateTraceContext` 仅在该状态下生效。在禁用 telemetry 时将其设置为 `true` 是静默无操作的——没有 SDK，没有 propagator，网络中也没有 `traceparent`。在配置 ARMS+DashScope 关联设置时，请验证这两个标志：

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

### 其他出站关联 header

`X-Qwen-Code-Session-Id` 和 `X-Qwen-Code-Request-Id` **不属于本 PR 的范围**。它们将在后续的独立 PR 中进行设计和提案，使用相同的 `outboundCorrelation.*` 命名空间，每个都有各自的威胁模型和 operator 同意流程。PR #4390 的 review（LaZzyMan）确立了一项原则：“telemetry 的工作范围不包括向 LLM provider 发送标识符”；关联 header 的工作将转移到其独立的设计讨论中，而不是归入 telemetry 之下。

## 阿里云 Telemetry

### 手动 OTLP 导出

要在阿里云 OpenTelemetry 托管服务中查看 Qwen Code telemetry，请将 Qwen Code 配置为导出到 ARMS 提供的 OTLP endpoint。

仅设置 `"target": "gcp"` 并不能配置导出目标。如果未设置 `otlpEndpoint`，Qwen Code 仍会默认使用 `http://localhost:4317`。如果设置了 `outfile`，它将覆盖 `otlpEndpoint`，telemetry 将被写入文件而不是发送到阿里云。

1. 在 `.qwen/settings.json` 中启用 telemetry 并设置 OTLP endpoint：

   **选项 A：gRPC 协议**（标准 OTLP endpoint）：

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

   **选项 B：使用按信号区分的 endpoint 的 HTTP 协议**（适用于使用非标准路径的后端，例如使用 `/api/otlp/traces` 而不是 `/v1/traces`）：

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

   > **注意：** 当仅使用 `otlpEndpoint`（无按信号覆盖）的 HTTP 协议时，Qwen Code 会将标准 OTLP 路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）追加到基础 URL 后。如果你的后端使用不同的路径，请使用选项 B 中所示的按信号 endpoint 覆盖。

2. 如果你的阿里云 endpoint 需要身份验证，请通过标准的 OpenTelemetry 环境变量（如 `OTEL_EXPORTER_OTLP_HEADERS` 或特定信号的变体）提供 OTLP header。Qwen Code 目前不支持直接在 `.qwen/settings.json` 中配置 OTLP 认证 header。
3. 运行 Qwen Code 并发送 prompt。
4. 在 OpenTelemetry 托管服务中查看 telemetry：
   - 产品概述：
     [什么是 OpenTelemetry 托管服务？][aliyun-opentelemetry-overview]
   - 快速入门：
     [开始使用 OpenTelemetry 托管服务][aliyun-opentelemetry-get-started]
   - 控制台入口：
     - 中国内地：
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （旧版控制台：
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国际站：
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - 在控制台中，使用 `Applications` 检查 trace 和服务拓扑。
   - 查找 OTLP endpoint 和访问信息：
     - **新版控制台**（`trace.console.aliyun.com` 或国际站）：
       导航到 `Integration Center`。
     - **旧版控制台**（`tracing.console.aliyun.com`）：导航到
       `Cluster Configurations` → `Access point information`。

## 本地 Telemetry

对于本地开发和调试，你可以在本地捕获 telemetry 数据：

### 基于文件的输出（推荐）

1. 在 `.qwen/settings.json` 中启用 telemetry：

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **注意：** 设置 `outfile` 后，OTLP 导出将自动禁用。
   > 对于仅输出到文件的场景，不需要 `target` 和 `otlpEndpoint` 设置，可以安全地从配置中省略。

2. 运行 Qwen Code 并发送 prompt。
3. 在指定文件（例如 `.qwen/telemetry.log`）中查看日志和指标。

### 基于 Collector 的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   这将：
   - 下载并启动 Jaeger 和 OTEL collector
   - 为你的工作区配置本地 telemetry
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存到 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时停止 collector（例如 `Ctrl+C`）
2. 运行 Qwen Code 并发送 prompt。
3. 在 http://localhost:16686 查看 trace，并在 collector 日志文件中查看日志/指标。

## 日志和指标

以下部分描述了为 Qwen Code 生成的日志、指标和 span 的结构。

- 所有日志和指标都包含一个 `sessionId` 作为公共属性。

### 日志

日志是特定事件的时间戳记录。所有日志记录自动包含 `event.name` 和 `event.timestamp` 属性。

记录以下事件：

#### 核心会话事件

- `qwen-code.config`：启动时发出一次，包含 CLI 配置。
  - **属性**：`model`、`sandbox_enabled`、`core_tools_enabled`、`approval_mode`、`file_filtering_respect_git_ignore`、`debug_mode`、`truncate_tool_output_threshold`、`truncate_tool_output_lines`、`hooks`（逗号分隔，禁用时省略）、`ide_enabled`、`interactive_shell_enabled`、`mcp_servers`、`mcp_servers_count`、`mcp_tools`、`mcp_tools_count`、`output_format`、`skills`、`subagents`

- `qwen-code.user_prompt`：用户提交 prompt。
  - **属性**：`prompt_length`（int）、`prompt_id`（string）、`prompt`（string，如果 `log_prompts_enabled` 为 false 则排除）、`auth_type`（string）

- `qwen-code.user_retry`：用户重试上一次的 prompt。
  - **属性**：`prompt_id`（string）

- `qwen-code.conversation_finished`：对话轮次序列完成。
  - **属性**：`approvalMode`（string）、`turnCount`（int）

- `qwen-code.user_feedback`：用户提交会话反馈。
  - **属性**：`session_id`（string）、`rating`（int：1=差，2=一般，3=好）、`model`（string）、`approval_mode`（string）、`prompt_id`（string，可选）

#### 工具事件

- `qwen-code.tool_call`：每次函数/工具调用。
  - **属性**：`function_name`（string）、`function_args`（object）、`duration_ms`（int）、`status`（string："success"、"error" 或 "cancelled"）、`success`（boolean）、`decision`（string："accept"、"reject"、"auto_accept" 或 "modify"，可选）、`error`（string，可选）、`error_type`（string，可选）、`prompt_id`（string）、`response_id`（string，可选）、`content_length`（int，可选）、`tool_type`（string："native" 或 "mcp"）、`mcp_server_name`（string，可选）、`metadata`（object，可选——对于文件写入工具，包含 `model_added_lines`、`model_removed_lines`、`user_added_lines`、`user_removed_lines`、`model_added_chars`、`model_removed_chars`、`user_added_chars`、`user_removed_chars`）

- `qwen-code.file_operation`：每次文件操作。
  - **属性**：`tool_name`（string）、`operation`（string："create"、"read"、"update"）、`lines`（int，可选）、`mimetype`（string，可选）、`extension`（string，可选）、`programming_language`（string，可选）

- `qwen-code.tool_output_truncated`：工具输出超过大小阈值。
  - **属性**：`tool_name`（string）、`original_content_length`（int）、`truncated_content_length`（int）、`threshold`（int）、`lines`（int）、`prompt_id`（string）

#### API 事件

- `qwen-code.api_request`：发往 LLM API 的出站请求。
  - **属性**：`model`（string）、`prompt_id`（string）、`request_text`（string，可选）、`subagent_name`（string，可选）

- `qwen-code.api_response`：从 LLM API 接收到的响应。
  - **属性**：`response_id`（string）、`model`（string）、`status_code`（int/string，可选）、`duration_ms`（int）、`input_token_count`（int）、`output_token_count`（int）、`cached_content_token_count`（int）、`thoughts_token_count`（int）、`total_token_count`（int）、`prompt_id`（string）、`auth_type`（string，可选）、`response_text`（string，可选）、`subagent_name`（string，可选）

- `qwen-code.api_error`：API 请求失败。
  - **属性**：`model`（string）、`prompt_id`（string）、`duration_ms`（int）、`error_message`（string）、`response_id`（string，可选）、`auth_type`（string，可选）、`error_type`（string，可选）、`status_code`（int/string，可选）、`subagent_name`（string，可选）

  此外，为了兼容性，还会发出 OTel 标准别名（`http.status_code`、`error.message`、`model_name`、`duration`）。

- `qwen-code.api_cancel`：用户取消了 API 请求。
  - **属性**：`model`（string）、`prompt_id`（string）、`auth_type`（string，可选）、`loop_wakeups_cancelled`（int，可选）

- `qwen-code.api_retry`：在 LLM 调用点进行的 HTTP 状态码重试（429/5xx）。不同于 `chat.content_retry`，后者在单独的预算下处理 `InvalidStreamError` 重试。
  - **属性**：`model`（string）、`prompt_id`（string，可选）、`attempt_number`（int）、`error_type`（string，可选）、`error_message`（string）、`status_code`（int/string，可选）、`retry_delay_ms`（int）、`duration_ms`（int，等于 retry_delay_ms——退避休眠时间，而非 HTTP 往返时间；有关尝试持续时间，请参阅 qwen-code.llm_request span）、`subagent_name`（string，可选）

- `qwen-code.malformed_json_response`：`generateJson` 响应无法解析。
  - **属性**：`model`（string）

- `qwen-code.flash_fallback`：作为回退切换到 flash 模型。
  - **属性**：`auth_type`（string）

- `qwen-code.ripgrep_fallback`：作为回退切换到 grep。
  - **属性**：`use_ripgrep`（boolean）、`use_builtin_ripgrep`（boolean）、`error`（string，可选）

#### 容错事件

- `qwen-code.chat.content_retry`：内容错误重试（例如空流）。
  - **属性**：`attempt_number`（int）、`error_type`（string）、`retry_delay_ms`（int）、`model`（string）

- `qwen-code.chat.content_retry_failure`：所有内容重试已耗尽。
  - **属性**：`total_attempts`（int）、`final_error_type`（string）、`total_duration_ms`（int，可选）、`model`（string）

- `qwen-code.chat.invalid_chunk`：从流中接收到无效的 chunk。
  - **属性**：`error.message`（string，可选）

#### 命令与扩展事件

- `qwen-code.slash_command`：用户执行斜杠命令。
  - **属性**：`command`（string）、`subcommand`（string，可选）、`status`（string："success" 或 "error"，可选）

- `qwen-code.slash_command.model`：用户通过 `/model` 命令切换模型。
  - **属性**：`model_name`（string）

- `qwen-code.skill_launch`：启动 skill。
  - **属性**：`skill_name`（string）、`success`（boolean）、`prompt_id`（string）

- `qwen-code.extension_install`：安装扩展。
  - **属性**：`extension_name`（string）、`extension_version`（string）、`extension_source`（string）、`status`（string："success"/"error"）

- `qwen-code.extension_uninstall`：卸载扩展。
  - **属性**：`extension_name`（string）、`status`（string）

- `qwen-code.extension_enable`：启用扩展。
  - **属性**：`extension_name`（string）、`setting_scope`（string）

- `qwen-code.extension_disable`：禁用扩展。
  - **属性**：`extension_name`（string）、`setting_scope`（string）

- `qwen-code.extension_update`：更新扩展。
  - **属性**：`extension_name`（string）、`extension_id`（string）、`extension_previous_version`（string）、`extension_version`（string）、`extension_source`（string）、`status`（string："success"/"error"）

- `qwen-code.ide_connection`：IDE 连接事件。
  - **属性**：`connection_type`（string："start" 或 "session"）

- `qwen-code.auth`：身份验证事件。
  - **属性**：`auth_type`（string）、`action_type`（"auto"、"manual"、"coding-plan"）、`status`（"success"、"error"、"cancelled"）、`error_message`（可选）

#### 子代理事件

- `qwen-code.subagent_execution`：子代理生命周期事件。
  - **属性**：`subagent_name`（string）、`status`（"started"、"completed"、"failed"、"cancelled"）、`terminate_reason`（可选）、`result`（可选）、`execution_summary`（可选）

#### Arena 事件

- `qwen-code.arena_session_started`：Arena 会话开始。
  - **属性**：`arena_session_id`（string）、`model_ids`（JSON 字符串数组）、`task_length`（int）

- `qwen-code.arena_agent_completed`：Arena 代理完成。
  - **属性**：`arena_session_id`（string）、`agent_session_id`（string）、`agent_model_id`（string）、`status`（string："completed"/"failed"/"cancelled"）、`duration_ms`（int）、`rounds`（int）、`total_tokens`（int）、`input_tokens`（int）、`output_tokens`（int）、`tool_calls`（int）、`successful_tool_calls`（int）、`failed_tool_calls`（int）

- `qwen-code.arena_session_ended`：Arena 会话结束。
  - **属性**：`arena_session_id`（string）、`status`（string："selected"/"discarded"/"failed"/"cancelled"）、`duration_ms`（int）、`display_backend`（string，可选）、`agent_count`（int）、`completed_agents`（int）、`failed_agents`（int）、`cancelled_agents`（int）、`winner_model_id`（string，可选）

#### 工作流事件

- `qwen-code.workflow_keyword`：触发工作流关键字。

- `qwen-code.workflow_run`：工作流运行达到终止状态。
  - **属性**：`status`（string）、`agents_dispatched`（int）、`agents_completed`（int）、`phase_count`（int）、`tokens_spent`（int）、`duration_ms`（int）

#### 自动记忆事件

- `qwen-code.memory.extract`：记忆提取运行完成。
  - **属性**：`trigger`（"auto"/"manual"）、`status`（"completed"/"skipped"/"failed"）、`skipped_reason`（可选）、`patches_count`（int）、`touched_topics`（string）、`duration_ms`（int）

- `qwen-code.memory.dream`：记忆整合（dream）运行完成。
  - **属性**：`trigger`（"auto"/"manual"）、`status`（"updated"/"noop"/"failed"/"cancelled"）、`deduped_entries`（int）、`touched_topics_count`（int）、`touched_topics`（string）、`duration_ms`（int）

- `qwen-code.memory.recall`：记忆召回操作完成。
  - **属性**：`query_length`（int）、`docs_scanned`（int）、`docs_selected`（int）、`strategy`（"none"/"heuristic"/"model"）、`duration_ms`（int）

#### Prompt 建议与推测事件

- `qwen-code.prompt_suggestion`：Prompt 建议结果。
  - **属性**：`outcome`（"accepted"/"ignored"/"suppressed"）、`prompt_id`（可选）、`accept_method`（"tab"/"enter"/"right"，可选）、`accept_source`（"live"/"fallback"，可选）、`time_to_accept_ms`（可选）、`time_to_ignore_ms`（可选）、`time_to_first_keystroke_ms`（可选）、`suggestion_length`（可选）、`similarity`（可选）、`was_focused_when_shown`（可选）、`reason`（可选）

- `qwen-code.speculation`：推测执行结果。
  - **属性**：`outcome`（"accepted"/"aborted"/"failed"）、`turns_used`（int）、`files_written`（int）、`tool_use_count`（int）、`duration_ms`（int）、`boundary_type`（可选）、`had_pipelined_suggestion`（boolean）

#### 其他事件

- `qwen-code.chat_compression`：聊天上下文被压缩。
  - **属性**：`tokens_before`（int）、`tokens_after`（int）、`compression_input_token_count`（int，可选）、`compression_output_token_count`（int，可选）

- `qwen-code.next_speaker_check`：确定下一个发言者。
  - **属性**：`prompt_id`（string）、`finish_reason`（string）、`result`（string）

- `loop_detected`：在代理执行期间检测到循环。_（注意：发出时没有 `qwen-code.` 前缀——预先存在的不一致。）_
  - **属性**：`loop_type`（string）、`prompt_id`（string）

- `kitty_sequence_overflow`：Kitty 图形协议序列超过缓冲区大小。_（注意：发出时没有 `qwen-code.` 前缀——预先存在的不一致。）_
  - **属性**：`sequence_length`（int）、`truncated_sequence`（string，前 20 个字符）

### 指标

指标是随时间推移对行为的数值测量。指标名称使用 `qwen-code.*` 前缀。

#### 核心指标

- `qwen-code.session.count`（Counter，Int）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（Counter，Int）：统计工具调用次数。
  - **属性**：`function_name`、`success`（boolean）、`decision`（"accept"/"reject"/"auto_accept"/"modify"，可选）、`tool_type`（"mcp"/"native"，可选）

- `qwen-code.tool.call.latency`（Histogram，ms）：测量工具调用延迟。
  - **属性**：`function_name`（string）

- `qwen-code.api.request.count`（Counter，Int）：统计所有 API 请求次数。
  - **属性**：`model`、`status_code`、`error_type`（可选）

- `qwen-code.api.request.latency`（Histogram，ms）：测量 API 请求延迟。
  - **属性**：`model`（string）

- `qwen-code.token.usage`（Counter，Int）：统计使用的 token 数量。
  - **属性**：`model`、`type`（"input"/"output"/"thought"/"cache"）

- `qwen-code.file.operation.count`（Counter，Int）：统计文件操作次数。
  - **属性**：`operation`（"create"/"read"/"update"）、`lines`（可选）、`mimetype`（可选）、`extension`（可选）、`programming_language`（可选）

- `qwen-code.chat_compression`（Counter，Int）：统计聊天压缩操作次数。
  - **属性**：`tokens_before`（int）、`tokens_after`（int）

- `qwen-code.slash_command.model.call_count`（Counter，Int）：统计模型斜杠命令调用次数。
  - **属性**：`slash_command.model.model_name`（string）

- `qwen-code.subagent.execution.count`（Counter，Int）：统计子代理执行事件次数。
  - **属性**：`subagent_name`、`status`（"started"/"completed"/"failed"/"cancelled"）、`terminate_reason`（可选）

#### 容错指标

- `qwen-code.api.retry.count`（Counter，Int）：在 LLM 调用点进行的 HTTP 状态码重试（429/5xx）。
  - **属性**：`model`（string）

- `qwen-code.chat.content_retry.count`（Counter，Int）：由于内容错误导致的重试。

- `qwen-code.chat.content_retry_failure.count`（Counter，Int）：所有内容重试已耗尽。

- `qwen-code.chat.invalid_chunk.count`（Counter，Int）：来自流的无效 chunk。

#### Arena 指标

- `qwen-code.arena.session.count`（Counter，Int）：按状态统计 Arena 会话。
  - **属性**：`status`、`display_backend`（可选）
- `qwen-code.arena.session.duration` (Histogram, ms)：Arena 会话持续时间。
  - **属性**：`status`

- `qwen-code.arena.agent.count` (Counter, Int)：Arena agent 完成次数。
  - **属性**：`status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms)：Arena agent 执行时长。
  - **属性**：`model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int)：Arena agent 的 Token 使用量。
  - **属性**：`model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int)：Arena 结果选择次数。
  - **属性**：`model_id`

#### 自动记忆指标

- `qwen-code.memory.extract.count` (Counter, Int)：自动记忆提取运行次数。
  - **属性**：`trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms)：提取时长。
  - **属性**：`trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int)：自动记忆 dream 运行次数。
  - **属性**：`trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms)：Dream 运行时长。
  - **属性**：`trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int)：自动记忆召回操作次数。
  - **属性**：`strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms)：召回时长。
  - **属性**：`strategy`

#### API 请求耗时分解

- `qwen-code.api.request.breakdown` (Histogram, ms)：按阶段分解的 API 请求耗时。
  - **属性**：`model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Daemon 指标

Daemon 进程（长时间运行的 HTTP 服务器模式）会暴露其自身的指标。

> **注意：** 这三个 Observable Gauge（`daemon.session.active`、`daemon.sse.active`、`daemon.process.heap_used`）是基于回调的指标，在每个收集间隔进行更新；必须在 daemon 初始化期间调用 `registerDaemonGaugeCallbacks()` 来注册观察回调。

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int)：按路由和状态类别统计的请求数。
  - **属性**：`route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms)：请求时长。
  - **属性**：`route`
  - **分桶**：1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Sessions

- `qwen-code.daemon.session.active` (ObservableGauge, Int)：当前活跃会话数。

- `qwen-code.daemon.session.lifecycle` (Counter, Int)：会话生命周期事件。
  - **属性**：`action` ("spawn"/"close"/"die")

#### Channels

- `qwen-code.daemon.channel.lifecycle` (Counter, Int)：ACP channel 生命周期事件。
  - **属性**：`action` ("spawn"/"exit"), `expected` (boolean, 可选)

#### Prompts

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms)：Prompt FIFO 队列等待时间。
  - **分桶**：1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms)：端到端 prompt 时长。
  - **分桶**：100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Errors

- `qwen-code.daemon.bridge.error.count` (Counter, Int)：按类型统计的 Bridge 错误数。
  - **属性**：`error_type` (已知类名或 "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int)：取消请求数。

#### Resources

- `qwen-code.daemon.sse.active` (ObservableGauge, Int)：活跃的 SSE 连接数。

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes)：堆内存使用量。

### Spans

分布式追踪 span 构成一棵以 `qwen-code.interaction` 为根的树。每个 interaction 都是一个带有自身 `traceId` 的 trace root；跨 prompt 关联使用 `session.id` 属性。

- `qwen-code.interaction`：每个用户 prompt 轮次的 root span。
  - **属性**：`session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request`：封装单次 LLM API 调用。
  - **属性**：`session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool`：封装完整的 tool 生命周期（审批等待 + 执行）。
  - **属性**：`session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution`：封装 tool 执行阶段（审批后）。
  - **属性**：`session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user`：tool 等待用户审批的时间。
  - **属性**：`session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`：封装每个 pre/post-tool-use hook 触发点。
  - **属性**：`session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (可选), `is_interrupt` (boolean, 可选), `duration_ms`, `success`, `should_proceed` (可选), `should_stop` (可选), `block_type` (可选), `error` (可选)

- `qwen-code.subagent`：封装单次 subagent 调用。
  - **属性**：`gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request`：封装 daemon HTTP 请求。
  - **属性**：`http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`：封装 daemon bridge 操作。
  - **属性**：`qwen-code.daemon.operation`

#### 资源指标

- `qwen-code.memory.usage` (Histogram, bytes)：内存使用量。在启用 telemetry 时由内存压力监控器记录。
  - **属性**：`memory_type` (string: "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent)：CPU 使用率百分比。在启用 telemetry 时由内存压力监控器记录。
  - **属性**：(无)

### 性能监控（保留）

以下指标已定义但**尚未在生产环境中启用**。它们将在专用的性能监控配置标志后激活。

- `qwen-code.startup.duration` (Histogram, ms)：按阶段统计的 CLI 启动时间。
  - **属性**：`phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count)：执行队列中的 tool 数量。

- `qwen-code.tool.execution.breakdown` (Histogram, ms)：按阶段统计的 tool 执行时间。
  - **属性**：`function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio)：Token 效率指标。
  - **属性**：`model`, `metric`, `context` (可选)

- `qwen-code.performance.score` (Histogram, score)：综合性能得分 (0-100)。
  - **属性**：`category`, `baseline` (可选)

- `qwen-code.performance.regression` (Counter, Int)：回归检测事件。
  - **属性**：`metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent)：相对于 baseline 的百分比变化。
  - **属性**：`metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent)：相对于 baseline 的性能。
  - **属性**：`metric`, `category`, `current_value`, `baseline_value`