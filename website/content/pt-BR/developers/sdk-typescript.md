# Typescript SDK

## @qwen-code/sdk

Um SDK TypeScript experimental mínimo para acesso programático ao Qwen Code.

Sinta-se à vontade para enviar uma solicitação de funcionalidade/issue/PR.

## Instalação

```bash
npm install @qwen-code/sdk
```

## Requisitos

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (estável). O SDK usa sua CLI integrada por padrão; defina `pathToQwenExecutable` apenas quando precisar executar um binário ou bundle de CLI `qwen` personalizado.

## Início Rápido

```typescript
import { query } from '@qwen-code/sdk';

// Single-turn query
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Iterate over messages
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## Referência da API

### `query(config)`

Cria uma nova sessão de consulta com o Qwen Code.

#### Parâmetros

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - O prompt a enviar. Use uma string para consultas de turno único ou um iterável assíncrono para conversas de múltiplos turnos.
- `options`: `QueryOptions` - Opções de configuração para a sessão de consulta.

#### QueryOptions

| Opção                   | Tipo                                           | Padrão           | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | O diretório de trabalho para a sessão de consulta. Determina o contexto no qual operações de arquivo e comandos são executados.                                                                                                                                                                                                                                                                                                                                                           |
| `model`                  | `string`                                       | -                | O modelo de IA a usar (ex.: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Tem precedência sobre as variáveis de ambiente `OPENAI_MODEL` e `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | CLI integrada  | Caminho para o executável do Qwen Code. Suporta múltiplos formatos: `'qwen'` (binário nativo do PATH), `'/path/to/qwen'` (caminho explícito), `'/path/to/cli.js'` (bundle Node.js), `'node:/path/to/cli.js'` (força runtime Node.js), `'bun:/path/to/cli.js'` (força runtime Bun). Se não fornecido, o SDK usa a CLI integrada incluída no pacote. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`      | Modo de permissão que controla a aprovação de execução de ferramentas. Veja [Modos de Permissão](#modos-de-permissão) para detalhes.                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Manipulador de permissão personalizado para aprovação de execução de ferramentas. É invocado quando uma ferramenta requer confirmação. Deve responder em até 60 segundos ou a solicitação será negada automaticamente. Veja [Manipulador de Permissão Personalizado](#manipulador-de-permissão-personalizado).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variáveis de ambiente a serem passadas para o processo do Qwen Code. Mescladas com o ambiente do processo atual.                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Configuração do prompt de sistema para a sessão principal. Use uma string para substituir completamente o prompt de sistema embutido do Qwen Code, ou um objeto de preset para manter o prompt embutido e acrescentar instruções extras.                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Servidores MCP (Model Context Protocol) para conectar. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e limpar recursos.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Ativa o modo debug para logging verbose do processo CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (ilimitado) | Número máximo de turnos de conversa antes da sessão terminar automaticamente. Deve ser um inteiro. Um turno consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                       |
| `coreTools`              | `string[]`                                     | -                | Usa a semântica legada de allowlist `coreTools` / CLI `--core-tools`. Se especificado, apenas ferramentas principais correspondentes são registradas para a sessão. Esta é a única opção no estilo allowlist que restringe o registro de ferramentas embutidas; uma regra `permissions.deny` / `excludeTools` de ferramenta inteira (e `tools.disabled` no settings.json) também remove uma ferramenta do registro. `permissions.allow` no settings.json é puramente auto-aprovação e nunca remove, rebaixa ou oculta uma ferramenta (#10075). Para manter o schema de uma ferramenta fora da requisição inicial ao modelo, use `tools.eager` no settings.json (requer reinício, #9827) — `tool_search`, `structured_output`, ferramentas do ciclo de vida do modo plan, `task_stop`, ferramentas `mcp__*` e `computer_use__*` são isentas dessa allowlist e mantêm seu carregamento normal; para remover uma ferramenta completamente, use uma regra `excludeTools` / `permissions.deny` de ferramenta inteira — uma regra com um especificador (como `'Bash(rm *)'`) apenas nega invocações correspondentes em tempo de execução. Ferramentas MCP são isentas de remoção baseada em deny: oculte-as com os filtros `excludeTools` / `tools.disabled` por servidor (deny ainda bloqueia suas chamadas em tempo de execução). Exemplo: `['read_file', 'edit', 'run_shell_command']`. |
| `excludeTools`           | `string[]`                                     | -                | Equivalente a `permissions.deny` no settings.json. Ferramentas excluídas retornam um erro de permissão imediatamente. Tem a maior prioridade sobre todas as outras configurações de permissão. Suporta aliases de nomes de ferramentas e correspondência de padrões: nome da ferramenta (`'write_file'`), prefixo de comando shell (`'Bash(rm *)'`), ou padrões de caminho (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                         |
| `allowedTools`           | `string[]`                                     | -                | Equivalente a `permissions.allow` no settings.json para auto-aprovação. Ferramentas correspondentes ignoram o callback `canUseTool` e executam automaticamente. Aplica-se apenas quando a ferramenta requer confirmação. Assim como `permissions.allow`, esta é puramente auto-aprovação e nunca afeta quais ferramentas são registradas ou quais schemas são enviados (#10075). Suporta a mesma correspondência de padrões que `excludeTools`. Exemplo: `['Bash(git status)', 'Bash(npm test)']`. |
| `authType`               | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -                | Tipo de autenticação para o serviço de IA. Quando fornecido, o SDK o encaminha para a CLI como `--auth-type`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuração de subagentes que podem ser invocados durante a sessão. Subagentes são agentes de IA especializados para tarefas ou domínios específicos.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Quando `true`, o SDK emite mensagens incompletas conforme são geradas, permitindo streaming em tempo real da resposta da IA.                                                                                                                                                                                                                                                                                                                                                        |
| `resume`                 | `string`                                       | -                | Retoma uma sessão anterior fornecendo seu ID de sessão. Equivalente à flag `--resume` da CLI.                                                                                                                                                                                                                                                                                                                                                                                           |
| `sessionId`              | `string`                                       | -                | Especifica um ID de sessão para a nova sessão. Garante que SDK e CLI usem o mesmo ID sem retomar o histórico. Equivalente à flag `--session-id` da CLI.                                                                                                                                                                                                                                                                                                                                      |

> [!note]
> Para `coreTools`, aliases como `Read`, `Edit` e `Bash` também funcionam, mas especificadores de invocação como `Bash(git *)` são ignorados. `coreTools` restringe o registro de ferramentas, não padrões de invocação.

### Timeouts

O SDK impõe os seguintes timeouts padrão:

| Timeout          | Padrão  | Descrição                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minuto | Tempo máximo para o callback `canUseTool` responder. Se excedido, a solicitação da ferramenta é negada automaticamente.                                                  |
| `mcpRequest`     | 1 minuto | Tempo máximo para chamadas de ferramentas MCP do SDK serem concluídas.                                                                                                  |
| `controlRequest` | 1 minuto | Tempo máximo para operações de controle como `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` e `interrupt()` serem concluídas. |
| `streamClose`    | 1 minuto | Tempo máximo para aguardar a inicialização antes de fechar a stdin da CLI no modo de múltiplos turnos com servidores MCP do SDK.                             |

Você pode personalizar esses timeouts através da opção `timeout`:

```typescript
import { query } from '@qwen-code/sdk';

const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 60 seconds for permission callback
      mcpRequest: 600000, // 10 minutes for MCP tool calls
      controlRequest: 60000, // 60 seconds for control requests
      streamClose: 15000, // 15 seconds for stream close wait
    },
  },
});
```

### Tipos de Mensagem

O SDK fornece guards de tipo para identificar diferentes tipos de mensagem:

```typescript
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';

for await (const message of result) {
  if (isSDKAssistantMessage(message)) {
    // Handle assistant message
  } else if (isSDKResultMessage(message)) {
    // Handle result message
  }
}
```

### Métodos da Instância Query

A instância `Query` retornada por `query()` fornece vários métodos:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Get session ID
const sessionId = q.getSessionId();

// Check if closed
const closed = q.isClosed();

// Interrupt the current operation
await q.interrupt();

// Change permission mode mid-session
await q.setPermissionMode('yolo');

// Change model mid-session
await q.setModel('qwen-max');

// Get context window usage breakdown (token counts per category)
const usage = await q.getContextUsage();
// Pass true to hint that per-item details should be displayed
const detail = await q.getContextUsage(true);

// Close the session
await q.close();
```

`interrupt()` cancela apenas o turno ativo. Para uma consulta de múltiplos turnos criada com um prompt iterável assíncrono, a consulta e seu stream de entrada permanecem abertos, então mensagens posteriores do iterável são processadas normalmente. Use `close()` ou aborte o `AbortController` configurado quando quiser encerrar toda a sessão.

## IDs de sessão fornecidos pelo chamador no daemon

`DaemonClient.createOrAttachSession` aceita um `sessionId` opcional para chamadores que precisam persistir uma identidade antes da criação da sessão:

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

O SDK requer a capability `session_id_override` do daemon antes de enviar a mutação. O modo REST serializa `sessionId` diretamente; um adapter ACP ativo o mapeia para `session/new._meta["qwen-code/sessionId"]`. O SDK verifica a resposta de sucesso e lança `DaemonSessionIdProtocolError` se o daemon retornar um ID diferente.

Esta opção sempre cria uma nova sessão de thread e não é um attach idempotente. Se o resultado da criação for ambíguo, use o ID conhecido com load ou resume. Omitir a opção preserva o comportamento existente de create-or-attach.

## Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de escrita são negadas a menos que aprovadas via callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura executam sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (`edit`, `write_file`, `notebook_edit`) enquanto outras ferramentas requerem confirmação.
- **`auto`**: Usa o classificador integrado para auto-aprovar chamadas de ferramenta seguras e bloquear as arriscadas, com fallback para aprovação manual após bloqueios repetidos pela política ou falhas do classificador.
- **`yolo`**: Todas as ferramentas executam automaticamente sem confirmação.

### Cadeia de Prioridade de Permissão

Prioridade de decisão (maior primeiro): `deny` > `ask` > `allow` > _(padrão/modo interativo)_

A primeira regra correspondente vence.

1. `excludeTools` / `permissions.deny` - Bloqueia ferramentas completamente (retorna erro de permissão)
2. `permissions.ask` - Sempre requer confirmação do usuário
3. `permissionMode: 'plan'` - Bloqueia todas as ferramentas não somente leitura
4. `permissionMode: 'yolo'` - Aprova automaticamente todas as ferramentas
5. `allowedTools` / `permissions.allow` - Aprova automaticamente ferramentas correspondentes
6. `permissionMode: 'auto'` - Aprovação mediada por classificador para ferramentas restantes
7. Callback `canUseTool` - Lógica de aprovação personalizada (se fornecido, não chamado para ferramentas permitidas)
8. Comportamento padrão - Negar automaticamente no modo SDK (ferramentas de escrita exigem aprovação explícita)

## Exemplos

### Conversa de Múltiplos Turnos

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Wait for some condition or user input
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Now read the file back' },
    parent_tool_use_id: null,
  };
}

const result = query({
  prompt: generateMessages(),
  options: {
    permissionMode: 'auto-edit',
  },
});

for await (const message of result) {
  console.log(message);
}
```

### Manipulador de Permissão Personalizado

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Allow all read operations
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Prompt user for write operations (in a real app)
  const userApproved = await promptUser(`Allow ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'User denied the operation' };
};

const result = query({
  prompt: 'Create a new file',
  options: {
    canUseTool,
  },
});
```

### Com Servidores MCP Externos

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use the custom tool from my MCP server',
  options: {
    mcpServers: {
      'my-server': {
        command: 'node',
        args: ['path/to/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### Substituir o Prompt de Sistema

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### Anexar ao Prompt de Sistema Embutido

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Review the current directory.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Be terse and focus on concrete findings.',
    },
  },
});
```

### Com Servidores MCP Incorporados ao SDK

O SDK fornece `tool` e `createSdkMcpServer` para criar servidores MCP que são executados no mesmo processo que sua aplicação SDK. Isso é útil quando você deseja expor ferramentas personalizadas para a IA sem executar um processo de servidor separado.

#### `tool(name, description, inputSchema, handler)`

Cria uma definição de ferramenta com inferência de tipo de esquema Zod.

| Parâmetro    | Tipo                               | Descrição                                                              |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| `name`       | `string`                           | Nome da ferramenta (1-64 caracteres, começa com letra, alfanumérico e underscores) |
| `description`| `string`                           | Descrição legível do que a ferramenta faz                               |
| `inputSchema`| `ZodRawShape`                      | Objeto de esquema Zod definindo os parâmetros de entrada da ferramenta  |
| `handler`    | `(args, extra) => Promise<Result>` | Função assíncrona que executa a ferramenta e retorna blocos de conteúdo MCP |

O handler deve retornar um objeto `CallToolResult` com a seguinte estrutura:

```typescript
{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  >;
  isError?: boolean;
}
```

#### `createSdkMcpServer(options)`

Cria uma instância de servidor MCP incorporada ao SDK.

| Opção     | Tipo                       | Padrão    | Descrição                           |
| --------- | -------------------------- | --------- | ----------------------------------- |
| `name`    | `string`                   | Obrigatório | Nome único para o servidor MCP      |
| `version` | `string`                   | `'1.0.0'` | Versão do servidor                  |
| `tools`   | `SdkMcpToolDefinition[]`   | -         | Array de ferramentas criadas com `tool()` |

Retorna um objeto `McpSdkServerConfigWithInstance` que pode ser passado diretamente para a opção `mcpServers`.

#### Exemplo

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define a tool with Zod schema
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Create the MCP server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Use the server in a query
const result = query({
  prompt: 'What is 42 + 17?',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculator: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### Abortar uma Consulta

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// Abort after 5 seconds
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## Tratamento de Erros

O SDK fornece uma classe `AbortError` para lidar com consultas abortadas:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... query operations
} catch (error) {
  if (isAbortError(error)) {
    // Handle abort
  } else {
    // Handle other errors
  }
}
```