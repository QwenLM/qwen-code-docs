# Qwen Code Companion Plugin：接口规范

> 最后更新：2025年9月15日

本文档定义了构建 companion plugin 的契约，用于启用 Qwen Code 的 IDE 模式。对于 VS Code，这些功能（原生 diff、上下文感知）由官方扩展提供（[marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）。本规范适用于希望为其他编辑器（如 JetBrains IDE、Sublime Text 等）带来类似功能的贡献者。

## 一、通信接口

Qwen Code 与 IDE plugin 通过本地通信通道进行通信。

### 1. 传输层：基于 HTTP 的 MCP

插件**必须**运行一个本地 HTTP 服务器来实现 **Model Context Protocol (MCP)**。

- **协议：** 该服务器必须是一个有效的 MCP 服务器。如果已有适用于你所选语言的 MCP SDK，我们建议直接使用。
- **端点：** 服务器应暴露一个统一的端点（例如 `/mcp`）用于所有 MCP 通信。
- **端口：** 服务器**必须**监听动态分配的端口（即监听端口 `0`）。

### 2. 发现机制：端口文件

为了让 Qwen Code 能够连接成功，它需要能够发现当前运行所在的 IDE 实例以及你的 server 使用的端口。插件**必须**通过创建一个“发现文件”（discovery file）来协助完成这一过程。

- **CLI 如何找到该文件：** CLI 会通过遍历进程树来确定其所在 IDE 的进程 ID（PID），然后查找文件名中包含此 PID 的发现文件。
- **文件位置：** 文件必须创建在特定目录下：`os.tmpdir()/qwen/ide/`。如果该目录不存在，你的插件必须负责创建它。
- **文件命名规范：** 文件名非常关键，**必须**遵循以下格式：
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}`：父级 IDE 进程的进程 ID。你的插件必须获取并将其包含在文件名中。
  - `${PORT}`：你的 MCP server 正在监听的端口号。
- **文件内容与工作区验证：** 文件**必须**包含一个具有如下结构的 JSON 对象：

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port`（number，必填）：MCP server 的端口号。
  - `workspacePath`（string，必填）：所有打开的工作区根路径列表，使用操作系统特定的路径分隔符分隔（Linux/macOS 用 `:`，Windows 用 `;`）。CLI 会使用这个路径来确保它运行在与 IDE 中打开的项目相同的文件夹中。如果 CLI 的当前工作目录不是 `workspacePath` 的子目录，则连接将被拒绝。你的插件**必须**提供正确的、绝对的打开工作区根路径。
  - `authToken`（string，必填）：用于安全连接的密钥 token。CLI 会在所有请求中通过 `Authorization: Bearer <token>` header 携带此 token。
  - `ideInfo`（object，必填）：关于 IDE 的信息。
    - `name`（string，必填）：IDE 的简短小写标识符（例如 `vscode`、`jetbrains`）。
    - `displayName`（string，必填）：用户友好的 IDE 名称（例如 `VS Code`、`JetBrains IDE`）。

- **身份验证：** 为了保证连接安全，插件**必须**生成一个唯一的密钥 token，并将其写入发现文件中。CLI 会在所有发往 MCP server 的请求中通过 `Authorization` header 携带这个 token（例如 `Authorization: Bearer a-very-secret-token`）。你的 server **必须**在每次请求时验证该 token，拒绝未授权的请求。
- **环境变量用于冲突解决（推荐）：** 为了获得最可靠的体验，你的插件**应该**既创建发现文件，又在集成终端中设置 `QWEN_CODE_IDE_SERVER_PORT` 环境变量。文件作为主要的发现机制，而环境变量则对解决冲突至关重要。如果用户为同一工作区打开了多个 IDE 窗口，CLI 会使用 `QWEN_CODE_IDE_SERVER_PORT` 变量识别并连接到正确窗口的 server。

## II. Context Interface

为了实现上下文感知，插件**可以**向 CLI 提供有关用户在 IDE 中活动的实时信息。

### `ide/contextUpdate` 通知

当用户的上下文发生变化时，插件**可以**向 CLI 发送一个 `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)。

- **触发事件：** 在以下情况下应发送此通知（建议防抖时间为 50ms）：
  - 文件被打开、关闭或获得焦点。
  - 用户在当前活动文件中的光标位置或文本选择发生变化。
- **负载（`IdeContext`）：** 通知参数**必须**是一个 `IdeContext` 对象：

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
    // 最后一次获得焦点的时间戳（用于排序）
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

  **注意：** `openFiles` 列表应仅包含磁盘上存在的文件。虚拟文件（例如未保存且没有路径的文件、编辑器设置页面）**必须**被排除在外。

### CLI 如何使用此上下文

在接收到 `IdeContext` 对象后，CLI 会在将信息发送给模型之前执行几个标准化和截断步骤。

- **文件排序：** CLI 使用 `timestamp` 字段来确定最近使用的文件。它会根据这个值对 `openFiles` 列表进行排序。因此，你的插件 **必须** 为文件最后获得焦点的时间提供准确的 Unix 时间戳。
- **活动文件：** CLI 只将排序后的最新文件视为 "active" 文件。它会忽略所有其他文件上的 `isActive` 标志，并清除它们的 `cursor` 和 `selectedText` 字段。你的插件应专注于为当前聚焦的文件设置 `isActive: true` 并提供光标/选中文本的详细信息。
- **截断：** 为了管理 token 限制，CLI 会对文件列表（限制为 10 个文件）和 `selectedText`（限制为 16KB）进行截断。

虽然 CLI 会处理最终的截断，但强烈建议你的插件也限制发送的上下文数量。

## III. Diffing Interface

为了支持交互式代码修改，插件**可以**暴露一个 diffing interface。这允许 CLI 请求 IDE 打开一个 diff 视图，展示对文件的建议修改。用户可以直接在 IDE 中查看、编辑，并最终接受或拒绝这些修改。

### `openDiff` Tool

插件**必须**在其 MCP server 上注册一个 `openDiff` tool。

- **Description:** 该 tool 用于指示 IDE 为指定文件打开一个可修改的 diff 视图。
- **Request (`OpenDiffRequest`):** 该 tool 通过 `tools/call` 请求调用。请求参数中的 `arguments` 字段**必须**是一个 `OpenDiffRequest` 对象。

  ```typescript
  interface OpenDiffRequest {
    // 需要进行 diff 的文件的绝对路径。
    filePath: string;
    // 文件的新内容建议。
    newContent: string;
  }
  ```

- **Response (`CallToolResult`):** 该 tool **必须**立即返回一个 `CallToolResult` 以确认收到请求，并报告 diff 视图是否成功打开。
  - 成功时：如果 diff 视图成功打开，响应中**必须**包含空内容（即 `content: []`）。
  - 失败时：如果因错误导致无法打开 diff 视图，响应中**必须**设置 `isError: true`，并在 `content` 数组中包含一个描述错误的 `TextContent` 块。

  diff 的实际结果（接受或拒绝）将通过异步通知的方式进行通信。

### `closeDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `closeDiff` 工具。

- **描述：** 此工具用于指示 IDE 关闭指定文件的 diff 视图。
- **请求（`CloseDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求参数中的 `arguments` 字段**必须**是一个 `CloseDiffRequest` 对象。

  ```typescript
  interface CloseDiffRequest {
    // 需要关闭 diff 视图的文件绝对路径
    filePath: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具**必须**返回一个 `CallToolResult`。
  - 成功时：如果 diff 视图成功关闭，响应中**必须**在 content 数组内包含一个 **TextContent** 块，内容为关闭前该文件的最终内容。
  - 失败时：如果因错误导致无法关闭 diff 视图，响应中**必须**设置 `isError: true`，并在 `content` 数组中包含一个描述错误信息的 `TextContent` 块。

### `ide/diffAccepted` 通知

当用户在 diff 视图中接受更改（例如点击“Apply”或“Save”按钮）时，插件**必须**向 CLI 发送一个 `ide/diffAccepted` 通知。

- **Payload：** 通知参数**必须**包含文件路径和文件的最终内容。如果用户在 diff 视图中进行了手动编辑，该内容可能与原始的 `newContent` 不同。

  ```typescript
  {
    // 被 diff 的文件的绝对路径。
    filePath: string;
    // 接受更改后文件的完整内容。
    content: string;
  }
  ```

### `ide/diffRejected` 通知

当用户拒绝更改（例如关闭 diff 视图而不接受更改）时，插件**必须**向 CLI 发送一个 `ide/diffRejected` 通知。

- **Payload：** 通知参数**必须**包含被拒绝 diff 的文件路径。

  ```typescript
  {
    // 被 diff 的文件的绝对路径。
    filePath: string;
  }
  ```

## IV. 生命周期接口

插件**必须**根据 IDE 的生命周期正确管理其资源和 discovery 文件。

- **激活时（IDE 启动/插件启用）：**
  1. 启动 MCP server。
  2. 创建 discovery 文件。
- **停用时（IDE 关闭/插件禁用）：**
  1. 停止 MCP server。
  2. 删除 discovery 文件。