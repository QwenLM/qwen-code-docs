# Qwen Code コマンドモジュールリファクタリング案

## 1. 目標定義

本案は以下の原則を唯一の前提とする：

- **コードアーキテクチャは Claude Code をそのまま踏襲しなくてよい**
- **ただし、コマンドシステムのコア機能、使用体験、インタラクション体験は Claude Code に 95% 一致させる必要がある**

ここでの「一致」とは、ユーザーが直接認識できる機能を指し、以下を含む：

1. コマンドソースのカバレッジ
2. コマンドヘルプとディスカバビリティ
3. コマンド補完と mid-input slash command の体験
4. ACP / non-interactive での可用性
5. prompt command / skill のモデル呼び出し機能

今回のリファクタリングは、単にフィールドをいくつか追加したり、既存の `SlashCommand` を微調整したりするものではない。command モジュールを「interactive UI の付属機能」から「interactive / ACP / non-interactive / model を横断する統一コマンドプラットフォーム」へアップグレードするものである。

---

## 2. 再検討後の結論

Qwen の既存 command システムの問題は、機能が全くないことではなく、以下の点にある：

1. interactive のメインパスでのみ比較的完結している
2. 型モデルが薄く、Claude レベルの製品面を支えられない
3. ACP / non-interactive がホワイトリストに依存しており、拡張性が極めて低い
4. command ソースは存在するものの、ユーザーから見て統一されたメンタルモデルが形成されていない
5. prompt command とモデル skill の公開体系が分断されている

したがって、新案は以下の 4 つを同時に解決する必要がある：

1. **Claude Code の機能面を補完する**
2. **Qwen の統一 outcome モデルのエンジニアリング上の優位性を維持する**
3. **統一された registry / resolver / executor / adapter アーキテクチャを構築する**
4. **ヘルプ、補完、ACP available commands、ドキュメントで同一のメタデータを共有させる**

---

## 3. リファクタリング原則

### 3.1 機能の一致は実装の一致より優先する

差異を許容するもの：

- 内部クラス名
- モジュール分割方式
- エグゼキューターの実装
- effect / outcome 構造

差異を許容しないもの：

- コマンドソースのカバレッジが明らかに低下する
- コマンドヘルプと補完体験が明らかに低下する
- ACP / non-interactive の可用性が明らかに低下する
- prompt command とモデル機能の統合が明らかに低下する

トレードオフが生じた場合の優先順位は以下の通り：

1. ユーザー体験の一致
2. コマンド機能カバレッジの一致
3. モードの一貫性の一致
4. 内部実装の簡潔さ

### 3.2 Qwen の統一 outcome モデルを維持する

Claude の実行実装を機械的に複製することは推奨しない。

Qwen の現在の統一結果モデルは維持する価値がある。以下の用途に本質的に適しているためである：

- UI の制御
- 承認/確認
- tool のスケジューリング
- prompt の送信
- 複数モードへの適応

ただし、簡易版 UI コマンドフレームワークとして留まるのではなく、Claude レベルの command 機能を支えられるようアップグレードする必要がある。

### 3.3 型、ソース、モード、可視性は完全に分離する必要がある

新しい command モデルは、少なくとも以下の次元を分離する必要がある：

1. **型**：コマンドの実行方法
2. **ソース**：コマンドの提供元
3. **モード機能**：どの実行環境で利用可能か
4. **可視性**：ユーザー向けかモデル向けか

---

## 4. 一致させる必要がある Claude Code の機能面

### 4.1 コマンド型

Qwen は以下の 3 種類のコマンドを明示的にサポートする必要がある：

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 コマンドソース

Qwen の command スキーマは、第 1 フェーズから以下のソースをカバーする必要がある：

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

ここで「まずは現在サポートしている数種類のみ」と後退することはできない。

### 4.3 コマンドメタデータ

少なくとも以下のフィールドを補完する必要がある：

1. `argumentHint`
2. `whenToUse`
3. `examples`
4. `sourceLabel`
5. `userFacingName`
6. `alias`
7. `immediate`
8. `isSensitive`
9. `userInvocable`
10. `modelInvocable`
11. `supportedModes`
12. `requiresUi`

### 4.4 体験機能

少なくとも以下の体験を補完する必要がある：

1. alias 一致時の補完
2. source badge
3. パラメータヒント
4. recently used によるソート
5. mid-input slash command の検出と補完
6. コマンドディレクトリ形式の Help
7. ACP available commands の完全な表現

---

## 5. 新しい command モデル

## 5.1 コア構造

全コマンドの登録フォーマットとして、統一された `CommandDescriptor` の導入を推奨する。

少なくとも以下の 4 つのパートを含む：

1. `identity`
2. `metadata`
3. `capabilities`
4. `handler`

### `identity`

- `id`
- `name`
- `altNames`
- `canonicalPath`

### `metadata`

- `description`
- `argumentHint`
- `whenToUse`
- `examples`
- `group`
- `source`
- `sourceLabel`
- `userFacingName`
- `hidden`

### `capabilities`

- `type`: `prompt | local | local-jsx`
- `supportedModes`: `interactive | acp | non_interactive`
- `requiresUi`
- `supportsDialog`
- `supportsStreaming`
- `supportsToolInvocation`
- `supportsConfirmation`
- `remoteSafe`
- `readOnly`
- `immediate`
- `isSensitive`
- `userInvocable`
- `modelInvocable`

### `handler`

- `resolveArgs()`
- `execute()`
- `completion()`
- `fallback()`

---

## 5.2 3 種類のコマンド型の責務

### `prompt`

用途：

- skills
- file commands
- workflow prompt commands
- plugin skills
- mcp prompt / skill

特徴：

- prompt / skill アセットを生成する
- デフォルトで interactive / ACP / non-interactive をサポートする
- ユーザーからもモデルからも呼び出し可能

### `local`

用途：

- 照会系コマンド
- 設定系コマンド
- headless で実行可能な状態系コマンド
- 大多数の built-in commands のコア実行エントリポイント

特徴：

- UI に依存しない
- ACP / non-interactive の主要な担い手となるべき型

### `local-jsx`

用途：

- picker
- パネル
- wizard
- interactive UI shell

特徴：

- interactive UI のみ処理する
- 唯一の実行エントリポイントであってはならない
- fallback または対応する local サブコマンドを提供する必要がある

---

## 6. コマンドソースモデル

## 6.1 外部ソースモデル

これはユーザー向けのソースモデルであり、Claude Code のメンタルモデルと可能な限り一致させる必要がある：

- `builtin-command`
- `bundled-skill`
- `skill-dir-command`
- `workflow-command`
- `plugin-command`
- `plugin-skill`
- `dynamic-skill`
- `builtin-plugin-skill`
- `mcp-prompt`
- `mcp-skill`

このフィールド群は以下に直接使用される：

- Help のグループ化
- Completion source badge
- ACP available commands
- ドキュメントエクスポート

## 6.2 内部正規化モデル

外部の命名に縛られないよう、内部に実装用のフィールド層を追加する：

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

これにより以下を実現できる：

- 外部体験は Claude に一致させる
- 内部実装は Qwen の保守性を維持する

## 6.3 競合解決戦略

安定した `id` で一元管理し、表示名と入力名を分離する：

1. `id`：安定した一意識別子
2. `name`：入力用メイン名
3. `userFacingName`：ヘルプ/補完表示名

競合時の優先順位は以下を推奨：

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. mcp 独立 namespace

---

## 7. 統一実行アーキテクチャ

## 7.1 `CommandRegistry`

責務：

1. 全 loader/provider の集約
2. 多次元インデックスの構築
3. ヘルプ、補完、ACP、ドキュメントビューの出力
4. ユーザー可視コマンドとモデル可視コマンドの独立ビューの提供

サポート必須の provider：

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

一部の provider が第 1 フェーズで完全に実装されない場合でも、スキーマと API は事前にサポートする必要がある。

## 7.2 `CommandResolver`

責務：

1. slash command の解決
2. alias の解決
3. subcommand path の解決
4. mid-input slash token の識別
5. canonical resolved command の出力

## 7.3 `CommandExecutor`

責務：

1. capability のチェック
2. `prompt | local | local-jsx` の実行
3. 統一 outcome の生成
4. fallback / unsupported の処理

## 7.4 `ModeAdapter`

以下の 3 種類の adapter を分離する必要がある：

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

これにより、3 つのモードがそれぞれハードコードするのではなく、同一の command registry と executor を共有できるようになる。

---

## 8. UI コマンドリファクタリング原則：コアコマンドとインタラクションシェルの分離

これは ACP と non-interactive が実際に利用可能になるための鍵である。

現在本質的に「dialog を開く」コマンドは、すべて以下にリファクタリングする必要がある：

1. 1 つの interactive shell
2. 一連の local サブコマンド

### 第 1 弾で分離必須のコマンド

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### 目標形態の例

#### `/model`

- `/model`
- `/model show`
- `/model list`
- `/model set <id>`

#### `/permissions`

- `/permissions`
- `/permissions show`
- `/permissions set <mode>`
- `/permissions allow <tool>`
- `/permissions deny <tool>`

#### `/mcp`

- `/mcp`
- `/mcp list`
- `/mcp show <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`

---

## 9. Prompt Command / Skill の統一設計

これはリファクタリングにおける P0 であり、後回しにする機能ではない。

## 9.1 目標

統一された **Model-Invocable Prompt Command Registry** を構築し、以下のアセットをモデルが呼び出せる単一のビューに統合する：

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 重要フィールド

以下の追加が必須：

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` または最小パラメータ記述
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 `SkillTool` との関係

リファクタリング後、`SkillTool` が狭義の skill のみを消費する構成は避けるべきである。

以下のように変更する：

1. `CommandRegistry.getModelInvocablePromptCommands()` が統一ビューを出力する
2. `SkillTool` または将来の統一 command tool が該ビューを消費する
3. ユーザーの slash command とモデルの skill invocation が同一の prompt-command アセットプールを共有する

これにより、Qwen は `/review`、`/commit`、`/openspec-apply` といった機能に対する Claude の処理方法に体験面で近づける。

---

## 10. Help / Completion / Discoverability の再構築

## 10.1 Completion

補完項目は少なくとも以下を表示する必要がある：

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

ソートは少なくとも以下を考慮する：

1. 完全一致
2. alias 一致
3. 最近使用
4. prefix 一致
5. fuzzy 一致

## 10.2 Mid-input slash command

以下の補完が必須：

1. カーソル付近の slash token 検出
2. ghost text の表示
3. Tab による確定
4. 有効なコマンド token のハイライト

第 1 フェーズではまず入力体験を一致させる。「埋め込みコマンド実行セマンティクス」の導入は後続のイテレーションで検討する。

## 10.3 Help

Help は単なるフラットリストではなく、完全なコマンドディレクトリとなる。

少なくとも以下のようにグループ化する：

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

各コマンドは少なくとも以下を表示する：

1. 名称
2. パラメータヒント
3. 説明
4. ソース
5. サポートモード
6. モデル呼び出し可否
7. サブコマンドの概要

---

## 11. ACP / Non-Interactive のリファクタリング

## 11.1 ホワイトリスト方式の完全廃止

旧案：

- built-in allowlist
- FILE / SKILL の特別判定
- その他の結果タイプは unsupported

新案：

- 各コマンドが自身の capability を宣言する
- registry がフィルタリングを担当する
- adapter が実行と fallback を担当する

## 11.2 outcome のサポート目標

### interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### acp

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### non_interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 ACP available commands の出力

少なくとも以下を含む必要がある：

1. `name`
2. `description`
3. `argumentHint`
4. `source`
5. `examples`
6. `supportedModes`
7. `interactiveOnly`
8. `subcommands`
9. `modelInvocable`

---

## 12. ドキュメント、ヘルプ、補完で同一メタデータを共有

リファクタリング後、以下の内容は同一の registry ビューからエクスポートされる必要がある：

1. Help
2. Completion
3. ACP available commands
4. ドキュメントエクスポート

これは現在の問題である「実装、ヘルプ、ドキュメントでコマンドの表現が 3 通りに分かれている」状態を解消するためである。

---

## 13. 実施フェーズ

## Phase 1：基盤再構築

成果物：

1. 新しい `CommandDescriptor`
2. 完全なソーススキーマ
3. capability モデル
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. 3 種類の `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Phase 2：コアコマンドの移行

成果物：

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

これらのコマンドはすべて「interactive shell + local サブコマンド」へのリファクタリングを完了する必要がある。

## Phase 3：モデル機能の統合

成果物：

1. `SkillTool` の統一 registry ビューへの接続
2. file command / bundled skill / mcp prompt / plugin skill の統一 model-invocable コレクションへの統合
3. prompt command と skill アセットの完全統一

## Phase 4：体験層の Claude 一致

成果物：

1. recently used ソート
2. source badge
3. argument hint
4. mode badge
5. 完全な help ディレクトリ
6. mid-input slash command 体験
7. ドキュメントの自動エクスポートまたは検証

---

## 14. 受け入れ基準

完了後、少なくとも以下を満たす必要がある：

1. ヘルプ、補完、ACP、ドキュメントがすべて完全なソースモデルを表現できる
2. 純粋な UI シェルコマンドを除き、大多数の built-in command が ACP / non-interactive で利用可能
3. prompt command とモデル skill 呼び出しが同一のアセットプールを使用
4. コマンド体験がヘルプ、補完、ソース表現、パラメータヒント、mid-input 体験において Claude Code の 95% レベルに到達
5. ACP / non-interactive のコマンド機能維持のために built-in allowlist に依存しない

---

## 15. 最終判断

今回のリファクタリングの本質は「既存の `SlashCommand` にフィールドをいくつか追加する」ことではなく、以下の通りである：

- **Qwen の内部アーキテクチャスタイルを用いて、外部体験が Claude Code に 95% 一致する command プラットフォームを提供する**

二者択一を迫られた場合：

- 内部実装を Claude に近づける
- 外部体験を Claude に近づける

本案は明確に後者を選択する。