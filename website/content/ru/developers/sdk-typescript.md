# TypeScript SDK

## @qwen-code/sdk

Минимальный экспериментальный TypeScript SDK для программного доступа к Qwen Code.

Не стесняйтесь отправлять запросы на новые функции, сообщать об проблемах или создавать пул-реквесты.

## Установка

```bash
npm install @qwen-code/sdk
```

## Требования

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (стабильная) установлен и доступен в PATH

> **Примечание для пользователей nvm**: Если вы используете nvm для управления версиями Node.js, SDK может не автоопределить исполняемый файл Qwen Code. Вам следует явно указать опцию `pathToQwenExecutable` с полным путём к бинарному файлу `qwen`.

## Быстрый старт

```typescript
import { query } from '@qwen-code/sdk';

// Одновитковый запрос
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Итерация по сообщениям
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API-справочник

### `query(config)`

Создаёт новый сеанс запроса с Qwen Code.

#### Параметры

- `prompt`: `string | AsyncIterable<SDKUserMessage>` — Запрос для отправки. Используйте строку для одновитковых запросов или асинхронный итератор для многовитковых диалогов.
- `options`: `QueryOptions` — Параметры конфигурации сеанса запроса.

#### QueryOptions

| Параметр                  | Тип                                            | По умолчанию     | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                     | `string`                                       | `process.cwd()`  | Рабочий каталог для сеанса запроса. Определяет контекст выполнения операций с файлами и команд.                                                                                                                                                                                                                                                                                                                                                                                                |
| `model`                   | `string`                                       | —                | ИИ-модель для использования (например, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Имеет приоритет над переменными окружения `OPENAI_MODEL` и `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                   |
| `pathToQwenExecutable`    | `string`                                       | Автоопределение  | Путь к исполняемому файлу Qwen Code. Поддерживает несколько форматов: `'qwen'` (нативный бинарник из PATH), `'/path/to/qwen'` (явный путь), `'/path/to/cli.js'` (Node.js-бандл), `'node:/path/to/cli.js'` (принудительное выполнение через Node.js), `'bun:/path/to/cli.js'` (принудительное выполнение через Bun). Если не указан, автоопределяется из: переменной окружения `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`          | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Режим разрешений, управляющий одобрением выполнения инструментов. См. [Режимы разрешений](#permission-modes) для подробностей.                                                                                                                                                                                                                                                                                                                                                                  |
| `canUseTool`              | `CanUseTool`                                   | —                | Пользовательский обработчик разрешений для одобрения выполнения инструментов. Вызывается, когда инструмент требует подтверждения. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонён. См. [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                                                                  |
| `env`                     | `Record<string, string>`                       | —                | Переменные окружения для передачи процессу Qwen Code. Объединяются с текущими переменными окружения процесса.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`            | `string \| QuerySystemPromptPreset`            | —                | Конфигурация системного промпта для основного сеанса. Используйте строку для полной замены встроенного системного промпта Qwen Code, или объект-пресет для сохранения встроенного промпта с добавлением дополнительных инструкций.                                                                                                                                                                                                                                                               |
| `mcpServers`              | `Record<string, McpServerConfig>`              | —                | MCP (Model Context Protocol) серверы для подключения. Поддерживает внешние серверы (stdio/SSE/HTTP) и встроенные в SDK серверы. Внешние серверы настраиваются с помощью транспортных опций, таких как `command`, `args`, `url`, `httpUrl` и т.д. SDK серверы используют `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                         |
| `abortController`         | `AbortController`                              | —                | Контроллер для отмены сеанса запроса. Вызовите `abortController.abort()`, чтобы завершить сеанс и освободить ресурсы.                                                                                                                                                                                                                                                                                                                                                                           |
| `debug`                   | `boolean`                                      | `false`          | Включить режим отладки для подробного логирования от процесса CLI.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `maxSessionTurns`         | `number`                                       | `-1` (безлимит)  | Максимальное количество витков диалога до автоматического завершения сеанса. Виток состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`               | `string[]`                                     | —                | Использует устаревший белый список `coreTools` / CLI `--core-tools`. Если указан, регистрируются только соответствующие основные инструменты. Это отдельно от `permissions.allow`, который автоматически одобряет вызовы соответствующих инструментов, но не ограничивает их регистрацию. Пример: `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                                  |
| `excludeTools`            | `string[]`                                     | —                | Эквивалентно `permissions.deny` в settings.json. Исключённые инструменты сразу возвращают ошибку разрешения. Имеет наивысший приоритет среди всех настроек разрешений. Поддерживает псевдонимы имён инструментов и сопоставление с шаблоном: имя инструмента (`'write_file'`), префикс шелл-команды (`'Bash(rm *)'`) или шаблоны пути (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                         |
| `allowedTools`            | `string[]`                                     | —                | Эквивалентно `permissions.allow` в settings.json. Соответствующие инструменты обходят обратный вызов `canUseTool` и выполняются автоматически. Применяется только когда инструмент требует подтверждения. Поддерживает то же сопоставление с шаблоном, что и `excludeTools`. Пример: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                      |
| `authType`                | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Тип аутентификации для ИИ-сервиса. Бесплатный уровень Qwen OAuth был прекращён 2026-04-15; новые настройки SDK должны использовать совместимую с OpenAI аутентификацию или другого поддерживаемого провайдера.                                                                                                                                                                                                                                                                                  |
| `agents`                  | `SubagentConfig[]`                             | —                | Конфигурация субагентов, которые могут быть вызваны во время сеанса. Субагенты — это специализированные ИИ-агенты для конкретных задач или областей.                                                                                                                                                                                                                                                                                                                                             |
| `includePartialMessages`  | `boolean`                                      | `false`          | Если `true`, SDK выдаёт неполные сообщения по мере их генерации, обеспечивая потоковую передачу ответа ИИ в реальном времени.                                                                                                                                                                                                                                                                                                                                                                   |
| `resume`                  | `string`                                       | —                | Возобновить предыдущий сеанс, указав его идентификатор сеанса. Эквивалентно флагу CLI `--resume`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `sessionId`               | `string`                                       | —                | Указать идентификатор сеанса для нового сеанса. Гарантирует, что SDK и CLI используют одинаковый ID без возобновления истории. Эквивалентно флагу CLI `--session-id`.                                                                                                                                                                                                                                                                                                                            |
> [!note]
> Для `coreTools` псевдонимы типа `Read`, `Edit` и `Bash` также работают, но спецификаторы вызова, такие как `Bash(git *)`, отбрасываются. `coreTools` ограничивает регистрацию инструментов, а не шаблоны вызова.

### Таймауты

SDK устанавливает следующие таймауты по умолчанию:

| Таймаут | По умолчанию | Описание |
| ------- | ------------ | -------- |
| `canUseTool` | 1 минута | Максимальное время для ответа колбэка `canUseTool`. При превышении запрос на использование инструмента автоматически отклоняется. |
| `mcpRequest` | 1 минута | Максимальное время выполнения вызовов инструментов MCP через SDK. |
| `controlRequest` | 1 минута | Максимальное время выполнения операций управления, таких как `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` и `interrupt()`. |
| `streamClose` | 1 минута | Максимальное время ожидания завершения инициализации перед закрытием stdin CLI в многошаговом режиме с серверами MCP SDK. |

Вы можете настроить эти таймауты с помощью опции `timeout`:

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

SDK предоставляет type guards для идентификации различных типов сообщений:

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
- **`plan`**: Блокирует все инструменты записи, указывая ИИ сначала представить план.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (`edit`, `write_file`, `notebook_edit`), остальные требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритета разрешений

Приоритет принятия решения (от высшего к низшему): `deny` > `ask` > `allow` > _(по умолчанию/интерактивный режим)_

Правило, совпавшее первым, имеет приоритет.

1. `excludeTools` / `permissions.deny` — Блокирует инструменты полностью (возвращает ошибку разрешения)
2. `permissions.ask` — Всегда требует подтверждения пользователя
3. `permissionMode: 'plan'` — Блокирует все инструменты, не только для чтения
4. `permissionMode: 'yolo'` — Автоматически одобряет все инструменты
5. `allowedTools` / `permissions.allow` — Автоматически одобряет соответствующие инструменты
6. Колбэк `canUseTool` — Пользовательская логика одобрения (если предоставлен, не вызывается для одобренных инструментов)
7. Поведение по умолчанию — автоматический отказ в режиме SDK (инструменты записи требуют явного одобрения)

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
### С внешними MCP-серверами

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

### Со встроенными в SDK MCP-серверами

SDK предоставляет `tool` и `createSdkMcpServer` для создания MCP-серверов, работающих в том же процессе, что и ваше SDK-приложение. Это полезно, когда нужно предоставить ИИ пользовательские инструменты без запуска отдельного серверного процесса.

#### `tool(name, description, inputSchema, handler)`

Создаёт определение инструмента с выводом типов через схему Zod.

| Параметр       | Тип                                 | Описание                                                                 |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `name`         | `string`                            | Имя инструмента (1–64 символа, начинается с буквы, алфавитно-цифровые символы и подчёркивания) |
| `description`  | `string`                            | Понятное человеку описание того, что делает инструмент                   |
| `inputSchema`  | `ZodRawShape`                       | Объект схемы Zod, определяющий входные параметры инструмента            |
| `handler`      | `(args, extra) => Promise<Result>`  | Асинхронная функция, выполняющая инструмент и возвращающая блоки содержимого MCP |

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

Создаёт экземпляр MCP-сервера, встроенного в SDK.

| Опция    | Тип                        | По умолчанию | Описание                                |
| -------- | -------------------------- | ------------ | --------------------------------------- |
| `name`   | `string`                   | Обязательно  | Уникальное имя для MCP-сервера          |
| `version`| `string`                   | `'1.0.0'`    | Версия сервера                          |
| `tools`  | `SdkMcpToolDefinition[]`   | -            | Массив инструментов, созданных через `tool()` |

Возвращает объект `McpSdkServerConfigWithInstance`, который можно напрямую передать в опцию `mcpServers`.

#### Пример

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Определяем инструмент со схемой Zod
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Создаём MCP-сервер
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Используем сервер в запросе
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

### Прерывание запроса

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// Прерываем через 5 секунд
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

SDK предоставляет класс `AbortError` для обработки прерванных запросов:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... операции запроса
} catch (error) {
  if (isAbortError(error)) {
    // Обработка прерывания
  } else {
    // Обработка других ошибок
  }
}
```
