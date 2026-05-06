# Slash Command リファクタリングロードマップ

## 全体目標

Qwen の内部アーキテクチャスタイルを採用し、外部体験において Claude Code と 95% 一致する command プラットフォームを提供する。同時に、3つのモードの分断、コマンドソースの単一性、prompt command がモデルから呼び出せないという3つのコア問題を修正する。

---

## コア設計原則

1. **各 Phase は独立して ship 可能**：完了後の動作は自己完結しており、将来の Phase に依存せずに実行できる
2. **Phase 1 は純粋なインフラストラクチャ**：MCP_PROMPT の誤ったインターセプト修正を除き、既存の利用可能なコマンドセットは一切変更しない
3. **動作変更とアーキテクチャ変更を分離**：Phase 1 でアーキテクチャを構築し、Phase 2 で機能拡張を行う
4. **Claude Code の内部アーキテクチャをそのままコピーしない**：ただし、ユーザーが認識可能な機能面は揃える

---

## Phase 1：インフラストラクチャの再構築（純粋なアーキテクチャ、動作変更なし）

### 目標

統一されたコマンドメタデータモデルとクロスモード管理メカニズムを構築し、後続のすべての Phase に基盤を提供する。

### 機能ポイント

#### 1.1 `SlashCommand` メタデータモデルの拡張

既存の `SlashCommand` インターフェースに以下のフィールドを追加する：

**ソースフィールド**

- `source: CommandSource`：コマンドソースの列挙型（`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` など）
- `sourceLabel?: string`：表示用のソースラベル（例：`"Built-in"` / `"MCP: github-server"`）

**モード機能フィールド**

- `supportedModes: ExecutionMode[]`：利用可能な実行モードを宣言（`interactive` / `non_interactive` / `acp`）

**実行タイプフィールド**

- `commandType: CommandType`：実行タイプを宣言（`prompt` / `local` / `local-jsx`）

**可視性フィールド**

- `userInvocable: boolean`：ユーザーが slash command 経由で呼び出せるか（デフォルト `true`）
- `modelInvocable: boolean`：モデルが tool call 経由で呼び出せるか（デフォルト `false`）

**補助メタデータフィールド**（Phase 3 用に予約。Phase 1 では定義のみで未使用）

- `argumentHint?: string`：引数ヒント（例：`"<model-id>"` / `"show|list|set"`）
- `whenToUse?: string`：コマンド呼び出しのタイミング説明（モデル用）
- `examples?: string[]`：使用例

#### 1.2 Loader による source/commandType フィールドの埋め込み

各 Loader は `SlashCommand` 構築時に `source` と `commandType` を必ず埋め込む必要がある：

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | 各コマンドの宣言による（`local` / `local-jsx`） |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader`（ユーザー/プロジェクト） | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader`（プラグイン）      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 組み込みコマンドによる `supportedModes` と `commandType` の宣言

すべての built-in コマンドに対して明示的に宣言する：

- `commandType`：`local`（UI 依存なし）または `local-jsx`（dialog/React 依存）
- `supportedModes`：`local` 系コマンドは `['interactive', 'non_interactive', 'acp']` を宣言。`local-jsx` 系コマンドは `['interactive']` を宣言。

#### 1.4 ハードコードされたホワイトリストを capability-based フィルタに置き換え

- `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` 定数を削除
- `filterCommandsForNonInteractive` 関数を削除
- `filterCommandsForMode(commands, mode)` 関数を追加し、`supportedModes` フィールドに基づいてフィルタリング
- `getEffectiveSupportedModes(cmd)` ユーティリティ関数を追加（`CommandKind` のデフォルト戦略を考慮）
- `handleSlashCommand` / `getAvailableCommands` 関数のシグネチャを変更し、`allowedBuiltinCommandNames` パラメータを削除

#### 1.5 CommandService を統一 Registry にアップグレード

- `getCommandsForMode(mode: ExecutionMode)` メソッドを追加
- `getModelInvocableCommands()` メソッドを追加（Phase 2/3 で使用。Phase 1 ではインターフェースのみ提供）
- 既存の `getCommands()` は変更なし（interactive 用）

### 受け入れ基準

- [ ] `SlashCommand` インターフェースにすべての新フィールドが含まれ、TypeScript コンパイルが通る
- [ ] すべての Loader が `source` と `commandType` フィールドを埋め込む
- [ ] すべての built-in コマンドが `commandType` と `supportedModes` を宣言する
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` が削除され、capability filter に置き換えられている
- [ ] **non-interactive での利用可能コマンドセットがリファクタリング前と完全に一致する**（既存テストが壊れない）
- [ ] MCP prompt commands が non-interactive/acp で正常に実行できる（既存の誤った制限を修正）
- [ ] `CommandService.getCommandsForMode('non_interactive')` が正しいコマンドセットを返す
- [ ] すべての既存テストが通過する

---

## Phase 2：機能拡張（コマンド整理と prompt command のモデル呼び出し）

### 目標

Phase 1 のメタデータ基盤に基づき、3つのモードにおけるコマンドの利用範囲を拡張し、prompt command のモデル呼び出しパスを確立する。

### 機能ポイント

#### 2.1 non-interactive / acp 利用可能コマンドセットの拡張

**ACP セマンティクス設計原則**

コマンドを ACP/non-interactive モードに拡張する前に、以下の設計原則に従う必要がある：

1. **受信者が異なる**：ACP モードではメッセージの受信者は IDE（Zed/VS Code プラグイン）であり、エンドユーザーではない。メッセージ内容はプレーンテキストまたは Markdown 形式が適切であり、terminal 専用の ANSI スタイルを含めるべきではない。
2. **実装戦略は置き換えではなくモード分岐の追加**：正しいアプローチは、コマンドの `action` 内部にモード判定を追加することである。interactive パスは既存の UI レンダリングロジックを維持し、non_interactive/acp パスはマシン消費に適した `message` または `submit_prompt` を返す。両パスは同一の `action` 関数内に共存する。
3. **ステートフル操作にはセマンティクスを明記**：単一の非対話呼び出し（例：CLI `-p` パラメータ）では、`/model set` や `/language set` などのステートフルコマンドの変更は当該 session 内でのみ有効であり、コマンド応答テキストにその旨を記載する必要がある。
4. **読み取り専用 vs 副作用あり**：読み取り専用コマンド（例：`/about`、`/stats`）は現在の状態テキストを直接返す。副作用のあるコマンド（例：`/model set`、`/language set`）は応答内で操作結果を確認する必要がある。
5. **環境依存の副作用を回避**：ブラウザを開く（`/docs`、`/insight`）やクリップボードを操作する（`/copy`）など、グラフィカル環境に依存する操作は、non_interactive/acp パスではスキップし、代わりに応答テキストに関連する URL またはコンテンツ自体を返す。

**拡張対象コマンド一覧**

> 注：`btw`、`bug`、`compress`、`context`、`init`、`summary` は Phase 1 ですでに全モードに拡張済みであり、本フェーズのリストには含まれない。

以下の 13 コマンドが Phase 2 で `non_interactive` および `acp` モードに拡張される：

**A クラス：action がすでに `message` または `submit_prompt` を返しており、`supportedModes` の拡張と ACP メッセージ内容の設計のみが必要**

| 命令          | 戻り値型        | ACP/non-interactive 処理要点                       |
| ------------- | --------------- | -------------------------------------------------- |
| `/copy`       | `message`       | ACP にはクリップボードがないため、応答テキストにコンテンツ自体またはその旨のヒントを返す |
| `/export`     | `message`       | エクスポートファイルのフルパスを返す                             |
| `/plan`       | `submit_prompt` | 変更不要。モードを直接拡張                             |
| `/restore`    | `message`       | 復元操作の結果説明を返す                             |
| `/language`   | `message`       | 現在の言語設定または変更確認テキストを返す                     |
| `/statusline` | `submit_prompt` | 変更不要。モードを直接拡張                             |

**A' クラス：引数あり時は正常実行、引数なし時は dialog をトリガー（引数なしパスの non-interactive 処理を追加する必要あり）**

| 命令             | 引数なし interactive 動作 | 引数なし non_interactive/acp 動作 |
| ---------------- | ----------------------- | ------------------------------- |
| `/model`         | モデル選択 dialog を開く     | 現在のモデル名と説明テキストを返す      |
| `/approval-mode` | 承認モード dialog を開く     | 現在の承認モードと説明テキストを返す      |

**B クラス：action 内部で `context.ui.addItem()` を使用して React コンポーネントをレンダリングしており、プレーンテキストを返すモード分岐を追加する必要あり**

| 命令       | interactive 動作          | non_interactive/acp 戻り値内容                                                        |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `/about`   | バージョン/設定 React コンポーネントをレンダリング  | バージョン番号、現在のモデル、主要設定のプレーンテキスト要約                                              |
| `/stats`   | token/費用統計コンポーネントをレンダリング   | session 統計データのプレーンテキスト形式                                                        |
| `/insight` | 分析コンポーネントをレンダリング + ブラウザを開く | `non_interactive` では同期生成してファイルパスを返す。`acp` では `stream_messages` で進捗と結果をプッシュ |
| `/docs`    | ドキュメントエントリをレンダリング + ブラウザを開く | ドキュメント URL を返す。ブラウザは開かない                                                          |

**C クラス：特別処理**

| 命令     | interactive 動作                       | non_interactive/acp 動作                                                                            |
| -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/clear` | `context.ui.clear()` を呼び出してターミナル表示をクリア | コンテキスト境界マークメッセージを返す。内容は `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 prompt command のモデル呼び出しパス確立

- `CommandService`（または `CommandRegistry`）に `getModelInvocableCommands()` を実装し、`modelInvocable: true` のすべてのコマンドを返す
- `BundledSkillLoader` および `FileCommandLoader`（ユーザー/プロジェクトコマンド）が読み込むコマンドに `modelInvocable: true` をマーク
- **MCP prompt は `modelInvocable` にマークしない**：MCP prompt は独立した MCP tool call メカニズム経由でモデルから直接呼び出され、`SkillTool` を経由する必要はない
- `SkillTool` を改修：`SkillManager.listSkills()` のみ消費する仕様から、`CommandService.getModelInvocableCommands()` も同時に消費する仕様に変更
- 統一されたモデル呼び出し可能コマンドの説明を構築し、`SkillTool` の description に注入

#### 2.3 mid-input slash command 検出（基本版）

- `InputPrompt` 内でカーソル付近の slash token を検出（行頭に限定しない）
- slash token 検出後、inline ghost text で最適一致コマンド名を提示（Tab で確定）
- dropdown 補完メニュー、argument hints、source badge などは**含まない**（Phase 3 で実装）
- ghost text の候補セットは `modelInvocable: true` のコマンド（skill / file command）に限定

### 受け入れ基準

**2.1 コマンド拡張**

- [ ] A クラス：`/copy`、`/export`、`/plan`、`/restore`、`/language`、`/statusline` が non-interactive および acp モードで正常に実行され、意味のあるテキスト出力を返す
- [ ] A' クラス：`/model`、`/approval-mode` が引数なしの場合、non-interactive/acp で現在の状態テキストを返す（dialog はトリガーしない）。引数ありの場合は変更を実行し確認テキストを返す
- [ ] B クラス：`/about`、`/stats`、`/docs` が non-interactive/acp でプレーンテキストを返し、`/docs` はブラウザを開かない。`/insight` は `non_interactive` で同期生成してファイルパスメッセージを返し、`acp` では `stream_messages` で進捗をプッシュ
- [ ] C クラス：`/clear` が non-interactive/acp でコンテキスト境界マークメッセージを返し、`context.ui.clear()` を呼び出さない
- [ ] すべての拡張コマンドが interactive モードでリファクタリング前と完全に一致する動作をする（後退なし）

**2.2 モデル呼び出し**

- [ ] モデルが対話中に `SkillTool` 経由で bundled skill および file command（ユーザー/プロジェクト）を呼び出せる
- [ ] MCP prompt は `SkillTool` を経由せず、MCP tool call メカニズム経由でモデルがネイティブに呼び出す
- [ ] モデルは built-in commands を呼び出せない（`userInvocable: true`、`modelInvocable: false`）
- [ ] `SkillTool` の description にすべての `modelInvocable` コマンドの説明が含まれる

**2.3 mid-input slash**

- [ ] mid-input slash：本文内で `/` を入力後、inline ghost text で最適一致コマンドを提示（Tab で確定）

---

## Phase 3：体験の整合（補完強化 + Claude Code コマンド追加）

### 目標

Phase 1/2 のメタデータとコマンド機能基盤に基づき、補完体験を充実させ、Claude Code に存在するが Qwen Code に欠けているコマンドを追加する。

### 機能ポイント

#### 3.1 補完体験の強化

**source badge**

- 補完メニューにコマンドソースラベルを表示（`[MCP]` は既存。`[Skill]`、`[Custom]` などに拡張）
- `source` / `sourceLabel` フィールドを使用してレンダリング

**argument hint**

- 補完メニューのコマンド名の後に `argumentHint` を表示（例：`set <model-id>`）
- `argumentHint` は Phase 1 のメタデータフィールドから提供

**recently used 並び替え**

- ユーザーが最近使用したコマンドを記録（session レベル。永続化不要）
- 補完の並び替えで最近使用したコマンドに重み付け

**alias 命中ハイライト**

- 補完が主名ではなく `altNames` に命中した場合、表示時に明記（例：`help (alias: ?)`）

**競合戦略の整合**

- 優先順位を明確化：built-in > bundled/skill-dir > plugin > mcp
- 競合時は低優先度コマンドをリネーム（例：`pluginName.commandName`）

#### 3.2 mid-input slash command 完全版

- Phase 2 基本版に argument hints と source badge の表示を追加
- ghost text 提示（`/he` 入力時に `/help` の淡色ヒントを表示）
- 有効コマンド token のハイライト（マッチ済みの slash command を別色で表示）

#### 3.3 Help ディレクトリの再構築

`/help` をフラットリストからグループ化ディレクトリに変更：

- **Built-in Commands**（local + local-jsx。mode を明記）
- **Bundled Skills**
- **Custom Commands**（ユーザー/プロジェクト file commands）
- **Plugin Commands**
- **MCP Commands**

各コマンドの表示項目：名前、argumentHint、description、source、supportedModes マーク

#### 3.4 ACP available commands メタデータの強化

`sendAvailableCommandsUpdate()` でより多くのメタデータを ACP クライアントに公開：

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands`（名前リスト）
- `modelInvocable`

#### 3.5 Claude Code 欠落コマンドの追加

Qwen Code に現在なく、Claude Code に存在する一般的なコマンドを追加：

| 命令             | 型    | 説明                                     |
| ---------------- | ------- | ---------------------------------------- |
| `/doctor`        | `local` | 環境セルフチェック。設定/接続/ツール状態の診断を出力     |
| `/release-notes` | `local` | 現在のバージョンの更新履歴を表示                   |
| `/cost`          | `local` | 現在の session の token 消費量と費用見積もりを表示 |

> 注：`/review`、`/commit` などのタスク系コマンドは bundled skill 形式で提供されるため、本リストには含まれない。

### 受け入れ基準

- [ ] 補完メニューに source badge（`[MCP]`、`[Skill]`、`[Custom]`）を表示
- [ ] 補完メニューに argumentHint（例：`set <model-id>`）を表示
- [ ] 最近使用したコマンドが補完リストで優先表示される
- [ ] alias 命中時に補完項目に元の名前を明記
- [ ] mid-input slash：ghost text 提示が正しくレンダリングされる
- [ ] `/help` 出力がソース別にグループ化され、各コマンドにサポートモードマークが表示される
- [ ] ACP available commands に `argumentHint`、`source`、`subcommands` フィールドが含まれる
- [ ] `/doctor`、`/release-notes`、`/cost` の 3 コマンドが利用可能
- [ ] `/doctor` が non-interactive モードで実行可能（`message` を返す）

---

## 各 Phase の依存関係

```
Phase 1（メタデータ + 統一フィルタ）
    │
    ├──► Phase 2（機能拡張）
    │        │
    │        ├──► slash command サブコマンド分割
    │        └──► prompt command モデル呼び出し（`getModelInvocableCommands()` が必要）
    │
    └──► Phase 3（体験の整合）
             │
             ├──► source badge（Phase 1 の source フィールドが必要）
             ├──► argument hint（Phase 1 の argumentHint フィールドが必要）
             └──► Help グループ化（Phase 1 の source フィールドが必要）
```

Phase 2 と Phase 3 は相互に依存しておらず、並行して推進可能（または優先度に応じて一部サブタスクを入れ替え可能）。