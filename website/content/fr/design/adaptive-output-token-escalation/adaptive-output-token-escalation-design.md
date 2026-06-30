# Limite de tokens de sortie et conception de l'escalade

> Utilise par défaut la limite de sortie déclarée par le modèle, sauf si l'utilisateur ou l'environnement configure `max_tokens`, puis utilise l'escalade et la récupération multi-tours uniquement lorsqu'une réponse atteint toujours `MAX_TOKENS`.

## Problème

Chaque requête API réserve un emplacement GPU fixe proportionnel à `max_tokens`. Une valeur par défaut basse peut réduire la réservation d'emplacements, mais elle augmente également le risque de troncature pour les réponses volumineuses normales. Pour les workflows d'écriture de fichiers, cela peut produire des arguments d'appel d'outil incomplets et forcer le planificateur à rejeter l'écriture partielle.

## Solution

Utilise par défaut la limite de sortie déclarée par le modèle. Lorsqu'une réponse est tronquée (le modèle atteint `max_tokens`) :

1. **Escalader** vers la limite de sortie complète du modèle (avec 64K comme plancher si la limite actuelle est inférieure)
2. Si toujours tronquée, **récupérer** en conservant la réponse partielle dans l'historique et en injectant un message de continuation, jusqu'à 3 fois
3. Si la récupération est épuisée, revenir aux instructions de troncature du planificateur d'outils

Cela privilégie l'exactitude pour les tâches de génération volumineuse et de modification de fichiers. Les opérateurs qui ont besoin d'une réservation plus basse peuvent toujours définir `QWEN_CODE_MAX_OUTPUT_TOKENS`, et cette valeur explicite est respectée.

## Architecture

```
Requête (max_tokens = valeur utilisateur/env ou limite de sortie du modèle)
│
▼
┌─────────────────────────┐
│  Réponse tronquée ?      │──── Non ──▶ Terminé ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Oui
            ▼
┌──────────────────────────────────────────────────┐
│  Couche 1 : Escalade vers la limite de sortie    │
│  ┌────────────────────────────────────────────┐  │
│  │ Retirer la réponse partielle de l'historique│  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Renvoyer à max(64K, limite de sortie)      │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Toujours tronquée ?      │──── Non ──▶ Terminé ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Oui
            ▼
┌──────────────────────────────────────────────────┐
│  Couche 2 : Récupération multi-tours (jusqu'à 3×)│
│  ┌────────────────────────────────────────────┐  │
│  │ Conserver la réponse partielle dans l'hist.│  │
│  │ Ajouter msg utilisateur: "Reprendre dir..."│  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Renvoyer avec l'historique mis à jour      │  │
│  │ Le modèle continue là où il s'est arrêté   │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Réussi ?    │── Oui ──▶ Terminé ✓      │
│          └──────┬──────┘                          │
│                 │ Non (toujours tronquée)         │
│                 ▼                                 │
│          tentative < 3 ? ── Oui ──▶ retour ↑      │
└───────────┬──────────────────────────────────────┘
            │ Non (épuisé)
            ▼
┌──────────────────────────────────────────────────┐
│  Couche 3 : Repli du planificateur d'outils      │
│  ┌────────────────────────────────────────────┐  │
│  │ Rejeter les appels Edit/Write tronqués     │  │
│  │ Retourner instructions: "Vous DEVEZ diviser│  │
│  │ en parties plus petites — écrivez le       │  │
│  │ squelette d'abord, puis modifiez incrément.│  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Détermination de la limite de tokens

Le `max_tokens` effectif est résolu selon l'ordre de priorité suivant :

| Priorité    | Source                                               | Valeur (modèle connu)          | Valeur (modèle inconnu)              | Comportement d'escalade                             |
| ----------- | ---------------------------------------------------- | ------------------------------ | ------------------------------------ | --------------------------------------------------- |
| 1 (plus haute) | Config utilisateur (`samplingParams.max_tokens`)    | `min(userValue, modelLimit)`   | `userValue`                          | Pas d'escalade                                      |
| 2           | Variable d'environnement (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`                           | Pas d'escalade                                      |
| 3 (plus basse) | Limite de sortie du modèle/par défaut               | `modelLimit`                   | `DEFAULT_OUTPUT_TOKEN_LIMIT` = 32K   | Escalade vers la limite du modèle (plancher 64K) + récupération |

Un « modèle connu » est un modèle qui possède une entrée explicite dans `OUTPUT_PATTERNS` (vérifié via `hasExplicitOutputLimit()`). Pour les modèles connus, la valeur effective est toujours plafonnée à la limite de sortie déclarée par le modèle afin d'éviter les erreurs d'API. Les modèles inconnus (déploiements personnalisés, points de terminaison auto-hébergés) transmettent directement la valeur de l'utilisateur, car le backend peut prendre en charge des limites plus élevées.

Cette logique est implémentée dans trois générateurs de contenu :

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — Fournisseurs compatibles OpenAI
- `DashScopeProvider` — hérite de `applyOutputTokenLimit()` du fournisseur par défaut
- `AnthropicContentGenerator.buildSamplingParameters()` — Fournisseur Anthropic

## Mécanisme d'escalade

La logique d'escalade se trouve dans `geminiChat.ts`, placée **en dehors** de la boucle de retry principale. Ceci est intentionnel :

1. La boucle de retry gère les erreurs transitoires (limites de débit, flux invalides, validation de contenu)
2. La troncature n'est pas une erreur — c'est une réponse réussie qui a été coupée
3. Les erreurs du flux escaladé doivent se propager directement à l'appelant, et ne pas être interceptées par la logique de retry

### Étapes d'escalade (geminiChat.ts)

```
1. Le flux se termine avec succès (lastError === null)
2. Le dernier chunk a finishReason === MAX_TOKENS
3. Les vérifications de garde passent :
   - maxTokensEscalated === false (empêcher l'escalade infinie)
   - hasUserMaxTokensOverride === false (respecter l'intention de l'utilisateur)
4. Calculer la limite escaladée : max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Retirer la réponse partielle du modèle de l'historique du chat
6. Yield l'événement RETRY (isContinuation: false) → l'UI rejette la sortie partielle et réinitialise les buffers
7. Renvoyer la même requête avec maxOutputTokens: escalatedLimit
```

### Étapes de récupération (geminiChat.ts)

Si la réponse escaladée est également tronquée (finishReason === MAX_TOKENS), la boucle de récupération s'exécute jusqu'à `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) fois :

```
1. La réponse partielle du modèle est déjà dans l'historique (ajoutée par processStreamResponse)
2. Ajouter un message utilisateur de récupération : OUTPUT_RECOVERY_MESSAGE
3. Yield l'événement RETRY (isContinuation: true) → l'UI conserve le buffer de texte pour la continuation
4. Renvoyer avec l'historique mis à jour (le modèle voit sa sortie partielle + l'instruction de récupération)
5. Si toujours tronqué et qu'il reste des tentatives, retour à l'étape 1
6. Si la tentative de récupération lève une erreur (réponse vide, erreur réseau) :
   - Retirer le message de récupération orphelin de l'historique
   - Sortir de la boucle de récupération
```

### Nettoyage de l'état lors d'un RETRY (turn.ts)

Lorsque la classe `Turn` reçoit un événement RETRY, elle efface l'état accumulé pour éviter les incohérences :

- `pendingToolCalls` — effacé pour éviter les appels d'outils en double si la première réponse tronquée contenait des appels d'outils terminés qui sont répétés dans la réponse escaladée
- `pendingCitations` — effacé pour éviter les citations en double
- `finishReason` — réinitialisé à `undefined` afin que la raison de fin de la nouvelle réponse soit utilisée

Le flag `isContinuation` est transmis à l'UI afin qu'elle puisse décider de réinitialiser les buffers de texte (escalade) ou de les conserver (récupération).

## Constantes

Définies dans `geminiChat.ts` et `tokenLimits.ts` :

| Constante                      | Valeur  | Objectif                                          |
| ------------------------------ | ------- | ------------------------------------------------- |
| `ESCALATED_MAX_TOKENS`         | 64 000  | Plancher pour l'escalade lorsque la limite du modèle est basse |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3       | Nombre max de tentatives de récupération multi-tours après l'escalade |

La limite escaladée effective est `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))` :

| Modèle            | Limite escaladée |
| ----------------- | ---------------- |
| Claude Opus 4.6   | 131 072 (128K)   |
| GPT-5 / o-series  | 131 072 (128K)   |
| Qwen3.x           | 65 536 (64K)     |
| Modèles inconnus  | 64 000 (plancher)|

## Décisions de conception

### Pourquoi ne pas utiliser une valeur par défaut de 8K ?

- Une valeur par défaut de 8K est une optimisation de réservation d'emplacements/de capacité, et non une exigence d'exactitude. Elle sacrifie l'exactitude (les réponses volumineuses sont tronquées) au profit du débit du backend (une requête réserve un emplacement GPU proportionnel à `max_tokens`, donc une valeur plus basse sur-réserve moins).
- La génération de fichiers volumineux et les appels d'outils de modification peuvent légitimement dépasser 8K, donc une valeur par défaut de 8K transforme une requête normale en un aller-retour tronquer → escalader (et, dans le pire des cas, une boucle de retry).
- Claude Code conserve la même limite de 8K mais la conditionne à un feature flag (`tengu_otk_slot_v1`) qui est **désactivé par défaut pour les fournisseurs tiers** (« non validé sur Bedrock/Vertex ») — c'est-à-dire que son comportement par défaut pour le serving non propriétaire est exactement « utiliser la limite déclarée par le modèle ». Les fournisseurs de qwen-code sont tous tiers / compatibles OpenAI / auto-hébergés, donc correspondre à ce comportement désactivé par défaut est le choix sûr ; supposer que la valeur par défaut basse est sûre pour chaque backend ne l'est pas.
- Le compromis de capacité n'est pas perdu, il est simplement rendu optionnel : les opérateurs sur un backend auto-hébergé à capacité limitée peuvent définir `QWEN_CODE_MAX_OUTPUT_TOKENS` (par ex. `8000`) pour restaurer la réservation plus basse par requête. Un feature flag de type GrowthBook n'est volontairement pas réintroduit — qwen-code ne dispose pas d'une telle infrastructure, et la variable d'environnement couvre déjà le besoin.

### Pourquoi escalader vers la limite du modèle au lieu d'un 64K fixe ?

- Les modèles avec des limites de sortie plus élevées (Claude Opus 128K, GPT-5 128K) étaient contraints à 64K inutilement
- Utiliser la limite réelle du modèle capture la grande majorité des sorties longues sans nécessiter un second retry
- `ESCALATED_MAX_TOKENS` (64K) sert de plancher pour les modèles inconnus où `tokenLimit()` renvoie la valeur par défaut de 32K

### Pourquoi une récupération multi-tours au lieu d'une escalade progressive ?

- L'escalade progressive (par exemple 16K -> 32K -> 64K) nécessite de régénérer la réponse complète à chaque fois
- La récupération multi-tours conserve la réponse partielle et laisse le modèle continuer, ce qui économise des tokens et de la latence
- Les messages de récupération sont peu coûteux (~40 tokens chacun) par rapport à la régénération de réponses volumineuses
- La limite de 3 tentatives empêche les boucles infinies tout en couvrant la plupart des cas pratiques

### Pourquoi l'escalade est-elle en dehors de la boucle de retry ?

- La troncature est un cas de succès, pas une erreur
- Les erreurs du flux escaladé (limites de débit, pannes réseau) doivent se propager directement plutôt que d'être relancées silencieusement avec des paramètres incorrects
- Cela garde la boucle de retry concentrée sur son objectif initial (la récupération des erreurs transitoires)
- Les erreurs de récupération sont interceptées séparément pour éviter d'interrompre l'ensemble de la conversation