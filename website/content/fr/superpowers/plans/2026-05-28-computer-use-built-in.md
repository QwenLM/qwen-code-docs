# Plan d’implémentation intégré de Computer Use

> **Pour les travailleurs agentiques :** SOUS-COMPÉTENCE OBLIGATOIRE : Utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** Faire d’`open-computer-use` une capacité intégrée sans configuration dans qwen-code. 9 outils computer-use apparaissent dans la liste d’outils différés sous les noms `computer_use__click`, `computer_use__type_text`, etc. La première invocation installe de manière transparente le binaire npm upstream, guide l’utilisateur à travers les autorisations macOS d’Accessibilité / Enregistrement d’écran si nécessaire, et transmet l’appel au serveur MCP upstream.

**Architecture :** Coque fine autour du binaire upstream `npx -y open-computer-use mcp`. Nous NE regroupons PAS le binaire ; le cache `npx` d’upstream + le bundle `.app` gèrent la distribution et le TCC macOS. 9 outils sont enregistrés en tant qu’instances paramétrées de `ComputerUseTool` (une par nom d’outil) soutenues par un singleton `ComputerUseClient` qui possède un processus enfant MCP stdio longue durée. La machine d’état d’amorçage se superpose : autorisation d’outil qwen-code standard (existante) → confirmation d’installation initiale → guide facultatif des autorisations macOS.

**Stack technique :** TypeScript, vitest, `@modelcontextprotocol/sdk` (déjà une dépendance de qwen-code), `node:child_process`, `node:fs/promises`.

---

## Structure des fichiers

**Nouveaux fichiers :**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config) ; export barrel
  schemas.ts                        # 9 schémas codés en dur + descriptions (synchronisés depuis upstream)
  tool.ts                           # ComputerUseTool — BaseDeclarativeTool paramétré
  client.ts                         # ComputerUseClient — gestionnaire de processus MCP stdio singleton
  bootstrap.ts                      # machine d’état : sonde → confirmation d’installation → installation → guide des autorisations
  install-state.ts                  # lecture/écriture de ~/.qwen/computer-use/installed.json
  permission-detector.ts            # analyse des chaînes d’erreur upstream pour détecter les autorisations manquantes
  schemas.test.ts                   # les 9 schémas se parsent, les noms correspondent au contrat
  tool.test.ts                      # câblage d’outil paramétré
  client.test.ts                    # cycle de vie du client (spawn mocké)
  bootstrap.test.ts                 # transitions de la machine d’état
  install-state.test.ts             # test de persistance du fichier d’état
  permission-detector.test.ts       # correspondance de motifs d’erreur
scripts/
  sync-computer-use-schemas.ts      # script de release : dump des outils upstream tools/list → schemas.ts
```

**Fichiers modifiés :**

```
packages/core/src/tools/tool-names.ts                  # ajouter 9 constantes COMPUTER_USE_*
packages/core/src/config/config.ts                     # ajouter le champ computerUseEnabled + isComputerUseEnabled() + appel d’enregistrement dans createToolRegistry()
packages/cli/src/config/config.ts                      # mapper settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled
packages/cli/src/config/settingsSchema.ts              # ajouter le booléen tools.computerUse.enabled (vrai par défaut)
```

**Justification de la décomposition :** Chaque fichier a une responsabilité. `client.ts` connaît le protocole MCP mais pas l’UX ; `bootstrap.ts` connaît l’UX mais ne touche pas aux détails MCP ; `tool.ts` est une simple tuyauterie qui les relie via `execute()`. Les tests sont placés à côté du code. Les schémas sont isolés pour que le script de synchronisation puisse réécrire le fichier sans modifier la logique.

---

## Phase 1 — Fondation (surface d’outil visible, pas d’exécution)

### Tâche 1 : Ajouter les entrées ToolNames + ToolDisplayNames pour les 9 outils computer-use

**Fichiers :**

- Modifier : `packages/core/src/tools/tool-names.ts`

- [ ] **Étape 1 : Ajouter les 9 constantes de noms**

Modifiez `packages/core/src/tools/tool-names.ts` — dans l’objet `ToolNames`, après `EXIT_WORKTREE: 'exit_worktree',` :

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

Miroir dans `ToolDisplayNames` :

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

(displayName == name intentionnellement ; nous ne voulons pas de noms d’affichage en majuscules comme `Click` dans la boîte de dialogue d’autorisation alors que le nom de l’outil est `computer_use__click`.)

- [ ] **Étape 2 : Vérifier que le test existant de tool-names passe encore**

Exécutez : `npm test -- packages/core/src/tools/tool-names`
Attendu : PASS (s’il n’y a pas de fichier de test, exécutez `npm run build -- --filter @qwen-code/qwen-code-core` pour la vérification de types)

- [ ] **Étape 3 : Commit**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): add tool name constants"
```

---

### Tâche 2 : Module de schémas codés en dur

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/schemas.ts`
- Créer : `packages/core/src/tools/computer-use/schemas.test.ts`

Les 9 schémas reflètent la sortie `tools/list` d’`open-computer-use mcp` upstream. Ils sont épinglés à la version upstream `^0.x.y` (TODO : remplir l’épingle réelle en haut de `schemas.ts` lors de l’implémentation — exécutez `npx -y open-computer-use@latest --version` pour capturer la dernière version actuelle).

- [ ] **Étape 1 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/schemas.test.ts` :

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

- [ ] **Étape 2 : Exécuter le test pour vérifier qu’il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Attendu : FAIL avec « Cannot find module './schemas.js' »

- [ ] **Étape 3 : Écrire le module de schémas**

Créez `packages/core/src/tools/computer-use/schemas.ts`. Les schémas ci-dessous sont MVP — ils reflètent la surface d’outil et la nomenclature des paramètres d’upstream. Le script `sync-computer-use-schemas.ts` (Tâche 13) régénérera ce fichier à partir d’un snapshot upstream en direct dans la CI avant chaque version de qwen-code.

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

- [ ] **Étape 4 : Exécuter le test pour vérifier qu’il passe**

Exécutez : `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Attendu : PASS, 5 tests

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): hardcode upstream tool schemas"
```

---

### Tâche 3 : Schéma des paramètres + câblage Config pour enableComputerUse

**Fichiers :**

- Modifier : `packages/cli/src/config/settingsSchema.ts`
- Modifier : `packages/cli/src/config/config.ts`
- Modifier : `packages/core/src/config/config.ts`

- [ ] **Étape 1 : Ajouter l’entrée de paramètres**

Modifiez `packages/cli/src/config/settingsSchema.ts`. Le schéma existant regroupe les éléments par catégorie. Computer Use est une capacité d’outil, pas expérimentale — ajoutez un nouveau sous-groupe `tools` s’il n’existe pas, ou ajoutez-le au groupe existant. Utilisez grep :

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

Si une clé `tools:` existe, ajoutez une nouvelle propriété en dessous. Sinon, ajoutez un groupe de premier niveau. Modèle (ajoutez près de l’endroit où se trouve l’entrée `experimental.cron`, ligne ~2298) :

```ts
  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: 'Tool capability toggles.',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: 'Computer Use',
        category: 'Tools',
        requiresRestart: true,
        default: {},
        description: 'Cross-platform desktop automation via the upstream open-computer-use MCP server. Tools: list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value. On first invocation, the upstream binary is fetched via npx and the user is walked through macOS Accessibility / Screen Recording permissions if needed.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Enable Computer Use',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: 'When enabled (default), the 9 computer_use__* tools are registered as deferred built-ins.',
            showInDialog: true,
          },
        },
      },
    },
  },
```

Si un groupe `tools:` existe déjà, ajoutez simplement la propriété `computerUse:` sous ses `properties`.

- [ ] **Étape 2 : Câbler les paramètres → ConfigParameters**

Modifiez `packages/cli/src/config/config.ts`. Trouvez la ligne existante `cronEnabled: settings.experimental?.cron ?? false,` (vers la ligne 1833). Ajoutez directement en dessous :

```ts
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **Étape 3 : Ajouter le champ Config + le getter**

Modifiez `packages/core/src/config/config.ts` :

(a) Dans l’interface `ConfigParameters` (cherchez `cronEnabled?: boolean;`), ajoutez directement en dessous :

```ts
  computerUseEnabled?: boolean;
```

(b) Dans les champs de la classe `Config` (cherchez `private readonly cronEnabled: boolean = false;`), ajoutez directement en dessous :

```ts
  private readonly computerUseEnabled: boolean = true;
```

(c) Dans le constructeur de `Config` (cherchez `this.cronEnabled = params.cronEnabled ?? false;`), ajoutez directement en dessous :

```ts
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) Près de `isCronEnabled()` (cherchez `isCronEnabled(): boolean {`), ajoutez un getter frère :

```ts
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **Étape 4 : Vérification de types**

Exécutez : `npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
Attendu : PASS

- [ ] **Étape 5 : Commit**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): add enableComputerUse setting (default true)"
```

---

## Phase 2 — Transport (client MCP via npx stdio)

### Tâche 4 : ComputerUseClient — gestionnaire de processus MCP stdio singleton

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/client.ts`
- Créer : `packages/core/src/tools/computer-use/client.test.ts`

Remarque : Le client utilise `@modelcontextprotocol/sdk` (déjà une dépendance, voir `packages/core/src/tools/mcp-client.ts`). Nous utilisons `StdioClientTransport` pour lancer `npx -y open-computer-use mcp`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/client.test.ts` :

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

- [ ] **Étape 2 : Exécuter le test pour vérifier qu’il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Attendu : FAIL — module non trouvé
- [ ] **Étape 3 : Implémenter le client**

Créez `packages/core/src/tools/computer-use/client.ts` :

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
 * Client MCP stdio singleton pour le binaire upstream open-computer-use.
 *
 * Lancé via `npx -y <packageSpec> mcp`. Le premier lancement paie le coût
 * de téléchargement npx (jusqu'à ~60s pour un cache frais) ; les lancements
 * suivants réutilisent le cache npx et sont inférieurs à la seconde.
 *
 * Cycle de vie : lancement paresseux lors de la première invocation de `callTool`.
 * Le processus reste actif jusqu'à `stop()` ou la sortie de qwen-code.
 * L'état (tableau element_index par application) vit dans le processus —
 * si le processus redémarre, le modèle doit appeler `get_app_state` à nouveau
 * avant toute action ciblant un élément.
 */
export interface ComputerUseClientOptions {
  /** Spécification du package npm pour npx. Exemple : "open-computer-use@^0.3.0". */
  packageSpec: string;
  /** Hook de streaming pour les messages de progression pendant les opérations lentes. */
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
   * Instance singleton partagée, créée avec les options par défaut lors du
   * premier accès. Les tests peuvent la remplacer via `setSharedForTest()`.
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

  /** Réservé aux tests : remplace le singleton. */
  static setSharedForTest(replacement: ComputerUseClient | undefined): void {
    ComputerUseClient.singleton = replacement;
  }

  isStarted(): boolean {
    return this.client !== undefined;
  }

  /**
   * Démarre le serveur MCP upstream. Idempotent : les appelants concurrents
   * partagent la même promesse de démarrage en cours.
   *
   * Lève une exception en cas d'échec de lancement (réseau hors ligne,
   * npx manquant, etc.). L'appelant (machine d'état d'amorçage) est
   * responsable de transformer l'exception en expérience utilisateur.
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
    this.onProgress('Démarrage de Computer Use...');

    // Après ~3s, affiche une indication que le chemin lent correspond au téléchargement.
    const downloadHintTimer = setTimeout(() => {
      this.onProgress(
        'Téléchargement du binaire Computer Use (cela peut prendre ~60s lors de la première utilisation)...',
      );
    }, 3000);

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', this.packageSpec, 'mcp'],
        // Hérite des variables d'environnement pour que HTTPS_PROXY, etc. passent à npx
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
   * Liste les outils exposés par le serveur upstream. Utilisé par le script
   * de synchronisation des schémas et les diagnostics d'amorçage.
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) throw new Error('ComputerUseClient non démarré');
    return this.client.listTools();
  }

  /**
   * Appelle un outil par son nom upstream (PAS le nom avec préfixe
   * `computer_use__` côté qwen-code). Retourne le résultat MCP brut
   * pour que l'appelant puisse inspecter `isError` et analyser le contenu texte.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error('ComputerUseClient non démarré');
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** Nettoie le processus enfant. Sécurisé pour un appel multiple. */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) {
      try {
        await client.close();
      } catch {
        // nettoyage au mieux
      }
    }
  }
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

Exécutez : `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Résultat attendu : PASS, 3 tests

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): client MCP stdio pour le binaire upstream"
```

---

### Tâche 5 : ComputerUseTool — wrapper paramétré BaseDeclarativeTool

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/tool.ts`
- Créer : `packages/core/src/tools/computer-use/tool.test.ts`

Pour cette tâche, l'outil se contente de transférer les appels à `ComputerUseClient` en supposant qu'il est déjà démarré. La machine d'état d'amorçage l'encapsule dans la Phase 3.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/tool.test.ts` :

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

  it('expose un nom côté qwen avec le préfixe computer_use__', () => {
    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    expect(tool.name).toBe('computer_use__click');
    expect(tool.displayName).toBe('computer_use__click');
  });

  it('se marque comme différé (deferred)', () => {
    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    expect(tool.shouldDefer).toBe(true);
    expect(tool.alwaysLoad).toBe(false);
  });

  it('transfère execute() au client partagé avec le nom upstream', async () => {
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

  it('retourne un résultat d’erreur lorsque le client renvoie isError=true', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: 'quelque chose a mal tourné' }],
      isError: true,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    const invocation = tool.build({ app: 'TextEdit' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(String(result.llmContent)).toContain('quelque chose a mal tourné');
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Résultat attendu : ÉCHEC — module introuvable

- [ ] **Étape 3 : Implémenter l’outil**

Créez `packages/core/src/tools/computer-use/tool.ts` :

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

    // La phase 3 connecte la machine d'état d'amorçage ici. En attendant,
    // ceci appelle directement le binaire, ce qui fonctionne lorsqu'il
    // est déjà installé et que les permissions sont accordées.
    await runBootstrap(client, { signal, updateOutput });

    let mcpResult: CallToolResult;
    try {
      mcpResult = await client.callTool(this.upstreamName, this.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `L'outil Computer Use '${this.upstreamName}' a échoué : ${message}`,
        returnDisplay: `Erreur : ${message}`,
        error: { message },
      };
    }

    const text = mcpResult.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');

    if (mcpResult.isError) {
      return {
        llmContent: text || `L'outil '${this.upstreamName}' a renvoyé isError=true`,
        returnDisplay: text || 'Erreur',
        error: { message: text || 'l’outil a renvoyé une erreur' },
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
      qwenName, // displayName == name ; pas de branding MCP dans l'interface
      schema.description,
      Kind.Other,
      schema.parameterSchema,
      true, // isOutputMarkdown — beaucoup de résultats sont du texte style JSON ou des captures d'écran
      true, // canUpdateOutput — l'amorçage diffuse la progression
      true, // shouldDefer — n'apparaît que via ToolSearch
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

Remarque : le test fait référence à `runBootstrap` qui est implémenté dans la Phase 3. Pour l'instant, créez un stub `bootstrap.ts` pour que le test passe :

Créez `packages/core/src/tools/computer-use/bootstrap.ts` :

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
 * STUB : La phase 3 remplace ceci par la machine d'état complète
 * (confirmation d'installation → installation → demande de permission → guide → sondage).
 * Pour l'instant : suppose que le binaire est installé et les permissions accordées ;
 * démarre simplement le client si nécessaire.
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

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

Exécutez : `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Résultat attendu : PASS, 4 tests

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): wrapper ComputerUseTool + stub d'amorçage"
```

---

### Tâche 6 : Enregistrer les outils dans le ToolRegistry

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/index.ts`
- Modifier : `packages/core/src/config/config.ts`

- [ ] **Étape 1 : Créer l’assistant d’enregistrement**

Créez `packages/core/src/tools/computer-use/index.ts` :

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
 * Enregistre les 9 outils computer-use comme fabriques paresseuses
 * dans le registre. Chaque outil est différé (`shouldDefer=true`),
 * donc ils n'apparaissent que via une correspondance de mot-clé
 * ToolSearch. La première invocation déclenche la machine d'état
 * d'amorçage (confirmation d'installation → installation → flux de
 * permissions) avant de transférer au serveur MCP upstream.
 *
 * Ne doit être appelée que lorsque `Config.isComputerUseEnabled()`
 * est vrai.
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

- [ ] **Étape 2 : Intégrer dans Config.createToolRegistry**

Modifiez `packages/core/src/config/config.ts`. Trouvez le bloc existant qui enregistre conditionnellement les outils cron (autour de la ligne 3952) :

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

Juste en dessous du bloc cron (et avant le bloc monitor), ajoutez :

```ts
// Enregistre les outils computer-use sauf s'ils sont désactivés.
// Les 9 sont différés — ils n'apparaissent que via une correspondance
// de mot-clé ToolSearch (voir packages/core/src/tools/computer-use/).
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **Étape 3 : Ajouter un test d’enregistrement**

Ajoutez aux tests existants du registre d'outils OU créez `packages/core/src/tools/computer-use/registration.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('registerComputerUseTools', () => {
  it('enregistre une fabrique pour chacun des 9 outils upstream, préfixé par computer_use__', () => {
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

- [ ] **Étape 4 : Exécuter les tests + vérification de types**

Exécutez :

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

Résultat attendu : Tout PASS.

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): enregistrement des 9 outils différés lorsqu'activé"
```

---

### Tâche 7 : Smoke test manuel — les outils apparaissent et un appel nominal fonctionne

Il s'agit d'une validation non codée. Vérifie que les fondations fonctionnent avant d'ajouter l'expérience utilisateur d'amorçage.

- [ ] **Étape 1 : Pré-installer le binaire upstream (une fois, manuellement)**

Exécutez dans un terminal :

```bash
npx -y open-computer-use@latest --version
```

Sur macOS : exécutez également `npx -y open-computer-use@latest doctor` et accordez les permissions demandées. Cela contourne notre amorçage afin que nous puissions vérifier la couche de transport en isolation.

- [ ] **Étape 2 : Construire qwen-code**

Exécutez : `npm run build`
Résultat attendu : PASS.

- [ ] **Étape 3 : Lancer qwen-code et tester la découverte**

Démarrez qwen-code, puis demandez au modèle : _"Utilise l'outil ToolSearch avec la requête 'click computer use' pour trouver les outils d'automatisation de bureau disponibles."_

Résultat attendu : ToolSearch retourne 9 schémas `computer_use__*`.

- [ ] **Étape 4 : Tester un outil sans permission**

Demandez : _"Liste les applications de bureau en cours d'exécution en utilisant l'outil computer_use__list_apps."_

Résultat attendu : Le premier appel affiche "Démarrage de Computer Use..." pendant quelques secondes (ou plus si le cache npx est froid), puis retourne une liste des applications en cours. Les appels suivants dans la même session sont rapides.

- [ ] **Étape 5 : Pas de commit nécessaire ; c'est une validation smoke**

Si quelque chose échoue ici, ARRÊTEZ-VOUS et déboguez avant de passer à la Phase 3.

---

## Phase 3 — UX d'amorçage (confirmation d'installation + guide de permission)

Cette phase remplace le stub `runBootstrap` de la Tâche 5 par la machine d'état complète.

### Tâche 8 : Persistance de l'état d'installation

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/install-state.ts`
- Créer : `packages/core/src/tools/computer-use/install-state.test.ts`

Persisté dans `~/.qwen/computer-use/installed.json` :

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **Étape 1 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/install-state.test.ts` :

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

  it('retourne undefined quand aucun fichier d'état n'existe', async () => {
    expect(await loadInstallState(tmpHome)).toBeUndefined();
  });

  it('effectue un aller-retour de l'état', async () => {
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

  it('isPackageSpecApproved retourne false quand aucun état', async () => {
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(false);
  });

  it('isPackageSpecApproved retourne true sur correspondance exacte', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(true);
  });

  it('isPackageSpecApproved retourne false quand la version diffère', async () => {
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
- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Résultat attendu : ÉCHEC — module introuvable

- [ ] **Étape 3 : Implémenter le module**

Créez `packages/core/src/tools/computer-use/install-state.ts` :

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

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

Exécutez : `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Résultat attendu : RÉUSSI, 5 tests

- [ ] **Étape 5 : Valider**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### Tâche 9 : Détecteur d'erreurs de permission

**Fichiers :**

- Créer : `packages/core/src/tools/computer-use/permission-detector.ts`
- Créer : `packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/permission-detector.test.ts` :

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

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Résultat attendu : ÉCHEC — module introuvable

- [ ] **Étape 3 : Implémenter le détecteur**

Créez `packages/core/src/tools/computer-use/permission-detector.ts` :

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

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

Exécutez : `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Résultat attendu : RÉUSSI, 5 tests

- [ ] **Étape 5 : Valider**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### Tâche 10 : Machine à états bootstrap — flux UX complet

**Fichiers :**

- Modifier : `packages/core/src/tools/computer-use/bootstrap.ts` (remplacer le stub de la Tâche 5)
- Créer : `packages/core/src/tools/computer-use/bootstrap.test.ts`

La machine à états comprend trois sous-flux :

1. **Installation initiale** : si `isPackageSpecApproved` est faux, demander à l'utilisateur, installer, persister l'approbation.
2. **Lancement** : s'assurer que le client est démarré.
3. **Sonde de permissions + guide** (macOS uniquement) : si une erreur de permission apparaît, lancer `open-computer-use doctor`, interroger périodiquement jusqu'à l'octroi (max 10 min), réessayer.

Note : le mécanisme "poser une question à l'utilisateur en cours d'exécution" dans qwen-code utilise le framework de confirmation d'outils existant. **IMPLÉMENTEUR** : avant d'écrire l'implémentation de cette tâche, cherchez `shouldConfirmExecute` dans `packages/core/src/tools/` pour voir comment `shell.ts` / autres font la confirmation. Cette tâche suppose que ce mécanisme est disponible ; s'il ne l'est pas, utilisez `process.stderr.write` + lecture depuis `process.stdin` pour la confirmation d'installation (UX v0 acceptable).

- [ ] **Étape 1 : Étudier les motifs de confirmation**

Exécutez :

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

Lisez au moins un outil qui utilise le motif de confirmation (probablement `shell.ts`). Décidez : est-ce que `ToolInvocation` a une méthode `shouldConfirmExecute()` ou similaire ?

Si OUI : utilisez-la pour la confirmation d'installation.
Si NON : utilisez le fallback v0 (stderr + outil `ask_user_question` s'il est exposé, sinon lancez un code d'erreur spécifique que le modèle pourra réémettre après l'octroi utilisateur).

Documentez votre choix dans un commentaire de code en haut de `bootstrap.ts`.

- [ ] **Étape 2 : Écrire le test qui échoue**

Créez `packages/core/src/tools/computer-use/bootstrap.test.ts` :

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

- [ ] **Étape 3 : Exécuter le test pour vérifier qu'il échoue**

Exécutez : `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Résultat attendu : ÉCHEC — de nombreuses erreurs

- [ ] **Étape 4 : Implémenter la machine à états**

Remplacez `packages/core/src/tools/computer-use/bootstrap.ts` par :

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Machine à états du bootstrap de Computer Use.
 *
 * Lors de la première invocation de tout outil computer_use__* :
 *   1. Si pas encore approuvé : demander à l'utilisateur d'installer (une fois).
 *   2. Démarrer le client (npx lazy spawn, peut prendre ~60s la première fois).
 *   3. Sur macOS uniquement : sonder les permissions en appelant get_app_state sur
 *      Finder. Si une erreur de permission apparaît, lancer le doctor upstream
 *      (qui ouvre les paramètres système + fenêtre d'onboarding),
 *      puis interroger jusqu'à l'octroi des permissions ou délai de 10 min.
 *
 * IMPLÉMENTEUR : étape préalable 1 (Tâche 10, étape 1) — vérifier si
 * BaseDeclarativeTool de qwen-code expose un chemin `shouldConfirmExecute()`
 * depuis l'intérieur de `execute()`. Sinon, `promptInstallApproval`
 * utilise un fallback `process.stderr.write` + readline. La conception
 * par injection de dépendances ici permet de changer cette décision
 * sans toucher à la logique de la machine à états.
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

/** Résultat d'une sonde de permission. */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * Demander à l'utilisateur d'approuver l'installation du binaire upstream.
   * Retourne true si approuvé. L'implémentation peut utiliser le chemin
   * de confirmation d'outil de qwen-code ou un fallback stdin.
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * Lancer `open-computer-use doctor` (détaché). Le binaire gère
   * l'ouverture de la fenêtre des paramètres système lui-même.
   */
  spawnDoctor: () => void;
  /**
   * Sonder le serveur MCP upstream pour l'état des permissions en
   * émettant un appel d'outil léger. Retourne 'ok' en cas de succès
   * ou le type d'erreur de permission en cas d'échec.
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** Intervalle de scrutation pour le watcher de permissions. Par défaut 2000ms. */
  pollIntervalMs?: number;
  /** Délai d'attente total de scrutation. Par défaut 10 min. */
  pollTimeoutMs?: number;
}

/** Valeurs par défaut pour la production — instanciées paresseusement pour que les tests puissent les surcharger par appel. */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // fallback v0 : invite stderr + lecture stdin. Remplacer par
      // le chemin de confirmation standard de qwen-code une fois intégré.
      process.stderr.write(
        `\n[Computer Use] Installation initiale\n` +
          `  Paquet : ${spec}\n` +
          `  Ceci téléchargera ~50 Mo du registre npm la première fois.\n` +
          `  Computer Use peut cliquer, taper et lire vos applications de bureau.\n` +
          `  Sur macOS, vous serez guidé pour les permissions d'Accessibilité et d'enregistrement d'écran ensuite.\n` +
          `Continuer ? [o/N] `,
      );
      // IMPLÉMENTEUR : dans les sessions interactives réelles, remplacer par le
      // système de confirmation de qwen-code. Pour les contextes headless / SDK,
      // la valeur par défaut est de refuser — une adhésion explicite de l'utilisateur est requise.
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
      // Utiliser Finder comme une application macOS connue et toujours installée.
      // get_app_state touche à AccessibilitySnapshot qui est le premier
      // chemin qui lève permissionDenied.
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

  // Étape 1 : barrière d'approbation d'installation.
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use doit être installé (première utilisation).');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        `Installation de Computer Use refusée par l'utilisateur. Réinvoquez l'outil pour être invité à nouveau.`,
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // Étape 2 : lancement (idempotent).
  if (!client.isStarted()) {
    ctx.updateOutput?.('Démarrage de Computer Use...');
    await client.start();
  }

  // Étape 3 : sonde de permissions macOS + guide.
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' signifie qu'une erreur s'est produite qui n'est pas liée aux permissions.
    // Nous ne bloquons pas le bootstrap pour cela — laissez l'appel d'outil réel la faire remonter.
    return;
  }

  ctx.updateOutput?.(
    `Computer Use a besoin des permissions macOS (${probe}). ` +
      `Une fenêtre d'onboarding va s'ouvrir — veuillez accorder l'Accessibilité et l'enregistrement d'écran, puis cela continuera automatiquement.`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Bootstrap de Computer Use interrompu.');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `L'octroi des permissions de Computer Use a expiré après ${Math.round(pollTimeoutMs / 1000)}s. Réinvoquez l'outil pour réessayer.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`Attente des permissions... (${elapsedSec}s)`);
  }
}
```
- [ ] **Étape 5 : Exécuter le test pour vérifier qu'il réussit**

Exécuter : `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Résultat attendu : PASS, 7 tests

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### Tâche 11 : Connecter le véritable `promptInstallApproval` au système de confirmation de qwen-code

**Fichiers :**

- Modifier : `packages/core/src/tools/computer-use/bootstrap.ts`
- Possiblement : `packages/core/src/tools/computer-use/tool.ts`

C'est la tâche avec le périmètre le plus variable. **PERSONNE CHARGÉE DE L'IMPLÉMENTATION** : lisez le résultat de l'investigation de la tâche 10 étape 1 et câblez en conséquence. Deux scénarios :

**Scénario A** — `BaseToolInvocation` supporte `shouldConfirmExecute()` :

- Surchargez `shouldConfirmExecute()` dans `ComputerUseInvocation` pour renvoyer la payload de confirmation d'installation lorsque le package n'est pas encore approuvé.
- Le framework affichera l'interface de confirmation ; après approbation, `execute()` se poursuit.
- `bootstrap.ts` ne gère alors que le chemin post-confirmation (écriture de l'état, démarrage, sondage des permissions).

**Scénario B** — pas de chemin de confirmation dans l'exécution :

- Conservez la v0 stderr+stdin de la tâche 10. Documentez de façon explicite dans le README et SKILL.md.
- Créez une tâche de suivi pour ajouter un vrai chemin de confirmation (PR séparé).

- [ ] **Étape 1 : Implémenter le scénario choisi**

(Le code concret dépend de l'investigation ; les détails sont laissés à la personne chargée de l'implémentation.)

- [ ] **Étape 2 : Smoke test manuel**

Effacez l'état d'installation :

```bash
rm -rf ~/.qwen/computer-use
```

Lancez qwen-code et posez une question relative à computer-use. Confirmez que l'invite d'installation apparaît dans l'UX choisie (boîte de dialogue de confirmation ou stderr) et que son approbation persiste correctement l'état.

- [ ] **Étape 3 : Commit**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### Tâche 12 : Smoke test manuel — flux complet de première utilisation

C'est une porte non liée au code.

- [ ] **Étape 1 : Vider les caches**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS : révoquer les permissions
# Réglages Système → Confidentialité et Sécurité → Accessibilité / Enregistrement d'écran
# retirer "Open Computer Use.app"
```

- [ ] **Étape 2 : Build + exécution**

```bash
npm run build
# lancez qwen-code, posez une question de type computer-use
```

- [ ] **Étape 3 : Vérifier le flux complet**

Séquence attendue :

1. L'invite d'installation apparaît.
2. Après approbation, la progression du téléchargement est diffusée via `updateOutput`.
3. L'avertissement de permission apparaît, la fenêtre doctor s'ouvre.
4. Après avoir accordé les permissions dans les Réglages Système, l'appel de l'outil reprend automatiquement.
5. Le résultat est renvoyé.

Si une étape échoue, capturez l'erreur et arrêtez-vous. Itérez.

- [ ] **Étape 4 : Pas de commit ; c'est une porte**

---

## Phase 4 — Outillage / Maintenance

### Tâche 13 : Script de synchronisation des schémas

**Fichiers :**

- Créer : `scripts/sync-computer-use-schemas.ts`

S'exécute dans le cadre de la préparation de la version de qwen-code. Lance `npx -y open-computer-use@<pin> mcp`, envoie `tools/list`, régénère `schemas.ts`.

- [ ] **Étape 1 : Créer le script**

Créez `scripts/sync-computer-use-schemas.ts` :

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

- [ ] **Étape 2 : L'exécuter une fois manuellement pour vérifier**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

Résultat attendu : schemas.ts est réécrit ; `npm test -- packages/core/src/tools/computer-use/schemas.test.ts` passe toujours (ou échoue uniquement sur les tests qui vérifient un contenu saisi manuellement — ajustez ces tests si les descriptions amont ont changé).

- [ ] **Étape 3 : Commit**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## Checklist d'auto-revue (après avoir rédigé toutes les tâches)

- [ ] Chaque étape contient soit : un bloc de code, une commande exacte, ou une note IMPLEMENTER clairement déléguable avec justification.
- [ ] Les 9 noms d'outils utilisent le préfixe `computer_use__` de manière cohérente entre les schémas, l'adaptateur d'outil et l'enregistrement.
- [ ] Aucune référence à MCP / mcp__ / DiscoveredMCPTool ne s'infiltre dans les chaînes destinées aux utilisateurs.
- [ ] La machine d'état du bootstrap comporte des timeouts explicites (pas de sondages infinis).
- [ ] `enableComputerUse` est par défaut à `true` conformément à la décision de l'utilisateur.
- [ ] Les tests couvrent : l'intégrité des schémas, le préfixage des noms, le report, le cycle de vie du client, la persistance de l'état d'installation, la détection des permissions, toutes les transitions de la machine d'état du bootstrap.
- [ ] Les portes de smoke test manuel (Tâche 7, Tâche 12) sont explicites — pas de déclarations silencieuses du style "ça marche".

---

## Hors périmètre (reporté à des PR de suivi)

- Timeout d'inactivité pour le processus serveur MCP (économie de ressources ; v0 le maintient en vie jusqu'à la sortie de qwen-code).
- Télémétrie sur les échecs de bootstrap (échec réseau vs gatekeeper vs timeouts de permissions).
- Chemin d'installation hors ligne / support de tarball en cache.
- Sondage de capacité avant révélation (actuellement l'échec se manifeste lors du premier appel).
- PR amont pour un `errorKind` typé sur `permissionDenied` (reporté par l'utilisateur).
- Redémarrage du serveur MCP après l'octroi des permissions (l'utilisateur veut d'abord un test réel pour décider si nécessaire).
- Contrôle granulaire des permissions par outil (par exemple, autoriser `list_apps` / `get_app_state` en lecture seule sans confirmer chaque appel).

---

## Transmission de l'exécution

Plan enregistré dans `docs/superpowers/plans/2026-05-28-computer-use-built-in.md`.

Deux options d'exécution :

1. **Piloté par sous-agent (recommandé)** — envoyer un sous-agent frais par tâche, review en deux étapes entre les tâches, itération rapide.
2. **Exécution en ligne** — exécuter les tâches dans cette session avec des points de contrôle pour la review.

Quelle approche ?