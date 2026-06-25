# Couche d'abstraction DaemonTransport

> Branche cible : `main`. Auteur : arnoo.gao. Date : 2026-06-12. Statut : **Design v4 — review**.
> Workflow design-first par dépôt : ce document arrive avant la PR d'implémentation.

---

## 0. TL;DR

`DaemonClient` intègre en dur REST+SSE. Les intégrations tierces souhaitant utiliser ACP WebSocket doivent forker la pile du fournisseur (~8 fichiers). Cette proposition ajoute une **interface `DaemonTransport`** avec les méthodes `fetch` + `subscribeEvents`, ainsi que la détection automatique et un repli à l'exécution, permettant des transports enfichables avec **zéro changement cassant**.

**Modification totale : ~1300 lignes** dans une seule PR d'implémentation. Les consommateurs existants ne sont pas touchés — `new DaemonClient({ baseUrl, token })` = comportement actuel.

---

## 1. Contexte

### 1.1 Architecture actuelle

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← hardcoded
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 méthodes publiques, chacune construisant des URL REST et bifurquant sur les codes de statut HTTP. `fetch` est déjà injectable via `DaemonClientOptions.fetch`, mais `subscribeEvents` contient une logique SSE inline (vérification du type de contenu, parsing SSE, délai d'attente de phase de connexion) qui ne peut pas être échangée par la seule injection de fetch.

### 1.2 Le problème pour les tiers

Quand un tiers (par exemple `agent-web`) construit un `AcpSessionProvider` pour utiliser WebSocket au lieu de REST+SSE :

- **S'ils remplacent** `DaemonSessionProvider` : les composants qui lisent `DaemonStoreContext` (par exemple TerminalView) perdent leur contexte → plantage.
- **S'ils gardent les deux fournisseurs** : deux sources d'événements, deux magasins, désynchronisation.
- **S'ils injectent des événements** dans le magasin SDK : `DaemonSessionProvider` s'abonne aussi en interne à SSE → événements en double.

**Cause racine** : changer le transport nécessite de remplacer le fournisseur, car `subscribeEvents` de `DaemonClient` est codé en dur pour SSE.

### 1.3 Objectif

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → maps URL+verb to JSON-RPC over WS
  └─ transport.subscribeEvents → demux WS notifications → DaemonEvent
```

Un seul fournisseur, un seul magasin, le transport est un détail interne. Les tiers passent `transport` à `DaemonClient` ; tout le reste fonctionne sans changement.

---

## 2. Conception

### 2.1 Interface

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = no timeout. undefined = transport default.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Send a request and return a Response.
   *
   * Contract:
   * - Response MUST support .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status MUST be an accurate HTTP status code
   *   (200, 201, 202, 204, 404, etc.)
   * - Error bodies MUST preserve the daemon's structured shape
   * - Callable without prior setup; transport handles init internally
   *   (lazy-init / init-once deferred pattern)
   * - Throws DaemonTransportClosedError when connection is dead
   * - When init.signal aborts: for prompt requests, transport MUST
   *   cancel the in-flight prompt on the wire (WS: send session/cancel
   *   RPC; HTTP: abort fetch). For ordinary requests, abort only
   *   rejects/cancels the pending request without side effects.
   *   Pending response rejects with AbortError.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * Subscribe to session events.
   *
   * Contract:
   * - Events with id MUST have monotonic integer ids; synthetic/terminal
   *   frames (e.g., stream_error) MAY omit id (DaemonEvent.id is optional)
   * - MUST deliver ALL event types (session + workspace) in one stream
   * - Aborting signal MUST stop only this generator, NOT the connection
   * - When the connection dies, all pending generators MUST throw
   *   DaemonTransportClosedError (transport maintains generator refs)
   * - MUST apply connectTimeoutMs to connect phase only
   * - Transport MUST declare whether lastEventId replay is supported;
   *   if not, consumer MUST use session/load for full resync on reconnect
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Transport identity for exhaustive switching. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Whether this transport supports Last-Event-ID based replay on reconnect.
   *  When false, consumer MUST use session/load for full resync. */
  readonly supportsReplay: boolean;

  /** False after connection drop or dispose(). */
  readonly connected: boolean;

  /** Idempotent teardown. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Pourquoi deux méthodes (fetch + subscribeEvents) et pas seulement fetch

`subscribeEvents` a des sémantiques filaires fondamentalement différentes par transport :

| Transport | Mécanisme filaire                                                     |
| --------- | ------------------------------------------------------------------ |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP  | `GET /acp` (session-scoped SSE) → JSON-RPC notification unwrap     |
| ACP WS    | Démultiplexage des notifications du socket partagé par sessionId    |
Forcer ces appels à travers un trou en forme de `fetch` nécessite un ré-encodage/décodage SSE (WS → faux texte SSE → `parseSseStream` → DaemonEvent) — coûteux et fragile.

Les 66 autres méthodes fonctionnent via `fetch` parce qu'elles suivent une sémantique requête→réponse, quel que soit le transport.

### 2.3 Pourquoi au niveau fetch, pas une dispatch par méthode

Les 67 méthodes de DaemonClient contiennent des branchements HTTP par méthode :

- `prompt()` : vérification du statut 202 vs 200
- `deleteWorkspaceAgent()` : 204 vs 404 avec inspection du corps
- `respondToPermission()` : 200 vs 404 pour la détection de concurrence
- 6 méthodes contournent `fetchWithTimeout` en appelant `_fetch` directement

Une interface de dispatch par méthode (`request<T>(method, params)`) force la duplication de toute cette logique dans chaque transport. Le niveau fetch conserve DaemonClient inchangé.

### 2.4 Modifications de DaemonClient (~40 lignes)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Conservé
  fetchTimeoutMs?: number; // Conservé
  transport?: DaemonTransport; // NOUVEAU — substitution optionnelle
}
```

Modifications internes :

- Constructeur : `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout` : délègue à `this.transport.fetch(url, init, { timeout })`
- 6 sites directs `this._fetch` (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents) : remplacer par
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents` : `switch` exhaustif sur `this.transport.type` :
  - `'rest'` : délègue à `this.transport.subscribeEvents(sessionId, opts)`
  - défaut : même délégation (chaque transport gère son propre format filaire)
- Supprimer le champ `private _fetch` (remplacé par le transport)

### 2.5 Point d'injection du fournisseur

`DaemonWorkspaceProvider` et `DaemonSessionProvider` construisent toutes deux
`DaemonClient` en interne. Pour permettre à des tiers d'injecter un transport sans
contourner le fournisseur :

```typescript
// DaemonWorkspaceProvider — ajouter une prop transport optionnelle
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NOUVEAU — transmis à DaemonClient
  // ...props existantes
}

// DaemonSessionProvider — hérite du contexte workspace
// Pas de prop transport nécessaire ; lu depuis le contexte workspace
```

Lorsque `transport` est fourni, le fournisseur le passe à `DaemonClient` :

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Lorsqu'il est omis : comportement actuel (REST+SSE). ~5 lignes de modification du fournisseur.

### 2.5 RestSseTransport (~80 lignes)

Encapsule `globalThis.fetch` + extrait la logique SSE actuelle de
`DaemonClient.subscribeEvents` :

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE prend en charge Last-Event-ID
  readonly connected = true; // REST est sans état

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Logique actuelle de DaemonClient.subscribeEvents déplacée ici :
    // - construire l'URL à partir de this.baseUrl + sessionId
    // - définir l'en-tête Authorization à partir de this.token
    // - timeout de phase de connexion depuis opts.connectTimeoutMs
    // - fetch → valider content-type → parseSseStream → yield
  }

  dispose() {} // sans effet
}
```

### 2.6 Détails internes des transports ACP

**AcpWsTransport** (~400-600 lignes) :

- Initialisation paresseuse : le premier appel `fetch` ouvre la WS et envoie `initialize`
- Table de correspondance URL→JSON-RPC : `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Multiplexeur de requêtes : `Map<id, {resolve, reject}>` pour les requêtes en attente
- `subscribeEvents` : filtre le flux de notifications partagées par sessionId
- `connected` : suit l'état readyState de la WS
- `supportsReplay` : false (WS n'a pas de Last-Event-ID ; le consommateur doit utiliser `session/load`)
- Synthétise des objets `Response` avec les bons `.status`/`.json()`/`.text()`

**AcpHttpTransport** (~800-1000 lignes) :

- Initialisation paresseuse : le premier appel `fetch` envoie `POST /acp {initialize}`
- Gère en interne les flux SSE liés à la connexion et à la session
- Même correspondance URL→JSON-RPC + corrélation de requêtes
- `supportsReplay` : true (le SSE de session prend en charge Last-Event-ID)

### 2.7 Détection automatique du transport

Le serveur annonce les transports supportés dans `GET /capabilities` :

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...champs de capacités existants...
}
```

Le SDK fournit une fabrique statique à usage unique :

```typescript
// Sonder une fois avant le rendu React, ne jamais changer en cours de session
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Retourne le meilleur disponible : acp-ws > acp-http > rest (solution de repli)
```

Implémentation :

1. `GET /capabilities` → lire le tableau `transports`
2. Si `acp-ws` dans la liste → essayer une mise à niveau WS ; en cas de succès retourner `AcpWsTransport`
3. Si WS échoue ou n'est pas dans la liste → essayer `acp-http` ; en cas de succès retourner `AcpHttpTransport`
4. Solution de repli → `RestSseTransport`

Aucune API existante affectée : `GET /capabilities` ajoute un nouveau champ (additif),
les consommateurs existants ignorent les champs inconnus.
### 2.8 Repli au moment de l'exécution (WS → REST en cas de déconnexion)

Lorsqu'un transport non-REST se déconnecte en pleine session :

```
AcpWsTransport (connected=true)
  │
  ├── La WS tombe (réseau, redémarrage serveur, timeout d'inactivité)
  │
  ├── connected = false
  ├── Tous les appels fetch() en attente → rejet avec DaemonTransportClosedError
  ├── Tous les générateurs subscribeEvents → lèvent DaemonTransportClosedError
  │
  └── Le consommateur (Provider / tiers) détecte la déconnexion :
        1. Créer un nouveau RestSseTransport (garanti de fonctionner si le daemon est actif)
        2. Créer un nouveau DaemonClient({ transport: newTransport })
        3. Pour chaque session active : session/load pour se rattacher
        4. Reprendre l'abonnement aux événements
```

**Contrainte clé** : le repli au moment de l'exécution est **piloté par le consommateur, pas interne au transport**.
Le transport ne change pas de protocole silencieusement — il échoue bruyamment
(`DaemonTransportClosedError`) et c'est au consommateur de décider s'il reconstruit.

Justification :

- La déconnexion WS détruit toutes les sessions possédées côté serveur (`registry.delete` →
  `conn.destroy`). Un basculement silencieux masquerait cette perte de données.
- `session/load` se rattache à la session bridge existante (transcriptions
  préservées), mais l'invite en cours est avortée. Le consommateur doit gérer
  cela explicitement (réessayer ou remonter à l'utilisateur).
- Pas de reprise `Last-Event-ID` entre les transports pour l'instant (Phase 4). Les événements entre
  la déconnexion et la reconnexion peuvent être perdus. Le consommateur devrait demander une
  resynchronisation complète de l'état via `session/load` (qui rejoue l'historique).

**AutoReconnectTransport** (~150 lignes, wrapper optionnel) :

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // Sur DaemonTransportClosedError du transport interne :
  // 1. Essayer de recréer le transport préféré
  // 2. Si le préféré échoue, basculer sur REST
  // 3. Réinitialiser la connexion
  // L'appelant doit encore faire session/load — ce wrapper ne gère
  // que la reconnexion au niveau transport, pas au niveau session.
}
```

Ce wrapper est optionnel. Les consommateurs existants qui ne veulent pas de reconnexion
automatique attrapent simplement `DaemonTransportClosedError` et le gèrent eux-mêmes.

**Impact sur les fonctionnalités existantes** : zéro. Tout le code de détection automatique et de repli
est additionnel et optionnel. `new DaemonClient({ baseUrl, token })` sans
`transport` = comportement REST actuel, pas de détection automatique, pas de logique de repli.

---

## 3. Audit des changements cassants

### Verdict : zéro changement cassant

| API publique                            | Changement                              | Cassant ? |
| --------------------------------------- | --------------------------------------- | :-------: |
| `new DaemonClient({ baseUrl, token })`  | Aucun changement                        |    ❌     |
| `DaemonClientOptions.*`                 | Tous conservés, `transport` ajouté      |    ❌     |
| `DaemonHttpError`                       | Inchangé                                |    ❌     |
| `DaemonSessionClient`                   | Aucun changement (délègue à DaemonClient)|    ❌     |
| Toutes les exports de types (100+)      | Inchangées                              |    ❌     |

### Impact par consommateur

| Consommateur                     | Impact                                  |
| -------------------------------- | --------------------------------------- |
| webui (25 fichiers)              | Aucune modification de code             |
| web-shell (4 fichiers)           | Aucune modification de code             |
| vscode-ide-companion (1 fichier) | Aucune modification de code             |
| Tiers                            | Aucun pour REST ; passer `transport` pour ACP |

---

## 4. Décisions de conception

| Décision                                         | Justification                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` sur le transport, pas seulement `fetch` | Le ré-encodage SSE via fetch est coûteux et fragile                                                                                                                         |
| `connected: boolean` sur le transport                | La boucle de reconnexion du Provider doit distinguer « transport mort » de « 500 temporaire »                                                                                        |
| Initialisation paresseuse (pas de `connect()` explicite) | Garde la construction de DaemonClient synchrone ; le défaut `new RestSseTransport()` n'a besoin d'aucune initialisation                                                               |
| La détection automatique est unique, pas en cours de session      | `negotiate()` sonde une fois au démarrage ; le repli en cours d'exécution est piloté par le consommateur via `DaemonTransportClosedError`, pas par un basculement interne silencieux |
| Pas de taxonomie d'erreur préalable                   | Les transports ACP mappent les erreurs en codes de statut équivalents HTTP en interne ; `DaemonHttpError` fonctionne tel quel                                                         |
| Le Provider reçoit une prop `transport`                 | `DaemonWorkspaceProvider` gagne une prop optionnelle `transport` (~5 lignes), transmise au constructeur de `DaemonClient`. Les tiers définissent cette prop ; l'omettre = comportement REST actuel |
---

## 5. Alternatives envisagées

### 5.1 Injection personnalisée de fetch (sans nouvelle interface)

Passer un `fetch` basé sur WS via `DaemonClientOptions.fetch` existant.

**Rejeté** : `subscribeEvents` valide `content-type: text/event-stream` et utilise `parseSseStream`. Un fetch personnalisé doit ré-encoder les trames WS en texte SSE, puis le SDK les décode à nouveau — aller-retour d'encodage-décodage inutile. De plus, `capabilities()` et `initialize` ont des formes de réponse différentes nécessitant une couche de mappage de format.

### 5.2 Interface formelle complète (4 PR, ~2750 lignes)

Taxonomie d'erreurs → Interface → AcpHttp → AcpWs en PR séparées.

**Rejeté** : sur-ingénierie. La taxonomie d'erreurs est inutile (les transports ACP peuvent mapper sur des codes de statut HTTP équivalents). Des PR séparées augmentent le coût de changement de contexte pour une seule abstraction cohérente.

### 5.3 Double fournisseur avec BridgeContext

`AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext` en parallèle.

**Rejeté** : provoque une désynchronisation du store, nécessite ~8 fichiers, ne peut pas fonctionner sans modifications du SDK.

---

## 6. Plan d'implémentation (PR unique)

Toutes les modifications atterrissent dans une seule PR. Estimation ~1300 lignes au total.

| Fichier                                                                        | Modification                                                                          | Lignes |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`                        | Interface + types + `DaemonTransportClosedError` + fabrique `negotiate()`             | ~110   |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`                       | Enveloppe `globalThis.fetch` + logique SSE extraite de DaemonClient                   | ~80    |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`                         | Multiplexeur WS + mapping URL→JSON-RPC + corrélation de requêtes                      | ~400   |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`                       | POST /acp + gestion SSE connexion/session                                             | ~300   |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`                   | Mapping notification JSON-RPC → DaemonEvent                                           | ~150   |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`                 | Wrapper optionnel : reconnexion + repli                                                | ~150   |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`                           | Constructeur + 6 sites `_fetch` + réécriture de `subscribeEvents`                     | ~40 net|
| `packages/sdk-typescript/src/daemon/index.ts`                                  | Export des nouveaux types                                                             | ~10    |
| `packages/cli/src/serve/server.ts`                                             | Ajout du champ `transports` dans `GET /capabilities`                                  | ~5     |
| `packages/sdk-typescript/src/daemon/types.ts`                                  | Ajout de `transports` au type `DaemonCapabilities`                                    | ~3     |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx`              | Ajout de la prop optionnelle `transport`, transmise à `DaemonClient`                  | ~5     |
| Tests                                                                          | Tests unitaires + d'intégration des transports                                        | ~200   |

**Rétrocompatibilité** : `new DaemonClient({ baseUrl, token })` sans `transport` = comportement REST+SSE identique. Tous les tests existants passent sans modification.

---

## 7. Vérification

1. **Rétrocompatibilité** : `npm run test` sur sdk-typescript et webui — aucun changement de test nécessaire. `new DaemonClient({ baseUrl, token })` = comportement identique.
2. **Extraction de RestSseTransport** : comportement SSE bit à bit équivalent confirmé par la suite de tests existante.
3. **AcpWsTransport** : test d'intégration se connectant au daemon réel via WS. Vérifier :
   - `subscribeEvents` produit les mêmes formes `DaemonEvent` que le SSE REST
   - le branchement prompt 202/200 fonctionne avec une Response synthétisée
   - le vote de permission effectue un aller-retour correct
   - `connected` passe à `false` en cas de perte de WS
   - le signal d'annulation sur un prompt envoie un RPC session/cancel via WS
4. **AcpHttpTransport** : même vérification que WS mais via HTTP+SSE.
5. **Détection automatique** : `negotiate()` retourne le meilleur transport ; repli sur REST en cas d'échec WS.
6. **Repli à l'exécution** : `AutoReconnectTransport` intercepte `DaemonTransportClosedError`, reconstruit le transport, le consommateur appelle `session/load` pour se resynchroniser.
7. **Fournisseur** : `DaemonWorkspaceProvider` avec la prop `transport` — ChatView et TerminalView lisent tous deux depuis un store unique.
8. **Bout en bout** : un tiers passe `transport={new AcpWsTransport(url, token)}` à `DaemonWorkspaceProvider`. Tous les hooks SDK et le store de transcriptions fonctionnent inchangés.

---

## 8. Risques

| Risque                                                                         | Atténuation                                                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance de la table de mapping URL→JSON-RPC                               | Table co-localisée avec le transport ; les modifications de routes du daemon nécessitent une mise à jour du transport                                  |
| Fidélité de la réponse synthétisée ACP WS                                     | Fournir un helper `syntheticResponse(status, json)` ; documenter le contrat (`.json()`, `.text()`, `.status`, `.body?.cancel()`)                      |
| Monotonie de `DaemonEvent.id` pour WS                                         | Les notifications JSON-RPC du serveur ACP portent l'ID de l'événement ; le transport le remonte directement                                           |
| Prompt 202 vs 200 pour WS                                                     | Le transport mappe la réponse JSON-RPC → 200 avec le corps du résultat (chemin bloquant) ; les événements continuent via `subscribeEvents`            |
| Détection de perte de connexion WS                                             | `connected: boolean` + `DaemonTransportClosedError` levé depuis `fetch`                                                                               |
