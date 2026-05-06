# Dual Output

Dual Output — это режим sidecar для интерактивного TUI: пока Qwen Code продолжает обычный рендеринг в `stdout`, он параллельно отправляет структурированный поток JSON-событий в отдельный канал, чтобы внешняя программа — расширение IDE, веб-фронтенд, CI-пайплайн или скрипт автоматизации — могла отслеживать и управлять сессией.

Он также предоставляет обратный канал: внешняя программа может записывать JSONL-команды в файл, который отслеживает TUI. Это позволяет отправлять промпты и отвечать на запросы разрешений для инструментов так, будто за клавиатурой сидит человек.

Dual Output полностью опционален. Если указанные ниже флаги отсутствуют, TUI ведет себя точно так же, как раньше, без дополнительного ввода-вывода и изменений в поведении.

## Варианты использования

Dual Output — это низкоуровневый примитив. Вот конкретные интеграции, которые он открывает:

### Синхронизация в реальном времени: Terminal + Chat (двухрежимный)

Основной вариант использования. Веб- или десктопный ChatUI размещает TUI внутри PTY и отображает параллельный вид диалога, управляемый структурированным потоком событий:

- Пользователь может вводить текст в любом интерфейсе — в TUI (для опытных пользователей терминала) или в веб-интерфейсе (для более богатого UX, ссылок для общего доступа, мобильных устройств). Оба вида остаются синхронизированными, так как каждое сообщение проходит через одни и те же JSON-события.
- Запросы на подтверждение использования инструментов появляются в обоих местах; побеждает тот, кто подтвердит первым.
- История сессии фиксируется дословно из `--json-file`, поэтому серверная сторона получает каноническую машиночитаемую транскрипцию без парсинга ANSI.

### Расширения IDE (VS Code / JetBrains / Cursor / Neovim)

Встраивание Qwen Code внутрь IDE. TUI запускается во встроенной панели терминала редактора для тех, кто этого хочет, а расширение потребляет события `--json-fd` / `--json-file` для реализации:

- Встроенных оверлеев diff, когда агент изменяет файлы.
- Боковой панели webview с отформатированным markdown, подсветкой синтаксиса вызовов инструментов и кликабельными цитатами.
- Индикаторов в строке состояния (thinking / responding / awaiting approval).
- Программной записи `confirmation_response` при нажатии пользователем нативной кнопки подтверждения в IDE.

### Веб-фронтенды для чата

Сервер на Node/Bun запускает TUI в PTY для корректного рендеринга, но предоставляет браузеру WebSocket-канал. События из `--json-file` пересылаются клиенту; сообщения пользователя, введенные в браузере, инжектируются через `--input-file`. Парсинг ANSI не требуется ни на одной из сторон.

### Наблюдатели CI / автоматизации

CI-задача запускает Qwen Code с промптом задачи. Человек видит TUI в логе задачи; CI-система читает конец `--json-file` (tail), чтобы:

- Завершать задачу с ошибкой, если событие `result` сообщает об ошибке.
- Отправлять счетчики `token usage` / `duration_ms` / `tool_use` в метрики.
- Архивировать полную транскрипцию как артефакт сборки.

### Оркестрация мультиагентных систем

Агент-супервизор запускает несколько воркеров TUI, каждый со своей парой файлов событий/ввода. Он отслеживает прогресс, инжектирует уточняющие промпты и обеспечивает соблюдение глобальных политик бюджета/безопасности, одобряя или отклоняя вызовы инструментов во всех воркерах.

### Запись сессий, аудит и воспроизведение

Направляйте каждую сессию TUI в обычный файл с помощью `--json-file`. В дальнейшем:

- Аудит соответствия может точно восстановить, что было выполнено.
- Автоматизированные регрессионные тесты могут сравнивать запуски между версиями моделей.
- Инструмент воспроизведения может повторно отправлять события по тому же протоколу для передачи в дашборды визуализации.

### Дашборды наблюдаемости

Стримьте `--json-file` в Loki / OTEL / любой пайплайн, принимающий JSONL. Извлекайте `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` как полноценные метрики в Grafana. Регулярные выражения для парсинга логов не нужны.

### Тестирование и QA

Интеграционные тесты запускают Qwen Code в headless-режиме, управляют им с помощью скриптов `--input-file` и проверяют события `--json-file`. В отличие от парсинга ANSI в stdout, ассерты остаются стабильными при рефакторинге UI.

## Флаги

| Флаг                  | Тип              | Назначение                                                                                                                                     |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | number, `n >= 3` | Запись структурированных JSON-событий в файловый дескриптор `n`. Вызывающая сторона должна предоставить этот fd через конфигурацию `stdio` при spawn или перенаправление в оболочке. |
| `--json-file <path>`  | path             | Запись структурированных JSON-событий в файл. Путь может указывать на обычный файл, FIFO (именованный канал) или `/dev/fd/N`.                  |
| `--input-file <path>` | path             | Отслеживание этого файла на наличие JSONL-команд, записанных внешней программой.                                                               |

Флаги `--json-fd` и `--json-file` являются взаимоисключающими. Дескрипторы 0, 1 и 2 отклоняются, чтобы не повредить собственный вывод TUI.

## Зачем два флага вывода? (`--json-fd` vs `--json-file`)

На первый взгляд `--json-fd` кажется достаточным — вызывающая сторона запускает Qwen Code с дополнительным файловым дескриптором, TUI пишет в него события, готово. На практике передача fd ломается в самом важном сценарии встраивания: запуске TUI внутри псевдотерминала (PTY). Именно поэтому эта функция также предоставляет альтернативу на основе пути.

### Когда работает `--json-fd`

Чистый `child_process.spawn` с массивом `stdio`:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node's spawn поддерживает произвольные записи `stdio`; fd 3 наследуется дочерним процессом, который может писать в него напрямую. Zero-copy, zero-buffer, без файловой системы — самый быстрый путь.

### Почему `--json-fd` **не работает** в PTY

Обертки PTY, такие как [`node-pty`](https://github.com/microsoft/node-pty) и [`bun-pty`](https://github.com/oven-sh/bun), — это то, как любой серьезный embedder (расширения IDE, веб-терминалы, мультиплексоры типа tmux) размещает интерактивный TUI. Они не могут перенаправлять дополнительные fd дочернему процессу по трем взаимосвязанным причинам:

1. **Поверхность API.** `node-pty.spawn(file, args, options)` принимает `cwd`, `env`, `cols`, `rows`, `encoding` и т. д., но **не массив `stdio`**. В API просто нет места, чтобы сказать «также подключи этот fd как fd 3 в дочернем процессе». `bun-pty` имеет ту же структуру.
2. **Семантика `forkpty(3)`.** Под капотом обертки PTY вызывают `forkpty(3)` (или эквивалентную связку `posix_openpt` + `login_tty`). Этот системный вызов выделяет пару псевдотерминалов master/slave и перенаправляет fd 0/1/2 дочернего процесса на сторону slave, чтобы дочерний процесс «думал», что подключен к реальному терминалу. Любые fd > 2 в родительском процессе закрываются `login_tty`, который вызывает `close(fd)` для `fd >= 3` перед `exec`. Дополнительные fd активно удаляются, а не наследуются.
3. **Побочный эффект управляющего терминала.** Даже если бы вы прокинули дополнительный fd, он не был бы терминалом, поэтому рендерер TUI дочернего процесса (который пишет escape-последовательности, предполагая TTY на fd 1) все равно нуждался бы в slave для вывода. В итоге у вас все равно было бы два независимых транспорта.

Короче говоря: как только embedderу нужен реальный TTY для рендеринга TUI — а это каждое расширение IDE, каждый веб-терминал, каждое десктопное чат-приложение — наследование fd отпадает.

### `--json-file` закрывает этот пробел

Путь к файлу передается как обычный аргумент CLI, поэтому он работает в любой модели spawn:

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

Дочерний процесс сам открывает файл и пишет туда события; embedder читает конец того же пути с помощью `fs.watch` + инкрементальных чтений. Три важных момента:

- Работают **обычные файлы**, FIFO (именованный канал) или `/dev/fd/N`. FIFO обеспечивает наименьшую задержку, когда обе стороны находятся на одном хосте.
- Мост открывает FIFO с флагом `O_NONBLOCK` и переходит в блокирующий режим при `ENXIO` (пока нет читателя), поэтому запуск PTY никогда не блокируется в ожидании потребителя.
- Для изоляции нескольких сессий используйте пути для каждой сессии в `$XDG_RUNTIME_DIR` или каталог, созданный через `mkdtemp`, с правами `0700`.

### Какой флаг использовать?

| Стиль встраивания                                   | Флаг                 |
| --------------------------------------------------- | -------------------- |
| `child_process.spawn` с обычным stdio               | `--json-fd`          |
| `node-pty` / `bun-pty` / любой PTY-хост             | `--json-file`        |
| Перенаправление в оболочке / ручное тестирование пайплайнов | любой                |
| Сбор логов CI (обычный файл, чтение после завершения) | `--json-file`        |
| Минимально возможная задержка на одном хосте        | `--json-file` + FIFO |

Общее правило: **если вам нужно, чтобы TUI рендерился корректно, вам нужен PTY, а значит, вам нужен `--json-file`.** `--json-fd` предназначен для более простых embedderов, которым не важна точность TUI — обычно это программные обертки, которые все равно игнорируют stdout.

## Быстрый старт

Запустите Qwen Code со всеми тремя включенными каналами:

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Во втором терминале читайте конец потока событий:

```bash
cat /tmp/qwen-events.jsonl
```

В третьем терминале отправьте промпт в работающий TUI:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

Промпт появится в TUI точно так же, как если бы пользователь ввел его вручную, а потоковый ответ отразится в `/tmp/qwen-events.jsonl`.

## Схема выходных событий

События отправляются в формате JSON Lines (один объект на строку). Схема совпадает с той, что используется в неинтерактивном режиме `--output-format=stream-json`, при этом `includePartialMessages` всегда включен.

Первым событием в канале всегда будет `system` / `session_start`, которое генерируется при создании моста. Используйте его для сопоставления канала с session id до поступления любых других событий.

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

Событие `control_response` генерируется независимо от того, где было принято решение: в TUI (нативный UI подтверждения) или через внешний `confirmation_response` (см. ниже). В любом случае все наблюдатели видят окончательный результат.

## Схема входных команд

В `--input-file` принимаются два формата команд:

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Поведение:

- Команды `submit` ставятся в очередь. Если TUI занят ответом, они автоматически повторяются при следующем возврате TUI в состояние ожидания.
- Команды `confirmation_response` отправляются немедленно и никогда не ставятся в очередь, поскольку вызов инструмента блокирующий, и ответ должен достичь обработчика `onConfirm` без ожидания предыдущих `submit`.
- Побеждает та сторона, которая первой одобрит инструмент; запоздалый ответ другой стороны безвредно игнорируется.
- Строки, которые не парсятся как JSON, логируются и пропускаются — они не останавливают наблюдатель.

## Примечания о задержках

Входной файл отслеживается через `fs.watchFile` с интервалом опроса 500 мс, поэтому максимальная задержка round-trip для удаленного `submit` составляет около полсекунды. Это сделано намеренно: опрос переносим между платформами и файловыми системами (включая macOS / сетевые монтирования) и соответствует типичному темпу взаимодействия «человек в цикле», на который ориентирована функция. Выходной канал не использует опрос — события записываются синхронно по мере их генерации TUI.

## Режимы отказов

- **Неверный fd.** Если fd, переданный в `--json-fd`, не открыт или равен 0/1/2, TUI выводит предупреждение в `stderr` и продолжает работу без включенного dual output.
- **Неверный путь.** Если файл, переданный в `--json-file`, не может быть открыт, TUI выводит предупреждение и продолжает работу без dual output.
- **Отключение потребителя.** Если читатель на другой стороне канала отключается (`EPIPE`), мост молча отключается, а TUI продолжает работу. Повторных попыток нет.
- **Исключение адаптера.** Любое исключение, возникшее при отправке события, перехватывается, логируется и отключает мост. TUI никогда не падает из-за ошибки dual-output.

## Пример запуска

Типичный родительский процесс-embedder запускает Qwen Code с обоими каналами:

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

TUI по-прежнему владеет терминалом пользователя на stdio 0/1/2, в то время как embedder читает структурированные события из файла, связанного с fd 3, и отправляет команды, добавляя строки JSONL в `/tmp/qwen-input.jsonl`.

## Конфигурация через настройки

Для долгоживущих embedderов часто неудобно передавать флаги CLI при каждом запуске. Те же каналы можно настроить в `settings.json` в ключе верхнего уровня `dualOutput`:

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Правила приоритета:

- Флаг CLI **имеет приоритет** над настройками. Передача `--json-file /foo` в командной строке переопределяет `dualOutput.jsonFile` в настройках.
- У `--json-fd` нет эквивалента в настройках — передача fd относится к моменту запуска и не может быть объявлена статически.
- Если не указан ни флаг, ни настройка, dual output остается отключенным (идентично текущему поведению по умолчанию).

Флаг `requiresRestart: true` означает, что изменения вступят в силу только при следующем запуске Qwen Code, так как мост создается один раз при старте.

## Запускаемые демо

Каждый скрипт ниже готов к копированию и запуску. Начните с POC&nbsp;1, чтобы убедиться, что сборка поддерживает dual output; POC&nbsp;4 наиболее близок к реальной интеграции расширения IDE.

### POC 1 — наблюдение за потоком событий

Отслеживайте каждое структурированное событие, которое генерирует TUI при обычном использовании человеком:

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

Ожидаемая первая строка в терминале A:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — инжекция промптов извне

Управляйте TUI из второго терминала, не касаясь клавиатуры первого:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — удаленный мост разрешений для инструментов

Одобряйте или отклоняйте вызовы инструментов из отдельного процесса:

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

Если вы ответите с неизвестным `request_id`, мост отправит `control_response` с `subtype: "error"` в выходной канал, чтобы ваш потребитель мог залогировать это или повторить попытку:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Node embedder (похоже на IDE)

Наиболее реалистичный вариант: родительский процесс запускает Qwen Code, читает конец потока событий и инжектирует промпты по своему расписанию.

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // Feature-detect before using a capability
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// After 2s, inject a prompt as if the user typed it
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

Запуск:

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — feature detection рукопожатия возможностей

Более старые версии Qwen Code не отправляют `protocol_version`. Считайте поле опциональным и используйте feature detection:

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — session_end как сигнал чистого завершения

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

Если TUI упадет до `session_end`, выходной поток закроется (`EPIPE` при следующей записи); embedderы должны обрабатывать оба сценария.

### POC 7 — отработка отказов (доказательство того, что флаги не ломают TUI)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## Связь с Claude Code

Claude Code предоставляет похожий формат событий stream-json через `--print --output-format stream-json`, но только в неинтерактивном режиме — у него нет аналога одновременного запуска TUI и структурированного sidecar-канала. Dual Output закрывает этот пробел.