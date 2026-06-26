# Redesign du seuil d'auto-compaction

**Statut :** Projet · 2026-05-14

## Contexte

> Cette section décrit l'état **avant** l'implémentation de cette PR (comportement pré-redesign). Les références suivantes à `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt`, ainsi que les références file:line spécifiques correspondent au code avant fusion de la PR #4345 — après fusion, ces symboles / numéros de ligne ne seront plus valides.

Actuellement, la compaction automatique de qwen-code utilise un seul seuil proportionnel `COMPRESSION_TOKEN_THRESHOLD = 0,7` (`chatCompressionService.ts:33`), commun à toutes les tailles de fenêtre. En comparaison avec l'« échelle absolue de tokens » de claude-code (`autoCompact.ts:62-65`), qwen-code présente trois problèmes spécifiques :

1. **Réservation excessive pour les grandes fenêtres :** Le seuil de 70 % pour un modèle 1M déclenche à 700K, laissant 300K bien au-delà des ~33K réellement nécessaires pour le résumé + la sortie.
2. **Verrouillage permanent après un seul échec :** Une fois `hasFailedCompressionAttempt = true`, la session n'essaie plus jamais d'auto-compaction (`geminiChat.ts:504`), plus strict que le « disjoncteur après 3 échecs consécutifs » de claude-code.
3. **Déconnexion du système de tips et du seuil d'auto-compaction :** Les trois tips `context-*` dans `tipRegistry.ts` utilisent des pourcentages fixes de 50/80/95, totalement indépendants du seuil d'auto-compaction (70 %). Cela signifie que sur le chemin principal où l'« auto fonctionne normalement », les tips à 80 % / 95 % se déclenchent rarement, tandis que sur les chemins marginaux où l'« auto échoue / le palliatif réactif est activé », la sémantique alignée avec le seuil fait défaut.
4. **L'appel de compaction lui-même n'a pas de contrôle du budget de sortie :** [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374-376) active explicitement `thinkingConfig.includeThoughts = true` (commentaire : « La qualité de compaction influence chaque tour principal suivant »), tandis que l'appel `sideQuery` ne définit pas de limite `maxOutputTokens`. Le commentaire du code ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) reconnaît également que `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Lorsque la compaction approche du sommet de la fenêtre, la sortie totale peut gonfler, rendant la réservation de buffer sans limite prévisible.<br/><br/>Pire encore, le comportement varie d'un fournisseur à l'autre : le budget de réflexion (thinking budget) d'Anthropic est totalement indépendant de `max_tokens` ; les tokens de raisonnement d'OpenAI ne sont pas limités par `max_completion_tokens` ; le comportement de Gemini varie selon la version du modèle. Cela signifie que « simplement ajouter `maxOutputTokens` pour contrôler la sortie totale » n'est pas viable dans un projet multi-fournisseur comme qwen-code.

5. **Le `lastPromptTokenCount` utilisé pour le jugement de seuil est systématiquement sous-estimé.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) montre que cette valeur provient du `usageMetadata.totalTokenCount` de la réponse API du tour précédent. Deux lacunes : (a) elle n'inclut pas le message utilisateur qui sera ajouté au tour actuel, donc chaque vérification de seuil cheap-gate est plus petite que le prompt réel d'une section ; (b) la valeur initiale du premier tour est 0, donc lors d'un `--continue` pour restaurer une grande session / d'un sous-agent héritant de beaucoup d'historique, le premier `send` contourne toujours tous les seuils. En comparaison, le `tokenCountWithEstimation` de claude-code ([query.ts:638](src/query.ts:638)) suit une double approche « dernière utilisation API de l'assistant + estimation des messages ajoutés ensuite » qui comble ces deux lacunes.

## Objectifs de conception

- Introduire un seuil hybride « proportionnel + absolu », permettant aux modèles à grande fenêtre d'être régis par la valeur absolue et aux petites fenêtres de conserver une sécurité proportionnelle.
- Ajouter deux niveaux : avertissement (warn) et dur (hard) (l'auto-compactage reste le point de déclenchement principal), formant une échelle à trois niveaux.
- Réécrire le système de tips pour suivre les conditions de déclenchement des nouveaux seuils.
- Faire passer la gestion des échecs d'un « verrouillage permanent après 1 échec » à un « disjoncteur après 3 échecs + récupération automatique ».
- **Désactiver le mode réflexion et ajouter une limite `maxOutputTokens` pour l'appel de compaction :** En accord avec claude-code, la sortie totale est contrainte par un seul paramètre, rendant le budget de buffer prévisible ; accepter la baisse potentielle de qualité de compaction.
- **Ajouter une compensation d'estimation de tokens :** Éliminer les deux sous-estimations systématiques de `lastPromptTokenCount` (« décalage d'un tour » et « zéro au premier tour ») pour que le jugement de seuil soit plus proche de la taille réelle du prompt.
- Supprimer le point d'entrée de configuration `contextPercentageThreshold` dans les paramètres (la constante PCT interne est conservée).
- **Ne pas introduire** de canal de remplacement via des variables d'environnement, **ne pas** ajouter d'interrupteur explicite d'activation.

## Échelle à trois niveaux de seuils

```
                       window (fenêtre de contexte brute)
                          │
                          │  ← SUMMARY_RESERVE = 20K
                          ▼
                    effectiveWindow (fenêtre effective)
                          │
                          │  ← HARD_BUFFER = 3K
                          ▼
              hard_threshold = effectiveWindow - 3K
                          │
                          │  ← (AUTOCOMPACT_BUFFER - HARD_BUFFER) = 10K
                          ▼
auto_threshold = max(PCT * window, effectiveWindow - AUTOCOMPACT_BUFFER)
                          │
                          │  ← WARN_BUFFER = 20K
                          ▼
warn_threshold = max((PCT - WARN_OFFSET) * window, auto_threshold - WARN_BUFFER)
                          │
                          ▼
                          0
```

### Sémantique des trois niveaux

| Niveau    | Condition de déclenchement              | Comportement                                                                 |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| **warn**  | `tokenCount >= warn_threshold`          | Indication UI « X tokens restants avant la compaction automatique », sans modifier le comportement d'envoi. |
| **auto**  | `tokenCount >= auto_threshold`          | `tryCompress(force=false)` avant l'envoi, processus de compaction normal.     |
| **hard**  | `tokenCount >= hard_threshold`          | `tryCompress(force=true)` avant l'envoi, réinitialise le verrou d'échec et force la compaction. |

Le niveau `hard` équivaut à déplacer la logique de rattrapage réactive existante (geminiChat.ts:711) avant l'envoi, évitant ainsi un aller-retour de requête surdimensionné échoué.

## Constantes internes

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // sécurité proportionnelle pour l'auto
const WARN_PCT_OFFSET = 0.1; // seuil d'avertissement = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // limite haute de sortie pour la sideQuery de compaction (réflexion + résumé combinés)
const SUMMARY_RESERVE = 20_000; // réservation de sortie soustraite du sommet de la fenêtre dans l'échelle = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // écart entre auto et effectiveWindow
const WARN_BUFFER = 20_000; // écart entre warn et auto
const HARD_BUFFER = 3_000; // écart entre hard et effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // seuil du disjoncteur en cas d'échec
```

Origine des valeurs : toutes reprises des valeurs mesurées de claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` est une relation clé : le modèle étant contraint par une limite dure `maxOutputTokens`, la sortie ne peut pas dépasser 20K, donc la réserve n'a pas besoin de marge de sécurité supplémentaire. Note : cette égalité est valide après désactivation du mode réflexion (tout le budget de sortie est alloué au résumé) ; si le mode réflexion est conservé, `thinking + summary` partagent le budget (sémantique du SDK Gemini / de la plupart des fournisseurs pour `maxOutputTokens`), le modèle répartit lui-même entre les deux, et l'espace réel disponible pour le résumé est inférieur à 20K (voir « Risques et précautions » points 1 et 2).

## Fonction de calcul

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // lorsque hard < auto, égal à auto (dégradation pour petites fenêtres)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // pour petites fenêtres, dégénère en auto

  return { warn, auto, hard, effectiveWindow };
}
```
### 实测数据

| Fenêtre | warn        | auto        | hard         | Remarques                        |
| ------- | ----------- | ----------- | ------------ | -------------------------------- |
| 32K     | 19.2K (pct) | 22.4K (pct) | 22.4K (régr.)| Seuil proportionnel              |
| 64K     | 38.4K (pct) | 44.8K (pct) | 44.8K (régr.)| Seuil proportionnel              |
| 128K    | 76.8K (pct) | 95K (abs)   | 105K (abs)   | Mixte (warn=pct, auto/hard=abs) |
| 200K    | 147K (abs)  | 167K (abs)  | 177K (abs)   | Valeur absolue exclusive         |
| 256K    | 203K (abs)  | 223K (abs)  | 233K (abs)   | Valeur absolue exclusive         |
| 1M      | 947K (abs)  | 967K (abs)  | 977K (abs)   | Tout en valeur absolue           |

`(pct)` signifie que la valeur est déterminée par un ratio, `(abs)` par une valeur absolue.

## Configuration utilisateur

### Modifications de ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Conservation (hors sujet, utilisé par compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Suppression :** du champ `contextPercentageThreshold`. Raisons :

1. Avec la nouvelle formule, ce champ n'a presque aucun impact pour les fenêtres courantes (>= 128K) — les valeurs absolues prennent le relais
2. Sur les petites fenêtres, la configuration utilisateur pourrait au contraire déclencher une compression « plus précoce », ce qui va à l'encontre de l'intuition d'économie de tokens
3. claude-code n'expose pas ce champ, il n'y a pas de précédent de configuration utilisateur similaire

### Gestion de la rupture (breaking change)

**Côté utilisateur :** Au démarrage, lors du chargement de `Config`, si `chatCompression.contextPercentageThreshold` est présent :

- Écrire un avertissement sur stderr : `"chatCompression.contextPercentageThreshold a été supprimé et est désormais contrôlé par des seuils intégrés."`
- **Ne pas** générer d'erreur, **ne pas** bloquer le démarrage
- La valeur du champ est ignorée

**Côté SDK (R5.4) :** Le champ `hasFailedCompressionAttempt: boolean` de `CompressOptions` est renommé en `consecutiveFailures: number`. Deux différences :

|      | Ancien champ                  | Nouveau champ                                                        |
| ---- | ----------------------------- | -------------------------------------------------------------------- |
| Nom  | `hasFailedCompressionAttempt` | `consecutiveFailures`                                                |
| Type | `boolean`                     | `number`                                                             |
| Sens | `true` = désactive définitivement l'auto-compact | `>= MAX_CONSECUTIVE_FAILURES` (par défaut 3) = désactive temporairement jusqu'à un forçage réussi |

Seul un consommateur interne (`GeminiChat.tryCompress`) est concerné, donc la migration interne présente peu de risques ; mais `@qwen-code/qwen-code-core` est un package publié, `CompressOptions` est visible dans les fichiers d.ts, et le code des SDK descendants qui appelle directement `service.compress({ ..., hasFailedCompressionAttempt: true })` générera une erreur de compilation TypeScript. **Guide de migration :** Remplacez `true` par `MAX_CONSECUTIVE_FAILURES` (ou tout entier >= 3), et `false` par `0`. Si l'appelant gère son propre compteur d'échecs, transmettez-le directement.

## Compensation d'estimation des tokens

`lastPromptTokenCount` dans qwen-code provient de `usageMetadata.totalTokenCount` de la réponse API précédente ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Cela entraîne :

1. **Un décalage d'un tour :** le cheap-gate utilise `lastPromptTokenCount` pour juger, mais le prompt réel envoyé ce tour = ce dernier + le message utilisateur actuel. La partie manquante peut rendre le jugement de seuil faux négatif.
2. **Valeur initiale à 0 :** la valeur initiale est 0, donc au premier envoi, aucun seuil n'est déclenché quelle que soit la taille de l'historique (y compris les scénarios de reprise avec `--continue` ou de sous-agent hérité).

Introduction d'une fonction d'estimation locale légère `estimatePromptTokens` pour compenser ces deux lacunes avant l'envoi, lors des jugements de cheap-gate / hard :

```ts
// chatCompressionService.ts (ou nouveau fichier packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // Estimation générique char/4 (identique à claude-code)
const BYTES_PER_TOKEN_JSON = 2; // Entrées JSON/tool_call plus denses

/**
 * Estime le nombre de tokens d'un ensemble de Content, pour compenser le décalage des métadonnées d'utilisation de l'API.
 * Pour les images / documents, réutilise imageTokenEstimate existant (par défaut 1600).
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Réutilise estimateContentChars (compactionInputSlimming.ts), puis divise par bytesPerToken
  // En interne, pour functionCall / functionResponse, utilise BYTES_PER_TOKEN_JSON
  // ...
}

/**
 * Point d'entrée unifié pour les jugements de cheap-gate et hard.
 * Chemin principal : lastPromptTokenCount correct + estimation du message utilisateur actuel
 * Chemin du premier tour : estimation de l'historique complet
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
): number {
  if (lastPromptTokenCount > 0) {
    return lastPromptTokenCount + estimateContentTokens([userMessage]);
  }
  return estimateContentTokens([...history, userMessage]);
}
```

Emplacements d'application :

- Cheap-gate de `chatCompressionService.compress()` : remplacer la source de `originalTokenCount` par `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- Jugement hard à l'entrée de `geminiChat.sendMessageStream` (voir section suivante)

**L'estimation est utilisée uniquement pour déclencher *plus tôt*, jamais pour *sauter* un déclenchement.** Car le ratio char/4 est une estimation grossière par le bas, ce qui est du côté « faux positif » (mieux vaut compresser un peu trop tôt) ; un « faux négatif » serait peu fiable.

## Modifications de la chaîne de déclenchement

### chatCompressionService.ts

1. **Exportation de `computeThresholds`** pour réutilisation par le cheap-gate, l'interface utilisateur, les commandes
2. **Cheap-gate de `compress()`** (lignes 221-249) :
   ```ts
   if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
     return NOOP;
   }
   const { auto } = computeThresholds(contextLimit);
   const effectiveTokens = estimatePromptTokens(
     curatedHistory,
     userMessage,
     originalTokenCount,
   );
   if (!force && effectiveTokens < auto) return NOOP;
   ```
3. **Appel à `runSideQuery` dans `compress()`** (lignes 356-380) : désactiver le thinking + ajouter `maxOutputTokens` :

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // Désactive le thinking (identique à claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // Limite supérieure à 20K
     },
     // ...
   });
   ```

   Ou supprimez simplement `thinkingConfig` pour que la valeur par défaut de `runSideQuery` ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) par défaut `includeThoughts: false`) prenne le relais.
Après la désactivation du thinking, `maxOutputTokens` contraint directement la sortie totale (il n'y a pas de budget de thinking distinct), donc `SUMMARY_RESERVE = maxOutput = 20K` est une relation dure et propre.

Mettez également à jour le commentaire dans [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) de « Compression quality drives every subsequent main turn — keep reasoning on » vers « Pour garantir une limite de sortie prévisible entre les fournisseurs, alignée avec la conception de claude-code ».

Le commentaire sur le token math ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) « may include non-persisted tokens (thoughts) » peut également être nettoyé en même temps.

### geminiChat.ts : point d'entrée `sendMessageStream` (ligne 562)

```ts
// Avant remplacement : tryCompress(force=false)
// Après remplacement : estimation des tokens pour déterminer si le seuil hard est atteint, ce qui définit le flag force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Réinitialise le circuit breaker, équivalent à un force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Amélioration de la gestion des échecs (`geminiChat.ts:504-510`)

```ts
// Avant remplacement
hasFailedCompressionAttempt: boolean;

// Après remplacement
consecutiveFailures: number;  // Par défaut 0

// Branche d'échec
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Branche de succès
this.consecutiveFailures = 0;
```

Un échec lors d'un appel `force=true` n'est pas compté (maintient la sémantique actuelle où le mode reactive/manual ne « consomme pas de quota »).

## Modifications de l'interface utilisateur

### Réécriture de trois tips context-\* dans tipRegistry.ts

Les trois seuils correspondent exactement aux trois tips. Correspondance (par nombre de tokens, du plus bas au plus haut) :

| ID du Tip          | Condition actuelle                              | Nouvelle condition                                                     | Changement de texte                                                                  |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5`   | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`    | Inchangé                                                                             |
| `context-high`     | `pct >= 80 && < 95`                             | `tokenCount >= auto && tokenCount < hard`                              | Inchangé                                                                             |
| `context-critical` | `pct >= 95`                                     | `tokenCount >= hard`                                                   | Ajout d'une phrase : « Auto-compact will force on next send. » pour refléter le nouveau comportement du seuil hard |

**Impact sur la fréquence de déclenchement :**

- Chemin principal (auto fonctionne correctement) : `tokenCount` dépasse auto, la compression se déclenche immédiatement, au tour suivant `tokenCount` redescend, donc `context-high` n'est visible que brièvement entre le déclenchement et l'application de la compression.
- Chemin marginal (échec auto / circuit breaker / réactif trop lent) : `tokenCount` continue d'augmenter, traverse successivement warn → auto → hard, déclenchant les trois tips, cohérent avec la perception par l'utilisateur d'un contexte de plus en plus tendu.
- Lorsque `context-critical` se déclenche, le hard a déjà forcé la compression avant l'envoi (voir la section sur les modifications du déclenchement de la spec), donc ce tip est en fait une « notification post-sauvetage » plutôt qu'un « avertissement pré-sauvetage ». Le texte ajouté explique cela.

L'interface `TipContext` s'enrichit de :

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Nouveau : permet à la fonction isRelevant d'accéder aux seuils.
  // computeThresholds est calculé et injecté par l'appelant pour éviter que tipRegistry dépende directement de core.
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` injecte les seuils en même temps qu'il construit le `TipContext`.

### Synchronisation de la commande /context (`contextCommand.ts:177-183`)

```ts
// Remplacement du calcul codé en dur (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Affiche quatre lignes :
//   Fenêtre effective :   180K   (window − 20K reserve)
//   Seuil d'avertissement :     147K   (...)
//   Seuil automatique :     167K   ← Position actuelle
//   Seuil dur :     177K
// Marque le niveau dans lequel se situe le nombre actuel de tokens
```

### Indicateur continu dans le footer (optionnel, follow-up)

Cette spec n'impose pas la mise en œuvre d'un indicateur continu dans le footer. Raison :

- Le système de tips existant peut déjà fournir des indications dans l'historique.
- Un indicateur continu dans le footer nécessite de modifier le rendu ink et d'augmenter la fréquence de rafraîchissement.
- Cela peut faire l'objet d'un follow-up après cette spec (PR indépendante).

Si cela est fait plus tard, la condition de déclenchement suggérée est `tokenCount >= warn && tokenCount < auto`. Passé auto, l'indicateur serait masqué (la compression a commencé).

## Couverture des tests

### Tests unitaires (chatCompressionService.test.ts)

- `computeThresholds(32K)` → Branche de repli proportionnel (warn/auto en pourcentage, hard dégradé)
- `computeThresholds(128K)` → Branche mixte (warn en pct, auto en abs, hard en abs)
- `computeThresholds(200K)` → Branche à seuil absolu (warn/auto/hard tous en abs)
- `computeThresholds(1M)` → Branche entièrement absolue
- `computeThresholds(window=10K)` → Fenêtre très petite (absolu négatif), la formule ne plante pas
- Les trois seuils respectent toujours `warn <= auto <= hard`
- La fonction max() est stable aux points de jonction (pct * window == abs)

### Tests unitaires (tokenEstimation.test.ts)

- `estimateContentTokens` pour du texte pur / json / functionCall / functionResponse / image / document : chaque type utilise le bytesPerToken correspondant
- `estimatePromptTokens` quand `lastPromptTokenCount > 0` emprunte le « chemin principal », quand il est égal à 0 emprunte le « chemin du premier tour »
- Un message utilisateur volumineux, ajouté pendant la phase de cheap-gate, peut franchir le seuil auto
- L'écart entre l'estimation et l'utilisation réelle de l'API est inférieur à ±30 % (régression sur des échantillons d'historique réels)

### Tests d'intégration (geminiChat.test.ts / chatCompressionService.test.ts)

- Après 3 échecs consécutifs, le cheap-gate est NOOP ; le prochain force rétablit la situation
- Un échec unique ne verrouille plus définitivement
- Le dépassement du seuil hard par l'estimation déclenche un force compress automatique lors de l'envoi
- L'appel à la compression sideQuery avec `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` est correctement transmis à `runSideQuery`, `thinkingConfig.includeThoughts` est à `false` (ou pris en charge par la valeur par défaut de sideQuery)
- **Couverture du premier tour** : construction d'un chat avec `lastPromptTokenCount = 0` mais un historique volumineux (simulant une reprise avec `--continue`). Lors du premier envoi, le seuil auto peut être déclenché via le chemin d'estimation.
### Tests de compatibilité

- Définir `contextPercentageThreshold = 0.5` au démarrage → avertissement stderr + champ ignoré, le comportement utilise la constante PCT interne

### Tests du système Tip (tipRegistry.test.ts)

- Trois tip context-\* se déclenchent correctement lors des transitions warn/auto/hard, et leurs intervalles ne se chevauchent pas
- Sur le chemin principal, une fois le seuil auto déclenché et la compression effectuée, `context-high` ne reste pas visible
- Sur le chemin marginal (fusible + augmentation continue des tokens), les trois tip se déclenchent séquentiellement
- Comportement raisonnable quand `thresholds` est absent dans TipContext (fallback)

## Implémentation par phases

| Phase | Contenu                                                                                                  | Indépendance       |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| 1     | Constantes internes + `computeThresholds` + modifications cheap-gate (sans compensation d'estimation)   | Fusion indépendante |
| 2     | Amélioration de la gestion des échecs (1 → 3 fusibles)                                                   | Fusion indépendante |
| 3     | Compression forcée anticipée pour la couche hard                                                         | Dépend de P1 + P7  |
| 4     | Changements côté configuration + avertissement de breaking change                                        | Dépend de P1        |
| 5     | UI (réécriture des tip + /context)                                                                       | Dépend de P1        |
| 6     | Désactiver le mode « thinking » dans sideQuery pour la compression + ajouter une limite `maxOutputTokens` | Indépendant, peut être livré avant P1 |
| 7     | Compensation d'estimation des tokens (`estimateContentTokens` + `estimatePromptTokens`, appliquée à cheap-gate / hard) | Indépendant, peut être parallélisé à P1 |

Chaque Phase peut être une PR indépendante. Ordre de fusion recommandé **P6 → P7 → P1 → P2 → P4 → P3 → P5** : d'abord appliquer une limite `maxOutputTokens` aux appels de compression (rendre l'hypothèse de buffer fiable) ; puis ajouter la compensation d'estimation (rendre le comptage des tokens plus fiable) ; ensuite mettre en place l'infrastructure de seuils ; puis faire le fusible d'échec et les changements de configuration ; enfin activer la couche hard proactive de sauvetage (à ce stade nous avons un comptage de tokens fiable + un fusible). Chaque PR peut être validée et annulée indépendamment.

## Risques et points d'attention

1. **Désactiver le mode « thinking » peut affecter la qualité des résumés.** Le commentaire original « Compression quality drives every subsequent main turn — keep reasoning on » exprimait cette préoccupation. Ce spec considère qu'une « limite de tokens prévisible » prime sur la « qualité maximale », mais après déploiement, il faudra observer dans la télémétrie la distribution de `compression_input_token_count` / `compression_output_token_count`, ainsi que l'évolution de la qualité des tours principaux après compression (retours utilisateurs, taux de `COMPRESSION_FAILED_*`). En cas de baisse significative de qualité, envisager un retour au mode thinking activé avec un `thinkingBudget` spécifique au provider.

2. **Atteindre la limite `maxOutputTokens` peut tronquer le résumé.** Une fois le thinking désactivé, la limite de 20K s'applique directement au corps du résumé ; pour claude-code le p99.99 mesuré est ≈ 17K, laissant ~3K de marge de sécurité. Mais le prompt de compression de qwen-code diffère de celui de claude-code, la distribution doit être observée. Il est recommandé d'ajouter dans la branche d'échec de compression ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) un chemin NOOP lorsqu'un `finish_reason = MAX_TOKENS` est détecté, afin d'éviter de persister un résumé tronqué.

3. **Différences de mappage de `maxOutputTokens` entre providers.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. qwen-code possède déjà ce mappage ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) etc.), il faudra vérifier lors de l'implémentation de P6 que le champ `maxOutputTokens` est bien propagé dans le corps de requête de tous les providers pour le chemin sideQuery.

4. **L'estimation des tokens est une borne inférieure grossière et ne doit pas être utilisée en sens inverse pour « sauter le déclenchement ».** La formule `char/4` peut dévier de ±30% par rapport au tokenizer réel de chaque provider. Ce spec utilise l'estimation uniquement pour « déclencher le seuil plus tôt » (direction false-positive, mieux vaut compresser trop tôt que trop tard). Tous les chemins de code qui « réduisent le comptage / sautent la compression » doivent encore utiliser `lastPromptTokenCount` (valeur faisant autorité de l'API).

5. **Relation entre la fonction d'estimation et `estimateContentChars` existante.** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) contient déjà `estimateContentChars` (utilisée pour le calcul des points de split de compression). La nouvelle `estimateContentTokens` doit la réutiliser (en divisant par bytesPerToken) plutôt que d'en écrire une nouvelle, pour éviter une divergence entre les deux métriques d'estimation.

## Hors du périmètre de ce spec

- Canal de remplacement par variable d'environnement (schéma D) : maintenir le principe de « configuration minimale »
- Visualisation permanente du footer : réservée pour un suivi ultérieur
- Amélioration des prompts de résumé, ajustement de `MIN_COMPRESSION_FRACTION` : orthogonal à la conception des seuils

## Questions ouvertes (en attente de review)

1. **Intensité du breaking change** : avertissement + champ ignoré vs erreur au démarrage. Actuellement nous choisissons l'avertissement, besoin de confirmation que c'est suffisamment convivial pour les déploiements/équipes de configuration

## Clos

2. **Petite fenêtre (≤ ~76.7K) : hard et auto dégénèrent en la même valeur** — Décision : **ne pas l'indiquer explicitement dans `/context`**. Raison :
   - L'effondrement ne concerne pas que 32K, toutes les fenêtres où `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` sont concernées (y compris 64K)
   - Le comportement utilisateur reste inchangé : sur une fenêtre effondrée, `currentTier` saute `'auto'` et indique directement `'hard'` (`contextCommand.ts:43-44` vérifie d'abord `>= hard`), la bande `context-high` (`auto ≤ t < hard`) devient vide. Moins d'un palier d'indication sur une petite fenêtre est raisonnable — la fenêtre étant petite, l'utilisateur gère probablement le contexte manuellement
   - Si de vrais utilisateurs signalent à l'avenir qu'ils ne voient pas l'indication du palier intermédiaire sur une petite fenêtre, on pourra alors décider d'ajouter un marquage UI ou d'ajuster les conditions de déclenchement de `context-high` (c'est un travail UI, pas un travail de spec). Pour l'instant, nous choisissons de ne pas augmenter la complexité de l'UI.
