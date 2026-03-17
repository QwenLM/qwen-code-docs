# TypeScript SDK

## @qwen-code/sdk

Минимальный экспериментальный TypeScript SDK для программного доступа к Qwen Code.

Свободно отправляйте запросы на добавление функций, сообщения об ошибках или pull request.

## Установка

```bash
npm install @qwen-code/sdk
```

## Требования

- Node.js >= 20.0.0
- Установленный и доступный в `PATH` [Qwen Code](https://github.com/QwenLM/qwen-code) версии >= 0.4.0 (стабильной)

> **Примечание для пользователей nvm**: Если вы используете nvm для управления версиями Node.js, SDK может не суметь автоматически обнаружить исполняемый файл Qwen Code. Укажите параметр `pathToQwenExecutable`, задав полный путь к бинарному файлу `qwen`.

## Быстрый старт

```typescript
import { query } from '@qwen-code/sdk';

// Запрос за один шаг
const result = query({
  prompt: 'Какие файлы находятся в текущем каталоге?',
  options: {
    cwd: '/путь/к/проекту',
  },
});

// Перебор сообщений
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Ассистент:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Результат:', message.result);
  }
}
```

## Справочник по API

### `query(config)`

Создаёт новую сессию запроса к Qwen Code.

#### Параметры

- `prompt`: `string | AsyncIterable<SDKUserMessage>` — запрос для отправки. Используйте строку для запросов за один шаг или асинхронный итерируемый объект для многошаговых диалогов.
- `options`: `QueryOptions` — параметры конфигурации для сессии запроса.

#### QueryOptions

| Параметр                 | Тип                                            | Значение по умолчанию | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`       | Рабочая директория для сеанса запроса. Определяет контекст, в котором выполняются операции с файлами и команды.                                                                                                                                                                                                                                                                                                                                                                                 |
| `model`                  | `string`                                       | —                     | Используемая ИИ-модель (например, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Имеет приоритет над переменными окружения `OPENAI_MODEL` и `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                     |
| `pathToQwenExecutable`   | `string`                                       | Обнаруживается автоматически | Путь к исполняемому файлу Qwen Code. Поддерживает несколько форматов: `'qwen'` (собственная двоичная программа из `PATH`), `'/путь/к/qwen'` (явный путь), `'/путь/к/cli.js'` (сборка для Node.js), `'node:/путь/к/cli.js'` (принудительное использование среды выполнения Node.js), `'bun:/путь/к/cli.js'` (принудительное использование среды выполнения Bun). Если не указан, происходит автоматическое обнаружение из следующих источников: переменная окружения `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`           | Режим разрешений, управляющий подтверждением выполнения инструментов. Подробнее см. в разделе [Режимы разрешений](#permission-modes).                                                                                                                                                                                                                                                                                                                                                         |
| `canUseTool`             | `CanUseTool`                                   | —                     | Пользовательский обработчик разрешений для подтверждения выполнения инструментов. Вызывается при необходимости подтверждения использования инструмента. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонён. Подробнее см. в разделе [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                             |
| `env`                    | `Record<string, string>`                       | —                     | Переменные окружения, передаваемые процессу Qwen Code. Объединяются с текущими переменными окружения процесса.                                                                                                                                                                                                                                                                                                                                                                              |
| `mcpServers`             | `Record<string, McpServerConfig>`              | —                     | Серверы MCP (Model Context Protocol), с которыми необходимо установить соединение. Поддерживает внешние серверы (stdio/SSE/HTTP) и серверы, встроенные в SDK. Внешние серверы настраиваются с помощью параметров транспорта, таких как `command`, `args`, `url`, `httpUrl` и др. Серверы SDK используют конструкцию `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                               |
| `abortController`        | `AbortController`                              | —                     | Контроллер для отмены сеанса запроса. Вызовите `abortController.abort()`, чтобы завершить сеанс и освободить ресурсы.                                                                                                                                                                                                                                                                                                                                                                      |
| `debug`                  | `boolean`                                      | `false`               | Включение режима отладки для подробного логирования из процесса CLI.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `maxSessionTurns`        | `number`                                       | `-1` (без ограничений) | Максимальное количество ходов диалога до автоматического завершения сеанса. Ход состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                                                      |
| `coreTools`              | `string[]`                                     | —                     | Эквивалент параметра `tool.core` в файле `settings.json`. При указании доступны только эти инструменты. Пример: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                         |
| `excludeTools`           | `string[]`                                     | —                     | Эквивалент параметра `tool.exclude` в файле `settings.json`. Исключённые инструменты немедленно возвращают ошибку разрешения. Имеет наивысший приоритет среди всех других настроек разрешений. Поддерживает сопоставление по шаблону: имя инструмента (`'write_file'`), класс инструмента (`'ShellTool'`) или префикс команды оболочки (`'ShellTool(rm )'`).                                                                                                                                                                 |
| `allowedTools`           | `string[]`                                     | —                     | Эквивалент параметра `tool.allowed` в файле `settings.json`. Инструменты, соответствующие шаблону, обходят обратный вызов `canUseTool` и выполняются автоматически. Действует только при необходимости подтверждения использования инструмента. Поддерживает тот же синтаксис сопоставления по шаблону, что и `excludeTools`.                                                                                                                                                                           |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`            | Тип аутентификации для ИИ-сервиса. Использование `'qwen-oauth'` в SDK не рекомендуется, поскольку учётные данные сохраняются в `~/.qwen` и могут требовать периодического обновления.                                                                                                                                                                                                                                                                                                         |
| `agents`                 | `SubagentConfig[]`                             | —                     | Конфигурация подагентов, которые могут быть вызваны в ходе сеанса. Подагенты — это специализированные ИИ-агенты для выполнения конкретных задач или работы в определённых областях.                                                                                                                                                                                                                                                                                                        |
| `includePartialMessages` | `boolean`                                      | `false`               | При значении `true` SDK отправляет неполные сообщения по мере их генерации, что позволяет осуществлять потоковую передачу ответа ИИ в реальном времени.                                                                                                                                                                                                                                                                                                                                      |

### Таймауты

SDK применяет следующие значения таймаутов по умолчанию:

| Таймаут          | По умолчанию | Описание                                                                                                                                 |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 минута     | Максимальное время ожидания ответа от обратного вызова `canUseTool`. При превышении этого времени запрос на использование инструмента автоматически отклоняется. |
| `mcpRequest`     | 1 минута     | Максимальное время выполнения вызовов инструментов MCP через SDK.                                                                          |
| `controlRequest` | 1 минута     | Максимальное время выполнения операций управления, таких как `initialize()`, `setModel()`, `setPermissionMode()` и `interrupt()`.         |
| `streamClose`    | 1 минута     | Максимальное время ожидания завершения инициализации перед закрытием stdin CLI в многораундовом режиме при работе с серверами SDK MCP. |

Эти таймауты можно настроить с помощью опции `timeout`:

```typescript
const query = qwen.query('Ваш запрос', {
  timeout: {
    canUseTool: 60000, // 60 секунд для обратного вызова разрешения
    mcpRequest: 600000, // 10 минут для вызовов инструментов MCP
    controlRequest: 60000, // 60 секунд для запросов управления
    streamClose: 15000, // 15 секунд для ожидания закрытия потока
  },
});
```

### Типы сообщений

SDK предоставляет типовые защитные функции для определения различных типов сообщений:

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

### Методы экземпляра `Query`

Экземпляр `Query`, возвращаемый функцией `query()`, предоставляет несколько методов:

```typescript
const q = query({ prompt: 'Привет', options: {} });

// Получение идентификатора сессии
const sessionId = q.getSessionId();

// Проверка закрытости сессии
const closed = q.isClosed();

// Прерывание текущей операции
await q.interrupt();

// Изменение режима разрешений в ходе сессии
await q.setPermissionMode('yolo');

// Изменение модели в ходе сессии
await q.setModel('qwen-max');

// Закрытие сессии
await q.close();
```

## Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи запрещены, если только они не одобрены через обратный вызов `canUseTool` или не указаны в списке `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, заставляя ИИ сначала представить план действий.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (например, `edit`, `write_file`), тогда как для остальных инструментов требуется подтверждение.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритетов разрешений

1. `excludeTools` — полностью блокирует указанные инструменты  
2. `permissionMode: 'plan'` — блокирует все инструменты, кроме инструментов только для чтения  
3. `permissionMode: 'yolo'` — автоматически одобряет все инструменты  
4. `allowedTools` — автоматически одобряет совпадающие инструменты  
5. Обратный вызов `canUseTool` — пользовательская логика одобрения  
6. Поведение по умолчанию — автоматический запрет в режиме SDK  

## Примеры

### Многоходовый диалог

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Создать файл hello.txt' },
    parent_tool_use_id: null,
  };

  // Ожидание выполнения некоторого условия или ввода пользователя
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Теперь прочитать файл обратно' },
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

  // Запросить подтверждение у пользователя для операций записи (в реальном приложении)
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
  prompt: 'Используйте пользовательский инструмент из моего сервера MCP',
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

### С встроенными в SDK серверами MCP

SDK предоставляет функции `tool` и `createSdkMcpServer` для создания серверов MCP, которые работают в том же процессе, что и ваше приложение на основе SDK. Это полезно, когда вы хотите предоставить ИИ пользовательские инструменты без запуска отдельного серверного процесса.

#### `tool(name, description, inputSchema, handler)`

Создаёт определение инструмента с выводом типов на основе схемы Zod.

| Параметр      | Тип                                | Описание                                                                 |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`         | `string`                           | Имя инструмента (1–64 символа, начинается с буквы, содержит только буквы, цифры и символы подчёркивания) |
| `description`  | `string`                           | Человекочитаемое описание функциональности инструмента                   |
| `inputSchema`  | `ZodRawShape`                      | Объект схемы Zod, определяющий входные параметры инструмента             |
| `handler`      | `(args, extra) => Promise<Result>` | Асинхронная функция, выполняющая инструмент и возвращающая блоки содержимого MCP |

Функция `handler` должна возвращать объект типа `CallToolResult` со следующей структурой:

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

Создаёт экземпляр сервера MCP, встроенный в SDK.

| Параметр  | Тип                      | По умолчанию | Описание                             |
| --------- | ------------------------ | ------------ | ------------------------------------ |
| `name`    | `string`                 | Обязательно  | Уникальное имя сервера MCP          |
| `version` | `string`                 | `'1.0.0'`    | Версия сервера                      |
| `tools`   | `SdkMcpToolDefinition[]` | —            | Массив инструментов, созданных с помощью `tool()` |

Возвращает объект `McpSdkServerConfigWithInstance`, который можно напрямую передать в опцию `mcpServers`.

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
  prompt: 'Чему равно 42 + 17?',
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
  prompt: 'Долгая операция...',
  options: {
    abortController,
  },
});

// Прерывание через 5 секунд
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
  // ... операции запроса
} catch (error) {
  if (isAbortError(error)) {
    // Обработка прерывания
  } else {
    // Обработка других ошибок
  }
}
```