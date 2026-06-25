# Qwen Code Hooks

## 概述

Qwen Code hooks 提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用的行为。Hooks 允许用户在应用生命周期的特定节点执行自定义脚本或程序，例如工具执行前后、会话开始/结束以及其他关键事件期间。

Hooks 默认启用。你可以在设置文件中将 `disableAllHooks` 设为 `true`（与 `hooks` 同级，位于顶层）来临时禁用所有 hooks：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

此操作会禁用所有 hooks，但不会删除其配置。

## 什么是 Hooks？

Hooks 是用户自定义的脚本或程序，由 Qwen Code 在应用流程的预定节点自动执行。它们允许用户：

- 监控和审计工具使用情况
- 执行安全策略
- 向对话中注入额外上下文
- 根据事件自定义应用行为
- 与外部系统和服务集成
- 以编程方式修改工具输入或响应

## Hook 类型

Qwen Code 支持四种 hook 执行器类型：

| 类型       | 描述                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | 执行 shell 命令。通过 `stdin` 接收 JSON，通过 `stdout` 返回结果。              |
| `http`     | 将 JSON 作为 `POST` 请求体发送到指定 URL，通过 HTTP 响应体返回结果。 |
| `function` | 直接调用已注册的 JavaScript 函数（仅适用于会话级 hooks）。                     |
| `prompt`   | 使用 LLM 评估 hook 输入并返回决策。                                                       |

### Command Hooks

Command hooks 通过子进程执行命令。输入 JSON 通过 stdin 传递，输出通过 stdout 返回。

**配置：**

| 字段           | 类型                     | 是否必填 | 描述                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | 是      | Hook 类型                                   |
| `command`       | `string`                 | 是      | 要执行的命令                          |
| `name`          | `string`                 | 否       | Hook 名称（用于日志）                     |
| `description`   | `string`                 | 否       | Hook 描述                            |
| `timeout`       | `number`                 | 否       | 超时时间（毫秒），默认 60000      |
| `async`         | `boolean`                | 否       | 是否在后台异步运行 |
| `env`           | `Record<string, string>` | 否       | 环境变量                       |
| `shell`         | `"bash" \| "powershell"` | 否       | 使用的 shell                                |
| `statusMessage` | `string`                 | 否       | 执行期间显示的状态消息   |

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

HTTP hooks 将 hook 输入作为 POST 请求发送到指定 URL。支持 URL 白名单、DNS 级别的 SSRF 防护、环境变量插值以及其他安全特性。

**配置：**

| 字段            | 类型                     | 是否必填 | 描述                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | 是      | Hook 类型                                                 |
| `url`            | `string`                 | 是      | 目标 URL                                                |
| `headers`        | `Record<string, string>` | 否       | 请求头（支持环境变量插值）          |
| `allowedEnvVars` | `string[]`               | 否       | URL/请求头中允许使用的环境变量白名单 |
| `timeout`        | `number`                 | 否       | 超时时间（秒），默认 600                           |
| `name`           | `string`                 | 否       | Hook 名称（用于日志）                                   |
| `statusMessage`  | `string`                 | 否       | 执行期间显示的状态消息                 |
| `once`           | `boolean`                | 否       | 每个会话每个事件只执行一次（仅 HTTP hooks） |

**安全特性：**

- **URL 白名单**：通过 `allowedUrls` 配置允许的 URL 模式
- **SSRF 防护**：阻止私有 IP（10.x.x.x、172.16-31.x.x、192.168.x.x 等），但允许回环地址（127.0.0.1、::1）
- **DNS 验证**：在请求前验证域名解析，防止 DNS 重绑定攻击
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

### Function Hooks

Function hooks 直接调用已注册的 JavaScript/TypeScript 函数。它们由 Skill 系统内部使用，目前不作为公共 API 向最终用户开放。

**注意**：对于大多数使用场景，请改用 **command hooks** 或 **HTTP hooks**，可在设置文件中进行配置。

### Prompt Hooks

Prompt hooks 使用 LLM 评估 hook 输入并返回决策。这对于基于上下文做出智能决策非常有用，例如决定是否允许或阻止某个操作。

**工作原理：**

1. Hook 输入 JSON 通过 `$ARGUMENTS` 占位符注入到你的 prompt 中
2. Prompt 被发送给 LLM（默认使用当前模型）
3. LLM 返回包含决策的 JSON 响应
4. Qwen Code 处理决策并相应地继续或阻止执行

**配置：**

| 字段           | 类型       | 是否必填 | 描述                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | 是      | Hook 类型                                           |
| `prompt`        | `string`   | 是      | 发送给 LLM 的 prompt，使用 `$ARGUMENTS` 表示 hook 输入 |
| `model`         | `string`   | 否       | 使用的模型（默认为当前模型）       |
| `timeout`       | `number`   | 否       | 超时时间（秒），默认 30                      |
| `name`          | `string`   | 否       | Hook 名称（用于日志）                             |
| `description`   | `string`   | 否       | Hook 描述                                    |
| `statusMessage` | `string`   | 否       | 执行期间显示的状态消息           |

**响应格式：**

LLM 必须返回以下结构的 JSON：

```json
{
  "ok": true,
  "reason": "决策说明",
  "additionalContext": "可选的注入到对话中的上下文"
}
```

| 字段               | 描述                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` 表示允许/继续，`false` 表示阻止/停止                            |
| `reason`            | 当 `ok` 为 `false` 时必填，向模型展示阻止原因     |
| `additionalContext` | 可选，允许时注入对话的额外上下文 |

**支持的事件：**

Prompt hooks 可用于大多数 hook 事件，包括：

- `PreToolUse` - 评估是否允许工具调用
- `PostToolUse` - 评估工具结果并按需注入上下文
- `Stop` - 决定继续还是停止
- `SubagentStop` - 评估子 agent 结果
- `UserPromptSubmit` - 评估或丰富用户 prompt

**示例：Stop Hook**

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

当 `ok` 为 `false` 时，Qwen Code 将继续工作，并将 `reason` 作为下一轮响应的上下文。

**示例：PreToolUse Hook**

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

## Hook 事件

Hooks 在 Qwen Code 会话的特定节点触发。不同事件支持不同的 matcher 来筛选触发条件。

| 事件                | 触发时机                            | Matcher 目标                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | 工具执行前                     | 工具名称（`WriteFile`、`ReadFile`、`Bash` 等）         |
| `PostToolUse`        | 工具成功执行后           | 工具名称                                                 |
| `PostToolUseFailure` | 工具执行失败后                | 工具名称                                                 |
| `UserPromptSubmit`   | 用户提交 prompt 后                 | 无（始终触发）                                       |
| `SessionStart`       | 会话开始或恢复时            | 来源（`startup`、`resume`、`clear`、`compact`）          |
| `SessionEnd`         | 会话结束时                         | 原因（`clear`、`logout`、`prompt_input_exit` 等）     |
| `Stop`               | Claude 准备结束响应时 | 无（始终触发）                                       |
| `SubagentStart`      | 子 agent 启动时                      | Agent 类型（`Bash`、`Explorer`、`Plan` 等）             |
| `SubagentStop`       | 子 agent 停止时                       | Agent 类型                                                |
| `PreCompact`         | 对话压缩前            | 触发方式（`manual`、`auto`）                                |
| `Notification`       | 发送通知时               | 类型（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 显示权限对话框时           | 工具名称                                                 |
| `TodoCreated`        | 创建新 todo 时           | 无（始终触发）                                       |
| `TodoCompleted`      | todo 被标记为已完成时   | 无（始终触发）                                       |

### Matcher 模式

`matcher` 是用于筛选触发条件的正则表达式。

| 事件类型          | 事件                                                                 | Matcher 支持 | Matcher 目标                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| 工具事件         | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest` | ✅ 正则        | 工具名称：`WriteFile`、`ReadFile`、`Bash` 等         |
| 子 Agent 事件     | `SubagentStart`、`SubagentStop`                                        | ✅ 正则        | Agent 类型：`Bash`、`Explorer` 等                     |
| 会话事件      | `SessionStart`                                                         | ✅ 正则        | 来源：`startup`、`resume`、`clear`、`compact`          |
| 会话事件      | `SessionEnd`                                                           | ✅ 正则        | 原因：`clear`、`logout`、`prompt_input_exit` 等     |
| 通知事件 | `Notification`                                                         | ✅ 精确匹配  | 类型：`permission_prompt`、`idle_prompt`、`auth_success` |
| 压缩事件      | `PreCompact`                                                           | ✅ 精确匹配  | 触发方式：`manual`、`auto`                                |
| Todo 事件         | `TodoCreated`、`TodoCompleted`                                         | ❌ 不支持           | N/A                                                      |
| Prompt 事件       | `UserPromptSubmit`                                                     | ❌ 不支持           | N/A                                                      |
| Stop 事件         | `Stop`                                                                 | ❌ 不支持           | N/A                                                      |

**Matcher 语法：**

- 空字符串 `""` 或 `"*"` 匹配该类型的所有事件
- 支持标准正则语法（如 `^Bash$`、`Read.*`、`(WriteFile|Edit)`）

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

所有 hooks 通过 stdin（command）或 POST body（http）接收标准化的 JSON 格式输入。

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

根据 hook 类型会追加特定事件字段。在子 agent 中运行时，还会额外包含 `agent_id` 和 `agent_type`。

### Hook 输出结构

Hook 输出通过 `stdout`（command）或 HTTP 响应体（http）以 JSON 形式返回。

**退出码行为（Command Hooks）：**

| 退出码 | 行为                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | 成功。解析 `stdout` 中的 JSON 以控制行为。                                  |
| `2`       | **阻塞错误**。忽略 `stdout`，将 `stderr` 作为错误反馈传递给模型。 |
| 其他     | 非阻塞错误。`stderr` 仅在调试模式下显示，执行继续。           |

**输出结构：**

Hook 输出支持三类字段：

1. **通用字段**：`continue`、`stopReason`、`suppressOutput`、`systemMessage`
2. **顶层决策**：`decision`、`reason`（某些事件使用）
3. **特定事件控制**：`hookSpecificOutput`（必须包含 `hookEventName`）

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "操作已批准",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "额外的上下文信息"
  }
}
```

### 各 Hook 事件详情

#### PreToolUse

**用途**：在工具使用前执行，用于权限检查、输入验证或上下文注入。

**特定事件字段**：

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
- `hookSpecificOutput.permissionDecisionReason`：决策说明（必填）
- `hookSpecificOutput.updatedInput`：修改后的工具输入参数，替代原始参数
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：虽然底层类在技术上支持 `decision` 和 `reason` 等标准 hook 输出字段，但官方接口期望使用包含 `permissionDecision` 和 `permissionDecisionReason` 的 `hookSpecificOutput`。

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "安全策略阻止数据库写入",
    "additionalContext": "当前环境：生产环境，请谨慎操作。"
  }
}
```

#### PostToolUse

**用途**：在工具成功完成后执行，用于处理结果、记录输出或注入额外上下文。

**特定事件字段**：

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

- `decision`："allow"、"deny"、"block"（未指定时默认为 "allow"）
- `reason`：决策原因
- `hookSpecificOutput.additionalContext`：需要包含的额外信息

**示例输出**：

```json
{
  "decision": "allow",
  "reason": "工具执行成功",
  "hookSpecificOutput": {
    "additionalContext": "文件修改已记录到审计日志"
  }
}
```

#### PostToolUseFailure

**用途**：在工具执行失败时执行，用于处理错误、发送告警或记录失败信息。

**特定事件字段**：

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
    "additionalContext": "错误：文件未找到。失败已记录到监控系统。"
  }
}
```

#### UserPromptSubmit

**用途**：在用户提交 prompt 时执行，用于修改、验证或丰富输入内容。

**特定事件字段**：

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的可读说明
- `hookSpecificOutput.additionalContext`：追加到 prompt 的额外上下文（可选）

**注意**：由于 UserPromptSubmitOutput 继承自 HookOutput，所有标准字段均可用，但仅 hookSpecificOutput 中的 additionalContext 是专为此事件定义的。

**示例输出**：

```json
{
  "decision": "allow",
  "reason": "Prompt 已审查并通过",
  "hookSpecificOutput": {
    "additionalContext": "请记得遵守公司编码规范。"
  }
}
```

#### SessionStart

**用途**：在新会话启动时执行，用于完成初始化任务。

**特定事件字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：会话中可用的上下文
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "会话已启动，安全策略已启用。"
  }
}
```

#### SessionEnd

**用途**：在会话结束时执行，用于完成清理任务。

**特定事件字段**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**输出选项**：

- 标准 hook 输出字段（通常不用于阻塞）

#### Stop

**用途**：在 Qwen 结束响应前执行，用于提供最终反馈或摘要。

**特定事件字段**：

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的可读说明
- `stopReason`：包含在停止响应中的反馈
- `continue`：设为 false 停止执行
- `hookSpecificOutput.additionalContext`：额外上下文信息

**注意**：由于 StopOutput 继承自 HookOutput，所有标准字段均可用，但 stopReason 字段对于此事件尤为重要。

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**用途**：在轮次因 API 错误结束时执行（替代 Stop）。这是一个**发后即忘**的事件——hook 输出和退出码均被忽略。

**特定事件字段**：

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**：匹配 `error` 字段。例如，`"matcher": "rate_limit"` 仅在限速错误时触发。

**输出选项**：

- **无** - StopFailure 是发后即忘模式，所有 hook 输出和退出码均被忽略。

**退出码处理**：

| 退出码 | 行为                  |
| --------- | ------------------------- |
| 任意值       | 忽略（发后即忘） |

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

- 限速监控与告警
- 认证失败日志记录
- 计费错误通知
- 错误统计收集

#### SubagentStart

**用途**：在子 agent（如 Task 工具）启动时执行，用于设置上下文或权限。

**特定事件字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：子 agent 的初始上下文
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "子 Agent 已使用受限权限初始化。"
  }
}
```

#### SubagentStop

**用途**：在子 agent 完成时执行，用于完成收尾任务。

**特定事件字段**：

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
- `reason`：决策的可读说明

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**用途**：在对话压缩前执行，用于准备或记录压缩操作。

**特定事件字段**：

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
    "additionalContext": "正在压缩对话以保持最优上下文窗口。"
  }
}
```

#### PostCompact

**用途**：在对话压缩完成后执行，用于归档摘要或追踪用量。

**特定事件字段**：

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**：匹配 `trigger` 字段。例如，`"matcher": "manual"` 仅在通过 `/compact` 命令手动压缩时触发。

**输出选项**：

- `hookSpecificOutput.additionalContext`：额外上下文（仅用于日志）
- 标准 hook 输出字段（仅用于日志）

**注意**：PostCompact **不在**官方决策模式支持的事件列表中。`decision` 字段和其他控制字段不会产生任何控制效果——仅用于日志记录。

**退出码处理**：

| 退出码 | 行为                                                  |
| --------- | --------------------------------------------------------- |
| 0         | 成功 - 在 verbose 模式下向用户显示 stdout            |
| 其他     | 非阻塞错误 - 在 verbose 模式下向用户显示 stderr |

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

- 将摘要归档到文件或数据库
- 使用量统计追踪
- 上下文变更监控
- 压缩操作的审计日志

#### Notification

**用途**：在发送通知时执行，用于自定义或拦截通知。

**特定事件字段**：

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注意**：`elicitation_dialog` 类型已定义但尚未实现。

**输出选项**：

- `hookSpecificOutput.additionalContext`：需要包含的额外信息
- 标准 hook 输出字段

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "通知已由监控系统处理。"
  }
}
```

#### PermissionRequest

**用途**：在显示权限对话框时执行，用于自动化决策或更新权限。

**特定事件字段**：

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
  - `message`：向用户展示的消息（可选）
  - `interrupt`：是否中断工作流（可选）

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "根据安全策略授予权限",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**用途**：在通过 `todo_write` 工具创建新 todo 时执行，允许验证、记录或阻止 todo 创建。

Todo hooks 分两个阶段运行：

- `validation`：在持久化前运行，仅用于验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化后运行，用于日志记录或同步等副作用；此阶段 `block` 或 `deny` 将被忽略。

**特定事件字段**：

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
- `reason`：决策的可读说明（阻止时必填）

**阻塞行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，todo 创建将被阻止。todo 列表保持不变，reason 作为反馈提供给模型。

在 `postWrite` 阶段，todo 已持久化。Hooks 仍可返回输出，但 `block`/`deny` 不会撤销写入，不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo 内容验证成功"
}
```

**示例输出（阻止）**：

```json
{
  "decision": "block",
  "reason": "Todo 内容过短，最少需要 5 个字符。"
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

**配置示例**：

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

**用途**：在 todo 被标记为已完成时执行，允许验证、记录或阻止 todo 完成。

Todo hooks 分两个阶段运行：

- `validation`：在持久化前运行，仅用于验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化后运行，用于日志记录或同步等副作用；此阶段 `block` 或 `deny` 将被忽略。

**特定事件字段**：

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
- `reason`：决策的可读说明（阻止时必填）

**阻塞行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，todo 完成将被阻止。todo 保持原有状态，reason 作为反馈提供给模型。

在 `postWrite` 阶段，todo 已持久化。Hooks 仍可返回输出，但 `block`/`deny` 不会撤销写入，不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo 完成已批准"
}
```

**示例输出（阻止）**：

```json
{
  "decision": "block",
  "reason": "在依赖任务完成前，无法完成此 todo。"
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

**配置示例**：

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

**使用场景**：

- **日志记录**：追踪 todo 创建和完成情况，用于审计或数据分析
- **验证**：执行内容质量标准（最小长度、必填关键词）
- **工作流控制**：在前置条件满足前阻止完成
- **集成**：与外部任务管理系统同步 todo（Jira、Trello 等）

## Hook 配置

Hooks 在 Qwen Code 设置中配置，通常位于 `.qwen/settings.json` 或用户配置文件中：

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

- 默认情况下，hooks 并行执行以提升性能
- 在 hook 定义中使用 `sequential: true` 可强制按顺序执行
- 顺序执行的 hooks 可为链中的后续 hooks 修改输入

### 异步 Hooks

只有 `command` 类型支持异步执行。设置 `"async": true` 可在后台运行 hook 而不阻塞主流程。

**特性：**

- 无法返回决策控制（操作已发生）
- 结果在下一轮对话中通过 `systemMessage` 或 `additionalContext` 注入
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

- Hooks 以用户身份在用户环境中运行
- 项目级 hooks 需要受信文件夹状态
- 超时机制防止 hooks 挂起（默认：60 秒）

## 最佳实践

### 示例 1：安全验证 Hook

一个记录日志并可能阻止危险命令的 PreToolUse hook：

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

一个将所有工具执行记录发送到远程审计服务的 PostToolUse HTTP hook：

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

一个验证用户 prompt 中敏感信息、并为长 prompt 提供上下文的 UserPromptSubmit hook：

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

- 检查应用日志以获取 hook 执行详情
- 验证 hook 脚本的权限和可执行性
- 确保 hook 输出中 JSON 格式正确
- 使用精确的 matcher 模式避免意外触发 hooks
- 使用 `--debug` 模式查看 hook 匹配和执行的详细信息
- 临时禁用所有 hooks：在设置中添加 `"disableAllHooks": true`
