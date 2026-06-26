# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer un travail ciblé à des agents IA configurés avec des prompts, des outils et des comportements spécifiques à la tâche.

## Que sont les sous-agents ?

Les sous-agents sont des assistants IA indépendants qui :

- **Se spécialisent dans des tâches spécifiques** – Chaque sous-agent est configuré avec un prompt système ciblé pour des types de travail particuliers
- **Ont un contexte séparé** – Ils maintiennent leur propre historique de conversation, distinct de votre chat principal
- **Utilisent des outils contrôlés** – Vous pouvez configurer les outils auxquels chaque sous-agent a accès
- **Travaillent de manière autonome** – Une fois une tâche confiée, ils travaillent indépendamment jusqu'à son achèvement ou son échec
- **Fournissent un retour détaillé** – Vous pouvez voir leur progression, leur utilisation des outils et leurs statistiques d'exécution en temps réel

## Sous-agent Fork

En plus des sous-agents nommés, Qwen Code prend en charge le **forking** — sélectionné explicitement avec `subagent_type: "fork"` (disponible dans les sessions interactives). Un fork hérite du contexte complet de conversation du parent et s'exécute en arrière-plan de manière détachée. Omettre `subagent_type` ne **fork** pas ; cela lance le sous-agent à usage général, qui s'exécute jusqu'à la fin et retourne son résultat en ligne.

### Différence entre Fork et les sous-agents nommés

|               | Sous-agent nommé                    | Sous-agent Fork                                         |
| ------------- | ----------------------------------- | ------------------------------------------------------- |
| Contexte      | Démarre à zéro, sans historique parent | Hérite de tout l'historique de conversation du parent |
| Prompt système| Utilise son propre prompt configuré | Utilise exactement le prompt système du parent (pour le partage de cache) |
| Exécution     | Bloque le parent jusqu'à la fin     | S'exécute en arrière-plan, le parent continue immédiatement |
| Cas d'usage   | Tâches spécialisées (tests, doc)    | Tâches parallèles nécessitant le contexte actuel        |

### Quand le Fork est utilisé

L'IA utilise automatiquement le fork lorsqu'elle a besoin de :

- Exécuter plusieurs tâches de recherche en parallèle (ex : « étudier les modules A, B et C »)
- Effectuer un travail en arrière-plan tout en poursuivant la conversation principale
- Déléguer des tâches qui nécessitent la compréhension du contexte de conversation actuel

### Partage du cache de prompt

Tous les forks partagent exactement le même préfixe de requête API que le parent (prompt système, outils, historique de conversation), permettant des hits de cache de prompt DashScope. Lorsque 3 forks s'exécutent en parallèle, le préfixe partagé est mis en cache une fois et réutilisé — économisant plus de 80% de coûts de tokens par rapport à des sous-agents indépendants.

### Prévention du Fork récursif

Les enfants fork ne peuvent pas créer d'autres forks. Ceci est appliqué à l'exécution — si un fork tente de générer un autre fork, il reçoit une erreur lui demandant d'exécuter les tâches directement.

### Limitations actuelles

- **Aucun retour de résultat** : Les résultats des forks sont reflétés dans l'affichage de progression de l'interface utilisateur mais ne sont pas automatiquement réinjectés dans la conversation principale. L'IA parent voit un message placeholder et ne peut pas agir sur la sortie du fork.
- **Pas d'isolation du worktree** : Les forks partagent le répertoire de travail du parent. Des modifications de fichiers concurrentes provenant de plusieurs forks peuvent entrer en conflit.

## Avantages clés

- **Spécialisation des tâches** : Créez des agents optimisés pour des workflows spécifiques (tests, documentation, refactoring, etc.)
- **Isolation du contexte** : Gardez le travail spécialisé séparé de votre conversation principale
- **Héritage du contexte** : Les sous-agents fork héritent de la conversation complète pour les tâches parallèles qui nécessitent beaucoup de contexte
- **Partage du cache de prompt** : Les sous-agents fork partagent le préfixe de cache du parent, réduisant les coûts de tokens
- **Réutilisabilité** : Sauvegardez et réutilisez les configurations d'agents entre projets et sessions
- **Accès contrôlé** : Limitez les outils que chaque agent peut utiliser pour la sécurité et la concentration
- **Visibilité de la progression** : Surveillez l'exécution des agents avec des mises à jour de progression en temps réel

## Comment fonctionnent les sous-agents

1. **Configuration** : Vous créez des configurations de sous-agents qui définissent leur comportement, leurs outils et leurs prompts système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux sous-agents appropriés — ou se forker elle-même (`subagent_type: "fork"`) lorsqu'elle souhaite hériter du contexte complet de la conversation et ignorer la sortie intermédiaire
3. **Exécution** : Les sous-agents travaillent indépendamment, en utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution à la conversation principale

## Pour commencer

### Démarrage rapide

1. **Créez votre premier sous-agent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérez les agents existants** :

   `/agents manage`

   Visualisez et gérez vos sous-agents configurés.

3. **Utilisez les sous-agents automatiquement** : Demandez simplement à l'IA principale d'effectuer des tâches qui correspondent aux spécialisations de vos sous-agents. L'IA déléguera automatiquement le travail approprié.

### Exemple d'utilisation

```
Utilisateur : « Veuillez écrire des tests complets pour le module d'authentification »
IA : Je vais déléguer cette tâche à votre sous-agent spécialiste des tests.
[Délègue au sous-agent "testing-expert"]
[Affiche la progression en temps réel de la création des tests]
[Retourne avec les fichiers de test terminés et un résumé d'exécution]
```

## Gestion

### Commandes CLI

Les sous-agents sont gérés via la commande slash `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent via un assistant pas à pas.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue de gestion interactive pour visualiser et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown à plusieurs emplacements :

- **Au niveau du projet** : `.qwen/agents/` (priorité la plus élevée)
- **Au niveau de l'utilisateur** : `~/.qwen/agents/` (solution de repli)
- **Au niveau de l'extension** : Fournis par les extensions installées

Cela vous permet d'avoir des agents spécifiques au projet, des agents personnels qui fonctionnent sur tous les projets, et des agents fournis par des extensions qui ajoutent des capacités spécialisées.

### Sous-agents d'extension

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l'extension et suivent le même format que les agents personnels et de projet.

Les sous-agents d'extension :

- Sont automatiquement découverts lorsque l'extension est activée
- Apparaissent dans la boîte de dialogue `/agents manage` sous la section « Agents d'extension »
- Ne peuvent pas être modifiés directement (modifiez plutôt la source de l'extension)
- Suivent le même format de configuration que les agents définis par l'utilisateur

Pour voir quelles extensions fournissent des sous-agents, vérifiez le fichier `qwen-extension.json` de l'extension pour un champ `agents`.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec un frontmatter YAML. Ce format est lisible par l'homme et facile à éditer avec n'importe quel éditeur de texte.

#### Structure de base

```
---
name: nom-agent
description: Brève description de quand et comment utiliser cet agent
model: inherit # Optionnel : inherit, fast, modelId, ou authType:modelId
approvalMode: auto-edit # Optionnel : default, plan, auto-edit, yolo, bubble
tools:         # Optionnel : liste d'autorisation d'outils
  - outil1
  - outil2
disallowedTools: # Optionnel : liste de blocage d'outils
  - outil3
---

Contenu du prompt système ici.
Plusieurs paragraphes sont supportés.
```

#### Sélection du modèle

Utilisez le champ optionnel `model` du frontmatter pour contrôler quel modèle un sous-agent utilise :

- `inherit` : Utilise le même modèle que la conversation principale.
- Omettre le champ : Identique à `inherit`.
- `fast` : Utilise le `fastModel` configuré. Si aucun fastModel valide n'est configuré,
  le sous-agent revient à `inherit`.
- `glm-5` : Utilise cet ID de modèle. Qwen Code vérifie d'abord le type d'authentification
  de la conversation principale ; si le modèle n'y est pas disponible, il peut résoudre le modèle
  depuis un autre fournisseur configuré.
- `openai:gpt-4o` : Utilise un fournisseur explicite et un ID de modèle. Ceci est utile lorsqu'un
  sous-agent doit s'exécuter sur un modèle enregistré sous un type d'authentification différent
  de celui de la conversation principale.

Par exemple :

```
---
name: relecteur-rapide
description: Relit les petites diffs avec le modèle rapide configuré
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: chercheur-openai
description: Utilise un fournisseur compatible OpenAI pour les tâches de recherche
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

Le sélecteur `fast` utilise le même paramètre `fastModel` configuré dans
`settings.json` ou avec `/model --fast`. Ce paramètre peut lui-même faire référence à un
modèle sous un autre type d'authentification configuré, comme `openai:deepseek-v4-flash`.
Lorsque le sélecteur résout un autre type d'authentification, Qwen Code crée un
fournisseur d'exécution dédié pour cette requête de sous-agent et envoie au fournisseur uniquement l'ID
de modèle brut.

#### Mode d'autorisation

Utilisez le champ optionnel `approvalMode` du frontmatter pour contrôler la façon dont les appels d'outils d'un sous-agent sont approuvés. Valeurs valides :

- `default` : Les outils nécessitent une approbation interactive (identique à la valeur par défaut de la session principale)
- `plan` : Mode analyse uniquement — l'agent planifie mais n'exécute pas de modifications
- `auto-edit` : Les outils sont automatiquement approuvés sans invite (recommandé pour la plupart des agents)
- `yolo` : Tous les outils sont automatiquement approuvés, y compris ceux potentiellement destructeurs
- `bubble` : Les approbations d'outils des agents en arrière-plan sont remontées dans la session parent

Si vous omettez ce champ, le mode d'autorisation du sous-agent est déterminé automatiquement :

- Si la session parent est en mode **yolo** ou **auto-edit**, le sous-agent hérite de ce mode. Un parent permissif reste permissif.
- Si la session parent est en mode **plan**, le sous-agent reste en mode plan. Une session en mode analyse uniquement ne peut pas modifier les fichiers via un agent délégué.
- Si la session parent est en mode **default** (dans un dossier de confiance), le sous-agent obtient **auto-edit** afin de pouvoir travailler de manière autonome.

Lorsque vous définissez `approvalMode`, les modes permissifs du parent ont toujours la priorité. Par exemple, si le parent est en mode yolo, un sous-agent avec `approvalMode: plan` s'exécutera toujours en mode yolo.

```
---
name: relecteur-prudent
description: Relit le code sans apporter de modifications
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

Vous êtes un relecteur de code. Analysez le code et rapportez les résultats.
Ne modifiez aucun fichier.
```

#### Configuration des outils

Utilisez `tools` et `disallowedTools` pour contrôler les outils auxquels un sous-agent peut accéder.

**`tools` (liste d'autorisation) :** Lorsqu'elle est spécifiée, le sous-agent ne peut utiliser que les outils listés. Lorsqu'elle est omise, le sous-agent hérite de tous les outils disponibles de la session parent.

```
---
name: lecteur
description: Agent en lecture seule pour l'exploration du code
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (liste de blocage) :** Lorsqu'elle est spécifiée, les outils listés sont retirés de l'ensemble d'outils du sous-agent. Ceci est utile lorsque vous voulez « tout sauf X » sans lister chaque outil autorisé.

```
---
name: travailleur-securise
description: Agent qui ne peut pas modifier les fichiers
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Si `tools` et `disallowedTools` sont tous deux définis, la liste d'autorisation est appliquée en premier, puis la liste de blocage supprime de cet ensemble.

**Les outils MCP** suivent les mêmes règles. Si un sous-agent n'a pas de liste `tools`, il hérite de tous les outils MCP de la session parent. Si un sous-agent a une liste `tools` explicite, il reçoit uniquement les outils MCP qui sont explicitement nommés dans cette liste.

Le champ `disallowedTools` prend en charge les motifs au niveau du serveur MCP :

- `mcp__server__nom_outil` — bloque un outil MCP spécifique
- `mcp__server` — bloque tous les outils de ce serveur MCP

```
---
name: sans-slack
description: Agent sans accès Slack
disallowedTools:
  - mcp__slack
---
```

#### Champs de compatibilité Claude Code

Qwen Code accepte les champs de frontmatter Claude Code 2.1.168 ci-dessous afin
que vous puissiez déposer un fichier d'agent CC dans `.qwen/agents/` et que les champs
supportés soient analysés de manière identique. Les champs optionnels avec des valeurs invalides sont
silencieusement abandonnés lors de l'analyse plutôt que rejetés — la même posture indulgente utilisée par CC.

| Champ            | Type             | Notes                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode` | chaîne enum      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Mappé sur `approvalMode` lors de l'analyse ; lorsque les deux sont définis, le `approvalMode` explicite l'emporte.                                                                                        |
| `maxTurns`       | entier positif   | Limite le budget de tours de l'agent. Connecté à `runConfig.max_turns` à l'exécution ; lorsque les deux sont définis, le champ de premier niveau l'emporte. La valeur imbriquée héritée est supprimée du fichier sur disque lors de la sauvegarde pour éviter deux sources de vérité. |
| `color`          | chaîne enum      | Couleur d'affichage. Liste d'autorisation : `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (reflète le `_Y` de CC). La sentinelle héritée `auto` de Qwen est préservée pour la rétrocompatibilité. Les autres valeurs sont silencieusement abandonnées lors de l'analyse. |
| `mcpServers`     | enregistrement de specs | Remplacements de serveur MCP par agent. Fusionnés avec l'ensemble de serveurs MCP de la session lorsque l'agent est créé ; en cas de collision de clé, la spec de l'agent l'emporte (correspondant à la sémantique `scope: 'agent'` de CC). Les entrées malformées sont abandonnées par clé avec un avertissement plutôt que de faire échouer tout l'agent. |
| `hooks`          | enregistrement de tableaux | Hooks par agent. Les clés sont les noms d'événements de hook CC (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …) ; les valeurs sont des tableaux de définitions `{ matcher?, hooks: [...] }` dans la même forme que le champ `hooks` de `settings.json`. Enregistrés pendant l'exécution de l'agent, supprimés lorsqu'il s'arrête. |

Exemple avec tout ce qui précède :

```
---
name: relecteur-rigoureux
description: Relecture de code approfondie avec un plafond de tours
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "l'agent de relecture est sur le point d'exécuter une commande shell"
---

Vous êtes un relecteur de code. Analysez le code en profondeur et rapportez les résultats
classés par sévérité.
```

Les champs de frontmatter CC restants — `effort`, `skills`, `initialPrompt`,
`memory`, `isolation` — sont documentés dans le document de conception de l'agent déclaratif
et seront intégrés dans des PRs ultérieures une fois l'infrastructure prérequise existante
(`effort` nécessite un paramètre au niveau du modèle ; `memory` nécessite un sous-système de mémoire
délimité ; le drapeau CLI `--agent` active `initialPrompt` ; etc.).

> **Limitation de la v1 des `hooks`.** Pendant qu'un sous-agent déclarant des `hooks` est en cours d'exécution,
> ses entrées de hook se déclenchent pour chaque événement correspondant dans la session, et pas uniquement
> pour les propres appels d'outils de ce sous-agent. Si deux sous-agents avec des ensembles de hooks
> différents par agent s'exécutent simultanément, les deux ensembles se déclenchent pour les deux agents.
> Le filtrage par portée par agent au moment du déclenchement du hook est laissé à une version ultérieure ;
> pour la v1, privilégiez les hooks par agent qui peuvent être déclenchés globalement sans danger pendant
> la durée de l'exécution de l'agent (par exemple, la journalisation) plutôt que des hooks qui modifient
> le comportement.

#### Exemple d'utilisation

```
---
name: documentateur-de-projet
description: Crée la documentation du projet et les fichiers README
---

Vous êtes un spécialiste de la documentation.

Concentrez-vous sur la création de documentation claire et complète qui aide à la fois
les nouveaux contributeurs et les utilisateurs finaux à comprendre le projet.
```

## Utiliser les sous-agents efficacement

### Délégation automatique

Qwen Code délègue les tâches de manière proactive en fonction de :

- La description de la tâche dans votre requête
- Le champ description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des phrases comme « utiliser PROACTIVEMENT » ou « DOIT ÊTRE UTILISÉ » dans votre champ description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Laissez le sous-agent testing-expert créer des tests unitaires pour le module de paiement
Faites mettre à jour la référence API par le sous-agent documentation-writer
Demandez au sous-agent react-specialist d'optimiser les performances de ce composant
```

## Exemples

### Agents de workflow de développement

#### Spécialiste des tests

Parfait pour la création complète de tests et le développement piloté par les tests.

```
---
name: testing-expert
description: Écrit des tests unitaires complets, des tests d'intégration et gère l'automatisation des tests avec les meilleures pratiques
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste des tests axé sur la création de tests de haute qualité et maintenables.

Votre expertise comprend :

- Les tests unitaires avec un mocking et une isolation appropriés
- Les tests d'intégration pour les interactions entre composants
- Les pratiques de développement piloté par les tests
- L'identification des cas limites et une couverture complète
- Les tests de performance et de charge lorsque cela est approprié

Pour chaque tâche de test :

1. Analysez la structure du code et les dépendances
2. Identifiez les fonctionnalités clés, les cas limites et les conditions d'erreur
3. Créez des suites de tests complètes avec des noms descriptifs
4. Incluez une configuration/nettoyage appropriés et des assertions significatives
5. Ajoutez des commentaires expliquant les scénarios de test complexes
6. Assurez-vous que les tests sont maintenables et suivent les principes DRY

Suivez toujours les meilleures pratiques de test pour le langage et le framework détectés.
Concentrez-vous à la fois sur les cas de test positifs et négatifs.
```

**Cas d'utilisation :**

- « Écrire des tests unitaires pour le service d'authentification »
- « Créer des tests d'intégration pour le flux de traitement des paiements »
- « Ajouter une couverture de test pour les cas limites dans le module de validation des données »

#### Rédacteur de documentation

Spécialisé dans la création de documentation claire et complète.

```
---
name: documentation-writer
description: Crée une documentation complète, des fichiers README, des docs API et des guides utilisateur
tools:
  - read_file
  - write_file
  - read_many_files
---

Vous êtes un spécialiste de la documentation technique.

Votre rôle est de créer une documentation claire et complète qui sert à la fois
les développeurs et les utilisateurs finaux. Concentrez-vous sur :

**Pour la documentation API :**

- Des descriptions claires des endpoints avec des exemples
- Des détails sur les paramètres avec types et contraintes
- La documentation du format de réponse
- Les explications des codes d'erreur
- Les exigences d'authentification

**Pour la documentation utilisateur :**

- Des instructions étape par étape avec des captures d'écran lorsque c'est utile
- Des guides d'installation et de configuration
- Les options de configuration et des exemples
- Des sections de dépannage pour les problèmes courants
- Des sections FAQ basées sur les questions fréquentes des utilisateurs

**Pour la documentation développeur :**

- Des vues d'ensemble de l'architecture et des décisions de conception
- Des exemples de code qui fonctionnent réellement
- Des directives de contribution
- La configuration de l'environnement de développement

Vérifiez toujours les exemples de code et assurez-vous que la documentation reste à jour avec
l'implémentation réelle. Utilisez des titres clairs, des listes à puces et des exemples.
```

**Cas d'utilisation :**

- « Créer la documentation API pour les endpoints de gestion des utilisateurs »
- « Écrire un README complet pour ce projet »
- « Documenter le processus de déploiement avec des étapes de dépannage »

#### Relecteur de code

Axé sur la qualité du code, la sécurité et les meilleures pratiques.

```
---
name: code-reviewer
description: Relit le code pour les meilleures pratiques, les problèmes de sécurité, les performances et la maintenabilité
tools:
  - read_file
  - read_many_files
---

Vous êtes un relecteur de code expérimenté axé sur la qualité, la sécurité et la maintenabilité.

Critères de relecture :

- **Structure du code** : Organisation, modularité et séparation des préoccupations
- **Performances** : Efficacité algorithmique et utilisation des ressources
- **Sécurité** : Évaluation des vulnérabilités et pratiques de codage sécurisé
- **Meilleures pratiques** : Conventions spécifiques au langage/framework
- **Gestion des erreurs** : Gestion appropriée des exceptions et couverture des cas limites
- **Lisibilité** : Nommage clair, commentaires et organisation du code
- **Tests** : Couverture des tests et considérations de testabilité

Fournissez des retours constructifs avec :

1. **Problèmes critiques** : Vulnérabilités de sécurité, bugs majeurs
2. **Améliorations importantes** : Problèmes de performance, problèmes de conception
3. **Suggestions mineures** : Améliorations de style, opportunités de refactoring
4. **Retours positifs** : Modèles bien implémentés et bonnes pratiques

Concentrez-vous sur des retours actionnables avec des exemples spécifiques et des solutions suggérées.
Priorisez les problèmes par impact et fournissez une justification pour les recommandations.
```
**Cas d'utilisation :**

- « Vérifier cette implémentation d'authentification pour des problèmes de sécurité »
- « Examiner les implications de performance de cette logique de requête de base de données »
- « Évaluer la structure du code et suggérer des améliorations »

### Agents spécialisés par technologie

#### Spécialiste React

Optimisé pour le développement React, les hooks et les patterns de composants.

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**Cas d'utilisation :**

- « Créer un composant de tableau de données réutilisable avec tri et filtrage »
- « Implémenter un hook personnalisé pour la récupération de données API avec mise en cache »
- « Refactoriser ce composant de classe pour utiliser les patterns React modernes »

#### Expert Python

Spécialisé dans le développement Python, les frameworks et les bonnes pratiques.

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**Cas d'utilisation :**

- « Créer un service FastAPI pour l'authentification des utilisateurs avec des tokens JWT »
- « Implémenter un pipeline de traitement de données avec pandas et gestion des erreurs »
- « Écrire un outil CLI utilisant argparse avec une documentation d'aide complète »

## Bonnes pratiques

### Principes de conception

#### Principe de responsabilité unique

Chaque sous-agent doit avoir un objectif clair et ciblé.

**✅ Bon :**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ À éviter :**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Pourquoi :** Les agents ciblés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d'expertise spécifiques plutôt que des capacités générales.

**✅ Bon :**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ À éviter :**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Pourquoi :** Une expertise spécifique conduit à une assistance plus ciblée et efficace.

#### Descriptions actionnables

Rédigez des descriptions qui indiquent clairement quand utiliser l'agent.

**✅ Bon :**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ À éviter :**

```
description: A helpful code reviewer
```

**Pourquoi :** Des descriptions claires aident l'IA principale à choisir le bon agent pour chaque tâche.

### Bonnes pratiques de configuration

#### Directives pour les prompts système

**Soyez précis sur l'expertise :**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Incluez des approches étape par étape :**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Spécifiez les normes de sortie :**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Considérations de sécurité

- **Restrictions d'outils** : Utilisez `tools` pour limiter les outils auxquels un sous-agent peut accéder, ou `disallowedTools` pour bloquer des outils spécifiques tout en héritant de tout le reste
- **Mode de permission** : Les sous-agents héritent du mode de permission de leur parent par défaut. Les sessions en mode planification ne peuvent pas passer en mode édition automatique via des agents délégués. Les modes privilégiés (édition auto, yolo) sont bloqués dans les dossiers non fiables.
- **Sélection du fournisseur** : Un sous-agent avec `model: authType:modelId`, ou
  `model: fast` où `fastModel` se résout en un autre type d'authentification, envoie
  les demandes de modèle de ce sous-agent au fournisseur sélectionné. Assurez-vous que ce fournisseur est
  approprié pour la tâche et les données du sous-agent.
- **Sandboxing** : Toute exécution d'outil suit le même modèle de sécurité que l'utilisation directe d'outils
- **Piste d'audit** : Toutes les actions des sous-agents sont enregistrées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau du projet et de l'utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations d'agent
- **Environnements de production** : Envisagez des agents séparés pour les environnements de production et de développement

## Limites

Les avertissements légers suivants s'appliquent aux configurations de sous-agents (aucune limite stricte n'est imposée) :

- **Champ Description** : Un avertissement est affiché pour les descriptions dépassant 1 000 caractères
- **Prompt système** : Un avertissement est affiché pour les prompts système dépassant 10 000 caractères