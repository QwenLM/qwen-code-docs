# Daemon ACP-over-HTTP → Transport ACP Streamable HTTP officiel

> Cible : `daemon_mode_b_main`. Branche : `feat/daemon-acp-http-streamable`.
> Auteur : arnoo.gao. Date : 2026-05-24. Statut : **Design v1 → implémentation**.
> Workflow design-first par dépôt : ce document atterrit avant/avec la PR d'implémentation pour que le contrat filaire soit révisable.

---

## 0. TL;DR

Le daemon (`qwen serve`) parle aujourd'hui un **dialecte REST + SSE sur mesure** aux clients web/SDK, tout en parlant **du vrai ACP JSON-RPC sur stdio** au processus enfant `qwen --acp`. Cette proposition ajoute un **second transport nord** qui implémente le **transport ACP Streamable HTTP officiel** (RFD #721) sur un seul point d'entrée `/acp`, de sorte que tout client natif ACP (Zed, Goose, futurs SDK) puisse piloter le daemon directement via le protocole standard — sans connaissance spécifique de l'API REST de qwen.

**Décision : double transport, additif.** Le nouveau point d'entrée `/acp` est monté en parallèle de la surface REST existante, réutilisant le même `HttpAcpBridge` + `EventBus` en dessous. L'API REST **n'est pas supprimée**. Justification dans §6.

**Décision : espace de noms d'extension = `_qwen/…`** (préfixe simple underscore, forme réservée par la spécification ACP pour les méthodes personnalisées) pour les fonctionnalités du daemon qui n'ont pas de méthode ACP standard (changement de modèle, introspection de workspace, heartbeat, politique de permission multi-client, réglage de backpressure SSE). Justification dans §5.

Une implémentation de référence complète, exécutable localement, est livrée dans cette PR (`packages/cli/src/serve/acp-http/`) ainsi qu'un harnais de vérification (`scripts/acp-http-smoke.mjs`).

---

## 1. Contexte — ce que signifie « ACP sur HTTP » aujourd'hui

Trois niveaux (vérifiés au commit `0c0430939`) :

```
┌──────────────┐  REST + SSE sur mesure (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ client web / │ ──────────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ SDK          │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ enfant (Agent)│
│ (client ACP) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                    └────────────┘                 └──────────────┘
        nord : PAS filaire ACP                       pont             sud : vrai ACP
```

### 1.1 Nord (client ↔ daemon) — sur mesure, aujourd'hui

- Application Express 5 dans `packages/cli/src/serve/server.ts` (~30 routes).
- Verbes REST distincts, **pas** du JSON-RPC :
  - `POST /session` (créer), `POST /session/:id/prompt`, `POST /session/:id/cancel`,
    `POST /session/:id/load|resume`, `POST /session/:id/model`,
    `POST /session/:id/permission/:requestId`, `POST /session/:id/heartbeat`,
    `DELETE /session/:id`, plus `/workspace/*`, `/capabilities`, `/health`.
- Streaming serveur→client : `GET /session/:id/events` → `text/event-stream`.
  - Trames : `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - **Id** monotone par session + reprise `Last-Event-ID` supportée par un
    `EventBus` en anneau (`acp-bridge/src/eventBus.ts`).
  - Types d'événements : `session_update`, `client_evicted`, `slow_client_warning`,
    `state_resync_required`, `stream_error`, …
- Auth : `Authorization: Bearer <token>` (`serve/auth.ts`), CORS refusé + liste blanche d'hôtes.
- Backpressure : chaîne d'écriture sérialisée par connexion + commentaires de heartbeat à 15 s.

### 1.2 Sud (daemon ↔ enfant) — déjà ACP

- `acp-bridge/src/spawnChannel.ts` lance `qwen --acp`, encapsule stdin/stdout avec
  `ndJsonStream` de `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  — le daemon est le **client** ACP, l'enfant est l'**agent** ACP.
- Méthodes d'extension déjà utilisées sur cette jambe : `unstable_setSessionModel`,
  `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Pourquoi migrer le nord

- Chaque client (webui, SDK TS, SDK Java, SDK Python, compagnon VSCode) réimplémente
  le mapping REST sur mesure. Un point d'entrée standard ACP permet aux éditeurs natifs
  ACP de se connecter sans colle spécifique à qwen.
- Aligne la surface distante du daemon avec le protocole qu'il parle déjà en interne.

---

## 2. Cible : ACP Streamable HTTP (RFD #721)

RFD fusionné **Brouillon** (`agentclientprotocol/agent-client-protocol#721`, fusionné le 2026-04-22).
Pas encore normatif ; pas encore dans aucun SDK. Nous implémentons contre le design filaire du RFD.

### 2.1 Point d'entrée et verbes (unique `/acp`)

| Verbe          | Comportement                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`    | Envoyer du JSON-RPC. `initialize` → **`200`** + corps JSON (capacités) et définit `Acp-Connection-Id`. Toutes les autres requêtes/notifications → **`202 Accepted`**, corps vide ; la _réponse_ (si elle existe) est délivrée sur le flux SSE longue durée correspondant. |
| `GET /acp`     | Ouvrir un flux **SSE** longue durée. (`Upgrade: websocket` → WebSocket ; **reporté**, voir §7.)                                                                                                                                                                       |
| `DELETE /acp`  | Terminer la connexion → `202`.                                                                                                                                                                                                                                        |

### 2.2 Flux longue durée à deux niveaux

- **Flux lié à la connexion** : `GET /acp` avec en-tête `Acp-Connection-Id`, sans en-tête
  de session. Transporte les réponses au niveau connexion (`session/new`, `session/load`,
  `authenticate`) et les notifications au niveau connexion.
- **Flux lié à la session** : `GET /acp` avec `Acp-Connection-Id` **et** `Acp-Session-Id`.
  Transports les notifications `session/update`, les **requêtes agent→client**
  (`session/request_permission`, `fs/read_text_file`, …) et les réponses
  aux POSTs de session (`session/prompt`, `session/cancel`).

### 2.3 Identité (3 couches)

- `Acp-Connection-Id` (en-tête HTTP) — liaison de transport, créé à `initialize`.
- `Acp-Session-Id` (en-tête HTTP) — requis sur les GET session-scope + POSTs de session.
- `sessionId` (paramètre JSON-RPC) — à l'intérieur des paramètres de méthode (doit correspondre à l'en-tête).

### 2.4 Divergences avec MCP StreamableHTTP

ACP utilise des flux **longue durée** (pas du SSE par requête), **deux** en-têtes d'ID (connexion vs session), `202`-pour-non-initialize, HTTP/2 requis, WebSocket requis côté client. Nous empruntons le squelette point d'entrée unique + POST/GET-SSE + en-tête de session mais nous adaptons au modèle double-ID longue durée. Nous **ne** réutilisons **pas** `StreamableHTTPServerTransport` de `@modelcontextprotocol/sdk` (son modèle de flux par requête et son unique `Mcp-Session-Id` ne conviennent pas).

### 2.5 Méthodes standards (confirmées depuis le schéma actuel)

- Requêtes Client→Agent : `initialize`, `authenticate`, `session/new`, `session/load`,
  `session/prompt`, `session/resume`, `session/close`, `session/list`,
  `session/set_mode`, `session/set_config_option`, `logout`.
- Notification Client→Agent : `session/cancel`.
- Requêtes Agent→Client : `fs/read_text_file`, `fs/write_text_file`,
  `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Notification Agent→Client : `session/update`.

---

## 3. Architecture du nouveau transport

Le daemon doit présenter une **surface Agent ACP sur HTTP** au nord, alors qu'il reste un **client** ACP au sud vis-à-vis de l'enfant. La couche `/acp` est donc un **routeur JSON-RPC** qui termine le transport HTTP et fait le pont vers le `HttpAcpBridge` existant.

```
            POST /acp (requêtes/réponses/notifs JSON-RPC)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(éditeur)                                                 │  AcpHttpTransport         │
        ◄── GET /acp  (SSE lié à la connexion) ────────  │  - registre de connexions │
        ◄── GET /acp  (SSE lié à la session) ──────────  │  - corrélation d'id JSON-RPC│
                                                          │  - dispatch de méthode    │
                                                          └────────────┬──────────────┘
                                                                       │ réutilise
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (inchangé)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (inchangé)
                                                                 qwen --acp enfant
```

### 3.1 Nouveau module (`packages/cli/src/serve/acp-http/`)

| Fichier                   | Responsabilité                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | `mountAcpHttp(app, bridge, opts)` — enregistre les routes `/acp` sur l'application Express existante.                                                                                             |
| `connection-registry.ts`  | `Acp-Connection-Id` → `AcpConnection` (écrivain SSE de connexion, `Map<sessionId, SessionStream>`, requêtes agent→client en attente par id JSON-RPC, allocateur d'id monotone). Nettoyage TTL + DELETE. |
| `json-rpc.ts`             | Helpers de parsing/validation/sérialisation JSON-RPC 2.0 ; codes d'erreur (`-32600` etc.) ; garde de l'espace de noms `_qwen/`.                                                                   |
| `dispatch.ts`             | Mappe les méthodes JSON-RPC entrantes → appels `HttpAcpBridge`. Mappe les `BridgeEvent` → trames JSON-RPC sortantes. La table de traduction (§4).                                                  |
| `sse-stream.ts`           | Écrivain SSE longue durée (réutilise le motif de backpressure/heartbeat de `server.ts`). Distinct de `/events` REST (tramage différent : objets JSON-RPC complets, pas d'enveloppes d'événements qwen). |

Aucune modification de `bridge.ts` / `eventBus.ts` (consommateur additif uniquement).

### 3.2 Cycle de vie connexion & session

1. `POST /acp {initialize}` → créer `connectionId`, créer `AcpConnection`, répondre `200`
   avec `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + en-tête `Acp-Connection-Id`.
2. Le client ouvre `GET /acp` (lié à la connexion) avec `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202` ; le daemon appelle `bridge.createSession(...)` ;
   pousse la réponse JSON-RPC (avec `sessionId`) sur le flux de **connexion**.
4. Le client ouvre `GET /acp` (lié à la session) avec `Acp-Connection-Id`+`Acp-Session-Id` ;
   le daemon `bridge.subscribeEvents(sessionId)` et pipe les trames traduites.
5. `POST /acp {session/prompt}` → `202` ; `bridge.sendPrompt(...)` ; les notifications
   `session/update` sont diffusées en direct sur le flux de session ; la **réponse**
   finale du prompt (`{id, result:{stopReason}}`) est poussée sur le flux de session une fois terminée.
6. Une requête agent→client (ex. `session/request_permission`) est émise comme **requête**
   JSON-RPC sur le flux de session avec un id alloué par le daemon ; le client répond via
   `POST /acp {id, result}` ; `dispatch` la résout via l'API de permission du pont.
7. `DELETE /acp` (ou fermeture du flux de connexion + TTL) arrête les sessions/souscriptions.

---

## 4. Table de traduction (pont ⇄ ACP/HTTP)

### 4.1 Entrant (POST client → pont)

| Méthode ACP                                 | Appel pont                                               | Réponse routée vers                |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| `initialize`                                | (aucun ; capacités depuis `capabilities.ts`)             | `200` inline                       |
| `authenticate`                              | fournisseur d'auth existant (`serve/auth/*`)             | flux connexion                     |
| `session/new`                               | `bridge.createSession`                                   | flux connexion                     |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                            | 'resume')`                         | flux connexion |
| `session/prompt`                            | `bridge.sendPrompt`                                      | flux session (différé jusqu'à résolution) |
| `session/cancel` (notif)                    | `bridge.cancel`                                          | —                                  |
| `session/list`                              | `bridge.listSessions` (`unstable_listSessions`)          | flux connexion                     |
| `session/set_mode`                          | logique de routage du mode d'approbation                 | flux session                       |
| **Réponse** JSON-RPC (à une req agent→client)   | résoudre en attente (§4.3)                              | —                                  |
| `_qwen/session/set_model`                   | `bridge.setSessionModel` (`unstable_setSessionModel`)    | flux session                       |
| `_qwen/workspace/list` etc.                 | routes d'introspection du workspace                      | flux connexion                     |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                       | flux connexion                     |

### 4.2 Sortant (BridgeEvent → JSON-RPC sur flux session)

| BridgeEvent.type                                                    | Émis comme                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `session_update`                                                    | notification `{method:"session/update", params:<data>}`            |
| demande de permission                                               | requête `{id:<n>, method:"session/request_permission", params}`    |
| `client_evicted` / `slow_client_warning` / `state_resync_required`  | notification `{method:"_qwen/notify", params:{kind,…}}`            |
| `stream_error`                                                      | réponse d'erreur JSON-RPC sur l'id du prompt actif (ou `_qwen/notify`) |
| résolution de prompt                                                | `{id:<promptId>, result:{stopReason}}`                             |

### 4.3 Requêtes agent→client en attente

`AcpConnection` tient un `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`.
Quand le client POSTe un objet réponse JSON-RPC, `dispatch` fait correspondre `id`, puis appelle le
chemin de résolution du pont (par ex. l'équivalent interne de `POST /session/:id/permission/:requestId`
pour la permission).

> **Statut v1 :** seul l'aller-retour agent→client `session/request_permission` est
> implémenté. Le forwarding agent→client de `fs/*` et `terminal/*` est **reporté** (§7) — le
> daemon ne fait pas encore de négociation de capacité client `fs`/`terminal` sur `/acp`,
> donc les clients ACP ne doivent pas supposer des sémantiques de système de fichiers/terminal
> via ce transport en v1. L'état final visé (forwarder `fs/*` vers le client ; tomber sur le
> FS du workspace du daemon quand le client n'a pas la capacité `fs`) est le suivi décrit en §7.

---

## 5. Stratégie d'extension (exigence #2)

ACP réserve toute méthode commençant par `_` pour les extensions personnalisées et fournit
`_meta` sur chaque type. La jambe sud du codebase utilise déjà des noms de méthode `unstable_*`.

**Choix nord :** noms de méthode avec préfixe de fournisseur **`_qwen/<area>/<verb>`**
(préfixe `_` conforme à la spécification). Capacités annoncées sous
`agentCapabilities._meta.qwen` à `initialize` pour que les clients détectent les fonctionnalités avant utilisation.

| Besoin                                                | Pas de méthode ACP standard ? | Extension                                                |
| ----------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Changement de modèle                                  | oui                           | `_qwen/session/set_model`                                |
| Introspection workspace MCP/compétences/fournisseurs/env | oui                           | `_qwen/workspace/list`, `_qwen/workspace/<area>`         |
| Heartbeat / dernière activité                         | oui                           | `_qwen/session/heartbeat`                                |
| Politique de permission multi-client (consensus/désigné) | partiel                       | `session/request_permission` + `_meta.qwen.policy`       |
| Réglage backpressure SSE (`maxQueued`)                | oui                           | en-tête `Acp-Qwen-Max-Queued` sur le GET session         |
| Curseur de reprise (anneau `Last-Event-ID`)           | Phase 4 du RFD                | en-tête `Last-Event-ID` + `_meta.qwen.eventId` sur trames |

Les méthodes standards ne sont **jamais** renommées ; les extensions sont strictement additives et ignorables.

---

## 6. Double transport vs. remplacement (exigence #4)

**Décision : double transport (additif).**

- Le transport officiel est un RFD **Brouillon**, pas normatif, et absent de tous les SDK —
  le remplacer complètement nous couplerait à un design non ratifié et casserait la webui + 3 SDK +
  le compagnon VSCode d'un coup.
- La surface REST porte des fonctionnalités sans mapping ACP propre encore (introspection
  workspace, médiation de permission multi-client, reprise par anneau, registre de capacités).
  Celles-ci dégradent en extensions `_qwen/*` sur `/acp` mais la surface REST reste
  faisant autorité jusqu'à ratification du RFD.
- Les deux transports partagent **une** instance `HttpAcpBridge` + `EventBus`, donc pas
  de duplication d'état — `/acp` et `/session/*` peuvent même piloter la même session
  active simultanément (le multi-client est déjà supporté par le pont).
- Activation (v1, livré) : activé par défaut ; **`QWEN_SERVE_ACP_HTTP=0`** désactive le montage. Un
  drapeau CLI `--no-acp-http` et une balise `acp_http` dans `/capabilities` pour la détection de
  fonctionnalités côté client sont **reportés** à un suivi (pas dans v1) — jusque-là les clients
  détectent le transport en sondant `POST /acp {initialize}`.

Chemin de migration : une fois le RFD ratifié et les SDK livrés, les routes REST peuvent être
reformulées en une fine couche de compatibilité par-dessus `/acp` (PR séparée, ultérieure).

---

## 7. Périmètre de la PR d'implémentation

**Dans le périmètre (exécutable + vérifié localement) :**

- Dispatch `POST /acp` pour `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/load`, gestion des réponses JSON-RPC.
- Flux SSE `GET /acp` liés à la connexion et à la session avec tramage JSON-RPC.
- Streaming `session/update` + corrélation de réponse finale du prompt.
- Aller-retour agent→client `session/request_permission`.
- Extension `_qwen/session/set_model` comme exemple concret de #2.
- Réutilisation de l'auth Bearer + liste blanche d'hôtes (même middleware que REST).
- Tests unitaires (`acp-http/*.test.ts`) + script de test boîte noire pilotant un daemon réel.

**Reporté (documenté, pas construit maintenant) :**

- Chemin de mise à jour WebSocket (capacité client requise par RFD ; SSE suffit pour la vérification locale).
- Multiplexage HTTP/2 (nous tournons en HTTP/1.1 ; POST et GET longue durée utilisent des sockets
  séparés, ce qui fonctionne pour les clients CLI/Node et les navigateurs ≤6 connexions). Divergence documentée.
- Forwarding complet agent→client `fs/*` + `terminal/*` (le chemin de permission prouve le
  mécanisme ; le reste est un suivi mécanique).
- Durcissement de la reprise SSE en parité avec l'anneau (Phase 4 du RFD).
---

## 8. Plan de vérification local

1. `npm run build` (ou build de l'espace de travail `cli` + `acp-bridge`).
2. Démarrer le daemon : `qwen serve --listen 127.0.0.1:0 --token <t>` (ou token via variable d'environnement).
3. Exécuter `node scripts/acp-http-smoke.mjs` :
   - `POST /acp {initialize}` → vérifier `200` + `Acp-Connection-Id`.
   - Ouvrir la connexion SSE ; `POST {session/new}` → vérifier la réponse sur le flux.
   - Ouvrir la session SSE ; `POST {session/prompt:"say hi"}` → vérifier au moins 1 `session/update`
     puis un `{result:{stopReason}}` final.
   - Déclencher un outil nécessitant une autorisation → vérifier la requête `session/request_permission`,
     POSTer une réponse d'accord → vérifier que le prompt se termine.
   - `POST {_qwen/session/set_model}` → vérifier le changement de modèle + `session/update`.
4. Vitest : tous les tests `acp-http/*.test.ts` passent.

---

## 9. Risques

| Risque                                          | Atténuation                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Modifications des RFD avant ratification        | Derrière un tag de capacité + namespace `_qwen` ; module isolé ; facile à réviser.                  |
| HTTP/1.1 vs HTTP/2 requis                       | Clients localhost/CLI non affectés ; documenté ; h2 est un remplacement de transport ultérieur.     |
| Deux transports sur un même pont en concurrence | Le pont supporte déjà plusieurs clients ; réutilisation de son verrouillage.                         |
| Transfert `fs/*` vs FS local du daemon           | Capable : transférer quand le client déclare `fs`, sinon local.                                     |

---

## 10. Journal d'implémentation et de vérification (v1)

Implémenté dans `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`,
`connection-registry.ts`, `dispatch.ts`, `index.ts`), monté depuis `server.ts`
via `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automatisés (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` démarre un vrai serveur Express + le vrai `mountAcpHttp` sur
un faux pont contrôlable et le pilote avec `fetch` + analyse manuelle des SSE.
15 tests verts, couvrant : `initialize` 200 + `Acp-Connection-Id` ; inconnu-conn
400 ; réponse `session/new` sur le flux de connexion ; prompt → flux `session/update`
+ corrélation du résultat final ; aller-retour `session/request_permission` agent→client→
agent ; `_qwen/session/set_model` ; méthode introuvable ; nettoyage `DELETE`.

### Daemon en direct (modèle réel)

Lancé `qwen serve --port 8767 --token … --workspace …` (entrée du bundle pour que le
fils `qwen --acp` soit autonome) et exécuté `scripts/acp-http-smoke.mjs` :

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

Le chemin d'erreur a également été confirmé en direct : lorsque le fils ne démarrait pas,
le délai d'attente du pont remontait au client sous forme d'une trame d'erreur JSON-RPC
sur le flux de connexion (`{"id":2,"error":{"code":-32603,…}}`), prouvant la corrélation d'id
+ la séparation 202/SSE en cas d'échec.

### Intégration de la relecture — clientId émis par le pont (découverte en vérification directe)

Le premier essai en direct a échoué sur `session/prompt` avec *"client id … is not registered for
session"*. Cause racine : `spawnOrAttach`/`loadSession` **ignore** un clientId fourni par l'appelant
que le pont n'a jamais émis et en attribue un nouveau (retourné dans
`BridgeSession.clientId`) ; le dispatcher renvoyait l'id de la connexion (non enregistré)
sur `sendPrompt`. Correction : persister l'id estampillé par le pont sur le
`SessionBinding` et le renvoyer sur chaque appel par session (`sessionCtx`). Re-vérifié
vert ci-dessus.

---

## 11. Relecture n°2 — intégrations

Deux relectures indépendantes (correction/concurrence + conformité-protocole/sécurité) plus une relecture personnelle.
Toutes les corrections vérifiées par la suite vitest étendue (**18 tests**) + un nouveau test en direct
(21 trames `session/update` → `stopReason=end_turn`).

| #   | Sévérité | Constat                                                                                                                                                                                                                            | Correction                                                                                                                                                                               |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | La **reconnexion du flux de session était définitivement morte** : `SessionBinding.abort` était créé une fois et réutilisé ; à la fermeture du flux, il était abandonné pour toujours, donc une reconnexion de `subscribeEvents(signal)` recevait un signal déjà annulé et zéro événement. | `attachSessionStream` installe désormais un **nouveau** `AbortController` par flux (et ferme tout flux précédent) ; `index.ts` pompe sur ce nouveau signal.                              |
| R2  | **P0**   | `await dispatcher.handle()` s'exécutait **après** `res.end(202)` ; un appel au pont levant une exception (notamment le chemin `isResponse` non catché) provoquait un rejet non géré → possible crash du daemon.                     | Envelopper le chemin `isResponse` dans try/catch ; `.catch()` sur le `handle(...)` attendu et sur `pumpSessionEvents(...)`.                                                               |
| R3  | **P1**   | **Aucune propriété connexion→session** : toute connexion authentifiée pouvait ouvrir le SSE de session, ou envoyer un prompt, pour _n'importe quel_ sessionId dans l'espace de travail (écoute ; le prompt n'était bloqué qu'incidemment par l'erreur de clientId non enregistré). | `AcpConnection.ownedSessions` alimenté par `session/new`/`load`/`resume` ; le flux de session retourne `403` et les POST par session retournent `INVALID_PARAMS` pour les ids non possédés (`requireOwned`). |
| R4  | **P1**   | Le handler `mountAcpHttp` était ignoré → le timer de balayage TTL et les flux SSE actifs fuyaient à l'arrêt.                                                                                                                         | Handler stocké sur `app.locals` ; le hook de fermeture `runQwenServe` appelle `dispose()` avant `bridge.shutdown()` (miroir du registre de flux de périphérique).                          |
| R5  | **P1**   | **Fuite d'autorisation en attente** : fermer une session/connexion avec une autorisation en cours laissait le pont bloqué en attente d'un vote.                                                                                     | `closeSessionStream`/`destroy` annulent les requêtes en attente correspondantes via un `onAbandonPending` injecté → `cancelAbandonedPermission`.                                         |
| R6  | **P1**   | Les tampons de trames avant attachement (`connBuffer`/`binding.buffer`) n'étaient pas limités.                                                                                                                                      | Limité à 256 trames (abandon des plus anciennes), comme le `maxQueued` d'EventBus.                                                                                                       |
| R7  | **P2**   | `initialize` ignorait le `protocolVersion` demandé par le client.                                                                                                                                                                   | Négocie `min(requested, 1)`.                                                                                                                                                             |
| R8  | **P2**   | Pas de vérification croisée `Acp-Session-Id` ↔ `params.sessionId` (RFD §2.3).                                                                                                                                                      | POST vérifie leur accord ; divergence → `INVALID_PARAMS`.                                                                                                                                |
| R9  | **P2**   | La requête `session/cancel` (avec id) n'était jamais répondue ; `_meta.qwen` en double au niveau racine.                                                                                                                            | Répondre quand un id est présent ; un seul `agentCapabilities._meta.qwen`.                                                                                                                |

### Accepté / documenté (non corrigé dans la v1)

- **Ordre résultat-prompt vs `session/update` final** (P2) : `handlePrompt` attend `sendPrompt` puis
  écrit la trame de résultat, tandis que les mises à jour arrivent en concurrence. En pratique, le pont publie toutes
  les `session/update` sur le bus avant que `sendPrompt` ne résolve et les deux partagent une même chaîne d'écriture SSE
  ordonnée, donc le résultat arrive en dernier (confirmé : 21 mises à jour puis résultat). Une barrière stricte est un
  renforcement possible ultérieur si un réducteur client s'avère sensible.
- **`EventSource` du navigateur ne peut pas définir `Authorization`** — les flux GET `/acp` nécessitent l'en-tête bearer,
  donc les navigateurs ont besoin du chemin WebSocket différé (§7) ; les clients CLI/Node ne sont pas affectés.
- La véritable frontière de confiance du daemon reste le **jeton bearer + la liaison à un seul espace de travail** (comme la
  surface REST) ; la vérification de propriété R3 est une défense en profondeur + correction de contrat, pas une frontière de locataire.

---

## 12. Relecture n°3 — intégrations du bot PR (#4472)

Deux relecteurs automatiques PR plus le bot de résumé.
Toutes les corrections vérifiées par la suite (maintenant **22 tests**) + un nouveau test en direct (16 `session/update` → `end_turn`).

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                      | Correction                                                                                                                                                                         |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**   | L'`AbortController` de `handlePrompt` n'était jamais annulé — un client se déconnectant/annulant laissait l'agent tourner (consommation de quota modèle, blocage du FIFO de session). Signalé par les deux bots + 5 sous-agents.                                                | `promptAbort` stocké sur `SessionBinding` ; annulé par `session/cancel` et par le nettoyage de session/connexion (`closeSessionStream`/`destroy`).                                        |
| B2  | **P0**   | `sessionCtx` manquait `fromLoopback` → chaque vote d'autorisation ACP traité comme distant ; la politique `local-only` rejetterait les clients en boucle locale.                                                                                                              | Capturer la boucle locale lors de l'`initialize` (`remoteAddress` du noyau, en-têtes non falsifiables) → `AcpConnection.fromLoopback` → transmis via `sessionCtx`.                         |
| B3  | **P0**   | Les échecs d'écriture SSE étaient silencieusement avalés → flux zombies (heartbeats émis, zéro événement délivré, aucun log).                                                                                                                                                | Premier échec d'écriture log + ferme le flux.                                                                                                                                              |
| B4  | **P0**   | Le balayage des inactifs détruisait les connexions sans log ni limitation de connexions (inondation d'initialisation).                                                                                                                                                        | Le balayage log chaque suppression ; `pumpSessionEvents` appelle `touch()` (les prompts longs silencieux ne sont pas supprimés) ; limite `maxConnections` (64) → `503`.                    |
| B5  | **P1**   | `sessionCtx` retombait silencieusement sur le clientId non enregistré de la connexion quand le binding n'en avait pas (non testé, toujours déclenché dans `FakeBridge`).                                                                                                       | Lever une erreur sur clientId estampillé manquant (violation d'invariant) ; `FakeBridge` en estampille désormais un.                                                                      |
| B6  | **P1**   | `session/new                                                                                                                                                                                                                                                                 | load                                                                                                                                                                                     | resume` `accepted` `cwd` non validés (REST valide chaîne/longueur/absolu — amplification DoS). | `parseOptionalWorkspaceCwd` partagé (chaîne, ≤4096, absolu). |
| B7  | **P1**   | `session/prompt` transmettait un `prompt` non validé au pont.                                                                                                                                                                                                                 | `validatePrompt` (tableau non vide d'objets), miroir du REST.                                                                                                                            |
| B8  | **P1**   | Les messages d'erreur bruts du pont étaient renvoyés au client.                                                                                                                                                                                                               | `toRpcError` mappe les erreurs connues du pont en formes codées et sûres pour le client ; inconnues → générique `Internal error` (détail complet toujours vers stderr).                   |
| B9  | **P1**   | `nextId` utilisait des négatifs séquentiels — un client utilisant légalement des identifiants négatifs pouvait entrer en collision dans `pending`.                                                                                                                             | Les identifiants émis par le daemon sont désormais des chaînes (`_qwen_perm_N`), disjointes de tout identifiant client.                                                                   |
| B10 | **P2**   | Le type de paramètre `resolveClientResponse` excluait `JsonRpcError` ; le flux SSE lié à la connexion n'avait pas de `onClose` ; un `DELETE` sans en-tête était un 202 silencieux ; `SseStream.close` exécutait `onClose` hors try/catch ; `session/load`·`resume`·`close` non testés. | Élargi paramètre à `JsonRpcResponse` ; le flux de connexion log à la fermeture ; `DELETE` sans en-tête → `400` ; `onClose` enveloppé dans try/catch ; ajouté tests load/resume/close + DELETE-400. |

**Hors périmètre (branche de base `daemon_mode_b_main`, pas ce diff)** — le second relecteur a signalé
des erreurs de typage dans `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`) et d'autres éléments
préexistants qu'il attribuait explicitement à la branche de base (introduits par #4353). Suivi séparément ;
non touché ici.

**Toujours reporté** (documenté) : secret par connexion pour `DELETE`/propriété de connexion (le jeton reste
la frontière) ; WebSocket + HTTP/2 (§7) ; barrière stricte résultat-prompt vs mise à jour finale (§11).

---

## 13. Relecture n°4 — intégrations PR (rebasée sur #4469)

Branche rebasée sur `daemon_mode_b_main` (#4353 + #4469) — **propre, sans conflit**. Deux relecteurs
PR (GPT-5 + qwen3.7-max). Suite maintenant **25 tests** ; re-vérifié en direct (125 `session/update`
→ `end_turn`).

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                                        | Correction                                                                                                                                                                                              |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**   | La "gestion des échecs d'écriture SSE" du tour 3 était documentée mais PAS implémentée — `SseStream` laissait toujours cela aux appelants pour la jeter (flux zombies).                                                                                                                        | `writeRaw` en a désormais la charge : le premier rejet d'écriture log une fois + `close()` ; `doWrite` écoute aussi `'error'` (rejette rapidement au lieu d'attendre `'close'`) ; `onClose` enveloppé dans try/catch. |
| C2  | **P1**   | `fromLoopback` capturé uniquement à `initialize` + helper plus restrictif que REST → les votes `local-only` d'un POST ultérieur étaient mal jugés.                                                                                                                                             | Boucle locale par requête transmise via `handle`→`sessionCtx`/`resolveClientResponse` ; `isLoopbackReq` étendu à `127.0.0.0/8` + `::ffff:127.*` + `::1` (correspond au REST).                          |
| C3  | **P1**   | Le routage des erreurs déduisait le flux de `params.sessionId` → les échecs de méthodes liées à la connexion (`session/load`/`resume`/`close`/`heartbeat`) étaient mal routés vers un flux de session inexistant (perte silencieuse).                                                          | `CONN_ROUTED_METHODS` défini ; les erreurs sont routées de la même manière que le chemin de succès.                                                                                                     |
| C4  | **P1**   | `bridge.detachClient` jamais appelé lors du nettoyage → des identifiants clients estampillés par le pont persistent dans `knownClientIds()`/ensembles de votants.                                                                                                                               | Le registre prend un `DetachSessionFn` ; `closeSessionStream`/`destroy` détache chaque session possédée (au mieux).                                                                                     |
| C5  | **P1**   | `session/close` sautait le nettoyage local si `bridge.closeSession` levait une exception.                                                                                                                                                                                                      | `closeSessionStream` déplacé dans un `finally`.                                                                                                                                                         |
| C6  | **P2**   | `cwd` Windows (`C:\…`) rejeté par `startsWith('/')`.                                                                                                                                                                                                                                           | `path.isAbsolute` (tenant compte de la plateforme), comme le REST.                                                                                                                                      |
| C7  | **P2**   | `protocolVersion` pouvait négocier `0`/négatif.                                                                                                                                                                                                                                                | Forcer `Math.max(1, Math.min(requested, 1))` ; tests pour 0/neg/grand/invalide.                                                                                                                        |
| C8  | **P2**   | `session/load`/`resume` acceptaient un `sessionId` vide.                                                                                                                                                                                                                                       | Rejeter vide avec `INVALID_PARAMS`.                                                                                                                                                                     |
| C9  | **P2**   | Les erreurs de `session/prompt` sous forme de notification disparaissaient silencieusement.                                                                                                                                                                                                    | Log sur le chemin sans id.                                                                                                                                                                              |
| C10 | **P2**   | Le SSE de session vidait les trames mises en tampon avant les en-têtes/`retry:`.                                                                                                                                                                                                                | `open()` avant `attachSessionStream`.                                                                                                                                                                   |
| C11 | **P2**   | `logStderr` local en double.                                                                                                                                                                                                                                                                   | `writeStderrLine` partagé depuis `utils/stdioHelpers`.                                                                                                                                                  |
| C12 | **P2**   | La doc annonçait le flag `--no-acp-http`, le tag de capacité `acp_http` et le transfert `fs/*` non présents dans la v1.                                                                                                                                                                        | Doc alignée sur la surface livrée (activation par variable d'environnement uniquement ; `fs/*`+`terminal/*` + flag + tag marqués reportés).                                                             |
Toujours différé (inchangé) : WebSocket + HTTP/2 ; secret par connexion pour `DELETE`/propriété (token + espace de travail unique reste la frontière) ; barrière d'ordre strict des résultats de prompt ; les casts `as never` aux limites du bridge (ciblés, notés pour un suivi adapter-types).

---

## 14. Revue round 5 — intégrations de PR

Un passage supplémentaire de relecture (qwen3.7-max). Suite **26 tests**, revérifié en direct.

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                                                                                                                   | Correctif                                                                                                                                                                                        |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **P0**   | `resolveClientResponse` supprimait l'entrée en attente AVANT d'appeler `respondToSessionPermission`. Un vote malformé (`result: {}`) fait lever une exception par le médiateur du bridge — et comme l'entrée en attente est déjà partie, `abandonPendingForSession` du teardown ne peut pas l'annuler, donc le prompt de l'agent reste bloqué sur un vote qui ne se résout jamais (un détenteur de token peut bloquer une session avec un seul POST erroné). | Encapsuler le vote dans un try/catch ; en cas d'échec, se rabattre sur `cancelAbandonedPermission` pour toujours libérer le médiateur. Nouveau test couvrant le chemin du vote malformé.         |
| D2  | **P1**   | `onClose` du flux de session n'arrêtait que la pompe d'événements, pas `binding.promptAbort` — une déconnexion client (fermeture d'onglet / perte réseau) laissait le prompt en cours d'exécution (quota + FIFO) jusqu'à l'expiration du TTL d'inactivité.                                                                                                                                                  | `onClose` interrompt maintenant aussi `promptAbort` de la session.                                                                                                                               |
| D3  | **P1**   | Quand `pumpSessionEvents` rejetait, le `.catch` ne faisait que journaliser — le flux SSE restait ouvert avec des heartbeat mais ne délivrait rien (zombie, aucun signal de reconnexion).                                                                                                                                                                                   | `.catch` appelle maintenant aussi `closeSessionStream(sessionId)`.                                                                                                                               |

---

## 15. Revue round 6 — intégrations de PR

Un autre passage de relecture (qwen3.7-max). Suite **28 tests**, revérifié en direct.

| #   | Sévérité | Constat                                                                                                                                                                                                                                    | Correctif                                                                                                                                                                                                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**   | `handlePrompt` écrasait `binding.promptAbort` sans interrompre le contrôleur précédent — deux `session/prompt` simultanés pour une même session orphanaient le premier (s'exécute jusqu'au bout dans la FIFO du bridge, non annulable par `session/cancel`). | Interrompre le `promptAbort` précédent avant d'installer le nouveau. Test ajouté.                                                                                                                                                                                                 |
| E2  | **P0**   | Le chemin `subscribeEvents`-throws envoyait une notification `stream_error` puis `return` (résolution) — le `.catch` de l'appelant ne se déclenchait jamais, laissant un flux SSE zombie (heartbeats, aucun événement, aucun signal de reconnexion).                                           | Relancer après la notification pour que le `.catch` de l'appelant ferme le flux. Le test vérifie la fermeture du prompt.                                                                                                                                                         |
| E3  | **P1**   | Le heartbeat SSE ne marquait pas la connexion comme active — un long prompt sans événements intermédiaires pendant >30 min était récupéré par l'expiration d'inactivité (flux + prompts tués).                                                                         | `SseStream` prend un hook `onHeartbeat` ; les deux gestionnaires GET passent `() => conn.touch()`.                                                                                                                                                                               |
| E4  | **P2**   | Le `.catch` de `pumpSessionEvents` fermait par sessionId — une reconnexion entre le throw et la microtask pouvait tuer le NOUVEAU flux.                                                                                                                 | Garde d'identité : ne fermer que si `binding.stream` est encore ce flux.                                                                                                                                                                                                          |
| E6  | **P2**   | `sendSession` créait automatiquement un binding — une trame tardive pump/reply après `closeSessionStream` ressuscitait un binding fantôme qui bufferisait jusqu'à 256 trames pour toujours.                                                               | `sendSession` devient lookup-only : ignore les trames quand la session n'a pas de binding actif.                                                                                                                                                                                  |
| E5  | accepté  | `session/load`/`resume` ne rejettent pas quand une autre connexion active possède la session (« détournement »).                                                                                                                         | **Accepté, non modifié :** la frontière de confiance du daemon est le bearer token + le binding d'espace de travail unique, et l'attachement multi-client est intentionnel (le bridge est conçu multi-client ; REST a la même propriété). Un détenteur de token n'obtient aucune capacité qu'il n'a pas via REST. Suivi avec les autres éléments liés à la frontière du token (propriété DELETE, §13). |

---

## 16. Revue round 7 — intégrations de PR

Un autre passage de relecture (qwen3.7-max). Suite **30 tests**, revérifié en direct.

| #   | Sévérité | Constat                                                                                                                                                                                                              | Correctif                                                                                                                                                                                                  |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**   | TOCTOU concurrent sur `session/close` : `ownedSessions.delete` n'était exécuté que dans `finally` (après l'await), donc deux `close` simultanés passaient tous les deux `requireOwned` → erreur trompeuse pour le 2e + fermeture bridge redondante. | Supprimer la porte de propriété de manière SYNCHRONE avant l'await ; la fermeture du bridge s'exécute une fois. Test ajouté.                                                                               |
| F2  | **P1**   | Cycle de vie de la pompe : une fin d'itérateur CLEAN (sous-processus terminé, `done`) résolvait → le `.catch` ne se déclenchait jamais → flux zombie ; et une erreur d'itérateur EN COURS de flux n'envoyait pas de `stream_error`.                         | `pumpSessionEvents` encapsule toute la boucle (les erreurs synchrones et en cours de flux envoient `stream_error` puis relancent) ; le consommateur `.then(onDone, onErr)` ferme le flux sur LES DEUX chemins (protégé par l'identité). Tests ajoutés. |
| F3  | **P2**   | Le rejet de limite de connexion 503 n'avait pas de journal stderr.                                                                                                                                                | `writeStderrLine` avec la valeur de la limite.                                                                                                                                                             |
| F4  | **P2**   | Le spread de `_qwen/notify stream_error` laissait `event.data.kind` masquer le discriminateur.                                                                                                                          | Spread d'abord, puis `kind: 'stream_error'`.                                                                                                                                                               |
| F5  | **P2**   | `MAX_WORKSPACE_PATH_LENGTH` redéclaré (`= 4096`) vs le canonique `fs/paths.js`.                                                                                                                                | Importer depuis `../fs/paths.js` (pas de divergence).                                                                                                                                                      |
| F6  | **P2**   | `isObjectParams` dupliqué `json-rpc.isObject`.                                                                                                                                                                      | Importer `isObject`.                                                                                                                                                                                       |
| F7  | **P2**   | `process.stderr.write` brut dans `index.ts`/`sse-stream.ts` vs `writeStderrLine` ailleurs.                                                                                                                         | Unifié sur `writeStderrLine` dans l'ensemble du module.                                                                                                                                                    |

---

## 17. Alignement d'équivalence REST + Mise en œuvre de l'audit des schémas d'extension (round 8)

Objectif : faire de `/acp` un **remplacement équivalent** de REST+SSE. Cette batch reconstruit les schémas d'extension sur la base des conclusions de l'audit et comble **toutes les capacités déjà exposées par le bridge** ; les capacités que le bridge ne possède pas encore (E/S fichier, flux périphériques, CRUD agents/memory) sont d'abord complétées par acp-bridge selon l'exactitude architecturale (voir §17.3).

### 17.1 Audit des schémas d'extension → mise en œuvre (remplace l'ancien schéma du §5)

Vérification basée sur le **SDK réel du dépôt `@agentclientprotocol/sdk@0.14.1`** (pas seulement le site web) :

- `session/set_config_option` est une méthode de **première classe (non `unstable_`)**, accepte `{sessionId, configId, value}`, la `category` inclut `model`/`mode`/`thought_level` ; alors que `set_model` utilise encore `unstable_setSessionModel`.
- La spécification réserve le préfixe `_` aux extensions, l'exemple utilise le style de domaine `_zed.dev/…` ; les données constructeur vont dans `_meta` avec des clés par domaine.

Mise en œuvre :

- **Espace de noms `_qwen/` → nom de domaine inversé `_qwen/`** ; `_meta` unifié dans `_meta:{ "qwen": … }` (inclut la publicité de capacités d'`initialize` et le requestId de `session/request_permission`).
- **Mode + modèle d'approbation → standard `session/set_config_option`** (`configId:"model"|"mode"`), routé vers `bridge.setSessionModel`/`setSessionApprovalMode` existants ; le résultat de `session/new` **publicite `configOptions`** (provenant de l'état de la session du sous-processus `getSessionContextStatus().state.configOptions`, déjà au format ACP). **Suppression** du constructeur `_qwen/session/set_model`.
- REST (http+sse) **sans modification synchrone nécessaire** : les deux transports partagent le même bridge, l'état est naturellement cohérent.

### 17.2 Nouvelles méthodes `/acp` de cette batch (bridge déjà supporté, alignement 1:1 avec REST)

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **standard** `session/set_config_option` (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

(Existant : session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events déjà alignés.)

### 17.3 Manques restants → exigence que acp-bridge les comble d'abord (correction architecturale)

Les **E/S fichier** de REST (`/file /glob /list /stat /file/write /file/edit`), **connexion flux périphérique** (`/workspace/auth/*`), **CRUD agents** (`/workspace/agents`), **CRUD memory** (`/workspace/memory`) ne sont actuellement **pas sur `HttpAcpBridge`** — les routes REST appellent directement des services au niveau route ( `WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), contournant le bridge.

**Décision (adoptant l'avis du relecteur/propriétaire)** : ne pas faire se connecter directement le transport `/acp` à ces services de niveau route (cela reproduirait la dérive architecturale de REST et doublerait le couplage des transports). **La bonne approche est d'abord de compléter ces capacités sur `HttpAcpBridge` dans `@qwen-code/acp-bridge`** (par exemple `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), afin que REST et `/acp` passent tous deux par le bridge. À ce moment-là, `/acp` ajoutera `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` (la lecture de fichier, n'ayant pas de méthode standard ACP client→agent, est une extension constructeur légitime).

**Équivalence complète = cette batch (capacités déjà dans le bridge) + batch ultérieure après que acp-bridge aura comblé les lacunes**.

---

## 18. Revue round 9 — intégrations de PR

| #   | Sévérité            | Constat                                                                                                                                                                                                                                                                                 | Correctif                                                                                                                                                                                              |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **P1 (régression)** | La reconnexion du flux de session interrompait le prompt en cours : `attachSessionStream` fermait l'ANCIEN flux avant d'installer le nouveau, et le `onClose` de l'ancien flux interrompait inconditionnellement `promptAbort` — donc un client qui se reconnecte (problème réseau/itinérance) perdait son prompt en cours. | Installer le nouveau flux AVANT de fermer l'ancien ; protéger par identité l'interruption de prompt de `onClose` (n'interrompre que si CECI est toujours le flux actif de la session). Test ajouté (le prompt survit à la reconnexion). |
| G2  | **P2**              | `session/cancel` passait `undefined` comme corps de `CancelNotification`, supprimant les champs d'annulation fournis par le client (raison/contexte) que REST transmet.                                                                                                                  | Transmettre `{ ...params, sessionId }` (miroir de REST).                                                                                                                                               |

Rebasé sur le dernier `daemon_mode_b_main` (#4473/#4483/#4484/#4500), aucun conflit. Suite **33 tests**, revérifié en direct.

---

## 19. Feuille de route / PR ultérieures (pour ne pas oublier)

Cette PR (#4472) = transport ACP Streamable HTTP + **alignement complet des capacités bridge-backées** + schéma d'extension officiel. Passée en **ready**. Pour atteindre « `/acp` totalement équivalent à REST+SSE », il reste :

1. **PR de suivi 1 — Complément des capacités acp-bridge (préalable / bridge-first)** : Ajouter à `HttpAcpBridge` les méthodes E/S fichier, flux périphérique, CRUD agents, CRUD memory ; les routes REST passent par le bridge (éliminant la dérive de connexion directe aux services de niveau route).
2. **PR de suivi 2 — Alignement restant de `/acp` (dépend de la PR 1)** : `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → équivalence totale avec REST.

Suivi : #3803 (décisions ouvertes), #4175 (feuille de route Mode B) ont tous deux été commentés.
Les éléments différés à durcir sont dans la description de la PR « différés connus ».

---

## 20. Renommage de l'espace de noms des extensions + analyse du transport SDK (round 11)

- **Espace de noms `_qwen.ai/` → `_qwen/`** : La seule règle stricte de l'ACP est le `_` initial ; le segment de domaine `_zed.dev/` est une convention par l'exemple, pas une obligation. Comme `qwen` est distinctif, nous utilisons la forme courte nue. La clé `_meta` est également `"qwen"`. (Étude d'agents réels : Zed/gemini-cli utilisent surtout `_meta` sur des méthodes standard + `unstable_*` propres à l'ACP ; les méthodes `_` personnalisées nues sont rares — nos `_qwen/*` sont des opérations workspace/session véritablement nouvelles sans équivalent standard, donc une méthode `_` est l'outil approprié.)
- **Pourquoi un transport fait main (pas basé sur le SDK)** : le SDK TS ne fournit que `ndJsonStream` (stdio) ; le RFD #721 HTTP est la Phase 3 du SDK (non implémentée). La `Connection` du SDK est un flux unique duplex ; notre transport est multi-flux (POSTs + SSE de connexion + SSE par session) et a besoin d'un démultiplexage sortant par sessionId — ce que notre répartiteur connaît déjà au moment du routage. Une réécriture complète sur le SDK combattrait ce modèle et ne supprimerait pas la majeure partie (traduction bridge, cycle de vie SSE, propriété, EventBus→JSON-RPC). **Amélioration pragmatique (candidat pour un suivi) : adopter les validateurs de schéma Zod + types du SDK pour la validation des paramètres tout en gardant le transport fait main.** Les clients SDK utilisant `extMethod('_qwen/…')` interopèrent avec nos gestionnaires (forme filaire identique).