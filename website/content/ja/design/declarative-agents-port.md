# 宣言型エージェント定義 — Claude Code 2.1.168 からの移植

Claude Code の宣言型エージェント（markdown + YAML frontmatter）スキーマを qwen-code に移植するための内部設計ドキュメント。issue [#4821][i4821] に対応し、issue [#4721][i4721] / PR [#4732][p4732] のワークフロー移植と連携する。

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## 実装ステータス（垂直スライス）

PR [#4842][p4842] により、当時エンドツーエンドのランタイムパスを持つフィールドが出荷された。その後、PR [#4870][p4870] でブロックスカラをサポートするために YAML パーサーが置き換えられた。このフォローアップ PR は両者を基盤としている。YAML **stringifier** を置き換え（PR #4870 では手書きのままだった — `docs/design/yaml-parser-replacement.md` を参照）、`SubagentConfig` に `mcpServers` と `hooks` を公開し、サブエージェント実行時にエージェントごとの MCP サーバーとフックが実際に発火するようにランタイムに接続する。

| フィールド          | ステータス                | 備考                                                                                                                                                               |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **shipped (#4842)**     | 既存の qwen `approvalMode` にパース時にブリッジ                                                                                                               |
| `maxTurns`        | **shipped (#4842)**     | 既存の `runConfig.max_turns` ランタイムパスに接続                                                                                                              |
| `color` allowlist | **shipped (#4842)**     | 既存のフィールドを CC の `_Y` セット + `auto` レガシーセンチネル処理に厳格化                                                                                          |
| `mcpServers`      | **shipped (follow-up)** | eemeli/`yaml` stringify によりネストされた YAML のラウンドトリップが安全に；ランタイムオーバーライドはサブエージェント Config ラッパー経由でセッション + エージェントサーバーをマージし、ツールレジストリを強制再ビルド |
| `hooks`           | **shipped (follow-up)** | サブエージェント生成時に登録される一時的な HookRegistry エントリ。`onStop` 経由で削除；v1 はグローバルに発火（エージェントスコープフィルタなし）                                        |
| `effort`          | deferred                | qwen プロバイダーにはまだモデル層の `effort` パラメータが存在しない                                                                                                      |
| `memory`          | deferred                | qwen の自動メモリにはまだ `user`/`project`/`local` スコープの区別がない                                                                                            |
| `isolation`       | deferred                | ワークフロー PR #4732 がランタイムを所有；エージェントごとのデフォルトはそれがマージされた際に実装される                                                                                         |
| `initialPrompt`   | deferred                | `--agent` CLI フラグが必要（qwen にはメインセッションエージェントのインフラがない）                                                                                                   |
| `skills`          | deferred                | `config.skills` を消費する SkillManager が必要                                                                                                                |

以下の完全なリバースエンジニアリングの記録は、延期されたフィールドの設計リファレンスとして保持されている。スキーマ定数、DL7/Ig5 のセマンティクス、エラーメッセージ、およびワークフローとの連携マトリックスは、その作業において依然として不可欠である。

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## フェーズ 0 — 境界

| 項目                     | 値                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 確認済みの最新アップストリーム | Claude Code **2.1.168**（issue #4821 は ≥ 2.1.167 を参照、我々はそれより 1 バージョン上）                                                       |
| ネイティブバイナリ            | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| 文字列抽出          | `/private/tmp/cc-2.1.168/claude.strings`（約 342k 行）                                                                                 |
| ワークツリー                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| ブランチ                   | `main @ 45efb1d3a` から分岐した `lazzy/gifted-hamilton-684741`                                                                                   |
| 対象外             | PR #4732 ワークフローコード（別のワークツリー `lazzy/lucid-pare-974192`）— インターフェース経由でのみ連携                                    |
| 作成ルール           | 著者は **LaZzyMan**。コミット、PR、issue、コメントに `Co-Authored-By` や AI ツールのトレーラーは**含めない**（`~/.claude/CLAUDE.md` に準拠） |

---

## フェーズ 1 — リバースエンジニアリングの知見

ここでのすべての主張は、`claude.strings` に対して独立に grep され、反証可能な検証を生き残った。信頼度レベル: **C** = Confirmed（直接バイナリ証拠あり）、**I** = Inferred（複数の確認済み事実から合成）、**O** = Open（まだ不確実）。

### スキーマ — 15 のフィールド、反証と再確認

エージェントの frontmatter シャドウスキーマは `Ig5` であり、`tengu_frontmatter_shadow_unknown_key` / `_mismatch` テレメトリのために `ug5.agent` 内で使用される。**本番ローダーは `DL7`**（`parseAgentFromMarkdown`）であり、カスタムエラーメッセージを使用して手書きのフィールドごとのバリデーションを実行する。別の **JSON 形式スキーマ `JL7`**（`fL7` / `parseAgentFromJson` で使用）はより厳密だが、異なるコードパスである（`--agents <json>` と `settings.agents` で使用）。

| #   | フィールド             | 型 (Ig5 / DL7)                        | 必須 | デフォルト        | 列挙型 / 制約                                                                                                                       | 信頼度                                        |
| --- | ----------------- | --------------------------------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | 文字列、非空                       | **yes**  | —              | なし — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                  | **C** strings:308120, 309074                |
| 2   | `description`     | 文字列、非空                       | **yes**  | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | 文字列                                  | no       | undefined      | `inherit`（大文字小文字を区別しない）はリテラル `"inherit"` に正規化；それ以外の場合はトリムされてパススルー                                          | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | 文字列\|配列 (MDH union)               | no       | undefined      | 単一トークン `*` → `undefined`（「すべて継承」を意味する）；`AXH`/`FbK` 経由で複製                                                             | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | 文字列\|配列 (MDH)                     | no       | undefined      | 「`tools` が設定されている場合は無視される」（describe テキストによる）；呼び出し側によって強制                                                                    | **C** strings:308120, 309075                |
| 6   | `effort`          | 文字列\|整数                         | no       | undefined      | 列挙型 `GN=["low","medium","high","xhigh","max"]` または `int`；エイリアス `P37={med:"medium"}`                                                    | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | 文字列                                  | no       | undefined      | 列挙型 `$E = Gmq = [...kc]`。`kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]`（6 つの値）                   | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | no       | undefined      | 各アイテム: 文字列 または `record(string, MCPServerSpec)`；DL7 でアイテムごとに `safeParse`                                                       | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | no       | undefined      | `TKO` → `_u().safeParse`（settings.json のフック形状）経由で実行時に遅延バリデーション                                                   | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | no       | undefined      | 正の整数（`W46` でパース — 数値または数値文字列を受け付ける）                                                                  | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | 文字列\|配列 (MDH)                     | no       | `[]` (出力される) | `ml(q.skills) = FbK(H) ?? []` 経由で正規化；`*` ワイルドカードなし（`tools` とは異なる）                                                          | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | 文字列                                  | no       | undefined      | 空白のみの場合 → undefined；エージェントが**メインセッション**（`--agent` / settings 経由）の場合にのみ自動送信され、サブエージェントの場合は無視     | **C** strings:308120, 309075                |
| 13  | `memory`          | 文字列                                  | no       | undefined      | 列挙型 `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | 文字列\|真偽値 (eiH=EL8)                  | no       | undefined      | `true` / `false` / `"true"` / `"false"` を受け付ける；真と評価されるもののみ `true` に正規化、それ以外は `undefined`                                     | **C** strings:308120, 309075                |
| 15  | `isolation`       | 文字列                                  | no       | undefined      | 列挙型は**のみ** `["worktree"]`（`["none","worktree"]` ではない — それは strings:313284 のバックグラウンドセッション設定用の別のスキーマ） | **C** strings:308120, 309075, 309076        |

反証を生き残った微妙な観察: `skills` は「オプション」であるにもかかわらず、DL7 の出力句は `...I !== void 0 && {skills: I}` であり、`ml(undefined)` は `[]`（非 undefined）を返すため、**frontmatter がフィールドを省略している場合でも、最終的に出力されるレコードには `skills: []` が含まれる**。これは下流の等価性チェックに影響を与えるため、qwen-code への移植時のフラグとする。

### 15 個を超える可能性のある追加フィールド

| #   | フィールド       | 型   | デフォルト   | 列挙型 / 制約                                                                                                                                                                                                                                                            | 信頼度                                     |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | 文字列 | undefined | 列挙型 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`；`"@internal — display color in the agents UI"` と記述；`_Y` 以外の値はパース時にサイレントに破棄される（DL7 は `...z && typeof z === "string" && _Y.includes(z) && {color: z}` を出力） | **C** strings:308120, 309075, \_Y inline |
これは #4821 のリストを超える、agent-frontmatter の**唯一**の新しいフィールドです。`Ig5` / `JL7` で検索されましたが**見つからなかった**フィールド: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription`（これらはすべて、skill スキーマ `bg5` または無関係な識別子でのみ見つかりました）。

### ローダー — ファイルと関数のマップ

| 責務                                                       | 関数                                                                                                                                                     | 場所               | Conf  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| 最上位レジストリアセンブラ                                  | `QL` (エクスポート名 `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| ファイルシステムウォーカー（skills/commands/output-styles と共有） | `Gm`（`h6` 経由でメモ化）                                                                                                                                     | strings:312887         | **C** |
| `.md` 単位の検出                                           | `d_q`（= `loadMarkdownFiles`、`--files --hidden --follow --no-ignore --glob *.md` を指定した ripgrep、3 秒の `AbortSignal.timeout`、`__("true")` の場合はフォールバック `wY3`） | strings:312887         | **C** |
| ファイル単位のパーサー（Markdown）                                    | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| ファイル単位のパーサー（JSON）                                        | `fL7` (= `parseAgentFromJson`)、`JL7` スキーマを使用                                                                                                            | strings:309073         | **C** |
| プラグインエージェントローダー                                           | `b0_` → ディレクトリ単位の `oR7` → ファイル単位の `sR7`                                                                                                                       | strings:308780, 308779 | **C** |
| 組み込み                                                     | `naH()` — `[JqH=general-purpose, KL7=statusline-setup, …]` に加えて暗黙の `YI=fork` を生成                                                                     | strings:309073, 308663 | **C** |
| オーバーライドリゾルバー                                             | `DS()` (= `getActiveAgentsFromList`) — 解決順序を参照                                                                                                  | strings:309073         | **C** |
| キャッシュの無効化                                            | `u0_()` (= `clearAgentDefinitionsCache`) — `QL.cache` と `Gm.cache` をクリア                                                                                    | strings:309073         | **C** |
| FS ウォッチャー（chokidar）                                         | `s_T()` → モジュール初期化時（`WB6`）に `Q4_=s_T()`                                                                                                                 | strings:316417         | **C** |

`Gm("agents", _)` は 3 つの baseDirs（`policySettings`、`userSettings`、`projectSettings`）を読み取り、それぞれレコードにタグを付けます。その後、**inode** によって重複を排除します（シンボリックリンク/ハードリンクからの同一 inode の重複を削除し、`Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)` をログに出力します）。
テレメトリ: `managedFilesFound`、`userFilesFound`、`projectFilesFound`、`projectDirsSearched`、`subdir` を含む `tengu_dir_search`。

### 解決順序 — 確定的な優先順位

関数 `DS()` は入力を `source` でフィルタリングし、次に固定順の配列を `agentType` をキーとする `Map` に反復処理します。`Map.set` は上書きするため、**最後に処理されたバケットが優先**されます:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  最高優先順位
```

| ソース            | 起点                                                                                                                                                                            | オーバーライド優先度 | Conf                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `built-in`        | `naH()`（バイナリにハードコード）                                                                                                                                                     | 1（最低）        | **C** strings:309073              |
| `plugin`          | `b0_` → プラグイン単位の `agentsPath`/`agentsPaths`                                                                                                                                     | 2                 | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/`（`CLAUDE_CONFIG_DIR` または `~/.claude`）                                                                                                                          | 3                 | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` に加え、`iV_()` で homedir / git root まで走査                                                                                                                | 4                 | **C** strings:312887, iV\_ inline |
| `flagSettings`    | `--agents <json>` CLI フラグ（スキーマ `qKO = h.record(h.string(), JL7())`）                                                                                                           | 5                 | **C** strings:330190, 309076      |
| `policySettings`  | システム管理ディレクトリ: macOS `/Library/Application Support/ClaudeCode/.claude/agents`、Linux `/etc/claude-code/.claude/agents`、Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6（最高）       | **C** strings:307649 (H2), 312887 |

競合は**サイレントに**解決されます。`tengu_plugin_name_collision` テレメトリイベントが発生するのみで（`winner_source: T.at(-1)`）、ユーザーに「X が組み込みをオーバーライドしました」といった警告は表示されません。（strings:308742 `hMH`。）

微妙な動作: `iV_()` は `cwd` から上に向かって**最も内側から先に**走査しますが、Map.set は最後が優先されるため、projectSettings 内では**外側のツリーの `.claude/agents/` が内側のツリーより優先**されます。これは驚くべき動作です — 未解決の質問としてフラグを立てておきます。

### Frontmatter パーサー

| 質問                                                   | 回答                                                                                                                                                                                                                                         | Conf                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 使用ライブラリ | **なし** — `Bun.YAML.parse` を呼び出す手作りの分割子 `lz`（ラッパー `l5H` 経由）。バイナリに `gray-matter`、`js-yaml`、`front-matter` は含まれていません。                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| 正規表現                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| 失敗時の処理                                           | YAML パース失敗 → タブをスペース 2 つに正規化して再試行。それでも失敗する場合は、warn レベルで `Failed to parse YAML frontmatter in <file>: <err>` をログに出力し、`{frontmatter: {}, content: body}` を返します（決してスローしません）。                                     | **C** strings:307905, 151839                                      |
| 本文の抽出                                            | 閉じ `---` の後のプレーンな文字列スライス `H.slice(K[0].length)`。後で `v$H` によって正規化されます（おそらく先頭の改行の削除）。                                                                                                                        | **C** strings:307905                                              |
| agents / skills / commands / output-styles で共有されているか？ | **はい** — 同じ `lz` が `Iq_`（skill ローダー）、`f13`（非推奨の commands ローダー）、および `Gm` → `d_q` 経由のエージェントローダーで再利用されています。                                                                                                                  | **C** strings:312690                                              |
| スキーマバリデーター                                           | **Zod v4**（バンドル済み）。v4 専用のマーカー `looseObject`、`treeifyError`、`prettifyError`、`toJSONSchema` が存在します。                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| バリデーションモード                                            | **シャドウ** — `ahH("agent", frontmatter)` はテレメトリ**専用**に `ug5.agent().strict().safeParse()` を実行します。DL7 は結果を無視し、独自のフィールド単位のバリデーションを進めます。寛容な frontmatter オブジェクトが実行時の唯一の信頼できる情報源（source of truth）です。 | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores)    |
| テレメトリイベント                                           | `tengu_frontmatter_shadow_unknown_key`、`tengu_frontmatter_shadow_mismatch`（プロセス内の `Set A37` 経由で重複排除）                                                                                                                                 | **C** strings:154634, 154636                                      |

### 配線 — エージェントツール + CLI フラグ

| レイヤー                          | 動作                                                                                                                                                                       | Conf                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Task/Agent ツールスキーマ（`$_3`） | `subagent_type: string.optional()` を宣言。省略時は `general-purpose`（または `AI()` が true を返す場合は `fork`）にフォールバック                                                      | **C** strings:~309220        |
| サブエージェントの検索                | `toolUseContext.options.agentDefinitions.activeAgents` に対して `activeAgents.find(a => a.agentType === requestedType)` を実行                                                             | **C** strings:~309220        |
| ファジーフォールバック                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`。曖昧なマッチ → `AgentTypeError`。クリーンな再マッチ → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| 権限ゲート                | `lV_(toolPermissionContext, "Task", agentType)` — 拒否時 → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| システムプロンプトのソース           | Markdown の本文が `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` になります — パース時にクロージャがキャプチャされます。                                  | **C** strings:309074-6 (DL7) |
| メインスレッドのレンダリング             | `Pp({mainThreadAgentDefinition, …})` — エージェントが `appendSystemPrompt: true`（包括的な `claude` 組み込み）を持つ場合、本文がデフォルトに追加されます。それ以外の場合はデフォルトを**置換**します。      | **C** strings:311015         |
| `--agent <name>` CLI           | Commander 経由で宣言。アクションハンドラ `if(I) process.env.CLAUDE_CODE_AGENT = I;` — 環境変数に格納し、他の場所で `appState.agent` として読み取られます。pid ファイルにも記録されます。          | **C** strings:330190, 142138 |
| `--agents <json>` CLI          | 別のフラグ。JSON レコード `{name: {description, prompt, …}}` は `qKO = h.record(h.string(), JL7())` によってバリデーションされます。`source: flagSettings` として同じ `activeAgents` レジストリに参加します。 | **C** strings:330190, 309076 |
### ライフサイクル — コールドロード + ホットリロード

| 項目                          | 動作                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| コールドロード                       | 遅延評価 — `QL` は `h6`（キャッシュラッパー）を介してメモ化されます。初回アクセス時にファイルシステムとプラグインを読み込み、それ以降のアクセスではキャッシュを返します。                                                                                               | **C** strings:309076         |
| ホットリロードの仕組み            | モジュール初期化時に **chokidar watcher** `s_T()` (`WB6`) が登録されます。`.claude/agents`（ユーザーおよびプロジェクト）と、skills、commands ディレクトリを監視します。                                                                                      | **C** strings:316417         |
| Watcher フラグ                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), events `add`/`change`/`unlink` | **C** strings:316417         |
| デバウンス                        | 300 ms (`l_T = 300`)。ハンドラは `RIH(), Vv(), u0_(), …` を呼び出します。`u0_()` はエージェントキャッシュを無効化します。                                                                                                                              | **C** strings:316417, 309073 |
| アダプティブポーリング                | アクティブ時は `n_T = 2000 ms` の間隔。アイドル時（`r_T = 60000 ms` 間インタラクションなし）は `i_T = 30000 ms`。切り替え時に chokidar インスタンスを再作成します。                                                                                   | **C** strings:316417         |
| `/agents` スラッシュコマンド         | エージェントを管理するための `local-jsx` UI（Library/create/edit/delete/run）— リスキャンコマンドではありません。                                                                                                                             | **C** strings:314593         |
| `/reload-plugins` スラッシュコマンド | `QL(W8())` を再実行し、エージェントを再カウントします。プラグイン由来のエージェント（chokidar が監視しないもの）をカバーします。                                                                                                                         | **C** strings:314595, 190948 |
| その他の無効化パス        | `clearSessionCaches`（`/clear` で使用）も `u0_()` を呼び出します。                                                                                                                                                                 | **C** strings:313246         |

### 未解決の質問 (Phase 1)

| #   | 質問                                                                                                                                  | Conf  | 解決パス                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | `color` が #4821 から省略されているのは意図的なもの（`@internal` であるため）か、それとも見落としか？                                                            | **O** | 意図的なものとして扱う — フィールドを移植するが、internal/UI-only としてマークする  |
| Q2  | 寛容な `DL7` の動作（background が文字列を受け入れる、maxTurns が文字列を受け入れる）は、ドキュメント化されたユーザー向け機能か、後方互換性のためのハックか？ | **O** | 同等性のためにミラーリングするが、移植ドキュメントで警告する                             |
| Q3  | `isolation` 列挙型 `["worktree"]` がエージェント専用であるのに対し、background-session 設定スキーマは `["none","worktree"]` を受け入れるのはなぜか？        | **O** | おそらく「isolation なし」= フィールドの省略。明示的にドキュメント化する              |
| Q4  | `--agents <json>` (flagSettings) は意図的に優先度 5（プロジェクトより上、ポリシーより下）に配置されているか？                                    | **O** | qwen-code は v1 でこのフラグをスキップし、決定を先送りできる                   |
| Q5  | `iV_` による最内側優先のプッシュと Map.set の last-wins により、projectSettings の競合では最外側ツリーが優先される。これは地雷か、それとも意図的なものか？           | **O** | qwen-code はこの地雷を避けるために最内側優先のセマンティクスを採用すべき |

---

## Phase 2 — qwen-code の実装計画

### 現状 — 概要

qwen-code にはすでに大規模なサブエージェントインフラが搭載されています。
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) は、
カスタム YAML パーサー (`packages/core/src/utils/yaml-parser.ts` — `gray-matter` / `yaml` 
への依存なし、`package.json` で確認済み) を使用して、`.qwen/agents/` (プロジェクト) および 
`~/.qwen/agents/` (ユーザー) 内の markdown+YAML frontmatter ファイルに対する CRUD を実装しています。
`SubagentConfig` (`packages/core/src/subagents/types.ts:41-122`) にはすでに `name`、
`description`、`tools`、`disallowedTools`、`approvalMode`、`systemPrompt`、
`model`、`runConfig`、`color`、`background` が含まれています。`SubagentLevel` はすでに 
5 つのスコープ (session, project, user, extension, builtin) をサポートしており、優先順位は 
`session > project > user > extension > builtin` です 
(`subagent-manager.ts:189-220`)。Agent ツール 
(`packages/core/src/tools/agent/agent.ts`) は `subagent_type` を宣言し、
`subagentManager.changeListener` を介してスキーマ列挙型を動的に更新します。
`convertClaudeAgentConfig()` ブリッジは、ツール名のマッピングと 
`permissionMode → approvalMode` のマッピングを備えて、
`packages/core/src/extension/claude-converter.ts:162-220` にすでに存在します。**ギャップ**は以下の通りです: (a) スキーマに #4821 の 8 つのフィールド (`effort`、ファーストクラスとしての `permissionMode`、`mcpServers`、`hooks`、トップレベルとしての `maxTurns`、
`skills`、`initialPrompt`、`memory`、`isolation`) が欠けていること。(b) `--agent <name>` 
CLI フラグがないこと。(c) chokidar スタイルのホットリロードがないこと（extension スタイルの無効化は存在するが、ファイルシステムエージェント用ではない）。(d) `maxTurns` が現在 
`runConfig.max_turns` の下にネストされていること — #2409 に従ってトップレベルに昇格させる必要がある。

### アーキテクチャの決定事項

#### D1. frontmatter に既存の yaml-parser を再利用する

**決定:** `packages/core/src/utils/yaml-parser.ts` を再利用する（すでに 
`SubagentManager.parseSubagentContent` と skill ローダーで使用されている）。
**理由:** Claude Code の `lz` は、skills + commands + agents に使用されるのと同じ共有パーサーであり、
qwen-code はすでにそのパターンをミラーリングしている。`gray-matter` や `js-yaml` を追加するのは
不要な変更である。既存のパーサーは `--- … ---` の分割を処理し、不正な入力に対しては沈黙する
（`lz` の `warn-and-return-empty` の姿勢と一致する）。

#### D2. 解決 / 優先順位

**決定:** `session > project (.qwen/agents/) > user (~/.qwen/agents/)
> extension > builtin` を使用します。つまり、**既存の qwen-code の SubagentLevel
の順序を維持し、v1 では Claude Code の `flagSettings` / `policySettings` バケットを
ミラーリングしません**。
**理由:** Claude Code の policySettings（管理ディレクトリ）はエンタープライズデプロイのストーリーであり、
qwen-code にはない。フラグで注入されたエージェント（`--agents <json>`）はパワーユーザー向け機能であり、
P4 で実装できる。既存の 5 段階の qwen-code の優先順位は、#4821 が重視するケース
（プロジェクトがユーザーをオーバーライドし、ユーザーがビルトインをオーバーライドする）をすでにカバーしている。
`extension` レベルは、ユーザーと > ビルトインの間にきれいに収まる。

#### D3. バリデーション — 既存の SubagentValidator を維持する

**決定:** `SubagentValidator`
(`packages/core/src/subagents/`) を拡張して、8 つの新しいフィールドを
バリデーションします。skillManager のパイプラインがすでに使用していない限り、
zod を導入**しません**。既存のバリデーターがハンドロールされている場合は、
ハンドロールのままにします。
**理由:** Claude Code の `Ig5` はシャドウのみであり、ランタイムバリデーションはハンドロールされた 
`DL7` である。そのパターンに合わせることで、別の依存関係を持ち込まずに、エラーメッセージを
読みやすく保つことができる（例: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`）。
skillManager がすでに zod を使用している場合は、一貫性のためにその選択に従う — 
P1 準備で skill コードを読んで TBD（To Be Determined）。

#### D4. ホットリロード — 延期。コールドロード + 明示的なリロードに依存する

**決定:** v1 には chokidar watcher を**搭載しません**。キャッシュ無効化フックはすでに存在します
（`subagentManager` には `changeListener` と明示的な CRUD 駆動の更新がある）。
プロジェクトレベルのリロードはセッション開始時に発生し、セッション内の `/agents` UI を介した編集は
無効化されます。ユーザーの需要があれば、`/reload-agents`（または `/reload-plugins` に乗っかる）
スラッシュコマンドを P4 で実装できます。
**理由:** FS watcher によるホットリロードはコストが高い（chokidar はアダプティブスケジューリングを伴う
ポーリングループを追加する — Claude Code の実装だけで約 150 行の管理コードがある）。
起動時のコールドロードは v1 には十分であり、現在の `SubagentManager` の配線方法と一致する。
P4 への道を開く。

#### D5. `--agent <name>` CLI フラグの組み込み — v1 のスコープ内

**決定:** `packages/cli/src/config/config.ts` の CliArgs に `--agent <name>` を追加します。
動作: 解決されたレジストリに対してルックアップし、エージェントをメインスレッドのエージェントとして設定し、
名前が解決されない場合は明確なエラーをスローします。Claude Code のセマンティクスに一致させます
（エージェントが `appendSystemPrompt: true` を持たない限り、デフォルトのシステムプロンプトを置き換える）。
`CLAUDE_CODE_AGENT` 環境変数による間接参照は使用**しません** — qwen-code の `Config` オブジェクトが
直接保持できます。
**理由:** これは #4821 のユーザー向けハンドルです — これがないと、宣言型エージェントは Agent ツールの 
`subagent_type` パラメータ経由でのみアクセス可能となり、「デフォルトのエージェントを設定する」という
ユースケースには間接的すぎます。`--agents <json>`（複数形）は P4 に先送りできます。

#### D6. Workflow.agentType の調整 — インターフェース契約

**決定:** PR #4732 の `createProductionDispatch` がマージされたときに呼び出せる、
安定したリゾルバーインターフェースを公開します。具体的には:

| 契約                                                                                                                                                                                                                                                                                                     | オーナー                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Frontmatter の `name` は workflow の `agentType` 文字列である（キーの等価性、大文字小文字を区別）                                                                                                                                                                                                                         | this PR              |
| Workflow のハードコードされた `disallowedTools` のフロア（`[SEND_MESSAGE, EXIT_PLAN_MODE]`、アップストリームの `Tg8` からミラーリング。PR #4732 で `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE` として確認済み）は、エージェントレベルの `disallowedTools` と UNION される — エージェント定義が `tools` を設定している場合でも、フロアは常に適用される | workflow PR consumes |
| 呼び出しごとの `opts.isolation` は、エージェントごとの `isolation: 'worktree'` デフォルトをオーバーライドする                                                                                                                                                                                                                                | workflow PR consumes |
| エージェント定義からの `model`, `effort`, `permissionMode`, `maxTurns` は、設定されている場合に workflow のデフォルトをオーバーライドする                                                                                                                                                                                                    | workflow PR consumes |
| エージェントの本文がサブエージェントの `systemPrompt` になる。workflow の `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` は、`agentType` が解決されない場合のフォールバックとなる                                                                                                                                                             | workflow PR consumes |
| `agentType` が未設定または解決に失敗した場合、workflow はビルトインの workflow サブエージェントにフォールバックする（グレースフル、スローなし）                                                                                                                                                                                        | workflow PR consumes |
**#4721 / #4821 の矛盾の解決**（`tools` と `disallowedTools` の優先順位）: この移植では、エージェントレジストリが `disallowedTools` を `tools` とは**常に別々に保持する**ように記述します。#4821 のテーブルにある「`tools` が設定されている場合は無視される」というルールは、パース時ではなく**エージェントツールの呼び出し側**（つまり、サブエージェントの `ToolConfig` を構築する際）によって**適用されます**。これにより、ワークフローはエージェントが `tools` を設定しているかどうかに関わらず、常にそのフロアと `disallowedTools` の和集合を取ることができます。エージェントレジストリは**単なるデータキャリア**であり、優先順位のルールはディスパッチサイトに存在します。これにより、#4821 の「無視される」ルールと #4721 の「和集合」ルールの間の表面的な矛盾が解決されます。

**ツール名の正規化:** `ToolNames.SEND_MESSAGE` と `ToolNames.EXIT_PLAN_MODE` を使用します（PR #4732 の差分で検証済み）。これらはマージ後に `packages/core/src/agents/runtime/workflow-orchestrator.ts` から名前付き定数としてエクスポートされます。宣言的エージェントの移植自体はこれらをインポートする必要はありません。これらはワークフローのフロアであり、ワークフローのディスパッチサイトで適用されるためです。

### モジュール構成

| パス                                                               | 新規 / 変更 | 目的                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **変更**   | `SubagentConfig` に 8 つの新規フィールドを追加: `effort`, `permissionMode`（すでに `approvalMode` 経由でマッピングされる — 両方保持するか？以下の D7 を参照）, `mcpServers`, `hooks`, `maxTurns`（トップレベルに昇格、`runConfig.max_turns` は非推奨化）, `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **変更**   | `parseSubagentContent` / `serializeSubagent` を拡張して新規フィールドをラウンドトリップさせる。`SubagentValidator` の呼び出しも拡張                                                                                                                                    |
| `packages/core/src/subagents/subagent-validator.ts` (想定パス) | **変更**   | DL7 のエラーメッセージに一致するフィールドごとのバリデーションを追加: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` など                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **新規**       | 列挙定数の単一の真実の情報源: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`。Claude Code 2.1.168 と完全に一致させる                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **変更**   | 新規フィールドのデフォルトは undefined。動作の変更なし                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **変更**   | サブエージェントオプション（`model`, `maxTurns`, `permissionMode`, `effort`）の構築時に、解決された `SubagentConfig` から新規フィールドを読み取る。#4721 向けの `isolation` の呼び出しごとのオーバーライドセマンティクスを配線                                                                              |
| `packages/cli/src/config/config.ts`                                | **変更**   | `--agent <name>` フラグを追加。起動時に `SubagentManager` に対して解決。名前が解決できない場合はエラー                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **変更**   | `--agent` フラグの解決とエラーパスのテスト                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **変更**   | Claude の `.md` ファイルをインポートする際の新規フィールドのマッピングを追加（`mcpServers`, `hooks`, `maxTurns` のトップレベル化, `memory`, `isolation` など）                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **新規**       | 列挙リストのスナップショットテスト。パース/シリアライズのラウンドトリップテスト                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **変更**   | 新規フィールドのバリデーション、優先順位、エラーメッセージのテスト                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **変更**   | サブエージェントランタイムへの新規フィールドの配線テスト                                                                                                                                                                                                                        |
| `docs/cli/agents.md`（存在する場合）または `docs/declarative-agents.md`   | **新規**       | ユーザー向けリファレンス: 16 フィールドのスキーマと例                                                                                                                                                                                                                         |

### D7. permissionMode と approvalMode — 置き換えではなくブリッジ

**決定:** フロントマターで `permissionMode`（Claude 互換）と既存の `approvalMode`（qwen 互換）の**両方**を受け入れます。パース時に `permissionMode` が設定されている場合、`claude-converter.ts:195-208` の既存テーブル（`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`）を使用して `approvalMode` にマッピングします。両方が存在する場合は `approvalMode` が優先され（qwen-code により特化しているため）、両方が設定されたことを示す `tengu_frontmatter_shadow_*` 形式のテレメトリエベントを発行します。
**理由:** `approvalMode` を使用する既存の `.qwen/agents/*.md` との後方互換性を維持しつつ、Claude Code の `permissionMode` をそのまま受け入れることで、ユーザーは Claude Code のエージェントファイルをそのまま変更せずにドロップインできます。

### スキーママッピングテーブル

| Claude Code 2.1.168 フィールド  | qwen-code フィールド                                    | 適応                                                                                                   | 備考                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | なし                                                                                                         | 同一、必須                                                                                      |
| `description`              | `description`                                      | なし                                                                                                         | 同一、必須                                                                                      |
| `model`                    | `model`                                            | `inherit`, `fast`, `haiku`, `sonnet`, `opus`, または `authType:model-id` を受け入れる                                  | qwen-code はすでにより広い語彙をサポート。`inherit` は新規                                      |
| `tools`                    | `tools`                                            | 文字列または配列を受け入れる。`*` → undefined（すべて継承）                                                          | すでに配列としてサポート済み。文字列と `*` の処理を追加                                                    |
| `disallowedTools`          | `disallowedTools`                                  | 文字列または配列を受け入れる。**常に `tools` とは別々に保持される**                                             | 優先順位のルール（#4821 の「`tools` が設定されている場合は無視される」）は、パーサーではなく**呼び出し側**によって適用される                    |
| `effort`                   | `effort` (新規)                                     | 列挙型 `low/medium/high/xhigh/max` と整数。エイリアス `med → medium`                                             | ランタイムへの影響は qwen 固有（存在する場合は既存の thinking-effort ノブにマッピング、なければ保存して無視） |
| `permissionMode`           | `permissionMode` (新規) + `approvalMode` へのブリッジ | 列挙型 `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`。D7 に従ったマッピングテーブル                         | Claude 形式をそのまま受け入れる                                                                            |
| `mcpServers`               | `mcpServers` (新規)                                 | 文字列または `{name: spec}` の配列。項目ごとにバリデーションし、不正なエントリは警告付きで破棄                           | P4 で MCP ランタイムへ配線                                                                            |
| `hooks`                    | `hooks` (新規)                                      | settings.json の hooks 形状に一致するオブジェクト                                                                    | P4 で hook ランタイムへ配線                                                                           |
| `maxTurns`                 | `maxTurns` (新規トップレベル)                         | 正の整数。整合性のために数値文字列も受け入れる                                                           | **`runConfig.max_turns` から昇格**。ネストされた形式は非推奨のエイリアスとして保持                             |
| `skills`                   | `skills` (新規)                                     | スキル名の配列。カンマ区切りの文字列も受け入れ                                                   | ランタイム: エージェント開始時に skillManager 経由でプリロード                                                      |
| `initialPrompt`            | `initialPrompt` (新規)                              | 文字列。空白のみの場合は undefined。エージェントがメインセッションの場合にのみ発火                                   | `--agent` フラグパス経由で配線                                                                            |
| `memory`                   | `memory` (新規)                                     | 列挙型 `user/project/local`。`.qwen/agent-memory/<name>/` などからロード                                      | P4 でランタイム実装                                                                                            |
| `background`               | `background`                                       | 真偽値または文字列 `"true"/"false"` を受け入れる。真と評価されるもののみ true                                                   | すでにサポート済み。パースルールを緩和                                                                    |
| `isolation`                | `isolation` (新規)                                  | 列挙型 **のみ** `["worktree"]`                                                                                 | ランタイムはワークフロー PR (#4732 P3+) が所有。レジストリは単にフィールドを保持                                |
| `color` (未文書化 #16) | `color`                                            | 列挙型 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`。リスト外の値はサイレントに破棄 | すでに qwen の `SubagentConfig` に存在。Claude Code の許可リストに一致するようにバリデーションを厳格化                      |
### TDD テスト計画

| チャンク | テストファイル | 検証内容 |
| --- | --- | --- |
| スキーマ列挙定数 | `agent-frontmatter-schema.test.ts` (新規) | `EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES` が Claude Code 2.1.168 とバイト単位で一致すること（スナップショット） |
| パーサー — ハッピーパス | `subagent-manager.test.ts` | 全16フィールドを含む `.qwen/agents/test.md` を往復パースし、出力されるレコードが期待される形状を持つこと |
| パーサー — 必須フィールド | `subagent-manager.test.ts` | `name` がない場合は null を返し、警告ログを出力する。`description` がない場合も同様に null を返し、警告ログを出力する |
| パーサー — 列挙型の検証 | `subagent-manager.test.ts` | 不正な `permissionMode` / `memory` / `isolation` / `effort` / `color` はそれぞれ固有の警告（DL7 の文言に準拠）を出力し、そのフィールドは破棄される |
| パーサー — 寛容なフィールド型 | `subagent-manager.test.ts` | `background: "true"` → `true`。`maxTurns: "5"` → `5`。`effort: "med"` → `"medium"`。`tools: "Read,Edit"` → `["Read","Edit"]`。`tools: "*"` → undefined |
| パーサー — 色の許可リスト | `subagent-manager.test.ts` | `color: "magenta"` は暗黙に破棄される（エラーなし）。`color: "blue"` は保持される |
| skills フィールドの特殊な挙動 | `subagent-manager.test.ts` | `skills` を省略すると `skills: []` になる（Claude Code DL7 の出力動作と一致） |
| 解決の優先順位 | `subagent-manager.test.ts` | project と user で同じ `name` の場合 → project が優先。user と builtin の場合 → user が優先。extension と builtin の場合 → extension が優先 |
| inode の重複排除 | `subagent-manager.test.ts` | 同じ inode（シンボリックリンク）への2つのパス → レコードは1つのみ、ログが出力される |
| permissionMode ブリッジ | `subagent-manager.test.ts` | `permissionMode: bypassPermissions` → 解決されて `approvalMode: yolo` になる。両方設定されている場合 → `approvalMode` が優先され、テレメトリが送信される |
| `--agent` CLI フラグ | `packages/cli/src/config/config.test.ts` | フラグでメインスレッドのエージェントを設定する。未解決の名前の場合、`Agent type '<x>' not found. Available agents: …` でスローする |
| エージェントツールのファジーフォールバック | `agent.test.ts` | `subagent_type: "Test_Engineer"` は NFKC 小文字正規化を通じて登録済みの `test-engineer` に解決される |
| エージェントツールの not-found エラー | `agent.test.ts` | 未解決の `subagent_type` → エラーメッセージが `Agent type '<x>' not found. Available agents: <list>` に一致する |
| ワークフローの契約 | `agent-frontmatter-schema.test.ts` | エクスポートされた `getAgentByName(name)` インターフェースが、`isolation`、`disallowedTools`、`model`、`effort`、`permissionMode`、`maxTurns` を含む完全な SubagentConfig を返すこと（ワークフロー PR #4732 で利用可能） |

### フェーズ分けされた PR 計画

| フェーズ | タイトル | スコープ | ブロック |
| --- | --- | --- | --- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | `SubagentConfig` にフィールドを追加。パーサー、バリデーター、シリアライザーを拡張。`runConfig.max_turns` を非推奨化。列挙定数モジュールを追加。テスト | なし |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime` | `model`、`effort`、`maxTurns`、`permissionMode`/`approvalMode` ブリッジを `AgentTool.execute()` → `AgentHeadless.create()` の呼び出しサイトに組み込む。テスト | P1 |
| **P3** | `feat(cli): --agent flag for main-thread agent selection` | `CliArgs` に `--agent <name>` を追加。起動時に解決。エラーパス。テスト | P1 |
| **P4** | （オプション、スコープクリープ）`feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime` | 「v1 ではメタデータのみの」4つのフィールドを実際のランタイム動作に組み込む | P1、および skill/MCP/hook サブシステム |

各 PR のターゲットは差分 ≤ 800 LOC（テストを除く）。P1 が最大で、バリデーターとテストで約 600 LOC。

---

## フェーズ 3 — ワークフロー移植との連携マトリクス (#4721 / PR #4732)

| 宣言型エージェントの機能 | ワークフローとの連携 | オーナー | ブロック要因 |
| --- | --- | --- | --- |
| レジストリキーとしての `name` フィールド | ワークフローの `opts.agentType` 検索文字列（[#4721][i4721] で明示） | **本 PR** がレジストリの契約を定義。**ワークフロー PR** が消費 | なし — まずレジストリの形状を安定化できる |
| エージェントの `disallowedTools` フィールド | ワークフローがハードコードされた下限 `[SEND_MESSAGE, EXIT_PLAN_MODE]` と UNION する（[#4721][i4721] §2 に準拠 — PR #4732 の差分で確認済み: `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`） | **本 PR** がフィールドを持つ。**ワークフロー PR** がディスパッチ時に UNION する | ワークフロー PR #4732 P3 のマージ |
| エージェントの `tools` フィールド | ワークフローがサブエージェントの `ToolConfig.tools` にそのまま渡す | **本 PR** がフィールドを持つ。**ワークフロー PR** が組み込む | ワークフロー PR #4732 P3 |
| エージェントの `model` フィールド | ワークフローの `opts.model` が呼び出しごとにオーバーライドする。エージェントの `model` はデフォルト | **本 PR** がフィールドを持つ。**ワークフロー PR** が優先順位を解決する | ワークフロー PR #4732 P3 |
| エージェントの `effort` フィールド | ワークフローの呼び出しサイトでのオーバーライドが優先される。エージェントのデフォルトはフォールバック | **本 PR** がフィールドを持つ。**ワークフロー PR** が解決する | ワークフロー PR #4732 P3 |
| エージェントの `permissionMode` フィールド | ディスパッチ時にサブエージェントの approvalMode にマッピングされる。ワークフローの呼び出しサイトでのオーバーライドが優先される | **本 PR** が D7 ブリッジ経由でフィールドを持つ。**ワークフロー PR** が組み込む | ワークフロー PR #4732 P3 |
| エージェントの `maxTurns` フィールド | エージェントが設定した場合、ワークフローのハードコードされた `WORKFLOW_SUBAGENT_MAX_TURNS = 50` を置き換える | **本 PR** がフィールドを持つ。**ワークフロー PR** が優先順位を解決する | ワークフロー PR #4732 P3 |
| エージェントの `isolation: 'worktree'` フィールド | デフォルト。呼び出しごとの `opts.isolation` がオーバーライドする（[#4721][i4721] §3） | **本 PR** がフィールドを持つ。**ワークフロー PR** がランタイムを所有する | ワークフロー PR #4732 P3+（現在は P1 でスローされる） |
| エージェントの `initialPrompt` フィールド | ワークフローはこれを使用**しない**（エージェントが `--agent` 経由でメインセッションの場合にのみ発火する） | **本 PR** + **CLI** | なし（独立） |
| `memory`、`mcpServers`、`hooks`、`skills` | ワークフローはサブエージェントのランタイムに渡す以外に特別な処理を持たない | **本 PR** がフィールドを持つ。ランタイムの組み込みは P4 / 将来 | 将来の PR |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS` の更新 | ワークフロー PR #4732 がセットに `WORKFLOW` を追加する（issue/PR コンテキストの発見に基づく — ただし、`main` の `agent-core.ts` にはまだ含まれておらず、worktree のみであるという反論もある） | **ワークフロー PR** が所有。本 PR は変更なし | なし |
| ワークフローの下限に対するツール名の正規形式（`ToolNames.SEND_MESSAGE`） | 本 PR は下限の定数をインポートしない。作成された通りの `disallowedTools` 文字列を持つのみ。正規化はワークフロー PR が所有する。 | **ワークフロー PR** | ワークフロー PR #4732 |
| リリース順序 | 本 PR（P1+P2+P3）はワークフローとは独立してリリースされる。ワークフロー PR #4732 P3 は、本 PR の `getAgentByName()` のようなリゾルバーがインポート可能であることに依存する。 | ワークフローの P3 まで並行 | ワークフロー P3 が本 PR のエクスポートから読み取る |
**循環ブロックなし:** このPRとworkflow PRは、P1/P2フェーズを通じて並行してマージできます。これらは、このPRのレジストリリゾルバを必要とするworkflow-P3で同期します。このPRが先にマージされた場合、workflow-P3はそこから読み取ります。workflow PRが先にマージされた場合、既存の `subagent_type` ルックアップ（ミス時にworkflowのデフォルトを返す）で出荷され、このPRがマージされた後にリッチなリゾルバに切り替わります。

---

## フェーズ4 — リスクと未解決の質問

### リスク

| #   | リスク                                                                                                                                                                                                | 緩和策                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Claude Codeのマイナーリリース間（2.1.168 → 2.1.x）でのスキーマのドリフト                                                                                                                                   | enum定数モジュールをドキュメントコメントで「2.1.168に対して検証済み」としてピン留めする。`feature-reverse` skillの一部として、新しいリリースに対してstrings-grepを再実行する |
| R2  | `runConfig.max_turns` からトップレベルの `maxTurns` への変更は、既存の `.qwen/agents/*.md` ファイルに対する破壊的なスキーマ変更である                                                                                     | 1サイクルの非推奨期間を設け、ネストされた形式を非推奨のエイリアスとして保持する。解析時に警告を発し、CHANGELOGに文書化する                                                     |
| R3  | `permissionMode` ↔ `approvalMode` のラウンドトリップで情報が失われる（Claudeは6モード、qwenは4モード程度）                                                                                                            | D7に従って両方向を明示的にマッピングする。二重設定時にテレメトリを発行する。保存時にサイレントに書き換えてはならない                                                             |
| R4  | 新しいフィールド（`hooks`, `mcpServers`, `skills`, `memory`）はレジストリに保持されるがv1にはランタイムがない → ユーザーがこれらを設定してもサイレントに効果がなくなる可能性がある                                                     | v1のスコープを明確に文書化する。「保持されるがまだランタイムがない」フィールドが空でない場合、エージェントごとに1回限りのinfoログを発行する                                          |
| R5  | Adversarial-verifyにより、`EXCLUDED_TOOLS_FOR_SUBAGENTS` が `main` 上で `WORKFLOW` を含んでいないことが指摘された — これはworkflowのポートがまだマージされていないか、recursive-fanoutガードが欠けていることを意味する可能性がある | workflow PRの作成者（LaZzyMan = 自身）と確認し、ガードがこのポートではなくPR #4732でマージされることを確認する                                                     |
| R6  | outer-tree-beats-inner-treeのprojectSettingsの動作（Q5）は、そのままミラーリングすると地雷になる                                                                                                             | qwen-codeは明示的に**innermost-wins**を選択する。R5のフィクスチャを通じてテスト済み                                                                                         |
| R7  | フィールド `color` はバイナリのdescribeテキストで `@internal` として文書化されている — Anthropicが明示的にサポートしていないものをポートしている可能性がある                                                        | ポートするが、qwen-codeのドキュメントでも `@internal` としてマークする。UI専用として扱い、ユーザー向けのリファレンスドキュメントには掲載しない                                             |

### 未解決の質問 — 提案される解決策

| #   | 質問                                                                                                                                                       | 解決策                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | #4821から `color` が意図的に省略されているか？                                                                                                                  | **意図的なものとして扱う**。フィールドをポートする。「利用可能、内部用」としてを除き、ユーザー向けドキュメントには記載しない。                                                                                                                                                                                                                                            |
| Q2  | 寛容なDL7の動作: 文書化するか、ハックするか？                                                                                                                       | **そのままミラーリングする**。文書化されていなくても、同等性のために `background: "true"`, `maxTurns: "5"`, `effort: "med"` を受け入れる。テストを追加する。                                                                                                                                                                                                                                |
| Q3  | agentスキーマとbackground-sessionスキーマでisolationのenumが異なるのはなぜか？                                                                                 | **コードコメントに相違を文書化する**。「isolationなし」= enum値ではなく、フィールドが省略されていること。                                                                                                                                                                                                                                                          |
| Q4  | `--agents <json>`（複数形、flagSettings）はv1に含めるべきか？                                                                                                    | **P4に延期する**。パワーユーザー向けのCLIインターフェース。v1では #4821が対象としている `--agent <name>`（単数形）のみを出荷する。                                                                                                                                                                                                                                 |
| Q5  | ネストされた `.qwen/agents/` のinner-treeとouter-treeの優先順位は？                                                                                                | **Innermost-wins（最も内側が優先）**。Claude Codeの意図しないouter-winsの動作を上書きする。P1でテストフィクスチャを作成。                                                                                                                                                                                                                                                          |
| Q6  | `tools` と `disallowedTools` の優先順位: #4821は「toolsが設定されている場合は無視される」としている。#4721は「workflow floorとの和集合」としている                                          | **レジストリは単なるデータ**。パーサーは両方のフィールドを独立して保持する。優先順位ルールはディスパッチサイト（Agent tool / workflow）に存在する。矛盾を解決する。                                                                                                                                                                                   |
| Q7  | workflow disallowedTools floorのツール名の正規形 — PR #4732に対して `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE` として検証済み            | **このPRの関知するところではない** — workflow PRが担当する。調整マトリックスにのみ文書化する。                                                                                                                                                                                                                                                              |
| Q8  | #2409のクローズ解決は何か影響するか？                                                                                                                   | **#2409の「model + maxTurnsをトップレベルに昇格させる」というガイダンスを継承する**。すでにこの計画に組み込まれている。                                                                                                                                                                                                                                                      |
| Q9  | qwen-codeの既存の `SubagentLevel` 優先順位において、`extension` レベルのエージェントは `builtin` より上（現在）に留めるべきか、それとも下（Claude Codeに同等のものはない）にすべきか？ | **`extension > builtin` を維持する**。拡張機能はユーザーがインストールするもの。ビルトインはベンダーのデフォルト。ユーザーがインストールしたものが優先される。                                                                                                                                                                                                                                        |
| Q10 | issue #4821, #4721, #4732は、このドキュメントが提案するコントラクトに対して完全に仕様化されているか？                                                                             | **#4821に調整コメントを投稿する**。このドキュメントへのリンクを貼り、フィールドごとの決定を要約し、メンテナーに以下の承認を求める: (a) Claude Code 2.1.168の16フィールドとのスキーマ同等性、(b) D7 `permissionMode`/`approvalMode` ブリッジ、(c) D2 優先順位、(d) `tools`/`disallowedTools` の矛盾に対するレジストリを単なるデータとする解決策。 |

### 調整アクションアイテム

| #   | アクション                                                                       | 場所                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | フィールドごとの要約 + 5つの決定を #4821 に投稿し、メンテナーの承認を得る        | #4821へのコメント                                     |
| A2  | フェーズ3マトリックスに言及しつつ、#4721からこのドキュメントへ相互リンクを張る                 | #4721へのコメント                                     |
| A3  | このポートのP1がマージされたら、よりリッチなリゾルバに切り替えるよう #4732 に連絡する          | PR #4732へのコメント（準備ができ次第）                     |
| A4  | スキーマドリフト検出のため、次のClaude Codeマイナーリリースに対してstrings-grepを再実行する | `feature-reverse` skillのcronジョブ（それまでは手動） |