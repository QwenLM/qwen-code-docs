# Conception de l'escalade adaptative des jetons de sortie

> Réduit la sur-réservation des créneaux GPU d'environ 4x grâce à une stratégie de « défaut bas + escalade en cas de troncature » pour les jetons de sortie, avec une récupération multi-tours pour les réponses qui dépassent même la limite escaladée.

## Problème

Chaque requête API réserve un créneau GPU fixe proportionnel à `max_tokens`. L'ancien défaut de 32K jetons signifie que chaque requête réserve un créneau de sortie de 32K, mais 99% des réponses font moins de 5K jetons. Cela sur-réserve la capacité GPU de 4 à 6x, limitant la concurrence du serveur et augmentant le coût.

## Solution

Utiliser un défaut plafonné de **8K** jetons de sortie. Lorsqu'une réponse est tronquée (le modèle atteint `max_tokens`) :

1. **Escalader** vers la limite de sortie complète du modèle (avec 64K comme plancher pour les modèles inconnus)
2. Si toujours tronquée, **récupérer** en conservant la réponse partielle dans l'historique et en injectant un message de continuation, jusqu'à 3 fois
3. Si la récupération est épuisée, revenir aux instructions de troncature du planificateur d'outils

Puisque moins de 1% des requêtes sont effectivement tronquées, cela réduit considérablement la réservation moyenne de créneaux tout en préservant la qualité de sortie pour les longues réponses.

## Architecture

```
Request (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Response truncated?     │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 1: Escalate to model output limit         │
│  ┌────────────────────────────────────────────┐  │
│  │ Pop partial response from history          │  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Re-send at max(64K, model output limit)    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Still truncated?        │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Multi-turn recovery (up to 3×)         │
│  ┌────────────────────────────────────────────┐  │
│  │ Keep partial response in history           │  │
│  │ Push user message: "Resume directly..."    │  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Re-send with updated history               │  │
│  │ Model continues from where it left off     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Succeeded?  │── Yes ──▶ Done ✓         │
│          └──────┬──────┘                          │
│                 │ No (still truncated)            │
│                 ▼                                 │
│          attempt < 3? ── Yes ──▶ loop back ↑      │
└───────────┬──────────────────────────────────────┘
            │ No (exhausted)
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Tool scheduler fallback                │
│  ┌────────────────────────────────────────────┐  │
│  │ Reject truncated Edit/Write tool calls     │  │
│  │ Return guidance: "You MUST split into      │  │
│  │ smaller parts — write skeleton first,      │  │
│  │ then edit incrementally."                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Détermination de la limite de jetons

La valeur effective de `max_tokens` est résolue dans l'ordre de priorité suivant :

| Priorité    | Source                                               | Valeur (modèle connu)          | Valeur (modèle inconnu) | Comportement d'escalade                             |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1 (la plus élevée) | Configuration utilisateur (`samplingParams.max_tokens`)            | `min(userValue, modelLimit)` | `userValue`           | Pas d'escalade                                   |
| 2           | Variable d'environnement (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`            | Pas d'escalade                                   |
| 3 (la plus basse)  | Défaut plafonné                                       | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | Escalade vers la limite du modèle (plancher 64K) + récupération |

Un « modèle connu » possède une entrée explicite dans `OUTPUT_PATTERNS` (vérifié via `hasExplicitOutputLimit()`). Pour les modèles connus, la valeur effective est toujours plafonnée à la limite de sortie déclarée du modèle afin d'éviter les erreurs d'API. Pour les modèles inconnus (déploiements personnalisés, points d'accueil auto-hébergés), la valeur définie par l'utilisateur est transmise directement, car le backend peut supporter des limites plus élevées.

Cette logique est implémentée dans trois générateurs de contenu :

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — fournisseurs compatibles OpenAI
- `DashScopeProvider` — hérite de `applyOutputTokenLimit()` du fournisseur par défaut
- `AnthropicContentGenerator.buildSamplingParameters()` — fournisseur Anthropic
## Mécanisme d'escalade

La logique d'escalade se trouve dans `geminiChat.ts`, placée **en dehors** de la boucle principale de réessai. C'est intentionnel :

1. La boucle de réessai gère les erreurs transitoires (limites de débit, flux invalides, validation du contenu)
2. La troncature n'est pas une erreur — c'est une réponse réussie qui a été interrompue
3. Les erreurs du flux escaladé doivent être propagées directement à l'appelant, et non être capturées par la logique de réessai

### Étapes d'escalade (geminiChat.ts)

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Compute escalated limit: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Pop the partial model response from chat history
6. Yield RETRY event (isContinuation: false) → UI discards partial output and resets buffers
7. Re-send the same request with maxOutputTokens: escalatedLimit
```

### Étapes de récupération (geminiChat.ts)

Si la réponse escaladée est également tronquée (finishReason === MAX_TOKENS), la boucle de récupération s'exécute jusqu'à `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) fois :

```
1. Partial model response is already in history (pushed by processStreamResponse)
2. Push a recovery user message: OUTPUT_RECOVERY_MESSAGE
3. Yield RETRY event (isContinuation: true) → UI keeps text buffer for continuation
4. Re-send with updated history (model sees its partial output + recovery instruction)
5. If still truncated and attempts remain, loop back to step 1
6. If recovery attempt throws (empty response, network error):
   - Pop the dangling recovery message from history
   - Break out of recovery loop
```

### Nettoyage de l'état sur RETRY (turn.ts)

Lorsque la classe `Turn` reçoit un événement RETRY, elle efface l'état accumulé pour éviter les incohérences :

- `pendingToolCalls` — effacé pour éviter les appels d'outils en double si la première réponse tronquée contenait des appels d'outils terminés qui sont répétés dans la réponse escaladée
- `pendingCitations` — effacé pour éviter les citations en double
- `finishReason` — réinitialisé à `undefined` afin que le motif de fin de la nouvelle réponse soit utilisé

Le drapeau `isContinuation` est transmis à l'interface utilisateur afin qu'elle puisse décider de réinitialiser les tampons de texte (escalade) ou de les conserver (récupération).

## Constantes

Définies dans `geminiChat.ts` et `tokenLimits.ts` :

| Constante                       | Valeur | Objectif                                                 |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8 000  | Limite de jetons de sortie par défaut lorsqu'aucune surcharge utilisateur n'est définie |
| `ESCALATED_MAX_TOKENS`         | 64 000 | Plancher pour l'escalade (utilisé lorsque la limite du modèle est inconnue) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | Nombre maximal de tentatives de récupération multi-tours après l'escalade |

La limite escaladée effective est `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))` :

| Modèle            | Limite escaladée |
| ---------------- | --------------- |
| Claude Opus 4.6  | 131 072 (128K)  |
| GPT-5 / o-series | 131 072 (128K)  |
| Qwen3.x          | 65 536 (64K)    |
| Modèles inconnus | 64 000 (plancher) |

## Décisions de conception

### Pourquoi une valeur par défaut de 8K ?

- 99 % des réponses font moins de 5K jetons
- 8K offre une marge raisonnable pour des réponses légèrement plus longues sans déclencher des réessais inutiles
- Réduit la réservation moyenne de créneaux de 32K à 8K (amélioration d'un facteur 4)

### Pourquoi escalader jusqu'à la limite du modèle plutôt qu'une valeur fixe de 64K ?

- Les modèles avec des limites de sortie plus élevées (Claude Opus 128K, GPT-5 128K) étaient inutilement contraints à 64K
- Utiliser la limite réelle du modèle permet de capturer la grande majorité des sorties longues sans un second réessai
- `ESCALATED_MAX_TOKENS` (64K) sert de plancher pour les modèles inconnus où `tokenLimit()` renvoie la valeur par défaut de 32K

### Pourquoi une récupération multi-tours plutôt qu'une escalade progressive ?

- L'escalade progressive (8K → 16K → 32K → 64K) nécessite de régénérer la réponse complète à chaque fois
- La récupération multi-tours conserve la réponse partielle et permet au modèle de continuer, économisant des jetons et de la latence
- Les messages de récupération sont peu coûteux (~40 jetons chacun) comparé à la régénération de grandes réponses
- La limite de 3 tentatives empêche les boucles infinies tout en couvrant la plupart des cas pratiques

### Pourquoi l'escalade est-elle en dehors de la boucle de réessai ?

- La troncature est un cas de réussite, pas une erreur
- Les erreurs du flux escaladé (limites de débit, pannes réseau) doivent être propagées directement plutôt que d'être réessayées silencieusement avec des paramètres incorrects
- Maintient la boucle de réessai concentrée sur son objectif initial (récupération d'erreurs transitoires)
- Les erreurs de récupération sont capturées séparément pour éviter d'abandonner toute la conversation
