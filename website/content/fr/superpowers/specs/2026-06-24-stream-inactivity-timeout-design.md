# Conception : Délai d'inactivité de streaming pour le pipeline compatible OpenAI

- **Date :** 2026-06-24
- **Composant :** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Statut :** Conception approuvée (auditée 7 rounds), prête pour TDD
- **Périmètre :** mesures #1 + #2 uniquement (watchdog + abandon + ETIMEDOUT synthétique). Hors périmètre : événement SSE terminal vers l'UI (#9), chemin non-streaming.

## Problème

Un incident DataAgent ("一直运行不返回") a été attribué à la passerelle de modèle
(Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) acceptant
une requête (HTTP 200) mais ne **streamant rien** — le corps SSE est resté ouvert
et silencieux pendant ~595s sans `finish_reason`.

qwen-code n'avait pas de récupération efficace :

- Le `timeout` du client OpenAI (`DEFAULT_TIMEOUT = 120_000`) est **au niveau de la requête**
  (connexion + obtention de l'objet réponse). Une fois
  `chat.completions.create({stream:true})` renvoie le flux après un 200 rapide,
  l'inactivité entre les chunks pendant `for await` est **non bornée**.
- Le seul compteur d'inactivité (`STREAM_IDLE_TIMEOUT_MS = 5min` dans
  `loggingContentGenerator.ts`) est **télémétrique uniquement** — il ferme la span OTel
  pour ne pas fuir, mais il **n'abandonne pas** la requête ni ne lève d'exception.

Ainsi, un flux 200-puis-silence bloque jusqu'à ce que la connexion meure ou que la TTL
d'interaction de 30 minutes expire, et la boucle de réessai de contenu (`NO_FINISH_REASON`)
ne s'enclenche jamais car le flux ne se termine jamais.

## Observation clé

La couche de transport _aurait dû_ produire un `ETIMEDOUT` sur un socket inactif, mais
ne l'a pas fait (le socket est resté ouvert sans données). La correction consiste à
**ajouter le délai d'inactivité que le transport n'a pas, et synthétiser l'`ETIMEDOUT`
qu'il n'a pas émis** — rendant un blocage silencieux indistinguable d'un vrai timeout de
lecture, que la pile existante de réessai/backoff/fallback gère déjà.

## Mécanismes vérifiés (audit)

1. `pipeline.executeStream` crée `perRequestAc = createChildAbortController(parentSignal)`
   et passe `perRequestAc.signal` au SDK. C'est ce contrôleur qui
   annule effectivement le fetch. Le wrapper de logging une couche au-dessus n'a que
   le signal en lecture seule — donc le watchdog doit vivre dans le **pipeline**.
2. `classifyRetryError` vérifie `isRetryAbortError` (isAbortError ||
   name==='CanceledError') **en premier** → tout abandon = `{kind:'abort',
diagnosis:'fail-fast'}` = **non réessayable**. Donc le watchdog NE doit PAS remonter
   une AbortError brute.
3. `getTransportCode(err)` lit `err.code` / `err.cause.code` ; un simple
   `Object.assign(new Error(...), {code:'ETIMEDOUT'})` →
   `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. La réessai de transport de geminiChat se déclenche quand
   `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT}
&& !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Donc un
   timeout **premier-octet / zéro-chunk** (exactement l'incident) se réessaie automatiquement ;
   un blocage **après** des chunks remonte comme une erreur de transport (pas de réessai — acceptable).

## Décisions (verrouillées)

| Décision                              | Choix                                                         |
| ------------------------------------- | ------------------------------------------------------------- |
| Valeur et configuration du timeout    | Nouveau `contentGenerator.streamIdleTimeoutMs`, défaut **120000ms** |
| Sur timeout                           | **Abandon + ETIMEDOUT synthétique** (réutilise le réessai transport) |
| Périmètre de la PR                    | **#1 + #2 uniquement** (événement SSE terminal est une PR séparée) |
| Compteur d'inactivité télémétrique 5min | **Conservé comme filet de sécurité** (inchangé)                |

## Conception

Toutes les modifications dans `packages/core/src/core/openaiContentGenerator/`.

### 1. Configuration

Ajouter `streamIdleTimeoutMs?: number` à `ContentGeneratorConfig`
(`contentGenerator.ts`). Le pipeline le résout comme
`this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`
(`120_000`). Une valeur `<= 0` désactive le watchdog (pass-through).

### 2. Générateur de délai d'inactivité (`pipeline.ts`)

Un générateur asynchrone privé encapsule le **flux brut de chunks du SDK** avant
`processStreamWithLogging` :

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborte perRequestAc → libère le socket
  parentSignal: AbortSignal | undefined,
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const it = source[Symbol.asyncIterator]();
  const streamStartedAt = Date.now();
  let chunksReceived = 0;
  try {
    while (true) {
      const nextPromise = it.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // L'annulation utilisateur prime sur notre relabel du timeout.
          // Utiliser une Error simple (PAS DOMException) : la rédaction d'erreur clone via
          // Object.create(getPrototypeOf(err)), ce qui corrompt une DOMException
          // (son `name` est un getter interne que le clone n'a pas). `name ===
          // 'AbortError'` satisfait isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // aborte perRequestAc → fetch se déchire
            reject(
              new StreamInactivityTimeoutError(
                idleMs,
                chunksReceived,
                Date.now() - streamStartedAt,
              ),
            ); // code: 'ETIMEDOUT'
          }
        }, idleMs);
        timer.unref?.();
      });
      let result: IteratorResult<OpenAI.Chat.ChatCompletionChunk>;
      try {
        result = await Promise.race([nextPromise, timeout]);
      } catch (err) {
        // Après avoir aborté, le nextPromise orphelin rejette avec AbortError ;
        // on l'avale pour éviter une 'unhandledRejection'.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // un chunk est arrivé → la boucle suivante démarre un nouveau timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // L'abandon ci-dessus est le nettoyage important ; ignorer les échecs de return.
    }
  }
}
```

Le timer se **réinitialise sur chaque chunk brut** (y compris les deltas de pensée/raisonnement),
donc un modèle long à penser qui streame du raisonnement n'est jamais aborté à tort ;
seul un vrai silence (aucun chunk pendant `idleMs`) le déclenche.

```ts
class StreamInactivityTimeoutError extends Error {
  readonly code = 'ETIMEDOUT' as const;

  constructor(
    readonly idleMs: number,
    readonly chunksReceived: number,
    readonly streamLifetimeMs: number,
  ) {
    super(`No stream activity for ${idleMs}ms (inactivity timeout)`);
    this.name = 'StreamInactivityTimeoutError';
  }
}
```

### 3. Câblage dans `executeStream`

Après que Stage 1 crée `stream`, l'encapsuler avant Stage 2. Les requêtes de streaming
utilisent toujours un contrôleur par requête afin que le watchdog puisse abandonner la
requête SDK même lorsque l'appelant n'a pas fourni de signal parent :

```ts
const idleMs =
  this.contentGeneratorConfig.streamIdleTimeoutMs ??
  DEFAULT_STREAM_IDLE_TIMEOUT_MS;
const guarded =
  idleMs > 0
    ? withStreamInactivityTimeout(
        stream,
        idleMs,
        () => perRequestAc.abort(),
        parentSignal,
      )
    : stream;
// ...processStreamWithLogging(guarded, context, request) comme aujourd'hui,
// en conservant le wrapper existant drainThenCleanup.
```

## Comportement après le changement

- 200-puis-silence (zéro chunk) → après `idleMs` : abandon du fetch + levée ETIMEDOUT →
  `{transport, retryable}` → réessai transport (×2, `!streamYieldedChunk`) →
  auto-récupération ; à épuisement, remonte comme une erreur de transport.
- Blocage après quelques chunks → ETIMEDOUT levé ; `streamYieldedChunk` est true donc
  il **n'est pas** réessayé par transport — remonte comme une erreur (pas de rejeu risqué
  en milieu de génération).
- Flux actif (y compris pensée) → le timer se réinitialise à chaque chunk ; jamais déclenché.
- Annulation parent/utilisateur → AbortError propagée inchangée (annulation utilisateur rapide).
- Le compteur d'inactivité télémétrique de 5 minutes devient un filet de sécurité que le
  watchdog de ~120s préempte ; inchangé.

## Hors périmètre

- Événement SSE `turn_error` terminal en cas d'épuisement des réessais (#9) — PR séparée.
- `execute()` non-streaming — déjà borné par le timeout au niveau requête de 120s.

## Tests (TDD)

Dans `pipeline.test.ts`, avec `vi.useFakeTimers()` et un flux simulé contrôlable
(produit N chunks puis `next()` retourne une promesse qui ne se résout jamais) :

1. **Blocage zéro-chunk** → la consommation du flux rejette avec une erreur dont
   `code === 'ETIMEDOUT'` après avoir avancé `idleMs`.
2. **Blocage après chunks** → les chunks produits arrivent, puis rejette avec
   `code === 'ETIMEDOUT'`.
3. **Flux actif remet le timer** → les chunks arrivant dans `idleMs` ne déclenchent jamais
   le watchdog ; le flux se termine normalement.
4. **Priorité de l'abandon parent** → avec le signal parent aborté au moment du timeout,
   l'erreur est une AbortError, pas ETIMEDOUT.
5. **Désactivé quand `streamIdleTimeoutMs <= 0`** → un flux bloqué ne lève pas d'erreur
   à l'avancement du timer (pass-through).
6. **`streamIdleTimeoutMs` personnalisé** → la valeur configurée est respectée (déclenché
   à la ms configurée, pas à la valeur par défaut).
7. **Rejet du `next()` SDK orphelin** → après que le watchdog aborte la requête,
   un rejet ultérieur `AbortError` du `next()` en attente est avalé et n'émet pas
   `unhandledRejection`.