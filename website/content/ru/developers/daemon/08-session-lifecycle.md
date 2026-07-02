# Жизненный цикл сессии и идентификация

## Обзор

**Сессия** демона — это один логический диалог, привязанный к одному ACP `sessionId`. Бридж ведет `SessionEntry` для каждой сессии (см. [`03-acp-bridge.md`](./03-acp-bridge.md)), связывая дочернее ACP-соединение с HTTP-учетом: FIFO промптов, FIFO изменений модели, шина событий, ожидающие разрешения, подключенные клиенты, heartbeat-сигналы, состояние восстановления и tombstone-метки терминальных фреймов.

**Клиент** демона идентифицируется по `X-Qwen-Client-Id` — непрозрачной строке, валидируемой демоном, которую HTTP-клиент передает в своих запросах. Бридж отслеживает, какие клиенты подключены к каким сессиям, и использует ID клиента-инициатора для управления политикой разрешений `designated`, журналами аудита и атрибуцией событий.

В этом документе описаны все переходы жизненного цикла сессии (создание / подключение / загрузка / возобновление / закрытие / завершение / вытеснение) и все поверхности идентификации, которые предоставляет демон.

## Обязанности

- Создание, подключение, восстановление и очистка сессий.
- Валидация `X-Qwen-Client-Id` и отклонение некорректных ID.
- Отслеживание нескольких подключенных клиентов для каждой сессии (`clientIds: Map<string, count>`, `attachCount`).
- Добавление `originatorClientId` в исходящие события.
- Обработка heartbeat-сигналов, чтобы дашборды знали, какие клиенты все еще подключены.
- Предоставление метаданных сессии (`displayName`), которые операторы устанавливают через `PATCH /session/:id/metadata`.
- Управление генерацией терминальных фреймов (`session_died`, `session_closed`, `client_evicted`, `stream_error`).

## Архитектура

| Задача                    | Источник                                                     | Примечания                                                                              |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `SessionEntry`            | `packages/acp-bridge/src/bridge.ts`                          | Структура для каждой сессии; полный список полей см. в [`03-acp-bridge.md`](./03-acp-bridge.md). |
| `BridgeSession` (public)  | `packages/acp-bridge/src/bridgeTypes.ts`                     | `{ sessionId, workspaceCwd, attached, clientId?, createdAt? }` возвращается HTTP-обработчикам. |
| `BridgeSessionState`      | `packages/acp-bridge/src/bridgeTypes.ts`                     | `LoadSessionResponse \| ResumeSessionResponse` кэшируется в записи как `restoreState`.  |
| `DaemonSession` (SDK)     | `packages/sdk-typescript/src/daemon/types.ts`                | `{ sessionId, workspaceCwd, attached, clientId?, createdAt? }`.                         |
| Валидация Client-id       | `packages/acp-bridge/src/bridge.ts` (вокруг `spawnOrAttach`) | Паттерн `[A-Za-z0-9._:-]{1,128}`; `InvalidClientIdError`, если формат неверен.          |
| Очистка при отключении сессии | `packages/cli/src/serve/server.ts`                       | Отслеживает отключения создателя сессии с помощью `attachCount` + `spawnOwnerWantedKill`. |

### Конечный автомат

```mermaid
stateDiagram-v2
    [*] --> SpawnInProgress: POST /session
    SpawnInProgress --> Live: успех newSession
    SpawnInProgress --> [*]: ошибка инициализации / ошибка спавна
    Live --> Live: attach (sessionScope=single, увеличение attachCount)
    Live --> Live: detach (уменьшение attachCount)
    Live --> RestoreInProgress: POST /session/:id/load или /resume
    RestoreInProgress --> Live: restoreState кэшируется в записи
    RestoreInProgress --> Live: RestoreInProgressError (объединение ожидающих)
    Live --> Closed: DELETE /session/:id (последний клиент)
    Live --> Died: выход ACP child / срабатывание channel.exited
    Closed --> [*]: терминальный фрейм session_closed
    Died --> [*]: терминальный фрейм session_died
```

### Подключение (attach) против создания (spawn)

В режиме `sessionScope: 'single'` (по умолчанию) `defaultEntry` бриджа используется всеми подключающимися клиентами. Запрос `POST /session`, поступающий при уже существующем `defaultEntry`, возвращает `attached: true` без создания нового ACP child. Бридж синхронно увеличивает `attachCount` и регистрирует `X-Qwen-Client-Id` вызывающего в `clientIds`.

В режиме `sessionScope: 'thread'` каждый поток может создавать отдельную сессию. Вызывающий все равно должен соблюдать лимит `maxSessions`.

### Идентификация

`X-Qwen-Client-Id` **не обязателен**, но **настоятельно рекомендуется**. Демон не генерирует его самостоятельно — клиенты выбирают его сами и переиспользуют в запросах, чтобы демон мог атрибутировать голоса, вести аудит событий и отслеживать переподключения.

Правила валидации:

- Набор символов: `[A-Za-z0-9._:-]`.
- Длина: 1–128.
- При выходе за эти пределы: `InvalidClientIdError` (`400`).

Демон добавляет `originatorClientId` в исходящие SSE-события, когда:

1. Запрос, вызвавший событие, содержал `X-Qwen-Client-Id`, И
2. Этот ID в данный момент зарегистрирован в наборе `clientIds` сессии, И
3. В сессии установлен `activePromptOriginatorClientId` (inline-события `sessionUpdate` и `permission_request` наследуют инициатора от активного промпта).

Анонимные вызывающие (без `X-Qwen-Client-Id`) нормально работают с политикой `first-responder`; `designated` отклоняет их голоса с ошибкой `permission_forbidden{ reason: 'designated_mismatch' }`; `consensus` отклоняет их по той же причине `forbidden`, так как голосующего нет в снимке `votersAtIssue` на момент выдачи; `local-only` — единственная политика, принимающая анонимных loopback-голосующих.

## Рабочий процесс

### Создание или подключение

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant R as POST /session
    participant B as Bridge.spawnOrAttach
    participant CH as ACP child

    C->>R: POST /session<br/>X-Qwen-Client-Id: alice<br/>{cwd, sessionScope?}
    R->>R: валидация паттерна clientId
    R->>B: spawnOrAttach({cwd, sessionScope, clientId})
    alt single scope + defaultEntry существует
        B->>B: увеличение attachCount; регистрация clientId
        B-->>R: {sessionId, attached: true, restoreState?}
    else cold
        B->>CH: spawn + ACP initialize + newSession
        CH-->>B: sessionId
        B->>B: создание SessionEntry; регистрация в byId
        B-->>R: {sessionId, attached: false}
    end
    R-->>C: 200 { sessionId, attached, ... }
```

### Загрузка / возобновление

`POST /session/:id/load` — воспроизводит полную историю ACP (уведомления `session/load` отправляются до возврата ответа).
`POST /session/:id/resume` — восстанавливает без воспроизведения (`connection.unstable_resumeSession`, доступен через стабильную возможность демона `session_resume`; `unstable_session_resume` остается устаревшим алиасом).

Оба метода:

1. Используют набор `pendingRestoreIds` для каждой сессии в канале, чтобы параллельные запросы на восстановление объединялись (`RestoreInProgressError`).
2. Кэшируют `restoreState` в записи, чтобы запоздалый подключающийся клиент получил тот же пейлоад, что и исходный восстановитель.

### Heartbeat

`POST /session/:id/heartbeat` обновляет `sessionLastSeenAt` независимо от `clientId`. Если запрос содержит зарегистрированный `X-Qwen-Client-Id`, также выполняется обновление `clientLastSeenAt.set(clientId, Date.now())`. Вытеснение отдельных клиентов **не реализовано** в v1; отзыв доступов запланирован на F-series Wave 5. На данный момент heartbeat-сигналы обеспечивают наблюдаемость для дашбордов и будущей политики отзыва в PR 24.

### Метаданные

`PATCH /session/:id/metadata` принимает `{displayName?}`. Валидация:

- Максимальная длина: `MAX_DISPLAY_NAME_LENGTH = 256`.
- Не должен содержать управляющих символов (`hasControlCharacter` отклоняет кодовые точки ≤ 0x1f или == 0x7f).
- `InvalidSessionMetadataError` (`400`) при нарушении.

При успешном обновлении событие `session_metadata_updated` рассылается всем подписчикам.

### Завершение

| Терминальный фрейм | Триггер                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_closed`   | `DELETE /session/:id` (client_close) или программное закрытие.                                                                                              |
| `session_died`     | Срабатывает `channel.exited` по любой причине (сбой, завершение child-процесса). Содержит `exitCode?` + `signalCode?`, если использовался путь завершения ОС. |
| `client_evicted`   | Переполнение очереди для конкретного подписчика в EventBus (см. [`10-event-bus.md`](./10-event-bus.md)). Это НЕ завершение на уровне сессии — закрывается только этот подписчик. |
| `stream_error`     | SubscriberLimitExceededError или другая ошибка потока на уровне маршрута.                                                                                   |

Ожидающие разрешения разрешаются как `{kind:'cancelled', reason:'session_closed'}` через `mediator.forgetSession(sessionId)` на любом пути завершения.

### Защита от очистки при отключении

Когда HTTP-ответ для клиента-создателя не может быть записан (сброс TCP во время рукопожатия), маршрут вызывает `killSession({ requireZeroAttaches: true })`. Если другой клиент уже подключился (`attachCount > 0`), срабатывает защита, и сессия продолжает работу. Установка `spawnOwnerWantedKill = true` сохраняет это намерение, чтобы последующий `detachClient()`, возвращающий `attachCount` к 0, завершил отложенную очистку. Без этого быстро отключающийся создатель сессии разрушал бы рабочую сессию при каждом переподключении.

## Состояние и жизненный цикл

Поля `SessionEntry`, критичные для жизненного цикла:

| Поле                               | Тип                   | Значение                                                                         |
| ---------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| `clientIds`                        | `Map<string, number>` | Зарегистрированные ID клиентов → счетчик ссылок регистрации.                     |
| `attachCount`                      | `number`              | Количество раз, когда `spawnOrAttach` возвращал `attached: true` для этой записи.|
| `activePromptOriginatorClientId`   | `string?`             | Инициатор выполняющегося в данный момент промпта.                                |
| `restoreState`                     | `BridgeSessionState?` | Кэшированный ответ load/resume, чтобы запоздалые подключающиеся клиенты видели согласованные пейлоады. |
| `spawnOwnerWantedKill`             | `boolean`             | Tombstone-метка отложенной очистки (см. disconnect-reaper выше).                 |
| `sessionLastSeenAt`                | `number?`             | Самый последний heartbeat от любого клиента (эпохальное время в мс).             |
| `clientLastSeenAt`                 | `Map<string, number>` | Heartbeat для каждого клиента.                                                   |
| `pendingPermissionIds`             | `Set<string>`         | ACP requestIds, ожидающие обработки — используются при отмене/закрытии для разрешения как отмененные. |

## Зависимости

- Слой ACP: `connection.newSession`, `connection.unstable_resumeSession`, `connection.loadSession`.
- [`03-acp-bridge.md`](./03-acp-bridge.md) для общей архитектуры бриджа.
- [`04-permission-mediation.md`](./04-permission-mediation.md) для понимания того, как инициатор + идентификация управляют решениями политик.
- [`10-event-bus.md`](./10-event-bus.md) для доставки терминальных фреймов.

## Дополнительные эндпоинты сессий

Эти эндпоинты расширяют базовый жизненный цикл:

### Неблокирующий промпт (тег возможности `non_blocking_prompt`)

`POST /session/:id/prompt` теперь возвращает HTTP **202** с `{ promptId, lastEventId }` вместо блокировки до завершения промпта. Фактический результат поступает в SSE как `turn_complete` / `turn_error`, а поле `promptId` связывает эти события с ответом 202. `DaemonSessionClient.prompt()` автоматически использует неблокирующий путь при наличии активной подписки на события и прозрачно сопоставляет результат из SSE-потока.

### Резюме сессии (тег возможности `session_recap`)

`POST /session/:id/recap` запрашивает у быстрой модели краткое резюме в одну строку «на чем я остановился». Возвращает `{ sessionId, recap: string | null }`; `null` означает, что история слишком коротка или модель временно дала сбой. Этот эндпоинт работает по принципу best-effort.

### Побочный вопрос сессии (тег возможности `session_btw`)

`POST /session/:id/btw` задает разовый вопрос в контексте сессии, не прерывая основной поток диалога. Использует `runForkedAgent` на пути кэша для одного LLM-вызова без инструментов и возвращает `{ sessionId, answer: string | null }`. Реализация обеспечивает соблюдение `BTW_MAX_INPUT_LENGTH`, защиту от утечек между сессиями и обработку таймаутов.

### Выполнение shell-команд

`POST /session/:id/shell` выполняет shell-команду напрямую на хосте демона, без маршрутизации через LLM. Потоково передает вывод в шину SSE сессии через события `user_shell_command` / `user_shell_result` и внедряет команду и результат в историю диалога LLM. Ответ: `{ exitCode, output, aborted }`.

### Отключение клиента от сессии

`POST /session/:id/detach` явно отключает клиент от сессии, уменьшая `attachCount`; сам по себе он не закрывает сессию. Если не остается других подключений или подписчиков, сессия очищается. Эндпоинт возвращает 204.

### Пакетное удаление сессий

`POST /sessions/delete` принимает `{ sessionIds: string[] }` (до 100 ID), закрывает сессии бриджа и удаляет активные или архивные файлы транскриптов. Если для одного ID существуют и активные, и архивные JSONL-файлы, жесткое удаление удаляет оба, чтобы операторы могли устранить конфликт. Очищает активные и архивные сайдкары worktree, но оставляет нетронутыми снимки истории файлов, транскрипты подагентов и runtime-сайдкары. Использует `Promise.allSettled` для отказоустойчивости и возвращает `{ removed, notFound, errors }`.

### Архивация сессий

`POST /sessions/archive` перемещает неактивные JSONL-файлы сессий из `chats/` в `chats/archive/`. Если целевая сессия активна, демон сначала входит в шлюз архивации для конкретной сессии и выполняет строгое закрытие, требующее от ACP child сброса буферов `ChatRecordingService`; архивация оставляет JSONL на месте, если закрытие или сброс не удались.

`POST /sessions/unarchive` перемещает архивные JSONL-файлы обратно в `chats/`. Это только переход состояния хранилища; после этого клиенты должны вызвать `session/load` или `session/resume`. Архивные сессии возвращают `409 session_archived` для load/resume, а мутации, конкурирующие с переходом архивации, возвращают `409 session_archiving`.

### Использование контекста (тег возможности `session_context_usage`)

`GET /session/:id/context-usage` возвращает структурированное использование окна контекста. `?detail=true` включает более детализированное использование, сгруппированное по инструментам, памяти и навыкам (skills).

### Статистика сессии (тег возможности `session_stats`)

`GET /session/:id/stats` возвращает статистику использования: метрики модели (входные/выходные токены, чтения/записи кэша, общая стоимость), количество вызовов и задержки по каждому инструменту, количество изменений файлов и количество вызовов по каждому навыку для активной сессии. Блок `skills` отражает загрузки тел навыков и slash-команд навыков только в рамках этой сессии; это не агрегированная активность между сессиями.

### Задачи сессии (тег возможности `session_tasks`)

`GET /session/:id/tasks` возвращает снимок фоновых задач для задач агента, shell-задач, задач монитора и их состояний жизненного цикла.

### Статус LSP сессии (тег возможности `session_lsp`)

`GET /session/:id/lsp` возвращает очищенный статус LSP для каждой сессии для клиентов демона: включение, агрегированное количество серверов, состояние недоступности/инициализации, а также `name`, `status`, `languages`, `transport`, `command` и `error` для каждого сервера. Отключенный или недоступный LSP представляется как данные статуса HTTP 200, а не как ошибка транспорта.

### Сжатое воспроизведение

`POST /session/:id/load` теперь возвращает `BridgeRestoredSession`, который может включать `compactedReplay?: BridgeEvent[]`, `liveJournal?: BridgeEvent[]` и `lastEventId?: number`. `compactedReplay` создается `TurnBoundaryCompactionEngine`: на границах ходов он сворачивает последовательные блоки текста / мыслей, схлопывает последовательности вызовов инструментов до их конечного состояния, отбрасывает переходные сигналы и создает журналы воспроизведения O(turns) вместо журналов O(tokens) (обычно сокращение в 25-30 раз).

### Прогрев ACP child

`bridge.preheat()` прогревает дочерний процесс ACP перед первой сессией, чтобы первая реальная сессия избежала задержек холодного старта. Это работает в связке с `channelIdleTimeoutMs`, который поддерживает ACP child в рабочем состоянии после закрытия последней сессии, и поведением skip-relaunch, которое переиспользует уже неактивный child-процесс при поступлении новой сессии.

## Конфигурация

- `BridgeOptions.maxSessions` (по умолчанию 20) — лимит.
- `BridgeOptions.sessionScope` (по умолчанию `'single'`; опционально `'thread'`).
- `BridgeOptions.initializeTimeoutMs` (по умолчанию 10 с) — рукопожатие ACP `initialize`.
- `BridgeOptions.channelIdleTimeoutMs` (по умолчанию 0; немедленная очистка ACP child).
- Теги возможностей: `session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume` (устаревший алиас), `session_list`, `session_close`, `session_metadata`, `session_set_model`, `client_identity`, `client_heartbeat`, `session_recap`, `session_btw`, `session_context_usage`, `session_tasks`, `session_stats`, `session_lsp`, `session_status`, `non_blocking_prompt`.

## Ограничения и известные лимиты

- `connection.unstable_resumeSession` может быть все еще нестабильным на уровне ACP, но демон анонсирует закрепленный контракт маршрута v1 с помощью `session_resume`. `unstable_session_resume` сохранен только как устаревший алиас для совместимости.
- В v1 **нет вытеснения отдельных клиентов**; есть только завершение на уровне сессии и подписчика. Политика отзыва — F-series Wave 5 / PR 24.
- `client_evicted` действует для подписчика, а не для сессии. Клиент, чей SSE-подписчик был вытеснен, может переподключиться.
- Анонимные клиенты (без `X-Qwen-Client-Id`) не могут голосовать в рамках политик `designated` или `consensus`.

## Ссылки

- `packages/acp-bridge/src/bridge.ts` (определение SessionEntry)
- `packages/acp-bridge/src/bridgeTypes.ts` (`HttpAcpBridge`, `BridgeSession`, `BridgeSessionState`)
- `packages/sdk-typescript/src/daemon/types.ts` (`DaemonSession`)
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
- Сетевая справка: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) (каталог маршрутов).