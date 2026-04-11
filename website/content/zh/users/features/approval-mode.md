# 审批模式

Qwen Code 提供四种不同的权限模式，让你可以根据任务复杂度和风险级别，灵活控制 AI 与代码及系统的交互方式。

## 权限模式对比

| 模式           | 文件编辑                | Shell 命令              | 适用场景                                                                                               | 风险等级 |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**​      | ❌ 仅只读分析  | ❌ 不执行             | • 代码探索 <br>• 规划复杂变更 <br>• 安全代码审查                               | 最低     |
| **Default**​   | ✅ 需手动审批 | ✅ 需手动审批 | • 新/不熟悉的代码库 <br>• 关键系统 <br>• 团队协作 <br>• 学习与教学 | 低        |
| **Auto-Edit**​ | ✅ 自动批准            | ❌ 需手动审批 | • 日常开发任务 <br>• 重构与代码优化 <br>• 安全自动化                | 中     |
| **YOLO**​      | ✅ 自动批准            | ✅ 自动批准            | • 可信的个人项目 <br>• 自动化脚本/CI/CD <br>• 批量处理任务                 | 最高    |

### 快速参考指南

- **从 Plan 模式开始**：在做出更改前充分了解代码
- **使用 Default 模式工作**：大多数开发工作的均衡之选
- **切换到 Auto-Edit**：进行大量安全的代码修改时
- **谨慎使用 YOLO**：仅用于受控环境中可信的自动化任务

> [!tip]
>
> 你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）快速切换模式。终端状态栏会显示当前模式，让你随时了解 Qwen Code 拥有的权限。

## 1. 使用 Plan 模式进行安全的代码分析

Plan 模式指示 Qwen Code 通过 **只读** 操作分析代码库来制定计划，非常适合探索代码库、规划复杂变更或安全地审查代码。

### 何时使用 Plan 模式

- **多步骤实现**：当你的功能需要编辑多个文件时
- **代码探索**：在修改任何内容之前，希望彻底研究代码库时
- **交互式开发**：希望与 Qwen Code 就实现方向进行迭代时

### 如何使用 Plan 模式

**在会话中开启 Plan 模式**

你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）循环切换权限模式，从而进入 Plan 模式。

如果你处于 Normal 模式，按下 **Shift+Tab**（Windows 上为 **Tab**）会先切换到 `auto-edits` 模式，终端底部会显示 `⏵⏵ accept edits on`。再次按下 **Shift+Tab**（或 **Tab**）将切换到 Plan 模式，显示为 `⏸ plan mode`。

**使用 `/plan` 命令**

`/plan` 命令提供了进入和退出 Plan 模式的快捷方式：

```bash
/plan                          # 进入 plan 模式
/plan refactor the auth module # 进入 plan 模式并开始规划
/plan exit                     # 退出 plan 模式，恢复之前的模式
```

使用 `/plan exit` 退出 Plan 模式时，系统会自动恢复你之前的审批模式（例如，如果在进入 Plan 模式前处于 Auto-Edit 模式，退出后将返回 Auto-Edit 模式）。

**在 Plan 模式下启动新会话**

要在 Plan 模式下启动新会话，请使用 `/approval-mode` 然后选择 `plan`

```bash
/approval-mode
```

**在 Plan 模式下运行“无头 (headless)”查询**

你也可以直接使用 `-p` 或 `--prompt` 在 Plan 模式下运行查询：

```bash
qwen --prompt "What is machine learning?"
```

### 示例：规划复杂的重构

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code 将进入 Plan 模式并分析当前实现，以制定全面的计划。你可以通过后续提问进行细化：

```
What about backward compatibility?
How should we handle database migration?
```

### 将 Plan 模式配置为默认模式

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. 使用 Default 模式进行受控交互

Default 模式是使用 Qwen Code 的标准方式。在此模式下，你对所有潜在风险操作保持完全控制——Qwen Code 在进行任何文件更改或执行 Shell 命令前，都会请求你的批准。

### 何时使用 Default 模式

- **刚接触代码库**：探索不熟悉的项目且希望格外谨慎时
- **关键系统**：处理生产环境代码、基础设施或敏感数据时
- **学习与教学**：希望了解 Qwen Code 执行的每一步时
- **团队协作**：多人共同开发同一代码库时
- **复杂操作**：更改涉及多个文件或复杂逻辑时

### 如何使用 Default 模式

**在会话中开启 Default 模式**

你可以在会话期间使用 **Shift+Tab**（Windows 上为 **Tab**）循环切换权限模式。如果你处于其他任何模式，按下 **Shift+Tab**（或 **Tab**）最终会循环回 Default 模式，此时终端底部不会显示任何模式指示器。

**在 Default 模式下启动新会话**

Default 模式是启动 Qwen Code 时的初始模式。如果你更改过模式并希望返回 Default 模式，请使用：

```
/approval-mode default
```

**在 Default 模式下运行“无头 (headless)”查询**

运行无头命令时，Default 模式是默认行为。你可以显式指定它：

```
qwen --prompt "Analyze this code for potential bugs"
```

### 示例：安全地实现功能

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code 将分析你的代码库并提出计划。随后，它会在执行以下操作前请求批准：

1. 创建新文件（控制器、模型、迁移脚本）
2. 修改现有文件（添加新列、更新 API）
3. 运行任何 Shell 命令（数据库迁移、依赖安装）

你可以审查每项提议的更改，并单独批准或拒绝。

### 将 Default 模式配置为默认模式

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Auto Edits 模式

Auto-Edit 模式指示 Qwen Code 自动批准文件编辑，同时要求对 Shell 命令进行手动审批，非常适合在保持系统安全的同时加速开发工作流。

### 何时使用 Auto-Accept Edits 模式

- **日常开发**：适用于大多数编码任务
- **安全自动化**：允许 AI 修改代码，同时防止意外执行危险命令
- **团队协作**：在共享项目中使用，避免对他人造成意外影响

### 如何切换到此模式

```
# 通过命令切换
/approval-mode auto-edit

# 或使用键盘快捷键
Shift+Tab (or Tab on Windows) # 从其他模式切换
```

### 工作流示例

1. 你要求 Qwen Code 重构某个函数
2. AI 分析代码并提出更改建议
3. **自动**应用所有文件更改，无需确认
4. 如果需要运行测试，它将**请求批准**以执行 `npm test`

## 4. YOLO 模式 - 全自动化

YOLO 模式授予 Qwen Code 最高权限，自动批准所有工具调用，包括文件编辑和 Shell 命令。

### 何时使用 YOLO 模式

- **自动化脚本**：运行预定义的自动化任务
- **CI/CD 流水线**：在受控环境中自动执行
- **个人项目**：在完全可信的环境中快速迭代
- **批量处理**：需要多步命令链的任务

> [!warning]
>
> **谨慎使用 YOLO 模式**：AI 可以使用你终端的权限执行任何命令。请确保：
>
> 1. 你信任当前的代码库
> 2. 你了解 AI 将执行的所有操作
> 3. 重要文件已备份或已提交到版本控制

### 如何启用 YOLO 模式

```
# 临时启用（仅限当前会话）
/approval-mode yolo

# 设置为项目默认值
/approval-mode yolo --project

# 设置为用户全局默认值
/approval-mode yolo --user
```

### 配置示例

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "yolo",
"confirmShellCommands": false,
"confirmFileEdits": false
  }
}
```

### 自动化工作流示例

```bash
# 全自动化重构任务
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# 无需人工干预，AI 将：
# 1. 运行测试命令（自动批准）
# 2. 修复失败的测试用例（自动编辑文件）
# 3. 执行 git commit（自动批准）
```

## 模式切换与配置

### 键盘快捷键切换

在 Qwen Code 会话期间，使用 **Shift+Tab**（Windows 上为 **Tab**）可快速循环切换四种模式：

```
Default Mode → Auto-Edit Mode → YOLO Mode → Plan Mode → Default Mode
```

### 持久化配置

```
// 项目级：./.qwen/settings.json
// 用户级：~/.qwen/settings.json
{
  "permissions": {
"defaultMode": "auto-edit",  // 或 "plan" 或 "yolo"
"confirmShellCommands": true,
"confirmFileEdits": true
  }
}
```

### 模式使用建议

1. **刚接触代码库**：从 **Plan 模式** 开始，安全探索
2. **日常开发任务**：使用 **Auto-Accept Edits**（默认模式），高效且安全
3. **自动化脚本**：在受控环境中使用 **YOLO 模式** 实现全自动化
4. **复杂重构**：先使用 **Plan 模式** 进行详细规划，然后切换到合适的模式执行