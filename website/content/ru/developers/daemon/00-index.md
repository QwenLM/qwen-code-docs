# Документация для разработчиков демона

Это техническая документация для разработчиков, посвященная **режиму демона qwen-code**: HTTP-демону `qwen serve`, пакету `@qwen-code/acp-bridge`, пулу транспортов MCP с областью действия рабочего пространства, многоклиентскому посредничеству в разрешениях, типизированной схеме событий демона v1, клиенту демона TypeScript SDK и адаптерам для подключения к демону.

Она дополняет, а не заменяет, следующие существующие документы:

| Существующий документ                                                                  | Аудитория               | Основной источник информации по                              |
| -------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                               | Операторы               | Быстрый старт для пользователей, флаги, модель угроз         |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                               | Разработчики протоколов | Каталог HTTP-маршрутов, форматы запросов/ответов, коды ошибок|
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)   | Пользователи SDK        | Пошаговое руководство по TypeScript от начала до конца       |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                             | Авторы адаптеров        | Проектная документация по устаревшим клиентским адаптерам    |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                     | Авторы адаптеров        | Заметки по проектированию клиентских адаптеров               |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)       | Мейнтейнеры F2          | Дизайн пула транспортов MCP рабочего пространства v2.2       |

Если вы хотите **запустить демон и использовать его**, сначала прочитайте `qwen-serve.md`. Если вы хотите **создать клиент для работы с сетевым протоколом**, прочитайте `qwen-serve-protocol.md`. Если вы хотите **понять, расширить или отладить внутреннее устройство демона**, читайте этот набор документов.

## Порядок чтения

Выберите путь, соответствующий вашей цели:

- **Сначала запуск и проверка демона**: `20 -> 17 -> 19`.
- **Новый контрибьютор**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Добавление нового клиентского адаптера**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Работа с пулом MCP или бюджетом**: `01 -> 03 -> 05 -> 06`.
- **Работа с разрешениями**: `01 -> 03 -> 04 -> 12`.
- **Отладка рабочего демона**: `19 -> 18 -> 17 -> 20`.

## Набор документов

### Основы

- [`01-architecture.md`](./01-architecture.md) - системная архитектура, топология процессов, карта пакетов и все семь диаграмм последовательностей верхнего уровня.

### Ядро сервера

- [`02-serve-runtime.md`](./02-serve-runtime.md) - бутстрап `runQwenServe`, приложение Express, цепочка промежуточного ПО, корректное завершение работы.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - внутреннее устройство пакета `@qwen-code/acp-bridge`, мультиплексирование сессий, фабрика каналов, создание дочернего процесса ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, четыре политики, инвариант таймаута N1, сентинел отмены.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), записи пула, обратный индекс, перезапуск, дренирование.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, режимы (`off`/`warn`/`enforce`), гистерезис, объединение отклоненных пакетов.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - песочница `WorkspaceFileSystem`, политика путей, аудит, контракт `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - создание / подключение / загрузка / возобновление, `X-Qwen-Client-Id`, heartbeat, вытеснение, метаданные.
- [`09-event-schema.md`](./09-event-schema.md) - типизированная схема событий v1: все 47 известных типов событий с полезными нагрузками, редьюсеры, прямая совместимость.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, монотонные ID, кольцевой повтор, `Last-Event-ID`, backpressure для медленных клиентов, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - реестр возможностей, версия протокола, версия схемы, условное анонсирование.
- [`12-auth-security.md`](./12-auth-security.md) - bearer-промежуточное ПО, белый список хостов, запрет CORS, шлюз мутаций, `--require-auth`, исключение для `/health`, device flow.

### Клиенты

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, парсер SSE, редьюсеры событий, слой транскриптов `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - общий слой транскриптов UI и связь с устаревшим адаптером демона CLI TUI.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - общая база `DaemonChannelBridge` плюс адаптеры для каждого канала: DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, принудительное использование только loopback, связывание webview.

### Справочные приложения

- [`17-configuration.md`](./17-configuration.md) - переменные окружения, флаги CLI, ключи `settings.json`, влияющие на демон.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - типизированные ошибки для каждого уровня с рекомендациями по устранению.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, рецепты отладки, пробелы в телеметрии.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - кратчайший путь запуска, проверки через curl, карта маршрутов и встроенные рецепты вызова.

## Глоссарий

- **ACP** - Agent Client Protocol. JSON-RPC поверх stdio, используемый для связи между мостом демона и дочерним процессом ACP. Это не HTTP-протокол, который клиенты используют для работы с демоном.
- **Дочерний процесс ACP** - дочерний процесс, который демон создает (`qwen --acp`) для размещения фактической среды выполнения агента. Мост мультиплексирует один дочерний процесс ACP для множества подключенных клиентов.
- **acp-bridge** - пакет `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Отвечает за мультиплексирование сессий, посредник разрешений, шину событий и фабрику каналов.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Оборачивает одно ACP `ClientSideConnection` и обрабатывает `requestPermission`, `sendPrompt` и `cancelSession`.
- **Фабрика каналов** - подключаемая стратегия для создания или подключения к дочернему процессу ACP. По умолчанию `spawnChannel` запускает `qwen --acp` как подпроцесс; `inMemoryChannel` запускает его в том же процессе для тестов.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Фасад HTTP-уровня TypeScript SDK поверх демона.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Обертка с областью действия сессии, которая отслеживает `lastSeenEventId` для повтора SSE.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Внутрипамятная pub/sub шина для каждой сессии с монотонными ID, ограниченным кольцом и backpressure для каждого подписчика.
- **F1 / F2 / F3 / F4** - внутренние вехи, отслеживаемые в [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: извлечение моста и `BridgeFileSystem`. F2: пул транспортов MCP с областью действия рабочего пространства. F3: многоклиентское посредничество в разрешениях. F4: завершение протокола и клиентские поверхности демона.
- **MCP** - Model Context Protocol. Серверы предоставляют инструменты, ресурсы и промпты; дочерний процесс ACP демона подключается к ним.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. Пул F2 с областью действия рабочего пространства, использующий один транспорт MCP на имя сервера и отпечаток конфигурации.
- **Политика посредника** - одна из `first-responder`, `designated`, `consensus` или `local-only`. Определяет, как разрешаются голоса разрешений от нескольких клиентов.
- **ID клиента-инициатора** - `X-Qwen-Client-Id` клиента, который инициировал промпт, запрашивающий разрешение в данный момент. Политика `designated` принимает голоса только от этого ID.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Одна запись в `McpTransportPool`: один транспорт MCP, счетчик ссылок подключенных сессий и таймер простоя для дренирования.
- **Область действия сессии** - `single` (одна сессия ACP, используемая всеми клиентами) или `thread` (одна сессия на каждый поток диалога). По умолчанию используется `single`.
- **SSE** - Server-Sent Events. Исходящий канал событий демона (`GET /session/:id/events`).
- **Рабочее пространство** - директория, к которой был привязан демон при запуске (`--workspace` или `cwd`). Один процесс демона равен одному рабочему пространству.

## Привязки к исходному коду

Используйте эти привязки при переходе от документации к последнему коду в ветке `main`:

| Поверхность                         | Привязки к реализации                                                                                                                                                                                                                                                  | Основные документы                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Загрузка и сборка HTTP              | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                                | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                 |
| Мост ACP и мультиплексирование сессий | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                               | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                        |
| Посредничество в разрешениях        | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                   | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                  |
| Пул транспортов MCP                 | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                             | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                            |
| Ограничения бюджета MCP             | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                       | [`06`](./06-mcp-budget-guardrails.md)                                                                                |
| Файловая система рабочего пространства | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                      | [`07`](./07-workspace-filesystem.md)                                                                                 |
| Схема событий и модуль записи SSE   | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                              |
| Ресинхронизация событий             | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                           | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                              |
| Возможности                         | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                       | [`11`](./11-capabilities-versioning.md)                                                                              |
| Аутентификация и device flow        | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                         | [`12`](./12-auth-security.md)                                                                                        |
| Клиент демона TypeScript SDK        | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                           | [`13`](./13-sdk-daemon-client.md)                                                                                    |
| Общий слой транскриптов UI          | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                             | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Каналы и IDE-адаптеры               | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                              | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                 |

## Что намеренно исключено из области применения

- **Клиенты демона для Java / Python SDK** - на сегодняшний день только TypeScript SDK поставляется с клиентом демона. Документ 13 касается только TypeScript.
- **Детали продукта Web UI** - общий слой транскриптов и точки входа демона для web UI описаны здесь, но макет UI продукта отслеживается в `docs/developers/daemon-ui/` и заметках по проектированию адаптеров.
- **Расширение Zed (`packages/zed-extension/`)** - оно запускает `qwen --acp` напрямую через stdio, минуя демон.
- **Экспериментальный хостинг в процессе** - `--no-http-bridge` сегодня все равно откатывается к http-bridge; стабильный режим serve в процессе потребует новой документации после его выпуска.

## Текущее покрытие режима демона

### Покрытие ядра сервера

| Область                   | Текущее состояние                                                                                                                                                                    | Основные документы                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Загрузка / путь прослушивания | `qwen serve` лениво загружает `runQwenServe`, проверяет аутентификацию/рабочее пространство/бюджет/настройки, собирает приложение Express, затем вызывает `app.listen` и блокируется навсегда до получения сигнала. | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)    |
| Аутентификация / сетевые ограничения | По умолчанию loopback работает без bearer; не-loopback требует bearer; `--require-auth` распространяет bearer на loopback и `/health`; белый список хостов и запрет CORS по умолчанию активны. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)            |
| Жизненный цикл сессии     | Задокументированы `POST /session`, `load`, `resume`, патч метаданных, heartbeat, вытеснение, сбор неактивных сессий, лимиты ожидающих промптов и корректное закрытие.                  | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)            |
| Мост ACP                  | По умолчанию мультиплексируется один дочерний процесс ACP; `sessionScope` поддерживает `single` и `thread`; подключены `BridgeFileSystem`, имя файла контекста, переопределения переменных окружения и таймаут простоя канала. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)        |
| Пул / бюджет MCP          | Пул MCP рабочего пространства включен по умолчанию, если не задано `QWEN_SERVE_NO_MCP_POOL=1`; задокументированы события ограничений и семантика перезапуска.                            | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| Разрешения                | Посредник F3 поддерживает `first-responder`, `designated`, `consensus` и `local-only`; некорректные настройки приводят к явным ошибкам.                                                   | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)     |

### Сетевой протокол

| Область          | Текущее состояние                                                                                                                                                                                           | Основные документы                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| HTTP-маршруты    | Каталог маршрутов находится в `qwen-serve-protocol.md`; этот набор документов демона только ссылается на него и объясняет принадлежность реализации.                                                          | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                 |
| Схема событий    | `EVENT_SCHEMA_VERSION = 1`; 47 известных типов событий; синтетические фреймы подписчика без ID; `_meta.serverTimestamp` проставляется `EventBus.publish()` (с резервным `formatSseFrame()` для синтетических фреймов). | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                         |
| Возможности      | `SERVE_PROTOCOL_VERSION = 'v1'`; 75 зарегистрированных тегов; 13 условных тегов.                                                                                                                            | [`11`](./11-capabilities-versioning.md)                                                                         |
| Оболочка сессии  | `POST /session/:id/shell` доступен при использовании `--enable-session-shell`, bearer-аутентификации и привязанного к сессии `X-Qwen-Client-Id`; тег возможности является условным.                             | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)   |
| Ограничение скорости | Опциональное ограничение скорости HTTP для каждого уровня предоставляется через флаги CLI/переменные окружения и условный тег возможности.                                                                 | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                          |
### Клиенты / SDK

| Область | Текущее состояние | Основные документы |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Клиент daemon для TypeScript SDK | Задокументированы `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-парсер, редьюсеры событий, preflight-проверки функций и экспорты транскриптов UI. | [`13`](./13-sdk-daemon-client.md) |
| Общий слой транскриптов UI | SDK `daemon/ui/*` нормализует события daemon в 42 семантических типа событий UI, сводит их в блоки транскриптов и предоставляет рендереры и хелперы для проверки соответствия. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Потребитель daemon в Web UI | `packages/webui/src/daemon/` потребляет хранилище транскриптов SDK через React-провайдеры и адаптеры. | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md) |
| CLI TUI / каналы / VS Code | Устаревшие пути всё ещё существуют; миграция на общие примитивы транскриптов задокументирована как последующая работа, а не как завершенное поведение. | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md) |

### Справочные материалы и эксплуатация

| Область | Текущее состояние | Основные документы |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Конфигурация | Все флаги `qwen serve`, переменные окружения, `settings.json`, `ServeOptions`, `BridgeOptions` и важные константы собраны на одной странице. | [`17`](./17-configuration.md) |
| Быстрый старт / эксплуатация | Описаны кратчайший путь запуска, рецепты запуска, проверки через curl, поведение аутентификации на демо-странице, разделение маршрутов, поведение при завершении работы и рецепты встроенного вызова. | [`20`](./20-quickstart-operations.md) |
| Ошибки | Явные сбои при запуске, ошибки маршрутов, ошибки bridge, EventBus, файловой системы и медиатора обобщены с указанием способов устранения. | [`18`](./18-error-taxonomy.md) |
| Наблюдаемость | Задокументированы `QWEN_SERVE_DEBUG`, рецепты curl, полезные события, пробелы в телеметрии и чек-листы для расследования инцидентов. | [`19`](./19-observability.md) |

### Исторические или устаревшие интерфейсы

| Интерфейс | Статус |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md` | Исторический черновик для старого спайка `DaemonTuiAdapter`; текущая архитектура общих транскриптов UI описана в документе 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Устаревший экспериментальный адаптер всё ещё в дереве исходного кода. В новых работах по общему UI следует отдавать предпочтение SDK `daemon/ui/*`. |
| `--no-http-bridge` | Принимается для совместимости, но происходит откат к http-bridge с выводом сообщения в stderr. |

### Прямая совместимость

- Схема событий v1 аддитивна. Новые известные типы событий должны добавляться в `DAEMON_KNOWN_EVENT_TYPE_VALUES`; старые SDK должны трактовать неизвестные типы как совместимые.
- Теги возможностей являются контрактами поведения. Новое поведение требует нового тега, особенно если клиенты могут выполнять для него preflight-проверку перед вызовом маршрута.
- `sessionScope: 'thread'` — это текущее разделение по потокам разговора; избегайте возврата к старой терминологии, связанной с областью клиента.
- `_meta` конверта и `data._meta` полезной нагрузки ACP различаются. Происхождение вызовов инструментов находится в полезной нагрузке ACP; временные метки отправки сервера находятся в конверте SSE.

## Происхождение версии

Данный набор документов отражает интерфейс режима daemon, который в настоящее время интегрирован в `main`, включая последующие работы из [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Он намеренно описывает текущее поведение, а не более ранние снимки планирования серии F.