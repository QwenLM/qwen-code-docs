# Fondation des sessions multi-espaces de travail Phase 2a

## Résumé

Ce document enregistre le contrat de fondation de la phase 2a pour l'issue #6378 après la PR Phase 1 de `WorkspaceRegistry`. Le lot d'implémentation actuel combine le suivi de l'option `--workspace` répétable de la phase 1, les garde-fous de préparation de la phase 2a, ainsi que le premier contrat interne de registre/runtime nécessaire aux travaux ultérieurs sur les sessions multi-espaces de travail.

La phase 2a reste limitée aux sessions. Elle n'ajoute pas de routes au pluriel, de `WorkspaceDaemonClient`, d'ACP/WebSocket qualifié par espace de travail, ni la migration des fichiers, de la mémoire, de MCP, des paramètres, de la voix, des channel-workers, des env overlays, de l'admission de sessions totales, des capacités `workspaces[]`, de `multi_workspace_sessions`, du dispatch de routes ou de la construction de runtimes non primaires dans ce lot de fondation.

## Contrat de fondation

- `--workspace` est répétable au niveau du parseur CLI afin que yargs préserve l'entrée sous forme de tableau au lieu de la réduire.
- Le fast path de serve bascule vers le parseur complet lorsque des valeurs d'espace de travail répétées sont présentes.
- Un tableau d'espace de travail à un seul élément est traité comme l'espace de travail principal et conserve le comportement existant à espace de travail unique.
- Les espaces de travail explicites multiples restent soumis à une gate et échouent avant le démarrage du runtime.
- Les entrées d'espace de travail canonique en double échouent explicitement.
- Les entrées d'espace de travail imbriquées échouent explicitement.
- Les entrées d'espaces de travail multiples distincts et non imbriqués échouent avec l'erreur de démarrage générique "multi-workspace serve is not enabled".
- Le premier espace de travail explicite sera le futur espace de travail principal une fois la gate retirée ; ce lot de fondation n'expose pas cette liste publiquement.

Le contrat interne `WorkspaceRuntime` contient désormais des métadonnées stables pour les travaux ultérieurs de la phase 2a :

- `workspaceId` : hash stable du cwd de l'espace de travail canonique.
- `workspaceCwd` : cwd de l'espace de travail canonique.
- `primary` : true pour le runtime principal.
- `trusted` : métadonnées de confiance au moment du démarrage ; le fallback direct de `createServeApp` reste à false sauf si la production transmet une valeur trusted explicite.
- `env` : métadonnées uniquement. Ce lot de fondation enregistre le mode du processus parent et les clés d'overlay vides ; il ne calcule pas les env overlays au niveau du runtime.

Le `WorkspaceRegistry` interne prend en charge la recherche exacte par cwd, la recherche exacte par id, le fallback principal de `resolveWorkspaceCwd(undefined)` et la résolution du propriétaire de session active. La résolution du propriétaire actif analyse uniquement les résumés du bridge du runtime ; elle n'analyse pas le stockage persisté, ne crée pas d'enfants et ne route encore aucune requête. Les doublons de propriétaires actifs échouent en fail closed en raison d'un résultat ambigu.

`createServeApp` peut accepter un registre injecté pour les tests et l'assemblage futur, mais les modules de route ne reçoivent toujours que le runtime principal. Les variables locales héritées existantes `app.locals.boundWorkspace` et `app.locals.fsFactory` restent limitées au runtime principal pour des raisons de compatibilité.

## Classification des routes de la phase 2a

Le premier jalon de la phase 2a non soumis à une gate doit classifier toutes les routes `/session/:id/*` avant d'activer les espaces de travail explicites multiples.

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

Routes ultérieures ou limitées au primaire :

- `POST /session/:id/load` non primaire
- `POST /session/:id/resume` non primaire
- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- mutations de groupe de sessions
- mutations de session branch, fork, cd, rewind, shell, model et language
- `POST /permission/:requestId` hors session
- `/acp`

Des routes de lecture actives supplémentaires peuvent être routées par propriétaire dans une tranche ultérieure de la phase 2a uniquement après que des tests prouvent qu'elles dépendent uniquement du bridge actif propriétaire.

## Exigences ultérieures de la phase 2a

- Conserver les erreurs de scan sous la forme `404 session_not_found` ; ne jamais revenir au primaire en fallback.
- Échouer en fail closed si plus d'un runtime signale le même identifiant de session active.
- Conserver la liste des sessions non primaires en mode actif uniquement (live-only), sauf si les entrées persistées sont explicitement marquées comme non repreneables.
- Ajouter les env overlays au niveau du runtime avant le spawn des enfants non primaires.
- Ajouter `maxTotalSessions` au seam de création de nouveau bridge afin que REST et le `/acp` principal ne puissent pas le contourner, tandis que attach continue de contourner l'admission.
- Publier `workspaces[]`, les limites totales et `multi_workspace_sessions` uniquement dans la PR finale de retrait de gate.
- Mettre à jour les types de capacités du SDK lorsque le schéma de capacités additif sera livré, mais ne pas ajouter de client d'espace de travail dans la phase 2a.

## Décisions d'audit

- La PR de fondation ne doit pas créer de runtimes non primaires ni assouplir aucune route REST.
- Les variables locales héritées existantes `app.locals.boundWorkspace` et `app.locals.fsFactory` restent limitées au runtime principal pour des raisons de compatibilité.
- Le `routeFileSystemFactory` REST reste distinct des filesystem factories du bridge ; il ne doit pas être utilisé pour représenter les limites de bridge non primaires.
- Les racines de système de fichiers secondaires de l'IDE ne doivent pas être promues en runtimes d'espaces de travail explicites.
- Le comportement parent-env à espace de travail unique reste compatible jusqu'à ce que le mode multi-espaces de travail réel ne soit plus soumis à une gate.