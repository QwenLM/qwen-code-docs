---

# Qwen Code 钩子

## 概述

Qwen Code 钩子提供了一种强大的机制，用于扩展和自定义 Qwen Code 应用程序的行为。钩子允许用户在应用程序生命周期的特定节点（如工具执行前、工具执行后、会话开始/结束以及其他关键事件期间）执行自定义脚本或程序。

钩子默认处于启用状态。你可以通过在设置文件（与 `hooks` 同级）中将 `disableAllHooks` 设置为 `true` 来临时禁用所有钩子：

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

这会禁用所有钩子，但不会删除其配置。

## 什么是钩子？

钩子是由用户定义的脚本或程序，Qwen Code 会在应用程序流程的预定义节点自动执行它们。它们允许用户：

- 监控和审计工具使用情况
- 强制执行安全策略
- 向对话中注入额外的上下文
- 根据事件自定义应用程序行为
- 与外部系统和服务集成
- 以编程方式修改工具输入或响应

## 钩子类型

Qwen Code 支持四种钩子执行器类型：

| 类型       | 描述                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| `command`  | 执行 shell 命令。通过 `stdin` 接收 JSON，通过 `stdout` 返回结果。                          |
| `http`     | 将 JSON 作为 `POST` 请求体发送到指定的 URL。通过 HTTP 响应体返回结果。                     |
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
| `shell`         | `"bash" \| "powershell"` | 否   | 要使用的 Shell                       |
| `statusMessage` | `string`                 | 否   | 执行期间显示的状态消息               |

**示例：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
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

HTTP 钩子将钩子输入作为 POST 请求发送到指定的 URL。它们支持 URL 白名单、DNS 级 SSRF 防护、环境变量插值等安全特性。

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
- **SSRF 防护**：拦截私有 IP（10.x.x.x、172.16-31.x.x、192.168.x.x 等），但允许环回地址（127.0.0.1、::1）
- **DNS 验证**：在请求前验证域名解析，以防止 DNS 重绑定攻击
- **环境变量插值**：使用 `${VAR}` 语法，仅允许 `allowedEnvVars` 白名单中的变量

#### 允许私有网络钩子（仅限托管环境）

默认情况下，HTTP 钩子无法指向私有或链路本地 IP 范围。在平台托管环境中，如果钩子接收方是第一方 VPC 内部端点（例如，解析到 `172.16.0.0/12` 的内部 API 网关），你可以通过以下配置放宽 IP 范围检查：

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- 此设置**仅从 User、System 和 SystemDefaults 设置作用域中生效**。在 Workspace（项目）设置中设置的值将被忽略并记录为警告，因此克隆的仓库永远无法自行授予此绕过权限。
- 该标志仅放宽通用私有/CGNAT/链路本地**范围**检查。云元数据端点在所有配置中保持阻止：`BLOCKED_HOSTS` 列表会逐字匹配（`metadata.google.internal`、`metadata.azure.internal` 等），元数据 IP `169.254.169.254` 和 `100.100.100.200` 在所有序列化形式（包括 IPv4 映射的 IPv6，如 `::ffff:a9fe:a9fe`）以及 DNS 解析后均被阻止。
- `security.allowedHttpHookUrls` 白名单仍然独立适用。在托管环境中，请将此标志与白名单配合使用，以确保只有预期的内部端点可达。

> **警告：** 启用此标志允许钩子访问你网络上的内部基础设施。仅在受信任的托管环境中启用——绝不在你无法控制的仓库中启用。

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

**示例：外部判断服务适配器**

上面的 `remote-security-check` 配置假定 `http://127.0.0.1:8080/hooks/pre-tool-use` 已经运行着一个遵循此协议的服务（POST 接收 `{tool_name, tool_input, ...}`，返回 `hookSpecificOutput.permissionDecision`）。下面是一个最小的、仅使用标准库的适配器，它补全了缺失的部分，连接到一个具体的判断后端，使整个示例可运行并可端到端测试，而不仅仅是一个桩代码。只有 `review()` 函数是后端特定的——将其函数体以及请求/响应形状替换为你使用的任何服务；其余部分（服务器、fail-open 处理、钩子响应形状）无论后端如何都保持不变。

_声明：下面使用的后端 [invinoveritas](https://api.babyblueviper.com) 是作者关联的服务——在此使用是因为它是可以端到端验证的服务，并非推荐。任何返回 JSON 裁决的 HTTP 服务都同样适用；只需更改 `review()` 即可。_

_数据处理：使用 `matcher: "*"` 时，**每个**工具调用的完整 `tool_input` 都会发送到判断后端——请将该输入视为敏感信息（它可能包含文件内容、路径或密钥）。如果你只需要判断 shell 命令，请缩小 matcher 范围（例如 `run_shell_command`）。_

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

已针对上述真实生产 API 进行了端到端实时测试：真正具有破坏性的输入（`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`）返回了 `permissionDecision: "deny"` 及真实解释；良性输入（`ls -la`）返回了 `"allow"`。在判断后端出现任何网络/超时/格式错误响应问题时均 fail-open，因此服务中断永远不会阻止合法的工具调用——与上面 `command` 钩子示例使用各自退出码遵循的相同原则。

### 函数钩子

函数钩子直接调用已注册的 JavaScript/TypeScript 函数。它们由 Skill 系统在内部使用，目前尚未作为公共 API 暴露给最终用户。

**注意**：对于大多数用例，请改用**命令钩子**或 **HTTP 钩子**，它们可以在设置文件中进行配置。

### Prompt 钩子

Prompt 钩子使用 LLM 评估钩子输入并返回决策。这对于基于上下文做出智能决策非常有用，例如决定是否允许或阻止某个操作。

> **数据处理：** Prompt 钩子将其事件输入发送到配置的模型提供商。当启用基于文件的调试日志时，完全展开的 prompt 钩子请求也会写入会话调试日志。请将钩子输入和调试日志视为可能包含敏感信息。

**工作原理：**

1. 钩子输入 JSON 通过 `$ARGUMENTS` 占位符注入到你的 prompt 中
2. prompt 被发送到 LLM（默认使用你当前的模型）
3. LLM 返回包含决策结果的 JSON 响应
4. Qwen Code 处理该决策，并相应地继续或阻止执行

**配置：**

| 字段            | 类型       | 必填 | 描述                                         |
| :-------------- | :--------- | :--- | :------------------------------------------- |
| `type`          | `"prompt"` | 是   | 钩子类型                                     |
| `prompt`        | `string`   | 是   | 发送到 LLM 的 prompt。使用 `$ARGUMENTS` 获取钩子输入 |
| `model`         | `string`   | 否   | 要使用的模型（默认使用你当前的模型）         |
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
| `reason`            | 当 `ok` 为 `false` 时必填。显示给模型以解释阻止原因                 |
| `additionalContext` | 可选。允许操作时注入到对话中的额外上下文                            |

**支持的事件：**

Prompt 钩子可用于大多数钩子事件，包括：

- `PreToolUse` - 评估是否允许工具调用
- `PostToolUse` - 评估工具结果并可能注入上下文
- `Stop` - 决定是继续还是停止
- `SubagentStop` - 评估子代理结果
- `UserPromptSubmit` - 评估或丰富符合条件的模型绑定 prompt

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
        "matcher": "run_shell_command",
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

钩子在 Qwen Code 会话的特定节点触发。不同的事件支持不同的 matcher 来过滤触发条件。

| 事件                 | 触发时机                                | Matcher 目标                                            |
| :------------------- | :-------------------------------------- | :------------------------------------------------------ |
| `PreToolUse`         | 工具执行前                              | 工具 id（`write_file`、`read_file`、`run_shell_command` 等） |
| `PostToolUse`        | 工具成功执行后                          | 工具 id                                                 |
| `PostToolUseFailure` | 工具执行失败后                          | 工具 id                                                 |
| `UserPromptSubmit`   | 受支持的模型调用之前                    | 无                                                      |
| `SessionStart`       | 会话开始或恢复时                        | 来源（`startup`、`resume`、`clear`、`compact`）         |
| `SessionEnd`         | 会话结束时                              | 原因（`clear`、`logout`、`prompt_input_exit` 等）       |
| `SessionDelete`      | 显式选择的会话被删除后                  | 无                                                      |
| `MessageDisplay`     | 回复流式传输时反复触发                  | 无（始终触发）                                          |
| `Stop`               | 当 Qwen 准备结束响应时                  | 无（始终触发）                                          |
| `SubagentStart`      | 子代理启动时                            | 代理类型（`Bash`、`Explorer`、`Plan` 等）               |
| `SubagentStop`       | 子代理停止时                            | 代理类型                                                |
| `PreCompact`         | 对话压缩前                              | 触发器（`manual`、`auto`）                              |
| `Notification`       | 发送通知时                              | 类型（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 显示权限对话框时                        | 工具 id                                                 |
| `PermissionDenied`   | 工具权限被拒绝时                        | 工具 id                                                 |
| `TodoCreated`        | 创建新的 todo 项时                      | 无（始终触发）                                          |
| `TodoCompleted`      | todo 项被标记为已完成时                 | 无（始终触发）                                          |

### 匹配器模式

`matcher` 是一个用于过滤触发条件的正则表达式。

| 事件类型          | 事件                                                                   | 匹配器支持 | 匹配目标                                                 |
| :---------------- | :--------------------------------------------------------------------- | :--------- | :------------------------------------------------------- |
| 工具事件          | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ 正则表达式 | 工具 id：`write_file`、`read_file`、`run_shell_command` 等 |
| 子代理事件        | `SubagentStart`, `SubagentStop`                                        | ✅ 正则表达式 | 代理类型：`Bash`、`Explorer` 等                          |
| 会话事件          | `SessionStart`                                                         | ✅ 正则表达式 | 来源：`startup`、`resume`、`clear`、`compact`            |
| 会话事件          | `SessionEnd`                                                           | ✅ 正则表达式 | 原因：`clear`、`logout`、`prompt_input_exit` 等          |
| 会话事件          | `SessionDelete`                                                        | ❌ 不支持   | N/A                                                      |
| 通知事件          | `Notification`                                                         | ✅ 精确匹配   | 类型：`permission_prompt`、`idle_prompt`、`auth_success` |
| Compact 事件      | `PreCompact`                                                           | ✅ 精确匹配   | 触发方式：`manual`、`auto`                               |
| Todo 事件         | `TodoCreated`, `TodoCompleted`                                         | ❌ 不支持     | N/A                                                      |
| 提示词事件        | `UserPromptSubmit`                                                     | ❌ 不支持     | N/A                                                      |
| 停止事件          | `Stop`                                                                 | ❌ 不支持     | N/A                                                      |
| 消息显示          | `MessageDisplay`                                                       | ❌ 不支持     | N/A                                                      |

**匹配器语法：**

- 空字符串 `""` 或 `"*"` 匹配该类型的所有事件
- 支持标准正则表达式语法（例如，`^run_shell_command$`、`read_.*`、`(write_file|edit)`）
- 工具钩子在 `tool_name` 中接收运行时工具 id（例如 `write_file`）。内置显示名称如 `WriteFile` 和 `ReadFile` 也作为 matcher 别名被接受以兼容，但新配置应优先使用运行时 id。

**示例：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
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

所有 hook 执行器接收标准化的事件输入。传递边界取决于执行器类型：

| Hook 类型  | 输入接收方                                                    |
| :--------- | :------------------------------------------------------------ |
| `command`  | 子进程，通过 `stdin` 上的 JSON                                |
| `http`     | 配置的端点，通过 JSON `POST` 请求体                           |
| `function` | 受信任的进程内回调                                            |
| `prompt`   | 配置的模型提供商，输入替换 `$ARGUMENTS` 后发送               |

函数钩子是在 Qwen 进程中运行的受信任代码。它们接收进程内对象，因此不得将字段视为对函数钩子不可变。

Qwen 不控制钩子进程、端点、回调或模型提供商是否保留或转发其输入。请审查每个配置的执行器的数据处理策略。

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

根据 Hook 类型添加特定于事件的字段。在子代理中运行时，还会额外包含 `agent_id` 和 `agent_type`。

Hook 输入是一个向前可扩展的 JSON 契约：可以向现有事件添加新的可选字段。消费者应忽略未知字段。拒绝未知属性的严格解码器在升级 Qwen Code 之前，必须显式允许每个新的可选字段。对于安全敏感的钩子，解码器失败可能改变 fail-open 或 fail-closed 行为，因此管理员必须在推出前根据已部署的钩子验证升级后的有效载荷。

### Hook 输出结构

Hook 输出通过 stdout（command）或 HTTP 响应体（http）以 JSON 格式返回。

**退出码行为（Command Hooks）：**

| 退出码 | 行为                                                                              |
| :----- | :-------------------------------------------------------------------------------- |
| `0`    | 成功。解析 `stdout` 中的 JSON 以控制行为。                                        |
| `2`    | **阻塞错误**。忽略 `stdout`，将 `stderr` 作为错误反馈传递给模型。                 |
| 其他   | 非阻塞错误。`stderr` 仅在调试模式下显示，继续执行。                               |

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

**用途**：在使用工具之前执行，用于进行权限检查、输入验证或上下文注入。

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
- `hookSpecificOutput.additionalContext`：额外的上下文信息

`permissionDecision` 的值控制工具是否运行：

- `"allow"` — 运行工具，无需通常的批准提示。
- `"deny"` — 阻止工具；工具不会执行，并向模型返回错误。
- `"ask"` — 暂停并在 TUI 中要求用户确认工具调用，然后再运行。确认则运行一次工具；拒绝则取消。在无法提示确认的上下文中（如无头 `--prompt` 运行和后台子代理），`"ask"` 会回退到 `"deny"`。

对于 `"ask"`，TUI 将 `permissionDecisionReason` 作为纯文本显示，而不是解析内联 Markdown。这使格式标记和链接目标对用户保持可见。

**注意**：虽然底层类在技术上支持 `decision` 和 `reason` 等标准 Hook 输出字段，但官方接口期望使用包含 `permissionDecision` 和 `permissionDecisionReason` 的 `hookSpecificOutput`。

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

**用途**：在工具成功完成后执行，用于处理结果、记录结果或注入额外的上下文。

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

**用途**：在受支持的模型调用之前执行，用于验证、阻止或丰富当前的模型绑定 prompt。该事件目前覆盖 `UserQuery`、`ToolResult` 和 `Hook` 发送，而 `Retry`、`Steer`、`Cron`、`Notification` 和 `Teammate` 发送会被跳过。因此它可能在续接路径上发生，`prompt` 不应被假定为原始用户输入。

**事件特定字段**：

```json
{
  "prompt": "current model-bound prompt for this hook invocation",
  "submitted_prompt": "optional user text captured at a supported interactive TUI submission boundary"
}
```

`submitted_prompt` 是可选的。仅当 Qwen 能够从受支持的交互式 TUI 提交将来源信息传递到新的 `UserQuery` 时才存在。对于不受支持的生成方和机器驱动路径（如同城转向、工具结果续接、重试、cron、通知和队友流量），该字段会被省略。ACP、无头模式、`serve`、SDK 和远程输入路径在当前版本中不会生成此字段。

延迟输入在其来源信息完整时可以保留该字段。组合批次仅在每个组成项都具有来源信息时才保留来源信息；经过编辑、部分已知或以其他方式不明确的输入会省略该字段。Prompt、命令和 shell 历史导航或选定的搜索匹配、跨重启的暂存恢复以及对话倒带恢复也会省略该字段，因为这些路径可能在没有原始来源信息的情况下显示模型绑定文本。需要用户提交文本的消费者应将缺失视为不可用，而不是回退到 `prompt`。

在恢复或来源不可用的模型绑定输入被清除或提交后，编辑器也会清除其撤销和重做历史。这可以防止撤销在标记或附带内容被消费后恢复展开的文本。

大段粘贴的占位符在 `submitted_prompt` 中保持紧凑；展开的粘贴内容仅出现在 `prompt` 中。消费者应将此字段视为 TUI 文本投影，而不是剪贴板输入的逐字节记录。

在启用 Vim 模式时存在的任何非空输入都会省略 `submitted_prompt`，包括在禁用 Vim 之后，因为 Vim 寄存器在当前版本中不携带来源信息。此保守规则也涵盖了在启用 Vim 之前输入的草稿。清除编辑器会开始一个新的符合条件的输入。

此字段是来源信息，而非身份验证、租户身份、授权或 DLP。它是调用方提供的数据。为此事件配置的每个执行器都会接收到它；特别是，HTTP 钩子会将其发送到其端点，prompt 钩子会将其发送到其模型提供商。

当两个字段都存在时，prompt 钩子的有效载荷包含重叠的文本，可能会消耗额外的模型输入 token。当前版本中没有按钩子的字段抑制机制。

连续的 UserPromptSubmit 钩子可以将 `additionalContext` 追加到 `prompt`；`submitted_prompt` 继续表示捕获的提交。函数钩子是受信任的同进程代码，不受不可变性保证的约束。

当最终钩子输出包含非空的 `additionalContext` 时，Qwen 首先对该值进行清理，然后将其作为独立的文本部分发送给模型：

```xml
<qwen:user-prompt-submit-context>
sanitized hook context
</qwen:user-prompt-submit-context>
```

该标签告诉模型和会话记录消费者，该部分来自配置的钩子而非用户 prompt。它是一个来源标记，而非身份验证、授权或通用信任边界。

对于带有此附加上下文的 `UserQuery`，会话 JSONL 记录保留模型绑定的各部分（包括带标签的部分），并添加以下 `systemPayload`：

```json
{
  "displayText": "pre-hook display projection",
  "hookContext": "sanitized hook context"
}
```

此双字段载荷仅针对此类用户 prompt 记录写入。`hookContext` 故意重复带标签的部分，以便离线和第三方消费者无需解析模型文本即可识别其来源。`displayText` 是钩子前的显示投影，绝不包含钩子上下文。对于受支持的交互式 TUI 提交，它是由 `submitted_prompt` 携带的原始编辑器投影；ACP、无头模式、`serve`、SDK、远程输入以及没有该来源信息的其他路径则记录展开后的钩子前 prompt。

当 `systemPayload.hookContext` 为字符串时，会话记录显示消费者将 `displayText` 视为此用户 prompt 投影。为了与已发布的仅含 `displayText` 的用户 prompt 记录兼容，在至少一个其他部分之后的最后一个部分中包含完整的带标签上下文可作为等效的配对证据。通知、cron 和轮次中间记录也可能具有 `displayText`，但这些值是紧凑的显示标签，在没有该证据的情况下不得替换其模型绑定文本。
传统的裸上下文记录保留其模型绑定的显示行为，因为无法可靠地分离上下文。对于使用当前带标签形状的无元数据记录，兼容性消费者可以移除相同的完整最终带标签部分；他们不得推断任意类似标签的用户文本是钩子来源。

敏感 prompt 遥测属性（启用时）和托管自动记忆召回均使用钩子前的 prompt。它们不包含 `UserPromptSubmit` 添加的上下文。

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的人类可读解释
- `hookSpecificOutput.additionalContext`：要追加到提示词的额外上下文（可选）

发送到模型时，注入的 `additionalContext` 会作为独立的消息部分追加，并包裹在保留的 `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>` 标签中，因此它在模型历史和会话记录中与用户编写的文本保持可区分。钩子输出中的尖括号在包裹前会被转义，因此钩子内容无法关闭或伪造该标签。会话记录还会单独记录用户的原始提示文本；交互式 TUI 和 ACP/导出记录回放路径显示的是原始文本而非注入的上下文。

**注意**：由于 `UserPromptSubmitOutput` 继承了 `HookOutput`，因此所有标准字段都可用，但只有 `hookSpecificOutput` 中的 `additionalContext` 是专门为此事件定义的。

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

**用途**：在新会话开始时执行，用于执行初始化任务。

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

**用途**：在会话结束时执行，用于执行清理任务。

**事件特定字段**：

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**输出选项**：

- 标准 Hook 输出字段（通常不用于阻塞）

#### SessionDelete

**用途**：在显式选择的会话被永久删除后运行。此事件是 fire-and-forget：输出和失败无法撤销删除操作。

**事件特定字段**：

```json
{
  "deleted_session_id": "the session that was deleted"
}
```

该钩子使用删除运行时的常规会话字段（`session_id`、`transcript_path` 和 `cwd`）；通过 ACP 时，`transcript_path` 为空，因为删除运行时没有自己的记录。`SessionDelete` 当前在交互式 `/delete` 流程和 ACP 的显式 `deleteSession` 方法中触发；守护进程 REST 批量删除和内部清理不会发出此事件。

#### MessageDisplay

**用途**：在助手回复流式传输时反复触发——在 `Stop`（在回合结束时触发一次）之前触发。适用于实时叙述、增量日志记录或任何希望在回复写入过程中（而非完成后）做出反应的消费者。这是一个 **fire-and-forget** 事件——钩子输出和退出码会被忽略。

**事件特定字段**：

```json
{
  "message_id": "stable id for the whole streamed message",
  "displayed_text": "the CUMULATIVE text streamed so far for this message (not a delta)",
  "is_final": "true on the last firing for this message, false otherwise"
}
```

`displayed_text` 是累积的而非增量，因此钩子脚本无需自行重新组装片段——每次触发都携带到目前为止的完整文本。触发采用去抖动（至少每 ~200ms 一次），但最终触发（`is_final: true`）除外，它会在消息结束时始终触发一次，因此回复的尾部不会因等待去抖动窗口而丢失。

**传递语义**——钩子脚本可以依赖的行为：

- **慢速钩子会看到更少、更新的载荷。** 每条消息最多只有一个中间流式钩子执行在进行中；当一个运行时，新的去抖动载荷会_替换_队列中的载荷，而不是在其后面堆积。因此，比去抖动窗口更慢的钩子会跳过中间快照——这是无损的，因为每个载荷都携带完整的累积文本。
- **`is_final` 永远不会排在过时传递之后。** 最终载荷会在消息结束的瞬间被分发——如果仍有中间执行在运行，则与其并行分发（这是唯一一次违反一对一规则的例外，理由相同：最终累积文本严格取代该执行正在处理的内容）。你的钩子总是会收到 `is_final` 载荷，并且在 `Stop` 钩子触发之前收到它。对有状态钩子的一个影响：当最终执行与被取代的中间执行重叠时，它们的_完成_顺序是不确定的——过时的执行可能在最终执行之后完成（甚至在 `Stop` 之后）。将 `is_final` 视为每个 `message_id` 的终止信号，让累积文本获胜，而不是假设最后完成的执行携带最新状态。
- **回合会等待 `is_final` 传递完成——但不会无限等待。** 回合的结束（以及 `Stop` 钩子，如果它触发的话）最多等待 5 秒让最终传递完成。在此预算内完成的钩子保持最强保证：无头运行（`qwen -p ...`）仅在钩子完成后退出，并且 `is_final` 执行在 `Stop` 开始之前完成。较慢的钩子仍然会先收到 `is_final`——只是等待其完成的时间有限：在终端 UI 或 ACP 会话中，执行会在后台继续完成，而无头运行会在不等待的情况下退出。钩子进程不会在退出时被终止；它会被允许自行完成，因此使用 `qwen -p … && next-step` 链接的脚本可能会观察到 `next-step` 在慢速钩子仍在运行时启动。达到此超时时会在 stderr 上打印警告。
- **取消行为取决于时序。** 在 `is_final` 分发_之前_取消的回合不会触发 `is_final`——消息被视为已放弃，缓冲到 `is_final` 的消费者应将取消静默视为其刷新/丢弃信号（例如超时回退）。判断标准是回合结束时中止信号的状态，而不是是否所有片段都已流式传输——在短暂间隙内到达的中止仍然可以抑制实际上已完成接收的消息的 `is_final`。在 `is_final` 已分发_之后_（在排空等待期间）取消则不同：仍在运行的钩子执行可能会被中途终止（SIGTERM），但载荷本身已经被传递。
- **`displayed_text` 在 `is_final` 之前是临时的。** 它反映到目前为止已流式传输的内容；将中间载荷视为显示状态，而非权威的最终内容。
- **使用工具的回合会产生多条消息。** 每次模型调用都有自己的 `message_id` 和自己的 `is_final: true` 触发：工具调用前的文本是一条消息，工具结果后的续接是另一条。不产生显示文本的模型调用（仅工具调用）不会触发任何事件。

**注意**：在终端 UI、无头模式（`-p`）和 ACP（IDE/编辑器/`qwen serve`）会话中触发，每个界面使用相同的载荷契约。

#### Stop

**用途**：在 Qwen 结束其响应之前执行，用于提供最终反馈或总结。

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

`context_usage`、`context_limit` 和 `input_tokens` 字段允许 Hook 脚本观察上下文使用情况并实现自定义的 compact 策略——例如，当使用量超过自定义阈值时，打印运行 `/compact` 的提醒脚本。

**输出选项**：

- `decision`："allow"、"deny"、"block" 或 "ask"
- `reason`：决策的人类可读解释
- `stopReason`：包含在停止响应中的反馈
- `continue`：设置为 false 以停止执行
- `hookSpecificOutput.additionalContext`：额外的上下文信息

**注意**：由于 `StopOutput` 继承了 `HookOutput`，因此所有标准字段都可用，但 `stopReason` 字段与此事件特别相关。

**输出示例**：

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**用途**：当回合因 API 错误或循环检测而结束（而不是 Stop）时执行。这是一个 **fire-and-forget** 事件——Hook 输出和退出码会被忽略。

**事件特定字段**：

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**：匹配 `error` 字段。例如，`"matcher": "rate_limit"` 仅在触发速率限制错误时执行。

**输出选项**：

- **None** - StopFailure 采用 fire-and-forget 模式。所有 hook 输出和退出码均被忽略。

**退出码处理**：

| 退出码 | 行为                  |
| --------- | ------------------------- |
| 任意       | 已忽略（fire-and-forget） |

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
- 身份验证失败日志记录
- 计费错误通知
- 错误统计收集

#### SubagentStart

**用途**：在启动子代理（如 Task 工具）时执行，用于设置上下文或权限。

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

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**用途**：在子代理完成时执行，用于执行收尾任务。

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

**用途**：在对话压缩（compaction）之前执行，用于准备或记录压缩操作。

**事件特定字段**：

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**输出选项**：

- `hookSpecificOutput.additionalContext`：压缩前要包含的上下文
- 标准 hook 输出字段

**输出示例**：

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
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**：匹配 `trigger` 字段。例如，`"matcher": "manual"` 仅在通过 `/compact` 命令进行手动压缩时触发。

**输出选项**：

- `hookSpecificOutput.additionalContext`：附加上下文（仅用于日志记录）
- 标准 hook 输出字段（仅用于日志记录）

**注意**：PostCompact **不在**官方决策模式支持的事件列表中。`decision` 字段和其他控制字段不会产生任何控制效果——它们仅用于日志记录目的。

**退出码处理**：

| 退出码 | 行为                                                  |
| --------- | --------------------------------------------------------- |
| 0         | 成功 - 在详细模式下向用户显示 stdout            |
| 其他     | 非阻塞错误 - 在详细模式下向用户显示 stderr |

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
- 使用统计跟踪
- 上下文变更监控
- 压缩操作的审计日志

#### Notification

**用途**：在发送通知时执行，用于自定义或拦截通知。

**事件特定字段**：

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注意**：`elicitation_dialog` 类型已定义但尚未实现。

**输出选项**：

- `hookSpecificOutput.additionalContext`：要包含的附加信息
- 标准 hook 输出字段

**输出示例**：

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**用途**：在显示权限对话框时执行，用于自动化决策或更新权限。

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

#### TodoCreated

**用途**：在通过 `todo_write` 工具创建新的 todo 项时执行。允许对 todo 创建进行验证、记录日志或阻止。

Todo hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅在此阶段进行验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化之后运行。用于日志记录或同步等副作用；此阶段会忽略 `block` 或 `deny`。

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
- `reason`：决策的人类可读解释（阻止时必填）

**阻止行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，会阻止创建 todo。todo 列表保持不变，并将原因作为反馈提供给模型。

在 `postWrite` 阶段，todo 已被持久化。Hook 仍可返回输出，但 `block` / `deny` 不会撤销写入，也不应用于验证。

**输出示例（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**输出示例（阻止）**：

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Hook 脚本示例**：

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

**用途**：在将 todo 项标记为已完成时执行。允许对 todo 完成进行验证、记录日志或阻止。

Todo hook 分两个阶段运行：

- `validation`：在持久化之前运行。仅在此阶段进行验证；返回 `block` 或 `deny` 可阻止写入。
- `postWrite`：在持久化之后运行。用于日志记录或同步等副作用；此阶段会忽略 `block` 或 `deny`。

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
- `reason`：决策的人类可读解释（阻止时必填）

**阻止行为**：

在 `validation` 阶段，当 `decision` 为 `block` 或 `deny`（退出码 2）时，会阻止完成 todo。todo 项保持其先前状态，并将原因作为反馈提供给模型。

在 `postWrite` 阶段，todo 已被持久化。Hook 仍可返回输出，但 `block` / `deny` 不会撤销写入，也不应用于验证。

**输出示例（允许）**：

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**输出示例（阻止）**：

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Hook 脚本示例**：

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

- **日志记录**：跟踪 todo 的创建和完成情况以进行审计或分析
- **验证**：强制执行内容质量标准（最小长度、必需关键字）
- **工作流控制**：在满足先决条件之前阻止完成
- **集成**：将 todo 与外部任务管理系统（Jira、Trello 等）同步

## Hook 配置

Hook 在 Qwen Code 设置中进行配置，通常位于 `.qwen/settings.json` 或用户配置文件中：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
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

- 默认情况下，hook 并行执行以提升性能
- 在 hook 定义中使用 `sequential: true` 以强制执行顺序执行
- 顺序执行的 hook 可以修改链路中后续 hook 的输入

### 异步 Hook

只有 `command` 类型支持异步执行。设置 `"async": true` 会在后台运行 hook，不会阻塞主流程。

**特性：**

- 无法返回决策控制（操作已发生）
- 结果会在下一轮对话中通过 `systemMessage` 或 `additionalContext` 注入
- 适用于审计、日志记录、后台测试等场景

**示例：**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write_file|edit",
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

一个 `PreToolUse` hook，用于记录日志并可能拦截危险命令：

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

一个 `PostToolUse` HTTP hook，用于将所有工具执行记录发送至远程审计服务：

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

### 示例 3：交互式 TUI 提交 Prompt 验证 Hook

要检查当前模型绑定的内容，请阅读 `prompt`。该字段可能包含生成或展开的内容，不是原始用户输入，也不表示 `UserPromptSubmit` 覆盖每次模型发送。当需要来源信息时，不要从 `submitted_prompt` 静默回退到 `prompt`。

一个 `UserPromptSubmit` hook，用于验证受支持的交互式 TUI 提交中的敏感信息，并为过长的提示词提供上下文。它会跳过来源信息不可用的调用。关键字检查仅为示例，不构成完整的 DLP 策略：

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
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

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
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## 故障排除

- 检查应用日志以获取 hook 执行详情
- 验证 hook 脚本的权限和可执行性
- 确保 hook 输出中的 JSON 格式正确
- 使用特定的 matcher 模式以避免意外的 hook 执行
- 使用 `--debug` 模式查看详细的 hook 匹配和执行信息。Prompt 钩子的输入可能会被写入会话调试日志，因此请应用适当的访问和保留控制。
- 临时禁用所有 hook：在设置中添加 `"disableAllHooks": true`
