# Redesenho do Limiar de Autocompactação

**Status:** Rascunho · 2026-05-14

## Contexto

> Esta seção descreve o estado **anterior** à implementação deste PR (comportamento pré-redesenho). As referências a `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt` e as referências específicas de file:line correspondem ao código anterior à fusão do PR #4345 — após a fusão, esses símbolos/linhas não serão mais válidos.

Atualmente, a autocompactação do qwen-code usa apenas um único limiar proporcional `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), compartilhando a mesma proporção para todos os tamanhos de janela. Comparado com a "escada de tokens absolutos" do claude-code (`autoCompact.ts:62-65`), o qwen-code apresenta três problemas específicos:

1. **Reserva excessiva em janelas grandes**: O limite de 70% em um modelo de 1M dispara em 700K, restando 300K — muito além dos ~33K realmente necessários para sumarização + saída
2. **Bloqueio permanente após 1 falha**: Após `hasFailedCompressionAttempt = true`, a sessão inteira não tenta mais autocompactar (`geminiChat.ts:504`), mais rigoroso que o "disjuntor de 3 falhas consecutivas" do claude-code
3. **Sistema de dicas desconectado do limiar de autocompactação**: As três dicas `context-*` em `tipRegistry.ts` usam percentuais fixos de 50/80/95, completamente independentes do limiar de autocompactação (70%). Isso significa que, no caminho principal onde "a autocompactação funciona normalmente", as dicas de 80%/95% raramente são acionadas; já nos caminhos marginais de "falha de autocompactação / contingência reativa", falta semântica alinhada com os limiares
4. **A própria chamada de compactação não tem controle de orçamento de saída**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) ativa explicitamente `thinkingConfig.includeThoughts = true` (comentário: "Compression quality drives every subsequent main turn"), enquanto a chamada sideQuery não define limite `maxOutputTokens`. O comentário do código ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) também reconhece que `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Quando a compactação se aproxima do topo da janela, a saída total pode inflar, tornando a reserva de buffer imprevisível.<br/><br/>Pior ainda, o comportamento é inconsistente entre provedores: o orçamento de thinking da Anthropic é completamente independente de max_tokens; os tokens de reasoning da OpenAI não são limitados por max_completion_tokens; o comportamento do Gemini varia conforme a versão do modelo. Isso significa que "simplesmente adicionar maxOutputTokens para controlar a saída total" não é válido em um projeto multiprovedor como o qwen-code

5. **O `lastPromptTokenCount` usado na verificação do limiar é sistematicamente subestimado.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) mostra que esse valor vem do `usageMetadata.totalTokenCount` da resposta anterior da API. Duas lacunas: (a) não inclui a mensagem do usuário que será adicionada nesta rodada — cada verificação cheap-gate é menor que o prompt real; (b) o valor inicial é 0 — ao usar `--continue` para restaurar uma sessão grande ou um sub-agent herdar muito histórico, o primeiro envio sempre ignora todos os limiares. Comparado com `tokenCountWithEstimation` do claude-code ([query.ts:638](src/query.ts:638)), que usa um sistema duplo de "último uso da API assistant + estimativa de mensagens adicionadas após", essas duas lacunas são fechadas

## Objetivos de Design

- Introduzir um limiar híbrido "proporcional + absoluto", permitindo que modelos de janela grande sejam controlados pelo valor absoluto, enquanto janelas pequenas ainda usam a proporção como fallback
- Adicionar duas novas camadas (warn / hard), mantendo a auto como ponto de disparo principal, formando uma escada de três níveis
- Reescrever o sistema de dicas para seguir as novas condições de disparo dos limiares
- Atualizar o tratamento de falhas de "bloqueio permanente após 1 falha" para "disjuntor de 3 falhas + recuperação automática"
- **Desligar o thinking na chamada de compactação e adicionar limite `maxOutputTokens`**: alinhar com o claude-code, para que a saída total seja restrita por um único parâmetro e o orçamento do buffer seja previsível; aceitar a possível degradação na qualidade da compactação
- **Adicionar compensação de estimativa de tokens**: eliminar as duas subestimações sistemáticas do `lastPromptTokenCount` ("defasagem de uma rodada" e "zero na primeira rodada"), tornando a verificação do limiar mais próxima do tamanho real do prompt
- Remover a entrada de configuração `contextPercentageThreshold` das configurações (a constante PCT interna permanece)
- **Não introduzir** canais de override por env, **não** adicionar nova chave de ativação explícita

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

| Nível      | Condição de Disparo                     | Comportamento                                                     |
| ---------- | --------------------------------------- | ----------------------------------------------------------------- |
| **warn**   | `tokenCount >= warn_threshold`          | Dica na interface "Faltam X tokens para a compactação automática", não altera o comportamento de envio |
| **auto**   | `tokenCount >= auto_threshold`          | Executa `tryCompress(force=false)` antes do envio, fluxo de compactação normal |
| **hard**   | `tokenCount >= hard_threshold`          | Executa `tryCompress(force=true)` antes do envio, redefine o bloqueio de falhas e força a compactação |

O nível `hard` equivale a antecipar a lógica de contingência reativa existente (`geminiChat.ts:711`) para antes do envio, evitando uma viagem de ida e volta com uma requisição oversized que falharia.

## Constantes Internas

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // fallback proporcional para auto
const WARN_PCT_OFFSET = 0.1; // proporção warn = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // limite superior rígido de saída da sideQuery de compactação (thinking + sumário)
const SUMMARY_RESERVE = 20_000; // reserva de saída subtraída do topo da janela na escada = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // espaçamento entre auto e effectiveWindow
const WARN_BUFFER = 20_000; // espaçamento entre warn e auto
const HARD_BUFFER = 3_000; // espaçamento entre hard e effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // limiar do disjuntor de falhas
```

Origem dos valores: todos herdados dos valores medidos do claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` é uma relação fundamental: o modelo é restrito pelo limite rígido de `maxOutputTokens`, a saída não pode exceder 20K, portanto a reserva não precisa de margem de segurança adicional. Nota: este design assume que o thinking está desligado para que a igualdade seja válida (todo o orçamento de saída vai para o sumário); se o thinking for mantido, `thinking + sumário` compartilham o orçamento (semântica de `maxOutputTokens` do Gemini SDK / da maioria dos provedores), e o modelo aloca entre eles, resultando em espaço disponível para o sumário menor que 20K (veja "Riscos e Considerações", itens 1 e 2).

## Função de Cálculo

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // quando hard < auto, iguala-se a auto (degeneração em janelas pequenas)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // degenera para auto em janelas pequenas

  return { warn, auto, hard, effectiveWindow };
}
```

### Dados Medidos

| Janela | warn         | auto         | hard          | Observação                       |
| ------ | ------------ | ------------ | ------------- | -------------------------------- |
| 32K    | 19,2K (pct)  | 22,4K (pct)  | 22,4K (deg.)  | Fallback proporcional            |
| 64K    | 38,4K (pct)  | 44,8K (pct)  | 44,8K (deg.)  | Fallback proporcional            |
| 128K   | 76,8K (pct)  | 95K (abs)    | 105K (abs)    | Híbrido (warn=pct, auto/hard=abs) |
| 200K   | 147K (abs)   | 167K (abs)   | 177K (abs)    | Absoluto assume                  |
| 256K   | 203K (abs)   | 223K (abs)   | 233K (abs)    | Absoluto assume                  |
| 1M     | 947K (abs)   | 967K (abs)   | 977K (abs)    | Totalmente absoluto              |

`(pct)` indica que o nível é determinado pela fórmula proporcional, `(abs)` indica que é determinado pela fórmula absoluta.

## Configuração do Usuário

### Alterações no ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Mantido (não relacionado a este design, usado por compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Removido:** campo `contextPercentageThreshold`. Motivos:

1. Com a nova fórmula, para janelas comuns (>= 128K), este campo quase não tem efeito — o valor absoluto assume o controle
2. Em janelas pequenas, a configuração do usuário pode fazer o limiar disparar "mais cedo", contradizendo a intuição de economia de tokens
3. O claude-code não expõe este campo, não há precedente de configuração semelhante para o usuário

### Tratamento de Breaking Change

**Para o usuário:** Ao carregar a `Config` na inicialização, se `chatCompression.contextPercentageThreshold` estiver presente:

- Escrever um aviso no stderr: `"chatCompression.contextPercentageThreshold foi removido e agora é controlado por limiares internos."`
- **Não** gerar erro, **não** bloquear a inicialização
- O valor do campo é ignorado

**Para o SDK (R5.4):** O campo `hasFailedCompressionAttempt: boolean` em `CompressOptions` é renomeado para `consecutiveFailures: number`. Duas diferenças:

|       | Campo Antigo                   | Novo Campo                                                    |
| ----- | ------------------------------ | ------------------------------------------------------------- |
| Nome  | `hasFailedCompressionAttempt`  | `consecutiveFailures`                                         |
| Tipo  | `boolean`                      | `number`                                                      |
| Semântica | `true` = desabilita autocompactação permanentemente | `>= MAX_CONSECUTIVE_FAILURES` (padrão 3) = desabilita temporariamente até que force tenha sucesso e redefina |

Dentro do repositório, apenas `GeminiChat.tryCompress` é um consumidor interno, então o risco de migração interna é baixo; mas `@qwen-code/qwen-code-core` é um pacote publicado, `CompressOptions` é visível nos arquivos d.ts, e código downstream que chama diretamente `service.compress({ ..., hasFailedCompressionAttempt: true })` receberá um erro de compilação do TypeScript. **Guia de migração:** Substitua `true` por `MAX_CONSECUTIVE_FAILURES` (ou qualquer inteiro >= 3) e `false` por `0`. Se o chamador mantiver sua própria contagem de falhas, basta passar o valor diretamente.

## Compensação de Estimativa de Tokens

O `lastPromptTokenCount` do qwen-code vem do `usageMetadata.totalTokenCount` da resposta anterior da API ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Isso causa:

1. **Defasagem de uma rodada**: O cheap-gate usa `lastPromptTokenCount` para a verificação, mas o prompt real do envio atual = ele + a mensagem do usuário desta rodada. O valor subestimado pode causar um falso-negativo na verificação do limiar
2. **Zero na primeira rodada**: O valor inicial é 0; no primeiro envio, independentemente do tamanho do histórico, nenhum limiar é acionado (incluindo cenários de `--continue` para restaurar / herança de sub-agent)

Introduzir uma função leve de estimativa local `estimatePromptTokens` para compensar essas duas lacunas nas verificações cheap-gate / hard antes do envio:

```ts
// chatCompressionService.ts (ou novo arquivo packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // estimativa genérica char/4 (mesma do claude-code)
const BYTES_PER_TOKEN_JSON = 2; // entrada JSON / tool_call mais densa

/**
 * Estima o número de tokens de um conjunto de Content, usado para compensar a defasagem
 * dos metadados de uso da API.
 * Para image / document, reutiliza o imageTokenEstimate existente (padrão 1600).
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Reutiliza estimateContentChars (compactionInputSlimming.ts) e divide por bytesPerToken
  // Internamente, usa BYTES_PER_TOKEN_JSON para functionCall / functionResponse
  // ...
}

/**
 * Ponto de entrada unificado para verificações cheap-gate e hard.
 * Caminho principal: lastPromptTokenCount preciso + estimativa da mensagem do usuário desta rodada
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

- Cheap-gate de `chatCompressionService.compress()`: substituir a origem de `originalTokenCount` por `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- Verificação hard na entrada de `geminiChat.sendMessageStream` (veja próxima seção)

**A estimativa é usada apenas para disparar antecipadamente, nunca para "pular o disparo".** Como char/4 é uma estimativa aproximada inferior, é segura como falso-positivo (melhor compactar um pouco antes), mas não confiável como falso-negativo.

## Alterações na Cadeia de Disparo

### chatCompressionService.ts

1. **Exportar `computeThresholds`**, para ser reutilizado pelo cheap-gate / interface / comandos
2. **Cheap-gate de `compress()`** (linha 221-249):
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
3. **Chamada a `runSideQuery` em `compress()`** (linha 356-380): desligar thinking + adicionar `maxOutputTokens`:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // desligar thinking (consistente com claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // limite superior rígido de 20K
     },
     // ...
   });
   ```

   Ou simplesmente remover `thinkingConfig` e deixar o valor padrão de `runSideQuery` ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) padrão `includeThoughts: false`) assumir.

   Com o thinking desligado, `maxOutputTokens` restringe diretamente a saída total (não há problema de orçamento separado para thinking), e `SUMMARY_RESERVE = maxOutput = 20K` é uma relação limpa e rígida.

   Atualizar também o comentário em [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374), de "Compression quality drives every subsequent main turn — keep reasoning on" para explicar que, para garantir um limite superior de saída previsível entre provedores, o design está alinhado com o claude-code.

   O comentário "may include non-persisted tokens (thoughts)" na seção de math de tokens ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) também pode ser limpo simultaneamente

### geminiChat.ts: Entrada de `sendMessageStream` (linha 562)

```ts
// Antes: tryCompress(force=false)
// Depois: usar tokens estimados para determinar se o nível hard é acionado e definir a flag force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Redefinir o disjuntor, equivalente a force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Atualização do Tratamento de Falhas (`geminiChat.ts:504-510`)

```ts
// Antes
hasFailedCompressionAttempt: boolean;

// Depois
consecutiveFailures: number;  // padrão 0

// Ramo de falha
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Ramo de sucesso
this.consecutiveFailures = 0;
```

Falhas em chamadas com `force=true` não são contadas (mantendo a semântica existente de que reativo/manual não "consome" a cota).

## Alterações na Interface

### Reescrever as três dicas context-* no tipRegistry.ts

Os três níveis de limiar correspondem exatamente às três dicas. Mapeamento (do menor para o maior número de tokens):

| ID da Dica          | Condição Atual                               | Nova Condição                                                      | Mudança no Texto                                                  |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `compress-intro`    | `pct >= 50 && < 80 && sessionPromptCount > 5` | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5` | Mantido igual                                                     |
| `context-high`      | `pct >= 80 && < 95`                           | `tokenCount >= auto && tokenCount < hard`                           | Mantido igual                                                     |
| `context-critical`  | `pct >= 95`                                   | `tokenCount >= hard`                                                | Adicionar "Auto-compact will force on next send." refletindo o comportamento do novo nível hard |

**Impacto na frequência de disparo:**

- Caminho principal (autocompactação funciona normalmente): `tokenCount` cruza auto e dispara a compactação imediatamente; na próxima rodada, `tokenCount` cai, então `context-high` fica visível apenas brevemente entre "disparo e efeito da compactação"
- Caminho marginal (falha de autocompactação / disjuntor / contingência reativa): `tokenCount` continua subindo, atravessando warn → auto → hard, acionando as três dicas em sequência, consistente com a percepção do usuário de "contexto cada vez mais apertado"
- Quando `context-critical` é acionada, o nível hard já está executando force compress antes do envio (veja a seção de alterações na cadeia de disparo do spec), então esta dica é na verdade um "aviso pós-resgate" em vez de "aviso pré-resgate"; o texto é complementado com uma explicação

A interface `TipContext` é estendida:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Novo: permitir que a função isRelevant obtenha os limiares.
  // computeThresholds é calculado pelo chamador e injetado, evitando que tipRegistry dependa diretamente do core.
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` injeta `thresholds` ao construir o `TipContext`.

### Sincronização do Comando /context (`contextCommand.ts:177-183`)

```ts
// Substituir o hardcoded (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Exibir quatro linhas:
//   Janela efetiva:      180K   (janela − 20K de reserva)
//   Limiar de aviso:     147K   (...)
//   Limiar automático:   167K   ← Posição atual
//   Limiar rígido:       177K
// Marcar em qual nível o token count atual se encontra
```

### Indicador Contínuo no Rodapé (opcional, follow-up)

Este spec não obriga a implementação de um indicador contínuo no rodapé. Motivos:

- O sistema de dicas existente já pode fornecer avisos no histórico
- Um indicador contínuo no rodapé exigiria alterações na renderização do ink, aumentando a frequência de re-renderização
- Pode ser tratado como follow-up após este spec (PR independente)

Se for implementado posteriormente, sugere-se a condição de disparo `tokenCount >= warn && tokenCount < auto`, ocultando após exceder auto (a compactação já começou).

## Cobertura de Testes

### Testes Unitários (chatCompressionService.test.ts)

- `computeThresholds(32K)` → ramo de fallback proporcional (warn/auto ambos pct, hard degenerado)
- `computeThresholds(128K)` → ramo híbrido (warn=pct, auto=abs, hard=abs)
- `computeThresholds(200K)` → ramo de controle absoluto (warn/auto/hard todos abs)
- `computeThresholds(1M)` → ramo totalmente absoluto
- `computeThresholds(window=10K)` → janela muito pequena (valor absoluto todo negativo), fórmula não quebra
- Os três limiares sempre satisfazem `warn <= auto <= hard`
- Fórmula max() é estável nos pontos de fronteira (pct * window == abs)

### Testes Unitários (tokenEstimation.test.ts)

- `estimateContentTokens` para texto puro / json / functionCall / functionResponse / image / document, cada um usando o bytesPerToken correspondente
- `estimatePromptTokens` com `lastPromptTokenCount > 0` segue o "caminho principal"; com 0, segue o "caminho da primeira rodada"
- Uma mensagem grande do usuário, quando adicionada na fase cheap-gate, consegue cruzar o limiar auto
- O desvio entre a estimativa e o uso real da API está dentro de ±30% (usando amostras de histórico real para regressão)

### Testes de Integração (geminiChat.test.ts / chatCompressionService.test.ts)

- Após 3 falhas consecutivas, cheap-gate retorna NOOP; o próximo force recupera
- Uma única falha não causa bloqueio permanente
- Quando os tokens estimados cruzam hard, o envio força automaticamente a compactação
- A chamada sideQuery de compactação com `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` é passada corretamente para `runSideQuery`, e `thinkingConfig.includeThoughts` é `false` (ou assumido pelo valor padrão de sideQuery)
- **Cobertura da primeira rodada**: construir um chat com `lastPromptTokenCount = 0` mas histórico grande (simulando recuperação com `--continue`); no primeiro envio, o limiar auto é acionado pelo caminho de estimativa

### Testes de Compatibilidade

- Iniciar com `contextPercentageThreshold = 0.5` configurado → aviso no stderr + campo ignorado, comportamento segue a constante PCT interna

### Testes do Sistema de Dicas (tipRegistry.test.ts)

- As três dicas context-* são acionadas corretamente ao cruzar warn/auto/hard, e os intervalos não se sobrepõem
- No caminho principal, após o limiar auto disparar a compactação, `context-high` não fica visível continuamente
- No caminho marginal (disjuntor + tokens continuam subindo), as três dicas são acionadas em sequência
- Comportamento razoável quando o `TipContext` não tem `thresholds` (fallback)

## Implementação por Fases

| Fase | Conteúdo                                                                                      | Independência          |
| ---- | --------------------------------------------------------------------------------------------- | ---------------------- |
| 1    | Constantes internas + `computeThresholds` + alterações no cheap-gate (sem compensação de estimativa) | Pode ser mesclado independentemente |
| 2    | Atualização do tratamento de falhas (1 → 3 disjuntores)                                       | Pode ser mesclado independentemente |
| 3    | Force compress antecipado no nível hard                                                        | Depende de P1 + P7     |
| 4    | Alterações na configuração + aviso de breaking change                                         | Depende de P1          |
| 5    | Interface (reescrita das dicas + /context)                                                     | Depende de P1          |
| 6    | SideQuery de compactação: desligar thinking + adicionar limite `maxOutputTokens`               | Independente, pode ser implementado antes de P1 |
| 7    | Compensação de estimativa de tokens (`estimateContentTokens` + `estimatePromptTokens`, aplicado a cheap-gate / hard) | Independente, pode ser paralelo a P1 |

Cada fase pode ser um PR independente. Ordem de mesclagem sugerida: **P6 → P7 → P1 → P2 → P4 → P3 → P5**: primeiro aplicar o limite `maxOutputTokens` na chamada de compactação (tornando a suposição de buffer confiável); depois adicionar a compensação de estimativa (tornando a verificação de tokens mais confiável); em seguida, implementar a infraestrutura de limiares; depois fazer o disjuntor de falhas e as alterações de configuração; por fim, ativar o resgate ativo do nível hard (quando já houver contagem de tokens confiável + disjuntor). Cada PR pode ser validado e revertido independentemente.

## Riscos e Considerações

1. **Desligar o thinking pode afetar a qualidade do sumário.** O comentário original "Compression quality drives every subsequent main turn — keep reasoning on" expressava preocupação com isso. A avaliação deste spec é que "limite superior de tokens previsível" tem prioridade sobre "maximizar a qualidade", mas após a implementação, é necessário observar a distribuição de `compression_input_token_count` / `compression_output_token_count` na telemetria, bem como as mudanças na qualidade das principais conversas após a compactação (feedback do usuário, taxa de estado `COMPRESSION_FAILED_*`). Se a qualidade cair significativamente, considerar reverter para thinking ativado + controle de orçamento de thinking específico do provedor.

2. **`maxOutputTokens` atingindo o limite pode truncar o sumário.** Com o thinking desligado, 20K limita diretamente o corpo do sumário; o p99,99 medido pelo claude-code é ≈ 17K, deixando ~3K de margem de segurança. No entanto, o prompt de compactação do qwen-code é diferente do claude-code, e a distribuição precisa ser observada. Recomenda-se adicionar um caminho NOOP no ramo de falha de compactação ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) que detecte `finish_reason = MAX_TOKENS`, evitando persistir um sumário incompleto.

3. **Diferenças no mapeamento de maxOutputTokens entre provedores.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. O qwen-code já possui esse mapeamento ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) etc.), e é necessário verificar na implementação do P6 se o campo `maxOutputTokens` realmente percorre o corpo da requisição de todos os provedores no caminho sideQuery.

4. **A estimativa de tokens é aproximada e inferior; não deve ser usada como base para "pular o disparo".** O desvio de `char/4` em relação ao tokenizador real de cada provedor pode ser de ±30%. Este spec usa a estimativa apenas para "fazer o limiar disparar mais cedo" (direção de falso-positivo, melhor compactar cedo do que tarde). Todos os caminhos de código que "reduzem a contagem de tokens / pulam a compactação" ainda devem usar `lastPromptTokenCount` (valor autoritativo da API).

5. **Relação entre a função de estimativa e o `estimateContentChars` existente.** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) já possui `estimateContentChars` (usado para calcular o ponto de divisão da compactação). O novo `estimateContentTokens` deve reutilizá-lo (dividindo por bytesPerToken) em vez de escrever um novo do zero, evitando que dois conjuntos de estimativas divirjam.

## Fora do Escopo deste Spec

- Canais de override por env (Plano D): manter o princípio de "configuração mínima"
- Visualização permanente no rodapé: deixar como follow-up
- Melhoria do prompt de sumário, ajuste de `MIN_COMPRESSION_FRACTION`: ortogonal ao design de limiares

## Perguntas em Aberto (aguardando review)

1. **Intensidade do breaking change**: aviso + ignorar campo vs. erro na inicialização. Atualmente optamos por aviso; é necessário confirmar se isso é suficientemente amigável para implantações empresariais/configurações de equipe.

## Encerrados

2. **Janelas pequenas (≤ ~76,7K): hard e auto degeneram para o mesmo valor** — Decidimos **não indicar explicitamente no `/context`**. Motivos:
   - O intervalo de colapso não é apenas 32K; todas as janelas onde `effectiveWindow - HARD_BUFFER ≤ 0,7 × window` colapsam (incluindo 64K)
   - O comportamento do usuário não muda: em janelas colapsadas, `currentTier` pula o nível `'auto'` e reporta diretamente `'hard'` (`contextCommand.ts:43-44` verifica primeiro `>= hard`), e a banda `context-high` (`auto ≤ t < hard`) torna-se uma faixa vazia — perder um nível de indicação em janelas pequenas é razoável: a janela já é pequena, e o usuário provavelmente gerencia o contexto manualmente
   - Se no futuro houver relatos reais de usuários sobre "não ver o nível intermediário em janelas pequenas", podemos decidir adicionar uma marcação na interface ou ajustar a condição de disparo de `context-high` (isso é um trabalho de interface, não de spec). Atualmente, optamos por não aumentar a complexidade da interface