# `qwen serve` 守护进程文件日志 — 设计

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **分支**: `feat/support_daemon_logger`
- **状态**: 设计已批准，等待实现计划
- **日期**: 2026-05-26

## 1. 问题

`qwen serve` 将守护进程级别的诊断信息（生命周期、路由错误、ACP 子进程 stderr）输出到 `process.stderr`。在 systemd/Docker 下这没问题，但对于 SDK/桌面/本地守护进程使用场景来说，它很脆弱：当客户端看到 `POST /session/:id/prompt` 返回 HTTP 500 时，路由、会话和堆栈上下文已经丢失，除非操作员手动重定向了 stderr。

`createDebugLogger`（位于 `packages/core/src/utils/debugLogger.ts`）是会话作用域的：它需要一个活动的 `DebugLogSession`，并写入 `${runtimeBaseDir}/debug/<sessionId>.txt`。serve 守护进程在任何会话存在之前就启动了，因此守护进程级别的调用会静默不执行。而且它无法在不改变每个会话 `debug/latest` 语义的情况下被复用。

本设计增加一个守护进程专属的文件输出，附加在已有的 stderr 行为之上，这样守护进程诊断信息无需 shell 重定向也能持久保存。

## 2. 范围

### 包含在范围内

- 一个新的日志记录器，每个 `runQwenServe` 进程初始化一次。
- 文件位于 `${QWEN_RUNTIME_DIR 或 ~/.qwen}/debug/daemon/<daemon-id>.log`，追加模式。
- 以下内容的多路输出：
  - `runQwenServe.ts` 生命周期/关闭/信号消息
  - `sendBridgeError`（`server.ts`）路由错误
  - `bridge.ts` `writeServeDebugLine`（当设置了 `QWEN_SERVE_DEBUG` 时）
  - `spawnChannel.ts` ACP 子进程 stderr 转发
- 通过 `QWEN_DAEMON_LOG_FILE=0|false|off|no` 选择退出。
- 守护进程目录中的 `latest` 符号链接，用于 `tail -f`。
- 在 serve CLI 文档中说明。

### 不在范围内（来自 issue 的非目标）

- 替换 OpenTelemetry 或添加守护进程追踪。
- 结构化企业级错误日志导出（issue #2014）。
- 轮转或删除现有会话调试日志。
- 守护进程日志本身的日志轮转/大小上限（推迟到后续 PR）。如果现有文件异常大，启动时会向 stderr 发出一次警告；不采取自动操作。

## 3. 架构

### 3.1 模块边界

| 层                                                              | 新增/修改    | 职责                                                                                                                             |
| --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                        | **新增**     | 输出：初始化、格式化、追加到文件、多路输出到 stderr、刷新、latest 符号链接                                                         |
| `packages/cli/src/serve/runQwenServe.ts`                        | 修改         | 启动时初始化日志记录器；将生命周期 `writeStderrLine` 替换为 `daemonLog.*`；关闭时 `await flush()`；将 `onDiagnosticLine` 传入 bridge |
| `packages/cli/src/serve/server.ts`                              | 修改         | `sendBridgeError(...)` 通过 `daemonLog.error(...)` 路由                                                                           |
| `packages/acp-bridge/src/types.ts`（`BridgeOptions`）           | 修改         | 添加可选的 `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void`                                       |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`         | 修改         | 如果注入了 `onDiagnosticLine`，则多路输出同一行                                                                                   |
| `packages/acp-bridge/src/spawnChannel.ts`                       | 修改         | 子进程 stderr 转发器将每一行前缀后多路输出到 `onDiagnosticLine`                                                                   |

**设计意图**：`daemonLogger.ts` 是单个文件、cli 本地、无全局单例。`acp-bridge` 对 cli 保持无感知——它只看到一个回调。依赖图不变。

### 3.2 无全局单例

日志记录器在 `runQwenServe` 中创建，通过闭包传递给需要它的内部 serve 模块（或通过回调传递给 `acp-bridge`）。理由：

- 与 `BridgeOptions` 已经注入依赖的方式一致。
- 避免 `debugLogger` 历史上遇到的跨测试状态泄漏（`resetDebugLoggingState()` 的存在就是为了这个原因）。

## 4. 守护进程 ID 和文件路径

- 路径：`Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - 解析为 `${QWEN_RUNTIME_DIR 或 ~/.qwen}/debug/daemon/<daemon-id>.log`。
  - 重用 `Storage.getGlobalDebugDir()`，因此运行时目录覆盖（环境变量、上下文相关）自动生效。
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` 用于区分同一 workspace 上的多个守护进程。
  - `workspaceHash` 长度固定、文件名安全，且对于同一 workspace 路径稳定。
- `latest` 符号链接：`~/.qwen/debug/daemon/latest` → 当前进程的日志文件。初始化时使用现有的 `updateSymlink` 辅助函数（`packages/core/src/utils/symlink.ts`）更新。符号链接失败会记录并忽略——不会降低主写入的质量。不同于 `${runtimeBaseDir}/debug/latest`（会话作用域），符合非目标。
- 文件模式：`'a'`（`O_APPEND | O_CREAT` 上的追加）。现有文件在重启后保留，用于取证。

## 5. 公开 API

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` 作为缩进的连续行追加在消息之后。
   * `err` 和 `ctx` 都是可选的且彼此独立。
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * 仅文件的多路输出，用于调用者已经写 stderr 的行
   *（ACP 子进程 stderr 转发器、`writeServeDebugLine`）。该行被
   * 追加到守护进程日志中，使用标准的 `<timestamp> [<LEVEL>] [DAEMON] `
   * 前缀；它不会再次输出到 stderr（那会导致操作员输出重复）。
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** 守护进程日志文件的绝对路径。 */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** 排空待处理的追加操作。由 runQwenServe 关闭处理程序调用。 */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // 默认 process.pid
  now?: () => Date; // 默认 () => new Date()
  stderr?: (line: string) => void; // 默认 writeStderrLine
  baseDir?: string; // 默认 Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` 同步执行：

1. 计算 `daemonId` 和日志路径。
2. `mkdirSync(parentDir, { recursive: true })` — 失败 → 返回无操作日志记录器，向 stderr 写一条警告。启动继续。
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — 同步写入 `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>`。同时作为可写性探测；如果遇到 EACCES/ENOSPC，失败模式 = 无操作日志记录器 + 一次 stderr 警告。
4. 更新 `latest` 符号链接（尽力而为，忽略错误）。
5. 返回日志记录器；后续的 `info/warn/error/raw` 调用将异步 `fs.promises.appendFile` 入队。

如果 `process.env['QWEN_DAEMON_LOG_FILE']` 是 `0|false|off|no` 之一，`initDaemonLogger` 在任何文件系统调用之前短路为一个无操作日志记录器。

## 6. 日志行格式

与 `debugLogger.buildLogLine` 视觉上一致：

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- 时间戳：ISO 8601，UTC。
- 级别：`INFO` | `WARN` | `ERROR`。（初始没有 DEBUG — `QWEN_SERVE_DEBUG` 通过 `raw()` 作为 `INFO` 流入。）
- 标签：字面 `DAEMON`。
- 追踪上下文：`trace.getActiveSpan()` 可用时；与 `debugLogger.getActiveSpanTraceContext` 相同逻辑。帮助函数提取到共享模块（`packages/core/src/utils/traceContext.ts`?）或本地复制 — 留到计划中。
- 上下文字段：渲染为 `key=value`，固定顺序（`route`、`sessionId`、`clientId`、`childPid`、`channelId`），然后其余键按字典顺序排序。包含空格或 `=` 的值用 `JSON.stringify` 引号括起来。
- 错误堆栈：作为缩进的连续行追加在消息之后。
- `raw(line, level)` 在标准前缀 `<timestamp> [<LEVEL>] [DAEMON] ` 之后按原样写入该行，不做额外处理。

**多路输出语义（重要）：**

- `info` / `warn` / `error` 同时写入守护进程日志文件 **和** stderr（通过注入的 `stderr` 写入器）。原先使用 `writeStderrLine(...)` 的调用者直接使用这些方法；不需要单独调用 stderr。
- `raw` 只写入 **文件**。由 ACP 子进程 stderr 转发器和 `writeServeDebugLine` 使用，这些调用者已经通过其现有路径写入 stderr。重复会导致操作员输出泛滥。

## 7. 启动/关闭流程

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // 启动横幅仅 stderr，避免行引用自身

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // 注入，用于 sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- 启动横幅仅 stderr（关于路径的行如果记录自身会造成循环）。
- `initDaemonLogger` 是同步的，因此任何失败在启动时立即可见，而不会在第一个错误后被埋没。
- 关闭时的 `flush()` 是 `process.exit` 之前的最后一个等待步骤。SIGKILL 按定义不可刷新 — 我们接受这一点。

## 8. 覆盖表

| 来源                                                              | 当前                                   | 之后                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` 生命周期/信号/配置警告                          | `writeStderrLine(...)`                 | `daemonLog.info \| warn(...)`（stderr 仍然发生 — `daemonLog` 多路输出）                          |
| `runQwenServe.ts` "listening on URL"（stdout）                    | `writeStdoutLine(...)`                 | 不变 — 操作员脚本解析 stdout                                                                     |
| `server.ts:sendBridgeError`                                       | `writeStderrLine(...)` 带 route/sessionId | `daemonLog.error(msg, err, { route, sessionId, ... })`（daemonLog 的多路输出仍然发送 stderr）    |
| `bridge.ts:writeServeDebugLine`（`QWEN_SERVE_DEBUG`）            | `writeStderrLine('qwen serve debug: ...')` | 多路输出到 `onDiagnosticLine(line, 'info')`                                                     |
| `spawnChannel.ts` 子进程 stderr                                    | `process.stderr.write(prefix + line + '\n')` | 同时 `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| `writeStdoutLine` 调用者                                         | 不变                                     | 不变                                                                                             |
| CLI 使用/argparse 错误（`runQwenServe` 早期验证）                | `writeStderrLine(...)`                 | 不变（日志记录器可能还不存在）                                                                   |

每个现有的 stderr 写入都被保留。守护进程日志是 **附加的**，从不替代。

## 9. 写入路径与刷新

- 内部队列：一个单一的 `Promise<void>` 链（`this.pending = this.pending.then(() => fs.promises.appendFile(...))`）。
- 每次 `info/warn/error/raw` 调用都会将追加操作入队（文件），对于 `info/warn/error`，还会同步调用注入的 `stderr` 写入器。
- stderr 写入顺序得到保留（同步，在追加入队之前）。文件追加在入队顺序上最终一致。
- 写入失败会设置内部 `degraded` 标志并向 stderr 发出一次性警告。后续调用仍会尝试写入，但不再维护计数器。
- `flush()` 返回当前的尾部 promise。
- 没有缓冲层：每次调用 = 一次 `appendFile`。流量很低（路由错误 + 生命周期）；微批处理是过早优化。

## 10. 配置

| 环境变量                                       | 行为                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`       | `initDaemonLogger` 返回无操作；多路输出无操作；stderr 不变                           |
| `QWEN_DAEMON_LOG_FILE=<任何其他值>` 或未设置   | 启用（默认）                                                                         |
| `QWEN_RUNTIME_DIR=<path>`                      | 移动 `~/.qwen` 根目录，守护进程日志随之移动（现有语义）                               |
| `QWEN_SERVE_DEBUG=1`                           | 现有 — `writeServeDebugLine` 激活；这些行现在也会多路输出到守护进程日志               |

`QWEN_DAEMON_LOG_FILE` 故意与 `QWEN_DEBUG_LOG_FILE` 分开，这样禁用每个会话的调试日志不会影响操作员的守护进程日志（反之亦然）。

## 11. 错误处理

- `initDaemonLogger` mkdir/open 失败 → 无操作日志记录器 + 一次 stderr 警告。守护进程启动继续。操作员在文件中看不到任何内容，但仍能收到 stderr。
- 每次追加失败 → 翻转 degraded 标志，向 stderr 发出一次警告，继续尝试。Issue 未提及降级模式的 UI 信号，因此无需公开表面。
- `flush()` 拒绝 → 在关闭处理程序中捕获，通过 `writeStderrLine` 记录。不阻止退出。
- `latest` 符号链接失败 → 被吞掉；主写入不受影响。

## 12. 测试

### `daemonLogger.test.ts`（新增）

- 沙盒化 `baseDir`，模拟 `now`、`pid`、`stderr`。
- 路径和守护进程 ID 推导，包括已知输入的 8 字符 `workspaceHash`。
- `latest` 符号链接在后续 `initDaemonLogger` 调用时在同一目录被创建和更新。
- 级别格式化（INFO/WARN/ERROR）、上下文字段顺序、错误堆栈延续。
- 存在活动 span 时的追踪上下文注入。
- `raw(line, level)` 按原样写入带前缀的行。
- `flush()` 仅在所有入队写入到达文件后才 resolve。
- `QWEN_DAEMON_LOG_FILE=0` → 不创建文件。
- `mkdir` 失败 → 无操作日志记录器，一次 stderr 警告，后续调用不抛出。
- `appendFile` 失败 → degraded 标志翻转，一次 stderr 警告。

### `runQwenServe.test.ts`（扩展）

- 启动时将 `daemon started ...` 行写入日志。
- 关闭处理程序在退出前等待 `daemonLog.flush()`。
- stderr 启动横幅包含守护进程日志路径。

### `server.test.ts`（扩展）

- 抛出的路由通过 `daemonLog.error(...)` 路由错误，并携带正确的 `route` 和 `sessionId`。

### acp-bridge 测试（扩展）

- 当 `QWEN_SERVE_DEBUG=1` 时，`onDiagnosticLine` 回调从 `writeServeDebugLine` 调用，以及从 `spawnChannel` 子进程 stderr 转发器调用。测试注入一个捕获 fake；无需文件系统。

## 13. 文档

- `docs/cli/serve.md`（或 serve 文档所在处）增加一个"守护进程日志文件"部分，涵盖：路径、守护进程 ID 格式、`latest` 符号链接、`QWEN_DAEMON_LOG_FILE` 选择退出、与每个会话的 `debug/<sessionId>.txt` 的区别。
- `packages/cli/src/serve/` 下的 README（如果存在）。
- 此仓库中没有 CHANGELOG 风格的文件；发布说明另行处理。

## 14. 回滚

- 纯附加性变更。回滚 = 还原提交：
  - 删除 `daemonLogger.ts` 及其测试。
  - 还原 `runQwenServe.ts` 生命周期 / sendBridgeError / bridge / spawnChannel 的更改。
  - 从 `BridgeOptions` 中移除 `onDiagnosticLine`。
- 无需清理磁盘状态；现有的守护进程日志文件成为孤儿但无害。

## 15. 验收标准（来自 issue）

| 标准                                                               | 如何满足                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `qwen serve` 无需 shell 重定向即可创建/追加守护进程日志            | `initDaemonLogger` 在启动时打开文件                                                              |
| 来自 `POST /session/:id/prompt` 的 HTTP 500 可在守护进程日志中关联  | `sendBridgeError` 写入 `route=` + `sessionId=`                                                   |
| ACP 子进程 stderr 行也出现在守护进程日志中                         | `spawnChannel` 通过 `onDiagnosticLine` 多路输出                                                  |
| 日志在第一个会话之前和所有会话关闭之后都能工作                     | 非会话作用域；存在于守护进程整个生命周期                                                         |
| 现有的 stderr 行为完整                                             | 所有写入都是附加的；没有 `writeStderrLine` 调用被移除而没有在适当位置留下等价物                 |
| 日志路径和选择退出选项已文档化                                     | §13 中的文档部分                                                                                 |

## 16. 开放问题

无阻塞性问题。可能的后续工作：

- `latest` 符号链接应该放在 `~/.qwen/debug/daemon/latest` 还是 `~/.qwen/debug/daemon-latest`？规范选择前者以保持目录整洁。
- 是否应该在未来提供 JSON 行输出作为标志（例如 `QWEN_DAEMON_LOG_FORMAT=json`）？此 PR 不涉及；结构化导出归属于 #2014。