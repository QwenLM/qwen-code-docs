# 无头模式

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式 UI。这对于脚本编写、自动化、CI/CD 流水线和构建 AI 驱动的工具非常理想。

## 概述

无头模式为 Qwen Code 提供了一个无头接口，可以：

- 通过命令行参数或 stdin 接收提示
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道
- 启用自动化和脚本工作流
- 提供一致的退出码以进行错误处理
- 可以恢复当前项目范围内的先前会话，用于多步骤自动化

## 基本用法

### 直接提示

使用 `--prompt`（或 `-p`）标志在无头模式下运行：

```bash
qwen --prompt "什么是机器学习？"
```

### Stdin 输入

从终端将输入管道到 Qwen Code：

```bash
echo "解释这段代码" | qwen
```

### 与文件输入结合

从文件读取并用 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 恢复之前的会话（无头模式）

在无头脚本中重用当前项目的对话上下文：

```bash

# 继续此项目的最新会话并运行新提示
qwen --continue -p "Run the tests again and summarize failures"

# 直接恢复特定会话 ID（无 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - 会话数据是项目范围的 JSONL，位于 `~/.qwen/projects/<sanitized-cwd>/chats`。
> - 在发送新提示之前恢复对话历史、工具输出和聊天压缩检查点。

## 输出格式

Qwen Code 支持多种输出格式以适应不同用例：

### 文本输出（默认）

标准的可读输出：

```bash
qwen -p "法国的首都是什么？"
```

响应格式：

```
法国的首都是巴黎。
```

### JSON 输出

以 JSON 数组形式返回结构化数据。所有消息都会被缓冲，并在会话完成时一起输出。这种格式非常适合程序化处理和自动化脚本。

JSON 输出是一个消息对象数组。输出包含多种消息类型：系统消息（会话初始化）、助手消息（AI 响应）和结果消息（执行摘要）。

#### 示例用法

```bash
qwen -p "法国的首都是什么？" --output-format json
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
          "text": "法国的首都是巴黎。"
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
    "result": "法国的首都是巴黎。",
    "usage": {...}
  }
]
```

### Stream-JSON 输出

Stream-JSON 格式在执行过程中立即输出 JSON 消息，实现实时监控。此格式使用换行符分隔的 JSON，其中每条消息都是单行上的完整 JSON 对象。

```bash
qwen -p "解释 TypeScript" --output-format stream-json
```

输出（事件发生时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

与 `--include-partial-messages` 结合使用时，会实时输出额外的流事件（message_start、content_block_delta 等）以实现实时 UI 更新。

```bash
qwen -p "编写 Python 脚本" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入消费输入：

- **`text`** (默认): 来自 stdin 或命令行参数的标准文本输入
- **`stream-json`**: 通过 stdin 的 JSON 消息协议，用于双向通信

> **注意:** Stream-json 输入模式目前正在开发中，用于 SDK 集成。它需要设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或管道到其他命令：

```bash

# 保存到文件
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "Add more details" >> docker-explanation.txt

# 管道到其他工具
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

# 用于实时处理的流式 JSON 输出
qwen -p "解释 Docker" --output-format stream-json | jq '.type'
qwen -p "编写代码" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

用于无头模式使用的关键命令行选项：

| 选项                         | 描述                                                    | 示例                                                                     |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | 以无头模式运行                                          | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 指定输出格式 (text, json, stream-json)                  | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 指定输入格式 (text, stream-json)                        | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | 在 stream-json 输出中包含部分消息                       | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | 启用调试模式                                            | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | 在上下文中包含所有文件                                  | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | 包含额外目录                                            | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | 自动批准所有操作                                        | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 设置批准模式                                            | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | 恢复此项目的最近会话                                    | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 恢复特定会话（或交互式选择）                            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--experimental-skills`      | 启用实验性 Skills（注册 `skill` 工具）                  | `qwen --experimental-skills -p "What Skills are available?"`             |

有关所有可用配置选项、设置文件和环境变量的完整详细信息，请参阅[配置指南](../configuration/settings)。

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

### 发布说明生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### 模型和工具使用情况跟踪

```bash
result=$(qwen -p "解释这个数据库模式" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## 资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [认证](../configuration/settings#environment-variables-for-api-access) - 设置认证
- [命令](../features/commands) - 交互式命令参考
- [教程](../quickstart) - 逐步自动化指南