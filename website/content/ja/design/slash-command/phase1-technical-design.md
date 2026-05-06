# Phase 1 技術設計ドキュメント：インフラストラクチャ再構築

## 1. 設計目標と制約

### 1.1 目標

- 統一されたコマンドメタデータモデルを構築し、ソース（source）、実行タイプ（commandType）、モード機能（supportedModes）、可視性（userInvocable / modelInvocable）の4つの次元をカバーする
- capability-based フィルタリングを用いて、non-interactive/acp におけるハードコードされたホワイトリストを置き換える
- Phase 2/3 の機能拡張に向けた安定した基盤インターフェースを提供する

### 1.2 必須制約

- **動作変更なし**：non-interactive および acp モードにおける既存の利用可能コマンドセットは変更しない（例外：MCP_PROMPT が誤ってブロックされる問題の修正は bug fix に該当）
- **後方互換性**：`SlashCommand` インターフェースの新規フィールドはすべてオプショナル、または適切なデフォルト値を持ち、既存のコマンドコードは即時修正が不要
- **新規エグゼキュータの追加なし**：ModeAdapter / CommandExecutor などの新しい実行アーキテクチャは作成せず、既存の CommandService とフィルタリングロジックのみを拡張する
- **既存コマンド機能の変更なし**：いかなるコマンドにも local サブコマンドを追加せず、いかなるコマンドの action 実装も変更しない

---

## 2. 新規型定義

### 2.1 ファイル配置

新規型定義はすべて `packages/cli/src/ui/commands/types.ts` に配置し、既存の `SlashCommand` インターフェースと同じファイルに含める。

### 2.2 `ExecutionMode`

```typescript
/**
 * 実行モードの列挙型。
 * - interactive：React/Ink UI モード（ターミナルインタラクション）
 * - non_interactive：非インタラクティブ CLI モード（テキスト/JSON 出力）
 * - acp：ACP/Zed 統合モード
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * コマンドのソースを定義する列挙型。Help のグループ化、補完バッジ、ACP available commands の表示に使用。
 *
 * CommandKind との違い：
 * - CommandKind は内部ローダー分類（4種類）であり、読み込みロジックに影響する
 * - CommandSource はユーザー向けのソース分類（9種類）であり、表示とメンタルモデルに影響する
 *
 * 両者は重複する可能性があるが、責務が異なるため統合しない。
 */
export type CommandSource =
  | 'builtin-command' // 組み込みコマンド（BuiltinCommandLoader）
  | 'bundled-skill' // パッケージに同梱される skill（BundledSkillLoader）
  | 'skill-dir-command' // ユーザー/プロジェクト .qwen/commands/ 配下のファイルコマンド（FileCommandLoader、プラグイン以外）
  | 'plugin-command' // プラグインが提供するコマンド（FileCommandLoader、extensionName が空でない）
  | 'mcp-prompt'; // MCP server が提供する prompt（McpPromptLoader）
// 以下のソースは予約済み。Phase 1 では対応 Loader を実装しないが、スキーマは事前に定義：
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * コマンドの実行タイプ。コマンドが「どのように実行されるか」を記述する。
 *
 * - prompt：submit_prompt を生成し、コンテンツをモデルに送信する。skill、file command、MCP prompt に適用。
 *   デフォルトの supportedModes は全モード、デフォルトの modelInvocable は true。
 *
 * - local：ローカルでロジックを実行し、React/Ink UI に依存しない。message、stream_messages、
 *   submit_prompt、tool などのタイプを返す。クエリ系、設定系、ステータス系の built-in コマンドに適用。
 *   デフォルトの supportedModes は ['interactive']。他のモードに開放するには明示的に supportedModes を宣言する必要がある。
 *   これは Claude Code の supportsNonInteractive: true のセマンティクスと一致する——非インタラクティブサポートは自動推論ではなく明示的に宣言する必要がある。
 *
 * - local-jsx：React/Ink UI に依存するコマンド（dialog の開閉、JSX コンポーネントのレンダリングなど）。
 *   デフォルトの supportedModes は ['interactive'] のみ。
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 `SlashCommand` インターフェースの拡張

既存インターフェースに新フィールドを追加する。**すべてオプショナル**として後方互換性を維持する：

```typescript
export interface SlashCommand {
  // ── 既存フィールド（変更なし） ──────────────────────────────────────────────
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

  // ── Phase 1 新規追加：ソースと実行タイプ ──────────────────────────────────────
  /**
   * コマンドのソース。Help のグループ化、補完バッジ、ACP available commands の表示に使用。
   * 各 Loader によって設定され、コマンド自身では宣言しない。
   * 将来的に CommandKind を廃止する場合、source が唯一のソース識別子となる。
   */
  source?: CommandSource;

  /**
   * ユーザー向けの表示用ソースラベル。
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * 各 Loader によって設定され、コマンド自身で上書き可能。
   */
  sourceLabel?: string;

  /**
   * コマンドの実行タイプ。
   * - 各 Loader がデフォルト値（prompt/local-jsx）を設定
   * - 組み込みコマンドはコマンドファイル自身で宣言（local または local-jsx）
   * 未宣言時のデフォルト戦略は getEffectiveCommandType() を参照。
   */
  commandType?: CommandType;

  // ── Phase 1 新規追加：モード機能 ──────────────────────────────────────────
  /**
   * このコマンドが利用可能な実行モード。
   * 未宣言時は commandType に基づいてデフォルト値が推論される（getEffectiveSupportedModes() を参照）。
   * 明示的な宣言は推論値より優先される。
   */
  supportedModes?: ExecutionMode[];

  // ── Phase 1 新規追加：可視性 ──────────────────────────────────────────────
  /**
   * ユーザーが slash command 経由でこのコマンドを呼び出せるかどうか。
   * デフォルトは true（ほぼすべてのコマンドが userInvocable）。
   */
  userInvocable?: boolean;

  /**
   * モデルが tool call 経由でこのコマンドを呼び出せるかどうか。
   * デフォルトは false。prompt タイプのコマンド（skill、file command、MCP prompt）は true に設定する必要がある。
   * 組み込みコマンドはモデル呼び出しを許可しない（常に false）。
   */
  modelInvocable?: boolean;

  // ── Phase 3 予約：UX メタデータ（Phase 1 では定義のみ、使用しない）──────────────────
  /**
   * 引数ヒント。補完メニューのコマンド名後に表示される。
   * 例："<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * モデルがいつこのコマンドを呼び出すべきかを理解するための説明。
   * modelInvocable コマンドの description に注入される。
   */
  whenToUse?: string;

  /**
   * 使用例。Help ディレクトリと補完表示に使用。
   */
  examples?: string[];
}
```

---

## 3. 各 Loader におけるフィールド設定ルール

### 3.1 設定の原則

- `source` と `sourceLabel` は Loader が `SlashCommand` 構築時に設定し、コマンド自身では宣言しない
- `commandType`：Loader がデフォルト値を設定。組み込みコマンドはコマンドファイル自身で宣言
- `supportedModes`：`getEffectiveSupportedModes()` により推論されるため、明示的な設定は不要（デフォルト値を上書きする場合を除く）
- `modelInvocable`：Loader が設定。組み込みコマンドは常に `false`、prompt タイプのコマンドは `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// source/sourceLabel/commandType は設定しない — 各コマンドファイルで自己宣言するため
// 組み込みコマンドの commandType は local または local-jsx であり、個別に指定する必要があるため

// source と sourceLabel を注入：
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // 組み込みコマンドはモデル呼び出しを許可しない
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
  modelInvocable: !extensionName, // プラグインコマンドは当面モデル呼び出しを許可しない。ユーザー/プロジェクトコマンドは許可
  action: async (...) => { ... },
};
```

> **注**：プラグインコマンド（plugin-command）はセキュリティリスクを回避するため、当面 `modelInvocable` とはマークしない。以降の Phase で必要に応じて開放し、ユーザーが設定で制御できるようにする。

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

## 4. 組み込みコマンドの `commandType` 宣言ルール

### 4.1 分類基準

| commandType | 判断基準                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | action が `ui.addItem`（テキストタイプ）のみを使用し、`message` / `stream_messages` / `submit_prompt` / `tool` を返す。React コンポーネントのレンダリングに依存しない                                               |
| `local-jsx` | action が `dialog` を返す、または `ui.addItem` 呼び出し時に JSX を含む複雑なタイプ（例：`HistoryItemHelp`、`HistoryItemStats`）を渡す、または `confirm_action` / `load_history` / `quit` に依存する |

> **注意**：`ui.addItem(message/error/info タイプ)` は `local`。`ui.addItem(help/stats/tools/about などの複雑な UI タイプ)` は `local-jsx`。

### 4.2 組み込みコマンド分類表

**`local` クラス**（`commandType: 'local'` を宣言。`supportedModes` は全モードに推論）：

| コマンドファイル             | コマンド名     | 説明                                                    |
| -------------------- | ---------- | ------------------------------------------------------- |
| `btwCommand.ts`      | `btw`      | `submit_prompt` または `stream_messages` を返す               |
| `bugCommand.ts`      | `bug`      | `submit_prompt` または `stream_messages` を返す               |
| `compressCommand.ts` | `compress` | 既存の executionMode 対応済み。`message`/`submit_prompt` を返す |
| `contextCommand.ts`  | `context`  | `message` を返す（UI レンダリングを含むがテキストで代替可能）                |
| `exportCommand.ts`   | `export`   | ファイル I/O。`message` を返す                                |
| `initCommand.ts`     | `init`     | `submit_prompt`/`message`/`confirm_action` を返す         |
| `memoryCommand.ts`   | `memory`   | サブコマンドが `message` を返す（ファイル I/O）                        |
| `planCommand.ts`     | `plan`     | `submit_prompt` を返す                                    |
| `summaryCommand.ts`  | `summary`  | 既存の executionMode 対応済み。`submit_prompt`/`message` を返す |
| `insightCommand.ts`  | `insight`  | `stream_messages` を返す                                  |

> **注意**：`contextCommand` と `insightCommand` は現在 `addItem` 呼び出しを返すが、本質はテキストコンテンツであるため `local` に分類される。

**`local-jsx` クラス**（`commandType: 'local-jsx'` を宣言。`supportedModes` は `['interactive']` に推論）：

| コマンドファイル                  | コマンド名           | headless で実行できない理由                       |
| ------------------------- | ---------------- | ------------------------------------------ |
| `aboutCommand.ts`         | `about`          | `addItem(HistoryItemAbout)` — 複雑な UI コンポーネント |
| `agentsCommand.ts`        | `agents`         | `dialog: subagent_create/subagent_list`    |
| `approvalModeCommand.ts`  | `approval-mode`  | `dialog: approval-mode`                    |
| `arenaCommand.ts`         | `arena`          | `dialog: arena_*`                          |
| `authCommand.ts`          | `auth`           | `dialog: auth`                             |
| `clearCommand.ts`         | `clear`          | `ui.clear()` によるターミナル直接操作                  |
| `copyCommand.ts`          | `copy`           | クリップボード操作。headless パスなし               |
| `directoryCommand.tsx`    | `directory`      | JSX コンポーネント                                   |
| `docsCommand.ts`          | `docs`           | ブラウザを開く                                 |
| `editorCommand.ts`        | `editor`         | `dialog: editor`                           |
| `extensionsCommand.ts`    | `extensions`     | `dialog: extensions_manage`                |
| `helpCommand.ts`          | `help`           | `addItem(HistoryItemHelp)` — 複雑な Help UI  |
| `hooksCommand.ts`         | `hooks`          | `dialog: hooks`                            |
| `ideCommand.ts`           | `ide`            | IDE プロセスの検出とインタラクション                         |
| `languageCommand.ts`      | `language`       | `dialog` + `reloadCommands`                |
| `mcpCommand.ts`           | `mcp`            | `dialog: mcp`                              |
| `modelCommand.ts`         | `model`          | `dialog: model/fast-model`                 |
| `permissionsCommand.ts`   | `permissions`    | `dialog: permissions`                      |
| `quitCommand.ts`          | `quit`           | `quit` result タイプ                         |
| `restoreCommand.ts`       | `restore`        | `load_history` result タイプ                 |
| `resumeCommand.ts`        | `resume`         | `dialog: resume`                           |
| `settingsCommand.ts`      | `settings`       | `dialog: settings`                         |
| `setupGithubCommand.ts`   | `setup-github`   | `confirm_shell_commands` + インタラクティブ操作      |
| `skillsCommand.ts`        | `skills`         | `addItem(HistoryItemSkillsList)` — 複雑な UI |
| `statsCommand.ts`         | `stats`          | `addItem(HistoryItemStats)` — 複雑な UI      |
| `statuslineCommand.ts`    | `statusline`     | UI ステータス設定                                |
| `terminalSetupCommand.ts` | `terminal-setup` | ターミナル設定ウィザード                               |
| `themeCommand.ts`         | `theme`          | `dialog: theme`                            |
| `toolsCommand.ts`         | `tools`          | `addItem(HistoryItemTools)` — 複雑な UI      |
| `trustCommand.ts`         | `trust`          | `dialog: trust`                            |
| `vimCommand.ts`           | `vim`            | `toggleVimEnabled()` — UI ステータス             |

---

## 5. `getEffectiveSupportedModes` の推論ルール

この関数は Phase 1 のコアロジックであり、既存のホワイトリストを置き換え、`filterCommandsForMode` から呼び出される。

```typescript
/**
 * コマンドが実際にサポートするモードのリストを取得する。
 *
 * 推論の優先度（高 → 低）：
 * 1. コマンドが明示的に宣言した supportedModes（最優先）
 * 2. commandType に基づく推論
 * 3. CommandKind に基づくフォールバック（旧コードとの後方互換性維持）
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // 優先度 1：明示的な宣言
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // 優先度 2：commandType に基づく推論
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // prompt タイプは UI 依存がないため、デフォルトで全モードで利用可能
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // local タイプの保守的なデフォルト：interactive のみ。
        // 非インタラクティブサポートが必要なコマンドは明示的に supportedModes を宣言する必要がある（Claude Code の supportsNonInteractive: true に相当）。
        // Phase 2 で個別に検証・解放し、未対応のコマンドが headless 呼び出し元に誤って公開されるのを防ぐ。
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // 優先度 3：フォールバック（CommandKind に基づく。旧コードとの後方互換性維持）
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // 組み込みコマンドで commandType が未宣言の場合の保守的なデフォルト（interactive のみ）
      // この分岐は Phase 1 完了後には到達しないはず（すべての組み込みコマンドに commandType が設定されるため）
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // これら3種類のコマンドの action は本質的に UI 依存がなく、歴史的にも全モードで利用可能
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * supportedModes に基づき、現在のモードに適したコマンドをフィルタリングする。
 * 既存の filterCommandsForNonInteractive 関数を置き換える。
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

## 6. `CommandService` インターフェースの拡張

`packages/cli/src/services/CommandService.ts` に以下の2つのメソッドを追加する：

```typescript
export class CommandService {
  // ── 既存メソッド（変更なし）────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Phase 1 新規追加メソッド ──────────────────────────────────────────────────

  /**
   * 指定された実行モードで利用可能なコマンドのリストを返す。
   * 既存のホワイトリスト + filterCommandsForNonInteractive の組み合わせを置き換える。
   *
   * @param mode 対象の実行モード
   * @returns 当該モードに適したコマンドリスト（hidden コマンドを除く）
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * modelInvocable が true のすべてのコマンドを返す。
   * Phase 2 で SkillTool がこのメソッドを消費する。Phase 1 ではインターフェースのみ提供。
   *
   * @returns モデルが呼び出せるコマンドリスト
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **注意**：`getEffectiveSupportedModes` と `filterCommandsForMode` は `CommandService` 内部で使用するユーティリティ関数とするか、独立した `packages/cli/src/services/commandUtils.ts` ファイルに抽出してエクスポートし、テストと再利用を可能にする。

---

## 7. `nonInteractiveCliCommands.ts` のリファクタリング

### 7.1 削除対象

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

### 7.2 追加対象

```typescript
// ✅ 追加（または commandUtils からインポート）
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 `handleSlashCommand` 関数シグネチャの変更

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

### 7.5 `getAvailableCommands` 関数シグネチャの変更

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

> 既存のホワイトリストパラメータに代わり `mode` パラメータを追加。ACP Session からの呼び出し時は `'acp'` を明示的に指定し、non-interactive 呼び出し時は `'non_interactive'` を指定する。

---

## 8. `Session.ts`（ACP）呼び出しの変更

```typescript
// ❌ 旧呼び出し
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // 渡さない（デフォルトのホワイトリストを使用）
);

// ✅ 新呼び出し（変更なし。存在しなくなったデフォルトパラメータを削除）
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

### 9.1 変更対象ファイル

| ファイル                                                                    | 変更内容                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | `ExecutionMode`、`CommandSource`、`CommandType` 型を追加。`SlashCommand` インターフェースを拡張              |
| `packages/cli/src/services/CommandService.ts`                           | `getCommandsForMode()`、`getModelInvocableCommands()` メソッドを追加                                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | ホワイトリスト定数と旧フィルタ関数を削除。2つのエクスポート関数のシグネチャを更新。`filterCommandsForMode` を導入                 |
| `packages/cli/src/acp-integration/session/Session.ts`                   | `handleSlashCommand` と `getAvailableCommands` の呼び出しを更新                                         |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | コマンド構築時に `source: 'builtin-command'`、`sourceLabel: 'Built-in'`、`modelInvocable: false` を注入 |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | `source: 'bundled-skill'`、`commandType: 'prompt'`、`modelInvocable: true` を注入                  |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | `source`、`commandType: 'prompt'`、`modelInvocable`（extensionName に応じて）を注入                   |
| `packages/cli/src/services/McpPromptLoader.ts`                          | `source: 'mcp-prompt'`、`commandType: 'prompt'`、`modelInvocable: true` を注入                     |
| **各組み込みコマンドファイル（10 個 local + 27 個 local-jsx）**               | `commandType: 'local'` または `commandType: 'local-jsx'` を宣言                                        |

### 9.2 新規追加ファイル

| ファイル                                        | 内容                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | `getEffectiveSupportedModes()`、`filterCommandsForMode()` ユーティリティ関数とそのエクスポート |

### 9.3 変更なしのファイル

- `packages/cli/src/utils/commands.ts`（`parseSlashCommand` は修正不要）
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts`（interactive パスは修正不要）
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts`（スタブ UI は修正不要）
- 全コマンドの `action` 実装（Phase 1 ではいかなるコマンドの動作も変更しない）

---

## 10. 動作への影響分析

### 10.1 変更点まとめ

| シナリオ                                 | 旧動作                       | 新動作                                                   | 性質        |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- | ----------- |
| non-interactive での `/init` 実行       | ✅ 許可（ホワイトリスト）            | ✅ 許可（`commandType: local`）                          | 変更なし      |
| non-interactive での `/summary` 実行    | ✅ 許可                      | ✅ 許可                                                  | 変更なし      |
| non-interactive での `/compress` 実行   | ✅ 許可                      | ✅ 許可                                                  | 変更なし      |
| non-interactive での `/btw` 実行        | ✅ 許可                      | ✅ 許可                                                  | 変更なし      |
| non-interactive での `/bug` 実行        | ✅ 許可                      | ✅ 許可                                                  | 変更なし      |
| non-interactive での `/context` 実行    | ✅ 許可                      | ✅ 許可                                                  | 変更なし      |
| non-interactive での `/model` 実行      | ❌ unsupported               | ❌ unsupported（`commandType: local-jsx`）               | 変更なし      |
| non-interactive での file command 実行  | ✅ 許可（CommandKind.FILE）  | ✅ 許可（`commandType: prompt`）                         | 変更なし      |
| non-interactive での bundled skill 実行 | ✅ 許可（CommandKind.SKILL） | ✅ 許可（`commandType: prompt`）                         | 変更なし      |
| non-interactive での MCP prompt 実行    | ❌ CommandKind によりブロック       | ✅ 許可（`commandType: prompt`）                         | **Bug fix** |
| non-interactive での `/export` 実行     | ❌ ホワイトリスト外                | ❌ 不許可（`commandType: local`、デフォルトで interactive のみ） | 変更なし      |
| non-interactive での `/memory` 実行     | ❌ ホワイトリスト外                | ❌ 不許可（`commandType: local`、デフォルトで interactive のみ） | 変更なし      |
| non-interactive での `/plan` 実行       | ❌ ホワイトリスト外                | ❌ 不許可（`commandType: local`、デフォルトで interactive のみ） | 変更なし      |

> **local コマンドの保守的なデフォルト戦略について**：`commandType: 'local'` のデフォルト `supportedModes` は `['interactive']` となる。これは Claude Code の設計と一致しており、`local` タイプのコマンドが非インタラクティブモードで実行されるには `supportsNonInteractive: true` の明示的な宣言が必要である。Phase 1 では、ホワイトリスト内の6コマンド（`init`、`summary`、`compress`、`btw`、`bug`、`context`）が `supportedModes: ['interactive', 'non_interactive', 'acp']` を明示的に宣言することで、既存のホワイトリスト効果を等価に置き換える。Phase 2 で拡張が必要なコマンド（例：`/export`、`/memory`、`/plan`）は、action 実装が headless-friendly であることを検証した後、個別に解放する。

---

## 10.2 Phase 2 モード別コマンド：二重登録パターン

Phase 2 で「インタラクティブモードでは UI を表示、非インタラクティブモードではテキストを出力」する必要があるコマンド（例：`/model`）については、単一コマンドの `action` 内で分岐させるのではなく、**二重登録パターン**を採用する。

これは Claude Code の標準パターンである。`/context` を例にすると（`src/commands/context/index.ts` 参照）、同名の `Command` オブジェクトを2つ用意し、一方は `local-jsx` で `interactive` のみ、もう一方は `local` で `non-interactive` のみとし、`isEnabled()` で相互排他制御を行う。

Qwen Code の Phase 2 でも同等のアプローチを採用し、`isEnabled()` の代わりに `supportedModes` を用いて相互排他制御を実現する：

```typescript
// ① インタラクティブモード版：local-jsx、interactive のみ
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // 明示的に限定
  // action: dialog を開いて model を選択
};

// ② 非インタラクティブ/acp 版：local、headless 呼び出し元に明示的に開放
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // 明示的に限定
  // action: model の読み取り/設定を行い、message（プレーンテキスト）を返す
};
```

2つのオブジェクトは同名であり、`supportedModes` が相互排他となるため、`filterCommandsForMode` が自動的に正しいバージョンを選択する。Claude Code の `isEnabled()` による排他制御と比較し、`supportedModes` フィルタリングはより明示的でテストが容易であり、ランタイム環境の検出も不要である。

**Phase 1 ではいかなる二重登録コマンドも実装しない**。このパターンは Phase 2 の実装仕様としてここに予約するのみである。

---

## 11. テスト戦略

### 11.1 新規ユーティリティ関数のテスト

`packages/cli/src/services/commandUtils.test.ts`（新規ファイル）にて：

```typescript
describe('getEffectiveSupportedModes', () => {
  it('明示的な supportedModes が commandType の推論より優先される', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // 明示的に制限
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local が全モードに推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx が interactive のみに推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt が全モードに推論される', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType が未宣言かつ CommandKind.BUILT_IN の場合、フォールバックで interactive となる', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType が未宣言かつ CommandKind.FILE の場合、フォールバックで全モードとなる', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType が未宣言かつ CommandKind.MCP_PROMPT の場合、フォールバックで全モードとなる（既存の制限を修正）', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('non_interactive モードのコマンドを正しくフィルタリングする', () => { ... });
  it('acp モードのコマンドを正しくフィルタリングする', () => { ... });
  it('hidden コマンドをフィルタリングしない（filterCommandsForMode は hidden を処理せず、CommandService が処理する）', () => { ... });
});
```

### 11.2 `nonInteractiveCliCommands.test.ts` の更新

- `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` への全参照を削除
- `allowedBuiltinCommandNames` パラメータのテストケースを削除
- 追加：`commandType: local` のコマンドが non-interactive でフィルタを通過することを検証
- 追加：`commandType: local-jsx` のコマンドが non-interactive でフィルタリングされることを検証
- 維持：file command / skill command が non-interactive でフィルタを通過することを検証

### 11.3 `CommandService.test.ts` の更新

- `getCommandsForMode` のテストケースを追加
- `getModelInvocableCommands` のテストケースを追加

### 11.4 各 Loader のテスト

- `BuiltinCommandLoader.test.ts`：全コマンドに `source: 'builtin-command'` が設定されていることを検証
- `BundledSkillLoader.test.ts`：`source: 'bundled-skill'` および `modelInvocable: true` を検証
- `FileCommandLoader.test.ts`：ユーザーコマンドに `source: 'skill-dir-command'`、プラグインコマンドに `source: 'plugin-command'` が設定されていることを検証
- `McpPromptLoader.test.ts`：`source: 'mcp-prompt'` および `modelInvocable: true` を検証

---

## 12. 実装順序

以下の順序での実装を推奨する。各ステップは独立して commit および review 可能：

**Step 1**（約30分）：`types.ts` を修正し、`ExecutionMode`、`CommandSource`、`CommandType` および `SlashCommand` の新フィールドを追加
→ 純粋な型変更。TypeScript コンパイルチェック

**Step 2**（約1時間）：`commandUtils.ts` を新規作成し、`getEffectiveSupportedModes` と `filterCommandsForMode` を実装。同時に `commandUtils.test.ts` を新規作成
→ ユニットテストでコアロジックをカバー

**Step 3**（約1時間）：`nonInteractiveCliCommands.ts` をリファクタリング。ホワイトリストを削除し、`filterCommandsForMode` を導入。関数シグネチャを更新
→ 動作の等価性維持（Phase 1 の保守戦略：local クラスコマンドに `supportedModes: ['interactive']` を明示的に記述）

**Step 4**（約30分）：`CommandService.ts` を更新し、2つのメソッドを追加

**Step 5**（約2時間）：全組み込みコマンドファイルに `commandType` 宣言を追加
→ 分類の正確性を個別に確認

**Step 6**（約1.5時間）：全 Loader を更新し、`source`、`sourceLabel`、`commandType`、`modelInvocable` を注入

**Step 7**（約30分）：`Session.ts` の呼び出しシグネチャを更新

**Step 8**（約1時間）：全テストを実行し、失敗ケースを修正。スナップショットを更新

**Step 9**（約30分）：CR 自己検証：ホワイトリストが完全に削除され、呼び出し漏れがないことを確認

---

## 13. 受け入れチェックリスト

- [ ] TypeScript コンパイルエラーなし（`npm run typecheck`）
- [ ] `npm run lint` で新規 lint エラーなし
- [ ] 既存テストがすべて通過（`cd packages/cli && npx vitest run`）
- [ ] `commandUtils.test.ts` の新規テストがすべて通過
- [ ] `getEffectiveSupportedModes` が全7ケースをカバー
- [ ] `filterCommandsForMode` が interactive / non_interactive / acp の3モードをカバー
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` がコードベース全体で一切参照されていない（`grep` で検証）
- [ ] `filterCommandsForNonInteractive` 関数がコードベース全体で一切参照されていない
- [ ] 全組み込みコマンドに `commandType` フィールドが存在する
- [ ] 全 Loader が出力するコマンドに `source` および `sourceLabel` フィールドが存在する
- [ ] `BundledSkillLoader` / `FileCommandLoader`（ユーザーコマンド）/ `McpPromptLoader` が出力するコマンドの `modelInvocable` が `true`
- [ ] `BuiltinCommandLoader` が出力するコマンドの `modelInvocable` が `false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` がリファクタリング前と等価なコマンドセットを返す
- [ ] MCP prompt コマンドが non-interactive モードで誤ってブロックされない