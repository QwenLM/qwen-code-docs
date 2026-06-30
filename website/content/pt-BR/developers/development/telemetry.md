# Observabilidade com OpenTelemetry

Aprenda como habilitar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observability-with-opentelemetry)
  - [Principais Benefícios](#key-benefits)
  - [Integração com OpenTelemetry](#opentelemetry-integration)
  - [Configuração](#configuration)
  - [Telemetria Aliyun](#aliyun-telemetry)
    - [Exportação Manual OTLP](#manual-otlp-export)
  - [Telemetria Local](#local-telemetry)
    - [Saída Baseada em Arquivo (Recomendado)](#file-based-output-recommended)
    - [Exportação Baseada em Coletor (Avançado)](#collector-based-export-advanced)
  - [Logs e Métricas](#logs-and-metrics)
    - [Logs](#logs)
    - [Métricas](#metrics)
    - [Métricas do Daemon](#daemon-metrics)
    - [Spans](#spans)
    - [Métricas de Recursos](#resource-metrics)
    - [Monitoramento de Desempenho (Reservado)](#performance-monitoring-reserved)

## Notas de Migração

- `tool_output_truncated` foi renomeado para `qwen-code.tool_output_truncated` para consistência de namespace — consumidores downstream filtrando pelo nome antigo devem atualizar suas queries.

- A documentação do histograma `tool.call.latency` listava anteriormente um atributo `decision` — este nunca foi definido no histograma (apenas `function_name` é registrado). O contador `tool.call.count` continua incluindo `decision`.

- A documentação do evento de log `qwen-code.file_operation` e da métrica `file.operation.count` listava anteriormente atributos de diff-stat (`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`) — estes nunca foram definidos em nenhum dos dois. Os dados de diff-stat estão disponíveis através do atributo `metadata` do evento de log `tool_call`.

## Principais Benefícios

- **🔍 Análise de Uso**: Entenda os padrões de interação e a adoção de recursos em toda a sua equipe
- **⚡ Monitoramento de Desempenho**: Rastreie tempos de resposta, consumo de tokens e utilização de recursos
- **🐛 Depuração em Tempo Real**: Identifique gargalos, falhas e padrões de erro conforme eles ocorrem
- **📊 Otimização de Fluxo de Trabalho**: Tome decisões informadas para melhorar configurações e processos
- **🏢 Governança Corporativa**: Monitore o uso entre equipes, rastreie custos, garanta conformidade e integre-se com a infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade neutro em relação a fornecedores e padrão da indústria — o sistema de observabilidade do Qwen Code fornece:

- **Compatibilidade Universal**: Exporte para qualquer backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Use formatos e métodos de coleta consistentes em toda a sua ferramenta
- **Integração à Prova de Futuro**: Conecte-se com a infraestrutura de observabilidade existente e futura
- **Sem Vendor Lock-in**: Alterne entre backends sem alterar sua instrumentação

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuração

Todo o comportamento de telemetria é controlado através do seu arquivo `.qwen/settings.json`. Essas configurações podem ser sobrescritas por variáveis de ambiente ou flags de CLI.

| Setting                           | Environment Variable                                 | CLI Flag                                                 | Description                                                                                                                                    | Values            | Default                 |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | Habilitar ou desabilitar telemetria                                                                                                            | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(deprecated)_         | Rótulo de destino informativo; não controla o roteamento do exportador — defina `otlpEndpoint` ou `outfile` para configurar para onde os dados são enviados | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | Endpoint do coletor OTLP                                                                                                                       | URL string        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocolo de transporte OTLP                                                                                                                   | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | Substituição de endpoint por sinal para traces (somente HTTP)                                                                                  | URL string        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | Substituição de endpoint por sinal para logs (somente HTTP)                                                                                    | URL string        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | Substituição de endpoint por sinal para métricas (somente HTTP)                                                                                | URL string        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | Salvar telemetria em arquivo (sobrescreve a exportação OTLP)                                                                                   | file path         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Incluir prompts nos logs de telemetria                                                                                                         | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | Incluir prompts do usuário, prompts do sistema, I/O de ferramentas e saída do modelo como atributos de span nativos (além dos spans da ponte log-to-span) | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | Comprimento máximo de string JavaScript para cada payload de conteúdo de atributo de span nativo sensível. Defina um valor menor se o seu backend rejeitar atributos grandes. | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | Atributos de recursos estáticos anexados a cada span / log / métrica exportada. Veja [Atributos de recursos](#resource-attributes) abaixo.     | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | Incluir `session.id` nos data points de métricas. **Desabilitado por padrão** para proteger os backends de métricas contra o fan-out de séries temporais. | `true`/`false`    | `false`                 |

**Nota sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`), definir a variável de ambiente correspondente como `true` ou `1` habilitará o recurso. Qualquer outro valor o desabilitará.

**Nota sobre variáveis de ambiente inteiras:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` deve ser um inteiro positivo quando definido. Valores inválidos falham na resolução da configuração de telemetria em vez de fazer fallback silencioso.

**Atributos de span sensíveis:** Quando `includeSensitiveSpanAttributes` está habilitado, duas coisas acontecem:

1. **Atributos de span nativos (`qwen-code.interaction`, `api.generateContent*`, `tool.<name>`)** carregam o conteúdo da conversa literalmente:
   - Prompts do usuário (`new_context`)
   - Prompts do sistema (`system_prompt` — texto completo uma vez por sessão, deduplicado por hash SHA-256; spans subsequentes carregam apenas `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Schemas de ferramentas (emitidos como eventos `tool_schema`, também com deduplicação por hash)
   - Entradas de ferramentas (`tool_input`) e resultados de ferramentas (`tool_result`)
   - Saída do modelo (`response.model_output`)

   Cada payload de conteúdo é truncado em `sensitiveSpanAttributeMaxLength` unidades de string JavaScript. O padrão é 1 MiB (`1048576`), aumentado do padrão anterior de 60 KiB; defina `61440` para preservar o limite antigo. O limite deve estar entre `1` e `104857600` (100 MiB). Para atributos rotulados, rótulos fixos como `[USER PROMPT]`, `[TOOL INPUT: ...]` e `[TOOL RESULT: ...]` contam para o limite; o marcador de truncamento também conta. O limite é medido como comprimento de string JavaScript, não como bytes UTF-8. Conteúdo não-ASCII pode, portanto, ocupar mais bytes após a exportação OTLP. Para a maioria dos tipos de payload, o truncamento adiciona `*_truncated` e `*_original_length`. Prompts do sistema também definem `system_prompt_truncated` quando truncados, mas usam o sempre presente `system_prompt_length` para o comprimento original.

2. **Spans da ponte log-to-span** (usados quando traces HTTP são exportados sem um endpoint de logs) mantêm seus campos existentes `prompt`, `function_args` e `response_text`, em vez de serem descartados.

⚠️ **Aviso de segurança:** habilitar esta flag transmite o histórico completo da conversa, conteúdos de arquivos lidos por `read_file`, comandos de shell e suas saídas (incluindo segredos em variáveis de ambiente ou argumentos) e respostas do modelo para o backend OTLP configurado. Trate o backend como um sink de dados privilegiado. A flag é `false` por padrão.

**Custo / tamanho do payload:** Um turno pesado no limite padrão (prompt do sistema de 1 MiB mais 10 chamadas de ferramenta, cada uma com até 1 MiB de entrada + 1 MiB de resultado, mais 1 MiB de saída do modelo) pode produzir até ~22 MiB de payload de atributos antes da compressão OTLP, mais até 1 MiB por schema de ferramenta emitido em workspaces com definições de ferramentas grandes. Este é o limite do lado da aplicação do Qwen Code, não uma garantia de que cada coletor ou backend aceite um atributo tão grande. Se spans forem rejeitados ou descartados, reduza `sensitiveSpanAttributeMaxLength` (por exemplo, para `61440`) e monitore o throughput do exportador.

Esta configuração não desabilita dados sensíveis nos logs do OTel ou em outros sinks de telemetria; a telemetria de resposta de API não interna pode popular `response_text`, então logs do OTel, telemetria de UI e gravação de chat podem receber texto de resposta independentemente desta configuração. O QwenLogger não inclui `response_text`.

**Roteamento de sinal HTTP OTLP:** Ao usar o protocolo HTTP (`otlpProtocol: "http"`), o Qwen Code anexa automaticamente caminhos específicos de sinal (`/v1/traces`, `/v1/logs`, `/v1/metrics`) ao `otlpEndpoint` base. Por exemplo, `http://collector:4318` se torna `http://collector:4318/v1/traces` para traces. Se a URL já terminar com um caminho de sinal, ela é usada como está. Substituições de endpoint por sinal (`otlpTracesEndpoint`, etc.) têm precedência sobre o endpoint base e são usadas literalmente. O protocolo gRPC usa roteamento baseado em serviço e não anexa caminhos.

As variáveis de ambiente de endpoint por sinal também aceitam os nomes padrão do OpenTelemetry: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. As variantes `QWEN_TELEMETRY_OTLP_*` têm precedência sobre as variantes `OTEL_*`.

Para informações detalhadas sobre todas as opções de configuração, consulte o [Guia de Configuração](../../users/configuration/settings.md).

### Atributos de recursos

Atributos de recursos são pares chave-valor estáticos anexados a cada span, log e métrica exportada via OTLP. Use-os para fatiar a telemetria por equipe, ambiente, região de deployment ou qualquer outra dimensão que seu backend considere importante.

Duas fontes, mescladas em ordem de prioridade (menor → maior):

1. A variável de ambiente padrão `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` em `.qwen/settings.json` (sobrescreve a variável de ambiente em caso de conflito de chave)

`OTEL_SERVICE_NAME` é uma saída separada — quando definida, sobrescreve `service.name` de qualquer outra fonte (de acordo com a especificação do OpenTelemetry).

#### Exemplos

**Fatiar toda a telemetria por equipe / ambiente:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Rotear para um coletor por tenant via `service.name`:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Linha de base da frota (`~/.qwen/settings.json`) + substituição por host:**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# Adicionar uma tag pontual sem alterar as configurações:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Chaves reservadas

Algumas chaves são controladas em tempo de execução e não podem ser sobrescritas:

- `service.version` — sempre definido como a versão da CLI em execução. Defini-la a partir de qualquer fonte é silenciosamente descartada com um aviso.
- `session.id` — injetado em tempo de execução por sessão. Valores fornecidos pelo usuário, seja por variável de ambiente ou configurações, são descartados com um aviso. O motivo é que os atributos de Recursos são anexados automaticamente a cada data point de métrica; permitir a substituição pelo usuário contornaria os [Controles de cardinalidade](#cardinality-controls) abaixo. Spans e logs sempre carregam `session.id`.

`service.name` **não** é reservada; ela segue a cadeia de precedência acima.

#### Formato

`OTEL_RESOURCE_ATTRIBUTES` segue a especificação do OpenTelemetry: `key1=value1,key2=value2` com valores percent-encoded. Espaços nos valores devem ser codificados como `%20`, **vírgulas como `%2C`** (vírgulas não codificadas dividem o valor no limite errado e a segunda metade é descartada como malformada). Pares malformados são ignorados com um aviso em vez de falhar na inicialização da telemetria.

#### Solução de problemas: quando um atributo fornecido pelo usuário parece não ter efeito

Chaves reservadas (`service.version`, `session.id`), pares malformados, valores de configurações não-string e codificação percent-encoded inválida são todos silenciosamente descartados com um aviso registrado no canal de diagnósticos do OpenTelemetry. Esse canal é roteado para o arquivo de log de depuração (`~/.qwen/log/otel-*.log`), **não** para o console, então o comportamento pode parecer uma falha silenciosa.

Se um atributo de recurso personalizado não estiver aparecendo na telemetria exportada:

1. Verifique `~/.qwen/log/otel-*.log` para linhas correspondentes a `cannot override` (chave reservada descartada), `Skipping malformed` (par de variável de ambiente ruim) ou `must be a string` (valor de configuração não-string).
2. Verifique se a variável de ambiente está definida no ambiente do processo qwen-code (não apenas no seu shell) e se os valores estão percent-encoded.
3. Confirme se `telemetry.enabled` é `true` — a inicialização da telemetria só é executada se estiver habilitada.

### Controles de cardinalidade

As métricas são agregadas por conjunto de atributos no backend — cada combinação distinta de valores de atributos produz uma nova série temporal. Anexar um campo de alta cardinalidade como `session.id` a uma métrica causa um fan-out de séries temporais proporcional ao número de sessões, o que esgota rapidamente o armazenamento do backend de métricas.

Para evitar isso, o Qwen Code mantém atributos de alta cardinalidade fora dos data points de métrica por padrão. Spans e logs são por evento e não são afetados, então eles continuam carregando `session.id` para correlação de traces e logs.

#### `telemetry.metrics.includeSessionId` (padrão: `false`)

Definir isso como `true` (via configurações ou `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) reanexa `session.id` a cada data point de métrica.

⚠️ **Aviso:** cada sessão da CLI cria um novo valor. Deixar isso ativado para uma frota vai explodir o armazenamento de métricas. Recomendado apenas para depuração de curto prazo. Para correlação de sessão de longo prazo, consulte os backends de traces ou logs.

#### Migração de versões anteriores

Antes deste release, `session.id` era anexado às métricas por padrão. Se suas queries do Prometheus / dashboards do Grafana / regras de alerta referenciam `session_id` em uma métrica, você tem duas opções:

**Opção A** — restaurar o comportamento anterior para depuração de curto prazo:

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

ou:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**Opção B (recomendada)** — mover a análise no nível da sessão para fora das métricas. Spans e logs ainda carregam `session.id`, e backends de traces / logs (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) lidam com o fatiamento por sessão nativamente sem pressão de cardinalidade.

### Span HTTP do lado do cliente em fetch de saída

Quando a telemetria está habilitada, o Qwen Code registra `UndiciInstrumentation` que cria um span HTTP do lado do cliente para cada requisição `fetch()` de saída originada pelo processo — incluindo os SDKs de LLM (`openai`, `@google/genai`, `@anthropic-ai/sdk`), o cliente MCP StreamableHTTP, a ferramenta `WebFetch` e quaisquer chamadas fora do processo de extensão de IDE. O span permite que você veja a latência da rede (TTFB / transferência do corpo da resposta) separadamente do tempo de processamento do modelo upstream, o que o span `api.generateContent` existente sozinho não consegue distinguir.

Esses spans vão para o **seu próprio** coletor OTLP (ou arquivo de saída) assim como o resto da telemetria — eles não afetam o que é escrito na própria requisição HTTP de saída. Se o header W3C `traceparent` também é escrito no fluxo de requisição de saída é controlado por uma **configuração separada e relevante para a segurança** documentada em [correlação de saída](#outbound-correlation-security-relevant) abaixo.

**Evitação de loop de feedback.** O SDK do OTel usa `fetch` internamente para fazer upload de dados OTLP. Sem proteção, instrumentar `fetch` rastrearia esses uploads, que por sua vez seriam enviados, causando um loop infinito. A instrumentação undici do Qwen Code é configurada com um `ignoreRequestHook` que ignora URLs correspondentes aos prefixos configurados de `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint`. No modo de arquivo de saída, não há uploads HTTP de saída, então o hook é um no-op.

## Correlação de saída (RELEVANTE PARA SEGURANÇA)

Essas configurações vivem em um **namespace de nível superior separado** de `telemetry.*` de propósito: a telemetria controla o fluxo de dados para o próprio backend de observabilidade do operador, enquanto `outboundCorrelation.*` controla quais dados de correlação do lado do cliente o qwen-code escreve **nos fluxos de requisição de API de LLM de saída** que chegam aos endpoints de provedores de LLM de terceiros (DashScope, OpenAI, Anthropic, etc.). Destinatários diferentes, decisão de consentimento diferente. **Todos os valores são desligados por padrão.** Veja a discussão de revisão do PR #4390 para a justificativa do enquadramento.
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

Quando `false` (padrão), o Qwen Code instala um `TextMapPropagator` no-op no SDK do OTel. O `UndiciInstrumentation` ainda cria spans HTTP de cliente para o seu coletor OTLP, mas `propagation.inject()` é um no-op, então **nenhum `traceparent` é gravado nas requisições de saída**. Os Trace IDs permanecem internos ao coletor do operador.

Quando `true`, o propagador composto W3C padrão do SDK (`tracecontext` + `baggage`) é instalado e o header `traceparent` padrão é gravado em cada `fetch` de saída:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Além disso, as variáveis de ambiente `TRACEPARENT` e `TRACESTATE` são definidas nos processos filhos do shell (ferramenta Bash, hooks, monitor) para que os comandos gerados possam participar do mesmo trace distribuído.

Ative essa opção apenas quando o provedor de LLM também reportar para o seu coletor OTel para a junção de traces entre processos — por exemplo, o ARMS Tracing servindo o DashScope. Para a maioria dos operadores, o valor é `false`; a continuação de traces entre fornecedores é um caso de uso nichado.

**Depende de `telemetry.enabled: true`.** O SDK do OTel só é inicializado quando a telemetria está ativada, portanto, `propagateTraceContext` só entra em vigor nesse estado. Defini-lo como `true` com a telemetria desativada é um no-op silencioso — sem SDK, sem propagador, sem `traceparent` na rede. Verifique ambos os flags ao configurar uma correlação ARMS+DashScope:

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### Outros headers de correlação de saída

`X-Qwen-Code-Session-Id` e `X-Qwen-Code-Request-Id` **não fazem parte deste PR**. Eles serão projetados e propostos em seus próprios PRs de acompanhamento sob o mesmo namespace `outboundCorrelation.*`, cada um com seu próprio modelo de ameaças e fluxo de consentimento do operador. A revisão do PR #4390 (LaZzyMan) estabeleceu o princípio: "o escopo de trabalho da telemetria não inclui o envio de identificadores para provedores de LLM"; o trabalho de headers de correlação passa para sua própria discussão de design, em vez de ser incluído na telemetria.

## Telemetria Aliyun

### Exportação Manual de OTLP

Para visualizar a telemetria do Qwen Code no Alibaba Cloud Managed Service for OpenTelemetry, configure o Qwen Code para exportar para o endpoint OTLP fornecido pelo ARMS.

Definir apenas `"target": "gcp"` não configura o destino de exportação. Se `otlpEndpoint` não estiver definido, o Qwen Code ainda usará o padrão `http://localhost:4317`. Se `outfile` estiver definido, ele substituirá `otlpEndpoint` e a telemetria será gravada no arquivo em vez de ser enviada para a Alibaba Cloud.

1. Ative a telemetria no seu `.qwen/settings.json` e defina o endpoint OTLP:

   **Opção A: protocolo gRPC** (endpoint OTLP padrão):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **Opção B: protocolo HTTP com endpoints por sinal** (para backends que usam caminhos não padrão, por exemplo, `/api/otlp/traces` em vez de `/v1/traces`):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **Nota:** Ao usar o protocolo HTTP apenas com `otlpEndpoint` (sem substituições por sinal), o Qwen Code anexa os caminhos OTLP padrão (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à URL base. Se o seu backend usar caminhos diferentes, use as substituições de endpoint por sinal conforme mostrado na Opção B.

2. Se o seu endpoint da Alibaba Cloud exigir autenticação, forneça os headers OTLP por meio de variáveis de ambiente padrão do OpenTelemetry, como `OTEL_EXPORTER_OTLP_HEADERS` (ou as variantes específicas de sinal). O Qwen Code atualmente não expõe headers de autenticação OTLP diretamente no `.qwen/settings.json`.
3. Execute o Qwen Code e envie prompts.
4. Visualize a telemetria no Managed Service for OpenTelemetry:
   - Visão geral do produto:
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Primeiros passos:
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Pontos de entrada do console:
     - China continental:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (console legado:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - Internacional:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - No console, use `Applications` para inspecionar traces e a topologia de serviços.
   - Para localizar o endpoint OTLP e as informações de acesso:
     - **Novo console** (`trace.console.aliyun.com` ou internacional):
       navegue até `Integration Center`.
     - **Console legado** (`tracing.console.aliyun.com`): navegue até
       `Cluster Configurations` → `Access point information`.

## Telemetria Local

Para desenvolvimento e depuração locais, você pode capturar dados de telemetria localmente:

### Saída Baseada em Arquivo (Recomendado)

1. Ative a telemetria no seu `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Nota:** Quando `outfile` está definido, a exportação OTLP é desativada automaticamente. As configurações `target` e `otlpEndpoint` não são necessárias para saída apenas em arquivo e podem ser omitidas com segurança da sua configuração.

2. Execute o Qwen Code e envie prompts.
3. Visualize logs e métricas no arquivo especificado (por exemplo, `.qwen/telemetry.log`).

### Exportação Baseada em Coletor (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso irá:
   - Baixar e iniciar o Jaeger e o coletor OTEL
   - Configurar seu workspace para telemetria local
   - Disponibilizar a UI do Jaeger em http://localhost:16686
   - Salvar logs/métricas em `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Parar o coletor na saída (por exemplo, `Ctrl+C`)
2. Execute o Qwen Code e envie prompts.
3. Visualize traces em http://localhost:16686 e logs/métricas no arquivo de log do coletor.

## Logs e Métricas

A seção a seguir descreve a estrutura de logs, métricas e spans gerados para o Qwen Code.

- Um `sessionId` é incluído como um atributo comum em todos os logs e métricas.

### Logs

Logs são registros com carimbo de data/hora de eventos específicos. Todos os registros de log incluem automaticamente os atributos `event.name` e `event.timestamp`.

Os seguintes eventos são registrados em log:

#### Eventos Principais da Sessão

- `qwen-code.config`: Emitido uma vez na inicialização com a configuração da CLI.
  - **Atributos**: `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks` (separados por vírgula, omitido se desativado), `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `qwen-code.user_prompt`: O usuário envia um prompt.
  - **Atributos**: `prompt_length` (int), `prompt_id` (string), `prompt` (string, excluído se `log_prompts_enabled` for false), `auth_type` (string)

- `qwen-code.user_retry`: O usuário tenta novamente o último prompt.
  - **Atributos**: `prompt_id` (string)

- `qwen-code.conversation_finished`: Uma sequência de turnos de conversa é concluída.
  - **Atributos**: `approvalMode` (string), `turnCount` (int)

- `qwen-code.user_feedback`: O usuário envia feedback da sessão.
  - **Atributos**: `session_id` (string), `rating` (int: 1=ruim, 2=ok, 3=bom), `model` (string), `approval_mode` (string), `prompt_id` (string, opcional)

#### Eventos de Ferramentas

- `qwen-code.tool_call`: Cada chamada de função/ferramenta.
  - **Atributos**: `function_name` (string), `function_args` (object), `duration_ms` (int), `status` (string: "success", "error" ou "cancelled"), `success` (boolean), `decision` (string: "accept", "reject", "auto_accept" ou "modify", opcional), `error` (string, opcional), `error_type` (string, opcional), `prompt_id` (string), `response_id` (string, opcional), `content_length` (int, opcional), `tool_type` (string: "native" ou "mcp"), `mcp_server_name` (string, opcional), `metadata` (object, opcional — para ferramentas de escrita de arquivo contém `model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars`)

- `qwen-code.file_operation`: Cada operação de arquivo.
  - **Atributos**: `tool_name` (string), `operation` (string: "create", "read", "update"), `lines` (int, opcional), `mimetype` (string, opcional), `extension` (string, opcional), `programming_language` (string, opcional)

- `qwen-code.tool_output_truncated`: A saída da ferramenta excedeu o limite de tamanho.
  - **Atributos**: `tool_name` (string), `original_content_length` (int), `truncated_content_length` (int), `threshold` (int), `lines` (int), `prompt_id` (string)

#### Eventos de API

- `qwen-code.api_request`: Requisição de saída para a API do LLM.
  - **Atributos**: `model` (string), `prompt_id` (string), `request_text` (string, opcional), `subagent_name` (string, opcional)

- `qwen-code.api_response`: Resposta recebida da API do LLM.
  - **Atributos**: `response_id` (string), `model` (string), `status_code` (int/string, opcional), `duration_ms` (int), `input_token_count` (int), `output_token_count` (int), `cached_content_token_count` (int), `thoughts_token_count` (int), `total_token_count` (int), `prompt_id` (string), `auth_type` (string, opcional), `response_text` (string, opcional), `subagent_name` (string, opcional)

- `qwen-code.api_error`: Falha na requisição da API.
  - **Atributos**: `model` (string), `prompt_id` (string), `duration_ms` (int), `error_message` (string), `response_id` (string, opcional), `auth_type` (string, opcional), `error_type` (string, opcional), `status_code` (int/string, opcional), `subagent_name` (string, opcional)

  Além disso, aliases padrão do OTel (`http.status_code`, `error.message`, `model_name`, `duration`) são emitidos para compatibilidade.

- `qwen-code.api_cancel`: Requisição da API cancelada pelo usuário.
  - **Atributos**: `model` (string), `prompt_id` (string), `auth_type` (string, opcional), `loop_wakeups_cancelled` (int, opcional)

- `qwen-code.api_retry`: Retry de status HTTP (429/5xx) em um site de chamada do LLM. Distinto de `chat.content_retry`, que lida com retries de `InvalidStreamError` em um orçamento separado.
  - **Atributos**: `model` (string), `prompt_id` (string, opcional), `attempt_number` (int), `error_type` (string, opcional), `error_message` (string), `status_code` (int/string, opcional), `retry_delay_ms` (int), `duration_ms` (int, igual a retry_delay_ms — sleep de backoff, não round-trip HTTP; para a duração da tentativa, veja o span qwen-code.llm_request), `subagent_name` (string, opcional)

- `qwen-code.malformed_json_response`: A resposta de `generateJson` não pôde ser analisada.
  - **Atributos**: `model` (string)

- `qwen-code.flash_fallback`: Mudança para o modelo flash como fallback.
  - **Atributos**: `auth_type` (string)

- `qwen-code.ripgrep_fallback`: Mudança para o grep como fallback.
  - **Atributos**: `use_ripgrep` (boolean), `use_builtin_ripgrep` (boolean), `error` (string, opcional)

#### Eventos de Resiliência

- `qwen-code.chat.content_retry`: Retry de erro de conteúdo (por exemplo, stream vazio).
  - **Atributos**: `attempt_number` (int), `error_type` (string), `retry_delay_ms` (int), `model` (string)

- `qwen-code.chat.content_retry_failure`: Todos os retries de conteúdo esgotados.
  - **Atributos**: `total_attempts` (int), `final_error_type` (string), `total_duration_ms` (int, opcional), `model` (string)

- `qwen-code.chat.invalid_chunk`: Chunk inválido recebido do stream.
  - **Atributos**: `error.message` (string, opcional)

#### Eventos de Comandos e Extensões

- `qwen-code.slash_command`: O usuário executa um comando de barra.
  - **Atributos**: `command` (string), `subcommand` (string, opcional), `status` (string: "success" ou "error", opcional)

- `qwen-code.slash_command.model`: O usuário alterna o modelo via comando `/model`.
  - **Atributos**: `model_name` (string)

- `qwen-code.skill_launch`: Uma skill é iniciada.
  - **Atributos**: `skill_name` (string), `success` (boolean), `prompt_id` (string)

- `qwen-code.extension_install`: Extensão instalada.
  - **Atributos**: `extension_name` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.extension_uninstall`: Extensão desinstalada.
  - **Atributos**: `extension_name` (string), `status` (string)

- `qwen-code.extension_enable`: Extensão ativada.
  - **Atributos**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_disable`: Extensão desativada.
  - **Atributos**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_update`: Extensão atualizada.
  - **Atributos**: `extension_name` (string), `extension_id` (string), `extension_previous_version` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.ide_connection`: Evento de conexão da IDE.
  - **Atributos**: `connection_type` (string: "start" ou "session")

- `qwen-code.auth`: Evento de autenticação.
  - **Atributos**: `auth_type` (string), `action_type` ("auto", "manual", "coding-plan"), `status` ("success", "error", "cancelled"), `error_message` (opcional)

#### Eventos de Subagentes

- `qwen-code.subagent_execution`: Evento de ciclo de vida do subagente.
  - **Atributos**: `subagent_name` (string), `status` ("started", "completed", "failed", "cancelled"), `terminate_reason` (opcional), `result` (opcional), `execution_summary` (opcional)

#### Eventos da Arena

- `qwen-code.arena_session_started`: A sessão da Arena começa.
  - **Atributos**: `arena_session_id` (string), `model_ids` (array de strings JSON), `task_length` (int)

- `qwen-code.arena_agent_completed`: Um agente da Arena termina.
  - **Atributos**: `arena_session_id` (string), `agent_session_id` (string), `agent_model_id` (string), `status` (string: "completed"/"failed"/"cancelled"), `duration_ms` (int), `rounds` (int), `total_tokens` (int), `input_tokens` (int), `output_tokens` (int), `tool_calls` (int), `successful_tool_calls` (int), `failed_tool_calls` (int)

- `qwen-code.arena_session_ended`: A sessão da Arena é concluída.
  - **Atributos**: `arena_session_id` (string), `status` (string: "selected"/"discarded"/"failed"/"cancelled"), `duration_ms` (int), `display_backend` (string, opcional), `agent_count` (int), `completed_agents` (int), `failed_agents` (int), `cancelled_agents` (int), `winner_model_id` (string, opcional)

#### Eventos de Workflow

- `qwen-code.workflow_keyword`: O gatilho de palavra-chave do workflow é disparado.

- `qwen-code.workflow_run`: A execução do workflow atinge o estado terminal.
  - **Atributos**: `status` (string), `agents_dispatched` (int), `agents_completed` (int), `phase_count` (int), `tokens_spent` (int), `duration_ms` (int)

#### Eventos de Auto-Memória

- `qwen-code.memory.extract`: A execução de extração de memória é concluída.
  - **Atributos**: `trigger` ("auto"/"manual"), `status` ("completed"/"skipped"/"failed"), `skipped_reason` (opcional), `patches_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.dream`: A execução de consolidação de memória (dream) é concluída.
  - **Atributos**: `trigger` ("auto"/"manual"), `status` ("updated"/"noop"/"failed"/"cancelled"), `deduped_entries` (int), `touched_topics_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.recall`: A operação de recall de memória é concluída.
  - **Atributos**: `query_length` (int), `docs_scanned` (int), `docs_selected` (int), `strategy` ("none"/"heuristic"/"model"), `duration_ms` (int)

#### Eventos de Sugestão de Prompt e Especulação

- `qwen-code.prompt_suggestion`: Resultado da sugestão de prompt.
  - **Atributos**: `outcome` ("accepted"/"ignored"/"suppressed"), `prompt_id` (opcional), `accept_method` ("tab"/"enter"/"right", opcional), `accept_source` ("live"/"fallback", opcional), `time_to_accept_ms` (opcional), `time_to_ignore_ms` (opcional), `time_to_first_keystroke_ms` (opcional), `suggestion_length` (opcional), `similarity` (opcional), `was_focused_when_shown` (opcional), `reason` (opcional)

- `qwen-code.speculation`: Resultado da execução especulativa.
  - **Atributos**: `outcome` ("accepted"/"aborted"/"failed"), `turns_used` (int), `files_written` (int), `tool_use_count` (int), `duration_ms` (int), `boundary_type` (opcional), `had_pipelined_suggestion` (boolean)

#### Outros Eventos

- `qwen-code.chat_compression`: O contexto do chat foi comprimido.
  - **Atributos**: `tokens_before` (int), `tokens_after` (int), `compression_input_token_count` (int, opcional), `compression_output_token_count` (int, opcional)

- `qwen-code.next_speaker_check`: Determinação do próximo falante.
  - **Atributos**: `prompt_id` (string), `finish_reason` (string), `result` (string)

- `loop_detected`: Loop detectado durante a execução do agente. _(Nota: emitido sem o prefixo `qwen-code.` — inconsistência pré-existente.)_
  - **Atributos**: `loop_type` (string), `prompt_id` (string)

- `kitty_sequence_overflow`: A sequência do protocolo de gráficos Kitty excedeu o tamanho do buffer. _(Nota: emitido sem o prefixo `qwen-code.` — inconsistência pré-existente.)_
  - **Atributos**: `sequence_length` (int), `truncated_sequence` (string, primeiros 20 caracteres)

### Métricas

Métricas são medições numéricas do comportamento ao longo do tempo. Os nomes das métricas usam o prefixo `qwen-code.*`.

#### Métricas Principais

- `qwen-code.session.count` (Counter, Int): Incrementado uma vez por inicialização da CLI.

- `qwen-code.tool.call.count` (Counter, Int): Conta as chamadas de ferramentas.
  - **Atributos**: `function_name`, `success` (boolean), `decision` ("accept"/"reject"/"auto_accept"/"modify", opcional), `tool_type` ("mcp"/"native", opcional)

- `qwen-code.tool.call.latency` (Histogram, ms): Mede a latência das chamadas de ferramentas.
  - **Atributos**: `function_name` (string)

- `qwen-code.api.request.count` (Counter, Int): Conta todas as requisições de API.
  - **Atributos**: `model`, `status_code`, `error_type` (opcional)

- `qwen-code.api.request.latency` (Histogram, ms): Mede a latência das requisições de API.
  - **Atributos**: `model` (string)

- `qwen-code.token.usage` (Counter, Int): Conta os tokens usados.
  - **Atributos**: `model`, `type` ("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count` (Counter, Int): Conta as operações de arquivo.
  - **Atributos**: `operation` ("create"/"read"/"update"), `lines` (opcional), `mimetype` (opcional), `extension` (opcional), `programming_language` (opcional)

- `qwen-code.chat_compression` (Counter, Int): Conta as operações de compressão de chat.
  - **Atributos**: `tokens_before` (int), `tokens_after` (int)

- `qwen-code.slash_command.model.call_count` (Counter, Int): Conta as chamadas do comando de barra de modelo.
  - **Atributos**: `slash_command.model.model_name` (string)

- `qwen-code.subagent.execution.count` (Counter, Int): Conta os eventos de execução de subagentes.
  - **Atributos**: `subagent_name`, `status` ("started"/"completed"/"failed"/"cancelled"), `terminate_reason` (opcional)

#### Métricas de Resiliência

- `qwen-code.api.retry.count` (Counter, Int): Retries de status HTTP (429/5xx) em sites de chamada do LLM.
  - **Atributos**: `model` (string)

- `qwen-code.chat.content_retry.count` (Counter, Int): Retries devido a erros de conteúdo.

- `qwen-code.chat.content_retry_failure.count` (Counter, Int): Todos os retries de conteúdo esgotados.

- `qwen-code.chat.invalid_chunk.count` (Counter, Int): Chunks inválidos do stream.

#### Métricas da Arena

- `qwen-code.arena.session.count` (Counter, Int): Sessões da Arena por status.
  - **Atributos**: `status`, `display_backend` (opcional)
- `qwen-code.arena.session.duration` (Histogram, ms): Duração da sessão da Arena.
  - **Atributos**: `status`

- `qwen-code.arena.agent.count` (Counter, Int): Conclusões do agente da Arena.
  - **Atributos**: `status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms): Duração da execução do agente da Arena.
  - **Atributos**: `model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int): Uso de tokens pelos agentes da Arena.
  - **Atributos**: `model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int): Seleções de resultados da Arena.
  - **Atributos**: `model_id`

#### Métricas de Auto-Memória

- `qwen-code.memory.extract.count` (Counter, Int): Execuções de extração de auto-memória.
  - **Atributos**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms): Duração da extração.
  - **Atributos**: `trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int): Execuções de dream da auto-memória.
  - **Atributos**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms): Duração da execução de dream.
  - **Atributos**: `trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int): Operações de recall da auto-memória.
  - **Atributos**: `strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms): Duração do recall.
  - **Atributos**: `strategy`

#### Detalhamento de Requisições da API

- `qwen-code.api.request.breakdown` (Histogram, ms): Detalhamento do tempo de requisição da API por fase.
  - **Atributos**: `model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Métricas do Daemon

O processo daemon (modo de servidor HTTP de longa duração) expõe suas próprias métricas.

> **Note:** Os três Observable Gauges (`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`) são métricas baseadas em callback atualizadas em cada intervalo de coleta; `registerDaemonGaugeCallbacks()` deve ser invocado durante a inicialização do daemon para registrar os callbacks de observação.

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int): Contagem de requisições por rota e classe de status.
  - **Atributos**: `route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms): Duração da requisição.
  - **Atributos**: `route`
  - **Buckets**: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Sessions

- `qwen-code.daemon.session.active` (ObservableGauge, Int): Sessões ativas no momento.

- `qwen-code.daemon.session.lifecycle` (Counter, Int): Eventos do ciclo de vida da sessão.
  - **Atributos**: `action` ("spawn"/"close"/"die")

#### Channels

- `qwen-code.daemon.channel.lifecycle` (Counter, Int): Eventos do ciclo de vida do canal ACP.
  - **Atributos**: `action` ("spawn"/"exit"), `expected` (boolean, optional)

#### Prompts

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms): Tempo de espera na fila FIFO de prompts.
  - **Buckets**: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms): Duração ponta a ponta do prompt.
  - **Buckets**: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Errors

- `qwen-code.daemon.bridge.error.count` (Counter, Int): Erros de bridge por tipo.
  - **Atributos**: `error_type` (nome de classe conhecido ou "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int): Contagem de requisições de cancelamento.

#### Resources

- `qwen-code.daemon.sse.active` (ObservableGauge, Int): Conexões SSE ativas.

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes): Uso de memória heap.

### Spans

Os spans de rastreamento distribuído formam uma árvore enraizada em `qwen-code.interaction`. Cada interação é uma raiz de rastreamento com seu próprio `traceId`; a correlação entre prompts usa o atributo `session.id`.

- `qwen-code.interaction`: Span raiz para cada turno de prompt do usuário.
  - **Atributos**: `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request`: Encapsula uma única chamada de API do LLM.
  - **Atributos**: `session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool`: Encapsula o ciclo de vida completo da ferramenta (espera por aprovação + execução).
  - **Atributos**: `session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution`: Encapsula a fase de execução da ferramenta (após a aprovação).
  - **Atributos**: `session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user`: Tempo que uma ferramenta passa aguardando a aprovação do usuário.
  - **Atributos**: `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`: Encapsula cada local de disparo de hook de pré/pós-uso de ferramenta.
  - **Atributos**: `session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (optional), `is_interrupt` (boolean, optional), `duration_ms`, `success`, `should_proceed` (optional), `should_stop` (optional), `block_type` (optional), `error` (optional)

- `qwen-code.subagent`: Encapsula uma única invocação de subagente.
  - **Atributos**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request`: Encapsula uma requisição HTTP do daemon.
  - **Atributos**: `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`: Encapsula operações de bridge do daemon.
  - **Atributos**: `qwen-code.daemon.operation`

#### Métricas de Recursos

- `qwen-code.memory.usage` (Histogram, bytes): Uso de memória. Registrado pelo monitor de pressão de memória quando a telemetria está habilitada.
  - **Atributos**: `memory_type` (string: "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent): Porcentagem de uso da CPU. Registrado pelo monitor de pressão de memória quando a telemetria está habilitada.
  - **Atributos**: (none)

### Monitoramento de Desempenho (Reservado)

As seguintes métricas estão definidas, mas **ainda não habilitadas em produção**. Elas serão ativadas por trás de uma flag de configuração dedicada ao monitoramento de desempenho.

- `qwen-code.startup.duration` (Histogram, ms): Tempo de inicialização da CLI por fase.
  - **Atributos**: `phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count): Ferramentas na fila de execução.

- `qwen-code.tool.execution.breakdown` (Histogram, ms): Tempo de execução da ferramenta por fase.
  - **Atributos**: `function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio): Métricas de eficiência de tokens.
  - **Atributos**: `model`, `metric`, `context` (optional)

- `qwen-code.performance.score` (Histogram, score): Pontuação de desempenho composta (0-100).
  - **Atributos**: `category`, `baseline` (optional)

- `qwen-code.performance.regression` (Counter, Int): Eventos de detecção de regressão.
  - **Atributos**: `metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent): Mudança percentual em relação ao baseline.
  - **Atributos**: `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent): Desempenho em relação ao baseline.
  - **Atributos**: `metric`, `category`, `current_value`, `baseline_value`