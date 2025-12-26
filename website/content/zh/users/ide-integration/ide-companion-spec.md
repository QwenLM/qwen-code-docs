# Qwen Code Companion 插件：接口规范

> 最后更新：2025年9月15日

本文档定义了构建 companion 插件以启用 Qwen Code IDE 模式的契约。对于 VS Code，这些功能（原生 diff、上下文感知）由官方扩展提供（[市场](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）。本规范适用于希望将类似功能带到其他编辑器（如 JetBrains IDE、Sublime Text 等）的贡献者。

## I. 通信接口

Qwen Code 和 IDE 插件通过本地通信通道进行通信。

### 1. 传输层：HTTP 上的 MCP

插件**必须**运行一个实现**模型上下文协议 (MCP)** 的本地 HTTP 服务器。

- **协议：** 服务器必须是一个有效的 MCP 服务器。我们建议使用你所选择语言的现有 MCP SDK（如果可用）。
- **端点：** 服务器应该为所有 MCP 通信暴露一个单一端点（例如 `/mcp`）。
- **端口：** 服务器**必须**监听一个动态分配的端口（即监听端口 `0`）。

### 2. 发现机制：锁文件

为了让 Qwen Code 连接，它需要发现你的服务器正在使用的端口。插件**必须**通过创建"锁文件"并设置端口环境变量来实现此功能。

- **CLI 如何查找文件：** CLI 从 `QWEN_CODE_IDE_SERVER_PORT` 读取端口，然后读取 `~/.qwen/ide/<PORT>.lock`。（旧版扩展存在回退机制；参见下面的注释。）
- **文件位置：** 文件必须创建在特定目录中：`~/.qwen/ide/`。如果目录不存在，你的插件必须创建此目录。
- **文件命名约定：** 文件名很关键，**必须**遵循以下模式：
  `<PORT>.lock`
  - `<PORT>`：你的 MCP 服务器监听的端口。
- **文件内容和工作区验证：** 文件**必须**包含具有以下结构的 JSON 对象：

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port`（数字，必需）：MCP 服务器的端口。
  - `workspacePath`（字符串，必需）：所有打开的工作区根路径的列表，用操作系统特定的路径分隔符分隔（Linux/macOS 用 `:`，Windows 用 `;`）。CLI 使用此路径确保它在 IDE 中打开的同一项目文件夹中运行。如果 CLI 的当前工作目录不是 `workspacePath` 的子目录，则连接将被拒绝。你的插件**必须**提供正确、绝对的路径到打开的工作区根目录。
  - `authToken`（字符串，必需）：用于保护连接的密钥令牌。CLI 将在所有请求的 `Authorization: Bearer <token>` 头中包含此令牌。
  - `ppid`（数字，必需）：IDE 进程的父进程 ID。
  - `ideName`（字符串，必需）：IDE 的用户友好名称（例如 `VS Code`、`JetBrains IDE`）。

- **身份验证：** 为了保护连接安全，插件**必须**生成一个唯一、私密的令牌并将其包含在发现文件中。然后 CLI 将在对 MCP 服务器的所有请求中包含此令牌到 `Authorization` 头中（例如 `Authorization: Bearer a-very-secret-token`）。你的服务器**必须**在每个请求上验证此令牌，并拒绝任何未授权的请求。
- **环境变量（必需）：** 你的插件**必须**在集成终端中设置 `QWEN_CODE_IDE_SERVER_PORT`，以便 CLI 能够定位正确的 `<PORT>.lock` 文件。

**旧版说明：** 对于早于 v0.5.1 的扩展，Qwen Code 可能会回退到读取系统临时目录中名为 `qwen-code-ide-server-<PID>.json` 或 `qwen-code-ide-server-<PORT>.json` 的 JSON 文件。新的集成不应依赖这些旧版文件。

## II. 上下文接口

为了实现上下文感知，插件**可以**向 CLI 提供关于用户在 IDE 中活动的实时信息。

### `ide/contextUpdate` 通知

每当用户的上下文发生变化时，插件**可以**向 CLI 发送一个 `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)。

- **触发事件：** 当以下情况发生时（建议使用 50ms 的防抖），应发送此通知：
  - 文件被打开、关闭或获得焦点。
  - 活动文件中的光标位置或文本选择发生变化。
- **载荷 (`IdeContext`)：** 通知参数**必须**是一个 `IdeContext` 对象：

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // 文件的绝对路径
    path: string;
    // 最后获得焦点的 Unix 时间戳（用于排序）
    timestamp: number;
    // 如果这是当前获得焦点的文件，则为 true
    isActive?: boolean;
    cursor?: {
      // 1-based 行号
      line: number;
      // 1-based 字符号
      character: number;
    };
    // 用户当前选择的文本
    selectedText?: string;
  }
  ```

  **注意：** `openFiles` 列表应仅包含磁盘上存在的文件。虚拟文件（例如，没有路径的未保存文件、编辑器设置页面）**必须**排除在外。

### CLI 如何使用此上下文

在接收到 `IdeContext` 对象后，CLI 会在将信息发送给模型之前执行几个标准化和截断步骤。

- **文件排序：** CLI 使用 `timestamp` 字段来确定最近使用的文件。它会根据此值对 `openFiles` 列表进行排序。因此，你的插件**必须**提供文件最后聚焦时的准确 Unix 时间戳。
- **活动文件：** CLI 只将最新文件（排序后）视为"活动"文件。它会忽略所有其他文件上的 `isActive` 标志，并清除它们的 `cursor` 和 `selectedText` 字段。你的插件应该专注于为当前聚焦的文件设置 `isActive: true` 并提供光标/选择详情。
- **截断：** 为了管理 token 限制，CLI 会截断文件列表（限制为 10 个文件）和 `selectedText`（限制为 16KB）。

虽然 CLI 会处理最终的截断，但强烈建议你的插件也限制发送的上下文数量。

## III. 差异比较接口

为了支持交互式代码修改，插件**可以**暴露一个差异比较接口。这允许 CLI 请求 IDE 打开一个差异视图，显示对文件的建议更改。然后用户可以在 IDE 中直接审查、编辑并最终接受或拒绝这些更改。

### `openDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `openDiff` 工具。

- **描述：** 该工具指示 IDE 为特定文件打开一个可修改的 diff 视图。
- **请求（`OpenDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求的 `params` 中的 `arguments` 字段**必须**是一个 `OpenDiffRequest` 对象。

  ```typescript
  interface OpenDiffRequest {
    // 要进行 diff 的文件的绝对路径。
    filePath: string;
    // 文件的建议新内容。
    newContent: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具**必须**立即返回一个 `CallToolResult` 来确认请求并报告 diff 视图是否成功打开。
  - 成功时：如果 diff 视图成功打开，响应**必须**包含空内容（即 `content: []`）。
  - 失败时：如果错误导致 diff 视图无法打开，响应**必须**设置 `isError: true` 并在 `content` 数组中包含一个 `TextContent` 块来描述错误。

  diff 的实际结果（接受或拒绝）通过通知异步传达。

### `closeDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `closeDiff` 工具。

- **描述：** 该工具指示 IDE 关闭特定文件的打开的差异视图。
- **请求（`CloseDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求的 `params` 中的 `arguments` 字段**必须**是一个 `CloseDiffRequest` 对象。

  ```typescript
  interface CloseDiffRequest {
    // 应关闭差异视图的文件的绝对路径。
    filePath: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具**必须**返回一个 `CallToolResult`。
  - 成功时：如果差异视图成功关闭，响应**必须**在内容数组中包含一个 **TextContent** 块，包含关闭前文件的最终内容。
  - 失败时：如果错误导致差异视图无法关闭，响应**必须**设置 `isError: true` 并在 `content` 数组中包含一个 `TextContent` 块来描述错误。

### `ide/diffAccepted` 通知

当用户在差异视图中接受更改时（例如，通过点击“应用”或“保存”按钮），插件**必须**向 CLI 发送 `ide/diffAccepted` 通知。

- **载荷：** 通知参数**必须**包含文件路径和文件的最终内容。如果用户在差异视图中进行了手动编辑，内容可能与原始的 `newContent` 不同。

  ```typescript
  {
    // 被比较文件的绝对路径。
    filePath: string;
    // 接受后的文件完整内容。
    content: string;
  }
  ```

### `ide/diffRejected` 通知

当用户拒绝更改时（例如，关闭差异视图而不接受），插件**必须**向 CLI 发送 `ide/diffRejected` 通知。

- **载荷：** 通知参数**必须**包含被拒绝差异的文件路径。

  ```typescript
  {
    // 被比较文件的绝对路径。
    filePath: string;
  }
  ```

## IV. 生命周期接口

插件**必须**根据 IDE 的生命周期正确管理其资源和发现文件。

- **激活时（IDE 启动/插件启用）：**
  1.  启动 MCP 服务器。
  2.  创建发现文件。
- **停用时（IDE 关闭/插件禁用）：**
  1.  停止 MCP 服务器。
  2.  删除发现文件。