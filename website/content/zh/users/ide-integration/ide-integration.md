# IDE 集成

Qwen Code 可以与你的 IDE 集成，提供更无缝且具备上下文感知能力的体验。此集成使 CLI 能更好地理解你的工作区，并启用编辑器内原生 diff 等强大功能。

目前，唯一支持的 IDE 是 [Visual Studio Code](https://code.visualstudio.com/) 及其他支持 VS Code 扩展的编辑器。若要为其他编辑器构建支持，请参阅 [IDE Companion Extension Spec](../ide-integration/ide-companion-spec)。

## 功能特性

- **工作区上下文：** CLI 会自动获取你的工作区上下文，以提供更相关、更准确的响应。该上下文包括：
  - 工作区中**最近访问的 10 个文件**。
  - 当前光标位置。
  - 你选中的任何文本（上限 16KB；超出部分将被截断）。

- **原生 Diff 查看：** 当 Qwen 建议代码修改时，你可以直接在 IDE 的原生 diff 查看器中查看更改。这让你能够无缝地审查、编辑以及接受或拒绝建议的更改。

- **VS Code 命令：** 你可以直接从 VS Code 命令面板（`Cmd+Shift+P` 或 `Ctrl+Shift+P`）访问 Qwen Code 功能：
  - `Qwen Code: Run`：在集成终端中启动新的 Qwen Code 会话。
  - `Qwen Code: Accept Diff`：接受当前 diff 编辑器中的更改。
  - `Qwen Code: Close Diff Editor`：拒绝更改并关闭当前 diff 编辑器。
  - `Qwen Code: View Third-Party Notices`：显示该扩展的第三方声明。

## 安装与配置

有三种方式可以设置 IDE 集成：

### 1. 自动提示（推荐）

当你在受支持的编辑器中运行 Qwen Code 时，它会自动检测你的环境并提示你进行连接。选择“Yes”将自动运行必要的设置，包括安装配套扩展并启用连接。

### 2. 通过 CLI 手动安装

如果你之前关闭了提示或希望手动安装扩展，可以在 Qwen Code 中运行以下命令：

```
/ide install
```

该命令将查找适用于你 IDE 的正确扩展并进行安装。

### 3. 通过应用市场手动安装

你也可以直接从应用市场安装该扩展。

- **Visual Studio Code：** 从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 安装。
- **VS Code 分支版本：** 为支持 VS Code 的分支版本，该扩展也已发布在 [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) 上。请按照你所用编辑器的说明从该注册表安装扩展。

> 注意：
> “Qwen Code Companion”扩展可能会出现在搜索结果的底部。如果未立即看到，请尝试向下滚动或按“最新发布”排序。
>
> 手动安装扩展后，你必须在 CLI 中运行 `/ide enable` 以激活集成。

## 使用方法

### 启用与禁用

你可以在 CLI 内部控制 IDE 集成：

- 启用与 IDE 的连接，运行：
  ```
  /ide enable
  ```
- 禁用连接，运行：
  ```
  /ide disable
  ```

启用后，Qwen Code 将自动尝试连接到 IDE 配套扩展。

### 检查状态

要检查连接状态并查看 CLI 从 IDE 获取的上下文，请运行：

```
/ide status
```

如果已连接，此命令将显示所连接的 IDE 以及它已知的最近打开的文件列表。

（注：文件列表仅限工作区内最近访问的 10 个文件，且仅包含磁盘上的本地文件。）

### 处理 Diff

当你要求 Qwen 模型修改文件时，它可以直接在你的编辑器中打开 diff 视图。

**接受 diff**，你可以执行以下任一操作：

- 点击 diff 编辑器标题栏中的**对勾图标**。
- 保存文件（例如使用 `Cmd+S` 或 `Ctrl+S`）。
- 打开命令面板并运行 **Qwen Code: Accept Diff**。
- 在 CLI 提示时回复 `yes`。

**拒绝 diff**，你可以：

- 点击 diff 编辑器标题栏中的 **'x' 图标**。
- 关闭 diff 编辑器标签页。
- 打开命令面板并运行 **Qwen Code: Close Diff Editor**。
- 在 CLI 提示时回复 `no`。

你也可以在接受更改之前，直接在 diff 视图中**修改建议的更改**。

如果你在 CLI 中选择“Yes, allow always”，更改将自动接受，不再在 IDE 中显示。

## 在沙盒环境中使用

如果你在沙盒环境中使用 Qwen Code，请注意以下事项：

- **macOS 上：** IDE 集成需要网络访问权限以与 IDE 配套扩展通信。你必须使用允许网络访问的 Seatbelt 配置文件。
- **Docker 容器中：** 如果你在 Docker（或 Podman）容器内运行 Qwen Code，IDE 集成仍可连接到宿主机上运行的 VS Code 扩展。CLI 已配置为自动在 `host.docker.internal` 上查找 IDE 服务器。通常无需特殊配置，但你可能需要确保 Docker 网络设置允许从容器连接到宿主机。

## 故障排除

如果在 IDE 集成过程中遇到问题，以下是一些常见错误消息及其解决方法。

### 连接错误

- **消息：** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因：** Qwen Code 无法找到连接 IDE 所需的环境变量（`QWEN_CODE_IDE_WORKSPACE_PATH` 或 `QWEN_CODE_IDE_SERVER_PORT`）。这通常意味着 IDE 配套扩展未运行或未正确初始化。
  - **解决方法：**
    1. 确保你已在 IDE 中安装并启用了 **Qwen Code Companion** 扩展。
    2. 在 IDE 中打开一个新的终端窗口，以确保其获取正确的环境变量。

- **消息：** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因：** 与 IDE 配套扩展的连接意外断开。
  - **解决方法：** 运行 `/ide enable` 尝试重新连接。如果问题持续存在，请打开新的终端窗口或重启 IDE。

### 配置错误

- **消息：** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因：** CLI 的当前工作目录不在 IDE 中打开的文件夹或工作区内。
  - **解决方法：** 使用 `cd` 进入与 IDE 中打开的相同目录，然后重启 CLI。

- **消息：** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因：** 你的 IDE 中未打开任何工作区。
  - **解决方法：** 在 IDE 中打开一个工作区，然后重启 CLI。

### 常规错误

- **消息：** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因：** 你在不受支持的 IDE 的终端或环境中运行 Qwen Code。
  - **解决方法：** 从受支持的 IDE（如 VS Code）的集成终端中运行 Qwen Code。

- **消息：** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因：** 你运行了 `/ide install`，但 CLI 没有针对你所用 IDE 的自动安装程序。
  - **解决方法：** 打开 IDE 的扩展市场，搜索“Qwen Code Companion”并手动安装。