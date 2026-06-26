# Bus d'événements SSE & Contre-pression

## Vue d'ensemble

`EventBus` (`packages/acp-bridge/src/eventBus.ts`) est le système pub/sub en mémoire par session qui alimente la route SSE `GET /session/:id/events` du daemon. Il attribue à chaque événement un identifiant monotone, met en tampon les événements récents dans un anneau borné pour la relecture via `Last-Event-ID`, diffuse les événements publiés à tous les abonnés, applique une contre-pression par abonné (avertissement à 75 % de remplissage de la file, éviction à la capacité maximale) et émet deux trames terminales synthétiques (`client_evicted`, `slow_client_warning`) que le SDK traite comme des événements de première classe, mais que le bus marque **sans `id`** afin qu'ils ne consomment pas de slot dans la séquence par session.

`EventBus` est actuellement privé au paquet `acp-bridge` et consommé par la factory du pont via une instance encapsulée par session. Une future refactorisation (signalée aux lignes 150–159 de `eventBus.ts`) l’élèvera au rang de brique de base, afin que les canaux, les sorties doubles et les futurs transports WebSocket puissent s’abonner au même bus au lieu d’exécuter des flux parallèles.

## Responsabilités

- Attribuer des identifiants d’événements monotones par session, en commençant à 1.
- Mettre en tampon les derniers `ringSize` événements pour une relecture lors d’un abonnement avec `lastEventId`.
- Diffuser les événements publiés à ≤ `maxSubscribers` abonnés simultanés.
- Appliquer des files bornées par abonné ; abandonner les abonnés qui dépassent la capacité avec une trame terminale synthétique `client_evicted`.
- Émettre `slow_client_warning` une fois par épisode de dépassement à 75 % de remplissage de la file, avec une hystérésis de 37,5 % pour éviter les avertissements répétés.
- Résilier les abonnements rapidement sur `AbortSignal.abort()`.
- Fermer proprement chaque abonné à la fermeture du bus (par exemple, lors du démantèlement d’une session).
- Ne jamais lever d’exception depuis `publish` (le contrat est « publish est toujours sûr à appeler »).

## Architecture

| Constante                               | Valeur       | Objectif                                                                                                                       |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `EVENT_SCHEMA_VERSION`                  | `1`          | Apposée sur chaque `BridgeEvent.v` ; incrémentée en cas de modification de trame.                                              |
| `DEFAULT_RING_SIZE`                     | `8000`       | Anneau de relecture par session. Surcharge par l’opérateur via `--event-ring-size`.                                            |
| `DEFAULT_MAX_QUEUED`                    | `256`        | Capacité maximale du backlog par abonné.                                                                                       |
| `DEFAULT_MAX_SUBSCRIBERS`               | `64`         | Capacité maximale d’abonnés par session.                                                                                       |
| `WARN_THRESHOLD_RATIO`                  | `0.75`       | Fraction de `maxQueued` déclenchant `slow_client_warning`.                                                                     |
| `WARN_RESET_RATIO`                      | `0.375`      | Fraction de réarmement de l’hystérésis.                                                                                        |
| `MAX_EVENT_RING_SIZE` (dans `bridge.ts`) | `1_000_000` | Limite haute souple de `BridgeOptions.eventRingSize` pour détecter les dépassements mémoire dus à des fautes de frappe. |

### `BridgeEvent`

```ts
interface BridgeEvent {
  id?: number; // monotonic per session; absent on synthetic terminal frames
  v: 1; // EVENT_SCHEMA_VERSION
  type: string; // one of the 43 known types or future-extensible
  data: unknown; // payload (typed per-type by the SDK; see 09-event-schema.md)
  originatorClientId?: string; // set when the event derives from a clientId-stamped request
}
```

### `SubscribeOptions`

```ts
interface SubscribeOptions {
  lastEventId?: number; // replay from after this id (Last-Event-ID resume)
  signal?: AbortSignal; // aborts the subscription promptly
  maxQueued?: number; // per-subscriber backlog cap; default 256
}
```

`subscribe()` retourne un `AsyncIterable<BridgeEvent>`. La route SSE le consomme avec `for await`. L’enregistrement est **synchrone** — au moment où `subscribe()` retourne, l’abonné est déjà attaché, donc un `publish()` qui entre en compétition avec le premier `next()` du consommateur est tout de même délivré.

### `BoundedAsyncQueue`

La file d’attente par abonné. Deux comportements essentiels :

- **La limite réelle s’applique uniquement aux éléments réels.** Les éléments insérés via `forcePush()` portent une étiquette `forced: true` par entrée et ne comptent jamais dans `maxSize`. Cela permet au chemin de relecture `Last-Event-ID` de forcer l’insertion de centaines de trames historiques dans un nouvel abonné sans déclencher immédiatement la limite réelle et évincer l’abonné qui vient de reprendre.
- **`liveCount` est maintenu comme un champ**, non dérivé de la position de `forcedInBuf`. L’heuristique basée sur la position précédente échouait lorsque `slow_client_warning` commençait à insérer par force en milieu de flux (les avertissements vont à la FIN de la file, pas au début comme les relectures). Les étiquettes `forced` par entrée sont indépendantes de la position.

`push(value)` retourne `false` (au lieu de bloquer ou de lever une exception) lorsque le backlog réel est à la capacité maximale — le bus utilise ce signal pour évincer l’abonné. `forcePush(value)` contourne la limite. `close({drain?: boolean})` vide les éléments en attente par défaut ; le chemin d’abandon passe `drain: false` pour les supprimer immédiatement.
## Workflow

### Publier

```mermaid
flowchart TD
    P["publish({type, data, originatorClientId?})"] --> C{"bus closed?"}
    C -->|yes| RU["return undefined"]
    C -->|no| AID["assign id = nextId++, v = 1"]
    AID --> PR["push to ring (shift if > ringSize)"]
    PR --> FAN["snapshot subscribers, for each sub:"]
    FAN --> EVCK{"sub.evicted?"}
    EVCK -->|yes| NEXT[next subscriber]
    EVCK -->|no| PUSH["sub.queue.push(event)"]
    PUSH --> OK{"accepted?"}
    OK -->|no| EVICT["mark evicted; force-push client_evicted; queue.close; sub.dispose"]
    OK -->|yes| WARN{"!warned && liveSize >= warnThreshold?"}
    WARN -->|yes| FW["force-push slow_client_warning; warned = true"]
    WARN -->|no| RES{"warned && liveSize <= warnResetThreshold?"}
    RES -->|yes| RA["warned = false (hysteresis re-arm)"]
    RES -->|no| NEXT
```

`publish` ne lève jamais d'exception. Fermer le bus en cours de publication (le chemin d'arrêt ferme les bus par session avant d'attendre `channel.kill()`) retourne `undefined` plutôt que de lever une exception, car l'agent peut encore émettre des notifications `sessionUpdate` dans la petite fenêtre entre la fermeture du bus et l'arrêt du canal.

### S'abonner et rejouer (avec détection d'éviction de l'anneau)

```mermaid
sequenceDiagram
    autonumber
    participant SR as SSE route
    participant EB as EventBus
    participant Q as BoundedAsyncQueue

    SR->>EB: subscribe({lastEventId: 42, maxQueued: 256, signal})
    EB->>EB: refuse if subs.size >= maxSubscribers<br/>(throws SubscriberLimitExceededError)
    EB->>Q: new BoundedAsyncQueue(256)
    EB->>EB: subs.add(sub)
    EB->>EB: epochReset = lastEventId >= nextId
    alt epochReset (old bus epoch)
        EB->>Q: forcePush state_resync_required<br/>{ reason: 'epoch_reset', lastDeliveredId: 42, earliestAvailableId: ring[0]?.id ?? nextId }
        Note over EB,Q: id-less synthetic, frame goes BEFORE replay.<br/>Replay scans the whole current ring.
    else same bus epoch
        EB->>EB: earliestInRing = ring[0]?.id
        opt earliestInRing > lastEventId + 1 (gap evicted)
            EB->>Q: forcePush state_resync_required<br/>{ reason: 'ring_evicted', lastDeliveredId: 42, earliestAvailableId: earliestInRing }
            Note over EB,Q: id-less synthetic, frame goes BEFORE replay.<br/>Stream stays open; SDK reducer flips awaitingResync.
        end
    end
    loop ring scan
        EB->>EB: for e in ring where e.id > (epochReset ? 0 : 42)
        EB->>Q: forcePush(e)
    end
    EB->>EB: attach AbortSignal listener<br/>(onAbort → queue.close({drain:false}); dispose)
    EB-->>SR: AsyncIterable
    SR->>Q: next() in for-await loop
```

Si `subs.size >= maxSubscribers` au moment de l'abonnement, `SubscriberLimitExceededError` est levé — la route SSE l'attrape et sérialise une trame synthétique `stream_error` vers le client rejeté, afin qu'il ne voie pas un flux vide silencieux. Retourner un itérable vide à la place laisserait les opérateurs sans visibilité sur le fait que « certains clients reçoivent des événements, d'autres non » sous charge.

### Éviction de l'anneau → `state_resync_required` (flux de récupération)

Lorsqu'un consommateur se reconnecte avec `Last-Event-ID: N` et que le plus ancien événement survivant de l'anneau a un `id > N + 1`, les événements dans `[N+1, earliestInRing-1]` ont été évincés avant que le consommateur ne se reconnecte. La relecture naïve réussirait silencieusement avec un suffixe non contigu, le réducteur SDK continuerait d'appliquer les deltas comme si le flux était contigu, et son état divergerait de la vérité du démon — sans signal terminal.

Implémenté dans `EventBus.subscribe()` :

1. Vérifier d'abord `opts.lastEventId >= this.nextId`. Si vrai, le curseur client provient d'une ancienne époque du bus (redémarrage du démon / reconstruction d'EventBus), donc le bus émet `reason: 'epoch_reset'` et rejoue tout l'anneau actuel.
2. Sinon, calculer `earliestInRing = this.ring[0]?.id`.
3. Si `earliestInRing > opts.lastEventId + 1`, forcer l'insertion d'une trame synthétique **avant** les trames de relecture :
   ```jsonc
   {
     "v": 1,
     "type": "state_resync_required",
     "data": {
       "reason": "ring_evicted",
       "lastDeliveredId": <opts.lastEventId>,
       "earliestAvailableId": <earliestInRing>
     }
   }
   ```
4. Continuer la boucle de relecture normale ensuite.

Contrats critiques (et ce que la revue n°4360 a corrigé) :

- **Pas d'`id`** — même motif sans emplacement que `client_evicted`, donc elle n'occupe pas d'emplacement dans la séquence monotone par session observée par les autres abonnés.
- **Le flux reste ouvert** — contrairement à `client_evicted` (véritablement terminal), `state_resync_required` est orienté récupération. Les trames de relecture et les trames en direct continuent ensuite de circuler.
- **Le réducteur ignore automatiquement les deltas** — le côté SDK bascule `awaitingResync = true` et n'applique que `state_resync_required`, les trames terminales et les instantanés d'état complet jusqu'à ce que le code consommateur appelle `loadSession` et efface le drapeau. Voir [`09-event-schema.md`](./09-event-schema.md) pour `RESYNC_PASSTHROUGH_TYPES`.
- **Économique pour le réseau** — les trames restent sur le fil pour que le SDK puisse calculer plus tard une différence de « ce que vous avez manqué » s'il le souhaite. Aucun cycle de reconnexion supplémentaire n'est nécessaire.
### Flux d'éviction terminal

Lorsque le backlog en direct d'un abonné a atteint `maxQueued` et que le prochain `push()` renvoie `false` :

1. Marquer `sub.evicted = true`.
2. Construire une trame `client_evicted` **sans `id`** — `{ v: 1, type: 'client_evicted', data: { reason: 'queue_overflow', droppedAfter: <last delivered id> } }`.
3. `queue.forcePush(evictionFrame)` pour que l'itérateur consommateur voie une trame terminale.
4. `queue.close()` pour que l'itération se termine après la trame terminale.
5. Appeler `sub.dispose()` — supprime des `subs` et détache l'écouteur `AbortSignal` ; sans ce nettoyage, les fermetures des consommateurs bloqués restent actives jusqu'au garbage collection de `AbortSignal`.

### Flux d'abandon

`AbortSignal.abort()` → `onAbort()` :

1. `queue.close({drain: false})` — supprime les éléments en mémoire tampon pour que la route SSE ne continue pas à sérialiser des événements vers un socket que personne n'écoute.
2. `dispose()` — idempotent via un indicateur `disposed`.

Les signaux déjà abandonnés au moment de l'abonnement appellent `onAbort()` de manière synchrone avant de retourner l'itérateur.

## État et cycle de vie

- `nextId` commence à 1 et ne fait que s'incrémenter. L'accesseur `lastEventId` renvoie `nextId - 1`.
- `ring` est borné ; l'éviction par décalage est en O(n) une fois plein. Avec `ringSize=8000`, cela se mesure en quelques millisecondes sur des sessions à fort volume — bien en dessous du budget de latence par trame. Une refonte en tampon circulaire est reportée jusqu'à ce que le profilage le signale ou que les opérateurs augmentent `--event-ring-size` d'un ordre de grandeur.
- `close()` bascule `closed`, ferme la file de chaque abonné et vide `subs`. Les `publish()` / `subscribe()` ultérieurs sont sans effet (`publish` renvoie `undefined` ; `subscribe` renvoie `emptyAsyncIterable`).
- Chaque session possède un `EventBus`. La fermeture du bus a lieu avant `channel.kill()` afin que les publications en cours lors de l'arrêt renvoient `undefined` plutôt que de lever une exception.

## Dépendances

- Consommé par `packages/acp-bridge/src/bridge.ts` (`BridgeClient.sessionUpdate` / `BridgeClient.extNotification` → `events.publish(...)`).
- Consommé par `packages/cli/src/serve/server.ts` (gestionnaire de route SSE → `events.subscribe(...)` puis formate `BridgeEvent` en trames SSE filaires).
- Ré-export shim : `packages/cli/src/serve/event-bus.ts` → `@qwen-code/acp-bridge/eventBus`.
- Consommateur SDK : `packages/sdk-typescript/src/daemon/sse.ts` (`parseSseStream`), puis `asKnownDaemonEvent` (voir [`09-event-schema.md`](./09-event-schema.md), [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md)).

## Configuration

- `--event-ring-size <n>` — profondeur de l'anneau par session ; plafonné à `MAX_EVENT_RING_SIZE = 1_000_000`.
- Paramètre de requête `?maxQueued=N` de l'abonné sur `GET /session/:id/events`, plage `[16, 2048]`. Les clients SDK effectuent un pré-vol `caps.features.slow_client_warning` avant de s'engager.
- `BridgeOptions.eventRingSize` (remplace la valeur par défaut du démon pour une utilisation embarquée).
- Tags de capacité : `session_events`, `slow_client_warning`, `typed_event_schema`.

## Mises en garde et limites connues

- **Les trames synthétiques n'ont pas d'`id`.** Les consommateurs SDK utilisant la reprise `Last-Event-ID` n'enregistrent que les trames avec des identifiants ; `slow_client_warning`, `client_evicted`, `state_resync_required` et `replay_complete` n'avancent pas le curseur et ne consomment pas les numéros de séquence par session. Si deux trames en direct avec identifiant présentent un écart réel, gérez-le via le chemin de resynchronisation d'éviction d'anneau / réinitialisation d'époque plutôt que de le traiter comme une trame synthétique privée.
- `client_evicted` est **par abonné**, pas par session. Le même client peut se reconnecter.
- L'itérateur `BoundedAsyncQueue` n'est **pas sûr pour des pilotes concurrents** — deux appels `.next()` simultanés entreraient en conflit pour le même événement. L'utilisation du démon est séquentielle (`for await ... of` dans le gestionnaire de route SSE), donc cela est sûr en production.
- Le bus est actuellement privé au package ; les canaux et l'interface web doivent s'abonner via la route HTTP SSE du démon, et non en accédant directement au bus. L'étape 1.5 lèvera cette restriction.

## Références

- `packages/acp-bridge/src/eventBus.ts` (fichier entier)
- `packages/acp-bridge/src/bridge.ts` (sites de publication, en particulier `BridgeClient.sessionUpdate` et les événements de permission F3)
- `packages/cli/src/serve/server.ts` (gestionnaire de route SSE — formate `BridgeEvent` en trames SSE filaires)
- `packages/sdk-typescript/src/daemon/sse.ts` (analyseur SSE filaire côté client)
- Référence filaire : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) (le contrat de reconnexion `Last-Event-ID`).
