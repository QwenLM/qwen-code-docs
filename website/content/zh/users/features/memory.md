# Memory

每次启动 Qwen Code 会话时，都会使用全新的上下文窗口。以下两种机制可以在会话之间传递知识，让你无需每次重复说明：

- **QWEN.md** —— 你只需编写一次，Qwen 会在每次会话中读取的指令
- **Auto-memory** —— Qwen 根据从你那里学到的内容自动生成的笔记

---

## QWEN.md：你给 Qwen 的指令

QWEN.md 是一个纯文本文件，用于记录你希望 Qwen 始终了解的项目信息或个人偏好。你可以把它看作一份永久简报，在每次对话开始时自动加载。

### 在 QWEN.md 中写什么

添加那些你原本需要在每次会话中重复说明的内容：

- 构建和测试命令（`npm run test`、`make build`）
- 团队遵循的编码规范（“所有新文件必须包含 JSDoc 注释”）
- 架构决策（“我们使用 repository 模式，绝不在 controller 中直接调用数据库”）
- 个人偏好（“始终使用 pnpm，而不是 npm”）

不要包含 Qwen 可以通过阅读代码自行推断的内容。QWEN.md 越简短具体效果越好——内容越长，Qwen 遵循指令的可靠性就越低。

### 在哪里创建 QWEN.md

| 文件 | 适用对象 |
| ----------------------------- | --------------------------------------------- |
| `~/.qwen/QWEN.md` | 你本人，适用于所有项目 |
| 项目根目录下的 `QWEN.md` | 整个团队（请提交到版本控制系统） |

你可以同时使用两者。启动会话时，Qwen 会加载它找到的所有 QWEN.md 文件——包括你的个人配置文件和项目中的配置文件。

如果你的仓库中已经为其他 AI 工具准备了 `AGENTS.md` 文件，Qwen 也会读取它。无需重复编写指令。

### 使用 `/init` 自动生成

运行 `/init`，Qwen 将分析你的代码库，并生成一个包含构建命令、测试说明和发现的规范的初始 QWEN.md。如果文件已存在，它会建议添加内容，而不是直接覆盖。

### 引用其他文件

你可以在 QWEN.md 中指向其他文件，让 Qwen 一并读取：

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

在 QWEN.md 的任何位置使用 `@path/to/file`。相对路径将相对于 QWEN.md 文件本身进行解析。

---

## Auto-memory：Qwen 从你那里学到的内容

Auto-memory 在后台运行。每次对话结束后，Qwen 会静默保存它学到的有用信息——你的偏好、你提供的反馈、项目上下文等，以便在未来的会话中直接使用，无需你重复说明。

这与 QWEN.md 不同：你不需要手动编写，Qwen 会自动生成。

### Qwen 保存的内容

Qwen 会寻找以下四类值得记住的信息：

| 类别 | 示例 |
| ----------------------- | -------------------------------------------------------- |
| **关于你** | 你的角色、背景、工作习惯 |
| **你的反馈** | 你做出的修正、你确认的方案 |
| **项目上下文** | 正在进行的工作、决策、代码中不明显的目标 |
| **外部参考** | 你提到的仪表盘、工单系统、文档链接 |

Qwen 不会保存所有内容——只保存下次真正有用的信息。

### 存储位置

Auto-memory 文件存储在 `~/.qwen/projects/<project>/memory/`。同一仓库的所有分支和 worktree 共享同一个 memory 文件夹，因此 Qwen 在一个分支中学到的内容在其他分支中同样可用。

所有保存的内容均为纯 Markdown 格式——你可以随时打开、编辑或删除任何文件。

### 定期清理

Qwen 会定期遍历已保存的记忆，以移除重复项并清理过时的条目。在积累足够多的会话后，该过程每天会在后台自动运行一次。如果你想立即执行，可以使用 `/dream` 手动触发。

清理运行时，屏幕角落会显示 **✦ dreaming**。你的会话将正常继续。

### 开启或关闭

Auto-memory 默认处于开启状态。要切换开关，请打开 `/memory` 并使用顶部的开关。你可以仅关闭自动保存、仅关闭定期清理，或同时关闭两者。

你也可以在 `~/.qwen/settings.json`（适用于所有项目）或 `.qwen/settings.json`（仅适用于当前项目）中进行配置：

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

打开 Memory 面板。在此你可以：

- 开启或关闭 auto-memory 自动保存
- 开启或关闭定期清理（dream）
- 打开你的个人 QWEN.md（`~/.qwen/QWEN.md`）
- 打开项目 QWEN.md
- 浏览 auto-memory 文件夹

### `/init`

为你的项目生成初始 QWEN.md。Qwen 会读取你的代码库，并自动填入构建命令、测试说明以及发现的规范。

### `/remember <text>`

立即将内容保存到 auto-memory，无需等待 Qwen 自动捕获：

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

立即执行记忆清理，无需等待自动调度：

```
/dream
```

---

## 故障排查

### Qwen 未遵循我的 QWEN.md

打开 `/memory` 查看已加载的文件。如果你的文件未列出，说明 Qwen 无法读取它——请确保文件位于项目根目录或 `~/.qwen/` 中。

指令越具体，效果越好：

- ✓ `TypeScript 文件使用 2 空格缩进`
- ✗ `把代码格式化得好看点`

如果你有多个包含冲突指令的 QWEN.md 文件，Qwen 的行为可能会不一致。请检查并移除相互矛盾的内容。

### 我想查看 Qwen 保存的内容

运行 `/memory` 并选择 **打开 auto-memory 文件夹**。所有保存的记忆均为可读的 Markdown 文件，你可以浏览、编辑或删除它们。

### Qwen 总是忘记内容

如果 auto-memory 已开启，但 Qwen 似乎无法在会话之间记住内容，请尝试运行 `/dream` 强制执行一次清理。同时检查 `/memory`，确认两个开关均已启用。

对于你希望 Qwen 始终记住的内容，请直接添加到 QWEN.md 中——auto-memory 是尽力而为，而 QWEN.md 是确定生效的。