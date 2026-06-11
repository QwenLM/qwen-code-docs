# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer un travail ciblé à des agents IA configurés avec des prompts, des outils et des comportements adaptés à la tâche.

## Qu'est-ce qu'un sous-agent ?

Les sous-agents sont des assistants IA indépendants qui :

- **Spécialisés dans des tâches précises** - Chaque sous-agent est configuré avec un prompt système ciblé pour des types de travaux particuliers
- **Contexte isolé** - Ils conservent leur propre historique de conversation, séparé de votre chat principal
- **Outils contrôlés** - Vous pouvez configurer les outils auxquels chaque sous-agent a accès
- **Fonctionnement autonome** - Une fois une tâche assignée, ils travaillent de manière indépendante jusqu'à son achèvement ou son échec
- **Retours détaillés** - Vous pouvez suivre leur progression, l'utilisation des outils et les statistiques d'exécution en temps réel

## Sous-agent Fork (Fork implicite)

En plus des sous-agents nommés, Qwen Code prend en charge le **fork implicite** : lorsque l'IA omet le paramètre `subagent_type`, elle déclenche un fork qui hérite du contexte de conversation complet du parent.

### Différences entre le Fork et les sous-agents nommés

|               | Sous-agent nommé                    | Sous-agent Fork                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| Contexte       | Repart de zéro, sans historique parent   | Hérite de l'historique complet de la conversation parente           |
| Prompt système | Utilise son propre prompt configuré    | Utilise le prompt système exact du parent (pour le partage de cache) |
| Exécution     | Bloque le parent jusqu'à la fin      | S'exécute en arrière-plan, le parent continue immédiatement      |
| Cas d'utilisation      | Tâches spécialisées (tests, docs) | Tâches parallèles nécessitant le contexte actuel          |

### Quand le Fork est utilisé

L'IA utilise automatiquement le fork lorsqu'elle doit :

- Exécuter plusieurs tâches de recherche en parallèle (ex. : "analyser les modules A, B et C")
- Effectuer un travail en arrière-plan tout en poursuivant la conversation principale
- Déléguer des tâches nécessitant la compréhension du contexte de conversation actuel

### Partage du cache de prompt

Tous les forks partagent le préfixe exact de la requête API du parent (prompt système, outils, historique de conversation), ce qui permet d'atteindre le cache de prompt DashScope. Lorsque 3 forks s'exécutent en parallèle, le préfixe partagé est mis en cache une seule fois et réutilisé, ce qui permet d'économiser plus de 80 % de tokens par rapport à des sous-agents indépendants.

### Prévention des forks récursifs

Les enfants d'un fork ne peuvent pas créer de nouveaux forks. Cette règle est appliquée à l'exécution : si un fork tente d'en engendrer un autre, il reçoit une erreur lui demandant d'exécuter les tâches directement.

### Limitations actuelles

- **Aucun retour de résultat** : Les résultats des forks sont affichés dans l'interface de progression, mais ne sont pas automatiquement réinjectés dans la conversation principale. L'IA parente voit un message placeholder et ne peut pas agir sur la sortie du fork.
- **Aucune isolation de worktree** : Les forks partagent le répertoire de travail du parent. Des modifications de fichiers concurrentes provenant de plusieurs forks peuvent entrer en conflit.

## Principaux avantages

- **Spécialisation des tâches** : Créez des agents optimisés pour des workflows spécifiques (tests, documentation, refactoring, etc.)
- **Isolation du contexte** : Gardez le travail spécialisé séparé de votre conversation principale
- **Héritage du contexte** : Les sous-agents Fork héritent de la conversation complète pour les tâches parallèles lourdes en contexte
- **Partage du cache de prompt** : Les sous-agents Fork partagent le préfixe de cache du parent, réduisant le coût en tokens
- **Réutilisabilité** : Enregistrez et réutilisez les configurations d'agents entre les projets et les sessions
- **Accès contrôlé** : Limitez les outils que chaque agent peut utiliser pour la sécurité et la concentration
- **Visibilité de la progression** : Suivez l'exécution des agents avec des mises à jour de progression en temps réel

## Fonctionnement des sous-agents

1. **Configuration** : Vous créez des configurations de sous-agents qui définissent leur comportement, leurs outils et leurs prompts système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux sous-agents appropriés — ou implicitement fork lorsqu'aucun type de sous-agent spécifique n'est nécessaire
3. **Exécution** : Les sous-agents travaillent de manière indépendante, en utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution à la conversation principale

## Prise en main

### Démarrage rapide

1. **Créez votre premier sous-agent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérez les agents existants** :

   `/agents manage`

   Affichez et gérez vos sous-agents configurés.

3. **Utilisez les sous-agents automatiquement** : Demandez simplement à l'IA principale d'effectuer des tâches correspondant aux spécialisations de vos sous-agents. L'IA déléguera automatiquement le travail approprié.

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

Les sous-agents sont gérés via la commande slash `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent via un assistant guidé étape par étape.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue interactive pour afficher et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown à plusieurs emplacements :

- **Niveau projet** : `.qwen/agents/` (priorité la plus haute)
- **Niveau utilisateur** : `~/.qwen/agents/` (secours)
- **Niveau extension** : Fournis par les extensions installées

Cela vous permet d'avoir des agents spécifiques au projet, des agents personnels fonctionnant sur tous les projets, et des agents fournis par les extensions qui ajoutent des capacités spécialisées.

### Sous-agents d'extensions

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l'extension et suivent le même format que les agents personnels et de projet.

Sous-agents d'extensions :

- Sont automatiquement détectés lorsque l'extension est activée
- Apparaissent dans la boîte de dialogue `/agents manage` sous la section "Extension Agents"
- Ne peuvent pas être modifiés directement (modifiez plutôt la source de l'extension)
- Suivent le même format de configuration que les agents définis par l'utilisateur

Pour voir quelles extensions fournissent des sous-agents, vérifiez le champ `agents` dans le fichier `qwen-extension.json` de l'extension.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec un frontmatter YAML. Ce format est lisible par l'humain et facile à modifier avec n'importe quel éditeur de texte.

#### Structure de base

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo
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

Utilisez le champ frontmatter `model` (optionnel) pour contrôler le modèle utilisé par un sous-agent :

- `inherit` : Utilise le même modèle que la conversation principale
- Omettre le champ : Identique à `inherit`
- `glm-5` : Utilise cet ID de modèle avec le type d'authentification de la conversation principale
- `openai:gpt-4o` : Utilise un fournisseur différent (résout les identifiants depuis les variables d'environnement)

#### Mode de permission

Utilisez le champ frontmatter `approvalMode` (optionnel) pour contrôler la validation des appels d'outils d'un sous-agent. Valeurs valides :

- `default` : Les outils nécessitent une validation interactive (identique au paramètre par défaut de la session principale)
- `plan` : Mode analyse seule — l'agent planifie mais n'exécute pas les modifications
- `auto-edit` : Les outils sont automatiquement validés sans invite (recommandé pour la plupart des agents)
- `yolo` : Tous les outils sont automatiquement validés, y compris ceux potentiellement destructeurs

Si vous omettez ce champ, le mode de permission du sous-agent est déterminé automatiquement :

- Si la session parente est en mode **yolo** ou **auto-edit**, le sous-agent hérite de ce mode. Un parent permissif reste permissif.
- Si la session parente est en mode **plan**, le sous-agent reste en mode plan. Une session en analyse seule ne peut pas modifier de fichiers via un agent délégué.
- Si la session parente est en mode **default** (dans un dossier de confiance), le sous-agent obtient **auto-edit** afin de pouvoir travailler de manière autonome.

Lorsque vous définissez `approvalMode`, les modes permissifs du parent restent prioritaires. Par exemple, si le parent est en mode yolo, un sous-agent avec `approvalMode: plan` s'exécutera toujours en mode yolo.

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

**`tools` (liste d'autorisation) :** Lorsqu'elle est spécifiée, le sous-agent ne peut utiliser que les outils listés. Lorsqu'elle est omise, le sous-agent hérite de tous les outils disponibles de la session parente.

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

**`disallowedTools` (liste d'exclusion) :** Lorsqu'elle est spécifiée, les outils listés sont retirés du pool d'outils du sous-agent. Cela est utile lorsque vous souhaitez "tout sauf X" sans lister chaque outil autorisé.

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

Si `tools` et `disallowedTools` sont tous deux définis, la liste d'autorisation est appliquée d'abord, puis la liste d'exclusion retire des éléments de cet ensemble.

**Les outils MCP** suivent les mêmes règles. Si un sous-agent n'a pas de liste `tools`, il hérite de tous les outils MCP de la session parente. Si un sous-agent possède une liste `tools` explicite, il n'obtient que les outils MCP explicitement nommés dans cette liste.

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

Qwen Code délègue proactivement les tâches en fonction de :

- La description de la tâche dans votre requête
- Le champ description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des phrases comme "use PROACTIVELY" ou "MUST BE USED" dans votre champ description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Exemples

### Agents pour les workflows de développement

#### Spécialiste des tests

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

- "Write unit tests for the authentication service"
- "Create integration tests for the payment processing workflow"
- "Add test coverage for edge cases in the data validation module"

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

- "Create API documentation for the user management endpoints"
- "Write a comprehensive README for this project"
- "Document the deployment process with troubleshooting steps"

#### Relecteur de code

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

- "Review this authentication implementation for security issues"
- "Check the performance implications of this database query logic"
- "Evaluate the code structure and suggest improvements"

### Agents spécifiques à une technologie

#### Spécialiste React

Optimisé pour le développement React, les hooks et les modèles de composants.

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

- "Create a reusable data table component with sorting and filtering"
- "Implement a custom hook for API data fetching with caching"
- "Refactor this class component to use modern React patterns"

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

- "Create a FastAPI service for user authentication with JWT tokens"
- "Implement a data processing pipeline with pandas and error handling"
- "Write a CLI tool using argparse with comprehensive help documentation"

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

Définissez des domaines d'expertise spécifiques plutôt que des capacités larges.

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

#### Recommandations pour le prompt système

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

**Spécifiez les standards de sortie :**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Considérations de sécurité

- **Restrictions d'outils** : Utilisez `tools` pour limiter les outils accessibles à un sous-agent, ou `disallowedTools` pour bloquer des outils spécifiques tout en héritant du reste
- **Mode de permission** : Les sous-agents héritent du mode de permission de leur parent par défaut. Les sessions en mode plan ne peuvent pas passer en auto-edit via des agents délégués. Les modes privilégiés (auto-edit, yolo) sont bloqués dans les dossiers non fiables.
- **Isolation (Sandboxing)** : Toute exécution d'outil suit le même modèle de sécurité que l'utilisation directe d'outils
- **Traçabilité** : Toutes les actions des sous-agents sont journalisées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau projet et utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations d'agents
- **Environnements de production** : Pensez à utiliser des agents distincts pour les environnements de production et de développement

## Limites

Les avertissements souples suivants s'appliquent aux configurations de sous-agents (aucune limite stricte n'est appliquée) :

- **Champ Description** : Un avertissement est affiché pour les descriptions dépassant 1 000 caractères
- **Prompt Système** : Un avertissement est affiché pour les prompts système dépassant 10 000 caractères