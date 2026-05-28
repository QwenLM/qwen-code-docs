---
description: "Используйте Qwen Code TypeScript SDK для AI-coding интеграций: установка, аутентификация, типы и примеры для Web, Node.js и tooling."
---

# Typescript SDK

## @qwen-code/sdk

Минимальный экспериментальный TypeScript SDK для программного доступа к Qwen Code.

Будем рады вашим feature request, issue или PR.

## Установка

```bash
npm install @qwen-code/sdk
```

## Требования

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) установлен и доступен в PATH

> **Примечание для пользователей nvm**: Если вы используете nvm для управления версиями Node.js, SDK может не определить исполняемый файл Qwen Code автоматически. Вам следует явно указать опцию `pathToQwenExecutable`, задав полный путь к бинарному файлу `qwen`.

## Быстрый старт

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

## Справочник API

### `query(config)`

Создает новую сессию запроса к Qwen Code.

#### Параметры

- `prompt`: `string | AsyncIterable<SDKUserMessage>` — отправляемый запрос (prompt). Используйте строку для одношаговых запросов или асинхронный итерируемый объект для многошаговых диалогов.
- `options`: `QueryOptions` — параметры конфигурации сессии запроса.

#### QueryOptions

| Опция                    | Тип                                            | Значение по умолчанию | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`       | Рабочая директория для сессии запроса. Определяет контекст, в котором выполняются файловые операции и команды.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                     | Используемая AI-модель (например, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Имеет приоритет над переменными окружения `OPENAI_MODEL` и `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Определяется автоматически | Путь к исполняемому файлу Qwen Code. Поддерживает несколько форматов: `'qwen'` (нативный бинарник из PATH), `'/path/to/qwen'` (явный путь), `'/path/to/cli.js'` (Node.js bundle), `'node:/path/to/cli.js'` (принудительный запуск через Node.js), `'bun:/path/to/cli.js'` (принудительный запуск через Bun). Если не указан, автоматически определяется из: переменной окружения `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`           | Режим разрешений, контролирующий подтверждение выполнения инструментов. Подробности см. в разделе [Режимы разрешений](#permission-modes).                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                     | Пользовательский обработчик разрешений для подтверждения выполнения инструментов. Вызывается, когда инструмент требует подтверждения. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонен. См. [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                     | Переменные окружения, передаваемые процессу Qwen Code. Объединяются с переменными окружения текущего процесса.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                     | Конфигурация системного промпта для основной сессии. Используйте строку для полной замены встроенного системного промпта Qwen Code или объект-пресет, чтобы сохранить встроенный промпт и добавить дополнительные инструкции.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                     | MCP (Model Context Protocol) серверы для подключения. Поддерживает внешние серверы (stdio/SSE/HTTP) и встроенные в SDK серверы. Внешние серверы настраиваются через параметры транспорта, такие как `command`, `args`, `url`, `httpUrl` и т.д. SDK-серверы используют формат `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                     | Контроллер для отмены сессии запроса. Вызовите `abortController.abort()` для завершения сессии и очистки ресурсов.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`               | Включает режим отладки для подробного логирования процесса CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (без ограничений) | Максимальное количество шагов диалога до автоматического завершения сессии. Шаг состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                     | Аналог `tool.core` в settings.json. Если указано, AI будут доступны только эти инструменты. Пример: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                     | Аналог `tool.exclude` в settings.json. Исключенные инструменты сразу возвращают ошибку разрешения. Имеет наивысший приоритет над всеми остальными настройками разрешений. Поддерживает сопоставление по паттерну: имя инструмента (`'write_file'`), класс инструмента (`'ShellTool'`) или префикс shell-команды (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                     | Аналог `tool.allowed` в settings.json. Совпадающие инструменты обходят колбэк `canUseTool` и выполняются автоматически. Применяется только когда инструмент требует подтверждения. Поддерживает те же паттерны, что и `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`            | Тип аутентификации для AI-сервиса. Использование `'qwen-oauth'` в SDK не рекомендуется, так как учетные данные хранятся в `~/.qwen` и могут требовать периодического обновления.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                     | Конфигурация субагентов, которые могут быть вызваны во время сессии. Субагенты — это специализированные AI-агенты для конкретных задач или доменов.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`               | При значении `true` SDK отправляет неполные сообщения по мере их генерации, что позволяет стримить ответ AI в реальном времени.                                                                                                                                                                                                                                                                                                                                                        |

### Таймауты

SDK использует следующие таймауты по умолчанию:

| Таймаут          | Значение по умолчанию | Описание                                                                                                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 минута              | Максимальное время ответа колбэка `canUseTool`. При превышении запрос на инструмент автоматически отклоняется.                                                  |
| `mcpRequest`     | 1 минута              | Максимальное время выполнения вызовов инструментов SDK MCP.                                                                                                  |
| `controlRequest` | 1 минута              | Максимальное время выполнения контрольных операций, таких как `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` и `interrupt()`. |
| `streamClose`    | 1 минута              | Максимальное время ожидания завершения инициализации перед закрытием CLI stdin в многошаговом режиме с SDK MCP серверами.                             |

Вы можете настроить эти таймауты через опцию `timeout`:

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

### Типы сообщений

SDK предоставляет type guards для определения различных типов сообщений:

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

### Методы экземпляра Query

Экземпляр `Query`, возвращаемый `query()`, предоставляет несколько методов:

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

## Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи отклоняются, если не одобрены через колбэк `canUseTool` или не указаны в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, предписывая AI сначала предоставить план.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (edit, write_file), остальные требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритетов разрешений

1. `excludeTools` — полностью блокирует инструменты
2. `permissionMode: 'plan'` — блокирует инструменты, не являющиеся read-only
3. `permissionMode: 'yolo'` — автоматически одобряет все инструменты
4. `allowedTools` — автоматически одобряет совпадающие инструменты
5. Колбэк `canUseTool` — пользовательская логика одобрения
6. Поведение по умолчанию — автоматический отказ в режиме SDK

## Примеры

### Многошаговый диалог

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

### Пользовательский обработчик разрешений

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

### С внешними MCP серверами

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

### Переопределение системного промпта

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### Добавление к встроенному системному промпту

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

### С встроенными в SDK MCP серверами

SDK предоставляет `tool` и `createSdkMcpServer` для создания MCP серверов, которые работают в том же процессе, что и ваше SDK-приложение. Это полезно, когда вы хотите предоставить AI пользовательские инструменты без запуска отдельного серверного процесса.

#### `tool(name, description, inputSchema, handler)`

Создает определение инструмента с выводом типов через Zod schema.

| Параметр      | Тип                                | Описание                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Имя инструмента (1-64 символа, начинается с буквы, допускаются буквы, цифры и подчеркивания) |
| `description` | `string`                           | Читаемое человеком описание того, что делает инструмент                         |
| `inputSchema` | `ZodRawShape`                      | Объект Zod schema, определяющий входные параметры инструмента                   |
| `handler`     | `(args, extra) => Promise<Result>` | Асинхронная функция, выполняющая инструмент и возвращающая MCP content blocks     |

Обработчик должен возвращать объект `CallToolResult` следующей структуры:

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

Создает экземпляр MCP сервера, встроенного в SDK.

| Опция     | Тип                      | Значение по умолчанию | Описание                          |
| --------- | ------------------------ | --------------------- | ------------------------------------ |
| `name`    | `string`                 | Обязательно           | Уникальное имя MCP сервера       |
| `version` | `string`                 | `'1.0.0'`             | Версия сервера                       |
| `tools`   | `SdkMcpToolDefinition[]` | -                     | Массив инструментов, созданных с помощью `tool()` |

Возвращает объект `McpSdkServerConfigWithInstance`, который можно напрямую передать в опцию `mcpServers`.

#### Пример

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

### Отмена запроса

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

## Обработка ошибок

SDK предоставляет класс `AbortError` для обработки отмененных запросов:

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