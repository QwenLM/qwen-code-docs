# Qwen Code 配置

Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按照以下优先级顺序应用（数字越小优先级越低，会被数字越高的覆盖）：

1.  **默认值：** 应用程序内部的硬编码默认值。
2.  **用户设置文件：** 当前用户的全局设置。
3.  **项目设置文件：** 项目特定的设置。
4.  **系统设置文件：** 系统范围的设置。
5.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
6.  **命令行参数：** 启动 CLI 时传入的值。

## 配置文件

Qwen Code 使用 `settings.json` 文件进行持久化配置。这些文件有三个位置：

- **用户配置文件：**
  - **位置：** `~/.qwen/settings.json`（其中 `~` 是你的 home 目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。
- **项目配置文件：**
  - **位置：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 仅在从该特定项目运行 Qwen Code 时应用。项目设置会覆盖用户设置。
- **系统配置文件：**
  - **位置：** `/etc/gemini-cli/settings.json`（Linux）、`C:\ProgramData\gemini-cli\settings.json`（Windows）或 `/Library/Application Support/GeminiCli/settings.json`（macOS）。可以通过 `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 环境变量覆盖路径。
  - **作用范围：** 应用于系统上所有用户的 Qwen Code 会话。系统设置会覆盖用户和项目设置。企业中的系统管理员可以使用此功能来控制用户的 Qwen Code 设置。

**关于配置中的环境变量说明：** 你的 `settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。这些变量在加载配置时会自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件之外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙箱配置文件](#sandboxing)（例如，`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的配置项：

- **`contextFileName`**（字符串或字符串数组）：
  - **说明：** 指定上下文文件的文件名（例如 `QWEN.md`、`AGENTS.md`）。可以是一个文件名，也可以是多个可接受的文件名组成的数组。
  - **默认值：** `QWEN.md`
  - **示例：** `"contextFileName": "AGENTS.md"`

- **`bugCommand`**（对象）：
  - **说明：** 覆盖 `/bug` 命令的默认 URL。
  - **默认值：** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **属性：**
    - **`urlTemplate`**（字符串）：一个可以包含 `{title}` 和 `{info}` 占位符的 URL。
  - **示例：**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`**（对象）：
  - **说明：** 控制 @ 命令和文件发现工具的 git-aware 文件过滤行为。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`**（布尔值）：在发现文件时是否遵循 `.gitignore` 规则。设置为 `true` 时，git 忽略的文件（如 `node_modules/`、`dist/`、`.env`）将自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`**（布尔值）：是否在提示中补全 @ 前缀时，启用递归搜索当前目录树下的文件名。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`**（字符串数组）：
  - **说明：** 允许你指定一组核心工具名称，这些工具将对模型可用。可用于限制内置工具的使用范围。有关核心工具列表，请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。你也可以为支持的工具（如 `ShellTool`）指定命令级别的限制。例如，`"coreTools": ["ShellTool(ls -l)"]` 将只允许执行 `ls -l` 命令。
  - **默认值：** 所有工具都对模型可用。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`

- **`excludeTools`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的核心工具名称。如果某个工具同时出现在 `excludeTools` 和 `coreTools` 中，则会被排除。你也可以为支持的工具（如 `ShellTool`）指定命令级别的限制。例如，`"excludeTools": ["ShellTool(rm -rf)"]` 将阻止执行 `rm -rf` 命令。
  - **默认值：** 不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`
  - **安全提示：** 对于 `run_shell_command` 工具，`excludeTools` 中的命令限制基于简单的字符串匹配，容易被绕过。此功能**不是安全机制**，不应依赖它来安全执行不受信任的代码。建议使用 `coreTools` 明确指定允许执行的命令。

- **`allowMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组 MCP server 名称，这些 server 将对模型可用。可用于限制连接的 MCP server 范围。注意：如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。
  - **默认值：** 所有 MCP server 都对模型可用。
  - **示例：** `"allowMCPServers": ["myPythonServer"]`
  - **安全提示：** 此配置使用简单的字符串匹配来识别 MCP server 名称，容易被修改。如果你是系统管理员并希望防止用户绕过此限制，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置 MCP server。此配置不应被视为严格的安全机制。

- **`excludeMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的 MCP server 名称。如果某个 server 同时出现在 `excludeMCPServers` 和 `allowMCPServers` 中，则会被排除。注意：如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。
  - **默认值：** 不排除任何 MCP server。
  - **示例：** `"excludeMCPServers": ["myNodeServer"]`
  - **安全提示：** 此配置使用简单的字符串匹配来识别 MCP server 名称，容易被修改。如果你是系统管理员并希望防止用户绕过此限制，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置 MCP server。此配置不应被视为严格的安全机制。

- **`autoAccept`**（布尔值）：
  - **说明：** 控制 CLI 是否自动接受并执行被认为是安全的工具调用（例如只读操作），而无需用户显式确认。如果设为 `true`，CLI 将跳过对安全工具的确认提示。
  - **默认值：** `false`
  - **示例：** `"autoAccept": true`

- **`theme`**（字符串）：
  - **说明：** 设置 Qwen Code 的视觉 [主题](./themes.md)。
  - **默认值：** `"Default"`
  - **示例：** `"theme": "GitHub"`

- **`vimMode`**（布尔值）：
  - **说明：** 启用或禁用输入编辑的 vim 模式。启用后，输入区域支持 vim 风格的导航和编辑命令（NORMAL 和 INSERT 模式）。vim 模式状态会在页脚显示，并在会话之间保持。
  - **默认值：** `false`
  - **示例：** `"vimMode": true`

- **`sandbox`**（布尔值或字符串）：
  - **说明：** 控制是否以及如何使用沙箱执行工具。如果设为 `true`，Qwen Code 将使用预构建的 `qwen-code-sandbox` Docker 镜像。更多信息请参见 [Sandboxing](#sandboxing)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`**（字符串）：
  - **说明：** 定义一个自定义 shell 命令，用于从项目中发现工具。该 shell 命令必须在 `stdout` 返回一个 [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 的 JSON 数组。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`**（字符串）：
  - **说明：** 定义一个自定义 shell 命令，用于调用通过 `toolDiscoveryCommand` 发现的特定工具。该 shell 命令必须满足以下条件：
    - 必须将函数 `name`（与 [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）作为第一个命令行参数。
    - 必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 必须在 `stdout` 返回 JSON 格式的函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`**（对象）：
  - **说明：** 配置一个或多个 Model-Context Protocol (MCP) server 的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接每个配置的 MCP server 以发现可用工具。如果多个 MCP server 提供同名工具，工具名称将加上你在配置中定义的 server 别名前缀（例如 `serverAlias__actualToolName`）以避免冲突。注意：系统可能会为了兼容性而从 MCP 工具定义中剥离某些 schema 属性。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`**（对象）：指定 server 的参数。
      - `command`（字符串，必填）：启动 MCP server 的命令。
      - `args`（字符串数组，可选）：传递给命令的参数。
      - `env`（对象，可选）：为 server 进程设置的环境变量。
      - `cwd`（字符串，可选）：启动 server 的工作目录。
      - `timeout`（数字，可选）：对此 MCP server 的请求超时时间（毫秒）。
      - `trust`（布尔值，可选）：信任此 server 并跳过所有工具调用确认。
      - `includeTools`（字符串数组，可选）：从此 MCP server 包含的工具名称列表。指定后，仅列出的工具可用（白名单行为）。未指定时，默认启用 server 的所有工具。
      - `excludeTools`（字符串数组，可选）：从此 MCP server 排除的工具名称列表。即使 server 提供这些工具，模型也无法使用。**注意：** `excludeTools` 优先级高于 `includeTools` —— 如果一个工具同时出现在两个列表中，它将被排除。
  - **示例：**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`**（对象）：
  - **说明：** 配置 checkpointing 功能，允许你保存和恢复对话及文件状态。更多详情请参见 [Checkpointing 文档](../checkpointing.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`**（布尔值）：当设为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`**（字符串）：
  - **说明：** 指定查看 diff 时使用的首选编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`**（对象）：
  - **说明：** 配置 Qwen Code 的日志和指标收集。更多信息请参见 [Telemetry](../telemetry.md)。
  - **默认值：** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **属性：**
    - **`enabled`**（布尔值）：是否启用遥测。
    - **`target`**（字符串）：遥测数据的目标。支持的值为 `local` 和 `gcp`。
    - **`otlpEndpoint`**（字符串）：OTLP Exporter 的端点。
    - **`logPrompts`**（布尔值）：是否在日志中包含用户提示内容。
  - **示例：**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`**（布尔值）：
  - **说明：** 启用或禁用使用统计信息的收集。更多信息请参见 [Usage Statistics](#usage-statistics)。
  - **默认值：** `true`
  - **示例：**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`**（布尔值）：
  - **说明：** 启用或禁用 CLI 界面中的帮助提示。
  - **默认值：** `false`
  - **示例：**
    ```json
    "hideTips": true
    ```

- **`hideBanner`**（布尔值）：
  - **说明：** 启用或禁用 CLI 界面中的启动横幅（ASCII 艺术 logo）。
  - **默认值：** `false`
  - **示例：**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`**（数字）：
  - **说明：** 设置会话的最大轮数。如果超过此限制，CLI 将停止处理并开始新的聊天。
  - **默认值：** `-1`（无限制）
  - **示例：**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`**（对象）：
  - **说明：** 启用或禁用工具输出的摘要功能。你可以使用 `tokenBudget` 设置摘要的 token 预算。
  - 注意：目前仅支持 `run_shell_command` 工具。
  - **默认值：** `{}`（默认禁用）
  - **示例：**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`**（字符串数组）：
  - **说明：** 指定应从项目 `.env` 文件中排除的环境变量。这可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。`.qwen/.env` 文件中的变量永远不会被排除。
  - **默认值：** `["DEBUG", "DEBUG_MODE"]`
  - **示例：**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`**（字符串数组）：
  - **说明：** 指定一组额外的绝对或相对路径，将其包含在工作区上下文中。这允许你像操作单个目录一样操作多个目录中的文件。路径可以使用 `~` 表示用户主目录。此设置可与 `--include-directories` 命令行参数结合使用。
  - **默认值：** `[]`
  - **示例：**
    ```json
    "includeDirectories": [
      "/path/to/another/project",
      "../shared-library",
      "~/common-utils"
    ]
    ```

- **`loadMemoryFromIncludeDirectories`**（布尔值）：
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设为 `true`，应从所有添加的目录加载 `QWEN.md` 文件。如果设为 `false`，则只从当前目录加载 `QWEN.md`。
  - **默认值：** `false`
  - **示例：**
    ```json
    "loadMemoryFromIncludeDirectories": true
    ```

- **`tavilyApiKey`**（字符串）：
  - **说明：** Tavily 网络搜索服务的 API key。启用 `web_search` 工具功能时必需。如果未配置，网络搜索工具将被禁用并跳过。
  - **默认值：** `undefined`（网络搜索禁用）
  - **示例：** `"tavilyApiKey": "tvly-your-api-key-here"`

- **`chatCompression`**（对象）：
  - **说明：** 控制聊天历史压缩的设置，包括自动压缩和通过 `/compress` 命令手动触发的压缩。
  - **属性：**
    - **`contextPercentageThreshold`**（数字）：介于 0 和 1 之间的值，指定触发压缩的 token 阈值占模型总 token 限制的百分比。例如，值为 `0.6` 时，当聊天历史超过 token 限制的 60% 时将触发压缩。
  - **示例：**
    ```json
    "chatCompression": {
      "contextPercentageThreshold": 0.6
    }
    ```

- **`showLineNumbers`**（布尔值）：
  - **说明：** 控制 CLI 输出中的代码块是否显示行号。
  - **默认值：** `true`
  - **示例：**
    ```json
    "showLineNumbers": false
    ```

### 示例 `settings.json`：

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "tavilyApiKey": "$TAVILY_API_KEY",
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true
}
```

## Shell History

CLI 会保存你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，这些历史记录会存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常见方式，尤其适用于敏感信息（如 API key）或在不同环境中可能变化的设置。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则向上级目录搜索，直到找到 `.env` 文件，或到达项目根目录（通过 `.git` 文件夹识别）或用户主目录。
3. 如果仍未找到，则查找 `~/.env`（用户主目录下的 `.env` 文件）。

**环境变量排除：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）默认会自动从项目 `.env` 文件中排除，以防止干扰 CLI 的行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以通过在 `settings.json` 文件中配置 `excludedProjectEnvVars` 来自定义此行为。

- **`GEMINI_API_KEY`**（必填）：
  - 你的 Gemini API key。
  - **至关重要**，CLI 无法在没有它的情况下运行。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`GEMINI_MODEL`**：
  - 指定默认使用的 Gemini 模型。
  - 会覆盖硬编码的默认值。
  - 示例：`export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`**：
  - 你的 Google Cloud API key。
  - 在 express 模式下使用 Vertex AI 时必需。
  - 确保你拥有必要的权限。
  - 示例：`export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`
- **`GOOGLE_CLOUD_PROJECT`**：
  - 你的 Google Cloud Project ID。
  - 使用 Code Assist 或 Vertex AI 时必需。
  - 如果使用 Vertex AI，请确保你在此项目中具有必要的权限。
  - **Cloud Shell 注意事项：** 在 Cloud Shell 环境中运行时，该变量默认为 Cloud Shell 用户分配的特殊项目。如果你在 Cloud Shell 的全局环境中设置了 `GOOGLE_CLOUD_PROJECT`，它将被此默认值覆盖。要在 Cloud Shell 中使用其他项目，你必须在 `.env` 文件中定义 `GOOGLE_CLOUD_PROJECT`。
  - 示例：`export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`
- **`GOOGLE_APPLICATION_CREDENTIALS`**（字符串）：
  - **说明：** 你的 Google Application Credentials JSON 文件路径。
  - **示例：** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`**：
  - 用于 Google Cloud 中遥测数据的 Google Cloud Project ID。
  - 示例：`export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`
- **`GOOGLE_CLOUD_LOCATION`**：
  - 你的 Google Cloud 项目位置（例如：us-central1）。
  - 在非 express 模式下使用 Vertex AI 时必需。
  - 示例：`export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`
- **`GEMINI_SANDBOX`**：
  - 替代 `settings.json` 中的 `sandbox` 设置。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。
- **`SEATBELT_PROFILE`**（仅 macOS）：
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）配置文件。
  - `permissive-open`：（默认）限制写入项目文件夹（以及其他少数文件夹，详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其他操作。
  - `strict`：使用严格配置文件，默认拒绝所有操作。
  - `<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目 `.qwen/` 目录中创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）：
  - 设置为 `true` 或 `1` 可启用详细调试日志，有助于排查问题。
  - **注意：** 这些变量默认会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果需要为 Qwen Code 特别设置这些变量，请使用 `.qwen/.env` 文件。
- **`NO_COLOR`**：
  - 设置任意值可禁用 CLI 中的所有颜色输出。
- **`CLI_TITLE`**：
  - 设置一个字符串来自定义 CLI 的标题。
- **`CODE_ASSIST_ENDPOINT`**：
  - 指定代码辅助服务器的 endpoint。
  - 对开发和测试很有用。
- **`TAVILY_API_KEY`**：
  - 你的 Tavily 网络搜索服务 API key。
  - 启用 `web_search` 工具功能时必需。
  - 如果未配置，网络搜索工具将被禁用并跳过。
  - 示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`

## 命令行参数

在运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - 指定本次会话使用的 Gemini 模型。
  - 示例：`npm start -- --model gemini-1.5-pro-latest`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - 用于直接将 prompt 传递给命令。这会以非交互模式调用 Qwen Code。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 使用提供的 prompt 作为初始输入启动一个交互式会话。
  - prompt 会在交互式会话中处理，而不是在会话开始前处理。
  - 当从 stdin 管道输入时不能使用此参数。
  - 示例：`qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - 为本次会话启用 sandbox 模式。
- **`--sandbox-image`**:
  - 设置 sandbox 镜像 URI。
- **`--debug`** (**`-d`**):
  - 启用本次会话的 debug 模式，提供更详细的输出信息。
- **`--all-files`** (**`-a`**):
  - 如果设置，则递归地将当前目录中的所有文件作为 prompt 的上下文包含进来。
- **`--help`** (或 **`-h`**):
  - 显示命令行参数的帮助信息。
- **`--show-memory-usage`**:
  - 显示当前内存使用情况。
- **`--yolo`**:
  - 启用 YOLO 模式，自动批准所有工具调用。
- **`--telemetry`**:
  - 启用 [telemetry](../telemetry.md)。
- **`--telemetry-target`**:
  - 设置 telemetry 目标。更多信息请参见 [telemetry](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**:
  - 设置 telemetry 的 OTLP endpoint。更多信息请参见 [telemetry](../telemetry.md)。
- **`--telemetry-log-prompts`**:
  - 启用 telemetry 的 prompt 日志记录。更多信息请参见 [telemetry](../telemetry.md)。
- **`--checkpointing`**:
  - 启用 [checkpointing](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - 指定本次会话要使用的扩展列表。如果未提供，则使用所有可用扩展。
  - 使用特殊参数 `qwen -e none` 可禁用所有扩展。
  - 示例：`qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 列出所有可用扩展并退出。
- **`--proxy`**:
  - 设置 CLI 的代理。
  - 示例：`--proxy http://localhost:7890`。
- **`--include-directories <dir1,dir2,...>`**:
  - 在工作区中包含额外的目录以支持多目录操作。
  - 可以多次指定或使用逗号分隔的值。
  - 最多可添加 5 个目录。
  - 示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`**:
  - 显示 CLI 的版本。
- **`--openai-logging`**:
  - 启用 OpenAI API 调用的日志记录，用于调试和分析。此标志会覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。
- **`--tavily-api-key <api_key>`**:
  - 为本次会话设置 Tavily API key 以启用网页搜索功能。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (分层指令上下文)

虽然严格来说不是 CLI _行为_ 的配置，但 context files（默认为 `QWEN.md`，可通过 `contextFileName` 设置进行配置）对于配置 _指令上下文_（也称为 "memory"）至关重要。这个强大的功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更符合你的需求。CLI 包含 UI 元素，例如页脚中显示已加载 context files 数量的指示器，以让你了解当前的上下文状态。

- **用途：** 这些 Markdown 文件包含你希望 Gemini 模型在交互过程中了解的指令、指南或上下文信息。该系统被设计为分层管理这种指令上下文。

### 示例上下文文件内容（例如，`QWEN.md`）

以下是一个位于 TypeScript 项目根目录的上下文文件可能包含的内容的概念示例：

```markdown

# 项目：My Awesome TypeScript Library

## 通用说明：

- 在生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新增的函数和类都包含 JSDoc 注释。
- 在适当的情况下，优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## 编码风格：

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如，`IUserService`）。
- 私有类成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`

- 此文件处理所有出站 API 请求。
- 在添加新的 API 调用函数时，请确保它们包含健壮的错误处理和日志记录。
- 对于所有 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：

- 除非绝对必要，否则应避免引入新的外部依赖项。
- 如果确实需要新增依赖项，请说明具体原因。

```

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的说明。你的上下文文件越相关且精确，AI 就能更好地为你提供帮助。我们强烈建议你为项目创建特定的上下文文件，以便建立统一的规范和上下文环境。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现了一套复杂的分层内存系统。列表中靠后的位置（更具体）的内容通常会覆盖或补充靠前位置（更通用）的内容。你可以使用 `/memory show` 命令查看具体的拼接顺序和最终使用的上下文内容。典型的加载顺序如下：
  1.  **全局上下文文件：**
      - 路径：`~/.qwen/<contextFileName>`（例如在你的用户主目录下的 `~/.qwen/QWEN.md`）。
      - 作用范围：为所有项目提供默认指令。
  2.  **项目根目录及祖先目录中的上下文文件：**
      - 路径：CLI 会在当前工作目录及其上级目录中查找配置的上下文文件，一直向上查找到项目根目录（以 `.git` 文件夹标识）或你的主目录为止。
      - 作用范围：提供整个项目或其重要部分相关的上下文信息。
  3.  **子目录中的上下文文件（局部/上下文相关）：**
      - 路径：CLI 还会扫描当前工作目录 _之下_ 的子目录中是否存在配置的上下文文件（遵循如 `node_modules`、`.git` 等常见的忽略规则）。默认情况下最多扫描 200 个目录，但可以通过在 `settings.json` 文件中设置 `memoryDiscoveryMaxDirs` 字段来调整这一限制。
      - 作用范围：允许为项目的某个特定组件、模块或子部分提供高度定制化的指令。
- **内容拼接与 UI 提示：** 所有找到的上下文文件内容会被依次拼接（并用分隔符标明来源路径），然后作为 system prompt 的一部分提供给 AI。CLI 的底部会显示已加载的上下文文件数量，让你可以快速了解当前激活的指令上下文。
- **导入内容：** 你可以通过在 Markdown 文件中使用 `@path/to/file.md` 语法来模块化管理上下文文件。更多详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载上下文文件。这将更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前已加载的完整指令上下文，方便你确认 AI 正在使用的层级结构和具体内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的详细信息，请参阅 [Commands 文档](./commands.md#memory)。

通过理解并利用这些配置层级以及上下文文件的分层特性，你可以有效地管理 AI 的记忆，并根据你的具体需求和项目定制 Qwen Code 的响应行为。

## 沙箱机制

Qwen Code 可以在一个沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是关闭的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMI_SANDBOX` 环境变量。
- 在 `--yolo` 模式下，沙箱默认是启用的。

默认情况下，它会使用一个预构建的 `qwen-code-sandbox` Docker 镜像。

如果你的项目有特定的沙箱需求，可以在项目根目录下创建一个 `.qwen/sandbox.Dockerfile` 文件来自定义 Docker 配置。这个 Dockerfile 可以基于基础沙箱镜像：

```dockerfile
FROM qwen-code-sandbox

# 在这里添加你自定义的依赖或配置

# 例如：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，你可以在运行 Qwen Code 时使用 `BUILD_SANDBOX` 环境变量来自动构建自定义 sandbox 镜像：

```bash
BUILD_SANDBOX=1 qwen -s
```

## 使用统计

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据帮助我们了解 CLI 的使用情况，识别常见问题，并优先开发新功能。

**我们收集的数据包括：**

- **工具调用：** 我们会记录被调用的工具名称、执行成功或失败的状态以及执行耗时。我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们会记录每次请求所使用的模型、请求耗时以及请求是否成功。我们不会收集 prompt 或 response 的具体内容。
- **会话信息：** 我们会收集 CLI 的配置信息，例如启用的工具和审批模式。

**我们不会收集的数据包括：**

- **个人身份信息 (PII)：** 我们不会收集任何个人信息，例如您的姓名、邮箱地址或 API key。
- **Prompt 和 Response 内容：** 我们不会记录您提交的 prompt 或模型返回的 response 内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件内容。

**如何退出数据收集：**

您可以随时通过在 `settings.json` 文件中将 `usageStatisticsEnabled` 属性设置为 `false` 来退出使用统计收集：

```json
{
  "usageStatisticsEnabled": false
}
```

注意：当启用使用统计时，事件数据会被发送到阿里云 RUM 数据收集端点。