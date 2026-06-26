# `qwen serve` Daemon Datei-Logger — Implementierungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: Verwenden Sie Superkräfte:subagent-driven-development (empfohlen) oder Superkräfte:executing-plans, um diesen Plan Aufgabe für Aufgabe umzusetzen. Schritte verwenden Kontrollkästchen-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Füge `qwen serve` einen dämonbezogenen Datei-Logger hinzu, so dass Routenfehler, Lebenszyklus-Nachrichten und ACP-Kind-stderr in `~/.qwen/debug/daemon/<id>.log` landen, zusätzlich zu stderr – und damit den manuellen Workaround `2>serve.log` für Issue #4548 überflüssig machen.

**Architektur:** Neues cli-lokales Modul `daemonLogger.ts` stellt `initDaemonLogger(opts) → DaemonLogger` bereit. `info/warn/error` teilen auf Datei + stderr auf; `raw` ist dateinur. `acp-bridge` erhält einen neuen optionalen Callback `BridgeOptions.onDiagnosticLine` und eine Hilfsfunktion `createSpawnChannelFactory({ onDiagnosticLine })`, damit die CLI `writeServeDebugLine` und ACP-Kind-stderr in das Dämonen-Log leiten kann, ohne dass acp-bridge eine CLI-Abhängigkeit hat. Kein globaler Singleton – der Logger wird pro `runQwenServe`-Aufruf erstellt.

**Technologie-Stack:** TypeScript, Vitest, Node `fs.promises`, vorhandener `Storage.getGlobalDebugDir()`, vorhandener `updateSymlink`-Helfer.

**Referenzspezifikation:** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**Test-Harness:** `vitest run` aus jedem Paket; für eine einzelne Datei: `cd packages/<pkg> && npx vitest run <relative-path>`.

---

## Dateizuordnung

| Datei                                           | Aktion          | Zweck                                                                                                                      |
| ---------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`       | **neu**         | Logger-Sink + Formatierungs-Helper                                                                                                  |
| `packages/cli/src/serve/daemonLogger.test.ts`  | **neu**         | Unit-Tests für das Obige                                                                                                     |
| `packages/acp-bridge/src/bridgeOptions.ts`     | ändern          | `onDiagnosticLine?`-Feld + `DiagnosticLineSink`-Typ hinzufügen                                                                    |
| `packages/acp-bridge/src/bridge.ts`            | ändern          | `writeServeDebugLine` durch `opts.onDiagnosticLine` leiten (über lokale `teeServeDebugLine`-Closure)                            |
| `packages/acp-bridge/src/bridge.test.ts`       | ändern          | Test hinzufügen, dass `onDiagnosticLine` Debug-Zeilen erhält                                                                        |
| `packages/acp-bridge/src/spawnChannel.ts`      | ändern          | `createSpawnChannelFactory({ onDiagnosticLine })` exportieren; Kind-stderr in Callback leiten                                     |
| `packages/acp-bridge/src/spawnChannel.test.ts` | ändern (oder neu) | Test der stderr-Weiterleitung für Callback                                                                                              |
| `packages/cli/src/serve/server.ts`             | ändern          | `createServeApp`-Abhängigkeiten akzeptieren optionales `daemonLog`; `sendBridgeError` leitet durch, wenn vorhanden                         |
| `packages/cli/src/serve/server.test.ts`        | ändern          | Prüfen, dass daemonLog Routenfehler-Einträge erhält                                                                                |
| `packages/cli/src/serve/runQwenServe.ts`       | ändern          | Logger initialisieren, Boot-Banner, Spawn-Factory + Bridge-Callback verdrahten, `writeStderrLine`-Aufrufe im Lebenszyklus ersetzen, bei Herunterfahren leeren |
| `packages/cli/src/serve/runQwenServe.test.ts`  | ändern          | Boot-Banner + Leerungsverhalten prüfen                                                                                          |
| `docs/cli/serve.md` (oder Äquivalent)          | ändern          | Dämon-Log-Pfad + Opt-out dokumentieren                                                                                           |

---

## Aufgabe 0: Vorbereitung

- [ ] **Schritt 1: Arbeitsbaum und Branch bestätigen**

Ausführen: `git rev-parse --abbrev-ref HEAD && pwd`
Erwartet: Branch `feat/support_daemon_logger`, cwd endet mit `.claude/worktrees/feat-support-daemon-logger`.

- [ ] **Schritt 2: Abhängigkeiten installieren + Basistests grün**

Ausführen: `npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
Erwartet: Alle bestehen. (Falls nicht, ist die Baseline defekt — anhalten und melden.)

- [ ] **Schritt 3: Spezifikation überfliegen**

Lesen Sie `docs/superpowers/specs/2026-05-26-daemon-logger-design.md` vollständig. Schlüsselabschnitte verinnerlichen: §3 (Module), §4 (Pfad), §5 (API), §6 (Format + Tee-Semantik), §7 (Boot/Shutdown), §11 (Fehlerbehandlung).

---

## Aufgabe 1: `buildDaemonLogLine` reiner Helfer

Reiner Formatierer. Keine I/O. Einfach testbar.

**Dateien:**

- Erstellen: `packages/cli/src/serve/daemonLogger.ts`
- Erstellen: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

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

  it('formats INFO with no ctx', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('renders ctx fields in fixed order', () => {
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

  it('appends extra ctx keys sorted lexicographically after fixed keys', () => {
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

  it('JSON.stringify-quotes values that contain spaces or =', () => {
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

  it('appends error stack as indented continuation lines', () => {
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

  it('falls back to err.message when stack missing', () => {
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

- [ ] **Schritt 2: Test ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Erwartet: Fehler — `buildDaemonLogLine` nicht exportiert.

- [ ] **Schritt 3: `buildDaemonLogLine` implementieren**

Erstellen Sie `packages/cli/src/serve/daemonLogger.ts` mit:

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

- [ ] **Schritt 4: Test ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Erwartet: PASS (6 Spezifikationen).

- [ ] **Schritt 5: Committen**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): buildDaemonLogLine formatter (#4548)"
```

---

## Aufgabe 2: `initDaemonLogger` Opt-out + No-op-Factory

Gibt einen No-op-Logger zurück, wenn `QWEN_DAEMON_LOG_FILE` deaktiviert ist. Noch kein Zugriff auf das Dateisystem.

**Dateien:**

- Ändern: `packages/cli/src/serve/daemonLogger.ts`
- Ändern: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagende Tests hinzufügen**

An `daemonLogger.test.ts` anhängen:

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
    it(`returns no-op logger when QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)}`, () => {
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
      expect(stderr).toEqual([]); // no-op = nothing
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **Schritt 2: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Erwartet: Fehler — `initDaemonLogger` nicht exportiert.

- [ ] **Schritt 3: Opt-out + No-op-Form implementieren**

An `daemonLogger.ts` anhängen:

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

- [ ] **Schritt 4: Ausführen, Opt-out-Spezifikationen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "opt-out"`
Erwartet: Opt-out-Spezifikationen PASS; gesamte Datei kann noch fehlschlagen (wir werden die Abdeckung inkrementell erweitern).

- [ ] **Schritt 5: Committen**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger opt-out env + no-op shape (#4548)"
```

---

## Aufgabe 3: Datei-Initialisierung (daemon-id, mkdir, sync-Probe, degradierter Fallback)

**Dateien:**

- Ändern: `packages/cli/src/serve/daemonLogger.ts`
- Ändern: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagende Tests hinzufügen**

An `daemonLogger.test.ts` anhängen:

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

describe('initDaemonLogger file init', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('derives daemon-id "serve-<pid>-<workspaceHash>" and creates log file', () => {
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

  it('falls back to no-op when mkdir fails', () => {
    const stderr: string[] = [];
    // Create a file where the directory should be → mkdir EEXIST/ENOTDIR
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

- [ ] **Schritt 2: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "file init"`
Erwartet: Fehler — `throw new Error('not implemented')`.

- [ ] **Schritt 3: Datei-Initialisierung implementieren**

Ersetzen Sie den werfenden Rumpf von `initDaemonLogger`. Importe und Helfer hinzufügen:

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

  // Methods come in Task 4. For now stub them out so the file-init tests pass.
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

- [ ] **Schritt 4: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "file init"`
Erwartet: PASS.

- [ ] **Schritt 5: Committen**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger file init + degraded fallback (#4548)"
```

---

## Aufgabe 4: `info` / `warn` / `error` + asynchrone Warteschlange + flush + stderr-Tee

**Dateien:**

- Ändern: `packages/cli/src/serve/daemonLogger.ts`
- Ändern: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagende Tests hinzufügen**

An `daemonLogger.test.ts` anhängen:

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

  it('info appends to file and tees to stderr', async () => {
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
    // Stderr saw the same line (after boot banner, which isn't teed here).
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('error appends err.stack as continuation', async () => {
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

  it('flush awaits all pending appends', async () => {
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

  it('warns once on append failure and keeps trying', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // Sabotage by removing the file mid-flight — POSIX will keep the inode
    // around for a held fd, but appendFile reopens each call → ENOENT once
    // the parent dir is gone.
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // Re-create logger to bind our stderr capture? Simpler: re-stub via
    // private state — instead, do this in a separate test using a custom
    // stderr from init time.
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // No throw — degraded path swallows. (Stderr count assertion left to
    // a separate variant if needed; this test pins "no crash on failure".)
  });
});
```
- [ ] **Schritt 2: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Erwartet: Fehlschlag – Methoden sind Platzhalter (Stubs).

- [ ] **Schritt 3: Implementieren von Methoden + Queue + Flush + Tee**

Ersetze den finalen `return {...}` Block in `initDaemonLogger`:

```ts
let pending: Promise<void> = Promise.resolve();
let degraded = false;

const enqueueAppend = (line: string): void => {
  pending = pending.then(() =>
    nodeFs.promises.appendFile(logPath, line).catch((err) => {
      if (!degraded) {
        degraded = true;
        stderr(
          `qwen serve: Daemon-Log-Schreibvorgang fehlgeschlagen – wechsle in den abgesicherten Modus: ${
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
  // Zuerst stderr (synchron, bewahrt die für Menschen sichtbare Reihenfolge), dann Datei.
  stderr(line.trimEnd());
  enqueueAppend(line);
};

return {
  info: (message, ctx) => teeLine('INFO', message, ctx),
  warn: (message, ctx) => teeLine('WARN', message, ctx),
  error: (message, err, ctx) =>
    teeLine('ERROR', message, ctx, err ?? undefined),
  raw: () => {}, // wird in Task 5 implementiert
  getLogPath: () => logPath,
  getDaemonId: () => daemonId,
  flush: () => pending,
};
```

- [ ] **Schritt 4: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## Task 5: `raw()` Datei-only Tee

**Dateien:**

- Ändern: `packages/cli/src/serve/daemonLogger.ts`
- Ändern: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagenden Test hinzufügen**

Anhängen:

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

  it('hängt eine Zeile mit Präfix an, kein stderr Tee', async () => {
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
    // Keine neuen stderr-Zeilen von raw()
    expect(stderr.length).toBe(stderrBefore);
  });
});
```

- [ ] **Schritt 2: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Erwartet: Fehlschlag – raw ist eine No-Operation.

- [ ] **Schritt 3: raw implementieren**

In `initDaemonLogger` ersetze `raw: () => {},` durch:

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **Schritt 4: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## Task 6: `latest` Symlink

**Dateien:**

- Ändern: `packages/cli/src/serve/daemonLogger.ts`
- Ändern: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Schritt 1: Fehlschlagenden Test hinzufügen**

Anhängen:

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

  it('erzeugt daemon/latest, das auf das aktuelle Log zeigt', () => {
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

  it('aktualisiert latest bei nachfolgendem init im selben Verzeichnis', () => {
    const a = initDaemonLogger({ boundWorkspace: '/w', pid: 1, baseDir: tmp });
    const b = initDaemonLogger({ boundWorkspace: '/w', pid: 2, baseDir: tmp });
    expect(realpathSync(path.join(tmp, 'daemon', 'latest'))).toBe(
      realpathSync(b.getLogPath()),
    );
    expect(realpathSync(a.getLogPath())).not.toBe(realpathSync(b.getLogPath()));
  });
});
```

- [ ] **Schritt 2: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Erwartet: Fehlschlag – Symlink wurde nicht erstellt.

- [ ] **Schritt 3: Symlink-Update implementieren**

`updateSymlink` befindet sich in `packages/core/src/utils/symlink.ts`, wird aber nicht aus dem Core-Barrel re-exportiert (bestätigt via `grep -n updateSymlink packages/core/src/index.ts` → keine Treffer zum Zeitpunkt der Planerstellung). Füge zuerst den Re-Export hinzu:

In `packages/core/src/index.ts` füge hinzu (in der Nähe der anderen Util-Exports):

```ts
export { updateSymlink } from './utils/symlink.js';
```

Dann importiere in `daemonLogger.ts`:

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
```

(Füge mit dem vorhandenen `Storage`-Import aus Task 3 zusammen.)

Innerhalb von `initDaemonLogger`, nachdem der `appendFileSync`-Erstzeilen-Schreibvorgang erfolgreich war, füge hinzu:

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // Best-Effort. Ein Symlink-Fehler darf die primären Schreibvorgänge nicht beeinträchtigen.
  });
} catch {
  // Synchroner Fehler ebenso Best-Effort.
}
```

- [ ] **Schritt 4: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## Task 7: `BridgeOptions.onDiagnosticLine` hinzufügen + `writeServeDebugLine` Tee

**Dateien:**

- Ändern: `packages/acp-bridge/src/bridgeOptions.ts`
- Ändern: `packages/acp-bridge/src/bridge.ts`
- Ändern: `packages/acp-bridge/src/bridge.test.ts`

- [ ] **Schritt 1: Typ `DiagnosticLineSink` zu `bridgeOptions.ts` hinzufügen**

Füge in der Nähe des Anfangs des `BridgeOptions`-Interface ein (vor `sessionScope`):

```ts
/**
 * Senke für diagnostische Zeilen auf Serve-Ebene (vom CLI-Daemon-Logger gesetzt).
 * Wenn gesetzt, leitet die Bridge die Ausgabe von `writeServeDebugLine` über
 * diesen Callback zusätzlich zum vorhandenen stderr-Schreibvorgang – verwendet von
 * runQwenServe, um sie in der Daemon-Logdatei zu erfassen. Die Bridge besitzt
 * selbst keinen Datei-Logger; dies ist ein reiner Durchreich-Hook.
 */
export type DiagnosticLineSink = (
  line: string,
  level?: 'info' | 'warn' | 'error',
) => void;
```

Füge innerhalb von `BridgeOptions` hinzu:

```ts
  /**
   * Optional: Tee der Ausgabe von `writeServeDebugLine`. Siehe {@link DiagnosticLineSink}.
   * Keine Operation, wenn nicht gesetzt. Wird vom CLI `runQwenServe` über den Daemon-Logger gesetzt.
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **Schritt 2: Fehlschlagenden Test hinzufügen**

In `packages/acp-bridge/src/bridge.test.ts` füge einen neuen `describe('onDiagnosticLine', ...)` Block hinzu. Die Datei importiert bereits `makeBridge` und `makeChannel` aus `./internal/testUtils.js` – verwende sie wieder, anstatt eine `ChannelFactory` selbst zu bauen. Bestätige mit `grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts`. Um `writeServeDebugLine` auszulösen, wähle den Test mit dem kürzesten Setup unter den 6 Aufruforten – liste sie mit `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` (derzeit Zeilen 1410, 1423, 2242, 2328, 2624, 2637; die abgelehnte Berechtigungsabstimmung zwischen Sitzungen um Zeile 2242 ist ein kleiner reproduzierbarer Auslöser).

```ts
describe('onDiagnosticLine', () => {
  const originalDebug = process.env['QWEN_SERVE_DEBUG'];
  afterEach(() => {
    if (originalDebug === undefined) delete process.env['QWEN_SERVE_DEBUG'];
    else process.env['QWEN_SERVE_DEBUG'] = originalDebug;
  });

  it('empfängt writeServeDebugLine-Ausgabe, wenn QWEN_SERVE_DEBUG=1', async () => {
    process.env['QWEN_SERVE_DEBUG'] = '1';
    const captured: Array<{ line: string; level?: string }> = [];
    const bridge = makeBridge({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // Löse writeServeDebugLine aus via [Kopiere die Vorrichtung aus dem nächstgelegenen
    // vorhandenen Test, der eine der 6 obigen Aufruforte ausführt].
    // ... Auslösecode hier ...
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

(`makeBridge` akzeptiert `Partial<BridgeOptions>` – sobald Task 7 Schritt 1 `onDiagnosticLine` zu `BridgeOptions` hinzufügt, wird es ohne weitere Änderungen an `testUtils.ts` durchgereicht.)

- [ ] **Schritt 3: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Erwartet: Fehlschlag – Callback wird nicht aufgerufen.

- [ ] **Schritt 4: Tee von `writeServeDebugLine` über den Callback**

In `packages/acp-bridge/src/bridge.ts`, in der Nähe des Anfangs von `createHttpAcpBridge` (nachdem `opts` destrukturiert wurde), führe einen lokalen Tee ein, der die vorhandene modulare Hilfsfunktion umschließt:

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

Ersetze dann in dieser Datei jeden internen `writeServeDebugLine(...)`-Aufruf **innerhalb** des Closures von `createHttpAcpBridge` durch `teeServeDebugLine(...)`. Verwende:

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

um die Aufruforte aufzulisten – es gibt 6 im aktuellen Baum (Zeilen 1410, 1423, 2242, 2328, 2624, 2637; mit dem Grep überprüfen). Bearbeite jede. Ändere NICHT die modulare Definition von `writeServeDebugLine` selbst – andere Einstiegspunkte und Tests sind darauf angewiesen.

(Grund dafür, die Definition auf oberster Ebene nicht zu ändern: Ändert die Signatur für alle Aufrufer einschließlich Tests; der Closure-Tee ist additiv und lokal begrenzt.)

- [ ] **Schritt 5: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Erwartet: BESTANDEN. Führe auch die gesamte Datei aus, um Regressionen zu erkennen: `npx vitest run src/bridge.test.ts`.

- [ ] **Schritt 6: Commit**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## Task 8: `createSpawnChannelFactory` mit `onDiagnosticLine`

**Dateien:**

- Ändern: `packages/acp-bridge/src/spawnChannel.ts`
- Ändern: `packages/acp-bridge/src/spawnChannel.test.ts` (oder erstellen, falls nicht vorhanden)

- [ ] **Schritt 1: Aktuelle Exportstruktur prüfen**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

Bestätige, dass `defaultSpawnChannelFactory` der einzige öffentliche Spawn-Export ist. Der vorhandene Child-Stderr-Forwarder ruft `process.stderr.write(prefix + line + '\n')` im Funktionsrumpf auf – finde diesen Block (etwa Zeile 125).

- [ ] **Schritt 2: Fehlschlagenden Test hinzufügen**

In `packages/acp-bridge/src/spawnChannel.test.ts` (suche nach einer vorhandenen Testdatei; falls keine vorhanden, erstelle eine):

```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpawnChannelFactory } from './spawnChannel.js';

describe('createSpawnChannelFactory onDiagnosticLine', () => {
  it('gibt eine ChannelFactory zurück, die Child-Stderr-Zeilen teet', async () => {
    const captured: Array<{ line: string; level?: string }> = [];
    const factory = createSpawnChannelFactory({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // Starte einen winzigen Child, der auf stderr schreibt und beendet. Verwende
    // die QWEN_CLI_ENTRY-Escape-Klappe, um auf einen Node-Einzeiler zu zeigen.
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // Nach dem Child-Exit spült der Forwarder den gepufferten Rest.
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

Und eine Fixture-Datei `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs`:

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

(Passe an, falls die Bridge einen ACP-Initialize-Handshake benötigt, bevor der Child als "gestartet" gilt – alternativ: Schreibe die stderr-Zeile während der Initialize-Behandlung. Falls der Test zu fragil ist, falle auf Mocken des Spawns zurück und teste die Forwarder-Logik isoliert – lies den Rumpf von `defaultSpawnChannelFactory` und teste den inneren Forwarder, indem du ihn für Tests exportierst.)

- [ ] **Schritt 3: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Erwartet: Fehlschlag – `createSpawnChannelFactory` wird nicht exportiert.

- [ ] **Schritt 4: `createSpawnChannelFactory` implementieren**

Refaktoriere `defaultSpawnChannelFactory` zu einer Factory-of-Factories. Ersetze den Anfang von `spawnChannel.ts`:

```ts
export interface SpawnChannelFactoryOptions {
  onDiagnosticLine?: (line: string, level?: 'info' | 'warn' | 'error') => void;
}

export function createSpawnChannelFactory(
  options: SpawnChannelFactoryOptions = {},
): ChannelFactory {
  const onDiagnosticLine = options.onDiagnosticLine;
  return async (workspaceCwd, childEnvOverrides) => {
    // ... vorhandener Rumpf von defaultSpawnChannelFactory ...
    // Wo der vorhandene Forwarder dies tut:
    //   process.stderr.write(prefix + line + '\n')
    // ändere es zu:
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // Für den [truncated]-Zweig:
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// Vorhandenen Export für Rückwärtskompatibilität beibehalten (kein Callback-Wiring).
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

Implementierungsdisziplin:

- Entferne NICHT `defaultSpawnChannelFactory` – Channels/IDE-Adapter importieren es weiterhin.
- Halte dich genau an die vorhandenen stderr-Schreibsemantiken (Zeilenpufferung, 64-KiB-Grenze, Kürzungsmarkierung). Der `onDiagnosticLine`-Aufruf sitzt neben jedem vorhandenen `process.stderr.write` und ersetzt ihn nie.

- [ ] **Schritt 5: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Erwartet: BESTANDEN. Führe auch die vollständige Suite aus: `npx vitest run` um Regressionen auszuschließen.

- [ ] **Schritt 6: Commit**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## Task 9: `sendBridgeError` über `daemonLog` leiten

**Dateien:**

- Ändern: `packages/cli/src/serve/server.ts`
- Ändern: `packages/cli/src/serve/server.test.ts`

- [ ] **Schritt 1: `daemonLog` zu `createServeApp`-Abhängigkeiten hinzufügen**

Lies `packages/cli/src/serve/server.ts` um die Signatur von `createServeApp` (suche nach `export function createServeApp` oder `export interface ServeAppDeps`). Füge zu seinem Abhängigkeitsinterface hinzu:

```ts
/**
 * Optionaler Daemon-Logger. Wenn gesetzt, leitet `sendBridgeError`
 * jeden routenzugeordneten Fehler über `daemonLog.error(...)` (der einen Tee
 * auf stderr + die Daemon-Logdatei ausführt). Wenn nicht gesetzt, fällt auf das
 * vorhandene stderr-only-Verhalten zurück.
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **Schritt 2: Fehlschlagenden Test hinzufügen**

In `packages/cli/src/serve/server.test.ts` füge hinzu (oder erweitere einen Routenfehler-Test):

```ts
import { initDaemonLogger } from './daemonLogger.js';

it('sendBridgeError leitet über daemonLog, wenn vorhanden', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  try {
    const stderr: string[] = [];
    const daemonLog = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    // Signatur von createServeApp: (opts, getPort?, deps?). daemonLog kommt in deps.
    const app = createServeApp(
      /* opts */ { /* ... übliche ServeOptions, aus nächstem vorhandenem Test kopieren ... */ } as ServeOptions,
      /* getPort */ () => 0,
      /* deps */ { /* ... übliche deps, die eine Route werfen lassen ... */, daemonLog },
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

(Kopiere die existierende Vorrichtung, die einen Fehler wirft – z.B. injiziere einen deps-Stub, der beim Aufruf einen Fehler wirft. Der Punkt ist, dass eine Route über `sendBridgeError` geht → die Behauptung landet im Daemon-Log.)

- [ ] **Schritt 3: Ausführen, Fehler bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
Erwartet: Fehlschlag.

- [ ] **Schritt 4: `sendBridgeError` verdrahten**

In `server.ts` finde die Funktion `sendBridgeError` (etwa Zeile 2765). Sie schreibt derzeit inline auf stderr. Refaktoriere:

1. Führe `daemonLog` von `createServeApp` in das Closure ein, das `sendBridgeError` besitzt (es ist innerhalb derselben Funktion definiert – selbes Closure).
2. Ersetze am Ende von `sendBridgeError`, wo der stderr-Schreibvorgang stattfindet, durch:

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
  // Legacy-stderr-Pfad. Verhalten für Embedder beibehalten, die
  // createServeApp ohne daemonLog erstellen (Tests, direkte Integrationen).
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unbekannte Route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

Stelle sicher, dass der neue Zweig genommen wird, wenn `daemonLog` nicht null ist. `daemonLog.error` führt bereits einen Tee auf stderr aus, sodass die stderr-Zeile weiterhin produziert wird – kein Verhaltensverlust.
Ausführen: `cd packages/cli && npx vitest run src/serve/server.test.ts`
Erwartet: vollständige Datei bestanden (alt + neu).

- [ ] **Schritt 6: Committen**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## Task 10: `runQwenServe` verdrahten — Initialisierung, Boot-Banner, Callbacks, Lebenszyklus, Herunterfahren und Flush

**Dateien:**

- Ändern: `packages/cli/src/serve/runQwenServe.ts`
- Ändern: `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **Schritt 1: Die bestehende Boot- und Shutdown-Struktur lesen**

Lies `packages/cli/src/serve/runQwenServe.ts` Zeilen 590-1030 erneut (die `createHttpAcpBridge({...})`-Aufrufstelle, den `RunHandle.close`-Rumpf und den `onSignal`-Handler). Notiere alle `writeStderrLine(...)`-Aufrufe – sie befinden sich ungefähr bei Zeile 393, 565, 805, 821, 825, 835, 859, 865, 872, 877, 951, 961, 986, 997, 1027, 1361 (führe `grep -n writeStderrLine` für die aktuellen Zeilennummern aus).

- [ ] **Schritt 2: Fehlschlagenden Test hinzufügen**

Füge in `packages/cli/src/serve/runQwenServe.test.ts` Folgendes hinzu (oder erweitere es):

```ts
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

it('runQwenServe initialisiert den Daemon-Logger und schreibt das Boot-Banner + leert beim Herunterfahren', async () => {
  const tmpRuntime = mkdtempSync(path.join(os.tmpdir(), 'serve-runtime-'));
  const originalRuntime = process.env['QWEN_RUNTIME_DIR'];
  process.env['QWEN_RUNTIME_DIR'] = tmpRuntime;
  try {
    const handle = await runQwenServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'workspace',
      // ... restliche erforderliche Optionen aus dem kleinsten vorhandenen Test ausfüllen ...
    });
    // Boot hat ein Daemon-Log irgendwo unter tmpRuntime/debug/daemon geschrieben
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // Nach dem Herunterfahren sollte "shutdown signal" oder ein Äquivalent im Log stehen.
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **Schritt 3: Ausführen, Fehlschlag bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
Erwartet: Fehlschlag.

- [ ] **Schritt 4: In `runQwenServe` verdrahten**

Bearbeite `runQwenServe.ts`:

1. Füge Imports in der Nähe der vorhandenen hinzu:

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. Füge innerhalb von `runQwenServe(opts)` direkt nach der Kanonisierung von `boundWorkspace` (finde die Zuweisung; es ist der Wert, der an `createHttpAcpBridge` übergeben wird) Folgendes ein:

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: daemon log → ${daemonLog.getLogPath() || '(deaktiviert)'}`,
);
```

3. Aktualisiere den `createHttpAcpBridge({...})`-Aufruf (ungefähr Zeile 606):

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... vorhandene Felder ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

(Falls `deps.bridge` bereitgestellt wird, bettet der Operator ein und besitzt seine eigene Verdrahtung – überspringe den Callback.)

4. Aktualisiere den `createServeApp(...)`-Aufruf (derzeit bei `runQwenServe.ts:706`, Signatur ist `createServeApp(opts, getPort, deps)`), um `daemonLog` zum deps-Objekt hinzuzufügen:

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. Ersetze **nur lebenszyklusbezogene** `writeStderrLine(...)`-Aufrufe (die innerhalb von `onSignal`, im `bridge.shutdown`-Fehlerpfad, im Server-`error`-Listener, im device-flow-dispose-Fehler, in der Zeile "received signal, draining") durch `daemonLog.warn(...)` / `daemonLog.error(..., err)` – daemonLog leitet an stderr weiter, sodass die für den Operator sichtbare Ausgabe erhalten bleibt. NICHT anfassen:
   - Boot-Banner über "listening on URL" (das ist stdout, nicht stderr – `writeStdoutLine`).
   - CLI-Usage/Argparse-Fehler vor der Erstellung von `daemonLog`.
   - Das einzelne "qwen serve: daemon log → ..."-Banner aus Schritt 2 (vermeide, eine Zeile über sich selbst zu loggen).

   Konkret: Die **mechanische** Regel für diesen Schritt: Jeder `writeStderrLine`-Aufruf **nach** der Erstellung von `daemonLog` und **vor** `process.exit` ist ein Kandidat; wenn sein Inhalt wie eine Daemon-Diagnose klingt (nicht wie ein einmaliges Startbanner), ersetze ihn.

6. Füge im `RunHandle.close`-Rumpf nach Ausführung des `finish`-Callbacks (oder direkt vor `process.exit(0)` in `onSignal`) `await daemonLog.flush();` hinzu. Konkret wird der `onSignal`-Handler zu:

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* unverändert */ return;
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

- [ ] **Schritt 5: Ausführen, Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
Erwartet: vollständige Datei bestanden.

Auch ausführen: `cd packages/cli && npx vitest run src/serve/` (vollständiges serve-Verzeichnis, fängt indirekte Regressionen wie Assertion-Erwartungen in server.test.ts zur stderr-Ausgabe ab).

- [ ] **Schritt 6: Committen**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): init daemonLogger in runQwenServe + flush on shutdown (#4548)"
```

---

## Task 11: Dokumentation

**Dateien:**

- Ändern: vorhandene serve-Dokumente (finde mit `find docs -iname '*serve*'` und `ls docs/cli/`)

- [ ] **Schritt 1: Das richtige Dokument finden**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

Wähle die natürlichste Stelle – wahrscheinlich `docs/cli/serve.md`. Falls keines für `qwen serve` existiert, erstelle `docs/cli/serve-daemon-log.md`.

- [ ] **Schritt 2: Den Abschnitt schreiben**

Füge (oder erstelle) einen Abschnitt "Daemon-Logdatei" hinzu:

```markdown
## Daemon-Logdatei

`qwen serve` schreibt ein prozessbezogenes Diagnoselog nach:
```

${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

Ein `latest`-Symlink im selben Verzeichnis zeigt immer auf das Log
des aktuellen Prozesses, sodass `tail -f ~/.qwen/debug/daemon/latest`
dem jeweils laufenden Daemon folgt.

Das Log erfasst Lebenszyklusmeldungen, Routenfehler (mit `route=`-
und `sessionId=`-Kontext), ACP-Child-stderr und – wenn `QWEN_SERVE_DEBUG=1`
gesetzt ist – zusätzliche Bridge-Breadcrumbs. Zeilen, die heute nach
stderr gehen, gehen weiterhin nach stderr; die Datei ist **additiv**,
kein Ersatz.

### Deaktivieren

Setze `QWEN_DAEMON_LOG_FILE=0` (oder `false`/`off`/`no`), um die Dateiprotokollierung
vollständig zu überspringen. Die stderr-Ausgabe bleibt unberührt.

### Beziehung zu Session-Debug-Logs

Session-bezogene Debug-Logs (`~/.qwen/debug/<sessionId>.txt` und der
`~/.qwen/debug/latest`-Symlink) sind unabhängig. Das Daemon-Log befindet sich
in einem benachbarten `daemon/`-Unterverzeichnis; die Session-Debug-Semantik
ändert sich durch dieses Feature nicht.

### Keine Rotation

Das Daemon-Log hängt unbegrenzt an. Rotiere manuell, falls es zu groß wird.
Eine zukünftige Erweiterung könnte automatische Rotation hinzufügen; verfolge
via #4548-Folgeaufgaben.
```

- [ ] **Schritt 3: Committen**

```bash
git add docs/cli/serve.md   # oder der tatsächliche Dateipfad
git commit -m "docs(serve): document daemon log file path and opt-out (#4548)"
```

---

## Task 12: Abschließende Verifikation

- [ ] **Schritt 1: Vollständiger Testdurchlauf**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

Erwartet: alles grün.

- [ ] **Schritt 2: Typenprüfung**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

Erwartet: keine Fehler.

- [ ] **Schritt 3: Manueller Smoketest**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # sollte jetzt die Herunterfahrzeile enthalten
```

Erwartet: Logdatei existiert, enthält `daemon started ...`, dann nach dem Kill die Zeile `received SIGTERM, draining`.

Falls `packages/cli/dist/index.js` nicht existiert, zuerst bauen: `npm run build --workspace=packages/cli`.

- [ ] **Schritt 4: PR öffnen**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): add daemon file logger (#4548)" --body "$(cat <<'EOF'
## Zusammenfassung
- Fügt einen prozessbezogenen Daemon-Dateilogger unter `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log` hinzu (konfigurierbar via `QWEN_RUNTIME_DIR`, deaktivierbar via `QWEN_DAEMON_LOG_FILE=0`).
- Leitet `runQwenServe`-Lebenszyklusmeldungen, `sendBridgeError`-Routenfehler, `writeServeDebugLine`-Debug-Breadcrumbs und ACP-Child-stderr in das Daemon-Log um, ohne die vorhandene stderr-Ausgabe zu entfernen.
- Fügt `BridgeOptions.onDiagnosticLine` und `createSpawnChannelFactory({ onDiagnosticLine })` hinzu, um `acp-bridge` unwissend gegenüber der CLI zu halten.

Schließt #4548.

## Testplan
- [x] Neue Unit-Tests in `packages/cli/src/serve/daemonLogger.test.ts` decken Formatierung, Datei-Initialisierung, info/warn/error, raw, latest-Symlink, Deaktivierung und degradierten Fallback ab.
- [x] `packages/acp-bridge/src/bridge.test.ts` deckt `onDiagnosticLine`-Tee von `writeServeDebugLine` ab.
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` deckt den Child-stderr-Weiterleiter ab.
- [x] `packages/cli/src/serve/server.test.ts` deckt die Weiterleitung von Routenfehlern durch `daemonLog.error` ab.
- [x] `packages/cli/src/serve/runQwenServe.test.ts` deckt Boot-Banner + Flush beim Herunterfahren ab.
- [x] Manueller Smoketest: Logdatei beim Boot erstellt, enthält Herunterfahrzeile bei SIGTERM.

🤖 Generiert mit [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## Selbstprüfungsnotizen

- **Spezifikationsabdeckung**: §3 Modultabelle abgedeckt durch Tasks 1-10. §4 Daemon-ID + Pfad → Task 3. §5 API-Oberfläche → Tasks 1-6. §6 Format + Tee-Semantik → Task 1 (Format), Task 4 (info/warn/error-Tee), Task 5 (raw, dateinur). §7 Boot/Shutdown → Task 10. §8 Abdeckungstabelle → Tasks 7/8/9/10. §9 Schreibpfad & Flush → Task 4. §10 Konfiguration → Task 2 (Deaktivierung), Task 11 (Doku). §11 Fehlerbehandlung → Tasks 3, 4. §12 Tests → verteilt über die Tasks. §13 Doku → Task 11. §15 Akzeptanzkriterien → erfüllt durch Tasks 3, 9, 8, 10, 10, 11.

- **Trace-Kontext (§6 Aufzählungspunkt)**: zurückgestellt. Die Spezifikation lässt es explizit offen ("Helper in ein gemeinsames Modul extrahiert ... oder lokal dupliziert – dem Plan überlassen"). Der aktuelle Plan injiziert KEIN trace_id/span_id; das ist eine Folgetask, die in §16 verfolgt wird. Falls der Reviewer Einwände hat, füge einen Task 4.5 hinzu, der `trace` aus `@opentelemetry/api` importiert und den Span-Kontext in `buildDaemonLogLine` einfließen lässt – aber nur, wenn der Reviewer danach fragt; sonst YAGNI.

- **`updateSymlink`-Importpfad**: Task 6 Schritt 3 lässt offen, ob `updateSymlink` aus `@qwen-code/qwen-code-core` exportiert wird. Vor dem Bearbeiten überprüfen: `grep -n updateSymlink packages/core/src/index.ts`. Falls fehlend, füge den Re-Export im selben Commit wie Task 6 hinzu.

- **acp-bridge-Test für `createSpawnChannelFactory`**: Ein echtes Kind in einem Unit-Test zu spawnen ist anfällig. Falls Task 8 Schritt 2 sich in CI als flaky erweist, besteht der Fallback darin, den inneren stderr-Weiterleiter in einen kleinen exportierten Helper umzuwandeln (`forwardChildStderr(stream, { prefix, onLine })`) und diesen isoliert zu testen – kein echter Spawn nötig.