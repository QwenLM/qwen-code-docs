# Agent Arena

> Lancez plusieurs modèles d'IA simultanément pour exécuter la même tâche, comparez leurs solutions côte à côte et sélectionnez le meilleur résultat à appliquer sur votre espace de travail.

> [!warning]
> Agent Arena est expérimental. Il présente des [limitations connues](#limitations) concernant les modes d'affichage et la gestion des sessions.

Agent Arena vous permet de confronter plusieurs modèles d'IA sur une même tâche. Chaque modèle s'exécute en tant qu'agent totalement indépendant dans son propre *worktree* Git isolé, de sorte que les opérations sur les fichiers n'interfèrent jamais entre elles. Lorsque tous les agents terminent, vous comparez les résultats et sélectionnez un gagnant pour le fusionner dans votre espace de travail principal.

Contrairement aux [sous-agents](./sub-agents.md), qui délèguent des sous-tâches ciblées au sein d'une même session, les agents Arena sont des instances agent complètes de niveau supérieur, chacune avec son propre modèle, sa propre fenêtre de contexte et un accès complet aux outils.

Cette page couvre :

- [Quand utiliser Agent Arena](#quand-utiliser-agent-arena)
- [Démarrer une session Arena](#démarrer-une-session-arena)
- [Interagir avec les agents](#interagir-avec-les-agents), y compris les modes d'affichage et la navigation
- [Comparer les résultats et sélectionner un gagnant](#comparer-les-résultats-et-sélectionner-un-gagnant)
- [Bonnes pratiques](#bonnes-pratiques)

## Quand utiliser Agent Arena

Agent Arena est particulièrement efficace lorsque vous souhaitez **évaluer ou comparer** la manière dont différents modèles abordent le même problème. Les cas d'usage les plus pertinents sont :

- **Benchmarking de modèles** : évaluer les capacités de différents modèles sur des tâches réelles dans votre base de code, et non sur des benchmarks synthétiques
- **Sélection Best-of-N** : obtenir plusieurs solutions indépendantes et choisir la meilleure implémentation
- **Exploration d'approches** : observer comment différents modèles raisonnent et résolvent le même problème — utile pour apprendre et obtenir des insights
- **Réduction des risques** : pour les modifications critiques, valider que plusieurs modèles convergent vers une approche similaire avant de s'engager

Agent Arena consomme beaucoup plus de tokens qu'une session unique (chaque agent dispose de sa propre fenêtre de contexte et de ses propres appels de modèle). Il est plus efficace lorsque la valeur de la comparaison justifie le coût. Pour les tâches courantes où vous faites confiance à votre modèle par défaut, une session unique est plus efficace.

## Démarrer une session Arena

Utilisez la commande slash `/arena` pour lancer une session. Spécifiez les modèles que vous souhaitez faire concourir ainsi que la tâche :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactoriser le module d'authentification pour utiliser des tokens JWT"
```

Si vous omettez `--models`, une boîte de dialogue interactive de sélection de modèles apparaît, vous permettant de choisir parmi vos fournisseurs configurés.

### Ce qui se passe au démarrage

1. **Configuration des worktrees** : Qwen Code crée des worktrees Git isolés pour chaque agent dans `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Chaque worktree reflète exactement l'état de votre répertoire de travail actuel, y compris les modifications indexées, non indexées et les fichiers non suivis.
2. **Lancement des agents** : chaque agent démarre dans son propre worktree avec un accès complet aux outils et le modèle configuré. Les agents sont lancés séquentiellement mais s'exécutent en parallèle.
3. **Exécution** : tous les agents travaillent sur la tâche de manière indépendante, sans état partagé ni communication. Vous pouvez surveiller leur progression et interagir avec n'importe lequel d'entre eux.
4. **Achèvement** : lorsque tous les agents ont terminé (ou échoué), vous passez à la phase de comparaison des résultats.

## Interagir avec les agents

### Modes d'affichage

Agent Arena prend actuellement en charge le **mode in-process**, où tous les agents s'exécutent de manière asynchrone dans le même processus terminal. Une barre d'onglets en bas du terminal vous permet de basculer entre les agents.

> [!note]
> **Les modes d'affichage en panneaux divisés sont prévus pour le futur.** Nous avons l'intention de prendre en charge des dispositions basées sur tmux et iTerm2, où chaque agent dispose de son propre volet terminal pour une véritable visualisation côte à côte. Actuellement, seul le mode onglets in-process est disponible.

### Naviguer entre les agents

En mode in-process, utilisez les raccourcis clavier pour basculer entre les vues des agents :

| Raccourci | Action                            |
| :-------- | :-------------------------------- |
| `Right`   | Passer à l'onglet agent suivant   |
| `Left`    | Passer à l'onglet agent précédent |
| `Up`      | Mettre le focus sur la zone de saisie |
| `Down`    | Mettre le focus sur la barre d'onglets des agents |

La barre d'onglets affiche l'état actuel de chaque agent :

| Indicateur | Signification           |
| :--------- | :---------------------- |
| `●`        | En cours d'exécution ou inactif |
| `✓`        | Terminé avec succès     |
| `✗`        | Échoué                  |
| `○`        | Annulé                  |

### Interagir avec des agents individuels

Lorsque vous consultez l'onglet d'un agent, vous pouvez :

- **Envoyer des messages** : tapez dans la zone de saisie pour donner des instructions supplémentaires à l'agent
- **Approuver des appels d'outils** : si un agent demande une approbation d'outil, la boîte de dialogue de confirmation apparaît dans son onglet
- **Voir l'historique complet** : parcourez l'intégralité de la conversation de l'agent, y compris les sorties du modèle, les appels d'outils et les résultats

Chaque agent est une session complète et indépendante. Tout ce que vous pouvez faire avec l'agent principal, vous pouvez le faire avec un agent Arena.

## Comparer les résultats et sélectionner un gagnant

Lorsque tous les agents sont terminés, l'Arena entre dans la phase de comparaison des résultats. Vous verrez :

- **Résumé des statuts** : quels agents ont réussi, échoué ou été annulés
- **Métriques d'exécution** : durée, nombre de tours de raisonnement, utilisation de tokens, et nombre d'appels d'outils pour chaque agent
- **Résumé de comparaison Arena** : fichiers modifiés en commun vs. par un seul agent, nombre de lignes modifiées, efficacité des tokens, et un résumé d'approche de haut niveau généré à partir du diff, des métriques et de l'historique de conversation de chaque agent

Une boîte de dialogue de sélection présente les agents ayant réussi. Choisissez-en un pour appliquer ses modifications à votre espace de travail principal, ou rejetez tous les résultats. Appuyez sur `p` pour basculer un aperçu rapide de l'agent en surbrillance, ou sur `d` pour basculer le diff détaillé de cet agent avant de sélectionner un gagnant.

### Que se passe-t-il lorsque vous sélectionnez un gagnant

1. Les modifications de l'agent gagnant sont extraites sous forme de diff par rapport à la base de référence
2. Le diff est appliqué à votre répertoire de travail principal
3. Tous les worktrees et branches temporaires sont nettoyés automatiquement

Si vous souhaitez inspecter le cheminement de raisonnement complet avant de décider, l'historique complet de conversation de chaque agent reste disponible via la barre d'onglets pendant que la boîte de dialogue de sélection est active.

## Configuration

Le comportement d'Arena peut être personnalisé dans [settings.json](../configuration/settings.md) :

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Réglage                   | Description                        | Valeur par défaut |
| :------------------------ | :--------------------------------- | :--------------- |
| `arena.worktreeBaseDir`   | Répertoire de base pour les worktrees Arena | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Nombre maximal de tours de raisonnement par agent | `50`             |
| `arena.timeoutSeconds`    | Délai d'expiration pour chaque agent en secondes | `600`            |

## Bonnes pratiques

### Choisissez des modèles complémentaires

Arena est plus utile lorsque vous comparez des modèles avec des forces significativement différentes. Par exemple :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimiser la couche de requêtes de la base de données"
```

Comparer trois versions de la même famille de modèles apporte moins d'insights que de comparer entre fournisseurs.

### Gardez les tâches autonomes

Les agents Arena travaillent indépendamment, sans communication. Les tâches doivent être entièrement descriptibles dans le prompt sans nécessiter d'échanges :

**Bien** : "Refactoriser le module de paiement pour utiliser le pattern *strategy*. Mettre à jour tous les tests."

**Moins efficace** : "Discutons de la manière d'améliorer le module de paiement" — cela bénéficie d'une conversation, mieux adaptée à une session unique.

### Limitez le nombre d'agents

Jusqu'à 5 agents peuvent s'exécuter simultanément. En pratique, 2 à 3 agents offrent le meilleur équilibre entre valeur de comparaison et coût en ressources. Plus d'agents signifie :

- Coûts en tokens plus élevés (chaque agent a sa propre fenêtre de contexte)
- Temps d'exécution total plus long
- Plus de résultats à comparer

Commencez avec 2-3 et n'augmentez que lorsque la valeur de la comparaison le justifie.

### Utilisez Arena pour les décisions à fort impact

Arena est idéal lorsque les enjeux justifient l'exécution de multiples modèles :

- Choisir une architecture pour un nouveau module
- Sélectionner une approche pour une refactorisation complexe
- Valider une correction de bug critique sous plusieurs angles

Pour les modifications courantes comme renommer une variable ou mettre à jour un fichier de configuration, une session unique est plus rapide et moins coûteuse.

## Dépannage

### Les agents ne démarrent pas

- Vérifiez que chaque modèle dans `--models` est correctement configuré avec des identifiants API valides
- Vérifiez que votre répertoire de travail est un dépôt Git (les worktrees nécessitent Git)
- Assurez-vous d'avoir les droits d'écriture sur le répertoire de base des worktrees (`~/.qwen/arena/` par défaut)

### La création des worktrees échoue

- Exécutez `git worktree list` pour vérifier la présence de worktrees obsolètes provenant de sessions précédentes
- Nettoyez les worktrees obsolètes avec `git worktree prune`
- Assurez-vous que votre version de Git prend en charge les worktrees (`git --version`, nécessite Git 2.5+)

### L'agent prend trop de temps

- Augmentez le délai d'expiration : définissez `arena.timeoutSeconds` dans les paramètres
- Réduisez la complexité de la tâche — les tâches Arena doivent être ciblées et bien définies
- Diminuez `arena.maxRoundsPerAgent` si les agents utilisent trop de tours

### L'application du gagnant échoue

- Vérifiez qu'il n'y a pas de modifications non commitées dans votre répertoire de travail principal qui pourraient entrer en conflit
- Le diff est appliqué sous forme de patch — des conflits de fusion sont possibles si votre répertoire de travail a changé pendant la session

## Limitations

Agent Arena est expérimental. Limitations actuelles :

- **Mode in-process uniquement** : l'affichage en panneaux divisés via tmux ou iTerm2 n'est pas encore disponible. Tous les agents s'exécutent dans une seule fenêtre de terminal avec commutation par onglets.
- **Aucun aperçu du diff avant la sélection** : vous pouvez consulter l'historique de conversation de chaque agent, mais il n'y a pas de visionneuse de diff unifiée pour comparer les solutions côte à côte avant de choisir un gagnant.
- **Aucune conservation des worktrees** : les worktrees sont toujours nettoyés après la sélection. Il n'y a pas d'option pour les conserver en vue d'une inspection ultérieure.
- **Aucune reprise de session** : les sessions Arena ne peuvent pas être reprises après une sortie. Si vous fermez le terminal en cours de session, les worktrees restent sur le disque et doivent être nettoyés manuellement avec `git worktree prune`.
- **Maximum 5 agents** : la limite stricte de 5 agents simultanés ne peut pas être modifiée.
- **Dépôt Git requis** : Arena nécessite un dépôt Git pour l'isolation par worktree. Il ne peut pas être utilisé dans des répertoires non Git.

## Comparaison avec d'autres modes multi-agents

Agent Arena est l'un des plusieurs modes multi-agents prévus dans Qwen Code. **Agent Team** et **Agent Swarm** ne sont pas encore implémentés — le tableau ci-dessous décrit leur conception prévue à titre de référence.

|                   | **Agent Arena**                                        | **Agent Team** (prévu)                              | **Agent Swarm** (prévu)                                  |
| :---------------- | :----------------------------------------------------- | :-------------------------------------------------- | :------------------------------------------------------- |
| **Objectif**      | Compétitif : trouver la meilleure solution à la _même_ tâche  | Collaboratif : aborder des aspects _différents_ ensemble | Parallélisation par lots : créer dynamiquement des workers pour des tâches volumineuses |
| **Agents**        | Modèles préconfigurés en compétition indépendante      | Coéquipiers collaborant avec des rôles attribués    | Workers créés à la volée, détruits à la fin              |
| **Communication** | Aucune communication entre agents                     | Messagerie directe de pair à pair                   | Unidirectionnelle : les résultats sont agrégés par le parent |
| **Isolation**     | Totale : worktrees Git séparés                        | Sessions indépendantes avec liste de tâches partagée | Contexte éphémère léger par worker                       |
| **Résultat**      | Une solution sélectionnée appliquée à l'espace de travail | Résultats synthétisés de multiples perspectives     | Résultats agrégés du traitement parallèle                |
| **Idéal pour**    | Benchmarking, choix entre approches de modèles        | Recherche, collaboration complexe, travail multi-couche | Opérations par lots, traitement de données, tâches map-reduce |

## Étapes suivantes

Explorez les approches connexes pour le travail parallèle et délégué :

- **Délégation légère** : les [sous-agents](./sub-agents.md) gèrent des sous-tâches ciblées au sein de votre session — mieux adapté si vous n'avez pas besoin de comparer des modèles
- **Sessions parallèles manuelles** : exécutez vous-même plusieurs sessions Qwen Code dans des terminaux séparés avec des [worktrees Git](https://git-scm.com/docs/git-worktree) pour un contrôle manuel complet