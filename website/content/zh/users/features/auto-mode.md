# 自动模式

自动模式使用 LLM 分类器评估每个工具调用，并决定是否自动批准。它介于自动编辑（仅自动批准文件编辑）和 YOLO（自动批准所有操作）之间。

本文是配置和排查自动模式的参考文档。介绍部分请参阅[审批模式概览](./approval-mode.md#4-自动模式---分类器驱动的审批)。

## 工作原理

当处于自动模式且代理尝试运行某个工具时，Qwen Code 按顺序经过三个层级：

1. **acceptEdits 快速通道**——对工作区内的编辑/写入操作，直接自动批准，无需调用分类器。
   **例外情况：** 涉及 Qwen Code 自身修改面（`.qwen/settings*.json`、`QWEN.md`、`AGENTS.md`、`QWEN.local.md`、已配置的上下文文件名、`.qwen/rules/`、`.qwen/commands/`、`.qwen/agents/`、`.qwen/skills/`、`.qwen/hooks/`、`.mcp.json`）以及持久化面（`.git/`、`.husky/`、`package.json`、`.npmrc`、`Makefile`、`.github/workflows/` 等）的写入操作，即使在工作区内，也会经过分类器处理。指向受保护路径的符号链接也会被解析并拒绝。通过 `cd && bash -lc '...'` 或其他包装器触及这些路径的 Shell 命令同样会经过分类器。
2. **安全工具白名单**——只读和仅元数据的内置工具（Read、Grep、Glob、LS、LSP、TodoWrite、AskUserQuestion 等）直接自动批准，无需调用分类器。
3. **LLM 分类器**——其余所有操作（Shell 命令、网络获取、子代理生成、工作区外的编辑、MCP 工具）发送给一个两阶段分类器：
   - **阶段 1（快速）**——仅输出 `{ shouldBlock }`。大约耗时 300ms。若 `shouldBlock` 为 `false`，则允许继续执行。
   - **阶段 2（思考）**——仅当阶段 1 判定阻断时运行。采用思维链审查减少阶段 1 的误判。可将阶段 1 的阻断降级为允许。阻断时输出用户可见的 `reason`。

分类器使用你配置的快速模型（`/model --fast`）。若未配置快速模型，则使用主会话模型。

## 硬性规则仍然优先

自动模式**不会**取代硬性的权限规则。在分类器运行之前：

- `permissions.deny` 规则会直接阻断操作并显示规则原因。分类器不会看到它。
- `permissions.allow` 规则中带有特定限定符的（例如 `Bash(git status)`、`Read(./docs/**)`）仍会直接允许，无需分类器——**除非**调用解析为对受保护的自修改或持久化路径的写入操作（参见“工作原理”中的列表）。在这种情况下，自动模式会通过分类器重新检查调用，以免一条 `Bash(*)` 的允许规则悄悄变成重写 Qwen Code 设置、命令、钩子、技能或 MCP 服务器的权限。
- `permissions.ask` 规则会强制在自动模式下也需要手动确认。

## 宽泛的允许规则在自动模式下被剥离

类似以下规则会让代理不经分类器审查就执行任意代码：

- `Bash` / `Bash(*)` / `Bash()` —— 自动允许所有 Shell 命令
- `Bash(python:*)`、`Bash(node*)`、`Bash(bash*)` —— 解释器通配符
- `Agent` / `Agent(coder)` —— 对 Agent 工具的任何允许
- `Skill` / `Skill(pdf)` —— 对 Skill 工具的任何允许

当进入自动模式时，Qwen Code 会从当前权限集中临时移除这些规则，并打印一条列出它们的通知。退出自动模式后，这些规则会恢复。不会修改 `settings.json`。

如果你确实需要这些宽泛规则，请改用 YOLO 模式。

## 配置提示词

自动模式会读取 `settings.json` 中的 `permissions.autoMode`。其中的条目是自然语言描述，而非规则模式——它们会被附加注入到分类器的系统提示词中，与内置默认值并存。

共有三种提示类别加上一个环境列表：

- **`allow`** —— 分类器应自动批准的操作。
- **`softDeny`** —— 破坏性或不可逆的操作，分类器应**阻止，除非用户最近的明确请求要求该确切操作及其范围**。软拒绝可由用户意图清除；笼统的“行，做吧”不算。
- **`hardDeny`** —— 安全边界操作，分类器在自动模式下**必须**阻止，不论 `autoMode.hints.allow` 或最近的用户意图如何。这是分类器策略，而非确定性权限规则：它不会覆盖 `permissions.allow`。对于权限管理器绝不允许的操作，请使用 `permissions.deny`。

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

`hints.deny` 仍然兼容，视为 `softDeny`。两者可以混用——条目会拼接，`softDeny` 在前。

### 长度和数量限制

为保持分类器系统提示词简短：

- 每个条目最多 200 个字符（超长条目会被截断并显示警告）。
- `hints.allow`、`hints.softDeny` 和 `hints.hardDeny` 各最多接受 50 个条目。
- `environment` 最多接受 20 个条目。

### 跨设置文件的层叠

`autoMode` 的合并方式与其他权限设置相同（系统/用户/工作区设置）：数组合并并去重。

## 解读判定

当分类器阻断某个操作时，工具调用会失败并显示以下错误文本之一：

- **`Blocked by auto mode policy: <reason>`** —— 分类器判定操作不安全。原因来自分类器第 2 阶段。
- **`Auto mode classifier unavailable; action blocked for safety`** —— 分类器 API 不可达、超时或返回了无法解析的响应。这是失败关闭行为：有疑虑时阻断。

两条消息后面会跟一条指引行，告知代理**被拒绝的具体操作**不得通过其他工具、Shell 间接方式、生成的脚本、别名、符号链接、配置更改、钩子、命令文件、MCP 配置、编码载荷或等效路径来完成。**不相关的安全操作以及确实更安全的替代操作仍允许**——只有试图通过不同途径完成相同被拒绝意图的尝试才会被阻止。

如果被拒绝的操作确实必要，代理应停止并请求你明确批准，而不是绕过拒绝。

### 分类器原因语言

分类器原因由 LLM 生成，不进行翻译。如果你想要非英文的原因，请在 `permissions.autoMode.environment` 中添加一条提示，例如 `Respond reasons in Chinese`。

## 回退到手动批准

自动模式可防止你陷入僵局：

- 连续 **3 次策略阻断**后，下一次工具调用会回退到标准的手动批准提示。这可以避免代理不断尝试被禁止命令的微小变体。
- 连续 **2 次不可用**结果（分类器 API 故障）后，下一次工具调用也会回退。这可以避免等待故障分类器。

会话本身仍处于自动模式——仅单次回退调用会经过手动批准。当你批准回退调用或切换模式时，计数器会重置。

如果你频繁遇到回退，最可能的原因是分类器 API 中断或提示词需要调整。排查期间请切换为默认模式。

## 故障排除

**“自动模式一直阻止我的命令”**

查看错误消息中的原因。如果分类器对你的上下文过于保守，请在 `permissions.autoMode.hints.allow` 中添加一条用自然语言描述该模式的条目。示例：

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**“自动模式分类器不可用”**

分类器 API 未响应。可能的原因：

- 你与模型端点之间的网络问题。
- 配置的快速模型不再可用——检查 `/model --fast`。
- 转录记录太长，超出快速模型上下文窗口。

排查期间，请切换回默认模式：`/approval-mode default`。

**“回退到手动批准”**

你已触发 3 次连续阻断或 2 次连续不可用的保护机制。像平常一样批准或拒绝提示。一次批准回退后，连续计数器会重置。

**分类器看到了我提示中的敏感数据**

工具输入在到达分类器之前，会通过每个工具的 `toAutoClassifierInput` 方法进行投影。长的编辑内容、网络获取提示和子代理提示会被截断。工具结果（文件内容、网页）永远不会发送给分类器——只有用户文本和助手工具调用会经过。

如果某个工具暴露了你希望隐藏的字段，请提交一个 issue 并注明工具名称；投影是每个工具独立的，并计划随着时间的推移收紧。

## 局限性

- **不能离线使用。** 分类器需要 LLM 调用。
- **慢路径会增加延迟。** 白名单 + acceptEdits 覆盖大部分调用，没有延迟，但 `run_shell_command` 通常会增加约 300ms（分类器快速路径）或约 3-5s（包含思考审查的慢路径）。
- **不能替代 `deny` 规则。** 分类器是尽力而为。对于你确信绝不应运行的命令，请将其放入 `permissions.deny`。
- **MCP 工具默认采取保守阻止。** 第三方 MCP 工具（`mcp__*`）通过 `toAutoClassifierInput` 覆盖选择性地转发参数。未选择加入的工具仅向分类器暴露其名称——大多数此类调用会被保守地阻止，除非你编写了显式的 `allow` 规则。这是设计上的失败关闭（凭据和大量内容不会泄露到分类器 LLM 中）。如果你信任某个特定的 MCP 工具，请添加 `permissions.allow: ["mcp__server__tool"]` 使其完全绕过分类器。

## 常见问题

**自动模式会向第三方发送我的代码吗？**

自动模式复用了你现有的模型配置——与主代理使用相同的端点。如果你将 Qwen Code 配置为使用自托管模型，分类器也会针对该端点运行。

**我的密钥/.env 内容会到达分类器吗？**

分类器只能看到每个工具的 `toAutoClassifierInput` 投影暴露的内容：

- `read_file` 和其他只读工具：不调用（它们属于快速路径白名单）。
- `edit` / `write_file`：file_path 加上旧/新内容的前 80 个字符。完整内容不会转发。
- `run_shell_command`：完整的命令（必须如此——分类器正是据此判断）。
- `web_fetch`：仅 URL。prompt 字段不会转发。
- `agent`：子代理类型加上完整提示。提示是子代理将遵循的指令，因此分类器需要完整的提示内容来检测试图引导子代理执行破坏性操作的攻击——与 `run_shell_command` 转发完整命令的原因相同。

工具结果（工具返回的实际内容）会从分类器转录中完全剥离。

MCP 工具（`mcp__*`）遵循更严格的默认设置：除非 MCP 工具作者通过 `toAutoClassifierInput` 覆盖明确选择加入，否则不会转发其参数。分类器看到工具名称但没有参数，因此大多数 MCP 调用会被保守地阻止，除非用户编写了显式的允许规则。这是设计上的失败关闭——第三方工具不应在无意中将凭证或大量文件内容泄露给分类器 LLM。

**能否关闭首次使用的提示信息？**

它每个用户设置文件只显示一次。关闭后，`ui.autoModeAcknowledged: true` 会被写入用户设置。

**这与自动编辑有何不同？**

自动编辑只自动批准文件编辑，其他操作（如 Shell 命令）仍会询问。自动模式使用分类器来同时自动批准安全的 Shell 命令和其他工具调用，同时仍然阻止有风险的操作。

**这与 YOLO 有何不同？**

YOLO 自动批准所有操作，不做任何审查。自动模式有分类器参与，会阻止有风险的操作。