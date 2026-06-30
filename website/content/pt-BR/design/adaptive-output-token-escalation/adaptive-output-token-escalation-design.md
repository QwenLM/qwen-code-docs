# Limite de Tokens de Saída e Design de Escalonamento

> O padrão é o limite de saída declarado pelo modelo, a menos que o usuário ou o ambiente configure `max_tokens`. O escalonamento e a recuperação multi-turno são usados apenas quando uma resposta ainda atinge `MAX_TOKENS`.

## Problema

Cada requisição de API reserva um slot fixo de GPU proporcional a `max_tokens`. Um valor padrão baixo pode reduzir a reserva de slots, mas também torna as respostas grandes normais mais propensas a truncamento. Para fluxos de trabalho de escrita de arquivos, isso pode produzir argumentos de chamada de ferramenta incompletos e forçar o agendador a rejeitar a escrita parcial.

## Solução

Use o limite de saída declarado pelo modelo como padrão. Quando uma resposta for truncada (o modelo atinge `max_tokens`):

1. **Escale** para o limite total de saída do modelo (com 64K como limite mínimo quando o limite atual for menor)
2. Se ainda estiver truncada, **recupere** mantendo a resposta parcial no histórico e injetando uma mensagem de continuação, até 3 vezes
3. Se a recuperação se esgotar, recorra à orientação de truncamento do agendador de ferramentas

Isso prioriza a correção para tarefas de geração grande e edição de arquivos. Operadores que precisam de uma reserva menor ainda podem definir `QWEN_CODE_MAX_OUTPUT_TOKENS`, e esse valor explícito será respeitado.

## Arquitetura

```
Requisição (max_tokens = valor do usuário/ambiente ou limite de saída do modelo)
│
▼
┌──────────────────────────────┐
│  Resposta truncada?          │──── Não ──▶ Concluído ✓
│  (MAX_TOKENS)                │
└──────────────┬───────────────┘
               │ Sim
               ▼
┌──────────────────────────────────────────────────────────┐
│  Camada 1: Escalar para o limite de saída do modelo      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Remover resposta parcial do histórico              │  │
│  │ RETRY (isContinuation: false → resetar UI)         │  │
│  │ Reenviar em max(64K, limite de saída do modelo)    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Ainda truncada?             │──── Não ──▶ Concluído ✓
│  (MAX_TOKENS)                │
└──────────────┬───────────────┘
               │ Sim
               ▼
┌──────────────────────────────────────────────────────────┐
│  Camada 2: Recuperação multi-turno (até 3x)              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Manter resposta parcial no histórico               │  │
│  │ Inserir mensagem do usuário: "Retome diretamente..."│ │
│  │ RETRY (isContinuation: true → manter buffer da UI) │  │
│  │ Reenviar com histórico atualizado                  │  │
│  │ O modelo continua de onde parou                    │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                    │
│              ┌──────┴──────┐                             │
│              │ Sucesso?    │── Sim ──▶ Concluído ✓       │
│              └──────┬──────┘                             │
│                     │ Não (ainda truncada)               │
│                     ▼                                    │
│              tentativa < 3? ── Sim ──▶ voltar ao loop ↑  │
└──────────────┬───────────────────────────────────────────┘
               │ Não (esgotado)
               ▼
┌──────────────────────────────────────────────────────────┐
│  Camada 3: Fallback do agendador de ferramentas          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Rejeitar chamadas de ferramenta Edit/Write truncadas│ │
│  │ Retornar orientação: "Você DEVE dividir em partes  │  │
│  │ menores — escreva o esqueleto primeiro, depois     │  │
│  │ edite incrementalmente."                           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Determinação do limite de tokens

O `max_tokens` efetivo é resolvido na seguinte ordem de prioridade:

| Prioridade    | Origem                                               | Valor (modelo conhecido)       | Valor (modelo desconhecido)            | Comportamento de escalonamento                  |
| ------------- | ---------------------------------------------------- | ------------------------------ | -------------------------------------- | ----------------------------------------------- |
| 1 (maior)     | Configuração do usuário (`samplingParams.max_tokens`)| `min(userValue, modelLimit)`   | `userValue`                            | Sem escalonamento                               |
| 2             | Variável de ambiente (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`    | `envValue`                             | Sem escalonamento                               |
| 3 (menor)     | Limite de saída padrão/do modelo                     | `modelLimit`                   | `DEFAULT_OUTPUT_TOKEN_LIMIT` = 32K     | Escala para o limite do modelo (mín. 64K) + recuperação |

Um "modelo conhecido" é aquele que possui uma entrada explícita em `OUTPUT_PATTERNS` (verificado via `hasExplicitOutputLimit()`). Para modelos conhecidos, o valor efetivo é sempre limitado ao limite de saída declarado pelo modelo para evitar erros de API. Modelos desconhecidos (deployments personalizados, endpoints self-hosted) passam o valor do usuário diretamente, pois o backend pode suportar limites maiores.

Essa lógica é implementada em três geradores de conteúdo:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — provedores compatíveis com OpenAI
- `DashScopeProvider` — herda `applyOutputTokenLimit()` do provedor padrão
- `AnthropicContentGenerator.buildSamplingParameters()` — provedor Anthropic

## Mecanismo de escalonamento

A lógica de escalonamento fica em `geminiChat.ts`, colocada **fora** do loop de retry principal. Isso é intencional:

1. O loop de retry lida com erros transitórios (limites de taxa, streams inválidos, validação de conteúdo)
2. O truncamento não é um erro — é uma resposta bem-sucedida que foi interrompida
3. Erros do stream escalonado devem ser propagados diretamente para o chamador, não capturados pela lógica de retry

### Etapas de escalonamento (geminiChat.ts)

```
1. Stream concluído com sucesso (lastError === null)
2. O último chunk tem finishReason === MAX_TOKENS
3. As verificações de guarda passam:
   - maxTokensEscalated === false (previne escalonamento infinito)
   - hasUserMaxTokensOverride === false (respeita a intenção do usuário)
4. Calcula o limite escalonado: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Remove a resposta parcial do modelo do histórico do chat
6. Emite evento RETRY (isContinuation: false) → a UI descarta a saída parcial e reseta os buffers
7. Reenvia a mesma requisição com maxOutputTokens: escalatedLimit
```

### Etapas de recuperação (geminiChat.ts)

Se a resposta escalonada também estiver truncada (`finishReason === MAX_TOKENS`), o loop de recuperação é executado até `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) vezes:

```
1. A resposta parcial do modelo já está no histórico (inserida por processStreamResponse)
2. Insere uma mensagem de recuperação do usuário: OUTPUT_RECOVERY_MESSAGE
3. Emite evento RETRY (isContinuation: true) → a UI mantém o buffer de texto para continuação
4. Reenvia com o histórico atualizado (o modelo vê sua saída parcial + instrução de recuperação)
5. Se ainda estiver truncada e houver tentativas restantes, volta ao passo 1
6. Se a tentativa de recuperação lançar um erro (resposta vazia, erro de rede):
   - Remove a mensagem de recuperação pendente do histórico
   - Sai do loop de recuperação
```

### Limpeza de estado no RETRY (turn.ts)

Quando a classe `Turn` recebe um evento RETRY, ela limpa o estado acumulado para evitar inconsistências:

- `pendingToolCalls` — limpo para evitar chamadas de ferramenta duplicadas caso a primeira resposta truncada contivesse chamadas de ferramenta concluídas que são repetidas na resposta escalonada
- `pendingCitations` — limpo para evitar citações duplicadas
- `finishReason` — resetado para `undefined` para que o motivo de conclusão da nova resposta seja usado

A flag `isContinuation` é passada para a UI para que ela possa decidir se deve resetar os buffers de texto (escalonamento) ou mantê-los (recuperação).

## Constantes

Definidas em `geminiChat.ts` e `tokenLimits.ts`:

| Constante                      | Valor   | Propósito                                           |
| ------------------------------ | ------- | ------------------------------------------------- |
| `ESCALATED_MAX_TOKENS`         | 64.000  | Limite mínimo para escalonamento quando o limite do modelo é baixo  |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3       | Máximo de tentativas de recuperação multi-turno após o escalonamento |

O limite escalonado efetivo é `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modelo            | Limite escalonado |
| ----------------- | ----------------- |
| Claude Opus 4.6   | 131.072 (128K)    |
| GPT-5 / o-series  | 131.072 (128K)    |
| Qwen3.x           | 65.536 (64K)      |
| Modelos desconhecidos | 64.000 (mínimo) |

## Decisões de design

### Por que não usar um padrão de 8K?

- Um padrão de 8K é uma otimização de reserva de slots/capacidade, não um requisito de correção. Ele troca a correção (respostas grandes são truncadas) pelo throughput do backend (uma requisição reserva um slot de GPU proporcional a `max_tokens`, então um valor menor super-reserva menos).
- A geração de arquivos grandes e chamadas de ferramenta de edição podem legitimamente exceder 8K, então um padrão de 8K transforma uma requisição normal em um round-trip de truncamento → escalonamento (e, no pior caso, um loop de retry).
- O Claude Code mantém o mesmo limite de 8K, mas o restringe atrás de uma feature flag (`tengu_otk_slot_v1`) que **vem desativada por padrão para provedores de terceiros** ("não validado no Bedrock/Vertex") — ou seja, seu comportamento padrão para serving não oficial é exatamente "usar o limite declarado pelo modelo". Os provedores do qwen-code são todos de terceiros / compatíveis com OpenAI / self-hosted, então igualar esse comportamento padrão desativado é a escolha segura; assumir que o padrão baixo é seguro para todos os backends não é.
- A compensação de capacidade não é perdida, apenas tornada opt-in: operadores em um backend self-hosted com capacidade restrita podem definir `QWEN_CODE_MAX_OUTPUT_TOKENS` (ex.: `8000`) para restaurar a reserva menor por requisição. Uma feature flag no estilo GrowthBook não é reintroduzida intencionalmente — o qwen-code não possui essa infraestrutura, e a variável de ambiente já atende à necessidade.

### Por que escalar para o limite do modelo em vez de 64K fixo?

- Modelos com limites de saída maiores (Claude Opus 128K, GPT-5 128K) eram restritos a 64K desnecessariamente
- Usar o limite real do modelo captura a grande maioria das saídas longas sem um segundo retry
- `ESCALATED_MAX_TOKENS` (64K) serve como um limite mínimo para modelos desconhecidos onde `tokenLimit()` retorna o padrão de 32K

### Por que recuperação multi-turno em vez de escalonamento progressivo?

- O escalonamento progressivo (por exemplo, 16K -> 32K -> 64K) requer a regeneração da resposta completa a cada vez
- A recuperação multi-turno mantém a resposta parcial e permite que o modelo continue, economizando tokens e latência
- As mensagens de recuperação são baratas (~40 tokens cada) em comparação com a regeneração de respostas grandes
- O limite de 3 tentativas previne loops infinitos, cobrindo a maioria dos casos práticos

### Por que o escalonamento está fora do loop de retry?

- O truncamento é um caso de sucesso, não um erro
- Erros do stream escalonado (limites de taxa, falhas de rede) devem ser propagados diretamente em vez de serem retryados silenciosamente com parâmetros incorretos
- Mantém o loop de retry focado em seu propósito original (recuperação de erros transitórios)
- Erros de recuperação são capturados separadamente para evitar abortar a conversa inteira