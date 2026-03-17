# SDK em TypeScript

## @qwen-code/sdk

Um SDK experimental mínimo em TypeScript para acesso programático ao Qwen Code.

Sinta-se à vontade para enviar uma solicitação de funcionalidade, relatar um problema ou abrir um PR.

## Instalação

```bash
npm install @qwen-code/sdk
```

## Requisitos

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (estável), instalado e acessível no PATH

> **Observação para usuários do nvm**: Se você usa o nvm para gerenciar versões do Node.js, o SDK pode não conseguir detectar automaticamente o executável do Qwen Code. Nesse caso, defina explicitamente a opção `pathToQwenExecutable` com o caminho completo do binário `qwen`.

## Início Rápido

```typescript
import { query } from '@qwen-code/sdk';

// Consulta de uma única etapa
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

- `prompt`: `string | AsyncIterable<SDKUserMessage>` — O prompt a ser enviado. Use uma string para consultas de uma única etapa ou um iterável assíncrono para conversas com múltiplas etapas.
- `options`: `QueryOptions` — Opções de configuração para a sessão de consulta.

#### QueryOptions

| Opção                    | Tipo                                           | Padrão           | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Diretório de trabalho para a sessão de consulta. Determina o contexto no qual operações em arquivos e comandos são executados.                                                                                                                                                                                                                                                                                                                                                           |
| `model`                  | `string`                                       | -                | Modelo de IA a ser usado (por exemplo, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Tem precedência sobre as variáveis de ambiente `OPENAI_MODEL` e `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                      |
| `pathToQwenExecutable`   | `string`                                       | Detectado automaticamente | Caminho para o executável do Qwen Code. Suporta vários formatos: `'qwen'` (binário nativo do PATH), `'/caminho/para/qwen'` (caminho explícito), `'/caminho/para/cli.js'` (pacote Node.js), `'node:/caminho/para/cli.js'` (força o uso do runtime Node.js), `'bun:/caminho/para/cli.js'` (força o uso do runtime Bun). Se não for fornecido, é detectado automaticamente nas seguintes localizações: variável de ambiente `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Modo de permissão que controla a aprovação da execução de ferramentas. Consulte [Modos de Permissão](#permission-modes) para detalhes.                                                                                                                                                                                                                                                                                                                                                 |
| `canUseTool`             | `CanUseTool`                                   | -                | Manipulador personalizado de permissões para aprovação da execução de ferramentas. É invocado sempre que uma ferramenta exigir confirmação. Deve responder dentro de 60 segundos; caso contrário, a solicitação será negada automaticamente. Consulte [Manipulador Personalizado de Permissões](#custom-permission-handler).                                                                                                                                                             |
| `env`                    | `Record<string, string>`                       | -                | Variáveis de ambiente a serem passadas para o processo do Qwen Code. São mescladas com o ambiente atual do processo.                                                                                                                                                                                                                                                                                                                                                                    |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Servidores MCP (Model Context Protocol) aos quais se conectar. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores do SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                      |
| `abortController`        | `AbortController`                              | -                | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e liberar os recursos.                                                                                                                                                                                                                                                                                                                                                          |
| `debug`                  | `boolean`                                      | `false`          | Habilita o modo de depuração para exibição de logs detalhados do processo da CLI.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `maxSessionTurns`        | `number`                                       | `-1` (ilimitado) | Número máximo de rodadas de conversa antes que a sessão seja encerrada automaticamente. Uma rodada consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                  |
| `coreTools`              | `string[]`                                     | -                | Equivalente à configuração `tool.core` em `settings.json`. Se especificado, apenas essas ferramentas estarão disponíveis para a IA. Exemplo: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                         |
| `excludeTools`           | `string[]`                                     | -                | Equivalente à configuração `tool.exclude` em `settings.json`. Ferramentas excluídas retornam imediatamente um erro de permissão. Tem a maior prioridade entre todas as demais configurações de permissão. Suporta correspondência por padrão: nome da ferramenta (`'write_file'`), classe da ferramenta (`'ShellTool'`) ou prefixo de comando shell (`'ShellTool(rm )'`).                                                                                                                                 |
| `allowedTools`           | `string[]`                                     | -                | Equivalente à configuração `tool.allowed` em `settings.json`. Ferramentas correspondentes ignoram o retorno de chamada `canUseTool` e são executadas automaticamente. Aplica-se apenas quando a ferramenta exigir confirmação. Suporta o mesmo tipo de correspondência por padrão usado em `excludeTools`.                                                                                                                                                                                     |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Tipo de autenticação para o serviço de IA. O uso de `'qwen-oauth'` no SDK não é recomendado, pois as credenciais são armazenadas em `~/.qwen` e podem exigir atualização periódica.                                                                                                                                                                                                                                                                                                  |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuração de subagentes que podem ser invocados durante a sessão. Subagentes são agentes de IA especializados para tarefas ou domínios específicos.                                                                                                                                                                                                                                                                                                                                  |
| `includePartialMessages` | `boolean`                                      | `false`          | Quando `true`, o SDK emite mensagens incompletas à medida que são geradas, permitindo o streaming em tempo real da resposta da IA.                                                                                                                                                                                                                                                                                                                                                      |

### Tempos limite

O SDK impõe os seguintes tempos limite padrão:

| Tempo limite     | Padrão   | Descrição                                                                                                                                 |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minuto | Tempo máximo para que o retorno de chamada `canUseTool` responda. Se excedido, a solicitação da ferramenta é negada automaticamente.    |
| `mcpRequest`     | 1 minuto | Tempo máximo para que as chamadas de ferramentas MCP do SDK sejam concluídas.                                                             |
| `controlRequest` | 1 minuto | Tempo máximo para que operações de controle, como `initialize()`, `setModel()`, `setPermissionMode()` e `interrupt()`, sejam concluídas. |
| `streamClose`    | 1 minuto | Tempo máximo de espera para que a inicialização seja concluída antes de fechar a entrada padrão (stdin) da CLI no modo de várias etapas com servidores MCP do SDK. |

Você pode personalizar esses tempos limite usando a opção `timeout`:

```typescript
const query = qwen.query('Seu prompt', {
  timeout: {
    canUseTool: 60000, // 60 segundos para o retorno de chamada de permissão
    mcpRequest: 600000, // 10 minutos para chamadas de ferramentas MCP
    controlRequest: 60000, // 60 segundos para solicitações de controle
    streamClose: 15000, // 15 segundos para a espera de fechamento do fluxo
  },
});
```

### Tipos de Mensagem

O SDK fornece *type guards* para identificar diferentes tipos de mensagem:

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

### Métodos de Instância de `Query`

A instância de `Query` retornada por `query()` fornece vários métodos:

```typescript
const q = query({ prompt: 'Olá', options: {} });

// Obter o ID da sessão
const sessionId = q.getSessionId();

// Verificar se está fechada
const closed = q.isClosed();

// Interromper a operação atual
await q.interrupt();

// Alterar o modo de permissão durante a sessão
await q.setPermissionMode('yolo');

// Alterar o modelo durante a sessão
await q.setModel('qwen-max');

// Fechar a sessão
await q.close();
```

## Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de gravação são negadas, a menos que sejam aprovadas via callback `canUseTool` ou listadas em `allowedTools`. Ferramentas somente leitura são executadas sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de gravação, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (como `edit` e `write_file`), enquanto outras ferramentas exigem confirmação.
- **`yolo`**: Todas as ferramentas são executadas automaticamente, sem confirmação.

### Cadeia de Prioridade de Permissões

1. `excludeTools` — Bloqueia completamente ferramentas específicas  
2. `permissionMode: 'plan'` — Bloqueia ferramentas que não são somente leitura  
3. `permissionMode: 'yolo'` — Aprova automaticamente todas as ferramentas  
4. `allowedTools` — Aprova automaticamente ferramentas correspondentes  
5. Callback `canUseTool` — Lógica personalizada de aprovação  
6. Comportamento padrão — Nega automaticamente no modo SDK  

## Exemplos

### Conversa com várias etapas

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
    message: { role: 'user', content: 'Agora leia o arquivo novamente' },
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
  // Permite todas as operações de leitura
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Solicita confirmação do usuário para operações de gravação (em um aplicativo real)
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
  prompt: 'Use a ferramenta personalizada do meu servidor MCP',
  options: {
    mcpServers: {
      'meu-servidor': {
        command: 'node',
        args: ['caminho/para/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### Com Servidores MCP Incorporados ao SDK

O SDK fornece as funções `tool` e `createSdkMcpServer` para criar servidores MCP que são executados no mesmo processo da sua aplicação SDK. Isso é útil quando você deseja expor ferramentas personalizadas à IA sem precisar executar um processo de servidor separado.

#### `tool(nome, descrição, esquemaDeEntrada, manipulador)`

Cria uma definição de ferramenta com inferência de tipo de esquema Zod.

| Parâmetro        | Tipo                               | Descrição                                                                 |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `nome`           | `string`                           | Nome da ferramenta (1–64 caracteres, deve começar com uma letra, letras, números e sublinhados) |
| `descrição`      | `string`                           | Descrição legível por humanos do que a ferramenta faz                     |
| `esquemaDeEntrada` | `ZodRawShape`                      | Objeto de esquema Zod que define os parâmetros de entrada da ferramenta  |
| `manipulador`    | `(args, extra) => Promise<Result>` | Função assíncrona que executa a ferramenta e retorna blocos de conteúdo MCP |

O manipulador deve retornar um objeto `CallToolResult` com a seguinte estrutura:

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

| Opção     | Tipo                     | Padrão    | Descrição                              |
| --------- | ------------------------ | --------- | -------------------------------------- |
| `name`    | `string`                 | Obrigatório | Nome exclusivo para o servidor MCP     |
| `version` | `string`                 | `'1.0.0'` | Versão do servidor                     |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Matriz de ferramentas criadas com `tool()` |

Retorna um objeto `McpSdkServerConfigWithInstance` que pode ser passado diretamente para a opção `mcpServers`.

#### Exemplo

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define uma ferramenta com esquema Zod
const calculatorTool = tool(
  'calculate_sum',
  'Adiciona dois números',
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

// Abortar após 5 segundos
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

O SDK fornece uma classe `AbortError` para tratar consultas abortadas:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... operações de consulta
} catch (error) {
  if (isAbortError(error)) {
    // Tratar o abortamento
  } else {
    // Tratar outros erros
  }
}
```