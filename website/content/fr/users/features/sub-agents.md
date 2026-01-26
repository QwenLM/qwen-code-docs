# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui gèrent des types spécifiques de tâches au sein de Qwen Code. Ils vous permettent de déléguer un travail ciblé à des agents IA configurés avec des invites, outils et comportements spécifiques à la tâche.

## Qu'est-ce que les sous-agents ?

Les sous-agents sont des assistants IA indépendants qui :

- **Spécialisés dans des tâches spécifiques** - Chaque sous-agent est configuré avec une invite système ciblée pour des types particuliers de travail
- **Ont un contexte séparé** - Ils conservent leur propre historique de conversation, distinct de votre discussion principale
- **Utilisent des outils contrôlés** - Vous pouvez configurer quels outils chaque sous-agent peut utiliser
- **Travaillent de manière autonome** - Une fois une tâche attribuée, ils travaillent indépendamment jusqu'à l'achèvement ou l'échec
- **Fournissent des retours détaillés** - Vous pouvez voir leur progression, l'utilisation des outils et les statistiques d'exécution en temps réel

## Principaux avantages

- **Spécialisation des tâches** : Créez des agents optimisés pour des flux de travail spécifiques (tests, documentation, remaniement, etc.)
- **Isolation du contexte** : Gardez les travaux spécialisés séparés de votre conversation principale
- **Réutilisabilité** : Enregistrez et réutilisez les configurations d'agent dans différents projets et sessions
- **Accès contrôlé** : Limitez les outils auxquels chaque agent peut accéder pour plus de sécurité et de concentration
- **Visibilité de la progression** : Surveillez l'exécution des agents avec des mises à jour en temps réel

## Fonctionnement des sous-agents

1. **Configuration** : Vous créez des configurations de sous-agents qui définissent leur comportement, leurs outils et leurs invites système
2. **Délégation** : L'IA principale peut automatiquement déléguer des tâches aux sous-agents appropriés
3. **Exécution** : Les sous-agents travaillent indépendamment, utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient les résultats et les résumés d'exécution à la conversation principale

## Premiers pas

### Démarrage rapide

1. **Créez votre premier Subagent** :

   `/agents create`

   Suivez l'assistant guidé pour créer un agent spécialisé.

2. **Gérez les agents existants** :

   `/agents manage`

   Consultez et gérez vos Subagents configurés.

3. **Utilisez les Subagents automatiquement** : Demandez simplement à l'IA principale d'exécuter des tâches correspondant aux spécialisations de vos Subagents. L'IA délèguera automatiquement les travaux appropriés.

### Exemple d'utilisation

```
Utilisateur : "Veuillez écrire des tests complets pour le module d'authentification"
IA : Je vais déléguer cela à vos Subagents spécialistes des tests.
[Délègue au Subagent "testing-expert"]
[Affiche la progression en temps réel de la création des tests]
[Retourne avec les fichiers de test terminés et un résumé d'exécution]
```

## Gestion

### Commandes CLI

Les sous-agents sont gérés via la commande slash `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent à travers un assistant guidé en plusieurs étapes.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue interactive de gestion pour afficher et gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown dans plusieurs emplacements :

- **Au niveau du projet** : `.qwen/agents/` (priorité la plus élevée)
- **Au niveau utilisateur** : `~/.qwen/agents/` (solution de repli)
- **Au niveau de l'extension** : fourni par les extensions installées

Cela vous permet d'avoir des agents spécifiques au projet, des agents personnels qui fonctionnent dans tous les projets, ainsi que des agents fournis par des extensions qui ajoutent des capacités spécialisées.

### Sous-agents d'extension

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l'extension et suivent le même format que les agents personnels et les agents de projet.

Les sous-agents d'extension :

- Sont automatiquement découverts lorsque l'extension est activée
- Apparaissent dans la boîte de dialogue `/agents manage` sous la section "Agents d'extension"
- Ne peuvent pas être modifiés directement (modifiez plutôt la source de l'extension)
- Suivent le même format de configuration que les agents définis par l'utilisateur

Pour voir quelles extensions fournissent des sous-agents, vérifiez le fichier `qwen-extension.json` de l'extension à la recherche d'un champ `agents`.

### Format de fichier

Les sous-agents sont configurés à l'aide de fichiers Markdown avec des métadonnées YAML. Ce format est lisible par les humains et facile à modifier avec n'importe quel éditeur de texte.

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
Les paragraphes multiples sont pris en charge.
Vous pouvez utiliser le templating avec ${variable} pour du contenu dynamique.
```

#### Exemple d'utilisation

```
---
name: documentaliste-projet
description: Crée la documentation du projet et les fichiers README
---

Vous êtes un spécialiste de la documentation pour le projet ${project_name}.

Votre tâche : ${task_description}

Répertoire de travail : ${current_directory}
Généré le : ${timestamp}

Concentrez-vous sur la création d'une documentation claire et complète qui aide à la fois
les nouveaux contributeurs et les utilisateurs finaux à comprendre le projet.
```

## Utiliser efficacement les sous-agents

### Délégation automatique

Qwen Code délègue proactivement les tâches en se basant sur :

- La description de la tâche dans votre requête
- Le champ de description dans les configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des expressions comme "UTILISER DE MANIÈRE PROACTIVE" ou "DOIT ÊTRE UTILISÉ" dans votre champ de description.

### Invocation explicite

Demandez un sous-agent spécifique en le mentionnant dans votre commande :

```
Laissez les sous-agents experts en test créer les tests unitaires pour le module de paiement
Faites mettre à jour la référence de l'API par les sous-agents rédacteurs de documentation
Demandez aux sous-agents spécialistes React d'optimiser les performances de ce composant
```

## Exemples

### Agents pour les flux de travail de développement

#### Spécialiste des tests

Parfait pour la création complète de tests et le développement piloté par les tests.

```
---
name: testing-expert
description: Rédige des tests unitaires complets, des tests d'intégration et gère l'automatisation des tests avec les meilleures pratiques
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste des tests axé sur la création de tests de haute qualité et maintenables.

Votre expertise inclut :

- Tests unitaires avec mocking et isolation appropriés
- Tests d'intégration pour les interactions entre composants
- Pratiques de développement piloté par les tests (TDD)
- Identification des cas limites et couverture exhaustive
- Tests de performance et de charge lorsque c'est approprié

Pour chaque tâche de test :

1. Analysez la structure du code et les dépendances
2. Identifiez les fonctionnalités clés, les cas limites et les conditions d'erreur
3. Créez des suites de tests complètes avec des noms descriptifs
4. Incluez un bon setup/teardown et des assertions significatives
5. Ajoutez des commentaires expliquant les scénarios de test complexes
6. Assurez-vous que les tests sont maintenables et respectent les principes DRY

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
description: Crée une documentation complète, des fichiers README, de la documentation API et des guides utilisateurs
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Vous êtes un spécialiste de la documentation technique pour ${project_name}.

Votre rôle est de créer une documentation claire et complète qui serve à la fois
les développeurs et les utilisateurs finaux. Concentrez-vous sur :

**Pour la documentation API :**

- Des descriptions claires des points de terminaison avec des exemples
- Les détails des paramètres avec leurs types et contraintes
- La documentation du format des réponses
- Les explications des codes d'erreur
- Les exigences d'authentification

**Pour la documentation utilisateur :**

- Des instructions étape par étape avec des captures d'écran si utile
- Des guides d'installation et de configuration
- Les options de configuration et exemples
- Des sections de dépannage pour les problèmes courants
- Des sections FAQ basées sur les questions fréquentes des utilisateurs

**Pour la documentation développeur :**

- Des aperçus de l'architecture et décisions de conception
- Des exemples de code qui fonctionnent réellement
- Les lignes directrices pour contribuer
- La configuration de l'environnement de développement

Vérifiez toujours les exemples de code et assurez-vous que la documentation reste à jour
avec l'implémentation réelle. Utilisez des titres clairs, des puces et des exemples.
```

**Cas d'utilisation :**

- « Créer une documentation API pour les points de terminaison de gestion des utilisateurs »
- « Écrire un README complet pour ce projet »
- « Documenter le processus de déploiement avec des étapes de dépannage »

#### Relecteur de code

Axé sur la qualité du code, la sécurité et les meilleures pratiques.

```
---
name: code-reviewer
description: Examine le code pour les meilleures pratiques, les problèmes de sécurité, les performances et la maintenabilité
tools:
  - read_file
  - read_many_files
---

Vous êtes un relecteur de code expérimenté axé sur la qualité, la sécurité et la maintenabilité.

Critères de révision :

- **Structure du code** : Organisation, modularité et séparation des responsabilités
- **Performances** : Efficacité algorithmique et utilisation des ressources
- **Sécurité** : Évaluation des vulnérabilités et pratiques de codage sécurisées
- **Meilleures pratiques** : Conventions spécifiques au langage/cadriciel
- **Gestion des erreurs** : Traitement approprié des exceptions et couverture des cas limites
- **Lisibilité** : Nommage clair, commentaires et organisation du code
- **Tests** : Couverture des tests et considérations sur la testabilité

Fournissez des commentaires constructifs avec :

1. **Problèmes critiques** : Vulnérabilités de sécurité, bogues majeurs
2. **Améliorations importantes** : Problèmes de performances, problèmes de conception
3. **Suggestions mineures** : Améliorations de style, opportunités de remaniement
4. **Commentaires positifs** : Modèles bien implémentés et bonnes pratiques

Concentrez-vous sur des commentaires actionnables avec des exemples spécifiques et des solutions proposées.
Hiérarchisez les problèmes par impact et fournissez une justification pour les recommandations.
```

**Cas d'utilisation :**

- « Vérifiez cette implémentation d'authentification pour les problèmes de sécurité »
- « Vérifiez les implications en termes de performances de cette logique de requête de base de données »
- « Évaluez la structure du code et suggérez des améliorations »

### Agents spécifiques à la technologie

#### Spécialiste React

Optimisé pour le développement React, les hooks et les patrons de composants.

```
---
name: react-specialist
description: Expert en développement React, hooks, patrons de composants et meilleures pratiques modernes de React
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste de React avec une expertise approfondie en développement React moderne.

Votre expertise couvre :

- **Conception de composants** : Composants fonctionnels, hooks personnalisés, patrons de composition
- **Gestion d'état** : useState, useReducer, Context API, et bibliothèques externes
- **Performance** : React.memo, useMemo, useCallback, découpage de code
- **Tests** : React Testing Library, Jest, stratégies de test de composants
- **Intégration TypeScript** : Typage approprié des props, hooks et composants
- **Patrons modernes** : Suspense, Error Boundaries, Fonctionnalités concurrentes

Pour les tâches React :

1. Utiliser par défaut les composants fonctionnels et les hooks
2. Implémenter un typage TypeScript approprié
3. Suivre les meilleures pratiques et conventions React
4. Considérer les implications en termes de performance
5. Inclure une gestion d'erreurs appropriée
6. Écrire du code testable et maintenable

Restez toujours à jour sur les meilleures pratiques React et évitez les patrons obsolètes.
Mettez l'accent sur l'accessibilité et la prise en compte de l'expérience utilisateur.
```

**Cas d'utilisation :**

- « Créer un composant de tableau de données réutilisable avec tri et filtrage »
- « Implémenter un hook personnalisé pour la récupération de données API avec mise en cache »
- « Refactoriser ce composant de classe pour utiliser les patrons React modernes »

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

- **Python fondamental** : patrons Pythoniques, structures de données, algorithmes
- **Frameworks** : Django, Flask, FastAPI, SQLAlchemy
- **Tests** : pytest, unittest, mocking, développement piloté par les tests
- **Science des données** : pandas, numpy, matplotlib, notebooks jupyter
- **Programmation asynchrone** : asyncio, patrons async/await
- **Gestion des paquets** : pip, poetry, environnements virtuels
- **Qualité du code** : PEP 8, annotations de type, vérification avec pylint/flake8

Pour les tâches Python :

1. Suivre les directives de style PEP 8
2. Utiliser les annotations de type pour une meilleure documentation du code
3. Implémenter une gestion appropriée des erreurs avec des exceptions spécifiques
4. Rédiger des docstrings complètes
5. Prendre en compte les performances et l'utilisation mémoire
6. Inclure une journalisation appropriée
7. Écrire un code modulaire et testable

Mettre l'accent sur l'écriture d'un code Python propre et maintenable qui suit les standards de la communauté.
```

**Cas d'utilisation :**

- « Créer un service FastAPI pour l'authentification des utilisateurs avec des jetons JWT »
- « Implémenter un pipeline de traitement de données avec pandas et gestion des erreurs »
- « Écrire un outil en ligne de commande utilisant argparse avec une documentation d'aide complète »

## Meilleures pratiques

### Principes de conception

#### Principe de responsabilité unique

Chaque sous-agent doit avoir un objectif clair et ciblé.

**✅ Correct :**

```
---
name: testing-expert
description: Écrit des tests unitaires et des tests d'intégration complets
---
```

**❌ À éviter :**

```
---
name: general-helper
description: Aide à la réalisation des tests, de la documentation, des revues de code et du déploiement
---
```

**Pourquoi :** Les agents ciblés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d'expertise spécifiques plutôt que des capacités générales.

**✅ Correct :**

```
---
name: react-performance-optimizer
description: Optimise les performances des applications React en utilisant le profilage et les meilleures pratiques
---
```

**❌ À éviter :**

```
---
name: frontend-developer
description: Effectue des tâches liées au développement frontend
---
```

**Pourquoi :** Une expertise spécifique conduit à une assistance plus ciblée et efficace.

#### Descriptions actionnables

Rédigez des descriptions qui indiquent clairement quand utiliser l'agent.

**✅ Correct :**

```
description: Examine le code à la recherche de vulnérabilités de sécurité, de problèmes de performances et de préoccupations liées à la maintenabilité
```

**❌ À éviter :**

```
description: Un relecteur de code utile
```

**Pourquoi :** Des descriptions claires aident l'IA principale à choisir le bon agent pour chaque tâche.

### Meilleures pratiques de configuration

#### Lignes directrices pour les invites système

**Spécifiez clairement l'expertise :**

```
Vous êtes un spécialiste des tests en Python avec une expertise dans :

- Le framework pytest et ses fixtures
- Les objets mock et l'injection de dépendances
- Les pratiques de développement piloté par les tests (TDD)
- Les tests de performance avec pytest-benchmark
```

**Incluez des approches étape par étape :**

```
Pour chaque tâche de test :

1. Analysez la structure du code et ses dépendances
2. Identifiez les fonctionnalités clés et les cas limites
3. Créez des suites de tests complètes avec des noms explicites
4. Incluez les configurations d'initialisation/Nettoyage et des assertions appropriées
5. Ajoutez des commentaires expliquant les scénarios de test complexes
```

**Précisez les normes de sortie :**

```
Suivez toujours ces normes :

- Utilisez des noms de test descriptifs qui expliquent le scénario
- Incluez à la fois les cas de test positifs et négatifs
- Ajoutez des docstrings pour les fonctions de test complexes
- Assurez-vous que les tests sont indépendants et peuvent s'exécuter dans n'importe quel ordre
```

## Considérations de sécurité

- **Restrictions des outils** : Les sous-agents n'ont accès qu'aux outils qui leur sont configurés
- **Isolation (sandboxing)** : Toute exécution d'outil suit le même modèle de sécurité que l'utilisation directe des outils
- **Journalisation** : Toutes les actions des sous-agents sont enregistrées et visibles en temps réel
- **Contrôle d'accès** : La séparation au niveau du projet et de l'utilisateur fournit des limites appropriées
- **Informations sensibles** : Évitez d'inclure des secrets ou des identifiants dans les configurations des agents
- **Environnements de production** : Prévoyez des agents distincts pour les environnements de production et de développement