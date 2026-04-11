# Design de Escalonamento Adaptativo de Tokens de Saída

> Reduz a super-reserva de slots de GPU em ~4x por meio de uma estratégia de "padrão baixo + escalonamento em caso de truncamento" para tokens de saída.

## Problema

Cada requisição de API reserva um slot de GPU fixo proporcional a `max_tokens`. O padrão anterior de 32K tokens significa que cada requisição reserva um slot de saída de 32K, mas 99% das respostas têm menos de 5K tokens. Isso super-reserva a capacidade da GPU em 4-6x, limitando a concorrência do servidor e aumentando os custos.

## Solução

Utilize um padrão limitado a **8K** tokens de saída. Quando uma resposta for truncada (o modelo atingir `max_tokens`), tente novamente automaticamente uma vez com um limite escalonado de **64K**. Como menos de 1% das requisições são realmente truncadas, isso reduz significativamente a reserva média de slots, preservando a qualidade da saída para respostas longas.

## Arquitetura

```
                      ┌─────────────────────────┐
                      │   Início da requisição  │
                      │   max_tokens = 8K       │
                      └───────────┬─────────────┘
                                  │
                                  ▼
                      ┌─────────────────────────┐
                      │   Stream da resposta    │
                      └───────────┬─────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                   finish_reason        finish_reason
                   != MAX_TOKENS        == MAX_TOKENS
                        │                   │
                        ▼                   ▼
                  ┌───────────┐   ┌─────────────────────┐
                  │ Concluído │   │  Verificar condições: │
                  └───────────┘   │  - Sem override do   │
                                  │    usuário?          │
                                  │  - Sem override de   │
                                  │    env?              │
                                  │  - Já não foi        │
                                  │    escalonado?       │
                                  └─────────┬───────────┘
                                     SIM    │    NÃO
                                  ┌─────────┴────┐
                                  │              │
                                  ▼              ▼
                          ┌─────────────┐  ┌──────────┐
                          │ Remover resp│  │Concluído │
                          │ parcial do  │  │(truncado)│
                          │ modelo do   │  └──────────┘
                          │ histórico   │
                          │             │
                          │ Emitir      │
                          │ evento RETRY│
                          │             │
                          │ Reenviar    │
                          │ max_tokens  │
                          │   = 64K     │
                          └─────────────┘
```

## Determinação do limite de tokens

O `max_tokens` efetivo é resolvido na seguinte ordem de prioridade:

| Prioridade  | Fonte                                                | Valor (modelo conhecido)     | Valor (modelo desconhecido) | Comportamento de escalonamento            |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------------- | ----------------------------------------- |
| 1 (maior)   | Configuração do usuário (`samplingParams.max_tokens`)| `min(userValue, modelLimit)` | `userValue`                 | Sem escalonamento                         |
| 2           | Variável de ambiente (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`                  | Sem escalonamento                         |
| 3 (menor)   | Padrão limitado                                      | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K         | Escalona para 64K em truncamento          |

Um "modelo conhecido" é aquele que possui uma entrada explícita em `OUTPUT_PATTERNS` (verificado via `hasExplicitOutputLimit()`). Para modelos conhecidos, o valor efetivo é sempre limitado ao limite de saída declarado pelo modelo para evitar erros de API. Modelos desconhecidos (implantações personalizadas, endpoints self-hosted) repassam o valor do usuário diretamente, já que o backend pode suportar limites maiores.

Essa lógica é implementada em três geradores de conteúdo:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — provedores compatíveis com OpenAI
- `DashScopeProvider` — herda `applyOutputTokenLimit()` do provedor padrão
- `AnthropicContentGenerator.buildSamplingParameters()` — provedor Anthropic

## Mecanismo de escalonamento

A lógica de escalonamento reside em `geminiChat.ts`, posicionada **fora** do loop principal de retry. Isso é intencional:

1. O loop de retry lida com erros transitórios (limites de taxa, streams inválidos, validação de conteúdo)
2. O truncamento não é um erro — é uma resposta bem-sucedida que foi interrompida
3. Erros do stream escalonado devem ser propagados diretamente ao chamador, e não capturados pela lógica de retry

### Etapas de escalonamento (geminiChat.ts)

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

### Limpeza de estado no RETRY (turn.ts)

Quando a classe `Turn` recebe um evento RETRY, ela limpa o estado acumulado para evitar inconsistências:

- `pendingToolCalls` — limpo para evitar chamadas de ferramenta duplicadas caso a primeira resposta truncada contenha chamadas concluídas que se repetem na resposta escalonada
- `pendingCitations` — limpo para evitar citações duplicadas
- `debugResponses` — limpo para evitar dados de debug desatualizados
- `finishReason` — redefinido para `undefined` para que o motivo de conclusão da nova resposta seja utilizado

## Constantes

Definidas em `tokenLimits.ts`:

| Constante                   | Valor  | Finalidade                                              |
| --------------------------- | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS` | 8.000  | Limite padrão de tokens de saída quando não há override do usuário |
| `ESCALATED_MAX_TOKENS`      | 64.000 | Limite de tokens de saída usado no retry por truncamento             |

## Decisões de design

### Por que o padrão de 8K?

- 99% das respostas têm menos de 5K tokens
- 8K oferece uma margem razoável para respostas um pouco mais longas sem acionar retries desnecessários
- Reduz a reserva média de slots de 32K para 8K (melhoria de 4x)

### Por que o limite escalonado de 64K?

- Cobre a grande maioria das saídas longas que foram truncadas em 8K
- Corresponde ao limite de saída de muitos modelos modernos (Claude Sonnet, Gemini 3.x, Qwen3.x)
- Valores mais altos (ex.: 128K) anulariam os benefícios da otimização de slots para os <1% de requisições que escalonam

### Por que não usar escalonamento progressivo (8K → 16K → 32K → 64K)?

- Cada retry adiciona latência (a resposta completa precisa ser regenerada)
- Um único retry é a abordagem mais simples que captura quase todos os casos
- A taxa de truncamento de <1% em 8K significa que quase nenhuma requisição precisa de escalonamento; aquelas que precisam provavelmente exigem significativamente mais que 16K

### Por que o escalonamento fica fora do loop de retry?

- O truncamento é um caso de sucesso, não um erro
- Erros do stream escalonado (limites de taxa, falhas de rede) devem ser propagados diretamente em vez de serem retentados silenciosamente com parâmetros incorretos
- Mantém o loop de retry focado em seu propósito original (recuperação de erros transitórios)