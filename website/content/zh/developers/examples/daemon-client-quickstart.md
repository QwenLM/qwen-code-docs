# DaemonClient 快速入门（TypeScript）

一个最简的端到端示例：在另一个终端启动 `qwen serve` 守护进程，然后通过 SDK 的 `DaemonClient` 从 Node 脚本驱动它。另请参阅：[守护进程模式用户指南](../../users/qwen-serve.md) 和 [HTTP 协议参考](../qwen-serve-protocol.md)。

## 配置

在一个终端中：

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02，每个守护进程在启动时绑定到一个工作空间（即当前 `cwd`，或通过 `--workspace /path/to/dir` 覆盖）。守护进程绑定的路径通过 `/capabilities.workspaceCwd` 对外公告，客户端可以预检查，并在 `POST /session` 时省略 `cwd`。

在另一个终端中：

```bash
npm install @qwen-code/sdk
```

## Hello daemon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): 省略 `token` 时，DaemonClient 会自动回退到
  // `process.env.QWEN_SERVER_TOKEN` — 与守护进程 `--token` CLI 标志
  // 的回退环境变量相同。因此可以：
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # 一次性生成
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # 用户管理文件
  //   const client = new DaemonClient({ baseUrl: '...' });
  // 或者在使用不同环境变量名时显式传入：
  //   token: process.env.MY_TOKEN,
});

// 1. 确认可以访问守护进程，根据其功能决定 UI 展示，并
//    读取守护进程绑定的工作空间（#3803 §02）。
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
console.log('Daemon workspace:', caps.workspaceCwd); // 规范化的绑定路径

// 2. 创建或附加会话。两种等效写法：
//    (a) 传入 `workspaceCwd: caps.workspaceCwd` 以明确指定，或
//    (b) 完全省略 `workspaceCwd` — SDK 则不发送 `cwd` 字段，
//        守护进程路由回退到其绑定的工作空间。
//        写法 (b) 更简洁，但假设你信任 `caps.workspaceCwd` 就是你想要的路径。
//    非空的 `workspaceCwd` 若无法规范化为守护进程绑定路径，
//    则返回 `400 workspace_mismatch`（见下方"工作空间不匹配"）。
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. 订阅事件流。传入 `lastEventId: 0` 让守护进程从会话开始重放所有事件 —
//    不传的话，`subscribeEvents()` 返回迭代器到底层 SSE 连接实际打开
//    之间存在 TOCTOU 窗口（一次 fetch 往返），在此期间快速启动的
//    agent 可能发出事件写入会话环形缓冲区，但不会流式传输给新建的
//    无游标订阅者。`lastEventId: 0` 让重放缓冲区覆盖这个间隙
//    （以及后续的重连 — 见下文）。
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. 发送提示并等待完成。（操作顺序说明：即使 `prompt()` 在 SSE
//    握手完成前触发，步骤 3 的 `lastEventId: 0` 也能保证每个事件
//    都进入迭代器。）
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Summarize src/main.ts in one sentence.' }],
});
console.log('stop reason:', result.stopReason);

// 5. 取消订阅，让脚本可以正常退出。
abort.abort();
await subscription;

function handleEvent(event: DaemonEvent): void {
  switch (event.type) {
    case 'session_update': {
      const data = event.data as {
        sessionUpdate: string;
        content?: { text?: string };
      };
      if (data.sessionUpdate === 'agent_message_chunk' && data.content?.text) {
        process.stdout.write(data.content.text);
      }
      break;
    }
    case 'permission_request':
      // 首响应者语义见下方"权限投票"。
      console.log('\n[needs permission]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[permission resolved]', event.data);
      break;
    case 'session_died':
      console.error('\n[agent crashed]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## 工作空间文件辅助方法

文件路由的作用域是工作空间，而非会话，因此它们直接挂载在 `DaemonClient` 上：

```ts
const file = await client.readWorkspaceFile('src/main.ts');

const updated = await client.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` 是磁盘上原始字节的 SHA-256 值。`mode: "replace"` 和 `editWorkspaceFile()` 都需要它，以防止过期客户端覆盖它未曾读取的文件。写入/编辑操作即使在回环地址上也需要 bearer token 配置；使用前请以 `--token` 或 `QWEN_SERVER_TOKEN` 启动守护进程。

## 通过 `Last-Event-ID` 重连

如果你的客户端进程在会话中途重启，可以重放错过的事件：

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // 从此 id 之后继续；undefined = 仅实时
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

守护进程在环形缓冲区中为每个会话保留最近 8000 个事件；超出该窗口的事件将无法重新传递。

## 权限投票

当 agent 请求运行某工具的权限时，每个已连接的客户端都会收到 `permission_request` 事件。**首响应者获胜** — 一旦某个客户端投票，其他客户端再尝试对同一 `requestId` 投票将收到 `404`。

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // 选择你想要的选项 — `proceed_once`、`allow` 等。
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Another client voted first; nothing to do.');
  }
  break;
}
```

## 共享会话协作

两个客户端连接到**同一守护进程**时，会进入同一个会话。根据 #3803 §02，每个守护进程在启动时绑定到**唯一**一个工作空间，因此以 `qwen serve --workspace /work/repo`（或 `cd /work/repo && qwen serve`）启动的守护进程就是两个客户端连接的目标：

```ts
// 守护进程以 `qwen serve --workspace /work/repo` 启动，因此
// 两个客户端的 `caps.workspaceCwd === '/work/repo'`。

// 客户端 A（例如 IDE 插件）
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A 创建了 agent

// 客户端 B（例如同一台机器上的 Web UI）
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B 加入了 A 的会话
console.log(a.sessionId === b.sessionId); // true
```

两个客户端收到相同的 `session_update` / `permission_request` 流。任意一方均可发送提示；它们按 agent 的"每会话同一时刻只有一个活跃提示"保证进行 FIFO 排队。

## 工作空间不匹配

如果 `workspaceCwd` 与守护进程绑定的工作空间不匹配，`createOrAttachSession` 会抛出 `DaemonHttpError`，状态码为 `400`，并携带结构化响应体：

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.createOrAttachSession({ workspaceCwd: '/some/other/project' });
} catch (err) {
  if (err instanceof DaemonHttpError && err.status === 400) {
    const body = err.body as {
      code?: string;
      boundWorkspace?: string;
      requestedWorkspace?: string;
    };
    if (body.code === 'workspace_mismatch') {
      console.error(
        `This daemon is bound to ${body.boundWorkspace}, ` +
          `not ${body.requestedWorkspace}. Start a separate daemon ` +
          `for that workspace, or route to the right one.`,
      );
    }
  }
}
```

多工作空间部署中，每个工作空间在独立端口上运行一个守护进程 — §02 下守护进程之间没有内部路由。编排器（或用户的启动器）根据客户端想要连接的项目选择正确的守护进程。

## 认证

当守护进程以 token 启动时（任何非回环绑定都需要 token）：

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK 环境变量回退（PR 27，v0.16-alpha）** — 省略 `token` 时，`DaemonClient` 会自动从环境变量中读取 `QWEN_SERVER_TOKEN`，与守护进程自身的 `--token` CLI 回退行为一致。因此，如果你的 shell 中已设置 `export QWEN_SERVER_TOKEN=...`，以下写法与上面等效：

```ts
// 与 token: process.env.QWEN_SERVER_TOKEN 效果相同，但无需样板代码。
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

回退会去除首尾空白字符（对 `export QWEN_SERVER_TOKEN="$(cat token.txt)"` 很实用，因为 `cat` 会添加换行符），并将空值/纯空白字符值视为未设置（过时的 `export QWEN_SERVER_TOKEN=""` 不会意外发送空的 `Authorization: Bearer `）。回退在构造时执行一次；之后修改 `process.env` 不会影响已创建的客户端。浏览器包（例如通过 `@qwen-code/webui`）会干净地得到 `undefined`，因为那里不存在 `globalThis.process`。

错误/缺失的 token 返回 `401` 及统一的响应体 — SDK 对路由处理器的任何 4xx/5xx 响应抛出 `DaemonHttpError`。

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Daemon error ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## 取消进行中的提示

如果用户按下 Esc：

```ts
await client.cancel(session.sessionId);
// 在事件流中，你将看到提示以 stopReason: "cancelled" 结束
```

取消只会终止**当前活跃**的提示 — 已经 POST 但还在队列中等待的提示仍会继续执行。（原因见协议参考。）

## 下一步

- [HTTP 协议参考](../qwen-serve-protocol.md) — 含状态码的完整路由规范
- [守护进程模式用户指南](../../users/qwen-serve.md) — 运维侧文档
- 源码：`packages/sdk-typescript/src/daemon/`
