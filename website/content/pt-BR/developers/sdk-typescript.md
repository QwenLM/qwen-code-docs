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
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (estável) instalado e acessível no PATH

> **Nota para usuários do nvm**: Se você usa o nvm para gerenciar versões do Node.js, o SDK pode não conseguir detectar automaticamente o executável do Qwen Code. Você deve definir explicitamente a opção `pathToQwenExecutable` com o caminho completo do binário `qwen`.

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
| `pathToQwenExecutable`   | `string`                                       | Detectado automaticamente | Caminho para o executável do Qwen Code. Suporta múltiplos formatos: `'qwen'` (binário nativo do PATH), `'/path/to/qwen'` (caminho explícito), `'/path/to/cli.js'` (pacote Node.js), `'node:/path/to/cli.js'` (força runtime Node.js), `'bun:/path/to/cli.js'` (força runtime Bun). Se não fornecido, detecta automaticamente a partir de: variável de ambiente `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Modo de permissão que controla a aprovação de execução de ferramentas. Veja [Modos de Permissão](#modos-de-permissão) para detalhes.                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Manipulador de permissão personalizado para aprovação de execução de ferramentas. É invocado quando uma ferramenta requer confirmação. Deve responder em até 60 segundos ou a solicitação será negada automaticamente. Veja [Manipulador de Permissão Personalizado](#manipulador-de-permissão-personalizado).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variáveis de ambiente a serem passadas para o processo do Qwen Code. Mescladas com o ambiente do processo atual.                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Configuração do prompt de sistema para a sessão principal. Use uma string para substituir completamente o prompt de sistema embutido do Qwen Code, ou um objeto de preset para manter o prompt embutido e acrescentar instruções extras.                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Servidores MCP (Model Context Protocol) para conectar. Suporta servidores externos (stdio/SSE/HTTP) e servidores embutidos no SDK. Servidores externos são configurados com opções de transporte como `command`, `args`, `url`, `httpUrl`, etc. Servidores SDK usam `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controlador para cancelar a sessão de consulta. Chame `abortController.abort()` para encerrar a sessão e limpar recursos.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Ativa o modo debug para logging verbose do processo CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (ilimitado) | Número máximo de turnos de conversa antes da sessão terminar automaticamente. Um turno consiste em uma mensagem do usuário e uma resposta do assistente.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Usa a semântica legada de lista de permissões `coreTools` / CLI `--core-tools`. Se especificado, apenas ferramentas principais correspondentes são registradas para a sessão. Isso é separado de `permissions.allow`, que aprova automaticamente chamadas de ferramentas correspondentes, mas não restringe o registro de ferramentas. Exemplo: `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                                       |
| `excludeTools`           | `string[]`                                     | -                | Equivalente a `permissions.deny` no settings.json. Ferramentas excluídas retornam um erro de permissão imediatamente. Tem a maior prioridade sobre todas as outras configurações de permissão. Suporta aliases de nomes de ferramentas e correspondência de padrões: nome da ferramenta (`'write_file'`), prefixo de comando shell (`'Bash(rm *)'`), ou padrões de caminho (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                         |
| `allowedTools`           | `string[]`                                     | -                | Equivalente a `permissions.allow` no settings.json. Ferramentas correspondentes ignoram o callback `canUseTool` e executam automaticamente. Aplica-se apenas quando a ferramenta requer confirmação. Suporta a mesma correspondência de padrões que `excludeTools`. Exemplo: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                                         |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Tipo de autenticação para o serviço de IA. O nível gratuito do Qwen OAuth foi descontinuado em 2026-04-15; novas configurações do SDK devem usar autenticação compatível com OpenAI ou outro provedor suportado.                                                                                                                                                                                                                                                                                                |
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

// Obter ID da sessão
const sessionId = q.getSessionId();

// Verificar se está fechada
const closed = q.isClosed();

// Interromper a operação atual
await q.interrupt();

// Alterar modo de permissão no meio da sessão
await q.setPermissionMode('yolo');

// Alterar modelo no meio da sessão
await q.setModel('qwen-max');

// Obter detalhamento do uso da janela de contexto (contagens de tokens por categoria)
const usage = await q.getContextUsage();
// Passar true para sugerir que detalhes por item sejam exibidos
const detail = await q.getContextUsage(true);

// Fechar a sessão
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

A primeira regra correspondente vence.

1. `excludeTools` / `permissions.deny` - Bloqueia ferramentas completamente (retorna erro de permissão)
2. `permissions.ask` - Sempre requer confirmação do usuário
3. `permissionMode: 'plan'` - Bloqueia todas as ferramentas não somente leitura
4. `permissionMode: 'yolo'` - Aprova automaticamente todas as ferramentas
5. `allowedTools` / `permissions.allow` - Aprova automaticamente ferramentas correspondentes
6. Callback `canUseTool` - Lógica de aprovação personalizada (se fornecido, não chamado para ferramentas permitidas)
7. Comportamento padrão - Negar automaticamente no modo SDK (ferramentas de escrita exigem aprovação explícita)

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

  // Aguardar alguma condição ou entrada do usuário
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
  // Permitir todas as operações de leitura
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Solicitar ao usuário para operações de escrita (em uma aplicação real)
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

// Define uma ferramenta com esquema Zod
const calculatorTool = tool(
  'calculate_sum',
  'Adicionar dois números',
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

// Aborta após 5 segundos
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Consulta abortada');
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
    // Lida com abortamento
  } else {
    // Lida com outros erros
  }
}
```