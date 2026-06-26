# 双输出

双输出是交互式 TUI 的一种 sidecar 模式：Qwen Code 正常在 `stdout` 上渲染的同时，会并发地将结构化的 JSON 事件流发送到独立通道，使外部程序（IDE 扩展、Web 前端、CI 流水线、自动化脚本）能够观察并操控会话。

它还提供了一个反向通道：外部程序可以将 JSONL 命令写入一个文件，TUI 会监听该文件，从而实现提交提示和响应工具权限请求，就像有人在键盘前操作一样。

双输出是完全可选的。以下述标志缺失时，TUI 的行为与之前完全一致，无额外 I/O，无行为变更。

## 使用场景

双输出是一个底层管道原语。以下是它能够实现的具体集成场景：

### 终端 + 聊天双模式实时同步

旗舰级使用场景。一个 Web 或桌面聊天 UI 在 PTY 中托管 TUI，并借助结构化事件流驱动一个并行的对话视图：

- 用户可以在任一界面上输入——TUI（面向终端原生高级用户）或 Web UI（提供更丰富的用户体验、可分享的链接、移动端支持）。两种视图保持同步，因为每条消息都流经相同的 JSON 事件。
- 工具审批提示同时在两个地方出现；谁先批准谁获胜。
- 会话历史从 `--json-file` 逐字捕获，因此服务端拥有规范的机器可读转录，无需解析 ANSI。

### IDE 扩展（VS Code / JetBrains / Cursor / Neovim）

将 Qwen Code 嵌入 IDE。对于希望使用的用户，TUI 在编辑器的集成终端面板中运行，而扩展则消费 `--json-fd` / `--json-file` 事件来驱动：

- 当 agent 修改文件时，显示内联 diff 叠加层。
- 一个带有格式化 Markdown、语法高亮工具调用和可点击引用的 Webview 侧面板。
- 状态栏指示器（思考中/响应中/等待审批）。
- 当用户点击原生 IDE 审批按钮时，程序性地写入 `confirmation_response`。

### 基于浏览器的聊天前端

Node/Bun 服务器在 PTY 中启动 TUI 以获得其渲染语义，但向浏览器暴露 WebSocket 通道。`--json-file` 上的事件被转发到客户端；用户在浏览器中输入的消息通过 `--input-file` 注入。双方均无需解析 ANSI。

### CI / 自动化观察者

CI 作业使用任务提示运行 Qwen Code。人在作业日志中看到 TUI；CI 系统尾随 `--json-file` 以：

- 如果 `result` 事件报告错误，则标记作业失败。
- 将 `token usage` / `duration_ms` / `tool_use` 计数推送到指标。
- 将完整转录作为构建产物归档。

### 多 Agent 编排

一个监督 agent 启动多个 TUI 工作进程，每个进程拥有自己的一对事件/输入文件。它监视进度、注入后续提示，并通过批准或拒绝所有工作进程中的工具调用来执行全局预算/安全策略。

### 会话录制、审计与回放

使用 `--json-file` 将所有 TUI 会话复制到常规文件中。之后：

- 合规审计可以精确重建已执行的内容。
- 自动化回归测试可以比较不同模型版本的运行结果。
- 回放工具可以通过相同的协议重新发出事件，以馈送可视化仪表板。

### 可观测性仪表板

将 `--json-file` 流式传输到 Loki / OTEL / 任何接受 JSONL 的管道。提取 `usage.input_tokens`、`tool_use.name`、`result.duration_api_ms` 作为 Grafana 中的一等指标。无需用于日志解析的正则表达式。

### 测试与 QA

集成测试以无头模式启动 Qwen Code，使用 `--input-file` 脚本驱动，并断言 `--json-file` 事件。与解析 stdout ANSI 不同，断言在 UI 重构时保持稳定。

## 标志

| 标志                  | 类型             | 用途                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | 数字，`n >= 3`   | 将结构化 JSON 事件写入文件描述符 `n`。调用方必须通过 spawn `stdio` 配置或 shell 重定向提供此 fd。 |
| `--json-file <path>`  | 路径             | 将结构化 JSON 事件写入文件。路径可以是常规文件、FIFO（命名管道）或 `/dev/fd/N`。                               |
| `--input-file <path>` | 路径             | 监听此文件中的 JSONL 命令，这些命令由外部程序写入。                                                                         |

`--json-fd` 和 `--json-file` 互斥。拒绝使用 fd 0、1、2，以防止破坏 TUI 自身的输出。

## 为什么有两个输出标志？(`--json-fd` vs `--json-file`)

乍一看，`--json-fd` 似乎足够——调用方启动 Qwen Code 时带上一个额外的文件描述符，TUI 将事件写入它，完成。但在实践中，fd 传递在最重要的嵌入场景下会失效：在伪终端（PTY）内运行 TUI。这就是为什么此功能还提供基于路径的替代方案。

### 何时 `--json-fd` 有效

纯粹的 `child_process.spawn` 配合 `stdio` 数组：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node 的 spawn 支持任意 `stdio` 条目；fd 3 被子进程继承，可以直接写入。零拷贝、零缓冲、零文件系统——最快的路径。

### 为什么在 PTY 下 `--json-fd` **不**工作

PTY 封装类如 [`node-pty`](https://github.com/microsoft/node-pty) 和 [`bun-pty`](https://github.com/oven-sh/bun) 是任何严肃嵌入器（IDE 扩展、Web 终端、tmux 类多路复用器）托管交互式 TUI 的方式。它们无法将额外的 fd 转发给子进程，原因有三：

1. **API 表面。** `node-pty.spawn(file, args, options)` 接受 `cwd`、`env`、`cols`、`rows`、`encoding` 等——但**没有 `stdio` 数组**。API 中根本没有地方可以表达"同时将此 fd 作为 fd 3 附加到子进程"。`bun-pty` 也暴露了相同的形状。
2. **`forkpty(3)` 语义。** 在底层，PTY 封装调用 `forkpty(3)`（或等效的 `posix_openpt` + `login_tty` 舞蹈）。该系统调用分配一个主/从伪终端对，并将子进程的 fd 0/1/2 重定向到从端，使子进程认为自己连接到了真正的终端。父进程中大于 2 的任何 fd 都会被 `login_tty` 关闭，它在 `exec` 之前为 `fd >= 3` 调用 `close(fd)`。额外的 fd 会被主动清除，而不是继承。
3. **控制终端副作用。** 即使你设法让额外 fd 通过，它也不是终端，因此子进程的 TUI 渲染器（它假定 fd 1 是 TTY 并写入转义序列）仍然需要从端来进行输出。你最终会得到两个独立的传输方式。

简而言之：一旦嵌入器需要真正的 TTY 进行 TUI 渲染——每个 IDE 扩展、每个 Web 终端、每个桌面聊天应用都是如此——fd 继承就不再可行。

### `--json-file` 填补了空白

文件路径作为普通的 CLI 参数传递，因此它可以适用于任何 spawn 模型：

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

子进程自行打开文件并写入事件；嵌入器使用 `fs.watch` 加增量读取来尾随同一路径。需要注意三点：

- **常规文件**、FIFO（命名管道）或 `/dev/fd/N` 均可工作。当双方在同一主机上时，FIFO 是延迟最低的选项。
- 桥接器以 `O_NONBLOCK` 打开 FIFO，并在 `ENXIO`（尚无读取者）时回退到阻塞模式，因此 PTY 启动永远不会因等待消费者而死锁。
- 对于多会话隔离，使用 `$XDG_RUNTIME_DIR` 或 `mkdtemp` 创建的目录（模式 `0700`）下的每会话路径。

### 应该使用哪个标志？

| 嵌入方式                                            | 使用                  |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` 配合普通 stdio                  | `--json-fd`          |
| `node-pty` / `bun-pty` / 任何 PTY 宿主             | `--json-file`        |
| Shell 重定向 / 手动管道测试                         | 两者皆可               |
| CI 日志收集（常规文件，退出后读取）                 | `--json-file`        |
| 同一主机上的最低可能延迟                           | `--json-file` + FIFO |

一般规则：**如果你需要 TUI 正确渲染，你就需要 PTY，这意味着你需要 `--json-file`。** `--json-fd` 适用于不关心 TUI 保真度的简单嵌入器——通常是那些无论如何都会丢弃 stdout 的程序化封装。

## 快速开始

使用常规文件运行 Qwen Code，同时启用两个通道：

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

在第二个终端中，尾随事件流：

```bash
tail -f /tmp/qwen-events.jsonl
```

在第三个终端中，向运行中的 TUI 推送提示：

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

该提示会像用户输入一样出现在 TUI 中，流式响应会镜像到 `/tmp/qwen-events.jsonl`。

### 使用 FIFO（命名管道）进行事件输出

FIFO 比常规文件延迟更低（无磁盘 I/O），并且在双方处于同一主机时工作良好。桥接器以 `O_RDWR | O_NONBLOCK` 打开 FIFO，因此即使尚无读取者连接，它**也不会阻塞**——事件在内核管道缓冲区中缓冲，直到读取者连接。

> **注意：** `--input-file` 需要一个常规文件（而非 FIFO），因为监视器依赖 `stat.size` 来检测新数据，而 FIFO 的 size 始终为 0。

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI 立即启动——无需先启动读取者。

# 在第二个终端中，随时连接：
cat /tmp/qwen-events.jsonl
```

如果从未有读取者连接，一旦内部缓冲区超过 1 MB，桥接器会自动禁用。TUI 继续正常运行。

## 输出事件模式

事件以 JSON Lines 格式发出（每行一个对象）。模式与交互式模式 `--output-format=stream-json` 使用的相同，其中 `includePartialMessages` 始终启用。

通道上的第一个事件始终是 `system` / `session_start`，在桥接器构建时发出。在任何其他事件到达之前，用它来将会话与 session id 关联。

```jsonc
// 会话生命周期
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// 正在进行中的助手轮次的流式事件
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// 已完成的消息
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// 权限控制平面（仅当工具需要审批时）
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

无论决定是在 TUI 中（原生审批 UI）还是由外部 `confirmation_response`（见下文）做出，都会发出 `control_response`。无论哪种方式，所有观察者都能看到最终结果。

## 输入命令模式

`--input-file` 接受两种命令格式：

```jsonc
// 将用户消息提交到提示队列中
{ "type": "submit", "text": "What does this function do?" }

// 回复一个待处理的 control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

行为：

- `submit` 命令会被排队。如果 TUI 正在响应，它们会在 TUI 下次回到空闲状态时自动重试。
- `confirmation_response` 命令会立即分发，不会排队，因为工具调用正在阻塞，响应必须到达底层的 `onConfirm` 处理程序，而无需等待任何先前的 `submit`。
- 先批准工具的哪一方胜出；另一方的迟到的响应会被无害地丢弃。
- 无法解析为 JSON 的行会被记录并跳过——它们不会停止监视器。

## 延迟说明

输入文件通过 `fs.watchFile` 以 500 毫秒的轮询间隔进行观察，因此远程 `submit` 的最坏情况往返延迟约为半秒。这是有意为之：轮询在平台和文件系统（包括 macOS / 网络挂载）中可移植，并且与功能所针对的典型人机交互节奏相匹配。输出通道没有轮询——事件在 TUI 发出时同步写入。

## 故障模式

- **Bad fd。** 如果传递给 `--json-fd` 的 fd 未打开或者是 0/1/2 之一，TUI 会向 `stderr` 打印警告并继续运行，不启用双输出。
- **Bad path。** 如果传递给 `--json-file` 的文件无法打开，TUI 会打印警告并继续运行，不启用双输出。
- **消费者断开。** 如果通道另一端的读取者消失（`EPIPE`），桥接器会静默禁用自身，TUI 继续运行。不会重试。
- **FIFO 缓冲区溢出。** 当向没有读取者附加的 FIFO 写入时，事件会在内核管道（Linux 上约 64 KB）和 Node.js WriteStream 中缓冲。一旦管道满或内部缓冲区超过 1 MB，桥接器会禁用自身并关闭 fd。在这种情况下，不会发出 `session_end`——消费者应将没有 `session_end` 的关闭流视为异常终止。TUI 继续正常运行。
- **适配器异常。** 发出事件时抛出的任何异常都会被捕获、记录并禁用桥接器。TUI 永远不会因双输出故障而崩溃。

## Spawn 示例

一个典型的嵌入父进程使用两个通道启动 Qwen Code：

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

TUI 仍然拥有 stdio 0/1/2 上的用户终端，而嵌入器在支持 fd 3 的文件上读取结构化事件，并通过将 JSONL 行追加到 `/tmp/qwen-input.jsonl` 来推送命令。

## 基于设置的配置

对于长期存在的嵌入器，每次启动时传递 CLI 标志通常很不方便。相同的通道可以在 `settings.json` 的顶级 `dualOutput` 键下进行配置：

```jsonc
// ~/.qwen/settings.json  (用户级别)
// 或 <workspace>/.qwen/settings.json  (工作区级别)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

优先级规则：

- CLI 标志**优先于**设置。在命令行上传递 `--json-file /foo` 会覆盖设置中的 `dualOutput.jsonFile`。
- `--json-fd` 没有设置等效项——fd 传递是 spawn 时的问题，无法静态声明。
- 如果既没有标志也没有设置，双输出将保持禁用（与今天的默认值相同）。

`requiresRestart: true` 标志意味着更改仅在下次启动 Qwen Code 时生效，因为桥接器在启动时构建一次。

## 可运行演示

以下每个脚本都是可复制粘贴的。从 POC 1 开始，验证构建版本是否启用了双输出；POC 4 最接近真实的 IDE 扩展集成。

### POC 1 — 观察事件流

在用户正常使用 TUI 时观察它发出的每个结构化事件：

```bash
# 终端 A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# 终端 B
qwen --json-file /tmp/qwen-events.jsonl
# ...然后正常聊天；终端 A 实时显示 session_start、
# user/assistant/result/control_request 生命周期。
```

终端 A 中期望的第一行：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 从外部注入提示

从第二个终端驱动 TUI，无需触碰第一个终端的键盘：

```bash
# 终端 A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# 终端 B — TUI 像你输入一样响应
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — 远程工具权限桥接器

从单独的进程批准或拒绝工具调用：

```bash
# 终端 A — 观察 control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# 终端 B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# 让 Qwen 做一些需要审批的事情，例如
# "run `ls -la /tmp`"。终端 A 中将出现一个 control_request。
# 复制 request_id，然后在第三个终端中：
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# TUI 审批提示被关闭，工具开始执行。
```

如果你回复一个未知的 `request_id`，桥接器会在输出通道上发出一个 `subtype: "error"` 的 `control_response`，以便你的消费者可以记录它或重试：

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Node 嵌入器（类似 IDE）

最真实的形态：父进程启动 Qwen Code，尾随事件，并按自己的计划注入提示。

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// 尾随输出通道。生产中你会使用合适的
// 字节偏移尾随；这里为了简洁而从 0 重新流式传输。
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // 在使用功能前先进行特性检测
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// 2 秒后，注入一个提示，就像用户输入的一样
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```
运行：

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI 会在当前终端中打开；嵌入器会将
# handshake + turn-end + session_end 事件记录到父进程的 stdout。
```

### POC 5 — 能力握手特性检测

较旧版本的 Qwen Code 不会发出 `protocol_version`。将该字段视为可选字段并进行特性检测：

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — session_end 作为干净的终止信号

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // 刷新指标、关闭 WebSocket 等
  }
});
```

如果 TUI 在 `session_end` 之前崩溃，输出流会关闭（下次写入时触发 `EPIPE`）；嵌入器应同时处理这两种路径。

### POC 7 — 故障演练（证明这些标志永远不会破坏 TUI）

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI 仍正常启动。

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI 仍正常启动。

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs 拒绝："--json-fd and --json-file are mutually exclusive."
# 进程在 TUI 启动前退出。

qwen --json-file /nonexistent/dir/x.jsonl
# stderr 警告；TUI 仍正常启动。
```

## 与 Claude Code 的关系

Claude Code 通过 `--print --output-format stream-json` 暴露了类似的流式 JSON 事件格式，但仅限于非交互模式——它无法同时运行 TUI 和结构化侧边通道。Dual Output 填补了这一空白。