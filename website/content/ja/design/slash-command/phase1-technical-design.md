# Phase 1 技術設計ドキュメント：インフラストラクチャ再構築

## 1. 設計目標と制約

### 1.1 目標

- 統合されたコマンドメタデータモデルの確立。4つの次元をカバー：ソース（source）、実行タイプ（commandType）、モード機能（supportedModes）、可視性（userInvocable / modelInvocable）
- non-interactive/acp におけるハードコードされたホワイトリストを、capability-based フィルタリングで置き換える
- Phase 2/3 の機能拡張に対して安定した基盤インターフェースを提供する

### 1.2 厳格な制約

- **動作のゼロ変更**：non-interactive および acp モードでの既存の利用可能コマンドセットは変更しない（例外：MCP_PROMPT が誤ってブロックされていたバグ修正）
- **後方互換性**：`SlashCommand` インターフェースに追加するフィールドはすべてオプション、または適切なデフォルト値を持つ。既存のコマンドコードの即時修正は不要
- **新しいエグゼキュータは追加しない**：ModeAdapter / CommandExecutor などの新しい実行アーキテクチャは作成せず、既存の CommandService とフィルタリングロジックのみを拡張する
- **既存のコマンド機能は変更しない**：どのコマンドにも新しいサブコマンド（local）は追加せず、どのコマンドの action 実装も変更しない

---

## 2. 新しい型定義

### 2.1 ファイル位置

すべての新しい型定義は `packages/cli/src/ui/commands/types.ts` に配置。既存の `SlashCommand` インターフェースと同じファイル。

### 2.2 `ExecutionMode`

```typescript
/**
 * 実行モードの列挙。
 * - interactive：React/Ink UI モード（端末対話型）
 * - non_interactive：非対話型 CLI モード（テキスト/JSON出力）
 * - acp：ACP/Zed 統合モード
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * コマンドソースの列挙。Help のグループ化、補完バッジ、ACP available commands に使用。
 *
 * CommandKind との違い：
 * - CommandKind は内部ローダーの分類（4種類）、ロードロジックに影響
 * - CommandSource はユーザー向けのソース分類（9種類）、表示とメンタルモデルに影響
 *
 * 両者は重複する可能性があるが、責務が異なるため統合しない。
 */
export type CommandSource =
  | 'builtin-command' // ビルトインコマンド（BuiltinCommandLoader）
  | 'bundled-skill' // パッケージに同梱されたスキル（BundledSkillLoader）
  | 'skill-dir-command' // ユーザー/プロジェクトの .qwen/commands/ 下のファイルコマンド（FileCommandLoader、プラグイン以外）
  | 'plugin-command' // プラグインが提供するコマンド（FileCommandLoader、extensionName が空でない）
  | 'mcp-prompt'; // MCP サーバーが提供するプロンプト（McpPromptLoader）
// 以下のソースは予約、Phase 1 では対応する Loader は実装しないが、スキーマは先に定義：
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * コマンド実行タイプ。コマンドが「どのように実行されるか」を記述。
 *
 * - prompt：submit_prompt を生成し、モデルに内容を送信。skill、file command、MCP prompt に適用。
 *   デフォルトの supportedModes は全モード、デフォルトの modelInvocable は true。
 *
 * - local：ローカルでロジックを実行し、React/Ink UI に依存しない。message、stream_messages、
 *   submit_prompt、tool などのタイプを返すことができる。クエリ、設定、状態表示などのビルトインコマンドに適用。
 *   デフォルトの supportedModes は ['interactive']。他のモードに開放するには明示的に supportedModes を宣言する必要がある。
 *   これは Claude Code の supportsNonInteractive: true と同様の意味合い——非インタラクティブサポートは自動推論ではなく、明示的な宣言が必要。
 *
 * - local-jsx：React/Ink UI に依存するコマンド（ダイアログを開く、JSX コンポーネントをレンダリングするなど）。
 *   デフォルトの supportedModes は ['interactive'] のみ。
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 `SlashCommand` インターフェースの拡張

既存のインターフェースに新しいフィールドを追加。後方互換性を保つため**すべてオプション**：

```typescript
export interface SlashCommand {
  // ── 既存フィールド（変更なし）─────────────────────────────────────────────
  name: string;
  altNames?: string[];
  description: string;
  hidden?: boolean;
  completionPriority?: number;
  kind: CommandKind;
  extensionName?: string;
  action?: (...) => ...;
  completion?: (...) => ...;
  subCommands?: SlashCommand[];

  // ── Phase 1 追加：ソースと実行タイプ ──────────────────────────────────────
  /**
   * コマンドソース。Help グループ化、補完バッジ、ACP available commands 表示に使用。
   * 各 Loader が設定し、コマンド自身は宣言しない。
   * 将来 CommandKind が廃止された場合、source が唯一のソース識別子となる。
   */
  source?: CommandSource;

  /**
   * 表示用のソースラベル。ユーザー向け。
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * 各 Loader が設定し、コマンド自身で上書き可能。
   */
  sourceLabel?: string;

  /**
   * コマンド実行タイプ。
   * - 各 Loader がデフォルト値（prompt / local-jsx）を設定
   * - built-in コマンドは各コマンドファイル自身が宣言（local または local-jsx）
   * 宣言がない場合のデフォルト戦略は getEffectiveCommandType() を参照。
   */
  commandType?: CommandType;

  // ── Phase 1 追加：モード機能 ──────────────────────────────────────────
  /**
   * このコマンドが利用可能な実行モード。
   * 宣言がない場合は commandType からデフォルト値を推論（getEffectiveSupportedModes() を参照）。
   * 明示的な宣言は推論値より優先される。
   */
  supportedModes?: ExecutionMode[];

  // ── Phase 1 追加：可視性 ──────────────────────────────────────────────
  /**
   * ユーザーがスラッシュコマンドでこのコマンドを呼び出せるかどうか。
   * デフォルト true（ほとんどのコマンドは userInvocable）。
   */
  userInvocable?: boolean;

  /**
   * モデルがツールコールでこのコマンドを呼び出せるかどうか。
   * デフォルト false。prompt タイプのコマンド（skill、file command、MCP prompt）は true に設定すべき。
   * built-in コマンドはモデル呼び出しを許可しない（常に false）。
   */
  modelInvocable?: boolean;

  // ── Phase 3 予約：エクスペリエンスメタデータ（Phase 1 では定義のみ、未使用）──────────────────
  /**
   * パラメータヒント。補完メニューのコマンド名の後に表示。
   * 例："<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * モデルがこのコマンドをいつ呼び出すべきかを理解するための説明。
   * modelInvocable なコマンドの description に注入される。
   */
  whenToUse?: string;

  /**
   * 使用例。Help の目次や補完表示に使用。
   */
  examples?: string[];
}
```

---

## 3. 各 Loader のフィールド設定仕様

### 3.1 設定原則

- `source` と `sourceLabel` は Loader が `SlashCommand` 構築時に設定。コマンド自身は宣言しない
- `commandType`：Loader がデフォルト値を設定。built-in コマンドはコマンドファイル自身が宣言
- `supportedModes`：`getEffectiveSupportedModes()` で推論。明示的な設定は不要（デフォルト値を上書きする場合を除く）
- `modelInvocable`：Loader が設定。built-in コマンドは常に `false`、prompt タイプのコマンドは `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// source/sourceLabel/commandType は設定しない — 各コマンドファイル自身が宣言
// built-in コマンドの commandType は local または local-jsx のため、個別に注釈が必要

// source と sourceLabel を注入：
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // built-in コマンドはモデル呼び出しを許可しない
  });
}
```

### 3.3 `BundledSkillLoader`

```typescript
return skills.map((skill) => ({
  name: skill.name,
  description: skill.description,
  kind: CommandKind.SKILL,
  source: 'bundled-skill' as CommandSource,
  sourceLabel: 'Skill',
  commandType: 'prompt' as CommandType,
  userInvocable: true,
  modelInvocable: true,
  action: async (...) => { ... },
}));
```

### 3.4 `FileCommandLoader`

```typescript
// createSlashCommandFromDefinition 内：
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source は extensionName に応じて決定：
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // プラグインコマンドは当面モデル呼び出し不可、ユーザー/プロジェクトコマンドは可
  action: async (...) => { ... },
};
```

> **注**：プラグインコマンド（plugin-command）は当面 `modelInvocable` にしない。セキュリティ上の理由。後の Phase で必要に応じてユーザー設定で制御して開放可能。

### 3.5 `McpPromptLoader`

```typescript
const newPromptCommand: SlashCommand = {
  name: commandName,
  description: prompt.description || `Invoke prompt ${prompt.name}`,
  kind: CommandKind.MCP_PROMPT,
  source: 'mcp-prompt',
  sourceLabel: `MCP: ${serverName}`,
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: true,
  // ... その他の既存フィールド
};
```

---

## 4. Built-in コマンドの `commandType` 宣言仕様

### 4.1 分類基準

| commandType | 判断基準                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | action が `ui.addItem`（テキストタイプ）のみ使用、`message` / `stream_messages` / `submit_prompt` / `tool` を返し、React コンポーネントのレンダリングに依存しない               |
| `local-jsx` | action が `dialog` を返す、または `ui.addItem` を呼び出す際に JSX を含む複雑な型（`HistoryItemHelp`、`HistoryItemStats` など）を渡す、または `confirm_action` / `load_history` / `quit` に依存する |

> **注意**：`ui.addItem(message/error/info タイプ)` は `local`。`ui.addItem(help/stats/tools/about などの複雑な UI タイプ)` は `local-jsx`。

### 4.2 Built-in コマンド分類表

**`local` クラス**（`commandType: 'local'` を宣言。`supportedModes` は全モードと推論）：

| コマンドファイル        | コマンド名  | 説明                                                      |
| ----------------------- | ----------- | --------------------------------------------------------- |
| `btwCommand.ts`         | `btw`       | `submit_prompt` または `stream_messages` を返す           |
| `bugCommand.ts`         | `bug`       | `submit_prompt` または `stream_messages` を返す           |
| `compressCommand.ts`    | `compress`  | 既に executionMode 対応済み。`message`/`submit_prompt` を返す |
| `contextCommand.ts`     | `context`   | `message` を返す（UI レンダリングを含むがテキストで代替可能） |
| `exportCommand.ts`      | `export`    | ファイル I/O、`message` を返す                             |
| `initCommand.ts`        | `init`      | `submit_prompt`/`message`/`confirm_action` を返す          |
| `memoryCommand.ts`      | `memory`    | サブコマンドが `message`（ファイル I/O）を返す             |
| `planCommand.ts`        | `plan`      | `submit_prompt` を返す                                     |
| `summaryCommand.ts`     | `summary`   | 既に executionMode 対応済み。`submit_prompt`/`message` を返す |
| `insightCommand.ts`     | `insight`   | `stream_messages` を返す                                   |

> **注意**：`contextCommand` と `insightCommand` は現在 `addItem` を呼び出しているが、本質的にはテキストコンテンツであり、`local` に分類される。

**`local-jsx` クラス**（`commandType: 'local-jsx'` を宣言。`supportedModes` は `['interactive']` と推論）：

| コマンドファイル             | コマンド名        | headless にできない理由                               |
| ---------------------------- | ----------------- | ----------------------------------------------------- |
| `aboutCommand.ts`            | `about`           | `addItem(HistoryItemAbout)` — 複雑な UI コンポーネント |
| `agentsCommand.ts`           | `agents`          | `dialog: subagent_create/subagent_list`               |
| `approvalModeCommand.ts`     | `approval-mode`   | `dialog: approval-mode`                                |
| `arenaCommand.ts`            | `arena`           | `dialog: arena_*`                                     |
| `authCommand.ts`             | `auth`            | `dialog: auth`                                        |
| `clearCommand.ts`            | `clear`           | `ui.clear()` による直接的な端末操作                      |
| `copyCommand.ts`             | `copy`            | クリップボード操作、headless パスなし                  |
| `directoryCommand.tsx`       | `directory`       | JSX コンポーネント                                     |
| `docsCommand.ts`             | `docs`            | ブラウザを開く                                        |
| `editorCommand.ts`           | `editor`          | `dialog: editor`                                      |
| `extensionsCommand.ts`       | `extensions`      | `dialog: extensions_manage`                           |
| `helpCommand.ts`             | `help`            | `addItem(HistoryItemHelp)` — 複雑な Help UI            |
| `hooksCommand.ts`            | `hooks`           | `dialog: hooks`                                       |
| `ideCommand.ts`              | `ide`             | IDE プロセスの検出と対話                                |
| `languageCommand.ts`         | `language`        | `dialog` + `reloadCommands`                            |
| `mcpCommand.ts`              | `mcp`             | `dialog: mcp`                                         |
| `modelCommand.ts`            | `model`           | `dialog: model/fast-model`                             |
| `permissionsCommand.ts`      | `permissions`     | `dialog: permissions`                                  |
| `quitCommand.ts`             | `quit`            | `quit` リザルトタイプ                                   |
| `restoreCommand.ts`          | `restore`         | `load_history` リザルトタイプ                           |
| `resumeCommand.ts`           | `resume`          | `dialog: resume`                                       |
| `settingsCommand.ts`         | `settings`        | `dialog: settings`                                     |
| `setupGithubCommand.ts`      | `setup-github`    | `confirm_shell_commands` + 対話的操作                   |
| `skillsCommand.ts`           | `skills`          | `addItem(HistoryItemSkillsList)` — 複雑な UI            |
| `statsCommand.ts`            | `stats`           | `addItem(HistoryItemStats)` — 複雑な UI                 |
| `statuslineCommand.ts`       | `statusline`      | UI 状態設定                                            |
| `terminalSetupCommand.ts`    | `terminal-setup`  | 端末設定ウィザード                                      |
| `themeCommand.ts`            | `theme`           | `dialog: theme`                                        |
| `toolsCommand.ts`            | `tools`           | `addItem(HistoryItemTools)` — 複雑な UI                 |
| `trustCommand.ts`            | `trust`           | `dialog: trust`                                        |
| `vimCommand.ts`              | `vim`             | `toggleVimEnabled()` — UI 状態                          |

---

## 5. `getEffectiveSupportedModes` 推論ルール

この関数は Phase 1 の中核ロジック。既存のホワイトリストを置き換え、`filterCommandsForMode` から呼び出される。

```typescript
/**
 * コマンドの実際のサポートモードリストを取得する。
 *
 * 推論優先順位（高い順）：
 * 1. コマンドが明示的に宣言した supportedModes（最優先）
 * 2. commandType に基づく推論
 * 3. CommandKind に基づくフォールバック（後方互換性）
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // 優先順位 1：明示的な宣言
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // 優先順位 2：commandType に基づく推論
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // prompt タイプは UI 依存がなく、デフォルトで全モード利用可能
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // local タイプはデフォルトで interactive のみ（安全側）。
        // 非インタラクティブサポートが必要なコマンドは明示的に supportedModes を宣言する必要がある（Claude Code の supportsNonInteractive: true に相当）。
        // Phase 2 で個別に検証・解除し、未適応のコマンドが headless 呼び出し元に誤って公開されるのを防ぐ。
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // 優先順位 3：フォールバック（CommandKind に基づく。旧コードとの後方互換性）
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // built-in コマンドで commandType が宣言されていない場合は安全側（interactive のみ）
      // Phase 1 完了後、このブランチはヒットしなくなるはず（すべての built-in に commandType が設定される）
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // これら 3 種類のコマンドの action は本質的に UI 依存がなく、過去の動作も全モード利用可能
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * supportedModes に従って現在のモードに適したコマンドをフィルタリングする。
 * 従来の filterCommandsForNonInteractive 関数を置き換える。
 */
export function filterCommandsForMode(
  commands: readonly SlashCommand[],
  mode: ExecutionMode,
): SlashCommand[] {
  return commands.filter((cmd) =>
    getEffectiveSupportedModes(cmd).includes(mode),
  );
}
```

---

## 6. `CommandService` インターフェース拡張

`packages/cli/src/services/CommandService.ts` に 2 つの新しいメソッドを追加：

```typescript
export class CommandService {
  // ── 既存メソッド（変更なし）────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Phase 1 追加メソッド ──────────────────────────────────────────────────

  /**
   * 指定された実行モードで利用可能なコマンドのリストを返す。
   * 従来のホワイトリスト + filterCommandsForNonInteractive の組み合わせを置き換える。
   *
   * @param mode 対象実行モード
   * @returns そのモードに適したコマンドのリスト（hidden コマンドは除外）
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * modelInvocable が true の全コマンドを返す。
   * Phase 2 で SkillTool がこのメソッドを消費する。Phase 1 ではインターフェースのみ提供。
   *
   * @returns モデルが呼び出し可能なコマンドのリスト
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **注意**：`getEffectiveSupportedModes` と `filterCommandsForMode` は `CommandService` 内部で使用するユーティリティ関数として、あるいは独立した `packages/cli/src/services/commandUtils.ts` ファイルに抽出してエクスポートし、テストや再利用を容易にすることを推奨。

---

## 7. `nonInteractiveCliCommands.ts` のリファクタリング

### 7.1 削除内容

```typescript
// ❌ 削除
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ 削除
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 追加内容

```typescript
// ✅ 追加（または commandUtils からインポート）
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 `handleSlashCommand` 関数シグネチャ変更

```typescript
// ❌ 旧シグネチャ
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ 新シグネチャ（allowedBuiltinCommandNames を削除）
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 内部実装の変更

```typescript
// 旧：
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// 新：
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 `getAvailableCommands` 関数シグネチャ変更

```typescript
// ❌ 旧シグネチャ
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ 新シグネチャ
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> 新しい `mode` パラメータが従来のホワイトリストパラメータを置き換える。ACP Session から呼び出す場合は `'acp'`、non-interactive から呼び出す場合は `'non_interactive'` を明示的に指定する。

---

## 8. `Session.ts`（ACP）呼び出しの変更

```typescript
// ❌ 旧呼び出し
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // デフォルトホワイトリストを渡さない
);

// ✅ 新呼び出し（変更なし。不要になったデフォルトパラメータを削除）
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ 旧呼び出し
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ 新呼び出し（mode を明示的に指定）
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. ファイル変更概要

### 9.1 変更するファイル

| ファイル                                                                   | 変更内容                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/commands/types.ts`                                    | `ExecutionMode`、`CommandSource`、`CommandType` 型を追加。`SlashCommand` インターフェースを拡張  |
| `packages/cli/src/services/CommandService.ts`                              | `getCommandsForMode()`、`getModelInvocableCommands()` メソッドを追加                             |
| `packages/cli/src/nonInteractiveCliCommands.ts`                            | ホワイトリスト定数と旧フィルタリング関数を削除。2 つのエクスポート関数のシグネチャを更新。`filterCommandsForMode` を導入 |
| `packages/cli/src/acp-integration/session/Session.ts`                      | `handleSlashCommand` と `getAvailableCommands` の呼び出しを更新                                   |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                        | コマンド構築時に `source: 'builtin-command'`、`sourceLabel: 'Built-in'`、`modelInvocable: false` を注入 |
| `packages/cli/src/services/BundledSkillLoader.ts`                          | `source: 'bundled-skill'`、`commandType: 'prompt'`、`modelInvocable: true` を注入                 |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts`    | `source`、`commandType: 'prompt'`、`modelInvocable`（extensionName に応じて）を注入                |
| `packages/cli/src/services/McpPromptLoader.ts`                             | `source: 'mcp-prompt'`、`commandType: 'prompt'`、`modelInvocable: true` を注入                    |
| **各 built-in コマンドファイル（local 10 個 + local-jsx 27 個）**           | `commandType: 'local'` または `commandType: 'local-jsx'` を宣言                                   |

### 9.2 新規作成するファイル

| ファイル                                       | 内容                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts`    | `getEffectiveSupportedModes()`、`filterCommandsForMode()` ユーティリティ関数とそのエクスポート |

### 9.3 変更しないファイル

- `packages/cli/src/utils/commands.ts`（`parseSlashCommand` は修正不要）
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts`（interactive パスは修正不要）
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts`（スタブ UI は修正不要）
- すべてのコマンドの `action` 実装（Phase 1 ではコマンドの動作は変更しない）

---

## 10. 動作影響分析

### 10.1 変更点まとめ

| シナリオ                                | 旧動作                      | 新動作                                                    | 性質       |
| --------------------------------------- | --------------------------- | --------------------------------------------------------- | ---------- |
| non-interactive で `/init` を実行       | ✅ 許可（ホワイトリスト）  | ✅ 許可（`commandType: local`）                            | 変更なし   |
| non-interactive で `/summary` を実行    | ✅ 許可                    | ✅ 許可                                                   | 変更なし   |
| non-interactive で `/compress` を実行   | ✅ 許可                    | ✅ 許可                                                   | 変更なし   |
| non-interactive で `/btw` を実行        | ✅ 許可                    | ✅ 許可                                                   | 変更なし   |
| non-interactive で `/bug` を実行        | ✅ 許可                    | ✅ 許可                                                   | 変更なし   |
| non-interactive で `/context` を実行    | ✅ 許可                    | ✅ 許可                                                   | 変更なし   |
| non-interactive で `/model` を実行      | ❌ unsupported             | ❌ unsupported（`commandType: local-jsx`）                 | 変更なし   |
| non-interactive で file command を実行  | ✅ 許可（CommandKind.FILE） | ✅ 許可（`commandType: prompt`）                           | 変更なし   |
| non-interactive で bundled skill を実行 | ✅ 許可（CommandKind.SKILL）| ✅ 許可（`commandType: prompt`）                           | 変更なし   |
| non-interactive で MCP prompt を実行    | ❌ CommandKind でブロック   | ✅ 許可（`commandType: prompt`）                           | **バグ修正** |
| non-interactive で `/export` を実行     | ❌ ホワイトリスト外        | ❌ 不許可（`commandType: local`、デフォルト interactive のみ） | 変更なし   |
| non-interactive で `/memory` を実行     | ❌ ホワイトリスト外        | ❌ 不許可（`commandType: local`、デフォルト interactive のみ） | 変更なし   |
| non-interactive で `/plan` を実行       | ❌ ホワイトリスト外        | ❌ 不許可（`commandType: local`、デフォルト interactive のみ） | 変更なし   |
> **`local` コマンドに関する保守的なデフォルト戦略について**: `commandType: 'local'` のデフォルトの `supportedModes` は `['interactive']` です。これは Claude Code の設計と一致しています。`local` タイプのコマンドが非インタラクティブモードで実行されるには、明示的に `supportsNonInteractive: true` を宣言する必要があります。Phase 1 でホワイトリストに含まれていた 6 つのコマンド（`init`、`summary`、`compress`、`btw`、`bug`、`context`）は、明示的に `supportedModes: ['interactive', 'non_interactive', 'acp']` を宣言することで、元のホワイトリストの効果と同等に置き換えられます。Phase 2 で拡張が必要なコマンド（`/export`、`/memory`、`/plan` など）は、アクションの実装が headless フレンドリーであることを検証した上で、1 つずつアンロックされます。

---

## 10.2 Phase 2 のモード差分コマンド：デュアル登録パターン

Phase 2 において、「インタラクティブモードでは UI、非インタラクティブモードではテキスト出力」が必要なコマンド（例: `/model`）については、単一コマンドの `action` 内で分岐するのではなく、**デュアル登録パターン** を採用する必要があります。

これは Claude Code の標準的なパターンであり、`/context` を例にとると（`src/commands/context/index.ts` 参照）: 同名の `Command` オブジェクトが 2 つあり、1 つは `local-jsx` でインタラクティブのみ、もう 1 つは `local` で非インタラクティブのみ、`isEnabled()` で排他的に動作します。

Qwen Code は Phase 2 でも同等の方法を採用し、`isEnabled()` の代わりに `supportedModes` で排他制御を行います。

```typescript
// ① インタラクティブモード版: local-jsx、interactive のみ
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // 明示的に限定
  // action: ダイアログを開いて model を選択
};

// ② 非インタラクティブ/acp 版: local、ヘッドレス呼び出し側に明示的に開放
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // 明示的に限定
  // action: model の読み取り/設定、メッセージを返す（プレーンテキスト）
};
```

2 つのオブジェクトは同名で、`supportedModes` が排他的であり、`filterCommandsForMode` が自動的に正しいバージョンを選択します。Claude Code の `isEnabled()` による排他と比較して、`supportedModes` によるフィルターはより明示的でテストが容易であり、実行時の環境検出が不要です。

**Phase 1 ではデュアル登録コマンドは実装しません**。このパターンは Phase 2 の実装規範としてここに予約しておくものです。

---

## 11. テスト戦略

### 11.1 新規ユーティリティ関数のテスト

`packages/cli/src/services/commandUtils.test.ts`（新規ファイル）にて:

```typescript
describe('getEffectiveSupportedModes', () => {
  it('明示的な supportedModes が commandType からの推論より優先される', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // 明示的な制限
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local はすべてのモードと推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx は interactive のみと推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt はすべてのモードと推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType が未宣言で CommandKind.BUILT_IN の場合、interactive にフォールバックする', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType が未宣言で CommandKind.FILE の場合、すべてのモードにフォールバックする', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType が未宣言で CommandKind.MCP_PROMPT の場合、すべてのモードにフォールバックする（既存の制限を修正）', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('non_interactive モードでコマンドを正しくフィルタリングする', () => { ... });
  it('acp モードでコマンドを正しくフィルタリングする', () => { ... });
  it('hidden コマンドはフィルタリングしない（filterCommandsForMode は hidden を処理せず、CommandService が処理する）', () => { ... });
});
```

### 11.2 `nonInteractiveCliCommands.test.ts` の更新

- `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` への参照をすべて削除
- `allowedBuiltinCommandNames` パラメータのテストケースを削除
- 新規: commandType: local のコマンドが non-interactive でフィルターを通過することを検証
- 新規: commandType: local-jsx のコマンドが non-interactive でフィルターされることを検証
- 維持: file command / skill command が non-interactive でフィルターを通過することを検証

### 11.3 `CommandService.test.ts` の更新

- `getCommandsForMode` のテストケースを新規追加
- `getModelInvocableCommands` のテストケースを新規追加

### 11.4 各ローダーのテスト

- `BuiltinCommandLoader.test.ts`：すべてのコマンドに `source: 'builtin-command'` があることを検証
- `BundledSkillLoader.test.ts`：`source: 'bundled-skill'` と `modelInvocable: true` を検証
- `FileCommandLoader.test.ts`：ユーザーコマンドに `source: 'skill-dir-command'`、プラグインコマンドに `source: 'plugin-command'` があることを検証
- `McpPromptLoader.test.ts`：`source: 'mcp-prompt'` と `modelInvocable: true` を検証

---

## 12. 実装順序

以下の順序で実装することを推奨します。各ステップは独立してコミットおよびレビューが可能です。

**Step 1**（約 30 分）：`types.ts` を修正し、`ExecutionMode`、`CommandSource`、`CommandType`、`SlashCommand` の新しいフィールドを追加
→ 純粋な型変更であり、TypeScript のコンパイルチェックで確認可能

**Step 2**（約 1 時間）：`commandUtils.ts` を新規作成し、`getEffectiveSupportedModes` と `filterCommandsForMode` を実装、同時に `commandUtils.test.ts` を新規作成
→ ユニットテストでコアロジックをカバー

**Step 3**（約 1 時間）：`nonInteractiveCliCommands.ts` をリファクタリングし、ホワイトリストを削除して `filterCommandsForMode` を導入、関数シグネチャを更新
→ 動作は等価（Phase 1 の保守的戦略: local 系コマンドは明示的に `supportedModes: ['interactive']` を記述）

**Step 4**（約 30 分）：`CommandService.ts` を更新し、2 つの新しいメソッドを追加

**Step 5**（約 2 時間）：すべての組み込みコマンドファイルに `commandType` 宣言を追加
→ 1 つずつ分類の正確さを確認

**Step 6**（約 1.5 時間）：すべてのローダーを更新し、`source`、`sourceLabel`、`commandType`、`modelInvocable` を注入

**Step 7**（約 30 分）：`Session.ts` の呼び出しシグネチャを更新

**Step 8**（約 1 時間）：すべてのテストを実行し、失敗したケースを修正、スナップショットを更新

**Step 9**（約 30 分）：コードレビューの自己チェック: ホワイトリストが完全に削除され、呼び出しの漏れがないことを確認

---

## 13. 受け入れチェックリスト

- [ ] TypeScript コンパイルエラーなし（`npm run typecheck`）
- [ ] `npm run lint` で新しい lint エラーなし
- [ ] 既存の全テストが成功（`cd packages/cli && npx vitest run`）
- [ ] `commandUtils.test.ts` の新規テストがすべて成功
- [ ] `getEffectiveSupportedModes` が 7 つのケースすべてをカバー
- [ ] `filterCommandsForMode` が interactive / non_interactive / acp の 3 モードをカバー
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` がコードベース全体で参照されていない（`grep` で確認）
- [ ] `filterCommandsForNonInteractive` 関数がコードベース全体で参照されていない
- [ ] すべての組み込みコマンドに `commandType` フィールドがある
- [ ] すべてのローダーが出力するコマンドに `source` および `sourceLabel` フィールドがある
- [ ] `BundledSkillLoader` / `FileCommandLoader`（ユーザーコマンド）/ `McpPromptLoader` が出力するコマンドは `modelInvocable: true`
- [ ] `BuiltinCommandLoader` が出力するコマンドは `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` がリファクタリング前と等価なコマンドセットを返す
- [ ] MCP prompt コマンドが non-interactive モードで誤ってブロックされなくなる