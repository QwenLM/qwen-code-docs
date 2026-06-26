# Couche d'abstraction DaemonTransport

> Branche cible : `main`. Auteur : arnoo.gao. Date : 2026-06-12. Statut : **Design v4 — révision**.
> Workflow « design-first » par dépôt : ce document précède la PR d'implémentation.

---

## 0. Résumé

`DaemonClient` intègre en dur REST+SSE. Les intégrations tierces qui souhaitent utiliser ACP WebSocket doivent forker la stack du fournisseur (~8 fichiers). Cette proposition ajoute une **interface `DaemonTransport`** avec les méthodes `fetch` + `subscribeEvents`, ainsi qu'une auto-détection et un fallback à l'exécution, permettant des transports enfichables avec **zéro changement cassant**.

**Modification totale : ~1300 lignes** dans une seule PR d'implémentation. Les consommateurs existants ne sont pas impactés — `new DaemonClient({ baseUrl, token })` = comportement actuel.

---

## 1. Contexte

### 1.1 Architecture actuelle

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← codé en dur
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 méthodes publiques, chacune construisant des URLs REST et effectuant des branches sur les codes d'état HTTP. `fetch` est déjà injectable via `DaemonClientOptions.fetch`, mais `subscribeEvents` contient une logique spécifique SSE (vérification du content-type, parsing SSE, timeout de phase de connexion) qui ne peut pas être remplacée par la seule injection de `fetch`.

### 1.2 Le problème pour les tiers

Lorsqu'un tiers (ex. `agent-web`) construit un `AcpSessionProvider` pour utiliser WebSocket au lieu de REST+SSE :

- **S'il remplace** `DaemonSessionProvider` : les composants qui lisent `DaemonStoreContext` (ex. TerminalView) perdent leur contexte → plantage.
- **S'il conserve les deux fournisseurs** : deux sources d'événements, deux stores, désynchronisation.
- **S'il injecte des événements** dans le store du SDK : `DaemonSessionProvider` s'abonne aussi en interne aux SSE → événements en double.

**Cause racine** : changer le transport nécessite de remplacer le fournisseur, car `subscribeEvents` de `DaemonClient` est codé en dur pour SSE.

### 1.3 Objectif

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → mappe URL+verbe vers JSON-RPC sur WS
  └─ transport.subscribeEvents → démultiplexe les notifications WS → DaemonEvent
```

Un seul fournisseur, un seul store, le transport est un détail interne. Les tiers passent `transport` à `DaemonClient` ; tout le reste fonctionne sans changement.

---

## 2. Conception

### 2.1 Interface

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = pas de timeout. undefined = timeout par défaut du transport.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Envoie une requête et retourne une Response.
   *
   * Contrat :
   * - La Response DOIT supporter .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status DOIT être un code d'état HTTP précis
   *   (200, 201, 202, 204, 404, etc.)
   * - Les corps d'erreur DOIVENT préserver la forme structurée du daemon
   * - Appelable sans configuration préalable ; le transport gère l'initialisation
   *   en interne (pattern lazy-init / init-once différé)
   * - Lève DaemonTransportClosedError lorsque la connexion est morte
   * - Lorsque init.signal est annulé : pour les requêtes de prompt, le transport
   *   DOIT annuler le prompt en cours sur le fil (WS : envoyer session/cancel
   *   RPC ; HTTP : annuler fetch). Pour les requêtes ordinaires, annule/rejette
   *   uniquement la requête en attente sans effet de bord.
   *   La réponse en attente est rejetée avec AbortError.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * S'abonne aux événements de session.
   *
   * Contrat :
   * - Les événements avec id DOIVENT avoir des identifiants entiers monotones ;
   *   les trames synthétiques/terminales (ex. stream_error) PEUVENT omettre id
   *   (DaemonEvent.id est optionnel)
   * - DOIT livrer TOUS les types d'événements (session + workspace) dans un seul flux
   * - Annuler le signal DOIT arrêter uniquement ce générateur, PAS la connexion
   * - Lorsque la connexion meurt, tous les générateurs en attente DOIVENT lever
   *   DaemonTransportClosedError (le transport maintient les références des générateurs)
   * - DOIT appliquer connectTimeoutMs uniquement à la phase de connexion
   * - Le transport DOIT déclarer si la relecture par lastEventId est supportée ;
   *   sinon, le consommateur DOIT utiliser session/load pour une resynchronisation
   *   complète lors de la reconnexion
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Identité du transport pour un branchement exhaustif. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Indique si ce transport supporte la relecture basée sur Last-Event-ID lors de la reconnexion.
   *  Si faux, le consommateur DOIT utiliser session/load pour une resynchronisation complète. */
  readonly supportsReplay: boolean;

  /** Faux après une perte de connexion ou un dispose(). */
  readonly connected: boolean;

  /** Nettoyage idempotent. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Pourquoi deux méthodes (fetch + subscribeEvents), pas seulement fetch

`subscribeEvents` a des sémantiques de fil fondamentalement différentes selon le transport :

| Transport | Mécanisme de fil                                                     |
| --------- | -------------------------------------------------------------------- |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`   |
| ACP HTTP  | `GET /acp` (SSE lié à la session) → dépaquetage de notification JSON-RPC |
| ACP WS    | Démultiplexage des notifications depuis un socket partagé par sessionId |

Forcer ces mécanismes à travers un trou en forme de `fetch` nécessite un réencodage/décodage SSE (WS → faux texte SSE → `parseSseStream` → DaemonEvent) — gourmand et fragile.

Les 66 autres méthodes fonctionnent via `fetch` car elles suivent des sémantiques requête→réponse quel que soit le transport.

### 2.3 Pourquoi au niveau de `fetch`, pas de dispatch par méthode

Les 67 méthodes de `DaemonClient` contiennent des branches HTTP par méthode :

- `prompt()` : vérification du code 202 vs 200
- `deleteWorkspaceAgent()` : 204 vs 404 avec inspection du corps
- `respondToPermission()` : 200 vs 404 pour la détection de race condition
- 6 méthodes contournent `fetchWithTimeout` en appelant `_fetch` directement

Une interface de dispatch par méthode (`request<T>(method, params)`) forcerait la duplication de toute cette logique dans chaque transport. Rester au niveau de `fetch` laisse `DaemonClient` inchangé.

### 2.4 Modifications de DaemonClient (~40 lignes)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Conservé
  fetchTimeoutMs?: number; // Conservé
  transport?: DaemonTransport; // NOUVEAU — remplacement optionnel
}
```

Modifications internes :

- Constructeur : `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout` : délégation à `this.transport.fetch(url, init, { timeout })`
- 6 sites `this._fetch` directs (prompt, promptNonBlocking, recapSession, btwSession, shellCommand, subscribeEvents) : remplacés par `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents` : branchement exhaustif sur `this.transport.type` :
  - `'rest'` : délégation à `this.transport.subscribeEvents(sessionId, opts)`
  - défaut : même délégation (chaque transport gère son propre format de fil)
- Suppression du champ `private _fetch` (remplacé par le transport)

### 2.5 Point d'injection du fournisseur

`DaemonWorkspaceProvider` et `DaemonSessionProvider` construisent toutes deux `DaemonClient` en interne. Pour permettre aux tiers d'injecter un transport sans contourner le fournisseur :

```typescript
// DaemonWorkspaceProvider — ajout de la prop optionnelle transport
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NOUVEAU — transmis à DaemonClient
  // ...props existantes
}

// DaemonSessionProvider — héritage du contexte workspace
// Pas de prop transport ; lecture depuis le contexte workspace
```

Lorsque `transport` est fourni, le fournisseur le passe à `DaemonClient` :

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Lorsqu'il est omis : comportement actuel (REST+SSE). ~5 lignes de modification du fournisseur.

### 2.5 RestSseTransport (~80 lignes)

Encapsule `globalThis.fetch` + extrait la logique SSE actuelle de `DaemonClient.subscribeEvents` :

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE supporte Last-Event-ID
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
    // Logique actuelle de DaemonClient.subscribeEvents déplacée ici :
    // - construction de l'URL à partir de this.baseUrl + sessionId
    // - définition de l'en-tête Authorization à partir de this.token
    // - timeout de phase de connexion depuis opts.connectTimeoutMs
    // - fetch → validation du content-type → parseSseStream → yield
  }

  dispose() {} // sans opération
}
```

### 2.6 Fonctionnement interne des transports ACP

**AcpWsTransport** (~400-600 lignes) :

- Initialisation paresseuse : le premier appel à `fetch` ouvre le WS et envoie `initialize`
- Table de mappage URL→JSON-RPC : `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Multiplexeur de requêtes : `Map<id, {resolve, reject}>` pour les requêtes en attente
- `subscribeEvents` : filtrage du flux de notifications partagé par sessionId
- `connected` : suit le readyState du WS
- `supportsReplay` : faux (WS n'a pas de Last-Event-ID ; le consommateur doit utiliser `session/load`)
- Synthétise des objets `Response` avec les bons `.status`/`.json()`/`.text()`

**AcpHttpTransport** (~800-1000 lignes) :

- Initialisation paresseuse : le premier appel à `fetch` envoie `POST /acp {initialize}`
- Gère en interne les flux SSE liés à la connexion et à la session
- Même table de mappage URL→JSON-RPC + corrélation de requêtes
- `supportsReplay` : vrai (le SSE de session supporte Last-Event-ID)

### 2.7 Auto-détection du transport

Le serveur annonce les transports supportés dans `GET /capabilities` :

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...champs existants des capabilities...
}
```

Le SDK fournit une fabrique statique unique :

```typescript
// Sonder une fois avant le rendu React, ne jamais changer en cours de session
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Retourne le meilleur disponible : acp-ws > acp-http > rest (fallback)
```

Implémentation :

1. `GET /capabilities` → lire le tableau `transports`
2. Si `acp-ws` dans la liste → essayer une mise à niveau WS ; en cas de succès, retourner `AcpWsTransport`
3. Si WS échoue ou n'est pas dans la liste → essayer `acp-http` ; en cas de succès, retourner `AcpHttpTransport`
4. Fallback → `RestSseTransport`

Aucune API existante n'est impactée : `GET /capabilities` ajoute un nouveau champ (additif), les consommateurs existants ignorent les champs inconnus.

### 2.8 Fallback à l'exécution (WS → REST sur déconnexion)

Lorsqu'un transport non-REST se déconnecte en cours de session :

```
AcpWsTransport (connected=true)
  │
  ├── WS tombe (réseau, redémarrage du serveur, timeout d'inactivité)
  │
  ├── connected = false
  ├── Tous les appels fetch() en attente → rejet avec DaemonTransportClosedError
  ├── Tous les générateurs subscribeEvents → lèvent DaemonTransportClosedError
  │
  └── Consommateur (fournisseur / tiers) détecte la déconnexion :
        1. Créer un nouveau RestSseTransport (garanti fonctionnel si le daemon est actif)
        2. Créer un nouveau DaemonClient({ transport: newTransport })
        3. Pour chaque session active : session/load pour se rattacher
        4. Reprendre l'abonnement aux événements
```

**Contrainte clé** : le fallback à l'exécution est **piloté par le consommateur, pas interne au transport**.
Le transport ne change pas de protocole en silence — il échoue bruyamment
(`DaemonTransportClosedError`) et le consommateur décide s'il doit reconstruire.

Justification :

- La destruction du WS supprime toutes les sessions possédées côté serveur (`registry.delete` →
  `conn.destroy`). Un changement silencieux masquerait cette perte de données.
- `session/load` se rattache à la session bridge existante (les transcriptions sont
  conservées), mais le prompt en vol est annulé. Le consommateur doit gérer
  cela explicitement (réessayer ou remonter à l'utilisateur).
- Pas de reprise `Last-Event-ID` entre transports pour l'instant (Phase 4). Les événements entre
  la déconnexion et la reconnexion peuvent être perdus. Le consommateur doit demander une
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
  // 2. Si le transport préféré échoue, fallback vers REST
  // 3. Réinitialiser la connexion
  // L'appelant doit encore faire session/load — ce wrapper ne gère
  // que la reconnexion au niveau transport, pas au niveau session.
}
```

Ce wrapper est optionnel. Les consommateurs existants qui ne veulent pas d'auto-reconnexion
attrapent simplement `DaemonTransportClosedError` et le gèrent eux-mêmes.

**Impact sur les fonctionnalités existantes** : zéro. Tout le code d'auto-détection et de fallback
est additif et optionnel. `new DaemonClient({ baseUrl, token })` sans
`transport` = comportement REST actuel, pas d'auto-détection, pas de logique de fallback.

---

## 3. Audit des changements cassants

### Verdict : zéro changement cassant

| API publique                             | Changement                               | Cassant ? |
| ---------------------------------------- | ---------------------------------------- | :-------: |
| `new DaemonClient({ baseUrl, token })`   | Aucun changement                         |    ❌     |
| `DaemonClientOptions.*`                  | Tous conservés, `transport` ajouté       |    ❌     |
| `DaemonHttpError`                        | Inchangé                                 |    ❌     |
| `DaemonSessionClient`                    | Aucun changement (délègue à DaemonClient)|    ❌     |
| Toutes les exportations de types (100+)  | Inchangées                               |    ❌     |

### Impact par consommateur

| Consommateur                    | Impact                                  |
| ------------------------------- | --------------------------------------- |
| webui (25 fichiers)             | Aucune modification de code             |
| web-shell (4 fichiers)          | Aucune modification de code             |
| vscode-ide-companion (1 fichier)| Aucune modification de code             |
| Tiers                           | Zéro pour REST ; passer `transport` pour ACP |

---

## 4. Décisions de conception

| Décision                                         | Justification                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` sur le transport, pas seulement `fetch` | Le réencodage SSE via fetch est gourmand et fragile                                                                                                                           |
| `connected: boolean` sur le transport            | La boucle de reconnexion du fournisseur doit distinguer « transport mort » de « 500 transitoire »                                                                                              |
| Initialisation paresseuse (pas de `connect()` explicite) | Garde la construction de `DaemonClient` synchrone ; `new RestSseTransport()` par défaut n'a besoin d'aucune initialisation                                                                                     |
| Auto-détection unique, pas en cours de session   | `negotiate()` sonde une fois au démarrage ; le fallback à l'exécution est piloté par le consommateur via `DaemonTransportClosedError`, pas un changement silencieux interne                                          |
| Pas de prérequis de taxonomie d'erreur           | Les transports ACP mappent les erreurs à des codes d'état équivalents HTTP en interne ; `DaemonHttpError` fonctionne tel quel                                                                             |
| Le fournisseur reçoit une prop `transport`       | `DaemonWorkspaceProvider` gagne une prop optionnelle `transport` (~5 lignes), transmise au constructeur de `DaemonClient`. Les tiers définissent cette prop ; l'omettre = comportement REST actuel |

---

## 5. Alternatives considérées

### 5.1 Injection de `fetch` personnalisée (pas de nouvelle interface)

Passer un `fetch` basé sur WS via l'existant `DaemonClientOptions.fetch`.

**Rejetée** : `subscribeEvents` valide `content-type: text/event-stream` et
utilise `parseSseStream`. Un `fetch` personnalisé doit réencoder les trames WS en texte SSE, puis
le SDK les décode à nouveau — un aller-retour encodage-décodage gaspillé. De plus,
`capabilities()` et `initialize` ont des formes de réponse différentes nécessitant une
couche de mappage de format.

### 5.2 Interface formelle complète (4 PRs, ~2750 lignes)

Taxonomie d'erreur → Interface → AcpHttp → AcpWs comme PRs séparées.

**Rejetée** : sur-ingénierie. La taxonomie d'erreur est inutile (les transports ACP peuvent
mapper vers des codes d'état équivalents HTTP). Des PRs séparées augmentent le coût de
changement de contexte pour une abstraction cohérente unique.

### 5.3 Double fournisseur avec BridgeContext

`AcpSessionProvider` parallèle + `ChatBridgeContext` + `SessionBridgeContext`.

**Rejetée** : provoque une désynchronisation des stores, nécessite ~8 fichiers, ne peut pas fonctionner sans modifications du SDK.

---

## 6. Plan d'implémentation (PR unique)

Toutes les modifications atterrissent dans une seule PR. Estimation ~1300 lignes au total.

| Fichier                                                            | Modification                                                                 | Lignes   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | Interface + types + `DaemonTransportClosedError` + fabrique `negotiate()`    | ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | Encapsule `globalThis.fetch` + logique SSE extraite de DaemonClient          | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | Multiplexeur WS + mappage URL→JSON-RPC + corrélation de requêtes             | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + gestion SSE connexion/session                                     | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | Mappage notification JSON-RPC → DaemonEvent                                  | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | Wrapper optionnel : reconnexion + fallback                                   | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | Constructeur + 6 sites `_fetch` + réécriture de subscribeEvents              | ~40 net |
| `packages/sdk-typescript/src/daemon/index.ts`                     | Export des nouveaux types                                                    | ~10     |
| `packages/cli/src/serve/server.ts`                                | Ajout du champ `transports` à `GET /capabilities`                            | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | Ajout de `transports` au type `DaemonCapabilities`                            | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | Ajout de la prop optionnelle `transport`, transmission à `DaemonClient`      | ~5      |
| Tests                                                             | Tests unitaires et d'intégration du transport                                | ~200    |

**Rétrocompatibilité** : `new DaemonClient({ baseUrl, token })` sans
`transport` = comportement REST+SSE identique. Tous les tests existants passent sans changement.

---

## 7. Vérification

1. **Rétrocompatibilité** : `npm run test` dans sdk-typescript et webui — aucun
   changement de test nécessaire. `new DaemonClient({ baseUrl, token })` = comportement identique.
2. **Extraction de RestSseTransport** : comportement SSE bit à bit équivalent confirmé
   par la suite de tests existante.
3. **AcpWsTransport** : test d'intégration se connectant à un daemon réel via WS. Vérifier :
   - `subscribeEvents` produit les mêmes formes de `DaemonEvent` que REST SSE
   - Le branchement prompt 202/200 fonctionne avec une Response synthétisée
   - Le vote de permission fait l'aller-retour correctement
   - `connected` passe à `false` sur une chute de WS
   - Le signal d'annulation sur un prompt → WS envoie la RPC session/cancel
4. **AcpHttpTransport** : même vérification que WS mais sur HTTP+SSE.
5. **Auto-détection** : `negotiate()` retourne le meilleur transport ; fallback vers REST en cas d'échec WS.
6. **Fallback à l'exécution** : `AutoReconnectTransport` attrape `DaemonTransportClosedError`,
   reconstruit le transport, le consommateur appelle `session/load` pour la resynchronisation.
7. **Fournisseur** : `DaemonWorkspaceProvider` avec prop `transport` — ChatView +
   TerminalView lisent tous deux depuis un seul store.
8. **De bout en bout** : Un tiers passe `transport={new AcpWsTransport(url, token)}`
   à `DaemonWorkspaceProvider`. Tous les hooks SDK et le store de transcription fonctionnent sans changement.
---

## 8. Risques

| Risque                                | Atténuation                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Maintenance de la table de mapping URL→JSON-RPC | Table co-localisée avec le transport ; les changements de route du démon nécessitent une mise à jour du transport        |
| Fidélité de la réponse synthétisée de l'ACP WS   | Fournir un helper `syntheticResponse(status, json)` ; documenter le contrat (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Monotonie de `DaemonEvent.id` pour WS | Les notifications JSON-RPC du serveur ACP portent un identifiant d'événement ; le transport le expose directement        |
| Prompt 202 vs 200 pour WS             | Le transport mappe la réponse JSON-RPC → 200 avec le corps du résultat (chemin bloquant) ; les événements continuent de circuler via `subscribeEvents` |
| Détection de déconnexion WS           | `connected: boolean` + `DaemonTransportClosedError` levé depuis `fetch`                                                  |