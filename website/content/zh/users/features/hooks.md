# Qwen Code 钩子

## 概述

Qwen Code 钩子提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用的行为。钩子允许用户在应用生命周期的特定节点执行自定义脚本或程序，例如在工具执行前、工具执行后、会话开始/结束时以及其他关键事件期间。

钩子默认启用。你可以通过在设置文件（顶层，与 `hooks` 同级）中将 `disableAllHooks` 设置为 `true` 来临时禁用所有钩子：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

这会禁用所有钩子，但不会删除它们的配置。

## 什么是钩子？

钩子是由用户定义的脚本或程序，Qwen Code 会在应用流程的预定义节点自动执行它们。它们允许用户：

- 监控和审计工具使用情况
- 强制执行安全策略
- 向对话中注入额外上下文
- 根据事件自定义应用行为
- 与外部系统和服务集成
- 以编程方式修改工具输入或响应

## 钩子类型

Qwen Code 支持四种钩子执行器类型：

| 类型       | 描述                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| `command`  | 执行 shell 命令。通过 `stdin` 接收 JSON，通过 `stdout` 返回结果。                          |
| `http`     | 将 JSON 作为 `POST` 请求体发送到指定 URL。通过 HTTP 响应体返回结果。                       |
| `function` | 直接调用已注册的 JavaScript 函数（仅限会话级钩子）。                                       |
| `prompt`   | 使用 LLM 评估钩子输入并返回决策。                                                          |

### 命令钩子

命令钩子通过子进程执行命令。输入 JSON 通过 stdin 传递，输出通过 stdout 返回。

**配置：**

| 字段            | 类型                     | 必填 | 描述                                 |
| :-------------- | :----------------------- | :--- | :----------------------------------- |
| `type`          | `"command"`              | 是   | 钩子类型                             |
| `command`       | `string`                 | 是   | 要执行的命令                         |
| `name`          | `string`                 | 否   | 钩子名称（用于日志记录）             |
| `description`   | `string`                 | 否   | 钩子描述                             |
| `timeout`       | `number`                 | 否   | 超时时间（毫秒），默认 60000         |
| `async`         | `boolean`                | 否   | 是否在后台异步运行                   |
| `env`           | `Record<string, string>` | 否   | 环境变量                             |
| `shell`         | `"bash" \| "powershell"` | 否   | 使用的 Shell                         |
| `statusMessage` | `string`                 | 否   | 执行期间显示的状态消息               |

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

### HTTP 钩子

HTTP 钩子将钩子输入作为 POST 请求发送到指定 URL。它们支持 URL 白名单、DNS 级 SSRF 防护、环境变量插值等安全特性。

**配置：**

| 字段             | 类型                     | 必填 | 描述                                               |
| :--------------- | :----------------------- | :--- | :------------------------------------------------- |
| `type`           | `"http"`                 | 是   | 钩子类型                                           |
| `url`            | `string`                 | 是   | 目标 URL                                           |
| `headers`        | `Record<string, string>` | 否   | 请求头（支持环境变量插值）                         |
| `allowedEnvVars` | `string[]`               | 否   | URL/请求头中允许使用的环境变量白名单               |
| `timeout`        | `number`                 | 否   | 超时时间（秒），默认 600                           |
| `name`           | `string`                 | 否   | 钩子名称（用于日志记录）                           |
| `statusMessage`  | `string`                 | 否   | 执行期间显示的状态消息                             |
| `once`           | `boolean`                | 否   | 每个会话中每个事件仅执行一次（仅限 HTTP 钩子）     |

**安全特性：**

- **URL 白名单**：通过 `allowedUrls` 配置允许的 URL 模式
- **SSRF 防护**：阻止私有 IP（10.x.x.x、172.16-31.x.x、192.168.x.x 等），但允许环回地址（127.0.0.1、::1）
- **DNS 验证**：在请求前验证域名解析，以防止 DNS 重绑定攻击
- **环境变量插值**：`${VAR}` 语法，仅允许 `allowedEnvVars` 白名单中的变量

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

### 函数钩子

函数钩子直接调用已注册的 JavaScript/TypeScript 函数。它们由 Skill 系统在内部使用，目前尚未作为公共 API 暴露给最终用户。

**注意**：对于大多数用例，请改用**命令钩子**或 **HTTP 钩子**，它们可以在设置文件中进行配置。

### 提示钩子

提示钩子使用 LLM 评估钩子输入并返回决策。这对于基于上下文做出智能决策非常有用，例如决定是否允许或阻止某个操作。

**工作原理：**

1. 钩子输入 JSON 通过 `$ARGUMENTS` 占位符注入到你的提示词中
2. 提示词被发送给 LLM（默认使用你当前的模型）
3. LLM 返回包含决策的 JSON 响应
4. Qwen Code 处理该决策，并相应地继续或阻止执行

**配置：**

| 字段            | 类型       | 必填 | 描述                                         |
| :-------------- | :--------- | :--- | :------------------------------------------- |
| `type`          | `"prompt"` | 是   | 钩子类型                                     |
| `prompt`        | `string`   | 是   | 发送给 LLM 的提示词。使用 `$ARGUMENTS` 表示钩子输入 |
| `model`         | `string`   | 否   | 使用的模型（默认为你当前的模型）             |
| `timeout`       | `number`   | 否   | 超时时间（秒），默认 30                      |
| `name`          | `string`   | 否   | 钩子名称（用于日志记录）                     |
| `description`   | `string`   | 否   | 钩子描述                                     |
| `statusMessage` | `string`   | 否   | 执行期间显示的状态消息                       |

**响应格式：**

LLM 必须返回具有以下结构的 JSON：

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| 字段                | 描述                                                                |
| :------------------ | :------------------------------------------------------------------ |
| `ok`                | `true` 表示允许/继续，`false` 表示阻止/停止                         |
| `reason`            | 当 `ok` 为 `false` 时必填。展示给模型以解释阻止原因                 |
| `additionalContext` | 可选。允许时注入对话的额外上下文                                    |

**支持的事件：**

提示钩子可用于大多数钩子事件，包括：

- `PreToolUse` - 评估是否允许工具调用
- `PostToolUse` - 评估工具结果并可能注入上下文
- `Stop` - 决定是继续还是停止
- `SubagentStop` - 评估子代理结果
- `UserPromptSubmit` - 评估或丰富用户提示词

**示例：Stop 钩子**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

当 `ok` 为 `false` 时，Qwen Code 将继续工作，并使用 `reason` 作为下一次响应的上下文。

**示例：PreToolUse 钩子**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## 钩子事件

钩子在 Qwen Code 会话的特定节点触发。不同的事件支持不同的 matcher（匹配器）来过滤触发条件。

| 事件                 | 触发时机                                | 匹配器目标                                            |
| :------------------- | :-------------------------------------- | :---------------------------------------------------- |
| `PreToolUse`         | 工具执行前                              | 工具名称（`WriteFile`、`ReadFile`、`Bash` 等）        |
| `PostToolUse`        | 工具成功执行后                          | 工具名称                                              |
| `PostToolUseFailure` | 工具执行失败后                          | 工具名称                                              |
| `UserPromptSubmit`   | 用户提交提示词后                        | 无（始终触发）                                        |
| `SessionStart`       | 会话开始或恢复时                        | 来源（`startup`、`resume`、`clear`、`compact`）       |
| `SessionEnd`         | 会话结束时                              | 原因（`clear`、`logout`、`prompt_input_exit` 等）     |
| `Stop`               | 当 Claude 准备结束响应时                | 无（始终触发）                                        |
| `SubagentStart`      | 子代理启动时                            | 代理类型（`Bash`、`Explorer`、`Plan` 等）             |
| `SubagentStop`       | 子代理停止时                            | 代理类型                                              |
| `PreCompact`         | 对话压缩前                              | 触发器（`manual`、`auto`）                            |
| `Notification`       | 发送通知时                              | 类型（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 显示权限对话框时                        | 工具名称                                              |
| `TodoCreated`        | 创建新 todo 项时                        | 无（始终触发）                                        |
| `TodoCompleted`      | todo 项被标记为已完成时                 | 无（始终触发）                                        |

### 匹配器模式

`matcher` 是一个正则表达式，用于过滤触发条件。

| 事件类型          | 事件                                                                 | 匹配器支持 | 匹配器目标                                           |
| :---------------- | :------------------------------------------------------------------- | :--------- | :--------------------------------------------------- |
| 工具事件          | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest` | ✅ 正则表达式 | 工具名称：`WriteFile`、`ReadFile`、`Bash` 等         |
| 子代理事件        | `SubagentStart`、`SubagentStop`                                      | ✅ 正则表达式 | 代理类型：`Bash`、`Explorer` 等                      |
| 会话事件          | `SessionStart`                                                       | ✅ 正则表达式 | 来源：`startup`、`resume`、`clear`、`compact`        |
| 会话事件          | `SessionEnd`                                                         | ✅ 正则表达式 | 原因：`clear`、`logout`、`prompt_input_exit` 等      |
| 通知事件          | `Notification`                                                       | ✅ 精确匹配  | 类型：`permission_prompt`、`idle_prompt`、`auth_success` |
| 压缩事件          | `PreCompact`                                                         | ✅ 精确匹配  | 触发器：`manual`、`auto`                             |
| Todo 事件         | `TodoCreated`、`TodoCompleted`                                       | ❌ 否       | 不适用                                               |
| 提示词事件        | `UserPromptSubmit`                                                   | ❌ 否       | 不适用                                               |
| 停止事件          | `Stop`                                                               | ❌ 否       | 不适用                                               |

**匹配器语法：**

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

### 钩子输入结构

所有钩子通过 stdin（command）或 POST 请求体（http）接收标准化的 JSON 格式输入。

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

根据钩子类型添加特定于事件的字段。在子代理中运行时，还会额外包含 `agent_id` 和 `agent_type`。

### 钩子输出结构

钩子输出通过 `stdout`（command）或 HTTP 响应体（http）以 JSON 格式返回。

**退出码行为（命令钩子）：**

| 退出码 | 行为                                                                              |
| :----- | :-------------------------------------------------------------------------------- |
| `0`    | 成功。解析 `stdout` 中的 JSON 以控制行为。                                        |
| `2`    | **阻止性错误**。忽略 `stdout`，将 `stderr` 作为错误反馈传递给模型。               |
| 其他   | 非阻止性错误。`stderr` 仅在调试模式下显示，执行继续。                             |

**输出结构：**

钩子输出支持三类字段：

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

### 各钩子事件详情

#### PreToolUse

**用途**：在工具使用前执行，用于进行权限检查、输入验证或上下文注入。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**输出选项**：

- `hookSpecificOutput.permissionDecision`："allow"、"deny" 或 "ask"（必填）
- `hookSpecificOutput.permissionDecisionReason`：决策原因（必填）
- `hookSpecificOutput.updatedInput`：修改后的工具输入参数，用于替代原始参数
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：虽然底层类在技术上支持 `decision` 和 `reason` 等标准钩子输出字段，但官方接口期望使用包含 `permissionDecision` 和 `permissionDecisionReason` 的 `hookSpecificOutput`。

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

**用途**：在工具成功完成后执行，用于处理结果、记录结果或注入额外上下文。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block"（如未指定则默认为 "allow"）
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

**用途**：在工具执行失败时执行，用于处理错误、发送警报或记录失败。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```
**输出选项**：

- `hookSpecificOutput.additionalContext`：错误处理信息
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**目的**：当用户提交 prompt 以修改、验证或丰富输入时执行。

**事件特定字段**：

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的可读解释
- `hookSpecificOutput.additionalContext`：追加到 prompt 的额外上下文（可选）

**注意**：由于 `UserPromptSubmitOutput` 继承自 `HookOutput`，所有标准字段均可用，但 `hookSpecificOutput` 中仅有 `additionalContext` 是为此事件专门定义的。

**示例输出**：

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

**目的**：当新会话开始时执行，以执行初始化任务。

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
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**目的**：当会话结束时执行，以执行清理任务。

**事件特定字段**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**输出选项**：

- 标准 hook 输出字段（通常不用于阻断）

#### Stop

**目的**：在 Qwen 结束响应之前执行，以提供最终反馈或总结。

**事件特定字段**：

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

`context_usage`、`context_limit` 和 `input_tokens` 字段允许 hook 脚本观察上下文使用情况并实现自定义压缩策略——例如，当使用量超过自定义阈值时，脚本会打印运行 `/compact` 的提醒。

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的可读解释
- `stopReason`：包含在停止响应中的反馈
- `continue`：设置为 false 以停止执行
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：由于 `StopOutput` 继承自 `HookOutput`，所有标准字段均可用，但 `stopReason` 字段与此事件尤为相关。

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**目的**：当回合因 API 错误而结束（而不是 Stop）时执行。这是一个**即发即弃（fire-and-forget）**事件——hook 输出和退出码将被忽略。

**事件特定字段**：

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**：匹配 `error` 字段。例如，`"matcher": "rate_limit"` 仅在触发速率限制错误时触发。

**输出选项**：

- **无** - StopFailure 是即发即弃的。所有 hook 输出和退出码均被忽略。

**退出码处理**：

| 退出码 | 行为                  |
| --------- | ------------------------- |
| 任意       | 忽略（即发即弃） |

**示例配置**：

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

**用例**：

- 速率限制监控与告警
- 身份验证失败日志记录
- 计费错误通知
- 错误统计收集

#### SubagentStart

**目的**：当启动子代理（如 Task 工具）以设置上下文或权限时执行。

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
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**目的**：当子代理完成以执行收尾任务时执行。

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
- `reason`：决策的可读解释

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**目的**：在对话压缩之前执行，以准备或记录压缩过程。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：压缩前包含的上下文
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**目的**：在对话压缩完成后执行，以归档摘要或跟踪使用情况。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**：匹配 `trigger` 字段。例如，`"matcher": "manual"` 仅在通过 `/compact` 命令进行手动压缩时触发。

**输出选项**：

- `hookSpecificOutput.additionalContext`：额外上下文（仅用于日志记录）
- 标准 hook 输出字段（仅用于日志记录）

**注意**：PostCompact **不在**官方决策模式支持的事件列表中。`decision` 字段和其他控制字段不会产生任何控制效果——它们仅用于日志记录目的。

**退出码处理**：

| 退出码 | 行为                                                  |
| --------- | --------------------------------------------------------- |
| 0         | 成功 - 在详细模式下向用户显示 stdout            |
| 其他     | 非阻断错误 - 在详细模式下向用户显示 stderr |

**示例配置**：

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

**用例**：

- 将摘要归档到文件或数据库
- 使用统计跟踪
- 上下文变更监控
- 压缩操作的审计日志

#### Notification

**目的**：在发送通知时执行，以自定义或拦截通知。

**事件特定字段**：

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注意**：`elicitation_dialog` 类型已定义但当前未实现。

**输出选项**：

- `hookSpecificOutput.additionalContext`：要包含的额外信息
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**目的**：在显示权限对话框时执行，以自动化决策或更新权限。

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
  - `message`：显示给用户的消息（可选）
  - `interrupt`：是否中断工作流（可选）

**示例输出**：

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

#### TodoCreated

**目的**：当通过 `todo_write` 工具创建新的 todo 项时执行。允许对 todo 创建进行验证、日志记录或阻断。

Todo hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅将此阶段用于验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化之后运行。将此阶段用于日志记录或同步等副作用；在此阶段 `block` 或 `deny` 将被忽略。

**事件特定字段**：

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**输出选项**：

- `decision`："allow"、"block" 或 "deny"
- `reason`：决策的可读解释（阻断时必填）

**阻断行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，会阻止 todo 创建。todo 列表保持不变，并将原因作为反馈提供给模型。

在 `postWrite` 阶段，todo 已经被持久化。Hook 仍然可以返回输出，但 `block` / `deny` 不会撤销写入，也不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**示例输出（阻断）**：

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**示例 Hook 脚本**：

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**示例配置**：

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**目的**：当 todo 项被标记为已完成时执行。允许对 todo 完成进行验证、日志记录或阻断。

Todo hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅将此阶段用于验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化之后运行。将此阶段用于日志记录或同步等副作用；在此阶段 `block` 或 `deny` 将被忽略。

**事件特定字段**：

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**输出选项**：

- `decision`："allow"、"block" 或 "deny"
- `reason`：决策的可读解释（阻断时必填）

**阻断行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，会阻止 todo 完成。todo 项保持其先前状态，并将原因作为反馈提供给模型。

在 `postWrite` 阶段，todo 已经被持久化。Hook 仍然可以返回输出，但 `block` / `deny` 不会撤销写入，也不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**示例输出（阻断）**：

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**示例 Hook 脚本**：

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**示例配置**：

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**用例**：

- **日志记录**：跟踪 todo 的创建和完成以进行审计或分析
- **验证**：强制执行内容质量标准（最小长度、必需关键字）
- **工作流控制**：阻断完成，直到满足先决条件
- **集成**：将 todo 与外部任务管理系统（Jira、Trello 等）同步

## Hook 配置

Hook 在 Qwen Code 设置中配置，通常在 `.qwen/settings.json` 或用户配置文件中：

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

- 默认情况下，hook 并行执行以获得更好的性能
- 在 hook 定义中使用 `sequential: true` 以强制执行依赖顺序的执行
- 顺序 hook 可以修改链中后续 hook 的输入

### 异步 Hook

仅 `command` 类型支持异步执行。设置 `"async": true` 会在后台运行 hook，而不会阻塞主流程。

**特性**：

- 无法返回决策控制（操作已经发生）
- 结果通过 `systemMessage` 或 `additionalContext` 注入到下一个对话回合中
- 适用于审计、日志记录、后台测试等。

**示例**：

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

- Hook 在用户环境中以用户权限运行
- 项目级 hook 需要受信任的文件夹状态
- 超时机制可防止 hook 挂起（默认：60 秒）

## 最佳实践

### 示例 1：安全验证 Hook

一个 PreToolUse hook，用于记录日志并可能阻断危险命令：

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

一个 PostToolUse HTTP hook，将所有工具执行记录发送到远程审计服务：

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

一个 UserPromptSubmit hook，用于验证用户 prompt 中的敏感信息并为长 prompt 提供上下文：
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

## 故障排除

- 检查应用日志以查看 hook 执行详情
- 验证 hook 脚本权限及可执行性
- 确保 hook 输出的 JSON 格式正确
- 使用特定的 matcher 模式以避免意外触发 hook
- 使用 `--debug` 模式查看 hook 匹配与执行的详细信息
- 临时禁用所有 hook：在设置中添加 `"disableAllHooks": true`