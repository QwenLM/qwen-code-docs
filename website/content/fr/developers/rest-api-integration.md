# Guide d'intégration de l'API REST

Pour les équipes qui intègrent Qwen Code dans leur propre produit via HTTP : lancez `qwen serve`
en tant que backend et pilotez-le depuis votre propre front end.

Cette page est le point d'entrée. La référence complète des routes se trouve dans
[`qwen-serve-protocol.md`](./qwen-serve-protocol.md) ; les internes sont détaillés dans
[l'analyse approfondie du démon](./daemon/00-index.md) ; un exemple TypeScript exécutable est disponible dans
[`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md).

## Quels chemins existent

Six façons de construire sur le démon, séparées par une seule question — **quelle part du
front end possédez-vous ?**

| Chemin                                 | Vous possédez                           | Statut                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| démon + Web Shell intégré           | rien — utilisez tel quel       | disponible aujourd'hui ([guide utilisateur](../users/qwen-serve.md))                                                                                                                                                                             |
| démon `--no-web` + votre propre UI      | l'ensemble du front end              | disponible aujourd'hui — **cette page**                                                                                                                                                                                                    |
| démon + Web Shell personnalisé           | la marque, pas le code                | non construit ([#11357](https://github.com/QwenLM/qwen-code/issues/11357))                                                                                                                                                         |
| démon + build Web Shell auto-hébergé | le build front-end               | non construit ([#11358](https://github.com/QwenLM/qwen-code/issues/11358))                                                                                                                                                         |
| démon via SDK `DaemonClient`        | le code client, jamais du HTTP brut       | disponible aujourd'hui ([TS](./sdk-typescript.md), [Java](./sdk-java.md)) — le [SDK Python](./sdk-python.md) est limité au transport par processus et n'a pas de client démon, donc une intégration Python utilise le chemin 2 en HTTP brut                     |
| démon via bridge MCP                | rien — un autre agent le pilote | disponible sous forme de `qwen-serve-mcp` dans ` @qwen-code/sdk` — voir le [README du bridge](../../packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md) ; `QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE` autorise optionnellement les mutations d'écriture à portée globale |

Le mode headless `qwen -p` et ACP sur stdio pour les éditeurs sont des chemins
d'intégration séparés. Les canaux et les extensions peuvent aussi fonctionner via le démon ; consultez le
[guide des canaux](../users/features/channels/overview.md) et la
[référence des extensions](./qwen-serve-protocol.md#extension-management-v2-wire-contract).

## Deux choses à savoir avant de concevoir

**Le démon n'exécute pas l'inférence en interne.** Il lance des processus enfants `qwen --acp`
et fait l'intermédiaire entre eux et HTTP. Il exécute le script d'entrée CLI sous
le même binaire Node, en utilisant `QWEN_CLI_ENTRY` ou sinon `process.argv[1]`.
Un backend Node d'intégration doit pointer `QWEN_CLI_ENTRY` vers le script d'entrée CLI Qwen installé ; il n'y a pas de recherche de `qwen` dans `PATH`. Un point d'entrée manquant se manifeste
sous la forme de `MissingCliEntryError`.

En régime stabilisé, il y a **un enfant par runtime de workspace actif**, pas un par
session. Chaque session d'un workspace multiplexe sur cet enfant et partage son
processus, son état OAuth, son cache de fichiers et son analyse de mémoire hiérarchique. Le domaine de fault est donc
le workspace : si l'enfant se termine, chaque session multiplexée dessus est
démantelée ensemble. Dimensionnez le conteneur pour le démon plus un enfant par workspace
enregistré, avec une marge pour un enfant supplémentaire par runtime lors d'un swap de canal.
Quand les sessions doivent échouer indépendamment, lancez des démons séparés —
`--max-sessions` limite la concurrence, pas le rayon d'explosion.

**L'authentification est à opérateur unique.** Le token bearer du runtime donne accès à
l'ensemble de l'API protégée par bearer, et un appelant loopback de confiance obtient l'autorité complète
y compris l'exécution de code en tant qu'utilisateur du démon. Il n'y a pas de modèle de principal par utilisateur final.
Si vous placez
cela derrière un produit multi-utilisateurs, votre backend possède l'identité utilisateur et ne doit pas
transmettre le token du démon aux navigateurs. Le déploiement conteneurisé et multi-tenant
est explicitement reporté — voir « v0.16-alpha known limits » dans le
[guide utilisateur](../users/qwen-serve.md).

L'entrée webhook de canal configurée (`POST /channels/:channelName/webhooks/:source`)
utilise sa propre authentification `x-qwen-webhook-secret` avant l'authentification
bearer ; elle est inactive tant qu'une source webhook de canal n'est pas configurée.

## Démarrer le démon

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"

qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

`--no-web` préserve les routes listées ci-dessous, mais désactive les actifs Web Shell et
les surfaces dépendantes : sur macOS les routes `/live/*` et le socket `/live/host`, et sur
chaque plateforme `GET /mcp-app-sandbox`. Transmettez le token par variable d'environnement plutôt que
par `--token`, qui est lisible par tout utilisateur local via `/proc/<pid>/cmdline`.

Les exemples Bash ci-dessous transmettent l'en-tête Authorization via un descripteur de fichier
en utilisant le builtin `printf` du shell, gardant le token hors des arguments de curl.

## Les routes qu'une intégration utilise réellement

La plupart de ce que le démon enregistre sert à piloter le Web Shell — opérations git,
installation d'extensions, confiance du workspace, voix, tâches planifiées — et
évolue avec cette UI. Le sous-ensemble ci-dessous est un ordre de grandeur plus petit.

Ce sont celles dont une intégration REST a besoin. Considérez le reste comme interne.

### Découverte

| Route                                                            | Objectif                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | Sonde de liveness                                                               |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | Preflight — lire `workspaceCwd` et `policy.permission` avant tout le reste |

### Cycle de vie des sessions

| Route                                                                                                                                | Objectif                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                             | Créer. Envoyez `sessionScope: "thread"` pour une conversation indépendante |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                   | Fermer. La session persistée survit et peut être rechargée             |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`/resume`](./qwen-serve-protocol.md#post-sessionidresume) | Restaurer une session persistée                                           |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                    | Reporter le reaper d'inactivité                                                 |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                    | Métadonnées de session                                                      |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                            | Changer de modèle dans le service lié                                 |
| `GET /session/:id/status`                                                                                                            | Statut du runtime — _pas encore de section de référence dédiée_                 |

### Prompting et streaming

| Route                                                                             | Objectif                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)       | Soumettre. Renvoie `202` à l'**admission**, pas à la fin |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)       | Annuler uniquement le prompt actif                          |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)     | Flux SSE. S'abonner **avant** de prompter             |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | Historique de conversation                                   |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)       | Utilisation de la fenêtre de contexte                                   |
| `GET /session/:id/export` · `GET /session/:id/pending-prompts`                    | _Pas encore de sections de référence dédiées_                  |

### Permissions

| Route                                                                              | Objectif                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/permission/:requestId`                                          | Répondre à un `permission_request`. Routé vers le runtime qui possède la session, donc correct dans chaque état de workspace — _pas encore de section dédiée_                                                                                                                                          |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | Formulaire global au processus, connecté uniquement au bridge du workspace **primaire** : il renvoie `404` pour une session appartenant à un autre runtime enregistré, avec le même corps qu'un vote perdu sous la politique par défaut `first-responder` — donc un `404` ici ne signifie pas en soi que la demande a déjà été traitée |

### Contexte de workspace en lecture seule

| Route                                                                                                      | Objectif                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`/file/bytes`](./qwen-serve-protocol.md#get-filebytes) | Lire un fichier ou une plage d'octets                                                                                                                                     |
| `GET /stat` · `GET /list` · `GET /glob`                                                                    | Métadonnées de chemin, liste de répertoire, glob — _pas encore de sections dédiées_                                                                                             |
| `GET /workspace/tools`                                                                                     | Outils reportés par l'enfant ACP actif ; sans lui, la réponse contient `acpChannelLive: false`, `tools: []`, et une erreur `not_started` — _pas encore de section dédiée_ |

> **Couverture de la référence.** 17 des 25 routes ci-dessus ont des sections dédiées.
> Parmi les 8 marquées autrement, certaines ne sont mentionnées que brièvement et trois sont
> totalement absentes : `GET /session/:id/pending-prompts`,
> `POST /session/:id/permission/:requestId`, et `GET /workspace/tools`.
> Combler ce manque est suivi dans
> [#11359](https://github.com/QwenLM/qwen-code/issues/11359).

## Flux minimal

**1. Preflight.** Lire `workspaceCwd` (pour pouvoir omettre `cwd` à la création) et
`policy.permission` (pour savoir qui peut répondre aux demandes de permission).

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") http://daemon:4170/capabilities
```

**2. Créer une session.** Utilisez `sessionScope: "thread"` sauf si les appelants sont censés
partager une conversation — le `"single"` par défaut fait qu'une deuxième création
dans le même workspace _réutilise_ la session existante, sérialisant les appelants
sans rapport dans une seule file.

```bash
curl -sX POST http://daemon:4170/session \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}'
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. S'abonner avant de prompter.** `Last-Event-ID: 0` rejoue depuis l'événement
le plus ancien conservé, ce qui permet de rattraper les événements émis entre la création et
l'abonnement — notamment `model_switch_failed`. Lors d'un **attach** (le `sessionScope: "single"`
par défaut réutilisant une session existante), cet événement est le seul
signal qu'un `modelServiceId` incorrect a été rejeté, car l'échec est
délibérément non propagé comme erreur HTTP. Lors d'une **création fraîche** qui porte
`modelServiceId` — ce que le corps de l'étape 2 ne porte pas — le corps `200` porte aussi
`modelApplied`, à `false` quand le switch a été rejeté, et c'est le signal
déterministe sur lequel agir plutôt qu'un événement sur un anneau borné. Une création
sans `modelServiceId` n'a pas du tout de clé `modelApplied`.

```bash
curl -N http://daemon:4170/session/$SID/events \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

Chaque ligne `data:` est une enveloppe complète sur une ligne ; le `type` de l'enveloppe correspond
à la ligne `event:`.

La relecture est limitée par `--event-ring-size` et un budget d'octets fixe de 8 Mio par abonnement. Si le flux émet `state_resync_required` avec
`reason: "replay_budget_exceeded"`, récupérez via `POST /session/:id/load`
au lieu de traiter la relecture comme complète.

**4. Prompter.** `202` signifie admis, pas terminé. Corréléz `turn_complete` /
`turn_error` sur le flux par `promptId`. Lisez `stopReason` sur `turn_complete` ;
sur `turn_error`, lisez `message` et tout `code` / `errorKind` optionnel — voir
[`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt).

```bash
curl -sX POST http://daemon:4170/session/$SID/prompt \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. Répondre aux demandes de permission.** Quand l'agent veut exécuter un outil _et que son
mode d'approbation demande une confirmation_, il émet `permission_request` et le tour
bloque jusqu'à ce que quelqu'un réponde ou que vous annuliez — **par défaut il n'y a pas de délai d'attente**
(`--permission-response-timeout-ms` vaut par défaut `0` = attente indéfinie), donc une
demande sans réponse continue d'occuper un emplacement dans la file de prompts de la session jusqu'à ce que
vous annuliez ou fermiez la session. Prévoyez votre propre délai si le flux en a besoin.

Le mode est le propre réglage Qwen de l'enfant `tools.approvalMode`, résolu depuis
les réglages de l'hôte du démon et du répertoire `--workspace` ; le démon ne fixe
rien au lancement. Sa valeur par défaut est `auto`, qui approuve une classe d'appels d'outils
sans demander — ceux-ci ne publient aucun `permission_request` — et demande encore
pour les autres. Un dossier workspace non fiable est forcé à `default` (demander),
ce qui explique pourquoi un déploiement voit ces événements et un autre n'en voit aucun, et
`GET /capabilities` reporte la politique de médiation de votes plutôt que le mode
d'approbation, donc le preflight ne vous dira pas dans quelle posture vous êtes. Si votre
intégration dépend du gating d'approbation, épinglez `tools.approvalMode` explicitement et
décidez à l'avance comment il répond : l'auto-approbation peut déjà être en vigueur sans
que personne ne l'ait choisie.

Répondez sur la route à portée de session : elle est routée vers le runtime qui possède la
session, donc elle fonctionne quelle que soit la configuration du workspace.

```bash
curl -sX POST http://daemon:4170/session/$SID/permission/$REQUEST_ID \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. Fermer.** `DELETE /session/$SID` → `204`. La session sur disque est conservée.

## Opérations

| Préoccupation          | Où                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Limites de concurrence | `--max-sessions`, `--max-total-sessions` ; les créations au-delà de la limite renvoient `503` avec `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Limitation de débit    | `--rate-limit` plus les drapeaux par classe `--rate-limit-*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Nettoyage d'inactivité     | `--session-idle-timeout-ms` ; maintenir en vie avec `POST /session/:id/heartbeat`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Mémoire           | `--child-heap-mode` est en observation seule. `--memory-budget-mb` contrôle le pool de croissance adaptative du journal live pour `POST /session/:id/load`, pas la relecture SSE ; épingler soit `--max-journal-bytes` soit `--max-journal-events` désactive la croissance. Aucun des deux drapeaux ne dimensionne les enfants ni ne refuse les lancements, ni ne régit leur plafond de heap réel (`--max-old-space-size`, dérivé de la mémoire hôte). Voir [Configuration](./daemon/17-configuration.md) pour le calcul du budget. La relecture SSE est bornée séparément par `--event-ring-size` et un budget fixe de 8 Mio par abonnement ; une queue omise produit `state_resync_required` avec `reason: "replay_budget_exceeded"` |
| Délais de prompt | `--prompt-deadline-ms` ; l'expiration émet `turn_error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Erreurs           | [Taxonomie des erreurs](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Observabilité    | [Observabilité](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Liste complète des drapeaux   | [Configuration](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |