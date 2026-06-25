# Auto Mode

Auto Mode 使用 LLM 分类器评估每次工具调用，并决定是否自动批准。它介于 Auto-Edit（仅自动批准文件编辑）和 YOLO（自动批准一切）之间。

本页是配置和排查 Auto Mode 问题的参考文档。
如需了解入门介绍，请参阅
[审批模式概览](./approval-mode.md#4-auto-mode---classifier-driven-approval)。

## 工作原理

当你处于 Auto Mode 且 agent 尝试运行工具时，Qwen Code
会按顺序经过三层检查：

1. **acceptEdits 快速路径** — 目标路径在工作区内的 Edit / Write 操作会自动批准，无需调用分类器。
   **例外情况：** 对 Qwen Code 自身自修改路径的写入
   （`.qwen/settings*.json`、`QWEN.md`、`AGENTS.md`、`QWEN.local.md`、
   已配置的上下文文件名、`.qwen/rules/`、`.qwen/commands/`、
   `.qwen/agents/`、`.qwen/skills/`、`.qwen/hooks/`、`.mcp.json`）以及
   持久化路径（`.git/`、`.husky/`、`package.json`、`.npmrc`、
   `Makefile`、`.github/workflows/` 等）即使在工作区内也会路由到分类器。
   指向受保护路径的符号链接会被解析并拒绝。通过
   `cd && bash -lc '...'` 或其他包装器访问这些路径的 shell 命令同样需要经过分类器。
2. **安全工具白名单** — 只读和仅元数据的内置工具
   （Read、Grep、Glob、LS、LSP、TodoWrite、AskUserQuestion 等）会自动批准，无需调用分类器。
3. **LLM 分类器** — 其他所有操作（shell 命令、Web 请求、
   子 agent 启动、工作区外的编辑、MCP 工具）会发送至两阶段分类器：
   - **阶段 1（快速）** — 仅输出 `{ shouldBlock }`，约 ~300ms。
     如果 `shouldBlock` 为 `false`，则允许该操作并继续执行。
   - **阶段 2（思考）** — 仅在阶段 1 判定为阻止时运行。使用
     思维链复核以降低阶段 1 的误报率，可将阶段 1 的"阻止"降级为"允许"。阻止时会输出用户可见的 `reason`。

分类器使用你配置的快速模型
（`/model --fast`）。若未配置快速模型，则使用主会话模型代替。

## 硬规则优先级更高

Auto Mode **不会**替换硬权限规则。在分类器运行之前：

- `permissions.deny` 规则会以该规则的原因阻止操作，分类器不会看到该请求。
- 带有特定说明符的 `permissions.allow` 规则（例如
  `Bash(git status)`、`Read(./docs/**)`）仍会不经分类器直接自动允许——
  **除非**该调用最终解析为对受保护自修改或持久化路径的写入（见"工作原理"中的列表）。
  在此情况下，Auto Mode 会重新通过分类器检查该调用，
  以防止 `Bash(*)` 的允许规则悄悄演变为重写 Qwen Code 设置、命令、hooks、
  skills 或 MCP 服务器的权限。
- `permissions.ask` 规则即使在 Auto Mode 下也会强制手动确认。

## 过宽的允许规则在 Auto Mode 下会被移除

以下类型的规则会让 agent 在不经分类器审查的情况下执行任意代码：

- `Bash` / `Bash(*)` / `Bash()` — 自动允许所有 shell 命令
- `Bash(python:*)`、`Bash(node*)`、`Bash(bash*)` — 解释器通配符
- `Agent` / `Agent(coder)` — 任何对 Agent 工具的允许规则
- `Skill` / `Skill(pdf)` — 任何对 Skill 工具的允许规则

进入 Auto Mode 时，Qwen Code 会临时从活动权限集中移除这些规则，并打印通知列出它们。离开 Auto Mode 后规则立即恢复。`settings.json` 不会被修改。

如果你确实需要这些宽泛规则，请改用 YOLO 模式。

## 配置 hints

Auto Mode 从你的 `settings.json` 中读取 `permissions.autoMode`。
其中的条目是自然语言描述，而非规则模式——它们会以追加方式注入分类器的系统提示词，与内置默认值共同生效。

共有三类 hint 和一个环境列表：

- **`allow`** — 分类器应自动批准的操作。
- **`softDeny`** — 分类器应阻止的破坏性或不可逆操作，**除非用户最近的明确请求要求执行该确切操作和范围**。用户意图可以清除软拒绝；"随便做"这类笼统同意不算数。
- **`hardDeny`** — 分类器在 Auto Mode 下必须阻止的安全边界操作，无论 `autoMode.hints.allow` 或最近的用户意图如何。这是分类器策略，不是确定性权限规则：它不会覆盖 `permissions.allow`。如需确保某些操作永远不被权限管理器允许，请使用 `permissions.deny`。

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

`hints.deny` 仍可向后兼容使用，等同于 `softDeny`。两者混用没问题——条目会合并，`softDeny` 排在前面。

### 长度与数量限制

为保持分类器系统提示词精简：

- 每条条目上限为 200 个字符（超出部分会被截断并给出警告）。
- `hints.allow`、`hints.softDeny` 和 `hints.hardDeny` 各最多接受 50 条。
- `environment` 最多接受 20 条。

### 跨配置文件的层叠合并

`autoMode` 在系统 / 用户 / 工作区设置文件中的合并方式与其他权限设置相同：数组会拼接并去重。

## 解读决策结果

当分类器阻止某操作时，工具调用会失败并显示以下错误文本之一：

- **`Blocked by auto mode policy: <reason>`** —
  分类器判定该操作不安全。原因来自分类器的阶段 2。
- **`Auto mode classifier unavailable; action blocked for safety`** —
  分类器 API 无法访问、超时或返回了无法解析的响应。这是失败关闭行为：有疑问时即阻止。

两条消息后面都会附带一行指引，告知 agent **被拒绝的具体操作**不得通过其他工具、shell 间接方式、生成的脚本、别名、符号链接、
配置更改、hook、命令文件、MCP 配置、编码载荷或等效路径完成。**无关的安全操作和真正更安全的替代方案仍然允许**——只有试图通过不同途径实现相同被拒绝意图的行为会被阻止。

如果被拒绝的操作确实必要，agent 应停下来向你请求明确批准，而不是绕过拒绝。

### 分类器原因的语言

分类器原因由 LLM 生成，不会自动翻译。如果你需要非英文的原因，
可在 `permissions.autoMode.environment` 中添加类似
`Respond reasons in Chinese` 的 hint。

## 回退到手动审批

Auto Mode 会保护你免于卡住：

- 连续 **3 次策略阻止**后，下一次工具调用会回退到标准手动审批提示。这可以捕捉 agent 反复尝试被禁命令的细微变体的情况。
- 连续 **2 次不可用**结果（分类器 API 故障）后，下一次工具调用同样会回退。这可以避免在损坏的分类器上无限等待。

会话本身保持在 Auto Mode——只有那次回退调用需要手动审批。批准回退调用或切换模式后，计数器会重置。

如果你发现自己频繁触发回退，最可能的原因是分类器 API 故障或 hints 需要调整。排查期间请切换到 Default Mode。

## 故障排查

**"Auto mode 一直阻止我的命令"**

查看错误消息中的原因。如果分类器对你的使用场景过于保守，
请在 `permissions.autoMode.hints.allow` 中添加一条自然语言描述的条目。示例：

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Auto mode classifier unavailable"**

分类器 API 没有响应。可能原因：

- 你与模型端点之间存在网络问题。
- 已配置的快速模型不再可用——请检查 `/model --fast`。
- 对话记录过长，超出快速模型的上下文窗口。

排查期间请切换回 Default Mode：`/approval-mode default`。

**"Falling back to manual approval"**

你触发了连续 3 次阻止或连续 2 次不可用的保护机制。像往常一样批准或拒绝提示。一次批准的回退后，连续计数器会重置。

**分类器看到了我提示词中的敏感数据**

工具输入在到达分类器之前会经过每个工具的 `toAutoClassifierInput` 方法进行投影。长篇编辑内容、Web 请求提示词和子 agent 提示词会被截断。工具结果（文件内容、网页内容）永远不会发送给分类器——只有用户文本和 assistant 的工具调用会经过分类器。

如果某个特定工具暴露了你希望编辑掉的字段，请提交 issue 并注明工具名称；投影是按工具配置的，预计会随时间逐步收紧。

## 限制

- **不支持离线使用。** 分类器需要调用 LLM。
- **在慢速路径上会增加延迟。** 白名单 + acceptEdits 覆盖了大多数无延迟调用，但 `run_shell_command` 通常会增加约 ~300ms（快速分类器路径）或 ~3-5s（带思考复核的慢速路径）。
- **不能替代 `deny` 规则。** 分类器是尽力而为的。对于确定不应运行的命令，请将其加入 `permissions.deny`。
- **MCP 工具默认保守阻止。** 第三方 MCP 工具（`mcp__*`）需通过
  `toAutoClassifierInput` 重写来选择开启参数转发。未选择开启的工具只向分类器暴露其名称——大多数此类调用会被保守地阻止，除非你写了明确的 `allow` 规则。这是设计上的失败关闭行为（凭据和大量内容不会泄露到分类器 LLM 中）。如果你信任某个特定的 MCP 工具，可添加 `permissions.allow: ["mcp__server__tool"]` 使其完全绕过分类器。

## FAQ

**Auto Mode 会将我的代码发送给第三方吗？**

Auto Mode 复用你现有的模型配置——与主 agent 使用相同的端点。
如果你已将 Qwen Code 配置为使用自托管模型，分类器也会在该端点上运行。

**我的 secrets / `.env` 内容会到达分类器吗？**

分类器只能看到每个工具的 `toAutoClassifierInput` 投影所暴露的内容：

- `read_file` 及其他只读工具：不会被调用（它们在快速路径白名单上）。
- `edit` / `write_file`：file_path 加上 old/new 内容的前 80 个字符。完整内容不会转发。
- `run_shell_command`：完整命令（必须如此——这正是分类器需要判断的内容）。
- `web_fetch`：仅 URL。prompt 字段不会转发。
- `agent`：子 agent 类型加上完整提示词。提示词是子 agent 将遵循的指令，分类器需要完整内容来检测可能将子 agent 引向破坏性行为的攻击——原因与 `run_shell_command` 转发完整命令相同。

工具结果（工具实际返回的内容）会从分类器对话记录中完全剥离。

MCP 工具（`mcp__*`）遵循更严格的默认规则：除非 MCP 工具作者通过 `toAutoClassifierInput` 重写明确选择开启，否则其参数不会转发。分类器只能看到工具名称而无法看到任何参数，因此大多数 MCP 调用会被保守地阻止，除非用户写了明确的允许规则。这是设计上的失败关闭行为——第三方工具不应在未经意图的情况下将凭据或大量文件内容泄露到分类器 LLM 中。

**能禁用首次使用时的提示信息吗？**

该信息每个用户设置文件只显示一次。关闭后，
`ui.autoModeAcknowledged: true` 会写入你的用户设置。

**这与 Auto-Edit 有什么区别？**

Auto-Edit 只自动批准文件编辑，不处理其他操作——shell 命令仍需手动确认。Auto Mode 使用分类器来自动批准安全的 shell 命令和其他工具调用，同时阻止高风险操作。

**这与 YOLO 有什么区别？**

YOLO 不经任何审查自动批准一切。Auto Mode 在循环中有分类器参与，会阻止高风险操作。
