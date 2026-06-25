# 双输出（Dual Output）

Dual Output 是交互式 TUI 的一种 sidecar 模式：Qwen Code 继续在 `stdout` 上正常渲染，同时将结构化 JSON 事件流并发输出到独立的通道，供外部程序（IDE 插件、Web 前端、CI 流水线、自动化脚本）观察和控制当前会话。

此外，它还提供了一个反向通道：外部程序可以将 JSONL 命令写入 TUI 监听的文件，从而提交提示词或响应工具权限请求，效果与人工键盘操作完全一致。

Dual Output 是完全可选的。未传入以下 flag 时，TUI 行为与之前完全相同，不产生任何额外 I/O，也不改变任何行为。

## 使用场景

Dual Output 是一个底层基础能力，以下是它所支持的具体集成场景：

### 终端 + 聊天双模式实时同步

最典型的使用场景。Web 或桌面 ChatUI 将 TUI 托管在 PTY 内，并通过结构化事件流驱动并行的对话视图：

- 用户可以在任意一侧输入——TUI（面向终端原生的高级用户）或 Web UI（更丰富的 UX、可分享链接、移动端）。由于每条消息都通过同一组 JSON 事件传递，两个视图保持同步。
- 工具审批提示同时出现在两侧，先批准的一方生效。
- 会话历史通过 `--json-file` 完整捕获，服务端无需解析 ANSI 即可获得机器可读的标准记录。

### IDE 插件（VS Code / JetBrains / Cursor / Neovim）

将 Qwen Code 内嵌于 IDE 中。TUI 在编辑器的集成终端面板中运行，插件同时消费 `--json-fd` / `--json-file` 事件，用于驱动：

- Agent 修改文件时的内联 diff 覆盖层。
- 带格式化 Markdown、语法高亮工具调用和可点击引用的 WebView 侧边栏。
- 状态栏指示器（思考中 / 响应中 / 等待审批）。
- 用户点击 IDE 原生审批按钮时以编程方式写入 `confirmation_response`。

### 基于浏览器的聊天前端

Node/Bun 服务在 PTY 中启动 TUI（利用其渲染语义），同时向浏览器暴露 WebSocket 通道。`--json-file` 上的事件被转发至客户端，用户在浏览器中输入的消息通过 `--input-file` 注入。两侧均无需解析 ANSI。

### CI / 自动化观察者

CI 任务以任务提示词运行 Qwen Code。人工可在任务日志中查看 TUI；CI 系统持续读取 `--json-file` 以：

- 当 `result` 事件报告错误时，将任务标记为失败。
- 将 `token usage` / `duration_ms` / `tool_use` 计数推送至指标系统。
- 将完整记录归档为构建产物。

### 多 Agent 编排

上层 Agent 启动多个 TUI worker，每个 worker 拥有独立的事件/输入文件对。上层 Agent 监控进度、注入后续提示词，并通过批准或拒绝各 worker 的工具调用来执行全局预算和安全策略。

### 会话录制、审计与回放

通过 `--json-file` 将每次 TUI 会话记录到普通文件，后续可用于：

- 合规审计，精确还原执行内容。
- 跨模型版本的自动化回归测试。
- 回放工具通过相同协议重新发布事件，以驱动可视化仪表盘。

### 可观测性仪表盘

将 `--json-file` 流接入 Loki / OTEL 或任何接受 JSONL 的流水线。将 `usage.input_tokens`、`tool_use.name`、`result.duration_api_ms` 作为 Grafana 中的一等指标使用，无需正则解析日志。

### 测试与 QA

集成测试以无头模式启动 Qwen Code，通过 `--input-file` 脚本驱动，并断言 `--json-file` 中的事件。与解析 stdout ANSI 不同，这种断言方式在 UI 重构后依然稳定。

## Flag 说明

| Flag                  | 类型             | 用途                                                                                                                                    |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | number，`n >= 3` | 将结构化 JSON 事件写入文件描述符 `n`。调用方须通过 spawn `stdio` 配置或 shell 重定向提供该 fd。 |
| `--json-file <path>`  | path             | 将结构化 JSON 事件写入文件。路径可以是普通文件、FIFO（命名管道）或 `/dev/fd/N`。               |
| `--input-file <path>` | path             | 监听该文件，读取外部程序写入的 JSONL 命令。                                                     |

`--json-fd` 与 `--json-file` 互斥。fd 0、1、2 会被拒绝，以防破坏 TUI 自身的输出。

## 为什么有两个输出 flag？（`--json-fd` vs `--json-file`）

乍看之下 `--json-fd` 已经够用——调用方以附加文件描述符启动 Qwen Code，TUI 向其写入事件，完毕。然而在最重要的内嵌场景中，fd 传递会失效：在伪终端（PTY）内运行 TUI。正因如此，该功能还提供了基于路径的替代方案。

### `--json-fd` 适用场景

纯 `child_process.spawn` 配合 `stdio` 数组时可正常使用：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node 的 spawn 支持任意 `stdio` 条目；fd 3 被子进程继承，子进程可直接写入。零拷贝、零缓冲、零文件系统——是最快的路径。

### `--json-fd` 在 PTY 下**不**适用的原因

[`node-pty`](https://github.com/microsoft/node-pty) 和 [`bun-pty`](https://github.com/oven-sh/bun) 等 PTY 封装库，是任何严肃的内嵌方（IDE 插件、Web 终端、类 tmux 多路复用器）托管交互式 TUI 的标准方式。它们无法将额外的 fd 传递给子进程，原因有三：

1. **API 接口。** `node-pty.spawn(file, args, options)` 接受 `cwd`、`env`、`cols`、`rows`、`encoding` 等参数，但**没有 `stdio` 数组**。API 中根本没有地方可以声明"同时将此 fd 作为 fd 3 传入子进程"。`bun-pty` 的接口形式相同。
2. **`forkpty(3)` 语义。** PTY 封装库底层调用 `forkpty(3)`（或等价的 `posix_openpt` + `login_tty` 流程）。该系统调用会分配一对主/从伪终端，并将子进程的 fd 0/1/2 重定向到从端，让子进程以为自己连接到了真实终端。`login_tty` 会在 `exec` 前对 `fd >= 3` 调用 `close(fd)`，主动关闭所有额外 fd，而非继承它们。
3. **控制终端副作用。** 即使强行传入额外 fd，该 fd 也不是终端，子进程的 TUI 渲染器（在 fd 1 上以 TTY 为前提写入转义序列）仍然需要从端输出。最终你还是会得到两路独立的传输通道。

简而言之：一旦内嵌方需要真实的 TTY 来正确渲染 TUI——这涵盖了所有 IDE 插件、所有 Web 终端、所有桌面聊天应用——fd 继承就行不通了。

### `--json-file` 填补了这一空白

文件路径作为普通 CLI 参数传入，因此可以在任何 spawn 模式下存活：

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

子进程自行打开文件并写入事件；内嵌方通过 `fs.watch` 加增量读取持续读取同一路径。有三点需要注意：

- **普通文件**、FIFO（命名管道）或 `/dev/fd/N` 均可使用。在同一主机上，FIFO 是延迟最低的选项。
- bridge 以 `O_NONBLOCK` 打开 FIFO，在 `ENXIO`（尚无读取方）时回退到阻塞模式，因此 PTY 启动不会因等待消费方而死锁。
- 为实现多会话隔离，建议在 `$XDG_RUNTIME_DIR` 下或权限为 `0700` 的 `mkdtemp` 目录下使用会话专属路径。

### 应该用哪个 flag？

| 内嵌方式                                   | 使用                  |
| ------------------------------------------ | --------------------- |
| `child_process.spawn` 配合普通 stdio       | `--json-fd`           |
| `node-pty` / `bun-pty` / 任意 PTY 宿主    | `--json-file`         |
| Shell 重定向 / 手动流水线测试              | 任意均可              |
| CI 日志收集（普通文件，退出后读取）        | `--json-file`         |
| 同一主机上追求最低延迟                     | `--json-file` + FIFO  |

通用原则：**如果需要 TUI 正确渲染，就需要 PTY，也就需要 `--json-file`。** `--json-fd` 适用于更简单的内嵌方，它们不在意 TUI 渲染效果——通常是直接丢弃 stdout 的程序化封装。

## 快速上手

使用普通文件启用两个通道，运行 Qwen Code：

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

在第二个终端中持续读取事件流：

```bash
tail -f /tmp/qwen-events.jsonl
```

在第三个终端中向运行中的 TUI 推送提示词：

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

提示词会出现在 TUI 中，效果与用户直接输入完全相同，流式响应同步镜像到 `/tmp/qwen-events.jsonl`。

### 使用 FIFO（命名管道）输出事件

FIFO 比普通文件延迟更低（无磁盘 I/O），在同一主机上效果很好。bridge 以 `O_RDWR | O_NONBLOCK` 打开 FIFO，即使尚无读取方连接也**不会阻塞**——事件会在内核管道缓冲区中积累，直到读取方连接。

> **Note:** `--input-file` 需要使用普通文件（不支持 FIFO），因为监听器依赖 `stat.size` 检测新数据，而 FIFO 的 `stat.size` 始终为 0。

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI 立即启动——无需提前启动读取方。

# 在第二个终端中，随时连接即可：
cat /tmp/qwen-events.jsonl
```

如果始终没有读取方连接，内部缓冲区超过 1 MB 后 bridge 会自动禁用。TUI 继续正常运行。

## 输出事件 Schema

事件以 JSON Lines 格式发出（每行一个对象）。Schema 与非交互模式 `--output-format=stream-json` 所用的相同，且始终启用 `includePartialMessages`。

通道上的第一个事件始终为 `system` / `session_start`，在 bridge 构建时发出。可在任何其他事件到达之前，用它将通道与 session id 关联。

```jsonc
// 会话生命周期
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Assistant 轮次进行中的流式事件
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// 已完成的消息
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// 权限控制平面（仅在工具需要审批时出现）
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

无论决策是在 TUI 中（原生审批 UI）还是通过外部 `confirmation_response`（见下文）作出，`control_response` 都会发出。所有观察者均可看到最终结果。

## 输入命令 Schema

`--input-file` 接受两种命令格式：

```jsonc
// 向提示词队列提交用户消息
{ "type": "submit", "text": "What does this function do?" }

// 回复待处理的 control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

行为说明：

- `submit` 命令会进入队列。若 TUI 正在响应，命令会在 TUI 下次回到空闲状态时自动重试。
- `confirmation_response` 命令立即分发，不进入队列——工具调用处于阻塞状态，响应必须直接到达底层 `onConfirm` 处理器，不能等待任何 `submit` 命令先完成。
- 先批准工具的一方生效，另一方的迟到响应会被无害丢弃。
- 无法解析为 JSON 的行会被记录日志并跳过，不会停止监听器。

## 延迟说明

输入文件通过 `fs.watchFile` 以 500 ms 轮询间隔监听，因此远程 `submit` 的最坏情况往返延迟约为半秒。这是有意为之的设计：轮询在各平台和文件系统（包括 macOS / 网络挂载）上具有良好的可移植性，也符合该功能所针对的典型人机交互节奏。输出通道无需轮询——事件在 TUI 发出时同步写入。

## 故障模式

- **无效的 fd。** 若传入 `--json-fd` 的 fd 未打开，或为 0/1/2 之一，TUI 会向 `stderr` 打印警告并继续运行，不启用双输出。
- **无效的路径。** 若传入 `--json-file` 的文件无法打开，TUI 会打印警告并继续运行，不启用双输出。
- **消费方断开连接。** 若通道另一端的读取方退出（`EPIPE`），bridge 会静默禁用自身，TUI 继续运行。不会重试。
- **FIFO 缓冲区溢出。** 向没有读取方的 FIFO 写入时，事件会缓冲在内核管道（Linux 上约 64 KB）和 Node.js WriteStream 中。一旦管道满或内部缓冲区超过 1 MB，bridge 会禁用自身并关闭 fd。此情况下不会发出 `session_end`——消费方应将没有 `session_end` 就关闭的流视为异常终止。TUI 继续正常运行。
- **Adapter 异常。** 发出事件时抛出的任何异常都会被捕获、记录日志，并禁用 bridge。TUI 不会因双输出故障而崩溃。

## Spawn 示例

典型的内嵌父进程同时启用两个通道来启动 Qwen Code：

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

TUI 仍通过 stdio 0/1/2 占用用户终端，内嵌方通过 fd 3 背后的文件读取结构化事件，并通过向 `/tmp/qwen-input.jsonl` 追加 JSONL 行来推送命令。

## 基于 Settings 的配置

对于长期运行的内嵌方，每次启动时都传入 CLI flag 往往不够方便。同样的通道可以在 `settings.json` 的顶级 `dualOutput` 键下配置：

```jsonc
// ~/.qwen/settings.json  （用户级别）
// 或 <workspace>/.qwen/settings.json  （工作区级别）
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

优先级规则：

- CLI flag **优先**于 settings。命令行传入 `--json-file /foo` 会覆盖 settings 中的 `dualOutput.jsonFile`。
- `--json-fd` 没有对应的 settings 项——fd 传递是 spawn 时的关切，无法静态声明。
- 若 flag 和 settings 均未设置，双输出保持禁用状态（与当前默认行为完全相同）。

`requiresRestart: true` 标志意味着修改仅在下次启动 Qwen Code 时生效，因为 bridge 在启动时只构建一次。

## 可运行的 Demo

以下每个脚本均可直接复制粘贴运行。建议从 POC&nbsp;1 开始，验证构建已包含双输出功能；POC&nbsp;4 是最接近真实 IDE 插件集成的示例。

### POC 1 — 观察事件流

在人工正常使用 TUI 期间，观察它发出的所有结构化事件：

```bash
# 终端 A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# 终端 B
qwen --json-file /tmp/qwen-events.jsonl
# ...正常对话；终端 A 会实时显示 session_start、
# user/assistant/result/control_request 等生命周期事件。
```

终端 A 中的第一行预期输出：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 从外部注入提示词

从第二个终端驱动 TUI，无需触碰第一个终端的键盘：

```bash
# 终端 A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# 终端 B——TUI 的响应效果与用户直接输入相同
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — 远程工具权限 bridge

从独立进程批准或拒绝工具调用：

```bash
# 终端 A——观察 control_request
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# 终端 B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# 让 Qwen 执行需要审批的操作，例如
# "run `ls -la /tmp`"，终端 A 中会出现 control_request。
# 复制 request_id，然后在第三个终端中执行：
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# TUI 中的确认提示会消失，工具随即执行。
```

若使用了未知的 `request_id`，bridge 会在输出通道上发出 `subtype: "error"` 的 `control_response`，供消费方记录或重试：

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

### POC 4 — Node 内嵌方（类 IDE）

最接近真实场景的形式：父进程启动 Qwen Code，持续读取事件，并按自身节奏注入提示词。

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

// 持续读取输出通道。生产环境中应使用基于字节偏移的 tail；
// 此处为简洁起见从头重新读取。
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
    // 使用能力前先进行特性检测
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

// 2 秒后注入一条提示词，效果与用户输入相同
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

运行方式：

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI 在当前终端打开；embedder 将
# handshake、turn-end、session_end 事件记录到父进程的 stdout。
```

### POC 5 — 能力握手特性检测

旧版 Qwen Code 不会发出 `protocol_version`。将该字段视为可选项并进行特性检测：

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

### POC 6 — 以 session_end 作为正常终止信号

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // 刷新指标、关闭 WebSocket 等。
  }
});
```

若 TUI 在 `session_end` 之前崩溃，输出流会关闭（下次写入时产生 `EPIPE`）；内嵌方应同时处理这两种情况。

### POC 7 — 故障演练（验证 flag 不会破坏 TUI）

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI 仍正常启动。

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI 仍正常启动。

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs 报错: "--json-fd and --json-file are mutually exclusive."
# 进程在 TUI 启动前退出。

qwen --json-file /nonexistent/dir/x.jsonl
# stderr 警告；TUI 仍正常启动。
```

## 与 Claude Code 的关系

Claude Code 通过 `--print --output-format stream-json` 提供类似的 stream-json 事件格式，但仅限于非交互模式——没有等价的方式同时运行 TUI 和结构化 sidecar 通道。Dual Output 填补了这一空白。
