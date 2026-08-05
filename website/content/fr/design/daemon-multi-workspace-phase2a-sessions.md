# Fondation des sessions multi-workspaces Phase 2a

> **Statut historique :** Ce document enregistre la séquence Phase 2a/début de
> Phase 2b, pas la surface complète actuelle. Le modèle de propriété, la
> sémantique d'échec, les frontières de ressources, et les routes restantes
> réservées au primaire sont désormais définis par
> [`daemon-multi-workspace-hardening.md`](./daemon-multi-workspace-hardening.md).
> Les snapshots de rewind de session live, le rewind, et les limitations du
> shell enregistrés ici sont remplacés par
> [`daemon-multi-workspace-session-file-ops.md`](./daemon-multi-workspace-session-file-ops.md).
> La classification ultérieure comme réservées au primaire des mutations
> continue, language et artifact de session live est également remplacée : ces
> routes REST singulières dispatchent désormais vers le runtime du workspace
> fiable propriétaire. D'autres affirmations limitées à la phase peuvent aussi
> être remplacées par des documents de design ultérieurs et ne doivent pas
> être traitées comme l'inventaire actuel des routes.

## Résumé

Ce document enregistre le contrat de sessions multi-workspaces pour l'issue
#6378 après la PR Phase 1 de `WorkspaceRegistry`, la PR de fondation de la
phase 2a, et la première PR d'extension de routes de la phase 2b. La phase 2a
a été divisée en deux PR d'implémentation : la PR 1 a livré l'isolation d'env
et les garde-fous d'admission totale tandis que le multi-workspace restait
soumis à une gate ; la PR 2 a câblé le dispatch des sessions live non
primaires et publié le schéma additif de capacités/statut. La PR 1 de la phase
2b ajoute un index de propriétaires de sessions et étend la surface des routes
uniquement sessions sans déplacer les fichiers, la mémoire, MCP, les
paramètres, la voix, les workers de canal, ACP, ni les clients de workspace du
SDK.

Le travail multi-workspace reste limité aux sessions. La phase 2a n'a pas
ajouté de routes au pluriel, de `WorkspaceDaemonClient`, d'ACP/WebSocket
qualifié par workspace, ni la migration des fichiers, de la mémoire, de MCP,
des paramètres, de la voix ou des workers de canal. La PR 1 de la phase 2b
ajoute uniquement l'alias pluriel de liste de sessions décrit ci-dessous ;
elle n'ajoute toujours pas d'API clientes de workspace ni ne migre les
surfaces hors sessions. La PR 1 n'a pas ajouté les capacités `workspaces[]`,
`multi_workspace_sessions`, le dispatch de routes, ni la construction de
runtimes non primaires.

## Contrat de fondation

- `--workspace` est répétable au niveau du parseur CLI afin que yargs préserve
  l'entrée sous forme de tableau au lieu de la réduire.
- Le fast path de serve bascule vers le parseur complet lorsque des valeurs de
  workspace répétées sont présentes.
- Un tableau de workspace à un seul élément est traité comme le workspace
  primaire et conserve le comportement existant à workspace unique.
- La PR 1 a conservé une gate sur les workspaces explicites multiples avant le
  démarrage du runtime.
- La PR 2 accepte des workspaces explicites distincts et non imbriqués pour le
  mode multi-workspaces limité aux sessions.
- Les entrées de workspace canonique en double échouent toujours explicitement.
- Les entrées de workspace imbriquées échouent toujours explicitement.
- Le premier workspace explicite est le workspace primaire et reste reflété
  par les champs de compatibilité historiques `workspaceCwd` /
  `app.locals.boundWorkspace`.

Le contrat interne `WorkspaceRuntime` contient désormais des métadonnées
stables pour les travaux ultérieurs de la phase 2a :

- `workspaceId` : hash stable du cwd du workspace canonique.
- `workspaceCwd` : cwd du workspace canonique.
- `primary` : true pour le runtime primaire.
- `trusted` : métadonnées de confiance au moment du démarrage ; le fallback
  direct de `createServeApp` reste à false sauf si la production transmet une
  valeur trusted explicite.
- `env` : métadonnées de source d'env locale au runtime. En production à
  workspace unique, le runtime primaire reçoit désormais un snapshot d'env
  effectif calculé et une source d'env mutable qui peut être rafraîchie après
  un rechargement d'env du démon. Le fallback direct de `createServeApp` reste
  sur les métadonnées du processus parent.

Le `WorkspaceRegistry` interne prend en charge la recherche exacte par cwd, la
recherche exacte par id, le fallback primaire de
`resolveWorkspaceCwd(undefined)` et la résolution du propriétaire de session
live. La résolution du propriétaire live analyse uniquement les résumés de
bridge des runtimes ; elle n'analyse pas le stockage persisté, ne crée pas
d'enfants et ne route encore aucune requête. Les propriétaires live en double
échouent en fail closed comme résultat ambigu.

`createServeApp` peut accepter un registre injecté pour les tests et
l'assemblage futur. La PR de fondation a conservé les modules de route sur les
entrées du runtime primaire ; la PR 2 étend uniquement le câblage des routes
de session live, de SSE et de permission de session avec le registre
nécessaire au dispatch par propriétaire. Les variables locales de
compatibilité existantes `app.locals.boundWorkspace` et
`app.locals.fsFactory` restent des locales réservées au primaire.

## Classification des routes de la phase 2a

Le premier jalon de la phase 2a non soumis à une gate doit classifier toutes
les routes `/session/:id/*` avant d'activer les workspaces explicites
multiples.

Routes dispatchées en phase 2a :

- `POST /session`
- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

Ajouts dispatchés en phase 2b :

- `POST /session/:id/load`
- `POST /session/:id/resume`
- `GET /session/:id/context`
- `GET /session/:id/context-usage`
- `GET /session/:id/stats`
- `GET /session/:id/supported-commands`
- `GET /session/:id/tasks`
- `GET /session/:id/lsp`
- `GET /session/:id/hooks`
- `GET /session/:id/artifacts`

Routes ultérieures ou réservées au primaire :

- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- mutations de groupe de sessions
- mutations de session branch, fork, cd, rewind, shell, model et language
- `POST /permission/:requestId` hors session
- `/acp`

## Exigences inter-PR de la phase 2a

- Conserver les erreurs de scan sous la forme `404 session_not_found` ; ne
  jamais revenir au primaire en fallback.
- Échouer en fail closed si plus d'un runtime signale le même identifiant de
  session live.
- Conserver une gate sur le listage des sessions persistées non primaires
  jusqu'à ce que la propriété de restauration, les vérifications de confiance
  et la découverte de sessions actives soient implémentés ensemble.
- Réutiliser les overlays d'env locaux au runtime de la PR 1 avant le spawn
  d'enfants non primaires.
- Réutiliser l'admission `maxTotalSessions` de la PR 1 à chaque futur seam de
  création fraîche afin que REST et le `/acp` primaire ne puissent pas la
  contourner, tandis que attach continue de contourner l'admission.
- La PR 2 publie `workspaces[]` et `multi_workspace_sessions` uniquement après
  que la boucle de dispatch des sessions live est complète.
- La PR 2 met à jour les types de capacités du SDK pour le schéma de capacités
  additif, mais la phase 2a n'ajoute toujours pas de client de workspace.

## Garde-fous de la PR 1

- L'env du runtime est calculé à partir de l'env de base du démon plus le
  `.env` du workspace, l'env des paramètres, et les défauts de Cloud Shell,
  sans muter le `process.env` parent pendant l'initialisation du runtime.
- Le helper d'env ne virtualise intentionnellement ni `QWEN_HOME`, ni Storage,
  ni le routage de la config globale. Ceux-ci restent des responsabilités du
  démarrage/du env de base du démon.
- Le spawn d'enfant ACP accepte un `sourceEnv` explicite, et les lecteurs de
  statut/config à portée de workspace à faible coût utilisent l'env injecté au
  lieu de lectures directes de `process.env`.
- `maxTotalSessions` est un plafond optionnel de sessions fraîches à l'échelle
  du démon. Il couvre le spawn, la restauration par chargement/reprise
  persistée, et la création de sessions de branch/fork ; attach le contourne.
  En mode multi-workspaces, lorsque l'opérateur le laisse non défini et que le
  plafond `maxSessions` par workspace est fini, la PR 2 dérive le plafond
  total effectif comme `maxSessionsPerWorkspace * workspaceCount` ; le mode à
  workspace unique conserve le défaut historique de total illimité.
- Le seam d'admission du bridge est un hook de réservation synchrone. Un échec
  de création fraîche libère la réservation, empêchant le sur-engagement
  concurrent entre runtimes une fois que les bridges non primaires existent.
- `/daemon/status.limits.maxTotalSessions` est additif. `/capabilities` et les
  types de capacités du SDK restent inchangés jusqu'à ce que la PR 2 retire la
  gate sur les sessions multi-workspaces.

## Boucle fermée des sessions de la PR 2

La PR 2 retire la gate de démarrage explicite multi-workspaces pour le mode du
démon limité aux sessions. Des valeurs multiples explicites de `--workspace`
créent désormais un runtime par workspace canonique, le premier workspace
étant le primaire. Les entrées de workspace en double et imbriquées restent
des erreurs de démarrage, car elles rendent la propriété des sessions ambiguë
avant que tout dispatch au niveau route ne puisse résoudre une requête de
façon sûre.

L'assemblage de production conserve les responsabilités existantes du runtime
primaire : l'identité du démon, l'identité de log, l'id de service de
télémétrie, le Web Shell, `/acp`, les fichiers, la mémoire, MCP, les
paramètres, la voix, le worker de canal, et les routes REST historiques sans
workspace restent réservés au primaire. Les runtimes non primaires sont des
runtimes bridge/services de workspace uniquement pour les sessions REST live.
Leur enfant ACP est toujours différé : l'objet bridge existe au démarrage,
mais aucun enfant non primaire n'est lancé jusqu'à ce qu'une requête
`POST /session { cwd }` fiable ait besoin d'une nouvelle session.

La création de session résout `cwd` via une correspondance exacte du cwd
canonique dans `WorkspaceRegistry`. Un `cwd` omis se résout vers le runtime
primaire. Un `cwd` inconnu renvoie `400 workspace_mismatch` ; un `cwd` non
primaire non fiable renvoie `403 untrusted_workspace` ; les runtimes
enregistrés fiables appellent le bridge de ce runtime avec son propre cwd
canonique. Cela évite intentionnellement la correspondance par préfixe, la
correspondance au parent le plus proche, ou la consultation du stockage
persisté en phase 2a.

Les routes de session live dispatchées résolvent le runtime propriétaire en
analysant les résumés de bridge live via
`WorkspaceRegistry.resolveLiveSessionOwner(sessionId)`. `not_found` correspond
à `404 session_not_found`, et `ambiguous` correspond à une erreur serveur fail
closed. Le scan est synchrone et live uniquement ; il ne lance jamais d'enfant
et ne traite jamais une absence comme un fallback vers le primaire.
L'ensemble des routes dispatchées est exactement :

- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

`GET /workspace/:id/sessions` se résout d'abord par id de workspace exact puis
par cwd canonique exact. Le primaire conserve la fusion persistée/live
existante et le comportement de vue organisée. Le non-primaire ne renvoie que
les sessions live, rejette `archiveState=archived`, et rejette les requêtes
organisées/groupées, car ce sont des surfaces persistées/soutenues par
l'organisation réservées aux phases ultérieures.

`/capabilities` reste rétrocompatible : `workspaceCwd` nomme toujours le
workspace primaire. Lorsque plusieurs runtimes sont enregistrés, il publie en
plus `workspaces[]`, `multi_workspace_sessions`, et les limites de sessions
additives. `/daemon/status` ajoute les mêmes métadonnées `workspaces[]` et
agrège les compteurs de sessions live à travers les bridges des runtimes tout
en laissant les sections complètes de workspace réservées au primaire.

La PR 2 de la phase 2a n'ajoute pas de routes au pluriel,
d'ACP/WebSocket qualifié par workspace, de migration des
fichiers/mémoire/MCP/paramètres/voix/workers de canal, d'ajout/retrait
dynamique, de chargement/reprise/export/archive/suppression persistés non
primaires, de branch/fork/cd/rewind, de migration shell/model/language, ni
d'API clientes de workspace du SDK.

## Index de propriétaires et extension de restauration de la PR 1 de la phase 2b

La PR 1 de la phase 2b ajoute un seam de callback de cycle de vie du bridge et
un `WorkspaceSessionOwnerIndex` possédé par `WorkspaceRegistry`. Les
événements de cycle de vie d'enregistrement/retrait du bridge mettent à jour
l'index lors du spawn, du chargement/reprise, de la sortie du canal, de la
fermeture, du kill, et de l'arrêt du démon. La résolution du propriétaire
consulte d'abord l'index, vérifie le runtime indexé avec `getSessionSummary`,
supprime les entrées obsolètes de l'index, et retombe sur le scan existant
des bridges live. Les correspondances du fallback sont remises en cache dans
l'index. L'index reste une optimisation et un seam de cohérence, pas une base
de données persistée de propriété.

`POST /session/:id/load` et `POST /session/:id/resume` acceptent désormais un
`cwd` explicite pour tout workspace enregistré fiable. Un `cwd` omis se résout
toujours vers le runtime primaire. Un `cwd` inconnu renvoie
`400 workspace_mismatch` ; un `cwd` non primaire non fiable renvoie
`403 untrusted_workspace` ; si le même id de session est déjà live ou en cours
de restauration dans un autre runtime, la restauration échoue en fail closed
avec `409 session_workspace_conflict`. Les courses à la restauration dans le
même workspace conservent la coalescence existante du bridge et le
comportement `restore_in_progress`. La restauration lit toujours le stockage
persisté des sessions depuis le chemin de stockage existant du workspace
demandé et n'active pas l'export/archive/suppression non primaires.

Les routes live en lecture seule routées par propriétaire utilisent désormais
le bridge du runtime propriétaire : context, context-usage, stats,
supported-commands, tasks, lsp, hooks, et artifacts. Ces routes ne mutent pas
le stockage persisté et ne nécessitent pas d'état local à la connexion
ACP/WebSocket, donc elles peuvent suivre sans risque le propriétaire live.
`GET /session/:id/rewind/snapshots` reste réservé au primaire, car l'état du
rewind ne fait pas partie de la boucle fermée limitée aux sessions.

`GET /workspaces/:workspace/sessions` est un alias pluriel de
`GET /workspace/:id/sessions`. Les deux se résolvent d'abord par id de
workspace exact puis par cwd canonique exact. Les workspaces primaires
conservent la sémantique de fusion persistée/live. La PR 1 de la phase 2b a
conservé les workspaces non primaires en live uniquement et rejetant les vues
de liste archivées ou organisées.

## Découverte des sessions persistées de la PR 2 de la phase 2b

Le listage des sessions d'un workspace non primaire fiable inclut désormais
les sessions persistées actives du magasin de sessions de ce workspace et
fusionne les résumés live correspondants sans doublons. Cela complète le côté
découverte du flux de restauration de la phase 2b : les clients peuvent lister
un workspace secondaire fiable, trouver une session persistée active, puis
appeler le `POST /session/:id/load` ou le `POST /session/:id/resume` conscients
du workspace de la PR 1 de la phase 2b.

Si un workspace non primaire fiable n'a aucune session persistée active, le
listage conserve le comportement antérieur de curseur live uniquement. Les
vues de liste non primaires archivées, organisées et groupées restent
rejetées, car les surfaces d'archive/unarchive/suppression et d'organisation
des sessions sont toujours réservées au primaire/phases ultérieures.

Le travail de la phase 2b jusqu'ici n'ajoute pas de nouveaux tags de
capacité, ne modifie pas le schéma `/capabilities`, ne change pas les types du
SDK, et ne route pas les surfaces ACP, voix, workers de canal, fichiers,
mémoire, MCP, paramètres, branch/fork/cd/rewind, shell/model/language, export,
archive, suppression ou organisation vers les runtimes non primaires.

## Décisions d'audit

- La PR de fondation ne doit pas créer de runtimes non primaires ni assouplir
  aucune route REST.
- Les variables locales de compatibilité existantes
  `app.locals.boundWorkspace` et `app.locals.fsFactory` restent des locales
  réservées au primaire.
- Le `routeFileSystemFactory` REST reste distinct des filesystem factories du
  bridge ; il ne doit pas être utilisé pour représenter les frontières de
  bridge non primaires.
- Les racines de système de fichiers secondaires de l'IDE ne doivent pas être
  promues en runtimes de workspace explicites.
- Le comportement parent-env à workspace unique reste compatible jusqu'à ce
  que le mode multi-workspaces réel ne soit plus soumis à une gate.
- La frontière sûre de la PR 2 est la boucle fermée des sessions live plus les
  métadonnées additives de capacités/statut. Si une route a besoin du stockage
  persisté, de l'état d'organisation, des paramètres de workspace, ou de
  l'état local à la connexion ACP, elle reste réservée au primaire ou
  ultérieure.
