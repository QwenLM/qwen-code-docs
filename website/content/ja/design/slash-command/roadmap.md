# Slash Command リファクタリングロードマップ

## 全体目標

Qwen 内部アーキテクチャスタイルを使用し、外部体験で 95% Claude Code に準拠した command プラットフォームを提供すると同時に、3モード分裂、コマンドソースの単一性、prompt command がモデルから呼び出せないという3つの核心問題を修正します。

---

## コア設計原則

1. **各 Phase は独立してリリース可能**：完了後の動作は自己完結しており、将来の Phase に依存しない
2. **Phase 1 は純粋な基盤インフラ**：MCP_PROMPT が誤ってブロックされる問題の修正以外、既存の利用可能なコマンドセットは一切変更しない
3. **動作変更とアーキテクチャ変更は分離**：Phase 1 でアーキテクチャ、Phase 2 で機能拡張を行う
4. **Claude Code 内部アーキテクチャはそのままコピーしない**：ユーザーが認識できる機能面でのみ準拠する

---

## Phase 1：基盤インフラ再構築（純アーキテクチャ、動作変更ゼロ）

### 目標

統一されたコマンドメタデータモデルとクロスモード管理メカニズムを確立し、以降の全 Phase の基盤を提供します。

### 機能ポイント

#### 1.1 `SlashCommand` メタデータモデルの拡張

既存の `SlashCommand` インターフェースに以下のフィールドを追加します：

**ソースフィールド**

- `source: CommandSource`：コマンドソースの列挙型（`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` など）
- `sourceLabel?: string`：表示用ソースラベル（例：`"Built-in"` / `"MCP: github-server"`）

**モード能力フィールド**

- `supportedModes: ExecutionMode[]`：どの実行モードで利用可能かを宣言（`interactive` / `non_interactive` / `acp`）

**実行タイプフィールド**

- `commandType: CommandType`：実行タイプを宣言（`prompt` / `local` / `local-jsx`）

**可視性フィールド**

- `userInvocable: boolean`：ユーザーが slash command 経由で呼び出せるか（デフォルト `true`）
- `modelInvocable: boolean`：モデルが tool call 経由で呼び出せるか（デフォルト `false`）

**補助メタデータフィールド**（Phase 3 のために予約、Phase 1 では定義のみ、使用しない）

- `argumentHint?: string`：引数ヒント、例 `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`：いつそのコマンドを呼び出すかの説明（モデル向け）
- `examples?: string[]`：使用例

#### 1.2 Loader による source/commandType フィールドの設定

各 Loader は `SlashCommand` を構築する際に `source` と `commandType` を必ず設定します：

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | 各コマンドが宣言（`local` / `local-jsx`） |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader`（ユーザー/プロジェクト） | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader`（プラグイン）      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 組み込みコマンドによる `supportedModes` と `commandType` の宣言

すべての built-in コマンドに対して明示的に宣言：

- `commandType`：`local`（UI依存なし）または `local-jsx`（dialog/React に依存）
- `supportedModes`：`local` 系コマンドは `['interactive', 'non_interactive', 'acp']` を宣言；`local-jsx` 系コマンドは `['interactive']` を宣言

#### 1.4 ハードコードされたホワイトリストを capability-based フィルタリングに置き換え

- `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` 定数を削除
- `filterCommandsForNonInteractive` 関数を削除
- 新規 `filterCommandsForMode(commands, mode)` 関数を追加、`supportedModes` フィールドに基づいてフィルタリング
- 新規 `getEffectiveSupportedModes(cmd)` ユーティリティ関数を追加（CommandKind のデフォルト戦略を考慮）
- `handleSlashCommand` / `getAvailableCommands` 関数シグネチャを変更、`allowedBuiltinCommandNames` パラメータを削除

#### 1.5 CommandService を統一された Registry にアップグレード

- 新規 `getCommandsForMode(mode: ExecutionMode)` メソッド
- 新規 `getModelInvocableCommands()` メソッド（Phase 2/3 で使用、Phase 1 ではインターフェースを提供）
- 既存の `getCommands()` は変更なし（interactive で使用）

### 検収基準

- [ ] `SlashCommand` インターフェースにすべての新規フィールドが含まれ、TypeScript コンパイルが通る
- [ ] すべての Loader が `source` と `commandType` フィールドを設定する
- [ ] すべての built-in コマンドが `commandType` と `supportedModes` を宣言する
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` が削除され、capability filter に置き換わった
- [ ] **non-interactive で利用可能なコマンドセットがリファクタリング前と完全に一致する**（既存テストが失敗しない）
- [ ] MCP prompt commands が non-interactive/acp で正常に実行できる（以前の誤った制限を修正）
- [ ] `CommandService.getCommandsForMode('non_interactive')` が正しいコマンドセットを返す
- [ ] すべての既存テストが通過する

---

## Phase 2：能力拡張（コマンド整理と prompt command のモデル呼び出し）

### 目標

Phase 1 のメタデータ基盤に基づき、3モードでのコマンド利用範囲を拡大し、prompt command のモデル呼び出し経路を開通します。

### 機能ポイント

#### 2.1 non-interactive / acp 利用可能コマンドセットの拡張

**ACP セマンティクス設計原則**

コマンドを ACP/non-interactive モードに拡張する前に、以下の設計原則に従う必要があります：

1. **受信者が異なる**：ACP モードでは、メッセージの受信者は IDE（Zed/VS Code プラグイン）であり、ターミナルユーザーではありません。メッセージ内容はプレーンテキストまたは Markdown 形式が適切であり、terminal 専用の ANSI スタイルを含めるべきではありません。
2. **実装戦略はモード分岐の追加であり、置き換えではない**：正しい方法は、コマンドの `action` 内部でモード判定を追加することです。interactive パスは既存の UI レンダリングロジックを維持し、non_interactive/acp パスは機械消費に適した `message` または `submit_prompt` を返します。両方のパスが同じ `action` 関数内に共存します。
3. **状態を伴う操作はセマンティクスを説明する**：単発の非インタラクティブ呼び出し（例：CLI `-p` パラメータ）では、`/model set`、`/language set` などの状態を伴うコマンドの変更は今回の session 内でのみ有効であり、コマンド応答テキスト内でその旨を明記する必要があります。
4. **読み取り専用 vs 副作用あり**：読み取り専用コマンド（例：`/about`、`/stats`）は現在の状態テキストを直接返します。副作用ありコマンド（例：`/model set`、`/language set`）は応答内で操作結果を確認する必要があります。
5. **環境依存の副作用を避ける**：ブラウザを開く（`/docs`、`/insight`）、クリップボード操作（`/copy`）など、GUI 環境に依存する操作は、non_interactive/acp パスではスキップし、代わりに応答テキストで関連 URL またはコンテンツ自体を返します。

**拡張予定コマンド一覧**

> 注：`btw`、`bug`、`compress`、`context`、`init`、`summary` は Phase 1 ですでに全モードに拡張されており、このフェーズのリストには含まれません。

以下の 13 個のコマンドは Phase 2 で `non_interactive` と `acp` モードに拡張されます：

**A 類：action がすでに `message` または `submit_prompt` を返しており、`supportedModes` の拡張と ACP メッセージ内容の設計のみが必要**

| コマンド       | 戻り値タイプ    | ACP/non-interactive 処理のポイント                                   |
| -------------- | --------------- | ------------------------------------------------------------------ |
| `/copy`        | `message`       | ACP ではクリップボードがないため、応答テキストで内容自体またはヒントを返す |
| `/export`      | `message`       | エクスポートファイルの完全パスを返す                                 |
| `/plan`        | `submit_prompt` | 変更不要、直接モード拡張                                           |
| `/restore`     | `message`       | 復元操作の結果説明を返す                                           |
| `/language`    | `message`       | 現在の言語設定または変更確認テキストを返す                         |
| `/statusline`  | `submit_prompt` | 変更不要、直接モード拡張                                           |

**A' 類：引数がある場合は正常実行、引数がない場合は dialog をトリガー（引数なしパスに non-interactive 処理を追加する必要あり）**

| コマンド         | 引数なし interactive の動作 | 引数なし non_interactive/acp の動作 |
| ---------------- | --------------------------- | ----------------------------------- |
| `/model`         | モデル選択 dialog を開く    | 現在のモデル名と説明テキストを返す  |
| `/approval-mode` | 承認モード dialog を開く    | 現在の承認モードと説明テキストを返す |

**B 類：action 内部で `context.ui.addItem()` を使用して React コンポーネントをレンダリングするため、モード分岐を追加してプレーンテキストを返す必要あり**

| コマンド    | interactive での動作              | non_interactive/acp での戻り値                                              |
| ----------- | --------------------------------- | --------------------------------------------------------------------------- |
| `/about`    | バージョン/設定 React コンポーネントをレンダリング   | バージョン番号、現在のモデル、主要設定のプレーンテキスト概要                |
| `/stats`    | token/費用統計コンポーネントをレンダリング | session 統計データのプレーンテキスト形式                                      |
| `/insight`  | 分析コンポーネントをレンダリング + ブラウザを開く | `non_interactive` で同期的にファイルパスを生成して返す；`acp` では `stream_messages` で進捗と結果をプッシュ |
| `/docs`     | ドキュメントエントリをレンダリング + ブラウザを開く | ドキュメント URL を返す、ブラウザは開かない                                  |

**C 類：特殊処理**

| コマンド    | interactive での動作                           | non_interactive/acp での動作                                                                        |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/clear`    | `context.ui.clear()` を呼び出してターミナル表示をクリア | コンテキスト境界マークメッセージを返す。内容は `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 prompt command のモデル呼び出し

- `CommandService`（または `CommandRegistry`）に `getModelInvocableCommands()` を実装し、`modelInvocable: true` の全コマンドを返す
- `BundledSkillLoader`、`FileCommandLoader`（ユーザー/プロジェクトコマンド）で読み込まれたコマンドを `modelInvocable: true` とマーク
- **MCP prompt は `modelInvocable` とマークしない**：MCP prompt は独立した MCP tool call メカニズムでモデルから呼び出されるため、`SkillTool` 経由の中継は不要
- `SkillTool` の改造：`SkillManager.listSkills()` のみを消費する方式から、`CommandService.getModelInvocableCommands()` も同時に消費する方式に変更
- 統一されたモデル呼び出し可能コマンドの説明を構築し、`SkillTool` の description に注入

#### 2.3 mid-input slash command 検出（基本版）

- `InputPrompt` 内でカーソル近くの slash token を検出（行頭に限らない）
- slash token を検出後、inline ghost text で最適なコマンド名を提示（Tab で受け入れ）
- **ドロップダウンの補完メニュー、argument hints、source badge などは含まない**（Phase 3 で対応）
- ghost text の候補セットは `modelInvocable: true` のコマンドのみ（skill / file command）

### 検収基準

**2.1 コマンド拡張**

- [ ] A 類：`/copy`、`/export`、`/plan`、`/restore`、`/language`、`/statusline` が non-interactive および acp モードで正常に実行され、意味のあるテキスト出力を返す
- [ ] A' 類：`/model`、`/approval-mode` が引数なしの場合、non-interactive/acp で現在の状態テキストを返す（dialog をトリガーしない）；引数ありの場合は変更を実行し確認テキストを返す
- [ ] B 類：`/about`、`/stats`、`/docs` が non-interactive/acp でプレーンテキストを返し、`/docs` はブラウザを開かない；`/insight` は `non_interactive` で同期的にファイルパス message を生成、`acp` では `stream_messages` で進捗をプッシュ
- [ ] C 類：`/clear` が non-interactive/acp でコンテキスト境界マーク message を返し、`context.ui.clear()` を呼び出さない
- [ ] 拡張された全コマンドが interactive モードでリファクタリング前と完全に同じ動作をする（退行なし）

**2.2 モデル呼び出し**

- [ ] モデルが会話中に `SkillTool` 経由で bundled skill、file command（ユーザー/プロジェクト）を呼び出せる
- [ ] MCP prompt は `SkillTool` を経由せず、MCP tool call メカニズムでモデルがネイティブに呼び出す
- [ ] モデルは built-in commands を呼び出せない（`userInvocable: true`、`modelInvocable: false`）
- [ ] `SkillTool` の description にすべての `modelInvocable` コマンドの説明が含まれている

**2.3 mid-input slash**

- [ ] mid-input slash：本文中で `/` を入力した後、inline ghost text で最適なコマンドが提示される（Tab で受け入れ）

---

## Phase 3：体験の一致（補完強化 + Claude Code コマンド補充）

### 目標

Phase 1/2 のメタデータとコマンド能力に基づき、補完体験を完成させ、Claude Code に存在するが Qwen Code に欠けているコマンドを補充します。

### 機能ポイント

#### 3.1 補完体験の強化

**source badge**

- 補完メニューでコマンドのソースラベルを表示（`[MCP]` は既存、`[Skill]`、`[Custom]` などに拡張）
- `source` / `sourceLabel` フィールドを使用してレンダリング

**argument hint**

- 補完メニューでコマンド名の後ろに `argumentHint` を表示（例：`set <model-id>`）
- `argumentHint` は Phase 1 のメタデータフィールドから提供

**recently used ソート**

- ユーザーの最近使用したコマンドを記録（session レベル、永続化不要）
- 補完ソートで最近使用したコマンドに重み付け

**alias ヒット強調表示**

- 補完が主名ではなく `altNames` にヒットした場合、表示時に注記（例：`help (alias: ?)`）

**競合戦略の統一**

- 優先順位を明確化：built-in > bundled/skill-dir > plugin > mcp
- 競合が発生した場合、低優先度コマンドをリネーム（例：`pluginName.commandName`）

#### 3.2 mid-input slash command 完全版

- Phase 2 の基本版に加えて、argument hints と source badge を表示
- ghost text ヒント（`/he` と入力したときに `/help` の薄色ヒントを表示）
- 有効なコマンドトークンのハイライト（マッチング済みの slash command を異なる色で表示）

#### 3.3 Help ディレクトリの再構築

`/help` をフラットリストからグループ化ディレクトリに変更：

- **Built-in Commands**（local + local-jsx、モードを明記）
- **Bundled Skills**
- **Custom Commands**（ユーザー/プロジェクト file commands）
- **Plugin Commands**
- **MCP Commands**

各コマンドに表示：名前、argumentHint、description、source、supportedModes のマーク

#### 3.4 ACP available commands メタデータ強化

`sendAvailableCommandsUpdate()` でより多くのメタデータを ACP クライアントに公開：

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands`（名前のリスト）
- `modelInvocable`

#### 3.5 Claude Code に存在し Qwen Code に欠けているコマンドの補充

Qwen Code にすでに存在する `/doctor` コマンドを確認し復帰；`/release-notes` は本フェーズでは含めず、明確な製品要件のない built-in コマンドを表面的に追加することを避ける。

| コマンド    | タイプ    | 説明                                     |
| ----------- | --------- | ---------------------------------------- |
| `/doctor`   | `local`   | 環境自己診断、設定/接続/ツール状態の診断を出力 |

> 注：`/review`、`/commit` などのタスク系コマンドは bundled skill の形式で提供するため、このリストには含まれません。

### 検収基準

- [ ] 補完メニューに source badge が表示される（`[MCP]`、`[Skill]`、`[Custom]`）
- [ ] 補完メニューに argumentHint が表示される（例：`set <model-id>`）
- [ ] 最近使用したコマンドが補完リストで優先的に表示される
- [ ] alias にヒットした場合、補完項目で元の名前を明記
- [ ] mid-input slash：ghost text のヒントが正しくレンダリングされる
- [ ] `/help` が Claude Code スタイルでタブ区切り表示され、コマンドが乱雑に並ばず、コマンドページにサポートモードのマークが表示される
- [ ] ACP available commands に `argumentHint`、`source`、`subcommands` フィールドが含まれる
- [ ] `/doctor` コマンドが使用可能
- [ ] `/doctor` が non-interactive モードで実行可能（`message` を返す）
- [ ] `/release-notes` は追加しない

---

## 各 Phase の依存関係

```
Phase 1（メタデータ + 統一フィルタリング）
    │
    ├──► Phase 2（能力拡張）
    │        │
    │        ├──► slash command サブコマンド分割
    │        └──► prompt command モデル呼び出し（getModelInvocableCommands() が必要）
    │
    └──► Phase 3（体験の一致）
             │
             ├──► source badge（Phase 1 の source フィールドが必要）
             ├──► argument hint（Phase 1 の argumentHint フィールドが必要）
             └──► Help グループ化（Phase 1 の source フィールドが必要）
```

Phase 2 と Phase 3 は相互依存しないため、並行して進めることができます（または優先順位に応じて一部のサブ項目を入れ替えることも可能）。