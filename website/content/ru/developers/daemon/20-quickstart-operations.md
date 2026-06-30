# Быстрый старт и операции

На этой странице рассматривается, **как запустить `qwen serve`, как проверить его работоспособность и как выглядит внутренняя цепочка вызовов от `qwen serve` до слушающего сервера**. Архитектура, компоненты и детали сетевого протокола описаны на других страницах с подробным разбором демона.

## 1. Кратчайший путь

```bash
qwen serve
```

Вывод:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Откройте `http://127.0.0.1:4170/demo` в браузере, чтобы увидеть консоль отладки: UI чата, поток событий и инспекцию рабочего пространства. В режиме разработки по умолчанию с loopback-интерфейсом `createServeApp()` монтирует маршрут `/demo` из `packages/cli/src/serve/routes/health-demo.ts` **до** `bearerAuth`, поэтому токен не требуется.

## 2. Рецепты запуска

```bash
# 1. Локальная разработка по умолчанию (loopback, без токена)
qwen serve

# 2. Явное указание рабочего пространства + эфемерный порт
qwen serve --workspace /path/to/repo --port 0

# 3. Защищенная loopback-разработка (принудительный bearer даже для loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Доступ из локальной сети (не-loopback требует токен)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Настройка для множества сессий и увеличенного кольца повтора
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Совместная работа нескольких клиентов + строгий лимит MCP
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Запуск с политикой консенсуса, настроенной в settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Отладочное логирование
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Отключение пула F2 (возврат к MCP-клиентам для каждой сессии)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Разрешение кросс-доменного доступа для веб-интерфейса браузера
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Дедлайн промпта + таймаут простоя SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Поддержание ACP-потомка в активном состоянии после закрытия последней сессии
qwen serve --channel-idle-timeout-ms 60000

# 13. Включение ограничения частоты HTTP-запросов
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

При использовании защищенного loopback-рецепта (3) `/demo` регистрируется после `bearerAuth`. Для обычной навигации в браузере требуется заголовок авторизации, поэтому вместо этого используйте curl или скрипт SDK.

## 3. Полные флаги запуска

CLI определен в **`packages/cli/src/commands/serve.ts`**:

| Флаг                                    | Тип                            | По умолчанию                                 | Обязательно, когда                       | Эффект                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP-порт; `0` означает эфемерный порт, назначенный ОС.                                                                                                                                                                |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Не-loopback требует токен                | Адрес привязки. Значения loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Скобки в `[::1]` удаляются автоматически; ввод `host:port` отклоняется с подсказкой использовать `--port`.                               |
| `--token <s>`                           | string                         | env / none                                   | Не-loopback и `--require-auth`           | Bearer-токен; обрезается один раз. **Он отображается в `/proc/<pid>/cmdline`, поэтому предпочтительнее использовать `QWEN_SERVER_TOKEN`**. При запуске в stderr также выводится предупреждение об этом.               |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | Лимит активных сессий. Превышение лимита при создании возвращает 503. `0` означает без ограничений. Значения `NaN` / отрицательные значения вызывают ошибку.                                                          |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | Лимит принятых, но ожидающих/выполняющихся промптов на сессию. Превышение лимита промптов возвращает 503. `0` / `Infinity` означает без ограничений. Отрицательные или нецелые значения вызывают ошибку.              |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Привязанное рабочее пространство. **Должно быть абсолютным путем, должно существовать и быть директорией**. При запуске оно один раз канонизируется с помощью `canonicalizeWorkspace`. `POST /session` с несовпадающим `cwd` возвращает `400 workspace_mismatch`. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | `server.maxConnections` на уровне слушателя. `0` / `Infinity` означает без ограничений. Значения `NaN` / отрицательные значения прерывают запуск, чтобы избежать поведения fail-open.                               |
| `--require-auth`                        | boolean                        | `false`                                      | Требуется токен                          | Расширяет bearer-аутентификацию на loopback **и** `/health`. Запуск прерывается, если токен не указан.                                                                                                                |
| `--enable-session-shell`                | boolean                        | `false`                                      | Требуется токен                          | Включает прямое выполнение `POST /session/:id/shell`. Вызывающая сторона также должна отправить привязанный к сессии `X-Qwen-Client-Id`.                                                                              |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | Глубина кольца повтора SSE для каждой сессии. Мягкий лимит — `MAX_EVENT_RING_SIZE = 1_000_000`; значения вне диапазона вызывают ошибку при создании bridge.                                                           |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | Режим bridge стадии 1: один потомок `qwen --acp`, мультиплексируемый демоном. Внутрипроцессный режим стадии 2 еще не реализован; `--no-http-bridge` использует резервный вариант и выводит сообщение в stderr.        |
| `--mcp-client-budget <n>`               | number                         | none                                         | Требуется для `mcp-budget-mode=enforce`  | Лимит MCP-клиентов рабочего пространства. Должно быть положительным целым числом.                                                                                                                                     |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn`, если задан бюджет, иначе `off`       | `enforce` требует `--mcp-client-budget`  | `enforce` отклоняет запросы, `warn` только предупреждает при достижении 75%, `off` работает только в режиме наблюдения.                                                                                               |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | Белый список CORS, заменяющий стандартный запрет Origin. Для `*` требуется токен.                                                                                                                                     |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | Разрешает установку `baseUrl` для провайдера аутентификации localhost / частной сети. Используйте только для доверенной локальной разработки.                                                                         |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | Серверный лимит реального времени выполнения промпта в мс; по таймауту промпт прерывается.                                                                                                                            |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | Таймаут простоя для каждого SSE-соединения в мс.                                                                                                                                                                      |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | Поддерживает ACP-потомка активным после закрытия последней сессии. `0` означает немедленное освобождение ресурсов.                                                                                                    |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | Интервал сканирования сборщиком сессий. `0` отключает его.                                                                                                                                                            |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | Таймаут простоя отключенной сессии. `0` отключает его.                                                                                                                                                                |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | Включает или отключает многоуровневое ограничение частоты HTTP-запросов.                                                                                                                                              |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | Запросы промптов в окне.                                                                                                                                                                                              |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | Запросы мутаций в окне.                                                                                                                                                                                               |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | Запросы на чтение в окне.                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | Длина окна ограничения частоты; должно быть `>= 1000`.                                                                                                                                                                |

## 4. Переменные окружения

| Переменная окружения                    | Эквивалентный флаг / эффект                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                     | Эквивалентно `--token`; `--token` имеет приоритет. При запуске обрезается один раз, чтобы избежать перевода строки в конце из `cat token.txt`.                            |
| `QWEN_SERVE_DEBUG`                      | `1` / `true` / `on` / `yes` (без учета регистра) включает подробные логи в stderr.                                                                                        |
| `QWEN_SERVE_NO_MCP_POOL`                | `1` полностью отключает пул MCP рабочего пространства и возвращает использование `McpClientManager` для каждой сессии. Возможности перестают анонсировать `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`          | Внутренний входной параметр бюджета ACP-потомка. CLI генерирует его из `--mcp-client-budget` через `childEnvOverrides`; это не резервная переменная окружения родительского процесса. |
| `QWEN_SERVE_MCP_BUDGET_MODE`            | Внутренний режим бюджета ACP-потомка. CLI генерирует его из `--mcp-budget-mode` через `childEnvOverrides`; это не резервная переменная окружения родительского процесса.  |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`         | Резервная переменная окружения для `--prompt-deadline-ms`.                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`     | Резервная переменная окружения для `--writer-idle-timeout-ms`.                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`        | Читается ACP-потомком. Разделенный запятыми белый список пулированных транспортов; по умолчанию `stdio,websocket`.                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`          | Читается ACP-потомком. Задержка простоя перед очисткой записи пула; по умолчанию `30000`, ограничивается диапазоном `1000..600000` мс.                                    |
| `QWEN_SERVE_RATE_LIMIT`                 | `1` / `true` включает ограничение частоты; флаг CLI имеет приоритет.                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`          | Резервная переменная окружения для `--rate-limit-prompt`.                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`        | Резервная переменная окружения для `--rate-limit-mutation`.                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`            | Резервная переменная окружения для `--rate-limit-read`.                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`       | Резервная переменная окружения для `--rate-limit-window-ms`.                                                                                                              |

Переопределения переменных окружения для каждого дескриптора сделаны намеренно: два демона, работающие в одном процессе, не создают гонок за `process.env`. `defaultSpawnChannelFactory` делает снимок переменных окружения во время создания.

## 5. Также читается settings.json

При запуске `loadSettings(boundWorkspace)` вызывается один раз:

| Ключ                        | Тип                                                                | Поведение                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Устанавливает `BridgeOptions.permissionPolicy`. **При запуске проверяется с помощью `validatePolicyConfig`**; неизвестные значения вызывают `InvalidPolicyConfigError` вместо тихого отката. |
| `policy.consensusQuorum`    | positive integer                                                   | N для политики `consensus`. По умолчанию `floor(M/2)+1`. Если установлено для политики, отличной от consensus, игнорируется, и при запуске в stderr выводится предупреждение. |
| `context.fileName`          | string                                                             | Переопределяет `getCurrentGeminiMdFilename()` и контролирует, в какой файл пишет `POST /workspace/init`.                                                               |
| `tools.disabled`            | string[]                                                           | Нормализуется через `normalizeDisabledToolList()` (обрезка, удаление пустых записей, дедупликация) перед влиянием на следующее создание ACP-потомка.                   |
| `tools.approvalMode`        | string                                                             | Режим одобрения сессии по умолчанию.                                                                                                                                   |
| `telemetry`                 | object                                                             | Конфигурация OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, эндпоинты для каждого сигнала и другое. См. [`17-configuration.md`](./17-configuration.md).              |

При сбое ввода-вывода настроек, например, из-за некорректного JSON, используются значения по умолчанию. Исключением является `InvalidPolicyConfigError`: неправильная конфигурация политики явно прерывает запуск.

## 6. Сценарии отказа при запуске (явные ошибки)

`run-qwen-serve.ts` намеренно вызывает ошибку вместо отката в следующих случаях:

| Сценарий                                                                        | Префикс ошибки                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Привязка не к loopback без токена                                               | `Refusing to bind ... without a bearer token`                                                         |
| `--require-auth` без токена                                                     | `Refusing to start with --require-auth set but no bearer token`                                       |
| `--workspace` не существует, не является директорией или не является абсолютным путем | `Invalid --workspace ...`                                                                             |
| Отказано в доступе к stat для `--workspace`                                     | `Invalid --workspace ...: permission denied`                                                          |
| `--mcp-client-budget` не является положительным целым числом                    | `Must be a positive integer`                                                                          |
| `--mcp-budget-mode=enforce` без указания бюджета                                | `requires a positive mcpClientBudget`                                                                 |
| `--hostname` записан как `localhost:4170`                                       | `looks like a "host:port" combination. Use --port`                                                    |
| `--hostname [::1]:8080`                                                         | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form`   |
| `--max-connections` равен `NaN` или отрицательному числу                        | `Must be >= 0`                                                                                        |
| `--event-ring-size > 1_000_000`                                                 | Вызывается при создании bridge                                                                        |
| `--allow-origin '*'` без токена                                                 | `Refusing to start with --allow-origin '*' but no bearer token configured`                            |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` не является положительным целым числом | `Must be a positive integer`                                                                          |
| Неизвестный `policy.permissionStrategy` или неположительный `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                            |
## 7. Чек-лист проверки через Curl

```bash
# 1. Проверка доступности
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Глубокая проверка (Deep health)
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Возможности (Capabilities)
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Готовность к предварительной проверке (Preflight)
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Снимок окружения (секреты сообщают только о своем наличии)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. Снимок пула / бюджета MCP
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Создание сессии
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Чтение SSE в реальном времени (замените <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Демо-страница
open http://127.0.0.1:4170/demo
```

Если включена bearer-аутентификация, добавьте `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` к каждому запросу.

## 8. Можно ли использовать демо-страницу?

**Да.** Она реализована через `getDemoHtml(port)` в `packages/cli/src/serve/demo.ts` как самодостаточный HTML без внешних зависимостей.

| Режим запуска                       | Где регистрируется `/demo`                                                     | Прямая навигация в браузере                          |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Loopback без `--require-auth` | `routes/health-demo.ts`, монтируется `createServeApp()` **до** `bearerAuth` | Работает без токена                                    |
| Loopback с `--require-auth`    | `routes/health-demo.ts`, монтируется `createServeApp()` **после** `bearerAuth`  | Затруднительно использовать из обычного браузера; используйте curl или SDK |
| Привязка не к loopback                 | `routes/health-demo.ts`, монтируется `createServeApp()` **после** `bearerAuth`  | Аналогично вышеуказанному                                          |

CSP равен `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, плюс `X-Frame-Options: DENY`. Страница может загружать ресурсы только с `'self'` (демона) и не может загружать внешние скрипты или стили.

## 9. Цепочка вызовов от `qwen serve` до прослушивающего сервера

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # ленивая загрузка
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // блокировка навсегда до получения сигнала
```

Ключевые факты:

- **`createServeApp` только собирает приложение; он не начинает прослушивание.** Он возвращает экземпляр `express()` с подключенными middleware и маршрутами. Вызывающая сторона отвечает за `app.listen()`. `server.test.ts` использует эту фабрику именно так примерно в 25 тестах, поэтому фабрика намеренно не управляет жизненным циклом.
- **`() => actualPort` — это ленивое замыкание.** `actualPort` присваивается в колбэке `app.listen`. Middleware `hostAllowlist` читает его по требованию, поэтому эфемерные порты (`--port 0`) по-прежнему корректно проверяют заголовок `Host`.
- **`await blockForever()` используется намеренно.** Если `yargs.parse()` завершается, верхний уровень CLI переходит к точке входа интерактивного TUI (`gemini.tsx`). SIGINT / SIGTERM завершают работу через путь `onSignal` в `runQwenServe`.

## 10. Разделение файлов HTTP-маршрутов

Основная сборка происходит в `createServeApp()` в `server.ts`, где подключаются middleware и монтируются специализированные модули маршрутов:

| Маршруты                                                                                       | Файл                                                    | Точка монтирования                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/health`, `/demo`                                                                           | `packages/cli/src/serve/routes/health-demo.ts`          | `healthDemoRoutes.register()`                                                  |
| `/daemon/status`                                                                             | `packages/cli/src/serve/routes/daemon-status.ts`        | `registerDaemonStatusRoutes()`                                                 |
| `/capabilities`, маршруты инициализации workspace/инструментов/мутации MCP, HTTP-мост ACP                    | `packages/cli/src/serve/server.ts`                      | Регистрируются напрямую внутри `createServeApp()`                                  |
| Статус workspace, окружение, preflight, сводки MCP/инструментов/провайдеров/навыков                          | `packages/cli/src/serve/routes/workspace-status.ts`     | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| Расширения workspace и операции с ними                                                | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()`                                           |
| `/workspace/memory` (GET/POST)                                                               | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                                                 |
| Все CRUD-маршруты `/workspace/agents`                                                          | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                                                 |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                        | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                                            |
| `POST /file/write`, `/file/edit`                                                             | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                                           |
| Маршруты настройки workspace, доверия, настроек, разрешений и голоса                              | `packages/cli/src/serve/routes/workspace-*.ts`          | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()` и т.д. |
| Маршруты провайдера аутентификации workspace и device-flow                                               | `packages/cli/src/serve/routes/workspace-auth.ts`       | `registerWorkspaceAuthRoutes()`                                                |
| Маршруты жизненного цикла сессии, промпта, метаданных, языка, оболочки, резюме, отката, ветвления и списка | `packages/cli/src/serve/routes/session.ts`              | `registerSessionRoutes()`                                                      |
| `GET /session/:id/events` SSE-поток                                                         | `packages/cli/src/serve/routes/sse-events.ts`           | `registerSseEventsRoutes()`                                                    |
| Маршруты ответов на запросы разрешений                                                                   | `packages/cli/src/serve/routes/permission.ts`           | `registerPermissionRoutes()`                                                   |

Полную справку по маршрутам и wire-протоколу см. в [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Об архитектуре см. в [`01-architecture.md`](./01-architecture.md).

## 11. Корректное (graceful) и жесткое (hard) завершение работы

- **Первый SIGINT / SIGTERM** -> `onSignal` в `runQwenServe` -> двухфазное корректное завершение:
  1. `bridge.shutdown()`: каждый канал получает `KILL_HARD_DEADLINE_MS` (10 с), затем вызывается `channel.kill()`.
  2. `server.close()`: обработка текущих запросов завершается, `SHUTDOWN_FORCE_CLOSE_MS` (5 с) вызывает `closeAllConnections()`, затем применяется второй дедлайн в 2 с.
- **Второй SIGINT / SIGTERM во время уже идущего завершения** -> `bridge.killAllSync()` синхронно отправляет SIGKILL всем дочерним процессам ACP и вызывает `process.exit(1)`, чтобы избежать появления процессов-сирот.

Метод `RunHandle.close()`, возвращаемый `runQwenServe`, является программным эквивалентом для встраиваемых сценариев и тестов.

## 12. Встраиваемый вызов (в обход CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

Или получите приложение Express напрямую и начните прослушивание самостоятельно:

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

Примечание: при прямом вызове `createServeApp` значение по умолчанию для `fsFactory.trusted` равно `false`. ACP-метод `writeTextFile` на стороне агента отклоняется с ошибкой `untrusted_workspace`, и в stderr выводится предупреждение (один раз). Либо внедрите `deps.fsFactory` с явным указанием доверия, либо внедрите `deps.bridge`, либо примите поведение по умолчанию, ограниченное проверкой доверия.

## 13. Рецепты отладки

См. раздел об отладке в [`19-observability.md`](./19-observability.md). Основные команды:

```bash
# Демон работает?
curl http://127.0.0.1:4170/health

# Какие возможности объявлены?
curl -s http://127.0.0.1:4170/capabilities | jq

# Готовность хоста демона
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Чтение live SSE в реальном времени
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Подробные логи
QWEN_SERVE_DEBUG=1 qwen serve
```

## Ссылки

- Точка входа CLI: `packages/cli/src/commands/serve.ts`
- Инициализация (Bootstrap): `packages/cli/src/serve/run-qwen-serve.ts`
- Фабрика Express: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Фабрика моста (Bridge): `packages/acp-bridge/src/bridge.ts`
- HTML демо-страницы: `packages/cli/src/serve/demo.ts`
- Документация для пользователей: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Wire-протокол: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)