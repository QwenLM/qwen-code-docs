# Plan de mise en œuvre du redesign du seuil d'auto-compaction

> **Pour les agents de travail :** COMPÉTENCE SUBSIDIAIRE REQUISE : Utiliser superpouvoirs:développement-piloté-par-sous-agent (recommandé) ou superpouvoirs:exécution-de-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe (`- [ ]`) pour le suivi.

**Objectif :** Faire passer le seuil simple proportionnel (70 %) de l'auto-compaction de qwen-code à un système à trois niveaux mélangeant « proportion + absolu » (warn / auto / hard), tout en ajoutant une limite `maxOutputTokens` sur l'appel de compression lui-même, en désactivant le thinking, en introduisant un fusible après échecs, en corrigeant le décalage/lacune au premier tour de `lastPromptTokenCount`, et en nettoyant le panneau de configuration utilisateur.

**Architecture :**

- `chatCompressionService.ts` ajoute `computeThresholds(window)` qui produit `{ warn, auto, hard }` ; le cheap-gate utilise `auto`, et l'entrée `sendMessageStream` ajoute un hard pour intervenir proactivement.
- Nouveau `tokenEstimation.ts` fournissant des fonctions d'estimation locales char/4 pour compenser les deux lacunes de `lastPromptTokenCount` : « décalage d'un tour + valeur nulle au premier tour ».
- La gestion des échecs passe d'un verrou ponctuel `hasFailedCompressionAttempt: boolean` à un compteur `consecutiveFailures: number` avec coupure après trois échecs.
- L'appel de compression sideQuery désactive le thinking et ajoute `maxOutputTokens: 20K`.
- Suppression du champ `chatCompression.contextPercentageThreshold` des settings ; au démarrage, un avertissement stderr est émis en cas d'ancienne config et celle-ci est ignorée.
- `tipRegistry.ts` : les trois tip context-* sont réécrites pour suivre les nouveaux seuils ; la commande `/context` affiche les trois valeurs numériques.

**Stack technique :** TypeScript, Vitest, `@google/genai`, outil d'estimation existant `compactionInputSlimming`.

**Ordre de fusion :** P6 → P7 → P1 → P2 → P4 → P3 → P5. Chaque tâche est candidate à une PR individuelle.

---

## Structure des fichiers

| Chemin                                                       | Opération | Responsabilité                                                                                   |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/services/tokenEstimation.ts`              | Création  | Estimation de tokens au niveau caractères + point d'entrée `estimatePromptTokens`                |
| `packages/core/src/services/tokenEstimation.test.ts`         | Création  | Tests unitaires des fonctions d'estimation                                                       |
| `packages/core/src/services/chatCompressionService.ts`       | Modification | Ajout de constantes + `computeThresholds` ; modification du cheap-gate ; désactivation thinking + maxOutput ; modification du compteur d'échecs |
| `packages/core/src/services/chatCompressionService.test.ts`  | Modification | Tests unitaires computeThresholds + assertions cheap-gate / sideQuery config                     |
| `packages/core/src/core/geminiChat.ts`                       | Modification | Entrée `sendMessageStream` ajoute contrôle hard ; `hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                  | Modification | Tests d'intégration déclenchement hard + fusible + couverture premier tour                        |
| `packages/core/src/config/config.ts`                         | Modification | `ChatCompressionSettings` supprime `contextPercentageThreshold` ; warning au démarrage            |
| `packages/cli/src/services/tips/tipRegistry.ts`              | Modification | Les trois tips context-* utilisent désormais une comparaison absolue avec les seuils ; `TipContext` ajoute `thresholds` |
| `packages/cli/src/services/tips/tipRegistry.test.ts`         | Création/Modification | Tests des intervalles de déclenchement des tips                                              |
| `packages/cli/src/ui/commands/contextCommand.ts`             | Modification | Affiche les nouveaux seuils à trois niveaux                                                       |
| `packages/cli/src/ui/commands/contextCommand.test.ts`        | Modification | Snapshot de sortie                                                                                |
| `packages/cli/src/ui/AppContainer.tsx`                       | Modification | Injection de `thresholds` lors de la construction de `TipContext`                                 |

---

## Phase P6 — Compression sideQuery : désactivation thinking + ajout maxOutputTokens

Première implémentation, pour que les hypothèses de seuil ultérieures soient fiables. PR indépendante.

### Tâche 1 : Modifier l'appel sideQuery dans chatCompressionService

**Fichiers :**

- Modification : `packages/core/src/services/chatCompressionService.ts:374-376`
- Modification : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Rédiger le test qui échoue**

Ajouter un point d'accès spy dans l'import en haut de `chatCompressionService.test.ts`, puis ajouter un test dans un describe approprié. `runSideQuery` est déjà exporté depuis le module, donc on peut faire `spyOn` :

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery config', () => {
  it('passe maxOutputTokens=20_000 et includeThoughts=false à runSideQuery', async () => {
    const spy = vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>summary</state_snapshot>',
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
    } as any);

    const service = new ChatCompressionService();
    await service.compress(makeFakeChat(), {
      promptId: 'p',
      force: true,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 180_000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0]![1];
    expect(callArg.config?.thinkingConfig?.includeThoughts).toBe(false);
    expect(callArg.config?.maxOutputTokens).toBe(20_000);
  });
});
```

`makeFakeChat` / `makeFakeConfig` réutilisent les helpers de test existants (s'ils existent déjà dans le fichier, les utiliser ; sinon, faire un stub minimal en ligne).

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'passe maxOutputTokens=20_000'
```

Résultat attendu : ÉCHEC — actuellement, on passe `{ thinkingConfig: { includeThoughts: true } }` et il n'y a pas de `maxOutputTokens`.

- [ ] **Étape 3 : Implémenter — modifier chatCompressionService.ts**

Remplacer toute la section `config:` (lignes [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374)) :

```ts
const summaryResult = await runSideQuery(config, {
  purpose: 'chat-compression',
  model,
  maxAttempts: 1,
  systemInstruction: getCompressionPrompt(),
  contents: [
    ...slim.slimmedHistory,
    {
      role: 'user',
      parts: [
        {
          text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
        },
      ],
    },
  ],
  // La sortie de compression est bornée par maxOutputTokens pour garantir une
  // réserve prévisible entre fournisseurs (voir docs/design/auto-compaction-threshold-redesign.md).
  // Le thinking est désactivé car les sémantiques de thinking-budget par fournisseur sont
  // incohérentes (Anthropic/OpenAI le comptent séparément, Gemini varie selon le modèle).
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

Ajouter dans la zone des constantes en haut du fichier (juste après `TOOL_ROUND_RETAIN_COUNT`) :

```ts
/**
 * Limite maximale sur la sortie de la compression sideQuery (texte du résumé uniquement,
 * puisque le thinking est désactivé). Correspond à MAX_OUTPUT_TOKENS_FOR_SUMMARY
 * de claude-code (autoCompact.ts:30) basé sur le p99.99 des sorties de compaction réelles.
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

En même temps, nettoyer le commentaire dans la section de calcul de tokens de `compress()` (environ ligne 436-437) qui dit `"may include non-persisted tokens (thoughts)"` — il n'y a plus de sortie de thinking maintenant, remplacer par « compressionOutputTokenCount reflète uniquement les tokens du résumé puisque le thinking est désactivé ».

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Résultat attendu : SUCCÈS (nouveau test + tests existants ne doivent pas régresser)

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

Résultat attendu : aucune erreur.

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): limiter la sortie de compression sideQuery et désactiver le thinking

Ajout de COMPACT_MAX_OUTPUT_TOKENS=20_000 et transmission de maxOutputTokens à l'appel
runSideQuery, désactivation de thinkingConfig.includeThoughts. S'aligne sur la réserve
autoCompact de claude-code pour que l'échelle de seuils aval (P1/P3) puisse s'appuyer
sur une limite supérieure prévisible de la sortie de résumé entre fournisseurs
(Anthropic / OpenAI / Gemini gèrent les budgets de thinking de manière incohérente).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P7 — Compensation d'estimation de tokens

Correction du décalage/lacune au premier tour de `lastPromptTokenCount`. 3 tâches.

### Tâche 2 : Créer le module tokenEstimation.ts

**Fichiers :**

- Création : `packages/core/src/services/tokenEstimation.ts`
- Création : `packages/core/src/services/tokenEstimation.test.ts`

- [ ] **Étape 1 : Rédiger le test qui échoue**

`packages/core/src/services/tokenEstimation.test.ts` :

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import {
  estimateContentTokens,
  estimatePromptTokens,
} from './tokenEstimation.js';

const textContent = (text: string): Content => ({
  role: 'user',
  parts: [{ text }],
});

describe('estimateContentTokens', () => {
  it('retourne 0 pour un tableau vide', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('estime un texte simple à ~chars/4', () => {
    // "hello world" = 11 caractères → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('additionne les tokens sur plusieurs messages', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('estime inlineData via imageTokenEstimate', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('estime functionCall (json-dense) à ~chars/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars stringifie ; le JSON résultant est court mais le
    // ratio (chars/2) devrait le rendre >= chemin chars/4.
    const result = estimateContentTokens([c]);
    expect(result).toBeGreaterThan(0);
  });
});

describe('estimatePromptTokens', () => {
  const history: Content[] = [
    textContent('older message a'),
    textContent('older message b'),
  ];
  const user = textContent('current user message');

  it('utilise lastPromptTokenCount + estimation du message utilisateur quand count > 0', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('utilise l\'estimation complète quand lastPromptTokenCount est 0', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Résultat attendu : ÉCHEC — `tokenEstimation.ts` n'est pas encore créé.

- [ ] **Étape 3 : Implémenter — créer tokenEstimation.ts**

`packages/core/src/services/tokenEstimation.ts` :

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  DEFAULT_IMAGE_TOKEN_ESTIMATE,
  estimateContentChars,
} from './compactionInputSlimming.js';

/**
 * Nombre moyen d'octets par token pour l'estimation basée sur les caractères.
 * Correspond à la valeur par défaut de roughTokenCountEstimation de claude-code (tokens.ts).
 */
const BYTES_PER_TOKEN = 4;

/**
 * Estime le nombre de tokens d'une liste d'objets Content via char/4.
 *
 * Réutilise `estimateContentChars` pour que inlineData / functionCall /
 * functionResponse bénéficient du même traitement que lors du calcul des
 * points de découpage de compression — garder les deux estimateurs synchronisés
 * empêche le déclencheur d'auto-compaction et le splitter d'être en désaccord
 * sur la taille.
 *
 * Destiné uniquement à la porte de seuil pré-envoi. Char/4 est une borne
 * inférieure conservative (les tokenizers réels varient de ±30%) ; l'utiliser
 * pour DÉCLENCHER la compaction plus tôt est sûr (faux positif), l'utiliser
 * pour IGNORER la compaction ne l'est pas.
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  let totalChars = 0;
  for (const content of contents) {
    totalChars += estimateContentChars(content, imageTokenEstimate);
  }
  return Math.ceil(totalChars / BYTES_PER_TOKEN);
}

/**
 * Calcule un nombre effectif de tokens du prompt pour la porte d'auto-compaction.
 *
 * `lastPromptTokenCount` (issu des métadonnées d'utilisation du tour précédent)
 * manque de deux choses : le message utilisateur actuel, et toute valeur initiale
 * au tout premier envoi. Cette fonction comble les deux lacunes via une estimation locale.
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  if (lastPromptTokenCount > 0) {
    return (
      lastPromptTokenCount +
      estimateContentTokens([userMessage], imageTokenEstimate)
    );
  }
  return estimateContentTokens([...history, userMessage], imageTokenEstimate);
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Résultat attendu : SUCCÈS

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): ajout d'un helper d'estimation de tokens pour la porte de compaction

Introduction de estimateContentTokens / estimatePromptTokens construits sur
estimateContentChars existant (compactionInputSlimming) divisé par un ratio
char/4. Remplacera l'utilisation brute de lastPromptTokenCount dans les
contrôles cheap-gate et hard-threshold afin que le système puisse réagir
à (a) le message utilisateur actuel et (b) le tout premier envoi (où le
compte rapporté par l'API est 0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tâche 3 : Appliquer l'estimation dans le cheap-gate de chatCompressionService

**Fichiers :**

- Modification : `packages/core/src/services/chatCompressionService.ts`
- Modification : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Rédiger le test qui échoue**

Cette tâche est réalisée avant P1, donc on utilise la **formule existante** `threshold * contextLimit` (70 % * 200K = 140K), en remplaçant simplement `originalTokenCount` par `estimatePromptTokens(...)` :

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress cheap-gate utilise les tokens estimés', () => {
  it('déclenche la compaction quand les tokens rapportés par l\'API sont sous le seuil mais que les tokens estimés incluant le message utilisateur en attente le dépassent', async () => {
    // Fenêtre 200K seuil actuel = 0.7 * 200K = 140K
    // originalTokenCount = 135K (manque 5K)
    // estimation du message utilisateur ~10K → 145K, dépasse 140K
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K chars ≈ 10K tokens
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // Mocker runSideQuery pour que les étapes suivantes de compress n'explosent pas
    vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>x</state_snapshot>',
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    } as any);

    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 135_000,
      pendingUserMessage: userMessage,
    });
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });

  it('retourne NOOP quand ni originalTokenCount ni le total estimé n\'atteint le seuil', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 80_000,
      pendingUserMessage: {
        role: 'user',
        parts: [{ text: 'short' }],
      },
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });
});
```

`makeFakeChat({ historyChars })` est un helper inline dans le fichier de test : construit un double `GeminiChat`, où `getHistory()` retourne un tableau Content dont la longueur correspond approximativement à `historyChars` (réutiliser un helper existant s'il y en a un dans le fichier).

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate utilise les tokens estimés'
```

Résultat attendu : ÉCHEC — actuellement le cheap-gate ne regarde que `originalTokenCount`, il retournera NOOP.

- [ ] **Étape 3 : Implémenter — modifier le cheap-gate de compress()**

Modifier cette section ([chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235)) :

```ts
// Ne pas compresser si ce n'est pas forcé et qu'on est sous la limite. C'est le
// chemin nominal à chaque envoi ; on veut sortir avant de payer le clone complet
// `getHistory(true)` ci-dessous.
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < threshold * contextLimit) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

Ajouter un nouveau champ dans l'interface `CompressOptions` ([:172-196](packages/core/src/services/chatCompressionService.ts:172)) :

```ts
export interface CompressOptions {
  // ... champs existants ...
  /**
   * Message utilisateur en attente d'envoi. Lorsqu'il est présent, le cheap-gate
   * ajoute son nombre de tokens estimé à `originalTokenCount` (qui ne reflète
   * que l'utilisation du tour précédent via l'API) pour que la porte voit la
   * taille réelle du prompt.
   * Optionnel pour la rétrocompatibilité avec les appelants qui n'ont pas de
   * message utilisateur sous la main (ex. chemins manuels /compress force=true).
   */
  pendingUserMessage?: Content;
}
```

Ajouter l'import : `import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Résultat attendu : SUCCÈS

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): le cheap-gate utilise les tokens estimés quand un message utilisateur est en attente

Ajout de `pendingUserMessage` à CompressOptions et transmission à
estimatePromptTokens au niveau du cheap-gate d'auto-compaction. Comble le
décalage 'd'un tour' où le contrôle de seuil ignorait le message utilisateur
sur le point d'être envoyé.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tâche 4 : Transmission de pendingUserMessage dans l'entrée sendMessageStream de geminiChat

**Fichiers :**

- Modification : `packages/core/src/core/geminiChat.ts`
- Modification : `packages/core/src/core/geminiChat.test.ts`

- [ ] **Étape 1 : Rédiger le test qui échoue**

Dans `packages/core/src/core/geminiChat.test.ts`, ajouter :

```ts
describe('sendMessageStream estimation au premier tour', () => {
  it('déclenche l\'auto-compaction au tout premier envoi quand l\'historique hérité est énorme', async () => {
    // Simule scénario sub-agent héritant d'un gros historique / --continue :
    // lastPromptTokenCount = 0, mais l'historique est déjà proche du seuil auto
    const chat = makeChatWithLargeInheritedHistory(/* ~150K chars worth */);
    expect(chat.getLastPromptTokenCount()).toBe(0);

    const mockGen = mockContentGeneratorWithUsage({
      totalTokenCount: 80_000,
    });
    chat.setContentGenerator(mockGen);

    const stream = await chat.sendMessageStream(
      'qwen-test',
      { message: 'next user prompt' },
      'prompt-1',
    );
    // Le premier événement du stream devrait être COMPRESSED
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
`makeChatWithLargeInheritedHistory` helper est défini en ligne dans le fichier de test : il construit un `GeminiChat` avec `history` contenant 1500 contenus simples user/model, chacun de 100 caractères, soit ~150K caractères au total.

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

Résultat attendu : ÉCHEC — actuellement `tryCompress` utilise `lastPromptTokenCount = 0`, le cheap-gate retourne NOOP.

- [ ] **Étape 3 : Implémenter — modifier sendMessageStream et tryCompress**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) devient :

```ts
compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  false,
  params.config?.abortSignal,
  {
    pendingUserMessage: createUserContent(params.message),
  },
);
```

Signature de `tryCompress` (environ [:460-478](packages/core/src/core/geminiChat.ts:460)) : ajouter dans l'interface `TryCompressOptions` :

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← nouveau
}
```

Transmettez `pendingUserMessage` à `service.compress` :

```ts
const { newHistory, info } = await service.compress(this, {
  // ... champs existants ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Résultat attendu : RÉUSSI

- [ ] **Étape 5 : Vérification de types + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): pass pendingUserMessage from sendMessageStream to tryCompress

Closes the 'first send after inherited history' gap where
lastPromptTokenCount is 0 and the cheap-gate would always NOOP.
estimatePromptTokens falls back to a full-history estimate in that
case once the user message is provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P1 — Constantes des trois seuils + computeThresholds + cheap-gate

### Tâche 5 : Ajouter les constantes et la fonction computeThresholds

**Fichiers :**

- Modifier : `packages/core/src/services/chatCompressionService.ts`
- Modifier : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

`chatCompressionService.test.ts` ajouter :

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('32K window — proportional fallback for all tiers, hard degrades to auto', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(window-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('128K window — mixed (warn=pct, auto/hard=abs)', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (pct wins: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // abs: window-33K (abs wins: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // abs: window-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('200K window — absolute takes over all tiers', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // abs: auto-20K (abs wins: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // abs: 200K-33K
    expect(t.hard).toBe(177_000); // abs: 200K-23K
  });

  it('1M window — fully absolute', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('extreme small window (10K) does not crash; returns sane values', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('thresholds always satisfy warn <= auto <= hard', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

Résultat attendu : ÉCHEC — `computeThresholds` n'existe pas.

- [ ] **Étape 3 : Implémenter — ajouter les constantes et la fonction**

Dans la zone des constantes de [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) (juste après `COMPACT_MAX_OUTPUT_TOKENS`), ajouter :

```ts
/**
 * Default proportional auto-compaction threshold (legacy semantics
 * preserved as a small-window fallback / safety net).
 */
export const DEFAULT_PCT = 0.7;

/**
 * Warn-tier proportional offset: warn-pct = PCT - WARN_PCT_OFFSET (= 0.6).
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * Token budget reserved for compression output. Matches COMPACT_MAX_OUTPUT_TOKENS
 * because thinking is disabled (see Task 1) so maxOutputTokens is the hard
 * ceiling on summary output.
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** Distance between auto threshold and effectiveWindow. */
export const AUTOCOMPACT_BUFFER = 13_000;

/** Distance between warn threshold and auto threshold. */
export const WARN_BUFFER = 20_000;

/** Distance between hard threshold and effectiveWindow (claude-code MANUAL_COMPACT_BUFFER). */
export const HARD_BUFFER = 3_000;

/** Auto-compaction consecutive-failure circuit breaker. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** Token count at which UI warn tier triggers. */
  warn: number;
  /** Token count at which auto-compaction triggers. */
  auto: number;
  /** Token count at which auto-compaction is forced (resets failure counter). */
  hard: number;
  /** Window minus SUMMARY_RESERVE; the budget available for input + summary. */
  effectiveWindow: number;
}

/**
 * Compute the three-tier threshold ladder for a given context window.
 *
 * Each tier is `max(proportional, absolute)`:
 *   auto  = max(PCT * window,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * window, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // hard degrades to auto for tiny windows
 *
 * Small windows (where the absolute branch goes negative) automatically fall
 * back to the proportional branch. Large windows are dominated by the absolute
 * branch, capping wasted reservation to ~33K instead of 30% of the window.
 */
export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto);

  return { warn, auto, hard, effectiveWindow };
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Résultat attendu : RÉUSSI

- [ ] **Étape 5 : Vérification de types + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add computeThresholds for three-tier compaction ladder

Introduces warn/auto/hard thresholds combining proportional fallback
(small windows) with absolute reservation (large windows). Matches the
formula in docs/design/auto-compaction-threshold-redesign.md. Pure
function with full coverage across 32K/128K/200K/1M/extreme-small
windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tâche 6 : Cheapest-gate bascule vers computeThresholds.auto

**Fichiers :**

- Modifier : `packages/core/src/services/chatCompressionService.ts`
- Modifier : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
describe('compress cheap-gate uses computeThresholds.auto', () => {
  it('on a 200K window with originalTokenCount=160K, NOOP (below auto=167K)', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 160_000,
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });

  it('on a 200K window with originalTokenCount=168K, proceeds past gate', async () => {
    // 168K > 167K (auto), cheap-gate laisse passer, entre dans la phase curatedHistory
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // Le résultat réel dépend du sideQuery mocké ; on vérifie juste que ce n'est pas un NOOP précoce bloqué par cheap-gate
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses computeThresholds'
```

Résultat attendu : ÉCHEC — le seuil actuel est `threshold * contextLimit = 0.7 * 200K = 140K`. 160K dépasse déjà 140K et le cheap-gate laisse passer (contredit l'assertion ①) ; idem pour 168K.

- [ ] **Étape 3 : Implémenter — basculer la formule du cheap-gate**

Modifier le bloc `if (!force) { ... }` à [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) :

```ts
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const { auto } = computeThresholds(contextLimit);
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < auto) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

Supprimer en même temps la ligne `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;` à [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214) car `threshold` n'est plus utilisé dans le cheap-gate. Supprimer également la branche `threshold <= 0` à la ligne 221 (sémantique de désactivation implicite, traitée en détail dans P4).

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Résultat attendu : RÉUSSI

- [ ] **Étape 5 : Vérification de types + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate uses computeThresholds.auto

Replace the legacy `threshold * contextLimit` formula with
computeThresholds.auto, which combines proportional fallback with
absolute reservation. On large windows (>=128K) the gate now triggers
later than 70% but reserves a fixed ~33K, freeing tens of thousands of
context tokens that the old formula wasted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P2 — Amélioration de la gestion des échecs (1 verrou → 3 échecs de disjoncteur)

### Tâche 7 : hasFailedCompressionAttempt → consecutiveFailures

**Fichiers :**

- Modifier : `packages/core/src/core/geminiChat.ts`
- Modifier : `packages/core/src/services/chatCompressionService.ts`
- Modifier : `packages/core/src/core/geminiChat.test.ts`
- Modifier : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

`geminiChat.test.ts` :

```ts
describe('compression failure circuit breaker', () => {
  it('tolerates 2 consecutive failures, NOOPs the third', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // Déclencher 3 échecs consécutifs :
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // échec 1
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // échec 2
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // échec 3 devrait NOOP
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // Vérifier que service.compress n'a pas été appelé la 3e fois (disjoncteur NOOP dans cheap-gate)
    expect(getCompressCallCount()).toBe(2);
  });

  it('resets counter on a successful force compress', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // échec
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // échec
    // L'utilisateur déclenche manuellement /compress
    await chat.tryCompress('p3', 'm', /* force */ true);
    // Maintenant le disjoncteur devrait être réinitialisé
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'circuit breaker'
```

Résultat attendu : ÉCHEC — actuellement un seul échec verrouille définitivement, le 2e send est déjà NOOP par cheap-gate, le 3e aussi NOOP, mais l'assertion ② attend qu'après un force la récupération se fasse et que sendMessageStream atteigne compress.

- [ ] **Étape 3 : Implémenter — remplacer le champ**

[geminiChat.ts](packages/core/src/core/geminiChat.ts) champ interne (chercher `hasFailedCompressionAttempt`) :

```ts
// Avant remplacement
private hasFailedCompressionAttempt = false;

// Après remplacement
private consecutiveFailures = 0;
```

Dans [geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467), fonction `tryCompress` : champ transmis à `service.compress` :

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← remplace hasFailedCompressionAttempt
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

Branches succès/échec dans [geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503) :

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... logique existante ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← remplace hasFailedCompressionAttempt = false
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← remplace hasFailedCompressionAttempt = true
  }
}
```

[chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts), interface `CompressOptions` :

```ts
export interface CompressOptions {
  // ... champs existants ...
  /**
   * Number of consecutive auto-compaction failures for this chat. When
   * it reaches MAX_CONSECUTIVE_FAILURES, the gate stops trying until a
   * successful force=true call resets it.
   */
  consecutiveFailures: number;
  // supprimer hasFailedCompressionAttempt
}
```

Dans `compress()`, vérification cheap-gate vers [:221](packages/core/src/services/chatCompressionService.ts:221) :

```ts
// Cheap gates first — these don't need the curated history.
if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
  return {
    newHistory: null,
    info: {
      originalTokenCount: 0,
      newTokenCount: 0,
      compressionStatus: CompressionStatus.NOOP,
    },
  };
}
```

Mettre à jour la déstructuration `const { ... } = opts;` en remplaçant `hasFailedCompressionAttempt` par `consecutiveFailures`.

Dans `chatCompressionService.test.ts`, remplacer tous les `hasFailedCompressionAttempt: false/true` par `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES`, et corriger les attentes des tests un par un.

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

Résultat attendu : RÉUSSI

- [ ] **Étape 5 : Vérification de types + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): replace hasFailedCompressionAttempt with circuit breaker

Switches from a one-shot permanent lock to a three-strike circuit
breaker (MAX_CONSECUTIVE_FAILURES=3). Successful force compress
(manual /compress, reactive overflow, or hard-tier rescue) resets the
counter. Aligns with claude-code's design and unblocks recovery from
transient failures (rate limits, transient model errors) that
previously disabled auto-compaction for the rest of the session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P4 — Côté configuration : suppression de contextPercentageThreshold + avertissement de breaking change

### Tâche 8 : Supprimer le champ + avertissement au démarrage

**Fichiers :**

- Modifier : `packages/core/src/config/config.ts`
- Modifier : `packages/cli/src/config/settingsSchema.ts` (si référencé)
- Modifier : `packages/core/src/services/chatCompressionService.ts`
- Modifier : `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

`packages/core/src/config/config.test.ts` (créer s'il n'existe pas) :

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold deprecation', () => {
  it('logs a stderr warning when the deprecated field is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... paramètres Config minimaux requis ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold has been removed',
      ),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when the deprecated field is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... paramètres minimaux, sans chatCompression.contextPercentageThreshold ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

Résultat attendu : ÉCHEC — Config accepte actuellement complètement ce champ, sans avertissement.

- [ ] **Étape 3 : Implémenter — modifier ChatCompressionSettings + constructeur Config**

[config.ts:217-227](packages/core/src/config/config.ts:217) :

```ts
export interface ChatCompressionSettings {
  /**
   * Estimated tokens for a single inline image / document part when
   * apportioning chars across history in `findCompressSplitPoint`.
   * Also used as the placeholder budget when stripping inline media
   * out of the side-query compaction prompt. Default 1600.
   * Env override: `QWEN_IMAGE_TOKEN_ESTIMATE`.
   */
  imageTokenEstimate?: number;
}
```

(Supprimer le champ `contextPercentageThreshold`.)

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il réussit**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

Résultat attendu : RÉUSSI

- [ ] **Étape 5 : Vérification de types + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/config/config.ts packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): remove contextPercentageThreshold with deprecation warning

Introduces a breaking change warning when the old field is provided,
guiding users to the new computeThresholds logic. This completes P4
and enables future removal of the legacy static threshold.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
[config.ts](packages/core/src/config/config.ts) Trouvez l'endroit dans le constructeur `Config` qui traite `params.chatCompression` (environ ligne 933), et avant l'affectation, ajoutez :

```ts
if (
  params.chatCompression &&
  typeof (params.chatCompression as Record<string, unknown>)
    .contextPercentageThreshold !== 'undefined'
) {
  console.warn(
    '[qwen-code] chatCompression.contextPercentageThreshold has been removed ' +
      'and is now controlled by built-in thresholds. Setting will be ignored.',
  );
}
this.chatCompression = params.chatCompression;
```

`chatCompressionService.ts` Nettoyez également : [:214-217](packages/core/src/services/chatCompressionService.ts:214) ce bloc a déjà été supprimé dans la Tâche 6, vérifiez qu'il ne reste pas `chatCompressionSettings?.contextPercentageThreshold` dans le fichier, ni la constante exportée `COMPRESSION_TOKEN_THRESHOLD` :

- Si `COMPRESSION_TOKEN_THRESHOLD` n'est plus référencée nulle part, supprimez la constante.
- Si elle est encore référencée (par exemple dans telemetry ou doc), remplacez par une référence à `DEFAULT_PCT`.

cli/config/settingsSchema.ts n'a pas besoin d'être modifié – `chatCompression` reste `type: 'object'`, sans champ `schema` à l'intérieur ([settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)). Si le schéma contient une référence à `contextPercentageThreshold`, supprimez-la.

- [ ] **Étape 4 : Exécuter les tests pour vérifier qu'ils passent**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

Résultat attendu : PASS (y compris les tests existants liés à la compression)

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/config/config.ts packages/core/src/config/config.test.ts packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core)!: remove chatCompression.contextPercentageThreshold setting

The proportional threshold is now an internal constant (DEFAULT_PCT) and
the auto-compaction threshold is computed from a mixed proportional /
absolute formula (computeThresholds). User-facing tuning of the bare
percentage no longer maps to meaningful behavior on large-window models.

Existing settings.json files containing the field will log a one-line
stderr warning on startup; the field is otherwise ignored.

BREAKING CHANGE: chatCompression.contextPercentageThreshold is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P3 — Intervention proactive du niveau **hard**

### Tâche 9 : Ajout d'une vérification hard + compression forcée à l'entrée de sendMessageStream

**Fichiers :**

- Modifier : `packages/core/src/core/geminiChat.ts`
- Modifier : `packages/core/src/core/geminiChat.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // Construire une fenêtre de 200K : hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // Le message utilisateur de ce tour + 176K dépasse 177K
    const userMessage = makeBigUserMessage(/* ~3K tokens */);
    const stream = await chat.sendMessageStream(
      'm',
      { message: userMessage },
      'p',
    );
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
    expect(getLastCompressCallForce()).toBe(true);
  });

  it('hard rescue resets consecutiveFailures before forcing', async () => {
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // Simuler 3 échecs pour que consecutiveFailures = 3
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 4e appel : le token dépasse le hard, le sauvetage hard réinitialise le circuit breaker et force=true
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

Résultat attendu : FAIL — sendMessageStream appelle actuellement toujours tryCompress avec `force=false`.

- [ ] **Étape 3 : Implémenter — Ajouter une vérification hard à l'entrée de sendMessageStream**

[geminiChat.ts:560-567](packages/core/src/core/geminiChat.ts:560) :

```ts
// Sauvetage du niveau hard : si le prompt en attente est suffisamment grand pour risquer un débordement,
// forcer la compression avant l'envoi et réinitialiser le compteur d'échecs pour qu'une session
// déjà en circuit-breaker NOOP puisse récupérer. Cela couvre proactivement ce que le débordement
// réactif (ligne ~711) attraperait autrement après un aller-retour inutile.
const contextLimit =
  this.config.getContentGeneratorConfig()?.contextWindowSize ??
  DEFAULT_TOKEN_LIMIT;
const { hard } = computeThresholds(contextLimit);
const pendingUserMessage = createUserContent(params.message);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  pendingUserMessage,
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;
if (shouldForceFromHard) {
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
  { pendingUserMessage },
);
```

Remarque : `createUserContent` est normalement appelé une fois dans sendMessageStream à la ligne [:569](packages/core/src/core/geminiChat.ts:569) ; nous l'appelons maintenant plus tôt, donc la ligne [:569](packages/core/src/core/geminiChat.ts:569) `const userContent = createUserContent(params.message);` peut être supprimée/remplacée par `const userContent = pendingUserMessage;`.

Ajouter les imports : `import { computeThresholds } from '../services/chatCompressionService.js';`
Ajouter l'import : `import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Résultat attendu : PASS

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): hard-tier rescue forces compaction before oversized send

When estimated tokens cross computeThresholds.hard, sendMessageStream
now resets the consecutive-failure counter and calls tryCompress with
force=true. This pulls reactive overflow recovery forward to before
the send, saving one wasted round-trip and unblocking sessions whose
circuit breaker had latched off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P5 — Modifications UI (réécriture des tips + affichage /context)

### Tâche 10 : Réécriture de trois tips context-* dans tipRegistry

**Fichiers :**

- Modifier : `packages/cli/src/services/tips/tipRegistry.ts`
- Modifier : `packages/cli/src/services/tips/tipRegistry.test.ts` (créer s'il n'existe pas)
- Modifier : `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Étape 1 : Écrire le test qui échoue**

`packages/cli/src/services/tips/tipRegistry.test.ts` :

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tipRegistry, type TipContext } from './tipRegistry.js';

const baseCtx: TipContext = {
  lastPromptTokenCount: 0,
  contextWindowSize: 200_000,
  sessionPromptCount: 10,
  sessionCount: 1,
  platform: 'darwin',
  thresholds: {
    warn: 147_000,
    auto: 167_000,
    hard: 177_000,
    effectiveWindow: 180_000,
  },
};

function tipById(id: string) {
  return tipRegistry.find((t) => t.id === id)!;
}

describe('context-* tip thresholds align with computeThresholds', () => {
  it('compress-intro fires between warn and auto', () => {
    const t = tipById('compress-intro');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 100_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 168_000 })).toBe(
      false,
    );
  });

  it('context-high fires between auto and hard', () => {
    const t = tipById('context-high');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      false,
    );
  });

  it('context-critical fires at or above hard', () => {
    const t = tipById('context-critical');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      true,
    );
  });

  it('falls back gracefully when thresholds undefined (legacy callers)', () => {
    const ctx = { ...baseCtx, thresholds: undefined };
    // Les trois tips ne doivent pas se déclencher quand thresholds est absent (pas de comparaison possible)
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

Résultat attendu : FAIL — `TipContext` n'a pas de champ `thresholds` ; les trois tips se déclenchent encore sur des pourcentages de 50/80/95.

- [ ] **Étape 3 : Implémenter — Modifier tipRegistry**

[tipRegistry.ts:15-21](packages/cli/src/services/tips/tipRegistry.ts:15) :

```ts
import type { CompactionThresholds } from '@qwen-code/qwen-code-core';
import { DEFAULT_TOKEN_LIMIT } from '@qwen-code/qwen-code-core';

export type TipTrigger = 'startup' | 'post-response';

export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  /**
   * Seuils de compactage à trois niveaux, calculés par les appelants.
   * Optionnel pour compatibilité descendante ; les tips retournent false si absent.
   */
  thresholds?: CompactionThresholds;
}
```

`getContextUsagePercent` est conservé (d'autres tips startup peuvent l'utiliser), mais les tips context-* ne dépendent plus de lui.

Remplacer les `isRelevant` des trois tips [tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37) :

```ts
export const tipRegistry: ContextualTip[] = [
  // --- Tips contextuels post-réponse (priorité : plus élevé = plus urgent) ---
  {
    id: 'context-critical',
    content:
      'Contexte proche de la limite hard — le compactage automatique forcera au prochain envoi. Utilisez /clear pour repartir à zéro.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.hard,
    cooldownPrompts: 3,
    priority: 100,
  },
  {
    id: 'context-high',
    content: 'Le contexte devient plein. Utilisez /compress pour libérer de l\'espace.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.auto &&
      ctx.lastPromptTokenCount < ctx.thresholds.hard,
    cooldownPrompts: 5,
    priority: 90,
  },
  {
    id: 'compress-intro',
    content: 'Longue conversation ? /compress résume l\'historique pour libérer du contexte.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.warn &&
      ctx.lastPromptTokenCount < ctx.thresholds.auto &&
      ctx.sessionPromptCount > 5,
    cooldownPrompts: 10,
    priority: 50,
  },

  // --- Tips de démarrage ---  ← inchangés
  // ... les tips startup suivants ne sont pas touchés ...
```

`packages/cli/src/ui/AppContainer.tsx:1150` (point de construction des tips contextuels), remplacer par :

```tsx
// pseudo — adapté au code existant
const thresholds = computeThresholds(contextWindowSize);
const tipCtx: TipContext = {
  lastPromptTokenCount,
  contextWindowSize,
  sessionPromptCount,
  sessionCount,
  platform: process.platform,
  thresholds,
};
```

Ajouter l'import dans AppContainer.tsx :

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

Résultat attendu : PASS

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/services/tips/tipRegistry.ts packages/cli/src/services/tips/tipRegistry.test.ts packages/cli/src/ui/AppContainer.tsx
git commit -m "$(cat <<'EOF'
feat(cli): align context-* tips with new compaction thresholds

The three context-usage tips now compare tokenCount against the
warn/auto/hard ladder from computeThresholds instead of fixed 50/80/95
percentages. compress-intro fires between warn and auto, context-high
between auto and hard, context-critical at or above hard. Threshold
data is injected into TipContext from the AppContainer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tâche 11 : Commande /context affiche les trois seuils

**Fichiers :**

- Modifier : `packages/cli/src/ui/commands/contextCommand.ts`
- Modifier : `packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // entre warn et auto
    });
    expect(result).toMatch(/Warn threshold:\s+147[,.]?000/);
    expect(result).toMatch(/Auto threshold:\s+167[,.]?000/);
    expect(result).toMatch(/Hard threshold:\s+177[,.]?000/);
    expect(result).toMatch(/current tier:\s+warn/i);
  });

  it('correctly identifies "below warn" tier when tokens are low', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 50_000,
    });
    expect(result).toMatch(/current tier:\s+(safe|below warn|normal)/i);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

Résultat attendu : FAIL — le fichier [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) utilise actuellement la formule `(1 - threshold) * contextWindowSize`, n'affichant qu'un seul nombre "autocompactBuffer".

- [ ] **Étape 3 : Implémenter — Modifier la sortie de contextCommand**

Remplacer le bloc [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) :

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... Dans `buildContextSummary` ou un point d'entrée similaire :
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// Dans la partie formatage de la sortie, ajouter :
const lines = [
  // ... sortie existante ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

Note : `formatNum` est une fonction existante du projet (`.toLocaleString()`, etc.) ; si elle n'est pas dans le fichier, vous pouvez utiliser `(n: number) => n.toLocaleString('en-US')`.

Supprimez également le code qui calculait `autocompactBuffer` ([:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)) et l'utilisation de `compressionThreshold` — on se réfère maintenant directement à `auto`.

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

Résultat attendu : PASS

- [ ] **Étape 5 : Vérification de type + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/ui/commands/contextCommand.ts packages/cli/src/ui/commands/contextCommand.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): /context shows three-tier thresholds and current tier

Replace the legacy single-buffer display with effective window + warn /
auto / hard threshold lines and a "current tier" label so users can see
exactly where in the ladder the session sits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Validation (régression finale complète)

Après avoir appliqué toutes les tâches, exécutez une dernière vérification complète :

- [ ] **Étape 1 : Tests complets**

```bash
npm test
```

Résultat attendu : tous les tests workspace passent.

- [ ] **Étape 2 : Vérification de type complète**

```bash
npm run typecheck
```

- [ ] **Étape 3 : Lint complet**

```bash
npm run lint
```

- [ ] **Étape 4 : Smoke test manuel**

Lancez le CLI et effectuez :

1. `/context` — vérifiez que le nouvel affichage à trois niveaux est correct.
2. Lancez une conversation qui déclenche la compression (utilisez un modèle avec fenêtre de 200K en remplissant le prompt jusqu'à 170K+).
3. Démarrez avec `chatCompression.contextPercentageThreshold = 0.5` — vérifiez que l'avertissement de dépréciation s'affiche sur stderr.
4. Reprenez une session énorme avec `--continue` ; lors du premier envoi, vérifiez que la compression est déclenchée par le chemin d'estimation du premier tour.

- [ ] **Étape 5 : Script de description de PR unifié (optionnel)**

Si les PR sont soumises par lots, chaque description de PR doit lier [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) et indiquer la Phase / Tâche.