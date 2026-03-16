# Observabilidade com OpenTelemetry

Aprenda como habilitar e configurar o OpenTelemetry para o Qwen Code.

- [Observabilidade com OpenTelemetry](#observabilidade-com-opentelemetry)
  - [Principais Benefícios](#principais-beneficios)
  - [Integração com OpenTelemetry](#integracao-com-opentelemetry)
  - [Configuração](#configuracao)
  - [Telemetria Aliyun](#telemetria-aliyun)
    - [Pré-requisitos](#pre-requisitos)
    - [Exportação Direta (Recomendado)](#exportacao-direta-recomendado)
  - [Telemetria Local](#telemetria-local)
    - [Saída Baseada em Arquivo (Recomendado)](#saida-baseada-em-arquivo-recomendado)
    - [Exportação Baseada em Collector (Avançado)](#exportacao-baseada-em-collector-avancado)
  - [Logs e Métricas](#logs-e-metricas)
    - [Logs](#logs)
    - [Métricas](#metricas)

## Principais Benefícios

- **🔍 Análise de Uso**: Entenda os padrões de interação e a adoção de recursos por toda a sua equipe  
- **⚡ Monitoramento de Desempenho**: Acompanhe tempos de resposta, consumo de tokens e utilização de recursos  
- **🐛 Depuração em Tempo Real**: Identifique gargalos, falhas e padrões de erro à medida que ocorrem  
- **📊 Otimização de Fluxos de Trabalho**: Tome decisões embasadas para melhorar configurações e processos  
- **🏢 Governança Corporativa**: Monitore o uso entre equipes, acompanhe custos, garanta conformidade e integre-se à infraestrutura de monitoramento existente

## Integração com OpenTelemetry

Construído sobre o **[OpenTelemetry]** — o framework de observabilidade padrão da indústria e independente de fornecedores — o sistema de observabilidade do Qwen Code oferece:

- **Compatibilidade Universal**: Exporte para qualquer backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Dados Padronizados**: Use formatos e métodos de coleta consistentes em toda a sua cadeia de ferramentas
- **Integração Preparada para o Futuro**: Conecte-se à infraestrutura de observabilidade existente e futura
- **Sem Dependência de Fornecedor**: Alterne entre backends sem modificar sua instrumentação

[OpenTelemetry]: https://opentelemetry.io/

## Configuração

> [!note]
>
> **⚠️ Aviso especial: Este recurso exige alterações correspondentes no código. Esta documentação é fornecida antecipadamente; consulte futuras atualizações de código para a funcionalidade real.**

Todo o comportamento de telemetria é controlado pelo seu arquivo `.qwen/settings.json`.  
Essas configurações podem ser substituídas por variáveis de ambiente ou flags da CLI.

| Configuração     | Variável de Ambiente                | Flag da CLI                                                    | Descrição                                                  | Valores              | Padrão                  |
| ---------------- | ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- | ----------------------- |
| `enabled`        | `QWEN_TELEMETRY_ENABLED`            | `--telemetry` / `--no-telemetry`                                | Habilita ou desabilita a telemetria                          | `true`/`false`       | `false`                 |
| `target`         | `QWEN_TELEMETRY_TARGET`             | `--telemetry-target <local\|qwen>`                             | Local para onde os dados de telemetria serão enviados       | `"qwen"`/`"local"`   | `"local"`               |
| `otlpEndpoint`   | `QWEN_TELEMETRY_OTLP_ENDPOINT`      | `--telemetry-otlp-endpoint <URL>`                               | Endpoint do coletor OTLP                                     | String URL           | `http://localhost:4317` |
| `otlpProtocol`   | `QWEN_TELEMETRY_OTLP_PROTOCOL`      | `--telemetry-otlp-protocol <grpc\|http>`                       | Protocolo de transporte OTLP                                 | `"grpc"`/`"http"`    | `"grpc"`                |
| `outfile`        | `QWEN_TELEMETRY_OUTFILE`            | `--telemetry-outfile <caminho>`                                | Salva a telemetria em um arquivo (substitui `otlpEndpoint`)  | Caminho do arquivo   | -                       |
| `logPrompts`     | `QWEN_TELEMETRY_LOG_PROMPTS`        | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`       | Inclui *prompts* nos logs de telemetria                      | `true`/`false`       | `true`                  |
| `useCollector`   | `QWEN_TELEMETRY_USE_COLLECTOR`      | —                                                              | Usa um coletor OTLP externo (avançado)                       | `true`/`false`       | `false`                 |

**Observação sobre variáveis de ambiente booleanas:** Para as configurações booleanas (`enabled`, `logPrompts`, `useCollector`), definir a variável de ambiente correspondente como `true` ou `1` habilita o recurso. Qualquer outro valor o desabilita.

Para obter informações detalhadas sobre todas as opções de configuração, consulte o [Guia de Configuração](./cli/configuration.md).

## Telemetria Aliyun

### Exportação Direta (Recomendada)

Envia telemetria diretamente para os serviços da Aliyun. Nenhum coletor é necessário.

1. Habilite a telemetria no seu arquivo `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Execute o Qwen Code e envie prompts.
3. Visualize os logs e métricas no Console da Aliyun.

## Telemetria Local

Para desenvolvimento local e depuração, você pode capturar dados de telemetria localmente:

### Saída Baseada em Arquivo (Recomendada)

1. Habilite a telemetria no seu arquivo `.qwen/settings.json`:
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
3. Visualize os logs e métricas no arquivo especificado (por exemplo, `.qwen/telemetry.log`).

### Exportação Baseada em Coletor (Avançado)

1. Execute o script de automação:
   ```bash
   npm run telemetry -- --target=local
   ```
   Isso fará o seguinte:
   - Baixará e iniciará o Jaeger e o coletor OTEL
   - Configurará seu workspace para telemetria local
   - Disponibilizará uma interface web do Jaeger em http://localhost:16686
   - Salvará logs e métricas em `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Interromperá o coletor ao sair (por exemplo, pressionando `Ctrl+C`)
2. Execute o Qwen Code e envie prompts.
3. Visualize as traces em http://localhost:16686 e os logs/métricas no arquivo de log do coletor.

## Logs e Métricas

A seção a seguir descreve a estrutura dos logs e métricas gerados pelo Qwen Code.

- Um `sessionId` é incluído como um atributo comum em todos os logs e métricas.

### Logs

Logs são registros com carimbo de data/hora de eventos específicos. Os seguintes eventos são registrados pelo Qwen Code:

- `qwen-code.config`: Esse evento ocorre uma única vez na inicialização, com a configuração da CLI.
  - **Atributos**:
    - `model` (string)
    - `sandbox_enabled` (booleano)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (booleano)
    - `debug_mode` (booleano)
    - `truncate_tool_output_threshold` (número)
    - `truncate_tool_output_lines` (número)
    - `hooks` (string, tipos de eventos de *hook* separados por vírgula; omitido se os *hooks* estiverem desabilitados)
    - `ide_enabled` (booleano)
    - `interactive_shell_enabled` (booleano)
    - `mcp_servers` (string)
    - `output_format` (string: `"text"` ou `"json"`)

- `qwen-code.user_prompt`: Esse evento ocorre quando um usuário envia um *prompt*.
  - **Atributos**:
    - `prompt_length` (inteiro)
    - `prompt_id` (string)
    - `prompt` (string; esse atributo é excluído se `log_prompts_enabled` estiver configurado como `false`)
    - `auth_type` (string)

- `qwen-code.tool_call`: Esse evento ocorre para cada chamada de função.
  - **Atributos**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (booleano)
    - `decision` (string: `"accept"`, `"reject"`, `"auto_accept"` ou `"modify"`, se aplicável)
    - `error` (se aplicável)
    - `error_type` (se aplicável)
    - `content_length` (inteiro, se aplicável)
    - `metadata` (se aplicável, dicionário de string → qualquer tipo)

- `qwen-code.file_operation`: Esse evento ocorre para cada operação em arquivo.
  - **Atributos**:
    - `tool_name` (string)
    - `operation` (string: `"create"`, `"read"` ou `"update"`)
    - `lines` (inteiro, se aplicável)
    - `mimetype` (string, se aplicável)
    - `extension` (string, se aplicável)
    - `programming_language` (string, se aplicável)
    - `diff_stat` (string JSON, se aplicável): Uma string JSON com os seguintes membros:
      - `ai_added_lines` (inteiro)
      - `ai_removed_lines` (inteiro)
      - `user_added_lines` (inteiro)
      - `user_removed_lines` (inteiro)

- `qwen-code.api_request`: Esse evento ocorre ao fazer uma requisição à API do Qwen.
  - **Atributos**:
    - `model`
    - `request_text` (se aplicável)

- `qwen-code.api_error`: Esse evento ocorre se a requisição à API falhar.
  - **Atributos**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Esse evento ocorre ao receber uma resposta da API do Qwen.
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

- `qwen-code.tool_output_truncated`: Esse evento ocorre quando a saída de uma chamada de ferramenta é muito grande e é truncada.
  - **Atributos**:
    - `tool_name` (string)
    - `original_content_length` (inteiro)
    - `truncated_content_length` (inteiro)
    - `threshold` (inteiro)
    - `lines` (inteiro)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Esse evento ocorre quando uma resposta `generateJson` da API do Qwen não puder ser analisada como JSON.
  - **Atributos**:
    - `model`

- `qwen-code.flash_fallback`: Esse evento ocorre quando o Qwen Code muda para o *Flash* como alternativa de contingência.
  - **Atributos**:
    - `auth_type`

- `qwen-code.slash_command`: Esse evento ocorre quando um usuário executa um comando com barra (`/`).
  - **Atributos**:
    - `command` (string)
    - `subcommand` (string, se aplicável)

- `qwen-code.extension_enable`: Esse evento ocorre quando uma extensão é habilitada.
- `qwen-code.extension_install`: Esse evento ocorre quando uma extensão é instalada.
  - **Atributos**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Esse evento ocorre quando uma extensão é desinstalada.

### Métricas

Métricas são medições numéricas do comportamento ao longo do tempo. As seguintes métricas são coletadas para o Qwen Code (os nomes das métricas permanecem como `qwen-code.*` para garantir compatibilidade):

- `qwen-code.session.count` (Contador, Int): Incrementado uma vez por inicialização da CLI.

- `qwen-code.tool.call.count` (Contador, Int): Conta as chamadas de ferramentas.  
  - **Atributos**:  
    - `function_name`  
    - `success` (booleano)  
    - `decision` (string: `"accept"`, `"reject"` ou `"modify"`, se aplicável)  
    - `tool_type` (string: `"mcp"` ou `"native"`, se aplicável)  

- `qwen-code.tool.call.latency` (Histograma, ms): Mede a latência das chamadas de ferramentas.  
  - **Atributos**:  
    - `function_name`  
    - `decision` (string: `"accept"`, `"reject"` ou `"modify"`, se aplicável)  

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
    - `type` (string: `"input"`, `"output"`, `"thought"`, `"cache"` ou `"tool"`)  

- `qwen-code.file.operation.count` (Contador, Int): Conta operações em arquivos.  
  - **Atributos**:  
    - `operation` (string: `"create"`, `"read"` ou `"update"`): Tipo da operação em arquivo.  
    - `lines` (Int, se aplicável): Número de linhas no arquivo.  
    - `mimetype` (string, se aplicável): Tipo MIME do arquivo.  
    - `extension` (string, se aplicável): Extensão do arquivo.  
    - `model_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo modelo.  
    - `model_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo modelo.  
    - `user_added_lines` (Int, se aplicável): Número de linhas adicionadas/alteradas pelo usuário nas alterações propostas pela IA.  
    - `user_removed_lines` (Int, se aplicável): Número de linhas removidas/alteradas pelo usuário nas alterações propostas pela IA.  
    - `programming_language` (string, se aplicável): Linguagem de programação do arquivo.  

- `qwen-code.chat_compression` (Contador, Int): Conta operações de compressão de conversa.  
  - **Atributos**:  
    - `tokens_before`: (Int): Número de tokens no contexto antes da compressão.  
    - `tokens_after`: (Int): Número de tokens no contexto após a compressão.