# IDE 集成

Qwen Code 可与你的 IDE 集成，从而提供更流畅、上下文感知更强的体验。该集成使 CLI 能更深入地理解你的工作区，并支持强大的功能，例如原生的编辑器内差异对比（diff）。

目前，唯一受支持的 IDE 是 [Visual Studio Code](https://code.visualstudio.com/)，以及其他支持 VS Code 扩展的编辑器。如需为其他编辑器添加支持，请参阅 [IDE Companion 扩展规范](../ide-integration/ide-companion-spec)。

## 功能特性

- **工作区上下文：** CLI 会自动感知你的工作区，从而提供更相关、更准确的响应。该上下文包括：
  - 工作区中**最近访问的 10 个文件**。
  - 当前光标所在位置。
  - 你所选中的任意文本（上限为 16 KB；超出部分将被截断）。

- **原生差异对比（Diff）：** 当 Qwen 建议代码修改时，你可在 VS Code 原生的差异查看器中直接查看变更内容。这使你能顺畅地审查、编辑，并接受或拒绝建议的更改。

- **VS Code 命令：** 你可以通过 VS Code 命令面板（`Cmd+Shift+P` 或 `Ctrl+Shift+P`）直接调用 Qwen Code 的功能：
  - `Qwen Code: Run`：在集成终端中启动一个新的 Qwen Code 会话。
  - `Qwen Code: Accept Diff`：接受当前差异编辑器中的所有更改。
  - `Qwen Code: Close Diff Editor`：拒绝更改并关闭当前差异编辑器。
  - `Qwen Code: View Third-Party Notices`：显示该扩展所依赖的第三方声明。

## 安装与设置

设置 IDE 集成有三种方式：

### 1. 自动提示（推荐）

当你在受支持的编辑器中运行 Qwen Code 时，它会自动检测你的开发环境，并提示你建立连接。选择“是”将自动执行必要的设置操作，包括安装配套扩展并启用连接。

### 2. 通过 CLI 手动安装

如果你之前忽略了提示，或希望手动安装扩展，可在 Qwen Code 中运行以下命令：

```
/ide install
```

该命令将自动识别你所用的 IDE，并安装对应的扩展。

### 3. 从市场手动安装

你也可以直接从市场安装该扩展。

- **Visual Studio Code 用户**：请从 [VS Code 市场](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 安装。
- **VS Code 衍生编辑器用户**：为支持 VS Code 的各类衍生编辑器，该扩展也发布在 [Open VSX 仓库](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) 上。请参考你所用编辑器的文档，了解如何从此仓库安装扩展。

> NOTE:
> “Qwen Code Companion” 扩展可能出现在搜索结果靠后的位置。若未立即看到，请尝试向下滚动，或按“最新发布”排序。
>
> 手动安装扩展后，你必须在 CLI 中运行 `/ide enable` 命令以启用集成。

## 使用方法

### 启用与禁用

你可以通过 CLI 控制 IDE 集成：

- 要启用与 IDE 的连接，请运行：
  ```
  /ide enable
  ```
- 要禁用连接，请运行：
  ```
  /ide disable
  ```

启用后，Qwen Code 将自动尝试连接到 IDE 的配套扩展。

### 检查状态

要检查连接状态并查看 CLI 从 IDE 接收到的上下文，请运行：

```
/ide status
```

如果已连接，该命令将显示当前连接的 IDE 名称，以及它所知晓的最近打开的文件列表。

（注意：文件列表仅包含工作区中最近访问的 10 个文件，且仅限本地磁盘上的文件。）

### 处理差异（Diff）

当你请求 Qwen 模型修改某个文件时，它可直接在你的编辑器中打开差异视图（diff view）。

**要接受差异更改**，你可以执行以下任一操作：

- 点击差异编辑器标题栏中的 **对勾图标**。
- 保存文件（例如按 `Cmd+S` 或 `Ctrl+S`）。
- 打开命令面板，运行 **Qwen Code: Accept Diff**。
- 在 CLI 提示时输入 `yes`。

**要拒绝差异更改**，你可以：

- 点击差异编辑器标题栏中的 **‘×’ 图标**。
- 关闭差异编辑器标签页。
- 打开命令面板，运行 **Qwen Code: Close Diff Editor**。
- 在 CLI 提示时输入 `no`。

你还可以在**接受更改前，直接在差异视图中修改建议的变更内容**。

如果在 CLI 中选择 **‘Yes, allow always’**，后续更改将不再显示在 IDE 中，而是自动被接受。

## 与沙箱环境配合使用

如果在沙箱环境中使用 Qwen Code，请注意以下事项：

- **在 macOS 上**：IDE 集成需要网络访问权限，以与 IDE 辅助扩展通信。您必须使用允许网络访问的 Seatbelt 配置文件。
- **在 Docker 容器中**：如果您在 Docker（或 Podman）容器内运行 Qwen Code，IDE 集成仍可连接到主机上运行的 VS Code 扩展。CLI 已配置为自动在 `host.docker.internal` 上查找 IDE 服务端。通常无需特殊配置，但您可能需要确保 Docker 网络设置允许容器连接到宿主机。

## 故障排除

如果遇到 IDE 集成相关问题，以下是一些常见错误消息及其解决方法。

### 连接错误

- **提示信息：** `🔴 已断开连接：无法连接到 [IDE 名称] 的 IDE 辅助扩展。请确保该扩展正在运行，并尝试重启终端。如需安装扩展，请运行 /ide install。`
  - **原因：** Qwen Code 未能找到必要的环境变量（`QWEN_CODE_IDE_WORKSPACE_PATH` 或 `QWEN_CODE_IDE_SERVER_PORT`）以连接 IDE。这通常意味着 IDE 辅助扩展未运行，或未正确初始化。
  - **解决方案：**
    1.  确保已在 IDE 中安装并启用了 **Qwen Code Companion** 扩展。
    2.  在 IDE 中打开一个新的终端窗口，以确保其加载了正确的环境变量。

- **提示信息：** `🔴 已断开连接：IDE 连接错误。连接意外中断。请运行 /ide enable 尝试重新连接。`
  - **原因：** 与 IDE 辅助扩展的连接已丢失。
  - **解决方案：** 运行 `/ide enable` 尝试重新连接。若问题持续存在，请打开新的终端窗口或重启 IDE。

### 配置错误

- **提示信息：** `🔴 已断开连接：目录不匹配。Qwen Code 正在运行的路径与 [IDE 名称] 中打开的工作区路径不同。请在项目根目录下运行 CLI。`
  - **原因：** CLI 当前工作目录不在 IDE 中打开的文件夹或工作区范围内。
  - **解决方法：** 使用 `cd` 命令切换到 IDE 中打开的同一目录，然后重启 CLI。

- **提示信息：** `🔴 已断开连接：如需使用此功能，请先在 [IDE 名称] 中打开一个工作区文件夹，再重试。`
  - **原因：** IDE 中未打开任何工作区。
  - **解决方法：** 在 IDE 中打开一个工作区，然后重启 CLI。

### 通用错误

- **错误信息：** `当前环境不支持 IDE 集成。如需使用此功能，请在以下受支持的 IDE 中运行 Qwen Code：[IDE 列表]`
  - **原因：** 您正在终端或非受支持的 IDE 环境中运行 Qwen Code。
  - **解决方案：** 请从受支持的 IDE（例如 VS Code）的集成终端中运行 Qwen Code。

- **错误信息：** `该 IDE 暂无可用的安装程序。请手动从扩展市场安装 Qwen Code Companion 扩展。`
  - **原因：** 您执行了 `/ide install` 命令，但 CLI 不支持为您的特定 IDE 自动安装。
  - **解决方案：** 打开 IDE 的扩展市场，搜索 “Qwen Code Companion”，然后手动安装。