# Plano de Implementação do Redesenho do Limiar de Compactação Automática

> **Para workers agentivos:** HABILIDADE SECUNDÁRIA OBRIGATÓRIA: Use superpoderes:desenvolvimento-dirigido-por-subagente (recomendado) ou superpoderes:execução-de-planos para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para rastreamento.

**Objetivo:** Atualizar o limiar de porcentagem de camada única (70%) da compactação automática do qwen-code para uma escada de três camadas híbrida "porcentagem + absoluta" (warn / auto / hard), além de aplicar um limite superior de `maxOutputTokens` na própria chamada de compactação, desabilitar o thinking, introduzir disjuntor de falhas, corrigir o atraso/lacuna da primeira rodada do `lastPromptTokenCount` e limpar a superfície de configuração do usuário.

**Arquitetura:**

- `chatCompressionService.ts` adiciona `computeThresholds(window)` que retorna `{ warn, auto, hard }`; o cheap-gate usa `auto`; a entrada do `sendMessageStream` adiciona verificação hard para resgate ativo.
- Novo `tokenEstimation.ts` fornece função de estimativa local char/4 para compensar as duas lacunas do `lastPromptTokenCount`: "atraso de uma rodada + primeira rodada igual a 0".
- Tratamento de falhas evolui de bloqueio único `hasFailedCompressionAttempt: boolean` para `consecutiveFailures: number` com disjuntor de três falhas.
- Chamada sideQuery da compactação desliga thinking + adiciona `maxOutputTokens: 20K`.
- Remove o campo `chatCompression.contextPercentageThreshold` das configurações; ao iniciar, emite aviso no stderr sobre configuração antiga e ignora.
- `tipRegistry.ts` reescreve três tips context-* para seguir os novos limiares; comando `/context` exibe os três valores numéricos.

**Tech Stack:** TypeScript, Vitest, `@google/genai`, ferramenta de estimativa `compactionInputSlimming` existente.

**Ordem de mesclagem:** P6 → P7 → P1 → P2 → P4 → P3 → P5. Cada Task é candidata a PR único.

---

## Estrutura de Arquivos

| Caminho                                                         | Ação      | Responsabilidade                                                                                 |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/services/tokenEstimation.ts`                 | Criar     | Estimativa de tokens em nível de caractere + entrada `estimatePromptTokens`                      |
| `packages/core/src/services/tokenEstimation.test.ts`            | Criar     | Testes unitários da função de estimativa                                                         |
| `packages/core/src/services/chatCompressionService.ts`          | Modificar | Adicionar constantes + `computeThresholds`; alterar cheap-gate; desligar thinking + maxOutput; alterar contagem de falhas |
| `packages/core/src/services/chatCompressionService.test.ts`     | Modificar | Testes unitários do computeThresholds + asserções de configuração cheap-gate / sideQuery         |
| `packages/core/src/core/geminiChat.ts`                          | Modificar | Adicionar verificação hard na entrada do `sendMessageStream`; `hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                     | Modificar | Testes de integração para gatilho hard + disjuntor + cobertura da primeira rodada                |
| `packages/core/src/config/config.ts`                            | Modificar | `ChatCompressionSettings` remove `contextPercentageThreshold`; aviso na inicialização            |
| `packages/cli/src/services/tips/tipRegistry.ts`                 | Modificar | Três tips context-* passam a usar comparação absoluta de limiares; `TipContext` adiciona `thresholds` |
| `packages/cli/src/services/tips/tipRegistry.test.ts`            | Criar/Modificar | Teste de intervalo de ativação das tips                                                 |
| `packages/cli/src/ui/commands/contextCommand.ts`                | Modificar | Exibir os novos três limiares                                                                    |
| `packages/cli/src/ui/commands/contextCommand.test.ts`           | Modificar | Snapshot de saída                                                                                |
| `packages/cli/src/ui/AppContainer.tsx`                          | Modificar | Injetar `thresholds` ao construir o `TipContext`                                                 |

---

## Fase P6 — SideQuery da compactação desliga thinking + adiciona maxOutputTokens

Primeira implementação, para que as suposições de limiar subsequentes sejam confiáveis. PR independente.

### Tarefa 1: Alterar a chamada sideQuery no chatCompressionService

**Arquivos:**

- Modificar: `packages/core/src/services/chatCompressionService.ts:374-376`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Na seção de importação do topo de `chatCompressionService.test.ts`, adicionar ponto de entrada para spy, e dentro de um describe apropriado adicionar o teste. `runSideQuery` já é exportado do módulo, então pode-se usar spyOn:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery config', () => {
  it('passes maxOutputTokens=20_000 and includeThoughts=false to runSideQuery', async () => {
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

`makeFakeChat` / `makeFakeConfig` reutilizam os helpers de teste existentes (se já estiverem no arquivo, use-os diretamente; caso contrário, crie um stub mínimo inline).

- [ ] **Passo 2: Executar o teste para verificar que falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'passes maxOutputTokens=20_000'
```

Esperado: FAIL — atualmente é passado `{ thinkingConfig: { includeThoughts: true } }` e não há `maxOutputTokens`.

- [ ] **Passo 3: Implementar — modificar chatCompressionService.ts**

Substituir todo o bloco `config:` em [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) por:

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
  // Compression output is bounded by maxOutputTokens to guarantee a predictable
  // reserve across providers (see docs/design/auto-compaction-threshold-redesign.md).
  // Thinking is disabled because per-provider thinking-budget semantics are
  // inconsistent (Anthropic/OpenAI count it separately, Gemini varies by model).
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

Na área de constantes no topo do arquivo (logo após `TOOL_ROUND_RETAIN_COUNT`), adicionar:

```ts
/**
 * Hard cap on the compression sideQuery output (summary text only, since
 * thinking is disabled). Mirrors claude-code's MAX_OUTPUT_TOKENS_FOR_SUMMARY
 * (autoCompact.ts:30) which is based on p99.99 of real compaction outputs.
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

Ao mesmo tempo, limpar o comentário na seção de cálculo de tokens do `compress()` (aproximadamente linha 436-437) que diz `"may include non-persisted tokens (thoughts)"` — agora não há mais saída de thinking. Alterar a frase para "compressionOutputTokenCount reflects the summary tokens only since thinking is disabled".

- [ ] **Passo 4: Executar o teste para verificar que passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Esperado: PASS (novo teste + testes existentes não devem regredir)

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

Esperado: Nenhum erro.

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): cap compression sideQuery output and disable thinking

Add COMPACT_MAX_OUTPUT_TOKENS=20_000 and pass maxOutputTokens to the
runSideQuery call, disable thinkingConfig.includeThoughts. Aligns with
claude-code's autoCompact reserve so the downstream threshold ladder
(P1/P3) can rely on a predictable upper bound on summary output across
providers (Anthropic / OpenAI / Gemini handle thinking budgets
inconsistently).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase P7 — Compensação de estimativa de tokens

Corrigir a lacuna de atraso/primeira rodada do `lastPromptTokenCount`. 3 Tarefas.

### Tarefa 2: Criar unidade tokenEstimation.ts

**Arquivos:**

- Criar: `packages/core/src/services/tokenEstimation.ts`
- Criar: `packages/core/src/services/tokenEstimation.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/services/tokenEstimation.test.ts`:

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
  it('returns 0 for empty array', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('estimates plain text at ~chars/4', () => {
    // "hello world" = 11 chars → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('sums tokens across multiple messages', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('estimates inlineData via imageTokenEstimate', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('estimates functionCall (json-dense) at ~chars/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars stringifies; the resulting JSON is short but the
    // ratio (chars/2) should make this >= chars/4 path.
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

  it('uses lastPromptTokenCount + user-message estimate when count > 0', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('falls back to full estimate when lastPromptTokenCount is 0', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Esperado: FAIL — `tokenEstimation.ts` ainda não foi criado.

- [ ] **Passo 3: Implementar — criar tokenEstimation.ts**

`packages/core/src/services/tokenEstimation.ts`:

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
 * Average bytes-per-token for char-based token estimation.
 * Matches claude-code's roughTokenCountEstimation default (tokens.ts).
 */
const BYTES_PER_TOKEN = 4;

/**
 * Estimate the token count of a list of Content objects via char/4.
 *
 * Reuses `estimateContentChars` so that inlineData / functionCall /
 * functionResponse get the same treatment they receive when computing
 * compression split points — keeping the two estimators in sync prevents
 * the auto-compaction trigger and the splitter from disagreeing on size.
 *
 * Intended for the pre-send threshold gate only. Char/4 is a conservative
 * lower bound (real tokenizers vary ±30%); using it to TRIGGER compaction
 * earlier is safe (false-positive), using it to SKIP compaction is not.
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
 * Compute an effective prompt-token count for the auto-compaction gate.
 *
 * `lastPromptTokenCount` (from the previous turn's usage metadata) lacks
 * two things: the current user message, and any initial value on the
 * very first send. This helper closes both gaps via local estimation.
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

- [ ] **Passo 4: Executar o teste para verificar que passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add token estimation helper for compaction gate

Introduce estimateContentTokens / estimatePromptTokens built on the
existing estimateContentChars (compactionInputSlimming) divided by a
char/4 ratio. Will replace raw lastPromptTokenCount usage at the cheap-
gate and hard-threshold checks so the system can react to (a) the
current user message and (b) the very first send (where the API-
reported count is 0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tarefa 3: Aplicar estimativa no cheap-gate do chatCompressionService

**Arquivos:**

- Modificar: `packages/core/src/services/chatCompressionService.ts`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Esta Tarefa será implementada antes do P1, portanto usa a **fórmula existente** `threshold * contextLimit` (70% * 200K = 140K), apenas substituindo `originalTokenCount` por `estimatePromptTokens(...)`:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress cheap-gate uses estimated tokens', () => {
  it('triggers compaction when API-reported tokens are below threshold but estimated tokens with the pending user message exceed it', async () => {
    // 200K window current threshold = 0.7 * 200K = 140K
    // originalTokenCount = 135K (5K short)
    // user message estimate ~10K → 145K, crossing 140K
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K chars ≈ 10K tokens
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // Mock runSideQuery so compress subsequent steps don't explode
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

  it('NOOPs when neither originalTokenCount nor estimated total reaches threshold', async () => {
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

`makeFakeChat({ historyChars })` é um helper inline dentro do arquivo de teste: constrói um stub de `GeminiChat`, `getHistory()` retorna um array de Content com tamanho aproximado correspondente a `historyChars` (se já existir um helper no arquivo, reutilizar).

- [ ] **Passo 2: Executar o teste para verificar que falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses estimated tokens'
```

Esperado: FAIL — o cheap-gate atual olha apenas `originalTokenCount` e vai determinar NOOP.

- [ ] **Passo 3: Implementar — alterar cheap-gate do compress()**

Modificar o trecho [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235):

```ts
// Don't compress if not forced and we are under the limit. This is the
// steady-state path on every send; we want to exit before paying for the
// full `getHistory(true)` clone below.
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

Adicionar novo campo na interface `CompressOptions` ([:172-196](packages/core/src/services/chatCompressionService.ts:172)):

```ts
export interface CompressOptions {
  // ... campos existentes ...
  /**
   * Pending user message about to be sent. When present, the cheap-gate
   * adds its estimated token count to `originalTokenCount` (which reflects
   * only the prior turn's API usage) so the gate sees the real prompt size.
   * Optional for backward compatibility with callers that don't have a
   * user message in hand (e.g. manual /compress force=true paths).
   */
  pendingUserMessage?: Content;
}
```

Adicionar import: `import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **Passo 4: Executar o teste para verificar que passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): cheap-gate uses estimated tokens when user message is pending

Add `pendingUserMessage` to CompressOptions and feed it through
estimatePromptTokens at the auto-compaction cheap-gate. Closes the
'lag by one turn' gap where the threshold check missed the user
message about to be sent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tarefa 4: Propagar pendingUserMessage na entrada do sendMessageStream no geminiChat

**Arquivos:**

- Modificar: `packages/core/src/core/geminiChat.ts`
- Modificar: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Adicionar em `packages/core/src/core/geminiChat.test.ts`:

```ts
describe('sendMessageStream first-turn estimation', () => {
  it('triggers auto-compaction on the very first send when inherited history is huge', async () => {
    // Simulate sub-agent inheriting large history / --continue scenario:
    // lastPromptTokenCount = 0, but history is already filled close to the auto threshold
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
    // Collect first event from stream; should be COMPRESSED
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
helper `makeChatWithLargeInheritedHistory` inline no arquivo de teste: constrói um `GeminiChat` com `history` carregando 1500 conteúdos simples de user/model, cada um com 100 chars, totalizando ~150K chars.

- [ ] **Passo 2: Executar teste para verificar que ele falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

Esperado: FAIL — o `tryCompress` atual usa `lastPromptTokenCount = 0`, o cheap-gate retorna NOOP.

- [ ] **Passo 3: Implementar — Alterar sendMessageStream e tryCompress**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) alterar para:

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

Na interface `TryCompressOptions` da assinatura de `tryCompress` (aproximadamente [:460-478](packages/core/src/core/geminiChat.ts:460)), adicionar:

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← Novo
}
```

Passar `pendingUserMessage` para `service.compress`:

```ts
const { newHistory, info } = await service.compress(this, {
  // ... campos existentes ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **Passo 4: Executar teste para verificar que ele passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): passa pendingUserMessage de sendMessageStream para tryCompress

Fecha a lacuna do 'primeiro envio após histórico herdado' onde
lastPromptTokenCount é 0 e o cheap-gate sempre retornava NOOP.
estimatePromptTokens recai para uma estimativa do histórico completo
neste caso, uma vez que a mensagem do usuário é fornecida.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase P1 — Constantes de três níveis de threshold + computeThresholds + cheap-gate

### Tarefa 5: Adicionar constantes e a função computeThresholds

**Arquivos:**

- Modificar: `packages/core/src/services/chatCompressionService.ts`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Adicionar em `chatCompressionService.test.ts`:

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('janela 32K — fallback proporcional para todos os níveis, hard degrada para auto', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(window-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('janela 128K — misto (warn=pct, auto/hard=abs)', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (pct vence: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // abs: window-33K (abs vence: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // abs: window-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('janela 200K — absoluto assume todos os níveis', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // abs: auto-20K (abs vence: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // abs: 200K-33K
    expect(t.hard).toBe(177_000); // abs: 200K-23K
  });

  it('janela 1M — totalmente absoluto', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('janela extremamente pequena (10K) não quebra; retorna valores sensatos', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('thresholds sempre satisfazem warn <= auto <= hard', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **Passo 2: Executar teste para verificar que ele falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

Esperado: FAIL — `computeThresholds` não existe.

- [ ] **Passo 3: Implementar — Adicionar constantes e função**

Na área de constantes do arquivo [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) (logo após `COMPACT_MAX_OUTPUT_TOKENS`), adicionar:

```ts
/**
 * Threshold de compactação automática proporcional padrão (semântica legada
 * preservada como fallback/rede de segurança para janelas pequenas).
 */
export const DEFAULT_PCT = 0.7;

/**
 * Offset proporcional do nível warn: warn-pct = PCT - WARN_PCT_OFFSET (= 0.6).
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * Orçamento de tokens reservado para a saída da compactação. Corresponde a COMPACT_MAX_OUTPUT_TOKENS
 * porque o thinking está desabilitado (veja Tarefa 1), então maxOutputTokens é o limite
 * máximo para a saída do resumo.
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** Distância entre o threshold auto e o effectiveWindow. */
export const AUTOCOMPACT_BUFFER = 13_000;

/** Distância entre o threshold warn e o threshold auto. */
export const WARN_BUFFER = 20_000;

/** Distância entre o threshold hard e o effectiveWindow (MANUAL_COMPACT_BUFFER do claude-code). */
export const HARD_BUFFER = 3_000;

/** Disjuntor de falhas consecutivas da compactação automática. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** Contagem de tokens na qual o nível UI warn é acionado. */
  warn: number;
  /** Contagem de tokens na qual a compactação automática é acionada. */
  auto: number;
  /** Contagem de tokens na qual a compactação automática é forçada (reinicia o contador de falhas). */
  hard: number;
  /** Janela menos SUMMARY_RESERVE; o orçamento disponível para entrada + resumo. */
  effectiveWindow: number;
}

/**
 * Calcula a escada de três níveis de threshold para uma determinada janela de contexto.
 *
 * Cada nível é `max(proporcional, absoluto)`:
 *   auto  = max(PCT * window,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * window, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // hard degrada para auto em janelas muito pequenas
 *
 * Janelas pequenas (onde o ramo absoluto fica negativo) automaticamente recaem
 * para o ramo proporcional. Janelas grandes são dominadas pelo ramo
 * absoluto, limitando a reserva desperdiçada a ~33K em vez de 30% da janela.
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

- [ ] **Passo 4: Executar teste para verificar que ele passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): adiciona computeThresholds para escada de compactação de três níveis

Introduz thresholds warn/auto/hard combinando fallback proporcional
(janelas pequenas) com reserva absoluta (janelas grandes). Corresponde à
fórmula em docs/design/auto-compaction-threshold-redesign.md. Função pura
com cobertura total em janelas 32K/128K/200K/1M/extremamente pequenas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Tarefa 6: Alternar cheap-gate para computeThresholds.auto

**Arquivos:**

- Modificar: `packages/core/src/services/chatCompressionService.ts`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

```ts
describe('cheap-gate do compress usa computeThresholds.auto', () => {
  it('em uma janela 200K com originalTokenCount=160K, NOOP (abaixo de auto=167K)', async () => {
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

  it('em uma janela 200K com originalTokenCount=168K, prossegue após o gate', async () => {
    // 168K > 167K (auto), cheap-gate libera, entra na fase curatedHistory
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // O resultado real depende do sideQuery mockado; apenas verifica que não é um NOOP inicial barrado pelo cheap-gate
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **Passo 2: Executar teste para verificar que ele falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate usa computeThresholds'
```

Esperado: FAIL — O threshold atual é `threshold * contextLimit = 0.7 * 200K = 140K`, 160K já ultrapassa 140K e o cheap-gate libera diretamente (não corresponde à asserção ①); 168K idem.

- [ ] **Passo 3: Implementar — Alternar fórmula do cheap-gate**

Modificar o bloco `if (!force) { ... }` em [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235):

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

Ao mesmo tempo, remover a linha `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;` em [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214), pois `threshold` não é mais usado pelo cheap-gate. Remover também o branch `threshold <= 0` na linha 221 (semântica de desabilitação implícita, detalhes na P4).

- [ ] **Passo 4: Executar teste para verificar que ele passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate usa computeThresholds.auto

Substitui a fórmula legada `threshold * contextLimit` por
computeThresholds.auto, que combina fallback proporcional com
reserva absoluta. Em janelas grandes (>=128K) o gate agora aciona
mais tarde que 70%, mas reserva um valor fixo de ~33K, liberando
dezenas de milhares de tokens de contexto que a fórmula antiga
desperdiçava.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase P2 — Atualização do tratamento de falhas (1 trava → disjuntor de 3)

### Tarefa 7: hasFailedCompressionAttempt → consecutiveFailures

**Arquivos:**

- Modificar: `packages/core/src/core/geminiChat.ts`
- Modificar: `packages/core/src/services/chatCompressionService.ts`
- Modificar: `packages/core/src/core/geminiChat.test.ts`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

`geminiChat.test.ts`:

```ts
describe('disjuntor de falha de compressão', () => {
  it('tolera 2 falhas consecutivas, retorna NOOP na terceira', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // Dispara 3 falhas consecutivas:
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // tentativa 1 falha
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // tentativa 2 falha
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // tentativa 3 deve retornar NOOP
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // Verificar que service.compress não foi chamado na 3ª vez (disjuntor NOOP no cheap-gate)
    expect(getCompressCallCount()).toBe(2);
  });

  it('reinicia o contador em um force compress bem-sucedido', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // falha
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // falha
    // Usuário manual /compress
    await chat.tryCompress('p3', 'm', /* force */ true);
    // Agora o disjuntor deve ter sido reiniciado
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **Passo 2: Executar teste para verificar que ele falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'disjuntor'
```

Esperado: FAIL — Atualmente, uma falha trava permanentemente. A 2ª chamada send já é barrada pelo cheap-gate com NOOP, a 3ª também é NOOP, mas a asserção ② espera que após force seja possível recuperar e que sendMessageStream chegue até o compress.

- [ ] **Passo 3: Implementar — Substituir campo**

Campo interno em [geminiChat.ts](packages/core/src/core/geminiChat.ts) (grep `hasFailedCompressionAttempt`):

```ts
// Antes da substituição
private hasFailedCompressionAttempt = false;

// Depois da substituição
private consecutiveFailures = 0;
```

Campo passado para `service.compress` na função `tryCompress` em [geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467):

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← Substitui hasFailedCompressionAttempt
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

Branches de falha/sucesso em [geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503):

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... lógica existente ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← Substitui hasFailedCompressionAttempt = false
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← Substitui hasFailedCompressionAttempt = true
  }
}
```

Interface `CompressOptions` em [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts):

```ts
export interface CompressOptions {
  // ... campos existentes ...
  /**
   * Número de falhas consecutivas de compactação automática para este chat. Quando
   * atinge MAX_CONSECUTIVE_FAILURES, o gate para de tentar até que uma
   * chamada force=true bem-sucedida o reinicie.
   */
  consecutiveFailures: number;
  // Remover hasFailedCompressionAttempt
}
```

Verificação do cheap-gate dentro da função `compress()` em [:221](packages/core/src/services/chatCompressionService.ts:221):

```ts
// Primeiro, os cheap gates — estes não precisam do histórico curado.
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

Atualizar a desestruturação `const { ... } = opts;` substituindo `hasFailedCompressionAttempt` por `consecutiveFailures`.

Em `chatCompressionService.test.ts`, alterar todos os lugares que passam `hasFailedCompressionAttempt: false/true` para `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES`, ajustando as expectativas dos testes individualmente.

- [ ] **Passo 4: Executar teste para verificar que ele passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

Esperado: PASS

- [ ] **Passo 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): substitui hasFailedCompressionAttempt por disjuntor

Altera de uma trava permanente de disparo único para um disjuntor
de três tentativas (MAX_CONSECUTIVE_FAILURES=3). Um force compress
bem-sucedido (/compress manual, estouro reativo, ou resgate do nível
hard) reinicia o contador. Alinha-se com o design do claude-code e
desbloqueia a recuperação de falhas transitórias (rate limits, erros
transitórios de modelo) que anteriormente desabilitavam a compactação
automática pelo resto da sessão.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase P4 — Configuração: Remover contextPercentageThreshold + aviso de breaking-change

### Tarefa 8: Remover campo + Adicionar warning

**Arquivos:**

- Modificar: `packages/core/src/config/config.ts`
- Modificar: `packages/cli/src/config/settingsSchema.ts` (se houver referência)
- Modificar: `packages/core/src/services/chatCompressionService.ts`
- Modificar: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/config/config.test.ts` (criar se não existir):

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold depreciação', () => {
  it('registra um aviso no stderr quando o campo obsoleto é definido', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... parâmetros mínimos necessários do Config ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold foi removido',
      ),
    );
    warnSpy.mockRestore();
  });

  it('não avisa quando o campo obsoleto está ausente', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... parâmetros mínimos, sem chatCompression.contextPercentageThreshold ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **Passo 2: Executar teste para verificar que ele falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

Esperado: FAIL — O Config atualmente aceita completamente este campo, sem warning.

- [ ] **Passo 3: Implementar — Alterar ChatCompressionSettings + construtor do Config**

Em [config.ts:217-227](packages/core/src/config/config.ts:217):

```ts
export interface ChatCompressionSettings {
  /**
   * Tokens estimados para uma única parte inline de imagem/documento ao
   * ratear caracteres pelo histórico em `findCompressSplitPoint`.
   * Também usado como orçamento reserva ao remover mídia inline
   * do prompt de compactação side-query. Padrão 1600.
   * Sobrescrita por env: `QWEN_IMAGE_TOKEN_ESTIMATE`.
   */
  imageTokenEstimate?: number;
}
```

(Remover o campo `contextPercentageThreshold`.)
[config.ts](packages/core/src/config/config.ts) Encontre no construtor da Config o local onde `params.chatCompression` é tratado (aproximadamente linha 933). Antes da atribuição, adicione:

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

`chatCompressionService.ts` também precisa de limpeza: [:214-217](packages/core/src/services/chatCompressionService.ts:214) — esse trecho já foi removido na Task 6. Verifique se ainda existem resquícios de `chatCompressionSettings?.contextPercentageThreshold` ou da constante exportada `COMPRESSION_TOKEN_THRESHOLD` no arquivo:

- Se `COMPRESSION_TOKEN_THRESHOLD` não tiver mais nenhuma referência, remova a constante.
- Se ainda houver referências (por exemplo, em telemetry ou doc), altere para referenciar `DEFAULT_PCT`.

cli/config/settingsSchema.ts não precisa ser alterado — `chatCompression` continua como `type: 'object'`, sem campo no schema (veja [settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)). Se houver alguma referência a `contextPercentageThreshold` dentro do schema, remova-a.

- [ ] **Step 4: Execute o teste para verificar se passa**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

Esperado: PASS (incluindo os testes existentes relacionados à compressão)

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

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

## Fase P3 — resgate automático da camada hard

### Task 9: Adicionar verificação hard + compressão forçada na entrada do sendMessageStream

**Arquivos:**

- Modificar: `packages/core/src/core/geminiChat.ts`
- Modificar: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Step 1: Escreva o teste que irá falhar**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // 构造 200K 窗口：hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // 本轮 user message 估算 + 176K 越过 177K
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
    // 先制造 3 次失败，使 consecutiveFailures = 3
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 第 4 次：token 跨越 hard，hard rescue 重置熔断器并 force=true
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Step 2: Execute o teste para verificar que falha**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

Esperado: FAIL — atualmente o sendMessageStream sempre chama tryCompress com `force=false`.

- [ ] **Step 3: Implemente — adicione a verificação hard na entrada do sendMessageStream**

No arquivo [geminiChat.ts:560-567](packages/core/src/core/geminiChat.ts:560):

```ts
// Hard-tier rescue: if pending prompt is large enough to risk overflow,
// force compress before the send and reset the failure counter so a
// session already in circuit-breaker NOOP can recover. This proactively
// covers what reactive overflow (line ~711) would otherwise catch
// after a wasted round-trip.
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

Observação: `createUserContent` já é chamado internamente no sendMessageStream na linha [:569](packages/core/src/core/geminiChat.ts:569); agora estamos chamando antes. Portanto, a linha [:569](packages/core/src/core/geminiChat.ts:569) (`const userContent = createUserContent(params.message);`) pode ser removida/substituída por `const userContent = pendingUserMessage;`.

Adicione os imports: `import { computeThresholds } from '../services/chatCompressionService.js';`
Adicione o import: `import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Step 4: Execute o teste para verificar que passa**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Esperado: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: Commit**

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

## Fase P5 — Mudanças na UI (reescrita de dicas + exibição do /context)

### Task 10: Reescrever três dicas context-\* no tipRegistry

**Arquivos:**

- Modificar: `packages/cli/src/services/tips/tipRegistry.ts`
- Modificar: `packages/cli/src/services/tips/tipRegistry.test.ts` (criar se não existir)
- Modificar: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Step 1: Escreva o teste que irá falhar**

`packages/cli/src/services/tips/tipRegistry.test.ts`:

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
    // 三条 tip 在缺 thresholds 时应该都不触发（不能比较）
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Execute o teste para verificar que falha**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

Esperado: FAIL — `TipContext` não possui o campo `thresholds`; as três dicas ainda disparam baseadas nos percentuais 50/80/95.

- [ ] **Step 3: Implemente — altere o tipRegistry**

Em [tipRegistry.ts:15-21](packages/cli/src/services/tips/tipRegistry.ts:15):

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
   * Three-tier auto-compaction thresholds, computed by callers.
   * Optional for backward compat; tip checks return false when missing.
   */
  thresholds?: CompactionThresholds;
}
```

Mantenha `getContextUsagePercent` (pode ser usado por outras dicas de startup), mas as dicas context-\* não dependerão mais dela.

Substitua o `isRelevant` das três dicas em [tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37):

```ts
export const tipRegistry: ContextualTip[] = [
  // --- Post-response contextual tips (priority: higher = more urgent) ---
  {
    id: 'context-critical',
    content:
      'Context near hard limit — auto-compact will force on next send. Consider /clear if you want to start fresh.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.hard,
    cooldownPrompts: 3,
    priority: 100,
  },
  {
    id: 'context-high',
    content: 'Context is getting full. Use /compress to free up space.',
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
    content: 'Long conversation? /compress summarizes history to free context.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.warn &&
      ctx.lastPromptTokenCount < ctx.thresholds.auto &&
      ctx.sessionPromptCount > 5,
    cooldownPrompts: 10,
    priority: 50,
  },

  // --- Startup tips ---  ← 保持不变
  // ... 后面 startup tips 不动 ...
```

Em `packages/cli/src/ui/AppContainer.tsx:1150` (próximo ao ponto de construção das dicas contextuais), altere para:

```tsx
// pseudo — 具体取决于现有代码
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

Adicione o import no AppContainer.tsx:

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Step 4: Execute o teste para verificar que passa**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

Esperado: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

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

### Task 11: Comando /context exibe os três níveis de threshold

**Arquivos:**

- Modificar: `packages/cli/src/ui/commands/contextCommand.ts`
- Modificar: `packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Step 1: Escreva o teste que irá falhar**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // 在 warn 与 auto 之间
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

- [ ] **Step 2: Execute o teste para verificar que falha**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

Esperado: FAIL — atualmente [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) usa a fórmula `(1 - threshold) * contextWindowSize`, exibindo apenas um único valor "autocompactBuffer".

- [ ] **Step 3: Implemente — altere a saída do contextCommand**

Substitua o trecho [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177):

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... 在 buildContextSummary 或类似入口里：
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// 在格式化输出部分追加：
const lines = [
  // ... 现有输出 ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

Nota: `formatNum` é a função existente no projeto (`.toLocaleString()`, etc.); se não estiver no arquivo, pode-se usar uma função inline `(n: number) => n.toLocaleString('en-US')`.

**Remova** também o código antigo que calculava `autocompactBuffer` ([:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)) e o uso de `compressionThreshold` — agora use diretamente `auto`.

- [ ] **Step 4: Execute o teste para verificar que passa**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

Esperado: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

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

## Verificação (regressão final completa)

Após implementar todas as tasks, execute a validação completa:

- [ ] **Step 1: Testes completos**

```bash
npm test
```

Esperado: Todos os testes de todos os workspaces passam.

- [ ] **Step 2: Typecheck completo**

```bash
npm run typecheck
```

- [ ] **Step 3: Lint completo**

```bash
npm run lint
```

- [ ] **Step 4: Smoke manual**

Inicie o CLI e execute:

1. `/context` — verifique se a nova exibição de três níveis está correta
2. Execute uma conversa que dispare compressão (use um modelo com janela de 200K e encha o prompt com 170K+)
3. Defina `chatCompression.contextPercentageThreshold = 0.5` na inicialização — verifique se o aviso de depreciação aparece no stderr
4. Use `--continue` para restaurar uma sessão enorme; verifique se a compressão é acionada pelo caminho de estimativa na primeira chamada de envio

- [ ] **Step 5: Script unificado de descrição de PR (opcional)**

Se os PRs forem enviados em lotes, cada descrição de PR deve linkar para [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) e indicar a Fase / Task.