# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui gèrent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer un travail ciblé à des agents IA configurés avec des invites, des outils et des comportements spécifiques aux tâches.

## Que sont les sous-agents ?

Les sous-agents sont des assistants IA indépendants qui :

- **Se spécialisent dans des tâches spécifiques** - Chaque sous-agent est configuré avec une invite système focalisée pour des types particuliers de travail  
- **Ont un contexte séparé** - Ils maintiennent leur propre historique de conversation, distinct de votre discussion principale  
- **Utilisent des outils contrôlés** - Vous pouvez configurer les outils auxquels chaque sous-agent a accès  
- **Travaillent de manière autonome** - Une fois une tâche assignée, ils travaillent indépendamment jusqu'à son achèvement ou son échec  
- **Fournissent des retours détaillés** - Vous pouvez suivre en temps réel leur progression, l'utilisation des outils et les statistiques d'exécution

## Avantages Clés

- **Spécialisation des Tâches** : Créez des agents optimisés pour des flux de travail spécifiques (tests, documentation, refactorisation, etc.)
- **Isolation du Contexte** : Gardez le travail spécialisé séparé de votre conversation principale
- **Réutilisabilité** : Enregistrez et réutilisez les configurations d'agents entre projets et sessions
- **Accès Contrôlé** : Limitez les outils que chaque agent peut utiliser pour la sécurité et la concentration
- **Visibilité de la Progression** : Surveillez l'exécution des agents avec des mises à jour de progression en temps réel

## Fonctionnement des Sous-Agents

1. **Configuration** : Vous créez des configurations de Sous-Agents qui définissent leur comportement, leurs outils et leurs invites système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux Sous-Agents appropriés
3. **Exécution** : Les Sous-Agents travaillent indépendamment, utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution à la conversation principale

## Premiers Pas

### Démarrage rapide

1. **Créer votre premier Subagent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérer les agents existants** :

   `/agents manage`

   Affichez et gérez vos Subagents configurés.

3. **Utiliser les Subagents automatiquement** : Il suffit de demander à l'IA principale d'effectuer des tâches correspondant aux spécialisations de vos Subagents. L'IA déléguera automatiquement le travail approprié.

### Exemple d'utilisation

```
Utilisateur : « Veuillez écrire des tests complets pour le module d'authentification »
IA : Je vais déléguer cela à vos Subagents spécialistes des tests.
[Délègue aux Subagents « testing-expert »]
[Affiche la progression en temps réel de la création des tests]
[Renvoie les fichiers de test terminés et le résumé de l'exécution]`
```

## Gestion

### Commandes CLI

Les sous-agents sont gérés via la commande slash `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent via un assistant étape par étape.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue interactive pour afficher et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown dans deux emplacements :

- **Au niveau du projet** : `.qwen/agents/` (prioritaire)
- **Au niveau de l'utilisateur** : `~/.qwen/agents/` (solution de repli)

Cela vous permet d'avoir à la fois des agents spécifiques au projet et des agents personnels qui fonctionnent sur tous les projets.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec un frontmatter YAML. Ce format est lisible par l'homme et facile à modifier avec n'importe quel éditeur de texte.

#### Structure de base

```
---
name: nom-de-l-agent
description: Brève description de quand et comment utiliser cet agent
tools:
	- outil1
	- outil2
	- outil3 # Optionnel
---

Le contenu de l'invite système va ici.
Plusieurs paragraphes sont pris en charge.
Vous pouvez utiliser le templating ${variable} pour du contenu dynamique.
```

#### Exemple d'utilisation

```
---
name: documenteur-de-projet
description: Crée la documentation du projet et les fichiers README
---

Vous êtes un spécialiste de la documentation pour le projet ${project_name}.

Votre tâche : ${task_description}

Répertoire de travail : ${current_directory}
Généré le : ${timestamp}

Concentrez-vous sur la création d'une documentation claire et complète qui aide
les nouveaux contributeurs et les utilisateurs finaux à comprendre le projet.
```

## Utiliser efficacement les sous-agents

### Délégation automatique

Qwen Code délègue de manière proactive les tâches en se basant sur :

- La description de la tâche dans votre requête
- Le champ de description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des expressions comme « utiliser de manière PROACTIVE » ou « DOIT ÊTRE UTILISÉ » dans le champ de description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Laissez le sous-agent expert en test créer des tests unitaires pour le module de paiement
Faites en sorte que le sous-agent rédacteur de documentation mette à jour la référence de l'API
Demandez au sous-agent spécialiste React d'optimiser les performances de ce composant
```

## Exemples

### Agents de flux de développement

#### Spécialiste en Tests

Parfait pour la création de tests complets et le développement piloté par les tests.

```
---
name: testing-expert
description: Rédige des tests unitaires et d'intégration complets, et gère l'automatisation des tests selon les meilleures pratiques
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste en tests axé sur la création de tests de haute qualité et maintenables.

Votre expertise inclut :

- Les tests unitaires avec simulation (mocking) et isolement appropriés
- Les tests d'intégration pour les interactions entre composants
- Les pratiques de développement piloté par les tests (TDD)
- L'identification des cas limites et une couverture complète
- Les tests de performance et de charge lorsque cela est pertinent

Pour chaque tâche de test :

1. Analyser la structure du code et ses dépendances
2. Identifier les fonctionnalités clés, les cas limites et les conditions d'erreur
3. Créer des suites de tests complètes avec des noms explicites
4. Inclure une configuration/nettoyage adéquate et des assertions significatives
5. Ajouter des commentaires expliquant les scénarios de test complexes
6. Veiller à ce que les tests soient maintenables et respectent le principe DRY

Suivez toujours les meilleures pratiques de test pour le langage et le framework détectés.
Portez attention aux cas de test positifs comme négatifs.
```

**Cas d’usage :**

- « Écrire des tests unitaires pour le service d'authentification »
- « Créer des tests d’intégration pour le flux de traitement des paiements »
- « Ajouter une couverture de test pour les cas limites dans le module de validation des données »

#### Rédacteur de documentation

Spécialisé dans la création de documentation claire et complète.

```
---
name: documentation-writer
description: Crée une documentation complète, des fichiers README, des documentations d'API et des guides utilisateur
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Vous êtes un spécialiste de la documentation technique pour ${project_name}.

Votre rôle consiste à créer une documentation claire et complète qui serve à la fois
les développeurs et les utilisateurs finaux. Concentrez-vous sur :

**Pour la documentation d'API :**

- Des descriptions claires des points de terminaison avec des exemples
- Les détails des paramètres avec leurs types et contraintes
- La documentation du format des réponses
- Les explications des codes d'erreur
- Les exigences d'authentification

**Pour la documentation utilisateur :**

- Des instructions pas à pas avec des captures d'écran quand cela est utile
- Des guides d'installation et de configuration
- Les options de configuration et des exemples
- Des sections de dépannage pour les problèmes courants
- Des sections FAQ basées sur les questions fréquentes des utilisateurs

**Pour la documentation développeur :**

- Des aperçus de l'architecture et des décisions de conception
- Des exemples de code fonctionnels
- Des directives de contribution
- La configuration de l'environnement de développement

Vérifiez toujours les exemples de code et assurez-vous que la documentation reste à jour avec
l'implémentation actuelle. Utilisez des titres clairs, des listes à puces et des exemples.
```

**Cas d'utilisation :**

- « Créer une documentation d'API pour les points de terminaison de gestion des utilisateurs »
- « Rédiger un README complet pour ce projet »
- « Documenter le processus de déploiement avec des étapes de dépannage »

#### Code Reviewer

Axé sur la qualité du code, la sécurité et les meilleures pratiques.

```
---
name: code-reviewer
description: Examine le code pour vérifier les bonnes pratiques, les problèmes de sécurité, les performances et la maintenabilité
tools:
  - read_file
  - read_many_files
---

Vous êtes un réviseur de code expérimenté axé sur la qualité, la sécurité et la maintenabilité.

Critères d'examen :

- **Structure du code** : Organisation, modularité et séparation des préoccupations
- **Performances** : Efficacité algorithmique et utilisation des ressources
- **Sécurité** : Évaluation des vulnérabilités et pratiques de codage sécurisé
- **Meilleures pratiques** : Conventions spécifiques au langage ou au framework
- **Gestion des erreurs** : Gestion appropriée des exceptions et couverture des cas limites
- **Lisibilité** : Nommage clair, commentaires et organisation du code
- **Tests** : Couverture des tests et facilité de test

Fournissez des retours constructifs comprenant :

1. **Problèmes critiques** : Vulnérabilités de sécurité, bogues majeurs
2. **Améliorations importantes** : Problèmes de performance, problèmes de conception
3. **Suggestions mineures** : Améliorations stylistiques, opportunités de refactorisation
4. **Retours positifs** : Modèles bien implémentés et bonnes pratiques

Concentrez-vous sur des retours exploitables avec des exemples précis et des solutions suggérées.
Hiérarchisez les problèmes par impact et fournissez une justification pour vos recommandations.
```

**Cas d'utilisation :**

- « Examinez cette implémentation d'authentification pour identifier les problèmes de sécurité »
- « Vérifiez les implications en termes de performance de cette logique de requête de base de données »
- « Évaluez la structure du code et proposez des améliorations »

### Agents Spécifiques aux Technologies

#### Spécialiste React

Optimisé pour le développement React, les hooks et les modèles de composants.

```
---
name: react-specialist
description: Expert en développement React, hooks, modèles de composants et meilleures pratiques React modernes
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste React possédant une expertise approfondie dans le développement React moderne.

Votre expertise couvre :

- **Conception de composants** : Composants fonctionnels, hooks personnalisés, modèles de composition
- **Gestion d'état** : useState, useReducer, Context API et bibliothèques externes
- **Performance** : React.memo, useMemo, useCallback, découpage du code
- **Tests** : React Testing Library, Jest, stratégies de test de composants
- **Intégration TypeScript** : Typage approprié des props, hooks et composants
- **Modèles modernes** : Suspense, Error Boundaries, fonctionnalités concurrentes

Pour les tâches React :

1. Utilisez des composants fonctionnels et des hooks par défaut
2. Implémentez un typage TypeScript approprié
3. Suivez les meilleures pratiques et conventions React
4. Prenez en compte les implications de performance
5. Incluez une gestion d'erreurs adéquate
6. Écrivez du code testable et maintenable

Restez toujours à jour avec les meilleures pratiques React et évitez les modèles obsolètes.
Portez attention à l'accessibilité et aux considérations d'expérience utilisateur.
```

**Cas d'utilisation :**

- « Créer un composant de tableau de données réutilisable avec tri et filtrage »
- « Implémenter un hook personnalisé pour la récupération de données API avec mise en cache »
- « Refactoriser ce composant basé sur une classe pour utiliser les modèles React modernes »

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

- **Python de base** : Modèles pythoniques, structures de données, algorithmes
- **Frameworks** : Django, Flask, FastAPI, SQLAlchemy
- **Tests** : pytest, unittest, mocking, développement piloté par les tests
- **Science des données** : pandas, numpy, matplotlib, notebooks Jupyter
- **Programmation asynchrone** : asyncio, motifs async/await
- **Gestion des paquets** : pip, poetry, environnements virtuels
- **Qualité du code** : PEP 8, annotations de type, linting avec pylint/flake8

Pour les tâches Python :

1. Suivez les directives de style PEP 8
2. Utilisez les annotations de type pour une meilleure documentation du code
3. Implémentez une gestion d'erreurs appropriée avec des exceptions spécifiques
4. Rédigez des docstrings complètes
5. Prenez en compte les performances et l'utilisation de la mémoire
6. Incluez une journalisation appropriée
7. Écrivez du code modulaire et testable

Concentrez-vous sur l'écriture de code Python propre et maintenable qui suit les normes communautaires.
```

**Cas d'usage :**

- « Créer un service FastAPI pour l'authentification des utilisateurs avec des jetons JWT »
- « Implémenter un pipeline de traitement de données avec pandas et gestion des erreurs »
- « Écrire un outil CLI utilisant argparse avec une documentation d'aide complète »

## Bonnes pratiques

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
description: Aide aux tests, documentation, revue de code et déploiement
---
```

**Pourquoi :** Les agents focalisés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d'expertise spécifiques plutôt que des capacités générales.

**✅ Bon :**

```
---
name: react-performance-optimizer
description: Optimise les applications React pour la performance en utilisant le profilage et les meilleures pratiques
---
```

**❌ À éviter :**

```
---
name: frontend-developer
description: Travaille sur les tâches de développement frontend
---
```

**Pourquoi :** Une expertise spécifique permet une assistance plus ciblée et efficace.

#### Descriptions exploitables

Rédigez des descriptions qui indiquent clairement quand utiliser l'agent.

**✅ Bon :**

```
description: Examine le code pour détecter les vulnérabilités de sécurité, les problèmes de performance et les préoccupations liées à la maintenabilité
```

**❌ À éviter :**

```
description: Un réviseur de code utile
```

**Pourquoi :** Des descriptions claires aident l'IA principale à choisir le bon agent pour chaque tâche.

### Bonnes pratiques de configuration

#### Consignes pour le Prompt Système

**Précisez votre Expertise :**

```
Vous êtes un spécialiste des tests en Python avec une expertise dans :

- Le framework pytest et les fixtures
- Les objets Mock et l'injection de dépendances
- Les pratiques de développement piloté par les tests (TDD)
- Les tests de performance avec pytest-benchmark
```

**Incluez des Approches Étape par Étape :**

```
Pour chaque tâche de test :

1. Analysez la structure du code et ses dépendances
2. Identifiez les fonctionnalités clés et les cas limites
3. Créez des suites de tests complètes avec des noms explicites
4. Intégrez la configuration/init/teardown et les assertions appropriées
5. Ajoutez des commentaires expliquant les scénarios de test complexes
```

**Spécifiez les Normes de Sortie :**

```
Suivez toujours ces normes :

- Utilisez des noms de test descriptifs qui expliquent le scénario
- Incluez à la fois des cas de test positifs et négatifs
- Ajoutez des docstrings pour les fonctions de test complexes
- Assurez-vous que les tests sont indépendants et peuvent être exécutés dans n'importe quel ordre
```

## Considérations de sécurité

- **Restrictions des outils** : Les sous-agents n'ont accès qu'aux outils configurés
- **Sandboxing** : Toute exécution d'outils suit le même modèle de sécurité que l'utilisation directe des outils
- **Journalisation** : Toutes les actions des sous-agents sont enregistrées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau du projet et de l'utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations des agents
- **Environnements de production** : Envisagez d'utiliser des agents distincts pour les environnements de production et de développement