# 无头模式

无头模式允许你通过命令行脚本和自动化工具以编程方式运行 Qwen Code，无需任何交互式用户界面。该模式非常适合脚本编写、自动化任务、CI/CD 流水线以及构建 AI 驱动的工具。

## 概述

无头模式为 Qwen Code 提供了一个无头接口，具备以下能力：

- 通过命令行参数或标准输入（stdin）接收提示（prompt）
- 返回结构化输出（纯文本或 JSON 格式）
- 支持文件重定向与管道（piping）
- 支持自动化与脚本化工作流
- 提供一致的退出码，便于错误处理
- 可基于当前项目恢复之前的会话，从而支持多步骤自动化

## 基本用法

### 直接传入提示

使用 `--prompt`（或 `-p`）标志以无头模式运行：

```bash
qwen --prompt "什么是机器学习？"
```

### 从标准输入传入内容

通过终端将输入内容管道传递给 Qwen Code：

```bash
echo "解释这段代码" | qwen
```

### 与文件输入结合使用

从文件读取内容，并使用 Qwen Code 进行处理：

```bash
cat README.md | qwen --prompt "总结此文档"
```

### 恢复之前的会话（无界面模式）

在无界面脚本中复用当前项目的会话上下文：

```bash
# 继续当前项目的最新会话，并运行新提示词
qwen --continue -p "再次运行测试并汇总失败项"

# 直接恢复指定的会话 ID（不启动 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "应用后续重构"
```

> [!note]
>
> - 会话数据以 JSONL 格式按项目存储于 `~/.qwen/projects/<规范化当前工作目录>/chats` 下。
> - 恢复时将加载对话历史、工具输出以及聊天压缩检查点，然后再发送新提示词。

## 输出格式

Qwen Code 支持多种输出格式，适配不同使用场景：

### 文本输出（默认）

标准的、人类可读的输出：

```bash
qwen -p "法国的首都是哪里？"
```

响应格式：

```
法国的首都是巴黎。
```

### JSON 输出

以 JSON 数组形式返回结构化数据。所有消息会在会话结束时统一缓冲并输出。该格式适用于程序化处理和自动化脚本。

JSON 输出是一个消息对象数组，包含多种消息类型：系统消息（会话初始化）、助手消息（AI 响应）以及结果消息（执行摘要）。

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

Stream-JSON 格式会在执行过程中即时发生 JSON 消息，从而支持实时监控。该格式采用行分隔 JSON（line-delimited JSON），即每条消息均为单行上的完整 JSON 对象。

```bash
qwen -p "解释 TypeScript" --output-format stream-json
```

输出（随事件发生实时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

配合使用 `--include-partial-messages` 参数时，系统会实时发出额外的流事件（例如 `message_start`、`content_block_delta` 等），以支持 UI 的实时更新。

```bash
qwen -p "编写一个 Python 脚本" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 从标准输入读取输入的方式：

- **`text`**（默认）：从标准输入（stdin）或命令行参数读取标准文本输入  
- **`stream-json`**：通过标准输入（stdin）使用 JSON 消息协议进行双向通信  

> **注意：** `stream-json` 输入模式当前仍在开发中，专为 SDK 集成设计。启用该模式时，必须同时设置 `--output-format stream-json`。

### 文件重定向

将输出保存至文件，或通过管道传递给其他命令：

```bash

# 保存到文件
qwen -p "解释 Docker" > docker-explanation.txt
qwen -p "解释 Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "补充更多细节" >> docker-explanation.txt

# 管道传递给其他工具
qwen -p "Kubernetes 是什么？" --output-format json | jq '.response'
qwen -p "解释微服务" | wc -w
qwen -p "列出编程语言" | grep -i "python"

# 用于实时处理的 Stream-JSON 输出
qwen -p "解释 Docker" --output-format stream-json | jq '.type'
qwen -p "编写代码" --output-format stream-json --include-partial-messages | jq '.event.type'

## 配置选项

无界面模式（headless）使用的命令行关键选项：

| 选项                         | 描述                                                 | 示例                                                                     |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | 以无界面模式运行                                     | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 指定输出格式（text、json、stream-json）               | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 指定输入格式（text、stream-json）                    | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | 在 stream-json 输出中包含部分消息                   | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | 启用调试模式                                         | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | 将所有文件包含在上下文中                             | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | 包含额外的目录                                       | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | 自动批准所有操作                                     | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 设置审批模式                                         | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | 恢复此项目的最近一次会话                           | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 恢复指定会话（或交互式选择）                         | `qwen --resume 123e... -p "Finish the refactor"`                         |

有关所有可用配置选项、配置文件及环境变量的完整说明，请参阅[配置指南](../configuration/settings)。

## 示例

### 代码审查

```bash
cat src/auth.py | qwen -p "审查此身份验证代码是否存在安全问题" > security-review.txt
```

### 生成提交信息

```bash
result=$(git diff --cached | qwen -p "为这些更改编写简洁的提交信息" --output-format json)
echo "$result" | jq -r '.response'
```

### API 文档

```bash
result=$(cat api/routes.js | qwen -p "为这些路由生成 OpenAPI 规范" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### 批量代码分析

```bash
for file in src/*.py; do
    echo "正在分析 $file..."
    result=$(cat "$file" | qwen -p "查找潜在缺陷并提出改进建议" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "已完成 $(basename "$file") 的分析" >> reports/progress.log
done
```

### 拉取请求（PR）代码审查

```bash
result=$(git diff origin/main...HEAD | qwen -p "审查这些变更，查找缺陷、安全问题及代码质量问题" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### 日志分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "分析这些错误，指出根本原因并提供修复建议" > error-analysis.txt
```

### 生成发布说明

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "根据这些提交生成发布说明" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### 模型与工具使用情况追踪

```bash
result=$(qwen -p "解释此数据库模式" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens 个 token，$tool_calls 次工具调用（$tools_used），所用模型：$models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "近期使用趋势："
tail -5 usage.log
```

## 资源

- [CLI 配置](../configuration/settings#command-line-arguments) — 完整配置指南  
- [身份验证](../configuration/settings#environment-variables-for-api-access) — 配置身份验证  
- [命令](../features/commands) — 交互式命令参考  
- [教程](../quickstart) — 分步自动化指南