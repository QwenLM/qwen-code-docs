# Web Shell git chip の高速表示: branch 先行 + status のキャッシュ/プッシュ

日付: 2026-07-24
ステータス: 確認待ち

## 背景と問題

Web Shell で新規セッションを作成する際、composer ツールバー内の git chip の表示が遅い。根本原因（行レベルで確認済み）:

1. **daemon 側で branch が `git status` サブプロセスに足を引っ張られている**——
   `WorkspaceGitState.getStatus()`（`packages/cli/src/serve/workspace-git-state.ts`）には
   branch にミリ秒級のファストパスがある（`resolveBranchName` が `HEAD` ファイル + reflog
   watcher を読む）が、HTTP レスポンスは `getGitWorkingTreeStatus()` の完了を待たなければならない——
   リクエストごとに同期で `git status --porcelain=v1 --branch -z` を spawn する
   （`gitDiff.ts` の runGit、5 秒タイムアウト、キャッシュなし）。
2. **フロントエンドの chip レンダリングが全量 status にゲートされている**——新規セッション作成時、
   chip テキストは `selectedWorkspaceGitStatus?.branch` のみを信用し（App.tsx 7860–7871）、
   これは HTTP + git status 全体の往復（App.tsx 1480–1520 の effect）を待ってからでないと
   setState されない。
3. **同一ルートが並行して 2 回叩かれる**——`DaemonSessionProvider` の metadata 取得
   （`DaemonSessionProvider.tsx:1320`、`.branch` のみ使用）と App.tsx の git-status
   effect がほぼ同時に `GET /workspaces/:ws/git` を発行し、daemon 側で同じサブプロセスが
   2 つ spawn される。
4. 直列ゲーティング: `activeWorkspaceCwd` は `GET /capabilities` の先行完了に依存している。

## 目標と非目標

目標:

- 新規セッション作成/初回表示時に git chip が branch テキストで**即座に表示される**
  （ローカル HTTP 1 RTT、ミリ秒級）。dirty/ahead/behind/stash などのカウンターは daemon で
  計算完了次第補完される（`wait: true` の fresh リクエスト; セッションがある場合は別途 SSE
  リアルタイムプッシュあり）。
- 重複する `git status` サブプロセスの排除（並行の重複排除 + stale-while-revalidate）。
- リグレッションなし: サイドバーの workspace chip（カウンターが必要）、worktree セッションの
  chip、detached HEAD、非 git workspace、git 失敗時の degradation。

非目標:

- worktree の `?cwd=` パスには watcher/キャッシュを導入しない（現状維持: 直接計算し、
  worktree ごとに fs watcher がリークするのを回避）。worktree chip の遅延は不変。
- daemon 起動時のプリヒートは行わない（capabilities 後にフロントエンドがすぐリクエストしてくるため、
  プリヒートの収益は小さい）。
- `git_branch_changed` の既存セマンティクスは変更しない。

## 方案概要

3 層の変更: daemon キャッシュ + バックグラウンド更新 + SSE プッシュ（P0）、レスポンスの
2 段階化（P1）、フロントエンドの SSE 消費と、必要な呼び出し元へのスローパスの保持
（P2 は再評価後、下記参照）。

### P0+P1: daemon——`WorkspaceGitState` のキャッシュ、重複排除、バックグラウンド更新、SSE プッシュ

`WorkspaceGitEntry` の拡張:

```ts
interface WorkspaceGitEntry {
  branch: string | undefined; // watcher が鮮度を維持（現状）
  dispose: () => void; // 現状
  status?: GitWorkingTreeStatus; // 最後に計算された working-tree summary の生データ
  statusComputedAt?: number; // epoch ms
  statusPromise?: Promise<void>; // in-flight の重複排除
  disposed?: boolean; // dispose 後は publish 禁止
}
```

`getStatus(cwd, bridge, opts?: { wait?: boolean })` のセマンティクスを以下に変更:

- **デフォルト（fast path）**: entry の存在を保証（branch は即応）; stale-while-revalidate に
  従ってバックグラウンド更新を 1 回起動（下記参照）; 最後にキャッシュされた status を
  **即座に返す**（materialize: `entry.branch ?? status.branch` を overlay、v2 形状 +
  `computedAt`）; 未計算の場合は branch のみ `{ v, workspaceCwd, branch }` を返す
  （`computedAt` なし。フロントエンドはこれにより「未計算」と「clean」を区別する）。
- **`wait: true`**: fresh な計算 1 回を待つ（または開始して待つ。in-flight は再利用）。
  全量 status を返す。計算失敗時は branch のみに degradation（現状セマンティクス）。

バックグラウンド更新 `refreshStatus(entry)`:

- in-flight の再利用: `statusPromise` が存在すればそのまま返す。
- スロットリング: 前回の起動から 2 秒未満ならスキップ（focus 集中時に git サブプロセスが
  直列にキューイングされるのを防止）。
- 計算成功かつキャッシュされた enriched フィールドと差異あり → キャッシュ更新 +
  `bridge.publishWorkspaceEvent({ type: 'git_status_changed', data })` で materialized された
  全量 status をプッシュ（data は `DaemonWorkspaceGitStatus` そのもので、workspaceCwd を含む）。
  初回計算（キャッシュが空）は差異ありとみなし、必ずプッシュする——これがコールドスタート時に
  chip のカウンターを補完する経路。
- 差異なし → キャッシュ更新のみ、プッシュしない（30 秒ポーリングごとにフロントエンドの
  setState/re-render を起こさないため）。
- 計算失敗/非 git ディレクトリ → 古いキャッシュを保持し、プッシュしない。
- entry が disposed 済み → プッシュしない。

**TTL なし**。last-known + GET ごとのバックグラウンド更新起動 + SSE による補正で十分;
スロットリング 2 秒が「TTL による爆発防止」の責務を担う。`wait: true` の呼び出し元は常に
fresh な計算結果を得る（in-flight の再利用）。

ルート（`packages/cli/src/serve/routes/workspace-git.ts`）:

- `/workspace/git` と `/workspaces/:workspace/git` は `?wait=1` を解釈し、`getStatus` に
  透過する。デフォルトは fast。
- worktree の `?cwd=` 分岐は現状維持（直接 `getGitWorkingTreeStatus`、キャッシュに入れない）。

### SDK（`packages/sdk-typescript`）

- `events.ts`: `DAEMON_KNOWN_EVENT_TYPE_VALUES` に `'git_status_changed'` を追加
  （`'git_branch_changed'` の直後）。旧 SDK は `asKnownDaemonEvent` 経由でサイレントに破棄——
  後方互換、プロトコル bump 不要（`followup_suggestion` と同じパターン）。
- `ui/normalizer.ts`: `case 'git_status_changed': return [];`（`git_branch_changed` と同様に
  session mappers が処理し、UI 正規化フローに入れない）。
- `DaemonClient.workspaceGit` のシグネチャを options オブジェクトに変更:
  `workspaceGit(opts?: { cwd?: string; wait?: boolean })`。query を組み立て
  （`cwd` と `wait=1` は組み合わせ可能）。すべての呼び出し箇所 4 箇所（App.tsx、
  WorkspaceSection、DaemonSessionProvider ×2）と SDK の単体テストを移行。

### webui（`packages/webui`）

- `session/types.ts`: `DaemonConnectionState` に `gitStatus?: DaemonWorkspaceGitStatus` を追加
  （現在の workspace の全量 status のみ。SSE が維持）。
- `session/mappers.ts`: `updateConnectionFromDaemonEvent` に
  `case 'git_status_changed'` を追加——`data.workspaceCwd` と `current.workspaceCwd` が
  一致しなければ無視（`git_branch_changed` のガードをミラー）。一致すれば
  `setConnection({ ...current, gitStatus: data })`。

### web-shell（`packages/web-shell`）

- `App.tsx` の git-status effect: composer は**クライアント側の stale-while-revalidate** を
  使用——トリガーごとに 2 つのリクエストを並行発行（worktree セッションは除く、下記参照）:
  1. `workspaceGit({ cwd: sessionWorktree?.path })`（fast）: last-known が即応し、
     即座にレンダリング（コールドキャッシュは branch のみ）;
  2. `workspaceGit({ wait: true })`（fresh）: daemon でバックグラウンド計算が完了次第、全量
     status を返し、カウンターを補完。2 つのリクエストは daemon 側で同じ計算を共有
     （in-flight の重複排除）し、git サブプロセス数は増えない。
- **なぜ fresh リクエストが存在しなければならないか（逆方向の監査で発見）**: SSE の
  `git_status_changed` はセッションごとのイベントストリーム（`GET /session/:id/events`）を
  経由する。**新規セッション作成状態（deferred connect、sessionId なし）には SSE 購読がない**
  ——fast GET だけだと、カウンターは 30 秒ポーリングか focus まで補完されない。fresh
  リクエストはセッションの存在に依存せず、すべてのセッション状態で「branch は即座、カウンターは
  計算完了次第」を保証する。（`git_branch_changed` は今日すでに同じセッションなしの
  ブラインドスポットを持っており、リグレッションではない。）
- `App.tsx` には別途 SSE 同期 effect を保持: `connection.gitStatus` が変化し、
  `workspaceCwd` が一致し、`sessionWorktree` がない場合に `selectedWorkspaceGitStatus` に
  書き込む——**セッションがある場合の** 2 回のポーリング間のリアルタイムプッシュをカバー
  （別クライアント/CLI がトリガーしたバックグラウンド更新がプッシュされる）。
- worktree セッションは fast リクエストのみ発行: `?cwd=` パスはもともとキャッシュを
  バイパスして直接計算（fast と wait は等価）しており、挙動は不変。
- `sidebar/WorkspaceSection.tsx`: `workspaceGit({ wait: true })`——サイドバーの chip には
  カウンターが必要で SSE/fresh の二重発行経路がないため、ブロッキングのセマンティクスを保持
  （現状の挙動は不変; 非アクティブな workspace には SSE 経路がない）。

### P2 再評価（価値に基づく刈り込み）

元の P2（フロントエンドの重複排除: provider の初回取得が全量 status を保存し App が再利用）は
**実施しないに降格**: P0 の daemon 側の in-flight 重複排除が重複する `git status` サブプロセス
（元問題の実体）をすでに排除しており、残るのはミリ秒級のローカル HTTP 往復 1 回だけ。
全量 status を provider に保存して App に再利用させると、層をまたぐ結合が生じ
（provider→App の初期値プロトコル）、収益はほぼゼロ。provider の 2 箇所の
`workspaceGit()` 呼び出しは `.branch` のみ取得するので、デフォルトの fast path を
たどればよく、変更ゼロ。

## 互換性

- ルートのレスポンス形状は不変（v2、enriched フィールドはもともと optional）; 新規の
  `?wait=1` query は任意。
- デフォルトの fast path セマンティクスの変更: 呼び出し元は fresh な計算ではなく
  last-known（古いキャッシュ）を受け取りうる。既存の呼び出し元をすべて 1 つずつ確認:
  - `DaemonSessionProvider`（×2）: `.branch` のみ読む——branch は常に fresh（watcher）、
    影響なし。
  - App.tsx の composer chip: まさに本設計の対象。
  - WorkspaceSection: 明示的に `wait: true` に変更、セマンティクス不変。
- 新しい SSE イベントは旧クライアントがサイレントに破棄（SDK の known-list 機構）。
- `git status_changed` はその workspace のセッション SSE bus にのみ publish
  （`publishWorkspaceEvent` の既存機構。複数 workspace の隔離を含む）。

## リスクと軽減

| リスク                                            | 軽減                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| chip が先に branch を表示し、後からカウンターが出現してツールバー幅が揺れる | 既存の非表示計測コピー（ChatEditor の toolbar-measure）が再計測を処理; わずかな shift は許容                    |
| branch のみのレスポンスが "clean" と誤読される                | branch のみには `computedAt` を含めない; GitBranchIndicator の既存ロジックは `computedAt` 欠落時に "clean" を表示しない |
| キャッシュされた status と watcher の branch が不一致            | materialize 時に `entry.branch ?? status.branch` を overlay（現状ロジックを保持）                           |
| バックグラウンド更新のリーク（dispose 後の publish）              | `disposed` フラグによるガード                                                                             |
| focus 集中が git の直列 spawn を引き起こす                    | 2 秒スロットリング + in-flight の再利用                                                                         |

## テスト計画

単体テスト:

- `workspace-git-state.test.ts`（拡張）: fast path が last-known を即座に返す;
  コールドキャッシュは `computedAt` なしの branch のみを返す; バックグラウンド更新は差異がある場合のみ
  `git_status_changed` を publish; 初回計算は必ず publish; 並行 getStatus は
  `getGitWorkingTreeStatus` を 1 回だけトリガー; 2 秒スロットリング; `wait: true` は
  fresh な計算を待つ; 計算失敗時は古いキャッシュを保持し publish しない; dispose 後は publish しない。
- `routes/workspace-git.test.ts`（拡張）: `?wait=1` の透過; worktree の `?cwd=` パスは
  キャッシュに入らない（直接計算を維持）。
- SDK `DaemonClient.test.ts`: options オブジェクトの query 組み立て（cwd / wait / 組み合わせ）。
- webui `mappers.test.ts`: `git_status_changed` の workspaceCwd 一致/不一致の 2 分岐。

E2E（`.qwen/e2e-tests/2026-07-24-git-chip-fast-branch.md`、検証段階で追加）:
実 daemon + web shell、大きな workspace で新規セッション作成——chip（branch）はエディター準備完了後に
即座に出現し、カウンターはその後補完される; サイドバー chip の挙動は不変; focus/30 秒ポーリングは
引き続き更新; worktree セッションの chip は不変。

## 却下された代替案

- **TTL キャッシュ（バックグラウンド更新/SSE なし）**: 繰り返しリクエストの高速化にしかならず、
  コールドスタートは依然 git status を待つ必要がある——「新規セッションの chip が遅い」という
  主訴を解決しない。
- **capabilities 後の daemon プリヒート**: 初回 GET とプリヒートはほぼ同時であり、in-flight の
  重複排除後は収益 ≈ 0。
- **フロントエンドは重複排除/リクエスト結合のみ**: git status サブプロセスの待機を排除せず、
  対症療法。
