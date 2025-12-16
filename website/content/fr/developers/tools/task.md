# Outil de Tâche (`task`)

Ce document décrit l'outil `task` pour Qwen Code.

## Description

Utilisez `task` pour lancer un sous-agent spécialisé afin de gérer automatiquement des tâches complexes et multi-étapes. L'outil Task délègue le travail à des agents spécialisés qui peuvent fonctionner indépendamment avec leur propre ensemble d'outils, permettant ainsi une exécution parallèle des tâches et une expertise spécialisée.

### Arguments

`task` prend les arguments suivants :

- `description` (chaîne de caractères, requis) : Une courte description (3 à 5 mots) de la tâche, destinée à la visibilité et au suivi par l'utilisateur.
- `prompt` (chaîne de caractères, requis) : L'invite détaillant la tâche que le sous-agent doit exécuter. Elle doit contenir des instructions complètes pour une exécution autonome.
- `subagent_type` (chaîne de caractères, requis) : Le type d'agent spécialisé à utiliser pour cette tâche. Il doit correspondre à l'un des sous-agents configurés disponibles.

## Comment utiliser `task` avec Qwen Code

L'outil Task charge dynamiquement les sous-agents disponibles à partir de votre configuration et leur délègue des tâches. Chaque sous-agent s'exécute indépendamment et peut utiliser son propre ensemble d'outils, permettant ainsi une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l'outil Task, le sous-agent va :

1. Recevoir l'invite de tâche avec une autonomie totale
2. Exécuter la tâche en utilisant ses outils disponibles
3. Retourner un message de résultat final
4. Se terminer (les sous-agents sont sans état et à usage unique)

Utilisation :

```
task(description="Brève description de la tâche", prompt="Instructions détaillées de la tâche pour le sous-agent", subagent_type="nom_de_l_agent")
```

## Sous-agents disponibles

Les sous-agents disponibles dépendent de votre configuration. Les types de sous-agents courants peuvent inclure :

- **general-purpose** : Pour les tâches complexes à plusieurs étapes nécessitant divers outils
- **code-reviewer** : Pour la révision et l'analyse de la qualité du code
- **test-runner** : Pour l'exécution des tests et l'analyse des résultats
- **documentation-writer** : Pour la création et la mise à jour de la documentation

Vous pouvez consulter les sous-agents disponibles en utilisant la commande `/agents` dans Qwen Code.

## Fonctionnalités de l'outil Tâche

### Mises à jour de progression en temps réel

L'outil Tâche fournit des mises à jour en direct affichant :

- L'état d'exécution du sous-agent
- Les appels d'outils individuels effectués par le sous-agent
- Les résultats des appels d'outils et les éventuelles erreurs
- L'état global de la tâche et son achèvement

### Exécution parallèle

Vous pouvez lancer plusieurs sous-agents simultanément en appelant l'outil Tâche plusieurs fois dans un seul message, permettant ainsi une exécution parallèle des tâches et une meilleure efficacité.

### Expertise spécialisée

Chaque sous-agent peut être configuré avec :

- Des autorisations d'accès spécifiques aux outils
- Des invites et instructions système spécialisées
- Des configurations de modèle personnalisées
- Des connaissances et capacités spécifiques au domaine

## Exemples de `task`

### Délégation à un agent généraliste

```
task(
  description="Refactorisation de code",
  prompt="Veuillez refactoriser le module d'authentification dans src/auth/ pour utiliser les modèles async/await modernes au lieu des callbacks. Assurez-vous que tous les tests passent toujours et mettez à jour toute documentation associée.",
  subagent_type="general-purpose"
)
```

### Exécution de tâches parallèles

```

# Lancer la revue de code et l'exécution des tests en parallèle
task(
  description="Revue de code",
  prompt="Examiner les modifications récentes dans le module de gestion des utilisateurs pour évaluer la qualité du code, les problèmes de sécurité et la conformité aux bonnes pratiques.",
  subagent_type="code-reviewer"
)

task(
  description="Exécuter les tests",
  prompt="Exécuter la suite complète de tests et analyser les éventuels échecs. Fournir un résumé de la couverture des tests et des recommandations pour améliorer celle-ci.",
  subagent_type="test-runner"
)
```

### Génération de documentation

```
task(
  description="Mettre à jour la documentation",
  prompt="Générer une documentation API complète pour les nouveaux points de terminaison REST implémentés dans le module des commandes. Inclure des exemples de requêtes/réponses ainsi que les codes d'erreur.",
  subagent_type="documentation-writer"
)
```

## Quand utiliser l'outil Task

Utilisez l'outil Task lorsque :

1. **Tâches complexes à plusieurs étapes** - Tâches nécessitant plusieurs opérations pouvant être gérées de manière autonome
2. **Expertise spécialisée** - Tâches bénéficiant de connaissances ou d'outils spécifiques à un domaine
3. **Exécution parallèle** - Lorsque vous avez plusieurs tâches indépendantes pouvant s'exécuter simultanément
4. **Besoins de délégation** - Lorsque vous souhaitez confier une tâche complète plutôt que de gérer chaque étape en détail
5. **Opérations intensives en ressources** - Tâches qui peuvent prendre beaucoup de temps ou de ressources computationnelles

## Quand NE PAS utiliser l'outil Task

N'utilisez pas l'outil Task pour :

- **Opérations simples à une seule étape** - Utilisez des outils directs comme Read, Edit, etc.
- **Tâches interactives** - Tâches nécessitant une communication aller-retour
- **Lectures spécifiques de fichiers** - Utilisez l'outil Read directement pour de meilleures performances
- **Recherches simples** - Utilisez les outils Grep ou Glob directement

## Notes importantes

- **Exécution sans état** : Chaque invocation de sous-agent est indépendante et ne conserve aucun souvenir des exécutions précédentes
- **Communication unique** : Les sous-agents fournissent un seul message de résultat final – aucune communication continue
- **Instructions complètes** : Votre prompt doit contenir tout le contexte et toutes les instructions nécessaires pour une exécution autonome
- **Accès aux outils** : Les sous-agents n'ont accès qu'aux outils configurés dans leur configuration spécifique
- **Capacité parallèle** : Plusieurs sous-agents peuvent s'exécuter simultanément pour améliorer l'efficacité
- **Dépendance à la configuration** : Les types de sous-agents disponibles dépendent de la configuration de votre système

## Configuration

Les sous-agents sont configurés via le système de configuration d'agents de Qwen Code. Utilisez la commande `/agents` pour :

- Afficher les sous-agents disponibles
- Créer de nouvelles configurations de sous-agents
- Modifier les paramètres existants des sous-agents
- Définir les autorisations et capacités des outils

Pour plus d'informations sur la configuration des sous-agents, consultez la documentation des sous-agents.