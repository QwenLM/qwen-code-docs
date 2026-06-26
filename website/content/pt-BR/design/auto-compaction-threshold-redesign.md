# Redesenho do Limiar de Auto-Compactação

**Status:** Rascunho · 2026-05-14

## Contexto

> Esta seção descreve o estado **antes** da implementação deste PR (comportamento pré-redesenho). Os símbolos `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt` e as referências específicas a file:line correspondem ao código anterior à fusão do PR #4345 — após a fusão, esses símbolos/números de linha não serão mais válidos.

Atualmente, a compactação automática do qwen-code usa apenas um limiar de proporção única `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), compartilhando a mesma proporção para todos os tamanhos de janela. Em comparação com a "escada de tokens absolutos" do claude-code (autoCompact.ts:62-65), o qwen-code apresenta três problemas específicos:

1. **Reserva excessiva em janelas grandes**: O limiar de 70% do modelo de 1M dispara em 700K, restando 300K, muito além dos ~33K realmente necessários para resumo + saída
2. **Bloqueio permanente após 1 falha**: Após `hasFailedCompressionAttempt = true`, toda a sessão não tenta mais auto-compactação (geminiChat.ts:504), mais rigoroso que o "disjuntor de 3 falhas consecutivas" do claude-code
3. **Sistema de dicas desconectado do limiar de auto-compactação**: As três dicas `context-*` no `tipRegistry.ts` usam porcentagens fixas de 50/80/95, completamente independentes do limiar de auto-compactação (70%). Isso significa que, no caminho principal onde a "auto-compactação funciona normalmente", as dicas de 80%/95% raramente são acionadas; já nos caminhos marginais de "falha da auto-compactação / fallback reativo", falta semântica alinhada com o limiar
4. **A chamada de compactação em si não tem controle de orçamento de saída**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) ativa explicitamente `thinkingConfig.includeThoughts = true` (comentário: "Compression quality drives every subsequent main turn"), enquanto a chamada `sideQuery` não define limite superior de `maxOutputTokens`. O comentário do código ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) também admite que `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Quando a compactação está perto do topo da janela, a saída total pode inflar, tornando a reserva de buffer imprevisível.<br/><br/>Pior ainda, o comportamento varia entre provedores: no Anthropic, o thinking budget e o max_tokens são completamente independentes; no OpenAI, os reasoning tokens não são limitados por max_completion_tokens; o comportamento do Gemini varia conforme a versão do modelo. Isso significa que "apenas adicionar maxOutputTokens para controlar a saída total" não é válido em um projeto multiprovedor como o qwen-code

5. **O `lastPromptTokenCount` usado na verificação do limiar é sistematicamente subestimado.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) mostra que esse valor vem do `usageMetadata.totalTokenCount` da resposta anterior da API. Duas lacunas: (a) não inclui a mensagem do usuário que será adicionada na rodada atual, então cada verificação cheap-gate é menor que o prompt real; (b) o valor inicial da primeira rodada é 0, e ao restaurar uma sessão grande com `--continue` / sub-agente herdar muito histórico, o primeiro envio sempre ignora todos os limiares. Em contraste, o `tokenCountWithEstimation` do claude-code ([query.ts:638](src/query.ts:638)) usa um sistema de dois trilhos "último uso da API do assistente + estimativa de mensagens adicionadas depois" que fecha essas duas lacunas

## Objetivos de Design

- Introduzir um limiar misto "proporção + absoluto", onde modelos de janela grande são controlados pelo valor absoluto e janelas pequenas ainda usam a proporção como fallback
- Adicionar camadas warn / hard (auto permanece como ponto principal de disparo), formando uma escada de três níveis
- Reescrever o sistema de dicas para seguir as condições de disparo dos novos limiares
- Atualizar o tratamento de falhas de "bloqueio permanente após 1 falha" para "disjuntor de 3 falhas + recuperação automática"
- **Desligar o thinking na chamada de compactação e adicionar limite superior de `maxOutputTokens`**: Alinhar com o claude-code, para que a saída total seja restrita por um único parâmetro e o orçamento do buffer seja previsível; aceitar a possível degradação da qualidade da compactação
- **Adicionar compensação de estimativa de tokens**: Eliminar dois vieses sistemáticos de subestimação do `lastPromptTokenCount` ("atraso de uma rodada" e "primeira rodada como 0"), aproximando a verificação do limiar do tamanho real do prompt
- Remover a entrada de configuração `contextPercentageThreshold` das configurações (a constante interna PCT permanece)
- **Não introduzir** canais de substituição por env, **não** adicionar chave de ativação explícita

## Escada de Limiar de Três Níveis

```
                       window  (janela de contexto bruta)
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

### Semântica dos Três Níveis

| Nível      | Condição de Disparo                | Comportamento                                                     |
| ---------- | ---------------------------------- | ----------------------------------------------------------------- |
| **warn**   | `tokenCount >= warn_threshold`     | Aviso na UI "Faltam X tokens para a compactação automática", não altera o comportamento de envio |
| **auto**   | `tokenCount >= auto_threshold`     | Antes do envio, `tryCompress(force=false)`, fluxo de compactação normal |
| **hard**   | `tokenCount >= hard_threshold`     | Antes do envio, `tryCompress(force=true)`, redefine o bloqueio de falhas e força a compactação |

O nível `hard` equivale a antecipar a lógica de fallback reativo existente (geminiChat.ts:711) para antes do envio, evitando uma viagem de ida e volta com uma solicitação superdimensionada que falha.

## Constantes Internas

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // fallback de proporção para auto
const WARN_PCT_OFFSET = 0.1; // proporção warn = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // limite superior rígido de saída para sideQuery de compactação (thinking + resumo)
const SUMMARY_RESERVE = 20_000; // reserva de saída subtraída do topo da janela na escada de limiar = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // distância entre auto e effectiveWindow
const WARN_BUFFER = 20_000; // distância entre warn e auto
const HARD_BUFFER = 3_000; // distância entre hard e effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // limite do disjuntor de falhas
```

Valores: todos herdados dos valores validados empiricamente do claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` é a relação chave: o modelo está restrito pelo limite rígido de `maxOutputTokens`, a saída não pode exceder 20K, portanto a reserva não precisa de margem de segurança extra. Nota: com o thinking desligado neste design, essa igualdade se mantém (todo o orçamento de saída vai para o resumo); se o thinking for mantido, `thinking + resumo` compartilham o orçamento (semântica do `maxOutputTokens` no SDK Gemini / na maioria dos provedores), e o modelo distribui entre ambos, resultando em espaço real disponível para o resumo menor que 20K (veja "Riscos e Observações", itens 1 e 2).

## Função de Cálculo

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // quando hard < auto, iguala-se a auto (degradação para janelas pequenas)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // degrada para auto em janelas pequenas

  return { warn, auto, hard, effectiveWindow };
}
```
### Dados de medição

| Janela | warn        | auto        | hard         | Observações                     |
| ------ | ----------- | ----------- | ------------ | ------------------------------- |
| 32K    | 19,2K (pct) | 22,4K (pct) | 22,4K (degr.) | Fallback por proporção          |
| 64K    | 38,4K (pct) | 44,8K (pct) | 44,8K (degr.) | Fallback por proporção          |
| 128K   | 76,8K (pct) | 95K (abs)   | 105K (abs)   | Misto (warn=pct, auto/hard=abs) |
| 200K   | 147K (abs)  | 167K (abs)  | 177K (abs)   | Assumido por absoluto           |
| 256K   | 203K (abs)  | 223K (abs)  | 233K (abs)   | Assumido por absoluto           |
| 1M     | 947K (abs)  | 967K (abs)  | 977K (abs)   | Total absoluto                  |

`(pct)` indica que a camada é determinada pela fórmula de proporção, `(abs)` indica que é determinada pela fórmula de valor absoluto.

## Configuração do usuário

### Alterações no ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Mantido (não relacionado a este design, usado por compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Removido:** campo `contextPercentageThreshold`. Motivos:

1. Com a nova fórmula, para janelas comuns (>= 128K) o campo quase não tem efeito — o valor absoluto assume o controle
2. Em janelas pequenas, a configuração do usuário pode fazer com que o limite seja acionado "mais cedo", o que contraria a intuição de economia de tokens
3. O claude-code não expõe este campo, não há precedente de configuração semelhante exposta ao usuário

### Tratamento de mudanças que quebram compatibilidade

**Lado do usuário:** Na inicialização, se o `Config` carregar `chatCompression.contextPercentageThreshold`:

- Escreve um aviso no stderr: `"chatCompression.contextPercentageThreshold foi removido e agora é controlado por limites embutidos."`
- **Não** gera erro, **não** bloqueia a inicialização
- O valor do campo é ignorado

**Lado do SDK (R5.4):** O campo `hasFailedCompressionAttempt: boolean` em `CompressOptions` foi renomeado para `consecutiveFailures: number`. Duas diferenças:

|      | Campo antigo                  | Novo campo                                                        |
| ---- | ----------------------------- | ----------------------------------------------------------------- |
| Nome | `hasFailedCompressionAttempt` | `consecutiveFailures`                                             |
| Tipo | `boolean`                     | `number`                                                          |
| Semântica | `true` = desabilita permanentemente auto-compact | `>= MAX_CONSECUTIVE_FAILURES` (padrão 3) = desabilita temporariamente até que force tenha sucesso e seja resetado |

No repositório, apenas `GeminiChat.tryCompress` é consumidor interno, então o risco de migração interna é baixo; mas `@qwen-code/qwen-code-core` é um pacote publicado, e `CompressOptions` é visível nos arquivos `.d.ts`. Código downstream que chama diretamente `service.compress({ ..., hasFailedCompressionAttempt: true })` receberá um erro de compilação TypeScript. **Guia de migração:** Substitua `true` por `MAX_CONSECUTIVE_FAILURES` (ou qualquer inteiro >= 3), e `false` por `0`. Se o chamador mantiver sua própria contagem de falhas, basta passar o valor diretamente.

## Compensação de estimativa de tokens

O `lastPromptTokenCount` do qwen-code vem do `usageMetadata.totalTokenCount` da resposta da API anterior ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Isso causa:

1. **Defasagem de uma rodada:** O cheap-gate usa `lastPromptTokenCount` para julgar, mas o prompt real desta requisição = ele + a mensagem do usuário atual. A subtração pode causar falsos negativos no julgamento do limite
2. **Primeira rodada é 0:** O valor inicial é 0. Na primeira requisição, independentemente do tamanho do histórico, nenhum limite (incluindo cenários de retomada com `--continue` / sub-agent) é acionado

Introduzimos uma função de estimativa local leve `estimatePromptTokens` para compensar essas duas lacunas antes do cheap-gate / hard judgment:

```ts
// chatCompressionService.ts (ou novo arquivo packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // Estimativa genérica char/4 (mesma do claude-code)
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input é mais denso

/**
 * Estima o número de tokens de um conjunto de Contents, para compensar a defasagem dos metadados de uso da API.
 * Para image / document, reutiliza o imageTokenEstimate existente (padrão 1600).
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Reutiliza estimateContentChars (compactionInputSlimming.ts), depois divide por bytesPerToken
  // Internamente, para functionCall / functionResponse usa BYTES_PER_TOKEN_JSON
  // ...
}

/**
 * Ponto de entrada unificado para cheap-gate e hard judgment.
 * Caminho principal: lastPromptTokenCount preciso + estimativa da mensagem do usuário atual
 * Caminho da primeira rodada: estimativa do histórico completo
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

Locais de aplicação:

- Cheap-gate de `chatCompressionService.compress()`: substituir a fonte de `originalTokenCount` por `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- Hard judgment na entrada de `geminiChat.sendMessageStream` (veja próxima seção)

**A estimativa é usada apenas para acionamento antecipado, não para "pular acionamento".** Como char/4 é uma estimativa inferior grosseira, ela é segura para falsos positivos (é melhor comprimir um pouco antes), mas não confiável para falsos negativos.

## Alterações na cadeia de acionamento

### chatCompressionService.ts

1. **Exportar `computeThresholds`** para reutilização no cheap-gate / UI / comandos
2. **Cheap-gate de `compress()`** (linhas 221-249):
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
3. **Chamada de `runSideQuery` em `compress()`** (linhas 356-380): desligar thinking + adicionar `maxOutputTokens`:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // Desligar thinking (consistente com claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // Limite máximo de 20K
     },
     // ...
   });
   ```

   Ou simplesmente remover `thinkingConfig` e deixar o valor padrão de `runSideQuery` ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) que por padrão tem `includeThoughts: false`).
Após desativar o pensamento, `maxOutputTokens` restringe diretamente a saída total (não existe o problema de um orçamento separado para pensamento), `SUMMARY_RESERVE = maxOutput = 20K` é uma relação rígida e limpa.

Atualize também o comentário em [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) de "A qualidade da compressão impulsiona cada turno principal subsequente — mantenha o raciocínio ativo" para "Para garantir um limite superior de saída previsível entre provedores, alinhado com o design do claude-code".

O trecho de token math ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) "pode incluir tokens não persistentes (pensamentos)" também pode ser limpo em sincronia.

### geminiChat.ts: Entrada `sendMessageStream` (linha 562)

```ts
// Antes da substituição: tryCompress(force=false)
// Após a substituição: usar tokens estimados para decidir se aciona hard, determinando a flag force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Reinicia o disjuntor, equivalente a force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Atualização do tratamento de falhas (`geminiChat.ts:504-510`)

```ts
// Antes da substituição
hasFailedCompressionAttempt: boolean;

// Após a substituição
consecutiveFailures: number;  // Padrão 0

// Ramo de falha
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Ramo de sucesso
this.consecutiveFailures = 0;
```

Chamadas com `force=true` que falham não são contabilizadas (mantendo a semântica atual de reativo / manual de não "consumir a cota").

## Alterações na UI

### tipRegistry.ts reescrever três tips context-\*

As três camadas de limite correspondem exatamente às três tips. Mapeamento (do menor para o maior número de tokens):

| Tip ID             | Condição atual                               | Nova condição                                                        | Alteração no texto                                       |
| ------------------ | -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5`| `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`  | Permanece inalterada                                     |
| `context-high`     | `pct >= 80 && < 95`                          | `tokenCount >= auto && tokenCount < hard`                            | Permanece inalterada                                     |
| `context-critical` | `pct >= 95`                                  | `tokenCount >= hard`                                                 | Adicionar frase "Auto-compact will force on next send." refletindo o novo comportamento da camada hard |

**Impacto na frequência de ativação:**

- Caminho principal (auto funcionando normalmente): Quando `tokenCount` ultrapassa auto, a compressão é acionada imediatamente e, na próxima rodada, o tokenCount cai. Portanto, `context-high` fica visível apenas brevemente entre "o acionamento e o efeito da compressão".
- Caminho marginal (auto falha / disjuntor / reativo não acompanha): O `tokenCount` continua subindo, atravessando sequencialmente warn → auto → hard, acionando as três tips, consistente com a percepção do usuário de "contexto cada vez mais apertado".
- Quando `context-critical` é acionada, a camada hard já executou force compress antes do send (veja a seção de alterações no fluxo de acionamento do spec). Portanto, esta tip é na verdade um "aviso pós-resgate", não um "alerta pré-resgate". Adicione uma frase para esclarecer.

A interface `TipContext` adiciona:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Novo: permite que a função isRelevant acesse os limites.
  // computeThresholds é calculado pelo chamador e injetado, evitando dependência direta do core no tipRegistry.
  thresholds?: CompactionThresholds;
}
```

Em `AppContainer.tsx:1150`, ao construir `TipContext`, injete em sincronia.

### Sincronização do comando /context (`contextCommand.ts:177-183`)

```ts
// Substituir o hardcoded (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Exibir quatro linhas:
//   Effective window:   180K   (window − 20K reserve)
//   Warn threshold:     147K   (...)
//   Auto threshold:     167K   ← posição atual
//   Hard threshold:     177K
// Marcar em qual nível o token count atual se encontra
```

### Indicador contínuo no Footer (opcional, follow-up)

Este spec não exige a implementação de um indicador contínuo no footer, pelos seguintes motivos:

- O sistema de tips existente já pode exibir avisos no histórico.
- Um indicador contínuo no footer exigiria alterações na renderização do ink e aumentaria a frequência de redesenhos.
- Pode ser tratado como follow-up deste spec (PR independente).

Se for implementado posteriormente, a condição de ativação sugerida é `tokenCount >= warn && tokenCount < auto`. Após ultrapassar auto, o indicador é ocultado (a compressão já começou).

## Cobertura de Testes

### Testes unitários (chatCompressionService.test.ts)

- `computeThresholds(32K)` → Ramo de fallback por proporção (warn/auto ambos pct, hard degradado)
- `computeThresholds(128K)` → Ramo misto (warn=pct, auto=abs, hard=abs)
- `computeThresholds(200K)` → Ramo de substituição absoluta (warn/auto/hard todos abs)
- `computeThresholds(1M)` → Ramo totalmente absoluto
- `computeThresholds(window=10K)` → Janela muito pequena (todos os valores absolutos negativos), a fórmula não quebra
- Os três níveis de limite sempre satisfazem `warn <= auto <= hard`
- A fórmula max() é estável nos pontos de fronteira (pct * window == abs)

### Testes unitários (tokenEstimation.test.ts)

- `estimateContentTokens` para texto puro / json / functionCall / functionResponse / image / document, cada um seguindo seu respectivo bytesPerToken
- `estimatePromptTokens` com `lastPromptTokenCount > 0` segue o "caminho principal"; com valor 0, segue o "caminho da primeira rodada"
- Mensagem grande do usuário, após ser adicionada na fase cheap-gate, consegue ultrapassar o limite auto
- Desvio entre a estimativa e o uso real da API dentro de ±30% (regressão com amostras reais de histórico)

### Testes de integração (geminiChat.test.ts / chatCompressionService.test.ts)

- Após 3 falhas consecutivas, cheap-gate vira NOOP; na próxima chamada com force, recupera
- Falha única não bloqueia mais permanentemente
- Quando o token estimado ultrapassa hard, o send aciona automaticamente force compress
- A chamada de compressão sideQuery com `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` é corretamente propagada para `runSideQuery`, com `thinkingConfig.includeThoughts` como `false` (ou assumido pelo valor padrão do sideQuery)
- **Cobertura da primeira rodada**: Construir um chat com `lastPromptTokenCount = 0` mas com histórico grande (simulando recuperação com `--continue`). No primeiro send, o limite auto pode ser acionado pelo caminho de estimativa.
### Testes de Compatibilidade

- Ao definir `contextPercentageThreshold = 0.5` na inicialização → aviso em stderr + campo ignorado, comportamento segue a constante PCT interna.

### Testes do Sistema de Tip (tipRegistry.test.ts)

- As três tips context-\* disparam corretamente ao cruzar os níveis warn/auto/hard, sem sobreposição de intervalos.
- No caminho principal, o acionamento do limite auto pela compressão impede que `context-high` permaneça visível.
- No caminho de borda (circuito aberto + tokens continuando a subir), as três tips disparam sequencialmente.
- Quando TipContext não possui `thresholds` (fallback), o comportamento é razoável.

## Implementação em Fases

| Fase | Conteúdo                                                                                             | Independência             |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| 1    | Constantes internas + `computeThresholds` + alterações no cheap-gate (sem estimativa de compensação) | Mesclável independentemente |
| 2    | Atualização do tratamento de falha (1 → 3 circuit breakers)                                          | Mesclável independentemente |
| 3    | Antecipação do force compress na camada hard                                                         | Depende de P1 + P7        |
| 4    | Mudanças na superfície de configuração + aviso de breaking change                                    | Depende de P1             |
| 5    | UI (reescrita de tips + /context)                                                                    | Depende de P1             |
| 6    | Compressão sideQuery desativando thinking + adicionar limite `maxOutputTokens`                       | Independente, pode ser implementado antes de P1 |
| 7    | Estimativa de compensação de tokens (`estimateContentTokens` + `estimatePromptTokens`, aplicados ao cheap-gate / hard) | Independente, pode ocorrer em paralelo com P1 |

Cada Fase pode ser um PR independente. Ordem de merge sugerida: **P6 → P7 → P1 → P2 → P4 → P3 → P5**: primeiro aplicar o limite `maxOutputTokens` nas chamadas de compressão (tornando a suposição do buffer confiável); depois adicionar a estimativa de compensação (tornando a contagem de tokens mais confiável); em seguida, implementar a infraestrutura de limites; depois o circuit breaker de falhas e alterações na superfície de configuração; por último, ativar o salvamento ativo da camada hard (neste momento já temos contagem de tokens confiável + circuit breaker). Cada PR pode ser validado e revertido independentemente.

## Riscos e Observações

1. **Desativar o thinking pode afetar a qualidade do resumo.** O comentário original "Compression quality drives every subsequent main turn — keep reasoning on" já expressava essa preocupação. A decisão deste spec é priorizar "limite previsível de tokens" sobre "maximizar qualidade", mas após a implementação será necessário observar a distribuição de `compression_input_token_count` / `compression_output_token_count` na telemetria, bem como mudanças na qualidade das conversas principais após a compressão (feedback do usuário, taxa de status `COMPRESSION_FAILED_*`). Se a qualidade cair significativamente, considerar reverter para thinking ativado + controle provider-specific thinkingBudget.

2. **`maxOutputTokens` no limite pode truncar o resumo.** Após desligar o thinking, o limite de 20K restringe diretamente o corpo do resumo; dados reais do claude-code mostram p99,99 ≈ 17K, deixando ~3K de margem de segurança. Mas o prompt de compressão do qwen-code difere do claude-code, e a distribuição precisa ser observada. Recomenda-se adicionar, no branch de falha de compressão ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)), um caminho NOOP para "detectar finish_reason = MAX_TOKENS", evitando persistir um resumo truncado.

3. **Diferenças no mapeamento de maxOutputTokens entre providers.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. Atualmente, o qwen-code já possui esse mapeamento ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) e outros), sendo necessário verificar na implementação do P6 se o campo `maxOutputTokens` realmente percorre o corpo da requisição para todos os providers no caminho sideQuery.

4. **A estimativa de tokens é um limite inferior aproximado e não deve ser usada como critério para "pular acionamento".** O desvio de `char/4` para o tokenizador real de cada provider pode chegar a ±30%. Este spec usa a estimativa apenas para "antecipar o acionamento do limite" (direção falso-positivo, melhor comprimir cedo do que tarde). Todos os caminhos de código que "reduzem a contagem de tokens / pulam compressão" ainda devem usar `lastPromptTokenCount` (valor autoritativo da API).

5. **Relação entre a função de estimativa e a existente `estimateContentChars`.** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) já possui `estimateContentChars` (usada para cálculo de split point de compressão). A nova `estimateContentTokens` deve reutilizá-la (dividindo por bytesPerToken) em vez de criar um novo conjunto, para evitar divergência entre as duas estimativas.

## Fora do Escopo deste Spec

- Canal de sobrescrita por variáveis de ambiente (Plano D): manter o princípio "mínima superfície de configuração"
- Visualização permanente no Footer: deixado para follow-up
- Melhoria do prompt de resumo, ajuste de `MIN_COMPRESSION_FRACTION`: ortogonal ao design de limites

## Perguntas em Aberto (aguardando review)

1. **Intensidade do breaking change**: aviso + campo ignorado vs erro na inicialização. Atualmente optamos por aviso, é necessário confirmar se é amigável o suficiente para implantações corporativas/equipes com configurações.

## Encerrados

2. **Em janelas pequenas (≤ ~76,7K), hard e auto se degeneram no mesmo valor** — Decidiu-se **não exibir explicitamente em `/context`**. Motivos:
   - A faixa de colapso não é apenas 32K; todas as janelas onde `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` colapsam (incluindo 64K)
   - O comportamento do usuário não muda: em janelas colapsadas, `currentTier` pula `'auto'` e informa diretamente `'hard'` (`contextCommand.ts:43-44` verifica primeiro `>= hard`), a banda `context-high` (`auto ≤ t < hard`) torna-se vazia. Ter menos um nível de dica em janelas pequenas é razoável — a janela já é pequena, e usuários provavelmente gerenciam o contexto manualmente
   - Se no futuro houver relatos reais de usuários "não vejo a dica do nível intermediário em janelas pequenas", então decidir adicionar anotação na UI ou ajustar a condição de disparo de `context-high` (isso é trabalho de UI, não de spec). Atualmente optamos por não aumentar a complexidade da UI.
