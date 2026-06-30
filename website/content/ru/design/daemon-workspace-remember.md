# Daemon Workspace Remember — загрузка памяти без сессии

> **Статус**: Предложено — реализация в [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (ветка `codex/sessionless-daemon-remember`), еще не смержена.

---

## 1. Постановка задачи

Система управляемой памяти демона (автоматическое извлечение, dream agent) ранее
требовала активной сессии чата для записи воспоминаний (memories). Это создавало две проблемы:

1. **UI настроек не может записывать воспоминания** — панели настроек web-shell необходимо сохранять предоставленные пользователем факты (например, "всегда использовать строгий режим TypeScript") без создания или засорения видимой сессии чата.
2. **Засорение списка сессий** — создание временной сессии просто для выполнения команды `/remember` добавляет шум в список сессий и сбивает с толку пользователей, которые видят "сессии-призраки", что они никогда не открывали.

Решением является **endpoint для запоминания на уровне рабочего пространства без сессии**, который ставит задачи записи памяти в очередь, выполняет их через скрытый форк `AgentHeadless` (без создания сессии) и предоставляет статус через polling.

---

## 2. Обзор архитектуры

```
┌──────────────┐  POST /workspace/memory/remember   ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/remember/:id │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemoryRemember()
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     remember')          │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → runManagedRemember-  │
                                                     │    ByAgent (forked)     │
                                                     └─────────────────────────┘
```

Ключевые свойства:

- **Сессия не требуется** — bridge гарантирует, что дочерний процесс ACP запускается, но не создает/не загружает/не возобновляет никакую сессию ACP.
- **Последовательное выполнение** — задачи выполняются одна за другой через promise-chain lane, что предотвращает конкурентную запись в файловую систему управляемой памяти.
- **Скрытость** — форкнутый агент запускается с `name: 'managed-auto-memory-remember'` и невидим в списке сессий.
- **Объявление возможностей** — `workspace_memory_remember` в ответе `/capabilities` демона, с поддерживаемыми `modes: ['workspace', 'clean']`.

---

## 3. Эндпоинты API

### 3.1 `POST /workspace/memory/remember`

Постановка новой задачи запоминания в очередь.

**Запрос:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Поле          | Тип      | Обязательно | Описание                                                                                                    |
| ------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | да          | Факт для запоминания. Макс. 64 КиБ (длина в байтах UTF-8).                                                  |
| `contextMode` | `string` | нет         | `"workspace"` (по умолчанию) — агент видит контекст памяти рабочего пространства. `"clean"` — агент не видит предыдущую память пользователя. |

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
| 400    | `invalid_context_mode`       | Нераспознанное значение contextMode             |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id не зарегистрирован в bridge    |
| 409    | `managed_memory_unavailable` | Управляемая память не настроена для рабочего пространства |
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

- `status` будет `"queued"` или `"running"` в зависимости от того, началось ли выполнение задачи.
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

- **queued** — задача создана и ожидает слота в последовательной очереди (lane).
- **running** — вызов bridge находится в процессе выполнения; форкнутый агент работает.
- **completed** — агент успешно завершился; `result` заполнен.
- **failed** — агент выдал ошибку или превысил время ожидания; `error` заполнен.

Очередь (lane) хранит в общей сложности до **1000 задач** (завершенные задачи вытесняются по принципу FIFO при достижении лимита). Одновременно в состоянии ожидания (queued + running) может находиться не более **16 задач**.

---

## 5. Детали реализации

### 5.1 Последовательная очередь задач (`WorkspaceRememberTaskLane`)

Находится в `packages/cli/src/serve/workspace-remember.ts`. Поддерживает
`Map<taskId, TaskRecord>` и единую цепочку промисов (`this.tail`). Каждый
`enqueue()` добавляет функцию `run`, которая:

1. Устанавливает статус в `running`.
2. Вызывает `bridge.runWorkspaceMemoryRemember({ content, contextMode })`.
3. При успехе: устанавливает статус в `completed`, заполняет `result`, публикует событие `memory_changed`.
4. При ошибке: устанавливает статус в `failed`, заполняет `error` стабильным публичным кодом ошибки.

Очередь гарантирует строгую сериализацию — одновременно выполняется только одна задача запоминания, что предотвращает конкурентную запись в файловую систему управляемой памяти.

### 5.2 Слой Bridge (`HttpAcpBridge`)

В `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`) добавлены два метода:

- `isWorkspaceMemoryRememberAvailable()` — вызывает ext-method `qwen/control/workspace/memory/remember/availability` в дочернем процессе. Возвращает `boolean`. Используется для быстрого падения с ошибкой `409` перед постановкой в очередь.
- `runWorkspaceMemoryRemember(request)` — вызывает ext-method `qwen/control/workspace/memory/remember`. Таймаут составляет **300 с** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). НЕ создает и не загружает сессию.

Оба метода вызывают `ensureChannel()` (запуская дочерний процесс ACP, если необходимо) и перезапускают таймер простоя после завершения, если нет активных сессий.

### 5.3 Выполнение в дочернем процессе ACP (`QwenAgent.extMethod`)

В `packages/cli/src/acp-integration/acpAgent.ts` обработчик для
`workspaceMemoryRemember`:

1. Валидирует `content` (непустая строка, ≤64 КиБ) и `contextMode`.
2. Проверяет `config.isManagedMemoryAvailable()`.
3. Вызывает `runManagedRememberByAgent()` с сигналом прерывания **295 с** (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — чуть меньше таймаута bridge, чтобы гарантировать прерывание дочернего процесса до срабатывания защиты bridge).

### 5.4 Базовая логика запоминания (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. Формирует чистый системный промпт памяти из индекса управляемой памяти проекта.
2. При необходимости удаляет предыдущую память пользователя (если `contextMode === 'clean'`).
3. Создает `memoryScopedAgentConfig`, который ограничивает файловый ввод-вывод только директориями памяти.
4. Запускает **форкнутый headless-агент** (`runForkedAgent`) с:
   - Имя: `managed-auto-memory-remember`
   - Инструменты: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Макс. ходов: 6
   - Макс. время: 5 минут
5. Проверяет, что все затронутые файлы находятся в пределах разрешенных путей памяти (`classifyTouchedScopes`). Выбрасывает `remember_path_escape`, если агент записал данные за пределы директорий памяти.
6. Перестраивает индексы памяти для всех затронутых областей (scopes).
7. Возвращает `{ summary, filesTouched, touchedScopes }`.

### 5.5 Конфигурация агента с областью памяти (`packages/core/src/memory/memory-scoped-agent-config.ts`)

Функция `createMemoryScopedAgentConfig()` создает ограниченный в правах wrapper `Config`, который:

- **Инструменты записи** (`write_file`, `edit`): разрешены только в корне auto-memory проекта или корне памяти пользователя (`~/.qwen/memories`).
- **Инструменты чтения** (`read_file`, `grep`, `ls`): когда `restrictReadsToMemoryPaths` равно true, разрешены только в директориях памяти.
- **Shell**: по умолчанию отключен; если включен, разрешены только команды на чтение.
- Разрешает симлинки для предотвращения выхода за пределы путей (path-traversal).

---

## 6. События

### `memory_changed` (scope: `managed`)

Публикуется в потоке SSE-событий демона (`GET /session/:id/events`) как событие `memory_changed` с `scope: 'managed'`, когда задача запоминания успешно завершается. Клиенты, подписанные на поток событий для конкретной сессии, получают это уведомление.

**Полезная нагрузка (Payload):**

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

| Поле            | Тип         | Описание                                              |
| --------------- | ----------- | ----------------------------------------------------- |
| `scope`         | `"managed"` | Отделяет от событий `memory_changed` на основе файлов |
| `source`        | `string`    | Всегда `"workspace_memory_remember"` для данной функции |
| `taskId`        | `string`    | Связывается с задачей, возвращенной через POST        |
| `touchedScopes` | `string[]`  | Какие области памяти были записаны: `"user"`, `"project"` |

Поле `originatorClientId` (если оно было указано при POST-запросе) прикрепляется к конверту события, чтобы шина событий могла направить его исходному клиенту.

---

## 7. Обработка ошибок

### Коды ошибок

| Код                          | Источник            | Значение                                             |
| ---------------------------- | ------------------- | ---------------------------------------------------- |
| `invalid_content`            | HTTP-роут           | Контент отсутствует, пуст или превышает 64 КиБ       |
| `invalid_context_mode`       | HTTP-роут           | contextMode не равен `"workspace"` или `"clean"`     |
| `invalid_client_id`          | HTTP-роут           | Заголовок Client-Id отсутствует в известном наборе bridge |
| `managed_memory_unavailable` | Bridge / ACP child  | Рабочее пространство не настроено для управляемой памяти |
| `remember_queue_full`        | Очередь задач       | Достигнут лимит в 16 ожидающих задач                 |
| `remember_path_escape`       | Базовая логика запоминания | Агент записал данные по пути за пределами директорий управляемой памяти |
| `remember_failed`            | Catch-all           | Неклассифицированный сбой агента, таймаут или внутренняя ошибка |
| `remember_task_not_found`    | HTTP-роут           | GET-запрос для неизвестного или неавторизованного ID задачи |

### Цепочка таймаутов

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

Дочерний процесс прерывается до того, как истечет таймаут bridge, что гарантирует передачу чистой ошибки вместо таймаута на уровне транспорта.

---

## 8. Интеграция с SDK

### TypeScript SDK (`@qwen-code/sdk-typescript`)

Два новых метода в `DaemonClient`:

```typescript
// Queue a remember task
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Poll until terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'
```

### Нормализация событий UI

Нормализатор SDK сопоставляет сырое SSE-событие `memory_changed` (с `scope: 'managed'`) с `DaemonUiWorkspaceMemoryChangedEvent`:

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Это расширяет существующий тип события `workspace.memory.changed`, который ранее содержал только `scope: 'workspace' | 'global'` для записей в файлы QWEN.md на основе файловой системы.

---

## 9. Обоснование архитектуры

### Почему без сессии?

Слэш-команда `/remember` в CLI уже работает в рамках сессии. Но UI настроек и программные вызовы SDK не должны создавать сессию просто для сохранения факта. Сессия подразумевает историю разговора, отслеживание ходов и видимость в списке сессий — ни одно из этого не применимо к одноразовой записи памяти (fire-and-forget).

### Почему последовательное выполнение?

Система управляемой памяти хранит факты в markdown-файлах с индексами. Конкурентная запись из нескольких задач запоминания может повредить индексы или вызвать конфликты слияния. Однопоточная очередь (lane) — это самое простое и корректное решение.

### Почему очередь задач (а не синхронный вызов)?

Запись памяти включает LLM-агента, который решает, _где_ и _как_ сохранить факт (выбирая между областями user и project, подбирая правильный файл, форматируя). Это занимает 2–30 секунд. Синхронный HTTP-запрос либо превысит таймаут, либо заблокирует клиент. Паттерн асинхронной очереди с опросом (polling) сохраняет простоту HTTP-контракта и позволяет клиентам отображать UI прогресса.

### Зачем нужен contextMode?

- `"workspace"` (по умолчанию) — агент запоминания видит существующие воспоминания как контекст, что позволяет ему дедуплицировать или обновлять существующие записи.
- `"clean"` — агент не видит предыдущую память пользователя; полезно, когда вызывающая сторона хочет принудительно выполнить новую запись без логики дедупликации (например, при массовом импорте).

### Почему ограничить чтение путями памяти?

Агент запоминания должен читать и записывать данные только в директориях управляемой памяти. Это предотвращает сценарий prompt-injection, при котором специально сформированный `content` обманывает агента, заставляя его читать конфиденциальные файлы проекта и раскрывать их содержимое в записях памяти.