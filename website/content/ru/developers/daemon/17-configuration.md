# Справочник по конфигурации

## Обзор

На этой странице собраны все настройки, влияющие на демон `qwen serve` и его адаптеры: переменные окружения, флаги CLI, ключи `settings.json` и программные опции. Страницы, посвященные отдельным функциям, ссылаются сюда, когда требуются сквозные детали конфигурации.

## Флаги CLI (`qwen serve`)

| Флаг                                    | Тип                        | По умолчанию                             | Действие                                                                                                                                                                            |
| --------------------------------------- | -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                              | Адрес привязки. Значения loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Для не-loopback адресов при запуске требуется bearer-токен. Ввод в формате `host:port` отклоняется с рекомендацией использовать `--port`. |
| `--port <n>`                            | number                     | `4170`                                   | Порт прослушивания; `0` означает эфемерный порт.                                                                                                                                    |
| `--token <s>`                           | string                     | env                                      | Bearer-токен. Переопределяет `QWEN_SERVER_TOKEN` и обрезается при запуске. Отображается в командной строке процесса, поэтому при развертывании лучше использовать переменную окружения. |
| `--require-auth`                        | boolean                    | `false`                                  | Расширяет действие bearer-аутентификации на loopback и `/health`; запуск прерывается, если токен не задан.                                                                          |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                          | Привязанная рабочая область. Должна быть абсолютным путем и указывать на директорию; канонизируется один раз при запуске.                                                           |
| `--max-sessions <n>`                    | number                     | `20`                                     | Лимит активных сессий. `0` / `Infinity` означает без ограничений; `NaN` / отрицательные значения вызывают ошибку.                                                                   |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                      | Лимит принятых, но ожидающих/выполняющихся промптов на сессию. Превышение лимита возвращает 503. `0` / `Infinity` означает без ограничений; отрицательные или нецелые значения вызывают ошибку. |
| `--max-connections <n>`                 | number                     | `256`                                    | `server.maxConnections` для HTTP-слушателя; `0` / `Infinity` означает без ограничений.                                                                                              |
| `--enable-session-shell`                | boolean                    | `false`                                  | Включает прямое выполнение `POST /session/:id/shell`. Требуется bearer-токен, и каждый вызов должен содержать привязанный к сессии `X-Qwen-Client-Id`.                              |
| `--event-ring-size <n>`                 | number                     | `8000`                                   | Кольцо повтора SSE для каждой сессии; мягкий лимит — `1_000_000`.                                                                                                                   |
| `--http-bridge`                         | boolean                    | `true`                                   | Режим моста этапа 1. `--no-http-bridge` все равно использует резервный http-bridge и выводит предупреждение в stderr.                                                               |
| `--mcp-client-budget <n>`               | positive integer           | unset                                    | Устанавливает `WorkspaceMcpBudget.clientBudget` и передает его дочернему процессу ACP через `childEnvOverrides`.                                                                    |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn`, если задан бюджет, иначе `off`    | Устанавливает `WorkspaceMcpBudget.mode`; для `enforce` требуется `--mcp-client-budget`.                                                                                             |
| `--allow-origin <pattern>`              | repeatable string          | unset                                    | Белый список cross-origin, заменяющий стандартный запрет CORS. `*` разрешает любой origin, но требует токен.                                                                        |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                  | Позволяет `/workspace/auth/provider` устанавливать `baseUrl` для провайдера аутентификации localhost / частной сети; использовать только в доверенной локальной среде разработки.   |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                    | Серверный лимит реального времени выполнения промпта в мс. При тайм-ауте выполнение прерывается и возвращается ошибка.                                                              |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                    | Тайм-аут простоя для каждого SSE-соединения в мс. Демон закрывает SSE-соединение, если в течение этого времени не отправлено ни одного события.                                     |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                      | Как долго держать дочерний процесс ACP активным после закрытия последней сессии. `0` означает немедленное освобождение ресурсов.                                                    |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                  | Интервал сканирования сборщика неактивных сессий; `0` отключает его.                                                                                                                |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                | Время простоя отключенной сессии перед сборкой; `0` отключает его.                                                                                                                  |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                | Включает HTTP rate limiting для маршрутов промптов, мутаций и чтения с разделением по уровням.                                                                                      |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                     | Лимит запросов промптов в окне; требует включения rate limiting.                                                                                                                    |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                     | Лимит запросов мутаций в окне; требует включения rate limiting.                                                                                                                     |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                    | Лимит запросов на чтение в окне; требует включения rate limiting.                                                                                                                   |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                  | Длина окна rate limiting; требует включения rate limiting.                                                                                                                          |
| нет флага                               | -                          | -                                        | `QWEN_SERVE_NO_MCP_POOL=1` полностью отключает пул.                                                                                                                                 |

## Переменные окружения

### Читаются `runQwenServe` / Express middleware

| Переменная                            | Действие                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                   | Bearer-токен; обрезается при запуске.                                                                                                                                    |
| `QWEN_SERVE_DEBUG`                    | `1` / `true` / `on` / `yes` (без учета регистра) включает подробные логи в stderr. См. [`19-observability.md`](./19-observability.md).                                   |
| `QWEN_SERVE_NO_MCP_POOL`              | `1` отключает пул транспортов MCP рабочей области и переключает на `McpClientManager` для каждой сессии; возможности перестают анонсировать `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`       | Резервная переменная окружения для `--prompt-deadline-ms`.                                                                                                               |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`   | Резервная переменная окружения для `--writer-idle-timeout-ms`.                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT`               | `1` / `true` включает HTTP rate limiting с разделением по уровням; флаги CLI `--rate-limit` / `--no-rate-limit` имеют приоритет.                                         |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`        | Резервная переменная окружения для `--rate-limit-prompt`.                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`      | Резервная переменная окружения для `--rate-limit-mutation`.                                                                                                              |
| `QWEN_SERVE_RATE_LIMIT_READ`          | Резервная переменная окружения для `--rate-limit-read`.                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`     | Резервная переменная окружения для `--rate-limit-window-ms`.                                                                                                             |

### Передаются дочернему процессу ACP через `BridgeOptions.childEnvOverrides`

`runQwenServe` формирует их для каждого обработчика, чтобы два демона в одном процессе не конкурировали за `process.env`. Переменные бюджета не являются резервными переменными окружения родительского процесса для `qwen serve`; путь CLI должен генерировать их из `--mcp-client-budget` / `--mcp-budget-mode`.

| Переменная                            | Действие                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`        | Строка с положительным целым числом, потребляемая `readBudgetFromEnv()` дочернего процесса ACP.                              |
| `QWEN_SERVE_MCP_BUDGET_MODE`          | `off` / `warn` / `enforce`.                                                                                                |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`      | Разделенный запятыми белый список транспортов; по умолчанию пул использует `stdio,websocket`; можно явно добавить `http,sse`.|
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`        | Задержка сброса неактивной записи пула; по умолчанию `30000`, ограничена диапазоном `1000..600000` мс.                     |

### Читаются SDK / адаптерами

| Переменная                | Действие                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`         | Базовый URL демона для CLI TUI адаптера, каналов и IDE-компаньона.|
| `QWEN_DAEMON_TOKEN`       | Bearer-токен.                                                     |
| `QWEN_DAEMON_WORKSPACE`   | Переопределяет `cwd`, отправляемый в `POST /session`.             |

## Ключи `settings.json`

Демон читает настройки один раз при запуске через `loadSettings(boundWorkspace)` внутри `runQwenServe`. При некорректном формате настроек срабатывает защита try/catch, и используются значения по умолчанию.

| Ключ                      | Тип                                                                | Действие                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Устанавливает `BridgeOptions.permissionPolicy`; активное значение отображается в `/capabilities` как `policy.permission`. **При запуске проверяется** через `validatePolicyConfig()` на соответствие `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Неизвестные литералы вызывают `InvalidPolicyConfigError` и явно прерывают запуск.                                                                                                                                                               |
| `policy.consensusQuorum`  | positive integer                                                   | N для политики `consensus`. **По умолчанию** равно `floor(M/2) + 1` от `votersAtIssue.size` (M=2 означает единогласие; большее четное M означает больше половины). Если задано для политики, отличной от consensus, игнорируется, и при запуске выводится предупреждение в stderr. Не положительные целые числа вызывают `InvalidPolicyConfigError`. См. [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                        |
| `context.fileName`        | string                                                             | Переопределяет `getCurrentGeminiMdFilename()` через `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tools.disabled`          | string[]                                                           | Инструменты, отключенные для следующего запуска дочернего процесса ACP. Нормализуется через `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): не массив становится `[]`, не строковые элементы пропускаются, пробелы обрезаются, пустые элементы удаляются, дубликаты удаляются с сохранением первого вхождения. Настройки запуска и обновления `restartMcpServer` обе проходят через эту функцию. `ToolRegistry.has(name)` работает точно и с учетом регистра. `POST /workspace/tools/:name/enable` и `tool_toggled` обновляют этот ключ. |
| `tools.approvalMode`      | `'default' \| 'auto' \| ...`                                       | Режим одобрения сессии по умолчанию; `POST /session/:id/approval-mode` записывает сюда значение, если `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `telemetry`               | object                                                             | Конфигурация OTel. Ключи включают `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` и `metrics.includeSessionId`. `resolveTelemetrySettings()` читает её при запуске и инициализирует `initializeTelemetry()`.                                                                                                                                                             |

## `ServeOptions` (программное встраивание)

`packages/cli/src/serve/types.ts` определяет типизированный объект опций, принимаемый как `runQwenServe`, так и `createServeApp`. Он дублирует флаги CLI выше и добавляет:

| Поле                        | Действие                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `eventRingSize`             | Переопределяет размер кольца по умолчанию для каждой сессии.                                    |
| `maxPendingPromptsPerSession` | Лимит ожидающих промптов на сессию; `0` / `Infinity` означает без ограничений.                |
| `mcpPoolActive`             | Программный переключатель, по умолчанию зависит от `QWEN_SERVE_NO_MCP_POOL`.                    |
| `allowOrigins`              | Белый список cross-origin (`string[]`), соответствует `--allow-origin`.                         |
| `allowPrivateAuthBaseUrl`   | Разрешает установку `baseUrl` для провайдера аутентификации private / localhost.                |
| `enableSessionShell`        | Включает выполнение shell в сессии; bearer-токен и привязанный к сессии client id по-прежнему требуются. |
| `promptDeadlineMs`          | Лимит реального времени выполнения промпта.                                                     |
| `writerIdleTimeoutMs`       | Тайм-аут простоя SSE writer.                                                                    |
| `channelIdleTimeoutMs`      | Как долго держать дочерний процесс ACP активным после закрытия последней сессии.                |
| `sessionReapIntervalMs`     | Интервал сканирования сборщика неактивных сессий.                                               |
| `sessionIdleTimeoutMs`      | Время простоя отключенной сессии перед сборкой.                                                 |
| `rateLimit*`                | Переключатель HTTP rate limiting с разделением по уровням, пороги и окно.                       |
## `BridgeOptions` (программное встраивание bridge)

В файле `packages/acp-bridge/src/bridgeOptions.ts` определены опции bridge. Полная таблица приведена в [`03-acp-bridge.md`](./03-acp-bridge.md). Ключевые поля:

| Field                                                                                                                   | Effect                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Обязательное каноническое рабочее пространство.                                               |
| `sessionScope`                                                                                                          | `'single'` (по умолчанию) или `'thread'`.                                                     |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Ограничения на использование ресурсов.                                                        |
| `channelFactory`                                                                                                        | Подключаемая фабрика дочерних процессов ACP; по умолчанию используется `defaultSpawnChannelFactory`. |
| `fileSystem`                                                                                                            | Адаптер `BridgeFileSystem`. См. [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Настройка медиатора.                                                                          |
| `statusProvider`                                                                                                        | Ячейки предварительной проверки хоста демона.                                                 |
| `childEnvOverrides`                                                                                                     | Добавление или удаление переменных окружения для каждого хэндла.                              |
| `contextFilename`                                                                                                       | Переопределяет `getCurrentGeminiMdFilename()`.                                                |
| `channelIdleTimeoutMs`                                                                                                  | Время жизни дочернего процесса ACP после закрытия последней сессии, в мс; по умолчанию `0`.   |

## Важные значения по умолчанию

| Constant                          | File                    | Value             | Meaning                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | Лимит сессий перед возникновением `SessionLimitExceededError`.    |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Мягкий лимит для `BridgeOptions.eventRingSize`; защита от опечаток.|
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | Глубина кольца повторной передачи SSE для каждой сессии.          |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Лимит очереди для каждого подписчика.                             |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Лимит подписчиков для каждой шины.                                |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | Триггер для `slow_client_warning`.                                |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Порог сброса гистерезиса.                                         |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | Таймаут рукопожатия `initialize` в ACP.                           |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Таймаут bridge для `/workspace/mcp/:server/restart`.              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Максимальное реальное время ожидания для каждого запроса разрешения.|
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Согласовано с `DEFAULT_MAX_SUBSCRIBERS`.                          |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO для недавно обработанных разрешений.                         |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Окно корректного завершения работы для каждого канала.            |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | Таймер принудительного закрытия HTTP-сервера.                     |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Лимит чтения.                                                     |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Лимит записи.                                                     |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Лимит длины `displayName` сессии.                                 |

## Перекрестные ссылки

- Настройки аутентификации: [`12-auth-security.md`](./12-auth-security.md)
- Возможности и версия протокола: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Настройка кольца событий и противодавления: [`10-event-bus.md`](./10-event-bus.md)
- Пул / бюджет MCP: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) и [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Политика разрешений: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Руководство пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)