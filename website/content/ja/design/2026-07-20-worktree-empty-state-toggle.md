# Web Shell 空状態の worktree 分離トグル

## 背景

Worktree 分離セッション（[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md) 参照）の現在の唯一の入口は、サイドバーの workspace ヘッダーにある **git ブランチカプセルのドロップダウンメニュー**（`WorkspaceSection.tsx`）であり、しかもレンダリングには `onOpenGitDiff`、`workspace.trusted`、`gitStatus?.branch` の 3 つの条件を同時に満たす必要があります。ユーザーが git pill がクリック可能であることを発見するのは非常に難しく、機能が深く隠れすぎています。

Web Shell には独立した「新規セッションページ」がありません — 新規セッションをクリックするとチャットの空状態（WelcomeHeader + 入力ボックス）が表示され、それが事実上の新規セッションページです。空状態にはすでに完成された worktree pending バッジ UI（`App.tsx` の `worktreeWelcomeBadge`）と完全な pending ステートマシン（`pendingWorktreeRef` / `worktreePending`）があり、セッションは最初のメッセージを送信した時点で初めて実際に作成されます（遅延作成）。したがって「トグル」は pending の意図を設定するだけです。

## ゴール

- チャットの空状態に見える worktree 分離トグルを提供し、クリック時に既存の pending ステートマシンと遅延作成チェーンを再利用する。
- オンにすると既存の pending バッジを表示し、キャンセル手段を提供する。
- サイドバーの git pill メニュー入口は変更せずに保持する（workspace ごとのショートカット入口）。

## ノンゴール

- SDK、daemon ルーティング、`GitWorktreeService` は変更しない — 作成チェーンは完全に再利用する。
- 「意図は workspace に従う」という既存のセマンティクスを変更しない: pending の意図は常に、次回のセッション作成時に解決された workspace（`lockedWorkspaceCwd ?? selectedWorkspaceCwd ?? primary`）に作用し、サイドバー入口の現状と一致する。
- 「pending がオンの状態で git 以外の workspace に切り替えた」場合の失敗提示は扱わない（現状でもエラーが発生し、今回の範囲を超える）。

## 設計

### トグルの表示条件（eligibility）

以下の条件をすべて満たす場合のみ、空状態にトグルを表示します:

| 条件                       | シグナル                                                          | 理由                                                            |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| チャット空状態                 | `welcomeHeader` は `isChatEmptyState` 時のみレンダリングされる                | 当然満たされるため、追加の判定は不要                                          |
| 現在の workspace が信頼済み      | `workspaces.find(e => e.cwd === activeWorkspaceCwd)?.trusted` | サイドバー入口と一致: 信頼されていない workspace では git 変更を行わない                |
| 現在の workspace が git リポジトリ | `selectedWorkspaceGitStatus?.branch`                          | daemon は git 以外のリポジトリに対してハードフェイルする（`worktree_not_git_repo`）ため、事前に非表示化 |

`activeWorkspaceCwd` は既存の memo を再利用し（`connection.sessionId ? connection.workspaceCwd : (locked ?? selected ?? primary)`）、`selectedWorkspaceGitStatus` は既存の取得 effect を再利用します。どちらも既存の状態であり、新しいネットワークリクエストは追加しません。git status の読み込みが完了する前はトグルを表示せず、サイドバーの `gitStatus?.branch` によるゲート動作と一致させます。

### インタラクション

- **オフ状態**: バッジの位置に控えめな ghost ボタン（fork アイコン + `worktree.welcomeTitle` の文言）をレンダリングします。クリック → `pendingWorktreeRef.current = {}` + `setWorktreePending(true)`。
- **オン状態**: 既存の `worktreeWelcomeBadge`（アイコン + タイトル + 説明）をレンダリングし、右上に X キャンセルボタンを追加（`aria-label` は新しい i18n key を使用）。クリック → `pendingWorktreeRef.current = undefined` + `setWorktreePending(false)`。
- 最初のメッセージを送信 → `ensureSessionForPrompt` が既存のロジックに従って `worktree: {}` を付与し、成功後に pending を自動クリア。失敗時はリトライのためにバッジを保持（現状どおり）。
- サイドバーの「新規セッション」クリックや既存セッションの読み込みなど、既存パスの pending クリアロジックは変更しません。

### ファイル変更

| ファイル                                                              | 変更内容                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/web-shell/client/App.tsx`                               | eligibility memo、オン/キャンセルの handler、welcomeHeader memo 内でのトグル/バッジのレンダリング  |
| `packages/web-shell/client/App.module.css`                        | ghost トグルボタンのスタイル、バッジキャンセルボタンのスタイル                                     |
| `packages/web-shell/client/i18n.tsx`                              | `worktree.cancel` を追加（en/zh）                                          |
| `packages/web-shell/client/App.test.tsx`                          | ユニットテスト: 表示ゲート、オン/キャンセル、送信時の `worktree: {}` 付与               |
| `packages/web-shell/client/e2e/utils/mockDaemon.ts`               | `workspaces` capability（`trusted` を含む）と `/workspaces/:cwd/git` ルートを補完 |
| `packages/web-shell/client/e2e/web-shell.worktree-toggle.spec.ts` | Playwright E2E を新規追加: トグルの出現/オン/キャンセル、送信リクエストボディに `worktree` が含まれること         |

## オープン問題

なし。
