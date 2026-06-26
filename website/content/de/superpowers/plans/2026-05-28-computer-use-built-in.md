# Computer Use Built-In Implementierungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE SUB-SKILL: Nutze Superkräfte:subagent-driven-development (empfohlen) oder Superkräfte:executing-plans, um diesen Plan Aufgabe für Aufgabe zu implementieren. Schritte verwenden die Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Mache `open-computer-use` zu einer Zero-Config integrierten Fähigkeit in qwen-code. 9 Computer-Use-Tools erscheinen in der zurückgestellten Tool-Liste als `computer_use__click`, `computer_use__type_text` usw. Der erste Aufruf installiert transparent das upstream npm-Binary, führt den Benutzer durch die macOS-Eingabehilfe / Bildschirmaufzeichnungsberechtigungen, falls erforderlich, und leitet den Aufruf an den upstream MCP-Server weiter.

**Architektur:** Dünne Shell über upstream `npx -y open-computer-use mcp`. Wir bündeln das Binary NICHT; der `npx`-Cache von upstream + das `.app`-Bundle übernehmen die Verteilung und macOS TCC. 9 Tools werden als parametrisierte `ComputerUseTool`-Instanzen (eines pro Tool-Name) registriert, die von einem Singleton `ComputerUseClient` unterstützt werden, der einen langlebigen MCP-Child-Prozess über stdio besitzt. Die Bootstrap-Zustandsmaschine wird darübergelegt: Standard qwen-code-Tool-Berechtigung (bestehend) → Erstinstallationsbestätigung → optionale macOS-Berechtigungsanleitung.

**Tech-Stack:** TypeScript, vitest, `@modelcontextprotocol/sdk` (bereits eine Abhängigkeit von qwen-code), `node:child_process`, `node:fs/promises`.

---

## Dateistruktur

**Neue Dateien:**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config); barrel export
  schemas.ts                        # 9 hartcodierte Schemas + Beschreibungen (mit upstream synchronisiert)
  tool.ts                           # ComputerUseTool — parametrisierte BaseDeclarativeTool
  client.ts                         # ComputerUseClient — Singleton MCP-Process-Manager über stdio
  bootstrap.ts                      # Zustandsmaschine: Prüfen → Installationsbestätigung → Installieren → Berechtigungsanleitung
  install-state.ts                  # ~/.qwen/computer-use/installed.json lesen/schreiben
  permission-detector.ts            # Fehlermeldungen von upstream parsen, um fehlende Berechtigungen zu erkennen
  schemas.test.ts                   # Alle 9 Schemas parsen, Namen erfüllen Vertrag
  tool.test.ts                      # Parametrisierte Tool-Verdrahtung
  client.test.ts                    # Client-Lebenszyklus (gemocktes spawn)
  bootstrap.test.ts                 # Zustandsmaschinen-Übergänge
  install-state.test.ts             # Zustandsdatei Roundtrip
  permission-detector.test.ts       # Fehlermuster-Abgleich
scripts/
  sync-computer-use-schemas.ts      # Skript zur Release-Zeit: Dump upstream tools/list → schemas.ts
```

**Modifizierte Dateien:**

```
packages/core/src/tools/tool-names.ts                  # 9 COMPUTER_USE_* Konstanten hinzufügen
packages/core/src/config/config.ts                     # computerUseEnabled-Feld + isComputerUseEnabled() + register-Aufruf in createToolRegistry()
packages/cli/src/config/config.ts                      # Mapping settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled
packages/cli/src/config/settingsSchema.ts              # tools.computerUse.enabled boolean hinzufügen (Standardwert true)
```

**Zerlegungsbegründung:** Jede Datei hat eine Verantwortung. `client.ts` kennt das MCP-Protokoll, aber nicht die UX; `bootstrap.ts` kennt die UX, berührt aber keine MCP-Details; `tool.ts` ist reine Verdrahtung, die sie über `execute()` verbindet. Tests liegen neben dem Code. Schemas sind isoliert, damit das Sync-Skript die Datei neu schreiben kann, ohne die Logik zu ändern.

---

## Phase 1 — Grundlage (Tool-Oberfläche sichtbar, keine Ausführung)

### Aufgabe 1: ToolNames + ToolDisplayNames-Einträge für 9 Computer-Use-Tools hinzufügen

**Dateien:**

- Modifizieren: `packages/core/src/tools/tool-names.ts`

- [ ] **Schritt 1: Die 9 Namenskonstanten hinzufügen**

Bearbeite `packages/core/src/tools/tool-names.ts` — innerhalb des `ToolNames`-Objekts, nach `EXIT_WORKTREE: 'exit_worktree',`:

```ts
  // Computer Use tools — built-in but backed by an upstream MCP server.
  // All deferred; revealed only when the user-initiated request triggers
  // a computer-use action. See packages/core/src/tools/computer-use/.
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

Spiegelung in `ToolDisplayNames`:

```ts
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

(displayName == name absichtlich; wir wollen keine großgeschriebenen Anzeigenamen wie `Click` im Berechtigungsdialog, wenn der Tool-Name `computer_use__click` ist.)

- [ ] **Schritt 2: Überprüfen, dass der bestehende Test für tool-names weiterhin bestanden wird**

Ausführen: `npm test -- packages/core/src/tools/tool-names`
Erwartet: BESTANDEN (falls es keine Testdatei gibt, führe `npm run build -- --filter @qwen-code/qwen-code-core` aus, um den Typcheck durchzuführen)

- [ ] **Schritt 3: Commit**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): Tool-Name-Konstanten hinzufügen"
```

---

### Aufgabe 2: Hartcodiertes Schemas-Modul

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/schemas.ts`
- Erstellen: `packages/core/src/tools/computer-use/schemas.test.ts`

Die 9 Schemas spiegeln die `tools/list`-Ausgabe von upstream `open-computer-use mcp` wider. Diese sind auf die upstream-Version `^0.x.y` festgelegt (TODO: Den tatsächlichen Pin oben in `schemas.ts` beim Implementieren eintragen — führe `npx -y open-computer-use@latest --version` aus, um die aktuelle neueste Version zu erfassen).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('computer-use schemas', () => {
  it('exports exactly 9 schemas', () => {
    expect(Object.keys(COMPUTER_USE_SCHEMAS)).toHaveLength(9);
  });

  it('each tool name matches the upstream convention (no computer_use__ prefix)', () => {
    // schemas.ts uses upstream names verbatim ("click", "type_text").
    // The computer_use__ prefix lives on the qwen-code-facing wrapper.
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(name).not.toContain('computer_use__');
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('every schema has the standard object structure', () => {
    for (const [name, schema] of Object.entries(COMPUTER_USE_SCHEMAS)) {
      expect(schema.description, `${name} missing description`).toBeTruthy();
      expect(
        schema.parameterSchema,
        `${name} missing parameterSchema`,
      ).toBeTruthy();
      expect((schema.parameterSchema as { type: string }).type).toBe('object');
    }
  });

  it('list_apps takes no parameters', () => {
    expect(COMPUTER_USE_SCHEMAS.list_apps.parameterSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('click requires app and either element_index or x/y', () => {
    const schema = COMPUTER_USE_SCHEMAS.click.parameterSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('app');
    expect(schema.properties).toHaveProperty('element_index');
    expect(schema.properties).toHaveProperty('x');
    expect(schema.properties).toHaveProperty('y');
    expect(schema.required).toContain('app');
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu überprüfen, dass er fehlschlägt**

Ausführen: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Erwartet: FEHLGESCHLAGEN mit "Cannot find module './schemas.js'"

- [ ] **Schritt 3: Das Schemas-Modul schreiben**

Erstelle `packages/core/src/tools/computer-use/schemas.ts`. Die folgenden Schemas sind MVP — sie spiegeln die Tool-Oberfläche und Parameternamen von upstream wider. Das Skript `sync-computer-use-schemas.ts` (Aufgabe 13) wird diese Datei in CI vor jedem qwen-code-Release aus einem aktuellen upstream-Snapshot neu generieren.

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded schemas for the 9 upstream open-computer-use tools.
 *
 * Pinned to upstream version: <PIN_VERSION_DURING_IMPL>
 *
 * Regenerated by `scripts/sync-computer-use-schemas.ts` — do not hand-edit.
 * The upstream tool names ("click", "type_text") appear verbatim here;
 * the `computer_use__` prefix is added by the qwen-code-facing wrapper in
 * `tool.ts` so the model sees `computer_use__click` without any MCP
 * concept leaking through.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = [
  'list_apps',
  'get_app_state',
  'click',
  'perform_secondary_action',
  'scroll',
  'drag',
  'type_text',
  'press_key',
  'set_value',
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<
  ComputerUseToolName,
  ComputerUseToolSchema
> = {
  list_apps: {
    description:
      'List running and recently-used desktop applications on the current machine. Returns each app with a bundle identifier and display name. Use this before get_app_state to discover what is available to interact with.',
    parameterSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  get_app_state: {
    description:
      'Capture the current accessibility tree and a screenshot of the given application. Returns element_index values that subsequent actions (click, set_value, etc.) can target. Always call this before any element-targeted action; element_index values are valid only within the current snapshot.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'Application bundle identifier or display name (e.g. "TextEdit", "com.apple.Safari").',
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  click: {
    description:
      'Left-click a target. Prefer element_index from a recent get_app_state result. Fall back to x/y screenshot pixel coordinates only when no AX element matches the target.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Target application.' },
        element_index: {
          type: 'integer',
          description: 'Index into the latest get_app_state element list.',
        },
        x: {
          type: 'integer',
          description: 'X coordinate in screenshot pixels.',
        },
        y: {
          type: 'integer',
          description: 'Y coordinate in screenshot pixels.',
        },
        click_count: {
          type: 'integer',
          description: 'Number of clicks (1 = single, 2 = double).',
          default: 1,
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  perform_secondary_action: {
    description:
      'Perform a non-click semantic action exposed by the target AX element (e.g. "Raise", "ShowMenu"). Returns an error if the action is not valid for the element.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        action: {
          type: 'string',
          description: 'AX action name to perform.',
        },
      },
      required: ['app', 'element_index', 'action'],
      additionalProperties: false,
    },
  },
  scroll: {
    description:
      'Scroll inside the target element or at the given coordinates. `pages` is a fractional page count (positive = down, negative = up).',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        pages: {
          type: 'number',
          description: 'Fractional page count to scroll (negative = up).',
        },
      },
      required: ['app', 'pages'],
      additionalProperties: false,
    },
  },
  drag: {
    description:
      'Drag from one coordinate pair to another inside the target application window. Coordinates are in screenshot pixels.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        from_x: { type: 'integer' },
        from_y: { type: 'integer' },
        to_x: { type: 'integer' },
        to_y: { type: 'integer' },
      },
      required: ['app', 'from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  type_text: {
    description:
      'Type text into the currently-focused text input of the target application. Click the input area first if it is not focused. For unfocused text fields, prefer set_value instead.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        text: {
          type: 'string',
          description: 'Text to type. Supports Unicode.',
        },
      },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  press_key: {
    description:
      'Press a keyboard key or combo against the target application. Key names follow xdotool conventions (e.g. "Return", "BackSpace", "cmd+c", "Page_Up").',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['app', 'key'],
      additionalProperties: false,
    },
  },
  set_value: {
    description:
      'Directly set the value of a settable AX element (text fields, sliders, etc.). Returns an error if the target is not settable.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        value: { type: 'string' },
      },
      required: ['app', 'element_index', 'value'],
      additionalProperties: false,
    },
  },
};
```

- [ ] **Schritt 4: Test ausführen, um zu überprüfen, dass er bestanden wird**

Ausführen: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Erwartet: BESTANDEN, 5 Tests

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): upstream Tool-Schemas hartcodiert"
```

---

### Aufgabe 3: Settings-Schema + Config-Verdrahtung für enableComputerUse

**Dateien:**

- Modifizieren: `packages/cli/src/config/settingsSchema.ts`
- Modifizieren: `packages/cli/src/config/config.ts`
- Modifizieren: `packages/core/src/config/config.ts`

- [ ] **Schritt 1: Settings-Eintrag hinzufügen**

Bearbeite `packages/cli/src/config/settingsSchema.ts`. Das vorhandene Schema gruppiert Dinge nach Kategorie. Computer Use ist eine Tool-Fähigkeit, nicht experimentell — füge eine neue Untergruppe `tools` hinzu, falls sie nicht existiert, oder füge sie zu einer vorhandenen hinzu. Verwende grep:

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

Wenn ein `tools:`-Schlüssel existiert, füge eine neue Eigenschaft darunter hinzu. Falls nicht, füge eine Gruppe auf oberster Ebene hinzu. Muster (in der Nähe des Eintrags `experimental.cron` einfügen, etwa Zeile ~2298):

```ts
  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: 'Tool-Fähigkeiten umschalten.',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: 'Computer Use',
        category: 'Tools',
        requiresRestart: true,
        default: {},
        description: 'Plattformübergreifende Desktop-Automatisierung über den upstream open-computer-use MCP-Server. Tools: list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value. Beim ersten Aufruf wird das upstream-Binary per npx abgerufen und der Benutzer wird durch die macOS-Eingabehilfe / Bildschirmaufzeichnungsberechtigungen geführt, falls erforderlich.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Computer Use aktivieren',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: 'Wenn aktiviert (Standard), werden die 9 computer_use__* Tools als zurückgestellte Built-ins registriert.',
            showInDialog: true,
          },
        },
      },
    },
  },
```

Wenn eine `tools:`-Gruppe bereits existiert, füge einfach die `computerUse:`-Eigenschaft unter deren `properties` hinzu.

- [ ] **Schritt 2: Settings → ConfigParameters verdrahten**

Bearbeite `packages/cli/src/config/config.ts`. Finde die vorhandene Zeile `cronEnabled: settings.experimental?.cron ?? false,` (etwa Zeile 1833). Füge direkt darunter hinzu:

```ts
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **Schritt 3: Config-Feld + Getter hinzufügen**

Bearbeite `packages/core/src/config/config.ts`:

(a) Im Interface `ConfigParameters` (suche nach `cronEnabled?: boolean;`), füge direkt darunter hinzu:

```ts
  computerUseEnabled?: boolean;
```

(b) In den Klassenfeldern von `Config` (suche nach `private readonly cronEnabled: boolean = false;`), füge direkt darunter hinzu:

```ts
  private readonly computerUseEnabled: boolean = true;
```

(c) Im Konstruktor von `Config` (suche nach `this.cronEnabled = params.cronEnabled ?? false;`), füge direkt darunter hinzu:

```ts
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) In der Nähe von `isCronEnabled()` (suche nach `isCronEnabled(): boolean {`), füge einen Geschwister-Getter hinzu:

```ts
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **Schritt 4: Typcheck**

Ausführen: `npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
Erwartet: BESTANDEN

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): Einstellung enableComputerUse hinzugefügt (Standard true)"
```

---

## Phase 2 — Transport (MCP-Client über npx stdio)

### Aufgabe 4: ComputerUseClient — Singleton MCP-Process-Manager über stdio

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/client.ts`
- Erstellen: `packages/core/src/tools/computer-use/client.test.ts`

Hinweis: Der Client verwendet `@modelcontextprotocol/sdk` (bereits eine Abhängigkeit, siehe `packages/core/src/tools/mcp-client.ts`). Wir verwenden `StdioClientTransport`, um `npx -y open-computer-use mcp` zu starten.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseClient } from './client.js';

describe('ComputerUseClient', () => {
  let client: ComputerUseClient;

  beforeEach(() => {
    client = new ComputerUseClient({
      packageSpec: 'open-computer-use@latest',
      onProgress: vi.fn(),
    });
  });

  it('is constructible', () => {
    expect(client).toBeDefined();
  });

  it('reports not-started before start() is called', () => {
    expect(client.isStarted()).toBe(false);
  });

  it('returns the same instance for repeated callers via singleton', () => {
    const a = ComputerUseClient.shared();
    const b = ComputerUseClient.shared();
    expect(a).toBe(b);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu überprüfen, dass er fehlschlägt**

Ausführen: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Erwartet: FEHLGESCHLAGEN — Modul nicht gefundenDies ist der Anfang der Übersetzung. Ich setze sie fort.*Translation continues from the beginning, now covering the rest of the document.*
- [ ] **Schritt 3: Den Client implementieren**

Erstelle `packages/core/src/tools/computer-use/client.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Singleton stdio MCP client for the upstream open-computer-use binary.
 *
 * Spawned via `npx -y <packageSpec> mcp`. First spawn pays the npx
 * download cost (up to ~60s for a fresh cache); subsequent spawns reuse
 * the npx cache and are sub-second.
 *
 * Lifecycle: lazy spawn on first `callTool` invocation. The process
 * stays alive until `stop()` or qwen-code exits. State (element_index
 * map per app) lives in the process — if the process restarts, the
 * model must call `get_app_state` again before any element-targeted
 * action.
 */
export interface ComputerUseClientOptions {
  /** npm package spec to npx. Example: "open-computer-use@^0.3.0". */
  packageSpec: string;
  /** Streaming hook for progress messages during slow operations. */
  onProgress?: (message: string) => void;
}

export class ComputerUseClient {
  private static singleton: ComputerUseClient | undefined;

  private readonly packageSpec: string;
  private readonly onProgress: (message: string) => void;
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(options: ComputerUseClientOptions) {
    this.packageSpec = options.packageSpec;
    this.onProgress = options.onProgress ?? (() => {});
  }

  /**
   * Shared singleton instance, created with default options on first
   * access. Tests can replace it via `setSharedForTest()`.
   */
  static shared(): ComputerUseClient {
    if (!ComputerUseClient.singleton) {
      ComputerUseClient.singleton = new ComputerUseClient({
        packageSpec:
          process.env['QWEN_COMPUTER_USE_PACKAGE'] ??
          'open-computer-use@latest',
      });
    }
    return ComputerUseClient.singleton;
  }

  /** Test-only: replace the singleton. */
  static setSharedForTest(replacement: ComputerUseClient | undefined): void {
    ComputerUseClient.singleton = replacement;
  }

  isStarted(): boolean {
    return this.client !== undefined;
  }

  /**
   * Start the upstream MCP server. Idempotent: concurrent callers share
   * the same in-flight start promise.
   *
   * Throws on spawn failure (network down, npx missing, etc.). The
   * caller (bootstrap state machine) is responsible for mapping the
   * throw into user-facing UX.
   */
  async start(): Promise<void> {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.onProgress('Starting Computer Use...');

    // After ~3s, surface a hint that the slow path is download.
    const downloadHintTimer = setTimeout(() => {
      this.onProgress(
        'Downloading Computer Use binary (this can take ~60s on first use)...',
      );
    }, 3000);

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', this.packageSpec, 'mcp'],
        // Inherit env so HTTPS_PROXY etc. flow through to npx
        env: { ...process.env } as Record<string, string>,
      });
      const client = new Client(
        { name: 'qwen-code-computer-use', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.transport = transport;
      this.client = client;
    } finally {
      clearTimeout(downloadHintTimer);
    }
  }

  /**
   * List the tools exposed by the upstream server. Used by the schema
   * sync script and bootstrap diagnostics.
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) throw new Error('ComputerUseClient not started');
    return this.client.listTools();
  }

  /**
   * Call a tool by upstream name (NOT the qwen-code-facing
   * `computer_use__` prefixed name). Returns the raw MCP result so the
   * caller can inspect `isError` and parse text content.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error('ComputerUseClient not started');
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** Tear down the child process. Safe to call multiple times. */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) {
      try {
        await client.close();
      } catch {
        // best-effort cleanup
      }
    }
  }
}
```

- [ ] **Schritt 4: Test ausführen, um die Funktionsfähigkeit zu überprüfen**

Ausführen: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Erwartet: PASS, 3 Tests

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): MCP stdio client for upstream binary"
```

---

### Aufgabe 5: ComputerUseTool — parametrisierter BaseDeclarativeTool-Wrapper

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/tool.ts`
- Erstellen: `packages/core/src/tools/computer-use/tool.test.ts`

Für diese Aufgabe leitet das Tool lediglich an `ComputerUseClient` weiter, unter der Annahme, dass dieser bereits gestartet ist. Die Bootstrap-Zustandsmaschine wird dies in Phase 3 umschließen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputerUseTool } from './tool.js';
import { ComputerUseClient } from './client.js';
import { COMPUTER_USE_SCHEMAS } from './schemas.js';

function makeFakeClient(
  callToolImpl: (name: string, args: unknown) => Promise<unknown>,
) {
  const fake = {
    isStarted: () => true,
    start: vi.fn(async () => {}),
    callTool: vi.fn(callToolImpl),
    stop: vi.fn(async () => {}),
  };
  return fake as unknown as ComputerUseClient;
}

describe('ComputerUseTool', () => {
  beforeEach(() => {
    ComputerUseClient.setSharedForTest(undefined);
  });

  it('exposes qwen-facing name with computer_use__ prefix', () => {
    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    expect(tool.name).toBe('computer_use__click');
    expect(tool.displayName).toBe('computer_use__click');
  });

  it('marks itself as deferred', () => {
    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    expect(tool.shouldDefer).toBe(true);
    expect(tool.alwaysLoad).toBe(false);
  });

  it('forwards execute() to the shared client with the upstream name', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: '[]' }],
      isError: false,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    const invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(fake.callTool).toHaveBeenCalledWith('list_apps', {});
  });

  it('returns an error result when client returns isError=true', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: 'something went wrong' }],
      isError: true,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    const invocation = tool.build({ app: 'TextEdit' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(String(result.llmContent)).toContain('something went wrong');
  });
});
```

- [ ] **Schritt 2: Test ausführen, um den Fehler zu bestätigen**

Ausführen: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Erwartet: FAIL — Modul nicht gefunden

- [ ] **Schritt 3: Das Tool implementieren**

Erstelle `packages/core/src/tools/computer-use/tool.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from '../tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ComputerUseClient } from './client.js';
import type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { runBootstrap } from './bootstrap.js';

type ComputerUseParams = Record<string, unknown>;

class ComputerUseInvocation extends BaseToolInvocation<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    params: ComputerUseParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const client = ComputerUseClient.shared();

    // Phase 3 wires the bootstrap state machine here. Until then, this
    // shells out directly which is fine when the binary is already
    // installed and permissions granted.
    await runBootstrap(client, { signal, updateOutput });

    let mcpResult: CallToolResult;
    try {
      mcpResult = await client.callTool(this.upstreamName, this.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Computer Use tool '${this.upstreamName}' failed: ${message}`,
        returnDisplay: `Error: ${message}`,
        error: { message },
      };
    }

    const text = mcpResult.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');

    if (mcpResult.isError) {
      return {
        llmContent: text || `Tool '${this.upstreamName}' returned isError=true`,
        returnDisplay: text || 'Error',
        error: { message: text || 'tool returned error' },
      };
    }

    return {
      llmContent: text,
      returnDisplay: text,
    };
  }
}

export class ComputerUseTool extends BaseDeclarativeTool<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    schema: ComputerUseToolSchema,
  ) {
    const qwenName = `computer_use__${upstreamName}`;
    super(
      qwenName,
      qwenName, // displayName == name; no MCP branding in UI
      schema.description,
      Kind.Other,
      schema.parameterSchema,
      true, // isOutputMarkdown — many results are JSON-ish text or screenshots
      true, // canUpdateOutput — bootstrap streams progress
      true, // shouldDefer — surface only via ToolSearch
      false, // alwaysLoad
      `computer use desktop click type screenshot mouse keyboard scroll drag automation gui app native`,
    );
  }

  protected createInvocation(
    params: ComputerUseParams,
  ): ToolInvocation<ComputerUseParams, ToolResult> {
    return new ComputerUseInvocation(this.upstreamName, params);
  }
}
```

Hinweis: Der Test referenziert `runBootstrap`, das in Phase 3 implementiert wird. Erstelle vorerst einen Stub `bootstrap.ts`, damit der Test besteht:

Erstelle `packages/core/src/tools/computer-use/bootstrap.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComputerUseClient } from './client.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/**
 * STUB: Phase 3 replaces this with the full state machine
 * (install confirm → install → permission probe → guide → poll).
 * For now: assumes binary is installed and permissions granted;
 * just starts the client if needed.
 */
export async function runBootstrap(
  client: ComputerUseClient,
  _ctx: BootstrapContext,
): Promise<void> {
  if (!client.isStarted()) {
    await client.start();
  }
}
```

- [ ] **Schritt 4: Test ausführen, um die Funktionsfähigkeit zu überprüfen**

Ausführen: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Erwartet: PASS, 4 Tests

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): ComputerUseTool wrapper + bootstrap stub"
```

---

### Aufgabe 6: Tools in ToolRegistry registrieren

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/index.ts`
- Ändern: `packages/core/src/config/config.ts`

- [ ] **Schritt 1: Den Registrierungs-Helfer erstellen**

Erstelle `packages/core/src/tools/computer-use/index.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export { ComputerUseTool } from './tool.js';
export { ComputerUseClient } from './client.js';
export type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
export { COMPUTER_USE_TOOL_NAMES, COMPUTER_USE_SCHEMAS } from './schemas.js';

import { ComputerUseTool } from './tool.js';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';
import type { ToolRegistry } from '../tool-registry.js';

/**
 * Register all 9 computer-use tools as lazy factories on the registry.
 * Each tool is deferred (`shouldDefer=true`), so they surface only via
 * ToolSearch keyword match. The first invocation triggers the
 * bootstrap state machine (install confirm → install → permission flow)
 * before forwarding to the upstream MCP server.
 *
 * Should only be called when `Config.isComputerUseEnabled()` is true.
 */
export function registerComputerUseTools(registry: ToolRegistry): void {
  for (const upstreamName of COMPUTER_USE_TOOL_NAMES) {
    const schema = COMPUTER_USE_SCHEMAS[upstreamName];
    const qwenName = `computer_use__${upstreamName}`;
    registry.registerFactory(
      qwenName,
      async () => new ComputerUseTool(upstreamName, schema),
    );
  }
}
```

- [ ] **Schritt 2: In Config.createToolRegistry einbinden**

Bearbeite `packages/core/src/config/config.ts`. Finde den vorhandenen Block, der Cron-Tools bedingt registriert (ca. Zeile 3952):

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

Direkt unter dem Cron-Block (und vor dem Monitor-Block) füge hinzu:

```ts
// Register computer-use tools unless disabled.
// All 9 are deferred — they surface only via ToolSearch keyword
// match (see packages/core/src/tools/computer-use/).
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **Schritt 3: Einen Registrierungstest hinzufügen**

Füge am Ende der vorhandenen Tool-Registry-Tests hinzu ODER erstelle `packages/core/src/tools/computer-use/registration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('registerComputerUseTools', () => {
  it('registers a factory for each of the 9 upstream tools, prefixed with computer_use__', () => {
    const registered = new Set<string>();
    const fakeRegistry = {
      registerFactory: vi.fn((name: string) => {
        registered.add(name);
      }),
    } as never;

    registerComputerUseTools(fakeRegistry);

    expect(registered.size).toBe(9);
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(registered.has(`computer_use__${name}`)).toBe(true);
    }
  });
});
```

- [ ] **Schritt 4: Tests + Typcheck ausführen**

Ausführen:

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

Erwartet: Alle PASS.

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): register 9 deferred tools when enabled"
```

---

### Aufgabe 7: Manueller Rauchtest — Tools erscheinen und ein Happy-Path-Aufruf funktioniert

Dies ist ein nicht-programmierendes Gate. Es stellt sicher, dass die Grundlage funktioniert, bevor wir die Bootstrap-UX darauf aufbauen.

- [ ] **Schritt 1: Vorgelagertes Binärprogramm vorinstallieren (einmalig, manuell)**

Führe in einem Terminal aus:

```bash
npx -y open-computer-use@latest --version
```

Auf macOS: Führe auch `npx -y open-computer-use@latest doctor` aus und erteile alle angefragten Berechtigungen. Dies umgeht unseren Bootstrap, damit wir die Transportschicht isoliert prüfen können.

- [ ] **Schritt 2: qwen-code erstellen**

Ausführen: `npm run build`
Erwartet: PASS.

- [ ] **Schritt 3: qwen-code starten und Discovery testen**

Starte qwen-code und frage das Modell: _"Use the ToolSearch tool with query 'click computer use' to find any desktop automation tools available."_

Erwartet: ToolSearch gibt 9 `computer_use__*`-Schemata zurück.

- [ ] **Schritt 4: Ein Tool ohne Berechtigung testen**

Frage: _"List the desktop apps currently running using the computer_use\_\_list_apps tool."_

Erwartet: Erster Aufruf zeigt ein paar Sekunden "Starting Computer Use..." (oder länger, wenn der npx-Cache kalt ist), dann wird eine Liste laufender Apps zurückgegeben. Nachfolgende Aufrufe in derselben Sitzung sind schnell.

- [ ] **Schritt 5: Kein Commit nötig; dies ist ein Rauchtest-Gate**

Wenn hier etwas fehlschlägt, STOPP und debugge, bevor du zu Phase 3 übergehst.

---

## Phase 3 — Bootstrap-UX (Installationsbestätigung + Berechtigungsleitfaden)

Diese Phase ersetzt den `runBootstrap`-Stub aus Aufgabe 5 durch die vollständige Zustandsmaschine.

### Aufgabe 8: Installationszustandspersistenz

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/install-state.ts`
- Erstellen: `packages/core/src/tools/computer-use/install-state.test.ts`

Gespeichert unter `~/.qwen/computer-use/installed.json`:

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/install-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInstallState,
  saveInstallState,
  isPackageSpecApproved,
  installStatePathFor,
} from './install-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('install-state', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-test-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns undefined when no state file exists', async () => {
    expect(await loadInstallState(tmpHome)).toBeUndefined();
  });

  it('round-trips state', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    const loaded = await loadInstallState(tmpHome);
    expect(loaded).toEqual({
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
  });

  it('isPackageSpecApproved returns false when no state', async () => {
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(false);
  });

  it('isPackageSpecApproved returns true on exact match', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(true);
  });

  it('isPackageSpecApproved returns false when version differs', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.4.0'),
    ).toBe(false);
  });
});
```
- [ ] **Schritt 2: Test ausführen, um zu bestätigen, dass er fehlschlägt**

Ausführen: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Erwartet: FEHLGESCHLAGEN — Modul nicht gefunden

- [ ] **Schritt 3: Modul implementieren**

Erstelle `packages/core/src/tools/computer-use/install-state.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface InstallState {
  /** The package spec the user approved (e.g. "open-computer-use@^0.3.0"). */
  approvedPackageSpec: string;
  /** ISO 8601 UTC timestamp of approval. */
  approvedAtIso: string;
}

/**
 * Path to the install-state file. Exported for tests so they can
 * point at a temp directory.
 */
export function installStatePathFor(home: string = homedir()): string {
  return join(home, '.qwen', 'computer-use', 'installed.json');
}

export async function loadInstallState(
  home: string = homedir(),
): Promise<InstallState | undefined> {
  try {
    const text = await readFile(installStatePathFor(home), 'utf8');
    const parsed = JSON.parse(text) as InstallState;
    // Minimal shape check — older or malformed files act as "not approved".
    if (typeof parsed?.approvedPackageSpec !== 'string') return undefined;
    if (typeof parsed?.approvedAtIso !== 'string') return undefined;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    // Treat unreadable / malformed state as "not approved" — re-prompt
    // is safe; treating a bad file as approved would silently install.
    return undefined;
  }
}

export async function saveInstallState(
  home: string = homedir(),
  state: InstallState,
): Promise<void> {
  const path = installStatePathFor(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * True iff the persisted state's package spec exactly matches the one
 * we're about to install. Different specs (version pin bumps) require
 * re-approval, since the user may have approved an older / smaller /
 * different-license version.
 */
export async function isPackageSpecApproved(
  home: string = homedir(),
  packageSpec: string,
): Promise<boolean> {
  const state = await loadInstallState(home);
  return state?.approvedPackageSpec === packageSpec;
}
```

- [ ] **Schritt 4: Test ausführen, um zu bestätigen, dass er bestanden wird**

Ausführen: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Erwartet: BESTANDEN, 5 Tests

- [ ] **Schritt 5: Committen**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### Aufgabe 9: Berechtigungsfehler-Erkennung

**Dateien:**

- Erstellen: `packages/core/src/tools/computer-use/permission-detector.ts`
- Erstellen: `packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/permission-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectPermissionError } from './permission-detector.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function textErrorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

describe('detectPermissionError', () => {
  it('returns "none" when isError is false', () => {
    expect(
      detectPermissionError({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    ).toBe('none');
  });

  it('detects accessibility permission missing (upstream phrasing)', () => {
    // From AccessibilitySnapshot.swift:104
    const result = textErrorResult(
      'Accessibility permission is required. Run `open-computer-use doctor` and grant access to Open Computer Use.',
    );
    expect(detectPermissionError(result)).toBe('accessibility');
  });

  it('detects screen recording permission missing', () => {
    const result = textErrorResult(
      'Screen Recording permission is required to capture this window.',
    );
    expect(detectPermissionError(result)).toBe('screenRecording');
  });

  it('detects via the generic doctor marker as fallback', () => {
    const result = textErrorResult(
      'Some unfamiliar error. Run `open-computer-use doctor` for help.',
    );
    expect(detectPermissionError(result)).toBe('unknown_permission');
  });

  it('returns "other" for unrelated errors', () => {
    expect(
      detectPermissionError(textErrorResult('appNotFound("ImaginaryApp")')),
    ).toBe('other');
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu bestätigen, dass er fehlschlägt**

Ausführen: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Erwartet: FEHLGESCHLAGEN — Modul nicht gefunden

- [ ] **Schritt 3: Den Detektor implementieren**

Erstelle `packages/core/src/tools/computer-use/permission-detector.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * What kind of permission issue, if any, the upstream MCP result
 * indicates. We classify based on message strings because upstream
 * doesn't expose typed error codes through MCP (see
 * `packages/OpenComputerUseKit/Sources/OpenComputerUseKit/Errors.swift`
 * in the open-codex-computer-use repo).
 *
 * Long-term fix is to PR upstream for a typed errorKind; for now this
 * string detection is the contract.
 */
export type PermissionErrorKind =
  | 'none' // success, or non-error result
  | 'other' // error, but not a permission issue
  | 'accessibility' // AX missing
  | 'screenRecording' // Screen Recording missing
  | 'unknown_permission'; // matches the doctor marker but doesn't pinpoint which

/**
 * Upstream-known error patterns. Order matters — more specific
 * patterns first.
 */
const PATTERNS: Array<{ kind: PermissionErrorKind; regex: RegExp }> = [
  { kind: 'accessibility', regex: /accessibility permission is required/i },
  { kind: 'screenRecording', regex: /screen recording permission/i },
  // Fallback: any error mentioning the doctor command is likely permission-related.
  // Listed last so it doesn't preempt the specific patterns.
  { kind: 'unknown_permission', regex: /open-computer-use\s+doctor/i },
];

export function detectPermissionError(
  result: CallToolResult,
): PermissionErrorKind {
  if (!result.isError) return 'none';
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
  for (const { kind, regex } of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return 'other';
}
```

- [ ] **Schritt 4: Test ausführen, um zu bestätigen, dass er bestanden wird**

Ausführen: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Erwartet: BESTANDEN, 5 Tests

- [ ] **Schritt 5: Committen**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### Aufgabe 10: Bootstrapping-Zustandsautomat — vollständiger UX-Ablauf

**Dateien:**

- Ändern: `packages/core/src/tools/computer-use/bootstrap.ts` (Stub aus Aufgabe 5 ersetzen)
- Erstellen: `packages/core/src/tools/computer-use/bootstrap.test.ts`

Der Zustandsautomat hat drei Unterabläufe:

1. **Erstinstallation**: Wenn `isPackageSpecApproved` false ist, Benutzer auffordern, installieren, Zustimmung speichern.
2. **Starten**: Sicherstellen, dass der Client gestartet ist.
3. **Berechtigungsprüfung + Anleitung** (nur macOS): Wenn ein Berechtigungsfehler auftritt, `open-computer-use doctor` starten, bis zu 10 Minuten auf Gewährung warten, erneut versuchen.

Hinweis: Der tatsächliche Mechanismus zum "Stellen einer Frage an den Benutzer während der Ausführung" in qwen-code verwendet das vorhandene Tool-Bestätigungsframework. **IMPLEMENTIERER**: Bevor die Implementierung dieser Aufgabe geschrieben wird, suchen Sie mit `grep` nach `shouldConfirmExecute` in `packages/core/src/tools/`, um zu sehen, wie `shell.ts` / ähnliche Tools die Bestätigung durchführen. Diese Aufgabe geht davon aus, dass dieser Mechanismus verfügbar ist; falls nicht, verwenden Sie `process.stderr.write` + Lesen von `process.stdin` für die Installationsbestätigung (akzeptable v0-UX).

- [ ] **Schritt 1: Bestätigungsmuster untersuchen**

Ausführen:

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

Lesen Sie mindestens ein Tool, das das Bestätigungsmuster verwendet (wahrscheinlich `shell.ts`). Entscheiden Sie: Hat `ToolInvocation` eine `shouldConfirmExecute()`-Methode oder ähnliches?

Wenn JA: Verwenden Sie es für die Installationsbestätigung.
Wenn NEIN: Verwenden Sie den v0-Fallback (stderr + `ask_user_question`-Tool, falls verfügbar, andernfalls eine spezifische Fehlercode werfen, den das Modell nach Benutzerfreigabe erneut ausgeben kann).

Dokumentieren Sie Ihre Wahl in einem Code-Kommentar oben in `bootstrap.ts`.

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

Erstelle `packages/core/src/tools/computer-use/bootstrap.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type BootstrapDeps } from './bootstrap.js';

function makeFakeClient(opts: { startThrows?: Error } = {}) {
  const start = vi.fn(async () => {
    if (opts.startThrows) throw opts.startThrows;
  });
  return {
    isStarted: vi.fn(() => start.mock.calls.length > 0),
    start,
    callTool: vi.fn(),
    stop: vi.fn(),
  };
}

describe('runBootstrap', () => {
  let tmpHome: string;
  let deps: BootstrapDeps;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-bs-'));
    deps = {
      homeDir: tmpHome,
      packageSpec: 'open-computer-use@^0.3.0',
      platform: 'darwin',
      promptInstallApproval: vi.fn(async () => true),
      spawnDoctor: vi.fn(),
      probePermissions: vi.fn(async () => 'ok' as const),
    };
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('starts the client when binary is approved + permissions ok', async () => {
    // Pre-seed install state to skip the prompt
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(client.start).toHaveBeenCalledOnce();
    expect(deps.promptInstallApproval).not.toHaveBeenCalled();
  });

  it('prompts for install approval on first call', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.promptInstallApproval).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('throws when user declines install', async () => {
    deps.promptInstallApproval = vi.fn(async () => false);
    const client = makeFakeClient();

    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/declined/i);
    expect(client.start).not.toHaveBeenCalled();
  });

  it('persists approval on success', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    const { loadInstallState } = await import('./install-state.js');
    const state = await loadInstallState(tmpHome);
    expect(state?.approvedPackageSpec).toBe('open-computer-use@^0.3.0');
  });

  it('spawns doctor and polls when permissions are missing', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    let probeCount = 0;
    deps.probePermissions = vi.fn(async () => {
      probeCount++;
      return probeCount < 3 ? 'accessibility' : 'ok';
    });
    deps.pollIntervalMs = 1; // speed up test
    deps.pollTimeoutMs = 1000;

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).toHaveBeenCalledOnce();
    expect(probeCount).toBeGreaterThanOrEqual(3);
  });

  it('throws after pollTimeoutMs when permissions never grant', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    deps.probePermissions = vi.fn(async () => 'accessibility' as const);
    deps.pollIntervalMs = 1;
    deps.pollTimeoutMs = 50;

    const client = makeFakeClient();
    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('skips permission flow on non-darwin platforms', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    deps.platform = 'linux';

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Schritt 3: Test ausführen, um zu bestätigen, dass er fehlschlägt**

Ausführen: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Erwartet: FEHLGESCHLAGEN — viele Fehler

- [ ] **Schritt 4: Den Zustandsautomaten implementieren**

Ersetze `packages/core/src/tools/computer-use/bootstrap.ts` durch:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computer Use bootstrap state machine.
 *
 * On first invocation of any computer_use__* tool:
 *   1. If not yet approved: prompt the user to install (one-time).
 *   2. Start the client (lazy npx spawn, may take ~60s first time).
 *   3. On macOS only: probe permissions by calling get_app_state on
 *      Finder. If a permission error surfaces, spawn the upstream
 *      doctor (which opens the system settings + onboarding window),
 *      then poll until permissions grant or 10 min timeout.
 *
 * IMPLEMENTER: pre-step 1 (Task 10 step 1) — verify whether
 * qwen-code's BaseDeclarativeTool exposes a `shouldConfirmExecute()`
 * pathway from inside `execute()`. If not, `promptInstallApproval`
 * defaults to a `process.stderr.write` + readline fallback. The
 * dependency-injection design here keeps that decision swappable
 * without touching the state machine logic.
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { ComputerUseClient } from './client.js';
import { isPackageSpecApproved, saveInstallState } from './install-state.js';
import {
  detectPermissionError,
  type PermissionErrorKind,
} from './permission-detector.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/** Result of a permission probe. */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * Prompt the user to approve installing the upstream binary. Returns
   * true if approved. Implementation may use the qwen-code confirm
   * tool path or a stdin fallback.
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * Spawn `open-computer-use doctor` (detached). The binary handles
   * opening the system settings window itself.
   */
  spawnDoctor: () => void;
  /**
   * Probe the upstream MCP server for permission state by issuing a
   * lightweight tool call. Returns 'ok' on success or the kind of
   * permission error on failure.
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** Poll interval for the permission watcher. Default 2000ms. */
  pollIntervalMs?: number;
  /** Total poll timeout. Default 10 min. */
  pollTimeoutMs?: number;
}

/** Production defaults — instantiated lazily so tests can override per call. */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // v0 fallback: stderr prompt + stdin read. Replace with
      // qwen-code's standard confirm pathway when wired in.
      process.stderr.write(
        `\n[Computer Use] First-time install\n` +
          `  Package: ${spec}\n` +
          `  This will fetch ~50MB from the npm registry the first time.\n` +
          `  Computer Use can click, type, and read your desktop apps.\n` +
          `  On macOS you'll be guided through Accessibility and Screen Recording permissions next.\n` +
          `Proceed? [y/N] `,
      );
      // IMPLEMENTER: in real interactive sessions, replace with the
      // qwen-code confirm system. For headless / SDK contexts the
      // default is to refuse — explicit user opt-in required.
      return process.env['QWEN_COMPUTER_USE_AUTO_APPROVE'] === '1';
    },
    spawnDoctor: () => {
      const child = spawn('npx', ['-y', defaultDeps().packageSpec, 'doctor'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    probePermissions: async (client) => {
      // Use Finder as a known-running, always-installed macOS app.
      // get_app_state hits AccessibilitySnapshot which is the first
      // path that throws permissionDenied.
      const result = await client.callTool('get_app_state', { app: 'Finder' });
      return detectPermissionError(result) === 'none'
        ? 'ok'
        : detectPermissionError(result);
    },
  };
}

export async function runBootstrap(
  client: ComputerUseClient,
  ctx: BootstrapContext,
  depsOverride?: Partial<BootstrapDeps>,
): Promise<void> {
  const deps: BootstrapDeps = { ...defaultDeps(), ...depsOverride };
  const pollIntervalMs = deps.pollIntervalMs ?? 2000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000;

  // Step 1: install approval gate.
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use needs to be installed (first use).');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        `Computer Use install declined by user. Re-invoke the tool to be prompted again.`,
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // Step 2: spawn (idempotent).
  if (!client.isStarted()) {
    ctx.updateOutput?.('Starting Computer Use...');
    await client.start();
  }

  // Step 3: macOS permission probe + guide.
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' means an error happened that isn't permission-related.
    // We don't block bootstrap on that — let the actual tool call surface it.
    return;
  }

  ctx.updateOutput?.(
    `Computer Use needs macOS permissions (${probe}). ` +
      `An onboarding window will open — please grant Accessibility and Screen Recording, then this will continue automatically.`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Computer Use bootstrap aborted.');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `Computer Use permission grant timed out after ${Math.round(pollTimeoutMs / 1000)}s. Re-invoke the tool to retry.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`Waiting for permissions... (${elapsedSec}s)`);
  }
}
```
- [ ] **Schritt 5: Test ausführen, um zu überprüfen, ob er bestanden wird**

Ausführen: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Erwartet: BESTANDEN, 7 Tests

- [ ] **Schritt 6: Committen**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### Aufgabe 11: Die echte `promptInstallApproval` an das Bestätigungssystem von qwen-code anbinden

**Dateien:**

- Modifizieren: `packages/core/src/tools/computer-use/bootstrap.ts`
- Eventuell: `packages/core/src/tools/computer-use/tool.ts`

Dies ist die Aufgabe mit dem variabelsten Umfang. **IMPLEMENTIERER**: Lies das Untersuchungsergebnis aus Aufgabe 10 Schritt 1 und verbinde entsprechend. Zwei Szenarien:

**Szenario A** — `BaseToolInvocation` unterstützt `shouldConfirmExecute()`:

- Überschreibe `shouldConfirmExecute()` in `ComputerUseInvocation`, um das Installationsbestätigungs-Payload zurückzugeben, wenn das Paket noch nicht genehmigt ist.
- Das Framework zeigt die Bestätigungs-Benutzeroberfläche an; bei Genehmigung wird `execute()` ausgeführt.
- `bootstrap.ts` behandelt dann nur noch den Pfad nach der Bestätigung (State schreiben, starten, Berechtigungsprüfung).

**Szenario B** — kein Bestätigungspfad während der Ausführung:

- Behalte die stderr+stdin v0 aus Aufgabe 10. Dokumentiere dies deutlich in der README und SKILL.md.
- Erstelle eine Folgeaufgabe, um einen ordnungsgemäßen Bestätigungspfad hinzuzufügen (separater PR).

- [ ] **Schritt 1: Ausgewähltes Szenario implementieren**

(Der konkrete Code hängt von der Untersuchung ab; Details an Implementierer delegieren.)

- [ ] **Schritt 2: Manueller Smoke-Test**

Installationsstatus löschen:

```bash
rm -rf ~/.qwen/computer-use
```

Starte qwen-code und stelle eine Computer-Use-Frage. Bestätige, dass die Installationsaufforderung in der gewählten UX (Bestätigungsdialog oder stderr) erscheint und dass die Genehmigung den Zustand korrekt speichert.

- [ ] **Schritt 3: Committen**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### Aufgabe 12: Manueller Smoke-Test – End-to-End-Erstinbetriebnahme-Ablauf

Dies ist ein Gate ohne Code.

- [ ] **Schritt 1: Caches leeren**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS: Berechtigungen entziehen
# Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen / Bildschirmaufzeichnung
# "Open Computer Use.app" entfernen
```

- [ ] **Schritt 2: Build + Ausführen**

```bash
npm run build
# qwen-code starten, eine Computer-Use-Frage stellen
```

- [ ] **Schritt 3: Vollständigen Ablauf überprüfen**

Erwartete Reihenfolge:

1. Installationsaufforderung erscheint.
2. Nach Genehmigung wird der Download-Fortschritt über `updateOutput` gestreamt.
3. Berechtigungswarnung erscheint, Doctor-Fenster öffnet sich.
4. Nach Gewährung der Berechtigungen in den Systemeinstellungen wird der Tool-Aufruf automatisch fortgesetzt.
5. Ergebnis wird zurückgegeben.

Wenn ein Schritt fehlschlägt, Fehler erfassen und anhalten. Iterieren.

- [ ] **Schritt 4: Kein Commit; dies ist ein Gate**

---

## Phase 4 – Werkzeuge / Wartung

### Aufgabe 13: Schema-Synchronisationsskript

**Dateien:**

- Erstellen: `scripts/sync-computer-use-schemas.ts`

Wird als Teil der qwen-code Release-Vorbereitung ausgeführt. Startet `npx -y open-computer-use@<pin> mcp`, sendet `tools/list` und generiert `schemas.ts` neu.

- [ ] **Schritt 1: Skript erstellen**

Erstelle `scripts/sync-computer-use-schemas.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Regenerate packages/core/src/tools/computer-use/schemas.ts from a
 * live upstream open-computer-use MCP server.
 *
 * Usage:
 *   npx tsx scripts/sync-computer-use-schemas.ts [packageSpec]
 *
 * Defaults packageSpec to `open-computer-use@latest`. The pin written
 * into the generated file is whatever spec was used — pass an explicit
 * pin (e.g. `open-computer-use@0.3.5`) for release builds.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const packageSpec = process.argv[2] ?? 'open-computer-use@latest';

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  });
  const client = new Client(
    { name: 'qwen-code-schema-sync', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  const result = await client.listTools();
  await client.close();

  if (result.tools.length !== 9) {
    process.stderr.write(
      `WARNING: upstream returned ${result.tools.length} tools, expected 9. Continuing anyway.\n`,
    );
  }

  const schemas: Record<
    string,
    { description: string; parameterSchema: unknown }
  > = {};
  for (const tool of result.tools) {
    schemas[tool.name] = {
      description: tool.description ?? '',
      parameterSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    };
  }

  const out = `/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded schemas for the upstream open-computer-use tools.
 *
 * Pinned to upstream: ${packageSpec}
 * Regenerated by scripts/sync-computer-use-schemas.ts — do not hand-edit.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = ${JSON.stringify(
    result.tools.map((t) => t.name),
    null,
    2,
  )} as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<ComputerUseToolName, ComputerUseToolSchema> = ${JSON.stringify(
    schemas,
    null,
    2,
  )};
`;

  const target = resolve('packages/core/src/tools/computer-use/schemas.ts');
  await writeFile(target, out, 'utf8');
  process.stdout.write(`Wrote ${result.tools.length} schemas to ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`Schema sync failed: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Schritt 2: Einmal manuell ausführen, um zu überprüfen**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

Erwartet: `schemas.ts` wird neu geschrieben; `npm test -- packages/core/src/tools/computer-use/schemas.test.ts` besteht weiterhin (oder schlägt nur bei Tests fehl, die bestimmte handgeschriebene Inhalte behauptet haben – passe diese Tests an, wenn sich die Beschreibungen des Upstream geändert haben).

- [ ] **Schritt 3: Committen**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## Selbst-Überprüfungs-Checkliste (nach dem Schreiben aller Aufgaben)

- [ ] Jeder Schritt hat entweder: einen Code-Block, einen exakten Befehl oder eine klar delegierbare IMPLEMENTIERER-Notiz mit Begründung.
- [ ] Alle 9 Tool-Namen verwenden konsistent das Präfix `computer_use__` in Schemas, Tool-Wrapper und Registrierung.
- [ ] Kein Verweis auf MCP / mcp__/ DiscoveredMCPTool gelangt in benutzersichtbare Zeichenketten.
- [ ] Bootstrap-Zustandsmaschine hat explizite Timeouts (keine Endlosschleifen).
- [ ] `enableComputerUse` standardmäßig `true` gemäß der Entscheidung des Benutzers.
- [ ] Tests abdecken: Schema-Integrität, Namenspräfix, Aufschub, Client-Lebenszyklus, Persistenz des Installationsstatus, Berechtigungserkennung, alle Bootstrap-Zustandsübergänge.
- [ ] Manuelle Smoke-Test-Gates (Aufgabe 7, Aufgabe 12) sind explizit – keine stillschweigenden Behauptungen von »es funktioniert«.

---

## Außerhalb des Bereichs (auf Folge-PRs verschoben)

- Leerlauf-Timeout für den MCP-Server-Prozess (Ressourcenschonung; v0 hält ihn am Leben, bis qwen-code beendet wird).
- Telemetrie zu Bootstrap-Fehlern (Netzwerkfehler vs. Gatekeeper vs. Berechtigungs-Timeout-Aufschlüsselungen).
- Offline-Installationspfad / Unterstützung für gecachte Tarballs.
- Fähigkeitsüberprüfung vor der Anzeige (derzeit tritt der Fehler beim ersten Aufruf auf).
- Upstream-PR für typisiertes errorKind bei permissionDenied (vom Benutzer verschoben).
- MCP-Server nach Berechtigungsgewährung neu starten (Benutzer möchte zuerst einen echten Test, um zu entscheiden, ob nötig).
- Feingranulare Berechtigungssteuerung pro Tool (z.B. schreibgeschützte `list_apps` / `get_app_state` erlauben, ohne jeden Aufruf zu bestätigen).

---

## Ausführungsübergabe

Plan gespeichert unter `docs/superpowers/plans/2026-05-28-computer-use-built-in.md`.

Zwei Ausführungsoptionen:

1. **Subagenten-gesteuert (empfohlen)** – einen neuen Subagenten pro Aufgabe einsetzen, zweistufige Überprüfung zwischen den Aufgaben, schnelle Iteration.
2. **Inline-Ausführung** – Aufgaben in dieser Sitzung mit Checkpoints zur Überprüfung ausführen.

Welcher Ansatz?