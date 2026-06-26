# Design de Escalonamento Adaptativo de Tokens de Saída

> Reduz a sobre-reserva de slots de GPU em aproximadamente 4x através de uma estratégia de "padrão baixo + escalonamento em truncamento" para tokens de saída, com recuperação em várias tentativas para respostas que excedem até mesmo o limite escalonado.

## Problema

Cada requisição de API reserva um slot fixo de GPU proporcional a `max_tokens`. O padrão anterior de 32K tokens significa que cada requisição reserva um slot de saída de 32K, mas 99% das respostas ficam abaixo de 5K tokens. Isso sobre-reserva a capacidade da GPU em 4-6x, limitando a concorrência do servidor e aumentando o custo.

## Solução

Use um padrão com limite de **8K** tokens de saída. Quando uma resposta é truncada (o modelo atinge `max_tokens`):

1. **Escale** para o limite total de saída do modelo (com 64K como piso para modelos desconhecidos)
2. Se ainda truncado, **recupere** mantendo a resposta parcial no histórico e injetando uma mensagem de continuação, até 3 vezes
3. Se a recuperação for esgotada, recorra à orientação de truncamento do agendador de ferramentas

Como <1% das requisições são realmente truncadas, isso reduz significativamente a reserva média de slots, mantendo a qualidade da saída para respostas longas.

## Arquitetura

```
Requisição (max_tokens = 8K)
│
▼
┌─────────────────────────────────┐
│  Resposta truncada?              │─── Não ──▶ Concluído ✓
│  (MAX_TOKENS)                    │
└───────────┬──────────────────────┘
            │ Sim
            ▼
┌──────────────────────────────────────────────────────┐
│  Camada 1: Escalar para o limite de saída do modelo │
│  ┌────────────────────────────────────────────────┐  │
│  │ Remover resposta parcial do histórico           │  │
│  │ RETRY (isContinuation: false → resetar UI)      │  │
│  │ Reenviar com max(64K, limite de saída do modelo)│  │
│  └────────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  Ainda truncado?                 │─── Não ──▶ Concluído ✓
│  (MAX_TOKENS)                    │
└───────────┬──────────────────────┘
            │ Sim
            ▼
┌──────────────────────────────────────────────────────┐
│  Camada 2: Recuperação em várias tentativas (até 3×) │
│  ┌────────────────────────────────────────────────┐  │
│  │ Manter resposta parcial no histórico           │  │
│  │ Enviar mensagem do usuário: "Continue diretamente..." │
│  │ RETRY (isContinuation: true → manter buffer UI)│  │
│  │ Reenviar com histórico atualizado               │  │
│  │ O modelo continua de onde parou                 │  │
│  └──────────────┬─────────────────────────────────┘  │
│                 │                                     │
│          ┌──────┴──────┐                              │
│          │ Bem-sucedido?│── Sim ──▶ Concluído ✓       │
│          └──────┬──────┘                              │
│                 │ Não (ainda truncado)                 │
│                 ▼                                     │
│          tentativa < 3? ── Sim ──▶ voltar ao loop ↑   │
└───────────┬──────────────────────────────────────────┘
            │ Não (esgotado)
            ▼
┌──────────────────────────────────────────────────────┐
│  Camada 3: Fallback do agendador de ferramentas      │
│  ┌────────────────────────────────────────────────┐  │
│  │ Rejeitar chamadas de ferramenta Edit/Write     │  │
│  │ truncadas                                      │  │
│  │ Retornar orientação: "Você DEVE dividir em     │  │
│  │ partes menores — escreva o esqueleto primeiro, │  │
│  │ depois edite incrementalmente."                │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Determinação do limite de tokens

O `max_tokens` efetivo é resolvido na seguinte ordem de prioridade:

| Prioridade    | Fonte                                                | Valor (modelo conhecido)        | Valor (modelo desconhecido) | Comportamento de escalonamento           |
| ------------- | ---------------------------------------------------- | ------------------------------- | --------------------------- | ---------------------------------------- |
| 1 (mais alta) | Configuração do usuário (`samplingParams.max_tokens`) | `min(valorUsuario, limiteModelo)` | `valorUsuario`              | Sem escalonamento                        |
| 2            | Variável de ambiente (`QWEN_CODE_MAX_OUTPUT_TOKENS`)  | `min(valorEnv, limiteModelo)`   | `valorEnv`                  | Sem escalonamento                        |
| 3 (mais baixa)| Padrão com limite                                    | `min(limiteModelo, 8K)`        | `min(32K, 8K)` = 8K        | Escala para limite do modelo (piso 64K) + recuperação |

Um "modelo conhecido" é aquele que possui uma entrada explícita em `OUTPUT_PATTERNS` (verificado via `hasExplicitOutputLimit()`). Para modelos conhecidos, o valor efetivo é sempre limitado ao limite de saída declarado do modelo para evitar erros de API. Modelos desconhecidos (deployments customizados, endpoints auto-hospedados) passam o valor do usuário diretamente, já que o backend pode suportar limites maiores.

Essa lógica é implementada em três geradores de conteúdo:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — provedores compatíveis com OpenAI
- `DashScopeProvider` — herda `applyOutputTokenLimit()` do provedor padrão
- `AnthropicContentGenerator.buildSamplingParameters()` — provedor Anthropic

## Mecanismo de escalonamento

A lógica de escalonamento reside em `geminiChat.ts`, posicionada **fora** do loop principal de repetição. Isso é intencional:

1. O loop de repetição lida com erros transitórios (limites de taxa, streams inválidos, validação de conteúdo)
2. Truncamento não é um erro — é uma resposta bem-sucedida que foi interrompida
3. Erros do stream escalonado devem propagar diretamente para o chamador, não serem capturados pela lógica de repetição

### Passos do escalonamento (geminiChat.ts)

```
1. Stream completa com sucesso (lastError === null)
2. Último chunk tem finishReason === MAX_TOKENS
3. Verificações de guarda passam:
   - maxTokensEscalated === false (impedir escalonamento infinito)
   - hasUserMaxTokensOverride === false (respeitar intenção do usuário)
4. Calcular limite escalonado: max(ESCALATED_MAX_TOKENS, tokenLimit(modelo, 'output'))
5. Remover a resposta parcial do modelo do histórico do chat
6. Emitir evento RETRY (isContinuation: false) → UI descarta saída parcial e reseta buffers
7. Reenviar a mesma requisição com maxOutputTokens: escalatedLimit
```

### Passos da recuperação (geminiChat.ts)

Se a resposta escalonada também for truncada (finishReason === MAX_TOKENS), o loop de recuperação executa até `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) vezes:

```
1. A resposta parcial do modelo já está no histórico (inserida por processStreamResponse)
2. Inserir uma mensagem de recuperação do usuário: OUTPUT_RECOVERY_MESSAGE
3. Emitir evento RETRY (isContinuation: true) → UI mantém buffer de texto para continuação
4. Reenviar com histórico atualizado (o modelo vê sua saída parcial + instrução de recuperação)
5. Se ainda truncado e houver tentativas restantes, voltar ao passo 1
6. Se a tentativa de recuperação lançar um erro (resposta vazia, erro de rede):
   - Remover a mensagem de recuperação pendente do histórico
   - Sair do loop de recuperação
```

### Limpeza de estado no RETRY (turn.ts)

Quando a classe `Turn` recebe um evento RETRY, ela limpa o estado acumulado para evitar inconsistências:

- `pendingToolCalls` — limpo para evitar chamadas de ferramenta duplicadas se a primeira resposta truncada continha chamadas concluídas que são repetidas na resposta escalonada
- `pendingCitations` — limpo para evitar citações duplicadas
- `finishReason` — resetado para `undefined` para que o finish reason da nova resposta seja usado

A flag `isContinuation` é passada para a UI para que ela possa decidir se reseta buffers de texto (escalonamento) ou os mantém (recuperação).

## Constantes

Definidas em `geminiChat.ts` e `tokenLimits.ts`:

| Constante                       | Valor  | Propósito                                                      |
| ------------------------------- | ------ | -------------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`     | 8.000  | Limite padrão de tokens de saída quando nenhuma sobreposição do usuário é definida |
| `ESCALATED_MAX_TOKENS`          | 64.000 | Piso para escalonamento (usado quando o limite do modelo é desconhecido) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS`  | 3      | Máximo de tentativas de recuperação em várias voltas após o escalonamento |

O limite escalonado efetivo é `max(ESCALATED_MAX_TOKENS, tokenLimit(modelo, 'output'))`:

| Modelo           | Limite escalonado |
| ---------------- | ----------------- |
| Claude Opus 4.6  | 131.072 (128K)    |
| GPT-5 / série o  | 131.072 (128K)    |
| Qwen3.x          | 65.536 (64K)      |
| Modelos desconhecidos | 64.000 (piso) |

## Decisões de design

### Por que 8K como padrão?

- 99% das respostas estão abaixo de 5K tokens
- 8K fornece margem razoável para respostas um pouco mais longas sem disparar repetições desnecessárias
- Reduz a reserva média de slots de 32K para 8K (melhoria de 4x)

### Por que escalar para o limite do modelo em vez de 64K fixo?

- Modelos com limites de saída mais altos (Claude Opus 128K, GPT-5 128K) estavam restritos a 64K desnecessariamente
- Usar o limite real do modelo captura a grande maioria das saídas longas sem uma segunda repetição
- `ESCALATED_MAX_TOKENS` (64K) serve como piso para modelos desconhecidos onde `tokenLimit()` retorna o padrão de 32K

### Por que recuperação em várias tentativas em vez de escalonamento progressivo?

- Escalonamento progressivo (8K → 16K → 32K → 64K) requer regenerar a resposta completa a cada vez
- A recuperação em várias tentativas mantém a resposta parcial e permite que o modelo continue, economizando tokens e latência
- Mensagens de recuperação são baratas (~40 tokens cada) em comparação com regenerar respostas grandes
- O limite de 3 tentativas evita loops infinitos enquanto cobre a maioria dos casos práticos

### Por que o escalonamento está fora do loop de repetição?

- Truncamento é um caso de sucesso, não um erro
- Erros do stream escalonado (limites de taxa, falhas de rede) devem propagar diretamente em vez de serem repetidos silenciosamente com parâmetros incorretos
- Mantém o loop de repetição focado em seu propósito original (recuperação de erros transitórios)
- Erros de recuperação são capturados separadamente para evitar abortar toda a conversa