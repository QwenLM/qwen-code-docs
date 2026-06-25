# Daemon ACP-over-HTTP → Transport HTTP Streamable ACP officiel

> Cible `daemon_mode_b_main`. Branche : `feat/daemon-acp-http-streamable`.
> Auteur : arnoo.gao. Date : 2026-05-24. Statut : **Conception v1 → implémentation**.
> Conception d’abord, conformément au workflow du dépôt : ce document est livré avant/avec la PR d’implémentation afin que le contrat filaire soit vérifiable.

---

## 0. TL;DR

Aujourd’hui, le démon (`qwen serve`) dialogue avec les clients web/SDK via un **dialecte REST + SSE sur mesure**, tout en parlant **du vrai ACP JSON-RPC via stdio** avec le processus enfant `qwen --acp` lancé. Cette proposition ajoute un **second transport nord** qui implémente le **transport HTTP Streamable ACP officiel** (RFD #721) sur un seul point de terminaison `/acp`, de sorte que tout client natif ACP (Zed, Goose, futurs SDK) puisse piloter le démon directement via le protocole standard — sans nécessiter de connaissances REST spécifiques à qwen.

**Décision : double transport, additif.** Le nouveau point de terminaison `/acp` est monté en parallèle de la surface REST existante, en réutilisant le même `HttpAcpBridge` + `EventBus` en dessous. L’API REST n’est _pas_ supprimée. Justification en §6.

**Décision : espace de noms d’extension = `_qwen/…`** (préfixe à un seul underscore, la forme réservée par la spécification ACP pour les méthodes personnalisées) pour les fonctionnalités du démon qui n’ont pas de méthode ACP standard (changement de modèle, introspection de l’espace de travail, heartbeat, politique d’autorisation multi-client, réglage du backpressure SSE). Justification en §5.

Une implémentation de référence complète et exécutable localement est livrée dans cette PR (`packages/cli/src/serve/acp-http/`) ainsi qu’un harnais de vérification (`scripts/acp-http-smoke.mjs`).

---

## 1. Contexte — ce que « ACP over HTTP » signifie aujourd’hui

Trois niveaux (vérifiés au commit `0c0430939`) :

```
┌──────────────┐  bespoke REST + SSE (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ web / SDK    │ ───────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ client       │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ child (Agent)│
│ (ACP client) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        northbound: NOT ACP wire                       bridge          southbound: real ACP
```

### 1.1 Nord (client ↔ démon) — sur mesure aujourd’hui

- Application Express 5 dans `packages/cli/src/serve/server.ts` (~30 routes).
- Verbes REST discrets, **pas** de JSON-RPC :
  - `POST /session` (création), `POST /session/:id/prompt`, `POST /session/:id/cancel`,
    `POST /session/:id/load|resume`, `POST /session/:id/model`,
    `POST /session/:id/permission/:requestId`, `POST /session/:id/heartbeat`,
    `DELETE /session/:id`, plus `/workspace/*`, `/capabilities`, `/health`.
- Streaming serveur→client : `GET /session/:id/events` → `text/event-stream`.
  - Trames : `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - **`id` monotone** par session + reprise `Last-Event-ID` soutenue par une
    mémoire tampon circulaire `EventBus` (`acp-bridge/src/eventBus.ts`).
  - Types d’événement : `session_update`, `client_evicted`, `slow_client_warning`,
    `state_resync_required`, `stream_error`, …
- Authentification : `Authorization: Bearer <token>` (`serve/auth.ts`), CORS deny + liste blanche d’hôtes.
- Backpressure : chaîne d’écriture sérialisée par connexion + commentaires sur le heartbeat de 15 s.

### 1.2 Sud (démon ↔ enfant) — déjà de l’ACP

- `acp-bridge/src/spawnChannel.ts` lance `qwen --acp`, encapsule stdin/stdout avec
  `ndJsonStream` de `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  — le démon est le **client** ACP, l’enfant est l'**agent** ACP.
- Méthodes d’extension déjà utilisées sur cette voie : `unstable_setSessionModel`,
  `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Pourquoi migrer le nord

- Chaque client (webui, SDK TS, SDK Java, SDK Python, compagnon VSCode) réimplémente
  le mapping REST sur mesure. Un point de terminaison standard ACP permet aux éditeurs
  natifs ACP de se connecter sans aucun colle spécifique à qwen.
- Aligne la surface distante du démon avec le protocole qu’il parle déjà en interne.

---

## 2. Cible : ACP Streamable HTTP (RFD #721)

RFD fusionnée **en projet** (`agentclientprotocol/agent-client-protocol#721`, fusionné le 2026-04-22).
Pas encore normative ; pas encore dans un SDK. Nous implémentons selon la conception filaire du RFD.

### 2.1 Point de terminaison et verbes (unique `/acp`)

| Verbe          | Comportement                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`    | Envoyer du JSON-RPC. `initialize` → **`200`** + corps JSON (capacités) et définit `Acp-Connection-Id`. Toutes les autres requêtes/notifications → **`202 Accepted`**, corps vide ; la _réponse_ (si elle existe) est livrée sur le flux SSE longue durée correspondant.        |
| `GET /acp`     | Ouvrir un flux **SSE** longue durée. (`Upgrade: websocket` → WebSocket ; **reporté**, voir §7.)                                                                                                                                                                              |
| `DELETE /acp`  | Terminer la connexion → `202`.                                                                                                                                                                                                                                                |
### 2.2 Flux longue durée à deux niveaux

- **Flux au niveau connexion** : `GET /acp` avec l'en-tête `Acp-Connection-Id`, pas d'en-tête de session. Transporte les réponses au niveau connexion (`session/new`, `session/load`, `authenticate`) et les notifications au niveau connexion.
- **Flux au niveau session** : `GET /acp` avec `Acp-Connection-Id` **et** `Acp-Session-Id`. Transporte les notifications `session/update`, les **requêtes agent→client** (`session/request_permission`, `fs/read_text_file`, …), et les réponses aux POSTs de session (`session/prompt`, `session/cancel`).

### 2.3 Identité (3 couches)

- `Acp-Connection-Id` (en-tête HTTP) — liaison de transport, créé lors de `initialize`.
- `Acp-Session-Id` (en-tête HTTP) — requis sur les GET au niveau session et les POSTs de session.
- `sessionId` (paramètre JSON-RPC) — dans les paramètres de méthode (doit correspondre à l'en-tête).

### 2.4 Divergences avec MCP StreamableHTTP

ACP utilise des flux **longue durée** (pas de SSE par requête), **deux** en-têtes d'ID (connexion vs session), `202` pour non-initialize, HTTP/2 requis, WebSocket requis pour le client. Nous empruntons le squelette (point d'entrée unique + POST/GET-SSE + en-tête de session) mais nous l'adaptons au modèle à double ID et longue durée. Nous **ne** réutilisons **pas** `StreamableHTTPServerTransport` de `@modelcontextprotocol/sdk` (son modèle de flux par requête et son `Mcp-Session-Id` unique ne correspondent pas).

### 2.5 Méthodes standard (confirmées par le schéma actuel)

- Requêtes Client→Agent : `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/resume`, `session/close`, `session/list`, `session/set_mode`, `session/set_config_option`, `logout`.
- Notification Client→Agent : `session/cancel`.
- Requêtes Agent→Client : `fs/read_text_file`, `fs/write_text_file`, `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Notification Agent→Client : `session/update`.

---

## 3. Architecture du nouveau transport

Le daemon doit présenter une **surface agent ACP par HTTP** vers le nord, tout en restant un **client** ACP vers l'enfant au sud. La couche `/acp` est donc un **routeur JSON-RPC** qui termine le transport HTTP et fait le pont avec le `HttpAcpBridge` existant.

```
            POST /acp (requêtes/réponses/notifications JSON-RPC)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(éditeur)                                                │  AcpHttpTransport         │
        ◄── GET /acp  (SSE au niveau connexion) ───────  │  - registre connexions   │
        ◄── GET /acp  (SSE au niveau session) ─────────  │  - corrélation id JSON-RPC│
                                                          │  - répartition méthodes   │
                                                          └────────────┬──────────────┘
                                                                       │ réutilise
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus │  (inchangé)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (inchangé)
                                                                 qwen --acp child
```

### 3.1 Nouvelle disposition des modules (`packages/cli/src/serve/acp-http/`)

| Fichier                  | Responsabilité                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | `mountAcpHttp(app, bridge, opts)` — enregistre les routes `/acp` sur l'application Express existante.                                                                                          |
| `connection-registry.ts` | `Acp-Connection-Id` → `AcpConnection` (writer SSE de connexion, `Map<sessionId, SessionStream>`, requêtes agent→client en attente par ID JSON-RPC, allocateur d'ID monotone). Nettoyage par TTL + DELETE. |
| `json-rpc.ts`            | Helpers de parse/validation/sérialisation JSON-RPC 2.0 ; codes d'erreur (`-32600` etc.) ; garde d'espace de noms `_qwen/`.                                                                     |
| `dispatch.ts`            | Mappe les méthodes JSON-RPC entrantes → appels `HttpAcpBridge`. Mappe les `BridgeEvent`s → trames JSON-RPC sortantes. La table de traduction (§4).                                              |
| `sse-stream.ts`          | Writer SSE longue durée (réutilise le motif de backpressure/heartbeat de `server.ts`). Distinct du REST `/events` (encadrement différent : objets JSON-RPC complets, pas d'enveloppes d'événements qwen). |

Aucun changement dans `bridge.ts` / `eventBus.ts` (consommateur additif uniquement).

### 3.2 Cycle de vie connexion & session

1. `POST /acp {initialize}` → crée un `connectionId`, crée `AcpConnection`, répond `200` avec `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + en-tête `Acp-Connection-Id`.
2. Le client ouvre `GET /acp` (au niveau connexion) avec `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202` ; le daemon appelle `bridge.createSession(...)` ; pousse la réponse JSON-RPC (avec `sessionId`) dans le flux de **connexion**.
4. Le client ouvre `GET /acp` (au niveau session) avec `Acp-Connection-Id`+`Acp-Session-Id` ; le daemon appelle `bridge.subscribeEvents(sessionId)` et achemine les trames traduites.
5. `POST /acp {session/prompt}` → `202` ; `bridge.sendPrompt(...)` ; les notifications `session/update` sont diffusées en direct sur le flux de session ; la **réponse** finale du prompt (`{id, result:{stopReason}}`) est poussée sur le flux de session une fois terminée.
6. Une requête agent→client (ex. `session/request_permission`) est émise en tant que **requête** JSON-RPC sur le flux de session avec un ID alloué par le daemon ; le client répond via `POST /acp {id, result}` ; `dispatch` la résout via l'API de permission du bridge.
7. `DELETE /acp` (ou fermeture du flux de connexion + TTL) supprime les sessions/abonnements.
---

## 4. Table de traduction (pont ⇄ ACP/HTTP)

### 4.1 Entrant (POST client → pont)

| Méthode ACP                               | Appel pont                                           | Routé vers                     |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------ | ----------------- |
| `initialize`                               | (aucun ; capacités depuis `capabilities.ts`)          | `200` en ligne                 |
| `authenticate`                             | fournisseur d'authentification existant (`serve/auth/*`) | flux de connexion              |
| `session/new`                              | `bridge.createSession`                                | flux de connexion              |
| `session/load` / `session/resume`          | `bridge.restoreSession('load'                         | 'resume')`                     | flux de connexion |
| `session/prompt`                           | `bridge.sendPrompt`                                   | flux de session (différé jusqu'au règlement) |
| `session/cancel` (notification)            | `bridge.cancel`                                       | —                              |
| `session/list`                             | `bridge.listSessions` (`unstable_listSessions`)       | flux de connexion              |
| `session/set_mode`                         | logique de routage du mode d'approbation              | flux de session                |
| Réponse JSON-RPC (à la req agent→client)   | résoudre en attente (§4.3)                            | —                              |
| `_qwen/session/set_model`                  | `bridge.setSessionModel` (`unstable_setSessionModel`) | flux de session                |
| `_qwen/workspace/list` etc.                | routes d'introspection de l'espace de travail         | flux de connexion              |
| `_qwen/session/heartbeat`                  | `bridge.heartbeat`                                    | flux de connexion              |

### 4.2 Sortant (BridgeEvent → JSON-RPC sur flux de session)

| BridgeEvent.type                                                      | Émis en tant que                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `session_update`                                                      | notification `{method:"session/update", params:<data>}`             |
| demande d'autorisation                                                | requête `{id:<n>, method:"session/request_permission", params}`    |
| `client_evicted` / `slow_client_warning` / `state_resync_required`    | notification `{method:"_qwen/notify", params:{kind,…}}`            |
| `stream_error`                                                        | réponse d'erreur JSON-RPC sur l'id du prompt actif (ou `_qwen/notify`) |
| règlement d'invite                                                    | `{id:<promptId>, result:{stopReason}}`                             |

### 4.3 Requêtes agent→client en attente

`AcpConnection` conserve `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`.
Lorsque le client POST un objet de réponse JSON-RPC, `dispatch` fait correspondre `id`, puis appelle le
chemin de résolution du pont (par exemple l'équivalent interne de permission
`POST /session/:id/permission/:requestId`).

> **Statut v1 :** seul l'aller-retour agent→client `session/request_permission` est
> implémenté. Le transfert agent→client de `fs/*` et `terminal/*` est **reporté** (§7) – le
> démon n'annonce pas encore la négociation de capacité client `fs`/`terminal` sur `/acp`,
> donc les clients ACP ne doivent pas supposer de sémantique filesystem/terminal via ce transport
> dans v1. L'état final souhaité (transférer `fs/*` au client ; se rabattre sur le système de fichiers
> de l'espace de travail du démon lorsque le client n'a pas la capacité `fs`) est le suivi décrit
> au §7.

---

## 5. Stratégie d'extension (exigence #2)

ACP réserve toute méthode commençant par `_` pour les extensions personnalisées et fournit `_meta`
sur chaque type. La jambe sud du codebase utilise déjà des noms de méthode `unstable_*`.

**Choix nord :** des noms de méthode **`_qwen/<area>/<verb>`** préfixés par le fournisseur (conforme
à la spécification avec le préfixe `_`). Les capacités sont annoncées sous
`agentCapabilities._meta.qwen` lors de `initialize`, permettant ainsi au client de détecter les
fonctionnalités avant utilisation.

| Besoin                                                | Pas de méthode ACP standard ? | Extension                                             |
| ----------------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Changement de modèle                                  | oui                           | `_qwen/session/set_model`                             |
| Introspection de l'espace de travail (MCP/compétences/fournisseurs/env) | oui           | `_qwen/workspace/list`, `_qwen/workspace/<area>`      |
| Heartbeat / dernière activité                         | oui                           | `_qwen/session/heartbeat`                             |
| Politique d'autorisation multi-client (consensus/désigné) | partiel                    | `session/request_permission` + `_meta.qwen.policy`    |
| Réglage de la contre-pression SSE (`maxQueued`)        | oui                           | En-tête `Acp-Qwen-Max-Queued` sur le GET de session   |
| Curseur de reprise (anneau `Last-Event-ID`)            | RFD Phase 4                   | En-tête `Last-Event-ID` + `_meta.qwen.eventId` sur les trames |
Les méthodes standard ne sont **jamais** renommées ; les extensions sont strictement additives et ignorables.

---

## 6. Double transport vs remplacement (exigence #4)

**Décision : double transport (additif).**

- Le transport officiel est un RFD **Brouillon**, non normatif et absent de tous les SDK —
  le remplacer brutalement nous couplerait à un design non ratifié et casserait simultanément
  l'interface web, 3 SDK et le compagnon VSCode.
- La surface REST porte des fonctionnalités sans correspondance ACP claire pour l'instant
  (introspection d'espace de travail, médiation de permissions multi-client, reprise par tampon
  circulaire, registre de capacités). Celles-ci se dégradent en extensions `_qwen/*` sur `/acp`,
  mais la surface REST reste faisant autorité jusqu'à la ratification du RFD.
- Les deux transports partagent **une** seule instance `HttpAcpBridge` + `EventBus`, donc il n'y a
  pas de duplication d'état — `/acp` et `/session/*` peuvent même piloter la même session en direct
  simultanément (le pont supporte déjà le multi-client).
- Bascule (v1, livré) : activé par défaut ; **`QWEN_SERVE_ACP_HTTP=0`** désactive le montage. Un
  indicateur CLI `--no-acp-http` et une balise `acp_http` dans `/capabilities` pour la détection de
  fonctionnalités côté client sont **reportés** à une version ultérieure (pas dans la v1) —
  jusque-là, les clients détectent le transport en sondant `POST /acp {initialize}`.

Chemin de migration : dès que le RFD est ratifié et que les SDK sont livrés, les routes REST peuvent
être reformulées comme une fine couche de compatibilité sur `/acp` (PR séparée, ultérieure).

---

## 7. Périmètre de la PR d'implémentation

**Dans le périmètre (exécutable et vérifié localement) :**

- Distribution `POST /acp` pour `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/load`, gestion des réponses JSON-RPC.
- Flux SSE `GET /acp` liés à la connexion et à la session avec tramage JSON-RPC.
- Streaming `session/update` + corrélation de la réponse finale à la requête.
- Aller-retour agent→client `session/request_permission`.
- Extension `_qwen/session/set_model` comme exemple concret du point #2.
- Réutilisation de l'authentification Bearer et de la liste blanche des hôtes (même middleware que pour REST).
- Tests unitaires (`acp-http/*.test.ts`) + un script de test boîte noire pilotant un démon réel.

**Reporté (documenté, pas construit maintenant) :**

- Chemin de mise à niveau WebSocket (capacité client requise par le RFD ; les SSE suffisent pour une vérification locale).
- Multiplexage HTTP/2 (nous utilisons HTTP/1.1 ; POST et GET longue durée utilisent des sockets séparés, ce qui fonctionne pour les clients CLI/Node et les navigateurs avec ≤6 connexions). Divergence documentée.
- Transfert complet `fs/*` + `terminal/*` agent→client (le chemin de permission prouve le mécanisme ; le reste est un suivi mécanique).
- Durcissement de la reprise des SSE en parité avec le tampon circulaire (Phase 4 dans le RFD).

---

## 8. Plan de vérification locale

1. `npm run build` (ou construction de l'espace de travail de `cli` + `acp-bridge`).
2. Démarrer le démon : `qwen serve --listen 127.0.0.1:0 --token <t>` (ou jeton d'environnement).
3. Exécuter `node scripts/acp-http-smoke.mjs` :
   - `POST /acp {initialize}` → vérifier `200` + `Acp-Connection-Id`.
   - Ouvrir le SSE de connexion ; `POST {session/new}` → vérifier la réponse sur le flux.
   - Ouvrir le SSE de session ; `POST {session/prompt:"say hi"}` → vérifier au moins 1 `session/update` puis un `{result:{stopReason}}` final.
   - Déclencher un outil nécessitant une permission → vérifier la requête `session/request_permission`, envoyer une réponse d'autorisation → vérifier que la requête est terminée.
   - `POST {_qwen/session/set_model}` → vérifier le changement de modèle + `session/update`.
4. Vitest : `acp-http/*.test.ts` vert.

---

## 9. Risques

| Risque                                 | Atténuation                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Modifications du RFD avant ratification | Derrière la balise de capacité + espace de noms `_qwen` ; module isolé ; facile à réviser. |
| HTTP/1.1 vs HTTP/2 requis              | Clients localhost/CLI non affectés ; documenté ; h2 est un échange de transport ultérieur. |
| Course entre deux transports sur un seul pont | Le pont prend déjà en charge plusieurs clients ; réutiliser son verrouillage. |
| Transfert `fs/*` vs FS local du démon   | Contrôlé par capacité : transférer lorsque le client déclare `fs`, sinon local. |

---

## 10. Journal d'implémentation et de vérification (v1)

Implémenté dans `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`,
`connection-registry.ts`, `dispatch.ts`, `index.ts`), monté depuis `server.ts`
via `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automatisé (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` démarre un vrai serveur Express + le vrai `mountAcpHttp` sur
un pont factice contrôlable et le conduit avec `fetch` + analyse manuelle des SSE.
15 tests verts, couvrant : `initialize` 200 + `Acp-Connection-Id` ; connexion inconnue
400 ; réponse `session/new` sur le flux de connexion ; requête → flux `session/update`
+ corrélation du résultat final ; aller-retour agent→client→agent
`session/request_permission` ; `_qwen/session/set_model` ; méthode non trouvée ;
démontage `DELETE`.

### Démon en direct (modèle réel)

Lancé `qwen serve --port 8767 --token … --workspace …` (entrée du bundle pour que le
processus enfant `qwen --acp` soit autonome) et exécuté `scripts/acp-http-smoke.mjs` :

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```
Le chemin d'erreur a également été confirmé en direct : lorsque l'enfant ne parvenait pas à démarrer, le délai d'attente du bridge remontait au client sous la forme d'une trame d'erreur JSON-RPC sur le flux de connexion (`{"id":2,"error":{"code":-32603,…}}`), prouvant la corrélation d'ID + la division 202/SSE en cas d'échec.

### Revue fold-in — clientId émis par le bridge (trouvé lors de la vérification en direct)

La première exécution en direct a échoué `session/prompt` avec _"client id … is not registered for session"_. Cause racine : `spawnOrAttach`/`loadSession` **ignorent** un clientId fourni par l'appelant que le bridge n'a jamais émis et tamponnent un nouveau (renvoyé dans `BridgeSession.clientId`) ; le dispatcher renvoyait l'ID de la connexion elle-même (non enregistré) sur `sendPrompt`. Correctif : persister l'ID tamponné par le bridge sur le `SessionBinding` et le renvoyer sur chaque appel par session (`sessionCtx`). Revérifié – tout est vert ci-dessus.

---

## 11. Revue round 2 — fold-ins

Deux revues indépendantes (correction/concurrence + conformité du protocole/sécurité) plus une auto-relecture. Tous les correctifs vérifiés par la suite vitest étendue (**18 tests**) + un nouveau test de fumée en direct (21 trames `session/update` → `stopReason=end_turn`).

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                                                                | Correctif                                                                                                                                                                           |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | La reconnexion du flux de session était définitivement morte : `SessionBinding.abort` était créé une fois et réutilisé ; à la fermeture du flux, il était définitivement arrêté, donc une reconnexion `subscribeEvents(signal)` recevait un signal déjà arrêté et ne recevait aucun événement.                   | `attachSessionStream` installe désormais un **nouveau** `AbortController` par flux (et ferme tout flux précédent) ; `index.ts` pompe sur ce nouveau signal.                        |
| R2  | **P0**   | `await dispatcher.handle()` s'exécutait **après** `res.end(202)` ; un appel de bridge générant une exception (notamment le chemin `isResponse` sans try/catch) était rejeté et remontait comme une promesse non gérée → plantage potentiel du démon.                                                         | Le chemin `isResponse` est encapsulé dans un try/catch ; `.catch()` sur le `handle(...)` en attente et sur `pumpSessionEvents(...)`.                                                |
| R3  | **P1**   | **Pas de propriété connexion→session** : toute connexion authentifiée pouvait ouvrir le SSE de session pour, ou envoyer une requête à, _n'importe quel_ sessionId dans l'espace de travail (lecture-écoute clandestine ; la requête n'était bloquée qu'incidemment par l'erreur de clientId non enregistré). | `AcpConnection.ownedSessions` est peuplé par `session/new`/`load`/`resume` ; le flux de session retourne `403` et les POST par session retournent `INVALID_PARAMS` pour les IDs non possédés (`requireOwned`). |
| R4  | **P1**   | Le gestionnaire `mountAcpHttp` a été abandonné → le minuteur de balayage TTL + les flux SSE en direct fuyaient à l'arrêt.                                                                                                                             | Le gestionnaire est déposé sur `app.locals` ; le hook de fermeture de `runQwenServe` appelle `dispose()` avant `bridge.shutdown()` (reflète le registre de flux d'appareil).        |
| R5  | **P1**   | **Fuite d'autorisation en attente** : la fermeture d'une session/connexion avec une autorisation en instance bloquait le bridge en attente d'un vote.                                                                                                 | `closeSessionStream`/`destroy` annulent les requêtes en attente correspondantes via un `onAbandonPending` injecté → `cancelAbandonedPermission`.                                    |
| R6  | **P1**   | Les tampons de trame de pré-attachement (`connBuffer`/`binding.buffer`) n'étaient pas limités.                                                                                                                                                         | Limité à 256 trames (suppression des plus anciennes), en correspondance avec `maxQueued` du EventBus.                                                                              |
| R7  | **P2**   | `initialize` ignorait la `protocolVersion` demandée par le client.                                                                                                                                                                                     | Négocie `min(requested, 1)`.                                                                                                                                                       |
| R8  | **P2**   | Pas de vérification croisée `Acp-Session-Id` ↔ `params.sessionId` (RFD §2.3).                                                                                                                                                                         | POST affirme qu'ils sont d'accord ; désaccord → `INVALID_PARAMS`.                                                                                                                  |
| R9  | **P2**   | Le formulaire de requête `session/cancel` (avec id) n'a jamais reçu de réponse ; `_meta.qwen` en double au niveau supérieur.                                                                                                                          | Réponse lorsque un id est présent ; un seul `agentCapabilities._meta.qwen`.                                                                                                       |
### Accepté / documenté (non corrigé dans v1)

- **Ordonnancement résultat-prompt vs `session/update` en attente** (P2) : `handlePrompt` attend `sendPrompt` puis écrit le cadre de résultat, tandis que les mises à jour sont diffusées en concurrence. En pratique, le pont publie tous les `session/update` sur le bus avant que `sendPrompt` ne se résolve et ils partagent une seule chaîne d'écriture SSE ordonnée, donc le résultat arrive en dernier (confirmé : 21 mises à jour puis résultat). Une barrière stricte est un durcissement possible ultérieur si un réducteur client s'avère sensible.
- **Le navigateur `EventSource` ne peut pas définir `Authorization`** — les flux GET `/acp` nécessitent l'en-tête bearer, donc les navigateurs ont besoin du chemin WebSocket différé (§7) ; les clients CLI/Node ne sont pas affectés.
- La véritable frontière de confiance du démon reste le **jeton bearer + liaison à un seul espace de travail** (identique à la surface REST) ; la vérification de propriété R3 est une défense en profondeur + correction de contrat, pas une frontière de locataire.

---

## 12. Revue de la troisième itération — intégrations des bots PR (#4472)

Deux relecteurs de PR automatisés plus le bot de résumé. Toutes les corrections vérifiées par la suite (maintenant **22 tests**) + une exécution directe fraîche (16 `session/update` → `end_turn`).

| #   | Gravité | Constat                                                                                                                                                                                                                                     | Correction                                                                                                                                                                        |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**  | `handlePrompt`'s `AbortController` n'était jamais abandonné — un client qui se déconnectait/annulait laissait l'agent en cours d'exécution (consommation de quota modèle, blocage de la file FIFO de session). Signalé par les deux bots + 5 sous-agents.                                        | `promptAbort` stationné sur `SessionBinding` ; abandonné par `session/cancel` et par la déconnexion de session/connexion (`closeSessionStream`/`destroy`).                                  |
| B2  | **P0**  | `sessionCtx` manquant `fromLoopback` → chaque vote de permission ACP traité comme distant ; la politique `local-only` rejetterait les clients en boucle locale.                                                                                                       | Capturer la boucle locale lors de `initialize` (kernel `remoteAddress`, pas d'en-têtes falsifiables) → `AcpConnection.fromLoopback` → transmis via `sessionCtx`.                            |
| B3  | **P0**  | Les échecs d'écriture SSE avalés silencieusement → flux zombies (battements de cœur émis, zéro événement délivré, aucun journal).                                                                                                                                   | Premier échec d'écriture : journalise + ferme le flux.                                                                                                                               |
| B4  | **P0**  | Le balayage inactif détruisait les connexions sans journal + sans limite de connexion (inondation d'initialize).                                                                                                                        | Le balayage journalise chaque nettoyage ; `pumpSessionEvents` appelle `touch()` (les longues requêtes silencieuses ne sont pas nettoyées) ; limite `maxConnections` (64) → `503`.                                            |
| B5  | **P1**  | `sessionCtx` retombait silencieusement sur le clientId non enregistré de la connexion quand la liaison en manquait (non testé, toujours déclenché dans `FakeBridge`).                                                                                             | Lever une exception sur un clientId estampillé manquant (violation d'invariant) ; `FakeBridge` en estampille maintenant un.                                                                                       |
| B6  | **P1**  | `session/new                                                                                                                                                                                                                                | load                                                                                                                                                                        | resume` accepte `cwd` non validé (REST valide chaîne/longueur/absolu — amplification DoS). | Fonction partagée `parseOptionalWorkspaceCwd` (chaîne, ≤4096, absolu). |
| B7  | **P1**  | `session/prompt` transmettait un `prompt` non validé au pont.                                                                                                                                                                           | `validatePrompt` (tableau non vide d'objets), en miroir de REST.                                                                                                              |
| B8  | **P1**  | Messages d'erreur bruts du pont renvoyés au client.                                                                                                                                                                                             | `toRpcError` mappe les erreurs connues du pont vers des formes codées et sécurisées pour le client ; inconnues → `Internal error` générique (détail complet toujours vers stderr).                                       |
| B9  | **P1**  | `nextId` utilisait des négatifs séquentiels — un client utilisant légitimement des identifiants négatifs pouvait entrer en collision dans `pending`.                                                                                                                        | Les identifiants provenant du démon sont maintenant des chaînes (`_qwen_perm_N`), disjoints de tout identifiant client.                                                                                        |
| B10 | **P2**  | `resolveClientResponse` le type de paramètre excluait `JsonRpcError` ; le flux SSE à portée de connexion n'avait pas de `onClose` ; `DELETE` sans en-tête était un 202 silencieux ; `SseStream.close` exécutait `onClose` en dehors de try/catch ; `session/load`·`resume`·`close` non testés. | Élargi le paramètre à `JsonRpcResponse` ; le flux de connexion journalise à la fermeture ; `DELETE` sans en-tête → `400` ; `onClose` enveloppé dans try/catch ; ajout de tests load/resume/close + DELETE-400. |
**Hors champ (branche de base `daemon_mode_b_main`, pas ce diff)** — le deuxième relecteur a signalé des erreurs de typecheck dans `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`) et d'autres éléments préexistants qu'il attribuait explicitement à la branche de base (introduits par #4353). Suivi séparément ; pas modifié ici.

**Toujours différé** (documenté) : secret par connexion pour `DELETE`/propriété de connexion (le token reste la frontière) ; WebSocket + HTTP/2 (§7) ; barrière stricte prompt-résultat vs mise à jour finale (§11).

---

## 13. Tour de relecture 4 — intégrations de PR (rebasées sur #4469)

Branche rebasée sur `daemon_mode_b_main` (#4353 + #4469) — **propre, pas de conflits**. Deux relecteurs de PR (GPT-5 + qwen3.7-max). La suite comporte maintenant **25 tests** ; revérifiée en direct (125 `session/update` → `end_turn`).

| #   | Gravité | Constat                                                                                                                                                                                     | Correction                                                                                                                                                                                            |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**  | Le traitement des échecs d'écriture SSE du tour 3 était documenté mais PAS implémenté — `SseStream` le laissait encore aux appelants qui abandonnaient (flux zombies).                                                 | `writeRaw` en prend désormais la responsabilité : le premier rejet d'écriture journalise une fois + appelle `close()` ; `doWrite` écoute aussi `'error'` (rejette rapidement au lieu d'attendre `'close'`) ; `onClose` enveloppé dans try/catch. |
| C2  | **P1**  | `fromLoopback` capturé uniquement à l'initialisation + helper plus restreint que REST → les votes `local-only` d'un POST ultérieur mal jugés.                                                                  | Loopback par requête transmis via `handle`→`sessionCtx`/`resolveClientResponse` ; `isLoopbackReq` élargi à `127.0.0.0/8` + `::ffff:127.*` + `::1` (correspond à REST).                         |
| C3  | **P1**  | Le routage des erreurs déduisait le flux de `params.sessionId` → les échecs de méthodes liées à la connexion (`session/load`/`resume`/`close`/`heartbeat`) étaient mal routés vers un flux de session inexistant (perte silencieuse). | Ensemble `CONN_ROUTED_METHODS` ; les erreurs routent de la même manière que le chemin de succès.                                                                                                                      |
| C4  | **P1**  | `bridge.detachClient` jamais appelé lors du démontage → des identifiants de client obsolètes marqués par le bridge persistent dans `knownClientIds()`/ensembles de votants.                                                                   | Le registre prend une `DetachSessionFn` ; `closeSessionStream`/`destroy` détachent chaque session possédée (au mieux).                                                                                    |
| C5  | **P1**  | `session/close` sautait le nettoyage local si `bridge.closeSession` levait une exception.                                                                                                                       | `closeSessionStream` déplacé dans un `finally`.                                                                                                                                                   |
| C6  | **P2**  | Le `cwd` Windows (`C:\…`) rejeté par `startsWith('/')`.                                                                                                                                       | `path.isAbsolute` (tenant compte de la plateforme), correspondant à REST.                                                                                                                                             |
| C7  | **P2**  | `protocolVersion` pouvait négocier `0`/négatif.                                                                                                                                             | Limiter avec `Math.max(1, Math.min(requested, 1))` ; tests pour 0/négatif/énorme/invalide.                                                                                                                     |
| C8  | **P2**  | `session/load`/`resume` acceptait un `sessionId` vide.                                                                                                                                         | Rejeter le vide avec `INVALID_PARAMS`.                                                                                                                                                            |
| C9  | **P2**  | Les erreurs `session/prompt` sous forme de notification disparaissaient silencieusement.                                                                                                                                | Journaliser sur le chemin sans identifiant.                                                                                                                                                                         |
| C10 | **P2**  | Le SSE de session vidait les trames mises en mémoire tampon avant les en-têtes/`retry:`.                                                                                                                                | `open()` avant `attachSessionStream`.                                                                                                                                                         |
| C11 | **P2**  | Duplication locale de `logStderr`.                                                                                                                                                                | `writeStderrLine` partagé depuis `utils/stdioHelpers`.                                                                                                                                            |
| C12 | **P2**  | La documentation faisait la promotion du flag `--no-acp-http`, du tag de capacité `acp_http`, et du forwarding `fs/*` pas dans la v1.                                                                                           | Documentation alignée sur la surface livrée (uniquement toggle via variable d'environnement ; `fs/*`+`terminal/*` + flag + tag marqués comme différés).                                                                                        |
Toujours différé (inchangé) : WebSocket + HTTP/2 ; secret par connexion pour `DELETE`/ownership (token + espace de travail unique reste la frontière) ; barrière stricte d'ordonnancement prompt-résultat ; les casts de frontière de pont `as never` (ciblés, notés pour un suivi adapter-types).

---

## 14. Revue tour 5 — intégrations PR

Un passage supplémentaire du relecteur (qwen3.7-max). Suite de **26 tests**, revérifié en direct.

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                                                                                                                                | Correction                                                                                                                                                                                                                     |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **P0**   | `resolveClientResponse` supprimait l'entrée en attente AVANT d'appeler `respondToSessionPermission`. Un vote malformé (`result: {}`) fait lever une exception au médiateur du pont — et avec l'entrée en attente déjà supprimée, `abandonPendingForSession` du démontage ne peut pas l'annuler, donc l'invite de l'agent bloque sur un vote qui ne se résout jamais (un détenteur de jeton pourrait bloquer une session avec un seul POST erroné). | Envelopper le vote dans try/catch ; en cas d'échec, recourir à `cancelAbandonedPermission` pour que le médiateur soit toujours libéré. Un nouveau test couvre le chemin du vote malformé.                                       |
| D2  | **P1**   | Le `onClose` du flux de session n'annulait que la pompe à événements, pas `binding.promptAbort` — une déconnexion client (fermeture d'onglet / perte réseau) laissait l'invite en cours s'exécuter (quota + FIFO) jusqu'au TTL d'inactivité.                                                                                                                                          | `onClose` annule désormais aussi `promptAbort` de la session.                                                                                                                                                                  |
| D3  | **P1**   | Lorsque `pumpSessionEvents` rejetait, le `.catch` se contentait de journaliser — le flux SSE restait ouvert avec des battements de cœur mais ne délivrait rien (zombie, aucun signal de reconnexion).                                                                                                                                                                                 | `.catch` appelle désormais aussi `closeSessionStream(sessionId)`.                                                                                                                                                              |

---

## 15. Revue tour 6 — intégrations PR

Un autre passage du relecteur (qwen3.7-max). Suite de **28 tests**, revérifié en direct.

| #   | Sévérité | Constat                                                                                                                                                                                                                                                                         | Correction                                                                                                                                                                                                                                                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**   | `handlePrompt` écrasait `binding.promptAbort` sans annuler le contrôleur précédent — deux `session/prompt` simultanées pour une même session laissaient la première orpheline (s'exécute jusqu'au bout dans la FIFO du pont, impossible à annuler par `session/cancel`).         | Annuler le `promptAbort` précédent avant d'installer le nouveau. Test ajouté.                                                                                                                                                                                                                                                                       |
| E2  | **P0**   | Le chemin où `subscribeEvents` lève une exception envoyait une notification `stream_error` puis `return`ait (résolu) — le `.catch` de l'appelant ne se déclenchait jamais, laissant un flux SSE zombie (battements de cœur, pas d'événements, pas de signal de reconnexion).      | Relancer après la notification pour que le `.catch` de l'appelant ferme le flux. Le test vérifie la fermeture de l'invite.                                                                                                                                                                                                                         |
| E3  | **P1**   | Le battement de cœur SSE ne marquait pas la connexion comme active — une invite longue sans événements intermédiaires pendant >30 min était récupérée par inactivité (flux + invites tués).                                                                                     | `SseStream` accepte un hook `onHeartbeat` ; les deux gestionnaires GET passent `() => conn.touch()`.                                                                                                                                                                                                                                               |
| E4  | **P2**   | Le `.catch` de `pumpSessionEvents` fermait par sessionId — une reconnexion entre l'exception et la microtâche pouvait tuer le NOUVEAU flux.                                                                                                                                     | Garde d'identité : ne fermer que si `binding.stream` est toujours ce flux.                                                                                                                                                                                                                                                                          |
| E6  | **P2**   | `sendSession` créait automatiquement un binding — une trame pump/reply tardive après `closeSessionStream` ressuscitait un binding fantôme qui mettait en mémoire tampon jusqu'à 256 trames indéfiniment.                                                                        | `sendSession` ne fait plus que chercher : il ignore les trames quand la session n'a pas de binding actif.                                                                                                                                                                                                                                          |
| E5  | accepté | `session/load`/`resume` ne rejettent pas lorsqu'une autre connexion active possède la session (« détournement »).                                                                                                                                                               | **Accepté, non modifié :** la frontière de confiance du démon est le jeton porteur + la liaison espace de travail unique, et l'attachement multi-client est intentionnel (le pont est multi-client par conception ; REST a la même propriété). Un détenteur de jeton n'acquiert aucune capacité qu'il ne possède pas via REST. Suivi avec les autres éléments de la frontière de jeton (propriété DELETE, §13). |
---

## 16. 7<sup>e</sup> tour de relecture — Intégrations des PR

Un autre passage du relecteur (qwen3.7-max). Suite **30 tests**, revérification en direct.

| #   | Gravité | Constat                                                                                                                                                                                                        | Correction                                                                                                                                                                                                   |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | **P0**  | TOCTOU concurrent sur `session/close` : `ownedSessions.delete` n'était exécuté que dans `finally` (après le await), donc deux fermetures simultanées passaient toutes les deux `requireOwned` → erreur trompeuse pour la 2<sup>e</sup> + fermeture de bridge redondante. | Supprimer le verrou de propriété de manière SYNCHRONE avant le await ; la fermeture du bridge s'exécute une seule fois. Test ajouté.                                                                         |
| F2  | **P1**  | Cycle de vie de pompe : une fin propre d'itérateur (processus terminé, `done`) résolue → le `.catch` ne se déclenchait jamais → flux zombie ; et une erreur d'itérateur en cours de flux n'envoyait pas `stream_error`.                                                   | `pumpSessionEvents` encapsule toute la boucle (erreurs synchrones + en cours de flux envoient `stream_error` puis relancent) ; le consommateur `.then(onDone, onErr)` ferme le flux sur les DEUX chemins (protégé par identité). Tests ajoutés. |
| F3  | **P2**  | Aucun log stderr pour le rejet de capacité de connexion 503.                                                                                                                                                   | `writeStderrLine` avec la valeur de la limite.                                                                                                                                                               |
| F4  | **P2**  | L'étalement de `_qwen/notify stream_error` faisait que `event.data.kind` masquait le discriminateur.                                                                                                            | D'abord l'étalement, puis `kind : 'stream_error'`.                                                                                                                                                           |
| F5  | **P2**  | `MAX_WORKSPACE_PATH_LENGTH` redéclarée (`= 4096`) vs la version canonique dans `fs/paths.js`.                                                                                                                  | Importer depuis `../fs/paths.js` (pas de divergence).                                                                                                                                                        |
| F6  | **P2**  | `isObjectParams` dupliqué `json-rpc.isObject`.                                                                                                                                                                 | Importer `isObject`.                                                                                                                                                                                         |
| F7  | **P2**  | `process.stderr.write` brut dans `index.ts`/`sse-stream.ts` vs `writeStderrLine` ailleurs.                                                                                                                     | Unifié sur `writeStderrLine` dans tout le module.                                                                                                                                                            |

---

## 17. Alignement d'équivalence REST + mise en œuvre de l'audit des extensions (round 8)

Objectif : faire de `/acp` une **alternative équivalente** REST+SSE. Ce lot restructure les extensions sur la base des conclusions de l'audit et comble **toutes les capacités déjà exposées** par le bridge ; les capacités non encore supportées par le bridge (E/S fichier, flux appareil, agents/memory CRUD) sont **d'abord complétées par acp-bridge** selon les exigences d'exactitude architecturale (voir §17.3).

### 17.1 Audit des extensions → mise en œuvre (remplace l'ancien schéma du §5)

Vérification basée sur le **SDK implémenté dans le dépôt `@agentclientprotocol/sdk@0.14.1`** (pas seulement le site officiel) :

- `session/set_config_option` est une méthode **de première classe (non `unstable_`)**, requête `{sessionId, configId, value}`, `category` inclut `model`/`mode`/`thought_level` ; alors que `set_model` passe toujours par `unstable_setSessionModel`.
- La spécification réserve le préfixe `_` pour les extensions, avec l'exemple du style domaine `_zed.dev/…` ; les données du fournisseur sont placées dans `_meta` avec des clés par domaine.

Mise en œuvre :

- **Namespace `_qwen/` → nom de domaine inversé `_qwen/`** ; `_meta` unifié sous `_meta:{ "qwen": … }` (incluant la publicité des capacités `initialize` et le `requestId` de `session/request_permission`).
- **Modèle + mode d'approbation → `session/set_config_option` standard** (`configId:"model"|"mode"`), routé vers les `bridge.setSessionModel`/`setSessionApprovalMode` existants ; le résultat de `session/new` **publicise `configOptions`** (issu de l'état de la session du sous-processus `getSessionContextStatus().state.configOptions`, déjà au format ACP). **Supprime** l'extension fabricant `_qwen/session/set_model`.
- REST (http+sse) **ne nécessite pas de modification synchrone** : les deux transports partagent le même bridge, l'état est naturellement cohérent.
### 17.2 Nouvelles méthodes `/acp` de ce lot (bridge déjà pris en charge, alignement 1:1 avec REST)

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **Standard** `session/set_config_option` (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

(Existants : session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events déjà alignés.)

### 17.3 Lacunes restantes → exiger que acp-bridge les comble d'abord (correctitude architecturale)

Les **E/S fichiers** de REST (`/file /glob /list /stat /file/write /file/edit`), **connexion par flux d'appareil** (`/workspace/auth/*`), **CRUD agents** (`/workspace/agents`), **CRUD mémoire** (`/workspace/memory`) ne sont **pas encore sur `HttpAcpBridge`** — les routes REST appellent directement des services au niveau route (`WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), contournant ainsi le bridge.

**Décision (intégrant les avis de la revue/owner)** : Ne pas faire en sorte que le transport `/acp` se connecte directement à ces services de niveau route (cela reproduirait la dérive architecturale de REST et doublerait le couplage du transport). **La bonne approche est d'abord de compléter ces capacités dans `HttpAcpBridge` de `@qwen-code/acp-bridge`** (par exemple `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), afin que REST et `/acp` passent tous deux par le bridge. À ce moment-là, `/acp` ajoutera `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` (la lecture de fichier étant une extension propriétaire légitime, car il n'existe pas de méthode ACP client→agent standard).

**Équivalence complète = lot actuel (capacités déjà présentes dans le bridge) + lot ultérieur après que acp-bridge a comblé les lacunes.**

---

## 18. Review round 9 — PR fold-ins

| #   | Sévérité            | Constat                                                                                                                                                                                                                                                                             | Correctif                                                                                                                                                                               |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1 (régression)** | La reconnexion du flux de session a abandonné la requête en cours : `attachSessionStream` a fermé l'ANCIEN flux avant d'en installer un nouveau, et le `onClose` de l'ancien flux annulait inconditionnellement `promptAbort` — un client se reconnectant (problème réseau/itinérance) perdait sa requête en cours. | Installer le nouveau flux AVANT de fermer l'ancien ; protéger par identité l'annulation de la requête dans `onClose` (n'annuler que si CE flux est toujours le flux actif de la session). Test ajouté (la requête survit à la reconnexion). |
| G2  | **P2**              | `session/cancel` passait `undefined` comme corps de `CancelNotification`, supprimant les champs d'annulation fournis par le client (motif/contexte) que REST transmet.                                                                                                              | Transmettre `{ ...params, sessionId }` (en miroir de REST).                                                                                                                              |

Rebasé sur le dernier `daemon_mode_b_main` (#4473/#4483/#4484/#4500), sans conflit. Suite de **33 tests**, revérification en direct.

---

## 19. Feuille de route / PR suivants (pour mémoire)

Ce PR (#4472) = transport ACP Streamable HTTP + **alignement complet des capacités passant par le bridge** + schéma d'extension officiel. Maintenant **prêt**. Pour atteindre «`/acp` totalement équivalent à REST+SSE», il reste :

1. **PR de suivi 1 — Complément des capacités acp-bridge (prérequis / bridge-first)** : Ajouter à `HttpAcpBridge` les méthodes d'E/S fichiers, flux d'appareil, CRUD agents, CRUD mémoire ; modifier les routes REST pour passer par le bridge (éliminer la dérive des appels directs aux services de niveau route).
2. **PR de suivi 2 — Alignement restant de `/acp` (dépend du PR 1)** : `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → équivalence complète avec REST.
**Suivi :** #3803 (open decisions), #4175 (feuille de route Mode B) ont tous été commentés.  
Les éléments de durcissement différés sont indiqués dans la description de la PR « deferred connu ».

---

## 20. Renommage de l'espace de noms d'extension + analyse du transport SDK (tour 11)

- **Espace de noms `_qwen.ai/` → `_qwen/`** : La seule règle stricte de l'ACP est le `_` initial ; le segment de domaine `_zed.dev/` est une convention par l'exemple, pas une obligation. Comme `qwen` est distinctif, nous utilisons la forme nue plus courte. La clé `_meta` sera également `"qwen"`. (Étude d'agents réels : Zed/gemini-cli utilisent principalement `_meta` sur les méthodes standard + le propre `unstable_*` de l'ACP ; les méthodes `_` personnalisées nues sont rares — nos `_qwen/*` sont des opérations véritablement nouvelles d'espace de travail/session sans équivalent standard, donc une méthode `_` est l'outil approprié.)
- **Pourquoi un transport artisanal (pas basé sur SDK) :** Le SDK TS ne fournit que `ndJsonStream` (stdio) ; le RFC #721 HTTP est en phase 3 du SDK (non implémenté). La `Connection` du SDK est un flux duplex unique ; notre transport est multi-flux (POST + SSE de connexion + SSE par session) et nécessite un démultiplexage sortant par sessionId — ce que notre dispatcher connaît déjà au moment du routage. Une réécriture complète avec le SDK irait à l'encontre de ce modèle et ne supprimerait pas l'essentiel (traduction du pont, cycle de vie SSE, propriété, EventBus → JSON-RPC). **Amélioration pragmatique (candidat pour un suivi) : adopter les validateurs de schémas Zod + types du SDK pour la validation des paramètres tout en conservant le transport artisanal.** Les clients SDK utilisant `extMethod('_qwen/…')` interopèrent avec nos gestionnaires (forme filaire identique).
