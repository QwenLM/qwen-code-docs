# Phase 4b multi-workspaces du démon : workers de canal par workspace

## Résumé

Ce document conçoit la tranche workers de canal de la Phase 4b de l'issue
#6378 : regrouper les workers de canal gérés par le démon par workspace. La
voix (`/workspaces/:workspace/voice/stream`) est une tranche distincte de la
Phase 4b et est hors périmètre ici.

Aujourd'hui, `qwen serve --channel <name>` démarre un unique worker de canal
lié au workspace primaire. En mode multi-workspaces, le worker doit être
groupé par le workspace qui possède chaque canal : chaque workspace enregistré
et fiable reçoit son propre processus worker lié au cwd de ce workspace, à
`QWEN_DAEMON_WORKSPACE`, et à l'overlay d'env effectif. Le pidfile et le
statut du démon gagnent une liste de workers additive tout en conservant les
champs existants à worker unique. `--channel all` reste réservé au primaire en
v1. Le comportement à workspace unique est inchangé.

Modèle de mapping : les canaux sont groupés **implicitement par leur cwd
résolu** — un canal appartient au workspace enregistré vers lequel son cwd
configuré se résout. Aucune nouvelle syntaxe CLI n'est ajoutée.

## Baseline : seam actuel du worker de canal

- `run-qwen-serve.ts` crée un seul `ChannelWorkerSupervisor` dans le callback
  de listen (lié à `boundWorkspace`, le primaire) et le démarre dans
  `completeRuntimeStartup`. `completeRuntimeStartup` est l'unique point de
  convergence de tous les chemins de démarrage du runtime (le chemin eager
  `deps.bridge` et le chemin `startRuntime` -> `buildRuntime`). `deps.bridge`
  est restreint à un seul workspace, donc le multi-workspaces passe toujours
  par `startRuntime`.
- `commands/channel/daemon-worker.ts` valide son propre workspace contre
  `capabilities.workspaceCwd` (le primaire), de sorte qu'un worker non
  primaire lève une exception. `validateChannelWorkspaces` exige en plus que
  le cwd résolu de chaque canal soit égal au workspace du démon.
- `config-utils.ts` résout le cwd d'un canal comme
  `resolvePath(rawConfig.cwd || defaultCwd)` ; `loadChannelsConfig(W)` renvoie
  `loadSettings(W).merged.channels`, qui fusionne les scopes
  système/utilisateur/workspace.
- `channel-worker-supervisor.ts` construit l'env du worker depuis
  `{...process.env}`. En mode multi-workspaces, l'env parent est l'env de base
  du démon (isolation d'env de la Phase 2a), donc il manquerait le propre
  `.env` du workspace.
- Le pidfile `ServiceInfo` est à worker unique (`channels[] / servePid? /
  workerPid?`) ; le statut du démon `runtime.channelWorker` est un snapshot
  unique.
- Le registre de workspaces (construit dans `buildRuntime`) expose
  l'`env.effectiveEnv`, le `trusted`, et le `workspaceCwd` canonique de chaque
  runtime. Le routage des sessions des Phases 2a/3 cible déjà un runtime par
  `workspaceCwd`.

## Algorithme de regroupement

Une fonction pure `resolveChannelWorkspaceGroups` reflète le
`validateChannelWorkspaces` côté worker et la résolution de cwd de
`config-utils` — sinon le regroupement de la couche serve et la propre
validation du worker pourraient diverger. Comme `loadChannelsConfig(W)` est
fusionné entre les scopes, la propriété ne peut pas être décidée par « la
config fusionnée de quel workspace contient le nom ».

Pour chaque `name` de canal sélectionné, itérer sur les workspaces enregistrés
`W`. Si `name` est dans `loadChannelsConfig(W)`, calculer
`resolvedCwd = canonicalizeWorkspace(resolvePath(cfg[name].cwd ?? W))`. `W`
est un propriétaire candidat **si et seulement si `resolvedCwd === W`**
(c'est-à-dire que le canal passerait `validateChannelWorkspaces` sous `W`) :

- `cwd` explicite = un chemin enregistré X : seul `W === X` satisfait ->
  propriétaire = X (sans ambiguïté).
- pas de `cwd`, défini uniquement dans le propre scope d'un workspace
  (`/B/.qwen/settings.json`) : apparaît seulement dans la config fusionnée de
  B et se résout vers B -> propriétaire = B (sans ambiguïté).
- pas de `cwd`, défini dans le scope utilisateur/système : satisfait sous
  chaque W -> propriétaires multiples -> véritablement ambigu.
- `cwd` explicite = un chemin non enregistré : aucun W ne satisfait -> zéro
  propriétaire.

Erreurs et agrégation :

- zéro propriétaire -> `channel_workspace_mismatch` (non configuré, ou le cwd
  pointe vers un workspace non enregistré).
- plus d'un propriétaire -> `ambiguous_channel_workspace` (un canal de scope
  utilisateur/système sans `cwd` ; l'opérateur doit le borner à un workspace
  ou ajouter un `cwd` explicite).
- propriétaire non fiable -> `untrusted_workspace` (un canal a besoin de créer
  des sessions).
- propriétaire fiable unique -> regrouper les noms par propriétaire -> chaque
  groupe reçoit `{mode:'names', names}`.
- `mode:'all'` -> primaire uniquement :
  `[{ workspaceCwd: primary, selection: {mode:'all'} }]`. Le worker primaire
  charge les canaux fusionnés du primaire ; les entrées dont le cwd n'est pas
  le primaire conservent le comportement d'erreur existant de
  `validateChannelWorkspaces`.
- workspace unique (primaire seulement) : `resolvedCwd` ne peut être que le
  primaire, produisant exactement le même groupe unique qu'aujourd'hui.

Un helper de cwd partagé est utilisé par le parsing de la configuration et le
regroupement de propriété. Les chemins absolus explicites et `~/...`
conservent leur signification existante ; les chemins relatifs ordinaires se
résolvent contre le workspace dont les paramètres sont chargés. Le chemin du
propriétaire est ensuite canonicalisé, de sorte que la couche serve et le
worker ne puissent pas diverger sur la propriété.

## Identité et env du worker

`CreateChannelWorkerSupervisorOptions` gagne un `workerBaseEnv` optionnel
(défaut `process.env`). `createWorkerEnv` utilise `workerBaseEnv ?? process.env`
comme base ; tout le reste est inchangé (`QWEN_DAEMON_WORKSPACE`, nettoyage de
l'env du token, injection du token du démon). Le gestionnaire de groupe passe
`runtime.env.effectiveEnv ?? process.env` — lire le champ directement évite
d'importer un helper privé depuis `server.ts`, et un runtime en mode processus
parent (workspace unique) a `effectiveEnv` indéfini, retombant sur
`process.env` exactement comme aujourd'hui.

## Correction de la validation du daemon-worker

`DaemonCapabilitiesLike` gagne un
`workspaces?: Array<{ cwd; id; primary; trusted }>` optionnel (déjà publié par
`/capabilities` depuis la Phase 2a). La validation résout
`daemonWorkspace = canonicalizeWorkspace(opts.workspace)` ; lorsque
`capabilities.workspaces` est présent, il doit correspondre à l'un d'entre eux
et être fiable, sinon elle retombe sur la vérification historique
`== capabilities.workspaceCwd` pour les vieux démons à workspace unique. Les
deux côtés sont canoniques (le superviseur passe `runtime.workspaceCwd`), donc
la comparaison est stable. Le reste du worker (chargement de la configuration
des canaux, `validateChannelWorkspaces`,
`createOrAttach({workspaceCwd})`) fonctionne déjà avec le routage
multi-workspaces.

## Gestionnaire de groupe du superviseur

Un `ChannelWorkerGroup` fin possède une
`Map<workspaceId, ChannelWorkerSupervisor>` :

- construite depuis les groupes résolus et le registre ; chaque superviseur
  est lié au `workspaceCwd`, à la sélection, et à l'`env.effectiveEnv` de son
  runtime, et est créé via la même fabrique injectable que celle utilisée par
  le worker unique.
- `start()` lance les superviseurs séquentiellement et fait un rollback de
  ceux déjà démarrés si un lancement ultérieur échoue. `stop()` attend tout
  redémarrage en cours et arrête tous les superviseurs. `killAllSync()` reste
  le fallback du gestionnaire de signaux.
- `restart()` est la transaction de rechargement à l'échelle du démon. Les
  requêtes concurrentes coalescent ; les superviseurs redémarrent
  séquentiellement, et tout échec arrête le groupe entier pour éviter une
  flotte partiellement rechargée.
- `snapshots()` renvoie des snapshots par workspace (`ChannelWorkerSnapshot &
  { workspaceId; workspaceCwd; primary }`) ; `primarySnapshot()` soutient les
  champs historiques à worker unique.
- le `onReady` / `onExit` de n'importe quel superviseur déclenche une
  réécriture complète du pidfile depuis `snapshots()` (jamais une mise à jour
  incrémentale d'une seule entrée — voir ci-dessous).

## Schéma du pidfile et concurrence

`ServiceInfo` gagne un
`workers?: Array<{ workspaceId?; workspaceCwd?; channels: string[]; workerPid? }>`
optionnel. Le `channels` de premier niveau devient l'union des canaux de tous
les workers, et le `workerPid` de premier niveau reste le pid du worker
primaire, de sorte que les vieux lecteurs (`qwen channel status`, qui ne lit
que `workerPid` et `channels`) ne sont pas affectés.

Concurrence : avec N workers, les callbacks `onReady`/`onExit` se déclenchent
en concurrence. Une lecture-modification-écriture d'une seule entrée perdrait
des mises à jour. À la place, l'écrivain prend l'ensemble complet des
snapshots du groupe et effectue une seule réécriture complète synchrone.
`writeServeServiceInfo` utilise `openSync`/`writeSync` synchrones sans
`await`, donc une écriture de snapshot complet est suffisamment atomique — la
dernière écriture détient toujours le tableau complet. `writeServeServiceInfo`
gagne un paramètre `workers` optionnel écrit tel quel sous la garde existante
`O_RDWR + O_NOFOLLOW` + propriété serve ; `parseServiceInfo` valide
optionnellement `workers?` et le transmet.

## Schéma du statut du démon

`DaemonStatusRuntime` gagne un
`channelWorkers?: Array<ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }>`
optionnel ; le `channelWorker` requis reste le snapshot du groupe primaire
pour les vieux clients. Le getter (`getChannelWorkerSnapshots`) est transmis
depuis `run-qwen-serve` à travers `ServeAppDeps` et
`BuildDaemonStatusOptions`, en miroir du chemin `getChannelWorkerSnapshot`
existant, et est également exposé dans le statut de bootstrap. Avant la
création du groupe (avant le démarrage), il rapporte le snapshot désactivé.

## Orchestration et timing

- La variable unique `channelWorker` devient une référence au gestionnaire de
  groupe dans le scope externe, de sorte que l'écrivain du pidfile et les
  chemins d'arrêt la voient toujours.
- Fail-fast précoce : au moment de listen (avant `buildRuntime`), la fonction
  pure de regroupement s'exécute une fois contre `workspaceInputs` +
  `loadSettings` + la confiance gelée au démarrage
  (`getWorkspaceTrustStatus`). Une propriété de cwd inconnue, ambiguë, non
  fiable ou invalide rejette le démarrage avant qu'un handle utilisable soit
  exposé. Le plan de groupes résolu est gelé pour le reste du démarrage ; les
  paramètres ne sont pas regroupés plus tard sous un snapshot de système de
  fichiers différent.
- La création/démarrage réels passent dans `completeRuntimeStartup` : il lit
  le registre depuis `runtimeApp.locals.workspaceRegistry` (garanti présent
  pour le multi-workspaces, qui passe toujours par `startRuntime` ->
  `buildRuntime`), construit un superviseur par groupe gelé, et les démarre —
  remplaçant le `channelWorker.start()` unique.
- L'app runtime nouvellement construite est publiée et attachée aux transports
  ACP avant que les superviseurs de canal ne démarrent. Les workers exigent la
  route `/capabilities` du runtime pendant le bootstrap et peuvent recevoir du
  trafic de canal dès qu'ils se connectent, donc leurs routes de session du
  démon doivent déjà être disponibles. Cela correspond à l'ordre existant à
  workspace unique sur `main` ; `runtimeReady` ne se résout toujours qu'après
  que chaque superviseur demandé a atteint ready.
- Un échec de démarrage d'un worker de canal reste fatal. La publication du
  runtime est retirée avant que le groupe, le pidfile, les bridges et le
  listener ne soient démantelés ; un timeout de démarrage du runtime pendant
  la phase du worker suit le même chemin plutôt que de laisser un démon en
  écoute derrière. L'annulation du groupe empêche également un superviseur de
  workspace ultérieur de se lancer après le début de ce démantèlement.
- La réservation du pidfile conserve les noms de canaux agrégés ; les chemins
  d'arrêt (`stopChannelWorkerAfterFailedStartup`, `killAllSync`, arrêt normal)
  se diffusent vers le groupe.

Risque de régression : pour un workspace unique, le timing de création passe
du callback de listen à `completeRuntimeStartup`. Les tests de canal
existants de `run-qwen-serve.test.ts` (fabrique injectée, pidfile au ready,
kill forcé au second signal) doivent rester verts. La couverture de
l'orchestration multi-workspaces sonde également la route `/capabilities` du
démon live depuis le démarrage du superviseur, de sorte que l'ordre
runtime/worker ne puisse pas régresser derrière une fabrique injectée
ready-only.

## Comportement au démarrage

- workspace unique : identique à aujourd'hui.
- multi-workspaces + `--channel names` : groupé par propriétaire, un worker
  par workspace fiable ; zéro / plusieurs propriétaires / non fiable -> une
  erreur de démarrage claire (pas d'activation partielle).
- multi-workspaces + `--channel all` : worker primaire uniquement, avec une
  note stderr indiquant que les canaux non primaires ne sont pas hébergés.

## Compatibilité et limitations

- le workspace unique est inchangé ; les vieux lecteurs de pidfile/statut
  conservent `channels`/`workerPid`/`channelWorker`.
- conseil aux opérateurs : pour héberger un canal dans un workspace non
  primaire, définissez-le dans le propre `.qwen/settings.json` de ce workspace
  (aucun `cwd` nécessaire) ou définissez-le dans n'importe quel scope avec un
  `cwd` explicite égal au chemin du workspace. Un canal de scope
  utilisateur/système sans `cwd` doit être désambiguïsé en mode
  multi-workspaces, sinon le démarrage du démon échoue.
- limitations v1 : les canaux ambigus/de même nom nécessitent une future
  syntaxe explicite ; `--channel all` est réservé au primaire ; le rayon de
  défaillance du démon unique couvre les workers de tous les workspaces ; un
  seul token de démon couvre tous les workspaces.

## Questions ouvertes

- Les canaux ambigus devraient-ils être résolubles via une syntaxe explicite
  `--channel <workspace>:<name>` au lieu d'une erreur au démarrage ?
- `--channel all` devrait-il à terme se diffuser sur tous les workspaces ?

## Hors périmètre

- la voix `/workspaces/:workspace/voice/stream` et la voix par workspace.
- l'ajout/retrait dynamique de workspace (Phase 5).
