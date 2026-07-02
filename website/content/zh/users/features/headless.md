# 无头模式

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，而无需任何交互式 UI。这非常适合脚本编写、自动化、CI/CD 流水线以及构建 AI 驱动的工具。

## 概述

无头模式为 Qwen Code 提供了一个无头接口，该接口：

- 通过命令行参数或标准输入接收 prompt
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道
- 支持自动化和脚本工作流
- 提供一致的退出代码以进行错误处理
- 可以恢复限定在当前项目范围内的先前会话，以实现多步自动化

## 基本用法

### 直接 Prompt

使用 `--prompt`（或 `-p`）标志在无头模式下运行：

```bash
qwen --prompt "What is machine learning?"
```

### 标准输入

从终端将输入管道传递给 Qwen Code：

```bash
echo "Explain this code" | qwen
```

### 结合文件输入

从文件读取并使用 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 恢复先前会话（无头模式）

在无头脚本中重用当前项目的对话上下文：

```bash
# 继续此项目的最近会话并运行新的 prompt
qwen --continue -p "Run the tests again and summarize failures"

# 直接恢复特定的会话 ID（无 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - 会话数据是位于 `~/.qwen/projects/<sanitized-cwd>/chats` 下的项目范围 JSONL。
> - 在发送新 prompt 之前，恢复对话历史、工具输出和聊天压缩检查点。

## 自定义主会话 Prompt

你可以在不编辑共享内存文件的情况下，为单次 CLI 运行更改主会话 system prompt。

### 覆盖内置 System Prompt

使用 `--system-prompt` 替换当前运行中 Qwen Code 内置的主会话 prompt：

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加额外指令

使用 `--append-system-prompt` 保留内置 prompt 并为本次运行添加额外指令：

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

当你需要自定义基础 prompt 加上特定于运行的额外指令时，可以组合使用这两个标志：

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` 仅应用于当前运行的主会话。
> - 加载的内存和上下文文件（如 `QWEN.md`）仍会追加在 `--system-prompt` 之后。
> - `--append-system-prompt` 在内置 prompt 和加载的内存之后应用，并且可以与 `--system-prompt` 一起使用。

## 输出格式

Qwen Code 支持多种输出格式，适用于不同的用例：

### 文本输出（默认）

标准的人类可读输出：

```bash
qwen -p "What is the capital of France?"
```

响应格式：

```
The capital of France is Paris.
```

### JSON 输出

以 JSON 数组形式返回结构化数据。所有消息都会被缓冲，并在会话完成时一起输出。此格式非常适合程序化处理和自动化脚本。

JSON 输出是一个消息对象数组。输出包含多种消息类型：系统消息（会话初始化）、助手消息（AI 响应）和结果消息（执行摘要）。

#### 用法示例

```bash
qwen -p "What is the capital of France?" --output-format json
```

输出（执行结束时）：

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON 输出

Stream-JSON 格式在执行期间立即发出 JSON 消息，从而实现实时监控。此格式使用行分隔 JSON，其中每条消息都是单行上的完整 JSON 对象。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

输出（随事件发生流式传输）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

与 `--include-partial-messages` 结合使用时，会实时发出额外的流事件（message_start、content_block_delta 等），用于实时更新 UI。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入读取输入：

- **`text`**（默认）：来自 stdin 或命令行参数的标准文本输入
- **`stream-json`**：通过 stdin 的 JSON 消息协议，用于双向通信

> **注意：** Stream-json 输入模式目前正在构建中，旨在用于 SDK 集成。它需要设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或管道传递给其他命令：

```bash
# 保存到文件
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "Add more details" >> docker-explanation.txt

# 管道传递给其他工具
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# 用于实时处理的 Stream-JSON 输出
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

无头使用的关键命令行选项：

| 选项                         | 描述                                                                                                                                                                                                                                                                                                                                                                                                                    | 示例                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | 在无头模式下运行                                                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 指定输出格式（text、json、stream-json）                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 指定输入格式（text、stream-json）                                                                                                                                                                                                                                                                                                                                                                                       | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | 在 stream-json 输出中包含部分消息                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | 覆盖本次运行的主会话 system prompt                                                                                                                                                                                                                                                                                                                                                                                      | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | 为本次运行向主会话 system prompt 追加额外指令                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | 启用调试模式                                                                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | 禁用所有自定义项——上下文文件、hooks、扩展、skills、MCP 服务器、自定义子代理（仅加载内置子代理）、权限规则、源自设置的审批模式覆盖、内存功能和沙箱设置——以隔离问题；CLI 标志 `--yolo` 和 `--approval-mode` 仍然生效。请参阅[故障排除](../support/troubleshooting)。也可通过 `QWEN_CODE_SAFE_MODE=true` 进行设置。 | `qwen -p "query" --safe-mode`                                            |
| `--all-files`, `-a`          | 在上下文中包含所有文件                                                                                                                                                                                                                                                                                                                                                                                                  | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | 包含额外的目录                                                                                                                                                                                                                                                                                                                                                                                                          | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | 自动批准所有操作                                                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 设置审批模式                                                                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | 恢复此项目的最近会话                                                                                                                                                                                                                                                                                                                                                                                                    | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 恢复特定会话（或交互式选择）                                                                                                                                                                                                                                                                                                                                                                                            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | 限制运行中 user/model/tool 轮次的数量                                                                                                                                                                                                                                                                                                                                                                                   | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | 实际时间预算；接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h`                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | 运行的累计工具调用预算                                                                                                                                                                                                                                                                                                                                                                                                  | `qwen -p "..." --max-tool-calls 50`                                      |

有关所有可用配置选项、设置文件和环境变量的完整详细信息，请参阅[配置指南](../configuration/settings)。

## 无人值守运行中的安全性

结合 `--yolo`（或 `--approval-mode=yolo`）的无头/CI 运行会自动批准每个工具调用，包括 `shell`、`write` 和 `edit`。**`--yolo` 不会启用沙箱**——这些工具在宿主进程的权限级别下运行。当 Qwen Code 检测到这种组合且未配置沙箱时，它会在启动时向 stderr 打印一行警告。在权衡利弊后，可以使用 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 抑制该警告。

### 运行级预算

当超过以下阈值之一时，Qwen Code 可以中止无人值守的运行。每个阈值默认均为 `-1`（无限制）；设置其中任何一个都足以限制失控行为。它们协同针对已携带 SIGINT 的同一个 `AbortController` 强制执行，因此预算中止会发出结构化的 `FatalBudgetExceededError`（退出代码 **55**）——这与轮次上限退出代码 53 和 SIGINT 的 130 不同，以便 CI 脚本可以根据原因进行分支处理。

| 标志                  | 设置键                     | 限制内容                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | 整个运行的实际时间持续时间。标志接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h`（支持小数单位）。最小值为 1 秒——小于 1 秒的值将被视为拼写错误而拒绝。设置单位为秒。               |
| `--max-tool-calls`    | `model.maxToolCalls`       | 主运行循环调度的累计顶级工具调用（计算成功_和_失败——模型在出错时仍会消耗 token）。有关子代理/结构化输出豁免，请参阅下面的“范围”。 |
| `--max-session-turns` | `model.maxSessionTurns`    | user/model/tool 轮次的数量；预先存在。超限时以代码 53 退出（与预算退出 55 不同）。                                                                                                  |

#### 范围

- **`--max-tool-calls` 仅计算顶级调度。** 当模型调用 `agent` 工具时，该调度计为 **1**；生成的子代理执行的内部工具调用**不**计算在内。将工作通过子代理漏斗化的模型可以在较小的顶级预算下进行无界的内部工作。如果需要更严格的上限，请结合使用 `--exclude-tools agent`。
- **`structured_output` 豁免于 `--max-tool-calls`。** 在 `--json-schema` 下，模型的终端 `structured_output` 调用是“我已完成”契约，而不是实际工作——它不计入 `--max-tool-calls`，因此预算边缘的完成不会被作为误报而中止。该豁免是无条件的（包括失败的 Ajv 验证），因此陷入格式错误输出重试循环的模型**不**受 `--max-tool-calls` 限制；请结合 `--max-session-turns` 或 `--max-wall-time` 来限制重试次数。
- **`structured_output` 不豁免于 `--max-session-turns`。** 该计数器是预先存在的，并且会在每次轮次（包括终端契约）时增加。如果要在 `--json-schema` 下允许 `N` 次实际工作轮次，请将 `--max-session-turns` 设置为 `N+1`。
- **单次运行与 `--input-format stream-json`：** 在 stream-json 输入模式下，守护进程会在每条用户消息开始时重置预算计数器；预算是按消息计算的，而不是按进程计算的。
- **`qwen serve` / ACP 会话：** 守护进程 ACP 会话路径目前**不**查询 settings.json 中的 `--max-wall-time` / `--max-tool-calls`。这些预算仅适用于单次 `qwen -p` 运行和 `--input-format stream-json` 会话。（如果在设置中设置了 `tools.approvalMode: 'yolo'`，`qwen serve` 确实会在启动时发出 YOLO-no-sandbox 警告。）
### 推荐组合

- **受信任的隔离环境（临时 CI runner、容器）：** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。设定轮次预算和挂钟时间预算，防止卡住的 agent 耗尽你的 CI 分钟数，并捕获 `--output-format json` 用于运行后分析 / 工具调用审计。
- **本地机器或共享基础设施：** 同时传递 `--sandbox`（或设置 `QWEN_SANDBOX=1`），使 shell / write / edit 工具在沙箱镜像内运行。
- **带有限流重试的长时间运行 CI：** 将 `QWEN_CODE_UNATTENDED_RETRY=1` 与 `--max-wall-time` 结合使用。重试环境变量可使运行在遇到短暂的 429 / 529 响应时保持存活；挂钟时间预算则确保持续失败的 provider 无法无限期延长任务。
- **有界审计 / 探索：** 对于只读任务，`--max-tool-calls 25` 限制了模型 grep / read 的激进程度。结合 `--exclude-tools shell,write,edit` 可使该限制更具实际意义。

## 示例

### 代码审查

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### 生成 commit message

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API 文档

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### 批量代码分析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR 代码审查

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### 日志分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### 生成发布说明

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### 模型和工具使用追踪

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## 持久重试模式

当 Qwen Code 在 CI/CD 管道中运行或作为后台守护进程运行时，短暂的 API 故障（限流或过载）不应导致长达数小时的任务中断。**持久重试模式**使 Qwen Code 能够无限期重试瞬态 API 错误，直到服务恢复。

### 工作原理

- **仅限瞬态错误**：HTTP 429（限流）和 529（过载）会被无限期重试。其他错误（400、500 等）仍会正常失败。
- **带上限的指数退避**：重试延迟呈指数级增长，但每次重试的上限为 **5 分钟**。
- **心跳保活**：在长时间等待期间，每 **30 秒**向 stderr 打印一次状态行，防止 CI runner 因不活动而终止进程。
- **优雅降级**：非瞬态错误和交互模式完全不受影响。

### 激活方式

将 `QWEN_CODE_UNATTENDED_RETRY` 环境变量设置为 `true` 或 `1`（严格匹配，区分大小写）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 持久重试需要**显式开启**。仅设置 `CI=true` **不会**激活它——默默地将快速失败的 CI 任务变成无限等待的任务是非常危险的。请务必在管道配置中显式设置 `QWEN_CODE_UNATTENDED_RETRY`。

### 示例

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### 夜间批处理

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### 后台守护进程

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### 监控

在持久重试期间，心跳消息会打印到 **stderr**：

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

这些消息可使 CI runner 保持存活，并让你监控进度。它们不会出现在 stdout 中，因此通过管道传递给其他工具的 JSON 输出保持干净。

## 资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [身份验证](../configuration/auth.md) - 设置身份验证
- [命令](../features/commands) - 交互式命令参考
- [教程](../quickstart) - 逐步自动化指南