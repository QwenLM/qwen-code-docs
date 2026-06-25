# Document de conception technique Phase 3 : Alignement de l'expérience

## 1. Objectifs de conception et contraintes

### 1.1 Objectifs

Phase 3 s'appuie sur les métadonnées de commande, le filtrage cross-mode et les appels de modèle de commande prompt déjà implémentés dans les Phase 1/2, pour compléter l'expérience perceptible par l'utilisateur des slash commands :

- Afficher la source, les indications de paramètres, les correspondances d'alias dans le menu de complétion, et introduire un tri par récence au niveau de la session
- Améliorer le ghost text, les indications de paramètres, l'affichage de la source et la mise en évidence des tokens valides pour les slash commands en milieu de saisie
- Restructurer `/help` d'un amas de commandes actuellement inutilisable en un panneau d'aide clair, esthétique et avec onglets, dans le style de Claude Code
- Renforcer les métadonnées de commande de l'ACP `available_commands_update`
- Confirmer que `/doctor` déjà implémenté n'est pas redondant ; `/release-notes` n'est pas inclus dans cette phase

### 1.2 Contraintes strictes

- **Le code fait foi** : en cas de divergence entre la documentation Phase 1/2 et l'implémentation, le code source de la branche principale actuelle prévaut.
- **Ne pas introduire de nouvelle architecture d'exécution** : continuer à réutiliser les composants existants `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` et `Help`, sans créer de nouveaux `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`.
- **Ne pas rétablir `commandType`** : l'implémentation actuelle a supprimé le champ `commandType` de la conception initiale de Phase 1, Phase 3 ne le réintroduit pas.
- **Récence au niveau session** : le tri par récence n'est effectif que dans la session CLI en cours, sans persistance sur le disque.
- **Les comportements interactifs ne régressent pas** : les comportements interactifs existants (complétion, aide, doctor) restent disponibles ; Phase 3 ne fait qu'améliorer l'affichage et compléter les commandes manquantes.
- **Rétrocompatibilité ACP** : les trois champs existants `availableCommands[].name`, `description`, `input` restent inchangés ; les nouvelles métadonnées sont placées dans des champs compatibles ou `_meta`, pour éviter de casser les clients ACP existants.

---

## 2. Ligne de base de l'implémentation actuelle (conclusions de l'audit du code source)

### 2.1 Métadonnées existantes et comportement des chargeurs

`packages/cli/src/ui/commands/types.ts` : `SlashCommand` contient actuellement :

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

Informations d'affichage actuellement remplies par chaque chargeur :

| Loader                                  | source                                 | sourceLabel                              | argumentHint               | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | -------------------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | Intégré                                 | Non déclaré pour la plupart | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | Compétence                              | Provenant de la compétence | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | Personnalisé / Plugin : `<nomExtension>` | Provenant du frontmatter   | True par défaut pour utilisateur/projet ; plugin nécessite description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | Utilisateur / Projet / Extension : `<nom>` | Provenant de la compétence | True par défaut pour utilisateur/projet ; plugin nécessite description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | MCP : `<nomServeur>`                      | Non généré                 | Non explicitement défini actuellement            |

> Note : La feuille de route Phase 1 exigeait `modelInvocable: true` pour les prompts MCP, mais l'implémentation actuelle ne le définit pas explicitement. Phase 3 ne modifie pas le chemin d'appel du modèle pour les prompts MCP ; les prompts MCP continuent d'être appelés via le mécanisme natif MCP, sans passer par `SkillTool`.

### 2.2 Capacités déjà implémentées liées à Phase 3

| Capacité                                                     | État actuel                                                                                                                              | Fichiers clés                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Ghost text de base pour slash en milieu de saisie            | Partiellement implémenté, complétion par préfixe uniquement pour les commandes `modelInvocable`                                          | `ui/utils/commandUtils.ts`、`ui/hooks/useCommandCompletion.tsx`       |
| Ghost text d'argument pour commande en début de ligne        | Partiellement implémenté, affiche `argumentHint` lorsque la commande correspond exactement et sans args                                  | `ui/hooks/useCommandCompletion.tsx`                                   |
| Participation des alias à la correspondance                  | Correspondance et tri implémentés, mais l'affichage montre toujours tous les alias sans distinguer l'alias correspondant                 | `ui/hooks/useSlashCompletion.ts`                                      |
| Badge de source                                              | Affiche `[MCP]` uniquement pour MCP                                                                                                      | `ui/components/SuggestionsDisplay.tsx`、`ui/components/Help.tsx`      |
| `/help`                                                      | Implémentation actuelle considérée comme incomplète : bien qu'il y ait une tentative de regroupement, il s'agit encore d'un amas de commandes, sans l'expérience de panneau d'aide clair et lisible avec onglets dans le style de Claude Code | `ui/components/Help.tsx`                                              |
| ACP `argumentHint`                                           | Mappé à `availableCommands[].input.hint`                                                                                                 | `acp-integration/session/Session.ts`                                  |
| ACP source/supportedModes/subcommands/modelInvocable         | Non exposé                                                                                                                               | `acp-integration/session/Session.ts`                                  |
| Gestion des conflits                                         | Les commandes d'extension en conflit sont renommées en `extensionName.commandName` ; en cas de même nom non-extension, le dernier chargé écrase le précédent | `services/CommandService.ts`                                          |
| `/doctor`                                                    | Implémenté, prend en charge `interactive` / `non_interactive` / `acp`                                                                    | `ui/commands/doctorCommand.ts`、`utils/doctorChecks.ts`               |
### 2.3 Points à emprunter à Claude Code

Référence au code source de `/Users/mochi/code/claude-code` :

- `src/types/command.ts` : le modèle de commande inclut des champs d'affichage/d'aptitude comme `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive`.
- `src/utils/suggestions/commandSuggestions.ts` : le tri des suggestions prend en compte à la fois les correspondances exactes, les correspondances d'alias, le préfixe, la recherche floue et l'usage des skills ; lors d'une correspondance par alias, seul l'alias réellement saisi par l'utilisateur est affiché.
- `src/utils/suggestions/commandSuggestions.ts` : pour les slash en milieu de saisi, `findMidInputSlashCommand()`, `getBestCommandMatch()` et `findSlashCommandPositions()` permettent le texte fantôme et le surlignage.
- `src/components/HelpV2/Commands.tsx` : Help V2 est un catalogue de commandes navigable, avec la description accompagnée de la source.
- `src/commands.ts` : Claude Code intègre des commandes comme `/doctor`, `/release-notes` ; Qwen Code implémente déjà `/doctor` ; cette phase ne met pas en œuvre `/release-notes`.

La Phase 3 adopte une approche « alignement de l'expérience, sans copie de l'architecture » en s'inspirant des points ci-dessus.

---

## 3. Plan général

### 3.1 Aperçu des modifications de fichiers

| Fichier                                                                     | Modifications                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx`                     | Étendre le type `Suggestion` pour afficher le badge source, `argumentHint`, `aliasHit`                      |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`                           | Générer des suggestions enrichies ; intégrer le tri par usage récent ; conserver les infos de correspondance d'alias |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`                        | Réutiliser la correspondance enrichie pour le texte fantôme en milieu de saisi ; produire les métadonnées argument/source pour l'affichage UI |
| `packages/cli/src/ui/utils/commandUtils.ts`                                 | Ajouter une fonction d'aide au surlignage des tokens slash, ou étendre les fonctions existantes pour retourner la validité des commandes |
| `packages/cli/src/ui/components/InputPrompt.tsx`                            | Rendre le surlignage des tokens de commande slash valides ; conserver l'acceptation du texte fantôme par Tab |
| `packages/cli/src/ui/components/Help.tsx                                    | Refondre en panneau d'aide à onglets de style Claude Code, éviter l'empilement de commandes                 |
| `packages/cli/src/ui/commands/helpCommand.ts`                               | Si nécessaire pour le texte d'aide non interactif/ACP, étendre l'action ; sinon conserver uniquement l'interface interactive |
| `packages/cli/src/acp-integration/session/Session.ts`                       | Exposer les métadonnées enrichies dans la mise à jour ACP                                                   |
| `packages/cli/src/ui/commands/*Command.ts`                                  | Compléter `argumentHint` pour les commandes intégrées courantes                                             |

### 3.2 Nouvel outil de présentation partagé

Il est proposé d'ajouter `packages/cli/src/services/commandMetadata.ts` pour centraliser la logique d'affichage commune à Help, Completion et ACP :

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Il est déconseillé de placer ces fonctions d'affichage dans le Loader pour ne pas lui confier de logique UI.

---

## 4. Phase 3.1 : Amélioration de l'expérience de suggestion

### 4.1 Extension de la structure de données `Suggestion`

Actuellement :

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

Proposition d'extension :

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

Les suggestions de fichiers et la recherche inverse (`mode !== 'slash'`) n'ont pas besoin de remplir ces champs.

### 4.2 Affichage du badge source

Actuellement `SuggestionsDisplay` ajoute `[MCP]` seulement pour `CommandKind.MCP_PROMPT`. Phase 3 utilise plutôt `source` / `sourceLabel` pour générer un badge unifié :

| source / sourceLabel             | badge                                      |
| -------------------------------- | ------------------------------------------ |
| `builtin-command`                | `[Built-in]` (optionnel : masquer par défaut pour réduire le bruit) |
| `bundled-skill` / `Skill`        | `[Skill]`                                  |
| `skill-dir-command` / `User`     | `[User]`                                   |
| `skill-dir-command` / `Project`  | `[Project]`                                |
| `skill-dir-command` / `Custom`   | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`   | `[Plugin]` ou `[Plugin: x]`                |
| `plugin-command` / `Extension: x`| `[Extension]` ou `[Extension: x]`          |
| `mcp-prompt`                     | `[MCP]`                                    |

Implémentation recommandée :

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

> L'affichage ou non de `[Built-in]` est laissé à l'appréciation de la lisibilité de l'UI. Le panneau Help doit absolument montrer le groupe Built-in ; dans le menu de suggestion, on peut omettre le badge built-in et n'afficher le badge que pour les sources non intégrées.

### 4.3 Affichage de l'argumentHint

Dans le menu de suggestion, on ajoute l'`argumentHint` en gris après le nom de la commande :

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```
Voici la traduction du texte fourni, en français technique destiné aux développeurs.

---

Suggestions de mise en œuvre :

- `useSlashCompletion` remplit `finalSuggestions` avec `argumentHint: cmd.argumentHint`
- `SuggestionsDisplay` affiche `argumentHint` après le label, en utilisant `theme.text.secondary`
- `commandColumnWidth` est calculé en incluant label + hint + badge, pour éviter un décalage de la colonne de description
- La complétion des sous-commandes prend également en charge `argumentHint`

Il faut d’abord ajouter `argumentHint` pour les commandes intégrées courantes. Première liste suggérée :

| Commande         | argumentHint                     |
| ---------------- | -------------------------------- |
| `/model`         | `[--fast] [<model-id>]`         |
| `/approval-mode` | `<mode>`                         |
| `/language`      | `ui \<output <language>`          |
| `/export`        | `md \| html \| json \| jsonl [path]` |
| `/memory`        | `show \| add \| refresh`               |
| `/mcp`           | `desc \| nodesc \| schema \| auth \| noauth` |
| `/stats`         | `[model \| tools]`               |
| `/docs`          | vide ou non défini               |
| `/doctor`        | vide ou non défini               |

### 4.4 Tri par utilisation récente

#### 4.4.1 Stockage de l’état

Maintenez un état de session « récemment utilisé » dans `useSlashCommandProcessor` ou `AppContainer` :

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Stockez-le de préférence dans un `Map<string, RecentSlashCommand>`, dont la clé est le nom final de la commande (c’est-à-dire `cmd.name` après résolution des conflits).

#### 4.4.2 Moment de l’enregistrement

Enregistrez l’utilisation après que `useSlashCommandProcessor.handleSlashCommand` a bien résolu `commandToExecute` :

- Ne pas enregistrer si la commande n’est pas trouvée
- Les commandes cachées (hidden) peuvent ne pas être enregistrées
- Les appels via alias sont enregistrés sous le nom canonique `commandToExecute.name`
- Pour les appels de sous-commandes, il est suggéré d’enregistrer le chemin complet (parent + feuille) ; dans un premier temps, seul l’enregistrement de la commande feuille est acceptable

#### 4.4.3 Pondération du tri

Actuellement, l’ordre de tri de `compareRankedCommandMatches()` est :

1. `matchStrength`
2. `completionPriority`
3. Score fzf
4. Début de correspondance
5. Longueur de l’élément
6. Index d’origine

La Phase 3 insère `recentScore` :

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

Proposition pour `recentScore` :

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Lorsque la requête est vide (l’utilisateur a seulement tapé `/`), les commandes récemment utilisées sont placées en tête ; lorsque la requête n’est pas vide, elles ne font que pondérer à intensité de correspondance égale, pour éviter qu’une commande récente ne l’emporte sur une commande nettement plus précise.

### 4.5 Affichage en cas de correspondance via alias

Actuellement, les alias participent déjà à `AsyncFzf` et au fallback par préfixe, mais `formatSlashCommandLabel()` affiche toujours tous les alias :

```text
help (?)
compress (summarize)
```

La Phase 3 remplace cela par :

- Lorsque la saisie de l’utilisateur correspond au nom principal : ne pas afficher d’alias supplémentaire, ou conserver le format concis actuel
- Lorsque la saisie correspond à un alias : afficher `help (alias: ?)`
- `Suggestion.matchedAlias` est renseigné par l’étape de correspondance

Points clés de mise en œuvre :

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

Dans les résultats FZF, si `result.item` provient de `altNames`, on peut directement le définir comme `matchedAlias` ; idem dans le fallback par préfixe.

---

## 5. Phase 3.2 : version complète des slash command en milieu de phrase

### 5.1 Comportement actuel

Actuellement, `findMidInputSlashCommand()` ne reconnaît que les tokens `/xxx` séparés par des espaces blancs, et exige que le curseur soit à la fin du token ; `getBestSlashCommandMatch()` ne fait qu’une correspondance par préfixe alphabétique parmi les commandes `modelInvocable`.

Cela correspond aux objectifs de la Phase 2 de base, mais la Phase 3 nécessite de compléter l’affichage et la mise en évidence.

### 5.2 Amélioration du ghost text

On conserve la stratégie actuelle : le slash en milieu de phrase ne suggère que les commandes `modelInvocable`, car les commandes intégrées dans le texte courant ne sont pas exécutées comme des slash commands.

Améliorations :

- L’algorithme de correspondance passe d’un tri par préfixe alphabétique à la réutilisation des règles de tri de `useSlashCompletion` (au moins `completionPriority` et l’utilisation récente)
- La structure retournée est étendue à :

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Badge de source et hint d’argument pour le milieu de phrase

Étant donné l’espace limité du ghost text, il n’est pas recommandé d’y insérer directement le badge et le hint. Suggestion de règles d’affichage :

- Le ghost text n’affiche toujours que le suffixe du nom de la commande, ex. `review` si l’utilisateur tape `please /rev`
- Lorsque le token correspond exactement à la commande et que celle-ci possède un `argumentHint`, un hint de paramètre en grisé est affiché après le curseur, ex. `/review [pr-number] [--comment]`
- Le badge de source n’est affiché que dans le dropdown ou une indication d’état ; si le milieu de phrase n’affiche pas de dropdown, il n’est pas obligatoire de montrer le badge

### 5.4 Coloration des tokens de commande valides

Inspiré de `findSlashCommandPositions()` de Claude Code, on colore les tokens de slash command valides dans le texte courant, dans `InputPrompt.renderLineWithHighlighting()`.

Fonctions utilitaires proposées :

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

Règles :

- Le token doit se trouver en début de chaîne ou être précédé d’un espace blanc
- Le token a la forme `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Pour la mise en évidence en milieu de phrase, seules les commandes `modelInvocable` sont considérées comme valides
- Les tokens en début de ligne peuvent considérer toutes les commandes interactives visibles comme valides
- Les tokens valides utilisent la couleur `accent` ; les tokens invalides restent en texte normal, pour éviter de marquer un chemin comme `/usr/bin` comme une commande

---

## 6. Phase 3.3 : refonte de l’aide

### 6.1 Problèmes actuels

Le `Help.tsx` actuel affiche :

- Bases
- `Commands:` à plat
- Section `[MCP]`
- Raccourcis clavier

Problèmes :

- Toutes les sources sont mélangées : skills, commandes personnalisées, plugins, MCP sont difficiles à distinguer
- `argumentHint` n’est pas affiché
- `supportedModes` n’est pas affiché
- `modelInvocable` n’est pas affiché
- Les sous-commandes ne sont indentées que d’un niveau, sans indication de source/mode

### 6.2 Conception des groupes

Groupement par `source` / `sourceLabel` :

1. **Built-in Commands** : `source === 'builtin-command'`
2. **Bundled Skills** : `source === 'bundled-skill'`
3. **Custom Commands** : `source === 'skill-dir-command'`, inclut `Custom` / `User` / `Project`
4. **Plugin Commands** : `source === 'plugin-command'`, inclut `Plugin:*` / `Extension:*`
5. **MCP Commands** : `source === 'mcp-prompt'`
6. **Other Commands** : source manquante, pour compatibilité
Chaque groupe est trié par nom de commande ; les commandes `hidden` ne sont pas affichées.

### 6.3 Champs affichés par commande

Suggestion de format :

```text
/model [--fast] [<model-id>]  Changer de modèle
  source: Intégré  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Examiner le code modifié
  source: Compétence  modes: interactive, non_interactive, acp  model: oui
```

Pour éviter que l’aide soit trop large, il est recommandé de compresser sur une seule ligne :

```text
 /review [pr-number] [--comment] [Compétence] [tous] [model] - Examiner le code modifié
```

Proposition de badge de mode :

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` uniquement            | `[interactive]`  |
| `interactive, non_interactive, acp` | `[tous]`         |
| `non_interactive, acp`              | `[headless]`     |
| Autres combinaisons                 | `[i] [ni] [acp]` |

### 6.4 Extension de `/help` au mode headless

La feuille de route exige seulement que la sortie de `/help` soit groupée par source, sans exigence explicite pour non‑interactive/acp. Actuellement, `/help` a `supportedModes: ['interactive']`.

La Phase 3 propose d’ajouter un chemin headless, mais en tant que sous‑tâche distincte :

- `supportedModes` passe à tous les modes
- interactive : continue d’afficher `HistoryItemHelp`
- non_interactive/acp : renvoie un répertoire textuel groupé dans `message`

Si le périmètre doit être réduit, on peut d’abord ne refondre que le composant `Help` interactif, et reporter le `/help` headless.

---

## 7. Phase 3.4 : Amélioration des métadonnées des commandes disponibles ACP

### 7.1 Sortie ACP actuelle

`Session.sendAvailableCommandsUpdate()` mappe actuellement `SlashCommand[]` en :

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

où `argumentHint` est déjà exposé via `input.hint`.

### 7.2 Proposition d’amélioration

Si le type `AvailableCommand` du protocole ACP ne peut pas être étendu directement, utiliser `_meta` pour rester compatible :

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

Si le type `AvailableCommand` autorise des champs étendus, privilégier la sortie comme champs de premier niveau :

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

Mais il est conseillé de conserver `_meta` en miroir pendant un certain temps pour faciliter la migration progressive des anciens clients.

### 7.3 Stratégie récursive pour les sous‑commandes

Le critère d’acceptation ne demande qu’une liste de noms de `subcommands`. La première itération peut se contenter des sous‑commandes de premier niveau :

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Par la suite, si le client ACP a besoin d’un arbre multi‑niveaux, on peut étendre en :

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5 : Complément des commandes manquantes de Claude Code

### 8.1 `/doctor` : déjà implémenté, pas de redondance

La commande `doctorCommand` existe déjà :

- Fichier : `packages/cli/src/ui/commands/doctorCommand.ts`
- Enregistrement : `BuiltinCommandLoader`
- Modes : `['interactive', 'non_interactive', 'acp']`
- interactive : affiche `HistoryItemDoctor`
- non_interactive/acp : renvoie un `message` JSON
- Logique de diagnostic : `packages/cli/src/utils/doctorChecks.ts`

La Phase 3 doit seulement s’assurer que `/doctor` affiche correctement sa source et ses modes dans l’aide et la complétion ; si nécessaire, on peut améliorer le JSON headless en Markdown plus lisible, mais ce n’est pas obligatoire.

### 8.2 `/release-notes` : pas inclus dans cette phase

`/release-notes` n’est plus une exigence de la Phase 3. Cette phase n’ajoute pas de nouvelle commande, ne l’enregistre pas en tant que built-in et n’écrit pas de tests associés, afin d’éviter d’introduire une commande sans besoin produit clair.

---

## 9. Confirmation de la stratégie de conflit et affichage

Stratégie de conflit actuelle de `CommandService` :

- Si une commande d’extension/plugin a le même nom qu’une commande existante, elle est renommée en `extensionName.commandName`
- En cas de second conflit, un suffixe numérique est ajouté : `extensionName.commandName1`
- Pour les commandes non‑extension de même nom, la dernière chargée écrase la précédente

La Phase 3 ne change pas la sémantique d’exécution, mais affiche clairement dans l’aide et la complétion le nom final et la source.

Il est recommandé d’ajouter des tests pour vérifier :

- qu’une commande de plugin renommée apparaît dans la complétion avec son nom final et le badge `[Plugin]`
- que l’aide groupe correctement les noms finaux dans la section Plugin Commands
- que la sortie ACP utilise le nom final

> La priorité « built‑in > bundled/skill‑dir > plugin > mcp » de la feuille de route n’est pas totalement cohérente avec l’implémentation actuelle « la commande non‑extension chargée en dernier écrase la précédente ». La documentation de la Phase 3 s’appuie sur le code source actuel de `CommandService` ; cette phase ne modifie pas la sémantique des conflits. Si un ajustement strict des priorités est nécessaire, il doit être traité dans une phase séparée pour ne pas altérer le comportement existant d’écrasement des commandes utilisateur/projet.

---

## 10. Stratégie de test

### 10.1 Tests de complétion

Mise à jour ou ajout de :

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (si le fichier n’existe pas encore, en créer)

Couverture :

- Badge de source : affichage correct de Compétence/Personnalisé/Plugin/MCP
- argumentHint : affichage du hint après le nom de la commande, et largeur de colonne ne coupant pas la description
- Utilisation récente : n’afficher que `/` pour que les commandes récentes apparaissent en premier ; saisir une requête précise donne la priorité aux correspondances exactes
- Correspondance d’alias : saisir `?` affiche `help (alias: ?)`, saisir `he` n’affiche pas d’indication de correspondance d’alias
- Ghost text en saisie intermédiaire : dans le corps du message, `/rev` suggère le suffixe `/review` (modelInvocable)
- Pas de suggestion de built‑in en saisie intermédiaire : `/sta` dans le corps ne suggère pas `/stats` (sauf si une future conception permet l’exécution de built‑in en ligne)

### 10.2 Tests d’aide

Mise à jour de : `packages/cli/src/ui/components/Help.test.tsx`

Couverture :

- Groupement par Intégré/Compétences fournies/Personnalisé/Plugin/MCP
- Les commandes `hidden` ne sont pas affichées
- Les sous‑commandes affichent une liste de noms
- `argumentHint`, badge de source, badge de mode, badge de modèle apparaissent correctement
- Les `altNames` peuvent encore être affichés, mais sans interférer avec le nom principal de la commande

### 10.3 Tests ACP

Mise à jour de : `packages/cli/src/acp-integration/session/Session.test.ts`

Couverture :

- `availableCommands[].input.hint` conserve le comportement existant
- Les nouvelles métadonnées contiennent `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands`, `modelInvocable`
- Les commandes sans `argumentHint` ont `input: null` pour rester compatibles
- L’appel à `getAvailableCommands(config, signal, 'acp')` reste inchangé

### 10.4 Tests des nouvelles commandes

Cette phase n’ajoute pas `/release-notes` ni d’autre commande built‑in, donc aucun nouveau test de commande n’est nécessaire. Seuls les tests de régression existants pour `/doctor` sont conservés.

### 10.5 Plan de test E2E

La Phase 3 modifie à la fois la complétion TUI, l’exécution des commandes slash, et les métadonnées des commandes ACP. Les tests unitaires ne couvrent pas le parcours utilisateur complet. La validation E2E se fait en trois catégories :

1. **Construction du CLI local** : exécuter d’abord `npm run build && npm run bundle`, puis utiliser `node dist/cli.js` pour valider l’implémentation locale.
2. **Scénarios Interactive / tmux** : pour valider le menu de complétion, le ghost text, l’acceptation par Tab, le rendu de l’aide, etc., en mode TUI.
3. **Scénarios Headless / JSON** : pour valider la sortie des commandes slash en mode non‑interactive, sans dépendre du TUI.
4. **Scénarios d’intégration ACP** : pour valider les métadonnées de `available_commands_update`.
#### 10.5.1 Étapes préliminaires E2E

```bash
npm run build && npm run bundle
```

Pour les scénarios interactifs, il est recommandé d'utiliser un répertoire temporaire dédié afin d'éviter de polluer le dépôt courant :

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Lors de l'envoi d'une saisie, séparez le texte et le retour à la ligne pour éviter que le TUI n'engloutisse la soumission :

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Capture de la sortie :

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Nettoyage :

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 Liste de tests E2E

| Scénario                     | Mode                | Étapes                                                                                     | Résultat attendu                                                                                                                                     |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Achever le badge source      | interactive/tmux    | Saisir `/`, observer le menu de complétion                                                | Les commandes skill/custom/plugin/MCP affichent le badge source correspondant ; built-in peut ne pas afficher de badge                              |
| Achever l'indice d'argument  | interactive/tmux    | Saisir `/model`, `/export`                                                                | Après le nom de commande, afficher `argumentHint` ; les commandes sans argument n'affichent pas d'indice intempestif                                |
| Tri des commandes récentes   | interactive/tmux    | Exécuter d'abord `/help`, puis saisir `/`                                                  | `/help` apparaît en priorité à condition de correspondance égale ; une requête exacte reste prioritaire sur la requête                             |
| Affichage de l'alias trouvé  | interactive/tmux    | Saisir `/?`                                                                                | L'élément de complétion affiche `help (alias: ?)` ; en saisissant `/he`, ne pas afficher par erreur un alias trouvé                                 |
| Texte fantôme en milieu de saisie | interactive/tmux | Dans le corps du texte, saisir `please /rev`                                             | Apparition du suffixe fantôme de `/review`, accepté via Tab                                                                                         |
| Surbrillance du token en milieu de saisie | interactive/tmux | Saisir un corps contenant `/review`                                                        | Les tokens slash model-invocables valides sont surlignés en tant que commandes ; les chemins comme `/usr/bin` ne sont pas surlignés comme commandes |
| Aide par groupes             | interactive/tmux    | Exécuter `/help`                                                                           | La sortie contient les groupes Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands ; chaque commande affiche source/mode/hint |
| Régression headless `/doctor`| headless/json       | Exécuter `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` | Retourne `message`, ne déclenche pas d'erreur de composant TUI uniquement                                                                             |
| Métadonnées ACP              | integration         | Lancer une session ACP et déclencher `available_commands_update`                           | Chaque commande conserve `name`, `description`, `input.hint`, et inclut `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`  |

#### 10.5.3 Exemple de commande headless

`/release-notes` n'est pas inclus dans cette phase ; la régression headless ne conserve que des commandes existantes comme `/doctor`.

### 10.6 Commandes de test de régression

Conformément à AGENTS.md, exécutez d'abord les tests unitaires :

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

- [ ] Le menu de complétion affiche un badge source (au moins `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] Le menu de complétion affiche `argumentHint`
- [ ] Les commandes récemment utilisées dans la session apparaissent en premier lors de la simple saisie de `/`
- [ ] Lorsqu'un alias est trouvé, affiche `alias: <alias>` ; en l'absence d'alias, pas d'affichage intempestif
- [ ] Les commandes renommées suite à un conflit plugin/extension s'affichent avec leur nom final et leur source dans la complétion

### 11.2 Slash en milieu de saisie

- [ ] Lorsque vous saisissez `/review` (ou autre commande model-invocable) dans le corps du texte, le texte fantôme s'affiche correctement
- [ ] Tab accepte le texte fantôme en milieu de saisie
- [ ] Les tokens de slash command valides en milieu de saisie sont surlignés
- [ ] Les commandes built-in ne sont pas indiquées par erreur comme exécutables en ligne dans le corps du texte
- [ ] Les indications d'argument s'affichent lorsque la commande est complètement reconnue et sans arguments

### 11.3 Aide

- [ ] `/help` affiche les commandes groupées par source
- [ ] Chaque commande affiche son nom, son `argumentHint`, sa description, sa source, et les marqueurs `supportedModes`
- [ ] Les commandes model-invocables sont clairement marquées
- [ ] Les sous-commandes sont présentées sous forme de liste de noms ou d'éléments indentés
- [ ] Les commandes cachées ne sont pas affichées

### 11.4 ACP

- [ ] ACP `available_commands_update` continue d'inclure `name`, `description`, `input.hint`
- [ ] Les métadonnées de commande ACP incluent `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Les anciens clients ignorent les nouveaux champs sans impact

### 11.5 Commandes manquantes

- [ ] `/doctor` reste fonctionnel et renvoie `message` en mode non interactif
- [ ] Aucune nouvelle commande `/release-notes` n'est ajoutée ; la documentation, les tests et les critères d'acceptation ne l'exigent plus

---

## 12. Objectifs exclus

Les éléments suivants ne font pas partie de la Phase 3 :

- Aucune implémentation de commande workflow / dynamic skill / nouveau chargeur MCP skill
- Aucune introduction de suivi d'utilisation de commande persistante
- Aucune modification du protocole d'appel de modèle `SkillTool`
- Aucune modification du chemin d'appel de modèle du prompt MCP
- Aucune refonte de l'exécuteur de commande ou de l'adaptateur de mode
- Aucune modification de la sémantique de couverture des commandes user/project existantes
## 13. Ordre d'implémentation suggéré

1. **Compléter la structure de données et l'affichage des badges/hints** : Commencer par étendre `Suggestion` et `SuggestionsDisplay`, risque faible, retour visuel intuitif.
2. **Ajouter `argumentHint` intégré** : Permet de bénéficier immédiatement du ghost text existant et de `input.hint` de l'ACP.
3. **Tri par récence d'utilisation** : Introduire un score de récence dans `useSlashCompletion`, ajouter des tests.
4. **Affichage des correspondances d'alias** : Ajuster la correspondance FZF/prefix pour conserver `matchedAlias`.
5. **Refonte de l'aide en onglets** : Fournir des panneaux clairs (General / Commands / Custom Commands) dans le style de Claude Code, éviter l'empilement de commandes.
6. **Amélioration des métadonnées ACP** : Étendre `Session.sendAvailableCommandsUpdate()`, maintenir la compatibilité de `_meta`.
7. **Amélioration de la coloration en cours de saisie** : Traiter la couche de rendu en dernier pour éviter des changements parallèles trop importants avec la logique de complétion.
