# Phase 4 multi-workspaces du démon : ACP qualifié par workspace

## Résumé

Ce document conçoit la Phase 4 de l'issue #6378 : l'ACP qualifié par workspace
pour `qwen serve`. Il s'appuie directement sur la branche REST qualifiée par
workspace de la Phase 3 (`codex/phase3-workspace-qualified-rest`, PR #6567),
qui n'est **pas encore fusionnée** (état `CHANGES_REQUESTED`). La Phase 4
monte un endpoint ACP par workspace sur `/workspaces/:workspace/acp`, donne à
chaque runtime de workspace son propre dispatcher ACP et son propre état de
connexion, et permet au Web Shell de choisir un workspace depuis
`/capabilities`. L'`/acp` historique reste lié au runtime primaire, de sorte
que le Web Shell et les clients ACP existants ne sont pas affectés.

La Phase 4 est limitée au transport ACP (Streamable HTTP + le WebSocket `/acp`
inverse, ses méthodes de workspace reflétées, et le MCP/CDP inverse). La voix
(`/workspaces/:workspace/voice/stream`) et les workers de canal gérés par le
démon sont la **Phase 4b** ; l'ajout/retrait dynamique de workspace est la
**Phase 5**. Aucun des deux n'est dans le périmètre ici.

La conclusion centrale de l'investigation des seams : la Phase 4 est
principalement un changement de _câblage et de routage_, pas une réécriture.
`AcpDispatcher` est déjà lié à un workspace par construction, sa vérification
de cohérence de `workspaceCwd` existe déjà, la Phase 3 a déjà rendu la surface
REST reflétée par runtime, et `clientMcpSenderRegistry` est déjà un champ par
runtime. Le vrai travail est (1) transformer le montage ACP unique en un
dispatcher par runtime (chacun avec sa propre remember-lane ; toujours un seul
appel `mountAcpHttp` et un seul listener d'upgrade ; un `AcpHttpHandle` qui
possède les registres de tous les runtimes), (2) étendre ce listener d'upgrade
WebSocket pour dispatcher par chemin d'URL, (3) garder le registre de
device-flow global au démon et partagé entre tous les montages (avec un
fan-out best-effort des event-sinks vers le bridge de chaque runtime fiable),
et (4) synchroniser le nouveau tag de capacité `workspace_qualified_acp` à
travers les types de capacités du SDK/CLI et les tests.

## Rework systématique (durcissement, PR #6621)

La revue a fait remonter un critique : une itération antérieure rendait le
registre de device-flow par runtime, ce qui laissait les montages secondaires
non authentifiés (`device_flow "not configured"`). Le montage ACP a été
retravaillé selon huit axes ; l'architecture finale est :

1. **Fabrique de montages ACP par runtime.** Un seul appel `mountAcpHttp`
   possède un `primaryMount` plus une map `secondaryMounts` (un
   `RuntimeAcpMount` par runtime non primaire), chacun portant un flag
   `primary`. HTTP et WS résolvent tous deux un montage par sélecteur et
   délèguent à des gestionnaires partagés.
2. **Routage + isolation des connexions.** Le sélecteur pluriel alias le
   workspace primaire vers `primaryMount`, et résout autrement un montage par
   runtime. Les workspaces non primaires non fiables sont rejetés (403) sur
   les chemins HTTP et WS avant que tout enfant soit lancé.
3. **Parsing WS brut de la request-target.** Le listener d'upgrade analyse la
   request-target brute (pas `new URL().pathname`, qui normalise `%2e%2e`), de
   sorte qu'un sélecteur à segments point / backslash non normalisé est
   détruit avant le routage.
4. **Device-flow global au démon + fan-out.** Le registre de device-flow reste
   une instance unique du démon (les identifiants OAuth sont globaux au
   processus). Les montages secondaires le partagent via
   `opts.deviceFlowRegistry` ; les événements d'auth-flow sont diffusés en
   best-effort vers le bridge de chaque runtime fiable
   (`resolveEventBridges`).
5. **CDP + client-MCP primaires uniquement.** Les revendications de tunnel CDP
   sont soumises à la porte `activeMount.primary` ; le POST pluriel renvoie la
   promesse de dispatch.
6. **Porte de cycle de vie disposed.** Après `dispose()`, les gestionnaires
   HTTP partagés renvoient `503 server_disposed` au lieu de faire la course
   avec des registres démantelés pendant le drain d'arrêt. `dispose()` est
   idempotent.
7. **Observabilité agrégée.** `AcpHttpHandle.getSnapshot()` additionne les
   comptages de connexions et de flux WS à travers le primaire et tous les
   montages secondaires, de sorte que les métriques du démon rapportent toutes
   les connexions ACP de tous les workspaces, pas seulement celles du
   primaire.
8. **Annonce de capacité.** `resolveAcpHttpEnabled()` est l'unique
   interprétation de `QWEN_SERVE_ACP_HTTP` ; `workspace_qualified_acp` est
   annoncé uniquement lorsque la surface ACP HTTP est activée **et** que les
   sessions multi-workspaces sont actives.

## Durcissement des seams après revue

L'architecture de montage ci-dessus reste inchangée. La passe de réparation
finale comble six trous de frontière sans remplacer `AcpHttpHandle` ni
introduire un nouveau module de politique de routes.

1. **Une seule décision de disponibilité des routes qualifiées.** L'ACP
   qualifié par workspace est prêt uniquement lorsque l'ACP HTTP est activé et
   que le registre de workspaces contient plus d'un runtime. L'enregistrement
   des routes HTTP, la reconnaissance des chemins WebSocket, l'annonce de
   capacité, et l'exemption du rate-limiter externe doivent s'accorder avec
   cette décision. Les démons à workspace unique continuent de n'exposer que
   l'`/acp` historique.
2. **Une seule imputation de rate-limit.** Le limiter Express externe exempte
   précisément un chemin de transport `/workspaces/<sélecteur-unique>/acp`
   activé, y compris le comportement existant de casse et de slash final de la
   route. Les chemins voisins restent limités. Le transport ACP reste
   responsable de l'application du palier de méthodes JSON-RPC, de sorte qu'un
   prompt qualifié ne consomme que le bucket de prompts plutôt que les deux
   buckets mutation et prompt.
3. **Échec structuré des chemins malformés.** Les échecs de décodage de
   paramètres de route Express qui sont à la fois des instances de `URIError`
   et marqués du statut HTTP 400 renvoient un `400 invalid_request`
   structuré. Les autres valeurs `URIError` levées et les échecs sans rapport
   conservent le traitement générique 500. Le chemin WebSocket conserve sa
   réponse 400 explicite existante.
4. **Sélecteurs sûrs pour les logs.** Un sélecteur décodé utilisé dans un log
   de rejet WebSocket destiné aux opérateurs passe par le sanitiseur `logSafe`
   existant, de sorte que des contrôles de terminal encodés ne puissent pas
   forger ni scinder des lignes de stderr.
5. **Disposition terminale.** `dispose()` est une transition de cycle de vie
   irréversible. Après son exécution, `attachServer()` ne peut pas recréer un
   serveur WebSocket ou un listener d'upgrade. Les appels répétés à `dispose()`
   et `attachServer()` restent inoffensifs.
6. **Diagnostics complets attribués par workspace.** Le snapshot ACP agrégé
   gagne des diagnostics de connexion additifs décorés avec `workspaceId`,
   `workspaceCwd` et `primary`. Les compteurs de résumé restent inchangés, le
   `registry` primaire public reste disponible pour la compatibilité, et le
   `detail=full` du démon lit la liste agrégée des connexions. Le plafond de
   connexions existant reste une limite par montage, car chaque montage est
   construit avec le même plafond configuré.

Chaque contrat est fixé par un test de régression écrit avant son changement
en production. La vérification inclut les suites ACP ciblées, de rate-limit,
de daemon-status et de serve-server plus le build, le typecheck, le lint, et
la vérification de clôture du bundle du fast-path de serve.

## Dépendances à la Phase 3 (non fusionnée)

La Phase 4 consomme ces seams de la Phase 3. Comme la PR #6567 est
`CHANGES_REQUESTED`, traitez-les comme _à stabiliser_ ; l'implémentation de la
Phase 4 devra rebaser sur la Phase 3 fusionnée.

- `packages/cli/src/serve/workspace-route-runtime.ts` :
  - `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, selector)` —
    fonction pure, renvoie `WorkspaceRuntime | undefined`. **Réutilisable par
    le listener d'upgrade WS** (voir Questions ouvertes).
  - `resolveWorkspaceRuntimeFromParam(registry, req, res, param)` — liée à
    Express (écrit `res.status().json()`). **Utilisable pour les routes HTTP
    ACP, pas pour le chemin d'upgrade WS** (le listener d'upgrade n'a qu'un
    `IncomingMessage` brut + une `socket`, pas de `res` Express).
  - `requireTrustedWorkspaceRuntime(runtime, res)` — porte de confiance liée à
    Express, réutilisée par les routes HTTP ACP.
  - `isPortableAbsolutePath` / `sendWorkspaceMismatch` — réutilisés pour le
    parsing des sélecteurs et la forme des erreurs.
- Les gestionnaires REST par runtime enregistrés dans `server.ts`
  (`registerWorkspaceQualified{FileRead,FileWrite,Trust,Status,Permissions,Settings,Lifecycle,McpControl,Tools}Routes`).
  Le dispatcher ACP reflète ces surfaces ; la Phase 4 repose sur l'existence
  de leur comportement par runtime.
- `/capabilities` `workspaces[]` (Phase 2a), construit dans
  `packages/cli/src/serve/routes/capabilities.ts` (L79-84) et reflété dans
  `packages/cli/src/serve/daemon-status.ts` (L432-437) avec `id` / `cwd` /
  `primary` / `trusted` par runtime. Les déclarations de feature-flags et
  leurs prédicats d'annonce/activation vivent dans
  `packages/cli/src/serve/capabilities.ts`.

## Baseline : seam ACP actuel (arbre de la Phase 3)

- `mountAcpHttp(app, primaryBridge, opts)` dans
  `packages/cli/src/serve/acp-http/index.ts` est appelé une seule fois depuis
  `server.ts` (L1226-1275) avec des entrées **toutes primaires** :
  `primaryBridge`, `primaryBoundWorkspace`, `primaryWorkspace`,
  `primaryRouteFileSystemFactory`, le `deviceFlowRegistry` global à l'app,
  `primaryRuntime.clientMcpSenderRegistry`, et `primaryRuntime.env` (pour
  l'`extraWsRoute` de la voix).
- Un dispatcher par montage : `mountAcpHttp` construit un unique
  `AcpDispatcher` et une unique `ConnectionRegistry`, et renvoie un
  `AcpHttpHandle` dont le `registry` est ce registre unique et dont
  `attachServer` installe exactement un seul listener
  `httpServer.on('upgrade', ...)` (index.ts L1536, L1555). `dispose` retire ce
  seul listener et ferme ce seul registre (index.ts L1543-1553).
- **Un seul listener d'upgrade WebSocket** (index.ts `setupWebSocket`,
  gestionnaire d'upgrade à L903-1045). Il est installé une fois via
  `AcpHttpHandle.attachServer(server)` après `listen()`. Il :
  - analyse l'URL d'upgrade,
  - rejette tout chemin qui n'est pas `opts.path` (`/acp`), ni `/cdp`, ni une
    entrée des `extraWsRoutes` — `socket.destroy()` sur chemin inconnu
    (index.ts L935-939),
  - exécute les vérifications de sécurité partagées (loopback, allowlist
    d'hôtes, CSRF/origin, bearer token) pour **tous** les chemins,
  - puis bifurque : `/cdp` -> `attachCdpClient` ; `extraRoute` ->
    `onConnection` ; sinon le handshake d'initialisation ACP.
  - Le commentaire de doc à L328-337 est explicite : un second listener
    `'upgrade'` ne peut pas coexister, car celui-ci détruit les chemins
    inconnus. La Phase 4 doit étendre ce seul listener, pas en ajouter un
    autre.
- `AcpDispatcher` (dispatch.ts L644-656) est déjà lié au workspace par le
  constructeur : `bridge`, `boundWorkspace`, `workspace`,
  `workspaceRememberLane`, `fsFactory?`, `deviceFlowRegistry?`,
  `sessionShellCommandEnabled`, `registry?`, `archiveCoordinator`. Chaque
  méthode de workspace reflétée qu'il sert lit ces champs, donc lier un
  dispatcher à un runtime borne automatiquement fichier / permissions /
  paramètres / confiance / outils / mcp / mémoire / agents / auth à ce
  runtime.
- Deux de ces dépendances du dispatcher sont aujourd'hui des instances uniques
  liées au primaire :
  `workspaceRememberLane = new WorkspaceRememberTaskLane(primaryBridge)`
  (server.ts L816) et `archiveCoordinator = new SessionArchiveCoordinator()`
  (server.ts L596). `sessionShellCommandEnabled` est une politique globale,
  sans risque à partager.
- La vérification de cohérence existe déjà : `parseRequestedWorkspace`
  (dispatch.ts L694-697) lève `WorkspaceMismatchError` lorsque le
  `workspaceCwd` d'une requête n'est pas égal à `this.boundWorkspace` ;
  l'erreur correspond à `INVALID_PARAMS` (L577).
- `WorkspaceRuntime` (workspace-registry.ts L28-38) porte
  `clientMcpSenderRegistry` par runtime mais n'a **pas de champ
  `deviceFlowRegistry`** — le device-flow est toujours global à l'app
  (`setupDeviceFlowRegistry({ app, bridge })` à server.ts L609, lié au bridge
  primaire).

## Architecture : montage ACP par runtime

Conserver l'option B : un démon, N runtimes de workspace indépendants. Pour
l'ACP :

- Chaque runtime enregistré reçoit son propre `AcpDispatcher` +
  `ConnectionRegistry` + fabrique de fournisseur MCP inverse, tous liés au
  `bridge` / `workspace` / `routeFileSystemFactory` /
  `clientMcpSenderRegistry` / `env` de ce runtime. Chaque dispatcher reçoit le
  même registre de device-flow global au démon.
- L'`/acp` historique reste lié au dispatcher du runtime primaire
  (comportement filaire inchangé).
- Le nouveau `/workspaces/:workspace/acp` est lié au dispatcher du runtime
  résolu.
- **Invariant : `mountAcpHttp` est toujours appelé exactement une fois** et
  installe exactement un seul listener `httpServer.on('upgrade', ...)`. Il
  passe de « bridge unique + opts » à accepter le `WorkspaceRegistry` (plus
  les préoccupations partagées hors workspace : token, allowedOrigins,
  hostname, `checkRate`, `sessionShellCommandEnabled`,
  `cdpTunnelRegistry`). En interne il construit une
  `Map<workspaceId, RuntimeAcpMount>` ; l'entrée primaire reste adressable par
  le chemin `/acp` historique.
- Chaque `RuntimeAcpMount` est construit avec le propre `bridge`, `workspace`,
  `routeFileSystemFactory`, `clientMcpSenderRegistry`, `env` de ce runtime,
  une nouvelle `WorkspaceRememberTaskLane(runtime.bridge)` par runtime, son
  `AcpDispatcher`, et sa `ConnectionRegistry`. Le registre de device-flow
  global au démon, `archiveCoordinator`, et `sessionShellCommandEnabled` sont
  partagés.
- Les quatre points d'entrée de dispatch doivent sélectionner le montage du
  runtime résolu, pas celui du primaire : `POST`, `GET` (SSE), et `DELETE` sur
  le chemin pluriel (Express, via `resolveWorkspaceRuntimeFromParam` ;
  aujourd'hui chacun ferme sur le dispatcher unique à index.ts
  L533/L675/L849), plus la branche d'upgrade WS (ci-dessous). Les
  POST/GET/DELETE/upgrade de l'`/acp` historique continuent de dispatcher vers
  le primaire.
- `AcpHttpHandle` doit passer d'un `registry` unique à la possession du
  dispatcher + `ConnectionRegistry` de chaque runtime ; `dispose` les ferme
  tous et retire l'unique listener d'upgrade.
- Cycle de vie des sessions : les `session/new` / `load` / `resume` ACP sur un
  montage pluriel doivent déclencher les mêmes callbacks de cycle de vie
  `register` / `remove` du bridge qui alimentent le
  `WorkspaceSessionOwnerIndex` de la Phase 2b (workspace-registry.ts
  L48-119). Une session créée via `/workspaces/B/acp` doit ensuite être
  découvrable par les lectures REST routées par propriétaire (context, stats,
  etc.) et vice versa. La Phase 2b a déjà borné cet index pour couvrir « REST
  et le dispatcher ACP ultérieur » ; la Phase 4 est le moment où le côté ACP
  est réellement câblé.

## Dispatch de l'upgrade WebSocket (design central)

Le listener d'upgrade est le seul endroit où le routage ACP n'est pas piloté
par Express, il a donc besoin d'un traitement de chemin explicite.

- Conserver les vérifications de sécurité partagées (loopback / allowlist
  d'hôtes / CSRF / bearer) exactement telles quelles, appliquées uniformément
  avant toute résolution de workspace.
- Étendre la classification des chemins. Aujourd'hui :
  `pathname === '/acp' | '/cdp' | extraRoute`. La Phase 4 ajoute une branche
  pour `/workspaces/:workspace/acp` :
  1. Faire correspondre le préfixe et extraire le segment brut du sélecteur
     `:workspace`.
  2. Résoudre avec la fonction pure
     `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, decodeURIComponent(selector))`
     (id d'abord, puis cwd canonique encodé, en correspondance avec le
     résolveur REST).
  3. Sans correspondance : rejeter l'upgrade avec une fermeture de classe 400
     (`socket.write('HTTP/1.1 400 ...')` + `destroy()`), en miroir du
     `workspace_mismatch` REST. Aucun fallback vers le primaire.
  4. Avec correspondance : exécuter le handshake d'initialisation ACP contre
     le dispatcher + `ConnectionRegistry` du runtime résolu (pas ceux du
     primaire).
- Le `/cdp` inverse et les `extraWsRoutes` de la voix restent liés au primaire
  en Phase 4 (la voix est 4b). La branche `/cdp` est inchangée.
- L'upgrade de l'`/acp` historique continue de se lier au dispatcher primaire.
- `%2F` dans le sélecteur de cwd encodé : le démon analyse lui-même l'URL
  d'upgrade brute (`new URL(req.url, ...)`), donc il n'est pas soumis au
  décodage de chemin d'Express, mais les proxies inverses peuvent tout de même
  normaliser `%2F`. Il est recommandé d'utiliser le sélecteur basé sur `id`
  pour le WS dans les déploiements derrière proxy (même conseil que les REST
  des Phases 2b/3). Les routes HTTP plurielles réutilisent plutôt
  `resolveWorkspaceRuntimeFromParam`, qui lit `req.params` (Express décode une
  fois), de sorte qu'elles héritent gratuitement du traitement des sélecteurs
  encodés de la Phase 3.
- Observabilité : le chemin d'upgrade WS et son dispatch ACP contournent les
  middlewares Express, donc la télémétrie/les logs du démon doivent tamponner
  explicitement le workspace résolu ici (la même raison pour laquelle
  `checkRate` est transmis via `opts`) ; le hachage du workspace au temps de
  la requête de la Phase 1 ne couvre que les routes Express.

## Registre de device-flow par runtime (remplacé — voir « Rework systématique » axe 4)

> **Remplacé.** Cette section est le design d'avant le rework (un registre de
> device-flow par runtime). La revue a constaté qu'il laissait les montages
> secondaires non authentifiés, donc l'implémentation livrée conserve à la
> place un registre unique global au démon partagé par tous les montages avec
> un fan-out best-effort des event-sinks — voir l'axe 4 du « Rework
> systématique » ci-dessus. Les sous-sections ci-dessous sont conservées
> uniquement comme contexte d'historique de design et ne décrivent pas le
> comportement livré.

Le device-flow est la seule surface reflétée qui est encore globale à l'app et
doit changer.

- Ajouter `deviceFlowRegistry` à `WorkspaceRuntime` (ou en construire un par
  runtime dans `mountAcpHttp`). Le dispatcher de chaque runtime reçoit son
  propre registre.
- `setupDeviceFlowRegistry` doit être invoqué par runtime (lié au bridge/env
  de ce runtime), pas une seule fois contre le bridge primaire.
- Les routes/méthodes d'auth qualifiées par workspace
  (`GET/DELETE /workspaces/:workspace/auth/device-flow/:id` et les méthodes
  ACP `_qwen/workspace/auth/device_flow/*`) doivent résoudre le registre du
  runtime cible et rejeter/masquer les flux qui appartiennent à un autre
  workspace.
- L'arrêt doit disposer le registre de chaque runtime, pas seulement
  `app.locals.deviceFlowRegistry`.
- Les callbacks d'installation du fournisseur d'auth sont déjà à portée
  `boundWorkspace` dans le dispatcher ; des dispatchers par runtime rendent
  cela correct automatiquement. Les routes d'auth primaires historiques
  continuent d'écrire sur le primaire.

## Surface miroir du dispatcher (liaison au runtime)

Le WS `/acp` inverse reflète une large surface REST (index.ts
`WS_READ_METHODS` L186-219 et les méthodes vendor de dispatch.ts) : lecture de
fichier/list/glob/stat, mcp / skills / providers / env / preflight / trust /
permissions / voice / tools / agents / memory / auth de workspace, groupes de
sessions, setup-github. Comme toutes lisent les champs du constructeur du
dispatcher, lier un dispatcher à un runtime les borne gratuitement. La Phase 4
ne les réimplémente **pas** ; elle garantit seulement que le dispatcher de
chaque runtime est construit avec les dépendances de ce runtime. Cet ensemble
inclut explicitement le `deviceFlowRegistry` et la
`WorkspaceRememberTaskLane` par runtime : si l'un des deux reste le singleton
primaire, les appels non primaires `_qwen/workspace/memory/remember` et
`auth/device_flow` s'exécuteraient silencieusement contre le bridge primaire.

Garantie de cohérence : puisque chaque dispatcher monté est lié à un runtime
et que `parseRequestedWorkspace` lève déjà `WorkspaceMismatchError` lorsque le
`workspaceCwd` d'une requête diffère de `boundWorkspace`, un client qui se
connecte à `/workspaces/A/acp` mais envoie `workspaceCwd: B` dans les
paramètres est rejeté. La Phase 4 devrait ajouter un test qui l'affirme, et
confirmer que la même garde couvre `session/new`
(`parseOptionalWorkspaceCwd`, dispatch.ts L1059).

## Isolation du MCP / CDP inverse

- Canal d'outils inverse : la `clientMcpProviderFactory` ferme actuellement
  sur `primaryRuntime.clientMcpSenderRegistry` + `primaryBridge` (server.ts
  L1252-1257). Les montages par runtime construisent la fabrique à partir du
  `clientMcpSenderRegistry` + `bridge` _du runtime résolu_, de sorte qu'une
  connexion WS sur `/workspaces/B/acp` enregistre les serveurs MCP hébergés
  par le client uniquement dans le runtime de B.
- La `ClientMcpWsConnection` et le `cdpEndpoint` par connexion restent par
  connexion ; ils s'attachent simplement au dispatcher du runtime
  propriétaire.
- Tunnel CDP : `cdpTunnelRegistry` est à portée processus et le bridge CDP est
  revendiqué par une connexion `/acp` d'extension dont
  `clientInfo.name === 'qwen-cdp-bridge'`. La Phase 4 conserve la
  revendication CDP sur l'`/acp` historique (primaire) comme défaut
  pragmatique ; le CDP à portée de workspace est signalé comme Question
  ouverte plutôt que résolu ici, car un unique client puppeteer loopback + un
  endpoint `/cdp` ne se mappe pas proprement sur N runtimes. Concrètement,
  les `RuntimeAcpMount`s non primaires doivent laisser la branche
  `cdpTunnelOverWs` / `/cdp` et l'enregistrement runtime-MCP `chrome-devtools`
  désactivés ; seul le montage primaire les câble.

## Porte de confiance

- Les workspaces enregistrés non fiables restent visibles/en lecture seule
  mais ne doivent pas lancer d'enfant. Sur `/workspaces/:workspace/acp`, les
  opérations accordant la propriété (`session/new`, `session/load`,
  `session/resume` ; dispatch.ts `CONN_ROUTED_METHODS` L239-243) doivent
  rejeter avec une erreur `untrusted_workspace` et ne pas lancer, en
  correspondance avec la sémantique REST 403 `untrusted_workspace` déjà
  implémentée dans `routes/session-runtime.ts` (L39-53) et `routes/session.ts`
  (portes de confiance de création/chargement/reprise de session plus
  `session_workspace_conflict`).
- Réutiliser la décision de confiance que la Phase 3 expose via
  `requireTrustedWorkspaceRuntime` pour les routes HTTP ACP ; pour le chemin
  WS, la vérification équivalente s'exécute sur le flag `trusted` du runtime
  résolu avant que le handshake n'accorde une session.
- La confiance gelée au démarrage est la baseline de la Phase 2a ; les
  basculements de confiance au runtime (drain/arrêt de l'enfant ACP du
  workspace + effacement de son index de sessions à la révocation) restent
  alignés avec la phase de mutation de confiance qui arrivera, et ne sont pas
  réimplémentés ici.

## Capacités et sélecteur du Web Shell

- Ajouter un feature flag ACP (par ex. `workspace_qualified_acp`) dans
  `packages/cli/src/serve/capabilities.ts` (déclaration du flag + prédicat
  d'annonce/activation), annoncé uniquement lorsque plus d'un runtime est
  enregistré et que l'ACP est activé (en miroir du gating de
  `multi_workspace_sessions` à capabilities.ts L408-409). Si la Phase 4 arrive
  en plusieurs PRs, ne pas annoncer le tag tant que la boucle ACP plurielle
  complète (HTTP + WS + device-flow + câblage de l'index de propriétaires)
  n'est pas terminée, afin que les clients ne construisent jamais d'URL
  `/workspaces/:id/acp` contre une surface à moitié câblée (même philosophie
  de garde contre l'activation partielle que la gate de fonctionnalité de la
  Phase 2a). Mettre à jour la note sur `workspace_qualified_rest_core`
  (L264-271) qui dit actuellement « ACP/WebSocket, auth, voice et extensions
  restent sur leurs routes de workspace primaire existantes dans cette phase. »
- Ajouter le tag n'est pas local à `capabilities.ts`. Il doit être synchronisé
  avec : le constructeur de réponse `/capabilities` dans
  `routes/capabilities.ts`, les types de capacités du SDK
  (`packages/sdk-typescript/src/daemon/types.ts`), les types serve du CLI
  (`packages/cli/src/serve/types.ts`), et l'assertion de feature-set dans
  `server.test.ts` (L376-381). C'est un travail requis de la Phase 4, pas
  optionnel.
- `workspaces[]` existe déjà (Phase 2a), construit dans
  `routes/capabilities.ts` (L79-84) et `daemon-status.ts` (L432-437) avec
  `id` / `cwd` / `primary` / `trusted` par runtime. Le Web Shell le lit et
  construit des URL de connexion `/workspaces/:id/acp` ; le sélecteur
  désactive (ou marque en lecture seule) les entrées non fiables.
- Le `DaemonClient` du SDK (ajouté en Phase 3) lit déjà `caps.workspaces[].cwd`
  pour le routage des sessions ; un helper de connexion ACP qualifié par
  workspace est l'extension naturelle. La synchronisation des types de
  capacité ci-dessus est requise ; le helper de connexion lui-même peut
  suivre.

## Chemins d'échec

- `workspace_mismatch` : sélecteur WS/HTTP inconnu -> rejet de classe 400 ;
  jamais de fallback vers le primaire.
- `untrusted_workspace` : opération ACP accordant la propriété sur un runtime
  non fiable -> rejet, pas de spawn.
- Non-concordance du paramètre `workspaceCwd` : `WorkspaceMismatchError` ->
  `INVALID_PARAMS` (déjà câblé).
- Crash d'enfant : isolé au runtime propriétaire ; les dispatchers et
  connexions des autres runtimes ne sont pas affectés (le rayon de
  défaillance plus large du démon unique est une limitation connue
  documentée).
- Confiance révoquée : lorsqu'une phase de mutation de confiance arrivera, la
  révocation d'un runtime devra drainer/arrêter son enfant ACP et effacer son
  index de sessions ; la Phase 4 garantit seulement que le montage ACP par
  runtime est drainable, elle n'ajoute pas elle-même la mutation de confiance.
- Arrêt global : disposer la `ConnectionRegistry` de chaque runtime, puis
  disposer une seule fois le registre de device-flow unique global au démon.
- Rate limiting : l'admission ACP HTTP/WS utilise `checkRate` indexé par
  connexion/session (index.ts L627-641, L1175-1178). Les montages pluriels
  partagent l'unique limiter ; les clés doivent rester sans ambiguïté entre
  runtimes afin qu'un workspace ne puisse pas épuiser ni contourner le budget
  d'un autre.
- Capacité : `maxConnections` est appliqué par `ConnectionRegistry` de
  runtime, donc le total des connexions ACP passe à N x `maxConnections` (un
  budget par workspace, en correspondance avec le modèle `maxSessions` par
  workspace). Le total de sessions fraîches reste borné par l'admission
  `maxTotalSessions` de la Phase 2a au seam du bridge, par laquelle la
  création de session ACP passe déjà.

## Non-objectifs (Phases 4b / 5)

- `/workspaces/:workspace/voice/stream` et les paramètres de voix par
  workspace (4b).
- Groupement des workers de canal gérés par le démon / pidfile / statut (4b).
- Ajout/retrait dynamique de workspace et création différée de runtime (5).

## Stratégie de test

- Dispatch de l'upgrade WS : tester unitairement la classification des
  chemins — `/acp` (primaire), `/workspaces/:id/acp` (résolu), sélecteur
  inconnu (rejet), sélecteur de cwd encodé `%2F`, et que les vérifications de
  sécurité partagées s'exécutent toujours pour le chemin pluriel.
- Isolation inter-workspaces : une connexion sur `/workspaces/A/acp` ne peut
  pas voir ni piloter une session possédée par B ; `session/list` et les
  lectures reflétées ne renvoient que la vue de A.
- Propriété inter-transports : une session créée via `/workspaces/B/acp` est
  résoluble par les lectures REST routées par propriétaire (par ex.
  `GET /session/:id/stats`) et par `resolveLiveSessionOwner`, confirmant que
  la création ACP alimente l'index de propriétaires.
- Cohérence : connexion à A, envoi de `workspaceCwd: B` ->
  `WorkspaceMismatchError`.
- Porte de confiance : `session/new|load|resume` sur un runtime non fiable ->
  rejeté, pas d'enfant lancé.
- Device-flow : chaque montage atteint le registre global au démon ; la
  publication d'événements se diffuse vers les bridges primaire et secondaires
  fiables, un bridge en échec ne bloque pas les autres, et l'arrêt dispose le
  registre une seule fois.
- MCP inverse : `mcp_register` sur `/workspaces/B/acp` atterrit uniquement
  dans le `clientMcpSenderRegistry` de B et le bridge de B.
- Rate limiting : les prompts/mutations sur `/workspaces/A/acp` et
  `/workspaces/B/acp` sont comptés indépendamment et aucun des deux ne peut
  contourner le limiter partagé.
- Capacités : `workspace_qualified_acp` annoncé uniquement avec >1 runtime ;
  la forme de `workspaces[]` inchangée.

## Questions ouvertes / retours à la Phase 3

1. **Conserver `resolveRegisteredWorkspaceRuntimeByPathSelector` comme
   fonction pure.** Le listener d'upgrade WS ne peut pas utiliser le
   `resolveWorkspaceRuntimeFromParam` lié à Express. La Phase 4 dépend du fait
   que le résolveur pur reste sans couplage à `req`/`res`. Si la revue de la
   Phase 3 modifie ce seam, préserver un point d'entrée pur
   `(registry, selector) => runtime | undefined`.
2. **Propriété du device-flow (résolu).** Garder le registre global au démon,
   car les identifiants OAuth sont globaux au processus. La Phase 4 partage ce
   registre avec chaque dispatcher et diffuse les événements sanitizés vers
   les bridges des runtimes fiables.
3. **Modèle de tunnel CDP par workspace.** Un client puppeteer loopback + un
   endpoint `/cdp` ne se mappe pas proprement sur N runtimes. La Phase 4
   conserve le CDP sur le primaire ; confirmer que c'est acceptable ou borner
   un suivi de CDP qualifié par workspace.
4. **Report de la voix.** Confirmer que la voix reste réservée au primaire
   jusqu'à la Phase 4b même si le dispatcher ACP expose déjà les lectures
   `_qwen/workspace/voice`.
5. **Portée de `archiveCoordinator`.** C'est aujourd'hui un unique
   `SessionArchiveCoordinator` (server.ts L596). Confirmer que le partager
   entre runtimes est sûr étant donné l'archive/organisation qualifiée par
   workspace de la Phase 3, ou le rendre par runtime.
6. **Dimensionnement des clés de rate-limit.** Décider si les clés d'admission
   plurielles ACP ont besoin d'une dimension workspace explicite, ou si les
   clés par connexion/session sont déjà sans ambiguïté entre montages.
