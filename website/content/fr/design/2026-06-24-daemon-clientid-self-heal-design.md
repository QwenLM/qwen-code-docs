# Conception : auto-réparation du `clientId` en cas d'`invalid_client_id` (`DaemonSessionClient`)

- **Date :** 2026-06-24
- **Composant :** `packages/sdk-typescript` — `DaemonSessionClient`
- **Dépend de :** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **fusionnée** (`84745d0f0`)
- **Statut :** Implémenté (construit sur la base fusionnée de la PR #5784)

## Problème

Après un redémarrage du daemon (ou un rechargement de session), l'enregistrement en mémoire des clients du daemon est effacé. Un frontend qui détient encore un ancien `clientId` attribué par le serveur enverra `POST /session/:id/prompt` avec cet id obsolète. La méthode `resolveTrustedClientId` du bridge ne le reconnaît pas et rejette le prompt avec `InvalidClientIdError`.

Incident de production observé (trace `a76a31fe…`, log du daemon 15:24) : le prompt a été envoyé par `client_d019b847` alors que la session avait été (re)chargée sous un id différent `client_ac36fac9`, de sorte que le client envoyant le prompt n'a jamais été enregistré. L'UI est restée bloquée sur "处理中" indéfiniment car l'échec n'a jamais été remonté sous forme d'événement de tour terminal.

La PR #5784 corrige la partie _remontée_ : `invalid_client_id` est maintenant levé au **moment de l'admission** afin que `POST /session/:id/prompt` retourne un `400 invalid_client_id` synchrone (sans `promptId`) au lieu d'un `202` suivi d'un échec asynchrone silencieux. Cette conception ajoute la partie _auto-réparation_ : lorsque le SDK reçoit ce `400`, il s'enregistre à nouveau pour obtenir un nouveau `clientId` et réessaie le prompt une fois, afin que le tour se poursuive sans que l'utilisateur n'ait à le renvoyer manuellement.

## Périmètre

Dans le périmètre (SDK uniquement, `DaemonSessionClient`) :

- Détecter `invalid_client_id` lors de l'appel d'admission du prompt.
- Réenregistrer le client auprès de la session (déjà restaurée) pour obtenir un nouveau `clientId` attribué par le serveur.
- Réessayer le prompt **une seule fois** avec le nouveau `clientId`.

Explicitement hors périmètre (YAGNI) :

- Reconnexion du flux SSE — reste la responsabilité existante de la couche applicative (l'application dataworks possède déjà la logique `reloadSession`/reconnexion). `invalid_client_id` n'apparaît que lors de l'appel d'admission, jamais lors de l'attente SSE.
- Auto-réparation pour les autres méthodes utilisant un `clientId` (`btw`, `shell`, message en cours de tour, `cancel`, `heartbeat`). Seule `prompt()` s'auto-répare.
- Persistance du `clientId` entre les redémarrages du daemon.

## Invariants clés (vérifiés par rapport au code source)

1. **La retry est sûre car `invalid_client_id` est un rejet au moment de l'admission.**
   `resolveTrustedClientId` s'exécute dans `bridge.sendPrompt` _avant_ que le tour ne soit
   enregistré et avant que la route n'émette un `202`. Avec la PR #5784, cela lève une exception
   de manière synchrone → `400` avant l'acceptation → le prompt **n'a jamais été exécuté**.
   Réessayer ne peut donc pas exécuter le message de l'utilisateur en double. Cet invariant est
   le fondement même de la sûreté de la retry ; il dépend de la PR #5784.

2. **`registerClient` ne lève jamais d'exception et retourne toujours un id valide.** Pour un
   `requestedClientId` inconnu, il passe à `createClientId()` et retourne un nouveau
   `client_<uuid>`. Seul `resolveTrustedClientId` (utilisé par prompt/cancel/…) lève une exception.
   Ainsi, un appel `load`/`resume` retourne toujours un `clientId` utilisable.

3. **La réponse de restauration contient toujours le `clientId` enregistré.** Le chemin rapide
   d'entrée existante et le chemin de restauration à froid définissent tous deux
   `clientId: registerClient(entry, req.clientId)` dans la réponse. (La note "renvoyé uniquement
   lorsque l'appelant a fourni un clientId" dans `types.ts` s'applique à `HeartbeatResult`,
   pas à la restauration.)

4. **Pas de fuite nette d'attach dans le scénario de redémarrage, et la correction de `close()`
   s'améliore.** `resumeSession` fait `attachCount++`. La décrémentation par refcount est
   `/detach` → `detachClient` (`attachCount--` + `unregisterClient`). `close()` →
   `DELETE /session/:id` → `closeSessionImpl` est **destroy-all** : il valide le
   `clientId` via `resolveTrustedClientId` puis détruit la session
   (`byId.delete`), supprimant `attachCount` avec. Un redémarrage du daemon efface l'attach
   d'avant le redémarrage ; `reattach()` rétablit exactement un attach, et un `close()`/redémarrage
   ultérieur détruit le tout — pas de fuite nette. Notez que `closeSessionImpl` valide également
   le `clientId`, donc avant ce changement, un `close()` post-redémarrage avec un id obsolète
   lèverait lui-même `InvalidClientIdError` ; après un `reattach()` déclenché par un prompt,
   `this.clientId` est valide donc `close()` réussit. (`close()` n'est pas auto-réparé en soi —
   hors périmètre — mais en bénéficie indirectement.)

5. **Le changement est inactif sans la PR #5784.** Un daemon pré-#5784 retourne
   `202` puis échec asynchrone, jamais `400 invalid_client_id`, donc le prédicat ne
   correspond jamais et l'auto-réparation ne se déclenche jamais. Opération nulle inoffensive.

## Conception

Toutes les modifications sont confinées à
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

Nécessite d'importer `DaemonHttpError` depuis `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — single-flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Coalesce concurrent prompts that all observed invalid_client_id so we
  // re-register exactly once (avoids orphaning extra clientIds / attachCount).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Pass no clientId so the bridge issues a fresh registration instead of
    // validating the stale one. Pass workspaceCwd explicitly: restoreSession
    // calls resolveWorkspaceKey(req.workspaceCwd) before the existing-entry
    // fast path, and that helper throws on a non-absolute/undefined path.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // only refresh clientId; leave the SSE
                                      // cursor (lastSeenEventId) and state alone
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` est une copie superficielle et `DaemonSession.clientId` n'est pas `readonly`,
donc la mutation sur place est valide. `resume` (et non `load`) est utilisé car nous avons
seulement besoin d'un réenregistrement, pas d'une rejoue de l'historique.

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non-invalid_client_id: propagate
    await this.reattach();                  // may throw → propagate
    return await fn();                      // retry exactly once; if it throws
                                            // again (incl. invalid_client_id),
                                            // propagate — no loop
  }
}
```

### 4. Intégration dans `prompt()`

Envelopper uniquement l'appel réseau d'admission sur les deux chemins ; garder
`reservePromptSlot`/`releaseAdmission` en dehors de l'enveloppe afin que le slot local soit
réservé une seule fois et réutilisé lors de la retry :

- Chemin bloquant (`!this.subscriptionActive`) :
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Chemin non bloquant :
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` est lu **à l'intérieur** de la closure afin que la retry récupère l'id
rafraîchi. Tout ce qui suit l'admission (l'enregistrement de `_pendingPrompts` et
la correspondance des événements de tour SSE par `promptId`) reste inchangé ; l'abonnement SSE
est indexé par `sessionId`, il survit donc au changement de `clientId`.

## Gestion des erreurs

- Les erreurs autres que `invalid_client_id` (ex. `500`, `SessionNotFoundError`,
  `DaemonPendingPromptLimitError`) : propagées immédiatement, pas de `reattach`.
- Échec de `reattach()` (session vraiment disparue, réseau) : propagé — l'utilisateur voit
  une vraie erreur au lieu d'un blocage.
- Retry épuisée (la retry retourne aussi `invalid_client_id`) : propagée ; limitée à une seule
  retry, pas de boucle.
- `AbortSignal` : l'appel enveloppé à `prompt`/`promptNonBlocking` appelle `throwIfAborted()`
  à l'entrée, donc une retry après annulation lève `AbortError`. (`resumeSession` n'a pas
  de paramètre signal ; un `reattach` en cours n'est pas annulable — acceptable, c'est un
  appel court et unique.)

## Limites connues

- **Cas limite rare d'éviction individuelle :** si un `clientId` est évincé alors que la session
  reste en mémoire (révocation de fuite / `client_evicted`), `reattach()` ajoute un
  attach supplémentaire (`attachCount++`) sans `/detach` correspondant. Comme `close()` est
  destroy-all, la seule fenêtre de fuite est une session abandonnée sans `close()` explicite
  et qui est empêchée d'être GC pour inactivité par le `attachCount` bloqué
  (limité à une session). L'incident réaliste est le cas de redémarrage du daemon,
  qui est propre. Documenté plutôt que contourné par ingénierie.

## Tests (TDD)

Utiliser le harnais `recordingFetch` existant dans
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, en interceptant par
URL via un vrai `DaemonClient` (exerce le vrai mappage `failOnError` →
`DaemonHttpError`).

1. **Auto-réparation non bloquante :** premier `POST /session/s-1/prompt` → `400
{code:'invalid_client_id'}` ; `POST /session/s-1/resume` → nouveau
   `clientId: 'client-2'` ; deuxième prompt → `202`. Assertion : le prompt résout, la
   deuxième requête de prompt porte `x-qwen-client-id: client-2`, resume appelé une fois.
2. **Auto-réparation bloquante** (`subscriptionActive` faux) : idem, via le chemin bloquant
   de `prompt` (`200`/`202` + tour terminé lors de la retry).
3. **Retry limitée :** prompt → `400 invalid_client_id` deux fois → l'erreur
   est propagée (assertion : resume appelé une fois, l'erreur est `DaemonHttpError`
   invalid_client_id).
4. **Erreur non-invalide non réessayée :** prompt → `500` → propagé immédiatement,
   `resume` **jamais** appelé.
5. **Propagation de l'échec de reattach :** prompt → `400 invalid_client_id` ; resume →
   `404`/`500` → cette erreur est propagée.
6. **Single-flight :** deux appels `prompt()` simultanés obtiennent tous deux
   `400 invalid_client_id` → `resume` appelé exactement une fois ; les deux retries utilisent le
   nouvel id.