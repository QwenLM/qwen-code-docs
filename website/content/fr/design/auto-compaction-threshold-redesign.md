# Refonte du seuil d'auto-compaction

**Statut :** Brouillon · 2026-05-14

## Contexte

> Cette section décrit l'état **avant** l'implémentation de cette PR (comportement pré-refonte). Les références suivantes — `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt`, et les citations fichier:ligne — correspondent au code avant la fusion de la PR #4345. Après fusion, ces symboles/numéros de ligne ne seront plus valables.

L'auto-compression actuelle de qwen-code utilise un seul seuil proportionnel `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), partagé par toutes les tailles de fenêtre. Par rapport à l'« échelle de jetons absolue » de claude-code (`autoCompact.ts:62-65`), qwen-code présente trois problèmes concrets :

1. **Réservation excessive dans les grandes fenêtres** : pour un modèle 1M, le seuil à 70 % se déclenche à 700K, laissant 300K restants, bien au-delà des ~33K réellement nécessaires pour le résumé + la sortie.
2. **Verrouillage permanent après 1 échec** : une fois `hasFailedCompressionAttempt = true`, le session entier n'essaie plus l'auto-compact (`geminiChat.ts:504`), plus strict que le « fusible 3 échecs consécutifs » de claude-code.
3. **Découplage du système de tips et du seuil auto** : les trois tips `context-*` dans `tipRegistry.ts` utilisent des pourcentages fixes 50/80/95%, totalement indépendants du seuil auto (70 %). Cela implique que les tips à 80 % / 95 % se déclenchent très rarement sur le chemin normal (auto fonctionne), mais sur les chemins périphériques (échec auto / rattrapage réactif) ils manquent de sémantique alignée avec le seuil.
4. **L'appel de compression lui-même n'a pas de contrôle de budget de sortie** : [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) active explicitement `thinkingConfig.includeThoughts = true` (commentaire : « Compression quality drives every subsequent main turn »), tandis que l'appel sideQuery n'a pas de limite `maxOutputTokens`. Le commentaire du code ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) reconnaît également que `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Lorsque la compression approche du sommet de la fenêtre, la sortie totale peut gonfler, rendant la réservation du buffer imprévisible.
    
   Pire encore, le comportement varie selon les fournisseurs : le thinking budget d'Anthropic est totalement indépendant de max_tokens ; les reasoning tokens d'OpenAI ne sont pas limités par max_completion_tokens ; le comportement de Gemini varie selon la version du modèle. Cela signifie qu'« ajouter simplement maxOutputTokens pour contrôler la sortie totale » ne fonctionne pas dans un projet multi-fournisseurs comme qwen-code.

5. **Le jugement du seuil utilise `lastPromptTokenCount`, systématiquement sous-estimé.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) montre que cette valeur provient de `usageMetadata.totalTokenCount` de la réponse API précédente. Deux écarts : (a) elle n'inclut pas le message utilisateur qui sera ajouté dans ce tour-ci, donc chaque vérification cheap-gate traite un prompt plus petit que la réalité ; (b) la valeur initiale est 0, donc la première envoi avec `--continue` restaurer un large historique / sub-agent héritant de beaucoup d'historique ignore tous les seuils. Comparé à `tokenCountWithEstimation` de claude-code ([query.ts:638](src/query.ts:638)) qui suit une approche double piste (dernier usage assistant API + estimation des messages ajoutés après), ce qui ferme ces deux écarts.

## Objectifs de conception

- Introduire un seuil hybride « proportionnel + absolu », permettant aux grands modèles fenêtrés d'être régis par la valeur absolue, tandis que les petites fenêtres conservent une sécurité proportionnelle.
- Ajouter deux niveaux warn / hard (auto restant le point de déclenchement principal), formant une échelle à trois niveaux.
- Réécrire le système de tips pour qu'ils suivent les nouveaux seuils.
- Faire passer la gestion des échecs de « 1 échec → verrouillage permanent » à « fusible de 3 échecs + rétablissement automatique ».
- **Fermer le thinking dans l'appel de compression et ajouter une limite `maxOutputTokens`** : alignement avec claude-code, pour que la sortie totale soit contrainte par un seul paramètre et que le budget du buffer soit prévisible ; accepter une possible dégradation de la qualité de compression.
- **Ajouter une compensation d'estimation de tokens** : éliminer les deux biais systématiques de `lastPromptTokenCount` (« décalage d'un tour » et « initialement 0 ») pour que le jugement du seuil soit plus proche de la taille réelle du prompt.
- Supprimer l'entrée de configuration `contextPercentageThreshold` des paramètres (la constante PCT interne est conservée).
- **Ne pas introduire** de canal de surcharge via variable d'environnement, **ne pas ajouter** de commutateur enabled explicite.

## Échelle à trois niveaux de seuils

```
                       window  (fenêtre de contexte brute)
                          │
                          │  ← SUMMARY_RESERVE = 20K
                          ▼
                    effectiveWindow
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

| Niveau    | Condition de déclenchement            | Comportement                                                                                                                                   |
| --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **warn**  | `tokenCount >= warn_threshold`        | Indication UI « X tokens restants avant auto-compression », ne change pas le comportement d'envoi.                                             |
| **auto**  | `tokenCount >= auto_threshold`        | Avant l'envoi, `tryCompress(force=false)`, processus de compression normal.                                                                    |
| **hard**  | `tokenCount >= hard_threshold`        | Avant l'envoi, `tryCompress(force=true)`, réinitialise le verrou d'échec et force la compression.                                             |

Le niveau `hard` équivaut à anticiper la logique de rattrapage réactive actuelle (`geminiChat.ts:711`) avant l'envoi, évitant ainsi un aller-retour coûteux avec une requête oversize ayant échoué.

## Constantes internes

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // seuil proportionnel auto de repli
const WARN_PCT_OFFSET = 0.1; // seuil warn proportionnel = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // limite dure de sortie pour la sideQuery de compression (thinking + résumé cumulés)
const SUMMARY_RESERVE = 20_000; // réservation de sortie soustraite du haut de la fenêtre = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // espacement entre auto et effectiveWindow
const WARN_BUFFER = 20_000; // espacement entre warn et auto
const HARD_BUFFER = 3_000; // espacement entre hard et effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // seuil de fusible d'échec
```

Valeurs issues : toutes reprises des mesures réelles de claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` est une relation clé : le modèle est contraint par la limite dure `maxOutputTokens`, la sortie ne peut pas dépasser 20K, donc la réservation n'a pas besoin de marge de sécurité supplémentaire. Note : cette relation est vraie lorsque le thinking est désactivé (tout le budget de sortie va au résumé). Si le thinking est conservé, `thinking + résumé` partagent le budget (sémantique `maxOutputTokens` du SDK Gemini / de la plupart des fournisseurs), le modèle répartit entre les deux, donc l'espace réel disponible pour le résumé est inférieur à 20K (voir les risques et précautions, points 1 et 2).

## Fonction de calcul

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // lorsque hard < auto, égal à auto (dégradation petite fenêtre)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // sous dégradation pour les petites fenêtres

  return { warn, auto, hard, effectiveWindow };
}
```

### Données mesurées

| Fenêtre | warn        | auto        | hard         | Remarque                        |
| ------- | ----------- | ----------- | ------------ | ------------------------------- |
| 32K     | 19.2K (pct) | 22.4K (pct) | 22.4K (dég.) | Repli proportionnel             |
| 64K     | 38.4K (pct) | 44.8K (pct) | 44.8K (dég.) | Repli proportionnel             |
| 128K    | 76.8K (pct) | 95K (abs)   | 105K (abs)   | Hybride (warn=pct, auto/hard=abs) |
| 200K    | 147K (abs)  | 167K (abs)  | 177K (abs)   | Prise en charge absolue          |
| 256K    | 203K (abs)  | 223K (abs)  | 233K (abs)   | Prise en charge absolue          |
| 1M      | 947K (abs)  | 967K (abs)  | 977K (abs)   | Tout absolu                     |

`(pct)` signifie que le niveau est déterminé par la formule proportionnelle, `(abs)` par la formule absolue.

## Configuration utilisateur

### Modifications de ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Conservé (sans rapport avec cette refonte, utilisé par compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Suppression :** le champ `contextPercentageThreshold`. Raisons :

1. Avec la nouvelle formule, pour les fenêtres courantes (>= 128K), ce champ n'a quasiment aucun effet — la valeur absolue prend le relais.
2. Sur les petites fenêtres, la configuration utilisateur pourrait paradoxalement déclencher la compression plus tôt, contraire à l'intuition d'économiser des tokens.
3. claude-code n'expose pas ce champ, il n'existe pas de précédent de configuration similaire côté utilisateur.

### Gestion du breaking change

**Côté utilisateur :** lors du démarrage, la `Config` détecte la présence de `chatCompression.contextPercentageThreshold` :

- écrit un avertissement sur stderr : `"chatCompression.contextPercentageThreshold a été supprimé et est désormais contrôlé par des seuils intégrés."`
- **Ne pas** générer d'erreur, **ne pas** bloquer le démarrage.
- La valeur du champ est ignorée.

**Côté SDK (R5.4) :** le champ `hasFailedCompressionAttempt: boolean` de `CompressOptions` est renommé en `consecutiveFailures: number`. Deux différences :

|     | Ancien champ                 | Nouveau champ                                              |
| --- | ---------------------------- | ---------------------------------------------------------- |
| Nom | `hasFailedCompressionAttempt`| `consecutiveFailures`                                      |
| Type| `boolean`                    | `number`                                                   |
| Sém | `true` = auto-compact désactivé définitivement | `>= MAX_CONSECUTIVE_FAILURES` (par défaut 3) = désactivé temporairement jusqu'à un force réussi |

Seul `GeminiChat.tryCompress` est consommateur interne dans le dépôt, donc la migration interne est à faible risque ; mais `@qwen-code/qwen-code-core` est un package publié, `CompressOptions` est visible dans les `.d.ts`, donc le code des SDK clients appelant directement `service.compress({ ..., hasFailedCompressionAttempt: true })` obtiendra une erreur de compilation TypeScript. **Guide de migration :** remplacer `true` par `MAX_CONSECUTIVE_FAILURES` (ou tout entier >= 3), `false` par `0`. Si l'appelant maintient son propre compteur d'échecs, il peut directement le passer.

## Compensation d'estimation de tokens

`lastPromptTokenCount` de qwen-code provient de `usageMetadata.totalTokenCount` de la réponse API précédente ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Cela entraîne :

1. **Décalage d'un tour :** le cheap-gate utilise `lastPromptTokenCount` pour juger, mais le prompt réel de cet envoi = `lastPromptTokenCount` + message utilisateur de ce tour. Les tokens sous-estimés peuvent rendre le jugement du seuil faux-négatif.
2. **Initialement 0 :** la valeur initiale est 0, donc le premier envoi (même avec `--continue` ou héritage d'historique par sub-agent) ignore tous les seuils.

Introduction d'une fonction d'estimation locale légère `estimatePromptTokens` pour compenser ces deux lacunes avant l'envoi (cheap-gate / hard) :

```ts
// chatCompressionService.ts (ou nouveau fichier packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // estimation générique char/4 (identique à claude-code)
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input plus dense

/**
 * Estime le nombre de tokens d'un ensemble de Content, pour compenser
 * le décalage des métadonnées d'usage API.
 * Pour les images / documents, réutilise imageTokenEstimate existant (défaut 1600).
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Réutilise estimateContentChars (compactionInputSlimming.ts), puis divise par bytesPerToken
  // En interne, utilise BYTES_PER_TOKEN_JSON pour functionCall / functionResponse
  // ...
}

/**
 * Point d'entrée unifié pour le cheap-gate et le jugement hard.
 * Chemin principal : lastPromptTokenCount précis + estimation du message utilisateur de ce tour
 * Chemin initial : estimation complète de l'historique
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

Points d'application :

- Au cheap-gate de `chatCompressionService.compress()` : remplacer la source `originalTokenCount` par `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`.
- À l'entrée `geminiChat.sendMessageStream` pour le jugement hard (voir section suivante).

**L'estimation ne sert qu'à déclencher plus tôt, pas à sauter le déclenchement.** Comme char/4 est une estimation basse grossière, elle est sûre du côté faux-positif (mieux vaut compresser un peu trop tôt), mais peu fiable du côté faux-négatif.

## Modifications de la chaîne de déclenchement

### chatCompressionService.ts

1. **Exporter `computeThresholds`** pour réutilisation par cheap-gate / UI / commandes.
2. **`compress()` cheap-gate** (lignes 221-249) :
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
3. **Appel `runSideQuery` dans `compress()`** (lignes 356-380) : désactiver thinking + ajouter `maxOutputTokens` :

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // fermer le thinking (aligné avec claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // limite dure 20K
     },
     // ...
   });
   ```

   Ou simplement supprimer `thinkingConfig` et laisser la valeur par défaut de `runSideQuery` ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) par défaut `includeThoughts: false`) prendre le relais.

   Avec thinking désactivé, `maxOutputTokens` contraint directement la sortie totale (pas de problème de budget thinking séparé), et `SUMMARY_RESERVE = maxOutput = 20K` est une relation propre et dure.

   Mettre également à jour le commentaire de [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374), qui passe de « Compression quality drives every subsequent main turn — keep reasoning on » à une explication indiquant que, pour garantir une limite de sortie prévisible entre fournisseurs, on s'aligne sur la conception de claude-code.

   Le commentaire token math ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) « may include non-persisted tokens (thoughts) » peut également être nettoyé.

### geminiChat.ts : entrée `sendMessageStream` (ligne 562)

```ts
// Avant : tryCompress(force=false)
// Après : utiliser l'estimation pour décider si hard est atteint, déterminer le flag force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Réinitialise le fusible, équivalent à force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Gestion des échecs améliorée (`geminiChat.ts:504-510`)

```ts
// Avant
hasFailedCompressionAttempt: boolean;

// Après
consecutiveFailures: number;  // par défaut 0

// Branche échec
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Branche succès
this.consecutiveFailures = 0;
```

Un échec lors d'un appel `force=true` n'est pas compté (maintien de la sémantique actuelle : le réactif / manuel ne « consomme » pas de droits).

## Modifications UI

### Réécriture des trois tips context-* dans tipRegistry.ts

Les trois niveaux de seuils correspondent exactement aux trois tips. Correspondance (par ordre croissant de tokens) :

| ID du tip          | Condition actuelle                              | Nouvelle condition                                                            | Changement de texte                                                                 |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5`   | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`          | Inchangé                                                                             |
| `context-high`     | `pct >= 80 && < 95`                             | `tokenCount >= auto && tokenCount < hard`                                    | Inchangé                                                                             |
| `context-critical` | `pct >= 95`                                     | `tokenCount >= hard`                                                          | Ajouter « L'auto-compact forcera au prochain envoi. » pour refléter le nouveau comportement du niveau hard. |

**Impact sur la fréquence de déclenchement :**

- Chemin principal (auto fonctionne) : `tokenCount` dépasse auto puis déclenche immédiatement la compression, le `tokenCount` du tour suivant retombe, donc `context-high` n'est visible que brièvement entre le déclenchement et l'effet de la compression.
- Chemin périphérique (échec auto / fusible / réactif pas assez rapide) : `tokenCount` continue d'augmenter, traversant successivement warn → auto → hard, déclenchant les trois tips, cohérent avec la perception utilisateur d'un contexte de plus en plus serré.
- Quand `context-critical` se déclenche, le niveau hard a déjà forcé la compression avant envoi (spécification de la section modifications chaîne de déclenchement), donc ce tip est en réalité une « notification post-sauvetage » plutôt qu'un « avertissement pré-sauvetage ». Le texte ajoute une phrase explicative.

L'interface `TipContext` est enrichie :

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Nouveau : permet à la fonction isRelevant d'accéder aux seuils.
  // computeThresholds est calculé par l'appelant et injecté, pour éviter une dépendance directe de tipRegistry sur le core.
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` construit `TipContext` en synchronisation.

### Synchronisation de la commande `/context` (`contextCommand.ts:177-183`)

```ts
// Remplacer la valeur codée en dur (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Afficher quatre lignes :
//   Fenêtre effective :   180K   (fenêtre − 20K réserve)
//   Seuil warn :          147K   (...)
//   Seuil auto :          167K   ← position actuelle
//   Seuil hard :          177K
// Marquer dans quel tier se situe le tokenCount actuel
```

### Indication continue dans le footer (optionnel, follow-up)

Cette spécification n'impose pas d'indication continue dans le footer. Raisons :

- Le système de tips existant peut déjà donner des indications dans l'historique.
- Une indication continue nécessite de modifier le rendu ink et augmente la fréquence de rafraîchissement.
- Cela peut être traité en follow-up après cette spécification (PR indépendante).

Si réalisée plus tard, la condition suggérée est `tokenCount >= warn && tokenCount < auto` ; après dépassement de auto, masquer (la compression a commencé).

## Couverture des tests

### Tests unitaires (chatCompressionService.test.ts)

- `computeThresholds(32K)` → branche repli proportionnel (warn/auto tous deux pct, hard dégradé).
- `computeThresholds(128K)` → branche hybride (warn=pct, auto=abs, hard=abs).
- `computeThresholds(200K)` → branche prise en charge absolue (warn/auto/hard tous abs).
- `computeThresholds(1M)` → branche tout absolu.
- `computeThresholds(window=10K)` → fenêtre très petite (absolu négatif), la formule ne plante pas.
- Les trois seuils respectent toujours `warn <= auto <= hard`.
- Les formules max() sont stables au point limite (pct * window == abs).

### Tests unitaires (tokenEstimation.test.ts)

- `estimateContentTokens` pour texte pur / json / functionCall / functionResponse / image / document, chacun avec le bytesPerToken correspondant.
- `estimatePromptTokens` en `lastPromptTokenCount > 0` suit le « chemin principal », à 0 suit le « chemin initial ».
- Un grand message utilisateur ajouté au cheap-gate permet de franchir le seuil auto.
- L'écart entre l'estimation et l'usage API réel est inférieur à ±30 % (validé avec des échantillons d'historique réels).

### Tests d'intégration (geminiChat.test.ts / chatCompressionService.test.ts)

- Après 3 échecs consécutifs, cheap-gate NOOP ; le prochain `force` rétablit.
- Un seul échec ne verrouille plus définitivement.
- Le dépassement du seuil hard estimé déclenche automatiquement un force compress avant envoi.
- L'appel sideQuery de compression transmet correctement `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` à `runSideQuery`, et `thinkingConfig.includeThoughts` est `false` (ou pris en charge par la valeur par défaut de sideQuery).
- **Couverture du premier envoi** : créer un chat avec `lastPromptTokenCount = 0` mais un historique volumineux (simulant un `--continue`), le premier envoi déclenche le seuil auto via l'estimation.

### Tests de compatibilité

- Démarrer avec `contextPercentageThreshold = 0.5` → avertissement stderr + champ ignoré, le comportement utilise la constante PCT interne.

### Tests du système de tips (tipRegistry.test.ts)

- Les trois tips context-* se déclenchent correctement au franchissement de warn/auto/hard, sans chevauchement.
- Sur le chemin principal, après déclenchement du seuil auto et compression, `context-high` n'est plus visible.
- Sur le chemin périphérique (fusible + token continuant d'augmenter), les trois tips se déclenchent successivement.
- En l'absence de `thresholds` dans `TipContext` (fallback), le comportement est raisonnable.

## Implémentation par phases

| Phase | Contenu                                                                                           | Indépendance            |
| ----- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| 1     | Constantes internes + `computeThresholds` + modifications cheap-gate (sans compensation d'estimation) | Fusionnable indépendamment |
| 2     | Amélioration de la gestion des échecs (1 → 3 fusible)                                             | Fusionnable indépendamment |
| 3     | Anticipation du force compress du niveau hard                                                     | Dépend de P1 + P7       |
| 4     | Modifications configuration + avertissement breaking change                                       | Dépend de P1            |
| 5     | UI (réécriture tips + /context)                                                                   | Dépend de P1            |
| 6     | Fermeture thinking + ajout `maxOutputTokens` dans l'appel de compression sideQuery                | Indépendant, peut précéder P1 |
| 7     | Compensation d'estimation de tokens (`estimateContentTokens` + `estimatePromptTokens`, appliqué à cheap-gate / hard) | Indépendant, peut être parallèle à P1 |

Chaque phase peut faire l'objet d'une PR indépendante. Ordre suggéré de fusion : **P6 → P7 → P1 → P2 → P4 → P3 → P5** : d'abord ajouter la limite `maxOutputTokens` à l'appel de compression (pour que les hypothèses du buffer soient fiables) ; puis ajouter la compensation d'estimation (pour que le jugement sur les tokens soit plus fiable) ; ensuite mettre en place l'infrastructure des seuils ; puis le fusible d'échec, les modifications de configuration ; enfin activer le rattrapage actif du niveau hard (à ce moment, on dispose d'un compteur de tokens fiable et d'un fusible). Chaque PR peut être vérifiée et annulée indépendamment.

## Risques et précautions

1. **La désactivation du thinking peut dégrader la qualité du résumé.** Le commentaire original « Compression quality drives every subsequent main turn — keep reasoning on » exprimait cette inquiétude. Le jugement de cette spécification est que la « limite de tokens prévisible » prime sur la « qualité maximale », mais après déploiement, il faudra observer la distribution de `compression_input_token_count` / `compression_output_token_count` dans la télémétrie, ainsi que la qualité perçue après compression (retours utilisateurs, taux d'état `COMPRESSION_FAILED_*`). Si la baisse de qualité est significative, on pourra envisager de revenir à thinking activé avec un contrôle provider-specific du thinkingBudget.

2. **L'atteinte de `maxOutputTokens` peut tronquer le résumé.** Avec thinking désactivé, 20K limitent directement le résumé ; claude-code mesure p99.99 ≈ 17K, laissant ~3K de marge de sécurité. Mais le prompt de compression de qwen-code diffère de celui de claude-code, la distribution doit être observée. Il est recommandé d'ajouter un chemin NOOP dans la branche d'échec de compression ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) détectant `finish_reason = MAX_TOKENS`, pour éviter de persister un résumé tronqué.

3. **Différences de mappage de `maxOutputTokens` selon les fournisseurs.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. qwen-code dispose déjà de ce mappage ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) etc.), il faut vérifier lors de l'implémentation de P6 que le champ `maxOutputTokens` sur le chemin sideQuery est bien propagé dans le corps de requête de tous les fournisseurs.

4. **L'estimation de tokens est une limite basse grossière, elle ne doit pas être utilisée en sens inverse pour sauter le déclenchement.** L'écart `char/4` avec les tokenizers réels des fournisseurs peut atteindre ±30 %. Cette spécification n'utilise l'estimation que pour « déclencher plus tôt » (direction faux-positif, mieux vaut compresser tôt que tard). Tous les chemins de code qui « réduisent le compteur de tokens / sautent la compression » doivent encore utiliser `lastPromptTokenCount` (valeur autoritaire de l'API).

5. **Relation entre la fonction d'estimation et `estimateContentChars` existante.** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) contient déjà `estimateContentChars` (utilisé pour le calcul des points de split de compression). La nouvelle `estimateContentTokens` doit la réutiliser (diviser par bytesPerToken) plutôt que d'en écrire une nouvelle, pour éviter une divergence entre les deux mesures.

## Hors périmètre de cette spécification

- Canal de surcharge via variable d'environnement (option D) : maintenir le principe de « configuration minimale ».
- Visualisation résidente dans le footer : réservé pour follow-up.
- Amélioration du prompt de résumé, ajustement de `MIN_COMPRESSION_FRACTION` : orthogonaux à la conception des seuils.

## Questions ouvertes (en attente de review)

1. **Intensité du breaking change** : avertissement + champ ignoré vs erreur au démarrage. Option choisie : avertissement. À confirmer si suffisamment convivial pour les déploiements en entreprise/équipe.

## Clôturé

2. **Sur les petites fenêtres (≤ ~76.7K), hard et auto se replient sur la même valeur** — décision de **ne pas l'indiquer clairement dans `/context`**. Raison :
   - Le repli ne concerne pas seulement 32K : toutes les fenêtres où `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` sont repliées (y compris 64K).
   - Le comportement utilisateur reste le même : sur une fenêtre repliée, `currentTier` saute le niveau `'auto'` et indique directement `'hard'` (`contextCommand.ts:43-44` vérifie d'abord `>= hard`), la bande `context-high` (`auto ≤ t < hard`) devient vide. Une indication en moins sur les petites fenêtres est raisonnable — la fenêtre est de toute façon petite, l'utilisateur gère probablement le contexte manuellement.
   - Si à l'avenir des utilisateurs réels signalent « ne pas voir l'indication intermédiaire sur les petites fenêtres », on pourra décider d'ajouter un marquage UI ou d'ajuster la condition de déclenchement de `context-high` (c'est du travail UI, non de spécification). Pour l'instant, on choisit de ne pas augmenter la complexité UI.