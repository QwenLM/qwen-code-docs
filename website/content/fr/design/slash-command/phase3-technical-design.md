# Document de conception technique Phase 3 : Alignement de l'expérience

## 1. Objectifs de conception et contraintes

### 1.1 Objectifs

La Phase 3, s'appuyant sur les métadonnées de commandes, le filtrage cross-mode et l'appel de modèle via prompt command mis en place en Phase 1/2, complète l'expérience des commandes slash perceptible par l'utilisateur :

- Le menu de complétion affiche la source, les indications d'arguments, les correspondances d'alias, et introduit un tri par usage récent au niveau de la session
- Amélioration des commandes slash en milieu de saisi : ghost text, indication d'arguments, affichage de la source et mise en évidence des tokens valides
- Refonte de `/help` d'un empilement actuel de commandes inutilisables en un panneau d'aide à onglets, clair et esthétique, dans le style de Claude Code
- Enrichissement des métadonnées de commandes dans la mise à jour ACP `available_commands_update`
- Confirmation que `/doctor` déjà implémenté n'est pas réimplémenté ; `/release-notes` n'est pas inclus dans cette phase

### 1.2 Contraintes strictes

- **Le code fait foi** : en cas de divergence entre la documentation des Phase 1/2 et l'implémentation, la source de la branche principale actuelle prévaut.
- **Aucune nouvelle architecture d'exécution** : continuer à réutiliser les composants existants `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` et `Help`, sans créer de nouveaux `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`.
- **Ne pas restaurer `commandType`** : l'implémentation actuelle a supprimé le champ `commandType` de la conception initiale de la Phase 1 ; la Phase 3 ne le réintroduit pas.
- **Usage récent au niveau session** : le tri par usage récent s'applique uniquement dans la session CLI en cours, sans persistance sur disque.
- **Non-régression du comportement interactif** : les comportements interactifs existants (complétion, help, doctor) restent disponibles ; la Phase 3 améliore uniquement l'affichage et comble les commandes manquantes.
- **Rétrocompatibilité ACP** : les trois champs existants `availableCommands[].name`, `description`, `input` restent inchangés ; les nouvelles métadonnées sont placées dans des champs compatibles ou `_meta`, afin de ne pas casser les clients ACP existants.

---

## 2. Baseline de l'implémentation actuelle (conclusions de l'audit du code source)

### 2.1 Métadonnées existantes et comportement des Loader

`packages/cli/src/ui/commands/types.ts` – Le `SlashCommand` actuel contient déjà :

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` prend actuellement en charge :

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

Informations d'affichage actuellement remplies par chaque Loader :

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | Non déclaré pour la plupart | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | Provenant du skill | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | Provenant du frontmatter | true par défaut pour user/projet ; pour plugin nécessite description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | Provenant du skill | true par défaut pour user/projet ; pour plugin nécessite description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | Non généré        | Non défini explicitement actuellement                  |

> Remarque : la feuille de route de la Phase 1 exigeait `modelInvocable: true` pour les prompts MCP, mais l'implémentation actuelle ne le définit pas explicitement. La Phase 3 ne modifie pas le chemin d'appel du modèle pour les prompts MCP ; ceux-ci continuent d'être appelés via le mécanisme natif MCP, sans passer par `SkillTool`.

### 2.2 Capacités liées à la Phase 3 déjà implémentées

| Capacité                                                 | État actuel                                                                                                | Fichiers clés                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Ghost text de base pour slash en milieu de saisi         | Partiellement implémenté, complétion par préfixe uniquement pour les commandes `modelInvocable`             | `ui/utils/commandUtils.ts`, `ui/hooks/useCommandCompletion.tsx`      |
| Ghost text d'argument pour commande en début de ligne    | Partiellement implémenté, affiche `argumentHint` lorsque la commande correspond exactement et sans arguments | `ui/hooks/useCommandCompletion.tsx`                                  |
| Correspondance d'alias                                   | Correspondance et tri implémentés, mais l'affichage montre toujours tous les alias, sans distinguer celui qui correspond | `ui/hooks/useSlashCompletion.ts`                                      |
| Badge de source                                          | Seul MCP affiche `[MCP]`                                                                                     | `ui/components/SuggestionsDisplay.tsx`, `ui/components/Help.tsx`    |
| `/help`                                                  | Implémentation actuelle considérée comme incomplète : bien qu'il y ait une tentative de regroupement, c'est toujours un empilement de commandes, sans l'expérience de panneau d'aide à onglets, clair et lisible comme Claude Code | `ui/components/Help.tsx`                                             |
| ACP `argumentHint`                                       | Déjà mappé vers `availableCommands[].input.hint`                                                             | `acp-integration/session/Session.ts`                                 |
| ACP source/supportedModes/subcommands/modelInvocable     | Non exposés                                                                                               | `acp-integration/session/Session.ts`                                 |
| Gestion des conflits                                     | En cas de conflit de noms de commandes d'extensions, renommage en `extensionName.commandName` ; en cas de conflit non extension, la dernière chargée écrase la précédente | `services/CommandService.ts`                                         |
| `/doctor`                                                | Implémenté, prend en charge `interactive` / `non_interactive` / `acp`                                      | `ui/commands/doctorCommand.ts`, `utils/doctorChecks.ts`              |

### 2.3 Points d'inspiration de Claude Code

Référence : source `/Users/mochi/code/claude-code`

- `src/types/command.ts` : le modèle de commande inclut des champs d'affichage/capacité tels que `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive`.
- `src/utils/suggestions/commandSuggestions.ts` : le tri des complétions prend en compte la correspondance exacte, la correspondance par alias, le préfixe, le fuzzy, l'utilisation des skills ; en cas de correspondance par alias, seul l'alias réellement saisi est affiché.
- `src/utils/suggestions/commandSuggestions.ts` : les slash en milieu de saisi utilisent `findMidInputSlashCommand()`, `getBestCommandMatch()` et `findSlashCommandPositions()` pour prendre en charge le ghost text et la mise en évidence.
- `src/components/HelpV2/Commands.tsx` : Help V2 est un répertoire de commandes consultable, affichant la source des descriptions.
- `src/commands.ts` : Claude Code intègre des commandes intégrées `/doctor`, `/release-notes`, etc. Qwen Code a déjà implémenté `/doctor` ; cette phase n'implémente pas `/release-notes`.

La Phase 3 adopte une approche « alignement de l'expérience, pas de copie d'architecture » pour s'inspirer des points ci-dessus.

---

## 3. Plan d'ensemble

### 3.1 Aperçu des modifications de fichiers

| Fichier                                                    | Contenu de la modification                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx` | Étendre le type `Suggestion`, afficher le badge source, l'indication d'argument, l'alias correspondant |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`       | Générer des éléments de complétion améliorés ; intégrer le tri par usage récent ; conserver les informations d'alias correspondant |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`    | Le ghost text en milieu de saisi réutilise la correspondance améliorée ; renvoyer les métadonnées d'argument/source pour l'affichage UI |
| `packages/cli/src/ui/utils/commandUtils.ts`             | Ajouter des fonctions d'aide pour la mise en évidence des tokens slash, ou étendre les fonctions existantes pour renvoyer la validité de la commande |
| `packages/cli/src/ui/components/InputPrompt.tsx`        | Rendre la mise en évidence des tokens de commande slash valides ; conserver l'acceptation du ghost text par Tab |
| `packages/cli/src/ui/components/Help.tsx`               | Refondre en panneau d'aide à onglets dans le style de Claude Code, éviter l'empilement de commandes |
| `packages/cli/src/ui/commands/helpCommand.ts`           | Si nécessaire pour le texte d'aide non interactif/acp, étendre l'action ; sinon, conserver uniquement l'UI interactive |
| `packages/cli/src/acp-integration/session/Session.ts`   | Exposer les métadonnées enrichies dans la mise à jour ACP |
| `packages/cli/src/ui/commands/*Command.ts`              | Ajouter `argumentHint` pour les commandes intégrées courantes |

### 3.2 Nouvel outil d'affichage partagé

Suggestion : ajouter `packages/cli/src/services/commandMetadata.ts` pour centraliser la logique d'affichage nécessaire à Help, Completion, ACP :

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Il est déconseillé de placer ces fonctions d'affichage dans les Loader, afin d'éviter que les Loader n'aient à assumer de la logique UI.

---

## 4. Phase 3.1 : Amélioration de l'expérience de complétion

### 4.1 Extension de la structure de données `Suggestion`

Actuellement :

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

Extension suggérée :

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

La complétion de fichiers ou la recherche inverse lorsque `mode !== 'slash'` n'ont pas besoin de remplir ces champs.

### 4.2 Affichage du badge source

Actuellement, `SuggestionsDisplay` n'ajoute `[MCP]` que pour `CommandKind.MCP_PROMPT`. Phase 3 : utiliser `source` / `sourceLabel` pour générer un badge unifié :

| source / sourceLabel              | badge                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]` (optionnel : par défaut non affiché pour réduire le bruit) |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` ou `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` ou `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                    |

Implémentation recommandée :

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

> L'affichage de `[Built-in]` est laissé à la discrétion de l'UI pour la lisibilité. Le groupe Built-in doit être affiché dans Help ; dans le menu de complétion, on peut omettre le badge built-in et n'afficher le badge que pour les sources non intégrées.

### 4.3 Affichage de l'indication d'argument

Dans le menu de complétion, ajouter un `argumentHint` en gris après le nom de la commande :

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

Suggestion d'implémentation :

- `useSlashCompletion` remplit `argumentHint: cmd.argumentHint` dans `finalSuggestions`
- `SuggestionsDisplay` rend `argumentHint` après le label avec `theme.text.secondary`
- `commandColumnWidth` calcule incluant label + hint + badge, pour éviter un décalage de la colonne de description
- La complétion des sous-commandes prend également en charge `argumentHint`

Il faut d'abord ajouter `argumentHint` aux commandes intégrées courantes. Suggestion pour le premier lot :

| Commande             | argumentHint            |
| -------------------- | ----------------------- | ------------------ | -------- | ------------- | ------- |
| `/model`             | `[--fast] [<model-id>]` |
| `/approval-mode`     | `<mode>`                |
| `/language`          | `ui                     | output <language>` |
| `/export`            | `md                     | html               | json     | jsonl [path]` |
| `/memory`            | `show                   | add                | refresh` |
| `/mcp`               | `desc                   | nodesc             | schema   | auth          | noauth` |
| `/stats`             | `[model                 | tools]`            |
| `/docs`              | vide ou non défini      |
| `/doctor`            | vide ou non défini      |

### 4.4 Tri par usage récent

#### 4.4.1 Stockage de l'état

Maintenir un état d'usage récent au niveau session dans `useSlashCommandProcessor` ou `AppContainer` :

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Suggestion : stocker sous forme de `Map<string, RecentSlashCommand>`, la clé étant le nom final de la commande (c'est-à-dire `cmd.name` après résolution des conflits).

#### 4.4.2 Moment de l'enregistrement

Enregistrer l'usage dans `useSlashCommandProcessor.handleSlashCommand` après la résolution réussie du `commandToExecute` :

- Ne pas enregistrer si la commande n'est pas trouvée
- Les commandes cachées peuvent ne pas être enregistrées
- Les appels par alias sont enregistrés sous le nom canonique `commandToExecute.name`
- Pour les appels de sous-commandes, il est suggéré d'enregistrer le chemin complet (commande parente et commande feuille) ; dans un premier temps, enregistrer uniquement la commande feuille est acceptable.

#### 4.4.3 Poids de tri

Actuellement, l'ordre de tri de `compareRankedCommandMatches()` est :

1. matchStrength
2. completionPriority
3. score fzf
4. début de correspondance
5. longueur de l'élément
6. index d'origine

Phase 3 : insérer `recentScore` :

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

Suggestion pour `recentScore` :

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Lorsque la requête est vide (l'utilisateur tape seulement `/`), les commandes récentes sont placées en haut ; lorsque la requête n'est pas vide, le récent ne pondère qu'à égalité de force de correspondance, afin d'éviter que les commandes récentes ne prennent le pas sur des commandes nettement plus pertinentes.

### 4.5 Affichage de la correspondance par alias

Actuellement, les alias participent à `AsyncFzf` et au fallback par préfixe, mais `formatSlashCommandLabel()` affiche toujours tous les alias :

```text
help (?)
compress (summarize)
```

Phase 3 : modifier pour :

- Lorsque la saisie de l'utilisateur correspond au nom principal : ne pas afficher d'alias supplémentaire, ou conserver le format concis actuel
- Lorsque la saisie de l'utilisateur correspond à un alias : afficher `help (alias: ?)`
- `Suggestion.matchedAlias` est renseigné par l'étape de correspondance

Points clés de l'implémentation :

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

Dans les résultats FZF, si `result.item` provient de `altNames`, on peut directement le définir comme `matchedAlias` ; idem dans le fallback par préfixe.

---

## 5. Phase 3.2 : Version complète des commandes slash en milieu de saisi

### 5.1 Comportement actuel

Actuellement, `findMidInputSlashCommand()` identifie uniquement les tokens `/xxx` séparés par des espaces, et exige que le curseur soit à la fin du token ; `getBestSlashCommandMatch()` ne fait qu'une correspondance par préfixe alphabétique parmi les commandes `modelInvocable`.

Cela correspond à l'objectif de la version de base de la Phase 2, mais la Phase 3 doit compléter l'affichage et la mise en évidence.

### 5.2 Amélioration du ghost text

Conserver la stratégie actuelle : les slash en milieu de saisi ne suggèrent que les commandes `modelInvocable`, car les commandes intégrées dans le texte ne sont pas exécutées comme des commandes slash.

Points d'amélioration :

- L'algorithme de correspondance passe d'un préfixe alphabétique à la réutilisation des règles de tri de `useSlashCompletion` (au moins prendre en compte `completionPriority` et l'usage récent)
- La structure de retour est étendue à :

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Badge source et indication d'argument en milieu de saisi

L'espace disponible pour le ghost text étant limité, il est déconseillé d'intégrer directement le badge et l'indication dans le corps du ghost text. Règles d'affichage suggérées :

- Le ghost text ne rend toujours que le suffixe du nom de la commande, par exemple la saisie `please /rev` affiche `iew`
- Lorsque le token correspond exactement à la commande et que celle-ci a un `argumentHint`, afficher une indication d'argument en gris après le curseur, par exemple `/review [pr-number] [--comment]`
- Le badge source n'est affiché que dans le dropdown ou dans une indication d'état ; si le milieu de saisi n'affiche pas de dropdown, le badge peut ne pas être affiché.

### 5.4 Mise en évidence des tokens de commande valides

S'inspirer de `findSlashCommandPositions()` de Claude Code, dans `InputPrompt.renderLineWithHighlighting()` pour colorer les tokens de commande slash valides dans le texte.

Suggestion : ajouter une fonction utilitaire :

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

Règles :

- Le token doit être en début de chaîne ou précédé d'un espace
- Le token a la forme `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Pour la mise en évidence en milieu de saisi, seules les commandes `modelInvocable` sont considérées comme valides
- Pour un token en début de ligne, toutes les commandes interactives visibles sont considérées comme valides
- Les tokens valides utilisent une couleur d'accent ; les tokens invalides restent en texte normal, pour éviter de marquer à tort des chemins comme `/usr/bin` comme des commandes.

---

## 6. Phase 3.3 : Refonte du répertoire d'aide Help

### 6.1 Problèmes actuels

`Help.tsx` affiche actuellement :

- Basics
- `Commands:` à plat
- Explication de `[MCP]`
- Raccourcis clavier

Problèmes :

- Toutes les sources sont mélangées, skills, customs, plugins, MCP difficiles à distinguer
- `argumentHint` non affiché
- `supportedModes` non affichés
- `modelInvocable` non affiché
- Les sous-commandes ne sont indentées que d'un niveau, sans affichage de la source/mode

### 6.2 Conception des groupes

Regroupement par `source` / `sourceLabel` :

1. **Built-in Commands** : `source === 'builtin-command'`
2. **Bundled Skills** : `source === 'bundled-skill'`
3. **Custom Commands** : `source === 'skill-dir-command'`, inclut `Custom` / `User` / `Project`
4. **Plugin Commands** : `source === 'plugin-command'`, inclut `Plugin:*` / `Extension:*`
5. **MCP Commands** : `source === 'mcp-prompt'`
6. **Other Commands** : fallback de compatibilité pour les commandes sans source

À l'intérieur de chaque groupe, tri par nom de commande ; les commandes cachées ne sont pas affichées.

### 6.3 Champs affichés par commande

Format suggéré :

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Pour éviter que Help ne soit trop large, suggestion de format compact sur une seule ligne :

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Badge de mode suggéré :

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` uniquement            | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| Autres combinaisons                 | `[i] [ni] [acp]` |

### 6.4 Extension de `/help` au mode headless

La feuille de route demande uniquement que `/help` produise une sortie groupée par source, sans exiger explicitement le mode non interactif/acp. Actuellement, `/help` a `supportedModes: ['interactive']`.

Phase 3 : suggestion d'ajouter un chemin headless, mais en tant que sous-tâche distincte :

- `supportedModes` passe à tous les modes
- interactif : continuer à afficher `HistoryItemHelp`
- non_interactive/acp : retourner un répertoire textuel groupé dans `message`

Si le périmètre doit être réduit, on peut d'abord refaire uniquement le composant interactif `Help` et reporter la version headless de `/help`.

---

## 7. Phase 3.4 : Enrichissement des métadonnées des commandes disponibles ACP

### 7.1 Sortie ACP actuelle

`Session.sendAvailableCommandsUpdate()` mappe actuellement `SlashCommand[]` vers :

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

Où `argumentHint` est déjà exposé via `input.hint`.

### 7.2 Proposition d'enrichissement

Si le type `AvailableCommand` du protocole ACP ne peut pas être directement augmenté, utiliser `_meta` pour la compatibilité :

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

Si le type `AvailableCommand` permet d'étendre les champs, privilégier une sortie en tant que champs de premier niveau :

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

Mais il est recommandé de conserver un miroir `_meta` pendant un certain temps pour faciliter la migration progressive des clients anciens.

### 7.3 Stratégie récursive pour les sous-commandes

Le critère d'acceptation demande uniquement la liste des noms de `subcommands`. Pour la première version, exposer uniquement les sous-commandes de premier niveau :

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Si ultérieurement les clients ACP ont besoin d'une arborescence multi-niveaux, on pourra étendre avec :

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5 : Complétion des commandes manquantes par rapport à Claude Code

### 8.1 `/doctor` : déjà implémenté, ne pas réimplémenter

`doctorCommand` existe déjà :

- Fichier : `packages/cli/src/ui/commands/doctorCommand.ts`
- Enregistrement : `BuiltinCommandLoader`
- Modes : `['interactive', 'non_interactive', 'acp']`
- Interactif : affiche `HistoryItemDoctor`
- non_interactive/acp : retourne un `message` JSON
- Logique de diagnostic : `packages/cli/src/utils/doctorChecks.ts`

Phase 3 : il suffit d'afficher correctement la source et le mode pour `/doctor` dans Help et la complétion ; si nécessaire, on peut optimiser le JSON headless en Markdown plus lisible, mais ce n'est pas obligatoire.

### 8.2 `/release-notes` : pas inclus dans cette phase

`/release-notes` n'est plus une exigence de la Phase 3. Cette phase n'ajoute pas de nouvelle commande, ne l'enregistre pas en tant que built-in, et n'écrit pas de tests associés, afin d'éviter d'introduire une commande superficielle sans besoin produit clair.

---

## 9. Confirmation de la stratégie de conflit et affichage

Stratégie de conflit actuelle de `CommandService` :

- Les commandes d'extension/plugin qui entrent en conflit avec des commandes existantes sont renommées en `extensionName.commandName`
- En cas de deuxième conflit, un suffixe numérique est ajouté : `extensionName.commandName1`
- En cas de conflit entre commandes non extension, la dernière chargée écrase la précédente

Phase 3 : ne modifie pas la sémantique d'exécution, affiche simplement le nom final et la source dans Help/Completion.

Suggestion : ajouter des tests pour vérifier que :

- Les commandes plugin renommées affichent le nom final et le badge `[Plugin]` dans la complétion
- Help les regroupe sous Plugin Commands avec le nom final
- La sortie ACP utilise le nom final

> La priorité « built-in > bundled/skill-dir > plugin > mcp » mentionnée dans la feuille de route n'est pas entièrement cohérente avec l'implémentation actuelle « non-extension : dernière chargée écrase la précédente ». La documentation de la Phase 3 s'appuie sur le code source actuel de `CommandService` ; les conflits sémantiques ne sont pas modifiés dans cette phase. Pour un ajustement strict des priorités, cela devrait être traité dans une phase séparée, afin d'éviter de modifier le comportement de remplacement des commandes utilisateur/projet existant.

---

## 10. Stratégie de test

### 10.1 Tests de complétion

Mettre à jour ou ajouter :

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (créer si le fichier n'existe pas)

Couverture :

- Badge source : affichage correct pour Skill/Custom/Plugin/MCP
- Indication d'argument : affichage du hint après le nom de la commande, sans casser la largeur des colonnes de description
- Usage récent : en tapant seulement `/`, les commandes récentes sont en haut ; en tapant une requête explicite, la correspondance exacte prime
- Correspondance d'alias : en tapant `?`, afficher `help (alias: ?)` ; en tapant `he`, ne pas afficher d'indication de correspondance d'alias
- Ghost text en milieu de saisi : `/rev` dans le texte suggère le suffixe de `/review` (modelInvocable)
- Pas de suggestion built-in en milieu de saisi : `/sta` dans le texte ne suggère pas `/stats` (sauf si une conception future permet l'exécution de built-in en ligne).
### 10.2 Tests d'aide (Help)

Mise à jour : `packages/cli/src/ui/components/Help.test.tsx`

Couverture :

- Regroupement par Built-in / Bundled Skills / Custom / Plugin / MCP
- Les commandes `hidden` ne sont pas affichées
- Les sous-commandes affichent la liste des noms
- `argumentHint`, badge de source, badge de mode, badge de modèle apparaissent correctement
- Les `altNames` peuvent encore être affichés, mais sans interférer avec le nom de la commande principale

### 10.3 Tests ACP

Mise à jour : `packages/cli/src/acp-integration/session/Session.test.ts`

Couverture :

- `availableCommands[].input.hint` conserve le comportement existant
- Les nouvelles métadonnées incluent `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands`, `modelInvocable`
- Les commandes sans `argumentHint` ont `input: null` pour rester compatibles
- L'appel `getAvailableCommands(config, signal, 'acp')` reste inchangé

### 10.4 Tests des nouvelles commandes

Aucune nouvelle commande `/release-notes` ou autre built-in n'est ajoutée dans cette phase, donc aucun nouveau test de commande n'est nécessaire. Seul le test de régression existant pour `/doctor` est conservé.

### 10.5 Plan de test E2E

La Phase 3 modifie à la fois la complétion TUI, l'exécution des slash commands et les métadonnées ACP ; les tests unitaires ne peuvent pas couvrir l'intégralité du parcours utilisateur. La vérification E2E se divise en trois catégories :

1. **Construction locale du CLI** : exécuter d'abord `npm run build && npm run bundle`, puis utiliser `node dist/cli.js` pour valider l'implémentation locale.
2. **Scénarios Interactive / tmux** : pour valider le menu de complétion, le ghost text, l'acceptation par Tab, le rendu Help, etc.
3. **Scénarios Headless / JSON** : pour valider la sortie des slash commands en mode non-interactif, sans dépendre du TUI.
4. **Scénarios d'intégration ACP** : pour valider les métadonnées `available_commands_update`.

#### 10.5.1 Prérequis E2E

```bash
npm run build && npm run bundle
```

Pour les scénarios interactifs, il est recommandé d'utiliser un répertoire temporaire indépendant afin d'éviter de polluer le dépôt courant :

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Lors de l'envoi des entrées, séparer le texte et la touche Entrée pour éviter que le TUI n'absorbe la soumission :

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Capturer la sortie :

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Nettoyage :

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 Liste de vérification E2E

| Scénario                    | Mode               | Étapes                                                                                                | Résultat attendu                                                                                                                                |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge de source dans la complétion | interactive/tmux   | Taper `/`, observer le menu de complétion                                                             | Les commandes skill/custom/plugin/MCP affichent le badge de source correspondant ; les built-in peuvent ne pas afficher de badge                |
| Indice d'argument dans la complétion | interactive/tmux   | Taper `/model`, `/export`                                                                             | L'`argumentHint` est affiché après le nom de la commande ; les commandes sans paramètre n'affichent pas de hint parasite                        |
| Tri par utilisation récente | interactive/tmux   | Exécuter d'abord `/help`, puis taper `/`                                                              | `/help` apparaît en priorité à conditions de correspondance égales ; une requête exacte reste prioritaire                                      |
| Affichage d'une correspondance par alias | interactive/tmux   | Taper `/?`                                                                                            | L'élément de complétion affiche `help (alias: ?)` ; en tapant `/he`, l'alias ne doit pas être indiqué par erreur                                |
| Ghost text en milieu de saisie | interactive/tmux   | Dans le corps du message, taper `please /rev`                                                         | Le suffixe ghost text `/review` apparaît, Tab pour accepter                                                                                     |
| Surlignage du token en milieu de saisie | interactive/tmux   | Saisir un texte contenant `/review`                                                                   | Les tokens de slash command model-invocable valides sont surlignés avec la couleur de commande ; les chemins comme `/usr/bin` ne sont pas surlignés comme des commandes |
| Regroupement dans l'aide    | interactive/tmux   | Exécuter `/help`                                                                                      | La sortie contient les groupes Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands ; chaque commande affiche source/mode/hint |
| Régression headless de `/doctor` | headless/json      | Exécuter `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null`           | Retourne un `message`, sans déclencher d'erreur de composant TUI uniquement                                                                     |
| Métadonnées ACP             | integration        | Lancer une session ACP et déclencher `available_commands_update`                                      | Chaque commande conserve `name`, `description`, `input.hint`, et inclut `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable` |

#### 10.5.3 Exemple de commande headless

`/release-notes` n'est pas inclus dans cette phase ; la régression headless ne conserve que la validation des commandes existantes comme `/doctor`.

### 10.6 Commandes de test de régression

Conformément à AGENTS.md, exécuter d'abord les tests unitaires isolés :

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

Validation finale :

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. Critères d'acceptation

### 11.1 Menu de complétion

- [ ] Le menu de complétion affiche les badges de source (au moins `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] Le menu de complétion affiche `argumentHint`
- [ ] Les commandes récemment utilisées dans la session apparaissent en priorité lorsqu'on tape seulement `/`
- [ ] Lorsqu'un alias est utilisé, il affiche `alias: <alias>` ; en l'absence d'alias, aucun bruit parasite n'est affiché
- [ ] Les commandes renommées suite à un conflit plugin/extension apparaissent dans la complétion avec leur nom final et leur source

### 11.2 Slash command en milieu de saisie

- [ ] Lorsqu'on tape `/review` (ou autre commande model-invocable) dans le corps du message, le ghost text s'affiche correctement
- [ ] Tab permet d'accepter le ghost text en milieu de saisie
- [ ] Les tokens de slash command valides en milieu de saisie sont surlignés
- [ ] Les commandes built-in ne sont pas suggérées par erreur comme commandes exécutables dans le corps du message
- [ ] L'indice de paramètre s'affiche lorsque la commande est complètement tapée et qu'aucun argument n'est présent

### 11.3 Aide

- [ ] `/help` affiche les commandes regroupées par source
- [ ] Chaque commande affiche son nom, `argumentHint`, description, source, et les marques de `supportedModes`
- [ ] Les commandes model-invocable sont clairement marquées
- [ ] Les sous-commandes sont affichées sous forme de liste de noms ou d'éléments indentés
- [ ] Les commandes `hidden` ne sont pas affichées

### 11.4 ACP

- [ ] ACP `available_commands_update` continue d'inclure `name`, `description`, `input.hint`
- [ ] Les métadonnées des commandes ACP incluent `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Les anciens clients ignorant les nouveaux champs ne sont pas impactés

### 11.5 Commandes manquantes

- [ ] `/doctor` est toujours disponible et retourne `message` en mode non-interactif
- [ ] Aucune commande `/release-notes` n'est ajoutée ; la documentation, les tests et les critères d'acceptation n'en exigent plus

---

## 12. Ce qui n'est pas couvert

Les éléments suivants ne font pas partie de la Phase 3 :

- Pas d'implémentation de workflow command / dynamic skill / nouveau loader mcp skill
- Pas d'introduction de suivi persistant de l'utilisation des commandes
- Pas de modification du protocole d'appel de modèle de `SkillTool`
- Pas de modification du chemin d'appel de modèle des prompts MCP
- Pas de refonte de l'exécuteur de commande ou de l'adaptateur de mode
- Pas de modification de la sémantique de couverture des commandes user/project existantes

---

## 13. Ordre de mise en œuvre suggéré

1. **Structure de données de complétion et affichage des badges/hints** : commencer par étendre `Suggestion` et `SuggestionsDisplay` — faible risque, feedback visuel immédiat.
2. **Compléter les `argumentHint` des built-in** : pour que le ghost text existant et `input.hint` ACP en bénéficient immédiatement.
3. **Tri par utilisation récente** : introduire un score récent dans `useSlashCompletion`, ajouter des tests.
4. **Affichage de la correspondance par alias** : ajuster le matching FZF/prefix pour conserver `matchedAlias`.
5. **Refonte de l'aide en onglets** : inspiré de Claude Code, fournir des panneaux clairs (General / Commands / Custom Commands, etc.) pour éviter l'accumulation des commandes.
6. **Amélioration des métadonnées ACP** : étendre `Session.sendAvailableCommandsUpdate()`, maintenir la compatibilité `_meta`.
7. **Amélioration du surlignage en milieu de saisie** : traiter la couche de rendu en dernier pour éviter des modifications parallèles trop importantes avec la logique de complétion.