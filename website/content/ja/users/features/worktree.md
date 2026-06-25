# Worktrees

> 現在のセッションを離れずに、一時的な [git worktree](https://git-scm.com/docs/git-worktree) 内で実験的な作業を分離できます。モデルが広範囲にわたる編集を行う前にメインのチェックアウトとは別に保持したい場合や、サブエージェントに独自のサンドボックスで作業させたい場合に便利です。

## クイックスタート

### worktree 内でセッションを開始する（`--worktree` フラグ）

セッション全体を worktree 内で実行することが最初からわかっている場合は、起動時に `--worktree` を指定します：

```bash
# 自動生成されたスラッグ（例：tender-jemison-037f0a）
qwen --worktree

# 明示的な名前
qwen --worktree my-feature

# `=` 形式（位置引数のプロンプトも渡す場合に推奨 — 下記のヒントを参照）
qwen --worktree=my-feature

# PR 参照 — `origin` から refs/pull/<N>/head を取得
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# 以前の --worktree セッションを再開 — 既存のディレクトリに再アタッチ
qwen --resume <session-id> --worktree=my-feature
```

> **ヒント — `--worktree` の後に位置引数のプロンプトを続けると曖昧になります。** `--worktree` はオプションの値を取るため、`qwen --worktree "say hi"` と入力すると yargs が `"say hi"` をスラッグとして解釈します（スペースが含まれているためエラーになります）。次のいずれかの形式を使用してください：
>
> - `qwen --worktree=my-feature "say hi"`（常に機能 — `=` で明示的にスラッグを指定）
> - `qwen "say hi" --worktree`（位置引数を先に、フラグを末尾に → 自動スラッグ）
> - `qwen --worktree --approval-mode yolo "say hi"`（フラグを間に挟むことでベア形式を固定）

> **ヒント — `qwen --resume --worktree foo`（セッション ID なし）は初回起動時に空のピッカーを表示します。** ピッカーは選択した worktree のセッションストレージにスコープされるため、その worktree 外で開始されたセッションは一覧に表示されません。`foo` 内で開始されたセッションを再開するには、`qwen --resume <id> --worktree foo` を直接使用してください — CLI は `foo/` ディレクトリを再作成せずに既存のものに再アタッチします。

`process.cwd()` とモデルのワークスペースは最初のターンが実行される前に worktree に切り替わります。`Ctrl+C` を 2 回押して終了すると、[終了ダイアログ](#exit-dialog-ctrlc--ctrld) が表示され、worktree を保持するか削除するかを選択できます。

`--worktree` フラグは `--acp`/`--experimental-acp` と組み合わせることはできません。ACP ホスト（Zed など）では、代わりに `loadSession`/`newSession` リクエストの `cwd` として worktree のパスを渡してください。

### またはセッション中に依頼する

既存のセッション内から Qwen Code に自然言語で worktree の作成を依頼することもできます：

```text
> start a worktree called experiment-a
Worktree experiment-a created on branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

この時点以降、モデルはすべてのファイル編集とシェルコマンドを `.qwen/worktrees/experiment-a/` 経由でルーティングします。元の作業ディレクトリはそのまま維持されます。

作業が完了したら：

```text
> exit the worktree and remove it
Removed worktree experiment-a (branch worktree-experiment-a)
```

後で戻りたい場合は、worktree をディスクに保持したまま終了するよう依頼します：

```text
> exit the worktree but keep it
Kept worktree experiment-a at .qwen/worktrees/experiment-a
```

## Worktree が使用されるタイミング

Worktree は 4 つの独立したパスで有効化されます：

| トリガー                                        | 動作                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--worktree` を指定して起動                    | モデルのターンが実行される前に CLI が worktree を作成し、セッションをその中に chdir します。PR 形式（`#N`、完全 URL）は先にフェッチします。 |
| セッション中に明示的に worktree を依頼         | モデルが `enter_worktree` を呼び出し、以降のファイル編集がその中に入ります。                                                              |
| 明示的に離れるよう依頼                          | モデルが `keep` または `remove` を指定して `exit_worktree` を呼び出します。                                                           |
| モデルが分離を有効にしてサブエージェントを生成  | 使い捨ての worktree（`agent-<hex>`）が自動的に作成され、エージェントに差分がない場合はクリーンアップされます。                         |

セッション中の 2 つのツール（`enter_worktree` / `exit_worktree`）は意図的に明示的なフレーズによってのみ実行されます。「このバグを修正して」や「ブランチを作成して」などと言っても**これらはトリガーされません**。「worktree を使って」、「worktree を開始して」、「worktree の中で」のように言う必要があります。`--worktree` CLI フラグにはこのような制限はなく、指定されると常に worktree を作成します。

## 作成されるもの

すべての Qwen 管理 worktree はプロジェクトの `.qwen` ディレクトリの下に配置されます：

```
<repoRoot>/.qwen/worktrees/<slug>/         # Working directory
                          ↳ branch worktree-<slug>   # Created off your current branch
```

- **スラッグ** — 英字、数字、ドット、アンダースコア、ハイフン；最大 64 文字。名前を指定しない場合、`<adjective>-<noun>-<6hex>` のスラッグが自動生成されます（例：`tender-jemison-037f0a`）。PR 参照は `pr-<N>` を生成します。
- **ブランチ** — 常に `worktree-<slug>` で、worktree を依頼したときにチェックアウトされているブランチから分岐します（必ずしもメイン作業ツリーの `HEAD` ではありません）。PR worktree の場合、ブランチは `worktree-pr-<N>` で、ローカルブランチではなく `FETCH_HEAD`（GitHub 側の PR の先端）をベースにします。
- **フック** — worktree の `core.hooksPath` は自動的にメインリポジトリの `.husky/`（優先）または `.git/hooks/` に向けられるため、worktree 内のコミットでも既存の pre-commit / commit-msg フックが実行されます。
- **オプションのシンボリックリンク** — `worktree.symlinkDirectories`（[設定](#settings)を参照）に記載されたディレクトリはメインリポジトリから新しい worktree にシンボリックリンクされるため、`node_modules` などの重いディレクトリを再インストールせずに再利用できます。

汎用 worktree のパスは**設定不可能**です。CLI が再起動時やステールクリーンアップ時に見つけられるよう、`<repoRoot>/.qwen/worktrees/` の下に置く必要があります。（無関係の `agents.arena.worktreeBaseDir` 設定は [Agent Arena](./arena.md) の worktree のみを制御し、`~/.qwen/arena/` 下の別のパスツリーを使用します。）

## フッターとステータスライン

worktree がアクティブな場合、フッターに独自の行として薄いインジケーターが表示されます：

```
⎇ worktree-experiment-a (experiment-a)
```

[カスタムステータスラインスクリプト](./status-line.md)を使用している場合、stdin にパイプされる JSON ペイロードにも `worktree` オブジェクトが渡されます：

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

このペイロードフィールドは worktree がアクティブな場合**のみ**存在するため、`null` チェック（`input.worktree?.name`）で十分です。

カスタムステータスラインがすでに worktree 情報をレンダリングしている場合、重複を避けるために組み込みのフッター行を非表示にできます。下記の[設定](#settings)を参照してください。

## 終了ダイアログ（Ctrl+C / Ctrl+D）

worktree がアクティブな状態で終了ショートカットを 2 回押すと、CLI を閉じる代わりに **Worktree 終了ダイアログ**が開きます：

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

ダイアログは開くときに worktree を検査し（`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`）、両方の件数を表示するので、何を破棄するかを正確に把握できます。`ESC` でキャンセルできます。

`git status` 自体が失敗した場合（インデックスの破損、CLI の下で worktree ディレクトリが削除された場合など）、ダイアログは `⚠ Could not measure worktree state` 警告を表示し、件数が信頼できない場合があります。根本的なリポジトリの問題を診断するまでは **Keep** または **Cancel** を選択してください。

## `--resume` による復元

アクティブな worktree のバインディングはセッションのトランスクリプトと並んでサイドカーファイルに永続化されます：

```
<chatsDir>/<sessionId>.worktree.json
```

`--resume <sessionId>` を指定して CLI を起動する（または `/resume` からセッションを選択する）と、**インタラクティブ TUI**、**ヘッドレス `-p`**、**ACP/Zed** モードすべてで一貫して次の 3 つのことが行われます：

1. サイドカーが読み込まれ、worktree ディレクトリがディスク上にまだ存在するかどうかが確認されます。
2. 存在する場合、モデルは次のプロンプトで一度だけリマインダーを受け取ります：
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. セッション間に worktree ディレクトリが削除されていた場合、ステールなサイドカーは自動的にクリーンアップされます。エラーは発生せず、worktree コンテキストなしで再開が続きます。

各モードは独自の注入メカニズムを選択しますが、ユーザーに見える動作は同一です：

| モード              | メカニズム                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| インタラクティブ（TUI） | `INFO` 履歴アイテム + 次のユーザープロンプトへの system-reminder プレフィックス。                                  |
| ヘッドレス（`-p`）   | プロンプトへの `<system-reminder>` プレフィックス + 出力ストリームへの `worktree_restored` JSON システムイベント。 |
| ACP（例：Zed）    | 次の `prompt()` 呼び出しに添付された保留中の通知。                                                   |

モデルは自動的に worktree へ `chdir` されません。リマインダーによってモデルが worktree パスを通じて編集をルーティングし続けます。

## サブエージェントの分離

`agent` ツールはオプションの `isolation: "worktree"` パラメーターを受け入れます。設定すると、Qwen Code はサブエージェントが開始する前に `<repoRoot>/.qwen/worktrees/agent-<7hex>/` に一時的な worktree を作成し、次のようになります：

- **変更なし** → エージェントが終了すると worktree は自動的に削除されます。
- **変更あり** → worktree は保持され、パスとブランチがエージェントの結果に追加されます（例）：
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  差分を確認して手動でマージまたは削除してください。

2 つの制約があります：

- `isolation: "worktree"` は `subagent_type` が必要です。フォークされたサブエージェント（`subagent_type` なし）は親の完全な会話コンテキストを再利用するため、分離するとインテントが作業ツリーから切り離されてしまいます。
- バックグラウンドエージェント（`run_in_background: true`）は分離と問題なく動作します。エージェントが完了を報告するとクリーンアップが実行されます。

### ステールな worktree の自動クリーンアップ

クラッシュや `--no-cleanup` シャットダウン後に残ったエフェメラルなエージェント worktree は、CLI の起動時に毎回回収されます。保守的な fail-closed ルールが適用されます：

| ガード                                  | 動作                                       |
| -------------------------------------- | ---------------------------------------------- |
| スラッグが `agent-<7hex>` パターンに一致する必要がある | あなたが作成した名前付き worktree は絶対に触れられません。 |
| ディレクトリの `mtime` > 30 日            | より新しいエントリはスキップされます。                     |
| 未コミットのトラッキング済み変更がある場合     | エントリをスキップします（削除しない）。                 |
| リモートから到達できないコミットがある場合     | エントリをスキップします（削除しない）。                 |
| git の状態の読み取りでエラーが発生した場合     | エントリをスキップします（削除しない）。                 |

名前付きユーザー worktree（`enter_worktree` スラッグ）は**自動クリーンアップされることはありません**。削除を依頼するまで保持されます。

## `exit_worktree action="remove"` のセーフティーガード

ディレクトリとブランチが削除される前に 3 つの独立したガードが発動します：

1. **セッションの所有権** — 各 worktree には作成したセッション ID を持つサイドカーマーカーが含まれます。別のセッションが削除しようとすると、手動の回避策として `git worktree remove` を示す明確なエラーで拒否されます。
2. **ダーティな作業ツリー** — 未コミットのトラッキング済みまたはトラッキングされていない変更は削除をブロックします。`discard_changes: true` を渡してオーバーライドします。（バイパスには明示的なユーザー確認が必要です。`action: "remove"` は AUTO_EDIT モードで自動承認されることはありません。）
3. **マージされていないコミット** — 他のローカルブランチやリモート参照が指していない `worktree-<slug>` 上のコミットは無条件に削除をブロックします。「コミットを破棄する」フラグはありません。コミット済みの作業を失うことは通常ユーザーの意図ではないためです。まずブランチをマージ、プッシュ、または別の場所にリネームしてください。

同じ 3 つのガードが `WorktreeExitDialog → Remove` ボタンにも適用されます。

## 設定 {#settings}

汎用 worktree エクスペリエンスを形成する 2 つの設定があります：

| キー                               | 型       | デフォルト     | 効果                                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator` | boolean    | `false`     | 組み込みの `⎇ worktree-… (…)` フッター行を非表示にします。`worktree` フィールドは引き続きカスタムステータスラインスクリプトに渡されます。ステータスラインがすでに worktree をレンダリングしている場合のみ `true` に設定してください。そうしないとすべての UI アフォーダンスが失われます。                                       |
| `worktree.symlinkDirectories`     | `string[]` | `undefined` | 汎用 worktree の作成時にすべての worktree にシンボリックリンクするメインリポジトリ下のディレクトリ。パスはリポジトリルートからの相対パスで、絶対パスおよび `..` を含むエントリは拒否されます。存在しないソースと既存のデスティネーションはサイレントにスキップされます（上書きなし）。 |

例：

```jsonc
// ~/.qwen/settings.json or <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

すべての worktree 作成パスに適用されます：`--worktree` フラグ、`enter_worktree` ツール、`agent isolation: "worktree"`。

汎用 worktree とは無関係ですが知っておくべき設定：

- `agents.arena.worktreeBaseDir` — **Agent Arena** の worktree 配置を制御します（デフォルト `~/.qwen/arena`）。汎用 worktree には影響せず、常に `<repoRoot>/.qwen/worktrees/` の下に置かれます。

`worktree.sparsePaths` のスキーマはまだありません。これはロードマップの項目です（[制限事項](#limitations)を参照）。

## ツールリファレンス

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| フィールド  | 型   | 必須 | 備考                                                                                      |
| ------ | ------ | -------- | ------------------------------------------------------------------------------------------ |
| `name` | string | いいえ   | スラッグ。英字、数字、ドット、アンダースコア、ハイフン；最大 64 文字。省略時は自動生成されます。 |

次の場合は実行を拒否します：

- CLI が git リポジトリ内にない場合。
- 現在の作業ディレクトリがすでに `.qwen/worktrees/` 内にある場合（ネストされた worktree は不可）。

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| フィールド             | 型                   | 必須                              | 備考                                                              |
| ----------------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `name`            | string                 | はい                                   | `enter_worktree` で使用したスラッグと一致する必要があります。                      |
| `action`          | `"keep"` \| `"remove"` | はい                                   | `keep` はディレクトリ + ブランチを保持し、`remove` は両方を削除します。              |
| `discard_changes` | boolean                | `action="remove"` かつダーティの場合のみ | ダーティツリーガードをオーバーライドします。`action="keep"` の場合は効果がありません。 |

`action: "remove"` は `AUTO_EDIT` 承認モードでも常に確認を求めます。情報のみのツールではなく、破壊的なシェル操作として扱われます。

### `agent` — `isolation` パラメーター

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| フィールド       | 型         | 必須 | 備考                                                                                             |
| ----------- | ------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | いいえ   | 新しい `agent-<7hex>` worktree でエージェントを実行します。`subagent_type` の設定が必要です（フォーク不可）。 |

ツールリファレンスの残りの部分は [Sub-Agents](./sub-agents.md) を参照してください。

## CLI リファレンス

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # auto-generate slug
qwen --worktree my-feature                                    # explicit slug
qwen --worktree=my-feature                                    # = form
qwen --worktree=#123                                          # PR reference
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| 入力                         | 結果                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ベアフラグ（値なし）          | 自動スラッグ `<adjective>-<noun>-<6hex>`、ブランチ `worktree-<slug>`、ベース = 現在のブランチ。                               |
| プレーンスラッグ              | ブランチ `worktree-<slug>`、ベース = 現在のブランチ。スラッグのバリデーション：英字/数字/ドット/アンダースコア/ハイフン、最大 64 文字。 |
| `#N` または `<github-url>/pull/N` | スラッグ `pr-<N>`、ブランチ `worktree-pr-<N>`、ベース = `git fetch origin pull/<N>/head`（30 秒タイムアウト）後の `FETCH_HEAD`。    |

`--worktree` は `--acp` / `--experimental-acp` と組み合わせることはできません。

`--worktree` を `--resume <session-id>` と組み合わせると、worktree が優先されます。再開したセッションの保存された worktree（ある場合）はオーバーライドされ、stderr 行と最初のプロンプトリマインダーがオーバーライドを報告します。

インタラクティブ（TUI）およびヘッドレス（`-p`）モードでは、最初のターンの前に worktree が自動的に作成され、セッションがその中に chdir します。

PR フェッチの失敗モード（終了コード != 0、worktree は作成されない）：

| 原因                         | メッセージの抜粋                                            |
| ----------------------------- | ---------------------------------------------------------- |
| `origin` リモートが見つからない       | `requires an "origin" remote that points at GitHub`        |
| PR が origin に存在しない    | `Failed to fetch PR #<N>: the PR does not exist on origin` |
| 30 秒ネットワークタイムアウト           | `Failed to fetch PR #<N>: timed out after 30s`             |
| PR 番号が範囲外またはゼロ | `Invalid PR number`                                        |

## 制限事項 {#limitations}

以下の項目は現在のフェーズでは意図的に実装されていません：

- **スパースチェックアウトなし。** 大規模なモノリポはフルツリーをチェックアウトします。（`worktree.sparsePaths` はロードマップの項目です。）
- **tmux インテグレーションなし。** CLI は新しい tmux ウィンドウで worktree セッションを生成しません。
- **Worktree はセッションストレージの別の「プロジェクト」です。** `--worktree foo` で開始されたセッションはその worktree のチャットディレクトリに保存されます。後で再開するには再度 `--worktree foo` を渡す必要があります。`--worktree` なしで開始されたセッションはメインチェックアウトの下に保存され、worktree の再開ピッカーには表示されません。
- **クロススラッグのセッションオーバーライドなし。** `<sid>` が `--worktree first` で作成された場合に `qwen --resume <sid> --worktree second` を実行するとセッションが見つかりません。セッションと worktree は `projectHash(cwd)` によって強く結び付けられています。既存のセッションで worktree を切り替えるには、終了してから新しい `--worktree` と新しいプロンプトで再起動する必要があります。将来のアーキテクチャの変更（`cwd` の代わりにリポジトリルートでストレージを固定する）によってこの制約が解消される予定です。
- **セッション中の `enter_worktree` は `process.cwd()` や `Config.targetDir` を切り替えません。** このツールはモデルコンテキストのみの規約を使用します（[Sub-Agents](./sub-agents.md) を参照）。プロセスの作業ディレクトリを実際に切り替えるのは起動時の `--worktree` フラグのみです。
- **他の引数フィールドの相対パスは worktree への chdir の前に解決されます。** パスを取るフラグ（`--mcp-config`、`--openai-logging-dir`、`--json-file`、`--input-file`、`--telemetry-outfile`、`--include-directories`）は、`--worktree` が設定されている場合、起動時の cwd に対して絶対パスに正規化されます。このリストにないその他のパス形式の argv フィールドは worktree の cwd に対して解決されます。安全のために絶対パスを使用してください。

ロードマップは `docs/design/worktree.md` で確認できます。

## トラブルシューティング

**worktree を作成したのにフッターに worktree インジケーターが表示されない。**
`ui.hideBuiltinWorktreeIndicator` が `true` に設定されていないことを確認してください。また、ツールの成功メッセージでスラッグが空でないことを確認してください。

**`--resume` で worktree が復元されない。**
`<chatsDir>/<sessionId>.worktree.json` が存在するか確認してください。worktree ディレクトリがなくなるとサイドカーは自動的に削除されます。サイドカーとディレクトリの両方が見つからない場合は「復元する worktree がない」という通常の状態です。バグではありません。`--debug` で実行し、`restoreWorktreeContext` を grep して理由を確認してください。

**`exit_worktree` が「created by a different session」と表示される。**
これはセッション所有権ガードです。元のセッションを再開してそこから終了するか、提案されている `git worktree remove …` コマンドを手動で実行してください。

**ステールな `agent-<hex>` worktree が積み重なっていく。**
30 日間のカットオフは保守的な設定です。`git worktree list && git worktree remove <path>` で手動に掃除するか、待ってください。30 日が経過した後の次の CLI 起動時にクリーンでプッシュ済みであれば回収されます。
