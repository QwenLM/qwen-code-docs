# Dual Output

Dual Output 是交互式 TUI 的一种 sidecar 模式：当 Qwen Code 继续在 `stdout` 上正常渲染时，它会并发地向一个独立的通道输出结构化的 JSON 事件流，以便外部程序（如 IDE 扩展、Web 前端、CI 流水线或自动化脚本）能够观察并控制会话。

它还提供了一个反向通道：外部程序可以将 JSONL 命令写入一个文件，TUI 会监听该文件，从而允许外部程序像人类在键盘前操作一样提交 prompt 并响应工具权限请求。

Dual Output 是完全可选的。当未提供以下标志时，TUI 的行为与之前完全一致，不会产生额外的 I/O 或行为变化。

## 使用场景

Dual Output 是一种底层的基础原语。它解锁了以下具体的集成场景：

### 终端 + Chat 双模式实时同步

这是核心使用场景。Web 或桌面 ChatUI 在 PTY 中托管 TUI，并通过结构化事件流渲染并行的对话视图：

- 用户可以在任意界面输入——TUI（适合终端原生高级用户）或 Web UI（提供更丰富的 UX、可分享链接、移动端支持）。由于所有消息都通过相同的 JSON 事件流转，两个视图始终保持同步。
- 工具审批提示会同时出现在两个位置；先审批的一方生效。
- 会话历史通过 `--json-file` 逐字捕获，因此服务器端拥有规范的可机器读取的转录文本，无需解析 ANSI。

### IDE 扩展（VS Code / JetBrains / Cursor / Neovim）

将 Qwen Code 嵌入 IDE。TUI 在编辑器的集成终端面板中运行，供需要的用户使用，同时扩展通过消费 `--json-fd` / `--json-file` 事件来驱动：

- 当 agent 修改文件时显示内联 diff 覆盖层。
- 带有格式化 Markdown、语法高亮工具调用和可点击引用的 webview 侧边栏。
- 状态栏指示器（思考中 / 响应中 / 等待审批）。
- 当用户点击原生 IDE 审批按钮时，以编程方式写入 `confirmation_response`。

### 基于浏览器的 Chat 前端

Node/Bun 服务器在 PTY 中生成 TUI 以利用其渲染语义，但向浏览器暴露 WebSocket 通道。`--json-file` 上的事件会被转发到客户端；用户在浏览器中输入的消息通过 `--input-file` 注入。两端均无需解析 ANSI。

### CI / 自动化观察者

CI 任务使用 task prompt 运行 Qwen Code。人类在任务日志中查看 TUI；CI 系统通过 tail `--json-file` 来：

- 如果 `result` 事件报告错误，则使任务失败。
- 将 `token usage` / `duration_ms` / `tool_use` 计数推送到指标系统。
- 将完整转录文本归档为构建产物。

### 多 Agent 编排

supervisor agent 生成多个 TUI worker，每个 worker 拥有独立的事件/输入文件对。它监控进度、注入后续 prompt，并通过批准或拒绝所有 worker 的工具调用来执行全局预算/安全策略。

### 会话录制、审计与回放

使用 `--json-file` 将每个 TUI 会话 tee 到常规文件。后续可：

- 合规审计可以精确重建执行内容。
- 自动化回归测试可以跨模型版本对比运行结果。
- 回放工具可以通过相同协议重新发射事件，以馈送可视化仪表盘。

### 可观测性仪表盘

将 `--json-file` 流式传输到 Loki / OTEL / 任何接受 JSONL 的管道。提取 `usage.input_tokens`、`tool_use.name`、`result.duration_api_ms` 作为 Grafana 中的一级指标。无需使用日志解析正则表达式。

### 测试与 QA

集成测试以 headless 模式生成 Qwen Code，使用 `--input-file` 脚本驱动它，并对 `--json-file` 事件进行断言。与解析 stdout ANSI 不同，断言在 UI 重构时保持稳定。

## 标志

| 标志                  | 类型             | 用途                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | 数字，`n >= 3` | 将结构化 JSON 事件写入文件描述符 `n`。调用方必须通过 spawn `stdio` 配置或 shell 重定向提供此 fd。 |
| `--json-file <path>`  | 路径             | 将结构化 JSON 事件写入文件。路径可以是常规文件、FIFO（命名管道）或 `/dev/fd/N`。                               |
| `--input-file <path>` | 路径             | 监听此文件，读取外部程序写入的 JSONL 命令。                                                                         |

`--json-fd` 和 `--json-file` 互斥。拒绝使用 fd 0、1 和 2，以防止破坏 TUI 自身的输出。

## 为什么需要两个输出标志？（`--json-fd` vs `--json-file`）

乍一看 `--json-fd` 似乎就足够了——调用方生成 Qwen Code 时附加一个额外的文件描述符，TUI 将事件写入其中，完成。但在实践中，fd 传递在最重要的嵌入场景下会失效：在伪终端（PTY）中运行 TUI。这就是为什么该功能也提供了基于路径的替代方案。

### `--json-fd` 何时有效

使用 `stdio` 数组的纯 `child_process.spawn`：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node 的 spawn 支持任意 `stdio` 条目；fd 3 会被子进程继承，子进程可以直接向其写入。零拷贝、零缓冲、零文件系统交互——这是最快的路径。

### 为什么 `--json-fd` 在 PTY 下**无效**

像 [`node-pty`](https://github.com/microsoft/node-pty) 和 [`bun-pty`](https://github.com/oven-sh/bun) 这样的 PTY 包装器是任何严肃的嵌入器（IDE 扩展、Web 终端、类 tmux 多路复用器）托管交互式 TUI 的方式。它们无法将额外的 fd 转发给子进程，原因有三：

1. **API 表面。** `node-pty.spawn(file, args, options)` 接受 `cwd`、`env`、`cols`、`rows`、`encoding` 等参数——但**没有 `stdio` 数组**。API 中根本没有地方可以声明“同时将此 fd 作为子进程中的 fd 3 附加”。`bun-pty` 暴露的接口形状相同。
2. **`forkpty(3)` 语义。** 在底层，PTY 包装器调用 `forkpty(3)`（或等效的 `posix_openpt` + `login_tty` 流程）。该系统调用分配主/从伪终端对，并将子进程的 fd 0/1/2 重定向到从端，使子进程认为它连接到了真实终端。父进程中大于 2 的任何 fd 都会被 `login_tty` 关闭，它在 `exec` 之前会对 `fd >= 3` 调用 `close(fd)`。额外的 fd 会被主动清除，而非继承。
3. **控制终端副作用。** 即使你通过 hack 方式传入了额外的 fd，它也不是终端，因此子进程的 TUI 渲染器（假设 fd 1 是 TTY 并写入转义序列）仍然需要从端来输出。你最终还是会得到两个独立的传输通道。

简而言之：一旦嵌入器需要真实的 TTY 来进行 TUI 渲染——这适用于每个 IDE 扩展、每个 Web 终端、每个桌面 Chat 应用——fd 继承就不可行了。

### `--json-file` 填补空白

文件路径作为普通的 CLI 参数传递，因此它能兼容所有生成模型：

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

子进程自行打开文件并向其中写入事件；嵌入器使用 `fs.watch` + 增量读取 tail 相同的路径。需要注意三点：

- **常规文件**、FIFO（命名管道）或 `/dev/fd/N` 均可工作。当两端位于同一主机时，FIFO 是延迟最低的选项。
- 桥接器使用 `O_NONBLOCK` 打开 FIFO，并在遇到 `ENXIO`（尚无读取器）时回退到阻塞模式，因此 PTY 启动时永远不会因等待消费者而死锁。
- 为了实现多会话隔离，请在 `$XDG_RUNTIME_DIR` 下使用每个会话独立的路径，或使用模式为 `0700` 的 `mkdtemp` 目录。

### 我应该使用哪个标志？

| 嵌入方式                                   | 使用                  |
| ------------------------------------------------- | -------------------- |
| 使用普通 stdio 的 `child_process.spawn`            | `--json-fd`          |
| `node-pty` / `bun-pty` / 任何 PTY 宿主             | `--json-file`        |
| Shell 重定向 / 手动管道测试       | 两者皆可               |
| CI 日志收集（常规文件，退出后读取） | `--json-file`        |
| 同一主机上的最低延迟              | `--json-file` + FIFO |

通用规则：**如果你需要 TUI 正确渲染，你就需要 PTY，这意味着你需要 `--json-file`。** `--json-fd` 适用于不关心 TUI 保真度的简单嵌入器——通常是无论如何都会丢弃 stdout 的编程包装器。

## 快速开始

启用所有三个通道运行 Qwen Code：

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

在第二个终端中，tail 事件流：

```bash
cat /tmp/qwen-events.jsonl
```

在第三个终端中，向运行中的 TUI 推送 prompt：

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

该 prompt 会像在 TUI 中由用户亲自输入一样出现，并且流式响应会镜像到 `/tmp/qwen-events.jsonl`。

## 输出事件 Schema

事件以 JSON Lines 格式发射（每行一个对象）。该 schema 与非交互式 `--output-format=stream-json` 模式使用的相同，且 `includePartialMessages` 始终启用。

通道上的第一个事件始终是 `system` / `session_start`，在构建桥接器时发射。在任何其他事件到达之前，使用它将通道与 session id 关联起来。

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
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

无论决策是在 TUI（原生审批 UI）中做出，还是由外部 `confirmation_response`（见下文）做出，都会发射 `control_response`。无论如何，所有观察者都能看到最终结果。

## 输入命令 Schema

`--input-file` 接受两种命令格式：

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

行为：

- `submit` 命令会被排队。如果 TUI 正忙于响应，它们会在 TUI 下次返回空闲状态时自动重试。
- `confirmation_response` 命令会立即分发且永不排队，因为工具调用是阻塞的，响应必须到达底层的 `onConfirm` 处理器，而无需等待任何更早的 `submit`。
- 哪一方先审批工具，哪一方就生效；另一方的延迟响应会被无害地丢弃。
- 无法解析为 JSON 的行会被记录并跳过——它们不会停止监听器。

## 延迟说明

输入文件通过 `fs.watchFile` 以 500 ms 的轮询间隔进行观察，因此远程 `submit` 的最坏情况往返延迟约为半秒。这是有意为之：轮询在跨平台和文件系统（包括 macOS / 网络挂载）时具有可移植性，并且符合该功能目标的 human-in-the-loop 节奏。输出通道没有轮询——事件在 TUI 发射时同步写入。

## 故障模式

- **错误的 fd。** 如果传递给 `--json-fd` 的 fd 未打开或是 0/1/2 之一，TUI 会向 `stderr` 打印警告并继续运行，不启用 dual output。
- **错误的路径。** 如果传递给 `--json-file` 的文件无法打开，TUI 会打印警告并继续运行，不启用 dual output。
- **消费者断开连接。** 如果通道另一端的读取器消失（`EPIPE`），桥接器会静默禁用自身，TUI 继续运行。不会重试。
- **适配器异常。** 发射事件时抛出的任何异常都会被捕获、记录并禁用桥接器。TUI 绝不会因 dual output 故障而崩溃。

## 生成示例

典型的嵌入父进程会生成带有两个通道的 Qwen Code：

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

TUI 仍然在 stdio 0/1/2 上拥有用户的终端，而嵌入器在 fd 3 支持的文件上读取结构化事件，并通过向 `/tmp/qwen-input.jsonl` 追加 JSONL 行来推送命令。

## 基于设置的配置

对于长期运行的嵌入器，在每次启动时传递 CLI 标志通常很不方便。相同的通道可以在 `settings.json` 的顶层 `dualOutput` 键下进行配置：

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

优先级规则：

- CLI 标志**优先于**设置。在命令行传递 `--json-file /foo` 会覆盖设置中的 `dualOutput.jsonFile`。
- `--json-fd` 没有等效的设置——fd 传递是生成时的关注点，无法静态声明。
- 如果既没有标志也没有设置，dual output 将保持禁用状态（与今天的默认行为相同）。

`requiresRestart: true` 标志意味着更改仅在下一次启动 Qwen Code 时生效，因为桥接器在启动期间只构建一次。

## 可运行演示

下面的每个脚本都可以直接复制粘贴运行。从 POC 1 开始验证构建是否包含 dual output；POC 4 最接近真实的 IDE 扩展集成。

### POC 1 — 观察事件流

观察人类正常使用 TUI 时发射的每个结构化事件：

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

终端 A 的预期第一行：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 从外部注入 prompt

从第二个终端驱动 TUI，无需触碰第一个终端的键盘：

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — 远程工具权限桥接

从单独的进程批准或拒绝工具调用：

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

如果你使用未知的 `request_id` 回复，桥接器会在输出通道上发射带有 `subtype: "error"` 的 `control_response`，以便你的消费者记录或重试：

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

### POC 4 — Node 嵌入器（类 IDE）

最接近实际的形态：父进程生成 Qwen Code，tail 事件，并按自己的节奏注入 prompt。

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

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
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
    // Feature-detect before using a capability
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

// After 2s, inject a prompt as if the user typed it
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
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — 能力握手特性检测

较旧版本的 Qwen Code 不会发射 `protocol_version`。将该字段视为可选并进行特性检测：

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

### POC 6 — 将 session_end 作为干净的终止信号

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

如果 TUI 在 `session_end` 之前崩溃，输出流会关闭（下次写入时触发 `EPIPE`）；嵌入器应同时处理这两种路径。

### POC 7 — 故障演练（证明标志永远不会破坏 TUI）

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## 与 Claude Code 的关系

Claude Code 在 `--print --output-format stream-json` 下暴露了类似的 stream-json 事件格式，但仅限于非交互模式——它没有同时运行 TUI 和结构化 sidecar 通道的等效功能。Dual Output 填补了这一空白。