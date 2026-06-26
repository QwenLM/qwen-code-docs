# Typescript SDK

## @qwen-code/sdk

Минимальный экспериментальный TypeScript SDK для программного доступа к Qwen Code.

Не стесняйтесь отправлять запрос на добавление функции, issue или PR.

## Установка

```bash
npm install @qwen-code/sdk
```

## Требования

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (стабильная) установлен и доступен в PATH

> [!note]
> **Для пользователей nvm**: Если вы используете nvm для управления версиями Node.js, SDK может не суметь автоматически определить исполняемый файл Qwen Code. Вам нужно явно указать опцию `pathToQwenExecutable` с полным путём к бинарнику `qwen`.

## Быстрый старт

```typescript
import { query } from '@qwen-code/sdk';

// Однократный запрос
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

## Справочник API

### `query(config)`

Создаёт новую сессию запроса с Qwen Code.

#### Параметры

- `prompt`: `string | AsyncIterable<SDKUserMessage>` – отправляемый запрос. Используйте строку для однократных запросов или асинхронный итерируемый объект для многошаговых бесед.
- `options`: `QueryOptions` – параметры конфигурации сессии запроса.

#### QueryOptions

| Опция                     | Тип                                            | По умолчанию    | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                     | `string`                                       | `process.cwd()` | Рабочая директория для сессии запроса. Определяет контекст, в котором выполняются операции с файлами и команды.                                                                                                                                                                                                                                                                                                                                                                              |
| `model`                   | `string`                                       | -               | Модель ИИ (например, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Имеет приоритет над переменными окружения `OPENAI_MODEL` и `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                                  |
| `pathToQwenExecutable`    | `string`                                       | Автоопределение | Путь к исполняемому файлу Qwen Code. Поддерживаются форматы: `'qwen'` (родной бинарник из PATH), `'/path/to/qwen'` (явный путь), `'/path/to/cli.js'` (Node.js сборка), `'node:/path/to/cli.js'` (форсировать Node.js), `'bun:/path/to/cli.js'` (форсировать Bun). Если не указан, автоопределяется из: `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`          | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`     | Режим разрешений, управляющий одобрением выполнения инструментов. Подробнее см. [Режимы разрешений](#permission-modes).                                                                                                                                                                                                                                                                                                                                                                      |
| `canUseTool`              | `CanUseTool`                                   | -               | Пользовательский обработчик для одобрения выполнения инструментов. Вызывается, когда инструмент требует подтверждения. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонён. См. [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                                                                           |
| `env`                     | `Record<string, string>`                       | -               | Переменные окружения, передаваемые процессу Qwen Code. Объединяются с окружением текущего процесса.                                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`            | `string \| QuerySystemPromptPreset`            | -               | Конфигурация системного промпта для основной сессии. Используйте строку, чтобы полностью заменить встроенный системный промпт Qwen Code, или объект-пресет, чтобы сохранить встроенный промпт и добавить дополнительные инструкции.                                                                                                                                                                                                                                                            |
| `mcpServers`              | `Record<string, McpServerConfig>`              | -               | MCP (Model Context Protocol) серверы для подключения. Поддерживает внешние серверы (stdio/SSE/HTTP) и встроенные серверы SDK. Внешние настраиваются с опциями транспорта, такими как `command`, `args`, `url`, `httpUrl` и т.д. Серверы SDK используют `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                       |
| `abortController`         | `AbortController`                              | -               | Контроллер для отмены сессии запроса. Вызов `abortController.abort()` завершает сессию и освобождает ресурсы.                                                                                                                                                                                                                                                                                                                                                                               |
| `debug`                   | `boolean`                                      | `false`         | Включить отладочный режим для подробного логирования от CLI-процесса.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `maxSessionTurns`         | `number`                                       | `-1` (без лим.) | Максимальное количество шагов беседы до автоматического завершения сессии. Шаг состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                                                         |
| `coreTools`               | `string[]`                                     | -               | Использует устаревшую семантику белого списка `coreTools` / CLI `--core-tools`. Если указан, регистрируются только совпадающие основные инструменты. Отдельно от `permissions.allow`, который автоутверждает совпадающие вызовы инструментов, но не ограничивает регистрацию. Пример: `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                                         |
| `excludeTools`            | `string[]`                                     | -               | Эквивалент `permissions.deny` в settings.json. Исключённые инструменты сразу возвращают ошибку разрешения. Имеет наивысший приоритет над всеми остальными настройками разрешений. Поддерживает псевдонимы имён инструментов и шаблоны: имя инструмента (`'write_file'`), префикс команды (`'Bash(rm *)'`) или шаблоны путей (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                            |
| `allowedTools`            | `string[]`                                     | -               | Эквивалент `permissions.allow` в settings.json. Совпадающие инструменты обходят `canUseTool` и выполняются автоматически. Применяется только если инструмент требует подтверждения. Поддерживает те же шаблоны, что и `excludeTools`. Пример: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                                      |
| `authType`                | `'openai' \| 'qwen-oauth'`                     | `'openai'`      | Тип аутентификации для сервиса ИИ. Бесплатный уровень Qwen OAuth был прекращён 2026-04-15; новые настройки SDK должны использовать аутентификацию, совместимую с OpenAI, или другого поддерживаемого провайдера.                                                                                                                                                                                                                                                                             |
| `agents`                  | `SubagentConfig[]`                             | -               | Конфигурация субагентов, которые могут быть вызваны во время сессии. Субагенты — это специализированные ИИ-агенты для конкретных задач или областей.                                                                                                                                                                                                                                                                                                                                        |
| `includePartialMessages`  | `boolean`                                      | `false`         | Если `true`, SDK отправляет неполные сообщения по мере их генерации, что позволяет транслировать ответ ИИ в реальном времени.                                                                                                                                                                                                                                                                                                                                                               |
| `resume`                  | `string`                                       | -               | Возобновить предыдущую сессию, указав её ID. Эквивалент флага `--resume` в CLI.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sessionId`               | `string`                                       | -               | Указать ID сессии для новой сессии. Гарантирует, что SDK и CLI используют одинаковый ID без возобновления истории. Эквивалент флага `--session-id` в CLI.                                                                                                                                                                                                                                                                                                                                    |

> [!note]
> Для `coreTools` также работают псевдонимы, такие как `Read`, `Edit` и `Bash`, но спецификаторы вызова, например `Bash(git *)`, отбрасываются. `coreTools` ограничивает регистрацию инструментов, а не шаблоны вызова.

### Тайм-ауты

SDK устанавливает следующие тайм-ауты по умолчанию:

| Тайм-аут         | По умолчанию | Описание                                                                                                                                                             |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 минута     | Максимальное время ответа для callback `canUseTool`. Если превышено, запрос инструмента автоматически отклоняется.                                                  |
| `mcpRequest`     | 1 минута     | Максимальное время завершения вызовов SDK MCP инструментов.                                                                                                         |
| `controlRequest` | 1 минута     | Максимальное время завершения управляющих операций: `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` и `interrupt()`.                       |
| `streamClose`    | 1 минута     | Максимальное время ожидания завершения инициализации перед закрытием stdin CLI в многошаговом режиме с серверами SDK MCP.                                             |

Вы можете настроить эти тайм-ауты через опцию `timeout`:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 секунд для callback разрешений
    mcpRequest: 600000, // 10 минут для вызовов MCP инструментов
    controlRequest: 60000, // 60 секунд для управляющих запросов
    streamClose: 15000, // 15 секунд для ожидания закрытия потока
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
    // Обработать сообщение ассистента
  } else if (isSDKResultMessage(message)) {
    // Обработать сообщение результата
  }
}
```

### Методы экземпляра Query

Экземпляр `Query`, возвращаемый `query()`, предоставляет несколько методов:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Получить ID сессии
const sessionId = q.getSessionId();

// Проверить, закрыта ли сессия
const closed = q.isClosed();

// Прервать текущую операцию
await q.interrupt();

// Изменить режим разрешений на лету
await q.setPermissionMode('yolo');

// Изменить модель на лету
await q.setModel('qwen-max');

// Получить разбивку использования контекстного окна (количество токенов по категориям)
const usage = await q.getContextUsage();
// Передать true для указания, что нужно отобразить детали по каждому элементу
const detail = await q.getContextUsage(true);

// Закрыть сессию
await q.close();
```

## Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи отклоняются, если не одобрены через callback `canUseTool` или не находятся в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, предписывая ИИ сначала представить план.
- **`auto-edit`**: Автоутверждение инструментов редактирования (`edit`, `write_file`, `notebook_edit`), остальные требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритета разрешений

Приоритет принятия решения (от высшего к низшему): `deny` > `ask` > `allow` > _(default/interactive mode)_

Применяется первое совпадение.

1. `excludeTools` / `permissions.deny` – Полностью блокирует инструменты (возвращает ошибку разрешения)
2. `permissions.ask` – Всегда требует подтверждения пользователя
3. `permissionMode: 'plan'` – Блокирует все инструменты, не предназначенные только для чтения
4. `permissionMode: 'yolo'` – Автоутверждение всех инструментов
5. `allowedTools` / `permissions.allow` – Автоутверждение совпадающих инструментов
6. callback `canUseTool` – Пользовательская логика одобрения (если предоставлен, не вызывается для разрешённых инструментов)
7. Поведение по умолчанию – Автоотклонение в режиме SDK (инструменты записи требуют явного одобрения)

## Примеры

### Многошаговая беседа

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Ожидание некоторого условия или ввода пользователя
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
  // Разрешить все операции чтения
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Запросить пользователя для операций записи (в реальном приложении)
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
### Со встроенными MCP-серверами SDK

SDK предоставляет функции `tool` и `createSdkMcpServer` для создания MCP-серверов, которые выполняются в том же процессе, что и ваше SDK-приложение. Это полезно, когда нужно предоставить ИИ пользовательские инструменты без запуска отдельного серверного процесса.

#### `tool(name, description, inputSchema, handler)`

Создаёт определение инструмента с выводом типов схемы Zod.

| Параметр      | Тип                               | Описание                                                              |
| ------------- | --------------------------------- | --------------------------------------------------------------------- |
| `name`        | `string`                          | Имя инструмента (1–64 символа, начинается с буквы, буквы/цифры/подчёркивания) |
| `description` | `string`                          | Человекочитаемое описание того, что делает инструмент                 |
| `inputSchema` | `ZodRawShape`                     | Объект схемы Zod, определяющий входные параметры инструмента          |
| `handler`     | `(args, extra) => Promise<Result>` | Асинхронная функция, выполняющая инструмент и возвращающая блоки контента MCP |

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

| Опция     | Тип                       | По умолчанию | Описание                                  |
| --------- | ------------------------- | ------------ | ----------------------------------------- |
| `name`    | `string`                  | Обязательно  | Уникальное имя для MCP-сервера            |
| `version` | `string`                  | `'1.0.0'`    | Версия сервера                            |
| `tools`   | `SdkMcpToolDefinition[]`  | -            | Массив инструментов, созданных с помощью `tool()` |

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

SDK предоставляет класс `AbortError` для обработки прерванных запросов:

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