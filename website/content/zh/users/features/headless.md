---
description: "使用 Qwen Code Headless 模式运行非交互式 AI 编程任务，适合 CI/CD、脚本自动化、批量分析和无人值守代码处理。"
---

# 无头模式

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式 UI。这非常适合脚本编写、自动化、CI/CD 流水线以及构建 AI 驱动的工具。

## 概述

无头模式为 Qwen Code 提供了一个无头接口，支持：

- 通过命令行参数或 stdin 接收 prompt
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道
- 支持自动化和脚本工作流
- 提供一致的退出码以便进行错误处理
- 可恢复当前项目范围内的历史 session，以支持多步骤自动化

## 基本用法

### 直接 Prompt

使用 `--prompt`（或 `-p`）标志以无头模式运行：

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 输入

从终端将输入管道传输给 Qwen Code：

```bash
echo "Explain this code" | qwen
```

### 结合文件输入

从文件读取内容并由 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 恢复历史 Session（无头模式）

在无头脚本中复用当前项目的对话上下文：

```bash
# 继续当前项目的最近一次 session 并运行新 prompt
qwen --continue -p "Run the tests again and summarize failures"

# 直接恢复指定 session ID（无 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Session 数据为项目作用域下的 JSONL 文件，位于 `~/.qwen/projects/<sanitized-cwd>/chats`。
> - 在发送新 prompt 前，会恢复对话历史、工具输出和对话压缩检查点。

## 自定义主 Session Prompt

你可以在单次 CLI 运行中更改主 session 的 system prompt，而无需编辑共享 memory 文件。

### 覆盖内置 System Prompt

使用 `--system-prompt` 替换当前运行中 Qwen Code 内置的主 session prompt：

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加额外指令

使用 `--append-system-prompt` 保留内置 prompt 并为本次运行添加额外指令：

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

当你需要自定义基础 prompt 并附加特定于本次运行的指令时，可以同时使用这两个标志：

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` 仅对当前运行的主 session 生效。
> - 加载的 memory 和上下文文件（如 `QWEN.md`）仍会追加在 `--system-prompt` 之后。
> - `--append-system-prompt` 会在内置 prompt 和加载的 memory 之后应用，且可与 `--system-prompt` 配合使用。

## 输出格式

Qwen Code 支持多种输出格式以适应不同场景：

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

以 JSON 数组形式返回结构化数据。所有消息会被缓冲，并在 session 结束时统一输出。该格式非常适合程序化处理和自动化脚本。

JSON 输出是一个消息对象数组。输出包含多种消息类型：system 消息（session 初始化）、assistant 消息（AI 响应）和 result 消息（执行摘要）。

#### 使用示例

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

Stream-JSON 格式会在执行过程中实时逐条输出 JSON 消息，便于实时监控。该格式使用换行符分隔的 JSON，每条消息均为单行上的完整 JSON 对象。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

输出（随事件发生实时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

结合 `--include-partial-messages` 使用时，会实时发出额外的流事件（如 `message_start`、`content_block_delta` 等），用于实时更新 UI。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入读取数据：

- **`text`**（默认）：来自 stdin 或命令行参数的标准文本输入
- **`stream-json`**：通过 stdin 的 JSON 消息协议，用于双向通信

> **注意：** Stream-json 输入模式目前仍在开发中，主要用于 SDK 集成。使用时必须设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或管道传输给其他命令：

```bash
# 保存到文件
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "Add more details" >> docker-explanation.txt

# 管道传输给其他工具
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON 输出用于实时处理
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

无头模式使用的关键命令行选项：

| 选项 | 说明 | 示例 |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p` | 以无头模式运行 | `qwen -p "query"` |
| `--output-format`, `-o` | 指定输出格式（text、json、stream-json） | `qwen -p "query" --output-format json` |
| `--input-format` | 指定输入格式（text、stream-json） | `qwen --input-format text --output-format stream-json` |
| `--include-partial-messages` | 在 stream-json 输出中包含部分消息 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt` | 覆盖本次运行的主 session system prompt | `qwen -p "query" --system-prompt "You are a terse reviewer."` |
| `--append-system-prompt` | 为本次运行的主 session system prompt 追加额外指令 | `qwen -p "query" --append-system-prompt "Focus on concrete findings."` |
| `--debug`, `-d` | 启用调试模式 | `qwen -p "query" --debug` |
| `--all-files`, `-a` | 将所有文件包含在上下文中 | `qwen -p "query" --all-files` |
| `--include-directories` | 包含额外目录 | `qwen -p "query" --include-directories src,docs` |
| `--yolo`, `-y` | 自动批准所有操作 | `qwen -p "query" --yolo` |
| `--approval-mode` | 设置批准模式 | `qwen -p "query" --approval-mode auto_edit` |
| `--continue` | 恢复当前项目的最近一次 session | `qwen --continue -p "Pick up where we left off"` |
| `--resume [sessionId]` | 恢复指定 session（或交互式选择） | `qwen --resume 123e... -p "Finish the refactor"` |

有关所有可用配置选项、设置文件和环境变量的完整详情，请参阅 [配置指南](../configuration/settings)。

## 示例

### 代码审查

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### 生成提交信息

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
    echo "正在分析 $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "已完成 $(basename "$file") 的分析" >> reports/progress.log
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

### 模型与工具使用追踪

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

当 Qwen Code 在 CI/CD 流水线或作为后台守护进程运行时，短暂的 API 中断（限流或过载）不应导致耗时数小时的任务失败。**持久重试模式**会让 Qwen Code 无限重试瞬态 API 错误，直到服务恢复。

### 工作原理

- **仅针对瞬态错误**：HTTP 429（限流）和 529（过载）会被无限重试。其他错误（400、500 等）仍会正常失败。
- **带上限的指数退避**：重试延迟呈指数增长，但每次重试上限为 **5 分钟**。
- **心跳保活**：在长时间等待期间，每 **30 秒**会向 stderr 打印一行状态信息，防止 CI runner 因进程无活动而将其终止。
- **优雅降级**：非瞬态错误和交互模式完全不受影响。

### 激活方式

将 `QWEN_CODE_UNATTENDED_RETRY` 环境变量设置为 `true` 或 `1`（严格匹配，区分大小写）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 持久重试需要**显式开启**。仅设置 `CI=true` **不会**激活该功能——静默地将快速失败的 CI 任务变为无限等待的任务是危险的。请务必在流水线配置中显式设置 `QWEN_CODE_UNATTENDED_RETRY`。

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

#### 夜间批量处理

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

这些消息可保持 CI runner 活跃并让你监控进度。它们不会出现在 stdout 中，因此管道传输给其他工具的 JSON 输出保持干净。

## 相关资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [身份验证](../configuration/settings#environment-variables-for-api-access) - 设置身份验证
- [命令](../features/commands) - 交互式命令参考
- [教程](../quickstart) - 分步自动化指南