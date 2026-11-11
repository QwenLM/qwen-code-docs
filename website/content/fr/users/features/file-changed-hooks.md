# hooks FileChanged


Utilisez `FileChanged` pour observer les fichiers modifiés par Qwen Code, les commandes shell, les éditeurs
ou d'autres processus. Il s'exécute dans des sessions locales non gérées. Consultez le
[guide des hooks](./hooks.md) pour la configuration des hooks, les exécuteurs et les règles de confiance.

## Entrée d'événement

L'entrée inclut les [champs communs des hooks](./hooks.md#hook-input-structure) et :

```json
{
  "file_path": "/home/me/work/demo/.envrc",
  "event": "change"
}
```

`file_path` est absolu. `event` est `add`, `change` ou `unlink` pour un ajout, une modification ou une suppression
de fichier observé. Les champs communs `session_id` et `cwd`
appartiennent à la session à l'écoute ; ils n'identifient pas l'auteur de l'écriture. Plusieurs
sessions surveillant un répertoire partagé peuvent chacune recevoir ses modifications. Le contenu des fichiers
n'est pas inclus.

Seuls les événements de fichiers sont délivrés. Les événements `addDir` et `unlinkDir` sur le répertoire lui-même
ne sont pas délivrés. Les intégrations suivant le cycle de vie d'une racine surveillée doivent
vérifier l'état du système de fichiers (par exemple avec `stat`) et réconcilier de manière indépendante ;
le `unlink` d'un enfant ne prouve pas que la racine a été supprimée.

## Surveiller des noms de fichiers dans le répertoire de travail

Ajoutez un hook `FileChanged` avec des noms de fichiers littéraux séparés par `|` :

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "name": "configuration-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Cela enregistre `.envrc` et `.env` dans le cwd de la session. L'enregistrement statique n'étend pas
les globs ni ne scanne les répertoires de manière récursive. Les matchers omis ou vides,
`*` et `.*` n'enregistrent aucun chemin statique ; ces hooks reçoivent les événements des chemins surveillés
de la session, y compris les chemins dynamiques. Les événements sont filtrés par rapport au nom de base du fichier en utilisant les
[règles de matcher existantes](./hooks.md#matcher-patterns).

Les motifs regex filtrent les chemins déjà surveillés ; enregistrez leurs fichiers ou répertoires
explicitement via `watchPaths`.

Les racines statiques acceptent uniquement des noms de fichiers littéraux nus, y compris les dotfiles. Les métacaractères
regex/glob et les séparateurs de chemin ne créent pas de racines statiques. Les répertoires existants
et les chemins qui ne peuvent pas être inspectés sont exclus ; les fichiers manquants peuvent être surveillés pour leur création. La découverte statique
de fichiers observe leur répertoire parent tout en excluant les entrées non liées avant le parcours. Utilisez des `watchPaths` explicites pour les répertoires récursifs. Changer
le répertoire de travail de la session déplace les racines statiques avant que le déplacement ne se termine ;
les racines dynamiques absolues explicites restent inchangées.

## Surveiller des répertoires et des chemins en dehors du cwd

Un hook synchrone `SessionStart` réussi peut enregistrer des fichiers ou des répertoires absolus
via `hookSpecificOutput.watchPaths`. Les répertoires sont surveillés de manière récursive,
y compris les enfants créés ultérieurement. La découverte récursive ignore les sous-arbres `.git` et
`node_modules`. Pour observer un chemin à l'intérieur, enregistrez ce fichier ou
répertoire explicitement. Les types de fichiers spéciaux sont ignorés et les répertoires ordinaires
n'ont pas de limite de profondeur. L'enregistrement initial attend que le watcher
soit prêt avant que `SessionStart` ne retourne.

La découverte récursive ignore les fichiers temporaires d'écriture atomique nommés
`<target>.<12 lowercase hex characters>.tmp`, y compris les renommages retardés et
les orphelins. L'enregistrement explicite d'un tel fichier le surveille tout de même. Les répertoires avec
ce suffixe restent parcourables et les autres fichiers `.tmp` sont observés normalement.

Par exemple, enregistrez des dossiers mémoire :

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "watch-memory-folders",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/watch-memory.mjs\""
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "memory-file-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Faites en sorte que `watch-memory.mjs` affiche ce JSON sur stdout. Remplacez les chemins d'exemple par
les dossiers absolus réels affichés par `/memory` :

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/me/.qwen/projects/demo/memory",
      "/home/me/.qwen/memories"
    ]
  }
}
```

Le hook `FileChanged` n'a pas de matcher, donc il reçoit les modifications dans tous les répertoires
enregistrés. Son gestionnaire lit le JSON d'événement depuis stdin. Choisissez une
destination de log ou de synchronisation en dehors des chemins surveillés pour éviter de déclencher
le gestionnaire avec ses propres écritures.

## Mettre à jour les chemins dynamiques

Pour plusieurs workspaces dans le même système de fichiers, enregistrez tous leurs répertoires mémoire
réels dans une seule liste. Acheminez les notifications en utilisant `file_path` et votre propre
correspondance répertoire-vers-workspace, plutôt que le `cwd` de la session à l'écoute.
Des sessions indépendantes peuvent observer la même racine partagée, donc dédupliquez le travail
dans le gestionnaire métier. Les racines dans un autre conteneur ou une instance distante nécessitent un
watcher dans ce propriétaire de système de fichiers ; enregistrer leurs chemins sur l'hôte ne les
surveille pas.

Une sortie synchrone réussie de `SessionStart` et `FileChanged` peut définir `watchPaths`. Incluez
le `hookEventName` correspondant dans `hookSpecificOutput`.

| Sortie                                  | Effet sur les chemins dynamiques       |
| --------------------------------------- | -------------------------------------- |
| Une liste de fichiers ou répertoires absolus | Remplace la liste dynamique précédente |
| `[]`                                    | Efface la liste dynamique              |
| `watchPaths` omis ou invalide           | Conserve la liste dynamique précédente |
| Sortie d'un hook asynchrone             | N'enregistre ni ne modifie les chemins |

Lorsque plusieurs hooks renvoient des listes, la dernière liste valide et explicitement fournie dans
l'ordre d'exécution des hooks l'emporte. Toutes les entrées doivent être des chemins absolus ; une seule entrée invalide
rend la liste invalide. Les enregistrements de noms de fichiers statiques restent actifs après un
remplacement ou un effacement dynamique.

Pour effacer les chemins dynamiques depuis un gestionnaire `FileChanged`, renvoyez :

```json
{
  "hookSpecificOutput": {
    "hookEventName": "FileChanged",
    "watchPaths": []
  }
}
```

## Limites d'observation

Le scan initial du répertoire n'est pas rejoué. Les événements natifs du système de fichiers provenant d'une
écriture récente peuvent arriver après l'enregistrement. Les fichiers liens symboliques et les racines de répertoire
explicitement enregistrés observent leurs cibles, y compris les liens dans les chemins ancêtres.
Les notifications utilisent l'alias configuré ; enregistrer plusieurs alias vers une même cible
produit une notification pour chaque alias. Actualisez l'enregistrement après avoir re-ciblé un
lien. Les liens symboliques découverts à l'intérieur d'une racine récursive ne sont pas traversés.
Les événements sont signalés une fois les écritures stabilisées.
La surveillance est best-effort : le regroupement du système de fichiers, les chemins inaccessibles, les temps d'arrêt
des processus et la reconfiguration des chemins peuvent créer des lacunes. Les intégrations qui nécessitent une
copie synchronisée complète doivent gérer les scans initiaux, la réconciliation et les tentatives.
Les échecs du watcher ou du hook sont journalisés et laissent l'opération sur le fichier d'origine
inchangée.

`FileChanged` ne peut pas opposer un veto à une écriture, ni l'annuler, ni ajouter de contexte modèle. Seuls les chemins
explicitement enregistrés sont surveillés : les dossiers mémoire ne sont pas enregistrés automatiquement,
et il n'y a pas d'événement dédié d'activation/désactivation de la mémoire automatique. Un hook qui écrit dans
un fichier surveillé peut se déclencher lui-même ; évitez ces écritures ou dédupliquez le travail.

Les environnements d'exécution SSH, les workers de sandbox shell et les dispatchers gérés ne
démarrent pas de watcher de système de fichiers local. Les règles normales d'activation et de confiance des hooks
s'appliquent toujours. La surveillance s'arrête lorsque la session propriétaire s'arrête.