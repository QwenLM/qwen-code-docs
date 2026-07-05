# Наблюдаемость и отладка

## Обзор

`qwen serve` в настоящее время поставляется с **инструментацией спанов OpenTelemetry**, **структурированными файловыми логами** (`DaemonLogger`), **access-логами для каждого запроса**, отладочными логами в stderr, структурированными ячейками preflight и кольцом аудита разрешений в памяти. Эта страница представляет собой практическое руководство по текущим возможностям наблюдаемости и пробелам, которые следует учитывать при диагностике.

## Что доступно сейчас

| Компонент                                   | Расположение                                   | Назначение                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stderr-логи `QWEN_SERVE_DEBUG`              | `bridge.ts` и места вызова                     | Значения переменной окружения `1` / `true` / `on` / `yes` (без учета регистра) выводят строки `qwen serve debug: ...` в stderr.                                                                                                                                                                                  |
| Инструментация спанов OpenTelemetry         | `server.ts` `daemonTelemetryMiddleware`        | Каждый HTTP-запрос оборачивается в `withDaemonRequestSpan`; атрибуты включают route, sessionId, clientId и код статуса. Для маршрутов разрешений выделены отдельные спаны. Жизненный цикл промпта трассируется от начала до конца. Конфигурация находится в `telemetry` файла `settings.json`.                               |
| Метрики производительности демона OpenTelemetry | `telemetry/*event-loop-lag*`, `daemon-metrics` | Гейджи задержки event loop для демона и дочерних процессов ACP, а также гистограммы байтов сообщений в пайпе между демоном и дочерними процессами.                                                                                                                                                                                 |
| Структурированные файловые логи `DaemonLogger` | `serve/daemon-logger.ts`                       | Структурированные строки логов в формате, похожем на JSON, записываются в файл. При запуске выводится `daemon log -> <path>`. Поддерживаются уровни `info` / `warn` / `error` со структурированными полями, такими как `route`, `sessionId`, `clientId`, `childPid` и `channelId`.                                                        |
| Промежуточный слой (middleware) access-логов для каждого запроса | `server.ts`, регистрируется перед `bearerAuth` | Логирует `method`, `path`, `status`, `durationMs`, `sessionId` и `clientId` после каждого запроса. Пропускает `GET /health` и heartbeat. Для 4xx+ используется `warn`, для успешных — `info`.                                                                                                                  |
| `/health`                                   | маршрут `server.ts`                            | Проба живости (liveness probe); `?deep=1` возвращает расширенную информацию.                                                                                                                                                                                                                                       |
| `/capabilities`                             | маршрут `server.ts`                            | Обнаружение возможностей на этапе preflight. См. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).                                                                                                                                                                                      |
| `/workspace/preflight`                      | Маршрут -> `DaemonStatusProvider`              | Структурированные ячейки готовности: версия Node, CLI entry, ripgrep, git, npm, а также ячейки уровня ACP после того, как дочерний процесс запущен.                                                                                                                                                                       |
| `/workspace/env`                            | Маршрут -> `DaemonStatusProvider`              | Снимок переменных окружения процесса демона. Для секретных переменных окружения сообщается только их наличие; учетные данные URL прокси удаляются.                                                                                                                                                                                    |
| `/workspace/mcp`                            | Маршрут -> bridge extMethod                    | Снимок пула, бюджета и отказов.                                                                                                                                                                                                                                                       |
| `/workspace/skills`, `/workspace/providers` | Маршруты                                       | Актуальные снимки на стороне ACP; возвращают пустые данные в режиме ожидания, если сессия не существует.                                                                                                                                                                                                                   |
| SSE для каждой сессии                       | `GET /session/:id/events`                      | Поток событий в реальном времени.                                                                                                                                                                                                                                                                   |
| Отладочная консоль `/demo`                  | `GET /demo` (`packages/cli/src/serve/demo.ts`) | Доступная из браузера одностраничная консоль: чат, лог событий, инспектор рабочего пространства и UX разрешений. На loopback-интерфейсе `http://127.0.0.1:4170/demo` — это самый быстрый способ сквозной проверки без написания кода SDK. Правила регистрации описаны в [`02-serve-runtime.md`](./02-serve-runtime.md). |
| `PermissionAuditRing`                       | `permission-audit.ts`                          | Кольцо в памяти (FIFO) на 512 решений о разрешениях.                                                                                                                                                                                                                                               |
| Аудит `decisionReason` медиатора            | `permissionMediator.ts`                        | Внутренняя структурированная запись, объясняющая, почему запрос на разрешение был обработан именно так.                                                                                                                                                                                                   |

## Что пока не реализовано

- **Нет эндпоинта Prometheus / метрик.** Метрики OTel можно экспортировать, но демон не предоставляет эндпоинт для сбора данных Prometheus.
- **Нет внешнего приемника аудита для `PermissionAuditRing`.** Кольцо существует, но хуки для распределения данных в SIEM или внешнее хранилище не подключены.

## Рецепты отладки

### 1. Работает ли демон?

```bash
curl -s http://127.0.0.1:4170/health
# {"status":"ok"}

curl -s 'http://127.0.0.1:4170/health?deep=1' | jq
# {"status":"ok","workspaceCwd":"/path","sessions":N,...}
```

Ошибка 401 на loopback означает, что, скорее всего, включен `--require-auth`. Используйте `QWEN_SERVE_DEBUG=1` при запуске, чтобы увидеть логи инициализации.

### 2. Какие возможности анонсируются?

```bash
curl -s http://127.0.0.1:4170/capabilities | jq
```

Проверьте `mcp_workspace_pool` (включен ли пул F2?), `require_auth` (усилен ли?), `permission_mediation.modes` (поддерживаемые политики) и `policy.permission` (активная политика).

### 3. В порядке ли готовность хоста демона?

```bash
curl -s http://127.0.0.1:4170/workspace/preflight | jq
```

Ячейки со `status: 'not_started'` относятся к уровню ACP и заполняются только после подключения первой сессии. Ячейки со `status: 'fail'` включают закрытый `errorKind`; для структурированного исправления обратитесь к [`18-error-taxonomy.md`](./18-error-taxonomy.md).

### 4. Отслеживание потока SSE сессии

```bash
curl -N -H 'Accept: text/event-stream' \
     -H 'Authorization: Bearer XYZ' \
     -H 'X-Qwen-Client-Id: debug-tail' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'
```

`-N` отключает буферизацию вывода curl. `Last-Event-ID: 0` запрашивает повторную отправку событий кольца с `id > 0`.

### 5. Почему запрос на разрешение был обработан именно так?

`PermissionAuditRing` находится в памяти и сегодня не имеет HTTP-интерфейса. Включите `QWEN_SERVE_DEBUG=1` и воспроизведите ситуацию; медиатор выводит структурированные строки для каждого голоса и решения, включая `decisionReason.type`. В будущем PR можно предоставить доступ к кольцу через HTTP.

### 6. Какой потребитель работает медленно?

`slow_client_warning` срабатывает один раз за эпизод переполнения, когда очередь достигает 75%. Подпишитесь на поток SSE сессии и найдите синтетический фрейм; полезные данные включают `queueSize`, `maxQueued` и `lastEventId`. Повторяющиеся предупреждения указывают на зависшего потребителя, обычно это заблокированный цикл SDK `for await`.

### 7. Почему MCP-серверу было отказано?

Объедините по-ячеечный `disabledReason: 'budget'` из `/workspace/mcp`, список `refusedServerNames` и SSE-события `mcp_child_refused_batch`. Сравните их с `mcp_guardrails.modes` из `/capabilities` (активен ли `enforce`?) и актуальным состоянием `--mcp-client-budget`, доступным через `getReservedSlots()`.

### 8. Демон не завершает работу

Первый сигнал запускает корректное завершение работы (см. [`02-serve-runtime.md`](./02-serve-runtime.md)). Если процесс зависает более чем на 10 секунд, проверьте:

- Дочерний процесс ACP не ответил на корректное закрытие.
- Долгие SSE-соединения удерживали HTTP `server.close()` открытым дольше `SHUTDOWN_FORCE_CLOSE_MS` (5 с).

**Второй** SIGTERM/SIGINT намеренно вызывает `bridge.killAllSync()` + `process.exit(1)`.

### 9. Перегружен ли event loop демона, очередь промптов или ACP-пайп?

`GET /daemon/status` может включать `runtime.perf`, когда runtime рабочего демона внедряет провайдер снимков производительности:

```json
{
  "runtime": {
    "perf": {
      "eventLoop": { "meanMs": 1.2, "p50Ms": 1.0, "p99Ms": 9.5, "maxMs": 25 },
      "promptQueueWait": { "count": 3, "meanMs": 12.5, "maxMs": 35, "lastMs": 4 },
      "pipe": {
        "inbound": { "count": 42, "totalBytes": 100000, "maxBytes": 12000 },
        "outbound": { "count": 41, "totalBytes": 90000, "maxBytes": 11000 }
      }
    }
  }
}
```

Полезная нагрузка статуса предназначена только для демона. `promptQueueWait` суммирует выборки времени ожидания в FIFO-очереди промптов, наблюдаемые в процессе демона. Задержка event loop дочернего процесса ACP намеренно не агрегируется в `/daemon/status`; она видна через OTel-гейдж `qwen-code.acp.event_loop.lag` и через строки зависаний в stderr, перенаправляемые в логи демона.

Новые имена метрик OTel:

- `qwen-code.daemon.event_loop.lag`, гейдж в миллисекундах с `stat=mean|p50|p99|max`.
- `qwen-code.acp.event_loop.lag`, гейдж в миллисекундах с `stat=mean|p50|p99|max`.
- `qwen-code.daemon.prompt.queue_wait`, гистограмма в миллисекундах.
- `qwen-code.daemon.pipe.message_bytes`, гистограмма в байтах с `direction=inbound|outbound`.

## Процесс

### Типичный процесс диагностики

```mermaid
flowchart TD
    A[Пользователь сообщает о проблеме] --> B{демон работает?}
    B -->|no| BD[проверить процесс; проверить логи запуска]
    B -->|yes| C{возможности соответствуют ожиданиям?}
    C -->|no| CD["проверить --require-auth, QWEN_SERVE_NO_MCP_POOL, settings.json"]
    C -->|yes| D{preflight полностью успешен?}
    D -->|no| DD["исправить ячейку errorKind"]
    D -->|yes| E{проблема специфична для сессии?}
    E -->|yes| ES["читать SSE для этой сессии;<br/>QWEN_SERVE_DEBUG=1 + воспроизвести"]
    E -->|no| EW["проверить /workspace/mcp,<br/>/workspace/env"]
```

## Состояние и жизненный цикл

- `QWEN_SERVE_DEBUG` считывается при каждой проверке через `isServeDebugMode()` из `debug-mode.ts`; его переключение не требует перезапуска. Логи запуска недоступны, если переменная окружения не была установлена при старте.
- `PermissionAuditRing` ограничен 512 записями FIFO; более старые записи тихо отбрасываются.
- `DaemonStatusProvider` перестраивает ячейки для каждого запроса и не использует кэширование; избегайте ненужного высокочастотного опроса.
## Зависимости

- `process.stderr.write` для отладочного вывода в stderr.
- `DaemonLogger` для структурированных файловых логов.
- OpenTelemetry SDK через `initializeTelemetry` и `createDaemonBridgeTelemetry`.
- `node:perf_hooks.monitorEventLoopDelay` для индикаторов задержки цикла событий демона и ACP.
- `node:process` для проверки переменных окружения и сигналов.

## Конфигурация

| Параметр                          | Эффект                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_DEBUG`                | Включает подробные логи в stderr. См. [`17-configuration.md`](./17-configuration.md).                   |
| `settings.json` `telemetry`       | Управляет поведением OTel: `enabled`, `otlpEndpoint`, `otlpProtocol` и эндпоинты для каждого сигнала.   |
| Путь к логам `DaemonLogger`       | Генерируется при запуске и выводится в stderr в виде `daemon log -> <path>`.                            |
| Размер `PermissionAuditRing`      | На данный момент жестко задан как 512.                                                                  |
| Порог `slow_client_warning`       | `0.75` / `0.375`, жестко задан в `eventBus.ts`.                                                         |

## Ограничения и известные особенности

- **Файловые логи DaemonLogger структурированы** и могут быть отфильтрованы по `route`, `sessionId` и `clientId`. Логи `QWEN_SERVE_DEBUG` в stderr остаются неструктурированным текстом.
- **Спаны OpenTelemetry включают корреляцию по запросам.** Каждый спан HTTP-запроса содержит атрибуты route, sessionId и clientId, которые можно связать в бэкенде трассировки.
- **`runtime.perf` работает только для демона.** Задержка цикла событий дочерних процессов в нем не регистрируется по задумке; для отслеживания зависаний дочерних процессов ACP используйте OTel или перенаправленные предупреждения о зависаниях в stderr.
- **Ячейки `/workspace/preflight` на уровне ACP требуют активной сессии.** В неактивном демоне auth / MCP / skills / providers могут показывать `status: 'not_started'`; это ожидаемое поведение.
- **`/workspace/env` сообщает только о наличии секретов, но не их значения.** Не передавайте ответ в места, где сам факт наличия секрета является конфиденциальной информацией.
- **Кольцо аудита локально для процесса**, и история теряется при перезапуске демона.
- **Сценарий нагрузочного тестирования здесь не описан.** Базовые показатели производительности находятся в ветке `test/perf-daemon-baseline`.

## Ссылки

- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/daemon-logger.ts` (`DaemonLogger`, `buildDaemonLogLine`)
- `packages/cli/src/serve/debug-mode.ts` (`isServeDebugMode`)
- `packages/acp-bridge/src/permissionMediator.ts` (`PermissionDecisionReason`)
- `packages/cli/src/serve/server.ts` (`daemonTelemetryMiddleware`, access-log middleware)
- Конфигурация: [`17-configuration.md`](./17-configuration.md)
- Таксономия ошибок: [`18-error-taxonomy.md`](./18-error-taxonomy.md)
- Руководство по операциям для пользователей: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)