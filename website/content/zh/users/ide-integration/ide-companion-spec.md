# Qwen Code Companion Plugin：接口规范

> 最后更新：2025 年 9 月 15 日

本文档定义了构建配套插件以启用 Qwen Code IDE 模式的接口契约。对于 VS Code，这些功能（原生 diff、上下文感知）由官方扩展提供（[marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）。本规范面向希望为 JetBrains IDE、Sublime Text 等其他编辑器提供类似功能的贡献者。

## I. 通信接口

Qwen Code 与 IDE 插件通过本地通信通道进行交互。

### 1. 传输层：基于 HTTP 的 MCP

插件**必须**运行一个实现了 **Model Context Protocol (MCP)** 的本地 HTTP 服务器。

- **协议：** 服务器必须是有效的 MCP 服务器。如果可用，我们建议使用你所选语言的现有 MCP SDK。
- **端点：** 服务器应暴露单个端点（例如 `/mcp`）用于所有 MCP 通信。
- **端口：** 服务器**必须**监听动态分配的端口（即监听端口 `0`）。

### 2. 发现机制：Lock File

为了让 Qwen Code 建立连接，它需要发现你的服务器正在使用的端口。插件**必须**通过创建“lock file”并设置端口环境变量来实现这一点。

- **CLI 如何查找文件：** CLI 从 `QWEN_CODE_IDE_SERVER_PORT` 读取端口，然后读取 `~/.qwen/ide/<PORT>.lock`。（旧版扩展存在回退机制；见下方说明。）
- **文件位置：** 文件必须创建在特定目录：`~/.qwen/ide/`。如果该目录不存在，你的插件必须创建它。
- **文件命名规范：** 文件名至关重要，且**必须**遵循以下模式：
  `<PORT>.lock`
  - `<PORT>`：你的 MCP 服务器正在监听的端口。
- **文件内容与工作区验证：** 文件**必须**包含具有以下结构的 JSON 对象：

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port`（数字，必填）：MCP 服务器的端口。
  - `workspacePath`（字符串，必填）：所有已打开工作区根路径的列表，使用操作系统特定的路径分隔符分隔（Linux/macOS 为 `:`，Windows 为 `;`）。CLI 使用此路径来确保它运行在 IDE 中打开的同一项目文件夹内。如果 CLI 的当前工作目录不是 `workspacePath` 的子目录，连接将被拒绝。你的插件**必须**提供已打开工作区根目录的正确绝对路径。
  - `authToken`（字符串，必填）：用于保护连接安全的密钥 token。CLI 会在所有请求的 `Authorization: Bearer <token>` 头中包含此 token。
  - `ppid`（数字，必填）：IDE 进程的父进程 ID。
  - `ideName`（字符串，必填）：IDE 的用户友好名称（例如 `VS Code`、`JetBrains IDE`）。

- **身份验证：** 为确保连接安全，插件**必须**生成一个唯一的密钥 token 并将其包含在发现文件中。随后，CLI 会在向 MCP 服务器发送的所有请求的 `Authorization` 头中包含此 token（例如 `Authorization: Bearer a-very-secret-token`）。你的服务器**必须**在每个请求中验证此 token，并拒绝任何未授权的请求。
- **环境变量（必填）：** 你的插件**必须**在集成终端中设置 `QWEN_CODE_IDE_SERVER_PORT`，以便 CLI 能够定位到正确的 `<PORT>.lock` 文件。

**旧版说明：** 对于 v0.5.1 之前的扩展，Qwen Code 可能会回退读取系统临时目录中名为 `qwen-code-ide-server-<PID>.json` 或 `qwen-code-ide-server-<PORT>.json` 的 JSON 文件。新集成不应依赖这些旧版文件。

## II. 上下文接口

为实现上下文感知，插件**可以**向 CLI 提供用户在 IDE 中活动的实时信息。

### `ide/contextUpdate` 通知

每当用户上下文发生变化时，插件**可以**向 CLI 发送 `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)。

- **触发事件：** 应在以下情况发送此通知（建议防抖 50ms）：
  - 文件被打开、关闭或获得焦点。
  - 用户在活动文件中的光标位置或文本选区发生变化。
- **载荷（`IdeContext`）：** 通知参数**必须**是一个 `IdeContext` 对象：

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absolute path to the file
    path: string;
    // Last focused Unix timestamp (for ordering)
    timestamp: number;
    // True if this is the currently focused file
    isActive?: boolean;
    cursor?: {
      // 1-based line number
      line: number;
      // 1-based character number
      character: number;
    };
    // The text currently selected by the user
    selectedText?: string;
  }
  ```

  **注意：** `openFiles` 列表应仅包含磁盘上实际存在的文件。虚拟文件（例如没有路径的未保存文件、编辑器设置页面）**必须**被排除。

### CLI 如何使用此上下文

接收到 `IdeContext` 对象后，CLI 会在将信息发送给模型之前执行若干标准化和截断步骤。

- **文件排序：** CLI 使用 `timestamp` 字段来确定最近使用的文件。它会根据该值对 `openFiles` 列表进行排序。因此，你的插件**必须**提供文件最后一次获得焦点时的准确 Unix 时间戳。
- **活动文件：** CLI 仅将排序后最新的文件视为“活动”文件。它会忽略其他所有文件的 `isActive` 标志，并清空它们的 `cursor` 和 `selectedText` 字段。你的插件应专注于仅为当前获得焦点的文件设置 `isActive: true` 并提供光标/选区详情。
- **截断：** 为控制 token 限制，CLI 会截断文件列表（最多 10 个文件）和 `selectedText`（最多 16KB）。

尽管 CLI 会处理最终的截断，但仍强烈建议你的插件也限制发送的上下文数据量。

## III. Diff 接口

为支持交互式代码修改，插件**可以**暴露一个 diff 接口。这允许 CLI 请求 IDE 打开 diff 视图，以展示对文件的建议更改。用户随后可以在 IDE 内直接审查、编辑，并最终接受或拒绝这些更改。

### `openDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `openDiff` 工具。

- **描述：** 此工具指示 IDE 为指定文件打开一个可编辑的 diff 视图。
- **请求（`OpenDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求 `params` 中的 `arguments` 字段**必须**是一个 `OpenDiffRequest` 对象。

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **响应（`CallToolResult`）：** 工具**必须**立即返回 `CallToolResult` 以确认请求，并报告 diff 视图是否成功打开。
  - 成功时：如果 diff 视图成功打开，响应**必须**包含空内容（即 `content: []`）。
  - 失败时：如果发生错误导致 diff 视图无法打开，响应**必须**设置 `isError: true`，并在 `content` 数组中包含一个描述错误的 `TextContent` 块。

  diff 的实际结果（接受或拒绝）将通过通知异步传达。

### `closeDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `closeDiff` 工具。

- **描述：** 此工具指示 IDE 关闭指定文件的已打开 diff 视图。
- **请求（`CloseDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求 `params` 中的 `arguments` 字段**必须**是一个 `CloseDiffRequest` 对象。

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **响应（`CallToolResult`）：** 工具**必须**返回 `CallToolResult`。
  - 成功时：如果 diff 视图成功关闭，响应**必须**在 content 数组中包含一个 **TextContent** 块，其中包含关闭前文件的最终内容。
  - 失败时：如果发生错误导致 diff 视图无法关闭，响应**必须**设置 `isError: true`，并在 `content` 数组中包含一个描述错误的 `TextContent` 块。

### `ide/diffAccepted` 通知

当用户在 diff 视图中接受更改（例如点击“应用”或“保存”按钮）时，插件**必须**向 CLI 发送 `ide/diffAccepted` 通知。

- **载荷：** 通知参数**必须**包含文件路径和文件的最终内容。如果用户在 diff 视图中进行了手动编辑，内容可能与原始的 `newContent` 不同。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### `ide/diffRejected` 通知

当用户拒绝更改（例如未接受直接关闭 diff 视图）时，插件**必须**向 CLI 发送 `ide/diffRejected` 通知。

- **载荷：** 通知参数**必须**包含被拒绝 diff 的文件路径。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. 生命周期接口

插件**必须**根据 IDE 的生命周期正确管理其资源和发现文件。

- **激活时（IDE 启动/插件启用）：**
  1. 启动 MCP 服务器。
  2. 创建发现文件。
- **停用时（IDE 关闭/插件禁用）：**
  1. 停止 MCP 服务器。
  2. 删除发现文件。