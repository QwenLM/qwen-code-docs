# Sous-agents

Les Sous-agents sont des assistants IA spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer du travail ciblé à des agents IA configurés avec des prompts, des outils et des comportements adaptés à chaque tâche.

## Que sont les Sous-agents ?

Les Sous-agents sont des assistants IA indépendants qui :

- **Se spécialisent dans des tâches spécifiques** – Chaque Sous-agent est configuré avec un prompt système ciblé pour des types de tâches particuliers.
- **Disposent d'un contexte séparé** – Ils maintiennent leur propre historique de conversation, distinct de votre chat principal.
- **Utilisent des outils contrôlés** – Vous pouvez configurer les outils auxquels chaque Sous-agent a accès.
- **Travaillent de manière autonome** – Une fois une tâche confiée, ils travaillent indépendamment jusqu'à son achèvement ou son échec.
- **Fournissent un retour détaillé** – Vous pouvez voir leur progression, l'utilisation des outils et les statistiques d'exécution en temps réel.

## Fork - Sous-agent

En plus des sous-agents nommés, Qwen Code prend en charge le **fork** — sélectionné explicitement avec `subagent_type: "fork"` (disponible dans les sessions interactives). Un fork hérite de l'intégralité du contexte de conversation du parent et s'exécute en arrière-plan de manière détachée. Omettre `subagent_type` n'effectue **pas** de fork ; cela lance le sous-agent généraliste qui s'exécute jusqu'à son terme et renvoie son résultat en ligne.

### Différences entre Fork et Sous-agent nommé

|               | Sous-agent nommé                    | Fork - Sous-agent                                        |
| ------------- | ----------------------------------- | -------------------------------------------------------- |
| Contexte      | Démarre vierge, sans historique parent | Hérite de tout l'historique de conversation du parent    |
| Prompt système| Utilise son propre prompt configuré  | Utilise exactement le prompt système du parent (partage du cache) |
| Exécution     | Bloque le parent jusqu'à la fin      | S'exécute en arrière-plan, le parent continue immédiatement |
| Cas d'usage   | Tâches spécialisées (tests, documentation) | Tâches parallèles nécessitant le contexte courant        |

### Quand le fork est utilisé

L'IA utilise automatiquement le fork lorsqu'elle a besoin de :

- Lancer plusieurs tâches de recherche en parallèle (par exemple « étudier les modules A, B et C »).
- Effectuer un travail en arrière-plan tout en poursuivant la conversation principale.
- Déléguer des tâches qui nécessitent la compréhension du contexte de la conversation en cours.

### Partage du cache de prompt

Tous les forks partagent exactement le même préfixe de requête API du parent (prompt système, outils, historique de conversation), permettant des hits de cache de prompt DashScope. Lorsque 3 forks s'exécutent en parallèle, le préfixe partagé est mis en cache une fois et réutilisé — économisant plus de 80 % des coûts de tokens par rapport à des sous-agents indépendants.

### Prévention des forks récursifs

Les enfants d'un fork ne peuvent pas créer d'autres forks. Ceci est appliqué à l'exécution — si un fork tente d'en générer un autre, il reçoit une erreur lui demandant d'exécuter les tâches directement.

### Limitations actuelles

- **Aucun retour de résultat** : Les résultats des forks sont reflétés dans l'affichage de progression de l'interface utilisateur, mais ne sont pas automatiquement réinjectés dans la conversation principale. L'IA parente voit un message fictif et ne peut pas agir sur la sortie du fork.
- **Pas d'isolation du répertoire de travail** : Les forks partagent le répertoire de travail du parent. Des modifications concurrentes de fichiers provenant de plusieurs forks peuvent entrer en conflit.

## Avantages clés

- **Spécialisation des tâches** : Créez des agents optimisés pour des workflows spécifiques (tests, documentation, refactorisation, etc.).
- **Isolation du contexte** : Gardez le travail spécialisé séparé de votre conversation principale.
- **Héritage de contexte** : Les sous-agents de type fork héritent de l'intégralité de la conversation pour les tâches parallèles nécessitant du contexte.
- **Partage du cache de prompt** : Les sous-agents de type fork partagent le préfixe de cache du parent, réduisant les coûts de tokens.
- **Réutilisabilité** : Sauvegardez et réutilisez des configurations d'agents entre projets et sessions.
- **Accès contrôlé** : Limitez les outils que chaque agent peut utiliser pour des raisons de sécurité et de focus.
- **Visibilité de la progression** : Surveillez l'exécution des agents avec des mises à jour en temps réel.

## Fonctionnement des Sous-agents

1. **Configuration** : Vous créez des configurations de Sous-agents qui définissent leur comportement, leurs outils et leurs prompts système.
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux Sous-agents appropriés — ou se forker elle-même (`subagent_type: "fork"`) lorsqu'elle souhaite hériter de tout le contexte de la conversation et ignorer la sortie intermédiaire.
3. **Exécution** : Les Sous-agents travaillent indépendamment, en utilisant les outils configurés pour accomplir les tâches.
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution vers la conversation principale.

## Premiers pas

### Démarrage rapide

1. **Créez votre premier Sous-agent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérez les agents existants** :

   `/agents manage`

   Consultez et gérez vos Sous-agents configurés.

3. **Utilisez les Sous-agents automatiquement** : Demandez simplement à l'IA principale d'effectuer des tâches correspondant aux spécialisations de vos Sous-agents. L'IA délègue automatiquement le travail approprié.

### Exemple d'utilisation

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```
## Gestion

### Commandes CLI

Les sous-agents sont gérés via la commande `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent via un assistant de configuration guidé par étapes.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue de gestion interactive pour visualiser et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown à plusieurs endroits :

- **Niveau projet** : `.qwen/agents/` (priorité la plus élevée)
- **Niveau utilisateur** : `~/.qwen/agents/` (solution de repli)
- **Niveau extension** : fournis par les extensions installées

Cela vous permet d’avoir des agents spécifiques à un projet, des agents personnels qui fonctionnent sur tous les projets, et des agents fournis par des extensions qui ajoutent des capacités spécialisées.

### Sous-agents d’extension

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles lorsque l’extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l’extension et suivent le même format que les agents personnels et ceux du projet.

Les sous-agents d’extension :

- Sont automatiquement découverts lorsque l’extension est activée
- Apparaissent dans la boîte de dialogue `/agents manage` sous la section « Extension Agents »
- Ne peuvent pas être modifiés directement (éditez plutôt la source de l’extension)
- Suivent le même format de configuration que les agents définis par l’utilisateur

Pour savoir quelles extensions fournissent des sous-agents, vérifiez la présence d’un champ `agents` dans le fichier `qwen-extension.json` de l’extension.

### Format de fichier

Les sous-agents sont configurés à l’aide de fichiers Markdown avec un en-tête YAML. Ce format est lisible par l’humain et facile à éditer avec n’importe quel éditeur de texte.

#### Structure de base

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit, fast, modelId, or authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Sélection du modèle

Utilisez le champ facultatif `model` dans l’en-tête pour contrôler quel modèle un sous-agent utilise :

- `inherit` : utiliser le même modèle que la conversation principale.
- Omettre le champ : équivalent à `inherit`.
- `fast` : utiliser le `fastModel` configuré. Si aucun modèle rapide valide n’est configuré,
  le sous-agent revient à `inherit`.
- `glm-5` : utiliser cet ID de modèle. Qwen Code vérifie d’abord le type d’authentification
  de la conversation principale ; si le modèle n’y est pas disponible, il peut résoudre le modèle à partir d’un
  autre fournisseur configuré.
- `openai:gpt-4o` : utiliser un fournisseur et un ID de modèle explicites. Utile lorsqu’un
  sous-agent doit s’exécuter sur un modèle enregistré sous un type d’authentification différent de celui
  de la conversation principale.

Par exemple :

```
---
name: fast-reviewer
description: Reviews small diffs with the configured fast model
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Uses an OpenAI-compatible provider for research tasks
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

Le sélecteur `fast` utilise le même paramètre `fastModel` configuré dans
`settings.json` ou avec `/model --fast`. Ce paramètre peut lui-même faire référence à un
modèle sous un autre type d’authentification configuré, par exemple `openai:deepseek-v4-flash`.
Lorsque le sélecteur résout un autre type d’authentification, Qwen Code crée un fournisseur
d’exécution dédié pour cette requête de sous-agent et ne transmet au fournisseur que l’ID de modèle brut.

#### Mode d’autorisation

Utilisez le champ facultatif `approvalMode` dans l’en-tête pour contrôler la façon dont les appels d’outils d’un sous-agent sont approuvés. Valeurs valides :

- `default` : les outils nécessitent une approbation interactive (identique à la valeur par défaut de la session principale)
- `plan` : mode analyse uniquement — l’agent planifie mais n’exécute pas les modifications
- `auto-edit` : les outils sont automatiquement approuvés sans invite (recommandé pour la plupart des agents)
- `yolo` : tous les outils sont automatiquement approuvés, y compris ceux potentiellement destructeurs
- `bubble` : les approbations des outils de l’agent d’arrière-plan sont remontées dans la session parente

Si vous omettez ce champ, le mode d’autorisation du sous-agent est déterminé automatiquement :

- Si la session parente est en mode **yolo** ou **auto-edit**, le sous-agent hérite de ce mode. Un parent permissif reste permissif.
- Si la session parente est en mode **plan**, le sous-agent reste en mode plan. Une session d’analyse uniquement ne peut pas modifier des fichiers via un agent délégué.
- Si la session parente est en mode **default** (dans un dossier de confiance), le sous-agent obtient le mode **auto-edit** afin de pouvoir travailler de manière autonome.

Lorsque vous définissez `approvalMode`, les modes permissifs du parent ont toujours priorité. Par exemple, si le parent est en mode yolo, un sous-agent avec `approvalMode: plan` s’exécutera quand même en mode yolo.

```
---
name: cautious-reviewer
description: Reviews code without making changes
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### Configuration des outils

Utilisez `tools` et `disallowedTools` pour contrôler les outils auxquels un sous-agent peut accéder.

**`tools` (liste d’autorisation) :** lorsqu’elle est spécifiée, le sous-agent ne peut utiliser que les outils listés. Lorsqu’elle est omise, le sous-agent hérite de tous les outils disponibles de la session parente.
```
---
name: reader
description: Read-only agent for code exploration
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (liste de blocage) :** Lorsqu'elle est spécifiée, les outils listés sont retirés de l'ensemble d'outils du sous-agent. Cela est utile quand vous voulez « tout sauf X » sans avoir à lister chaque outil autorisé.

```
---
name: safe-worker
description: Agent that cannot modify files
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Si `tools` et `disallowedTools` sont tous deux définis, la liste blanche est appliquée en premier, puis la liste noire retire les éléments de cet ensemble.

**Les outils MCP** suivent les mêmes règles. Si un sous-agent n'a pas de liste `tools`, il hérite de tous les outils MCP de la session parente. Si un sous-agent a une liste `tools` explicite, il ne reçoit que les outils MCP explicitement nommés dans cette liste.

Le champ `disallowedTools` prend en charge les motifs au niveau du serveur MCP :

- `mcp__server__tool_name` — bloque un outil MCP spécifique
- `mcp__server` — bloque tous les outils de ce serveur MCP

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Champs de compatibilité Claude Code

Qwen Code accepte les champs de frontmatter de Claude Code 2.1.168 ci-dessous, afin que vous puissiez déposer un fichier d'agent CC dans `.qwen/agents/` et que les champs supportés soient analysés de manière identique. Les champs facultatifs avec des valeurs invalides sont silencieusement ignorés lors de l'analyse plutôt que rejetés — la même posture tolérante que CC utilise.

| Champ            | Type             | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode` | chaîne enum      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Mappé sur `approvalMode` lors de l'analyse ; si les deux sont définis, le `approvalMode` explicite l'emporte.                                                                                                                                                                                       |
| `maxTurns`       | entier positif   | Limite le budget de tours de l'agent. Relié à `runConfig.max_turns` à l'exécution ; si les deux sont définis, le champ de premier niveau l'emporte. La valeur imbriquée héritée est supprimée du fichier sur disque lors de la sauvegarde pour éviter deux sources de vérité.                                                                                               |
| `color`          | chaîne enum      | Couleur d'affichage. Liste autorisée : `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (reflète le `_Y` de CC). La sentinelle héritée `auto` de qwen est conservée pour la rétrocompatibilité. Les autres valeurs sont silencieusement ignorées lors de l'analyse.                                                                                      |
| `mcpServers`     | enregistrement de spécifications | Surcharges des serveurs MCP par agent. Fusionnées avec l'ensemble de serveurs MCP de la session lorsque l'agent est créé ; en cas de collision de clé, la spécification de l'agent l'emporte (correspond à la sémantique `scope: 'agent'` de CC). Les entrées malformées sont ignorées par clé avec un avertissement plutôt que de faire échouer tout l'agent.               |
| `hooks`          | enregistrement de tableaux | Hooks par agent. Les clés sont les noms d'événements de hook CC (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …) ; les valeurs sont des tableaux de définitions `{ matcher?, hooks: [...] }` de même forme que le champ `hooks` de `settings.json`. Enregistrés pendant l'exécution de l'agent, supprimés à son arrêt.                                                |

Exemple avec tout ce qui précède :

```
---
name: rigorous-reviewer
description: Deep code review with a turn cap
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
          command: echo "review-agent about to run a shell command"
---

Vous êtes un relecteur de code. Analysez le code en profondeur et rapportez les résultats classés par sévérité.
```

Les champs de frontmatter CC restants — `effort`, `skills`, `initialPrompt`, `memory`, `isolation` — sont documentés dans le document de conception de l'agent déclaratif et seront ajoutés dans des PRs ultérieures une fois l'infrastructure prérequise existante ( `effort` nécessite un paramètre de couche modèle ; `memory` nécessite un sous-système de mémoire limitée ; le drapeau CLI `--agent` active `initialPrompt`, etc.).

> **Limitation des `hooks` v1.** Pendant qu'un sous-agent déclarant des `hooks` est en cours d'exécution, ses entrées de hook se déclenchent pour chaque événement correspondant dans la session, pas seulement pour les appels d'outils de ce sous-agent. Si deux sous-agents avec des ensembles de hooks par agent différents s'exécutent simultanément, les deux ensembles se déclenchent pour les deux agents. Le filtrage par périmètre par agent au moment du déclenchement du hook est réservé pour une suite ; pour la v1, privilégiez des hooks par agent qui peuvent être déclenchés globalement pendant la durée d'exécution de l'agent (par exemple, la journalisation) plutôt que des hooks qui modifient le comportement.
#### Exemple d'utilisation

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## Utiliser efficacement les sous-agents

### Délégation automatique

Qwen Code délègue les tâches de manière proactive en se basant sur :

- La description de la tâche dans votre requête
- Le champ description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des phrases comme « use PROACTIVELY » ou « MUST BE USED » dans votre champ description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Exemples

### Agents de flux de développement

#### Spécialiste en tests

Idéal pour la création complète de tests et le développement piloté par les tests.

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**Cas d'utilisation :**

- « Write unit tests for the authentication service »
- « Create integration tests for the payment processing workflow »
- « Add test coverage for edge cases in the data validation module »

#### Rédacteur de documentation

Spécialisé dans la création de documentation claire et complète.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**Cas d'utilisation :**

- « Create API documentation for the user management endpoints »
- « Write a comprehensive README for this project »
- « Document the deployment process with troubleshooting steps »

#### Réviseur de code

Axé sur la qualité du code, la sécurité et les bonnes pratiques.

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```
**Cas d'utilisation :**

- « Examinez cette implémentation d'authentification pour détecter des problèmes de sécurité »
- « Vérifiez les implications en termes de performances de cette logique de requête de base de données »
- « Évaluez la structure du code et suggérez des améliorations »

### Agents spécialisés par technologie

#### Spécialiste React

Optimisé pour le développement React, les hooks et les patrons de composants.

```
---
name: react-specialist
description: Expert en développement React, hooks, patrons de composants et meilleures pratiques React modernes
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste React avec une expertise approfondie du développement React moderne.

Votre expertise couvre :

- **Conception de composants** : Composants fonctionnels, hooks personnalisés, patrons de composition
- **Gestion d'état** : useState, useReducer, Context API et bibliothèques externes
- **Performances** : React.memo, useMemo, useCallback, découpage de code
- **Tests** : React Testing Library, Jest, stratégies de test de composants
- **Intégration TypeScript** : Typage approprié pour les props, hooks et composants
- **Patrons modernes** : Suspense, Error Boundaries, fonctionnalités concurrentes

Pour les tâches React :

1. Utilisez les composants fonctionnels et les hooks par défaut
2. Implémentez un typage TypeScript approprié
3. Suivez les meilleures pratiques et conventions React
4. Tenez compte des implications en termes de performances
5. Incluez une gestion d'erreurs appropriée
6. Écrivez du code testable et maintenable

Restez toujours à jour avec les meilleures pratiques React et évitez les patrons obsolètes.
Concentrez-vous sur l'accessibilité et l'expérience utilisateur.
```

**Cas d'utilisation :**

- « Créez un composant de tableau de données réutilisable avec tri et filtrage »
- « Implémentez un hook personnalisé pour la récupération de données API avec mise en cache »
- « Refactorisez ce composant de classe pour utiliser des patrons React modernes »

#### Expert Python

Spécialisé dans le développement Python, les frameworks et les meilleures pratiques.

```
---
name: python-expert
description: Expert en développement Python, frameworks, tests et meilleures pratiques spécifiques à Python
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un expert Python avec une connaissance approfondie de l'écosystème Python.

Votre expertise inclut :

- **Python de base** : Patrons pythoniques, structures de données, algorithmes
- **Frameworks** : Django, Flask, FastAPI, SQLAlchemy
- **Tests** : pytest, unittest, simulation, développement piloté par les tests
- **Science des données** : pandas, numpy, matplotlib, notebooks Jupyter
- **Programmation asynchrone** : asyncio, patrons async/await
- **Gestion de paquets** : pip, poetry, environnements virtuels
- **Qualité du code** : PEP 8, indications de type, linting avec pylint/flake8

Pour les tâches Python :

1. Suivez les directives de style PEP 8
2. Utilisez les indications de type pour une meilleure documentation du code
3. Implémentez une gestion d'erreurs appropriée avec des exceptions spécifiques
4. Rédigez des docstrings complets
5. Tenez compte des performances et de l'utilisation de la mémoire
6. Incluez une journalisation appropriée
7. Écrivez du code modulaire et testable

Concentrez-vous sur l'écriture d'un code Python propre et maintenable qui suit les normes de la communauté.
```

**Cas d'utilisation :**

- « Créez un service FastAPI pour l'authentification des utilisateurs avec des jetons JWT »
- « Implémentez un pipeline de traitement de données avec pandas et gestion d'erreurs »
- « Écrivez un outil CLI utilisant argparse avec une documentation d'aide complète »

## Meilleures pratiques

### Principes de conception

#### Principe de responsabilité unique

Chaque sous-agent doit avoir un objectif clair et précis.

**✅ Bon :**

```
---
name: testing-expert
description: Rédige des tests unitaires et d'intégration complets
---
```

**❌ À éviter :**

```
---
name: general-helper
description: Aide pour les tests, la documentation, la revue de code et le déploiement
---
```

**Pourquoi :** Des agents spécialisés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d'expertise spécifiques plutôt que des capacités générales.

**✅ Bon :**

```
---
name: react-performance-optimizer
description: Optimise les applications React pour les performances en utilisant le profilage et les meilleures pratiques
---
```

**❌ À éviter :**

```
---
name: frontend-developer
description: Travaille sur des tâches de développement frontend
---
```

**Pourquoi :** Une expertise spécifique conduit à une assistance plus ciblée et plus efficace.

#### Descriptions actionnables

Rédigez des descriptions qui indiquent clairement quand utiliser l'agent.

**✅ Bon :**

```
description: Examine le code pour détecter les vulnérabilités de sécurité, les problèmes de performances et les préoccupations de maintenabilité
```

**❌ À éviter :**

```
description: Un relecteur de code utile
```

**Pourquoi :** Des descriptions claires aident l'IA principale à choisir le bon agent pour chaque tâche.

### Meilleures pratiques de configuration

#### Directives pour les prompts système

**Soyez précis sur l'expertise :**

```
Vous êtes un spécialiste des tests Python avec une expertise dans :

- Le framework pytest et les fixtures
- Les objets mock et l'injection de dépendances
- Les pratiques de développement piloté par les tests
- Les tests de performance avec pytest-benchmark
```

**Incluez des approches étape par étape :**

```
Pour chaque tâche de test :

1. Analysez la structure du code et les dépendances
2. Identifiez les fonctionnalités clés et les cas limites
3. Créez des suites de tests complètes avec des noms clairs
4. Incluez la configuration/le nettoyage et des assertions appropriées
5. Ajoutez des commentaires expliquant les scénarios de test complexes
```
**Specify Output Standards:**

```
Suivez toujours ces normes :

- Utilisez des noms de test descriptifs qui expliquent le scénario
- Incluez à la fois des cas de test positifs et négatifs
- Ajoutez des docstrings pour les fonctions de test complexes
- Assurez-vous que les tests sont indépendants et peuvent être exécutés dans n'importe quel ordre
```

## Security Considerations

- **Restrictions d'outils** : Utilisez `tools` pour limiter les outils auxquels un sous-agent peut accéder, ou `disallowedTools` pour bloquer des outils spécifiques tout en héritant de tout le reste
- **Mode d'autorisation** : Les sous-agents héritent du mode d'autorisation de leur parent par défaut. Les sessions en mode planification ne peuvent pas passer en édition automatique via des agents délégués. Les modes privilégiés (auto-edit, yolo) sont bloqués dans les dossiers non fiables.
- **Sélection du fournisseur** : Un sous-agent avec `model: authType:modelId`, ou `model: fast` où `fastModel` résout un autre type d'authentification, envoie les requêtes de modèle de ce sous-agent au fournisseur sélectionné. Assurez-vous que ce fournisseur est approprié pour la tâche et les données du sous-agent.
- **Sandboxing** : Toutes les exécutions d'outils suivent le même modèle de sécurité que l'utilisation directe des outils
- **Piste d'audit** : Toutes les actions des sous-agents sont enregistrées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau du projet et de l'utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations des agents
- **Environnements de production** : Envisagez des agents séparés pour les environnements de production et de développement

## Limits

Les avertissements légers suivants s'appliquent aux configurations des sous-agents (aucune limite stricte n'est imposée) :

- **Champ Description** : Un avertissement s'affiche pour les descriptions dépassant 1 000 caractères
- **Prompt système** : Un avertissement s'affiche pour les prompts système dépassant 10 000 caractères
