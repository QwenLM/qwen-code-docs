# Outil Task (`task`)

Ce document décrit l'outil `task` pour Qwen Code.

## Description

Utilisez `task` pour lancer un sous-agent spécialisé afin de gérer de manière autonome des tâches complexes en plusieurs étapes. L'outil Task délègue le travail à des agents spécialisés capables de travailler indépendamment avec leur propre ensemble d'outils, permettant ainsi une exécution parallèle des tâches et une expertise ciblée.

### Arguments

`task` accepte les arguments suivants :

- `description` (string, obligatoire) : Une brève description (3 à 5 mots) de la tâche, destinée à la visibilité et au suivi par l'utilisateur.
- `prompt` (string, obligatoire) : Le prompt détaillé de la tâche à exécuter par le sous-agent. Il doit contenir des instructions complètes pour une exécution autonome.
- `subagent_type` (string, obligatoire) : Le type d'agent spécialisé à utiliser pour cette tâche. Doit correspondre à l'un des sous-agents configurés et disponibles.

## Comment utiliser `task` avec Qwen Code

L'outil Task charge dynamiquement les sous-agents disponibles depuis votre configuration et leur délègue les tâches. Chaque sous-agent s'exécute de manière indépendante et peut utiliser son propre ensemble d'outils, ce qui permet une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l'outil Task, le sous-agent va :

1. Recevoir le prompt de la tâche en toute autonomie
2. Exécuter la tâche à l'aide de ses outils disponibles
3. Retourner un message de résultat final
4. Se terminer (les sous-agents sont sans état et à usage unique)

Utilisation :

```
task(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## Sous-agents disponibles

Les sous-agents disponibles dépendent de votre configuration. Les types courants peuvent inclure :

- **general-purpose** : Pour les tâches complexes en plusieurs étapes nécessitant divers outils
- **code-reviewer** : Pour examiner et analyser la qualité du code
- **test-runner** : Pour exécuter des tests et analyser les résultats
- **documentation-writer** : Pour créer et mettre à jour la documentation

Vous pouvez consulter les sous-agents disponibles en utilisant la commande `/agents` dans Qwen Code.

## Fonctionnalités de l'outil Task

### Mises à jour de la progression en temps réel

L'outil Task fournit des mises à jour en direct affichant :

- L'état d'exécution du sous-agent
- Les appels d'outils individuels effectués par le sous-agent
- Les résultats des appels d'outils et les éventuelles erreurs
- La progression globale de la tâche et son état d'achèvement

### Exécution parallèle

Vous pouvez lancer plusieurs sous-agents simultanément en appelant l'outil Task plusieurs fois dans un seul message, ce qui permet une exécution parallèle des tâches et une meilleure efficacité.

### Expertise spécialisée

Chaque sous-agent peut être configuré avec :

- Des autorisations d'accès spécifiques aux outils
- Des prompts système et des instructions spécialisés
- Des configurations de modèles personnalisées
- Des connaissances et des capacités spécifiques à un domaine

## Exemples d'utilisation de `task`

### Délégation à un agent `general-purpose`

```
task(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### Exécution de tâches parallèles

```
# Launch code review and test execution in parallel
task(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="code-reviewer"
)

task(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-runner"
)
```

### Génération de documentation

```
task(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="documentation-writer"
)
```

## Quand utiliser l'outil Task

Utilisez l'outil Task lorsque :

1. **Tâches complexes en plusieurs étapes** - Tâches nécessitant plusieurs opérations pouvant être gérées de manière autonome
2. **Expertise spécialisée** - Tâches tirant parti de connaissances ou d'outils spécifiques à un domaine
3. **Exécution parallèle** - Lorsque vous disposez de plusieurs tâches indépendantes pouvant s'exécuter simultanément
4. **Besoins de délégation** - Lorsque vous souhaitez confier une tâche complète plutôt que de micro-gérer les étapes
5. **Opérations gourmandes en ressources** - Tâches susceptibles de prendre beaucoup de temps ou de ressources de calcul

## Quand NE PAS utiliser l'outil Task

N'utilisez pas l'outil Task pour :

- **Opérations simples en une seule étape** - Utilisez des outils directs comme Read, Edit, etc.
- **Tâches interactives** - Tâches nécessitant des échanges interactifs
- **Lecture de fichiers spécifiques** - Utilisez directement l'outil Read pour de meilleures performances
- **Recherches simples** - Utilisez directement les outils Grep ou Glob

## Notes importantes

- **Exécution sans état** : Chaque invocation de sous-agent est indépendante et ne conserve aucune mémoire des exécutions précédentes
- **Communication unique** : Les sous-agents fournissent un seul message de résultat final, sans communication continue
- **Prompts complets** : Votre prompt doit contenir tout le contexte et les instructions nécessaires pour une exécution autonome
- **Accès aux outils** : Les sous-agents n'ont accès qu'aux outils configurés dans leur configuration spécifique
- **Capacité parallèle** : Plusieurs sous-agents peuvent s'exécuter simultanément pour améliorer l'efficacité
- **Dépendance à la configuration** : Les types de sous-agents disponibles dépendent de la configuration de votre système

## Configuration

Les sous-agents sont configurés via le système de configuration des agents de Qwen Code. Utilisez la commande `/agents` pour :

- Consulter les sous-agents disponibles
- Créer de nouvelles configurations de sous-agents
- Modifier les paramètres des sous-agents existants
- Définir les autorisations et les capacités des outils

Pour plus d'informations sur la configuration des sous-agents, consultez la documentation sur les sous-agents.