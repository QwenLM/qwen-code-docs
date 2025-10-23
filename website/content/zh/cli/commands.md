# CLI 命令

Qwen Code 支持多个内置命令，帮助你管理会话、自定义界面并控制其行为。这些命令以斜杠（`/`）、@ 符号（`@`）或感叹号（`!`）作为前缀。

## 斜杠命令（`/`）

斜杠命令提供对 CLI 本身的元级别控制。

### 内置命令

- **`/bug`**
  - **说明：** 提交关于 Qwen Code 的 issue。默认情况下，issue 会提交到 Qwen Code 的 GitHub 仓库中。你在 `/bug` 后输入的字符串将成为该 bug 的标题。你可以通过在 `.qwen/settings.json` 文件中设置 `advanced.bugCommand` 来修改 `/bug` 的默认行为。

- **`/chat`**
  - **说明：** 交互式保存和恢复对话历史，支持分支对话状态，或从后续会话中恢复之前的状态。
  - **子命令：**
    - **`save`**
      - **说明：** 保存当前对话历史。你必须添加一个 `<tag>` 用于标识对话状态。
      - **用法：** `/chat save <tag>`
      - **检查点位置详情：** 默认的聊天检查点保存位置为：
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<YourUsername>\.qwen\tmp\<project_hash>\`
        - 当你运行 `/chat list` 时，CLI 只会扫描这些特定目录以查找可用的检查点。
        - **注意：** 这些检查点用于手动保存和恢复对话状态。如需了解在文件修改前自动创建的检查点，请参阅 [Checkpointing documentation](../checkpointing.md)。
    - **`resume`**
      - **说明：** 从之前的保存中恢复对话。
      - **用法：** `/chat resume <tag>`
    - **`list`**
      - **说明：** 列出可用于恢复对话状态的标签。
    - **`delete`**
      - **说明：** 删除已保存的对话检查点。
      - **用法：** `/chat delete <tag>`
    - **`share`**
      - **说明：** 将当前对话写入指定的 Markdown 或 JSON 文件。
      - **用法：** `/chat share file.md` 或 `/chat share file.json`。如果未提供文件名，CLI 会自动生成一个。

- **`/clear`**
  - **说明：** 清除终端屏幕，包括 CLI 中可见的会话历史和滚动缓冲区。底层会话数据（用于历史回溯）可能会根据具体实现保留，但视觉显示会被清除。
  - **快捷键：** 随时按 **Ctrl+L** 执行清除操作。

- **`/summary`**
  - **说明：** 根据当前对话历史生成全面的项目摘要，并保存到 `.qwen/PROJECT_SUMMARY.md`。该摘要包括总体目标、关键知识、最近操作和当前计划，非常适合在未来的会话中恢复工作。
  - **用法：** `/summary`
  - **功能：**
    - 分析整个对话历史以提取重要上下文
    - 创建结构化的 Markdown 摘要，包含目标、知识、操作和计划等部分
    - 自动保存到项目根目录下的 `.qwen/PROJECT_SUMMARY.md`
    - 在生成和保存过程中显示进度指示器
    - 与 Welcome Back 功能集成，实现无缝会话恢复
  - **注意：** 此命令需要至少包含 2 条消息的活跃对话才能生成有意义的摘要。

- **`/compress`**
  - **说明：** 用摘要替换整个聊天上下文。这可以节省未来任务使用的 token，同时保留已发生事件的高级摘要。

- **`/copy`**
  - **说明：** 将 Qwen Code 生成的最后一个输出复制到剪贴板，方便分享或重用。

- **`/directory`**（或 **`/dir`**）
  - **说明：** 管理工作区目录，支持多目录操作。
  - **子命令：**
    - **`add`**：
      - **说明：** 将目录添加到工作区。路径可以是绝对路径或相对于当前工作目录的路径。此外，也支持从主目录开始的路径引用。
      - **用法：** `/directory add <path1>,<path2>`
      - **注意：** 在限制性沙盒配置文件中禁用。如果你正在使用该配置，请在启动会话时改用 `--include-directories`。
    - **`show`**：
      - **说明：** 显示通过 `/directory add` 和 `--include-directories` 添加的所有目录。
      - **用法：** `/directory show`

- **`/directory`**（或 **`/dir`**）
  - **说明：** 管理工作区目录，支持多目录操作。
  - **子命令：**
    - **`add`**：
      - **说明：** 将目录添加到工作区。路径可以是绝对路径或相对于当前工作目录的路径。此外，也支持从主目录开始的路径引用。
      - **用法：** `/directory add <path1>,<path2>`
      - **注意：** 在限制性沙盒配置文件中禁用。如果你正在使用该配置，请在启动会话时改用 `--include-directories`。
    - **`show`**：
      - **说明：** 显示通过 `/directory add` 和 `--include-directories` 添加的所有目录。
      - **用法：** `/directory show`

- **`/editor`**
  - **说明：** 打开一个对话框，用于选择支持的编辑器。

- **`/extensions`**
  - **说明：** 列出当前 Qwen Code 会话中所有激活的扩展。参见 [Qwen Code Extensions](../extension.md)。

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
  - **快捷键：** 随时按 **Ctrl+T** 切换显示或隐藏工具描述。

- **`/memory`**
  - **说明：** 管理 AI 的指令上下文（默认从 `QWEN.md` 文件加载的分层内存；可通过 `contextFileName` 配置）。
  - **子命令：**
    - **`add`**：
      - **说明：** 将以下文本添加到 AI 的内存中。用法：`/memory add <text to remember>`
    - **`show`**：
      - **说明：** 显示当前从所有上下文文件（如 `QWEN.md`）加载的分层内存的完整内容。这让你可以检查提供给模型的指令上下文。
    - **`refresh`**：
      - **说明：** 从所有上下文文件（默认：`QWEN.md`）重新加载分层指令内存，这些文件位于配置的位置（全局、项目/祖先目录和子目录）。这会用最新的上下文内容更新模型。
    - **注意：** 有关上下文文件如何贡献于分层内存的更多详情，请参阅 [CLI Configuration documentation](./configuration.md#context-files-hierarchical-instructional-context)。

- **`/restore`**
  - **说明：** 将项目文件恢复到工具执行前的状态。这对于撤销工具所做的文件编辑特别有用。如果在没有工具调用 ID 的情况下运行，它将列出可恢复的检查点。
  - **用法：** `/restore [tool_call_id]`
  - **注意：** 仅在使用 `--checkpointing` 选项调用 CLI 或通过 [settings](./configuration.md) 配置时可用。更多详情请参阅 [Checkpointing documentation](../checkpointing.md)。

- **`/settings`**
  - **说明：** 打开设置编辑器以查看和修改 Qwen Code 设置。
  - **详情：** 此命令提供了一个用户友好的界面来更改控制 Qwen Code 行为和外观的设置。它等效于手动编辑 `.qwen/settings.json` 文件，但带有验证和指导以防止错误。
  - **用法：** 直接运行 `/settings`，编辑器将打开。然后你可以浏览或搜索特定设置，查看其当前值并按需修改。某些设置的更改会立即生效，而其他设置需要重启。

- **`/stats`**
  - **说明：** 显示当前 Qwen Code 会话的详细统计信息，包括 token 使用量、缓存 token 节省（如果可用）和会话持续时间。注意：缓存 token 信息仅在使用缓存 token 时显示，目前这发生在使用 API 密钥认证时，但不包括 OAuth 认证。

- [**`/theme`**](./themes.md)
  - **说明：** 打开一个对话框，让你更改 Qwen Code 的视觉主题。

- **`/auth`**
  - **说明：** 打开一个对话框，让你更改认证方法。

- **`/approval-mode`**
  - **说明：** 更改工具使用的审批模式。
  - **用法：** `/approval-mode [mode] [--session|--project|--user]`
  - **可用模式：**
    - **`plan`**：仅分析；不修改文件或执行命令
    - **`default`**：要求审批文件编辑或 shell 命令
    - **`auto-edit`**：自动批准文件编辑
    - **`yolo`**：自动批准所有工具
  - **示例：**
    - `/approval-mode plan --project`（为此项目持久化 plan 模式）
    - `/approval-mode yolo --user`（为此用户跨项目持久化 YOLO 模式）

- **`/about`**
  - **说明：** 显示版本信息。提交 issue 时请分享此信息。

- **`/agents`**
  - **说明：** 管理用于专注任务的专用 AI 子代理。子代理是配置了特定专业知识和工具访问权限的独立 AI 助手。
  - **子命令：**
    - **`create`**：
      - **说明：** 启动交互式向导以创建新的子代理。向导会引导你完成位置选择、AI 驱动的提示生成、工具选择和视觉定制。
      - **用法：** `/agents create`
    - **`manage`**：
      - **说明：** 打开交互式管理对话框以查看、编辑和删除现有子代理。显示项目级和用户级代理。
      - **用法：** `/agents manage`
  - **存储位置：**
    - **项目级：** `.qwen/agents/`（与团队共享，优先级更高）
    - **用户级：** `~/.qwen/agents/`（个人代理，跨项目可用）
  - **注意：** 有关创建和管理子代理的详细信息，请参阅 [Subagents documentation](../subagents.md)。

- [**`/tools`**](../tools/index.md)
  - **说明：** 显示当前在 Qwen Code 中可用的工具列表。
  - **用法：** `/tools [desc]`
  - **子命令：**
    - **`desc`** 或 **`descriptions`**：
      - **说明：** 显示每个工具的详细描述，包括提供给模型的每个工具的名称及其完整描述。
    - **`nodesc`** 或 **`nodescriptions`**：
      - **说明：** 隐藏工具描述，仅显示工具名称。

- **`/quit-confirm`**
  - **说明：** 退出 Qwen Code 前显示确认对话框，允许你选择如何处理当前会话。
  - **用法：** `/quit-confirm`
  - **功能：**
    - **立即退出：** 不保存任何内容直接退出（等效于 `/quit`）
    - **生成摘要并退出：** 在退出前使用 `/summary` 创建项目摘要
    - **保存对话并退出：** 在退出前使用自动生成的标签保存当前对话
  - **快捷键：** 按两次 **Ctrl+C** 触发退出确认对话框
  - **注意：** 当你按一次 Ctrl+C 时，此命令会自动触发，提供防止意外退出的安全机制。

- **`/quit`**（或 **`/exit`**）
  - **说明：** 立即退出 Qwen Code，不显示任何确认对话框。

- **`/vim`**
  - **说明：** 切换 vim 模式开或关。启用 vim 模式时，输入区域支持 vim 风格的导航和编辑命令，包括 NORMAL 和 INSERT 模式。
  - **功能：**
    - **NORMAL 模式：** 使用 `h`, `j`, `k`, `l` 导航；使用 `w`, `b`, `e` 按单词跳转；使用 `0`, `$`, `^` 跳转到行首/行尾；使用 `G`（或 `gg` 跳转到第一行）跳转到特定行
    - **INSERT 模式：** 标准文本输入，按 Esc 返回 NORMAL 模式
    - **编辑命令：** 使用 `x` 删除，使用 `c` 更改，使用 `i`, `a`, `o`, `O` 插入；支持复杂操作如 `dd`, `cc`, `dw`, `cw`
    - **计数支持：** 在命令前加数字前缀（如 `3h`, `5w`, `10G`）
    - **重复最后命令：** 使用 `.` 重复最后的编辑操作
    - **持久设置：** Vim 模式偏好保存到 `~/.qwen/settings.json` 并在会话间恢复
  - **状态指示器：** 启用时在页脚显示 `[NORMAL]` 或 `[INSERT]`

- **`/init`**
  - **说明：** 分析当前目录并默认创建 `QWEN.md` 上下文文件（或由 `contextFileName` 指定的文件名）。如果已存在非空文件，则不进行任何更改。该命令会创建一个空文件并提示模型用项目特定的指令填充它。

### 自定义命令

快速入门，请参见下方的[示例](#example-a-pure-function-refactoring-command)。

自定义命令允许你将最喜爱或最常用的 prompts 保存为 Qwen Code 中的个人快捷方式，便于重复使用。你可以创建仅适用于单个项目的命令，也可以创建在所有项目中全局可用的命令，从而简化工作流程并确保一致性。

#### 文件位置与优先级

Qwen Code 从两个位置发现命令，按特定顺序加载：

1.  **用户命令（全局）：** 位于 `~/.qwen/commands/`。这些命令在你正在处理的任何项目中都可用。
2.  **项目命令（本地）：** 位于 `<your-project-root>/.qwen/commands/`。这些命令特定于当前项目，可以纳入版本控制并与团队共享。

如果项目目录中的命令与用户目录中的命令同名，则**始终使用项目命令**。这允许项目使用特定于项目的版本覆盖全局命令。

#### 命令命名与命名空间

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

自定义命令支持两种强大的参数处理方法。CLI 会根据你的命令 `prompt` 内容自动选择正确的方法。

##### 1. 使用 `{{args}}` 的上下文感知注入

如果你的 `prompt` 包含特殊占位符 `{{args}}`，CLI 会将该占位符替换为用户在命令名后输入的文本。

这种注入的行为取决于它被使用的位置：

**A. 原始注入（在 Shell 命令外部）**

当在 prompt 的主体中使用时，参数会按用户输入的原样注入。

**示例 (`git/fix.toml`):**

```toml

# 调用方式：/git:fix "按钮未对齐"

description = "为给定问题生成修复方案。"
prompt = "请为这里描述的问题提供代码修复：{{args}}。"
```

模型接收到：`请为这里描述的问题提供代码修复："按钮未对齐"。`

**B. 在 Shell 命令中使用参数（在 `!{...}` 块内）**

当你在 shell 注入块（`!{...}`）中使用 `{{args}}` 时，参数会在替换前自动进行 **shell 转义**。这使你可以安全地将参数传递给 shell 命令，确保生成的命令语法正确且安全，防止命令注入漏洞。

**示例（`/grep-code.toml`）：**

```toml
prompt = """
请总结模式 `{{args}}` 的查找结果。

搜索结果：
!{grep -r {{args}} .}
"""
```

当你运行 `/grep-code It's complicated`：

1. CLI 检测到 `{{args}}` 在 `!{...}` 块内外都有使用。
2. 块外：第一个 `{{args}}` 被直接替换为原始值 `It's complicated`。
3. 块内：第二个 `{{args}}` 被替换为转义后的版本（例如在 Linux 上为 `"It's complicated"`）。
4. 实际执行的命令为 `grep -r "It's complicated" .`。
5. CLI 会在执行前提示你确认这个确切且安全的命令。
6. 最终 prompt 被发送出去。

##### 2. 默认参数处理

如果你的 `prompt` 中**没有**包含特殊占位符 `{{args}}`，CLI 会使用默认行为来处理参数。

如果你为命令提供了参数（例如 `/mycommand arg1`），CLI 会在 prompt 的末尾追加你输入的完整命令，中间用两个换行符分隔。这样可以让模型同时看到原始指令和你刚刚提供的具体参数。

如果你**没有**提供任何参数（例如 `/mycommand`），prompt 会原样发送给模型，不追加任何内容。

**示例 (`changelog.toml`):**

这个示例展示了如何通过为模型定义角色、说明在哪里找到用户输入以及指定期望的格式和行为来创建一个健壮的命令。

```toml

# In: <project>/.qwen/commands/changelog.toml

# 调用方式：/changelog 1.2.0 added "Support for default argument parsing."

description = "向项目的 CHANGELOG.md 文件添加新条目。"
prompt = """

# 任务：更新 Changelog

你是这个软件项目的专家维护者。用户调用了添加新 changelog 条目的命令。

**用户的原始命令附加在你的指令下方。**

你的任务是从用户输入中解析出 `<version>`、`<change_type>` 和 `<message>`，然后使用 `write_file` 工具正确更新 `CHANGELOG.md` 文件。

## 预期格式
命令遵循此格式：`/changelog <version> <type> <message>`
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

你可以通过在 `prompt` 中直接执行 shell 命令并注入其输出，使你的命令更加动态化。这非常适合从本地环境中获取上下文信息，例如读取文件内容或检查 Git 状态。

当自定义命令尝试执行 shell 命令时，Qwen Code 现在会在继续执行前提示你进行确认。这是一项安全措施，确保只有预期的命令才能被执行。

**工作原理：**

1.  **注入命令：** 使用 `!{...}` 语法。
2.  **参数替换：** 如果块内包含 `{{args}}`，它会自动进行 shell 转义（参见上文 [Context-Aware Injection](#1-context-aware-injection-with-args)）。
3.  **健壮解析：** 解析器能够正确处理包含嵌套大括号的复杂 shell 命令，例如 JSON 负载。**注意：** `!{...}` 内部的内容必须保持大括号（`{` 和 `}`）的平衡。如果你需要执行包含不平衡大括号的命令，建议将其包装在外部脚本文件中，并在 `!{...}` 块内调用该脚本。
4.  **安全检查与确认：** CLI 会对最终解析后的命令（参数转义和替换后）执行安全检查。会出现一个对话框，显示即将执行的确切命令。
5.  **执行与错误报告：** 命令执行后，如果失败，注入到 prompt 中的输出将包含错误信息（stderr），后跟状态行，例如 `[Shell command exited with code 1]`。这有助于模型理解失败的上下文。

**示例 (`git/commit.toml`)：**

该命令获取暂存区的 git diff，并使用它来请求模型生成一条 commit message。

````toml

# 位于：<project>/.qwen/commands/git/commit.toml

# 调用方式：/git:commit

description = "根据暂存的更改生成 Git commit message。"

# prompt 使用 !{...} 来执行命令并注入其输出。
prompt = """
请根据以下 git diff 生成一条 Conventional Commit 格式的 commit message：

```diff
!{git diff --staged}
```

"""

````

当你运行 `/git:commit` 时，CLI 会首先执行 `git diff --staged`，然后将 `!{git diff --staged}` 替换为该命令的输出结果，最后将完整拼接好的 prompt 发送给模型。

##### 4. 使用 `@{...}` 注入文件内容

你可以使用 `@{...}` 语法将文件内容或目录列表直接嵌入到你的 prompt 中。这对于创建需要操作特定文件的命令非常有用。

**工作原理：**

- **文件注入**：`@{path/to/file.txt}` 会被替换为 `file.txt` 的内容。
- **多模态支持**：如果路径指向受支持的图像（如 PNG、JPEG）、PDF、音频或视频文件，它将被正确编码并作为多模态输入注入。其他二进制文件会被优雅地处理并跳过。
- **目录列表**：`@{path/to/dir}` 会被遍历，目录及其所有子目录中的每个文件都会被插入到 prompt 中。如果启用了 `.gitignore` 和 `.qwenignore`，则会遵循这些忽略规则。
- **工作区感知**：命令会在当前目录和任何其他工作区目录中搜索路径。如果绝对路径在工作区内，则允许使用绝对路径。
- **处理顺序**：`@{...}` 的文件内容注入会在 shell 命令 (`!{...}`) 和参数替换 (`{{args}}`) _之前_ 处理。
- **解析**：解析器要求 `@{...}` 内部的内容（即路径）具有平衡的大括号 (`{` 和 `}`)。

**示例 (`review.toml`)：**

此命令注入一个 _固定_ 的最佳实践文件 (`docs/best-practices.md`) 的内容，并使用用户的参数为审查提供上下文。

```toml

```toml
# 位置： <project>/.qwen/commands/review.toml

# 调用方式： /review FileCommandLoader.ts

description = "使用最佳实践指南审查提供的上下文。"
prompt = """
你是一位代码审查专家。

你的任务是审查 {{args}}。

在提供审查意见时，请参考以下最佳实践：

@{docs/best-practices.md}
"""
```

当你运行 `/review FileCommandLoader.ts` 时，`@{docs/best-practices.md}` 占位符会被该文件的内容替换，而 `{{args}}` 则会被你输入的文本替换，之后这个完整的 prompt 才会被发送给模型处理。

#### 示例：一个"纯函数"重构命令

让我们创建一个全局命令，用于要求模型重构一段代码。

**1. 创建文件和目录：**

首先确保用户命令目录存在，然后创建一个 `refactor` 子目录用于组织管理，以及最终的 TOML 文件。

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. 向文件中添加内容：**

在编辑器中打开 `~/.qwen/commands/refactor/pure.toml` 并添加以下内容。我们包含了可选的 `description` 字段作为最佳实践。

```toml

# In: ~/.qwen/commands/refactor/pure.toml

# 此命令将通过以下方式调用：/refactor:pure

description = "要求模型将当前上下文中的代码重构为纯函数。"

prompt = """
请分析我在当前上下文中提供的代码。
将其重构为一个纯函数。

你的回复应包括：
1. 重构后的纯函数代码块。
2. 简要说明你所做的关键更改以及为什么这些更改有助于实现纯函数特性。
"""
```

**3. 运行命令：**

就是这样！你现在可以在 CLI 中运行你的命令了。首先，你可以添加一个文件到上下文中，然后调用你的命令：

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code 将会执行你在 TOML 文件中定义的多行 prompt。

## 输入提示快捷键

这些快捷键直接应用于输入提示中的文本操作。

- **撤销：**
  - **键盘快捷键：** 按 **Ctrl+z** 撤销输入提示中的上一个操作。

- **重做：**
  - **键盘快捷键：** 按 **Ctrl+Shift+Z** 重做输入提示中上次被撤销的操作。

## At 命令（`@`）

At 命令用于将文件或目录的内容作为 prompt 的一部分发送给模型。这些命令支持 Git 感知过滤。

- **`@<文件或目录路径>`**
  - **说明：** 将指定文件或多个文件的内容注入到当前 prompt 中。这在需要针对特定代码、文本或一组文件提问时非常有用。
  - **示例：**
    - `@path/to/your/file.txt 解释这段文字。`
    - `@src/my_project/ 总结这个目录下的代码。`
    - `这个文件是做什么的？@README.md`
  - **详细说明：**
    - 如果提供的是单个文件路径，则读取该文件内容。
    - 如果提供的是目录路径，则尝试读取该目录及其子目录中的所有文件内容。
    - 路径中包含空格时，应使用反斜杠转义（例如：`@My\ Documents/file.txt`）。
    - 内部使用 `read_many_files` 工具实现。内容会被获取并插入到你的查询中，然后再发送给模型。
    - **Git 感知过滤：** 默认情况下会排除被 Git 忽略的文件（如 `node_modules/`、`dist/`、`.env`、`.git/`）。可以通过 `context.fileFiltering` 设置更改此行为。
    - **文件类型：** 此命令适用于基于文本的文件。虽然可能会尝试读取任何类型的文件，但底层的 `read_many_files` 工具为了保证性能和相关性，可能会跳过或截断二进制文件或非常大的文件，并会在输出中标明哪些文件被跳过了。
  - **输出：** CLI 会显示一条工具调用消息，表明已使用了 `read_many_files`，同时附带状态信息以及处理过的文件路径列表。

- **`@`（单独的 @ 符号）**
  - **说明：** 如果你只输入了一个 `@` 符号而没有跟路径，那么整个查询将原样传递给模型。当你确实想在 prompt 中讨论 `@` 这个符号本身时，这种方式很有用。

### `@` 命令的错误处理

- 如果 `@` 后面指定的路径未找到或无效，将显示错误消息，查询可能不会发送到模型，或者会发送但不包含文件内容。
- 如果 `read_many_files` 工具遇到错误（例如权限问题），也会报告此错误。

## Shell 模式和透传命令（`!`）

使用 `!` 前缀可以直接在 Qwen Code 内与系统 shell 进行交互。

- **`!<shell_command>`**
  - **说明：** 使用 `bash`（Linux/macOS）或 `cmd.exe`（Windows）执行指定的 `<shell_command>`。命令的所有输出或错误信息都会显示在终端中。
  - **示例：**
    - `!ls -la`（执行 `ls -la` 并返回 Qwen Code）
    - `!git status`（执行 `git status` 并返回 Qwen Code）

- **`!`（切换 Shell 模式）**
  - **说明：** 单独输入 `!` 可以切换 Shell 模式。
    - **进入 Shell 模式：**
      - 启用后，Shell 模式会使用不同的颜色和“Shell 模式指示器”。
      - 在 Shell 模式下，你输入的内容会被直接解释为 shell 命令。
    - **退出 Shell 模式：**
      - 退出后，UI 将恢复为标准外观，并重新启用正常的 Qwen Code 行为。

- **所有 `!` 使用注意事项：** 在 Shell 模式下执行的命令具有与你在终端中直接运行时相同的权限和影响。

- **环境变量：** 当通过 `!` 或 Shell 模式执行命令时，子进程中会设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否从 CLI 中运行。