# Serve Runtime

## Обзор

`packages/cli/src/serve/` — это загрузочный слой для `qwen serve`. Он преобразует флаги CLI в `ServeOptions`, проверяет конфигурацию запуска, собирает Express-приложение, подключает промежуточное ПО, регистрирует маршруты, предоставляет поставщиков предварительной проверки и состояния демона, поддерживает кольцо аудита разрешений и управляет двухфазной последовательностью корректного завершения. Работа с HTTP выполняется в этом слое; работа с ACP — на уровень ниже в `@qwen-code/acp-bridge` (см. [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Обязанности

- Анализировать и проверять `ServeOptions`: адрес прослушивания, аутентификация, рабочее пространство, ограничения сеансов/подключений, бюджет/пул MCP, CORS, таймауты бездействия для prompt/SSE/сеансов, ограничение скорости и связанные переключатели.
- **Канонизировать** привязанное рабочее пространство ровно один раз. Эта же каноническая форма используется `/capabilities`, запасным вариантом `POST /session` и мостом.
- Отклонять небезопасные или недопустимые конфигурации запуска: привязка не к loopback без токена, `--require-auth` без токена, `--allow-origin '*'` без токена, `mcpBudgetMode='enforce'` без положительного `mcpClientBudget`, несуществующий или не являющийся каталогом `--workspace`, а также недопустимые значения таймаутов или ограничения скорости.
- Создавать фабрику `WorkspaceFileSystem`, издателя аудита разрешений, `DaemonStatusProvider` и `acp-bridge`.
- Собирать Express-приложение, подключать промежуточное ПО (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> журнал доступа -> `bearerAuth` -> ограничение скорости -> парсер JSON -> телеметрия -> маршрутный `mutationGate`) и монтировать маршруты для сеансов, CRUD рабочего пространства, файлов, аутентификации через device-flow, голосования за разрешения и ACP HTTP.
- Привязывать порт прослушивания и регистрировать обработчики сигналов.
- Выполнять двухфазное завершение по SIGINT/SIGTERM; принудительно завершать по второму сигналу.

## Архитектура

**Точка входа**: `runQwenServe(opts, deps)` в `packages/cli/src/serve/run-qwen-serve.ts`. Возвращает `RunHandle` (`{ url, port, close, ... }`).

**Фабрика приложения**: `createServeApp(opts, getPort, deps)` в `packages/cli/src/serve/server.ts`. Собирает Express `Application`. Прямые встраиватели и тесты вызывают её без обёртки начальной загрузки.

**Реестр возможностей**: `SERVE_CAPABILITY_REGISTRY` в `packages/cli/src/serve/capabilities.ts`. Каждый тег имеет версию `since` и опциональные `modes`. Десять условных тегов (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) опускаются, если соответствующий переключатель выключен. См. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Промежуточное ПО** (`packages/cli/src/serve/auth.ts` и `server.ts`):

| Промежуточное ПО (в порядке регистрации) | Назначение                                                                                                                    | Примечания                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | По умолчанию отклонять все заголовки `Origin`; переключаться на белый список при настройке `--allow-origin <pattern>`. | См. [`12-auth-security.md`](./12-auth-security.md).                                                                    |
| `hostAllowlist(bind, getPort)`             | На loopback проверять, что `Host` принадлежит `localhost`, `127.0.0.1`, `[::1]` или `host.docker.internal` с фактическим портом. | Защита от DNS-ребендинга. Сравнение без учёта регистра, кэшируется на порт.                                            |
| Промежуточное ПО журнала доступа           | Записывает метод, путь, статус, durationMs, sessionId и clientId в `DaemonLogger` после завершения запроса.                    | Регистрируется **до** `bearerAuth`, поэтому логируются и отказы 401. Пропускает `/health` и heartbeat.                   |
| `bearerAuth(token)`                        | SHA-256 + константное сравнение `timingSafeEqual`.                                                                            | Открытый проход, если токен не настроен (по умолчанию для loopback разработки). Схема `Bearer` без учёта регистра.       |
| Промежуточное ПО ограничения скорости        | Опциональное токен-ведро для маршрутов prompt, mutation и read.                                                               | Регистрируется после `bearerAuth` и до парсинга JSON; возвращает 429 до парсинга, если ведро исчерпано.                 |
| `express.json({ limit: '10mb' })`          | Парсинг тела JSON.                                                                                                           | Ошибки парсинга возвращают 400.                                                                                        |
| `daemonTelemetryMiddleware`                | Оборачивает каждый HTTP-запрос в span OpenTelemetry через `withDaemonRequestSpan`.                                            | Атрибуты включают маршрут, sessionId, clientId и код состояния.                                                          |
| `createMutationGate` (на маршрут)           | Опциональный шлюз на уровне маршрута для мутирующих маршрутов, требующих токен даже на loopback.                               | Возвращает `401 { code: 'token_required' }`. Не глобальный `app.use`; маршруты вызывают `mutate({ strict: true })` по необходимости. |

**Подсистемы**:

| Путь                                                               | Роль                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                        | Фабрика `WorkspaceFileSystem` плюс `policy.ts` (проверки размера/доверия/бинарности), `paths.ts` (канонизация, resolveWithin, отклонение симлинков), `audit.ts` и типизированные значения `FsError`.                                                                                                                                                                                                                                          |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts`   | HTTP-обработчики для `GET /file`, `GET /file/bytes`, `POST /file/write` и `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                               |
| `serve/workspace-memory.ts`                                        | `GET/POST /workspace/memory` (CRUD QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/workspace-agents.ts`                                        | `GET/POST/DELETE /workspace/agents` (CRUD субагентов).                                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/daemon-status-provider.ts`                                  | Снимок окружения плюс ячейки предварительной проверки демона: версия Node, точка входа CLI, статистика рабочего пространства, ripgrep, git, npm.                                                                                                                                                                                                                           |
| `serve/permission-audit.ts`                                        | `PermissionAuditRing` (FIFO на 512 записей) и `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                        |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`        | Маршруты OAuth для device-flow. См. [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                      |
| `serve/daemon-logger.ts`                                           | Структурированные файловые логи `DaemonLogger`. См. [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                     |
| `serve/debug-mode.ts`                                              | Общий предикат `isServeDebugMode()`, управляющий подробным контекстом ошибок в HTTP-ответах.                                                                                                                                                                                                                                                                                                                                             |
| `serve/acp-http/`                                                  | ACP Streamable HTTP транспорт (RFD #721), смонтирован на `/acp`. Семь файлов реализуют JSON-RPC POST, SSE GET, DELETE teardown и совместное использование моста параллельно с REST-поверхностью.                                                                                                                                                                                                                                       |
| `serve/demo.ts`                                                    | Самодостаточный встроенный HTML для `GET /demo`: отладочная консоль браузера с интерфейсом чата, журналом событий и инспектором рабочего пространства. На loopback без `--require-auth` регистрируется **до** `bearerAuth`; на не-loopback или с `--require-auth` регистрируется **после** `bearerAuth`. Обслуживается с CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` плюс `X-Frame-Options: DENY`. |

**Шимы реэкспорта** для совместимости с путями импорта до F1:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Поток выполнения

### Последовательность загрузки

1. **Разрешить и обрезать токен** из `opts.token` или `QWEN_SERVER_TOKEN`; это предотвращает незаметное нарушение сравнения bearer из-за завершающего перевода строки из `cat token.txt`.
2. **Защита от опечаток в hostname**: `--hostname localhost:4170` выдаёт ошибку и предлагает `--port`.
3. **Предварительная проверка аутентификации**: привязка не к loopback без токена отклоняется; `--require-auth` без токена отклоняется.
4. **Проверка рабочего пространства**: абсолютный путь, существует, каталог. `EACCES` / `EPERM` обёрнуты, чтобы указать на флаг.
5. **Канонизировать рабочее пространство**: `canonicalizeWorkspace(rawWorkspace)` выполняет `realpathSync.native` один раз и передаёт результат в `/capabilities`, запасной вариант `POST /session` и мост.
6. **Проверка бюджета MCP**: положительное целое; `enforce` требует бюджет.
7. **Определение переключателя пула MCP**: родительская переменная окружения `QWEN_SERVE_NO_MCP_POOL=1` делает `mcpPoolActive=false`, поэтому возможности честно опускают `mcp_workspace_pool` и `mcp_pool_restart`.
8. **Проверка CORS / таймаутов / ограничения скорости**: `--allow-origin '*'` требует токен; значения таймаутов prompt, writer, channel idle, session idle, reaper и окна ограничения скорости быстро завершаются ошибкой при недопустимости.
9. **`childEnvOverrides` для каждого дескриптора**: передавать `QWEN_SERVE_MCP_CLIENT_BUDGET` и `QWEN_SERVE_MCP_BUDGET_MODE` дочернему процессу ACP через `BridgeOptions.childEnvOverrides` вместо изменения `process.env`.
10. **Загрузить `settings.json` один раз**: прочитать `context.fileName`, `policy.permissionStrategy` и `policy.consensusQuorum`. Повреждённые файлы возвращаются к значениям по умолчанию. `validatePolicyConfig()` проверяет `policy.*` относительно `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; неизвестные стратегии или неположительный `consensusQuorum` вызывают `InvalidPolicyConfigError`. Кворум, установленный при стратегии, отличной от `consensus`, выводит предупреждение в stderr.
11. **Выделить `PermissionAuditRing`** (512 записей).
12. **Собрать `fsFactory`**: `runQwenServe` по умолчанию использует `trusted: true`; прямые вызывающие `createServeApp` по умолчанию используют `trusted: false` и выводят одно предупреждение.
13. **`createHttpAcpBridge`**, см. [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** собирает Express.
15. **`server.listen(port, hostname)`**, затем разрешить фактический `getPort()` для белого списка хостов.
16. **Зарегистрировать обработчики SIGINT / SIGTERM** для корректного завершения.

### Корректное завершение

1. **Фаза 1 — остановка моста** по первому сигналу:
   - Удалить реестр device-flow и отменить ожидающие потоки.
   - `bridge.shutdown()` помечает каждый канал `isDying = true`, отправляет корректное закрытие на stdin каждого дочернего процесса ACP, ожидает `KILL_HARD_DEADLINE_MS` (10 с) на канал, затем при необходимости вызывает `channel.kill()`.
2. **Фаза 2 — остановка HTTP**:
   - `server.close()` прекращает принимать новые соединения и позволяет завершиться выполняющимся запросам.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5 с) инициирует `server.closeAllConnections()`.
   - При необходимости второй дедлайн в 2 с снова повышается.
3. **Второй сигнал во время выхода**:
   - `bridge.killAllSync()` + `process.exit(1)` для предотвращения блокировки выхода демона осиротевшими дочерними процессами.

## Состояние и жизненный цикл

`RunHandle` предоставляет:

- `url`: разрешённый URL прослушивания после разрешения эфемерного порта.
- `port`: фактический порт, включая разрешение `0`.
- `close({ timeoutMs? })`: программное завершение для встраивателей и тестов.

Прямой вызов `createServeApp` возвращает только `Application`; встраиватель управляет `listen` и завершением.

## Зависимости

| Исходные зависимости для `serve/`                                                                       | Потребители `serve/`                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@qwen-code/acp-bridge`: мост, шина событий, типы статусов                                              | Обработчик подкоманды `serve` CLI `qwen` |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`             | Прямые встраиватели, тесты             |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` через мост             |                                        |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                            |                                        |

## Конфигурация

| Источник                  | Ключ                                                                                             | Эффект                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Переменная окружения      | `QWEN_SERVER_TOKEN`                                                                              | Токен Bearer после обрезки.                                                                                              |
| Переменная окружения      | `QWEN_SERVE_NO_MCP_POOL=1`                                                                       | Принудительно устанавливает `mcpPoolActive=false`.                                                                       |
| Окружение дочернего ACP   | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                   | Создаётся из `--mcp-client-budget` / `--mcp-budget-mode` и передаётся через `childEnvOverrides`.                         |
| Переменная окружения      | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | Таймауты бездействия по умолчанию для prompt / SSE.                                                                      |
| Переменная окружения      | `QWEN_SERVE_RATE_LIMIT*`                                                                        | Переключатель ограничения скорости, лимиты prompt / mutation / read и окно по умолчанию.                                 |
| Переменная окружения      | `QWEN_SERVE_DEBUG=1`                                                                            | Подробные логи в stderr. См. [`19-observability.md`](./19-observability.md).                                             |
| Флаги                     | `--hostname`, `--port`                                                                          | Привязка прослушивания.                                                                                                  |
| Флаги                     | `--token`, `--require-auth`, `--enable-session-shell`                                           | Токен Bearer, усиление аутентификации на loopback и явный переключатель выполнения shell.                                 |
| Флаг                      | `--workspace`                                                                                   | Переопределяет `process.cwd()`.                                                                                           |
| Флаги                     | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Ограничения моста / Express.                                                                                              |
| Флаги                     | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | Передаётся дочернему процессу ACP.                                                                                       |
| Флаги                     | `--allow-origin`, `--allow-private-auth-base-url`                                               | Белый список CORS для браузера и переключатель установки локального/частного провайдера аутентификации.                  |
| Флаги                     | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                 | Управление жизненным циклом бездействия prompt, SSE writer и дочернего процесса ACP.                                       |
| Флаги                     | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | Управление сбором отключённых сеансов.                                                                                    |
| Флаги                     | `--rate-limit*`                                                                                 | Ограничение скорости HTTP по уровням.                                                                                    |
| `settings.json`           | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | Политика и кворум `MultiClientPermissionMediator`.                                                                       |
| `settings.json`           | `context.fileName`                                                                              | Переопределение `getCurrentGeminiMdFilename` для моста.                                                                  |
Смотрите [`17-configuration.md`](./17-configuration.md) для сводного справочника.

## Известные ограничения и предостережения

- Прямой вызов `createServeApp` без `deps.fsFactory` или `deps.bridge` по умолчанию использует `trusted: false`; на стороне агента ACP `writeTextFile` отклоняется как `untrusted_workspace`. Предупреждение выводится один раз.
- `denyBrowserOriginCors` отклоняет **все** запросы, содержащие `Origin`; демо-страница работает, потому что другой middleware предварительно удаляет совпадающие значения того же источника.
- Порядок парсинга тела: маршруты, использующие `mutate({ strict: true })`, возвращают 401 только после `express.json()`. Наихудший случай — `--max-connections × express.json({limit: '10mb'})`, что даёт до ~2,5 ГБ временной памяти на насыщенном loopback-слушателе; этот компромисс является намеренным.
- Несколько демонов в одном процессе должны использовать отдельные `childEnvOverrides` для каждого дескриптора; мутация `process.env` приводит к гонке, так как `defaultSpawnChannelFactory` снимает снимок env в момент порождения.

## Ссылки

- `packages/cli/src/serve/run-qwen-serve.ts` (загрузка, проверка при старте, корректное завершение)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, сборка middleware и маршрутов)
- `packages/cli/src/serve/auth.ts` (CORS, белый список Host, Bearer-аутентификация, шлюз для мутаций)
- `packages/cli/src/serve/rate-limit.ts` (подуровневые HTTP-ограничения)
- `packages/cli/src/serve/capabilities.ts` (реестр возможностей и условная реклама)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)