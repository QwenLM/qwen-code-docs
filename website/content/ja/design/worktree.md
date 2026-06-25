# Worktree 汎用機能設計

## 問題の概要

qwen-code には現在、Arena マルチモデル比較シナリオ向けの内部 worktree 実装（`GitWorktreeService`）のみが存在しており、ユーザーは通常のセッションで worktree を使った作業の分離ができません。また AgentTool も、サブエージェント向けの隔離された worktree 環境の作成に対応していません。

目標は、worktree を汎用機能として整備し、ユーザーセッションレベルおよびエージェントレベルの分離をサポートしつつ、既存の Arena 機能の動作を完全に維持することです。

## 現状比較

| 機能                              | qwen-code       | claude-code | フェーズ    |
| --------------------------------- | --------------- | ----------- | ------- |
| `EnterWorktree` ツール              | ✅（Phase A）   | ✅          | —       |
| `ExitWorktree` ツール               | ✅（Phase A）   | ✅          | —       |
| AgentTool `isolation: 'worktree'` | ✅（Phase B）   | ✅          | —       |
| 期限切れ worktree の自動クリーンアップ            | ✅（Phase B）   | ✅          | —       |
| worktree セッション状態の永続化と復元     | ❌              | ✅          | Phase C |
| 作成後のセットアップ（hooks 設定） | ❌              | ✅          | Phase C |
| StatusLine での worktree 状態表示      | ❌              | ✅          | Phase C |
| WorktreeExitDialog（終了プロンプト）    | ❌              | ✅          | Phase C |
| `--worktree` CLI 起動フラグ         | ✅（Phase D）   | ✅          | —       |
| シンボリックリンクディレクトリ（node_modules など）   | ✅（Phase D）   | ✅          | —       |
| PR 参照（`--worktree=#123`）      | ✅（Phase D）   | ✅          | —       |
| sparse checkout                   | ❌              | ✅          | Future  |
| tmux 連携                         | ❌              | ✅          | Future  |
| Arena マルチモデル worktree 分離        | ✅（qwen 独自） | ❌          | —       |
| ダーティ状態の上書き（stash + copy）        | ✅              | ✅          | —       |
| ベースラインコミットの追跡              | ✅（qwen 独自） | ❌          | —       |

## 設計原則

**worktree は汎用機能であり、Arena はその上位アプリケーションである。**

- 汎用 worktree 層：`EnterWorktree`/`ExitWorktree` ツール、AgentTool `isolation` パラメータ、セッション状態管理、自動クリーンアップ
- Arena 層：マルチモデル並列スケジューリング、`worktreeBaseDir` カスタムパス、一括作成と diff 比較。引き続き `GitWorktreeService.setupWorktrees()` の既存ロジックを使用し、汎用層の変更の影響を受けない

AgentTool の `isolation: 'worktree'` は汎用パスのみを通り、Arena 内部はこのパラメータ経由で worktree を作成しないため、両者のパスは独立しています。

## パスと設定

### 汎用 worktree パス

`EnterWorktree` ツールまたは AgentTool `isolation: 'worktree'` によって作成された worktree は、固定のパスに配置されます：

```
{git リポジトリルート}/.qwen/worktrees/{slug}
```

パスは設定変更不可。slug の命名規則：

- ユーザーセッション worktree：ユーザーが指定した名前、または自動生成（形式：`{形容詞}-{名詞}-{4桁ランダム}`）
- エージェント worktree：`agent-{7桁ランダム hex}`

### Arena worktree パス（既存のまま変更なし）

Arena の worktree パスは `agents.arena.worktreeBaseDir` で制御され、デフォルトは `~/.qwen/arena`（`ArenaManager.ts:125`）です。汎用パスとは完全に独立しており、変更は一切加えません。

### 拡張設定

| 設定項目                            | 型       | 用途                                                             | フェーズ    |
| --------------------------------- | ---------- | ---------------------------------------------------------------- | ------- |
| `ui.hideBuiltinWorktreeIndicator` | `boolean`  | Footer 内のビルトイン `⎇ worktree-… (…)` 行を非表示にし、カスタム statusline に委ねる | Phase C |
| `worktree.symlinkDirectories`     | `string[]` | 指定ディレクトリ（`node_modules` など）を worktree にシンボリックリンクし、ディスク容量を節約   | Phase D |
| `worktree.sparsePaths`            | `string[]` | git sparse-checkout cone モード。大規模 monorepo で指定パスのみを書き出す      | Future  |

Phase A / B では新しい設定項目を追加しません。

## ツール設計

### EnterWorktree

**トリガー条件：** ユーザーが明示的に「start a worktree」「use a worktree」「create a worktree」などと言った場合。「バグを修正する」「機能を開発する」と言っただけでは自動トリガーしません。

**入力 schema：**

```
name?: string  // 任意。slug 形式：英数字/ドット/アンダースコア/ハイフン、最大 64 文字
```

**動作：**

1. 現在 worktree 内にいないことを確認（ネストを防止）
2. git リポジトリルートに解決（サブディレクトリ内にいる場合も処理）
3. `GitWorktreeService` を呼び出して worktree を作成。パスは `.qwen/worktrees/{slug}`
4. worktree セッションを `SessionService` に書き込む
5. 作業ディレクトリを worktree パスに切り替える
6. ファイルキャッシュをクリアする

**出力：** `worktreePath`、`worktreeBranch`、`message`

### ExitWorktree

**トリガー条件：** ユーザーが「exit the worktree」「leave the worktree」「go back」などと言った場合。

**入力 schema：**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // action='remove' の場合のみ有効
```

**安全ガード：**

- 現在のセッションで `EnterWorktree` によって作成された worktree のみを操作する
- `action='remove'` かつコミットされていない変更がある場合は実行を拒否（`discard_changes: true` の場合を除く）

**動作：**

- `keep`：セッション内の worktree 状態をクリアし、worktree ディレクトリとブランチを保持したまま元の作業ディレクトリに戻る
- `remove`：worktree ディレクトリを削除し、対応する git ブランチを削除し、セッション状態をクリアし、元の作業ディレクトリに戻る

**出力：** `action`、`originalCwd`、`worktreePath`、`worktreeBranch`

## ユーザーによるトリガー方法

| 方法           | 例                                                     | 実装フェーズ |
| -------------- | -------------------------------------------------------- | -------- |
| セッション内での明示的なリクエスト | ユーザーが「worktree で作業を始める」と言う → モデルが EnterWorktree を呼び出す | Phase A  |
| エージェント分離     | モデルがサブエージェントに `isolation: 'worktree'` を設定する             | Phase B  |
| CLI 起動フラグ   | `qwen --worktree my-feature`                             | Phase D  |

スラッシュコマンドはありません。セッション内での worktree のトリガーはユーザーの明示的な言及に依存し、`isolation: 'worktree'` がモデルの自律的な判断によるシナリオです。

## 段階的な実装計画

### Phase A：コアツール（ユーザーセッションレベルの worktree）

**目標：** ユーザーがセッション内で worktree に入ったり出たりできるようにする。

**実装する機能：**

- `EnterWorktree` ツール：worktree の作成、作業ディレクトリの切り替え、セッション状態の記録
- `ExitWorktree` ツール：keep / remove の 2 種類の終了方法と安全ガード
- `GitWorktreeService` の拡張：単一ユーザーセッション向けの `createUserWorktree()` / `removeUserWorktree()` メソッドを追加し、既存の git 操作ロジックを再利用。Arena が使う一括インターフェースは変更しない
- `SessionService` の拡張：`WorktreeSession` フィールドを追加し、`{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` を記録する。`--resume` 時に worktree 作業ディレクトリを復元する
- ツールのプロンプト：各ツールの使用説明を記述し、いつ呼び出すべきか・呼び出すべきでないかを明記する

**影響ファイル：**

| ファイル                                               | 変更種別                                      |
| -------------------------------------------------- | --------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`            | `ENTER_WORKTREE`、`EXIT_WORKTREE` 定数を追加   |
| `packages/core/src/tools/EnterWorktreeTool/`       | 新規ディレクトリ作成：`EnterWorktreeTool.ts`、`prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`        | 新規ディレクトリ作成：`ExitWorktreeTool.ts`、`prompt.ts`  |
| `packages/core/src/services/gitWorktreeService.ts` | ユーザーセッションレベルのインターフェースを追加（Arena インターフェースは変更しない）       |
| `packages/core/src/services/sessionService.ts`     | `WorktreeSession` フィールドと読み書きメソッドを追加         |
| `packages/core/src/tools/` 登録エントリ                | 新しいツールを登録                                    |

**Phase A のスコープ外：**

- エージェント分離（Phase B）
- hooks 設定などの作成後セットアップ（Phase C）
- UI 状態表示（Phase C）

---

### Phase B：エージェント分離（AgentTool `isolation: 'worktree'`）+ 説明文の更新

**目標：** モデルがサブエージェント向けに一時的な隔離 worktree を作成できるようにし、エージェント終了後は自動的にクリーンアップする。また、影響を受けるツールの説明とプロンプトを同期して更新する。

**実装する機能：**

_エージェント分離のコア：_

- `AgentTool` に `isolation?: 'worktree'` パラメータを追加
- エージェント起動時に一時 worktree を作成（slug：`agent-{7hex}`、パス：`.qwen/worktrees/agent-{7hex}`）
- エージェント終了後：変更がなければ自動削除、変更があれば保持してパスとブランチを結果に返す
- 期限切れ worktree の自動クリーンアップ：`.qwen/worktrees/` をスキャンし、`agent-{7hex}` パターンに一致するもの、30 日以上経過しており未プッシュのコミットがないものを削除。fail-closed 方針

_説明とプロンプトの更新：_

- `AgentTool` の description に `isolation: 'worktree'` パラメータの説明を追加（claude-code の `AgentTool/prompt.ts:272` を参照）
- `buildWorktreeNotice()` を追加：fork されたサブエージェントが worktree 内で実行される場合、分離された worktree 内にいること、パスは親エージェントから継承していること、ファイルを編集する前に再読み込みが必要なことをコンテキストとして注入する（claude-code の `forkSubagent.ts:buildWorktreeNotice` を参照）

_変更不要：_

- review スキル（`SKILL.md`）：review は独立した仕組みを使用している（パス `.qwen/tmp/review-pr-<n>`、`qwen review fetch-pr` コマンドで作成）。汎用 worktree のパスや仕組みとは全く異なるため、混同の問題はない

**Arena との互換性保証：** Arena 内部は `isolation` パラメータ経由で worktree を作成しないため、この変更は Arena のコードパスに触れません。

**影響ファイル：**

| ファイル                                               | 変更種別                                               |
| -------------------------------------------------- | ------------------------------------------------------ |
| `packages/core/src/tools/agent/agent.ts`           | `isolation` パラメータと worktree の作成/クリーンアップロジックを追加         |
| `packages/core/src/tools/agent/fork-subagent.ts`   | `buildWorktreeNotice()` を追加し worktree モードで注入  |
| `packages/core/src/services/gitWorktreeService.ts` | `createAgentWorktree()` / `removeAgentWorktree()` を追加 |
| `packages/core/src/services/worktreeCleanup.ts`    | 新規作成：期限切れ worktree の自動クリーンアップロジック                       |

---

### Phase C：セッションの完全性（SessionService の永続化 + UI 安全網）

**目標：** worktree の状態がセッション中断後に復元できるようにし、ユーザーが常に自分がどの worktree にいるかを UI で把握できるようにし、セッション終了時に安全なプロンプトを表示する。

**実装する機能：**

_SessionService の worktree 状態永続化と `--resume` 復元：_

- `SessionService` に `WorktreeSession` フィールドを追加し、`{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` を記録する
- `EnterWorktreeTool` が `sessionService.setWorktreeSession()` を呼び出して状態を書き込む
- `ExitWorktreeTool` が `sessionService.clearWorktreeSession()` を呼び出して状態をクリアする
- `--resume` 起動パスでそのフィールドを読み取り、`targetDir` を復元してモデルにコンテキストプロンプトを注入する

_作成後のセットアップ：_

- worktree 作成後に `git config core.hooksPath <mainRepo>/.git/hooks` を自動実行し、worktree 内のコミットがメインリポジトリの hooks と同じ動作になるようにする

_StatusLine での worktree 表示：_

- `UIStateContext` に `activeWorktree` フィールドを追加（セッション状態から読み取り）し、セッションが worktree に入ったり出たりする際に更新する
- `StatusLineCommandInput` のペイロードに `worktree?: { slug: string; branch: string }` フィールドを追加し、ユーザーの statusline スクリプトから利用できるようにする
- `activeWorktree` が空でない場合、`Footer` にビルトインで `⎇ <branch> (<slug>)` の 1 行を表示する。ユーザーが statusline スクリプトを設定しなくても基本的な視認性を確保する

_WorktreeExitDialog：_

- `WorktreeExitDialog.tsx` コンポーネントを新規作成。既存の Dialog の実装スタイルを参考にする
- 終了キー（Ctrl+C / Ctrl+D）の処理ロジックを変更：`activeWorktree` が空でない場合、2 回目の確認をインターセプトし、keep または remove を選択するダイアログを表示する
- keep / remove の操作は `ExitWorktreeTool` の既存パスを再利用する

**影響ファイル：**

| ファイル                                                          | 変更種別                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                | `WorktreeSession` フィールドと読み書きメソッドを追加                                         |
| `packages/core/src/tools/enter-worktree.ts`                   | `sessionService.setWorktreeSession()` を呼び出す                                    |
| `packages/core/src/tools/exit-worktree.ts`                    | `sessionService.clearWorktreeSession()` を呼び出す                                  |
| `packages/core/src/services/gitWorktreeService.ts`            | `createUserWorktree()` / `createAgentWorktree()` の後に `core.hooksPath` 設定を追加 |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`             | `activeWorktree` フィールドと set/clear アクションを追加                                 |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                  | `StatusLineCommandInput` に `worktree` フィールドを追加                                 |
| `packages/cli/src/ui/components/Footer.tsx`                   | ビルトイン worktree 行の表示                                                          |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`       | 新規作成                                                                          |
| `packages/cli/src/ui/components/DialogManager.tsx`            | `WorktreeExitDialog` を登録                                                     |
| `packages/cli/src/ui/components/ExitWarning.tsx` または終了キー処理 | `activeWorktree` を検出して終了をインターセプト                                              |

---

### Phase D：起動時設定（`--worktree` CLI フラグ + ディレクトリシンボリックリンク + PR 参照）

**目標：** 起動時に直接 worktree に入れるようにし、ディレクトリのシンボリックリンクによって大規模プロジェクトのディスク使用量を削減し、PR 参照によってプルリクエストをベースに素早く worktree を作成できるようにする。

**スコープ：** 3 つの機能を同一フェーズでまとめてリリースします。いずれも同じ起動エントリポイントにひも付いており、symlink / PR fetch のどちらも worktree 作成直後に実行する必要があるためです。個別に分割すると bootstrap シーケンスの変更が重複します。

#### D-1：`--worktree [name]` CLI 起動フラグ

**パラメータ形式：** yargs オプションは 3 種類の形式を受け付けます：

| 形式                      | 動作                                                 |
| ------------------------- | ---------------------------------------------------- |
| `qwen --worktree`         | ベアフラグ。slug を自動生成（`{形容詞}-{名詞}-{6hex}`） |
| `qwen --worktree my-name` | 明示的な slug。`EnterWorktreeTool` の slug 検証ルールを踏襲 |
| `qwen --worktree=my-name` | 上記と同等                                               |

短縮エイリアス `-w` は提供しません（qwen-code の短縮エイリアスは最も頻度の高いパラメータにのみ使用し、名前の衝突を避けます）。

**起動シーケンス：** worktree は以下の順序で作成されます：

1. `parseArguments()` が argv を解析（既存）
2. resume ピッカー（既存、`gemini.tsx` の line 588-629）
3. `loadCliConfig()` が Config と認証を初期化（既存、line 643-653）
4. **新規追加：** `argv.worktree !== undefined` の場合、`createUserWorktree()` を呼び出す
   - サイドカーに書き込む（`writeWorktreeSession()`）
   - `process.chdir(worktreePath)` を実行し、同時に `Config.setTargetDir(worktreePath)` を呼び出す
   - 同じ worktree への再アタッチパス：`git worktree add` をスキップしてその場で chdir する（Phase 6 の修正）。異なる projectHash をまたぐ `--resume` × `--worktree` の組み合わせはセッションルックアップ段階で失敗します。詳細は後述の「`--resume` との優先順位」を参照
5. メインループ（TUI / ヘッドレス `-p` / ACP の 3 つのエントリポイントすべてで第 4 ステップを実行）

**Phase A との簡略化の違い：** Phase A の `EnterWorktreeTool` は `Config.targetDir` を**変更しません**。モデルがツールの結果から絶対パスを読み取って使い続けることに依存しています。Phase D の CLI フラグは起動時に有効になるため、実行中のモデルコンテキストとの互換性を考慮する必要がなく、**直接 `targetDir` と `process.cwd()` を切り替えます**——これはより強力な分離保証です。2 つのパスの動作は異なるため、ユーザードキュメントで説明する必要があります。

**終了動作：** 既存の `WorktreeExitDialog`（Phase C で実装済み）を再利用します。Ctrl+C/D を 2 回押すことでトリガーされ、ユーザーは keep / remove / cancel から選択します。新しいコードパスは不要です。

**`--resume` との優先順位：**

セッションストレージは `projectHash(process.cwd())` をキーとして使用し、`--worktree` は resume ピッカー / `loadCliConfig` の前に worktree に chdir するため、「worktree X で開始したセッションを worktree Y 内から resume する」ことは**アーキテクチャ上到達不可能**です（両者の projectHash が異なり、セッションファイルが別のディレクトリに存在するため）。以下の表は D-1 の実装と Phase 6 の再アタッチ修正後の実際の動作を示します：

| `--resume` の状態              | `--worktree` の状態          | 結果                                                                                       |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| なし                           | なし                         | 通常のセッション、worktree なし                                                                      |
| なし                           | あり（新しい slug）              | 新しい worktree を作成                                                                              |
| なし                           | あり（既存の slug）        | 既存の worktree に**再アタッチ**（Phase 6 の修正）                                                              |
| あり                           | なし                         | 古い worktree を復元（Phase C の動作、サイドカーがヒットした場合は reminder を注入）                               |
| あり（同じ worktree の sid）  | あり（同じ slug、再アタッチ） | 再アタッチ + セッションヒット：通常の resume                                                      |
| あり（メインチェックアウトの sid） | あり（任意の slug）            | **セッションルックアップ失敗**：`No saved session found with ID …`、exit 1。documented limitation |
| あり（worktree X の sid）    | あり（slug Y, X != Y）       | 同上、セッションが projectHash をまたいで検索できない                                                        |

projectHash をまたぐオーバーライドのセマンティクス（異なる worktree やメインチェックアウトのセッション間で `--worktree` が転送される）は、ストレージのアンカーを cwd 由来の projectHash ではなくリポジトリルートに変更する必要があり、将来の Config リファクタリングの範疇です。`persistStartupWorktreeSidecar` 内の `overrodeResumedWorktree` ブランチのコードは、そのリファクタリングが完了した際に自動的に有効になるよう保持されており、現在の本番パスでは実行されません。

#### D-2：`worktree.symlinkDirectories` 設定項目

**schema：**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- 型：`string[]`、デフォルト `undefined`（無効、opt-in）
- トップレベル namespace `worktree` は新規追加（`settingsSchema.ts` 内でアルファベット順に `tools` と `ui` の間に挿入）
- パスは**メインリポジトリルートからの相対パス**。絶対パスや `..` を含むパスはパス遍歴ガードによって拒否される

**適用範囲：** 汎用層によって作成されたすべての worktree、以下を含む：

- `EnterWorktreeTool`（Phase A）
- `AgentTool` `isolation: 'worktree'`（Phase B）
- `--worktree` CLI フラグ（Phase D-1）

Arena の worktree は汎用層を通らないため、この設定の影響を**受けません**。

**実装箇所：** `GitWorktreeService.performPostCreationSetup()` —— 既存の `configureHooksPath()`（Phase C で確立されたパターン）の直後。`symlinkConfiguredDirectories()` メソッドを追加し、設定項目を走査して `fs.symlink(absSource, absDest, 'dir')` を呼び出す。

**エラー処理（fail-open）：**

| シナリオ                          | 動作                           |
| ----------------------------- | ------------------------------ |
| ソースディレクトリが存在しない（ENOENT）        | サイレントにスキップ、debug log            |
| ターゲットパスが既に存在する（EEXIST）      | サイレントにスキップ、debug log（上書きしない）  |
| パス遍歴（`../`、絶対パスなど） | その項目を拒否、debug log warn       |
| その他の I/O エラー                 | debug log warn、後続の項目の処理を継続 |

symlink の失敗によって worktree の作成が**中止されることはありません**——`configureHooksPath()` と同じ「ベストエフォートの作成後セットアップ」原則に従います。

#### D-3：PR 参照の解析（`--worktree=#<N>` / フル URL）

**サポートする形式：**

| 形式                                                            | 解析後の PR 番号 |
| --------------------------------------------------------------- | -------------- |
| `--worktree=#123`                                               | 123            |
| `--worktree '#123'`                                             | 123            |
| `--worktree https://github.com/foo/bar/pull/123`                | 123            |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123            |

**slug とブランチの命名：**

- slug：`pr-<N>`（特別な予約プレフィックス、ユーザー slug と区別）
- ブランチ：`worktree-pr-<N>`（qwen-code 既存の `worktree-<slug>` 命名規則に従う。claude-code のように `pr-<N>` を直接使用すると、ローカルの `pr-<N>` ブランチと衝突する可能性があるため採用しない）

**fetch 戦略：**

```
git fetch origin pull/<N>/head
→ FETCH_HEAD を新しい worktree のベースとして使用
```

`gh` CLI に依存しません——純粋な git fetch で、`origin` リモートが GitHub を指していれば任意の GitHub インスタンス（パブリックまたはエンタープライズ）をサポートします。

**エラーパス：**

| シナリオ                     | エラーメッセージ                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| `origin` リモートが存在しない        | `--worktree=#<N> requires an "origin" remote that points at GitHub.`         |
| `git fetch` が失敗         | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.` |
| ネットワークタイムアウト（30秒）          | 上記と同じ、`(timeout)` を追加                                                         |
| `origin` リモートが GitHub でない | 積極的にチェックしない。`git fetch` が自然に失敗する（PR プロトコルは GitHub 固有）             |

**D-2 との関係：** PR worktree にも `symlinkDirectories` が**同様に**適用されます（ユーザーが PR ですぐにテストを実行できるよう、依存ディレクトリを再利用する必要があるため）。

#### 影響ファイル

| ファイル                                                         | 変更種別                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/config/config.ts`                          | yargs に `--worktree` オプションを追加；`CliArgs` インターフェースに `worktree?: string \| boolean` を追加                                                              |
| `packages/cli/src/gemini.tsx`                                | `loadCliConfig()` の後、メインループの前に新しい `setupStartupWorktree()` ヘルパーを呼び出す                                                                 |
| `packages/cli/src/startup/worktreeStartup.ts`                | 新規作成：`setupStartupWorktree()` が slug 解析、PR fetch、サイドカー書き込み、cwd 切り替えを処理する                                                            |
| `packages/cli/src/nonInteractiveCli.ts`                      | 同じヘルパーを再利用（既に `restoreWorktreeContext` 注入ロジックがあるため変更不要）                                                                          |
| `packages/cli/src/acp-integration/acpAgent.ts`               | 同じヘルパーを再利用                                                                                                                            |
| `packages/core/src/services/gitWorktreeService.ts`           | `parsePRReference()`、`fetchPullRequestRef()`、`symlinkConfiguredDirectories()` を追加；`createUserWorktree()` がオプションの `baseBranchRef` パラメータを受け付けるよう変更 |
| `packages/cli/src/config/settingsSchema.ts`                  | トップレベル項目 `worktree.symlinkDirectories: string[]` を追加                                                                                        |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | 再生成                                                                                                                                   |
| `docs/users/features/worktree.md`                            | Quick Start CLI フラグセクションを追加、Settings テーブルに 1 行追加                                                                                        |

#### セキュリティとロールバック

- **fail-open vs fail-close：** symlink / hooks の失敗は worktree の作成を**中止しません**（Phase C で定められた既存のパターンと同じ）。PR fetch の失敗は起動を**中止します**（base ref がなければ worktree を作成できない）。slug 検証の失敗は起動を**中止します**（`EnterWorktreeTool` と同じ）。
- **パス遍歴：** `symlinkDirectories` の各項目は、解決後も `repoRoot` 内に収まる必要があります。そうでない場合はその項目を拒否してログに記録します。
- **PR fetch のタイムアウト：** 30 秒のハードタイムアウト。応答しないネットワークによって起動がブロックされることを防ぎます。
- **cwd 切り替えの副作用：** `process.cwd()` を変更した後、相対パス（`--prompt-file ./foo.txt` など）の解決に影響が出ます。**対策：** cwd を切り替える前にすべての相対パス引数を解決しておきます（具体的には `setupStartupWorktree()` のエントリポイントで 1 度 normalize を行います）。

#### 未解決の問題

1. **`--worktree-keep-on-exit` は必要か？** claude-code にはないが、Exit Dialog のデフォルトを keep にする CLI フラグが qwen-code に必要か？ユーザーのフィードバックを待って**まず追加しない**ことを推奨する。
2. **`worktree.symlinkDirectories` はプロジェクト単位のオーバーライドが必要か？** 現在の settings は user/workspace/project の 3 段階マージをサポートしているため、特別な処理は不要。
3. **PR fetch で `head` ではなく `merge` ref（`pull/<N>/merge`、つまりベースとマージされた ref）を取得すべきか？** claude-code は `head` を選択している。理由はユーザーが通常 PR の実際の変更を見たいから。この選択を踏襲する。

---

### Future：高度な機能（必要に応じて実装）

以下の機能はより特定の使用シナリオ向けであり、現時点ではスケジュールに含まれていません。ユーザーのニーズが明確になってから実装を検討します。

| 機能                    | 説明                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| sparse checkout         | `worktree.sparsePaths` 設定項目。大規模 monorepo で指定パスのみを checkout し、作成時間とディスク使用量を削減する |
| `.worktreeinclude` ファイル | gitignore されたファイル（`.env`、`secrets.json` など）を worktree に自動コピーする                       |
| tmux 連携               | `--worktree --tmux` で新しい tmux ウィンドウに worktree セッションを起動する                                      |
