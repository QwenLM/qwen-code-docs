# Web Shell 新規セッションの Git モード選択

## 背景

日常開発において、ユーザーが新規セッションを作成する際には 3 つの Git ワークフローがあります:

1. **現在のブランチ** — 現在のブランチで直接開発する（デフォルトの動作）
2. **Worktree 分離** — 独立した worktree + ブランチを作成し、メインディレクトリは影響を受けない
3. **新規ブランチ** — 同じ作業ディレクトリ内で新しいブランチを作成して切り替える

シナリオ 1 と 2 はすでに完全にサポートされています（シナリオ 2 は [2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md) と [2026-07-20-worktree-empty-state-toggle.md](./2026-07-20-worktree-empty-state-toggle.md) を参照）。シナリオ 3 は欠落しています — ユーザーが「このタスクのために新しいブランチを切りたい」とき、先に手動で `git checkout -b` をしてからセッションを作るか、worktree を使う（不要なディレクトリ分離が入る）かのどちらかを強いられます。

## ゴール

- チャットの空状態に統一された **Git モードセレクター**を提供し、3 つのシナリオをカバーする。
- 「新規ブランチ」モード: daemon が `POST /session` 時に自動で `git checkout -b` を行い、セッションは直接新しいブランチ上で起動する。
- 既存の worktree 作成チェーンを再利用し、worktree の動作を変更しない。
- 後方互換: 新しいパラメータを渡さない場合、動作は完全に不変。

## ノンゴール

- 既存ブランチの checkout はサポートしない（v1 は新規作成のみ; 既存ブランチへの切り替えは今後の増分で対応可能）。
- セッション終了時に元のブランチへ自動で切り戻すことはしない（ユーザーの状態消失を避ける）。
- merge-back の UI は作らない。
- `enter_worktree` / `exit_worktree` ツールの動作は変更しない。

## 設計

### 空状態 UI: composer 内の Git chip

モードセレクターは独立したブロックにはせず、**composer 下部のツールバーに埋め込む** — 既存の git chip の位置（入力ボックスの下、送信ボタンの左）を再利用します。chip はデフォルトで現在のブランチ `⎇ main` を表示し、クリックするとモード選択の popover が開きます:

```text
┌─ composer ───────────────────────────────────────────┐
│  タスクを記述してください…                              │
│                                                      │
│  📎  @  🎙              [⎇ main ▾]  [送信]           │
└──────────────────────────────────────────────────────┘
                              │ クリック
                              ▼
              ┌─ Git モード popover ─────────────┐
              │  ● 現在のブランチ   main のまま      │
              │  ○ 新規ブランチ     main から作成    │
              │    [ブランチ名入力 — 選択時に展開]    │
              │  ○ Worktree        独立コピー、並行可 │
              │  ─────────────────────────────  │
              │  $ git checkout -b feat/x ← main│
              │                  [ブランチを作成]     │
              └─────────────────────────────────┘
```

- **現在のブランチ**（デフォルト）: chip は `⎇ main`（緑）を表示し、既存の動作と同等。選択後 popover は自動的に閉じます。
- **新規ブランチ**: popover 内でブランチ名入力ボックス + 並行のヒントを展開し、リアルタイムで検証します（正当な git ブランチ名であること、既存ブランチと衝突しないこと）。確認後、chip は `⎇ → feat/xxx`（オレンジ）になり、✕ でワンクリックでデフォルトに戻せます。
- **Worktree 分離**: 自動生成された slug のプレビューを表示します。確認後、chip は `⎇ worktree 分離`（紫）になり、✕ でワンクリックでデフォルトに戻せます。

popover の下部には、実行される git コマンド（`git checkout -b …` / `git worktree add …`）をリアルタイムプレビューし、ユーザーは何が起きるかを明確に知ることができます。

chip 方式の利点: welcome エリアの縦方向のスペースを占有しない; 入口がユーザーの注意がある composer 内にある; 空状態でない（セッションが存在する）場合でも chip は表示されたままで、セマンティクスが一貫する。

表示条件は既存の worktree トグルと一致します: workspace が信頼済み + git リポジトリであること。条件を満たさない場合、chip は読み取り専用のブランチインジケーターに退化します（既存の動作）。

#### ステートマシン

`pendingWorktreeRef` / `worktreePending` を統一された pending の意図に拡張します:

```typescript
type SessionGitIntent =
  | { mode: 'current' }
  | { mode: 'branch'; name: string }
  | { mode: 'worktree'; slug?: string };
```

- 「現在のブランチ」を選択 → `{ mode: 'current' }`（`undefined` と同等で、パラメータを渡さない）。
- 「新規ブランチ」を選択 → `{ mode: 'branch', name }`。
- 「Worktree」を選択 → `{ mode: 'worktree', slug? }`（既存ロジックを再利用）。
- 最初のメッセージを送信 → `ensureSessionForPrompt` が intent に従って対応するパラメータを付与する。
- 作成成功後に intent をクリア; 失敗時はリトライのために保持。

### API の変更

#### `CreateSessionRequest`（SDK）

```typescript
export interface CreateSessionRequest {
  // ... existing fields ...
  worktree?: { slug?: string };
  /**
   * Create a new git branch and check it out before starting the
   * session. The session runs in the same working directory but on
   * the new branch. Mutually exclusive with `worktree`.
   */
  branch?: { name: string };
}
```

`branch` と `worktree` は相互に排他であり、両方を渡すと 400 を返します。

#### `DaemonSession` / `DaemonSessionSummary` レスポンス

```typescript
export interface DaemonBranchInfo {
  name: string; // 新規作成されたブランチ名
  baseBranch: string; // 作成時のベースブランチ
}

export interface DaemonSession {
  // ... existing fields ...
  worktree?: DaemonWorktreeInfo;
  branch?: DaemonBranchInfo;
}
```

#### `POST /session` ルート処理（`routes/session.ts`）

既存の worktree 処理ロジックの前に、branch 処理を追加します:

```text
1. branch / worktree の相互排他を検証
2. branch.name が正当な git ブランチ名であることを検証
3. ブランチ名が既存ブランチと衝突しないことを確認（git rev-parse --verify）
4. dirty tree を検出（git status --porcelain）、変更があれば 409 branch_dirty_tree
5. baseBranch = 現在のブランチを記録（git rev-parse --abbrev-ref HEAD）
6. git checkout -b <name>
7. branchMeta = { name, baseBranch }
8. sessionScope = 'thread' を強制
9. 通常の spawnOrAttach（cwd は不変）
10. 失敗時のロールバック: git checkout <baseBranch> && git branch -D <name>
```

`changeSessionCwd` は不要（作業ディレクトリは不変）で、worktree マーカーも不要です。

#### エラーコード

| エラーコード                         | 意味                                                                  |
| ------------------------------ | --------------------------------------------------------------------- |
| `branch_and_worktree_conflict` | `branch` と `worktree` を同時に渡した                                       |
| `invalid_branch`               | `branch` フィールドがオブジェクトでない（`{"name":"..."}` である必要がある）                        |
| `branch_invalid_name`          | ブランチ名が不正                                                          |
| `branch_session_conflict`      | 当該 workspace にすでに branch session があるか、共有 checkout に他のアクティブな session がある |
| `branch_init_failed`           | git サービスの初期化に失敗                                                   |
| `branch_not_git_repo`          | workspace が git リポジトリでない                                               |
| `branch_already_exists`        | ブランチ名がすでに存在                                                          |
| `branch_status_failed`         | 作業ディレクトリの状態チェックに失敗                                                  |
| `branch_dirty_tree`            | 作業ディレクトリに未コミットの変更があり、先に commit または stash が必要                            |
| `branch_checkout_failed`       | `git checkout -b` が失敗（その他の理由）                                    |

### フロントエンドのパラメータ伝播チェーン

```text
App.tsx (gitIntent state)
  → sessionPreparation.ts createAndAttachSessionForPrompt({ branch })
    → actions.ts createSession({ branch })
      → DaemonClient.createOrAttachSession({ branch })
        → POST /session { branch: { name } }
```

worktree のチェーンと完全に対称で、各レイヤーに `branch` のパススルーを追加します。

### サイドバーの表示

- Worktree session: 既存の `GitForkIcon` バッジ、不変。
- Branch session: `GitBranchIcon` + ブランチ名のバッジを表示。
- 通常の session: バッジなし、不変。

### 並行制限

同じ workspace の「新規ブランチ」session は共有作業ディレクトリの HEAD を変更するため、複数の branch session は互いに衝突します。制限ポリシー:

- **サーバー側**: `POST /session` に `branch` が含まれる場合、同じ workspace にアクティブな branch session がすでにないか確認する（bridge のセッションリスト + `branchMeta` を使用）。あれば、409 `branch_session_conflict` を返す。
- **フロントエンド**: 空状態で「新規ブランチ」を選択時、アクティブな branch session があれば、ヒントを表示して無効化する。

Worktree session はこの制限を受けません（各自が独立したディレクトリのため）。

### ファイル変更

| ファイル                                                               | 変更内容                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`               | `CreateSessionRequest` に `branch` フィールドを追加                                 |
| `packages/sdk-typescript/src/daemon/types.ts`                      | `DaemonBranchInfo`、`DaemonSession.branch`、`DaemonSessionSummary.branch` |
| `packages/cli/src/serve/routes/session.ts`                         | `POST /session` の branch 作成ロジック + ロールバック                                    |
| `packages/webui/src/daemon/session/actions.ts`                     | `createSession` に `branch` をパススルー                                             |
| `packages/webui/src/daemon/session/types.ts`                       | `createSession` のシグネチャに `branch` を追加                                         |
| `packages/web-shell/client/App.tsx`                                | `SessionGitIntent` ステートマシン、モードセレクター UI、並行チェック                        |
| `packages/web-shell/client/App.module.css`                         | セレクターのスタイル                                                                |
| `packages/web-shell/client/utils/sessionPreparation.ts`            | `branch` のパススルー                                                             |
| `packages/web-shell/client/i18n.tsx`                               | i18n keys を追加（en/zh）                                                   |
| `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx` | branch session のバッジ                                                      |

### i18n

| Key                              | EN                                                     | ZH                                       |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `gitMode.current`                | `Current branch`                                       | `当前分支`                               |
| `gitMode.branch`                 | `New branch`                                           | `新建分支`                               |
| `gitMode.worktree`               | `Worktree`                                             | `Worktree 隔离`                          |
| `gitMode.branch.placeholder`     | `Branch name`                                          | `分支名`                                 |
| `gitMode.branch.hint`            | `Switches the working directory to a new branch`       | `在工作目录中切换到新分支`               |
| `gitMode.branch.conflictWarning` | `Only one branch session per workspace at a time`      | `同一 workspace 同时只能有一个分支会话`  |
| `gitMode.branch.invalidName`     | `Invalid branch name`                                  | `分支名不合法`                           |
| `gitMode.branch.exists`          | `Branch already exists`                                | `分支已存在`                             |
| `gitMode.branch.dirtyTree`       | `Uncommitted changes detected. Commit or stash first.` | `检测到未提交改动，请先 commit 或 stash` |

## 決定済みの問題

1. **ブランチ名のデフォルト値**: 自動生成せず、ユーザーが入力する。入力ボックスは空 + placeholder のヒント（例: `feat/my-feature`）とし、決めつけを減らす。
2. **dirty working tree**: サーバー側が `git checkout -b` の前に dirty 状態を検出する（`git status --porcelain`）。未コミットの変更があれば 409 `branch_dirty_tree` を返し、フロントエンドは先に commit または stash してから branch session を作成するようユーザーに促す。UI レイヤーでの事前検出は行わず（git の実際の動作とずれるのを避ける）、サーバー側で統一的に判定する。
3. **セッションのレジューム**: サイドカーは不要。Worktree にサイドカーが必要なのは、作業ディレクトリがメインリポジトリから分離されており、resume 時に worktree のパスを知る必要があるため。Branch session の作業ディレクトリは元のディレクトリであり、`git branch` で現在のブランチが分かるため、追加の記録は不要。注: `DaemonSessionSummary.branch` は現在メモリ内にのみ保存される（bridge のマッピング）ため、daemon の再起動後に失われ、サイドバーのバッジと並行ガードは再起動をまたいで保持されない; 永続化は今後の作業。
