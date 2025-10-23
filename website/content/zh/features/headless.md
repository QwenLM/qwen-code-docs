# 无头模式（Headless Mode）

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式 UI。这非常适合用于脚本编写、自动化任务、CI/CD 流水线以及构建 AI 驱动的工具。

- [无头模式（Headless Mode）](#headless-mode)
  - [概述](#overview)
  - [基本用法](#basic-usage)
    - [直接提示词输入](#direct-prompts)
    - [标准输入（Stdin）](#stdin-input)
    - [结合文件输入使用](#combining-with-file-input)
  - [输出格式](#output-formats)
    - [文本输出（默认）](#text-output-default)
    - [JSON 输出](#json-output)
      - [响应结构](#response-schema)
      - [使用示例](#example-usage)
    - [文件重定向](#file-redirection)
  - [配置选项](#configuration-options)
  - [使用示例](#examples)
    - [代码审查](#code-review)
    - [生成提交信息](#generate-commit-messages)
    - [API 文档生成](#api-documentation)
    - [批量代码分析](#batch-code-analysis)
    - [代码审查](#code-review-1)
    - [日志分析](#log-analysis)
    - [发布说明生成](#release-notes-generation)
    - [模型与工具使用追踪](#model-and-tool-usage-tracking)
  - [相关资源](#resources)

## 概述

headless 模式为 Qwen Code 提供了一个无头接口，具备以下特性：

- 通过命令行参数或 stdin 接收 prompt
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道操作
- 支持自动化和脚本工作流
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

从文件中读取内容并由 Qwen Code 处理：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

## 输出格式

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

返回结构化数据，包括 response、statistics 和 metadata。这种格式非常适合用于程序化处理和自动化脚本。

#### Response Schema

JSON 输出遵循以下高层结构：

```json
{
  "response": "string", // 主要的 AI 生成内容，用于回答你的 prompt
  "stats": {
    // 使用指标和性能数据
    "models": {
      // 每个模型的 API 和 token 使用统计
      "[model-name]": {
        "api": {
          /* 请求次数、错误、延迟等 */
        },
        "tokens": {
          /* prompt、response、cached、total 等数量统计 */
        }
      }
    },
    "tools": {
      // 工具执行统计
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* accept, reject, modify, auto_accept 计数 */
      },
      "byName": {
        /* 每个工具的详细统计数据 */
      }
    },
    "files": {
      // 文件修改统计
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // 仅在发生错误时出现
    "type": "string", // 错误类型（例如："ApiError", "AuthError"）
    "message": "string", // 人类可读的错误描述
    "code": "number" // 可选的错误代码
  }
}
```

#### 使用示例

```bash
qwen -p "What is the capital of France?" --output-format json
```

响应结果：

```json
{
  "response": "The capital of France is Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

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
```

## 配置选项

用于无头模式（headless）运行的关键命令行选项：

| 选项                     | 描述                           | 示例                                              |
| ------------------------ | ------------------------------ | ------------------------------------------------- |
| `--prompt`, `-p`         | 以无头模式运行                 | `qwen -p "query"`                                 |
| `--output-format`        | 指定输出格式（text, json）     | `qwen -p "query" --output-format json`            |
| `--model`, `-m`          | 指定使用的 Qwen 模型           | `qwen -p "query" -m qwen3-coder-plus`             |
| `--debug`, `-d`          | 启用调试模式                   | `qwen -p "query" --debug`                         |
| `--all-files`, `-a`      | 在上下文中包含所有文件         | `qwen -p "query" --all-files`                     |
| `--include-directories`  | 包含额外的目录                 | `qwen -p "query" --include-directories src,docs`  |
| `--yolo`, `-y`           | 自动批准所有操作               | `qwen -p "query" --yolo`                          |
| `--approval-mode`        | 设置审批模式                   | `qwen -p "query" --approval-mode auto_edit`       |

有关所有可用配置选项、设置文件和环境变量的完整信息，请参阅[配置指南](./cli/configuration.md)。

## 示例

#### 代码审查

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### 生成 commit 信息

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### API 文档生成

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### 批量代码分析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### 代码审查

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### 日志分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### 生成发布说明

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### 模型和工具使用情况跟踪

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

## 资源

- [CLI 配置](./cli/configuration.md) - 完整配置指南
- [认证](./cli/authentication.md) - 设置认证
- [命令](./cli/commands.md) - 交互式命令参考
- [教程](./cli/tutorials.md) - 逐步自动化指南