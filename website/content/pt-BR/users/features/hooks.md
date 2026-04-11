# Documentação dos Hooks do Qwen Code

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
- Modificar entradas ou respostas de ferramentas de forma programática

## Arquitetura dos Hooks

O sistema de hooks do Qwen Code consiste em vários componentes principais:

1. **Hook Registry**: Armazena e gerencia todos os hooks configurados
2. **Hook Planner**: Determina quais hooks devem ser executados para cada evento
3. **Hook Runner**: Executa hooks individuais com o contexto adequado
4. **Hook Aggregator**: Combina os resultados de vários hooks
5. **Hook Event Handler**: Coordena o disparo dos hooks para os eventos

## Eventos de Hook

Os hooks são disparados em pontos específicos durante uma sessão do Qwen Code. Quando um evento é disparado e um matcher corresponde, o Qwen Code passa o contexto JSON sobre o evento para o seu handler de hook. Para hooks de comando, a entrada chega via stdin. Seu handler pode inspecionar a entrada, executar uma ação e, opcionalmente, retornar uma decisão. Alguns eventos são disparados uma vez por sessão, enquanto outros são disparados repetidamente dentro do loop agêntico.

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

A tabela a seguir lista todos os eventos de hook disponíveis no Qwen Code:

| Nome do Evento       | Descrição                                 | Caso de Uso                                        |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PreToolUse`         | Disparado antes da execução da ferramenta                 | Verificação de permissão, validação de entrada, logging  |
| `PostToolUse`        | Disparado após a execução bem-sucedida da ferramenta       | Logging, processamento de saída, monitoramento          |
| `PostToolUseFailure` | Disparado quando a execução da ferramenta falha             | Tratamento de erros, alertas, correção           |
| `Notification`       | Disparado quando notificações são enviadas           | Personalização de notificações, logging             |
| `UserPromptSubmit`   | Disparado quando o usuário envia um prompt            | Processamento de entrada, validação, injeção de contexto |
| `SessionStart`       | Disparado quando uma nova sessão é iniciada             | Inicialização, configuração de contexto                   |
| `Stop`               | Disparado antes do Qwen concluir sua resposta    | Finalização, limpeza                           |
| `SubagentStart`      | Disparado quando um subagente é iniciado                | Inicialização do subagente                         |
| `SubagentStop`       | Disparado quando um subagente é interrompido                 | Finalização do subagente                           |
| `PreCompact`         | Disparado antes da compactação da conversa        | Processamento pré-compactação                       |
| `SessionEnd`         | Disparado quando uma sessão é encerrada                   | Limpeza, geração de relatórios                              |
| `PermissionRequest`  | Disparado quando diálogos de permissão são exibidos | Automação de permissões, aplicação de políticas       |

## Regras de Entrada/Saída

### Estrutura de Entrada do Hook

Todos os hooks recebem entrada padronizada no formato JSON via stdin. Campos comuns incluídos em todos os eventos de hook:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Campos específicos do evento são adicionados com base no tipo de hook. Abaixo estão os campos específicos para cada evento de hook:

### Detalhes Individuais dos Eventos de Hook

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

**Nota**: Embora campos padrão de saída de hook como `decision` e `reason` sejam tecnicamente suportados pela classe subjacente, a interface oficial espera o `hookSpecificOutput` com `permissionDecision` e `permissionDecisionReason`.

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
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

- `decision`: "allow", "deny" ou "block" (padrão para "allow" se não especificado)
- `reason`: motivo para a decisão
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

**Propósito**: Executado quando a execução de uma ferramenta falha para tratar erros, enviar alertas ou registrar falhas.

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
- Campos padrão de saída de hook

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
- Campos padrão de saída de hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Propósito**: Executado quando uma sessão é encerrada para realizar tarefas de limpeza.

**Campos específicos do evento**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Opções de Saída**:

- Campos padrão de saída de hook (geralmente não usados para bloqueio)

#### Stop

**Propósito**: Executado antes do Qwen concluir sua resposta para fornecer feedback final ou resumos.

**Campos específicos do evento**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível por humanos para a decisão
- `stopReason`: feedback a ser incluído na resposta de parada
- `continue`: defina como false para interromper a execução
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Como `StopOutput` estende `HookOutput`, todos os campos padrão estão disponíveis, mas o campo `stopReason` é particularmente relevante para este evento.

**Exemplo de Saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

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
- Campos padrão de saída de hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Propósito**: Executado quando um subagente finaliza para realizar tarefas de finalização.

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
- Campos padrão de saída de hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

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
- Campos padrão de saída de hook

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

## Configuração dos Hooks

Os hooks são configurados nas configurações do Qwen Code, geralmente em `.qwen/settings.json` ou em arquivos de configuração do usuário:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
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

### Padrões de Matcher

Os matchers permitem filtrar hooks com base no contexto. Nem todos os eventos de hook suportam matchers:

| Tipo de Evento          | Eventos                                                                 | Suporte a Matcher | Alvo do Matcher (Valores)                                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| Eventos de Ferramenta         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Sim (regex)  | Nome da ferramenta: `bash`, `read_file`, `write_file`, `edit`, `glob`, `grep_search`, etc.      |
| Eventos de Subagente     | `SubagentStart`, `SubagentStop`                                        | ✅ Sim (regex)  | Tipo de agente: `Bash`, `Explorer`, etc.                                                   |
| Eventos de Sessão      | `SessionStart`                                                         | ✅ Sim (regex)  | Origem: `startup`, `resume`, `clear`, `compact`                                        |
| Eventos de Sessão      | `SessionEnd`                                                           | ✅ Sim (regex)  | Motivo: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| Eventos de Notificação | `Notification`                                                         | ✅ Sim (exato)  | Tipo: `permission_prompt`, `idle_prompt`, `auth_success`                               |
| Eventos de Compactação      | `PreCompact`                                                           | ✅ Sim (exato)  | Gatilho: `manual`, `auto`                                                              |
| Eventos de Prompt       | `UserPromptSubmit`                                                     | ❌ Não           | N/A                                                                                    |
| Eventos de Parada         | `Stop`                                                                 | ❌ Não           | N/A                                                                                    |

**Sintaxe do Matcher**:

- Padrão regex correspondido ao campo alvo
- String vazia `""` ou `"*"` corresponde a todos os eventos desse tipo
- Sintaxe regex padrão suportada (ex.: `^bash$`, `read.*`, `(bash|run_shell_command)`)

**Exemplos**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // Only match bash tool
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // Match read_file, read_multiple_files, etc.
        "hooks": [...]
      },
      {
        "matcher": "",                 // Match all tools (same as "*" or omitting matcher)
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Only match Bash and Explorer agents
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // Only match startup and resume sources
        "hooks": [...]
      }
    ]
  }
}
```

## Execução dos Hooks

### Execução Paralela vs Sequencial

- Por padrão, os hooks são executados em paralelo para melhor desempenho
- Use `sequential: true` na definição do hook para impor execução dependente de ordem
- Hooks sequenciais podem modificar a entrada para hooks subsequentes na cadeia

### Modelo de Segurança

- Os hooks são executados no ambiente do usuário com privilégios de usuário
- Hooks em nível de projeto exigem status de pasta confiável
- Timeouts previnem hooks travados (padrão: 60 segundos)

### Códigos de Saída

Os scripts de hook comunicam seu resultado por meio de códigos de saída:

| Código de Saída | Significado            | Comportamento                                        |
| --------- | ------------------ | ----------------------------------------------- |
| `0`       | Sucesso            | stdout/stderr não são exibidos                         |
| `2`       | Erro de bloqueio     | Exibe stderr para o modelo e bloqueia a chamada da ferramenta        |
| Outro     | Erro não bloqueante | Exibe stderr apenas para o usuário, mas continua a chamada da ferramenta |

**Exemplos**:

```bash
#!/bin/bash

# Success (exit 0 is default, can be omitted)
echo '{"decision": "allow"}'
exit 0

# Blocking error - prevents operation
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **Nota**: Se nenhum código de saída for especificado, o script assume o padrão `0` (sucesso).

## Boas Práticas

### Exemplo 1: Hook de Validação de Segurança

Um hook `PreToolUse` que registra e potencialmente bloqueia comandos perigosos:

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
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # Blocking error
fi

# Allow the operation with a log
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
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

### Exemplo 2: Hook de Validação de Prompt do Usuário

Um hook `UserPromptSubmit` que valida prompts do usuário em busca de informações confidenciais e fornece contexto para prompts longos:

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

- Verifique os logs do aplicativo para obter detalhes da execução do hook
- Verifique as permissões e a capacidade de execução do script do hook
- Garanta a formatação JSON adequada nas saídas do hook
- Use padrões de matcher específicos para evitar a execução não intencional de hooks