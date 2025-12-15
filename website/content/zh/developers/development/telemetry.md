# 使用 OpenTelemetry 实现可观测性

了解如何为 Qwen Code 启用和设置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观测性](#observability-with-opentelemetry)
  - [主要优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [阿里云遥测](#aliyun-telemetry)
    - [前提条件](#prerequisites)
    - [直接导出（推荐）](#direct-export-recommended)
  - [本地遥测](#local-telemetry)
    - [基于文件的输出（推荐）](#file-based-output-recommended)
    - [基于收集器的导出（高级）](#collector-based-export-advanced)
  - [日志和指标](#logs-and-metrics)
    - [日志](#logs)
    - [指标](#metrics)

## 核心优势

- **🔍 使用分析**：了解团队内的交互模式和功能采用情况
- **⚡ 性能监控**：跟踪响应时间、令牌消耗和资源利用率
- **🐛 实时调试**：及时发现瓶颈、故障和错误模式
- **📊 工作流优化**：通过数据驱动的决策来改进配置和流程
- **🏢 企业治理**：跨团队监控使用情况、跟踪成本、确保合规，并与现有监控基础设施集成

## OpenTelemetry 集成

基于 **[OpenTelemetry]** —— 一个供应商中立、行业标准的可观察性框架 —— Qwen Code 的可观察性系统提供：

- **通用兼容性**：导出到任何 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在工具链中使用一致的格式和收集方法
- **面向未来的集成**：与现有及未来的可观察性基础设施连接
- **无供应商锁定**：无需更改检测方式即可在后端之间切换

[OpenTelemetry]: https://opentelemetry.io/

## 配置

> [!note]
>
> **⚠️ 特别说明：此功能需要相应的代码更改。本文档为提前提供，请参考未来的代码更新以获取实际功能。**

所有遥测行为都通过你的 `.qwen/settings.json` 文件进行控制。
这些设置可以通过环境变量或 CLI 标志进行覆盖。

| 设置项         | 环境变量                        | CLI 标志                                                  | 描述                                              | 值                 | 默认值                  |
| -------------- | ------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`        | `--telemetry` / `--no-telemetry`                          | 启用或禁用遥测                                     | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`         | `--telemetry-target <local\|qwen>`                        | 遥测数据发送目标                                   | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT`  | `--telemetry-otlp-endpoint <URL>`                         | OTLP 收集器端点                                    | URL 字符串         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL`  | `--telemetry-otlp-protocol <grpc\|http>`                  | OTLP 传输协议                                      | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`        | `--telemetry-outfile <path>`                              | 将遥测数据保存到文件（覆盖 `otlpEndpoint`）        | 文件路径           | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`    | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`  | 在遥测日志中包含提示信息                           | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR`  | -                                                         | 使用外部 OTLP 收集器（高级选项）                   | `true`/`false`     | `false`                 |

**关于布尔型环境变量的说明：** 对于布尔型设置（`enabled`、`logPrompts`、`useCollector`），将对应的环境变量设置为 `true` 或 `1` 即可启用该功能。其他任何值都将禁用该功能。

有关所有配置选项的详细信息，请参阅[配置指南](./cli/configuration.md)。

## 阿里云遥测

### 直接导出（推荐）

将遥测数据直接发送到阿里云服务。无需收集器。

1. 在你的 `.qwen/settings.json` 中启用遥测：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. 运行 Qwen Code 并发送提示。
3. 在阿里云控制台中查看日志和指标。

## 本地遥测

用于本地开发和调试，你可以在本地捕获遥测数据：

### 基于文件的输出（推荐）

1. 在你的 `.qwen/settings.json` 中启用遥测：
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
2. 运行 Qwen Code 并发送提示。
3. 在指定的文件中查看日志和指标（例如，`.qwen/telemetry.log`）。

### 基于收集器的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   此操作将：
   - 下载并启动 Jaeger 和 OTEL 收集器
   - 为本地遥测配置你的工作区
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存到 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 在退出时停止收集器（例如 `Ctrl+C`）
2. 运行 Qwen Code 并发送提示。
3. 在 http://localhost:16686 查看追踪信息，并在收集器日志文件中查看日志/指标。

## 日志和指标

以下部分描述了为 Qwen Code 生成的日志和指标的结构。

- 所有日志和指标都包含一个名为 `sessionId` 的通用属性。

### 日志

日志是特定事件的时间戳记录。Qwen Code 会记录以下事件：

- `qwen-code.config`：此事件在启动时发生一次，包含 CLI 的配置信息。
  - **属性**：
    - `model`（字符串）
    - `embedding_model`（字符串）
    - `sandbox_enabled`（布尔值）
    - `core_tools_enabled`（字符串）
    - `approval_mode`（字符串）
    - `api_key_enabled`（布尔值）
    - `vertex_ai_enabled`（布尔值）
    - `code_assist_enabled`（布尔值）
    - `log_prompts_enabled`（布尔值）
    - `file_filtering_respect_git_ignore`（布尔值）
    - `debug_mode`（布尔值）
    - `mcp_servers`（字符串）
    - `output_format`（字符串："text" 或 "json"）

- `qwen-code.user_prompt`：此事件在用户提交提示时发生。
  - **属性**：
    - `prompt_length`（整数）
    - `prompt_id`（字符串）
    - `prompt`（字符串，如果 `log_prompts_enabled` 配置为 `false`，则该属性会被排除）
    - `auth_type`（字符串）

- `qwen-code.tool_call`：此事件在每次函数调用时发生。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject"、"auto_accept" 或 "modify"，如适用）
    - `error`（如适用）
    - `error_type`（如适用）
    - `content_length`（整数，如适用）
    - `metadata`（如适用，字符串到任意类型的字典）

- `qwen-code.file_operation`：此事件在每次文件操作时发生。
  - **属性**：
    - `tool_name`（字符串）
    - `operation`（字符串："create"、"read"、"update"）
    - `lines`（整数，如适用）
    - `mimetype`（字符串，如适用）
    - `extension`（字符串，如适用）
    - `programming_language`（字符串，如适用）
    - `diff_stat`（JSON 字符串，如适用）：一个包含以下成员的 JSON 字符串：
      - `ai_added_lines`（整数）
      - `ai_removed_lines`（整数）
      - `user_added_lines`（整数）
      - `user_removed_lines`（整数）

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
    - `tool_token_count`
    - `response_text`（如适用）
    - `auth_type`

- `qwen-code.tool_output_truncated`：此事件在工具调用输出过大并被截断时发生。
  - **属性**：
    - `tool_name`（字符串）
    - `original_content_length`（整数）
    - `truncated_content_length`（整数）
    - `threshold`（整数）
    - `lines`（整数）
    - `prompt_id`（字符串）

- `qwen-code.malformed_json_response`：此事件在 Qwen API 返回的 `generateJson` 响应无法解析为 JSON 时发生。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：此事件在 Qwen Code 切换至 Flash 作为备用方案时发生。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：此事件在用户执行斜杠命令时发生。
  - **属性**：
    - `command`（字符串）
    - `subcommand`（字符串，如适用）

- `qwen-code.extension_enable`：此事件在启用扩展时发生。
- `qwen-code.extension_install`：此事件在安装扩展时发生。
  - **属性**：
    - `extension_name`（字符串）
    - `extension_version`（字符串）
    - `extension_source`（字符串）
    - `status`（字符串）
- `qwen-code.extension_uninstall`：此事件在卸载扩展时发生。

### 指标

指标是随时间变化的行为的数值测量。Qwen Code 收集以下指标（指标名称保持为 `qwen-code.*` 以确保兼容性）：

- `qwen-code.session.count`（计数器，整数）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（计数器，整数）：统计工具调用次数。
  - **属性**：
    - `function_name`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）
    - `tool_type`（字符串："mcp" 或 "native"，如适用）

- `qwen-code.tool.call.latency`（直方图，毫秒）：测量工具调用延迟。
  - **属性**：
    - `function_name`
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）

- `qwen-code.api.request.count`（计数器，整数）：统计所有 API 请求次数。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（如适用）

- `qwen-code.api.request.latency`（直方图，毫秒）：测量 API 请求延迟。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（计数器，整数）：统计使用的 token 数量。
  - **属性**：
    - `model`
    - `type`（字符串："input"、"output"、"thought"、"cache" 或 "tool"）

- `qwen-code.file.operation.count`（计数器，整数）：统计文件操作次数。
  - **属性**：
    - `operation`（字符串："create"、"read"、"update"）：文件操作类型。
    - `lines`（整数，如适用）：文件中的行数。
    - `mimetype`（字符串，如适用）：文件的 MIME 类型。
    - `extension`（字符串，如适用）：文件扩展名。
    - `model_added_lines`（整数，如适用）：模型添加/更改的行数。
    - `model_removed_lines`（整数，如适用）：模型删除/更改的行数。
    - `user_added_lines`（整数，如适用）：用户在 AI 提议的更改中添加/更改的行数。
    - `user_removed_lines`（整数，如适用）：用户在 AI 提议的更改中删除/更改的行数。
    - `programming_language`（字符串，如适用）：文件的编程语言。

- `qwen-code.chat_compression`（计数器，整数）：统计聊天压缩操作次数。
  - **属性**：
    - `tokens_before`（整数）：压缩前上下文中的 token 数量。
    - `tokens_after`（整数）：压缩后上下文中的 token 数量。