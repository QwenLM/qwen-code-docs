# Краткое руководство и операции

На этой странице основное внимание уделяется **тому, как запустить `qwen serve`, как проверить, что он работает, и как выглядит внутренняя цепочка вызовов от `qwen serve` до запущенного сервера**. Архитектура, компоненты и детали протокола передачи данных находятся на других страницах с углублённым описанием демона.

## 1. Самый короткий путь

```bash
qwen serve
```

Вывод:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Откройте `http://127.0.0.1:4170/demo` в браузере, чтобы увидеть отладочную консоль: чат-интерфейс, поток событий и просмотр рабочего пространства. В режиме разработки с обратной связью по умолчанию `/demo` регистрируется **до** `bearerAuth` в ветви маршрута loopback в `packages/cli/src/serve/server.ts`, поэтому токен не требуется.

## 2. Рецепты запуска

```bash
# 1. Локальная разработка по умолчанию (loopback, без токена)
qwen serve

# 2. Явное рабочее пространство + эфемерный порт
qwen serve --workspace /path/to/repo --port 0

# 3. Усиленный режим разработки loopback (принудительный bearer даже на loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Открыть доступ к LAN (не-loopback требует токен)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Настройка на большое количество сессий и увеличенное кольцо воспроизведения
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Совместная работа нескольких клиентов + строгий бюджет MCP
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Запуск с политикой консенсуса, настроенной в settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Отладочное логирование
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Отключение пула F2 (возврат к MCP-клиентам на сессию)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Разрешить междоменный доступ к веб-интерфейсу браузера
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Лимит времени на запрос + тайм-аут ожидания SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Держать дочерний процесс ACP активным после закрытия последней сессии
qwen serve --channel-idle-timeout-ms 60000

# 13. Включить ограничение скорости HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

В усиленном режиме loopback (рецепт 3) `/demo` регистрируется после `bearerAuth`. Обычная навигация в браузере требует заголовка аутентификации, поэтому используйте curl или скрипт SDK.

## 3. Полный список флагов запуска

CLI определён в **`packages/cli/src/commands/serve.ts`**:

| Флаг                                    | Тип                            | По умолчанию                                | Требуется, когда                          | Эффект                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | число                          | `4170`                                       | -                                        | TCP-порт; `0` означает эфемерный порт, назначаемый ОС.                                                                                                                                                                       |
| `--hostname <host>`                     | строка                         | `127.0.0.1`                                  | Не-loopback требует токен              | Адрес привязки. Значения loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Скобки `[::1]` автоматически удаляются; ввод `host:port` отклоняется с рекомендацией использовать `--port`.                                    |
| `--token <s>`                           | строка                         | env / отсутствует                             | Не-loopback и `--require-auth`        | Bearer-токен; обрезается один раз. **Он отображается в `/proc/<pid>/cmdline`, поэтому предпочитайте `QWEN_SERVER_TOKEN`**. Boot stderr также предупреждает об этом.                                                                                |
| `--max-sessions <n>`                    | число                          | `20`                                         | -                                        | Ограничение активных сессий. Превышение приводит к 503. `0` означает безлимит. `NaN` / отрицательные значения вызывают ошибку.                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | число                          | `5`                                          | -                                        | Лимит принятых, но ожидающих/выполняющихся промптов на сессию. Превышение возвращает 503. `0` / `Infinity` означает безлимит. Отрицательные или нецелые значения вызывают ошибку.                                                               |
| `--workspace <dir>`                     | строка                         | `process.cwd()`                              | -                                        | Привязанное рабочее пространство. **Должен быть абсолютным путём, существовать и быть директорией**. Boot канонизирует его один раз через `canonicalizeWorkspace`. `POST /session` с несовпадающим `cwd` возвращает `400 workspace_mismatch`. |
| `--max-connections <n>`                 | число                          | `256`                                        | -                                        | `server.maxConnections` на уровне слушателя. `0` / `Infinity` означает безлимит. `NaN` / отрицательные значения не допускают запуск, чтобы избежать поведения fail-open.                                                                              |
| `--require-auth`                        | логический                     | `false`                                      | Требуется токен                           | Расширяет bearer-аутентификацию на loopback **и** `/health`. Boot отказывается запускаться без токена.                                                                                                                             |
| `--enable-session-shell`                | логический                     | `false`                                      | Требуется токен                           | Включает прямое выполнение `POST /session/:id/shell`. Вызывающие также должны отправлять session-bound `X-Qwen-Client-Id`.                                                                                                        |
| `--event-ring-size <n>`                 | число                          | `8000`                                       | -                                        | Глубина кольца воспроизведения SSE на сессию. Мягкий лимит — `MAX_EVENT_RING_SIZE = 1_000_000`; значения вне диапазона вызывают ошибку при построении bridge.                                                                               |
| `--http-bridge`                         | логический                     | `true`                                       | -                                        | Режим bridge этапа 1: один дочерний процесс `qwen --acp`, мультиплексируемый демоном. Режим in-process этапа 2 ещё не реализован; `--no-http-bridge` возвращает fallback и выводит сообщение в stderr.                                            |
| `--mcp-client-budget <n>`               | число                          | отсутствует                                    | Требуется для `mcp-budget-mode=enforce`   | Лимит MCP-клиентов рабочего пространства. Должен быть положительным целым числом.                                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn`, если задан бюджет, иначе `off` | `enforce` требует `--mcp-client-budget` | `enforce` отклоняет, `warn` только предупреждает при 75%, `off` — только наблюдение.                                                                                                                                               |
| `--allow-origin <pattern>`              | повторяемая строка              | отсутствует                                    | -                                        | Белый список CORS, заменяющий запрет Origin по умолчанию. `*` требует токена.                                                                                                                                         |
| `--allow-private-auth-base-url`         | логический                     | `false`                                      | -                                        | Разрешает установку `baseUrl` провайдера аутентификации на localhost/частную сеть. Используйте только для доверенной локальной разработки.                                                                                                      |
| `--prompt-deadline-ms <n>`              | число                          | отсутствует                                    | -                                        | Серверный лимит времени на промпт в мс; по истечении промпт прерывается.                                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | число                          | отсутствует                                    | -                                        | Тайм-аут ожидания бездействия на одно SSE-соединение в мс.                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | число                          | `0`                                          | -                                        | Держит дочерний процесс ACP активным после закрытия последней сессии. `0` означает немедленное освобождение.                                                                                                                               |
| `--session-reap-interval-ms <n>`        | число                          | `60000`                                      | -                                        | Интервал сканирования сборщика сессий. `0` отключает его.                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | число                          | `1800000`                                    | -                                        | Тайм-аут бездействия отключённой сессии. `0` отключает его.                                                                                                                                                                   |
| `--rate-limit` / `--no-rate-limit`      | логический                     | env / выкл                                    | -                                        | Включает или отключает ограничение скорости HTTP на каждый уровень.                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | число                          | `10`                                         | `--rate-limit`                           | Количество запросов промптов за окно.                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | число                          | `30`                                         | `--rate-limit`                           | Количество запросов мутаций за окно.                                                                                                                                                                                         |
| `--rate-limit-read <n>`                 | число                          | `120`                                        | `--rate-limit`                           | Количество запросов чтения за окно.                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | число                          | `60000`                                      | `--rate-limit`                           | Длина окна ограничения скорости; должна быть `>= 1000`.                                                                                                                                                                          |
## 4. Переменные окружения

| Переменная окружения                | Эквивалентный флаг / эффект                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Эквивалентно `--token`; `--token` имеет приоритет. Обрезается один раз при запуске, чтобы удалить завершающий символ новой строки из `cat token.txt`.                    |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (регистр не важен) включает подробный вывод в stderr.                                                                                       |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` полностью отключает пул MCP рабочей области и возвращается к сессионному `McpClientManager`. Возможности перестают рекламировать `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Внутренний бюджет дочернего процесса ACP. CLI генерирует его из `--mcp-client-budget` через `childEnvOverrides`; это не fallback на переменную родительского процесса.   |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Внутренний режим бюджета дочернего процесса ACP. CLI генерирует его из `--mcp-budget-mode` через `childEnvOverrides`; это не fallback на переменную родительского процесса. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback для `--prompt-deadline-ms`.                                                                                                                                    |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback для `--writer-idle-timeout-ms`.                                                                                                                                |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Читается дочерним процессом ACP. Разделенный запятыми разрешенный список транспортов пула; по умолчанию `stdio,websocket`.                                                |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Читается дочерним процессом ACP. Задержка отключения простаивающих записей пула; по умолчанию `30000`, ограничено `1000..600000` мс.                                       |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` включает ограничение скорости; флаг CLI имеет приоритет.                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback для `--rate-limit-prompt`.                                                                                                                                     |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback для `--rate-limit-mutation`.                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback для `--rate-limit-read`.                                                                                                                                       |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback для `--rate-limit-window-ms`.                                                                                                                                  |

Переопределения для каждого дескриптора намеренны: два демона, работающие в одном процессе, не конкурируют за `process.env`. `defaultSpawnChannelFactory` делает снимок env на момент порождения.

## 5. Файл `settings.json` также читается

При запуске однократно вызывается `loadSettings(boundWorkspace)`:

| Ключ                         | Тип                                                              | Поведение                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Устанавливает `BridgeOptions.permissionPolicy`. **При запуске проверяется через `validatePolicyConfig`**; неизвестные значения вызывают `InvalidPolicyConfigError` вместо тихого fallback. |
| `policy.consensusQuorum`    | положительное целое число                                          | N для политики `consensus`. По умолчанию `floor(M/2)+1`. Если задано при политике, отличной от `consensus`, игнорируется, и при запуске выводится предупреждение в stderr. |
| `context.fileName`          | строка                                                            | Переопределяет `getCurrentGeminiMdFilename()` и управляет файлом, который будет записан `POST /workspace/init`.                                                            |
| `tools.disabled`            | string[]                                                          | Нормализуется через `normalizeDisabledToolList()` (trim, удаление пустых записей, дедупликация) перед влиянием на следующий запуск дочернего ACP.                           |
| `tools.approvalMode`        | строка                                                            | Режим одобрения сессии по умолчанию.                                                                                                                                     |
| `telemetry`                 | объект                                                            | Конфигурация OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, отдельные точки для каждого сигнала и другое. См. [`17-configuration.md`](./17-configuration.md).         |
Сбой ввода/вывода настроек, например, некорректный JSON, приводит к использованию значений по умолчанию. Исключение составляет `InvalidPolicyConfigError`: неправильная конфигурация политики приводит к явному отказу при загрузке.

## 6. Сценарии отказа при загрузке (явные ошибки)

`run-qwen-serve.ts` намеренно выбрасывает исключение вместо использования резервного варианта в следующих случаях:

| Сценарий                                                                          | Префикс ошибки                                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Привязка не к loopback без токена                                                 | `Refusing to bind ... without a bearer token`                                                            |
| `--require-auth` без токена                                                       | `Refusing to start with --require-auth set but no bearer token`                                          |
| `--workspace` не существует, не является каталогом или не является абсолютным путем | `Invalid --workspace ...`                                                                                |
| `--workspace` — отказ в доступе stat                                              | `Invalid --workspace ...: permission denied`                                                             |
| `--mcp-client-budget` не является положительным целым числом                      | `Must be a positive integer`                                                                             |
| `--mcp-budget-mode=enforce` без бюджета                                           | `requires a positive mcpClientBudget`                                                                    |
| `--hostname` записан как `localhost:4170`                                         | `looks like a "host:port" combination. Use --port`                                                       |
| `--hostname [::1]:8080`                                                           | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form`      |
| `--max-connections` равно `NaN` или отрицательно                                  | `Must be >= 0`                                                                                           |
| `--event-ring-size > 1_000_000`                                                   | Выбрасывается при построении моста                                                                       |
| `--allow-origin '*'` без токена                                                   | `Refusing to start with --allow-origin '*' but no bearer token configured`                               |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` не является положительным целым числом | `Must be a positive integer`                                                                    |
| Неизвестное `policy.permissionStrategy` или неположительное `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                               |

## 7. Контрольный список проверки с помощью curl

```bash
# 1. Проверка работоспособности
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Глубокая проверка здоровья
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Возможности
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Предварительная готовность
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Снимок окружения (секреты только сообщают о наличии)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. Снимок пула MCP / бюджета
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Создание сессии
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Просмотр SSE (замените <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Демо-страница
open http://127.0.0.1:4170/demo
```

Если включена аутентификация bearer, добавьте `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` к каждому запросу.

## 8. Можно ли использовать демо-страницу?

**Да.** Она реализована в `getDemoHtml(port)` в `packages/cli/src/serve/demo.ts` как самодостаточный HTML без внешних зависимостей.

| Режим запуска                          | Где зарегистрирован `/demo`                                                                 | Прямой переход в браузере                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Loopback без `--require-auth`          | Ветка маршрутов loopback перед аутентификацией в `server.ts`, **до** `bearerAuth`           | Работает без токена                                      |
| Loopback с `--require-auth`            | Ветка маршрутов после аутентификации в `server.ts`, **после** `bearerAuth`                  | Сложно использовать из обычного браузера; используйте curl или SDK |
| Привязка не к loopback                 | Ветка маршрутов после аутентификации в `server.ts`, **после** `bearerAuth`                  | То же, что выше                                          |
CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, плюс `X-Frame-Options: DENY`. Страница может загружать только `'self'` (демон) и не может загружать внешние скрипты или стили.

## 9. Цепочка вызовов от `qwen serve` до запущенного сервера

```text
qwen serve
   |
   v (процесс)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (сборка yargs)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (обработчик)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # отложенная загрузка
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- обрезка токена
   |  |- fallback при несовпадении hostname
   |  |- предварительная проверка аутентификации
   |  |- проверка и канонизация рабочего пространства
   |  |- проверка бюджета MCP + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - создает Express-приложение (**не запускает прослушивание**)
   |  |- цепочка промежуточных обработчиков (разрешенные хосты / CORS / bearerAuth / шлюз мутаций / ограничение скорости)
   |  |- монтирование маршрутов (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- возвращает app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- вывод "qwen serve listening on ..."
   |  |- регистрация SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // блокироваться навсегда до сигнала
```

Ключевые факты:

- **`createServeApp` только собирает; он не запускает прослушивание.** Он возвращает экземпляр `express()` с подключенными промежуточными обработчиками и маршрутами. Вызывающий код владеет `app.listen()`. В `server.test.ts` фабрика используется таким образом примерно в 25 тестах, поэтому она намеренно не управляет жизненным циклом.
- **`() => actualPort` — это ленивое замыкание.** `actualPort` присваивается в колбэке `app.listen`. Промежуточный обработчик `hostAllowlist` читает его по требованию, так что эфемерные порты (`--port 0`) по-прежнему корректно проверяют заголовок `Host`.
- **`await blockForever()` используется намеренно.** Если `yargs.parse()` завершится, верхний уровень CLI переходит в точку входа интерактивного TUI (`gemini.tsx`). SIGINT / SIGTERM завершают работу через путь `onSignal` в `runQwenServe`.

## 10. Разделение HTTP-маршрутов по файлам

Основная сборка происходит в `createServeApp()` в `server.ts`, который подключает четыре модульных файла маршрутов:

| Маршруты                                                                                                                  | Файл                                                  | Точка подключения                                |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `/health`, `/demo`, `/capabilities`, все маршруты сессий, device flow, голосование за разрешения, SSE и перезапуск MCP на одном сервере | `packages/cli/src/serve/server.ts`                    | Зарегистрированы непосредственно внутри `createServeApp()` |
| `/workspace/memory` (GET/POST)                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                   |
| Все маршруты CRUD `/workspace/agents`                                                                                     | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                   |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`              |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`             |

Полный справочник по маршрутам и протоколу см. в [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Об архитектуре — в [`01-architecture.md`](./01-architecture.md).

## 11. Плавное vs жёсткое завершение

- **Первый SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> двухфазное плавное завершение:
  1. `bridge.shutdown()`: каждый канал получает `KILL_HARD_DEADLINE_MS` (10s), затем `channel.kill()`.
  2. `server.close()`: текущие запросы обрабатываются, `SHUTDOWN_FORCE_CLOSE_MS` (5s) вызывает `closeAllConnections()`, затем применяется второй таймаут в 2s.
- **Второй SIGINT / SIGTERM во время уже выполняющегося завершения** -> `bridge.killAllSync()` синхронно посылает SIGKILL всем дочерним процессам ACP и вызывает `process.exit(1)`, чтобы избежать процессов-сирот.
`RunHandle.close()`, возвращаемый `runQwenServe`, — программный эквивалент для встраивания и тестов.

## 12. Встроенный вызов (обход CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // эфемерный
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... вызвать handle.bridge напрямую или обратиться к handle.server
await handle.close(); // программное завершение
```

Или получите Express-приложение напрямую и слушайте сами:

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

Примечание: при прямом вызове `createServeApp` по умолчанию `fsFactory.trusted = false`. Агентская ACP-операция `writeTextFile` отклоняется как `untrusted_workspace`, и в stderr однократно выводится предупреждение. Либо внедрите `deps.fsFactory` с явным доверием, либо внедрите `deps.bridge`, либо примите поведение по умолчанию с ограничением доверия.

## 13. Рецепты отладки

См. раздел об отладке в [`19-observability.md`](./19-observability.md). Часто используемые команды:

```bash
# Демон жив?
curl http://127.0.0.1:4170/health

# Какие возможности объявлены?
curl -s http://127.0.0.1:4170/capabilities | jq

# Готовность рабочей области демона
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Потоковая передача SSE в реальном времени
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Подробные логи
QWEN_SERVE_DEBUG=1 qwen serve
```

## Ссылки

- Точка входа CLI: `packages/cli/src/commands/serve.ts`
- Загрузчик: `packages/cli/src/serve/run-qwen-serve.ts`
- Фабрика Express: `packages/cli/src/serve/server.ts`
- Промежуточное ПО: `packages/cli/src/serve/auth.ts`
- Фабрика моста: `packages/acp-bridge/src/bridge.ts`
- HTML демо-страницы: `packages/cli/src/serve/demo.ts`
- Документация пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Протокол взаимодействия: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
