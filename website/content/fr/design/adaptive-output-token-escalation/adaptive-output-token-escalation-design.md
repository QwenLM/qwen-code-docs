# Conception de l'escalade adaptative des tokens de sortie

> Réduit la sur-réservation des slots GPU d'environ 4x grâce à une stratégie « valeur par défaut basse + escalade en cas de troncature » pour les tokens de sortie, avec une récupération multi-tours pour les réponses qui dépassent même le plafond escaladé.

## Problème

Chaque requête API réserve un slot GPU fixe proportionnel à `max_tokens`. La valeur par défaut précédente de 32K tokens signifie que chaque requête réserve un slot de sortie de 32K, alors que 99 % des réponses font moins de 5K tokens. Cela sur-réserve la capacité GPU de 4 à 6 fois, limitant la concurrence du serveur et augmentant les coûts.

## Solution

Utiliser une valeur par défaut plafonnée à **8K** tokens de sortie. Lorsqu'une réponse est tronquée (le modèle atteint `max_tokens`) :

1. **Escalader** vers la limite de sortie complète du modèle (avec un plancher de 64K pour les modèles inconnus)
2. Si elle est toujours tronquée, **récupérer** en conservant la réponse partielle dans l'historique et en injectant un message de continuation, jusqu'à 3 fois
3. Si les tentatives de récupération sont épuisées, se rabattre sur les directives de troncature du planificateur d'outils (tool scheduler)

Comme moins de 1 % des requêtes sont réellement tronquées, cela réduit considérablement la réservation moyenne de slots tout en préservant la qualité de sortie pour les réponses longues.

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

## Détermination de la limite de tokens

La valeur effective de `max_tokens` est résolue selon l'ordre de priorité suivant :

| Priorité      | Source                                               | Valeur (modèle connu)          | Valeur (modèle inconnu) | Comportement d'escalade                             |
| ------------- | ---------------------------------------------------- | ------------------------------ | ----------------------- | --------------------------------------------------- |
| 1 (plus haute)| Configuration utilisateur (`samplingParams.max_tokens`) | `min(userValue, modelLimit)`   | `userValue`             | Pas d'escalade                                      |
| 2             | Variable d'environnement (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`    | `envValue`              | Pas d'escalade                                      |
| 3 (plus basse)| Valeur par défaut plafonnée                          | `min(modelLimit, 8K)`          | `min(32K, 8K)` = 8K     | Escalade vers la limite du modèle (plancher 64K) + récupération |

Un « modèle connu » est un modèle disposant d'une entrée explicite dans `OUTPUT_PATTERNS` (vérifié via `hasExplicitOutputLimit()`). Pour les modèles connus, la valeur effective est toujours plafonnée à la limite de sortie déclarée du modèle afin d'éviter les erreurs API. Les modèles inconnus (déploiements personnalisés, endpoints auto-hébergés) transmettent directement la valeur de l'utilisateur, car le backend peut prendre en charge des limites plus élevées.

Cette logique est implémentée dans trois générateurs de contenu :

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — fournisseurs compatibles OpenAI
- `DashScopeProvider` — hérite de `applyOutputTokenLimit()` du fournisseur par défaut
- `AnthropicContentGenerator.buildSamplingParameters()` — fournisseur Anthropic

## Mécanisme d'escalade

La logique d'escalade réside dans `geminiChat.ts`, placée **en dehors** de la boucle de retry principale. Ceci est intentionnel :

1. La boucle de retry gère les erreurs transitoires (limites de débit, flux invalides, validation du contenu)
2. La troncature n'est pas une erreur — il s'agit d'une réponse réussie qui a été interrompue prématurément
3. Les erreurs provenant du flux escaladé doivent être propagées directement à l'appelant, et non interceptées par la logique de retry

### Étapes d'escalade (geminiChat.ts)

```
1. Le flux se termine avec succès (lastError === null)
2. Le dernier chunk a finishReason === MAX_TOKENS
3. Les vérifications de garde passent :
   - maxTokensEscalated === false (empêcher l'escalade infinie)
   - hasUserMaxTokensOverride === false (respecter l'intention de l'utilisateur)
4. Calculer la limite escaladée : max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Retirer la réponse partielle du modèle de l'historique de chat
6. Émettre l'événement RETRY (isContinuation: false) → l'UI ignore la sortie partielle et réinitialise les tampons
7. Renvoyer la même requête avec maxOutputTokens: escalatedLimit
```

### Étapes de récupération (geminiChat.ts)

Si la réponse escaladée est également tronquée (finishReason === MAX_TOKENS), la boucle de récupération s'exécute jusqu'à `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) fois :

```
1. La réponse partielle du modèle est déjà dans l'historique (ajoutée par processStreamResponse)
2. Ajouter un message utilisateur de récupération : OUTPUT_RECOVERY_MESSAGE
3. Émettre l'événement RETRY (isContinuation: true) → l'UI conserve le tampon de texte pour la continuation
4. Renvoyer avec l'historique mis à jour (le modèle voit sa sortie partielle + l'instruction de récupération)
5. Si toujours tronquée et qu'il reste des tentatives, revenir à l'étape 1
6. Si la tentative de récupération lève une exception (réponse vide, erreur réseau) :
   - Retirer le message de récupération orphelin de l'historique
   - Sortir de la boucle de récupération
```

### Nettoyage d'état lors d'un RETRY (turn.ts)

Lorsque la classe `Turn` reçoit un événement RETRY, elle efface l'état accumulé pour éviter les incohérences :

- `pendingToolCalls` — effacé pour éviter les appels d'outils en double si la première réponse tronquée contenait des appels d'outils terminés qui sont répétés dans la réponse escaladée
- `pendingCitations` — effacé pour éviter les citations en double
- `debugResponses` — effacé pour éviter les données de debug obsolètes
- `finishReason` — réinitialisé à `undefined` afin que la raison de fin de la nouvelle réponse soit utilisée

Le flag `isContinuation` est transmis à l'UI afin qu'elle puisse décider de réinitialiser les tampons de texte (escalade) ou de les conserver (récupération).

## Constantes

Définies dans `geminiChat.ts` et `tokenLimits.ts` :

| Constante                      | Valeur | Objectif                                                 |
| ------------------------------ | ------ | -------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8 000  | Limite par défaut des tokens de sortie lorsqu'aucune substitution utilisateur n'est définie |
| `ESCALATED_MAX_TOKENS`         | 64 000 | Plancher pour l'escalade (utilisé lorsque la limite du modèle est inconnue) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | Nombre maximal de tentatives de récupération multi-tours après escalade |

La limite escaladée effective est `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))` :

| Modèle           | Limite escaladée |
| ---------------- | ---------------- |
| Claude Opus 4.6  | 131 072 (128K)   |
| GPT-5 / o-series | 131 072 (128K)   |
| Qwen3.x          | 65 536 (64K)     |
| Modèles inconnus | 64 000 (plancher)|

## Décisions de conception

### Pourquoi une valeur par défaut de 8K ?

- 99 % des réponses font moins de 5K tokens
- 8K offre une marge raisonnable pour les réponses légèrement plus longues sans déclencher de retries inutiles
- Réduit la réservation moyenne de slots de 32K à 8K (amélioration de 4x)

### Pourquoi escalader vers la limite du modèle plutôt qu'un plafond fixe de 64K ?

- Les modèles avec des limites de sortie plus élevées (Claude Opus 128K, GPT-5 128K) étaient inutilement limités à 64K
- Utiliser la limite réelle du modèle capture la grande majorité des sorties longues sans nécessiter un second retry
- `ESCALATED_MAX_TOKENS` (64K) sert de plancher pour les modèles inconnus où `tokenLimit()` renvoie la valeur par défaut de 32K

### Pourquoi une récupération multi-tours plutôt qu'une escalade progressive ?

- L'escalade progressive (8K → 16K → 32K → 64K) nécessite de régénérer la réponse complète à chaque fois
- La récupération multi-tours conserve la réponse partielle et permet au modèle de continuer, économisant ainsi des tokens et réduisant la latence
- Les messages de récupération sont peu coûteux (~40 tokens chacun) comparés à la régénération de réponses volumineuses
- La limite de 3 tentatives empêche les boucles infinies tout en couvrant la plupart des cas pratiques

### Pourquoi l'escalade est-elle en dehors de la boucle de retry ?

- La troncature est un cas de succès, pas une erreur
- Les erreurs provenant du flux escaladé (limites de débit, pannes réseau) doivent être propagées directement plutôt que d'être retentées silencieusement avec des paramètres incorrects
- Maintient la boucle de retry concentrée sur son objectif initial (récupération d'erreurs transitoires)
- Les erreurs de récupération sont interceptées séparément pour éviter d'interrompre toute la conversation