# Phase 3 技術設計ドキュメント: エクスペリエンスアライメント

## 1. 設計目標と制約

### 1.1 目標

Phase 3 では、Phase 1/2 で実装済みのコマンドメタデータ、モード横断フィルタリング、prompt command モデル呼び出しを基盤として、ユーザーが認識可能なスラッシュコマンド体験を補完します:

- 補完メニューにソース、引数ヒント、エイリアスヒットを表示し、セッションレベルの最近使用順ソートを導入
- mid-input スラッシュコマンドのゴーストテキスト、引数ヒント、ソース表示、有効トークンハイライトを改善
- `/help` を現在の使用不可なコマンドの羅列から、Claude Code スタイルのタブ付き、明確で美しいヘルプパネルに再構築
- ACP `available_commands_update` のコマンドメタデータを強化
- 既に実装済みの `/doctor` は重複実装しない; `/release-notes` は本フェーズでは対象外

### 1.2 ハード制約

- **コードを優先**: Phase 1/2 のドキュメントと実装に差異がある場合、現在のメインブランチのソースコードを基準とする。
- **新しい実行アーキテクチャを導入しない**: 既存の `SlashCommand`、`CommandService`、`handleSlashCommand`、`useSlashCompletion`、`Help` コンポーネントを引き続き使用し、`CommandDescriptor` / `CommandExecutor` / `ModeAdapter` は新規作成しない。
- **`commandType` を復活させない**: 現在の実装では Phase 1 初期設計の `commandType` フィールドは削除済み。Phase 3 ではこのフィールドを再導入しない。
- **セッションレベルの recently used**: 最近使用順ソートは現在の CLI セッション内でのみ有効で、ディスクに永続化しない。
- **interactive 動作を劣化させない**: 補完、help、doctor などの既存の interactive 動作はそのまま使用可能。Phase 3 では表示の強化と欠落コマンドの補完のみを行う。
- **ACP の後方互換性**: `availableCommands[].name`、`description`、`input` の3つの既存フィールドは変更しない。新しいメタデータは互換性のあるフィールドまたは `_meta` に追加し、既存の ACP クライアントを壊さない。

---

## 2. 現在の実装ベースライン（ソースコード監査の結論）

### 2.1 既存メタデータと Loader の動作

`packages/cli/src/ui/commands/types.ts` の現在の `SlashCommand` には以下が含まれています:

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` は現在以下をサポート:

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

各 Loader が現在設定している表示情報:

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | 未設定のものが多い | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | スキル由来       | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | frontmatter 由来 | ユーザー/プロジェクトはデフォルト true；プラグインは description/whenToUse が必要 |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | スキル由来       | ユーザー/プロジェクトはデフォルト true；プラグインは description/whenToUse が必要 |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | 未生成           | 現在 `modelInvocable` は明示的に設定されていない |

> 注: Phase 1 ロードマップでは MCP prompt に `modelInvocable: true` を要求していましたが、現在の実装では明示的に設定されていません。Phase 3 では MCP prompt のモデル呼び出しパスは変更しません。MCP prompt は引き続き MCP ネイティブメカニズムを通じて呼び出され、`SkillTool` を経由しません。

### 2.2 現在の実装における Phase 3 関連機能

| 機能                                                 | 現在の状態                                                                                          | 主要ファイル                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| mid-input slash の基本 ghost text                    | 部分的に実装済み。`modelInvocable` コマンドに対してのみプレフィックス補完を行う                     | `ui/utils/commandUtils.ts`、`ui/hooks/useCommandCompletion.tsx`  |
| line-start コマンドの argument ghost text            | 部分的に実装済み。コマンドが完全一致し引数がない場合に `argumentHint` を表示                        | `ui/hooks/useCommandCompletion.tsx`                              |
| alias のマッチング参加                               | マッチングとソートは実装済みだが、常に全エイリアスを表示し、ヒットしたエイリアスを区別しない         | `ui/hooks/useSlashCompletion.ts`                                 |
| source badge                                         | MCP のみ `[MCP]` を表示                                                                             | `ui/components/SuggestionsDisplay.tsx`、`ui/components/Help.tsx` |
| `/help`                                              | 現在の実装は未完成: グループ化の試みはあるが、コマンドの羅列であり、Claude Code スタイルのタブ付きで明確で読みやすいヘルプパネルの体験にはなっていない | `ui/components/Help.tsx`                                         |
| ACP `argumentHint`                                   | `availableCommands[].input.hint` にマッピング済み                                                   | `acp-integration/session/Session.ts`                             |
| ACP source/supportedModes/subcommands/modelInvocable | 未公開                                                                                              | `acp-integration/session/Session.ts`                             |
| 競合処理                                             | extension コマンドが既存コマンドと同名の場合、`extensionName.commandName` にリネーム。非 extension 同名の場合は後読みが前読みを上書き | `services/CommandService.ts`                                     |
| `/doctor`                                            | 実装済み。`interactive` / `non_interactive` / `acp` をサポート                                      | `ui/commands/doctorCommand.ts`、`utils/doctorChecks.ts`          |

### 2.3 Claude Code から借鉴できる点

`/Users/mochi/code/claude-code` のソースコードを参照:

- `src/types/command.ts`: コマンドモデルに `argumentHint`、`whenToUse`、`aliases`、`loadedFrom`、`kind`、`immediate`、`isSensitive`、`userFacingName`、`supportsNonInteractive` などの表示/機能フィールドを含む。
- `src/utils/suggestions/commandSuggestions.ts`: 補完ソートは、完全一致、エイリアスヒット、プレフィックス、ファジー、スキル使用頻度を同時に考慮。エイリアスヒット時はユーザーが実際にヒットしたエイリアスのみ表示。
- `src/utils/suggestions/commandSuggestions.ts`: mid-input slash では `findMidInputSlashCommand()`、`getBestCommandMatch()`、`findSlashCommandPositions()` を使用してゴーストテキストとハイライトをサポート。
- `src/components/HelpV2/Commands.tsx`: Help V2 はブラウズ可能なコマンドディレクトリで、説明とともにソース情報を表示。
- `src/commands.ts`: Claude Code には `/doctor`、`/release-notes` などのビルトインコマンドがある。Qwen Code は現在 `/doctor` を実装済み。本フェーズでは `/release-notes` は実装しない。

Phase 3 では「体験を合わせるが、アーキテクチャはコピーしない」というアプローチで上記を借鉴します。

---

## 3. 全体設計

### 3.1 ファイル変更概要

| ファイル                                                    | 変更内容                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx` | `Suggestion` 型を拡張し、source badge、argumentHint、aliasHit を表示する         |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`       | 拡張された補完項目を生成; ソートに recently used を追加; エイリアスヒット情報を保持 |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`    | mid-input ghost text が拡張マッチングを再利用; UI 表示用に argument/source メタデータを出力 |
| `packages/cli/src/ui/utils/commandUtils.ts`             | スラッシュトークンハイライトの補助関数を追加、または既存関数を拡張してコマンド有効性を返す |
| `packages/cli/src/ui/components/InputPrompt.tsx`        | 有効なスラッシュコマンドトークンのハイライトをレンダリング; Tab でのゴーストテキスト受け入れを維持 |
| `packages/cli/src/ui/components/Help.tsx`               | Claude Code スタイルのタブ付きヘルプパネルに再構築し、コマンド羅列を避ける                    |
| `packages/cli/src/ui/commands/helpCommand.ts`           | non-interactive/acp ヘルプテキストが必要な場合は action を拡張; それ以外は interactive UI のみを維持 |
| `packages/cli/src/acp-integration/session/Session.ts`   | ACP update で拡張メタデータを公開                                            |
| `packages/cli/src/ui/commands/*Command.ts`              | よく使われるビルトインコマンドに `argumentHint` を追加                                   |

### 3.2 新規共有表示ユーティリティ

`packages/cli/src/services/commandMetadata.ts` を新規作成し、Help、Completion、ACP が共通で必要とする表示ロジックを集約することを推奨:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

これらの表示関数を Loader に配置することは推奨しません。Loader が UI ロジックを担うことを避けるためです。

---

## 4. Phase 3.1: 補完体験の強化

### 4.1 `Suggestion` データ構造の拡張

現在:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

次のように拡張することを推奨:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;

  // Phase 3
  source?: CommandSource;
  sourceLabel?: string;
  sourceBadge?: string;
  argumentHint?: string;
  matchedAlias?: string;
  supportedModes?: ExecutionMode[];
  modelInvocable?: boolean;
}
```

`mode !== 'slash'` の場合のファイル補完や逆検索にはこれらのフィールドを設定する必要はありません。

### 4.2 source badge の表示

現在 `SuggestionsDisplay` は `CommandKind.MCP_PROMPT` の場合にのみ `[MCP]` を追加しています。Phase 3 では `source` / `sourceLabel` を使用して統一的な badge を生成します:

| source / sourceLabel              | badge                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]`（任意: デフォルト非表示でノイズ低減） |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` または `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` または `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                    |

推奨実装:

```typescript
function getCommandSourceBadge(cmd: SlashCommand): string | null {
  switch (cmd.source) {
    case 'bundled-skill':
      return '[Skill]';
    case 'skill-dir-command':
      return cmd.sourceLabel === 'User'
        ? '[User]'
        : cmd.sourceLabel === 'Project'
          ? '[Project]'
          : '[Custom]';
    case 'plugin-command':
      return '[Plugin]';
    case 'mcp-prompt':
      return '[MCP]';
    case 'builtin-command':
    default:
      return null;
  }
}
```

> `[Built-in]` を表示するかどうかは UI の可読性に基づいて決定します。Help では Built-in グループを表示する必要があります。補完メニューでは built-in badge を省略し、非組み込みソースのみ badge を表示できます。

### 4.3 argument hint の表示

補完メニューでコマンド名の後に灰色の `argumentHint` を追加:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

実装提案:

- `useSlashCompletion` で `finalSuggestions` に `argumentHint: cmd.argumentHint` を設定
- `SuggestionsDisplay` で label の後に `theme.text.secondary` で `argumentHint` をレンダリング
- `commandColumnWidth` の計算に label + hint + badge を含め、説明列の位置ずれを防止
- サブコマンド補完でも `argumentHint` をサポート

よく使われるビルトインコマンドに先に `argumentHint` を設定する必要があります。最初のバッチとして推奨:

| コマンド           | argumentHint            |
| ---------------- | ----------------------- |
| `/model`         | `[--fast] [<model-id>]` |
| `/approval-mode` | `<mode>`                |
| `/language`      | `ui \| output <language>` |
| `/export`        | `md \| html \| json \| jsonl [path]` |
| `/memory`        | `show \| add \| refresh` |
| `/mcp`           | `desc \| nodesc \| schema \| auth \| noauth` |
| `/stats`         | `[model \| tools]`      |
| `/docs`          | 空または未設定          |
| `/doctor`        | 空または未設定          |

### 4.4 recently used ソート

#### 4.4.1 状態の保存

`useSlashCommandProcessor` または `AppContainer` 内で、セッションレベルの最近使用状態を管理:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

キーとして最終コマンド名（競合処理後の `cmd.name`）を使用した `Map<string, RecentSlashCommand>` での保存を推奨。

#### 4.4.2 記録タイミング

`useSlashCommandProcessor.handleSlashCommand` で `commandToExecute` が正常に解決された後に使用を記録:

- コマンドが見つからない場合は記録しない
- hidden コマンドは記録しない
- エイリアス呼び出しの場合は canonical な `commandToExecute.name` で記録
- サブコマンド呼び出しの場合は親コマンドとリーフコマンドの完全パスを記録することが望ましい。初回はリーフコマンドのみの記録でも許容

#### 4.4.3 ソートの重み付け

現在の `compareRankedCommandMatches()` のソート順は:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Phase 3 では `recentScore` を挿入:

```typescript
return (
  right.matchStrength - left.matchStrength ||
  right.completionPriority - left.completionPriority ||
  right.recentScore - left.recentScore ||
  right.score - left.score ||
  left.start - right.start ||
  left.itemLength - right.itemLength ||
  left.originalIndex - right.originalIndex
);
```

`recentScore` の推奨計算:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

query が空（ユーザーが `/` のみ入力）の場合、recently used コマンドを先頭に表示。query が空でない場合は、同じマッチ強度のときのみ重み付けを行い、最近のコマンドが明らかに正確なコマンドを押しのけないようにします。

### 4.5 エイリアスヒットの表示

現在、エイリアスは `AsyncFzf` と prefix fallback に参加していますが、`formatSlashCommandLabel()` は常にすべてのエイリアスを表示:

```text
help (?)
compress (summarize)
```

Phase 3 では:

- ユーザー入力がメイン名にヒットした場合: エイリアスを追加表示しない、または現在の簡潔な形式を維持
- ユーザー入力がエイリアスにヒットした場合: `help (alias: ?)` と表示
- `Suggestion.matchedAlias` はマッチングフェーズで書き込む

実装のポイント:

```typescript
function findMatchedAlias(
  cmd: SlashCommand,
  query: string,
): string | undefined {
  return cmd.altNames?.find((alt) =>
    alt.toLowerCase().startsWith(query.toLowerCase()),
  );
}
```

FZF の結果で `result.item` が `altNames` 由来の場合、それを直接 `matchedAlias` として使用できます。prefix fallback でも同様です。

---

## 5. Phase 3.2: mid-input slash コマンド完全版

### 5.1 現在の動作

現在の `findMidInputSlashCommand()` は「空白で区切られた `/xxx` トークン」のみを認識し、カーソルがトークンの末尾にあることを要求。`getBestSlashCommandMatch()` は `modelInvocable` コマンドの中でのみアルファベット順のプレフィックスマッチを行います。

これは Phase 2 の基本版としては適切ですが、Phase 3 では表示とハイライトを補完する必要があります。

### 5.2 ghost text の強化

現在の戦略を維持: mid-input slash は `modelInvocable` コマンドのみを提示します。なぜなら、本文中のビルトインコマンドはスラッシュコマンドとして実行されないからです。

強化ポイント:

- マッチングアルゴリズムをアルファベット順プレフィックスから `useSlashCompletion` のソートルール（少なくとも `completionPriority` と recently used を考慮）を再利用
- 戻り値の構造を拡張:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 mid-input source badge と argument hint

ghost text のスペースは限られているため、badge や hint を ghost text 本体に直接詰め込むことは推奨しません。表示ルールの提案:

- ghost text は引き続きコマンド名のサフィックスのみをレンダリング。例: `please /rev` と入力した場合 `iew` と表示
- トークンがコマンドと完全一致し、コマンドに `argumentHint` がある場合、カーソル後に淡色の引数ヒントを表示。例: `/review [pr-number] [--comment]`
- source badge はドロップダウンまたはステータス表示でのみ表示。mid-input でドロップダウンが表示されない場合、badge の表示は必須としない

### 5.4 有効コマンドトークンのハイライト

Claude Code の `findSlashCommandPositions()` を参考に、`InputPrompt.renderLineWithHighlighting()` 内で本文中の有効なスラッシュコマンドトークンに色を付けます。

新しいユーティリティ関数を推奨:

```typescript
export type SlashCommandToken = {
  start: number;
  end: number;
  commandName: string;
  valid: boolean;
};

export function findSlashCommandTokens(
  text: string,
  commands: readonly SlashCommand[],
): SlashCommandToken[];
```

ルール:

- トークンは文字列の先頭か、前の文字が空白である必要がある
- トークンの形式は `/[a-zA-Z][a-zA-Z0-9:_-]*`
- mid-input でのハイライトは `modelInvocable` コマンドのみを valid と判定
- line-start トークンはすべての interactive で可視のコマンドを valid と判定
- valid トークンはアクセントカラーを使用。invalid トークンは通常テキストのままにし、パス `/usr/bin` などを誤ってコマンドとしてマークしない

---

## 6. Phase 3.3: Help ディレクトリの再構築

### 6.1 現在の問題点

`Help.tsx` の現在の出力:

- Basics
- 平置きの `Commands:`
- `[MCP]` の説明
- キーボードショートカット

問題:

- すべてのソースが混ざっており、skill、custom、plugin、MCP の区別が難しい
- `argumentHint` を表示しない
- `supportedModes` を表示しない
- `modelInvocable` を表示しない
- サブコマンドは一段インデントされているだけで、ソースやモードを表示しない

### 6.2 グループ設計

`source` / `sourceLabel` でグループ化:

1. **Built-in Commands**: `source === 'builtin-command'`
2. **Bundled Skills**: `source === 'bundled-skill'`
3. **Custom Commands**: `source === 'skill-dir-command'`、`Custom` / `User` / `Project` を含む
4. **Plugin Commands**: `source === 'plugin-command'`、`Plugin:*` / `Extension:*` を含む
5. **MCP Commands**: `source === 'mcp-prompt'`
6. **Other Commands**: source がない場合の互換フォールバック

各グループ内はコマンド名でソート。hidden コマンドは表示しない。

### 6.3 各コマンドの表示フィールド

推奨フォーマット:

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Help が広くなりすぎるのを避けるため、1行に圧縮することを推奨:

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

mode badge の推奨:

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` only                  | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| その他の組み合わせ                  | `[i] [ni] [acp]` |

### 6.4 `/help` の headless 対応

ロードマップでは `/help` のソース別グループ化のみが要求されており、non-interactive/acp は明示的に要求されていません。現在の `/help` は `supportedModes: ['interactive']` です。

Phase 3 では headless パスを新規追加することが推奨されますが、独立したサブタスクとします:

- `supportedModes` を全モードに変更
- interactive: 引き続き `HistoryItemHelp` をレンダリング
- non_interactive/acp: プレーンテキストのグループ化ディレクトリ `message` を返す

スコープを絞る必要がある場合は、まず interactive `Help` コンポーネントのみを再構築し、headless `/help` は後回しにできます。

---

## 7. Phase 3.4: ACP available commands メタデータの強化

### 7.1 現在の ACP 出力

`Session.sendAvailableCommandsUpdate()` は現在、`SlashCommand[]` を次のようにマッピング:

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

`argumentHint` は `input.hint` を通じて既に公開されています。

### 7.2 強化案

ACP protocol の `AvailableCommand` 型に直接フィールドを追加できない場合は、`_meta` を使用して互換性を維持:

```typescript
const availableCommands: AvailableCommand[] = slashCommands.map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
  _meta: {
    argumentHint: cmd.argumentHint,
    source: cmd.source,
    sourceLabel: cmd.sourceLabel,
    supportedModes: cmd.supportedModes ?? getEffectiveSupportedModes(cmd),
    subcommands: cmd.subCommands
      ?.filter((sub) => !sub.hidden)
      .map((sub) => sub.name),
    modelInvocable: cmd.modelInvocable === true,
  },
}));
```

`AvailableCommand` 型がフィールド拡張を許可する場合は、優先的に第一級フィールドとして出力:

```typescript
{
  name,
  description,
  input,
  argumentHint,
  source,
  supportedModes,
  subcommands,
  modelInvocable,
}
```

ただし、古いクライアントの段階的移行のために、しばらくは `_meta` ミラーリングを維持することを推奨します。

### 7.3 subcommands の再帰戦略

受け入れ基準では `subcommands` の名前リストのみを要求。初回は1レベルのサブコマンドを出力:

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

将来的に ACP クライアントが多階層ツリーを必要とする場合は、次のように拡張可能:

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5: Claude Code にあり Qwen Code にないコマンドの補完

### 8.1 `/doctor`: 既に実装済み。重複実装しない

現在 `doctorCommand` は存在:

- ファイル: `packages/cli/src/ui/commands/doctorCommand.ts`
- 登録: `BuiltinCommandLoader`
- モード: `['interactive', 'non_interactive', 'acp']`
- interactive: `HistoryItemDoctor` を表示
- non_interactive/acp: JSON `message` を返す
- 診断ロジック: `packages/cli/src/utils/doctorChecks.ts`

Phase 3 では Help と補完で `/doctor` のソースとモードが正しく表示されれば十分。必要に応じて headless JSON を人間が読みやすい Markdown に最適化することも可能ですが、必須ではありません。

### 8.2 `/release-notes`: 本フェーズでは対象外

`/release-notes` は Phase 3 の要件としません。本フェーズでは新しいコマンドは追加せず、ビルトインとしても登録せず、関連テストも作成しません。明確なプロダクト要件がないコマンドの表層追加を避けるためです。

---

## 9. 競合ポリシーの確認と表示

現在の `CommandService` の競合ポリシー:

- extension/plugin コマンドが既存コマンドと同名の場合、`extensionName.commandName` にリネーム
- 再度競合した場合、数字のサフィックスを追加: `extensionName.commandName1`
- 非 extension コマンドが同名の場合、後読みが前読みを上書き

Phase 3 では実行時セマンティクスを変更せず、Help/Completion で最終名とソースを明確に表示するのみ。

以下のテストを追加することを推奨:

- リネームされた plugin command が補完で最終名と `[Plugin]` badge を表示すること
- Help で Plugin Commands グループに最終名が表示されること
- ACP 出力が最終名を使用すること

> ロードマップの「built-in > bundled/skill-dir > plugin > mcp」の優先順位は、現在の実装「非 extension は後読みが前読みを上書き」と完全には一致しません。Phase 3 ドキュメントは現在の `CommandService` ソースコードを基準とし、本フェーズでは競合セマンティクスを変更しません。厳密に優先順位を調整する必要がある場合は、別の Phase として扱い、既存のユーザー/プロジェクトコマンドの上書き動作を変更しないようにする必要があります。

---

## 10. テスト戦略

### 10.1 補完テスト

更新または新規作成:

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx`（現在ファイルがない場合は新規作成）

カバレッジ:

- source badge: Skill/Custom/Plugin/MCP が正しく表示されること
- argumentHint: コマンド名の後に hint が表示され、列幅が説明を壊さないこと
- recently used: `/` のみ入力時に最近のコマンドが前に来ること、明確なクエリ入力時は正確なヒットが優先されること
- エイリアスヒット: `?` 入力で `help (alias: ?)` と表示されること、`he` 入力ではエイリアスヒット表示がないこと
- mid-input ghost: 本文中の `/rev` が modelInvocable な `/review` のサフィックスを提示すること
- mid-input では built-in を提示しない: 本文中の `/sta` は `/stats` を提示しないこと（将来の設計で built-in の埋め込み実行が許可されない限り）
### 10.2 Help テスト

更新: `packages/cli/src/ui/components/Help.test.tsx`

カバレッジ:

- Built-in/Bundled Skills/Custom/Plugin/MCP でグループ化
- hidden コマンドは表示しない
- サブコマンドは名前リストを表示
- `argumentHint`、source badge、mode badge、model badge が正しく表示される
- altNames は引き続き表示可能だが、メインコマンド名を妨げない

### 10.3 ACP テスト

更新: `packages/cli/src/acp-integration/session/Session.test.ts`

カバレッジ:

- `availableCommands[].input.hint` の既存動作を維持
- 新しいメタデータに `argumentHint`、`source`、`sourceLabel`、`supportedModes`、`subcommands`、`modelInvocable` を含む
- `argumentHint` がないコマンドは `input: null` で互換性を維持
- `getAvailableCommands(config, signal, 'acp')` の呼び出しは変更なし

### 10.4 新コマンドテスト

本フェーズでは `/release-notes` やその他の built-in コマンドは追加しないため、新たなコマンドテストは不要です。`/doctor` の既存回帰テストのみ維持します。

### 10.5 E2E テスト計画

Phase 3 では TUI 補完、slash command 実行、ACP command metadata を同時に変更するため、単体テストでは完全なユーザーパスをカバーできません。E2E 検証は次の3種類で行います:

1. **ローカル CLI のビルド**: まず `npm run build && npm run bundle` を実行し、その後 `node dist/cli.js` を使ってローカル実装を検証します。
2. **Interactive / tmux シナリオ**: 補完メニュー、ghost text、Tab 受け入れ、Help レンダリングなどの TUI 動作を検証します。
3. **Headless / JSON シナリオ**: TUI に依存せず、non-interactive な slash command の出力を検証します。
4. **ACP integration シナリオ**: `available_commands_update` のメタデータを検証します。

#### 10.5.1 E2E 前準備

```bash
npm run build && npm run bundle
```

Interactive シナリオでは、カレントリポジトリを汚染しないように独立したテンポラリディレクトリを使用することを推奨します:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

入力送信時はテキストと Enter を分割し、TUI が送信を飲み込まないようにします:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

出力をキャプチャ:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

クリーンアップ:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 E2E テスト一覧

| シナリオ                      | モード             | 手順                                                                                    | 期待結果                                                                                                                                  |
| ----------------------------- | ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 補完 source badge             | interactive/tmux   | `/` を入力し、補完メニューを観察                                                          | skill/custom/plugin/MCP コマンドに対応する source badge が表示される；built-in は badge を表示しなくてよい                                |
| 補完 argument hint            | interactive/tmux   | `/model`、`/export` を入力                                                              | コマンド名の後ろに `argumentHint` が表示される；引数のないコマンドには不要な hint は表示されない                                            |
| recently used ソート          | interactive/tmux   | 最初に `/help` を実行し、次に `/` を入力                                                  | 同じマッチ条件では `/help` が優先表示される；正確なクエリがあればクエリマッチが優先される                                                     |
| alias ヒット表示              | interactive/tmux   | `/?` を入力                                                                             | 補完項目に `help (alias: ?)` と表示される；`/he` と入力したときに alias ヒットが誤表示されない                                              |
| 途中入力 ghost text           | interactive/tmux   | 本文中に `please /rev` と入力                                                           | `/review` の ghost text サフィックスが表示され、Tab で受け入れ可能                                                                         |
| 途中入力トークン強調表示      | interactive/tmux   | `/review` を含む本文を入力                                                               | 有効な model-invocable slash トークンはコマンド強調表示される；`/usr/bin` のようなパスはコマンドとして強調表示されない                      |
| Help グループ別目次           | interactive/tmux   | `/help` を実行                                                                          | 出力に Built-in Commands、Bundled Skills、Custom Commands、Plugin Commands、MCP Commands のグループが含まれる；各コマンドに source/mode/hint が表示される |
| `/doctor` headless 回帰       | headless/json      | `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` を実行 | `message` が返り、TUI-only コンポーネントのエラーが発生しない                                                                             |
| ACP metadata                  | integration        | ACP セッションを実行し、`available_commands_update` をトリガー                             | 各 command が `name`、`description`、`input.hint` を保持し、さらに `argumentHint`、`source`、`supportedModes`、`subcommands`、`modelInvocable` を含む |

#### 10.5.3 Headless コマンド例

`/release-notes` は本フェーズでは対象外とします；headless 回帰は `/doctor` などの既存コマンド検証のみ残します。

### 10.6 回帰テストコマンド

AGENTS.md に従い、単一ファイルテストを優先して実行します:

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

最終検証:

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. 受入基準

### 11.1 補完メニュー

- [ ] 補完メニューに source badge が表示される（最低限 `[MCP]`、`[Skill]`、`[Custom]`、`[Plugin]`）
- [ ] 補完メニューに `argumentHint` が表示される
- [ ] セッション内で最近使用したコマンドが `/` だけ入力したときに優先表示される
- [ ] alias ヒット時に `alias: <alias>` が表示され、alias 以外のヒットでノイズ表示されない
- [ ] plugin/extension の競合によりリネームされたコマンドが、補完では最終的な名前とソースで表示される

### 11.2 mid-input slash

- [ ] 本文中に `/review` のような model-invocable コマンドを入力したとき、ghost text が正しく表示される
- [ ] Tab で mid-input ghost text を受け入れられる
- [ ] 有効な mid-input slash command トークンが強調表示される
- [ ] built-in コマンドが本文中で実行可能なインラインコマンドとして誤って提案されない
- [ ] コマンドが完全マッチし引数がない場合に、引数ヒントが表示される

### 11.3 Help

- [ ] `/help` でコマンドがソース別にグループ化されて表示される
- [ ] 各コマンドに名前、`argumentHint`、description、source、supportedModes のマークが表示される
- [ ] model-invocable コマンドに明確なマークが付く
- [ ] サブコマンドが名前リストまたはインデント項目として表示される
- [ ] hidden コマンドは表示されない

### 11.4 ACP

- [ ] ACP `available_commands_update` が引き続き `name`、`description`、`input.hint` を含む
- [ ] ACP コマンドメタデータに `argumentHint`、`source`、`supportedModes`、`subcommands`、`modelInvocable` が含まれる
- [ ] 古いクライアントが新しいフィールドを無視しても影響がない

### 11.5 欠落コマンド

- [ ] `/doctor` は引き続き利用可能で、non-interactive で `message` を返す
- [ ] `/release-notes` は追加せず、ドキュメント、テスト、受入基準でもこのコマンドを要求しない

---

## 12. 対象外

以下は Phase 3 の対象外とします:

- workflow command / dynamic skill / mcp skill の新しい Loader は実装しない
- 永続的なコマンド使用頻度トラッキングは導入しない
- `SkillTool` のモデル呼び出しプロトコルは変更しない
- MCP prompt のモデル呼び出しパスは変更しない
- コマンド実行器または mode adapter のリファクタリングは行わない
- 既存の user/project コマンドの上書きセマンティクスは変更しない

---

## 13. 推奨実装順序

1. **補完データ構造と badge/hint 表示**: まず `Suggestion` と `SuggestionsDisplay` を拡張します。リスクが低く、フィードバックが直感的です。
2. **built-in `argumentHint` の補完**: 既存の ghost text と ACP `input.hint` に即座に利益をもたらします。
3. **recently used ソート**: `useSlashCompletion` に recent score を導入し、テストを補完します。
4. **alias ヒット表示**: FZF/prefix マッチングを調整して `matchedAlias` を保持します。
5. **Help のタブ分割リファクタリング**: Claude Code スタイルに従い、General / Commands / Custom Commands などの明確なパネルを提供し、コマンドの詰め込みを避けます。
6. **ACP メタデータ拡張**: `Session.sendAvailableCommandsUpdate()` を拡張し、`_meta` の互換性を維持します。
7. **mid-input 強調表示の強化**: 最後にレンダリングレイヤーを処理し、補完ロジックとの並行変更を最小限に抑えます。