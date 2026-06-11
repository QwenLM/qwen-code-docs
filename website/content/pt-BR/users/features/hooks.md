# Hooks do Qwen Code

## Visão Geral

Os hooks do Qwen Code fornecem um mecanismo poderoso para estender e personalizar o comportamento do aplicativo Qwen Code. Os hooks permitem que os usuários executem scripts ou programas personalizados em pontos específicos do ciclo de vida do aplicativo, como antes da execução de uma ferramenta, após a execução, no início/fim da sessão e durante outros eventos importantes.

Os hooks são ativados por padrão. Você pode desativar temporariamente todos os hooks definindo `disableAllHooks` como `true` no seu arquivo de configurações (no nível superior, ao lado de `hooks`):

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Isso desativa todos os hooks sem excluir suas configurações.

## O que são Hooks?

Hooks são scripts ou programas definidos pelo usuário que são executados automaticamente pelo Qwen Code em pontos predefinidos do fluxo do aplicativo. Eles permitem que os usuários:

- Monitorar e auditar o uso de ferramentas
- Aplicar políticas de segurança
- Injetar contexto adicional nas conversas
- Personalizar o comportamento do aplicativo com base em eventos
- Integrar com sistemas e serviços externos
- Modificar entradas ou respostas de ferramentas programaticamente

## Tipos de Hook

O Qwen Code suporta três tipos de executor de hook:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Executa um comando de shell. Recebe JSON via `stdin`, retorna resultados via `stdout`.              |
| `http`     | Envia JSON como corpo de uma requisição `POST` para uma URL especificada. Retorna resultados via corpo da resposta HTTP. |
| `function` | Chama diretamente uma função JavaScript registrada (apenas para hooks de nível de sessão).                     |

### Hooks de Comando

Hooks de comando executam comandos por meio de processos filhos. O JSON de entrada é passado via stdin e a saída é retornada via stdout.

**Configuração:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Tipo de hook                                   |
| `command`       | `string`                 | Yes      | Comando a ser executado                          |
| `name`          | `string`                 | No       | Nome do hook (para logs)                     |
| `description`   | `string`                 | No       | Descrição do hook                            |
| `timeout`       | `number`                 | No       | Timeout em milissegundos, padrão 60000      |
| `async`         | `boolean`                | No       | Se deve ser executado de forma assíncrona em segundo plano |
| `env`           | `Record<string, string>` | No       | Variáveis de ambiente                       |
| `shell`         | `"bash" \| "powershell"` | No       | Shell a ser usado                                |
| `statusMessage` | `string`                 | No       | Mensagem de status exibida durante a execução   |

**Exemplo:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Hooks HTTP

Hooks HTTP enviam a entrada do hook como requisições POST para URLs especificadas. Eles suportam listas de permissão de URL, proteção SSRF em nível de DNS, interpolação de variáveis de ambiente e outros recursos de segurança.

**Configuração:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Tipo de hook                                                 |
| `url`            | `string`                 | Yes      | URL de destino                                                |
| `headers`        | `Record<string, string>` | No       | Headers da requisição (suporta interpolação de variáveis de ambiente)          |
| `allowedEnvVars` | `string[]`               | No       | Lista de permissão de variáveis de ambiente permitidas na URL/headers |
| `timeout`        | `number`                 | No       | Timeout em segundos, padrão 600                           |
| `name`           | `string`                 | No       | Nome do hook (para logs)                                   |
| `statusMessage`  | `string`                 | No       | Mensagem de status exibida durante a execução                 |
| `once`           | `boolean`                | No       | Executar apenas uma vez por evento por sessão (apenas hooks HTTP) |

**Recursos de Segurança:**

- **Lista de Permissão de URL**: Configure padrões de URL permitidos via `allowedUrls`
- **Proteção SSRF**: Bloqueia IPs privados (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.) mas permite endereços de loopback (127.0.0.1, ::1)
- **Validação de DNS**: Valida a resolução de domínio antes das requisições para evitar ataques de DNS rebinding
- **Interpolação de Variáveis de Ambiente**: Sintaxe `${VAR}`, permite apenas variáveis na lista de permissão `allowedEnvVars`

**Exemplo:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

### Hooks de Função

Hooks de função chamam diretamente funções JavaScript/TypeScript registradas. Eles são usados internamente pelo sistema de Skills e atualmente não são expostos como uma API pública para usuários finais.

**Nota**: Para a maioria dos casos de uso, utilize **hooks de comando** ou **hooks HTTP**, que podem ser configurados em arquivos de settings.

## Eventos de Hook

Os hooks são disparados em pontos específicos durante uma sessão do Qwen Code. Diferentes eventos suportam diferentes matchers para filtrar as condições de disparo.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Antes da execução da ferramenta                     | Nome da ferramenta (`WriteFile`, `ReadFile`, `Bash`, etc.)         |
| `PostToolUse`        | Após a execução bem-sucedida da ferramenta           | Nome da ferramenta                                                 |
| `PostToolUseFailure` | Após falha na execução da ferramenta                | Nome da ferramenta                                                 |
| `UserPromptSubmit`   | Após o usuário enviar o prompt                 | Nenhum (sempre dispara)                                       |
| `SessionStart`       | Quando a sessão inicia ou é retomada            | Origem (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | Quando a sessão termina                         | Motivo (`clear`, `logout`, `prompt_input_exit`, etc.)     |
| `Stop`               | Quando o modelo se prepara para concluir a resposta | Nenhum (sempre dispara)                                       |
| `SubagentStart`      | Quando o subagente inicia                      | Tipo de agente (`Bash`, `Explorer`, `Plan`, etc.)             |
| `SubagentStop`       | Quando o subagente para                       | Tipo de agente                                                |
| `PreCompact`         | Antes da compactação da conversa            | Gatilho (`manual`, `auto`)                                |
| `Notification`       | Quando notificações são enviadas               | Tipo (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Quando o diálogo de permissão é exibido           | Nome da ferramenta                                                 |

### Padrões de Matcher

O `matcher` é uma expressão regular usada para filtrar as condições de disparo.

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Tool Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Nome da ferramenta: `WriteFile`, `ReadFile`, `Bash`, etc.         |
| Subagent Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | Tipo de agente: `Bash`, `Explorer`, etc.                     |
| Session Events      | `SessionStart`                                                         | ✅ Regex        | Origem: `startup`, `resume`, `clear`, `compact`          |
| Session Events      | `SessionEnd`                                                           | ✅ Regex        | Motivo: `clear`, `logout`, `prompt_input_exit`, etc.     |
| Notification Events | `Notification`                                                         | ✅ Exact match  | Tipo: `permission_prompt`, `idle_prompt`, `auth_success` |
| Compact Events      | `PreCompact`                                                           | ✅ Exact match  | Gatilho: `manual`, `auto`                                |
| Prompt Events       | `UserPromptSubmit`                                                     | ❌ No           | N/A                                                      |
| Stop Events         | `Stop`                                                                 | ❌ No           | N/A                                                      |

**Sintaxe do Matcher:**

- String vazia `""` ou `"*"` corresponde a todos os eventos desse tipo
- Sintaxe padrão de regex suportada (e.g., `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

**Exemplos:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## Regras de Entrada/Saída

### Estrutura de Entrada do Hook

Todos os hooks recebem entrada padronizada no formato JSON via stdin (comando) ou corpo POST (http).

**Campos Comuns:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Campos específicos do evento são adicionados com base no tipo de hook. Ao executar em um subagente, `agent_id` e `agent_type` são incluídos adicionalmente.

### Estrutura de Saída do Hook

A saída do hook é retornada via `stdout` (comando) ou corpo da resposta HTTP (http) como JSON.

**Comportamento do Exit Code (Hooks de Comando):**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Sucesso. Analise o JSON no `stdout` para controlar o comportamento.                                  |
| `2`       | **Erro bloqueante**. Ignora o `stdout`, passa o `stderr` como feedback de erro para o modelo. |
| Other     | Erro não bloqueante. `stderr` exibido apenas no modo debug, a execução continua.           |

**Estrutura de Saída:**

A saída do hook suporta três categorias de campos:

1. **Campos Comuns**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Decisão de Nível Superior**: `decision`, `reason` (usado por alguns eventos)
3. **Controle Específico do Evento**: `hookSpecificOutput` (deve incluir `hookEventName`)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### Detalhes de Eventos Individuais de Hook

#### PreToolUse

**Propósito**: Executado antes do uso de uma ferramenta para permitir verificações de permissão, validação de entrada ou injeção de contexto.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Opções de Saída**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" ou "ask" (OBRIGATÓRIO)
- `hookSpecificOutput.permissionDecisionReason`: explicação para a decisão (OBRIGATÓRIO)
- `hookSpecificOutput.updatedInput`: parâmetros de entrada da ferramenta modificados para usar no lugar do original
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Embora campos padrão de saída do hook como `decision` e `reason` sejam tecnicamente suportados pela classe subjacente, a interface oficial espera o `hookSpecificOutput` com `permissionDecision` e `permissionDecisionReason`.

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Propósito**: Executado após a conclusão bem-sucedida de uma ferramenta para processar resultados, registrar resultados ou injetar contexto adicional.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Opções de Saída**:

- `decision`: "allow", "deny", "block" (padrão "allow" se não especificado)
- `reason`: motivo da decisão
- `hookSpecificOutput.additionalContext`: informações adicionais a serem incluídas

**Exemplo de Saída**:

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**Propósito**: Executado quando a execução de uma ferramenta falha para lidar com erros, enviar alertas ou registrar falhas.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: informações de tratamento de erro
- Campos padrão de saída do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Propósito**: Executado quando o usuário envia um prompt para modificar, validar ou enriquecer a entrada.

**Campos específicos do evento**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para humanos sobre a decisão
- `hookSpecificOutput.additionalContext`: contexto adicional para anexar ao prompt (opcional)

**Nota**: Como `UserPromptSubmitOutput` estende `HookOutput`, todos os campos padrão estão disponíveis, mas apenas `additionalContext` em `hookSpecificOutput` é especificamente definido para este evento.

**Exemplo de Saída**:

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**Propósito**: Executado quando uma nova sessão inicia para realizar tarefas de inicialização.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto a ser disponibilizado na sessão
- Campos padrão de saída do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Propósito**: Executado quando uma sessão termina para realizar tarefas de limpeza.

**Campos específicos do evento**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Opções de Saída**:

- Campos padrão de saída do hook (geralmente não usados para bloqueio)

#### Stop

**Propósito**: Executado antes do Qwen Code concluir sua resposta para fornecer feedback final ou resumos.

**Campos específicos do evento**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para humanos sobre a decisão
- `stopReason`: feedback a ser incluído na resposta de stop
- `continue`: defina como false para parar a execução
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Como `StopOutput` estende `HookOutput`, todos os campos padrão estão disponíveis, mas o campo `stopReason` é particularmente relevante para este evento.

**Exemplo de Saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Propósito**: Executado quando a vez termina devido a um erro de API (em vez de Stop). Este é um evento **fire-and-forget** - a saída do hook e os exit codes são ignorados.

**Campos específicos do evento**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Corresponde ao campo `error`. Por exemplo, `"matcher": "rate_limit"` só será disparado para erros de rate limit.

**Opções de Saída**:

- **Nenhum** - StopFailure é fire-and-forget. Toda a saída do hook e exit codes são ignorados.

**Tratamento de Exit Code**:

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Any       | Ignorado (fire-and-forget) |

**Exemplo de Configuração**:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**Casos de Uso**:

- Monitoramento e alerta de rate limit
- Registro de falhas de autenticação
- Notificações de erro de cobrança
- Coleta de estatísticas de erro

#### SubagentStart

**Propósito**: Executado quando um subagente (como a ferramenta Task) é iniciado para configurar contexto ou permissões.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto inicial para o subagente
- Campos padrão de saída do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Propósito**: Executado quando um subagente termina para realizar tarefas de finalização.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para humanos sobre a decisão

**Exemplo de Saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Propósito**: Executado antes da compactação da conversa para preparar ou registrar a compactação.

**Campos específicos do evento**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto a ser incluído antes da compactação
- Campos padrão de saída do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Propósito**: Executado após a conclusão da compactação da conversa para arquivar resumos ou rastrear o uso.

**Campos específicos do evento**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Corresponde ao campo `trigger`. Por exemplo, `"matcher": "manual"` só será disparado para compactação manual via comando `/compact`.

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto adicional (apenas para logs)
- Campos padrão de saída do hook (apenas para logs)

**Nota**: PostCompact **não** está na lista oficial de eventos suportados pelo modo de decisão. O campo `decision` e outros campos de controle não produzem efeitos de controle - eles são usados apenas para fins de log.

**Tratamento de Exit Code**:

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Sucesso - stdout exibido ao usuário no modo verbose            |
| Other     | Erro não bloqueante - stderr exibido ao usuário no modo verbose |

**Exemplo de Configuração**:

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**Casos de Uso**:

- Arquivamento de resumos em arquivos ou bancos de dados
- Rastreamento de estatísticas de uso
- Monitoramento de mudanças de contexto
- Log de auditoria para operações de compactação

#### Notification

**Propósito**: Executado quando notificações são enviadas para personalizá-las ou interceptá-las.

**Campos específicos do evento**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Nota**: O tipo `elicitation_dialog` está definido, mas não está implementado atualmente.

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: informações adicionais a serem incluídas
- Campos padrão de saída do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Propósito**: Executado quando diálogos de permissão são exibidos para automatizar decisões ou atualizar permissões.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Opções de Saída**:

- `hookSpecificOutput.decision`: objeto estruturado com detalhes da decisão de permissão:
  - `behavior`: "allow" ou "deny"
  - `updatedInput`: entrada da ferramenta modificada (opcional)
  - `updatedPermissions`: permissões modificadas (opcional)
  - `message`: mensagem a ser exibida ao usuário (opcional)
  - `interrupt`: se deve interromper o fluxo de trabalho (opcional)

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

## Configuração de Hooks

Os hooks são configurados nas settings do Qwen Code, geralmente em `.qwen/settings.json` ou arquivos de configuração do usuário:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Execução de Hooks

### Execução Paralela vs Sequencial

- Por padrão, os hooks são executados em paralelo para melhor desempenho
- Use `sequential: true` na definição do hook para impor execução dependente de ordem
- Hooks sequenciais podem modificar a entrada para hooks subsequentes na cadeia

### Hooks Assíncronos

Apenas o tipo `command` suporta execução assíncrona. Definir `"async": true` executa o hook em segundo plano sem bloquear o fluxo principal.

**Recursos:**

- Não pode retornar controle de decisão (a operação já ocorreu)
- Os resultados são injetados na próxima vez da conversa via `systemMessage` ou `additionalContext`
- Adequado para auditoria, logging, testes em segundo plano, etc.

**Exemplo:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### Modelo de Segurança

- Os hooks são executados no ambiente do usuário com privilégios de usuário
- Hooks em nível de projeto exigem status de pasta confiável
- Timeouts previnem hooks travados (padrão: 60 segundos)

## Boas Práticas

### Exemplo 1: Hook de Validação de Segurança

Um hook PreToolUse que registra e potencialmente bloqueia comandos perigosos:

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

Configure em `.qwen/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Exemplo 2: Hook de Auditoria HTTP

Um hook HTTP PostToolUse que envia todos os registros de execução de ferramentas para um serviço de auditoria remoto:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### Exemplo 3: Hook de Validação de Prompt do Usuário

Um hook UserPromptSubmit que valida prompts do usuário em busca de informações sensíveis e fornece contexto para prompts longos:

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```

## Solução de Problemas

- Verifique os logs do aplicativo para detalhes da execução do hook
- Verifique as permissões e a capacidade de execução do script do hook
- Garanta a formatação JSON adequada nas saídas do hook
- Use padrões de matcher específicos para evitar a execução não intencional do hook
- Use o modo `--debug` para ver informações detalhadas de correspondência e execução do hook
- Desative temporariamente todos os hooks: adicione `"disableAllHooks": true` nas settings