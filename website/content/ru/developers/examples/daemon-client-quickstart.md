# Краткое руководство по DaemonClient (TypeScript)

Минимальный сквозной пример: запустите демон `qwen serve` в другом терминале, затем управляйте им из Node-скрипта с помощью `DaemonClient` из SDK. См. также: [Руководство по режиму демона](../../users/qwen-serve.md) и [Справочник HTTP-протокола](../qwen-serve-protocol.md).

## Настройка

В одном терминале:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

Согласно [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, каждый демон привязывается к одной рабочей области при запуске (текущая `cwd`, или переопределить с помощью `--workspace /path/to/dir`). Привязанный путь демона сообщается в `/capabilities.workspaceCwd`, чтобы клиенты могли выполнить предварительную проверку и опустить `cwd` в `POST /session`.

В другом:

```bash
npm install @qwen-code/sdk
```

## Привет, демон

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): когда `token` опущен, DaemonClient автоматически
  // использует `process.env.QWEN_SERVER_TOKEN` — та же переменная
  // окружения, к которой обращается флаг `--token` демона. То есть:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # одноразовый
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # файл, управляемый пользователем
  //   const client = new DaemonClient({ baseUrl: '...' });
  // ИЛИ передайте его явно, если у вас другое имя переменной:
  //   token: process.env.MY_TOKEN,
});

// 1. Убедимся, что можем связаться с демоном, узнаем его возможности и
//    прочитаем привязанную рабочую область (#3803 §02).
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
console.log('Daemon workspace:', caps.workspaceCwd); // канонический привязанный путь

// 2. Создать или подключиться к сессии. Две равнозначные формы:
//    (a) передать `workspaceCwd: caps.workspaceCwd` явно, или
//    (b) полностью опустить `workspaceCwd` — тогда SDK не отправляет поле `cwd`
//        и маршрут демона использует свою привязанную рабочую область.
//        Форма (b) лаконична, но предполагает доверие к `caps.workspaceCwd`.
//    Непустое `workspaceCwd`, не совпадающее с привязанным путём демона,
//    приводит к ошибке `400 workspace_mismatch` (см. "Несоответствие рабочей области" ниже).
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Подписаться на поток событий. Передайте `lastEventId: 0`, чтобы демон
//    воспроизвёл все события с начала сессии — без этого существует
//    окно TOCTOU между моментом возврата итератора из `subscribeEvents()`
//    и фактическим открытием SSE-соединения (один круг запроса-ответа),
//    во время которого быстрый агент может испустить события, которые
//    попадут в кольцевой буфер сессии, но не будут переданы новому подписчику
//    без курсора. `lastEventId: 0` перекрывает этот пробел (и любое
//    переподключение — см. ниже).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Отправить запрос и дождаться завершения. (Замечание о порядке операций:
//    даже если `prompt()` выполнится до завершения рукопожатия SSE,
//    `lastEventId: 0` на шаге 3 гарантирует, что все события попадут
//    в итератор.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Опиши src/main.ts одной строкой.' }],
});
console.log('stop reason:', result.stopReason);

// 5. Завершить подписку, чтобы скрипт мог выйти.
abort.abort();
await subscription;

function handleEvent(event: DaemonEvent): void {
  switch (event.type) {
    case 'session_update': {
      const data = event.data as {
        sessionUpdate: string;
        content?: { text?: string };
      };
      if (data.sessionUpdate === 'agent_message_chunk' && data.content?.text) {
        process.stdout.write(data.content.text);
      }
      break;
    }
    case 'permission_request':
      // См. "Голосование по разрешениям" ниже о семантике первого ответившего.
      console.log('\n[требуется разрешение]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[разрешение получено]', event.data);
      break;
    case 'session_died':
      console.error('\n[агент упал]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## Вспомогательные функции для файлов рабочей области

Файловые маршруты привязаны к рабочей области, а не к сессии, поэтому они находятся непосредственно на `DaemonClient`:

```ts
const file = await client.readWorkspaceFile('src/main.ts');

const updated = await client.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` — это SHA-256 от сырых байтов файла на диске. Режим `"replace"` и `editWorkspaceFile()` требуют его, чтобы устаревшие клиенты не перезаписали файл, который они только что не читали. Запись/редактирование требуют настройки bearer-токена даже на локальном хосте; запустите демон с `--token` или `QWEN_SERVER_TOKEN` перед их использованием.

## Переподключение с `Last-Event-ID`

Если ваш клиентский процесс перезапускается в середине сессии, воспроизведите пропущенные события:

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // возобновить после этого id; undefined = только новые
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

Демон хранит последние 8000 событий на сессию в кольцевом буфере; события за пределами этого окна не могут быть повторно доставлены.

## Голосование по разрешениям

Когда агент запрашивает разрешение на запуск инструмента, каждый подключённый клиент видит событие `permission_request`. **Первый ответивший выигрывает** — как только один клиент проголосует, остальные получат `404`, если попытаются голосовать по тому же `requestId`.

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Выберите любой вариант — `proceed_once`, `allow` и т.д.
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Другой клиент проголосовал первым; ничего не делать.');
  }
  break;
}
```

## Совместная работа в общей сессии

Два клиента, указывающие на **один и тот же демон**, оказываются в одной сессии. Согласно §02 из #3803, каждый демон при запуске привязан к ОДНОЙ рабочей области, поэтому демон, запущенный как `qwen serve --workspace /work/repo` (или `cd /work/repo && qwen serve`), — это то, к чему подключаются оба клиента:

```ts
// Демон запущен как `qwen serve --workspace /work/repo`, поэтому
// `caps.workspaceCwd === '/work/repo'` для обоих клиентов.

// Клиент A (например, плагин для IDE)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A запустил агента

// Клиент B (например, веб-интерфейс на той же машине)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B присоединился к сессии A
console.log(a.sessionId === b.sessionId); // true
```

Оба клиента видят один и тот же поток `session_update` / `permission_request`. Любой из них может отправить запрос; они ставятся в очередь FIFO в соответствии с гарантией агента «один активный запрос на сессию».

## Несоответствие рабочей области

Если `workspaceCwd` не совпадает с привязанной рабочей областью демона, `createOrAttachSession` отклоняется с `DaemonHttpError` со статусом `400` и структурированным телом:

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.createOrAttachSession({ workspaceCwd: '/some/other/project' });
} catch (err) {
  if (err instanceof DaemonHttpError && err.status === 400) {
    const body = err.body as {
      code?: string;
      boundWorkspace?: string;
      requestedWorkspace?: string;
    };
    if (body.code === 'workspace_mismatch') {
      console.error(
        `Этот демон привязан к ${body.boundWorkspace}, ` +
          `а не к ${body.requestedWorkspace}. Запустите отдельный демон ` +
          `для этой рабочей области или направьте запрос к правильному.`,
      );
    }
  }
}
```

В развёртываниях с несколькими рабочими областями запускается один демон на рабочую область на разных портах — внутридемонной маршрутизации в §02 нет. Оркестратор (или программа запуска пользователя) выбирает нужного демона на основе проекта, к которому клиент хочет обратиться.

## Аутентификация

Когда демон запущен с токеном (любая привязка не к локальному хосту требует его):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**Резервное использование переменной окружения SDK (PR 27, v0.16-alpha)** — `DaemonClient` автоматически читает `QWEN_SERVER_TOKEN` из окружения, когда `token` опущен, зеркалируя собственный флаг `--token` демона. Так что если в вашей оболочке есть `export QWEN_SERVER_TOKEN=...`, это эквивалентно предыдущему коду:

```ts
// То же самое, что token: process.env.QWEN_SERVER_TOKEN, но без шаблонного кода.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

Резервный механизм удаляет начальные и конечные пробелы (удобно для `export QWEN_SERVER_TOKEN="$(cat token.txt)"`, где `cat` добавляет новую строку) и считает пустые значения и значения из одних пробелов как неустановленные (устаревший `export QWEN_SERVER_TOKEN=""` не отправит случайно `Authorization: Bearer ` без токена). Резервный механизм выполняется один раз при создании объекта; последующие изменения `process.env` не влияют на уже созданные клиенты. В браузерных сборках (например, через `@qwen-code/webui`) он корректно возвращает `undefined`, потому что `globalThis.process` там не существует.

Неправильные или отсутствующие токены возвращают `401` с единообразным телом — SDK выбрасывает `DaemonHttpError` при любом 4xx/5xx от обработчика маршрута.

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Ошибка демона ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## Отмена выполняющегося запроса

Если пользователь нажал Esc:

```ts
await client.cancel(session.sessionId);
// В потоке событий запрос завершится с stopReason: "cancelled"
```

Отмена останавливает только **активный** запрос — всё, что вы уже отправили POST-запросом и что всё ещё стоит в очереди за ним, продолжит выполняться. (См. справочник протокола для обоснования.)

## Что дальше

- [Справочник HTTP-протокола](../qwen-serve-protocol.md) — полная спецификация маршрутов с кодами статуса
- [Руководство по режиму демона](../../users/qwen-serve.md) — документация для операторов
- Исходный код: `packages/sdk-typescript/src/daemon/`