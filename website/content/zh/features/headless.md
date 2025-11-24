# 无头模式（Headless Mode）

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式 UI。这非常适合用于脚本编写、自动化任务、CI/CD 流水线以及构建 AI 驱动的工具。

- [无头模式（Headless Mode）](#无头模式headless-mode)
  - [概述](#概述)
  - [基本用法](#基本用法)
    - [直接提示词](#直接提示词)
    - [标准输入（Stdin）输入](#标准输入stdin输入)
    - [结合文件输入使用](#结合文件输入使用)
  - [输出格式](#输出格式)
    - [文本输出（默认）](#文本输出默认)
    - [JSON 输出](#json-输出)
      - [示例用法](#示例用法)
    - [流式 JSON 输出（Stream-JSON）](#流式-json-输出stream-json)
    - [输入格式](#输入格式)
    - [文件重定向](#文件重定向)
  - [配置选项](#配置选项)
  - [示例](#示例)
    - [代码审查](#代码审查)
    - [生成提交信息](#生成提交信息)
    - [API 文档生成](#api-文档生成)
    - [批量代码分析](#批量代码分析)
    - [PR 代码审查](#pr-代码审查)
    - [日志分析](#日志分析)
    - [发布说明生成](#发布说明生成)
    - [模型与工具使用追踪](#模型与工具使用追踪)
  - [资源](#资源)

## 概述

headless 模式为 Qwen Code 提供了一个无头接口，具备以下特性：

- 通过命令行参数或 stdin 接收 prompt
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道操作
- 支持自动化和脚本化工作流
- 提供一致的退出码用于错误处理

## 基本用法

### 直接输入 Prompt

使用 `--prompt`（或 `-p`）标志以 headless 模式运行：

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 输入

从终端将输入通过管道传递给 Qwen Code：

```bash
echo "Explain this code" | qwen
```

### 结合文件输入

从文件读取内容并由 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

## 输出格式

Qwen Code 支持多种输出格式，适用于不同场景：

### 文本输出（默认）

标准的人类可读输出：

```bash
qwen -p "What is the capital of France?"
```

响应格式：

```
The capital of France is Paris.
```

### JSON Output

以 JSON 数组的形式返回结构化数据。所有消息都会被缓冲，并在 session 结束时一起输出。这种格式非常适合程序化处理和自动化脚本。

JSON 输出是一个包含消息对象的数组。输出内容包括多种消息类型：系统消息（session 初始化）、assistant 消息（AI 响应）以及结果消息（执行摘要）。

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

Stream-JSON 格式会在执行过程中一旦产生 JSON 消息就立即输出，从而实现实时监控。该格式使用行分隔的 JSON，每条消息都是单行上的完整 JSON 对象。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

输出（事件发生时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

当与 `--include-partial-messages` 结合使用时，会实时输出额外的流事件（如 message_start、content_block_delta 等），适用于实时 UI 更新。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入读取内容：

- **`text`**（默认）：从 stdin 或命令行参数读取标准文本输入
- **`stream-json`**：通过 stdin 使用 JSON 消息协议进行双向通信

> **注意：** Stream-json 输入模式目前仍在开发中，主要面向 SDK 集成。使用时需同时设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或通过管道传递给其他命令：

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
```

# 用于实时处理的 Stream-JSON 输出
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

无头模式（headless）使用的关键命令行选项：

| 选项                          | 描述                                           | 示例                                                                       |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `--prompt`, `-p`              | 以无头模式运行                                 | `qwen -p "query"`                                                          |
| `--output-format`, `-o`       | 指定输出格式 (text, json, stream-json)         | `qwen -p "query" --output-format json`                                     |
| `--input-format`              | 指定输入格式 (text, stream-json)               | `qwen --input-format text --output-format stream-json`                     |
| `--include-partial-messages`  | 在 stream-json 输出中包含部分消息              | `qwen -p "query" --output-format stream-json --include-partial-messages`   |
| `--debug`, `-d`               | 启用调试模式                                   | `qwen -p "query" --debug`                                                  |
| `--all-files`, `-a`           | 将所有文件包含在上下文中                       | `qwen -p "query" --all-files`                                              |
| `--include-directories`       | 包含额外的目录                                 | `qwen -p "query" --include-directories src,docs`                           |
| `--yolo`, `-y`                | 自动批准所有操作                               | `qwen -p "query" --yolo`                                                   |
| `--approval-mode`             | 设置审批模式                                   | `qwen -p "query" --approval-mode auto_edit`                                |

有关所有可用配置选项、设置文件和环境变量的完整详细信息，请参阅[配置指南](./cli/configuration.md)。

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

### API 文档生成

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

这段脚本会调用 `qwen` 命令来解释数据库 schema，并以 JSON 格式输出结果。然后通过 `jq` 提取以下信息：

- 使用的总 token 数量 (`total_tokens`)
- 调用的模型列表 (`models_used`)
- 工具调用次数 (`tool_calls`)
- 使用的工具名称列表 (`tools_used`)

这些统计信息会被记录到 `usage.log` 文件中，同时将生成的文档内容保存为 `schema-docs.md`。最后，显示最近 5 条日志记录以便快速查看使用趋势。

## 资源

- [CLI 配置](./cli/configuration.md) - 完整配置指南
- [认证](./cli/authentication.md) - 设置认证
- [命令](./cli/commands.md) - 交互式命令参考
- [教程](./cli/tutorials.md) - 逐步自动化指南