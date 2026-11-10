# 非交互脚本

使用 `--print`（`-p`）提交提示词、输出结果并退出，不打开交互终端界面。无人值守任务开始前，应先配置认证和模型访问。

## 执行提示词

```bash
qwen -p "Explain the purpose of this repository. Do not modify files."
qwen -p --cwd /path/to/project "Summarize the public interfaces."
```

提示词是位置参数；`-p` 是模式开关，不消费提示词。没有 `-p` 时，只有 stdin 和 stdout 都是终端，位置参数才会作为交互会话的初始提示；输入或输出被管道或重定向，以及设置了 `CI=true` 或 `GITHUB_ACTIONS=true` 时，以非交互方式运行。脚本中请显式使用 `-p`。也可以通过管道传入纯文本：

```bash
git diff --no-ext-diff | qwen -p "Review this diff for correctness and missing tests."
```

验证差异时，模型可能需要读取仓库。应在正确目录运行，并明确是否允许修改。提示词里的约束不能替代工具权限。

## 输出格式

| 格式 | 用途 |
| --- | --- |
| `text` | 人类可读结果，默认值 |
| `json` | 最终结构化结果对象 |
| `stream-json` | 逐行 JSON 事件，包含终态结果 |

```bash
qwen -p --output-format json "Summarize this project." > result.json
qwen -p --output-format stream-json "Explain the test layout." > events.jsonl
```

JSON 输出是 CLI 的结果封装，不保证模型答案本身符合你的应用 JSON Schema。应按所选格式解析 stdout，并检查进程退出状态。流式输出应逐行解析，根据 `type` 分发，并处理最终 `result` 与错误字段。不能假设每个事件都有文本，也不能把整个流当作一个 JSON 文档解析。Preview 集成应兼容新增字段和事件类型。

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 运行结束，但结果为失败 |
| `41` | 认证错误 |
| `42` | 输入错误 |
| `52` | 配置错误 |
| `130` | 已取消 |

非交互运行会把当前目录视为可信，因此会加载项目配置、Hook 和项目 MCP 服务器。详见[权限](/zh/users/permissions/)。

POSIX Shell 中可保留失败状态：

```bash
if qwen -p --output-format json "Summarize this project." > result.json; then
  node -e 'const fs = require("fs"); const r = JSON.parse(fs.readFileSync("result.json", "utf8")); console.log(r.result ?? r);'
else
  echo "Qwen Code failed; inspect result.json and diagnostics." >&2
  exit 1
fi
```

模型成功返回是任务输出，不代表生成代码通过测试。部署流水线使用产物前，还应执行自己的验证。

## 结构化输入

`--input-format stream-json` 必须搭配 `--output-format stream-json`。输入逐行用户消息，例如：

```bash
printf '%s\n' '{"type":"user","message":{"content":"Explain the repository structure."}}' |
  qwen -p --input-format stream-json --output-format stream-json
```

基础集成可以直接使用文本内容。输入流是一系列消息，不是顶层 JSON 数组。发送完整行，批次结束后关闭 stdin。本指南覆盖公开 CLI 选项，不代表承诺独立 SDK 或所有内部控制消息的兼容性。

## 权限、设置与持久化

通过 `--tools`、`--allowed-tools` 和 `--disallowed-tools` 控制可用及获准使用的工具。可先在交互会话用 `/tools` 查看真实名称。无人值守运行不能依赖用户回答终端批准提示，应预先配置所需权限，把被拒绝的调用作为失败或未完成结果处理。`--dangerously-skip-permissions` 绕过常规权限确认，但标记为不可跳过或不受 bypass 影响的检查仍然生效，不适合作为默认 CI 配置。

为提高任务可重复性，明确指定 `--cwd`、`--model`、设置来源及 MCP 输入。`--setting-sources` 选择磁盘来源（`user`、`project`、`local`）；`--settings` 接受文件或内联 JSON，属于独立的参数层。排除磁盘设置时，也可能排除原本依赖的认证或 provider 配置。

会话默认保存历史。`--no-session-persistence` 与 `--print` 一起使用，禁止保存会话历史，之后不能恢复；它不等于没有诊断日志或服务端数据。`--resume <id>` 恢复指定会话，`--continue` 继续相关上下文中最近的会话。自动化优先使用明确的 ID。

`--max-output-tokens` 限制模型输出 token，不是总费用或任务耗时上限。`--max-model-request-retries` 控制 provider 请求重试次数。需要总时限时，在外层任务运行器设置超时；有副作用的任务不要盲目重跑。

## 排错

- **提示登录：**任务执行前配置所选认证方式，不要通过模拟输入终端登录对话框传递密钥。
- **项目或配置不对：**检查进程目录、`--cwd`、`--config-dir` 和设置来源。
- **流格式错误：**匹配输入输出格式，每行发送一个完整 JSON 对象，避免无关程序输出混入 stdout。
- **有输出但任务未完成：**检查被拒绝的工具、结果错误与退出码，独立验证产物和测试。
- **恢复时找不到会话：**检查配置根目录与项目上下文，确认原会话没有关闭持久化。

自动化中使用外部集成，另见 [MCP](/zh/users/mcp/) 与 [Hooks](/zh/users/hooks/)。
