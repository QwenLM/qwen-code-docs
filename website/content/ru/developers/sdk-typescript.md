# Typescript SDK

## @qwen-code/sdk

Минимальный экспериментальный TypeScript SDK для программного доступа к Qwen Code.

Не стесняйтесь отправлять запросы на функции/проблемы/PR.

## Установка

```bash
npm install @qwen-code/sdk
```

## Требования

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (стабильная версия) установлен и доступен в PATH

> **Примечание для пользователей nvm**: Если вы используете nvm для управления версиями Node.js, SDK может не иметь возможности автоматически определить исполняемый файл Qwen Code. Вы должны явно установить опцию `pathToQwenExecutable` на полный путь к бинарному файлу `qwen`.

## Быстрый старт

```typescript
import { query } from '@qwen-code/sdk';

// Одноразовый запрос
const result = query({
  prompt: 'Какие файлы находятся в текущей директории?',
  options: {
    cwd: '/path/to/project',
  },
});

// Итерация по сообщениям
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Ассистент:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Результат:', message.result);
  }
}
```

## Справочник API

### `query(config)`

Создает новую сессию запроса с Qwen Code.

#### Параметры

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - Подсказка для отправки. Используйте строку для одноразовых запросов или асинхронный итерируемый объект для многоразовых диалогов.
- `options`: `QueryOptions` - Параметры конфигурации для сессии запроса.

#### QueryOptions

| Параметр                 | Тип                                            | По умолчанию     | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Рабочая директория для сессии запроса. Определяет контекст, в котором выполняются операции с файлами и команды.                                                                                                                                                                                                                                                                                                                                                                        |
| `model`                  | `string`                                       | -                | Модель ИИ для использования (например, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Приоритетнее переменных окружения `OPENAI_MODEL` и `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                |
| `pathToQwenExecutable`   | `string`                                       | Автоопределение   | Путь к исполняемому файлу Qwen Code. Поддерживает несколько форматов: `'qwen'` (нативный бинарник из PATH), `'/path/to/qwen'` (явно указанный путь), `'/path/to/cli.js'` (Node.js бандл), `'node:/path/to/cli.js'` (принудительное использование Node.js рантайма), `'bun:/path/to/cli.js'` (принудительное использование Bun рантайма). Если не указано, автоматически определяется из: переменной окружения `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Режим разрешений, контролирующий одобрение выполнения инструментов. См. [Режимы разрешений](#permission-modes) для подробностей.                                                                                                                                                                                                                                                                                                                                                      |
| `canUseTool`             | `CanUseTool`                                   | -                | Пользовательский обработчик разрешений для одобрения выполнения инструментов. Вызывается при необходимости подтверждения. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонён. См. [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                                                                       |
| `env`                    | `Record<string, string>`                       | -                | Переменные окружения, передаваемые процессу Qwen Code. Объединяются с текущим окружением процесса.                                                                                                                                                                                                                                                                                                                                                                                    |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Серверы MCP (Model Context Protocol) для подключения. Поддерживаются внешние серверы (stdio/SSE/HTTP) и встроенные в SDK серверы. Внешние серверы настраиваются с параметрами транспорта, такими как `command`, `args`, `url`, `httpUrl` и т. д. SDK-серверы используют `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                 |
| `abortController`        | `AbortController`                              | -                | Контроллер для отмены сессии запроса. Вызовите `abortController.abort()` для завершения сессии и освобождения ресурсов.                                                                                                                                                                                                                                                                                                                                                               |
| `debug`                  | `boolean`                                      | `false`          | Включает режим отладки для подробного логирования из CLI-процесса.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `maxSessionTurns`        | `number`                                       | `-1` (без ограничений) | Максимальное количество ходов диалога до автоматического завершения сессии. Ход состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                                                 |
| `coreTools`              | `string[]`                                     | -                | Эквивалент `tool.core` в settings.json. Если указано, только эти инструменты будут доступны ИИ. Пример: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                           |
| `excludeTools`           | `string[]`                                     | -                | Эквивалент `tool.exclude` в settings.json. Исключённые инструменты немедленно возвращают ошибку разрешения. Имеет наивысший приоритет среди всех настроек разрешений. Поддерживает шаблоны: имя инструмента (`'write_file'`), класс инструмента (`'ShellTool'`) или префикс команды оболочки (`'ShellTool(rm )'`).                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Эквивалент `tool.allowed` в settings.json. Соответствующие инструменты обходят обратный вызов `canUseTool` и выполняются автоматически. Применяется только тогда, когда инструмент требует подтверждения. Поддерживает те же шаблоны, что и `excludeTools`.                                                                                                                                                                                                                             |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Тип аутентификации для сервиса ИИ. Использование `'qwen-oauth'` в SDK не рекомендуется, поскольку учётные данные хранятся в `~/.qwen` и могут требовать периодического обновления.                                                                                                                                                                                                                                                                                                    |
| `agents`                 | `SubagentConfig[]`                             | -                | Конфигурация подагентов, которые могут быть вызваны во время сессии. Подагенты — это специализированные ИИ-агенты для конкретных задач или доменов.                                                                                                                                                                                                                                                                                                                                  |
| `includePartialMessages` | `boolean`                                      | `false`          | Если `true`, SDK отправляет неполные сообщения по мере их генерации, позволяя получать ответ ИИ в реальном времени.                                                                                                                                                                                                                                                                                                                                                                   |

### Таймауты

SDK применяет следующие таймауты по умолчанию:

| Таймаут          | Значение по умолчанию | Описание                                                                                                                      |
| ---------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 минута              | Максимальное время ожидания ответа от функции обратного вызова `canUseTool`. Если превышено, запрос инструмента автоматически отклоняется. |
| `mcpRequest`     | 1 минута              | Максимальное время выполнения вызовов инструментов SDK MCP.                                                                       |
| `controlRequest` | 1 минута              | Максимальное время выполнения операций управления, таких как `initialize()`, `setModel()`, `setPermissionMode()` и `interrupt()`. |
| `streamClose`    | 1 минута              | Максимальное время ожидания завершения инициализации перед закрытием stdin CLI в многократном режиме с серверами SDK MCP.         |

Вы можете настроить эти таймауты через опцию `timeout`:

```typescript
const query = qwen.query('Ваш запрос', {
  timeout: {
    canUseTool: 60000, // 60 секунд для функции обратного вызова разрешений
    mcpRequest: 600000, // 10 минут для вызовов инструментов MCP
    controlRequest: 60000, // 60 секунд для запросов управления
    streamClose: 15000, // 15 секунд ожидания закрытия потока
  },
});
```

### Типы сообщений

SDK предоставляет защиту типов для идентификации различных типов сообщений:

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
    // Обработка сообщения ассистента
  } else if (isSDKResultMessage(message)) {
    // Обработка результирующего сообщения
  }
}
```

### Методы экземпляра Query

Экземпляр `Query`, возвращаемый методом `query()`, предоставляет несколько методов:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Получить ID сессии
const sessionId = q.getSessionId();

// Проверить, закрыта ли сессия
const closed = q.isClosed();

// Прервать текущую операцию
await q.interrupt();

// Изменить режим разрешений в середине сессии
await q.setPermissionMode('yolo');

// Изменить модель в середине сессии
await q.setModel('qwen-max');

// Закрыть сессию
await q.close();
```

## Режимы разрешений

SDK поддерживает различные режимы разрешений для контроля выполнения инструментов:

- **`default`**: Инструменты записи запрещены, если они не одобрены через обратный вызов `canUseTool` или в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, указывая ИИ сначала представить план.
- **`auto-edit`**: Автоматическое одобрение инструментов редактирования (edit, write_file), в то время как другие инструменты требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритетов разрешений

1. `excludeTools` - Полностью блокирует инструменты
2. `permissionMode: 'plan'` - Блокирует инструменты, не предназначенные только для чтения
3. `permissionMode: 'yolo'` - Автоматически одобряет все инструменты
4. `allowedTools` - Автоматически одобряет соответствующие инструменты
5. Обратный вызов `canUseTool` - Пользовательская логика одобрения
6. Поведение по умолчанию - Автоматический запрет в режиме SDK

## Примеры

### Многотуровая беседа

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Создать файл hello.txt' },
    parent_tool_use_id: null,
  };

  // Дождаться определенного условия или ввода пользователя
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Теперь прочитай файл обратно' },
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

  // Запросить подтверждение пользователя для операций записи (в реальном приложении)
  const userApproved = await promptUser(`Разрешить ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Пользователь отклонил операцию' };
};

const result = query({
  prompt: 'Создать новый файл',
  options: {
    canUseTool,
  },
});
```

### С внешними серверами MCP

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Используйте пользовательский инструмент с моего сервера MCP',
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

### Со встроенными в SDK серверами MCP

SDK предоставляет `tool` и `createSdkMcpServer` для создания серверов MCP, которые работают в том же процессе, что и ваше приложение SDK. Это полезно, когда вы хотите предоставить ИИ доступ к пользовательским инструментам без запуска отдельного серверного процесса.

#### `tool(name, description, inputSchema, handler)`

Создает определение инструмента с выводом типов из схемы Zod.

| Параметр      | Тип                                | Описание                                                                 |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Имя инструмента (1-64 символа, начинается с буквы, алфавитно-цифровые символы и подчеркивания) |
| `description` | `string`                           | Человекочитаемое описание того, что делает инструмент                     |
| `inputSchema` | `ZodRawShape`                      | Объект схемы Zod, определяющий входные параметры инструмента              |
| `handler`     | `(args, extra) => Promise<Result>` | Асинхронная функция, которая выполняет инструмент и возвращает блоки контента MCP |

Обработчик должен возвращать объект `CallToolResult` со следующей структурой:

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

Создает экземпляр MCP-сервера с встроенным SDK.

| Параметр  | Тип                      | По умолчанию | Описание                              |
| --------- | ------------------------ | ------------ | -------------------------------------- |
| `name`    | `string`                 | Обязательный | Уникальное имя для MCP-сервера        |
| `version` | `string`                 | `'1.0.0'`    | Версия сервера                        |
| `tools`   | `SdkMcpToolDefinition[]` | -            | Массив инструментов, созданных с помощью `tool()` |

Возвращает объект `McpSdkServerConfigWithInstance`, который можно передать непосредственно в опцию `mcpServers`.

#### Пример

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Определение инструмента с использованием схемы Zod
const calculatorTool = tool(
  'calculate_sum',
  'Сложить два числа',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Создание сервера MCP
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Использование сервера в запросе
const result = query({
  prompt: 'Сколько будет 42 + 17?',
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
  prompt: 'Длительная задача...',
  options: {
    abortController,
  },
});

// Прервать через 5 секунд
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Запрос был прерван');
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
  // ... операции с запросом
} catch (error) {
  if (isAbortError(error)) {
    // Обработка прерывания
  } else {
    // Обработка других ошибок
  }
}
```