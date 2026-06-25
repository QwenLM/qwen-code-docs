# Outil Agent (`agent`)

Ce document décrit l'outil `agent` pour Qwen Code.

## Description

Utilisez `agent` pour lancer un sous-agent spécialisé capable de gérer de manière autonome des tâches complexes et multi-étapes. L'outil Agent délègue le travail à des agents spécialisés qui peuvent travailler indépendamment avec accès à leur propre ensemble d'outils, permettant une exécution parallèle des tâches et une expertise spécialisée.

### Arguments

`agent` accepte les arguments suivants :

- `description` (chaîne, obligatoire) : Une courte description (3 à 5 mots) de la tâche pour la visibilité et le suivi par l'utilisateur.
- `prompt` (chaîne, obligatoire) : Le prompt détaillé de la tâche que le sous-agent doit exécuter. Doit contenir des instructions complètes pour une exécution autonome.
- `subagent_type` (chaîne, optionnel) : Le type d'agent spécialisé à utiliser pour cette tâche. Par défaut, `general-purpose` si omis.
- `run_in_background` (booléen, optionnel) : Définir sur `true` pour exécuter l'agent en arrière-plan. Vous serez averti lorsqu'il se termine.
- `isolation` (chaîne, optionnel) : Définir sur `"worktree"` pour exécuter l'agent dans un worktree git isolé.

## Comment utiliser `agent` avec Qwen Code

L'outil Agent charge dynamiquement les sous-agents disponibles depuis votre configuration et leur délègue des tâches. Chaque sous-agent s'exécute indépendamment et peut utiliser son propre ensemble d'outils, permettant une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l'outil Agent, le sous-agent va :

1. Recevoir le prompt de la tâche en toute autonomie
2. Exécuter la tâche en utilisant ses outils disponibles
3. Renvoyer un message de résultat final
4. Se terminer (les sous-agents sont sans état et à usage unique)

Utilisation :

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## Sous-agents disponibles

Les sous-agents disponibles dépendent de votre configuration. Les types de sous-agents courants peuvent inclure :

- **general-purpose** : Pour les tâches complexes multi-étapes nécessitant divers outils
- **code-reviewer** : Pour la révision et l'analyse de la qualité du code
- **test-runner** : Pour exécuter des tests et analyser les résultats
- **documentation-writer** : Pour créer et mettre à jour la documentation

Vous pouvez consulter les sous-agents disponibles en utilisant la commande `/agents` dans Qwen Code.

## Fonctionnalités de l'outil Agent

### Mises à jour de progression en temps réel

L'outil Agent fournit des mises à jour en direct montrant :

- L'état d'exécution du sous-agent
- Les appels d'outils individuels effectués par le sous-agent
- Les résultats des appels d'outils et les éventuelles erreurs
- La progression globale de la tâche et son état d'achèvement

### Exécution parallèle

Vous pouvez lancer plusieurs sous-agents simultanément en appelant l'outil Agent plusieurs fois dans un seul message, permettant une exécution parallèle des tâches et une efficacité améliorée.

### Expertise spécialisée

Chaque sous-agent peut être configuré avec :

- Des permissions d'accès spécifiques aux outils
- Des invites système spécialisées et des instructions
- Des configurations de modèle personnalisées
- Des connaissances et capacités spécifiques au domaine

## Exemples d'utilisation de `agent`

### Délégation à un agent généraliste

```
agent(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### Exécution de tâches parallèles

```
# Launch code review and test execution in parallel
agent(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="general-purpose"
)

agent(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-engineer"
)
```

### Génération de documentation

```
agent(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="general-purpose"
)
```

## Quand utiliser l'outil Agent

Utilisez l'outil Agent lorsque :

1. **Tâches complexes multi-étapes** - Tâches nécessitant plusieurs opérations pouvant être gérées de manière autonome
2. **Expertise spécialisée** - Tâches qui bénéficient de connaissances ou d'outils spécifiques au domaine
3. **Exécution parallèle** - Lorsque vous avez plusieurs tâches indépendantes pouvant s'exécuter simultanément
4. **Besoins de délégation** - Lorsque vous souhaitez confier une tâche complète plutôt que de microgérer les étapes
5. **Opérations gourmandes en ressources** - Tâches pouvant prendre beaucoup de temps ou de ressources de calcul

## Quand NE PAS utiliser l'outil Agent

N'utilisez pas l'outil Agent pour :

- **Opérations simples en une seule étape** - Utilisez des outils directs comme Read, Edit, etc.
- **Tâches interactives** - Tâches nécessitant une communication aller-retour
- **Lectures de fichiers spécifiques** - Utilisez l'outil Read directement pour de meilleures performances
- **Recherches simples** - Utilisez les outils Grep ou Glob directement

## Remarques importantes

- **Exécution sans état** : Chaque invocation de sous-agent est indépendante, sans mémoire des exécutions précédentes
- **Communication unique** : Les sous-agents fournissent un seul message de résultat final - pas de communication continue
- **Invites complètes** : Votre prompt doit contenir tout le contexte et les instructions nécessaires pour une exécution autonome
- **Accès aux outils** : Les sous-agents ont uniquement accès aux outils configurés dans leur configuration spécifique
- **Capacité parallèle** : Plusieurs sous-agents peuvent s'exécuter simultanément pour une efficacité améliorée
- **Dépendant de la configuration** : Les types de sous-agents disponibles dépendent de votre configuration système
## Configuration

Les sous-agents sont configurés via le système de configuration d’agents de Qwen Code. Utilisez la commande `/agents` pour :

- Consulter les sous-agents disponibles
- Créer de nouvelles configurations de sous-agents
- Modifier les paramètres des sous-agents existants
- Définir les permissions et capacités des outils

Pour plus d’informations sur la configuration des sous-agents, reportez-vous à la documentation dédiée.
