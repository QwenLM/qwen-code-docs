# Memory

每次 Qwen Code 会话都从全新的上下文窗口开始。以下两种机制可以在会话之间传递知识，让你无需每次重复说明：

- **QWEN.md** — 由_你_编写一次，Qwen 在每次会话中都会读取
- **Auto-memory** — Qwen 根据从你这里学到的内容自动记录的笔记

---

## QWEN.md：你给 Qwen 的指令

QWEN.md 是一个纯文本文件，你可以在其中记录 Qwen 应该始终了解的项目信息或个人偏好。可以把它看作一份在每次对话开始时自动加载的永久简报。

### 应该在 QWEN.md 中写什么

添加那些否则每次会话都需要重复说明的内容：

- 构建和测试命令（`npm run test`、`make build`）
- 团队遵循的编码规范（"所有新文件必须有 JSDoc 注释"）
- 架构决策（"我们使用 repository 模式，永远不要在 controller 中直接调用数据库"）
- 个人偏好（"始终使用 pnpm，不要用 npm"）

不要添加 Qwen 通过阅读代码就能发现的内容。QWEN.md 简短且具体时效果最好——内容越长，Qwen 遵循得越不可靠。

### 在哪里创建 QWEN.md

| 文件                          | 适用范围                                             |
| ----------------------------- | ---------------------------------------------------- |
| `~/.qwen/QWEN.md`             | 你，跨所有项目                                       |
| 项目根目录下的 `QWEN.md`      | 整个团队（提交到版本控制）                           |
| `.qwen/QWEN.local.md`         | 仅限你，仅限当前项目（不要提交到 git）               |

你可以组合使用任意几种。Qwen 在启动会话时会加载所有这些文件。

如果你的仓库已有供其他 AI 工具使用的 `AGENTS.md` 文件，Qwen 也会读取它。无需重复编写指令。

#### 何时使用 `.qwen/QWEN.local.md`

用于**特定于项目但属于个人**的指令——这些内容属于该项目，但不应与团队共享：

- 你自己的集群 ID、容器镜像仓库命名空间或云账号
- 硬编码了本地环境的个人调试命令
- 你希望 Qwen 了解但不想提交的进行中工作的备注

它在共享项目 `QWEN.md` **之后**加载，因此你的本地指令可以补充或覆盖团队的配置。

**你需要自行将其加入 gitignore。** 尽管 `.qwen/` 通常被视为本地目录，但 qwen-code 不会自动为你生成 `.gitignore`，而且有些项目会提交 `.qwen/settings.json`。请在你的 `.gitignore`（或全局 git ignore）中添加以下行：

```
.qwen/QWEN.local.md
```

### 使用 `/init` 自动生成

运行 `/init`，Qwen 会分析你的代码库，生成一份包含构建命令、测试说明和它发现的规范的 QWEN.md 初始文件。如果文件已存在，它会建议补充内容而不是覆盖。

### 引用其他文件

你可以在 QWEN.md 中指向其他文件，让 Qwen 也读取它们：

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

在 QWEN.md 中任意位置使用 `@path/to/file`。相对路径从 QWEN.md 文件本身所在位置解析。

---

## Auto-memory：Qwen 对你的了解

Auto-memory 在后台运行。每次对话结束后，Qwen 会悄悄保存它学到的有用信息——你的偏好、你给出的反馈、项目上下文——以便在未来的会话中使用，无需你重复说明。

这与 QWEN.md 不同：不是由你来写，而是由 Qwen 来写。

### Qwen 会保存什么

Qwen 会寻找四类值得记录的内容：

| 类型                    | 示例                                                         |
| ----------------------- | ------------------------------------------------------------ |
| **关于你**              | 你的角色、背景、工作方式偏好                                 |
| **你的反馈**            | 你做的纠正、你认可的方法                                     |
| **项目上下文**          | 进行中的工作、决策、从代码中不明显的目标                     |
| **外部引用**            | 你提到的 dashboard、工单追踪系统、文档链接                   |

Qwen 不会保存所有内容——只保存下次真正有用的信息。

### 存储位置

Auto-memory 文件存储在 `~/.qwen/projects/<project>/memory/`。同一仓库的所有分支和 worktree 共享同一个 memory 文件夹，因此 Qwen 在某个分支学到的内容在其他分支也可用。

所有保存的内容都是纯 markdown 格式——你可以随时打开、编辑或删除任何文件。

### 定期清理

Qwen 会定期整理已保存的记忆，删除重复项并清理过时条目。在积累足够多的会话后，每天会在后台自动运行一次。如果想立即执行，可以用 `/dream` 手动触发。

清理运行时，屏幕角落会显示 **✦ dreaming**。你的会话正常继续。

### 开启或关闭

Auto-memory 默认开启。要切换状态，打开 `/memory` 并使用顶部的开关。你可以单独关闭自动保存、单独关闭定期清理，或两者都关闭。

也可以在 `~/.qwen/settings.json`（应用于所有项目）或 `.qwen/settings.json`（仅当前项目）中设置：

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## 命令

### `/memory`

打开 Memory 面板。在这里你可以：

- 开启或关闭 auto-memory 保存
- 开启或关闭定期清理（dream）
- 打开个人 QWEN.md（`~/.qwen/QWEN.md`）
- 打开项目 QWEN.md
- 浏览 auto-memory 文件夹

### `/init`

为你的项目生成一份 QWEN.md 初始文件。Qwen 会读取你的代码库，填入它发现的构建命令、测试说明和规范。

### `/remember <text>`

立即将某内容保存到 auto-memory，无需等待 Qwen 自动提取：

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

删除与你描述匹配的 auto-memory 条目：

```
/forget old workaround for the login bug
```

### `/dream`

立即运行 memory 清理，无需等待自动调度：

```
/dream
```

---

## 故障排除

### Qwen 没有遵循我的 QWEN.md

打开 `/memory` 查看已加载的文件。如果你的文件未列出，说明 Qwen 看不到它——确保文件在项目根目录或 `~/.qwen/` 中。

具体明确的指令效果更好：

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

如果你有多个 QWEN.md 文件且指令相互冲突，Qwen 的行为可能会不一致。请检查并消除矛盾。

### 我想查看 Qwen 保存了什么

运行 `/memory` 并选择 **Open auto-memory folder**。所有保存的记忆都是可读的 markdown 文件，你可以浏览、编辑或删除。

### Qwen 一直忘记某些内容

如果 auto-memory 已开启但 Qwen 似乎无法在会话间记住内容，可以尝试运行 `/dream` 强制执行一次清理。同时检查 `/memory` 以确认两个开关都已启用。

对于你始终希望 Qwen 记住的内容，请将其添加到 QWEN.md 中——auto-memory 是尽力而为的，QWEN.md 才是有保障的。
