# 无头模式

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，而无需任何交互式用户界面。这非常适合用于脚本编写、自动化、CI/CD 流水线以及构建由 AI 驱动的工具。

## 概述

无头模式为 Qwen Code 提供了一个无头接口，该接口：

- 通过命令行参数或标准输入接受提示
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道操作
- 启用自动化和脚本工作流
- 提供一致的退出代码以便进行错误处理
- 可以恢复当前项目范围内的先前会话，以实现多步骤自动化

## 基本用法

### 直接提示

使用 `--prompt`（或 `-p`）标志以无头模式运行：

```bash
qwen --prompt "什么是机器学习？"
```

### 标准输入

从终端将输入通过管道传递给 Qwen Code：

```bash
echo "解释这段代码" | qwen
```

### 结合文件输入使用

从文件中读取内容并使用 Qwen Code 进行处理：

```bash
cat README.md | qwen --prompt "总结此文档"
```

### 恢复之前的会话（无头模式）

在无头脚本中复用当前项目中的对话上下文：

```bash

# 继续该项目的最近一次会话并运行新提示
qwen --continue -p "再次运行测试并总结失败原因"

# 直接恢复特定会话 ID（无界面）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "应用后续重构"
```

> [!note]
>
> - 会话数据是以项目为范围的 JSONL 文件，存储于 `~/.qwen/projects/<sanitized-cwd>/chats`。
> - 在发送新提示之前，将恢复对话历史、工具输出和聊天压缩检查点。

## 输出格式

Qwen Code 支持多种输出格式以适应不同使用场景：

### 文本输出（默认）

标准的人类可读输出：

```bash
qwen -p "法国的首都是哪里？"
```

响应格式：

```
法国的首都是巴黎。
```

### JSON 输出

以 JSON 数组形式返回结构化数据。所有消息都会被缓存，并在会话完成时一起输出。此格式适用于程序化处理和自动化脚本。

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

Stream-JSON 格式会在执行过程中一旦产生 JSON 消息就立即输出，从而实现实时监控。该格式使用行分隔的 JSON，其中每条消息都是单行上的完整 JSON 对象。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

输出（事件发生时流式传输）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

当与 `--include-partial-messages` 结合使用时，会实时发出额外的流事件（如 message_start、content_block_delta 等），以支持实时 UI 更新。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入读取输入：

- **`text`**（默认）：从 stdin 或命令行参数读取标准文本输入
- **`stream-json`**：通过 stdin 使用 JSON 消息协议进行双向通信

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
qwen -p "List programming languages" | grep -i "python"```

# 用于实时处理的 Stream-JSON 输出
qwen -p "解释 Docker" --output-format stream-json | jq '.type'
qwen -p "编写代码" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

无头模式（headless）使用的关键命令行选项：

| 选项                          | 描述                                               | 示例                                                                      |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `--prompt`, `-p`              | 以无头模式运行                                     | `qwen -p "query"`                                                         |
| `--output-format`, `-o`       | 指定输出格式（text、json、stream-json）            | `qwen -p "query" --output-format json`                                    |
| `--input-format`              | 指定输入格式（text、stream-json）                  | `qwen --input-format text --output-format stream-json`                    |
| `--include-partial-messages`  | 在 stream-json 输出中包含部分消息                  | `qwen -p "query" --output-format stream-json --include-partial-messages`  |
| `--debug`, `-d`               | 启用调试模式                                       | `qwen -p "query" --debug`                                                 |
| `--all-files`, `-a`           | 包含上下文中的所有文件                             | `qwen -p "query" --all-files`                                             |
| `--include-directories`       | 包含额外的目录                                     | `qwen -p "query" --include-directories src,docs`                          |
| `--yolo`, `-y`                | 自动批准所有操作                                   | `qwen -p "query" --yolo`                                                  |
| `--approval-mode`             | 设置审批模式                                       | `qwen -p "query" --approval-mode auto_edit`                               |
| `--continue`                  | 恢复该项目最近一次会话                             | `qwen --continue -p "Pick up where we left off"`                          |
| `--resume [sessionId]`        | 恢复指定会话（或交互式选择）                       | `qwen --resume 123e... -p "Finish the refactor"`                          |

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
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "无" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "无" else . end')
echo "$(date): 使用了 $total_tokens 个 token，$tool_calls 次工具调用（使用的工具：$tools_used），涉及模型：$models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "最近的使用趋势："
tail -5 usage.log
```

## 资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [认证](../configuration/settings#environment-variables-for-api-access) - 设置认证
- [命令](../features/commands) - 交互式命令参考
- [教程](../quickstart) - 逐步自动化指南