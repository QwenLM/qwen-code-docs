# Файловый логгер демона `qwen serve` — Проектирование

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Ветка**: `feat/support_daemon_logger`
- **Статус**: дизайн утвержден, ожидается план реализации
- **Дата**: 2026-05-26

## 1. Проблема

`qwen serve` выводит диагностику уровня демона (жизненный цикл, ошибки маршрутов, stderr дочерних процессов ACP) в `process.stderr`. Это работает в systemd/Docker, но ненадежно для SDK / Desktop / локального использования демона: когда клиент видит, что `POST /session/:id/prompt` возвращает HTTP 500, контекст маршрута + сессии + стека теряется, если оператор вручную не перенаправил stderr.

`createDebugLogger` (в `packages/core/src/utils/debugLogger.ts`) привязан к сессии: ему требуется активная `DebugLogSession`, и он пишет в `${runtimeBaseDir}/debug/<sessionId>.txt`. Демон serve запускается **до** того, как появится какая-либо сессия, поэтому вызовы уровня демона будут молча игнорироваться (no-op). Его также нельзя переиспользовать без изменения семантики `debug/latest` для каждой сессии.

Данный дизайн добавляет файловый sink, специфичный для демона, дополняющий существующее поведение stderr, чтобы диагностика демона сохранялась без перенаправления оболочки.

## 2. Область применения

### Входит в область применения

- Новый логгер, инициализируемый один раз для каждого процесса `runQwenServe`.
- Файл в `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`, режим добавления (append).
- Дублирование (tee) следующих событий:
  - Сообщения о жизненном цикле / завершении работы / сигналах из `runQwenServe.ts`
  - Ошибки маршрутов из `sendBridgeError` (`server.ts`)
  - `writeServeDebugLine` из `bridge.ts` (при установленном `QWEN_SERVE_DEBUG`)
  - Перенаправление stderr дочерних процессов ACP из `spawnChannel.ts`
- Возможность отключения через `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Символическая ссылка `latest` в директории демона для `tail -f`.
- Документация в документации CLI serve.

### Вне области применения (не-цели из issue)

- Замена OpenTelemetry или добавление трассировки демона.
- Экспорт структурированных логов ошибок корпоративного уровня (issue #2014).
- Ротация или удаление существующих отладочных логов сессий.
- Ротация логов / ограничение размера для самого лога демона (отложено до последующего PR). При запуске в stderr выводится предупреждение, если существующий файл необычно велик; автоматические действия не выполняются.

## 3. Архитектура

### 3.1 Границы модулей

| Слой                                                   | Новый / Изменен | Назначение                                                                                                                                |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                | **new**       | Sink: инициализация, форматирование, добавление в файл, дублирование в stderr, сброс (flush), символическая ссылка latest                                                                      |
| `packages/cli/src/serve/runQwenServe.ts`                | changed       | Инициализация логгера при запуске; замена `writeStderrLine` жизненного цикла на `daemonLog.*`; `await flush()` при завершении работы; передача `onDiagnosticLine` в bridge |
| `packages/cli/src/serve/server.ts`                      | changed       | `sendBridgeError(...)` маршрутизируется через `daemonLog.error(...)`                                                                                  |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)    | changed       | Добавление опционального `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void`                                                 |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | changed       | Если `onDiagnosticLine` внедрен, дублировать ту же строку                                                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`               | changed       | Перенаправитель stderr дочерних процессов дублирует каждую строку с префиксом в `onDiagnosticLine`                                                                        |

**Цель проектирования**: `daemonLogger.ts` — это один файл, локальный для cli, без глобального синглтона. `acp-bridge` остается независимым от cli — он видит только колбэк. Граф зависимостей не изменен.

### 3.2 Отсутствие глобального синглтона

Логгер создается в `runQwenServe` и передается через замыкание во внутренние модули serve, которым он нужен (или через колбэк в `acp-bridge`). Обоснование:

- Отражает подход, при котором `BridgeOptions` уже внедряет зависимости.
- Избегает утечек состояния между тестами, с которыми исторически сталкивался `debugLogger` (именно для этого существует `resetDebugLoggingState()`).

## 4. Daemon ID и путь к файлу

- Путь: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Разрешается в `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Переиспользует `Storage.getGlobalDebugDir()`, чтобы переопределение директории runtime (переменная окружения, контекстное) автоматически применялось.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` позволяет различать несколько демонов в одном и том же workspace.
  - `workspaceHash` имеет фиксированную длину, безопасен для использования в именах файлов и стабилен для одного и того же пути workspace.
- Символическая ссылка `latest`: `~/.qwen/debug/daemon/latest` → файл лога текущего процесса. Обновляется при инициализации с помощью существующего хелпера `updateSymlink` (`packages/core/src/utils/symlink.ts`). Ошибка создания символической ссылки логируется и игнорируется — не ухудшает основные операции записи. Отличается от `${runtimeBaseDir}/debug/latest` (привязан к сессии), что соответствует не-целям.
- Режим файла: `'a'` (добавление при `O_APPEND | O_CREAT`). Существующие файлы сохраняются при перезапусках для последующего анализа.

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
   * `err.stack` is appended as indented continuation lines after the message.
   * Both `err` and `ctx` are optional and independent.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * File-only tee for lines whose caller is already writing to stderr
   * (ACP child stderr forwarder, `writeServeDebugLine`). The line is
   * appended to the daemon log under the standard `<timestamp> [<LEVEL>] [DAEMON] `
   * prefix; it is NOT echoed to stderr (which would double the operator's output).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Absolute path to the daemon log file. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Drain pending appends. Called from runQwenServe shutdown handler. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` синхронно:

1. Вычисляет `daemonId` + путь к логу.
2. `mkdirSync(parentDir, { recursive: true })` — при ошибке → возвращает no-op логгер, выводит одно предупреждение в stderr. Загрузка продолжается.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — синхронно записывает `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>`. Это также служит проверкой возможности записи; при EACCES/ENOSPC режим отказа = no-op логгер + одно предупреждение в stderr.
4. Обновляет символическую ссылку `latest` (best-effort, ошибки проглатываются).
5. Возвращает логгер; последующие вызовы `info/warn/error/raw` ставят в очередь асинхронный `fs.promises.appendFile`.

Если `process.env['QWEN_DAEMON_LOG_FILE']` принимает одно из значений `0|false|off|no`, `initDaemonLogger` сразу возвращает no-op логгер до любого обращения к файловой системе.

## 6. Формат строки лога

Зеркально отражает `debugLogger.buildLogLine` для визуального сходства:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Временная метка: ISO 8601, UTC.
- Уровень: `INFO` | `WARN` | `ERROR`. (Изначально нет DEBUG — `QWEN_SERVE_DEBUG` поступает как `INFO` через `raw()`.)
- Тег: литерал `DAEMON`.
- Контекст трассировки: `trace.getActiveSpan()`, если доступен; та же логика, что и в `debugLogger.getActiveSpanTraceContext`. Хелпер выносится в общий модуль (`packages/core/src/utils/traceContext.ts`?) или дублируется локально — остается на усмотрение плана.
- Поля контекста: отображаются как `key=value`, фиксированный порядок (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), затем любые дополнительные ключи сортируются по лексикографическому порядку. Значения, содержащие пробелы или `=`, оборачиваются в кавычки с помощью `JSON.stringify`.
- Стек ошибки: добавляется в виде строк продолжения с отступом после сообщения.
- `raw(line, level)` записывает строку как есть после стандартного префикса `<timestamp> [<LEVEL>] [DAEMON] `, без дополнительной обработки.

**Семантика дублирования (важно):**

- `info` / `warn` / `error` пишут **как** в файл лога демона, **так и** в stderr (через внедренный писатель stderr). Вызывающие стороны, заменяющие предыдущий `writeStderrLine(...)`, используют их напрямую; отдельный вызов stderr не требуется.
- `raw` пишет **только в файл**. Используется перенаправителем stderr дочерних процессов ACP и `writeServeDebugLine`, где вызывающая сторона уже пишет в stderr по своему существующему пути. Дублирование затопило бы вывод оператора.

## 7. Поток загрузки / завершения работы

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // boot banner is stderr-only to avoid the line referencing itself

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injected for sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- Баннер загрузки выводится только в stderr (строка пути о самом себе была бы цикличной при логировании).
- `initDaemonLogger` синхронен, поэтому любой сбой виден сразу при загрузке, а не скрыт до первой ошибки.
- `flush()` при завершении работы — это последний ожидаемый (awaited) шаг перед `process.exit`. SIGKILL не поддается сбросу (flush) по определению — мы это принимаем.

## 8. Таблица покрытия

| Источник                                                        | Сейчас                                        | После                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Жизненный цикл / сигналы / предупреждения конфигурации в `runQwenServe.ts`       | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)` (stderr по-прежнему срабатывает — `daemonLog` дублирует)                          |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                       | без изменений — скрипты оператора парсят stdout                                                        |
| `server.ts:sendBridgeError`                                   | `writeStderrLine(...)` с route/sessionId  | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr по-прежнему выводится благодаря дублированию daemonLog) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | дублирование в `onDiagnosticLine(line, 'info')`                                                          |
| stderr дочерних процессов в `spawnChannel.ts`                                | `process.stderr.write(prefix + line + '\n')` | также `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| Вызывающие стороны `writeStdoutLine`                                     | без изменений                                    | без изменений                                                                                        |
| Ошибки использования CLI / argparse (ранняя валидация в `runQwenServe`) | `writeStderrLine(...)`                       | без изменений (логгер может еще не существовать)                                                             |
Сохраняется каждая существующая запись в stderr. Лог демона работает по принципу **дополнения**, он никогда не перезаписывает существующие данные.

## 9. Путь записи и flush

- Внутренняя очередь: единственная цепочка `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Каждый вызов `info/warn/error/raw` ставит в очередь добавление (append) в файл, а для `info/warn/error` также синхронно вызывает переданный обработчик записи в `stderr`.
- Порядок записи в stderr сохраняется (синхронно, до постановки операции append в очередь). Записи в файл в конечном итоге выполняются в том же порядке, в котором они были поставлены в очередь.
- Сбои записи устанавливают внутренний флаг `degraded` и выводят одноразовое предупреждение в stderr. Последующие вызовы по-прежнему пытаются выполнить запись, но счетчик не ведется.
- `flush()` возвращает промис, находящийся в конце очереди.
- Отсутствие буферизации: каждый вызов = один `appendFile`. Объем данных невелик (ошибки маршрутов + жизненный цикл); микро-батчинг является преждевременной оптимизацией.

## 10. Конфигурация

| Переменная окружения | Поведение |
| --- | --- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no` | `initDaemonLogger` возвращает no-op; дублирование (tee) является no-op; stderr не изменяется |
| `QWEN_DAEMON_LOG_FILE=<любое другое значение>` или не задана | Включено (по умолчанию) |
| `QWEN_RUNTIME_DIR=<путь>` | Перемещает корень `~/.qwen`, лог демона перемещается вместе с ним (существующая семантика) |
| `QWEN_SERVE_DEBUG=1` | Существующее поведение — активируется `writeServeDebugLine`; строки теперь также дублируются (tee) в лог демона |

`QWEN_DAEMON_LOG_FILE` намеренно отделена от `QWEN_DEBUG_LOG_FILE`, чтобы отключение отладочных логов для каждой сессии не отключало лог демона оператора (и наоборот).

## 11. Обработка ошибок

- Сбой `mkdir`/`open` в `initDaemonLogger` → no-op логгер + одно предупреждение в stderr. Запуск демона продолжается. Оператор не видит ничего в файле, но по-прежнему получает вывод в stderr.
- Сбои при каждом append → переключение флага degraded, вывод одного предупреждения в stderr, продолжение попыток. В задаче ничего не сказано о сигнале UI для деградированного режима, поэтому публичный интерфейс для этого не нужен.
- Отклонение (rejection) `flush()` → перехватывается в обработчике завершения работы, логируется через `writeStderrLine`. Не блокирует выход.
- Сбой создания симлинка `latest` → игнорируется; основные записи не затрагиваются.

## 12. Тестирование

### `daemonLogger.test.ts` (новый)

- Изолированная (sandboxed) `baseDir`, моки для `now`, `pid`, `stderr`.
- Вывод пути и daemon-id, включая 8-символьный `workspaceHash` для известного входного значения.
- Симлинк `latest` создается и обновляется при последующих вызовах `initDaemonLogger` в одном и том же каталоге.
- Форматирование уровня (INFO/WARN/ERROR), порядок полей контекста, продолжение стека ошибок.
- Инъекция контекста трассировки при наличии активного спана.
- `raw(line, level)` записывает строку с префиксом дословно.
- `flush()` разрешается только после того, как все поставленные в очередь записи попадут в файл.
- `QWEN_DAEMON_LOG_FILE=0` → файл не создается.
- Сбой `mkdir` → no-op логгер, одно предупреждение в stderr, последующие вызовы не вызывают исключений.
- Сбой `appendFile` → флаг degraded переключен, одно предупреждение в stderr.

### `runQwenServe.test.ts` (расширение)

- При запуске в лог записывается строка `daemon started ...`.
- Обработчик завершения работы ожидает `daemonLog.flush()` перед выходом.
- Баннер запуска в stderr содержит путь к логу демона.

### `server.test.ts` (расширение)

- Маршрут, который выбрасывает ошибку, направляет её через `daemonLog.error(...)` с правильными `route` и `sessionId`.

### Тесты acp-bridge (расширение)

- Колбэк `onDiagnosticLine` вызывается из `writeServeDebugLine` при `QWEN_SERVE_DEBUG=1` и из форвардера stderr дочернего процесса `spawnChannel`. Тесты внедряют перехватывающий фейк; файловая система не используется.

## 13. Документация

- В `docs/cli/serve.md` (или там, где документирован serve) добавляется раздел "Daemon log file", охватывающий: путь, формат daemon-id, симлинк `latest`, отключение через `QWEN_DAEMON_LOG_FILE`, отличие от посессионного `debug/<sessionId>.txt`.
- README в `packages/cli/src/serve/`, если он существует.
- В этом репозитории нет файла в стиле CHANGELOG; примечания к релизу обрабатываются отдельно.

## 14. Откат

- Чисто аддитивное изменение. Откат = отмена коммита:
  - Удалить `daemonLogger.ts` + его тест.
  - Откатить изменения жизненного цикла / sendBridgeError / bridge / spawnChannel в `runQwenServe.ts`.
  - Удалить `onDiagnosticLine` из `BridgeOptions`.
- Нет состояния на диске, которое нужно очищать; существующие файлы логов демона становятся осиротевшими, но безвредными.

## 15. Критерии приемки (из задачи)

| Критерий | Как выполняется |
| --- | --- |
| `qwen serve` создает / добавляет в лог демона без перенаправления shell | `initDaemonLogger` открывает файл при запуске |
| HTTP 500 от `POST /session/:id/prompt` можно сопоставить в логе демона | `sendBridgeError` записывает `route=` + `sessionId=` |
| Строки stderr дочернего процесса ACP также попадают в лог демона | `spawnChannel` дублирует через `onDiagnosticLine` |
| Логирование работает до первой сессии и после закрытия всех сессий | Не привязано к сессии; работает на протяжении всего времени жизни демона |
| Существующее поведение stderr не нарушено | Все записи являются аддитивными; ни один вызов `writeStderrLine` не удаляется без сохранения эквивалентной замены |
| Путь к логу + возможность отключения задокументированы | Раздел документации в §13 |

## 16. Открытые вопросы

Нет блокирующих. Возможные дальнейшие шаги:

- Должен ли симлинк `latest` находиться в `~/.qwen/debug/daemon/latest` или `~/.qwen/debug/daemon-latest`? Спецификация выбирает первый вариант для аккуратности каталога.
- Стоит ли предложить вывод в формате JSON-line в качестве будущего флага (например, `QWEN_DAEMON_LOG_FORMAT=json`)? Это выходит за рамки данного PR; структурированный экспорт — это задача #2014.