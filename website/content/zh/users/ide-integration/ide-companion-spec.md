# Qwen Code Companion 插件：接口规范

> 最后更新时间：2025 年 9 月 15 日

本文档定义了构建 Companion 插件的契约，以启用 Qwen Code 的 IDE 模式。对于 VS Code，相关功能（如原生差异比对、上下文感知）由官方扩展提供（[市场页面](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）。本规范面向希望将类似功能引入其他编辑器（如 JetBrains IDE、Sublime Text 等）的贡献者。

## I. 通信接口

Qwen Code 与 IDE 插件通过本地通信通道进行交互。

### 1. 传输层：基于 HTTP 的 MCP

插件 **必须** 运行一个实现 **模型上下文协议（MCP）** 的本地 HTTP 服务器。

- **协议**：该服务器必须是一个有效的 MCP 服务器。我们建议，如果已有适用于您所选编程语言的 MCP SDK，请优先使用。
- **端点**：服务器应暴露一个单一端点（例如 `/mcp`），用于所有 MCP 通信。
- **端口**：服务器 **必须** 监听动态分配的端口（即监听端口 `0`）。

### 2. 发现机制：锁文件

Qwen Code 要建立连接，需先确定你的服务器正在使用的端口。插件 **必须** 通过创建一个“锁文件”并设置端口环境变量来实现该发现过程。

- **CLI 如何查找该文件：** CLI 首先从环境变量 `QWEN_CODE_IDE_SERVER_PORT` 中读取端口号，然后读取文件 `~/.qwen/ide/<PORT>.lock`。（旧版扩展存在兼容性回退机制；详见下方说明。）
- **文件位置：** 文件必须创建在特定目录中：`~/.qwen/ide/`。若该目录不存在，你的插件必须自行创建。
- **文件命名规范：** 文件名至关重要，**必须** 严格遵循如下格式：
  `<PORT>.lock`
  - `<PORT>`：你的 MCP 服务器所监听的端口号。
- **文件内容与工作区校验：** 文件 **必须** 包含一个符合以下结构的 JSON 对象：

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port`（数字类型，必填）：MCP 服务器的端口号。
  - `workspacePath`（字符串类型，必填）：所有已打开工作区根路径的列表，各路径之间使用操作系统特定的路径分隔符分隔（Linux/macOS 使用 `:`，Windows 使用 `;`）。CLI 利用该路径确保自身运行在 IDE 当前打开的同一项目目录下。若 CLI 当前工作目录不是 `workspacePath` 中任一路径的子目录，则连接将被拒绝。你的插件 **必须** 提供正确、绝对的已打开工作区根路径。
  - `authToken`（字符串类型，必填）：用于保障连接安全的密钥令牌。CLI 将在所有请求的 `Authorization: Bearer <token>` 请求头中携带该令牌。
  - `ppid`（数字类型，必填）：IDE 进程的父进程 ID。
  - `ideName`（字符串类型，必填）：IDE 的用户友好名称（例如 `VS Code`、`JetBrains IDE`）。

- **身份认证：** 为保障连接安全，插件 **必须** 生成一个唯一且保密的令牌，并将其写入发现文件中。CLI 随后会在所有发往 MCP 服务器的请求中，于 `Authorization` 请求头中携带该令牌（例如 `Authorization: Bearer a-very-secret-token`）。你的服务器 **必须** 在每次请求时校验该令牌，并拒绝任何未授权的请求。
- **环境变量（必需）：** 插件 **必须** 在集成终端中设置环境变量 `QWEN_CODE_IDE_SERVER_PORT`，以便 CLI 能准确定位对应的 `<PORT>.lock` 文件。

**旧版说明：** 对于早于 v0.5.1 版本的扩展，Qwen Code 可能会回退至读取系统临时目录中名为 `qwen-code-ide-server-<PID>.json` 或 `qwen-code-ide-server-<PORT>.json` 的 JSON 文件。新集成不应依赖这些旧版文件。

## II. 上下文接口

为了实现上下文感知能力，插件**可选地**向 CLI 提供用户在 IDE 中活动的实时信息。

### `ide/contextUpdate` 通知

插件**可以**在用户上下文发生变化时，向 CLI 发送 `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)。

- **触发事件：** 应在以下情况（建议使用 50ms 的防抖）发送该通知：
  - 打开、关闭或聚焦某个文件；
  - 用户在当前活动文件中的光标位置或文本选区发生变化。
- **载荷（`IdeContext`）：** 该通知的参数**必须**为一个 `IdeContext` 对象：

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
    // 上次被聚焦的 Unix 时间戳（用于排序）
    timestamp: number;
    // 若为当前聚焦的文件，则为 true
    isActive?: boolean;
    cursor?: {
      // 行号（从 1 开始计数）
      line: number;
      // 字符号（从 1 开始计数）
      character: number;
    };
    // 当前用户选中的文本
    selectedText?: string;
  }
  ```

  **注意：** `openFiles` 列表**仅应包含**磁盘上实际存在的文件。虚拟文件（例如无路径的未保存文件、编辑器设置页面等）**必须排除**。

### CLI 如何使用此上下文

CLI 在接收到 `IdeContext` 对象后，会在将信息发送给模型前执行若干标准化与截断操作。

- **文件排序**：CLI 使用 `timestamp` 字段确定最近被使用的文件，并依据该值对 `openFiles` 列表进行排序。因此，你的插件**必须**为文件最后一次获得焦点的时间提供准确的 Unix 时间戳。
- **当前活动文件**：CLI 仅将排序后最靠前的文件视为“当前活动文件”。它会忽略其余所有文件的 `isActive` 标志，并清空它们的 `cursor` 和 `selectedText` 字段。你的插件应仅对当前获得焦点的文件设置 `isActive: true`，并提供其光标位置与选中文本信息。
- **截断处理**：为控制 token 数量，CLI 会对文件列表（限制为最多 10 个文件）和 `selectedText`（限制为最多 16 KB）分别进行截断。

尽管最终截断由 CLI 完成，我们仍强烈建议你的插件也主动限制所发送上下文的数据量。

## III. 差分接口

为支持交互式代码修改，插件**可选**提供差分接口。该接口允许 CLI 请求 IDE 打开一个差分视图，以展示对某个文件的待定修改。用户随后可在 IDE 内直接审阅、编辑，并最终接受或拒绝这些修改。

### `openDiff` 工具

插件**必须**在其 MCP 服务器上注册一个 `openDiff` 工具。

- **描述：** 该工具指示 IDE 为指定文件打开一个可编辑的差异（diff）视图。
- **请求（`OpenDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求中 `params` 字段内的 `arguments` **必须** 是一个 `OpenDiffRequest` 对象。

  ```typescript
  interface OpenDiffRequest {
    // 待比较文件的绝对路径。
    filePath: string;
    // 文件的建议新内容。
    newContent: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具**必须**立即返回一个 `CallToolResult`，以确认收到请求并报告差异视图是否成功打开。
  - 成功时：若差异视图成功打开，响应中**必须**包含空内容（即 `content: []`）。
  - 失败时：若因错误导致差异视图无法打开，响应中**必须**设置 `isError: true`，并在 `content` 数组中包含一个 `TextContent` 块，用于描述该错误。

  差异操作的实际结果（接受或拒绝）将通过异步通知方式传达。

### `closeDiff` 工具

插件 **必须** 在其 MCP 服务器上注册一个 `closeDiff` 工具。

- **描述：** 该工具指示 IDE 关闭指定文件的已打开差异视图（diff view）。
- **请求（`CloseDiffRequest`）：** 该工具通过 `tools/call` 请求调用。请求中 `params` 字段内的 `arguments` **必须** 是一个 `CloseDiffRequest` 对象。

  ```typescript
  interface CloseDiffRequest {
    // 应关闭其差异视图的文件的绝对路径。
    filePath: string;
  }
  ```

- **响应（`CallToolResult`）：** 该工具 **必须** 返回一个 `CallToolResult`。
  - 成功时：若差异视图成功关闭，响应的 `content` 数组中 **必须** 包含一个 **TextContent** 块，其内容为该文件在关闭前的最终内容。
  - 失败时：若因错误导致差异视图无法关闭，响应中 **必须** 设置 `isError: true`，并在 `content` 数组中包含一个 `TextContent` 块，用于描述该错误。

### `ide/diffAccepted` 通知

当用户在差异视图中接受更改（例如，点击“应用”或“保存”按钮）时，插件**必须**向 CLI 发送 `ide/diffAccepted` 通知。

- **载荷：** 通知参数**必须**包含文件路径及该文件的最终内容。如果用户在差异视图中进行了手动编辑，则该内容可能与原始的 `newContent` 不同。

  ```typescript
  {
    // 被执行差异比较的文件的绝对路径。
    filePath: string;
    // 接受更改后文件的完整内容。
    content: string;
  }
  ```

### `ide/diffRejected` 通知

当用户拒绝更改（例如，未接受即关闭差异视图）时，插件**必须**向 CLI 发送 `ide/diffRejected` 通知。

- **载荷：** 通知参数**必须**包含被拒绝的差异所对应的文件路径。

  ```typescript
  {
    // 被执行差异比较的文件的绝对路径。
    filePath: string;
  }
  ```

## IV. 生命周期接口

插件**必须**根据 IDE 的生命周期，正确管理其资源和发现文件（discovery file）。

- **激活时（IDE 启动 / 插件启用）：**
  1.  启动 MCP 服务器。
  2.  创建发现文件。
- **停用时（IDE 关闭 / 插件禁用）：**
  1.  停止 MCP 服务器。
  2.  删除发现文件。