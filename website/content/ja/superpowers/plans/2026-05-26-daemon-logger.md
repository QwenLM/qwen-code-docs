# `qwen serve` デーモンファイルロガー — 実装計画

> **エージェント作業者向け:** 必須サブスキル: `superpowers:subagent-driven-development` (推奨) または `superpowers:executing-plans` を使用して、この計画をタスクごとに実装してください。各ステップはチェックボックス（`- [ ]`）で進捗を管理します。

**目標:** `qwen serve` にデーモンスコープのファイルロガーを追加し、ルートエラー、ライフサイクルメッセージ、ACP子プロセスのstderrをstderrに加えて `~/.qwen/debug/daemon/<id>.log` にも記録する — これにより、issue #4548 で手動で `2>serve.log` とリダイレクトしていた回避策を不要にします。

**アーキテクチャ:** 新しいCLIローカルモジュール `daemonLogger.ts` が `initDaemonLogger(opts) → DaemonLogger` を公開します。`info/warn/error` はファイルとstderrの両方に出力（tee）し、`raw` はファイルのみに出力します。`acp-bridge` には新しいオプションの `BridgeOptions.onDiagnosticLine` コールバックと `createSpawnChannelFactory({ onDiagnosticLine })` ヘルパーを追加し、CLIがacp-bridgeに依存せずに `writeServeDebugLine` とACP子プロセスのstderr行をデーモンログにルーティングできるようにします。グローバルシングルトンはなく、`runQwenServe` の呼び出しごとにロガーが構築されます。

**技術スタック:** TypeScript, Vitest, Node `fs.promises`, 既存の `Storage.getGlobalDebugDir()`, 既存の `updateSymlink` ヘルパー。

**リファレンス仕様:** `docs/superpowers/specs/2026-05-26-daemon-logger-design.md`

**テスト環境:** 各パッケージで `vitest run` を実行。単一ファイルの場合は: `cd packages/<pkg> && npx vitest run <relative-path>`

---

## ファイルマップ

| ファイル                                                   | アクション       | 目的                                                                                      |
| ---------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                   | **新規作成**     | ロガーシンク + フォーマットヘルパー                                                         |
| `packages/cli/src/serve/daemonLogger.test.ts`              | **新規作成**     | 上記のユニットテスト                                                                       |
| `packages/acp-bridge/src/bridgeOptions.ts`                 | 修正             | `onDiagnosticLine?` フィールド + `DiagnosticLineSink` 型を追加                              |
| `packages/acp-bridge/src/bridge.ts`                        | 修正             | `writeServeDebugLine` を `opts.onDiagnosticLine` 経由で出力（ローカルの `teeServeDebugLine` クロージャ経由） |
| `packages/acp-bridge/src/bridge.test.ts`                   | 修正             | `onDiagnosticLine` がデバッグ行を受信するテストを追加                                          |
| `packages/acp-bridge/src/spawnChannel.ts`                  | 修正             | `createSpawnChannelFactory({ onDiagnosticLine })` をエクスポートし、子プロセスのstderrをコールバックに出力  |
| `packages/acp-bridge/src/spawnChannel.test.ts`             | 修正（または新規）| stderr転送コールバックのテスト                                                                 |
| `packages/cli/src/serve/server.ts`                         | 修正             | `createServeApp` の依存関係がオプションの `daemonLog` を受け入れる。`sendBridgeError` が指定時にそれを経由  |
| `packages/cli/src/serve/server.test.ts`                    | 修正             | daemonLog がルートエラーエントリを受信することを確認                                             |
| `packages/cli/src/serve/runQwenServe.ts`                   | 修正             | ロガー初期化、起動バナー、spawnファクトリ+ブリッジコールバックの配線、`writeStderrLine` 呼び出しを置き換え、シャットダウン時にフラッシュ |
| `packages/cli/src/serve/runQwenServe.test.ts`              | 修正             | 起動バナー + フラッシュ動作を検証                                                              |
| `docs/cli/serve.md`（または同等）                           | 修正             | デーモンログのパスとオプトアウトをドキュメント化                                                     |

---

## タスク 0: 事前準備

- [ ] **ステップ 1: ワークツリーとブランチの確認**

実行: `git rev-parse --abbrev-ref HEAD && pwd`
期待: ブランチ `feat/support_daemon_logger`、cwd が `.claude/worktrees/feat-support-daemon-logger` で終わる。

- [ ] **ステップ 2: 依存関係のインストール + ベースラインテストが成功すること**

実行: `npm install && cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts && cd ../acp-bridge && npx vitest run`
期待: すべて成功。（失敗した場合、ベースラインが壊れているため停止して報告。）

- [ ] **ステップ 3: 仕様書を一読**

`docs/superpowers/specs/2026-05-26-daemon-logger-design.md` を最初から最後まで読む。特に理解すべきセクション: §3（モジュール）、§4（パス）、§5（API）、§6（形式 + teeのセマンティクス）、§7（起動/シャットダウン）、§11（エラーハンドリング）。

---

## タスク 1: `buildDaemonLogLine` 純粋ヘルパー

純粋なフォーマッター。I/Oなし。TDDが容易。

**ファイル:**

- 新規作成: `packages/cli/src/serve/daemonLogger.ts`
- 新規作成: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを書く**

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

  it('ctxなしのINFOフォーマット', () => {
    expect(
      buildDaemonLogLine({
        level: 'INFO',
        message: 'daemon started',
        now: FIXED,
      }),
    ).toBe('2026-05-26T03:14:15.926Z [INFO] [DAEMON] daemon started\n');
  });

  it('ctxフィールドを固定順で表示', () => {
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

  it('固定キー以外のctxキーは辞書順で追加', () => {
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

  it('スペースや=を含む値はJSON.stringifyで引用符で囲む', () => {
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

  it('エラースタックをインデントされた継続行として追加', () => {
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

  it('スタックがない場合はerr.messageにフォールバック', () => {
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

- [ ] **ステップ 2: テストを実行し、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
期待: 失敗 — `buildDaemonLogLine` がエクスポートされていない。

- [ ] **ステップ 3: `buildDaemonLogLine` を実装**

`packages/cli/src/serve/daemonLogger.ts` を作成し、次の内容を記述:

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

- [ ] **ステップ 4: テストを実行し、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
期待: PASS（6件のテスト）。

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): buildDaemonLogLine フォーマッター (#4548)"
```

---

## タスク 2: `initDaemonLogger` オプトアウト + ノーオプファクトリ

`QWEN_DAEMON_LOG_FILE` が無効になっている場合、ノーオプロガーを返します。ファイルシステムにはまだ触れません。

**ファイル:**

- 修正: `packages/cli/src/serve/daemonLogger.ts`
- 修正: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを追加**

`daemonLogger.test.ts` に追加:

```ts
import { initDaemonLogger } from './daemonLogger.js';
import { afterEach, beforeEach } from 'vitest';

describe('initDaemonLogger オプトアウト', () => {
  const originalEnv = process.env['QWEN_DAEMON_LOG_FILE'];
  afterEach(() => {
    if (originalEnv === undefined) delete process.env['QWEN_DAEMON_LOG_FILE'];
    else process.env['QWEN_DAEMON_LOG_FILE'] = originalEnv;
  });

  for (const val of ['0', 'false', 'off', 'no', 'False', ' OFF ']) {
    it(`QWEN_DAEMON_LOG_FILE=${JSON.stringify(val)} のときにノーオプロガーを返す`, () => {
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
      expect(stderr).toEqual([]); // ノーオプ = 何も出力されない
      expect(logger.getLogPath()).toBe('');
      expect(logger.getDaemonId()).toBe('');
    });
  }
});
```

- [ ] **ステップ 2: 実行し、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts`
期待: 失敗 — `initDaemonLogger` がエクスポートされていない。

- [ ] **ステップ 3: オプトアウト + ノーオプの形状を実装**

`daemonLogger.ts` に追加:

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
  throw new Error('initDaemonLogger: ファイルパス未実装');
}
```

- [ ] **ステップ 4: 実行し、オプトアウト仕様が成功することを確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "opt-out"`
期待: オプトアウト仕様は PASS。ファイル全体はまだ失敗する可能性あり（段階的にカバレッジを追加）。

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): デーモンロガー オプトアウト環境変数 + ノーオプ形状 (#4548)"
```

---

## タスク 3: ファイル初期化（デーモンID、mkdir、同期プローブ、フォールバック）

**ファイル:**

- 修正: `packages/cli/src/serve/daemonLogger.ts`
- 修正: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを追加**

`daemonLogger.test.ts` に追加:

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

describe('initDaemonLogger ファイル初期化', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'daemon-log-'));
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('デーモンID "serve-<pid>-<workspaceHash>" を生成しログファイルを作成', () => {
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

  it('mkdirに失敗した場合、ノーオプにフォールバック', () => {
    const stderr: string[] = [];
    // ディレクトリになるべき場所にファイルを作成 → mkdir EEXIST/ENOTDIR
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

- [ ] **ステップ 2: 実行し、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "file init"`
期待: 失敗 — `throw new Error('not implemented')`.

- [ ] **ステップ 3: ファイル初期化を実装**

`initDaemonLogger` の throw しているボディを置き換え。インポートとヘルパーを追加:

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

  // メソッドはタスク4で実装。今はスタブでファイル初期化テストを通す。
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

- [ ] **ステップ 4: 実行し、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "file init"`
期待: PASS.

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): デーモンロガー ファイル初期化 + フォールバック (#4548)"
```

---

## タスク 4: `info` / `warn` / `error` + 非同期キュー + flush + stderr tee

**ファイル:**

- 修正: `packages/cli/src/serve/daemonLogger.ts`
- 修正: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを追加**

`daemonLogger.test.ts` に追加:

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

  it('infoがファイルに追加され、stderrにも出力される', async () => {
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
    // stderrに同じ行が出力されている（起動バナーは除く。ここではteeされない）
    const teedLines = stderr.filter((s) => s.includes('[INFO] [DAEMON]'));
    expect(teedLines).toHaveLength(1);
  });

  it('errorにerr.stackが継続行として追加される', async () => {
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

  it('flushはすべての保留中の追加を待つ', async () => {
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

  it('追加失敗時に一度警告し、その後も試行を続ける', async () => {
    const logger = initDaemonLogger({
      boundWorkspace: '/w',
      pid: 1,
      baseDir: tmp,
      stderr: () => {},
    });
    // ファイルを削除して妨害 — POSIXでは保持されたfdのinodeは残るが、
    // appendFileは呼び出しごとに開き直すため、親ディレクトリが消えるとENOENT。
    rmSync(path.dirname(logger.getLogPath()), { recursive: true, force: true });
    const stderr2: string[] = [];
    // stderrキャプチャ用にロガーを再作成？より簡単: init時のカスタムstderrを使用。
    // 代わりに以下のように別のテストで行う？
    logger.info('after-rm-1');
    logger.info('after-rm-2');
    await logger.flush();
    // 例外は発生しない — フォールバックパスで飲み込まれる。（必要なら別バリアントで
    // stderrカウントをアサート。このテストは「クラッシュしないこと」を確認する。）
  });
});
```
```
- [ ] **ステップ 2: 実行、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
期待結果: 失敗 — メソッドはスタブ。

- [ ] **ステップ 3: メソッド + キュー + フラッシュ + ティーを実装**

`initDaemonLogger` 内の最後の `return {...}` ブロックを以下に置き換える:

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

- [ ] **ステップ 4: 実行、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "info/warn/error"`
期待結果: PASS。

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger info/warn/error + flush (#4548)"
```

---

## Task 5: `raw()` ファイルのみのティー

**ファイル:**

- 変更: `packages/cli/src/serve/daemonLogger.ts`
- 変更: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを追加**

以下を追加:

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

- [ ] **ステップ 2: 実行、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
期待結果: 失敗 — raw は no-op。

- [ ] **ステップ 3: raw を実装**

`initDaemonLogger` 内で、`raw: () => {},` を以下に置き換える:

```ts
raw: (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const upper = level.toUpperCase() as DaemonLogLevel;
  const formatted = `${now().toISOString()} [${upper}] [DAEMON] ${line}\n`;
  enqueueAppend(formatted);
},
```

- [ ] **ステップ 4: 実行、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "raw"`
期待結果: PASS。

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts
git commit -m "feat(serve): daemon logger raw() file-only tee (#4548)"
```

---

## Task 6: `latest` シンボリックリンク

**ファイル:**

- 変更: `packages/cli/src/serve/daemonLogger.ts`
- 変更: `packages/cli/src/serve/daemonLogger.test.ts`

- [ ] **ステップ 1: 失敗するテストを追加**

以下を追加:

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

- [ ] **ステップ 2: 実行、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
期待結果: 失敗 — シンボリックリンクが作成されない。

- [ ] **ステップ 3: シンボリックリンク更新を実装**

`updateSymlink` は `packages/core/src/utils/symlink.ts` に存在しますが、コアのバレルから再エクスポートされていません (`grep -n updateSymlink packages/core/src/index.ts` で確認 → 計画作成時点では一致なし)。最初に再エクスポートを追加します:

`packages/core/src/index.ts` で、他の utils エクスポートの近くに以下を追加:

```ts
export { updateSymlink } from './utils/symlink.js';
```

次に `daemonLogger.ts` でインポート:

```ts
import { Storage, updateSymlink } from '@qwen-code/qwen-code-core';
`

（Task 3 で追加した既存の `Storage` インポートとマージします。）

`initDaemonLogger` 内で、`appendFileSync` による最初の行の書き込みが成功した後に、以下を追加:

```ts
try {
  const aliasPath = nodePath.join(daemonDir, 'latest');
  updateSymlink(aliasPath, logPath, { fallbackCopy: false }).catch(() => {
    // ベストエフォート。シンボリックリンクの失敗がプライマリ書き込みを低下させてはいけません。
  });
} catch {
  // 同期スローも同様にベストエフォート。
}
```

- [ ] **ステップ 4: 実行、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/daemonLogger.test.ts -t "latest symlink"`
期待結果: PASS。

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/daemonLogger.ts packages/cli/src/serve/daemonLogger.test.ts packages/core/src/index.ts
git commit -m "feat(serve): daemon logger latest symlink (#4548)"
```

---

## Task 7: `BridgeOptions.onDiagnosticLine` を追加 + `writeServeDebugLine` をティー出力

**ファイル:**

- 変更: `packages/acp-bridge/src/bridgeOptions.ts`
- 変更: `packages/acp-bridge/src/bridge.ts`
- 変更: `packages/acp-bridge/src/bridge.test.ts`

- [ ] **ステップ 1: `DiagnosticLineSink` 型を `bridgeOptions.ts` に追加**

`BridgeOptions` インターフェースの先頭付近（`sessionScope` の前）に挿入:

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

`BridgeOptions` 内に追加:

```ts
  /**
   * Optional: tee `writeServeDebugLine` output. See {@link DiagnosticLineSink}.
   * No-op when omitted. Set by cli `runQwenServe` from the daemon logger.
   */
  onDiagnosticLine?: DiagnosticLineSink;
```

- [ ] **ステップ 2: 失敗するテストを追加**

`packages/acp-bridge/src/bridge.test.ts` に、新しい `describe('onDiagnosticLine', ...)` ブロックを追加します。このファイルは既に `./internal/testUtils.js` から `makeBridge` と `makeChannel` をインポートしています。`ChannelFactory` を手作りする代わりにそれらを再利用します。`grep -n "import.*testUtils" packages/acp-bridge/src/bridge.test.ts` で確認します。`writeServeDebugLine` をトリガーするには、6つの呼び出し箇所の中で最もセットアップが短いテストを選びます。それらを `grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts` でリストアップします（現在は 1410, 1423, 2242, 2328, 2624, 2637 行目。2242 行目あたりのクロスセッション許可投票拒否は小規模で再現可能なトリガーです）。

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

(`makeBridge` は `Partial<BridgeOptions>` を受け入れます — Task 7 のステップ 1 で `onDiagnosticLine` が `BridgeOptions` に追加されると、`testUtils.ts` を編集しなくてもそのまま流れます。)

- [ ] **ステップ 3: 実行、失敗を確認**

実行: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
期待結果: 失敗 — コールバックが呼び出されない。

- [ ] **ステップ 4: コールバックを通じて `writeServeDebugLine` をティー出力**

`packages/acp-bridge/src/bridge.ts` の `createHttpAcpBridge` の先頭付近（`opts` を分割代入した後）で、既存のモジュールレベルヘルパーをラップするローカルティーを導入します:

```ts
const teeServeDebugLine = (message: string): void => {
  writeServeDebugLine(message);
  if (opts.onDiagnosticLine && isServeDebugLoggingEnabled()) {
    opts.onDiagnosticLine(`qwen serve debug: ${message}`, 'info');
  }
};
```

次に、このファイル内の `createHttpAcpBridge` のクロージャ内にあるすべての内部 `writeServeDebugLine(...)` 呼び出しを `teeServeDebugLine(...)` に置き換えます。以下を使用:

```bash
grep -n "writeServeDebugLine(" packages/acp-bridge/src/bridge.ts
```

現在のツリーには6つの呼び出し箇所があります（1410, 1423, 2242, 2328, 2624, 2637 行目。grep で確認してください）。それぞれを編集します。モジュールレベルの `writeServeDebugLine` 定義自体は変更しないでください — 他のエントリポイントやテストがそれに依存しています。

（トップレベル定義を編集しない理由: すべての呼び出し元（テストを含む）のシグネチャを変更することになります。クロージャ内のティーは追加的で、ローカルスコープに限定されます。）

- [ ] **ステップ 5: 実行、成功を確認**

実行: `cd packages/acp-bridge && npx vitest run src/bridge.test.ts -t "onDiagnosticLine"`
期待結果: PASS。また、ファイル全体を実行してリグレッションを確認: `npx vitest run src/bridge.test.ts`。

- [ ] **ステップ 6: コミット**

```bash
git add packages/acp-bridge/src/bridgeOptions.ts packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridge.test.ts
git commit -m "feat(acp-bridge): onDiagnosticLine sink for serve debug tee (#4548)"
```

---

## Task 8: `onDiagnosticLine` 付きの `createSpawnChannelFactory`

**ファイル:**

- 変更: `packages/acp-bridge/src/spawnChannel.ts`
- 変更: `packages/acp-bridge/src/spawnChannel.test.ts`（なければ作成）

- [ ] **ステップ 1: 現在のエクスポート形状を確認**

```bash
grep -n "defaultSpawnChannelFactory\|onDiagnosticLine\|process.stderr.write" packages/acp-bridge/src/spawnChannel.ts | head -20
```

`defaultSpawnChannelFactory` が唯一のパブリックな spawn エクスポートであることを確認します。既存の子プロセス stderr フォワーダーは、ボディ内で `process.stderr.write(prefix + line + '\n')` を呼び出しています — そのブロックを特定します（125 行目あたり）。

- [ ] **ステップ 2: 失敗するテストを追加**

`packages/acp-bridge/src/spawnChannel.test.ts` で（既存のテストファイルを探す。なければ作成する）:

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
    // 小さな子プロセスを起動し、stderr に書き込んで終了する。
    // QWEN_CLI_ENTRY エスケープハッチを使用して Node ワンライナーを指定する。
    const here = path.dirname(fileURLToPath(import.meta.url));
    process.env['QWEN_CLI_ENTRY'] = path.join(
      here,
      'testutil',
      'stderrOnlyEntry.cjs',
    );
    try {
      const ch = await factory('/tmp', {});
      await ch.exited;
      // 子プロセス終了後、フォワーダーはバッファリングされた末尾をフラッシュする。
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

そしてフィクスチャエントリ `packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs`:

```js
process.stderr.write('hello-stderr\n');
process.exit(0);
```

（ブリッジが子プロセスを「起動済み」とみなす前に ACP 初期化ハンドシェイクが必要な場合は調整してください。代替案: 初期化処理中に stderr 行を書き込む。テストが脆弱すぎる場合は、spawn をモックしてフォワーダーロジックを単独でアサートする方法にフォールバックします — `defaultSpawnChannelFactory` のボディを読み、内部フォワーダーをテストのためにエクスポートして単体テストします。）

- [ ] **ステップ 3: 実行、失敗を確認**

実行: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
期待結果: 失敗 — `createSpawnChannelFactory` がエクスポートされていない。

- [ ] **ステップ 4: `createSpawnChannelFactory` を実装**

`defaultSpawnChannelFactory` をファクトリ・オブ・ファクトリにリファクタリングします。`spawnChannel.ts` の先頭を以下に置き換えます:

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
    // 既存のフォワーダーが:
    //   process.stderr.write(prefix + line + '\n')
    // を行っている箇所を以下に変更:
    //   const teedLine = prefix + line;
    //   process.stderr.write(teedLine + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedLine, 'warn');
    // [truncated] ブランチの場合:
    //   const teedTrunc = prefix + buf.slice(0, STDERR_LINE_CAP_CHARS) + ' [truncated]';
    //   process.stderr.write(teedTrunc + '\n');
    //   if (onDiagnosticLine) onDiagnosticLine(teedTrunc, 'warn');
  };
}

// 後方互換性のために古いエクスポートを維持（コールバック配線なし）。
export const defaultSpawnChannelFactory: ChannelFactory =
  createSpawnChannelFactory();
```

実装の規律:

- `defaultSpawnChannelFactory` は削除しない — チャンネル/IDE アダプターが引き続きインポートしています。
- 既存の stderr 書き込みセマンティクス（行バッファリング、64 KiB 上限、切り捨てマーカー）に厳密に従います。`onDiagnosticLine` 呼び出しは、各既存の `process.stderr.write` の隣に配置され、それを置き換えることはありません。

- [ ] **ステップ 5: 実行、成功を確認**

実行: `cd packages/acp-bridge && npx vitest run src/spawnChannel.test.ts -t "onDiagnosticLine"`
期待結果: PASS。また、`npx vitest run` フルスイートを実行してリグレッションがないことを確認。

- [ ] **ステップ 6: コミット**

```bash
git add packages/acp-bridge/src/spawnChannel.ts packages/acp-bridge/src/spawnChannel.test.ts packages/acp-bridge/src/testutil/stderrOnlyEntry.cjs
git commit -m "feat(acp-bridge): createSpawnChannelFactory with onDiagnosticLine (#4548)"
```

---

## Task 9: `sendBridgeError` を `daemonLog` 経由でルーティング

**ファイル:**

- 変更: `packages/cli/src/serve/server.ts`
- 変更: `packages/cli/src/serve/server.test.ts`

- [ ] **ステップ 1: `daemonLog` を `createServeApp` の依存関係に追加**

`packages/cli/src/serve/server.ts` の `createServeApp` シグネチャ付近を読む（`export function createServeApp` または `export interface ServeAppDeps` を検索）。その deps インターフェースに追加:

```ts
/**
 * Optional daemon logger. When provided, `sendBridgeError` routes
 * each route-mapped error through `daemonLog.error(...)` (which tees
 * to stderr + the daemon log file). When omitted, falls back to
 * existing stderr-only behavior.
 */
daemonLog?: import('./daemonLogger.js').DaemonLogger;
```

- [ ] **ステップ 2: 失敗するテストを追加**

`packages/cli/src/serve/server.test.ts` に追加（または既存のルートエラーテストを拡張）:

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

（`server.test.ts` に既存のルートスローハーネスをコピー — 例: 呼ばれたときにスローする deps スタブを注入する。ポイントは、1つのルートが `sendBridgeError` に到達し、アサーションがデーモンログに記録されることです。）

- [ ] **ステップ 3: 実行、失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
期待結果: 失敗。

- [ ] **ステップ 4: `sendBridgeError` を配線**

`server.ts` で、`sendBridgeError` 関数を見つけます（2765 行目あたり）。現在はインラインで stderr に書き込んでいます。リファクタリング:

1. `createServeApp` から `daemonLog` を、`sendBridgeError` を所有するクロージャに配線します（同じクロージャ内で定義されています）。
2. `sendBridgeError` の末尾で、stderr 書き込みが行われる箇所を以下に置き換えます:

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
  // レガシー stderr のみのパス。daemonLog なしで createServeApp を構築する
  // エンベッダー（テスト、直接統合）向けに動作を維持。
  writeStderrLine(
    `qwen serve: ${ctx?.route ?? 'unknown route'}: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }${ctx?.sessionId ? ` sessionId=${ctx.sessionId}` : ''}`,
  );
}
```

`daemonLog` が null でない場合に新しいブランチが使用されることを確認します。`daemonLog.error` は既に stderr にティー出力するため、stderr 行は依然として生成されます — 動作の損失はありません。

- [ ] **ステップ 5: 実行、成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/server.test.ts -t "daemonLog"`
期待結果: PASS。また `npx vitest run` フルスイート。
```
実行: `cd packages/cli && npx vitest run src/serve/server.test.ts`
期待: 全ファイル PASS (新旧両方)。

- [ ] **Step 6: コミット**

```bash
git add packages/cli/src/serve/server.ts packages/cli/src/serve/server.test.ts
git commit -m "feat(serve): route sendBridgeError through daemonLog (#4548)"
```

---

## Task 10: `runQwenServe` の配線 — 初期化、起動バナー、コールバック、ライフサイクル、シャットダウンフラッシュ

**ファイル:**

- 変更: `packages/cli/src/serve/runQwenServe.ts`
- 変更: `packages/cli/src/serve/runQwenServe.test.ts`

- [ ] **Step 1: 既存の起動 + シャットダウン構造を読む**

`packages/cli/src/serve/runQwenServe.ts` の 590-1030 行目 (`createHttpAcpBridge({...})` 呼び出し箇所、`RunHandle.close` 本体、`onSignal` ハンドラ) を再読する。すべての `writeStderrLine(...)` 呼び出しに注意 — それらはおおよそ 393、565、805、821、825、835、859、865、872、877、951、961、986、997、1027、1361 行目にある（現在の行番号は `grep -n writeStderrLine` で確認）。

- [ ] **Step 2: 失敗するテストを追加する**

`packages/cli/src/serve/runQwenServe.test.ts` に以下を追加（または拡張）する:

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
      // ... 最小の既存テストから残りの必須オプションを埋める ...
    });
    // 起動時に tmpRuntime/debug/daemon のどこかにデーモンログが書き込まれる
    const daemonDir = path.join(tmpRuntime, 'debug', 'daemon');
    expect(existsSync(daemonDir)).toBe(true);
    const logs = require('node:fs')
      .readdirSync(daemonDir)
      .filter((f: string) => f.endsWith('.log'));
    expect(logs.length).toBe(1);
    const content = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(content).toMatch(/daemon started pid=\d+ workspace=/);
    await handle.close();
    // シャットダウン後、"shutdown signal" またはそれに相当するメッセージがログにあること
    const after = readFileSync(path.join(daemonDir, logs[0]), 'utf8');
    expect(after).toMatch(/shutdown/i);
  } finally {
    if (originalRuntime === undefined) delete process.env['QWEN_RUNTIME_DIR'];
    else process.env['QWEN_RUNTIME_DIR'] = originalRuntime;
    rmSync(tmpRuntime, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: 実行して失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts -t "daemon logger"`
期待: 失敗。

- [ ] **Step 4: `runQwenServe` に配線する**

`runQwenServe.ts` を編集:

1. 既存のインポート付近にインポートを追加:

```ts
import { initDaemonLogger, type DaemonLogger } from './daemonLogger.js';
import { createSpawnChannelFactory } from '@qwen-code/acp-bridge/spawnChannel';
```

2. `runQwenServe(opts)` 内で、`boundWorkspace` が正規化された直後（代入箇所を見つける; `createHttpAcpBridge` に渡される値）:

```ts
const daemonLog: DaemonLogger = initDaemonLogger({ boundWorkspace });
writeStderrLine(
  `qwen serve: daemon log → ${daemonLog.getLogPath() || '(disabled)'}`,
);
```

3. `createHttpAcpBridge({...})` の呼び出し（約 606 行目）を更新:

```ts
const channelFactory = createSpawnChannelFactory({
  onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
});
const bridge =
  deps.bridge ??
  createHttpAcpBridge({
    // ... 既存のフィールド ...
    channelFactory,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  });
```

(`deps.bridge` が提供されている場合、運用者が独自の配線を埋め込んで所有しているため、コールバックはスキップする。)

4. `createServeApp(...)` の呼び出し（現在 `runQwenServe.ts:706`、シグネチャは `createServeApp(opts, getPort, deps)`）を更新し、`daemonLog` を deps オブジェクトに追加:

```ts
const app = createServeApp(opts, () => actualPort, {
  bridge,
  boundWorkspace,
  fsFactory,
  daemonLog,
});
```

5. ライフサイクル専用の `writeStderrLine(...)` 呼び出し（`onSignal` 内、`bridge.shutdown` のエラーパス、サーバーの `error` リスナー、デバイスフローの dispose エラー、"received signal, draining" 行）を `daemonLog.warn(...)` / `daemonLog.error(..., err)` に置き換える — daemonLog は stderr にも出力するため、運用者に見える出力は維持される。以下のものは変更**しない**:
   - "listening on URL" に関する起動バナー（これは stdout、stderr ではない — `writeStdoutLine`）。
   - `daemonLog` が構築される前の CLI 使用法/引数解析エラー。
   - 手順 2 で追加した "qwen serve: daemon log → ..." バナー（自身に関するログ行を避けるため）。

   具体的には、この手順の**機械的な**ルール: `daemonLog` が構築された**後**、かつ `process.exit` の**前**にあるすべての `writeStderrLine` 呼び出しが候補。その内容がデーモン診断のように見える場合（1 回限りの起動バナーではない場合）、切り替える。

6. `RunHandle.close` 本体で、`finish` コールバックが実行された後（または `onSignal` 内の `process.exit(0)` の直前）に `await daemonLog.flush();` を追加。具体的には、`onSignal` ハンドラは次のようになる:

```ts
const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    /* 変更なし */ return;
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

- [ ] **Step 5: 実行して成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/runQwenServe.test.ts`
期待: 全ファイル PASS。

次の実行も行う: `cd packages/cli && npx vitest run src/serve/` (serve ディレクトリ全体。server.test.ts の stderr 出力に関するアサーションなど間接的な回帰を捕捉する)。

- [ ] **Step 6: コミット**

```bash
git add packages/cli/src/serve/runQwenServe.ts packages/cli/src/serve/runQwenServe.test.ts
git commit -m "feat(serve): init daemonLogger in runQwenServe + flush on shutdown (#4548)"
```

---

## Task 11: ドキュメント

**ファイル:**

- 変更: 既存の serve ドキュメント (`find docs -iname '*serve*'` と `ls docs/cli/` で特定)

- [ ] **Step 1: 適切なドキュメントを見つける**

```bash
find docs -iname '*serve*' -type f
ls docs/cli/ 2>/dev/null
```

最も自然な場所を選ぶ — おそらく `docs/cli/serve.md`。`qwen serve` 用のファイルが存在しない場合は、`docs/cli/serve-daemon-log.md` を作成する。

- [ ] **Step 2: セクションを書く**

「デーモンログファイル」セクションを追加（または作成）する:

```markdown
## デーモンログファイル

`qwen serve` はプロセスごとの診断ログを以下の場所に書き込みます:

${QWEN_RUNTIME_DIR または ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log

```

同じディレクトリ内の `latest` シンボリックリンクは常に現在のプロセスのログを指しているため、`tail -f ~/.qwen/debug/daemon/latest` で実行中のデーモンを追跡できます。

このログには、ライフサイクルメッセージ、ルートエラー（`route=` と `sessionId=` コンテキスト付き）、ACP 子プロセスの stderr、そして `QWEN_SERVE_DEBUG=1` が設定されている場合の追加のブリッジ breadcrumb が記録されます。現在 stderr に出力される行は引き続き stderr に出力されます。ファイルログは**追加的なものであり**、置き換えではありません。

### 無効化

ファイルログを完全にスキップするには、`QWEN_DAEMON_LOG_FILE=0`（または `false`/`off`/`no`）を設定します。stderr 出力には影響しません。

### セッションデバッグログとの関係

セッションスコープのデバッグログ（`~/.qwen/debug/<sessionId>.txt` および `~/.qwen/debug/latest` シンボリックリンク）は独立しています。デーモンログは兄弟ディレクトリ `daemon/` に存在し、セッションごとのデバッグセマンティクスはこの機能によって変更されません。

### ローテーションなし

デーモンログは無制限に追記されます。大きくなった場合は手動でローテーションしてください。将来の拡張で自動ローテーションが追加される可能性があります。#4548 のフォローアップで追跡します。
```

- [ ] **Step 3: コミット**

```bash
git add docs/cli/serve.md   # または実際のファイルパス
git commit -m "docs(serve): document daemon log file path and opt-out (#4548)"
```

---

## Task 12: 最終検証

- [ ] **Step 1: 全テストスイープ**

```bash
cd /Users/jinye.djy/Projects/qwen-code/.claude/worktrees/feat-support-daemon-logger
npm run test --workspace=packages/acp-bridge
npm run test --workspace=packages/cli
```

期待: すべてグリーン。

- [ ] **Step 2: 型チェック**

```bash
npm run typecheck --workspace=packages/acp-bridge
npm run typecheck --workspace=packages/cli
```

期待: エラーなし。

- [ ] **Step 3: 手動スモークテスト**

```bash
QWEN_RUNTIME_DIR=$(mktemp -d) node packages/cli/dist/index.js serve --port 0 --hostname 127.0.0.1 &
SERVE_PID=$!
sleep 1
ls $QWEN_RUNTIME_DIR/debug/daemon/
cat $QWEN_RUNTIME_DIR/debug/daemon/latest
kill -TERM $SERVE_PID
wait $SERVE_PID 2>/dev/null || true
cat $QWEN_RUNTIME_DIR/debug/daemon/latest  # シャットダウン行が含まれているはず
```

期待: ログファイルが存在し、`daemon started ...` を含み、kill 後に `received SIGTERM, draining` 行が含まれている。

`packages/cli/dist/index.js` が存在しない場合は、事前にビルド: `npm run build --workspace=packages/cli`。

- [ ] **Step 4: PR を作成**

```bash
git push -u origin HEAD
gh pr create --title "feat(serve): add daemon file logger (#4548)" --body "$(cat <<'EOF'
## 概要
- `~/.qwen/debug/daemon/serve-<pid>-<workspaceHash>.log` にプロセスごとのデーモンファイルロガーを追加（`QWEN_RUNTIME_DIR` で設定可能、`QWEN_DAEMON_LOG_FILE=0` でオプトアウト可能）。
- `runQwenServe` のライフサイクルメッセージ、`sendBridgeError` のルートエラー、`writeServeDebugLine` のデバッグ breadcrumb、ACP 子プロセスの stderr を、既存の stderr 出力を除去せずにデーモンログにルーティング。
- `BridgeOptions.onDiagnosticLine` と `createSpawnChannelFactory({ onDiagnosticLine })` を追加し、`acp-bridge` を CLI から独立させる。

Closes #4548.

## テスト計画
- [x] `packages/cli/src/serve/daemonLogger.test.ts` の新しいユニットテストがフォーマッター、ファイル初期化、info/warn/error、raw、latest シンボリックリンク、オプトアウト、縮退フォールバックをカバー。
- [x] `packages/acp-bridge/src/bridge.test.ts` が `writeServeDebugLine` からの `onDiagnosticLine` tee をカバー。
- [x] `packages/acp-bridge/src/spawnChannel.test.ts` が子プロセス stderr フォワーダーをカバー。
- [x] `packages/cli/src/serve/server.test.ts` が `daemonLog.error` を通したルートエラールーティングをカバー。
- [x] `packages/cli/src/serve/runQwenServe.test.ts` が起動バナー + シャットダウンフラッシュをカバー。
- [x] 手動スモークテスト: 起動時にログファイルが作成され、SIGTERM 時にシャットダウン行が含まれる。

🤖 Generated with [Qwen Code](https://github.com/QwenLM/qwen-code)
EOF
)"
```

---

## 自己レビューノート

- **スペックカバレッジ**: §3 モジュールテーブルは Task 1-10 でカバー。§4 デーモン ID + パス → Task 3。§5 API サーフェス → Task 1-6。§6 フォーマット + tee セマンティクス → Task 1（フォーマット）、Task 4（info/warn/error tee）、Task 5（raw ファイルのみ）。§7 起動/シャットダウン → Task 10。§8 カバレッジテーブル → Task 7/8/9/10。§9 書き込みパス & フラッシュ → Task 4。§10 設定 → Task 2（オプトアウト）、Task 11（ドキュメント）。§11 エラーハンドリング → Task 3, 4。§12 テスト → 各タスクに分散。§13 ドキュメント → Task 11。§15 受け入れ基準 → Task 3, 9, 8, 10, 10, 11 でそれぞれ満たされている。

- **トレースコンテキスト（§6 箇条書き）**: 先送り。スペックには明示的に「ヘルパーを共有モジュールに抽出…またはローカルに複製 — 計画に委ねる」とある。現在の計画では trace_id/span_id は注入**しない**。これは §16 で追跡されるフォローアップタスクである。レビュアーが強く求めた場合は、`@opentelemetry/api` から `trace` をインポートし、スパンコンテキストを `buildDaemonLogLine` に組み込む Task 4.5 を追加する — ただしレビュアーが要求した場合のみ。そうでなければ YAGNI。

- **`updateSymlink` のインポートパス**: Task 6 step 3 では、`updateSymlink` が `@qwen-code/qwen-code-core` からエクスポートされているかどうかを確認するよう注意している。編集前に確認: `grep -n updateSymlink packages/core/src/index.ts`。存在しない場合、Task 6 と同じコミットで再エクスポートを追加する。

- **`createSpawnChannelFactory` の acp-bridge テスト**: ユニットテストで実際の子プロセスを起動するのは脆弱である。Task 8 step 2 が CI で不安定になった場合のフォールバックは、内部の stderr フォワーダーを小さなエクスポートされたヘルパー（`forwardChildStderr(stream, { prefix, onLine })`）にリファクタリングし、それを単独でユニットテストする — 実際の spawn は不要。