# Phase 1 Technisches Design-Dokument: Infrastruktur-Neuaufbau

## 1. Designziele und Constraints

### 1.1 Ziele

- Einheitliches Befehls-Metadatenmodell etablieren, das vier Dimensionen abdeckt: Quelle (`source`), Ausführungstyp (`commandType`), Modus-Fähigkeiten (`supportedModes`) und Sichtbarkeit (`userInvocable` / `modelInvocable`)
- Hardcodierte Whitelist in `non-interactive`/`acp` durch Capability-basierte Filterung ersetzen
- Stabile Low-Level-Schnittstelle für die Capability-Erweiterung in Phase 2/3 bereitstellen

### 1.2 Harte Constraints

- **Keine Verhaltensänderung**: Die Menge der verfügbaren Befehle in den Modi `non-interactive` und `acp` bleibt unverändert (Ausnahme: Behebung des fälschlichen Abfangens von `MCP_PROMPT`, dies ist ein Bugfix)
- **Abwärtskompatibilität**: Neue Felder im `SlashCommand`-Interface sind alle optional oder haben sinnvolle Standardwerte; bestehender Befehlscode muss nicht sofort angepasst werden
- **Keine neuen Executer**: Keine Erstellung neuer Ausführungsarchitekturen wie `ModeAdapter` / `CommandExecutor`; nur Erweiterung der bestehenden `CommandService`- und Filterlogik
- **Keine Änderung bestehender Befehlsfähigkeiten**: Keine neuen `local`-Subcommands für bestehende Befehle, keine Änderung der `action`-Implementierung irgendeines Befehls

---

## 2. Neue Typdefinitionen

### 2.1 Dateiposition

Alle neuen Typdefinitionen befinden sich in `packages/cli/src/ui/commands/types.ts`, gemeinsam mit dem bestehenden `SlashCommand`-Interface.

### 2.2 `ExecutionMode`

```typescript
/**
 * Ausführungsmodus-Enumeration.
 * - interactive: React/Ink UI-Modus (Terminal-Interaktion)
 * - non_interactive: Non-Interactive CLI-Modus (Text/JSON-Ausgabe)
 * - acp: ACP/Zed-Integrationsmodus
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Befehlsquellen-Enumeration, verwendet für Help-Gruppierung, Completion-Badges und ACP available commands.
 *
 * Unterschied zu CommandKind:
 * - CommandKind ist die interne Loader-Klassifizierung (4 Arten), die die Ladelogik beeinflusst
 * - CommandSource ist die benutzerorientierte Quellenklassifizierung (9 Arten), die die Darstellung und das mentale Modell beeinflusst
 *
 * Beide können sich überschneiden, haben aber unterschiedliche Verantwortlichkeiten und werden nicht zusammengeführt.
 */
export type CommandSource =
  | 'builtin-command' // Eingebaute Befehle (BuiltinCommandLoader)
  | 'bundled-skill' // Mit dem Paket verteilte Skills (BundledSkillLoader)
  | 'skill-dir-command' // Datei-Befehle unter .qwen/commands/ des Users/Projekts (FileCommandLoader, kein Plugin)
  | 'plugin-command' // Von Plugins bereitgestellte Befehle (FileCommandLoader, extensionName nicht leer)
  | 'mcp-prompt'; // Vom MCP-Server bereitgestellter Prompt (McpPromptLoader)
// Folgende Quellen sind reserviert, in Phase 1 nicht implementiert, aber Schema vordefiniert:
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * Befehlsausführungstyp, beschreibt "wie" der Befehl ausgeführt wird.
 *
 * - prompt: Erzeugt submit_prompt, übergibt Inhalt an das Modell. Geeignet für Skills, File Commands, MCP Prompts.
 *   Standard-supportedModes: alle Modi, Standard-modelInvocable: true.
 *
 * - local: Lokale Ausführungslogik, keine Abhängigkeit von React/Ink UI. Kann message, stream_messages,
 *   submit_prompt, tool etc. zurückgeben. Geeignet für Query-, Konfigurations- und Status-Built-in-Befehle.
 *   Standard-supportedModes: ['interactive'], muss explizit deklariert werden, um für andere Modi freigegeben zu werden.
 *   Dies entspricht der Semantik von supportsNonInteractive: true in Claude Code – Non-Interactive-Unterstützung muss explizit deklariert werden, nicht automatisch inferiert.
 *
 * - local-jsx: Befehle, die von React/Ink UI abhängen (Dialog öffnen, JSX-Komponenten rendern etc.).
 *   Standard-supportedModes: nur ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Erweiterung des `SlashCommand`-Interfaces

Neue Felder werden an das bestehende Interface angehängt, **alle optional** zur Wahrung der Abwärtskompatibilität:

```typescript
export interface SlashCommand {
  // ── Bestehende Felder (unverändert) ──────────────────────────────────────────────
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

  // ── Phase 1 neu: Quelle und Ausführungstyp ──────────────────────────────────────
  /**
   * Befehlsquelle, verwendet für Help-Gruppierung, Completion-Badges und ACP available commands.
   * Wird vom Loader befüllt, nicht vom Befehl selbst deklariert.
   * Wenn CommandKind zukünftig deprecated wird, wird source die einzige Quellenkennung.
   */
  source?: CommandSource;

  /**
   * Benutzerorientiertes Quellen-Label für die Anzeige.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Wird vom Loader befüllt, kann vom Befehl selbst überschrieben werden.
   */
  sourceLabel?: string;

  /**
   * Befehlsausführungstyp.
   * - Loader befüllt Standardwerte (prompt/local-jsx)
   * - Built-in-Befehle deklarieren ihn in der jeweiligen Befehlsdatei (local oder local-jsx)
   * Standardstrategie bei fehlender Deklaration siehe getEffectiveCommandType().
   */
  commandType?: CommandType;

  // ── Phase 1 neu: Modus-Fähigkeiten ──────────────────────────────────────────
  /**
   * In welchen Ausführungsmodi dieser Befehl verfügbar ist.
   * Bei fehlender Deklaration wird der Standardwert basierend auf commandType inferiert (siehe getEffectiveSupportedModes()).
   * Explizite Deklaration hat Vorrang vor dem inferierten Wert.
   */
  supportedModes?: ExecutionMode[];

  // ── Phase 1 neu: Sichtbarkeit ──────────────────────────────────────────────
  /**
   * Ob der Benutzer diesen Befehl über einen Slash-Command aufrufen kann.
   * Standard: true (fast alle Befehle sind userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Ob das Modell diesen Befehl über einen Tool-Call aufrufen kann.
   * Standard: false. Befehle vom Typ prompt (Skills, File Commands, MCP Prompts) sollten auf true gesetzt werden.
   * Built-in-Befehle dürfen nicht vom Modell aufgerufen werden (immer false).
   */
  modelInvocable?: boolean;

  // ── Phase 3 reserviert: Experience-Metadaten (Phase 1 nur definiert, nicht verwendet) ──────────────────
  /**
   * Parameter-Hinweis, angezeigt nach dem Befehlsnamen im Completion-Menü.
   * Beispiel: "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Beschreibung, wann das Modell diesen Befehl aufrufen soll.
   * Wird in die description von modelInvocable-Befehlen injiziert.
   */
  whenToUse?: string;

  /**
   * Verwendungsbeispiele für die Help-Dokumentation und Completion-Anzeige.
   */
  examples?: string[];
}
```

---

## 3. Spezifikation zur Feldbefüllung der einzelnen Loader

### 3.1 Befüllungsprinzipien

- `source` und `sourceLabel` werden vom Loader beim Erstellen des `SlashCommand` befüllt, der Befehl selbst deklariert sie nicht
- `commandType`: Loader befüllt Standardwerte; Built-in-Befehle deklarieren ihn in der Befehlsdatei
- `supportedModes`: Wird über `getEffectiveSupportedModes()` inferiert, keine explizite Befüllung nötig (außer zur Überschreibung des Standardwerts)
- `modelInvocable`: Loader befüllt es, Built-in-Befehle sind immer `false`, Prompt-Typ-Befehle sind `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// source/sourceLabel/commandType nicht befüllen — wird von den Befehlsdateien selbst deklariert
// Da der commandType von Built-in-Befehlen local oder local-jsx ist, muss er einzeln annotiert werden

// source und sourceLabel injizieren:
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // Built-in-Befehle dürfen nicht vom Modell aufgerufen werden
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
// In createSlashCommandFromDefinition:
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source wird basierend auf extensionName bestimmt:
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // Plugin-Befehle vorerst nicht für Modell-Aufrufe, User/Projekt-Befehle erlaubt
  action: async (...) => { ... },
};
```

> **Hinweis**: Plugin-Befehle (`plugin-command`) werden vorerst nicht als `modelInvocable` markiert, um Sicherheitsrisiken zu vermeiden. In späteren Phasen kann dies bedarfsgesteuert freigegeben und durch Konfiguration kontrolliert werden.

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
  // ... restliche bestehende Felder
};
```

---

## 4. Deklarationsspezifikation für `commandType` bei Built-in-Befehlen

### 4.1 Klassifizierungskriterien

| commandType | Kriterium                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | `action` verwendet nur `ui.addItem` (Text-Typen), gibt `message` / `stream_messages` / `submit_prompt` / `tool` zurück, keine Abhängigkeit von React-Komponenten-Rendering                                               |
| `local-jsx` | `action` gibt `dialog` zurück, oder `action` ruft `ui.addItem` mit komplexen Typen auf, die JSX enthalten (z. B. `HistoryItemHelp`, `HistoryItemStats`), oder hängt von `confirm_action` / `load_history` / `quit` ab |

> **Hinweis**: `ui.addItem(message/error/info Typen)` ist `local`; `ui.addItem(help/stats/tools/about etc. komplexe UI-Typen)` ist `local-jsx`.

### 4.2 Klassifizierungstabelle für Built-in-Befehle

**`local`-Klasse** (deklariert `commandType: 'local'`, `supportedModes` inferiert zu all modes):

| Befehlsdatei             | Befehlsname     | Beschreibung                                                    |
| -------------------- | ---------- | ------------------------------------------------------- |
| `btwCommand.ts`      | `btw`      | Gibt `submit_prompt` oder `stream_messages` zurück               |
| `bugCommand.ts`      | `bug`      | Gibt `submit_prompt` oder `stream_messages` zurück               |
| `compressCommand.ts` | `compress` | Bereits executionMode-angepasst, gibt `message`/`submit_prompt` zurück |
| `contextCommand.ts`  | `context`  | Gibt `message` zurück (enthält UI-Rendering, aber textersetzbar)                |
| `exportCommand.ts`   | `export`   | Datei-I/O, gibt `message` zurück                                |
| `initCommand.ts`     | `init`     | Gibt `submit_prompt`/`message`/`confirm_action` zurück         |
| `memoryCommand.ts`   | `memory`   | Subcommands geben `message` zurück (Datei-I/O)                        |
| `planCommand.ts`     | `plan`     | Gibt `submit_prompt` zurück                                    |
| `summaryCommand.ts`  | `summary`  | Bereits executionMode-angepasst, gibt `submit_prompt`/`message` zurück |
| `insightCommand.ts`  | `insight`  | Gibt `stream_messages` zurück                                  |

> **Hinweis**: `contextCommand` und `insightCommand` geben zwar aktuell `addItem`-Aufrufe zurück, sind aber inhaltlich Text und gehören daher zu `local`.

**`local-jsx`-Klasse** (deklariert `commandType: 'local-jsx'`, `supportedModes` inferiert zu `['interactive']`):

| Befehlsdatei                  | Befehlsname           | Grund für fehlende Headless-Unterstützung                       |
| ------------------------- | ---------------- | ------------------------------------------ |
| `aboutCommand.ts`         | `about`          | `addItem(HistoryItemAbout)` — komplexe UI-Komponente |
| `agentsCommand.ts`        | `agents`         | `dialog: subagent_create/subagent_list`    |
| `approvalModeCommand.ts`  | `approval-mode`  | `dialog: approval-mode`                    |
| `arenaCommand.ts`         | `arena`          | `dialog: arena_*`                          |
| `authCommand.ts`          | `auth`           | `dialog: auth`                             |
| `clearCommand.ts`         | `clear`          | `ui.clear()` manipuliert Terminal direkt                  |
| `copyCommand.ts`          | `copy`           | Clipboard-Operation, kein Headless-Pfad               |
| `directoryCommand.tsx`    | `directory`      | JSX-Komponente                                   |
| `docsCommand.ts`          | `docs`           | Öffnet Browser                                 |
| `editorCommand.ts`        | `editor`         | `dialog: editor`                           |
| `extensionsCommand.ts`    | `extensions`     | `dialog: extensions_manage`                |
| `helpCommand.ts`          | `help`           | `addItem(HistoryItemHelp)` — komplexe Help-UI  |
| `hooksCommand.ts`         | `hooks`          | `dialog: hooks`                            |
| `ideCommand.ts`           | `ide`            | IDE-Prozess-Erkennung und Interaktion                         |
| `languageCommand.ts`      | `language`       | `dialog` + `reloadCommands`                |
| `mcpCommand.ts`           | `mcp`            | `dialog: mcp`                              |
| `modelCommand.ts`         | `model`          | `dialog: model/fast-model`                 |
| `permissionsCommand.ts`   | `permissions`    | `dialog: permissions`                      |
| `quitCommand.ts`          | `quit`           | `quit` Result-Typ                         |
| `restoreCommand.ts`       | `restore`        | `load_history` Result-Typ                 |
| `resumeCommand.ts`        | `resume`         | `dialog: resume`                           |
| `settingsCommand.ts`      | `settings`       | `dialog: settings`                         |
| `setupGithubCommand.ts`   | `setup-github`   | `confirm_shell_commands` + interaktive Operationen      |
| `skillsCommand.ts`        | `skills`         | `addItem(HistoryItemSkillsList)` — komplexe UI |
| `statsCommand.ts`         | `stats`          | `addItem(HistoryItemStats)` — komplexe UI      |
| `statuslineCommand.ts`    | `statusline`     | UI-Statuskonfiguration                                |
| `terminalSetupCommand.ts` | `terminal-setup` | Terminal-Konfigurationswizard                               |
| `themeCommand.ts`         | `theme`          | `dialog: theme`                            |
| `toolsCommand.ts`         | `tools`          | `addItem(HistoryItemTools)` — komplexe UI      |
| `trustCommand.ts`         | `trust`          | `dialog: trust`                            |
| `vimCommand.ts`           | `vim`            | `toggleVimEnabled()` — UI-Status             |

---

## 5. Inferenzregeln für `getEffectiveSupportedModes`

Diese Funktion ist die Kernlogik von Phase 1, ersetzt die ursprüngliche Whitelist und wird von `filterCommandsForMode` aufgerufen.

```typescript
/**
 * Ermittelt die tatsächlich unterstützten Modi eines Befehls.
 *
 * Inferenzpriorität (von hoch nach niedrig):
 * 1. Explizit deklarierter supportedModes (höchste Priorität)
 * 2. Inferenz basierend auf commandType
 * 3. Fallback basierend auf CommandKind (Abwärtskompatibilität)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Priorität 1: Explizite Deklaration
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Priorität 2: Inferenz basierend auf commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // Prompt-Typ hat keine UI-Abhängigkeiten, standardmäßig in allen Modi verfügbar
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // Local-Typ konservativer Standard: nur interactive.
        // Befehle, die Non-Interactive-Unterstützung benötigen, müssen supportedModes explizit deklarieren (entspricht supportsNonInteractive: true in Claude Code).
        // In Phase 2 einzeln validieren und freischalten, um zu verhindern, dass nicht angepasste Befehle Headless-Aufrufern ungewollt ausgesetzt werden.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Priorität 3: Fallback (basierend auf CommandKind, Abwärtskompatibilität für alten Code)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Built-in-Befehle ohne commandType-Deklaration: konservativer Standard (nur interactive)
      // Dieser Branch sollte nach Abschluss von Phase 1 nicht mehr erreicht werden (alle Built-in-Befehle haben commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // Diese drei Befehlstypen haben action-Implementierungen ohne UI-Abhängigkeiten, historisch in allen Modi verfügbar
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Filtert Befehle basierend auf supportedModes für den aktuellen Modus.
 * Ersetzt die ursprüngliche filterCommandsForNonInteractive-Funktion.
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

## 6. Erweiterung des `CommandService`-Interfaces

Zwei neue Methoden in `packages/cli/src/services/CommandService.ts` hinzufügen:

```typescript
export class CommandService {
  // ── Bestehende Methoden (unverändert)────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Phase 1 neue Methoden ──────────────────────────────────────────────────

  /**
   * Gibt die Liste der im angegebenen Ausführungsmodus verfügbaren Befehle zurück.
   * Ersetzt die Kombination aus Whitelist + filterCommandsForNonInteractive.
   *
   * @param mode Ziel-Ausführungsmodus
   * @returns Liste der für diesen Modus geeigneten Befehle (ohne hidden-Befehle)
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * Gibt alle Befehle zurück, bei denen modelInvocable true ist.
   * SkillTool wird diese Methode in Phase 2 konsumieren; Phase 1 stellt nur das Interface bereit.
   *
   * @returns Liste der vom Modell aufrufbaren Befehle
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Hinweis**: `getEffectiveSupportedModes` und `filterCommandsForMode` sollten als interne Utility-Funktionen von `CommandService` verwendet oder in eine separate Datei `packages/cli/src/services/commandUtils.ts` extrahiert und exportiert werden, um Tests und Wiederverwendung zu ermöglichen.

---

## 7. Refactoring von `nonInteractiveCliCommands.ts`

### 7.1 Zu löschende Inhalte

```typescript
// ❌ Löschen
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ Löschen
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Neue Inhalte

```typescript
// ✅ Neu (oder aus commandUtils importieren)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Änderung der Funktionssignatur von `handleSlashCommand`

```typescript
// ❌ Alte Signatur
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ Neue Signatur (allowedBuiltinCommandNames entfernt)
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Änderungen in der internen Implementierung

```typescript
// Alt:
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// Neu:
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 Änderung der Funktionssignatur von `getAvailableCommands`

```typescript
// ❌ Alte Signatur
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ Neue Signatur
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> Der neue `mode`-Parameter ersetzt den ursprünglichen Whitelist-Parameter. ACP-Sessions können explizit `'acp'` angeben, Non-Interactive-Aufrufe `'non_interactive'`.

---

## 8. Aufrufänderungen in `Session.ts` (ACP)

```typescript
// ❌ Alter Aufruf
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // nicht übergeben, verwendet Standard-Whitelist
);

// ✅ Neuer Aufruf (keine Änderung, entfernter Default-Parameter existiert nicht mehr)
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ Alter Aufruf
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ Neuer Aufruf (Modus explizit angegeben)
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Übersicht der Dateiänderungen

### 9.1 Geänderte Dateien

| Datei                                                                    | Änderung                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | Neue Typen `ExecutionMode`, `CommandSource`, `CommandType`; Erweiterung des `SlashCommand`-Interfaces              |
| `packages/cli/src/services/CommandService.ts`                           | Neue Methoden `getCommandsForMode()`, `getModelInvocableCommands()`                                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Whitelist-Konstanten und alte Filterfunktion entfernt; Signaturen zweier Export-Funktionen aktualisiert; `filterCommandsForMode` eingebunden                 |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Aufrufe von `handleSlashCommand` und `getAvailableCommands` aktualisiert                                         |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | Injektion von `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` beim Befehlsaufbau |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Injektion von `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                  |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Injektion von `source`, `commandType: 'prompt'`, `modelInvocable` (basierend auf extensionName)                   |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Injektion von `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                     |
| **Einzelne Built-in-Befehlsdateien (10x local + 27x local-jsx)**               | Deklaration von `commandType: 'local'` oder `commandType: 'local-jsx'`                                        |

### 9.2 Neue Dateien

| Datei                                        | Inhalt                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | Utility-Funktionen `getEffectiveSupportedModes()`, `filterCommandsForMode()` und deren Export |

### 9.3 Unveränderte Dateien

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` benötigt keine Änderung)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (Interactive-Pfad benötigt keine Änderung)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (Stub-UI benötigt keine Änderung)
- `action`-Implementierungen aller Befehle (Phase 1 ändert kein Befehlsverhalten)

---

## 10. Analyse der Verhaltensauswirkungen

### 10.1 Zusammenfassung der Änderungen

| Szenario                                 | Altes Verhalten                       | Neues Verhalten                                                   | Art        |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- | ----------- |
| Ausführung von `/init` in non-interactive       | ✅ Erlaubt (Whitelist)            | ✅ Erlaubt (`commandType: local`)                          | Keine Änderung      |
| Ausführung von `/summary` in non-interactive    | ✅ Erlaubt                      | ✅ Erlaubt                                                  | Keine Änderung      |
| Ausführung von `/compress` in non-interactive   | ✅ Erlaubt                      | ✅ Erlaubt                                                  | Keine Änderung      |
| Ausführung von `/btw` in non-interactive        | ✅ Erlaubt                      | ✅ Erlaubt                                                  | Keine Änderung      |
| Ausführung von `/bug` in non-interactive        | ✅ Erlaubt                      | ✅ Erlaubt                                                  | Keine Änderung      |
| Ausführung von `/context` in non-interactive    | ✅ Erlaubt                      | ✅ Erlaubt                                                  | Keine Änderung      |
| Ausführung von `/model` in non-interactive      | ❌ unsupported               | ❌ unsupported (`commandType: local-jsx`)               | Keine Änderung      |
| Ausführung von File Commands in non-interactive  | ✅ Erlaubt (CommandKind.FILE)  | ✅ Erlaubt (`commandType: prompt`)                         | Keine Änderung      |
| Ausführung von Bundled Skills in non-interactive | ✅ Erlaubt (CommandKind.SKILL) | ✅ Erlaubt (`commandType: prompt`)                         | Keine Änderung      |
| Ausführung von MCP Prompts in non-interactive    | ❌ Abfang durch CommandKind       | ✅ Erlaubt (`commandType: prompt`)                         | **Bugfix** |
| Ausführung von `/export` in non-interactive     | ❌ Nicht in Whitelist                | ❌ Nicht erlaubt (`commandType: local`, Standard interactive only) | Keine Änderung      |
| Ausführung von `/memory` in non-interactive     | ❌ Nicht in Whitelist                | ❌ Nicht erlaubt (`commandType: local`, Standard interactive only) | Keine Änderung      |
| Ausführung von `/plan` in non-interactive       | ❌ Nicht in Whitelist                | ❌ Nicht erlaubt (`commandType: local`, Standard interactive only) | Keine Änderung      |

> **Zur konservativen Standardstrategie für `local`-Befehle**: Der Standardwert für `supportedModes` bei `commandType: 'local'` ist `['interactive']`. Dies entspricht dem Design von Claude Code – `local`-Befehle müssen explizit `supportsNonInteractive: true` deklarieren, um im Non-Interactive-Modus zu laufen. In Phase 1 ersetzen die 6 Befehle der Whitelist (`init`, `summary`, `compress`, `btw`, `bug`, `context`) den ursprünglichen Whitelist-Effekt durch die explizite Deklaration von `supportedModes: ['interactive', 'non_interactive', 'acp']`. Befehle, die in Phase 2 erweitert werden sollen (z. B. `/export`, `/memory`, `/plan`), werden erst freigeschaltet, nachdem ihre `action`-Implementierung als headless-freundlich validiert wurde.

---

## 10.2 Modus-spezifische Befehle in Phase 2: Dual-Registration-Pattern

Für Befehle in Phase 2, die "UI im Interactive-Modus, Textausgabe im Non-Interactive-Modus" benötigen (z. B. `/model`), sollte das **Dual-Registration-Pattern** verwendet werden, anstatt innerhalb einer einzelnen `action` zu verzweigen.

Dies ist das Standardpattern von Claude Code, am Beispiel `/context` (siehe `src/commands/context/index.ts`): Zwei gleichnamige `Command`-Objekte, eines `local-jsx` nur für interactive, das andere `local` nur für non-interactive, gegenseitig ausgeschlossen über `isEnabled()`.

Qwen Code sollte in Phase 2 einen äquivalenten Ansatz verfolgen, wobei `supportedModes` anstelle von `isEnabled()` die gegenseitige Ausschließung implementiert:

```typescript
// ① Interactive-Version: local-jsx, nur interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // Explizit eingeschränkt
  // action: Öffnet Dialog zur Model-Auswahl
};

// ② Non-Interactive/ACP-Version: local, explizit für Headless-Aufrufe freigegeben
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // Explizit eingeschränkt
  // action: Liest/setzt Model, gibt message zurück (reiner Text)
};
```

Beide Objekte sind gleichnamig, `supportedModes` sind gegenseitig ausschließend, `filterCommandsForMode` wählt automatisch die korrekte Version. Im Vergleich zur `isEnabled()`-Ausschließung von Claude Code ist die `supportedModes`-Filterung expliziter, einfacher zu testen und erfordert keine Runtime-Umgebungserkennung.

**Phase 1 implementiert keine Dual-Registration-Befehle**, dieses Pattern dient hier ausschließlich als Implementierungsspezifikation für Phase 2.

---

## 11. Teststrategie

### 11.1 Tests für neue Utility-Funktionen

In `packages/cli/src/services/commandUtils.test.ts` (neue Datei):

```typescript
describe('getEffectiveSupportedModes', () => {
  it('Explizite supportedModes haben Vorrang vor commandType-Inferenz', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // Explizit eingeschränkt
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local inferiert zu all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx inferiert zu interactive only', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt inferiert zu all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('Fehlende commandType-Deklaration und CommandKind.BUILT_IN, Fallback zu interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('Fehlende commandType-Deklaration und CommandKind.FILE, Fallback zu all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('Fehlende commandType-Deklaration und CommandKind.MCP_PROMPT, Fallback zu all modes (behebt ursprüngliche Einschränkung)', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('Filtert Befehle im non_interactive-Modus korrekt', () => { ... });
  it('Filtert Befehle im acp-Modus korrekt', () => { ... });
  it('Filtert hidden-Befehle nicht (filterCommandsForMode behandelt hidden nicht, CommandService übernimmt dies)', () => { ... });
});
```

### 11.2 Aktualisierung von `nonInteractiveCliCommands.test.ts`

- Alle Referenzen auf `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` entfernen
- Testfälle für den `allowedBuiltinCommandNames`-Parameter entfernen
- Neu: Validieren, dass `commandType: local`-Befehle in non-interactive durch den Filter gehen
- Neu: Validieren, dass `commandType: local-jsx`-Befehle in non-interactive gefiltert werden
- Beibehalten: Validieren, dass File Commands / Skill Commands in non-interactive durch den Filter gehen

### 11.3 Aktualisierung von `CommandService.test.ts`

- Neue Testfälle für `getCommandsForMode` hinzufügen
- Neue Testfälle für `getModelInvocableCommands` hinzufügen

### 11.4 Tests für einzelne Loader

- `BuiltinCommandLoader.test.ts`: Validieren, dass alle Befehle `source: 'builtin-command'` haben
- `BundledSkillLoader.test.ts`: Validieren von `source: 'bundled-skill'` und `modelInvocable: true`
- `FileCommandLoader.test.ts`: Validieren, dass User-Befehle `source: 'skill-dir-command'` und Plugin-Befehle `source: 'plugin-command'` haben
- `McpPromptLoader.test.ts`: Validieren von `source: 'mcp-prompt'` und `modelInvocable: true`

---

## 12. Implementierungsreihenfolge

Empfohlene Reihenfolge, jeder Schritt kann separat committet und reviewed werden:

**Step 1** (~30min): `types.ts` anpassen, `ExecutionMode`, `CommandSource`, `CommandType` und neue `SlashCommand`-Felder hinzufügen
→ Reine Typänderung, TypeScript-Compiler-Check

**Step 2** (~1h): `commandUtils.ts` neu erstellen, `getEffectiveSupportedModes` und `filterCommandsForMode` implementieren, parallel `commandUtils.test.ts` erstellen
→ Unit-Tests decken Kernlogik ab

**Step 3** (~1h): `nonInteractiveCliCommands.ts` refactoren, Whitelist entfernen, `filterCommandsForMode` einbinden, Funktionssignaturen aktualisieren
→ Verhaltensäquivalenz (Phase 1 konservative Strategie: `local`-Befehle deklarieren explizit `supportedModes: ['interactive']`)

**Step 4** (~30min): `CommandService.ts` aktualisieren, zwei neue Methoden hinzufügen

**Step 5** (~2h): `commandType`-Deklarationen für alle Built-in-Befehlsdateien hinzufügen
→ Klassifizierung einzeln auf Korrektheit prüfen

**Step 6** (~1.5h): Alle Loader aktualisieren, `source`, `sourceLabel`, `commandType`, `modelInvocable` injizieren

**Step 7** (~30min): Aufrufsignaturen in `Session.ts` aktualisieren

**Step 8** (~1h): Alle Tests ausführen, fehlgeschlagene Cases beheben, Snapshots aktualisieren

**Step 9** (~30min): CR-Selbstprüfung: Bestätigen, dass Whitelist vollständig entfernt wurde, keine verwaisten Aufrufe

---

## 13. Abnahme-Checkliste

- [ ] TypeScript-Compilation fehlerfrei (`npm run typecheck`)
- [ ] `npm run lint` ohne neue Lint-Fehler
- [ ] Alle bestehenden Tests erfolgreich (`cd packages/cli && npx vitest run`)
- [ ] Neue Tests in `commandUtils.test.ts` alle erfolgreich
- [ ] `getEffectiveSupportedModes` deckt alle 7 Cases ab
- [ ] `filterCommandsForMode` deckt interactive / non_interactive / acp Modi ab
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` hat keine Referenzen mehr im gesamten Codebase (`grep`-Validierung)
- [ ] `filterCommandsForNonInteractive`-Funktion hat keine Referenzen mehr im gesamten Codebase
- [ ] Alle Built-in-Befehle besitzen `commandType`-Feld
- [ ] Alle Loader-Ausgaben besitzen `source`- und `sourceLabel`-Felder
- [ ] `BundledSkillLoader` / `FileCommandLoader` (User-Befehle) / `McpPromptLoader`-Ausgaben haben `modelInvocable: true`
- [ ] `BuiltinCommandLoader`-Ausgaben haben `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` gibt äquivalente Befehlsmenge wie vor dem Refactoring zurück
- [ ] MCP-Prompt-Befehle werden im non-interactive-Modus nicht mehr fälschlich abgefangen