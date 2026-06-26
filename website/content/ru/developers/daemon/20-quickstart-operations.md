# Быстрый старт и операции

На этой странице описывается **как запустить `qwen serve`, как проверить, что он работает, и как выглядит внутренняя цепочка вызовов от `qwen serve` до работающего сервера**. Архитектура, компоненты и детали протокола передачи данных находятся на других страницах с подробным описанием демона.

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

Откройте `http://127.0.0.1:4170/demo` в браузере, чтобы увидеть отладочную консоль: чат-интерфейс, поток событий и просмотр рабочей области. В режиме разработки по умолчанию (loopback) `/demo` регистрируется **до** `bearerAuth` в ветке маршрутов loopback в файле `packages/cli/src/serve/server.ts`, поэтому токен не требуется.

## 2. Рецепты запуска

```bash
# 1. Локальная разработка по умолчанию (loopback, без токена)
qwen serve

# 2. Явная рабочая область + эфемерный порт
qwen serve --workspace /path/to/repo --port 0

# 3. Усиленная разработка через loopback (принудительный bearer даже на loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Открыть доступ в локальную сеть (не-loopback требует токен)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Настройка на множество сессий и большое кольцо повтора событий
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

# 10. Разрешить кросс-доменный доступ к веб-интерфейсу
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Таймаут запроса + таймаут простоя SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Держать дочерний процесс ACP активным после закрытия последней сессии
qwen serve --channel-idle-timeout-ms 60000

# 13. Включить ограничение скорости HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

При усиленном рецепте loopback (3) `/demo` регистрируется после `bearerAuth`. Обычная навигация в браузере требует заголовка аутентификации, поэтому используйте curl или скрипт SDK.

## 3. Полный список флагов запуска

CLI определён в **`packages/cli/src/commands/serve.ts`**:

| Флаг                                   | Тип                            | По умолчанию                                | Требуется когда                           | Эффект                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------ | ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                           | number                         | `4170`                                      | -                                         | TCP-порт; `0` означает эфемерный порт, назначаемый ОС.                                                                                                                                                                                                                                                    |
| `--hostname <host>`                    | string                         | `127.0.0.1`                                 | Не-loopback требует токен                 | Адрес привязки. Значения loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Квадратные скобки `[::1]` автоматически удаляются; ввод `host:port` отклоняется с указанием использовать `--port`.                                                                                                            |
| `--token <s>`                          | string                         | env / нет                                   | Не-loopback и `--require-auth`            | Bearer-токен; обрезается один раз. **Отображается в `/proc/<pid>/cmdline`, поэтому предпочтительнее `QWEN_SERVER_TOKEN`**. Загрузочный stderr также предупреждает об этом.                                                                                                                                |
| `--max-sessions <n>`                   | number                         | `20`                                        | -                                         | Лимит активных сессий. Превышение возвращает 503. `0` означает безлимит. `NaN` / отрицательные значения вызывают ошибку.                                                                                                                                                                                  |
| `--max-pending-prompts-per-session <n>`| number                         | `5`                                         | -                                         | Лимит принятых, но ожидающих/выполняющихся запросов на сессию. Превышение возвращает 503. `0` / `Infinity` означает безлимит. Отрицательные или нецелые значения вызывают ошибку.                                                                                                                         |
| `--workspace <dir>`                    | string                         | `process.cwd()`                              | -                                         | Привязанная рабочая область. **Должен быть абсолютным путём, существовать и быть директорией**. Загрузка канонизирует его один раз через `canonicalizeWorkspace`. `POST /session` с несовпадающим `cwd` возвращает `400 workspace_mismatch`.                                                              |
| `--max-connections <n>`                | number                         | `256`                                       | -                                         | Уровень слушателя `server.maxConnections`. `0` / `Infinity` означает безлимит. `NaN` / отрицательные значения прерывают загрузку, чтобы избежать поведения fail-open.                                                                                                                                      |
| `--require-auth`                       | boolean                        | `false`                                     | Требуется токен                           | Распространяет bearer-аутентификацию на loopback **и** `/health`. Загрузка отказывается запускаться без токена.                                                                                                                                                                                           |
| `--enable-session-shell`               | boolean                        | `false`                                     | Требуется токен                           | Включает прямое выполнение `POST /session/:id/shell`. Вызывающие также должны отправить привязанный к сессии `X-Qwen-Client-Id`.                                                                                                                                                                           |
| `--event-ring-size <n>`                | number                         | `8000`                                      | -                                         | Глубина кольца повтора событий SSE на сессию. Мягкий лимит `MAX_EVENT_RING_SIZE = 1_000_000`; значения вне диапазона вызывают ошибку при построении моста.                                                                                                                                                 |
| `--http-bridge`                        | boolean                        | `true`                                      | -                                         | Режим моста этапа 1: один дочерний процесс `qwen --acp`, мультиплексируемый демоном. Режим in-process этапа 2 пока не реализован; `--no-http-bridge` возвращается к нему и выводит сообщение в stderr.                                                                                                    |
| `--mcp-client-budget <n>`              | number                         | нет                                         | Требуется для `mcp-budget-mode=enforce`   | Лимит клиентов MCP в рабочей области. Должен быть положительным целым числом.                                                                                                                                                                                                                             |
| `--mcp-budget-mode <m>`                | `'enforce' \| 'warn' \| 'off'` | `warn` при заданном бюджете, иначе `off`     | `enforce` требует `--mcp-client-budget`   | `enforce` отклоняет, `warn` только предупреждает при 75%, `off` только наблюдает.                                                                                                                                                                                                                          |
| `--allow-origin <pattern>`             | повторяемая строка             | нет                                         | -                                         | Белый список CORS, заменяющий запрет Origin по умолчанию. `*` требует токена.                                                                                                                                                                                                                             |
| `--allow-private-auth-base-url`        | boolean                        | `false`                                     | -                                         | Разрешает установку `baseUrl` провайдера аутентификации на localhost/частную сеть. Используйте только для доверенной локальной разработки.                                                                                                                                                                 |
| `--prompt-deadline-ms <n>`             | number                         | нет                                         | -                                         | Серверный лимит времени выполнения запроса в мс; таймаут прерывает запрос.                                                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>`         | number                         | нет                                         | -                                         | Таймаут простоя на одно SSE-соединение в мс.                                                                                                                                                                                                                                                              |
| `--channel-idle-timeout-ms <n>`        | number                         | `0`                                         | -                                         | Держит дочерний процесс ACP активным после закрытия последней сессии. `0` означает немедленное закрытие.                                                                                                                                                                                                  |
| `--session-reap-interval-ms <n>`       | number                         | `60000`                                     | -                                         | Интервал сканирования сборщика сессий. `0` отключает его.                                                                                                                                                                                                                                                 |
| `--session-idle-timeout-ms <n>`        | number                         | `1800000`                                   | -                                         | Таймаут простоя отключённой сессии. `0` отключает его.                                                                                                                                                                                                                                                    |
| `--rate-limit` / `--no-rate-limit`     | boolean                        | env / off                                   | -                                         | Включает или отключает ограничение скорости HTTP по уровням.                                                                                                                                                                                                                                               |
| `--rate-limit-prompt <n>`              | number                         | `10`                                        | `--rate-limit`                            | Количество запросов на окно.                                                                                                                                                                                                                                                                              |
| `--rate-limit-mutation <n>`            | number                         | `30`                                        | `--rate-limit`                            | Количество мутационных запросов на окно.                                                                                                                                                                                                                                                                  |
| `--rate-limit-read <n>`                | number                         | `120`                                       | `--rate-limit`                            | Количество читающих запросов на окно.                                                                                                                                                                                                                                                                     |
| `--rate-limit-window-ms <n>`           | number                         | `60000`                                     | `--rate-limit`                            | Длина окна ограничения скорости; должна быть `>= 1000`.                                                                                                                                                                                                                                                   |

## 4. Переменные окружения

| Переменная                            | Эквивалентный флаг / эффект                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                   | Эквивалент `--token`; `--token` имеет приоритет. Обрезается один раз при загрузке, чтобы избежать завершающего перевода строки из `cat token.txt`.                        |
| `QWEN_SERVE_DEBUG`                    | `1` / `true` / `on` / `yes` (регистронезависимо) включает подробные логи в stderr.                                                                                       |
| `QWEN_SERVE_NO_MCP_POOL`              | `1` полностью отключает пул MCP рабочей области и возвращается к `McpClientManager` на сессию. Возможности перестают рекламировать `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`        | Внутренний ввод бюджета для дочернего процесса ACP. CLI генерирует его из `--mcp-client-budget` через `childEnvOverrides`; это не запасной вариант из родительского процесса. |
| `QWEN_SERVE_MCP_BUDGET_MODE`          | Внутренний режим бюджета для дочернего процесса ACP. CLI генерирует его из `--mcp-budget-mode` через `childEnvOverrides`; это не запасной вариант из родительского процесса. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`       | Запасной вариант окружения для `--prompt-deadline-ms`.                                                                                                                   |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`   | Запасной вариант окружения для `--writer-idle-timeout-ms`.                                                                                                               |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`      | Читается дочерним процессом ACP. Разделённый запятыми белый список транспортов пула; по умолчанию `stdio,websocket`.                                                      |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`        | Читается дочерним процессом ACP. Задержка слива простоя элемента пула; по умолчанию `30000`, ограничено `1000..600000` мс.                                                |
| `QWEN_SERVE_RATE_LIMIT`               | `1` / `true` включает ограничение скорости; флаг CLI имеет приоритет.                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`        | Запасной вариант окружения для `--rate-limit-prompt`.                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`      | Запасной вариант окружения для `--rate-limit-mutation`.                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_READ`          | Запасной вариант окружения для `--rate-limit-read`.                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`     | Запасной вариант окружения для `--rate-limit-window-ms`.                                                                                                                 |

Переопределения окружения на дескриптор намеренны: два демона, работающих в одном процессе, не конкурируют за `process.env`. `defaultSpawnChannelFactory` делает снимок env во время порождения.

## 5. Также читается `settings.json`

Загрузка один раз вызывает `loadSettings(boundWorkspace)`:

| Ключ                          | Тип                                                              | Поведение                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`   | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Устанавливает `BridgeOptions.permissionPolicy`. **Загрузка проверяет с помощью `validatePolicyConfig`**; неизвестные значения вызывают `InvalidPolicyConfigError` вместо тихого возврата к умолчанию.                          |
| `policy.consensusQuorum`      | положительное целое                                              | N для политики `consensus`. По умолчанию `floor(M/2)+1`. Если задано при политике, отличной от consensus, игнорируется, и загрузка выводит предупреждение в stderr.                                                           |
| `context.fileName`            | string                                                           | Переопределяет `getCurrentGeminiMdFilename()` и управляет тем, в какой файл будет писать `POST /workspace/init`.                                                                                                              |
| `tools.disabled`              | string[]                                                         | Нормализуется через `normalizeDisabledToolList()` (обрезка, удаление пустых записей, дедупликация) перед воздействием на следующий запуск дочернего процесса ACP.                                                             |
| `tools.approvalMode`          | string                                                           | Режим одобрения сессии по умолчанию.                                                                                                                                                                                          |
| `telemetry`                   | object                                                           | Конфигурация OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, конечные точки для каждого сигнала и другое. См. [`17-configuration.md`](./17-configuration.md).                                                                |

Сбой ввода-вывода настроек, например, некорректный JSON, приводит к возврату значений по умолчанию. `InvalidPolicyConfigError` — исключение: неправильная конфигурация политики явно прерывает загрузку.

## 6. Сценарии отказа при загрузке (явные ошибки)

`run-qwen-serve.ts` намеренно выбрасывает ошибки вместо возврата к умолчанию в следующих случаях:

| Сценарий                                                                        | Префикс ошибки                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Привязка не-loopback без токена                                                 | `Refusing to bind ... without a bearer token`                                                      |
| `--require-auth` без токена                                                     | `Refusing to start with --require-auth set but no bearer token`                                    |
| `--workspace` не существует, не является директорией или не является абсолютным | `Invalid --workspace ...`                                                                          |
| Отказано в доступе stat для `--workspace`                                       | `Invalid --workspace ...: permission denied`                                                       |
| `--mcp-client-budget` не является положительным целым числом                    | `Must be a positive integer`                                                                       |
| `--mcp-budget-mode=enforce` без бюджета                                         | `requires a positive mcpClientBudget`                                                              |
| `--hostname` указан как `localhost:4170`                                        | `looks like a "host:port" combination. Use --port`                                                 |
| `--hostname [::1]:8080`                                                         | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` равен `NaN` или отрицательный                               | `Must be >= 0`                                                                                     |
| `--event-ring-size > 1_000_000`                                                 | Выбрасывается при построении моста                                                                 |
| `--allow-origin '*'` без токена                                                 | `Refusing to start with --allow-origin '*' but no bearer token configured`                         |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` не положительное целое       | `Must be a positive integer`                                                                       |
| Неизвестный `policy.permissionStrategy` или неположительный `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                          |
## 7. Чек-лист проверки с помощью curl

```bash
# 1. Проверка работоспособности
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Глубокая проверка здоровья
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Возможности
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Проверка готовности рабочего пространства
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Снимок окружения (секреты сообщаются только как наличие)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. Снимок пула/бюджета MCP
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

Когда включена аутентификация Bearer, добавьте `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` к каждому запросу.

## 8. Можно ли использовать демо-страницу?

**Да.** Она реализована в `getDemoHtml(port)` в `packages/cli/src/serve/demo.ts` как самодостаточный HTML без внешних зависимостей.

| Режим запуска                     | Где зарегистрирован `/demo`                                                          | Прямой переход в браузере                           |
| --------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Loopback без `--require-auth`     | `server.ts`, ветка предварительной аутентификации loopback, **до** `bearerAuth`       | Работает без токена                                 |
| Loopback с `--require-auth`       | `server.ts`, ветка после аутентификации, **после** `bearerAuth`                       | Сложно использовать из обычного браузера; используйте curl или SDK |
| Привязка не к loopback            | `server.ts`, ветка после аутентификации, **после** `bearerAuth`                       | То же, что выше                                     |

CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, плюс `X-Frame-Options: DENY`. Страница может загружать данные только с `'self'` (демона) и не может загружать внешние скрипты или стили.

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
commands/serve.ts                  handler(argv) - предварительные проверки
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # ленивая загрузка
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- запасной вариант при несовпадении hostname
   |  |- предварительная проверка аутентификации
   |  |- проверка рабочего пространства + канонизация
   |  |- проверка бюджета MCP + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + издатель
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - создание Express-приложения (**не запускает прослушивание**)
   |  |- цепочка промежуточных обработчиков (белый список хостов / CORS / bearerAuth / шлюз мутаций / лимит запросов)
   |  |- монтирование маршрутов (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
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
commands/serve.ts                  await blockForever()    // блокировка навсегда до сигнала
```

Ключевые факты:

- **`createServeApp` только создаёт приложение; не запускает прослушивание.** Возвращает экземпляр `express()` с настроенными middleware и маршрутами. Вызывающий код отвечает за `app.listen()`. В `server.test.ts` фабрика используется таким образом примерно в 25 тестах, поэтому она намеренно не управляет жизненным циклом.
- **`() => actualPort` — ленивое замыкание.** `actualPort` присваивается в колбэке `app.listen`. Middleware `hostAllowlist` читает его по требованию, поэтому эфемерные порты (`--port 0`) корректно проверяют заголовок `Host`.
- **`await blockForever()` сделано намеренно.** Если `yargs.parse()` разрешается, верхний уровень CLI переходит в интерактивную точку входа TUI (`gemini.tsx`). SIGINT / SIGTERM завершают работу через путь `onSignal` в `runQwenServe`.

## 10. Разбиение файлов маршрутов HTTP

Основная сборка происходит в `createServeApp()` в `server.ts`, который монтирует четыре модульных файла маршрутов:

| Маршруты                                                                                                                  | Файл                                                   | Точка монтирования                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `/health`, `/demo`, `/capabilities`, все маршруты сессий, device flow, голосование за разрешения, SSE и перезапуск MCP одного сервера | `packages/cli/src/serve/server.ts`                     | Зарегистрированы напрямую внутри `createServeApp()` |
| `/workspace/memory` (GET/POST)                                                                                             | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                   |
| Все CRUD-маршруты `/workspace/agents`                                                                                     | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                   |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts`   | `registerWorkspaceFileReadRoutes()`              |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts`  | `registerWorkspaceFileWriteRoutes()`             |

Полную спецификацию маршрутов и протокола см. в [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Архитектуру — в [`01-architecture.md`](./01-architecture.md).

## 11. Мягкое и жёсткое завершение

- **Первый SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> двухфазное мягкое завершение:
  1. `bridge.shutdown()`: каждый канал получает `KILL_HARD_DEADLINE_MS` (10 с), затем `channel.kill()`.
  2. `server.close()`: текущие запросы завершаются, `SHUTDOWN_FORCE_CLOSE_MS` (5 с) запускает `closeAllConnections()`, затем применяется второй дедлайн в 2 с.
- **Второй SIGINT / SIGTERM во время завершения** -> `bridge.killAllSync()` синхронно отправляет SIGKILL всем дочерним процессам ACP и вызывает `process.exit(1)`, чтобы избежать процессов-сирот.

`RunHandle.close()`, возвращаемый `runQwenServe`, является программным эквивалентом для встраивающих систем и тестов.

## 12. Встраиваемый вызов (минуя CLI)

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
// ... вызывайте handle.bridge напрямую или используйте handle.server
await handle.close(); // программное завершение
```

Или получите Express-приложение напрямую и запустите сами:

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
    /* зависимости: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

Примечание: при прямом вызове `createServeApp` по умолчанию `fsFactory.trusted = false`. Агентская ACP-операция `writeTextFile` будет отклонена как `untrusted_workspace`, и в stderr будет выведено одно предупреждение. Либо передайте `deps.fsFactory` с явным доверием, либо `deps.bridge`, либо принимайте поведение по умолчанию с ограничением доверия.

## 13. Рецепты отладки

См. раздел отладки в [`19-observability.md`](./19-observability.md). Основные команды:

```bash
# Жив ли демон?
curl http://127.0.0.1:4170/health

# Какие возможности рекламируются?
curl -s http://127.0.0.1:4170/capabilities | jq

# Готовность демона/хоста
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Просмотр живого SSE
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
- Middleware: `packages/cli/src/serve/auth.ts`
- Фабрика моста ACP: `packages/acp-bridge/src/bridge.ts`
- HTML демо-страницы: `packages/cli/src/serve/demo.ts`
- Документация пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Проводной протокол: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)