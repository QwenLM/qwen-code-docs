# Qwen Code Core: Tools API

Qwen Code core (`packages/core`) 提供了一套强大的系统，用于定义、注册和执行 tools。这些 tools 扩展了模型的能力，使其能够与本地环境交互、获取网页内容，并执行各种超出简单文本生成的操作。

## 核心概念

- **工具（`tools.ts`）：** 定义所有工具契约的接口和基类（`BaseTool`）。每个工具必须包含以下内容：
  - `name`：唯一的内部名称（用于模型调用 API）。
  - `displayName`：用户友好的显示名称。
  - `description`：对工具功能的清晰说明，提供给模型使用。
  - `parameterSchema`：定义该工具接受参数的 JSON Schema。这对模型理解如何正确调用工具至关重要。
  - `validateToolParams()`：验证传入参数的方法。
  - `getDescription()`：在执行前返回一个可读描述，解释工具将根据特定参数做什么。
  - `shouldConfirmExecute()`：判断是否需要用户确认后再执行（例如潜在破坏性操作）。
  - `execute()`：核心方法，执行工具行为并返回 `ToolResult`。

- **`ToolResult`（`tools.ts`）：** 定义工具执行结果结构的接口：
  - `llmContent`：发送回 LLM 的历史记录中包含的事实内容。可以是简单字符串或 `PartListUnion`（由 `Part` 对象和字符串组成的数组），以支持富媒体内容。
  - `returnDisplay`：面向用户的友好展示内容，通常是 Markdown 字符串或者特殊对象（如 `FileDiff`），用于 CLI 显示。

- **返回富媒体内容：** 工具不仅限于返回纯文本。`llmContent` 可以为 `PartListUnion` 类型，即一个混合了 `Part` 对象（图像、音频等）与字符串的数组。这使得单次工具调用能返回多个富媒体内容片段。

- **工具注册中心（`tool-registry.ts`）：** 负责管理工具生命周期的类（`ToolRegistry`）：
  - **注册工具：** 管理所有内置可用工具集合（如 `ListFiles`、`ReadFile`）。
  - **发现工具：** 支持动态发现新工具：
    - **基于命令行发现：** 若在设置中配置了 `tools.toolDiscoveryCommand`，则会运行此命令，并期望其输出描述自定义工具的 JSON 数据，随后这些工具会被注册为 `DiscoveredTool` 实例。
    - **基于 MCP 协议发现：** 如果设置了 `mcp.mcpServerCommand`，注册中心可以连接到 Model Context Protocol (MCP) 服务器来列出并注册工具（作为 `DiscoveredMCPTool`）。
  - **暴露 Schema：** 向模型公开所有已注册工具的 `FunctionDeclaration` Schema，使模型知道有哪些工具及其使用方式。
  - **获取工具：** 允许主流程通过名称获取具体工具实例以便执行。

## 内置工具

核心包中包含一组预定义的工具，通常位于 `packages/core/src/tools/` 目录下。这些工具包括：

- **文件系统工具：**
  - `ListFiles` (`ls.ts`)：列出目录内容。
  - `ReadFile` (`read-file.ts`)：读取单个文件的内容。它接受一个 `absolute_path` 参数，该参数必须是绝对路径。
  - `WriteFile` (`write-file.ts`)：将内容写入文件。
  - `ReadManyFiles` (`read-many-files.ts`)：从多个文件或 glob 模式中读取并合并内容（CLI 中的 `@` 命令会使用此工具）。
  - `Grep` (`grep.ts`)：在文件中搜索模式。
  - `Glob` (`glob.ts`)：查找匹配 glob 模式的文件。
  - `Edit` (`edit.ts`)：对文件进行原地修改（通常需要确认操作）。
- **执行工具：**
  - `Shell` (`shell.ts`)：执行任意 shell 命令（需要仔细的沙箱控制和用户确认）。
- **网络工具：**
  - `WebFetch` (`web-fetch.ts`)：从 URL 获取内容。
  - `WebSearch` (`web-search.ts`)：执行网络搜索。
- **记忆工具：**
  - `SaveMemory` (`memoryTool.ts`)：与 AI 的记忆功能交互。
- **规划工具：**
  - `Task` (`task.ts`)：将任务委派给专门的子代理。
  - `TodoWrite` (`todoWrite.ts`)：创建和管理结构化任务列表。
  - `ExitPlanMode` (`exitPlanMode.ts`)：退出计划模式并返回正常操作。

每个工具都继承自 `BaseTool` 并实现其特定功能所需的方法。

## 工具执行流程

1.  **模型请求：** 模型根据用户的 prompt 和提供的工具 schemas，决定使用某个工具，并在其响应中返回一个 `FunctionCall` 部分，指定工具名称和参数。
2.  **核心接收请求：** 核心模块解析这个 `FunctionCall`。
3.  **工具查找：** 在 `ToolRegistry` 中查找所请求的工具。
4.  **参数验证：** 调用该工具的 `validateToolParams()` 方法。
5.  **确认（如需要）：**
    - 调用该工具的 `shouldConfirmExecute()` 方法。
    - 如果该方法返回需要确认的信息，核心模块会将此信息传回 CLI，由 CLI 提示用户进行确认。
    - 用户的选择（例如继续、取消）会被发送回核心模块。
6.  **执行：** 如果参数验证通过且用户已确认（或无需确认），核心模块会调用该工具的 `execute()` 方法，传入参数以及一个 `AbortSignal`（用于可能的取消操作）。
7.  **结果处理：** 核心模块接收来自 `execute()` 的 `ToolResult`。
8.  **响应模型：** 将 `ToolResult` 中的 `llmContent` 打包为 `FunctionResponse` 并发送回模型，以便模型继续生成面向用户的响应。
9.  **展示给用户：** 将 `ToolResult` 中的 `returnDisplay` 发送给 CLI，向用户显示工具执行了什么操作。

## 通过自定义工具扩展

虽然在提供的文件中没有明确将「用户直接以编程方式注册新工具」描述为典型最终用户的首要工作流程，但架构仍支持以下方式进行扩展：

- **基于命令的发现机制（Command-based Discovery）：** 高级用户或项目管理员可以在 `settings.json` 中定义一个 `tools.toolDiscoveryCommand`。当核心模块运行该命令时，它应输出一个包含 `FunctionDeclaration` 对象的 JSON 数组。随后，这些对象会被核心模块作为 `DiscoveredTool` 实例提供使用。而对应的 `tools.toolCallCommand` 则负责实际执行这些自定义工具。
- **MCP Server：** 在更复杂的场景下，可以设置并配置一个或多个 MCP 服务器，通过 `settings.json` 中的 `mcpServers` 设置项进行管理。核心模块能够自动发现并使用这些服务器所暴露的工具。如前所述，如果你有多个 MCP 服务器，则工具名称会根据配置中的服务器别名加上前缀（例如：`serverAlias__actualToolName`）。

这套工具系统提供了一种灵活且强大的方式来增强模型的能力，使 Qwen Code 成为适用于各种任务的多功能助手。