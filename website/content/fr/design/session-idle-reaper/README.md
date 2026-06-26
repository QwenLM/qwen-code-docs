# Session Idle Reaper — Document de Conception

**Statut :** Brouillon  
**Auteur :** qinqi  
**Date :** 2026-06-08  
**Portée :** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Énoncé du problème

### 1.1 Comportement actuel

Une fois créée, une session bridge réside en mémoire (`byId: Map<string, SessionEntry>`) indéfiniment. Elle n'est détruite que lorsque :

1. Un client appelle explicitement `DELETE /session/:id` (`closeSession`)
2. Le processus enfant `qwen --acp` partagé plante (gestionnaire `channel.exited`)
3. Le processus démon reçoit `SIGTERM` / `SIGINT` (`shutdown`)

Il n'y a **aucun délai d'inactivité automatique** pour les sessions. Les horodatages de heartbeat (`sessionLastSeenAt`, `clientLastSeenAt`) sont enregistrés par `recordHeartbeat` mais jamais consommés à des fins d'expulsion (le commentaire du champ fait référence à une future "politique de révocation (PR 24)" qui n'a pas été implémentée).

### 1.2 Impact

| Scénario                                                                        | Symptôme                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| L'utilisateur ouvre plusieurs onglets de navigateur, les ferme sans appeler `DELETE /session` | Les sessions s'accumulent dans `byId`, chacune contenant un ring EventBus (~2-4 Mo)          |
| 20 sessions (`maxSessions` par défaut) s'accumulent                                  | `SessionLimitExceededError` lors d'un nouveau `spawnOrAttach` — l'utilisateur est bloqué            |
| Démon de longue durée avec rotation d'onglets                                                | Croissance mémoire illimitée dans les rings de rejeu EventBus et l'état de session côté ACP |
| Redémarrage / plantage de l'extension IDE                                                | Sessions orphelines jamais nettoyées                                              |

### 1.3 Pourquoi maintenant

Le démon est de plus en plus utilisé comme serveur d'espace de travail longue durée (application de bureau, extensions IDE, interface web). Les plantages de clients et les perturbations réseau sont normaux — compter sur un `DELETE` explicite pour le nettoyage est intenable.

---

## 2. Objectifs de conception

1. **Réclamer automatiquement les sessions inactives** dont les clients ont disparu et qui n'ont aucun travail en cours actif.
2. **Ne jamais détruire une session qui a une invite active** — cela tuerait silencieusement un travail visible par l'utilisateur.
3. **Préserver les données de session persistées** — seul l'état bridge en mémoire est libéré ; les transcriptions disque (`SessionService`) ne sont pas touchées. Les utilisateurs peuvent utiliser `session/load` ou `session/resume` pour restaurer.
4. **Observable** — émettre un événement SSE distinct pour que les clients sachent POURQUOI la session s'est fermée (délai d'inactivité vs fermeture explicite vs plantage).
5. **Configurable** — les opérateurs et les tests peuvent ajuster les délais ou désactiver complètement le reaper.
6. **Zéro nouvelle dépendance / composant** — implémenter entièrement dans la fermeture bridge existante.

### Non-objectifs

- Gestion de session multi-espace de travail (ce serait une préoccupation de passerelle).
- Expulsion LRU à la limite de `maxSessions` (précieux mais travail séparé — suivi comme tâche ultérieure).
- Compactage du ring EventBus pour les sessions inactives (faible priorité étant donné la limite de 20 sessions ; suivi comme tâche ultérieure).
- Pression adaptative basée sur RSS (nécessite une interrogation `process.memoryUsage()` et une conception de politique ; suivi comme tâche ultérieure).

---

## 3. Architecture

### 3.1 Aperçu

```
Fermeture Bridge (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← existant
├─ channelInfo: ChannelInfo               ← existant
├─ idleTimer (niveau canal)              ← existant
│
└─ sessionReaper: NodeJS.Timeout          ← NOUVEAU
     │
     ├─ parcourt byId toutes les REAP_INTERVAL_MS
     ├─ ignore les sessions avec invite active
     ├─ ignore les sessions avec abonnés SSE actifs
     ├─ ferme les sessions dépassant le TTL d'inactivité
     └─ émet session_closed { reason: 'idle_timeout' }
```

### 3.2 Relation avec les mécanismes existants

| Mécanisme                                 | Portée                     | Ce qu'il gère                                                                  |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | Canal (processus enfant)   | Tue le processus `qwen --acp` enfant lorsque TOUTES les sessions sont parties                          |
| **Session reaper** (cette conception)          | Session (entrée mémoire) | Ferme les sessions individuelles lorsqu'elles sont inactives                                             |
| Balayage de `ConnectionRegistry`                | Connexion ACP-over-HTTP  | Réclame les connexions de couche transport `/acp` (couche différente)                       |
| `writerIdleTimeoutMs`                     | Abonné SSE            | Expulse un seul abonné SSE bloqué                                             |
| Reaper de déconnexion (server.ts)             | Handshake de spawn           | Réclame les sessions dont le propriétaire du spawn s'est déconnecté PENDANT la phase POST /session |

Deux mécanismes fonctionnent ensemble pour couvrir le nettoyage du cycle de vie des sessions :
1. **Fermeture après dernier détachement** (principal) — lorsque `detachClient` supprime le dernier
   client enregistré ET qu'il n'y a plus d'abonnés SSE, la session est fermée
   immédiatement via `closeSessionImpl`. Cela gère le chemin normal : l'utilisateur
   ferme un onglet → nettoyage React → `POST /session/:id/detach`.

2. **Réanimateur de sessions inactives** (filet de sécurité) — balayage périodique des sessions sans
   prompt actif et sans abonnés SSE qui n'ont pas reçu de battement de cœur
   dans le TTL configuré. Cela couvre le chemin de plantage : navigateur tué,
   réseau perdu, `kill -9` — la demande de détachement n'a jamais été envoyée, donc
   `clientIds` montre toujours des clients enregistrés mais la session est effectivement
   orpheline.

---

## 4. Conception détaillée

### 4.1 Nouvelles options de configuration (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... existing fields ...

  /**
   * How often the session reaper scans `byId` for idle sessions, in
   * milliseconds. Default: 60_000 (1 minute). Set to 0 or Infinity to
   * disable the reaper entirely. The timer is `.unref()`'d.
   */
  sessionReapIntervalMs?: number;

  /**
   * A session with ZERO live SSE subscribers AND ZERO registered clients
   * that has not received a heartbeat for this many milliseconds is
   * considered idle and will be reaped.
   *
   * Default: 30 * 60_000 (30 minutes).
   * Set to 0 or Infinity to disable idle reaping.
   */
  sessionIdleTimeoutMs?: number;
}
```

**Interface CLI** (drapeaux `qwen serve`) :

```
--session-reap-interval-ms <ms>   Intervalle de balayage du réanimateur (défaut 60000, 0=désactiver)
--session-idle-timeout-ms <ms>    Seuil d'inactivité (défaut 1800000, 0=désactiver)
```

### 4.2 Prédicat de session inactive

Une session est éligible à la récupération lorsque **toutes** les conditions suivantes sont remplies :

1. **Aucun prompt actif** : `entry.promptActive === false`
2. **Aucun abonné SSE actif** : `entry.events.subscriberCount === 0`
3. **Durée d'inactivité dépassée** : `now - lastActivity(entry) > sessionIdleTimeoutMs`

Remarque : le réanimateur ne vérifie intentionnellement PAS `clientIds.size`. Il couvre
le chemin de plantage où le détachement n'a jamais été envoyé — `clientIds` montre toujours
des clients enregistrés mais la session est effectivement orpheline. Le chemin normal
(le client envoie le détachement) est géré par la fermeture après dernier détachement.

Où `lastActivity(entry)` est défini comme :

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` is epoch-ms (from Date.now());
  // `createdAt` is an ISO 8601 string — parse to epoch-ms as fallback.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Remarque : `entry.createdAt` est typé comme `string` (ISO 8601), pas comme un nombre.
`Date.parse` est sûr ici — le format est toujours `new Date().toISOString()`
(voir `createSessionEntry`, bridge.ts:1883).

**Justification de chaque garde :**

| Garde                | Pourquoi                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aucun prompt actif   | Un prompt autonome / sans tête (ex. pipe CLI, tâche cron) peut être en cours sans abonné SSE. Le récupérer tuerait le travail.                                |
| Aucun abonné SSE     | Un client connecté écoute activement. Même s'il n'a pas envoyé de battement de cœur, la connexion SSE elle-même prouve l'activité.                              |
| Durée d'inactivité   | Période de grâce pour que des clients brièvement déconnectés puissent se reconnecter sans perdre leur session.                                                  |

### 4.3 Action de récupération (reap)

Pour chaque session qui réussit le prédicat d'inactivité, le réanimateur appelle :

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Cela réutilise le chemin `closeSession` existant qui :

1. Supprime de `byId` / `defaultEntry`
2. Annule les permissions en attente via `permissionMediator.forgetSession`
3. Publie l'événement `session_closed` (avec `reason: 'idle_timeout'`)
4. Ferme l'EventBus
5. Envoie `connection.cancel()` à l'enfant ACP (au mieux)
6. Déclenche `startIdleTimer` sur le canal si c'était la dernière session

**Pourquoi `closeSession` et non `killSession` ?**

`killSession` est le chemin de forçage interne conçu pour la course de déconnexion
du handshake de création (`requireZeroAttaches` guard, `spawnOwnerWantedKill` tombstone).
`closeSession` est le chemin documenté côté client qui publie
`session_closed` (pas `session_died`) et gère correctement la télémétrie. Le réanimateur
est une "fermeture gracieuse au nom d'un client absent", donc `closeSession` est la
sémantique appropriée.

### 4.4 Extension de `closeSession` pour accepter une raison de fermeture

Actuellement, `closeSession` code en dur `reason: 'client_close'` dans l'événement
`session_closed`. Nous devons rendre ceci paramétrable.

**Approche :** Ajouter un nouveau paramètre `opts` optionnel à `closeSession` plutôt que
de surcharger `BridgeClientRequestContext` (qui est un type limité à la requête
client — y ajouter `reason` serait une violation de couche car "raison" est une
décision côté serveur, pas quelque chose qu'un client passe dans un en-tête).

```typescript
// bridgeTypes.ts — new type + signature change:
export interface CloseSessionOpts {
  /** Override the default 'client_close' reason in the session_closed event. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```
```typescript
// bridge.ts — implementation change:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Les appelants existants (route `DELETE /session/:id`) ne passent pas `opts`, ce qui par défaut donne
`'client_close'`. Le faucheur passe `{ reason: 'idle_timeout' }`.

### 4.5 Cycle de vie du faucheur

```typescript
// Inside createHttpAcpBridge closure:

const resolvedReapIntervalMs = resolvePositiveMs(
  opts.sessionReapIntervalMs,
  60_000,
);
const resolvedIdleTimeoutMs = resolvePositiveMs(
  opts.sessionIdleTimeoutMs,
  30 * 60_000,
);

let sessionReaper: ReturnType<typeof setInterval> | undefined;

function startSessionReaper(): void {
  if (resolvedReapIntervalMs <= 0 || resolvedIdleTimeoutMs <= 0) return;
  sessionReaper = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    for (const [id, entry] of byId) {
      if (entry.promptActive) continue;
      if (entry.events.subscriberCount > 0) continue;
      const lastActive = entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
      const idle = now - lastActive;
      if (idle < resolvedIdleTimeoutMs) continue;
      writeStderrLine(
        `qwen serve: reaping idle session ${JSON.stringify(id)} ` +
          `(idle for ${Math.round(idle / 1000)}s, threshold ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Pass `undefined` context (no client) and `{ reason }` opts.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: session reaper failed to close ${JSON.stringify(id)}: ${String(err)}`,
          );
        });
    }
  }, resolvedReapIntervalMs);
  sessionReaper.unref();
}

function stopSessionReaper(): void {
  if (sessionReaper !== undefined) {
    clearInterval(sessionReaper);
    sessionReaper = undefined;
  }
}
```

Note : `bridgeImpl` fait référence à l’objet pont retourné par `createHttpAcpBridge`,
donc `closeSession` a un accès complet à l’état de la fermeture. En pratique, cela
est implémenté comme un appel direct à la fonction interne `closeSessionImpl`.

**Intégration dans le cycle de vie :**

- `startSessionReaper()` est appelée à la construction du pont (après la validation
  des options, en parallèle de la configuration existante de `channelIdleTimeoutMs`).
- `stopSessionReaper()` est appelée dans `shutdown()` et `killAllSync()`.

### 4.6 Interaction avec les appelants existants de `closeSession`

| Appelant                     | Impact                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| Route `DELETE /session/:id`  | Aucun — pas de `opts` passé, par défaut `reason: 'client_close'`   |
| Faucheur de session (cette conception) | Passe `opts: { reason: 'idle_timeout' }`                          |
| Récolte différée de `detachClient` | Appelle `killSession` (pas `closeSession`), non affecté            |
| Gestionnaire `channel.exited` | Publie `session_died`, non affecté                                 |
| `shutdown()`                 | Publie `session_died` avec raison `daemon_shutdown`, non affecté   |

### 4.7 Sécurité de la concurrence

La fonction de rappel du faucheur s’exécute dans la boucle d’événements Node.js. Points clés :

- **L’itération `for...of` est synchrone.** Le faucheur évalue le prédicat d’inactivité
  de chaque entrée de manière synchrone, puis lance `closeSession(...).catch(...)` pour les
  entrées correspondantes. Pas de `await` dans le corps de la boucle – toutes les fermetures
  sont déclenchées dans une seule frontière de microtâche, puis la boucle se termine.
- **`byId.delete` est différée.** Dans `closeSession`, `byId.delete` s’exécute
  APRÈS le premier `await` (`notifyAgentSessionClose`). Cela signifie que les suppressions
  ont lieu dans des microtâches après la fin de la boucle `for...of`. Comme chaque
  `closeSession` opère sur une clé distincte, il n’y a pas d’aliasing. Et `for...of`
  a déjà fini d’itérer, donc une suppression en cours d’itération n’est pas un problème.
- **Concurrence de double fermeture.** Si un client appelle `DELETE /session/:id` pour la même
  session entre la vérification du prédicat par le faucheur et l’exécution asynchrone de
  `closeSession`, le `closeSession` du faucheur lèvera une `SessionNotFoundError`
  (attrapée par `.catch()`). Sans danger.
- **Concurrence de reconnexion.** Si un client se reconnecte à une session (enregistre clientId /
  ouvre SSE) entre la vérification du prédicat par le faucheur et l’exécution de `closeSession`,
  `closeSession` se poursuivra et fermera la session. Le client reçoit `session_closed` et doit
  recharger. Cette fenêtre est extrêmement étroite (un seul tick synchrone de `setInterval`)
  et la conséquence est bénigne – pas de perte de données, juste une invite de rechargement.
  Le TTL par défaut de 30 minutes rend cela extrêmement rare.
- Un `spawnOrAttach` concurrent qui crée une nouvelle session pendant que le faucheur
  scanne ne sera pas vu (nous itérons les entrées `byId` au début de chaque tick).
  C’est sans danger – les nouvelles sessions sont fraîches et ne rempliront pas le seuil d’inactivité.
### 4.8 Changement de format filaire

Le champ `data.reason` de l'événement `session_closed` existe déjà avec la valeur
`'client_close'`. Nous ajoutons deux nouvelles valeurs :

- `'idle_timeout'` — émis par le récupérateur d'inactivité (filet de sécurité pour les clients plantés)
- `'last_client_detached'` — émis par fermeture-sur-dernier-détachement (fermeture normale d'onglet)

Ce changement est rétrocompatible — le code SDK existant qui vérifie
`reason === 'client_close'` ne correspondra simplement pas aux nouvelles valeurs, et le
gestionnaire générique de trames terminales (`isTerminalLifecycleEvent`) gère déjà
`session_closed` quel que soit le motif.

---

## 5. Plan de test

### 5.1 Tests unitaires (`bridge.test.ts`)

| #   | Test                                                                   | Description                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Session inactive récupérée après expiration du délai                   | Créer une session, avancer le temps au-delà de `sessionIdleTimeoutMs`, déclencher le tick du récupérateur, vérifier que la session est retirée de `byId` et que l'événement `session_closed` est publié avec `reason: 'idle_timeout'` |
| 2   | Session avec une requête active N'EST PAS récupérée                    | Créer une session, démarrer une requête, avancer le temps, vérifier que la session survit au tick du récupérateur                                                                            |
| 3   | Session avec un abonné SSE actif N'EST PAS récupérée                   | Créer une session, s'abonner à son EventBus, avancer le temps, vérifier que la session survit                                                                                               |
| 4   | Session avec un client enregistré N'EST PAS récupérée                  | Créer une session, enregistrer un clientId, avancer le temps, vérifier que la session survit                                                                                                |
| 5   | Récupérateur désactivé lorsque intervalle = 0                          | Passer `sessionReapIntervalMs: 0`, vérifier qu'aucun `setInterval` n'est armé                                                                                                                |
| 6   | Récupérateur désactivé lorsque délai = 0                               | Passer `sessionIdleTimeoutMs: 0`, vérifier qu'aucun `setInterval` n'est armé                                                                                                                 |
| 7   | Récupérateur arrêté lors de l'extinction                               | Appeler `shutdown()`, vérifier que `clearInterval` a été appelé                                                                                                                              |
| 8   | Le motif de closeSession par défaut est 'client_close'                 | Appeler `closeSession` sans motif explicite, vérifier que l'événement publié a `reason: 'client_close'`                                                                                     |
| 9   | closeSession avec un motif explicite                                   | Appeler `closeSession` avec `reason: 'idle_timeout'`, vérifier l'événement publié                                                                                                           |
| 10  | Plusieurs sessions inactives récupérées en un seul tick                | Créer 3 sessions inactives, avancer le temps, déclencher le tick, vérifier que les 3 sont récupérées                                                                                        |
| 11  | Session avec battement de cœur dans le TTL survit                      | Créer une session, enregistrer un battement de cœur, avancer le temps juste en dessous du TTL, vérifier que la session survit                                                                |
| 12  | Minuteur d'inactivité du canal déclenché après la récupération de la dernière session | Créer 1 session (dernière sur le canal), la récupérer, vérifier que `startIdleTimer` est appelé sur le canal                                                               |

### 5.2 Tests d'intégration (`server.test.ts`)

| #   | Test                                                                       | Description                                                                                          |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` reflète le nombre de sessions nettoyées par le récupérateur | Démarrer le démon, créer des sessions, avancer le temps, vérifier que le point de terminaison health affiche un nombre réduit |
| 2   | L'abonné SSE reçoit `session_closed` avec `reason: 'idle_timeout'`         | Ouvrir SSE, se déconnecter, se reconnecter avant le TTL, puis laisser expirer le TTL, vérifier l'événement            |

---

## 6. Valeurs par défaut de configuration

| Option                  | Par défaut        | Justification                                                                                                              |
| ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60 000 (1 min)    | Assez fréquent pour éviter une longue accumulation, assez peu coûteux (simple scan d'une Map) pour être exécuté souvent    |
| `sessionIdleTimeoutMs`  | 1 800 000 (30 min)| Période de grâce généreuse pour la reconnexion. Correspond à `ConnectionRegistry.idleTtlMs` pour la cohérence du modèle mental |
---

## 7. Observabilité

- **Log stderr** : `qwen serve: reaping idle session "<id>" (idle for Nms)` à
  chaque nettoyage, respectant la convention de préfixe `qwen serve:`.
- **Événement de télémétrie** : `session.close` avec l'opération
  `qwen-code.daemon.bridge.operation: 'session.close'` (réutilise le chemin de télémétrie
  `closeSession` existant).
- **Métrique de télémétrie** : `sessionLifecycle('close')` (réutilise le compteur existant).
- **Événement SSE** : `session_closed` avec `data.reason: 'idle_timeout'`.

---

## 8. Travaux ultérieurs (hors périmètre)

| Élément                            | Description                                                                                 | Priorité |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Éviction LRU à `maxSessions`       | Au lieu de rejeter les nouvelles sessions, évincer la session inactive la moins récemment utilisée | P1       |
| Compactage de l'anneau EventBus    | Réduire l'anneau pour les sessions avec 0 abonnés afin d'économiser de la mémoire           | P2       |
| Pression adaptative basée sur RSS  | Surveiller `process.memoryUsage().rss` et réduire le TTL d'inactivité lorsque la mémoire est limitée | P2       |
| Vivacité du client par heartbeat   | Désenregistrer automatiquement les clients qui manquent N fenêtres de heartbeat consécutives | P2       |

---

## 9. Risques et atténuations

| Risque                                                                                         | Atténuation                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le reaper ferme une session qu'un client headless s'apprête à reconnecter                      | Le TTL par défaut de 30 minutes est généreux ; les clients headless devraient envoyer des heartbeats. La transcription sur disque est conservée — `session/load` la restaure.       |
| `closeSession` dans le reaper lève une exception, empoisonnant la boucle de parcours           | Chaque fermeture a son propre `.catch()` — un échec ne bloque pas les autres.                                                                                                    |
| Itération du reaper sur `byId` pendant un `closeSession` concurrent depuis un autre chemin     | L'itération ES2015 Map tolère la suppression des clés courantes/précédentes. La double fermeture est idempotente (`byId.get` renvoie `undefined` → `SessionNotFoundError` attrapé par le `.catch` du reaper). |
| Performance du parcours de 20 sessions toutes les 60s                                         | Trivial — 20 lectures Map + 4 vérifications de champs chacune. Pas d'E/S.                                                                                                         |
| Interaction avec le minuteur d'inactivité du canal                                            | Lorsque la dernière session est fermée, `closeSession` appelle déjà `startIdleTimer` sur le canal. Aucune logique supplémentaire nécessaire.                                      |
