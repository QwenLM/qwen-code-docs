# Document de conception technique Phase 1 : Reconstruction de l'infrastructure

## 1. Objectifs et contraintes de conception

### 1.1 Objectifs

- Établir un modèle unifié de métadonnées de commandes, couvrant quatre dimensions : source (source), type d'exécution (commandType), capacités de mode (supportedModes), visibilité (userInvocable / modelInvocable)
- Remplacer la liste blanche codée en dur dans `non-interactive` / `acp` par un filtrage basé sur les capacités
- Fournir des interfaces stables de bas niveau pour les extensions de capacités des phases 2/3

### 1.2 Contraintes strictes

- **Zéro changement de comportement** : l'ensemble des commandes disponibles dans les modes non-interactive et acp reste inchangé (exception : correction du bug MCP_PROMPT mal intercepté, qui est un correctif de bogue)
- **Rétrocompatibilité** : tous les nouveaux champs de l'interface `SlashCommand` sont optionnels ou ont des valeurs par défaut raisonnables ; aucun code de commande existant ne nécessite de modification immédiate
- **Pas de nouveau moteur d'exécution** : ne pas créer de nouveaux frameworks d'exécution comme ModeAdapter / CommandExecutor, seulement étendre l'existentiel CommandService et la logique de filtrage
- **Ne pas modifier les capacités existantes des commandes** : n'ajouter aucune sous-commande `local` à aucune commande, ne modifier aucune implémentation d'action

---

## 2. Nouvelles définitions de types

### 2.1 Emplacement du fichier

Toutes les nouvelles définitions de types se trouvent dans `packages/cli/src/ui/commands/types.ts`, dans le même fichier que l'interface `SlashCommand` existante.

### 2.2 `ExecutionMode`

```typescript
/**
 * Énumération des modes d'exécution.
 * - interactive : Mode React/Ink UI (interaction terminal)
 * - non_interactive : Mode CLI sans interaction (sortie texte/JSON)
 * - acp : Mode d'intégration ACP/Zed
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Énumération de la source des commandes, utilisée pour le regroupement de l'aide,
 * le badge de complétion, les commandes disponibles ACP.
 *
 * Différence avec CommandKind :
 * - CommandKind est une classification interne du chargeur (4 types), affecte la logique de chargement
 * - CommandSource est une classification orientée utilisateur (9 types), affecte l'affichage et le modèle mental
 *
 * Ils peuvent se chevaucher, mais ont des responsabilités différentes, ne pas fusionner.
 */
export type CommandSource =
  | 'builtin-command' // Commande intégrée (BuiltinCommandLoader)
  | 'bundled-skill' // Skill distribué avec le package (BundledSkillLoader)
  | 'skill-dir-command' // Commande fichier depuis .qwen/commands/ utilisateur/projet (FileCommandLoader, non plugin)
  | 'plugin-command' // Commande fournie par un plugin (FileCommandLoader, extensionName non vide)
  | 'mcp-prompt'; // Prompt fourni par un serveur MCP (McpPromptLoader)
// Sources suivantes réservées, Phase 1 n'implémente pas de chargeur correspondant, mais le schéma est défini à l'avance :
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * Type d'exécution de la commande, décrit "comment la commande s'exécute".
 *
 * - prompt : produit un submit_prompt, soumet le contenu au modèle. Convient pour skill, file command, MCP prompt.
 *   Modes par défaut supportedModes : tous les modes, modelInvocable par défaut : true.
 *
 * - local : exécute une logique localement, ne dépend pas de React/Ink UI. Peut retourner message, stream_messages,
 *   submit_prompt, tool, etc. Convient pour les commandes built-in de requête, configuration, état.
 *   Modes par défaut supportedModes : ['interactive'], nécessite une déclaration explicite de supportedModes pour être ouverte aux autres modes.
 *   Cela correspond à la sémantique de supportsNonInteractive: true de Claude Code — le support non interactif nécessite une déclaration explicite, pas une inférence automatique.
 *
 * - local-jsx : commande qui dépend de React/Ink UI (ouvrir un dialog, rendre des composants JSX, etc.).
 *   Modes par défaut supportedModes : uniquement ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Extension de l'interface `SlashCommand`

Ajout de nouveaux champs à l'interface existante, **tous optionnels** pour garantir la rétrocompatibilité :

```typescript
export interface SlashCommand {
  // ── Champs existants (inchangés) ──────────────────────────────────────────────
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

  // ── Nouveautés Phase 1 : source et type d'exécution ──────────────────────────────────────
  /**
   * Source de la commande, utilisée pour le regroupement de l'aide, le badge de complétion,
   * l'affichage des commandes disponibles ACP.
   * Rempli par chaque chargeur, pas déclaré par la commande elle-même.
   * Lorsque CommandKind sera abandonné, source deviendra l'identifiant unique de source.
   */
  source?: CommandSource;

  /**
   * Étiquette de source destinée à l'utilisateur.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Rempli par chaque chargeur, peut être surchargé par la commande elle-même.
   */
  sourceLabel?: string;

  /**
   * Type d'exécution de la commande.
   * - Les chargeurs remplissent une valeur par défaut (prompt/local-jsx)
   * - Les commandes built-in sont déclarées par chaque fichier de commande (local ou local-jsx)
   * La stratégie par défaut en l'absence de déclaration est décrite dans getEffectiveCommandType().
   */
  commandType?: CommandType;

  // ── Nouveautés Phase 1 : capacités de mode ──────────────────────────────────────────
  /**
   * Modes d'exécution dans lesquels cette commande est disponible.
   * En l'absence de déclaration, la valeur par défaut est déduite en fonction de commandType
   * (voir getEffectiveSupportedModes()).
   * La déclaration explicite prime sur la valeur déduite.
   */
  supportedModes?: ExecutionMode[];

  // ── Nouveautés Phase 1 : visibilité ──────────────────────────────────────────────
  /**
   * L'utilisateur peut-il invoquer cette commande via un slash command ?
   * Par défaut true (presque toutes les commandes sont userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Le modèle peut-il invoquer cette commande via un tool call ?
   * Par défaut false. Les commandes de type prompt (skill, file command, MCP prompt) doivent être mises à true.
   * Les commandes built-in ne sont pas autorisées à être invoquées par le modèle (toujours false).
   */
  modelInvocable?: boolean;

  // ── Réservé Phase 3 : métadonnées d'expérience (Phase 1 définit seulement, n'utilise pas)──────────────────
  /**
   * Indice d'argument, affiché après le nom de la commande dans le menu de complétion.
   * Exemple : "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Explication à destination du modèle pour savoir quand invoquer cette commande.
   * Sera injectée dans la description des commandes modelInvocable.
   */
  whenToUse?: string;

  /**
   * Exemples d'utilisation, pour l'affichage dans l'aide et la complétion.
   */
  examples?: string[];
}
```

---

## 3. Spécifications de remplissage des champs par chargeur

### 3.1 Principes de remplissage

- `source` et `sourceLabel` sont remplis par le chargeur lors de la construction de la `SlashCommand` ; la commande elle-même ne les déclare pas
- `commandType` : le chargeur remplit une valeur par défaut ; les commandes built-in sont déclarées par le fichier de commande lui-même
- `supportedModes` : déduit via `getEffectiveSupportedModes()`, pas besoin de remplissage explicite (sauf pour surcharger les valeurs par défaut)
- `modelInvocable` : rempli par le chargeur ; les commandes built-in sont toujours `false`, les commandes de type prompt sont `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// Ne remplit pas source/sourceLabel/commandType — déclaré par chaque fichier de commande
// car le commandType des commandes built-in est local ou local-jsx, nécessite un marquage individuel

// Injecte source et sourceLabel :
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // les commandes built-in ne sont pas autorisées à être invoquées par le modèle
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
// Dans createSlashCommandFromDefinition :
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source déterminée selon extensionName :
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // les commandes plugin ne sont pas autorisées pour le moment, les commandes utilisateur/projet oui
  action: async (...) => { ... },
};
```

> **Note** : Les commandes de plugin (plugin-command) ne sont pas marquées `modelInvocable` pour l'instant, afin d'éviter des risques de sécurité. Les phases ultérieures pourront les ouvrir sur demande, contrôlé par la configuration utilisateur.

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
  // ... autres champs existants
};
```

---

## 4. Spécifications de déclaration de `commandType` pour les commandes built-in

### 4.1 Critères de classification

| commandType | Critères                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | L'action utilise uniquement `ui.addItem` (type texte), retourne `message` / `stream_messages` / `submit_prompt` / `tool`, ne dépend pas du rendu React                     |
| `local-jsx` | L'action retourne `dialog`, ou l'action appelle `ui.addItem` avec un type complexe contenant du JSX (comme `HistoryItemHelp`, `HistoryItemStats`), ou dépend de `confirm_action` / `load_history` / `quit` |

> **Attention** : `ui.addItem(type message/error/info)` est `local` ; `ui.addItem(types complexes UI comme help/stats/tools/about)` est `local-jsx`.

### 4.2 Tableau de classification des commandes built-in

**Classe `local`** (déclare `commandType: 'local'`, `supportedModes` déduit à tous les modes) :

| Fichier de commande     | Nom de commande | Description                                            |
| ----------------------- | --------------- | ------------------------------------------------------ |
| `btwCommand.ts`         | `btw`           | Retourne `submit_prompt` ou `stream_messages`          |
| `bugCommand.ts`         | `bug`           | Retourne `submit_prompt` ou `stream_messages`          |
| `compressCommand.ts`    | `compress`      | Déjà adapté executionMode, retourne `message`/`submit_prompt` |
| `contextCommand.ts`     | `context`       | Retourne `message` (contient du rendu UI mais texte remplaçable) |
| `exportCommand.ts`      | `export`        | I/O fichier, retourne `message`                        |
| `initCommand.ts`        | `init`          | Retourne `submit_prompt`/`message`/`confirm_action`    |
| `memoryCommand.ts`      | `memory`        | Sous-commandes retournent `message` (I/O fichier)      |
| `planCommand.ts`        | `plan`          | Retourne `submit_prompt`                               |
| `summaryCommand.ts`     | `summary`       | Déjà adapté executionMode, retourne `submit_prompt`/`message` |
| `insightCommand.ts`     | `insight`       | Retourne `stream_messages`                             |

> **Attention** : Bien que `contextCommand` et `insightCommand` retournent actuellement des appels `addItem`, leur contenu est textuel, ils font partie de `local`.

**Classe `local-jsx`** (déclare `commandType: 'local-jsx'`, `supportedModes` déduit à `['interactive']`) :

| Fichier de commande            | Nom de commande     | Raison pour laquelle headless n'est pas possible                     |
| ------------------------------ | ------------------- | ------------------------------------------------------------ |
| `aboutCommand.ts`              | `about`             | `addItem(HistoryItemAbout)` — composant UI complexe          |
| `agentsCommand.ts`             | `agents`            | `dialog: subagent_create/subagent_list`                      |
| `approvalModeCommand.ts`       | `approval-mode`     | `dialog: approval-mode`                                      |
| `arenaCommand.ts`              | `arena`             | `dialog: arena_*`                                            |
| `authCommand.ts`               | `auth`              | `dialog: auth`                                               |
| `clearCommand.ts`              | `clear`             | `ui.clear()` opère directement sur le terminal               |
| `copyCommand.ts`               | `copy`              | Opération de presse-papiers, pas de chemin headless           |
| `directoryCommand.tsx`         | `directory`         | Composant JSX                                                |
| `docsCommand.ts`               | `docs`              | Ouvre le navigateur                                          |
| `editorCommand.ts`             | `editor`            | `dialog: editor`                                             |
| `extensionsCommand.ts`         | `extensions`        | `dialog: extensions_manage`                                  |
| `helpCommand.ts`               | `help`              | `addItem(HistoryItemHelp)` — UI d'aide complexe              |
| `hooksCommand.ts`              | `hooks`             | `dialog: hooks`                                              |
| `ideCommand.ts`                | `ide`               | Détection et interaction avec le processus IDE               |
| `languageCommand.ts`           | `language`          | `dialog` + `reloadCommands`                                  |
| `mcpCommand.ts`                | `mcp`               | `dialog: mcp`                                                |
| `modelCommand.ts`              | `model`             | `dialog: model/fast-model`                                   |
| `permissionsCommand.ts`        | `permissions`       | `dialog: permissions`                                        |
| `quitCommand.ts`               | `quit`              | Type de résultat `quit`                                      |
| `restoreCommand.ts`            | `restore`           | Type de résultat `load_history`                              |
| `resumeCommand.ts`             | `resume`            | `dialog: resume`                                             |
| `settingsCommand.ts`           | `settings`          | `dialog: settings`                                           |
| `setupGithubCommand.ts`        | `setup-github`      | `confirm_shell_commands` + opérations interactives           |
| `skillsCommand.ts`             | `skills`            | `addItem(HistoryItemSkillsList)` — UI complexe               |
| `statsCommand.ts`              | `stats`             | `addItem(HistoryItemStats)` — UI complexe                    |
| `statuslineCommand.ts`         | `statusline`        | Configuration d'état UI                                      |
| `terminalSetupCommand.ts`      | `terminal-setup`    | Assistant de configuration du terminal                       |
| `themeCommand.ts`              | `theme`             | `dialog: theme`                                              |
| `toolsCommand.ts`              | `tools`             | `addItem(HistoryItemTools)` — UI complexe                    |
| `trustCommand.ts`              | `trust`             | `dialog: trust`                                              |
| `vimCommand.ts`                | `vim`               | `toggleVimEnabled()` — état UI                               |

---

## 5. Règles d'inférence de `getEffectiveSupportedModes`

Cette fonction est le cœur de la logique de Phase 1, remplace l'ancienne liste blanche et sera appelée par `filterCommandsForMode`.

```typescript
/**
 * Obtient la liste réelle des modes supportés par une commande.
 *
 * Priorité d'inférence (de la plus haute à la plus basse) :
 * 1. supportedModes déclaré explicitement par la commande (priorité la plus haute)
 * 2. Inférence basée sur commandType
 * 3. Repli basé sur CommandKind (rétrocompatibilité)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Priorité 1 : déclaration explicite
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Priorité 2 : inférence basée sur commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // Les commandes de type prompt n'ont pas de dépendance UI, disponibles dans tous les modes par nature
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // Par défaut conservateur pour le type local : seulement interactive.
        // Les commandes nécessitant un support non interactif doivent déclarer explicitement supportedModes
        // (correspond à supportsNonInteractive: true de Claude Code).
        // Phase 2 les validera une par une et les débloquera, pour éviter qu'une commande non adaptée
        // ne soit exposée accidentellement à un appelant headless.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Priorité 3 : repli (basé sur CommandKind, rétrocompatibilité avec l'ancien code)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Commandes built-in sans commandType déclaré : par défaut conservateur (interactive only)
      // Cette branche ne devrait plus être atteinte après la fin de Phase 1 (toutes les built-in auront un commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // L'action de ces trois types de commandes n'a pas de dépendance UI par nature,
      // et le comportement historique était qu'elles sont disponibles dans tous les modes
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Filtre les commandes adaptées au mode actuel selon supportedModes.
 * Remplace l'ancienne fonction filterCommandsForNonInteractive.
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

## 6. Extension de l'interface `CommandService`

Deux nouvelles méthodes sont ajoutées dans `packages/cli/src/services/CommandService.ts` :

```typescript
export class CommandService {
  // ── Méthodes existantes (inchangées)────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Nouvelles méthodes Phase 1 ──────────────────────────────────────────────────

  /**
   * Retourne la liste des commandes disponibles dans le mode d'exécution spécifié.
   * Remplace l'ancienne combinaison de liste blanche + filterCommandsForNonInteractive.
   *
   * @param mode Mode d'exécution cible
   * @returns Commandes adaptées à ce mode (sans les commandes cachées)
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * Retourne toutes les commandes dont modelInvocable est true.
   * SkillTool consommera cette méthode en Phase 2 ; Phase 1 ne fournit que l'interface.
   *
   * @returns Commandes invocables par le modèle
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Note** : `getEffectiveSupportedModes` et `filterCommandsForMode` doivent être utilisées comme fonctions utilitaires internes à `CommandService`, ou extraites dans un fichier dédié `packages/cli/src/services/commandUtils.ts` et exportées pour faciliter les tests et la réutilisation.

---

## 7. Refactorisation de `nonInteractiveCliCommands.ts`

### 7.1 Contenu à supprimer

```typescript
// ❌ À supprimer
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ À supprimer
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Contenu à ajouter

```typescript
// ✅ À ajouter (ou importer depuis commandUtils)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Changement de signature de `handleSlashCommand`

```typescript
// ❌ Ancienne signature
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ Nouvelle signature (suppression de allowedBuiltinCommandNames)
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Changement d'implémentation interne

```typescript
// Ancien :
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// Nouveau :
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 Changement de signature de `getAvailableCommands`

```typescript
// ❌ Ancienne signature
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ Nouvelle signature
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> Le nouveau paramètre `mode` remplace l'ancien paramètre liste blanche ; la session ACP peut spécifier explicitement `'acp'`, et l'appel non-interactive spécifie `'non_interactive'`.

---

## 8. Changements d'appels dans `Session.ts` (ACP)

```typescript
// ❌ Ancien appel
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // pas de transmission, utilise la liste blanche par défaut
);

// ✅ Nouvel appel (pas de changement, le paramètre par défaut qui n'existe plus est supprimé)
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ Ancien appel
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ Nouvel appel (mode spécifié explicitement)
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Récapitulatif des modifications de fichiers

### 9.1 Fichiers modifiés

| Fichier                                                                  | Contenu de la modification                                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/commands/types.ts`                                  | Ajout des types `ExecutionMode`, `CommandSource`, `CommandType` ; extension de l'interface `SlashCommand`                  |
| `packages/cli/src/services/CommandService.ts`                            | Ajout des méthodes `getCommandsForMode()`, `getModelInvocableCommands()`                                                   |
| `packages/cli/src/nonInteractiveCliCommands.ts`                          | Suppression des constantes de liste blanche et de l'ancienne fonction de filtrage ; mise à jour de la signature de deux fonctions exportées ; introduction de `filterCommandsForMode` |
| `packages/cli/src/acp-integration/session/Session.ts`                    | Mise à jour des appels à `handleSlashCommand` et `getAvailableCommands`                                                    |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                      | Injection de `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` lors de la construction des commandes |
| `packages/cli/src/services/BundledSkillLoader.ts`                        | Injection de `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                                    |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts`  | Injection de `source`, `commandType: 'prompt'`, `modelInvocable` (selon extensionName)                                     |
| `packages/cli/src/services/McpPromptLoader.ts`                           | Injection de `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                                       |
| **Fichiers de commandes built-in (10 local + 27 local-jsx)**             | Déclaration de `commandType: 'local'` ou `commandType: 'local-jsx'`                                                        |

### 9.2 Fichiers ajoutés

| Fichier                                      | Contenu                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts`  | Fonctions utilitaires `getEffectiveSupportedModes()`, `filterCommandsForMode()` et leurs exports |

### 9.3 Fichiers inchangés

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` inchangé)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (chemin interactive inchangé)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (stub UI inchangé)
- Toutes les implémentations `action` des commandes (Phase 1 ne modifie aucun comportement de commande)

---

## 10. Analyse de l'impact sur le comportement

### 10.1 Résumé des changements

| Scénario                                           | Ancien comportement          | Nouveau comportement                                                  | Nature        |
| -------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- | ------------- |
| Execution `/init` en non-interactive               | ✅ Autorisé (liste blanche)  | ✅ Autorisé (`commandType: local`)                                    | Aucun changement |
| Execution `/summary` en non-interactive            | ✅ Autorisé                  | ✅ Autorisé                                                           | Aucun changement |
| Execution `/compress` en non-interactive           | ✅ Autorisé                  | ✅ Autorisé                                                           | Aucun changement |
| Execution `/btw` en non-interactive                | ✅ Autorisé                  | ✅ Autorisé                                                           | Aucun changement |
| Execution `/bug` en non-interactive                | ✅ Autorisé                  | ✅ Autorisé                                                           | Aucun changement |
| Execution `/context` en non-interactive            | ✅ Autorisé                  | ✅ Autorisé                                                           | Aucun changement |
| Execution `/model` en non-interactive              | ❌ Non supporté              | ❌ Non supporté (`commandType: local-jsx`)                            | Aucun changement |
| Execution d'une file command en non-interactive    | ✅ Autorisé (CommandKind.FILE) | ✅ Autorisé (`commandType: prompt`)                                  | Aucun changement |
| Execution d'un bundled skill en non-interactive    | ✅ Autorisé (CommandKind.SKILL) | ✅ Autorisé (`commandType: prompt`)                                 | Aucun changement |
| Execution d'un MCP prompt en non-interactive       | ❌ Intercepté par CommandKind | ✅ Autorisé (`commandType: prompt`)                                  | **Correction de bug** |
| Execution `/export` en non-interactive             | ❌ Pas dans la liste blanche | ❌ Non autorisé (`commandType: local`, par défaut interactive only)  | Aucun changement |
| Execution `/memory` en non-interactive             | ❌ Pas dans la liste blanche | ❌ Non autorisé (`commandType: local`, par défaut interactive only)  | Aucun changement |
| Execution `/plan` en non-interactive               | ❌ Pas dans la liste blanche | ❌ Non autorisé (`commandType: local`, par défaut interactive only)  | Aucun changement |
> **À propos de la stratégie conservatrice par défaut pour les commandes `local`** : le `supportedModes` par défaut de `commandType: 'local'` est `['interactive']`, ce qui est cohérent avec la conception de Claude Code — les commandes de type `local` doivent déclarer explicitement `supportsNonInteractive: true` pour fonctionner en mode non interactif. Les 6 commandes de la liste blanche de la Phase 1 (`init`, `summary`, `compress`, `btw`, `bug`, `context`) remplacent l’effet de la liste blanche en déclarant explicitement `supportedModes: ['interactive', 'non_interactive', 'acp']`. Les commandes à étendre dans la Phase 2 (comme `/export`, `/memory`, `/plan`) seront déverrouillées une par une après avoir vérifié que leur implémentation de l’action est compatible avec le mode headless.

---

## 10.2 Commandes à différence de mode en Phase 2 : double enregistrement

Pour les commandes de la Phase 2 qui nécessitent « une UI en mode interactif, une sortie textuelle en mode non interactif » (comme `/model`), il convient d’adopter le **double enregistrement**, plutôt qu’une branche à l’intérieur de l’`action` d’une seule commande.

C’est le modèle standard de Claude Code, illustré par `/context` (voir `src/commands/context/index.ts`) : deux objets `Command` de même nom, l’un `local-jsx` uniquement interactif, l’autre `local` uniquement non interactif, rendus mutuellement exclusifs via `isEnabled()`.

Qwen Code adoptera en Phase 2 une approche équivalente, en remplaçant `isEnabled()` par `supportedModes` pour assurer l’exclusion mutuelle :

```typescript
// ① Version interactive : local-jsx, seulement interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // limitation explicite
  // action: ouvre une boîte de dialogue pour sélectionner le modèle
};

// ② Version non interactive / ACP : local, explicitement ouverte aux appelants headless
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // limitation explicite
  // action: lit/définit le modèle, renvoie un message (texte brut)
};
```

Les deux objets ont le même nom, `supportedModes` sont mutuellement exclusifs, et `filterCommandsForMode` sélectionne automatiquement la bonne version. Comparé à l’exclusion mutuelle par `isEnabled()` dans Claude Code, le filtrage par `supportedModes` est plus explicite, plus facile à tester et ne nécessite pas de détection d’environnement à l’exécution.

**La Phase 1 n’implémente aucune commande à double enregistrement** ; ce modèle est réservé ici comme spécification de mise en œuvre pour la Phase 2.

---

## 11. Stratégie de test

### 11.1 Tests des nouvelles fonctions utilitaires

Dans `packages/cli/src/services/commandUtils.test.ts` (nouveau fichier) :

```typescript
describe('getEffectiveSupportedModes', () => {
  it('supportedModes explicite prime sur l’inférence de commandType', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // restriction explicite
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local infère tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx infère interactive seulement', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt infère tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType non déclaré et CommandKind.BUILT_IN, fallback à interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType non déclaré et CommandKind.FILE, fallback à tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType non déclaré et CommandKind.MCP_PROMPT, fallback à tous les modes (correction de la limitation précédente)', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('filtre correctement les commandes en mode non_interactive', () => { ... });
  it('filtre correctement les commandes en mode acp', () => { ... });
  it('ne filtre pas les commandes cachées (filterCommandsForMode ne traite pas hidden, c’est CommandService qui le fait)', () => { ... });
});
```

### 11.2 Mise à jour de `nonInteractiveCliCommands.test.ts`

- Supprimer toutes les références à `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Supprimer les cas de test pour le paramètre `allowedBuiltinCommandNames`
- Ajouter : vérifier que les commandes de type `local` passent le filtre en mode non interactif
- Ajouter : vérifier que les commandes de type `local-jsx` sont filtrées en mode non interactif
- Conserver : vérifier que les commandes de fichier / skill passent le filtre en mode non interactif

### 11.3 Mise à jour de `CommandService.test.ts`

- Ajouter des cas de test pour `getCommandsForMode`
- Ajouter des cas de test pour `getModelInvocableCommands`

### 11.4 Tests de chaque chargeur

- `BuiltinCommandLoader.test.ts` : vérifier que toutes les commandes ont `source: 'builtin-command'`
- `BundledSkillLoader.test.ts` : vérifier `source: 'bundled-skill'` et `modelInvocable: true`
- `FileCommandLoader.test.ts` : vérifier que les commandes utilisateur ont `source: 'skill-dir-command'`, les commandes de plugin ont `source: 'plugin-command'`
- `McpPromptLoader.test.ts` : vérifier `source: 'mcp-prompt'` et `modelInvocable: true`

---

## 12. Ordre de mise en œuvre

Il est recommandé de suivre l’ordre ci-dessous, chaque étape pouvant être commitée et revue indépendamment :

**Étape 1** (~30 min) : modifier `types.ts`, ajouter les nouveaux champs `ExecutionMode`, `CommandSource`, `CommandType` et `SlashCommand`
→ Changement de types uniquement, vérification par la compilation TypeScript

**Étape 2** (~1 h) : créer `commandUtils.ts`, implémenter `getEffectiveSupportedModes` et `filterCommandsForMode`, et créer simultanément `commandUtils.test.ts`
→ Tests unitaires couvrant la logique centrale

**Étape 3** (~1 h) : refactoriser `nonInteractiveCliCommands.ts`, supprimer la liste blanche, introduire `filterCommandsForMode`, mettre à jour la signature de la fonction
→ Comportement équivalent (stratégie conservatrice Phase 1 : les commandes de type `local` écrivent explicitement `supportedModes: ['interactive']`)

**Étape 4** (~30 min) : mettre à jour `CommandService.ts`, ajouter les deux nouvelles méthodes

**Étape 5** (~2 h) : ajouter la déclaration `commandType` à tous les fichiers de commandes intégrées
→ Vérifier un par un l’exactitude de la classification

**Étape 6** (~1,5 h) : mettre à jour tous les chargeurs, injecter `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Étape 7** (~30 min) : mettre à jour la signature d’appel dans `Session.ts`

**Étape 8** (~1 h) : exécuter tous les tests, corriger les échecs, mettre à jour les snapshots

**Étape 9** (~30 min) : auto‑vérification CR : confirmer que la liste blanche est entièrement supprimée, sans appel restant

---

## 13. Checklist de validation

- [ ] La compilation TypeScript est sans erreur (`npm run typecheck`)
- [ ] `npm run lint` n’ajoute aucune nouvelle erreur de lint
- [ ] Tous les tests existants passent (`cd packages/cli && npx vitest run`)
- [ ] Les nouveaux tests de `commandUtils.test.ts` passent tous
- [ ] `getEffectiveSupportedModes` couvre les 7 cas
- [ ] `filterCommandsForMode` couvre les trois modes interactive / non_interactive / acp
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` n’est référencé nulle part dans la base de code (vérification par `grep`)
- [ ] La fonction `filterCommandsForNonInteractive` n’est référencée nulle part dans la base de code
- [ ] Toutes les commandes intégrées ont un champ `commandType`
- [ ] Toutes les commandes produites par les chargeurs ont les champs `source` et `sourceLabel`
- [ ] Les commandes produites par `BundledSkillLoader` / `FileCommandLoader` (commandes utilisateur) / `McpPromptLoader` ont `modelInvocable: true`
- [ ] Les commandes produites par `BuiltinCommandLoader` ont `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` renvoie un ensemble de commandes équivalent à celui d’avant le refactoring
- [ ] Les commandes MCP prompt ne sont plus bloquées par erreur en mode non interactif