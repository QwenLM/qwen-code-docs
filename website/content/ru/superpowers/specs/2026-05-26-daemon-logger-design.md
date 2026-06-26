# `qwen serve` Логгер демона в файл — Дизайн

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code#4548)
- **Ветка**: `feat/support_daemon_logger`
- **Статус**: дизайн утверждён, ожидается план реализации
- **Дата**: 2026-05-26

## 1. Проблема

`qwen serve` записывает диагностику уровня демона (жизненный цикл, ошибки маршрутов, stderr дочернего процесса ACP) в `process.stderr`. Это работает в systemd/Docker, но хрупко для использования через SDK, на рабочем столе или локально: когда клиент видит `POST /session/:id/prompt` с HTTP 500, контекст маршрута, сессии и стека теряется, если оператор вручную не перенаправил stderr.

`createDebugLogger` (в `packages/core/src/utils/debugLogger.ts`) привязан к сессии: он требует активный `DebugLogSession` и пишет в `${runtimeBaseDir}/debug/<sessionId>.txt`. Сервер демона запускается **до** существования какой-либо сессии, поэтому вызовы на уровне демона просто молча игнорируются. Кроме того, его нельзя переиспользовать, не меняя семантику `debug/latest` для каждой сессии.

Этот дизайн добавляет файловый вывод для демона, дополняющий существующее поведение stderr, чтобы диагностика демона сохранялась без перенаправления через оболочку.

## 2. Область применения

### Входит в область

- Новый логгер, инициализируемый один раз на процесс `runQwenServe`.
- Файл в `${QWEN_RUNTIME_DIR или ~/.qwen}/debug/daemon/<daemon-id>.log`, режим добавления.
- Дублирование:
  - `runQwenServe.ts`: жизненный цикл / завершение / сообщения сигналов
  - `sendBridgeError` (`server.ts`): ошибки маршрутов
  - `bridge.ts` `writeServeDebugLine` (когда установлен `QWEN_SERVE_DEBUG`)
  - `spawnChannel.ts`: пересылка stderr дочернего процесса ACP
- Отказ через `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Символическая ссылка `latest` в каталоге демона для `tail -f`.
- Документация в CLI-документации serve.

### Не входит в область (нецели из issue)

- Замена OpenTelemetry или добавление трассировки демона.
- Структурированный экспорт корпоративных логов ошибок (issue #2014).
- Ротация или удаление существующих логов сессий отладки.
- Ротация / ограничение размера для самого лога демона (отложено до следующего PR). При запуске выводится предупреждение в stderr, если существующий файл необычно велик; автоматических действий не производится.

## 3. Архитектура

### 3.1 Границы модулей

| Уровень                                                   | Новый / Изменен | Обязанность                                                                                                     |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                 | **новый**       | Вывод: инициализация, форматирование, добавление в файл, дублирование в stderr, сброс, символическая ссылка latest |
| `packages/cli/src/serve/runQwenServe.ts`                  | изменен         | Инициализация логгера при запуске; замена `writeStderrLine` для жизненного цикла на `daemonLog.*`; `await flush()` при остановке; передача `onDiagnosticLine` в bridge |
| `packages/cli/src/serve/server.ts`                        | изменен         | `sendBridgeError(...)` направляется через `daemonLog.error(...)`                                                    |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)       | изменен         | Добавлено необязательное поле `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void`   |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`   | изменен         | Если передан `onDiagnosticLine`, дублировать ту же строку                                                        |
| `packages/acp-bridge/src/spawnChannel.ts`                 | изменен         | Пересылка stderr дочернего процесса дублирует каждую строку с префиксом в `onDiagnosticLine`                      |

**Намерение дизайна**: `daemonLogger.ts` — один файл, локальный для CLI, без глобального синглтона. `acp-bridge` остаётся независимым от CLI — он видит только колбэк. Граф зависимостей не меняется.

### 3.2 Нет глобального синглтона

Логгер создаётся в `runQwenServe` и передаётся внутренним модулям serve, которым он нужен (по замыканию или через колбэк в `acp-bridge`). Обоснование:

- Аналогично тому, как `BridgeOptions` уже внедряет зависимости.
- Избегает утечек состояния между тестами, с которыми исторически сталкивался `debugLogger` (для этого существует `resetDebugLoggingState()`).

## 4. Идентификатор демона и путь к файлу

- Путь: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Разрешается в `${QWEN_RUNTIME_DIR или ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Переиспользует `Storage.getGlobalDebugDir()`, поэтому переопределение каталога времени выполнения (переменная окружения, контекст) применяется автоматически.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` устраняет неоднозначность нескольких демонов в одной рабочей области.
  - `workspaceHash` — фиксированной длины, безопасен для имени файла и стабилен для одного и того же пути рабочей области.
- Символическая ссылка `latest`: `~/.qwen/debug/daemon/latest` → файл лога текущего процесса. Обновляется при инициализации с использованием существующего хелпера `updateSymlink` (`packages/core/src/utils/symlink.ts`). Ошибка создания ссылки логируется и игнорируется — не ухудшает основные записи. Отделена от `${runtimeBaseDir}/debug/latest` (сессионная) в соответствии с нецелями.
- Режим файла: `'a'` (добавление с `O_APPEND | O_CREAT`). Существующие файлы переживают перезапуски для криминалистического анализа.

## 5. Публичный API

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` добавляется в качестве последующих строк с отступом после сообщения.
   * И `err`, и `ctx` необязательны и независимы.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Дублирование только в файл для строк, которые уже выводятся в stderr вызывающим кодом
   * (пересылка stderr дочернего процесса ACP, `writeServeDebugLine`). Строка
   * добавляется в лог демона под стандартным префиксом `<timestamp> [<LEVEL>] [DAEMON] `;
   * НЕ выводится в stderr (что дублировало бы операторский вывод).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Абсолютный путь к файлу лога демона. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Выгрузка ожидающих добавлений. Вызывается из обработчика завершения runQwenServe. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // по умолчанию process.pid
  now?: () => Date; // по умолчанию () => new Date()
  stderr?: (line: string) => void; // по умолчанию writeStderrLine
  baseDir?: string; // по умолчанию Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` синхронно:

1. Вычисляет `daemonId` и путь к лог-файлу.
2. `mkdirSync(parentDir, { recursive: true })` — при ошибке возвращает no-op логгер и пишет одно предупреждение в stderr. Запуск продолжается.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — синхронно записывает `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>`. Это также служит проверкой возможности записи; при EACCES/ENOSPC режим отказа = no-op логгер + одно предупреждение в stderr.
4. Обновляет символическую ссылку `latest` (best-effort, ошибки игнорируются).
5. Возвращает логгер; последующие вызовы `info/warn/error/raw` ставят в очередь асинхронный `fs.promises.appendFile`.

Если `process.env['QWEN_DAEMON_LOG_FILE']` равен `0|false|off|no`, `initDaemonLogger` сразу возвращает no-op логгер без каких-либо операций с файловой системой.

## 6. Формат строки лога

Зеркалирует `debugLogger.buildLogLine` для визуального соответствия:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Временная метка: ISO 8601, UTC.
- Уровень: `INFO` | `WARN` | `ERROR`. (DEBUG изначально нет — `QWEN_SERVE_DEBUG` приходит как `INFO` через `raw()`.)
- Тег: литерал `DAEMON`.
- Контекст трассировки: `trace.getActiveSpan()` при наличии; та же логика, что и `debugLogger.getActiveSpanTraceContext`. Хелпер выносится в общий модуль (`packages/core/src/utils/traceContext.ts`?) или дублируется локально — оставить на планирование.
- Поля контекста: рендерятся как `key=value`, фиксированный порядок (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), затем любые дополнительные ключи в лексикографическом порядке. Значения, содержащие пробелы или `=`, экранируются через `JSON.stringify`.
- Стек ошибки: добавляется как последующие строки с отступом после сообщения.
- `raw(line, level)` записывает строку как есть после стандартного префикса `<timestamp> [<LEVEL>] [DAEMON] `, без дополнительной обработки.

**Семантика дублирования (важно):**

- `info` / `warn` / `error` записывают **и** в файл лога демона, **и** в stderr (через внедрённый `stderr` writer). Вызывающий код, заменяющий предыдущий `writeStderrLine(...)`, использует их напрямую; отдельный вызов stderr не требуется.
- `raw` записывает **только в файл**. Используется пересылкой stderr дочернего процесса ACP и `writeServeDebugLine`, где вызывающий код уже пишет в stderr через свой существующий путь. Дублирование приведёт к перегрузке оператора.

## 7. Последовательность запуска / завершения

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // приветствие при загрузке только в stderr, чтобы строка не ссылалась сама на себя

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // внедряется для sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- Приветствие при загрузке — только в stderr (строка о пути была бы циклической, если бы логировалась).
- `initDaemonLogger` синхронен, так что любая ошибка сразу видна при запуске, а не скрыта до первой ошибки.
- `flush()` при завершении — последний ожидаемый шаг перед `process.exit`. SIGKILL в принципе не обрабатывается — мы это принимаем.

## 8. Таблица покрытия

| Источник                                                        | Сегодня                                       | После                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `runQwenServe.ts`: жизненный цикл / сигналы / предупреждения конфигов | `writeStderrLine(...)`                        | `daemonLog.info \| warn(...)` (stderr всё равно есть — `daemonLog` дублирует)                     |
| `runQwenServe.ts`: "listening on URL" (stdout)                  | `writeStdoutLine(...)`                        | Без изменений — операторские скрипты парсят stdout                                                |
| `server.ts:sendBridgeError`                                      | `writeStderrLine(...)` с route/sessionId      | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr всё равно выводится через дублирование daemonLog) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)            | `writeStderrLine('qwen serve debug: ...')`    | Дублирование в `onDiagnosticLine(line, 'info')`                                                    |
| `spawnChannel.ts`: stderr дочернего процесса                     | `process.stderr.write(prefix + line + '\n')`  | Также `onDiagnosticLine(prefix + line, 'warn')`                                                    |
| Вызывающие `writeStdoutLine`                                     | Без изменений                                 | Без изменений                                                                                     |
| Ошибки CLI / argparse (ранняя валидация `runQwenServe`)          | `writeStderrLine(...)`                        | Без изменений (логгер может ещё не существовать)                                                  |

Каждый существующий вывод в stderr сохраняется. Лог демона — **дополняющий**, никогда не замещающий.

## 9. Путь записи и сброс

- Внутренняя очередь: единственная цепочка `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Каждый вызов `info/warn/error/raw` ставит в очередь добавление (файл), а для `info/warn/error` также синхронно вызывает внедрённый `stderr` writer.
- Порядок записи в stderr сохраняется (синхронно, перед постановкой в очередь добавления). Добавления в файл согласованны в порядке очереди (eventually consistent).
- Ошибки записи устанавливают внутренний флаг `degraded` и однократно выводят предупреждение в stderr. Последующие вызовы всё равно пытаются выполнить запись, но счётчик не ведётся.
- `flush()` возвращает текущее обещание в конце очереди.
- Нет буферизации: каждый вызов = одно `appendFile`. Объём низкий (ошибки маршрутов + жизненный цикл); микро-пакетирование — преждевременная оптимизация.

## 10. Конфигурация

| Переменная окружения                             | Поведение                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`         | `initDaemonLogger` возвращает no-op; дублирование отключено; stderr без изменений |
| `QWEN_DAEMON_LOG_FILE=<любое другое значение>` или не установлена | Включено (по умолчанию)                                            |
| `QWEN_RUNTIME_DIR=<путь>`                        | Переносит корень `~/.qwen`, лог демона перемещается вместе с ним (существующая семантика) |
| `QWEN_SERVE_DEBUG=1`                             | Существующая — активирует `writeServeDebugLine`; строки теперь также дублируются в лог демона |

`QWEN_DAEMON_LOG_FILE` намеренно отделён от `QWEN_DEBUG_LOG_FILE`, чтобы отключение по-сессионных отладочных логов не отключало лог демона оператора (и наоборот).

## 11. Обработка ошибок

- Неудача `initDaemonLogger` при mkdir/открытии файла → no-op логгер + одно предупреждение в stderr. Запуск демона продолжается. Оператор не видит записей в файле, но всё ещё получает stderr.
- Неудачи при добавлении → установка флага degraded, одно предупреждение в stderr, продолжаем попытки. В issue ничего нет о сигнале UI при degraded-режиме, поэтому публичная поверхность не требуется.
- Отклонение `flush()` → перехватывается в обработчике завершения, логируется через `writeStderrLine`. Не блокирует выход.
- Неудача символической ссылки `latest` → игнорируется; основные записи не затрагиваются.

## 12. Тестирование

### `daemonLogger.test.ts` (новый)

- Изолированный `baseDir`, подменённые `now`, `pid`, `stderr`.
- Вывод пути и идентификатора демона, включая 8-символьный `workspaceHash` для известного входа.
- Символическая ссылка `latest` создаётся и обновляется при последующих вызовах `initDaemonLogger` в том же каталоге.
- Форматирование уровней (INFO/WARN/ERROR), порядок полей контекста, стек ошибок с отступами.
- Внедрение контекста трассировки, когда существует активный span.
- `raw(line, level)` записывает строку с префиксом дословно.
- `flush()` разрешается только после того, как все поставленные в очередь записи попали в файл.
- `QWEN_DAEMON_LOG_FILE=0` → файл не создаётся.
- Ошибка `mkdir` → no-op логгер, одно предупреждение в stderr, последующие вызовы не выбрасывают исключения.
- Ошибка `appendFile` → флаг degraded установлен, одно предупреждение в stderr.

### `runQwenServe.test.ts` (расширение)

- При запуске записывается строка `daemon started ...` в лог.
- Обработчик завершения ожидает `daemonLog.flush()` перед выходом.
- Приветствие в stderr содержит путь к файлу лога демона.

### `server.test.ts` (расширение)

- Маршрут, который выбрасывает ошибку, направляет её через `daemonLog.error(...)` с правильными `route` и `sessionId`.

### тесты acp-bridge (расширение)

- Колбэк `onDiagnosticLine` вызывается из `writeServeDebugLine`, когда `QWEN_SERVE_DEBUG=1`, и из пересылки stderr дочернего процесса `spawnChannel`. Тесты внедряют захватывающую заглушку; файловая система не задействуется.

## 13. Документация

- `docs/cli/serve.md` (или где документирован serve) получает раздел "Daemon log file" (Файл лога демона), охватывающий: путь, формат daemon-id, символическая ссылка `latest`, отказ через `QWEN_DAEMON_LOG_FILE`, отличие от по-сессионных `debug/<sessionId>.txt`.
- README в `packages/cli/src/serve/`, если существует.
- Файлов типа CHANGELOG в этом репозитории нет; заметки о выпуске обрабатываются отдельно.

## 14. Откат

- Чисто добавное изменение. Откат = отмена коммита:
  - Удалить `daemonLogger.ts` + его тест.
  - Откатить изменения `runQwenServe.ts` (жизненный цикл, sendBridgeError, bridge, spawnChannel).
  - Удалить `onDiagnosticLine` из `BridgeOptions`.
- Очистка данных на диске не требуется; существующие файлы логов демона становятся осиротевшими, но безвредными.

## 15. Критерии приёмки (из issue)

| Критерий                                                          | Как достигается                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `qwen serve` создаёт / дописывает лог демона без перенаправления через оболочку | `initDaemonLogger` открывает файл при запуске                                |
| HTTP 500 от `POST /session/:id/prompt` можно сопоставить с записью в логе демона | `sendBridgeError` записывает `route=` + `sessionId=`                          |
| Строки stderr дочернего процесса ACP также попадают в лог демона  | `spawnChannel` дублирует через `onDiagnosticLine`                                             |
| Логирование работает до первой сессии и после закрытия всех сессий | Не привязано к сессии; живёт в течение времени жизни демона                                    |
| Существующее поведение stderr остаётся неизменным                 | Все записи дополняющие; ни один вызов `writeStderrLine` не удалён без эквивалентной замены    |
| Путь к логу и возможность отключения документированы              | Раздел документации в §13                                                                     |

## 16. Открытые вопросы

Блокирующих нет. Возможные последующие улучшения:

- Должна ли символическая ссылка `latest` находиться в `~/.qwen/debug/daemon/latest` или `~/.qwen/debug/daemon-latest`? Спецификация выбирает первое для упорядоченности каталогов.
- Стоит ли предложить вывод в формате JSON как будущий флаг (например, `QWEN_DAEMON_LOG_FORMAT=json`)? Выходит за рамки этого PR; структурированный экспорт — задача #2014.