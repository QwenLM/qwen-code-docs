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
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (стабильная). SDK использует встроенный CLI по умолчанию; устанавливайте `pathToQwenExecutable` только если вам нужен пользовательский бинарник `qwen` или CLI-сборка.

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
| `pathToQwenExecutable`    | `string`                                       | Встроенный CLI  | Путь к исполняемому файлу Qwen Code. Поддерживается несколько форматов: `'qwen'` (родной бинарник из PATH), `'/path/to/qwen'` (явный путь), `'/path/to/cli.js'` (Node.js сборка), `'node:/path/to/cli.js'` (форсировать Node.js), `'bun:/path/to/cli.js'` (форсировать Bun). Если не указан, SDK использует встроенный CLI из пакета. |
| `permissionMode`          | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`     | Режим разрешений, управляющий одобрением выполнения инструментов. Подробнее см. [Режимы разрешений](#permission-modes).                                                                                                                                                                                                                                                                                                                                                                      |
| `canUseTool`              | `CanUseTool`                                   | -               | Пользовательский обработчик для одобрения выполнения инструментов. Вызывается, когда инструмент требует подтверждения. Должен ответить в течение 60 секунд, иначе запрос будет автоматически отклонён. См. [Пользовательский обработчик разрешений](#custom-permission-handler).                                                                                                                                                                                                           |
| `env`                     | `Record<string, string>`                       | -               | Переменные окружения, передаваемые процессу Qwen Code. Объединяются с окружением текущего процесса.                                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`            | `string \| QuerySystemPromptPreset`            | -               | Конфигурация системного промпта для основной сессии. Используйте строку, чтобы полностью заменить встроенный системный промпт Qwen Code, или объект-пресет, чтобы сохранить встроенный промпт и добавить дополнительные инструкции.                                                                                                                                                                                                                                                            |
| `mcpServers`              | `Record<string, McpServerConfig>`              | -               | MCP (Model Context Protocol) серверы для подключения. Поддерживает внешние серверы (stdio/SSE/HTTP) и встроенные серверы SDK. Внешние настраиваются с опциями транспорта, такими как `command`, `args`, `url`, `httpUrl` и т.д. Серверы SDK используют `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                       |
| `abortController`         | `AbortController`                              | -               | Контроллер для отмены сессии запроса. Вызов `abortController.abort()` завершает сессию и освобождает ресурсы.                                                                                                                                                                                                                                                                                                                                                                               |
| `debug`                   | `boolean`                                      | `false`         | Включить отладочный режим для подробного логирования от CLI-процесса.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `maxSessionTurns`         | `number`                                       | `-1` (без лим.) | Максимальное количество шагов беседы до автоматического завершения сессии. Должно быть целым числом. Шаг состоит из сообщения пользователя и ответа ассистента.                                                                                                                                                                                                                                                                                                                              |
| `coreTools`               | `string[]`                                     | -               | Использует устаревшую семантику белого списка `coreTools` / CLI `--core-tools`. Если указан, для сессии регистрируются только совпадающие основные инструменты. Это единственная опция в стиле белого списка, ограничивающая регистрацию встроенных инструментов; правило `permissions.deny` / `excludeTools` на весь инструмент (а также `tools.disabled` в settings.json) также удаляет инструмент из реестра. `permissions.allow` в settings.json — это чистое автоодобрение, которое никогда не удаляет, не понижает и не скрывает инструмент (#10075). Чтобы исключить схему инструмента из начального запроса к модели, используйте `tools.eager` в settings.json (требуется перезапуск, #9827) — `tool_search`, `structured_output`, инструменты жизненного цикла plan-mode, `task_stop`, `mcp__*` и `computer_use__*` освобождены от этого списка и загружаются в обычном режиме; чтобы удалить его полностью, используйте правило `excludeTools` / `permissions.deny` на весь инструмент — правило со спецификатором (например, `'Bash(rm *)'`) блокирует только совпадающие вызовы во время выполнения. Инструменты MCP освобождены от удаления на основе deny: скрывайте их с помощью фильтров `excludeTools` / `tools.disabled` на уровне сервера (deny всё равно блокирует их вызовы во время выполнения). Пример: `['read_file', 'edit', 'run_shell_command']`. |
| `excludeTools`            | `string[]`                                     | -               | Эквивалент `permissions.deny` в settings.json. Исключённые инструменты сразу возвращают ошибку разрешения. Имеет наивысший приоритет над всеми остальными настройками разрешений. Поддерживает псевдонимы имён инструментов и шаблоны: имя инструмента (`'write_file'`), префикс команды (`'Bash(rm *)'`) или шаблоны путей (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                            |
| `allowedTools`            | `string[]`                                     | -               | Эквивалент `permissions.allow` в settings.json для автоодобрения. Совпадающие инструменты обходят callback `canUseTool` и выполняются автоматически. Применяется только когда инструмент требует подтверждения. Как и `permissions.allow`, это чистое автоодобрение, которое никогда не влияет на то, какие инструменты регистрируются и какие схемы отправляются (#10075). Поддерживает те же шаблоны, что и `excludeTools`. Пример: `['Bash(git status)', 'Bash(npm test)']`. |
| `authType`                | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -               | Тип аутентификации для сервиса ИИ. При указании SDK передаёт его в CLI как `--auth-type`.                                                                                                                                                                                                                                                                                                                                                                                                     |
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
import { query } from '@qwen-code/sdk';

const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 60 секунд для callback разрешений
      mcpRequest: 600000, // 10 минут для вызовов MCP инструментов
      controlRequest: 60000, // 60 секунд для управляющих запросов
      streamClose: 15000, // 15 секунд для ожидания закрытия потока
    },
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

`interrupt()` отменяет только текущий ход. Для многошагового запроса, созданного с асинхронным итерируемым промптом, запрос и его входной поток остаются открытыми, поэтому последующие сообщения из итерируемого объекта обрабатываются в обычном режиме. Используйте `close()` или отмените настроенный `AbortController`, когда хотите завершить всю сессию.

## Session ID, предоставляемые вызывающим кодом демона

`DaemonClient.createOrAttachSession` принимает опциональный `sessionId` для вызывающих кодов, которым необходимо сохранить идентификатор до создания сессии:

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

SDK требует возможность демона `session_id_override` перед отправкой мутации. REST-режим сериализует `sessionId` напрямую; активный ACP-адаптер отображает его в `session/new._meta["qwen-code/sessionId"]`. SDK проверяет ответ об успехе и выбрасывает `DaemonSessionIdProtocolError`, если демон возвращает другой ID.

Эта опция всегда создаёт новую сессию-поток и не является идемпотентным присоединением. Если результат создания неоднозначен, используйте известный ID с load или resume. Пропуск опции сохраняет существующее поведение create-or-attach.

## Общение с запущенными сессиями

`@qwen-code/sdk/peer` позволяет программе, не являющейся сессией Qwen Code, присоединиться к сессиям, запущенным тем же пользователем на той же машине — голосовой фронтенд, ретранслятор, наблюдатель за сборкой. Программа отображается в `qwen sessions ps` и в `list_agents` каждой сессии, у которой включён `agents.crossSessionMessaging` — что также позволяет этим сессиям отправлять ей сообщения по имени с помощью `send_message`. Она может отвечать им. Работает только на Node и не требует ничего, кроме самого Node.

```typescript
import { PeerEndpoint } from ' @qwen-code/sdk/peer';

const endpoint = await PeerEndpoint.start({
  name: 'voice-bridge',
  onMessage: (message) =>
    console.log(`${message.fromName}: ${message.content}`),
});

const [session] = await endpoint.list();
if (session) {
  const sent = await endpoint.send({
    to: session.address,
    content: 'What are you working on?',
  });
  if (sent.kind === 'sent') {
    const receipt = await endpoint.awaitReceipt(sent.msgId, { final: true });
    console.log(receipt?.status); // delivered, denied, refused, ...
  }
}

await endpoint.close();
```

Такое сообщение удерживается для проверки пользователем сессии. Чтобы направлять сессию без такой проверки, создайте токен контроллера с помощью `qwen sessions controllers add --label voice-bridge`, передайте его endpoint'у и отметьте отправки, которые должны его предъявлять:

```typescript
const endpoint = await PeerEndpoint.start({
  name: 'voice-bridge',
  controllerToken: process.env['QWEN_CONTROLLER_TOKEN'],
});
await endpoint.send({
  to: 'my-app-3f',
  content: 'run the tests',
  controller: true,
});
```

Что нужно знать:

- Сессия имеет входящий ящик только пока включена настройка `agents.crossSessionMessaging`, которая по умолчанию выключена. Без неё сессия не появляется в `list()`, а её собственные `list_agents` и `send_message` также не видят программу и не могут её достичь. `qwen sessions ps` показывает программу в любом случае.
- Сообщение доставляется без проверки ровно в двух случаях: отправка предъявляет токен контроллера (`controller: true`) или её `fromMode` указывает на собственный класс проверки принимающей сессии. `fromMode` — это утверждение, которое ничто не аутентифицирует, поэтому программа, не являющаяся сессией кодирования, должна его опустить. Ничто в записи — ни `kind`, ни `name` — не обеспечивает доставку. Настройка `agents.crossSessionInbound` принимающей сессии имеет приоритет над обоими: `hold` или `refuse` там побеждает токен контроллера.
- Отмечайте только те отправки, которые предназначены для направления сессии. Адреса разрешаются из записей, которые может писать любая программа, запущенная от вашего имени, поэтому отправка контроллера предъявляет токен тому процессу, чья запись отвечает на этот адрес. Отправка контроллера другому peer endpoint'у отбрасывается непрочитанной, потому что входящий ящик endpoint'а принимает только свой собственный токен.
- Входящий ящик endpoint'а не применяет никаких защит, которые сессия Qwen Code применяет к себе: нет ограничения скорости, нет удержаний и нет окна дубликатов сверх последних 200 сообщений, на которые он ответил. На каждое сообщение отвечают `delivered` и передают в `onMessage` по мере поступления, поэтому применяйте свои собственные ограничения там, если они нужны. Без `onMessage` на каждое сообщение отвечают `refused`.
- Вызывайте `close()` перед выходом, включая из ваших собственных обработчиков сигналов. Процесс, завершённый без закрытия, оставляет свою запись до тех пор, пока сессия Qwen Code не просмотрит директорию и не обнаружит, что процесс исчез.
- Только UNIX domain сокеты: Windows пока не поддерживается.

Схема записи, формат передачи и состояния квитанции документированы в [Cross-Session Protocol](../users/features/cross-session-protocol.md).

## Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи отклоняются, если не одобрены через callback `canUseTool` или не находятся в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, предписывая ИИ сначала представить план.
- **`auto-edit`**: Автоутверждение инструментов редактирования (`edit`, `write_file`, `notebook_edit`), остальные требуют подтверждения.
- **`auto`**: Использует встроенный классификатор для автоутверждения безопасных вызовов инструментов и блокировки рискованных, с фолбэком на ручное подтверждение после повторяющихся блокировок политикой или сбоев классификатора.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Цепочка приоритета разрешений

Приоритет принятия решения (от высшего к низшему): `deny` > `ask` > `allow` > _(default/interactive mode)_

Применяется первое совпадение.

1. `excludeTools` / `permissions.deny` – Полностью блокирует инструменты (возвращает ошибку разрешения)
2. `permissions.ask` – Всегда требует подтверждения пользователя
3. `permissionMode: 'plan'` – Блокирует все инструменты, не предназначенные только для чтения
4. `permissionMode: 'yolo'` – Автоутверждение всех инструментов
5. `allowedTools` / `permissions.allow` – Автоутверждение совпадающих инструментов
6. `permissionMode: 'auto'` – Одобренные классификатором вызовы инструментов
7. callback `canUseTool` – Пользовательская логика одобрения (если предоставлен, не вызывается для разрешённых инструментов)
8. Поведение по умолчанию – Автоотклонение в режиме SDK (инструменты записи требуют явного одобрения)

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

// Определить инструмент со схемой Zod
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Создать MCP-сервер
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Использовать сервер в запросе
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

// Прервать через 5 секунд
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