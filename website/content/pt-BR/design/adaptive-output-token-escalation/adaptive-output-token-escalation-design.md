# Design de Escalonamento Adaptativo de Tokens de Saída

> Reduz a super-reserva de slots de GPU em ~4x por meio de uma estratégia de "padrão baixo + escalonamento em caso de truncamento" para tokens de saída, com recuperação multi-turno para respostas que excedem até mesmo o limite escalonado.

## Problema

Cada requisição de API reserva um slot de GPU fixo proporcional a `max_tokens`. O padrão anterior de 32K tokens significa que cada requisição reserva um slot de saída de 32K, mas 99% das respostas têm menos de 5K tokens. Isso super-reserva a capacidade da GPU em 4-6x, limitando a concorrência do servidor e aumentando os custos.

## Solução

Utilize um padrão limitado a **8K** tokens de saída. Quando uma resposta for truncada (o modelo atingir `max_tokens`):

1. **Escalone** para o limite total de saída do modelo (com 64K como piso para modelos desconhecidos)
2. Se ainda estiver truncada, **recupere** mantendo a resposta parcial no histórico e injetando uma mensagem de continuação, até 3 vezes
3. Se as tentativas de recuperação se esgotarem, recorra à orientação de truncamento do agendador de ferramentas

Como menos de 1% das requisições são realmente truncadas, isso reduz significativamente a reserva média de slots, preservando a qualidade da saída para respostas longas.

## Arquitetura

```
Requisição (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Resposta truncada?      │──── Não ──▶ Concluído ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Sim
            ▼
┌──────────────────────────────────────────────────┐
│  Camada 1: Escalonar para o limite de saída do   │
│  modelo                                          │
│  ┌────────────────────────────────────────────┐  │
│  │ Remover resposta parcial do histórico      │  │
│  │ RETRY (isContinuation: false → redefinir   │  │
│  │ UI)                                        │  │
│  │ Reenviar com max(64K, limite de saída do   │  │
│  │ modelo)                                    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Ainda truncada?         │──── Não ──▶ Concluído ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Sim
            ▼
┌──────────────────────────────────────────────────┐
│  Camada 2: Recuperação multi-turno (até 3×)      │
│  ┌────────────────────────────────────────────┐  │
│  │ Manter resposta parcial no histórico       │  │
│  │ Inserir mensagem do usuário: "Retome       │  │
│  │ diretamente..."                            │  │
│  │ RETRY (isContinuation: true → manter       │  │
│  │ buffer da UI)                              │  │
│  │ Reenviar com histórico atualizado          │  │
│  │ Modelo continua de onde parou              │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Sucesso?    │── Sim ──▶ Concluído ✓    │
│          └──────┬──────┘                          │
│                 │ Não (ainda truncada)            │
│                 ▼                                 │
│          tentativa < 3? ── Sim ──▶ voltar ao loop │
└───────────┬──────────────────────────────────────┘
            │ Não (esgotado)
            ▼
┌──────────────────────────────────────────────────┐
│  Camada 3: Fallback do agendador de ferramentas  │
│  ┌────────────────────────────────────────────┐  │
│  │ Rejeitar chamadas de ferramentas Edit/Write│  │
│  │ truncadas                                  │  │
│  │ Retornar orientação: "Você DEVE dividir em │  │
│  │ partes menores — escreva o esqueleto       │  │
│  │ primeiro, depois edite incrementalmente."  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Determinação do limite de tokens

O `max_tokens` efetivo é resolvido na seguinte ordem de prioridade:

| Prioridade    | Fonte                                               | Valor (modelo conhecido)          | Valor (modelo desconhecido) | Comportamento de escalonamento                             |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1 (mais alta) | Configuração do usuário (`samplingParams.max_tokens`)            | `min(userValue, modelLimit)` | `userValue`           | Sem escalonamento                                   |
| 2           | Variável de ambiente (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)`  | `envValue`            | Sem escalonamento                                   |
| 3 (mais baixa)  | Padrão limitado                                       | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | Escalona para o limite do modelo (piso de 64K) + recuperação |

Um "modelo conhecido" é aquele que possui uma entrada explícita em `OUTPUT_PATTERNS` (verificado via `hasExplicitOutputLimit()`). Para modelos conhecidos, o valor efetivo é sempre limitado ao limite de saída declarado pelo modelo para evitar erros de API. Modelos desconhecidos (implantações personalizadas, endpoints self-hosted) passam o valor do usuário diretamente, já que o backend pode suportar limites maiores.

Essa lógica é implementada em três geradores de conteúdo:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — provedores compatíveis com OpenAI
- `DashScopeProvider` — herda `applyOutputTokenLimit()` do provedor padrão
- `AnthropicContentGenerator.buildSamplingParameters()` — provedor Anthropic

## Mecanismo de escalonamento

A lógica de escalonamento reside em `geminiChat.ts`, posicionada **fora** do loop principal de retry. Isso é intencional:

1. O loop de retry lida com erros transitórios (limites de taxa, streams inválidos, validação de conteúdo)
2. O truncamento não é um erro — é uma resposta bem-sucedida que foi interrompida
3. Erros do stream escalonado devem ser propagados diretamente ao chamador, não capturados pela lógica de retry

### Etapas de escalonamento (geminiChat.ts)

```
1. Stream concluído com sucesso (lastError === null)
2. Último chunk possui finishReason === MAX_TOKENS
3. Verificações de segurança passam:
   - maxTokensEscalated === false (evitar escalonamento infinito)
   - hasUserMaxTokensOverride === false (respeitar intenção do usuário)
4. Calcular limite escalonado: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Remover a resposta parcial do modelo do histórico de chat
6. Emitir evento RETRY (isContinuation: false) → UI descarta saída parcial e redefine buffers
7. Reenviar a mesma requisição com maxOutputTokens: escalatedLimit
```

### Etapas de recuperação (geminiChat.ts)

Se a resposta escalonada também for truncada (finishReason === MAX_TOKENS), o loop de recuperação executa até `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) vezes:

```
1. Resposta parcial do modelo já está no histórico (inserida por processStreamResponse)
2. Inserir mensagem de recuperação do usuário: OUTPUT_RECOVERY_MESSAGE
3. Emitir evento RETRY (isContinuation: true) → UI mantém buffer de texto para continuação
4. Reenviar com histórico atualizado (modelo vê sua saída parcial + instrução de recuperação)
5. Se ainda truncada e houver tentativas restantes, voltar ao passo 1
6. Se a tentativa de recuperação lançar erro (resposta vazia, erro de rede):
   - Remover a mensagem de recuperação pendente do histórico
   - Sair do loop de recuperação
```

### Limpeza de estado no RETRY (turn.ts)

Quando a classe `Turn` recebe um evento RETRY, ela limpa o estado acumulado para evitar inconsistências:

- `pendingToolCalls` — limpo para evitar chamadas duplicadas de ferramentas se a primeira resposta truncada contiver chamadas concluídas que são repetidas na resposta escalonada
- `pendingCitations` — limpo para evitar citações duplicadas
- `debugResponses` — limpo para evitar dados de debug desatualizados
- `finishReason` — redefinido para `undefined` para que o motivo de conclusão da nova resposta seja utilizado

A flag `isContinuation` é passada para a UI para que ela possa decidir se redefine os buffers de texto (escalonamento) ou os mantém (recuperação).

## Constantes

Definidas em `geminiChat.ts` e `tokenLimits.ts`:

| Constante                       | Valor  | Propósito                                                 |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8.000  | Limite padrão de tokens de saída quando nenhuma substituição do usuário é definida |
| `ESCALATED_MAX_TOKENS`         | 64.000 | Piso para escalonamento (usado quando o limite do modelo é desconhecido) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | Máximo de tentativas de recuperação multi-turno após escalonamento       |

O limite escalonado efetivo é `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modelo            | Limite escalonado |
| ---------------- | --------------- |
| Claude Opus 4.6  | 131.072 (128K)  |
| GPT-5 / o-series | 131.072 (128K)  |
| Qwen3.x          | 65.536 (64K)    |
| Modelos desconhecidos   | 64.000 (piso)  |

## Decisões de design

### Por que o padrão de 8K?

- 99% das respostas têm menos de 5K tokens
- 8K oferece uma margem razoável para respostas um pouco mais longas sem acionar retries desnecessários
- Reduz a reserva média de slots de 32K para 8K (melhoria de 4x)

### Por que escalonar para o limite do modelo em vez de um 64K fixo?

- Modelos com limites de saída mais altos (Claude Opus 128K, GPT-5 128K) eram limitados a 64K desnecessariamente
- Usar o limite real do modelo captura a grande maioria das saídas longas sem um segundo retry
- `ESCALATED_MAX_TOKENS` (64K) serve como piso para modelos desconhecidos onde `tokenLimit()` retorna o padrão de 32K

### Por que recuperação multi-turno em vez de escalonamento progressivo?

- O escalonamento progressivo (8K → 16K → 32K → 64K) exige regenerar a resposta completa a cada vez
- A recuperação multi-turno mantém a resposta parcial e permite que o modelo continue, economizando tokens e latência
- Mensagens de recuperação são baratas (~40 tokens cada) comparadas à regeneração de respostas grandes
- O limite de 3 tentativas evita loops infinitos enquanto cobre a maioria dos casos práticos

### Por que o escalonamento fica fora do loop de retry?

- O truncamento é um caso de sucesso, não um erro
- Erros do stream escalonado (limites de taxa, falhas de rede) devem ser propagados diretamente em vez de serem retentados silenciosamente com parâmetros incorretos
- Mantém o loop de retry focado em seu propósito original (recuperação de erros transitórios)
- Erros de recuperação são capturados separadamente para evitar abortar a conversa inteira