# Rappel mémoire asynchrone — Spécification de conception

**Date :** 2026-05-15
**Statut :** Approuvé
**Tickets liés :** #3761, #3759
**PRs liés :** #3814, #3866

---

## Problème

`relevanceSelector.ts` utilise `AbortSignal.timeout(1_000)` (introduit par #3866). Lors des démarrages à froid de première session, qwen3.5-flash prend en moyenne ~908 ms — atteignant régulièrement le seuil de 1 s. Le délai externe de 2,5 s dans `resolveAutoMemoryWithDeadline` signifie que chaque UserQuery peut bloquer jusqu'à 2,5 s même lorsque le rappel échoue toujours.

Cause première : le chemin de requête de l'agent principal `await` attend le résultat du rappel avant de l'envoyer au modèle. Tout ralentissement dans la requête secondaire de rappel s'ajoute directement à la latence visible par l'utilisateur.

---

## Conception

### Idée principale

Déclencher le rappel sur UserQuery sans jamais l'attendre. Consommer le résultat à deux points opportunistes — le premier qui se déclenche :

1. **Point de consommation UserQuery** — vérification synchrone `settledAt !== null` juste avant `turn.run()`. Attente nulle : si déjà réglé, l'utiliser ; sinon, passer.
2. **Point d'injection ToolResult** — même vérification à chaque tour ToolResult. Injecte la mémoire en tant que `system-reminder` **ajouté après** les parties functionResponse dans `requestToSend`, donnant au modèle un contexte mémoire avant sa prochaine réponse. (Ajout, pas d'insertion au début : l'API Qwen exige que functionResponse suive immédiatement le functionCall du modèle — voir le saut de contexte IDE existant `hasPendingToolCall` pour la même contrainte.)

Cela correspond au modèle utilisé par Claude Code en amont (sonde `startRelevantMemoryPrefetch` / `settledAt` dans `query.ts`).

---

## Structures de données

### Nouveau type `MemoryPrefetchHandle` (dans `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Set by promise.finally(). null until the promise settles. */
  settledAt: number | null;
  /** True after memory has been injected — prevents double-inject. */
  consumed: boolean;
  controller: AbortController;
};
```

### Changement de champ sur `GeminiClient`

| Supprimer                                                       | Ajouter                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## Modifications

### 1. `client.ts` — supprimer `resolveAutoMemoryWithDeadline`

Supprimer la fonction entièrement. Elle est remplacée par le mécanisme du drapeau `settledAt`.

### 2. `client.ts` — chemin de déclenchement UserQuery

Remplacer l'appel à `resolveAutoMemoryWithDeadline` par :

```typescript
// Abort any in-flight prefetch from a previous UserQuery before installing
// the new handle (prevents orphan side-queries when the user types again
// before recall settles).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Bridge the caller's signal into the prefetch controller so a user abort
// (Ctrl-C / Esc) on the parent turn also terminates the recall side-query.
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// no await — continue immediately
```

### 3. `client.ts` — point de consommation UserQuery (remplace `await relevantAutoMemoryPromise`)

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // already settled, returns immediately
  if (result.prompt) {
    // unshift, not push: keep memory at the front of systemReminders so
    // it leads the system-reminder block on UserQuery turns. (ToolResult
    // turns instead append to requestToSend to preserve functionCall /
    // functionResponse pairing — see below.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — point d'injection ToolResult (nouveau)

Après l'assemblage de `requestToSend`, avant `turn.run()`, ajouter :

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // Append (not prepend) so functionResponse parts stay first
      // and the model's functionCall/functionResponse pairing
      // isn't broken on the native Gemini path.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — chemins de nettoyage

Le handle est libéré par deux mécanismes distincts :

**5 sites d'annulation et de nettoyage** (la prélecture est toujours en attente, annuler le contrôleur avant de supprimer la référence). Remplacer `pendingRecallAbortController?.abort()` + `= undefined` par :

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Sites : `resetChat()`, retour anticipé `MaxSessionTurns`, retour anticipé `boundedTurns=0`, retour anticipé `SessionTokenLimitExceeded`, retour anticipé du signal de contrôle Arena. Le chemin de déclenchement lui-même effectue également cette annulation avant remplacement lorsqu'une nouvelle UserQuery arrive alors que la prélecture précédente est encore en vol.

**2 sites de nettoyage uniquement** (la prélecture a déjà été réglée et nous la consommons — pas de contrôleur à annuler, juste supprimer la référence) :

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Sites : point de consommation UserQuery, point d'injection ToolResult.

### 6. `relevanceSelector.ts` — supprimer `AbortSignal.timeout(1_000)`

Supprimer le `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` combiné et passer directement `callerAbortSignal`.

---

## Comparaison des comportements

| Scénario                                     | Avant                         | Après                                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| le rappel se termine avant la préparation du modèle | injecter sur UserQuery, ~0 attente   | injecter sur UserQuery, ~0 attente                           |
| rappel lent (démarrage à froid)                     | bloquer jusqu'à 2,5 s              | passer UserQuery, injecter sur le premier ToolResult             |
| le rappel expire (1 s)                       | annuler, résultat vide, pas de mémoire | pas de délai d'attente strict ; injecter une fois réglé               |
| pas d'appels d'outils, rappel lent                   | bloquer jusqu'à 2,5 s, puis passer   | passer UserQuery, aucune opportunité ToolResult — échec       |
| l'utilisateur envoie un 2ème message avant que le rappel ne se termine | le 2ème rappel entre en conflit avec le 1er handle    | le 1er handle est annulé lorsque la 2ème UserQuery déclenche un nouveau handle |

---

## Hors périmètre

- Changer le format d'injection de mémoire de `system-reminder` à l'attachement `tool-result` (style CC)
- Porte de saut de budget d'octets par session
- Porte de saut de prompt d'un seul mot