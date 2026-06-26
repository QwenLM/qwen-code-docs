# Design : auto-guérison du `clientId` sur `invalid_client_id` (DaemonSessionClient)

- **Date :** 2026-06-24
- **Composant :** `packages/sdk-typescript` — `DaemonSessionClient`
- **Dépend de :** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **fusionnée** (`84745d0f0`)
- **Statut :** Implémenté (construit sur la base de #5784 fusionnée)

## Problème

Après un redémarrage du daemon (ou un rechargement de session), l'enregistrement
client en mémoire du daemon est effacé. Un frontend qui détient encore un ancien
`clientId` assigné par le serveur envoie `POST /session/:id/prompt` avec cet
identifiant obsolète. La fonction `resolveTrustedClientId` du bridge ne le
reconnaît pas et rejette la requête avec une `InvalidClientIdError`.

Incident de production observé (trace `a76a31fe…`, log daemon 15:24) : la requête
a été envoyée par `client_d019b847` alors que la session avait été (re)chargée
sous un identifiant différent `client_ac36fac9`, donc le client émetteur n'a
jamais été enregistré. L'interface utilisateur est restée indéfiniment sur
« 处理中 » car l'échec n'a jamais été remonté comme un événement de tour terminal.

La PR #5784 corrige la partie _remontée_ : `invalid_client_id` est désormais
levé **au moment de l'admission**, donc `POST /session/:id/prompt` renvoie
synchroniquement `400 invalid_client_id` (sans `promptId`) au lieu de
`202`-puis-échec-asynchrone-silencieux. Ce design ajoute la partie
_auto-guérison_ : quand le SDK reçoit ce `400`, il se réenregistre pour obtenir
un nouveau `clientId` et réessaie la requête une fois, afin que le tour se
déroule sans que l'utilisateur n'ait à renvoyer manuellement.

## Périmètre

Dans le périmètre (SDK uniquement, `DaemonSessionClient`) :

- Détecter `invalid_client_id` sur l'appel d'admission de la requête.
- Réenregistrer le client auprès de la session (déjà restaurée) pour obtenir un
  nouveau `clientId` assigné par le serveur.
- Réessayer la requête **une fois** avec le nouveau `clientId`.

Explicitement hors périmètre (YAGNI) :

- Reconnexion du flux SSE — reste la responsabilité existante de la couche
  applicative (l'application dataworks gère déjà la logique
  `reloadSession`/reconnexion). `invalid_client_id` n'apparaît que sur l'appel
  d'admission, jamais sur l'attente SSE.
- Auto-guérison pour les autres méthodes utilisant `clientId` (`btw`, `shell`,
  message en cours de tour, `cancel`, `heartbeat`). Seule `prompt()` s'auto-guérit.
- Persistance de `clientId` entre les redémarrages du daemon.

## Invariants clés (vérifiés par rapport au code source)

1. **La réessaye est sûre car `invalid_client_id` est un rejet au moment de l'admission.**
   `resolveTrustedClientId` s'exécute dans `bridge.sendPrompt` _avant_
   l'enregistrement du tour et avant que la route n'émette `202`. Avec la PR
   #5784, ceci lève une exception de manière synchrone → `400` avant
   l'acceptation → la requête **n'a jamais été exécutée**. Réessayer ne peut donc
   pas exécuter deux fois le message de l'utilisateur. Cet invariant est la base
   entière de la sécurité de la réessaye ; il dépend de #5784.

2. **`registerClient` ne lève jamais et produit toujours un identifiant valide.**
   Pour un `requestedClientId` inconnu, il tombe dans `createClientId()` et
   renvoie un nouveau `client_<uuid>`. Seule `resolveTrustedClientId` (utilisée
   par prompt/cancel/…) lève. Donc un appel `load`/`resume` renvoie toujours un
   `clientId` utilisable.

3. **La réponse de restauration contient toujours le `clientId` enregistré.** Les
   deux chemins (entrée existante rapide et restauration à froid) définissent
   `clientId: registerClient(entry, req.clientId)` dans la réponse. (La remarque
   « renvoyé uniquement lorsque l'appelant a fourni un clientId » dans `types.ts`
   s'applique à `HeartbeatResult`, pas à la restauration.)

4. **Pas de fuite d'attachement net dans le scénario de redémarrage, et la
   correction de `close()` s'améliore.** `resumeSession` fait `attachCount++`.
   Le décrément par compteur de références est `/detach` → `detachClient`
   (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` →
   `closeSessionImpl` est **détruire-tout** : il valide le clientId via
   `resolveTrustedClientId` puis déchire la session (`byId.delete`), en ignorant
   `attachCount`. Un redémarrage du daemon efface l'attachement d'avant
   redémarrage ; `reattach()` rétablit exactement un attachement, et un
   `close()`/redémarrage ultérieur détruit tout — pas de fuite nette. Notons que
   `closeSessionImpl` valide aussi le clientId, donc avant ce changement, un
   `close()` post-redémarrage avec un identifiant obsolète levait lui-même une
   `InvalidClientIdError` ; après un `reattach()` déclenché par une requête,
   `this.clientId` est valide et `close()` réussit. (`close()` n'est pas
   auto-guéri lui-même — hors périmètre — mais bénéficie indirectement.)

5. **Le changement est inactif sans la PR #5784.** Un daemon pré-#5784 renvoie
   `202`-puis-échec-asynchrone, jamais `400 invalid_client_id`, donc la condition
   ne correspond jamais et l'auto-guérison ne se déclenche pas. Opération neutre.

## Conception

Toutes les modifications sont confinées dans
`packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`.

### 1. `isInvalidClientId(err): boolean`

```ts
function isInvalidClientId(err: unknown): boolean {
  return (
    err instanceof DaemonHttpError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { code?: unknown }).code === 'invalid_client_id'
  );
}
```

Nécessite l'import de `DaemonHttpError` depuis `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — vol unique

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Fusionne les requêtes concurrentes qui ont toutes observé invalid_client_id
  // afin de se réenregistrer exactement une fois (évite de créer des clientIds /
  // attachCount orphelins supplémentaires).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Ne passe pas de clientId pour que le bridge émette une nouvelle
    // inscription au lieu de valider l'ancien. Passe explicitement
    // workspaceCwd : restoreSession appelle
    // resolveWorkspaceKey(req.workspaceCwd) avant le chemin rapide de l'entrée
    // existante, et cette fonction auxiliaire lève sur un chemin non
    // absolu/indéfini.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // rafraîchit uniquement clientId ; laisse
                                      // le curseur SSE (lastSeenEventId) et
                                      // l'état de côté
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` est une copie superficielle et `DaemonSession.clientId` n'est pas
`readonly`, donc la mutation sur place est valide. `resume` (et non `load`) est
utilisé car nous avons seulement besoin de la réinscription, pas du rejeu de
l'historique.

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non invalid_client_id : propager
    await this.reattach();                  // peut lever → propager
    return await fn();                      // réessayer exactement une fois ; si
                                            // cela lève à nouveau (y compris
                                            // invalid_client_id), propager —
                                            // pas de boucle
  }
}
```

### 4. Intégration dans `prompt()`

Encapsuler seulement l'appel réseau d'admission sur les deux chemins ; garder
`reservePromptSlot`/`releaseAdmission` en dehors du wrapper pour que le créneau
local soit réservé une fois et réutilisé lors de la réessaye :

- Chemin bloquant (`!this.subscriptionActive`) :
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Chemin non bloquant :
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` est lu **à l'intérieur** de la fermeture pour que la réessaye
utilise l'identifiant rafraîchi. Tout ce qui suit l'admission (enregistrement
`_pendingPrompts` et correspondance des événements de tour SSE par `promptId`)
reste inchangé ; l'abonnement SSE est indexé par `sessionId`, donc il survit
au changement de `clientId`.

## Gestion des erreurs

- Erreurs non `invalid_client_id` (par ex. `500`, `SessionNotFoundError`,
  `DaemonPendingPromptLimitError`) : propagées immédiatement, pas de `reattach`.
- Échec de `reattach()` (session vraiment partie, réseau) : propagé —
  l'utilisateur voit une vraie erreur au lieu d'un blocage.
- Réessaye épuisée (la réessaye est aussi `invalid_client_id`) : propagée ;
  limitée à une réessaye, pas de boucle.
- `AbortSignal` : l'appel encapsulé `prompt`/`promptNonBlocking` exécute
  `throwIfAborted()` à l'entrée, donc une réessaye après annulation lève
  `AbortError`. (`resumeSession` n'a pas de paramètre de signal ; un `reattach`
  en cours n'est pas annulable — acceptable, c'est un seul appel court.)

## Limitations connues

- **Cas limite rare d'expulsion individuelle :** si un `clientId` est expulsé
  alors que la session reste en mémoire (révocation de fuite / `client_evicted`),
  `reattach()` ajoute un attachement supplémentaire (`attachCount++`) sans
  `/detach` correspondant. Comme `close()` est détruire-tout, la seule fenêtre de
  fuite est une session abandonnée sans `close()` explicite et qui est empêchée
  d'être collectée par le GC d'inactivité à cause du `attachCount` bloqué
  (limité à une session). L'incident réaliste est le cas du redémarrage du
  daemon, qui est propre. Documenté plutôt que corrigé.

## Tests (TDD)

Utiliser le harnais `recordingFetch` existant dans
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, en interceptant
par URL via un vrai `DaemonClient` (qui exécute le vrai mapping `failOnError` →
`DaemonHttpError`).

1. **Auto-guérison non bloquante :** premier `POST /session/s-1/prompt` → `400
{code:'invalid_client_id'}` ; `POST /session/s-1/resume` → nouveau
   `clientId: 'client-2'` ; deuxième requête → `202`. Affirmer : la requête est
   résolue, la deuxième requête contient `x-qwen-client-id: client-2`, resume
   appelé une fois.
2. **Auto-guérison bloquante** (`subscriptionActive` false) : identique, via le
   chemin `prompt` bloquant (`200`/`202`+tour-complet lors de la réessaye).
3. **Réessaye limitée :** requête → `400 invalid_client_id` deux fois → l'erreur
   se propage (affirmer resume appelé une fois, l'erreur est `DaemonHttpError`
   invalid_client_id).
4. **Erreur non invalid non réessayée :** requête → `500` → se propage
   immédiatement, `resume` **jamais** appelé.
5. **L'échec de reattach se propage :** requête → `400 invalid_client_id` ; resume →
   `404`/`500` → cette erreur se propage.
6. **Vol unique :** deux appels `prompt()` concurrents reçoivent tous les deux
   `400 invalid_client_id` → `resume` appelé exactement une fois ; les deux
   réessaies utilisent le nouvel identifiant.