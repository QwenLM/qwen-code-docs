# Design de Escalonamento Adaptativo de Tokens de Saída

> Reduz a sobre-reserva de slots de GPU em ~4x através de uma estratégia de "padrão baixo + escalonamento em caso de truncamento" para tokens de saída, com recuperação em múltiplas etapas para respostas que excedem até mesmo o limite escalonado.

## Problema

Cada requisição da API reserva um slot fixo de GPU proporcional a `max_tokens`. O padrão anterior de 32K tokens significa que cada requisição reserva um slot de saída de 32K, mas 99% das respostas têm menos de 5K tokens. Isso sobre-reserva a capacidade da GPU em 4-6x, limitando a concorrência do servidor e aumentando os custos.

## Solução

Usar um padrão com limite superior de **8K** tokens de saída. Quando uma resposta é truncada (o modelo atinge `max_tokens`):

1. **Escalonar** para o limite total de saída do modelo (com 64K como piso para modelos desconhecidos)
2. Se ainda truncado, **recuperar** mantendo a resposta parcial no histórico e injetando uma mensagem de continuação, até 3 vezes
3. Se a recuperação se esgotar, recorrer à orientação de truncamento do agendador de ferramentas

Como <1% das requisições são efetivamente truncadas, isso reduz significativamente a reserva média de slots, mantendo a qualidade da saída para respostas longas.

## Arquitetura

```
Request (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Response truncated?     │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 1: Escalate to model output limit         │
│  ┌────────────────────────────────────────────┐  │
│  │ Pop partial response from history          │  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Re-send at max(64K, model output limit)    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Still truncated?        │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Multi-turn recovery (up to 3×)         │
│  ┌────────────────────────────────────────────┐  │
│  │ Keep partial response in history           │  │
│  │ Push user message: "Resume directly..."    │  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Re-send with updated history               │  │
│  │ Model continues from where it left off     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Succeeded?  │── Yes ──▶ Done ✓         │
│          └──────┬──────┘                          │
│                 │ No (still truncated)            │
│                 ▼                                 │
│          attempt < 3? ── Yes ──▶ loop back ↑      │
└───────────┬──────────────────────────────────────┘
            │ No (exhausted)
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Tool scheduler fallback                │
│  ┌────────────────────────────────────────────┐  │
│  │ Reject truncated Edit/Write tool calls     │  │
│  │ Return guidance: "You MUST split into      │  │
│  │ smaller parts — write skeleton first,      │  │
│  │ then edit incrementally."                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Determinação do limite de tokens

O `max_tokens` efetivo é resolvido na seguinte ordem de prioridade:

| Prioridade | Fonte                                                 | Valor (modelo conhecido)        | Valor (modelo desconhecido) | Comportamento de escalonamento                   |
| ---------- | ----------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------------------------------ |
| 1 (maior)  | Configuração do usuário (`samplingParams.max_tokens`) | `min(userValue, modelLimit)`    | `userValue`                 | Sem escalonamento                                |
| 2          | Variável de ambiente (`QWEN_CODE_MAX_OUTPUT_TOKENS`)  | `min(envValue, modelLimit)`     | `envValue`                  | Sem escalonamento                                |
| 3 (menor)  | Padrão com limite superior                            | `min(modelLimit, 8K)`           | `min(32K, 8K)` = 8K         | Escalona para o limite do modelo (mín. 64K) + recuperação |

Um "modelo conhecido" é aquele que possui uma entrada explícita em `OUTPUT_PATTERNS` (verificado via `hasExplicitOutputLimit()`). Para modelos conhecidos, o valor efetivo é sempre limitado ao limite de saída declarado pelo modelo para evitar erros da API. Modelos desconhecidos (deploys personalizados, endpoints auto-hospedados) passam o valor do usuário diretamente, já que o backend pode suportar limites maiores.

Essa lógica é implementada em três geradores de conteúdo:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — provedores compatíveis com OpenAI
- `DashScopeProvider` — herda `applyOutputTokenLimit()` do provedor padrão
- `AnthropicContentGenerator.buildSamplingParameters()` — provedor Anthropic
## Mecanismo de escalonamento

A lógica de escalonamento está em `geminiChat.ts`, colocada **fora** do loop principal de tentativas. Isso é intencional:

1. O loop de tentativas lida com erros transitórios (limites de taxa, streams inválidos, validação de conteúdo)
2. Truncamento não é um erro — é uma resposta bem-sucedida que foi cortada
3. Erros do stream escalonado devem se propagar diretamente para o chamador, não ser capturados pela lógica de tentativas

### Etapas do escalonamento (geminiChat.ts)

```
1. Stream completa com sucesso (lastError === null)
2. Último chunk tem finishReason === MAX_TOKENS
3. Verificações de guarda passam:
   - maxTokensEscalated === false (impede escalonamento infinito)
   - hasUserMaxTokensOverride === false (respeita a intenção do usuário)
4. Calcular limite escalonado: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Remover a resposta parcial do modelo do histórico do chat
6. Emitir evento RETRY (isContinuation: false) → UI descarta saída parcial e redefine buffers
7. Reenviar a mesma requisição com maxOutputTokens: escalatedLimit
```

### Etapas de recuperação (geminiChat.ts)

Se a resposta escalonada também for truncada (finishReason === MAX_TOKENS), o loop de recuperação executa até `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) vezes:

```
1. A resposta parcial do modelo já está no histórico (inserida por processStreamResponse)
2. Inserir uma mensagem de usuário de recuperação: OUTPUT_RECOVERY_MESSAGE
3. Emitir evento RETRY (isContinuation: true) → UI mantém o buffer de texto para continuação
4. Reenviar com o histórico atualizado (o modelo vê sua saída parcial + instrução de recuperação)
5. Se ainda truncado e tentativas restantes, voltar ao passo 1
6. Se a tentativa de recuperação lançar erro (resposta vazia, erro de rede):
   - Remover a mensagem de recuperação pendente do histórico
   - Sair do loop de recuperação
```

### Limpeza de estado no RETRY (turn.ts)

Quando a classe `Turn` recebe um evento RETRY, ela limpa o estado acumulado para evitar inconsistências:

- `pendingToolCalls` — limpo para evitar chamadas de ferramenta duplicadas se a primeira resposta truncada continha chamadas de ferramenta concluídas que são repetidas na resposta escalonada
- `pendingCitations` — limpo para evitar citações duplicadas
- `finishReason` — redefinido para `undefined` para que o motivo de conclusão da nova resposta seja usado

A flag `isContinuation` é passada para a UI para que ela possa decidir se deve redefinir os buffers de texto (escalonamento) ou mantê-los (recuperação).

## Constantes

Definidas em `geminiChat.ts` e `tokenLimits.ts`:

| Constante                       | Valor  | Propósito                                               |
| ------------------------------- | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`     | 8.000  | Limite padrão de tokens de saída quando nenhuma substituição do usuário é definida |
| `ESCALATED_MAX_TOKENS`          | 64.000 | Piso para escalonamento (usado quando o limite do modelo é desconhecido) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS`  | 3      | Máximo de tentativas de recuperação multi-turn após escalonamento |

O limite escalonado efetivo é `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modelo            | Limite escalonado |
| ----------------- | ----------------- |
| Claude Opus 4.6   | 131.072 (128K)    |
| GPT-5 / o-series  | 131.072 (128K)    |
| Qwen3.x           | 65.536 (64K)      |
| Modelos desconhecidos | 64.000 (piso) |

## Decisões de design

### Por que 8K como padrão?

- 99% das respostas estão abaixo de 5K tokens
- 8K fornece margem razoável para respostas um pouco mais longas sem acionar tentativas desnecessárias
- Reduz a reserva média de slot de 32K para 8K (melhoria de 4x)

### Por que escalonar até o limite do modelo em vez de 64K fixo?

- Modelos com limites de saída mais altos (Claude Opus 128K, GPT-5 128K) estavam sendo restringidos a 64K desnecessariamente
- Usar o limite real do modelo captura a grande maioria das saídas longas sem uma segunda tentativa
- `ESCALATED_MAX_TOKENS` (64K) serve como piso para modelos desconhecidos onde `tokenLimit()` retorna o padrão de 32K

### Por que recuperação multi-turn em vez de escalonamento progressivo?

- Escalonamento progressivo (8K → 16K → 32K → 64K) requer regenerar a resposta completa a cada vez
- Recuperação multi-turn mantém a resposta parcial e permite que o modelo continue, economizando tokens e latência
- Mensagens de recuperação são baratas (~40 tokens cada) em comparação com regenerar respostas grandes
- O limite de 3 tentativas evita loops infinitos enquanto cobre a maioria dos casos práticos

### Por que o escalonamento está fora do loop de tentativas?

- Truncamento é um caso de sucesso, não um erro
- Erros do stream escalonado (limites de taxa, falhas de rede) devem se propagar diretamente em vez de serem silenciosamente repetidos com parâmetros incorretos
- Mantém o loop de tentativas focado em seu propósito original (recuperação de erros transitórios)
- Erros de recuperação são capturados separadamente para não abortar toda a conversa
