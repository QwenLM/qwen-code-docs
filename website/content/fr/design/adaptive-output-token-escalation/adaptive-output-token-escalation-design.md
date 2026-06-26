# Conception de l'escalade adaptative des jetons de sortie

> Réduit la sur-réservation des emplacements GPU d'environ 4x grâce à une stratégie de « faible valeur par défaut + escalade en cas de troncature » pour les jetons de sortie, avec récupération multi-tours pour les réponses qui dépassent même la limite escaladée.

## Problème

Chaque requête API réserve un emplacement GPU fixe proportionnel à `max_tokens`. La valeur par défaut précédente de 32K jetons signifie que chaque requête réserve un emplacement de sortie de 32K, mais 99% des réponses font moins de 5K jetons. Cela sur-réserve la capacité GPU de 4 à 6 fois, limitant la concurrence du serveur et augmentant les coûts.

## Solution

Utiliser une valeur par défaut plafonnée de **8K** jetons de sortie. Lorsqu'une réponse est tronquée (le modèle atteint `max_tokens`) :

1. **Escalader** vers la limite de sortie complète du modèle (avec 64K comme seuil minimal pour les modèles inconnus)
2. Si toujours tronquée, **récupérer** en conservant la réponse partielle dans l'historique et en injectant un message de continuation, jusqu'à 3 fois
3. Si la récupération est épuisée, revenir aux instructions de troncature du planificateur d'outils

Étant donné que moins de 1% des requêtes sont réellement tronquées, cela réduit considérablement la réservation moyenne d'emplacement tout en préservant la qualité de sortie pour les longues réponses.

## Architecture

```
Requête (max_tokens = 8K)
│
▼
┌──────────────────────────────┐
│  Réponse tronquée ?          │─── Non ──▶ Terminé ✓
│  (MAX_TOKENS)                │
└──────────────┬───────────────┘
               │ Oui
               ▼
┌─────────────────────────────────────────────────────────┐
│  Couche 1 : Escalade vers la limite de sortie du modèle │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Retirer la réponse partielle de l'historique      │  │
│  │ RÉESSAYER (isContinuation: false → réinitialiser  │  │
│  │ l'interface utilisateur)                          │  │
│  │ Renvoyer avec max(64K, limite de sortie du modèle)│  │
│  └───────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Toujours tronquée ?         │─── Non ──▶ Terminé ✓
│  (MAX_TOKENS)                │
└──────────────┬───────────────┘
               │ Oui
               ▼
┌─────────────────────────────────────────────────────────┐
│  Couche 2 : Récupération multi-tours (jusqu'à 3×)      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Conserver la réponse partielle dans l'historique  │  │
│  │ Ajouter un message utilisateur : « Reprends       │  │
│  │ directement... »                                   │  │
│  │ RÉESSAYER (isContinuation: true → garder le       │  │
│  │ tampon de l'interface)                             │  │
│  │ Renvoyer avec l'historique mis à jour              │  │
│  │ Le modèle continue là où il s'est arrêté           │  │
│  └──────────────────┬────────────────────────────────┘  │
│                     │                                    │
│              ┌──────┴──────┐                             │
│              │ Succès ?    │── Oui ──▶ Terminé ✓         │
│              └──────┬──────┘                             │
│                     │ Non (toujours tronqué)             │
│                     ▼                                    │
│              tentative < 3 ? ── Oui ──▶ retour boucle ↑  │
└──────────────┬──────────────────────────────────────────┘
               │ Non (épuisé)
               ▼
┌─────────────────────────────────────────────────────────┐
│  Couche 3 : Repli sur le planificateur d'outils         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Rejeter les appels d'outils Edit/Write tronqués   │  │
│  │ Retourner une instruction : « Tu DOIS diviser     │  │
│  │ en parties plus petites — écris d'abord le        │  │
│  │ squelette, puis modifie de manière incrémentale. »│  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Détermination de la limite de jetons

Le `max_tokens` effectif est résolu selon l'ordre de priorité suivant :

| Priorité    | Source                                               | Valeur (modèle connu)           | Valeur (modèle inconnu) | Comportement d'escalade                     |
| ----------- | ---------------------------------------------------- | ------------------------------- | ----------------------- | ------------------------------------------- |
| 1 (plus élevée) | Configuration utilisateur (`samplingParams.max_tokens`) | `min(valeurUtilisateur, limiteModèle)` | `valeurUtilisateur`     | Pas d'escalade                              |
| 2           | Variable d'environnement (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(valeurEnv, limiteModèle)`  | `valeurEnv`             | Pas d'escalade                              |
| 3 (plus faible) | Valeur par défaut plafonnée                          | `min(limiteModèle, 8K)`         | `min(32K, 8K)` = 8K     | Escalade vers la limite du modèle (seuil à 64K) + récupération |

Un « modèle connu » est un modèle qui possède une entrée explicite dans `OUTPUT_PATTERNS` (vérifié via `hasExplicitOutputLimit()`). Pour les modèles connus, la valeur effective est toujours plafonnée à la limite de sortie déclarée du modèle afin d'éviter les erreurs API. Les modèles inconnus (déploiements personnalisés, points de terminaison auto-hébergés) transmettent directement la valeur de l'utilisateur, car le backend peut prendre en charge des limites plus grandes.

Cette logique est implémentée dans trois générateurs de contenu :

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — fournisseurs compatibles OpenAI
- `DashScopeProvider` — hérite de `applyOutputTokenLimit()` du fournisseur par défaut
- `AnthropicContentGenerator.buildSamplingParameters()` — fournisseur Anthropic

## Mécanisme d'escalade

La logique d'escalade se trouve dans `geminiChat.ts`, placée **en dehors** de la boucle principale de réessai. C'est intentionnel :

1. La boucle de réessai gère les erreurs transitoires (limites de débit, flux invalides, validation de contenu)
2. La troncature n'est pas une erreur — c'est une réponse réussie qui a été interrompue
3. Les erreurs provenant du flux escaladé doivent être propagées directement à l'appelant, et non pas capturées par la logique de réessai

### Étapes d'escalade (geminiChat.ts)

```
1. Le flux se termine avec succès (lastError === null)
2. Le dernier fragment a finishReason === MAX_TOKENS
3. Les vérifications de garde passent :
   - maxTokensEscalated === false (empêcher l'escalade infinie)
   - hasUserMaxTokensOverride === false (respecter l'intention de l'utilisateur)
4. Calculer la limite escaladée : max(ESCALATED_MAX_TOKENS, tokenLimit(modèle, 'output'))
5. Retirer la réponse partielle du modèle de l'historique du chat
6. Produire un événement RETRY (isContinuation: false) → l'interface utilisateur ignore la sortie partielle et réinitialise les tampons
7. Renvoyer la même requête avec maxOutputTokens: limiteEscaladée
```

### Étapes de récupération (geminiChat.ts)

Si la réponse escaladée est également tronquée (finishReason === MAX_TOKENS), la boucle de récupération s'exécute jusqu'à `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) fois :

```
1. La réponse partielle du modèle est déjà dans l'historique (ajoutée par processStreamResponse)
2. Ajouter un message utilisateur de récupération : OUTPUT_RECOVERY_MESSAGE
3. Produire un événement RETRY (isContinuation: true) → l'interface utilisateur conserve le tampon de texte pour la continuation
4. Renvoyer avec l'historique mis à jour (le modèle voit sa sortie partielle + l'instruction de récupération)
5. Si toujours tronqué et qu'il reste des tentatives, revenir à l'étape 1
6. Si la tentative de récupération échoue (réponse vide, erreur réseau) :
   - Retirer le message de récupération non abouti de l'historique
   - Sortir de la boucle de récupération
```

### Nettoyage d'état sur RETRY (turn.ts)

Lorsque la classe `Turn` reçoit un événement RETRY, elle efface l'état accumulé pour éviter les incohérences :

- `pendingToolCalls` — effacé pour éviter des appels d'outils en double si la première réponse tronquée contenait des appels d'outils terminés qui sont répétés dans la réponse escaladée
- `pendingCitations` — effacé pour éviter des citations en double
- `finishReason` — réinitialisé à `undefined` pour que le finish reason de la nouvelle réponse soit utilisé

Le drapeau `isContinuation` est transmis à l'interface utilisateur afin qu'elle puisse décider de réinitialiser les tampons de texte (escalade) ou de les conserver (récupération).

## Constantes

Définies dans `geminiChat.ts` et `tokenLimits.ts` :

| Constante                       | Valeur  | Objectif                                                |
| ------------------------------ | ------- | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8 000   | Limite de jetons de sortie par défaut (aucune surcharge utilisateur) |
| `ESCALATED_MAX_TOKENS`         | 64 000  | Seuil minimal pour l'escalade (utilisé quand la limite du modèle est inconnue) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3       | Nombre maximal de tentatives de récupération multi-tours après escalade |

La limite escaladée effective est `max(ESCALATED_MAX_TOKENS, tokenLimit(modèle, 'output'))` :

| Modèle            | Limite escaladée |
| ---------------- | ---------------- |
| Claude Opus 4.6  | 131 072 (128K)   |
| GPT-5 / série o  | 131 072 (128K)   |
| Qwen3.x          | 65 536 (64K)     |
| Modèles inconnus | 64 000 (seuil)   |

## Décisions de conception

### Pourquoi 8K par défaut ?

- 99% des réponses font moins de 5K jetons
- 8K offre une marge raisonnable pour des réponses légèrement plus longues sans déclencher de tentatives inutiles
- Réduit la réservation moyenne d'emplacement de 32K à 8K (amélioration 4x)

### Pourquoi escalader vers la limite du modèle au lieu d'un 64K fixe ?

- Les modèles avec des limites de sortie plus élevées (Claude Opus 128K, GPT-5 128K) étaient inutilement contraints à 64K
- Utiliser la limite réelle du modèle capture la grande majorité des sorties longues sans une seconde tentative
- `ESCALATED_MAX_TOKENS` (64K) sert de seuil minimal pour les modèles inconnus où `tokenLimit()` renvoie la valeur par défaut 32K

### Pourquoi une récupération multi-tours plutôt qu'une escalade progressive ?

- L'escalade progressive (8K → 16K → 32K → 64K) nécessite de regénérer la réponse complète à chaque fois
- La récupération multi-tours conserve la réponse partielle et permet au modèle de continuer, économisant des jetons et de la latence
- Les messages de récupération sont peu coûteux (~40 jetons chacun) comparé à la régénération de longues réponses
- La limite de 3 tentatives empêche les boucles infinies tout en couvrant la plupart des cas pratiques

### Pourquoi l'escalade est-elle en dehors de la boucle de réessai ?

- La troncature est un cas de succès, pas une erreur
- Les erreurs provenant du flux escaladé (limites de débit, pannes réseau) doivent être propagées directement plutôt que d'être réessayées silencieusement avec des paramètres incorrects
- Maintient la boucle de réessai concentrée sur son objectif initial (récupération d'erreurs transitoires)
- Les erreurs de récupération sont capturées séparément pour éviter d'abandonner toute la conversation