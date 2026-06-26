# Документация разработчика демона

Это техническая документация для разработчиков, касающаяся **режима демона qwen-code**: HTTP-демон `qwen serve`, пакет `@qwen-code/acp-bridge`, пул транспортов MCP в области видимости рабочего пространства, медиация разрешений для нескольких клиентов, типизированная схема событий демона v1, клиент демона TypeScript SDK и адаптеры, подключающиеся к демону.

Она дополняет, а не заменяет следующие существующие документы:

| Существующая документация                                                                 | Аудитория          | Источник истины для                                        |
| ----------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                  | Операторы          | Быстрый старт пользователя, флаги, модель угроз            |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                  | Реализаторы протокола | Каталог маршрутов HTTP, формы запросов/ответов, коды ошибок |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)      | Пользователи SDK   | Полный пример на TypeScript                               |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                                | Авторы адаптеров   | Проектные документы по адаптерам устаревших клиентов       |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                        | Авторы адаптеров   | Заметки по проектированию адаптеров клиентов               |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)          | Сопровождающие F2  | Проект пула транспортов MCP для рабочего пространства v2.2 |

Если вы хотите **запустить демон и использовать его**, сначала прочитайте `qwen-serve.md`. Если вы хотите **создать клиент для работы с проводным форматом**, прочитайте `qwen-serve-protocol.md`. Если вы хотите **понять, расширить или отладить внутренности демона**, читайте этот набор.

## Порядок чтения

Выберите путь, соответствующий вашей цели:

- **Сначала запустите и проверьте демон**: `20 -> 17 -> 19`.
- **Новый участник**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Добавление нового адаптера клиента**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Работа с пулом MCP или бюджетом**: `01 -> 03 -> 05 -> 06`.
- **Работа с разрешениями**: `01 -> 03 -> 04 -> 12`.
- **Отладка продакшен-демона**: `19 -> 18 -> 17 -> 20`.

## Набор документов

### Основы

- [`01-architecture.md`](./01-architecture.md) — архитектура системы, топология процессов, карта пакетов и все семь диаграмм последовательностей верхнего уровня.

### Ядро сервера

- [`02-serve-runtime.md`](./02-serve-runtime.md) — загрузка `runQServe`, приложение Express, цепочка промежуточных обработчиков, корректное завершение.
- [`03-acp-bridge.md`](./03-acp-bridge.md) — внутренности пакета `@qwen-code/acp-bridge`, мультиплексирование сессий, фабрика каналов, запуск дочернего процесса ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) — `MultiClientPermissionMediator`, четыре политики, инвариант таймаута N1, сторожевой сигнал отмены.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) — `McpTransportPool` (F2), записи пула, обратный индекс, перезапуск, сброс.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) — `WorkspaceMcpBudget`, режимы (`off`/`warn`/`enforce`), гистерезис, объединение отказавших пакетов.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) — песочница `WorkspaceFileSystem`, политика путей, аудит, контракт `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) — создание / присоединение / загрузка / возобновление, `X-Qwen-Client-Id`, heartbeat, вытеснение, метаданные.
- [`09-event-schema.md`](./09-event-schema.md) — типизированная схема событий v1: все 43 известных типа событий с полезными нагрузками, редукторы, прямая совместимость.
- [`10-event-bus.md`](./10-event-bus.md) — `EventBus`, монотонные идентификаторы, кольцевое воспроизведение, `Last-Event-ID`, обратное давление медленного клиента, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) — реестр возможностей, версия протокола, версия схемы, условное объявление.
- [`12-auth-security.md`](./12-auth-security.md) — промежуточное ПО bearer, список разрешённых хостов, запрет CORS, шлюз мутаций, `--require-auth`, исключение `/health`, поток устройства.

### Клиенты

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) — TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, парсер SSE, редукторы событий, слой транскриптов `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) — общий слой транскриптов UI и связь с устаревшим адаптером демона CLI TUI.
- [`15-channel-adapters.md`](./15-channel-adapters.md) — общая база `DaemonChannelBridge`, а также адаптеры для DingTalk, WeChat (Weixin), Telegram, Feishu по каналам.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) — `DaemonIdeConnection`, принудительное использование только loopback, мост webview.

### Справочные приложения

- [`17-configuration.md`](./17-configuration.md) — переменные окружения, флаги CLI, ключи `settings.json`, влияющие на демон.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) — типизированные ошибки по слоям с рекомендациями по устранению.
- [`19-observability.md`](./19-observability.md) — `QWEN_SERVE_DEBUG`, рецепты отладки, пробелы телеметрии.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) — кратчайший путь запуска, проверки через curl, карта маршрутов и встроенные рецепты вызова.

## Глоссарий

- **ACP** — Agent Client Protocol. JSON-RPC через stdio между мостом демона и дочерним процессом ACP. Это не HTTP-протокол, используемый клиентами для связи с демоном.
- **ACP child** — дочерний процесс, порождаемый демоном (`qwen --acp`), в котором работает среда выполнения агента. Мост мультиплексирует один ACP child между несколькими подключёнными клиентами.
- **acp-bridge** — пакет `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Владеет мультиплексированием сессий, медиатором разрешений, шиной событий и фабрикой каналов.
- **BridgeClient** — `packages/acp-bridge/src/bridgeClient.ts`. Оборачивает одно ACP `ClientSideConnection` и обрабатывает `requestPermission`, `sendPrompt`, `cancelSession`.
- **Channel factory** — подключаемая стратегия для запуска или присоединения к ACP child. По умолчанию `spawnChannel` запускает `qwen --acp` как подпроцесс; `inMemoryChannel` запускает его внутри процесса для тестов.
- **DaemonClient** — `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Фасад уровня HTTP TypeScript SDK для демона.
- **DaemonSessionClient** — `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Обёртка в рамках сессии, отслеживающая `lastSeenEventId` для воспроизведения SSE.
- **EventBus** — `packages/acp-bridge/src/eventBus.ts`. Внутрисессионная модель pub/sub в памяти с монотонными идентификаторами, ограниченным кольцом и обратным давлением на подписчика.
- **F1 / F2 / F3 / F4** — внутренние вехи, отслеживаемые в [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: выделение моста и `BridgeFileSystem`. F2: пул транспортов MCP в области рабочего пространства. F3: медиация разрешений для нескольких клиентов. F4: завершение протокола и поверхности клиента демона.
- **MCP** — Model Context Protocol. Серверы предоставляют инструменты, ресурсы и подсказки; дочерний процесс ACP демона подключается к ним.
- **McpTransportPool** — `packages/core/src/tools/mcp-transport-pool.ts`. Пул F2 в рамках рабочего пространства, совместно использующий один транспорт MCP для каждого имени сервера и отпечатка конфигурации.
- **Mediator policy** — одна из `first-responder`, `designated`, `consensus` или `local-only`. Определяет, как разрешаются голоса разрешений нескольких клиентов.
- **Originator client id** — `X-Qwen-Client-Id` клиента, инициировавшего подсказку, для которой запрашивается разрешение. Политика `designated` принимает голоса только от этого идентификатора.
- **PoolEntry** — `packages/core/src/tools/mcp-pool-entry.ts`. Одна запись в `McpTransportPool`: один транспорт MCP, счётчик ссылок подключённых сессий и таймер сброса при простое.
- **Session scope** — `single` (одна сессия ACP, общая для всех клиентов) или `thread` (одна сессия на нить разговора). По умолчанию `single`.
- **SSE** — Server-Sent Events. Исходящий канал событий демона (`GET /session/:id/events`).
- **Workspace** — каталог, к которому был привязан демон при запуске (`--workspace` или `cwd`). Один процесс демона равен одному рабочему пространству.

## Якоря реализации исходного кода

Используйте эти якоря при переходе от документации к последнему коду `main`:

| Поверхность                            | Якоря реализации                                                                                                                                                                                                                                         | Основная документация                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Загрузка и сборка HTTP                 | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                         | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                    |
| Мост ACP и мультиплексирование сессий  | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                   | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                           |
| Медиация разрешений                    | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                     | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                     |
| Пул транспортов MCP                    | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                               | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                               |
| Ограничения бюджета MCP                | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                         | [`06`](./06-mcp-budget-guardrails.md)                                                                                   |
| Файловая система рабочего пространства | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                          | [`07`](./07-workspace-filesystem.md)                                                                                    |
| Схема событий и писатель SSE           | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                 |
| Повторная синхронизация событий        | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                               | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                 |
| Возможности                            | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                         | [`11`](./11-capabilities-versioning.md)                                                                                 |
| Аутентификация и устройственный поток  | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                           | [`12`](./12-auth-security.md)                                                                                           |
| Клиент демона TypeScript SDK            | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                             | [`13`](./13-sdk-daemon-client.md)                                                                                       |
| Общий слой транскриптов UI             | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                               | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Адаптеры каналов и IDE                 | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                    |

## Что намеренно выходит за рамки

- **Клиенты демона на Java / Python SDK** — сегодня клиент демона поставляется только в TypeScript SDK. Документ 13 — только TypeScript.
- **Детали продукта Web UI** — слой общих транскриптов и точки входа демона веб-интерфейса описаны здесь, но макет продукта UI отслеживается в `docs/developers/daemon-ui/` и заметках по проектированию адаптеров.
- **Расширение Zed (`packages/zed-extension/`)** — оно запускает `qwen --acp` через stdio напрямую и обходит демон.
- **Экспериментальное внутрипроцессное хостирование** — `--no-http-bridge` всё ещё возвращается к http-bridge на сегодняшний день; стабильный режим сервера внутри процесса потребует новой документации при его появлении.

## Текущее покрытие режима демона

### Покрытие ядра сервера

| Область                           | Текущее состояние                                                                                                                                                                       | Основная документация                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Загрузка / путь прослушивания     | `qwen serve` лениво загружает `runQServe`, проверяет auth/workspace/budget/settings, строит приложение Express, затем вызывает `app.listen` и блокируется навсегда до сигнала.          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)             |
| Аутентификация / сетевые ограждения| Loopback по умолчанию не требует bearer; non-loopback требует bearer; `--require-auth` расширяет bearer на loopback и `/health`; список разрешённых хостов и запрет CORS по умолчанию активны. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                     |
| Жизненный цикл сессии             | `POST /session`, `load`, `resume`, исправление метаданных, heartbeat, вытеснение, сбор простаивающих, ограничения ожидающих подсказок и корректное закрытие документированы.            | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                     |
| Мост ACP                          | По умолчанию мультиплексируется один дочерний процесс ACP; `sessionScope` поддерживает `single` и `thread`; `BridgeFileSystem`, имя контекстного файла, переопределения окружения и таймаут простоя канала подключены. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)                 |
| Пул MCP / бюджет                  | Пул MCP рабочего пространства включён по умолчанию, если только `QWEN_SERVE_NO_MCP_POOL=1`; события ограждения и семантика перезапуска документированы.                                  | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)        |
| Разрешения                        | Медиатор F3 поддерживает `first-responder`, `designated`, `consensus` и `local-only`; недопустимые настройки явно завершаются ошибкой.                                                  | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)              |

### Проводной протокол

| Область            | Текущее состояние                                                                                                                                                   | Основная документация                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| HTTP-маршруты      | Каталог маршрутов находится в `qwen-serve-protocol.md`; этот набор документов демона только ссылается на него и объясняет владение реализацией.                     | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                     |
| Схема событий      | `EVENT_SCHEMA_VERSION = 1`; 43 известных типа событий; синтетические фреймы подписчиков без id; `_meta.serverTimestamp` ставится на границе записи SSE.            | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                             |
| Возможности        | `SERVE_PROTOCOL_VERSION = 'v1'`; 67 зарегистрированных тегов; 10 условных тегов.                                                                                   | [`11`](./11-capabilities-versioning.md)                                                                             |
| Оболочка сессии    | `POST /session/:id/shell` существует за флагом `--enable-session-shell`, bearer-аутентификацией и привязанным к сессии `X-Qwen-Client-Id`; тег возможности условный. | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)       |
| Ограничение скорости| Опциональное поуровневое ограничение скорости HTTP выставляется через флаги CLI / окружение и условный тег возможности.                                             | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                              |

### Клиенты / SDK

| Область                          | Текущее состояние                                                                                                                                                    | Основная документация                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Клиент демона TypeScript SDK     | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, парсер SSE, редукторы событий, предварительная проверка возможностей и экспорты транскриптов UI документированы. | [`13`](./13-sdk-daemon-client.md)                                                                                                                |
| Общий слой транскриптов UI       | SDK `daemon/ui/*` нормализует события демона в 37 семантических типов событий UI, сводит их в блоки транскриптов и предоставляет помощники рендеринга/соответствия.   | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Потребитель демона Web UI        | `packages/webui/src/daemon/` потребляет хранилище транскриптов SDK через провайдеры React и адаптеры.                                                                 | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                     |
| CLI TUI / каналы / VS Code       | Устаревшие пути всё ещё существуют; миграция на общие примитивы транскриптов документирована как последующая работа, а не завершённое поведение.                       | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                              |
### Справочная информация и операции

| Область                   | Текущее состояние                                                                                                                                                             | Основная документация               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Конфигурация              | Полные флаги `qwen serve`, переменные окружения, `settings.json`, `ServeOptions`, `BridgeOptions` и важные константы собраны на одной странице.                                | [`17`](./17-configuration.md)       |
| Быстрый старт / операции  | Освещены кратчайший путь запуска, рецепты запуска, проверки curl, поведение аутентификации на демо-странице, разделение маршрутов, поведение завершения работы и рецепты встроенного вызова. | [`20`](./20-quickstart-operations.md) |
| Ошибки                    | Обобщены явные ошибки при запуске, ошибки маршрутов, ошибки моста, ошибки EventBus, ошибки файловой системы и ошибки посредника с рекомендациями по устранению.                | [`18`](./18-error-taxonomy.md)      |
| Наблюдаемость             | Документированы `QWEN_SERVE_DEBUG`, рецепты curl, полезные события, пробелы в телеметрии и чек-листы для расследования.                                                       | [`19`](./19-observability.md)       |

### Устаревшие или исторические компоненты

| Поверхность                                          | Статус                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`       | Исторический черновик для старого прототипа `DaemonTuiAdapter`; текущая архитектура общего UI-транскрипта описана в документе 14.   |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts`   | Устаревший экспериментальный адаптер, все еще в дереве исходников. Новая общая работа с UI должна предпочитать SDK `daemon/ui/*`.   |
| `--no-http-bridge`                                   | Принят для совместимости, но возвращается к http-bridge и выводит ошибки в stderr.                                                 |

### Обратная совместимость

- Схема событий v1 является аддитивной. Новые известные типы событий должны добавляться в `DAEMON_KNOWN_EVENT_TYPE_VALUES`; старые SDK должны обрабатывать неизвестные типы как обратно совместимые.
- Теги возможностей — это контракты поведения. Новое поведение требует нового тега, особенно если клиенты могут проверять его перед вызовом маршрута.
- `sessionScope: 'thread'` — текущее разделение по потокам беседы; избегайте повторного внедрения старой терминологии на уровне клиента.
- Envelope `_meta` и полезная нагрузка ACP `data._meta` различны. Происхождение вызова инструментов находится под полезной нагрузкой ACP; временные метки отправки сервера находятся на envelope SSE.

## Происхождение версии

Этот набор документов отражает поверхность режима демона, в настоящее время включенную в `main`, включая последующую работу из [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Он намеренно описывает текущее поведение, а не более ранние плановые снимки F-серии.