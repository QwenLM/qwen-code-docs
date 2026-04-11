# 使用 OpenTelemetry 实现可观测性

了解如何为 Qwen Code 启用和配置 OpenTelemetry。

- [使用 OpenTelemetry 实现可观测性](#observability-with-opentelemetry)
  - [核心优势](#key-benefits)
  - [OpenTelemetry 集成](#opentelemetry-integration)
  - [配置](#configuration)
  - [阿里云遥测](#aliyun-telemetry)
    - [前置条件](#prerequisites)
    - [直接导出（推荐）](#direct-export-recommended)
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
- **📊 工作流优化**：基于数据做出明智决策，持续优化配置与流程
- **🏢 企业级治理**：监控跨团队使用情况、追踪成本、确保合规性，并与现有监控基础设施无缝集成

## OpenTelemetry 集成

Qwen Code 的可观测性系统基于 **[OpenTelemetry]**（厂商中立、行业标准的可观测性框架）构建，提供以下能力：

- **广泛兼容**：支持导出至任意 OpenTelemetry 后端（阿里云、Jaeger、Prometheus、Datadog 等）
- **标准化数据**：在整个工具链中使用统一的格式与采集方法
- **面向未来的集成**：无缝对接现有及未来的可观测性基础设施
- **无厂商锁定**：无需修改埋点代码即可自由切换后端

[OpenTelemetry]: https://opentelemetry.io/

## 配置

> [!note]
>
> **⚠️ 特别说明：此功能需要配合相应的代码变更。本文档为提前发布，请以未来的代码更新为准以获取实际功能。**

所有遥测行为均通过 `.qwen/settings.json` 文件进行控制。这些设置可被环境变量或 CLI 参数覆盖。

| 配置项 | 环境变量 | CLI 参数 | 说明 | 可选值 | 默认值 |
| -------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled` | `QWEN_TELEMETRY_ENABLED` | `--telemetry` / `--no-telemetry` | 启用或禁用遥测 | `true`/`false` | `false` |
| `target` | `QWEN_TELEMETRY_TARGET` | `--telemetry-target <local\|qwen>` | 遥测数据发送目标 | `"qwen"`/`"local"` | `"local"` |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>` | OTLP collector 端点 | URL 字符串 | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>` | OTLP 传输协议 | `"grpc"`/`"http"` | `"grpc"` |
| `outfile` | `QWEN_TELEMETRY_OUTFILE` | `--telemetry-outfile <path>` | 将遥测数据保存至文件（覆盖 `otlpEndpoint`） | 文件路径 | - |
| `logPrompts` | `QWEN_TELEMETRY_LOG_PROMPTS` | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | 在遥测日志中包含 prompt | `true`/`false` | `true` |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | - | 使用外部 OTLP collector（高级） | `true`/`false` | `false` |

**布尔型环境变量说明：** 对于布尔型配置项（`enabled`、`logPrompts`、`useCollector`），将对应的环境变量设置为 `true` 或 `1` 即可启用该功能。设置为其他任何值均表示禁用。

有关所有配置选项的详细信息，请参阅 [配置指南](./cli/configuration.md)。

## 阿里云遥测

### 前置条件

### 直接导出（推荐）

将遥测数据直接发送至阿里云服务。无需部署 collector。

1. 在 `.qwen/settings.json` 中启用遥测：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. 运行 Qwen Code 并发送 prompt。
3. 在阿里云控制台查看日志与指标。

## 本地遥测

在本地开发与调试时，你可以将遥测数据捕获到本地：

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
2. 运行 Qwen Code 并发送 prompt。
3. 在指定文件（例如 `.qwen/telemetry.log`）中查看日志与指标。

### 基于 Collector 的导出（高级）

1. 运行自动化脚本：
   ```bash
   npm run telemetry -- --target=local
   ```
   该脚本将执行以下操作：
   - 下载并启动 Jaeger 与 OTEL collector
   - 配置工作区以支持本地遥测
   - 在 http://localhost:16686 提供 Jaeger UI
   - 将日志/指标保存至 `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - 退出时自动停止 collector（例如按 `Ctrl+C`）
2. 运行 Qwen Code 并发送 prompt。
3. 在 http://localhost:16686 查看 Trace，并在 collector 日志文件中查看日志/指标。

## 日志与指标

以下部分描述了 Qwen Code 生成的日志与指标结构。

- 所有日志与指标均包含一个公共属性 `sessionId`。

### 日志

日志是带有时间戳的特定事件记录。Qwen Code 会记录以下事件：

- `qwen-code.config`：此事件在 CLI 启动时触发一次，包含 CLI 的配置信息。
  - **Attributes**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string，逗号分隔的 hook 事件类型，若禁用 hook 则省略)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" 或 "json")

- `qwen-code.user_prompt`：此事件在用户提交 prompt 时触发。
  - **Attributes**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string，若 `log_prompts_enabled` 配置为 `false` 则排除此属性)
    - `auth_type` (string)

- `qwen-code.tool_call`：此事件在每次函数调用时触发。
  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、"auto_accept" 或 "modify"，如适用)
    - `error`（如适用）
    - `error_type`（如适用）
    - `content_length` (int，如适用)
    - `metadata`（如适用，string -> any 的字典）

- `qwen-code.file_operation`：此事件在每次文件操作时触发。
  - **Attributes**:
    - `tool_name` (string)
    - `operation` (string: "create"、"read"、"update")
    - `lines` (int，如适用)
    - `mimetype` (string，如适用)
    - `extension` (string，如适用)
    - `programming_language` (string，如适用)
    - `diff_stat` (json string，如适用)：包含以下成员的 JSON 字符串：
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`：此事件在向 Qwen API 发起请求时触发。
  - **Attributes**:
    - `model`
    - `request_text`（如适用）

- `qwen-code.api_error`：此事件在 API 请求失败时触发。
  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：此事件在收到 Qwen API 响应时触发。
  - **Attributes**:
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

- `qwen-code.tool_output_truncated`：此事件在工具调用输出过大并被截断时触发。
  - **Attributes**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`：此事件在 Qwen API 返回的 `generateJson` 响应无法解析为 JSON 时触发。
  - **Attributes**:
    - `model`

- `qwen-code.flash_fallback`：此事件在 Qwen Code 切换至 flash 模型作为 fallback 时触发。
  - **Attributes**:
    - `auth_type`

- `qwen-code.slash_command`：此事件在用户执行斜杠命令时触发。
  - **Attributes**:
    - `command` (string)
    - `subcommand` (string，如适用)

- `qwen-code.extension_enable`：此事件在启用扩展时触发
- `qwen-code.extension_install`：此事件在安装扩展时触发
  - **Attributes**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`：此事件在卸载扩展时触发

### 指标

指标是随时间推移对行为的数值化度量。Qwen Code 会收集以下指标（为保持兼容性，指标名称仍为 `qwen-code.*`）：

- `qwen-code.session.count` (Counter, Int)：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count` (Counter, Int)：统计工具调用次数。
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject" 或 "modify"，如适用)
    - `tool_type` (string: "mcp" 或 "native"，如适用)

- `qwen-code.tool.call.latency` (Histogram, ms)：测量工具调用延迟。
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept"、"reject" 或 "modify"，如适用)

- `qwen-code.api.request.count` (Counter, Int)：统计所有 API 请求次数。
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type`（如适用）

- `qwen-code.api.request.latency` (Histogram, ms)：测量 API 请求延迟。
  - **Attributes**:
    - `model`

- `qwen-code.token.usage` (Counter, Int)：统计使用的 Token 数量。
  - **Attributes**:
    - `model`
    - `type` (string: "input"、"output"、"thought"、"cache" 或 "tool")

- `qwen-code.file.operation.count` (Counter, Int)：统计文件操作次数。
  - **Attributes**:
    - `operation` (string: "create"、"read"、"update")：文件操作类型。
    - `lines` (Int，如适用)：文件行数。
    - `mimetype` (string，如适用)：文件 MIME 类型。
    - `extension` (string，如适用)：文件扩展名。
    - `model_added_lines` (Int，如适用)：模型添加/修改的行数。
    - `model_removed_lines` (Int，如适用)：模型删除/修改的行数。
    - `user_added_lines` (Int，如适用)：用户在 AI 建议的更改中添加/修改的行数。
    - `user_removed_lines` (Int，如适用)：用户在 AI 建议的更改中删除/修改的行数。
    - `programming_language` (string，如适用)：文件的编程语言。

- `qwen-code.chat_compression` (Counter, Int)：统计对话压缩操作次数
  - **Attributes**:
    - `tokens_before` (Int)：压缩前上下文中的 Token 数量
    - `tokens_after` (Int)：压缩后上下文中的 Token 数量