# Slash Command リファクタリングロードマップ

## 全体目標

Qwen 内部アーキテクチャスタイルを用いて、外部体験で Claude Code に 95% 対応したコマンドプラットフォームを提供し、三モード分裂・コマンドソースの単一性・prompt command がモデルから呼び出せない、という3つのコア課題を解決する。

---

## コア設計原則

1. **各 Phase は独立してship可能**：完了後の動作は自己完結しており、後続の Phase に依存しない
2. **Phase 1 は純粋なインフラ**：MCP_PROMPT が誤ってインターセプトされるバグの修正を除き、既存の利用可能なコマンドセットは変更しない
3. **動作変更とアーキテクチャ変更を分離**：Phase 1 でアーキテクチャを整備し、Phase 2 で機能拡張を行う
4. **Claude Code の内部アーキテクチャをそのままコピーしない**：ただし、ユーザーが知覚できる機能面は対応させる

---

## Phase 1：インフラ再構築（純粋なアーキテクチャ変更、動作変更なし）

### 目標

統一されたコマンドメタデータモデルとクロスモード管理機構を確立し、後続すべての Phase に基盤を提供する。

### 機能項目

#### 1.1 `SlashCommand` メタデータモデルの拡張

既存の `SlashCommand` インターフェースに以下のフィールドを追加する：

**ソースフィールド**

- `source: CommandSource`：コマンドソースのEnum（`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` など）
- `sourceLabel?: string`：表示用のソースラベル（例：`"Built-in"` / `"MCP: github-server"`）

**モード対応フィールド**

- `supportedModes: ExecutionMode[]`：どの実行モードで利用可能かを宣言（`interactive` / `non_interactive` / `acp`）

**実行タイプフィールド**

- `commandType: CommandType`：実行タイプを宣言（`prompt` / `local` / `local-jsx`）

**可視性フィールド**

- `userInvocable: boolean`：ユーザーが slash command から呼び出し可能か（デフォルト `true`）
- `modelInvocable: boolean`：モデルが tool call から呼び出し可能か（デフォルト `false`）

**補助メタデータフィールド**（Phase 3 向け予約、Phase 1 では定義のみ、未使用）

- `argumentHint?: string`：引数ヒント（例：`"<model-id>"` / `"show|list|set"`）
- `whenToUse?: string`：このコマンドをいつ呼び出すべきかの説明（モデル向け）
- `examples?: string[]`：使用例

#### 1.2 Loader による source/commandType フィールドの充填

各 Loader は `SlashCommand` を構築する際に `source` と `commandType` を必ず充填する：

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | 各コマンドが宣言（`local` / `local-jsx`） |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader`（ユーザー/プロジェクト） | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader`（プラグイン）      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 組み込みコマンドで `supportedModes` と `commandType` を宣言

すべての組み込みコマンドに対して以下を明示的に宣言する：

- `commandType`：`local`（UI依存なし）または `local-jsx`（dialog/React 依存）
- `supportedModes`：`local` 系コマンドは `['interactive', 'non_interactive', 'acp']` を宣言；`local-jsx` 系コマンドは `['interactive']` を宣言

#### 1.4 ハードコードされたホワイトリストを capability-based フィルターに置き換え

- `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` 定数を削除
- `filterCommandsForNonInteractive` 関数を削除
- `filterCommandsForMode(commands, mode)` 関数を新規追加し、`supportedModes` フィールドに基づいてフィルタリング
- `getEffectiveSupportedModes(cmd)` ユーティリティ関数を新規追加（CommandKind のデフォルト戦略を考慮）
- `handleSlashCommand` / `getAvailableCommands` 関数のシグネチャを変更し、`allowedBuiltinCommandNames` 引数を削除

#### 1.5 CommandService を統一 Registry にアップグレード

- `getCommandsForMode(mode: ExecutionMode)` メソッドを新規追加
- `getModelInvocableCommands()` メソッドを新規追加（Phase 2/3 で使用、Phase 1 ではインターフェースのみ提供）
- 既存の `getCommands()` はそのまま維持（interactive 向け）

### 受け入れ基準

- [ ] `SlashCommand` インターフェースがすべての新フィールドを含み、TypeScript のコンパイルが通ること
- [ ] すべての Loader が `source` と `commandType` フィールドを充填すること
- [ ] すべての組み込みコマンドが `commandType` と `supportedModes` を宣言していること
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` が削除され、capability filter に置き換わっていること
- [ ] **non-interactive で利用可能なコマンドセットがリファクタリング前と完全に一致すること**（既存テストが壊れないこと）
- [ ] MCP prompt コマンドが non-interactive/acp で正常に実行できること（既存の誤った制限を修正）
- [ ] `CommandService.getCommandsForMode('non_interactive')` が正しいコマンドセットを返すこと
- [ ] すべての既存テストが通ること

---

## Phase 2：機能拡張（コマンド整備と prompt command のモデル呼び出し）

### 目標

Phase 1 のメタデータ基盤をもとに、3つのモードでのコマンド利用可能範囲を拡張し、prompt command のモデル呼び出し経路を開通する。

### 機能項目

#### 2.1 non-interactive / acp で利用可能なコマンドセットの拡張

**ACP セマンティック設計原則**

コマンドを ACP/non-interactive モードに拡張する前に、以下の設計原則に従うこと：

1. **受信側が異なる**：ACP モードでのメッセージの受信側は IDE（Zed/VS Code プラグイン）であり、ターミナルユーザーではない。メッセージ内容はプレーンテキストまたは Markdown 形式が望ましく、ターミナル専用の ANSI スタイルを含めるべきではない。
2. **実装戦略は置換ではなくモード分岐の追加**：正しいアプローチは、コマンドの `action` 内部にモード判定を新規追加することである——interactive パスは既存の UI レンダリングロジックをそのまま維持し、non_interactive/acp パスはマシンが消費しやすい `message` または `submit_prompt` を返す。2つのパスは同一の `action` 関数内に共存する。
3. **ステートフルな操作はセマンティクスを明記**：単一の非インタラクティブ呼び出し（CLI の `-p` 引数など）では、`/model set` や `/language set` などのステートフルコマンドの変更は当該セッション内でのみ有効であり、コマンドのレスポンステキスト内にその旨を注記すること。
4. **読み取り専用 vs 副作用あり**：読み取り専用コマンド（`/about`、`/stats` など）は現在の状態テキストを直接返す；副作用のあるコマンド（`/model set`、`/language set` など）はレスポンスで操作結果を確認すること。
5. **環境依存の副作用を避ける**：ブラウザを開く（`/docs`、`/insight`）やクリップボードを操作する（`/copy`）などのグラフィカル環境依存操作は、non_interactive/acp パスではスキップし、関連 URL や内容そのものをレスポンステキストで返すこと。

**拡張対象コマンド一覧**

> 注：`btw`、`bug`、`compress`、`context`、`init`、`summary` は Phase 1 ですでに全モードに拡張済みであり、本フェーズのリストには含まない。

以下の 13 コマンドを Phase 2 で `non_interactive` および `acp` モードに拡張する：

**A 類：action がすでに `message` または `submit_prompt` を返す。`supportedModes` を拡張し ACP メッセージ内容を設計するだけでよい**

| コマンド      | 戻り値の型        | ACP/non-interactive 処理のポイント                       |
| ------------- | --------------- | -------------------------------------------------- |
| `/copy`       | `message`       | ACP ではクリップボードが使えないため、レスポンステキストに内容そのものまたはヒントを返す |
| `/export`     | `message`       | エクスポートファイルのフルパスを返す                             |
| `/plan`       | `submit_prompt` | 変更不要、モードを直接拡張するだけ                             |
| `/restore`    | `message`       | リストア操作の結果説明を返す                             |
| `/language`   | `message`       | 現在の言語設定または変更確認テキストを返す                     |
| `/statusline` | `submit_prompt` | 変更不要、モードを直接拡張するだけ                             |

**A' 類：引数あり時は正常実行、引数なし時は dialog を起動（引数なしパスの non-interactive 処理を追加する必要あり）**

| コマンド             | 引数なし interactive 動作 | 引数なし non_interactive/acp 動作 |
| ---------------- | ----------------------- | ------------------------------- |
| `/model`         | モデル選択 dialog を開く     | 現在のモデル名と説明テキストを返す      |
| `/approval-mode` | 承認モード dialog を開く     | 現在の承認モードと説明テキストを返す      |

**B 類：action 内部で `context.ui.addItem()` を使って React コンポーネントをレンダリングしている。モード分岐を追加してプレーンテキストを返す必要あり**

| コマンド       | interactive 動作          | non_interactive/acp の返却内容                                                                        |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `/about`   | バージョン/設定の React コンポーネントをレンダリング  | バージョン番号・現在のモデル・主要設定のプレーンテキストサマリー                                              |
| `/stats`   | token/費用統計コンポーネントをレンダリング   | セッション統計データのプレーンテキスト形式                                                        |
| `/insight` | 分析コンポーネントをレンダリング + ブラウザを開く | `non_interactive` は同期的に生成してファイルパスを返す；`acp` は `stream_messages` で進捗と結果を送信 |
| `/docs`    | ドキュメント入口をレンダリング + ブラウザを開く | ドキュメント URL を返す、ブラウザは開かない                                                          |

**C 類：特殊処理**

| コマンド     | interactive 動作                       | non_interactive/acp 動作                                                                            |
| -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/clear` | `context.ui.clear()` を呼び出してターミナル表示をクリア | コンテキスト境界マーカーの message を返す。内容は `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 prompt command のモデル呼び出し開通

- `CommandService`（または `CommandRegistry`）に `getModelInvocableCommands()` を実装し、`modelInvocable: true` のすべてのコマンドを返す
- `BundledSkillLoader`・`FileCommandLoader`（ユーザー/プロジェクトコマンド）が読み込むコマンドを `modelInvocable: true` としてマークする
- **MCP prompt は `modelInvocable` としてマークしない**：MCP prompt は独立した MCP tool call 機構によってモデルが呼び出すため、`SkillTool` を経由する必要はない
- `SkillTool` を改修：`SkillManager.listSkills()` だけでなく `CommandService.getModelInvocableCommands()` も併せて消費するようにする
- 統一されたモデル呼び出し可能コマンドの説明を構築し、`SkillTool` の description に注入する

#### 2.3 mid-input slash command 検出（基本版）

- `InputPrompt` 内でカーソル付近の slash トークンを検出（行頭に限らない）
- slash トークンを検出したら inline ghost text で最もマッチするコマンド名を提示（Tab で確定）
- dropdown 補完メニュー・argument hints・source badge などは**含めない**（Phase 3 で対応）
- ghost text の候補は `modelInvocable: true` のコマンド（skill / file command）のみ

### 受け入れ基準

**2.1 コマンド拡張**

- [ ] A 類：`/copy`、`/export`、`/plan`、`/restore`、`/language`、`/statusline` が non-interactive および acp モードで正常に実行され、意味のあるテキスト出力を返すこと
- [ ] A' 類：`/model`、`/approval-mode` が引数なし時に non-interactive/acp で現在の状態テキストを返すこと（dialog を起動しないこと）；引数あり時は変更を実行して確認テキストを返すこと
- [ ] B 類：`/about`、`/stats`、`/docs` が non-interactive/acp でプレーンテキストを返し、`/docs` がブラウザを開かないこと；`/insight` が `non_interactive` で同期的に生成してファイルパスの message を返し、`acp` で `stream_messages` で進捗を送信すること
- [ ] C 類：`/clear` が non-interactive/acp でコンテキスト境界マーカーの message を返し、`context.ui.clear()` を呼び出さないこと
- [ ] すべての拡張コマンドが interactive モードでリファクタリング前と完全に同じ動作をすること（退行なし）

**2.2 モデル呼び出し**

- [ ] モデルが会話中に `SkillTool` を通じて bundled skill・file command（ユーザー/プロジェクト）を呼び出せること
- [ ] MCP prompt が `SkillTool` を経由せず、MCP tool call 機構によってモデルがネイティブに呼び出せること
- [ ] モデルが built-in commands を呼び出せないこと（`userInvocable: true`、`modelInvocable: false`）
- [ ] `SkillTool` の description がすべての `modelInvocable` コマンドの説明を含むこと

**2.3 mid-input slash**

- [ ] mid-input slash：本文中で `/` を入力した後、inline ghost text で最もマッチするコマンドが提示され（Tab で確定）ること

---

## Phase 3：体験の対応（補完強化 + Claude Code コマンドの補完）

### 目標

Phase 1/2 のメタデータとコマンド機能を基盤として、補完体験を充実させ、Claude Code に存在して Qwen Code に欠けているコマンドを補完する。

### 機能項目

#### 3.1 補完体験の強化

**source badge**

- 補完メニューにコマンドソースラベルを表示（`[MCP]` は既存、`[Skill]`・`[Custom]` などに拡張）
- `source` / `sourceLabel` フィールドを使ってレンダリング

**argument hint**

- 補完メニューのコマンド名の後に `argumentHint` を表示（例：`set <model-id>`）
- `argumentHint` は Phase 1 のメタデータフィールドから提供

**recently used ソート**

- ユーザーが最近使ったコマンドを記録（セッションレベル、永続化不要）
- 補完のソートで最近使ったコマンドに重みを付ける

**alias ヒット時のハイライト**

- 補完が主名ではなく `altNames` にヒットした場合、表示で明記する（例：`help (alias: ?)`）

**競合戦略の対応**

- 優先順位を明確化：built-in > bundled/skill-dir > plugin > mcp
- 競合時は低優先度コマンドをリネーム（例：`pluginName.commandName`）

#### 3.2 mid-input slash command 完全版

- Phase 2 基本版に argument hints と source badge 表示を追加
- ghost text 提示（`/he` と入力した際に `/help` の淡色提示を表示）
- 有効なコマンドトークンのハイライト（マッチ済みの slash command を異なる色で表示）

#### 3.3 Help ディレクトリのリファクタリング

`/help` をフラットリストからグループ化ディレクトリに変更する：

- **Built-in Commands**（local + local-jsx、モードを明記）
- **Bundled Skills**
- **Custom Commands**（ユーザー/プロジェクトの file commands）
- **Plugin Commands**
- **MCP Commands**

各コマンドに表示する内容：名前、argumentHint、description、source、supportedModes マーク

#### 3.4 ACP available commands のメタデータ強化

`sendAvailableCommandsUpdate()` で ACP クライアントに公開するメタデータを追加する：

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands`（名前リスト）
- `modelInvocable`

#### 3.5 Claude Code で欠けているコマンドの補完

Qwen Code にすでにある `/doctor` コマンドを確認・回帰させる；`/release-notes` は本フェーズに含めず、明確な製品要件のない組み込みコマンドを増やすことを避ける。

| コマンド      | タイプ    | 説明                                 |
| --------- | ------- | ------------------------------------ |
| `/doctor` | `local` | 環境自己診断。設定/接続/ツールの状態診断を出力 |

> 注：`/review`・`/commit` などのタスク系コマンドは bundled skill として提供し、ここには含まない。

### 受け入れ基準

- [ ] 補完メニューに source badge（`[MCP]`、`[Skill]`、`[Custom]`）が表示されること
- [ ] 補完メニューに argumentHint（例：`set <model-id>`）が表示されること
- [ ] 最近使ったコマンドが補完リストで優先的に表示されること
- [ ] alias がヒットした際に補完項目で元の名前が明記されること
- [ ] mid-input slash：ghost text 提示が正しくレンダリングされること
- [ ] `/help` が Claude Code スタイルでタブ分割表示され、コマンドの羅列を避け、コマンドページでサポートモードマークが表示されること
- [ ] ACP available commands に `argumentHint`、`source`、`subcommands` フィールドが含まれること
- [ ] `/doctor` コマンドが利用可能なこと
- [ ] `/doctor` が non-interactive モードで実行可能なこと（`message` を返す）
- [ ] `/release-notes` を新規追加しないこと

---

## 各 Phase の依存関係

```
Phase 1（メタデータ + 統一フィルタリング）
    │
    ├──► Phase 2（機能拡張）
    │        │
    │        ├──► slash command サブコマンド分割
    │        └──► prompt command のモデル呼び出し（getModelInvocableCommands() が必要）
    │
    └──► Phase 3（体験の対応）
             │
             ├──► source badge（Phase 1 の source フィールドが必要）
             ├──► argument hint（Phase 1 の argumentHint フィールドが必要）
             └──► Help グループ化（Phase 1 の source フィールドが必要）
```

Phase 2 と Phase 3 は互いに依存しないため、並行して進めることができる（または優先度に応じて一部のサブ項目を入れ替えることも可能）。
