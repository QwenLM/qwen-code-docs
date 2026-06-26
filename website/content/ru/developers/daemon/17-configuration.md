# Справочник по конфигурации

## Обзор

На этой странице собраны все настройки, влияющие на работу демона `qwen serve` и его адаптеров: переменные окружения, флаги CLI, ключи `settings.json` и программные параметры. Страницы, посвящённые отдельным функциям, ссылаются сюда, когда требуется описание сквозных настроек.

## Флаги CLI (`qwen serve`)

| Флаг                                     | Тип                         | По умолчанию                                | Описание                                                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                      | строка                      | `127.0.0.1`                                 | Адрес привязки. Значения loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Для non‑loopback требуется bearer‑токен при запуске. Ввод `host:port` отвергается с рекомендацией использовать `--port`.                               |
| `--port <n>`                             | число                       | `4170`                                      | Порт прослушивания; `0` означает эфемерный порт.                                                                                                                                                                                 |
| `--token <s>`                            | строка                      | env                                         | Bearer‑токен. Переопределяет `QWEN_SERVER_TOKEN` и обрезается при запуске. Отображается в командной строке процесса, поэтому в развёртываниях предпочтительнее использовать окружение.                                            |
| `--require-auth`                         | булево                      | `false`                                     | Распространяет bearer‑аутентификацию на loopback и `/health`; без токена при запуске отказывает.                                                                                                                                 |
| `--workspace <dir>`                      | абсолютный путь             | `process.cwd()`                             | Привязанная рабочая область. Должен быть абсолютным путём к каталогу; канонизируется один раз при запуске.                                                                                                                       |
| `--max-sessions <n>`                     | число                       | `20`                                        | Лимит активных сессий. `0` / `Infinity` — без ограничений; `NaN` / отрицательные значения вызывают ошибку.                                                                                                                       |
| `--max-pending-prompts-per-session <n>`  | число                       | `5`                                         | Лимит принятых, но ожидающих/выполняющихся подсказок на сессию. При превышении возвращается 503. `0` / `Infinity` — без ограничений; отрицательные или нецелые значения вызывают ошибку.                                          |
| `--max-connections <n>`                  | число                       | `256`                                       | Параметр `server.maxConnections` HTTP‑слушателя; `0` / `Infinity` — без ограничений.                                                                                                                                             |
| `--enable-session-shell`                 | булево                      | `false`                                     | Включает прямое выполнение `POST /session/:id/shell`. Требует bearer‑токен, каждый вызов должен содержать привязанный к сессии `X-Qwen-Client-Id`.                                                                                 |
| `--event-ring-size <n>`                  | число                       | `8000`                                      | Размер кольца повторного воспроизведения SSE на сессию; мягкий лимит — `1_000_000`.                                                                                                                                              |
| `--http-bridge`                          | булево                      | `true`                                      | Режим моста этапа 1. `--no-http-bridge` всё равно переключается на http‑bridge и выводит сообщение в stderr.                                                                                                                      |
| `--mcp-client-budget <n>`                | положительное целое         | не задано                                   | Устанавливает `WorkspaceMcpBudget.clientBudget` и передаёт его дочернему процессу ACP через `childEnvOverrides`.                                                                                                                  |
| `--mcp-budget-mode <m>`                  | `off` / `warn` / `enforce`  | `warn`, если задан бюджет, иначе `off`      | Устанавливает `WorkspaceMcpBudget.mode`; `enforce` требует `--mcp-client-budget`.                                                                                                                                                |
| `--allow-origin <pattern>`               | повторяемая строка          | не задано                                   | Белый список источников для кросс‑доменных запросов, заменяющий стандартный запрет CORS. `*` разрешает любой источник, но требует токена.                                                                                        |
| `--allow-private-auth-base-url`          | булево                      | `false`                                     | Разрешает `/workspace/auth/provider` устанавливать `baseUrl` провайдера аутентификации на localhost / частную сеть; использовать только в доверенной локальной разработке.                                                         |
| `--prompt-deadline-ms <n>`               | положительное целое         | не задано                                   | Серверный лимит времени выполнения подсказки в миллисекундах. При тайм‑ауте прерывание и возврат ошибки.                                                                                                                          |
| `--writer-idle-timeout-ms <n>`           | положительное целое         | не задано                                   | Тайм‑аут простоя на одно SSE‑соединение в миллисекундах. Демон закрывает SSE‑соединение, если за это время не отправлено ни одного события.                                                                                       |
| `--channel-idle-timeout-ms <n>`          | неотрицательное целое       | `0`                                         | Сколько времени держать дочерний процесс ACP после закрытия последней сессии. `0` означает немедленное освобождение.                                                                                                               |
| `--session-reap-interval-ms <n>`         | неотрицательное целое       | `60000`                                     | Интервал сканирования сборщика сессий; `0` отключает его.                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`          | неотрицательное целое       | `1800000`                                   | Время простоя отключённой сессии до удаления; `0` отключает.                                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`       | булево                      | env / off                                   | Включает поуровневое ограничение HTTP‑запросов для маршрутов prompt, mutation и read.                                                                                                                                            |
| `--rate-limit-prompt <n>`                | положительное целое         | `10`                                        | Лимит запросов prompt за окно; требует включения ограничения.                                                                                                                                                                    |
| `--rate-limit-mutation <n>`              | положительное целое         | `30`                                        | Лимит запросов mutation за окно; требует включения ограничения.                                                                                                                                                                  |
| `--rate-limit-read <n>`                  | положительное целое         | `120`                                       | Лимит запросов read за окно; требует включения ограничения.                                                                                                                                                                      |
| `--rate-limit-window-ms <n>`             | целое `>= 1000`             | `60000`                                     | Длина окна ограничения; требует включения ограничения.                                                                                                                                                                           |
| без флага                                | -                           | -                                           | `QWEN_SERVE_NO_MCP_POOL=1` полностью отключает пул.                                                                                                                                                                              |
## Переменные окружения

### Читаемые `runQwenServe` / Express middleware

| Переменная окружения              | Действие                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`               | Bearer-токен; обрезается при запуске.                                                                                                                                    |
| `QWEN_SERVE_DEBUG`                | `1` / `true` / `on` / `yes` (без учёта регистра) включает подробные логи в stderr. См. [`19-observability.md`](./19-observability.md).                                     |
| `QWEN_SERVE_NO_MCP_POOL`          | `1` отключает пул транспортов MCP рабочей области и возвращается к `McpClientManager` на сессию; возможности перестают рекламировать `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`   | Резервное значение из окружения для `--prompt-deadline-ms`.                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`| Резервное значение из окружения для `--writer-idle-timeout-ms`.                                                                                                            |
| `QWEN_SERVE_RATE_LIMIT`           | `1` / `true` включает поуровневое HTTP-ограничение запросов; CLI `--rate-limit` / `--no-rate-limit` имеет приоритет.                                                        |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`    | Резервное значение из окружения для `--rate-limit-prompt`.                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`  | Резервное значение из окружения для `--rate-limit-mutation`.                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`      | Резервное значение из окружения для `--rate-limit-read`.                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS` | Резервное значение из окружения для `--rate-limit-window-ms`.                                                                                                              |

### Передаваемые дочернему процессу ACP через `BridgeOptions.childEnvOverrides`

`runQwenServe` формирует эти переменные для каждого дескриптора, чтобы два демона в одном процессе не конкурировали за `process.env`. Переменные бюджета не являются резервными значениями из окружения родительского процесса для `qwen serve`; путь CLI должен генерировать их из `--mcp-client-budget` / `--mcp-budget-mode`.

| Переменная окружения                   | Действие                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`         | Строка положительного целого числа, используемая дочерним процессом ACP через `readBudgetFromEnv()`.                     |
| `QWEN_SERVE_MCP_BUDGET_MODE`           | `off` / `warn` / `enforce`.                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`       | Разрешённые транспорты через запятую; по умолчанию в пул включены `stdio,websocket`; можно явно добавить `http,sse`.      |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`         | Задержка сброса простаивающего элемента пула; значение по умолчанию `30000`, ограничено диапазоном `1000..600000` мс.    |

### Читаемые SDK / адаптерами

| Переменная окружения      | Действие                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `QWEN_DAEMON_URL`         | Базовый URL демона для TUI-адаптера CLI, каналов и IDE-компаньона.   |
| `QWEN_DAEMON_TOKEN`       | Bearer-токен.                                                        |
| `QWEN_DAEMON_WORKSPACE`   | Переопределяет `cwd`, отправляемый в `POST /session`.                |

## Ключи `settings.json`

Демон считывает настройки один раз при запуске через `loadSettings(boundWorkspace)` внутри `runQwenServe`. Некорректные настройки возвращаются к значениям по умолчанию через защитную конструкцию try/catch.

| Ключ                          | Тип                                                                | Действие                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`   | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Устанавливает `BridgeOptions.permissionPolicy`; активное значение отображается в `/capabilities` как `policy.permission`. **Загрузка проверяет** через `validatePolicyConfig()` на соответствие `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Неизвестные литералы выбрасывают `InvalidPolicyConfigError` и явно прерывают запуск.                                                                                                                                                                                              |
| `policy.consensusQuorum`      | положительное целое                                                | N для политики `consensus`. **По умолчанию** — `floor(M/2) + 1` от `votersAtIssue.size` (M=2 означает единогласие; чётное большее M — большинство). Если задано при политике, отличной от consensus, игнорируется, а загрузка выводит предупреждение в stderr. Неположительные целые выбрасывают `InvalidPolicyConfigError`. См. [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                                            |
| `context.fileName`            | строка                                                             | Переопределяет `getCurrentGeminiMdFilename()` через `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tools.disabled`              | string[]                                                           | Инструменты, отключённые при следующем запуске дочернего процесса ACP. Нормализуется через `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): не массив превращается в `[]`, нестроковые записи пропускаются, пробелы обрезаются, пустые записи удаляются, дубликаты удаляются с сохранением первого вхождения. При обновлении настроек при загрузке и `restartMcpServer` используется эта функция. `ToolRegistry.has(name)` чувствительно к регистру и точному совпадению. `POST /workspace/tools/:name/enable` и `tool_toggled` обновляют этот ключ. |
| `tools.approvalMode`          | `'default' \| 'auto' \| ...`                                       | Режим подтверждения сеанса по умолчанию; `POST /session/:id/approval-mode` записывает сюда при `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                   | object                                                             | Конфигурация OpenTelemetry. Ключи включают `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `resourceAttributes` и `metrics.includeSessionId`. `resolveTelemetrySettings()` читает это при запуске и инициализирует `initializeTelemetry()`.                                                                                                                                                                            |
## `ServeOptions` (встраивание через API)

`packages/cli/src/serve/types.ts` определяет типизированный объект опций, принимаемый как `runQwenServe`, так и `createServeApp`. Он повторяет флаги CLI, перечисленные выше, и добавляет:

| Поле                           | Эффект                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `eventRingSize`                | Переопределяет размер кольцевого буфера по умолчанию для каждой сессии.                     |
| `maxPendingPromptsPerSession`  | Лимит ожидающих запросов на сессию; `0` / `Infinity` означает неограниченно.               |
| `mcpPoolActive`                | Программный переключатель, по умолчанию из `QWEN_SERVE_NO_MCP_POOL`.                       |
| `allowOrigins`                 | Список разрешённых источников (`string[]`), соответствует `--allow-origin`.                 |
| `allowPrivateAuthBaseUrl`      | Разрешает установку `baseUrl` провайдера аутентификации на частном / localhost адресе.      |
| `enableSessionShell`           | Включает выполнение shell-команд в сессии; по-прежнему требуются bearer-токен и идентификатор клиента, привязанный к сессии. |
| `promptDeadlineMs`             | Лимит времени выполнения запроса.                                                           |
| `writerIdleTimeoutMs`          | Тайм-аут бездействия SSE-писателя.                                                          |
| `channelIdleTimeoutMs`         | Продолжительность удержания дочернего ACP-процесса активным после закрытия последней сессии. |
| `sessionReapIntervalMs`        | Интервал сканирования сборщика сессий.                                                      |
| `sessionIdleTimeoutMs`         | Время бездействия отключённой сессии до её сбора.                                           |
| `rateLimit*`                   | Переключатель, пороги и окно лимита HTTP-запросов по уровням.                               |

## `BridgeOptions` (встраивание моста через API)

`packages/acp-bridge/src/bridgeOptions.ts` определяет опции моста. Полную таблицу см. в [`03-acp-bridge.md`](./03-acp-bridge.md). Ключевые поля:

| Поле                                                                                                                     | Эффект                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Обязательное каноническое рабочее пространство.                                          |
| `sessionScope`                                                                                                          | `'single'` (по умолчанию) vs `'thread'`.                                                |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Ограничения ресурсов.                                                                   |
| `channelFactory`                                                                                                        | Подключаемая фабрика дочерних ACP-процессов; по умолчанию — `defaultSpawnChannelFactory`. |
| `fileSystem`                                                                                                            | Адаптер `BridgeFileSystem`. См. [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                       | Подключение посредника.                                                                 |
| `statusProvider`                                                                                                        | Ячейки предварительной проверки демона.                                                 |
| `childEnvOverrides`                                                                                                     | Добавление или удаление переменных окружения для каждого дескриптора.                   |
| `contextFilename`                                                                                                       | Переопределяет `getCurrentGeminiMdFilename()`.                                         |
| `channelIdleTimeoutMs`                                                                                                  | Продолжительность удержания дочернего ACP-процесса живым после закрытия последней сессии, в мс; по умолчанию `0`. |

## Важные умолчания

| Константа                          | Файл                    | Значение             | Смысл                                                           |
| ---------------------------------- | ----------------------- | -------------------- | --------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`                 | Лимит сессий до `SessionLimitExceededError`.                    |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`          | Мягкий лимит для `BridgeOptions.eventRingSize`; защита от опечаток. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`               | Глубина кольцевого буфера повтора SSE для одной сессии.         |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`                | Лимит очереди на подписчика.                                    |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`                 | Лимит подписчиков на шину.                                      |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`               | Триггер `slow_client_warning`.                                  |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`              | Порог перевооружения гистерезиса.                               |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`             | Тайм-аут рукопожатия `initialize` ACP.                          |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`            | Тайм-аут моста для `/workspace/mcp/:server/restart`.            |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`         | Общее время выполнения запроса разрешения.                       |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`                 | Соответствует `DEFAULT_MAX_SUBSCRIBERS`.                        |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`                | FIFO для недавно разрешённых разрешений.                        |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`             | Окно корректного завершения на канал.                           |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`              | Таймер принудительного закрытия HTTP-сервера.                   |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`         | Лимит на чтение.                                                |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024`    | Лимит на запись.                                                |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`                | Лимит `displayName` сессии.                                     |
## Перекрёстные ссылки

- Настройки аутентификации: [`12-auth-security.md`](./12-auth-security.md)
- Возможности и версия протокола: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Кольцо событий и настройка противодавления: [`10-event-bus.md`](./10-event-bus.md)
- Пул / бюджет MCP: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) и [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Политика разрешений: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Руководство пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
