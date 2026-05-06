# Plan de refonte du module Command de Qwen Code

## 1. Définition des objectifs

Ce plan repose sur un seul principe fondamental :

- **L'architecture du code ne doit pas nécessairement copier celle de Claude Code**
- **Mais les fonctionnalités principales, l'expérience d'utilisation et l'interactivité du système de commandes doivent atteindre 95 % de parité avec Claude Code**

Ici, « parité » désigne les capacités directement perceptibles par l'utilisateur, notamment :

1. Couverture des sources de commandes
2. Aide et découvrabilité des commandes
3. Complétion des commandes et expérience des `mid-input slash command`
4. Disponibilité en mode ACP / `non-interactive`
5. Capacité d'invocation par le modèle pour les `prompt command` / `skill`

Cette refonte ne consiste pas à ajouter quelques champs ni à retoucher légèrement l'actuel `SlashCommand`. Il s'agit de faire évoluer le module `command` d'une « fonctionnalité annexe de l'UI interactive » vers une « plateforme de commandes unifiée pour les modes interactive / ACP / non-interactive / model ».

---

## 2. Conclusions après réécriture

Les problèmes du système `command` actuel de Qwen ne résident pas dans une absence totale de capacités, mais dans le fait que :

1. Il n'est complet que sur le chemin principal `interactive`
2. Le modèle de types est trop léger pour supporter un produit au niveau de Claude
3. Les modes ACP / `non-interactive` dépendent d'une `allowlist`, ce qui limite fortement l'extensibilité
4. Bien que les sources de commandes existent, elles ne forment pas une vision unifiée et visible pour l'utilisateur
5. Les `prompt command` et le système d'exposition des `skill` du modèle sont cloisonnés

La nouvelle approche doit donc résoudre simultanément quatre points :

1. **Combler les écarts de fonctionnalités avec Claude Code**
2. **Conserver les avantages techniques du modèle `outcome` unifié de Qwen**
3. **Mettre en place une architecture unifiée `registry` / `resolver` / `executor` / `adapter`**
4. **Faire partager les mêmes métadonnées à l'aide, la complétion, les `ACP available commands` et la documentation**

---

## 3. Principes de refonte

### 3.1 La parité fonctionnelle prime sur la parité d'implémentation

Différences autorisées :

- Noms des classes internes
- Découpage des modules
- Implémentation des exécuteurs
- Structure `effect` / `outcome`

Différences non autorisées :

- Réduction notable de la couverture des sources de commandes
- Dégradation notable de l'aide et de la complétion des commandes
- Réduction notable de la disponibilité en mode ACP / `non-interactive`
- Diminution notable de l'intégration entre `prompt command` et les capacités du modèle

En cas de compromis, les priorités sont les suivantes :

1. Parité de l'expérience utilisateur
2. Parité de la couverture des capacités de commandes
3. Cohérence des modes
4. Simplicité de l'implémentation interne

### 3.2 Conserver le modèle `outcome` unifié de Qwen

Il est déconseillé de copier mécaniquement l'implémentation d'exécution de Claude.

Le modèle de résultat unifié actuel de Qwen mérite d'être conservé, car il est naturellement adapté à :

- Prise en charge par l'UI
- Approbation / confirmation
- Orchestration des `tool`
- Soumission de `prompt`
- Adaptation inter-modes

Il doit cependant être évolué pour supporter des capacités de commandes au niveau de Claude, au lieu de rester un framework de commandes UI simplifié.

### 3.3 Découplage strict du type, de la source, du mode et de la visibilité

Le nouveau modèle `command` doit au minimum séparer les dimensions suivantes :

1. **Type** : comment la commande est exécutée
2. **Source** : d'où provient la commande
3. **Capacités par mode** : dans quels environnements d'exécution elle est disponible
4. **Visibilité** : visible pour l'utilisateur ou pour le modèle

---

## 4. Capacités de Claude Code à aligner

### 4.1 Types de commandes

Qwen doit prendre en charge explicitement trois types de commandes :

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Sources de commandes

Le schéma `command` de Qwen doit couvrir dès la première phase les sources suivantes :

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

Il n'est plus question de revenir à « ne supporter que les catégories déjà existantes pour commencer ».

### 4.3 Métadonnées des commandes

Au minimum, les champs suivants doivent être ajoutés :

1. `argumentHint`
2. `whenToUse`
3. `examples`
4. `sourceLabel`
5. `userFacingName`
6. `alias`
7. `immediate`
8. `isSensitive`
9. `userInvocable`
10. `modelInvocable`
11. `supportedModes`
12. `requiresUi`

### 4.4 Capacités UX

Au minimum, les expériences suivantes doivent être implémentées :

1. Complétion sur correspondance d'`alias`
2. Badge de source
3. Indication des paramètres
4. Tri par `recently used`
5. Détection et complétion des `mid-input slash command`
6. Aide sous forme de catalogue de commandes
7. Expression complète des `ACP available commands`

---

## 5. Nouveau modèle `command`

## 5.1 Structure principale

Il est recommandé d'introduire un `CommandDescriptor` unifié, servant de format d'enregistrement pour toutes les commandes.

Il doit au minimum comporter quatre parties :

1. `identity`
2. `metadata`
3. `capabilities`
4. `handler`

### `identity`

- `id`
- `name`
- `altNames`
- `canonicalPath`

### `metadata`

- `description`
- `argumentHint`
- `whenToUse`
- `examples`
- `group`
- `source`
- `sourceLabel`
- `userFacingName`
- `hidden`

### `capabilities`

- `type`: `prompt | local | local-jsx`
- `supportedModes`: `interactive | acp | non_interactive`
- `requiresUi`
- `supportsDialog`
- `supportsStreaming`
- `supportsToolInvocation`
- `supportsConfirmation`
- `remoteSafe`
- `readOnly`
- `immediate`
- `isSensitive`
- `userInvocable`
- `modelInvocable`

### `handler`

- `resolveArgs()`
- `execute()`
- `completion()`
- `fallback()`

---

## 5.2 Responsabilités des trois types de commandes

### `prompt`

Utilisé pour :

- skills
- file commands
- workflow prompt commands
- plugin skills
- mcp prompt / skill

Caractéristiques :

- Génère des assets `prompt` / `skill`
- Prend en charge par défaut `interactive` / ACP / `non-interactive`
- Peut être invoqué par l'utilisateur ou par le modèle

### `local`

Utilisé pour :

- Commandes de requête
- Commandes de configuration
- Commandes d'état exécutables en mode `headless`
- Point d'entrée d'exécution principal pour la plupart des `built-in commands`

Caractéristiques :

- Ne dépend pas de l'UI
- Doit devenir le type principal pour ACP / `non-interactive`

### `local-jsx`

Utilisé pour :

- `picker`
- Panneaux
- `wizard`
- Shell UI `interactive`

Caractéristiques :

- Gère uniquement l'UI `interactive`
- Ne peut plus être le seul point d'entrée d'exécution
- Doit fournir un `fallback` ou des sous-commandes `local` correspondantes

---

## 6. Modèle de sources de commandes

## 6.1 Modèle de sources externes

Ce modèle de sources, destiné aux utilisateurs, doit s'aligner autant que possible sur la logique de Claude Code :

- `builtin-command`
- `bundled-skill`
- `skill-dir-command`
- `workflow-command`
- `plugin-command`
- `plugin-skill`
- `dynamic-skill`
- `builtin-plugin-skill`
- `mcp-prompt`
- `mcp-skill`

Ces champs seront directement utilisés pour :

- Le regroupement dans l'aide
- Le badge de source dans la complétion
- Les `ACP available commands`
- L'export de documentation

## 6.2 Modèle de normalisation interne

Pour ne pas être contraint par les noms externes, une couche supplémentaire de champs d'implémentation est ajoutée en interne :

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Cela permet de :

- Aligner l'expérience externe sur Claude
- Conserver la maintenabilité interne propre à Qwen

## 6.3 Stratégie de résolution des conflits

Gestion unifiée via un `id` stable, avec séparation du nom d'affichage et du nom de saisie :

1. `id` : identifiant unique stable
2. `name` : nom principal de saisie
3. `userFacingName` : nom affiché dans l'aide/la complétion

Priorités recommandées en cas de conflit :

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. `namespace` MCP isolé

---

## 7. Architecture d'exécution unifiée

## 7.1 `CommandRegistry`

Responsabilités :

1. Agréger tous les `loader`/`provider`
2. Construire des index multidimensionnels
3. Générer les vues pour l'aide, la complétion, ACP et la documentation
4. Fournir des vues distinctes pour les commandes visibles par l'utilisateur et par le modèle

`provider` obligatoires à supporter :

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Même si certains `provider` ne sont pas entièrement opérationnels dès la première phase, le schéma et l'API doivent les prendre en charge dès le départ.

## 7.2 `CommandResolver`

Responsabilités :

1. Résoudre les `slash command`
2. Résoudre les `alias`
3. Résoudre les chemins de sous-commandes
4. Identifier les `mid-input slash token`
5. Produire la commande résolue canonique

## 7.3 `CommandExecutor`

Responsabilités :

1. Vérifier les `capabilities`
2. Exécuter `prompt | local | local-jsx`
3. Générer un `outcome` unifié
4. Gérer les `fallback` / cas non supportés

## 7.4 `ModeAdapter`

Trois `adapter` doivent être créés :

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Cela permet aux trois modes de partager le même `command registry` et `executor`, au lieu d'être codés en dur séparément.

---

## 8. Principes de refonte des commandes UI : séparation des commandes principales et du shell interactif

C'est la clé pour rendre ACP et `non-interactive` véritablement utilisables.

Toute commande dont la nature actuelle est « ouvrir un `dialog` » doit être transformée en :

1. Un shell `interactive`
2. Un ensemble de sous-commandes `local`

### Première vague de commandes à découpler

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Exemple de structure cible

#### `/model`

- `/model`
- `/model show`
- `/model list`
- `/model set <id>`

#### `/permissions`

- `/permissions`
- `/permissions show`
- `/permissions set <mode>`
- `/permissions allow <tool>`
- `/permissions deny <tool>`

#### `/mcp`

- `/mcp`
- `/mcp list`
- `/mcp show <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`

---

## 9. Conception unifiée des `Prompt Command` / `Skill`

Il s'agit d'une priorité P0 dans cette refonte, et non d'une fonctionnalité à ajouter ultérieurement.

## 9.1 Objectif

Créer un **`Model-Invocable Prompt Command Registry`** unifié, fusionnant les assets suivants en une seule vue invocable par le modèle :

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 Champs clés

Champs obligatoires à ajouter :

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` ou description minimale des paramètres
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Relation avec `SkillTool`

Après la refonte, `SkillTool` ne doit plus consommer uniquement des `skill` au sens strict.

Il faut plutôt :

1. `CommandRegistry.getModelInvocablePromptCommands()` génère une vue unifiée
2. `SkillTool` ou un futur `command tool` unifié consomme cette vue
3. Les `slash command` utilisateur et l'invocation de `skill` par le modèle partagent le même pool d'assets `prompt-command`

Cela permettra à Qwen de s'approcher de l'expérience offerte par Claude pour des capacités comme `/review`, `/commit` ou `/openspec-apply`.

---

## 10. Refonte de l'aide / de la complétion / de la découvrabilité

## 10.1 Completion

Les éléments de complétion doivent au minimum afficher :

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

Le tri doit au minimum prendre en compte :

1. Correspondance exacte
2. Correspondance d'`alias`
3. Utilisation récente
4. Correspondance par préfixe
5. Correspondance `fuzzy`

## 10.2 Mid-input slash command

Les éléments suivants doivent être implémentés :

1. Détection des `slash token` près du curseur
2. Affichage du `ghost text`
3. Validation via `Tab`
4. Mise en surbrillance des `token` de commande valides

La première phase alignera l'expérience de saisie ; l'introduction d'une « sémantique d'exécution de commande intégrée » plus poussée pourra être envisagée lors d'itérations ultérieures.

## 10.3 Help

L'aide ne sera plus une simple liste à plat, mais un catalogue complet de commandes.

Regroupement minimum :

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

Chaque commande doit au minimum afficher :

1. Nom
2. Indication des paramètres
3. Description
4. Source
5. Modes supportés
6. Invocable par le modèle (oui/non)
7. Résumé des sous-commandes

---

## 11. Refonte ACP / `Non-Interactive`

## 11.1 Abandon définitif de l'approche par `allowlist`

Ancienne approche :

- `allowlist` intégrée
- Cas spéciaux `FILE` / `SKILL`
- Autres types de résultats non supportés

Nouvelle approche :

- Chaque commande déclare ses propres `capabilities`
- Le `registry` gère le filtrage
- L'`adapter` gère l'exécution et le `fallback`

## 11.2 Objectifs de support des `outcome`

### interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### acp

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### non_interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 Sortie des `ACP available commands`

Doit au minimum inclure :

1. `name`
2. `description`
3. `argumentHint`
4. `source`
5. `examples`
6. `supportedModes`
7. `interactiveOnly`
8. `subcommands`
9. `modelInvocable`

---

## 12. Métadonnées partagées pour la documentation, l'aide et la complétion

Après la refonte, les éléments suivants doivent être exportés depuis une seule et même vue du `registry` :

1. Help
2. Completion
3. ACP available commands
4. Export de documentation

Cela vise à résoudre le problème actuel d'incohérence entre les trois représentations des commandes (implémentation, aide, documentation).

---

## 13. Phasage de l'implémentation

## Phase 1 : Refonte des fondations

Livrables :

1. Nouveau `CommandDescriptor`
2. Schéma complet des sources
3. Modèle de `capabilities`
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. Trois `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Phase 2 : Migration des commandes principales

Livrables :

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Toutes ces commandes doivent subir la refonte « shell `interactive` + sous-commandes `local` ».

## Phase 3 : Intégration des capacités du modèle

Livrables :

1. Intégration de `SkillTool` à la vue unifiée du `registry`
2. Inclusion des `file command` / `bundled skill` / `mcp prompt` / `plugin skill` dans l'ensemble unifié invocable par le modèle
3. Unification totale des assets `prompt command` et `skill`

## Phase 4 : Alignement de la couche UX sur Claude

Livrables :

1. Tri par `recently used`
2. Badge de source
3. Indication des paramètres
4. Badge de mode
5. Catalogue d'aide complet
6. Expérience `mid-input slash command`
7. Export ou validation automatique de la documentation

---

## 14. Critères d'acceptation

À l'issue du projet, les critères suivants doivent être remplis :

1. L'aide, la complétion, ACP et la documentation doivent toutes refléter le modèle complet des sources
2. À l'exception des commandes purement UI, la plupart des `built-in command` doivent être utilisables en mode ACP / `non-interactive`
3. Les `prompt command` et l'invocation de `skill` par le modèle doivent utiliser le même pool d'assets
4. L'expérience des commandes doit atteindre 95 % du niveau de Claude Code en termes d'aide, de complétion, d'expression des sources, d'indication des paramètres et d'expérience `mid-input`
5. Ne plus dépendre d'une `built-in allowlist` pour maintenir les capacités de commandes en mode ACP / `non-interactive`

---

## 15. Verdict final

L'essence de cette refonte n'est pas « d'ajouter quelques champs à l'actuel `SlashCommand` », mais plutôt :

- **Livrer, avec le style architectural interne de Qwen, une plateforme de commandes offrant 95 % de parité avec Claude Code sur le plan de l'expérience externe**

Si un choix s'impose entre :

- Une implémentation interne plus proche de Claude
- Une expérience externe plus proche de Claude

Ce plan choisit explicitement la seconde option.