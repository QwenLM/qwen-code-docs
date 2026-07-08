# Conception : délai d'inactivité du streaming pour le pipeline compatible OpenAI

- **Date :** 2026-06-24
- **Composant :** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Statut :** Conception approuvée (audité 7 fois), prêt pour le TDD
- **Portée :** mesures n°1 et n°2 uniquement (watchdog + abort + ETIMEDOUT synthétique). Hors portée : événement SSE terminal vers l'UI (n°9), chemin non-streaming.

## Problème

Un incident DataAgent (« tourne sans rien renvoyer ») dont la cause racine remonte à la passerelle du modèle (Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) qui accepte une requête (HTTP 200) mais n'émet ensuite aucun flux — le corps SSE est resté ouvert et silencieux pendant ~595s sans aucun `finish_reason`.

qwen-code n'avait aucun mécanisme de récupération efficace :

- Le `timeout` du client OpenAI (`DEFAULT_TIMEOUT = 120_000`) est de **niveau requête** (connexion + obtention de l'objet response). Une fois que `chat.completions.create({stream:true})` renvoie le flux après un 200 rapide, l'inactivité entre les chunks pendant le `for await` n'est **pas limitée**.
- Le seul timer d'inactivité (`STREAM_IDLE_TIMEOUT_MS = 5min` dans `loggingContentGenerator.ts`) est **uniquement pour la télémétrie** — il ferme le span OTel pour éviter les fuites, mais il **n'annule pas** la requête et **ne lève pas** d'erreur.

Ainsi, un flux 200-puis-silencieux reste bloqué jusqu'à ce que la connexion meure ou que le TTL d'interaction de 30 minutes expire, et la boucle de retry de contenu (`NO_FINISH_REASON`) ne s'enclenche jamais car le flux ne se termine jamais.

## Constat clé

La couche de transport _aurait dû_ produire un `ETIMEDOUT` sur un socket inactif, mais ne l'a pas fait (le socket est resté ouvert sans données). Le correctif consiste à **ajouter le délai d'inactivité qui manque au transport, et à synthétiser le `ETIMEDOUT` qu'il n'a pas réussi à émettre** — rendant ainsi un blocage silencieux indiscernable d'un vrai timeout de lecture, que la pile de retry/backoff/fallback existante gère déjà.

## Mécanismes vérifiés (audit)

1. `pipeline.executeStream` crée `perRequestAc = createChildAbortController(parentSignal)` et passe `perRequestAc.signal` au SDK. C'est le contrôleur qui annule réellement le fetch. Le wrapper de logging un niveau au-dessus n'a que le signal en lecture seule — le watchdog doit donc se trouver dans le **pipeline**.
2. `classifyRetryError` vérifie `isRetryAbortError` (isAbortError || name==='CanceledError') **en premier** → tout abort = `{kind:'abort', diagnosis:'fail-fast'}` = **non retryable**. Le watchdog ne doit donc **PAS** remonter un AbortError brut.
3. `getTransportCode(err)` lit `err.code` / `err.cause.code` ; un simple `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. Le stream-transport-retry de geminiChat se déclenche lorsque `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Ainsi, un timeout sur le premier byte / zéro chunk (exactement le cas de l'incident) déclenche un auto-retry ; un blocage **après** des chunks apparaît comme une erreur de transport (pas de retry — acceptable).

## Décisions (verrouillées)

| Décision | Choix |
| -------------------------- | ---------------------------------------------------------------- |
| Valeur et config du timeout | Nouveau `contentGenerator.streamIdleTimeoutMs`, par défaut **120000ms** |
| En cas de timeout | **Abort + ETIMEDOUT synthétique** (réutilise le transport-retry) |
| Portée de la PR | **n°1 et n°2 uniquement** (l'événement SSE terminal fait l'objet d'une PR séparée) |
| Timer d'inactivité de télémétrie de 5 min | **Conservé comme filet de sécurité** (non modifié) |

## Conception

Toutes les modifications se trouvent dans `packages/core/src/core/openaiContentGenerator/`.

### 1. Config

Ajouter `streamIdleTimeoutMs?: number` à `ContentGeneratorConfig` (`contentGenerator.ts`). Le pipeline le résout comme `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS` (`120_000`). Une valeur `<= 0` désactive le watchdog (passthrough).

### 2. Générateur de délai d'inactivité (`pipeline.ts`)

Un générateur asynchrone privé enveloppe le flux de chunks brut du SDK avant `processStreamWithLogging` :

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborts perRequestAc → frees the socket
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
          // User cancel takes precedence over our timeout relabel.
          // Use a plain Error (NOT DOMException): error redaction clones via
          // Object.create(getPrototypeOf(err)), which corrupts a DOMException
          // (its `name` is an internal-slot getter the clone lacks). `name ===
          // 'AbortError'` satisfies isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // abort perRequestAc → fetch tears down
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
        // After we abort, the orphaned nextPromise rejects with AbortError;
        // swallow it so it is not an unhandled rejection.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // a chunk arrived → next loop starts a fresh timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // The abort above is the cleanup that matters; ignore return failures.
    }
  }
}
```

Le timer est **réinitialisé à chaque chunk brut** (y compris les deltas de thinking/reasoning), ainsi un modèle qui réfléchit longtemps et stream du raisonnement n'est jamais annulé à tort ; seul un vrai silence (aucun chunk pendant `idleMs`) le déclenche.

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

Après que l'étape 1 a créé `stream`, on l'enveloppe avant l'étape 2. Les requêtes de streaming utilisent toujours un contrôleur par requête afin que le watchdog puisse annuler la requête SDK même si l'appelant n'a pas fourni de signal parent :

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
// ...processStreamWithLogging(guarded, context, request) as today,
// keeping the existing drainThenCleanup wrapper.
```

## Comportement après la modification

- 200-puis-silencieux (zéro chunk) → après `idleMs` : abort fetch + throw ETIMEDOUT → `{transport, retryable}` → transport-retry (×2, `!streamYieldedChunk`) → auto-récupération ; en cas d'épuisement, apparaît comme une erreur de transport.
- Blocage après quelques chunks → ETIMEDOUT levé ; `streamYieldedChunk` est vrai, donc pas de transport-retry — apparaît comme une erreur (pas de replay risqué en cours de génération).
- Flux actif (y compris thinking) → le timer est réinitialisé à chaque chunk ; ne se déclenche jamais.
- Abort parent/utilisateur → AbortError propagé tel quel (annulation utilisateur fail-fast).
- Le timer d'inactivité de télémétrie de 5 min devient un filet de sécurité que le watchdog de ~120s devance ; laissé intact.

## Hors portée

- SSE `turn_error` terminal en cas d'épuisement des retries (n°9) — PR séparée.
- `execute()` non-streaming — déjà limité par le timeout de niveau requête de 120s.

## Tests (TDD)

Dans `pipeline.test.ts`, avec `vi.useFakeTimers()` et un flux mock contrôlable (qui yield N chunks puis `next()` renvoie une promesse qui ne se résout jamais) :

1. **Blocage zéro chunk** → la consommation du flux rejette avec une erreur dont `code === 'ETIMEDOUT'` après avoir avancé de `idleMs`.
2. **Blocage après des chunks** → les chunks yieldés passent, puis rejette avec `code === 'ETIMEDOUT'`.
3. **Le flux actif réinitialise le timer** → les chunks arrivant dans les délais `idleMs` ne déclenchent jamais le watchdog ; le flux se termine normalement.
4. **Priorité de l'abort parent** → avec le signal parent annulé au moment du timeout, l'erreur est un AbortError, pas un ETIMEDOUT.
5. **Désactivé quand `streamIdleTimeoutMs <= 0`** → un flux bloqué ne lève pas d'erreur à l'avancement du timer (passthrough).
6. **`streamIdleTimeoutMs` personnalisé** → la valeur configurée est respectée (se déclenche aux ms configurés, pas par défaut).
7. **Rejet SDK `next()` orphelin** → après que le watchdog a annulé la requête, un rejet SDK AbortError ultérieur provenant du `next()` en attente est ignoré et n'émet pas d'`unhandledRejection`.