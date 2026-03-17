# Sous-agents

Les sous-agents sont des assistants IA spécialisés qui traitent des types de tâches spécifiques au sein de Qwen Code. Ils vous permettent de déléguer des travaux ciblés à des agents IA configurés avec des invites, des outils et des comportements adaptés à chaque tâche.

## Qu’est-ce qu’un sous-agent ?

Les sous-agents sont des assistants IA indépendants qui :

- **Se spécialisent dans des tâches spécifiques** — Chaque sous-agent est configuré avec une invite système ciblée, adaptée à un type précis de travail  
- **Possèdent un contexte séparé** — Ils conservent leur propre historique de conversation, distinct de votre discussion principale  
- **Utilisent des outils contrôlés** — Vous pouvez configurer précisément quels outils chaque sous-agent est autorisé à utiliser  
- **Travaillent de façon autonome** — Une fois une tâche assignée, ils agissent de manière indépendante jusqu’à son achèvement ou son échec  
- **Fournissent des retours détaillés** — Vous pouvez suivre en temps réel leurs progrès, l’utilisation des outils ainsi que les statistiques d’exécution

## Principaux avantages

- **Spécialisation des tâches** : Créez des agents optimisés pour des flux de travail spécifiques (tests, documentation, refactorisation, etc.)
- **Isolation du contexte** : Gardez les travaux spécialisés séparés de votre conversation principale
- **Réutilisabilité** : Enregistrez et réutilisez les configurations d’agents entre projets et sessions
- **Accès contrôlé** : Limitez les outils auxquels chaque agent peut accéder, afin de renforcer la sécurité et la concentration
- **Visibilité de l’avancement** : Suivez l’exécution des agents grâce à des mises à jour en temps réel sur leur progression

## Fonctionnement des sous-agents

1. **Configuration** : Vous créez des configurations de sous-agents qui définissent leur comportement, leurs outils et leurs invites système
2. **Délégation** : L’IA principale peut déléguer automatiquement des tâches aux sous-agents appropriés
3. **Exécution** : Les sous-agents travaillent de façon indépendante, en utilisant leurs outils configurés pour accomplir les tâches
4. **Résultats** : Ils renvoient leurs résultats ainsi qu’un résumé de l’exécution à la conversation principale

## Premiers pas

### Démarrage rapide

1. **Créez votre premier sous-agent** :

   `/agents create`

   Suivez l’assistant pas à pas pour créer un agent spécialisé.

2. **Gérez vos agents existants** :

   `/agents manage`

   Affichez et gérez vos sous-agents configurés.

3. **Utilisez les sous-agents automatiquement** : Il vous suffit de demander à l’IA principale d’exécuter des tâches correspondant aux spécialisations de vos sous-agents. L’IA délègue automatiquement les tâches appropriées.

### Exemple d’utilisation

```
Utilisateur : « Veuillez rédiger des tests complets pour le module d’authentification. »
IA : Je vais déléguer cette tâche à vos sous-agents spécialisés dans les tests.
[Délégation au sous-agent « testing-expert »]
[Affichage en temps réel de l’avancement de la création des tests]
[Renvoi des fichiers de tests terminés ainsi qu’un résumé de leur exécution]
```

## Gestion

### Commandes CLI

Les sous-agents sont gérés via la commande slash `/agents` et ses sous-commandes :

**Utilisation :** `/agents create`. Crée un nouveau sous-agent à l’aide d’un assistant pas à pas.

**Utilisation :** `/agents manage`. Ouvre une boîte de dialogue interactive permettant d’afficher et de gérer les sous-agents existants.

### Emplacements de stockage

Les sous-agents sont stockés sous forme de fichiers Markdown à plusieurs emplacements :

- **Au niveau du projet** : `.qwen/agents/` (priorité la plus élevée)  
- **Au niveau de l’utilisateur** : `~/.qwen/agents/` (solution de repli)  
- **Au niveau de l’extension** : fournis par les extensions installées  

Cela vous permet de disposer de sous-agents spécifiques à un projet, de sous-agents personnels fonctionnant dans tous vos projets, ainsi que de sous-agents fournis par des extensions pour ajouter des fonctionnalités spécialisées.

### Sous-agents d’extension

Les extensions peuvent fournir des sous-agents personnalisés qui deviennent disponibles dès que l’extension est activée. Ces agents sont stockés dans le répertoire `agents/` de l’extension et suivent le même format que les agents personnels et ceux propres aux projets.

Caractéristiques des sous-agents d’extension :

- Ils sont automatiquement détectés dès que l’extension est activée.  
- Ils apparaissent dans la boîte de dialogue `/agents manage`, dans la section « Sous-agents d’extension ».  
- Ils ne peuvent pas être modifiés directement (modifiez plutôt la source de l’extension).  
- Ils utilisent le même format de configuration que les agents définis par l’utilisateur.  

Pour savoir quelles extensions fournissent des sous-agents, consultez le fichier `qwen-extension.json` de l’extension et recherchez le champ `agents`.

### Format de fichier

Les sous-agents sont configurés à l’aide de fichiers Markdown comportant un bloc YAML en en-tête (« frontmatter »). Ce format est lisible par un humain et facile à éditer avec n’importe quel éditeur de texte.

#### Structure de base

```
---
name: nom-de-l-agent
description: Brève description des cas et des conditions d’utilisation de cet agent
tools:
	- outil1
	- outil2
	- outil3 # Facultatif
---

Contenu de l’invite système ici.
Plusieurs paragraphes sont pris en charge.
Vous pouvez utiliser la syntaxe de templating `${variable}` pour du contenu dynamique.
```

#### Exemple d’utilisation

```
---
name: documentateur-de-projet
description: Crée la documentation du projet et les fichiers README
---

Vous êtes un spécialiste de la documentation pour le projet ${project_name}.

Votre tâche : ${task_description}

Répertoire de travail : ${current_directory}
Généré le : ${timestamp}

Concentrez-vous sur la création d’une documentation claire et complète, utile aussi bien aux nouveaux contributeurs qu’aux utilisateurs finaux pour comprendre le projet.
```

## Utiliser efficacement les sous-agents

### Délégation automatique

Qwen Code délègue proactivement les tâches en se basant sur :

- La description de la tâche figurant dans votre demande
- Le champ `description` des configurations des sous-agents
- Le contexte actuel et les outils disponibles

Pour encourager une utilisation plus proactive des sous-agents, incluez des formulations telles que « UTILISER DE MANIÈRE PROACTIVE » ou « DOIT ÊTRE UTILISÉ » dans le champ `description`.

### Appel explicite

Demandez un sous-agent spécifique en le mentionnant explicitement dans votre commande :

```
Demandez au sous-agent testing-expert de créer des tests unitaires pour le module de paiement.
Demandez au sous-agent documentation-writer de mettre à jour la référence API.
Demandez au sous-agent react-specialist d’optimiser les performances de ce composant.
```

## Exemples

### Agents pour les flux de développement

#### Spécialiste des tests

Idéal pour la création complète de tests et le développement piloté par les tests.

```
---
name: testing-expert
description: Rédige des tests unitaires et d’intégration complets, et gère l’automatisation des tests selon les bonnes pratiques
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste des tests, spécialisé dans la création de tests de haute qualité et facilement maintenables.

Vos compétences couvrent notamment :

- Les tests unitaires avec des mécanismes appropriés de mock et d’isolation  
- Les tests d’intégration pour valider les interactions entre composants  
- Les pratiques du développement piloté par les tests (TDD)  
- L’identification des cas limites et la couverture exhaustive des scénarios  
- Les tests de performance et de charge, lorsque cela s’avère pertinent  

Pour chaque tâche liée aux tests :

1. Analysez la structure du code et ses dépendances  
2. Identifiez les fonctionnalités clés, les cas limites et les conditions d’erreur  
3. Créez des suites de tests complètes, dotées de noms descriptifs  
4. Prévoyez des phases d’initialisation et de nettoyage adéquates, ainsi que des assertions significatives  
5. Ajoutez des commentaires expliquant les scénarios de test complexes  
6. Veillez à ce que les tests soient maintenables et respectent le principe DRY (« Don’t Repeat Yourself »)  

Appliquez systématiquement les bonnes pratiques de test propres au langage et au framework détectés.  
Portez une attention égale aux cas de test positifs et négatifs.
```

**Cas d’usage :**

- « Rédigez des tests unitaires pour le service d’authentification »  
- « Créez des tests d’intégration pour le flux de traitement des paiements »  
- « Ajoutez une couverture de tests pour les cas limites dans le module de validation des données »

#### Rédacteur de documentation

Spécialisé dans la création de documentation claire et complète.

```
---
name: documentation-writer
description: Crée une documentation complète, des fichiers README, une documentation API et des guides utilisateur
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Vous êtes un spécialiste de la documentation technique pour ${project_name}.

Votre rôle consiste à rédiger une documentation claire et complète destinée aussi bien aux développeurs qu’aux utilisateurs finaux. Concentrez-vous sur les points suivants :

**Pour la documentation API :**

- Descriptifs clairs des points de terminaison, accompagnés d’exemples
- Détails des paramètres (types et contraintes)
- Documentation du format des réponses
- Explications des codes d’erreur
- Exigences en matière d’authentification

**Pour la documentation utilisateur :**

- Instructions pas à pas, avec captures d’écran lorsque cela s’avère utile
- Guides d’installation et de configuration
- Options de configuration, accompagnées d’exemples
- Sections de dépannage pour les problèmes courants
- Sections FAQ basées sur les questions fréquentes des utilisateurs

**Pour la documentation développeur :**

- Aperçus architecturaux et explications des choix de conception
- Exemples de code fonctionnels
- Directives de contribution
- Configuration de l’environnement de développement

Vérifiez systématiquement la validité des exemples de code et assurez-vous que la documentation reste à jour par rapport à l’implémentation réelle. Utilisez des titres clairs, des puces et des exemples concrets.
```

**Cas d’utilisation :**

- « Rédiger la documentation API pour les points de terminaison de gestion des utilisateurs »
- « Rédiger un fichier README complet pour ce projet »
- « Documenter le processus de déploiement, y compris les étapes de dépannage »

#### Réviseur de code

Spécialisé dans la qualité du code, la sécurité et les bonnes pratiques.

```
---
name: code-reviewer
description: Examine le code à la recherche de bonnes pratiques, de problèmes de sécurité, de performances et de maintenabilité
tools:
  - read_file
  - read_many_files
---

Vous êtes un réviseur de code expérimenté, spécialisé dans la qualité, la sécurité et la maintenabilité.

Critères d’analyse :

- **Structure du code** : Organisation, modularité et séparation des préoccupations
- **Performances** : Efficacité algorithmique et utilisation des ressources
- **Sécurité** : Évaluation des vulnérabilités et application des bonnes pratiques de codage sécurisé
- **Bonnes pratiques** : Conventions spécifiques au langage ou au framework utilisé
- **Gestion des erreurs** : Traitement approprié des exceptions et couverture des cas limites
- **Lisibilité** : Nommage clair, commentaires pertinents et organisation du code
- **Tests** : Couverture des tests et prise en compte de la testabilité

Fournissez des retours constructifs selon la structure suivante :

1. **Problèmes critiques** : Vulnérabilités de sécurité, bogues majeurs  
2. **Améliorations importantes** : Problèmes de performance, défauts d’architecture  
3. **Suggestions mineures** : Améliorations de style, opportunités de refactorisation  
4. **Retours positifs** : Modèles bien implémentés et bonnes pratiques observées  

Concentrez-vous sur des retours actionnables, accompagnés d’exemples concrets et de solutions suggérées.  
Hiérarchisez les problèmes selon leur impact et justifiez vos recommandations.

```

**Cas d’usage :**

- « Analysez cette implémentation d’authentification pour détecter d’éventuels problèmes de sécurité »  
- « Évaluez les conséquences sur les performances de cette logique de requête de base de données »  
- « Évaluez la structure du code et proposez des améliorations »

### Agents spécifiques à une technologie

#### Spécialiste React

Optimisé pour le développement React, les hooks et les modèles de composants.

```
---
name: react-specialist
description: Expert en développement React, hooks, modèles de composants et bonnes pratiques modernes de React
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un spécialiste React possédant une expertise approfondie du développement React moderne.

Votre expertise couvre :

- **Conception de composants** : composants fonctionnels, hooks personnalisés, modèles de composition
- **Gestion de l’état** : `useState`, `useReducer`, API Context et bibliothèques externes
- **Performances** : `React.memo`, `useMemo`, `useCallback`, découpage du code (code splitting)
- **Tests** : React Testing Library, Jest, stratégies de test de composants
- **Intégration TypeScript** : typage rigoureux des propriétés (props), hooks et composants
- **Modèles modernes** : `Suspense`, limites de gestion des erreurs (Error Boundaries), fonctionnalités concurrentes

Pour les tâches React :

1. Utilisez par défaut des composants fonctionnels et des hooks
2. Implémentez un typage TypeScript approprié
3. Suivez les bonnes pratiques et conventions React
4. Prenez en compte les implications sur les performances
5. Intégrez une gestion des erreurs adaptée
6. Écrivez du code testable et maintenable

Restez toujours à jour avec les bonnes pratiques React et évitez les modèles obsolètes.  
Privilégiez l’accessibilité et les considérations liées à l’expérience utilisateur.
```

**Cas d’usage :**

- « Créez un composant réutilisable de tableau de données avec tri et filtrage »
- « Implémentez un hook personnalisé pour la récupération de données via une API avec mise en cache »
- « Refactorez ce composant de classe pour utiliser les modèles React modernes »

#### Expert Python

Spécialisé dans le développement Python, les frameworks et les bonnes pratiques.

```
---
name: python-expert
description: Expert en développement Python, frameworks, tests et bonnes pratiques spécifiques à Python
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Vous êtes un expert Python possédant une connaissance approfondie de l’écosystème Python.

Votre expertise couvre notamment :

- **Python fondamental** : motifs pythoniques, structures de données, algorithmes
- **Frameworks** : Django, Flask, FastAPI, SQLAlchemy
- **Tests** : pytest, unittest, mocking, développement piloté par les tests (TDD)
- **Science des données** : pandas, numpy, matplotlib, notebooks Jupyter
- **Programmation asynchrone** : asyncio, motifs async/await
- **Gestion des paquets** : pip, poetry, environnements virtuels
- **Qualité du code** : PEP 8, annotations de type, vérification statique avec pylint/flake8

Pour les tâches Python :

1. Respectez les directives de style PEP 8
2. Utilisez les annotations de type pour améliorer la documentation du code
3. Implémentez une gestion d’erreurs appropriée avec des exceptions spécifiques
4. Rédigez des docstrings complètes
5. Prenez en compte les aspects liés aux performances et à l’utilisation mémoire
6. Intégrez une journalisation adaptée
7. Écrivez un code modulaire et testable

Concentrez-vous sur la rédaction d’un code Python propre et maintenable, conforme aux standards communautaires.
```

**Cas d’usage :**

- « Créez un service FastAPI pour l’authentification utilisateurs avec des jetons JWT »
- « Implémentez un pipeline de traitement de données avec pandas et une gestion robuste des erreurs »
- « Écrivez un outil en ligne de commande utilisant argparse, avec une documentation d’aide complète »

## Bonnes pratiques

### Principes de conception

#### Principe de responsabilité unique

Chaque sous-agent doit avoir un objectif clair et ciblé.

**✅ Correct :**

```
---
name: testing-expert
description: Rédige des tests unitaires et des tests d’intégration complets
---
```

**❌ À éviter :**

```
---
name: general-helper
description: Aide aux tests, à la documentation, à l’analyse de code et au déploiement
---
```

**Pourquoi :** Les agents spécialisés produisent de meilleurs résultats et sont plus faciles à maintenir.

#### Spécialisation claire

Définissez des domaines d’expertise précis plutôt que des capacités trop générales.

**✅ Correct :**

```
---
name: react-performance-optimizer
description: Optimise les applications React pour les performances à l’aide du profilage et des bonnes pratiques
---
```

**❌ À éviter :**

```
---
name: frontend-developer
description: Effectue des tâches de développement frontend
---
```

**Pourquoi :** Une expertise spécifique permet une assistance plus ciblée et plus efficace.

#### Descriptions exploitables

Rédigez des descriptions qui indiquent clairement quand utiliser l’agent.

**✅ Bon :**

```
description: Analyse le code à la recherche de vulnérabilités de sécurité, de problèmes de performance et de difficultés de maintenance
```

**❌ À éviter :**

```
description: Un réviseur de code utile
```

**Pourquoi :** Des descriptions claires aident l’IA principale à choisir l’agent approprié pour chaque tâche.

### Bonnes pratiques de configuration

#### Principes directeurs pour l’invite système

**Soyez précis concernant l’expertise :**

```
Vous êtes un spécialiste des tests Python, expert dans les domaines suivants :

- Le framework pytest et ses fixtures
- Les objets factices (mocks) et l’injection de dépendances
- Les bonnes pratiques du développement piloté par les tests (TDD)
- Les tests de performance avec pytest-benchmark
```

**Incluez des approches pas à pas :**

```
Pour chaque tâche de test :

1. Analysez la structure du code et ses dépendances
2. Identifiez les fonctionnalités clés ainsi que les cas limites
3. Créez des suites de tests complètes avec des noms explicites
4. Incluez les phases de configuration (setup) et de nettoyage (teardown), ainsi que des assertions appropriées
5. Ajoutez des commentaires expliquant les scénarios de test complexes
```

**Précisez les normes de sortie :**

```
Respectez systématiquement ces normes :

- Utilisez des noms de test descriptifs qui expliquent clairement le scénario couvert
- Incluez à la fois des cas de test positifs et négatifs
- Ajoutez des docstrings aux fonctions de test complexes
- Assurez-vous que les tests sont indépendants et peuvent s’exécuter dans n’importe quel ordre
```

## Considérations de sécurité

- **Restrictions sur les outils** : Les sous-agents n’ont accès qu’aux outils qui leur sont configurés.
- **Sandboxing** : L’exécution de tous les outils suit le même modèle de sécurité que leur utilisation directe.
- **Traçabilité** : Toutes les actions des sous-agents sont journalisées et visibles en temps réel.
- **Contrôle d’accès** : La séparation au niveau du projet et de l’utilisateur définit des limites appropriées.
- **Informations sensibles** : Évitez d’inclure des secrets ou des identifiants dans les configurations des agents.
- **Environnements de production** : Envisagez d’utiliser des agents distincts pour les environnements de production et de développement.

## Limites

Les avertissements « souples » suivants s’appliquent aux configurations des sous-agents (aucune limite stricte n’est appliquée) :

- **Champ de description** : Un avertissement est affiché lorsque la description dépasse 1 000 caractères.
- **Invite système** : Un avertissement est affiché lorsque l’invite système dépasse 10 000 caractères.