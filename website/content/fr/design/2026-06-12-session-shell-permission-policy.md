# Politique d'autorisation du shell de session

## Problème

`POST /session/:id/shell` exécute une commande shell directement via le démon,
sans appel d'outil LLM ni flux de médiation d'autorisation normal de l'agent. Avant
cette modification, le point de terminaison était une mutation non stricte et pouvait être atteint avec un
jeton de démon associé à un identifiant de session, ou via la valeur par défaut du développeur en boucle locale sans jeton.

C'est trop d'autorité pour une surface shell directe. Un appelant ne devrait pas pouvoir
exécuter des commandes shell à moins que l'opérateur du démon n'active explicitement
la surface et que l'appelant ne prouve qu'il est rattaché à la session cible.

## Objectifs

- Désactiver le shell de session direct par défaut.
- Exiger une activation explicite par l'opérateur avec `qwen serve --enable-session-shell`.
- Exiger la configuration d'un bearer token avant que l'activation ne prenne effet.
- Exiger un client id enregistré sur la session ciblée.
- Appliquer la même politique au niveau de la route REST, du dispatcher HTTP ACP et du sink
  d'exécution du bridge.
- Conserver inchangées les approbations normales de l'outil shell de l'agent et la médiation des autorisations.

## Non-objectifs

- Ne pas router le shell direct via `PermissionMediator`.
- Ne pas modifier la soumission des prompts, la mise en file d'attente des prompts, ni le comportement des prompts en attente du SDK.
- Ne pas ajouter de rate limiter spécifique au shell.
- Ne pas ajouter d'alias de variable d'environnement pour le flag d'activation.

## Conception

`runQwenServe` résout et nettoie le bearer token une seule fois. Ensuite, il calcule
un booléen effectif :

```ts
sessionShellCommandEnabled =
  opts.enableSessionShell === true && token !== undefined;
```

Cette valeur est propagée au bridge, à l'application REST et au dispatcher ACP. Les appelants
intégrés qui invoquent `createServeApp` directement calculent la présence du jeton à l'aide d'une
vérification de chaîne non vide, afin que `token: ''` se comporte comme une absence de jeton,
tant pour le contrôle strict des mutations que pour l'annonce des capacités du shell.

La route REST utilise `mutate({ strict: true })`. Sur un démon en boucle locale sans jeton,
le contrôle strict retourne `401 token_required` avant l'exécution du handler. Lorsqu'un
jeton est configuré, le handler rejette le shell désactivé avec
`session_shell_disabled`, exige ensuite `X-Qwen-Client-Id`, valide le corps de la commande,
puis délègue au bridge.

Le dispatcher ACP conserve `_qwen/session/shell` dispatchable pour les anciens clients, mais
ne l'annonce pas dans la liste `_qwen.methods` d'initialisation à moins que la
politique effective ne soit activée. Les appels ACP désactivés retournent une erreur
JSON-RPC stable `session_shell_disabled` sans journaliser la commande ni appeler
le bridge. Les appels activés exigent toujours que la connexion soit propriétaire de la session et
doivent utiliser le client id de liaison de session estampillé par le bridge.

Le bridge applique le contrôle final de défense en profondeur dans
`executeShellCommand()` : désactivé, client id manquant, session inconnue, puis client id non lié. Ce n'est
qu'après la réussite de ces contrôles qu'il publie les événements shell,
exécute la commande ou écrit l'historique du shell.

## Contrat d'erreur

REST :

- pas de jeton : `401`, `code: token_required`
- désactivé : `403`, `code/errorKind: session_shell_disabled`
- client id manquant : `403`, `code/errorKind: client_id_required`
- client id malformé ou non lié : `400 invalid_client_id` existant
- session inconnue : mappage existant `404 SessionNotFoundError`

ACP :

- désactivé : `RPC.INVALID_REQUEST`, `data.errorKind: session_shell_disabled`
- client id de liaison de session manquant : `RPC.INVALID_REQUEST`,
  `data.errorKind: client_id_required`
- session non possédée et client id invalide conservent les mappages JSON-RPC existants

## Compatibilité

`DaemonSessionClient.shellCommand()` continue de fonctionner lorsque le démon est
explicitement activé et authentifié, car le client de session porte le client id lié à la session. L'appel nu à `DaemonClient.shellCommand(sessionId, command)`
doit passer `opts.clientId`, sinon il reçoit `client_id_required`.

## Couverture des tests

L'implémentation est couverte par des tests ciblés sur le bridge, le transport REST, le transport ACP, le démarrage du serveur et le parseur de commandes. Les vérifications à plus forte valeur ajoutée concernent le comportement désactivé par défaut, le contrôle strict sans jeton, l'annonce des capacités, le filtrage des méthodes d'initialisation ACP, l'application par le sink du bridge, et la propagation du client id lié à la session.