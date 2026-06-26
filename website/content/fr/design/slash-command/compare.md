# Plan de refonte du module Qwen Code Command

## 1. Définition des objectifs

Ce plan repose sur l'unique principe suivant :

- **L'architecture du code peut ne pas copier Claude Code**
- **Mais les fonctionnalités principales, l'expérience utilisateur et l’interaction du système de commandes doivent être alignées à 95 % avec Claude Code**

Par « alignement », on entend les capacités directement perceptibles par l'utilisateur, notamment :

1. Couverture des sources de commandes
2. Aide et découvrabilité des commandes
3. Autocomplétion des commandes et expérience de saisie slash en milieu de champ
4. Disponibilité ACP / non interactive
5. Capacité d'appel des commandes prompt / compétences (skills) par le modèle

Cette refonte ne consiste pas à ajouter quelques champs ni à bricoler l’actuel `SlashCommand`, mais à faire évoluer le module de commandes d’une « capacité annexe de l’interface interactive » vers une « plateforme unifiée de commandes, transverse aux modes interactif / ACP / non interactif / modèle ».

---

## 2. Conclusion après réécriture

Les problèmes du système de commandes actuel de Qwen ne sont pas une absence totale de capacités, mais :

1. Une complétude seulement sur le chemin principal interactif
2. Un modèle de types trop léger pour porter l’envergure produit de Claude
3. Une dépendance aux listes blanches (whitelist) en ACP / non interactif, avec une extensibilité très limitée
4. Des sources de commandes existantes mais sans unifier un modèle mental visible pour l’utilisateur
5. Une dissociation entre les commandes prompt et l’exposition des compétences du modèle

Le nouveau plan doit donc résoudre quatre choses simultanément :

1. **Combler le périmètre fonctionnel de Claude Code**
2. **Conserver l’avantage architectural du modèle de résultat unifié de Qwen**
3. **Établir une architecture unifiée registry / resolver / executor / adapter**
4. **Faire en sorte que l’aide, l’autocomplétion, les commandes disponibles ACP et la documentation partagent les mêmes métadonnées**

---

## 3. Principes de refonte

### 3.1 Priorité à l’alignement fonctionnel plutôt qu’à l’alignement d’implémentation

Ce qui peut différer :

- Noms de classes internes
- Découpage des modules
- Implémentation des exécuteurs (executor)
- Structure effect / outcome

Ce qui ne peut pas différer :

- Couverture des sources de commandes sensiblement réduite
- Expérience d’aide et d’autocomplétion sensiblement dégradée
- Disponibilité ACP / non interactif sensiblement dégradée
- Intégration des commandes prompt et des capacités du modèle sensiblement réduite

En cas d’arbitrage, la priorité est :

1. Alignement de l’expérience utilisateur
2. Alignement de la couverture fonctionnelle des commandes
3. Alignement de la cohérence des modes
4. Simplicité de l’implémentation interne

### 3.2 Conserver le modèle de résultat unifié de Qwen

Il n’est pas recommandé de copier mécaniquement l’implémentation d’exécution de Claude.

Le modèle de résultat unifié actuel de Qwen mérite d’être conservé car il est naturellement adapté à :

- La prise en main par l’interface utilisateur (UI)
- L’approbation / confirmation
- L’orchestration des outils (tool scheduling)
- La soumission de prompts
- L’adaptation entre modes

Mais il doit être mis à niveau pour porter des capacités de commandes au niveau de Claude, et non plus rester un cadre de commandes simplifié pour l’interface utilisateur.

### 3.3 Découpler complètement type, source, mode et visibilité

Le nouveau modèle de commandes doit au minimum séparer les dimensions suivantes :

1. **Type** : comment la commande s’exécute
2. **Source** : d’où vient la commande
3. **Capacité de mode** : dans quels environnements d’exécution elle est disponible
4. **Visibilité** : visible pour l’utilisateur ou pour le modèle

---

## 4. Capacités de Claude Code à aligner

### 4.1 Types de commandes

Qwen doit prendre en charge explicitement trois types de commandes :

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Sources de commandes

Le schéma de commandes de Qwen doit couvrir les sources suivantes dès la première phase :

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

Il ne faut plus reculer en disant « on ne supporte d’abord que les quelques catégories actuelles ».

### 4.3 Métadonnées des commandes

Au minimum, ajouter les champs suivants :

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

### 4.4 Capacités d’expérience

Au minimum, ajouter les expériences suivantes :

1. Complétion par alias
2. Badge de source
3. Indication des paramètres
4. Tri par utilisation récente
5. Détection et complétion de slash en milieu de champ
6. Aide par catalogue des commandes
7. Expression complète des commandes disponibles ACP

---

## 5. Nouveau modèle de commandes

## 5.1 Structure centrale

Il est recommandé d’introduire un `CommandDescriptor` unifié, comme format d’enregistrement de toutes les commandes.

Il comprend au moins quatre parties :

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

- `type` : `prompt | local | local-jsx`
- `supportedModes` : `interactive | acp | non_interactive`
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

- Produit des actifs de prompt / skill
- Supporte par défaut les modes interactif / ACP / non interactif
- Peut être invoqué par l’utilisateur ou par le modèle

### `local`

Utilisé pour :

- Commandes de requête
- Commandes de configuration
- Commandes d’état exécutables en mode headless
- Point d’entrée principal de la plupart des commandes built-in

Caractéristiques :

- Ne dépend pas de l’interface utilisateur
- Doit devenir le principal type porteur pour l’ACP et le non interactif

### `local-jsx`

Utilisé pour :

- Picker
- Panels
- Wizard
- Shell interactif de l’interface utilisateur

Caractéristiques :

- Ne traite que l’interface utilisateur interactive
- Ne peut plus être le seul point d’entrée d’exécution
- Doit fournir un fallback ou une sous-commande `local` correspondante

---

## 6. Modèle de source des commandes

## 6.1 Modèle de source externe

C’est le modèle de source présenté à l’utilisateur, qui doit être aussi cohérent que possible avec le modèle mental de Claude Code :

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

Cet ensemble de champs sera utilisé directement pour :

- Les groupes d’aide
- Le badge de source dans l’autocomplétion
- Les commandes disponibles ACP
- L’exportation de documentation

## 6.2 Modèle de normalisation interne

Pour ne pas être lié par les noms externes, on ajoute une couche de champs d’implémentation en interne :

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Cela permet de :

- Aligner l’expérience externe sur Claude
- Conserver en interne une maintenabilité Qwen

## 6.3 Stratégie de conflit

Gestion unifiée par `id` stable, avec séparation du nom d’affichage et du nom de saisie :

1. `id` : identifiant unique stable
2. `name` : nom principal de saisie
3. `userFacingName` : nom d’affichage dans l’aide / l’autocomplétion

Priorité de conflit suggérée :

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. mcp (namespace indépendant)

---

## 7. Architecture d’exécution unifiée

## 7.1 `CommandRegistry`

Responsabilités :

1. Agréger tous les chargeurs (loader) / fournisseurs (provider)
2. Construire un index multidimensionnel
3. Produire les vues d’aide, d’autocomplétion, d’ACP et de documentation
4. Fournir des vues séparées des commandes visibles pour l’utilisateur et des commandes visibles pour le modèle

Fournisseurs obligatoirement supportés :

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Même si certains fournisseurs ne sont pas complètement mis en œuvre dans la première phase, le schéma et l’API doivent les supporter dès le départ.

## 7.2 `CommandResolver`

Responsabilités :

1. Résoudre les commandes slash
2. Résoudre les alias
3. Résoudre les chemins de sous-commandes
4. Identifier les tokens slash en milieu de champ
5. Produire une commande résolue canonique

## 7.3 `CommandExecutor`

Responsabilités :

1. Effectuer les vérifications de capacité (capability)
2. Exécuter `prompt | local | local-jsx`
3. Produire un outcome unifié
4. Gérer le fallback / le non supporté

## 7.4 `ModeAdapter`

Trois adaptateurs doivent être extraits :

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Ainsi, les trois modes peuvent partager le même registry et le même executor de commandes, au lieu d’avoir des implémentations codées en dur séparément.

---

## 8. Principes de refonte des commandes UI : séparation commandes principales et coquille interactive

C’est la clé pour que l’ACP et le mode non interactif soient réellement utilisables.

Toute commande qui est actuellement par essence « ouvre un dialogue » doit être transformée en :

1. Un shell interactif
2. Un ensemble de sous-commandes `local`

### Première liste de commandes à décomposer

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Exemple de forme cible

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

## 9. Conception unifiée des commandes prompt / skills

C’est le P0 de la refonte, pas une capacité à ajouter après coup.

## 9.1 Objectif

Établir un **registre unifié des commandes prompt invocables par le modèle**, fusionnant les actifs suivants en une seule vue invocable par le modèle :

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 Champs clés

À ajouter obligatoirement :

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` ou description minimale des paramètres
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Relation avec `SkillTool`

Après la refonte, `SkillTool` ne doit plus consommer uniquement les skills au sens étroit.

Il faut plutôt :

1. `CommandRegistry.getModelInvocablePromptCommands()` produit une vue unifiée
2. `SkillTool` (ou un futur outil de commande unifié) consomme cette vue
3. Les commandes slash de l’utilisateur et l’invocation de skills par le modèle partagent le même pool d’actifs de commandes prompt

Ainsi Qwen peut s’approcher, en termes d’expérience, de la façon dont Claude traite des commandes comme `/review`, `/commit`, `/openspec-apply`.

---

## 10. Refonte de l’aide / autocomplétion / découvrabilité

## 10.1 Autocomplétion

Les éléments d’autocomplétion doivent au moins afficher :

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

Le tri doit au moins prendre en compte :

1. Correspondance exacte
2. Correspondance par alias
3. Utilisation récente
4. Correspondance par préfixe
5. Correspondance floue (fuzzy)

## 10.2 Slash en milieu de champ

Doit être complété :

1. Détection du token slash près du curseur
2. Indication de texte fantôme (ghost text)
3. Complétion par Tab
4. Surbrillance des tokens de commande valides

La première phase aligne d’abord l’expérience de saisie ; l’introduction d’une « sémantique d’exécution de commande intégrée » plus forte pourra être traitée dans une itération ultérieure.

## 10.3 Aide

L’aide n’est plus une simple liste à plat, mais un catalogue complet de commandes.

Au moins, regrouper par :

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

Chaque commande affiche au moins :

1. Nom
2. Indication des paramètres
3. Description
4. Source
5. Modes supportés
6. Indication si invocable par le modèle
7. Résumé des sous-commandes

---

## 11. Refonte ACP / Non interactif

## 11.1 Abandon complet de l’approche par liste blanche

Ancienne approche :

- Liste blanche built-in
- Traitement spécial pour FILE / SKILL
- Autres types de résultat non supportés

Nouvelle approche :

- Chaque commande déclare sa propre capacité (capability)
- Le registry se charge du filtrage
- L’adaptateur (adapter) se charge de l’exécution et du fallback

## 11.2 Support des outcomes

### interactif

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

## 11.3 Sortie des commandes disponibles ACP

Doit au minimum contenir :

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

## 12. Documentation, aide, autocomplétion partagent les mêmes métadonnées

Après la refonte, les éléments suivants doivent être exportés à partir d’une même vue du registre :

1. Aide
2. Autocomplétion
3. Commandes disponibles ACP
4. Exportation de documentation

Cela résout le problème actuel où « l’implémentation, l’aide et la documentation présentent trois ensembles de commandes incohérents ».

---

## 13. Phases de mise en œuvre

## Phase 1 : Reconstruction des fondations

Livrables :

1. Nouveau `CommandDescriptor`
2. Schéma complet des sources
3. Modèle de capabilities
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

Ces commandes doivent toutes avoir été transformées en « shell interactif + sous-commandes local ».

## Phase 3 : Intégration des capacités du modèle

Livrables :

1. `SkillTool` connecté à la vue unifiée du registre
2. File command / bundled skill / mcp prompt / plugin skill intégrés dans un ensemble unifié invocable par le modèle
3. Commandes prompt et actifs skill complètement unifiés

## Phase 4 : Alignement de l’expérience sur Claude

Livrables :

1. Tri par utilisation récente
2. Badge de source
3. Indication des paramètres (argument hint)
4. Badge de mode
5. Catalogue d’aide complet
6. Expérience de slash en milieu de champ
7. Exportation ou validation automatique de la documentation

---

## 14. Critères de validation

Après la refonte, au moins :

1. L’aide, l’autocomplétion, l’ACP et la documentation expriment toutes le modèle de source complet
2. À l’exception des commandes purement UI, la plupart des commandes built-in sont utilisables en ACP / non interactif
3. Les commandes prompt et l’invocation de skills par le modèle utilisent le même pool d’actifs
4. L’expérience des commandes (aide, autocomplétion, expression des sources, indication des paramètres, expérience de slash en milieu de champ) atteint 95 % du niveau de Claude Code
5. On ne dépend plus d’une liste blanche built-in pour maintenir les capacités de commandes en ACP / non interactif

---

## 15. Conclusion finale

L’essence de cette refonte n’est pas « d’ajouter quelques champs supplémentaires au SlashCommand actuel », mais :

- **Livrer, avec le style architectural interne de Qwen, une plateforme de commandes dont l’expérience externe est alignée à 95 % avec Claude Code**

S’il faut choisir entre les deux :

- Implémentation interne qui ressemble plus à Claude
- Expérience externe qui ressemble plus à Claude

Ce plan choisit clairement la seconde option.