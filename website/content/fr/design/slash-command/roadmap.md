# Slash Command – Roadmap de réarchitecture

## Objectif général

Livrer, selon le style architectural interne de Qwen, une plateforme de commandes alignée à 95 % sur l’expérience externe de Claude Code, tout en résolvant les trois problèmes fondamentaux : la fragmentation des trois modes, l’unicité de la source des commandes, et l’impossibilité pour le modèle d’invoquer les commandes de type prompt.

---

## Principes de conception fondamentaux

1. **Chaque phase peut être livrée indépendamment** : son comportement est cohérent sans nécessiter de phase ultérieure pour fonctionner.
2. **La phase 1 est une infrastructure pure** : en dehors de la correction de l’interception erronée de `MCP_PROMPT`, elle ne modifie aucun ensemble de commandes actuellement disponible.
3. **Séparation des changements comportementaux et architecturaux** : la phase 1 concerne l’architecture, la phase 2 l’extension des capacités.
4. **Ne pas copier l’architecture interne de Claude Code** : mais aligner les fonctionnalités perceptibles par l’utilisateur.

---

## Phase 1 : Reconstruction de l’infrastructure (architecture pure, aucun changement de comportement)

### Objectif

Établir un modèle de métadonnées unifié pour les commandes et un mécanisme de gestion inter‑modes, fournissant ainsi le socle pour toutes les phases suivantes.

### Fonctionnalités

#### 1.1 Extension du modèle de métadonnées `SlashCommand`

Ajouter les champs suivants à l’interface `SlashCommand` existante :

**Champ source**

- `source: CommandSource` : enum de la provenance de la commande (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string` : libellé de provenance affiché (par exemple `"Built-in"` / `"MCP: github-server"`)

**Champs de capacité par mode**

- `supportedModes: ExecutionMode[]` : déclare les modes d’exécution disponibles (`interactive` / `non_interactive` / `acp`)

**Champ de type d’exécution**

- `commandType: CommandType` : déclare le type d’exécution (`prompt` / `local` / `local-jsx`)

**Champs de visibilité**

- `userInvocable: boolean` : l’utilisateur peut‑il invoquer la commande via un slash ? (par défaut `true`)
- `modelInvocable: boolean` : le modèle peut‑il l’invoquer par appel d’outil ? (par défaut `false`)

**Champs de métadonnées auxiliaires** (réservés pour la phase 3 ; phase 1 : définition uniquement, pas d’utilisation)

- `argumentHint?: string` : indice d’argument, par exemple `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string` : description du cas d’usage de la commande (destiné au modèle)
- `examples?: string[]` : exemples d’utilisation

#### 1.2 Les chargeurs renseignent les champs `source` et `commandType`

Chaque chargeur, lors de la construction d’un `SlashCommand`, doit renseigner `source` et `commandType` :

| Chargeur                          | source              | commandType                            |
| --------------------------------- | ------------------- | -------------------------------------- |
| `BuiltinCommandLoader`            | `builtin-command`   | déclaré par chaque commande (`local` / `local-jsx`) |
| `BundledSkillLoader`              | `bundled-skill`     | `prompt`                               |
| `FileCommandLoader` (utilisateur/projet) | `skill-dir-command` | `prompt`                               |
| `FileCommandLoader` (plugin)      | `plugin-command`    | `prompt`                               |
| `McpPromptLoader`                 | `mcp-prompt`        | `prompt`                               |

#### 1.3 Les commandes intégrées déclarent `supportedModes` et `commandType`

Pour toutes les commandes intégrées, déclarer explicitement :

- `commandType` : `local` (sans dépendance à une UI) ou `local-jsx` (dépend d’un dialogue/React)
- `supportedModes` : les commandes `local` déclarent `['interactive', 'non_interactive', 'acp']` ; les commandes `local-jsx` déclarent `['interactive']`

#### 1.4 Remplacement de la liste blanche codée en dur par un filtrage par capacités

- Supprimer la constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Supprimer la fonction `filterCommandsForNonInteractive`
- Ajouter la fonction `filterCommandsForMode(commands, mode)` qui filtre en fonction du champ `supportedModes`
- Ajouter la fonction utilitaire `getEffectiveSupportedModes(cmd)` (en tenant compte de la stratégie par défaut de `CommandKind`)
- Modifier les signatures de `handleSlashCommand` / `getAvailableCommands` pour supprimer le paramètre `allowedBuiltinCommandNames`

#### 1.5 CommandService passe en registre unifié

- Ajouter la méthode `getCommandsForMode(mode: ExecutionMode)`
- Ajouter la méthode `getModelInvocableCommands()` (pour les phases 2/3 ; phase 1 fournit l’interface)
- Conserver `getCommands()` inchangé (utilisé en mode interactif)

### Critères de validation

- [ ] L’interface `SlashCommand` contient tous les nouveaux champs et la compilation TypeScript réussit
- [ ] Tous les chargeurs renseignent les champs `source` et `commandType`
- [ ] Toutes les commandes intégrées déclarent `commandType` et `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` a été supprimé et remplacé par un filtre de capacités
- [ ] **L’ensemble des commandes disponibles en mode non‑interactif est strictement identique à avant la refonte** (les tests existants ne sont pas cassés)
- [ ] Les commandes MCP prompt s’exécutent correctement en modes non‑interactif et ACP (l’ancienne restriction erronée est corrigée)
- [ ] `CommandService.getCommandsForMode('non_interactive')` renvoie le bon jeu de commandes
- [ ] Tous les tests existants passent

---

## Phase 2 : Extension des capacités (réorganisation des commandes et invocation des commandes prompt par le modèle)

### Objectif

Sur la base des métadonnées de la phase 1, étendre la couverture des commandes dans les trois modes et ouvrir la voie à l’invocation des commandes prompt par le modèle.

### Fonctionnalités

#### 2.1 Extension de l’ensemble des commandes disponibles en modes non‑interactif / ACP

**Principes de conception sémantique pour l’ACP**

Avant d’étendre les commandes aux modes ACP/non‑interactif, respecter les principes suivants :

1. **Destinataire différent** : en mode ACP, le destinataire des messages est l’IDE (plugin Zed/VS Code), et non l’utilisateur du terminal. Le contenu doit être en texte brut ou Markdown, sans style ANSI propre aux terminaux.
2. **Stratégie d’implémentation** : ajouter des branches de mode, ne pas remplacer. Dans la fonction `action` de la commande, ajouter une vérification de mode : le chemin interactif conserve sa logique d’affichage UI actuelle ; les chemins `non_interactive`/`acp` renvoient un `message` ou un `submit_prompt` adapté à une consommation automatique. Les deux chemins coexistent dans la même fonction `action`.
3. **Les opérations avec état doivent préciser leur sémantique** : lors d’un appel non‑interactif unique (par exemple l’option `-p` du client CLI), les changements de commandes avec état comme `/model set`, `/language set` ne sont valables que pour la session en cours ; cela doit être indiqué dans le texte de réponse.
4. **Lecture seule vs effet de bord** : les commandes en lecture seule (comme `/about`, `/stats`) renvoient directement l’état actuel en texte ; les commandes avec effet de bord (comme `/model set`, `/language set`) confirment le résultat dans la réponse.
5. **Éviter les effets de bord liés à l’environnement** : les actions nécessitant un environnement graphique (ouverture du navigateur pour `/docs`, `/insight`, manipulation du presse‑papiers pour `/copy`) doivent être ignorées dans les chemins `non_interactive`/`acp`, en renvoyant à la place l’URL ou le contenu pertinent dans le texte de réponse.

**Vue d’ensemble des commandes à étendre**

> Remarque : les commandes `btw`, `bug`, `compress`, `context`, `init`, `summary` ont déjà été étendues à tous les modes lors de la phase 1 et ne figurent pas dans la liste de cette phase.

Les 13 commandes suivantes seront étendues aux modes `non_interactive` et `acp` lors de la phase 2 :

**Catégorie A : l’action renvoie déjà un `message` ou un `submit_prompt`, il suffit d’étendre `supportedModes` et de concevoir le contenu du message ACP**

| Commande      | Type de retour  | Points à traiter pour ACP/non‑interactif                      |
| ------------- | --------------- | ------------------------------------------------------------ |
| `/copy`       | `message`       | En mode ACP, pas de presse‑papiers ; renvoyer le contenu lui‑même ou une indication dans le texte de réponse |
| `/export`     | `message`       | Renvoyer le chemin complet du fichier exporté                |
| `/plan`       | `submit_prompt` | Aucune modification nécessaire, étendre directement `supportedModes` |
| `/restore`    | `message`       | Renvoyer la description du résultat de la restauration       |
| `/language`   | `message`       | Renvoyer le texte confirmant le réglage ou le changement de langue |
| `/statusline` | `submit_prompt` | Aucune modification nécessaire, étendre directement `supportedModes` |

**Catégorie A' : avec argument, exécution normale ; sans argument, déclenchement d’un dialogue (ajouter un traitement non‑interactif pour le chemin sans argument)**

| Commande         | Comportement interactif sans argument | Comportement `non_interactive`/`acp` sans argument |
| ---------------- | ------------------------------------- | -------------------------------------------------- |
| `/model`         | Ouvre le dialogue de sélection du modèle | Renvoie le nom du modèle actuel et un texte explicatif |
| `/approval-mode` | Ouvre le dialogue de mode d’approbation | Renvoie le mode d’approbation actuel et un texte explicatif |

**Catégorie B : l’action utilise `context.ui.addItem()` pour afficher des composants React ; ajouter une branche de mode qui renvoie du texte brut**

| Commande    | Comportement interactif                | Contenu renvoyé en `non_interactive`/`acp`               |
| ----------- | -------------------------------------- | -------------------------------------------------------- |
| `/about`    | Affiche un composant React version/config | Résumé textuel : numéro de version, modèle courant, configuration clé |
| `/stats`    | Affiche un composant de statistiques (tokens/frais) | Format textuel des statistiques de session               |
| `/insight`  | Affiche un composant d’analyse + ouvre le navigateur | `non_interactive` : génère et renvoie le chemin du fichier de manière synchrone ; `acp` : envoie la progression et le résultat via `stream_messages` |
| `/docs`     | Affiche le point d’entrée de la documentation + ouvre le navigateur | Renvoie l’URL de la documentation sans ouvrir le navigateur |

**Catégorie C : traitement spécial**

| Commande   | Comportement interactif                             | Comportement `non_interactive`/`acp`                  |
| ---------- | --------------------------------------------------- | ----------------------------------------------------- |
| `/clear`   | Appelle `context.ui.clear()` pour effacer le terminal | Renvoie un message marqueur de limite de contexte, avec le contenu `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Invocation des commandes prompt par le modèle

- Dans `CommandService` (ou `CommandRegistry`), implémenter `getModelInvocableCommands()`, qui renvoie toutes les commandes avec `modelInvocable: true`
- Marquer les commandes chargées par `BundledSkillLoader` et `FileCommandLoader` (commandes utilisateur/projet) comme `modelInvocable: true`
- **Les prompts MCP ne sont pas marqués `modelInvocable`** : ils sont invoqués par le modèle via le mécanisme indépendant d’appel d’outils MCP, sans passer par `SkillTool`
- Refondre `SkillTool` : passer de la seule consommation de `SkillManager.listSkills()` à une consommation conjointe de `CommandService.getModelInvocableCommands()`
- Construire une description unifiée des commandes invocables par le modèle et l’injecter dans la `description` de `SkillTool`

#### 2.3 Détection des slashs en cours de saisie (version de base)

- Dans `InputPrompt`, détecter un jeton slash à proximité du curseur (pas seulement en début de ligne)
- Après détection, afficher via un texte fantôme en ligne (inline ghost text) la meilleure commande correspondante (Tab pour accepter)
- **Ne pas inclure** de menu de complétion déroulant, d’indices d’arguments, de badge de source, etc. (cela sera fait en phase 3)
- L’ensemble des candidats pour le texte fantôme se limite aux commandes avec `modelInvocable: true` (skills / file commands)

### Critères de validation

**2.1 Extension des commandes**

- [ ] Catégorie A : `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` s’exécutent correctement en modes non‑interactif et ACP et renvoient une sortie textuelle pertinente
- [ ] Catégorie A’ : `/model`, `/approval-mode` sans argument renvoient en modes non‑interactif/ACP un texte d’état (sans déclencher de dialogue) ; avec argument, exécutent la modification et renvoient un texte de confirmation
- [ ] Catégorie B : `/about`, `/stats`, `/docs` renvoient du texte brut en modes non‑interactif/ACP ; `/docs` n’ouvre pas le navigateur ; `/insight` en mode `non_interactive` génère et renvoie un message avec le chemin du fichier de manière synchrone, en mode `acp` envoie la progression via `stream_messages`
- [ ] Catégorie C : `/clear` en modes non‑interactif/ACP renvoie un message marqueur de limite de contexte, sans appeler `context.ui.clear()`
- [ ] Toutes les commandes étendues conservent un comportement strictement identique à avant la refonte en mode interactif (pas de régression)

**2.2 Invocation par le modèle**

- [ ] Le modèle peut, en cours de conversation, invoquer les skills intégrés et les commandes fichier (utilisateur/projet) via `SkillTool`
- [ ] Les prompts MCP ne passent pas par `SkillTool` : ils sont invoqués nativement par le modèle via le mécanisme d’appel d’outils MCP
- [ ] Le modèle ne peut pas invoquer les commandes intégrées (`userInvocable: true`, `modelInvocable: false`)
- [ ] La `description` de `SkillTool` contient la description de toutes les commandes `modelInvocable`

**2.3 Slash en cours de saisie**

- [ ] En cours de saisie : saisir `/` dans le texte affiche via un texte fantôme en ligne la meilleure commande correspondante (Tab pour accepter)

---

## Phase 3 : Alignement de l’expérience (complétion améliorée + rattrapage des commandes Claude Code)

### Objectif

Sur la base des métadonnées et des capacités des commandes des phases 1 et 2, compléter l’expérience de complétion et ajouter les commandes présentes dans Claude Code mais absentes de Qwen Code.

### Fonctionnalités

#### 3.1 Amélioration de l’expérience de complétion

**Badge de source**

- Afficher le libellé de provenance dans le menu de complétion (`[MCP]` existe déjà, étendre à `[Skill]`, `[Custom]`, etc.)
- Utiliser les champs `source` / `sourceLabel` pour le rendu

**Indice d’argument**

- Afficher l’`argumentHint` après le nom de la commande dans le menu de complétion (par exemple `set <model-id>`)
- `argumentHint` est fourni par les métadonnées de la phase 1

**Tri par utilisation récente**

- Enregistrer les commandes récemment utilisées par l’utilisateur (niveau session, pas de persistance nécessaire)
- Pondérer le tri des complétions en faveur des commandes récemment utilisées

**Surlignage des correspondances d’alias**

- Lorsque la complétion correspond à `altNames` plutôt qu’au nom principal, l’indiquer dans l’affichage (par exemple `help (alias: ?)`)

**Stratégie de conflit alignée**

- Priorité claire : built-in > bundled/skill-dir > plugin > mcp
- En cas de conflit, renommer la commande de moindre priorité (par exemple `pluginName.commandName`)

#### 3.2 Version complète du slash en cours de saisie

- Enrichir la version de base de la phase 2 avec les indices d’arguments et les badges de source
- Indication par texte fantôme (lors de la saisie de `/he`, afficher un aperçu estompé de `/help`)
- Surlignage des jetons de commande valides (les slashs correspondant à une commande déjà complétée s’affichent dans une couleur différente)

#### 3.3 Restructuration du menu d’aide `/help`

Passer `/help` d’une liste à plat à une arborescence groupée :

- **Commandes intégrées** (local + local-jsx, avec mention du mode)
- **Skills intégrés**
- **Commandes personnalisées** (commandes fichier utilisateur/projet)
- **Commandes de plugins**
- **Commandes MCP**

Chaque commande affiche : nom, argumentHint, description, source, indicateur des modes supportés (`supportedModes`)

#### 3.4 Enrichissement des métadonnées des commandes disponibles en mode ACP

Dans `sendAvailableCommandsUpdate()`, exposer davantage de métadonnées au client ACP :

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (liste des noms)
- `modelInvocable`

#### 3.5 Rattrapage des commandes manquantes par rapport à Claude Code

Confirmer et réintégrer la commande `/doctor` déjà présente dans Qwen Code ; ne pas inclure `/release-notes` dans cette phase pour éviter d’ajouter superficiellement une commande intégrée sans besoin produit clair.

| Commande    | Type    | Description                                     |
| ----------- | ------- | ----------------------------------------------- |
| `/doctor`   | `local` | Auto‑diagnostic d’environnement : état de la configuration, des connexions, des outils |

> Remarque : les commandes de type tâche comme `/review`, `/commit` sont fournies sous forme de skills intégrés, elles ne figurent pas ici.

### Critères de validation

- [ ] Le menu de complétion affiche les badges de source (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Le menu de complétion affiche l’`argumentHint` (par exemple `set <model-id>`)
- [ ] Les commandes récemment utilisées apparaissent en priorité dans la liste de complétion
- [ ] En cas de correspondance via un alias, la complétion indique le nom original
- [ ] Les slashs en cours de saisie : le texte fantôme s’affiche correctement
- [ ] `/help` s’affiche sous forme d’onglets à la Claude Code, sans accumulation de commandes, et chaque page de commande montre les modes supportés
- [ ] Les commandes disponibles en ACP incluent les champs `argumentHint`, `source`, `subcommands`
- [ ] La commande `/doctor` est disponible
- [ ] `/doctor` peut s’exécuter en mode non‑interactif (renvoie un `message`)
- [ ] Aucune nouvelle commande `/release-notes` n’est ajoutée

---

## Dépendances entre phases

```
Phase 1 (métadonnées + filtrage unifié)
    │
    ├──► Phase 2 (extension des capacités)
    │        │
    │        ├──► division des sous‑commandes slash
    │        └──► invocation des commandes prompt par le modèle (nécessite getModelInvocableCommands())
    │
    └──► Phase 3 (alignement de l’expérience)
             │
             ├──► badge de source (nécessite le champ source de la phase 1)
             ├──► indice d’argument (nécessite le champ argumentHint de la phase 1)
             └──► regroupement de l’aide (nécessite le champ source de la phase 1)
```

Les phases 2 et 3 ne dépendent pas l’une de l’autre et peuvent être menées en parallèle (ou certains sous‑éléments peuvent être échangés selon les priorités).