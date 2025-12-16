# SDK Typescript

## @qwen-code/sdk

Um SDK mínimo experimental em TypeScript para acesso programático ao Qwen Code.

Sinta-se à vontade para enviar uma solicitação de funcionalidade, issue ou PR.

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

// Consulta de única interação
const result = query({
  prompt: 'Quais arquivos estão no diretório atual?',
  options: {
    cwd: '/caminho/para/o/projeto',
  },
});

// Iterar sobre as mensagens
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistente:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Resultado:', message.result);
  }
}
```

## Referência da API

### `query(config)`

Cria uma nova sessão de consulta com o Qwen Code.

#### Parâmetros

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - O prompt a ser enviado. Use uma string para consultas de única interação ou um iterável assíncrono para conversas com múltiplas interações.
- `options`: `QueryOptions` - Opções de configuração para a sessão de consulta.

#### QueryOptions

| Opção                    | Tipo                                           | Padrão           | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | O diretório de trabalho para a sessão de consulta. Determina o contexto no qual operações de arquivo e comandos são executados.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | O modelo de IA a ser usado (ex.: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Tem precedência sobre as variáveis de ambiente `OPENAI_MODEL` e `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Detectado automaticamente | Caminho para o executável do Qwen Code. Suporta múltiplos formatos: `'qwen'` (binário nativo do PATH), `'/caminho/para/qwen'` (caminho explícito), `'/caminho/para/cli.js'` (pacote Node.js), `'node:/caminho/para/cli.js'` (força execução via Node.js), `'bun:/caminho/para/cli.js'` (força execução via Bun). Se não fornecido, é detectado automaticamente a partir de: variável de ambiente `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Modo de permissão que controla a aprovação da execução de ferramentas. Veja [Modos de Permissão](#permission-modes) para mais detalhes.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Manipulador de permissão personalizado para aprovação da execução de ferramentas. É chamado quando uma ferramenta requer confirmação. Deve responder dentro de 60 segundos ou a solicitação será negada automaticamente. Veja [Manipulador de Permissão Personalizado](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variáveis de ambiente a serem passadas para o processo do Qwen Code. Mescladas com o ambiente atual do processo.                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Servidores MCP (Model Context Protocol) aos quais conectar. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores do SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e liberar recursos.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Ativa o modo de depuração para registro detalhado do processo CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (ilimitado) | Número máximo de rodadas de conversação antes que a sessão termine automaticamente. Uma rodada consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Equivalente a `tool.core` no settings.json. Se especificado, apenas essas ferramentas estarão disponíveis para a IA. Exemplo: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | Equivalente a `tool.exclude` no settings.json. Ferramentas excluídas retornam um erro de permissão imediatamente. Tem prioridade máxima sobre todas as outras configurações de permissão. Suporta correspondência por padrão: nome da ferramenta (`'write_file'`), classe da ferramenta (`'ShellTool'`) ou prefixo de comando shell (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Equivalente a `tool.allowed` no settings.json. Ferramentas correspondentes ignoram o callback `canUseTool` e são executadas automaticamente. Aplica-se apenas quando a ferramenta requer confirmação. Suporta os mesmos padrões de correspondência que `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Tipo de autenticação para o serviço de IA. Usar `'qwen-oauth'` no SDK não é recomendado, pois as credenciais são armazenadas em `~/.qwen` e podem precisar de atualização periódica.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuração para subagentes que podem ser invocados durante a sessão. Subagentes são agentes de IA especializados para tarefas ou domínios específicos.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Quando `true`, o SDK emite mensagens incompletas conforme elas estão sendo geradas, permitindo streaming em tempo real da resposta da IA.                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

O SDK aplica os seguintes timeouts padrão:

| Timeout          | Padrão   | Descrição                                                                                                                    |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minuto | Tempo máximo para o callback `canUseTool` responder. Se excedido, a solicitação da ferramenta é automaticamente negada.       |
| `mcpRequest`     | 1 minuto | Tempo máximo para chamadas de ferramentas SDK MCP serem concluídas.                                                          |
| `controlRequest` | 1 minuto | Tempo máximo para operações de controle como `initialize()`, `setModel()`, `setPermissionMode()` e `interrupt()` serem concluídas. |
| `streamClose`    | 1 minuto | Tempo máximo para aguardar a conclusão da inicialização antes de fechar o stdin da CLI no modo multi-turn com servidores SDK MCP. |

Você pode personalizar esses timeouts por meio da opção `timeout`:

```typescript
const query = qwen.query('Sua prompt', {
  timeout: {
    canUseTool: 60000, // 60 segundos para callback de permissão
    mcpRequest: 600000, // 10 minutos para chamadas de ferramentas MCP
    controlRequest: 60000, // 60 segundos para requisições de controle
    streamClose: 15000, // 15 segundos para espera de fechamento do stream
  },
});
```

### Tipos de Mensagens

O SDK fornece guardas de tipo para identificar diferentes tipos de mensagens:

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
    // Tratar mensagem do assistente
  } else if (isSDKResultMessage(message)) {
    // Tratar mensagem de resultado
  }
}
```

### Métodos da Instância Query

A instância `Query` retornada por `query()` fornece vários métodos:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Obter ID da sessão
const sessionId = q.getSessionId();

// Verificar se está fechada
const closed = q.isClosed();

// Interromper a operação atual
await q.interrupt();

// Alterar modo de permissão durante a sessão
await q.setPermissionMode('yolo');

// Alterar modelo durante a sessão
await q.setModel('qwen-max');

// Fechar a sessão
await q.close();
```

## Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução das ferramentas:

- **`default`**: Ferramentas de escrita são negadas, a menos que aprovadas por meio do callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura executam sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente as ferramentas de edição (edit, write_file), enquanto outras ferramentas requerem confirmação.
- **`yolo`**: Todas as ferramentas executam automaticamente sem confirmação.

### Cadeia de Prioridade de Permissões

1. `excludeTools` - Bloqueia ferramentas completamente
2. `permissionMode: 'plan'` - Bloqueia ferramentas que não são somente leitura
3. `permissionMode: 'yolo'` - Aprova automaticamente todas as ferramentas
4. `allowedTools` - Aprova automaticamente as ferramentas correspondentes
5. Callback `canUseTool` - Lógica personalizada de aprovação
6. Comportamento padrão - Nega automaticamente no modo SDK

## Exemplos

### Conversa Multi-turno

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Crie um arquivo hello.txt' },
    parent_tool_use_id: null,
  };

  // Aguarde alguma condição ou entrada do usuário
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
  // Permitir todas as operações de leitura
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Solicitar aprovação do usuário para operações de escrita (em um aplicativo real)
  const userApproved = await promptUser(`Permitir ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Usuário negou a operação' };
};

const result = query({
  prompt: 'Criar um novo arquivo',
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

### Com Servidores MCP Embutidos no SDK

O SDK fornece `tool` e `createSdkMcpServer` para criar servidores MCP que são executados no mesmo processo da sua aplicação SDK. Isso é útil quando você deseja expor ferramentas personalizadas à IA sem precisar executar um processo de servidor separado.

#### `tool(name, description, inputSchema, handler)`

Cria uma definição de ferramenta com inferência de tipo de esquema Zod.

| Parâmetro     | Tipo                               | Descrição                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Nome da ferramenta (1-64 caracteres, começa com letra, alfanumérico e sublinhados) |
| `description` | `string`                           | Descrição legível por humanos do que a ferramenta faz                         |
| `inputSchema` | `ZodRawShape`                      | Objeto de esquema Zod definindo os parâmetros de entrada da ferramenta                   |
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

// Definir uma ferramenta com esquema Zod
const calculatorTool = tool(
  'calculate_sum',
  'Adicionar dois números',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Criar o servidor MCP
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Usar o servidor em uma consulta
const result = query({
  prompt: 'Quanto é 42 + 17?',
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
  prompt: 'Tarefa de longa duração...',
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
    console.log('A consulta foi abortada');
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
    // Trata o aborto
  } else {
    // Trata outros erros
  }
}
```