# Qwen Code 可观测性指南

遥测（Telemetry）提供了有关 Qwen Code 性能、健康状况和使用情况的数据。通过启用遥测功能，你可以通过 traces、metrics 和结构化日志来监控操作、调试问题并优化工具使用。

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
该脚本的 `--target` 参数**仅**在该脚本执行期间和目的范围内覆盖 `telemetry.target`（即，选择启动哪个 collector）。它不会永久更改你的 `settings.json`。脚本会首先查看 `settings.json` 中的 `telemetry.target` 作为默认值。

### 示例配置

你可以将以下代码添加到你的工作区 (`.qwen/settings.json`) 或用户 (`~/.qwen/settings.json`) 配置文件中，以启用遥测功能并将数据发送到 Google Cloud：

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

你可以将所有遥测数据导出到一个文件中，以便在本地进行检查。

要启用文件导出功能，请使用 `--telemetry-outfile` 参数，并指定你希望输出的文件路径。此操作必须配合 `--telemetry-target=local` 一起运行。

```bash

# 设置你期望的输出文件路径
TELEMETRY_FILE=".qwen/telemetry.log"

# 使用本地遥测配置运行 Qwen Code

# 注意：--telemetry-otlp-endpoint="" 是必需的，用于覆盖默认的

# OTLP 导出器，确保遥测数据写入本地文件。
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## 运行 OTEL Collector

OTEL Collector 是一个接收、处理和导出遥测数据的服务。
CLI 使用 OTLP/gRPC 协议发送数据。

在 [documentation][otel-config-docs] 中了解更多关于 OTEL exporter 标准配置的信息。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### 本地部署

使用 `npm run telemetry -- --target=local` 命令可以自动化设置本地 telemetry pipeline，包括在你的 `.qwen/settings.json` 文件中配置必要的设置。该脚本会自动安装 `otelcol-contrib`（即 OpenTelemetry Collector）和 `jaeger`（用于查看 traces 的 Jaeger UI）。使用方式如下：

1.  **运行命令**：
    在项目根目录下执行以下命令：

    ```bash
    npm run telemetry -- --target=local
    ```

    脚本将会：
    - 如果需要，下载 Jaeger 和 OTEL。
    - 启动一个本地的 Jaeger 实例。
    - 启动一个配置好的 OTEL collector，用于接收来自 Qwen Code 的数据。
    - 自动在你的 workspace settings 中启用 telemetry。
    - 在退出时自动禁用 telemetry。

1.  **查看 traces**：
    打开浏览器并访问 **http://localhost:16686** 进入 Jaeger UI，在这里你可以查看 Qwen Code 操作的详细 traces。

1.  **查看 logs 和 metrics**：
    脚本会将 OTEL collector 的输出（包括 logs 和 metrics）重定向到 `~/.qwen/tmp/<projectHash>/otel/collector.log`。脚本还会提供链接和命令，方便你本地查看 telemetry 数据（traces、metrics、logs）。

1.  **停止服务**：
    在脚本运行的终端中按下 `Ctrl+C`，即可停止 OTEL Collector 和 Jaeger 服务。

### Google Cloud

使用 `npm run telemetry -- --target=gcp` 命令可以自动设置一个本地 OpenTelemetry collector，将数据转发到你的 Google Cloud 项目，并自动配置 `.qwen/settings.json` 文件中的必要设置。该脚本会安装 `otelcol-contrib`。使用步骤如下：

1.  **前提条件**：
    - 拥有一个 Google Cloud 项目 ID。
    - 导出 `GOOGLE_CLOUD_PROJECT` 环境变量，以便 OTEL collector 可以读取。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - 完成 Google Cloud 身份验证（例如运行 `gcloud auth application-default login`，或确保已设置 `GOOGLE_APPLICATION_CREDENTIALS`）。
    - 确保你的 Google Cloud 账号或 service account 拥有以下 IAM 角色："Cloud Trace Agent"、"Monitoring Metric Writer" 和 "Logs Writer"。

1.  **运行命令**：
    在项目根目录下执行以下命令：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    脚本将执行以下操作：
    - 如果需要，下载 `otelcol-contrib` 二进制文件。
    - 启动一个 OTEL collector，用于接收来自 Qwen Code 的数据并导出到你指定的 Google Cloud 项目。
    - 自动在你的 workspace settings（`.qwen/settings.json`）中启用 telemetry 并关闭 sandbox 模式。
    - 提供直接链接，用于在 Google Cloud Console 中查看 traces、metrics 和 logs。
    - 当你退出（Ctrl+C）时，脚本会尝试恢复你原来的 telemetry 和 sandbox 设置。

1.  **运行 Qwen Code**：
    在另一个终端中运行你的 Qwen Code 命令。这将生成 telemetry 数据，由 collector 捕获。

1.  **在 Google Cloud 中查看 telemetry 数据**：
    使用脚本提供的链接跳转到 Google Cloud Console，查看你的 traces、metrics 和 logs。

1.  **查看本地 collector 日志**：
    脚本将本地 OTEL collector 的输出重定向到 `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`。脚本同时提供查看和实时跟踪 collector 日志的链接和命令。

1.  **停止服务**：
    在脚本运行的终端中按 `Ctrl+C`，即可停止 OTEL Collector。

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
    - `prompt_length`
    - `prompt`（如果 `log_prompts_enabled` 配置为 `false`，则不包含此属性）
    - `auth_type`

- `qwen-code.tool_call`：该事件在每次函数调用时发生。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", 或 "modify"，如适用)
    - `error`（如适用）
    - `error_type`（如适用）
    - `metadata`（如适用，string -> any 的字典）

- `qwen-code.api_request`：该事件在向 Gemini API 发起请求时发生。
  - **属性**：
    - `model`
    - `request_text`（如适用）

- `qwen-code.api_error`：该事件在 API 请求失败时发生。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：该事件在接收到 Gemini API 响应时发生。
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

- `qwen-code.flash_fallback`：该事件在 Qwen Code 切换为使用 flash 作为 fallback 时发生。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：该事件在用户执行斜杠命令时发生。
  - **属性**：
    - `command` (string)
    - `subcommand` (string，如适用)

### Metrics

Metrics 是对行为随时间变化的数值测量。Qwen Code 收集以下指标（指标名称仍保留为 `qwen-code.*` 以保持兼容性）：

- `qwen-code.session.count` (Counter, Int)：每次 CLI 启动时递增一次。

- `qwen-code.tool.call.count` (Counter, Int)：统计工具调用次数。
  - **Attributes**：
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", 或 "modify"，如适用)

- `qwen-code.tool.call.latency` (Histogram, ms)：测量工具调用延迟。
  - **Attributes**：
    - `function_name`
    - `decision` (string: "accept", "reject", 或 "modify"，如适用)

- `qwen-code.api.request.count` (Counter, Int)：统计所有 API 请求次数。
  - **Attributes**：
    - `model`
    - `status_code`
    - `error_type` (如适用)

- `qwen-code.api.request.latency` (Histogram, ms)：测量 API 请求延迟。
  - **Attributes**：
    - `model`

- `qwen-code.token.usage` (Counter, Int)：统计使用的 token 数量。
  - **Attributes**：
    - `model`
    - `type` (string: "input", "output", "thought", "cache", 或 "tool")

- `qwen-code.file.operation.count` (Counter, Int)：统计文件操作次数。
  - **Attributes**：
    - `operation` (string: "create", "read", "update")：文件操作类型。
    - `lines` (Int, 如适用)：文件中的行数。
    - `mimetype` (string, 如适用)：文件的 MIME 类型。
    - `extension` (string, 如适用)：文件扩展名。
    - `ai_added_lines` (Int, 如适用)：AI 添加/修改的行数。
    - `ai_removed_lines` (Int, 如适用)：AI 删除/修改的行数。
    - `user_added_lines` (Int, 如适用)：用户在 AI 提议的更改中添加/修改的行数。
    - `user_removed_lines` (Int, 如适用)：用户在 AI 提议的更改中删除/修改的行数。