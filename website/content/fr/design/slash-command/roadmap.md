# Feuille de route de refactoring des `slash command`

## Objectif général

Livrer une plateforme de commandes alignée à 95 % sur l'expérience utilisateur de Claude Code, en adoptant le style d'architecture interne de Qwen, tout en résolvant trois problèmes majeurs : la fragmentation des trois modes, l'unicité des sources de commandes et l'impossibilité pour le modèle d'appeler les `prompt command`.

---

## Principes de conception clés

1. **Chaque Phase peut être livrée indépendamment** : une fois terminée, son comportement est autonome et ne dépend pas des phases futures pour fonctionner
2. **La Phase 1 est purement infrastructurelle** : hormis la correction de l'interception erronée de `MCP_PROMPT`, elle ne modifie aucun ensemble de commandes existant
3. **Séparation des changements comportementaux et architecturaux** : la Phase 1 gère l'architecture, la Phase 2 gère l'extension des fonctionnalités
4. **Pas de copie de l'architecture interne de Claude Code** : alignement uniquement sur les capacités perceptibles par l'utilisateur

---

## Phase 1 : Reconstruction de l'infrastructure (architecture pure, aucun changement comportemental)

### Objectif

Mettre en place un modèle unifié de métadonnées de commandes et un mécanisme de gestion inter-modes pour servir de socle à toutes les phases suivantes.

### Fonctionnalités

#### 1.1 Extension du modèle de métadonnées `SlashCommand`

Ajouter les champs suivants à l'interface `SlashCommand` existante :

**Champs de source**

- `source: CommandSource` : énumération de la source de la commande (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string` : étiquette de source pour l'affichage (ex. `"Built-in"` / `"MCP: github-server"`)

**Champs de capacité par mode**

- `supportedModes: ExecutionMode[]` : déclare les modes d'exécution dans lesquels la commande est disponible (`interactive` / `non_interactive` / `acp`)

**Champs de type d'exécution**

- `commandType: CommandType` : déclare le type d'exécution (`prompt` / `local` / `local-jsx`)

**Champs de visibilité**

- `userInvocable: boolean` : indique si l'utilisateur peut appeler la commande via un `slash command` (par défaut `true`)
- `modelInvocable: boolean` : indique si le modèle peut appeler la commande via un `tool call` (par défaut `false`)

**Champs de métadonnées auxiliaires** (réservés pour la Phase 3, définis mais non utilisés en Phase 1)

- `argumentHint?: string` : indice sur les arguments, ex. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string` : description du contexte d'utilisation de la commande (pour le modèle)
- `examples?: string[]` : exemples d'utilisation

#### 1.2 Remplissage des champs `source`/`commandType` par les Loaders

Chaque `Loader` doit renseigner `source` et `commandType` lors de la construction d'un `SlashCommand` :

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Déclaré par chaque commande (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader`（用户/项目） | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader`（插件）      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Déclaration de `supportedModes` et `commandType` pour les commandes intégrées

Déclarer explicitement pour toutes les commandes `built-in` :

- `commandType` : `local` (sans dépendance UI) ou `local-jsx` (dépend de `dialog`/React)
- `supportedModes` : les commandes de type `local` déclarent `['interactive', 'non_interactive', 'acp']` ; les commandes de type `local-jsx` déclarent `['interactive']`

#### 1.4 Remplacement de la liste blanche codée en dur par un filtrage basé sur les capacités

- Supprimer la constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Supprimer la fonction `filterCommandsForNonInteractive`
- Ajouter la fonction `filterCommandsForMode(commands, mode)` pour filtrer selon le champ `supportedModes`
- Ajouter la fonction utilitaire `getEffectiveSupportedModes(cmd)` (prend en compte la stratégie par défaut de `CommandKind`)
- Modifier les signatures des fonctions `handleSlashCommand` / `getAvailableCommands` pour supprimer le paramètre `allowedBuiltinCommandNames`

#### 1.5 Mise à niveau de `CommandService` en Registry unifié

- Ajouter la méthode `getCommandsForMode(mode: ExecutionMode)`
- Ajouter la méthode `getModelInvocableCommands()` (utilisée en Phases 2/3, interface fournie en Phase 1)
- Conserver `getCommands()` tel quel (utilisé en mode `interactive`)

### Critères d'acceptation

- [ ] L'interface `SlashCommand` contient tous les nouveaux champs et la compilation TypeScript réussit
- [ ] Tous les `Loader` renseignent les champs `source` et `commandType`
- [ ] Toutes les commandes `built-in` déclarent `commandType` et `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` est supprimé et remplacé par le filtre basé sur les capacités
- [ ] **L'ensemble des commandes disponibles en mode `non-interactive` est strictement identique à celui d'avant le refactoring** (les tests existants ne cassent pas)
- [ ] Les `MCP prompt command` s'exécutent correctement en modes `non-interactive`/`acp` (correction des restrictions erronées existantes)
- [ ] `CommandService.getCommandsForMode('non_interactive')` retourne le bon ensemble de commandes
- [ ] Tous les tests existants passent

---

## Phase 2 : Extension des capacités (organisation des commandes et appel des `prompt command` par le modèle)

### Objectif

S'appuyer sur les métadonnées de la Phase 1 pour étendre la disponibilité des commandes dans les trois modes et ouvrir le canal d'appel des `prompt command` par le modèle.

### Fonctionnalités

#### 2.1 Extension de l'ensemble des commandes disponibles en `non-interactive` / `acp`

**Principes de conception sémantique pour l'ACP**

Avant d'étendre les commandes aux modes ACP/`non-interactive`, respecter les principes suivants :

1. **Destinataire différent** : en mode ACP, le destinataire des messages est l'IDE (extension Zed/VS Code), et non l'utilisateur final. Le contenu doit être en texte brut ou Markdown, sans styles ANSI spécifiques au terminal.
2. **Stratégie d'implémentation par branchement, non par remplacement** : la bonne approche consiste à ajouter une vérification du mode dans l'`action` de la commande. Le chemin `interactive` conserve la logique de rendu UI existante, tandis que le chemin `non_interactive`/`acp` retourne un `message` ou `submit_prompt` adapté à la consommation machine. Les deux chemins coexistent dans la même fonction `action`.
3. **Clarification sémantique des opérations avec état** : lors d'une invocation non interactive unique (ex. paramètre CLI `-p`), les modifications apportées par les commandes avec état comme `/model set` ou `/language set` ne sont valables que pour la session en cours. Cela doit être indiqué dans le texte de réponse.
4. **Lecture seule vs effets de bord** : les commandes en lecture seule (ex. `/about`, `/stats`) retournent directement le texte d'état actuel ; les commandes avec effets de bord (ex. `/model set`, `/language set`) doivent confirmer le résultat de l'opération dans la réponse.
5. **Éviter les effets de bord liés à l'environnement** : les opérations dépendant d'un environnement graphique comme l'ouverture d'un navigateur (`/docs`, `/insight`) ou la manipulation du presse-papiers (`/copy`) doivent être ignorées dans les chemins `non_interactive`/`acp`, et remplacées par le retour de l'URL ou du contenu directement dans le texte de réponse.

**Vue d'ensemble des commandes à étendre**

> Note : `btw`, `bug`, `compress`, `context`, `init`, `summary` ont déjà été étendus à tous les modes en Phase 1 et ne figurent pas dans cette liste.

Les 13 commandes suivantes seront étendues aux modes `non_interactive` et `acp` en Phase 2 :

**Catégorie A : l'`action` retourne déjà `message` ou `submit_prompt`, il suffit d'étendre `supportedModes` et de concevoir le contenu du message ACP**

| Commande      | Type de retour  | Points de traitement ACP/`non-interactive`               |
| ------------- | --------------- | -------------------------------------------------------- |
| `/copy`       | `message`       | Pas de presse-papiers en ACP, retourner le contenu ou une indication dans le texte de réponse |
| `/export`     | `message`       | Retourner le chemin complet du fichier exporté           |
| `/plan`       | `submit_prompt` | Aucune modification, étendre simplement le mode          |
| `/restore`    | `message`       | Retourner la description du résultat de l'opération de restauration |
| `/language`   | `message`       | Retourner le paramètre de langue actuel ou le texte de confirmation de modification |
| `/statusline` | `submit_prompt` | Aucune modification, étendre simplement le mode          |

**Catégorie A' : exécution normale avec arguments, déclenchement d'un `dialog` sans arguments (nécessite l'ajout d'un traitement `non-interactive` pour le chemin sans arguments)**

| Commande         | Comportement `interactive` sans arguments | Comportement `non_interactive`/`acp` sans arguments |
| ---------------- | ----------------------------------------- | --------------------------------------------------- |
| `/model`         | Ouvre le `dialog` de sélection de modèle  | Retourne le nom du modèle actuel et un texte explicatif |
| `/approval-mode` | Ouvre le `dialog` du mode d'approbation   | Retourne le mode d'approbation actuel et un texte explicatif |

**Catégorie B : l'`action` utilise `context.ui.addItem()` pour rendre un composant React, nécessite un branchement par mode pour retourner du texte brut**

| Commande   | Comportement `interactive`          | Contenu retourné en `non_interactive`/`acp`                                                        |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/about`   | Rend le composant React version/config | Résumé texte brut de la version, du modèle actuel et des configurations clés                       |
| `/stats`   | Rend le composant statistiques token/coût | Format texte brut des statistiques de session                                                      |
| `/insight` | Rend le composant d'analyse + ouvre le navigateur | `non_interactive` : génère de manière synchrone et retourne le chemin du fichier ; `acp` : pousse la progression et les résultats via `stream_messages` |
| `/docs`    | Rend le point d'entrée docs + ouvre le navigateur | Retourne l'URL de la documentation, n'ouvre pas le navigateur                                      |

**Catégorie C : traitement spécial**

| Commande | Comportement `interactive`                       | Comportement `non_interactive`/`acp`                                                                            |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/clear` | Appelle `context.ui.clear()` pour vider l'affichage du terminal | Retourne un message de délimitation de contexte avec le contenu `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Ouverture du canal d'appel des `prompt command` par le modèle

- Implémenter `getModelInvocableCommands()` dans `CommandService` (ou `CommandRegistry`) pour retourner toutes les commandes avec `modelInvocable: true`
- Marquer les commandes chargées par `BundledSkillLoader` et `FileCommandLoader` (commandes utilisateur/projet) avec `modelInvocable: true`
- **Les `MCP prompt` ne sont pas marqués `modelInvocable`** : ils sont appelés par le modèle via un mécanisme dédié de `MCP tool call`, sans passer par `SkillTool`
- Adapter `SkillTool` : au lieu de consommer uniquement `SkillManager.listSkills()`, il consomme également `CommandService.getModelInvocableCommands()`
- Construire une description unifiée des commandes appelables par le modèle et l'injecter dans la `description` de `SkillTool`

#### 2.3 Détection des `slash command` en milieu de saisie (version de base)

- Détecter le token slash près du curseur dans `InputPrompt` (pas uniquement en début de ligne)
- Après détection, suggérer le nom de la commande la plus pertinente via un `inline ghost text` (acceptation avec Tab)
- **N'inclut pas** le menu déroulant d'autocomplétion, les `argument hints`, les `source badge`, etc. (prévu en Phase 3)
- Le jeu de candidats pour le `ghost text` se limite aux commandes avec `modelInvocable: true` (skill / file command)

### Critères d'acceptation

**2.1 Extension des commandes**

- [ ] Catégorie A : `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` s'exécutent correctement en modes `non-interactive` et `acp` et retournent une sortie texte pertinente
- [ ] Catégorie A' : `/model`, `/approval-mode` retournent le texte d'état actuel en modes `non-interactive`/`acp` sans arguments (pas de `dialog`) ; avec arguments, appliquent la modification et retournent un texte de confirmation
- [ ] Catégorie B : `/about`, `/stats`, `/docs` retournent du texte brut en modes `non-interactive`/`acp`, `/docs` n'ouvre pas le navigateur ; `/insight` génère de manière synchrone et retourne un message avec le chemin du fichier en `non_interactive`, et pousse la progression via `stream_messages` en `acp`
- [ ] Catégorie C : `/clear` retourne un message de délimitation de contexte en modes `non-interactive`/`acp`, sans appeler `context.ui.clear()`
- [ ] Toutes les commandes étendues conservent un comportement strictement identique en mode `interactive` par rapport à avant le refactoring (aucune régression)

**2.2 Appel par le modèle**

- [ ] Le modèle peut appeler les `bundled skill` et `file command` (utilisateur/projet) via `SkillTool` pendant la conversation
- [ ] Les `MCP prompt` ne passent pas par `SkillTool` et sont appelés nativement par le modèle via le mécanisme `MCP tool call`
- [ ] Le modèle ne peut pas appeler les `built-in commands` (`userInvocable: true`, `modelInvocable: false`)
- [ ] La `description` de `SkillTool` inclut les descriptions de toutes les commandes `modelInvocable`

**2.3 `slash command` en milieu de saisie**

- [ ] `slash command` en milieu de saisie : après saisie de `/` dans le corps du texte, suggestion de la commande la plus pertinente via `inline ghost text` (acceptation avec Tab)

---

## Phase 3 : Alignement de l'expérience (amélioration de l'autocomplétion + ajout des commandes manquantes de Claude Code)

### Objectif

S'appuyer sur les métadonnées et capacités des Phases 1/2 pour finaliser l'expérience d'autocomplétion et ajouter les commandes présentes dans Claude Code mais absentes de Qwen Code.

### Fonctionnalités

#### 3.1 Amélioration de l'expérience d'autocomplétion

**`source badge`**

- Afficher l'étiquette de source de la commande dans le menu d'autocomplétion (`[MCP]` existe déjà, étendu à `[Skill]`, `[Custom]`, etc.)
- Rendu via les champs `source` / `sourceLabel`

**`argument hint`**

- Afficher `argumentHint` après le nom de la commande dans le menu d'autocomplétion (ex. `set <model-id>`)
- `argumentHint` fourni par le champ de métadonnées de la Phase 1

**Tri par utilisation récente**

- Enregistrer les commandes récemment utilisées par l'utilisateur (niveau session, sans persistance)
- Pondérer les commandes récentes dans le tri de l'autocomplétion

**Mise en évidence des correspondances d'alias**

- Indiquer explicitement lorsque l'autocomplétion correspond à `altNames` plutôt qu'au nom principal (ex. `help (alias: ?)`)

**Alignement de la stratégie de résolution des conflits**

- Définir la priorité : `built-in` > `bundled`/`skill-dir` > `plugin` > `mcp`
- En cas de conflit, renommer la commande de priorité inférieure (ex. `pluginName.commandName`)

#### 3.2 Version complète des `slash command` en milieu de saisie

- Ajouter l'affichage des `argument hints` et `source badge` à la version de base de la Phase 2
- Suggestion `ghost text` (affichage en gris de `/help` lors de la saisie de `/he`)
- Mise en surbrillance des tokens de commande valides (les commandes slash correspondantes s'affichent dans une couleur différente)

#### 3.3 Refactorisation du répertoire `/help`

Transformer `/help` d'une liste plate en un répertoire groupé :

- **Built-in Commands** (`local` + `local-jsx`, avec indication du mode)
- **Bundled Skills**
- **Custom Commands** (commandes `file` utilisateur/projet)
- **Plugin Commands**
- **MCP Commands**

Pour chaque commande : afficher le nom, `argumentHint`, `description`, `source`, et l'indicateur `supportedModes`

#### 3.4 Amélioration des métadonnées des commandes disponibles pour l'ACP

Exposer davantage de métadonnées au client ACP dans `sendAvailableCommandsUpdate()` :

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (liste des noms)
- `modelInvocable`

#### 3.5 Ajout des commandes manquantes de Claude Code

Ajouter les commandes courantes présentes dans Claude Code mais absentes de Qwen Code :

| Commande         | Type    | Description                                     |
| ---------------- | ------- | ----------------------------------------------- |
| `/doctor`        | `local` | Auto-diagnostic de l'environnement, sortie du diagnostic de configuration/connexion/outils |
| `/release-notes` | `local` | Affiche les notes de version de la version actuelle |
| `/cost`          | `local` | Affiche la consommation de tokens et l'estimation des coûts pour la session en cours |

> Note : les commandes de type tâche comme `/review`, `/commit` sont fournies sous forme de `bundled skill` et ne font pas partie de cette liste.

### Critères d'acceptation

- [ ] Le menu d'autocomplétion affiche les `source badge` (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Le menu d'autocomplétion affiche `argumentHint` (ex. `set <model-id>`)
- [ ] Les commandes récemment utilisées apparaissent en priorité dans la liste d'autocomplétion
- [ ] Le nom original est indiqué dans l'élément d'autocomplétion en cas de correspondance d'alias
- [ ] `slash command` en milieu de saisie : le `ghost text` s'affiche correctement
- [ ] La sortie de `/help` est groupée par source, chaque commande affiche l'indicateur des modes pris en charge
- [ ] Les commandes disponibles pour l'ACP incluent les champs `argumentHint`, `source`, `subcommands`
- [ ] Les trois commandes `/doctor`, `/release-notes`, `/cost` sont fonctionnelles
- [ ] `/doctor` s'exécute en mode `non-interactive` (retourne un `message`)

---

## Dépendances entre les Phases

```
Phase 1（元数据 + 统一过滤）
    │
    ├──► Phase 2（能力扩展）
    │        │
    │        ├──► slash command 子命令拆分
    │        └──► prompt command 模型调用（需要 getModelInvocableCommands()）
    │
    └──► Phase 3（体验对齐）
             │
             ├──► source badge（需要 Phase 1 source 字段）
             ├──► argument hint（需要 Phase 1 argumentHint 字段）
             └──► Help 分组（需要 Phase 1 source 字段）
```

Les Phases 2 et 3 ne dépendent pas l'une de l'autre et peuvent être menées en parallèle (ou certains sous-éléments peuvent être réorganisés selon les priorités).