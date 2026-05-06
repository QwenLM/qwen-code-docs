# Observabilidade com OpenTelemetry

Saiba como ativar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observability-with-opentelemetry)
  - [Principais Benefícios](#key-benefits)
  - [Integração com OpenTelemetry](#opentelemetry-integration)
  - [Configuração](#configuration)
  - [Telemetria Aliyun](#aliyun-telemetry)
    - [Exportação Manual OTLP](#manual-otlp-export)
  - [Telemetria Local](#local-telemetry)
    - [Saída Baseada em Arquivo (Recomendado)](#file-based-output-recommended)
    - [Exportação Baseada em Collector (Avançado)](#collector-based-export-advanced)
  - [Logs e Métricas](#logs-and-metrics)
    - [Logs](#logs)
    - [Métricas](#metrics)

## Principais Benefícios

- **🔍 Análise de Uso**: Entenda os padrões de interação e a adoção de recursos em toda a sua equipe
- **⚡ Monitoramento de Desempenho**: Acompanhe tempos de resposta, consumo de tokens e utilização de recursos
- **🐛 Depuração em Tempo Real**: Identifique gargalos, falhas e padrões de erro conforme eles ocorrem
- **📊 Otimização de Fluxo de Trabalho**: Tome decisões embasadas para melhorar configurações e processos
- **🏢 Governança Corporativa**: Monitore o uso entre equipes, acompanhe custos, garanta conformidade e integre-se à infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade padrão da indústria e independente de fornecedor —, o sistema de observabilidade do Qwen Code oferece:

- **Compatibilidade Universal**: Exporte para qualquer backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Utilize formatos e métodos de coleta consistentes em toda a sua toolchain
- **Integração Preparada para o Futuro**: Conecte-se a infraestruturas de observabilidade existentes e futuras
- **Sem Vendor Lock-in**: Alterne entre backends sem precisar modificar sua instrumentação

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuração

> [!note]
>
> **⚠️ Nota Especial: Este recurso requer alterações de código correspondentes. Esta documentação é fornecida antecipadamente; consulte as atualizações futuras do código para a funcionalidade real.**

Todo o comportamento da telemetria é controlado pelo arquivo `.qwen/settings.json`. Essas configurações podem ser substituídas por variáveis de ambiente ou flags da CLI.

| Configuração          | Variável de Ambiente                   | Flag da CLI                                              | Descrição                                          | Valores           | Padrão                  |
| --------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`             | `QWEN_TELEMETRY_ENABLED`               | `--telemetry` / `--no-telemetry`                         | Ativar ou desativar a telemetria                     | `true`/`false`    | `false`                 |
| `target`              | `QWEN_TELEMETRY_TARGET`                | `--telemetry-target <local\|gcp>`                        | Para onde enviar os dados de telemetria              | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`        | `QWEN_TELEMETRY_OTLP_ENDPOINT`         | `--telemetry-otlp-endpoint <URL>`                        | Endpoint do collector OTLP                           | URL string        | `http://localhost:4317` |
| `otlpProtocol`        | `QWEN_TELEMETRY_OTLP_PROTOCOL`         | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocolo de transporte OTLP                         | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`  | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`  | -                                                        | Substituição de endpoint por sinal para traces (somente HTTP) | URL string        | -                       |
| `otlpLogsEndpoint`    | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`    | -                                                        | Substituição de endpoint por sinal para logs (somente HTTP)   | URL string        | -                       |
| `otlpMetricsEndpoint` | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT` | -                                                        | Substituição de endpoint por sinal para métricas (somente HTTP) | URL string        | -                       |
| `outfile`             | `QWEN_TELEMETRY_OUTFILE`               | `--telemetry-outfile <path>`                             | Salvar telemetria em arquivo (substitui `otlpEndpoint`) | file path         | -                       |
| `logPrompts`          | `QWEN_TELEMETRY_LOG_PROMPTS`           | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Incluir prompts nos logs de telemetria               | `true`/`false`    | `true`                  |
| `useCollector`        | `QWEN_TELEMETRY_USE_COLLECTOR`         | -                                                        | Usar collector OTLP externo (avançado)               | `true`/`false`    | `false`                 |

**Nota sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`, `logPrompts`, `useCollector`), definir a variável de ambiente correspondente como `true` ou `1` ativará o recurso. Qualquer outro valor o desativará.

**Roteamento de sinal OTLP HTTP:** Ao usar o protocolo HTTP (`otlpProtocol: "http"`), o Qwen Code anexa automaticamente caminhos específicos por sinal (`/v1/traces`, `/v1/logs`, `/v1/metrics`) ao `otlpEndpoint` base. Por exemplo, `http://collector:4318` se torna `http://collector:4318/v1/traces` para traces. Se a URL já terminar com um caminho de sinal, ela será usada como está. As substituições de endpoint por sinal (`otlpTracesEndpoint`, etc.) têm precedência sobre o endpoint base e são usadas literalmente. O protocolo gRPC usa roteamento baseado em serviço e não anexa caminhos.

As variáveis de ambiente de endpoint por sinal também aceitam os nomes padrão do OpenTelemetry: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. As variantes `QWEN_TELEMETRY_OTLP_*` têm precedência sobre as variantes `OTEL_*`.

Para informações detalhadas sobre todas as opções de configuração, consulte o [Guia de Configuração](./cli/configuration.md).

## Telemetria Aliyun

### Exportação Manual OTLP

Para visualizar a telemetria do Qwen Code no Alibaba Cloud Managed Service for OpenTelemetry, configure o Qwen Code para exportar para o endpoint OTLP fornecido pelo ARMS.

Definir apenas `"target": "gcp"` não configura o destino de exportação. Se `otlpEndpoint` não estiver definido, o Qwen Code ainda usará o padrão `http://localhost:4317`. Se `outfile` estiver definido, ele substituirá `otlpEndpoint` e a telemetria será gravada no arquivo em vez de ser enviada para o Alibaba Cloud.

1. Ative a telemetria no seu `.qwen/settings.json` e defina o endpoint OTLP:

   **Opção A: Protocolo gRPC** (endpoint OTLP padrão):

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

   **Opção B: Protocolo HTTP com endpoints por sinal** (para backends que usam caminhos não padrão, por exemplo, `/api/otlp/traces` em vez de `/v1/traces`):

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

   > **Nota:** Ao usar o protocolo HTTP apenas com `otlpEndpoint` (sem substituições por sinal), o Qwen Code anexa os caminhos OTLP padrão (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à URL base. Se o seu backend usar caminhos diferentes, utilize as substituições de endpoint por sinal conforme mostrado na Opção B.

2. Se o seu endpoint do Alibaba Cloud exigir autenticação, forneça os headers OTLP por meio de variáveis de ambiente padrão do OpenTelemetry, como `OTEL_EXPORTER_OTLP_HEADERS` (ou as variantes específicas por sinal). Atualmente, o Qwen Code não expõe headers de autenticação OTLP diretamente no `.qwen/settings.json`.
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
     - **Novo console** (`trace.console.aliyun.com` ou internacional): navegue até `Integration Center`.
     - **Console legado** (`tracing.console.aliyun.com`): navegue até `Cluster Configurations` → `Access point information`.

## Telemetria Local

Para desenvolvimento e depuração locais, você pode capturar dados de telemetria localmente:

### Saída Baseada em Arquivo (Recomendado)

1. Ative a telemetria no seu `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. Execute o Qwen Code e envie prompts.
3. Visualize logs e métricas no arquivo especificado (por exemplo, `.qwen/telemetry.log`).

### Exportação Baseada em Collector (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso irá:
   - Baixar e iniciar o Jaeger e o collector OTEL
   - Configurar seu workspace para telemetria local
   - Disponibilizar a UI do Jaeger em http://localhost:16686
   - Salvar logs/métricas em `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Parar o collector ao sair (por exemplo, `Ctrl+C`)
2. Execute o Qwen Code e envie prompts.
3. Visualize traces em http://localhost:16686 e logs/métricas no arquivo de log do collector.

## Logs e Métricas

A seção a seguir descreve a estrutura dos logs e métricas gerados para o Qwen Code.

- Um `sessionId` é incluído como um atributo comum em todos os logs e métricas.

### Logs

Os logs são registros com carimbo de data/hora de eventos específicos. Os seguintes eventos são registrados para o Qwen Code:

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
    - `hooks` (string, tipos de eventos de hook separados por vírgula, omitido se hooks estiverem desativados)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" ou "json")

- `qwen-code.user_prompt`: Este evento ocorre quando um usuário envia um prompt.
  - **Atributos**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, este atributo é excluído se `log_prompts_enabled` estiver configurado como `false`)
    - `auth_type` (string)

- `qwen-code.tool_call`: Este evento ocorre para cada chamada de função.
  - **Atributos**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept" ou "modify", se aplicável)
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

- `qwen-code.api_request`: Este evento ocorre ao fazer uma requisição à API do Qwen.
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

- `qwen-code.api_response`: Este evento ocorre ao receber uma resposta da API do Qwen.
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

- `qwen-code.malformed_json_response`: Este evento ocorre quando uma resposta `generateJson` da API do Qwen não pode ser analisada como JSON.
  - **Atributos**:
    - `model`

- `qwen-code.flash_fallback`: Este evento ocorre quando o Qwen Code muda para o flash como fallback.
  - **Atributos**:
    - `auth_type`

- `qwen-code.slash_command`: Este evento ocorre quando um usuário executa um comando slash.
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

As métricas são medições numéricas de comportamento ao longo do tempo. As seguintes métricas são coletadas para o Qwen Code (os nomes das métricas permanecem `qwen-code.*` para compatibilidade):

- `qwen-code.session.count` (Counter, Int): Incrementado uma vez por inicialização da CLI.

- `qwen-code.tool.call.count` (Counter, Int): Conta chamadas de ferramentas.
  - **Atributos**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" ou "modify", se aplicável)
    - `tool_type` (string: "mcp" ou "native", se aplicável)

- `qwen-code.tool.call.latency` (Histogram, ms): Mede a latência de chamadas de ferramentas.
  - **Atributos**:
    - `function_name`
    - `decision` (string: "accept", "reject" ou "modify", se aplicável)

- `qwen-code.api.request.count` (Counter, Int): Conta todas as requisições à API.
  - **Atributos**:
    - `model`
    - `status_code`
    - `error_type` (se aplicável)

- `qwen-code.api.request.latency` (Histogram, ms): Mede a latência de requisições à API.
  - **Atributos**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Conta o número de tokens utilizados.
  - **Atributos**:
    - `model`
    - `type` (string: "input", "output", "thought" ou "cache")

- `qwen-code.file.operation.count` (Counter, Int): Conta operações de arquivo.
  - **Atributos**:
    - `operation` (string: "create", "read", "update"): O tipo de operação de arquivo.
    - `lines` (Int, se aplicável): Número de linhas no arquivo.
    - `mimetype` (string, se aplicável): Mimetype do arquivo.
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