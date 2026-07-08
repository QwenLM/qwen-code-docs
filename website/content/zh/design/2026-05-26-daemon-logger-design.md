# `qwen serve` 守护进程文件日志记录器 — 设计

- **议题**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **分支**: `feat/support_daemon_logger`
- **状态**: 设计已批准，等待实现计划
- **日期**: 2026-05-26

## 1. 问题

`qwen serve` 会将守护进程级别的诊断信息（生命周期、路由错误、ACP 子进程 stderr）输出到 `process.stderr`。这在 systemd/Docker 下可以正常工作，但对于 SDK / Desktop / 本地守护进程使用场景来说很脆弱：当客户端看到 `POST /session/:id/prompt` 返回 HTTP 500 时，除非运维人员手动重定向了 stderr，否则路由 + session + 堆栈上下文都会丢失。

`createDebugLogger`（位于 `packages/core/src/utils/debugLogger.ts`）是 session 作用域的：它需要一个活跃的 `DebugLogSession`，并写入 `${runtimeBaseDir}/debug/<sessionId>.txt`。serve 守护进程在任何 session 存在**之前**就已启动，因此守护进程级别的调用会静默失效（no-op）。如果不改变每个 session 的 `debug/latest` 语义，它也无法被复用。

本设计增加了一个特定于守护进程的文件 sink，作为现有 stderr 行为的补充，使得守护进程诊断信息无需 shell 重定向即可保留。

## 2. 范围

### 范围内

- 每个 `runQwenServe` 进程初始化一次的新日志记录器。
- 文件位于 `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`，追加模式。
- 分流（Tee）以下内容：
  - `runQwenServe.ts` 生命周期 / 关闭 / 信号消息
  - `sendBridgeError`（`server.ts`）路由错误
  - `bridge.ts` `writeServeDebugLine`（当设置了 `QWEN_SERVE_DEBUG` 时）
  - `spawnChannel.ts` ACP 子进程 stderr 转发
- 通过 `QWEN_DAEMON_LOG_FILE=0|false|off|no` 选择退出。
- 守护进程目录中的 `latest` 符号链接，用于 `tail -f`。
- serve CLI 文档中的相关说明。

### 范围外（issue 中的非目标）

- 替换 OpenTelemetry 或添加守护进程追踪。
- 结构化企业错误日志导出（issue #2014）。
- 现有 session 调试日志的轮转或删除。
- 守护进程日志本身的轮转 / 大小上限（推迟到后续 PR）。如果现有文件异常大，会在启动时发出 stderr 警告；不采取自动操作。

## 3. 架构

### 3.1 模块边界

| 层                                                   | 新增 / 更改 | 职责                                                                                                                                |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                | **新增**       | Sink：初始化、格式化、追加到文件、分流到 stderr、flush、latest 符号链接                                                                      |
| `packages/cli/src/serve/runQwenServe.ts`                | 更改       | 启动时初始化日志记录器；将生命周期 `writeStderrLine` 替换为 `daemonLog.*`；关闭时 `await flush()`；将 `onDiagnosticLine` 传入 bridge |
| `packages/cli/src/serve/server.ts`                      | 更改       | `sendBridgeError(...)` 通过 `daemonLog.error(...)` 路由                                                                                  |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)    | 更改       | 添加可选的 `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void`                                                 |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | 更改       | 如果注入了 `onDiagnosticLine`，则分流同一行                                                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`               | 更改       | 子进程 stderr 转发器将每个带前缀的行分流到 `onDiagnosticLine`                                                                        |

**设计意图**：`daemonLogger.ts` 是单文件、cli 局部的，没有全局单例。`acp-bridge` 保持对 cli 无感知——它只看到一个回调。依赖图不变。

### 3.2 无全局单例

日志记录器在 `runQwenServe` 中创建，通过闭包传递给需要它的内部 serve 模块（或通过回调传递给 `acp-bridge`）。理由：

- 镜像了 `BridgeOptions` 注入依赖的方式。
- 避免了 `debugLogger` 历史上遇到的跨测试状态泄漏问题（这也是 `resetDebugLoggingState()` 存在的原因）。

## 4. 守护进程 ID 与文件路径

- 路径：`Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - 解析为 `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`。
  - 复用 `Storage.getGlobalDebugDir()`，以便运行时目录覆盖（环境变量、上下文）自动生效。
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` 用于区分同一 workspace 上的多个守护进程。
  - `workspaceHash` 是固定长度、文件名安全且对同一 workspace 路径保持稳定的。
- `latest` 符号链接：`~/.qwen/debug/daemon/latest` → 当前进程的日志文件。在初始化时使用现有的 `updateSymlink` 辅助函数（`packages/core/src/utils/symlink.ts`）更新。符号链接失败会被记录并忽略——不会降低主要写入的可靠性。根据非目标，这与 `${runtimeBaseDir}/debug/latest`（session 作用域）不同。
- 文件模式：`'a'`（在 `O_APPEND | O_CREAT` 上追加）。现有文件在重启后保留以供取证。

## 5. 公共 API

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
   * `err.stack` is appended as indented continuation lines after the message.
   * Both `err` and `ctx` are optional and independent.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * File-only tee for lines whose caller is already writing to stderr
   * (ACP child stderr forwarder, `writeServeDebugLine`). The line is
   * appended to the daemon log under the standard `<timestamp> [<LEVEL>] [DAEMON] `
   * prefix; it is NOT echoed to stderr (which would double the operator's output).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Absolute path to the daemon log file. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Drain pending appends. Called from runQwenServe shutdown handler. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` 同步执行以下操作：

1. 计算 `daemonId` + 日志路径。
2. `mkdirSync(parentDir, { recursive: true })` — 失败 → 返回 no-op 日志记录器，写入一条 stderr 警告。启动继续。
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — 同步写入 `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>`。这同时作为可写性探测；遇到 EACCES/ENOSPC 时，失败模式 = no-op 日志记录器 + 一条 stderr 警告。
4. 更新 `latest` 符号链接（尽力而为，吞没错误）。
5. 返回日志记录器；后续的 `info/warn/error/raw` 调用会将异步 `fs.promises.appendFile` 加入队列。

如果 `process.env['QWEN_DAEMON_LOG_FILE']` 是 `0|false|off|no` 之一，`initDaemonLogger` 会在任何文件系统调用之前短路返回 no-op 日志记录器。

## 6. 日志行格式

镜像 `debugLogger.buildLogLine` 以保持视觉一致性：

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- 时间戳：ISO 8601，UTC。
- 级别：`INFO` | `WARN` | `ERROR`。（初始无 DEBUG —— `QWEN_SERVE_DEBUG` 通过 `raw()` 作为 `INFO` 流入。）
- 标签：字面量 `DAEMON`。
- 追踪上下文：可用时使用 `trace.getActiveSpan()`；与 `debugLogger.getActiveSpanTraceContext` 逻辑相同。辅助函数提取到共享模块（`packages/core/src/utils/traceContext.ts`？）或在本地复制——留给计划决定。
- 上下文字段：渲染为 `key=value`，固定顺序（`route`、`sessionId`、`clientId`、`childPid`、`channelId`），然后是按字典序排序的任何额外键。包含空格或 `=` 的值使用 `JSON.stringify` 加引号。
- 错误堆栈：作为缩进的续行附加在消息之后。
- `raw(line, level)` 在标准前缀 `<timestamp> [<LEVEL>] [DAEMON] ` 之后原样写入该行，不进行额外处理。

**分流语义（重要）：**

- `info` / `warn` / `error` 写入**守护进程日志文件和** stderr（通过注入的 `stderr` 写入器）。替换之前 `writeStderrLine(...)` 的调用者直接使用这些；无需单独的 stderr 调用。
- `raw` **仅写入文件**。由 ACP 子进程 stderr 转发器和 `writeServeDebugLine` 使用，调用者已经通过其现有路径写入 stderr。重复写入会淹没运维人员的输出。

## 7. 启动 / 关闭流程

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // boot banner is stderr-only to avoid the line referencing itself

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injected for sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- 启动横幅仅输出到 stderr（如果记录引用自身的路径行，会导致循环）。
- `initDaemonLogger` 是同步的，因此任何失败在启动时立即可见，而不是在第一个错误之后才被掩盖。
- 关闭时的 `flush()` 是 `process.exit` 之前最后一个 await 的步骤。根据定义，SIGKILL 是无法 flush 的——我们接受这一点。

## 8. 覆盖范围表

| 来源                                                        | 当前                                        | 更改后                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` 生命周期 / 信号 / 配置警告       | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)`（stderr 仍会发生 —— `daemonLog` 会分流）                          |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                       | 不变 —— 运维脚本解析 stdout                                                        |
| `server.ts:sendBridgeError`                                   | 带有 route/sessionId 的 `writeStderrLine(...)`  | `daemonLog.error(msg, err, { route, sessionId, ... })`（stderr 仍由 daemonLog 的分流发出） |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | 分流到 `onDiagnosticLine(line, 'info')`                                                          |
| `spawnChannel.ts` 子进程 stderr                                | `process.stderr.write(prefix + line + '\n')` | 同时 `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| `writeStdoutLine` 调用者                                     | 不变                                    | 不变                                                                                        |
| CLI 用法 / argparse 错误（`runQwenServe` 早期验证） | `writeStderrLine(...)`                       | 不变（日志记录器可能尚不存在）                                                             |
保留所有现有的 stderr 写入。Daemon 日志是**增量**的，绝不会替换原有内容。

## 9. 写入路径与 Flush

- 内部队列：单个 `Promise<void>` 链（`this.pending = this.pending.then(() => fs.promises.appendFile(...))`）。
- 每次调用 `info/warn/error/raw` 都会将追加操作（文件）入队，并且对于 `info/warn/error`，还会同步调用注入的 `stderr` 写入器。
- 保留 stderr 写入顺序（同步，在追加操作入队之前）。文件追加最终会按入队顺序保持一致。
- 写入失败会设置内部的 `degraded` 标志，并发出一次性的 stderr 警告。后续调用仍会尝试写入，但不再维护计数器。
- `flush()` 返回当前的尾部 promise。
- 无缓冲层：每次调用 = 一次 `appendFile`。写入量很低（路由错误 + 生命周期）；微批处理属于过早优化。

## 10. 配置

| 环境变量                                          | 行为                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`          | `initDaemonLogger` 返回空操作；tee 为空操作；stderr 保持不变                 |
| `QWEN_DAEMON_LOG_FILE=<其他值>` 或未设置          | 启用（默认）                                                                 |
| `QWEN_RUNTIME_DIR=<path>`                         | 重新定位 `~/.qwen` 根目录，daemon 日志随之移动（现有语义）                   |
| `QWEN_SERVE_DEBUG=1`                              | 现有功能 — 激活 `writeServeDebugLine`；日志行现在也会 tee 到 daemon 日志     |

`QWEN_DAEMON_LOG_FILE` 故意与 `QWEN_DEBUG_LOG_FILE` 分开，这样禁用单会话调试日志就不会影响运维人员的 daemon 日志（反之亦然）。

## 11. 错误处理

- `initDaemonLogger` mkdir/open 失败 → 空操作 logger + 一次 stderr 警告。Daemon 启动继续。运维人员在文件中看不到任何内容，但仍会收到 stderr 输出。
- 每次追加失败 → 翻转 degraded 标志，发出一次 stderr 警告，继续尝试。Issue 中未提及降级模式的 UI 信号，因此无需提供公开接口。
- `flush()` 拒绝 → 在 shutdown handler 中捕获，通过 `writeStderrLine` 记录。不会阻塞退出。
- `latest` 软链接失败 → 被吞没；主要写入不受影响。

## 12. 测试

### `daemonLogger.test.ts`（新增）

- 沙盒化 `baseDir`，mock `now`、`pid`、`stderr`。
- 路径和 daemon-id 推导，包括已知输入的 8 字符 `workspaceHash`。
- 在同一目录中后续调用 `initDaemonLogger` 时，创建并更新 `latest` 软链接。
- 级别格式化（INFO/WARN/ERROR）、上下文字段顺序、错误堆栈延续。
- 存在活跃 span 时注入 trace context。
- `raw(line, level)` 逐字写入带前缀的行。
- `flush()` 仅在所有入队的写入都落盘后才 resolve。
- `QWEN_DAEMON_LOG_FILE=0` → 不创建文件。
- `mkdir` 失败 → 空操作 logger，一次 stderr 警告，后续调用不抛出异常。
- `appendFile` 失败 → 翻转 degraded 标志，一次 stderr 警告。

### `runQwenServe.test.ts`（扩展）

- 启动时将 `daemon started ...` 行写入日志。
- Shutdown handler 在退出前 await `daemonLog.flush()`。
- stderr 启动 banner 包含 daemon 日志路径。

### `server.test.ts`（扩展）

- 抛出异常的路由通过 `daemonLog.error(...)` 路由错误，并带有正确的 `route` 和 `sessionId`。

### acp-bridge 测试（扩展）

- 当 `QWEN_SERVE_DEBUG=1` 时，从 `writeServeDebugLine` 调用 `onDiagnosticLine` 回调，并从 `spawnChannel` 子进程 stderr 转发器调用。测试注入一个用于捕获的 fake；不涉及文件系统。

## 13. 文档

- `docs/cli/serve.md`（或记录 serve 的任何位置）新增“Daemon log file”部分，涵盖：路径、daemon-id 格式、`latest` 软链接、`QWEN_DAEMON_LOG_FILE` 退出机制、与单会话 `debug/<sessionId>.txt` 的区别。
- 如果存在 `packages/cli/src/serve/` 下的 README，则进行更新。
- 本仓库中没有 CHANGELOG 风格的文件；发布说明单独处理。

## 14. 回滚

- 纯增量更改。回滚 = 还原 commit：
  - 删除 `daemonLogger.ts` 及其测试。
  - 还原 `runQwenServe.ts` 中的 lifecycle / sendBridgeError / bridge / spawnChannel 更改。
  - 从 `BridgeOptions` 中移除 `onDiagnosticLine`。
- 无需清理磁盘状态；现有的 daemon 日志文件会变成孤立文件，但无害。

## 15. 验收标准（来自 issue）

| 标准                                                                | 实现方式                                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `qwen serve` 无需 shell 重定向即可创建/追加 daemon 日志             | `initDaemonLogger` 在启动时打开文件                                                             |
| `POST /session/:id/prompt` 产生的 HTTP 500 可在 daemon 日志中关联   | `sendBridgeError` 写入 `route=` + `sessionId=`                                                  |
| ACP 子进程 stderr 行也记录在 daemon 日志中                          | `spawnChannel` 通过 `onDiagnosticLine` 进行 tee                                                 |
| 在第一个 session 之前和所有 session 关闭之后日志均有效              | 非 session 作用域；与 daemon 生命周期一致                                                       |
| 现有 stderr 行为保持不变                                            | 所有写入均为增量；移除 `writeStderrLine` 调用时均保留了等效替代                                 |
| 记录日志路径 + 退出机制                                             | §13 中的文档部分                                                                                |

## 16. 待定问题

无阻塞性问题。可能的后续跟进：

- `latest` 软链接应该放在 `~/.qwen/debug/daemon/latest` 还是 `~/.qwen/debug/daemon-latest`？规范选择前者以保持目录整洁。
- 我们是否应该提供 JSON-line 输出作为未来的 flag（例如 `QWEN_DAEMON_LOG_FORMAT=json`）？不在本 PR 范围内；结构化导出由 #2014 负责。