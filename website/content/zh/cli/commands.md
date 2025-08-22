# CLI 命令

Qwen Code 支持多个内置命令，帮助你管理会话、自定义界面并控制其行为。这些命令以斜杠 (`/`)、@ 符号 (`@`) 或感叹号 (`!`) 作为前缀。

## 斜杠命令 (`/`)

斜杠命令提供对 CLI 本身的元级别控制。

### 内置命令

- **`/bug`**
  - **说明：** 提交一个关于 Qwen Code 的 issue。默认情况下，该 issue 会提交到 Qwen Code 的 GitHub 仓库中。你在 `/bug` 后输入的字符串将成为该 bug 的标题。你可以通过在 `.qwen/settings.json` 文件中配置 `bugCommand` 设置来修改 `/bug` 的默认行为。

- **`/chat`**
  - **说明：** 交互式地保存和恢复对话历史，以支持分支对话状态，或在后续会话中恢复之前的对话状态。
  - **子命令：**
    - **`save`**
      - **说明：** 保存当前对话历史。你必须添加一个 `<tag>` 用于标识该对话状态。
      - **用法：** `/chat save <tag>`
      - **检查点位置详情：** 默认的聊天检查点保存位置为：
        - Linux/macOS: `~/.config/google-generative-ai/checkpoints/`
        - Windows: `C:\Users\<YourUsername>\AppData\Roaming\google-generative-ai\checkpoints\`
        - 当你运行 `/chat list` 时，CLI 只会扫描这些特定目录以查找可用的检查点。
        - **注意：** 这些检查点用于手动保存和恢复对话状态。如需了解在文件修改前自动创建的检查点，请参阅 [Checkpointing documentation](../checkpointing.md)。
    - **`resume`**
      - **说明：** 从之前的保存点恢复对话。
      - **用法：** `/chat resume <tag>`
    - **`list`**
      - **说明：** 列出可用于恢复对话状态的标签。
    - **`delete`**
      - **说明：** 删除一个已保存的对话检查点。
      - **用法：** `/chat delete <tag>`

- **`/clear`**
  - **说明：** 清除终端屏幕，包括 CLI 中可见的会话历史和滚动缓冲区。底层会话数据（用于历史回溯）可能会根据具体实现保留，但视觉显示会被清除。
  - **快捷键：** 随时按 **Ctrl+L** 执行清除操作。

- **`/compress`**
  - **说明：** 用摘要替换整个聊天上下文。这可以节省未来任务的 token 使用量，同时保留高层次的摘要信息。

- **`/copy`**
  - **说明：** 将 Qwen Code 最后一次输出的内容复制到剪贴板，方便分享或复用。

- **`/directory`**（或 **`/dir`**）
  - **说明：** 管理工作区目录，支持多目录操作。
  - **子命令：**
    - **`add`**：
      - **说明：** 将目录添加到工作区。路径可以是绝对路径或相对于当前工作目录的路径。同时支持从主目录开始的路径引用。
      - **用法：** `/directory add <path1>,<path2>`
      - **注意：** 在限制性沙箱配置中禁用。如果你使用的是该配置，请在启动会话时使用 `--include-directories` 参数。
    - **`show`**：
      - **说明：** 显示通过 `/directory add` 和 `--include-directories` 添加的所有目录。
      - **用法：** `/directory show`

- **`/directory`**（或 **`/dir`**）
  - **说明：** 管理工作区目录，支持多目录操作。
  - **子命令：**
    - **`add`**：
      - **说明：** 将目录添加到工作区。路径可以是绝对路径或相对于当前工作目录的路径。同时支持从主目录开始的路径引用。
      - **用法：** `/directory add <path1>,<path2>`
      - **注意：** 在限制性沙箱配置中禁用。如果你使用的是该配置，请在启动会话时使用 `--include-directories` 参数。
    - **`show`**：
      - **说明：** 显示通过 `/directory add` 和 `--include-directories` 添加的所有目录。
      - **用法：** `/directory show`

- **`/editor`**
  - **说明：** 打开一个对话框，用于选择支持的编辑器。

- **`/extensions`**
  - **说明：** 列出当前 Qwen Code 会话中所有激活的扩展。详见 [Qwen Code Extensions](../extension.md)。

- **`/help`**（或 **`/?`**）
  - **说明：** 显示 Qwen Code 的帮助信息，包括可用命令及其用法。

- **`/mcp`**
  - **说明：** 列出已配置的 Model Context Protocol (MCP) 服务器、其连接状态、服务器详情和可用工具。
  - **子命令：**
    - **`desc`** 或 **`descriptions`**：
      - **说明：** 显示 MCP 服务器和工具的详细描述。
    - **`nodesc`** 或 **`nodescriptions`**：
      - **说明：** 隐藏工具描述，仅显示工具名称。
    - **`schema`**：
      - **说明：** 显示工具配置参数的完整 JSON schema。
  - **快捷键：** 随时按 **Ctrl+T** 切换工具描述的显示与隐藏。

- **`/memory`**
  - **说明：** 管理 AI 的指令上下文（默认从 `QWEN.md` 文件加载的分层内存；可通过 `contextFileName` 配置）。
  - **子命令：**
    - **`add`**：
      - **说明：** 将以下文本添加到 AI 的内存中。用法：`/memory add <text to remember>`
    - **`show`**：
      - **说明：** 显示当前从所有上下文文件（如 `QWEN.md`）加载的分层内存的完整内容。这可以帮助你检查提供给模型的指令上下文。
    - **`refresh`**：
      - **说明：** 重新从所有上下文文件（默认为 `QWEN.md`）中加载分层指令内存，这些文件位于配置的位置（全局、项目/祖先目录和子目录）。这将使用最新的上下文内容更新模型。
    - **注意：** 有关上下文文件如何构成分层内存的更多详情，请参阅 [CLI Configuration documentation](./configuration.md#context-files-hierarchical-instructional-context)。

- **`/restore`**
  - **说明：** 将项目文件恢复到工具执行前的状态。这特别适用于撤销工具所做的文件修改。如果未提供工具调用 ID，它将列出可恢复的检查点。
  - **用法：** `/restore [tool_call_id]`
  - **注意：** 仅在 CLI 启动时使用 `--checkpointing` 选项或通过 [settings](./configuration.md) 配置时可用。详见 [Checkpointing documentation](../checkpointing.md)。

- **`/settings`**
  - **说明：** 打开设置编辑器以查看和修改 Qwen Code 的设置。
  - **详情：** 此命令提供了一个用户友好的界面，用于更改控制 Qwen Code 行为和外观的设置。它等效于手动编辑 `.qwen/settings.json` 文件，但带有验证和引导功能以防止错误。
  - **用法：** 直接运行 `/settings`，编辑器将自动打开。你可以浏览或搜索特定设置，查看当前值并按需修改。某些设置的更改会立即生效，而其他设置则需要重启。

- **`/stats`**
  - **说明：** 显示当前 Qwen Code 会话的详细统计信息，包括 token 使用量、缓存 token 节省情况（如果可用）和会话时长。注意：缓存 token 信息仅在使用缓存 token 时显示，目前仅在使用 API key 认证时支持。

- [**`/theme`**](./themes.md)
  - **说明：** 打开一个对话框，允许你更改 Qwen Code 的视觉主题。

- **`/auth`**
  - **说明：** 打开一个对话框，允许你更改认证方式。

- **`/about`**
  - **说明：** 显示版本信息。提交 issue 时请分享此信息。

- [**`/tools`**](../tools/index.md)
  - **说明：** 显示当前在 Qwen Code 中可用的工具列表。
  - **子命令：**
    - **`desc`** 或 **`descriptions`**：
      - **说明：** 显示每个工具的详细描述，包括工具名称及其提供给模型的完整描述。
    - **`nodesc`** 或 **`nodescriptions`**：
      - **说明：** 隐藏工具描述，仅显示工具名称。

- **`/privacy`**
  - **说明：** 显示隐私声明，并允许用户选择是否同意收集其数据以改进服务。

- **`/quit`**（或 **`/exit`**）
  - **说明：** 退出 Qwen Code。

- **`/vim`**
  - **说明：** 切换 vim 模式开启或关闭。启用 vim 模式后，输入区域支持在 NORMAL 和 INSERT 模式下的 vim 风格导航和编辑命令。
  - **功能：**
    - **NORMAL 模式：** 使用 `h`, `j`, `k`, `l` 导航；使用 `w`, `b`, `e` 按单词跳转；使用 `0`, `$`, `^` 跳转到行首/行尾；使用 `G`（或 `gg` 跳转到第一行）跳转到指定行
    - **INSERT 模式：** 标准文本输入，按 Esc 返回 NORMAL 模式
    - **编辑命令：** 使用 `x` 删除，`c` 修改，`i`, `a`, `o`, `O` 插入；支持复杂操作如 `dd`, `cc`, `dw`, `cw`
    - **数字前缀支持：** 在命令前加数字（如 `3h`, `5w`, `10G`）
    - **重复上次命令：** 使用 `.` 重复上一次编辑操作
    - **持久设置：** Vim 模式偏好会保存到 `~/.qwen/settings.json` 并在会话间恢复
  - **状态指示器：** 启用时会在页脚显示 `[NORMAL]` 或 `[INSERT]`

- **`/init`**
  - **说明：** 分析当前目录并默认创建一个 `QWEN.md` 上下文文件（或由 `contextFileName` 指定的文件名）。如果已存在非空文件，则不会进行任何更改。该命令会创建一个空文件并提示模型用项目特定的指令填充它。

### 自定义命令

快速入门，请参见下方的[示例](#example-a-pure-function-refactoring-command)。

自定义命令允许你将最喜爱或最常用的 prompts 保存为个人快捷方式，在 Qwen Code 中重复使用。你可以创建仅适用于单个项目的命令，也可以创建在所有项目中全局可用的命令，从而简化工作流程并确保一致性。

#### 文件位置与优先级

Qwen Code 从两个位置发现命令，按特定顺序加载：

1.  **用户命令（全局）：** 位于 `~/.qwen/commands/`。这些命令在你正在处理的任何项目中都可用。
2.  **项目命令（本地）：** 位于 `<your-project-root>/.qwen/commands/`。这些命令特定于当前项目，可以纳入版本控制并与团队共享。

如果项目目录中的命令与用户目录中的命令同名，则**始终使用项目命令**。这允许项目使用特定于项目的版本覆盖全局命令。

#### 命名与命名空间

命令的名称由其相对于 `commands` 目录的文件路径决定。子目录用于创建带命名空间的命令，路径分隔符（`/` 或 `\`）会被转换为冒号（`:`）。

- 位于 `~/.qwen/commands/test.toml` 的文件会成为命令 `/test`。
- 位于 `<project>/.qwen/commands/git/commit.toml` 的文件会成为带命名空间的命令 `/git:commit`。

#### TOML 文件格式 (v1)

你的命令定义文件必须使用 TOML 格式编写，并使用 `.toml` 文件扩展名。

##### 必填字段

- `prompt` (String)：命令执行时发送给模型的 prompt。可以是单行或多行字符串。

##### 可选字段

- `description` (String)：命令功能的简短一行描述。这段文字会显示在 `/help` 菜单中你的命令旁边。**如果你省略此字段，系统会根据文件名生成一个通用描述。**

#### 处理参数

自定义命令支持两种强大且低摩擦的参数处理方法。CLI 会根据你的命令 `prompt` 内容自动选择正确的方法。

##### 1. 使用 `{{args}}` 的简写注入

如果你的 `prompt` 包含特殊占位符 `{{args}}`，CLI 会将该占位符替换为用户在命令名称后输入的所有文本。这种方法非常适合简单的、确定性的命令，你需要将用户输入注入到较大的 prompt 模板中的特定位置。

**示例 (`git/fix.toml`):**

```toml

# In: ~/.qwen/commands/git/fix.toml

# 调用方式：/git:fix "移动端按钮错位"

description = "为给定的 GitHub issue 生成修复方案。"
prompt = "请分析已暂存的 git 更改，并为以下问题提供代码修复：{{args}}。"
```

模型将收到最终的 prompt：`请分析已暂存的 git 更改，并为以下问题提供代码修复："移动端按钮错位"`

##### 2. 默认参数处理

如果你的 `prompt` 中**没有**包含特殊占位符 `{{args}}`，CLI 会使用默认行为来处理参数。

如果你为命令提供了参数（例如 `/mycommand arg1`），CLI 会在 prompt 的末尾追加你输入的完整命令，并用两个换行符分隔。这样可以让模型同时看到原始指令和你刚刚提供的具体参数。

如果你**没有**提供任何参数（例如 `/mycommand`），prompt 会原样发送给模型，不追加任何内容。

**示例 (`changelog.toml`):**

这个示例展示了如何通过为模型定义角色、说明在哪里找到用户输入以及指定预期格式和行为来创建一个健壮的命令。

```toml

# In: <project>/.qwen/commands/changelog.toml

# 调用方式：/changelog 1.2.0 added "Support for default argument parsing."

description = "向项目的 CHANGELOG.md 文件添加新条目。"
prompt = """

# 任务：更新 Changelog

你是这个软件项目的专家维护者。用户调用了添加新 changelog 条目的命令。

**用户的原始命令会附加在你的指令下方。**

你的任务是从用户输入中解析出 `<version>`、`<change_type>` 和 `<message>`，然后使用 `write_file` 工具正确更新 `CHANGELOG.md` 文件。

## 预期格式
命令遵循以下格式：`/changelog <version> <type> <message>`
- `<type>` 必须是以下之一："added"、"changed"、"fixed"、"removed"。

## 行为
1. 读取 `CHANGELOG.md` 文件。
2. 找到指定 `<version>` 的部分。
3. 在正确的 `<type>` 标题下添加 `<message>`。
4. 如果版本或类型部分不存在，则创建它。
5. 严格遵循 "Keep a Changelog" 格式。
"""
```

当你运行 `/changelog 1.2.0 added "New feature"` 时，发送给模型的最终文本将是原始 prompt 后跟两个换行符和你输入的命令。

##### 3. 使用 `!{...}` 执行 Shell 命令

你可以通过在 `prompt` 中直接执行 shell 命令并注入其输出，使你的命令更加动态化。这种方式非常适合从本地环境中获取上下文信息，例如读取文件内容或检查 Git 状态。

当自定义命令尝试执行 shell 命令时，Qwen Code 现在会在继续执行前提示你进行确认。这是一项安全措施，确保只有预期的命令才能被执行。

**工作原理：**

1.  **注入命令：** 在你的 `prompt` 中使用 `!{...}` 语法，指定命令应在哪里运行以及如何注入其输出。
2.  **确认执行：** 当你运行命令时，会出现一个对话框，列出 prompt 想要执行的 shell 命令。
3.  **授予权限：** 你可以选择：
    - **仅允许一次：** 命令将仅在此时执行一次。
    - **在此会话中始终允许：** 命令将被添加到当前 CLI 会话的临时白名单中，后续不再需要确认。
    - **否：** 取消执行 shell 命令。

CLI 仍然会遵循全局 `excludeTools` 和 `coreTools` 设置。如果某个命令在你的配置中被明确禁止，则该命令将被直接阻止，且不会弹出确认提示。

**示例 (`git/commit.toml`)：**

该命令获取暂存区的 git diff，并使用它来请求模型生成一条 commit message。

````toml

# 位于：<project>/.qwen/commands/git/commit.toml

# 调用方式：/git:commit

description = "根据暂存的更改生成 Git commit message。"

# prompt 中使用 !{...} 来执行命令并注入其输出。
prompt = """
请根据以下 git diff 生成一条 Conventional Commit 格式的 commit message：

```diff
!{git diff --staged}
```

"""

```

当你运行 `/git:commit` 时，CLI 会首先执行 `git diff --staged`，然后将 `!{git diff --staged}` 替换为该命令的输出，再将最终完整的 prompt 发送给模型。

#### 示例：一个"纯函数"重构命令

让我们创建一个全局命令，用于要求模型重构一段代码。

**1. 创建文件和目录：**

首先，确保用户命令目录存在，然后创建一个 `refactor` 子目录用于组织结构，以及最终的 TOML 文件。

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. 向文件中添加内容：**

在你的编辑器中打开 `~/.qwen/commands/refactor/pure.toml` 并添加以下内容。我们包含了可选的 `description` 字段作为最佳实践。

```toml

# In: ~/.qwen/commands/refactor/pure.toml

# 此命令将通过以下方式调用：/refactor:pure

description = "要求模型将当前上下文中的代码重构为纯函数。"

prompt = """
请分析我在当前上下文中提供的代码。
将其重构为一个纯函数。

你的回复应包括：
1. 重构后的纯函数代码块。
2. 简要说明你所做的关键更改以及为什么这些更改有助于实现纯函数。
"""
```

**3. 运行命令：**

就是这样！你现在可以在 CLI 中运行你的命令了。首先，你可能需要将一个文件添加到上下文中，然后调用你的命令：

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code 将会执行你在 TOML 文件中定义的多行 prompt。

## At 命令 (`@`)

At 命令用于将文件或目录的内容作为 prompt 的一部分包含到模型中。这些命令支持 Git 感知过滤。

- **`@<文件或目录路径>`**
  - **说明：** 将指定文件或多个文件的内容注入到当前 prompt 中。这在需要针对特定代码、文本或文件集合提问时非常有用。
  - **示例：**
    - `@path/to/your/file.txt 解释这段文本。`
    - `@src/my_project/ 总结这个目录中的代码。`
    - `这个文件是关于什么的？@README.md`
  - **详细说明：**
    - 如果提供的是单个文件的路径，则读取该文件的内容。
    - 如果提供的是目录路径，则尝试读取该目录及其子目录中的文件内容。
    - 路径中如果包含空格，应使用反斜杠进行转义（例如：`@My\ Documents/file.txt`）。
    - 内部使用 `read_many_files` 工具实现。内容会被读取并插入到你的查询中，然后再发送给模型。
    - **Git 感知过滤：** 默认情况下，Git 忽略的文件（如 `node_modules/`、`dist/`、`.env`、`.git/`）会被排除。可以通过 `fileFiltering` 设置更改此行为。
    - **文件类型：** 此命令适用于基于文本的文件。虽然可能会尝试读取任何文件，但底层的 `read_many_files` 工具可能会跳过或截断二进制文件或非常大的文件，以确保性能和相关性。工具会提示哪些文件被跳过。
  - **输出：** CLI 会显示一条工具调用消息，表明使用了 `read_many_files`，并附带一条详细说明处理状态和路径的消息。

- **`@`（单独的 @ 符号）**
  - **说明：** 如果你输入一个单独的 `@` 符号而没有指定路径，查询将按原样发送给模型。这在你特别想在 prompt 中**讨论** `@` 符号本身时可能有用。

### `@` 命令的错误处理

- 如果 `@` 后面指定的路径未找到或无效，将显示错误消息，查询可能不会发送到模型，或者会发送但不包含文件内容。
- 如果 `read_many_files` 工具遇到错误（例如权限问题），也会报告此错误。

## Shell 模式和透传命令 (`!`)

使用 `!` 前缀可以直接在 Qwen Code 中与系统 shell 进行交互。

- **`!<shell_command>`**
  - **说明：** 使用 `bash`（Linux/macOS）或 `cmd.exe`（Windows）执行指定的 `<shell_command>`。命令的输出或错误信息会显示在终端中。
  - **示例：**
    - `!ls -la`（执行 `ls -la` 并返回 Qwen Code）
    - `!git status`（执行 `git status` 并返回 Qwen Code）

- **`!`（切换 Shell 模式）**
  - **说明：** 单独输入 `!` 可切换 Shell 模式。
    - **进入 Shell 模式：**
      - 激活后，Shell 模式会使用不同的颜色和“Shell 模式指示器”。
      - 在 Shell 模式下，你输入的内容会被直接解释为 shell 命令。
    - **退出 Shell 模式：**
      - 退出后，UI 会恢复为标准外观，Qwen Code 的正常行为也会恢复。

- **所有 `!` 用法的注意事项：** 在 Shell 模式下执行的命令具有与你在终端中直接运行时相同的权限和影响。

- **环境变量：** 当通过 `!` 或 Shell 模式执行命令时，子进程中会设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否从 CLI 中运行。