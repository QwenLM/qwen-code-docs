# Worktree Phase C 実装計画

> **エージェントワーカー向け:** 必須のサブスキル: superpowers:subagent-driven-development (推奨) または superpowers:executing-plans を使用して、この計画をタスクごとに実装してください。各ステップはチェックボックス（`- [ ]`）構文で追跡します。

**目標:** worktree にセッション永続化、hooksPath 初期化、Footer ステータス表示、終了ダイアログを追加し、`--resume` 後も worktree を復元可能にし、ユーザーが常にどの隔離環境にいるかを把握できるようにする。

**アーキテクチャ:** 新しい `WorktreeSession` サイドカー JSON ファイル（JSONL session ファイルと併存）を追加。`EnterWorktree` で書き込み、`ExitWorktree` でクリア。CLI 層は `useWorktreeSession` hook でファイル変更を監視し、`UIState.activeWorktree` に同期。Footer はそのフィールドを読み取り、worktree 行をレンダリング。`WorktreeExitDialog` はアクティブな worktree を検出した場合、2回目の Ctrl+C をインターセプトする。

**Tech Stack:** TypeScript, React (Ink), Node.js `fs.watch`, `simple-git`, Vitest

---

## ファイル構造

| 操作 | ファイル                                                         | 説明                                                                          |
| ---- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 新規 | `packages/core/src/services/worktreeSessionService.ts`       | WorktreeSession インターフェース + 読み書き/クリア関数 |
| 新規 | `packages/core/src/services/worktreeSessionService.test.ts`  | ユニットテスト                                                                      |
| 修正 | `packages/core/src/services/sessionService.ts`               | 公開メソッド `getWorktreeSessionPath()` を追加                                      |
| 修正 | `packages/core/src/services/gitWorktreeService.ts`           | `createUserWorktree()` / `createAgentWorktree()` 後に `core.hooksPath` 設定を追加 |
| 修正 | `packages/core/src/services/gitWorktreeService.test.ts`      | hooksPath テスト                                                                |
| 修正 | `packages/core/src/tools/enter-worktree.ts`                  | worktree 作成後に WorktreeSession を書き込み                                        |
| 修正 | `packages/core/src/tools/enter-worktree.test.ts`             | セッション書き込みテスト                                                              |
| 修正 | `packages/core/src/tools/exit-worktree.ts`                   | worktree 終了後に WorktreeSession をクリア                                          |
| 修正 | `packages/core/src/tools/exit-worktree.test.ts`              | セッションクリアテスト                                                              |
| 新規 | `packages/cli/src/ui/hooks/useWorktreeSession.ts`            | サイドカーファイルを監視し、現在の WorktreeSession を返す                                   |
| 修正 | `packages/cli/src/ui/contexts/UIStateContext.tsx`            | フィールド `activeWorktree` を追加                                                    |
| 修正 | `packages/cli/src/ui/AppContainer.tsx`                       | `activeWorktree` の同期、resume コンテキストの注入、終了のインターセプト                           |
| 修正 | `packages/cli/src/ui/hooks/useStatusLine.ts`                 | `StatusLineCommandInput` に `worktree` フィールドを追加                                 |
| 修正 | `packages/cli/src/ui/components/Footer.tsx`                  | 組み込みの worktree 行表示                                                          |
| 新規 | `packages/cli/src/ui/components/WorktreeExitDialog.tsx`      | 終了確認ダイアログ                                                                |
| 新規 | `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx` | コンポーネントテスト                                                                      |
| 修正 | `packages/cli/src/ui/components/DialogManager.tsx`           | WorktreeExitDialog を登録                                                       |

---

## Task 1: WorktreeSession サイドカーストレージ

**ファイル:**

- 作成: `packages/core/src/services/worktreeSessionService.ts`
- 作成: `packages/core/src/services/worktreeSessionService.test.ts`
- 修正: `packages/core/src/services/sessionService.ts`

- [ ] **Step 1: `worktreeSessionService.ts` を新規作成**

```typescript
// packages/core/src/services/worktreeSessionService.ts
import * as fs from 'node:fs/promises';
import { isNodeError } from '../utils/errors.js';

export interface WorktreeSession {
  slug: string;
  worktreePath: string;
  worktreeBranch: string;
  originalCwd: string;
  originalBranch: string;
  /** Worktree 作成時点の HEAD commit SHA。WorktreeExitDialog が新しいコミット数をカウントするために使用。 */
  originalHeadCommit: string;
}

export async function readWorktreeSession(
  filePath: string,
): Promise<WorktreeSession | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as WorktreeSession;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(require('node:path').dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export async function clearWorktreeSession(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

```typescript
// packages/core/src/services/worktreeSessionService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './worktreeSessionService.js';

const sample: WorktreeSession = {
  slug: 'my-feature',
  worktreePath: '/repo/.qwen/worktrees/my-feature',
  worktreeBranch: 'worktree-my-feature',
  originalCwd: '/repo',
  originalBranch: 'main',
};

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-session-test-'));
  filePath = path.join(tmpDir, 'test.worktree.json');
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readWorktreeSession', () => {
  it('ファイルが存在しない場合は null を返す', async () => {
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('書き込んだ内容を読み戻せる', async () => {
    await fs.writeFile(filePath, JSON.stringify(sample), 'utf-8');
    expect(await readWorktreeSession(filePath)).toEqual(sample);
  });
});

describe('writeWorktreeSession', () => {
  it('読み取り可能な JSON ファイルを書き込む', async () => {
    await writeWorktreeSession(filePath, sample);
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('既存のファイルを上書きする', async () => {
    await writeWorktreeSession(filePath, sample);
    const updated = { ...sample, slug: 'updated' };
    await writeWorktreeSession(filePath, updated);
    expect(await readWorktreeSession(filePath)).toEqual(updated);
  });
});

describe('clearWorktreeSession', () => {
  it('ファイルを削除する', async () => {
    await writeWorktreeSession(filePath, sample);
    await clearWorktreeSession(filePath);
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('ファイルが存在しない場合は何もしない', async () => {
    await expect(clearWorktreeSession(filePath)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: テストを実行し、失敗を確認**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

期待: `FAIL` — モジュールが存在しない。

- [ ] **Step 4: `writeWorktreeSession` の require 呼び出しを修正**

`worktreeSessionService.ts` で `path.dirname` を使用するために、ファイル先頭で `node:path` をインポート:

```typescript
// "require('node:path').dirname(filePath)" を正しいインポートに置き換え
import * as path from 'node:path';

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Step 5: テストを実行し、成功を確認**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

期待: `PASS` — 6 tests passed。

- [ ] **Step 6: `SessionService` に `getWorktreeSessionPath()` を追加**

`packages/core/src/services/sessionService.ts` で `private getChatsDir()` メソッド（約 180 行目）を見つけ、その後に追加:

```typescript
getWorktreeSessionPath(sessionId: string): string {
  return path.join(this.getChatsDir(), `${sessionId}.worktree.json`);
}
```

- [ ] **Step 7: 型チェック**

```bash
cd packages/core
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/services/worktreeSessionService.test.ts \
        packages/core/src/services/sessionService.ts
git commit -m "feat(worktree): add WorktreeSession sidecar storage"
```

---

## Task 2: hooksPath の作成後セットアップ

**ファイル:**

- 修正: `packages/core/src/services/gitWorktreeService.ts:1133-1158`（`createUserWorktree`）
- 修正: `packages/core/src/services/gitWorktreeService.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`gitWorktreeService.test.ts` の `createUserWorktree` テストグループを見つけ、追加:

```typescript
it('作成後に core.hooksPath をメインリポジトリに設定する', async () => {
  const result = await service.createUserWorktree('hooks-test');
  expect(result.success).toBe(true);

  const worktreePath = result.worktree!.path;
  const worktreeGit = simpleGit(worktreePath);
  const hooksPath = await worktreeGit.raw([
    'config',
    '--local',
    'core.hooksPath',
  ]);
  // メインリポジトリの .git/hooks を指す必要がある
  expect(hooksPath.trim()).toContain('.git/hooks');
});
```

- [ ] **Step 2: テストを実行し、失敗を確認**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

期待: `FAIL` — hooksPath が空。

- [ ] **Step 3: `createUserWorktree` に hooksPath 設定を追加**

`gitWorktreeService.ts` の `createUserWorktree` 内、`git worktree add` 呼び出しの後（約 1140 行目）、`return { success: true, worktree }` の前に追加:

```typescript
// この worktree 内のコミットがメインリポジトリのフックを実行するように hooksPath を設定。
// 優先順位: .husky/ (一般的) → .git/hooks (フォールバック)。
// claude-code の performPostCreationSetup() ロジックをミラーリング。
try {
  const huskyPath = path.join(this.sourceRepoPath, '.husky');
  const gitHooksPath = path.join(this.sourceRepoPath, '.git', 'hooks');
  let hooksPath: string | null = null;
  for (const candidate of [huskyPath, gitHooksPath]) {
    try {
      await fs.stat(candidate);
      hooksPath = candidate;
      break;
    } catch {
      // 見つからない — 次を試す。
    }
  }
  if (hooksPath) {
    const worktreeGit = simpleGit(worktreePath);
    // core.hooksPath が既に同じ値に設定されている場合、サブプロセスをスキップ
    // （claude-code の parseGitConfigValue に関するコメントによると ~14ms の spawn オーバーヘッド）。
    let existing = '';
    try {
      existing = (
        await worktreeGit.raw(['config', '--local', 'core.hooksPath'])
      ).trim();
    } catch {
      // キーが設定されていない — 空文字列は「続行」を意味する。
    }
    if (existing !== hooksPath) {
      await worktreeGit.raw(['config', 'core.hooksPath', hooksPath]);
    }
  }
} catch (hookError) {
  debugLogger.warn(
    `createUserWorktree: core.hooksPath の設定に失敗: ${hookError}`,
  );
  // 致命的ではない: worktree は使用可能、ただしフックの継承はなし。
}
```

`this.sourceRepoPath` は `GitWorktreeService` コンストラクタで代入されるプライベートフィールドです（`this.sourceRepoPath = path.resolve(sourceRepoPath)`、約 224 行目）。ファイルの先頭で `import * as fs from 'node:fs/promises'` が行われていることを確認してください。

- [ ] **Step 4: `createAgentWorktree` に同じ修正を適用**

`createAgentWorktree` メソッドを見つけ、`git worktree add` の後に同じ hooksPath コードブロックを追加（Step 3 と完全に同じコード、`slug` は agent worktree のパラメータを使用）。

- [ ] **Step 5: テストを実行し、成功を確認**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

期待: `PASS`。

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/services/gitWorktreeService.ts \
        packages/core/src/services/gitWorktreeService.test.ts
git commit -m "feat(worktree): configure core.hooksPath after worktree creation"
```

---

## Task 3: EnterWorktreeTool が WorktreeSession を書き込む

**ファイル:**

- 修正: `packages/core/src/tools/enter-worktree.ts`
- 修正: `packages/core/src/tools/enter-worktree.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`enter-worktree.test.ts` の成功作成テストケースの後に追加:

```typescript
import { readWorktreeSession } from '../services/worktreeSessionService.js';

it('ワークツリー作成後に WorktreeSession のサイドカーを書き込む', async () => {
  // Arrange: 既存のテストセットアップ（実際の git リポジトリを作成し、ツールを呼び出す）を使用
  // （既存の "custom name" テストからコピー）
  const result = await invokeTool(tool, { name: 'session-test' });
  expect(result.error).toBeUndefined();

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  const session = await readWorktreeSession(sessionPath);

  expect(session).not.toBeNull();
  expect(session!.slug).toBe('session-test');
  expect(session!.worktreePath).toContain('session-test');
  expect(session!.worktreeBranch).toBe('worktree-session-test');
  expect(session!.originalCwd).toBeTruthy();
  expect(session!.originalBranch).toBeTruthy();
  expect(session!.originalHeadCommit).toMatch(/^[0-9a-f]{7,40}$/);
});
```

- [ ] **Step 2: テストを実行し、失敗を確認**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts -t "writes WorktreeSession"
```

期待: `FAIL` — session file is null。

- [ ] **Step 3: `enter-worktree.ts` を修正、成功作成後に session を書き込む**

`enter-worktree.ts` の先頭にインポートを追加:

```typescript
import { writeWorktreeSession } from '../services/worktreeSessionService.js';
```

`execute()` メソッド内で、`baseBranch` を取得した後、`createUserWorktree()` 呼び出しの前に、現在の HEAD commit SHA を取得:

```typescript
// ブランチ作成前に HEAD を取得 — WorktreeExitDialog はこれを使用して
// worktree 内で作成された新しいコミットをカウントする（claude-code のアプローチをミラーリング）。
let originalHeadCommit = '';
try {
  originalHeadCommit = await service.getHeadCommit();
} catch {
  // 致命的ではない。
}
```

同時に `GitWorktreeService` に公開メソッドを追加（`gitWorktreeService.ts` の `getCurrentBranch()` 近く）:

```typescript
async getHeadCommit(): Promise<string> {
  try {
    return (await this.git.raw(['rev-parse', '--short', 'HEAD'])).trim();
  } catch {
    return '';
  }
}
```

`writeWorktreeSessionMarker(...)` 呼び出しの後に追加:

```typescript
// ワークツリーセッションを永続化し、--resume でコンテキストを復元可能にする。
try {
  await writeWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
    {
      slug,
      worktreePath: result.worktree.path,
      worktreeBranch: result.worktree.branch,
      originalCwd: projectRoot,
      originalBranch: baseBranch ?? 'HEAD',
      originalHeadCommit,
    },
  );
} catch (error) {
  debugLogger.warn(`enter_worktree: セッション状態の書き込みに失敗: ${error}`);
}
```

- [ ] **Step 4: テストを実行し、成功を確認**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts
```

期待: すべて成功、回帰なし。

- [ ] **Step 5: 型チェック**

```bash
cd packages/core && npm run typecheck
```

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/tools/enter-worktree.ts \
        packages/core/src/tools/enter-worktree.test.ts
git commit -m "feat(worktree): persist WorktreeSession in EnterWorktreeTool"
```

---

## Task 4: ExitWorktreeTool が WorktreeSession をクリア

**ファイル:**

- 修正: `packages/core/src/tools/exit-worktree.ts`
- 修正: `packages/core/src/tools/exit-worktree.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`exit-worktree.test.ts` に2つのテストケースを追加（keep と remove の両方で session をクリアすることを確認）:

```typescript
import {
  writeWorktreeSession,
  readWorktreeSession,
} from '../services/worktreeSessionService.js';

async function seedSession(cfg: Config, slug: string) {
  await writeWorktreeSession(
    cfg.getSessionService().getWorktreeSessionPath(cfg.getSessionId()),
    {
      slug,
      worktreePath: `/repo/.qwen/worktrees/${slug}`,
      worktreeBranch: `worktree-${slug}`,
      originalCwd: '/repo',
      originalBranch: 'main',
    },
  );
}

it('keep 後に WorktreeSession をクリアする', async () => {
  await seedSession(config, 'exit-keep-test');
  // exit_worktree が worktree を見つけられるように先に作成
  await config.getWorktreeService().createUserWorktree('exit-keep-test');
  await invokeTool(tool, { name: 'exit-keep-test', action: 'keep' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});

it('remove 後に WorktreeSession をクリアする', async () => {
  await seedSession(config, 'exit-remove-test');
  await config.getWorktreeService().createUserWorktree('exit-remove-test');
  await invokeTool(tool, { name: 'exit-remove-test', action: 'remove' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});
```

- [ ] **Step 2: テストを実行し、失敗を確認**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts -t "clears WorktreeSession"
```

期待: `FAIL`。

- [ ] **Step 3: `exit-worktree.ts` を修正**

先頭にインポートを追加:

```typescript
import { clearWorktreeSession } from '../services/worktreeSessionService.js';
```

`action === 'keep'` の return パス（約 184-196 行目）を見つけ、`return { llmContent: ..., returnDisplay: ... }` の前に追加:

```typescript
try {
  await clearWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
  );
} catch (error) {
  debugLogger.warn(`exit_worktree: セッション状態のクリアに失敗: ${error}`);
}
```

`action === 'remove'` の成功 return パス（`removeUserWorktree` 呼び出し後）も見つけ、同じ `clearWorktreeSession` 呼び出しブロックを追加。

- [ ] **Step 4: テストを実行し、成功を確認**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts
```

期待: すべて成功。

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/tools/exit-worktree.ts \
        packages/core/src/tools/exit-worktree.test.ts
git commit -m "feat(worktree): clear WorktreeSession in ExitWorktreeTool"
```

---

## Task 5: useWorktreeSession hook + UIState.activeWorktree

**ファイル:**

- 作成: `packages/cli/src/ui/hooks/useWorktreeSession.ts`
- 修正: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- 修正: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Step 1: `UIStateContext.tsx` に `activeWorktree` フィールドを追加**

`UIState` interface（約 85 行目）を見つけ、`branchName: string | undefined;` の近くに追加:

```typescript
activeWorktree: {
  slug: string;
  branch: string;
  path: string;
  originalCwd: string;
  originalBranch: string;
  originalHeadCommit: string;
} | null;
```

UIState の初期値（通常は `AppContainer.tsx` の UIState provider または `createContext` の defaultValue）を見つけ、`activeWorktree: null` を追加。

- [ ] **Step 2: `useWorktreeSession.ts` を新規作成**

```typescript
// packages/cli/src/ui/hooks/useWorktreeSession.ts
import { useState, useEffect } from 'react';
import * as fs from 'node:fs';
import {
  readWorktreeSession,
  type WorktreeSession,
} from '@qwen-code/qwen-code-core';
import { useConfig } from '../contexts/ConfigContext.js';

export function useWorktreeSession(): WorktreeSession | null {
  const config = useConfig();
  const [session, setSession] = useState<WorktreeSession | null>(null);

  useEffect(() => {
    const sessionService = config.getSessionService();
    const sessionId = config.getSessionId();
    const filePath = sessionService.getWorktreeSessionPath(sessionId);

    let watcher: fs.FSWatcher | undefined;

    const load = async () => {
      try {
        const ws = await readWorktreeSession(filePath);
        setSession(ws);
      } catch {
        setSession(null);
      }
    };

    void load();

    try {
      watcher = fs.watch(filePath, () => void load());
    } catch {
      // ファイルがまだ存在しない — ウォッチャーは次回の書き込みイベントで load() 経由で設定される
    }

    return () => {
      watcher?.close();
    };
  }, [config]);

  return session;
}
```
注意：`readWorktreeSession` と `WorktreeSession` は `@qwen-code/qwen-code-core` からエクスポートする必要があります。同時に `packages/core/src/index.ts` にも新しいエクスポートを追加します：

```typescript
export {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './services/worktreeSessionService.js';
```

- [ ] **Step 3: `AppContainer.tsx` で hook を使って `activeWorktree` を同期**

`AppContainer.tsx` の先頭に import を追加：

```typescript
import { useWorktreeSession } from './hooks/useWorktreeSession.js';
```

`AppContainer` 関数内（`branchName` の使用箇所の近く）に以下を追加：

```typescript
const worktreeSession = useWorktreeSession();
```

`UIStateContext.Provider` に渡す value に以下を追加：

```typescript
activeWorktree: worktreeSession
  ? {
      slug: worktreeSession.slug,
      branch: worktreeSession.worktreeBranch,
      path: worktreeSession.worktreePath,
      originalCwd: worktreeSession.originalCwd,
      originalBranch: worktreeSession.originalBranch,
      originalHeadCommit: worktreeSession.originalHeadCommit,
    }
  : null,
```

- [ ] **Step 4: 型チェック**

```bash
npm run typecheck
```

リポジトリルートから実行（ワークスペース横断チェック）。期待：エラーなし。

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/index.ts \
        packages/cli/src/ui/hooks/useWorktreeSession.ts \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add useWorktreeSession hook and UIState.activeWorktree"
```

---

## Task 6: StatusLineCommandInput.worktree フィールド + Footer worktree 行

**Files:**

- Modify: `packages/cli/src/ui/hooks/useStatusLine.ts`
- Modify: `packages/cli/src/ui/components/Footer.tsx`

- [ ] **Step 1: `useStatusLine.ts` に `worktree` フィールドを追加**

`StatusLineCommandInput` interface（約21行目）を見つけ、`git?: { branch: string }` フィールドの後に以下を追加：

```typescript
worktree?: {
  /** worktree slug（短い名前、例 "my-feature"） */
  name: string;
  /** worktree の物理パス */
  path: string;
  /** git ブランチ名（例 "worktree-my-feature"） */
  branch: string;
  /** worktree に入る前の作業ディレクトリ */
  original_cwd: string;
  /** worktree に入る前のブランチ */
  original_branch: string;
};
```

フィールド名は claude-code と合わせることで、ユーザーが qwen-code と claude-code 間で statusline スクリプトを再利用できるようにします。

`doUpdate` コールバック内で `input: StatusLineCommandInput` オブジェクトを構築している箇所（約225行目）を見つけ、`...(ui.branchName && { git: { branch: ui.branchName } })` の後に以下を追加：

```typescript
...(uiStateRef.current.activeWorktree && {
  worktree: {
    name: uiStateRef.current.activeWorktree.slug,
    path: uiStateRef.current.activeWorktree.path,
    branch: uiStateRef.current.activeWorktree.branch,
    original_cwd: uiStateRef.current.activeWorktree.originalCwd,
    original_branch: uiStateRef.current.activeWorktree.originalBranch,
  },
}),
```

注意：`UIState.activeWorktree` には `originalCwd` と `originalBranch` フィールドも含める必要があります（Task 5 の AppContainer マッピングで補完）。

- [ ] **Step 2: `Footer.tsx` に worktree の組み込み表示行を追加**

`Footer.tsx` の先頭で `useUIState` を import します（既に存在）。

`statusLineLines` のレンダリング領域（約140-148行目）を見つけます：

```tsx
{
  statusLineLines.length > 0 &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.map((line, i) => (
      <Text key={`status-line-${i}`} dimColor wrap="truncate">
        {line}
      </Text>
    ));
}
```

その直前に worktree 行を挿入します（`activeWorktree` が空でなく、ユーザーの statusline が無い場合に表示）：

```tsx
{
  uiState.activeWorktree &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.length === 0 && (
      <Text dimColor wrap="truncate">
        {`⎇ ${uiState.activeWorktree.branch} (${uiState.activeWorktree.slug})`}
      </Text>
    );
}
```

- [ ] **Step 3: 型チェック + ビルド**

```bash
npm run typecheck && npm run build
```

期待：エラーなし。

- [ ] **Step 4: コミット**

```bash
git add packages/cli/src/ui/hooks/useStatusLine.ts \
        packages/cli/src/ui/components/Footer.tsx
git commit -m "feat(worktree): show active worktree in Footer and StatusLine payload"
```

---

## Task 7: --resume worktree コンテキスト注入

**Files:**

- Modify: `packages/cli/src/ui/AppContainer.tsx:459-489`

- [ ] **Step 1: resume パスに worktree コンテキストメッセージを注入**

`AppContainer.tsx` 内の resume パス（約459-489行目）を見つけます：

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);
  // ...
}
```

以下のように変更します：

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);

  // アクティブな worktree セッションが存在する場合、コンテキストリマインダーを注入して
  // モデルが即座に worktree パスを使い続けることを認識できるようにします。
  const ws = await readWorktreeSession(
    config.getSessionService().getWorktreeSessionPath(config.getSessionId()),
  );
  if (ws) {
    // worktree ディレクトリがまだ存在することを確認してからアクティブとして扱う
    const worktreeAlive = await fs
      .stat(ws.worktreePath)
      .then((s) => s.isDirectory())
      .catch(() => false);

    if (worktreeAlive) {
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text:
            `[Resumed] Active worktree: "${ws.slug}" at ${ws.worktreePath} ` +
            `(branch: ${ws.worktreeBranch}). Continue using this path for all file operations.`,
        },
        Date.now(),
      );
    } else {
      // サイドカーが古くなっている — worktree が外部から削除されたのでクリーンアップ
      await clearWorktreeSession(
        config
          .getSessionService()
          .getWorktreeSessionPath(config.getSessionId()),
      );
    }
  }

  // ... 既存の resume コードの残り（background agents、session name）
}
```

ファイルの先頭に import を追加：

```typescript
import {
  readWorktreeSession,
  clearWorktreeSession,
} from '@qwen-code/qwen-code-core';
import * as fs from 'node:fs/promises';
```

（`fs` は既に import されている可能性があります。確認して統合してください。）

- [ ] **Step 2: 型チェック**

```bash
npm run typecheck
```

- [ ] **Step 3: コミット**

```bash
git add packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): inject context message on --resume when worktree is active"
```

---

## Task 8: WorktreeExitDialog

**Files:**

- Create: `packages/cli/src/ui/components/WorktreeExitDialog.tsx`
- Create: `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`
- Modify: `packages/cli/src/ui/components/DialogManager.tsx`
- Modify: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Modify: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Step 1: `AppContainer.tsx` にダイアログ状態を追加**

`showWelcomeBackDialog` などのダイアログ状態は、各 hook から AppContainer に返され、UIState value オブジェクトを介して Provider に渡されます。WorktreeExitDialog も同様のパターンを採用します。

`AppContainer.tsx` の関数内に以下を追加：

```typescript
const [showWorktreeExitDialog, setShowWorktreeExitDialog] = useState(false);
```

UIState Provider の value オブジェクトに以下を追加：

```typescript
showWorktreeExitDialog,
```

`UIState` interface に（他のダイアログフィールドの近くに）以下を追加：

```typescript
showWorktreeExitDialog: boolean;
```

- [ ] **Step 2: 失敗するコンポーネントテストを記述**

```typescript
// packages/cli/src/ui/components/WorktreeExitDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

describe('WorktreeExitDialog', () => {
  it('shows loading state initially', () => {
    const { lastFrame } = render(
      <WorktreeExitDialog
        slug="my-feature"
        branch="worktree-my-feature"
        worktreePath="/tmp/repo/.qwen/worktrees/my-feature"
        originalHeadCommit="abc1234"
        onKeep={vi.fn()}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // git status が解決される前にローディングスピナーが表示されるはず
    expect(lastFrame()).toContain('Checking');
  });

  it('renders slug, branch, and options after loading (no changes)', async () => {
    // vi.mock を使って execFileNoThrow / execFile をスタブ化し、git status が空を返し、
    // rev-list が "0" を返すようにします。モックパターンは既存のダイアログテストを参照。
    // 非同期エフェクトが解決された後：
    //   - "my-feature" と "worktree-my-feature" が表示される
    //   - Keep と Remove のオプションが表示される
    //   - "no uncommitted changes" または同様のメッセージが表示される
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

期待：`FAIL` — モジュールが存在しない。

- [ ] **Step 4: 新規 `WorktreeExitDialog.tsx` を作成**

`WelcomeBackDialog.tsx` の RadioSelect パターンを参考に、マウント時のダーティ状態チェック（claude-code の `WorktreeExitDialog.tsx` の `loadChanges` ロジックに合わせる）を追加します：

```tsx
// packages/cli/src/ui/components/WorktreeExitDialog.tsx
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { execa } from 'execa';
import { RadioSelect } from '../shared/RadioSelect.js';
import type { RadioSelectItem } from '../shared/RadioSelect.js';
import { theme } from '../semantic-colors.js';

interface WorktreeExitDialogProps {
  slug: string;
  branch: string;
  worktreePath: string;
  originalHeadCommit: string;
  onKeep: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

type Choice = 'keep' | 'remove' | 'cancel';

export const WorktreeExitDialog: React.FC<WorktreeExitDialogProps> = ({
  slug,
  branch,
  worktreePath,
  originalHeadCommit,
  onKeep,
  onRemove,
  onCancel,
}) => {
  const [loading, setLoading] = useState(true);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [selected, setSelected] = useState<Choice>('keep');

  useEffect(() => {
    async function loadDirtyState() {
      try {
        // 未コミットの変更（tracked + untracked）
        const { stdout: statusOut } = await execa(
          'git',
          ['status', '--porcelain'],
          { cwd: worktreePath },
        );
        const files = statusOut.split('\n').filter((l) => l.trim().length > 0);
        setChangedFiles(files);

        // worktree 作成以降の新しいコミット
        if (originalHeadCommit) {
          const { stdout: countOut } = await execa(
            'git',
            ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
            { cwd: worktreePath },
          );
          setCommitCount(parseInt(countOut.trim(), 10) || 0);
        }
      } catch {
        // git が失敗した場合、カウントなしでダイアログを表示
      } finally {
        setLoading(false);
      }
    }
    void loadDirtyState();
  }, [worktreePath, originalHeadCommit]);

  const options: Array<RadioSelectItem<Choice>> = [
    {
      key: 'keep',
      label: 'Keep worktree (exit without deleting)',
      value: 'keep',
    },
    {
      key: 'remove',
      label:
        changedFiles.length > 0 || commitCount > 0
          ? `Remove worktree and branch (discards ${commitCount} commit(s), ${changedFiles.length} file(s))`
          : 'Remove worktree and branch',
      value: 'remove',
    },
    { key: 'cancel', label: 'Cancel (stay in session)', value: 'cancel' },
  ];

  if (loading) {
    return (
      <Box marginY={1} paddingX={2}>
        <Text color={theme.text.secondary}>Checking worktree status…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} paddingX={2}>
      <Text color={theme.status.warning}>
        {`Active worktree: "${slug}" (${branch})`}
      </Text>
      {(changedFiles.length > 0 || commitCount > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          {commitCount > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${commitCount} new commit(s) on ${branch}`}
            </Text>
          )}
          {changedFiles.length > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${changedFiles.length} uncommitted file(s)`}
            </Text>
          )}
        </Box>
      )}
      <Text color={theme.text.secondary}>What would you like to do?</Text>
      <RadioSelect
        items={options}
        selectedValue={selected}
        onSelect={(value) => {
          if (value === 'keep') onKeep();
          else if (value === 'remove') onRemove();
          else onCancel();
        }}
        onChange={setSelected}
      />
    </Box>
  );
};
```

注意：`execa` はプロジェクトの既存依存関係です（または `execFileNoThrow` を使います。claude-code の方法を参照）。`packages/cli/package.json` で利用可能な exec ツールを確認してください。`execa` がない場合は、Node.js 組み込みの `execFile` のラッパーを使用します。

- [ ] **Step 5: テストを実行して成功を確認**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

期待：ローディング状態のテストが通る。

- [ ] **Step 6: `DialogManager.tsx` に登録**

`DialogManager` の最後のダイアログレンダリングブロックを見つけ、以下を追加します：

```tsx
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

// DialogManager が返す JSX 内、最後のダイアログの後に追加：
{
  uiState.showWorktreeExitDialog && uiState.activeWorktree && (
    <WorktreeExitDialog
      slug={uiState.activeWorktree.slug}
      branch={uiState.activeWorktree.branch}
      worktreePath={uiState.activeWorktree.path}
      originalHeadCommit={uiState.activeWorktree.originalHeadCommit}
      onKeep={() => {
        setShowWorktreeExitDialog(false);
        handleSlashCommand('/quit');
      }}
      onRemove={async () => {
        setShowWorktreeExitDialog(false);
        // サービス経由で直接 worktree を削除（ツール呼び出し不要）
        try {
          const svc = new GitWorktreeService(config.getTargetDir());
          await svc.removeUserWorktree(uiState.activeWorktree!.slug, {
            deleteBranch: true,
          });
          await clearWorktreeSession(
            config
              .getSessionService()
              .getWorktreeSessionPath(config.getSessionId()),
          );
        } catch {
          // 致命的ではない — とにかく終了
        }
        handleSlashCommand('/quit');
      }}
      onCancel={() => {
        setShowWorktreeExitDialog(false);
      }}
    />
  );
}
```

`setShowWorktreeExitDialog` は Step 1 で AppContainer に定義した useState からのもので、props を介して、または DialogManager の呼び出し箇所で直接渡す必要があります（他のダイアログの引数パターンを参照）。

- [ ] **Step 7: `AppContainer.tsx` で 2 回目の Ctrl+C をインターセプト**

`handleExit` コールバック（約2387行目）内で、`pressedOnce` が `true` のときに `handleSlashCommand('/quit')` を呼び出す分岐を見つけます：

```typescript
// 高速2回押し：直接終了（ユーザーの習慣を維持）
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // 直接終了
  handleSlashCommand('/quit');
  return;
}
```

以下のように変更します：

```typescript
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // worktree 内にいる場合、直接終了せず終了ダイアログを表示
  if (worktreeSession) {
    setShowWorktreeExitDialog(true);
    return;
  }
  handleSlashCommand('/quit');
  return;
}
```

`worktreeSession` は Step 1 の `useWorktreeSession()` の戻り値です（AppContainer の関数内に既にあります）。これを `handleExit` の `useCallback` 依存配列に追加します。`setShowWorktreeExitDialog` は Step 1 の useState からのものです。

- [ ] **Step 9: 型チェック + 全量テスト**

```bash
npm run typecheck
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
```

期待：全て成功、リグレッションなし。

- [ ] **Step 10: ビルド**

```bash
npm run build && npm run bundle
```

期待：`dist/cli.js` がエラーなく生成される。

- [ ] **Step 11: コミット**

```bash
git add packages/cli/src/ui/components/WorktreeExitDialog.tsx \
        packages/cli/src/ui/components/WorktreeExitDialog.test.tsx \
        packages/cli/src/ui/components/DialogManager.tsx \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add WorktreeExitDialog — intercept Ctrl+C when worktree is active"
```

---

## 受入基準

| シナリオ                          | 期待動作                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `enter_worktree` 呼び出し後       | `<sessionId>.worktree.json` が存在し、slug / path / branch を含む |
| `exit_worktree` 呼び出し後        | `<sessionId>.worktree.json` が削除される                    |
| `--resume` 時に worktree が存在   | Footer に worktree 行を表示；INFO メッセージでパスを知らせる|
| `--resume` 時に worktree が削除済 | サイドカーファイルが削除され、worktree 行は表示されない      |
| worktree 内で最初の Ctrl+C        | "Press Ctrl+C again to exit." を表示                        |
| worktree 内で 2 回目の Ctrl+C     | WorktreeExitDialog を表示（keep / remove / cancel）         |
| 非 worktree 環境で 2 回目の Ctrl+C | 直接終了（動作は変わらない）                                |
| 新規 worktree 内でのコミット      | `core.hooksPath` がメインリポジトリの hooks を指し、pre-commit が正常にトリガーされる |
| statusline スクリプト stdin       | JSON payload に `worktree.slug` と `worktree.branch` を含む |