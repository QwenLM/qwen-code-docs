# Qwen Code 配置

Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（数字越小优先级越低，会被更高优先级覆盖）：

1.  **默认值：** 应用程序内的硬编码默认值。
2.  **系统默认文件：** 系统范围的默认设置，可被其他设置文件覆盖。
3.  **用户设置文件：** 当前用户的全局设置。
4.  **项目设置文件：** 项目特定的设置。
5.  **系统设置文件：** 系统范围的设置，会覆盖所有其他设置文件。
6.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
7.  **命令行参数：** 启动 CLI 时传入的值。

## 配置文件

Qwen Code 使用 JSON 配置文件来持久化配置。这些文件有四个不同的位置：

- **系统默认配置文件：**
  - **位置：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）或 `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。可以通过设置 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量来覆盖默认路径。
  - **作用范围：** 提供系统级的默认配置基础层。这些配置的优先级最低，预期会被用户、项目或系统覆盖配置所替代。

- **用户配置文件：**
  - **位置：** `~/.qwen/settings.json`（其中 `~` 表示你的用户主目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。

- **项目配置文件：**
  - **位置：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 仅在从该特定项目运行 Qwen Code 时生效。项目配置会覆盖用户配置。

- **系统配置文件：**
  - **位置：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）或 `/Library/Application Support/QwenCode/settings.json`（macOS）。可以通过设置 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量来覆盖默认路径。
  - **作用范围：** 应用于系统上所有用户的 Qwen Code 会话。系统配置会覆盖用户和项目配置。对于企业中的系统管理员来说，这可能是一个有用的机制，可以对用户的 Qwen Code 设置进行统一控制。

**关于配置中的环境变量说明：** 在你的 `settings.json` 文件中，字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法来引用环境变量。这些变量在配置加载时会自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

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
  - **说明：** 控制 @ 命令和文件发现工具中基于 Git 的文件过滤行为。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`**（布尔值）：在发现文件时是否遵循 `.gitignore` 的规则。设置为 `true` 时，被 Git 忽略的文件（如 `node_modules/`、`dist/`、`.env`）会自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`**（布尔值）：在提示中补全 @ 前缀时，是否启用对当前目录树下文件名的递归搜索。
    - **`disableFuzzySearch`**（布尔值）：设为 `true` 时，禁用文件搜索中的模糊匹配功能，可以在文件数量庞大的项目中提升性能。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### 文件搜索性能问题排查

如果你在文件搜索（例如使用 `@` 补全）时遇到性能问题，特别是在包含大量文件的项目中，可以尝试以下几种方法（按推荐顺序排列）：

1. **使用 `.qwenignore`：** 在项目根目录下创建一个 `.qwenignore` 文件，用于排除那些包含大量你不需要引用的文件的目录（如构建产物、日志、`node_modules`）。减少被索引的总文件数是提升性能最有效的方式。

2. **禁用模糊搜索：** 如果忽略某些文件还不够，你可以通过在 `settings.json` 中将 `disableFuzzySearch` 设置为 `true` 来禁用模糊搜索。这会启用一种更简单的非模糊匹配算法，可能会更快。

3. **禁用递归文件搜索：** 作为最后手段，你可以完全禁用递归文件搜索，只需将 `enableRecursiveFileSearch` 设置为 `false`。这是最快的选择，因为它避免了对整个项目的递归遍历。但这也意味着你在使用 `@` 补全时需要输入完整的文件路径。

---

- **`coreTools`**（字符串数组）：
  - **说明：** 允许你指定一组核心工具名称列表，这些工具将提供给模型使用。可用于限制内置工具集。有关核心工具列表，请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。你也可以为支持该功能的工具（如 `ShellTool`）设置命令级别的限制。例如，`"coreTools": ["ShellTool(ls -l)"]` 将只允许执行 `ls -l` 命令。
  - **默认值：** 所有可用的核心工具都会开放给模型使用。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`

- **`allowedTools`**（字符串数组）：
  - **默认值：** `undefined`
  - **说明：** 指定一组工具名称，在调用这些工具时不弹出确认对话框。适用于你信任且频繁使用的工具。匹配逻辑与 `coreTools` 相同。
  - **示例：** `"allowedTools": ["ShellTool(git status)"]`

- **`excludeTools`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的核心工具名称。如果某个工具同时出现在 `excludeTools` 和 `coreTools` 列表中，则会被排除。你还可以为支持它的工具（如 `ShellTool`）设置命令级限制。例如，`"excludeTools": ["ShellTool(rm -rf)"]` 会阻止执行 `rm -rf` 命令。
  - **默认值：** 不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`
  - **安全提示：** 对于 `run_shell_command` 的命令级限制基于简单字符串匹配，容易绕过。此功能**不是安全机制**，不应依赖它来安全地运行不受信代码。建议使用 `coreTools` 明确选择可执行的命令。

- **`allowMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组 MCP 服务器名称，供模型连接和发现自定义工具。可用于限制要连接的 MCP 服务器集合。注意，若设置了 `--allowed-mcp-server-names` 参数，此项将被忽略。
  - **默认值：** 所有 MCP 服务器都可供模型使用。
  - **示例：** `"allowMCPServers": ["myPythonServer"]`
  - **安全提示：** 此项使用简单的字符串匹配方式识别 MCP 服务器名，可能被篡改。如果你是系统管理员并希望防止用户绕过这一限制，请考虑在系统级别配置 `mcpServers`，使用户无法自行配置 MCP 服务器。不要将其视为绝对的安全措施。

- **`excludeMCPServers`**（字符串数组）：
  - **说明：** 允许你指定一组应从模型中排除的 MCP 服务器名称。如果某台服务器同时出现在 `excludeMCPServers` 和 `allowMCPServers` 中，则会被排除。注意，若设置了 `--allowed-mcp-server-names` 参数，此项将被忽略。
  - **默认值：** 不排除任何 MCP 服务器。
  - **示例：** `"excludeMCPServers": ["myNodeServer"]`
  - **安全提示：** 同上，使用的是简单字符串匹配，可能被修改。请参考上述关于 `allowMCPServers` 的安全注意事项。

- **`autoAccept`**（布尔值）：
  - **说明：** 控制 CLI 是否自动接受并执行被认为是安全的操作（如只读操作），而无需显式用户确认。设为 `true` 时，CLI 将跳过对被认为安全的工具调用的确认提示。
  - **默认值：** `false`
  - **示例：** `"autoAccept": true`

- **`theme`**（字符串）：
  - **说明：** 设置 Qwen Code 的视觉主题。详见 [主题文档](./themes.md)。
  - **默认值：** `"Default"`
  - **示例：** `"theme": "GitHub"`

- **`vimMode`**（布尔值）：
  - **说明：** 启用或禁用输入编辑器中的 vim 模式。启用后，输入区域支持 vim 风格的导航和编辑命令（NORMAL 和 INSERT 模式）。状态会在页脚显示，并在会话间保持。
  - **默认值：** `false`
  - **示例：** `"vimMode": true`

- **`sandbox`**（布尔值或字符串）：
  - **说明：** 控制是否以及如何使用沙箱环境执行工具。如果设为 `true`，Qwen Code 使用预构建的 `qwen-code-sandbox` Docker 镜像。更多信息请参阅 [Sandboxing](#sandboxing)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于从项目中发现工具。shell 命令必须在 `stdout` 返回一个 [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 的 JSON 数组。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`**（字符串）：
  - **说明：** **与 Gemini CLI 对齐。** 定义一个自定义 shell 命令，用于调用通过 `toolDiscoveryCommand` 发现的特定工具。shell 命令需满足以下条件：
    - 必须以函数名（即 [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中的确切名称）作为第一个命令行参数；
    - 必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)；
    - 必须向 `stdout` 输出 JSON 格式的函数结果，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`**（对象）：
  - **说明：** 配置一个或多个 Model-Context Protocol (MCP) 服务器连接，以便发现和使用自定义工具。Qwen Code 会尝试连接每个已配置的 MCP 服务器以获取可用工具。如果有多个 MCP 服务器暴露相同名称的工具，为了避免冲突，工具名称将会加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`）。请注意，为了兼容性，系统可能会剥离某些 schema 属性。至少需要提供 `command`、`url` 或 `httpUrl` 中的一项。如果多项都被指定，优先级依次为 `httpUrl` > `url` > `command`。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`**（对象）：命名服务器的参数。
      - `command`（字符串，可选）：启动 MCP 服务器的标准 I/O 命令。
      - `args`（字符串数组，可选）：传递给命令的参数。
      - `env`（对象，可选）：为服务器进程设置的环境变量。
      - `cwd`（字符串，可选）：启动服务器的工作目录。
      - `url`（字符串，可选）：使用 Server-Sent Events (SSE) 进行通信的 MCP 服务器 URL。
      - `httpUrl`（字符串，可选）：使用流式 HTTP 协议进行通信的 MCP 服务器 URL。
      - `headers`（对象，可选）：发送到 `url` 或 `httpUrl` 请求头的映射。
      - `timeout`（数字，可选）：针对该 MCP 服务器请求的超时时间（毫秒）。
      - `trust`（布尔值，可选）：信任此服务器并跳过所有工具调用确认。
      - `description`（字符串，可选）：服务器简短描述，可用于展示目的。
      - `includeTools`（字符串数组，可选）：仅包含来自该 MCP 服务器的指定工具列表（白名单行为）。未指定则默认启用全部工具。
      - `excludeTools`（字符串数组，可选）：排除来自该 MCP 服务器的指定工具列表。即使服务器暴露这些工具也不会提供给模型使用。**注意：** `excludeTools` 优先级高于 `includeTools` —— 若工具同时存在于两个列表中，将被排除。
  - **示例：**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"]
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
  - **说明：** 配置检查点功能，允许保存和恢复对话及文件状态。更多详情请参阅 [Checkpointing 文档](../checkpointing.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`**（布尔值）：当设为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`**（字符串）：
  - **说明：** 指定查看 diff 时首选的编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`**（对象）
  - **说明：** 配置 Qwen Code 的日志记录和指标收集。更多信息请参阅 [Telemetry](../telemetry.md)。
  - **默认值：** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **属性：**
    - **`enabled`**（布尔值）：是否启用遥测数据收集。
    - **`target`**（字符串）：遥测数据的目标位置。支持的值包括 `local` 和 `gcp`。
    - **`otlpEndpoint`**（字符串）：OTLP Exporter 的端点地址。
    - **`logPrompts`**（布尔值）：是否在日志中包含用户的提示内容。
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
  - **说明：** 启用或禁用使用统计信息收集。更多信息请参阅 [Usage Statistics](#usage-statistics)。
  - **默认值：** `true`
  - **示例：**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`**（布尔值）：
  - **说明：** 启用或禁用 CLI 接口中的帮助提示。
  - **默认值：** `false`
  - **示例：**
    ```json
    "hideTips": true
    ```

- **`hideBanner`**（布尔值）：
  - **说明：** 启用或禁用 CLI 接口中启动时显示的 ASCII 艺术 Logo。
  - **默认值：** `false`
  - **示例：**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`**（数字）：
  - **说明：** 设置一次会话的最大轮次。超过这个限制后，CLI 将停止处理并开始新的聊天。
  - **默认值：** `-1`（无限制）
  - **示例：**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`**（对象）：
  - **说明：** 启用或禁用工具输出摘要功能。你可以通过 `tokenBudget` 设置摘要所使用的 token 预算。
  - 注意：目前仅支持 `run_shell_command` 工具。
  - **默认值：** `{}`（默认关闭）
  - **示例：**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`**（字符串数组）：
  - **说明：** 指定应从项目 `.env` 文件中排除加载的环境变量。这样可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。
  - **默认值：** `["DEBUG", "DEBUG_MODE"]`
  - **示例：**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`**（字符串数组）：
  - **说明：** 指定额外的绝对或相对路径数组，将其加入工作区上下文中。缺失的目录默认会发出警告并跳过。路径可以使用 `~` 引用用户主目录。此设置可与 `--include-directories` 命令行标志结合使用。
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
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设为 `true`，应从所有添加的目录中加载 `QWEN.md` 文件；如果设为 `false`，则只从当前目录加载。
  - **默认值：** `false`
  - **示例：**
    ```json
    "loadMemoryFromIncludeDirectories": true
    ```

- **`tavilyApiKey`**（字符串）：
  - **说明：** Tavily 网络搜索服务的 API 密钥。启用 `web_search` 工具功能必需。如果没有配置，网络搜索工具将被禁用并跳过。
  - **默认值：** `undefined`（网络搜索禁用）
  - **示例：** `"tavilyApiKey": "tvly-your-api-key-here"`

- **`chatCompression`**（对象）：
  - **说明：** 控制聊天历史压缩的相关设置，包括自动触发和手动通过 `/compress` 命令触发的情况。
  - **属性：**
    - **`contextPercentageThreshold`**（数字）：介于 0 到 1 之间的数值，表示触发压缩所需的 token 占比阈值。例如，值为 `0.6` 表示当聊天历史超过模型最大 token 上限的 60% 时触发压缩。
  - **示例：**
    ```json
    "chatCompression": {
      "contextPercentageThreshold": 0.6
    }
    ```

- **`showLineNumbers`**（布尔值）：
  - **说明：** 控制 CLI 输出中的代码块是否显示行号。
  - **默认值：** `true

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

## Shell History

CLI 会保存你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，这些历史记录会存储在用户主目录下的项目专属目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录会保存在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用的常见方式，尤其适用于敏感信息（如 API keys）或在不同环境中可能变化的设置。关于认证配置，请参考 [Authentication documentation](./authentication.md)，其中涵盖了所有可用的认证方法。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录下的 `.env` 文件。
2. 如果未找到，则向上级目录逐层查找，直到找到 `.env` 文件，或者到达项目根目录（以 `.git` 文件夹为标识）或用户主目录为止。
3. 若仍未找到，则尝试读取 `~/.env`（即用户主目录下的 `.env` 文件）。

**排除特定环境变量：** 某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）默认会被自动排除在项目的 `.env` 文件之外，以防干扰 CLI 的行为。而来自 `.qwen/.env` 文件中的变量则永远不会被排除。你可以通过修改 `settings.json` 中的 `excludedProjectEnvVars` 设置来自定义这一行为。

- **`OPENAI_API_KEY`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`OPENAI_BASE_URL`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 同样可在 shell 配置文件或 `.env` 文件中设置。
- **`OPENAI_MODEL`**：
  - 指定默认使用的 OPENAI 模型。
  - 覆盖硬编码的默认值。
  - 示例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**：
  - 是对 `settings.json` 中 `sandbox` 设置的一种替代方案。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串作为值。
- **`SEATBELT_PROFILE`**（仅限 macOS 使用）：
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）策略。
  - `permissive-open`：（默认）限制写入操作到项目目录及其他少数几个路径（详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其他操作。
  - `strict`：使用严格模式，默认拒绝大部分操作。
  - `<profile_name>`：使用自定义策略。要创建一个自定义策略，请在你项目的 `.qwen/` 目录下新建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）：
  - 设为 `true` 或 `1` 来启用详细的调试日志输出，有助于排查问题。
  - **注意：** 这两个变量默认不会出现在项目 `.env` 文件中，以免影响 CLI 行为。如果你需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。
- **`NO_COLOR`**：
  - 设置任意值即可禁用 CLI 所有颜色输出。
- **`CLI_TITLE`**：
  - 设置该变量可以自定义 CLI 标题显示内容。
- **`CODE_ASSIST_ENDPOINT`**：
  - 指定代码辅助服务端点地址。
  - 对开发和测试非常有用。
- **`TAVILY_API_KEY`**：
  - Tavily 网络搜索服务的 API 密钥。
  - 必须配置才能启用 `web_search` 工具功能。
  - 若未配置，网络搜索工具将被禁用并跳过执行。
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
  - 启用调试模式，提供更详细的输出信息。
- **`--all-files`** (**`-a`**)：
  - 如果设置，则递归地将当前目录中的所有文件包含为 prompt 的上下文。
- **`--help`**（或 **`-h`**）：
  - 显示关于命令行参数的帮助信息。
- **`--show-memory-usage`**：
  - 显示当前内存使用情况。
- **`--yolo`**：
  - 启用 YOLO 模式，自动批准所有工具调用。
- **`--approval-mode <mode>`**：
  - 设置工具调用的审批模式。支持的模式包括：
    - `plan`：仅分析，不修改文件或执行命令。
    - `default`：需要对文件编辑或 shell 命令进行审批（默认行为）。
    - `auto-edit`：自动批准编辑类工具（如 edit、write_file），其他工具仍需提示确认。
    - `yolo`：自动批准所有工具调用（等同于 `--yolo`）。
  - 不可与 `--yolo` 同时使用。请改用 `--approval-mode=yolo` 来采用新的统一方式。
  - 示例：`qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**：
  - 工具名称列表（以逗号分隔），这些工具将跳过确认对话框。
  - 示例：`qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**：
  - 启用 [遥测功能](../telemetry.md)。
- **`--telemetry-target`**：
  - 设置遥测目标。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**：
  - 设置遥测的 OTLP 终端地址。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-otlp-protocol`**：
  - 设置遥测的 OTLP 协议（`grpc` 或 `http`）。默认值是 `grpc`。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-log-prompts`**：
  - 启用遥测日志记录 prompt 功能。更多信息请参见 [遥测](../telemetry.md)。
- **`--checkpointing`**：
  - 启用 [检查点功能](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**)：
  - 指定本次会话要使用的扩展列表。如果未指定，默认使用所有可用扩展。
  - 可通过特殊关键字 `qwen -e none` 禁用所有扩展。
  - 示例：`qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**)：
  - 列出所有可用扩展并退出。
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
  - 启用 OpenAI API 调用的日志记录功能用于调试和分析。此标志优先级高于 `settings.json` 中的 `enableOpenAILogging` 配置项。
- **`--tavily-api-key <api_key>`**：
  - 为此会话设置 Tavily API 密钥以启用网页搜索功能。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (分层指令上下文)

虽然严格来说不是 CLI **行为** 的配置，但 context files（默认为 `QWEN.md`，可通过 `contextFileName` 设置项配置）对于配置 **指令上下文**（也称为 "memory"）至关重要。这个强大的功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，使其响应更贴合你的需求。CLI 包含 UI 元素，例如页脚中显示已加载 context files 数量的指示器，让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统被设计为分层管理这些指令上下文。

### 示例上下文文件内容（例如，`QWEN.md`）

以下是一个概念性示例，展示了一个位于 TypeScript 项目根目录的上下文文件可能包含的内容：

```markdown

# Project: My Awesome TypeScript Library

## General Instructions:

- 当生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新函数和类都有 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## Coding Style:

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如：`IUserService`）。
- 类的私有成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## Specific Component: `src/api/client.ts`

- 此文件处理所有对外的 API 请求。
- 添加新的 API 调用函数时，确保包含健壮的错误处理和日志记录。
- 对于所有的 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

```markdown
## 关于依赖项：

- 除非绝对必要，否则应避免引入新的外部依赖项。
- 如果确实需要引入新依赖，请说明理由。

```

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的说明。你的上下文文件越相关且精确，AI 就能更好地为你提供帮助。我们强烈建议你为项目创建特定的上下文文件，以建立统一的规范和背景信息。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现了一套复杂的分层内存系统。列表中靠后的位置（更具体）的文件内容通常会覆盖或补充靠前位置（更通用）的内容。你可以使用 `/memory show` 命令查看确切的拼接顺序和最终的上下文内容。典型的加载顺序如下：
  1. **全局上下文文件：**
     - 路径：`~/.qwen/<contextFileName>`（例如在你的用户主目录下的 `~/.qwen/QWEN.md`）。
     - 作用范围：为所有项目提供默认指令。
  2. **项目根目录及祖先目录的上下文文件：**
     - 路径：CLI 会在当前工作目录及其上级目录中查找配置的上下文文件，直到遇到项目根目录（由 `.git` 文件夹标识）或你的主目录为止。
     - 作用范围：提供整个项目或其重要部分相关的上下文。
  3. **子目录中的上下文文件（局部/上下文相关）：**
     - 路径：CLI 还会在当前工作目录之下的子目录中搜索配置的上下文文件（遵循如 `node_modules`、`.git` 等常见的忽略规则）。默认情况下，该搜索最多遍历 200 个目录，但可以通过在 `settings.json` 文件中设置 `memoryDiscoveryMaxDirs` 字段来调整这一限制。
     - 作用范围：允许为项目的某个特定组件、模块或子部分提供高度定制化的指令。
- **拼接与 UI 提示：** 所有找到的上下文文件内容会被依次拼接（并用分隔符标明来源路径），作为系统提示的一部分提供给 AI。CLI 的底部会显示已加载的上下文文件数量，让你可以快速了解当前激活的指令上下文。
- **导入内容：** 你可以通过在上下文文件中使用 `@path/to/file.md` 语法导入其他 Markdown 文件，从而实现模块化管理。更多详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载上下文文件，更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前已加载的完整指令上下文，方便你确认 AI 正在使用的层级结构和内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的详细信息，请参阅 [Commands 文档](./commands.md#memory)。

通过理解并利用这些配置层级以及上下文文件的分层特性，你可以有效地管理 AI 的记忆，并根据你的具体需求和项目定制 Qwen Code 的响应行为。

## 沙箱机制

Qwen Code 可以在沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是禁用的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱机制会默认启用。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

如果你的项目有特定的沙箱需求，可以在项目根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙箱镜像：

```dockerfile
FROM qwen-code-sandbox

# 在这里添加你自定义的依赖项或配置

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
- **API 请求信息：** 我们会记录每次请求所使用的模型、请求持续时间以及是否成功。但我们不会收集 prompt 或 response 的具体内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不会收集的数据：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如您的姓名、邮箱地址或 API key。
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
  - **详细说明：** 启用后，Qwen Code 将自动检测你是否回到了一个已有之前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示一个对话框让你选择继续之前的对话还是重新开始。此功能与 `/chat summary` 命令和退出确认对话框集成。更多详情请参阅 [Welcome Back 文档](./welcome-back.md)。