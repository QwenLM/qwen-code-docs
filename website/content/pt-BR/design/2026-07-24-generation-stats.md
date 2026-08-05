# Métricas de tempo de geração em `/stats`

> Um alinhamento posterior do GenAI adiciona o atributo de Span independente
> `gen_ai.response.time_to_first_chunk` ao lado do `ttft_ms` privado existente.
> O fluxo de dados `ApiResponseEvent.ttft_ms` deste documento e a semântica de
> primeira saída visível ao usuário permanecem inalterados; `/stats` não
> consome o atributo padrão de primeiro chunk.

## Contexto

A issue #4252 pede que `/stats` mostre o tempo de geração separadamente do
tempo de parede da sessão e da latência ponta a ponta da API. O tempo de baixo
nível já existe:

- `LoggingContentGenerator` mede `ttftMs` do despacho da requisição até o
  primeiro chunk em streaming visível ao usuário.
- `endLLMRequestSpan` deriva `sampling_ms` e
  `output_tokens_per_second`.
- `ApiResponseEvent` já carrega duração da requisição, modelo, id do prompt e
  contagem de tokens de saída para o `UiTelemetryService`.

O elo faltante é tornar o valor de TTFT existente disponível para as métricas
de sessão livres de conteúdo usadas por `/stats`.

## Escopo

Esta mudança adiciona métricas de geração ao vivo, com escopo de sessão, a:

- a aba Session do `/stats` interativo;
- a resposta em texto do `/stats` não interativo.

Ela não adiciona um segundo timer, não persiste tempos em arquivos de uso de
tokens diários/mensais, não muda exports e não muda o schema de estatísticas
do daemon/Web Shell.

## Fluxo de dados

```text
LoggingContentGenerator.loggingStreamWrapper
  -> ApiResponseEvent(ttft_ms)
  -> logApiResponse
  -> UiTelemetryService
  -> SessionMetrics.generation
  -> SessionContext
  -> /stats
```

`ttft_ms` é opcional. Respostas sem streaming e streams que terminam sem
conteúdo visível ao usuário mantêm o comportamento atual e não criam uma
amostra de geração.

## Métricas e semântica

Para cada resposta em streaming bem-sucedida com TTFT:

- **TTFT** é a medição `ttftMs` existente.
- **Tempo de geração** é `max(0, duration_ms - ttft_ms)`, medido do primeiro
  conteúdo em streaming visível ao usuário até a conclusão.
- **TPS** é `output_token_count / generation_time_seconds`. Fica indisponível
  quando o tempo de geração é zero.

`SessionMetrics.generation` é criado de forma lazy e contém:

- modelo, TTFT, tempo de geração e contagem de tokens de saída da última
  requisição concluída;
- contagem total de requisições cronometradas e TTFT, mais tempo de geração e
  tokens de saída para requisições elegíveis a throughput.

O TTFT médio da sessão é a média aritmética entre as requisições
cronometradas. O TPS da sessão é o throughput ponderado: total de tokens de
saída dividido pelo tempo total de geração. Requisições com tempo de geração
zero contribuem para as estatísticas de TTFT, mas não para nenhum dos lados do
cálculo de TPS da sessão. Isso evita divisão por zero e sobrepeso de
requisições curtas.

Prompts auxiliares internos são excluídos das métricas de geração. Eles não
são registrados na transcrição retomável, e incluí-los surpreenderia os
usuários e faria os valores de sessão ao vivo e retomada divergirem.
Requisições da conversa principal e de subagentes continuam incluídas,
correspondendo às estatísticas de modelo existentes no nível da sessão.

## Compatibilidade

- `ApiResponseEvent.ttft_ms` e `SessionMetrics.generation` são aditivos e
  opcionais.
- Eventos registrados e chamadores existentes permanecem válidos.
- Registros diários/mensais existentes continuam contendo apenas dados de
  tokens e duração de API, preservando o limite de posse documentado em
  `issue-4479-token-usage-stats-coordination.md`.
- A lógica de clonagem/igualdade do contexto da Session copia e compara o
  objeto de geração opcional para que o dashboard interativo seja atualizado a
  cada requisição cronometrada concluída.

## Validação

- Testes do core provam agregação, exclusão de prompts internos, tratamento de
  geração zero, isolamento de sessão e comportamento de reset.
- Testes do LoggingContentGenerator provam que o TTFT capturado chega ao
  `ApiResponseEvent` e permanece ausente para streams não visíveis.
- Testes do CLI provam a saída não interativa e a renderização da aba Session
  interativa.
- Testes de i18n cobrem todos os locales embutidos para os novos rótulos de
  alta visibilidade.
