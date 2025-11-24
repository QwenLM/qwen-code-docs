# Qwen Code 配置

Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（数字越小优先级越低，会被数字越高的覆盖）：

1.  **默认值：** 应用程序内硬编码的默认值。
2.  **系统默认文件：** 系统范围的默认设置，可以被其他设置文件覆盖。
3.  **用户设置文件：** 当前用户的全局设置。
4.  **项目设置文件：** 特定于项目的设置。
5.  **系统设置文件：** 系统范围的设置，会覆盖所有其他设置文件。
6.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
7.  **命令行参数：** 启动 CLI 时传入的值。

## 配置文件

Qwen Code 使用 JSON 配置文件来保存持久化设置。这些文件可以存在于以下四个位置：

- **系统默认配置文件：**
  - **路径：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）或 `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。可通过环境变量 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 覆盖该路径。
  - **作用范围：** 提供系统级的默认配置基础层。这些配置优先级最低，预期会被用户、项目或系统覆盖配置所替代。

- **用户配置文件：**
  - **路径：** `~/.qwen/settings.json`（其中 `~` 表示你的用户主目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。

- **项目配置文件：**
  - **路径：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 仅在从该项目目录运行 Qwen Code 时生效。项目配置会覆盖用户配置。

- **系统配置文件：**
  - **路径：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）或 `/Library/Application Support/QwenCode/settings.json`（macOS）。可通过环境变量 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 覆盖该路径。
  - **作用范围：** 应用于系统中所有用户的 Qwen Code 会话。系统配置会覆盖用户和项目配置。企业中的系统管理员可利用此机制对用户的 Qwen Code 设置进行统一控制。

**关于配置中的环境变量说明：** 在你的 `settings.json` 文件中，字符串值可以通过 `$VAR_NAME` 或 `${VAR_NAME}` 的语法引用环境变量。这些变量会在配置加载时自动解析。例如，如果你有一个名为 `MY_API_TOKEN` 的环境变量，则可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件之外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙箱配置文件](#sandboxing)（例如：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的配置项：

- **`contextFileName`**（字符串或字符串数组）：
  - **说明：** 指定上下文文件的文件名（例如 `QWEN.md`、`AGENTS.md`）。可以是单个文件名，也可以是多个可接受的文件名组成的数组。
  - **默认值：** `QWEN.md`
  - **示例：** `"contextFileName": "AGENTS.md"`

- **`bugCommand`**（对象）：
  - **说明：** 覆盖 `/bug` 命令使用的默认 URL。
  - **默认值：** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **属性：**
    - **`urlTemplate`**（字符串）：一个包含 `{title}` 和 `{info}` 占位符的 URL。
  - **示例：**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`**（对象）：
  - **说明：** 控制与 Git 相关的文件过滤行为，适用于 @ 命令和文件发现工具。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`**（布尔值）：在查找文件时是否遵循 `.gitignore` 的规则。设为 `true` 时，被 git 忽略的文件（如 `node_modules/`、`dist/`、`.env`）将自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`**（布尔值）：在提示中补全 @ 前缀时，是否启用递归搜索当前目录树下的文件名。
    - **`disableFuzzySearch`**（布尔值）：当设为 `true` 时，在搜索文件时禁用模糊匹配功能，这可以在大型项目中提升性能。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### 文件搜索性能问题排查

如果你在文件搜索（例如使用 `@` 补全）时遇到性能问题，尤其是在包含大量文件的项目中，可以尝试以下几种方法（按推荐顺序排列）：

1. **使用 `.qwenignore`：** 在项目根目录下创建一个 `.qwenignore` 文件，用于排除那些包含大量你不需要引用的文件的目录（例如构建产物、日志、`node_modules`）。减少需要遍历的文件总数是提升性能最有效的方式。

2. **禁用模糊搜索：** 如果忽略文件还不够，你可以通过在 `settings.json` 文件中将 `disableFuzzySearch` 设置为 `true` 来禁用模糊搜索。这会使用一种更简单的非模糊匹配算法，可能会更快。

3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这是最快的选择，因为它避免了对项目的递归扫描。但这也意味着你在使用 `@` 补全时需要输入完整的文件路径。

- **`coreTools`**（字符串数组）：
  - **说明：** 允许你指定一组核心工具名称，这些工具将提供给模型使用。可用于限制内置工具集。有关核心工具列表，请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。你还可以为支持该功能的工具（如 `ShellTool`）指定命令级别的限制。例如，`"coreTools": ["ShellTool(ls -l)"]` 将只允许执行 `ls -l` 命令。
  - **默认值：** 模型可使用的所有工具。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`。

- **`allowedTools`**（字符串数组）：
  - **默认值：** `undefined`
  - **说明：** 工具名称列表，这些工具调用将跳过确认对话框。适用于你信任且经常使用的工具。匹配语义与 `coreTools` 相同。
  - **示例：** `"allowedTools": ["ShellTool(git status)"]`。

- **`excludeTools`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的核心工具名称。如果某个工具同时出现在 `excludeTools` 和 `coreTools` 中，则会被排除。你也可以为支持该功能的工具（如 `ShellTool`）指定命令级别的限制。例如，`"excludeTools": ["ShellTool(rm -rf)"]` 将阻止执行 `rm -rf` 命令。
  - **默认值：** 不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`。
  - **安全提示：** 对于 `run_shell_command` 的命令级限制基于简单的字符串匹配，容易被绕过。此功能 **不是安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 明确选择允许执行的命令。

- **`allowMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组 MCP 服务器名称，这些服务器将提供给模型使用。可用于限制连接的 MCP 服务器集合。注意，如果设置了 `--allowed-mcp-server-names`，此项将被忽略。
  - **默认值：** 所有 MCP 服务器均可供模型使用。
  - **示例：** `"allowMCPServers": ["myPythonServer"]`。
  - **安全提示：** 此项使用简单的字符串匹配来识别 MCP 服务器名称，而服务器名称是可以修改的。如果你是系统管理员并希望防止用户绕过此设置，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置任何 MCP 服务器。此功能不应被视为绝对的安全机制。

- **`excludeMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的 MCP 服务器名称。如果某个服务器同时出现在 `excludeMCPServers` 和 `allowMCPServers` 中，则会被排除。注意，如果设置了 `--allowed-mcp-server-names`，此项将被忽略。
  - **默认值：** 不排除任何 MCP 服务器。
  - **示例：** `"excludeMCPServers": ["myNodeServer"]`。
  - **安全提示：** 此项使用简单的字符串匹配来识别 MCP 服务器名称，而服务器名称是可以修改的。如果你是系统管理员并希望防止用户绕过此设置，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置任何 MCP 服务器。此功能不应被视为绝对的安全机制。

- **`autoAccept`**（布尔值）：
  - **说明：** 控制 CLI 是否自动接受并执行被认为是安全的工具调用（例如只读操作），无需显式用户确认。如果设为 `true`，CLI 将跳过对被认为安全的工具的确认提示。
  - **默认值：** `false`
  - **示例：** `"autoAccept": true`

- **`theme`**（字符串）：
  - **说明：** 设置 Qwen Code 的视觉 [主题](./themes.md)。
  - **默认值：** `"Default"`
  - **示例：** `"theme": "GitHub"`

- **`vimMode`**（布尔值）：
  - **说明：** 启用或禁用输入编辑的 vim 模式。启用后，输入区域支持 vim 风格的导航和编辑命令，包括 NORMAL 和 INSERT 模式。vim 模式状态会在页脚显示，并在会话间保持。
  - **默认值：** `false`
  - **示例：** `"vimMode": true`

- **`sandbox`**（布尔值或字符串）：
  - **说明：** 控制是否以及如何使用沙箱来执行工具。如果设为 `true`，Qwen Code 将使用预构建的 `qwen-code-sandbox` Docker 镜像。更多信息请参见 [Sandboxing](#sandboxing)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于从你的项目中发现工具。shell 命令必须在 `stdout` 上返回一个 [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 的 JSON 数组。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于调用通过 `toolDiscoveryCommand` 发现的特定工具。shell 命令必须满足以下条件：
    - 必须以函数 `name`（与 [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）作为第一个命令行参数。
    - 必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 必须在 `stdout` 返回 JSON 格式的函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`**（对象）：
  - **说明：** 配置一个或多个 Model-Context Protocol (MCP) 服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接每个已配置的 MCP 服务器以发现可用工具。如果有多个 MCP 服务器暴露了同名工具，工具名称将加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`）以避免冲突。注意，系统可能会为了兼容性而剥离某些 MCP 工具定义中的 schema 属性。至少需要提供 `command`、`url` 或 `httpUrl` 中的一项。如果指定了多项，优先级依次为 `httpUrl` > `url` > `command`。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`**（对象）：命名服务器的服务器参数。
      - `command`（字符串，可选）：通过标准 I/O 启动 MCP 服务器的命令。
      - `args`（字符串数组，可选）：传递给命令的参数。
      - `env`（对象，可选）：为服务器进程设置的环境变量。
      - `cwd`（字符串，可选）：启动服务器的工作目录。
      - `url`（字符串，可选）：使用 Server-Sent Events (SSE) 进行通信的 MCP 服务器 URL。
      - `httpUrl`（字符串，可选）：使用流式 HTTP 进行通信的 MCP 服务器 URL。
      - `headers`（对象，可选）：发送到 `url` 或 `httpUrl` 请求的 HTTP 头映射。
      - `timeout`（数字，可选）：对此 MCP 服务器请求的超时时间（毫秒）。
      - `trust`（布尔值，可选）：信任此服务器并跳过所有工具调用确认。
      - `description`（字符串，可选）：服务器的简要描述，可能用于显示目的。
      - `includeTools`（字符串数组，可选）：从此 MCP 服务器包含的工具名称列表。指定后，只有此处列出的工具才可用（白名单行为）。未指定时，默认启用服务器上的所有工具。
      - `excludeTools`（字符串数组，可选）：从此 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，它们也不会提供给模型使用。**注意：** `excludeTools` 优先于 `includeTools` —— 如果一个工具同时出现在两个列表中，它将被排除。
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
      },
      "mySseServer": {
        "url": "http://localhost:8081/events",
        "headers": {
          "Authorization": "Bearer $MY_SSE_TOKEN"
        },
        "description": "An example SSE-based MCP server."
      },
      "myStreamableHttpServer": {
        "httpUrl": "http://localhost:8082/stream",
        "headers": {
          "X-API-Key": "$MY_HTTP_API_KEY"
        },
        "description": "An example Streamable HTTP-based MCP server."
      }
    }
    ```

- **`checkpointing`**（对象）：
  - **说明：** 配置检查点功能，允许你保存和恢复对话及文件状态。更多详情请参见 [Checkpointing 文档](../checkpointing.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`**（布尔值）：当为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`**（字符串）：
  - **说明：** 指定查看 diff 时首选的编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`**（对象）
  - **说明：** 配置 Qwen Code 的日志记录和指标收集。更多信息请参见 [Telemetry](../telemetry.md)。
  - **默认值：** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **属性：**
    - **`enabled`**（布尔值）：是否启用遥测。
    - **`target`**（字符串）：收集遥测数据的目标。支持的值为 `local` 和 `gcp`。
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
  - **说明：** 启用或禁用 CLI 界面中的启动横幅（ASCII 艺术 Logo）。
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
  - **说明：** 启用或禁用工具输出的摘要功能。你可以使用 `tokenBudget` 设置来指定摘要的 token 预算。
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
  - **说明：** 指定应从项目 `.env` 文件中排除加载的环境变量。这可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。
  - **默认值：** `["DEBUG", "DEBUG_MODE"]`
  - **示例：**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`**（字符串数组）：
  - **说明：** 指定要包含在工作区上下文中的额外绝对或相对路径数组。缺失的目录默认会发出警告并跳过。路径可以使用 `~` 引用用户的主目录。此设置可以与 `--include-directories` 命令行标志结合使用。
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
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设为 `true`，应从所有添加的目录加载 `QWEN.md` 文件。如果设为 `false`，则只应从当前目录加载 `QWEN.md`。
  - **默认值：** `false`
  - **示例：**
    ```json
    "loadMemoryFromIncludeDirectories": true
    ```

- **`tavilyApiKey`**（字符串）：
  - **说明：** Tavily 网络搜索服务的 API 密钥。用于启用 `web_search` 工具功能。
  - **注意：** 这是一种旧版配置格式。对于 Qwen OAuth 用户，DashScope 提供商会自动可用，无需任何配置。对于其他认证类型，请使用新的 `webSearch` 配置格式配置 Tavily 或 Google 提供商。
  - **默认值：** `undefined`（网络搜索禁用）
  - **示例：** `"tavilyApiKey": "tvly-your-api-key-here"`
- **`chatCompression`**（对象）：
  - **说明：** 控制聊天历史压缩的设置，包括自动压缩和通过 `/compress` 命令手动触发的压缩。
  - **属性：**
    - **`contextPercentageThreshold`**（数字）：介于 0 到 1 之间的值，表示触发

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
  "skipNextSpeakerCheck": false,
  "skipLoopDetection": false,
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

## Shell 历史记录

CLI 会保存你运行的 shell 命令历史。为了避免不同项目之间的冲突，这些历史记录存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用的常见方式，尤其适用于敏感信息（如 API keys）或在不同环境中可能变化的设置。关于认证配置，请参阅 [认证文档](./authentication.md)，其中涵盖了所有可用的认证方法。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则向上级目录逐层查找，直到找到 `.env` 文件，或者到达项目根目录（通过 `.git` 文件夹识别）或用户主目录为止。
3. 若仍未找到，则尝试读取 `~/.env`（即用户主目录下的 `.env` 文件）。

**环境变量排除机制：** 某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）默认会被自动排除在项目的 `.env` 文件之外，以避免干扰 CLI 的行为。而来自 `.qwen/.env` 文件的变量则永远不会被排除。你可以通过修改 `settings.json` 中的 `excludedProjectEnvVars` 设置来自定义这一行为。

- **`OPENAI_API_KEY`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 可以设置在 shell 配置文件中（如 `~/.bashrc`、`~/.zshrc`），也可以写入 `.env` 文件。
- **`OPENAI_BASE_URL`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 同样可以设置在 shell 配置文件或 `.env` 文件中。
- **`OPENAI_MODEL`**：
  - 指定默认使用的 OPENAI 模型。
  - 覆盖硬编码的默认值。
  - 示例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**：
  - 是对 `settings.json` 中 `sandbox` 设置的一种替代方案。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串作为值。
- **`SEATBELT_PROFILE`**（仅限 macOS）：
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）策略。
  - `permissive-open`：（默认）限制向项目目录及其他少数路径写入操作（详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其他操作。
  - `strict`：使用严格模式，默认拒绝大部分操作。
  - `<profile_name>`：使用自定义策略。要定义一个自定义策略，在你的项目 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）：
  - 设为 `true` 或 `1` 来启用详细的调试日志输出，有助于排查问题。
  - **注意：** 这些变量默认会从项目 `.env` 文件中自动排除，以防影响 CLI 行为。如果你需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。
- **`NO_COLOR`**：
  - 设置任意值即可禁用 CLI 所有颜色输出。
- **`CLI_TITLE`**：
  - 设置该变量可用于自定义 CLI 标题显示内容。
- **`CODE_ASSIST_ENDPOINT`**：
  - 指定代码辅助服务的 endpoint。
  - 对开发和测试非常有用。
- **`TAVILY_API_KEY`**：
  - 你用于 Tavily 网络搜索服务的 API Key。
  - 用来启用 `web_search` 工具功能。
  - **注意：** 使用 Qwen OAuth 登录的用户无需额外配置即可直接访问 DashScope 提供商；对于其他类型的认证方式，需手动配置 Tavily 或 Google 提供商来启用网络搜索功能。
  - 示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`

## 命令行参数

在运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

- **`--model <model_name>`** (**`-m <model_name>`**)：
  - 指定本次会话使用的 Qwen 模型。
  - 示例：`npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**)：
  - 直接将 prompt 传递给命令。这将以非交互模式调用 Qwen Code。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**)：
  - 使用提供的 prompt 启动一个交互式会话作为初始输入。
  - prompt 将在交互式会话中处理，而不是在其之前处理。
  - 当从 stdin 管道输入时不能使用此选项。
  - 示例：`qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**)：
  - 为本次会话启用沙盒模式。
- **`--sandbox-image`**：
  - 设置沙盒镜像 URI。
- **`--debug`** (**`-d`**)：
  - 为本次会话启用调试模式，提供更详细的输出信息。
- **`--all-files`** (**`-a`**)：
  - 如果设置，则递归地将当前目录中的所有文件包含为 prompt 的上下文。
- **`--help`**（或 **`-h`**）：
  - 显示有关命令行参数的帮助信息。
- **`--show-memory-usage`**：
  - 显示当前内存使用情况。
- **`--yolo`**：
  - 启用 YOLO 模式，自动批准所有工具调用。
- **`--approval-mode <mode>`**：
  - 设置工具调用的审批模式。支持以下几种模式：
    - `plan`：仅分析——不修改文件或执行命令。
    - `default`：需要对文件编辑或 shell 命令进行审批（默认行为）。
    - `auto-edit`：自动批准编辑类工具（如 edit、write_file），其余仍需提示确认。
    - `yolo`：自动批准所有工具调用（等同于 `--yolo`）。
  - 不可与 `--yolo` 同时使用。请改用 `--approval-mode=yolo` 来实现新的统一方式。
  - 示例：`qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**：
  - 工具名称列表（以逗号分隔），这些工具将跳过确认对话框。
  - 示例：`qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**：
  - 启用 [遥测功能](../telemetry.md)。
- **`--telemetry-target`**：
  - 设置遥测目标。更多信息请参见 [遥测文档](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**：
  - 设置遥测所用的 OTLP endpoint。更多信息请参见 [遥测文档](../telemetry.md)。
- **`--telemetry-otlp-protocol`**：
  - 设置遥测所用的 OTLP 协议（`grpc` 或 `http`）。默认值是 `grpc`。更多信息请参见 [遥测文档](../telemetry.md)。
- **`--telemetry-log-prompts`**：
  - 启用 prompt 日志记录用于遥测。更多信息请参见 [遥测文档](../telemetry.md)。
- **`--checkpointing`**：
  - 启用 [检查点机制](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**)：
  - 指定本次会话要使用的扩展插件列表。如果未指定，默认使用所有可用扩展。
  - 可通过特殊关键字 `qwen -e none` 禁用所有扩展。
  - 示例：`qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**)：
  - 列出所有可用扩展并退出程序。
- **`--proxy`**：
  - 设置 CLI 所使用的代理服务器。
  - 示例：`--proxy http://localhost:7890`
- **`--include-directories <dir1,dir2,...>`**：
  - 在工作区中添加额外目录以支持多目录项目结构。
  - 支持多次指定或者使用逗号分隔多个路径。
  - 最多允许添加 5 个目录。
  - 示例：`--include-directories /path/to/project1,/path/to/project2` 或者 `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**：
  - 启用屏幕阅读器模式以提升无障碍访问体验。
- **`--version`**：
  - 显示 CLI 版本号。
- **`--openai-logging`**：
  - 启用 OpenAI API 调用日志记录以便调试和分析。此标志优先级高于 `settings.json` 中的 `enableOpenAILogging` 配置项。
- **`--openai-logging-dir <directory>`**：
  - 自定义 OpenAI API 日志存储路径。此标志优先级高于 `settings.json` 中的 `openAILoggingDir` 配置项。支持绝对路径、相对路径以及 `~` 展开形式。
  - **示例：** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`
- **`--tavily-api-key <api_key>`**：
  - 为此会话设置 Tavily API 密钥以启用网页搜索功能。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files（分层指令上下文）

虽然 Context Files 并不是 CLI 行为本身的严格配置项，但它们对于配置“指令上下文”（也称为 “memory”）至关重要。Context Files 默认使用 `QWEN.md` 文件，但你可以通过 `contextFileName` 设置来自定义文件名。这个强大的功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更贴合你的需求。CLI 中包含了相关的 UI 元素，例如底部会显示已加载的 context 文件数量的指示器，以便让你随时了解当前激活的上下文状态。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统采用分层方式管理这些指令上下文。

### 示例上下文文件内容（例如：`QWEN.md`）

以下是一个位于 TypeScript 项目根目录的上下文文件的概念示例：

```markdown

# Project: My Awesome TypeScript Library

## General Instructions:

- 当生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新增的函数和类都包含 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## Coding Style:

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如：`IUserService`）。
- 类的私有成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## Specific Component: `src/api/client.ts`

- 此文件处理所有对外的 API 请求。
- 添加新 API 调用函数时，确保包含完善的错误处理和日志记录。
- 对于所有的 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：

- 尽量避免引入新的外部依赖，除非绝对必要。
- 如果确实需要新增依赖，请说明原因。

```markdown

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的说明。你提供的上下文文件越相关且精确，AI 就能更好地协助你。我们强烈建议为项目创建特定的上下文文件，以建立一致的约定和共享背景。

- **分层加载与优先级：** CLI 实现了一套复杂的分层内存系统，它会从多个位置加载上下文文件（例如 `QWEN.md`）。列表中靠后的位置（更具体）的内容通常会覆盖或补充靠前位置（更通用）的内容。你可以使用 `/memory show` 命令查看实际的拼接顺序和最终使用的上下文内容。典型的加载顺序如下：
  1.  **全局上下文文件：**
      - 路径：`~/.qwen/<contextFileName>` （例如在用户主目录下的 `~/.qwen/QWEN.md`）。
      - 作用范围：为所有项目提供默认指令。
  2.  **项目根目录及祖先目录中的上下文文件：**
      - 路径：CLI 会在当前工作目录及其上级目录中查找已配置的上下文文件，一直向上查找到项目根目录（由 `.git` 文件夹标识）或者用户的主目录为止。
      - 作用范围：提供整个项目或其重要部分相关的上下文信息。
  3.  **子目录中的上下文文件（局部/情境化）：**
      - 路径：CLI 还会在当前工作目录之下的子目录中搜索已配置的上下文文件（遵循如 `node_modules`、`.git` 等常见的忽略规则）。默认最多扫描 200 个目录，但可以通过修改 `settings.json` 中的 `memoryDiscoveryMaxDirs` 字段来调整这一限制。
      - 作用范围：允许为项目的某个特定组件、模块或子部分提供高度定制化的指令。
- **内容拼接与界面提示：** 所有找到的上下文文件内容会被依次拼接起来（每个片段之间插入标明来源路径的分隔符），并作为系统提示的一部分传给 AI。CLI 的底部状态栏会显示已加载的上下文文件数量，让你可以快速了解当前生效的指令上下文规模。
- **导入其他内容：** 你可以通过 `@path/to/file.md` 语法，在上下文中导入其他的 Markdown 文件，实现模块化管理。详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **用于内存管理的命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载上下文文件，从而更新 AI 当前所用的指令上下文。
  - 使用 `/memory show` 查看当前已加载的所有指令上下文内容，方便验证 AI 正在使用的层级结构和具体内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的信息，请参见 [Commands 文档](./commands.md#memory)。

理解并善用这些配置层级以及上下文文件的层次特性，可以帮助你有效管理 AI 的记忆，并根据你的具体需求和项目特点对 Qwen Code 的响应进行个性化定制。

## 沙箱机制

Qwen Code 可以在一个沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是关闭的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMINI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱机制会默认启用。

默认情况下，它会使用一个预构建的 `qwen-code-sandbox` Docker 镜像。

如果你有项目特定的沙箱需求，可以在项目的根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙箱镜像进行构建：

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

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据有助于我们了解 CLI 的使用情况、识别常见问题并优先开发新功能。

**我们会收集的数据：**

- **工具调用信息：** 我们会记录被调用的工具名称、执行成功或失败的状态以及执行耗时。但我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求信息：** 我们会记录每次请求所使用的模型、请求持续时间及是否成功。但我们不会收集 prompt 或 response 的具体内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不会收集的数据：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如您的姓名、电子邮件地址或 API 密钥。
- **Prompt 和 Response 内容：** 我们不会记录您输入的 prompt 或模型返回的 response 内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出数据收集：**

您可以随时通过在 `settings.json` 文件中将 `usageStatisticsEnabled` 属性设置为 `false` 来选择不参与使用统计：

```json
{
  "usageStatisticsEnabled": false
}
```

注意：当启用使用统计时，事件会被发送到阿里云 RUM 数据收集端点。

- **`enableWelcomeBack`**（布尔值）：
  - **说明：** 当回到一个有对话历史的项目时显示欢迎回来对话框。
  - **默认值：** `true`
  - **分类：** UI
  - **需要重启：** 否
  - **示例：** `"enableWelcomeBack": false`
  - **详细说明：** 启用后，Qwen Code 将自动检测你是否回到了之前生成过项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并弹出一个对话框让你选择继续之前的对话还是重新开始。此功能与 `/chat summary` 命令和退出确认对话框集成。更多详情请参阅 [Welcome Back 文档](./welcome-back.md)。