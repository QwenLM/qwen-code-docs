# Design de rechargement des fichiers d'extension

## Contexte

Les changements d'extension entrent actuellement dans le runtime depuis deux
directions différentes. Les mutations d'UI initiées par l'utilisateur, comme
l'activation, la désactivation, l'installation, la désinstallation et la
mise à jour, passent déjà par `ExtensionManager` et peuvent rafraîchir
l'état runtime directement. Les changements hors bande du système de
fichiers, comme l'édition des `skills/`, `commands/`, `hooks/` ou
`qwen-extension.json` d'une extension installée, ne sont pas possédés par
une seule action d'UI et nécessitent donc un chemin piloté par un watcher.

Ce design ajoute ce chemin de watcher manquant tout en préservant le chemin
de mutation directe. Il suit la même organisation en couches que les designs
de rechargement à chaud MCP et LSP :

- le CLI décide quand les changements du système de fichiers doivent
  déclencher un rechargement ou une notification utilisateur ;
- Core possède la manière dont l'état runtime des extensions est rafraîchi ;
- les composants d'UI consomment un petit objet événement/état au lieu de
  faire du polling direct des fichiers d'extension.

La contrainte clé est que tous les fichiers d'extension ne peuvent pas être
appliqués à chaud en toute sécurité de la même manière. Les fichiers de
capacité de type contenu peuvent être rafraîchis automatiquement, mais les
changements au niveau du paquet doivent demander à l'utilisateur d'exécuter
`/reload-plugins` afin que le cache d'extension, les outils runtime, les
hooks, les fichiers de contexte et la liste des slash commands soient
reconstruits depuis un seul snapshot cohérent.

## Évaluation du code actuel

- `ExtensionManager` charge déjà les manifestes d'extension, les répertoires
  de convention, les métadonnées d'installation, l'état d'activation, l'état
  de source de marketplace, les commandes, les skills, les agents, les
  hooks, les déclarations MCP et les déclarations LSP.
- Les opérations d'extension de l'UI appellent déjà
  `ExtensionManager.refreshTools()` après avoir changé un état pertinent
  pour le runtime. Ce chemin rafraîchit MCP, les skills, les sous-agents,
  les hooks et la mémoire hiérarchique via Core.
- La complétion des slash commands est construite par
  `CommandService.create()` depuis les loaders. Les commandes d'extension et
  les slash commands basés sur des skills n'apparaissent pas
  automatiquement sauf si `reloadCommands()` reconstruit ce service de
  commandes.
- Les gestionnaires de skills et de sous-agents ont des API de
  rafraîchissement de cache, mais ces caches sont séparés de la complétion
  des slash commands.
- Les hooks sont possédés par `HookSystem` et `HookRegistry`. Recréer tout
  le système de hooks perdrait les hooks temporaires à portée agent, donc le
  rechargement ne doit cibler que les hooks configurés.
- `SettingsWatcher` et les watchers MCP/LSP existants ne couvrent pas le
  contenu des paquets d'extension installés. Les fichiers spécifiques aux
  extensions ont besoin de leur propre watcher.
- Les extensions liées peuvent se trouver hors du répertoire d'extensions
  utilisateur, donc surveiller uniquement `~/.qwen/extensions` manque les
  workflows de développement actifs.

## Objectifs

Faire en sorte que les changements d'extension prennent effet dans la
session interactive courante sans redémarrage complet du CLI :

- garder les mutations d'extension de l'UI immédiatement effectives ;
- détecter les éditions, ajouts et suppressions manuels d'extensions sous le
  répertoire d'extensions utilisateur ;
- détecter les éditions dans les répertoires source des extensions liées ;
- rafraîchir automatiquement les fichiers de capacité au niveau contenu sous
  `commands/`, `skills/` et `agents/` ;
- inviter l'utilisateur à exécuter `/reload-plugins` pour les changements au
  niveau du paquet ;
- rafraîchir les hooks dans le cadre du rechargement runtime sans perdre les
  hooks à portée agent ;
- garder la complétion des slash commands synchronisée avec les changements
  de commandes et de skills ;
- supprimer les notifications du watcher pour les changements écrits par les
  propres mutations d'extension de Qwen ;
- faire remonter les échecs de rechargement MCP et de hooks au lieu de
  signaler un résumé de rechargement réussi trompeur.

## Non-objectifs

- Ne pas rendre les éditions de fichiers de hooks auto-rafraîchissables
  comme du contenu. Le comportement des hooks peut affecter l'exécution des
  commandes et les workflows sensibles à la sécurité, donc les éditions de
  hooks sont traitées comme des changements au niveau du paquet.
- Ne pas recharger à chaud des fichiers d'extension arbitraires. Les
  fichiers inconnus sont ignorés sauf s'il s'agit de fichiers de contexte
  résolus.
- Ne pas ajouter de redémarrage MCP incrémental par extension. Ce design
  continue d'utiliser le point d'entrée de réinitialisation MCP existant.
- Ne pas modifier la découverte des extensions, la conversion, l'analyse des
  sources d'installation ni la sémantique de la marketplace.
- Ne pas prendre en charge le basculement runtime du mode nu. Le watcher
  n'est simplement pas démarré en mode nu.

## Structure du code

L'implémentation est intentionnellement découpée par couche.

```text
packages/core/src/extension/
  extensionManager.ts
    Extension mutation lifecycle events.
    UI mutation methods still own direct runtime refresh.

  extension-runtime-refresh.ts
    Core runtime refresh contract for extension mutations.

packages/core/src/hooks/
  hookRegistry.ts
    Reload configured hooks while preserving agent-scoped hooks.

  hookSystem.ts
    Public hook reload facade used by extension runtime refresh.

packages/cli/src/config/
  extension-refresh-state.ts
    Shared event/state object for watcher, slash processor, and reload command.

  extension-file-watcher.ts
    Filesystem watcher and path classifier.

  extension-runtime-reload.ts
    CLI reload helpers for /reload-plugins and content auto-refresh.

packages/cli/src/ui/commands/
  reload-plugins-command.ts
    Interactive slash command for package-level extension reload.

packages/cli/src/ui/hooks/
  slashCommandProcessor.ts
    Event consumers for stale notifications and content auto-refresh.

packages/cli/src/
  gemini.tsx
  ui/AppContainer.tsx
  ui/startInteractiveUI.tsx
    Startup and dependency injection for ExtensionRefreshState and watcher.
```

## Design

### 1. Classifier les changements du système de fichiers

`ExtensionFileWatcher` associe un événement chokidar à l'un des trois
résultats :

```ts
type RefreshAction = 'auto' | 'stale' | false;
```

La classification est délibérément conservatrice.

| Classe de chemin                 | Action  | Raison                                                                                         |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `commands/**`                    | `auto`  | Les loaders de slash commands peuvent reconstruire depuis le cache d'extension existant.       |
| `skills/**`                      | `auto`  | Le cache de skills et les loaders de slash commands peuvent reconstruire sans changer l'identité du paquet. |
| `agents/**`                      | `auto`  | Le cache de sous-agents peut reconstruire sans changer l'identité du paquet.                   |
| `hooks/**`                       | `stale` | Le comportement d'exécution des hooks doit être rechargé depuis un snapshot de paquet cohérent. |
| `qwen-extension.json`            | `stale` | Le manifeste peut changer les commandes, les skills, les agents, les hooks, MCP, LSP, les noms de fichiers de contexte et les métadonnées. |
| `.qwen-extension-install.json`   | `stale` | Les métadonnées d'installation affectent les racines source liées et l'identité du paquet.     |
| fichiers de contexte configurés  | `stale` | Le contexte du modèle peut changer et doit être rechargé explicitement.                        |
| ajout/suppression du répertoire d'extension | `stale` | La topologie des extensions installées a changé.                                        |
| fichiers de configuration d'extension de premier niveau | `stale` | L'activation, les préférences ou les marketplaces ont changé hors du chemin de mutation de l'UI. |
| fichiers inconnus                | ignoré  | Éviter de rafraîchir pour des artefacts de build ou des données sans rapport.                  |

Le même classifieur est utilisé pour les extensions installées par
l'utilisateur et les racines source des extensions liées. Pour les racines
liées, le watcher trouve d'abord l'extension liée propriétaire puis
classifie le chemin relativement à cette racine source.

### 2. Surveiller les racines d'extensions utilisateur et liées

`ExtensionFileWatcher.startWatching()` construit les racines surveillées
depuis :

1. `Storage.getUserExtensionsDir()`, lorsqu'il existe ;
2. les chemins source actifs des extensions liées depuis les métadonnées
   d'installation ;
3. le parent du répertoire d'extensions utilisateur, uniquement lorsque le
   répertoire d'extensions n'existe pas encore.

Le watcher d'amorçage du parent couvre la première installation d'extension
ou la création manuelle du répertoire d'extensions après le démarrage.
Lorsque le répertoire apparaît, le watcher marque l'état des extensions
comme obsolète et planifie `restartWatching()` dans une microtâche.
Planifier le redémarrage évite de fermer le watcher d'amorçage pendant que
chokidar dispatch encore l'événement.

Options du watcher :

```ts
watchFs(roots, {
  ignoreInitial: true,
  followSymlinks: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
  ignored: (filePath) => this.isIgnored(filePath),
});
```

`followSymlinks: false` empêche une extension de faire surveiller par Qwen
des chemins externes arbitraires via des liens symboliques. Le filtre
d'exclusion ignore `node_modules`, `.git`, les fichiers de sauvegarde
courants des éditeurs, les fichiers d'échange, les fichiers temporaires et
`.DS_Store`.

### 3. Partager l'état de rechargement via ExtensionRefreshState

`ExtensionRefreshState` est la petite primitive événement/état partagée par
le watcher, le processeur de slash commands et `/reload-plugins`.

Méthodes clés :

```ts
markExtensionsChanged(reason?: string): boolean;
markExtensionContentChanged(reason?: string): boolean;
clearExtensionsChanged(): void;
notifyExtensionsReloadStarted(): void;
needsExtensionRefresh(): boolean;
beginSuppression(onSettle?: () => void): () => void;
suppressNotifications<T>(fn: () => T, onSettle?: () => void): T;
```

Événements :

| Événement                 | Producteur                              | Consommateur                | Signification                                                          |
| ------------------------- | --------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `ExtensionContentChanged` | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | Des fichiers au niveau contenu ont changé ; planifier un auto-rafraîchissement. |
| `ExtensionRefreshNeeded`  | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | L'état au niveau du paquet a changé ; dire à l'utilisateur d'exécuter `/reload-plugins`. |
| `ExtensionsReloadStarted` | `/reload-plugins`                       | `useSlashCommandProcessor`  | Annuler les minuteries de rafraîchissement de contenu en attente avant le rechargement manuel. |
| `ExtensionsReloaded`      | `/reload-plugins`, chemin de redémarrage du watcher | watcher et processeur de slash | Effacer les drapeaux obsolètes et redémarrer/annuler le travail en attente. |

`markExtensionsChanged()` déduplique les notifications d'obsolescence
jusqu'à ce que l'état soit effacé. Les notifications de changement de
contenu ne sont pas dédupliquées par cet objet d'état, car le processeur de
slash commands possède le debounce et la sérialisation.

### 4. Supprimer le bruit du watcher pendant les mutations programmatiques

`ExtensionManager` expose :

```ts
interface ExtensionMutationEvent {
  id: number;
  phase: 'start' | 'end';
  operation: string;
}

addMutationListener(listener: ExtensionMutationListener): () => void;
```

Les méthodes de mutation pertinentes pour le runtime appellent
`beginMutation()` et émettent toujours un événement de fin correspondant
dans `finally`.

Méthodes qui émettent des événements de mutation :

- `enableExtension()`
- `disableExtension()`
- `installExtension()`
- `uninstallExtension()`
- `updateExtension()`
- `addSource()`
- `removeSource()`
- `setExtensionScope()`
- `setMcpServerDisabled()`

Méthodes qui n'émettent pas d'événements de mutation :

- `toggleFavorite()`
- `markSourceUpdated()`

Le watcher conserve `mutation id -> callback de fin de suppression` dans
une `Map`. C'est important car l'installation peut déclencher l'activation
en interne, et des mutations distinctes peuvent se chevaucher.
L'appariement par id évite de dépendre de l'ordre de pile.

Lorsque la profondeur de suppression externe atteint zéro, le watcher
redémarre. Cela rafraîchit les racines source liées, les noms de fichiers
de contexte et les métadonnées d'extensions actives après la stabilisation
de la mutation.

### 5. Rafraîchir l'état runtime depuis Core

`refreshExtensionRuntime()` est le point d'entrée côté Core du
rafraîchissement runtime utilisé par les mutations d'extension de l'UI.

Il rafraîchit dans cet ordre :

1. `config.reinitializeMcpServers(config.getSettingsMcpServers())`
2. `config.getSkillManager()?.refreshCache()`
3. `config.getSubagentManager().refreshCache()`
4. `config.getHookSystem()?.reload()`
5. `config.refreshHierarchicalMemory()`

La réinitialisation MCP s'exécute en premier car les descriptions d'outils
des skills et des sous-agents peuvent dépendre de la liste d'outils MCP
mise à jour.

Les skills, les sous-agents et les hooks s'exécutent via
`Promise.allSettled()` afin qu'une branche rejetée n'empêche pas les autres
de s'appliquer. L'échec du rechargement des hooks est stocké et relancé
après que la mémoire hiérarchique a eu l'occasion de se rafraîchir. Cela
garde les échecs de hooks visibles tout en appliquant quand même les
rafraîchissements best-effort des caches.

Contrat d'échec :

- Un échec MCP se propage immédiatement et les branches runtime ultérieures
  ne s'exécutent pas.
- Un échec de rechargement des hooks se propage après la stabilisation des
  branches de rafraîchissement parallèles et du rafraîchissement de la
  mémoire.
- Un échec de rafraîchissement des skills est journalisé et best-effort.
- Un échec de rafraîchissement des sous-agents est journalisé et
  best-effort.
- Un échec de rafraîchissement de la mémoire hiérarchique est journalisé et
  best-effort.

### 6. Recharger les changements au niveau du paquet avec /reload-plugins

`reloadPluginsRuntime()` est l'aide au rechargement runtime côté CLI
utilisée par le slash command :

```ts
async function reloadPluginsRuntime(options: {
  config: Config;
  reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
```

Flux :

1. `config.getExtensionManager().refreshCache()`
2. `config.getExtensionManager().refreshTools()`
3. `reloadCommands()`
4. résumer les capacités des extensions actives

Le résumé compte les déclarations d'extensions actives pour :

- les extensions ;
- les commandes ;
- les skills ;
- les agents ;
- les hooks ;
- les serveurs MCP d'extension ;
- les serveurs LSP d'extension.

`/reload-plugins` possède le comportement de la commande visible par
l'utilisateur :

1. exiger `config` ;
2. émettre `ExtensionsReloadStarted` ;
3. appeler `reloadPluginsRuntime()` ;
4. appeler `clearExtensionsChanged()` en cas de succès ou d'échec ;
5. renvoyer soit un résumé d'information localisé, soit un message
   d'erreur.

Effacer l'état obsolète en cas d'échec est intentionnel. Si un
rechargement échoué laissait `extensionRefreshNeeded = true`, les futures
notifications du watcher de fichiers seraient dédupliquées et
l'auto-rafraîchissement de contenu continuerait à se contourner lui-même.

### 7. Auto-rafraîchir les changements au niveau contenu

`refreshExtensionContentRuntime()` est utilisé pour les changements de
système de fichiers au contenu uniquement.

Flux :

1. rafraîchir le cache d'extensions ;
2. rafraîchir le cache de skills ;
3. rafraîchir le cache de sous-agents ;
4. recharger les slash commands ;
5. agréger les erreurs et lever un seul message si une branche a échoué.

Le processeur de slash commands écoute `ExtensionContentChanged` et applique
un debounce de 250 ms au rafraîchissement. Il sérialise les
rafraîchissements avec :

```ts
extensionContentRefreshRunningRef;
extensionContentRefreshPendingRef;
```

Si un événement de contenu arrive pendant qu'un rafraîchissement est en
cours, le processeur marque un autre passage comme en attente et exécute ce
passage après la fin du passage courant. Une petite borne supérieure
empêche un éditeur ou un processus de build bruyant de maintenir la même
tâche de rafraîchissement en vie indéfiniment.

Si `ExtensionRefreshState.needsExtensionRefresh()` est vrai,
l'auto-rafraîchissement de contenu se termine tôt. Le rechargement au
niveau du paquet doit s'exécuter en premier afin que les états des
commandes, des skills, des agents, des hooks, de MCP, de LSP et du contexte
soient reconstruits depuis un seul snapshot du cache d'extensions.

### 8. Recharger les hooks sans perdre les hooks à portée agent

`HookRegistry.reloadConfiguredHooks()` remplace uniquement les entrées de
hooks configurés. Il préserve les entrées avec `agentScope !== undefined`,
car ce sont des hooks temporaires enregistrés pour l'exécution de
sous-agents.

Flux :

1. sauvegarder `previousEntries` ;
2. conserver `agentEntries` ;
3. définir les entrées du registre sur `agentEntries` ;
4. exécuter `processHooksFromConfig()` ;
5. en cas d'échec, restaurer `previousEntries` et relancer.

`HookSystem.reload()` est une façade étroite qui délègue à
`hookRegistry.reloadConfiguredHooks()`. Le rechargement runtime n'a donc
pas besoin de recréer tout le système de hooks.

Ce chemin de rechargement ne relit pas les fichiers de paramètres
utilisateur ou projet depuis le disque. `processHooksFromConfig()`
retraite les valeurs courantes de `Config` pour les hooks utilisateur/projet
et les valeurs de configuration d'extension rafraîchies. Le rechargement
des fichiers de paramètres reste possédé par le chemin de rechargement des
paramètres ; `/reload-plugins` est limité à l'état runtime des extensions.

### 9. Câbler l'état dans l'UI interactive

Le démarrage interactif crée un `ExtensionRefreshState` partagé :

```ts
const extensionRefreshState = new ExtensionRefreshState();
const extensionFileWatcher = isBareMode(argv.bare)
  ? undefined
  : new ExtensionFileWatcher(config, undefined, extensionRefreshState);
```

Cet état est transmis via :

```text
gemini.tsx
  -> startInteractiveUI(...)
    -> AppContainer
      -> useSlashCommandProcessor
      -> CommandContext.services.extensionRefreshState
```

`AppContainer` crée un `ExtensionRefreshState` de secours uniquement
lorsqu'aucun n'a été fourni. Cela garde les tests et les points d'entrée
d'UI alternatifs simples tandis que le chemin interactif principal partage
l'état entre le watcher et le traitement des slash commands.

Le nettoyage désenregistre l'écouteur de rechargement et arrête le watcher.

## Flux d'événements

### Édition d'un fichier de contenu

```text
edit extension commands/skills/agents file
  -> ExtensionFileWatcher classifies as auto
  -> ExtensionRefreshState.markExtensionContentChanged()
  -> useSlashCommandProcessor schedules debounced refresh
  -> refreshExtensionContentRuntime()
      -> ExtensionManager.refreshCache()
      -> SkillManager.refreshCache()
      -> SubagentManager.refreshCache()
      -> reloadCommands()
```

### Édition d'un fichier au niveau du paquet

```text
edit qwen-extension.json/hooks/context/install metadata/topology
  -> ExtensionFileWatcher classifies as stale
  -> ExtensionRefreshState.markExtensionsChanged()
  -> useSlashCommandProcessor prints:
       "Extensions changed on disk. Run /reload-plugins to apply updates."
  -> user runs /reload-plugins
  -> reloadPluginsRuntime()
      -> ExtensionManager.refreshCache()
      -> ExtensionManager.refreshTools()
      -> reloadCommands()
```

### Mutation d'UI

```text
user enables/disables/installs/uninstalls/updates extension
  -> ExtensionManager emits mutation start
  -> ExtensionRefreshState begins suppression
  -> ExtensionManager writes disk/runtime state
  -> ExtensionManager.refreshTools()
      -> refreshExtensionRuntime()
  -> ExtensionManager emits mutation end
  -> suppression settles
  -> ExtensionFileWatcher restarts with fresh roots/context files
```

## Concurrence et ordre

- Les redémarrages du watcher sont protégés par une garde de génération.
  Les événements d'une ancienne instance du watcher sont ignorés après le
  changement de `watchGeneration`.
- La suppression des mutations est appariée par id de mutation, pas par
  ordre de pile.
- `stopWatching()` met fin à toutes les suppressions en attente avant de
  lâcher les références du watcher, afin que la profondeur de suppression ne
  puisse pas fuir lorsque le watcher est arrêté alors qu'une mutation est
  en cours.
- L'auto-rafraîchissement de contenu est sérialisé dans le processeur de
  slash commands. Les événements concurrents fusionnent en au plus une
  réexécution en attente.
- `/reload-plugins` émet `ExtensionsReloadStarted` et `ExtensionsReloaded`
  afin que les minuteries de rafraîchissement de contenu en attente soient
  annulées autour du rechargement manuel.
- L'état obsolète au niveau du paquet gagne sur l'auto-rafraîchissement de
  contenu. Si un rechargement d'obsolescence est nécessaire,
  l'auto-rafraîchissement de contenu se termine et attend
  `/reload-plugins`.

## Sémantique d'échec

| Chemin                                                | Comportement                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Réinitialisation MCP dans une mutation ou `/reload-plugins` | Se propage. Un message de succès serait trompeur car les outils MCP d'extension peuvent être indisponibles.                          |
| Rechargement des hooks dans une mutation ou `/reload-plugins` | Se propage après la stabilisation des autres branches de rafraîchissement parallèles. Un résumé de succès serait trompeur car les hooks configurés peuvent ne pas être enregistrés. |
| Rafraîchissement du cache de skills pendant une mutation | Journalisé et best-effort.                                                                                                              |
| Rafraîchissement du cache de sous-agents pendant une mutation | Journalisé et best-effort.                                                                                                           |
| Rafraîchissement de la mémoire hiérarchique pendant une mutation | Journalisé et best-effort. Il ne doit pas faire de rollback de l'état d'extension déjà écrit.                                    |
| Échec de l'auto-rafraîchissement de contenu           | Agrégé et affiché dans l'UI avec un fallback `/reload-plugins`.                                                                            |
| Échec de `/reload-plugins`                            | Renvoie un message d'erreur et efface l'état obsolète afin que les futures notifications du watcher puissent se déclencher à nouveau.      |
| Échec de rechargement du registre de hooks            | Restaure les entrées de hooks précédentes et relance.                                                                                      |
| Erreur du watcher                                       | Journalisée via le logger de debug ; la session continue.                                                                                  |

## Tests

### Tests Core

`packages/core/src/extension/extension-runtime-refresh.test.ts`

- retourne tôt sans config ;
- rafraîchit MCP avant les skills/sous-agents/hooks/mémoire ;
- propage les échecs de réconciliation MCP ;
- garde l'échec de rafraîchissement des skills best-effort ;
- propage les échecs de rechargement des hooks après la stabilisation des
  autres branches de rafraîchissement ;
- garde l'échec de la mémoire hiérarchique best-effort.

`packages/core/src/extension/extensionManager.test.ts`

- émet le début/la fin de mutation autour de la désactivation ;
- émet la fin de mutation lorsque la désactivation échoue ;
- émet le début/la fin de mutation autour de l'installation, y compris les
  événements d'activation imbriqués ;
- émet le début/la fin de mutation autour de la désinstallation ;
- émet le début/la fin de mutation autour de l'échec du répertoire
  temporaire de mise à jour ;
- n'émet pas d'événements de mutation pour les changements de favoris ou
  les mises à jour d'horodatage de source ;
- préserve la couverture existante du chargement des extensions, de la
  découverte des commandes, du chargement des hooks et de refreshTools.

`packages/core/src/hooks/hookRegistry.test.ts`

- recharge les hooks configurés ;
- préserve les hooks à portée agent pendant le rechargement ;
- restaure les entrées précédentes lorsque le rechargement des hooks
  configurés échoue.

`packages/core/src/hooks/hookSystem.test.ts`

- délègue le rechargement au registre de hooks.

### Tests CLI

`packages/cli/src/config/extension-refresh-state.test.ts`

- émet les événements de rafraîchissement d'obsolescence une seule fois
  jusqu'à l'effacement ;
- émet les événements de rafraîchissement de contenu ;
- supprime les notifications pendant la suppression de mutation ;
- efface correctement l'état obsolète et les fenêtres de suppression.

`packages/cli/src/config/extension-file-watcher.test.ts`

- classifie les commandes, les skills et les agents comme
  auto-rafraîchissement ;
- classifie les manifestes, les métadonnées d'installation, les hooks, les
  fichiers de contexte et les changements de topologie d'extension comme
  obsolètes ;
- ignore les fichiers inconnus et les répertoires exclus ;
- surveille les sources d'extensions liées ;
- supprime les notifications pendant une mutation programmatique ;
- redémarre la surveillance après la stabilisation de la mutation ;
- gère la création tardive du répertoire d'extensions.

`packages/cli/src/config/extension-runtime-reload.test.ts`

- recharge le cache d'extensions, les outils runtime et les slash commands
  pour `/reload-plugins` ;
- résume les capacités des extensions actives ;
- rafraîchit les composants runtime du contenu ;
- agrège les échecs de l'auto-rafraîchissement de contenu.

`packages/cli/src/ui/commands/reload-plugins-command.test.ts`

- enregistre la commande comme un comportement interactif uniquement ;
- renvoie une erreur lorsque la config est absente ;
- recharge le runtime et efface l'état obsolète en cas de succès ;
- efface l'état obsolète en cas d'échec et renvoie une erreur.

`packages/cli/src/services/BuiltinCommandLoader.test.ts`

- inclut `/reload-plugins` dans le chargement des commandes intégrées.

### Vérification manuelle

La vérification manuelle doit couvrir :

1. Activer une extension depuis l'UI et confirmer que les commandes, les
   skills, les agents, MCP, les hooks et le contexte sont rafraîchis sans
   redémarrage.
2. Désactiver la même extension et confirmer que les capacités runtime sont
   supprimées ou ne sont plus proposées.
3. Éditer un fichier de commande sous `commands/` et confirmer que la
   complétion des slash commands se met à jour automatiquement.
4. Éditer un fichier de skill sous `skills/` et confirmer que la complétion
   des slash commands basés sur des skills se met à jour automatiquement.
5. Éditer un fichier d'agent sous `agents/` et confirmer que le
   comportement du cache d'agents reflète le changement.
6. Éditer `hooks/hooks.json`, `qwen-extension.json`, les métadonnées
   d'installation, les fichiers de contexte ou la topologie du répertoire
   d'extension et confirmer que l'UI demande `/reload-plugins`.
7. Exécuter `/reload-plugins` et confirmer que le résumé signale les
   extensions, les commandes, les skills, les agents, les hooks, les
   serveurs MCP d'extension et les serveurs LSP d'extension.
8. Forcer un échec de rechargement et confirmer que l'UI signale l'erreur,
   puis qu'un changement ultérieur du système de fichiers peut encore
   déclencher une autre notification.

## Compromis

- Les hooks sont traités comme des changements obsolètes au niveau du
  paquet même s'il existe une API de rechargement des hooks configurés.
  Cela évite de changer silencieusement le comportement d'exécution des
  hooks depuis un événement de système de fichiers en arrière-plan.
- Le rafraîchissement MCP reste une réinitialisation complète du runtime.
  Un redémarrage MCP incrémental par extension réduirait le coût mais
  étendrait cette PR à la propriété et à la logique de réconciliation de
  MCP.
- Le watcher classifie les fichiers inconnus comme ignorés au lieu
  d'obsolètes. Cela réduit le bruit pour les artefacts de build mais
  signifie que les auteurs d'extensions doivent placer les fichiers de
  capacité runtime dans les répertoires de convention pris en charge.
- Les racines d'extensions liées sont surveillées directement. Cela
  améliore l'ergonomie d'authoring mais peut augmenter le nombre de
  watchers pour les utilisateurs ayant beaucoup d'extensions liées.

## Travail futur

- Ajouter une réconciliation MCP incrémentale par extension.
- Ajouter des diagnostics visibles par l'utilisateur pour les erreurs
  fatales du watcher comme `ENOSPC` ou `EMFILE`.
- Considérer un résultat de rechargement typé de
  `refreshExtensionRuntime()` si les appelants ont besoin de résumés de
  succès partiel.
- Optimiser la recherche de source d'extensions liées avec une carte de
  racines précalculée si de nombreuses extensions liées deviennent
  courantes.
- Revisiter l'auto-rafraîchissement du contenu des hooks uniquement si le
  rechargement des hooks peut être rendu explicite, observable et
  suffisamment sûr pour une application en arrière-plan.
