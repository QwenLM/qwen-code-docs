# 无头模式

无头模式允许你从命令行脚本和自动化工具中以编程方式运行 Qwen Code，无需交互式界面。这非常适合脚本编写、自动化、CI/CD 流水线以及构建 AI 驱动的工具。

## 概述

无头模式为 Qwen Code 提供了无头接口，支持：

- 通过命令行参数或标准输入接受提示
- 返回结构化输出（文本或 JSON）
- 支持文件重定向和管道
- 实现自动化和脚本编写工作流
- 提供一致的退出码以便处理错误
- 可恢复当前项目范围内的先前会话，用于多步骤自动化

## 基本用法

### 直接提示

使用 `--prompt`（或 `-p`）标志以无头模式运行：

```bash
qwen --prompt "什么是机器学习？"
```

### 标准输入

通过终端向 Qwen Code 传送数据：

```bash
echo "解释这段代码" | qwen
```

### 与文件输入结合

读取文件并使用 Qwen Code 进行处理：

```bash
cat README.md | qwen --prompt "总结这份文档"
```

### 恢复先前会话（无头模式）

在无头脚本中重用当前项目的对话上下文：

```bash
# 继续该项目最近的会话并运行新提示
qwen --continue -p "再次运行测试并总结失败情况"

# 直接恢复指定会话 ID（无 UI）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "应用后续重构"
```

> [!note]
>
> - 会话数据是项目范围的 JSONL 文件，位于 `~/.qwen/projects/<sanitized-cwd>/chats`。
> - 在发送新提示之前，会恢复对话历史、工具输出以及聊天压缩检查点。

## 自定义主会话提示

你可以为单次 CLI 运行更改主会话系统提示，而无需编辑共享内存文件。

### 覆盖内置系统提示

使用 `--system-prompt` 替换 Qwen Code 内置的主会话提示，仅对当前运行生效：

```bash
qwen -p "审查此补丁" --system-prompt "你是一个简洁的发布审查员。仅报告阻塞性问题。"
```

### 追加额外指令

使用 `--append-system-prompt` 保留内置提示，并为此运行添加额外指令：

```bash
qwen -p "审查此补丁" --append-system-prompt "要简洁，并聚焦于具体发现。"
```

你可以同时使用两个标志，当你需要自定义基础提示外加一个运行特定的额外指令时：

```bash
qwen -p "总结此仓库" \
  --system-prompt "你是一个迁移规划者。" \
  --append-system-prompt "仅返回三个要点。"
```

> [!note]
>
> - `--system-prompt` 仅应用于当前运行的主会话。
> - 加载的内存和上下文文件（如 `QWEN.md`）仍然会在 `--system-prompt` 之后追加。
> - `--append-system-prompt` 在内置提示和加载的内存之后应用，并且可以与 `--system-prompt` 一起使用。

## 输出格式

Qwen Code 支持多种输出格式，适用于不同使用场景：

### 文本输出（默认）

标准人类可读输出：

```bash
qwen -p "法国的首都是什么？"
```

响应格式：

```
法国的首都是巴黎。
```

### JSON 输出

返回结构化数据的 JSON 数组。所有消息会被缓冲并在会话完成时一起输出。这种格式非常适合编程处理和自动化脚本。

JSON 输出是一个消息对象数组。输出包含多种消息类型：系统消息（会话初始化）、助手消息（AI 响应）和结果消息（执行摘要）。

#### 使用示例

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

Stream-JSON 格式在执行过程中立即发出 JSON 消息，支持实时监控。此格式使用行分隔的 JSON，每个消息作为一个完整的 JSON 对象单独在一行。

```bash
qwen -p "解释 TypeScript" --output-format stream-json
```

输出（事件发生时流式输出）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

当与 `--include-partial-messages` 结合使用时，还会实时发出额外的流事件（message_start、content_block_delta 等），用于实时 UI 更新。

```bash
qwen -p "编写一个 Python 脚本" --output-format stream-json --include-partial-messages
```

### 输入格式

`--input-format` 参数控制 Qwen Code 如何从标准输入消费输入：

- **`text`**（默认）：来自标准输入或命令行参数的标准文本输入
- **`stream-json`**：通过标准输入实现双向通信的 JSON 消息协议

> **注意：** Stream-json 输入模式目前正在建设中，旨在用于 SDK 集成。需要同时设置 `--output-format stream-json`。

### 文件重定向

将输出保存到文件或通过管道传给其他命令：

```bash
# 保存到文件
qwen -p "解释 Docker" > docker-explanation.txt
qwen -p "解释 Docker" --output-format json > docker-explanation.json

# 追加到文件
qwen -p "添加更多细节" >> docker-explanation.txt

# 通过管道传给其他工具
qwen -p "什么是 Kubernetes？" --output-format json | jq '.response'
qwen -p "解释微服务" | wc -w
qwen -p "列出编程语言" | grep -i "python"

# Stream-JSON 输出用于实时处理
qwen -p "解释 Docker" --output-format stream-json | jq '.type'
qwen -p "编写代码" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 配置选项

用于无头模式的关键命令行选项：

| 选项                           | 描述                                                                   | 示例                                                                |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `--prompt`, `-p`             | 以无头模式运行                                                           | `qwen -p "查询"`                                                    |
| `--output-format`, `-o`      | 指定输出格式（text、json、stream-json）                                    | `qwen -p "查询" --output-format json`                               |
| `--input-format`             | 指定输入格式（text、stream-json）                                         | `qwen --input-format text --output-format stream-json`               |
| `--include-partial-messages` | 在 stream-json 输出中包含部分消息                                          | `qwen -p "查询" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | 为此运行覆盖主会话系统提示                                                 | `qwen -p "查询" --system-prompt "你是一个简洁的审查员。"`              |
| `--append-system-prompt`     | 为此运行向主会话系统提示追加额外指令                                         | `qwen -p "查询" --append-system-prompt "聚焦于具体发现。"`              |
| `--debug`, `-d`              | 启用调试模式                                                               | `qwen -p "查询" --debug`                                            |
| `--all-files`, `-a`          | 在上下文中包含所有文件                                                     | `qwen -p "查询" --all-files`                                        |
| `--include-directories`      | 包含额外的目录                                                             | `qwen -p "查询" --include-directories src,docs`                     |
| `--yolo`, `-y`               | 自动批准所有操作                                                           | `qwen -p "查询" --yolo`                                             |
| `--approval-mode`            | 设置批准模式                                                               | `qwen -p "查询" --approval-mode auto_edit`                          |
| `--continue`                 | 恢复该项目最近的会话                                                       | `qwen --continue -p "从我们上次停下的地方继续"`                       |
| `--resume [sessionId]`       | 恢复指定会话（或交互式选择）                                                 | `qwen --resume 123e... -p "完成重构"`                               |
| `--max-session-turns`        | 限制运行中用户/模型/工具轮次的数量                                             | `qwen -p "..." --max-session-turns 30`                              |
| `--max-wall-time`            | 挂钟时间预算；接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h`                      | `qwen -p "..." --max-wall-time 10m`                                 |
| `--max-tool-calls`           | 运行中累计工具调用预算                                                      | `qwen -p "..." --max-tool-calls 50`                                 |

关于所有可用配置选项、设置文件和环境变量的完整详情，请参阅[配置指南](../configuration/settings)。

## 无人值守运行的安全注意事项

无头/CI 运行结合 `--yolo`（或 `--approval-mode=yolo`）会自动批准所有工具调用，包括 `shell`、`write` 和 `edit`。**`--yolo` 不会启用沙箱**——这些工具以宿主进程的权限级别运行。当 Qwen Code 检测到这种组合且未配置沙箱时，会在启动时向 stderr 输出一行警告。一旦你审查过权衡，可以使用 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 抑制该警告。

### 运行级别预算

当无人值守运行超过以下任一阈值时，Qwen Code 可以中止运行。每个默认值为 `-1`（无限制）；设置任何一个都足以限制失控行为。它们与已经携带 SIGINT 的同一个 `AbortController` 协作执行，因此预算中止会发出结构化的 `FatalBudgetExceededError`（退出码 **55**）——这不同于轮次上限退出码 53 和 SIGINT 的退出码 130，以便 CI 脚本可以根据原因进行分支。

| 标志                  | 设置键                      | 限制范围                                                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | 整个运行的挂钟时间。标志接受 `90`（秒）、`30s`、`5m`、`1h`、`1.5h`（支持小数单位）。最小值为 1 秒——小于 1 秒的值将被视为拼写错误拒绝。设置项使用秒。                                                                                                                                                     |
| `--max-tool-calls`    | `model.maxToolCalls`       | 主运行循环分派的累计顶级工具调用数（计算成功和失败——模型在出错时仍会消耗 token）。有关子代理/结构化输出的豁免，请参见下面的“范围”。                                                                                                                                                                             |
| `--max-session-turns` | `model.maxSessionTurns`    | 用户/模型/工具轮次数量；已预先存在。超出时以退出码 53 退出（不同于预算退出码 55）。                                                                                                                                                                                                                     |

#### 范围

- **`--max-tool-calls` 仅计算顶级分派。**当模型调用 `agent` 工具时，该分派计为 **1**；生成的子代理执行的内部工具调用**不计入**。将工作通过子代理分发的模型可以在较小的顶级预算下执行无限制的内部工作。如果你需要更紧的限制，请结合使用 `--exclude-tools agent`。
- **`structured_output` 豁免于 `--max-tool-calls`。**在 `--json-schema` 下，模型的终端 `structured_output` 调用是“我已完成”的契约，而非实际工作——它不计入 `--max-tool-calls`，这样预算边缘的完成不会被误判中止。豁免是无条件的（包括失败的 Ajv 验证），因此陷入格式错误重试循环的模型**不会**被 `--max-tool-calls` 限制；请结合使用 `--max-session-turns` 或 `--max-wall-time` 来限制重试。
- **`structured_output` 不豁免于 `--max-session-turns`。**该计数器已预先存在，每轮（包括终端契约）都会递增。如果你想在 `--json-schema` 下允许 `N` 个实际工作轮次，请将 `--max-session-turns` 设置为 `N+1`。
- **单次运行 vs `--input-format stream-json`：**在 stream-json 输入模式下，守护进程会在每条用户消息开始时重置预算计数器；预算是每条消息的，而不是每个进程的。
- **`qwen serve` / ACP 会话：**守护进程的 ACP 会话路径当前**不会**查阅 settings.json 中的 `--max-wall-time` / `--max-tool-calls`。这些预算仅适用于单次 `qwen -p` 运行和 `--input-format stream-json` 会话。（`qwen serve` 在启动时如果设置中 `tools.approvalMode: 'yolo'`，仍会发出 YOLO 无沙箱警告。）

### 推荐组合

- **受信任的隔离环境（临时 CI 运行器、容器）：**`qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。设定轮次预算和挂钟预算，防止卡住的代理耗尽你的 CI 分钟数，并捕获 `--output-format json` 用于运行后使用情况/工具调用审计。
- **本地机器或共享基础设施：**同时传递 `--sandbox`（或设置 `QWEN_SANDBOX=1`），以便 shell/write/edit 工具在沙箱镜像内运行。
- **使用重试的长时间运行 CI：**将 `QWEN_CODE_UNATTENDED_RETRY=1` 与 `--max-wall-time` 结合使用。重试环境变量使运行能够跨越瞬时的 429 / 529 响应；挂钟预算确保持续失败的 provider 无法无限延长任务。
- **有边界的审计/探索：**对于只读任务，`--max-tool-calls 25` 限制了模型 grep/读取的激进程度。结合使用 `--exclude-tools shell,write,edit` 使限制有意义。

## 示例

### 代码审查

```bash
cat src/auth.py | qwen -p "审查此身份验证代码是否存在安全问题" > security-review.txt
```

### 生成提交信息

```bash
result=$(git diff --cached | qwen -p "为这些更改写一条简洁的提交信息" --output-format json)
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
    result=$(cat "$file" | qwen -p "查找潜在错误并建议改进" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "完成对 $(basename "$file") 的分析" >> reports/progress.log
done
```

### PR 代码审查

```bash
result=$(git diff origin/main...HEAD | qwen -p "审查这些更改是否存在错误、安全问题和代码质量" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### 日志分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "分析这些错误并建议根本原因和修复方案" > error-analysis.txt
```

### 发布说明生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "从这些提交中生成发布说明" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### 模型和工具使用追踪

```bash
result=$(qwen -p "解释此数据库模式" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls 次工具调用 ($tools_used)，使用模型: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "近期使用趋势："
tail -5 usage.log
```

## 持久重试模式

当 Qwen Code 在 CI/CD 流水线中作为后台守护进程运行时，短暂的 API 中断（限流或过载）不应导致一个需要数小时的任务失败。**持久重试模式**使 Qwen Code 在遇到瞬时 API 错误时无限重试，直到服务恢复。

### 工作原理

- **仅瞬时错误**：HTTP 429（限流）和 529（过载）会被无限重试。其他错误（400、500 等）仍然正常失败。
- **带上限的指数退避**：重试延迟呈指数增长，但每次重试最多不超过 **5 分钟**。
- **心跳保活**：在长时间等待期间，每 **30 秒**向 stderr 输出一行状态信息，以防止 CI 运行器因进程无活动而将其杀死。
- **优雅降级**：非瞬时错误和交互模式完全不受影响。

### 激活

将 `QWEN_CODE_UNATTENDED_RETRY` 环境变量设置为 `true` 或 `1`（严格匹配，区分大小写）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 持久重试需要**显式选择加入**。仅 `CI=true` 并**不会**激活它——将快速失败的 CI 任务悄然变成无限等待的任务是危险的。请始终在你的流水线配置中显式设置 `QWEN_CODE_UNATTENDED_RETRY`。

### 示例

#### GitHub Actions

```yaml
- name: 自动化代码审查
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "审查 src/ 中所有文件是否存在安全问题" \
      --output-format json \
      --yolo > review.json
```

#### 夜间批量处理

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "将 src/ 中所有回调风格的函数迁移为 async/await" --yolo
```

#### 后台守护进程

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "审计所有依赖项是否存在已知 CVE" \
  --output-format json > audit.json 2> audit.log &
```

### 监控

在持久重试期间，心跳消息会打印到 **stderr**：

```
[qwen-code] 等待 API 容量... 第 3 次尝试，45 秒后重试
[qwen-code] 等待 API 容量... 第 3 次尝试，15 秒后重试
```

这些消息可以保持 CI 运行器存活，并让你监控进度。它们不会出现在 stdout 中，因此通过管道传送给其他工具的 JSON 输出保持干净。

## 资源

- [CLI 配置](../configuration/settings#command-line-arguments) - 完整配置指南
- [身份认证](../configuration/auth.md) - 设置身份认证
- [命令](../features/commands) - 交互命令参考
- [教程](../quickstart) - 逐步自动化指南