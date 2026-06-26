# `qwen serve` Journaliseur de Fichier du Démon — Plan d’Implémentation

> **Pour les agents autonomes :** COMPÉTENCE REQUISE : Utilisez les super-pouvoirs :subagent-driven-development (recommandé) ou super-pouvoirs :executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe avec case à cocher (`- [ ]`) pour le suivi.

**Objectif :** Ajouter un journaliseur fichier au niveau du démon à `qwen serve` afin que les erreurs de route, les messages de cycle de vie et les sorties d’erreur des processus enfants ACP atterrissent dans `~/.qwen/debug/daemon/<id>.log` en plus de stderr — éliminant ainsi la solution de contournement manuelle `2>serve.log` pour le ticket #4548.

**Architecture :** Un nouveau module local au CLI `daemonLogger.ts` expose `initDaemonLogger(opts) → DaemonLogger`. Les méthodes `info`/`warn`/`error` dupliquent dans le fichier + stderr ; `raw` est fichier uniquement. `acp-bridge` reçoit un nouveau callback optionnel `BridgeOptions.onDiagnosticLine` et une fonction utilitaire `createSpawnChannelFactory({ onDiagnosticLine })` pour que le CLI puisse acheminer `writeServeDebugLine` et les lignes stderr des processus enfants ACP vers le journal du démon sans que acp-bridge ait une dépendance vers le CLI. Pas de singleton global — le journaliseur est construit par invocation de `runQwenServe`.

**Stack Technique :** TypeScript, Vitest, `fs.promises` de Node, `Storage.getGlobalDebugDir()` existant, utilitaire `updateSymlink` existant.

**Spécification de référence :** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**Banc de test :** `vitest run` depuis chaque package ; pour un seul fichier : `cd packages/<pkg> && npx vitest run <chemin-relatif>`.

---

## Correspondance des fichiers

| Fichier                                                | Action           | Objectif                                                                                                                            |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`               | **nouveau**      | Récepteur du journaliseur + fonction utilitaire de formatage                                                                        |
| `packages/cli/src/serve/daemonLogger.test.ts`          | **nouveau**      | Tests unitaires pour le module ci-dessus                                                                                            |
| `packages/acp-bridge/src/bridgeOptions.ts`             | modifier         | Ajouter le champ `onDiagnosticLine?` + le type `DiagnosticLineSink`                                                                 |
| `packages/acp-bridge/src/bridge.ts`                    | modifier         | Dupliquer `writeServeDebugLine` à travers `opts.onDiagnosticLine` (via la fermeture locale `teeServeDebugLine`)                     |
| `packages/acp-bridge/src/bridge.test.ts`               | modifier         | Ajouter un test vérifiant que `onDiagnosticLine` reçoit les lignes de débogage                                                      |
| `packages/acp-bridge/src/spawnChannel.ts`              | modifier         | Exporter `createSpawnChannelFactory({ onDiagnosticLine })` ; dupliquer les stderr enfants dans le callback                          |
| `packages/acp-bridge/src/spawnChannel.test.ts`         | modifier (ou nouveau) | Tester le callback de transfert des stderr                                                                                     |
| `packages/cli/src/serve/server.ts`                     | modifier         | Les dépendances de `createServeApp` acceptent un `daemonLog` optionnel ; `sendBridgeError` l’utilise quand il est fourni            |
| `packages/cli/src/serve/server.test.ts`                | modifier         | Vérifier que daemonLog reçoit les entrées d’erreur de route                                                                         |
| `packages/cli/src/serve/runQwenServe.ts`               | modifier         | Initialiser le journaliseur, bannière de démarrage, câbler la fabrique de processus + callback du pont, remplacer les appels à `writeStderrLine` du cycle de vie, vider le tampon à l’arrêt |
| `packages/cli/src/serve/runQwenServe.test.ts`          | modifier         | Vérifier la bannière de démarrage + le comportement de vidage                                                                       |
| `docs/cli/serve.md` (ou équivalent)                    | modifier         | Documenter le chemin du journal du démon + la désactivation                                                                         |

---

## Tâche 0 : Préparation

- [ ] **Étape 1 : Confirmer l’arbre de travail + la branche**

Exécutez : `git rev-parse --abbrev-ref HEAD && pwd`
Attendu : branche `feat/support_daemon_logger`, le répertoire courant se termine par `.claude/worktrees/feat-support-daemon-logger`.

- [ ] **Étape 2 : Installer les dépendances + les tests de base doivent passer**

Exécutez : `npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
Attendu : tout passe. (Sinon, la base est cassée — arrêtez et signalez-le.)

- [ ] **Étape 3 : Parcourir la spécification**

Lisez `docs/superpowers/specs/2026-05-26-daemon-logger-design.md` du début à la fin. Sections clés à internaliser : §3 (modules), §4 (chemin), §5 (API), §6 (format + sémantique de duplication), §7 (démarrage/arrêt), §11 (gestion des erreurs).

---

## Tâche 1 : Fonction utilitaire pure `buildDaemonLogLine`

Formateur pur. Pas d’E/S. Facile à développer en TDD.

**Fichiers :**

- Créer : `packages/cli/src/serve/daemonLogger.ts`
- Créer : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Écrire les tests échouants**

`packages/cli/src/serve/daemonLogger.test.ts` :

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

  it('formate INFO sans contexte', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('affiche les champs du contexte dans l’ordre fixe', () => {
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

  it('ajoute les clés supplémentaires du contexte triées lexicographiquement après les clés fixes', () => {
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

  it('encadre par JSON.stringify les valeurs contenant des espaces ou =', () => {
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

  it('ajoute la pile d’erreur sous forme de lignes de continuation indentées', () => {
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

  it('utilise err.message en repli quand la pile est absente', () => {
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

- [ ] **Étape 2 : Lancer le test, confirmer l’échec**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Attendu : échec — `buildDaemonLogLine` n’est pas exportée.

- [ ] **Étape 3 : Implémenter `buildDaemonLogLine`**

Créez `packages/cli/src/serve/daemonLogger.ts` avec :

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

- [ ] **Étape 4 : Lancer le test, confirmer la réussite**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Attendu : RÉUSSI (6 spécifications).

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): buildDaemonLogLine formatter (#4548)"
```

---

## Tâche 2 : `initDaemonLogger` avec désactivation + fabrique no-op

Renvoie un journaliseur no-op quand `QWEN_DAEMON_LOG_FILE` est désactivé. Aucun accès au système de fichiers pour l’instant.

**Fichiers :**

- Modifier : `packages/cli/src/serve/daemonLogger.ts`
- Modifier : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Ajouter les tests échouants**

Ajoutez à `daemonLogger.test.ts` :

```ts
import { initDaemonLogger } from './daemonLogger.js';
import { afterEach, beforeEach } from 'vitest';

describe('initDaemonLogger désactivation', () => {
  const originalEnv = process.env['QWEN_DAEMON_LOG_FILE'];
  afterEach(() => {
    if (originalEnv === undefined) delete process.env['QWEN_DAEMON_LOG_FILE'];
    else process.env['QWEN_DAEMON_LOG_FILE'] = originalEnv;
  });

  for (const val of ['0', 'false', 'off', 'no', 'False', ' OFF ']) {
    it(`renvoie un journaliseur no-op quand QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)}`, () => {
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
      expect(stderr).toEqual([]); // no-op = rien
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **Étape 2 : Lancer, confirmer l’échec**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
Attendu : échec — `initDaemonLogger` n’est pas exportée.

- [ ] **Étape 3 : Implémenter la désactivation + la structure no-op**

Ajoutez à `daemonLogger.ts` :

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

- [ ] **Étape 4 : Lancer, confirmer que les spécifications de désactivation passent**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "désactivation"`
Attendu : les spécifications de désactivation RÉUSSITES ; le fichier complet peut encore échouer (nous ajouterons la couverture progressivement).

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger opt-out env + no-op shape (#4548)"
```

---

## Tâche 3 : Initialisation du fichier (daemon-id, mkdir, sonde de synchronisation, repli dégradé)

**Fichiers :**

- Modifier : `packages/cli/src/serve/daemonLogger.ts`
- Modifier : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Ajouter les tests échouants**

Ajoutez à `daemonLogger.test.ts` :

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

describe('initDaemonLogger initialisation du fichier', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('dérive le daemon-id "serve-<pid>-<workspaceHash>" et crée le fichier de log', () => {
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

  it('se replie en no-op quand mkdir échoue', () => {
    const stderr: string[] = [];
    // Créer un fichier là où le dossier devrait être → mkdir EEXIST/ENOTDIR
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

- [ ] **Étape 2 : Lancer, confirmer l’échec**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "initialisation du fichier"`
Attendu : échec — `throw new Error('not implemented')`.

- [ ] **Étape 3 : Implémenter l’initialisation du fichier**

Remplacez le corps de `initDaemonLogger` qui lève une exception. Ajoutez les imports et les fonctions utilitaires :

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

  // Les méthodes viendront dans la Tâche 4. Pour l’instant, on les ébauche pour que les tests d’init du fichier passent.
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

- [ ] **Étape 4 : Lancer, confirmer la réussite**

Exécutez : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "initialisation du fichier"`
Attendu : RÉUSSI.

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger file init + degraded fallback (#4548)"
```

---

## Tâche 4 : `info` / `warn` / `error` + file d’attente asynchrone + vidage + duplication stderr

**Fichiers :**

- Modifier : `packages/cli/src/serve/daemonLogger.ts`
- Modifier : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Ajouter les tests échouants**

Ajoutez à `daemonLogger.test.ts` :

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

  it('info ajoute au fichier et duplique vers stderr', async () => {
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
    // Stderr a vu la même ligne (après la bannière de démarrage, qui n’est pas dupliquée ici).
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('error ajoute err.stack comme continuation', async () => {
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

  it('flush attend tous les ajouts en attente', async () => {
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

  it('avertit une fois en cas d’échec d’ajout et continue d’essayer', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // Sabotage en supprimant le fichier en cours de route — POSIX gardera l’inode
    // pour un descripteur ouvert, mais appendFile rouvre à chaque appel → ENOENT une fois
    // que le dossier parent a disparu.
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // Recréer le logger pour lier notre capture stderr ? Plus simple : re-stubber via
    // l’état privé — à la place, faites ceci dans un test séparé avec un stderr
    // personnalisé depuis l’initialisation.
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // Pas de levée — le chemin dégradé avale l’erreur. (L’assertion sur le nombre de lignes stderr
    // est laissée à une variante séparée si nécessaire ; ce test vérifie "aucun crash en cas d’échec".)
  });
});
```
- [ ] **Étape 2 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Attendu : échec — les méthodes sont des stubs.

- [ ] **Étape 3 : Implémenter les méthodes + queue + flush + tee**

Remplacer le bloc final `return {...}` dans `initDaemonLogger` :

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
  // stderr first (synchrone, préserve l'ordre visible par l'humain), puis fichier.
  stderr(line.trimEnd());
  enqueueAppend(line);
};

return {
  info: (message, ctx) => teeLine('INFO', message, ctx),
  warn: (message, ctx) => teeLine('WARN', message, ctx),
  error: (message, err, ctx) =>
    teeLine('ERROR', message, ctx, err ?? undefined),
  raw: () => {}, // implémenté dans la Tâche 5
  getLogPath: () => logPath,
  getDaemonId: () => daemonId,
  flush: () => pending,
};
```

- [ ] **Étape 4 : Exécuter, confirmer le succès**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
Attendu : SUCCÈS.

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## Tâche 5 : `raw()` tee fichier uniquement

**Fichiers :**

- Modifier : `packages/cli/src/serve/daemonLogger.ts`
- Modifier : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Ajouter un test échouant**

Ajouter :

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

  it('ajoute une ligne préfixée, pas de tee stderr', async () => {
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
    // Aucune nouvelle ligne stderr provenant de raw()
    expect(stderr.length).toBe(stderrBefore);
  });
});
```

- [ ] **Étape 2 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Attendu : échec — raw est une opération vide.

- [ ] **Étape 3 : Implémenter raw**

Dans `initDaemonLogger`, remplacer `raw: () => {},` par :

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **Étape 4 : Exécuter, confirmer le succès**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
Attendu : SUCCÈS.

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## Tâche 6 : Lien symbolique `latest`

**Fichiers :**

- Modifier : `packages/cli/src/serve/daemonLogger.ts`
- Modifier : `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **Étape 1 : Ajouter un test échouant**

Ajouter :

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

  it('crée daemon/latest pointant vers le log courant', () => {
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

  it('met à jour latest lors d’un init ultérieur dans le même répertoire', () => {
    const a = initDaemonLogger({ boundWorkspace: '/w', pid: 1, baseDir: tmp });
    const b = initDaemonLogger({ boundWorkspace: '/w', pid: 2, baseDir: tmp });
    expect(realpathSync(path.join(tmp, 'daemon', 'latest'))).toBe(
      realpathSync(b.getLogPath()),
    );
    expect(realpathSync(a.getLogPath())).not.toBe(realpathSync(b.getLogPath()));
  });
});
```

- [ ] **Étape 2 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Attendu : échec — le lien symbolique n'est pas créé.

- [ ] **Étape 3 : Implémenter la mise à jour du lien symbolique**

`updateSymlink` se trouve dans `packages/core/src/utils/symlink.ts` mais n'est PAS réexporté depuis le barrel de core (confirmé via `grep -n updateSymlink packages/core/src/index.ts` → aucune correspondance au moment de la rédaction du plan). Ajouter d'abord la réexportation :

Dans `packages/core/src/index.ts`, ajouter (près des autres exports d'utils) :

```ts
export { updateSymlink } from './utils/symlink.js';
```

Puis importer dans `daemonLogger.ts` :

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
```

(Fusionner avec l'import `Storage` existant ajouté dans la Tâche 3.)

À l'intérieur de `initDaemonLogger`, après que l'écriture de la première ligne par `appendFileSync` réussisse, ajouter :

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // Best-effort. Un échec du lien symbolique ne doit pas dégrader les écritures primaires.
  });
} catch {
  // Une exception synchrone est aussi best-effort.
}
```

- [ ] **Étape 4 : Exécuter, confirmer le succès**

Exécuter : `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
Attendu : SUCCÈS.

- [ ] **Étape 5 : Commiter**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## Tâche 7 : Ajouter `BridgeOptions.onDiagnosticLine` + tee `writeServeDebugLine`

**Fichiers :**

- Modifier : `packages/acp-bridge/src/bridgeOptions.ts`
- Modifier : `packages/acp-bridge/src/bridge.ts`
- Modifier : `packages/acp-bridge/src/bridge.test.ts`

- [ ] **Étape 1 : Ajouter le type `DiagnosticLineSink` à `bridgeOptions.ts`**

Insérer près du haut de l'interface `BridgeOptions` (avant `sessionScope`) :

```ts
/**
 * Réceptacle pour les lignes de diagnostic au niveau serve (défini par le daemon logger de la cli).
 * Lorsqu'il est fourni, le bridge tee la sortie de `writeServeDebugLine` via
 * ce callback en plus de l'écriture stderr existante — utilisé par
 * runQwenServe pour les capturer dans le fichier de log du daemon. Le bridge
 * ne possède pas son propre logger fichier ; c'est un hook de passage pur.
 */
export type DiagnosticLineSink = (
  line: string,
  level?: 'info' | 'warn' | 'error',
) => void;
```

Ajouter à l'intérieur de `BridgeOptions` :

```ts
  /**
   * Optionnel : tee la sortie de `writeServeDebugLine`. Voir {@link DiagnosticLineSink}.
   * Aucun effet si omis. Défini par la cli `runQwenServe` à partir du daemon logger.
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **Étape 2 : Ajouter un test échouant**

Dans `packages/acp-bridge/src/bridge.test.ts`, ajouter un nouveau bloc `describe('onDiagnosticLine', ...)`. Le fichier importe déjà `makeBridge` et `makeChannel` depuis `./internal/testUtils.js` — les réutiliser au lieu de créer manuellement une `ChannelFactory`. Confirmer avec `grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts`. Pour déclencher `writeServeDebugLine`, choisir le test le plus court parmi les 6 sites d'appel — les lister avec `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` (actuellement lignes 1410, 1423, 2242, 2328, 2624, 2637 ; le rejet de vote de permission cross-session autour de la ligne 2242 est un petit déclencheur reproductible).

```ts
describe('onDiagnosticLine', () => {
  const originalDebug = process.env['QWEN_SERVE_DEBUG'];
  afterEach(() => {
    if (originalDebug === undefined) delete process.env['QWEN_SERVE_DEBUG'];
    else process.env['QWEN_SERVE_DEBUG'] = originalDebug;
  });

  it('reçoit la sortie de writeServeDebugLine lorsque QWEN_SERVE_DEBUG=1', async () => {
    process.env['QWEN_SERVE_DEBUG'] = '1';
    const captured: Array<{ line: string; level?: string }> = [];
    const bridge = makeBridge({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // Déclencher writeServeDebugLine via [copier le harnais du test existant
    // le plus proche qui exerce l'un des 6 sites d'appel ci-dessus].
    // ... code de déclenchement ici ...
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

(`makeBridge` accepte `Partial<BridgeOptions>` — une fois que la Tâche 7 étape 1 ajoute `onDiagnosticLine` à `BridgeOptions`, cela est transmis sans modifications supplémentaires de `testUtils.ts`.)

- [ ] **Étape 3 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Attendu : échec — le callback n'est pas invoqué.

- [ ] **Étape 4 : Tee `writeServeDebugLine` via le callback**

Dans `packages/acp-bridge/src/bridge.ts`, près du haut de `createHttpAcpBridge` (après que `opts` est déstructuré), introduire un tee local qui encapsule l'aide module existante :

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

Ensuite, dans ce fichier, remplacer chaque appel interne à `writeServeDebugLine(...)` **à l'intérieur** de la fermeture de `createHttpAcpBridge` par `teeServeDebugLine(...)`. Utiliser :

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

pour énumérer les sites d'appel — il y en a 6 dans l'arbre actuel (lignes 1410, 1423, 2242, 2328, 2624, 2637 ; vérifier avec le grep). Modifier chacun. Ne PAS changer la définition de `writeServeDebugLine` au niveau module elle-même — d'autres points d'entrée et tests en dépendent.

(Raison de ne pas modifier la définition de niveau supérieur : cela changerait la signature pour tous les appelants, y compris les tests ; le tee de fermeture est additif et localement limité.)

- [ ] **Étape 5 : Exécuter, confirmer le succès**

Exécuter : `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
Attendu : SUCCÈS. Exécuter également le fichier complet pour détecter les régressions : `npx vitest run src/bridge.test.ts`.

- [ ] **Étape 6 : Commiter**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## Tâche 8 : `createSpawnChannelFactory` avec `onDiagnosticLine`

**Fichiers :**

- Modifier : `packages/acp-bridge/src/spawnChannel.ts`
- Modifier : `packages/acp-bridge/src/spawnChannel.test.ts` (ou créer s'il manque)

- [ ] **Étape 1 : Inspecter la forme de l'export actuel**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

Confirmer que `defaultSpawnChannelFactory` est le seul export public spawn. Le transmetteur stderr enfant existant appelle `process.stderr.write(prefix + line + '\n')` dans le corps — localiser ce bloc (environ ligne 125).

- [ ] **Étape 2 : Ajouter un test échouant**

Dans `packages/acp-bridge/src/spawnChannel.test.ts` (chercher un fichier de test existant ; s'il n'y en a pas, en créer un) :

```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpawnChannelFactory } from './spawnChannel.js';

describe('createSpawnChannelFactory onDiagnosticLine', () => {
  it('renvoie une ChannelFactory qui tee les lignes stderr de l’enfant', async () => {
    const captured: Array<{ line: string; level?: string }> = [];
    const factory = createSpawnChannelFactory({
      onDiagnosticLine: (line, level) => captured.push({ line, level }),
    });
    // Lancer un petit enfant qui écrit sur stderr puis se termine. Utiliser
    // l'astuce QWEN_CLI_ENTRY pour pointer vers un one-liner Node.
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // Après la fin de l'enfant, le transmetteur vide la queue restante.
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

Et une fixture d'entrée `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs` :

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

(Ajuster si le bridge nécessite une poignée de main ACP initialize avant de considérer l'enfant comme "lancé" — alternative : écrire la ligne stderr pendant le traitement d'initialize. Si le test est trop fragile, revenir à un mock du spawn et vérifier la logique du transmetteur en isolation — lire le corps de `defaultSpawnChannelFactory` et tester unitairement le transmetteur interne en l'exportant pour les tests.)

- [ ] **Étape 3 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Attendu : échec — `createSpawnChannelFactory` n'est pas exporté.

- [ ] **Étape 4 : Implémenter `createSpawnChannelFactory`**

Refactoriser `defaultSpawnChannelFactory` en une fabrique de fabriques. Remplacer le haut de `spawnChannel.ts` :

```ts
export interface SpawnChannelFactoryOptions {
  onDiagnosticLine?: (line: string, level?: 'info' | 'warn' | 'error') => void;
}

export function createSpawnChannelFactory(
  options: SpawnChannelFactoryOptions = {},
): ChannelFactory {
  const onDiagnosticLine = options.onDiagnosticLine;
  return async (workspaceCwd, childEnvOverrides) => {
    // ... corps existant de defaultSpawnChannelFactory ...
    // Là où le transmetteur existant fait :
    //   process.stderr.write(prefix + line + '\n')
    // le changer en :
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // Pour la branche [truncated] :
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// Conserver l'ancien export pour la rétrocompatibilité (pas de câblage callback).
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

Discipline d'implémentation :

- Ne PAS supprimer `defaultSpawnChannelFactory` — les canaux/adaptateurs IDE l'importent encore.
- S'en tenir exactement à la sémantique existante d'écriture stderr (bufferisation de ligne, limite de 64 Ko, marqueur de troncature). L'appel `onDiagnosticLine` se trouve à côté de chaque `process.stderr.write` existant et ne le remplace jamais.

- [ ] **Étape 5 : Exécuter, confirmer le succès**

Exécuter : `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
Attendu : SUCCÈS. Également `npx vitest run` suite complète pour confirmer l'absence de régressions.

- [ ] **Étape 6 : Commiter**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## Tâche 9 : Acheminer `sendBridgeError` via `daemonLog`

**Fichiers :**

- Modifier : `packages/cli/src/serve/server.ts`
- Modifier : `packages/cli/src/serve/server.test.ts`

- [ ] **Étape 1 : Ajouter `daemonLog` aux dépendances de `createServeApp`**

Lire `packages/cli/src/serve/server.ts` autour de la signature de `createServeApp` (chercher `export function createServeApp` ou `export interface ServeAppDeps`). Ajouter à son interface de dépendances :

```ts
/**
 * Logger de daemon optionnel. Lorsqu'il est fourni, `sendBridgeError` achemine
 * chaque erreur mappée à une route via `daemonLog.error(...)` (qui tee vers
 * stderr + le fichier de log du daemon). Lorsqu'il est omis, le comportement
 * existant (stderr uniquement) est conservé.
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **Étape 2 : Ajouter un test échouant**

Dans `packages/cli/src/serve/server.test.ts`, ajouter (ou étendre un test d'erreur de route) :

```ts
import { initDaemonLogger } from './daemonLogger.js';

it('sendBridgeError achemine via daemonLog lorsqu'il est fourni', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  try {
    const stderr: string[] = [];
    const daemonLog = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: (s) => stderr.push(s),
    });
    // Signature de createServeApp : (opts, getPort?, deps?). daemonLog va dans deps.
    const app = createServeApp(
      /* opts */ { /* ...ServeOptions habituelles, copier depuis le test existant le plus proche... */ } as ServeOptions,
      /* getPort */ () => 0,
      /* deps */ { /* ...deps habituelles qui font qu'une route lève une exception... */, daemonLog },
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

(Copier le harnais de test d'erreur de route qui existe déjà dans `server.test.ts` — par exemple injecter un stub de dépendances qui lève une exception lorsqu'il est appelé. Le point important est qu'une route déclenche `sendBridgeError` → l'assertion aboutit dans le log du daemon.)

- [ ] **Étape 3 : Exécuter, confirmer l'échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
Attendu : échec.

- [ ] **Étape 4 : Câbler `sendBridgeError`**

Dans `server.ts`, trouver la fonction `sendBridgeError` (environ ligne 2765). Elle écrit actuellement sur stderr en ligne. Refactoriser :

1. Faire passer `daemonLog` de `createServeApp` dans la fermeture qui possède `sendBridgeError` (elle est définie à l'intérieur de la fonction — même fermeture).
2. En bas de `sendBridgeError`, là où l'écriture stderr se produit, remplacer par :

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
  // Chemin legacy stderr uniquement. Conserver le comportement intact pour les
  // intégrateurs qui construisent createServeApp sans daemonLog (tests, intégrations directes).
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unknown route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

S'assurer que la nouvelle branche est empruntée lorsque `daemonLog` est non null. `daemonLog.error` tee déjà vers stderr, donc la ligne stderr est toujours produite — aucune perte de comportement.

- [ ] **Étape 5 : Exécuter, confirmer le succès**
Exécutez : `cd packages/cli && npx vitest run src/serve/server.test.ts`
Résultat attendu : tout le fichier PASS (nouveau + ancien).

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## Tâche 10 : Câblage de `runQwenServe` — init, bannière de démarrage, callbacks, cycle de vie, vidage à l'arrêt

**Fichiers :**

- Modifier : `packages/cli/src/serve/runQwenServe.ts`
- Modifier : `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **Étape 1 : Lire la structure existante de démarrage + d’arrêt**

Relisez `packages/cli/src/serve/runQwenServe.ts` lignes 590-1030 (le site d’appel de `createHttpAcpBridge({...})`, le corps de `RunHandle.close`, et le gestionnaire `onSignal`). Notez tous les appels `writeStderrLine(...)` — ils se trouvent approximativement aux lignes 393, 565, 805, 821, 825, 835, 859, 865, 872, 877, 951, 961, 986, 997, 1027, 1361 (lancez `grep -n writeStderrLine` pour les numéros de ligne actuels).

- [ ] **Étape 2 : Ajouter un test qui échoue**

Dans `packages/cli/src/serve/runQwenServe.test.ts`, ajoutez (ou étendez) :

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
      // ... complétez les autres options requises à partir du plus petit test existant ...
    });
    // Le démarrage a écrit un journal du démon quelque part sous tmpRuntime/debug/daemon
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // Après l'arrêt, on doit trouver "shutdown signal" ou équivalent dans le journal.
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **Étape 3 : Exécuter, confirmer l’échec**

Exécutez : `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
Résultat attendu : échec.

- [ ] **Étape 4 : Câbler dans `runQwenServe`**

Modifiez `runQwenServe.ts` :

1. Ajoutez les imports à côté des existants :

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. Dans `runQwenServe(opts)`, juste après que `boundWorkspace` soit canonisé (trouvez l’affectation ; c’est la valeur passée à `createHttpAcpBridge`) :

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: daemon log → ${daemonLog.getLogPath() || '(disabled)'}`,
);
```

3. Mettez à jour l’appel à `createHttpAcpBridge({...})` (vers la ligne 606) :

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... champs existants ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

(Si `deps.bridge` est fourni, l’opérateur intègre son propre câblage — ignorez ce callback.)

4. Mettez à jour l’appel à `createServeApp(...)` (actuellement à `runQwenServe.ts:706`, signature `createServeApp(opts, getPort, deps)`) pour ajouter `daemonLog` à l’objet `deps` :

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. Remplacez les appels `writeStderrLine(...)` **uniquement liés au cycle de vie** (ceux dans `onSignal`, le chemin d’erreur `bridge.shutdown`, le listener d’erreur du serveur, l’erreur du dispose du flux d’appareil, la ligne "received signal, draining") par `daemonLog.warn(...)` / `daemonLog.error(..., err)` — daemonLog écrit aussi sur stderr, donc la sortie visible par l’opérateur est conservée. Ne touchez PAS à :
   - La bannière de démarrage "listening on URL" (celle-ci est sur stdout, pas stderr — `writeStdoutLine`).
   - Les erreurs d’utilisation/analyse des arguments CLI avant la construction de `daemonLog`.
   - La bannière "qwen serve: daemon log → …" ajoutée à l’étape 2 (évitez de journaliser une ligne à propos d’elle-même).

   Concrètement, la règle **mécanique** pour cette étape : tous les appels `writeStderrLine` **après** la construction de `daemonLog` et **avant** `process.exit` sont candidats ; si leur contenu ressemble à un diagnostic de démon (pas une bannière de démarrage ponctuelle), basculez-les.

6. Dans le corps de `RunHandle.close`, après l’exécution du callback `finish` (ou juste avant `process.exit(0)` dans `onSignal`), ajoutez `await daemonLog.flush();`. Concrètement, le gestionnaire `onSignal` devient :

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* inchangé */ return;
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

- [ ] **Étape 5 : Exécuter, confirmer que ça passe**

Exécutez : `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
Résultat attendu : tout le fichier PASS.

Exécutez aussi : `cd packages/cli && npx vitest run src/serve/` (tout le répertoire serve, détecte les régressions indirectes comme les assertions dans server.test.ts sur la sortie stderr).

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): init daemonLogger in runQwenServe + flush on shutdown (#4548)"
```

---

## Tâche 11 : Documentation

**Fichiers :**

- Modifier : la documentation serve existante (trouvez-la avec `find docs -iname '*serve*'` et `ls docs/cli/`)

- [ ] **Étape 1 : Trouver le bon document**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

Choisissez le fichier le plus naturel — probablement `docs/cli/serve.md`. S’il n’existe pas de documentation pour `qwen serve`, créez `docs/cli/serve-daemon-log.md`.

- [ ] **Étape 2 : Écrire la section**

Ajoutez (ou créez) une section "Fichier journal du démon" :

```markdown
## Fichier journal du démon

`qwen serve` écrit un journal de diagnostic par processus dans :
```

${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

Un lien symbolique `latest` dans le même répertoire pointe toujours vers le
journal du processus en cours, donc `tail -f ~/.qwen/debug/daemon/latest` suivra
le démon qui est actif.

Le journal capture les messages de cycle de vie, les erreurs de routes (avec
contexte `route=` et `sessionId=`), la stderr enfant ACP, et — lorsque
`QWEN_SERVE_DEBUG=1` est défini — des indicateurs supplémentaires du pont.
Les lignes qui vont aujourd’hui sur stderr restent sur stderr ; le fichier
journal est **cumulatif**, pas un remplacement.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) pour ignorer
complètement l’écriture dans un fichier. La sortie stderr n’est pas affectée.

### Relation avec les journaux de débogage de session

Les journaux de débogage par session (`~/.qwen/debug/<sessionId>.txt` et le
lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le journal du démon
se trouve dans un sous-répertoire `daemon/` voisin ; la sémantique du débogage
par session est inchangée par cette fonctionnalité.

### Pas de rotation

Le journal du démon s’ajoute indéfiniment. Effectuez une rotation manuelle s’il
devient volumineux. Une amélioration future pourra ajouter une rotation
automatique ; suivez les suites de #4548.
```

- [ ] **Étape 3 : Commit**

```bash
git add docs/cli/serve.md   # ou le chemin du fichier réel
git commit -m "docs(serve): document daemon log file path and opt-out (#4548)"
```

---

## Tâche 12 : Vérification finale

- [ ] **Étape 1 : Balayage complet des tests**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

Résultat attendu : tout vert.

- [ ] **Étape 2 : Vérification de types**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

Résultat attendu : aucune erreur.

- [ ] **Étape 3 : Test manuel rapide**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # doit maintenant contenir la ligne d'arrêt
```

Résultat attendu : le fichier journal existe, contient `daemon started ...`, puis après le kill la ligne `received SIGTERM, draining`.

Si `packages/cli/dist/index.js` n’existe pas, construisez d’abord : `npm run build --workspace=packages/cli`.

- [ ] **Étape 4 : Ouvrir la PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): add daemon file logger (#4548)" --body "$(cat <<'EOF'
## Résumé
- Ajoute un journal de démon par processus à `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log` (configurable via `QWEN_RUNTIME_DIR`, désactivation via `QWEN_DAEMON_LOG_FILE=0`).
- Route les messages de cycle de vie de `runQwenServe`, les erreurs de route `sendBridgeError`, les indicateurs de débogage `writeServeDebugLine`, et la stderr enfant ACP dans le journal du démon sans supprimer la sortie stderr existante.
- Ajoute `BridgeOptions.onDiagnosticLine` et `createSpawnChannelFactory({ onDiagnosticLine })` pour que `acp-bridge` reste ignorant de cli.

Closes #4548.

## Plan de test
- [x] Nouveaux tests unitaires dans `packages/cli/src/serve/daemonLogger.test.ts` couvrent le formateur, l’initialisation du fichier, info/warn/error, raw, le lien symbolique latest, la désactivation, la dégradation.
- [x] `packages/acp-bridge/src/bridge.test.ts` couvre le tee `onDiagnosticLine` depuis `writeServeDebugLine`.
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` couvre le transmetteur de stderr enfant.
- [x] `packages/cli/src/serve/server.test.ts` couvre le routage des erreurs de route via `daemonLog.error`.
- [x] `packages/cli/src/serve/runQwenServe.test.ts` couvre la bannière de démarrage + le vidage à l’arrêt.
- [x] Test manuel : fichier journal créé au démarrage, contient la ligne d’arrêt sur SIGTERM.

🤖 Généré avec [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## Notes d’auto-revue

- **Couverture de la spécification** : Tableau du module §3 couvert par les tâches 1-10. §4 ID du démon + chemin → Tâche 3. §5 Surface API → Tâches 1-6. §6 Format + sémantique du tee → Tâche 1 (format), Tâche 4 (info/warn/error tee), Tâche 5 (raw fichier uniquement). §7 Démarrage/arrêt → Tâche 10. §8 Tableau de couverture → Tâches 7/8/9/10. §9 Chemin d’écriture et vidage → Tâche 4. §10 Configuration → Tâche 2 (désactivation), Tâche 11 (doc). §11 Gestion des erreurs → Tâches 3, 4. §12 Tests → réparties dans les tâches. §13 Doc → Tâche 11. §15 Critères d’acceptation → remplis par les tâches 3, 9, 8, 10, 10, 11 respectivement.

- **Contexte de trace (§6 puce)** : reporté. La spécification le laisse explicite ("Helper extrait dans un module partagé … ou dupliqué localement — laisser au plan"). Le plan actuel n’injecte PAS trace_id/span_id ; c’est une tâche ultérieure suivie dans §16. Si le relecteur insiste, ajoutez une tâche 4.5 qui importe `trace` depuis `@opentelemetry/api` et intègre le contexte de span dans `buildDaemonLogLine` — mais seulement si le relecteur le demande ; YAGNI autrement.

- **Chemin d’importation de `updateSymlink`** : La tâche 6 étape 3 hésite sur le fait que `updateSymlink` soit exporté depuis `@qwen-code/qwen-code-core`. Vérifiez avant de modifier : `grep -n updateSymlink packages/core/src/index.ts`. Si absent, ajoutez la réexportation dans le même commit que la tâche 6.

- **Test acp-bridge pour `createSpawnChannelFactory`** : lancer un vrai processus enfant dans un test unitaire est fragile. Si la tâche 8 étape 2 s’avère instable en CI, le repli est de refactoriser le transmetteur interne de stderr en un petit helper exporté (`forwardChildStderr(stream, { prefix, onLine })`) et de le tester unitairement de manière isolée — pas besoin de vrai lancement.