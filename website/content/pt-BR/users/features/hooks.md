# Qwen Code Hooks

## Overview

Os hooks do Qwen Code fornecem um mecanismo poderoso para estender e personalizar o comportamento do aplicativo Qwen Code. Os hooks permitem que os usuários executem scripts ou programas personalizados em pontos específicos do ciclo de vida do aplicativo, como antes da execução de uma ferramenta, após a execução, no início/fim da sessão e durante outros eventos chave.

Os hooks são habilitados por padrão. Você pode desabilitar temporariamente todos os hooks definindo `disableAllHooks` como `true` no seu arquivo de configurações (no nível superior, junto com `hooks`):

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Isso desabilita todos os hooks sem excluir suas configurações.

## O que são Hooks?

Hooks são scripts ou programas definidos pelo usuário que são executados automaticamente pelo Qwen Code em pontos predefinidos do fluxo do aplicativo. Eles permitem que os usuários:

- Monitorem e auditem o uso de ferramentas
- Apliquem políticas de segurança
- Injetem contexto adicional nas conversas
- Personalizem o comportamento do aplicativo com base em eventos
- Integrem-se com sistemas e serviços externos
- Modifiquem entradas ou respostas de ferramentas programaticamente

## Tipos de Hooks

O Qwen Code suporta quatro tipos de executores de hooks:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Executa um comando de shell. Recebe JSON via `stdin`, retorna resultados via `stdout`.              |
| `http`     | Envia JSON como corpo de uma requisição `POST` para uma URL especificada. Retorna resultados via corpo da resposta HTTP. |
| `function` | Chama diretamente uma função JavaScript registrada (apenas hooks de nível de sessão).                     |
| `prompt`   | Usa um LLM para avaliar a entrada do hook e retornar uma decisão.                                       |

### Command Hooks

Command hooks executam comandos via processos filhos. O JSON de entrada é passado via stdin, e a saída é retornada via stdout.

**Configuração:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Tipo do hook                                   |
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

### HTTP Hooks

HTTP hooks enviam a entrada do hook como requisições POST para URLs especificadas. Eles suportam whitelists de URL, proteção contra SSRF no nível de DNS, interpolação de variáveis de ambiente e outros recursos de segurança.

**Configuração:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Tipo do hook                                                 |
| `url`            | `string`                 | Yes      | URL de destino                                                |
| `headers`        | `Record<string, string>` | No       | Cabeçalhos da requisição (suporta interpolação de variáveis de ambiente)          |
| `allowedEnvVars` | `string[]`               | No       | Whitelist de variáveis de ambiente permitidas na URL/cabeçalhos |
| `timeout`        | `number`                 | No       | Timeout em segundos, padrão 600                           |
| `name`           | `string`                 | No       | Nome do hook (para logs)                                   |
| `statusMessage`  | `string`                 | No       | Mensagem de status exibida durante a execução                 |
| `once`           | `boolean`                | No       | Executar apenas uma vez por evento por sessão (apenas HTTP hooks) |

**Recursos de Segurança:**

- **Whitelist de URL**: Configure os padrões de URL permitidos via `allowedUrls`
- **Proteção contra SSRF**: Bloqueia IPs privados (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.), mas permite endereços de loopback (127.0.0.1, ::1)
- **Validação de DNS**: Valida a resolução de domínio antes das requisições para evitar ataques de DNS rebinding
- **Interpolação de Variáveis de Ambiente**: Sintaxe `${VAR}`, permite apenas variáveis na whitelist `allowedEnvVars`

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

### Function Hooks

Function hooks chamam diretamente funções JavaScript/TypeScript registradas. Eles são usados internamente pelo sistema de Skills e atualmente não são expostos como uma API pública para usuários finais.

**Nota**: Para a maioria dos casos de uso, use **command hooks** ou **HTTP hooks**, que podem ser configurados em arquivos de configurações.

### Prompt Hooks

Prompt hooks usam um LLM para avaliar a entrada do hook e retornar uma decisão. Isso é útil para tomar decisões inteligentes com base no contexto, como determinar se uma operação deve ser permitida ou bloqueada.

**Como funciona:**

1. O JSON de entrada do hook é injetado no seu prompt usando o placeholder `$ARGUMENTS`
2. O prompt é enviado para um LLM (padrão: seu modelo atual)
3. O LLM retorna uma resposta JSON com a decisão
4. O Qwen Code processa a decisão e continua ou bloqueia a execução de acordo

**Configuração:**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | Tipo do hook                                           |
| `prompt`        | `string`   | Yes      | Prompt enviado para o LLM. Use `$ARGUMENTS` para a entrada do hook |
| `model`         | `string`   | No       | Modelo a ser usado (padrão: seu modelo atual)       |
| `timeout`       | `number`   | No       | Timeout em segundos, padrão 30                      |
| `name`          | `string`   | No       | Nome do hook (para logs)                             |
| `description`   | `string`   | No       | Descrição do hook                                    |
| `statusMessage` | `string`   | No       | Mensagem de status exibida durante a execução           |

**Formato da Resposta:**

O LLM deve retornar um JSON com a seguinte estrutura:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Field               | Description                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` para permitir/continuar, `false` para bloquear/parar                            |
| `reason`            | Obrigatório quando `ok` é `false`. Exibido para o modelo para explicar o bloqueio     |
| `additionalContext` | Opcional. Contexto adicional para injetar na conversa ao permitir |

**Eventos Suportados:**

Prompt hooks podem ser usados com a maioria dos eventos de hook, incluindo:

- `PreToolUse` - Avalia se deve permitir uma chamada de ferramenta
- `PostToolUse` - Avalia os resultados da ferramenta e potencialmente injeta contexto
- `Stop` - Determina se deve continuar ou parar
- `SubagentStop` - Avalia os resultados do subagente
- `UserPromptSubmit` - Avalia ou enriquece prompts do usuário

**Exemplo: Stop Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Quando `ok` é `false`, o Qwen Code continuará trabalhando e usará o `reason` como contexto para a próxima resposta.

**Exemplo: PreToolUse Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## Eventos de Hook

Os hooks são disparados em pontos específicos durante uma sessão do Qwen Code. Diferentes eventos suportam diferentes matchers para filtrar as condições de disparo.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Antes da execução da ferramenta                     | Nome da ferramenta (`WriteFile`, `ReadFile`, `Bash`, etc.)         |
| `PostToolUse`        | Após execução bem-sucedida da ferramenta           | Nome da ferramenta                                                 |
| `PostToolUseFailure` | Após falha na execução da ferramenta                | Nome da ferramenta                                                 |
| `UserPromptSubmit`   | Após o usuário enviar o prompt                 | Nenhum (sempre dispara)                                       |
| `SessionStart`       | Quando a sessão inicia ou é retomada            | Origem (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | Quando a sessão termina                         | Motivo (`clear`, `logout`, `prompt_input_exit`, etc.)     |
| `Stop`               | Quando o Claude se prepara para concluir a resposta | Nenhum (sempre dispara)                                       |
| `SubagentStart`      | Quando o subagente inicia                      | Tipo do agente (`Bash`, `Explorer`, `Plan`, etc.)             |
| `SubagentStop`       | Quando o subagente para                       | Tipo do agente                                                |
| `PreCompact`         | Antes da compactação da conversa            | Gatilho (`manual`, `auto`)                                |
| `Notification`       | Quando notificações são enviadas               | Tipo (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Quando o diálogo de permissão é exibido           | Nome da ferramenta                                                 |
| `TodoCreated`        | Quando um novo item de todo é criado           | Nenhum (sempre dispara)                                       |
| `TodoCompleted`      | Quando um item de todo é marcado como concluído   | Nenhum (sempre dispara)                                       |

### Padrões de Matcher

`matcher` é uma expressão regular usada para filtrar as condições de disparo.

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Eventos de Ferramenta         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Nome da ferramenta: `WriteFile`, `ReadFile`, `Bash`, etc.         |
| Eventos de Subagente     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | Tipo do agente: `Bash`, `Explorer`, etc.                     |
| Eventos de Sessão      | `SessionStart`                                                         | ✅ Regex        | Origem: `startup`, `resume`, `clear`, `compact`          |
| Eventos de Sessão      | `SessionEnd`                                                           | ✅ Regex        | Motivo: `clear`, `logout`, `prompt_input_exit`, etc.     |
| Eventos de Notificação | `Notification`                                                         | ✅ Correspondência exata  | Tipo: `permission_prompt`, `idle_prompt`, `auth_success` |
| Eventos de Compactação      | `PreCompact`                                                           | ✅ Correspondência exata  | Gatilho: `manual`, `auto`                                |
| Eventos de Todo         | `TodoCreated`, `TodoCompleted`                                         | ❌ Não           | N/A                                                      |
| Eventos de Prompt       | `UserPromptSubmit`                                                     | ❌ Não           | N/A                                                      |
| Eventos de Stop         | `Stop`                                                                 | ❌ Não           | N/A                                                      |

**Sintaxe do Matcher:**

- String vazia `""` ou `"*"` corresponde a todos os eventos daquele tipo
- Sintaxe padrão de regex suportada (ex.: `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

Todos os hooks recebem entrada padronizada no formato JSON via stdin (command) ou corpo do POST (http).

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

Campos específicos do evento são adicionados com base no tipo de hook. Ao executar em um subagente, `agent_id` e `agent_type` são adicionalmente incluídos.

### Estrutura de Saída do Hook

A saída do hook é retornada via `stdout` (command) ou corpo da resposta HTTP (http) como JSON.

**Comportamento do Código de Saída (Command Hooks):**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Sucesso. Analisa o JSON em `stdout` para controlar o comportamento.                                  |
| `2`       | **Erro de bloqueio**. Ignora `stdout`, passa `stderr` como feedback de erro para o modelo. |
| Other     | Erro não bloqueante. `stderr` é exibido apenas no modo de depuração, a execução continua.           |

**Estrutura de Saída:**

A saída do hook suporta três categorias de campos:

1. **Campos Comuns**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Decisão de Nível Superior**: `decision`, `reason` (usados por alguns eventos)
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

### Detalhes Individuais dos Eventos de Hook

#### PreToolUse

**Propósito**: Executado antes que uma ferramenta seja usada para permitir verificações de permissão, validação de entrada ou injeção de contexto.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Opções de Saída**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" ou "ask" (OBRIGATÓRIO)
- `hookSpecificOutput.permissionDecisionReason`: explicação para a decisão (OBRIGATÓRIO)
- `hookSpecificOutput.updatedInput`: parâmetros de entrada da ferramenta modificados para usar no lugar dos originais
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Embora campos de saída de hook padrão como `decision` e `reason` sejam tecnicamente suportados pela classe subjacente, a interface oficial espera o `hookSpecificOutput` com `permissionDecision` e `permissionDecisionReason`.

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

**Propósito**: Executado após uma ferramenta ser concluída com sucesso para processar resultados, registrar resultados ou injetar contexto adicional.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
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
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```
**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: informações de tratamento de erros
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
- `reason`: explicação legível por humanos para a decisão
- `hookSpecificOutput.additionalContext`: contexto adicional para anexar ao prompt (opcional)

**Nota**: Como `UserPromptSubmitOutput` estende `HookOutput`, todos os campos padrão estão disponíveis, mas apenas `additionalContext` em `hookSpecificOutput` é definido especificamente para este evento.

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

**Propósito**: Executado quando uma nova sessão é iniciada para realizar tarefas de inicialização.

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

- Campos padrão de saída do hook (tipicamente não usados para bloqueio)

#### Stop

**Propósito**: Executado antes que o Qwen conclua sua resposta para fornecer feedback final ou resumos.

**Campos específicos do evento**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

Os campos `context_usage`, `context_limit` e `input_tokens` permitem que os scripts de hook observem o uso do contexto e implementem estratégias de compactação personalizadas — por exemplo, um script que imprime um lembrete para executar `/compact` quando o uso excede um limite personalizado.

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível por humanos para a decisão
- `stopReason`: feedback para incluir na resposta de parada
- `continue`: defina como false para parar a execução
- `hookSpecificOutput.additionalContext`: informações de contexto adicional

**Nota**: Como `StopOutput` estende `HookOutput`, todos os campos padrão estão disponíveis, mas o campo `stopReason` é particularmente relevante para este evento.

**Exemplo de Saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Propósito**: Executado quando o turno termina devido a um erro de API (em vez do Stop). Este é um evento **fire-and-forget** - a saída do hook e os códigos de saída são ignorados.

**Campos específicos do evento**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Faz a correspondência com o campo `error`. Por exemplo, `"matcher": "rate_limit"` só será acionado para erros de limite de taxa.

**Opções de Saída**:

- **Nenhuma** - O StopFailure é fire-and-forget. Toda a saída do hook e códigos de saída são ignorados.

**Tratamento de Código de Saída**:

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Any       | Ignored (fire-and-forget) |

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

- Monitoramento e alerta de limite de taxa
- Registro de falhas de autenticação
- Notificações de erros de faturamento
- Coleta de estatísticas de erros

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
- `reason`: explicação legível por humanos para a decisão

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

**Matcher**: Faz a correspondência com o campo `trigger`. Por exemplo, `"matcher": "manual"` só será acionado para compactação manual via comando `/compact`.

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto adicional (apenas para registro)
- Campos padrão de saída do hook (apenas para registro)

**Nota**: O PostCompact **não** está na lista oficial de eventos suportados no modo de decisão. O campo `decision` e outros campos de controle não produzem nenhum efeito de controle - eles são usados apenas para fins de registro.

**Tratamento de Código de Saída**:

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Success - stdout shown to user in verbose mode            |
| Other     | Non-blocking error - stderr shown to user in verbose mode |

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
- Registro de auditoria para operações de compactação

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

- `hookSpecificOutput.additionalContext`: informações adicionais para incluir
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
  - `message`: mensagem para mostrar ao usuário (opcional)
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

#### TodoCreated

**Propósito**: Executado quando um novo item de todo é criado via ferramenta `todo_write`. Permite validação, registro ou bloqueio da criação do todo.

Os hooks de todo são executados em duas fases:

- `validation`: executada antes da persistência. Use esta fase apenas para validação; retornar `block` ou `deny` impede a gravação.
- `postWrite`: executada após a persistência. Use esta fase para efeitos colaterais, como registro ou sincronização; `block` ou `deny` é ignorado nesta fase.

**Campos específicos do evento**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Opções de Saída**:

- `decision`: "allow", "block" ou "deny"
- `reason`: explicação legível por humanos para a decisão (obrigatória ao bloquear)

**Comportamento de Bloqueio**:

Durante a fase `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a criação do todo é impedida. A lista de todos permanece inalterada e o motivo é fornecido como feedback para o modelo.

Durante a fase `postWrite`, o todo já foi persistido. Os hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a gravação e não deve ser usado para validação.

**Exemplo de Saída (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**Exemplo de Saída (Block)**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Exemplo de Script de Hook**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemplo de Configuração**:

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**Propósito**: Executado quando um item de todo é marcado como concluído. Permite validação, registro ou bloqueio da conclusão do todo.

Os hooks de todo são executados em duas fases:

- `validation`: executada antes da persistência. Use esta fase apenas para validação; retornar `block` ou `deny` impede a gravação.
- `postWrite`: executada após a persistência. Use esta fase para efeitos colaterais, como registro ou sincronização; `block` ou `deny` é ignorado nesta fase.

**Campos específicos do evento**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Opções de Saída**:

- `decision`: "allow", "block" ou "deny"
- `reason`: explicação legível por humanos para a decisão (obrigatória ao bloquear)

**Comportamento de Bloqueio**:

Durante a fase `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a conclusão do todo é impedida. O item de todo permanece em seu status anterior e o motivo é fornecido como feedback para o modelo.

Durante a fase `postWrite`, o todo já foi persistido. Os hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a gravação e não deve ser usado para validação.

**Exemplo de Saída (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Exemplo de Saída (Block)**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Exemplo de Script de Hook**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemplo de Configuração**:

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**Casos de Uso**:

- **Registro**: Rastreie a criação e conclusão de todos para auditoria ou análise
- **Validação**: Aplique padrões de qualidade de conteúdo (tamanho mínimo, palavras-chave obrigatórias)
- **Controle de Fluxo de Trabalho**: Bloqueie a conclusão até que os pré-requisitos sejam atendidos
- **Integração**: Sincronize todos com sistemas externos de gerenciamento de tarefas (Jira, Trello, etc.)

## Configuração de Hooks

Os hooks são configurados nas configurações do Qwen Code, tipicamente em `.qwen/settings.json` ou arquivos de configuração do usuário:

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
- Use `sequential: true` na definição do hook para impor a execução dependente de ordem
- Hooks sequenciais podem modificar a entrada para hooks subsequentes na cadeia

### Hooks Assíncronos

Apenas o tipo `command` suporta execução assíncrona. Definir `"async": true` executa o hook em segundo plano sem bloquear o fluxo principal.

**Recursos:**

- Não pode retornar controle de decisão (a operação já ocorreu)
- Os resultados são injetados no próximo turno da conversa via `systemMessage` ou `additionalContext`
- Adequado para auditoria, registro, testes em segundo plano, etc.

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

- Os hooks são executados no ambiente do usuário com os privilégios do usuário
- Hooks de nível de projeto requerem status de pasta confiável
- Timeouts previnem hooks travados (padrão: 60 segundos)

## Melhores Práticas

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

## Solução de problemas

- Verifique os logs da aplicação para obter detalhes da execução do hook
- Verifique as permissões e a capacidade de execução do script do hook
- Certifique-se de que a formatação JSON nas saídas do hook esteja correta
- Use padrões de matcher específicos para evitar a execução não intencional de hooks
- Use o modo `--debug` para ver informações detalhadas de correspondência e execução do hook
- Desative temporariamente todos os hooks: adicione `"disableAllHooks": true` nas configurações