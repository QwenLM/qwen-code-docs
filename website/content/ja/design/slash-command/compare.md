# Qwen Code コマンドモジュール再構築計画

## 1. 目標定義

本計画は、以下の原則を唯一の前提とする：

- **コードアーキテクチャは Claude Code を模倣する必要はない**
- **ただし、コマンドシステムの中核機能、ユーザー体験、インタラクション体験は Claude Code と 95% 一致させる**

ここでの「一致」とは、ユーザーが直接認識できる能力を指す：

1. コマンドソースのカバレッジ
2. コマンドヘルプと発見性
3. コマンド補完とミッドインプットスラッシュコマンド体験
4. ACP / 非対話モードの可用性
5. prompt command / skill のモデル呼び出し機能

今回の再構築は、フィールドをいくつか追加したり、既存の `SlashCommand` を小規模に修正したりするものではない。コマンドモジュールを「インタラクティブUIの付属機能」から「インタラクティブ / ACP / 非対話 / モデルを横断する統一コマンドプラットフォーム」へとアップグレードするものである。

---

## 2. 再構築後の結論

Qwen の既存コマンドシステムの問題は、まったく能力がないわけではない。問題は以下の通り：

1. インタラクティブのメインパス上でのみ比較的完成している
2. 型モデルが薄すぎて、Claude レベルのプロダクト面を支えられない
3. ACP / 非対話モードがホワイトリストに依存しており、拡張性が極めて低い
4. コマンドソースは存在するが、ユーザーから見える統一されたメンタルモデルが形成されていない
5. prompt command とモデルスキルの公開体系が分断されている

したがって、新しい計画は以下の4つを同時に解決しなければならない：

1. **Claude Code の能力面を補完する**
2. **Qwen の統一 outcome モデルというエンジニアリング上の強みを維持する**
3. **統一された registry / resolver / executor / adapter アーキテクチャを確立する**
4. **ヘルプ、補完、ACP available commands、ドキュメントが同じメタデータを共有する**

---

## 3. 再構築の原則

### 3.1 機能の一致を実装の一致より優先

以下の差異は許容する：

- 内部クラス名
- モジュール分割方法
- 実行エンジンの実装
- effect / outcome の構造

以下の差異は許容しない：

- コマンドソースのカバレッジが明らかに劣る
- コマンドヘルプと補完体験が明らかに劣る
- ACP / 非対話モードの可用性が明らかに劣る
- prompt command とモデル能力の統合が明らかに劣る

トレードオフが生じた場合の優先順位は以下の通り：

1. ユーザー体験の一致
2. コマンド能力カバレッジの一致
3. モード一貫性の一致
4. 内部実装のシンプルさ

### 3.2 Qwen の統一 outcome モデルを維持する

Claude の実行実装を機械的にコピーすることは推奨しない。

Qwen の現行の統一結果モデルは引き続き維持する価値がある。これは以下の用途に自然に適合するためである：

- UI による制御
- 承認・確認
- ツールディスパッチ
- プロンプト提出
- モード横断的な適応

ただし、このモデルは、簡略化された UI コマンドフレームワークとしてではなく、Claude レベルのコマンド能力を支えられるようにアップグレードされなければならない。

### 3.3 型、ソース、モード、可視性を完全に分離する

新しいコマンドモデルでは、少なくとも以下の次元を分割する：

1. **型**：コマンドの実行方法
2. **ソース**：コマンドの出自
3. **モード能力**：どの実行環境で利用可能か
4. **可視性**：ユーザーから見えるか、モデルから見えるか

---

## 4. 一致させる必要がある Claude Code の能力面

### 4.1 コマンドの型

Qwen は以下の3種類のコマンドを明示的にサポートする必要がある：

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 コマンドソース

Qwen のコマンドスキーマは、最初のフェーズから以下のソースをカバーしなければならない：

1. ビルトインコマンド
2. バンドルスキル
3. スキルディレクトリコマンド
4. ワークフローコマンド
5. プラグインコマンド
6. プラグインスキル
7. 動的スキル
8. MCP プロンプト
9. MCP スキル

ここで「まずは今ある種類だけサポートすればよい」という後退は許されない。

### 4.3 コマンドメタデータ

少なくとも以下のフィールドを追加する：

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

### 4.4 体験能力

少なくとも以下の体験を追加する：

1. エイリアスによる補完ヒット
2. ソースバッジ
3. パラメータヒント
4. 最近使用順の並べ替え
5. ミッドインプットスラッシュコマンドの検出と補完
6. コマンドディレクトリ形式のヘルプ
7. ACP の available commands の完全な表現

---

## 5. 新しいコマンドモデル

## 5.1 中核構造

統一された `CommandDescriptor` を導入する。これがすべてのコマンドの登録形式となる。

少なくとも以下の4つの部分を含む：

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

## 5.2 3種類のコマンド型の責務

### `prompt`

用途：

- スキル
- ファイルコマンド
- ワークフローのプロンプトコマンド
- プラグインスキル
- MCP プロンプト / スキル

特徴：

- プロンプト / スキルアセットを生成する
- デフォルトで interactive / ACP / non-interactive をサポートする
- ユーザーからも、モデルからも呼び出せる

### `local`

用途：

- クエリ系コマンド
- 設定系コマンド
- ヘッドレスで実行可能な状態系コマンド
- ほとんどのビルトインコマンドの中核実行エントリ

特徴：

- UI に依存しない
- ACP / 非対話モードの主要な実行タイプとなる

### `local-jsx`

用途：

- ピッカー
- パネル
- ウィザード
- インタラクティブ UI シェル

特徴：

- インタラクティブ UI のみを処理する
- これ以上唯一の実行エントリにしてはならない
- フォールバックまたは対応する local サブコマンドを提供する必要がある

---

## 6. コマンドソースモデル

## 6.1 外部ソースモデル

これはユーザーに表示するソースモデルであり、Claude Code のメンタルモデルと可能な限り一致させる：

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

このフィールド群は以下の用途に直接使用される：

- ヘルプのグループ化
- 補完のソースバッジ
- ACP available commands
- ドキュメントエクスポート

## 6.2 内部正規化モデル

外部の命名に縛られないよう、内部にさらに実装用のフィールドを追加する：

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

これにより以下が可能になる：

- 外部体験は Claude に合わせる
- 内部実装は Qwen の保守性を維持する

## 6.3 競合解決戦略

安定した `id` で統一管理し、表示名と入力名を分離する：

1. `id`：安定した一意識別子
2. `name`：入力時に使う主名
3. `userFacingName`：ヘルプ・補完での表示名

競合優先順位（提案）：

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. MCP 独立名前空間

---

## 7. 統一実行アーキテクチャ

## 7.1 `CommandRegistry`

責務：

1. すべてのローダー・プロバイダを集約する
2. 多次元インデックスを構築する
3. ヘルプ、補完、ACP、ドキュメントのビューを出力する
4. ユーザーから見えるコマンドとモデルから見えるコマンドの独立したビューを提供する

必須でサポートするプロバイダ：

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

一部のプロバイダが初回リリースで完全に実装されていない場合でも、スキーマとAPIは先にサポートしておく必要がある。

## 7.2 `CommandResolver`

責務：

1. スラッシュコマンドを解析する
2. エイリアスを解析する
3. サブコマンドパスを解析する
4. ミッドインプットのスラッシュトークンを認識する
5. 正規化された解決済みコマンドを出力する

## 7.3 `CommandExecutor`

責務：

1. 機能（capability）チェックを行う
2. `prompt | local | local-jsx` を実行する
3. 統一的に outcome を生成する
4. fallback / unsupported を処理する

## 7.4 `ModeAdapter`

以下の3つのアダプタに分割する必要がある：

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

これにより、3つのモードが同じコマンドレジストリとエグゼキュータを共有でき、それぞれがハードコードされることを防ぐ。

---

## 8. UI コマンド再構築の原則：中核コマンドとインタラクティブシェルの分離

これは ACP と非対話モードを真に利用可能にするための鍵である。

現在「ダイアログを開く」ことが本質であるコマンドは、すべて以下のように改造しなければならない：

1. インタラクティブシェル
2. 一連の local サブコマンド

### 最初に分割すべきコマンド

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

これは再構築における P0（最優先）であり、後付けの機能ではない。

## 9.1 目標

統一された **モデル呼び出し可能プロンプトコマンドレジストリ（Model-Invocable Prompt Command Registry）** を確立し、以下のアセットを1つのモデル呼び出し可能ビューに統合する：

1. バンドルスキル
2. ファイルコマンド
3. ワークフローのプロンプトコマンド
4. プラグインスキル
5. MCP プロンプト / MCP スキル

## 9.2 重要なフィールド

新たに追加する必要があるもの：

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` または最小限のパラメータ説明
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 `SkillTool` との関係

再構築後は、`SkillTool` が狭義のスキルだけを消費するべきではない。

以下のように変更する：

1. `CommandRegistry.getModelInvocablePromptCommands()` が統合ビューを生成する
2. `SkillTool` または将来の統一コマンドツールがそのビューを消費する
3. ユーザーのスラッシュコマンドとモデルのスキル呼び出しが、同じプロンプトコマンドアセットプールを共有する

これにより、Qwen は Claude が `/review`、`/commit`、`/openspec-apply` などの能力を扱う方法に近い体験を提供できるようになる。

---

## 10. ヘルプ / 補完 / 発見性の再設計

## 10.1 補完

補完候補には少なくとも以下を表示する：

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

並べ替えでは少なくとも以下を考慮する：

1. 完全一致
2. エイリアス一致
3. 最近使用
4. 前方一致
5. ファジー一致

## 10.2 ミッドインプットスラッシュコマンド

以下の機能を追加する必要がある：

1. カーソル付近のスラッシュトークン検出
2. ゴーストテキストヒント
3. Tab キーによる補完
4. 有効なコマンドトークンのハイライト

最初のフェーズではまず入力体験を合わせることを目標とする。より強力な「インラインコマンド実行セマンティクス」の導入は、今後の反復で検討する。

## 10.3 ヘルプ

ヘルプは単なる一覧リストではなく、完全なコマンドディレクトリとする。

少なくとも以下のグループに分ける：

1. ビルトインコマンド
2. バンドルスキル
3. スキルディレクトリコマンド
4. ワークフローコマンド
5. プラグインコマンド
6. プラグインスキル
7. 動的スキル
8. ビルトインプラグインスキル
9. MCP コマンド / MCP スキル

各コマンドには少なくとも以下を表示する：

1. 名前
2. パラメータヒント
3. 説明
4. ソース
5. サポートモード
6. モデル呼び出しの可否
7. サブコマンドの概要

---

## 11. ACP / 非対話モードの再構築

## 11.1 ホワイトリストの考え方を完全に廃止する

旧方式：

- ビルトイン allowlist
- FILE / SKILL の特殊判定
- その他の結果タイプは unsupported

新方式：

- 各コマンドが自身の capability を宣言する
- registry がフィルタリングを行う
- adapter が実行とフォールバックを担当する

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

少なくとも以下を含める必要がある：

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

## 12. ドキュメント、ヘルプ、補完が同じメタデータを共有する

再構築後は、以下が同じ registry ビューからエクスポートされる：

1. ヘルプ
2. 補完
3. ACP available commands
4. ドキュメントエクスポート

これは現在の「実装、ヘルプ、ドキュメントでコマンド面が一致しない」という問題を解決するためである。

---

## 13. 実施フェーズ

## フェーズ 1：基盤の再構築

成果物：

1. 新しい `CommandDescriptor`
2. 完全なソーススキーマ
3. 機能モデル (capability model)
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. 3種類の `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## フェーズ 2：中核コマンドの移行

成果物：

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

これらのコマンドはすべて「インタラクティブシェル + local サブコマンド」への再構築を完了する必要がある。

## フェーズ 3：モデル能力の連携

成果物：

1. `SkillTool` が統一 registry ビューに接続される
2. file command / bundled skill / mcp prompt / plugin skill が統一されたモデル呼び出し可能な集合に統合される
3. prompt command とスキルアセットが完全に統一される

## フェーズ 4：体験レイヤーを Claude に合わせる

成果物：

1. 最近使用順の並べ替え
2. ソースバッジ
3. パラメータヒント
4. モードバッジ
5. 完全なヘルプディレクトリ
6. ミッドインプットスラッシュコマンド体験
7. ドキュメントの自動エクスポートまたは検証

---

## 14. 受け入れ基準

完了後、少なくとも以下を満たす：

1. ヘルプ、補完、ACP、ドキュメントが完全なソースモデルを表現できる
2. 純粋な UI シェルコマンドを除き、ほとんどのビルトインコマンドが ACP / 非対話モードで使用できる
3. prompt command とモデルスキル呼び出しが同じアセットプールを使用する
4. コマンド体験がヘルプ、補完、ソース表現、パラメータヒント、ミッドインプット体験において Claude Code の 95% レベルに達する
5. ACP / 非対話モードのコマンド能力を維持するためにビルトイン allowlist に依存しなくなる

---

## 15. 最終判断

今回の再構築の本質は、「既存の `SlashCommand` にフィールドをいくつか追加する」ことではない。むしろ：

- **Qwen の内部アーキテクチャスタイルを用いて、外部体験において Claude Code と 95% 一致するコマンドプラットフォームを提供すること**

もし二者択一を迫られた場合：

- 内部実装が Claude に近い
- 外部体験が Claude に近い

本計画は明確に後者を選択する。