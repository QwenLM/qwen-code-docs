# Headless 模式

Headless 模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式 UI。非常适合脚本编写、自动化、CI/CD 流水线以及构建 AI 驱动的工具。

## 概述

Headless 模式为 Qwen Code 提供了无界面接口，具备以下能力：

- 通过命令行参数或 stdin 接收提示词
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道操作
- 支持自动化和脚本工作流
- 提供一致的退出码以便错误处理
- 可恢复当前项目范围内的历史会话，用于多步骤自动化

## 基本用法

### 直接传入提示词

使用 `--prompt`（或 `-p`）标志以 headless 模式运行：

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 输入

从终端将输入通过管道传给 Qwen Code：

```bash
echo "Explain this code" | qwen
```

### 结合文件输入

读取文件内容并使用 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 恢复历史会话（Headless）

在 headless 脚本中复用当前项目的对话上下文：

```bash
# 继续该项目最近的会话并运行新提示词
qwen --continue -p "Run the tests again and summarize failures"

# 直接通过指定会话 ID 恢复（无 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - 会话数据以项目为作用域，以 JSONL 格式存储在 `~/.qwen/projects/<sanitized-cwd>/chats` 目录下。
> - 在发送新提示词之前，会恢复对话历史、工具输出和对话压缩检查点。

## 自定义主会话 Prompt

你可以在单次 CLI 运行中更改主会话的 system prompt，而无需编辑共享的 memory 文件。

### 覆盖内置 System Prompt

使用 `--system-prompt` 替换当前运行中 Qwen Code 内置的主会话 prompt：

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加额外指令

使用 `--append-system-prompt` 保留内置 prompt 并为本次运行追加额外指令：

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

当你需要自定义基础 prompt 并追加特定于本次运行的指令时，可以同时使用两个标志：

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` 仅作用于当前运行的主会话。
> - `QWEN.md` 等已加载的 memory 和上下文文件仍会在 `--system-prompt` 之后追加。
> - `--append-system-prompt` 在内置 prompt 和已加载的 memory 之后生效，可与 `--system-prompt` 同时使用。

## 输出格式

Qwen Code 支持多种输出格式以适应不同使用场景：

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

以 JSON 数组形式返回结构化数据。所有消息会被缓冲，在会话完成后一并输出。该格式非常适合程序化处理和自动化脚本。

JSON 输出是一个消息对象数组，包含多种消息类型：system 消息（会话初始化）、assistant 消息（AI 响应）和 result 消息（执行摘要）。

#### 示例用法

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

Stream-JSON 格式在执行过程中实时逐条发出 JSON 消息，支持实时监控。该格式使用行分隔的 JSON，每条消息是单行完整的 JSON 对象。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

输出（随事件发生实时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

结合 `--include-partial-messages` 使用时，会实时发出额外的流事件（message_start、content_block_delta 等），用于实时 UI 更新。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入读取数据：

- **`text`**（默认）：从 stdin 或命令行参数读取标准文本输入
- **`stream-json`**：通过 stdin 使用 JSON 消息协议进行双向通信

> **注意：** Stream-json 输入模式目前仍在建设中，旨在用于 SDK 集成。使用时需同时设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或通过管道传给其他命令：

```bash
# 保存到文件
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "Add more details" >> docker-explanation.txt

# 通过管道传给其他工具
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON 输出用于实时处理
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

Headless 使用的主要命令行选项：

| 选项                           | 说明                                                       | 示例                                                                     |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`               | 以 headless 模式运行                                       | `qwen -p "query"`                                                        |
| `--output-format`, `-o`        | 指定输出格式（text、json、stream-json）                    | `qwen -p "query" --output-format json`                                   |
| `--input-format`               | 指定输入格式（text、stream-json）                          | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`   | 在 stream-json 输出中包含部分消息                          | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`              | 为本次运行覆盖主会话 system prompt                         | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`       | 为本次运行向主会话 system prompt 追加额外指令              | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`                | 开启调试模式                                               | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`            | 在上下文中包含所有文件                                     | `qwen -p "query" --all-files`                                            |
| `--include-directories`        | 包含额外目录                                               | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`                 | 自动批准所有操作                                           | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`              | 设置审批模式                                               | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                   | 恢复该项目最近的会话                                       | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`         | 恢复指定会话（或交互式选择）                               | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`          | 限制本次运行的用户/模型/工具轮次上限                       | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`              | 墙钟时间预算，接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h` | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`             | 本次运行的工具调用总次数预算                               | `qwen -p "..." --max-tool-calls 50`                                      |

有关所有可用配置选项、设置文件和环境变量的完整说明，请参阅[配置指南](../configuration/settings)。

## 无人值守运行的安全注意事项

Headless / CI 运行结合 `--yolo`（或 `--approval-mode=yolo`）会自动批准所有工具调用，包括 `shell`、`write` 和 `edit`。**`--yolo` 不会启用沙箱** — 这些工具以宿主进程的权限级别运行。当 Qwen Code 检测到此组合且未配置沙箱时，会在启动时向 stderr 打印一行警告。确认了解该权衡后，可通过 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 禁止显示该警告。

### 运行级预算

Qwen Code 可以在无人值守运行超出以下阈值之一时中止。每项默认为 `-1`（无限制）；设置任意一项即可约束失控行为。这些预算通过与 SIGINT 共享的 `AbortController` 协作执行，因此预算中止会发出结构化的 `FatalBudgetExceededError`（退出码 **55**）— 与轮次上限的退出码 53 和 SIGINT 的 130 相区别，便于 CI 脚本按原因进行分支处理。

| 标志                  | 配置键                     | 约束内容                                                                                                                                                                                                       |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | 整个运行的墙钟时长。标志接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h`（支持小数单位）。最小值为 1s — 亚秒值将被视为输入错误而拒绝。配置项单位为秒。                                                              |
| `--max-tool-calls`    | `model.maxToolCalls`       | 主运行循环调度的顶层工具调用累计次数（成功和失败均计入 — 模型在出错时仍会消耗 token）。子智能体 / structured-output 豁免情况见下方"作用域"说明。                                                               |
| `--max-session-turns` | `model.maxSessionTurns`    | 用户/模型/工具轮次数；已有功能。超出时以退出码 53 退出（与预算退出码 55 不同）。                                                                                                                               |

#### 作用域

- **`--max-tool-calls` 仅统计顶层调度次数。** 当模型调用 `agent` 工具时，该调度计为 **1**；由生成的子智能体执行的内部工具调用**不计入**。通过子智能体分配任务的模型可在较小的顶层预算下执行无限量的内部操作。如需更严格的限制，请结合 `--exclude-tools agent` 使用。
- **`structured_output` 不计入 `--max-tool-calls`。** 在使用 `--json-schema` 时，模型最终的 `structured_output` 调用是"完成"契约，而非实际工作 — 不计入 `--max-tool-calls`，避免在预算边缘完成时被误中止。该豁免无条件适用（包括 Ajv 验证失败），因此陷入格式错误输出重试循环的模型**不受** `--max-tool-calls` 约束；请结合 `--max-session-turns` 或 `--max-wall-time` 来限制重试次数。
- **`structured_output` 不豁免于 `--max-session-turns`。** 该计数器是已有功能，每轮（包括最终契约轮）均递增。如果需要在 `--json-schema` 下允许 N 轮实际工作，请将 `--max-session-turns` 设置为 `N+1`。
- **单次运行与 `--input-format stream-json`：** 在 stream-json 输入模式下，守护进程会在每条用户消息开始时重置预算计数器；预算是按消息计算的，而非按进程计算。
- **`qwen serve` / ACP 会话：** 守护进程 ACP 会话路径目前**不**读取 settings.json 中的 `--max-wall-time` / `--max-tool-calls`。这些预算仅适用于单次 `qwen -p` 运行和 `--input-format stream-json` 会话。（如果 settings 中设置了 `tools.approvalMode: 'yolo'`，`qwen serve` 在启动时会发出 YOLO 无沙箱警告。）

### 推荐组合

- **可信的隔离环境（临时 CI runner、容器）：** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。设置轮次预算和墙钟预算，防止卡住的智能体耗尽 CI 时间，并通过 `--output-format json` 捕获运行后的 token 用量/工具调用审计信息。
- **本地机器或共享基础设施：** 同时传入 `--sandbox`（或设置 `QWEN_SANDBOX=1`），使 shell / write / edit 工具在沙箱镜像内运行。
- **有重试需求的长时间 CI：** 结合 `QWEN_CODE_UNATTENDED_RETRY=1` 与 `--max-wall-time` 使用。retry 环境变量可使运行在遭遇短暂 429 / 529 响应时保持存活；墙钟预算确保持续失败的服务商不会无限延长作业时间。
- **有限制的审计/探索：** 对于只读任务，`--max-tool-calls 25` 可限制模型执行 grep / read 的激进程度。结合 `--exclude-tools shell,write,edit` 使限制更有实质意义。

## 示例

### 代码审查

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### 生成 commit 消息

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

### 模型与工具使用量追踪

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

当 Qwen Code 在 CI/CD 流水线或后台守护进程中运行时，短暂的 API 中断（限流或过载）不应终止一个耗时数小时的任务。**持久重试模式**使 Qwen Code 对瞬时 API 错误无限重试，直到服务恢复。

### 工作原理

- **仅针对瞬时错误**：HTTP 429（Rate Limit）和 529（Overloaded）会无限重试。其他错误（400、500 等）仍正常失败。
- **带上限的指数退避**：重试间隔指数增长，但每次重试最长不超过 **5 分钟**。
- **心跳保活**：长时间等待期间，每隔 **30 秒**向 stderr 打印一行状态信息，防止 CI runner 因无活动而终止进程。
- **优雅降级**：非瞬时错误和交互模式完全不受影响。

### 启用方式

将环境变量 `QWEN_CODE_UNATTENDED_RETRY` 设置为 `true` 或 `1`（严格匹配，区分大小写）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 持久重试需要**显式开启**。单独设置 `CI=true` **不会**激活该功能 — 默默地将一个快速失败的 CI 任务变为无限等待任务是危险的。请在流水线配置中显式设置 `QWEN_CODE_UNATTENDED_RETRY`。

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

持久重试期间，心跳消息会打印到 **stderr**：

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

这些消息可保持 CI runner 存活并让你监控进度。它们不会出现在 stdout 中，因此通过管道传给其他工具的 JSON 输出仍保持干净。

## 相关资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [认证](../configuration/auth.md) - 配置认证
- [命令](../features/commands) - 交互式命令参考
- [教程](../quickstart) - 分步自动化指南
