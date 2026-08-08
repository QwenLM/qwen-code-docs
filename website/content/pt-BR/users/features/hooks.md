# Qwen Code Hooks

## Overview

Os hooks do Qwen Code fornecem um mecanismo poderoso para estender e personalizar o comportamento do aplicativo Qwen Code. Os hooks permitem que os usuários executem scripts ou programas personalizados em pontos específicos do ciclo de vida do aplicativo, como antes da execução de uma ferramenta, após a execução de uma ferramenta, no início/fim da sessão e durante outros eventos importantes.

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

## What are Hooks?

Hooks são scripts ou programas definidos pelo usuário que são executados automaticamente pelo Qwen Code em pontos predefinidos do fluxo do aplicativo. Eles permitem que os usuários:

- Monitorem e auditem o uso de ferramentas
- Apliquem políticas de segurança
- Injetem contexto adicional nas conversas
- Personalizem o comportamento do aplicativo com base em eventos
- Integrem-se com sistemas e serviços externos
- Modifiquem entradas ou respostas de ferramentas programaticamente

## Hook Types

O Qwen Code suporta quatro tipos de executores de hook:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Executa um comando de shell. Recebe JSON via `stdin` e retorna os resultados via `stdout`.     |
| `http`     | Envia JSON como corpo de uma requisição `POST` para uma URL especificada. Retorna os resultados via corpo da resposta HTTP. |
| `function` | Chama diretamente uma função JavaScript registrada (apenas hooks no nível da sessão).          |
| `prompt`   | Usa um LLM para avaliar a entrada do hook e retornar uma decisão.                              |

### Command Hooks

Os hooks de comando executam comandos via processos filhos. O JSON de entrada é passado via stdin, e a saída é retornada via stdout.

**Configuration:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Tipo do hook                                |
| `command`       | `string`                 | Yes      | Comando a ser executado                     |
| `name`          | `string`                 | No       | Nome do hook (para logs)                    |
| `description`   | `string`                 | No       | Descrição do hook                           |
| `timeout`       | `number`                 | No       | Timeout em milissegundos, padrão 60000      |
| `async`         | `boolean`                | No       | Se deve ser executado de forma assíncrona em segundo plano |
| `env`           | `Record<string, string>` | No       | Variáveis de ambiente                       |
| `shell`         | `"bash" \| "powershell"` | No       | Shell a ser usado                           |
| `statusMessage` | `string`                 | No       | Mensagem de status exibida durante a execução |

**Example:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
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

Os hooks HTTP enviam a entrada do hook como requisições POST para URLs especificadas. Eles suportam listas de permissão de URL, proteção contra SSRF no nível de DNS, interpolação de variáveis de ambiente e outros recursos de segurança.

**Configuration:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Tipo do hook                                              |
| `url`            | `string`                 | Yes      | URL de destino                                            |
| `headers`        | `Record<string, string>` | No       | Cabeçalhos da requisição (suporta interpolação de variáveis de ambiente) |
| `allowedEnvVars` | `string[]`               | No       | Lista de permissão de variáveis de ambiente permitidas na URL/cabeçalhos |
| `timeout`        | `number`                 | No       | Timeout em segundos, padrão 600                           |
| `name`           | `string`                 | No       | Nome do hook (para logs)                                  |
| `statusMessage`  | `string`                 | No       | Mensagem de status exibida durante a execução             |
| `once`           | `boolean`                | No       | Executar apenas uma vez por evento por sessão (apenas hooks HTTP) |

**Security Features:**

- **Lista de permissão de URL**: Configure os padrões de URL permitidos via `allowedUrls`
- **Proteção contra SSRF**: Bloqueia IPs privados (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.), mas permite endereços de loopback (127.0.0.1, ::1)
- **Validação de DNS**: Valida a resolução de domínio antes das requisições para evitar ataques de DNS rebinding
- **Interpolação de Variáveis de Ambiente**: Sintaxe `${VAR}`, permite apenas variáveis na lista de permissão `allowedEnvVars`

#### Allowing private-network hooks (managed environments only)

Por padrão, hooks HTTP não podem targetear faixas de IP privadas ou link-local. Em ambientes gerenciados por plataformas onde o receptor do hook é um endpoint interno de primeira parte na VPC (por exemplo, um gateway de API interno resolvendo para `172.16.0.0/12`), você pode relaxar as verificações de faixa de IP com:

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- Esta configuração é **honrada apenas nos escopos de configurações User, System e SystemDefaults**. Um valor definido nas configurações de Workspace (projeto) é ignorado e registrado como aviso, então um repositório clonado nunca pode conceder essa bypass por conta própria.
- O flag relaxa apenas as verificações de **faixa** privadas/CGNAT/link-local gerais. Endpoints de metadados de nuvem permanecem bloqueados em todas as configurações: a lista `BLOCKED_HOSTS` é correspondida literalmente (`metadata.google.internal`, `metadata.azure.internal`, ...), e os IPs de metadados `169.254.169.254` e `100.100.100.200` são bloqueados em todas as formas serializadas (incluindo IPv4-mapped IPv6 como `::ffff:a9fe:a9fe`) e após resolução DNS.
- A lista de permissão `security.allowedHttpHookUrls` ainda se aplica independentemente. Em ambientes gerenciados, combine este flag com uma lista de permissão para que apenas os endpoints internos desejados sejam acessíveis.

> **Warning:** Habilitar este flag permite que hooks acessem infraestrutura interna na sua rede. Habilite-o apenas em configurações gerenciadas e confiáveis — nunca em um repositório que você não controla.

**Example:**

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

**Example: External Judgment Service Adapter**

A configuração `remote-security-check` acima espera que `http://127.0.0.1:8080/hooks/pre-tool-use` já esteja executando um serviço que fala este contrato (POST `{tool_name, tool_input, ...}` entrada, `hookSpecificOutput.permissionDecision` saída). Aqui está um adaptador mínimo, apenas com stdlib, que preenche essa parte faltante, conectado a um backend de julgamento concreto para que tudo seja executável e testável de ponta a ponta, em vez de um stub. Apenas a função `review()` é específica do backend — troque seu corpo e formato de request/response por qualquer que seja o serviço que você usar; todo o resto (o servidor, o tratamento fail-open, o formato de resposta do hook) permanece o mesmo independente do backend.

_Divulgação: o backend usado abaixo, [invinoveritas](https://api.babyblueviper.com), é um serviço com o qual o autor é afiliado — usado aqui porque foi o que pôde ser verificado de ponta a ponta para este exemplo, não um endosso. Qualquer serviço HTTP que retorne um veredito JSON funciona igualmente bem; apenas `review()` precisa mudar._

_Tratamento de dados: com `matcher: "*"`, o `tool_input` completo de **todas** as chamadas de ferramenta é enviado ao backend de julgamento — trate essa entrada como sensível (pode conter conteúdos de arquivos, caminhos ou segredos). Estreite o matcher (ex.: para `run_shell_command`) se você precisa julgar apenas comandos shell._

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

Testado de ponta a ponta contra a API real de produção acima: uma entrada genuinamente destrutiva (`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`) retornou `permissionDecision: "deny"` com uma explicação real; uma benigna (`ls -la`) retornou `"allow"`. Falha aberta em qualquer problema de rede/timeout/resposta malformada do backend de julgamento, então uma interrupção nunca bloqueia chamadas de ferramenta legítimas — mesma disciplina que os exemplos de hook `command` acima aplicam com seus próprios códigos de saída.

### Function Hooks

Os hooks de função chamam diretamente funções JavaScript/TypeScript registradas. Eles são usados internamente pelo sistema de Skills e atualmente não são expostos como uma API pública para usuários finais.

**Note**: Para a maioria dos casos de uso, use **hooks de comando** ou **hooks HTTP** em vez disso, que podem ser configurados em arquivos de configurações.

### Prompt Hooks

Os hooks de prompt usam um LLM para avaliar a entrada do hook e retornar uma decisão. Isso é útil para tomar decisões inteligentes com base no contexto, como determinar se uma operação deve ser permitida ou bloqueada.

> **Data handling:** Um hook de prompt envia sua entrada de evento para o provedor de modelo configurado. Quando o logging de debug baseado em arquivos está habilitado, a requisição do hook de prompt totalmente expandida também é escrita no log de debug da sessão. Trate a entrada do hook e os logs de debug como potencialmente sensíveis.

**How it works:**

1. O JSON de entrada do hook é injetado no seu prompt usando o placeholder `$ARGUMENTS`
2. O prompt é enviado para um LLM (padrão: seu modelo atual)
3. O LLM retorna uma resposta JSON com a decisão
4. O Qwen Code processa a decisão e continua ou bloqueia a execução de acordo

**Configuration:**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | Tipo do hook                                        |
| `prompt`        | `string`   | Yes      | Prompt enviado para o LLM. Use `$ARGUMENTS` para a entrada do hook |
| `model`         | `string`   | No       | Modelo a ser usado (padrão: seu modelo atual)       |
| `timeout`       | `number`   | No       | Timeout em segundos, padrão 30                      |
| `name`          | `string`   | No       | Nome do hook (para logs)                            |
| `description`   | `string`   | No       | Descrição do hook                                   |
| `statusMessage` | `string`   | No       | Mensagem de status exibida durante a execução       |

**Response Format:**

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
| `ok`                | `true` para permitir/continuar, `false` para bloquear/parar                |
| `reason`            | Obrigatório quando `ok` é `false`. Mostrado ao modelo para explicar o bloqueio |
| `additionalContext` | Opcional. Contexto adicional para injetar na conversa ao permitir          |

**Supported Events:**

Os hooks de prompt podem ser usados com a maioria dos eventos de hook, incluindo:

- `PreToolUse` - Avalia se deve permitir uma chamada de ferramenta
- `PostToolUse` - Avalia os resultados da ferramenta e potencialmente injeta contexto
- `Stop` - Determina se deve continuar ou parar
- `SubagentStop` - Avalia os resultados do subagente
- `UserPromptSubmit` - Avalia ou enriquece os prompts elegíveis vinculados ao modelo

**Example: Stop Hook**

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

**Example: PreToolUse Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "run_shell_command",
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

## Hook Events

Os hooks são disparados em pontos específicos durante uma sessão do Qwen Code. Diferentes eventos suportam diferentes matchers para filtrar as condições de disparo.

| Event                | Triggered When                                  | Matcher Target                                                 |
| :------------------- | :---------------------------------------------- | :------------------------------------------------------------- |
| `PreToolUse`         | Antes da execução da ferramenta                 | Tool id (`write_file`, `read_file`, `run_shell_command`, etc.) |
| `PostToolUse`        | Após a execução bem-sucedida da ferramenta      | Tool id                                                        |
| `PostToolUseFailure` | Após a falha na execução da ferramenta          | Tool id                                                        |
| `UserPromptSubmit`   | Antes de invocações de modelo suportadas        | Nenhum                                                         |
| `SessionStart`       | Quando a sessão inicia ou é retomada            | Origem (`startup`, `resume`, `clear`, `compact`)               |
| `SessionEnd`         | Quando a sessão termina                         | Motivo (`clear`, `logout`, `prompt_input_exit`, etc.)          |
| `SessionDelete`      | Após uma sessão explicitamente selecionada ser excluída | Nenhum                                                   |
| `MessageDisplay`     | Repetidamente, enquanto a resposta é transmitida | Nenhum (sempre dispara)                                       |
| `Stop`               | Quando o Claude se prepara para concluir a resposta | Nenhum (sempre dispara)                                   |
| `SubagentStart`      | Quando o subagente inicia                       | Tipo de agente (`Bash`, `Explorer`, `Plan`, etc.)              |
| `SubagentStop`       | Quando o subagente para                         | Tipo de agente                                                 |
| `PreCompact`         | Antes da compactação da conversa                | Gatilho (`manual`, `auto`)                                     |
| `Notification`       | Quando as notificações são enviadas             | Tipo (`permission_prompt`, `idle_prompt`, `auth_success`)      |
| `PermissionRequest`  | Quando o diálogo de permissão é exibido         | Tool id                                                        |
| `PermissionDenied`   | Quando a permissão da ferramenta é negada       | Tool id                                                        |
| `TodoCreated`        | Quando um novo item de todo é criado            | Nenhum (sempre dispara)                                        |
| `TodoCompleted`      | Quando um item de todo é marcado como concluído | Nenhum (sempre dispara)                                        |
### Padrões de Matcher

`matcher` é uma expressão regular usada para filtrar condições de gatilho.

| Tipo de Evento          | Eventos                                                                                  | Suporte a Matcher | Alvo do Matcher                                              |
| :------------------ | :----------------------------------------------------------------------------------------- | :-------------- | :----------------------------------------------------------- |
| Eventos de Ferramenta         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ Regex        | Tool id: `write_file`, `read_file`, `run_shell_command`, etc. |
| Eventos de Subagente     | `SubagentStart`, `SubagentStop`                                                            | ✅ Regex        | Tipo de agente: `Bash`, `Explorer`, etc.                       |
| Eventos de Sessão      | `SessionStart`                                                                             | ✅ Regex        | Origem: `startup`, `resume`, `clear`, `compact`                |
| Eventos de Sessão      | `SessionEnd`                                                                               | ✅ Regex        | Motivo: `clear`, `logout`, `prompt_input_exit`, etc.           |
| Eventos de Sessão      | `SessionDelete`                                                                            | ❌ Não           | N/A                                                            |
| Eventos de Notificação | `Notification`                                                                             | ✅ Correspondência exata  | Tipo: `permission_prompt`, `idle_prompt`, `auth_success`       |
| Eventos de Compactação      | `PreCompact`                                                                               | ✅ Correspondência exata  | Gatilho: `manual`, `auto`                                      |
| Eventos de Todo         | `TodoCreated`, `TodoCompleted`                                                             | ❌ Não           | N/A                                                            |
| Eventos de Prompt       | `UserPromptSubmit`                                                                         | ❌ Não           | N/A                                                            |
| Eventos de Stop         | `Stop`                                                                                     | ❌ Não           | N/A                                                            |
| Message Display     | `MessageDisplay`                                                                           | ❌ Não           | N/A                                                            |

**Sintaxe do Matcher:**

- String vazia `""` ou `"*"` corresponde a todos os eventos desse tipo
- Sintaxe padrão de regex suportada (por exemplo, `^run_shell_command$`, `read_.*`, `(write_file|edit)`)
- Hooks de ferramenta recebem o tool id de runtime em `tool_name` (por exemplo, `write_file`). Nomes de exibição built-in como `WriteFile` e `ReadFile` também são aceitos como aliases de matcher para compatibilidade, mas novas configurações devem preferir os tool ids de runtime.

**Exemplos:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
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

Todos os executores de hook recebem a entrada padronizada do evento. O limite de entrega depende do executor:

| Tipo de hook | Destinatário da entrada                                         |
| :--------- | :-------------------------------------------------------------- |
| `command`  | Processo filho através de JSON no `stdin`                       |
| `http`     | Endpoint configurado através de um corpo `POST` JSON            |
| `function` | Callback confiável in-process                                   |
| `prompt`   | Provedor de modelo configurado após a entrada substituir `$ARGUMENTS` |

Hooks de função são código confiável executando no processo do Qwen. Eles recebem um objeto in-process, então campos não devem ser tratados como imutáveis contra um hook de função.

O Qwen não controla se um processo de hook, endpoint, callback ou provedor de modelo retém ou encaminha sua entrada. Revise a política de tratamento de dados de cada executor configurado.

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

A entrada do hook é um contrato JSON extensível para frente: novos campos opcionais podem ser adicionados a eventos existentes. Consumidores devem ignorar campos desconhecidos. Um decodificador estrito que rejeita propriedades desconhecidas deve ser atualizado para permitir explicitamente cada novo campo opcional antes de atualizar o Qwen Code. Para hooks sensíveis à segurança, uma falha do decodificador pode alterar o comportamento fail-open ou fail-closed, então administradores devem validar o payload atualizado contra o hook implantado antes do rollout.

### Estrutura de Saída do Hook

A saída do hook é retornada via `stdout` (command) ou corpo da resposta HTTP (http) como JSON.

**Comportamento do Código de Saída (Hooks de Comando):**

| Código de Saída | Comportamento                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Sucesso. Analisa o JSON no `stdout` para controlar o comportamento.                                  |
| `2`       | **Erro de bloqueio**. Ignora o `stdout`, passa o `stderr` como feedback de erro para o modelo. |
| Other     | Erro não bloqueante. O `stderr` é exibido apenas no modo de depuração, a execução continua.           |

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
- `hookSpecificOutput.updatedInput`: parâmetros de entrada da ferramenta modificados para usar em vez do original
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

O valor de `permissionDecision` controla se a ferramenta é executada:

- `"allow"` — executa a ferramenta sem o prompt de aprovação usual.
- `"deny"` — bloqueia a ferramenta; ela não é executada e um erro é retornado ao modelo.
- `"ask"` — pausa e pede ao usuário para confirmar a chamada da ferramenta na TUI antes que ela seja executada. Confirmar executa a ferramenta uma vez; recusar a cancela. Em contextos que não podem pedir confirmação — execuções headless (`--prompt`) e subagentes em segundo plano — `"ask"` reverte para `"deny"`.

Para `"ask"`, a TUI exibe `permissionDecisionReason` como texto literal em vez de interpretar Markdown inline. Isso mantém marcadores de formatação e targets de links visíveis para o usuário.

**Nota**: Embora campos padrão de saída de hook como `decision` e `reason` sejam tecnicamente suportados pela classe subjacente, a interface oficial espera o `hookSpecificOutput` com `permissionDecision` e `permissionDecisionReason`.

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

**Propósito**: Executado após uma ferramenta ser concluída com sucesso para processar resultados, registrar ocorrências ou injetar contexto adicional.

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

- `decision`: "allow", "deny", "block" (o padrão é "allow" se não especificado)
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

**Propósito**: Executado antes de invocações de modelo suportadas para validar, bloquear ou enriquecer o prompt vinculado ao modelo atual. O evento atualmente cobre envios `UserQuery`, `ToolResult` e `Hook`, enquanto envios `Retry`, `Steer`, `Cron`, `Notification` e `Teammate` são ignorados. Ele pode, portanto, ocorrer em caminhos de continuação, e `prompt` não deve ser considerado como entrada bruta do usuário.

**Campos específicos do evento**:

```json
{
  "prompt": "prompt vinculado ao modelo atual para esta invocação do hook",
  "submitted_prompt": "texto opcional do usuário capturado em uma borda de submissão interativa suportada pela TUI"
}
```

`submitted_prompt` é opcional. Está presente apenas quando o Qwen pode carregar proveniência de uma submissão interativa suportada pela TUI para um `UserQuery` fresco. É omitido para produtores não suportados e caminhos automáticos como steering no mesmo turno, continuações de resultado de ferramenta, retentativas, cron, notificações e tráfego de teammate. Caminhos ACP, headless, `serve`, SDK e entrada remota não o produzem nesta versão.

Entrada diferida pode reter o campo quando sua proveniência permanece completa. Um batch combinado retém proveniência apenas quando cada item constituinte a possui; entrada editada, parcialmente conhecida ou de outra forma ambígua omite o campo. Navegação de prompt, comando e histórico do shell ou matches de busca selecionados, restaurações de stash entre reinícios e restaurações de rewind de conversa também o omitem porque esses caminhos podem surface texto vinculado ao modelo sem sua proveniência original. Consumidores que requerem texto submetido pelo usuário devem tratar ausência como indisponível em vez de fazer fallback para `prompt`.

Após entrada vinculada ao modelo restaurada ou sem proveniência disponível ser limpa ou submetida, o compositor também limpa seu histórico de undo e redo. Isso impede que o undo restaure texto expandido após seu marcador ou sidecar ter sido consumido.

Placeholders de colagem grande permanecem compactos em `submitted_prompt`; o conteúdo colado expandido aparece apenas em `prompt`. Consumidores devem tratar o campo como uma projeção de texto da TUI em vez de um registro byte-a-byte da entrada da área de transferência.

Qualquer entrada não vazia presente enquanto o modo Vim está habilitado omite `submitted_prompt`, inclusive após o Vim ser desabilitado, porque registradores do Vim não carregam proveniência nesta versão. Esta regra conservadora também cobre rascunhos inseridos antes de habilitar o Vim. Limpar o compositor inicia uma nova entrada elegível.

Este campo é proveniência, não autenticação, identidade de tenant, autorização ou DLP. São dados fornecidos pelo chamador. Cada executor configurado para este evento os recebe; em particular, hooks HTTP os enviam para seu endpoint e hooks de prompt os enviam para seu provedor de modelo.

Quando ambos os campos estão presentes, payloads de hook de prompt contêm texto sobreposto e podem consumir tokens de entrada do modelo adicionais. Não há supressão de campo por hook nesta versão.

Hooks UserPromptSubmit sequenciais podem anexar `additionalContext` ao `prompt`; `submitted_prompt` continua representando a submissão capturada. Hooks de função são código confiável no mesmo processo e não são restritos por uma garantia de imutabilidade.

Quando a saída final do hook contém `additionalContext` não vazio, o Qwen primeiro sanitiza o valor e então o envia ao modelo como uma parte de texto separada:

```xml
<qwen:user-prompt-submit-context>
contexto do hook sanitizado
</qwen:user-prompt-submit-context>
```

A tag indica ao modelo e aos consumidores da transcrição que a parte veio de um hook configurado em vez de vir do prompt do usuário. É um marcador de proveniência, não autenticação, autorização ou um limite geral de confiança.

Para um `UserQuery` com esse contexto adicionado, o registro JSONL da sessão preserva as partes vinculadas ao modelo, incluindo a parte com tag, e adiciona o seguinte `systemPayload`:

```json
{
  "displayText": "projeção de exibição pré-hook",
  "hookContext": "contexto do hook sanitizado"
}
```

Esse payload de dois campos é escrito apenas para este tipo de registro de prompt do usuário. `hookContext` duplica intencionalmente a parte com tag para que consumidores offline e de terceiros possam identificar sua proveniência sem analisar o texto do modelo. `displayText` é a projeção de exibição pré-hook e nunca inclui o contexto do hook. Para uma submissão interativa suportada pela TUI, é a projeção bruta do compositor carregada por `submitted_prompt`; caminhos ACP, headless, `serve`, SDK, entrada remota e outros sem essa proveniência registram o prompt expandido pré-hook em vez disso.

Consumidores de exibição de transcrição tratam `displayText` como essa projeção de prompt do usuário quando `systemPayload.hookContext` é uma string. Para compatibilidade com registros de prompt do usuário lançados apenas com `displayText`, um contexto com tag completo na parte final após pelo menos uma outra parte é evidência de pareamento equivalente. Registros de notificação, cron e meio de turno também podem ter `displayText`, mas esses valores são rótulos de exibição compactos e não devem ser substituídos pelo texto vinculado ao modelo sem essa evidência.
Registros legados com contexto bruto mantêm seu comportamento de exibição vinculado ao modelo porque o contexto não pode ser separado de forma confiável. Para registros sem metadados que usam a forma com tag atual, consumidores de compatibilidade podem remover a mesma parte final com tag completa; não devem inferir que texto arbitrário semelhante a tag do usuário é proveniência de hook.

Atributos sensíveis de telemetria de prompt, quando habilitados, e a recordação de auto-memória gerenciada ambos usam o prompt pré-hook. Eles não incluem o contexto adicionado por `UserPromptSubmit`.

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível por humanos para a decisão
- `hookSpecificOutput.additionalContext`: contexto adicional para anexar ao prompt (opcional)

Quando enviado ao modelo, o `additionalContext` injetado é anexado como sua própria parte de mensagem envolvida em uma tag reservada `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`, para que permaneça distinguível do texto de autoria do usuário no histórico do modelo e nas transcrições da sessão. Colchetes angulares na saída do hook são escapados antes do envolvimento, então o conteúdo do hook não pode fechar ou forjar a tag. A transcrição da sessão também registra o texto original do prompt do usuário separadamente; a TUI interativa e o caminho de replay de transcrição ACP/export exibem esse texto original em vez do contexto injetado.

**Nota**: Como UserPromptSubmitOutput estende HookOutput, todos os campos padrão estão disponíveis, mas apenas additionalContext em hookSpecificOutput é especificamente definido para este evento.

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

#### SessionDelete

**Propósito**: Executado após uma sessão explicitamente selecionada ter sido permanentemente excluída. Este evento é fire-and-forget: saída e falhas não podem desfazer a exclusão.

**Campos específicos do evento**:

```json
{
  "deleted_session_id": "a sessão que foi excluída"
}
```

O hook usa os campos de sessão normais do runtime de exclusão (`session_id`, `transcript_path` e `cwd`); via ACP, `transcript_path` está vazio porque o runtime de exclusão não tem transcrição própria. `SessionDelete` atualmente dispara para o fluxo interativo `/delete` e o método `deleteSession` explícito do ACP; exclusão em batch via daemon REST e limpeza interna não o emitem.

#### MessageDisplay

**Propósito**: Dispara repetidamente enquanto a resposta do assistente é transmitida — antes do `Stop`, que dispara uma vez no final do turno. Útil para narração ao vivo, logging incremental ou qualquer consumidor que queira reagir à resposta enquanto ela é escrita em vez de depois. Este é um evento **fire-and-forget** - a saída do hook e os códigos de saída são ignorados.

**Campos específicos do evento**:

```json
{
  "message_id": "id estável para toda a mensagem transmitida",
  "displayed_text": "o texto CUMULATIVO transmitido até agora para esta mensagem (não um delta)",
  "is_final": "true no último disparo para esta mensagem, false caso contrário"
}
```

`displayed_text` é cumulativo em vez de um delta para que scripts de hook nunca precisem remontar chunks themselves — cada disparo carrega o texto completo até agora. O disparo é debounced (no máximo a cada ~200ms), exceto pelo disparo final (`is_final: true`), que sempre dispara uma vez que a mensagem termina, então a cauda da resposta nunca é perdida esperando a janela de debounce.

**Semântica de entrega** — o que um script de hook pode confiar:

- **Hooks lentos veem payloads menos e mais novos.** No máximo uma execução de hook mid-stream por mensagem está em voo por vez; enquanto uma executa, payloads debounced mais novos _substituem_ o enfileirado em vez de se acumularem atrás dele. Um hook mais lento que a janela de debounce portanto pula snapshots intermediários — sem perdas, já que cada payload carrega o texto cumulativo completo.
- **`is_final` nunca é enfileirado atrás de uma entrega obsoleta.** O payload final é despachado no momento em que a mensagem termina — ao lado de uma execução mid-stream ainda em execução, se houver (a única exceção à regra de um por vez, justificada da mesma forma: o texto cumulativo final estritamente suplanta o que aquela execução está processando). Seu hook sempre recebe o payload `is_final`, e o recebe antes do hook `Stop` disparar. Uma consequência para hooks com estado: quando a execução final se sobrepõe a uma mid-stream superseded, sua ordem de _conclusão_ é não especificada — a execução obsoleta pode terminar depois da final (mesmo após o `Stop`). Trate `is_final` como terminal por `message_id` e deixe o texto cumulativo vencer, em vez de assumir que a última execução a terminar carrega o estado mais novo.
- **O turno espera a entrega de `is_final` completar — mas não para sempre.** O fim do turno (e o hook `Stop`, quando dispara) espera até 5 segundos para a entrega final terminar. Um hook que completar dentro desse orçamento mantém a garantia mais forte: uma execução headless (`qwen -p ...`) sai apenas após o hook terminar, e a execução `is_final` completa antes do `Stop` iniciar. Um hook mais lento ainda recebe `is_final` primeiro — apenas a espera por sua conclusão é limitada: na TUI ou em uma sessão ACP a execução simplesmente termina em segundo plano, enquanto uma execução headless sai sem esperar. O processo do hook não é morto na saída; é deixado para terminar por conta própria, então um script encadeando `qwen -p … && next-step` pode observar `next-step` iniciando enquanto um hook lento ainda está executando. Atingir esse timeout imprime um aviso no stderr.
- **Comportamento de cancelamento depende do timing.** Um turno cancelado _antes dos disparos de `is_final`_ não dispara `is_final` — a mensagem é tratada como abandonada, e um consumidor que faz buffer até `is_final` deve tratar o silêncio do cancelamento como seu sinal de flush/descarte (ex.: um fallback de timeout). O critério é o estado do sinal de abort no momento em que o turno termina, não se cada chunk já tinha sido transmitido — um abort chegando na breve lacuna antes dessa verificação ainda pode suprimir `is_final` para uma mensagem cujo texto já tinha, na prática, terminado de chegar. Cancelar _após `is_final` ter disparado_ (durante a espera de drain) é diferente: a execução do hook ainda em execução pode ser terminada mid-flight (SIGTERM), mas o payload em si já foi entregue.
- **`displayed_text` é provisório até `is_final`.** Reflete o que foi transmitido até agora; trate payloads intermediários como estado de exibição, não como conteúdo final autorizativo.
- **Um turno que usa ferramentas produz múltiplas mensagens.** Cada chamada de modelo recebe seu próprio `message_id` com seu próprio disparo `is_final: true`: o texto antes de uma chamada de ferramenta é uma mensagem, a continuação após o resultado da ferramenta é outra. Chamadas de modelo que não produzem texto exibido (apenas chamada de ferramenta) não disparam nada.

**Nota**: Dispara na TUI, headless (`-p`) e sessões ACP (IDE/editor/`qwen serve`), com o mesmo contrato de payload em cada superfície.

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

Os campos `context_usage`, `context_limit` e `input_tokens` permitem que scripts de hook observem o uso do contexto e implementem estratégias de compactação personalizadas — por exemplo, um script que imprime um lembrete para executar `/compact` quando o uso excede um limite personalizado.

**Opções de Saída**:

- `decision`: "allow", "deny", "block" ou "ask"
- `reason`: explicação legível por humanos para a decisão
- `stopReason`: feedback a ser incluído na resposta de parada
- `continue`: defina como false para parar a execução
- `hookSpecificOutput.additionalContext`: informações de contexto adicionais

**Nota**: Como StopOutput estende HookOutput, todos os campos padrão estão disponíveis, mas o campo stopReason é particularmente relevante para este evento.

**Exemplo de Saída**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Propósito**: Executado quando o turno termina devido a um erro de API ou detecção de loop (em vez de Stop). Este é um evento **fire-and-forget** - a saída do hook e os códigos de saída são ignorados.

**Campos específicos do evento**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```
**Matcher**: Faz a correspondência com o campo `error`. Por exemplo, `"matcher": "rate_limit"` será acionado apenas para erros de limite de taxa.

**Opções de Saída**:

- **None** - O StopFailure é fire-and-forget. Toda a saída do hook e os códigos de saída são ignorados.

**Tratamento de Código de Saída**:

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Any       | Ignorado (fire-and-forget) |

**Configuração de Exemplo**:

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
- Notificações de erro de faturamento
- Coleta de estatísticas de erros

#### SubagentStart

**Propósito**: Executado quando um subagente (como a ferramenta Task) é iniciado para configurar o contexto ou as permissões.

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
- Campos de saída padrão do hook

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
- Campos de saída padrão do hook

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

**Matcher**: Faz a correspondência com o campo `trigger`. Por exemplo, `"matcher": "manual"` será acionado apenas para compactação manual via comando `/compact`.

**Opções de Saída**:

- `hookSpecificOutput.additionalContext`: contexto adicional (apenas para registro)
- Campos de saída padrão do hook (apenas para registro)

**Nota**: O PostCompact **não** está na lista oficial de eventos suportados pelo modo de decisão. O campo `decision` e outros campos de controle não produzem efeitos de controle - eles são usados apenas para fins de registro.

**Tratamento de Código de Saída**:

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Sucesso - stdout mostrado ao usuário no modo verbose            |
| Other     | Erro não bloqueante - stderr mostrado ao usuário no modo verbose |

**Configuração de Exemplo**:

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

- `hookSpecificOutput.additionalContext`: informações adicionais a serem incluídas
- Campos de saída padrão do hook

**Exemplo de Saída**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Propósito**: Executado quando as caixas de diálogo de permissão são exibidas para automatizar decisões ou atualizar permissões.

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

Durante a fase de `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a criação do todo é impedida. A lista de todos permanece inalterada e o motivo é fornecido como feedback para o modelo.

Durante a fase de `postWrite`, o todo já foi persistido. Os hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a gravação e não deve ser usado para validação.

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

**Configuração de Exemplo**:

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

Durante a fase de `validation`, quando `decision` é `block` ou `deny` (código de saída 2), a conclusão do todo é impedida. O item de todo permanece em seu status anterior e o motivo é fornecido como feedback para o modelo.

Durante a fase de `postWrite`, o todo já foi persistido. Os hooks ainda podem retornar saída, mas `block` / `deny` não desfaz a gravação e não deve ser usado para validação.

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

**Configuração de Exemplo**:

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

- **Registro**: Rastreia a criação e conclusão de todos para auditoria ou análise
- **Validação**: Aplica padrões de qualidade de conteúdo (tamanho mínimo, palavras-chave obrigatórias)
- **Controle de Fluxo de Trabalho**: Bloqueia a conclusão até que os pré-requisitos sejam atendidos
- **Integração**: Sincroniza todos com sistemas externos de gerenciamento de tarefas (Jira, Trello, etc.)

## Configuração de Hook

Os hooks são configurados nas configurações do Qwen Code, geralmente em `.qwen/settings.json` ou arquivos de configuração do usuário:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
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

- Por padrão, os hooks são executados em paralelo para um melhor desempenho
- Use `sequential: true` na definição do hook para forçar a execução dependente de ordem
- Hooks sequenciais podem modificar a entrada para os hooks subsequentes na cadeia

### Hooks Assíncronos

Apenas o tipo `command` suporta execução assíncrona. Definir `"async": true` executa o hook em segundo plano sem bloquear o fluxo principal.

**Recursos:**

- Não pode retornar o controle de decisão (a operação já ocorreu)
- Os resultados são injetados no próximo turno da conversa via `systemMessage` ou `additionalContext`
- Adequado para auditoria, logging, testes em segundo plano, etc.

**Exemplo:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write_file|edit",
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
- Hooks no nível do projeto requerem status de pasta confiável
- Timeouts previnem que hooks fiquem travados (padrão: 60 segundos)

## Boas Práticas

### Exemplo 1: Hook de Validação de Segurança

Um hook PreToolUse que registra em log e potencialmente bloqueia comandos perigosos:

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

### Exemplo 3: Hook de Validação de Prompt Submetido pela TUI Interativa

Para inspecionar o conteúdo vinculado ao modelo atual, leia `prompt`. Esse campo pode incluir conteúdo gerado ou expandido, não é a entrada original do usuário e não implica que `UserPromptSubmit` cubra todo envio do modelo. Não faça fallback silencioso de `submitted_prompt` para `prompt` quando a proveniência da fonte for necessária.

Um hook UserPromptSubmit que valida submissões interativas suportadas pela TUI em busca de informações sensíveis e fornece contexto para prompts longos. Ele ignora invocações onde a proveniência da fonte não está disponível. A verificação de palavras-chave é ilustrativa e não é uma política DLP completa:

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
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

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
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## Solução de Problemas

- Verifique os logs da aplicação para detalhes da execução do hook
- Verifique as permissões e a capacidade de execução do script do hook
- Certifique-se de que a formatação JSON nas saídas do hook esteja correta
- Use padrões de matcher específicos para evitar a execução não intencional de hooks
- Use o modo `--debug` para ver informações detalhadas de correspondência e execução de hooks. Entradas de hook de prompt podem ser escritas no log de debug da sessão, então aplique controles apropriados de acesso e retenção.
- Desative temporariamente todos os hooks: adicione `"disableAllHooks": true` nas configurações