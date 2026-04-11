# Qwen Code Hooks 文档

## 概述

Qwen Code hooks 提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用程序的行为。Hooks 允许用户在应用程序生命周期的特定节点（例如工具执行前、工具执行后、会话开始/结束时，以及其他关键事件期间）执行自定义脚本或程序。

Hooks 默认处于启用状态。你可以通过在设置文件顶层（与 `hooks` 同级）将 `disableAllHooks` 设置为 `true` 来临时禁用所有 hooks：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

这将禁用所有 hooks，但不会删除它们的配置。

## 什么是 Hooks？

Hooks 是用户定义的脚本或程序，由 Qwen Code 在应用程序流程的预定义节点自动执行。它们允许用户：

- 监控和审计工具使用情况
- 强制执行安全策略
- 向对话中注入额外上下文
- 根据事件自定义应用程序行为
- 与外部系统和服务集成
- 以编程方式修改工具输入或响应

## Hook 架构

Qwen Code hook 系统由以下几个核心组件构成：

1. **Hook Registry**：存储和管理所有已配置的 hooks
2. **Hook Planner**：确定每个事件应运行哪些 hooks
3. **Hook Runner**：在正确的上下文中执行单个 hook
4. **Hook Aggregator**：合并多个 hooks 的结果
5. **Hook Event Handler**：协调事件的 hook 触发

## Hook 事件

Hooks 会在 Qwen Code 会话的特定节点触发。当事件触发且 matcher 匹配时，Qwen Code 会将关于该事件的 JSON 上下文传递给 hook 处理器。对于 command hooks，输入通过 stdin 传入。你的处理器可以检查输入、执行操作，并可选择返回一个决策。某些事件每个会话仅触发一次，而其他事件则在 agentic loop 中重复触发。

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

下表列出了 Qwen Code 中所有可用的 hook 事件：

| 事件名称           | 描述                                 | 使用场景                                        |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PreToolUse`         | 在工具执行前触发                 | 权限检查、输入验证、日志记录  |
| `PostToolUse`        | 在工具成功执行后触发       | 日志记录、输出处理、监控          |
| `PostToolUseFailure` | 在工具执行失败时触发             | 错误处理、告警、修复           |
| `Notification`       | 在发送通知时触发           | 通知自定义、日志记录             |
| `UserPromptSubmit`   | 在用户提交 prompt 时触发            | 输入处理、验证、上下文注入 |
| `SessionStart`       | 在新会话开始时触发             | 初始化、上下文设置                   |
| `Stop`               | 在 Qwen 结束响应前触发    | 最终处理、清理                           |
| `SubagentStart`      | 在子代理启动时触发                | 子代理初始化                         |
| `SubagentStop`       | 在子代理停止时触发                 | 子代理最终处理                           |
| `PreCompact`         | 在对话压缩前触发        | 压缩前处理                       |
| `SessionEnd`         | 在会话结束时触发                   | 清理、报告                              |
| `PermissionRequest`  | 在显示权限对话框时触发 | 权限自动化、策略执行       |

## 输入/输出规则

### Hook 输入结构

所有 hooks 都通过 stdin 接收标准化的 JSON 格式输入。每个 hook 事件都包含以下通用字段：

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

根据 hook 类型的不同，会添加特定于事件的字段。以下是每个 hook 事件的特定字段：

### 各 Hook 事件详情

#### PreToolUse

**Purpose**：在工具使用前执行，用于进行权限检查、输入验证或上下文注入。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Output Options**：

- `hookSpecificOutput.permissionDecision`: "allow"、"deny" 或 "ask"（必填）
- `hookSpecificOutput.permissionDecisionReason`: 决策原因说明（必填）
- `hookSpecificOutput.updatedInput`: 用于替代原始输入的修改后工具输入参数
- `hookSpecificOutput.additionalContext`: 额外的上下文信息

**Note**：虽然底层类在技术上支持 `decision` 和 `reason` 等标准 hook 输出字段，但官方接口期望使用包含 `permissionDecision` 和 `permissionDecisionReason` 的 `hookSpecificOutput`。

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Purpose**：在工具成功完成后执行，用于处理结果、记录结果或注入额外上下文。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Output Options**：

- `decision`: "allow"、"deny"、"block"（若未指定，默认为 "allow"）
- `reason`: 决策原因
- `hookSpecificOutput.additionalContext`: 需要包含的额外信息

**Example Output**：

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**Purpose**：在工具执行失败时执行，用于处理错误、发送告警或记录失败。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**Output Options**：

- `hookSpecificOutput.additionalContext`: 错误处理信息
- 标准 hook 输出字段

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Purpose**：在用户提交 prompt 时执行，用于修改、验证或丰富输入内容。

**Event-specific fields**：

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Output Options**：

- `decision`: "allow"、"deny"、"block" 或 "ask"
- `reason`: 决策的人类可读说明
- `hookSpecificOutput.additionalContext`: 附加到 prompt 的额外上下文（可选）

**Note**：由于 `UserPromptSubmitOutput` 继承自 `HookOutput`，所有标准字段均可用，但此事件专门定义了 `hookSpecificOutput` 中的 `additionalContext`。

**Example Output**：

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**Purpose**：在新会话开始时执行，用于执行初始化任务。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Output Options**：

- `hookSpecificOutput.additionalContext`: 会话中可用的上下文
- 标准 hook 输出字段

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Purpose**：在会话结束时执行，用于执行清理任务。

**Event-specific fields**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Output Options**：

- 标准 hook 输出字段（通常不用于阻塞）

#### Stop

**Purpose**：在 Qwen 结束响应前执行，用于提供最终反馈或摘要。

**Event-specific fields**：

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Output Options**：

- `decision`: "allow"、"deny"、"block" 或 "ask"
- `reason`: 决策的人类可读说明
- `stopReason`: 包含在停止响应中的反馈
- `continue`: 设置为 false 以停止执行
- `hookSpecificOutput.additionalContext`: 额外的上下文信息

**Note**：由于 `StopOutput` 继承自 `HookOutput`，所有标准字段均可用，但 `stopReason` 字段对此事件尤为相关。

**Example Output**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### SubagentStart

**Purpose**：在子代理（如 Task 工具）启动时执行，用于设置上下文或权限。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Output Options**：

- `hookSpecificOutput.additionalContext`: 子代理的初始上下文
- 标准 hook 输出字段

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Purpose**：在子代理完成时执行，用于执行最终处理任务。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**Output Options**：

- `decision`: "allow"、"deny"、"block" 或 "ask"
- `reason`: 决策的人类可读说明

**Example Output**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Purpose**：在对话压缩前执行，用于准备或记录压缩操作。

**Event-specific fields**：

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Output Options**：

- `hookSpecificOutput.additionalContext`: 压缩前包含的上下文
- 标准 hook 输出字段

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### Notification

**Purpose**：在发送通知时执行，用于自定义或拦截通知。

**Event-specific fields**：

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Note**：`elicitation_dialog` 类型已定义但当前尚未实现。

**Output Options**：

- `hookSpecificOutput.additionalContext`: 需要包含的额外信息
- 标准 hook 输出字段

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Purpose**：在显示权限对话框时执行，用于自动化决策或更新权限。

**Event-specific fields**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Output Options**：

- `hookSpecificOutput.decision`: 包含权限决策详情的结构化对象：
  - `behavior`: "allow" 或 "deny"
  - `updatedInput`: 修改后的工具输入（可选）
  - `updatedPermissions`: 修改后的权限（可选）
  - `message`: 向用户显示的消息（可选）
  - `interrupt`: 是否中断工作流（可选）

**Example Output**：

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

## Hook 配置

Hooks 在 Qwen Code 设置中进行配置，通常位于 `.qwen/settings.json` 或用户配置文件中：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

### Matcher 模式

Matcher 允许根据上下文过滤 hooks。并非所有 hook 事件都支持 matcher：

| 事件类型          | 事件                                                                 | Matcher 支持 | Matcher 目标（值）                                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| 工具事件         | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest` | ✅ 是（正则）  | 工具名称：`bash`、`read_file`、`write_file`、`edit`、`glob`、`grep_search` 等      |
| 子代理事件     | `SubagentStart`、`SubagentStop`                                        | ✅ 是（正则）  | 代理类型：`Bash`、`Explorer` 等                                                   |
| 会话事件      | `SessionStart`                                                         | ✅ 是（正则）  | 来源：`startup`、`resume`、`clear`、`compact`                                        |
| 会话事件      | `SessionEnd`                                                           | ✅ 是（正则）  | 原因：`clear`、`logout`、`prompt_input_exit`、`bypass_permissions_disabled`、`other` |
| 通知事件 | `Notification`                                                         | ✅ 是（精确匹配）  | 类型：`permission_prompt`、`idle_prompt`、`auth_success`                               |
| 压缩事件      | `PreCompact`                                                           | ✅ 是（精确匹配）  | 触发器：`manual`、`auto`                                                              |
| Prompt 事件       | `UserPromptSubmit`                                                     | ❌ 否           | 不适用                                                                                    |
| 停止事件         | `Stop`                                                                 | ❌ 否           | 不适用                                                                                    |

**Matcher 语法**：

- 针对目标字段匹配的正则表达式模式
- 空字符串 `""` 或 `"*"` 匹配该类型的所有事件
- 支持标准正则表达式语法（例如 `^bash$`、`read.*`、`(bash|run_shell_command)`）

**示例**：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // Only match bash tool
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // Match read_file, read_multiple_files, etc.
        "hooks": [...]
      },
      {
        "matcher": "",                 // Match all tools (same as "*" or omitting matcher)
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Only match Bash and Explorer agents
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // Only match startup and resume sources
        "hooks": [...]
      }
    ]
  }
}
```

## Hook 执行

### 并行与顺序执行

- 默认情况下，hooks 并行执行以获得更好的性能
- 在 hook 定义中使用 `sequential: true` 可强制执行依赖顺序的执行
- 顺序 hook 可以修改链中后续 hook 的输入

### 安全模型

- Hooks 在用户环境中以用户权限运行
- 项目级 hooks 需要受信任的文件夹状态
- 超时机制可防止 hook 挂起（默认：60 秒）

### 退出码

Hook 脚本通过退出码传达其结果：

| 退出码 | 含义            | 行为                                        |
| --------- | ------------------ | ----------------------------------------------- |
| `0`       | 成功            | 不显示 stdout/stderr                         |
| `2`       | 阻塞性错误     | 向模型显示 stderr 并阻塞工具调用        |
| 其他     | 非阻塞性错误 | 仅向用户显示 stderr，但继续工具调用 |

**示例**：

```bash
#!/bin/bash

# Success (exit 0 is default, can be omitted)
echo '{"decision": "allow"}'
exit 0

# Blocking error - prevents operation
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **Note**：如果未指定退出码，脚本默认返回 `0`（成功）。

## 最佳实践

### 示例 1：安全验证 Hook

一个用于记录日志并可能阻塞危险命令的 `PreToolUse` hook：

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # Blocking error
fi

# Allow the operation with a log
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

在 `.qwen/settings.json` 中配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 示例 2：用户 Prompt 验证 Hook

一个用于验证用户 prompt 中敏感信息并为长 prompt 提供上下文的 `UserPromptSubmit` hook：

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```

## 故障排查

- 检查应用程序日志以获取 hook 执行详情
- 验证 hook 脚本的权限和可执行性
- 确保 hook 输出中的 JSON 格式正确
- 使用特定的 matcher 模式以避免意外的 hook 执行