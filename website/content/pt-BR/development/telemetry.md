# Observabilidade com OpenTelemetry

Aprenda como habilitar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observabilidade-com-opentelemetry)
  - [Principais Benefícios](#principais-benefícios)
  - [Integração com OpenTelemetry](#integração-com-opentelemetry)
  - [Configuração](#configuração)
  - [Telemetria no Google Cloud](#telemetria-no-google-cloud)
    - [Pré-requisitos](#pré-requisitos)
    - [Exportação Direta (Recomendado)](#exportação-direta-recomendado)
    - [Exportação via Coletor (Avançado)](#exportação-via-coletor-avançado)
  - [Telemetria Local](#telemetria-local)
    - [Saída para Arquivo (Recomendado)](#saída-para-arquivo-recomendado)
    - [Exportação via Coletor (Avançado)](#exportação-via-coletor-avançado-1)
  - [Logs e Métricas](#logs-e-métricas)
    - [Logs](#logs)
    - [Métricas](#métricas)

## Benefícios Principais

- **🔍 Analytics de Uso**: Entenda os padrões de interação e adoção de features
  na sua equipe
- **⚡ Monitoramento de Performance**: Acompanhe tempos de resposta, consumo de tokens e
  utilização de recursos
- **🐛 Debugging em Tempo Real**: Identifique gargalos, falhas e padrões de erro
  conforme eles ocorrem
- **📊 Otimização de Workflows**: Tome decisões embasadas para melhorar
  configurações e processos
- **🏢 Governança Empresarial**: Monitore o uso entre equipes, acompanhe custos, garanta
  compliance e integre com infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade neutro e padrão da indústria — o sistema de observabilidade do Qwen Code oferece:

- **Compatibilidade Universal**: Exporte para qualquer backend OpenTelemetry (Google Cloud, Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Utilize formatos e métodos de coleta consistentes em toda a sua toolchain
- **Integração à Prova de Futuro**: Conecte-se com infraestrutura de observabilidade existente e futura
- **Sem Vendor Lock-in**: Alterne entre backends sem precisar modificar sua instrumentação

[OpenTelemetry]: https://opentelemetry.io/

## Configuração

Todo o comportamento da telemetria é controlado através do seu arquivo `.qwen/settings.json`.  
Essas configurações podem ser sobrescritas por variáveis de ambiente ou flags da CLI.

| Configuração   | Variável de Ambiente             | Flag da CLI                                              | Descrição                                         | Valores           | Padrão                  |
| -------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Ativa ou desativa a telemetria                    | `true`/`false`    | `false`                 |
| `target`       | `GEMINI_TELEMETRY_TARGET`        | `--telemetry-target <local\|gcp>`                        | Define onde enviar os dados de telemetria         | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Endpoint do coletor OTLP                          | URL string        | `http://localhost:4317` |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocolo de transporte OTLP                      | `"grpc"`/`"http"` | `"grpc"`                |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Salva a telemetria em um arquivo (sobrepõe `otlpEndpoint`) | caminho do arquivo | -                       |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclui prompts nos logs de telemetria             | `true`/`false`    | `true`                  |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR` | -                                                        | Usa um coletor OTLP externo (avançado)            | `true`/`false`    | `false`                 |

**Nota sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`,  
`logPrompts`, `useCollector`), definir a variável de ambiente correspondente como  
`true` ou `1` irá ativar o recurso. Qualquer outro valor irá desativá-lo.

Para informações detalhadas sobre todas as opções de configuração, consulte o  
[Guia de Configuração](./cli/configuration.md).

## Telemetria do Google Cloud

### Pré-requisitos

Antes de usar qualquer um dos métodos abaixo, conclua estas etapas:

1. Defina o ID do seu projeto no Google Cloud:
   - Para telemetria em um projeto separado da inferência:
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - Para telemetria no mesmo projeto da inferência:
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. Autentique-se no Google Cloud:
   - Se estiver usando uma conta de usuário:
     ```bash
     gcloud auth application-default login
     ```
   - Se estiver usando uma service account:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. Certifique-se de que sua conta ou service account possui essas roles do IAM:
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. Habilite as APIs necessárias do Google Cloud (se ainda não estiverem habilitadas):
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### Exportação Direta (Recomendado)

Envia telemetria diretamente para os serviços do Google Cloud. Nenhum coletor é necessário.

1. Habilite a telemetria no seu `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. Execute o Qwen Code e envie prompts.
3. Visualize logs e métricas:
   - Abra o Google Cloud Console no seu navegador após enviar prompts:
     - Logs: https://console.cloud.google.com/logs/
     - Métricas: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list

### Exportação Baseada em Coletor (Avançado)

Para processamento personalizado, filtragem ou roteamento, utilize um coletor do OpenTelemetry para encaminhar os dados ao Google Cloud.

1. Configure seu arquivo `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=gcp
   ```
   Isso vai:
   - Iniciar um coletor OTEL local que encaminha os dados para o Google Cloud
   - Configurar seu workspace
   - Fornecer links para visualizar traces, métricas e logs no Google Cloud Console
   - Salvar os logs do coletor em `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`
   - Parar o coletor ao sair (ex.: `Ctrl+C`)
3. Execute o Qwen Code e envie prompts.
4. Visualize logs e métricas:
   - Abra o Google Cloud Console no navegador após enviar os prompts:
     - Logs: https://console.cloud.google.com/logs/
     - Métricas: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list
   - Abra o arquivo `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` para ver os logs locais do coletor.

## Telemetria Local

Para desenvolvimento e debugging local, você pode capturar os dados de telemetria localmente:

### Saída para Arquivo (Recomendado)

1. Habilite a telemetria no seu `.qwen/settings.json`:
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
3. Veja os logs e métricas no arquivo especificado (ex.: `.qwen/telemetry.log`).

### Exportação Baseada em Coletor (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso vai:
   - Baixar e iniciar o Jaeger e o coletor OTEL
   - Configurar seu workspace para telemetria local
   - Fornecer uma interface do Jaeger em http://localhost:16686
   - Salvar logs/métricas em `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Parar o coletor ao sair (ex: `Ctrl+C`)
2. Execute o Qwen Code e envie prompts.
3. Veja os traces em http://localhost:16686 e os logs/métricas no arquivo de log do coletor.

## Logs e Métricas

A seção a seguir descreve a estrutura dos logs e métricas gerados para o Qwen Code.

- Um `sessionId` é incluído como atributo comum em todos os logs e métricas.

### Logs

Logs são registros com timestamp de eventos específicos. Os seguintes eventos são registrados para o Qwen Code:

- `qwen-code.config`: Este evento ocorre uma vez na inicialização com a configuração da CLI.
  - **Atributos**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
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
    - `decision` (string: "accept", "reject", "auto_accept", ou "modify", se aplicável)
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
    - `diff_stat` (json string, se aplicável): Uma string JSON com os seguintes membros:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Este evento ocorre ao fazer uma requisição para a API do Qwen.
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
    - `tool_token_count`
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

- `qwen-code.malformed_json_response`: Este evento ocorre quando uma resposta `generateJson` da API do Qwen não pode ser parseada como JSON.
  - **Atributos**:
    - `model`

- `qwen-code.flash_fallback`: Este evento ocorre quando o Qwen Code alterna para o modo flash como fallback.
  - **Atributos**:
    - `auth_type`

- `qwen-code.slash_command`: Este evento ocorre quando um usuário executa um comando slash.
  - **Atributos**:
    - `command` (string)
    - `subcommand` (string, se aplicável)

- `qwen-code.extension_enable`: Este evento ocorre quando uma extensão é habilitada
- `qwen-code.extension_install`: Este evento ocorre quando uma extensão é instalada
  - **Atributos**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Este evento ocorre quando uma extensão é desinstalada

### Métricas

Métricas são medições numéricas do comportamento ao longo do tempo. As seguintes métricas são coletadas para o Qwen Code (os nomes das métricas permanecem `qwen-code.*` por compatibilidade):

- `qwen-code.session.count` (Contador, Int): Incrementado uma vez a cada inicialização da CLI.

- `qwen-code.tool.call.count` (Contador, Int): Conta as chamadas de ferramentas.
  - **Atributos**:
    - `function_name`
    - `success` (booleano)
    - `decision` (string: "accept", "reject" ou "modify", se aplicável)
    - `tool_type` (string: "mcp" ou "native", se aplicável)

- `qwen-code.tool.call.latency` (Histograma, ms): Mede a latência das chamadas de ferramentas.
  - **Atributos**:
    - `function_name`
    - `decision` (string: "accept", "reject" ou "modify", se aplicável)

- `qwen-code.api.request.count` (Contador, Int): Conta todas as requisições à API.
  - **Atributos**:
    - `model`
    - `status_code`
    - `error_type` (se aplicável)

- `qwen-code.api.request.latency` (Histograma, ms): Mede a latência das requisições à API.
  - **Atributos**:
    - `model`

- `qwen-code.token.usage` (Contador, Int): Conta o número de tokens utilizados.
  - **Atributos**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache" ou "tool")

- `qwen-code.file.operation.count` (Contador, Int): Conta operações em arquivos.
  - **Atributos**:
    - `operation` (string: "create", "read", "update"): O tipo de operação no arquivo.
    - `lines` (Int, se aplicável): Número de linhas no arquivo.
    - `mimetype` (string, se aplicável): Tipo MIME do arquivo.
    - `extension` (string, se aplicável): Extensão do arquivo.
    - `model_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo modelo.
    - `model_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo modelo.
    - `user_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo usuário nas mudanças propostas pela IA.
    - `user_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo usuário nas mudanças propostas pela IA.
    - `programming_language` (string, se aplicável): A linguagem de programação do arquivo.

- `qwen-code.chat_compression` (Contador, Int): Conta operações de compressão do chat.
  - **Atributos**:
    - `tokens_before` (Int): Número de tokens no contexto antes da compressão.
    - `tokens_after` (Int): Número de tokens no contexto após a compressão.