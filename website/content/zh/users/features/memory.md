# 记忆

每次 Qwen Code 会话都从一个全新的上下文窗口开始。有三种机制可以在会话之间传递知识，让你不必每次都重新解释：

- **QWEN.md** — 由_你_编写一次，Qwen 在每次会话中都会读取的指令
- **自动记忆** — Qwen 根据从你这里学到的内容自己编写的笔记
- **外部记忆（`context_search`）** — 一个可选的 MCP 工具，Qwen 按需调用它来搜索 Mem0 或本地会话索引

---

## QWEN.md：你给 Qwen 的指令

QWEN.md 是一个纯文本文件，你可以在其中写下 Qwen 应该始终了解的关于你的项目或你的偏好的内容。可以把它看作是在每次对话开始时加载的永久性简报。

### 在 QWEN.md 中写些什么

添加那些否则你每次会话都不得不重复的内容：

- 构建和测试命令（`npm run test`、`make build`）
- 你的团队遵循的编码规范（“所有新文件必须有 JSDoc 注释”）
- 架构决策（“我们使用 Repository 模式，永远不要从控制器直接调用数据库”）
- 个人偏好（“始终使用 pnpm，而不是 npm”）
- 针对高风险工作的验证策略——例如“在得出结论前对照数据库进行验证”（参见[强制基于证据的结论](../common-workflow.md#enforce-evidence-based-conclusions)获取现成模板）

不要包含 Qwen 可以通过阅读你的代码自己弄清楚的内容。QWEN.md 在简短且具体时效果最好——它越长，Qwen 遵循它的可靠性就越低。

### 在哪里创建 QWEN.md

| 文件 | 适用对象 |
| --- | --- |
| `~/.qwen/QWEN.md` | 你，跨所有项目 |
| 项目根目录下的 `QWEN.md` | 你的整个团队（将其提交到版本控制） |
| `.qwen/QWEN.local.md` | 仅限你，仅限此项目（不要提交到 git） |

你可以任意组合使用这些文件。Qwen 会在你启动会话时加载所有这些文件。

如果你的仓库已经有一个供其他 AI 工具使用的 `AGENTS.md` 文件，Qwen 也会读取它。无需重复编写指令。

#### 何时使用 `.qwen/QWEN.local.md`

用于**特定于项目但属于个人**的指令——属于此项目但不应与团队共享的内容：

- 你自己的集群 ID、容器注册表命名空间或云账户
- 硬编码了你本地环境的个人调试命令
- 你希望 Qwen 了解的关于你正在进行的工作的笔记，但不想提交

它在共享的项目 `QWEN.md` **之后**加载，因此你的本地指令可以补充或覆盖团队的指令。

**你必须自己将其添加到 `.gitignore`。** 尽管 `.qwen/` 通常被视为本地目录，但 qwen-code 不会为你生成 `.gitignore`，并且有些项目会提交 `.qwen/settings.json`。将此行添加到你的 `.gitignore`（或你的全局 git ignore）中：

```
.qwen/QWEN.local.md
```

### 使用 `/init` 自动生成

运行 `/init`，Qwen 将分析你的代码库，以创建一个包含它找到的构建命令、测试指令和规范的初始 QWEN.md。如果已经存在一个，它会建议添加内容而不是覆盖。

### 引用其他文件

你可以在 QWEN.md 中指向其他文件，以便 Qwen 也读取它们：

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

在 QWEN.md 的任何地方使用 `@path/to/file`。相对路径从 QWEN.md 文件本身开始解析。

---

## 自动记忆：Qwen 从你这里学到了什么

自动记忆在后台运行。在每次对话之后，Qwen 会悄悄保存它学到的有用内容——你的偏好、你给出的反馈、项目上下文——以便它可以在未来的会话中使用它们，而无需你重复说明。

这与 QWEN.md 不同：你不是编写者，Qwen 才是。

当一轮对话回复了由 [channel](./channels/overview)（GitHub、Telegram、钉钉及其他渠道）转发的消息时，Qwen 不会执行提取，也不会调度[定期清理](#定期清理)：发送者通常不是你，而在每条转发消息后都进行提取会为每条消息增加模型调用。在同时接受你自己提示的会话中（例如绑定到 pull request 的会话），你下一条提示后的提取仍会读取最近的对话，因此其中仍在的转发消息仍可被学习。记忆召回不受影响：对频道消息的回复可以利用已保存的内容。频道聊天在[频道记忆](./channels/overview#channel-memory)中保留持久上下文。

### Qwen 保存什么

Qwen 会寻找四种值得记住的内容：

| 内容 | 示例 |
| --- | --- |
| **关于你** | 你的角色、背景、你喜欢的工作方式 |
| **你的反馈** | 你做出的纠正、你确认的方法 |
| **项目上下文** | 正在进行的工作、决策、从代码中不明显看出的目标 |
| **外部引用** | 你提到的仪表盘、工单跟踪器、文档链接 |

Qwen 不会保存所有内容——只保存下次真正有用的内容。

### 存储位置

自动记忆文件位于 `~/.qwen/projects/<project>/memory/`。同一 checkout 的所有分支共享同一个记忆文件夹，因此 Qwen 在一个分支中学到的内容在其他分支中也可用。每个链接的 git worktree 拥有独立的记忆文件夹，与聊天和其他会话状态的 per-worktree 隔离方式一致——你希望在每个 worktree 中都可用的全仓库规范应放在[团队记忆](#团队记忆与协作者共享)中。

所有保存的内容都是纯 Markdown 格式——你可以随时打开、编辑或删除任何文件。

`MEMORY.md` 是一个紧凑的索引，而非完整的记忆存储。其生成的正文和加载到提示中的部分共享 200 行和 25,000 个 UTF-16 代码单元的限制；截断通知会单独添加。在提示预算计算之前，行尾会被规范化。在大小压力下，完整的普通条目（最多 150 个代码单元）会优先于较长的条目获得空间，保留的条目保持其原始顺序。无法容纳的条目会被整体跳过，因此其 Markdown 链接永远不会从中间被切断。将详细信息保留在链接的主题文件中。

当重建省略条目时，保存的警告会报告丢弃的数量以及每个限制的最多三个名称：主题文件扫描上限和索引正文预算。这些计数保持分开，因为一个分组的团队条目可以代表多个文件。当索引被加载到提示中时，只要警告是文件的最后一段，它仍然可见。在尾部警告之上插入新的索引指针以保留它。从索引中省略不会删除链接的主题文件。对于索引正文压力，合并主题文件或移除过时的主题文件，或缩短它们的 frontmatter 名称和描述。过长的链接已经没有描述：改为缩短其主题文件路径或 frontmatter 名称。仅编辑生成的索引无法在下一次重建中保留。对于文件数量扫描上限，合并主题文件或移除过时的主题文件；仅编辑生成的索引不会减少扫描的文件数量。

对于部分加载的索引，警告会区分行预算和字符预算。即使没有条目超过普通行长度，缩短描述也有助于缓解总字符预算。对于匹配生成格式的条目，该建议涵盖了名称和链接，包括分组链接；当这些链接本身已消耗预算时，应修剪或合并条目。手动编辑的格式或可作为描述文本的分组后缀会给出可能的修复建议，但不保证缩短后一定能容纳。如果超出条目数量限制，仍必须修剪或合并条目：缩短描述不会减少条目数量。当两个预算都超出时，将索引减少到 200 条可能仍需要更短的描述或更少的条目才能满足字符预算；警告会报告实际候选数量。将每条缩短到 150 个单元并不总能满足 25,000 单元的总限制。

一个有界的、单段的尾部写入器通知会被排除在提示预算计算之外。当所有保存的条目都能容纳时，Qwen 会保留该通知，而不会声称在加载时省略了更多条目。重新生成饱和的索引可以重新填充由更短描述释放的空间，因此保存文件的大小不必立即缩小。对于项目、用户和团队记忆，编辑主题文件的 `description` frontmatter 并检查重新生成的索引。空描述可以回退到记忆类型，因此缩短 frontmatter 并不能保证每个条目都能容纳。直接编辑索引行可能会被下一次托管写入覆盖。即使链接超过 150 个单元，也要保持完整的链接目标 intact；缩短显示元数据或修剪/合并主题文件，而不是切断链接。

#### 固定记忆

将需要自动记忆维护保留的手动整理文档放在托管记忆目录下的 `pinned/` 中，例如 `~/.qwen/projects/<project>/memory/pinned/architecture.md` 或 `~/.qwen/memories/pinned/preferences.md`。使用与其他记忆文档相同的 frontmatter。有效的固定文件可被 Qwen 读取，并在下次重建 `MEMORY.md` 时被包含在内，遵循与其他记忆文档相同的文件大小和文件数量限制。

仅直接位于托管记忆根目录内的顶层 `pinned/` 目录受保护；嵌套目录（如 `memory/project/pinned/`）是普通的可写记忆。自动提取和 Dream worker 以不区分大小写的方式匹配该保留目录名称。

自动提取被指示保持固定记录及其有效索引条目不变，而 Dream 被指示在合并期间跳过 `pinned/`。自动提取和 fork 的 Dream worker（包括后台清理）都会在其写入和编辑工具上执行固定文件边界检查，包括通过符号链接解析到 `pinned/` 的路径；其现有的只读 shell 策略会阻止命令行删除。你仍然可以直接控制这些文件，并可以通过显式的 `/forget` 请求移除它们。

> **注意：** 可见的 `/dream` 斜杠命令在主 Agent 上运行。它接收相同的跳过指令，但尚未接收 fork worker 的确定性逐轮工具门控。

### 定期清理

Qwen 会定期遍历其保存的记忆，以删除重复项并清理过时的条目。在积累了足够的会话后，这会在后台每天自动运行一次。如果你想让它立即运行，可以使用 `/dream` 手动触发。

在后台运行清理时，你的会话会正常继续。

### 开启或关闭

自动记忆默认开启。要切换它，请打开 `/memory` 并使用顶部的开关。你可以仅关闭自动保存、仅关闭定期清理，或同时关闭两者。

你也可以在 `~/.qwen/settings.json`（适用于所有项目）或 `.qwen/settings.json`（仅限此项目）中进行设置：

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### 结构化召回（opt-in）

默认情况下，Qwen 将记忆作为扁平的 `MEMORY.md` 索引读取。结构化协议用分层记忆树取而代之，仅注入与当前请求相关的子树，并为 Qwen 提供一个 `search_memory` 工具以按需拉取完整条目——当记忆集合增长超过少量文件时，这会消耗更少的 token。

它默认关闭。在 `settings.json` 中开启（需要重启）：

```json
{
  "memory": {
    "enableStructuredRecall": true
  }
}
```

或通过 `QWEN_CODE_MEMORY_STRUCTURED_RECALL=1` 为单次运行开启。

开启后会启动后台元数据迁移：每个记忆文件会获得召回所需的 frontmatter（类别、关键词、使用场景）。迁移以小批量运行，每轮最多 10 个文件，并且只重写 frontmatter，从不修改笔记正文。当该设置关闭时，迁移不会被调度，因此不会重写任何内容，也不会进行后台模型调用。

### 团队记忆（与协作者共享）

默认情况下，自动记忆是**你私有的**——它位于你的主目录下，永远不会被共享。团队记忆是一个可选的层级，整个团队**通过 git** 共享。

启用后，Qwen 会在**仓库内部**的 `.qwen/team-memory/` 获得第三个记忆目录。它使用与私有层级相同的“每个记忆一个文件”的布局和 `MEMORY.md` 索引。因为它被提交到仓库中，所以它会以常规方式与每个协作者共享：你通过 `git pull` 接收队友的记忆，并通过 commit/push 分享你的记忆。Qwen 会将持久的、全项目范围的知识路由到这里——每个贡献者都必须遵循的规范、共享的引用指针（跟踪器、仪表盘）——而个人和快速过时的笔记则保持私有。

在 `settings.json` 中按项目（或全局）启用它：

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

它**默认关闭**。请记住以下注意事项：

- **它受版本控制，对具有仓库访问权限的每个人可见。** 将团队记忆视为提交到仓库。
- **阻止写入机密信息。** 对 `.qwen/team-memory/` 的写入会扫描凭据（API 密钥、令牌、私钥）；检测到的机密信息会被拒绝，永远不会被写入。扫描是最后一道防线，而不是保证——不要将敏感数据放在那里。
- **更改可被审查。** 团队记忆的写入会像其他任何文件一样出现在 `git status` / PR diff 中，因此可以在提交前进行审查。在默认的批准模式下，Qwen 在每次团队写入前也会询问；在 `AUTO_EDIT`/YOLO 模式（你已选择自动批准）下，它们会在没有提示的情况下应用，但仍然会出现在 diff 中。
- **该目录必须被 git 跟踪。** 如果你的项目的 `.gitignore` 排除了 `.qwen/*`，请重新包含该路径以便共享：

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  注意：使用文件通配符忽略形式（`.qwen/*`），而不是带尾随斜杠的目录形式（`.qwen/`）。目录形式的忽略会使 git 完全跳过该文件夹，因此其下方的 `!` 重新包含将不起作用，并且团队层级在 git 中会保持静默为空。当启用该层级但其目录被 git 忽略或位于任何 git 仓库之外时，Qwen 会在启动时发出一次警告，因此这种错误配置不会被忽略。

`QWEN_CODE_MEMORY_TEAM=1` / `=0` 会覆盖单次运行的设置。

### 自动 git 同步（可选）

默认情况下，你通过常规的 git 工作流共享团队记忆（通过 `pull` 接收，通过 `commit`/`push` 共享）。要让 Qwen 为你执行此操作，请启用同步：

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

开启后，在会话开始时，Qwen 会尽力同步 `.qwen/team-memory/` 目录：它重建共享的 `MEMORY.md` 索引，**首先**快进拉取协作者的更新，然后在之上提交你的团队记忆更改，并**仅推送该同步提交**（通过显式的单分支 refspec）——这样你加载的索引就能反映最新状态。它只**暂存**团队目录（你的其他工作更改永远不会被提交），并且永远不会因 git 失败而阻塞会话。默认关闭。`QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` 会覆盖单次运行的设置。

启用前需要了解的两件事：

- **快进拉取作用于你的整个当前分支，而不仅仅是 `.qwen/team-memory/`**（git 没有路径范围的拉取）。因此，同步会将你的分支快进到远程顶端。相比之下，推送是限定范围的：它**仅发布此同步刚刚创建的提交**，因此它永远不会推送你拥有的其他未推送的提交——如果你的分支已经领先于上游，同步会在本地提交并跳过推送。在快进拉取没有问题的分支上启用它——或者在专用的 checkout 上运行它。
- **分叉的分支保持不变**（`--ff-only` 永远不会合并）。当发生这种情况时，同步在该会话中直接什么都不做；解决分叉（`git pull`）后它会恢复。没有上游（没有跟踪配置）的分支仍然会在本地提交，但会跳过推送——因为没有地方可以推送。

---

## 命令

### `/memory`

打开记忆面板。从这里你可以：

- 开启或关闭自动记忆保存
- 开启或关闭定期清理（dream）
- 打开你的个人 QWEN.md（`~/.qwen/QWEN.md`）
- 打开项目 QWEN.md
- 浏览自动记忆文件夹

### `/memory migrate-team`

将**团队记忆**层级（`.qwen/team-memory/`）迁移到结构化元数据格式：每个文件会获得记忆召回所需的 frontmatter（名称、描述、类别、关键词、使用场景）。个人和项目记忆在启用[结构化召回](#结构化召回opt-in)后会在后台自动迁移；团队记忆通过 git 共享，因此重写仅在显式请求时运行，并作为可审查的提交出现。在启用了团队记忆的受信任工作区中，每个仓库运行一次即可。

### `/init`

为你的项目生成一个初始的 QWEN.md。Qwen 读取你的代码库并填入它发现的构建命令、测试指令和规范。

### `/remember <text>`

立即将某些内容保存到自动记忆中，而无需等待 Qwen 自动获取：

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

删除与你的描述匹配的自动记忆条目：

```
/forget old workaround for the login bug
```

### `/dream`

立即运行记忆清理，而不是等待自动计划：

```
/dream
```

---

## 故障排除

### Qwen 没有遵循我的 QWEN.md

打开 `/memory` 查看加载了哪些文件。如果你的文件未列出，Qwen 无法看到它——请确保它位于项目根目录或 `~/.qwen/` 中。

指令越具体，效果越好：

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

如果你有多个包含冲突指令的 QWEN.md 文件，Qwen 的行为可能会不一致。请检查它们并删除任何矛盾之处。

### 我想看看 Qwen 保存了什么

运行 `/memory` 并选择**打开自动记忆文件夹**。所有保存的记忆都是可读的 Markdown 文件，你可以浏览、编辑或删除它们。

### Qwen 总是忘记事情

如果自动记忆已开启，但 Qwen 似乎无法在会话之间记住内容，请尝试运行 `/dream` 强制执行一次清理。同时检查 `/memory` 以确认两个开关都已启用。

对于你始终希望 Qwen 记住的内容，请将它们添加到 QWEN.md 中——自动记忆是尽力而为的，而 QWEN.md 是有保证的。

---

## 外部记忆（`context_search`）

除了 `QWEN.md` 和自动记忆之外，Qwen Code 还可以通过 `context_search` MCP 工具查询外部记忆服务和本地会话索引。与 `QWEN.md` 和自动记忆不同，`context_search` 由模型按需调用——不会在每轮自动召回或发送任何内容：

- **Mem0（内置适配器）：** 在 `~/.qwen/settings.json` 中配置 `memory.mem0` 以连接到 Mem0 Platform V3、PolarDB 或自托管 Mem0 OSS。参见 [Mem0](./mem0.md) 了解设置和可选的写入确认。
- **External Context MCP Profile v1 服务器：** 任何实现 `context_search({ query })` 契约的 stdio 或 HTTP MCP 服务器都可以通过 `qwen mcp add` 或 `settings.json` 中的 `mcpServers` 注册（设置 `"includeTools": ["context_search"]` 以便仅对 Profile v1 服务器暴露 `context_search`）。

每个条目注册自己的服务器，并且可以同时激活多个——Qwen 分别暴露每个服务器的 `context_search`（例如 `mcp__external-context__context_search` 和 `mcp__deja-context__context_search`），模型在它们之间进行选择，因此只启用你希望搜索的语料库，或在请求中指定后端名称。

无论你使用哪个后端，`context_search` 返回的匹配项都会被添加到 Qwen 的上下文中并发送到为该会话配置的模型提供商，除非你允许，否则调用需要审批——本地索引保持搜索在本地进行，而不是结果。在自动模式下，查询和有界的参数副本也会发送到分类模型。

### deja-vu

一个本地 CLI 和 MCP 服务器，使用本地 BM25 搜索对编码代理（Qwen Code、Claude Code、Codex、Cursor 等）已经写入磁盘的会话记录建立索引，构建或查询索引无需模型调用或 API 密钥。

- **仓库：** https://github.com/vshulcz/deja-vu
- **成本：** 免费开源（MIT）
- **最适合：** 在同一台机器上搜索跨 Qwen Code 和其他本地编码代理的过往会话

#### 可用工具

- `context_search` — 搜索已索引的本地会话记录（`deja mcp --context-search`）

#### 设置

1. 安装 `deja` 二进制文件（例如 `brew install deja-vu`、`npm install -g @vshulcz/deja-vu`，或从 [GitHub releases](https://github.com/vshulcz/deja-vu/releases) 下载）并构建初始索引（`deja index`）。
2. 使用以下任一方法注册服务器：

**方法 1：CLI 命令**

```bash
qwen mcp add deja-context deja mcp --context-search --timeout 8000 --include-tools context_search
```

**方法 2：`settings.json`**

```json
{
  "mcpServers": {
    "deja-context": {
      "command": "deja",
      "args": ["mcp", "--context-search"],
      "timeout": 8000,
      "includeTools": ["context_search"]
    }
  }
}
```

3. 重启 Qwen Code 以便在会话启动时加载新的 MCP 服务器，然后运行 `/mcp` 确认 `deja-context` 已连接（参见 [MCP Servers](./mcp.md)）。

稍后要删除服务器，运行 `qwen mcp remove deja-context`（或从 `~/.qwen/settings.json` 的 `mcpServers` 中删除 `deja-context` 条目）并重启 Qwen Code。