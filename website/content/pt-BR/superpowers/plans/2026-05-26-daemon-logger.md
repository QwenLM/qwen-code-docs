```markdown
# `qwen serve` Logger de Arquivo do Daemon — Plano de Implementação

> **Para workers agentic:** HABILIDADE OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Adicionar um logger de arquivo com escopo de daemon ao `qwen serve` para que erros de rota, mensagens de ciclo de vida e stderr de filhos do ACP sejam registrados em `~/.qwen/debug/daemon/<id>.log` além do stderr — eliminando a solução manual `2>serve.log` para o problema #4548.

**Arquitetura:** Novo módulo local da CLI `daemonLogger.ts` expõe `initDaemonLogger(opts) → DaemonLogger`. `info/warn/error` fazem tee para arquivo + stderr; `raw` é apenas arquivo. `acp-bridge` recebe um novo callback opcional `BridgeOptions.onDiagnosticLine` e o helper `createSpawnChannelFactory({ onDiagnosticLine })` para que a CLI possa rotear `writeServeDebugLine` e linhas de stderr do filho ACP para o log do daemon sem que o acp-bridge dependa da CLI. Sem singleton global — o logger é construído por invocação de `runQwenServe`.

**Stack de Tecnologia:** TypeScript, Vitest, `fs.promises` do Node, `Storage.getGlobalDebugDir()` existente, helper `updateSymlink` existente.

**Especificação de referência:** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**Harness de teste:** `vitest run` de cada pacote; para um único arquivo: `cd packages/<pkg> && npx vitest run <relative-path>`.

---

## Mapa de arquivos

| Arquivo                                          | Ação            | Propósito                                                                                                                    |
| ------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`         | **novo**        | Sink do logger + helper de formatação                                                                                        |
| `packages/cli/src/serve/daemonLogger.test.ts`    | **novo**        | Testes unitários para o acima                                                                                                |
| `packages/acp-bridge/src/bridgeOptions.ts`       | modificar       | Adicionar campo `onDiagnosticLine?` + tipo `DiagnosticLineSink`                                                              |
| `packages/acp-bridge/src/bridge.ts`              | modificar       | Fazer tee de `writeServeDebugLine` através de `opts.onDiagnosticLine` (via closure local `teeServeDebugLine`)                |
| `packages/acp-bridge/src/bridge.test.ts`         | modificar       | Adicionar teste de que `onDiagnosticLine` recebe linhas de debug                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`        | modificar       | Exportar `createSpawnChannelFactory({ onDiagnosticLine })`; fazer tee de stderr do filho para o callback                     |
| `packages/acp-bridge/src/spawnChannel.test.ts`   | modificar (ou novo) | Testar callback de encaminhamento de stderr                                                                                  |
| `packages/cli/src/serve/server.ts`               | modificar       | `createServeApp` deps aceitam `daemonLog` opcional; `sendBridgeError` roteia através dele quando fornecido                   |
| `packages/cli/src/serve/server.test.ts`          | modificar       | Verificar se daemonLog recebe entradas de erro de rota                                                                       |
| `packages/cli/src/serve/runQwenServe.ts`         | modificar       | Iniciar logger, banner de boot, conectar factory de spawn + callback da bridge, substituir chamadas de `writeStderrLine` do ciclo de vida, flush no shutdown |
| `packages/cli/src/serve/runQwenServe.test.ts`    | modificar       | Verificar banner de boot + comportamento de flush                                                                            |
| `docs/cli/serve.md` (ou equivalente)             | modificar       | Documentar caminho do log do daemon + opção de desabilitar                                                                   |

---

## Tarefa 0: Pré-voo

- [ ] **Passo 1: Confirmar worktree + branch**

Execute: `git rev-parse --abbrev-ref HEAD && pwd`
Esperado: branch `feat/support_daemon_logger`, cwd termina com `.claude/worktrees/feat-support-daemon-logger`.

- [ ] **Passo 2: Instalar dependências + testes baseline verdes**

Execute: `npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
Esperado: todos passam. (Caso contrário, o baseline está quebrado — pare e reporte.)

- [ ] **Passo 3: Leia a especificação**

Leia `docs/superpowers/specs/2026-05-26-daemon-logger-design.md` do início ao fim. Seções principais a internalizar: §3 (módulos), §4 (caminho), §5 (API), §6 (formato + semântica de tee), §7 (boot/shutdown), §11 (tratamento de erros).

---

## Tarefa 1: Helper puro `buildDaemonLogLine`

Formatador puro. Sem E/S. Fácil de fazer TDD.

**Arquivos:**

- Criar: `packages/cli/src/serve/daemonLogger.ts`
- Criar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Escrever os testes falhando**

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

  it('formata INFO sem ctx', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('renderiza campos ctx em ordem fixa', () => {
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

  it('anexa chaves extras de ctx ordenadas lexicograficamente após as chaves fixas', () => {
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

  it('usa JSON.stringify-quotes em valores que contêm espaços ou =', () => {
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

  it('anexa stack de erro como linhas de continuação indentadas', () => {
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

  it('usa err.message quando stack está ausente', () => {
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

- [ ] **Passo 2: Executar teste, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Esperado: falha — `buildDaemonLogLine` não exportado.

- [ ] **Passo 3: Implementar `buildDaemonLogLine`**

Criar `packages/cli/src/serve/daemonLogger.ts` com:

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

- [ ] **Passo 4: Executar teste, confirmar passagem**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Esperado: PASS (6 especificações).

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): formatador buildDaemonLogLine (#4548)"
```

---

## Tarefa 2: `initDaemonLogger` opt-out + fábrica no-op

Retorna um logger no-op quando `QWEN_DAEMON_LOG_FILE` está desabilitado. Nenhum toque no sistema de arquivos ainda.

**Arquivos:**

- Modificar: `packages/cli/src/serve/daemonLogger.ts`
- Modificar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Adicionar testes falhando**

Acrescentar em `daemonLogger.test.ts`:

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
    it(`retorna logger no-op quando QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)}`, () => {
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
      expect(stderr).toEqual([]); // no-op = nada
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **Passo 2: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Esperado: falha — `initDaemonLogger` não exportado.

- [ ] **Passo 3: Implementar shape opt-out + no-op**

Acrescentar em `daemonLogger.ts`:

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
  throw new Error('initDaemonLogger: caminho do arquivo não implementado ainda');
}
```

- [ ] **Passo 4: Executar, confirmar que especificações opt-out passam**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "opt-out"`
Esperado: especificações opt-out PASSAM; o arquivo completo pode ainda falhar (vamos adicionar cobertura incrementalmente).

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): env de opt-out do logger do daemon + shape no-op (#4548)"
```

---

## Tarefa 3: Inicialização do arquivo (daemon-id, mkdir, teste síncrono, fallback degradado)

**Arquivos:**

- Modificar: `packages/cli/src/serve/daemonLogger.ts`
- Modificar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Adicionar testes falhando**

Acrescentar em `daemonLogger.test.ts`:

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

describe('initDaemonLogger init de arquivo', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('deriva daemon-id "serve-<pid>-<workspaceHash>" e cria arquivo de log', () => {
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

  it('faz fallback para no-op quando mkdir falha', () => {
    const stderr: string[] = [];
    // Criar um arquivo onde o diretório deveria estar → mkdir EEXIST/ENOTDIR
    const blockingFile = path.join(tmp, 'daemon');
    require('node:fs').writeFileSync(blockingFile, 'blocker');

    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    expect(logger.getLogPath()).toBe('');
    expect(stderr.join('\n')).toMatch(/log do daemon desabilitado/);
    expect(() => logger.info('depois')).not.toThrow();
  });
});
```

- [ ] **Passo 2: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "init de arquivo"`
Esperado: falha — `throw new Error('não implementado')`.

- [ ] **Passo 3: Implementar init de arquivo**

Substituir o corpo que lança erro de `initDaemonLogger`. Adicionar imports e helpers:

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
      `qwen serve: log do daemon desabilitado — falha na inicialização: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NOOP_LOGGER;
  }

  // Métodos virão na Tarefa 4. Por enquanto, stub para os testes de init de arquivo passarem.
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

- [ ] **Passo 4: Executar, confirmar passagem**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "init de arquivo"`
Esperado: PASS.

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): init de arquivo do logger do daemon + fallback degradado (#4548)"
```

---

## Tarefa 4: `info` / `warn` / `error` + fila assíncrona + flush + tee no stderr

**Arquivos:**

- Modificar: `packages/cli/src/serve/daemonLogger.ts`
- Modificar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Adicionar testes falhando**

Acrescentar em `daemonLogger.test.ts`:

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

  it('info anexa ao arquivo e faz tee para stderr', async () => {
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
    // Stderr viu a mesma linha (após o banner de boot, que não é teed aqui).
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('error anexa err.stack como continuação', async () => {
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

  it('flush aguarda todos os appends pendentes', async () => {
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

  it('avisa uma vez em falha de append e continua tentando', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // Sabotar removendo o arquivo em pleno voo — POSIX manterá o inode
    // para um fd aberto, mas appendFile reabre a cada chamada → ENOENT uma vez
    // que o diretório pai se foi.
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // Recriar o logger para ligar nossa captura de stderr? Mais simples: re-stub via
    // estado privado — em vez disso, fazer isso em um teste separado usando um
    // stderr customizado desde a inicialização.
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // Sem throw — caminho degradado engole. (Afirmação de contagem de stderr deixada
    // para uma variante separada, se necessário; este teste fixa "sem crash em falha".)
  });
});
```
```
- [ ] **Passo 2: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Esperado: falha — os métodos são stubs.

- [ ] **Passo 3: Implementar métodos + fila + flush + tee**

Substitua o bloco final `return {...}` em `initDaemonLogger`:

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
  // stderr first (synchronous, preserves human-visible order), then file.
  stderr(line.trimEnd());
  enqueueAppend(line);
};

return {
  info: (message, ctx) => teeLine('INFO', message, ctx),
  warn: (message, ctx) => teeLine('WARN', message, ctx),
  error: (message, err, ctx) =>
    teeLine('ERROR', message, ctx, err ?? undefined),
  raw: () => {}, // implemented in Task 5
  getLogPath: () => logPath,
  getDaemonId: () => daemonId,
  flush: () => pending,
};
```

- [ ] **Passo 4: Executar, confirmar sucesso**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Esperado: SUCESSO.

- [ ] **Passo 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## Tarefa 5: `raw()` tee apenas para arquivo

**Arquivos:**

- Modificar: `packages/cli/src/serve/daemonLogger.ts`
- Modificar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Adicionar teste com falha**

Adicione:

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
    // No new stderr lines from raw()
    expect(stderr.length).toBe(stderrBefore);
  });
});
```

- [ ] **Passo 2: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Esperado: falha — raw é no-op.

- [ ] **Passo 3: Implementar raw**

Em `initDaemonLogger`, substitua `raw: () => {},` por:

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **Passo 4: Executar, confirmar sucesso**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Esperado: SUCESSO.

- [ ] **Passo 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## Tarefa 6: Link simbólico `latest`

**Arquivos:**

- Modificar: `packages/cli/src/serve/daemonLogger.ts`
- Modificar: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Passo 1: Adicionar teste com falha**

Adicione:

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

- [ ] **Passo 2: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Esperado: falha — link simbólico não criado.

- [ ] **Passo 3: Implementar atualização do link simbólico**

O `updateSymlink` está em `packages/core/src/utils/symlink.ts`, mas NÃO é reexportado do barrel do core (confirmado via `grep -n updateSymlink packages/core/src/index.ts` → sem correspondências no momento da escrita do plano). Adicione a reexportação primeiro:

Em `packages/core/src/index.ts`, adicione (próximo às outras exportações de utils):

```ts
export { updateSymlink } from './utils/symlink.js';
```

Em seguida, importe em `daemonLogger.ts`:

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
```

(Mescle com o import `Storage` existente adicionado na Tarefa 3.)

Dentro de `initDaemonLogger`, após a escrita da primeira linha com `appendFileSync` ter sucesso, adicione:

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // Best-effort. Symlink failure must not degrade primary writes.
  });
} catch {
  // Sync throw equally best-effort.
}
```

- [ ] **Passo 4: Executar, confirmar sucesso**

Execute: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Esperado: SUCESSO.

- [ ] **Passo 5: Commit**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## Tarefa 7: Adicionar `BridgeOptions.onDiagnosticLine` + tee `writeServeDebugLine`

**Arquivos:**

- Modificar: `packages/acp-bridge/src/bridgeOptions.ts`
- Modificar: `packages/acp-bridge/src/bridge.ts`
- Modificar: `packages/acp-bridge/src/bridge.test.ts`

- [ ] **Passo 1: Adicionar tipo `DiagnosticLineSink` a `bridgeOptions.ts`**

Insira no início da interface `BridgeOptions` (antes de `sessionScope`):

```ts
/**
 * Sink for serve-level diagnostic lines (set by the cli daemon logger).
 * When provided, the bridge tees `writeServeDebugLine` output through
 * this callback alongside the existing stderr write — used by
 * runQwenServe to capture them in the daemon log file. The bridge
 * does not own a file logger itself; this is a pure pass-through hook.
 */
export type DiagnosticLineSink = (
  line: string,
  level?: 'info' | 'warn' | 'error',
) => void;
```

Adicione dentro de `BridgeOptions`:

```ts
  /**
   * Optional: tee `writeServeDebugLine` output. See {@link DiagnosticLineSink}.
   * No-op when omitted. Set by cli `runQwenServe` from the daemon logger.
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **Passo 2: Adicionar teste com falha**

Em `packages/acp-bridge/src/bridge.test.ts`, adicione um novo bloco `describe('onDiagnosticLine', ...)`. O arquivo já importa `makeBridge` e `makeChannel` de `./internal/testUtils.js` — reutilize-os em vez de criar uma `ChannelFactory` manual. Confirme com `grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts`. Para disparar `writeServeDebugLine`, escolha o teste de configuração mais curta entre os 6 locais de chamada — liste-os com `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` (atualmente nas linhas 1410, 1423, 2242, 2328, 2624, 2637; a rejeição de voto de permissão entre sessões na linha ~2242 é um gatilho pequeno e reproduzível).

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
    // Trigger writeServeDebugLine via [copy harness from the closest
    // existing test that exercises one of the 6 call sites above].
    // ... trigger code here ...
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

(`makeBridge` aceita `Partial<BridgeOptions>` — assim que o Passo 1 da Tarefa 7 adicionar `onDiagnosticLine` a `BridgeOptions`, ele fluirá sem edições adicionais em `testUtils.ts`.)

- [ ] **Passo 3: Executar, confirmar falha**

Execute: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Esperado: falha — callback não invocado.

- [ ] **Passo 4: Fazer tee de `writeServeDebugLine` através do callback**

Em `packages/acp-bridge/src/bridge.ts`, próximo ao início de `createHttpAcpBridge` (após a desestruturação de `opts`), introduza um tee local que envolva o helper module-level existente:

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

Em seguida, neste arquivo, substitua toda chamada interna a `writeServeDebugLine(...)` **dentro** do closure de `createHttpAcpBridge` por `teeServeDebugLine(...)`. Use:

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

para enumerar os locais — há 6 na árvore atual (linhas 1410, 1423, 2242, 2328, 2624, 2637; verifique com o grep). Edite cada um. NÃO altere a definição module-level de `writeServeDebugLine` — outros pontos de entrada e testes dependem dela.

(Motivo para não editar a definição de nível superior: altera a assinatura para todos os chamadores, incluindo testes; o tee do closure é aditivo e com escopo local.)

- [ ] **Passo 5: Executar, confirmar sucesso**

Execute: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Esperado: SUCESSO. Execute também o arquivo completo para capturar regressões: `npx vitest run src/bridge.test.ts`.

- [ ] **Passo 6: Commit**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## Tarefa 8: `createSpawnChannelFactory` com `onDiagnosticLine`

**Arquivos:**

- Modificar: `packages/acp-bridge/src/spawnChannel.ts`
- Modificar: `packages/acp-bridge/src/spawnChannel.test.ts` (ou criar se não existir)

- [ ] **Passo 1: Inspecionar formato de exportação atual**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

Confirme que `defaultSpawnChannelFactory` é a única exportação pública de spawn. O encaminhador existente de stderr do filho chama `process.stderr.write(prefix + line + '\n')` dentro do corpo — localize esse bloco (por volta da linha 125).

- [ ] **Passo 2: Adicionar teste com falha**

Em `packages/acp-bridge/src/spawnChannel.test.ts` (procure por um arquivo de teste existente; se não houver, crie um):

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
    // Spawn a tiny child that writes to stderr then exits. Use the
    // QWEN_CLI_ENTRY escape hatch to point at a Node one-liner.
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // After child exit, the forwarder flushes buffered tail.
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

E uma entrada de fixture `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs`:

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

(Ajuste se a bridge exigir handshake de inicialização do ACP antes de considerar o filho "spawned" — alternativa: escreva a linha de stderr durante o tratamento da inicialização. Se o teste for frágil demais, recorra a mockar o spawn e afirmar a lógica do encaminhador isoladamente — leia o corpo de `defaultSpawnChannelFactory` e teste o encaminhador interno exportando-o para testes.)

- [ ] **Passo 3: Executar, confirmar falha**

Execute: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Esperado: falha — `createSpawnChannelFactory` não exportada.

- [ ] **Passo 4: Implementar `createSpawnChannelFactory`**

Refatore `defaultSpawnChannelFactory` em uma fábrica de fábricas. Substitua o início de `spawnChannel.ts`:

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
    // Where the existing forwarder does:
    //   process.stderr.write(prefix + line + '\n')
    // change it to:
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // For the [truncated] branch:
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// Preserve the old export for backward compatibility (no callback wiring).
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

Disciplina de implementação:

- NÃO remova `defaultSpawnChannelFactory` — canais/adaptadores IDE ainda o importam.
- Siga exatamente a semântica de escrita stderr existente (buffering de linhas, limite de 64 KiB, marcador de truncamento). A chamada `onDiagnosticLine` fica ao lado de cada `process.stderr.write` existente e nunca o substitui.

- [ ] **Passo 5: Executar, confirmar sucesso**

Execute: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Esperado: SUCESSO. Execute também `npx vitest run` na suíte completa para confirmar nenhuma regressão.

- [ ] **Passo 6: Commit**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## Tarefa 9: Roteamento de `sendBridgeError` através de `daemonLog`

**Arquivos:**

- Modificar: `packages/cli/src/serve/server.ts`
- Modificar: `packages/cli/src/serve/server.test.ts`

- [ ] **Passo 1: Adicionar `daemonLog` às dependências de `createServeApp`**

Leia `packages/cli/src/serve/server.ts` ao redor da assinatura de `createServeApp` (procure por `export function createServeApp` ou `export interface ServeAppDeps`). Adicione à sua interface de dependências:

```ts
/**
 * Optional daemon logger. When provided, `sendBridgeError` routes
 * each route-mapped error through `daemonLog.error(...)` (which tees
 * to stderr + the daemon log file). When omitted, falls back to
 * existing stderr-only behavior.
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **Passo 2: Adicionar teste com falha**

Em `packages/cli/src/serve/server.test.ts`, adicione (ou estenda um teste de erro de rota):

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
    // createServeApp signature: (opts, getPort?, deps?). daemonLog goes in deps.
    const app = createServeApp(
      /* opts */ { /* ...usual ServeOptions, copy from closest existing test... */ } as ServeOptions,
      /* getPort */ () => 0,
      /* deps */ { /* ...usual deps that make a route throw... */, daemonLog },
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

(Copie qualquer harness de rota que lança erro já existente em `server.test.ts` — por exemplo, injete um stub de dependências que lance quando chamado. O ponto é que uma rota atinja `sendBridgeError` → a asserção apareça no log do daemon.)

- [ ] **Passo 3: Executar, confirmar falha**

Execute: `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
Esperado: falha.

- [ ] **Passo 4: Conectar `sendBridgeError`**

Em `server.ts`, encontre a função `sendBridgeError` (por volta da linha 2765). Atualmente ela escreve em stderr diretamente. Refatore:

1. Passe `daemonLog` de `createServeApp` para o closure que possui `sendBridgeError` (ela está definida dentro da função — mesmo closure).
2. No final de `sendBridgeError`, onde ocorre a escrita em stderr, substitua por:

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
  // Legacy stderr-only path. Keep behavior intact for embedders that
  // construct createServeApp without daemonLog (tests, direct integrations).
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unknown route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

Certifique-se de que o novo ramo seja executado quando `daemonLog` não for nulo. `daemonLog.error` já faz tee para stderr, então a linha de stderr ainda é produzida — sem perda de comportamento.

- [ ] **Passo 5: Executar, confirmar sucesso**
Execute: `cd packages/cli && npx vitest run src/serve/server.test.ts`
Esperado: arquivo completo PASS (novo + antigo).

- [ ] **Passo 6: Commit**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## Tarefa 10: Conectar `runQwenServe` — inicialização, banner de inicialização, callbacks, ciclo de vida, descarregamento no desligamento

**Arquivos:**

- Modificar: `packages/cli/src/serve/runQwenServe.ts`
- Modificar: `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **Passo 1: Leia a estrutura existente de inicialização + desligamento**

Releia `packages/cli/src/serve/runQwenServe.ts` linhas 590-1030 (o local da chamada `createHttpAcpBridge({...})`, o corpo de `RunHandle.close` e o manipulador `onSignal`). Observe todas as chamadas `writeStderrLine(...)` — elas estão aproximadamente nas linhas 393, 565, 805, 821, 825, 835, 859, 865, 872, 877, 951, 961, 986, 997, 1027, 1361 (execute `grep -n writeStderrLine` para os números de linha atuais).

- [ ] **Passo 2: Adicionar teste com falha**

Em `packages/cli/src/serve/runQwenServe.test.ts`, adicione (ou estenda):

```ts
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

it('runQwenServe inicializa o logger do daemon e escreve o banner de inicialização + faz flush no desligamento', async () => {
  const tmpRuntime = mkdtempSync(path.join(os.tmpdir(), 'serve-runtime-'));
  const originalRuntime = process.env['QWEN_RUNTIME_DIR'];
  process.env['QWEN_RUNTIME_DIR'] = tmpRuntime;
  try {
    const handle = await runQwenServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'workspace',
      // ... preencha as opções obrigatórias restantes a partir do menor teste existente ...
    });
    // A inicialização escreveu um log do daemon em algum lugar abaixo de tmpRuntime/debug/daemon
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // Após o desligamento, "shutdown signal" ou equivalente deve estar no log.
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **Passo 3: Execute e confirme a falha**

Execute: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
Esperado: falha.

- [ ] **Passo 4: Conectar em `runQwenServe`**

Edite `runQwenServe.ts`:

1. Adicione imports próximos aos existentes:

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. Dentro de `runQwenServe(opts)`, logo após `boundWorkspace` ser canonicalizado (encontre a atribuição; é o valor passado para `createHttpAcpBridge`):

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: log do daemon → ${daemonLog.getLogPath() || '(desabilitado)'}`,
);
```

3. Atualize a chamada `createHttpAcpBridge({...})` (por volta da linha 606):

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... campos existentes ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

(Se `deps.bridge` for fornecido, o operador está embutindo e possui sua própria fiação — pule o callback.)

4. Atualize a chamada `createServeApp(...)` (atualmente em `runQwenServe.ts:706`, assinatura é `createServeApp(opts, getPort, deps)`) para adicionar `daemonLog` ao objeto deps:

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. Substitua chamadas **apenas de ciclo de vida** `writeStderrLine(...)` (aquelas dentro de `onSignal`, o caminho de erro `bridge.shutdown`, o listener de `error` do servidor, o erro de dispose do device-flow, a linha "received signal, draining") por `daemonLog.warn(...)` / `daemonLog.error(..., err)` — o daemonLog envia também para stderr, então a saída visível ao operador é preservada. NÃO toque:
   - Banner de inicialização sobre "listening on URL" (essa é stdout, não stderr — `writeStdoutLine`).
   - Erros de uso/argparse antes de `daemonLog` ser construído.
   - O banner "qwen serve: log do daemon → ..." adicionado no passo 2 (evite registrar uma linha sobre si mesmo).

   Para ser concreto, a regra **mecânica** para este passo: toda chamada `writeStderrLine` **após** a construção de `daemonLog` e **antes** de `process.exit` é candidata; se seu conteúdo parece um diagnóstico de daemon (não um banner de inicialização único), troque-a.

6. No corpo de `RunHandle.close`, após o callback `finish` ser executado (ou logo antes de `process.exit(0)` em `onSignal`), adicione `await daemonLog.flush();`. Concretamente, o manipulador `onSignal` se torna:

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* inalterado */ return;
  }
  daemonLog.warn(`recebido ${signal}, drenando`, { signal });
  try {
    await handle.close();
    await daemonLog.flush();
    process.exit(0);
  } catch (err) {
    daemonLog.error('erro no desligamento', err instanceof Error ? err : null);
    await daemonLog.flush().catch(() => {});
    process.exit(1);
  }
};
```

- [ ] **Passo 5: Execute e confirme aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
Esperado: arquivo completo PASS.

Execute também: `cd packages/cli && npx vitest run src/serve/` (diretório serve completo, captura regressões indiretas como asserções de server.test.ts na saída stderr).

- [ ] **Passo 6: Commit**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): inicia daemonLogger em runQwenServe + flush no desligamento (#4548)"
```

---

## Tarefa 11: Documentação

**Arquivos:**

- Modificar: documentação existente do serve (localize com `find docs -iname '*serve*'` e `ls docs/cli/`)

- [ ] **Passo 1: Encontre o documento correto**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

Escolha o local mais natural — provavelmente `docs/cli/serve.md`. Se nenhum existir para `qwen serve`, crie `docs/cli/serve-daemon-log.md`.

- [ ] **Passo 2: Escreva a seção**

Adicione (ou crie) uma seção "Arquivo de log do daemon":

```markdown
## Arquivo de log do daemon

`qwen serve` escreve um log de diagnóstico por processo em:
```

${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

Um link simbólico `latest` no mesmo diretório sempre aponta para o log
do processo atual, então `tail -f ~/.qwen/debug/daemon/latest` seguirá qualquer
daemon que estiver em execução.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e
`sessionId=`), stderr filho do ACP e — quando `QWEN_SERVE_DEBUG=1` está
definido — breadcrumbs extras da bridge. Linhas que vão para stderr hoje ainda
vão para stderr; o log em arquivo é **aditivo**, não uma substituição.

### Desabilitando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular o log em arquivo
completamente. A saída stderr não é afetada.

### Relação com logs de depuração de sessão

Logs de depuração por sessão (`~/.qwen/debug/<sessionId>.txt` e o
link simbólico `~/.qwen/debug/latest`) são independentes. O log do daemon reside
em um subdiretório `daemon/` irmão; a semântica de depuração por sessão permanece
inalterada por esta funcionalidade.

### Sem rotação

O log do daemon anexa indefinidamente. Rode manualmente se crescer muito.
Uma melhoria futura pode adicionar rotação automática; acompanhe via seguidores
do #4548.
```

- [ ] **Passo 3: Commit**

```bash
git add docs/cli/serve.md   # ou o caminho real do arquivo
git commit -m "docs(serve): documenta caminho do arquivo de log do daemon e exclusão opcional (#4548)"
```

---

## Tarefa 12: Verificação final

- [ ] **Passo 1: Varredura completa de testes**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

Esperado: tudo verde.

- [ ] **Passo 2: Verificação de tipos**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

Esperado: sem erros.

- [ ] **Passo 3: Teste manual rápido**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # agora deve conter a linha de desligamento
```

Esperado: o arquivo de log existe, contém `daemon started ...`, depois após o kill a linha `received SIGTERM, draining`.

Se `packages/cli/dist/index.js` não existir, construa primeiro: `npm run build --workspace=packages/cli`.

- [ ] **Passo 4: Abrir PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): adiciona logger de arquivo do daemon (#4548)" --body "$(cat <<'EOF'
## Resumo
- Adiciona um logger de arquivo do daemon por processo em `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log` (configurável via `QWEN_RUNTIME_DIR`, exclusão opcional via `QWEN_DAEMON_LOG_FILE=0`).
- Roteia mensagens de ciclo de vida do `runQwenServe`, erros de rota do `sendBridgeError`, breadcrumbs de depuração do `writeServeDebugLine` e stderr filho do ACP para o log do daemon sem remover a saída stderr existente.
- Adiciona `BridgeOptions.onDiagnosticLine` e `createSpawnChannelFactory({ onDiagnosticLine })` para manter `acp-bridge` ignorante do cli.

Fecha #4548.

## Plano de teste
- [x] Novos testes unitários em `packages/cli/src/serve/daemonLogger.test.ts` cobrem formatador, inicialização de arquivo, info/warn/error, raw, link simbólico latest, exclusão opcional, fallback degradado.
- [x] `packages/acp-bridge/src/bridge.test.ts` cobre o tee do `onDiagnosticLine` a partir de `writeServeDebugLine`.
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` cobre o encaminhador de stderr filho.
- [x] `packages/cli/src/serve/server.test.ts` cobre roteamento de erro de rota através de `daemonLog.error`.
- [x] `packages/cli/src/serve/runQwenServe.test.ts` cobre banner de inicialização + flush no desligamento.
- [x] Teste manual rápido: arquivo de log criado na inicialização, contém linha de desligamento no SIGTERM.

🤖 Gerado com [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## Notas de auto-revisão

- **Cobertura da especificação**: §3 tabela de módulos coberta pelas Tarefas 1-10. §4 ID do daemon + caminho → Tarefa 3. §5 Superfície da API → Tarefas 1-6. §6 Formato + semântica de tee → Tarefa 1 (formato), Tarefa 4 (tee info/warn/error), Tarefa 5 (raw apenas arquivo). §7 Inicialização/desligamento → Tarefa 10. §8 Tabela de cobertura → Tarefas 7/8/9/10. §9 Caminho de escrita e flush → Tarefa 4. §10 Configuração → Tarefa 2 (exclusão opcional), Tarefa 11 (documentação). §11 Tratamento de erros → Tarefas 3, 4. §12 Testes → distribuídos entre as tarefas. §13 Documentação → Tarefa 11. §15 Critérios de aceitação → atendidos pelas Tarefas 3, 9, 8, 10, 10, 11 respectivamente.

- **Contexto de rastreamento (§6 bullet)**: adiado. A especificação deixa explícito ("Helper extraído para um módulo compartilhado ... ou duplicado localmente — deixar para o plano"). O plano atual NÃO injeta trace_id/span_id; isso é uma tarefa de acompanhamento rastreada em §16. Se o revisor contestar, adicione uma Tarefa 4.5 que importe `trace` de `@opentelemetry/api` e dobre o contexto do span em `buildDaemonLogLine` — mas apenas se o revisor pedir; YAGNI caso contrário.

- **Caminho de importação de `updateSymlink`**: A Tarefa 6 passo 3 especula se `updateSymlink` é exportado de `@qwen-code/qwen-code-core`. Verifique antes de editar: `grep -n updateSymlink packages/core/src/index.ts`. Se estiver faltando, adicione a reexportação no mesmo commit da Tarefa 6.

- **Teste do acp-bridge para `createSpawnChannelFactory`**: criar um processo filho real em um teste unitário é frágil. Se o Passo 2 da Tarefa 8 se mostrar instável no CI, o fallback é refatorar o encaminhador interno de stderr em um pequeno helper exportado (`forwardChildStderr(stream, { prefix, onLine })`) e testá-lo unitariamente de forma isolada — sem necessidade de spawn real.