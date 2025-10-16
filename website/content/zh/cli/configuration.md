# Qwen Code 配置

Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（较低数字的配置会被较高数字的配置覆盖）：

1.  **默认值：** 应用程序内的硬编码默认值。
2.  **系统默认文件：** 系统范围的默认设置，可被其他设置文件覆盖。
3.  **用户设置文件：** 当前用户的全局设置。
4.  **项目设置文件：** 项目特定的设置。
5.  **系统设置文件：** 系统范围的设置，覆盖所有其他设置文件。
6.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
7.  **命令行参数：** 启动 CLI 时传入的值。

## 配置文件

Qwen Code 使用 JSON 配置文件来保存持久化设置。这些文件有四个不同的位置：

- **系统默认配置文件：**
  - **路径：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）或 `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。可以通过设置环境变量 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 来覆盖该路径。
  - **作用范围：** 提供系统级别的基础默认配置。这些设置优先级最低，预期会被用户、项目或系统覆盖配置所替代。

- **用户配置文件：**
  - **路径：** `~/.qwen/settings.json`（其中 `~` 表示你的主目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。

- **项目配置文件：**
  - **路径：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 只在从该项目运行 Qwen Code 时生效。项目配置会覆盖用户配置。

- **系统配置文件：**
  - **路径：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）或 `/Library/Application Support/QwenCode/settings.json`（macOS）。可以通过设置环境变量 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 来覆盖该路径。
  - **作用范围：** 应用于整个系统中所有用户的 Qwen Code 会话。系统配置会覆盖用户和项目配置。企业中的系统管理员可以使用此文件对用户的 Qwen Code 设置进行统一控制。

**关于配置中的环境变量说明：** 在你的 `settings.json` 文件中，字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。当加载配置时，这些变量将被自动解析。例如，如果你有一个名为 `MY_API_TOKEN` 的环境变量，则可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件之外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙箱配置文件](#sandboxing)（例如：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的配置项：

- **`contextFileName`**（字符串或字符串数组）：
  - **说明：** 指定上下文文件的文件名（例如 `QWEN.md`、`AGENTS.md`）。可以是单个文件名，也可以是多个可接受的文件名组成的数组。
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
  - **说明：** 控制 @ 命令和文件发现工具中基于 git 的文件过滤行为。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`**（布尔值）：在发现文件时是否遵循 `.gitignore` 的规则。当设置为 `true` 时，被 git 忽略的文件（如 `node_modules/`、`dist/`、`.env`）会自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`**（布尔值）：在提示中补全 @ 前缀时，是否启用在当前目录树下递归搜索文件名。
    - **`disableFuzzySearch`**（布尔值）：当设置为 `true` 时，禁用文件搜索中的模糊搜索功能，可以在文件数量较多的项目中提升性能。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### 文件搜索性能问题排查

如果你在文件搜索（例如使用 `@` 补全）时遇到性能问题，特别是在文件数量非常庞大的项目中，可以尝试以下几种方法（按推荐顺序排列）：

1. **使用 `.qwenignore`：** 在项目根目录下创建一个 `.qwenignore` 文件，排除那些包含大量你不需要引用的文件的目录（例如构建产物、日志、`node_modules`）。减少需要遍历的文件总数是提升性能最有效的方式。

2. **禁用模糊搜索：** 如果忽略文件还不够，你可以在 `settings.json` 中将 `disableFuzzySearch` 设置为 `true` 来禁用模糊搜索。这将使用更简单的非模糊匹配算法，可能会更快。

3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这将是最快的选项，因为它避免了对整个项目的递归扫描。但这也意味着你在使用 `@` 补全时需要输入完整的文件路径。

- **`coreTools`**（字符串数组）：
  - **说明：** 允许你指定一组核心工具名称，这些工具将对模型可用。可用于限制内置工具的集合。有关核心工具列表，请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。你也可以为支持的工具（如 `ShellTool`）指定命令级别的限制。例如，`"coreTools": ["ShellTool(ls -l)"]` 将只允许执行 `ls -l` 命令。
  - **默认值：** 模型可以使用所有工具。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`。

- **`allowedTools`**（字符串数组）：
  - **默认值：** `undefined`
  - **说明：** 一组工具名称，这些工具在调用时将跳过确认对话框。这适用于你信任且经常使用的工具。匹配逻辑与 `coreTools` 相同。
  - **示例：** `"allowedTools": ["ShellTool(git status)"]`。

- **`excludeTools`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的核心工具名称。如果某个工具同时出现在 `excludeTools` 和 `coreTools` 中，则会被排除。你也可以为支持的工具（如 `ShellTool`）指定命令级别的限制。例如，`"excludeTools": ["ShellTool(rm -rf)"]` 将阻止执行 `rm -rf` 命令。
  - **默认值：** 不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`。
  - **安全提示：** `excludeTools` 中对 `run_shell_command` 的命令限制基于简单的字符串匹配，容易被绕过。此功能 **不是安全机制**，不应依赖它来安全执行不受信任的代码。建议使用 `coreTools` 明确选择允许执行的命令。

- **`allowMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组 MCP 服务器名称，这些服务器将对模型可用。可用于限制连接的 MCP 服务器集合。注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。
  - **默认值：** 模型可以使用所有 MCP 服务器。
  - **示例：** `"allowMCPServers": ["myPythonServer"]`。
  - **安全提示：** 此功能基于 MCP 服务器名称的简单字符串匹配，名称可以被修改。如果你是系统管理员并希望防止用户绕过此限制，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置 MCP 服务器。此功能不应被视为严格的安全机制。

- **`excludeMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的 MCP 服务器名称。如果某个服务器同时出现在 `excludeMCPServers` 和 `allowMCPServers` 中，则会被排除。注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。
  - **默认值：** 不排除任何 MCP 服务器。
  - **示例：** `"excludeMCPServers": ["myNodeServer"]`。
  - **安全提示：** 此功能基于 MCP 服务器名称的简单字符串匹配，名称可以被修改。如果你是系统管理员并希望防止用户绕过此限制，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置 MCP 服务器。此功能不应被视为严格的安全机制。

- **`autoAccept`**（布尔值）：
  - **说明：** 控制 CLI 是否自动接受并执行被认为是安全的工具调用（例如只读操作），而无需用户明确确认。如果设置为 `true`，CLI 将跳过对安全工具的确认提示。
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
  - **说明：** 控制是否以及如何使用沙箱来执行工具。如果设置为 `true`，Qwen Code 将使用预构建的 `qwen-code-sandbox` Docker 镜像。更多信息请参见 [Sandboxing](#sandboxing)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于从项目中发现工具。该 shell 命令必须在 `stdout` 上返回一个 [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 的 JSON 数组。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于调用通过 `toolDiscoveryCommand` 发现的特定工具。该 shell 命令必须满足以下条件：
    - 必须将函数 `name`（与 [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）作为第一个命令行参数。
    - 必须从 `stdin` 读取函数参数（JSON 格式），类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 必须在 `stdout` 上返回函数输出（JSON 格式），类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`**（对象）：
  - **说明：** 配置一个或多个 Model-Context Protocol (MCP) 服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器暴露了同名工具，工具名称将加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`）以避免冲突。注意，系统可能会为了兼容性而从 MCP 工具定义中剥离某些 schema 属性。至少需要提供 `command`、`url` 或 `httpUrl` 中的一项。如果多个都提供，优先级顺序为 `httpUrl` > `url` > `command`。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`**（对象）：指定服务器的参数。
      - `command`（字符串，可选）：通过标准 I/O 启动 MCP 服务器的命令。
      - `args`（字符串数组，可选）：传递给命令的参数。
      - `env`（对象，可选）：为服务器进程设置的环境变量。
      - `cwd`（字符串，可选）：启动服务器的工作目录。
      - `url`（字符串，可选）：使用 Server-Sent Events (SSE) 通信的 MCP 服务器 URL。
      - `httpUrl`（字符串，可选）：使用可流式 HTTP 通信的 MCP 服务器 URL。
      - `headers`（对象，可选）：发送到 `url` 或 `httpUrl` 的 HTTP 请求头。
      - `timeout`（数字，可选）：对此 MCP 服务器请求的超时时间（毫秒）。
      - `trust`（布尔值，可选）：信任此服务器并跳过所有工具调用确认。
      - `description`（字符串，可选）：服务器的简要描述，可能用于显示。
      - `includeTools`（字符串数组，可选）：从此 MCP 服务器包含的工具名称列表。指定后，仅列出的工具可用（白名单行为）。未指定时，默认启用服务器的所有工具。
      - `excludeTools`（字符串数组，可选）：从此 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，模型也无法使用。**注意：** `excludeTools` 优先级高于 `includeTools` —— 如果一个工具同时出现在两个列表中，它将被排除。
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
  - **说明：** 配置检查点功能，允许你保存和恢复对话及文件状态。更多详情请参见 [Checkpointing documentation](../checkpointing.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`**（布尔值）：当为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`**（字符串）：
  - **说明：** 指定用于查看 diff 的首选编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`**（对象）
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
  - **说明：** 启用或禁用 CLI 界面中的提示信息。
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
  - **说明：** 设置会话的最大轮数。如果会话超过此限制，CLI 将停止处理并开始新的聊天。
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
  - **说明：** 指定应从项目 `.env` 文件中排除的环境变量。这可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。`.qwen/.env` 文件中的变量永远不会被排除。
  - **默认值：** `["DEBUG", "DEBUG_MODE"]`
  - **示例：**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`**（字符串数组）：
  - **说明：** 指定要包含在工作区上下文中的额外绝对或相对路径数组。缺失的目录默认会跳过并显示警告。路径可以使用 `~` 引用用户的主目录。此设置可以与 `--include-directories` 命令行标志结合使用。
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
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设置为 `true`，应从所有添加的目录中加载 `QWEN.md` 文件。如果设置为 `false`，则只从当前目录加载 `QWEN.md`。
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
      "contextPercentageThreshold":

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

CLI 会保存你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，这些历史记录会存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常见方式，尤其适用于敏感信息（如 API keys）或在不同环境中可能变化的设置。关于认证配置，请参阅 [Authentication documentation](./authentication.md)，其中涵盖了所有可用的认证方法。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则向上级目录逐层查找，直到找到 `.env` 文件，或到达项目根目录（通过 `.git` 文件夹识别）或用户主目录。
3. 如果仍未找到，则尝试加载 `~/.env`（用户主目录下的 `.env` 文件）。

**环境变量排除机制：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）默认会从项目 `.env` 文件中自动排除，以避免干扰 CLI 的行为。而 `.qwen/.env` 文件中的变量则永远不会被排除。你可以通过在 `settings.json` 文件中配置 `excludedProjectEnvVars` 来自定义这一行为。

- **`OPENAI_API_KEY`**:
  - 多种可用的 [认证方式](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`OPENAI_BASE_URL`**:
  - 多种可用的 [认证方式](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`OPENAI_MODEL`**:
  - 指定默认使用的 OPENAI 模型。
  - 会覆盖硬编码的默认值。
  - 示例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**:
  - 是 `settings.json` 中 `sandbox` 设置的替代方式。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。
- **`SEATBELT_PROFILE`**（仅 macOS）:
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）配置文件。
  - `permissive-open`：（默认）限制写入项目目录（及其他少数目录，详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其他操作。
  - `strict`：使用严格配置文件，默认拒绝所有操作。
  - `<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）:
  - 设置为 `true` 或 `1` 可启用详细调试日志，有助于排查问题。
  - **注意：** 这些变量默认会从项目 `.env` 文件中自动排除，以避免干扰 CLI 行为。如需为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。
- **`NO_COLOR`**:
  - 设置任意值可禁用 CLI 中的所有颜色输出。
- **`CLI_TITLE`**:
  - 设置一个字符串来自定义 CLI 的标题。
- **`CODE_ASSIST_ENDPOINT`**:
  - 指定代码辅助服务的 endpoint。
  - 对开发和测试非常有用。
- **`TAVILY_API_KEY`**:
  - 你的 Tavily 网络搜索服务的 API key。
  - 启用 `web_search` 工具功能所必需。
  - 若未配置，网络搜索工具将被禁用并跳过。
  - 示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`

## 命令行参数

在运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

- **`--model <model_name>`** (**`-m <model_name>`**)：
  - 指定本次会话使用的 Qwen 模型。
  - 示例：`npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**)：
  - 直接将 prompt 传递给命令。这将以非交互模式调用 Qwen Code。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**)：
  - 使用提供的 prompt 作为初始输入启动一个交互式会话。
  - prompt 将在交互式会话中处理，而不是在其之前处理。
  - 当从 stdin 管道输入时不能使用此选项。
  - 示例：`qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**)：
  - 为本次会话启用沙盒模式。
- **`--sandbox-image`**：
  - 设置沙盒镜像 URI。
- **`--debug`** (**`-d`**)：
  - 启用调试模式以获取更详细的输出信息。
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
    - `plan`：仅分析，不修改文件或执行命令。
    - `default`：需要对文件编辑或 shell 命令进行审批（默认行为）。
    - `auto-edit`：自动批准编辑类工具（如 edit、write_file），其他工具仍需提示确认。
    - `yolo`：自动批准所有工具调用（等同于 `--yolo`）。
  - 不可与 `--yolo` 同时使用。请改用 `--approval-mode=yolo` 来采用新的统一方式。
  - 示例：`qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**：
  - 工具名称列表（逗号分隔），这些工具将跳过确认对话框。
  - 示例：`qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**：
  - 启用 [遥测功能](../telemetry.md)。
- **`--telemetry-target`**：
  - 设置遥测目标。更多信息请参见 [遥测功能](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**：
  - 设置遥测的 OTLP 终端地址。更多信息请参见 [遥测功能](../telemetry.md)。
- **`--telemetry-otlp-protocol`**：
  - 设置遥测的 OTLP 协议（`grpc` 或 `http`）。默认值是 `grpc`。更多信息请参见 [遥测功能](../telemetry.md)。
- **`--telemetry-log-prompts`**：
  - 启用遥测日志记录 prompt 功能。更多信息请参见 [遥测功能](../telemetry.md)。
- **`--checkpointing`**：
  - 启用 [检查点功能](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**)：
  - 指定本次会话要使用的扩展插件列表。如果未提供，默认使用所有可用扩展。
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
  - 启用屏幕阅读器模式以提高无障碍访问体验。
- **`--version`**：
  - 显示 CLI 版本信息。
- **`--openai-logging`**：
  - 启用 OpenAI API 调用的日志记录功能以便调试和分析。此标志优先级高于 `settings.json` 中的 `enableOpenAILogging` 配置项。
- **`--tavily-api-key <api_key>`**：
  - 为此会话设置用于网页搜索功能的 Tavily API 密钥。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (分层指令上下文)

虽然严格来说不是 CLI **行为** 的配置，但 context files（默认为 `QWEN.md`，可通过 `contextFileName` 设置项配置）对于配置**指令上下文**（也称为 "memory"）至关重要。这个强大的功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更贴合你的需求。CLI 包含一些 UI 元素，例如底部显示已加载 context files 数量的指示器，让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统被设计为以分层方式管理这些指令上下文。

### 示例上下文文件内容（例如，`QWEN.md`）

以下是一个位于 TypeScript 项目根目录的上下文文件的概念示例：

```markdown

# 项目：My Awesome TypeScript Library

## 通用说明：

- 在生成新的 TypeScript 代码时，请遵循现有的代码风格。
- 确保所有新增的函数和类都包含 JSDoc 注释。
- 在适当的情况下，优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## 代码风格：

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如，`IUserService`）。
- 类的私有成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`

- 该文件处理所有对外的 API 请求。
- 在添加新的 API 调用函数时，请确保包含完善的错误处理和日志记录。
- 所有 GET 请求请使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：

- 除非绝对必要，否则应避免引入新的外部依赖。
- 如果确实需要新依赖，请说明原因。

```markdown

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的说明。你的上下文文件越相关且精确，AI 就能更好地为你提供帮助。强烈建议创建项目特定的上下文文件来建立约定和上下文环境。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现了一套复杂的分层内存系统。列表中靠后的位置（更具体）的文件内容通常会覆盖或补充靠前位置（更通用）的文件内容。你可以使用 `/memory show` 命令查看确切的拼接顺序和最终上下文。典型的加载顺序如下：
  1.  **全局上下文文件：**
      - 路径：`~/.qwen/<contextFileName>`（例如在你的用户主目录下的 `~/.qwen/QWEN.md`）。
      - 作用域：为所有项目提供默认指令。
  2.  **项目根目录及祖先目录的上下文文件：**
      - 路径：CLI 会在当前工作目录以及向上每一级父目录中查找配置的上下文文件，直到遇到项目根目录（由 `.git` 文件夹标识）或你的主目录为止。
      - 作用域：提供整个项目或其重要部分相关的上下文。
  3.  **子目录上下文文件（局部/上下文相关）：**
      - 路径：CLI 还会在当前工作目录之下的子目录中搜索配置的上下文文件（遵循如 `node_modules`、`.git` 等常见忽略模式）。默认情况下，此搜索限制为最多 200 个目录，但可以通过在 `settings.json` 文件中设置 `memoryDiscoveryMaxDirs` 字段进行调整。
      - 作用域：允许为项目的某个特定组件、模块或子部分提供高度定制化的指令。
- **拼接与 UI 提示：** 所有找到的上下文文件内容会被依次拼接（并用分隔符标明来源和路径），作为系统提示的一部分提供给 AI。CLI 的底部会显示已加载的上下文文件数量，让你快速了解当前激活的指令上下文。
- **导入内容：** 你可以通过使用 `@path/to/file.md` 语法导入其他 Markdown 文件，从而模块化管理你的上下文文件。更多详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载所有上下文文件。这将更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前加载的综合指令上下文，方便你确认 AI 正在使用的层级结构和内容。
  - 有关 `/memory` 命令及其子命令（`show` 和 `refresh`）的完整信息，请参阅 [Commands 文档](./commands.md#memory)。

通过理解并利用这些配置层级和上下文文件的分层特性，你可以有效地管理 AI 的记忆，并根据你的具体需求和项目定制 Qwen Code 的响应行为。

## 沙箱机制

Qwen Code 可以在沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是禁用的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMINI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱机制会默认启用。

默认情况下，它会使用预构建的 `qwen-code-sandbox` Docker 镜像。

如果你的项目有特定的沙箱需求，可以在项目根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙箱镜像：

```dockerfile
FROM qwen-code-sandbox

# 在这里添加你的自定义依赖或配置

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

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如您的姓名、电子邮件地址或 API key。
- **Prompt 和 Response 内容：** 我们不会记录您发送的 prompt 或模型返回的 response 内容。
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
  - **说明：** 当回到一个有对话历史的项目时，显示欢迎回来对话框。
  - **默认值：** `true`
  - **分类：** UI
  - **需要重启：** 否
  - **示例：** `"enableWelcomeBack": false`
  - **详细说明：** 启用后，Qwen Code 将自动检测你是否回到了一个已有之前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并弹出一个对话框让你选择继续之前的对话还是重新开始。此功能与 `/chat summary` 命令和退出确认对话框集成。更多详情请参阅 [Welcome Back 文档](./welcome-back.md)。