# Serve Runtime

## Обзор

`packages/cli/src/serve/` — это загрузочный слой для `qwen serve`. Он преобразует флаги CLI в `ServeOptions`, проверяет конфигурацию запуска, собирает Express-приложение, подключает промежуточное ПО, регистрирует маршруты, предоставляет провайдеры предварительной проверки и состояния демона, поддерживает кольцо аудита разрешений и управляет двухфазной процедурой корректного завершения. Всё, что связано с HTTP, находится в этом слое; всё, что связано с ACP, находится на один уровень ниже в `@qwen-code/acp-bridge` (см. [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Обязанности

- Парсинг и проверка `ServeOptions`: адрес прослушивания, аутентификация, рабочее пространство, лимиты сессий/подключений, бюджет/пул MCP, CORS, таймауты бездействия для prompt/SSE/сессии, ограничение скорости и связанные переключатели.
- **Канонизация** привязанного рабочего пространства ровно один раз. Та же каноническая форма используется в `/capabilities`, в запасном варианте `POST /session` и в bridge.
- Отклонение небезопасных или недопустимых конфигураций запуска: привязка не к loopback без токена, `--require-auth` без токена, `--allow-origin '*'` без токена, `mcpBudgetMode='enforce'` без положительного `mcpClientBudget`, несуществующий или не являющийся директорией `--workspace`, а также недопустимые значения таймаутов или ограничения скорости.
- Создание фабрики `WorkspaceFileSystem`, издателя аудита разрешений, `DaemonStatusProvider` и `acp-bridge`.
- Сборка Express-приложения, подключение промежуточного ПО (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> журнал доступа -> `bearerAuth` -> ограничение скорости -> парсер JSON -> телеметрия -> per-route `mutationGate`) и монтирование маршрутов для сессий, CRUD рабочего пространства, файлов, аутентификации через device flow, голосования разрешений и ACP HTTP.
- Привязка порта прослушивания и регистрация обработчиков сигналов.
- Двухфазное завершение работы по SIGINT/SIGTERM; принудительный выход по второму сигналу.

## Архитектура

**Точка входа**: `runQwenServe(opts, deps)` в `packages/cli/src/serve/run-qwen-serve.ts`. Возвращает `RunHandle` (`{ url, port, close, ... }`).

**Фабрика приложения**: `createServeApp(opts, getPort, deps)` в `packages/cli/src/serve/server.ts`. Собирает Express-приложение `Application`. Прямые встраивания и тесты вызывают её без обёртки запуска.

**Реестр возможностей**: `SERVE_CAPABILITY_REGISTRY` в `packages/cli/src/serve/capabilities.ts`. Каждый тег имеет версию `since` и опциональные `modes`. Десять условных тегов (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) опускаются, когда соответствующий переключатель выключен. См. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Промежуточное ПО** (`packages/cli/src/serve/auth.ts` и `server.ts`):

| Промежуточное ПО, в порядке регистрации           | Назначение                                                                                                                | Примечания                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`       | По умолчанию отклоняет все заголовки `Origin`; переключается на белый список, когда задан `--allow-origin <pattern>`.      | См. [`12-auth-security.md`](./12-auth-security.md).                                                                 |
| `hostAllowlist(bind, getPort)`                    | На loopback проверяет, что `Host` принадлежит `localhost`, `127.0.0.1`, `[::1]` или `host.docker.internal` плюс реальный порт. | Защита от DNS-ребендинга. Сравнение без учёта регистра, кэшируется на порт.                                           |
| Промежуточное ПО журнала доступа                  | Записывает метод, путь, статус, durationMs, sessionId и clientId в `DaemonLogger` после завершения запроса.                 | Регистрируется **до** `bearerAuth`, так что отказы 401 тоже логируются. Пропускает `/health` и heartbeat.            |
| `bearerAuth(token)`                               | SHA-256 с константным сравнением `timingSafeEqual` для Bearer-токена.                                                     | Открытый проход, если токен не задан (значение по умолчанию для loopback-разработки). Схема `Bearer` нечувствительна к регистру. |
| Промежуточное ПО ограничения скорости             | Опциональный токен-баткет по уровням для prompt, mutation и read маршрутов.                                               | Регистрируется после `bearerAuth` и до парсинга JSON; возвращает 429 до парсинга, если баткет исчерпан.              |
| `express.json({ limit: '10mb' })`                 | Парсинг тела JSON.                                                                                                       | Ошибки парсинга возвращают 400.                                                                                     |
| `daemonTelemetryMiddleware`                       | Оборачивает каждый HTTP-запрос в span OpenTelemetry через `withDaemonRequestSpan`.                                        | Атрибуты включают маршрут, sessionId, clientId и код статуса.                                                       |
| `createMutationGate` (per-route)                  | Поуровневая опциональная защита для маршрутов изменения, требующих токен даже на loopback.                                | Возвращает `401 { code: 'token_required' }`. Не глобальное `app.use`; маршруты вызывают `mate({ strict: true })` по необходимости. |
**Подсистемы**:

| Путь                                                             | Роль                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | Фабрика `WorkspaceFileSystem` плюс `policy.ts` (проверки размера/доверия/бинарности), `paths.ts` (канонизация, `resolveWithin`, отклонение симлинков), `audit.ts` и типизированные значения `FsError`.                                                                                                                                                                                                                                                        |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | HTTP-обработчики для `GET /file`, `GET /file/bytes`, `POST /file/write` и `POST /file/edit`.                                                                                                                                                                                                                                 |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD для QWEN.md).                                                                                                                                                                                                                                                                              |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD для подагентов).                                                                                                                                                                                                                                                                    |
| `serve/daemon-status-provider.ts`                                | Снимок окружения плюс ячейки предварительной проверки хоста демона: версия Node, точка входа CLI, статистика рабочей области, ripgrep, git, npm.                                                                                                                                                                              |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO на 512 записей) и `createPermissionAuditPublisher`.                                                                                                                                                                                                                                               |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Маршруты OAuth с device-flow. См. [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                            |
| `serve/daemon-logger.ts`                                         | Структурированные файловые журналы `DaemonLogger`. См. [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                        |
| `serve/debug-mode.ts`                                            | Общий предикат `isServeDebugMode()`, управляющий подробным контекстом ошибок в HTTP-ответах.                                                                                                                                                                                                                                 |
| `serve/acp-http/`                                                | ACP Streamable HTTP транспорт (RFD #721), смонтированный по пути `/acp`. Семь файлов реализуют JSON-RPC POST, SSE GET, DELETE teardown и совместное использование bridge параллельно с REST-поверхностью.                                                                                                                     |
| `serve/demo.ts`                                                  | Самодостаточный встроенный HTML для `GET /demo`: отладочная консоль браузера с чат-интерфейсом, журналом событий и инспектором рабочей области. На loopback без `--require-auth` он регистрируется **до** `bearerAuth`; на не-loopback или с `--require-auth` — **после** `bearerAuth`. Обслуживается с CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` плюс `X-Frame-Options: DENY`. |
**Шимы для реэкспорта** для совместимости с путями импорта до F1:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Поток выполнения

### Последовательность загрузки

1. **Разрешение и обрезка токена** из `opts.token` или `QWEN_SERVER_TOKEN`; это предотвращает случайное нарушение сравнения bearer-токена из-за завершающего символа новой строки после `cat token.txt`.
2. **Защита от опечаток в hostname**: `--hostname localhost:4170` вызывает ошибку и предлагает `--port`.
3. **Предварительная проверка аутентификации**: запросы не через loopback без токена отклоняются; `--require-auth` без токена отклоняется.
4. **Проверка рабочей области**: абсолютный путь, существование, директория. Ошибки `EACCES` / `EPERM` оборачиваются с указанием на флаг.
5. **Канонизация рабочей области**: `canonicalizeWorkspace(rawWorkspace)` однократно запускает `realpathSync.native` и передаёт результат в `/capabilities`, запасной вариант `POST /session` и мост.
6. **Проверка бюджета MCP**: положительное целое число; режим `enforce` требует указания бюджета.
7. **Определение переключателя пула MCP**: переменная окружения родительского процесса `QWEN_SERVE_NO_MCP_POOL=1` устанавливает `mcpPoolActive=false`, поэтому возможности честно опускают `mcp_workspace_pool` и `mcp_pool_restart`.
8. **Проверка CORS / таймаутов / ограничения скорости**: `--allow-origin '*'` требует токена; значения для таймаута ожидания запроса (prompt), ожидания записи (writer idle), ожидания канала (channel idle), ожидания сессии (session idle), таймаута сборщика (reaper) и окна ограничения скорости (rate-limit window) быстро завершаются ошибкой при недопустимости.
9. **`childEnvOverrides` для каждого обработчика**: передача `QWEN_SERVE_MCP_CLIENT_BUDGET` и `QWEN_SERVE_MCP_BUDGET_MODE` дочернему процессу ACP через `BridgeOptions.childEnvOverrides` вместо изменения `process.env`.
10. **Однократная загрузка `settings.json`**: читаются `context.fileName`, `policy.permissionStrategy` и `policy.consensusQuorum`. Повреждённые файлы возвращают значения по умолчанию. `validatePolicyConfig()` проверяет `policy.*` на соответствие `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; неизвестные стратегии или неположительное значение `consensusQuorum` вызывают `InvalidPolicyConfigError`. Установка кворума при стратегии, отличной от `consensus`, записывает предупреждение в stderr.
11. **Выделение `PermissionAuditRing`** (512 записей).
12. **Сборка `fsFactory`**: `runQwenServe` по умолчанию использует `trusted: true`; прямые вызовы `createServeApp` по умолчанию используют `trusted: false` с однократным предупреждением.
13. **`createHttpAcpBridge`**, см. [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** собирает Express.
15. **`server.listen(port, hostname)`**, затем разрешение фактического порта через `getPort()` для белого списка хостов.
16. **Регистрация обработчиков SIGINT / SIGTERM** для корректного завершения.

### Корректное завершение работы

1. **Фаза 1 – остановка моста** по первому сигналу:
   - Удаление реестра device-flow и отмена ожидающих потоков.
   - `bridge.shutdown()` помечает каждый канал как `isDying = true`, отправляет корректное закрытие каждому дочернему процессу ACP через stdin, ожидает `KILL_HARD_DEADLINE_MS` (10 с) на канал, затем вызывает `channel.kill()` при необходимости.
2. **Фаза 2 – остановка HTTP**:
   - `server.close()` прекращает приём новых соединений и даёт завершиться текущим запросам.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5 с) запускает `server.closeAllConnections()`.
   - Дополнительный дедлайн в 2 с снова эскалирует при необходимости.
3. **Второй сигнал во время выхода**:
   - `bridge.killAllSync()` + `process.exit(1)` для предотвращения блокировки выхода демона зависшими дочерними процессами.

## Состояние и жизненный цикл

`RunHandle` предоставляет:

- `url`: разрешенный URL для прослушивания, после разрешения эфемерного порта.
- `port`: фактический порт, включая разрешение `0`.
- `close({ timeoutMs? })`: программное завершение для встраиваемых сценариев и тестов.

Прямой вызов `createServeApp` возвращает только `Application`; за `listen` и завершение отвечает встраиватель.

## Зависимости

| Вышестоящие модули, используемые `serve/`                                                                         | Нижестоящие модули, использующие `serve/`                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `@qwen-code/acp-bridge`: мост, шина событий, типы статусов                                                         | Обработчик подкоманды `serve` в CLI `qwen`                |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`                       | Прямые встраиватели, тесты                                |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` через мост                       |                                                           |

## Конфигурация

| Источник                                       | Ключ                                                                               | Эффект                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Переменная окружения                           | `QWEN_SERVER_TOKEN`                                                                | Bearer-токен после обрезки.                                                                         |
| Переменная окружения                           | `QWEN_SERVE_NO_MCP_POOL=1`                                                        | Принудительно устанавливает `mcpPoolActive=false`.                                                  |
| Переменные окружения дочернего процесса ACP    | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                      | Генерируются из `--mcp-client-budget` / `--mcp-budget-mode` и передаются через `childEnvOverrides`. |
| Переменная окружения                           | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`              | Таймауты ожидания запроса / SSE по умолчанию.                                                       |
| Переменная окружения                           | `QWEN_SERVE_RATE_LIMIT*`                                                           | Переключатель ограничения скорости, лимиты на запросы (prompt), мутации (mutation), чтение (read) и окно по умолчанию. |
| Переменная окружения                           | `QWEN_SERVE_DEBUG=1`                                                              | Подробные логи в stderr. См. [`19-observability.md`](./19-observability.md).                        |
| Флаги                                          | `--hostname`, `--port`                                                             | Привязка прослушивания.                                                                             |
| Флаги                                          | `--token`, `--require-auth`, `--enable-session-shell`                              | Bearer-токен, усиление аутентификации loopback и явное включение выполнения команд в оболочке.      |
| Флаг                                           | `--workspace`                                                                      | Переопределяет `process.cwd()`.                                                                     |
| Флаги                                          | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Ограничения моста / Express.                                                           |
| Флаги                                          | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                    | Передаются дочернему процессу ACP.                                                                  |
| Флаги                                          | `--allow-origin`, `--allow-private-auth-base-url`                                  | Белый список CORS для браузера и переключатель установки провайдера аутентификации localhost/private.|
| Флаги                                          | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`    | Управление таймаутами ожидания для запросов, записи SSE и бездействия дочернего процесса ACP.       |
| Флаги                                          | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                          | Управление сбором отключённых сессий.                                                                |
| Флаги                                          | `--rate-limit*`                                                                    | Ограничение HTTP-запросов по уровням.                                                               |
| `settings.json`                                | `policy.permissionStrategy`, `policy.consensusQuorum`                              | Политика и кворум `MultiClientPermissionMediator`.                                                  |
| `settings.json`                                | `context.fileName`                                                                 | Переопределение `getCurrentGeminiMdFilename` для моста.                                             |
См. объединённую справочную информацию в [`17-configuration.md`](./17-configuration.md).

## Ограничения и известные проблемы

- Прямой вызов `createServeApp` без `deps.fsFactory` или `deps.bridge` по умолчанию устанавливает `trusted: false`; агентский ACP `writeTextFile` выдаёт ошибку `untrusted_workspace`. Предупреждение выводится один раз.
- `denyBrowserOriginCors` отклоняет **все** запросы, содержащие заголовок `Origin`; демонстрационная страница работает, потому что другой middleware сначала удаляет совпадающие значения same-origin.
- Порядок body-parser: маршруты, использующие `mutate({ strict: true })`, возвращают 401 только после `express.json()`. Наихудший случай — `--max-connections × express.json({limit: '10mb'})`, что даёт до ~2.5 ГБ временной памяти на насыщенном loopback-слушателе; этот компромисс сделан намеренно.
- Несколько демонов в одном процессе должны использовать отдельные `childEnvOverrides` для каждого handle; мутация `process.env` приводит к состояниям гонки, поскольку `defaultSpawnChannelFactory` создаёт снимок env при порождении процесса.

## Ссылки

- `packages/cli/src/serve/run-qwen-serve.ts` (bootstrap, boot validation, graceful shutdown)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, middleware and route assembly)
- `packages/cli/src/serve/auth.ts` (CORS, Host allowlist, bearer auth, mutation gate)
- `packages/cli/src/serve/rate-limit.ts` (per-tier HTTP rate limit)
- `packages/cli/src/serve/capabilities.ts` (capability registry and conditional advertisement)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
