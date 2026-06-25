# Feuille de route de refactorisation des commandes slash

## Objectif général

Utiliser le style architectural interne de Qwen pour livrer une plateforme de commandes alignée à 95 % sur l'expérience externe de Claude Code, tout en résolvant les trois problèmes fondamentaux : la fragmentation des trois modes, la source unique des commandes, et l'impossibilité pour le modèle d'appeler les commandes `prompt`.

---

## Principes de conception fondamentaux

1. **Chaque phase peut être livrée indépendamment** : le comportement après une phase est cohérent, aucune phase future n'est nécessaire pour l'exécution.
2. **La phase 1 est une infrastructure pure** : à l'exception de la correction de l'interception erronée de `MCP_PROMPT`, elle ne modifie aucun ensemble de commandes existant.
3. **Séparation des changements de comportement et des changements d'architecture** : la phase 1 traite l'architecture, la phase 2 l'extension des capacités.
4. **Ne pas copier l'architecture interne de Claude Code** : mais s'aligner sur les capacités perceptibles par l'utilisateur.

---

## Phase 1 : Reconstruction de l'infrastructure (architecture pure, zéro changement de comportement)

### Objectif

Établir un modèle de métadonnées unifié pour les commandes et un mécanisme de gestion inter-modes, fournissant le socle sous-jacent pour toutes les phases ultérieures.

### Points fonctionnels

#### 1.1 Extension du modèle de métadonnées `SlashCommand`

Ajouter les nouveaux champs suivants à l'interface `SlashCommand` existante :

**Champs de source**

- `source: CommandSource` : énumération de la source de la commande (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string` : étiquette de source à afficher (par ex. `"Built-in"` / `"MCP: github-server"`)

**Champs de capacité de mode**

- `supportedModes: ExecutionMode[]` : déclare dans quels modes d'exécution la commande est disponible (`interactive` / `non_interactive` / `acp`)

**Champs de type d'exécution**

- `commandType: CommandType` : déclare le type d'exécution (`prompt` / `local` / `local-jsx`)

**Champs de visibilité**

- `userInvocable: boolean` : l'utilisateur peut-il invoquer la commande via une commande slash (par défaut `true`)
- `modelInvocable: boolean` : le modèle peut-il invoquer la commande via un appel d'outil (par défaut `false`)

**Champs de métadonnées auxiliaires** (réservés pour la phase 3, définis mais non utilisés en phase 1)

- `argumentHint?: string` : indication d'argument, par ex. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string` : description du moment où invoquer cette commande (à l'usage du modèle)
- `examples?: string[]` : exemples d'utilisation

#### 1.2 Les chargeurs remplissent les champs `source`/`commandType`

Chaque chargeur doit remplir les champs `source` et `commandType` lors de la construction d'un `SlashCommand` :

| Chargeur                          | source              | commandType                            |
| --------------------------------- | ------------------- | -------------------------------------- |
| `BuiltinCommandLoader`            | `builtin-command`   | déclaré par chaque commande (`local` / `local-jsx`) |
| `BundledSkillLoader`              | `bundled-skill`     | `prompt`                               |
| `FileCommandLoader` (utilisateur/projet) | `skill-dir-command` | `prompt`                               |
| `FileCommandLoader` (plugin)      | `plugin-command`    | `prompt`                               |
| `McpPromptLoader`                 | `mcp-prompt`        | `prompt`                               |

#### 1.3 Les commandes intégrées déclarent `supportedModes` et `commandType`

Pour toutes les commandes intégrées, déclarer explicitement :

- `commandType` : `local` (sans dépendance UI) ou `local-jsx` (dépendant de dialog/React)
- `supportedModes` : les commandes de type `local` déclarent `['interactive', 'non_interactive', 'acp']` ; les commandes de type `local-jsx` déclarent `['interactive']`

#### 1.4 Remplacer la liste blanche codée en dur par un filtrage basé sur les capacités

- Supprimer la constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Supprimer la fonction `filterCommandsForNonInteractive`
- Ajouter une fonction `filterCommandsForMode(commands, mode)` qui filtre en fonction du champ `supportedModes`
- Ajouter une fonction utilitaire `getEffectiveSupportedModes(cmd)` (prenant en compte la stratégie par défaut de `CommandKind`)
- Modifier les signatures de `handleSlashCommand` / `getAvailableCommands` en supprimant le paramètre `allowedBuiltinCommandNames`

#### 1.5 `CommandService` devient un registre unifié

- Ajouter la méthode `getCommandsForMode(mode: ExecutionMode)`
- Ajouter la méthode `getModelInvocableCommands()` (utilisée en phases 2/3, l'interface est fournie en phase 1)
- La méthode existante `getCommands()` reste inchangée (utilisée en mode interactif)

### Critères d'acceptation

- [ ] L'interface `SlashCommand` inclut tous les nouveaux champs, la compilation TypeScript réussit
- [ ] Tous les chargeurs remplissent les champs `source` et `commandType`
- [ ] Toutes les commandes intégrées déclarent `commandType` et `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` a été supprimé, remplacé par un filtre de capacité
- [ ] **L'ensemble des commandes disponibles en mode non interactif est strictement identique à avant la refactorisation** (les tests existants ne cassent pas)
- [ ] Les commandes MCP prompt s'exécutent correctement en modes non interactif et ACP (correction de la restriction erronée précédente)
- [ ] `CommandService.getCommandsForMode('non_interactive')` retourne le bon ensemble de commandes
- [ ] Tous les tests existants sont réussis

---

## Phase 2 : Extension des capacités (réorganisation des commandes et appel des commandes `prompt` par le modèle)

### Objectif

Sur la base des métadonnées de la phase 1, étendre la disponibilité des commandes dans les trois modes et ouvrir la voie à l'appel des commandes `prompt` par le modèle.

### Points fonctionnels

#### 2.1 Étendre l'ensemble des commandes disponibles en modes non interactif / ACP

**Principes de conception sémantique pour l'ACP**

Avant d'étendre les commandes aux modes ACP/non interactif, respecter les principes de conception suivants :

1. **Destinataire différent** : en mode ACP, le destinataire des messages est l'IDE (plugin Zed/VS Code), et non l'utilisateur du terminal. Le contenu du message doit être en texte brut ou Markdown, sans inclure de styles ANSI propres au terminal.
2. **Stratégie d'implémentation : ajouter des branches de mode, ne pas remplacer** : la bonne approche consiste à ajouter une vérification de mode à l'intérieur de l'`action` de la commande – le chemin interactif conserve la logique de rendu UI existante, les chemins non interactif/ACP retournent un `message` ou `submit_prompt` adapté à la consommation machine. Les deux chemins coexistent dans la même fonction `action`.
3. **Les opérations avec état doivent expliquer leur sémantique** : lors d'un appel non interactif unique (par ex. paramètre `-p` en CLI), les modifications des commandes avec état comme `/model set`, `/language set` ne sont valables que pour la session en cours ; cela doit être mentionné dans le texte de réponse.
4. **Lecture seule vs avec effet de bord** : les commandes en lecture seule (par ex. `/about`, `/stats`) retournent directement l'état actuel sous forme de texte ; les commandes avec effets de bord (par ex. `/model set`, `/language set`) doivent confirmer le résultat de l'opération dans la réponse.
5. **Éviter les effets de bord dépendants de l'environnement** : les opérations nécessitant un environnement graphique (ouverture de navigateur – `/docs`, `/insight` ; manipulation du presse‑papiers – `/copy`) doivent être sautées dans les chemins non interactif/ACP, et retourner l'URL ou le contenu pertinent dans le texte de réponse.

**Vue d'ensemble des commandes à étendre**

> Remarque : `btw`, `bug`, `compress`, `context`, `init`, `summary` ont déjà été étendus à tous les modes en phase 1 et ne figurent pas dans cette liste.

Les 13 commandes suivantes seront étendues aux modes `non_interactive` et `acp` en phase 2 :

**Classe A : l'action retourne déjà `message` ou `submit_prompt`, il suffit d'étendre `supportedModes` et de concevoir le contenu du message ACP**

| Commande       | Type de retour   | Points de traitement ACP/non interactif                       |
| -------------- | ---------------- | -------------------------------------------------------------- |
| `/copy`        | `message`        | En ACP pas de presse-papiers ; retourner le contenu lui-même ou une indication dans le texte de réponse |
| `/export`      | `message`        | Retourner le chemin complet du fichier exporté                 |
| `/plan`        | `submit_prompt`  | Aucune modification nécessaire, étendre le mode directement    |
| `/restore`     | `message`        | Retourner la description du résultat de la restauration        |
| `/language`    | `message`        | Retourner le réglage actuel de la langue ou un texte de confirmation de changement |
| `/statusline`  | `submit_prompt`  | Aucune modification nécessaire, étendre le mode directement    |

**Classe A' : s'exécute normalement avec paramètres, déclenche un dialog sans paramètres (nécessite un traitement non interactif pour le chemin sans paramètres)**
| Commande          | Comportement sans argument (interactive) | Comportement sans argument (non_interactive/acp) |
| ---------------- | ---------------------------------------- | ------------------------------------------------ |
| `/model`         | Ouvre un dialogue de sélection de modèle | Retourne le nom du modèle actuel et le texte de description |
| `/approval-mode` | Ouvre le dialogue du mode d'approbation  | Retourne le mode d'approbation actuel et le texte de description |

**Catégorie B : Utilisation interne de `context.ui.addItem()` pour rendre un composant React, doit ajouter une branche de mode pour renvoyer du texte brut**

| Commande    | Comportement interactif                   | Contenu retourné en non_interactive/acp                          |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `/about`    | Affiche un composant React de version/configuration | Résumé textuel brut du numéro de version, du modèle actuel et de la configuration clé |
| `/stats`    | Affiche un composant de statistiques token/coûts | Format texte brut des statistiques de session                    |
| `/insight`  | Affiche un composant d'analyse + ouvre le navigateur | `non_interactive` : génère et retourne le chemin du fichier de manière synchrone ; `acp` : pousse la progression et les résultats via `stream_messages` |
| `/docs`     | Affiche une entrée de documentation + ouvre le navigateur | Retourne l'URL de la documentation, n'ouvre pas le navigateur |

**Catégorie C : Traitement spécial**

| Commande     | Comportement interactif                                  | Comportement non_interactive/acp                                                        |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/clear`     | Appelle `context.ui.clear()` pour effacer l'affichage du terminal | Retourne un message de marqueur de limite de contexte, contenu : `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Intégration de l'appel de modèle pour les commandes prompt

- Implémenter `getModelInvocableCommands()` dans `CommandService` (ou `CommandRegistry`), qui retourne toutes les commandes avec `modelInvocable: true`
- Marquer les commandes chargées par `BundledSkillLoader`, `FileCommandLoader` (commandes utilisateur/projet) comme `modelInvocable: true`
- **Ne pas marquer les prompts MCP comme `modelInvocable`** : les prompts MCP sont appelés par le modèle via le mécanisme indépendant d'appel d'outil MCP, sans passer par `SkillTool`
- Modifier `SkillTool` : passer de l'utilisation exclusive de `SkillManager.listSkills()` à l'utilisation conjointe de `CommandService.getModelInvocableCommands()`
- Construire une description uniforme des commandes invocables par le modèle et l'injecter dans la description de `SkillTool`

#### 2.3 Détection de commande slash en milieu de saisie (version de base)

- Détecter le token slash près du curseur dans `InputPrompt` (pas seulement en début de ligne)
- Après détection du token slash, afficher le nom de la commande correspondant le mieux via un texte fantôme en ligne (accepté par Tab)
- **Ne pas** inclure de menu déroulant de complétion, d'indications d'arguments, de badge de source, etc. (fait dans la Phase 3)
- L'ensemble des candidats pour le texte fantôme se limite aux commandes avec `modelInvocable: true` (commande skill/file)

### Critères d'acceptation

**2.1 Extension des commandes**

- [ ] Catégorie A : `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` s'exécutent correctement en mode non-interactive et acp et retournent une sortie textuelle significative
- [ ] Catégorie A' : `/model`, `/approval-mode` sans argument retournent le texte d'état actuel en non-interactive/acp (sans ouvrir de dialogue) ; avec argument, effectuent la modification et retournent un texte de confirmation
- [ ] Catégorie B : `/about`, `/stats`, `/docs` retournent du texte brut en non-interactive/acp, `/docs` n'ouvre pas le navigateur ; `/insight` en `non_interactive` génère et retourne un message avec le chemin du fichier de manière synchrone, en `acp` pousse la progression via `stream_messages`
- [ ] Catégorie C : `/clear` en non-interactive/acp retourne un message de marqueur de limite de contexte, n'appelle pas `context.ui.clear()`
- [ ] Toutes les commandes étendues ont un comportement en mode interactif identique à avant la refactorisation (aucune régression)

**2.2 Appel de modèle**

- [ ] Le modèle peut, en cours de conversation, appeler des skills groupés et des commandes de fichier (utilisateur/projet) via `SkillTool`
- [ ] Les prompts MCP ne passent pas par `SkillTool`, ils sont appelés nativement par le modèle via le mécanisme d'appel d'outil MCP
- [ ] Le modèle ne peut pas appeler les commandes intégrées (`userInvocable: true`, `modelInvocable: false`)
- [ ] La description de `SkillTool` contient les descriptions de toutes les commandes `modelInvocable`

**2.3 Saisie de slash en milieu de ligne**

- [ ] Saisie de slash en milieu de ligne : après avoir saisi `/` dans le texte, afficher la commande la mieux correspondante via un texte fantôme en ligne (accepté par Tab)

---

## Phase 3 : Alignement de l'expérience (amélioration de la complétion + ajout des commandes de Claude Code)

### Objectif

Sur la base des métadonnées et des capacités de commandes des Phases 1/2, compléter l'expérience de complétion et ajouter les commandes présentes dans Claude Code mais manquantes dans Qwen Code.

### Points fonctionnels

#### 3.1 Amélioration de l'expérience de complétion

**Badge de source**

- Afficher dans le menu de complétion une étiquette de source de commande (`[MCP]` existe déjà, étendre à `[Skill]`, `[Custom]`, etc.)
- Utiliser les champs `source` / `sourceLabel` pour le rendu

**Indication d'argument**

- Afficher `argumentHint` après le nom de la commande dans le menu de complétion (ex. `set <model-id>`)
- `argumentHint` est fourni par les champs de métadonnées de la Phase 1

**Tri par utilisation récente**

- Enregistrer les commandes récemment utilisées par l'utilisateur (niveau session, pas besoin de persistance)
- Pondérer les commandes récemment utilisées dans le tri de complétion

**Mise en évidence des alias**

- Lorsque la complétion correspond à `altNames` plutôt qu'au nom principal, l'indiquer lors de l'affichage (ex. `help (alias: ?)`)

**Alignement de la stratégie de conflit**

- Clarifier la priorité : intégré > groupé/répertoire de skills > plugin > mcp
- En cas de conflit, renommer la commande de moindre priorité (ex. `pluginName.commandName`)

#### 3.2 Version complète de la commande slash en milieu de saisie

- Ajouter l'affichage des indications d'arguments et des badges de source par rapport à la version de base de la Phase 2
- Indication par texte fantôme (afficher `/help` en grisé lors de la saisie de `/he`)
- Mise en évidence des tokens de commande valides (la commande slash correspondant est affichée dans une couleur différente)

#### 3.3 Restructuration de l'aide

Passer `/help` d'une liste plate à un répertoire groupé :

- **Built-in Commands** (local + local-jsx, indiquer le mode)
- **Bundled Skills**
- **Custom Commands** (commandes de fichier utilisateur/projet)
- **Plugin Commands**
- **MCP Commands**

Chaque commande affiche : nom, argumentHint, description, source, indicateur supportedModes

#### 3.4 Renforcement des métadonnées des commandes disponibles ACP

Exposer davantage de métadonnées aux clients ACP dans `sendAvailableCommandsUpdate()` :

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (liste des noms)
- `modelInvocable`

#### 3.5 Ajout des commandes manquantes de Claude Code

Confirmer et réintroduire la commande `/doctor` existante dans Qwen Code ; `/release-notes` n'est pas inclus dans cette phase pour éviter d'introduire une commande intégrée sans besoin produit clair.

| Commande   | Type    | Description                                                                 |
| ---------- | ------- | --------------------------------------------------------------------------- |
| `/doctor`  | `local` | Auto-diagnostic de l'environnement, affiche l'état de la configuration, de la connexion et des outils |

> Note : Les commandes de type tâche comme `/review`, `/commit` sont fournies sous forme de skills groupés, et ne sont pas incluses ici.

### Critères d'acceptation

- [ ] Le menu de complétion affiche les badges de source (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Le menu de complétion aff
---

## Dépendances des Phases

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

Les Phases 2 et 3 n'ont pas de dépendances entre elles, elles peuvent être avancées en parallèle (ou certains sous-éléments peuvent être réorganisés selon les priorités).
