# SDK TypeScript

## @qwen-code/sdk

Um SDK TypeScript experimental mínimo para acesso programático ao Qwen Code.

Sinta-se à vontade para enviar uma solicitação de funcionalidade/issue/PR.

## Instalação

```bash
npm install @qwen-code/sdk
```

## Requisitos

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (estável) instalado e acessível no PATH

> **Nota para usuários do nvm**: Se você usa o nvm para gerenciar versões do Node.js, o SDK pode não conseguir detectar automaticamente o executável do Qwen Code. Você deve definir explicitamente a opção `pathToQwenExecutable` para o caminho completo do binário `qwen`.

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

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - O prompt a ser enviado. Use uma string para consultas de turno único ou um iterável assíncrono para conversas de múltiplos turnos.
- `options`: `QueryOptions` - Opções de configuração para a sessão de consulta.

#### QueryOptions

| Opção                     | Tipo                                           | Padrão            | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`   | O diretório de trabalho para a sessão de consulta. Determina o contexto no qual as operações de arquivo e comandos são executados.                                                                                                                                                                                                                                                                                                                                                   |
| `model`                  | `string`                                       | -                 | O modelo de IA a ser usado (ex.: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Tem precedência sobre as variáveis de ambiente `OPENAI_MODEL` e `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                         |
| `pathToQwenExecutable`   | `string`                                       | Detecção automática | Caminho para o executável do Qwen Code. Suporta vários formatos: `'qwen'` (binário nativo do PATH), `'/path/to/qwen'` (caminho explícito), `'/path/to/cli.js'` (pacote Node.js), `'node:/path/to/cli.js'` (força runtime Node.js), `'bun:/path/to/cli.js'` (força runtime Bun). Se não for fornecido, detecta automaticamente a partir de: variável de ambiente `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`       | Modo de permissão que controla a aprovação de execução de ferramentas. Consulte [Modos de Permissão](#permission-modes) para detalhes.                                                                                                                                                                                                                                                                                                                                               |
| `canUseTool`             | `CanUseTool`                                   | -                 | Manipulador de permissão personalizado para aprovação de execução de ferramentas. Invocado quando uma ferramenta requer confirmação. Deve responder em até 60 segundos ou a solicitação será negada automaticamente. Consulte [Manipulador de Permissão Personalizada](#custom-permission-handler).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                 | Variáveis de ambiente a serem passadas para o processo do Qwen Code. Mescladas com o ambiente do processo atual.                                                                                                                                                                                                                                                                                                                                                                    |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                 | Configuração do prompt do sistema para a sessão principal. Use uma string para substituir completamente o prompt do sistema interno do Qwen Code, ou um objeto predefinido para manter o prompt interno e anexar instruções adicionais.                                                                                                                                                                                                                                              |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                 | Servidores MCP (Model Context Protocol) para conectar. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                |
| `abortController`        | `AbortController`                              | -                 | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e limpar recursos.                                                                                                                                                                                                                                                                                                                                                           |
| `debug`                  | `boolean`                                      | `false`           | Habilita o modo de depuração para logging detalhado do processo CLI.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `maxSessionTurns`        | `number`                                       | `-1` (ilimitado)  | Número máximo de turnos de conversa antes da sessão ser encerrada automaticamente. Um turno consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                 | Usa a semântica de lista de permissões `coreTools` legada / CLI `--core-tools`. Se especificado, apenas as ferramentas principais correspondentes são registradas para a sessão. Isso é separado de `permissions.allow`, que aprova automaticamente chamadas de ferramentas correspondentes, mas não restringe o registro de ferramentas. Exemplo: `['read_file', 'edit', 'run_shell_command']`.                                                                                   |
| `excludeTools`           | `string[]`                                     | -                 | Equivalente a `permissions.deny` no settings.json. Ferramentas excluídas retornam um erro de permissão imediatamente. Tem a maior prioridade sobre todas as outras configurações de permissão. Suporta aliases de nome de ferramenta e correspondência de padrões: nome da ferramenta (`'write_file'`), prefixo de comando shell (`'Bash(rm *)'`) ou padrões de caminho (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                          |
| `allowedTools`           | `string[]`                                     | -                 | Equivalente a `permissions.allow` no settings.json. Ferramentas correspondentes ignoram o callback `canUseTool` e executam automaticamente. Aplica-se apenas quando a ferramenta requer confirmação. Suporta a mesma correspondência de padrões que `excludeTools`. Exemplo: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`        | Tipo de autenticação para o serviço de IA. O nível gratuito do Qwen OAuth foi descontinuado em 15/04/2026; novas configurações do SDK devem usar autenticação compatível com OpenAI ou outro provedor suportado.                                                                                                                                                                                                                                                                    |
| `agents`                 | `SubagentConfig[]`                             | -                 | Configuração para subagentes que podem ser invocados durante a sessão. Subagentes são agentes de IA especializados para tarefas ou domínios específicos.                                                                                                                                                                                                                                                                                                                             |
| `includePartialMessages` | `boolean`                                      | `false`           | Quando `true`, o SDK emite mensagens incompletas à medida que são geradas, permitindo streaming em tempo real da resposta da IA.                                                                                                                                                                                                                                                                                                                                                   |
| `resume`                 | `string`                                       | -                 | Retoma uma sessão anterior fornecendo seu ID de sessão. Equivalente à flag `--resume` da CLI.                                                                                                                                                                                                                                                                                                                                                                                       |
| `sessionId`              | `string`                                       | -                 | Especifica um ID de sessão para a nova sessão. Garante que o SDK e a CLI usem o mesmo ID sem retomar o histórico. Equivalente à flag `--session-id` da CLI.                                                                                                                                                                                                                                                                                                                          |
> [!note]
> Para `coreTools`, aliases como `Read`, `Edit` e `Bash` também funcionam, mas especificadores de invocação como `Bash(git *)` são removidos. `coreTools` restringe o registro de ferramentas, não os padrões de invocação.

### Timeouts

O SDK impõe os seguintes timeouts padrão:

| Timeout          | Padrão    | Descrição                                                                                                                                         |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minuto  | Tempo máximo para o callback `canUseTool` responder. Se excedido, a solicitação de ferramenta é negada automaticamente.                           |
| `mcpRequest`     | 1 minuto  | Tempo máximo para chamadas de ferramentas MCP do SDK serem concluídas.                                                                            |
| `controlRequest` | 1 minuto  | Tempo máximo para operações de controle como `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` e `interrupt()` concluírem. |
| `streamClose`    | 1 minuto  | Tempo máximo para aguardar a inicialização antes de fechar o stdin do CLI no modo multi-turn com servidores MCP do SDK.                           |

Você pode personalizar esses timeouts através da opção `timeout`:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 seconds for permission callback
    mcpRequest: 600000, // 10 minutes for MCP tool calls
    controlRequest: 60000, // 60 seconds for control requests
    streamClose: 15000, // 15 seconds for stream close wait
  },
});
```

### Tipos de Mensagem

O SDK fornece type guards para identificar diferentes tipos de mensagens:

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

## Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de escrita são negadas a menos que aprovadas via callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura executam sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (`edit`, `write_file`, `notebook_edit`) enquanto outras ferramentas requerem confirmação.
- **`yolo`**: Todas as ferramentas executam automaticamente sem confirmação.

### Cadeia de Prioridade de Permissão

Prioridade de decisão (maior primeiro): `deny` > `ask` > `allow` > _(padrão/modo interativo)_

A primeira regra que corresponde vence.

1. `excludeTools` / `permissions.deny` - Bloqueia ferramentas completamente (retorna erro de permissão)
2. `permissions.ask` - Sempre requer confirmação do usuário
3. `permissionMode: 'plan'` - Bloqueia todas as ferramentas que não são somente leitura
4. `permissionMode: 'yolo'` - Aprova automaticamente todas as ferramentas
5. `allowedTools` / `permissions.allow` - Aprova automaticamente ferramentas correspondentes
6. Callback `canUseTool` - Lógica de aprovação personalizada (se fornecido, não é chamado para ferramentas permitidas)
7. Comportamento padrão - Nega automaticamente no modo SDK (ferramentas de escrita requerem aprovação explícita)

## Exemplos

### Conversa Multi-turn

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Crie um arquivo hello.txt' },
    parent_tool_use_id: null,
  };

  // Wait for some condition or user input
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Agora leia o arquivo de volta' },
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
  const userApproved = await promptUser(`Permitir ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Usuário negou a operação' };
};

const result = query({
  prompt: 'Crie um novo arquivo',
  options: {
    canUseTool,
  },
});
```
### Com Servidores MCP Externos

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use a ferramenta personalizada do meu servidor MCP',
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

### Sobrescrever o Prompt de Sistema

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Diga olá em uma frase.',
  options: {
    systemPrompt: 'Você é um assistente conciso. Responda em exatamente uma frase.',
  },
});
```

### Adicionar ao Prompt de Sistema Interno

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Revise o diretório atual.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Seja conciso e foque em descobertas concretas.',
    },
  },
});
```

### Com Servidores MCP Incorporados ao SDK

O SDK fornece `tool` e `createSdkMcpServer` para criar servidores MCP que executam no mesmo processo que sua aplicação SDK. Isso é útil quando você quer expor ferramentas personalizadas para a IA sem executar um processo de servidor separado.

#### `tool(nome, descrição, inputSchema, handler)`

Cria uma definição de ferramenta com inferência de tipo de esquema Zod.

| Parâmetro    | Tipo                               | Descrição                                                            |
| ------------ | ---------------------------------- | -------------------------------------------------------------------- |
| `name`       | `string`                           | Nome da ferramenta (1-64 caracteres, começa com letra, alfanumérico e sublinhados) |
| `description`| `string`                           | Descrição legível do que a ferramenta faz                            |
| `inputSchema`| `ZodRawShape`                      | Objeto de esquema Zod definindo os parâmetros de entrada da ferramenta |
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

#### `createSdkMcpServer(opções)`

Cria uma instância de servidor MCP incorporada ao SDK.

| Opção     | Tipo                     | Padrão    | Descrição                            |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Obrigatório | Nome único para o servidor MCP       |
| `version` | `string`                 | `'1.0.0'` | Versão do servidor                   |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Array de ferramentas criadas com `tool()` |

Retorna um objeto `McpSdkServerConfigWithInstance` que pode ser passado diretamente para a opção `mcpServers`.

#### Exemplo

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define uma ferramenta com esquema Zod
const calculatorTool = tool(
  'calcular_soma',
  'Somar dois números',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Cria o servidor MCP
const server = createSdkMcpServer({
  name: 'calculadora',
  tools: [calculatorTool],
});

// Usa o servidor em uma consulta
const result = query({
  prompt: 'Quanto é 42 + 17?',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculadora: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### Cancelar uma Consulta

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Tarefa de longa duração...',
  options: {
    abortController,
  },
});

// Cancela após 5 segundos
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Consulta cancelada');
  } else {
    throw error;
  }
}
```

## Tratamento de Erros

O SDK fornece uma classe `AbortError` para lidar com consultas canceladas:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... operações de consulta
} catch (error) {
  if (isAbortError(error)) {
    // Lidar com cancelamento
  } else {
    // Lidar com outros erros
  }
}
```
