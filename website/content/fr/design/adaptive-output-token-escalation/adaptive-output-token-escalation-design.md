# Conception de l'escalade adaptative des tokens de sortie

> Réduit la sur-réservation des slots GPU d'environ 4x grâce à une stratégie « défaut bas + escalade en cas de troncature » pour les tokens de sortie.

## Problème

Chaque requête API réserve un slot GPU fixe proportionnel à `max_tokens`. L'ancien défaut de 32K tokens signifie que chaque requête réserve un slot de sortie de 32K, mais 99 % des réponses font moins de 5K tokens. Cela sur-réserve la capacité GPU de 4 à 6 fois, limitant la concurrence du serveur et augmentant les coûts.

## Solution

Utiliser une valeur par défaut plafonnée à **8K** tokens de sortie. Lorsqu'une réponse est tronquée (le modèle atteint `max_tokens`), relancer automatiquement une fois avec une limite escaladée à **64K**. Comme moins de 1 % des requêtes sont réellement tronquées, cela réduit considérablement la réservation moyenne de slots tout en préservant la qualité de sortie pour les réponses longues.

## Architecture

```
                      ┌─────────────────────────┐
                      │   Request starts        │
                      │   max_tokens = 8K       │
                      └───────────┬─────────────┘
                                  │
                                  ▼
                      ┌─────────────────────────┐
                      │   Stream response       │
                      └───────────┬─────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                   finish_reason        finish_reason
                   != MAX_TOKENS        == MAX_TOKENS
                        │                   │
                        ▼                   ▼
                  ┌───────────┐   ┌─────────────────────┐
                  │   Done    │   │  Check conditions:   │
                  └───────────┘   │  - No user override? │
                                  │  - No env override?  │
                                  │  - Not already       │
                                  │    escalated?        │
                                  └─────────┬───────────┘
                                     YES    │    NO
                                  ┌─────────┴────┐
                                  │              │
                                  ▼              ▼
                          ┌─────────────┐  ┌──────────┐
                          │ Pop partial │  │  Done    │
                          │ model resp  │  │ (truncd) │
                          │ from history│  └──────────┘
                          │             │
                          │ Yield RETRY │
                          │ event       │
                          │             │
                          │ Re-send     │
                          │ max_tokens  │
                          │   = 64K     │
                          └─────────────┘
```

## Détermination de la limite de tokens

La valeur effective de `max_tokens` est résolue selon l'ordre de priorité suivant :

| Priorité        | Source                                               | Valeur (modèle connu)          | Valeur (modèle inconnu) | Comportement d'escalade            |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ------------------------------ |
| 1 (la plus haute) | Configuration utilisateur (`samplingParams.max_tokens`)            | `min(userValue, modelLimit)` | `userValue`           | Pas d'escalade                  |
| 2           | Variable d'environnement (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`            | Pas d'escalade                  |
| 3 (la plus basse)  | Défaut plafonné                                       | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | Escalade à 64K en cas de troncature |

Un « modèle connu » est un modèle disposant d'une entrée explicite dans `OUTPUT_PATTERNS` (vérifié via `hasExplicitOutputLimit()`). Pour les modèles connus, la valeur effective est toujours plafonnée à la limite de sortie déclarée du modèle afin d'éviter les erreurs API. Les modèles inconnus (déploiements personnalisés, endpoints auto-hébergés) transmettent directement la valeur de l'utilisateur, car le backend peut prendre en charge des limites plus élevées.

Cette logique est implémentée dans trois générateurs de contenu :

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — fournisseurs compatibles OpenAI
- `DashScopeProvider` — hérite de `applyOutputTokenLimit()` du fournisseur par défaut
- `AnthropicContentGenerator.buildSamplingParameters()` — fournisseur Anthropic

## Mécanisme d'escalade

La logique d'escalade se trouve dans `geminiChat.ts`, placée **en dehors** de la boucle de retry principale. Ceci est intentionnel :

1. La boucle de retry gère les erreurs transitoires (rate limits, streams invalides, validation du contenu)
2. La troncature n'est pas une erreur — il s'agit d'une réponse réussie qui a été interrompue prématurément
3. Les erreurs provenant du stream escaladé doivent être propagées directement à l'appelant, et non interceptées par la logique de retry

### Étapes d'escalade (geminiChat.ts)

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Pop the partial model response from chat history
5. Yield RETRY event → UI discards partial output
6. Re-send the same request with maxOutputTokens: 64K
```

### Nettoyage de l'état lors d'un RETRY (turn.ts)

Lorsque la classe `Turn` reçoit un événement RETRY, elle efface l'état accumulé pour éviter les incohérences :

- `pendingToolCalls` — effacé pour éviter les appels d'outils en double si la première réponse tronquée contenait des appels d'outils terminés qui sont répétés dans la réponse escaladée
- `pendingCitations` — effacé pour éviter les citations en double
- `debugResponses` — effacé pour éviter les données de debug obsolètes
- `finishReason` — réinitialisé à `undefined` afin que la raison de fin de la nouvelle réponse soit utilisée

## Constantes

Définies dans `tokenLimits.ts` :

| Constante                    | Valeur  | Objectif                                                 |
| --------------------------- | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS` | 8,000  | Limite par défaut des tokens de sortie lorsqu'aucune surcharge utilisateur n'est définie |
| `ESCALATED_MAX_TOKENS`      | 64,000 | Limite des tokens de sortie utilisée lors du retry après troncature             |

## Décisions de conception

### Pourquoi un défaut à 8K ?

- 99 % des réponses font moins de 5K tokens
- 8K offre une marge raisonnable pour les réponses légèrement plus longues sans déclencher de retries inutiles
- Réduit la réservation moyenne de slots de 32K à 8K (amélioration de 4x)

### Pourquoi une limite escaladée à 64K ?

- Couvre la grande majorité des sorties longues qui ont été tronquées à 8K
- Correspond à la limite de sortie de nombreux modèles modernes (Claude Sonnet, Gemini 3.x, Qwen3.x)
- Des valeurs plus élevées (ex. 128K) annuleraient les bénéfices de l'optimisation des slots pour les <1 % de requêtes qui escaladent

### Pourquoi pas une escalade progressive (8K → 16K → 32K → 64K) ?

- Chaque retry ajoute de la latence (la réponse complète doit être régénérée)
- Un seul retry est l'approche la plus simple qui couvre presque tous les cas
- Le taux de troncature <1 % à 8K signifie que presque aucune requête n'a besoin d'escalade ; celles qui en ont besoin nécessitent probablement bien plus que 16K

### Pourquoi l'escalade est-elle en dehors de la boucle de retry ?

- La troncature est un cas de succès, pas une erreur
- Les erreurs provenant du stream escaladé (rate limits, pannes réseau) doivent être propagées directement plutôt que d'être retentées silencieusement avec des paramètres incorrects
- Maintient la boucle de retry concentrée sur son objectif initial (récupération après erreur transitoire)