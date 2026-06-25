# 审批模式

Qwen Code 提供五种不同的权限模式，让你可以根据任务复杂度和风险等级，灵活控制 AI 与代码和系统的交互方式。

## 权限模式对比

| 模式                    | 文件编辑              | Shell 命令            | 适用场景                                                                                              | 风险等级 |
| ----------------------- | --------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| **Plan**​               | ❌ 仅只读分析         | ❌ 不执行             | • 代码探索 <br>• 规划复杂变更 <br>• 安全代码审查                                                     | 最低     |
| **Ask Permissions**​    | ✅ 需手动审批         | ✅ 需手动审批         | • 新项目/不熟悉的代码库 <br>• 关键系统 <br>• 团队协作 <br>• 学习与教学                               | 低       |
| **Auto-Edit**​          | ✅ 自动审批           | ❌ 需手动审批         | • 日常开发任务 <br>• 重构与代码优化 <br>• 安全自动化                                                 | 中       |
| **Auto**​               | ✅ 分类器评估         | ✅ 分类器评估         | • 长时间自主会话 <br>• Auto-Edit 太谨慎但 YOLO 又太危险的场景                                        | 中       |
| **YOLO**​               | ✅ 自动审批           | ✅ 自动审批           | • 受信任的个人项目 <br>• 自动化脚本/CI/CD <br>• 批处理任务                                           | 最高     |

> [!NOTE]
>
> 原名为 **Default** 的模式已重命名为 **Ask Permissions**，以更准确地描述其行为。底层配置值（`tools.approvalMode: "default"`）和 `/approval-mode default` 命令保持不变，以确保向后兼容。

### 快速参考指南

- **从 Plan 模式开始**：在做变更之前先理解代码的好选择
- **在 Ask Permissions 模式下工作**：适合大多数开发工作的均衡选择
- **切换到 Auto-Edit**：当你需要进行大量安全的代码变更时
- **尝试 Auto 模式**：当你希望减少中断但仍希望对 shell 命令和网络调用保持安全保障时——LLM 分类器会评估每次调用
- **谨慎使用 YOLO**：仅在受控环境中用于受信任的自动化任务

> [!tip]
>
> 你可以在会话中使用 **Shift+Tab**（Windows 上使用 **Tab**）快速切换模式。终端状态栏会显示当前模式，让你随时了解 Qwen Code 拥有哪些权限。

> 切换顺序为：**plan → default → auto-edit → auto → yolo → plan → ...**

## 1. 使用 Plan 模式进行安全代码分析

Plan 模式指示 Qwen Code 通过**只读**操作分析代码库并制定计划，非常适合探索代码库、规划复杂变更或安全地审查代码。

### 何时使用 Plan 模式

- **多步骤实现**：当你的功能需要修改多个文件时
- **代码探索**：当你希望在修改任何内容之前彻底研究代码库时
- **交互式开发**：当你希望与 Qwen Code 迭代讨论方向时

### 如何使用 Plan 模式

**在会话中开启 Plan 模式**

你可以在会话中使用 **Shift+Tab**（Windows 上使用 **Tab**）循环切换权限模式，进入 Plan 模式。

如果你处于普通模式，**Shift+Tab**（Windows 上使用 **Tab**）会先切换到 `auto-edits` 模式，终端底部显示 `⏵⏵ accept edits on`。再次按 **Shift+Tab**（Windows 上使用 **Tab**）即可进入 Plan 模式，显示 `⏸ plan mode`。

**使用 `/plan` 命令**

`/plan` 命令提供了进入和退出 Plan 模式的快捷方式：

普通的规划请求本身不会切换模式。如果你需要只读的 Plan 模式工作流，请使用 `/plan`、键盘快捷键，或显式将审批模式设置为 `plan`。

```bash
/plan                          # 进入 plan 模式
/plan refactor the auth module # 进入 plan 模式并开始规划
/plan exit                     # 退出 plan 模式，恢复之前的模式
```

使用 `/plan exit` 退出 Plan 模式时，之前的审批模式会自动恢复（例如，如果你在进入 Plan 模式之前处于 Auto-Edit 模式，则会返回 Auto-Edit 模式）。

**在 Plan 模式下启动新会话**

要在 Plan 模式下启动新会话，使用 `/approval-mode` 并选择 `plan`：

```bash
/approval-mode
```

**在 Plan 模式下运行"无头"查询**

你也可以使用 `-p` 或 `prompt` 直接在 Plan 模式下运行查询：

```bash
qwen --prompt "What is machine learning?"
```

### 示例：规划复杂重构

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code 进入 Plan 模式，分析当前实现并创建全面的计划。可以通过追问进一步细化：

```
What about backward compatibility?
How should we handle database migration?
```

### 将 Plan 模式设置为默认模式

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. 使用 Ask Permissions 模式进行受控交互

Ask Permissions 模式是使用 Qwen Code 的标准方式。在此模式下，你对所有潜在风险操作保有完全控制权——Qwen Code 在进行任何文件变更或执行 shell 命令之前都会征求你的审批。

### 何时使用 Ask Permissions 模式

- **初次接触代码库**：当你在探索不熟悉的项目并希望格外谨慎时
- **关键系统**：在生产代码、基础设施或敏感数据上工作时
- **学习与教学**：当你希望了解 Qwen Code 每一步操作时
- **团队协作**：当多人在同一代码库上工作时
- **复杂操作**：当变更涉及多个文件或复杂逻辑时

### 如何使用 Ask Permissions 模式

**在会话中开启 Ask Permissions 模式**

你可以在会话中使用 **Shift+Tab**​（Windows 上使用 **Tab**）循环切换权限模式。从任何其他模式，持续按 **Shift+Tab**（Windows 上使用 **Tab**）最终会回到 Ask Permissions 模式，终端底部不显示任何模式标识。

**在 Ask Permissions 模式下启动新会话**

Ask Permissions 模式是启动 Qwen Code 时的初始模式。如果你更改了模式并希望返回 Ask Permissions 模式，请使用：

```
/approval-mode default
```

**在 Ask Permissions 模式下运行"无头"查询**

运行无头命令时，Ask Permissions 模式是默认行为。你也可以显式指定：

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

Qwen Code 会分析你的代码库并提出方案，然后在以下操作前征求你的审批：

1. 创建新文件（controllers、models、migrations）
2. 修改现有文件（添加新列、更新 API）
3. 运行任何 shell 命令（数据库迁移、依赖安装）

你可以逐一审查每项提议的变更，并单独审批或拒绝。

### 将 Ask Permissions 模式设置为默认模式

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto Edits 模式

Auto-Edit 模式指示 Qwen Code 自动审批文件编辑，同时要求对 shell 命令手动审批，非常适合在加速开发工作流的同时保持系统安全。

自动审批的编辑工具包括 `edit`、`write_file` 和 `notebook_edit`。

### 何时使用 Auto-Accept Edits 模式

- **日常开发**：适合大多数编码任务
- **安全自动化**：允许 AI 修改代码，同时防止意外执行危险命令
- **团队协作**：在共享项目中使用，避免对他人造成意外影响

### 如何切换到此模式

```
# 通过命令切换
/approval-mode auto-edit

# 或使用键盘快捷键
Shift+Tab（Windows 上使用 Tab） # 从其他模式切换
```

### 工作流示例

1. 你要求 Qwen Code 重构一个函数
2. AI 分析代码并提出变更
3. **自动**​应用所有文件变更，无需确认
4. 如果需要运行测试，它会**请求审批**​才能执行 `npm test`

## 4. Auto 模式——分类器驱动的审批

Auto 模式介于 Auto-Edit 和 YOLO 之间。LLM 分类器对每个 shell 命令、网络调用和工作区外的编辑进行评估，对判断为安全的操作自动审批，同时阻止有风险的操作。大多数只读操作和工作区内的编辑会跳过分类器以提升速度。

完整参考（hints 配置、故障排查、FAQ）请参阅 [auto-mode.md](./auto-mode.md)。

### 何时使用 Auto 模式

- **长时间自主会话**：当 Ask Permissions 模式打断太频繁，但 YOLO 又风险太高时。
- **受信任的项目**：内部代码库中，希望 agent 持续推进，但仍需对破坏性 shell 命令和出站网络调用保持防护。
- **无头/定时运行**：Auto-Edit 不够用（agent 还需要运行 shell 命令），但希望对 `rm -rf /`、`curl ... | sh`、凭证泄露等保持安全防护。

### 如何使用 Auto 模式

**在会话中开启 Auto 模式**

按 **Shift+Tab**（Windows 上使用 **Tab**）循环切换至 Auto 模式。状态栏显示当前活跃的模式。

**使用 `/approval-mode` 命令**

```
/approval-mode auto
```

首次进入 Auto 模式时，会显示一条说明其工作原理的信息提示。之后不再重复显示。

**在 Auto 模式下启动新会话**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Auto 模式的自动审批与阻止范围

分类器在不确定时倾向于阻止。默认行为：

- **自动审批**：只读命令（ls、cat、git status、grep、find），在当前目录安装包，构建/测试命令，工作区内的文件编辑，纯本地操作。
- **阻止**：不可逆的破坏操作（rm -rf /、fdisk、mkfs），从外部执行代码（curl | sh、eval 远程内容），凭证泄露，未授权的持久化（编辑 .bashrc、crontab），降低安全性，对 main/master 分支强制推送。

你可以通过 settings.json 中的自然语言 hints 自定义分类器的判断。参阅 [auto-mode.md](./auto-mode.md#configuring-hints)。

### 安全防护机制

- **硬规则始终有效**：`permissions.deny` 规则在分类器运行之前就会阻止相关操作。
- **过于宽泛的 allow 规则在 Auto 模式下会被暂时屏蔽**：例如 `permissions.allow: ["Bash"]`（允许所有 shell 命令）会绕过分类器；进入 Auto 模式后，此类规则会被临时禁用，以便分类器正常工作。退出 Auto 模式后规则恢复。磁盘上的设置文件不会被修改。
- **失败关闭**：当分类器 API 无法访问时，操作会被阻止而非放行。连续两次不可用后，下一次工具调用会回退到手动审批。
- **循环防护**：连续三次策略阻止后，下一次调用也会回退到手动审批，避免 agent 陷入死循环。

### 示例

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code 完成文件编辑（工作区内编辑跳过分类器），运行 `npm test`（分类器判断为安全），一旦尝试类似 `rm -rf /Users/me/.aws` 的危险操作则触发阻止。你可以查看内联原因，并决定是否为该步骤切换到 Ask Permissions 模式。

### 将 Auto 模式设置为默认模式

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

## 5. YOLO 模式——完全自动化

YOLO 模式赋予 Qwen Code 最高权限，自动审批所有工具调用，包括文件编辑和 shell 命令。

### 何时使用 YOLO 模式

- **自动化脚本**：运行预定义的自动化任务
- **CI/CD 流水线**：在受控环境中自动执行
- **个人项目**：在完全受信任的环境中快速迭代
- **批处理**：需要多步骤命令链的任务

> [!warning]
>
> **谨慎使用 YOLO 模式**：AI 可以使用你的终端权限执行任何命令。请确保：
>
> 1. 你信任当前代码库
> 2. 你了解 AI 将执行的所有操作
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
# 1. 运行测试命令（自动审批）
# 2. 修复失败的测试用例（自动编辑文件）
# 3. 执行 git commit（自动审批）
```

## 模式切换与配置

### 键盘快捷键切换

在 Qwen Code 会话中，使用 **Shift+Tab**​（Windows 上使用 **Tab**）可以快速在五种模式之间循环切换：

```
Plan 模式 → Ask Permissions 模式 → Auto-Edit 模式 → Auto 模式 → YOLO 模式 → Plan 模式
```

### 持久化配置

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

1. **初次接触代码库**：从 **Plan 模式**​开始，安全探索
2. **日常开发任务**：使用 **Auto-Accept Edits**​（默认模式），高效且安全
3. **自动化脚本**：在受控环境中使用 **YOLO 模式**​实现完全自动化
4. **复杂重构**：先用 **Plan 模式**​进行详细规划，再切换到合适的模式执行
