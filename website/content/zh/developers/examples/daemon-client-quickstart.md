# DaemonClient 快速入门 (TypeScript)

一个最小化的端到端示例：在另一个终端启动 `qwen serve` 守护进程，然后使用 SDK 的 `DaemonClient` 从 Node 脚本驱动它。另见：[守护进程模式用户指南](../../users/qwen-serve.md) 和 [HTTP 协议参考](../qwen-serve-protocol.md)。

## 设置

在一个终端中：

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02，每个守护进程在启动时绑定到一个工作区（当前 `cwd`，或通过 `--workspace /path/to/dir` 覆盖）。守护进程的绑定路径会通过 `/capabilities.workspaceCwd` 广播，因此客户端可以预先检查，并在 `POST /session` 中省略 `cwd`。

在另一个终端中：

```bash
npm install @qwen-code/sdk
```

## Hello 守护进程

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): 当省略 `token` 时，DaemonClient 会自动回退到
  // `process.env.QWEN_SERVER_TOKEN` —— 与守护进程的 `--token` CLI 标志回退相同的环境变量。
  // 因此可以：
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # 一次性
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # 用户管理的文件
  //   const client = new DaemonClient({ baseUrl: '...' });
  // 或者当你有不同的环境变量名时显式传入：
  //   token: process.env.MY_TOKEN,
});

// 1. 确认可以连接到守护进程，根据其功能控制 UI，并
//    读取守护进程绑定的工作区 (#3803 §02)。
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
console.log('Daemon workspace:', caps.workspaceCwd); // 规范绑定路径

// 2. 生成或附加到会话。两种同样有效的写法：
//    (a) 显式传入 `workspaceCwd: caps.workspaceCwd`，或
//    (b) 完全省略 `workspaceCwd` —— 此时 SDK 不会发送 `cwd` 字段，
//        守护进程路由会回退到其绑定的工作区。写法 (b) 更简洁，
//        但前提是你信任 `caps.workspaceCwd` 就是你想要的路径。
//    如果提供的 `workspaceCwd` 不为空且未能规范化为守护进程的绑定路径，
//    则会返回 `400 workspace_mismatch`（见下方"工作区不匹配"）。
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. 订阅事件流。传入 `lastEventId: 0` 以便守护进程从会话开始重放所有内容
//    —— 如果不这样做，在 `subscribeEvents()` 返回迭代器与底层 SSE 连接实际建立
//    （一次 fetch 往返）之间存在一个 TOCTOU 窗口，期间快速启动的代理可能会发出
//    事件，这些事件会进入每会话环形缓冲区，但不会流式传输给新的无游标订阅者。
//    `lastEventId: 0` 使重放缓冲区覆盖该间隙（以及之后的任何重连 —— 见下方）。
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. 发送提示词并等待完成。（操作顺序说明：即使 `prompt()` 在 SSE 握手完成前执行，
//    步骤 3 中的 `lastEventId: 0` 保证每个事件都会到达迭代器。）
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: '用一句话总结 src/main.ts。' }],
});
console.log('stop reason:', result.stopReason);

// 5. 关闭订阅以使脚本能够退出。
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
      // 关于先响应者语义，见下方"权限投票"。
      console.log('\n[需要权限]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[权限已解决]', event.data);
      break;
    case 'session_died':
      console.error('\n[代理崩溃]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## 工作区文件辅助方法

文件路由是基于工作区而非会话的，因此它们直接位于 `DaemonClient` 上：

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

`expectedHash` 是原始磁盘字节的 SHA-256 哈希。`mode: "replace"` 和 `editWorkspaceFile()` 需要它，以防止过时的客户端覆盖它们刚刚未读取的文件。即使是在回环地址上，写/编辑操作也需要 Bearer token 配置；在使用它们之前，请使用 `--token` 或 `QWEN_SERVER_TOKEN` 启动守护进程。

## 使用 `Last-Event-ID` 重连

如果你的客户端进程在会话中间重启，重放你错失的事件：

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // 从此 ID 之后恢复；undefined = 仅实时事件
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

守护进程在每个会话的环形缓冲区中保留最近的 8000 个事件；超出该窗口的间隙将无法重新传递。

## 权限投票

当代理请求运行工具的权限时，每个连接的客户端都会看到 `permission_request` 事件。**先响应者获胜** —— 一旦一个客户端投票，其他客户端在尝试对相同 `requestId` 投票时将收到 `404`。

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // 选择你想要的任何选项 —— `proceed_once`、`allow` 等。
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('另一个客户端先投票了；无需操作。');
  }
  break;
}
```

## 共享会话协作

指向**同一个守护进程**的两个客户端最终会位于同一个会话上。根据 #3803 §02，每个守护进程在启动时绑定到一个工作区，因此以 `qwen serve --workspace /work/repo`（或 `cd /work/repo && qwen serve`）启动的守护进程是两个客户端都连接的那个：

```ts
// 守护进程以 `qwen serve --workspace /work/repo` 启动，因此
// 两个客户端的 `caps.workspaceCwd === '/work/repo'`。

// 客户端 A（例如 IDE 插件）
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false —— A 生成了代理

// 客户端 B（例如同一台机器上的 Web UI）
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true —— B 加入了 A 的会话
console.log(a.sessionId === b.sessionId); // true
```

两个客户端看到相同的 `session_update` / `permission_request` 流。任何一个都可以发送提示词；它们按 FIFO 排队，符合代理的"每个会话一次只能有一个活动提示词"的保证。

## 工作区不匹配

如果 `workspaceCwd` 与守护进程绑定的工作区不匹配，`createOrAttachSession` 会拒绝，抛出 `DaemonHttpError`，状态码为 `400`，并带有结构化响应体：

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
        `该守护进程绑定到 ${body.boundWorkspace}，` +
          `而不是 ${body.requestedWorkspace}。请为该工作区启动一个单独的守护进程，` +
          `或将请求路由到正确的守护进程。`,
      );
    }
  }
}
```

多工作区部署在每个工作区运行一个守护进程，监听不同端口 —— 在 §02 下没有守护进程内部路由。编排器（或用户的启动器）根据客户端想要连接的项目选择正确的守护进程。

## 身份认证

当守护进程启动时使用了 token（任何非回环绑定都需要一个 token）：

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK 环境变量回退 (PR 27, v0.16-alpha)** —— 当 `token` 被省略时，`DaemonClient` 会自动从环境中读取 `QWEN_SERVER_TOKEN`，这与守护进程自身的 `--token` CLI 回退一致。因此，如果你的 shell 中设置了 `export QWEN_SERVER_TOKEN=...`，下面的代码等效于上面的：

```ts
// 效果等同于 token: process.env.QWEN_SERVER_TOKEN，但省去了样板代码。
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

回退机制会去除首尾空白字符（这对于 `export QWEN_SERVER_TOKEN="$(cat token.txt)"` 很方便，因为 `cat` 会添加一个换行符），并将空值或仅空白字符的值视为未设置（过时的 `export QWEN_SERVER_TOKEN=""` 不会意外地发送没有 token 的 `Authorization: Bearer `）。回退仅在构造时运行一次；之后对 `process.env` 的修改不会影响已构建的客户端。浏览器包（例如通过 `@qwen-code/webui`）会干净地得到 `undefined`，因为那里没有 `globalThis.process`。

错误的或缺失的 token 会返回带有统一响应体的 `401` —— SDK 在任何路由处理器返回 4xx/5xx 时抛出 `DaemonHttpError`。

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`守护进程错误 ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## 取消正在进行的提示词

如果用户按下了 Esc：

```ts
await client.cancel(session.sessionId);
// 在事件流中，你会看到提示词以 stopReason: "cancelled" 解析
```

Cancel 仅终止**当前活动**的提示词 —— 你已经 POST 过但仍在队列中等待的任何提示词将继续运行。（原因请参考协议参考。）

## 下一步

- [HTTP 协议参考](../qwen-serve-protocol.md) —— 包含状态码的完整路由规范
- [守护进程模式用户指南](../../users/qwen-serve.md) —— 操作员侧文档
- 源码：`packages/sdk-typescript/src/daemon/`