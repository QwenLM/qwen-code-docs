
# Среда выполнения Serve

## Обзор

`packages/cli/src/serve/` — это загрузочный слой для `qwen serve`. Он преобразует флаги CLI в `ServeOptions`, проверяет конфигурацию запуска, собирает приложение Express, подключает middleware, регистрирует маршруты, предоставляет провайдеры preflight/статуса для хоста демона, поддерживает кольцо аудита разрешений и управляет двухфазным процессом корректного завершения работы (graceful shutdown). Работа с HTTP находится в этом слое; работа с ACP находится на уровень ниже в `@qwen-code/acp-bridge` (см. [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Обязанности

- Парсинг и валидация `ServeOptions`: адрес прослушивания, аутентификация, рабочее пространство (workspace), лимиты сессий/подключений, бюджет/пул MCP, CORS, таймауты простоя для промптов/SSE/сессий, rate limit и связанные переключатели.
- **Канонизация** основного рабочего пространства ровно один раз, а также канонизация каждого повторного `--workspace` перед регистрацией сессионных сред выполнения. Основная каноническая форма используется в `/capabilities.workspaceCwd`, fallback для `POST /session` и в основном bridge.
- Отклонение небезопасных или невалидных конфигураций запуска: привязка не к loopback-интерфейсу без токена, `--require-auth` без токена, wildcard или не-loopback HTTP(S) `--allow-origin` без токена, `mcpBudgetMode='enforce'` без положительного `mcpClientBudget`, несуществующий или не являющийся директорией `--workspace`, а также невалидные значения таймаутов или rate-limit.
- Создание фабрики `WorkspaceFileSystem`, издателя аудита разрешений (permission audit publisher), `DaemonStatusProvider` и `acp-bridge`.
- Сборка приложения Express, подключение middleware (`allowOriginCors` поверх мутабельного allowlist origin -> `hostAllowlist` -> access log -> `bearerAuth` -> rate limit -> JSON parser -> telemetry -> per-route `mutationGate`) и монтирование маршрутов для сессий, CRUD-операций с рабочим пространством, файлами, аутентификации через device-flow, голосования за разрешения и ACP HTTP. (Безусловная стена `denyBrowserOriginCors` сохраняется только в бутстрап-приложении `run-qwen-serve.ts`.)
- Привязка порта прослушивания и регистрация обработчиков сигналов.
- Запуск двухфазного завершения работы по SIGINT/SIGTERM; принудительный выход при получении второго сигнала.

## Архитектура

**Точка входа**: `runQwenServe(opts, deps)` в `packages/cli/src/serve/run-qwen-serve.ts`. Возвращает `RunHandle` (`{ url, port, close, ... }`).

**Фабрика приложения**: `createServeApp(opts, getPort, deps)` в `packages/cli/src/serve/server.ts`. Собирает Express `Application`. Прямые встраивающие модули и тесты вызывают её без обёртки бутстрапа.

**Реестр возможностей**: `SERVE_CAPABILITY_REGISTRY` в `packages/cli/src/serve/capabilities.ts`. Каждый тег имеет версию `since` и опциональные `modes`. Условные теги исключаются, если их деплойментный или рантаймный предикат ложен; реестр и карта предикатов являются источником истины. См. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` и `server.ts`):

| Middleware, в порядке регистрации | Назначение                                                                                                                                                                                                   | Примечания                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowOriginCors`                 | Всегда устанавливается на runtime-приложение поверх `MutableOriginAllowlist`: записи из `--allow-origin <pattern>` засевают его; Local Control добавляет LAN origin, пока включён; несовпадающие origin получают 403 deny envelope. | См. [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                  |
| `hostAllowlist(bind, getPort)`    | На loopback-интерфейсе проверяет, что `Host` принадлежит `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal` или точному привязанному loopback-адресу, а также фактическому порту; формы без порта принимаются на портах 80 и 443.                                                                    | Защита от DNS rebinding. Сравнение без учёта регистра и кэшируется для каждого порта. LAN-листенер Local Control всегда применяет проверку Host по рекламируемому authority, независимо от основной привязки. |
| Access-log middleware             | Записывает метод, путь, статус, durationMs, sessionId и clientId в `DaemonLogger` при завершении запроса.                                                                                                     | Регистрируется **до** `bearerAuth`, поэтому 401 отказы также логируются. Пропускает `/health` и heartbeat.                                                                                           |
| `bearerAuth(token)`               | SHA-256 плюс `timingSafeEqual` — константное сравнение bearer-токена.                                                                                                                                        | Открытый пропуск, когда токен не настроен (loopback dev по умолчанию). Схема `Bearer` без учёта регистра.                                                                                            |
| Rate-limit middleware             | Опциональный token bucket для каждого уровня для маршрутов промптов, мутаций и чтения.                                                                                                                       | Регистрируется после `bearerAuth` и до парсинга JSON; возвращает 429 до парсинга, когда bucket исчерпан.                                                                                             |
| `express.json({ limit: '10mb' })` | Парсинг тела JSON.                                                                                                                                                                                           | Ошибки парсинга возвращают 400.                                                                                                                                                                      |
| `daemonTelemetryMiddleware`       | Оборачивает классифицированные запросы к daemon API, достигшие этой точки, в OpenTelemetry span через `withDaemonRequestSpan`.                                                                                | Атрибуты включают канонический маршрут, хеш разрешённого рабочего пространства, sessionId, clientId и код статуса. Более ранние отказы auth, rate-limit и body-parser находятся за пределами этой span-границы. |
| `createMutationGate` (per-route)  | Опциональный на уровне маршрута гейт для мутаций, требующих полномочий оператора. Допускаются запросы от доверенного основного слушателя, запросы с bearer-аутентификацией и сопряжённые запросы Local Control.                                                                                                            | Запрос от основного слушателя без токена, достигший строгого гейта без доверенного loopback-authority, возвращает `401 { code: 'token_required' }`. Отсутствующие или невалидные настроенные учётные данные отклоняются ранее bearer-middleware с обычным `401 Unauthorized`. Не глобальный `app.use`; маршруты вызывают `mutate({ strict: true })` по мере необходимости.                                                             |

**Подсистемы**:

| Путь                                                             | Роль                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                      | Фабрика `WorkspaceFileSystem` плюс `policy.ts` (проверки размера/доверия/бинарности), `paths.ts` (канонизация, resolveWithin, отклонение symlink), `audit.ts` и типизированные значения `FsError`.                                                                                                                                                                                                                                          |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | HTTP-обработчики для `GET /file`, `GET /file/bytes`, `POST /file/write` и `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD субагентов).                                                                                                                                                                                                                                                                                                                                                                                       |
| `serve/daemon-status-provider.ts`                                | Снимок окружения и preflight-ячейки хоста демона: версия Node, точка входа CLI, статистика рабочего пространства, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                        |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO на 512 записей) и `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                              |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Маршруты OAuth device-flow. См. [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                              |
| `serve/daemon-logger.ts`                                         | Структурированные файловые логи `DaemonLogger`. См. [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                          |
| `serve/debug-mode.ts`                                            | Общий предикат `isServeDebugMode()`, управляющий подробным контекстом ошибок в HTTP-ответах.                                                                                                                                                                                                                                                                                                                                                 |
| `serve/acp-http/`                                                | Транспорт ACP Streamable HTTP (RFD #721), монтируется в `/acp`. Семь файлов реализуют JSON-RPC POST, SSE GET, DELETE teardown и общее использование bridge параллельно с REST-поверхностью.                                                                                                                                                                                                                                                  |
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts`       | Поиск и монтирование собранных ресурсов Web Shell (браузерный UI демона) в `/`, `/assets` и `/session/:id`, а также резервный маршрут SPA deep-link, регистрируемый после всех API-маршрутов. Монтируется **до** `bearerAuth` в любом режиме запуска, поскольку браузер не может добавить `Authorization` к навигации или подресурсу. API-вызовы следуют обычной политике authority: настроенные токены контролируют обычные API-маршруты, кроме loopback `/health`, если не установлен `--require-auth`, а входные вебхуки каналов всегда используют свой собственный общий секрет, а основной доверенный loopback-слушатель без токена имеет полный доступ оператора. Деградирует до API-only, если ресурсы отсутствуют; `--no-web` позволяет отказаться. |

**Импорты из пакета ACP bridge**:

- Примитивы event-bus импортируются из `@qwen-code/acp-bridge/eventBus`.
- Примитивы статуса импортируются из `@qwen-code/acp-bridge/status`.
- `serve/acp-session-bridge.ts` остаётся как локальный для CLI фасад совместимости для более широкой поверхности bridge.

## Поток выполнения

### Последовательность загрузки

До того как `runQwenServe()` запускает эту последовательность, режим CLI `--open-with-auth` проверяет возможность работы с loopback/Web Shell и заполняет `ServeOptions.token` выбранным настроенным токеном или 32 случайными байтами в кодировке base64url, если выбор пуст. Прямые встраивающие модули и вызовы без этого флага (по умолчанию выключенного) не генерируют токен.

1. **Получение и обрезка токена** из `opts.token` или `QWEN_SERVER_TOKEN`; это предотвращает скрытое нарушение сравнения bearer-токена из-за завершающего символа новой строки от `cat token.txt`.
2. **Защита от опечаток в hostname**: `--hostname localhost:4170` вызывает ошибку и предлагает использовать `--port`.
3. **Preflight аутентификации**: отказ при non-loopback без токена; отказ при `--require-auth` без токена.
4. **Валидация рабочего пространства**: абсолютный путь, существует, является директорией. `EACCES` / `EPERM` оборачиваются, чтобы указать на флаг.
5. **Канонизация рабочего пространства**: `canonicalizeWorkspace(rawWorkspace)` один раз запускает `realpathSync.native` и передаёт результат в `/capabilities`, fallback для `POST /session` и в bridge.
6. **Валидация бюджета MCP**: положительное целое число; `enforce` требует указания бюджета.
7. **Вывод переключателя пула MCP**: родительская переменная окружения `QWEN_SERVE_NO_MCP_POOL=1` устанавливает `mcpPoolActive=false`, поэтому возможности честно исключают `mcp_workspace_pool` и `mcp_pool_restart`.
8. **Валидация CORS / таймаутов / rate-limit**: wildcard и не-loopback HTTP(S) значения `--allow-origin` требуют токен; значения таймаутов простоя промптов, writer, канала, сессии, reaper и окна rate-limit приводят к быстрому сбою при невалидности.
9. **`childEnvOverrides` для каждого handle**: передача `QWEN_SERVE_MCP_CLIENT_BUDGET` и `QWEN_SERVE_MCP_BUDGET_MODE` дочернему процессу ACP через `BridgeOptions.childEnvOverrides` вместо мутации `process.env`.
10. **Однократная загрузка `settings.json`**: чтение `context.fileName`, `policy.permissionStrategy` и `policy.consensusQuorum`. Повреждённые файлы откатываются к значениям по умолчанию. `validatePolicyConfig()` проверяет `policy.*` на соответствие `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; неизвестные стратегии или неположительный `consensusQuorum` выбрасывают `InvalidPolicyConfigError`. Кворум, установленный для стратегии, отличной от `consensus`, логирует предупреждение в stderr.
11. **Выделение `PermissionAuditRing`** (512 записей).
12. **Сборка `fsFactory`**: `runQwenServe` по умолчанию использует `trusted: true`; прямые вызовы `createServeApp` по умолчанию используют `trusted: false` и выводят одно предупреждение.
13. **`createHttpAcpBridge`**, см. [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** собирает Express.
15. **Создание и привязка HTTP(S)-сервера к жизненному циклу перед прослушиванием**, затем вызов `server.listen(port, hostname)` и разрешение фактического `getPort()` для allowlist хоста. Владение Conversations не может начаться, пока этот слушатель и оставшиеся хост-гейты запуска не будут готовы.
16. **Регистрация обработчиков SIGINT / SIGTERM** для корректного завершения работы через общий жизненный цикл приложения.

### Корректное завершение работы

1. **Закрытие допуска и начало всех дренирований** по первому сигналу:
   - Удаление реестра device-flow и отмена ожидающих потоков.
   - `bridge.shutdown()` помечает каждый канал `isDying = true`, отправляет корректное закрытие в stdin каждого дочернего процесса ACP, ждёт `KILL_HARD_DEADLINE_MS` (10 с) для каждого канала, затем при необходимости вызывает `channel.kill()`.
2. **Закрытие слушателя, пока выполняются дренирования приложения и хоста**:
   - `server.close()` прекращает приём новых соединений и позволяет завершиться выполняющимся запросам.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5 с) инициирует `server.closeAllConnections()`.
   - Второй дедлайн в 2 с при необходимости снова эскалирует завершение.
3. **Освобождение владения Conversations только после положительного доказательства завершения** от слушателя, локальной работы приложения, работы хоста, очистки Live discovery и дренирований среды выполнения. Любое неполное доказательство отклоняет завершение вместо небезопасной передачи.
4. **Второй сигнал во время выхода**:
   - `bridge.killAllSync()` + `process.exit(1)`, чтобы избежать блокировки выхода демона осиротевшими дочерними процессами.

## Состояние и жизненный цикл

`RunHandle` предоставляет:

- `url`: разрешённый URL прослушивания, после разрешения эфемерного порта.
- `port`: фактический порт, включая разрешение `0`.
- `close()`: программное завершение работы для встраивающих модулей и тестов.

Прямой вызов `createServeApp` возвращает только `Application`. Встраивающему модулю, которому нужны Live/Conversations, необходимо создать фактический Node-сервер, вызвать `getServeAppLifecycle(app).bindServer(server)` перед первым `listen()` и ожидать `lifecycle.close()` во время завершения работы. Без привязки обычные маршруты остаются доступными, но Live/Conversations завершаются с ошибкой (fail closed). Вызов обычного `server.close()` запускает очистку на основе событий, но встраивающий модуль всё равно должен ожидать `lifecycle.close()`, чтобы получить информацию о сбоях дренирования или освобождения владения.

## Зависимости

| Используется `serve/` (upstream)                                                                      | Использует `serve/` (downstream)          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: bridge, event bus, типы status                                               | Обработчик подкоманды `serve` CLI `qwen`  |
| `packages/core`: `getAllMemoryFilenames`, `Config`, `WorkspaceContext`                                  | Прямые встраивающие модули, тесты         |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` через bridge         |                                           |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                          |                                           |

## Конфигурация

| Источник              | Ключ                                                                                                        | Эффект                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Env                   | `QWEN_SERVER_TOKEN`                                                                                         | Bearer-токен после обрезки.                                                                                |
| Env                   | `QWEN_SERVE_NO_MCP_POOL=1`                                                                                  | Принудительно устанавливает `mcpPoolActive=false`.                                                         |
| Env дочернего процесса ACP | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                           | Генерируется из `--mcp-client-budget` / `--mcp-budget-mode` и передаётся через `childEnvOverrides`.        |
| Env                   | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                                       | Таймауты простоя промпта / SSE по умолчанию.                                                               |
| Env                   | `QWEN_SERVE_RATE_LIMIT*`                                                                                    | Переключатель rate-limit, лимиты промптов/мутаций/чтения и окно по умолчанию.                              |
| Env                   | `QWEN_SERVE_DEBUG=1`                                                                                        | Подробные логи stderr. См. [`19-observability.md`](./19-observability.md).                                 |
| Флаги                 | `--hostname`, `--port`                                                                                      | Привязка прослушивания.                                                                                    |
| Флаги                 | `--token`, `--require-auth`, `--enable-session-shell`                                                       | Bearer-токен, усиление аутентификации на loopback и явный переключатель выполнения shell.                  |
| CLI-флаги             | `--open-with-auth`                                                                                          | Запуск loopback Web Shell по умолчанию в выключенном состоянии, повторно использующий или генерирующий bearer-токен на время жизни процесса до запуска. |
| Флаг                  | `--workspace`                                                                                               | Переопределяет `process.cwd()`; повторите для регистрации дополнительных изолированных сред выполнения рабочего пространства. |
| Флаги                 | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`             | Лимиты Bridge / Express.                                                                                   |
| Флаги                 | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                             | Передаётся дочернему процессу ACP.                                                                         |
| Флаги                 | `--allow-origin`, `--allow-private-auth-base-url`                                                           | Allowlist CORS для браузера и переключатель установки провайдера аутентификации localhost/private.         |
| Флаг                  | `--web` / `--no-web`                                                                                        | Обслуживание или пропуск Web Shell UI в корне демона (по умолчанию обслуживается). `--no-web` оставляет демон в режиме API-only. |
| Флаги                 | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`, `--initialize-timeout-ms` | Управление таймаутом промпта, SSE writer, жизненным циклом простоя дочернего процесса ACP и таймаутом запросов дочернего процесса ACP. |
| Флаги                 | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                                   | Управление очисткой (reaping) отключённых сессий.                                                          |
| Флаги                 | `--rate-limit*`                                                                                             | HTTP rate limit для каждого уровня.                                                                        |
| `settings.json`       | `policy.permissionStrategy`, `policy.consensusQuorum`                                                       | Политика и кворум `MultiClientPermissionMediator`.                                                         |
| `settings.json`       | `context.fileName`                                                                                          | Имя файла памяти рабочего пространства, передаваемое в `/workspace/init` через `contextFilename` сервиса рабочего пространства. |

См. [`17-configuration.md`](./17-configuration.md) для сводной документации.

## Важные замечания и известные ограничения

- Прямой вызов `createServeApp` без `deps.fsFactory` или `deps.bridge` по умолчанию устанавливает `trusted: false`; ACP `writeTextFile` на стороне агента отклоняет запрос с ошибкой `untrusted_workspace`. Предупреждение выводится один раз.
- Runtime-приложение использует `allowOriginCors` поверх мутабельного allowlist; несовпадающие значения `Origin` получают 403 deny envelope (безусловная стена `denyBrowserOriginCors` сохраняется только в бутстрап-приложении). **Loopback** Web Shell работает, потому что другой middleware сначала удаляет совпадающие значения same-origin для loopback — привязки не к loopback требуют `--allow-origin` для XHR-запросов оболочки.
- Порядок body-parser: маршруты, использующие `mutate({ strict: true })`, возвращают 401 только после `express.json()`. В худшем случае это `--max-connections × express.json({limit: '10mb'})`, что может привести к выделению до 2,5 ГБ временной памяти при максимальной нагрузке на loopback-листенер; этот компромисс является осознанным.
- Несколько демонов в одном процессе должны использовать `childEnvOverrides` для каждого handle; мутация `process.env` приводит к гонкам, поскольку `defaultSpawnChannelFactory` делает снимок окружения в момент spawn.

## Ссылки

- `packages/cli/src/serve/run-qwen-serve.ts` (бутстрап, валидация загрузки, корректное завершение работы)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, сборка middleware и маршрутов)
- `packages/cli/src/serve/auth.ts` (CORS, allowlist Host, bearer-аутентификация, mutation gate)
- `packages/cli/src/serve/rate-limit.ts` (HTTP rate limit для каждого уровня)
- `packages/cli/src/serve/capabilities.ts` (реестр возможностей и условное объявление)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
