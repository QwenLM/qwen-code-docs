# Qwen Code 钩子

## 概述

Qwen Code 钩子提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用的行为。通过钩子，用户可以在应用生命周期的特定节点（如工具执行前、工具执行后、会话开始/结束以及其他关键事件）执行自定义脚本或程序。

钩子默认启用。你可以通过在设置文件顶层（与 `hooks` 同级）将 `disableAllHooks` 设置为 `true` 来临时禁用所有钩子：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

这样可以在不删除钩子配置的情况下禁用所有钩子。

## 什么是钩子？

钩子是用户定义的脚本或程序，由 Qwen Code 在应用流程的预定义节点自动执行。它们允许用户：

- 监控和审计工具使用情况
- 执行安全策略
- 向对话注入额外的上下文
- 根据事件自定义应用行为
- 与外部系统和服务集成
- 通过编程方式修改工具输入或响应

## 钩子类型

Qwen Code 支持四种钩子执行器类型：

| 类型       | 描述                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | 执行 shell 命令。通过 `stdin` 接收 JSON，通过 `stdout` 返回结果。              |
| `http`     | 将 JSON 作为 `POST` 请求体发送到指定 URL。通过 HTTP 响应体返回结果。 |
| `function` | 直接调用已注册的 JavaScript 函数（仅限会话级钩子）。                     |
| `prompt`   | 使用 LLM 评估钩子输入并返回决策。                                       |

### 命令钩子

命令钩子通过子进程执行命令。输入 JSON 通过 stdin 传入，输出通过 stdout 返回。

**配置：**

| 字段             | 类型                     | 必填 | 描述                                    |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | 是      | 钩子类型                                   |
| `command`       | `string`                 | 是      | 要执行的命令                          |
| `name`          | `string`                 | 否       | 钩子名称（用于日志）                     |
| `description`   | `string`                 | 否       | 钩子描述                            |
| `timeout`       | `number`                 | 否       | 超时时长（毫秒），默认 60000      |
| `async`         | `boolean`                | 否       | 是否在后台异步运行 |
| `env`           | `Record<string, string>` | 否       | 环境变量                       |
| `shell`         | `"bash" \| "powershell"` | 否       | 使用的 shell                                |
| `statusMessage` | `string`                 | 否       | 执行期间显示的状态消息               |

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

HTTP 钩子将钩子输入作为 POST 请求发送到指定 URL。它们支持 URL 白名单、DNS 级别 SSRF 防护、环境变量插值等安全特性。

**配置：**

| 字段              | 类型                     | 必填 | 描述                                                     |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | 是      | 钩子类型                                                 |
| `url`            | `string`                 | 是      | 目标 URL                                                |
| `headers`        | `Record<string, string>` | 否       | 请求头（支持环境变量插值）          |
| `allowedEnvVars` | `string[]`               | 否       | 允许在 URL/请求头中使用的环境变量白名单 |
| `timeout`        | `number`                 | 否       | 超时时长（秒），默认 600                           |
| `name`           | `string`                 | 否       | 钩子名称（用于日志）                 |
| `statusMessage`  | `string`                 | 否       | 执行期间显示的状态消息                 |
| `once`           | `boolean`                | 否       | 每个事件每个会话仅执行一次（仅 HTTP 钩子） |

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

### 函数钩子

函数钩子直接调用已注册的 JavaScript/TypeScript 函数。它们在内部由 Skill 系统使用，目前未作为公开 API 向最终用户开放。

**注意**：对于大多数使用场景，请改用**命令钩子**或 **HTTP 钩子**，这些可以在设置文件中配置。

### 提示钩子

提示钩子使用 LLM 评估钩子输入并返回决策。这对于基于上下文做出智能决策非常有用，例如决定是否允许或阻止某个操作。

**工作原理：**

1. 钩子输入 JSON 通过 `$ARGUMENTS` 占位符注入到你的提示中
2. 提示被发送给 LLM（默认使用当前模型）
3. LLM 返回包含决策的 JSON 响应
4. Qwen Code 处理决策，相应地继续或阻止执行

**配置：**

| 字段             | 类型       | 必填 | 描述                                           |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | 是      | 钩子类型                                           |
| `prompt`        | `string`   | 是      | 发送给 LLM 的提示。使用 `$ARGUMENTS` 引用钩子输入 |
| `model`         | `string`   | 否       | 使用的模型（默认使用当前模型）       |
| `timeout`       | `number`   | 否       | 超时时长（秒），默认 30                      |
| `name`          | `string`   | 否       | 钩子名称（用于日志）                             |
| `description`   | `string`   | 否       | 钩子描述                                    |
| `statusMessage` | `string`   | 否       | 执行期间显示的状态消息               |

**响应格式：**

LLM 必须返回如下结构的 JSON：

```json
{
  "ok": true,
  "reason": "决策解释",
  "additionalContext": "可选的上下文，注入到对话中"
}
```

| 字段                 | 描述                                                                    |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` 表示允许/继续，`false` 表示阻止/停止                            |
| `reason`            | 当 `ok` 为 `false` 时必填。向模型说明阻止原因     |
| `additionalContext` | 可选。允许时注入到对话中的额外上下文 |

**支持的事件：**

提示钩子可用于大多数钩子事件，包括：

- `PreToolUse` - 评估是否允许工具调用
- `PostToolUse` - 评估工具结果，并可注入上下文
- `Stop` - 决定是否继续或停止
- `SubagentStop` - 评估子代理结果
- `UserPromptSubmit` - 评估或丰富用户提示

**示例：停止钩子**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "你正在评估 Qwen Code 是否应该停止工作。上下文：$ARGUMENTS\n\n分析对话，判断是否：\n1. 用户请求的所有任务均已完成\n2. 有任何错误需要处理\n3. 需要后续工作\n\n以 JSON 格式响应：{\"ok\": true} 表示允许停止，或 {\"ok\": false, \"reason\": \"你的解释\"} 表示继续工作。",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

当 `ok` 为 `false` 时，Qwen Code 将继续工作，并将 `reason` 作为下一次响应的上下文。

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
            "prompt": "评估此工具调用的安全性。工具输入：$ARGUMENTS\n\n检查以下内容：\n- 危险命令（rm -rf、curl | sh 等）\n- 未授权访问尝试\n- 数据泄露模式\n\n如果安全，响应 {\"ok\": true}；如果阻止，响应 {\"ok\": false, \"reason\": \"担忧原因\"}。",
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

钩子在 Qwen Code 会话的特定节点触发。不同事件支持不同的匹配器来过滤触发条件。

| 事件                  | 触发时机                                | 匹配器目标                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | 工具执行之前                     | 工具名称（`WriteFile`、`ReadFile`、`Bash` 等）         |
| `PostToolUse`        | 工具执行成功之后           | 工具名称                                                 |
| `PostToolUseFailure` | 工具执行失败之后                | 工具名称                                                 |
| `UserPromptSubmit`   | 用户提交提示之后         | 无（始终触发）                                       |
| `SessionStart`       | 会话开始或恢复时            | 来源（`startup`、`resume`、`clear`、`compact`）          |
| `SessionEnd`         | 会话结束时                         | 原因（`clear`、`logout`、`prompt_input_exit` 等）     |
| `Stop`               | Claude 准备结束响应时 | 无（始终触发）                                       |
| `SubagentStart`      | 子代理开始时                      | 代理类型（`Bash`、`Explorer`、`Plan` 等）             |
| `SubagentStop`       | 子代理停止时                       | 代理类型                                                |
| `PreCompact`         | 对话压缩之前            | 触发方式（`manual`、`auto`）                                |
| `Notification`       | 通知发送时               | 类型（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 权限对话框显示时           | 工具名称                                                 |
| `TodoCreated`        | 新待办事项创建时           | 无（始终触发）                                       |
| `TodoCompleted`      | 待办事项标记为完成时   | 无（始终触发）                                       |

### 匹配器模式

`matcher` 是用于过滤触发条件的正则表达式。

| 事件类型          | 事件                                                                 | 匹配器支持 | 匹配器目标                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| 工具事件         | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest` | ✅ 正则        | 工具名称：`WriteFile`、`ReadFile`、`Bash` 等         |
| 子代理事件     | `SubagentStart`、`SubagentStop`                                        | ✅ 正则        | 代理类型：`Bash`、`Explorer` 等                     |
| 会话事件      | `SessionStart`                                                         | ✅ 正则        | 来源：`startup`、`resume`、`clear`、`compact`          |
| 会话事件      | `SessionEnd`                                                           | ✅ 正则        | 原因：`clear`、`logout`、`prompt_input_exit` 等     |
| 通知事件 | `Notification`                                                         | ✅ 精确匹配  | 类型：`permission_prompt`、`idle_prompt`、`auth_success` |
| 压缩事件      | `PreCompact`                                                           | ✅ 精确匹配  | 触发方式：`manual`、`auto`                                |
| 待办事件         | `TodoCreated`、`TodoCompleted`                                         | ❌ 否           | N/A                                                      |
| 提示事件       | `UserPromptSubmit`                                                     | ❌ 否           | N/A                                                      |
| 停止事件         | `Stop`                                                                 | ❌ 否           | N/A                                                      |

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

所有钩子通过 stdin（命令）或 POST 请求体（HTTP）接收标准化的 JSON 格式输入。

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

根据钩子类型，会添加事件特定字段。当在子代理中运行时，还会额外包含 `agent_id` 和 `agent_type`。

### 钩子输出结构

钩子输出通过 `stdout`（命令）或 HTTP 响应体（HTTP）以 JSON 形式返回。

**退出码行为（命令钩子）：**

| 退出码 | 行为                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | 成功。解析 `stdout` 中的 JSON 以控制行为。                                  |
| `2`       | **阻塞错误**。忽略 `stdout`，将 `stderr` 作为错误反馈传递给模型。 |
| 其他     | 非阻塞错误。`stderr` 仅在调试模式中显示，执行继续。           |

**输出结构：**

钩子输出支持三类字段：

1. **通用字段**：`continue`、`stopReason`、`suppressOutput`、`systemMessage`
2. **顶层决策**：`decision`、`reason`（部分事件使用）
3. **事件特定控制**：`hookSpecificOutput`（必须包含 `hookEventName`）

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "操作已批准",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "附加上下文信息"
  }
}
```

### 各钩子事件详情

#### PreToolUse

**用途**：在工具使用前执行，用于权限检查、输入验证或上下文注入。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "正在执行的工具名称",
  "tool_input": "包含工具输入参数的对象",
  "tool_use_id": "此工具使用实例的唯一标识符（内部格式，例如 toolu_xxx）",
  "tool_call_id": "来自 LLM 提供商的原始 API 调用 ID（例如 OpenAI/Qwen 的 call_xxx）（可选）"
}
```

**输出选项**：

- `hookSpecificOutput.permissionDecision`："allow"、"deny" 或 "ask"（必填）
- `hookSpecificOutput.permissionDecisionReason`：决策的解释（必填）
- `hookSpecificOutput.updatedInput`：要使用的修改后的工具输入参数，替代原始参数
- `hookSpecificOutput.additionalContext`：附加上下文信息

**注意**：虽然底层类技术上支持标准钩子输出字段如 `decision` 和 `reason`，但官方接口期望使用 `hookSpecificOutput` 中的 `permissionDecision` 和 `permissionDecisionReason`。

**示例输出**：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "安全策略阻止数据库写入",
    "additionalContext": "当前环境：生产环境。请谨慎操作。"
  }
}
```

#### PostToolUse

**用途**：在工具成功完成后执行，用于处理结果、记录日志或注入额外上下文。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "已执行工具的名称",
  "tool_input": "包含工具输入参数的对象",
  "tool_response": "包含工具响应的对象",
  "tool_use_id": "此工具使用实例的唯一标识符（内部格式，例如 toolu_xxx）",
  "tool_call_id": "来自 LLM 提供商的原始 API 调用 ID（例如 OpenAI/Qwen 的 call_xxx）（可选）"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block"（未指定时默认为 "allow"）
- `reason`：决策的原因
- `hookSpecificOutput.additionalContext`：要包含的附加信息

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

**用途**：在工具执行失败时执行，用于处理错误、发送警报或记录失败。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "工具使用的唯一标识符（内部格式，例如 toolu_xxx）",
  "tool_call_id": "来自 LLM 提供商的原始 API 调用 ID（例如 OpenAI/Qwen 的 call_xxx）（可选）",
  "tool_name": "失败的工具名称",
  "tool_input": "包含工具输入参数的对象",
  "error": "描述失败的错误信息",
  "is_interrupt": "布尔值，指示失败是否由用户中断引起（可选）"
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

**用途**：当用户提交 prompt 以修改、验证或丰富输入时执行。

**事件特定字段**：

```json
{
  "prompt": "用户提交的 prompt 文本"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：对决策的人类可读解释
- `hookSpecificOutput.additionalContext`：要附加到 prompt 的额外上下文（可选）

**注意**：由于 UserPromptSubmitOutput 继承自 HookOutput，所有标准字段均可用，但仅 `hookSpecificOutput` 中的 `additionalContext` 是为该事件专门定义的。

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

**用途**：当新会话启动时执行，用于执行初始化任务。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "正在使用的模型",
  "agent_type": "agent 的类型（如果适用，可选）"
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

**用途**：当会话结束时执行，用于执行清理任务。

**事件特定字段**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**输出选项**：

- 标准 hook 输出字段（通常不用于阻塞）

#### Stop

**用途**：在 Qwen 准备结束其响应之前执行，用于提供最终反馈或摘要。

**事件特定字段**：

```json
{
  "stop_hook_active": "布尔值，指示 stop hook 是否激活",
  "last_assistant_message": "助手的最后一条消息"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：对决策的人类可读解释
- `stopReason`：要包含在停止响应中的反馈
- `continue`：设为 false 以停止执行
- `hookSpecificOutput.additionalContext`：额外的上下文信息

**注意**：由于 StopOutput 继承自 HookOutput，所有标准字段均可用，但 `stopReason` 字段与该事件尤为相关。

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**用途**：当轮到 API 错误而不是正常停止时执行。这是一个 **fire-and-forget** 事件——hook 输出和退出代码被忽略。

**事件特定字段**：

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "详细的错误消息（可选）",
  "last_assistant_message": "错误发生前助手的最后一条消息（可选）"
}
```

**匹配器**：针对 `error` 字段进行匹配。例如，`"matcher": "rate_limit"` 将仅针对速率限制错误触发。

**输出选项**：

- **无** - StopFailure 是 fire-and-forget。所有 hook 输出和退出代码都被忽略。

**退出代码处理**：

| 退出代码 | 行为                    |
| -------- | ----------------------- |
| 任意     | 忽略（fire-and-forget） |

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

**使用场景**：

- 速率限制监控和告警
- 认证失败日志记录
- 计费错误通知
- 错误统计收集

#### SubagentStart

**用途**：当子 agent（如 Task 工具）启动时执行，用于设置上下文或权限。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "子 agent 的标识符",
  "agent_type": "agent 的类型（Bash、Explorer、Plan、Custom 等）"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：子 agent 的初始上下文
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

**用途**：当子 agent 完成时执行，用于执行最终化任务。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "布尔值，指示 stop hook 是否激活",
  "agent_id": "子 agent 的标识符",
  "agent_type": "agent 的类型",
  "agent_transcript_path": "子 agent 转录文件的路径",
  "last_assistant_message": "子 agent 的最后一条消息"
}
```

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：对决策的人类可读解释

**示例输出**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**用途**：在对话压缩之前执行，用于准备或记录压缩。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "当前设置的自定义指令"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：压缩前要包含的上下文
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

**用途**：在对话压缩完成后执行，用于归档摘要或跟踪使用情况。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "compact_summary": "压缩过程生成的摘要"
}
```

**匹配器**：针对 `trigger` 字段进行匹配。例如，`"matcher": "manual"` 将仅针对通过 `/compact` 命令手动压缩触发。

**输出选项**：

- `hookSpecificOutput.additionalContext`：额外的上下文（仅用于日志记录）
- 标准 hook 输出字段（仅用于日志记录）

**注意**：PostCompact **不在**官方决策模式支持的事件列表中。`decision` 字段和其他控制字段不会产生任何控制效果——它们仅用于日志记录目的。

**退出代码处理**：

| 退出代码 | 行为                                              |
| -------- | ------------------------------------------------- |
| 0        | 成功 - 在详细模式下将 stdout 显示给用户           |
| 其他     | 非阻塞错误 - 在详细模式下将 stderr 显示给用户     |

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

**使用场景**：

- 将摘要归档到文件或数据库
- 使用统计跟踪
- 上下文更改监控
- 压缩操作的审计日志记录

#### Notification

**用途**：当发送通知时执行，用于自定义或拦截通知。

**事件特定字段**：

```json
{
  "message": "通知消息内容",
  "title": "通知标题（可选）",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注意**：`elicitation_dialog` 类型已定义但尚未实现。

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

**用途**：当显示权限对话框时执行，用于自动化决策或更新权限。

**事件特定字段**：

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "请求权限的工具名称",
  "tool_input": "包含工具输入参数的对象",
  "permission_suggestions": "建议的权限数组（可选）"
}
```

**输出选项**：

- `hookSpecificOutput.decision`：包含权限决策详细信息的结构化对象：
  - `behavior`："allow" 或 "deny"
  - `updatedInput`：修改后的工具输入（可选）
  - `updatedPermissions`：修改后的权限（可选）
  - `message`：向用户显示的消息（可选）
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

**用途**：当通过 `todo_write` 工具创建新的待办事项时执行。允许验证、记录或阻止待办事项的创建。

待办事项 hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅用于验证；返回 `block` 或 `deny` 会阻止写入。
- `postWrite`：在持久化之后运行。用于副作用，如日志记录或同步；`block` 或 `deny` 在此阶段被忽略。

**事件特定字段**：

```json
{
  "todo_id": "待办事项的唯一标识符",
  "todo_content": "待办事项的内容/描述",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "当前列表中所有待办事项的数组",
  "phase": "validation | postWrite"
}
```

**输出选项**：

- `decision`："allow"、"block" 或 "deny"
- `reason`：对决策的人类可读解释（阻塞时需要）

**阻塞行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出代码 2）时，待办事项创建被阻止。待办事项列表保持不变，并且 reason 作为反馈提供给模型。

在 `postWrite` 阶段，待办事项已持久化。Hook 仍可返回输出，但 `block` / `deny` 不会撤销写入，不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**示例输出（阻止）**：

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
# 在创建前验证待办事项内容

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# 检查最小长度
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# 阻止与测试相关的待办事项
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

**用途**：当待办事项标记为已完成时执行。允许验证、记录或阻止待办事项的完成。

待办事项 hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅用于验证；返回 `block` 或 `deny` 会阻止写入。
- `postWrite`：在持久化之后运行。用于副作用，如日志记录或同步；`block` 或 `deny` 在此阶段被忽略。

**事件特定字段**：

```json
{
  "todo_id": "待办事项的唯一标识符",
  "todo_content": "待办事项的内容/描述",
  "previous_status": "pending | in_progress（完成之前的状态）",
  "all_todos": "当前列表中所有待办事项的数组",
  "phase": "validation | postWrite"
}
```

**输出选项**：

- `decision`："allow"、"block" 或 "deny"
- `reason`：对决策的人类可读解释（阻塞时需要）

**阻塞行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出代码 2）时，待办事项完成被阻止。待办事项保持其之前的状态，并且 reason 作为反馈提供给模型。

在 `postWrite` 阶段，待办事项已持久化。Hook 仍可返回输出，但 `block` / `deny` 不会撤销写入，不应用于验证。

**示例输出（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**示例输出（阻止）**：

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
# 验证待办事项完成条件

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# 检查是否有未完成的依赖待办事项（示例逻辑）
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

**使用场景**：

- **日志记录**：跟踪待办事项的创建和完成，用于审计或分析
- **验证**：强制执行内容质量标准（最小长度、必需关键词）
- **工作流控制**：在满足前置条件之前阻止完成
- **集成**：将待办事项同步到外部任务管理系统（Jira、Trello 等）

## Hook 配置

Hook 在 Qwen Code 设置中配置，通常位于 `.qwen/settings.json` 或用户配置文件中：

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
            "description": "在工具执行前运行安全检查",
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
- 在 hook 定义中使用 `sequential: true` 来强制顺序依赖执行
- 顺序 hook 可以修改链中后续 hook 的输入

### 异步 Hook

只有 `command` 类型支持异步执行。设置 `"async": true` 将在后台运行 hook，不阻塞主流程。

**特性**：

- 无法返回决策控制（操作已发生）
- 结果通过 `systemMessage` 或 `additionalContext` 注入到下一个对话轮次中
- 适用于审计、日志记录、后台测试等

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
- 项目级 hook 需要受信任文件夹状态
- 超时机制防止 hook 挂起（默认：60 秒）

## 最佳实践

### 示例 1：安全验证 Hook

一个 PreToolUse hook，用于记录并可能阻止危险命令：

**security_check.sh**

```bash
#!/bin/bash

# 从标准输入读取输入
INPUT=$(cat)

# 解析输入以提取工具信息
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# 检查潜在的危险操作
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # 阻塞错误
fi

# 记录操作
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# 允许并添加额外上下文
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
            "description": "对 bash 命令进行安全验证",
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

一个 UserPromptSubmit hook，用于验证用户 prompt 中的敏感信息，并为长 prompt 提供上下文：

**prompt_validator.py**

```python
import json
import sys
import re

# 从标准输入加载数据
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# 敏感词列表
sensitive_words = ["password", "secret", "token", "api_key"]

# 检查敏感信息
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # 阻止包含敏感信息的 prompt
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# 检查 prompt 长度，如果太长则添加警告上下文
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# 正常情况无需处理
exit(0)
```
## 故障排除

- 检查应用程序日志以获取钩子执行详情
- 验证钩子脚本的权限和可执行性
- 确保钩子输出中的 JSON 格式正确
- 使用特定的匹配模式以避免意外执行钩子
- 使用 `--debug` 模式查看详细的钩子匹配和执行信息
- 临时禁用所有钩子：在设置中添加 `"disableAllHooks": true`