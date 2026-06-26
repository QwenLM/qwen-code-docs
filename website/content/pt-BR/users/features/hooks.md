# Hooks do Qwen Code

## Visão Geral

Os hooks do Qwen Code fornecem um mecanismo poderoso para estender e personalizar o comportamento do aplicativo Qwen Code. Os hooks permitem que os usuários executem scripts ou programas personalizados em pontos específicos do ciclo de vida do aplicativo, como antes da execução da ferramenta, após a execução da ferramenta, no início/fim da sessão e durante outros eventos-chave.

Os hooks são ativados por padrão. Você pode desativar temporariamente todos os hooks definindo `disableAllHooks` como `true` no arquivo de configurações (no nível superior, ao lado de `hooks`):

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

- Monitore e audite o uso de ferramentas
- Aplique políticas de segurança
- Injete contexto adicional nas conversas
- Personalize o comportamento do aplicativo com base em eventos
- Integre com sistemas e serviços externos
- Modifique entradas ou respostas de ferramentas programaticamente

## Tipos de Hook

O Qwen Code suporta quatro tipos de executores de hook:

| Tipo | Descrição |
| :-- | :-- |
| `command` | Executa um comando shell. Recebe JSON via `stdin`, retorna resultados via `stdout`. |
| `http` | Envia JSON como corpo de uma requisição `POST` para uma URL especificada. Retorna resultados via corpo da resposta HTTP. |
| `function` | Chama diretamente uma função JavaScript registrada (apenas hooks de nível de sessão). |
| `prompt` | Usa um LLM para avaliar a entrada do hook e retornar uma decisão. |

### Hooks de Comando

Hooks de comando executam comandos via processos filhos. O JSON de entrada é passado pelo stdin, e a saída é retornada pelo stdout.

**Configuração:**

| Campo | Tipo | Obrigatório | Descrição |
| :-- | :-- | :-- | :-- |
| `type` | `"command"` | Sim | Tipo do hook |
| `command` | `string` | Sim | Comando a ser executado |
| `name` | `string` | Não | Nome do hook (para registro) |
| `description` | `string` | Não | Descrição do hook |
| `timeout` | `number` | Não | Tempo limite em milissegundos, padrão 60000 |
| `async` | `boolean` | Não | Se deve executar de forma assíncrona em segundo plano |
| `env` | `Record<string, string>` | Não | Variáveis de ambiente |
| `shell` | `"bash" \| "powershell"` | Não | Shell a ser usado |
| `statusMessage` | `string` | Não | Mensagem de status exibida durante a execução |

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

Hooks HTTP enviam a entrada do hook como requisições POST para URLs especificadas. Eles suportam listas brancas de URL, proteção SSRF em nível de DNS, interpolação de variáveis de ambiente e outros recursos de segurança.

**Configuração:**

| Campo | Tipo | Obrigatório | Descrição |
| :-- | :-- | :-- | :-- |
| `type` | `"http"` | Sim | Tipo do hook |
| `url` | `string` | Sim | URL de destino |
| `headers` | `Record<string, string>` | Não | Cabeçalhos da requisição (suporta interpolação de variáveis de ambiente) |
| `allowedEnvVars` | `string[]` | Não | Lista branca de variáveis de ambiente permitidas na URL/cabeçalhos |
| `timeout` | `number` | Não | Tempo limite em segundos, padrão 600 |
| `name` | `string` | Não | Nome do hook (para registro) |
| `statusMessage` | `string` | Não | Mensagem de status exibida durante a execução |
| `once` | `boolean` | Não | Executar apenas uma vez por evento por sessão (apenas hooks HTTP) |

**Recursos de Segurança:**

- **Lista Branca de URL**: Configure padrões de URL permitidos via `allowedUrls`
- **Proteção SSRF**: Bloqueia IPs privados (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.) mas permite endereços loopback (127.0.0.1, ::1)
- **Validação de DNS**: Valida a resolução de domínio antes das requisições para evitar ataques de rebinding de DNS
- **Interpolação de Variáveis de Ambiente**: Sintaxe `${VAR}`, permite apenas variáveis na lista branca `allowedEnvVars`

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

Hooks de função chamam diretamente funções JavaScript/TypeScript registradas. Eles são usados internamente pelo sistema de Skill e não são atualmente expostos como uma API pública para usuários finais.

**Nota**: Para a maioria dos casos de uso, use **hooks de comando** ou **hooks HTTP** em vez disso, que podem ser configurados em arquivos de configurações.

### Hooks de Prompt

Hooks de prompt usam um LLM para avaliar a entrada do hook e retornar uma decisão. Isso é útil para tomar decisões inteligentes com base no contexto, como determinar se deve permitir ou bloquear uma operação.

**Como funciona:**

1. O JSON de entrada do hook é injetado no seu prompt usando o marcador `$ARGUMENTS`
2. O prompt é enviado a um LLM (padrão: seu modelo atual)
3. O LLM retorna uma resposta JSON com a decisão
4. O Qwen Code processa a decisão e continua ou bloqueia a execução de acordo

**Configuração:**

| Campo | Tipo | Obrigatório | Descrição |
| :-- | :-- | :-- | :-- |
| `type` | `"prompt"` | Sim | Tipo do hook |
| `prompt` | `string` | Sim | Prompt enviado ao LLM. Use `$ARGUMENTS` para a entrada do hook |
| `model` | `string` | Não | Modelo a usar (padrão: seu modelo atual) |
| `timeout` | `number` | Não | Tempo limite em segundos, padrão 30 |
| `name` | `string` | Não | Nome do hook (para registro) |
| `description` | `string` | Não | Descrição do hook |
| `statusMessage` | `string` | Não | Mensagem de status exibida durante a execução |

**Formato da Resposta:**

O LLM deve retornar JSON com a seguinte estrutura:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Campo | Descrição |
| :-- | :-- |
| `ok` | `true` para permitir/continuar, `false` para bloquear/parar |
| `reason` | Obrigatório quando `ok` é `false`. Mostrado ao modelo para explicar o bloqueio |
| `additionalContext` | Opcional. Contexto adicional para injetar na conversa ao permitir |

**Eventos Suportados:**

Hooks de prompt podem ser usados com a maioria dos eventos de hook, incluindo:

- `PreToolUse` – Avaliar se deve permitir uma chamada de ferramenta
- `PostToolUse` – Avaliar resultados da ferramenta e potencialmente injetar contexto
- `Stop` – Determinar se deve continuar ou parar
- `SubagentStop` – Avaliar resultados do subagente
- `UserPromptSubmit` – Avaliar ou enriquecer prompts do usuário

**Exemplo: Hook Stop**

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

**Exemplo: Hook PreToolUse**

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

Os hooks são acionados em pontos específicos durante uma sessão do Qwen Code. Diferentes eventos suportam diferentes matchers para filtrar condições de gatilho.

| Evento | Acionado Quando | Alvo do Matcher |
| :-- | :-- | :-- |
| `PreToolUse` | Antes da execução da ferramenta | Nome da ferramenta (`WriteFile`, `ReadFile`, `Bash`, etc.) |
| `PostToolUse` | Após a execução bem-sucedida da ferramenta | Nome da ferramenta |
| `PostToolUseFailure` | Após falha na execução da ferramenta | Nome da ferramenta |
| `UserPromptSubmit` | Após o usuário enviar um prompt | Nenhum (sempre dispara) |
| `SessionStart` | Quando a sessão inicia ou é retomada | Origem (`startup`, `resume`, `clear`, `compact`) |
| `SessionEnd` | Quando a sessão termina | Motivo (`clear`, `logout`, `prompt_input_exit`, etc.) |
| `Stop` | Quando o Claude se prepara para concluir a resposta | Nenhum (sempre dispara) |
| `SubagentStart` | Quando o subagente inicia | Tipo de agente (`Bash`, `Explorer`, `Plan`, etc.) |
| `SubagentStop` | Quando o subagente para | Tipo de agente |
| `PreCompact` | Antes da compactação da conversa | Gatilho (`manual`, `auto`) |
| `Notification` | Quando notificações são enviadas | Tipo (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest` | Quando o diálogo de permissão é exibido | Nome da ferramenta |
| `TodoCreated` | Quando um novo item de tarefa é criado | Nenhum (sempre dispara) |
| `TodoCompleted` | Quando um item de tarefa é marcado como concluído | Nenhum (sempre dispara) |

### Padrões de Matcher

`matcher` é uma expressão regular usada para filtrar condições de gatilho.

| Tipo de Evento | Eventos | Suporte a Matcher | Alvo do Matcher |
| :-- | :-- | :-- | :-- |
| Eventos de Ferramenta | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex | Nome da ferramenta: `WriteFile`, `ReadFile`, `Bash`, etc. |
| Eventos de Subagente | `SubagentStart`, `SubagentStop` | ✅ Regex | Tipo de agente: `Bash`, `Explorer`, etc. |
| Eventos de Sessão | `SessionStart` | ✅ Regex | Origem: `startup`, `resume`, `clear`, `compact` |
| Eventos de Sessão | `SessionEnd` | ✅ Regex | Motivo: `clear`, `logout`, `prompt_input_exit`, etc. |
| Eventos de Notificação | `Notification` | ✅ Correspondência exata | Tipo: `permission_prompt`, `idle_prompt`, `auth_success` |
| Eventos de Compactação | `PreCompact` | ✅ Correspondência exata | Gatilho: `manual`, `auto` |
| Eventos de Tarefa | `TodoCreated`, `TodoCompleted` | ❌ Não | N/A |
| Eventos de Prompt | `UserPromptSubmit` | ❌ Não | N/A |
| Eventos de Parada | `Stop` | ❌ Não | N/A |

**Sintaxe do Matcher:**

- String vazia `""` ou `"*"` corresponde a todos os eventos desse tipo
- Sintaxe de regex padrão suportada (ex.: `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

Todos os hooks recebem entrada padronizada em formato JSON via stdin (comando) ou corpo POST (http).

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

Campos específicos de evento são adicionados com base no tipo de hook. Quando executado em um subagente, `agent_id` e `agent_type` também são incluídos.

### Estrutura de Saída do Hook

A saída do hook é retornada via `stdout` (comando) ou corpo da resposta HTTP (http) como JSON.

**Comportamento do Código de Saída (Hooks de Comando):**

| Código de Saída | Comportamento |
| :-- | :-- |
| `0` | Sucesso. Analisa o JSON no `stdout` para controlar o comportamento. |
| `2` | **Erro de bloqueio**. Ignora `stdout`, passa `stderr` como feedback de erro para o modelo. |
| Outro | Erro não bloqueante. `stderr` mostrado apenas no modo debug, a execução continua. |

**Estrutura de Saída:**

A saída do hook suporta três categorias de campos:

1. **Campos Comuns**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Decisão de Alto Nível**: `decision`, `reason` (usados por alguns eventos)
3. **Controle Específico de Evento**: `hookSpecificOutput` (deve incluir `hookEventName`)

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

**Propósito**: Executado antes de uma ferramenta ser usada para permitir verificações de permissão, validação de entrada ou injeção de contexto.

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

**Opções de saída**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" ou "ask" (OBRIGATÓRIO)
- `hookSpecificOutput.permissionDecisionReason`: explicação da decisão (OBRIGATÓRIO)
- `hookSpecificOutput.updatedInput`: parâmetros de entrada modificados da ferramenta para usar no lugar dos originais
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Embora campos de saída padrão do hook como `decision` e `reason` sejam tecnicamente suportados pela classe subjacente, a interface oficial espera o `hookSpecificOutput` com `permissionDecision` e `permissionDecisionReason`.

**Exemplo de saída**:

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

**Opções de saída**:

- `decision`: "allow", "deny", "block" (padrão "allow" se não especificado)
- `reason`: motivo da decisão
- `hookSpecificOutput.additionalContext`: informações adicionais a serem incluídas

**Exemplo de saída**:

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
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```
**Opções de saída**:

- `hookSpecificOutput.additionalContext`: informações de tratamento de erros
- Campos de saída padrão do hook

**Exemplo de saída**:

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
  "prompt": "o texto do prompt enviado pelo usuário"
}
```

**Opções de saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para a decisão
- `hookSpecificOutput.additionalContext`: contexto adicional para anexar ao prompt (opcional)

**Observação**: Como UserPromptSubmitOutput estende HookOutput, todos os campos padrão estão disponíveis, mas apenas `additionalContext` em `hookSpecificOutput` é especificamente definido para este evento.

**Exemplo de saída**:

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
  "model": "o modelo sendo usado",
  "agent_type": "o tipo de agente, se aplicável (opcional)"
}
```

**Opções de saída**:

- `hookSpecificOutput.additionalContext`: contexto a ser disponibilizado na sessão
- Campos de saída padrão do hook

**Exemplo de saída**:

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

**Opções de saída**:

- Campos de saída padrão do hook (normalmente não usados para bloqueio)

#### Stop

**Propósito**: Executado antes de Qwen concluir sua resposta para fornecer feedback ou resumos finais.

**Campos específicos do evento**:

```json
{
  "stop_hook_active": "booleano indicando se o stop hook está ativo",
  "last_assistant_message": "a última mensagem do assistente"
}
```

**Opções de saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para a decisão
- `stopReason`: feedback a ser incluído na resposta de parada
- `continue`: defina como false para interromper a execução
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Observação**: Como StopOutput estende HookOutput, todos os campos padrão estão disponíveis, mas o campo `stopReason` é particularmente relevante para este evento.

**Exemplo de saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Propósito**: Executado quando o turno termina devido a um erro de API (em vez de Stop). Este é um evento **fire-and-forget** - a saída do hook e os códigos de saída são ignorados.

**Campos específicos do evento**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "mensagem de erro detalhada (opcional)",
  "last_assistant_message": "a última mensagem do assistente antes do erro (opcional)"
}
```

**Matcher**: Corresponde ao campo `error`. Por exemplo, `"matcher": "rate_limit"` só será acionado para erros de limite de taxa.

**Opções de saída**:

- **Nenhuma** - StopFailure é fire-and-forget. Toda saída do hook e códigos de saída são ignorados.

**Tratamento de código de saída**:

| Código de Saída | Comportamento               |
| --------------- | ---------------------------- |
| Qualquer        | Ignorado (fire-and-forget)   |

**Exemplo de configuração**:

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

**Casos de uso**:

- Monitoramento e alerta de limite de taxa
- Registro de falhas de autenticação
- Notificações de erro de cobrança
- Coleta de estatísticas de erro

#### SubagentStart

**Propósito**: Executado quando um subagente (como a ferramenta Task) é iniciado para configurar contexto ou permissões.

**Campos específicos do evento**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identificador do subagente",
  "agent_type": "tipo de agente (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Opções de saída**:

- `hookSpecificOutput.additionalContext`: contexto inicial para o subagente
- Campos de saída padrão do hook

**Exemplo de saída**:

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
  "stop_hook_active": "booleano indicando se o stop hook está ativo",
  "agent_id": "identificador do subagente",
  "agent_type": "tipo de agente",
  "agent_transcript_path": "caminho para o transcript do subagente",
  "last_assistant_message": "a última mensagem do subagente"
}
```

**Opções de saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível para a decisão

**Exemplo de saída**:

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
  "custom_instructions": "instruções personalizadas atualmente definidas"
}
```

**Opções de saída**:

- `hookSpecificOutput.additionalContext`: contexto a ser incluído antes da compactação
- Campos de saída padrão do hook

**Exemplo de saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Propósito**: Executado após a conclusão da compactação da conversa para arquivar resumos ou rastrear uso.

**Campos específicos do evento**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "o resumo gerado pelo processo de compactação"
}
```

**Matcher**: Corresponde ao campo `trigger`. Por exemplo, `"matcher": "manual"` só será acionado para compactação manual via comando `/compact`.

**Opções de saída**:

- `hookSpecificOutput.additionalContext`: contexto adicional (apenas para registro)
- Campos de saída padrão do hook (apenas para registro)

**Observação**: PostCompact **não** está na lista oficial de eventos suportados no modo de decisão. O campo `decision` e outros campos de controle não produzem efeitos de controle — são usados apenas para fins de registro.

**Tratamento de código de saída**:

| Código de Saída | Comportamento                                                |
| --------------- | ------------------------------------------------------------ |
| 0               | Sucesso - stdout mostrado ao usuário no modo verbose         |
| Outro           | Erro não bloqueante - stderr mostrado ao usuário no modo verbose |

**Exemplo de configuração**:

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

**Casos de uso**:

- Arquivamento de resumos em arquivos ou bancos de dados
- Rastreamento de estatísticas de uso
- Monitoramento de mudanças de contexto
- Registro de auditoria para operações de compactação

#### Notification

**Propósito**: Executado quando notificações são enviadas para personalizá-las ou interceptá-las.

**Campos específicos do evento**:

```json
{
  "message": "conteúdo da mensagem de notificação",
  "title": "título da notificação (opcional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Observação**: O tipo `elicitation_dialog` está definido, mas não implementado atualmente.

**Opções de saída**:

- `hookSpecificOutput.additionalContext`: informações adicionais a incluir
- Campos de saída padrão do hook

**Exemplo de saída**:

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
  "tool_name": "nome da ferramenta solicitando permissão",
  "tool_input": "objeto contendo os parâmetros de entrada da ferramenta",
  "permission_suggestions": "array de permissões sugeridas (opcional)"
}
```

**Opções de saída**:

- `hookSpecificOutput.decision`: objeto estruturado com detalhes da decisão de permissão:
  - `behavior`: "allow" ou "deny"
  - `updatedInput`: entrada da ferramenta modificada (opcional)
  - `updatedPermissions`: permissões modificadas (opcional)
  - `message`: mensagem a mostrar ao usuário (opcional)
  - `interrupt`: se deve interromper o fluxo de trabalho (opcional)

**Exemplo de saída**:

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

**Propósito**: Executado quando um novo item de todo é criado via ferramenta `todo_write`. Permite validação, registro ou bloqueio da criação de todos.

Os hooks de todo são executados em duas fases:

- `validation`: executa antes da persistência. Use esta fase apenas para validação; retornar `block` ou `deny` impede a escrita.
- `postWrite`: executa após a persistência. Use esta fase para efeitos colaterais como registro ou sincronização; `block` ou `deny` é ignorado nesta fase.

**Campos específicos do evento**:

```json
{
  "todo_id": "identificador único do item de todo",
  "todo_content": "conteúdo/descrição do item de todo",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array de todos os itens de todo na lista atual",
  "phase": "validation | postWrite"
}
```

**Opções de saída**:

- `decision`: "allow", "block" ou "deny"
- `reason`: explicação legível para a decisão (obrigatório ao bloquear)

**Comportamento de bloqueio**:

Durante a fase `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a criação do todo é impedida. A lista de todos permanece inalterada e o motivo é fornecido como feedback ao modelo.

Durante a fase `postWrite`, o todo já foi persistido. Hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a escrita e não deve ser usado para validação.

**Exemplo de saída (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**Exemplo de saída (Block)**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Exemplo de script de hook**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Valida o conteúdo do todo antes da criação

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Verifica comprimento mínimo
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Bloqueia todos relacionados a teste
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemplo de configuração**:

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

- `validation`: executa antes da persistência. Use esta fase apenas para validação; retornar `block` ou `deny` impede a escrita.
- `postWrite`: executa após a persistência. Use esta fase para efeitos colaterais como registro ou sincronização; `block` ou `deny` é ignorado nesta fase.

**Campos específicos do evento**:

```json
{
  "todo_id": "identificador único do item de todo",
  "todo_content": "conteúdo/descrição do item de todo",
  "previous_status": "pending | in_progress (status antes da conclusão)",
  "all_todos": "array de todos os itens de todo na lista atual",
  "phase": "validation | postWrite"
}
```

**Opções de saída**:

- `decision`: "allow", "block" ou "deny"
- `reason`: explicação legível para a decisão (obrigatório ao bloquear)

**Comportamento de bloqueio**:

Durante a fase `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a conclusão do todo é impedida. O item de todo permanece em seu status anterior e o motivo é fornecido como feedback ao modelo.

Durante a fase `postWrite`, o todo já foi persistido. Hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a escrita e não deve ser usado para validação.

**Exemplo de saída (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Exemplo de saída (Block)**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Exemplo de script de hook**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Valida condições de conclusão do todo

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Verifica se há todos dependentes incompletos (exemplo de lógica)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemplo de configuração**:

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

**Casos de uso**:

- **Registro**: Rastrear criação e conclusão de todos para auditoria ou análises
- **Validação**: Aplicar padrões de qualidade de conteúdo (comprimento mínimo, palavras-chave obrigatórias)
- **Controle de fluxo de trabalho**: Bloquear conclusão até que pré-requisitos sejam atendidos
- **Integração**: Sincronizar todos com sistemas externos de gerenciamento de tarefas (Jira, Trello, etc.)

## Configuração de Hook

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

## Execução de Hook

### Execução Paralela vs Sequencial

- Por padrão, os hooks são executados em paralelo para melhor desempenho
- Use `sequential: true` na definição do hook para impor execução dependente de ordem
- Hooks sequenciais podem modificar a entrada para hooks subsequentes na cadeia

### Hooks Assíncronos

Apenas o tipo `command` suporta execução assíncrona. Definir `"async": true` executa o hook em segundo plano sem bloquear o fluxo principal.

**Características:**

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

- Os hooks são executados no ambiente do usuário com privilégios do usuário
- Hooks de nível de projeto exigem status de pasta confiável
- Timeouts evitam que hooks fiquem pendentes (padrão: 60 segundos)

## Melhores Práticas

### Exemplo 1: Hook de Validação de Segurança

Um hook PreToolUse que registra e potencialmente bloqueia comandos perigosos:

**security_check.sh**

```bash
#!/bin/bash

# Lê a entrada do stdin
INPUT=$(cat)

# Analisa a entrada para extrair informações da ferramenta
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Verifica operações potencialmente perigosas
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Erro bloqueante
fi

# Registra a operação
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Permite com contexto adicional
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

### Exemplo 2: Hook HTTP de Auditoria

Um hook PostToolUse HTTP que envia todos os registros de execução de ferramentas para um serviço de auditoria remoto:

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

# Carrega a entrada do stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Lista de palavras sensíveis
sensitive_words = ["password", "secret", "token", "api_key"]

# Verifica informações sensíveis
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Bloqueia prompts que contenham informações sensíveis
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Verifica o comprimento do prompt e adiciona contexto de aviso se muito longo
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# Nenhum processamento necessário para casos normais
exit(0)
```
## Solução de Problemas

- Verifique os logs da aplicação para obter detalhes da execução dos hooks
- Confirme as permissões e a executabilidade dos scripts dos hooks
- Garanta a formatação JSON correta nas saídas dos hooks
- Use padrões de correspondência específicos para evitar a execução não intencional de hooks
- Use o modo `--debug` para visualizar informações detalhadas de correspondência e execução de hooks
- Desabilite temporariamente todos os hooks: adicione `"disableAllHooks": true` nas configurações