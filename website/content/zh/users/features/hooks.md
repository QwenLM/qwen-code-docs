# Qwen Code Hooks

## 概述

Qwen Code Hooks 提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用程序的行为。Hooks 允许用户在应用程序生命周期的特定节点（例如工具执行前、工具执行后、会话开始/结束时以及其他关键事件期间）执行自定义脚本或程序。

Hooks 默认处于启用状态。你可以通过在设置文件顶层（与 `hooks` 同级）将 `disableAllHooks` 设置为 `true` 来临时禁用所有 Hooks：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

这将禁用所有 Hooks，但不会删除其配置。

## 什么是 Hooks？

Hooks 是用户定义的脚本或程序，由 Qwen Code 在应用程序流程的预定义节点自动执行。它们允许用户：

- 监控和审计工具使用情况
- 强制执行安全策略
- 向对话中注入额外上下文
- 根据事件自定义应用程序行为
- 与外部系统和服务集成
- 以编程方式修改工具输入或响应

## Hook 类型

Qwen Code 支持三种 Hook 执行器类型：

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | 执行 shell 命令。通过 `stdin` 接收 JSON，通过 `stdout` 返回结果。                              |
| `http`     | 将 JSON 作为 `POST` 请求体发送到指定 URL。通过 HTTP 响应体返回结果。                           |
| `function` | 直接调用已注册的 JavaScript 函数（仅限会话级 Hooks）。                                         |

### Command Hooks

Command Hooks 通过子进程执行命令。输入 JSON 通过 stdin 传递，输出通过 stdout 返回。

**配置：**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Hook 类型                                   |
| `command`       | `string`                 | Yes      | 要执行的命令                                |
| `name`          | `string`                 | No       | Hook 名称（用于日志记录）                   |
| `description`   | `string`                 | No       | Hook 描述                                   |
| `timeout`       | `number`                 | No       | 超时时间（毫秒），默认 60000                |
| `async`         | `boolean`                | No       | 是否在后台异步运行                          |
| `env`           | `Record<string, string>` | No       | 环境变量                                    |
| `shell`         | `"bash" \| "powershell"` | No       | 使用的 shell                                |
| `statusMessage` | `string`                 | No       | 执行期间显示的状态消息                      |

**示例：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks

HTTP Hooks 将 Hook 输入作为 POST 请求发送到指定 URL。它们支持 URL 白名单、DNS 级 SSRF 防护、环境变量插值以及其他安全特性。

**配置：**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Hook 类型                                                 |
| `url`            | `string`                 | Yes      | 目标 URL                                                  |
| `headers`        | `Record<string, string>` | No       | 请求头（支持环境变量插值）                                |
| `allowedEnvVars` | `string[]`               | No       | URL/请求头中允许使用的环境变量白名单                      |
| `timeout`        | `number`                 | No       | 超时时间（秒），默认 600                                  |
| `name`           | `string`                 | No       | Hook 名称（用于日志记录）                                 |
| `statusMessage`  | `string`                 | No       | 执行期间显示的状态消息                                    |
| `once`           | `boolean`                | No       | 每个会话中每个事件仅执行一次（仅限 HTTP Hooks）           |

**安全特性：**

- **URL 白名单**：通过 `allowedUrls` 配置允许的 URL 模式
- **SSRF 防护**：拦截私有 IP（10.x.x.x、172.16-31.x.x、192.168.x.x 等），但允许回环地址（127.0.0.1、::1）
- **DNS 验证**：在请求前验证域名解析，防止 DNS 重绑定攻击
- **环境变量插值**：使用 `${VAR}` 语法，仅允许 `allowedEnvVars` 白名单中的变量

**示例：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

### Function Hooks

Function Hooks 直接调用已注册的 JavaScript/TypeScript 函数。它们由 Skill 系统在内部使用，目前尚未作为公共 API 向终端用户开放。

**注意**：对于大多数用例，请使用 **command hooks** 或 **HTTP hooks**，它们可以在设置文件中进行配置。

## Hook 事件

Hooks 在 Qwen Code 会话的特定节点触发。不同事件支持不同的 matcher 来过滤触发条件。

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | 工具执行前                                | 工具名称（`WriteFile`、`ReadFile`、`Bash` 等）            |
| `PostToolUse`        | 工具成功执行后                            | 工具名称                                                  |
| `PostToolUseFailure` | 工具执行失败后                            | 工具名称                                                  |
| `UserPromptSubmit`   | 用户提交 prompt 后                        | 无（始终触发）                                            |
| `SessionStart`       | 会话开始或恢复时                          | 来源（`startup`、`resume`、`clear`、`compact`）           |
| `SessionEnd`         | 会话结束时                                | 原因（`clear`、`logout`、`prompt_input_exit` 等）         |
| `Stop`               | 当 Claude 准备结束响应时                  | 无（始终触发）                                            |
| `SubagentStart`      | 子代理启动时                              | 代理类型（`Bash`、`Explorer`、`Plan` 等）                 |
| `SubagentStop`       | 子代理停止时                              | 代理类型                                                  |
| `PreCompact`         | 对话压缩前                                | 触发方式（`manual`、`auto`）                              |
| `Notification`       | 发送通知时                                | 类型（`permission_prompt`、`idle_prompt`、`auth_success`）|
| `PermissionRequest`  | 显示权限对话框时                          | 工具名称                                                  |

### Matcher 模式

`matcher` 是一个用于过滤触发条件的正则表达式。

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| 工具事件            | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ 正则表达式   | 工具名称：`WriteFile`、`ReadFile`、`Bash` 等             |
| 子代理事件          | `SubagentStart`, `SubagentStop`                                        | ✅ 正则表达式   | 代理类型：`Bash`、`Explorer` 等                          |
| 会话事件            | `SessionStart`                                                         | ✅ 正则表达式   | 来源：`startup`、`resume`、`clear`、`compact`            |
| 会话事件            | `SessionEnd`                                                           | ✅ 正则表达式   | 原因：`clear`、`logout`、`prompt_input_exit` 等          |
| 通知事件            | `Notification`                                                         | ✅ 精确匹配     | 类型：`permission_prompt`、`idle_prompt`、`auth_success` |
| 压缩事件            | `PreCompact`                                                           | ✅ 精确匹配     | 触发方式：`manual`、`auto`                               |
| Prompt 事件         | `UserPromptSubmit`                                                     | ❌ 无           | 不适用                                                   |
| Stop 事件           | `Stop`                                                                 | ❌ 无           | 不适用                                                   |

**Matcher 语法：**

- 空字符串 `""` 或 `"*"` 匹配该类型的所有事件
- 支持标准正则表达式语法（例如 `^Bash$`、`Read.*`、`(WriteFile|Edit)`）

**示例：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## 输入/输出规则

### Hook 输入结构

所有 Hooks 均通过 stdin（command）或 POST 请求体（http）接收标准化的 JSON 格式输入。

**通用字段：**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

根据 Hook 类型会添加特定于事件的字段。在子代理中运行时，还会额外包含 `agent_id` 和 `agent_type`。

### Hook 输出结构

Hook 输出以 JSON 格式通过 `stdout`（command）或 HTTP 响应体（http）返回。

**退出码行为（Command Hooks）：**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | 成功。解析 `stdout` 中的 JSON 以控制行为。                                            |
| `2`       | **阻塞性错误**。忽略 `stdout`，将 `stderr` 作为错误反馈传递给模型。                   |
| 其他      | 非阻塞性错误。`stderr` 仅在调试模式下显示，执行继续。                                 |

**输出结构：**

Hook 输出支持三类字段：

1. **通用字段**：`continue`、`stopReason`、`suppressOutput`、`systemMessage`
2. **顶层决策**：`decision`、`reason`（部分事件使用）
3. **事件特定控制**：`hookSpecificOutput`（必须包含 `hookEventName`）

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### 各 Hook 事件详情

#### PreToolUse

**用途**：在工具执行前运行，用于权限检查、输入验证或上下文注入。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**输出选项**：

- `hookSpecificOutput.permissionDecision`："allow"、"deny" 或 "ask"（必填）
- `hookSpecificOutput.permissionDecisionReason`：决策原因说明（必填）
- `hookSpecificOutput.updatedInput`：用于替代原始输入的修改后工具输入参数
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：尽管底层类在技术上支持 `decision` 和 `reason` 等标准 Hook 输出字段，但官方接口期望使用包含 `permissionDecision` 和 `permissionDecisionReason` 的 `hookSpecificOutput`。

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**用途**：在工具成功执行后运行，用于处理结果、记录日志或注入额外上下文。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**输出选项**：

- `decision`："allow"、"deny" 或 "block"（未指定时默认为 "allow"）
- `reason`：决策原因
- `hookSpecificOutput.additionalContext`：要包含的额外信息

**输出示例**：

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

**用途**：在工具执行失败时运行，用于处理错误、发送警报或记录失败信息。

**事件特定字段**：

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

**输出选项**：

- `hookSpecificOutput.additionalContext`：错误处理信息
- 标准 Hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**用途**：在用户提交 prompt 时运行，用于修改、验证或丰富输入内容。

**事件特定字段**：

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的人类可读解释
- `hookSpecificOutput.additionalContext`：附加到 prompt 的额外上下文（可选）

**注意**：由于 `UserPromptSubmitOutput` 继承自 `HookOutput`，所有标准字段均可用，但仅 `hookSpecificOutput` 中的 `additionalContext` 是为此事件专门定义的。

**输出示例**：

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

**用途**：在新会话开始时运行，用于执行初始化任务。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：在会话中可用的上下文
- 标准 Hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**用途**：在会话结束时运行，用于执行清理任务。

**事件特定字段**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**输出选项**：

- 标准 Hook 输出字段（通常不用于阻塞）

#### Stop

**用途**：在 Qwen 结束响应前运行，用于提供最终反馈或摘要。

**事件特定字段**：

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的人类可读解释
- `stopReason`：包含在停止响应中的反馈
- `continue`：设置为 false 以停止执行
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：由于 `StopOutput` 继承自 `HookOutput`，所有标准字段均可用，但 `stopReason` 字段对此事件尤为相关。

**输出示例**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**用途**：当轮次因 API 错误（而非正常 Stop）结束时运行。这是一个 **fire-and-forget** 事件——Hook 输出和退出码将被忽略。

**事件特定字段**：

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**：针对 `error` 字段进行匹配。例如，`"matcher": "rate_limit"` 仅在发生速率限制错误时触发。

**输出选项**：

- **无** - `StopFailure` 为 fire-and-forget 事件。所有 Hook 输出和退出码均被忽略。

**退出码处理**：

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| 任意值    | 忽略（fire-and-forget）   |

**配置示例**：

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**使用场景**：

- 速率限制监控与告警
- 认证失败日志记录
- 计费错误通知
- 错误统计收集

#### SubagentStart

**用途**：在子代理（如 Task 工具）启动时运行，用于设置上下文或权限。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：子代理的初始上下文
- 标准 Hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**用途**：在子代理结束时运行，用于执行收尾任务。

**事件特定字段**：

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

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的人类可读解释

**输出示例**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**用途**：在对话压缩前运行，用于准备或记录压缩操作。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：压缩前包含的上下文
- 标准 Hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**用途**：在对话压缩完成后运行，用于归档摘要或跟踪使用情况。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**：针对 `trigger` 字段进行匹配。例如，`"matcher": "manual"` 仅在通过 `/compact` 命令手动压缩时触发。

**输出选项**：

- `hookSpecificOutput.additionalContext`：额外上下文（仅用于日志记录）
- 标准 Hook 输出字段（仅用于日志记录）

**注意**：`PostCompact` **不在**官方支持决策模式的事件列表中。`decision` 字段及其他控制字段不会产生任何控制效果——它们仅用于日志记录。

**退出码处理**：

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | 成功 - 在详细模式下向用户显示 `stdout`                    |
| 其他      | 非阻塞性错误 - 在详细模式下向用户显示 `stderr`            |

**配置示例**：

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**使用场景**：

- 将摘要归档至文件或数据库
- 使用情况统计跟踪
- 上下文变更监控
- 压缩操作的审计日志记录

#### Notification

**用途**：在发送通知时运行，用于自定义或拦截通知。

**事件特定字段**：

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注意**：`elicitation_dialog` 类型已定义，但当前尚未实现。

**输出选项**：

- `hookSpecificOutput.additionalContext`：要包含的额外信息
- 标准 Hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**用途**：在显示权限对话框时运行，用于自动化决策或更新权限。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**输出选项**：

- `hookSpecificOutput.decision`：包含权限决策详情的结构化对象：
  - `behavior`："allow" 或 "deny"
  - `updatedInput`：修改后的工具输入（可选）
  - `updatedPermissions`：修改后的权限（可选）
  - `message`：向用户显示的消息（可选）
  - `interrupt`：是否中断工作流（可选）

**输出示例**：

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
        "matcher": "^Bash$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
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

## Hook 执行

### 并行与顺序执行

- 默认情况下，Hooks 并行执行以获得更好的性能
- 在 Hook 定义中使用 `sequential: true` 以强制执行依赖顺序的执行
- 顺序执行的 Hook 可以修改链中后续 Hook 的输入

### 异步 Hooks

仅 `command` 类型支持异步执行。设置 `"async": true` 将在后台运行 Hook，而不会阻塞主流程。

**特性：**

- 无法返回决策控制（操作已发生）
- 结果通过 `systemMessage` 或 `additionalContext` 注入到下一轮对话中
- 适用于审计、日志记录、后台测试等场景

**示例：**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### 安全模型

- Hooks 在用户环境中以用户权限运行
- 项目级 Hooks 需要文件夹处于受信任状态
- 超时机制可防止 Hook 挂起（默认：60 秒）

## 最佳实践

### 示例 1：安全验证 Hook

一个用于记录并可能拦截危险命令的 PreToolUse Hook：

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
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
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

### 示例 2：HTTP 审计 Hook

一个将所有工具执行记录发送到远程审计服务的 PostToolUse HTTP Hook：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### 示例 3：用户 Prompt 验证 Hook

一个用于验证用户 prompt 中敏感信息并为长 prompt 提供上下文的 UserPromptSubmit Hook：

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

- 检查应用程序日志以获取 Hook 执行详情
- 验证 Hook 脚本的权限和可执行性
- 确保 Hook 输出中的 JSON 格式正确
- 使用特定的 matcher 模式以避免意外触发 Hook
- 使用 `--debug` 模式查看详细的 Hook 匹配和执行信息
- 临时禁用所有 Hooks：在设置中添加 `"disableAllHooks": true`