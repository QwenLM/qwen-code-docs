# IDE 集成

Qwen Code 可以与你的 IDE 集成，提供更无缝且具备上下文感知的体验。这种集成使 CLI 能够更好地理解你的工作区，并支持强大的功能，例如编辑器内的原生 diff 功能。

目前，唯一支持的 IDE 是 [Visual Studio Code](https://code.visualstudio.com/) 以及其他支持 VS Code 扩展的编辑器。

## 功能特性

- **工作区上下文感知：** CLI 能自动识别你当前的工作区，从而提供更相关、准确的响应。该上下文包括：
  - 当前工作区中**最近访问的 10 个文件**。
  - 你当前的光标位置。
  - 你选中的文本（最多 16KB，超出部分将被截断）。

- **原生 Diff 支持：** 当 Qwen 建议代码修改时，你可以直接在 IDE 的原生 diff 查看器中查看变更内容。这样你可以方便地审阅、编辑，并接受或拒绝建议的更改。

- **VS Code 命令支持：** 你可以通过 VS Code 命令面板（`Cmd+Shift+P` 或 `Ctrl+Shift+P`）直接调用 Qwen Code 的功能：
  - `Qwen Code: Run`：在集成终端中启动一个新的 Qwen Code 会话。
  - `Qwen Code: Accept Diff`：接受当前 diff 编辑器中的更改。
  - `Qwen Code: Close Diff Editor`：拒绝更改并关闭当前 diff 编辑器。
  - `Qwen Code: View Third-Party Notices`：显示该插件使用的第三方声明信息。

## 安装与设置

有三种方式可以设置 IDE 集成：

### 1. 自动提示（推荐）

当你在支持的编辑器中运行 Qwen Code 时，它会自动检测你的环境并提示你进行连接。选择 "Yes" 后，系统将自动运行必要的设置流程，包括安装配套扩展并启用连接。

### 2. 通过 CLI 手动安装

如果你之前关闭了提示框，或者希望手动安装扩展，可以在 Qwen Code 中运行以下命令：

```
/ide install
```

该命令会自动找到适合你当前 IDE 的扩展并完成安装。

### 3. 从 Marketplace 手动安装

你也可以直接从 marketplace 安装这个 extension。

- **对于 Visual Studio Code：** 从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 安装。
- **对于 VS Code Forks：** 为了支持 VS Code 的 fork 版本，该 extension 也发布在 [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) 上。请按照你所使用编辑器的说明，从该 registry 安装 extension。

> 注意：
> "Qwen Code Companion" extension 可能会出现在搜索结果的底部。如果你没有立即看到它，可以尝试向下滚动或按“最新发布”排序。
>
> 手动安装 extension 后，你必须在 CLI 中运行 `/ide enable` 来激活集成。

### 启用和禁用

你可以通过 CLI 控制 IDE 集成：

- 要启用与 IDE 的连接，请运行：
  ```
  /ide enable
  ```
- 要禁用连接，请运行：
  ```
  /ide disable
  ```

启用后，Qwen Code 将自动尝试连接到 IDE companion extension。

### 检查状态

要检查连接状态并查看 CLI 从 IDE 接收到的上下文信息，请运行：

```
/ide status
```

如果已连接，该命令将显示所连接的 IDE 以及它感知到的最近打开的文件列表。

（注意：文件列表仅限于工作区中最近访问的 10 个文件，并且只包含磁盘上的本地文件。）

### 使用 Diff

当你要求 Qwen 模型修改文件时，它可以直接在你的编辑器中打开一个 diff 视图。

**要接受一个 diff**，你可以执行以下任意操作：

- 点击 diff 编辑器标题栏中的 **对勾图标**。
- 保存文件（例如使用 `Cmd+S` 或 `Ctrl+S`）。
- 打开命令面板并运行 **Qwen Code: Accept Diff**。
- 在 CLI 中提示时回复 `yes`。

**要拒绝一个 diff**，你可以：

- 点击 diff 编辑器标题栏中的 **'x' 图标**。
- 关闭 diff 编辑器标签页。
- 打开命令面板并运行 **Qwen Code: Close Diff Editor**。
- 在 CLI 中提示时回复 `no`。

你也可以在 **接受之前直接在 diff 视图中修改建议的更改**。

如果你在 CLI 中选择‘Yes, allow always’，更改将不再在 IDE 中显示，因为它们会被自动接受。

## 在沙箱环境中使用

如果你在沙箱环境中使用 Qwen Code，请注意以下事项：

- **在 macOS 上：** IDE 集成需要网络访问权限来与 IDE companion extension 通信。你必须使用允许网络访问的 Seatbelt 配置文件。
- **在 Docker 容器中：** 如果你在 Docker（或 Podman）容器内运行 Qwen Code，IDE 集成仍然可以连接到运行在宿主机上的 VS Code extension。CLI 已配置为自动在 `host.docker.internal` 上查找 IDE server。通常不需要特殊配置，但你可能需要确保 Docker 网络设置允许从容器到宿主机的连接。

## 故障排除

如果你遇到 IDE 集成相关的问题，以下是一些常见错误信息及其解决方法。

### 连接错误

- **错误信息：** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因：** Qwen Code 无法找到连接 IDE 所需的环境变量（`QWEN_CODE_IDE_WORKSPACE_PATH` 或 `QWEN_CODE_IDE_SERVER_PORT`）。这通常意味着 IDE companion 扩展未运行或未正确初始化。
  - **解决方案：**
    1. 确保你已在 IDE 中安装并启用了 **Qwen Code Companion** 扩展。
    2. 在 IDE 中打开一个新的 terminal 窗口，以确保它能获取到正确的环境变量。

- **错误信息：** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因：** 与 IDE companion 的连接意外中断。
  - **解决方案：** 运行 `/ide enable` 尝试重新连接。如果问题仍然存在，可以尝试打开一个新的 terminal 窗口或重启你的 IDE。

### 配置错误

- **错误信息：** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因：** CLI 的当前工作目录与你在 [IDE Name] 中打开的文件夹或 workspace 不一致。
  - **解决方案：** 使用 `cd` 命令进入与你在 IDE 中打开的相同目录，然后重新启动 CLI。

- **错误信息：** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因：** 你当前在 IDE 中没有打开任何 workspace。
  - **解决方案：** 在你的 IDE 中打开一个 workspace，然后重新启动 CLI。

### 通用错误

- **错误信息：** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因：** 你当前在 terminal 或者不支持的 IDE 环境中运行 Qwen Code。
  - **解决方案：** 请从受支持的 IDE（如 VS Code）的集成 terminal 中运行 Qwen Code。

- **错误信息：** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因：** 你执行了 `/ide install`，但 CLI 没有为你当前使用的 IDE 提供自动安装器。
  - **解决方案：** 打开你的 IDE 的 extension marketplace，搜索 "Qwen Code Companion"，然后手动安装该插件。