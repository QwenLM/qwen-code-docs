# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer un travail ciblé à des agents IA configurés avec des prompts, des outils et des comportements adaptés à chaque tâche.

## Qu'est-ce qu'un sous-agent ?

Les sous-agents sont des assistants IA indépendants qui :

- **Se spécialisent dans des tâches précises** - Chaque sous-agent est configuré avec un prompt système ciblé pour des types de travaux particuliers
- **Disposent d'un contexte isolé** - Ils conservent leur propre historique de conversation, séparé de votre chat principal
- **Utilisent des outils contrôlés** - Vous pouvez configurer les outils auxquels chaque sous-agent a accès
- **Travaillent de manière autonome** - Une fois une tâche assignée, ils travaillent indépendamment jusqu'à son achèvement ou son échec
- **Fournissent un retour détaillé** - Vous pouvez suivre leur progression, l'utilisation des outils et les statistiques d'exécution en temps réel

## Principaux avantages

- **Spécialisation des tâches** : Créez des agents optimisés pour des workflows spécifiques (tests, documentation, refactoring, etc.)
- **Isolation du contexte** : Gardez le travail spécialisé séparé de votre conversation principale
- **Réutilisabilité** : Enregistrez et réutilisez les configurations d'agents entre les projets et les sessions
- **Accès contrôlé** : Limitez les outils utilisables par chaque agent pour des raisons de sécurité et de concentration
- **Visibilité de la progression** : Surveillez l'exécution des agents grâce à des mises à jour en temps réel

## Fonctionnement des sous-agents

1. **Configuration** : Vous créez des configurations de sous-agents qui définissent leur comportement, leurs outils et leurs prompts système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux sous-agents appropriés
3. **Exécution** : Les sous-agents travaillent indépendamment en utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution à la conversation principale

## Prise en main

### Démarrage rapide

1. **Créez votre premier sous-agent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérez les agents existants** :

   `/agents manage`

   Consultez et gérez vos sous-agents configurés.

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

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue interactive pour consulter et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown à plusieurs emplacements :

- **Niveau projet** : `.qwen/agents/` (priorité la plus élevée)
- **Niveau utilisateur** : `~/.qwen/agents/` (solution de repli)
- **Niveau extension** : Fournis par les extensions installées

Cela vous permet de disposer d'agents spécifiques au projet, d'agents personnels fonctionnant sur tous les projets, et d'agents fournis par les extensions qui ajoutent des capacités spécialisées.

### Sous-agents d'extensions

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l'extension et suivent le même format que les agents personnels et de projet.

Les sous-agents d'extensions :

- Sont découverts automatiquement lorsque l'extension est activée
- Apparaissent dans la boîte de dialogue `/agents manage` sous la section "Extension Agents"
- Ne peuvent pas être modifiés directement (modifiez plutôt la source de l'extension)
- Suivent le même format de configuration que les agents définis par l'utilisateur

Pour voir quelles extensions fournissent des sous-agents, vérifiez la présence d'un champ `agents` dans le fichier `qwen-extension.json` de l'extension.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec un frontmatter YAML. Ce format est lisible par l'humain et facile à modifier avec n'importe quel éditeur de texte.

#### Structure de base

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Sélection du modèle

Utilisez le champ frontmatter optionnel `model` pour contrôler le modèle utilisé par un sous-agent :

- `inherit` : Utilise le même modèle que la conversation principale
- Omettre le champ : Identique à `inherit`
- `glm-5` : Utilise cet ID de modèle avec le type d'authentification de la conversation principale
- `openai:gpt-4o` : Utilise un autre fournisseur (résout les identifiants depuis les variables d'environnement)

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
- Le champ de description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des phrases comme "use PROACTIVELY" ou "MUST BE USED" dans votre champ de description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Exemples

### Agents de workflow de développement

#### Spécialiste des tests

Idéal pour la création complète de tests et le développement piloté par les tests (TDD).

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

- « Rédigez des tests unitaires pour le service d'authentification »
- « Créez des tests d'intégration pour le workflow de traitement des paiements »
- « Ajoutez une couverture de tests pour les cas limites dans le module de validation des données »

#### Rédacteur de documentation

Spécialisé dans la création d'une documentation claire et complète.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
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

- « Créez la documentation API pour les endpoints de gestion des utilisateurs »
- « Rédigez un README complet pour ce projet »
- « Documentez le processus de déploiement avec des étapes de dépannage »

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

- « Révisez cette implémentation d'authentification pour détecter les problèmes de sécurité »
- « Vérifiez les implications en termes de performances de cette logique de requête de base de données »
- « Évaluez la structure du code et suggérez des améliorations »

### Agents spécifiques à une technologie

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

- « Créez un composant de tableau de données réutilisable avec tri et filtrage »
- « Implémentez un hook personnalisé pour la récupération de données API avec mise en cache »
- « Refactorisez ce composant de classe pour utiliser les patterns React modernes »

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

- « Créez un service FastAPI pour l'authentification des utilisateurs avec des jetons JWT »
- « Implémentez un pipeline de traitement de données avec pandas et une gestion des erreurs »
- « Rédigez un outil CLI utilisant argparse avec une documentation d'aide complète »

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

**Spécifiez les standards de sortie :**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Considérations de sécurité

- **Restrictions d'outils** : Les sous-agents n'ont accès qu'à leurs outils configurés
- **Isolation (Sandboxing)** : Toutes les exécutions d'outils suivent le même modèle de sécurité que l'utilisation directe des outils
- **Piste d'audit** : Toutes les actions des sous-agents sont journalisées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau projet et utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations d'agents
- **Environnements de production** : Envisagez des agents distincts pour les environnements de production et de développement

## Limites

Les avertissements souples suivants s'appliquent aux configurations des sous-agents (aucune limite stricte n'est appliquée) :

- **Champ de description** : Un avertissement s'affiche pour les descriptions dépassant 1 000 caractères
- **Prompt système** : Un avertissement s'affiche pour les prompts système dépassant 10 000 caractères