# Outil Agent (`agent`)

Ce document décrit l'outil `agent` pour Qwen Code.

## Description

Utilisez `agent` pour lancer un sous-agent spécialisé qui gère de manière autonome des tâches complexes en plusieurs étapes. L'outil Agent délègue le travail à des agents spécialisés capables de travailler indépendamment avec leur propre ensemble d'outils, permettant l'exécution parallèle de tâches et une expertise spécialisée.

### Arguments

`agent` accepte les arguments suivants :

- `description` (string, obligatoire) : Une description courte (3 à 5 mots) de la tâche pour la visibilité et le suivi par l'utilisateur.
- `prompt` (string, obligatoire) : Le prompt détaillé de la tâche à exécuter par le sous-agent. Doit contenir des instructions complètes pour une exécution autonome.
- `subagent_type` (string, optionnel) : Le type d'agent spécialisé à utiliser pour cette tâche. Par défaut, `general-purpose` si omis.
- `fork_turns` (string, optionnel) : Valide uniquement avec `subagent_type="fork"`. Omettez-le ou utilisez `all` pour la conversation parent complète, ou utilisez une chaîne d'entier positif comme `"3"` pour les trois derniers tours utilisateur réels. Les réponses d'outils et les rappels système purs ne comptent pas comme des tours.
- `fork_tools` (tableau de strings, optionnel) : Valide uniquement avec `subagent_type="fork"`. Restreint l'exécution à des noms d'outils canoniques exacts ou des motifs de serveur MCP tout en gardant les déclarations d'outils visibles par le modèle du fork inchangées pour le partage du cache de prompts. Les entrées ne peuvent pas avoir d'espaces autour ; les wildcards sont limitées à `mcp__*` ou un motif de préfixe d'outil MCP tel que `mcp__github__read_*`. Les forks n'exécutent jamais `ask_user_question` ; omettez `fork_tools` pour autoriser tout autre outil hérité, ou utilisez un tableau vide pour rejeter tout appel d'outil.
- `fork_profile` (string, optionnel) : Valide uniquement avec `subagent_type="fork"`. Charge un fichier frontmatter-only `.qwen/fork-profiles/<name>.md` régulier d'au plus 64 KiB depuis la racine du projet actif et applique son tableau `tools` requis plus un `promptHint` optionnel d'au plus 200 caractères. Le fichier ne peut pas résoudre en dehors du répertoire de profils du projet. `fork_profile` ne peut pas être combiné avec `fork_tools` ou un teammate nommé, et il est indisponible en mode safe ou bare.
- `run_in_background` (boolean, optionnel) : Par défaut `true` pour les agents réguliers de niveau supérieur. Définissez sur `false` pour attendre le résultat d'un agent régulier en ligne. Les forks headless s'exécutent toujours en arrière-plan. Les agents imbriqués s'exécutent au premier plan sauf si `run_in_background` est explicitement `true`, ce qui est rejeté car les agents imbriqués ne peuvent pas recevoir de notifications de complétion en arrière-plan. Les lancements `working_dir` appartenant à l'appelant s'exécutent au premier plan et rejettent l'exécution en arrière-plan explicite ou configurée.
- `isolation` (string, optionnel) : Défini sur `"worktree"` pour exécuter un agent nommé explicitement, non-fork, dans un worktree git isolé que Qwen Code crée et gère.
- `working_dir` (string, optionnel) : Épingle un agent nommé explicitement, non-fork, à un worktree git enregistré existant dans le dépôt actuel. L'appelant possède le cycle de vie du worktree, donc ce mode s'exécute au premier plan. Si `working_dir` et `isolation` sont tous deux fournis, `working_dir` est prioritaire.

## Comment utiliser `agent` avec Qwen Code

L'outil Agent charge dynamiquement les sous-agents disponibles depuis votre configuration et leur délègue des tâches. Chaque sous-agent s'exécute indépendamment et peut utiliser son propre ensemble d'outils, permettant une expertise spécialisée et une exécution parallèle.

Lorsque vous utilisez l'outil Agent, le sous-agent va :

1. Recevoir le prompt de tâche et, pour un fork, le contexte de conversation parent sélectionné
2. Exécuter la tâche en utilisant ses outils disponibles
3. Signaler une notification de complétion par défaut, ou renvoyer un message de résultat final lorsqu'un agent régulier s'exécute au premier plan
4. Rester adressable après une exécution en arrière-plan lorsque son état retenu permet la continuation

Utilisation :

```
agent(description="Brève description de la tâche", prompt="Instructions détaillées de la tâche pour le sous-agent", subagent_type="agent_name")
agent(description="Brève description de la tâche", prompt="Instructions détaillées de la tâche pour le fork", subagent_type="fork", fork_turns="3")
agent(description="Investigation en lecture seule", prompt="Inspecter l'implémentation", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Investigation profilée", prompt="Inspecter l'implémentation", subagent_type="fork", fork_profile="ro-research")
```

Définissez `run_in_background=false` lorsque le tour actuel doit utiliser le résultat du sous-agent avant de continuer.

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

### Continuation d'agent en arrière-plan

Les agents en arrière-plan peuvent recevoir du travail de suivi après leur complétion initiale :

1. Appelez `list_agents` pour découvrir les agents en arrière-plan adressables de la session actuelle et leurs valeurs `task_id`. Cela inclut les agents compatibles restaurés après la reprise de la session parent.
2. Appelez `send_message` avec un `task_id` et une instruction de suivi. Les agents en cours d'exécution reçoivent le message à la prochaine limite de tour d'outils, les agents en pause reprennent avec celui-ci, et les agents terminés continuent sur un runtime résident lorsque disponible ou reprennent depuis leur transcription retenue.
3. Attendez la prochaine notification de complétion avant d'utiliser le résultat de suivi.

Si un agent ne peut pas être continué, `list_agents` retourne un `resume_blocked_reason`. Traitez la sortie des agents restaurés ou continués comme une preuve et vérifiez-la avant d'intégrer les modifications.

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

- **Contexte indépendant** : Les sous-agents réguliers démarrent sans l'historique de conversation parent. Les forks héritent de la conversation complète par défaut et acceptent `fork_turns` lorsqu'une fenêtre récente bornée est suffisante.
- **Interaction sous-agent** : Les sous-agents réguliers ne reçoivent pas `ask_user_question`. Les forks gardent la liste de déclarations du parent pour le partage du cache mais rejettent cet outil avant la planification ou l'approbation ; lorsque l'absence d'entrée utilisateur bloque le travail, le sous-agent signale le bloqueur à son parent.
- **Restrictions d'exécution de fork** : `fork_tools` réduit davantage les outils déjà déclarés qu'un fork peut exécuter. Les appels non autorisés retournent une erreur avant la planification ou l'approbation ; la même liste de déclarations reste visible par le modèle pour le partage du cache. Il s'agit d'une restriction par appel choisie par l'appelant, pas d'une sandbox imposée par l'administrateur.
- **Profils de fork** : Un profil de projet sous `.qwen/fork-profiles/` réutilise la même gate d'exécution que `fork_tools`. Il est résolu une fois avant le lancement ; la liste résolue est persistée pour la reprise, et un `promptHint` optionnel est ajouté uniquement à la directive de tâche.
- **Livraison des résultats** : Les résultats en arrière-plan arrivent via des notifications de complétion dans un tour ultérieur. Ne supposez pas un résultat avant l'arrivée de la notification.
- **Continuation** : Utilisez `list_agents` et `send_message` pour le travail de suivi connexe au lieu de lancer un agent dupliqué. La continuation dépend d'un état retenu compatible et peut être indisponible.
- **Prompts complets** : Votre prompt initial doit contenir tout le contexte et les instructions nécessaires à une exécution autonome. Un sous-agent régulier ne voit pas la conversation parent.
- **Accès aux outils** : Les sous-agents n'ont accès qu'aux outils configurés dans leur configuration spécifique
- **Capacité de parallélisation** : Plusieurs sous-agents peuvent s'exécuter simultanément pour une meilleure efficacité
- **Dépend de la configuration** : Les types de sous-agents disponibles dépendent de votre configuration système

## Configuration

Les sous-agents sont configurés via le système de configuration des agents de Qwen Code. Utilisez la commande `/agents` pour :

- Voir les sous-agents disponibles
- Créer de nouvelles configurations de sous-agents
- Modifier les paramètres des sous-agents existants
- Définir les permissions et capacités des outils

Pour plus d'informations sur la configuration des sous-agents, reportez-vous à la documentation des sous-agents.