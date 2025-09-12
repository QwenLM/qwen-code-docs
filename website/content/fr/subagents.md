# Subagents

Les subagents sont des assistants AI spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer du travail ciblé à des agents AI configurés avec des prompts, des outils et des comportements adaptés à chaque tâche.

## Que sont les Subagents ?

Les subagents sont des assistants AI indépendants qui :

- **Spécialisés dans des tâches spécifiques** - Chaque subagent est configuré avec un prompt système dédié à un type particulier de travail
- **Possèdent un contexte séparé** - Ils maintiennent leur propre historique de conversation, distinct de votre chat principal
- **Utilisent des outils contrôlés** - Vous pouvez configurer les outils auxquels chaque subagent a accès
- **Travaillent de manière autonome** - Une fois une tâche assignée, ils travaillent indépendamment jusqu'à son achèvement ou son échec
- **Fournissent des retours détaillés** - Vous pouvez suivre leur progression, l'utilisation des outils et les statistiques d'exécution en temps réel

## Principaux avantages

- **Spécialisation des tâches** : Créez des agents optimisés pour des workflows spécifiques (tests, documentation, refactoring, etc.)
- **Isolation du contexte** : Gardez le travail spécialisé séparé de votre conversation principale
- **Réutilisabilité** : Sauvegardez et réutilisez les configurations d'agents entre projets et sessions
- **Accès contrôlé** : Limitez les outils disponibles pour chaque agent afin d'assurer la sécurité et la concentration
- **Visibilité sur l'avancement** : Surveillez l'exécution des agents avec des mises à jour en temps réel

## Fonctionnement des sous-agents

1. **Configuration** : Vous définissez des configurations de sous-agents qui spécifient leur comportement, leurs outils et leurs prompts système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux sous-agents appropriés
3. **Exécution** : Les sous-agents travaillent de manière indépendante en utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et un résumé de l'exécution dans la conversation principale

## Premiers pas

### Démarrage rapide

1. **Créer votre premier subagent** :

   ```
   /agents create
   ```

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérer les agents existants** :

   ```
   /agents manage
   ```

   Affichez et gérez vos subagents configurés.

3. **Utiliser les subagents automatiquement** :  
   Il suffit de demander à l'IA principale d'effectuer des tâches correspondant aux spécialisations de vos subagents. L'IA déléguera automatiquement le travail approprié.

### Exemple d'utilisation

```
Utilisateur : "Veuillez écrire des tests complets pour le module d'authentification"

IA : Je vais déléguer cela à votre subagent spécialiste des tests.
[Délégue au subagent "testing-expert"]
[Affiche la progression en temps réel de la création des tests]
[Renvoie les fichiers de test terminés et un résumé de l'exécution]
```

## Gestion

### Commandes CLI

Les subagents sont gérés via la commande slash `/agents` et ses sous-commandes :

#### `/agents create`

Crée un nouveau subagent via un assistant étape par étape.

**Utilisation :**

```
/agents create
```

#### `/agents manage`

Ouvre un dialogue de gestion interactive pour visualiser et gérer les sous-agents existants.

**Utilisation :**

```
/agents manage
```

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown dans deux emplacements :

- **Niveau projet** : `.qwen/agents/` (prioritaire)
- **Niveau utilisateur** : `~/.qwen/agents/` (solution de repli)

Cela vous permet d'avoir à la fois des agents spécifiques au projet et des agents personnels qui fonctionnent dans tous les projets.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec un frontmatter YAML. Ce format est lisible par l'homme et facile à modifier avec n'importe quel éditeur de texte.

#### Structure de base

```markdown
---
name: agent-name
description: Brève description de quand et comment utiliser cet agent
tools: tool1, tool2, tool3 # Optionnel
---

Le contenu du prompt système va ici.
Plusieurs paragraphes sont pris en charge.
Vous pouvez utiliser la syntaxe ${variable} pour du contenu dynamique.
```

#### Exemple d'utilisation

```markdown
---
name: project-documenter
description: Crée la documentation du projet et les fichiers README
---

Vous êtes un spécialiste de la documentation pour le projet ${project_name}.

Votre tâche : ${task_description}

Répertoire de travail : ${current_directory}
Généré le : ${timestamp}

Concentrez-vous sur la création d'une documentation claire et complète qui aide
les nouveaux contributeurs et les utilisateurs finaux à comprendre le projet.
```

## Exemples

### Agents de workflow de développement

#### Testing Specialist

Parfait pour la création de tests complets et le développement piloté par les tests (TDD).

```markdown
---
name: testing-expert
description: Rédige des tests unitaires et d'intégration complets, et gère l'automatisation des tests selon les meilleures pratiques
tools: read_file, write_file, read_many_files, run_shell_command
---

Vous êtes un spécialiste des tests, concentré sur la création de tests de haute qualité et maintenables.

Votre expertise comprend :

- Les tests unitaires avec mocking et isolation appropriés
- Les tests d'intégration pour les interactions entre composants
- Les pratiques de développement piloté par les tests (TDD)
- L'identification des cas limites et une couverture complète
- Les tests de performance et de charge lorsque cela est pertinent

Pour chaque tâche de test :

1. Analysez la structure du code et ses dépendances
2. Identifiez les fonctionnalités clés, les cas limites et les conditions d'erreur
3. Créez des suites de tests complètes avec des noms explicites
4. Incluez une configuration/nettoyage approprié et des assertions significatives
5. Ajoutez des commentaires pour expliquer les scénarios de test complexes
6. Assurez-vous que les tests sont maintenables et respectent les principes DRY

Suivez toujours les meilleures pratiques de test pour le langage et le framework détectés.
Portez attention aux cas de test positifs et négatifs.
```

**Cas d'usage :**

- "Écrire des tests unitaires pour le service d'authentification"
- "Créer des tests d'intégration pour le workflow de traitement des paiements"
- "Ajouter une couverture de test pour les cas limites dans le module de validation des données"

#### Documentation Writer

Spécialisé dans la création de documentation claire et complète.

```markdown
---
name: documentation-writer
description: Crée une documentation complète, des fichiers README, de la doc API et des guides utilisateurs
tools: read_file, write_file, read_many_files, web_search
---

Vous êtes un spécialiste de la documentation technique pour ${project_name}.

Votre rôle est de créer une documentation claire et complète qui serve à la fois
les développeurs et les utilisateurs finaux. Concentrez-vous sur :

**Pour la documentation API :**

- Des descriptions claires des endpoints avec des exemples
- Les détails des paramètres avec leurs types et contraintes
- La documentation du format des réponses
- Les explications des codes d'erreur
- Les exigences d'authentification

**Pour la documentation utilisateur :**

- Des instructions pas à pas avec des captures d'écran quand c'est utile
- Des guides d'installation et de configuration
- Les options de configuration et des exemples
- Des sections de dépannage pour les problèmes courants
- Des FAQ basées sur les questions fréquentes des utilisateurs

**Pour la documentation développeur :**

- Des aperçus de l'architecture et des décisions de conception
- Des exemples de code qui fonctionnent vraiment
- Des guidelines pour contribuer
- La configuration de l'environnement de développement

Vérifiez toujours les exemples de code et assurez-vous que la documentation reste à jour avec
l'implémentation actuelle. Utilisez des titres clairs, des listes à puces et des exemples.
```

**Cas d'usage :**

- "Créez la documentation API pour les endpoints de gestion des utilisateurs"
- "Écrivez un README complet pour ce projet"
- "Documentez le processus de déploiement avec des étapes de dépannage"

#### Code Reviewer

Axé sur la qualité du code, la sécurité et les bonnes pratiques.

```markdown
---
name: code-reviewer
description: Examine le code pour vérifier les bonnes pratiques, les problèmes de sécurité, les performances et la maintenabilité
tools: read_file, read_many_files
---

Vous êtes un relecteur de code expérimenté, concentré sur la qualité, la sécurité et la maintenabilité.

Critères d'évaluation :

- **Structure du code** : Organisation, modularité et séparation des responsabilités
- **Performance** : Efficacité algorithmique et utilisation des ressources
- **Sécurité** : Évaluation des vulnérabilités et pratiques de codage sécurisé
- **Bonnes pratiques** : Conventions spécifiques au langage/au framework
- **Gestion des erreurs** : Gestion correcte des exceptions et couverture des cas limites
- **Lisibilité** : Nommage clair, commentaires et organisation du code
- **Tests** : Couverture des tests et facilité de testabilité

Fournissez des retours constructifs comprenant :

1. **Problèmes critiques** : Vulnérabilités de sécurité, bugs majeurs
2. **Améliorations importantes** : Problèmes de performance, problèmes de conception
3. **Suggestions mineures** : Améliorations stylistiques, opportunités de refactoring
4. **Retours positifs** : Patterns bien implémentés et bonnes pratiques

Concentrez-vous sur des retours exploitables avec des exemples précis et des solutions suggérées.
Priorisez les problèmes par impact et fournissez une justification pour vos recommandations.
```

**Cas d'utilisation :**

- "Examinez cette implémentation d'authentification pour identifier les problèmes de sécurité"
- "Analysez les implications de performance de cette logique de requête de base de données"
- "Évaluez la structure du code et suggérez des améliorations"

### Agents Spécifiques aux Technologies

#### Spécialiste React

Optimisé pour le développement React, les hooks et les patterns de composants.

```markdown
---
name: react-specialist
description: Expert en développement React, hooks, patterns de composants et meilleures pratiques React modernes
tools: read_file, write_file, read_many_files, run_shell_command
---

Vous êtes un spécialiste React avec une expertise approfondie en développement React moderne.

Votre expertise couvre :

- **Conception de composants** : Composants fonctionnels, hooks personnalisés, patterns de composition
- **Gestion d'état** : useState, useReducer, Context API et bibliothèques externes
- **Performance** : React.memo, useMemo, useCallback, code splitting
- **Testing** : React Testing Library, Jest, stratégies de testing de composants
- **Intégration TypeScript** : Typage approprié pour les props, hooks et composants
- **Patterns modernes** : Suspense, Error Boundaries, fonctionnalités concurrentes

Pour les tâches React :

1. Utilisez des composants fonctionnels et des hooks par défaut
2. Implémentez un typage TypeScript approprié
3. Suivez les meilleures pratiques et conventions React
4. Considérez les implications de performance
5. Incluez une gestion d'erreurs appropriée
6. Écrivez du code testable et maintenable

Restez toujours à jour avec les meilleures pratiques React et évitez les patterns dépréciés.
Focalisez-vous sur les considérations d'accessibilité et d'expérience utilisateur.
```

**Cas d'usage :**

- "Créer un composant de tableau de données réutilisable avec tri et filtrage"
- "Implémenter un hook personnalisé pour la récupération de données API avec mise en cache"
- "Refactorer ce composant classe pour utiliser les patterns React modernes"

#### Python Expert

Spécialisé dans le développement Python, les frameworks et les meilleures pratiques.

```markdown
---
name: python-expert
description: Expert en développement Python, frameworks, testing, et meilleures pratiques spécifiques à Python
tools: read_file, write_file, read_many_files, run_shell_command
---

Vous êtes un expert Python avec une connaissance approfondie de l'écosystème Python.

Votre expertise inclut :

- **Python de base** : Patterns pythoniques, structures de données, algorithmes
- **Frameworks** : Django, Flask, FastAPI, SQLAlchemy
- **Testing** : pytest, unittest, mocking, test-driven development
- **Data Science** : pandas, numpy, matplotlib, jupyter notebooks
- **Programmation asynchrone** : asyncio, patterns async/await
- **Gestion des paquets** : pip, poetry, environnements virtuels
- **Qualité du code** : PEP 8, type hints, linting avec pylint/flake8

Pour les tâches Python :

1. Suivez les directives de style PEP 8
2. Utilisez des type hints pour une meilleure documentation du code
3. Implémentez une gestion d'erreurs appropriée avec des exceptions spécifiques
4. Écrivez des docstrings complètes
5. Prenez en compte les performances et l'utilisation de la mémoire
6. Incluez un logging approprié
7. Écrivez du code modulaire et testable

Concentrez-vous sur l'écriture de code Python propre et maintenable qui suit les standards de la communauté.
```

**Cas d'usage :**

- "Créer un service FastAPI pour l'authentification des utilisateurs avec des tokens JWT"
- "Implémenter un pipeline de traitement de données avec pandas et gestion des erreurs"
- "Écrire un outil CLI en utilisant argparse avec une documentation d'aide complète"

## Bonnes pratiques

### Principes de conception

#### Principe de responsabilité unique

Chaque sous-agent doit avoir un objectif clair et précis.

**✅ Bon :**

```markdown
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ À éviter :**

```markdown
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Pourquoi :** Des agents focalisés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d'expertise spécifiques plutôt que des compétences générales.

**✅ Bon :**

```markdown
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ À éviter :**

```markdown
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Pourquoi :** Une expertise spécifique permet une assistance plus ciblée et efficace.

#### Descriptions Actionnables

Rédigez des descriptions qui indiquent clairement quand utiliser l'agent.

**✅ Bon :**

```markdown
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ À éviter :**

```markdown
description: A helpful code reviewer
```

**Pourquoi :** Des descriptions claires aident l'IA principale à choisir le bon agent pour chaque tâche.

### Bonnes Pratiques de Configuration

#### Guidelines pour le Prompt Système

**Précisez votre expertise :**

```markdown
Vous êtes un spécialiste Python testing avec une expertise dans :

- Le framework pytest et les fixtures
- Les objets Mock et l'injection de dépendances
- Les pratiques de développement piloté par les tests (TDD)
- Le testing de performance avec pytest-benchmark
```

**Incluez des approches étape par étape :**

```markdown
Pour chaque tâche de testing :

1. Analysez la structure du code et ses dépendances
2. Identifiez les fonctionnalités clés et les cas limites
3. Créez des suites de tests complètes avec des noms clairs
4. Incluez le setup/teardown et les assertions appropriées
5. Ajoutez des commentaires expliquant les scénarios de test complexes
```

**Spécifiez les standards de sortie :**

```markdown
Suivez toujours ces standards :

- Utilisez des noms de test descriptifs qui expliquent le scénario
- Incluez à la fois des cas de test positifs et négatifs
- Ajoutez des docstrings pour les fonctions de test complexes
- Assurez-vous que les tests sont indépendants et peuvent s'exécuter dans n'importe quel ordre
```

## Considérations de sécurité

- **Restrictions des outils** : Les subagents n'ont accès qu'aux outils configurés
- **Sandboxing** : Toute exécution d'outil suit le même modèle de sécurité que l'utilisation directe des outils
- **Journal d'audit** : Toutes les actions des subagents sont enregistrées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau projet et utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations des agents
- **Environnements de production** : Envisagez d'utiliser des agents distincts pour les environnements de production et de développement