# Agent Arena

> Lancez simultanément plusieurs modèles d'IA sur une même tâche, comparez leurs solutions côte à côte et sélectionnez le meilleur résultat à appliquer à votre espace de travail.

> [!warning]
> Agent Arena est expérimental. Il présente [des limitations connues](#limitations) concernant les modes d'affichage et la gestion des sessions.

Agent Arena vous permet de confronter plusieurs modèles d'IA sur une même tâche. Chaque modèle s'exécute comme un agent totalement indépendant dans son propre arbre de travail Git isolé, de sorte que les opérations sur les fichiers n'interfèrent jamais. Lorsque tous les agents ont terminé, vous comparez les résultats et sélectionnez un gagnant à fusionner dans votre espace de travail principal.

Contrairement aux [sous-agents](./sub-agents.md), qui délèguent des sous-tâches ciblées au sein d'une même session, les agents Arena sont des instances d'agent complètes et de haut niveau — chacun avec son propre modèle, sa fenêtre de contexte et un accès complet aux outils.

Cette page couvre :

- [Quand utiliser Agent Arena](#quand-utiliser-agent-arena)
- [Démarrer une session Arena](#démarrer-une-session-arena)
- [Interagir avec les agents](#interagir-avec-les-agents), y compris les modes d'affichage et la navigation
- [Comparer les résultats et sélectionner un gagnant](#comparer-les-résultats-et-sélectionner-un-gagnant)
- [Bonnes pratiques](#bonnes-pratiques)

## Quand utiliser Agent Arena

Agent Arena est le plus efficace lorsque vous souhaitez **évaluer ou comparer** la manière dont différents modèles abordent le même problème. Les cas d'utilisation les plus pertinents sont :

- **Évaluation comparative de modèles** : Évaluez les capacités de différents modèles sur des tâches réelles dans votre base de code existante, et non sur des benchmarks synthétiques.
- **Sélection du meilleur parmi N** : Obtenez plusieurs solutions indépendantes et choisissez la meilleure implémentation.
- **Exploration d'approches** : Observez comment différents modèles raisonnent et résolvent le même problème — utile pour apprendre et obtenir des insights.
- **Réduction des risques** : Pour des modifications critiques, validez que plusieurs modèles convergent vers une approche similaire avant de vous engager.

Agent Arena utilise significativement plus de tokens qu'une session unique (chaque agent possède sa propre fenêtre de contexte et ses propres appels de modèle). Il est le plus adapté lorsque la valeur de la comparaison justifie le coût. Pour les tâches courantes où vous faites confiance à votre modèle par défaut, une session unique est plus efficace.

## Démarrer une session Arena

Utilisez la commande `/arena` pour lancer une session. Spécifiez les modèles que vous souhaitez faire concourir ainsi que la tâche :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactoriser le module d'authentification pour utiliser des tokens JWT"
```

Si vous omettez `--models`, un dialogue de sélection interactif des modèles apparaît, vous permettant de choisir parmi vos fournisseurs configurés.

### Que se passe-t-il au démarrage

1. **Configuration de l'arbre de travail** : Qwen Code crée des arbres de travail Git isolés pour chaque agent dans `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Chaque arbre de travail reflète exactement l'état actuel de votre répertoire de travail — y compris les modifications indexées, non indexées et les fichiers non suivis.
2. **Création des agents** : Chaque agent démarre dans son propre arbre de travail avec un accès complet aux outils et son modèle configuré. Les agents sont lancés séquentiellement mais s'exécutent en parallèle.
3. **Exécution** : Tous les agents travaillent sur la tâche de manière indépendante, sans état partagé ni communication. Vous pouvez surveiller leur progression et interagir avec chacun d'eux.
4. **Achèvement** : Lorsque tous les agents ont terminé (ou échoué), vous entrez dans la phase de comparaison des résultats.

## Interagir avec les agents

### Modes d'affichage

Agent Arena prend actuellement en charge le **mode in-process**, où tous les agents s'exécutent de manière asynchrone dans le même processus terminal. Une barre d'onglets en bas du terminal vous permet de basculer entre les agents.

> [!note]
> **Les modes d'affichage en panneaux divisés sont prévus pour le futur.** Nous envisageons de prendre en charge des dispositions en panneaux divisés basées sur tmux et iTerm2, où chaque agent obtiendrait son propre panneau de terminal pour une visualisation côte à côte. Actuellement, seul le basculement par onglets en mode in-process est disponible.

### Naviguer entre les agents

En mode in-process, utilisez les raccourcis clavier pour changer de vue d'agent :

| Raccourci | Action                                  |
| :-------- | :-------------------------------------- |
| `Droite`  | Passer à l'onglet agent suivant         |
| `Gauche`  | Revenir à l'onglet agent précédent      |
| `Haut`    | Mettre le focus sur la zone de saisie   |
| `Bas`     | Mettre le focus sur la barre d'onglets  |

La barre d'onglets affiche le statut actuel de chaque agent :

| Indicateur | Signification              |
| :--------- | :------------------------- |
| `●`        | En cours d'exécution ou inactif |
| `✓`        | Terminé avec succès        |
| `✗`        | Échoué                     |
| `○`        | Annulé                     |

### Interagir avec des agents individuels

Lorsque vous visualisez l'onglet d'un agent, vous pouvez :

- **Envoyer des messages** — tapez dans la zone de saisie pour donner des instructions supplémentaires à l'agent
- **Approuver les appels d'outils** — si un agent demande une approbation d'outil, la boîte de dialogue de confirmation apparaît dans son onglet
- **Consulter l'historique complet** — parcourez l'intégralité de la conversation de l'agent, y compris les sorties du modèle, les appels d'outils et les résultats

Chaque agent est une session complète et indépendante. Tout ce que vous pouvez faire avec l'agent principal, vous pouvez le faire avec un agent Arena.

## Comparer les résultats et sélectionner un gagnant

Lorsque tous les agents ont terminé, l'Arena entre dans la phase de comparaison des résultats. Vous verrez :
- **Résumé de l’état** : Quels agents ont réussi, échoué ou été annulés
- **Métriques d’exécution** : Durée, nombre de tours de raisonnement, utilisation de jetons et nombre d’appels d’outils pour chaque agent
- **Résumé comparatif de l’arène** : Fichiers modifiés en commun vs. par un seul agent, nombre de lignes modifiées, efficacité en jetons et résumé d’approche de haut niveau généré à partir du diff, des métriques et de l’historique de conversation de chaque agent

Une boîte de dialogue de sélection présente les agents ayant réussi. Choisissez-en un pour appliquer ses modifications à votre espace de travail principal, ou ignorez tous les résultats. Appuyez sur `p` pour basculer un aperçu rapide de l’agent en surbrillance, ou sur `d` pour basculer le diff détaillé de cet agent avant de sélectionner un gagnant.

### Que se passe-t-il lorsque vous sélectionnez un gagnant

1. Les modifications de l’agent gagnant sont extraites sous forme de diff par rapport à la base de référence
2. Le diff est appliqué à votre répertoire de travail principal
3. Tous les worktrees et branches temporaires sont automatiquement nettoyés

Si vous souhaitez inspecter le cheminement complet du raisonnement avant de décider, l’historique complet de conversation de chaque agent est toujours accessible via la barre d’onglets lorsque la boîte de dialogue de sélection est active.

## Configuration

Le comportement de l’arène peut être personnalisé dans [settings.json](../configuration/settings.md) :

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Paramètre                    | Description                                     | Valeur par défaut |
| :--------------------------- | :---------------------------------------------- | :---------------- |
| `arena.worktreeBaseDir`      | Répertoire de base pour les worktrees de l’arène | `~/.qwen/arena`   |
| `arena.maxRoundsPerAgent`   | Nombre maximum de tours de raisonnement par agent | `50`              |
| `arena.timeoutSeconds`       | Délai d’attente pour chaque agent en secondes    | `600`             |

## Bonnes pratiques

### Choisissez des modèles complémentaires

L’arène est la plus utile lorsque vous comparez des modèles ayant des forces significativement différentes. Par exemple :

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimise la couche de requêtes de base de données"
```

Comparer trois versions de la même famille de modèles apporte moins d’informations qu’une comparaison entre fournisseurs.

### Gardez les tâches autonomes

Les agents de l’arène travaillent indépendamment, sans communication. Les tâches doivent pouvoir être entièrement décrites dans l’invite sans nécessiter d’échanges :

**Bien** : « Refactorise le module de paiement pour utiliser le pattern stratégie. Mets à jour tous les tests. »

**Moins efficace** : « Discutons de la façon d’améliorer le module de paiement » — cela bénéficie d’une conversation, mieux adaptée à une session unique.

### Limitez le nombre d’agents

Jusqu’à 5 agents peuvent s’exécuter simultanément. En pratique, 2 à 3 agents offrent le meilleur équilibre entre valeur de comparaison et coût des ressources. Plus d’agents signifie :

- Coûts en jetons plus élevés (chaque agent a sa propre fenêtre de contexte)
- Temps d’exécution total plus long
- Plus de résultats à comparer

Commencez avec 2–3 et augmentez uniquement si la valeur de la comparaison le justifie.

### Utilisez l’arène pour les décisions à fort impact

L’arène brille lorsque les enjeux justifient l’exécution de plusieurs modèles :

- Choisir une architecture pour un nouveau module
- Sélectionner une approche pour une refactorisation complexe
- Valider une correction de bug critique sous plusieurs angles

Pour des modifications courantes comme renommer une variable ou mettre à jour un fichier de configuration, une session unique est plus rapide et moins coûteuse.

## Dépannage

### Les agents ne démarrent pas

- Vérifiez que chaque modèle dans `--models` est correctement configuré avec des informations d’identification API valides
- Vérifiez que votre répertoire de travail est un dépôt Git (les worktrees nécessitent Git)
- Assurez-vous d’avoir les droits d’écriture sur le répertoire de base des worktrees (`~/.qwen/arena/` par défaut)

### La création du worktree échoue

- Exécutez `git worktree list` pour rechercher des worktrees obsolètes de sessions précédentes
- Nettoyez les worktrees obsolètes avec `git worktree prune`
- Assurez-vous que votre version de Git prend en charge les worktrees (`git --version`, nécessite Git 2.5+)

### L’agent prend trop de temps

- Augmentez le délai d’attente : définissez `arena.timeoutSeconds` dans les paramètres
- Réduisez la complexité de la tâche — les tâches de l’arène doivent être ciblées et bien définies
- Abaissez `arena.maxRoundsPerAgent` si les agents passent trop de tours

### L’application du gagnant échoue

- Vérifiez la présence de modifications non validées dans votre répertoire de travail principal qui pourraient entrer en conflit
- Le diff est appliqué sous forme de correctif — des conflits de fusion sont possibles si votre répertoire de travail a changé pendant la session

## Limitations

Agent Arena est expérimental. Limitations actuelles :

- **Mode en processus uniquement** : L’affichage en écran partagé via tmux ou iTerm2 n’est pas encore disponible. Tous les agents s’exécutent dans une seule fenêtre de terminal avec commutation d’onglets.
- **Aucun aperçu du diff avant la sélection** : Vous pouvez consulter l’historique de conversation de chaque agent, mais il n’y a pas de visionneuse de diff unifiée pour comparer les solutions côte à côte avant de choisir un gagnant.
- **Aucune conservation des worktrees** : Les worktrees sont toujours nettoyés après la sélection. Il n’y a aucune option pour les conserver pour une inspection ultérieure.
- **Aucune reprise de session** : Les sessions de l’arène ne peuvent pas être reprises après une sortie. Si vous fermez le terminal en cours de session, les worktrees restent sur le disque et doivent être nettoyés manuellement via `git worktree prune`.
- **Maximum 5 agents** : La limite stricte de 5 agents simultanés ne peut pas être modifiée.
- **Dépôt Git requis** : L’arène nécessite un dépôt Git pour l’isolation par worktree. Elle ne peut pas être utilisée dans des répertoires non Git.
## Comparaison avec les autres modes multi-agents

Agent Arena est l'un des nombreux modes multi-agents prévus dans Qwen Code. **Agent Team** et **Agent Swarm** ne sont pas encore implémentés — le tableau ci-dessous décrit leur conception prévue à titre indicatif.

|                   | **Agent Arena**                                        | **Agent Team** (prévu)                           | **Agent Swarm** (prévu)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Objectif**      | Compétitif : trouver la meilleure solution à la _même_ tâche | Collaboratif : traiter _différents_ aspects ensemble | Parallèle par lots : générer dynamiquement des travailleurs pour des tâches en masse |
| **Agents**        | Des modèles préconfigurés concourent indépendamment      | Des coéquipiers collaborent avec des rôles attribués    | Des travailleurs créés à la volée, détruits à la fin     |
| **Communication** | Aucune communication inter-agents                        | Messagerie directe de pair à pair                     | Unidirectionnelle : les résultats sont agrégés par le parent |
| **Isolement**     | Total : des espaces de travail Git séparés               | Sessions indépendantes avec une liste de tâches partagée | Contexte éphémère léger par travailleur                    |
| **Résultat**      | Une solution sélectionnée appliquée à l'espace de travail | Résultats synthétisés depuis plusieurs perspectives   | Résultats agrégés d'un traitement parallèle                  |
| **Idéal pour**    | Comparer des approches de modèles, faire des choix       | Recherche, collaboration complexe, travail multicouche | Opérations par lots, traitement de données, tâches map-reduce |

## Prochaines étapes

Découvrez des approches connexes pour le travail parallèle et délégué :

- **Délégation légère** : [Sous-agents](./sub-agents.md) gèrent des sous-tâches ciblées dans votre session — mieux adapté lorsque vous n'avez pas besoin de comparer des modèles
- **Sessions parallèles manuelles** : exécutez vous-même plusieurs sessions Qwen Code dans des terminaux distincts à l'aide d'[espaces de travail Git](https://git-scm.com/docs/git-worktree) pour un contrôle manuel complet
