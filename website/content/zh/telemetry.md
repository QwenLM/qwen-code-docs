# Qwen Code 可观测性指南

遥测（Telemetry）提供有关 Qwen Code 性能、健康状况和使用情况的数据。通过启用遥测功能，你可以通过 traces、metrics 和结构化日志来监控运行状态、调试问题并优化工具使用。

Qwen Code 的遥测系统基于 **[OpenTelemetry] (OTEL)** 标准构建，允许你将数据发送到任何兼容的后端。

[OpenTelemetry]: https://opentelemetry.io/

## 启用遥测

你可以通过多种方式启用遥测功能。配置主要通过 [`.qwen/settings.json` 文件](./cli/configuration.md) 和环境变量进行管理，但 CLI flags 可以在特定会话中覆盖这些设置。

### 优先级顺序

以下列出了应用遥测设置的优先级顺序，列表中越靠上的项优先级越高：

1.  **CLI flags（针对 `qwen` 命令）：**
    - `--telemetry` / `--no-telemetry`：覆盖 `telemetry.enabled`。
    - `--telemetry-target <local|gcp>`：覆盖 `telemetry.target`。
    - `--telemetry-otlp-endpoint <URL>`：覆盖 `telemetry.otlpEndpoint`。
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`：覆盖 `telemetry.logPrompts`。
    - `--telemetry-outfile <path>`：将遥测输出重定向到文件。详见 [导出到文件](#exporting-to-a-file)。

1.  **环境变量：**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`：覆盖 `telemetry.otlpEndpoint`。

1.  **工作区设置文件（`.qwen/settings.json`）：** 该 project-specific 文件中 `telemetry` 对象的值。

1.  **用户设置文件（`~/.qwen/settings.json`）：** 该全局用户文件中 `telemetry` 对象的值。

1.  **默认值：** 如果以上均未设置，则应用以下默认值。
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**对于 `npm run telemetry -- --target=<gcp|local>` 脚本：**
该脚本的 `--target` 参数**仅**在该脚本执行期间和目的范围内覆盖 `telemetry.target`（即选择启动哪个 collector）。它不会永久更改你的 `settings.json`。脚本会首先查看 `settings.json` 中的 `telemetry.target` 作为默认值。

### 示例配置

你可以将以下代码添加到你的工作区（`.qwen/settings.json`）或用户级别（`~/.qwen/settings.json`）的配置文件中，以启用遥测功能并将数据发送至 Google Cloud：

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### 导出到文件

你也可以将所有遥测数据导出到一个本地文件中，方便后续查看和分析。

要启用文件导出功能，请使用 `--telemetry-outfile` 参数，并指定输出文件的路径。注意此命令必须配合 `--telemetry-target=local` 使用。

```bash

# 设置你想要的输出文件路径
TELEMETRY_FILE=".qwen/telemetry.log"

# 运行 Qwen Code 并开启本地遥测记录

# 注意：--telemetry-otlp-endpoint="" 是必需的，用于覆盖默认的 OTLP 导出设置，

# 确保遥测数据写入本地文件而不是远程服务。
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## 运行 OTEL Collector

OTEL Collector 是一个接收、处理和导出遥测数据的服务。
CLI 可以使用 OTLP/gRPC 或 OTLP/HTTP 协议发送数据。
你可以通过 `--telemetry-otlp-protocol` flag
或在 `settings.json` 文件中的 `telemetry.otlpProtocol` 设置来指定使用哪种协议。更多
详情请参见 [配置文档](./cli/configuration.md#--telemetry-otlp-protocol)。

在 [documentation][otel-config-docs] 中了解更多关于 OTEL exporter 标准配置的信息。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### 本地部署

使用 `npm run telemetry -- --target=local` 命令可以自动设置本地 telemetry pipeline，包括在你的 `.qwen/settings.json` 文件中配置必要的设置。该脚本会自动安装 `otelcol-contrib`（即 OpenTelemetry Collector）和 `jaeger`（用于查看 traces 的 Jaeger UI）。使用方式如下：

1.  **运行命令**：
    在项目根目录下执行以下命令：

    ```bash
    npm run telemetry -- --target=local
    ```

    脚本将会：
    - 如有需要，自动下载 Jaeger 和 OTEL。
    - 启动一个本地 Jaeger 实例。
    - 启动一个配置好的 OTEL collector，用于接收来自 Qwen Code 的数据。
    - 自动在你的 workspace settings 中启用 telemetry。
    - 脚本退出时，自动禁用 telemetry。

1.  **查看 traces**：
    打开浏览器并访问 **http://localhost:16686**，即可进入 Jaeger UI，查看 Qwen Code 操作的详细 traces。

1.  **查看 logs 和 metrics**：
    脚本会将 OTEL collector 的输出（包括 logs 和 metrics）重定向到 `~/.qwen/tmp/<projectHash>/otel/collector.log`。脚本还会提供链接和命令，方便你本地查看 telemetry 数据（traces、metrics、logs）。

1.  **停止服务**：
    在脚本运行的终端中按下 `Ctrl+C`，即可停止 OTEL Collector 和 Jaeger 服务。

### Google Cloud

使用 `npm run telemetry -- --target=gcp` 命令可以自动设置一个本地的 OpenTelemetry collector，将数据转发到你的 Google Cloud 项目，并自动配置 `.qwen/settings.json` 文件中的必要参数。该脚本会安装 `otelcol-contrib`。使用步骤如下：

1.  **前置条件**：
    - 拥有一个 Google Cloud 项目 ID。
    - 导出 `GOOGLE_CLOUD_PROJECT` 环境变量，以便 OTEL collector 可以访问它。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - 完成 Google Cloud 身份验证（例如运行 `gcloud auth application-default login` 或确保已设置 `GOOGLE_APPLICATION_CREDENTIALS`）。
    - 确保你的 Google Cloud 账号或服务账号拥有以下 IAM 角色："Cloud Trace Agent"、"Monitoring Metric Writer" 和 "Logs Writer"。

1.  **执行命令**：
    在仓库根目录下运行以下命令：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    脚本将会：
    - 如果需要，下载 `otelcol-contrib` 二进制文件。
    - 启动一个 OTEL collector，用于接收来自 Qwen Code 的遥测数据并导出至你指定的 Google Cloud 项目。
    - 自动在工作区设置中启用 telemetry 并关闭 sandbox 模式（`.qwen/settings.json`）。
    - 提供直接链接，方便你在 Google Cloud Console 中查看 traces、metrics 和 logs。
    - 当你退出脚本时（按 Ctrl+C），它会尝试恢复原始的 telemetry 和 sandbox 设置。

1.  **运行 Qwen Code**：
    在另一个终端窗口中运行你的 Qwen Code 命令。这会产生遥测数据，由 collector 进行捕获。

1.  **在 Google Cloud 中查看遥测数据**：
    使用脚本提供的链接跳转到 Google Cloud Console 查看 traces、metrics 和 logs。

1.  **检查本地 collector 日志**：
    脚本会将本地 OTEL collector 的输出重定向到 `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`。脚本同时提供查看和实时跟踪 collector 日志的链接与命令。

1.  **停止服务**：
    在脚本运行的终端中按下 `Ctrl+C` 即可停止 OTEL Collector。

## 日志和指标参考

以下部分描述了为 Qwen Code 生成的日志和指标的结构。

- 所有日志和指标都包含一个通用属性 `sessionId`。

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

- `qwen-code.user_prompt`：该事件在用户提交 prompt 时发生。
  - **属性**：
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string，如果 `log_prompts_enabled` 配置为 `false`，则该属性会被排除)
    - `auth_type` (string)

- `qwen-code.tool_call`：该事件在每次函数调用时发生。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", 或 "modify"，如适用)
    - `error` (如适用)
    - `error_type` (如适用)
    - `metadata` (如适用，string -> any 的字典)

- `qwen-code.api_request`：该事件在向 Qwen API 发起请求时发生。
  - **属性**：
    - `model`
    - `request_text` (如适用)

- `qwen-code.api_error`：该事件在 API 请求失败时发生。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：该事件在收到 Qwen API 响应时发生。
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

- `qwen-code.flash_fallback`：该事件在 Qwen Code 切换为使用 flash 作为 fallback 时发生。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：该事件在用户执行斜杠命令时发生。
  - **属性**：
    - `command` (string)
    - `subcommand` (string, 如适用)

### 指标（Metrics）

指标是随时间变化的行为数值测量。Qwen Code 会收集以下指标（为保持兼容性，指标名称仍为 `qwen-code.*`）：

- `qwen-code.session.count`（计数器，整数）：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count`（计数器，整数）：统计工具调用次数。
  - **属性**：
    - `function_name`
    - `success`（布尔值）
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）
    - `tool_type`（字符串："mcp" 或 "native"，如适用）

- `qwen-code.tool.call.latency`（直方图，单位：毫秒）：测量工具调用的延迟。
  - **属性**：
    - `function_name`
    - `decision`（字符串："accept"、"reject" 或 "modify"，如适用）

- `qwen-code.api.request.count`（计数器，整数）：统计所有 API 请求次数。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（如适用）

- `qwen-code.api.request.latency`（直方图，单位：毫秒）：测量 API 请求的延迟。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（计数器，整数）：统计使用的 token 数量。
  - **属性**：
    - `model`
    - `type`（字符串："input"、"output"、"thought"、"cache" 或 "tool"）

- `qwen-code.file.operation.count`（计数器，整数）：统计文件操作次数。
  - **属性**：
    - `operation`（字符串："create"、"read"、"update"）：文件操作类型。
    - `lines`（整数，如适用）：文件行数。
    - `mimetype`（字符串，如适用）：文件的 MIME 类型。
    - `extension`（字符串，如适用）：文件扩展名。
    - `ai_added_lines`（整数，如适用）：AI 添加/修改的行数。
    - `ai_removed_lines`（整数，如适用）：AI 删除/修改的行数。
    - `user_added_lines`（整数，如适用）：用户在 AI 提议的更改中添加/修改的行数。
    - `user_removed_lines`（整数，如适用）：用户在 AI 提议的更改中删除/修改的行数。
    - `programming_language`（字符串，如适用）：文件的编程语言。

- `qwen-code.chat_compression`（计数器，整数）：统计聊天压缩操作次数。
  - **属性**：
    - `tokens_before`（整数）：压缩前上下文中的 token 数量。
    - `tokens_after`（整数）：压缩后上下文中的 token 数量。