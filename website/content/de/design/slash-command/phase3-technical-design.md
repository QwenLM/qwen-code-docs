# Phase 3 Technisches Designdokument: Experience Alignment

## 1. Designziele und Einschränkungen

### 1.1 Ziele

Phase 3 baut auf den in Phase 1/2 bereits implementierten Command-Metadaten, modalübergreifendem Filtern und dem Prompt-Command-Modellaufruf auf und ergänzt die benutzersichtbare Slash-Command-Experience:

- Das Vervollständigungsmenü zeigt Quelle, Parameterhinweise, Alias-Treffer und führt eine session-level „Zuletzt verwendet“-Sortierung ein.
- Verbesserung von Ghost-Text bei Mid-Input-Slash-Commands, Parameterhinweisen, Quellenanzeige und Hervorhebung gültiger Tokens.
- Umgestaltung von `/help` von einer unbrauchbaren Befehlsauflistung zu einem tab-gruppierten, übersichtlichen und ästhetischen Hilfebereich im Claude-Code-Stil.
- Erweiterung der Command-Metadaten in der ACP `available_commands_update`.
- Bestätigung, dass der bereits implementierte `/doctor` nicht neu implementiert wird; `/release-notes` ist nicht in dieser Phase enthalten.

### 1.2 Harte Einschränkungen

- **Code ist maßgeblich**: Wenn die Dokumentation von Phase 1/2 von der Implementierung abweicht, gilt der Quellcode des aktuellen Hauptbranches.
- **Keine neue Ausführungsarchitektur**: Es werden weiterhin die vorhandenen `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` und `Help`-Komponenten verwendet; es werden keine neuen `CommandDescriptor` / `CommandExecutor` / `ModeAdapter` erstellt.
- **Keine Wiederherstellung von `commandType`**: Die aktuelle Implementierung hat das `commandType`-Feld aus dem frühen Design von Phase 1 entfernt; Phase 3 führt dieses Feld nicht wieder ein.
- **Session-level Recently Used**: Die „Zuletzt verwendet“-Sortierung gilt nur innerhalb der aktuellen CLI-Session und wird nicht auf der Festplatte gespeichert.
- **Keine Regression des interaktiven Verhaltens**: Bestehendes interaktives Verhalten wie Vervollständigung, Hilfe, Doktor bleibt nutzbar; Phase 3 verbessert nur die Darstellung und ergänzt fehlende Befehle.
- **Rückwärtskompatibilität der ACP**: Die drei vorhandenen Felder `availableCommands[].name`, `description`, `input` bleiben unverändert; neue Metadaten werden in kompatiblen Feldern oder `_meta` hinzugefügt, um bestehende ACP-Clients nicht zu beschädigen.

---

## 2. Aktuelle Implementierungsbasis (Quellcode-Audit-Ergebnisse)

### 2.1 Vorhandene Metadaten und Loader-Verhalten

`packages/cli/src/ui/commands/types.ts` enthält aktuell in `SlashCommand`:

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` unterstützt aktuell:

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

Von den einzelnen Loadern bereits ausgefüllte Anzeigeinformationen:

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | meist nicht deklariert | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | Von Skill        | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | Von Frontmatter  | Standardmäßig true für User/Project; Plugin benötigt description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | Von Skill        | Standardmäßig true für User/Project; Plugin benötigt description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | Nicht generiert  | `modelInvocable` aktuell nicht explizit gesetzt  |

> Hinweis: Der Phase-1-Fahrplan forderte `modelInvocable: true` für MCP-Prompts, aber die aktuelle Implementierung setzt dies nicht explizit. Phase 3 ändert den Modellaufrufpfad für MCP-Prompts nicht; MCP-Prompts werden weiterhin über den nativen MCP-Mechanismus aufgerufen, nicht über `SkillTool`.

### 2.2 Aktuell implementierte Fähigkeiten von Phase 3

| Fähigkeit                                            | Aktueller Status                                                                                        | Wichtige Dateien                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Basischer Ghost-Text für Mid-Input-Slash             | Teilweise implementiert, nur für `modelInvocable`-Befehle als Präfixvervollständigung                   | `ui/utils/commandUtils.ts`, `ui/hooks/useCommandCompletion.tsx`     |
| Argument-Ghost-Text für Line-Start-Befehle           | Teilweise implementiert, zeigt `argumentHint` bei vollständigem Befehl ohne Argumente                   | `ui/hooks/useCommandCompletion.tsx`                                 |
| Alias-Teilnahme an der Übereinstimmung               | Treffer und Sortierung implementiert, aber Anzeige zeigt immer alle Aliase, unterscheidet nicht den getroffenen Alias | `ui/hooks/useSlashCompletion.ts`                    |
| Source Badge                                         | Nur MCP zeigt `[MCP]`                                                                                   | `ui/components/SuggestionsDisplay.tsx`, `ui/components/Help.tsx`    |
| `/help`                                              | Aktuelle Implementierung gilt als unvollständig: Es gibt zwar Gruppierungsversuche, aber es ist immer noch eine Befehlsauflistung ohne die übersichtliche, tab-gruppierte Hilfe im Claude-Code-Stil | `ui/components/Help.tsx`                      |
| ACP `argumentHint`                                   | Bereits auf `availableCommands[].input.hint` abgebildet                                                  | `acp-integration/session/Session.ts`                                |
| ACP source/supportedModes/subcommands/modelInvocable | Nicht exponiert                                                                                         | `acp-integration/session/Session.ts`                                |
| Konfliktauflösung                                    | Bei Namenskonflikten von Extension-Befehlen: Umbenennung in `extensionName.commandName`; bei Nicht-Extension-Befehlen überschreibt der zuletzt geladene den vorherigen | `services/CommandService.ts`                                        |
| `/doctor`                                            | Implementiert, unterstützt `interactive` / `non_interactive` / `acp`                                     | `ui/commands/doctorCommand.ts`, `utils/doctorChecks.ts`             |

### 2.3 Claude-Code-Anknüpfungspunkte

Quellcode aus `/Users/mochi/code/claude-code`:

- `src/types/command.ts`: Das Befehlsmodell enthält `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive` usw. für Darstellung/Fähigkeiten.
- `src/utils/suggestions/commandSuggestions.ts`: Die Reihung der Vervollständigungen berücksichtigt gleichzeitig exakte Treffer, Alias-Treffer, Präfix, Fuzzy, Skill-Usage; bei Alias-Treffern wird nur der tatsächlich getroffene Alias angezeigt.
- `src/utils/suggestions/commandSuggestions.ts`: Mid-Input-Slash verwendet `findMidInputSlashCommand()`, `getBestCommandMatch()` und `findSlashCommandPositions()` für Ghost-Text und Hervorhebung.
- `src/components/HelpV2/Commands.tsx`: Help V2 ist ein durchsuchbares Befehlsverzeichnis, das bei der Beschreibung die Quellinformationen anzeigt.
- `src/commands.ts`: Claude Code hat Builtins wie `/doctor`, `/release-notes`; Qwen Code hat bereits `/doctor` implementiert; `/release-notes` wird in dieser Phase nicht implementiert.

Phase 3 übernimmt diese Punkte im Stil von „Experience Alignment, keine Architekturübernahme“.

---

## 3. Gesamtkonzept

### 3.1 Dateiänderungen – Übersicht

| Datei                                                   | Änderungsinhalt                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx` | Erweiterung des `Suggestion`-Typs, Anzeige von Source-Badge, argumentHint, aliasHit |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`       | Generierung erweiterter Vervollständigungseinträge; Sortierung mit Recently Used; Beibehaltung von Alias-Trefferinformationen |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`    | Mid-Input-Ghost-Text nutzt erweiterte Übereinstimmung; Ausgabe von Argument-/Source-Metadaten für die UI-Anzeige |
| `packages/cli/src/ui/utils/commandUtils.ts`             | Hinzufügen von Hilfsfunktionen für Slash-Token-Hervorhebung oder Erweiterung bestehender Funktionen zur Rückgabe der Befehlssyntax |
| `packages/cli/src/ui/components/InputPrompt.tsx`        | Rendern der Hervorhebung gültiger Slash-Command-Tokens; Beibehaltung der Tab-Akzeptanz von Ghost-Text |
| `packages/cli/src/ui/components/Help.tsx`               | Umgestaltung zu einem tab-gruppierten Hilfebereich im Claude-Code-Stil, Vermeidung von Befehlsauflistungen |
| `packages/cli/src/ui/commands/helpCommand.ts`           | Falls non-interactive/acp-Hilfetext benötigt wird, Aktion erweitern; sonst nur interaktive UI beibehalten |
| `packages/cli/src/acp-integration/session/Session.ts`   | Exponieren erweiterter Metadaten im ACP-Update                                  |
| `packages/cli/src/ui/commands/*Command.ts`              | Ergänzung von `argumentHint` für häufige Builtin-Befehle                        |

### 3.2 Neues gemeinsam genutztes Darstellungstool

Vorschlag: Hinzufügen von `packages/cli/src/services/commandMetadata.ts` zur zentralen Verarbeitung von Darstellungslogik, die von Help, Completion und ACP gemeinsam benötigt wird:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Es wird nicht empfohlen, diese Darstellungsfunktionen in die Loader zu legen, um zu vermeiden, dass die Loader UI-Logik übernehmen.

---

## 4. Phase 3.1: Verbesserung der Vervollständigungserfahrung

### 4.1 Erweiterung der `Suggestion`-Datenstruktur

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

Vorschlag Erweiterung:

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

Dateivervollständigung und Reverse-Search im Modus `!== 'slash'` müssen diese Felder nicht füllen.

### 4.2 Source-Badge-Anzeige

Aktuell hängt `SuggestionsDisplay` nur bei `CommandKind.MCP_PROMPT` ein `[MCP]` an. Phase 3 verwendet `source` / `sourceLabel` zur einheitlichen Generierung des Badges:

| source / sourceLabel              | badge                                        |
| --------------------------------- | -------------------------------------------- |
| `builtin-command`                 | `[Built-in]` (optional: Standardmäßig nicht anzeigen, um Rauschen zu reduzieren) |
| `bundled-skill` / `Skill`         | `[Skill]`                                    |
| `skill-dir-command` / `User`      | `[User]`                                     |
| `skill-dir-command` / `Project`   | `[Project]`                                  |
| `skill-dir-command` / `Custom`    | `[Custom]`                                   |
| `plugin-command` / `Plugin: x`    | `[Plugin]` oder `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` oder `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                      |

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

> Ob `[Built-in]` angezeigt wird, hängt von der Lesbarkeit der UI ab. In der Hilfe muss die Built-in-Gruppe angezeigt werden; im Vervollständigungsmenü kann das Built-in-Badge weggelassen werden, es wird nur für nicht integrierte Quellen angezeigt.

### 4.3 Argument-Hint-Anzeige

Im Vervollständigungsmenü wird nach dem Befehlsnamen ein grauer `argumentHint` angehängt:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

Implementierungsvorschlag:

- `useSlashCompletion` füllt in `finalSuggestions` `argumentHint: cmd.argumentHint`
- `SuggestionsDisplay` rendert `argumentHint` nach dem Label in `theme.text.secondary`
- `commandColumnWidth` berechnet Label + Hint + Badge, um Spaltenversatz der Beschreibung zu vermeiden
- Subcommand-Vervollständigung unterstützt ebenfalls `argumentHint`

Zuerst müssen für häufige Builtin-Befehle `argumentHint` ergänzt werden. Empfohlene erste Charge:

| Befehl            | argumentHint            |
| ----------------- | ----------------------- | ------------------- | -------- | -------------- | -------- |
| `/model`          | `[--fast] [<model-id>]` |
| `/approval-mode`  | `<mode>`                |
| `/language`       | `ui                     | output <language>`  |
| `/export`         | `md                     | html                | json     | jsonl [path]`  |
| `/memory`         | `show                   | add                 | refresh` |
| `/mcp`            | `desc                   | nodesc              | schema   | auth           | noauth` |
| `/stats`          | `[model                 | tools]`             |
| `/docs`           | Keine oder nicht setzen |
| `/doctor`         | Keine oder nicht setzen |

### 4.4 Recently-Used-Sortierung

#### 4.4.1 Status-Speicher

In `useSlashCommandProcessor` oder `AppContainer` wird der session-level „Zuletzt verwendet“-Status verwaltet:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Empfehlung: Speicherung als `Map<string, RecentSlashCommand>`, Schlüssel = endgültiger Befehlsname (d.h. `cmd.name` nach Konfliktauflösung).

#### 4.4.2 Aufzeichnungszeitpunkt

Nach erfolgreicher Auflösung von `commandToExecute` in `useSlashCommandProcessor.handleSlashCommand` wird die Nutzung aufgezeichnet:

- Bei nicht gefundenem Befehl nicht aufzeichnen
- Bei versteckten Befehlen kann auf Aufzeichnung verzichtet werden
- Alias-Aufrufe werden unter dem kanonischen `commandToExecute.name` aufgezeichnet
- Bei Subcommand-Aufrufen wird empfohlen, den vollständigen Pfad von Eltern- und Blattbefehl aufzuzeichnen; in der ersten Phase ist die Aufzeichnung nur des Blattbefehls akzeptabel

#### 4.4.3 Sortiergewichtung

Aktuelle Reihenfolge von `compareRankedCommandMatches()`:

1. matchStrength
2. completionPriority
3. fzf-Score
4. Start der Übereinstimmung
5. Länge des Elements
6. Originalindex

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

Vorschlag für `recentScore`:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Wenn die Abfrage leer ist (Benutzer gibt nur `/` ein), werden zuletzt verwendete Befehle oben angezeigt; wenn die Abfrage nicht leer ist, wird nur bei gleicher Trefferstärke gewichtet, um zu vermeiden, dass aktuelle Befehle deutlich präzisere Befehle verdrängen.

### 4.5 Alias-Trefferanzeige

Aktuell nimmt Alias bereits an `AsyncFzf` und Prefix-Fallback teil, aber `formatSlashCommandLabel()` zeigt immer alle Aliase:

```text
help (?)
compress (summarize)
```

Phase 3 ändert:

- Wenn der Benutzer den Hauptnamen trifft: keine zusätzliche Alias-Anzeige oder Beibehaltung des aktuellen kompakten Formats
- Wenn der Benutzer einen Alias trifft: Anzeige `help (alias: ?)`
- `Suggestion.matchedAlias` wird in der Trefferphase geschrieben

Implementierungskern:

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

In FZF-Ergebnissen kann `result.item` aus `altNames` direkt als `matchedAlias` verwendet werden; im Prefix-Fallback analog.

---

## 5. Phase 3.2: Mid-Input-Slash-Command – Vollversion

### 5.1 Aktuelles Verhalten

Aktuell erkennt `findMidInputSlashCommand()` nur durch Leerzeichen getrennte `/xxx`-Tokens und erfordert, dass sich der Cursor am Ende des Tokens befindet; `getBestSlashCommandMatch()` führt nur eine alphabetische Präfix-Übereinstimmung unter `modelInvocable`-Befehlen durch.

Dies entspricht dem Ziel der Phase-2-Basisversion, aber Phase 3 muss Darstellung und Hervorhebung ergänzen.

### 5.2 Ghost-Text-Erweiterung

Beibehaltung der aktuellen Strategie: Mid-Input-Slash schlägt nur `modelInvocable`-Befehle vor, da Builtin-Befehle im Textkörper nicht als Slash-Command ausgeführt werden.

Verbesserungspunkte:

- Der Matching-Algorithmus wechselt von alphabetischem Präfix zur Wiederverwendung der Sortierregeln von `useSlashCompletion` (zumindest `completionPriority` und recently used)
- Die Rückgabestruktur wird erweitert zu:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Mid-Input-Source-Badge und Argument-Hint

Da der Platz für Ghost-Text begrenzt ist, wird nicht empfohlen, Badge und Hint direkt in den Ghost-Text-Körper zu packen. Empfohlenes Darstellungsregelwerk:

- Ghost-Text rendert weiterhin nur das Suffix des Befehlsnamens, z.B. zeigt `Bitte /rev` die `view` an
- Wenn das Token bereits vollständig mit einem Befehl übereinstimmt und der Befehl `argumentHint` hat, wird nach dem Cursor ein blasser Parameterhinweis angezeigt, z.B. `/review [pr-number] [--comment]`
- Source-Badge wird nur im Dropdown oder in einer Statusmeldung angezeigt; wenn Mid-Input kein Dropdown öffnet, kann das Badge optional entfallen

### 5.4 Hervorhebung gültiger Befehlstokens

In Anlehnung an `findSlashCommandPositions()` von Claude Code wird in `InputPrompt.renderLineWithHighlighting()` eine Farbgebung für gültige Slash-Command-Tokens im Textkörper implementiert.

Vorschlag für neue Hilfsfunktion:

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

- Das Token muss am Zeilenanfang stehen oder ein vorheriges Leerzeichen haben
- Token-Form: `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Für Mid-Input-Hervorhebung werden nur `modelInvocable`-Befehle als gültig gewertet
- Line-Start-Token können alle interaktiv sichtbaren Befehle als gültig werten
- Gültige Tokens erhalten eine Akzentfarbe; ungültige Tokens bleiben normaler Text, um zu vermeiden, dass Pfade wie `/usr/bin` fälschlich als Befehl markiert werden

---

## 6. Phase 3.3: Neugestaltung des Hilfe-Inhaltsverzeichnisses

### 6.1 Aktuelle Probleme

`Help.tsx` gibt derzeit aus:

- Basics
- Flach `Commands:`
- `[MCP]` Erklärung
- Tastaturkürzel

Probleme:

- Alle Quellen sind vermischt; Skill, Custom, Plugin, MCP sind schwer unterscheidbar
- `argumentHint` wird nicht angezeigt
- `supportedModes` wird nicht angezeigt
- `modelInvocable` wird nicht angezeigt
- Subcommands sind nur um eine Stufe eingerückt, Quelle/Modus werden nicht angezeigt

### 6.2 Gruppierungsdesign

Gruppierung nach `source` / `sourceLabel`:

1. **Built-in Commands**: `source === 'builtin-command'`
2. **Bundled Skills**: `source === 'bundled-skill'`
3. **Custom Commands**: `source === 'skill-dir-command'`, inkl. `Custom` / `User` / `Project`
4. **Plugin Commands**: `source === 'plugin-command'`, inkl. `Plugin:*` / `Extension:*`
5. **MCP Commands**: `source === 'mcp-prompt'`
6. **Other Commands**: Rückfall für fehlende Quelle

Innerhalb jeder Gruppe nach Befehlsname sortiert; versteckte Befehle werden nicht angezeigt.

### 6.3 Angezeigte Felder pro Befehl

Vorschlag Format:

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Um eine zu breite Hilfe zu vermeiden, Vorschlag für einzeiliges Format:

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Empfohlenes Mode-Badge:

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| nur `interactive`                   | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| Andere Kombinationen                | `[i] [ni] [acp]` |

### 6.4 `/help` auf Headless ausgedehnt?

Der Fahrplan verlangt nur die Ausgabe von `/help` nach Quellen gruppiert, ohne explizite Anforderung für non-interactive/acp. Aktuell ist `/help` mit `supportedModes: ['interactive']` belegt.

Phase 3 schlägt einen separaten Headless-Pfad als Unteraufgabe vor:

- `supportedModes` auf alle Modi ändern
- Interactive: weiterhin `HistoryItemHelp` rendern
- non_interactive/acp: Klartext-Gruppenverzeichnis `message` zurückgeben

Wenn der Umfang eingeschränkt werden muss, kann zunächst nur die interaktive `Help`-Komponente umgestaltet werden; Headless `/help` wird später umgesetzt.

---

## 7. Phase 3.4: Erweiterung der ACP available_commands-Metadaten

### 7.1 Aktuelle ACP-Ausgabe

`Session.sendAvailableCommandsUpdate()` bildet derzeit `SlashCommand[]` ab auf:

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

wobei `argumentHint` bereits über `input.hint` exponiert ist.

### 7.2 Erweiterungsvorschlag

Wenn der ACP-Protokolltyp `AvailableCommand` keine neuen Felder zulässt, wird `_meta` verwendet, um Kompatibilität zu wahren:

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

Wenn der Typ `AvailableCommand` eine Erweiterung zulässt, werden die Felder vorzugsweise als First-Class-Felder ausgegeben:

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

Es wird jedoch empfohlen, `_meta` für eine Übergangszeit als Spiegelbild beizubehalten, um eine schrittweise Migration älterer Clients zu ermöglichen.

### 7.3 Subcommands-Rekursionsstrategie

Die Abnahmekriterien verlangen nur die Liste der Subcommand-Namen. In der ersten Phase genügt die Ausgabe der unmittelbaren Subcommands:

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Falls später ACP-Clients eine mehrstufige Baumstruktur benötigen, kann wie folgt erweitert werden:

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5: Ergänzung fehlender Claude-Code-Befehle

### 8.1 `/doctor`: Bereits implementiert, nicht neu implementieren

Der `doctorCommand` existiert bereits:

- Datei: `packages/cli/src/ui/commands/doctorCommand.ts`
- Registrierung: `BuiltinCommandLoader`
- Modi: `['interactive', 'non_interactive', 'acp']`
- Interactive: zeigt `HistoryItemDoctor`
- non_interactive/acp: gibt JSON `message` zurück
- Diagnoselogik: `packages/cli/src/utils/doctorChecks.ts`

Phase 3 muss nur in Hilfe und Vervollständigung für `/doctor` korrekte Quellen- und Modus-Informationen anzeigen; falls Optimierung gewünscht ist, kann das Headless-JSON in menschenlesbares Markdown umgewandelt werden, aber das ist nicht zwingend erforderlich.

### 8.2 `/release-notes`: Nicht in dieser Phase enthalten

`/release-notes` wird nicht mehr als Phase-3-Anforderung betrachtet. In dieser Phase werden keine neuen Befehle hinzugefügt, keine Builtins registriert und keine zugehörigen Tests geschrieben, um die Einführung von Befehlen ohne klaren Produktbedarf zu vermeiden.

---

## 9. Bestätigung und Darstellung der Konfliktstrategie

Aktuelle Konfliktstrategie von `CommandService`:

- Wenn ein Extension/Plugin-Befehl mit einem bereits vorhandenen Befehl namensgleich ist, wird er in `extensionName.commandName` umbenannt
- Bei erneutem Konflikt wird ein numerisches Suffix angehängt: `extensionName.commandName1`
- Bei Namensgleichheit von Nicht-Extension-Befehlen überschreibt der zuletzt geladene den vorherigen

Phase 3 ändert die Ausführungssemantik nicht, zeigt aber in Hilfe/Vervollständigung den endgültigen Namen und die Quelle klar an.

Empfehlung für ergänzende Tests:

- Der umbenannte Plugin-Befehl zeigt in der Vervollständigung den endgültigen Namen und das `[Plugin]`-Badge
- In der Hilfe wird er in der Gruppe „Plugin Commands“ mit endgültigem Namen angezeigt
- Die ACP-Ausgabe verwendet den endgültigen Namen

> Die Priorität „built-in > bundled/skill-dir > plugin > mcp“ aus dem Fahrplan stimmt nicht vollständig mit der aktuellen Implementierung „Nicht-Extension überschreibt später geladenes“ überein. Die Phase-3-Dokumentation orientiert sich am aktuellen `CommandService`-Quellcode und ändert die Konfliktsemantik in dieser Phase nicht; falls eine strenge Anpassung der Priorität erforderlich ist, sollte dies als separate Phase behandelt werden, um das bestehende Überschreibverhalten von Benutzer-/Projektbefehlen nicht zu beeinträchtigen.

---

## 10. Teststrategie

### 10.1 Vervollständigungstests

Aktualisieren oder neu:

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (neu anlegen, falls nicht vorhanden)

Abdeckung:

- Source-Badge: Skill/Custom/Plugin/MCP werden korrekt angezeigt
- argumentHint: Hint wird nach dem Befehlsnamen angezeigt, Spaltenbreite zerstört nicht die Beschreibung
- Recently Used: Bei nur `/` werden kürzlich verwendete Befehle oben angezeigt; bei eindeutiger Abfrage haben exakte Treffer Vorrang
- Alias-Treffer: Eingabe von `?` zeigt `help (alias: ?)`, Eingabe von `he` zeigt keinen Alias-Hinweis
- Mid-Input-Ghost: Im Text `/rev` schlägt modelInvocable `/review` als Suffix vor
- Mid-Input schlägt kein Builtin vor: Im Text `/sta` schlägt nicht `/stats` vor (es sei denn, ein zukünftiges Design erlaubt die Ausführung von Builtins im Textkörper)
### 10.2 Help-Tests

Aktualisiert: `packages/cli/src/ui/components/Help.test.tsx`

Abgedeckt:

- Gruppierung nach Built-in/Bundled Skills/Custom/Plugin/MCP
- `hidden`-Befehle werden nicht angezeigt
- Unterbefehle zeigen Namensliste an
- `argumentHint`, Source-Badge, Mode-Badge, Model-Badge erscheinen korrekt
- `altNames` werden weiterhin angezeigt, beeinträchtigen jedoch nicht den primären Befehlsnamen

### 10.3 ACP-Tests

Aktualisiert: `packages/cli/src/acp-integration/session/Session.test.ts`

Abgedeckt:

- `availableCommands[].input.hint` behält das bisherige Verhalten
- Neue Metadaten enthalten `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands`, `modelInvocable`
- Befehle ohne `argumentHint` haben weiterhin `input: null` (Kompatibilität)
- Der Aufruf von `getAvailableCommands(config, signal, 'acp')` bleibt unverändert

### 10.4 Neue Befehlstests

In dieser Phase werden keine neuen Built-in-Befehle wie `/release-notes` hinzugefügt, daher sind keine neuen Befehlstests erforderlich. Es wird lediglich der bestehende Regressionstest für `/doctor` beibehalten.

### 10.5 E2E-Testszenario

Phase 3 ändert gleichzeitig die TUI-Vervollständigung, die Slash-Command-Ausführung und die ACP-Command-Metadaten. Unit-Tests können den vollständigen Benutzerpfad nicht abdecken. Die E2E-Validierung erfolgt in vier Kategorien:

1. **Lokales CLI erstellen**: Zuerst `npm run build && npm run bundle` ausführen, danach mit `node dist/cli.js` die lokale Implementierung testen.
2. **Interaktives / tmux-Szenario**: Zum Testen von Vervollständigungsmenü, Ghost-Text, Tab-Annahme, Help-Rendering und anderem TUI-Verhalten.
3. **Headless / JSON-Szenario**: Zum Testen der Ausgabe von nicht-interaktiven Slash-Befehlen, unabhängig von der TUI.
4. **ACP-Integrationsszenario**: Zum Testen der Metadaten von `available_commands_update`.

#### 10.5.1 E2E-Voraussetzungen

```bash
npm run build && npm run bundle
```

Für interaktive Szenarien empfiehlt sich die Verwendung eines separaten temporären Verzeichnisses, um das aktuelle Repository nicht zu verunreinigen:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Bei der Eingabe Text und Eingabetaste trennen, damit die TUI die Übermittlung nicht verschluckt:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Ausgabe erfassen:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Bereinigung:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 E2E-Testliste

| Szenario                    | Modus             | Schritte                                                                               | Erwartetes Ergebnis                                                                                                                               |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vervollständigung Source-Badge | interactive/tmux | `/` eingeben, Vervollständigungsmenü beobachten                                        | Bei Skill/Custom/Plugin/MCP-Befehlen wird das entsprechende Source-Badge angezeigt; Built-in-Befehle können Badge auslassen                       |
| Vervollständigung Argument-Hint | interactive/tmux | `/model`, `/export` eingeben                                                           | Nach dem Befehlsnamen wird der `argumentHint` angezeigt; Befehle ohne Parameter zeigen keinen störenden Hint                                        |
| Recently-Used-Sortierung    | interactive/tmux | Zuerst `/help` ausführen, dann `/` eingeben                                            | Bei gleicher Trefferquote erscheint `/help` zuerst; die exakte Query hat weiterhin Vorrang                                                           |
| Alias-Trefferanzeige        | interactive/tmux | `/?` eingeben                                                                          | Vervollständigung zeigt `help (alias: ?)` an; bei Eingabe von `/he` wird kein irreführender Alias-Treffer angezeigt                                    |
| Ghost-Text während der Eingabe | interactive/tmux | Im Text `please /rev` eingeben                                                         | Ghost-Text-Suffix für `/review` erscheint, Tab kann angenommen werden                                                                               |
| Token-Highlight während der Eingabe   | interactive/tmux | Text mit `/review` eingeben                                                            | Gültige model-invocable Slash-Token werden mit Befehlshighlight versehen; Pfade wie `/usr/bin` werden nicht als Befehl hervorgehoben                     |
| Hilfe-Gruppierung           | interactive/tmux | `/help` ausführen                                                                      | Ausgabe enthält die Gruppen Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands; jeder Befehl zeigt Source/Mode/Hint      |
| Headless-Regression `/doctor` | headless/json    | `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` ausführen | Gibt `message` zurück, löst keine TUI-spezifischen Fehler aus                                                                                      |
| ACP-Metadaten               | integration      | ACP-Session ausführen und `available_commands_update` auslösen                         | Jeder Befehl behält `name`, `description`, `input.hint` und enthält `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable` |

#### 10.5.3 Headless-Befehlsbeispiel

`/release-notes` ist nicht in dieser Phase enthalten; Headless-Regression beschränkt sich auf die Validierung bestehender Befehle wie `/doctor`.

### 10.6 Regressionstest-Befehle

Gemäß AGENTS.md sollten vorrangig die Einzeldateitests ausgeführt werden:

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
- [ ] Zuletzt in der Sitzung verwendete Befehle erscheinen bei nur `/`-Eingabe bevorzugt
- [ ] Bei Alias-Treffern wird `alias: <alias>` angezeigt, bei Nicht-Alias-Treffern wird kein störender Hinweis gegeben
- [ ] Nach Plugin/Extension-Konflikten umbenannte Befehle zeigen im Menü den endgültigen Namen und die Quelle an

### 11.2 Slash in der Texteingabe

- [ ] Bei Eingabe eines model-invocable Befehls wie `/review` im Text erscheint korrekter Ghost-Text
- [ ] Tab kann den Ghost-Text in der Texteingabe akzeptieren
- [ ] Gültige Mid-Input-Slash-Command-Token werden hervorgehoben
- [ ] Built-in-Befehle werden im Text nicht fälschlicherweise als ausführbare Inline-Befehle vorgeschlagen
- [ ] Parametervorschlag wird bei vollständiger Übereinstimmung und fehlenden Argumenten angezeigt

### 11.3 Hilfe

- [ ] `/help` zeigt Befehle nach Quelle gruppiert an
- [ ] Jeder Befehl zeigt Name, `argumentHint`, Beschreibung, Quelle und Markierungen für `supportedModes` an
- [ ] Model-invocable Befehle sind eindeutig markiert
- [ ] Unterbefehle werden als Namensliste oder eingerückte Einträge angezeigt
- [ ] `hidden`-Befehle werden nicht angezeigt

### 11.4 ACP

- [ ] ACP `available_commands_update` enthält weiterhin `name`, `description`, `input.hint`
- [ ] ACP-Befehlsmetadaten enthalten `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Alte Clients werden durch die neuen Felder nicht beeinträchtigt

### 11.5 Fehlende Befehle

- [ ] `/doctor` ist weiterhin verfügbar und gibt im nicht-interaktiven Modus `message` zurück
- [ ] `/release-notes` wird nicht hinzugefügt; Dokumentation, Tests und Abnahmekriterien fordern diesen Befehl nicht mehr

---

## 12. Nicht-Ziele

Folgende Inhalte sind nicht Teil von Phase 3:

- Keine Implementierung von Workflow-Command, Dynamic-Skill oder MCP-Skill-New-Loader
- Keine Einführung einer persistenten Command-Usage-Tracking
- Keine Änderung des Modellaufrufprotokolls von `SkillTool`
- Keine Änderung des Modellaufrufpfads von MCP-Prompts
- Kein Refactoring des Command-Executors oder des Mode-Adapters
- Keine Änderung der Überschreibungssemantik bestehender User/Project-Commands

---

## 13. Empfohlene Implementierungsreihenfolge

1. **Vervollständigungsdatenstruktur und Badge/Hint-Anzeige**: Zuerst `Suggestion` und `SuggestionsDisplay` erweitern – geringes Risiko, intuitive Rückmeldung.
2. **Built-in `argumentHint` ergänzen**: Bestehender Ghost-Text und ACP `input.hint` profitieren sofort.
3. **Recently-Used-Sortierung**: In `useSlashCompletion` einen Recent-Score einführen und Tests ergänzen.
4. **Alias-Trefferanzeige**: FZF/Präfix-Matching anpassen und `matchedAlias` beibehalten.
5. **Help-Tab-Refactoring**: Im Stil von Claude Code klare Panels wie General / Commands / Custom Commands bereitstellen und überladenes Auflisten vermeiden.
6. **ACP-Metadaten erweitern**: `Session.sendAvailableCommandsUpdate()` erweitern und `_meta`-Kompatibilität wahren.
7. **Mid-Input-Highlighting verbessern**: Die Rendering-Ebene zuletzt behandeln, um zu große parallele Änderungen mit der Vervollständigungslogik zu vermeiden.