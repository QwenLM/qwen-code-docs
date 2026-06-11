# SDK TypeScript

## @qwen-code/sdk

Um SDK TypeScript experimental e mínimo para acesso programático ao Qwen Code.

Sinta-se à vontade para enviar solicitações de funcionalidade, issues ou PRs.

## Instalação

```bash
npm install @qwen-code/sdk
```

## Requisitos

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (estável) instalado e acessível no PATH

> **Nota para usuários do nvm**: Se você usa o nvm para gerenciar versões do Node.js, o SDK pode não conseguir detectar automaticamente o executável do Qwen Code. Você deve definir explicitamente a opção `pathToQwenExecutable` com o caminho completo do binário `qwen`.

## Início Rápido

```typescript
import { query } from '@qwen-code/sdk';

// Consulta de turno único
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Itera sobre as mensagens
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

| Option                   | Type                                           | Default          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | O diretório de trabalho para a sessão de consulta. Determina o contexto no qual as operações de arquivo e comandos são executados.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | O modelo de IA a ser usado (ex: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Tem precedência sobre as variáveis de ambiente `OPENAI_MODEL` e `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Auto-detected    | Caminho para o executável do Qwen Code. Suporta múltiplos formatos: `'qwen'` (binário nativo do PATH), `'/path/to/qwen'` (caminho explícito), `'/path/to/cli.js'` (pacote Node.js), `'node:/path/to/cli.js'` (força runtime Node.js), `'bun:/path/to/cli.js'` (força runtime Bun). Se não fornecido, detecta automaticamente a partir de: variável de ambiente `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Modo de permissão que controla a aprovação da execução de ferramentas. Consulte [Modos de Permissão](#permission-modes) para detalhes.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Handler de permissão personalizado para aprovação da execução de ferramentas. Invocado quando uma ferramenta requer confirmação. Deve responder em até 60 segundos ou a solicitação será negada automaticamente. Consulte [Handler de Permissão Personalizado](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variáveis de ambiente a serem passadas para o processo do Qwen Code. Mescladas com o ambiente do processo atual.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Configuração do prompt de sistema para a sessão principal. Use uma string para substituir completamente o prompt de sistema integrado do Qwen Code, ou um objeto preset para manter o prompt integrado e adicionar instruções extras.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Servidores MCP (Model Context Protocol) para conexão. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores do SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e liberar recursos.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Ativa o modo de depuração para logs detalhados do processo CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unlimited) | Número máximo de turnos de conversa antes que a sessão seja encerrada automaticamente. Um turno consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Equivalente a `tool.core` no settings.json. Se especificado, apenas essas ferramentas estarão disponíveis para a IA. Exemplo: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | Equivalente a `tool.exclude` no settings.json. Ferramentas excluídas retornam um erro de permissão imediatamente. Tem a maior prioridade sobre todas as outras configurações de permissão. Suporta correspondência de padrões: nome da ferramenta (`'write_file'`), classe da ferramenta (`'ShellTool'`) ou prefixo de comando shell (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Equivalente a `tool.allowed` no settings.json. Ferramentas correspondentes ignoram o callback `canUseTool` e são executadas automaticamente. Aplica-se apenas quando a ferramenta requer confirmação. Suporta a mesma correspondência de padrões que `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Tipo de autenticação para o serviço de IA. O uso de `'qwen-oauth'` no SDK não é recomendado, pois as credenciais são armazenadas em `~/.qwen` e podem precisar de atualização periódica.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuração para subagentes que podem ser invocados durante a sessão. Subagentes são agentes de IA especializados para tarefas ou domínios específicos.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Quando `true`, o SDK emite mensagens incompletas à medida que são geradas, permitindo o streaming em tempo real da resposta da IA.                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

O SDK aplica os seguintes timeouts padrão:

| Timeout          | Default  | Description                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minute | Tempo máximo para o callback `canUseTool` responder. Se excedido, a solicitação da ferramenta é negada automaticamente.                                                  |
| `mcpRequest`     | 1 minute | Tempo máximo para chamadas de ferramentas MCP do SDK serem concluídas.                                                                                                  |
| `controlRequest` | 1 minute | Tempo máximo para operações de controle como `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` e `interrupt()` serem concluídas. |
| `streamClose`    | 1 minute | Tempo máximo de espera para a inicialização ser concluída antes de fechar o stdin do CLI no modo multi-turno com servidores MCP do SDK.                             |

Você pode personalizar esses timeouts por meio da opção `timeout`:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 segundos para callback de permissão
    mcpRequest: 600000, // 10 minutos para chamadas de ferramentas MCP
    controlRequest: 60000, // 60 segundos para solicitações de controle
    streamClose: 15000, // 15 segundos para espera de fechamento do stream
  },
});
```

### Tipos de Mensagem

O SDK fornece type guards para identificar diferentes tipos de mensagem:

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
    // Lida com mensagem do assistente
  } else if (isSDKResultMessage(message)) {
    // Lida com mensagem de resultado
  }
}
```

### Métodos da Instância Query

A instância `Query` retornada por `query()` fornece vários métodos:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Obtém o ID da sessão
const sessionId = q.getSessionId();

// Verifica se está fechado
const closed = q.isClosed();

// Interrompe a operação atual
await q.interrupt();

// Altera o modo de permissão no meio da sessão
await q.setPermissionMode('yolo');

// Altera o modelo no meio da sessão
await q.setModel('qwen-max');

// Obtém o detalhamento do uso da janela de contexto (contagem de tokens por categoria)
const usage = await q.getContextUsage();
// Passe true para indicar que os detalhes por item devem ser exibidos
const detail = await q.getContextUsage(true);

// Fecha a sessão
await q.close();
```

## Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de escrita são negadas, a menos que aprovadas via callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura são executadas sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (edit, write_file), enquanto outras ferramentas requerem confirmação.
- **`yolo`**: Todas as ferramentas são executadas automaticamente sem confirmação.

### Cadeia de Prioridade de Permissões

1. `excludeTools` - Bloqueia ferramentas completamente
2. `permissionMode: 'plan'` - Bloqueia ferramentas que não são somente leitura
3. `permissionMode: 'yolo'` - Aprova automaticamente todas as ferramentas
4. `allowedTools` - Aprova automaticamente ferramentas correspondentes
5. Callback `canUseTool` - Lógica de aprovação personalizada
6. Comportamento padrão - Nega automaticamente no modo SDK

## Exemplos

### Conversa Multi-turno

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Aguarda alguma condição ou entrada do usuário
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

### Handler de Permissão Personalizado

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Permite todas as operações de leitura
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Solicita ao usuário para operações de escrita (em um app real)
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

### Anexar ao Prompt de Sistema Integrado

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

### Com Servidores MCP Embutidos no SDK

O SDK fornece `tool` e `createSdkMcpServer` para criar servidores MCP que rodam no mesmo processo da sua aplicação SDK. Isso é útil quando você deseja expor ferramentas personalizadas à IA sem executar um processo de servidor separado.

#### `tool(name, description, inputSchema, handler)`

Cria uma definição de ferramenta com inferência de tipo de esquema Zod.

| Parameter     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Nome da ferramenta (1-64 caracteres, começa com letra, alfanuméricos e underscores) |
| `description` | `string`                           | Descrição legível por humanos do que a ferramenta faz                         |
| `inputSchema` | `ZodRawShape`                      | Objeto de esquema Zod que define os parâmetros de entrada da ferramenta                   |
| `handler`     | `(args, extra) => Promise<Result>` | Função assíncrona que executa a ferramenta e retorna blocos de conteúdo MCP     |

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

Cria uma instância de servidor MCP embutida no SDK.

| Option    | Type                     | Default   | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Required  | Nome único para o servidor MCP       |
| `version` | `string`                 | `'1.0.0'` | Versão do servidor                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Array de ferramentas criadas com `tool()` |

Retorna um objeto `McpSdkServerConfigWithInstance` que pode ser passado diretamente para a opção `mcpServers`.

#### Exemplo

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define uma ferramenta com esquema Zod
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Cria o servidor MCP
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Usa o servidor em uma consulta
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

// Aborta após 5 segundos
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
  // ... operações de consulta
} catch (error) {
  if (isAbortError(error)) {
    // Lida com o abort
  } else {
    // Lida com outros erros
  }
}
```