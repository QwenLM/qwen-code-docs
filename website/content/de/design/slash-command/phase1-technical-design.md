# Phase 1 Technisches Design-Dokument: Infrastruktur-Neubau

## 1. Designziele & Randbedingungen

### 1.1 Ziele

- Einheitliches Metadatenmodell für Befehle etablieren, das die vier Dimensionen Quelle (`source`), Ausführungstyp (`commandType`), Modusfähigkeit (`supportedModes`) und Sichtbarkeit (`userInvocable` / `modelInvocable`) abdeckt
- Capability-basiertes Filtern ersetzt die hartcodierte Whitelist in `non-interactive` / `acp`
- Stabile, zugrunde liegende Schnittstellen für Phase 2/3-Funktionserweiterungen bereitstellen

### 1.2 Harte Randbedingungen

- **Null Verhaltensänderung**: Der verfügbare Befehlssatz in den Modi `non-interactive` und `acp` bleibt unverändert (Ausnahme: Fehlerbehebung, dass `MCP_PROMPT` fälschlicherweise blockiert wurde – Bugfix)
- **Rückwärtskompatibilität**: Alle neuen Felder im `SlashCommand`-Interface sind optional oder haben sinnvolle Standardwerte; vorhandener Befehlscode muss nicht sofort geändert werden
- **Keine neuen Executors**: Es werden keine neuen Ausführungsarchitekturen wie `ModeAdapter` / `CommandExecutor` erstellt; nur bestehende `CommandService`- und Filterlogik erweitert
- **Keine Änderung bestehender Befehlsfunktionen**: Für keinen Befehl werden neue `local`-Unterbefehle hinzugefügt; keine `action`-Implementierung eines Befehls wird geändert

---

## 2. Neue Typdefinitionen

### 2.1 Dateiposition

Alle neuen Typdefinitionen befinden sich in `packages/cli/src/ui/commands/types.ts`, gemeinsam mit dem bestehenden `SlashCommand`-Interface.

### 2.2 `ExecutionMode`

```typescript
/**
 * Aufzählung der Ausführungsmodi.
 * - interactive: React/Ink UI-Modus (Terminal-Interaktion)
 * - non_interactive: Nicht-interaktiver CLI-Modus (Text/JSON-Ausgabe)
 * - acp: ACP/Zed-Integrationsmodus
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Aufzählung der Befehlsquellen, für Hilfe-Gruppierung, Autovervollständigungs-Badge, ACP available commands.
 *
 * Unterschied zu CommandKind:
 * - CommandKind ist eine interne Lader-Klassifizierung (4 Arten), beeinflusst die Ladelogik
 * - CommandSource ist eine benutzerorientierte Quellenklassifizierung (9 Arten), beeinflusst Darstellung und mentales Modell
 *
 * Beide können sich überschneiden, haben aber unterschiedliche Aufgaben und werden nicht zusammengeführt.
 */
export type CommandSource =
  | 'builtin-command' // Integrierter Befehl (BuiltinCommandLoader)
  | 'bundled-skill'   // Mitgeliefertes Skill (BundledSkillLoader)
  | 'skill-dir-command' // Benutzer-/Projekt-Befehl unter .qwen/commands/ (FileCommandLoader, kein Plugin)
  | 'plugin-command'  // Von einem Plugin bereitgestellter Befehl (FileCommandLoader, extensionName nicht leer)
  | 'mcp-prompt';     // Von einem MCP-Server bereitgestellter Prompt (McpPromptLoader)
// Folgende Quellen sind reserviert, werden in Phase 1 nicht implementiert, aber das Schema ist vorab definiert:
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
 * - prompt: Erzeugt submit_prompt, reicht den Inhalt an das Modell weiter. Geeignet für Skills, File-Commands, MCP-Prompts.
 *   Standardmäßig sind alle Modi unterstützt, standardmäßig ist modelInvocable true.
 *
 * - local: Führt Logik lokal aus, ohne Abhängigkeit von React/Ink UI. Kann message, stream_messages,
 *   submit_prompt, tool usw. zurückgeben. Geeignet für integrierte Befehle zum Abfragen, Konfigurieren, Status.
 *   Standardmäßig ist supportedModes ['interactive']; für nicht-interaktive Unterstützung muss supportedModes explizit deklariert werden.
 *   Dies entspricht der Semantik von Claude Codes supportsNonInteractive: true – nicht-interaktive Unterstützung erfordert explizite Deklaration, keine automatische Ableitung.
 *
 * - local-jsx: Abhängig von React/Ink UI (Dialog öffnen, JSX-Komponenten rendern usw.)
 *   Standardmäßig ist supportedModes nur ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Erweiterung des `SlashCommand`-Interfaces

Neue Felder werden an das bestehende Interface angehängt, **alle optional** für Rückwärtskompatibilität:

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

  // ── Phase 1 Neu: Quelle und Ausführungstyp ──────────────────────────────────────
  /**
   * Befehlsquelle, für Hilfe-Gruppierung, Autovervollständigungs-Badge, ACP available commands.
   * Wird von jedem Loader gesetzt, nicht vom Befehl selbst.
   * Wenn CommandKind in Zukunft entfernt wird, wird source der einzige Quellenbezeichner sein.
   */
  source?: CommandSource;

  /**
   * Anzeigelabel der Quelle, benutzerorientiert.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Wird von jedem Loader gesetzt, kann vom Befehl selbst überschrieben werden.
   */
  sourceLabel?: string;

  /**
   * Befehlsausführungstyp.
   * - Von Loadern werden Standardwerte gesetzt (prompt/local-jsx)
   * - Integrierte Befehle werden von der jeweiligen Befehlsdatei selbst deklariert (local oder local-jsx)
   * Standardstrategie bei fehlender Deklaration siehe getEffectiveCommandType().
   */
  commandType?: CommandType;

  // ── Phase 1 Neu: Modusfähigkeit ──────────────────────────────────────────
  /**
   * In welchen Ausführungsmodi dieser Befehl verfügbar ist.
   * Bei fehlender Deklaration wird basierend auf commandType ein Standardwert abgeleitet (siehe getEffectiveSupportedModes()).
   * Explizite Deklaration hat Vorrang vor abgeleitetem Wert.
   */
  supportedModes?: ExecutionMode[];

  // ── Phase 1 Neu: Sichtbarkeit ──────────────────────────────────────────────
  /**
   * Kann der Benutzer diesen Befehl über den Slash-Command aufrufen?
   * Standard true (fast alle Befehle sind userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Kann das Modell diesen Befehl per Tool-Call aufrufen?
   * Standard false. Befehle vom Typ prompt (Skills, File-Commands, MCP-Prompts) sollten true sein.
   * Integrierte Befehle erlauben keinen Modellaufruf (immer false).
   */
  modelInvocable?: boolean;

  // ── Phase 3 reserviert: Erlebnis-Metadaten (Phase 1 nur Definition, keine Verwendung) ──────────────────
  /**
   * Parameterhinweis, angezeigt im Autovervollständigungsmenü nach dem Befehlsnamen.
   * Beispiel: "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Erklärung für das Modell, wann dieser Befehl aufgerufen werden sollte.
   * Wird in die Beschreibung von modelInvocable-Befehlen eingefügt.
   */
  whenToUse?: string;

  /**
   * Nutzungsbeispiele, für Hilfe-Inhalte und Autovervollständigung.
   */
  examples?: string[];
}
```

---

## 3. Feldbefüllungsrichtlinien für jeden Loader

### 3.1 Befüllungsprinzipien

- `source` und `sourceLabel` werden vom Loader beim Erstellen des `SlashCommand` gesetzt, nicht vom Befehl selbst
- `commandType`: Loader setzen Standardwerte; integrierte Befehle werden von der Befehlsdatei selbst deklariert
- `supportedModes`: Wird durch `getEffectiveSupportedModes()` abgeleitet, keine explizite Befüllung nötig (außer zum Überschreiben des Standardwerts)
- `modelInvocable`: Loader setzt; integrierte Befehle sind immer `false`, Prompt-Typ-Befehle sind `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// Setzt source/sourceLabel/commandType nicht – wird von jeder Befehlsdatei selbst deklariert
// Da integrierte Befehle vom Typ local oder local-jsx sind, müssen sie einzeln gekennzeichnet werden

// Injiziert source und sourceLabel:
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // Integrierte Befehle erlauben keinen Modellaufruf
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
  // source hängt von extensionName ab:
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // Plugin-Befehle vorerst kein Modellaufruf; Benutzer-/Projektbefehle erlauben
  action: async (...) => { ... },
};
```

> **Hinweis**: Plugin-Befehle (`plugin-command`) werden vorerst nicht als `modelInvocable` markiert, um Sicherheitsrisiken zu vermeiden. In späteren Phasen kann dies bei Bedarf freigegeben werden, durch Benutzerkonfiguration gesteuert.

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

## 4. `commandType`-Deklarationsrichtlinie für integrierte Befehle

### 4.1 Klassifizierungskriterien

| commandType | Kriterium                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | `action` verwendet nur `ui.addItem` (Texttyp), gibt `message` / `stream_messages` / `submit_prompt` / `tool` zurück, keine Abhängigkeit von React-Komponenten-Rendering                  |
| `local-jsx` | `action` gibt `dialog` zurück, oder `action` ruft `ui.addItem` mit komplexen JSX-Typen auf (z. B. `HistoryItemHelp`, `HistoryItemStats`), oder hängt von `confirm_action` / `load_history` / `quit` ab |

> **Hinweis**: `ui.addItem(message/error/info-Typ)` ist `local`; `ui.addItem(help/stats/tools/about usw. komplexe UI-Typen)` ist `local-jsx`.

### 4.2 Klassifizierungstabelle integrierter Befehle

**`local`-Klasse** (Deklaration `commandType: 'local'`, `supportedModes` abgeleitet als alle Modi):

| Befehlsdatei            | Befehl      | Beschreibung                                                |
| ----------------------- | ----------- | ----------------------------------------------------------- |
| `btwCommand.ts`         | `btw`       | Gibt `submit_prompt` oder `stream_messages` zurück          |
| `bugCommand.ts`         | `bug`       | Gibt `submit_prompt` oder `stream_messages` zurück          |
| `compressCommand.ts`    | `compress`  | Hat bereits executionMode-Adaption, gibt `message`/`submit_prompt` zurück |
| `contextCommand.ts`     | `context`   | Gibt `message` zurück (enthält UI-Rendering, aber Text-Ersatz möglich) |
| `exportCommand.ts`      | `export`    | Datei-I/O, gibt `message` zurück                            |
| `initCommand.ts`        | `init`      | Gibt `submit_prompt`/`message`/`confirm_action` zurück      |
| `memoryCommand.ts`      | `memory`    | Unterbefehle geben `message` zurück (Datei-I/O)             |
| `planCommand.ts`        | `plan`      | Gibt `submit_prompt` zurück                                 |
| `summaryCommand.ts`     | `summary`   | Hat bereits executionMode-Adaption, gibt `submit_prompt`/`message` zurück |
| `insightCommand.ts`     | `insight`   | Gibt `stream_messages` zurück                               |

> **Hinweis**: `contextCommand` und `insightCommand` geben zwar aktuell `addItem`-Aufrufe zurück, aber ihr Inhalt ist textuell, gehören zu `local`.

**`local-jsx`-Klasse** (Deklaration `commandType: 'local-jsx'`, `supportedModes` abgeleitet als `['interactive']`):

| Befehlsdatei                 | Befehl           | Grund, warum nicht headless möglich                       |
| ---------------------------- | ---------------- | --------------------------------------------------------- |
| `aboutCommand.ts`            | `about`          | `addItem(HistoryItemAbout)` – Komplexe UI-Komponente      |
| `agentsCommand.ts`           | `agents`         | `dialog: subagent_create/subagent_list`                   |
| `approvalModeCommand.ts`     | `approval-mode`  | `dialog: approval-mode`                                   |
| `arenaCommand.ts`            | `arena`          | `dialog: arena_*`                                         |
| `authCommand.ts`             | `auth`           | `dialog: auth`                                            |
| `clearCommand.ts`            | `clear`          | `ui.clear()` – Direkter Terminalzugriff                   |
| `copyCommand.ts`             | `copy`           | Zwischenablage-Operation, kein headless-Pfad               |
| `directoryCommand.tsx`       | `directory`      | JSX-Komponente                                            |
| `docsCommand.ts`             | `docs`           | Öffnet Browser                                            |
| `editorCommand.ts`           | `editor`         | `dialog: editor`                                          |
| `extensionsCommand.ts`       | `extensions`     | `dialog: extensions_manage`                               |
| `helpCommand.ts`             | `help`           | `addItem(HistoryItemHelp)` – Komplexe Hilfe-UI            |
| `hooksCommand.ts`            | `hooks`          | `dialog: hooks`                                           |
| `ideCommand.ts`              | `ide`            | IDE-Prozesserfassung und -Interaktion                     |
| `languageCommand.ts`         | `language`       | `dialog` + `reloadCommands`                               |
| `mcpCommand.ts`              | `mcp`            | `dialog: mcp`                                             |
| `modelCommand.ts`            | `model`          | `dialog: model/fast-model`                                |
| `permissionsCommand.ts`      | `permissions`    | `dialog: permissions`                                     |
| `quitCommand.ts`             | `quit`           | Ergebnis-Typ `quit`                                       |
| `restoreCommand.ts`          | `restore`        | Ergebnis-Typ `load_history`                               |
| `resumeCommand.ts`           | `resume`         | `dialog: resume`                                          |
| `settingsCommand.ts`         | `settings`       | `dialog: settings`                                        |
| `setupGithubCommand.ts`      | `setup-github`   | `confirm_shell_commands` + interaktive Operationen        |
| `skillsCommand.ts`           | `skills`         | `addItem(HistoryItemSkillsList)` – Komplexe UI            |
| `statsCommand.ts`            | `stats`          | `addItem(HistoryItemStats)` – Komplexe UI                 |
| `statuslineCommand.ts`       | `statusline`     | UI-Statuskonfiguration                                    |
| `terminalSetupCommand.ts`    | `terminal-setup` | Terminal-Einrichtungsassistent                            |
| `themeCommand.ts`            | `theme`          | `dialog: theme`                                           |
| `toolsCommand.ts`            | `tools`          | `addItem(HistoryItemTools)` – Komplexe UI                 |
| `trustCommand.ts`            | `trust`          | `dialog: trust`                                           |
| `vimCommand.ts`              | `vim`            | `toggleVimEnabled()` – UI-Status                          |

---

## 5. `getEffectiveSupportedModes`-Ableitungsregeln

Diese Funktion ist die Kernlogik von Phase 1, ersetzt die bisherige Whitelist und wird von `filterCommandsForMode` aufgerufen.

```typescript
/**
 * Ermittelt die tatsächliche Liste der unterstützten Modi für einen Befehl.
 *
 * Ableitungspriorität (höchste zu niedrigster):
 * 1. Explizit deklariertes supportedModes des Befehls (höchste Priorität)
 * 2. Ableitung basierend auf commandType
 * 3. Fallback basierend auf CommandKind (Rückwärtskompatibilität)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Priorität 1: Explizite Deklaration
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Priorität 2: Ableitung basierend auf commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // prompt-Typ hat keine UI-Abhängigkeit, von Haus aus in allen Modi verfügbar
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // local-Typ konservativer Standard: nur interactive.
        // Befehle, die nicht-interaktive Unterstützung benötigen, müssen supportedModes explizit deklarieren
        // (entspricht Claude Codes supportsNonInteractive: true).
        // In Phase 2 werden sie einzeln validiert und freigeschaltet, um zu vermeiden, dass unangepasste
        // Befehle versehentlich headless-Aufrufern ausgesetzt werden.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Priorität 3: Fallback (basierend auf CommandKind, für Rückwärtskompatibilität mit altem Code)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Integrierte Befehle ohne commandType-Deklaration: konservativer Standard (nur interactive)
      // Dieser Zweig sollte nach Abschluss von Phase 1 nicht mehr erreicht werden
      // (alle integrierten Befehle haben dann commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // Diese drei Befehlstypen haben von Natur aus keine UI-Abhängigkeit;
      // historisch auch in allen Modi verfügbar
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Filtert Befehle basierend auf supportedModes für den aktuellen Modus.
 * Ersetzt die bisherige filterCommandsForNonInteractive-Funktion.
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

Zwei neue Methoden in `packages/cli/src/services/CommandService.ts`:

```typescript
export class CommandService {
  // ── Bestehende Methode (unverändert) ────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Phase 1 Neue Methoden ──────────────────────────────────────────────────

  /**
   * Gibt die Liste der im angegebenen Ausführungsmodus verfügbaren Befehle zurück.
   * Ersetzt die Kombination aus bisheriger Whitelist + filterCommandsForNonInteractive.
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
   * In Phase 2 wird SkillTool diese Methode konsumieren; Phase 1 stellt nur die Schnittstelle bereit.
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

> **Hinweis**: `getEffectiveSupportedModes` und `filterCommandsForMode` sollten als interne Hilfsfunktionen des `CommandService` oder in eine separate Datei `packages/cli/src/services/commandUtils.ts` ausgelagert und exportiert werden, um Tests und Wiederverwendung zu erleichtern.

---

## 7. Refaktorisierung von `nonInteractiveCliCommands.ts`

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
// ✅ Neu (oder Import aus commandUtils)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Änderung der Signatur von `handleSlashCommand`

```typescript
// ❌ Alte Signatur
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ Neue Signatur (Entfernung von allowedBuiltinCommandNames)
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Interne Implementierungsänderungen

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

### 7.5 Änderung der Signatur von `getAvailableCommands`

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

> Neuer `mode`-Parameter ersetzt den bisherigen Whitelist-Parameter. ACP-Session-Aufrufe können explizit `'acp'` angeben, non-interactive-Aufrufe `'non_interactive'`.

---

## 8. Aufrufänderungen in `Session.ts` (ACP)

```typescript
// ❌ Alter Aufruf
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // Nicht übergeben – Standard-Whitelist wird verwendet
);

// ✅ Neuer Aufruf (keine Änderung – nicht mehr vorhandener Standardparameter entfällt)
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

// ✅ Neuer Aufruf (expliziter mode)
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Dateiänderungen – Übersicht

### 9.1 Geänderte Dateien

| Datei                                                                   | Änderungsinhalt                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | Neue Typen `ExecutionMode`, `CommandSource`, `CommandType`; Erweiterung des `SlashCommand`-Interfaces |
| `packages/cli/src/services/CommandService.ts`                           | Neue Methoden `getCommandsForMode()`, `getModelInvocableCommands()`                              |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Löschung der Whitelist-Konstanten und alten Filterfunktion; Aktualisierung der Signaturen zweier Exportfunktionen; Einbindung von `filterCommandsForMode` |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Aktualisierte Aufrufe von `handleSlashCommand` und `getAvailableCommands`                       |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | Injiziert `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` beim Befehlsbau |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Injiziert `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`            |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Injiziert `source`, `commandType: 'prompt'`, `modelInvocable` (abhängig von extensionName)      |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Injiziert `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`               |
| **Jede integrierte Befehlsdatei (10 local + 27 local-jsx)**             | Deklaration von `commandType: 'local'` oder `commandType: 'local-jsx'`                          |

### 9.2 Neue Dateien

| Datei                                       | Inhalt                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | `getEffectiveSupportedModes()`, `filterCommandsForMode()` und deren Export|

### 9.3 Unveränderte Dateien

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` muss nicht geändert werden)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (interaktiver Pfad muss nicht geändert werden)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (Stub-UI muss nicht geändert werden)
- Alle `action`-Implementierungen der Befehle (Phase 1 ändert kein Befehlsverhalten)

---

## 10. Auswirkungsanalyse des Verhaltens

### 10.1 Zusammenfassung der Änderungen

| Szenario                               | Altes Verhalten                    | Neues Verhalten                                        | Art        |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ---------- |
| `/init` im non-interactive Modus       | ✅ Erlaubt (Whitelist)             | ✅ Erlaubt (`commandType: local`)                      | Keine Änderung |
| `/summary` im non-interactive Modus    | ✅ Erlaubt                         | ✅ Erlaubt                                             | Keine Änderung |
| `/compress` im non-interactive Modus   | ✅ Erlaubt                         | ✅ Erlaubt                                             | Keine Änderung |
| `/btw` im non-interactive Modus        | ✅ Erlaubt                         | ✅ Erlaubt                                             | Keine Änderung |
| `/bug` im non-interactive Modus        | ✅ Erlaubt                         | ✅ Erlaubt                                             | Keine Änderung |
| `/context` im non-interactive Modus    | ✅ Erlaubt                         | ✅ Erlaubt                                             | Keine Änderung |
| `/model` im non-interactive Modus      | ❌ Nicht unterstützt               | ❌ Nicht unterstützt (`commandType: local-jsx`)        | Keine Änderung |
| File-Command im non-interactive Modus  | ✅ Erlaubt (CommandKind.FILE)      | ✅ Erlaubt (`commandType: prompt`)                     | Keine Änderung |
| Bundled Skill im non-interactive Modus | ✅ Erlaubt (CommandKind.SKILL)     | ✅ Erlaubt (`commandType: prompt`)                     | Keine Änderung |
| MCP-Prompt im non-interactive Modus    | ❌ Von CommandKind blockiert       | ✅ Erlaubt (`commandType: prompt`)                     | **Bugfix** |
| `/export` im non-interactive Modus     | ❌ Nicht in Whitelist              | ❌ Nicht erlaubt (`commandType: local`, Standard nur interactive) | Keine Änderung |
| `/memory` im non-interactive Modus     | ❌ Nicht in Whitelist              | ❌ Nicht erlaubt (`commandType: local`, Standard nur interactive) | Keine Änderung |
| `/plan` im non-interactive Modus       | ❌ Nicht in Whitelist              | ❌ Nicht erlaubt (`commandType: local`, Standard nur interactive) | Keine Änderung |
> **Konservative Standardstrategie für den Befehl `local`**: Der Standardwert von `supportedModes` für `commandType: 'local'` ist `['interactive']`, was mit dem Design von Claude Code übereinstimmt – Befehle vom Typ `local` müssen explizit `supportsNonInteractive: true` deklarieren, um im nicht-interaktiven Modus ausgeführt zu werden. Die 6 Befehle auf der Whitelist in Phase 1 (`init`, `summary`, `compress`, `btw`, `bug`, `context`) ersetzen die ursprüngliche Whitelist-Wirkung äquivalent durch explizite Deklaration von `supportedModes: ['interactive', 'non_interactive', 'acp']`. Befehle, die in Phase 2 erweitert werden müssen (wie `/export`, `/memory`, `/plan`), werden nach der Überprüfung, dass die Action headless-friendly implementiert ist, einzeln freigeschaltet.

---

## 10.2 Befehle mit Modusunterschieden in Phase 2: Dual-Registrierungsmuster

Für Befehle in Phase 2, die im interaktiven Modus eine UI und im nicht-interaktiven Modus eine Textausgabe benötigen (wie `/model`), sollte das **Dual-Registrierungsmuster** verwendet werden, anstatt innerhalb der `action` eines einzelnen Befehls zu verzweigen.

Dies ist das Standardmuster von Claude Code, am Beispiel von `/context` (siehe `src/commands/context/index.ts`): Zwei gleichnamige `Command`-Objekte, eines vom Typ `local-jsx` nur für interaktiv, das andere vom Typ `local` nur für nicht-interaktiv, die sich über `isEnabled()` gegenseitig ausschließen.

Qwen Code sollte in Phase 2 einen äquivalenten Ansatz verwenden und die gegenseitige Exklusivität mit `supportedModes` anstelle von `isEnabled()` umsetzen:

```typescript
// ① 交互模式版：local-jsx，仅 interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // 显式限定
  // action: 打开 dialog 选择 model
};

// ② 非交互/acp 版：local，显式开放给 headless 调用者
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // 显式限定
  // action: 读取/设置 model，返回 message（纯文本）
};
```

Die beiden Objekte haben denselben Namen, `supportedModes` sind sich gegenseitig ausschließend, und `filterCommandsForMode` wählt automatisch die richtige Version aus. Im Vergleich zur gegenseitigen Exklusivität mit `isEnabled()` bei Claude Code ist die Filterung mit `supportedModes` expliziter, testbarer und benötigt keine Laufzeitumgebungsprüfung.

**Phase 1 implementiert keine Dual-Registrierungsbefehle**; dieses Muster ist nur als Implementierungsspezifikation für Phase 2 hier reserviert.

---

## 11. Teststrategie

### 11.1 Tests für neue Hilfsfunktionen

In `packages/cli/src/services/commandUtils.test.ts` (neue Datei):

```typescript
describe('getEffectiveSupportedModes', () => {
  it('显式 supportedModes 优先于 commandType 推断', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // 显式限制
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local 推断为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx 推断为 interactive only', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt 推断为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('未声明 commandType 且 CommandKind.BUILT_IN，兜底为 interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('未声明 commandType 且 CommandKind.FILE，兜底为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('未声明 commandType 且 CommandKind.MCP_PROMPT，兜底为 all modes（修复原有限制）', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('正确过滤 non_interactive 模式下的命令', () => { ... });
  it('正确过滤 acp 模式下的命令', () => { ... });
  it('不过滤 hidden 命令（filterCommandsForMode 不处理 hidden，CommandService 处理）', () => { ... });
});
```

### 11.2 Aktualisierung von `nonInteractiveCliCommands.test.ts`

- Entfernen aller Verweise auf `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Entfernen von Testfällen für den Parameter `allowedBuiltinCommandNames`
- Neu: Überprüfen, dass Befehle mit `commandType: local` im non-interactive Modus durch den Filter gelangen
- Neu: Überprüfen, dass Befehle mit `commandType: local-jsx` im non-interactive Modus herausgefiltert werden
- Beibehalten: Überprüfen, dass file-Commands / skill-Commands im non-interactive Modus durch den Filter gelangen

### 11.3 Aktualisierung von `CommandService.test.ts`

- Neue Testfälle für `getCommandsForMode`
- Neue Testfälle für `getModelInvocableCommands`

### 11.4 Tests der einzelnen Loader

- `BuiltinCommandLoader.test.ts`: Überprüfen, dass alle Befehle `source: 'builtin-command'` haben
- `BundledSkillLoader.test.ts`: Überprüfen von `source: 'bundled-skill'` und `modelInvocable: true`
- `FileCommandLoader.test.ts`: Überprüfen, dass Benutzerbefehle `source: 'skill-dir-command'` haben und Plugin-Befehle `source: 'plugin-command'`
- `McpPromptLoader.test.ts`: Überprüfen von `source: 'mcp-prompt'` und `modelInvocable: true`

---

## 12. Implementierungsreihenfolge

Es wird empfohlen, in der folgenden Reihenfolge zu implementieren, jeder Schritt kann unabhängig committet und reviewed werden:

**Step 1** (~30min): Ändern von `types.ts`, Hinzufügen der neuen Felder `ExecutionMode`, `CommandSource`, `CommandType` und `SlashCommand`
→ Reine Typänderung, TypeScript-Compile-Prüfung

**Step 2** (~1h): Neuanlegen von `commandUtils.ts`, Implementieren von `getEffectiveSupportedModes` und `filterCommandsForMode`, gleichzeitiges Neuanlegen von `commandUtils.test.ts`
→ Unit-Tests decken die Kernlogik ab

**Step 3** (~1h): Refactoring von `nonInteractiveCliCommands.ts`, Entfernen der Whitelist, Einführen von `filterCommandsForMode`, Aktualisieren der Funktionssignatur
→ Verhaltensäquivalenz (Phase 1 Konservative Strategie: local-Befehle schreiben explizit `supportedModes: ['interactive']`)

**Step 4** (~30min): Aktualisieren von `CommandService.ts`, Hinzufügen der beiden neuen Methoden

**Step 5** (~2h): Hinzufügen der `commandType`-Deklaration zu allen Built-in-Befehlsdateien
→ Einzeln die korrekte Klassifizierung bestätigen

**Step 6** (~1.5h): Aktualisieren aller Loader, Einfügen von `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Step 7** (~30min): Aktualisieren der Aufrufsignatur in `Session.ts`

**Step 8** (~1h): Ausführen aller Tests, Beheben fehlgeschlagener Fälle, Aktualisieren von Snapshots

**Step 9** (~30min): Selbst-CR: Überprüfen, dass die Whitelist vollständig entfernt wurde, keine ausgelassenen Aufrufe vorhanden sind

---

## 13. Abnahme-Checkliste

- [ ] TypeScript-Kompilierung ohne Fehler (`npm run typecheck`)
- [ ] `npm run lint` ohne neue Lint-Fehler
- [ ] Alle vorhandenen Tests bestehen (`cd packages/cli && npx vitest run`)
- [ ] Neue Tests in `commandUtils.test.ts` bestehen alle
- [ ] `getEffectiveSupportedModes` deckt alle 7 Fälle ab
- [ ] `filterCommandsForMode` deckt die drei Modi interactive / non_interactive / acp ab
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` wird im gesamten Codebase nicht referenziert (Überprüfung mit `grep`)
- [ ] Die Funktion `filterCommandsForNonInteractive` wird im gesamten Codebase nicht referenziert
- [ ] Alle built-in Befehle haben das Feld `commandType`
- [ ] Alle von Loadern ausgegebenen Befehle haben die Felder `source` und `sourceLabel`
- [ ] Befehle, die von `BundledSkillLoader` / `FileCommandLoader` (Benutzerbefehle) / `McpPromptLoader` ausgegeben werden, haben `modelInvocable: true`
- [ ] Befehle, die von `BuiltinCommandLoader` ausgegeben werden, haben `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` gibt eine zur vor dem Refactoring äquivalente Befehlsmenge zurück
- [ ] MCP-prompt-Befehle werden im non-interactive Modus nicht mehr fälschlicherweise blockiert