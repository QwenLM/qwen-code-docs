# Phase 3 技術設計ドキュメント：体験の整合

## 1. 設計目標と制約

### 1.1 目標

Phase 3 は、Phase 1/2 で実装済みのコマンドメタデータ・クロスモードフィルタリング・prompt command モデル呼び出しを基盤に、ユーザーが体感できる slash command 体験を補完する：

- 補完メニューの来源表示・引数ヒント・alias ヒット、および session 単位の最近使用順ソートを導入
- mid-input slash command の ghost text・引数ヒント・来源表示・有効トークンハイライトを整備
- `/help` を現行の使いにくいコマンド羅列から Claude Code スタイルのタブ分割・明瞭・見やすいヘルプパネルへ刷新
- ACP `available_commands_update` のコマンドメタデータを拡充
- 実装済みの `/doctor` は重複実装しない；`/release-notes` は本フェーズに含めない

### 1.2 必須制約

- **コードが正**: Phase 1/2 のドキュメントと実装に差異がある場合は、現在のメインブランチのソースコードを正とする。
- **新たな実行アーキテクチャを導入しない**：既存の `SlashCommand`・`CommandService`・`handleSlashCommand`・`useSlashCompletion`・`Help` コンポーネントを継続利用し、`CommandDescriptor` / `CommandExecutor` / `ModeAdapter` を新設しない。
- **`commandType` を復活させない**：現在の実装では Phase 1 初期設計の `commandType` フィールドが削除されており、Phase 3 で再導入しない。
- **session 単位の recently used**：最近使用順ソートは現在の CLI session 内のみ有効で、ディスクに永続化しない。
- **interactive 動作を退化させない**：補完・help・doctor などの既存 interactive 動作は引き続き使用可能とする。Phase 3 は表示の強化と不足コマンドの補完のみを行う。
- **ACP 後方互換**：`availableCommands[].name`・`description`・`input` の既存 3 フィールドは変更しない。新メタデータは互換フィールドまたは `_meta` に追加し、既存 ACP クライアントを壊さない。

---

## 2. 現在の実装ベースライン（ソースコード調査結果）

### 2.1 既存メタデータと Loader の動作

`packages/cli/src/ui/commands/types.ts` の現在の `SlashCommand` には以下が含まれている：

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` が現在サポートする値：

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

各 Loader が現在設定している表示情報：

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | ほぼ未宣言       | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | skill から取得   | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | frontmatter から取得 | ユーザー/プロジェクトはデフォルト true；プラグインは description/whenToUse が必要 |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | skill から取得   | ユーザー/プロジェクトはデフォルト true；プラグインは description/whenToUse が必要 |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | 未生成           | 現在 `modelInvocable` を明示的に設定していない   |

> 注意：Phase 1 のロードマップでは MCP prompt に `modelInvocable: true` を要求していたが、現在の実装では明示的に設定されていない。Phase 3 では MCP prompt のモデル呼び出しパスを変更しない。MCP prompt は引き続き MCP ネイティブ機構で呼び出され、`SkillTool` を経由しない。

### 2.2 現在実装済みの Phase 3 関連機能

| 機能                                                 | 現在の状態                                                                                              | 主要ファイル                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| mid-input slash の基本 ghost text                    | 部分的に実装済み。`modelInvocable` コマンドのプレフィックス補完のみ                                      | `ui/utils/commandUtils.ts`・`ui/hooks/useCommandCompletion.tsx`  |
| line-start コマンドの引数 ghost text                 | 部分的に実装済み。コマンドが完全一致かつ args なしの場合に `argumentHint` を表示                         | `ui/hooks/useCommandCompletion.tsx`                              |
| alias のマッチング                                   | マッチングとソートは実装済みだが、表示は常に全 alias を表示し、命中した alias を区別しない              | `ui/hooks/useSlashCompletion.ts`                                 |
| source badge                                         | MCP のみ `[MCP]` を表示                                                                                 | `ui/components/SuggestionsDisplay.tsx`・`ui/components/Help.tsx` |
| `/help`                                              | 現在の実装は未完成とみなす：グルーピングの試みはあるがコマンド羅列にとどまり、Claude Code スタイルのタブ分割・明瞭・可読なヘルプパネルの体験を備えていない | `ui/components/Help.tsx`                                         |
| ACP `argumentHint`                                   | `availableCommands[].input.hint` にマッピング済み                                                       | `acp-integration/session/Session.ts`                             |
| ACP source/supportedModes/subcommands/modelInvocable | 未公開                                                                                                  | `acp-integration/session/Session.ts`                             |
| 競合処理                                             | extension コマンド競合時は `extensionName.commandName` にリネーム済み。非 extension の同名は後からロードしたものが前をオーバーライド | `services/CommandService.ts`                                     |
| `/doctor`                                            | 実装済み。`interactive` / `non_interactive` / `acp` をサポート                                          | `ui/commands/doctorCommand.ts`・`utils/doctorChecks.ts`          |

### 2.3 Claude Code から参考にできる点

`/Users/mochi/code/claude-code` のソースコードを参考にする：

- `src/types/command.ts`：コマンドモデルに `argumentHint`・`whenToUse`・`aliases`・`loadedFrom`・`kind`・`immediate`・`isSensitive`・`userFacingName`・`supportsNonInteractive` などの表示・能力フィールドを含む。
- `src/utils/suggestions/commandSuggestions.ts`：補完ソートは正確な命中・alias 命中・prefix・fuzzy・skill usage を考慮。alias 命中時はユーザーが実際に入力した alias のみを表示。
- `src/utils/suggestions/commandSuggestions.ts`：mid-input slash は `findMidInputSlashCommand()`・`getBestCommandMatch()`・`findSlashCommandPositions()` を用いて ghost text とハイライトをサポート。
- `src/components/HelpV2/Commands.tsx`：Help V2 は閲覧可能なコマンドカタログで、説明と共に来源情報を表示。
- `src/commands.ts`：Claude Code は `/doctor`・`/release-notes` などのコマンドを内蔵。Qwen Code は現在 `/doctor` を実装済み。本フェーズでは `/release-notes` を実装しない。

Phase 3 は「体験を整合させ、アーキテクチャはコピーしない」方針でこれらを参考にする。

---

## 3. 全体方針

### 3.1 ファイル変更一覧

| ファイル                                                    | 変更内容                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx` | `Suggestion` 型を拡張し、source badge・argumentHint・aliasHit を表示      |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`       | 拡張補完候補を生成。ソートに recently used を接続。alias 命中情報を保持   |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`    | mid-input ghost text で拡張マッチを再利用。引数/来源メタデータを UI 表示用に出力 |
| `packages/cli/src/ui/utils/commandUtils.ts`             | slash トークンハイライト補助関数を追加、または既存関数の戻り値にコマンド有効性を追加 |
| `packages/cli/src/ui/components/InputPrompt.tsx`        | 有効な slash command トークンのハイライトを描画。Tab による ghost text 受け入れを維持 |
| `packages/cli/src/ui/components/Help.tsx`               | Claude Code スタイルのタブ分割ヘルプパネルに刷新し、コマンド羅列を解消    |
| `packages/cli/src/ui/commands/helpCommand.ts`           | non-interactive/acp のヘルプテキストが必要であれば action を拡張。不要なら interactive UI のみ維持 |
| `packages/cli/src/acp-integration/session/Session.ts`   | ACP update で拡張メタデータを公開                                         |
| `packages/cli/src/ui/commands/*Command.ts`              | よく使う built-in コマンドに `argumentHint` を追加                        |

### 3.2 新規共有表示ユーティリティ

Help・Completion・ACP が共通で必要とする表示ロジックを集約するため、`packages/cli/src/services/commandMetadata.ts` の新設を推奨する：

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

これらの表示関数を Loader に含めることは推奨しない。Loader に UI ロジックを持たせるのを避けるためである。

---

## 4. Phase 3.1：補完体験の強化

### 4.1 `Suggestion` データ構造の拡張

現在：

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

拡張後：

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

`mode !== 'slash'` のファイル補完・逆検索ではこれらのフィールドを設定する必要はない。

### 4.2 source badge の表示

現在の `SuggestionsDisplay` は `CommandKind.MCP_PROMPT` にのみ `[MCP]` を付加している。Phase 3 では `source` / `sourceLabel` を使って badge を統一生成する：

| source / sourceLabel              | badge                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]`（任意：デフォルトは非表示でノイズ削減） |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` または `[Plugin: x]`            |
| `plugin-command` / `Extension: x` | `[Extension]` または `[Extension: x]`      |
| `mcp-prompt`                      | `[MCP]`                                    |

推奨実装：

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

> `[Built-in]` を表示するかどうかは UI の可読性によって決める。Help では Built-in グループを必ず表示する。補完メニューでは built-in の badge を省略し、非組み込み来源のみ badge を表示してよい。

### 4.3 引数ヒントの表示

補完メニューのコマンド名の後にグレーの `argumentHint` を追加する：

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

実装方針：

- `useSlashCompletion` の `finalSuggestions` に `argumentHint: cmd.argumentHint` を設定する
- `SuggestionsDisplay` でラベルの後に `theme.text.secondary` で `argumentHint` を描画する
- `commandColumnWidth` の計算に label + hint + badge を含め、説明列のズレを防ぐ
- サブコマンドの補完でも `argumentHint` をサポートする

まず、よく使う built-in コマンドに `argumentHint` を追加する必要がある。初期対象の推奨：

| コマンド         | argumentHint            |
| ---------------- | ----------------------- | ------------------ | -------- | ------------- | ------- |
| `/model`         | `[--fast] [<model-id>]` |
| `/approval-mode` | `<mode>`                |
| `/language`      | `ui                     | output <language>` |
| `/export`        | `md                     | html               | json     | jsonl [path]` |
| `/memory`        | `show                   | add                | refresh` |
| `/mcp`           | `desc                   | nodesc             | schema   | auth          | noauth` |
| `/stats`         | `[model                 | tools]`            |
| `/docs`          | 空または未設定          |
| `/doctor`        | 空または未設定          |

### 4.4 recently used ソート

#### 4.4.1 状態の保存

`useSlashCommandProcessor` または `AppContainer` 内で session 単位の最近使用状態を管理する：

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

`Map<string, RecentSlashCommand>` で保存し、キーには競合処理後の最終コマンド名（`cmd.name`）を使うことを推奨する。

#### 4.4.2 記録タイミング

`useSlashCommandProcessor.handleSlashCommand` が `commandToExecute` の解決に成功した後に使用を記録する：

- コマンドが見つからない場合は記録しない
- hidden コマンドは記録しなくてよい
- alias 呼び出しは canonical な `commandToExecute.name` で記録する
- サブコマンド呼び出しは親コマンドとリーフコマンドのフルパスで記録することを推奨するが、初期はリーフコマンドのみの記録でもよい

#### 4.4.3 ソートウェイト

現在の `compareRankedCommandMatches()` のソート順：

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Phase 3 では `recentScore` を挿入する：

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

`recentScore` の推奨計算：

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

query が空（ユーザーが `/` のみ入力）の場合は recently used のコマンドをトップに表示する。query が空でない場合は、同等のマッチ強度の中でのみ重み付けし、直近のコマンドが明らかにより正確なコマンドを押しのけないようにする。

### 4.5 alias 命中の表示

現在 alias は `AsyncFzf` と prefix fallback に参加しているが、`formatSlashCommandLabel()` は常に全 alias を表示している：

```text
help (?)
compress (summarize)
```

Phase 3 では以下に変更する：

- ユーザー入力が主名にマッチした場合：alias を追加表示しないか、現行の簡潔な形式を維持する
- ユーザー入力が alias にマッチした場合：`help (alias: ?)` を表示する
- `Suggestion.matchedAlias` はマッチング段階で設定する

実装のポイント：

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

FZF の結果で `result.item` が `altNames` からのものであれば、そのまま `matchedAlias` として使える。prefix fallback でも同様。

---

## 5. Phase 3.2：mid-input slash command の完全版

### 5.1 現在の動作

現在の `findMidInputSlashCommand()` は「空白で区切られた `/xxx` トークン」のみを認識し、カーソルがトークン末尾にある必要がある。`getBestSlashCommandMatch()` は `modelInvocable` コマンドの中でのアルファベット順プレフィックスマッチのみを行う。

これは Phase 2 の基本版目標には合致しているが、Phase 3 では表示とハイライトの補完が必要である。

### 5.2 ghost text の強化

現在の方針を維持する：mid-input slash は `modelInvocable` コマンドのみ提示する。本文中の組み込みコマンドは slash command として実行されないためである。

強化点：

- マッチングアルゴリズムをアルファベット順プレフィックスから `useSlashCompletion` のソートルールの再利用に変更（少なくとも `completionPriority` と recently used を考慮）
- 戻り値の構造を拡張する：

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 mid-input の source badge と引数ヒント

ghost text の表示スペースは限られているため、badge と hint を ghost text 本体に直接埋め込むことは推奨しない。推奨する表示ルール：

- ghost text はコマンド名のサフィックスのみを描画する。例：`please /rev` と入力すると `iew` を表示
- トークンがコマンドに完全マッチし、かつコマンドに `argumentHint` がある場合は、カーソルの後に薄い引数ヒントを表示する。例：`/review [pr-number] [--comment]`
- source badge はドロップダウンまたはステータスヒントにのみ表示する。mid-input でドロップダウンが表示されない場合は badge を強制表示しなくてよい

### 5.4 有効コマンドトークンのハイライト

Claude Code の `findSlashCommandPositions()` を参考に、`InputPrompt.renderLineWithHighlighting()` で本文中の有効な slash command トークンに色を付ける。

新規ユーティリティ関数の追加を推奨する：

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

ルール：

- トークンは文字列の先頭か、直前の文字が空白である必要がある
- トークンの形式は `/[a-zA-Z][a-zA-Z0-9:_-]*`
- mid-input のハイライトでは `modelInvocable` コマンドのみを valid とみなす
- line-start のトークンは interactive で表示可能な全コマンドを valid とみなすことができる
- valid なトークンはアクセントカラーで表示。invalid なトークンは通常テキストのまま。`/usr/bin` のようなパスをコマンドと誤認しないようにする

---

## 6. Phase 3.3：Help カタログの刷新

### 6.1 現在の問題

`Help.tsx` の現在の出力：

- Basics
- フラットな `Commands:`
- `[MCP]` の説明
- Keyboard Shortcuts

問題点：

- 全来源が混在し、skill・custom・plugin・MCP を区別しにくい
- `argumentHint` を表示しない
- `supportedModes` を表示しない
- `modelInvocable` を表示しない
- サブコマンドは 1 段階インデントのみで、来源/mode を表示しない

### 6.2 グループ設計

`source` / `sourceLabel` でグループ化する：

1. **Built-in Commands**：`source === 'builtin-command'`
2. **Bundled Skills**：`source === 'bundled-skill'`
3. **Custom Commands**：`source === 'skill-dir-command'`。`Custom` / `User` / `Project` を含む
4. **Plugin Commands**：`source === 'plugin-command'`。`Plugin:*` / `Extension:*` を含む
5. **MCP Commands**：`source === 'mcp-prompt'`
6. **Other Commands**：source が欠落している場合のフォールバック

各グループ内はコマンド名順に並べる。hidden コマンドは表示しない。

### 6.3 各コマンドの表示フィールド

フォーマットの推奨例：

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Help の幅を抑えるため、1 行に圧縮することを推奨する：

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

mode badge の推奨：

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` のみ                  | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| その他の組み合わせ                   | `[i] [ni] [acp]` |

### 6.4 `/help` を headless に拡張するか

ロードマップは `/help` の出力を来源別グループ化することのみを要求しており、non-interactive/acp は明示的に要求していない。現在の `/help` は `supportedModes: ['interactive']` である。

Phase 3 では headless パスの追加を推奨するが、独立したサブタスクとして扱う：

- `supportedModes` を全モードに変更
- interactive：引き続き `HistoryItemHelp` を描画
- non_interactive/acp：プレーンテキストのグループ別カタログを `message` として返す

スコープを絞る必要がある場合は、まず interactive `Help` コンポーネントのみを刷新し、headless `/help` は後回しにしてよい。

---

## 7. Phase 3.4：ACP available commands のメタデータ拡充

### 7.1 現在の ACP 出力

`Session.sendAvailableCommandsUpdate()` は現在 `SlashCommand[]` を次のようにマッピングしている：

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

`argumentHint` はすでに `input.hint` を通じて公開されている。

### 7.2 拡充方針

ACP protocol の `AvailableCommand` 型にフィールドを直接追加できない場合は、`_meta` を使って互換性を保つ：

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

`AvailableCommand` 型がフィールド拡張を許容する場合は、一等フィールドとして優先的に出力する：

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

ただし旧クライアントの段階的移行を容易にするため、しばらくは `_meta` のミラーも保持することを推奨する。

### 7.3 subcommands の再帰戦略

受け入れ基準は `subcommands` の名前リストのみを要求している。初期は 1 段階のサブコマンドのみ出力すれば十分：

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

後で ACP クライアントが多段ツリーを必要とする場合は以下のように拡張できる：

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5：Claude Code 不足コマンドの補完

### 8.1 `/doctor`：実装済み、重複実装しない

現在 `doctorCommand` は実装済みである：

- ファイル：`packages/cli/src/ui/commands/doctorCommand.ts`
- 登録：`BuiltinCommandLoader`
- モード：`['interactive', 'non_interactive', 'acp']`
- interactive：`HistoryItemDoctor` を表示
- non_interactive/acp：JSON の `message` を返す
- 診断ロジック：`packages/cli/src/utils/doctorChecks.ts`

Phase 3 では Help と補完で `/doctor` の来源・mode を正しく表示するだけでよい。改善が必要な場合は headless JSON を人が読みやすい Markdown に変更してもよいが、必須ではない。

### 8.2 `/release-notes`：本フェーズに含めない

`/release-notes` は Phase 3 の要件から除外する。本フェーズでは新規コマンドを追加せず、built-in の登録も行わず、関連テストも書かない。明確なプロダクト要件のないコマンドサーフェスの導入を避けるためである。

---

## 9. 競合戦略の確認と表示

現在の `CommandService` の競合戦略：

- extension/plugin コマンドが既存コマンドと同名の場合、`extensionName.commandName` にリネームする
- 二重競合の場合は数字サフィックスを追加：`extensionName.commandName1`
- 非 extension コマンドが同名の場合、後からロードしたものが前のものを上書きする

Phase 3 では実行セマンティクスを変更せず、Help/Completion で最終名称と来源を明確に表示するだけにする。

以下を確認するテストの追加を推奨する：

- リネームされた plugin command が補完で最終名称と `[Plugin]` badge を表示する
- Help で Plugin Commands グループに最終名称が表示される
- ACP 出力が最終名称を使用している

> ロードマップに記載の「built-in > bundled/skill-dir > plugin > mcp」の優先順位は、現在の実装「非 extension は後からロードしたものが優先」と完全には一致しない。Phase 3 のドキュメントは現在の `CommandService` ソースコードを正とし、本フェーズで競合セマンティクスを変更しない。優先順位を厳密に調整する必要があれば、既存のユーザー/プロジェクトコマンドのオーバーライド動作を変えないよう、独立した Phase として処理する。

---

## 10. テスト戦略

### 10.1 補完テスト

更新または新規作成：

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx`（ファイルが存在しない場合は新規作成）

カバレッジ：

- source badge：Skill/Custom/Plugin/MCP が正しく表示される
- argumentHint：コマンド名の後に hint を表示し、列幅が説明を崩さない
- recently used：`/` のみ入力時に直近のコマンドが前に来る。明示的な query 入力時は正確なマッチが優先される
- alias 命中：`?` を入力すると `help (alias: ?)` が表示される。`he` を入力しても alias 命中として誤表示されない
- mid-input ghost：本文中の `/rev` に `modelInvocable` な `/review` のサフィックスがヒントとして表示される
- mid-input で built-in を提示しない：本文中の `/sta` は `/stats` を提示しない（将来的にインライン built-in 実行が設計で許可された場合を除く）

### 10.2 Help テスト

更新：`packages/cli/src/ui/components/Help.test.tsx`

カバレッジ：

- Built-in/Bundled Skills/Custom/Plugin/MCP でグループ化される
- hidden コマンドが表示されない
- サブコマンドの名前リストが表示される
- `argumentHint`・source badge・mode badge・model badge が正しく表示される
- altNames は引き続き表示されるが、主コマンド名を妨げない

### 10.3 ACP テスト

更新：`packages/cli/src/acp-integration/session/Session.test.ts`

カバレッジ：

- `availableCommands[].input.hint` が現在の動作を維持する
- 新メタデータに `argumentHint`・`source`・`sourceLabel`・`supportedModes`・`subcommands`・`modelInvocable` が含まれる
- `argumentHint` がないコマンドで `input: null` の互換性が維持される
- `getAvailableCommands(config, signal, 'acp')` の呼び出しが変わらない

### 10.4 新規コマンドテスト

本フェーズでは `/release-notes` やその他の built-in コマンドを追加しないため、新規コマンドテストは不要。`/doctor` の既存リグレッションテストのみ維持する。

### 10.5 E2E テスト方針

Phase 3 は TUI 補完・slash command 実行・ACP コマンドメタデータを同時に変更するため、単体テストだけでは完全なユーザーパスをカバーできない。E2E 検証は以下の 3 種類で実施する：

1. **ローカル CLI のビルド**：まず `npm run build && npm run bundle` を実行し、その後 `node dist/cli.js` でローカル実装を検証する。
2. **Interactive / tmux シナリオ**：補完メニュー・ghost text・Tab 受け入れ・Help 描画などの TUI 動作を検証する。
3. **Headless / JSON シナリオ**：non-interactive slash command の出力を検証する。TUI に依存しない。
4. **ACP integration シナリオ**：`available_commands_update` のメタデータを検証する。

#### 10.5.1 E2E 前提手順

```bash
npm run build && npm run bundle
```

Interactive シナリオは独立した一時ディレクトリを使用し、現在のリポジトリを汚染しないようにする：

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

入力送信時はテキストと Enter を分けて送り、TUI が送信を飲み込まないようにする：

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

出力キャプチャ：

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

クリーンアップ：

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 E2E テストチェックリスト

| シナリオ                    | モード             | 手順                                                                                    | 期待結果                                                                                                                                  |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 補完 source badge       | interactive/tmux | `/` を入力して補完メニューを確認                                                          | skill/custom/plugin/MCP コマンドに対応する source badge が表示される。built-in は badge を表示しなくてよい                                 |
| 補完 argument hint      | interactive/tmux | `/model`・`/export` を入力                                                               | コマンド名の後に `argumentHint` が表示される。引数なしのコマンドにはノイズとなる hint が表示されない                                        |
| recently used ソート    | interactive/tmux | `/help` を実行後、`/` を入力                                                             | 同等のマッチ条件では `/help` が優先して表示される。明示的な query 入力時は query のマッチが優先される                                       |
| alias 命中表示          | interactive/tmux | `/?` を入力                                                                              | 補完候補に `help (alias: ?)` が表示される。`/he` 入力時は alias 命中として誤表示されない                                                   |
| mid-input ghost text    | interactive/tmux | 本文中に `please /rev` を入力                                                            | `/review` の ghost text サフィックスが表示され、Tab で受け入れ可能                                                                        |
| mid-input トークンハイライト | interactive/tmux | `/review` を含む本文を入力                                                              | model-invocable な有効 slash トークンがコマンドハイライトで表示される。`/usr/bin` のようなパスはコマンドとしてハイライトされない             |
| Help グループカタログ   | interactive/tmux | `/help` を実行                                                                           | 出力に Built-in Commands・Bundled Skills・Custom Commands・Plugin Commands・MCP Commands のグループが含まれる。各コマンドに source/mode/hint が表示される |
| `/doctor` headless 回帰 | headless/json    | `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` を実行 | `message` が返され、TUI 専用コンポーネントのエラーが発生しない                                                                              |
| ACP メタデータ          | integration      | ACP session を起動し `available_commands_update` をトリガー                              | 各コマンドに `name`・`description`・`input.hint` が保持され、`argumentHint`・`source`・`supportedModes`・`subcommands`・`modelInvocable` も含まれる |

#### 10.5.3 Headless コマンド例

`/release-notes` は本フェーズに含めない。headless の回帰検証は `/doctor` などの既存コマンドのみを対象とする。

### 10.6 リグレッションテストコマンド

AGENTS.md に従い、単一ファイルテストを優先して実行する：

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

最終検証：

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. 受け入れ基準

### 11.1 補完メニュー

- [ ] 補完メニューに source badge を表示（最低限 `[MCP]`・`[Skill]`・`[Custom]`・`[Plugin]`）
- [ ] 補完メニューに `argumentHint` を表示
- [ ] session 内で最近使用したコマンドが `/` のみ入力時に優先表示される
- [ ] alias 命中時に `alias: <alias>` が表示される。非 alias 命中では表示されない
- [ ] plugin/extension の競合リネーム後のコマンドが補完で最終名称と来源を表示する

### 11.2 mid-input slash

- [ ] 本文中に `/review` などの model-invocable コマンドを入力した際に ghost text が正しく表示される
- [ ] Tab で mid-input ghost text を受け入れられる
- [ ] 有効な mid-input slash command トークンがハイライトされる
- [ ] built-in コマンドが本文中でインライン実行可能コマンドとして誤提示されない
- [ ] コマンドが完全マッチし、かつ args がない場合に引数ヒントが表示される

### 11.3 Help

- [ ] `/help` が来源別グループでコマンドを表示する
- [ ] 各コマンドに名称・`argumentHint`・description・source・supportedModes のマークが表示される
- [ ] model-invocable なコマンドに明確なマークが付く
- [ ] サブコマンドが名前リストまたはインデント項目で表示される
- [ ] hidden コマンドが表示されない

### 11.4 ACP

- [ ] ACP `available_commands_update` に引き続き `name`・`description`・`input.hint` が含まれる
- [ ] ACP コマンドメタデータに `argumentHint`・`source`・`supportedModes`・`subcommands`・`modelInvocable` が含まれる
- [ ] 旧クライアントが新フィールドを無視しても影響を受けない

### 11.5 不足コマンド

- [ ] `/doctor` が引き続き使用可能で、non-interactive 時に `message` を返す
- [ ] `/release-notes` を追加しない。ドキュメント・テスト・受け入れ基準にも要求しない

---

## 12. 非目標

以下は Phase 3 に含めない：

- workflow command / dynamic skill / mcp skill の新規 Loader を実装しない
- 永続化する command usage tracking を導入しない
- `SkillTool` のモデル呼び出しプロトコルを変更しない
- MCP prompt のモデル呼び出しパスを変更しない
- コマンドエグゼキューターや mode adapter をリファクタリングしない
- 既存のユーザー/プロジェクトコマンドのオーバーライドセマンティクスを変更しない

---

## 13. 推奨実装順序

1. **補完データ構造と badge/hint の表示**：まず `Suggestion` と `SuggestionsDisplay` を拡張する。リスクが低く、フィードバックが直感的に得られる。
2. **built-in `argumentHint` の追加**：既存の ghost text と ACP `input.hint` をすぐに改善できる。
3. **recently used ソート**：`useSlashCompletion` に recent score を導入し、テストを追加する。
4. **alias 命中の表示**：FZF/prefix マッチを調整して `matchedAlias` を保持する。
5. **Help のタブ分割刷新**：Claude Code スタイルで General / Commands / Custom Commands などの明瞭なパネルを提供し、コマンド羅列を解消する。
6. **ACP メタデータの拡充**：`Session.sendAvailableCommandsUpdate()` を拡張し、`_meta` による互換性を維持する。
7. **mid-input ハイライトの強化**：最後に描画レイヤーを処理し、補完ロジックとの並行変更が大きくなりすぎないようにする。
