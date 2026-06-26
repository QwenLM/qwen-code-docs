# Outil Agent (`agent`)

Ce document décrit l'outil `agent` pour Qwen Code.

## Description

Utilisez `agent` pour lancer un sous-agent spécialisé qui gère de manière autonome des tâches complexes en plusieurs étapes. L'outil Agent délègue le travail à des agents spécialisés capables de travailler indépendamment avec leur propre ensemble d'outils, permettant l'exécution parallèle de tâches et une expertise spécialisée.

### Arguments

`agent` accepte les arguments suivants :

- `description` (string, obligatoire) : Une description courte (3 à 5 mots) de la tâche pour la visibilité et le suivi par l'utilisateur.
- `prompt` (string, obligatoire) : Le prompt détaillé de la tâche à exécuter par le sous-agent. Doit contenir des instructions complètes pour une exécution autonome.
- `subagent_type` (string, optionnel) : Le type d'agent spécialisé à utiliser pour cette tâche. Par défaut, `general-purpose` si omis.
- `run_in_background` (boolean, optionnel) : Défini sur `true` pour exécuter l'agent en arrière-plan. Vous serez notifié lorsqu'il aura terminé.
- `isolation` (string, optionnel) : Défini sur `"worktree"` pour exécuter l'agent dans un worktree git isolé.

## Comment utiliser `agent` avec Qwen Code

L'outil Agent charge dynamiquement les sous-agents disponibles depuis votre configuration et leur délègue des tâches. Chaque sous-agent s'exécute indépendamment et peut utiliser son propre ensemble d'outils, permettant une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l'outil Agent, le sous-agent va :

1. Recevoir le prompt de tâche avec une autonomie totale
2. Exécuter la tâche en utilisant ses outils disponibles
3. Renvoyer un message de résultat final
4. Se terminer (les sous-agents sont sans état et à usage unique)

Utilisation :

```
agent(description="Brève description de la tâche", prompt="Instructions détaillées de la tâche pour le sous-agent", subagent_type="agent_name")
```

## Sous-agents disponibles

Les sous-agents disponibles dépendent de votre configuration. Les types de sous-agents courants peuvent inclure :

- **general-purpose** : Pour les tâches complexes en plusieurs étapes nécessitant divers outils
- **code-reviewer** : Pour examiner et analyser la qualité du code
- **test-runner** : Pour exécuter les tests et analyser les résultats
- **documentation-writer** : Pour créer et mettre à jour la documentation

Vous pouvez voir les sous-agents disponibles en utilisant la commande `/agents` dans Qwen Code.

## Fonctionnalités de l'outil Agent

### Mises à jour en temps réel

L'outil Agent fournit des mises à jour en direct montrant :

- L'état d'exécution du sous-agent
- Les appels d'outils individuels effectués par le sous-agent
- Les résultats des appels d'outils et les éventuelles erreurs
- La progression globale de la tâche et l'état d'achèvement

### Exécution parallèle

Vous pouvez lancer plusieurs sous-agents simultanément en appelant l'outil Agent plusieurs fois dans un seul message, permettant une exécution parallèle des tâches et une meilleure efficacité.

### Expertise spécialisée

Chaque sous-agent peut être configuré avec :

- Des permissions d'accès aux outils spécifiques
- Des prompts système et instructions spécialisés
- Des configurations de modèle personnalisées
- Des connaissances et capacités propres à un domaine

## Exemples d'utilisation de `agent`

### Délégation à un agent généraliste

```
agent(
  description="Refactorisation du code",
  prompt="Veuillez refactoriser le module d'authentification dans src/auth/ pour utiliser les patterns modernes async/await au lieu des callbacks. Assurez-vous que tous les tests passent toujours et mettez à jour la documentation associée.",
  subagent_type="general-purpose"
)
```

### Exécution de tâches parallèles

```
# Lancez la revue de code et l'exécution des tests en parallèle
agent(
  description="Revue de code",
  prompt="Examinez les modifications récentes du module de gestion des utilisateurs pour la qualité du code, les problèmes de sécurité et la conformité aux bonnes pratiques.",
  subagent_type="general-purpose"
)

agent(
  description="Exécuter les tests",
  prompt="Exécutez la suite de tests complète et analysez les échecs éventuels. Fournissez un résumé de la couverture de test et des recommandations d'amélioration.",
  subagent_type="test-engineer"
)
```

### Génération de documentation

```
agent(
  description="Mise à jour de la documentation",
  prompt="Générez une documentation d'API complète pour les nouveaux points de terminaison REST implémentés dans le module des commandes. Incluez des exemples de requêtes/réponses et les codes d'erreur.",
  subagent_type="general-purpose"
)
```

## Quand utiliser l'outil Agent

Utilisez l'outil Agent lorsque :

1. **Tâches complexes en plusieurs étapes** - Tâches nécessitant plusieurs opérations pouvant être traitées de manière autonome
2. **Expertise spécialisée** - Tâches bénéficiant de connaissances ou d'outils spécifiques à un domaine
3. **Exécution parallèle** - Lorsque vous avez plusieurs tâches indépendantes pouvant être exécutées simultanément
4. **Besoins de délégation** - Lorsque vous souhaitez confier une tâche complète plutôt que de micro-gérer les étapes
5. **Opérations gourmandes en ressources** - Tâches pouvant prendre beaucoup de temps ou de ressources de calcul

## Quand NE PAS utiliser l'outil Agent

N'utilisez pas l'outil Agent pour :

- **Opérations simples en une seule étape** - Utilisez directement les outils comme Read, Edit, etc.
- **Tâches interactives** - Tâches nécessitant des échanges aller-retour
- **Lectures de fichiers spécifiques** - Utilisez l'outil Read directement pour de meilleures performances
- **Recherches simples** - Utilisez les outils Grep ou Glob directement

## Remarques importantes

- **Exécution sans état** : Chaque invocation de sous-agent est indépendante, sans mémoire des exécutions précédentes
- **Communication unique** : Les sous-agents fournissent un seul message de résultat final – pas de communication continue
- **Prompts complets** : Votre prompt doit contenir tout le contexte et les instructions nécessaires à une exécution autonome
- **Accès aux outils** : Les sous-agents n'ont accès qu'aux outils configurés dans leur propre configuration
- **Capacité de parallélisation** : Plusieurs sous-agents peuvent être exécutés simultanément pour une meilleure efficacité
- **Dépend de la configuration** : Les types de sous-agents disponibles dépendent de votre configuration système

## Configuration

Les sous-agents sont configurés via le système de configuration des agents de Qwen Code. Utilisez la commande `/agents` pour :

- Voir les sous-agents disponibles
- Créer de nouvelles configurations de sous-agents
- Modifier les paramètres des sous-agents existants
- Définir les permissions et capacités des outils

Pour plus d'informations sur la configuration des sous-agents, reportez-vous à la documentation des sous-agents.