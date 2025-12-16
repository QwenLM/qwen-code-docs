# IDE 集成

Qwen Code 可以与你的 IDE 集成，提供更无缝且具备上下文感知的体验。这种集成使 CLI 能够更好地理解你的工作区，并支持强大的功能，例如编辑器内的原生差异对比。

目前，唯一支持的 IDE 是 [Visual Studio Code](https://code.visualstudio.com/) 以及其他支持 VS Code 扩展的编辑器。如需为其他编辑器构建支持，请参阅 [IDE Companion 扩展规范](/users/ide-integration/ide-companion-spec)。

## 功能特性

- **工作区上下文感知：** CLI 会自动识别你的工作区信息，从而提供更相关和准确的响应。该上下文包括：
  - 工作区内**最近访问的 10 个文件**。
  - 当前活动光标位置。
  - 你所选中的文本（最多 16KB；超出部分将被截断）。

- **原生差异对比：** 当 Qwen 建议进行代码修改时，你可以直接在 IDE 的原生差异查看器中查看变更内容。这使你能无缝地审查、编辑并接受或拒绝建议的更改。

- **VS Code 命令支持：** 你可以通过 VS Code 命令面板（`Cmd+Shift+P` 或 `Ctrl+Shift+P`）直接访问 Qwen Code 的功能：
  - `Qwen Code: Run`：在集成终端中启动一个新的 Qwen Code 会话。
  - `Qwen Code: Accept Diff`：接受当前差异编辑器中的更改。
  - `Qwen Code: Close Diff Editor`：拒绝更改并关闭当前差异编辑器。
  - `Qwen Code: View Third-Party Notices`：显示扩展的第三方声明信息。

## 安装与设置

有三种方式可以设置 IDE 集成：

### 1. 自动提示（推荐）

当你在受支持的编辑器中运行 Qwen Code 时，它会自动检测你的环境并提示你进行连接。选择“是”将自动运行必要的设置，包括安装配套扩展并启用连接。

### 2. 通过 CLI 手动安装

如果你之前关闭了提示或希望手动安装扩展，可以在 Qwen Code 中运行以下命令：

```
/ide install
```

该命令会找到适合你 IDE 的正确扩展并进行安装。

### 3. 从市场手动安装

你也可以直接从市场安装该扩展。

- **对于 Visual Studio Code：** 从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 安装。
- **对于 VS Code 的衍生版本：** 为了支持 VS Code 的衍生编辑器，该扩展也发布在 [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) 上。请根据你所使用编辑器的说明，从该注册表中安装扩展。

> 注意：
> "Qwen Code Companion" 扩展可能出现在搜索结果的底部。如果你没有立即看到它，可以尝试向下滚动或按“最新发布”排序。
>
> 手动安装扩展后，你必须在 CLI 中运行 `/ide enable` 来激活集成。

## 使用方法

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

启用后，Qwen Code 将自动尝试连接到 IDE 的配套扩展。

### 检查状态

要检查连接状态并查看 CLI 从 IDE 接收到的上下文信息，请运行：

```
/ide status
```

如果已连接，此命令将显示所连接的 IDE，并列出它感知到的最近打开的文件。

（注意：文件列表仅限于工作区中最近访问的 10 个文件，且只包括磁盘上的本地文件。）

### 使用差异对比

当你要求通义千问模型修改文件时，它可以直接在你的编辑器中打开一个差异视图。

**要接受差异更改**，你可以执行以下任一操作：

- 点击差异编辑器标题栏中的**对勾图标**。
- 保存文件（例如使用 `Cmd+S` 或 `Ctrl+S`）。
- 打开命令面板并运行 **Qwen Code: Accept Diff**。
- 在 CLI 中提示时回复 `yes`。

**要拒绝差异更改**，你可以：

- 点击差异编辑器标题栏中的**'x' 图标**。
- 关闭差异编辑器标签页。
- 打开命令面板并运行 **Qwen Code: Close Diff Editor**。
- 在 CLI 中提示时回复 `no`。

你也可以在差异视图中直接**修改建议的更改**后再接受它们。

如果你在 CLI 中选择了“是，始终允许”，那么更改将不再显示在 IDE 中，因为它们会被自动接受。

## 使用沙箱环境

如果你在沙箱环境中使用 Qwen Code，请注意以下事项：

- **在 macOS 上：** IDE 集成需要网络访问权限以与 IDE 伴侣扩展通信。你必须使用允许网络访问的 Seatbelt 配置文件。
- **在 Docker 容器中：** 如果你在 Docker（或 Podman）容器内运行 Qwen Code，IDE 集成仍然可以连接到运行在宿主机上的 VS Code 扩展。CLI 已配置为自动查找位于 `host.docker.internal` 的 IDE 服务器。通常无需特殊配置，但你可能需要确保 Docker 网络设置允许从容器到宿主机的连接。

## 故障排除

如果遇到 IDE 集成问题，以下是一些常见错误信息及其解决方法。

### 连接错误

- **消息：** `🔴 已断开连接：无法连接到 [IDE 名称] 的 IDE 配套扩展。请确保该扩展正在运行，并尝试重新启动终端。要安装该扩展，请运行 /ide install。`
  - **原因：** Qwen Code 找不到必要的环境变量（`QWEN_CODE_IDE_WORKSPACE_PATH` 或 `QWEN_CODE_IDE_SERVER_PORT`）来连接到 IDE。这通常意味着 IDE 配套扩展未运行或未能正确初始化。
  - **解决方案：**
    1. 确保你已在 IDE 中安装了 **Qwen Code Companion** 扩展并已启用。
    2. 在 IDE 中打开一个新的终端窗口，以确保它获取到正确的环境。

- **消息：** `🔴 已断开连接：IDE 连接错误。连接意外丢失。请通过运行 /ide enable 尝试重新连接`
  - **原因：** 与 IDE 配套的连接已丢失。
  - **解决方案：** 运行 `/ide enable` 尝试重新连接。如果问题仍然存在，请打开新的终端窗口或重启你的 IDE。

### 配置错误

- **消息：** `🔴 已断开连接：目录不匹配。Qwen Code 运行的位置与 [IDE 名称] 中打开的工作区位置不同。请从项目根文件夹所在的同一目录运行 CLI。`
  - **原因：** CLI 的当前工作目录位于你在 IDE 中打开的文件夹或工作区之外。
  - **解决方案：** 使用 `cd` 命令进入与你在 IDE 中打开的相同目录，并重新启动 CLI。

- **消息：** `🔴 已断开连接：要使用此功能，请在 [IDE 名称] 中打开一个工作区文件夹，然后重试。`
  - **原因：** 你在 IDE 中没有打开任何工作区。
  - **解决方案：** 在你的 IDE 中打开一个工作区，并重新启动 CLI。

### 一般错误

- **消息：** `IDE 集成在您当前的环境中不受支持。要使用此功能，请在以下受支持的 IDE 中运行 Qwen Code：[IDE 列表]`
  - **原因：** 您正在终端或不受支持的 IDE 环境中运行 Qwen Code。
  - **解决方案：** 从受支持的 IDE（如 VS Code）的集成终端中运行 Qwen Code。

- **消息：** `没有适用于该 IDE 的安装程序。请从市场手动安装 Qwen Code Companion 扩展。`
  - **原因：** 您运行了 `/ide install`，但 CLI 没有针对您特定 IDE 的自动安装程序。
  - **解决方案：** 打开您的 IDE 扩展市场，搜索 "Qwen Code Companion"，然后手动安装它。