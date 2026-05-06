# Document de conception technique Phase 1 : Reconstruction de l'infrastructure

## 1. Objectifs et contraintes de conception

### 1.1 Objectifs

- Établir un modèle unifié de métadonnées de commandes, couvrant quatre dimensions : source, type d'exécution (`commandType`), capacités de mode (`supportedModes`) et visibilité (`userInvocable` / `modelInvocable`)
- Remplacer les listes blanches codées en dur dans `non-interactive`/`acp` par un filtrage basé sur les capacités (`capability-based`)
- Fournir une interface sous-jacente stable pour l'extension des capacités dans les phases 2 et 3

### 1.2 Contraintes strictes

- **Aucun changement de comportement** : l'ensemble des commandes disponibles existantes dans les modes `non-interactive` et `acp` reste inchangé (exception : correction du bug où `MCP_PROMPT` était intercepté par erreur)
- **Compatibilité descendante** : les nouveaux champs de l'interface `SlashCommand` sont tous optionnels ou possèdent des valeurs par défaut raisonnables ; le code des commandes existantes ne nécessite aucune modification immédiate
- **Pas de nouveaux exécuteurs** : ne pas créer de nouvelle architecture d'exécution (ex. `ModeAdapter` / `CommandExecutor`), uniquement étendre `CommandService` et la logique de filtrage existantes
- **Ne pas modifier les capacités des commandes existantes** : ne pas ajouter de sous-commandes `local` à aucune commande, ne pas modifier l'implémentation `action` d'aucune commande

---

## 2. Nouvelles définitions de types

### 2.1 Emplacement des fichiers

Toutes les nouvelles définitions de types se trouvent dans `packages/cli/src/ui/commands/types.ts`, dans le même fichier que l'interface `SlashCommand` existante.

### 2.2 `ExecutionMode`

```typescript
/**
 * Énumération des modes d'exécution.
 * - interactive : mode UI React/Ink (interaction terminal)
 * - non_interactive : mode CLI sans interaction (sortie texte/JSON)
 * - acp : mode d'intégration ACP/Zed
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Énumération de la source de la commande, utilisée pour le regroupement dans l'aide, les badges de complétion et les commandes disponibles ACP.
 *
 * Différence avec CommandKind :
 * - CommandKind est une classification interne du chargeur (4 types), qui affecte la logique de chargement
 * - CommandSource est une classification de source orientée utilisateur (9 types), qui affecte l'affichage et le modèle mental
 *
 * Les deux peuvent se chevaucher, mais leurs responsabilités diffèrent, ils ne sont pas fusionnés.
 */
export type CommandSource =
  | 'builtin-command' // Commandes intégrées (BuiltinCommandLoader)
  | 'bundled-skill' // Skills distribués avec le package (BundledSkillLoader)
  | 'skill-dir-command' // Commandes fichier sous .qwen/commands/ utilisateur/projet (FileCommandLoader, non plugin)
  | 'plugin-command' // Commandes fournies par un plugin (FileCommandLoader, extensionName non vide)
  | 'mcp-prompt'; // Prompts fournis par un serveur MCP (McpPromptLoader)
// Sources réservées pour plus tard, non implémentées en Phase 1, mais définies dans le schéma :
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * Type d'exécution de la commande, décrivant "comment" la commande s'exécute.
 *
 * - prompt : génère un submit_prompt, soumet le contenu au modèle. S'applique aux skills, file commands, prompts MCP.
 *   supportedModes par défaut : tous les modes, modelInvocable par défaut : true.
 *
 * - local : exécution logique locale, ne dépend pas de l'UI React/Ink. Peut retourner message, stream_messages,
 *   submit_prompt, tool, etc. S'applique aux commandes built-in de type requête, configuration, état.
 *   supportedModes par défaut : ['interactive'], nécessite une déclaration explicite de supportedModes pour être exposé aux autres modes.
 *   Cela correspond à la sémantique de supportsNonInteractive: true dans Claude Code : le support non interactif doit être déclaré explicitement, et non déduit automatiquement.
 *
 * - local-jsx : commandes dépendant de l'UI React/Ink (ouverture de dialog, rendu de composants JSX, etc.).
 *   supportedModes par défaut : ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Extension de l'interface `SlashCommand`

Ajout de nouveaux champs à l'interface existante, **tous optionnels** pour garantir la compatibilité descendante :

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

  // ── Nouveaux Phase 1 : Source et type d'exécution ──────────────────────────────────────
  /**
   * Source de la commande, utilisée pour le regroupement dans l'aide, les badges de complétion et l'affichage des commandes disponibles ACP.
   * Remplie par chaque Loader, non déclarée par la commande elle-même.
   * Lors de la future dépréciation de CommandKind, source deviendra l'unique identifiant de source.
   */
  source?: CommandSource;

  /**
   * Étiquette de source pour l'affichage, orientée utilisateur.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Remplie par chaque Loader, peut être surchargée par la commande elle-même.
   */
  sourceLabel?: string;

  /**
   * Type d'exécution de la commande.
   * - Valeur par défaut remplie par les Loaders (prompt/local-jsx)
   * - Déclarée par les fichiers de commandes built-in eux-mêmes (local ou local-jsx)
   * Voir getEffectiveCommandType() pour la stratégie par défaut en cas d'absence de déclaration.
   */
  commandType?: CommandType;

  // ── Nouveaux Phase 1 : Capacités de mode ──────────────────────────────────────────
  /**
   * Modes d'exécution dans lesquels cette commande est disponible.
   * Valeur par défaut déduite de commandType si non déclarée (voir getEffectiveSupportedModes()).
   * Une déclaration explicite prime sur la valeur déduite.
   */
  supportedModes?: ExecutionMode[];

  // ── Nouveaux Phase 1 : Visibilité ──────────────────────────────────────────────
  /**
   * Indique si l'utilisateur peut appeler cette commande via une slash command.
   * Par défaut true (presque toutes les commandes sont userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Indique si le modèle peut appeler cette commande via un tool call.
   * Par défaut false. Les commandes de type prompt (skill, file command, prompt MCP) doivent être définies sur true.
   * Les commandes built-in ne sont pas appelables par le modèle (toujours false).
   */
  modelInvocable?: boolean;

  // ── Réservé Phase 3 : Métadonnées d'expérience (défini en Phase 1, non utilisé) ──────────────────
  /**
   * Indication des paramètres, affichée après le nom de la commande dans le menu de complétion.
   * Exemple : "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Description pour aider le modèle à comprendre quand appeler cette commande.
   * Sera injectée dans la description des commandes modelInvocable.
   */
  whenToUse?: string;

  /**
   * Exemples d'utilisation, pour la documentation d'aide et l'affichage de complétion.
   */
  examples?: string[];
}
```

---

## 3. Règles de remplissage des champs par Loader

### 3.1 Principes de remplissage

- `source` et `sourceLabel` sont remplis par le Loader lors de la construction de `SlashCommand`, la commande ne les déclare pas elle-même
- `commandType` : valeur par défaut remplie par le Loader ; les commandes built-in sont déclarées dans leurs fichiers respectifs
- `supportedModes` : déduit via `getEffectiveSupportedModes()`, pas besoin de remplissage explicite (sauf pour surcharger la valeur par défaut)
- `modelInvocable` : rempli par le Loader, toujours `false` pour les commandes built-in, `true` pour les commandes de type prompt

### 3.2 `BuiltinCommandLoader`

```typescript
// Ne pas remplir source/sourceLabel/commandType — déclarés par chaque fichier de commande
// car le commandType des commandes built-in est local ou local-jsx, nécessitant une annotation individuelle

// Injection de source et sourceLabel :
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // Les commandes built-in ne sont pas appelables par le modèle
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
  // source dépend de extensionName :
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // Les commandes plugin ne sont pas encore appelables par le modèle pour des raisons de sécurité, les commandes utilisateur/projet le sont
  action: async (...) => { ... },
};
```

> **Note** : Les commandes plugin (`plugin-command`) ne sont pas marquées comme `modelInvocable` pour le moment, afin d'éviter les risques de sécurité. Les phases suivantes pourront les activer au cas par cas, contrôlées par la configuration utilisateur.

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

## 4. Règles de déclaration du `commandType` pour les commandes Built-in

### 4.1 Critères de classification

| `commandType` | Critère                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | L'action utilise uniquement `ui.addItem` (types texte), retourne `message` / `stream_messages` / `submit_prompt` / `tool`, sans dépendre du rendu de composants React                                               |
| `local-jsx` | L'action retourne `dialog`, ou appelle `ui.addItem` avec des types complexes contenant du JSX (ex. `HistoryItemHelp`, `HistoryItemStats`), ou dépend de `confirm_action` / `load_history` / `quit` |

> **Attention** : `ui.addItem(message/error/info 类型)` est `local` ; `ui.addItem(help/stats/tools/about 等复杂 UI 类型)` est `local-jsx`.

### 4.2 Tableau de classification des commandes Built-in

**Catégorie `local`** (déclare `commandType: 'local'`, `supportedModes` déduit pour tous les modes) :

| Fichier de commande             | Nom de la commande     | Description                                                    |
| -------------------- | ---------- | ------------------------------------------------------- |
| `btwCommand.ts`      | `btw`      | Retourne `submit_prompt` ou `stream_messages`               |
| `bugCommand.ts`      | `bug`      | Retourne `submit_prompt` ou `stream_messages`               |
| `compressCommand.ts` | `compress` | Adaptation `executionMode` existante, retourne `message`/`submit_prompt` |
| `contextCommand.ts`  | `context`  | Retourne `message` (contient un rendu UI mais remplaçable par du texte)                |
| `exportCommand.ts`   | `export`   | I/O fichier, retourne `message`                                |
| `initCommand.ts`     | `init`     | Retourne `submit_prompt`/`message`/`confirm_action`         |
| `memoryCommand.ts`   | `memory`   | Les sous-commandes retournent `message` (I/O fichier)                        |
| `planCommand.ts`     | `plan`     | Retourne `submit_prompt`                                    |
| `summaryCommand.ts`  | `summary`  | Adaptation `executionMode` existante, retourne `submit_prompt`/`message` |
| `insightCommand.ts`  | `insight`  | Retourne `stream_messages`                                  |

> **Attention** : `contextCommand` et `insightCommand`, bien qu'ils appellent actuellement `addItem`, sont essentiellement du contenu texte et relèvent donc de `local`.

**Catégorie `local-jsx`** (déclare `commandType: 'local-jsx'`, `supportedModes` déduit pour `['interactive']`) :

| Fichier de commande                  | Nom de la commande           | Raison de l'incompatibilité headless                       |
| ------------------------- | ---------------- | ------------------------------------------ |
| `aboutCommand.ts`         | `about`          | `addItem(HistoryItemAbout)` — composant UI complexe |
| `agentsCommand.ts`        | `agents`         | `dialog: subagent_create/subagent_list`    |
| `approvalModeCommand.ts`  | `approval-mode`  | `dialog: approval-mode`                    |
| `arenaCommand.ts`         | `arena`          | `dialog: arena_*`                          |
| `authCommand.ts`          | `auth`           | `dialog: auth`                             |
| `clearCommand.ts`         | `clear`          | `ui.clear()` manipule directement le terminal                  |
| `copyCommand.ts`          | `copy`           | Opération presse-papiers, aucun chemin headless               |
| `directoryCommand.tsx`    | `directory`      | Composant JSX                                   |
| `docsCommand.ts`          | `docs`           | Ouvre le navigateur                                 |
| `editorCommand.ts`        | `editor`         | `dialog: editor`                           |
| `extensionsCommand.ts`    | `extensions`     | `dialog: extensions_manage`                |
| `helpCommand.ts`          | `help`           | `addItem(HistoryItemHelp)` — UI d'aide complexe  |
| `hooksCommand.ts`         | `hooks`          | `dialog: hooks`                            |
| `ideCommand.ts`           | `ide`            | Détection et interaction avec le processus IDE                         |
| `languageCommand.ts`      | `language`       | `dialog` + `reloadCommands`                |
| `mcpCommand.ts`           | `mcp`            | `dialog: mcp`                              |
| `modelCommand.ts`         | `model`          | `dialog: model/fast-model`                 |
| `permissionsCommand.ts`   | `permissions`    | `dialog: permissions`                      |
| `quitCommand.ts`          | `quit`           | Type de résultat `quit`                         |
| `restoreCommand.ts`       | `restore`        | Type de résultat `load_history`                 |
| `resumeCommand.ts`        | `resume`         | `dialog: resume`                           |
| `settingsCommand.ts`      | `settings`       | `dialog: settings`                         |
| `setupGithubCommand.ts`   | `setup-github`   | `confirm_shell_commands` + opérations interactives      |
| `skillsCommand.ts`        | `skills`         | `addItem(HistoryItemSkillsList)` — UI complexe |
| `statsCommand.ts`         | `stats`          | `addItem(HistoryItemStats)` — UI complexe      |
| `statuslineCommand.ts`    | `statusline`     | Configuration de l'état UI                                |
| `terminalSetupCommand.ts` | `terminal-setup` | Assistant de configuration du terminal                               |
| `themeCommand.ts`         | `theme`          | `dialog: theme`                            |
| `toolsCommand.ts`         | `tools`          | `addItem(HistoryItemTools)` — UI complexe      |
| `trustCommand.ts`         | `trust`          | `dialog: trust`                            |
| `vimCommand.ts`           | `vim`            | `toggleVimEnabled()` — état UI             |

---

## 5. Règles de déduction de `getEffectiveSupportedModes`

Cette fonction constitue la logique centrale de la Phase 1, remplaçant l'ancienne liste blanche. Elle sera appelée par `filterCommandsForMode`.

```typescript
/**
 * Récupère la liste des modes réellement supportés par la commande.
 *
 * Priorité de déduction (du plus élevé au plus bas) :
 * 1. supportedModes déclaré explicitement par la commande (priorité maximale)
 * 2. Déduction basée sur commandType
 * 3. Fallback basé sur CommandKind (compatibilité descendante)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Priorité 1 : Déclaration explicite
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Priorité 2 : Déduction basée sur commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // Le type prompt n'a pas de dépendance UI, disponible nativement dans tous les modes
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // Type local par défaut conservateur : uniquement interactive.
        // Les commandes nécessitant un support non interactif doivent déclarer explicitement supportedModes (équivalent à supportsNonInteractive: true dans Claude Code).
        // Vérification et déblocage progressif en Phase 2 pour éviter d'exposer accidentellement des commandes non adaptées aux appelants headless.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Priorité 3 : Fallback (basé sur CommandKind, compatibilité descendante avec l'ancien code)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Commandes built-in sans commandType déclaré : par défaut conservateur (interactive uniquement)
      // Cette branche ne devrait plus être atteinte après la Phase 1 (toutes les built-in auront un commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // L'action de ces trois types de commandes n'a pas de dépendance UI, comportement historique : disponible dans tous les modes
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Filtre les commandes adaptées au mode actuel en fonction de supportedModes.
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

Ajout de deux méthodes dans `packages/cli/src/services/CommandService.ts` :

```typescript
export class CommandService {
  // ── Méthodes existantes (inchangées) ────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Nouvelles méthodes Phase 1 ──────────────────────────────────────────────────────

  /**
   * Retourne la liste des commandes disponibles pour un mode d'exécution donné.
   * Remplace la combinaison ancienne liste blanche + filterCommandsForNonInteractive.
   *
   * @param mode Mode d'exécution cible
   * @returns Liste des commandes adaptées à ce mode (exclut les commandes hidden)
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * Retourne toutes les commandes dont modelInvocable est true.
   * SkillTool consommera cette méthode en Phase 2 ; la Phase 1 fournit uniquement l'interface.
   *
   * @returns Liste des commandes appelables par le modèle
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Attention** : `getEffectiveSupportedModes` et `filterCommandsForMode` doivent être des fonctions utilitaires utilisées en interne par `CommandService`, ou extraites dans un fichier indépendant `packages/cli/src/services/commandUtils.ts` et exportées pour faciliter les tests et la réutilisation.

---

## 7. Refactorisation de `nonInteractiveCliCommands.ts`

### 7.1 Contenu supprimé

```typescript
// ❌ Supprimer
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ Supprimer
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Contenu ajouté

```typescript
// ✅ Ajouté (ou importé depuis commandUtils)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Modification de la signature de la fonction `handleSlashCommand`

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

### 7.4 Modification de l'implémentation interne

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

### 7.5 Modification de la signature de la fonction `getAvailableCommands`

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

> Le nouveau paramètre `mode` remplace l'ancien paramètre de liste blanche. La session ACP peut spécifier explicitement `'acp'`, et l'appel non interactif spécifie `'non_interactive'`.

---

## 8. Modification des appels dans `Session.ts` (ACP)

```typescript
// ❌ Ancien appel
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // Non transmis, utilise la liste blanche par défaut
);

// ✅ Nouvel appel (inchangé, suppression du paramètre par défaut qui n'existe plus)
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

## 9. Vue d'ensemble des modifications de fichiers

### 9.1 Fichiers modifiés

| Fichier                                                                    | Modifications                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | Ajout des types `ExecutionMode`, `CommandSource`, `CommandType` ; extension de l'interface `SlashCommand`              |
| `packages/cli/src/services/CommandService.ts`                           | Ajout des méthodes `getCommandsForMode()`, `getModelInvocableCommands()`                                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Suppression des constantes de liste blanche et de l'ancienne fonction de filtrage ; mise à jour des signatures des deux fonctions exportées ; import de `filterCommandsForMode`                 |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Mise à jour des appels à `handleSlashCommand` et `getAvailableCommands`                                         |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | Injection de `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` lors de la construction des commandes |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Injection de `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                  |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Injection de `source`, `commandType: 'prompt'`, `modelInvocable` (selon `extensionName`)                   |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Injection de `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                     |
| **Fichiers de commandes built-in (10 local + 27 local-jsx)**               | Déclaration de `commandType: 'local'` ou `commandType: 'local-jsx'`                                        |

### 9.2 Fichiers ajoutés

| Fichier                                        | Contenu                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | Fonctions utilitaires `getEffectiveSupportedModes()`, `filterCommandsForMode()` et leurs exports |

### 9.3 Fichiers inchangés

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` ne nécessite aucune modification)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (chemin interactif inchangé)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub inchangée)
- Implémentations `action` de toutes les commandes (la Phase 1 ne modifie aucun comportement de commande)

---

## 10. Analyse d'impact sur le comportement

### 10.1 Résumé des changements

| Scénario                                 | Ancien comportement                       | Nouveau comportement                                                   | Nature        |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- | ----------- |
| Exécution de `/init` en `non-interactive`       | ✅ Autorisé (liste blanche)            | ✅ Autorisé (`commandType: local`)                          | Inchangé      |
| Exécution de `/summary` en `non-interactive`    | ✅ Autorisé                      | ✅ Autorisé                                                  | Inchangé      |
| Exécution de `/compress` en `non-interactive`   | ✅ Autorisé                      | ✅ Autorisé                                                  | Inchangé      |
| Exécution de `/btw` en `non-interactive`        | ✅ Autorisé                      | ✅ Autorisé                                                  | Inchangé      |
| Exécution de `/bug` en `non-interactive`        | ✅ Autorisé                      | ✅ Autorisé                                                  | Inchangé      |
| Exécution de `/context` en `non-interactive`    | ✅ Autorisé                      | ✅ Autorisé                                                  | Inchangé      |
| Exécution de `/model` en `non-interactive`      | ❌ Non supporté               | ❌ Non supporté (`commandType: local-jsx`)               | Inchangé      |
| Exécution d'une file command en `non-interactive`  | ✅ Autorisé (`CommandKind.FILE`)  | ✅ Autorisé (`commandType: prompt`)                         | Inchangé      |
| Exécution d'un bundled skill en `non-interactive` | ✅ Autorisé (`CommandKind.SKILL`) | ✅ Autorisé (`commandType: prompt`)                         | Inchangé      |
| Exécution d'un prompt MCP en `non-interactive`    | ❌ Intercepté par `CommandKind`       | ✅ Autorisé (`commandType: prompt`)                         | **Correction de bug** |
| Exécution de `/export` en `non-interactive`     | ❌ Absent de la liste blanche                | ❌ Non autorisé (`commandType: local`, par défaut interactive uniquement) | Inchangé      |
| Exécution de `/memory` en `non-interactive`     | ❌ Absent de la liste blanche                | ❌ Non autorisé (`commandType: local`, par défaut interactive uniquement) | Inchangé      |
| Exécution de `/plan` en `non-interactive`       | ❌ Absent de la liste blanche                | ❌ Non autorisé (`commandType: local`, par défaut interactive uniquement) | Inchangé      |

> **Concernant la stratégie par défaut conservatrice pour les commandes `local`** : la valeur par défaut de `supportedModes` pour `commandType: 'local'` est `['interactive']`, ce qui correspond à la conception de Claude Code : les commandes de type `local` doivent déclarer explicitement `supportsNonInteractive: true` pour s'exécuter en mode non interactif. En Phase 1, les 6 commandes de la liste blanche (`init`, `summary`, `compress`, `btw`, `bug`, `context`) remplacent l'effet de l'ancienne liste blanche en déclarant explicitement `supportedModes: ['interactive', 'non_interactive', 'acp']`. Les commandes à étendre en Phase 2 (ex. `/export`, `/memory`, `/plan`) seront débloquées une par une après vérification que leur implémentation `action` est compatible headless.

---

## 10.2 Commandes à comportement différent selon le mode (Phase 2) : modèle de double enregistrement

Pour les commandes de la Phase 2 nécessitant "une UI en mode interactif, une sortie texte en mode non interactif" (ex. `/model`), il faut adopter le **modèle de double enregistrement**, plutôt que de brancher dans l'`action` d'une seule commande.

C'est le modèle standard de Claude Code, illustré par `/context` (voir `src/commands/context/index.ts`) : deux objets `Command` portant le même nom, l'un `local-jsx` réservé à `interactive`, l'autre `local` réservé à `non-interactive`, s'excluant mutuellement via `isEnabled()`.

Qwen Code doit adopter une approche équivalente en Phase 2, en utilisant `supportedModes` à la place de `isEnabled()` pour assurer l'exclusion mutuelle :

```typescript
// ① Version interactive : local-jsx, uniquement interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // Limitation explicite
  // action : ouvre un dialog pour sélectionner le modèle
};

// ② Version non interactive/acp : local, explicitement ouverte aux appelants headless
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // Limitation explicite
  // action : lit/définit le modèle, retourne un message (texte brut)
};
```

Les deux objets portent le même nom, leurs `supportedModes` s'excluent mutuellement, et `filterCommandsForMode` sélectionne automatiquement la bonne version. Comparé à l'exclusion mutuelle via `isEnabled()` de Claude Code, le filtrage par `supportedModes` est plus explicite, plus facile à tester et ne nécessite pas de détection de l'environnement à l'exécution.

**La Phase 1 n'implémente aucune commande en double enregistrement**, ce modèle est uniquement réservé ici comme spécification d'implémentation pour la Phase 2.

---

## 11. Stratégie de test

### 11.1 Tests des nouvelles fonctions utilitaires

Dans `packages/cli/src/services/commandUtils.test.ts` (nouveau fichier) :

```typescript
describe('getEffectiveSupportedModes', () => {
  it('supportedModes explicite prime sur la déduction commandType', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // Limitation explicite
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local déduit pour tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx déduit pour interactive uniquement', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt déduit pour tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType non déclaré et CommandKind.BUILT_IN, fallback sur interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType non déclaré et CommandKind.FILE, fallback sur tous les modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType non déclaré et CommandKind.MCP_PROMPT, fallback sur tous les modes (correction de l\'ancienne limitation)', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('filtre correctement les commandes en mode non_interactive', () => { ... });
  it('filtre correctement les commandes en mode acp', () => { ... });
  it('ne filtre pas les commandes hidden (filterCommandsForMode ne gère pas hidden, CommandService s\'en charge)', () => { ... });
});
```

### 11.2 Mise à jour de `nonInteractiveCliCommands.test.ts`

- Supprimer toutes les références à `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Supprimer les cas de test pour le paramètre `allowedBuiltinCommandNames`
- Ajouter : vérifier que les commandes `commandType: local` passent le filtre en `non-interactive`
- Ajouter : vérifier que les commandes `commandType: local-jsx` sont filtrées en `non-interactive`
- Conserver : vérifier que les file commands / skill commands passent le filtre en `non-interactive`

### 11.3 Mise à jour de `CommandService.test.ts`

- Ajouter des cas de test pour `getCommandsForMode`
- Ajouter des cas de test pour `getModelInvocableCommands`

### 11.4 Tests des Loaders

- `BuiltinCommandLoader.test.ts` : vérifier que toutes les commandes ont `source: 'builtin-command'`
- `BundledSkillLoader.test.ts` : vérifier `source: 'bundled-skill'` et `modelInvocable: true`
- `FileCommandLoader.test.ts` : vérifier que les commandes utilisateur ont `source: 'skill-dir-command'`, les commandes plugin ont `source: 'plugin-command'`
- `McpPromptLoader.test.ts` : vérifier `source: 'mcp-prompt'` et `modelInvocable: true`

---

## 12. Ordre d'implémentation

Il est recommandé de suivre l'ordre ci-dessous, chaque étape pouvant faire l'objet d'un commit et d'une review indépendants :

**Étape 1** (~30 min) : Modifier `types.ts`, ajouter `ExecutionMode`, `CommandSource`, `CommandType` et les nouveaux champs `SlashCommand`
→ Changements de types purs, vérification de compilation TypeScript

**Étape 2** (~1 h) : Créer `commandUtils.ts`, implémenter `getEffectiveSupportedModes` et `filterCommandsForMode`, créer simultanément `commandUtils.test.ts`
→ Couverture par tests unitaires de la logique centrale

**Étape 3** (~1 h) : Refactoriser `nonInteractiveCliCommands.ts`, supprimer la liste blanche, importer `filterCommandsForMode`, mettre à jour les signatures de fonctions
→ Équivalence comportementale (stratégie conservatrice Phase 1 : les commandes `local` déclarent explicitement `supportedModes: ['interactive']`)

**Étape 4** (~30 min) : Mettre à jour `CommandService.ts`, ajouter les deux méthodes

**Étape 5** (~2 h) : Ajouter la déclaration `commandType` à tous les fichiers de commandes built-in
→ Vérifier individuellement l'exactitude de la classification

**Étape 6** (~1,5 h) : Mettre à jour tous les Loaders, injecter `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Étape 7** (~30 min) : Mettre à jour les signatures d'appel dans `Session.ts`

**Étape 8** (~1 h) : Exécuter tous les tests, corriger les échecs, mettre à jour les snapshots

**Étape 9** (~30 min) : Auto-vérification CR : confirmer la suppression complète de la liste blanche, aucune référence résiduelle

---

## 13. Checklist de validation

- [ ] Compilation TypeScript sans erreur (`npm run typecheck`)
- [ ] `npm run lint` sans nouvelle erreur de lint
- [ ] Tous les tests existants passent (`cd packages/cli && npx vitest run`)
- [ ] Tous les nouveaux tests de `commandUtils.test.ts` passent
- [ ] `getEffectiveSupportedModes` couvre les 7 cas
- [ ] `filterCommandsForMode` couvre les trois modes : interactive / non_interactive / acp
- [ ] Aucune référence à `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` dans tout le codebase (vérification par `grep`)
- [ ] Aucune référence à la fonction `filterCommandsForNonInteractive` dans tout le codebase
- [ ] Toutes les commandes built-in possèdent le champ `commandType`
- [ ] Les commandes générées par tous les Loaders possèdent les champs `source` et `sourceLabel`
- [ ] Les commandes générées par `BundledSkillLoader` / `FileCommandLoader` (commandes utilisateur) / `McpPromptLoader` ont `modelInvocable: true`
- [ ] Les commandes générées par `BuiltinCommandLoader` ont `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` retourne un ensemble de commandes équivalent à celui d'avant la refactorisation
- [ ] Les commandes prompt MCP ne sont plus interceptées par erreur en mode `non-interactive`