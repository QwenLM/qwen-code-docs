# Qwen Code Companion 插件：接口规范

> 最后更新：2025 年 9 月 15 日

本文档定义了构建 companion 插件以启用 Qwen Code 的 IDE 模式的契约。对于 VS Code，这些功能（原生差异对比、上下文感知）由官方扩展提供（[marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）。本规范面向希望为 JetBrains IDEs、Sublime Text 等其他编辑器带来类似功能的贡献者。

## I. 通信接口

Qwen Code 和 IDE 插件通过本地通信通道进行通信。

### 1. 传输层：基于 HTTP 的 MCP

插件 **必须** 运行一个本地 HTTP 服务器，该服务器实现 **模型上下文协议（MCP）**。

- **协议：** 服务器必须是一个有效的 MCP 服务器。我们建议优先使用你所用语言的现有 MCP SDK（如果可用）。
- **端点：** 服务器应暴露一个单一的端点（例如 `/mcp`）用于所有 MCP 通信。
- **端口：** 服务器 **必须** 监听一个动态分配的端口（即监听端口 `0`）。

### 2. 发现机制：锁定文件

为了让 Qwen Code 能够连接，它需要发现你的服务器正在使用的端口。插件 **必须** 通过创建“锁定文件”并设置端口环境变量来协助这一过程。

- **CLI 如何找到该文件：** CLI 从 `QWEN_CODE_IDE_SERVER_PORT` 中读取端口，然后读取 `~/.qwen/ide/<PORT>.lock`。（旧版扩展存在后备机制；请参阅下面的说明。）
- **文件位置：** 文件必须创建在指定目录中：`~/.qwen/ide/`。如果该目录不存在，你的插件必须创建它。
- **文件命名约定：** 文件名至关重要，并且 **必须** 遵循以下模式：
  `<PORT>.lock`
  - `<PORT>`：你的 MCP 服务器正在监听的端口。
- **文件内容与工作区验证：** 文件 **必须** 包含一个具有以下结构的 JSON 对象：

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
  - `workspacePath`（字符串，必需）：所有打开的工作区根目录路径的列表，由操作系统特定的路径分隔符分隔（Linux/macOS 上为 `:`，Windows 上为 `;`）。CLI 使用此路径来确保自身运行在与 IDE 中打开的同一个项目文件夹中。如果 CLI 的当前工作目录不是 `workspacePath` 的子目录，则连接将被拒绝。你的插件 **必须** 提供正确的、打开的工作区根目录的绝对路径。
  - `authToken`（字符串，必需）：用于保护连接安全的秘密令牌。CLI 将在所有请求的 `Authorization: Bearer <token>` 头部中包含此令牌。
  - `ppid`（数字，必需）：IDE 进程的父进程 ID。
  - `ideName`（字符串，必需）：IDE 的友好名称（例如 `VS Code`、`JetBrains IDE`）。

- **身份验证：** 为了保护连接安全，插件 **必须** 生成一个唯一的秘密令牌并将其包含在发现文件中。然后 CLI 会在所有对 MCP 服务器的请求的 `Authorization` 头部中包含此令牌（例如 `Authorization: Bearer a-very-secret-token`）。你的服务器 **必须** 在每次请求时验证此令牌，并拒绝任何未授权的请求。
- **环境变量（必需）：** 你的插件 **必须** 在集成终端中设置 `QWEN_CODE_IDE_SERVER_PORT`，以便 CLI 能够定位正确的 `<PORT>.lock` 文件。

**旧版说明：** 对于版本低于 v0.5.1 的扩展，Qwen Code 可能会回退到读取系统临时目录中名为 `qwen-code-ide-server-<PID>.json` 或 `qwen-code-ide-server-<PORT>.json` 的 JSON 文件。新的集成不应依赖这些旧版文件。

## II. 上下文接口

为了启用上下文感知能力，插件 **可以** 向 CLI 提供有关用户在 IDE 中活动的实时信息。

### `ide/contextUpdate` 通知

当用户上下文发生变化时，插件 **可以** 向 CLI 发送一个 `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)。

- **触发事件：** 当以下情况发生时，应发送此通知（建议进行 50ms 的去抖处理）：
  - 文件被打开、关闭或获得焦点。
  - 活动文件中用户的光标位置或文本选择发生变化。
- **载荷（`IdeContext`）：** 通知参数 **必须** 是一个 `IdeContext` 对象：

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
      // 基于 1 的行号
      line: number;
      // 基于 1 的字符号
      character: number;
    };
    // 用户当前选中的文本
    selectedText?: string;
  }
  ```

  **注意：** `openFiles` 列表应只包含存在于磁盘上的文件。虚拟文件（例如未保存且没有路径的文件、编辑器设置页面）**必须** 排除在外。

### CLI 如何使用此上下文

在接收到 `IdeContext` 对象后，CLI 在将信息发送给模型之前会执行若干规范化与截断步骤。

- **文件排序：** CLI 使用 `timestamp` 字段来确定最近使用的文件。它根据此值对 `openFiles` 列表进行排序。因此，你的插件 **必须** 提供文件最后一次获得焦点的准确 Unix 时间戳。
- **活动文件：** CLI 仅将（排序后的）最近的文件视为“活动”文件。它将忽略所有其他文件的 `isActive` 标志，并清除它们的 `cursor` 和 `selectedText` 字段。你的插件应专注于仅为当前获得焦点的文件设置 `isActive: true` 并提供光标/选择详情。
- **截断：** 为了管理令牌限制，CLI 会截断文件列表（最多 10 个文件）和 `selectedText`（最多 16KB）。

虽然 CLI 负责最终的截断，但强烈建议你的插件也限制其发送的上下文数量。

## III. 差异对比接口

为了启用交互式代码修改，插件 **可以** 暴露出一个差异对比接口。这允许 CLI 请求 IDE 打开一个差异视图，展示对文件的建议更改。然后用户可以直接在 IDE 中审阅、编辑、最终接受或拒绝这些更改。

### `openDiff` 工具

插件 **必须** 在其 MCP 服务器上注册一个 `openDiff` 工具。

- **描述：** 此工具指示 IDE 为特定文件打开一个可修改的差异视图。
- **请求（`OpenDiffRequest`）：** 通过 `tools/call` 请求调用该工具。请求 `params` 中的 `arguments` 字段 **必须** 是一个 `OpenDiffRequest` 对象。

  ```typescript
  interface OpenDiffRequest {
    // 要对比的文件的绝对路径。
    filePath: string;
    // 文件的建议新内容。
    newContent: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具 **必须** 立即返回一个 `CallToolResult` 以确认请求并报告差异视图是否成功打开。
  - 成功时：如果差异视图已成功打开，响应 **必须** 包含空内容（即 `content: []`）。
  - 失败时：如果发生错误导致差异视图无法打开，响应 **必须** 设置 `isError: true`，并在 `content` 数组中包含一个描述错误的 `TextContent` 块。

  差异的实际结果（接受或拒绝）通过通知异步通信。

### `closeDiff` 工具

插件 **必须** 在其 MCP 服务器上注册一个 `closeDiff` 工具。

- **描述：** 此工具指示 IDE 关闭特定文件的打开差异视图。
- **请求（`CloseDiffRequest`）：** 通过 `tools/call` 请求调用该工具。请求 `params` 中的 `arguments` 字段 **必须** 是一个 `CloseDiffRequest` 对象。

  ```typescript
  interface CloseDiffRequest {
    // 应关闭差异视图的文件的绝对路径。
    filePath: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具 **必须** 返回一个 `CallToolResult`。
  - 成功时：如果差异视图已成功关闭，响应 **必须** 在内容数组中包含单个 **TextContent** 块，其中包含关闭前文件的最终内容。
  - 失败时：如果发生错误导致差异视图无法关闭，响应 **必须** 设置 `isError: true`，并在 `content` 数组中包含一个描述错误的 `TextContent` 块。

### `ide/diffAccepted` 通知

当用户接受差异视图中的更改时（例如通过点击“应用”或“保存”按钮），插件 **必须** 向 CLI 发送一个 `ide/diffAccepted` 通知。

- **载荷：** 通知参数 **必须** 包含文件路径和文件的最终内容。如果用户在差异视图中进行了手动编辑，该内容可能与原始的 `newContent` 不同。

  ```typescript
  {
    // 被对比的文件的绝对路径。
    filePath: string;
    // 接受后文件的完整内容。
    content: string;
  }
  ```

### `ide/diffRejected` 通知

当用户拒绝更改时（例如关闭差异视图而不接受），插件 **必须** 向 CLI 发送一个 `ide/diffRejected` 通知。

- **载荷：** 通知参数 **必须** 包含被拒绝差异的文件路径。

  ```typescript
  {
    // 被对比的文件的绝对路径。
    filePath: string;
  }
  ```

## IV. 生命周期接口

插件 **必须** 根据 IDE 的生命周期正确管理其资源和发现文件。

- **激活时（IDE 启动/插件启用）：**
  1.  启动 MCP 服务器。
  2.  创建发现文件。
- **停用时（IDE 关闭/插件禁用）：**
  1.  停止 MCP 服务器。
  2.  删除发现文件。