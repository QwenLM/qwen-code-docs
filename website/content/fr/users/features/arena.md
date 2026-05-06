# Agent Arena

> Exécutez plusieurs modèles d'IA simultanément pour accomplir la même tâche, comparez leurs solutions côte à côte et sélectionnez le meilleur résultat à appliquer à votre espace de travail.

> [!warning]
> Agent Arena est expérimental. Il présente des [limitations connues](#limitations) concernant les modes d'affichage et la gestion des sessions.

Agent Arena vous permet de confronter plusieurs modèles d'IA sur une même tâche. Chaque modèle s'exécute en tant qu'agent entièrement indépendant dans son propre Git worktree isolé, ce qui évite toute interférence lors des opérations sur les fichiers. Une fois tous les agents terminés, vous comparez les résultats et sélectionnez un gagnant à fusionner dans votre espace de travail principal.

Contrairement aux [sous-agents](/users/features/sub-agents), qui délèguent des sous-tâches ciblées au sein d'une seule session, les agents Arena sont des instances d'agents complètes et de premier niveau — chacun disposant de son propre modèle, de sa propre fenêtre de contexte et d'un accès complet aux outils.

Cette page couvre :

- [Quand utiliser Agent Arena](#when-to-use-agent-arena)
- [Démarrer une session arena](#start-an-arena-session)
- [Interagir avec les agents](#interact-with-agents), y compris les modes d'affichage et la navigation
- [Comparer les résultats et sélectionner un gagnant](#compare-results-and-select-a-winner)
- [Bonnes pratiques](#best-practices)

## Quand utiliser Agent Arena

Agent Arena est particulièrement efficace lorsque vous souhaitez **évaluer ou comparer** la manière dont différents modèles abordent un même problème. Les cas d'utilisation les plus pertinents sont :

- **Benchmark de modèles** : Évaluez les capacités de différents modèles sur des tâches réelles dans votre base de code, et non sur des benchmarks synthétiques
- **Sélection Best-of-N** : Obtenez plusieurs solutions indépendantes et choisissez la meilleure implémentation
- **Exploration d'approches** : Observez comment différents modèles raisonnent et résolvent le même problème — utile pour l'apprentissage et l'analyse
- **Réduction des risques** : Pour les modifications critiques, validez que plusieurs modèles convergent vers une approche similaire avant de valider

Agent Arena consomme nettement plus de tokens qu'une session unique (chaque agent possède sa propre fenêtre de contexte et effectue ses propres appels de modèle). Il est optimal lorsque la valeur de la comparaison justifie le coût. Pour les tâches courantes où vous faites confiance à votre modèle par défaut, une session unique est plus efficace.

## Démarrer une session arena

Utilisez la commande slash `/arena` pour lancer une session. Spécifiez les modèles que vous souhaitez faire concourir ainsi que la tâche :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactor the authentication module to use JWT tokens"
```

Si vous omettez `--models`, une boîte de dialogue interactive de sélection de modèle s'affiche, vous permettant de choisir parmi vos fournisseurs configurés.

### Ce qui se passe au démarrage

1. **Configuration des worktrees** : Qwen Code crée des Git worktrees isolés pour chaque agent dans `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Chaque worktree reflète exactement l'état actuel de votre répertoire de travail — y compris les modifications indexées, non indexées et les fichiers non suivis.
2. **Lancement des agents** : Chaque agent démarre dans son propre worktree avec un accès complet aux outils et son modèle configuré. Les agents sont lancés séquentiellement mais s'exécutent en parallèle.
3. **Exécution** : Tous les agents travaillent sur la tâche de manière indépendante, sans état partagé ni communication. Vous pouvez suivre leur progression et interagir avec chacun d'eux.
4. **Fin d'exécution** : Une fois tous les agents terminés (ou en échec), vous passez à la phase de comparaison des résultats.

## Interagir avec les agents

### Modes d'affichage

Agent Arena prend actuellement en charge le **mode in-process**, où tous les agents s'exécutent de manière asynchrone au sein du même processus terminal. Une barre d'onglets en bas du terminal vous permet de basculer entre les agents.

> [!note]
> **Les modes d'affichage en panneaux divisés sont prévus pour le futur.** Nous prévoyons de prendre en charge les dispositions en panneaux divisés basées sur tmux et iTerm2, où chaque agent dispose de son propre panneau terminal pour un affichage côte à côte réel. Actuellement, seul le basculement d'onglets in-process est disponible.

### Naviguer entre les agents

En mode in-process, utilisez les raccourcis clavier pour basculer entre les vues des agents :

| Raccourci | Action                            |
| :------- | :-------------------------------- |
| `Right`  | Basculer vers l'onglet de l'agent suivant      |
| `Left`   | Basculer vers l'onglet de l'agent précédent  |
| `Up`     | Donner le focus à la zone de saisie     |
| `Down`   | Donner le focus à la barre d'onglets des agents |

La barre d'onglets affiche l'état actuel de chaque agent :

| Indicateur | Signification                |
| :-------- | :--------------------- |
| `●`       | En cours d'exécution ou inactif        |
| `✓`       | Terminé avec succès |
| `✗`       | Échoué                 |
| `○`       | Annulé              |

### Interagir avec des agents individuels

Lorsque vous consultez l'onglet d'un agent, vous pouvez :

- **Envoyer des messages** — tapez dans la zone de saisie pour donner des instructions supplémentaires à l'agent
- **Approuver les appels d'outils** — si un agent demande une approbation d'outil, la boîte de dialogue de confirmation s'affiche dans son onglet
- **Afficher l'historique complet** — faites défiler la conversation complète de l'agent, y compris les sorties du modèle, les appels d'outils et les résultats

Chaque agent constitue une session complète et indépendante. Tout ce que vous pouvez faire avec l'agent principal, vous pouvez le faire avec un agent arena.

## Comparer les résultats et sélectionner un gagnant

Une fois tous les agents terminés, l'Arena passe en phase de comparaison des résultats. Vous verrez :

- **Résumé des statuts** : quels agents ont réussi, échoué ou ont été annulés
- **Métriques d'exécution** : durée, tours de raisonnement, consommation de tokens et nombre d'appels d'outils pour chaque agent
- **Résumé de comparaison Arena** : fichiers modifiés en commun ou par un seul agent, nombre de lignes modifiées, efficacité des tokens et un résumé d'approche de haut niveau généré à partir du diff, des métriques et de l'historique de conversation de chaque agent

Une boîte de dialogue de sélection présente les agents ayant réussi. Choisissez-en un pour appliquer ses modifications à votre espace de travail principal, ou ignorez tous les résultats. Appuyez sur `p` pour basculer un aperçu rapide pour l'agent sélectionné, ou sur `d` pour afficher le diff détaillé de cet agent avant de choisir un gagnant.

### Ce qui se passe lorsque vous sélectionnez un gagnant

1. Les modifications de l'agent gagnant sont extraites sous forme de diff par rapport à la base de référence
2. Le diff est appliqué à votre répertoire de travail principal
3. Tous les worktrees et branches temporaires sont nettoyés automatiquement

Si vous souhaitez inspecter le chemin de raisonnement complet avant de décider, l'historique de conversation complet de chaque agent reste accessible via la barre d'onglets tant que la boîte de dialogue de sélection est active.

## Configuration

Le comportement de l'Arena peut être personnalisé dans [settings.json](/users/configuration/settings):

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Paramètre                   | Description                        | Valeur par défaut         |
| :------------------------ | :--------------------------------- | :-------------- |
| `arena.worktreeBaseDir`   | Répertoire de base pour les worktrees arena | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Nombre maximum de tours de raisonnement par agent | `50`            |
| `arena.timeoutSeconds`    | Délai d'expiration pour chaque agent en secondes  | `600`           |

## Bonnes pratiques

### Choisissez des modèles qui se complètent

L'Arena est particulièrement utile lorsque vous comparez des modèles aux forces sensiblement différentes. Par exemple :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimize the database query layer"
```

Comparer trois versions de la même famille de modèles apporte moins d'informations qu'une comparaison entre différents fournisseurs.

### Gardez les tâches autonomes

Les agents Arena travaillent de manière indépendante, sans communication. Les tâches doivent pouvoir être entièrement décrites dans le prompt sans nécessiter d'allers-retours :

**Bon** : « Refactorisez le module de paiement pour utiliser le pattern strategy. Mettez à jour tous les tests. »

**Moins efficace** : « Discutons de la manière d'améliorer le module de paiement » — cela bénéficie d'une conversation, ce qui convient mieux à une session unique.

### Limitez le nombre d'agents

Jusqu'à 5 agents peuvent s'exécuter simultanément. En pratique, 2 à 3 agents offrent le meilleur équilibre entre la valeur de la comparaison et le coût des ressources. Plus d'agents implique :

- Un coût en tokens plus élevé (chaque agent possède sa propre fenêtre de contexte)
- Un temps d'exécution total plus long
- Plus de résultats à comparer

Commencez avec 2 ou 3 agents et augmentez le nombre uniquement lorsque la valeur de la comparaison le justifie.

### Utilisez l'Arena pour les décisions à fort impact

L'Arena excelle lorsque les enjeux justifient l'exécution de plusieurs modèles :

- Choisir une architecture pour un nouveau module
- Sélectionner une approche pour un refactoring complexe
- Valider une correction de bug critique sous plusieurs angles

Pour les modifications courantes comme renommer une variable ou mettre à jour un fichier de configuration, une session unique est plus rapide et moins coûteuse.

## Dépannage

### Les agents ne parviennent pas à démarrer

- Vérifiez que chaque modèle dans `--models` est correctement configuré avec des identifiants API valides
- Vérifiez que votre répertoire de travail est un dépôt Git (les worktrees nécessitent Git)
- Assurez-vous d'avoir les droits d'écriture sur le répertoire de base des worktrees (`~/.qwen/arena/` par défaut)

### Échec de la création du worktree

- Exécutez `git worktree list` pour vérifier la présence de worktrees obsolètes provenant de sessions précédentes
- Nettoyez les worktrees obsolètes avec `git worktree prune`
- Vérifiez que votre version de Git prend en charge les worktrees (`git --version`, nécessite Git 2.5+)

### L'agent prend trop de temps

- Augmentez le délai d'expiration : définissez `arena.timeoutSeconds` dans les paramètres
- Réduisez la complexité de la tâche — les tâches Arena doivent être ciblées et bien définies
- Réduisez `arena.maxRoundsPerAgent` si les agents consomment trop de tours

### Échec de l'application du gagnant

- Vérifiez la présence de modifications non validées dans votre répertoire de travail principal qui pourraient entrer en conflit
- Le diff est appliqué sous forme de patch — des conflits de fusion sont possibles si votre répertoire de travail a été modifié pendant la session

## Limitations

Agent Arena est expérimental. Limitations actuelles :

- **Mode in-process uniquement** : L'affichage en panneaux divisés via tmux ou iTerm2 n'est pas encore disponible. Tous les agents s'exécutent dans une seule fenêtre terminal avec basculement d'onglets.
- **Pas d'aperçu du diff avant sélection** : Vous pouvez consulter l'historique de conversation de chaque agent, mais il n'existe pas de visualiseur de diff unifié pour comparer les solutions côte à côte avant de choisir un gagnant.
- **Pas de conservation des worktrees** : Les worktrees sont toujours nettoyés après la sélection. Il n'est pas possible de les conserver pour une inspection ultérieure.
- **Pas de reprise de session** : Les sessions Arena ne peuvent pas être reprises après fermeture. Si vous fermez le terminal en cours de session, les worktrees restent sur le disque et doivent être nettoyés manuellement via `git worktree prune`.
- **Maximum de 5 agents** : La limite stricte de 5 agents simultanés ne peut pas être modifiée.
- **Dépôt Git requis** : L'Arena nécessite un dépôt Git pour l'isolation des worktrees. Il ne peut pas être utilisé dans des répertoires non-Git.

## Comparaison avec les autres modes multi-agents

Agent Arena est l'un des plusieurs modes multi-agents prévus dans Qwen Code. **Agent Team** et **Agent Swarm** ne sont pas encore implémentés — le tableau ci-dessous décrit leur conception prévue à titre de référence.

|                   | **Agent Arena**                                        | **Agent Team** (prévu)                           | **Agent Swarm** (prévu)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Objectif**          | Compétitif : Trouver la meilleure solution pour la _même_ tâche | Collaboratif : Aborder _différents_ aspects ensemble | Parallèle par lots : Générer dynamiquement des workers pour des tâches en vrac |
| **Agents**        | Des modèles préconfigurés concourent de manière indépendante            | Des coéquipiers collaborent avec des rôles assignés          | Des workers générés à la volée, détruits à la fin      |
| **Communication** | Aucune communication inter-agents                           | Messagerie directe peer-to-peer                      | Unidirectionnelle : résultats agrégés par le parent                    |
| **Isolation**     | Complète : Git worktrees séparés                           | Sessions indépendantes avec liste de tâches partagée         | Contexte éphémère léger par worker                 |
| **Sortie**        | Une solution sélectionnée appliquée à l'espace de travail             | Résultats synthétisés à partir de multiples perspectives     | Résultats agrégés du traitement parallèle              |
| **Idéal pour**      | Benchmarking, choix entre les approches de modèles        | Recherche, collaboration complexe, travail inter-couches  | Opérations par lots, traitement de données, tâches map-reduce      |

## Prochaines étapes

Explorez les approches connexes pour le travail parallèle et délégué :

- **Délégation légère** : Les [sous-agents](/users/features/sub-agents) gèrent des sous-tâches ciblées au sein de votre session — plus adaptés lorsque vous n'avez pas besoin de comparer des modèles
- **Sessions parallèles manuelles** : Exécutez vous-même plusieurs sessions Qwen Code dans des terminaux séparés avec des [Git worktrees](https://git-scm.com/docs/git-worktree) pour un contrôle manuel complet