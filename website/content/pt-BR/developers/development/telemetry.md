# Observabilidade com OpenTelemetry

Aprenda como ativar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observabilidade-com-opentelemetry)
  - [Principais Benefícios](#principais-benefícios)
  - [Integração com OpenTelemetry](#integração-com-opentelemetry)
  - [Configuração](#configuração)
  - [Telemetria Aliyun](#telemetria-aliyun)
    - [Exportação OTLP Manual](#exportação-otlp-manual)
  - [Telemetria Local](#telemetria-local)
    - [Saída Baseada em Arquivo (Recomendado)](#saída-baseada-em-arquivo-recomendado)
    - [Exportação Baseada em Coletor (Avançado)](#exportação-baseada-em-coletor-avançado)
  - [Logs e Métricas](#logs-e-métricas)
    - [Logs](#logs)
    - [Métricas](#métricas)

## Principais Benefícios

- **🔍 Análise de Uso**: Compreenda padrões de interação e adoção de funcionalidades
  em sua equipe
- **⚡ Monitoramento de Desempenho**: Acompanhe tempos de resposta, consumo de tokens e
  utilização de recursos
- **🐛 Depuração em Tempo Real**: Identifique gargalos, falhas e padrões de erro
  conforme ocorrem
- **📊 Otimização de Fluxo de Trabalho**: Tome decisões informadas para melhorar
  configurações e processos
- **🏢 Governança Empresarial**: Monitore o uso entre equipes, acompanhe custos, garanta
  conformidade e integre-se à infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade neutro em relação a fornecedores e padrão da indústria — o sistema de observabilidade do Qwen Code oferece:

- **Compatibilidade Universal**: Exporte para qualquer backend OpenTelemetry (Aliyun,
  Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Use formatos e métodos de coleta consistentes em todo o
  seu conjunto de ferramentas
- **Integração à Prova de Futuro**: Conecte-se com infraestruturas de observabilidade
  existentes e futuras
- **Sem Dependência de Fornecedor**: Troque entre backends sem alterar sua
  instrumentação

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuração

Todo o comportamento de telemetria é controlado através do arquivo `.qwen/settings.json`.
Essas configurações podem ser substituídas por variáveis de ambiente ou flags de CLI.

| Configuração                     | Variável de Ambiente                              | Flag de CLI                                                | Descrição                                                                                                                         | Valores           | Padrão                  |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                        | `QWEN_TELEMETRY_ENABLED`                          | `--telemetry` / `--no-telemetry`                           | Ativa ou desativa a telemetria                                                                                                    | `true`/`false`    | `false`                 |
| `target`                         | `QWEN_TELEMETRY_TARGET`                           | `--telemetry-target <local\|gcp>` _(obsoleto)_             | Rótulo informativo de destino; não controla o roteamento do exportador — defina `otlpEndpoint` ou `outfile` para configurar o envio | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                   | `QWEN_TELEMETRY_OTLP_ENDPOINT`                    | `--telemetry-otlp-endpoint <URL>`                           | Endpoint do coletor OTLP                                                                                                          | string de URL     | `http://localhost:4317` |
| `otlpProtocol`                   | `QWEN_TELEMETRY_OTLP_PROTOCOL`                    | `--telemetry-otlp-protocol <grpc\|http>`                    | Protocolo de transporte OTLP                                                                                                      | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`             | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`             | -                                                          | Substituição de endpoint por sinal para traces (apenas HTTP)                                                                      | string de URL     | -                       |
| `otlpLogsEndpoint`               | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`               | -                                                          | Substituição de endpoint por sinal para logs (apenas HTTP)                                                                        | string de URL     | -                       |
| `otlpMetricsEndpoint`            | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`            | -                                                          | Substituição de endpoint por sinal para métricas (apenas HTTP)                                                                    | string de URL     | -                       |
| `outfile`                        | `QWEN_TELEMETRY_OUTFILE`                          | `--telemetry-outfile <caminho>`                            | Salva telemetria em arquivo (substitui a exportação OTLP)                                                                         | caminho de arquivo| -                       |
| `logPrompts`                     | `QWEN_TELEMETRY_LOG_PROMPTS`                      | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`   | Inclui prompts nos logs de telemetria                                                                                             | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes` | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`| -                                                          | Inclui prompts do usuário, prompts do sistema, E/S de ferramentas e saída do modelo como atributos nativos de span (além dos spans da ponte log-para-span) | `true`/`false`    | `false`                 |
| `resourceAttributes`             | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)| -                                                          | Atributos de recurso estáticos anexados a cada span/log/métrica exportado. Veja [Atributos de recurso](#atributos-de-recurso) abaixo. | `chave=valor,…`   | `{}`                    |
| `metrics.includeSessionId`       | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`       | -                                                          | Inclui `session.id` nos pontos de dados de métrica. **Desabilitado por padrão** para proteger backends de métricas de dispersão de séries temporais. | `true`/`false`    | `false`                 |
**Nota sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`,
`logPrompts`, `includeSensitiveSpanAttributes`), definir a variável de ambiente
correspondente como `true` ou `1` ativará o recurso. Qualquer outro valor o
desativará.

**Span attributes sensíveis:** Quando `includeSensitiveSpanAttributes` está
ativado, duas coisas acontecem:

1. **Span attributes nativos (`qwen-code.interaction`, `api.generateContent*`,
   `tool.<name>`)** carregam o conteúdo da conversa literal:
   - Prompts do usuário (`new_context`)
   - Prompts do sistema (`system_prompt` — texto completo uma vez por sessão, deduplicado por
     hash SHA-256; spans subsequentes carregam apenas `system_prompt_hash` +
     `system_prompt_preview` + `system_prompt_length`)
   - Schemas de ferramentas (emitidos como eventos `tool_schema`, também deduplicados por hash)
   - Entradas da ferramenta (`tool_input`) e resultados da ferramenta (`tool_result`)
   - Saída do modelo (`response.model_output`)

   Cada valor é truncado em 60 KB; os sinalizadores `*_truncated` e `*_original_length`
   são exibidos quando o truncamento ocorre.

2. **Spans da ponte log-to-span** (usados quando traces HTTP são exportados sem um
   endpoint de logs) mantêm seus campos `prompt`, `function_args` e
   `response_text` existentes, em vez de serem descartados.

⚠️ **Aviso de segurança:** ativar este sinalizador transmite o histórico completo da conversa,
conteúdos de arquivos lidos por `read_file`, comandos de shell e suas saídas (incluindo
segredos em variáveis de ambiente ou argumentos) e respostas do modelo para o backend OTLP
configurado. Trate o backend como um sumidouro de dados privilegiado. O sinalizador padrão é
`false`.

**Custo / tamanho do payload:** Uma interação pesada (60 KB de system prompt + 10 chamadas de
ferramenta, cada uma com até 60 KB de entrada + 60 KB de resultado, mais 60 KB de saída do
modelo) pode produzir até ~1,5 MB de payload de attributes antes da compressão OTLP. Ao
apontar ferramentas que leem arquivos grandes (`read_file`, etc.) para sessões longas,
monitore a taxa de transferência do exportador.

Esta configuração não desabilita dados sensíveis em logs OTel ou outros sumidouros de
telemetria; a telemetria de resposta de API não interna pode preencher `response_text`, então
logs OTel, telemetria de UI e gravação de chat podem receber texto de resposta
independentemente desta configuração. O QwenLogger não inclui `response_text`.

**Roteamento de sinal OTLP HTTP:** Ao usar o protocolo HTTP (`otlpProtocol: "http"`),
o Qwen Code anexa automaticamente caminhos específicos de sinal (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) ao `otlpEndpoint` base. Por exemplo, `http://collector:4318`
torna-se `http://collector:4318/v1/traces` para traces. Se a URL já terminar
com um caminho de sinal, ela é usada como está. Substituições de endpoint por sinal
(`otlpTracesEndpoint`, etc.) têm precedência sobre o endpoint base e são usadas
literalmente. O protocolo gRPC usa roteamento baseado em serviço e não anexa caminhos.

As variáveis de ambiente de endpoint por sinal também aceitam os nomes
padrão do OpenTelemetry: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
As variantes `QWEN_TELEMETRY_OTLP_*` têm precedência sobre as variantes `OTEL_*`.

Para informações detalhadas sobre todas as opções de configuração, consulte o
[Guia de Configuração](../../users/configuration/settings.md).

### Atributos do recurso

Atributos do recurso são pares chave-valor estáticos anexados a cada span, log
e métrica exportados via OTLP. Use-os para fatiar a telemetria por equipe, ambiente,
região de implantação ou qualquer outra dimensão que seu backend considere importante.

Duas fontes, mescladas em ordem de prioridade (menor → maior):

1. A variável de ambiente padrão `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` em `.qwen/settings.json` (sobrescreve a variável de ambiente em
   caso de conflito de chave)

`OTEL_SERVICE_NAME` é uma "válvula de escape" separada — quando definida, ela sobrescreve
`service.name` de qualquer outra fonte (de acordo com a especificação OpenTelemetry).

#### Exemplos

**Fatie toda a telemetria por equipe / ambiente:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Roteie para um collector por locatário via `service.name`:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Configuração base da frota (`~/.qwen/settings.json`) + substituição por host:**

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
# Adicione uma tag pontual sem mexer nas configurações:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Chaves reservadas

Algumas chaves são controladas em tempo de execução e não podem ser sobrescritas:

- `service.version` — sempre definido como a versão atual da CLI. Definir a partir de
  qualquer fonte é silenciosamente ignorado com um aviso.
- `session.id` — injetado em tempo de execução por sessão. Valores fornecidos pelo usuário
  vindos de variável de ambiente ou configurações são ignorados com um aviso. O motivo é que
  Atributos do recurso são anexados automaticamente a cada ponto de dado de métrica; permitir
  sobrescrita pelo usuário burlaria os [Controles de cardinalidade](#cardinality-controls) abaixo.
  Spans e logs sempre carregam `session.id`.

`service.name` **não** é reservado; segue a cadeia de precedência acima.

#### Formato

`OTEL_RESOURCE_ATTRIBUTES` segue a especificação OpenTelemetry:
`key1=value1,key2=value2` com valores codificados em percentual. Espaços nos valores devem
ser codificados como `%20`, **vírgulas como `%2C`** (vírgulas não codificadas dividem o valor no
limite errado e a segunda metade é descartada como malformada). Pares malformados
são ignorados com um aviso em vez de falhar na inicialização da telemetria.
#### Solução de problemas: quando um atributo fornecido pelo usuário parece não ter efeito

Chaves reservadas (`service.version`, `session.id`), pares malformados, valores
de configuração que não são strings e codificação percentual inválida são todos
silenciosamente descartados com um aviso registrado via canal de diagnóstico do
OpenTelemetry. Esse canal roteia para o arquivo de log de depuração
(`~/.qwen/log/otel-*.log`), **não** para o console, então o comportamento pode
parecer uma falha silenciosa.

Se um atributo de recurso personalizado não estiver aparecendo na telemetria
exportada:

1. Verifique `~/.qwen/log/otel-*.log` por linhas contendo `cannot override`
   (chave reservada descartada), `Skipping malformed` (par de env var ruim) ou
   `must be a string` (valor de configuração não string).
2. Confirme se a env var está definida no ambiente do processo qwen-code (não
   apenas no seu shell) e que os valores estão codificados em percentual.
3. Confirme se `telemetry.enabled` é `true` — a inicialização da telemetria só
   é executada se estiver habilitada.

### Controles de cardinalidade

As métricas são agregadas por conjunto de atributos no backend — cada combinação
distinta de valores de atributo gera uma nova série temporal. Anexar um campo
de alta cardinalidade como `session.id` a uma métrica causa uma expansão de
séries temporais proporcional ao número de sessões, que rapidamente esgota o
armazenamento do backend de métricas.

Para evitar isso, o Qwen Code mantém atributos de alta cardinalidade fora dos
pontos de dados de métricas por padrão. Spans e logs são por evento e não são
afetados, então continuam carregando `session.id` para correlação de trace e
log.

#### `telemetry.metrics.includeSessionId` (padrão: `false`)

Definir isso como `true` (via configurações ou
`QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) reanexa `session.id` a cada
ponto de dado de métrica.

⚠️ **Aviso:** cada sessão da CLI cria um novo valor. Manter isso ativado para
uma frota irá sobrecarregar o armazenamento de métricas. Recomendado apenas
para depuração de curto prazo. Para correlação de sessão de longo prazo,
consulte backends de trace ou log.

#### Migração de versões anteriores

Antes desta versão, `session.id` era anexado às métricas por padrão. Se suas
consultas Prometheus / dashboards Grafana / regras de alerta referenciam
`session_id` em uma métrica, você tem duas opções:

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

**Opção B (recomendada)** — mover a análise em nível de sessão para fora das
métricas. Spans e logs ainda carregam `session.id`, e backends de trace/log
(Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) lidam com a segmentação por
sessão nativamente, sem pressão de cardinalidade.

### Span HTTP do lado do cliente em fetch de saída

Quando a telemetria está habilitada, o Qwen Code registra
`UndiciInstrumentation`, que cria um span HTTP do lado do cliente para cada
requisição `fetch()` de saída originada pelo processo — incluindo os SDKs de
LLM (`openai`, `@google/genai`, `@anthropic-ai/sdk`), o cliente MCP
StreamableHTTP, a ferramenta `WebFetch` e quaisquer chamadas fora do processo
de extensões IDE. O span permite que você veja a latência de rede (TTFB /
transferência do corpo da resposta) separadamente do tempo de processamento do
modelo upstream, que o span `api.generateContent` existente sozinho não
consegue distinguir.

Esses spans vão para seu **próprio** coletor OTLP (ou arquivo de saída) assim
como o resto da telemetria — eles não afetam o que é escrito na requisição HTTP
de saída. Se o cabeçalho W3C `traceparent` também é escrito no fluxo de
requisição de saída é controlado por uma **configuração separada e relevante
para segurança** documentada em
[correlação de saída](#correlação-de-saída-relevante-para-segurança) abaixo.

**Evitação de loop de feedback.** O SDK OTel usa `fetch` internamente para
enviar dados OTLP. Sem proteção, instrumentar `fetch` rastrearia esses envios,
que por sua vez seriam enviados, causando um loop infinito. A instrumentação
undici do Qwen Code é configurada com um `ignoreRequestHook` que ignora URLs
que correspondem aos prefixos configurados em `telemetry.otlpEndpoint` /
`telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` /
`telemetry.otlpMetricsEndpoint`. No modo de arquivo de saída não há envios HTTP
de saída, então o hook é um no-op.

## Correlação de saída (RELEVANTE PARA SEGURANÇA)

Essas configurações estão em um **namespace de nível superior separado** de
`telemetry.*` propositalmente: telemetria controla o fluxo de dados para o
próprio backend de observabilidade do operador, enquanto `outboundCorrelation.*`
controla quais dados de correlação do lado do cliente qwen-code escreve **nos
fluxos de requisição de LLM de saída** que alcançam endpoints de provedores de
LLM terceiros (DashScope, OpenAI, Anthropic, etc.). Destinatários diferentes,
decisões de consentimento diferentes. **Todos os valores padrão são
desligados.** Veja a discussão da revisão PR #4390 para a fundamentação do
enquadramento.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // padrão
}
```

Quando `false` (padrão), o Qwen Code instala um `TextMapPropagator` no-op no
SDK OTel. O UndiciInstrumentation ainda cria spans HTTP do cliente para seu
coletor OTLP, mas `propagation.inject()` é um no-op, então **nenhum
`traceparent` é escrito nas requisições de saída**. IDs de trace permanecem
internos ao coletor do operador.
Quando `true`, o propagador composto W3C padrão do SDK (`tracecontext` + `baggage`) é instalado e o cabeçalho padrão `traceparent` é escrito em toda requisição `fetch` de saída:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Opte por ativar apenas quando o provedor de LLM também reporta para seu coletor OTel para costura de traces entre processos — por exemplo, ARMS Tracing servindo DashScope.
Para a maioria dos operadores o valor é `false`; continuidade de trace entre fornecedores é algo nichado.

**Depende de `telemetry.enabled: true`.** O SDK OTel só é inicializado quando a telemetria está habilitada, portanto `propagateTraceContext` só tem efeito nesse estado. Definir como `true` enquanto a telemetria está desabilitada é um no-op silencioso — sem SDK, sem propagador, sem `traceparent` no fio. Verifique ambas as flags ao configurar uma correlação ARMS+DashScope:

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

### Outros cabeçalhos de correlação de saída

`X-Qwen-Code-Session-Id` e `X-Qwen-Code-Request-Id` **não fazem parte
desta PR**. Eles serão projetados e propostos em suas próprias PR(s)
de acompanhamento sob o mesmo namespace `outboundCorrelation.*`, cada
uma com seu próprio modelo de ameaça e fluxo de consentimento do
operador. A revisão da PR #4390 (LaZzyMan) estabeleceu o princípio: "o
escopo de trabalho da telemetria não inclui o envio de identificadores
para provedores de LLM"; o trabalho de cabeçalhos de correlação segue
para sua própria discussão de design em vez de ser incluído na telemetria.

## Telemetria Aliyun

### Exportação OTLP Manual

Para visualizar a telemetria do Qwen Code no Alibaba Cloud Managed Service for
OpenTelemetry, configure o Qwen Code para exportar para o endpoint OTLP
fornecido pelo ARMS.

Definir `"target": "gcp"` sozinho não configura o destino da exportação.
Se `otlpEndpoint` não for definido, o Qwen Code ainda usa o padrão
`http://localhost:4317`. Se `outfile` for definido, ele sobrescreve
`otlpEndpoint` e a telemetria é escrita no arquivo em vez de ser enviada
para o Alibaba Cloud.

1. Habilite a telemetria no seu `.qwen/settings.json` e defina o endpoint
   OTLP:

   **Opção A: Protocolo gRPC** (endpoint OTLP padrão):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<seu-endpoint-otlp>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **Opção B: Protocolo HTTP com endpoints por sinal** (para backends
   que usam caminhos não padrão, ex.: `/api/otlp/traces` em vez de
   `/v1/traces`):

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

   > **Nota:** Ao usar o protocolo HTTP apenas com `otlpEndpoint` (sem
   > sobrescritas por sinal), o Qwen Code anexa os caminhos OTLP padrão
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à URL base. Se seu
   > backend usar caminhos diferentes, use as sobrescritas de endpoint
   > por sinal conforme mostrado na Opção B.

2. Se seu endpoint do Alibaba Cloud exigir autenticação, forneça cabeçalhos
   OTLP através das variáveis de ambiente padrão do OpenTelemetry, como
   `OTEL_EXPORTER_OTLP_HEADERS` (ou as variantes específicas de sinal). O
   Qwen Code atualmente não expõe cabeçalhos de autenticação OTLP diretamente
   em `.qwen/settings.json`.

3. Execute o Qwen Code e envie prompts.

4. Visualize a telemetria no Managed Service for OpenTelemetry:
   - Visão geral do produto:
     [O que é o Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Primeiros passos:
     [Introdução ao Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Pontos de entrada do console:
     - China continental:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (console legado:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - Internacional:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - No console, use `Applications` para inspecionar traces e topologia
     de serviços.
   - Para localizar o endpoint OTLP e as informações de acesso:
     - **Novo console** (`trace.console.aliyun.com` ou internacional):
       navegue até `Integration Center`.
     - **Console legado** (`tracing.console.aliyun.com`): navegue até
       `Cluster Configurations` → `Access point information`.

## Telemetria Local

Para desenvolvimento e depuração local, você pode capturar dados de telemetria localmente:

### Saída baseada em Arquivo (Recomendado)

1. Habilite a telemetria no seu `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Nota:** Quando `outfile` é definido, a exportação OTLP é automaticamente desabilitada.
   > As configurações `target` e `otlpEndpoint` não são necessárias para saída apenas em
   > arquivo e podem ser omitidas com segurança da sua configuração.

2. Execute o Qwen Code e envie prompts.
3. Visualize logs e métricas no arquivo especificado (ex.: `.qwen/telemetry.log`).
### Exportação Baseada em Coletor (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso irá:
   - Baixar e iniciar o Jaeger e o coletor OTEL
   - Configurar seu workspace para telemetria local
   - Fornecer uma interface Jaeger em http://localhost:16686
   - Salvar logs/métricas em `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Parar o coletor ao sair (ex.: `Ctrl+C`)
2. Execute o Qwen Code e envie prompts.
3. Visualize traces em http://localhost:16686 e logs/métricas no arquivo de log
   do coletor.

## Logs e Métricas

A seção a seguir descreve a estrutura dos logs e métricas gerados para o
Qwen Code.

- Um `sessionId` é incluído como um atributo comum em todos os logs e métricas.

### Logs

Logs são registros com timestamp de eventos específicos. Os seguintes eventos são registrados para o Qwen Code:

- `qwen-code.config`: Este evento ocorre uma vez na inicialização com a configuração da CLI.
  - **Atributos**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, tipos de eventos de hook separados por vírgula, omitido se hooks estiverem desabilitados)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" ou "json")

- `qwen-code.user_prompt`: Este evento ocorre quando um usuário envia um prompt.
  - **Atributos**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, este atributo é excluído se `log_prompts_enabled` estiver
      configurado como `false`)
    - `auth_type` (string)

- `qwen-code.tool_call`: Este evento ocorre para cada chamada de função.
  - **Atributos**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept" ou "modify", se
      aplicável)
    - `error` (se aplicável)
    - `error_type` (se aplicável)
    - `content_length` (int, se aplicável)
    - `metadata` (se aplicável, dicionário de string -> any)

- `qwen-code.file_operation`: Este evento ocorre para cada operação de arquivo.
  - **Atributos**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, se aplicável)
    - `mimetype` (string, se aplicável)
    - `extension` (string, se aplicável)
    - `programming_language` (string, se aplicável)
    - `diff_stat` (string JSON, se aplicável): Uma string JSON com os seguintes membros:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Este evento ocorre ao fazer uma requisição à API Qwen.
  - **Atributos**:
    - `model`
    - `request_text` (se aplicável)

- `qwen-code.api_error`: Este evento ocorre se a requisição à API falhar.
  - **Atributos**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Este evento ocorre ao receber uma resposta da API Qwen.
  - **Atributos**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (opcional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text` (se aplicável)
    - `auth_type`

- `qwen-code.tool_output_truncated`: Este evento ocorre quando a saída de uma chamada de ferramenta é muito grande e é truncada.
  - **Atributos**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Este evento ocorre quando uma resposta `generateJson` da API Qwen não pode ser interpretada como JSON.
  - **Atributos**:
    - `model`

- `qwen-code.flash_fallback`: Este evento ocorre quando o Qwen Code muda para flash como fallback.
  - **Atributos**:
    - `auth_type`

- `qwen-code.slash_command`: Este evento ocorre quando um usuário executa um comando de barra.
  - **Atributos**:
    - `command` (string)
    - `subcommand` (string, se aplicável)

- `qwen-code.extension_enable`: Este evento ocorre quando uma extensão é ativada
- `qwen-code.extension_install`: Este evento ocorre quando uma extensão é instalada
  - **Atributos**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Este evento ocorre quando uma extensão é desinstalada

### Métricas

Métricas são medidas numéricas de comportamento ao longo do tempo. As seguintes métricas são coletadas para o Qwen Code (os nomes das métricas permanecem `qwen-code.*` para compatibilidade):

- `qwen-code.session.count` (Contador, Inteiro): Incrementado uma vez por inicialização da CLI.

- `qwen-code.tool.call.count` (Contador, Inteiro): Conta chamadas de ferramenta.
  - **Atributos**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" ou "modify", se aplicável)
    - `tool_type` (string: "mcp" ou "native", se aplicável)
- `qwen-code.tool.call.latency` (Histogram, ms): Mede a latência de chamadas de ferramenta.
  - **Atributos**:
    - `function_name`
    - `decision` (string: "accept", "reject", ou "modify", se aplicável)

- `qwen-code.api.request.count` (Counter, Int): Conta todas as requisições de API.
  - **Atributos**:
    - `model`
    - `status_code`
    - `error_type` (se aplicável)

- `qwen-code.api.request.latency` (Histogram, ms): Mede a latência de requisições de API.
  - **Atributos**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Conta o número de tokens utilizados.
  - **Atributos**:
    - `model`
    - `type` (string: "input", "output", "thought", ou "cache")

- `qwen-code.file.operation.count` (Counter, Int): Conta operações de arquivo.
  - **Atributos**:
    - `operation` (string: "create", "read", "update"): O tipo de operação de arquivo.
    - `lines` (Int, se aplicável): Número de linhas no arquivo.
    - `mimetype` (string, se aplicável): Tipo MIME do arquivo.
    - `extension` (string, se aplicável): Extensão do arquivo.
    - `model_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo modelo.
    - `model_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo modelo.
    - `user_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo usuário nas alterações propostas pela IA.
    - `user_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo usuário nas alterações propostas pela IA.
    - `programming_language` (string, se aplicável): A linguagem de programação do arquivo.

- `qwen-code.chat_compression` (Counter, Int): Conta operações de compressão de chat
  - **Atributos**:
    - `tokens_before`: (Int): Número de tokens no contexto antes da compressão
    - `tokens_after`: (Int): Número de tokens no contexto após a compressão
