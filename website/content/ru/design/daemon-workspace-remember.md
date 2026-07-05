# Задачи памяти рабочей области демона — управляемая память без сессий

> **Статус**: Предложено — реализация в [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (ветка `codex/sessionless-daemon-remember`), еще не вмержено.

---

## 1. Постановка задачи

Система управляемой памяти демона (автоматическое извлечение, dream-агент) ранее требовала активной сессии чата для записи воспоминаний. Это создавало две проблемы:

1. **UI настроек не может записывать воспоминания** — панели настроек web-shell необходимо сохранять предоставленные пользователем факты (например, "всегда использовать строгий режим TypeScript") без создания или засорения видимой сессии чата.
2. **Засорение списка сессий** — создание одноразовой сессии просто для выполнения команды `/remember` добавляет шум в список сессий и сбивает с толку пользователей, которые видят сессии-призраки, которые они никогда не открывали.

Решение — это **API задач памяти на уровне рабочей области без сессий**, который ставит в очередь задачи remember, forget и dream, выполняет их без создания видимой сессии и предоставляет доступ к статусу через опрос.

---

## 2. Обзор архитектуры

```
┌──────────────┐  POST /workspace/memory/{task}      ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/{task}/:id  │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemory*
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     {task}')            │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → remember / forget /  │
                                                     │    dream core logic     │
                                                     └─────────────────────────┘
```

Ключевые свойства:

- **Сессия не требуется** — мост гарантирует, что дочерний процесс ACP запускается, но не создает/не загружает/не возобновляет ни одну сессию ACP.
- **Последовательное выполнение** — задачи выполняются по одной через очередь на цепочке промисов, что предотвращает параллельную запись в файловую систему управляемой памяти.
- **Скрытность** — remember/dream выполняются через скрытых агентов, а forget использует скрытую конфигурацию памяти; ни одна из операций не создает видимых сессий.
- **Объявление возможностей** — `workspace_memory_remember`, `workspace_memory_forget` и `workspace_memory_dream` в ответе демона на `/capabilities`. Remember также объявляет `modes: ['workspace', 'clean']`.

---

## 3. Эндпоинты API

### 3.1 `POST /workspace/memory/remember`

Поставить в очередь новую задачу remember.

**Запрос:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Поле          | Тип      | Обязательно | Описание                                                                                                 |
| ------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | да          | Факт для запоминания. Макс. 64 КиБ (длина в байтах UTF-8).                                               |
| `contextMode` | `string` | нет         | `"workspace"` (по умолчанию) — агент видит контекст памяти рабочей области. `"clean"` — агент не видит предыдущую память пользователя. |

**Заголовки:**

- `Authorization: Bearer <token>` (обязательно)
- `X-Qwen-Client-Id: <clientId>` (опционально — ограничивает видимость задачи)

**Ответ `202 Accepted`:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**Ответы с ошибками:**

| Статус | Код                          | Условие                                         |
| ------ | ---------------------------- | ----------------------------------------------- |
| 400    | `invalid_content`            | Отсутствует, пустой или превышен размер контента|
| 400    | `invalid_context_mode`       | Неизвестное значение contextMode                |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id не зарегистрирован в мосте     |
| 409    | `managed_memory_unavailable` | Управляемая память не настроена для рабочей области |
| 429    | `remember_queue_full`        | В очереди уже находится 16 ожидающих задач      |
| 500    | `remember_failed`            | Проверка доступности завершилась неожиданной ошибкой |

### 3.2 `GET /workspace/memory/remember/:taskId`

Опрос статуса задачи.

**Заголовки:**

- `Authorization: Bearer <token>` (обязательно)
- `X-Qwen-Client-Id: <clientId>` (опционально — должен совпадать с инициатором для просмотра задачи)

**Ответ `200 OK` (queued/running):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "result": null,
  "error": null
}
```

- `status` будет равен `"queued"` или `"running"` в зависимости от того, началось ли выполнение задачи.
- `result`: присутствует (не null) только когда `status === "completed"`.
- `error`: присутствует (не null) только когда `status === "failed"`.

**Ответ `200 OK` (completed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "completed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:05.000Z",
  "result": {
    "summary": "Saved dark-mode preference to user memory.",
    "filesTouched": ["~/.qwen/memories/user/user.md"],
    "touchedScopes": ["user"]
  }
}
```

**Ответ `200 OK` (failed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "failed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:03.000Z",
  "error": {
    "code": "remember_path_escape",
    "message": "Remember agent touched a path outside managed memory."
  }
}
```

**Ответы с ошибками:**

| Статус | Код                       | Условие                                            |
| ------ | ------------------------- | -------------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id не зарегистрирован                |
| 404    | `remember_task_not_found` | Задача не существует или принадлежит другому клиенту |

---

### 3.3 `POST /workspace/memory/forget`

Поставить в очередь задачу forget. Демон выбирает соответствующие записи управляемой автопамяти и удаляет их без создания сессии.

**Запрос:**

```json
{
  "query": "old preference"
}
```

| Поле    | Тип      | Обязательно | Описание                                                             |
| ------- | -------- | ----------- | -------------------------------------------------------------------- |
| `query` | `string` | да          | Описание на естественном языке для забывания. Макс. 64 КиБ (длина в байтах UTF-8). |

Первоначальный ответ — `202 Accepted` с id задачи `forget-...`. Выполняйте опрос `GET /workspace/memory/forget/:taskId` до достижения терминального состояния.

**Результат при завершении:**

```json
{
  "summary": "Forgot 1 memory entry.",
  "removedEntries": [
    {
      "topic": "project",
      "summary": "old preference",
      "filePath": "/path/to/memory.md"
    }
  ],
  "touchedTopics": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

Опрос статуса задачи forget. Структура совпадает с опросом задачи remember, за исключением отсутствия поля `contextMode`, а терминальные ошибки используют `forget_task_not_found` для неизвестных или неавторизованных id задач.

### 3.5 `POST /workspace/memory/dream`

Поставить в очередь задачу dream. Демон запускает процесс сжатия (dream compaction) управляемой автопамяти без создания сессии.

**Запрос:** пустой JSON-объект или отсутствие тела.

Первоначальный ответ — `202 Accepted` с id задачи `dream-...`. Выполняйте опрос `GET /workspace/memory/dream/:taskId` до достижения терминального состояния.

**Результат при завершении:**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

Опрос статуса задачи dream. Структура совпадает с опросом задачи remember, за исключением отсутствия поля `contextMode`, а терминальные ошибки используют `dream_task_not_found` для неизвестных или неавторизованных id задач.

---

## 4. Жизненный цикл задачи

```
            enqueue()
               │
               ▼
  ┌─────────────────────┐
  │       queued         │   (awaiting serial lane slot)
  └──────────┬──────────┘
             │  lane picks up
             ▼
  ┌─────────────────────┐
  │       running        │   (bridge.runWorkspaceMemoryRemember in progress)
  └──────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐    ┌──────────┐
│ completed│    │  failed  │
└──────────┘    └──────────┘
```

- **queued** — задача создана и ожидает в последовательной очереди.
- **running** — вызов моста находится в процессе выполнения; запущенный агент работает.
- **completed** — агент успешно завершил работу; `result` заполнен.
- **failed** — агент выдал ошибку или превысил время ожидания; `error` заполнен.

Очередь хранит до **1000 задач** всего (терминальные задачи вытесняются в порядке FIFO при достижении лимита). Одновременно в ожидании (queued + running) может находиться не более **16 задач**. Задачи forget и dream имеют общий меньший лимит в **8 ожидающих задач**, чтобы всплески ручного обслуживания не могли занять все слоты, необходимые для автоматической работы remember.

---

## 5. Детали реализации

### 5.1 Последовательная очередь задач (`WorkspaceRememberTaskLane`)

Находится в `packages/cli/src/serve/workspace-remember.ts`. Поддерживает `Map<taskId, TaskRecord>` и единую цепочку промисов (`this.tail`). Каждый `enqueue()` добавляет функцию `run`, которая:

1. Устанавливает статус в `running`.
2. Вызывает соответствующий метод моста: `runWorkspaceMemoryRemember`, `runWorkspaceMemoryForget` или `runWorkspaceMemoryDream`.
3. При успехе: устанавливает статус в `completed`, заполняет `result` и публикует событие `memory_changed`, если задача действительно изменила управляемую память.
4. При ошибке: устанавливает статус в `failed` и заполняет `error` стабильным публичным кодом ошибки.

Очередь гарантирует строгую сериализацию — одновременно выполняется только одна задача памяти рабочей области, что предотвращает параллельную запись в файловую систему управляемой памяти.

### 5.2 Слой моста (`HttpAcpBridge`)

Методы памяти рабочей области добавлены в `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`):

- `isWorkspaceMemoryRememberAvailable()` — вызывает ext-метод `qwen/control/workspace/memory/remember/availability` в дочернем процессе. Возвращает `boolean`. Используется для быстрого возврата ошибки `409` до постановки в очередь.
- `runWorkspaceMemoryRemember(request)` — вызывает ext-метод `qwen/control/workspace/memory/remember`. Таймаут составляет **300 с** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). НЕ создает и не загружает сессию.
- `runWorkspaceMemoryForget(request)` — вызывает ext-метод `qwen/control/workspace/memory/forget` и использует тот же таймаут моста. НЕ создает и не загружает сессию.
- `runWorkspaceMemoryDream()` — вызывает ext-метод `qwen/control/workspace/memory/dream` и использует тот же таймаут моста. НЕ создает и не загружает сессию.

Оба метода вызывают `ensureChannel()` (запуская дочерний процесс ACP, если необходимо) и после этого перезапускают таймер простоя, если нет активных сессий.
### 5.3 Выполнение дочернего процесса ACP (`QwenAgent.extMethod`)

В `packages/cli/src/acp-integration/acpAgent.ts` обработчик для
`workspaceMemoryRemember`, `workspaceMemoryForget` и `workspaceMemoryDream`:

1. Проверяет специфичные для задачи входные данные (`content`/`contextMode` для remember,
   `query` для forget).
2. Проверяет `config.isManagedMemoryAvailable()`.
3. Вызывает соответствующую базовую операцию с сигналом прерывания **295 с**
   (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — немного меньше таймаута моста,
   чтобы гарантировать прерывание дочернего процесса до срабатывания резервного таймаута моста).
   Для forget сигнал передается через `MemoryManager.forget`, выборку, запрос на стороне модели
   и мутации файловой системы во время применения.

### 5.4 Базовая логика Remember (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. Формирует чистый системный промпт памяти из индекса управляемой памяти проекта.
2. При необходимости удаляет предыдущую пользовательскую память (если `contextMode === 'clean'`).
3. Создает `memoryScopedAgentConfig`, который ограничивает операции ввода-вывода файлов
   только директориями памяти.
4. Запускает **форкнутый headless-агент** (`runForkedAgent`) со следующими параметрами:
   - Имя: `managed-auto-memory-remember`
   - Инструменты: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Максимум ходов: 6
   - Максимальное время: 5 минут
5. Проверяет, что все затронутые файлы находятся в пределах разрешенных путей памяти
   (`classifyTouchedScopes`). Выбрасывает `remember_path_escape`, если агент выполнил запись
   за пределами директорий памяти.
6. Перестраивает индексы памяти для всех затронутых областей.
7. Возвращает `{ summary, filesTouched, touchedScopes }`.

### 5.5 Конфигурация агента для областей памяти (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` создает ограниченный в правах враппер `Config`, который:

- **Инструменты записи** (`write_file`, `edit`): разрешены только в корне автопамяти проекта
  или в корне пользовательской памяти (`~/.qwen/memories`).
- **Инструменты чтения** (`read_file`, `grep`, `ls`): если `restrictReadsToMemoryPaths`
  равно true, разрешены только в директориях памяти.
- **Shell**: по умолчанию отключен; если включен, разрешены только команды на чтение.
- Разрешает симлинки для предотвращения выхода за пределы пути (path-traversal).

---

## 6. События

### `memory_changed` (scope: `managed`)

Публикуется в потоке SSE-событий демона (`GET /session/:id/events`) как событие
`memory_changed` с `scope: 'managed'`, когда задача памяти рабочего пространства успешно
завершается и фактически изменяет управляемую память. Клиенты, подписанные на поток событий
для конкретной сессии, получают это уведомление.

**Полезная нагрузка:**

```json
{
  "type": "memory_changed",
  "data": {
    "scope": "managed",
    "source": "workspace_memory_remember",
    "taskId": "remember-a1b2c3d4-...",
    "touchedScopes": ["user", "project"]
  }
}
```

| Поле            | Тип         | Описание                                                                                |
| --------------- | ----------- | --------------------------------------------------------------------------------------- |
| `scope`         | `"managed"` | Отличает от событий `memory_changed` на основе файлов                                   |
| `source`        | `string`    | `"workspace_memory_remember"`, `"workspace_memory_forget"` или `"workspace_memory_dream"` |
| `taskId`        | `string`    | Связан с задачей, возвращаемой через POST                                               |
| `touchedScopes` | `string[]`  | Какие области памяти были изменены: `"user"`, `"project"`                               |

`originatorClientId` (если указан при POST-запросе) прикрепляется к конверту события,
чтобы шина событий могла направить его клиенту-инициатору.

---

## 7. Обработка ошибок

### Коды ошибок

| Код                          | Источник              | Значение                                                 |
| ---------------------------- | --------------------- | -------------------------------------------------------- |
| `invalid_content`            | HTTP-роут             | Content отсутствует, пуст или превышает 64 КиБ           |
| `invalid_context_mode`       | HTTP-роут             | contextMode не равен `"workspace"` или `"clean"`         |
| `invalid_query`              | HTTP-роут             | Запрос forget отсутствует, пуст или превышает 64 КиБ     |
| `invalid_client_id`          | HTTP-роут             | Заголовок Client-Id отсутствует в известном наборе моста |
| `managed_memory_unavailable` | Мост / дочерний ACP   | Рабочее пространство не настроено для управляемой памяти |
| `remember_queue_full`        | Очередь задач         | Достигнут лимит в 16 ожидающих задач                     |
| `remember_path_escape`       | Базовая логика remember | Агент выполнил запись по пути за пределами директорий управляемой памяти |
| `remember_failed`            | Catch-all             | Неклассифицированный сбой агента, таймаут или внутренняя ошибка |
| `remember_task_not_found`    | HTTP-роут             | GET для неизвестного или неавторизованного ID задачи     |
| `forget_task_not_found`      | HTTP-роут             | GET для неизвестного или неавторизованного ID задачи forget |
| `dream_task_not_found`       | HTTP-роут             | GET для неизвестного или неавторизованного ID задачи dream |

### Цепочка таймаутов

```
Форкнутый раннер агента:       5 мин maxTimeMinutes
Сигнал прерывания дочернего процесса: 295 с  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Таймаут моста:                 300 с  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

Дочерний процесс прерывается до истечения таймаута моста, что гарантирует передачу
чистой ошибки, а не таймаута на транспортном уровне.

---

## 8. Интеграция с SDK

### TypeScript SDK (`@qwen-code/sdk-typescript`)

Методы памяти рабочего пространства в `DaemonClient`:

```typescript
// Поставить задачу remember в очередь
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Опрос до получения терминального статуса
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### Нормализация событий UI

Нормализатор SDK сопоставляет сырое SSE-событие `memory_changed` (с
`scope: 'managed'`) с `DaemonUiWorkspaceMemoryChangedEvent`:

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Это расширяет существующий тип события `workspace.memory.changed`, который ранее
содержал только `scope: 'workspace' | 'global'` для записей в QWEN.md на основе файлов.

---

## 9. Обоснование дизайна

### Почему без сессий?

Slash-команда `/remember` в CLI уже работает в рамках сессии. Однако UI настроек
и программные вызовы SDK не должны создавать сессию только для сохранения факта.
Сессия подразумевает историю диалога, отслеживание ходов и видимость в списке сессий —
ни одно из этого не применимо к одноразовой записи памяти (fire-and-forget).

### Почему последовательное выполнение?

Система управляемой памяти хранит факты в markdown-файлах с индексами. Параллельная
запись из нескольких задач remember может повредить индексы или привести к конфликтам
слияния. Однопоточная очередь — это самое простое и корректное решение.

### Почему очередь задач (а не синхронный режим)?

Запись памяти включает LLM-агента, который решает, _где_ и _как_ сохранить факт
(выбирая между пользовательской и проектной областью, подбирая нужный файл, форматируя).
Это занимает от 2 до 30 секунд. Синхронный HTTP-запрос либо превысит таймаут, либо
заблокирует клиент. Паттерн асинхронной очереди с опросом сохраняет простоту
HTTP-контракта и позволяет клиентам отображать UI прогресса.

### Зачем нужен `contextMode`?

- `"workspace"` (по умолчанию) — агент remember видит существующие воспоминания как
  контекст, что позволяет ему дедуплицировать или обновлять существующие записи.
- `"clean"` — агент не видит предыдущую пользовательскую память; полезно, когда вызывающий
  код хочет принудительно выполнить новую запись без логики дедупликации (например, при массовом импорте).

### Почему чтение ограничено путями памяти?

Агент remember должен читать и записывать данные только в директориях управляемой памяти.
Это предотвращает сценарий prompt-инъекции, при котором специально сформированный `content`
обманывает агента, заставляя его читать конфиденциальные файлы проекта и сохранять их в записях памяти.