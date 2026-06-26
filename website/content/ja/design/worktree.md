# Worktree 汎用能力設計

## 問題提起

qwen-code は現在、Arena マルチモデル比較シナリオ向けの内部 worktree 実装（`GitWorktreeService`）のみを持っており、ユーザーは通常のセッションで worktree を使って作業を分離できません。また、AgentTool も subagent 用の分離された worktree 環境を作成することをサポートしていません。

目標は、worktree を汎用能力として作り、ユーザーセッションレベルの分離と Agent レベルの分離をサポートしつつ、既存の Arena 機能の体験を完全に維持することです。

## 現状比較

| 機能                              | qwen-code       | claude-code | 段階    |
| --------------------------------- | --------------- | ----------- | ------- |
| `EnterWorktree` ツール            | ✅（Phase A）   | ✅          | —       |
| `ExitWorktree` ツール             | ✅（Phase A）   | ✅          | —       |
| AgentTool `isolation: 'worktree'` | ✅（Phase B）   | ✅          | —       |
| 期限切れ worktree 自動クリーンアップ    | ✅（Phase B）   | ✅          | —       |
| worktree セッション状態の永続化・復元       | ❌              | ✅          | Phase C |
| 作成後セットアップ（フック設定）        | ❌              | ✅          | Phase C |
| StatusLine での worktree 状態表示   | ❌              | ✅          | Phase C |
| WorktreeExitDialog（終了確認）     | ❌              | ✅          | Phase C |
| `--worktree` CLI 起動フラグ        | ✅（Phase D）   | ✅          | —       |
| シンボリックリンクディレクトリ（node_modules 等） | ✅（Phase D）   | ✅          | —       |
| PR 参照（`--worktree=#123`）       | ✅（Phase D）   | ✅          | —       |
| sparse checkout                   | ❌              | ✅          | Future  |
| tmux 連携                         | ❌              | ✅          | Future  |
| Arena マルチモデル worktree 分離      | ✅（qwen 独自） | ❌          | —       |
| ダーティ状態上書き（stash + copy）       | ✅              | ✅          | —       |
| Baseline commit トラッキング          | ✅（qwen 独自） | ❌          | —       |

## 設計原則

**worktree は汎用能力であり、Arena はその上位アプリケーションである。**

- 汎用 worktree 層：`EnterWorktree`/`ExitWorktree` ツール、AgentTool `isolation` パラメーター、セッション状態管理、自動クリーンアップ
- Arena 層：マルチモデル並列スケジューリング、`worktreeBaseDir` カスタムパス、バッチ作成と diff 比較。引き続き `GitWorktreeService.setupWorktrees()` の既存ロジックを使用し、汎用層の変更の影響を受けない

AgentTool の `isolation: 'worktree'` は汎用パスのみを通り、Arena 内部はこのパラメータを経由して worktree を作成しない。両者は独立したパスを持つ。

## パスと設定

### 汎用 worktree パス

`EnterWorktree` ツールまたは AgentTool `isolation: 'worktree'` によって作成される worktree は、固定で以下に配置されます。

```
{git リポジトリルート}/.qwen/worktrees/{slug}
```

パスは設定不可。slug 命名規則：

- ユーザーセッション worktree：ユーザー指定の名前、または自動生成（形式：`{形容詞}-{名詞}-{4桁ランダム}`）
- Agent worktree：`agent-{7桁ランダム hex}`

### Arena worktree パス（既存、変更なし）

Arena の worktree パスは `agents.arena.worktreeBaseDir` で制御され、デフォルトは `~/.qwen/arena`（`ArenaManager.ts:125`）で、汎用パスとは完全に独立しており、一切変更しません。

### 拡張設定

| 設定項目                            | 型         | 用途                                                             | 段階    |
| ----------------------------------- | ---------- | ---------------------------------------------------------------- | ------- |
| `ui.hideBuiltinWorktreeIndicator`   | `boolean`  | Footer 内蔵の `⎇ worktree-… (…)` 行を非表示、カスタム statusline 用 | Phase C |
| `worktree.symlinkDirectories`       | `string[]` | 指定ディレクトリ（例：`node_modules`）を worktree にシンボリックリンク、ディスク消費を防止 | Phase D |
| `worktree.sparsePaths`              | `string[]` | git sparse-checkout cone モード、大規模 monorepo で指定パスのみ書き出し | Future  |

Phase A / B では新しい設定項目は追加しません。

## ツール設計

### EnterWorktree

**トリガー条件：** ユーザーが "start a worktree"、"use a worktree"、"create a worktree" などの言葉を明確に述べた場合。「バグを修正する」「機能を開発する」と言ったときに自動的にトリガーされるべきではありません。

**入力スキーマ：**

```
name?: string  // オプション、slug 形式：英数字/ドット/アンダースコア/ダッシュ、最大64文字
```

**動作：**

1. 現在 worktree 内にいないことを確認（ネスト防止）
2. git リポジトリルートに解決（既にサブディレクトリにいる場合を処理）
3. `GitWorktreeService` を呼び出して worktree を作成、パスは `.qwen/worktrees/{slug}`
4. worktree セッションを `SessionService` に書き込む
5. 作業ディレクトリを worktree パスに切り替え
6. ファイルキャッシュをクリア

**出力：** `worktreePath`、`worktreeBranch`、`message`

### ExitWorktree

**トリガー条件：** ユーザーが "exit the worktree"、"leave the worktree"、"go back" などと言った場合。

**入力スキーマ：**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // action='remove' の場合のみ有効
```

**セーフガード：**

- 現在のセッションが `EnterWorktree` で作成した worktree のみを操作
- `action='remove'` で未コミットの変更がある場合、拒否（`discard_changes: true` の場合を除く）

**動作：**

- `keep`：セッションの worktree 状態をクリア、worktree ディレクトリとブランチを維持、元の作業ディレクトリに戻す
- `remove`：worktree ディレクトリを削除、対応する git ブランチを削除、セッション状態をクリア、元の作業ディレクトリに戻す

**出力：** `action`、`originalCwd`、`worktreePath`、`worktreeBranch`

## ユーザートリガー方法

| 方法           | 例                                                       | 実装段階 |
| -------------- | -------------------------------------------------------- | -------- |
| セッション内で明示的にリクエスト | ユーザーが "worktree で作業を開始" → モデルが EnterWorktree を呼び出す | Phase A  |
| Agent 分離     | モデルが subagent に `isolation: 'worktree'` を設定         | Phase B  |
| CLI 起動フラグ | `qwen --worktree my-feature`                             | Phase D  |

スラッシュコマンドはなし。セッション内の worktree トリガーはユーザーが明示的に言及した場合に依存し、`isolation: 'worktree'` はモデルが自律的に判断するシナリオです。

## 段階的実装計画

### Phase A：コアツール（ユーザーセッションレベル worktree）

**目標：** ユーザーがセッション内で worktree に入る／出ることができるようにする。

**実装する機能：**

- `EnterWorktree` ツール：worktree 作成、作業ディレクトリ切替、セッション状態記録
- `ExitWorktree` ツール：keep / remove の2種類の終了方法、セーフガード
- `GitWorktreeService` 拡張：単一ユーザーセッション向けの `createUserWorktree()` / `removeUserWorktree()` メソッドを新規追加、既存の git 操作ロジックを再利用、Arena が使用するバッチインターフェースは変更しない
- `SessionService` 拡張：`WorktreeSession` フィールドを新規追加、`{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` を記録；`--resume` 時に worktree 作業ディレクトリを復元
- ツールプロンプト：各ツールに使用説明を記述し、いつ呼び出すか／呼び出さないかを明確にする

**影響ファイル：**

| ファイル                                               | 変更タイプ                                      |
| ------------------------------------------------------ | --------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`                | `ENTER_WORKTREE`、`EXIT_WORKTREE` 定数を新規追加 |
| `packages/core/src/tools/EnterWorktreeTool/`           | 新規ディレクトリ：`EnterWorktreeTool.ts`、`prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`            | 新規ディレクトリ：`ExitWorktreeTool.ts`、`prompt.ts`  |
| `packages/core/src/services/gitWorktreeService.ts`     | ユーザーセッションレベルのインターフェースを新規追加（Arena インターフェースは変更しない） |
| `packages/core/src/services/sessionService.ts`         | `WorktreeSession` フィールドおよび読み書きメソッドを新規追加 |
| `packages/core/src/tools/` 登録エントリ                 | 新規ツールを登録                            |

**Phase A の範囲外：**

- Agent 分離（Phase B）
- hooks 設定などの作成後セットアップ（Phase C）
- UI 状態表示（Phase C）

---

### Phase B：Agent 分離（AgentTool `isolation: 'worktree'`）+ 説明更新

**目標：** モデルが subagent 用に一時的な分離 worktree を作成し、agent 終了後に自動クリーンアップできるようにする；影響を受けるツールの説明やプロンプトを同時に更新する。

**実装する機能：**

_Agent 分離コア：_

- `AgentTool` に `isolation?: 'worktree'` パラメーターを新規追加
- Agent 起動時に一時 worktree を作成（slug：`agent-{7hex}`、パス：`.qwen/worktrees/agent-{7hex}`）
- Agent 終了後：変更がない場合は自動削除；変更がある場合は保持し、パスとブランチを結果に含めて返す
- 期限切れ worktree 自動クリーンアップ：`.qwen/worktrees/` をスキャン、`agent-{7hex}` パターンに一致、30日以上経過かつ未プッシュのコミットがない場合は削除、fail-closed 戦略

_説明とプロンプト更新：_

- `AgentTool` description に `isolation: 'worktree'` パラメーターの説明を追加（claude-code の `AgentTool/prompt.ts:272` を参考）
- 新規 `buildWorktreeNotice()`：fork subagent が worktree 内で実行されている場合、分離 worktree にいること、パスは親 agent から継承、編集前にファイルを再読み込みする必要があることを示すコンテキストヒントを注入（claude-code の `forkSubagent.ts:buildWorktreeNotice` を参考）

_変更不要：_

- review skill（`SKILL.md`）：review は独立したメカニズム（パス `.qwen/tmp/review-pr-<n>`、`qwen review fetch-pr` コマンドで作成）を使用し、汎用 worktree パスやメカニズムとは完全に異なるため、混乱はない

**Arena 互換性保証：** Arena 内部は `isolation` パラメーターを経由して worktree を作成しないため、この変更は Arena のコードパスに影響しません。

**影響ファイル：**

| ファイル                                               | 変更タイプ                                               |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `packages/core/src/tools/agent/agent.ts`               | `isolation` パラメーターおよび worktree 作成/クリーンアップロジックを新規追加 |
| `packages/core/src/tools/agent/fork-subagent.ts`       | `buildWorktreeNotice()` を新規追加、worktree モードで注入 |
| `packages/core/src/services/gitWorktreeService.ts`     | `createAgentWorktree()` / `removeAgentWorktree()` を新規追加 |
| `packages/core/src/services/worktreeCleanup.ts`        | 新規：期限切れ worktree 自動クリーンアップロジック               |

---

### Phase C：セッション完全性（SessionService 永続化 + UI セーフティネット）

**目標：** worktree 状態がセッション中断後も復元可能、ユーザーは常にどの worktree にいるかを UI で把握でき、セッション終了時に安全確認を行う。

**実装する機能：**

_SessionService worktree 状態永続化 + `--resume` 復元：_

- `SessionService` 拡張 `WorktreeSession` フィールド、`{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` を記録
- `EnterWorktreeTool` が `sessionService.setWorktreeSession()` を呼び出し状態書き込み
- `ExitWorktreeTool` が `sessionService.clearWorktreeSession()` を呼び出し状態クリア
- `--resume` 起動パスでこのフィールドを読み取り、`targetDir` を復元、モデルにコンテキストヒントを注入

_作成後セットアップ：_

- worktree 作成後、自動で `git config core.hooksPath <mainRepo>/.git/hooks` を実行し、worktree 内のコミットがメインリポジトリのフックと一貫した動作をすることを保証

_StatusLine worktree 表示：_

- `UIStateContext` に `activeWorktree` フィールドを新規追加（セッション状態から読み取り）、セッションが worktree に入る／出る際に更新
- `StatusLineCommandInput` payload に `worktree?: { slug: string; branch: string }` フィールドを新規追加、ユーザーの statusline スクリプトで使用可能
- `Footer` は `activeWorktree` が空でない場合、組み込みで `⎇ <branch> (<slug>)` 行を表示、ユーザーが statusline スクリプトを設定しなくても基本の可視性を確保

_WorktreeExitDialog：_

- 新規 `WorktreeExitDialog.tsx` コンポーネント、既存の Dialog 記法を参考
- 終了キー（Ctrl+C / Ctrl+D）処理ロジックを変更：`activeWorktree` が空でないことを検出した場合、2回目の確認をインターセプトし、Dialog を表示してユーザーに keep または remove を選択させる
- keep / remove 操作は `ExitWorktreeTool` の既存パスを再利用

**影響ファイル：**

| ファイル                                                          | 変更タイプ                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                    | `WorktreeSession` フィールドおよび読み書きメソッドを新規追加                     |
| `packages/core/src/tools/enter-worktree.ts`                       | `sessionService.setWorktreeSession()` を呼び出す                                  |
| `packages/core/src/tools/exit-worktree.ts`                        | `sessionService.clearWorktreeSession()` を呼び出す                                |
| `packages/core/src/services/gitWorktreeService.ts`                | `createUserWorktree()` / `createAgentWorktree()` 後に `core.hooksPath` 設定を追加 |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`                 | `activeWorktree` フィールドおよび set/clear action を新規追加                     |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                      | `StatusLineCommandInput` に `worktree` フィールドを新規追加                       |
| `packages/cli/src/ui/components/Footer.tsx`                       | 組み込み worktree 行表示                                                        |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`           | 新規                                                                              |
| `packages/cli/src/ui/components/DialogManager.tsx`                | `WorktreeExitDialog` を登録                                                     |
| `packages/cli/src/ui/components/ExitWarning.tsx` または終了キー処理 | `activeWorktree` を検出して終了をインターセプト                                   |

---

### Phase D：起動時設定（`--worktree` CLI フラグ + ディレクトリシンボリックリンク + PR 参照）

**目標：** 起動時に直接 worktree に入る、ディレクトリシンボリックリンクで大規模プロジェクトのディスクオーバーヘッドを削減、PR 参照で pull request に基づいて素早く worktree を作成することをサポート。

**範囲：** 3つの機能を1つのフェーズで一斉にリリース。これらはすべて同じ起動エントリに紐づいており、symlink / PR fetch の両方が worktree 作成直後に実行される必要があるため、個別に分割すると bootstrap シーケンスを繰り返し変更することになる。

#### D-1：`--worktree [name]` CLI 起動フラグ

**パラメーター形式：** yargs オプションは3つの形式を受け付ける：

| 形式                      | 動作                                                 |
| ------------------------- | ---------------------------------------------------- |
| `qwen --worktree`         | bare flag、自動生成 slug（`{形容詞}-{名詞}-{6hex}`） |
| `qwen --worktree my-name` | 明示的 slug、`EnterWorktreeTool` の slug 検証ルールを継承 |
| `qwen --worktree=my-name` | 上記と同等                                           |

短エイリアス `-w` は提供しない（qwen-code の短エイリアスは最も高頻度のパラメーターにのみ予約し、名前の衝突を避けるため）。

**起動シーケンス：** worktree は以下の場所で作成される：

1. `parseArguments()` が argv を解析（既存）
2. resume picker（既存、`gemini.tsx` の行 588-629）
3. `loadCliConfig()` が Config + auth を初期化（既存、行 643-653）
4. **新規：** `argv.worktree !== undefined` の場合、`createUserWorktree()` を呼び出す
   - sidecar に書き込む（`writeWorktreeSession()`）
   - `process.chdir(worktreePath)` と同時に `Config.setTargetDir(worktreePath)` を設定
   - 同一 worktree への再アタッチパス：`git worktree add` をスキップし、その場で chdir（Phase 6 で修正）。`projectHash` を跨ぐ `--resume` × `--worktree` の組み合わせは session lookup フェーズで失敗する。詳細は後述の「`--resume` との優先順位」を参照。
5. メインループ（TUI / headless `-p` / ACP の3つのエントリすべてが第4ステップを経由）

**Phase A との簡略化の違い：** Phase A の `EnterWorktreeTool` は `Config.targetDir` を**変更しない**。モデルがツール結果から絶対パスを読み取り、それをそのまま使用する。Phase D の CLI flag は起動時に即座に有効になり、実行中のモデルコンテキストとの互換性は不要なため、**直接 `targetDir` と `process.cwd()` を切り替える** —— これはより強力な分離保証である。2つのパスは動作が異なるため、ユーザードキュメントで説明する必要がある。

**終了動作：** 既存の `WorktreeExitDialog`（Phase C で実装済み）を再利用。Ctrl+C/D を2回トリガー → ユーザーが keep / remove / cancel から選択。新しいコードパスは不要。

**`--resume` との優先順位：**

セッションは `projectHash(process.cwd())` をキーとして保存されるため、`--worktree` は resume picker / `loadCliConfig` より前に worktree に chdir する。そのため、「worktree X で起動したセッションを worktree Y 内で resume する」ことは**アーキテクチャ上不可能**（両者の projectHash が異なり、セッションファイルは異なるディレクトリに配置される）。以下の表は D-1 実装 + Phase 6 再アタッチ修正後の実際の動作を示す：

| `--resume` 状態              | `--worktree` 状態          | 結果                                                                                       |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| なし                         | なし                       | 通常セッション、worktree なし                                                              |
| なし                         | あり（新規 slug）          | 新規 worktree 作成                                                                         |
| なし                         | あり（既存 slug）          | **再アタッチ** 既存 worktree に（Phase 6 修正）                                              |
| あり                         | なし                       | 古い worktree を復元（Phase C の動作、sidecar がヒットすればリマインダーを注入）               |
| あり（sid が同一 worktree 由来）  | あり（同一 slug、再アタッチ） | 再アタッチ + セッションヒット：正常 resume                                                  |
| あり（sid が main checkout 由来） | あり（任意 slug）          | **セッションルックアップ失敗**：`No saved session found with ID …`、exit 1。documented limitation |
| あり（sid が worktree X 由来）    | あり（slug Y, X != Y）    | 同上、セッションが projectHash を跨いで検索不可                                              |

projectHash を跨ぐオーバーライドのセマンティクス（`--worktree` が異なる worktree / メインチェックアウトのセッション間で転送される）には、ストレージを cwd 由来の projectHash ではなく repo root に固定する必要があり、これは将来の Config リファクタリングの範囲である。`persistStartupWorktreeSidecar` 内の `overrodeResumedWorktree` 分岐コードは、そのリファクタリングが完了したときに自動的に有効になるように保持されているが、現時点では本番パスではトリガーされない。

#### D-2：`worktree.symlinkDirectories` 設定項目

**スキーマ：**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- 型：`string[]`、デフォルト `undefined`（オプトイン）
- トップレベルの名前空間 `worktree` は新規追加（`settingsSchema.ts` でアルファベット順に `tools` と `ui` の間に挿入）
- パスは**メインリポジトリルートからの相対パス**、絶対パスまたは `..` を含むパスはパストラバーサルガードにより拒否

**適用範囲：** 汎用層で作成されるすべての worktree、以下を含む：

- `EnterWorktreeTool`（Phase A）
- `AgentTool` `isolation: 'worktree'`（Phase B）
- `--worktree` CLI flag（Phase D-1）

Arena の worktree は汎用層を通らないため、この設定の影響を受けない。

**実装場所：** `GitWorktreeService.performPostCreationSetup()` —— 既存の `configureHooksPath()`（Phase C で確立されたパターン）に続く。新規 `symlinkConfiguredDirectories()` メソッドを追加し、設定項目をループして `fs.symlink(absSource, absDest, 'dir')` を呼び出す。

**エラー処理（fail-open）：**

| シナリオ                        | 動作                           |
| ------------------------------- | ------------------------------ |
| ソースディレクトリが存在しない（ENOENT） | サイレントスキップ、debug log    |
| ターゲットパスが既に存在する（EEXIST） | サイレントスキップ、debug log（上書きしない） |
| パストラバーサル（`../`、絶対パス等） | その項目を拒否、debug log warn    |
| その他の I/O エラー               | debug log warn、後続項目を継続処理 |

worktree 作成自体は symlink の失敗では**中止されない** —— `configureHooksPath()` と同じ「ベストエフォートの作成後セットアップ」原則。

#### D-3：PR 参照解決（`--worktree=#<N>` / フル URL）

**サポート形式：**

| 形式                                                            | 解決後の PR 番号 |
| --------------------------------------------------------------- | ---------------- |
| `--worktree=#123`                                               | 123              |
| `--worktree '#123'`                                             | 123              |
| `--worktree https://github.com/foo/bar/pull/123`                | 123              |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123              |

**slug とブランチ名：**

- slug：`pr-<N>`（特別な予約済みプレフィックス、ユーザー slug と区別）
- ブランチ：`worktree-pr-<N>`（qwen-code の既存の `worktree-<slug>` 命名規則を継承；claude-code の `pr-<N>` 直接命名は採用せず、ローカルの `pr-<N>` ブランチとの衝突を避ける）

**fetch 戦略：**

```
git fetch origin pull/<N>/head
→ FETCH_HEAD を新しい worktree のベースとして使用
```

`gh` CLI に依存しない —— 純粋な git fetch、あらゆる GitHub インスタンス（パブリックまたはエンタープライズ）をサポート、`origin` リモートが GitHub を指している限り。

**エラーパス：**

| シナリオ                   | エラーメッセージ                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `origin` リモートが存在しない | `--worktree=#<N> requires an "origin" remote that points at GitHub.`                 |
| `git fetch` が失敗         | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.`         |
| ネットワークタイムアウト（30秒） | 同上、`(timeout)` を追加                                                            |
| `origin` リモートが GitHub ではない | アクティブチェックは行わない、`git fetch` で自然に失敗する（PR プロトコルは GitHub 固有） |

**D-2 との関係：** PR worktree も同様に `symlinkDirectories` を適用する（ユーザーは PR 上ですぐにテストを実行できることを期待し、依存ディレクトリを再利用する必要がある）。

#### 影響ファイル

| ファイル                                                         | 変更タイプ                                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                              | yargs に `--worktree` オプションを追加；`CliArgs` インターフェースに `worktree?: string \| boolean` を追加                                     |
| `packages/cli/src/gemini.tsx`                                    | `loadCliConfig()` の後、メインループの前に新規 `setupStartupWorktree()` ヘルパーを呼び出す                                                       |
| `packages/cli/src/startup/worktreeStartup.ts`                    | 新規：`setupStartupWorktree()` は slug 解決、PR fetch、sidecar 書き込み、cwd 切り替えを処理                                                        |
| `packages/cli/src/nonInteractiveCli.ts`                          | 同じヘルパーを再利用（既に `restoreWorktreeContext` インジェクションロジックあり、変更不要）                                                      |
| `packages/cli/src/acp-integration/acpAgent.ts`                   | 同じヘルパーを再利用                                                                                                                            |
| `packages/core/src/services/gitWorktreeService.ts`               | 新規 `parsePRReference()`、`fetchPullRequestRef()`、`symlinkConfiguredDirectories()`；`createUserWorktree()` はオプションの `baseBranchRef` パラメーターを受け付ける |
| `packages/cli/src/config/settingsSchema.ts`                      | 新規 `worktree.symlinkDirectories: string[]` トップレベル項目を追加                                                                              |
| `packages/vscode-ide-companion/schemas/settings.schema.json`     | 再生成                                                                                                                                       |
| `docs/users/features/worktree.md`                                | Quick Start CLI flag セクションを追加、Settings テーブルに行を追加                                                                               |

#### セキュリティとロールバック

- **fail-open vs fail-close：** symlink / hooks の失敗は worktree 作成を**中止しない**（Phase C の既定パターンと同じ）；PR fetch の失敗は起動を**中止する**（ベース ref がないと worktree を作成できない）；slug 検証の失敗は起動を**中止する**（`EnterWorktreeTool` と同様）。
- **path traversal：** `symlinkDirectories` の項目は解決後も `repoRoot` 内になければならず、そうでなければその項目を拒否してログ出力。
- **PR fetch タイムアウト：** 30秒のハードタイムアウト、応答のないネットワークが起動を遅延させるのを防止。
- **cwd 切り替えの副作用：** `process.cwd()` を切り替えた後、相対パス（例：`--prompt-file ./foo.txt`）の解決に影響する可能性がある。**対策：** cwd を切り替える前に、すべての相対パスパラメーターを事前に解決する（具体的には `setupStartupWorktree()` の入口で一度 normalize する）。

#### 未解決の質問

1. **`--worktree-keep-on-exit`？** claude-code にはなく、qwen-code で Exit Dialog のデフォルトを keep にする CLI flag が必要か？**まずは追加しない**、ユーザーフィードバックを待つ。
2. **`worktree.symlinkDirectories` にプロジェクトごとのオーバーライドは必要か？** 現在の設定は user/workspace/project の3段階マージを既にサポートしており、特別な処理は不要。
3. **PR fetch は `merge` ref（`pull/<N>/merge`、つまりベースとマージされた後の ref）を取得すべきか、それとも `head` か？** claude-code は `head` を選択。理由はユーザーが通常 PR の実際の変更を見たいため。この選択を継承する。

---

### Future：高度な機能（必要に応じて実装）

以下の機能はより特定のユースケース向けで、現時点ではスケジュールに含めず、ユーザーの需要が明確になってから実装を評価する。

| 機能                    | 説明                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| sparse checkout         | `worktree.sparsePaths` 設定項目、大規模 monorepo で指定パスのみ checkout、作成時間とディスク使用量を削減 |
| `.worktreeinclude` ファイル | gitignore されているファイル（`.env`、`secrets.json` など）を自動的に worktree にコピー    |
| tmux 連携               | `--worktree --tmux` で新しい tmux ウィンドウに worktree セッションを起動                      |