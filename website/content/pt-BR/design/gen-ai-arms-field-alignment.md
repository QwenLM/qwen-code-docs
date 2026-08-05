# Alinhamento de campos GenAI e ARMS

## Escopo e baseline de padrões

Este design alinha o primeiro conjunto de atributos de span do Qwen Code cujos
nomes, tipos e significados concordam entre as convenções semânticas
OpenTelemetry GenAI e o ARMS LLM Trace do Alibaba Cloud. Ele não altera nomes
de span, kinds de span, parentesco ou topologia de retry.
Ele também documenta a extensão de identidade de usuário final opt-in e
exclusiva do ARMS.

A convenção OpenTelemetry GenAI ainda está em status Development. Esta mudança
está fixada no commit
[`2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b`](https://github.com/open-telemetry/semantic-conventions-genai/tree/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b):

- [Spans de inferência](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-spans.md)
- [Spans de agente](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-agent-spans.md)
- [Registro GenAI](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/model/gen-ai/registry.yaml)

Os atributos de streaming são um suplemento restrito fixado nas
[OpenTelemetry Semantic Conventions v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/gen-ai-spans.md).
Este suplemento adota apenas `gen_ai.request.stream` e
`gen_ai.response.time_to_first_chunk`; não é uma atualização completa do
baseline acima.

O baseline do ARMS são as [definições de campos do LLM Trace](https://help.aliyun.com/zh/arms/application-monitoring/developer-reference/llm-trace-field-definition-description).
Uma atualização de qualquer dos baselines exige regenerar e revisar esta matriz.

## Contrato de campos

| Span         | Atributos padrão emitidos nesta fase                                                                                                                                                                                     | Regra de origem e omissão                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM          | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.conversation.id`, `gen_ai.request.model`                                                                                                                        | Escrito na criação do span. O ID de conversa é o ID de sessão existente.                                                                                                  |
| LLM request  | `gen_ai.request.choice.count`, `gen_ai.request.max_tokens`, `gen_ai.request.temperature`, `gen_ai.request.top_p`, `gen_ai.request.frequency_penalty`, `gen_ai.request.presence_penalty`, `gen_ai.request.stop_sequences` | Lido do primeiro objeto de requisição SDK final do provider. Valores inválidos ou indisponíveis são omitidos; nenhum default de SDK ou servidor é inferido.               |
| LLM stream   | `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk`                                                                                                                                                           | Requisições de streaming emitem `true`; requisições sem streaming omitem o flag padrão de stream. O tempo do primeiro chunk é emitido em segundos após a chegada da primeira resposta normalizada. |
| LLM input    | `gen_ai.input.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions`                                                                                                                                         | JSON compacto sensível da mesma primeira requisição final do provider. Cada valor completo é omitido independentemente se inválido ou excessivo.                         |
| LLM response | `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`                                                                                                                                          | Apenas dados de resposta do provider. Modelo de resposta ausente é omitido em vez de substituído pelo modelo da requisição. Todos os motivos de término candidatos são ordenados por índice de candidato. |
| LLM output   | `gen_ai.output.type`, `gen_ai.output.messages`                                                                                                                                                                           | O tipo de saída é emitido para configurações de requisição Gemini/Vertex suportadas. Mensagens de saída sensíveis vêm da tentativa final de requisição física e preservam todos os candidatos. |
| LLM usage    | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`                                                                            | Apenas inteiros seguros não negativos reportados pelo provider. Zero explícito é mantido. Quando apenas um total é reportado, input/output são omitidos em vez de estimados. |
| Tool         | `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.description`, `gen_ai.tool.type=function`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`                         | A descrição é metadado estático não sensível do registro. Argumentos sensíveis refletem a invocação executada; o resultado é emitido apenas para uma chamada de ferramenta bem-sucedida. |
| Agent        | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.conversation.id`, `gen_ai.request.model` opcional                                                                         | A descrição usa o limite de truncamento existente de 1024 unidades de código UTF-16 e nunca divide pares substitutos. IDs de invocação internos permanecem privados.    |

Atributos privados sem equivalente padrão exato permanecem disponíveis por
compatibilidade, a menos que explicitamente listados para remoção abaixo.
Aliases privados de equivalente exato e aliases GenAI inválidos são removidos
sem período de escrita dupla:

| Atributo removido                                      | Substituição                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| LLM `qwen-code.model`                                  | `gen_ai.request.model`; spans de interação continuam usando `qwen-code.model` porque não são spans de inferência GenAI    |
| LLM `response_id`                                      | `gen_ai.response.id`; logs de resposta/erro de API mantêm seu schema `response_id` existente                               |
| LLM `input_tokens`                                     | `gen_ai.usage.input_tokens` quando o provider reporta um detalhamento de entrada                                          |
| LLM `output_tokens`                                    | `gen_ai.usage.output_tokens` quando o provider reporta um detalhamento de saída                                           |
| LLM `cached_input_tokens`                              | `gen_ai.usage.cache_read.input_tokens` quando o provider reporta leituras de cache                                        |
| Span `tool.name` de `qwen-code.tool`                   | `gen_ai.tool.name`; spans bloqueados no usuário e de hook continuam usando `tool.name`                                    |
| `gen_ai.usage.cached_tokens`                           | `gen_ai.usage.cache_read.input_tokens` quando o provider reporta leituras de cache                                        |
| LLM `llm_request.stream`                               | `gen_ai.request.stream`; streaming emite `true`, sem streaming omite o atributo conforme a convenção semântica            |
| `gen_ai.server.time_to_first_token`                    | Não emitido; não é equivalente ao atributo padrão de primeiro chunk                                                       |
| `gen_ai.usage.reasoning_tokens`                        | Nenhum atributo comum ARMS/GenAI neste baseline; continuar consultando o `thoughts_token_count` privado                   |
| LLM `system_prompt*`                                   | `gen_ai.system_instructions`; mensagens system/developer do OpenAI são representadas em `gen_ai.input.messages`           |
| LLM `tools`, eventos `tool_schema`                     | `gen_ai.tool.definitions`                                                                                                 |
| LLM `response.model_output*`                           | `gen_ai.output.messages`                                                                                                  |
| Tool `tool_input*`                                     | `gen_ai.tool.call.arguments`                                                                                              |
| Tool `tool_result*`                                    | `gen_ai.tool.call.result`                                                                                                 |
| `tools_count`, metadados de hash/preview/comprimento/truncamento | Nenhum equivalente padrão; removido                                                                             |

`gen_ai.response.finish_reasons` agora preserva as strings brutas do provider
para todos os candidatos, em vez dos valores anteriores normalizados para
Gemini. Consultas existentes que filtram valores como `STOP` ou `MAX_TOKENS`
devem migrar para os valores do provider, como `stop`, `length`, `tool_calls`
ou `end_turn`.

`gen_ai.response.time_to_first_chunk` usa um timer monotônico de imediatamente
antes da chamada encapsulada ao provider até o primeiro
`GenerateContentResponse` normalizado observado pelo
`LoggingContentGenerator`. Adaptadores de provider podem filtrar ou mesclar
frames brutos de protocolo antes que eles cheguem ao wrapper de logging, então
frames que um adaptador descarta (por exemplo, o filtro de resposta vazia do
pipeline OpenAI) são excluídos desta medição e o valor registrado pode ser
posterior ao verdadeiro primeiro frame de rede. Respostas normalizadas apenas
de metadados e apenas de uso que sobrevivem à filtragem do adaptador contam
como chunks. O atributo é mantido se o stream falhar, for abortado ou expirar
depois, e é omitido quando nenhum chunk chega.

O timer interno `ttftMs` permanece como a latência de primeira saída visível
ao usuário e continua dirigindo `ApiResponseEvent.ttft_ms`, `sampling_ms`,
`output_tokens_per_second` e a métrica de detalhamento de requisição de API.
Portanto, `duration_ms - gen_ai.response.time_to_first_chunk * 1000` não é
`sampling_ms`.

Consultas existentes de span de streaming devem substituir
`llm_request.stream=true` por `gen_ai.request.stream=true`; spans sem
streaming são identificados pela ausência de `gen_ai.request.stream` (o filtro
antigo `llm_request.stream=false` agora corresponde a zero linhas). O
`ttft_ms` do span permanece disponível para a latência de primeira saída
visível ao usuário; `gen_ai.response.time_to_first_chunk` é um atributo padrão
independente medindo a latência do primeiro chunk normalizado em segundos.

## Resolução de provider e operação

A resolução é uma função pura sobre a configuração efetiva do gerador de
conteúdo. Ela nunca retorna uma URL, credencial, hostname arbitrário de proxy
ou um valor inferido a partir do nome do modelo.

1. Qwen OAuth e uma correspondência exata de `DASHSCOPE_PROXY_BASE_URL`
   resolvem para `dashscope`.
2. Uma correspondência de hostname segura por fronteira reconhece endpoints do
   Alibaba Model Studio e gateways internos do Alibaba, Azure OpenAI e os
   endpoints de terceiros suportados (DeepSeek, xAI, Mistral, MiniMax, Z.AI,
   ModelScope, MiMo, OpenRouter e Requesty).
3. Se o host é desconhecido, um `apiKeyEnvKey` conhecido identifica o provider
   configurado. A identidade do host vence em caso de conflito.
4. Endpoints desconhecidos caem no fallback do provider de protocolo:
   `openai`, `anthropic`, `gcp.gemini` ou `gcp.vertex_ai`.

Requisições OpenAI-compatíveis, Anthropic e Qwen OAuth usam a operação
`chat`. Requisições Gemini e Vertex AI usam `generate_content`.

## Parâmetros de requisição

Os atributos de requisição são coletados depois que os adaptadores de provider
aplicaram defaults, overrides, remoção de campos não suportados e clamps de
janela de saída, imediatamente antes de chamar o SDK do provider. Este é o
objeto final de requisição SDK visível ao Qwen Code, não a configuração
lógica original ou o corpo HTTP serializado. Um span lógico de LLM registra
apenas seu primeiro snapshot de requisição desse tipo.

| Atributo padrão                        | OpenAI-compatível e Qwen OAuth                                     | Anthropic              | Gemini e Vertex AI        |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------- |
| `gen_ai.request.choice.count`          | `n`                                                                | Não aplicável          | `config.candidateCount`   |
| `gen_ai.request.max_tokens`            | `max_tokens`, `max_completion_tokens` ou `max_new_tokens`          | `max_tokens`           | `config.maxOutputTokens`  |
| `gen_ai.request.temperature`           | `temperature`                                                      | `temperature`          | `config.temperature`      |
| `gen_ai.request.top_p`                 | `top_p`                                                            | `top_p`                | `config.topP`             |
| `gen_ai.request.frequency_penalty`     | `frequency_penalty`                                                | Não enviado atualmente | `config.frequencyPenalty` |
| `gen_ai.request.presence_penalty`      | `presence_penalty`                                                 | Não enviado atualmente | `config.presencePenalty`  |
| `gen_ai.request.stop_sequences`        | `stop`                                                             | `stop_sequences`       | `config.stopSequences`    |

Números finitos e inteiros seguros são preservados exatamente, incluindo zero
e valores negativos em requisições de provider com falha. A contagem de
escolhas é omitida quando é um. Sequências de parada devem ser um array de
strings completo; a forma de string única do OpenAI é normalizada para um
array de um elemento. Arrays vazios são mantidos e arrays mistos são omitidos
em vez de filtrados. Defaults explícitos do adaptador são registrados,
enquanto defaults implícitos de SDK ou servidor não são inferidos.

Quando múltiplos aliases de orçamento de saída OpenAI-compatíveis estão
presentes, o máximo padrão é emitido apenas se todos os valores presentes
forem inteiros seguros válidos e iguais. Valores conflitantes são omitidos
porque endpoints compatíveis não têm uma regra de precedência comum.

## Payloads de conteúdo e ferramenta

Conteúdo GenAI sensível é coletado apenas quando
`telemetry.includeSensitiveSpanAttributes` está habilitado. O Qwen Code não lê
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`, então há um único
interruptor de captura de conteúdo. Os adaptadores OpenAI-compatível,
Anthropic, Gemini e Vertex convertem sua requisição SDK final do provider e
estruturas de resposta bruta para os schemas JSON fixados com este design.

A primeira tentativa de requisição física fornece mensagens de entrada,
instruções de sistema e definições de ferramentas. Respostas são vinculadas à
geração: um fallback de provider ou retry de thinking obrigatório inicia um
novo acumulador de resposta, e chunks tardios de uma tentativa mais antiga são
ignorados. Acumuladores de streaming retêm partes canônicas em vez de chunks
brutos. Falhas parciais marcam candidatos inacabados com `error`; uma resposta
bem-sucedida com um candidato sem motivo de término explícito omite o atributo
completo de mensagens de saída.

Cada atributo JSON é serializado de forma compacta e limitado
independentemente por `telemetry.sensitiveSpanAttributeMaxLength`. Valores de
atributo inválidos, cíclicos, incompletos ou excessivos são omitidos por
inteiro; JSON nunca é truncado. Dentro de `gen_ai.tool.definitions`, `type` e
`name` são identidades obrigatórias, então uma identidade inválida omite o
atributo completo. `parameters` é opcional no schema padrão; quando um schema
de parâmetros fornecido pelo provider não pode ser normalizado para Draft-07,
apenas essa propriedade opcional é omitida enquanto a lista ordenada de
identidades de ferramentas é mantida. Arrays e objetos vazios são mantidos
quando o provider explicitamente os envia ou retorna. Com o limite padrão de
1 MiB, o máximo teórico no lado da aplicação é cerca de 4 MiB de atributos
sensíveis por span de LLM e 2 MiB por span de Tool. Coletores e backends
podem impor limites menores.

Argumentos de ferramenta são capturados dos parâmetros finais de invocação
imediatamente antes da execução, após hooks de permissão e edição. Um
resultado de ferramenta é capturado apenas após uma chamada bem-sucedida e
pós-processamento bem-sucedido, a partir do objeto
`FunctionResponse.response` final retornado ao modelo. Ambas as raízes devem
ser objetos JSON. `gen_ai.tool.description` vem da descrição estática do
registro e não é sensível; é limitado a 4096 unidades de código UTF-16,
preserva pares substitutos e anexa `…[truncated]` quando encurtado. Descrições
de agente e erros de span mantêm seus limites de 1024 unidades.

## Proveniência de resposta e uso

Conversores de provider anexam proveniência interna a objetos de uso Gemini
normalizados com um `WeakMap`. Ela registra se um campo de leitura de cache
estava realmente presente e tokens de criação de cache do Anthropic. Isso
preserva a forma JSON pública da resposta e permite que a coleta de lixo siga
o objeto de uso normalizado.

Quando um provider OpenAI-compatível reporta apenas `total_tokens`, o total
normalizado permanece disponível para consumidores internos existentes, mas
nenhuma divisão de entrada/saída é sintetizada e nenhum dos atributos padrão
de uso é emitido.

`response.model`/`chunk.model` do OpenAI e o modelo de mensagem do Anthropic
são preservados como `modelVersion`. Um modelo de provider ausente permanece
ausente para tracing; o fallback para o modelo da requisição permanece
limitado aos logs de API existentes e ao comportamento da UI. A mesclagem de
stream carrega o último modelo de provider conhecido e a proveniência de uso
para a resposta terminal. O input de `message_start` e o uso de cache do
Anthropic são anexados ao primeiro chunk produzido subsequente, então falhas
parciais de stream mantêm o uso reportado pelo provider sem sintetizar uma
contagem de saída.

## Configuração do ARMS

O reconhecimento automático de aplicação GenAI do ARMS requer este atributo de
resource:

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

O Qwen Code não injeta esse atributo de resource específico de fornecedor nem
`gen_ai.span.kind`. O ARMS pode inferir os papéis de LLM, Tool e Agent a
partir de `gen_ai.operation.name`.

### Extensão de identidade de usuário final do ARMS

`gen_ai.user.id` é um atributo comum de Span do ARMS, não parte do baseline
OpenTelemetry GenAI fixado acima. O Qwen Code o emite apenas quando o operador
configura explicitamente `telemetry.userId` ou `QWEN_TELEMETRY_USER_ID`. O
valor é colocado no span de interação na criação e propagado pelo contexto
existente em processo para spans de LLM, Tool e Agent, incluindo agentes
fork/segundo plano com raiz vinculada. Continuações de resultado de ferramenta
resolvem a mesma interação lógica por ID de prompt sem alterar o parentesco de
span; essa entrada mínima de identidade expira com o TTL de rede de segurança
existente de 30 minutos do span.

O valor nunca é inferido, gerado, escrito em Resource/logs/métricas ou
colocado em Baggage de saída. O Qwen Code não faz escrita dupla de
`enduser.id` ou `user.id`. Um `telemetry.resourceAttributes.user.id` anterior
permanece uma dimensão genérica de Resource e deve ser removido explicitamente
na migração. Como a configuração é válida para todo o processo, ela é
suportada apenas quando um processo representa um usuário final; identidade
por requisição para implantações de daemon e canal compartilhados é adiada até
que sua identidade de chamador confiável possa ser conectada de ponta a ponta.

## Trabalho adiado

- `seed` e `top_k` têm tipos ARMS e GenAI incompatíveis nos baselines.
- Embedding precisa de um ciclo de vida correto de modelo solicitado antes do
  tracing.
- O time-to-first-token do ARMS e o time-to-first-chunk do OpenTelemetry
  diferem em nome, unidade e significado. O Qwen Code emite o atributo padrão
  `gen_ai.response.time_to_first_chunk` junto com o `ttft_ms` privado e não
  promete preenchimento automático de um dashboard de primeiro token do ARMS.
- Nomenclatura completa de span GenAI, kind de span CLIENT e topologia lógica
  de retry são um projeto de conformidade separado.
