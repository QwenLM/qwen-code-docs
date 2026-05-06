# 使用 OpenTelemetry 进行可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 进行可观测性](#observability-with-opentelemetry)
  - [核心优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [阿里云遥测](#aliyun-telemetry)
    - [手动 OTLP 导出](#manual-otlp-export)
  - [本地遥测](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于 Collector 的导出（高级）](#collector-based-export-advanced)
  - [日志与指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)

## 核心优势

- **🔍 使用分析**：了解团队内的交互模式与功能采用情况
- **⚡ 性能监控**：追踪响应时间、Token 消耗及资源利用率
- **🐛 实时调试**：在问题发生时快速定位瓶颈、故障与错误模式
- **📊 工作流优化**：基于数据做出明智决策，优化配置与流程
- **🏢 企业治理**：监控跨团队使用情况、追踪成本、确保合规性，并与现有监控基础设施集成

## OpenTelemetry 集成

基于 **[OpenTelemetry]**（厂商中立、行业标准的可观测性框架）构建，Qwen Code 的可观测性系统提供：

- **广泛兼容**：导出至任意 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中使用一致的格式与采集方法
- **面向未来的集成**：无缝对接现有及未来的可观测性基础设施
- **避免厂商锁定**：无需更改埋点代码即可切换后端

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 配置

> [!note]
>
> **⚠️ 特别说明：此功能需要相应的代码变更。本文档为提前提供，请以未来的代码更新为准以获取实际功能。**

所有遥测行为均通过 `.qwen/settings.json` 文件进行控制。这些设置可被环境变量或 CLI 参数覆盖。

| 配置项               | 环境变量                   | CLI 参数                                                 | 说明                                          | 取值            | 默认值                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`             | `QWEN_TELEMETRY_ENABLED`               | `--telemetry` / `--no-telemetry`                         | 启用或禁用遥测                          | `true`/`false`    | `false`                 |
| `target`              | `QWEN_TELEMETRY_TARGET`                | `--telemetry-target <local\|gcp>`                        | 遥测数据发送目标                         | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`        | `QWEN_TELEMETRY_OTLP_ENDPOINT`         | `--telemetry-otlp-endpoint <URL>`                        | OTLP Collector 端点                              | URL 字符串        | `http://localhost:4317` |
| `otlpProtocol`        | `QWEN_TELEMETRY_OTLP_PROTOCOL`         | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP 传输协议                              | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`  | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`  | -                                                        | Traces 的独立端点覆盖（仅 HTTP）  | URL 字符串        | -                       |
| `otlpLogsEndpoint`    | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`    | -                                                        | Logs 的独立端点覆盖（仅 HTTP）    | URL 字符串        | -                       |
| `otlpMetricsEndpoint` | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT` | -                                                        | Metrics 的独立端点覆盖（仅 HTTP） | URL 字符串        | -                       |
| `outfile`             | `QWEN_TELEMETRY_OUTFILE`               | `--telemetry-outfile <path>`                             | 将遥测数据保存至文件（覆盖 `otlpEndpoint`）    | 文件路径         | -                       |
| `logPrompts`          | `QWEN_TELEMETRY_LOG_PROMPTS`           | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | 在遥测日志中包含 Prompt                    | `true`/`false`    | `true`                  |
| `useCollector`        | `QWEN_TELEMETRY_USE_COLLECTOR`         | -                                                        | 使用外部 OTLP Collector（高级）               | `true`/`false`    | `false`                 |

**布尔型环境变量说明：** 对于布尔型配置项（`enabled`、`logPrompts`、`useCollector`），将对应环境变量设置为 `true` 或 `1` 即可启用该功能。其他任何值均表示禁用。

**HTTP OTLP 信号路由：** 使用 HTTP 协议（`otlpProtocol: "http"`）时，Qwen Code 会自动在基础 `otlpEndpoint` 后追加信号特定路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）。例如，`http://collector:4318` 用于 traces 时会变为 `http://collector:4318/v1/traces`。如果 URL 已包含信号路径，则直接使用。独立信号端点覆盖配置（`otlpTracesEndpoint` 等）优先级高于基础端点，且会原样使用。gRPC 协议基于服务路由，不会追加路径。

独立信号端点环境变量同样支持标准 OpenTelemetry 命名：`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` 变体的优先级高于 `OTEL_*` 变体。

有关所有配置选项的详细信息，请参阅 [配置指南](./cli/configuration.md)。

## 阿里云遥测

### 手动 OTLP 导出

若要在阿里云 OpenTelemetry 托管服务中查看 Qwen Code 遥测数据，请将 Qwen Code 配置为导出至 ARMS 提供的 OTLP 端点。

仅设置 `"target": "gcp"` 并不会配置导出目标。若未设置 `otlpEndpoint`，Qwen Code 仍会默认使用 `http://localhost:4317`。若设置了 `outfile`，它将覆盖 `otlpEndpoint`，遥测数据会写入文件而非发送至阿里云。

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

   **选项 B：HTTP 协议配合独立信号端点**（适用于使用非标准路径的后端，例如 `/api/otlp/traces` 而非 `/v1/traces`）：

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

   > **注意：** 使用 HTTP 协议且仅配置 `otlpEndpoint`（无独立信号覆盖）时，Qwen Code 会在基础 URL 后追加标准 OTLP 路径（`/v1/traces`、`/v1/logs`、`/v1/metrics`）。如果你的后端使用不同路径，请参照选项 B 使用独立信号端点覆盖。

2. 如果你的阿里云端点需要身份验证，请通过标准 OpenTelemetry 环境变量（如 `OTEL_EXPORTER_OTLP_HEADERS` 或信号特定变体）提供 OTLP 请求头。Qwen Code 目前未在 `.qwen/settings.json` 中直接暴露 OTLP 认证请求头配置。
3. 运行 Qwen Code 并发送 Prompt。
4. 在 OpenTelemetry 托管服务中查看遥测数据：
   - 产品概述：
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - 快速入门：
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - 控制台入口：
     - 中国大陆：
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （旧版控制台：
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国际站：
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - 在控制台中，使用 `Applications` 查看 Trace 和服务拓扑。
   - 查找 OTLP 端点与接入信息：
     - **新版控制台**（`trace.console.aliyun.com` 或国际站）：导航至 `Integration Center`。
     - **旧版控制台**（`tracing.console.aliyun.com`）：导航至 `Cluster Configurations` → `Access point information`。

## 本地遥测

在本地开发与调试时，你可以在本地捕获遥测数据：

### 基于文件的输出（推荐）

1. 在 `.qwen/settings.json` 中启用遥测：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. 运行 Qwen Code 并发送 Prompt。
3. 在指定文件（如 `.qwen/telemetry.log`）中查看日志与指标。

### 基于 Collector 的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   该脚本将：
   - 下载并启动 Jaeger 与 OTEL Collector
   - 配置工作区以支持本地遥测
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存至 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时停止 Collector（例如按 `Ctrl+C`）
2. 运行 Qwen Code 并发送 Prompt。
3. 在 http://localhost:16686 查看 Trace，并在 Collector 日志文件中查看日志/指标。

## 日志与指标

以下部分描述了 Qwen Code 生成的日志与指标结构。

- 所有日志与指标均包含一个公共属性 `sessionId`。

### 日志

日志是带有时间戳的特定事件记录。Qwen Code 会记录以下事件：

- `qwen-code.config`：此事件在 CLI 启动时发生一次，包含 CLI 配置信息。
  - **属性**：
    - `model`（字符串）
    - `sandbox_enabled`（布尔值）
    - `core_tools_enabled`（字符串）
    - `approval_mode`（字符串）
    - `file_filtering_respect_git_ignore`（布尔值）
    - `debug_mode`（布尔值）
    - `truncate_tool_output_threshold`（数字）
    - `truncate_tool_output_lines`（数字）
    - `hooks`（字符串，逗号分隔的 Hook 事件类型，若禁用 Hook 则省略）
    - `ide_enabled`（布尔值）
    - `interactive_shell_enabled`（布尔值）
    - `mcp_servers`（字符串）
    - `output_format`（字符串："text" 或 "json"）

- `qwen-code.user_prompt`：用户提交 Prompt 时触发。
  - **属性**：
    - `prompt_length`（整型）
    - `prompt_id`（字符串）
    - `prompt`（字符串，若 `log_prompts_enabled` 配置为 `false` 则排除此属性）
    - `auth_type`（字符串）

- `qwen-code.tool_call`：每次函数调用时触发。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject"、"auto_accept" 或 "modify"，如适用）
    - `error`（如适用）
    - `error_type`（如适用）
    - `content_length`（整型，如适用）
    - `metadata`（如适用，string -> any 的字典）

- `qwen-code.file_operation`：每次文件操作时触发。
  - **属性**：
    - `tool_name`（字符串）
    - `operation`（字符串："create"、"read" 或 "update"）
    - `lines`（整型，如适用）
    - `mimetype`（字符串，如适用）
    - `extension`（字符串，如适用）
    - `programming_language`（字符串，如适用）
    - `diff_stat`（JSON 字符串，如适用）：包含以下成员的 JSON 字符串：
      - `ai_added_lines`（整型）
      - `ai_removed_lines`（整型）
      - `user_added_lines`（整型）
      - `user_removed_lines`（整型）

- `qwen-code.api_request`：向 Qwen API 发起请求时触发。
  - **属性**：
    - `model`
    - `request_text`（如适用）

- `qwen-code.api_error`：API 请求失败时触发。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：收到 Qwen API 响应时触发。
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

- `qwen-code.tool_output_truncated`：工具调用输出过大并被截断时触发。
  - **属性**：
    - `tool_name`（字符串）
    - `original_content_length`（整型）
    - `truncated_content_length`（整型）
    - `threshold`（整型）
    - `lines`（整型）
    - `prompt_id`（字符串）

- `qwen-code.malformed_json_response`：Qwen API 的 `generateJson` 响应无法解析为 JSON 时触发。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：Qwen Code 切换至 flash 作为回退模型时触发。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：用户执行斜杠命令时触发。
  - **属性**：
    - `command`（字符串）
    - `subcommand`（字符串，如适用）

- `qwen-code.extension_enable`：启用扩展时触发
- `qwen-code.extension_install`：安装扩展时触发
  - **属性**：
    - `extension_name`（字符串）
    - `extension_version`（字符串）
    - `extension_source`（字符串）
    - `status`（字符串）
- `qwen-code.extension_uninstall`：卸载扩展时触发

### 指标

指标是随时间变化的行为数值测量。Qwen Code 会收集以下指标（为保持兼容性，指标名称仍为 `qwen-code.*`）：

- `qwen-code.session.count`（Counter, Int）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（Counter, Int）：统计工具调用次数。
  - **属性**：
    - `function_name`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）
    - `tool_type`（字符串："mcp" 或 "native"，如适用）

- `qwen-code.tool.call.latency`（Histogram, ms）：测量工具调用延迟。
  - **属性**：
    - `function_name`
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）

- `qwen-code.api.request.count`（Counter, Int）：统计所有 API 请求次数。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（如适用）

- `qwen-code.api.request.latency`（Histogram, ms）：测量 API 请求延迟。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（Counter, Int）：统计使用的 Token 数量。
  - **属性**：
    - `model`
    - `type`（字符串："input"、"output"、"thought" 或 "cache"）

- `qwen-code.file.operation.count`（Counter, Int）：统计文件操作次数。
  - **属性**：
    - `operation`（字符串："create"、"read" 或 "update"）：文件操作类型。
    - `lines`（整型，如适用）：文件行数。
    - `mimetype`（字符串，如适用）：文件 MIME 类型。
    - `extension`（字符串，如适用）：文件扩展名。
    - `model_added_lines`（整型，如适用）：模型添加/修改的行数。
    - `model_removed_lines`（整型，如适用）：模型删除/修改的行数。
    - `user_added_lines`（整型，如适用）：用户在 AI 建议的更改中添加/修改的行数。
    - `user_removed_lines`（整型，如适用）：用户在 AI 建议的更改中删除/修改的行数。
    - `programming_language`（字符串，如适用）：文件的编程语言。

- `qwen-code.chat_compression`（Counter, Int）：统计对话压缩操作次数
  - **属性**：
    - `tokens_before`（整型）：压缩前上下文中的 Token 数量
    - `tokens_after`（整型）：压缩后上下文中的 Token 数量