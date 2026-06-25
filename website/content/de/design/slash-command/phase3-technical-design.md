# Phase 3 Technisches Design-Dokument: Erfahrungsangleichung

## 1. Designziele und Randbedingungen

### 1.1 Ziele

Phase 3 baut auf den bereits umgesetzten Befehlsmetadaten, modusübergreifenden Filtern und dem Prompt-Command-Modellaufruf aus Phase 1/2 auf und ergänzt die für den Benutzer wahrnehmbare Slash-Command-Erfahrung:

- Das Vervollständigungsmenü zeigt Quelle, Parameterhinweise und Alias-Treffer an und führt eine sitzungsbezogene Sortierung nach zuletzt verwendeten Befehlen ein.
- Verbesserung der Ghost-Text-, Parameterhinweis-, Quellenanzeige- und gültigen Token-Hervorhebung für Mid-Input-Slash-Commands.
- Umgestaltung von `/help` von der aktuell unbrauchbaren Befehlsansammlung zu einem Claude Code-artigen, mit Registerkarten versehenen, klaren und ästhetischen Hilfefenster.
- Erweiterung der Befehlsmetadaten von ACP `available_commands_update`.
- Bestätigung, dass das bereits implementierte `/doctor` nicht erneut implementiert wird; `/release-notes` wird in dieser Phase nicht berücksichtigt.

### 1.2 Harte Randbedingungen

- **Code ist maßgeblich**: Wenn die Dokumentation von Phase 1/2 von der Implementierung abweicht, gilt der Quellcode des aktuellen Hauptbranches als verbindlich.
- **Keine neue Ausführungsarchitektur einführen**: Es werden weiterhin die bestehenden `SlashCommand`-, `CommandService`-, `handleSlashCommand`-, `useSlashCompletion`- und `Help`-Komponenten verwendet; es werden keine neuen `CommandDescriptor` / `CommandExecutor` / `ModeAdapter` erstellt.
- **`commandType` nicht wiederherstellen**: Die aktuelle Implementierung hat das `commandType`-Feld aus dem frühen Design von Phase 1 entfernt; Phase 3 führt dieses Feld nicht wieder ein.
- **Sitzungsbezogene zuletzt verwendete Befehle**: Die Sortierung nach zuletzt verwendeten Befehlen gilt nur innerhalb der aktuellen CLI-Sitzung und wird nicht auf die Festplatte persistiert.
- **Keine Verschlechterung des interaktiven Verhaltens**: Bestehendes interaktives Verhalten wie Vervollständigung, Hilfe, Doctor usw. bleibt nutzbar; Phase 3 verbessert lediglich die Darstellung und ergänzt fehlende Befehle.
- **ACP-Rückwärtskompatibilität**: Die drei vorhandenen Felder `availableCommands[].name`, `description` und `input` bleiben unverändert; neue Metadaten werden in kompatiblen Feldern oder `_meta` abgelegt, um bestehende ACP-Clients nicht zu beeinträchtigen.

---

## 2. Aktuelle Implementierungsbasis (Quellcode-Audit-Ergebnisse)

### 2.1 Vorhandene Metadaten und Loader-Verhalten

`packages/cli/src/ui/commands/types.ts` – der aktuelle `SlashCommand` enthält bereits:

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` unterstützt derzeit:

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

Die einzelnen Loader füllen derzeit folgende Anzeigeinformationen:

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | meist nicht deklariert | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | aus Skill        | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | aus Frontmatter  | Benutzer/Projekt standardmäßig true; Plugin benötigt description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | aus Skill        | Benutzer/Projekt standardmäßig true; Plugin benötigt description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | nicht erzeugt    | `modelInvocable` derzeit nicht explizit gesetzt  |

> Hinweis: Die Roadmap von Phase 1 forderte `modelInvocable: true` für MCP-Prompts, aber die aktuelle Implementierung setzt dies nicht explizit. Phase 3 ändert den Modellaufrufpfad für MCP-Prompts nicht; MCP-Prompts werden weiterhin über den nativen MCP-Mechanismus aufgerufen, nicht über `SkillTool`.

### 2.2 Derzeit implementierte Fähigkeiten im Zusammenhang mit Phase 3

| Fähigkeit                                              | Aktueller Status                                                                                        | Schlüsseldateien                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Basis-Ghost-Text für Mid-Input-Slash                   | Teilweise implementiert, nur Präfix-Vervollständigung für `modelInvocable`-Befehle                      | `ui/utils/commandUtils.ts`、`ui/hooks/useCommandCompletion.tsx`      |
| Argument-Ghost-Text für Line-Start-Befehle             | Teilweise implementiert, zeigt `argumentHint` an, wenn Befehl exakt übereinstimmt und keine Argumente   | `ui/hooks/useCommandCompletion.tsx`                                  |
| Alias-Teilnahme an der Übereinstimmung                 | Übereinstimmung und Sortierung implementiert, aber Anzeige zeigt immer alle Aliase, unterscheidet nicht, welcher Alias getroffen wurde | `ui/hooks/useSlashCompletion.ts`                                     |
| Quellen-Badge                                          | Nur MCP zeigt `[MCP]` an                                                                               | `ui/components/SuggestionsDisplay.tsx`、`ui/components/Help.tsx`     |
| `/help`                                                | Aktuelle Implementierung gilt als unvollständig: Obwohl es Gruppierungsversuche gibt, ist es immer noch eine Befehlsansammlung ohne das Claude Code-artige, registerkartenbasierte, klar lesbare Hilfeerlebnis | `ui/components/Help.tsx`                                             |
| ACP `argumentHint`                                     | Wird auf `availableCommands[].input.hint` abgebildet                                                    | `acp-integration/session/Session.ts`                                 |
| ACP-Quelle/supportedModes/subcommands/modelInvocable   | Nicht exponiert                                                                                         | `acp-integration/session/Session.ts`                                 |
| Konfliktbehandlung                                     | Bei Konflikten mit Erweiterungsbefehlen werden diese in `extensionName.commandName` umbenannt; Nicht-Erweiterungsbefehle mit gleichem Namen überschreiben den vorherigen | `services/CommandService.ts`                                         |
| `/doctor`                                              | Implementiert, unterstützt `interactive` / `non_interactive` / `acp`                                    | `ui/commands/doctorCommand.ts`、`utils/doctorChecks.ts`              |
### 2.3 Claude Code – Anregungen

Referenz zum Quellcode unter `/Users/mochi/code/claude-code`:

- `src/types/command.ts`: Das Befehlsmodell enthält Anzeige‑/Fähigkeitsfelder wie `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive`.
- `src/utils/suggestions/commandSuggestions.ts`: Die Vervollständigungssortierung berücksichtigt sowohl exakte Treffer, Alias‑Treffer, Präfix, Fuzzy als auch Skill‑Nutzung; bei Alias‑Treffern wird nur der tatsächlich getroffene Alias angezeigt.
- `src/utils/suggestions/commandSuggestions.ts`: Mid‑Input‑Slash verwendet `findMidInputSlashCommand()`, `getBestCommandMatch()` und `findSlashCommandPositions()`, um Ghost‑Text und Hervorhebung zu unterstützen.
- `src/components/HelpV2/Commands.tsx`: Help V2 ist ein durchsuchbares Befehlsverzeichnis, das beim Anzeigen der Beschreibung auch die Quellinformationen angibt.
- `src/commands.ts`: Claude Code enthält integrierte Befehle wie `/doctor`, `/release‑notes`; Qwen Code hat `/doctor` bereits implementiert; `/release‑notes` wird in dieser Phase nicht umgesetzt.

Phase 3 übernimmt die genannten Punkte nach dem Prinzip „Erfahrung angleichen, Architektur nicht kopieren“.

---

## 3. Gesamtlösung

### 3.1 Übersicht der Dateiänderungen

| Datei                                                              | Änderungsinhalt                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx`            | Erweiterung des `Suggestion`‑Typs: Anzeige von Source‑Badge, `argumentHint`, `aliasHit` |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`                  | Generierung erweiterter Vervollständigungseinträge; Sortierung mit kürzlich verwendeten; Beibehaltung der Alias‑Trefferinformation |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`               | Mid‑Input‑Ghost‑Text nutzt erweitertes Matching; Ausgabe von Argument‑/Source‑Metadaten für die UI‑Anzeige |
| `packages/cli/src/ui/utils/commandUtils.ts`                        | Hilfsfunktion für Slash‑Token‑Hervorhebung oder Erweiterung bestehender Funktionen zur Rückgabe der Befehlsgültigkeit |
| `packages/cli/src/ui/components/InputPrompt.tsx`                   | Rendern der Hervorhebung gültiger Slash‑Command‑Token; Beibehaltung von Tab zur Annahme von Ghost‑Text |
| `packages/cli/src/ui/components/Help.tsx`                          | Umstellung auf einen Claude‑Code‑ähnlichen, tab‑basierten Hilfspaneel (keine reine Befehlsauflistung) |
| `packages/cli/src/ui/commands/helpCommand.ts`                      | Falls non‑interactive/ACP‑Hilfetext benötigt wird, Erweiterung der Aktion; sonst nur interaktive UI |
| `packages/cli/src/acp-integration/session/Session.ts`              | Bereitstellung erweiterter Metadaten im ACP‑Update                                     |
| `packages/cli/src/ui/commands/*Command.ts`                         | Ergänzung von `argumentHint` für häufig verwendete integrierte Befehle                   |

### 3.2 Neues gemeinsames Anzeigewerkzeug

Vorschlag: Neu erstellen `packages/cli/src/services/commandMetadata.ts`, das die für Help, Completion und ACP gemeinsame Anzeigelogik zentralisiert:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Diese Anzeigefunktionen sollten nicht in den Loader eingefügt werden, um ihn nicht mit UI‑Logik zu belasten.

---

## 4. Phase 3.1: Verbesserung der Vervollständigungserfahrung

### 4.1 Erweiterung der Datenstruktur von `Suggestion`

Aktuell:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

Vorgeschlagene Erweiterung:

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

Dateivervollständigung und Reverse‑Search (`mode !== 'slash'`) müssen diese Felder nicht füllen.

### 4.2 Anzeige des Source‑Badges

Derzeit hängt `SuggestionsDisplay` nur bei `CommandKind.MCP_PROMPT` ein `[MCP]` an. Phase 3 verwendet `source` / `sourceLabel`, um einheitlich ein Badge zu generieren:

| source / sourceLabel              | badge                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]` (optional: standardmäßig nicht anzeigen, um Rauschen zu reduzieren) |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` oder `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` oder `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                    |

Empfohlene Implementierung:

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

> Ob `[Built-in]` angezeigt wird, entscheidet die UI‑Lesbarkeit. In der Hilfe muss die Built-in‑Gruppe erscheinen; im Vervollständigungsmenü kann das Built‑in‑Badge weggelassen werden – es wird nur für nicht‑eingebaute Quellen angezeigt.

### 4.3 Anzeige des Argument‑Hints

Im Vervollständigungsmenü wird nach dem Befehlsnamen der `argumentHint` in Grau angehängt:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```
Implementierungsvorschläge:

- `useSlashCompletion` füllt in `finalSuggestions` das Feld `argumentHint: cmd.argumentHint`
- `SuggestionsDisplay` rendert `argumentHint` nach dem Label mit `theme.text.secondary`
- `commandColumnWidth`-Berechnung beinhaltet label + hint + badge, um Fehlausrichtung der Beschreibungsspalte zu vermeiden
- Auch die Vervollständigung von Unterbefehlen unterstützt `argumentHint`

Es wird empfohlen, zunächst für häufig verwendete built-in-Befehle `argumentHint` zu ergänzen. Erste Auswahl:

| Befehl            | argumentHint                 |
| ----------------- | ---------------------------- | ------------------- | --------- | -------------- | -------- |
| `/model`          | `[--fast] [<model-id>]`      |
| `/approval-mode`  | `<mode>`                     |
| `/language`       | `ui                          | output <language>`  |
| `/export`         | `md                          | html                | json      | jsonl [path]`  |
| `/memory`         | `show                        | add                 | refresh`  |
| `/mcp`            | `desc                        | nodesc              | schema    | auth           | noauth` |
| `/stats`          | `[model                      | tools]`             |
| `/docs`           | leer oder nicht gesetzt      |
| `/doctor`         | leer oder nicht gesetzt      |

### 4.4 Sortierung der zuletzt verwendeten

#### 4.4.1 Zustandsspeicherung

In `useSlashCommandProcessor` oder `AppContainer` wird ein session-weiter Zustand der zuletzt verwendeten Befehle gepflegt:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Empfohlen wird die Speicherung als `Map<string, RecentSlashCommand>`, wobei der Schlüssel der endgültige Befehlsname ist (d.h. `cmd.name` nach Konfliktbehandlung).

#### 4.4.2 Aufzeichnungszeitpunkt

Nach erfolgreichem Parsen von `commandToExecute` in `useSlashCommandProcessor.handleSlashCommand` wird die Verwendung aufgezeichnet:

- Nicht gefundene Befehle werden nicht aufgezeichnet
- Versteckte Befehle können ignoriert werden
- Alias-Aufrufe werden unter dem kanonischen `commandToExecute.name` aufgezeichnet
- Bei Unterbefehlsaufrufen wird empfohlen, den vollständigen Pfad aus übergeordnetem Befehl und Blattbefehl aufzuzeichnen; in der ersten Phase ist es akzeptabel, nur den Blattbefehl aufzuzeichnen

#### 4.4.3 Sortiergewichtung

Die aktuelle Sortierreihenfolge von `compareRankedCommandMatches()` ist:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Phase 3 fügt `recentScore` ein:

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

`recentScore` wird wie folgt vorgeschlagen:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Wenn die Abfrage leer ist (der Benutzer gibt nur `/` ein), werden zuletzt verwendete Befehle oben angezeigt; wenn die Abfrage nicht leer ist, wird nur bei gleicher Treffergenauigkeit gewichtet, um zu vermeiden, dass kürzlich verwendete Befehle offensichtlich präzisere Befehle überdecken.

### 4.5 Anzeige von Alias-Treffern

Derzeit nehmen Aliase an `AsyncFzf` und Prefix-Fallback teil, aber `formatSlashCommandLabel()` zeigt immer alle Aliase an:

```text
help (?)
compress (summarize)
```

Phase 3 ändert dies:

- Wenn die Benutzereingabe den Hauptnamen trifft: Keine zusätzliche Anzeige des Alias, oder Beibehaltung des vorhandenen kompakten Formats
- Wenn die Benutzereingabe den Alias trifft: Zeige `help (alias: ?)`
- `Suggestion.matchedAlias` wird in der Matching-Phase gesetzt

Implementierungshinweise:

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

In FZF-Ergebnissen, wenn `result.item` aus `altNames` stammt, kann es direkt als `matchedAlias` verwendet werden; gleiches gilt für Prefix-Fallback.

---

## 5. Phase 3.2: Vollversion des Mid-Input-Slash-Befehls

### 5.1 Aktuelles Verhalten

Derzeit erkennt `findMidInputSlashCommand()` nur „durch Leerzeichen getrennte `/xxx`-Tokens“ und erfordert, dass sich der Cursor am Ende des Tokens befindet; `getBestSlashCommandMatch()` führt nur einen alphabetischen Präfix-Abgleich bei `modelInvocable`-Befehlen durch.

Dies entspricht dem Ziel der Basisversion von Phase 2, aber Phase 3 muss die Anzeige und Hervorhebung ergänzen.

### 5.2 Ghost-Text-Erweiterung

Aktuelle Strategie beibehalten: Mid-Input-Slash schlägt nur `modelInvocable`-Befehle vor, da integrierte Befehle im Text nicht als Slash-Befehl ausgeführt werden.

Erweiterungspunkte:

- Der Matching-Algorithmus wird von alphabetischem Präfix auf die Wiederverwendung der Sortierregeln von `useSlashCompletion` umgestellt (mindestens unter Berücksichtigung von `completionPriority` und zuletzt verwendeten).
- Die Rückgabestruktur wird erweitert auf:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Mid-Input-Source-Badge und Argument-Hinweis

Da der Platz im Ghost-Text begrenzt ist, wird nicht empfohlen, Badge und Hinweis direkt in den Ghost-Text einzufügen. Vorgeschlagene Anzeigeregeln:

- Ghost-Text rendert weiterhin nur das Suffix des Befehlsnamens, z.B. zeigt `please /rev` `iew` an
- Wenn das Token den Befehl vollständig matcht und der Befehl `argumentHint` hat, wird nach dem Cursor eine blasse Parameter-Hinweis angezeigt, z.B. `/review [pr-number] [--comment]`
- Source-Badge wird nur im Dropdown oder in Status-Hinweisen angezeigt; wenn Mid-Input kein Dropdown öffnet, muss das Badge nicht erzwungen werden

### 5.4 Hervorhebung gültiger Befehlstokens

In Anlehnung an Claude Codes `findSlashCommandPositions()` werden in `InputPrompt.renderLineWithHighlighting()` gültige Slash-Befehlstokens im Text eingefärbt.

Vorgeschlagene neue Hilfsfunktion:

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

Regeln:

- Das Token muss am Anfang der Zeichenkette stehen oder das vorherige Zeichen muss ein Leerzeichen sein
- Das Token hat die Form `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Für Mid-Input-Hervorhebung werden nur `modelInvocable`-Befehle als gültig betrachtet
- Line-Start-Tokens können alle interaktiv sichtbaren Befehle als gültig betrachten
- Gültige Tokens erhalten die Akzentfarbe; ungültige Tokens bleiben normaler Text, um zu vermeiden, dass Pfade wie `/usr/bin` fälschlich als Befehl markiert werden

---

## 6. Phase 3.3: Neustrukturierung des Hilfe-Abschnitts

### 6.1 Aktuelle Probleme

Der aktuelle Output von `Help.tsx`:

- Basics
- Flache Auflistung `Commands:`
- `[MCP]`-Erklärung
- Keyboard Shortcuts

Probleme:

- Alle Quellen sind vermischt, Skill, Custom, Plugin, MCP sind schwer zu unterscheiden
- `argumentHint` wird nicht angezeigt
- `supportedModes` wird nicht angezeigt
- `modelInvocable` wird nicht angezeigt
- Unterbefehle werden nur eine Ebene eingerückt, Quelle/Mode werden nicht angezeigt

### 6.2 Gruppierungsdesign

Gruppierung nach `source` / `sourceLabel`:

1. **Built-in Commands**：`source === 'builtin-command'`
2. **Bundled Skills**：`source === 'bundled-skill'`
3. **Custom Commands**：`source === 'skill-dir-command'`, enthält `Custom` / `User` / `Project`
4. **Plugin Commands**：`source === 'plugin-command'`, enthält `Plugin:*` / `Extension:*`
5. **MCP Commands**：`source === 'mcp-prompt'`
6. **Other Commands**：Kompatibilitäts-Fallback für fehlende source
每组内部按命令名排序；`hidden` 命令不展示。

### 6.3 每条命令展示字段

格式建议：

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

为避免 Help 过宽，建议压缩为单行：

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

mode badge 建议：

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` only                  | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| 其他组合                            | `[i] [ni] [acp]` |

### 6.4 `/help` 是否扩展到 headless

路线图只要求 `/help` 输出按来源分组，没有明确要求 non-interactive/acp。当前 `/help` 是 `supportedModes: ['interactive']`。

Phase 3 建议新增 headless 路径，但作为独立子任务：

- `supportedModes` 改为 all modes
- interactive：继续渲染 `HistoryItemHelp`
- non_interactive/acp：返回纯文本分组目录 `message`

如果 scope 需要收敛，可先只重构 interactive `Help` 组件，headless `/help` 延后。

---

## 7. Phase 3.4：ACP available commands 元数据增强

### 7.1 当前 ACP 输出

`Session.sendAvailableCommandsUpdate()` 当前将 `SlashCommand[]` 映射为：

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

其中 `argumentHint` 已通过 `input.hint` 暴露。

### 7.2 增强方案

ACP protocol 的 `AvailableCommand` 类型如果不能直接增加字段，使用 `_meta` 保持兼容：

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

如果 `AvailableCommand` 类型允许扩展字段，则优先输出为一等字段：

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

但仍建议保留 `_meta` 镜像一段时间，便于旧客户端渐进迁移。

### 7.3 subcommands 递归策略

验收标准只要求 `subcommands` 名称列表。首期输出一级子命令即可：

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

后续如果 ACP 客户端需要多级树，可扩展为：

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5：Claude Code 缺失命令补齐

### 8.1 `/doctor`：已实现，不重复实现

当前 `doctorCommand` 已存在：

- 文件：`packages/cli/src/ui/commands/doctorCommand.ts`
- 注册：`BuiltinCommandLoader`
- 模式：`['interactive', 'non_interactive', 'acp']`
- interactive：展示 `HistoryItemDoctor`
- non_interactive/acp：返回 JSON `message`
- 诊断逻辑：`packages/cli/src/utils/doctorChecks.ts`

Phase 3 只需在 Help 和补全中为 `/doctor` 正确展示来源、mode；如需优化，可将 headless JSON 改为更适合人读的 Markdown，但这不是必需项。

### 8.2 `/release-notes`：不纳入本阶段

`/release-notes` 不再作为 Phase 3 需求。本阶段不新增命令、不注册 built-in、不编写相关测试，避免引入无明确产品需求的命令表面。

---

## 9. 冲突策略确认与展示

当前 `CommandService` 冲突策略：

- extension/plugin 命令若与已存在命令同名，重命名为 `extensionName.commandName`
- 若二次冲突，追加数字后缀：`extensionName.commandName1`
- 非 extension 命令同名时，后加载覆盖前加载

Phase 3 不改变执行语义，只在 Help/Completion 中清晰展示最终名称和来源。

建议补充测试确保：

- 被重命名的 plugin command 在补全中显示最终名称和 `[Plugin]` badge
- Help 中按 Plugin Commands 分组展示最终名称
- ACP 输出使用最终名称

> 路线图中“built-in > bundled/skill-dir > plugin > mcp”的优先级，与当前实现“非 extension 后加载覆盖前加载”不完全一致。Phase 3 文档以当前 `CommandService` 源码为准，不在本阶段改冲突语义；如需严格调整优先级，应作为单独 Phase 处理，避免改变已有用户/项目命令覆盖行为。

---

## 10. 测试策略

### 10.1 补全测试

更新或新增：

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx`（如当前无文件则新增）

覆盖：

- source badge：Skill/Custom/Plugin/MCP 正确展示
- argumentHint：命令名后展示 hint，且列宽不破坏描述
- recently used：只输入 `/` 时近期命令排在前面；输入明确 query 时精确命中优先
- alias 命中：输入 `?` 展示 `help (alias: ?)`，输入 `he` 不展示 alias 命中提示
- mid-input ghost：正文 `/rev` 提示 modelInvocable `/review` 后缀
- mid-input 不提示 built-in：正文 `/sta` 不提示 `/stats`（除非未来设计允许内嵌 built-in 执行）

### 10.2 Help 测试

更新：`packages/cli/src/ui/components/Help.test.tsx`

覆盖：

- 按 Built-in/Bundled Skills/Custom/Plugin/MCP 分组
- hidden 命令不展示
- 子命令展示名称列表
- `argumentHint`、source badge、mode badge、model badge 正确出现
- altNames 仍可展示，但不干扰主命令名

### 10.3 ACP 测试

更新：`packages/cli/src/acp-integration/session/Session.test.ts`

覆盖：

- `availableCommands[].input.hint` 保持现有行为
- 新增元数据包含 `argumentHint`、`source`、`sourceLabel`、`supportedModes`、`subcommands`、`modelInvocable`
- 无 `argumentHint` 的命令 `input: null` 保持兼容
- `getAvailableCommands(config, signal, 'acp')` 调用保持不变

### 10.4 新命令测试

本阶段不新增 `/release-notes` 或其他 built-in 命令，因此不需要新增命令测试。仅保留 `/doctor` 既有回归测试。

### 10.5 E2E 测试方案

Phase 3 同时修改 TUI 补全、slash command 执行、ACP command metadata，单元测试不能覆盖完整用户路径。E2E 验证分三类进行：

1. **构建本地 CLI**：先运行 `npm run build && npm run bundle`，后续使用 `node dist/cli.js` 验证本地实现。
2. **Interactive / tmux 场景**：用于验证补全菜单、ghost text、Tab 接受、Help 渲染等 TUI 行为。
3. **Headless / JSON 场景**：用于验证 non-interactive slash command 输出，不依赖 TUI。
4. **ACP integration 场景**：用于验证 `available_commands_update` 元数据。
#### 10.5.1 E2E-Vorbereitungsschritte

```bash
npm run build && npm run bundle
```

Bei interaktiven Szenarien empfiehlt sich die Verwendung eines separaten temporären Verzeichnisses, um das aktuelle Repository nicht zu verschmutzen:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Beim Senden von Eingaben sollten Text und Zeilenumbruch getrennt werden, damit die TUI die Übermittlung nicht verschluckt:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Ausgabe erfassen:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Bereinigen:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 E2E-Testcheckliste

| Szenario                       | Modus            | Schritte                                                                                 | Erwartetes Ergebnis                                                                                                                                    |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vervollständigung des Source-Badge | interactive/tmux | `/` eingeben, das Vervollständigungsmenü beobachten                                       | Die Befehle `skill`/`custom`/`plugin`/`MCP` zeigen das entsprechende Source-Badge an; Built-in-Befehle können ggf. das Badge auslassen              |
| Vervollständigung des Argument-Hinweises | interactive/tmux | `/model`, `/export` eingeben                                                             | Nach dem Befehlsnamen wird `argumentHint` angezeigt; Befehle ohne Argumente zeigen keinen störenden Hint                                             |
| Sortierung nach „zuletzt verwendet” | interactive/tmux | Zuerst `/help` ausführen, dann `/` eingeben                                              | `/help` erscheint bei gleichem Match vor anderen; eine exakte Query hat jedoch weiterhin Vorrang                                                    |
| Anzeige von Alias-Treffern    | interactive/tmux | `/?` eingeben                                                                            | Der Vervollständigungseintrag zeigt `help (alias: ?)`; bei Eingabe von `/he` wird fälschlicherweise kein Alias-Treffer angezeigt                     |
| Ghost-Text bei Mid-Input      | interactive/tmux | Im Text `please /rev` eingeben                                                           | Der Ghost-Text-Suffix `/review` erscheint und kann mit Tab übernommen werden                                                                      |
| Mid-Input-Token-Highlighting  | interactive/tmux | Text mit `/review` eingeben                                                              | Gültige model-invocable Slash-Token werden als Befehl hervorgehoben; Pfade wie `/usr/bin` werden nicht als Befehl hervorgehoben                  |
| Help-Gruppenverzeichnis       | interactive/tmux | `/help` ausführen                                                                        | Die Ausgabe enthält die Gruppen Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands; jeder Befehl zeigt Source/Mode/Hint |
| `/doctor` Headless-Regression | headless/json    | `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` ausführen | Gibt `message` zurück, löst keine TUI-spezifischen Komponentenfehler aus                                                                            |
| ACP-Metadaten                 | integration      | ACP-Session starten und `available_commands_update` auslösen                              | Jeder Befehl enthält `name`, `description`, `input.hint` sowie zusätzlich `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable` |

#### 10.5.3 Headless-Befehlsbeispiele

`/release-notes` ist nicht Teil dieser Phase; für die Headless-Regression dienen nur bestehende Befehle wie `/doctor` zur Validierung.

### 10.6 Regressionstest-Befehle

Gemäß AGENTS.md werden vorrangig einzelne Testdateien ausgeführt:

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

Abschließende Validierung:

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. Abnahmekriterien

### 11.1 Vervollständigungsmenü

- [ ] Das Vervollständigungsmenü zeigt Source-Badges an (mindestens `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] Das Vervollständigungsmenü zeigt `argumentHint` an
- [ ] Innerhalb einer Session erscheinen zuletzt verwendete Befehle bei Eingabe von `/` bevorzugt
- [ ] Bei Alias-Treffern wird `alias: <alias>` angezeigt; bei Nicht-Alias-Treffern erfolgt keine störende Anzeige
- [ ] Nach Umbenennung durch Plugin/Extension-Konflikte wird der endgültige Name und die Quelle im Vervollständigungsmenü angezeigt

### 11.2 Mid-Input-Slash

- [ ] Bei Eingabe eines model-invocable-Befehls wie `/review` im Text wird der Ghost-Text korrekt angezeigt
- [ ] Tab akzeptiert den Ghost-Text bei Mid-Input
- [ ] Gültige Mid-Input-Slash-Command-Token werden hervorgehoben
- [ ] Built-in-Befehle werden nicht fälschlicherweise als ausführbare Inline-Befehle im Text vorgeschlagen
- [ ] Parameterhinweise werden angezeigt, wenn der Befehl vollständig übereinstimmt und keine Argumente hat

### 11.3 Hilfe

- [ ] `/help` zeigt Befehle nach Quellen gruppiert an
- [ ] Jeder Befehl zeigt Name, `argumentHint`, Beschreibung, Quelle und `supportedModes`-Markierung an
- [ ] Model-invocable-Befehle sind deutlich markiert
- [ ] Unterbefehle werden als Liste oder eingerückte Einträge angezeigt
- [ ] Ausgeblendete Befehle werden nicht angezeigt

### 11.4 ACP

- [ ] ACP `available_commands_update` enthält weiterhin `name`, `description`, `input.hint`
- [ ] ACP-Befehlsmetadaten enthalten `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Ältere Clients werden durch neue Felder nicht beeinträchtigt

### 11.5 Fehlende Befehle

- [ ] `/doctor` ist weiterhin verfügbar und gibt im Nicht-interaktiven Modus `message` zurück
- [ ] `/release-notes` wird nicht hinzugefügt; die Anforderung wird aus Dokumentation, Tests und Abnahmekriterien gestrichen

---

## 12. Nicht-Ziele

Die folgenden Inhalte sind nicht Teil von Phase 3:

- Keine Implementierung von Workflow-Commands / dynamischen Skills / MCP-Skills mit neuem Loader
- Keine Einführung einer persistierenden Befehlsnutzungsverfolgung
- Keine Änderung des `SkillTool`-Modellaufrufprotokolls
- Keine Änderung des MCP-Prompt-Modellaufrufpfads
- Keine Refaktorisierung des Command-Executors oder Mode-Adapters
- Keine Änderung der bestehenden Semantik von User-/Project-Commands
## 13. Empfohlene Implementierungsreihenfolge

1. **Datenstrukturen vervollständigen und Badge/Hint-Anzeige**: Zuerst `Suggestion` und `SuggestionsDisplay` erweitern – geringes Risiko, direktes visuelles Feedback.
2. **Integriertes `argumentHint` ergänzen**: Bestehenden Ghost-Text und ACP `input.hint` sofort nutzbar machen.
3. **Recently-used-Sortierung**: In `useSlashCompletion` einen Recent-Score einführen und Tests ergänzen.
4. **Alias-Trefferanzeige**: FZF-/Prefix-Matching anpassen, damit `matchedAlias` erhalten bleibt.
5. **Help-Tab-Umstrukturierung**: Nach Claude-Code-Art klare Panels für General / Commands / Custom Commands bereitstellen, um eine Überladung der Befehlsliste zu vermeiden.
6. **ACP-Metadaten-Erweiterung**: `Session.sendAvailableCommandsUpdate()` erweitern, dabei die Kompatibilität von `_meta` wahren.
7. **Mid-Input-Highlighting verbessern**: Die Rendering-Schicht zuletzt bearbeiten, um parallele Änderungen an der Vervollständigungslogik zu vermeiden.
