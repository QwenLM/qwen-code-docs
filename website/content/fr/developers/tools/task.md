# Outil de tâche (`task`)

Ce document décrit l’outil `task` pour Qwen Code.

## Description

Utilisez `task` pour lancer un sous-agent spécialisé chargé de traiter de manière autonome des tâches complexes et comportant plusieurs étapes. L’outil de tâche délègue le travail à des agents spécialisés capables de fonctionner de façon indépendante, avec accès à leur propre jeu d’outils, ce qui permet une exécution parallèle des tâches et une expertise spécialisée.

### Arguments

`task` accepte les arguments suivants :

- `description` (chaîne de caractères, obligatoire) : Une brève description de la tâche (3 à 5 mots), destinée à la visibilité utilisateur et au suivi.
- `prompt` (chaîne de caractères, obligatoire) : Le prompt détaillé de la tâche, destiné à l’exécution par le sous-agent. Doit contenir des instructions complètes permettant une exécution autonome.
- `subagent_type` (chaîne de caractères, obligatoire) : Le type d’agent spécialisé à utiliser pour cette tâche. Doit correspondre à l’un des sous-agents configurés disponibles.

## Comment utiliser `task` avec Qwen Code

L’outil Task charge dynamiquement les sous-agents disponibles à partir de votre configuration et leur délègue des tâches. Chaque sous-agent s’exécute de façon indépendante et peut utiliser son propre ensemble d’outils, ce qui permet une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l’outil Task, le sous-agent :

1. Reçoit l’instruction de la tâche avec une autonomie complète  
2. Exécute la tâche à l’aide des outils dont il dispose  
3. Renvoie un message contenant le résultat final  
4. Se termine (les sous-agents sont sans état et utilisés une seule fois)

Utilisation :

```
task(description="Brève description de la tâche", prompt="Instructions détaillées de la tâche destinées au sous-agent", subagent_type="nom_du_sous_agent")
```

## Sous-agents disponibles

Les sous-agents disponibles dépendent de votre configuration. Les types de sous-agents courants peuvent inclure :

- **à usage général** : pour les tâches complexes en plusieurs étapes nécessitant divers outils  
- **réviseur de code** : pour examiner et analyser la qualité du code  
- **exécuteur de tests** : pour exécuter des tests et analyser leurs résultats  
- **rédacteur de documentation** : pour créer et mettre à jour la documentation  

Vous pouvez consulter la liste des sous-agents disponibles en utilisant la commande `/agents` dans Qwen Code.

## Fonctionnalités de l’outil Tâche

### Mises à jour en temps réel de la progression

L’outil Tâche fournit des mises à jour en direct indiquant :

- L’état d’exécution des sous-agents  
- Les appels d’outils individuels effectués par le sous-agent  
- Les résultats des appels d’outils ainsi que toute erreur éventuelle  
- La progression globale de la tâche et son statut d’achèvement  

### Exécution parallèle

Vous pouvez lancer plusieurs sous-agents simultanément en appelant l’outil Tâche plusieurs fois dans un seul message, ce qui permet une exécution parallèle des tâches et améliore l’efficacité.

### Expertise spécialisée

Chaque sous-agent peut être configuré avec les éléments suivants :

- Des autorisations d’accès spécifiques aux outils
- Des invites système et des instructions spécialisées
- Des configurations de modèle personnalisées
- Des connaissances et des fonctionnalités propres à un domaine donné

## Exemples de `task`

### Délégation à un agent généraliste

```
task(
  description="Refactoring du code",
  prompt="Veuillez refactoriser le module d’authentification situé dans `src/auth/` afin d’utiliser les motifs modernes `async`/`await` au lieu des fonctions de rappel (callbacks). Assurez-vous que tous les tests passent toujours et mettez à jour toute documentation associée.",
  subagent_type="general-purpose"
)
```

### Exécution de tâches en parallèle

```

# Lancer l’analyse de code et l’exécution des tests en parallèle
task(
  description="Analyse de code",
  prompt="Examiner les modifications récentes apportées au module de gestion des utilisateurs afin d’évaluer la qualité du code, détecter les problèmes de sécurité et vérifier le respect des bonnes pratiques.",
  subagent_type="code-reviewer"
)

task(
  description="Exécuter les tests",
  prompt="Lancer l’ensemble complet des tests et analyser les échecs éventuels. Fournir un résumé de la couverture des tests ainsi que des recommandations pour son amélioration.",
  subagent_type="test-runner"
)
```

### Génération de la documentation

```
task(
  description="Mettre à jour la documentation",
  prompt="Générer une documentation API complète pour les nouvelles ressources REST implémentées dans le module des commandes. Inclure des exemples de requêtes/réponses ainsi que les codes d’erreur.",
  subagent_type="documentation-writer"
)
```

## Quand utiliser l’outil Task

Utilisez l’outil Task dans les cas suivants :

1. **Tâches complexes en plusieurs étapes** — Tâches nécessitant plusieurs opérations pouvant être exécutées de façon autonome  
2. **Expertise spécialisée** — Tâches bénéficiant de connaissances ou d’outils spécifiques à un domaine  
3. **Exécution parallèle** — Lorsque vous disposez de plusieurs tâches indépendantes pouvant s’exécuter simultanément  
4. **Nécessité de délégation** — Lorsque vous souhaitez confier une tâche complète plutôt que de superviser chaque étape individuellement  
5. **Opérations gourmandes en ressources** — Tâches susceptibles de prendre beaucoup de temps ou de consommer des ressources computationnelles importantes  

## Quand NE PAS utiliser l’outil Task

N’utilisez pas l’outil Task pour :

- **Opérations simples en une seule étape** — Utilisez plutôt des outils directs comme Read, Edit, etc.  
- **Tâches interactives** — Tâches nécessitant une communication itérative aller-retour  
- **Lecture de fichiers spécifiques** — Utilisez directement l’outil Read pour de meilleures performances  
- **Recherches simples** — Utilisez directement les outils Grep ou Glob

## Remarques importantes

- **Exécution sans état** : Chaque invocation d’un sous-agent est indépendante et ne conserve aucune mémoire des exécutions précédentes.  
- **Communication unique** : Les sous-agents fournissent un seul message final contenant le résultat — aucune communication continue n’est possible.  
- **Instructions complètes** : Votre prompt doit contenir tout le contexte et toutes les instructions nécessaires à une exécution autonome.  
- **Accès aux outils** : Les sous-agents n’ont accès qu’aux outils configurés spécifiquement pour eux.  
- **Capacité parallèle** : Plusieurs sous-agents peuvent s’exécuter simultanément afin d’améliorer l’efficacité.  
- **Configuration déterminante** : Les types de sous-agents disponibles dépendent de la configuration de votre système.

## Configuration

Les sous-agents sont configurés via le système de configuration des agents de Qwen Code. Utilisez la commande `/agents` pour :

- Afficher les sous-agents disponibles ;  
- Créer de nouvelles configurations de sous-agents ;  
- Modifier les paramètres existants des sous-agents ;  
- Définir les autorisations et les fonctionnalités liées aux outils.

Pour plus d’informations sur la configuration des sous-agents, consultez la documentation dédiée.