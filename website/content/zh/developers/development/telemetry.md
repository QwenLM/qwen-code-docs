# 使用 OpenTelemetry 实现可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观测性](#使用-opentelemetry-实现可观测性)
  - [核心优势](#核心优势)
  - [OpenTelemetry 集成](#opentelemetry-集成)
  - [配置](#配置)
  - [阿里云 Telemetry](#阿里云-telemetry)
    - [前提条件](#前提条件)
    - [直接导出（推荐）](#直接导出推荐)
  - [本地 Telemetry](#本地-telemetry)
    - [基于文件的输出（推荐）](#基于文件的输出推荐)
    - [基于 Collector 的导出（高级）](#基于-collector 的导出高级)
  - [日志与指标](#日志与指标)
    - [日志](#日志)
    - [指标](#指标)

## 主要优势

- **🔍 使用情况分析**：了解团队内的交互模式和功能采用情况  
- **⚡ 性能监控**：跟踪响应时间、Token 消耗量及资源利用率  
- **🐛 实时调试**：在问题发生时即时识别性能瓶颈、失败点及错误模式  
- **📊 工作流优化**：基于数据做出决策，改进配置与流程  
- **🏢 企业级治理**：跨团队监控使用情况、追踪成本、确保合规性，并与现有监控基础设施集成

## OpenTelemetry 集成

基于 **[OpenTelemetry]** —— 一个厂商中立、业界标准的可观测性框架 —— Qwen Code 的可观测性系统提供以下能力：

- **通用兼容性**：可导出至任意 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中采用统一的数据格式与采集方式
- **面向未来的集成能力**：无缝对接现有及未来新增的可观测性基础设施
- **无厂商锁定**：无需修改埋点代码，即可自由切换后端服务

[OpenTelemetry]: https://opentelemetry.io/

## 配置

> [!note]
>
> **⚠️ 特别说明：此功能需要相应的代码修改。本文档提前提供，实际功能请参考后续的代码更新。**

所有遥测行为均通过你的 `.qwen/settings.json` 文件进行控制。  
这些设置可通过环境变量或 CLI 参数覆盖。

| 设置项             | 环境变量                           | CLI 参数                                                   | 描述                                     | 可选值                | 默认值                 |
| ------------------ | ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------- | --------------------- | ---------------------- |
| `enabled`          | `QWEN_TELEMETRY_ENABLED`           | `--telemetry` / `--no-telemetry`                           | 启用或禁用遥测                           | `true`/`false`        | `false`                |
| `target`           | `QWEN_TELEMETRY_TARGET`            | `--telemetry-target <local\|qwen>`                         | 遥测数据发送目标                         | `"qwen"`/`"local"`    | `"local"`              |
| `otlpEndpoint`     | `QWEN_TELEMETRY_OTLP_ENDPOINT`     | `--telemetry-otlp-endpoint <URL>`                          | OTLP 数据收集器端点                      | URL 字符串            | `http://localhost:4317` |
| `otlpProtocol`     | `QWEN_TELEMETRY_OTLP_PROTOCOL`     | `--telemetry-otlp-protocol <grpc\|http>`                   | OTLP 传输协议                            | `"grpc"`/`"http"`     | `"grpc"`               |
| `outfile`          | `QWEN_TELEMETRY_OUTFILE`           | `--telemetry-outfile <path>`                               | 将遥测数据保存至文件（优先级高于 `otlpEndpoint`） | 文件路径              | -                      |
| `logPrompts`       | `QWEN_TELEMETRY_LOG_PROMPTS`       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`   | 在遥测日志中包含提示词（prompts）         | `true`/`false`        | `true`                 |
| `useCollector`     | `QWEN_TELEMETRY_USE_COLLECTOR`     | -                                                          | 使用外部 OTLP 收集器（高级选项）         | `true`/`false`        | `false`                |

**关于布尔型环境变量的说明：** 对于布尔型设置项（`enabled`、`logPrompts`、`useCollector`），将对应环境变量设为 `true` 或 `1` 即可启用该功能；其他任意值均视为禁用。

有关所有配置选项的详细信息，请参阅  
[配置指南](./cli/configuration.md)。

## 阿里云遥测

### 直接导出（推荐）

将遥测数据直接发送至阿里云服务，无需部署采集器。

1. 在 `.qwen/settings.json` 中启用遥测：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. 运行 Qwen Code 并发送提示词。
3. 在阿里云控制台中查看日志和指标。

## 本地遥测

在本地开发与调试时，可将遥测数据捕获至本地：

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
2. 运行 Qwen Code 并发送提示词。
3. 在指定文件中查看日志和指标（例如 `.qwen/telemetry.log`）。

### 基于采集器的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   此操作将：
   - 下载并启动 Jaeger 和 OpenTelemetry（OTEL）采集器
   - 为本地遥测配置你的工作区
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志和指标保存至 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时（例如按 `Ctrl+C`）自动停止采集器
2. 启动 Qwen Code 并发送提示词（prompts）。
3. 在 http://localhost:16686 查看追踪数据（traces），并在采集器日志文件中查看日志和指标。

## 日志与指标

以下部分描述了 Qwen Code 生成的日志与指标的结构：

- 所有日志和指标均包含一个公共属性 `sessionId`。

### 日志

日志是带有时间戳的特定事件记录。Qwen Code 会记录以下事件：

- `qwen-code.config`：此事件在 CLI 启动时仅发生一次，记录其配置信息。  
  - **属性**：  
    - `model`（字符串）  
    - `sandbox_enabled`（布尔值）  
    - `core_tools_enabled`（字符串）  
    - `approval_mode`（字符串）  
    - `file_filtering_respect_git_ignore`（布尔值）  
    - `debug_mode`（布尔值）  
    - `truncate_tool_output_threshold`（数字）  
    - `truncate_tool_output_lines`（数字）  
    - `hooks`（字符串，逗号分隔的钩子事件类型；若禁用钩子则省略）  
    - `ide_enabled`（布尔值）  
    - `interactive_shell_enabled`（布尔值）  
    - `mcp_servers`（字符串）  
    - `output_format`（字符串："text" 或 "json"）

- `qwen-code.user_prompt`：此事件在用户提交提示词（prompt）时触发。  
  - **属性**：  
    - `prompt_length`（整数）  
    - `prompt_id`（字符串）  
    - `prompt`（字符串；若配置项 `log_prompts_enabled` 为 `false`，则该字段被排除）  
    - `auth_type`（字符串）

- `qwen-code.tool_call`：每次函数调用均触发此事件。  
  - **属性**：  
    - `function_name`  
    - `function_args`  
    - `duration_ms`  
    - `success`（布尔值）  
    - `decision`（字符串："accept"、"reject"、"auto_accept" 或 "modify"，如适用）  
    - `error`（如适用）  
    - `error_type`（如适用）  
    - `content_length`（整数，如适用）  
    - `metadata`（如适用，字符串 → 任意类型的字典）

- `qwen-code.file_operation`：每次文件操作均触发此事件。  
  - **属性**：  
    - `tool_name`（字符串）  
    - `operation`（字符串："create"、"read" 或 "update"）  
    - `lines`（整数，如适用）  
    - `mimetype`（字符串，如适用）  
    - `extension`（字符串，如适用）  
    - `programming_language`（字符串，如适用）  
    - `diff_stat`（JSON 字符串，如适用）：包含以下字段的 JSON 字符串：  
      - `ai_added_lines`（整数）  
      - `ai_removed_lines`（整数）  
      - `user_added_lines`（整数）  
      - `user_removed_lines`（整数）

- `qwen-code.api_request`：向 Qwen API 发起请求时触发此事件。  
  - **属性**：  
    - `model`  
    - `request_text`（如适用）

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
    - `error`（可选）  
    - `input_token_count`  
    - `output_token_count`  
    - `cached_content_token_count`  
    - `thoughts_token_count`  
    - `tool_token_count`  
    - `response_text`（如适用）  
    - `auth_type`

- `qwen-code.tool_output_truncated`：工具调用输出过大而被截断时触发此事件。  
  - **属性**：  
    - `tool_name`（字符串）  
    - `original_content_length`（整数）  
    - `truncated_content_length`（整数）  
    - `threshold`（整数）  
    - `lines`（整数）  
    - `prompt_id`（字符串）

- `qwen-code.malformed_json_response`：Qwen API 的 `generateJson` 响应无法解析为合法 JSON 时触发此事件。  
  - **属性**：  
    - `model`

- `qwen-code.flash_fallback`：Qwen Code 切换至 Flash 作为备用方案时触发此事件。  
  - **属性**：  
    - `auth_type`

- `qwen-code.slash_command`：用户执行斜杠命令（slash command）时触发此事件。  
  - **属性**：  
    - `command`（字符串）  
    - `subcommand`（字符串，如适用）

- `qwen-code.extension_enable`：启用扩展时触发此事件  
- `qwen-code.extension_install`：安装扩展时触发此事件  
  - **属性**：  
    - `extension_name`（字符串）  
    - `extension_version`（字符串）  
    - `extension_source`（字符串）  
    - `status`（字符串）  
- `qwen-code.extension_uninstall`：卸载扩展时触发此事件

### 指标

指标是随时间变化的行为数值度量。以下指标被收集用于 Qwen Code（为保持兼容性，指标名称仍为 `qwen-code.*`）：

- `qwen-code.session.count`（计数器，整型）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（计数器，整型）：统计工具调用次数。  
  - **属性**：  
    - `function_name`  
    - `success`（布尔值）  
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）  
    - `tool_type`（字符串："mcp" 或 "native"，如适用）

- `qwen-code.tool.call.latency`（直方图，毫秒）：测量工具调用延迟。  
  - **属性**：  
    - `function_name`  
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）

- `qwen-code.api.request.count`（计数器，整型）：统计所有 API 请求次数。  
  - **属性**：  
    - `model`  
    - `status_code`  
    - `error_type`（如适用）

- `qwen-code.api.request.latency`（直方图，毫秒）：测量 API 请求延迟。  
  - **属性**：  
    - `model`

- `qwen-code.token.usage`（计数器，整型）：统计所用 token 数量。  
  - **属性**：  
    - `model`  
    - `type`（字符串："input"、"output"、"thought"、"cache" 或 "tool"）

- `qwen-code.file.operation.count`（计数器，整型）：统计文件操作次数。  
  - **属性**：  
    - `operation`（字符串："create"、"read"、"update"）：文件操作类型。  
    - `lines`（整型，如适用）：文件行数。  
    - `mimetype`（字符串，如适用）：文件 MIME 类型。  
    - `extension`（字符串，如适用）：文件扩展名。  
    - `model_added_lines`（整型，如适用）：模型新增/修改的行数。  
    - `model_removed_lines`（整型，如适用）：模型删除/修改的行数。  
    - `user_added_lines`（整型，如适用）：用户在 AI 提出的变更中新增/修改的行数。  
    - `user_removed_lines`（整型，如适用）：用户在 AI 提出的变更中删除/修改的行数。  
    - `programming_language`（字符串，如适用）：文件所属编程语言。

- `qwen-code.chat_compression`（计数器，整型）：统计聊天上下文压缩操作次数。  
  - **属性**：  
    - `tokens_before`（整型）：压缩前上下文中的 token 数量。  
    - `tokens_after`（整型）：压缩后上下文中的 token 数量。