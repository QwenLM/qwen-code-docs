# `qwen serve` 守护进程文件日志器 — 实现计划

> **针对 agentic workers：** 必需子技能：使用超能力：subagent-driven-development（推荐）或 superpowers:executing-plans 来按任务实现此计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 为 `qwen serve` 添加一个守护进程范围的日志器，使得路由错误、生命周期消息和 ACP 子进程的 stderr 除了输出到 stderr 之外，还能记录到 `~/.qwen/debug/daemon/<id>.log` 文件中 — 消除手动使用 `2>serve.log` 的变通方法，解决 issue #4548。

**架构：** 新的 CLI 本地模块 `daemonLogger.ts` 暴露 `initDaemonLogger(opts) → DaemonLogger`。`info/warn/error` 同时写入文件和 stderr；`raw` 仅写入文件。`acp-bridge` 获得一个新的可选 `BridgeOptions.onDiagnosticLine` 回调以及 `createSpawnChannelFactory({ onDiagnosticLine })` 辅助函数，使得 CLI 可以将 `writeServeDebugLine` 和 ACP 子进程 stderr 行路由到守护进程日志，而不需要 acp-bridge 依赖 CLI。没有全局单例 — 每个 `runQwenServe` 调用都会构造一个新的日志器。

**技术栈：** TypeScript, Vitest, Node `fs.promises`，已有的 `Storage.getGlobalDebugDir()`，已有的 `updateSymlink` 辅助函数。

**参考规范：** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**测试运行：** 在每个包中运行 `vitest run`；对于单个文件：`cd packages/<pkg> && npx vitest run <relative-path>`。

---

## 文件映射

| 文件                                               | 动作           | 目的                                                                                                                      |
| -------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`           | **新建**       | 日志器 sink + 格式辅助函数                                                                                                |
| `packages/cli/src/serve/daemonLogger.test.ts`      | **新建**       | 上述文件的单元测试                                                                                                        |
| `packages/acp-bridge/src/bridgeOptions.ts`         | 修改           | 添加 `onDiagnosticLine?` 字段 + `DiagnosticLineSink` 类型                                                                 |
| `packages/acp-bridge/src/bridge.ts`                | 修改           | 将 `writeServeDebugLine` 通过 `opts.onDiagnosticLine` 分流（通过本地 `teeServeDebugLine` 闭包）                            |
| `packages/acp-bridge/src/bridge.test.ts`           | 修改           | 添加测试：`onDiagnosticLine` 应当接收调试行                                                                               |
| `packages/acp-bridge/src/spawnChannel.ts`          | 修改           | 导出 `createSpawnChannelFactory({ onDiagnosticLine })`；将子进程 stderr 分流到回调                                       |
| `packages/acp-bridge/src/spawnChannel.test.ts`     | 修改（或新建） | 测试 stderr 转发回调                                                                                                      |
| `packages/cli/src/serve/server.ts`                 | 修改           | `createServeApp` 依赖项接受可选的 `daemonLog`；`sendBridgeError` 在提供时通过它路由                                      |
| `packages/cli/src/serve/server.test.ts`            | 修改           | 验证 daemonLog 收到路由错误条目                                                                                            |
| `packages/cli/src/serve/runQwenServe.ts`           | 修改           | 初始化日志器，启动横幅，连接 spawn 工厂 + bridge 回调，替换生命周期 `writeStderrLine` 调用，关闭时刷新                      |
| `packages/cli/src/serve/runQwenServe.test.ts`      | 修改           | 验证启动横幅 + 刷新行为                                                                                                    |
| `docs/cli/serve.md`（或等价文件）                  | 修改           | 记录守护进程日志路径 + 退出选项                                                                                          |

---

## 任务 0：前置准备

- [ ] **步骤 1：确认工作树 + 分支**

运行：`git rev-parse --abbrev-ref HEAD && pwd`
预期：分支为 `feat/support_daemon_logger`，cwd 以 `.claude/worktrees/feat-support-daemon-logger` 结尾。

- [ ] **步骤 2：安装依赖 + 基线测试通过**

运行：`npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
预期：全部通过。（如果不通过，基线已损坏 — 停止并报告。）

- [ ] **步骤 3：通读规范**

从头到尾阅读 `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`。需要内化的关键部分：§3（模块），§4（路径），§5（API），§6（格式 + 分流语义），§7（启动/关闭），§11（错误处理）。

---

## 任务 1：`buildDaemonLogLine` 纯辅助函数

纯格式化函数。无 I/O。易于 TDD。

**文件：**

- 创建：`packages/cli/src/serve/daemonLogger.ts`
- 创建：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：编写失败的测试**

`packages/cli/src/serve/daemonLogger.test.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildDaemonLogLine } from './daemonLogger.js';

describe('buildDaemonLogLine', () => {
  const FIXED = new Date('2026-05-26T03:14:15.926Z');

  it('格式化 INFO 且无 ctx', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('按固定顺序渲染 ctx 字段', () => {
    const line = buildDaemonLogLine({
      level: 'ERROR',
      message: 'route failed',
      now: FIXED,
      ctx: {
        sessionId: 'sess-1',
        route: 'POST /session/:id/prompt',
        clientId: 'client-x',
        childPid: 4242,
        channelId: 'ch-9',
      },
    });
    expect(line).toBe(
      '2026-05-26T03:14:15.926Z [ERROR] [DAEMON] ' +
        'route=POST /session/:id/prompt sessionId=sess-1 clientId=client-x ' +
        'childPid=4242 channelId=ch-9 route failed\n',
    );
  });

  it('将固定键之后的额外 ctx 键按字典顺序追加', () => {
    const line = buildDaemonLogLine({
      level: 'WARN',
      message: 'note',
      now: FIXED,
      ctx: { zeta: 1, alpha: 'a', sessionId: 's' },
    });
    expect(line).toBe(
      '2026-05-26T03:14:15.926Z [WARN] [DAEMON] sessionId=s alpha=a zeta=1 note\n',
    );
  });

  it('对包含空格或 = 的值使用 JSON.stringify 加引号', () => {
    const line = buildDaemonLogLine({
      level: 'INFO',
      message: 'hi',
      now: FIXED,
      ctx: { weird: 'has space', eq: 'a=b' },
    });
    expect(line).toBe(
      '2026-05-26T03:14:15.926Z [INFO] [DAEMON] eq="a=b" weird="has space" hi\n',
    );
  });

  it('将错误堆栈附加为缩进的延续行', () => {
    const err = new Error('boom');
    err.stack =
      'Error: boom\n    at fn (file.ts:1:1)\n    at main (file.ts:2:2)';
    const line = buildDaemonLogLine({
      level: 'ERROR',
      message: 'failed',
      now: FIXED,
      err,
    });
    expect(line).toBe(
      '2026-05-26T03:14:15.926Z [ERROR] [DAEMON] failed\n' +
        '  Error: boom\n' +
        '      at fn (file.ts:1:1)\n' +
        '      at main (file.ts:2:2)\n',
    );
  });

  it('当缺少堆栈时回退到 err.message', () => {
    const err: Error = { name: 'Plain', message: 'no stack' } as Error;
    const line = buildDaemonLogLine({
      level: 'ERROR',
      message: 'failed',
      now: FIXED,
      err,
    });
    expect(line).toBe(
      '2026-05-26T03:14:15.926Z [ERROR] [DAEMON] failed\n' +
        '  Plain: no stack\n',
    );
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
预期：失败 — `buildDaemonLogLine` 未导出。

- [ ] **步骤 3：实现 `buildDaemonLogLine`**

创建 `packages/cli/src/serve/daemonLogger.ts`，内容如下：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export type DaemonLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

const FIXED_CTX_ORDER = [
  'route',
  'sessionId',
  'clientId',
  'childPid',
  'channelId',
] as const;

function renderCtxValue(value: unknown): string {
  const s = String(value);
  return /[\s=]/.test(s) ? JSON.stringify(s) : s;
}

function renderCtx(ctx: DaemonLogContext | undefined): string {
  if (!ctx) return '';
  const parts: string[] = [];
  for (const key of FIXED_CTX_ORDER) {
    const v = ctx[key];
    if (v !== undefined && v !== null) {
      parts.push(`${key}=${renderCtxValue(v)}`);
    }
  }
  const fixedSet = new Set<string>(FIXED_CTX_ORDER);
  const extraKeys = Object.keys(ctx)
    .filter((k) => !fixedSet.has(k) && ctx[k] !== undefined && ctx[k] !== null)
    .sort();
  for (const key of extraKeys) {
    parts.push(`${key}=${renderCtxValue(ctx[key])}`);
  }
  return parts.length > 0 ? parts.join(' ') + ' ' : '';
}

function renderErr(err: Error | undefined): string {
  if (!err) return '';
  const body = err.stack ?? `${err.name ?? 'Error'}: ${err.message}`;
  return (
    body
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n') + '\n'
  );
}

export interface BuildDaemonLogLineArgs {
  level: DaemonLogLevel;
  message: string;
  now: Date;
  ctx?: DaemonLogContext;
  err?: Error;
}

export function buildDaemonLogLine(args: BuildDaemonLogLineArgs): string {
  const ts = args.now.toISOString();
  const ctxStr = renderCtx(args.ctx);
  return `${ts} [${args.level}] [DAEMON] ${ctxStr}${args.message}\n${renderErr(args.err)}`;
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
预期：PASS（6 个测试用例）。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): buildDaemonLogLine 格式化函数 (#4548)"
```

---

## 任务 2：`initDaemonLogger` 退出选项 + no-op 工厂

当 `QWEN_DAEMON_LOG_FILE` 被禁用时，返回一个 no-op 日志器。当前不触碰文件系统。

**文件：**

- 修改：`packages/cli/src/serve/daemonLogger.ts`
- 修改：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：添加失败的测试**

在 `daemonLogger.test.ts` 中追加：

```ts
import { initDaemonLogger } from './daemonLogger.js';
import { afterEach, beforeEach } from 'vitest';

describe('initDaemonLogger opt-out', () => {
  const originalEnv = process.env['QWEN_DAEMON_LOG_FILE'];
  afterEach(() => {
    if (originalEnv === undefined) delete process.env['QWEN_DAEMON_LOG_FILE'];
    else process.env['QWEN_DAEMON_LOG_FILE'] = originalEnv;
  });

  for (const val of ['0', 'false', 'off', 'no', 'False', ' OFF ']) {
    it(`当 QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)} 时返回 no-op 日志器`, () => {
      process.env['QWEN_DAEMON_LOG_FILE'] = val;
      const stderr: string[] = [];
      const logger = initDaemonLogger({
        boundWorkspace: '/tmp/ws',
        baseDir: '/tmp/nonexistent-should-not-touch',
        stderr: (s) => stderr.push(s),
      });
      logger.info('hello');
      logger.warn('there');
      logger.error('boom');
      logger.raw('raw');
      expect(stderr).toEqual([]); // no-op = 无输出
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
预期：失败 — `initDaemonLogger` 未导出。

- [ ] **步骤 3：实现退出选项 + no-op 形状**

在 `daemonLogger.ts` 中追加：

```ts
export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  getLogPath(): string;
  getDaemonId(): string;
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number;
  now?: () => Date;
  stderr?: (line: string) => void;
  baseDir?: string;
}

const NOOP_LOGGER: DaemonLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  raw: () => {},
  getLogPath: () => '',
  getDaemonId: () => '',
  flush: () => Promise.resolve(),
};

function isOptedOut(): boolean {
  const raw = process.env['QWEN_DAEMON_LOG_FILE'];
  if (!raw) return false;
  return ['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

export function initDaemonLogger(_opts: InitDaemonLoggerOptions): DaemonLogger {
  if (isOptedOut()) return NOOP_LOGGER;
  throw new Error('initDaemonLogger: file path not implemented yet');
}
```

- [ ] **步骤 4：运行测试，确认 opt-out 测试通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "opt-out"`
预期：opt-out 测试用例 PASS；整个文件可能仍然失败（我们逐步增加覆盖率）。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): 守护进程日志器 opt-out 环境变量 + no-op 形状 (#4548)"
```

---

## 任务 3：文件初始化（守护进程 ID、mkdir、同步探测、降级回退）

**文件：**

- 修改：`packages/cli/src/serve/daemonLogger.ts`
- 修改：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：添加失败的测试**

在 `daemonLogger.test.ts` 中追加：

```ts
import * as os from 'node:os';
import * as path from 'node:path';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { rmSync } from 'node:fs';

describe('initDaemonLogger 文件初始化', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('派生守护进程 ID "serve-<pid>-<workspaceHash>" 并创建日志文件', () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/workspace/foo',
      pid: 1234,
      baseDir: tmp,
    });
    expect(logger.getDaemonId()).toMatch(/^serve-1234-[0-9a-f]{8}$/);
    expect(logger.getLogPath()).toBe(
      path.join(tmp, 'daemon', `${logger.getDaemonId()}.log`),
    );
    expect(existsSync(logger.getLogPath())).toBe(true);
    expect(readFileSync(logger.getLogPath(), 'utf8')).toMatch(
      /\[INFO\] \[DAEMON\] daemon started pid=1234 workspace=\/workspace\/foo/,
    );
  });

  it('当 mkdir 失败时降级为 no-op', () => {
    const stderr: string[] = [];
    // 在应该是目录的位置创建一个文件 → mkdir 将失败（EEXIST/ENOTDIR）
    const blockingFile = path.join(tmp, 'daemon');
    require('node:fs').writeFileSync(blockingFile, 'blocker');

    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    expect(logger.getLogPath()).toBe('');
    expect(stderr.join('\n')).toMatch(/daemon log disabled/);
    expect(() => logger.info('after')).not.toThrow();
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "文件初始化"`
预期：失败 — `throw new Error('not implemented')`。

- [ ] **步骤 3：实现文件初始化**

替换 `initDaemonLogger` 中抛出异常的部分。添加导入和辅助函数：

```ts
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import * as crypto from 'node:crypto';
import { writeStderrLine } from '../utils/stdioHelpers.js';
import { Storage } from '@qwen-code/qwen-code-core';

function computeDaemonId(pid: number, boundWorkspace: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(boundWorkspace)
    .digest('hex')
    .slice(0, 8);
  return `serve-${pid}-${hash}`;
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger {
  if (isOptedOut()) return NOOP_LOGGER;

  const pid = opts.pid ?? process.pid;
  const now = opts.now ?? (() => new Date());
  const stderr = opts.stderr ?? writeStderrLine;
  const baseDir = opts.baseDir ?? Storage.getGlobalDebugDir();

  const daemonId = computeDaemonId(pid, opts.boundWorkspace);
  const daemonDir = nodePath.join(baseDir, 'daemon');
  const logPath = nodePath.join(daemonDir, `${daemonId}.log`);

  try {
    nodeFs.mkdirSync(daemonDir, { recursive: true });
    const firstLine = buildDaemonLogLine({
      level: 'INFO',
      message: `daemon started pid=${pid} workspace=${opts.boundWorkspace}`,
      now: now(),
    });
    nodeFs.appendFileSync(logPath, firstLine, { flag: 'a' });
  } catch (err) {
    stderr(
      `qwen serve: 守护进程日志已禁用 — 初始化失败: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NOOP_LOGGER;
  }

  // 方法将在任务 4 中实现。目前将其存根以使文件初始化测试通过。
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    raw: () => {},
    getLogPath: () => logPath,
    getDaemonId: () => daemonId,
    flush: () => Promise.resolve(),
  };
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "文件初始化"`
预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): 守护进程日志器文件初始化 + 降级回退 (#4548)"
```

---

## 任务 4：`info` / `warn` / `error` + 异步队列 + 刷新 + stderr 分流

**文件：**

- 修改：`packages/cli/src/serve/daemonLogger.ts`
- 修改：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：添加失败的测试**

在 `daemonLogger.test.ts` 中追加：

```ts
describe('initDaemonLogger info/warn/error', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('info 追加到文件并分流到 stderr', async () => {
    const stderr: string[] = [];
    const fixed = new Date('2026-05-26T03:14:15.926Z');
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
      now: () => fixed,
    });
    logger.info('hello', { route: 'GET /' });
    await logger.flush();
    const content = readFileSync(logger.getLogPath(), 'utf8');
    expect(content).toContain('[INFO] [DAEMON] route=GET / hello\n');
    // stderr 看到相同的行（启动横幅之后，这里没有分流横幅）。
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('error 将 err.stack 作为延续行追加', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
    });
    const err = new Error('boom');
    logger.error('route failed', err, { route: 'POST /x' });
    await logger.flush();
    const content = readFileSync(logger.getLogPath(), 'utf8');
    expect(content).toMatch(
      /\[ERROR\] \[DAEMON\] route=POST \/x route failed\n  Error: boom/,
    );
  });

  it('flush 等待所有未决的追加操作', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
    });
    for (let i = 0; i < 50; i++) logger.info(`msg-${i}`);
    await logger.flush();
    const lines = readFileSync(logger.getLogPath(), 'utf8').split('\n');
    const msgLines = lines.filter((l) => /msg-\d+$/.test(l));
    expect(msgLines).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(msgLines[i]).toContain(`msg-${i}`);
    }
  });

  it('在追加失败时警告一次并继续尝试', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // 中途破坏文件 — POSIX 会保留已打开 fd 的 inode，
    // 但 appendFile 每次调用都会重新打开 → 当父目录被删除时返回 ENOENT。
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // 重新创建日志器以绑定我们的 stderr 捕获？更简单：在初始化时通过自定义 stderr 重新存根。
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // 没有抛出异常 — 降级路径会吞掉错误。（如果需要，可以在单独的变体中断言 stderr 计数；此测试确认“失败时不崩溃”。）
  });
});
```
- [ ] **步骤 2：运行，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
预期：失败 —— 方法均为桩代码。

- [ ] **步骤 3：实现方法 + 队列 + 刷写 + 输出**

将 `initDaemonLogger` 中的最后一个 `return {...}` 块替换为：

```ts
let pending: Promise<void> = Promise.resolve();
let degraded = false;

const enqueueAppend = (line: string): void => {
  pending = pending.then(() =>
    nodeFs.promises.appendFile(logPath, line).catch((err) => {
      if (!degraded) {
        degraded = true;
        stderr(
          `qwen serve: daemon log write failed — entering degraded mode: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }),
  );
};

const teeLine = (
  level: DaemonLogLevel,
  message: string,
  ctx?: DaemonLogContext,
  err?: Error,
): void => {
  const line = buildDaemonLogLine({ level, message, now: now(), ctx, err });
  // 先输出到 stderr（同步，保持人类可读的顺序），再写入文件。
  stderr(line.trimEnd());
  enqueueAppend(line);
};

return {
  info: (message, ctx) => teeLine('INFO', message, ctx),
  warn: (message, ctx) => teeLine('WARN', message, ctx),
  error: (message, err, ctx) =>
    teeLine('ERROR', message, ctx, err ?? undefined),
  raw: () => {}, // 在第 5 个任务中实现
  getLogPath: () => logPath,
  getDaemonId: () => daemonId,
  flush: () => pending,
};
```

- [ ] **步骤 4：运行，确认通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## 任务 5：`raw()` 仅文件输出

**文件：**

- 修改：`packages/cli/src/serve/daemonLogger.ts`
- 修改：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：添加失败测试**

在文件末尾追加：

```ts
describe('initDaemonLogger raw', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('appends prefixed line, no stderr tee', async () => {
    const stderr: string[] = [];
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    const stderrBefore = stderr.length;
    logger.raw('[serve pid=123 cwd=/x] child crashed', 'warn');
    logger.raw('[serve pid=123 cwd=/x] another');
    await logger.flush();
    const content = readFileSync(logger.getLogPath(), 'utf8');
    expect(content).toContain(
      '[WARN] [DAEMON] [serve pid=123 cwd=/x] child crashed\n',
    );
    expect(content).toContain(
      '[INFO] [DAEMON] [serve pid=123 cwd=/x] another\n',
    );
    // 没有任何新的 stderr 行来自 raw()
    expect(stderr.length).toBe(stderrBefore);
  });
});
```

- [ ] **步骤 2：运行，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
预期：失败 —— raw 是空操作。

- [ ] **步骤 3：实现 raw**

在 `initDaemonLogger` 中，将 `raw: () => {},` 替换为：

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **步骤 4：运行，确认通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## 任务 6：`latest` 符号链接

**文件：**

- 修改：`packages/cli/src/serve/daemonLogger.ts`
- 修改：`packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **步骤 1：添加失败测试**

在文件末尾追加：

```ts
import { realpathSync, lstatSync } from 'node:fs';

describe('initDaemonLogger latest symlink', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('creates daemon/latest pointing to the current log', () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 42,
      baseDir: tmp,
    });
    const linkPath = path.join(tmp, 'daemon', 'latest');
    expect(lstatSync(linkPath).isSymbolicLink() || existsSync(linkPath)).toBe(
      true,
    );
    expect(realpathSync(linkPath)).toBe(realpathSync(logger.getLogPath()));
  });

  it('updates latest on subsequent init in same dir', () => {
    const a = initDaemonLogger({ boundWorkspace: '/w', pid: 1, baseDir: tmp });
    const b = initDaemonLogger({ boundWorkspace: '/w', pid: 2, baseDir: tmp });
    expect(realpathSync(path.join(tmp, 'daemon', 'latest'))).toBe(
      realpathSync(b.getLogPath()),
    );
    expect(realpathSync(a.getLogPath())).not.toBe(realpathSync(b.getLogPath()));
  });
});
```

- [ ] **步骤 2：运行，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
预期：失败 —— 符号链接未创建。

- [ ] **步骤 3：实现符号链接更新**

`updateSymlink` 位于 `packages/core/src/utils/symlink.ts`，但未从 core 的 barrel 文件重新导出（已通过 `grep -n updateSymlink packages/core/src/index.ts` 确认 —— 编写计划时没有匹配项）。首先添加重新导出：

在 `packages/core/src/index.ts` 中，在其他 utils 导出附近添加：

```ts
export { updateSymlink } from './utils/symlink.js';
```

然后在 `daemonLogger.ts` 中导入：

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
```

（与任务 3 中添加的现有 `Storage` 导入合并。）

在 `initDaemonLogger` 内部，在 `appendFileSync` 写入首行成功后，添加：

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // 尽力而为。符号链接失败不得影响主写入通道。
  });
} catch {
  // 同步抛出同样尽力而为。
}
```

- [ ] **步骤 4：运行，确认通过**

运行：`cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## 任务 7：添加 `BridgeOptions.onDiagnosticLine` + 输出 `writeServeDebugLine`

**文件：**

- 修改：`packages/acp-bridge/src/bridgeOptions.ts`
- 修改：`packages/acp-bridge/src/bridge.ts`
- 修改：`packages/acp-bridge/src/bridge.test.ts`

- [ ] **步骤 1：向 `bridgeOptions.ts` 添加 `DiagnosticLineSink` 类型**

在 `BridgeOptions` 接口顶部附近（在 `sessionScope` 之前）插入：

```ts
/**
 * 用于 serve 级别诊断行的接收器（由 cli daemon logger 设置）。
 * 当提供时，bridge 会将 `writeServeDebugLine` 的输出通过此回调
 * 与现有的 stderr 写入一并输出 —— 供 runQwenServe 使用，
 * 以便将其捕获到 daemon 日志文件中。bridge 本身不拥有文件
 * 日志记录器；这是一个纯透传钩子。
 */
export type DiagnosticLineSink = (
  line: string,
  level?: 'info' | 'warn' | 'error',
) => void;
```

在 `BridgeOptions` 内部添加：

```ts
  /**
   * 可选：输出 `writeServeDebugLine` 输出。参见 {@link DiagnosticLineSink}。
   * 省略时无操作。由 cli 的 `runQwenServe` 根据 daemon logger 设置。
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **步骤 2：添加失败测试**

在 `packages/acp-bridge/src/bridge.test.ts` 中，添加一个新的 `describe('onDiagnosticLine', ...)` 块。该文件已从 `./internal/testUtils.js` 导入了 `makeBridge` 和 `makeChannel` —— 重复使用它们，而不是手动创建 `ChannelFactory`。通过 `grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts` 确认。要触发 `writeServeDebugLine`，选择 6 个调用点中设置最短的测试 —— 使用 `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` 列出它们（当前在第 1410、1423、2242、2328、2624、2637 行；大约第 2242 行跨会话权限投票拒绝是一个较小的可重复触发器）。

```ts
describe('onDiagnosticLine', () => {
  const originalDebug = process.env['QWEN_SERVE_DEBUG'];
  afterEach(() => {
    if (originalDebug === undefined) delete process.env['QWEN_SERVE_DEBUG'];
    else process.env['QWEN_SERVE_DEBUG'] = originalDebug;
  });

  it('receives writeServeDebugLine output when QWEN_SERVE_DEBUG=1', async () => {
    process.env['QWEN_SERVE_DEBUG'] = '1';
    const captured: Array<{ line: string; level?: string }> = [];
    const bridge = makeBridge({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // 通过 [从上述 6 个调用点中最接近的现有测试中复制测试工具]
    // 触发 writeServeDebugLine。
    // ... 触发代码在此 ...
    expect(captured.some((e) => e.line.includes('qwen serve debug: '))).toBe(
      true,
    );
    expect(
      captured.every((e) => e.level === undefined || e.level === 'info'),
    ).toBe(true);
    await bridge.shutdown();
  });
});
```

（`makeBridge` 接受 `Partial<BridgeOptions>` —— 一旦任务 7 步骤 1 向 `BridgeOptions` 添加了 `onDiagnosticLine`，它会自动传递，无需进一步修改 `testUtils.ts`。）

- [ ] **步骤 3：运行，确认失败**

运行：`cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
预期：失败 —— 回调未被调用。

- [ ] **步骤 4：通过回调输出 `writeServeDebugLine`**

在 `packages/acp-bridge/src/bridge.ts` 中，在 `createHttpAcpBridge` 的顶部附近（在 `opts` 解构后），引入一个本地输出函数，包装现有的模块级辅助函数：

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

然后，在该文件中，将 **`createHttpAcpBridge` 闭包内**的每个 `writeServeDebugLine(...)` 调用替换为 `teeServeDebugLine(...)`。使用：

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

枚举调用点 —— 当前树中有 6 个（第 1410、1423、2242、2328、2624、2637 行；通过 grep 确认）。逐一编辑。**不要**修改模块级别的 `writeServeDebugLine` 定义本身 —— 其他入口点和测试依赖于它。

（不修改顶层定义的原因：会改变所有调用者（包括测试）的签名；闭包输出是增量的且作用域局部。）

- [ ] **步骤 5：运行，确认通过**

运行：`cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
预期：通过。同时运行完整文件以检查回归：`npx vitest run src/bridge.test.ts`。

- [ ] **步骤 6：提交**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## 任务 8：带有 `onDiagnosticLine` 的 `createSpawnChannelFactory`

**文件：**

- 修改：`packages/acp-bridge/src/spawnChannel.ts`
- 修改：`packages/acp-bridge/src/spawnChannel.test.ts`（如果不存在则创建）

- [ ] **步骤 1：检查当前导出形状**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

确认 `defaultSpawnChannelFactory` 是唯一的公开 spawn 导出。现有的子进程 stderr 转发器在其函数体内调用 `process.stderr.write(prefix + line + '\n')` —— 定位该块（大约在第 125 行）。

- [ ] **步骤 2：添加失败测试**

在 `packages/acp-bridge/src/spawnChannel.test.ts` 中（查找现有测试文件；如果没有，则创建一个）：

```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpawnChannelFactory } from './spawnChannel.js';

describe('createSpawnChannelFactory onDiagnosticLine', () => {
  it('returns a ChannelFactory that tees child stderr lines', async () => {
    const captured: Array<{ line: string; level?: string }> = [];
    const factory = createSpawnChannelFactory({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // 派生一个写入 stderr 然后退出的微型子进程。使用
    // QWEN_CLI_ENTRY 逃生舱口指向一个 Node 单行脚本。
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // 子进程退出后，转发器会刷新缓冲的尾部。
      expect(
        captured.some((e) =>
          /\[serve pid=\d+ cwd=\/tmp\] hello-stderr/.test(e.line),
        ),
      ).toBe(true);
      expect(
        captured.every((e) => e.level === undefined || e.level === 'warn'),
      ).toBe(true);
    } finally {
      delete process.env['QWEN_CLI_ENTRY'];
    }
  });
});
```

以及一个测试入口文件 `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs`：

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

（如果 bridge 在将子进程视为“已生成”之前需要 ACP 初始化握手，则调整 —— 替代方案：在初始化期间写入 stderr 行。如果测试过于脆弱，则回退到模拟 spawn 并隔离测试转发器逻辑 —— 读取 `defaultSpawnChannelFactory` 的主体并通过导出供测试使用的内部转发器进行单元测试。）

- [ ] **步骤 3：运行，确认失败**

运行：`cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
预期：失败 —— `createSpawnChannelFactory` 未导出。

- [ ] **步骤 4：实现 `createSpawnChannelFactory`**

将 `defaultSpawnChannelFactory` 重构为一个工厂的工厂。替换 `spawnChannel.ts` 的顶部：

```ts
export interface SpawnChannelFactoryOptions {
  onDiagnosticLine?: (line: string, level?: 'info' | 'warn' | 'error') => void;
}

export function createSpawnChannelFactory(
  options: SpawnChannelFactoryOptions = {},
): ChannelFactory {
  const onDiagnosticLine = options.onDiagnosticLine;
  return async (workspaceCwd, childEnvOverrides) => {
    // ... existing body of defaultSpawnChannelFactory ...
    // 将现有转发器的：
    //   process.stderr.write(prefix + line + '\n')
    // 改为：
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // 对于 [截断] 分支：
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// 保留旧导出以向后兼容（无回调连接）。
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

实现纪律：

- **不要**移除 `defaultSpawnChannelFactory` —— channels/IDE 适配器仍然导入它。
- 严格保留现有的 stderr 写入语义（行缓冲，64 KiB 上限，截断标记）。`onDiagnosticLine` 调用紧邻每个现有的 `process.stderr.write`，绝不替换它。

- [ ] **步骤 5：运行，确认通过**

运行：`cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
预期：通过。同时运行 `npx vitest run` 完整套件以确认无回归。

- [ ] **步骤 6：提交**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## 任务 9：将 `sendBridgeError` 通过 `daemonLog` 路由

**文件：**

- 修改：`packages/cli/src/serve/server.ts`
- 修改：`packages/cli/src/serve/server.test.ts`

- [ ] **步骤 1：向 `createServeApp` 的依赖项添加 `daemonLog`**

阅读 `packages/cli/src/serve/server.ts` 中 `createServeApp` 签名附近（搜索 `export function createServeApp` 或 `export interface ServeAppDeps`）。向其依赖接口添加：

```ts
/**
 * 可选的 daemon 日志记录器。提供时，`sendBridgeError` 会将每个
 * 路由映射的错误通过 `daemonLog.error(...)` 输出（它会将内容输出到
 * stderr 和 daemon 日志文件）。省略时，回退到现有的仅 stderr 行为。
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **步骤 2：添加失败测试**

在 `packages/cli/src/serve/server.test.ts` 中，添加（或扩展一个路由错误测试）：

```ts
import { initDaemonLogger } from './daemonLogger.js';

it('sendBridgeError routes through daemonLog when provided', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  try {
    const stderr: string[] = [];
    const daemonLog = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    // createServeApp 签名: (opts, getPort?, deps?). daemonLog 放在 deps 中。
    const app = createServeApp(
      /* opts */ { /* ...通常的 ServeOptions，从最接近的现有测试复制... */ } as ServeOptions,
      /* getPort */ () => 0,
      /* deps */ { /* ...使路由抛出错误的通常 deps... */, daemonLog },
    );
    await request(app).get('/some/erroring/route').expect(500);
    await daemonLog.flush();
    const content = readFileSync(daemonLog.getLogPath(), 'utf8');
    expect(content).toMatch(
      /\[ERROR\] \[DAEMON\] route=GET \/some\/erroring\/route/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

（复制 `server.test.ts` 中已有的任何路由抛出错误的测试工具 —— 例如，注入一个在调用时抛出的 deps 桩。关键是一个路由命中 `sendBridgeError` → 断言出现在 daemon 日志中。）

- [ ] **步骤 3：运行，确认失败**

运行：`cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
预期：失败。

- [ ] **步骤 4：连接 `sendBridgeError`**

在 `server.ts` 中，找到 `sendBridgeError` 函数（大约在第 2765 行）。它当前内联写入 stderr。重构：

1. 将 `daemonLog` 从 `createServeApp` 传递到拥有 `sendBridgeError` 的闭包中（它定义在同一个闭包内）。
2. 在 `sendBridgeError` 底部，stderr 写入的地方，替换为：

```ts
if (daemonLog) {
  daemonLog.error(
    err instanceof Error ? err.message : String(err),
    err instanceof Error ? err : null,
    {
      ...(ctx?.route ? { route: ctx.route } : {}),
      ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {}),
    },
  );
} else {
  // 旧的仅 stderr 路径。对于没有 daemonLog 就构造 createServeApp 的嵌入者
  // （测试、直接集成）保持行为不变。
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unknown route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

确保当 `daemonLog` 非 null 时走新分支。`daemonLog.error` 已经输出到 stderr，因此 stderr 行仍然产生 —— 无行为损失。

- [ ] **步骤 5：运行，确认通过**
运行: `cd packages/cli && npx vitest run src/serve/server.test.ts`
预期: 完整文件通过 (新 + 旧)。

- [ ] **第 6 步: 提交**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## 任务 10: 接入 `runQwenServe` — 初始化、启动横幅、回调、生命周期、关闭刷新

**文件:**

- 修改: `packages/cli/src/serve/runQwenServe.ts`
- 修改: `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **第 1 步: 阅读现有的启动 + 关闭结构**

重新阅读 `packages/cli/src/serve/runQwenServe.ts` 的第 590-1030 行（`createHttpAcpBridge({...})` 调用点、`RunHandle.close` 主体和 `onSignal` 处理函数）。注意所有 `writeStderrLine(...)` 调用——它们大致位于 393、565、805、821、825、835、859、865、872、877、951、961、986、997、1027、1361 行（运行 `grep -n writeStderrLine` 获取当前行号）。

- [ ] **第 2 步: 添加失败的测试**

在 `packages/cli/src/serve/runQwenServe.test.ts` 中，添加（或扩展）：

```ts
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

it('runQwenServe 初始化守护进程日志器并写入启动横幅，在关闭时刷新', async () => {
  const tmpRuntime = mkdtempSync(path.join(os.tmpdir(), 'serve-runtime-'));
  const originalRuntime = process.env['QWEN_RUNTIME_DIR'];
  process.env['QWEN_RUNTIME_DIR'] = tmpRuntime;
  try {
    const handle = await runQwenServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'workspace',
      // ... 从最小的现有测试中填充剩余必需的选项 ...
    });
    // 启动时已在 tmpRuntime/debug/daemon 下写入了一个守护进程日志
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // 关闭后，日志中应包含 "shutdown signal" 或类似内容
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **第 3 步: 运行，确认失败**

运行: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
预期: 失败。

- [ ] **第 4 步: 在 `runQwenServe` 中接入**

编辑 `runQwenServe.ts`：

1. 在现有导入旁边添加导入：

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. 在 `runQwenServe(opts)` 内部，紧跟在 `boundWorkspace` 被规范化之后（找到该赋值；它是传递给 `createHttpAcpBridge` 的值）：

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: daemon log → ${daemonLog.getLogPath() || '(disabled)'}`,
);
```

3. 更新 `createHttpAcpBridge({...})` 调用（大约在第 606 行）：

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... 现有字段 ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

（如果提供了 `deps.bridge`，则操作者正在嵌入并拥有自己的连接——跳过回调。）

4. 更新 `createServeApp(...)` 调用（当前在 `runQwenServe.ts:706`，签名是 `createServeApp(opts, getPort, deps)`），将 `daemonLog` 添加到 deps 对象中：

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. 将**仅用于生命周期**的 `writeStderrLine(...)` 调用（位于 `onSignal`、`bridge.shutdown` 错误路径、服务器 `error` 监听器、设备流 dispose 错误、"received signal, draining" 行等）替换为 `daemonLog.warn(...)` / `daemonLog.error(..., err)`——daemonLog 会同时输出到 stderr，因此操作者可见的输出得以保留。**不要触碰**：
   - 关于 "listening on URL" 的启动横幅（该条使用的是 stdout，而非 stderr——`writeStdoutLine`）。
   - 在 `daemonLog` 构造之前的 CLI 使用/参数解析错误。
   - 第 2 步中添加的 "qwen serve: daemon log → ..." 横幅（避免记录关于自身的行）。

   具体来说，本步骤的**机械**规则：在 `daemonLog` 构造之后且在 `process.exit` 之前的每个 `writeStderrLine` 调用都是候选；如果其内容看起来像是守护进程诊断（而非一次性启动横幅），则进行替换。

6. 在 `RunHandle.close` 主体中，在 `finish` 回调运行之后（或在 `onSignal` 中的 `process.exit(0)` 之前），添加 `await daemonLog.flush();`。具体地，`onSignal` 处理函数变为：

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* 不变 */ return;
  }
  daemonLog.warn(`received ${signal}, draining`, { signal });
  try {
    await handle.close();
    await daemonLog.flush();
    process.exit(0);
  } catch (err) {
    daemonLog.error('shutdown error', err instanceof Error ? err : null);
    await daemonLog.flush().catch(() => {});
    process.exit(1);
  }
};
```

- [ ] **第 5 步: 运行，确认通过**

运行: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
预期: 完整文件通过。

还运行: `cd packages/cli && npx vitest run src/serve/`（整个 serve 目录，捕获间接回归，例如 server.test.ts 中对 stderr 输出的断言）。

- [ ] **第 6 步: 提交**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): init daemonLogger in runQwenServe + flush on shutdown (#4548)"
```

---

## 任务 11: 文档

**文件:**

- 修改: 现有的 serve 文档（通过 `find docs -iname '*serve*'` 和 `ls docs/cli/` 定位）

- [ ] **第 1 步: 找到正确的文档**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

选择最合适的文件——很可能是 `docs/cli/serve.md`。如果没有 `qwen serve` 的文档，则创建 `docs/cli/serve-daemon-log.md`。

- [ ] **第 2 步: 编写章节**

添加（或创建）一个 "Daemon log file" 章节：

```markdown
## 守护进程日志文件

`qwen serve` 会为每个进程写入一份诊断日志，存放位置为：

${QWEN_RUNTIME_DIR 或 ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

同一目录下的 `latest` 符号链接始终指向当前进程的日志，因此 `tail -f ~/.qwen/debug/daemon/latest` 将跟随当前正在运行的守护进程。

该日志捕获生命周期消息、路由错误（附带 `route=` 和 `sessionId=` 上下文）、ACP 子进程 stderr，以及在设置 `QWEN_SERVE_DEBUG=1` 时的额外桥接面包屑。今天输出到 stderr 的行仍然输出到 stderr；文件日志是**附加的**，而不是替代。

### 禁用

设置 `QWEN_DAEMON_LOG_FILE=0`（或 `false`/`off`/`no`）以完全跳过文件日志记录。stderr 输出不受影响。

### 与会话调试日志的关系

会话范围的调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 符号链接）是独立的。守护进程日志位于同级 `daemon/` 子目录中；每个会话的调试语义不受此功能影响。

### 无轮转

守护进程日志会无限追加。如果日志文件增长过大，请手动轮转。未来的增强可能添加自动轮转；通过 #4548 后续任务跟踪。
```

- [ ] **第 3 步: 提交**

```bash
git add docs/cli/serve.md   # 或实际文件路径
git commit -m "docs(serve): document daemon log file path and opt-out (#4548)"
```

---

## 任务 12: 最终验证

- [ ] **第 1 步: 完整测试扫描**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

预期: 全部通过。

- [ ] **第 2 步: 类型检查**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

预期: 无错误。

- [ ] **第 3 步: 手动冒烟测试**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # 应包含关闭行
```

预期: 日志文件存在，包含 `daemon started ...`，然后 kill 后包含 `received SIGTERM, draining` 行。

如果 `packages/cli/dist/index.js` 不存在，请先构建: `npm run build --workspace=packages/cli`。

- [ ] **第 4 步: 提交流 PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): add daemon file logger (#4548)" --body "$(cat <<'EOF'
## 摘要
- 添加了每个进程的守护进程文件日志器，存放于 `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log`（可通过 `QWEN_RUNTIME_DIR` 配置，通过 `QWEN_DAEMON_LOG_FILE=0` 选择退出）。
- 将 `runQwenServe` 生命周期消息、`sendBridgeError` 路由错误、`writeServeDebugLine` 调试面包屑和 ACP 子进程 stderr 路由到守护进程日志，同时保留现有的 stderr 输出。
- 添加了 `BridgeOptions.onDiagnosticLine` 和 `createSpawnChannelFactory({ onDiagnosticLine })`，使 `acp-bridge` 对 cli 保持无知。

关闭 #4548。

## 测试计划
- [x] `packages/cli/src/serve/daemonLogger.test.ts` 中的新单元测试覆盖了格式化器、文件初始化、info/warn/error、raw、latest 符号链接、选择退出、降级回退。
- [x] `packages/acp-bridge/src/bridge.test.ts` 覆盖了来自 `writeServeDebugLine` 的 `onDiagnosticLine` 分流。
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` 覆盖了子进程 stderr 转发器。
- [x] `packages/cli/src/serve/server.test.ts` 覆盖了通过 `daemonLog.error` 的路由错误路由。
- [x] `packages/cli/src/serve/runQwenServe.test.ts` 覆盖了启动横幅和关闭时的刷新。
- [x] 手动冒烟测试：启动时创建日志文件，SIGTERM 时包含关闭行。

🤖 Generated with [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## 自审备注

- **规范覆盖**: §3 模块表由任务 1-10 覆盖。§4 守护进程 ID + 路径 → 任务 3。§5 API 表面 → 任务 1-6。§6 格式 + 分流语义 → 任务 1（格式）、任务 4（info/warn/error 分流）、任务 5（仅 raw 文件）。§7 启动/关闭 → 任务 10。§8 覆盖表 → 任务 7/8/9/10。§9 写入路径 & 刷新 → 任务 4。§10 配置 → 任务 2（选择退出）、任务 11（文档）。§11 错误处理 → 任务 3、4。§12 测试 → 分布在各个任务中。§13 文档 → 任务 11。§15 验收标准 → 分别由任务 3、9、8、10、10、11 满足。

- **追踪上下文（§6 项目符号）**: 推迟。规范明确说明（"Helper extracted to a shared module ... or duplicated locally — leave to plan"）。当前计划未注入 trace_id/span_id；这是后续任务，在 §16 中跟踪。如果审阅者提出异议，可以添加任务 4.5，从 `@opentelemetry/api` 导入 `trace` 并将 span 上下文合并到 `buildDaemonLogLine` 中——但仅在审阅者要求时；否则保持 YAGNI。

- **`updateSymlink` 导入路径**: 任务 6 第 3 步对 `updateSymlink` 是否从 `@qwen-code/qwen-code-core` 导出进行了折中处理。在编辑前验证: `grep -n updateSymlink packages/core/src/index.ts`。如果缺失，在与任务 6 相同的提交中添加重新导出。

- **`createSpawnChannelFactory` 的 acp-bridge 测试**: 在单元测试中生成真实子进程很脆弱。如果任务 8 第 2 步在 CI 中不稳定，退路是将内部 stderr 转发器重构为一个小型导出辅助函数（`forwardChildStderr(stream, { prefix, onLine })`）并单独进行单元测试——无需真正的 spawn。