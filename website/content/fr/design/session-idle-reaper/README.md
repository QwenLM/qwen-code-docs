# Session Idle Reaper — Document de conception

**Statut :** Brouillon  
**Auteur :** qinqi  
**Date :** 2026-06-08  
**Portée :** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Énoncé du problème

### 1.1 Comportement actuel

Une fois créée, une session de bridge reste en mémoire (`byId: Map<string, SessionEntry>`) indéfiniment. Elle n’est détruite que lorsque :

1. Un client appelle explicitement `DELETE /session/:id` (`closeSession`)
2. Le processus enfant partagé `qwen --acp` plante (gestionnaire `channel.exited`)
3. Le processus daemon reçoit `SIGTERM` / `SIGINT` (`shutdown`)

Il n’y a **aucun délai d’inactivité automatique** pour les sessions. Les horodatages de battement de cœur (`sessionLastSeenAt`, `clientLastSeenAt`) sont enregistrés par `recordHeartbeat` mais jamais utilisés pour l’expulsion (le commentaire du champ fait référence à une future « politique de révocation (PR 24) » qui n’a pas été implémentée).

### 1.2 Impact

| Scénario                                                                        | Symptôme                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| L’utilisateur ouvre plusieurs onglets de navigateur, les ferme sans appeler `DELETE /session` | Les sessions s’accumulent dans `byId`, chacune occupant un anneau EventBus (~2-4 Mo)          |
| 20 sessions (maximum `maxSessions` par défaut) s’accumulent                                  | Erreur `SessionLimitExceededError` lors d’un nouveau `spawnOrAttach` — utilisateur bloqué            |
| Daemon de longue durée avec rotation d’onglets                                                | Croissance mémoire illimitée des anneaux de rejeu EventBus et de l’état de session côté ACP |
| Extension IDE redémarre / plante                                                | Sessions orphelines jamais nettoyées                                              |

### 1.3 Pourquoi maintenant

Le daemon est de plus en plus utilisé comme serveur d’espace de travail longue durée (application de bureau, extensions IDE, interface Web). Les crashs clients et les perturbations réseau sont normaux — compter sur un `DELETE` explicite pour le nettoyage n’est pas tenable.

---

## 2. Objectifs de conception

1. **Réclamer automatiquement les sessions inactives** dont les clients ont disparu et qui n’ont aucun travail en cours actif.
2. **Ne jamais détruire une session qui a une invite active** — cela tuerait silencieusement un travail visible par l’utilisateur.
3. **Préserver les données de session persistées** — seul l’état mémoire du bridge est libéré ; les transcriptions sur disque (`SessionService`) ne sont pas touchées. Les utilisateurs peuvent utiliser `session/load` ou `session/resume` pour restaurer.
4. **Observable** — émettre un événement SSE distinct pour que les clients sachent POURQUOI la session s’est fermée (timeout d’inactivité vs fermeture explicite vs crash).
5. **Configurable** — les opérateurs et les tests peuvent ajuster les timeouts ou désactiver complètement le reaper.
6. **Zéro nouvelle dépendance / composant** — implémenter entièrement dans la fermeture existante du bridge.

### Non-objectifs

- Gestion de session inter-espaces de travail (ce serait une préoccupation de passerelle).
- Expulsion LRU à la limite `maxSessions` (utile mais travail distinct — suivi comme point ultérieur).
- Compactage de l’anneau EventBus pour les sessions inactives (faible priorité compte tenu de la limite de 20 sessions ; suivi comme point ultérieur).
- Pression adaptative basée sur RSS (nécessite un sondage `process.memoryUsage()` et une conception de politique ; suivi comme point ultérieur).

---

## 3. Architecture

### 3.1 Vue d’ensemble

```
Fermeture du bridge (createHttpAcpBridge)
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
     ├─ ferme les sessions dépassant le TTL d’inactivité
     └─ émet session_closed { reason: 'idle_timeout' }
```

### 3.2 Relation avec les mécanismes existants

| Mécanisme                                 | Portée                     | Ce qu’il gère                                                                  |
| ----------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | Canal (processus enfant)   | Tue l’enfant `qwen --acp` quand TOUTES les sessions sont parties                          |
| **Session reaper** (cette conception)      | Session (entrée mémoire) | Ferme les sessions individuelles lorsqu’elles sont inactives                                             |
| Balayage `ConnectionRegistry`             | Connexion ACP-over-HTTP  | Réclame les connexions de la couche de transport `/acp` (couche différente)                       |
| `writerIdleTimeoutMs`                     | Abonné SSE            | Expulse un seul abonné SSE bloqué                                             |
| Reaper de déconnexion (server.ts)         | Handshake de spawn           | Réclame les sessions dont le propriétaire du spawn s’est déconnecté PENDANT le handshake POST /session |

Deux mécanismes travaillent ensemble pour couvrir le cycle de vie du nettoyage des sessions :

1. **Fermeture au dernier détachement** (primaire) — lorsque `detachClient` supprime le dernier client enregistré ET qu’aucun abonné SSE ne reste, la session est fermée immédiatement via `closeSessionImpl`. Cela gère le chemin normal : l’utilisateur ferme un onglet → nettoyage React → `POST /session/:id/detach`.

2. **Session idle reaper** (filet de sécurité) — balayage périodique des sessions sans invite active et sans abonné SSE qui n’ont pas reçu de battement de cœur dans le TTL configuré. Cela rattrape le chemin de crash : navigateur tué, réseau perdu, `kill -9` — la requête de détachement n’a jamais été envoyée, donc `clientIds` montre encore des clients enregistrés mais la session est effectivement orpheline.

---

## 4. Conception détaillée

### 4.1 Nouvelles options de configuration (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... champs existants ...

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

**Surface CLI** (flags `qwen serve`) :

```
--session-reap-interval-ms <ms>   Intervalle de balayage du reaper (défaut 60000, 0=désactive)
--session-idle-timeout-ms <ms>    Seuil d’inactivité (défaut 1800000, 0=désactive)
```

### 4.2 Prédicat d’inactivité de session

Une session est éligible au réappel lorsque **toutes** les conditions suivantes sont vraies :

1. **Aucune invite active** : `entry.promptActive === false`
2. **Aucun abonné SSE actif** : `entry.events.subscriberCount === 0`
3. **Durée d’inactivité dépassée** : `now - lastActivity(entry) > sessionIdleTimeoutMs`

Note : le reaper ne vérifie intentionnellement PAS `clientIds.size`. Il couvre le chemin de crash où le détachement n’a jamais été envoyé — `clientIds` montre encore des clients enregistrés mais la session est effectivement orpheline. Le chemin normal (le client envoie le détachement) est géré par la fermeture au dernier détachement à la place.

Où `lastActivity(entry)` est défini comme :

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` est en ms epoch (de Date.now());
  // `createdAt` est une chaîne ISO 8601 — analyser en ms epoch comme fallback.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Note : `entry.createdAt` est typé comme `string` (ISO 8601), pas un nombre. `Date.parse` est sûr ici — le format est toujours `new Date().toISOString()` (voir `createSessionEntry`, bridge.ts:1883).

**Justification de chaque garde :**

| Garde              | Pourquoi                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Aucune invite active   | Une invite autonome / sans tête (par ex. pipe CLI, tâche cron) peut être en cours sans abonné SSE. La réclamer tuerait le travail. |
| Aucun abonné SSE | Un client connecté écoute activement. Même s’il n’a pas envoyé de battement de cœur, la connexion SSE elle-même prouve l’activité.    |
| Durée d’inactivité      | Période de grâce pour que les clients brièvement déconnectés puissent se reconnecter sans perdre leur session.                                    |

### 4.3 Action de réappel

Pour chaque session qui satisfait le prédicat d’inactivité, le reaper appelle :

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Cela réutilise le chemin `closeSession` existant qui :

1. Supprime de `byId` / `defaultEntry`
2. Annule les permissions en attente via `permissionMediator.forgetSession`
3. Publie l’événement `session_closed` (avec `reason: 'idle_timeout'`)
4. Ferme l’EventBus
5. Envoie `connection.cancel()` à l’enfant ACP (meilleur effort)
6. Déclenche `startIdleTimer` sur le canal si c’était la dernière session

**Pourquoi `closeSession` et non `killSession` ?**

`killSession` est le chemin de force interne conçu pour la course de déconnexion du handshake de spawn (garde `requireZeroAttaches`, pierre tombale `spawnOwnerWantedKill`). `closeSession` est le chemin documenté côté client qui publie `session_closed` (et non `session_died`) et gère correctement la télémétrie. Le reaper est une « fermeture gracieuse pour le compte d’un client absent », donc `closeSession` est la bonne sémantique.

### 4.4 Extension de `closeSession` pour accepter une raison de fermeture

Actuellement, `closeSession` code en dur `reason: 'client_close'` dans l’événement `session_closed`. Nous devons rendre cela paramétrable.

**Approche :** Ajouter un nouveau paramètre optionnel `opts` à `closeSession` plutôt que de surcharger `BridgeClientRequestContext` (qui est un type de portée de requête client — ajouter `reason` serait une violation de couche puisque « reason » est une décision côté serveur, pas quelque chose qu’un client transmet dans un en-tête).

```typescript
// bridgeTypes.ts — nouveau type + changement de signature :
export interface CloseSessionOpts {
  /** Remplace la raison 'client_close' par défaut dans l’événement session_closed. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — changement d’implémentation :
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Les appelants existants (route `DELETE /session/:id`) ne passent pas `opts`, par défaut `'client_close'`. Le reaper passe `{ reason: 'idle_timeout' }`.

### 4.5 Cycle de vie du reaper

```typescript
// Dans la fermeture createHttpAcpBridge :

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
          `(inactif depuis ${Math.round(idle / 1000)}s, seuil ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Pass `undefined` context (pas de client) et `{ reason }` opts.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: le reaper de session n’a pas pu fermer ${JSON.stringify(id)} : ${String(err)}`,
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

Note : `bridgeImpl` fait référence à l’objet bridge retourné par `createHttpAcpBridge` afin que `closeSession` ait un accès complet à l’état de la fermeture. En pratique, ceci est implémenté comme un appel direct à la fonction interne `closeSessionImpl` de la fermeture.

**Intégration du cycle de vie :**

- `startSessionReaper()` est appelé à la construction du bridge (après validation des options, en parallèle de la configuration existante de `channelIdleTimeoutMs`).
- `stopSessionReaper()` est appelé dans `shutdown()` et `killAllSync()`.

### 4.6 Interaction avec les appelants existants de `closeSession`

| Appelant                       | Impact                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| Route `DELETE /session/:id`  | Aucun — pas d’`opts` passé, par défaut `reason: 'client_close'`      |
| Session reaper (cette conception) | Passe `opts: { reason: 'idle_timeout' }`                          |
| Réappel différé de `detachClient` | Appelle `killSession` (pas `closeSession`), non affecté               |
| Gestionnaire `channel.exited`     | Publie `session_died`, non affecté                               |
| `shutdown()`                 | Publie `session_died` avec la raison `daemon_shutdown`, non affecté |

### 4.7 Sécurité de concurrence

Le callback du reaper s’exécute sur la boucle d’événements Node.js. Considérations clés :

- **L’itération `for...of` est synchrone.** Le reaper évalue le prédicat d’inactivité de chaque entrée de manière synchrone, puis lance `closeSession(...).catch(...)` pour les entrées correspondantes. Pas de `await` dans le corps de la boucle — toutes les fermetures sont dispatchées dans une seule frontière de microtâche, puis la boucle se termine.
- **`byId.delete` est différé.** Dans `closeSession`, `byId.delete` s’exécute APRÈS le premier `await` (`notifyAgentSessionClose`). Cela signifie que les suppressions se produisent dans des microtâches après la fin de la boucle `for...of`. Comme chaque `closeSession` opère sur une clé distincte, il n’y a pas d’aliasing. Et `for...of` a déjà fini d’itérer, donc la suppression en milieu d’itération n’est pas un problème.
- **Course de double fermeture.** Si un client appelle `DELETE /session/:id` pour la même session entre la vérification du prédicat par le reaper et l’exécution asynchrone de `closeSession`, le `closeSession` du reaper lancera `SessionNotFoundError` (attrapé par `.catch()`). Sécurisé.
- **Course de reconnexion.** Si un client se reconnecte à une session (enregistre clientId / ouvre SSE) entre la vérification du prédicat par le reaper et l’exécution de `closeSession`, `closeSession` aura quand même lieu et fermera la session. Le client reçoit `session_closed` et doit recharger. Cette fenêtre est extrêmement étroite (un tick `setInterval` synchrone) et la conséquence est bénigne — pas de perte de données, juste une invite de rechargement. Le TTL par défaut de 30 minutes rend cela extrêmement rare.
- Un `spawnOrAttach` concurrent qui crée une nouvelle session pendant que le reaper scanne ne sera pas vu (nous itérons les entrées `byId` au début de chaque tick). C’est sûr — les nouvelles sessions sont fraîches et n’atteindront pas le seuil d’inactivité.

### 4.8 Changement de format filaire

Le champ `data.reason` de l’événement `session_closed` existe déjà avec la valeur `'client_close'`. Nous ajoutons deux nouvelles valeurs :

- `'idle_timeout'` — émise par le reaper d’inactivité (filet de sécurité pour les clients plantés)
- `'last_client_detached'` — émise par la fermeture au dernier détachement (fermeture normale d’onglet)

Ceci est rétrocompatible — le code SDK existant qui vérifie `reason === 'client_close'` ne correspondra simplement pas aux nouvelles valeurs, et le gestionnaire de trame terminale générique (`isTerminalLifecycleEvent`) gère déjà `session_closed` quelle que soit la raison.

---

## 5. Plan de test

### 5.1 Tests unitaires (`bridge.test.ts`)

| #   | Test                                                   | Description                                                                                                                                                                            |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Session inactive est réclamée après le timeout                   | Créer une session, avancer le temps au-delà de `sessionIdleTimeoutMs`, déclencher le tick du reaper, vérifier que la session est supprimée de `byId` et que l’événement `session_closed` est publié avec `reason: 'idle_timeout'` |
| 2   | Session avec invite active N’EST PAS réclamée               | Créer une session, démarrer une invite, avancer le temps, vérifier que la session survit au tick du reaper                                                                                                    |
| 3   | Session avec abonné SSE actif N’EST PAS réclamée         | Créer une session, s’abonner à son EventBus, avancer le temps, vérifier que la session survit                                                                                                     |
| 4   | Session avec client enregistré N’EST PAS réclamée           | Créer une session, enregistrer un clientId, avancer le temps, vérifier que la session survit                                                                                                           |
| 5   | Reaper désactivé quand intervalle = 0                      | Passer `sessionReapIntervalMs: 0`, vérifier qu’aucun `setInterval` n’est armé                                                                                                                      |
| 6   | Reaper désactivé quand timeout = 0                       | Passer `sessionIdleTimeoutMs: 0`, vérifier qu’aucun `setInterval` n’est armé                                                                                                                       |
| 7   | Reaper arrêté lors de l’arrêt                             | Appeler `shutdown()`, vérifier que `clearInterval` a été appelé                                                                                                                                   |
| 8   | La raison de closeSession par défaut est 'client_close'         | Appeler `closeSession` sans raison explicite, vérifier que l’événement publié a `reason: 'client_close'`                                                                                       |
| 9   | closeSession avec raison explicite                      | Appeler `closeSession` avec `reason: 'idle_timeout'`, vérifier l’événement publié                                                                                                              |
| 10  | Plusieurs sessions inactives réclamées en un tick              | Créer 3 sessions inactives, avancer le temps, déclencher le tick, vérifier que les 3 sont réclamées                                                                                                                |
| 11  | Session avec battement de cœur dans le TTL survit             | Créer une session, enregistrer un battement de cœur, avancer le temps juste en dessous du TTL, vérifier que la session survit                                                                                            |
| 12  | Le timer d’inactivité du canal déclenché après le réappel de la dernière session | Créer 1 session (dernière sur le canal), la réclamer, vérifier que `startIdleTimer` est appelé sur le canal                                                                                          |

### 5.2 Tests d’intégration (`server.test.ts`)

| #   | Test                                                                   | Description                                                                             |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` reflète le nombre de sessions nettoyées par le reaper             | Démarrer le daemon, créer des sessions, avancer le temps, vérifier que l’endpoint de santé affiche un nombre réduit |
| 2   | L’abonné SSE reçoit `session_closed` avec `reason: 'idle_timeout'` | Ouvrir SSE, se déconnecter, se reconnecter avant le TTL, puis laisser expirer le TTL, vérifier l’événement           |
---

## 6. Valeurs par défaut de configuration

| Option                  | Valeur par défaut            | Justification                                                                                                   |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60 000 (1 min)               | Assez fréquent pour éviter une accumulation longue, assez léger (simple scan d'une Map) pour être exécuté souvent |
| `sessionIdleTimeoutMs`  | 1 800 000 (30 min)           | Délai de grâce généreux pour la reconnexion. Correspond à `ConnectionRegistry.idleTtlMs` pour la cohérence du modèle mental |

---

## 7. Observabilité

- **log stderr** : `qwen serve: reaping idle session "<id>" (idle for Nms)` à chaque reap, correspondant à la convention de préfixe `qwen serve:` existante.
- **Événement de télémétrie** : `session.close` avec l'opération `qwen-code.daemon.bridge.operation: 'session.close'` (réutilise le chemin de télémétrie `closeSession` existant).
- **Métrique de télémétrie** : `sessionLifecycle('close')` (réutilise le compteur existant).
- **Événement SSE** : `session_closed` avec `data.reason: 'idle_timeout'`.

---

## 8. Travail ultérieur (hors périmètre)

| Élément                            | Description                                                                     | Priorité |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Éviction LRU à `maxSessions`       | Au lieu de rejeter de nouvelles sessions, évincer la session inactive la moins récemment active | P1       |
| Compactage de l'anneau EventBus    | Réduire l'anneau pour les sessions avec 0 abonnés pour économiser de la mémoire | P2       |
| Pression adaptative basée sur RSS  | Surveiller `process.memoryUsage().rss` et réduire le TTL d'inactivité lorsque la mémoire est limitée | P2       |
| Vivacité client basée sur heartbeat| Désenregistrer automatiquement les clients qui manquent N fenêtres de heartbeat consécutives | P2       |

---

## 9. Risques et Atténuations

| Risque                                                                          | Atténuation                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le reaper ferme une session à laquelle un client headless est sur le point de se reconnecter         | Le TTL par défaut de 30 minutes est généreux ; les clients headless devraient envoyer des heartbeats. La transcription disque est préservée — `session/load` la restaure.         |
| `closeSession` dans le reaper lève une exception, empoisonnant la boucle de scan                    | Chaque fermeture est dans son propre `.catch()` — un échec ne bloque pas les autres                                                                                               |
| Itération du reaper sur `byId` pendant un `closeSession` concurrent depuis un autre chemin          | L'itération ES2015 Map tolère la suppression des clés courantes/précédentes. La double fermeture est idempotente (`byId.get` renvoie undefined → `SessionNotFoundError` attrapée par le `.catch` du reaper). |
| Performance du scan de 20 sessions toutes les 60s                                                   | Trivial — 20 lectures de Map + 4 vérifications de champ chacune. Aucune E/S.                                                                                                      |
| Interaction du minuteur d'inactivité du canal                                                       | Lorsque la dernière session est reapée, `closeSession` appelle déjà `startIdleTimer` sur le canal. Aucune logique supplémentaire nécessaire.                                      |