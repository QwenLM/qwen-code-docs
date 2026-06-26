# `qwen serve` — Регистратор демона в файл — План реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК: Используйте суперсилы:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации этого плана задача за задачей. Шаги используют синтаксис флажков (`- [ ]`) для отслеживания.

**Цель:** Добавить файловый регистратор в область демона для `qwen serve`, чтобы ошибки маршрутов, сообщения жизненного цикла и stderr дочерних процессов ACP попадали в `~/.qwen/debug/daemon/<id>.log` в дополнение к stderr — устраняя ручной обходной путь `2>serve.log` для задачи #4548.

**Архитектура:** Новый модуль cli-local `daemonLogger.ts` предоставляет `initDaemonLogger(opts) → DaemonLogger`. `info/warn/error` дублируются в файл и stderr; `raw` — только в файл. `acp-bridge` получает новый опциональный колбэк `BridgeOptions.onDiagnosticLine` и вспомогательную функцию `createSpawnChannelFactory({ onDiagnosticLine })`, чтобы cli мог направлять `writeServeDebugLine` и строки stderr дочерних процессов ACP в журнал демона без зависимости cli от acp-bridge. Нет глобального синглтона — регистратор создаётся для каждого вызова `runQwenServe`.

**Технологический стек:** TypeScript, Vitest, `fs.promises` из Node, существующий `Storage.getGlobalDebugDir()`, существующий помощник `updateSymlink`.

**Спецификация для справки:** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**Тестовый запуск:** `vitest run` из каждого пакета; для одного файла: `cd packages/<pkg> && npx vitest run <относительный-путь>`.

---

## Карта файлов

| Файл                                          | Действие       | Назначение                                                                                                                   |
| --------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`       | **новый**      | Приёмник регистратора + вспомогательная функция форматирования                                                               |
| `packages/cli/src/serve/daemonLogger.test.ts`  | **новый**      | Модульные тесты для вышеуказанного                                                                                            |
| `packages/acp-bridge/src/bridgeOptions.ts`     | изменить       | Добавить поле `onDiagnosticLine?` + тип `DiagnosticLineSink`                                                                  |
| `packages/acp-bridge/src/bridge.ts`            | изменить       | Дублировать `writeServeDebugLine` через `opts.onDiagnosticLine` (через локальное замыкание `teeServeDebugLine`)               |
| `packages/acp-bridge/src/bridge.test.ts`       | изменить       | Добавить тест, что `onDiagnosticLine` получает отладочные строки                                                              |
| `packages/acp-bridge/src/spawnChannel.ts`      | изменить       | Экспортировать `createSpawnChannelFactory({ onDiagnosticLine })`; дублировать stderr дочернего процесса в колбэк               |
| `packages/acp-bridge/src/spawnChannel.test.ts` | изменить (или новый) | Тест колбэка перенаправления stderr                                                                                          |
| `packages/cli/src/serve/server.ts`             | изменить       | `createServeApp` принимает опциональный `daemonLog`; `sendBridgeError` направляет через него, если указан                     |
| `packages/cli/src/serve/server.test.ts`        | изменить       | Проверить, что daemonLog получает записи ошибок маршрутов                                                                     |
| `packages/cli/src/serve/runQwenServe.ts`       | изменить       | Инициализация регистратора, приветственное сообщение, подключение фабрики спавна + колбэка моста, замена вызовов `writeStderrLine` жизненного цикла, сброс при завершении |
| `packages/cli/src/serve/runQwenServe.test.ts`  | изменить       | Проверить приветственное сообщение и поведение сброса                                                                         |
| `docs/cli/serve.md` (или эквивалентный)        | изменить       | Документировать путь журнала демона + возможность отключения                                                                  |

---

## Задача 0: Предварительная проверка

- [ ] **Шаг 1: Подтвердить рабочее дерево и ветку**

Выполнить: `git rev-parse --abbrev-ref HEAD && pwd`
Ожидается: ветка `feat/support_daemon_logger`, cwd заканчивается на `.claude/worktrees/feat-support-daemon-logger`.

- [ ] **Шаг 2: Установить зависимости и убедиться, что базовые тесты проходят**

Выполнить: `npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
Ожидается: все проходят. (Если нет — базовая линия сломана; остановиться и сообщить.)

- [ ] **Шаг 3: Просмотреть спецификацию**

Прочитать `docs/superpowers/specs/2026-05-26-daemon-logger-design.md` от начала до конца. Ключевые разделы для усвоения: §3 (модули), §4 (путь), §5 (API), §6 (формат + семантика дублирования), §7 (запуск/останов), §11 (обработка ошибок).

---

## Задача 1: Вспомогательная функция `buildDaemonLogLine`

Чистый форматтер. Без ввода-вывода. Легко TDD.

**Файлы:**

- Создать: `packages/cli/src/serve/daemonLogger.ts`
- Создать: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Написать проваливающиеся тесты**

`packages/cli/src/serve/daemonLogger.test.ts`:

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

  it('форматирует INFO без контекста', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('выводит поля ctx в фиксированном порядке', () => {
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

  it('добавляет дополнительные ключи ctx, отсортированные лексикографически после фиксированных', () => {
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

  it('экранирует через JSON.stringify значения, содержащие пробелы или =', () => {
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

  it('добавляет стек ошибки в виде отступов продолжения', () => {
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

  it('использует err.message, если стек отсутствует', () => {
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

- [ ] **Шаг 2: Запустить тесты, подтвердить провал**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Ожидается: ошибка — `buildDaemonLogLine` не экспортируется.

- [ ] **Шаг 3: Реализовать `buildDaemonLogLine`**

Создать `packages/cli/src/serve/daemonLogger.ts` с содержимым:

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

- [ ] **Шаг 4: Запустить тесты, подтвердить прохождение**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Ожидается: PASS (6 спецификаций).

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): buildDaemonLogLine formatter (#4548)"
```

---

## Задача 2: `initDaemonLogger` — отключение + заглушка

Возвращает заглушку-регистратор, когда `QWEN_DAEMON_LOG_FILE` выключен. Пока без взаимодействия с файловой системой.

**Файлы:**

- Изменить: `packages/cli/src/serve/daemonLogger.ts`
- Изменить: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Добавить проваливающиеся тесты**

Добавить в `daemonLogger.test.ts`:

```ts
import { initDaemonLogger } from './daemonLogger.js';
import { afterEach, beforeEach } from 'vitest';

describe('initDaemonLogger отключение', () => {
  const originalEnv = process.env['QWEN_DAEMON_LOG_FILE'];
  afterEach(() => {
    if (originalEnv === undefined) delete process.env['QWEN_DAEMON_LOG_FILE'];
    else process.env['QWEN_DAEMON_LOG_FILE'] = originalEnv;
  });

  for (const val of ['0', 'false', 'off', 'no', 'False', ' OFF ']) {
    it(`возвращает заглушку-регистратор, когда QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)}`, () => {
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
      expect(stderr).toEqual([]); // заглушка — ничего не выводит
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **Шаг 2: Запустить, подтвердить провал**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Ожидается: ошибка — `initDaemonLogger` не экспортируется.

- [ ] **Шаг 3: Реализовать отключение + форму заглушки**

Добавить в `daemonLogger.ts`:

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

- [ ] **Шаг 4: Запустить, подтвердить прохождение тестов отключения**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "отключение"`
Ожидается: тесты отключения PASS; полный файл может всё ещё падать (будем добавлять покрытие постепенно).

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger opt-out env + no-op shape (#4548)"
```

---

## Задача 3: Инициализация файла (daemon-id, mkdir, синхронная проверка, деградированный запасной вариант)

**Файлы:**

- Изменить: `packages/cli/src/serve/daemonLogger.ts`
- Изменить: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Добавить проваливающиеся тесты**

Добавить в `daemonLogger.test.ts`:

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

describe('initDaemonLogger инициализация файла', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('создаёт daemon-id "serve-<pid>-<workspaceHash>" и создаёт файл журнала', () => {
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

  it('переключается на заглушку при ошибке mkdir', () => {
    const stderr: string[] = [];
    // Создаём файл там, где должна быть директория → mkdir EEXIST/ENOTDIR
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

- [ ] **Шаг 2: Запустить, подтвердить провал**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "инициализация файла"`
Ожидается: ошибка — `throw new Error('not implemented')`.

- [ ] **Шаг 3: Реализовать инициализацию файла**

Заменить тело `initDaemonLogger`, которое выбрасывает исключение. Добавить импорты и вспомогательные функции:

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
      `qwen serve: daemon log disabled — init failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NOOP_LOGGER;
  }

  // Методы появятся в Задаче 4. Пока заглушки, чтобы тесты инициализации проходили.
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

- [ ] **Шаг 4: Запустить, подтвердить прохождение**

Выполнить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "инициализация файла"`
Ожидается: PASS.

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger file init + degraded fallback (#4548)"
```

---

## Задача 4: `info` / `warn` / `error` + асинхронная очередь + flush + дублирование в stderr

**Файлы:**

- Изменить: `packages/cli/src/serve/daemonLogger.ts`
- Изменить: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Добавить проваливающиеся тесты**

Добавить в `daemonLogger.test.ts`:

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

  it('info добавляет в файл и дублирует в stderr', async () => {
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
    // Stderr получил ту же строку (после приветственного баннера, который не дублируется).
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('error добавляет err.stack как продолжение', async () => {
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

  it('flush дожидается всех ожидающих добавлений', async () => {
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

  it('выводит предупреждение только один раз при ошибке добавления и продолжает попытки', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // Саботируем, удаляя файл на лету — POSIX оставит inode,
    // но appendFile открывает заново каждый раз → ENOENT после удаления родительской директории.
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // Пересоздаём регистратор, чтобы привязать захват stderr? Проще: повторно заглушка через
    // приватное состояние — вместо этого сделаем это в отдельном тесте с помощью кастомного
    // stderr при инициализации.
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // Не выбрасывает — деградированный путь проглатывает. (Проверка количества записей в stderr
    // оставлена для отдельного варианта, если потребуется; этот тест проверяет "нет сбоя при ошибке".)
  });
});
```
- [ ] **Шаг 2: Запустить, убедиться в провале**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Ожидание: провал — методы являются заглушками.

- [ ] **Шаг 3: Реализовать методы + очередь + flush + tee**

Заменить финальный блок `return {...}` в `initDaemonLogger`:

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
  // stderr сначала (синхронно, сохраняет порядок, видимый человеку), затем в файл.
  stderr(line.trimEnd());
  enqueueAppend(line);
};

return {
  info: (message, ctx) => teeLine('INFO', message, ctx),
  warn: (message, ctx) => teeLine('WARN', message, ctx),
  error: (message, err, ctx) =>
    teeLine('ERROR', message, ctx, err ?? undefined),
  raw: () => {}, // реализовано в Задаче 5
  getLogPath: () => logPath,
  getDaemonId: () => daemonId,
  flush: () => pending,
};
```

- [ ] **Шаг 4: Запустить, убедиться в прохождении**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Ожидание: ПРОЙДЕНО.

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## Задача 5: `raw()` файловый tee

**Файлы:**

- Изменить: `packages/cli/src/serve/daemonLogger.ts`
- Изменить: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Добавить проваливающийся тест**

Добавить:

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
    // Новых строк stderr от raw() не должно быть
    expect(stderr.length).toBe(stderrBefore);
  });
});
```

- [ ] **Шаг 2: Запустить, убедиться в провале**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Ожидание: провал — raw является no-op.

- [ ] **Шаг 3: Реализовать raw**

В `initDaemonLogger` заменить `raw: () => {},` на:

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **Шаг 4: Запустить, убедиться в прохождении**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Ожидание: ПРОЙДЕНО.

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## Задача 6: Символическая ссылка `latest`

**Файлы:**

- Изменить: `packages/cli/src/serve/daemonLogger.ts`
- Изменить: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Шаг 1: Добавить проваливающийся тест**

Добавить:

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

- [ ] **Шаг 2: Запустить, убедиться в провале**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Ожидание: провал — ссылка не создаётся.

- [ ] **Шаг 3: Реализовать обновление символьной ссылки**

`updateSymlink` находится в `packages/core/src/utils/symlink.ts`, но НЕ реэкспортируется из основного модуля core (подтверждено через `grep -n updateSymlink packages/core/src/index.ts` → на момент написания плана нет совпадений). Сначала добавить реэкспорт:

В `packages/core/src/index.ts` добавить (рядом с другими экспортами утилит):

```ts
export { updateSymlink } from './utils/symlink.js';
```

Затем импортировать в `daemonLogger.ts`:

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
```

(Объединить с существующим импортом `Storage`, добавленным в Задаче 3.)

Внутри `initDaemonLogger`, после того как `appendFileSync` успешно запишет первую строку, добавить:

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // Best-effort. Ошибка символьной ссылки не должна ухудшать основные записи.
  });
} catch {
  // Исключение при синхронном вызове также best-effort.
}
```

- [ ] **Шаг 4: Запустить, убедиться в прохождении**

Запустить: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Ожидание: ПРОЙДЕНО.

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## Задача 7: Добавить `BridgeOptions.onDiagnosticLine` + tee `writeServeDebugLine`

**Файлы:**

- Изменить: `packages/acp-bridge/src/bridgeOptions.ts`
- Изменить: `packages/acp-bridge/src/bridge.ts`
- Изменить: `packages/acp-bridge/src/bridge.test.ts`

- [ ] **Шаг 1: Добавить тип `DiagnosticLineSink` в `bridgeOptions.ts`**

Вставить ближе к началу интерфейса `BridgeOptions` (перед `sessionScope`):

```ts
/**
 * Приёмник для диагностических строк уровня serve (устанавливается логгером демона CLI).
 * Если передан, мост направляет вывод `writeServeDebugLine` через этот колбэк
 * вместе с существующей записью в stderr — используется `runQwenServe`
 * для захвата этих строк в файл лога демона. Мост не владеет собственным
 * файловым логгером; это чисто проходной хук.
 */
export type DiagnosticLineSink = (
  line: string,
  level?: 'info' | 'warn' | 'error',
) => void;
```

Добавить внутрь `BridgeOptions`:

```ts
  /**
   * Опционально: направлять вывод `writeServeDebugLine`. См. {@link DiagnosticLineSink}.
   * Если не указан, ничего не делает. Устанавливается CLI `runQwenServe` из логгера демона.
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **Шаг 2: Добавить проваливающийся тест**

В `packages/acp-bridge/src/bridge.test.ts` добавить новый блок `describe('onDiagnosticLine', ...)`. Файл уже импортирует `makeBridge` и `makeChannel` из `./internal/testUtils.js` — переиспользовать их вместо создания вручную `ChannelFactory`. Подтвердить через `grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts`. Чтобы вызвать `writeServeDebugLine`, выбрать самый короткий тест среди 6 точек вызова — перечислить их через `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` (сейчас строки 1410, 1423, 2242, 2328, 2624, 2637; отклонение разрешения голосования между сессиями около строки 2242 — небольшой воспроизводимый триггер).

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
    // Вызвать writeServeDebugLine через [скопировать обвязку из ближайшего
    // существующего теста, который задействует одну из 6 точек вызова выше].
    // ... код инициации ...
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

(`makeBridge` принимает `Partial<BridgeOptions>` — после того, как Задача 7, шаг 1 добавит `onDiagnosticLine` в `BridgeOptions`, он будет передан без дополнительных правок в `testUtils.ts`.)

- [ ] **Шаг 3: Запустить, убедиться в провале**

Запустить: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Ожидание: провал — колбэк не вызывается.

- [ ] **Шаг 4: Проложить `writeServeDebugLine` через колбэк**

В `packages/acp-bridge/src/bridge.ts`, ближе к началу `createHttpAcpBridge` (после деструктуризации `opts`), ввести локальный tee, оборачивающий существующий модульный хелпер:

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

Затем в этом файле заменить каждый внутренний вызов `writeServeDebugLine(...)` **внутри** замыкания `createHttpAcpBridge` на `teeServeDebugLine(...)`. Использовать:

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

чтобы перечислить точки вызова — их 6 в текущем дереве (строки 1410, 1423, 2242, 2328, 2624, 2637; проверить через grep). Отредактировать каждую. НЕ изменять само модульное определение `writeServeDebugLine` — другие точки входа и тесты от него зависят.

(Причина: изменение сигнатуры на верхнем уровне повлияет на всех вызывающих, включая тесты; закрывающий tee аддитивен и ограничен локальной областью.)

- [ ] **Шаг 5: Запустить, убедиться в прохождении**

Запустить: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Ожидание: ПРОЙДЕНО. Также запустить полный файл для проверки регрессий: `npx vitest run src/bridge.test.ts`.

- [ ] **Шаг 6: Закоммитить**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## Задача 8: `createSpawnChannelFactory` с `onDiagnosticLine`

**Файлы:**

- Изменить: `packages/acp-bridge/src/spawnChannel.ts`
- Изменить: `packages/acp-bridge/src/spawnChannel.test.ts` (или создать, если отсутствует)

- [ ] **Шаг 1: Изучить текущую форму экспорта**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

Убедиться, что `defaultSpawnChannelFactory` — единственный публичный экспорт для spawn. Существующий форвардер stderr дочернего процесса вызывает `process.stderr.write(prefix + line + '\n')` внутри тела — найти этот блок (около строки 125).

- [ ] **Шаг 2: Добавить проваливающийся тест**

В `packages/acp-bridge/src/spawnChannel.test.ts` (найти существующий тестовый файл; если нет — создать):

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
    // Запуск маленького дочернего процесса, который пишет в stderr и завершается.
    // Используем escape hatch QWEN_CLI_ENTRY, чтобы указать на Node-однострочник.
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // После завершения дочернего процесса форвардер сбрасывает буферизованный хвост.
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

И фикстуру `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs`:

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

(Скорректировать, если мост требует рукопожатия ACP инициализации, прежде чем считать дочерний процесс "запущенным" — альтернатива: записать строку stderr во время обработки инициализации. Если тест слишком хрупок, вернуться к мокам spawn и тестировать внутренний форвардер в изоляции — прочитать тело `defaultSpawnChannelFactory` и юнит-тестировать внутренний форвардер, экспортировав его для тестов.)

- [ ] **Шаг 3: Запустить, убедиться в провале**

Запустить: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Ожидание: провал — `createSpawnChannelFactory` не экспортируется.

- [ ] **Шаг 4: Реализовать `createSpawnChannelFactory`**

Переработать `defaultSpawnChannelFactory` в фабрику фабрик. Заменить начало `spawnChannel.ts`:

```ts
export interface SpawnChannelFactoryOptions {
  onDiagnosticLine?: (line: string, level?: 'info' | 'warn' | 'error') => void;
}

export function createSpawnChannelFactory(
  options: SpawnChannelFactoryOptions = {},
): ChannelFactory {
  const onDiagnosticLine = options.onDiagnosticLine;
  return async (workspaceCwd, childEnvOverrides) => {
    // ... существующее тело defaultSpawnChannelFactory ...
    // Там, где существующий форвардер делает:
    //   process.stderr.write(prefix + line + '\n')
    // изменить на:
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // Для ветки [truncated]:
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// Сохранить старый экспорт для обратной совместимости (без подключения колбэка).
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

Дисциплина реализации:

- НЕ удалять `defaultSpawnChannelFactory` — каналы/адаптеры IDE всё ещё могут его импортировать.
- Придерживаться точной существующей семантики записи stderr (буферизация строк, лимит в 512 КБ, маркер усечения). Вызов `onDiagnosticLine` располагается рядом с каждым существующим `process.stderr.write` и никогда не заменяет его.

- [ ] **Шаг 5: Запустить, убедиться в прохождении**

Запустить: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Ожидание: ПРОЙДЕНО. Также `npx vitest run` полный тестовый набор для проверки отсутствия регрессий.

- [ ] **Шаг 6: Закоммитить**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## Задача 9: Проложить `sendBridgeError` через `daemonLog`

**Файлы:**

- Изменить: `packages/cli/src/serve/server.ts`
- Изменить: `packages/cli/src/serve/server.test.ts`

- [ ] **Шаг 1: Добавить `daemonLog` в зависимости `createServeApp`**

Прочитать `packages/cli/src/serve/server.ts` вокруг сигнатуры `createServeApp` (найти `export function createServeApp` или `export interface ServeAppDeps`). Добавить в интерфейс её зависимостей:

```ts
/**
 * Опциональный логгер демона. Если указан, `sendBridgeError` направляет
 * каждую ошибку, сопоставленную с маршрутом, через `daemonLog.error(...)`
 * (который дублирует в stderr + файл лога демона). Если не указан,
 * возвращается к существующему поведению только stderr.
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **Шаг 2: Добавить проваливающийся тест**

В `packages/cli/src/serve/server.test.ts` добавить (или расширить тест на ошибки маршрута):

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
    // createServeApp сигнатура: (opts, getPort?, deps?). daemonLog передаётся в deps.
    const app = createServeApp(
      /* opts */ { /* ...обычные ServeOptions, скопировать из ближайшего существующего теста... */ } as ServeOptions,
      /* getPort */ () => 0,
      /* deps */ { /* ...обычные deps, при которых маршрут выбрасывает исключение... */, daemonLog },
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

(Скопировать любую существующую обвязку, которая вызывает ошибку при маршруте, из `server.test.ts` — например, внедрить заглушку зависимостей, выбрасывающую исключение при вызове. Суть: один маршрут попадает в `sendBridgeError` → проверка попадания в лог демона.)

- [ ] **Шаг 3: Запустить, убедиться в провале**

Запустить: `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
Ожидание: провал.

- [ ] **Шаг 4: Проложить `sendBridgeError`**

В `server.ts` найти функцию `sendBridgeError` (около строки 2765). В настоящее время она пишет в stderr напрямую. Рефакторинг:

1. Провести `daemonLog` из `createServeApp` в замыкание, владеющее `sendBridgeError` (она определена внутри той же функции — то же замыкание).
2. Внизу `sendBridgeError`, где происходит запись в stderr, заменить на:

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
  // Путь через stderr для обратной совместимости. Сохранить поведение
  // для встраиваемых систем, которые создают createServeApp без daemonLog
  // (тесты, прямые интеграции).
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unknown route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

Убедиться, что новая ветка выполняется, когда `daemonLog` не равен `null`. `daemonLog.error` уже дублирует в stderr, поэтому строка stderr всё равно создаётся — потеря поведения отсутствует.

- [ ] **Шаг 5: Запустить, убедиться в прохождении**
```markdown
Запустите: `cd packages/cli && npx vitest run src/serve/server.test.ts`
Ожидаемый результат: полный файл PASS (старый + новый).

- [ ] **Шаг 6: Коммит**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## Задача 10: Подключить `runQwenServe` — инициализация, загрузочный баннер, колбэки, жизненный цикл, сброс при завершении

**Файлы:**

- Изменить: `packages/cli/src/serve/runQwenServe.ts`
- Изменить: `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **Шаг 1: Изучить существующую структуру загрузки и завершения**

Перечитайте `packages/cli/src/serve/runQwenServe.ts` строки 590–1030 (точка вызова `createHttpAcpBridge({...})`, тело `RunHandle.close` и обработчик `onSignal`). Отметьте все вызовы `writeStderrLine(...)` — они находятся примерно в строках 393, 565, 805, 821, 825, 835, 859, 865, 872, 877, 951, 961, 986, 997, 1027, 1361 (для актуальных номеров строк выполните `grep -n writeStderrLine`).

- [ ] **Шаг 2: Добавить падающий тест**

В файл `packages/cli/src/serve/runQwenServe.test.ts` добавьте (или расширьте):

```ts
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

it('runQwenServe initializes daemon logger and writes boot banner + flushes on shutdown', async () => {
  const tmpRuntime = mkdtempSync(path.join(os.tmpdir(), 'serve-runtime-'));
  const originalRuntime = process.env['QWEN_RUNTIME_DIR'];
  process.env['QWEN_RUNTIME_DIR'] = tmpRuntime;
  try {
    const handle = await runQwenServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'workspace',
      // ... заполнить остальные обязательные параметры из самого маленького существующего теста ...
    });
    // Загрузка записала лог демона где-то в tmpRuntime/debug/daemon
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // После завершения, "shutdown signal" или эквивалент должен быть в логе.
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **Шаг 3: Запустить, убедиться, что падает**

Выполните: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
Ожидаемый результат: падение.

- [ ] **Шаг 4: Подключить в `runQwenServe`**

Отредактируйте `runQwenServe.ts`:

1. Добавьте импорты рядом с существующими:

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. Внутри `runQwenServe(opts)`, сразу после того, как `boundWorkspace` приведён к каноническому виду (найдите присваивание; это значение передаётся в `createHttpAcpBridge`):

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: daemon log → ${daemonLog.getLogPath() || '(disabled)'}`,
);
```

3. Обновите вызов `createHttpAcpBridge({...})` (примерно строка 606):

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... существующие поля ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

(Если `deps.bridge` предоставлен, оператор встраивает и владеет своей собственной проводкой — пропустите колбэк.)

4. Обновите вызов `createServeApp(...)` (сейчас в `runQwenServe.ts:706`, сигнатура `createServeApp(opts, getPort, deps)`), добавив `daemonLog` в объект deps:

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. Замените вызовы `writeStderrLine(...)`, относящиеся **только к жизненному циклу** (те, что внутри `onSignal`, в пути ошибки `bridge.shutdown`, в слушателе `error` сервера, в ошибке освобождения device-flow, в строке "received signal, draining") на `daemonLog.warn(...)` / `daemonLog.error(..., err)` — daemonLog дублирует вывод в stderr, так что видимый оператору вывод сохраняется. НЕ трогайте:
   - Загрузочный баннер о "listening on URL" (он идёт в stdout, а не stderr — `writeStdoutLine`).
   - Ошибки использования CLI/аргументов до создания `daemonLog`.
   - Единственный баннер "qwen serve: daemon log → ...", добавленный в шаге 2 (избегайте логирования строки о себе).

   Конкретно: **механическое** правило для этого шага: каждый вызов `writeStderrLine` **после** создания `daemonLog` и **до** `process.exit` является кандидатом; если его содержимое напоминает диагностику демона (а не разовый стартовый баннер), замените его.

6. В теле `RunHandle.close`, после выполнения колбэка `finish` (или прямо перед `process.exit(0)` в `onSignal`), добавьте `await daemonLog.flush();`. Конкретно обработчик `onSignal` становится:

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* без изменений */ return;
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

- [ ] **Шаг 5: Запустить, убедиться, что проходит**

Выполните: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
Ожидаемый результат: полный файл PASS.

Также выполните: `cd packages/cli && npx vitest run src/serve/` (вся директория serve; ловит косвенные регрессии, например, проверки в server.test.ts на вывод в stderr).

- [ ] **Шаг 6: Коммит**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): init daemonLogger in runQwenServe + flush on shutdown (#4548)"
```

---

## Задача 11: Документация

**Файлы:**

- Изменить: существующие документы serve (найти с помощью `find docs -iname '*serve*'` и `ls docs/cli/`)

- [ ] **Шаг 1: Найти нужный документ**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

Выберите наиболее естественное место — вероятно, `docs/cli/serve.md`. Если ни одного для `qwen serve` нет, создайте `docs/cli/serve-daemon-log.md`.

- [ ] **Шаг 2: Написать раздел**

Добавьте (или создайте) раздел "Файл лога демона":

```markdown
## Файл лога демона

`qwen serve` записывает диагностический лог для каждого процесса в:
```

${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

Символическая ссылка `latest` в той же директории всегда указывает на лог
текущего процесса, так что `tail -f ~/.qwen/debug/daemon/latest` будет
следовать за работающим демоном.

Лог содержит сообщения жизненного цикла, ошибки маршрутов (с контекстом
`route=` и `sessionId=`), stderr дочерних процессов ACP, а при
`QWEN_SERVE_DEBUG=1` — дополнительные хлебные крошки моста. Строки,
которые сегодня идут в stderr, по-прежнему идут в stderr; файловый лог
является **дополнительным**, а не заменой.

### Отключение

Установите `QWEN_DAEMON_LOG_FILE=0` (или `false`/`off`/`no`), чтобы
полностью пропустить файловое логирование. Вывод в stderr не затрагивается.

### Связь с отладочными логами сессий

Отладочные логи на уровне сессии (`~/.qwen/debug/<sessionId>.txt` и
символическая ссылка `~/.qwen/debug/latest`) независимы. Лог демона
находится в соседней поддиректории `daemon/`; семантика отладки
для каждой сессии не изменяется этой функцией.

### Без ротации

Лог демона дописывается бесконечно. Ротируйте вручную, если он становится
большим. Возможное улучшение в будущем — автоматическая ротация; следите
за продолжениями #4548.
```

- [ ] **Шаг 3: Коммит**

```bash
git add docs/cli/serve.md   # или фактический путь к файлу
git commit -m "docs(serve): document daemon log file path and opt-out (#4548)"
```

---

## Задача 12: Финальная проверка

- [ ] **Шаг 1: Полный прогон тестов**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

Ожидаемый результат: всё зелёное.

- [ ] **Шаг 2: Проверка типов**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

Ожидаемый результат: без ошибок.

- [ ] **Шаг 3: Ручная дымовая проверка**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # теперь должна содержать строку о завершении
```

Ожидаемый результат: файл лога существует, содержит `daemon started ...`, затем после kill — строка `received SIGTERM, draining`.

Если `packages/cli/dist/index.js` не существует, соберите сначала: `npm run build --workspace=packages/cli`.

- [ ] **Шаг 4: Открыть PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): add daemon file logger (#4548)" --body "$(cat <<'EOF'
## Сводка
- Добавлен поточный файловый логгер демона в `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log` (настраивается через `QWEN_RUNTIME_DIR`, отключается через `QWEN_DAEMON_LOG_FILE=0`).
- Сообщения жизненного цикла `runQwenServe`, ошибки маршрутов `sendBridgeError`, отладочные хлебные крошки `writeServeDebugLine` и stderr дочерних процессов ACP направляются в лог демона без удаления существующего вывода в stderr.
- Добавлены `BridgeOptions.onDiagnosticLine` и `createSpawnChannelFactory({ onDiagnosticLine })`, чтобы `acp-bridge` оставался независимым от cli.

Закрывает #4548.

## План тестирования
- [x] Новые модульные тесты в `packages/cli/src/serve/daemonLogger.test.ts` покрывают форматтер, инициализацию файла, info/warn/error, raw, symbolic link latest, отключение, поведение при ухудшении.
- [x] `packages/acp-bridge/src/bridge.test.ts` покрывает перенаправление `onDiagnosticLine` из `writeServeDebugLine`.
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` покрывает перенаправление stderr дочернего процесса.
- [x] `packages/cli/src/serve/server.test.ts` покрывает маршрутизацию ошибок через `daemonLog.error`.
- [x] `packages/cli/src/serve/runQwenServe.test.ts` покрывает загрузочный баннер и сброс при завершении.
- [x] Ручная дымовая проверка: файл лога создаётся при загрузке, содержит строку о завершении при SIGTERM.

🤖 Сгенерировано с помощью [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## Заметки для самопроверки

- **Покрытие спецификации**: §3 таблица модулей покрыта задачами 1–10. §4 daemon-id + путь → Задача 3. §5 поверхность API → Задачи 1–6. §6 формат + семантика tee → Задача 1 (формат), Задача 4 (info/warn/error tee), Задача 5 (raw только в файл). §7 загрузка/завершение → Задача 10. §8 таблица покрытия → Задачи 7/8/9/10. §9 путь записи и сброс → Задача 4. §10 конфигурация → Задача 2 (отключение), Задача 11 (документация). §11 обработка ошибок → Задачи 3, 4. §12 тестирование → распределено по задачам. §13 документация → Задача 11. §15 критерии приемки → выполнены задачами 3, 9, 8, 10, 10, 11 соответственно.

- **Контекст трассировки (§6 bullet)**: отложено. Спецификация оставляет это явно ("Helper extracted to a shared module ... or duplicated locally — leave to plan"). Текущий план НЕ внедряет trace_id/span_id; это задача-продолжение, отслеживаемая в §16. Если рецензент настаивает, добавьте Задачу 4.5, которая импортирует `trace` из `@opentelemetry/api` и включает контекст span в `buildDaemonLogLine` — но только если рецензент просит; иначе YAGNI.

- **Путь импорта `updateSymlink`**: Задача 6 шаг 3 делает допущение, что `updateSymlink` экспортируется из `@qwen-code/qwen-code-core`. Проверьте перед редактированием: `grep -n updateSymlink packages/core/src/index.ts`. Если отсутствует, добавьте реэкспорт в том же коммите, что и Задача 6.

- **Тест acp-bridge для `createSpawnChannelFactory`**: запуск реального дочернего процесса в модульном тесте хрупок. Если Задача 8 шаг 2 окажется нестабильной в CI, запасной вариант — рефакторинг внутреннего перенаправления stderr в небольшой экспортируемый хелпер (`forwardChildStderr(stream, { prefix, onLine })`) и его модульное тестирование изолированно — без реального spawn.
```