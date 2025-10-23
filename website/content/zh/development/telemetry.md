# 使用 OpenTelemetry 实现可观察性

学习如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观察性](#observability-with-opentelemetry)
  - [核心优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [Google Cloud Telemetry](#google-cloud-telemetry)
    - [前提条件](#prerequisites)
    - [直接导出（推荐）](#direct-export-recommended)
    - [基于 Collector 的导出（高级）](#collector-based-export-advanced)
  - [本地遥测](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于 Collector 的导出（高级）](#collector-based-export-advanced-1)
  - [日志与指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)

## 核心优势

- **🔍 使用分析**: 了解团队内的交互模式和功能采用情况
- **⚡ 性能监控**: 跟踪响应时间、token 消耗和资源使用情况
- **🐛 实时调试**: 及时发现瓶颈、故障和错误模式
- **📊 工作流优化**: 通过数据驱动的决策来改进配置和流程
- **🏢 企业治理**: 跨团队监控使用情况、跟踪成本、确保合规性，并与现有监控基础设施集成

## OpenTelemetry 集成

基于 **[OpenTelemetry]** —— 一个厂商中立、行业标准的可观察性框架 —— Qwen Code 的可观察性系统提供：

- **通用兼容性**：导出到任何 OpenTelemetry 后端（Google Cloud、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在你的工具链中使用一致的格式和收集方法
- **面向未来的集成**：与现有和未来的可观察性基础设施连接
- **无厂商锁定**：无需更改你的 instrumentation 即可切换后端

[OpenTelemetry]: https://opentelemetry.io/

## 配置

所有遥测行为都通过你的 `.qwen/settings.json` 文件进行控制。  
这些设置可以通过环境变量或 CLI flag 进行覆盖。

| 设置项         | 环境变量                          | CLI Flag                                                  | 描述                                              | 可选值              | 默认值                   |
| -------------- | --------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ------------------- | ------------------------ |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`        | `--telemetry` / `--no-telemetry`                          | 启用或禁用遥测                                    | `true`/`false`      | `false`                  |
| `target`       | `GEMINI_TELEMETRY_TARGET`         | `--telemetry-target <local\|gcp>`                         | 遥测数据发送目标                                  | `"gcp"`/`"local"`   | `"local"`                |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT`  | `--telemetry-otlp-endpoint <URL>`                         | OTLP collector endpoint                           | URL 字符串          | `http://localhost:4317`  |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL`  | `--telemetry-otlp-protocol <grpc\|http>`                  | OTLP 传输协议                                     | `"grpc"`/`"http"`   | `"grpc"`                 |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`        | `--telemetry-outfile <path>`                              | 将遥测数据保存到文件（会覆盖 `otlpEndpoint`）     | 文件路径            | -                        |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`    | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`  | 是否在遥测日志中包含 prompt 内容                  | `true`/`false`      | `true`                   |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR`  | -                                                         | 使用外部 OTLP collector（高级选项）               | `true`/`false`      | `false`                  |

**关于布尔型环境变量的说明：** 对于布尔型设置项（`enabled`、`logPrompts`、`useCollector`），将对应的环境变量设为 `true` 或 `1` 即可启用该功能，其他任何值都会禁用它。

有关所有配置选项的详细信息，请参阅 [配置指南](./cli/configuration.md)。

## Google Cloud Telemetry

### 准备工作

在使用以下任一方法之前，请先完成以下步骤：

1. 设置你的 Google Cloud 项目 ID：
   - 如果遥测数据与推理服务在不同项目中：
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - 如果遥测数据与推理服务在同一项目中：
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. 进行 Google Cloud 身份验证：
   - 如果使用用户账号：
     ```bash
     gcloud auth application-default login
     ```
   - 如果使用服务账号：
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. 确保你的账号或服务账号具有以下 IAM 角色：
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. 启用所需的 Google Cloud API（如果尚未启用）：
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### 直接导出（推荐）

将遥测数据直接发送到 Google Cloud 服务。无需 collector。

1. 在你的 `.qwen/settings.json` 中启用遥测：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. 运行 Qwen Code 并发送 prompts。
3. 查看日志和指标：
   - 发送 prompts 后，在浏览器中打开 Google Cloud Console：
     - 日志：https://console.cloud.google.com/logs/
     - 指标：https://console.cloud.google.com/monitoring/metrics-explorer
     - 链路追踪：https://console.cloud.google.com/traces/list

### 基于 Collector 的导出（高级）

如果你需要自定义处理、过滤或路由数据，可以使用 OpenTelemetry collector 将数据转发到 Google Cloud。

1. 配置你的 `.qwen/settings.json`：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=gcp
   ```
   脚本将执行以下操作：
   - 启动一个本地 OTEL collector，用于将数据转发至 Google Cloud
   - 配置你的 workspace
   - 提供链接以便在 Google Cloud Console 中查看 traces、metrics 和 logs
   - 将 collector 日志保存到 `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`
   - 在退出时自动停止 collector（例如按下 `Ctrl+C`）
3. 运行 Qwen Code 并发送 prompts。
4. 查看日志和指标：
   - 发送 prompts 后，在浏览器中打开 Google Cloud Console：
     - Logs: https://console.cloud.google.com/logs/
     - Metrics: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list
   - 打开 `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` 查看本地 collector 日志。

## 本地遥测数据

在本地开发和调试时，你可以在本地捕获遥测数据：

### 基于文件的输出（推荐）

1. 在你的 `.qwen/settings.json` 中启用遥测功能：
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
2. 运行 Qwen Code 并发送 prompt。
3. 在指定的文件中查看日志和指标（例如 `.qwen/telemetry.log`）。

### 基于 Collector 的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   该脚本将：
   - 下载并启动 Jaeger 和 OTEL collector
   - 为你的 workspace 配置本地 telemetry
   - 提供 Jaeger UI 访问地址：http://localhost:16686
   - 将 logs/metrics 保存到 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 在退出时停止 collector（例如按 `Ctrl+C`）
2. 运行 Qwen Code 并发送 prompts。
3. 在 http://localhost:16686 查看 traces，并在 collector log 文件中查看 logs/metrics。

## Logs 和 Metrics

以下部分描述了 Qwen Code 生成的 logs 和 metrics 的结构。

- 所有 logs 和 metrics 都包含一个共同的属性 `sessionId`。

### 日志

日志是带有时间戳的特定事件记录。Qwen Code 会记录以下事件：

- `qwen-code.config`：该事件在启动时发生一次，记录 CLI 的配置信息。
  - **属性**：
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" 或 "json")

- `qwen-code.user_prompt`：当用户提交 prompt 时触发此事件。
  - **属性**：
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string，如果 `log_prompts_enabled` 配置为 `false` 则不记录此属性)
    - `auth_type` (string)

- `qwen-code.tool_call`：每次函数调用时触发此事件。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", 或 "modify"，如适用)
    - `error` (如适用)
    - `error_type` (如适用)
    - `content_length` (int, 如适用)
    - `metadata` (如适用，string -> any 的字典)

- `qwen-code.file_operation`：每次文件操作时触发此事件。
  - **属性**：
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, 如适用)
    - `mimetype` (string, 如适用)
    - `extension` (string, 如适用)
    - `programming_language` (string, 如适用)
    - `diff_stat` (json string, 如适用)：包含以下成员的 JSON 字符串：
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`：向 Qwen API 发起请求时触发此事件。
  - **属性**：
    - `model`
    - `request_text` (如适用)

- `qwen-code.api_error`：API 请求失败时触发此事件。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：收到 Qwen API 响应时触发此事件。
  - **属性**：
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (可选)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (如适用)
    - `auth_type`

- `qwen-code.tool_output_truncated`：当工具调用的输出内容过大并被截断时触发此事件。
  - **属性**：
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`：当 Qwen API 的 `generateJson` 响应无法被解析为 JSON 时触发此事件。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：当 Qwen Code 切换为使用 flash 作为降级方案时触发此事件。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：当用户执行斜杠命令时触发此事件。
  - **属性**：
    - `command` (string)
    - `subcommand` (string, 如适用)

- `qwen-code.extension_enable`：当扩展启用时触发此事件
- `qwen-code.extension_install`：当扩展安装时触发此事件
  - **属性**：
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`：当扩展卸载时触发此事件

### Metrics

Metrics 是对行为在一段时间内的数值测量。Qwen Code 会收集以下指标（指标名称仍保留为 `qwen-code.*` 以保持兼容性）：

- `qwen-code.session.count` (Counter, Int)：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count` (Counter, Int)：统计 tool 调用次数。
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", 或 "modify"，如果适用)
    - `tool_type` (string: "mcp", 或 "native"，如果适用)

- `qwen-code.tool.call.latency` (Histogram, ms)：测量 tool 调用的延迟。
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", 或 "modify"，如果适用)

- `qwen-code.api.request.count` (Counter, Int)：统计所有 API 请求次数。
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (如果适用)

- `qwen-code.api.request.latency` (Histogram, ms)：测量 API 请求的延迟。
  - **Attributes**:
    - `model`

- `qwen-code.token.usage` (Counter, Int)：统计使用的 token 数量。
  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", 或 "tool")

- `qwen-code.file.operation.count` (Counter, Int)：统计文件操作次数。
  - **Attributes**:
    - `operation` (string: "create", "read", "update")：文件操作类型。
    - `lines` (Int, 如果适用)：文件中的行数。
    - `mimetype` (string, 如果适用)：文件的 MIME 类型。
    - `extension` (string, 如果适用)：文件扩展名。
    - `model_added_lines` (Int, 如果适用)：模型添加/修改的行数。
    - `model_removed_lines` (Int, 如果适用)：模型删除/修改的行数。
    - `user_added_lines` (Int, 如果适用)：用户在 AI 建议变更中添加/修改的行数。
    - `user_removed_lines` (Int, 如果适用)：用户在 AI 建议变更中删除/修改的行数。
    - `programming_language` (string, 如果适用)：文件的编程语言。

- `qwen-code.chat_compression` (Counter, Int)：统计聊天压缩操作次数。
  - **Attributes**:
    - `tokens_before` (Int)：压缩前上下文中的 token 数量。
    - `tokens_after` (Int)：压缩后上下文中的 token 数量。