# Среда выполнения Serve

## Обзор

`packages/cli/src/serve/` — это загрузочный слой для `qwen serve`. Он преобразует флаги CLI в `ServeOptions`, проверяет конфигурацию запуска, собирает приложение Express, подключает middleware, регистрирует маршруты, предоставляет провайдеры preflight/статуса для хоста демона, поддерживает кольцо аудита разрешений и управляет двухфазным процессом корректного завершения работы (graceful shutdown). Работа с HTTP находится в этом слое; работа с ACP находится на уровень ниже в `@qwen-code/acp-bridge` (см. [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Функции

- Парсинг и валидация `ServeOptions`: адрес прослушивания, аутентификация, рабочее пространство (workspace), лимиты сессий/подключений, бюджет/пул MCP, CORS, таймауты простоя для промптов/SSE/сессий, rate limit и связанные переключатели.
- **Канонизация** привязанного рабочего пространства ровно один раз. Одна и та же каноническая форма используется в `/capabilities`, fallback для `POST /session` и в bridge.
- Отклонение небезопасных или невалидных конфигураций запуска: привязка не к loopback-интерфейсу без токена, `--require-auth` без токена, `--allow-origin '*'` без токена, `mcpBudgetMode='enforce'` без положительного `mcpClientBudget`, несуществующий или не являющийся директорией `--workspace`, а также невалидные значения таймаутов или rate-limit.
- Создание фабрики `WorkspaceFileSystem`, издателя аудита разрешений (permission audit publisher), `DaemonStatusProvider` и `acp-bridge`.
- Сборка приложения Express, подключение middleware (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> access log -> `bearerAuth` -> rate limit -> JSON parser -> telemetry -> per-route `mutationGate`) и монтирование маршрутов для сессий, CRUD-операций с рабочим пространством, файлами, аутентификации через device-flow, голосования за разрешения и ACP HTTP.
- Привязка порта прослушивания и регистрация обработчиков сигналов.
- Запуск двухфазного завершения работы по SIGINT/SIGTERM; принудительный выход при получении второго сигнала.

## Архитектура

**Точка входа**: `runQwenServe(opts, deps)` в `packages/cli/src/serve/run-qwen-serve.ts`. Возвращает `RunHandle` (`{ url, port, close, ... }`).

**Фабрика приложения**: `createServeApp(opts, getPort, deps)` в `packages/cli/src/serve/server.ts`. Собирает Express `Application`. Прямые встраивающие модули и тесты вызывают её без обёртки бутстрапа.

**Реестр возможностей**: `SERVE_CAPABILITY_REGISTRY` в `packages/cli/src/serve/capabilities.ts`. Каждый тег имеет версию `since` и опциональные `modes`. Десять условных тегов (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) исключаются, если соответствующий переключатель выключен. См. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` и `server.ts`):

| Middleware, в порядке регистрации         | Назначение                                                                                                                 | Примечания                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | Запрет всех заголовков `Origin` по умолчанию; переключение на allowlist при настройке `--allow-origin <pattern>`.          | См. [`12-auth-security.md`](./12-auth-security.md).                                                               |
| `hostAllowlist(bind, getPort)`            | На loopback-интерфейсе проверяет, что `Host` принадлежит `localhost`, `127.0.0.1`, `[::1]` или `host.docker.internal` плюс фактический порт. | Защита от DNS rebinding. Сравнение без учета регистра и кэшируется для каждого порта.                             |
| Access-log middleware                     | Записывает метод, путь, статус, durationMs, sessionId и clientId в `DaemonLogger` по завершении запроса.                   | Регистрируется **до** `bearerAuth`, поэтому отказы 401 также логируются. Пропускает `/health` и heartbeat.        |
| `bearerAuth(token)`                       | Сравнение bearer-токена с постоянным временем выполнения с использованием SHA-256 и `timingSafeEqual`.                     | Открытый пропуск (passthrough), если токен не настроен (дефолт для loopback-разработки). Схема `Bearer` регистронезависима. |
| Rate-limit middleware                     | Опциональный token bucket для каждого уровня для маршрутов промптов, мутаций и чтения.                                     | Регистрируется после `bearerAuth` и до парсинга JSON; возвращает 429 до парсинга, когда bucket исчерпан.          |
| `express.json({ limit: '10mb' })`         | Парсинг тела JSON.                                                                                                         | Ошибки парсинга возвращают 400.                                                                                   |
| `daemonTelemetryMiddleware`               | Оборачивает каждый HTTP-запрос в span OpenTelemetry через `withDaemonRequestSpan`.                                         | Атрибуты включают маршрут, sessionId, clientId и код статуса.                                                     |
| `createMutationGate` (per-route)          | Шлюз на уровне маршрута для маршрутов мутаций, требующих токен даже на loopback.                                           | Возвращает `401 { code: 'token_required' }`. Не является глобальным `app.use`; маршруты вызывают `mutate({ strict: true })` по мере необходимости. |

**Подсистемы**:

| Путь                                                           | Роль                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                    | Фабрика `WorkspaceFileSystem`, а также `policy.ts` (проверки размера/доверия/бинарности), `paths.ts` (канонизация, resolveWithin, отклонение symlink), `audit.ts` и типизированные значения `FsError`.                                                                                                                                                                                                                                                      |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | HTTP-обработчики для `GET /file`, `GET /file/bytes`, `POST /file/write` и `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-memory.ts`                                    | `GET/POST /workspace/memory` (CRUD для QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                             |
| `serve/workspace-agents.ts`                                    | `GET/POST/DELETE /workspace/agents` (CRUD для субагентов).                                                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/daemon-status-provider.ts`                              | Снимок окружения и preflight-ячейки хоста демона: версия Node, точка входа CLI, статистика рабочего пространства, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                                         |
| `serve/permission-audit.ts`                                    | `PermissionAuditRing` (FIFO на 512 записей) и `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`    | Маршруты OAuth device-flow. См. [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/daemon-logger.ts`                                       | Структурированные файловые логи `DaemonLogger`. См. [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                                            |
| `serve/debug-mode.ts`                                          | Общий предикат `isServeDebugMode()`, управляющий подробным контекстом ошибок в HTTP-ответах.                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/acp-http/`                                              | Транспорт ACP Streamable HTTP (RFD #721), монтируется в `/acp`. Семь файлов реализуют JSON-RPC POST, SSE GET, DELETE teardown и общее использование bridge параллельно с REST-поверхностью.                                                                                                                                                                                                                                                                  |
| `serve/demo.ts`                                                | Автономный inline HTML для `GET /demo`: браузерная консоль отладки с UI чата, логом событий и инспектором рабочего пространства. На loopback без `--require-auth` регистрируется **до** `bearerAuth`; на не-loopback или с `--require-auth` регистрируется **после** `bearerAuth`. Отдается с CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` и заголовком `X-Frame-Options: DENY`. |

**Импорты из пакета ACP bridge**:

- Примитивы event-bus импортируются из `@qwen-code/acp-bridge/eventBus`.
- Примитивы статуса импортируются из `@qwen-code/acp-bridge/status`.
- `serve/acp-session-bridge.ts` остается как локальный для CLI фасад совместимости для более широкой поверхности bridge.

## Поток выполнения

### Последовательность загрузки

1. **Получение и обрезка токена** из `opts.token` или `QWEN_SERVER_TOKEN`; это предотвращает скрытое нарушение сравнения bearer-токена из-за завершающего символа новой строки от `cat token.txt`.
2. **Защита от опечаток в hostname**: `--hostname localhost:4170` вызывает ошибку и предлагает использовать `--port`.
3. **Preflight аутентификации**: отказ при non-loopback без токена; отказ при `--require-auth` без токена.
4. **Валидация рабочего пространства**: абсолютный путь, существует, является директорией. `EACCES` / `EPERM` оборачиваются, чтобы указать на флаг.
5. **Канонизация рабочего пространства**: `canonicalizeWorkspace(rawWorkspace)` один раз запускает `realpathSync.native` и передает результат в `/capabilities`, fallback для `POST /session` и в bridge.
6. **Валидация бюджета MCP**: положительное целое число; `enforce` требует указания бюджета.
7. **Вывод переключателя пула MCP**: родительская переменная окружения `QWEN_SERVE_NO_MCP_POOL=1` устанавливает `mcpPoolActive=false`, поэтому возможности честно исключают `mcp_workspace_pool` и `mcp_pool_restart`.
8. **Валидация CORS / таймаутов / rate-limit**: `--allow-origin '*'` требует токен; значения таймаутов простоя промптов, writer, канала, сессии, reaper и окна rate-limit приводят к быстрому сбою при невалидности.
9. **`childEnvOverrides` для каждого handle**: передача `QWEN_SERVE_MCP_CLIENT_BUDGET` и `QWEN_SERVE_MCP_BUDGET_MODE` дочернему процессу ACP через `BridgeOptions.childEnvOverrides` вместо мутации `process.env`.
10. **Однократная загрузка `settings.json`**: чтение `context.fileName`, `policy.permissionStrategy` и `policy.consensusQuorum`. Поврежденные файлы откатываются к значениям по умолчанию. `validatePolicyConfig()` проверяет `policy.*` на соответствие `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; неизвестные стратегии или неположительный `consensusQuorum` выбрасывают `InvalidPolicyConfigError`. Кворум, установленный для стратегии, отличной от `consensus`, логирует предупреждение в stderr.
11. **Выделение `PermissionAuditRing`** (512 записей).
12. **Сборка `fsFactory`**: `runQwenServe` по умолчанию использует `trusted: true`; прямые вызовы `createServeApp` по умолчанию используют `trusted: false` и выводят одно предупреждение.
13. **`createHttpAcpBridge`**, см. [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** собирает Express.
15. **`server.listen(port, hostname)`**, затем разрешение фактического `getPort()` для allowlist хоста.
16. **Регистрация обработчиков SIGINT / SIGTERM** для корректного завершения работы.

### Корректное завершение работы

1. **Фаза 1 - разбор bridge** по первому сигналу:
   - Удаление реестра device-flow и отмена ожидающих потоков.
   - `bridge.shutdown()` помечает каждый канал как `isDying = true`, отправляет корректное закрытие в stdin каждого дочернего процесса ACP, ждет `KILL_HARD_DEADLINE_MS` (10 с) для каждого канала, затем при необходимости вызывает `channel.kill()`.
2. **Фаза 2 - разбор HTTP**:
   - `server.close()` прекращает прием новых соединений и позволяет завершиться выполняющимся запросам.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5 с) инициирует `server.closeAllConnections()`.
   - Второй дедлайн в 2 с при необходимости снова эскалирует завершение.
3. **Второй сигнал во время выхода**:
   - `bridge.killAllSync()` + `process.exit(1)`, чтобы избежать блокировки выхода демона осиротевшими дочерними процессами.

## Состояние и жизненный цикл

`RunHandle` предоставляет:

- `url`: разрешенный URL прослушивания, после разрешения эфемерного порта.
- `port`: фактический порт, включая разрешение `0`.
- `close({ timeoutMs? })`: программное завершение работы для встраивающих модулей и тестов.

Прямой вызов `createServeApp` возвращает только `Application`; встраивающий модуль сам управляет `listen` и завершением работы.

## Зависимости

| Используется `serve/` (upstream)                                                                      | Использует `serve/` (downstream)          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: bridge, event bus, типы status                                               | Обработчик подкоманды `serve` CLI `qwen`  |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`           | Прямые встраивающие модули, тесты         |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` через bridge         |                                           |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                          |                                           |

## Конфигурация

| Источник              | Ключ                                                                                              | Эффект                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Env                   | `QWEN_SERVER_TOKEN`                                                                               | Bearer-токен после обрезки.                                                                         |
| Env                   | `QWEN_SERVE_NO_MCP_POOL=1`                                                                        | Принудительно устанавливает `mcpPoolActive=false`.                                                  |
| Env дочернего процесса ACP | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                 | Генерируется из `--mcp-client-budget` / `--mcp-budget-mode` и передается через `childEnvOverrides`. |
| Env                   | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                             | Таймауты простоя промпта / SSE по умолчанию.                                                        |
| Env                   | `QWEN_SERVE_RATE_LIMIT*`                                                                          | Переключатель rate-limit, лимиты промптов / мутаций / чтения и окно по умолчанию.                   |
| Env                   | `QWEN_SERVE_DEBUG=1`                                                                              | Подробные логи stderr. См. [`19-observability.md`](./19-observability.md).                          |
| Флаги                 | `--hostname`, `--port`                                                                            | Привязка прослушивания.                                                                             |
| Флаги                 | `--token`, `--require-auth`, `--enable-session-shell`                                             | Bearer-токен, усиление аутентификации на loopback и явный переключатель выполнения shell.           |
| Флаг                  | `--workspace`                                                                                     | Переопределяет `process.cwd()`.                                                                     |
| Флаги                 | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`   | Лимиты Bridge / Express.                                                                            |
| Флаги                 | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                   | Передается дочернему процессу ACP.                                                                  |
| Флаги                 | `--allow-origin`, `--allow-private-auth-base-url`                                                 | Allowlist CORS для браузера и переключатель установки провайдера аутентификации localhost/private.  |
| Флаги                 | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                   | Управление жизненным циклом простоя промпта, SSE writer и дочернего процесса ACP.                   |
| Флаги                 | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                         | Управление очисткой (reaping) отключенных сессий.                                                   |
| Флаги                 | `--rate-limit*`                                                                                   | HTTP rate limit для каждого уровня.                                                                 |
| `settings.json`       | `policy.permissionStrategy`, `policy.consensusQuorum`                                             | Политика и кворум `MultiClientPermissionMediator`.                                                  |
| `settings.json`       | `context.fileName`                                                                                | Переопределение `getCurrentGeminiMdFilename` для bridge.                                            |
См. [`17-configuration.md`](./17-configuration.md) для сводной документации.

## Важные замечания и известные ограничения

- Прямой вызов `createServeApp` без `deps.fsFactory` или `deps.bridge` по умолчанию устанавливает `trusted: false`; ACP `writeTextFile` на стороне агента отклоняет запрос с ошибкой `untrusted_workspace`. Предупреждение выводится один раз.
- `denyBrowserOriginCors` отклоняет **все** запросы, содержащие заголовок `Origin`; демо-страница работает, потому что другой middleware сначала удаляет совпадающие значения same-origin.
- Порядок body-parser: маршруты, использующие `mutate({ strict: true })`, возвращают 401 только после `express.json()`. В худшем случае это `--max-connections × express.json({limit: '10mb'})`, что может привести к выделению до 2,5 ГБ временной памяти при максимальной нагрузке на loopback-листенер; этот компромисс является осознанным.
- Несколько демонов в одном процессе должны использовать `childEnvOverrides` для каждого хендла; изменение `process.env` приводит к гонкам, так как `defaultSpawnChannelFactory` делает снимок окружения в момент запуска.

## Ссылки

- `packages/cli/src/serve/run-qwen-serve.ts` (инициализация, валидация при запуске, корректное завершение работы)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, сборка middleware и маршрутов)
- `packages/cli/src/serve/auth.ts` (CORS, allowlist хостов, bearer-аутентификация, контроль мутаций)
- `packages/cli/src/serve/rate-limit.ts` (HTTP rate limit для каждого уровня)
- `packages/cli/src/serve/capabilities.ts` (реестр capabilities и их условное объявление)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Задачи: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)