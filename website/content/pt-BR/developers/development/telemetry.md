# Observabilidade com OpenTelemetry

Aprenda como habilitar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observabilidade-com-opentelemetry)
  - [Benefícios Principais](#benefícios-principais)
  - [Integração com OpenTelemetry](#integração-com-opentelemetry)
  - [Configuração](#configuração)
  - [Telemetria Aliyun](#telemetria-aliyun)
    - [Pré-requisitos](#pré-requisitos)
    - [Exportação Direta (Recomendado)](#exportação-direta-recomendado)
  - [Telemetria Local](#telemetria-local)
    - [Saída Baseada em Arquivo (Recomendado)](#saída-baseada-em-arquivo-recomendado)
    - [Exportação Baseada em Coletor (Avançado)](#exportação-baseada-em-coletor-avançado)
  - [Logs e Métricas](#logs-e-métricas)
    - [Logs](#logs)
    - [Métricas](#métricas)

## Principais Benefícios

- **🔍 Análise de Uso**: Compreenda padrões de interação e adoção de recursos
  em sua equipe
- **⚡ Monitoramento de Desempenho**: Acompanhe tempos de resposta, consumo de tokens e
  utilização de recursos
- **🐛 Depuração em Tempo Real**: Identifique gargalos, falhas e padrões de erro
  conforme eles ocorrem
- **📊 Otimização de Fluxos de Trabalho**: Tome decisões informadas para melhorar
  configurações e processos
- **🏢 Governança Empresarial**: Monitore o uso entre equipes, acompanhe custos, garanta
  conformidade e integre-se com infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade neutro e padrão da indústria — o sistema de observabilidade do Qwen Code oferece:

- **Compatibilidade Universal**: Exporte para qualquer backend compatível com OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Utilize formatos e métodos de coleta consistentes em toda a sua cadeia de ferramentas
- **Integração à Prova de Futuro**: Conecte-se com infraestrutura de observabilidade existente e futura
- **Sem Bloqueio de Fornecedor**: Alterne entre backends sem modificar sua instrumentação

[OpenTelemetry]: https://opentelemetry.io/

## Configuração

> [!note]
>
> **⚠️ Nota Especial: Este recurso requer alterações correspondentes no código. Esta documentação é fornecida antecipadamente; consulte futuras atualizações de código para funcionalidade real.**

Todo o comportamento da telemetria é controlado através do seu arquivo `.qwen/settings.json`.
Essas configurações podem ser substituídas por variáveis de ambiente ou flags da CLI.

| Configuração   | Variável de Ambiente           | Flag da CLI                                              | Descrição                                         | Valores            | Padrão                  |
| -------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Ativa ou desativa a telemetria                    | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | Para onde enviar os dados de telemetria           | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Endpoint do coletor OTLP                          | string de URL      | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocolo de transporte OTLP                      | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Salva a telemetria em um arquivo (substitui `otlpEndpoint`) | caminho do arquivo     | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclui prompts nos logs de telemetria             | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | Usa coletor OTLP externo (avançado)               | `true`/`false`     | `false`                 |

**Nota sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`,
`logPrompts`, `useCollector`), definir a variável de ambiente correspondente como
`true` ou `1` ativará o recurso. Qualquer outro valor irá desativá-lo.

Para informações detalhadas sobre todas as opções de configuração, consulte o
[Guia de Configuração](./cli/configuration.md).

## Telemetria do Aliyun

### Exportação Direta (Recomendado)

Envia telemetria diretamente para os serviços da Aliyun. Nenhum coletor é necessário.

1. Habilite a telemetria no seu `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Execute o Qwen Code e envie prompts.
3. Visualize logs e métricas no Console da Aliyun.

## Telemetria Local

Para desenvolvimento local e depuração, você pode capturar dados de telemetria localmente:

### Saída Baseada em Arquivo (Recomendado)

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
3. Visualize logs e métricas no arquivo especificado (por exemplo, `.qwen/telemetry.log`).

### Exportação Baseada em Coletor (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso irá:
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

Logs são registros com data e hora de eventos específicos. Os seguintes eventos são registrados para o Qwen Code:

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
    - `diff_stat` (string json, se aplicável): Uma string JSON com os seguintes membros:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Este evento ocorre ao fazer uma solicitação à API do Qwen.
  - **Atributos**:
    - `model`
    - `request_text` (se aplicável)

- `qwen-code.api_error`: Este evento ocorre se a solicitação à API falhar.
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

- `qwen-code.malformed_json_response`: Este evento ocorre quando uma resposta `generateJson` da API do Qwen não pode ser analisada como json.
  - **Atributos**:
    - `model`

- `qwen-code.flash_fallback`: Este evento ocorre quando o Qwen Code alterna para flash como fallback.
  - **Atributos**:
    - `auth_type`

- `qwen-code.slash_command`: Este evento ocorre quando um usuário executa um comando com barra (/).
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

Métricas são medições numéricas do comportamento ao longo do tempo. As seguintes métricas são coletadas para o Qwen Code (os nomes das métricas permanecem `qwen-code.*` por compatibilidade):

- `qwen-code.session.count` (Contador, Int): Incrementado uma vez por inicialização da CLI.

- `qwen-code.tool.call.count` (Contador, Int): Conta chamadas de ferramentas.
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
    - `user_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo usuário nas alterações propostas pela IA.
    - `user_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo usuário nas alterações propostas pela IA.
    - `programming_language` (string, se aplicável): A linguagem de programação do arquivo.

- `qwen-code.chat_compression` (Contador, Int): Conta operações de compressão de conversas.
  - **Atributos**:
    - `tokens_before`: (Int): Número de tokens no contexto antes da compressão.
    - `tokens_after`: (Int): Número de tokens no contexto após a compressão.