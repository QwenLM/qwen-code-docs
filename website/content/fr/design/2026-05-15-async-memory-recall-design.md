# Async Memory Recall — Spécification de conception

**Date:** 2026-05-15
**Statut:** Approuvé
**Problèmes liés:** #3761, #3759
**PRs liés:** #3814, #3866

---

## Problème

`relevanceSelector.ts` utilise `AbortSignal.timeout(1_000)` (introduit par #3866). Lors des démarrages à froid de première session, qwen3.5-flash prend en moyenne ~908 ms — atteignant régulièrement le seuil de 1 s. Le délai externe de 2,5 s dans `resolveAutoMemoryWithDeadline` signifie que chaque UserQuery peut bloquer jusqu'à 2,5 s même lorsque le rappel échoue toujours.

Cause racine : le chemin de requête de l'agent principal `await` le résultat du rappel avant de l'envoyer au modèle. Tout ralentissement dans la requête secondaire de rappel s'ajoute directement à la latence visible par l'utilisateur.

---

## Conception

### Idée centrale

Déclencher le rappel sur UserQuery et ne jamais l'attendre. Consommer le résultat à deux points opportunistes — selon celui qui se déclenche en premier :

1. **Point de consommation UserQuery** — vérification synchrone `settledAt !== null` juste avant `turn.run()`. Attente zéro : si déjà résolu, l'utiliser ; sinon, passer.
2. **Point d'injection ToolResult** — même vérification sur chaque tour ToolResult. Injecte la mémoire en tant que `system-reminder` **ajouté après** les parties functionResponse dans `requestToSend`, donnant ainsi le contexte mémoire au modèle avant sa prochaine réponse. (Ajout, pas préfixe : l'API Qwen exige que le functionResponse suive immédiatement le functionCall du modèle — voir la vérification existante `hasPendingToolCall` pour le saut de contexte IDE pour la même contrainte.)

Cela correspond au modèle utilisé par Claude Code en amont (`startRelevantMemoryPrefetch` / interrogation de `settledAt` dans `query.ts`).

---

## Structures de données

### Nouveau type `MemoryPrefetchHandle` (dans `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Défini par promise.finally(). null tant que la promesse n'est pas résolue. */
  settledAt: number | null;
  /** True après que la mémoire a été injectée — empêche la double injection. */
  consumed: boolean;
  controller: AbortController;
};
```

### Changement de champ sur `GeminiClient`

| Supprimer                                                      | Ajouter                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined`   | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined`    |

---

## Changements

### 1. `client.ts` — supprimer `resolveAutoMemoryWithDeadline`

Supprimer la fonction entièrement. Elle est remplacée par le mécanisme du drapeau `settledAt`.

### 2. `client.ts` — chemin de déclenchement UserQuery

Remplacer l'appel à `resolveAutoMemoryWithDeadline` par :

```typescript
// Annuler toute prélecture en cours d'une UserQuery précédente avant d'installer
// le nouveau handle (empêche les requêtes secondaires orphelines lorsque
// l'utilisateur tape à nouveau avant que le rappel ne se résolve).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Faire le pont entre le signal de l'appelant et le contrôleur de prélecture
// afin qu'une annulation utilisateur (Ctrl-C / Esc) sur le tour parent
// termine également la requête secondaire de rappel.
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
      debugLogger.warn('La prélecture de mémoire automatique gérée a échoué.', error);
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
// pas de await — continuer immédiatement
```

### 3. `client.ts` — Point de consommation UserQuery (remplace `await relevantAutoMemoryPromise`)

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // déjà résolue, retourne immédiatement
  if (result.prompt) {
    // unshift, pas push : garder la mémoire en tête des systemReminders pour
    // qu'elle précède le bloc system-reminder sur les tours UserQuery.
    // (Les tours ToolResult ajoutent plutôt à requestToSend pour préserver
    // l'appariement functionCall / functionResponse — voir ci-dessous.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — Point d'injection ToolResult (nouveau)

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
      // Ajouter (pas préfixer) pour que les parties functionResponse restent
      // en premier et que l'appariement functionCall/functionResponse du modèle
      // ne soit pas brisé sur le chemin natif Gemini.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```
### 5. `client.ts` — nettoyage des chemins

Le handle est libéré par deux mécanismes distincts :

**5 sites d'abandon et de nettoyage** (le préchargement est toujours en attente, abandonner le contrôleur avant de supprimer la référence). Remplacer `pendingRecallAbortController?.abort()` + `= undefined` par :

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Sites : `resetChat()`, retour anticipé pour `MaxSessionTurns`, retour anticipé pour `boundedTurns=0`, retour anticipé pour `SessionTokenLimitExceeded`, retour anticipé pour le signal de contrôle Arena. Le chemin de déclenchement effectue également cet abandon puis remplacement lorsqu'une nouvelle UserQuery arrive alors que le préchargement précédent est encore en cours.

**2 sites de nettoyage uniquement** (le préchargement a déjà abouti et nous le consommons — aucun contrôleur à abandonner, il suffit de supprimer la référence) :

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Sites : point de consommation UserQuery, point d'injection ToolResult.

### 6. `relevanceSelector.ts` — suppression de `AbortSignal.timeout(1_000)`

Supprimer la combinaison `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` et passer directement `callerAbortSignal`.

---

## Comparaison des comportements

| Scénario                                     | Avant                         | Après                                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| rappel terminé avant la préparation du modèle | injection sur UserQuery, ~0 attente | injection sur UserQuery, ~0 attente                    |
| rappel lent (démarrage à froid)              | bloque jusqu'à 2,5 s           | ignore UserQuery, injecte sur le premier ToolResult    |
| rappel expire (1 s)                          | abandon, résultat vide, pas de mémoire | pas de délai d'expiration strict ; injecte dès que terminé |
| pas d'appels d'outils, rappel lent           | bloque jusqu'à 2,5 s, puis ignore | ignore UserQuery, pas d'opportunité ToolResult — raté  |
| l'utilisateur envoie un 2e message avant la fin du rappel | le 2e rappel entre en concurrence avec le 1er handle | le 1er handle est abandonné lorsque la 2e UserQuery déclenche un nouveau handle |

---

## Hors périmètre

- Changer le format d'injection de mémoire de `system-reminder` à une pièce jointe `tool-result` (style CC)
- Porte de saut de budget d'octets par session
- Porte de saut pour les invites d'un seul mot
