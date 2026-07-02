# 自动模式

自动模式使用 LLM 分类器来评估每次工具调用，并决定是否自动批准。它介于 Auto-Edit（仅自动批准文件编辑）和 YOLO（自动批准所有操作）之间。

本页是配置和排查自动模式问题的参考指南。有关简介，请参阅[审批模式概述](./approval-mode.md#4-auto-mode---classifier-driven-approval)。

## 工作原理

当你处于自动模式且 agent 尝试运行工具时，Qwen Code 会按顺序执行以下三个层级：

1. **acceptEdits 快速路径** — 目标路径在工作区内的 Edit / Write 操作无需调用分类器即可自动批准。**例外情况：** 对 Qwen Code 自身的自修改表面（`.qwen/settings*.json`、`QWEN.md`、`AGENTS.md`、`QWEN.local.md`、配置的上下文文件名、`.qwen/rules/`、`.qwen/commands/`、`.qwen/agents/`、`.qwen/skills/`、`.qwen/hooks/`、`.mcp.json`）和持久化表面（`.git/`、`.husky/`、`package.json`、`.npmrc`、`Makefile`、`.github/workflows/` 等）的写入，即使在工作区内，也会路由到分类器。指向受保护路径的符号链接也会被解析并拒绝。通过 `cd && bash -lc '...'` 或其他包装器到达这些路径的 Shell 命令同样会经过分类器。
2. **安全工具白名单** — 只读和仅元数据的内置工具（Read、Grep、Glob、LS、LSP、TodoWrite、AskUserQuestion 等）无需调用分类器即可自动批准。
3. **LLM 分类器** — 其他所有操作（Shell 命令、Web 抓取、子 agent 生成、工作区外的编辑、MCP 工具）都会发送给两阶段分类器：
   - **阶段 1（快速）** — 仅输出 `{ shouldBlock }`。耗时约 300ms。如果 `shouldBlock` 为 `false`，则允许该操作并继续调用。
   - **阶段 2（思考）** — 仅在阶段 1 判定为阻止时运行。使用思维链（chain-of-thought）审查来减少阶段 1 的误报。可以将阶段 1 的阻止降级为允许。在阻止时输出用户可见的 `reason`。

分类器使用你配置的快速模型（`/model --fast`）。如果未配置快速模型，则使用主会话模型。

> [!tip]
>
> 权限系统检测为只读的 Shell 命令（例如 `ls`、`cat`、`git log`）在到达分类器之前会被自动批准。设置 `permissions.autoMode.classifyAllShell: true` 可覆盖此行为，将所有 Shell 命令路由到分类器——请参阅下方的[对所有 Shell 命令进行分类](#classify-all-shell-commands)。

## 硬性规则仍然优先

自动模式**不会**替换硬性权限规则。在分类器运行之前：

- `permissions.deny` 规则会阻止操作并给出规则指定的原因。分类器永远不会看到它。
- 带有特定说明符的 `permissions.allow` 规则（例如 `Bash(git status)`、`Read(./docs/**)`）仍然无需分类器即可自动允许——**除非**调用解析为对受保护的自修改或持久化路径的写入（请参阅“工作原理”下的列表）。在这种情况下，自动模式会通过分类器重新检查调用，因此 `Bash(*)` 上的允许规则不会悄悄变成重写 Qwen Code 设置、命令、钩子、技能或 MCP 服务器的权限。
- `permissions.ask` 规则即使在自动模式下也会强制要求手动确认。

## 在自动模式下，过于宽泛的允许规则会被剥离

类似以下的规则会让 agent 无需分类器审查即可执行任意代码：

- `Bash` / `Bash(*)` / `Bash()` — 自动允许所有 Shell 命令
- `Bash(python:*)`、`Bash(node*)`、`Bash(bash*)` — 解释器通配符
- `Agent` / `Agent(coder)` — 对 Agent 工具的任何允许
- `Skill` / `Skill(pdf)` — 对 Skill 工具的任何允许

当你进入自动模式时，Qwen Code 会从活动权限集中临时移除这些规则，并打印一条列出这些规则的通知。一旦你离开自动模式，这些规则就会恢复。`settings.json` 永远不会被修改。

如果你确实需要这些宽泛的规则，请改用 YOLO 模式。

## 配置 hints

自动模式从 `settings.json` 中读取 `permissions.autoMode`。这些条目是自然语言描述，而不是规则模式——它们会与内置默认值一起，附加注入到分类器的系统提示中。

共有三个 hint 类别加上一个环境列表：

- **`allow`** — 分类器应自动批准的操作。
- **`softDeny`** — 破坏性或不可逆的操作，分类器应阻止这些操作，**除非用户最近的明确请求要求执行该确切操作和范围**。软拒绝可以通过用户意图清除；泛泛的“是的，随便做”不算数。
- **`hardDeny`** — 安全边界操作，无论 `autoMode.hints.allow` 或最近的用户意图如何，分类器在自动模式下都必须阻止这些操作。这是分类器策略，不是确定性的权限规则：它不会覆盖 `permissions.allow`。对于权限管理器绝对不允许的操作，请使用 `permissions.deny`。

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Running poetry install and poetry update in this Python project",
          "Cleaning build artifacts under ./dist or ./build",
          "Reading any file under /Users/me/code/"
        ],
        "softDeny": [
          "Editing Qwen Code settings unless I explicitly ask for the exact change",
          "Running migration scripts that touch the production DB"
        ],
        "hardDeny": [
          "Sending secrets or .env contents to any network endpoint",
          "Modifying anything under ~/.ssh or ~/.aws"
        ]
      },
      "environment": [
        "This is a private monorepo with strict commit signing",
        "Production credentials live in 1Password, never in plain files"
      ]
    }
  }
}
```

`hints.deny` 仍被接受以保持向后兼容，并被视为 `softDeny`。混合使用两者没问题——条目会连接在一起，`softDeny` 在前。

### 长度和数量限制

为了保持分类器系统提示简短：

- 每个条目最多 200 个字符（较长的条目会被截断并显示警告）。
- `hints.allow`、`hints.softDeny` 和 `hints.hardDeny` 每个最多接受 50 个条目。
- `environment` 最多接受 20 个条目。

### 跨设置文件的层级合并

`autoMode` 在系统/用户/工作区设置之间的合并方式与其他权限设置相同：数组会被连接并去重。

### 对所有 Shell 命令进行分类

默认情况下，只读 Shell 命令（`ls`、`cat`、`git status` 等）无需调用分类器即可自动批准——权限系统在第 3 层将它们检测为安全并完全跳过分类器。将 `classifyAllShell` 设置为 `true` 可强制**所有** Shell 命令（包括只读命令）经过分类器：

```json
{
  "permissions": {
    "autoMode": {
      "classifyAllShell": true
    }
  }
}
```

这对于生产或高安全环境非常有用，你需要纵深防御：即使是看似无害的命令也会在执行前由分类器审查。代价是增加了延迟（每次只读 Shell 调用约 300ms）并依赖分类器的可用性——如果分类器 API 不可达，只读 Shell 命令也会被阻止（故障时关闭/fail-closed）。

> [!note]
>
> `classifyAllShell` 仅影响 Shell 命令（`run_shell_command` 和 `monitor`）。内置只读工具（`read_file`、`grep_search`、`glob`、`list_directory` 等）不受影响，仍使用快速路径白名单。

## 解读决策结果

当分类器阻止某个操作时，工具调用会失败并显示以下错误文本之一：

- **`Blocked by auto mode policy: <reason>`** — 分类器判定该操作不安全。原因来自分类器的阶段 2。
- **`Auto mode classifier unavailable; action blocked for safety`** — 分类器 API 不可达、超时或返回了无法解析的响应。这是故障时关闭（fail-closed）行为：存疑时即阻止。

这两条消息后都会跟着一行指导说明，告诉 agent **被拒绝的具体操作**绝不能通过其他工具、Shell 间接调用、生成的脚本、别名、符号链接、配置更改、钩子、命令文件、MCP 配置、编码的有效载荷或等效路径来完成。**不相关的安全工作和真正更安全的替代方案仍然被允许**——只有试图通过不同途径完成相同被拒绝意图的尝试才会被阻止。

如果确实需要执行被拒绝的操作，agent 应停下来请求你的明确批准，而不是绕过拒绝。

### 分类器原因语言

分类器的原因由 LLM 生成，不会被翻译。如果你需要非英语的原因，可以在 `permissions.autoMode.environment` 中添加类似 `Respond reasons in Chinese` 的提示。

## 回退到手动审批

自动模式可防止你陷入僵局：

- 在**连续 3 次策略阻止**后，下一次工具调用将回退到标准的手动审批提示。这可以捕获 agent 不断尝试被禁止命令的微小变体的情况。
- 在**连续 2 次不可用**结果（分类器 API 故障）后，下一次工具调用也会回退。这避免了等待损坏的分类器。

会话本身保持在自动模式——只有单次回退调用会经过手动审批。当你批准回退调用或切换模式时，计数器会重置。

如果你发现自己经常触发回退，最可能的原因是分类器 API 中断或 hints 需要调整。在排查问题时，请切换到默认模式（Default Mode）。

## 故障排查

**“自动模式一直阻止我的命令”**

查看错误消息中的原因。如果分类器对你的上下文来说过于保守，请在 `permissions.autoMode.hints.allow` 中添加一个用自然语言描述该模式的条目。示例：

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**“自动模式分类器不可用”**

分类器 API 没有响应。可能的原因：

- 你与模型端点之间的网络问题。
- 配置的快速模型不再可用——请检查 `/model --fast`。
- 对话记录太长，超出了快速模型的上下文窗口。

在诊断时，请切换回默认模式：`/approval-mode default`。

**“回退到手动审批”**

你触发了连续 3 次阻止或连续 2 次不可用的保护机制。像往常一样批准或拒绝提示。在一次批准的回退后，连续计数器会重置。

**分类器在我的提示中看到了敏感数据**

工具输入在到达分类器之前，会通过每个工具的 `toAutoClassifierInput` 方法进行投影（映射）。长编辑内容、Web 抓取提示和子 agent 提示会被截断。工具结果（文件内容、网页）永远不会发送给分类器——只有用户的文本和 assistant 的工具调用会经过。

如果特定工具暴露了你想要删除的字段，请提交一个包含该工具名称的 issue；投影是特定于工具的，并且会随着时间的推移而收紧。

## 局限性

- **不支持离线。** 分类器需要 LLM 调用。
- **在慢路径上增加延迟。** 白名单 + acceptEdits 涵盖了大多数无延迟的调用，但 `run_shell_command` 通常会增加约 300ms（快速分类器路径）或约 3-5 秒（带思考审查的慢路径）。
- **不能替代 `deny` 规则。** 分类器是尽力而为的。对于你确定绝对不应运行的命令，请将它们放入 `permissions.deny`。
- **MCP 工具默认保守阻止。** 第三方 MCP 工具（`mcp__*`）通过 `toAutoClassifierInput` 覆盖来选择加入参数转发。未选择加入的工具仅向分类器暴露其名称——除非你编写了明确的 `allow` 规则，否则大多数此类调用会被保守阻止。这是设计上的故障时关闭（fail-closed）（凭据和大量内容不会泄漏到分类器 LLM 中）。如果你信任特定的 MCP 工具，请添加 `permissions.allow: ["mcp__server__tool"]` 以使其完全绕过分类器。

## FAQ

**自动模式会将我的代码发送给第三方吗？**

自动模式重用你现有的模型配置——与主 agent 使用相同的端点。如果你配置 Qwen Code 使用自托管模型，分类器也会针对该端点运行。

**我的 secrets / `.env` 内容会到达分类器吗？**

分类器只能看到每个工具的 `toAutoClassifierInput` 投影所暴露的内容：

- `read_file` 和其他只读工具：不会被调用（它们在快速路径白名单中）。
- `edit` / `write_file`：file_path 加上旧/新内容的前 80 个字符。不会转发完整内容。
- `run_shell_command`：完整命令（必须如此——这是分类器评判的内容）。
- `web_fetch`：仅 URL。不会转发 prompt 字段。
- `agent`：子 agent 类型加上完整 prompt。prompt 是子 agent 将遵循的指令，因此分类器需要完整的 prompt 来检测会将子 agent 引向破坏性操作的攻击——这与 `run_shell_command` 转发完整命令的原因相同。

工具结果（工具返回的实际内容）会从分类器对话记录中完全剥离。

MCP 工具（`mcp__*`）遵循更严格的默认设置：除非 MCP 工具作者通过 `toAutoClassifierInput` 覆盖明确选择加入，否则不会转发其参数。分类器只能看到工具名称而看不到参数，因此除非用户编写了明确的允许规则，否则大多数 MCP 调用会被保守阻止。这是设计上的故障时关闭（fail-closed）——第三方工具不应在无意中将凭据或大量文件内容泄漏到分类器 LLM 中。

**我可以禁用首次信息提示吗？**

它每个用户设置文件只显示一次。关闭后，会在你的用户设置中设置 `ui.autoModeAcknowledged: true`。

**这与 Auto-Edit 有何不同？**

Auto-Edit 仅自动批准文件编辑——Shell 命令仍会询问。自动模式使用分类器来自动批准安全的 Shell 命令和其他工具调用，同时仍然阻止有风险的调用。

**这与 YOLO 有何不同？**

YOLO 自动批准所有操作而不进行任何审查。自动模式将分类器置于循环中并阻止有风险的操作。