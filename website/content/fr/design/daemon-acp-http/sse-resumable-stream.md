# ACP-over-HTTP — Flux d'événements de session avec reprise (`Last-Event-ID`)

> Statut : design + implémentation dans cette PR.
> Comble la lacune de reprise suivie comme RFD Phase 4 dans
> [`README.md`](./README.md) §7 / ligne "Resume cursor (ring `Last-Event-ID`)".

## Problème

Le flux d'événements de session Streamable-HTTP `/acp` (`GET /acp` avec un en-tête `Acp-Session-Id`) est **en temps réel uniquement (live-only)** : il n'émet pas de séquence SSE `id:` et ne prend pas en charge l'en-tête de requête `Last-Event-ID` lors de la reconnexion.

Lorsqu'un proxy du control-plane ferme pour inactivité la connexion SSE de longue durée en plein tour (le démon lui-même envoie `retry: 3000`, et les proxies d'entrée coupent fréquemment les SSE longues), le client se reconnecte et récupère la propriété, mais **chaque trame de contenu produite par le démon pendant l'interruption est perdue** — les notifications `session/update` contenant `agent_thought_chunk` / `agent_message_chunk`. Le tour atteint tout de même un état terminal (un `turn_complete` est produit / synthétisé), l'UI affiche donc "done" avec un corps vide ou tronqué. Renvoyer le même prompt fonctionne, ce qui est révélateur : la perte se situe dans l'interruption du transport, pas dans le modèle.

Les symptômes et les preuves terrain sont catalogués dans les notes d'intégration sous la référence **§1.8** (`sdk-known-issues.md`).

## Ce qui existe déjà (et pourquoi c'est simple)

Le moteur de replay est **déjà construit et éprouvé** — la seule lacune est que le transport `/acp` n'y est pas connecté.

`packages/acp-bridge/src/eventBus.ts` :

- `id` monotone par session, commençant à 1 (`nextId`, assigné dans
  `publish()`).
- Ring buffer borné par session (`DEFAULT_RING_SIZE = 8000`, surcharge
  opérateur `qwen serve --event-ring-size`).
- `subscribeEvents(sessionId, { lastEventId, signal })` rejoue les trames du ring
  avec `id > lastEventId` avant que les événements en temps réel ne circulent, et émet les
  trames de contrôle synthétiques `replay_complete`, `state_resync_required` (évincé du ring /
  réinitialisation d'époque au redémarrage du démon), `client_evicted`, `slow_client_warning`.

La surface **REST** `GET /session/:id/events` consomme déjà tout cela : elle lit `last-event-id` (`server.ts` → `parseLastEventId`), le passe à `subscribeEvents`, et sérialise chaque trame avec une ligne SSE `id:` (`formatSseFrame`). Le bug est que le transport **`/acp`** ne fait rien de tout cela :

| Couche                                    | REST `/session/:id/events` | `/acp` GET (actuellement)                     |
| ----------------------------------------- | -------------------------- | --------------------------------------------- |
| lit l'en-tête `Last-Event-ID`             | oui                        | **non**                                       |
| passe `lastEventId` à `subscribeEvents`   | oui                        | **non** (`dispatch.ts pumpSessionEvents`)     |
| émet la ligne SSE `id:`                   | oui (`formatSseFrame`)     | **non** (`SseStream.send` écrit `data:` seul) |

`acp-http/sse-stream.ts` le dit même dans un commentaire : _"pas de séquençage `id:` du ring-buffer — la reprise est RFD Phase 4, reportée."_ Cette PR lève ce report.

## Décision de wire — Ligne SSE `id:` (pas de `_meta` dans la charge utile)

Les deux surfaces SSE transportent des **charges utiles différentes** :

- REST diffuse des **enveloppes `BridgeEvent`** (`{ id, v, type, data, _meta }`).
  Le parser SDK (`sdk-typescript/src/daemon/sse.ts`) extrait le curseur
  depuis le **champ `id` de l'enveloppe JSON** (il ne lit que les lignes `data:`).
- `/acp` diffuse des **objets JSON-RPC 2.0 bruts** (notifications `session/update`,
  requêtes `session/request_permission`, réponses). Celles-ci
  n'ont pas d'`id` d'enveloppe pour transporter un curseur de bus, et un `id` JSON-RPC signifie
  autre chose (id de requête).

Ainsi, pour `/acp`, le curseur de reprise est la **ligne SSE `id:` standard** :

- C'est natif EventSource — un client SSE conforme à la spec (y compris le
  `AcpHttpTransport` intégré) suit automatiquement le dernier `id:` et le renvoie
  automatiquement comme en-tête `Last-Event-ID` lors de la reconnexion.
- Cela garde la charge utile JSON-RPC propre (pas d'injection `_meta.qwen.eventId`
  non standard dans les trames du protocole).
- Cela reflète ce que `formatSseFrame` émet déjà sur REST, donc les deux surfaces
  partagent les **mêmes** ids `eventBus` et la même sémantique `Last-Event-ID`.

Seules les trames **issues du bus** portent un `id:` (`session/update`, `session/request_permission`, notifications poussées par le démon). Les **réponses/répliques** JSON-RPC qui transitent par le flux de session ne sont _pas_ des événements bus et ne portent **aucun** `id:` — elles ne sont pas dans le ring et ne sont intentionnellement pas suivies pour le replay (une _réponse_ de prompt en vol perdue est le problème §1.7 suivi séparément, hors périmètre ici ; §1.8 concerne les trames de _contenu_ perdues, qui sont toutes des événements bus `session/update`).

Les trames terminales synthétiques (`client_evicted`, `stream_error`, …) n'ont pas d'`id` de bus et n'émettent donc pas de ligne `id:` — ce qui correspond à REST, afin qu'elles ne consomment pas un emplacement dans la séquence monotone depuis laquelle le client reprend.

## Modifications

1. **`transport-stream.ts`** — `send(message, id?: number)`. L'`id`
   optionnel est l'id d'événement bus pour le suivi du curseur SSE.
2. **`sse-stream.ts`** — `send(message, id?)` préfixe `id: ${id}\n` avant
   la ligne `data:` quand `id !== undefined` (reflète `formatSseFrame`).
3. **`ws-stream.ts`** — `send(message, id?)` accepte et **ignore** `id` :
   WebSocket est une connexion stateful, pas de replay SSE (cohérent avec
   `AcpWsTransport.supportsReplay = false`).
4. **`connection-registry.ts`** — `sendSession(sessionId, frame, id?)`
   transmet `id` à `stream.send`. Le **buffer** pré-attach par session
   stocke des paires `{ frame, id? }` afin qu'une trame en buffer conserve son curseur lors
   du flush à l'attachement. (Le buffer au niveau de la connexion est inchangé — ces
   trames sont des réponses JSON-RPC sans id bus.)
5. **`dispatch.ts`**
   - `translateEvent` transmet `event.id` à travers chaque appel `sendSession` /
     `binding.stream.send` pour les événements bus.
   - `pumpSessionEvents(conn, sessionId, signal, lastEventId?)` transmet
     `lastEventId` à `subscribeEvents` — réutilisant directement le
     replay du ring existant.
6. **`index.ts`** — la branche session-stream de `GET /acp` lit l'en-tête
   `Last-Event-ID` (via un `parseLastEventId` strict, même règle acceptant uniquement
   les chiffres décimaux que REST) et le passe à `pumpSessionEvents`.

Aucune modification de `eventBus`/bridge — le moteur est réutilisé tel quel.

## Faire en sorte que la reprise s'active réellement (délai de grâce et récupération du flux de session)

Le câblage `id:`/`Last-Event-ID` ci-dessus est nécessaire mais **pas suffisant** — à lui seul, il ne se déclenche jamais dans le flux réel. Auparavant, lorsqu'un flux SSE de session se fermait au niveau du transport, le gestionnaire GET exécutait le démontage **complet** de `closeSessionStream` : il retirait la session de `ownedSessions`, annulait le prompt en vol et détachait le client bridge. Dans l'ordre réel EventSource/proxy (l'ancien socket se ferme _d'abord_, puis le client se reconnecte), cela signifie qu'une reconnexion portant `Last-Event-ID` est rejetée avec un **403** par la vérification de propriété avant même que le curseur ne soit lu — et le prompt produisant le contenu était déjà annulé. Le moteur de replay n'aurait rien auquel se reconnecter.

Ainsi, une fermeture de flux de session au niveau du transport **détache** désormais au lieu de démonter (`AcpConnection.detachSessionStream`) : il arrête uniquement le flux + son abonnement aux événements et **maintient le binding, la propriété, le prompt en vol et l'enregistrement du client bridge** en vie pendant une fenêtre de grâce (`SESSION_GRACE_MS`, en miroir de `CONN_GRACE_MS`). Une reconnexion dans cette fenêtre rattache (`attachSessionStream` efface le timer de grâce — récupération) et le replay du ring comble le vide. Si aucune reconnexion n'arrive, le timer de grâce exécute le démontage complet — limitant le coût d'un prompt qui s'emballe. Le démontage complet reste immédiat pour un `session/close` explicite et pour le démontage de connexion (`destroy`). Le gestionnaire GET bifurque sur `stream.isClosed` : une fermeture du transport → détachement-avec-grâce ; une pompe qui se termine alors que le flux est encore ouvert (sous-processus terminé / erreur d'itérateur) → fermeture complète (flux zombie).

### Deux gardes-fous de correction du replay que cela déverrouille

Les deux sont latents jusqu'à ce que la reprise s'exécute réellement ; le délai de grâce/récupération ci-dessus les rend accessibles, ils sont donc livrés ensemble :

- **Pas de double livraison ET pas de perte silencieuse (buffer ↔ ring).** Un événement bus
  en buffer est _aussi_ dans le ring EventBus (il y a été publié pour obtenir son id).
  Donc lors d'une reprise (`Last-Event-ID` présent), `attachSessionStream` reçoit le
  curseur et **ne flush pas du tout les trames en buffer portant un id** — le replay
  du ring (démarré au curseur du client) est l'unique chemin de livraison pour chaque
  événement bus après le curseur. Ce n'est délibérément _pas_ "flusher le buffer, puis
  avancer le curseur de replay au-delà" : une trame envoyée au socket maintenant mort mais
  jamais reçue par le client a un id _inférieur_ aux ids du buffer mais _supérieur_ au
  curseur du client, donc avancer le curseur au-delà du buffer la **ferait tomber
  silencieusement**. Laisser le ring posséder tous les événements bus livre chacun exactement une fois sans
  vide. Les trames sans _id_ (réponses JSON-RPC routées via `replySession`) ne sont pas des événements
  du ring, donc le ring ne les relivrera pas — mais elles ne doivent pas non plus être flushées à
  l'attachement : un _résultat_ `session/prompt` en buffer flushé avant le replay
  arriverait avant les chunks de contenu qui l'ont précédé (le client voit "done" avant
  le corps — exactement l'échec de corps tronqué que §1.8 corrige). Donc lors de la reprise, les
  trames sans id sont **reportées** : laissées dans le buffer, et la pompe d'événements les libère
  (`flushBufferedSessionFrames`) une fois le replay vidé — sur `replay_complete`
  **uniquement**, en préservant l'ordre original du flux. Crucialement PAS sur
  `state_resync_required` : l'EventBus émet cette trame _avant_ les trames
  de replay (puis émet toujours `replay_complete` à la fin), donc flusher dessus
  mettrait la réponse avant le contenu rejoué. Le cas live-only (pas de
  `Last-Event-ID` ⇒ pas de replay ⇒ pas de `replay_complete`) est couvert par le flush
  de sécurité post-boucle de la pompe. (Une nouvelle connexion sans `Last-Event-ID` n'a pas d'ancre
  de ring, donc elle flush tout le buffer immédiatement, dans l'ordre, comme avant.)
- **`permission_request` idempotent sous replay.** Une `permission_request` est
  un événement de ring portant un id, donc une reconnexion dont le curseur précède une permission encore
  sans réponse la rejoue. `translateEvent` réutilise désormais l'entrée
  `conn.pending` existante pour ce `bridgeRequestId` (renvoyant le même id
  JSON-RPC sortant pour le rattrapage) au lieu de créer un second id + entrée — pas de pending
  orphelin, pas de double-prompt pour un client qui déduplique sur `_meta.requestId`.

`parseLastEventId` est extrait dans un `serve/sse-last-event-id.ts` partagé utilisé par les surfaces REST et `/acp`, afin que leurs règles strictes d'acceptation/rejet et les logs opérateur ne puissent pas diverger.

## Rétrocompatibilité

- **Les anciens clients qui n'envoient pas `Last-Event-ID`** → `lastEventId` est
  `undefined` → `subscribeEvents` démarre en live, exactement comme aujourd'hui.
- **L'ajout de lignes `id:` est rétrocompatible SSE** — un client qui ignore
  le champ n'est pas affecté ; un client basé sur EventSource commence à le suivre
  gratuitement.
- **Le `AcpHttpTransport` du SDK intégré opte pour le replay dans cette PR** —
  il définit `supportsReplay = true` et renvoie `Last-Event-ID` à la reconnexion,
  afin que les trames manquantes soient rejouées depuis le ring et que la perte de contenu §1.8 soit
  corrigée **sans autre modification du démon nécessaire**. (Le basculement séparé du transport
  externe `agent-web` reste reporté — voir Hors périmètre.) La modification
  du démon reste inerte pour tout consommateur qui signale encore
  `supportsReplay = false` et omet l'en-tête.
- La surface REST est intacte.

## Plan de test

- `sse-stream.test.ts` — `send(msg, 7)` émet `id: 7\n` avant `data:` ;
  `send(msg)` (sans id) omet la ligne `id:` ; ordre `id:` → `data:` →
  ligne vide.
- `transport.test.ts` (de bout en bout sur le transport `/acp`) :
  - les trames `session/update` en live arrivent désormais avec une ligne `id:` ;
  - un `GET /acp` portant `Last-Event-ID: N` transmet le curseur à
    `subscribeEvents` ; un nouveau flux sans en-tête se comporte comme aujourd'hui ;
  - un `Last-Event-ID` overflow (> `MAX_SAFE_INTEGER`) → live-only ;
  - **ordre réel fermeture-puis-reconnexion** : fermer l'ancien SSE _d'abord_, puis
    se reconnecter avec `Last-Event-ID` — assert **200 et non 403** (propriété conservée)
    et le prompt n'est **pas** annulé (grâce/récupération) ;
  - une `permission_request` rejouée réutilise l'entrée pending (même id sortant).
- `connection-registry.test.ts` — un attachement sans reprise flush tout le buffer
  en transmettant l'`id` de chaque trame ; un attachement de **reprise** (curseur présent) ignore les
  trames portant un id (le replay du ring les possède) mais flush toujours les réponses JSON-RPC
  sans id ; `detachSessionStream` conserve la propriété/le prompt à travers la fenêtre de grâce
  puis démonte à l'expiration ; une reconnexion dans la fenêtre récupère (annule le
  démontage en attente).
- `ws-stream.test.ts` — `send(msg, id)` ignore l'id : la trame wire WS est le
  JSON brut, aucun encadrement SSE `id:` ne fuite.

## Hors périmètre (toujours reporté)

- Transports WebSocket / HTTP/2.
- Résolution de permission inter-connexions §1.7 (un vote POSTé sur un
  `Acp-Connection-Id` différent de celui qui a diffusé le prompt) — un problème séparé,
  sensible pour la sécurité, suivi comme son propre follow-up. Cette PR rend
  bien la traduction de `permission_request` idempotente sous replay (ci-dessus), mais n'ajoute
  pas la résolution de requestId globale à la session. Elle n'ajoute pas non plus
  **l'idempotence de replay de réponse pour une permission DÉJÀ RÉSOLUE** : une fois que le
  client a voté, l'entrée pending est consommée, donc une reconnexion ultérieure qui
  rejoue la `permission_request` (toujours dans le ring) renvoie le prompt avec le
  même `_meta.requestId`. Un client conforme déduplique sur cet id (le contrat
  sur lequel le chemin de replay s'appuie déjà) et l'entrée pending orpheline résiduelle est
  nettoyée au démontage — l'agent ne bloque jamais — mais enregistrer les résultats résolus
  dans un LRU borné par session pour renvoyer le vote enregistré (idempotence complète
  pour les clients non-dédupliquants) appartient à ce même follow-up de coordination
  des permissions, car cela ajoute un état de permission résolue au chemin de vote.
- La _réponse de prompt_ en vol perdue sur le flux de session — les trames de contenu
  récupérées transitent toutes par le ring `eventBus` ; une réponse JSON-RPC n'est
  pas un événement de ring.
- Basculement côté consommateur de `supportsReplay` dans le `AcpHttpTransport`
  externe `agent-web` (vit dans un repo différent ; débloqué par cette PR).
- **Vote de permission via les transports SDK exportés.** Les
  `AcpHttpTransport`/`AcpWsTransport` exportés exposent `session/request_permission` comme un
  événement `permission_request`, mais les APIs de vote du SDK
  (`respondToPermission` / `respondToSessionPermission`) correspondent à une
  requête `session/permission` pour laquelle le démon ACP n'a pas de handler — il n'accepte
  un vote de permission que comme _réponse_ JSON-RPC faisant écho à l'id sortant
  `_qwen_perm_N`. Câbler l'aller-retour du vote fait partie du follow-up de coordination
  des permissions §1.7. Une facette connexe : la **pompe de réponse** de session sans abonné
  (`ensureSessionReplyPump`) ouvre un vrai flux de session `GET /acp`,
  que le démon traite comme un flux live — donc une `permission_request` d'agent
  levée alors que seule la pompe de réponse est attachée est ROUTÉE vers
  ce flux et supprimée par la pompe (elle ne transmet que les réponses JSON-RPC),
  bloquant le médiateur, alors que sans flux du tout le démon annule-refuse
  et l'agent proceed. La distinction côté démon "est-ce un vrai consommateur ou juste
  une pompe de réponse ?" et la gestion côté SDK (refuser localement / remonter
  à un callback de permission) appartiennent au même follow-up de coordination
  des permissions, car la pompe ne peut pas elle-même émettre un vote. Les consommateurs qui ont besoin
  de gestion de permissions doivent ouvrir `subscribeEvents` avant d'émettre des RPCs de session
  (le contrat documenté), ce qui donne au démon un vrai flux consommateur.
- **RPCs de session émis depuis l'intérieur de la boucle `subscribeEvents` sur l'
  `AcpHttpTransport` exporté.** Le flux de session `/acp` est à lecteur unique : tandis qu'un
  générateur async du consommateur est garé entre les `yield`s, le lecteur ne
  draine pas. Si le consommateur `await` un RPC routé vers la session (`session/set_model`,
  `session/prompt`, …) depuis sa propre boucle de gestion d'événements, `sendRequest`
  supprime la pompe de réponse en arrière-plan (un abonnement est "actif") mais le
  générateur garé ne lit jamais la réponse — l'appel reste bloqué jusqu'à ce que le consommateur
  tire le prochain événement. La correction robuste est de faire du lecteur de session une
  pompe en arrière-plan qui draine toujours les réponses JSON-RPC et met en file d'attente uniquement
  les `DaemonEvent`s pour l'itérateur ; reporté comme un follow-up ciblé car c'est un
  changement structurel pour un transport opt-in, nouvellement exporté, et n'affecte pas
  le transport REST par défaut.
- **Garde automatisée pour la dérive `SESSION_STREAM_REPLY_METHODS` ⇄ `replySession`.** L'ensemble
  `SESSION_STREAM_REPLY_METHODS` du SDK doit refléter les sites d'appel
  `replySession(...)` du démon dans `dispatch.ts` (un package différent) ; une méthode
  ajoutée là-bas sans l'ajouter ici n'ouvre aucune pompe de réponse et un
  `sendRequest` sans abonné pour celle-ci reste bloqué jusqu'à l'abort. Le système de types d'aucun des packages n'impose
  cela. Une garde CI (un script léger ou vitest qui extrait les noms de méthodes de
  réponse de session du démon et les compare à l'ensemble du SDK) est la bonne
  correction, mais l'outillage d'analyse statique inter-packages est sa propre tâche ciblée — et
  pas un simple grep trivial : un extracteur correct a besoin d'une analyse de flux de données légère, car
  la réponse de `session/prompt` n'est PAS émise à l'intérieur de son bloc
  `case 'session/prompt'`. Le prompt démarre de manière asynchrone et son `replySession(...)` se déclenche
  plus tard depuis le handler de complétion du prompt (un site d'appel différent), donc un scan naïf
  "quels blocs `case` contiennent `replySession`" EXCLURAIT à tort
  `session/prompt` et ferait échouer le build par rapport à un ensemble correct. L'ensemble est petit et
  stable en attendant, et la JSDoc sur la constante documente l'invariant ;
  la correction robuste à long terme est de faire en sorte que le démon annonce ses noms de méthodes
  routées vers la session (une source de vérité partagée) plutôt que de scraper `dispatch.ts`.