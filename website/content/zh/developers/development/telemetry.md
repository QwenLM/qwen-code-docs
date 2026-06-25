# 使用 OpenTelemetry 实现可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观测性](#observability-with-opentelemetry)
  - [核心优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [阿里云 Telemetry](#aliyun-telemetry)
    - [手动 OTLP 导出](#manual-otlp-export)
  - [本地 Telemetry](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于 Collector 的导出（高级）](#collector-based-export-advanced)
  - [日志与指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)

## 核心优势

- **🔍 使用分析**：了解团队的交互模式和功能采用情况
- **⚡ 性能监控**：追踪响应时间、token 消耗和资源利用率
- **🐛 实时调试**：实时识别瓶颈、故障和错误模式
- **📊 工作流优化**：做出有依据的决策，优化配置和流程
- **🏢 企业治理**：监控团队使用情况、追踪成本、确保合规，并与现有监控基础设施集成

## OpenTelemetry 集成

Qwen Code 的可观测性系统基于 **[OpenTelemetry]**——这是一个厂商中立的行业标准可观测性框架，提供以下能力：

- **通用兼容性**：可导出到任何 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中使用一致的格式和采集方法
- **面向未来的集成**：与现有及未来的可观测性基础设施对接
- **无厂商锁定**：无需修改插桩代码即可切换后端

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 配置

所有 telemetry 行为均通过 `.qwen/settings.json` 文件控制。这些设置可被环境变量或 CLI 标志覆盖。

| 配置项                           | 环境变量                                               | CLI 标志                                                 | 描述                                                                                                                                 | 取值              | 默认值                  |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------- |
| `enabled`                        | `QWEN_TELEMETRY_ENABLED`                           | `--telemetry` / `--no-telemetry`                         | 启用或禁用 telemetry                                                                                                                 | `true`/`false`    | `false`                 |
| `target`                         | `QWEN_TELEMETRY_TARGET`                            | `--telemetry-target <local\|gcp>` _(已弃用)_             | 仅作信息性目标标签；不控制导出器路由——设置 `otlpEndpoint` 或 `outfile` 来配置数据发送目标                                           | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                   | `QWEN_TELEMETRY_OTLP_ENDPOINT`                     | `--telemetry-otlp-endpoint <URL>`                        | OTLP collector 端点                                                                                                                  | URL 字符串        | `http://localhost:4317` |
| `otlpProtocol`                   | `QWEN_TELEMETRY_OTLP_PROTOCOL`                     | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP 传输协议                                                                                                                        | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`             | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`              | -                                                        | traces 的信号级端点覆盖（仅 HTTP）                                                                                                   | URL 字符串        | -                       |
| `otlpLogsEndpoint`               | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                | -                                                        | logs 的信号级端点覆盖（仅 HTTP）                                                                                                     | URL 字符串        | -                       |
| `otlpMetricsEndpoint`            | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`             | -                                                        | metrics 的信号级端点覆盖（仅 HTTP）                                                                                                  | URL 字符串        | -                       |
| `outfile`                        | `QWEN_TELEMETRY_OUTFILE`                           | `--telemetry-outfile <path>`                             | 将 telemetry 保存到文件（覆盖 OTLP 导出）                                                                                           | 文件路径          | -                       |
| `logPrompts`                     | `QWEN_TELEMETRY_LOG_PROMPTS`                       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | 在 telemetry 日志中包含 prompt                                                                                                       | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes` | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | -                                                        | 将用户 prompt、系统 prompt、工具输入/输出和模型输出作为原生 span 属性包含（除 log-to-span bridge span 外）                           | `true`/`false`    | `false`                 |
| `resourceAttributes`             | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`) | -                                                        | 附加到每个导出的 span / log / metric 的静态资源属性。参见下方的[资源属性](#resource-attributes)。                                   | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`       | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`        | -                                                        | 在指标数据点上包含 `session.id`。**默认禁用**，以防止指标后端的时间序列膨胀。                                                       | `true`/`false`    | `false`                 |

**布尔类型环境变量说明：** 对于布尔配置项（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`），将对应的环境变量设为 `true` 或 `1` 即可启用该功能，其他任何值均会禁用它。

**敏感 span 属性：** 启用 `includeSensitiveSpanAttributes` 后，会发生以下两件事：

1. **原生 span 属性（`qwen-code.interaction`、`api.generateContent*`、`tool.<name>`）** 携带逐字的对话内容：
   - 用户 prompt（`new_context`）
   - 系统 prompt（`system_prompt`——每次会话完整文本一次，通过 SHA-256 哈希去重；后续 span 仅携带 `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`）
   - 工具 schema（以 `tool_schema` 事件形式发出，同样进行哈希去重）
   - 工具输入（`tool_input`）和工具结果（`tool_result`）
   - 模型输出（`response.model_output`）

   每个值截断上限为 60 KB；发生截断时会通过 `*_truncated` 和 `*_original_length` 标志提示。

2. **Log-to-span bridge span**（在导出 HTTP traces 但未配置 logs 端点时使用）保留其现有的 `prompt`、`function_args` 和 `response_text` 字段，而不是被丢弃。

⚠️ **安全警告：** 启用此标志会将完整的对话历史、`read_file` 读取的文件内容、shell 命令及其输出（包括环境变量或参数中的 secret），以及模型响应流式传输到已配置的 OTLP 后端。请将该后端视为特权数据接收端。此标志默认为 `false`。

**成本/载荷大小：** 一次重量级交互（60 KB 系统 prompt + 10 次工具调用，每次最多 60 KB 输入 + 60 KB 结果，加上 60 KB 模型输出）在 OTLP 压缩前可能产生高达约 1.5 MB 的属性载荷。当工具（如 `read_file`）在长时间运行的会话中读取大文件时，请监控导出器的吞吐量。

此设置不会禁用 OTel 日志或其他 telemetry sink 中的敏感数据；非内部 API 响应 telemetry 可能会填充 `response_text`，因此 OTel 日志、UI telemetry 和聊天记录可能会独立于此设置接收响应文本。QwenLogger 不包含 `response_text`。

**HTTP OTLP 信号路由：** 使用 HTTP 协议（`otlpProtocol: "http"`）时，Qwen Code 会自动在基础 `otlpEndpoint` 后追加信号特定路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）。例如，`http://collector:4318` 对于 traces 会变为 `http://collector:4318/v1/traces`。如果 URL 已以信号路径结尾，则直接使用。信号级端点覆盖（`otlpTracesEndpoint` 等）优先于基础端点，并按原样使用。gRPC 协议使用基于服务的路由，不会追加路径。

信号级端点环境变量同样接受标准 OpenTelemetry 名称：`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` 变体优先于 `OTEL_*` 变体。

关于所有配置选项的详细信息，请参阅[配置指南](../../users/configuration/settings.md)。

### 资源属性

资源属性是附加到通过 OTLP 导出的每个 span、log 和 metric 的静态键值对。可以用它们按团队、环境、部署区域或后端关心的其他维度对 telemetry 进行切分。

两个来源按优先级顺序合并（从低到高）：

1. 标准 `OTEL_RESOURCE_ATTRIBUTES` 环境变量
2. `.qwen/settings.json` 中的 `telemetry.resourceAttributes`（在键冲突时覆盖环境变量）

`OTEL_SERVICE_NAME` 是一个单独的 escape hatch——设置后，它会覆盖来自任何其他来源的 `service.name`（遵循 OpenTelemetry 规范）。

#### 示例

**按团队/环境切分所有 telemetry：**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**通过 `service.name` 路由到按租户划分的 collector：**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**集群基线（`~/.qwen/settings.json`）+ 按主机覆盖：**

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
# 无需修改 settings 即可添加一次性标签：
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 保留键

某些键由运行时控制，不可被覆盖：

- `service.version`——始终设置为正在运行的 CLI 版本。从任何来源设置此值都会被静默丢弃并记录警告。
- `session.id`——运行时每次会话注入。来自环境变量或 settings 的用户提供值会被丢弃并记录警告。原因是资源属性会自动附加到每个指标数据点；允许用户覆盖会绕过下方的[基数控制](#cardinality-controls)。Span 和 log 始终携带 `session.id`。

`service.name` **不是**保留键；它遵循上述优先级链。

#### 格式

`OTEL_RESOURCE_ATTRIBUTES` 遵循 OpenTelemetry 规范：`key1=value1,key2=value2`，值需要进行 percent 编码。值中的空格必须编码为 `%20`，**逗号编码为 `%2C`**（未编码的逗号会在错误边界处分割值，导致后半部分因格式错误而被丢弃）。格式错误的键值对会被跳过并记录警告，而不会导致 telemetry 启动失败。

#### 故障排查：用户提供的属性未生效

保留键（`service.version`、`session.id`）、格式错误的键值对、非字符串的 settings 值和无效的 percent 编码均会被静默丢弃，并通过 OpenTelemetry 诊断通道记录警告。该通道路由到调试日志文件（`~/.qwen/log/otel-*.log`），**而非**控制台，因此行为可能看起来像是静默失败。

如果自定义资源属性未出现在导出的 telemetry 中：

1. 检查 `~/.qwen/log/otel-*.log`，查找匹配 `cannot override`（保留键被丢弃）、`Skipping malformed`（环境变量键值对格式错误）或 `must be a string`（settings 值为非字符串）的行。
2. 验证环境变量是否在 qwen-code 进程的环境中设置（不仅仅是 shell），以及值是否进行了 percent 编码。
3. 确认 `telemetry.enabled` 为 `true`——只有启用 telemetry 时，初始化才会运行。

### 基数控制

指标在后端按属性集聚合——每个不同的属性值组合都会产生一个新的时间序列。将 `session.id` 这类高基数字段附加到指标上，会导致时间序列数量与会话数量成比例膨胀，很快就会耗尽指标后端存储。

为防止这种情况，Qwen Code 默认不在指标数据点上附加高基数属性。Span 和 log 是按事件记录的，不受影响，因此它们仍然携带 `session.id` 用于 trace 和 log 关联。

#### `telemetry.metrics.includeSessionId`（默认值：`false`）

将其设置为 `true`（通过 settings 或 `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`）可将 `session.id` 重新附加到每个指标数据点上。

⚠️ **警告：** 每次 CLI 会话都会创建一个新值。在整个集群上启用此选项会导致指标存储爆炸。建议仅用于短期调试。对于长期的会话关联，请改为查询 trace 或 log 后端。

#### 从早期版本迁移

在此版本之前，`session.id` 默认附加到指标上。如果你的 Prometheus 查询/Grafana 仪表板/告警规则在指标上引用了 `session_id`，有以下两个选项：

**选项 A**——为短期调试恢复之前的行为：

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

**选项 B（推荐）**——将会话级分析从指标中迁移出去。Span 和 log 仍然携带 `session.id`，而 trace/log 后端（Jaeger、Tempo、Loki、阿里云 SLS/ARMS Tracing）原生支持按会话切分，不存在基数压力。

### 出站 fetch 的客户端 HTTP span

启用 telemetry 后，Qwen Code 会注册 `UndiciInstrumentation`，为进程发起的每个出站 `fetch()` 请求创建一个客户端 HTTP span——包括 LLM SDK（`openai`、`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTP 客户端、`WebFetch` 工具以及任何 IDE 扩展的进程外调用。该 span 可让你单独查看网络延迟（TTFB/响应体传输），而不是将其与上游模型处理时间混在一起，这是现有 `api.generateContent` span 单独无法区分的。

这些 span 与其他 telemetry 一样发送到你**自己的** OTLP collector（或文件 outfile）——它们不影响出站 HTTP 请求本身的内容。W3C `traceparent` 头是否同样被写入出站请求流，由下方[出站关联](#outbound-correlation-security-relevant)中记录的**独立安全相关设置**控制。

**避免反馈循环。** OTel SDK 内部使用 `fetch` 上传 OTLP 数据。如果没有防护，插桩 `fetch` 会追踪这些上传操作，而这些上传操作本身又会被上传，从而造成无限循环。Qwen Code 的 undici 插桩配置了 `ignoreRequestHook`，会跳过匹配已配置的 `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` 前缀的 URL。在文件 outfile 模式下，没有出站 HTTP 上传，因此该 hook 不起作用。

## 出站关联（安全相关）

这些设置有意放在与 `telemetry.*` **独立的顶级命名空间**中：telemetry 控制数据流向运维人员自己的可观测性后端，而 `outboundCorrelation.*` 控制 qwen-code 将哪些客户端关联数据**写入到达第三方 LLM 提供商端点**（DashScope、OpenAI、Anthropic 等）的出站 LLM API 请求流中。不同的接收方，不同的授权决策。**所有值默认关闭。** 请参阅 PR #4390 的 review 讨论了解设计理由。

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // 默认值
}
```

当为 `false`（默认值）时，Qwen Code 在 OTel SDK 上安装一个 no-op `TextMapPropagator`。UndiciInstrumentation 仍会为你的 OTLP collector 创建客户端 HTTP span，但 `propagation.inject()` 是 no-op，因此**不会将 `traceparent` 写入出站请求**。Trace ID 保留在运维人员的 collector 内部。

当为 `true` 时，SDK 的默认 W3C 复合 propagator（`tracecontext` + `baggage`）会被安装，标准 `traceparent` 头会被写入每个出站 `fetch`：

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

仅当 LLM 提供商也向你的 OTel collector 上报数据以进行跨进程 trace 串联时才选择启用——例如 ARMS Tracing 服务于 DashScope。对大多数运维人员而言，该值应为 `false`；跨厂商 trace 串联属于小众需求。

**依赖 `telemetry.enabled: true`。** OTel SDK 仅在 telemetry 启用时初始化，因此 `propagateTraceContext` 只在该状态下生效。在 telemetry 禁用的情况下将其设为 `true` 是静默 no-op——没有 SDK，没有 propagator，网络上也不会有 `traceparent`。在配置 ARMS+DashScope 关联时，请验证这两个标志：

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

`X-Qwen-Code-Session-Id` 和 `X-Qwen-Code-Request-Id` **不在本 PR 范围内**。它们将在各自的后续 PR 中，在同一 `outboundCorrelation.*` 命名空间下设计和提议，每个都有独立的威胁模型和运维人员授权流程。PR #4390 的 review（LaZzyMan）确立了原则："telemetry 的工作范围不包括向 LLM 提供商发送标识符"；关联头工作将转移到独立的设计讨论中，而不是在 telemetry 下落地。

## 阿里云 Telemetry

### 手动 OTLP 导出

要在阿里云 Managed Service for OpenTelemetry 中查看 Qwen Code telemetry，需要配置 Qwen Code 将数据导出到 ARMS 提供的 OTLP 端点。

仅设置 `"target": "gcp"` 不会配置导出目标。如果未设置 `otlpEndpoint`，Qwen Code 仍默认使用 `http://localhost:4317`。如果设置了 `outfile`，它会覆盖 `otlpEndpoint`，telemetry 将写入文件而不是发送到阿里云。

1. 在 `.qwen/settings.json` 中启用 telemetry 并设置 OTLP 端点：

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

   **选项 B：HTTP 协议，配置信号级端点**（适用于使用非标准路径的后端，例如 `/api/otlp/traces` 而非 `/v1/traces`）：

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

   > **注意：** 当使用 HTTP 协议且仅设置 `otlpEndpoint`（无信号级覆盖）时，Qwen Code 会在基础 URL 后追加标准 OTLP 路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）。如果你的后端使用不同路径，请按选项 B 使用信号级端点覆盖。

2. 如果你的阿里云端点需要身份验证，请通过标准 OpenTelemetry 环境变量（如 `OTEL_EXPORTER_OTLP_HEADERS` 或信号特定变体）提供 OTLP 头。Qwen Code 目前不在 `.qwen/settings.json` 中直接暴露 OTLP 认证头。
3. 运行 Qwen Code 并发送 prompt。
4. 在 Managed Service for OpenTelemetry 中查看 telemetry：
   - 产品概述：
     [什么是 Managed Service for OpenTelemetry？][aliyun-opentelemetry-overview]
   - 快速开始：
     [开始使用 Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - 控制台入口：
     - 中国大陆：
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （旧版控制台：
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国际：
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - 在控制台中，使用 `Applications` 查看 trace 和服务拓扑。
   - 定位 OTLP 端点和访问信息：
     - **新版控制台**（`trace.console.aliyun.com` 或国际版）：
       导航到 `Integration Center`。
     - **旧版控制台**（`tracing.console.aliyun.com`）：导航到
       `Cluster Configurations` → `Access point information`。

## 本地 Telemetry

对于本地开发和调试，可以在本地采集 telemetry 数据：

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

   > **注意：** 设置 `outfile` 后，OTLP 导出会自动禁用。`target` 和 `otlpEndpoint` 设置在仅输出到文件时不需要，可以从配置中安全省略。

2. 运行 Qwen Code 并发送 prompt。
3. 在指定文件（例如 `.qwen/telemetry.log`）中查看日志和指标。

### 基于 Collector 的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   此命令将：
   - 下载并启动 Jaeger 和 OTEL collector
   - 为本地 telemetry 配置工作区
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存到 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时停止 collector（例如 `Ctrl+C`）
2. 运行 Qwen Code 并发送 prompt。
3. 在 http://localhost:16686 查看 trace，在 collector 日志文件中查看日志/指标。

## 日志与指标

以下部分介绍为 Qwen Code 生成的日志和指标的结构。

- `sessionId` 作为公共属性包含在所有日志和指标中。

### 日志

日志是特定事件的带时间戳记录。以下事件会被 Qwen Code 记录：

- `qwen-code.config`：此事件在启动时发生一次，包含 CLI 的配置信息。
  - **属性**：
    - `model`（string）
    - `sandbox_enabled`（boolean）
    - `core_tools_enabled`（string）
    - `approval_mode`（string）
    - `file_filtering_respect_git_ignore`（boolean）
    - `debug_mode`（boolean）
    - `truncate_tool_output_threshold`（number）
    - `truncate_tool_output_lines`（number）
    - `hooks`（string，逗号分隔的 hook 事件类型，禁用 hook 时省略）
    - `ide_enabled`（boolean）
    - `interactive_shell_enabled`（boolean）
    - `mcp_servers`（string）
    - `output_format`（string："text" 或 "json"）

- `qwen-code.user_prompt`：此事件在用户提交 prompt 时发生。
  - **属性**：
    - `prompt_length`（int）
    - `prompt_id`（string）
    - `prompt`（string，如果 `log_prompts_enabled` 配置为 `false` 则排除此属性）
    - `auth_type`（string）

- `qwen-code.tool_call`：此事件在每次函数调用时发生。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（boolean）
    - `decision`（string："accept"、"reject"、"auto_accept" 或 "modify"，如适用）
    - `error`（如适用）
    - `error_type`（如适用）
    - `content_length`（int，如适用）
    - `metadata`（如适用，string -> any 的字典）

- `qwen-code.file_operation`：此事件在每次文件操作时发生。
  - **属性**：
    - `tool_name`（string）
    - `operation`（string："create"、"read"、"update"）
    - `lines`（int，如适用）
    - `mimetype`（string，如适用）
    - `extension`（string，如适用）
    - `programming_language`（string，如适用）
    - `diff_stat`（json string，如适用）：一个包含以下成员的 JSON 字符串：
      - `ai_added_lines`（int）
      - `ai_removed_lines`（int）
      - `user_added_lines`（int）
      - `user_removed_lines`（int）

- `qwen-code.api_request`：此事件在向 Qwen API 发起请求时发生。
  - **属性**：
    - `model`
    - `request_text`（如适用）

- `qwen-code.api_error`：此事件在 API 请求失败时发生。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：此事件在收到 Qwen API 响应时发生。
  - **属性**：
    - `model`
    - `status_code`
    - `duration_ms`
    - `error`（可选）
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text`（如适用）
    - `auth_type`

- `qwen-code.tool_output_truncated`：此事件在工具调用的输出过大并被截断时发生。
  - **属性**：
    - `tool_name`（string）
    - `original_content_length`（int）
    - `truncated_content_length`（int）
    - `threshold`（int）
    - `lines`（int）
    - `prompt_id`（string）

- `qwen-code.malformed_json_response`：此事件在 Qwen API 的 `generateJson` 响应无法解析为 JSON 时发生。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：此事件在 Qwen Code 切换到 flash 作为回退时发生。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：此事件在用户执行 slash 命令时发生。
  - **属性**：
    - `command`（string）
    - `subcommand`（string，如适用）

- `qwen-code.extension_enable`：此事件在启用扩展时发生
- `qwen-code.extension_install`：此事件在安装扩展时发生
  - **属性**：
    - `extension_name`（string）
    - `extension_version`（string）
    - `extension_source`（string）
    - `status`（string）
- `qwen-code.extension_uninstall`：此事件在卸载扩展时发生

### 指标

指标是随时间推移对行为的数值度量。以下指标会被 Qwen Code 采集（指标名称保持 `qwen-code.*` 格式以确保兼容性）：

- `qwen-code.session.count`（Counter，Int）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（Counter，Int）：统计工具调用次数。
  - **属性**：
    - `function_name`
    - `success`（boolean）
    - `decision`（string："accept"、"reject" 或 "modify"，如适用）
    - `tool_type`（string："mcp" 或 "native"，如适用）

- `qwen-code.tool.call.latency`（Histogram，ms）：度量工具调用延迟。
  - **属性**：
    - `function_name`
    - `decision`（string："accept"、"reject" 或 "modify"，如适用）

- `qwen-code.api.request.count`（Counter，Int）：统计所有 API 请求次数。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（如适用）

- `qwen-code.api.request.latency`（Histogram，ms）：度量 API 请求延迟。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（Counter，Int）：统计使用的 token 数量。
  - **属性**：
    - `model`
    - `type`（string："input"、"output"、"thought" 或 "cache"）

- `qwen-code.file.operation.count`（Counter，Int）：统计文件操作次数。
  - **属性**：
    - `operation`（string："create"、"read"、"update"）：文件操作类型。
    - `lines`（Int，如适用）：文件行数。
    - `mimetype`（string，如适用）：文件的 mimetype。
    - `extension`（string，如适用）：文件扩展名。
    - `model_added_lines`（Int，如适用）：模型新增/修改的行数。
    - `model_removed_lines`（Int，如适用）：模型删除/修改的行数。
    - `user_added_lines`（Int，如适用）：用户在 AI 建议更改中新增/修改的行数。
    - `user_removed_lines`（Int，如适用）：用户在 AI 建议更改中删除/修改的行数。
    - `programming_language`（string，如适用）：文件的编程语言。

- `qwen-code.chat_compression`（Counter，Int）：统计聊天压缩操作次数
  - **属性**：
    - `tokens_before`（Int）：压缩前上下文中的 token 数量
    - `tokens_after`（Int）：压缩后上下文中的 token 数量
