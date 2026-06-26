# 宣言的エージェント定義 — Claude Code 2.1.168 からの移植

Claude Code の宣言的エージェント（Markdown + YAML frontmatter）スキーマを qwen-code に移植するための内部設計ドキュメントです。課題 [#4821][i4821] に対応し、ワークフロー移植（課題 [#4721][i4721] / PR [#4732][p4732]）と連携します。

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## 実装状況（垂直スライス）

PR [#4842][p4842] により、エンドツーエンドのランタイムパスを持つフィールドが出荷されました。PR [#4870][p4870] では、ブロックスカラーをサポートするために YAML パーサーが置き換えられました。このフォローアップ PR はその両方に基づいています：YAML **文字列化**（PR #4870 では手書きのまま — `docs/yaml-parser-replacement.md` 参照）を置き換え、`mcpServers` + `hooks` を `SubagentConfig` に公開し、サブエージェント実行時にエージェントごとの MCP サーバーとフックが実際に起動するようにランタイムに配線します。

| フィールド         | ステータス                         | 備考                                                                                                                                                               |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **出荷済み (#4842)**              | パース時に既存の qwen `approvalMode` にブリッジ                                                                                                               |
| `maxTurns`        | **出荷済み (#4842)**              | 既存の `runConfig.max_turns` ランタイムパスに配線                                                                                                              |
| `color` 許可リスト | **出荷済み (#4842)**              | 既存フィールドを CC の `_Y` セット + レガシー `auto` センチネル処理に厳格化                                                                                          |
| `mcpServers`      | **出荷済み (フォローアップ)**      | eemeli/`yaml` の stringify によりネストされた YAML ラウンドトリップ対応；ランタイムオーバーライドはサブエージェント Config ラッパー + 強制ツールレジストリ再構築を介してセッション + エージェントサーバーをマージ |
| `hooks`           | **出荷済み (フォローアップ)**      | サブエージェント起動時に一時的な HookRegistry エントリを登録、`onStop` で削除；v1 ではグローバルに発火（エージェントスコープフィルターなし）                                        |
| `effort`          | 延期                              | qwen プロバイダーにはまだモデルレイヤーの `effort` パラメーターが存在しない                                                                                                      |
| `memory`          | 延期                              | qwen の自動メモリにはまだ `user`/`project`/`local` スコープの区別がない                                                                                            |
| `isolation`       | 延期                              | ワークフロー PR #4732 がランタイムを所有；エージェントごとのデフォルトはそれがリリースされたときに導入される                                                                                         |
| `initialPrompt`   | 延期                              | `--agent` CLI フラグが必要（qwen にはメインセッションエージェントインフラがない）                                                                                                   |
| `skills`          | 延期                              | SkillManager が `config.skills` を使用する必要がある                                                                                                                |

以下に完全なリバースエンジニアリング記録が残されており、延期されたフィールドの設計リファレンスとして保持されます — スキーマ定数、DL7/Ig5 セマンティクス、エラーメッセージ、およびワークフローとの調整マトリックスは、その作業において依然として重要な役割を果たします。

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## フェーズ 0 — 境界

| 項目                     | 値                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 最新上流検証バージョン | Claude Code **2.1.168** (課題 #4821 は ≥ 2.1.167 を参照、当方はその1つ上)                                                       |
| ネイティブバイナリ            | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| 文字列抽出          | `/private/tmp/cc-2.1.168/claude.strings` (~342 k 行)                                                                                 |
| ワークツリー                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| ブランチ                   | `lazzy/gifted-hamilton-684741` off `main @ 45efb1d3a`                                                                                   |
| 対象外             | PR #4732 ワークフローコード（別のワークツリー `lazzy/lucid-pare-974192`） — インターフェース経由でのみ連携                                    |
| 作成ルール           | 作成者は **LaZzyMan**；コミット、PR、課題、コメントに `Co-Authored-By` や AIツールのトレーラーは**一切**使用しない (`~/.claude/CLAUDE.md` に従う) |

---

## フェーズ 1 — リバースエンジニアリングの結果

ここでの全ての主張は、`claude.strings` に対して独立して grep され、敵対的反論を経ても生き残っています。信頼度: **C** = 確認済み（直接的なバイナリ証拠）、**I** = 推定（複数の確認された事実から合成）、**O** = 未確定（まだ不確か）。

### スキーマ — 15のフィールド、反論と再確認

エージェント frontmatter シャドウスキーマは `Ig5` で、`ug5.agent` 内で `tengu_frontmatter_shadow_unknown_key` / `_mismatch` テレメトリに使用されます。**本番ローダーは `DL7`** (`parseAgentFromMarkdown`) で、手動のフィールドごとのバリデーションとカスタムエラーメッセージを実行します。別の **JSON フォームスキーマ `JL7`** (`fL7` / `parseAgentFromJson` で使用) はより厳格ですが、異なるコードパスです（`--agents <json>` および `settings.agents` で使用）。

| #   | フィールド             | 型 (Ig5 / DL7)                        | 必須 | デフォルト        | 列挙型 / 制約                                                                                                                       | 確認                                        |
| --- | --------------------- | --------------------------------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`                | string, 空不可                         | **はい**  | —              | なし — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                  | **C** strings:308120, 309074                |
| 2   | `description`         | string, 空不可                         | **はい**  | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`               | string                                  | いいえ      | undefined      | `inherit` (大文字小文字区別なし) はリテラル `"inherit"` に正規化；それ以外はそのままトリムして渡す                                          | **C** strings:308120, 309075, 309076        |
| 4   | `tools`               | string\|array (MDH ユニオン)               | いいえ      | undefined      | 単一トークン `*` → `undefined` (「全て継承」を意味する)；`AXH`/`FbK` で重複排除                                                             | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools`     | string\|array (MDH)                     | いいえ      | undefined      | "`tools` が設定されている場合は無視される"（説明テキストより）；呼び出し側で強制                                                                    | **C** strings:308120, 309075                |
| 6   | `effort`              | string\|整数                         | いいえ      | undefined      | 列挙型 `GN=["low","medium","high","xhigh","max"]` または `int`；エイリアス `P37={med:"medium"}`                                                    | **C** strings:308120, 309075, GN/P37 インライン |
| 7   | `permissionMode`      | string                                  | いいえ      | undefined      | 列挙型 `$E = Gmq = [...kc]` ここで `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 値)                   | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`          | `z.unknown()` (Ig5); `array(jL7)` (JL7) | いいえ      | undefined      | 各要素: string または `record(string, MCPServerSpec)`；DL7 で要素ごとに `safeParse`                                                       | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`               | `z.unknown()` (Ig5); `_u()` (JL7)       | いいえ      | undefined      | 実行時に `TKO` → `_u().safeParse` を介して遅延バリデーション (settings.json の hooks 形状)                                                   | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`            | `union(number, string, null)`           | いいえ      | undefined      | 正の整数（`W46` でパース — 数値または数値文字列を受け付ける）                                                                  | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`              | string\|array (MDH)                     | いいえ      | `[]` (出力) | `ml(q.skills) = FbK(H) ?? []` で正規化；`tools` とは異なり `*` ワイルドカードは**なし**                                                          | **C** strings:308120, 309075                |
| 12  | `initialPrompt`       | string                                  | いいえ      | undefined      | 空白のみ → undefined；**メインセッション**（`--agent` / settings経由）のエージェントとしてのみ自動送信、サブエージェントとしては無視     | **C** strings:308120, 309075                |
| 13  | `memory`              | string                                  | いいえ      | undefined      | 列挙型 `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`          | string\|bool (eiH=EL8)                  | いいえ      | undefined      | `true` / `false` / `"true"` / `"false"` を受け付ける；truthy のみ `true` に正規化、それ以外は `undefined`                                     | **C** strings:308120, 309075                |
| 15  | `isolation`           | string                                  | いいえ      | undefined      | 列挙型 **のみ** `["worktree"]` (`["none","worktree"]` ではない — それはバックグラウンドセッション設定用の別のスキーマで strings:313284) | **C** strings:308120, 309075, 309076        |

反論を乗り越えた微妙な観察: `skills` は「オプション」ですが、DL7 の出力句は `...I !== void 0 && {skills: I}` であり、`ml(undefined)` は `[]` (非 undefined) を返すため、**最終的に出力されるレコードには、frontmatter がフィールドを省略した場合でも `skills: []` が含まれます**。これは下流の等価性チェックに影響するため、qwen-code 移植時のフラグとしてください。

### 15 以外の可能性のある追加フィールド

| #   | フィールド       | 型   | デフォルト   | 列挙型 / 制約                                                                                                                                                                                                                                                            | 確認                                     |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | string | undefined | 列挙型 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; 説明: `"@internal — display color in the agents UI"`; `_Y` 外の値はパース時に黙って削除される (DL7 は `...z && typeof z === "string" && _Y.includes(z) && {color: z}` を出力) | **C** strings:308120, 309075, \_Y インライン |

これは #4821 のリストを超えた **唯一** の新しいエージェント frontmatter フィールドです。検索されたが `Ig5` / `JL7` で**見つからなかった**フィールド: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (これらはすべてスキルスキーマ `bg5` または無関係の識別子にのみ現れました)。

### ローダー — ファイルと関数のマッピング

| 関心事                                                       | 関数                                                                                                                                                     | 場所               | 確認  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| トップレベルレジストリアセンブラ                                  | `QL` (エクスポート名 `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| ファイルシステムウォーカー（スキル/コマンド/出力スタイルと共有） | `Gm` (`h6` でメモ化)                                                                                                                                     | strings:312887         | **C** |
| ファイルごとの `.md` 発見                                           | `d_q` (= `loadMarkdownFiles`, ripgrep 使用 `--files --hidden --follow --no-ignore --glob *.md`, 3 秒 `AbortSignal.timeout`, フォールバック `wY3` は `__("true")` 時) | strings:312887         | **C** |
| ファイルごとのパーサー (markdown)                                    | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| ファイルごとのパーサー (JSON)                                        | `fL7` (= `parseAgentFromJson`)、`JL7` スキーマ使用                                                                                                            | strings:309073         | **C** |
| プラグインエージェントローダー                                           | `b0_` → ディレクトリごと `oR7` → ファイルごと `sR7`                                                                                                                       | strings:308780, 308779 | **C** |
| 組み込み                                                     | `naH()` — `[JqH=general-purpose, KL7=statusline-setup, …]` に加えて暗黙の `YI=fork` を出力                                                                     | strings:309073, 308663 | **C** |
| オーバーライドリゾルバ                                             | `DS()` (= `getActiveAgentsFromList`) — 解決順序を参照                                                                                                  | strings:309073         | **C** |
| キャッシュ無効化                                            | `u0_()` (= `clearAgentDefinitionsCache`) — `QL.cache` + `Gm.cache` をクリア                                                                                    | strings:309073         | **C** |
| FS ウォッチャー (chokidar)                                         | `s_T()` → `Q4_=s_T()` モジュール初期化時 (`WB6`)                                                                                                                 | strings:316417         | **C** |

`Gm("agents", _)` は3つの baseDir (`policySettings`, `userSettings`, `projectSettings`) を読み込み、各々をレコードにタグ付けし、**inode** で重複排除します（シンボリックリンク/ハードリンクからの同一 inode の重複を削除し、`Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)` をログ出力）。テレメトリ: `tengu_dir_search` で `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`。

### 解決順序 — 決定的な優先順位

関数 `DS()` は入力を `source` でフィルタリングし、固定順序の配列を `agentType` をキーとする `Map` にイテレートします。`Map.set` は上書きするため、**最後に触れたバケットが優先されます**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  最高優先順位
```

| ソース            | 起点                                                                                                                                                                            | オーバーライド優先度 | 確認                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `built-in`        | `naH()` (バイナリにハードコード)                                                                                                                                                     | 1 (最低)        | **C** strings:309073              |
| `plugin`          | `b0_` → プラグインごとの `agentsPath`/`agentsPaths`                                                                                                                                     | 2                 | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` または `~/.claude`)                                                                                                                          | 3                 | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` に加えて `iV_()` がホームディレクトリ / git ルートまで遡る                                                                                                                | 4                 | **C** strings:312887, iV\_ インライン |
| `flagSettings`    | `--agents <json>` CLI フラグ (スキーマ `qKO = h.record(h.string(), JL7())`)                                                                                                           | 5                 | **C** strings:330190, 309076      |
| `policySettings`  | システム管理ディレクトリ: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (最高)       | **C** strings:307649 (H2), 312887 |

衝突は**黙って**解決されます — `tengu_plugin_name_collision` テレメトリイベントのみが発生します (`winner_source: T.at(-1)`); ユーザーに "X overrides built-in" という警告は表示されません。(strings:308742 `hMH`。)

微妙な動作: `iV_()` は `cwd` から**最も内側を最初に**遡りますが、Map.set は最後にセットしたものが優先されるため、projectSettings 内では**外側のツリー `.claude/agents/` が内側のツリーよりも優先されます**。これは驚くべき動作です — 未解決問題としてフラグしてください。

### Frontmatter パーサー

| 質問                                                   | 回答                                                                                                                                                                                                                                         | 確認                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 使用ライブラリ?                                              | **なし** — 手書きスプリッター `lz` が `Bun.YAML.parse` を呼び出し（ラッパー `l5H` 経由）。バイナリ内に `gray-matter`、`js-yaml`、`front-matter` はなし。                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML エラー) |
| 正規表現                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| 失敗処理                                           | YAML パース失敗 → タブをスペース2つに置き換えて再試行；それでも失敗した場合、`Failed to parse YAML frontmatter in <file>: <err>` を warn ログに出力し、`{frontmatter: {}, content: body}` を返す（決してスローしない）                                     | **C** strings:307905, 151839                                      |
| 本文抽出                                            | クロージング `---` の後のプレーン文字列スライス `H.slice(K[0].length)`；後で `v$H` で正規化（おそらく先頭改行削除）                                                                                                                        | **C** strings:307905                                              |
| エージェント/スキル/コマンド/出力スタイル間で共有? | **はい** — 同じ `lz` が `Iq_` (スキルローダー)、`f13` (非推奨コマンドローダー)、および `Gm` → `d_q` を介したエージェントローダーで再利用                                                                                                                  | **C** strings:312690                                              |
| スキーマバリデーター                                           | **Zod v4** (バンドル済み)。v4 特有のマーカー `looseObject`、`treeifyError`、`prettifyError`、`toJSONSchema` が存在                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| バリデーションモード                                            | **シャドウ** — `ahH("agent", frontmatter)` は `ug5.agent().strict().safeParse()` をテレメトリ用にのみ実行；DL7 は結果を無視し、独自のフィールドごとのバリデーションを進める。寛容な frontmatter オブジェクトがランタイムの信頼できる情報源である。 | **C** strings:308120 (ahH/ug5), 309074 (DL7 は呼び出すが無視)    |
| テレメトリイベント                                           | `tengu_frontmatter_shadow_unknown_key`、`tengu_frontmatter_shadow_mismatch` (プロセス内 `Set A37` で重複排除)                                                                                                                                 | **C** strings:154634, 154636                                      |
### 配线 — Agent 工具 + CLI 标志

| 层级                          | 功能                                                                                                                                                                       | 确认                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 任务/Agent 工具模式 (`$_3`) | 声明 `subagent_type: string.optional()`；省略时，回退到 `general-purpose`（如果 `AI()` 返回 true 则为 `fork`）                                                      | **C** strings:~309220        |
| Subagent 查找                | `activeAgents.find(a => a.agentType === requestedType)` 针对 `toolUseContext.options.agentDefinitions.activeAgents`                                                             | **C** strings:~309220        |
| 模糊回退                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`；模糊匹配 → `AgentTypeError`；明确重新匹配 → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| 权限门                | `lV_(toolPermissionContext, "Task", agentType)` — 拒绝 → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| 系统提示来源           | Markdown 正文变为 `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — 闭包在解析时捕获                                  | **C** strings:309074-6 (DL7) |
| 主线程渲染             | `Pp({mainThreadAgentDefinition, …})` — 如果 agent 有 `appendSystemPrompt: true`（内置的 `claude` 通配符），则将正文追加到默认提示后；否则 **替换** 默认提示      | **C** strings:311015         |
| `--agent <name>` CLI           | 通过 Commander 声明；动作处理函数 `if(I) process.env.CLAUDE_CODE_AGENT = I;` — 存入环境变量，在其他地方读入 `appState.agent`。也记录在 pid 文件中。          | **C** strings:330190, 142138 |
| `--agents <json>` CLI          | 单独的标志；JSON 记录 `{name: {description, prompt, …}}` 通过 `qKO = h.record(h.string(), JL7())` 验证；加入相同的 `activeAgents` 注册表，`source: flagSettings` | **C** strings:330190, 309076 |

### 生命周期 — 冷加载 + 热重载

| 方面                          | 行为                                                                                                                                                                                                                  | 确认                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 冷加载                       | 惰性加载 — `QL` 通过 `h6`（缓存包装器）进行记忆化；首次访问读取文件系统 + 插件，后续访问返回缓存                                                                                               | **C** strings:309076         |
| 热重载机制            | **chokidar 监视器** `s_T()` 在模块初始化时注册（`WB6`）；监视 `.claude/agents`（用户 + 项目）以及 skills 和 commands 目录                                                                                      | **C** strings:316417         |
| 监视器标志                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4`（macOS true），事件 `add`/`change`/`unlink` | **C** strings:316417         |
| 防抖                        | 300 ms（`l_T = 300`）；处理函数调用 `RIH(), Vv(), u0_(), …` — `u0_()` 使 agent 缓存失效                                                                                                                              | **C** strings:316417, 309073 |
| 自适应轮询                | 活动状态 = `n_T = 2000 ms` 间隔；空闲状态（无交互 `r_T = 60000 ms`）→ `i_T = 30000 ms`；切换时重新创建 chokidar 实例                                                                                   | **C** strings:316417         |
| `/agents` 斜杠命令         | `local-jsx` UI 用于管理 agent（库/创建/编辑/删除/运行）— **不是**重新扫描命令                                                                                                                             | **C** strings:314593         |
| `/reload-plugins` 斜杠命令 | 重新运行 `QL(W8())`，重新计数 agent；覆盖插件来源的 agent（chokidar **未**监视）                                                                                                                         | **C** strings:314595, 190948 |
| 其他失效路径        | `clearSessionCaches`（由 `/clear` 使用）也会调用 `u0_()`                                                                                                                                                                 | **C** strings:313246         |

### 待解决问题（第一阶段）

| #   | 问题                                                                                                                                  | 确认  | 解决路径                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | `color` 在 #4821 中被遗漏是有意的（它是 `@internal`）还是疏忽？                                                            | **O** | 视为**有意** — 保留该字段，但标记为内部/仅 UI 使用  |
| Q2  | DL7 的宽松行为（background 接受字符串，maxTurns 接受字符串）是文档化的面向用户特性还是向后兼容的 hack？ | **O** | 为保持一致性而镜像，但在移植文档中给出警告                             |
| Q3  | 为什么 `isolation` 枚举 `["worktree"]` 仅用于 agent，而 background-session 设置模式接受 `["none","worktree"]`？        | **O** | 可能“无隔离” = 省略字段；明确记录              |
| Q4  | `--agents <json>`（flagSettings）是否故意位于优先级 5（高于项目，低于策略）？                                    | **O** | qwen-code 可以在 v1 中跳过该标志，推迟决定                   |
| Q5  | `iV_` 的最内层优先推入 + Map.set 最后写入获胜 → **外层树获胜** 在 projectSettings 冲突中。是陷阱还是有意为之？           | **O** | qwen-code 应选择**最内层优先**语义以避免陷阱 |

---

## 第二阶段 — qwen-code 的实现计划

### 当前状态 — 一段概览

qwen-code 已经提供了相当完善的子代理基础设施：
`SubagentManager`（`packages/core/src/subagents/subagent-manager.ts`）
实现对 `.qwen/agents/`（项目）和 `~/.qwen/agents/`（用户）中的 markdown+YAML 前置数据文件进行 CRUD 操作，基于一个自定义 YAML 解析器
（`packages/core/src/utils/yaml-parser.ts` — 不依赖 `gray-matter` / `yaml`，由 `package.json` 确认）。`SubagentConfig`
（`packages/core/src/subagents/types.ts:41-122`）已经包含 `name`、
`description`、`tools`、`disallowedTools`、`approvalMode`、`systemPrompt`、
`model`、`runConfig`、`color`、`background`。`SubagentLevel` 已经支持五个
作用域（session、project、user、extension、builtin），优先级顺序为
`session > project > user > extension > builtin`
（`subagent-manager.ts:189-220`）。Agent 工具
（`packages/core/src/tools/agent/agent.ts`）声明了 `subagent_type` 并
通过 `subagentManager.changeListener` 动态刷新其模式枚举。
一个 `convertClaudeAgentConfig()` 桥接器已经存在于
`packages/core/src/extension/claude-converter.ts:162-220`，包含工具名称
映射和 `permissionMode → approvalMode` 映射。**差距**在于：
(a) 模式中缺少 #4821 的 8 个字段（`effort`、`permissionMode` 作为一等公民、
`mcpServers`、`hooks`、`maxTurns` 作为顶层字段、
`skills`、`initialPrompt`、`memory`、`isolation`）；
(b) 没有 `--agent <name>` CLI 标志；
(c) 没有 chokidar 风格的热重载（存在扩展风格的失效机制，但不针对文件系统代理）；
(d) `maxTurns` 当前嵌套在 `runConfig.max_turns` 下 — 需要按照 #2409 提升为顶层字段。

### 架构决策

#### D1. 为前置数据复用现有的 yaml-parser

**决定：** 复用 `packages/core/src/utils/yaml-parser.ts`（已被
`SubagentManager.parseSubagentContent` 和技能加载器使用）。
**理由：** Claude Code 的 `lz` 是技能、命令和 agent 共用的同一个解析器；
qwen-code 已经镜像了该模式。添加 `gray-matter` 或 `js-yaml` 是不必要的变动。现有的解析器处理 `--- … ---` 分割，并在输入格式错误时保持静默（与 `lz` 的 `warn-and-return-empty` 姿态一致）。

#### D2. 解析/优先级顺序

**决定：** 使用 `session > project (.qwen/agents/) > user (~/.qwen/agents/) >
extension > builtin` — 即**保留现有的 qwen-code SubagentLevel 顺序，v1 中不要镜像 Claude Code 的 `flagSettings`/`policySettings` 桶**。
**理由：** Claude Code 的 policySettings（受管目录）是企业部署场景，
qwen-code 没有。标志注入的 agent（`--agents <json>`）是高级用户功能，
可以在 P4 引入。现有的 qwen-code 五级优先级已经覆盖了 #4821 关心的用例：
项目覆盖用户，用户覆盖内置。`extension` 层级可以干净地插入用户和内置之间。

#### D3. 验证 — 保留现有的 SubagentValidator

**决定：** 扩展 `SubagentValidator`（`packages/core/src/subagents/`）
以验证八个新字段。**不要**引入 zod，除非 skillManager 的管道已经使用它；
如果现有验证器是手写的，就保持手写。
**理由：** Claude Code 的 `Ig5` 只是影子 — 运行时验证是手写的 `DL7`。
匹配该模式可以保持错误信息可读（例如 `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`），
同时不引入额外的依赖。如果 skillManager 已经使用 zod，则为了保持一致性遵循该选择 — 在 P1 准备阶段通过阅读技能代码来确定。

#### D4. 热重载 — 推迟；依赖冷加载 + 显式重新加载

**决定：** v1 **不**提供 chokidar 监视器。缓存失效钩子已经存在（`subagentManager` 有 `changeListener` 和显式的 CRUD 驱动刷新）。项目级别的重新加载在会话启动时发生；会话内的编辑通过 `/agents` UI 触发失效。一个 `/reload-agents`（或挂载到 `/reload-plugins`）斜杠命令可以在 P4 中根据用户需求引入。
**理由：** 通过文件系统监视器进行热重载成本较高（chokidar 添加了一个具有自适应调度机制的轮询循环 — Claude Code 的实现本身就有约 150 行簿记代码）。启动时冷加载对 v1 来说已经足够，并且与当前 `SubagentManager` 的连接方式一致。为 P4 留出空间。

#### D5. 连接 `--agent <name>` CLI 标志 — v1 纳入范围

**决定：** 将 `--agent <name>` 添加到 `packages/cli/src/config/config.ts` 的 CliArgs 中。行为：针对解析后的注册表进行查找，将 agent 设为主线程 agent，如果名称无法解析则抛出清晰的错误。匹配 Claude Code 语义（除非 agent 有 `appendSystemPrompt: true`，否则替换默认系统提示）。**不**使用 `CLAUDE_CODE_AGENT` 环境变量间接引用 — qwen-code 的 `Config` 对象可以直接携带它。
**理由：** 这是 #4821 的用户面向操作点 — 没有它，声明式 agent 只能通过 Agent 工具的 `subagent_type` 参数访问，这对于“设置我的默认 agent”用例来说太间接了。`--agents <json>`（复数）可以推迟到 P4。

#### D6. Workflow.agentType 协调 — 接口契约

**决定：** 提供一个稳定的解析器接口，当 PR #4732 的 `createProductionDispatch` 落地时可以调用。具体来说：

| 契约                                                                                                                                                                                                                                                                                                     | 负责人                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 前置数据 `name` 就是 workflow 的 `agentType` 字符串（键相等，区分大小写）                                                                                                                                                                                                                         | 本 PR              |
| Workflow 的硬编码 `disallowedTools` 下限（`[SEND_MESSAGE, EXIT_PLAN_MODE]`，镜像自上游 `Tg8`；在 PR #4732 中验证为 `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`）**与** agent 级别的 `disallowedTools` 进行 **并集** — 下限始终应用，即使 agent 定义设置了 `tools` | workflow PR 消费方 |
| 每次调用的 `opts.isolation` 覆盖每个 agent 的 `isolation: 'worktree'` 默认值                                                                                                                                                                                                                                | workflow PR 消费方 |
| agent 定义中的 `model`、`effort`、`permissionMode`、`maxTurns` 在设置时覆盖 workflow 默认值                                                                                                                                                                                                    | workflow PR 消费方 |
| agent 正文成为子代理的 `systemPrompt`；当 `agentType` 无法解析时，workflow 的 `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` 是回退                                                                                                                                                             | workflow PR 消费方 |
| 当 `agentType` 未设置或解析失败时，workflow 回退到内置的 workflow 子代理（优雅处理，不抛出）                                                                                                                                                                                        | workflow PR 消费方 |

**#4721 / #4821 矛盾的解决**（`tools` 与 `disallowedTools` 优先级）：此移植将 agent 注册表编写为使得 `disallowedTools` **始终与 `tools` 分开携带**。#4821 表格中的“如果设置了 tools 则忽略”规则由 **Agent 工具调用方**执行（即在构造子代理的 `ToolConfig` 时），而不是在解析时。这允许 workflow 始终将其下限与 `disallowedTools` 进行并集，无论 agent 是否设置了 `tools`。agent 注册表是一个**哑数据载体**；优先级规则位于调度点。这解决了 #4821 的“忽略”规则与 #4721 的“并集”规则之间的明显冲突。

**工具名称规范化：** 使用 `ToolNames.SEND_MESSAGE` 和 `ToolNames.EXIT_PLAN_MODE`（根据 PR #4732 差异验证），作为从 `packages/core/src/agents/runtime/workflow-orchestrator.ts`（一旦落地）导出的具名常量。声明式 agent 移植本身不需要导入这些 — 它们是 workflow 的下限，在 workflow 调度点应用。

### 模块布局

| 路径                                                               | 新/已修改 | 用途                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **已修改**   | 向 `SubagentConfig` 添加 8 个新字段：`effort`、`permissionMode`（已通过 `approvalMode` 映射 — 两者都保留？见下面 D7）、`mcpServers`、`hooks`、`maxTurns`（提升为顶层，废弃 `runConfig.max_turns`）、`skills`、`initialPrompt`、`memory`、`isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **已修改**   | 扩展 `parseSubagentContent` / `serializeSubagent` 以支持新字段的往返；扩展 `SubagentValidator` 调用                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts`（假定路径） | **已修改**   | 添加与 DL7 错误信息匹配的逐字段验证：`Agent file <path> has invalid permissionMode '<x>'. Valid options: …` 等。                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **新**       | 枚举常量的单一事实来源：`EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES`。逐字镜像 Claude Code 2.1.168。                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **已修改**   | 新字段默认值为 undefined；行为不变                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **已修改**   | 在构建子代理选项时从解析后的 `SubagentConfig` 读取新字段（`model`、`maxTurns`、`permissionMode`、`effort`）；为 #4721 配置 `isolation` 每次调用的覆盖语义                                                                              |
| `packages/cli/src/config/config.ts`                                | **已修改**   | 添加 `--agent <name>` 标志；启动时针对 `SubagentManager` 解析；如果名称无法解析则报错                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **已修改**   | `--agent` 标志解析 + 错误路径的测试                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **已修改**   | 在导入 Claude `.md` 文件时为新增字段添加映射（`mcpServers`、`hooks`、`maxTurns` 顶层、`memory`、`isolation` 等）                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **新**       | 枚举列表的快照测试；往返解析/序列化测试                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **已修改**   | 新字段验证、优先级、错误信息的测试                                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **已修改**   | 新字段连接到子代理运行时的测试                                                                                                                                                                                                                        |
| `docs/cli/agents.md`（如果存在）或 `docs/declarative-agents.md`   | **新**       | 面向用户参考：16 字段模式 + 示例                                                                                                                                                                                                                         |
### D7. permissionMode vs approvalMode — ブリッジとして機能させ、置き換えない

**決定:** frontmatter において `permissionMode` (Claude 互換) と既存の
`approvalMode` (qwen 互換) の**両方**を受け入れる。パース時、`permissionMode`
が設定されている場合、`claude-converter.ts:195-208` の既存テーブル
(`default → default`, `plan → plan`,
`acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`)
を使用して `approvalMode` にマッピングする。
両方が指定されている場合、`approvalMode` が優先され (qwen-code により特化)、
両方が設定されたことを示す `tengu_frontmatter_shadow_*` 形式のテレメトリイベントを発行する。
**根拠:** `approvalMode` を使用する既存の `.qwen/agents/*.md`
との後方互換性を維持しつつ、Claude Code の `permissionMode` をそのまま受け入れることで、
ユーザーが Claude Code エージェントファイルを変更せずにそのまま利用できるようにする。

### スキーママッピングテーブル

| Claude Code 2.1.168 フィールド | qwen-code フィールド                         | 適合方法                                                                                                   | 備考                                                                                                        |
| ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `name`                         | `name`                                       | なし                                                                                                       | 同一、必須                                                                                                  |
| `description`                  | `description`                                | なし                                                                                                       | 同一、必須                                                                                                  |
| `model`                        | `model`                                      | `inherit`, `fast`, `haiku`, `sonnet`, `opus`、または `authType:model-id` を受け入れる                       | qwen-code はすでに広い語彙をサポート；`inherit` は新規                                                       |
| `tools`                        | `tools`                                      | 文字列\|配列を受け入れる；`*` → undefined (すべて継承)                                                       | 配列としてはすでにサポート済み；文字列 + `*` の処理を追加                                                    |
| `disallowedTools`              | `disallowedTools`                            | 文字列\|配列を受け入れる；**常に `tools` とは別に保持**                                                       | 優先順位ルール (#4821 "toolsが設定されている場合は無視") は**呼び出し元**が適用、パーサーは適用しない           |
| `effort`                       | `effort` (新規)                              | 列挙型 `low/medium/high/xhigh/max` + 整数；エイリアス `med → medium`                                         | ランタイムでの効果は qwen 固有 (既存の thinking-effort ノブにマッピング可能な場合はマッピング、それ以外は保存して無視) |
| `permissionMode`               | `permissionMode` (新規) + `approvalMode` へのブリッジ | 列挙型 `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`；マッピングテーブルは D7 に従う              | Claude 形式をそのまま受け入れる                                                                              |
| `mcpServers`                   | `mcpServers` (新規)                          | (文字列 \| `{name: spec}`) の配列；要素ごとに検証、不正な要素は警告とともに削除                             | P4 で MCP ランタイムに配線                                                                                  |
| `hooks`                        | `hooks` (新規)                               | settings.json の hooks 形状と一致するオブジェクト                                                              | P4 でフックランタイムに配線                                                                                  |
| `maxTurns`                     | `maxTurns` (新規トップレベル)                  | 正の整数；互換性のため数値文字列も受け入れる                                                                 | **`runConfig.max_turns` から昇格**；ネスト形式は非推奨エイリアスとして維持                                    |
| `skills`                       | `skills` (新規)                              | スキル名の配列；カンマ区切りの文字列も受け入れる                                                                 | ランタイム: エージェント起動時に skillManager 経由でプリロード                                               |
| `initialPrompt`                | `initialPrompt` (新規)                       | 文字列；空白のみ → undefined；メインセッションがエージェントの場合のみ発火                                      | `--agent` フラグ経由で配線                                                                                   |
| `memory`                       | `memory` (新規)                              | 列挙型 `user/project/local`；`.qwen/agent-memory/<name>/` などからロード                                       | ランタイムは P4                                                                                             |
| `background`                   | `background`                                 | 真偽値または文字列 `"true"/"false"` を受け入れる；真と見なせる値のみ true                                        | すでにサポート済み；パースルールを緩和                                                                      |
| `isolation`                    | `isolation` (新規)                           | 列挙型 **のみ** `["worktree"]`                                                                           | ランタイムはワークフロー PR (#4732 P3+) が担当；レジストリはフィールドを運ぶのみ                             |
| `color` (ドキュメント未記載 #16) | `color`                                      | 列挙型 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`；範囲外の値は警告なしで破棄 | qwen `SubagentConfig` にはすでに存在；Claude Code 許可リストに一致するようバリデーションを強化                |

### TDD テスト計画

| チャンク                         | テストファイル                               | アサート内容                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| スキーマ列挙型定数               | `agent-frontmatter-schema.test.ts` (新規)     | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` が Claude Code 2.1.168 とバイト単位で一致すること (スナップショット)                                      |
| パーサー — 正常系                | `subagent-manager.test.ts`                   | `.qwen/agents/test.md` を全16フィールドでラウンドトリップパース → 出力レコードが期待される形状を持つこと                                                                                             |
| パーサー — 必須フィールド        | `subagent-manager.test.ts`                   | `name` がない場合 null + 警告ログ；`description` がない場合 null + 警告ログ                                                                                                                         |
| パーサー — 列挙型バリデーション  | `subagent-manager.test.ts`                   | 不正な `permissionMode` / `memory` / `isolation` / `effort` / `color` はそれぞれ特定の警告 (DL7 の文言に一致) を発行し、フィールドは破棄される                                                           |
| パーサー — 寛容なフィールド型  | `subagent-manager.test.ts`                   | `background: "true"` → `true`；`maxTurns: "5"` → `5`；`effort: "med"` → `"medium"`；`tools: "Read,Edit"` → `["Read","Edit"]`；`tools: "*"` → undefined                                     |
| パーサー — color 許可リスト     | `subagent-manager.test.ts`                   | `color: "magenta"` は警告なしで破棄される (エラーにならない)、`color: "blue"` は保持される                                                                                                          |
| Skills フィールドの特異性        | `subagent-manager.test.ts`                   | `skills` を省略すると `skills: []` になる (Claude Code DL7 の出力動作と一致)                                                                                                                        |
| 解決優先順位                     | `subagent-manager.test.ts`                   | プロジェクト + ユーザーで同じ `name` → プロジェクトが優先；ユーザー + 組み込み → ユーザーが優先；拡張機能 + 組み込み → 拡張機能が優先                                                                  |
| inode 重複排除                   | `subagent-manager.test.ts`                   | シンボリックリンクで同じ inode を指す2つのパス → レコードは1つのみ、ログを発行                                                                                                                          |
| permissionMode ブリッジ          | `subagent-manager.test.ts`                   | `permissionMode: bypassPermissions` → 解決後 `approvalMode: yolo`；両方設定 → `approvalMode` が優先 + テレメトリ                                                                                     |
| `--agent` CLI フラグ            | `packages/cli/src/config/config.test.ts`     | フラグがメインスレッドエージェントを設定；未解決の名前は `Agent type '<x>' not found. Available agents: …` でスロー                                                                                    |
| エージェントツールの曖昧フォールバック | `agent.test.ts`                             | `subagent_type: "Test_Engineer"` が NFKC 小文字正規化により登録済みの `test-engineer` に解決される                                                                                                 |
| エージェントツール未検出エラー   | `agent.test.ts`                              | 未解決の `subagent_type` → エラーメッセージが `Agent type '<x>' not found. Available agents: <list>` と一致すること                                                                                   |
| ワークフロー契約                 | `agent-frontmatter-schema.test.ts`           | エクスポートされた `getAgentByName(name)` インターフェースが `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` を含む完全な SubagentConfig を返すこと (ワークフロー PR #4732 で利用可能) |

### フェーズ別 PR 計画

| フェーズ | タイトル                                                                                                                            | スコープ                                                                                                                                                     | ブロックするもの                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | `SubagentConfig` にフィールドを追加；パーサー + バリデーター + シリアライザーを拡張；`runConfig.max_turns` を非推奨化；列挙型定数モジュールを追加；テスト      | なし                               |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                       | `model`, `effort`, `maxTurns`, `permissionMode`/`approvalMode` ブリッジを `AgentTool.execute()` → `AgentHeadless.create()` 呼び出しサイトに配線；テスト        | P1                                 |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                         | `CliArgs` に `--agent <name>` を追加；起動時に解決；エラーパス；テスト                                                                                      | P1                                 |
| **P4** | (オプション、スコープ拡大) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                    | 4つの「v1 ではメタデータのみ」のフィールドを実際のランタイム効果に配線                                                                                          | P1、および skill/MCP/hook サブシステム |

各 PR のデルタは 800 LOC 以下 (テストを除く)。P1 が最大でバリデーター + テストで約 600 LOC。

---

## フェーズ 3 — ワークフローポート (#4721 / PR #4732) との連携マトリックス

| 宣言的エージェント機能                                                     | ワークフローとの相互作用                                                                                                                                                                   | オーナー                                                           | ブロックされる条件                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| `name` フィールド (レジストリキーとして)                                       | ワークフローの `opts.agentType` 検索文字列 ([#4721][i4721] で明示)                                                                                                                            | **本 PR** がレジストリ契約を定義；**ワークフロー PR** が消費         | なし — レジストリ形状は先に安定化可能            |
| `disallowedTools` フィールド (エージェント上)                                  | ワークフローがハードコードされた下限 `[SEND_MESSAGE, EXIT_PLAN_MODE]` と UNION する ([#4721][i4721] §2 — PR #4732 diff で確認: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **本 PR** がフィールドを運ぶ；**ワークフロー PR** がディスパッチ時に UNION | ワークフロー PR #4732 P3 がランドする           |
| `tools` フィールド (エージェント上)                                            | ワークフローがそのままサブエージェントの `ToolConfig.tools` に渡す                                                                                                                             | **本 PR** がフィールドを運ぶ；**ワークフロー PR** が配線             | ワークフロー PR #4732 P3                         |
| `model` フィールド (エージェント上)                                            | ワークフローの `opts.model` が呼び出しごとに上書き；エージェントの `model` はデフォルト                                                                                                         | **本 PR** がフィールドを運ぶ；**ワークフロー PR** が優先順位を解決 | ワークフロー PR #4732 P3                         |
| `effort` フィールド (エージェント上)                                           | ワークフローの呼び出しサイトでの上書きが優先；エージェントデフォルトにフォールバック                                                                                                             | **本 PR** がフィールドを運ぶ；**ワークフロー PR** が解決             | ワークフロー PR #4732 P3                         |
| `permissionMode` フィールド (エージェント上)                                    | ディスパッチ時にサブエージェントの approvalMode にマッピング；ワークフローの呼び出しサイトでの上書きが優先                                                                                        | **本 PR** が D7 ブリッジ経由でフィールドを運ぶ；**ワークフロー PR** が配線 | ワークフロー PR #4732 P3                         |
| `maxTurns` フィールド (エージェント上)                                          | エージェントが設定した場合、ワークフローのハードコード `WORKFLOW_SUBAGENT_MAX_TURNS = 50` を置き換える                                                                                         | **本 PR** がフィールドを運ぶ；**ワークフロー PR** が優先順位を解決 | ワークフロー PR #4732 P3                         |
| `isolation: 'worktree'` フィールド (エージェント上)                             | デフォルト；呼び出しごとの `opts.isolation` が上書き ([#4721][i4721] §3)                                                                                                                       | **本 PR** がフィールドを運ぶ；**ワークフロー PR** がランタイムを所有 | ワークフロー PR #4732 P3+ (P1 では現在スロー) |
| `initialPrompt` フィールド (エージェント上)                                     | ワークフローは**使用しない** (`--agent` でメインセッションがエージェントの場合のみ発火)                                                                                                          | **本 PR** + **CLI**                                               | なし (独立)                                   |
| `memory`, `mcpServers`, `hooks`, `skills`                                  | ワークフローは特別な処理をせず、サブエージェントランタイムにそのまま渡す                                                                                                                        | **本 PR** がフィールドを運ぶ；ランタイム配線は P4 / 将来           | 将来の PR                                   |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS` の更新                                     | ワークフロー PR #4732 がセットに `WORKFLOW` を追加する (issue/PR コンテキスト発見による — ただし、敵対的反論により、これは `main` の `agent-core.ts` にはまだなく、worktree のみにあることに注意) | **ワークフロー PR** が所有；本 PR は触れない                      | なし                                           |
| ワークフロー下限のツール名正規形 (`ToolNames.SEND_MESSAGE`)          | 本 PR は下限定数をインポートしない；`disallowedTools` 文字列を記述されたまま運ぶのみ。正規化はワークフロー PR が担当。                                                                            | **ワークフロー PR**                                               | ワークフロー PR #4732                          |
| 出荷順序                                                               | 本 PR (P1+P2+P3) はワークフローとは独立して出荷可能。ワークフロー PR #4732 P3 は、本 PR の `getAgentByName()` のようなリゾルバーがインポート可能であることに依存。                               | ワークフロー P3 まで並行可能                                     | ワークフロー P3 は本 PR のエクスポートを読み取る |

**循環ブロッキングなし:** 本 PR とワークフロー PR は P1/P2 フェーズを並行してランド可能。同期はワークフロー P3 で行われ、これには本 PR のレジストリリゾルバーが必要。本 PR が先にランドした場合、ワークフロー P3 はそれを読み取る。ワークフロー PR が先にランドした場合、既存の `subagent_type` ルックアップ (ミス時はワークフローデフォルトを返す) で出荷し、本 PR がランドした後でよりリッチなリゾルバーに切り替える。

---

## フェーズ 4 — リスクと未解決の質問

### リスク

| # | リスク                                                                                                                                                                                               | 緩和策                                                                                                                                                        |
|---| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 | Claude Code のマイナーリリース間 (2.1.168 → 2.1.x) でのスキーマドリフト                                                                                                                                | 列挙型定数モジュールを "verified against 2.1.168" という doc comment で固定；新しいリリースに対して `feature-reverse` スキルの一部として文字列 grep を再実行       |
| R2 | `runConfig.max_turns` → トップレベル `maxTurns` は既存の `.qwen/agents/*.md` ファイルに対する破壊的スキーマ変更                                                                                       | ネスト形式を非推奨エイリアスとして1サイクルの非推奨期間で維持；パース時に警告を発行、CHANGELOG に記載                                                             |
| R3 | `permissionMode` ↔ `approvalMode` のラウンドトリップで情報損失 (Claude は6モード、qwen は4程度)                                                                                                      | D7 に従って双方向に明示的にマッピング；両方設定時にテレメトリを発行；保存時に警告なしで書き換えない                                                             |
| R4 | 新しいフィールド (`hooks`, `mcpServers`, `skills`, `memory`) がレジストリに運ばれるが v1 ではランタイムなし → ユーザーが設定しても警告なく無視される可能性                                                 | v1 のスコープを明確に文書化；「運ばれるがまだランタイムがない」フィールドが空でない場合、エージェントごとに1回だけ情報ログを発行                                   |
| R5 | 敵対的検証で `EXCLUDED_TOOLS_FOR_SUBAGENTS` に `main` では `WORKFLOW` が含まれていないことが判明 — ワークフローポートがまだマージされていないか、再帰的ファンアウトガードが欠落している可能性                         | ワークフロー PR の作者 (LaZzyMan = 自己) と確認し、そのガードが本ポートではなく PR #4732 でランドされることを確認                                                  |
| R6 | 外側のツリーが内側のツリーに勝つプロジェクト設定動作 (Q5) をミラーリングすると危険                                                                                                                   | qwen-code は**内側優先**を明示的に選択；R5 フィクスチャでテスト済み                                                                                           |
| R7 | `color` フィールドはバイナリの describe テキストで `@internal` として文書化されている — Anthropic が明示的にサポートしていないものを移植している可能性                                              | 移植するが、qwen-code のドキュメントでも `@internal` とマーク；UI のみとして扱い、ユーザー向けリファレンスドキュメントには表示しない                             |
### 未解決事項 — 提案された方針

| #   | 質問                                                                                                                                                       | 解決方針                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | #4821 から `color` が意図的に除外されているか？                                                                                                            | **意図的なものとして扱う**。フィールドを移植するが、ユーザー向けドキュメントでは「利用可能、内部用」以外には言及しない。                                                                                                                                                                                                                              |
| Q2  | 寛容な DL7 の振る舞い：ドキュメント化するか、ハックとして残すか？                                                                                          | **そのままミラーする**。`background: "true"`、`maxTurns: "5"`、`effort: "med"` を、たとえ未ドキュメントでも互換性のために受け入れる。テストを追加する。                                                                                                                                                                                                |
| Q3  | エージェントスキーマとバックグラウンドセッションスキーマで isolation 列挙型が異なる理由は？                                                                 | **コードコメントに差異を記載**。「isolation なし」＝フィールド省略であり、列挙値ではない。                                                                                                                                                                                                                                                            |
| Q4  | `--agents <json>`（複数形、flagSettings）を v1 に含めるべきか？                                                                                            | **P4 に先送り**。パワーユーザー向けの CLI 面。v1 では `--agent <name>`（単数形）のみ出荷する。これが #4821 の対象である。                                                                                                                                                                                                                             |
| Q5  | ネストされた `.qwen/agents/` における内側ツリーと外側ツリーの優先順位は？                                                                                  | **最内優先**。Claude Code の誤った最外優先動作を上書きする。P1 にテストフィクスチャを用意。                                                                                                                                                                                                                                                           |
| Q6  | `tools` と `disallowedTools` の優先順位：#4821 では「tools が設定されている場合は無視」、#4721 では「ワークフローフロアとの和集合」                       | **レジストリは愚直なデータ**。パーサーは両方のフィールドを独立して保持する。優先順位ルールはディスパッチサイト（エージェントツール／ワークフロー）に存在する。矛盾を解決する。                                                                                                                                                                     |
| Q7  | ワークフローの disallowedTools フロアにおけるツール名の正規形式 — PR #4732 で確認済み：`ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`                  | **この PR の関心事ではない** — ワークフロー PR が所有する。調整マトリックスにのみ記録する。                                                                                                                                                                                                                                                            |
| Q8  | #2409 のクローズ解決は何かに影響するか？                                                                                                                    | **#2409 の「model + maxTurns をトップレベルに昇格させる」ガイダンスを継承する**。すでにこの計画に組み込まれている。                                                                                                                                                                                                                                      |
| Q9  | qwen-code の既存の `SubagentLevel` の優先順位において、`extension`レベルのエージェントを `builtin` の上（現状）に維持すべきか、下（Claude Code には同等なし）にすべきか？ | **`extension > builtin` を維持**。拡張機能はユーザーがインストールするもの、ビルトインはベンダーのデフォルト。ユーザーインストールが優先される。                                                                                                                                                                                                  |
| Q10 | #4821、#4721、#4732 の各 Issue は、本ドキュメントが提案する契約に対して完全に仕様化されているか？                                                          | **#4821 にコーディネーションコメントを投稿**し、本ドキュメントへのリンクと、フィールドごとの決定事項を要約し、メンテナーに以下の承認を求める：(a) Claude Code 2.1.168 の 16 フィールドとのスキーマ互換性、(b) D7 `permissionMode`/`approvalMode` ブリッジ、(c) D2 優先順位、(d) `tools`/`disallowedTools` 矛盾のレジストリ愚直データによる解決。 |

### コーディネーションのアクションアイテム

| #   | アクション                                                                       | 場所                                                |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| A1  | フィールドごとの要約 + 5 つの決定事項を #4821 に投稿し、メンテナーの承認を得る    | #4821 へのコメント                                  |
| A2  | 本ドキュメントを #4721 からクロスリンクし、フェーズ 3 マトリックスに言及する      | #4721 へのコメント                                  |
| A3  | 本移植の P1 が完了したら、#4732 に ping を送り、よりリッチなリゾルバーに切り替える | PR #4732 へのコメント（準備ができたら）             |
| A4  | 次の Claude Code マイナーリリースに対して strings-grep を再実行し、スキーマのずれを検出する | `feature-reverse` スキル cron ジョブ（それまでは手動） |