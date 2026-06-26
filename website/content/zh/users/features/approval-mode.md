# 审批模式

Qwen Code 提供五种不同的权限模式，让你可以根据任务复杂度和风险等级灵活控制 AI 对代码和系统的交互方式。

## 权限模式对比

| 模式       | 文件编辑                   | Shell 命令                      | 最佳适用场景                                                               | 风险等级 |
| -------- | ---------------------- | ----------------------------- | ---------------------------------------------------------------------- | ---- |
| **计划**   | ❌ 只读分析                 | ❌ 不执行                        | • 代码探索 <br>• 规划复杂变更 <br>• 安全代码审查                                     | 最低   |
| **询问权限** | ✅ 需手动批准                | ✅ 需手动批准                      | • 新/不熟悉的代码库 <br>• 关键系统 <br>• 团队协作 <br>• 学习与教学                             | 低    |
| **自动编辑** | ✅ 自动批准                 | ❌ 需手动批准                      | • 日常开发任务 <br>• 重构与代码优化 <br>• 安全自动化                                    | 中    |
| **自动**   | ✅ 分类器评估                | ✅ 分类器评估                      | • 长时间自主会话 <br>• 自动编辑过于保守但 YOLO 风险太高时                                | 中    |
| **YOLO** | ✅ 自动批准                 | ✅ 自动批准                       | • 可信的个人项目 <br>• 自动化脚本/CI/CD <br>• 批量处理任务                              | 最高   |

> [!NOTE]
>
> 之前名为 **Default** 的模式已重命名为 **询问权限**，以更好地描述其行为。底层配置值（`tools.approvalMode: "default"`）和 `/approval-mode default` 命令保持不变以保持向后兼容。

### 快速参考指南

- **从计划模式开始**：非常适合在做出更改前理解代码
- **在询问权限模式下工作**：适用于大多数开发工作的平衡选择
- **切换为自动编辑**：当你需要大量安全代码更改时
- **尝试自动模式**：当你希望减少中断但仍需对 shell 命令和网络调用保持安全时——LLM 分类器会评估每次调用
- **谨慎使用 YOLO**：仅在受控环境下用于信任的自动化任务

> [!tip]
>
> 你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）快速循环切换模式。终端状态栏会显示当前模式，因此你始终知道 Qwen Code 拥有哪些权限。

> 循环顺序为：**计划 → 默认 → 自动编辑 → 自动 → YOLO → 计划 → ...**

## 1. 使用计划模式进行安全代码分析

计划模式指示 Qwen Code 通过 **只读** 操作分析代码库来创建计划，非常适合探索代码库、规划复杂变更或安全审查代码。

### 何时使用计划模式

- **多步骤实现**：当你的功能需要编辑多个文件时
- **代码探索**：当你想在更改任何内容之前彻底研究代码库时
- **交互式开发**：当你想与 Qwen Code 一起迭代方向时

### 如何使用计划模式

**在会话中打开计划模式**

你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）循环切换权限模式来进入计划模式。

如果你在普通模式下，**Shift+Tab**（或 Windows 上的 **Tab**）首先切换到 `auto-edits` 模式，终端底部会显示 `⏵⏵ accept edits on`。再次按下 **Shift+Tab**（或 Windows 上的 **Tab**）将切换到计划模式，终端底部会显示 `⏸ plan mode`。

**使用 `/plan` 命令**

`/plan` 命令提供了快速进入和退出计划模式的快捷方式：

常规的规划请求不会自动切换模式。如果你想要只读的计划模式工作流，请使用 `/plan`、键盘快捷键，或将审批模式显式设置为 `plan`。

```bash
/plan                          # 进入计划模式
/plan refactor the auth module # 进入计划模式并开始规划
/plan exit                     # 退出计划模式，恢复之前的模式
```

当你使用 `/plan exit` 退出计划模式时，之前的审批模式会自动恢复（例如，如果你在进入计划模式前处于自动编辑模式，则会返回到自动编辑模式）。

**以计划模式启动新会话**

要以计划模式启动新会话，使用 `/approval-mode` 然后选择 `plan`

```bash
/approval-mode
```

**在计划模式下运行“无头”查询**

你也可以直接使用 `-p` 或 `prompt` 在计划模式下运行查询：

```bash
qwen --prompt "What is machine learning?"
```

### 示例：规划复杂重构

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code 进入计划模式并分析当前实现以创建全面计划。通过后续问题完善：

```
What about backward compatibility?
How should we handle database migration?
```

### 将计划模式配置为默认

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. 使用询问权限模式进行受控交互

询问权限模式是与 Qwen Code 工作的标准方式。在此模式下，你完全控制所有可能危险的操作——Qwen Code 会在进行任何文件更改或执行 shell 命令之前征求你的批准。

### 何时使用询问权限模式

- **新接触代码库**：当你探索不熟悉的项目并希望格外谨慎时
- **关键系统**：当处理生产代码、基础设施或敏感数据时
- **学习与教学**：当你想了解 Qwen Code 采取的每一步时
- **团队协作**：当多人同时在同一个代码库上工作时
- **复杂操作**：当更改涉及多个文件或复杂逻辑时

### 如何使用询问权限模式

**在会话中打开询问权限模式**

你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）循环切换权限模式来进入询问权限模式。如果你在其他模式下，按下 **Shift+Tab**（或 Windows 上的 **Tab**）最终会循环回询问权限模式，终端底部会没有任何模式指示符。

**以询问权限模式启动新会话**

询问权限模式是启动 Qwen Code 时的初始模式。如果你更改了模式并想返回询问权限模式，请使用：

```
/approval-mode default
```

**在询问权限模式下运行“无头”查询**

运行无头命令时，询问权限模式是默认行为。你可以显式指定：

```
qwen --prompt "Analyze this code for potential bugs"
```

### 示例：安全实现功能

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code 将分析你的代码库并提出计划。然后它会在以下操作前征求批准：

1. 创建新文件（控制器、模型、迁移）
2. 修改现有文件（添加新列、更新 API）
3. 运行任何 shell 命令（数据库迁移、依赖安装）

你可以逐个审查每个提议的更改并批准或拒绝。

### 将询问权限模式配置为默认

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. 自动编辑模式

自动编辑模式指示 Qwen Code 自动批准文件编辑，同时要求手动批准 shell 命令，非常适合在保持系统安全的同时加速开发工作流。

自动批准的编辑工具包括 `edit`、`write_file` 和 `notebook_edit`。

### 何时使用自动编辑模式

- **日常开发**：适用于大多数编码任务
- **安全自动化**：允许 AI 修改代码，同时防止意外执行危险命令
- **团队协作**：在共享项目中使用，避免对他人造成意外影响

### 如何切换到该模式

```
# 通过命令切换
/approval-mode auto-edit

# 或使用键盘快捷键
Shift+Tab（Windows 上为 Tab） # 从其他模式切换
```

### 工作流示例

1. 你让 Qwen Code 重构一个函数
2. AI 分析代码并提出更改
3. **自动**应用所有文件更改，无需确认
4. 如果需要运行测试，它将**请求批准**来执行 `npm test`

## 4. 自动模式 - 分类器驱动的审批

自动模式介于自动编辑和 YOLO 之间。LLM 分类器会评估每个 shell 命令、网络调用和工作区外编辑，并自动批准它认为安全的操作，同时阻止风险高的操作。大多数只读操作和工作区内编辑会绕过分类器以提高速度。

参见 [auto-mode.md](./auto-mode.md) 获取完整参考（提示配置、故障排除、常见问题）。

### 何时使用自动模式

- **长时间自主会话**：当询问权限模式频繁打断但 YOLO 风险过高时。
- **可信项目**：内部代码库，代理应持续运行，但你仍希望对破坏性 shell 命令和出站网络调用设置防护。
- **无头/定时运行**：自动编辑不够（代理也需要运行 shell 命令），但你希望对 `rm -rf /`、`curl ... | sh`、凭证泄露等保持安全。

### 如何使用自动模式

**在会话中打开自动模式**

按下 **Shift+Tab**（Windows 上为 **Tab**）循环切换到自动模式。状态栏会显示当前模式。

**使用 `/approval-mode` 命令**

```
/approval-mode auto
```

首次进入自动模式时，会显示一条信息消息解释其工作原理。该通知不会再次出现。

**以自动模式启动新会话**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### 自动模式自动批准与阻止的内容

分类器在不确定时倾向于阻止。默认值：

- **自动批准**：只读命令（ls、cat、git status、grep、find）、当前工作目录中的包安装、构建/测试命令、工作区内的文件编辑、仅本地操作。
- **阻止**：不可逆的破坏（rm -rf /、fdisk、mkfs）、外部代码执行（curl | sh、远程内容 eval）、凭证泄露、未授权的持久化（.bashrc 编辑、crontab）、安全性削弱、强制推送到 main/master。

你可以通过 settings.json 中的自然语言提示自定义分类器的判断。参见 [auto-mode.md](./auto-mode.md#configuring-hints)。

### 安全护栏

- **硬规则仍然生效**：`permissions.deny` 规则会在分类器运行前阻止操作。
- **过于宽泛的允许规则在自动模式下被剥离**：例如 `permissions.allow: ["Bash"]`（允许所有 shell 命令）会破坏分类器；进入自动模式会暂时禁用此类规则，以便分类器工作。退出自动模式时这些规则会被恢复。磁盘上的设置永远不会被修改。
- **故障关闭**：当分类器 API 不可达时，操作会被阻止而非允许。连续两次不可用调用后，下一个工具调用将回退到手动批准。
- **循环保护**：连续三次策略阻止后，下一次调用也会回退到手动批准，以免代理在死胡同方法上循环。

### 示例

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code 进行文件编辑（工作区内的编辑绕过分类器），运行 `npm test`（分类器判断为安全），并在尝试像 `rm -rf /Users/me/.aws` 这样的危险操作时显示阻止。你可以内联查看原因并决定是否切换到询问权限模式处理该步骤。

### 将自动模式配置为默认

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
    },
  },
}
```

## 5. YOLO 模式 - 完全自动化

YOLO 模式授予 Qwen Code 最高权限，自动批准所有工具调用，包括文件编辑和 shell 命令。

### 何时使用 YOLO 模式

- **自动化脚本**：运行预定义的自动化任务
- **CI/CD 管道**：在受控环境中自动执行
- **个人项目**：在完全可信的环境中快速迭代
- **批处理**：需要多步命令链的任务

> [!warning]
>
> **谨慎使用 YOLO 模式**：AI 可以使用你的终端权限执行任何命令。请确保：
>
> 1. 你信任当前的代码库
> 2. 你了解 AI 将要执行的所有操作
> 3. 重要文件已备份或提交到版本控制

### 如何启用 YOLO 模式

```
# 临时启用（仅当前会话）
/approval-mode yolo

# 设置为项目默认
/approval-mode yolo --project

# 设置为用户全局默认
/approval-mode yolo --user
```

### 配置示例

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### 自动化工作流示例

```bash
# 完全自动化的重构任务
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# 无需人工干预，AI 将：
# 1. 运行测试命令（自动批准）
# 2. 修复失败的测试用例（自动编辑文件）
# 3. 执行 git commit（自动批准）
```

## 模式切换与配置

### 键盘快捷键切换

在 Qwen Code 会话期间，使用 **Shift+Tab**（Windows 上为 **Tab**）快速循环切换五种模式：

```
计划模式 → 询问权限模式 → 自动编辑模式 → 自动模式 → YOLO 模式 → 计划模式
```

### 持久配置

```
// 项目级别：./.qwen/settings.json
// 用户级别：~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // 或 "plan"、"default"、"auto"、"yolo"
  }
}
```

### 模式使用建议

1. **新接触代码库**：从 **计划模式** 开始，进行安全探索
2. **日常开发任务**：使用 **自动编辑模式**（默认模式），高效且安全
3. **自动化脚本**：在受控环境使用 **YOLO 模式** 实现完全自动化
4. **复杂重构**：先使用 **计划模式** 进行详细规划，然后切换到适当模式执行