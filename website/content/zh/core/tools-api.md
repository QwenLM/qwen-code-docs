# Qwen Code Core: Tools API

Qwen Code core (`packages/core`) 提供了一套强大的系统，用于定义、注册和执行 tools。这些 tools 扩展了模型的能力，使其能够与本地环境交互、获取网页内容，并执行各种超出简单文本生成的操作。

## 核心概念

- **Tool (`tools.ts`)：** 一个接口和基类（`BaseTool`），定义了所有工具的契约。每个工具必须包含：
  - `name`：唯一的内部名称（用于模型的 API 调用）。
  - `displayName`：用户友好的名称。
  - `description`：对工具功能的清晰说明，提供给模型使用。
  - `parameterSchema`：定义工具接受参数的 JSON schema。这对模型理解如何正确调用工具至关重要。
  - `validateToolParams()`：用于验证传入参数的方法。
  - `getDescription()`：用于在执行前提供人类可读的描述，说明工具将使用特定参数执行什么操作。
  - `shouldConfirmExecute()`：用于判断是否需要用户确认后再执行（例如，对于可能具有破坏性的操作）。
  - `execute()`：执行工具核心操作并返回 `ToolResult` 的方法。

- **`ToolResult` (`tools.ts`)：** 定义工具执行结果结构的接口：
  - `llmContent`：要包含在返回给 LLM 的历史记录中的事实内容。可以是简单的字符串，也可以是 `PartListUnion`（由 `Part` 对象和字符串组成的数组），用于支持富内容。
  - `returnDisplay`：用于 CLI 显示的用户友好字符串（通常是 Markdown）或特殊对象（如 `FileDiff`）。

- **返回富内容：** 工具不仅限于返回简单文本。`llmContent` 可以是 `PartListUnion`，这是一个可以包含 `Part` 对象（用于图像、音频等）和 `string` 的数组。这使得单次工具执行可以返回多个富内容项。

- **Tool Registry (`tool-registry.ts`)：** 一个类（`ToolRegistry`），负责：
  - **注册工具：** 管理所有可用的内置工具集合（例如 `ReadFileTool`、`ShellTool`）。
  - **发现工具：** 也可以动态发现工具：
    - **基于命令的发现：** 如果在设置中配置了 `toolDiscoveryCommand`，则会执行该命令。该命令应输出描述自定义工具的 JSON，然后这些工具会被注册为 `DiscoveredTool` 实例。
    - **基于 MCP 的发现：** 如果配置了 `mcpServerCommand`，Registry 可以连接到 Model Context Protocol (MCP) 服务器，列出并注册工具（`DiscoveredMCPTool`）。
  - **提供 Schema：** 向模型暴露所有已注册工具的 `FunctionDeclaration` schema，使模型知道有哪些工具以及如何使用它们。
  - **获取工具：** 允许核心逻辑通过名称获取特定工具以执行。

## 内置工具

core 包含一组预定义的工具，通常位于 `packages/core/src/tools/` 目录下。这些工具包括：

- **文件系统工具：**
  - `LSTool` (`ls.ts`)：列出目录内容。
  - `ReadFileTool` (`read-file.ts`)：读取单个文件的内容。它接受一个 `absolute_path` 参数，该参数必须是绝对路径。
  - `WriteFileTool` (`write-file.ts`)：将内容写入文件。
  - `GrepTool` (`grep.ts`)：在文件中搜索模式。
  - `GlobTool` (`glob.ts`)：查找匹配 glob 模式的文件。
  - `EditTool` (`edit.ts`)：对文件进行原地修改（通常需要确认）。
  - `ReadManyFilesTool` (`read-many-files.ts`)：从多个文件或 glob 模式中读取并连接内容（在 CLI 中由 `@` 命令使用）。
- **执行工具：**
  - `ShellTool` (`shell.ts`)：执行任意 shell 命令（需要仔细的沙箱处理和用户确认）。
- **Web 工具：**
  - `WebFetchTool` (`web-fetch.ts`)：从 URL 获取内容。
  - `WebSearchTool` (`web-search.ts`)：执行 Web 搜索。
- **内存工具：**
  - `MemoryTool` (`memoryTool.ts`)：与 AI 的记忆进行交互。

每个工具都继承自 `BaseTool` 并实现其特定功能所需的方法。

## 工具执行流程

1.  **模型请求：** 模型根据用户的 prompt 和提供的工具 schemas，决定使用某个工具，并在其响应中返回一个 `FunctionCall` 部分，指定工具名称和参数。
2.  **Core 接收请求：** Core 解析这个 `FunctionCall`。
3.  **工具查找：** Core 在 `ToolRegistry` 中查找请求的工具。
4.  **参数验证：** 调用该工具的 `validateToolParams()` 方法。
5.  **确认执行（如需要）：**
    - 调用该工具的 `shouldConfirmExecute()` 方法。
    - 如果该方法返回需要确认的详细信息，Core 会将这些信息传回 CLI，CLI 会提示用户确认。
    - 用户的决定（例如，继续、取消）会被发送回 Core。
6.  **执行工具：** 如果参数验证通过且用户已确认（或无需确认），Core 会调用该工具的 `execute()` 方法，传入参数和一个 `AbortSignal`（用于可能的取消操作）。
7.  **结果处理：** Core 接收来自 `execute()` 的 `ToolResult`。
8.  **响应模型：** 从 `ToolResult` 中提取 `llmContent`，封装为 `FunctionResponse` 并发送回模型，以便模型继续生成面向用户的响应。
9.  **展示给用户：** 从 `ToolResult` 中提取 `returnDisplay`，发送给 CLI 展示给用户，告知用户工具执行了什么操作。

## 通过自定义工具扩展

虽然在提供的文档中并未明确将用户直接以编程方式注册新工具作为典型终端用户的主要工作流程，但架构本身支持以下扩展方式：

- **基于命令的发现机制（Command-based Discovery）：** 高级用户或项目管理员可以在 `settings.json` 中定义一个 `toolDiscoveryCommand`。当核心模块运行该命令时，它应输出一个包含 `FunctionDeclaration` 对象的 JSON 数组。核心模块会将这些函数声明作为 `DiscoveredTool` 实例提供使用。而对应的 `toolCallCommand` 则负责实际执行这些自定义工具。

- **MCP Server（模型控制协议服务器）：** 在更复杂的场景下，可以设置并配置一个或多个 MCP 服务器，通过 `settings.json` 中的 `mcpServers` 配置项进行管理。核心模块能够自动发现并使用这些服务器暴露的工具。如前所述，如果你有多个 MCP 服务器，工具名称将会被加上配置中的服务器别名前缀（例如：`serverAlias__actualToolName`）。

这套工具系统为增强模型能力提供了灵活且强大的方式，使 Qwen Code 成为适用于各种任务的多功能助手。