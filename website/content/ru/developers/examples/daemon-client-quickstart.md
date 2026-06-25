# DaemonClient: краткое руководство (TypeScript)

Минимальный сквозной пример: запустите демон `qwen serve` в одном терминале, затем управляйте им из Node-скрипта с помощью `DaemonClient` из SDK. Смотрите также: [руководство пользователя по режиму демона](../../users/qwen-serve.md) и [справочник по HTTP-протоколу](../qwen-serve-protocol.md).

## Настройка

В одном терминале:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve прослушивает http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

Согласно [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 каждый демон привязывается к одной рабочей области при запуске (текущий каталог `cwd`, или укажите свой через `--workspace /path/to/dir`). Привязанный путь демона сообщается в `/capabilities.workspaceCwd`, чтобы клиенты могли выполнить предварительную проверку и не указывать `cwd` в `POST /session`.

В другом терминале:

```bash
npm install @qwen-code/sdk
```

## Привет, демон

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): если `token` опущен, DaemonClient автоматически
  // использует `process.env.QWEN_SERVER_TOKEN` — ту же переменную
  // окружения, на которую запасной вариант `--token` CLI-флага демона.
  // То есть либо:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # одноразовый
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # файл пользователя
  //   const client = new DaemonClient({ baseUrl: '...' });
  // ИЛИ передать явно, если имя переменной окружения другое:
  //   token: process.env.MY_TOKEN,
});

// 1. Убедимся, что можем связаться с демоном, проверим его возможности
//    и узнаем привязанную рабочую область (#3803 §02).
const caps = await client.capabilities();
console.log('Возможности демона:', caps.features);
console.log('Рабочая область демона:', caps.workspaceCwd); // канонический привязанный путь

// 2. Создать или подключиться к сессии. Два равноценных варианта:
//    (a) явно передать `workspaceCwd: caps.workspaceCwd`,
//    (b) опустить `workspaceCwd` — тогда SDK не отправляет поле `cwd`,
//        и маршрут демона по умолчанию использует привязанную
//        рабочую область. Вариант (b) короче, но предполагает,
//        что вы доверяете `caps.workspaceCwd` тому, что задумали.
//    Непустой `workspaceCwd`, не соответствующий каноническому пути
//    демона, приведет к ошибке `400 workspace_mismatch` (см.
//    «Несоответствие рабочей области» ниже).
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Подписаться на поток событий. Передайте `lastEventId: 0`, чтобы демон
//    воспроизвел все события с начала сессии — без этого возникает окно
//    гонки между возвратом итератора из `subscribeEvents()` и фактическим
//    открытием SSE-соединения (один fetch-цикл). За это время быстро
//    запускающийся агент может испустить события, которые попадут
//    в кольцевой буфер сессии, но не будут переданы новому подписчику
//    без курсора. `lastEventId: 0` гарантирует, что буфер воспроизведения
//    перекроет этот разрыв (а также при последующем переподключении — см. ниже).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Отправить запрос и дождаться завершения. (Примечание о порядке
//    операций: даже если `prompt()` выполняется до завершения
//    SSE-рукопожатия, `lastEventId: 0` из шага 3 гарантирует,
//    что каждое событие окажется в итераторе.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Опиши src/main.ts одним предложением.' }],
});
console.log('Причина остановки:', result.stopReason);

// 5. Завершить подписку, чтобы скрипт мог завершиться.
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
      // См. «Голосование за разрешения» ниже о семантике первого ответчика.
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

## Вспомогательные методы для файлов рабочей области

Файловые маршруты привязаны к рабочей области, а не к сессии, поэтому они
находятся непосредственно в `DaemonClient`:

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
`expectedHash` — это SHA-256 от сырых байт на диске. `mode: "replace"` и `editWorkspaceFile()` требуют его, чтобы устаревшие клиенты не перезаписывали файл, который они только что не читали. Для записи/редактирования требуется настройка bearer-токена даже на loopback; запустите демон с `--token` или `QWEN_SERVER_TOKEN` перед их использованием.

## Переподключение с помощью `Last-Event-ID`

Если ваш клиентский процесс перезапускается во время сессии, воспроизведите пропущенные события:

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // resume from after this id; undefined = live only
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

Демон сохраняет последние 8000 событий на сессию в кольцевом буфере; пробелы за пределами этого окна не будут повторно доставлены.

## Голосование за разрешения

Когда агент запрашивает разрешение на выполнение инструмента, каждый подключенный клиент видит событие `permission_request`. **Побеждает первый ответивший** — как только один клиент проголосовал, остальные получают `404`, если попытаются проголосовать за тот же `requestId`.

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Pick whichever option you want — `proceed_once`, `allow`, etc.
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Another client voted first; nothing to do.');
  }
  break;
}
```

## Совместная работа в общей сессии

Два клиента, направленных на **один и тот же демон**, оказываются в одной сессии. Согласно §02 #3803 каждый демон при запуске привязан к ОДНОЙ рабочей области, поэтому демон, запущенный как `qwen serve --workspace /work/repo` (или `cd /work/repo && qwen serve`), — это то, к чему подключаются оба клиента:

```ts
// Daemon was launched as `qwen serve --workspace /work/repo` so
// `caps.workspaceCwd === '/work/repo'` for both clients.

// Client A (e.g. an IDE plugin)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A spawned the agent

// Client B (e.g. a web UI on the same machine)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B joined A's session
console.log(a.sessionId === b.sessionId); // true
```

Оба клиента видят один и тот же поток `session_update` / `permission_request`. Любой из них может отправить запрос; они ставятся в очередь FIFO в соответствии с гарантией агента «один активный запрос на сессию».

## Несовпадение рабочей области

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
        `This daemon is bound to ${body.boundWorkspace}, ` +
          `not ${body.requestedWorkspace}. Start a separate daemon ` +
          `for that workspace, or route to the right one.`,
      );
    }
  }
}
```

В развертываниях с несколькими рабочими областями запускается один демон на рабочую область на отдельных портах — внутридемонной маршрутизации в соответствии с §02 нет. Оркестратор (или лаунчер пользователя) выбирает нужного демона на основе проекта, с которым клиент хочет взаимодействовать.

## Аутентификация

Когда демон был запущен с токеном (любая привязка не к loopback требует его):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**Резервное использование переменной окружения SDK (PR 27, v0.16-alpha)** — `DaemonClient` автоматически читает `QWEN_SERVER_TOKEN` из окружения, когда `token` опущен, повторяя собственное резервное поведение демона с `--token` CLI. Таким образом, если в вашей оболочке есть `export QWEN_SERVER_TOKEN=...`, это эквивалентно приведенному выше:

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

Резервный вариант удаляет начальные и конечные пробельные символы (удобно для `export QWEN_SERVER_TOKEN="$(cat token.txt)"`, где `cat` добавляет новую строку) и рассматривает пустые значения или значения, состоящие только из пробелов, как неустановленные (устаревший `export QWEN_SERVER_TOKEN=""` не приведет к случайной отправке `Authorization: Bearer ` без токена). Резервный вариант выполняется один раз при создании; последующие изменения `process.env` не влияют на уже созданные клиенты. Пакеты для браузера (например, через `@qwen-code/webui`) корректно получают `undefined`, так как `globalThis.process` там не существует.

Неправильные / отсутствующие токены возвращают `401` с единообразным телом — SDK выбрасывает `DaemonHttpError` при любом 4xx/5xx от обработчика маршрута.
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

Отмена останавливает только **активный** запрос — всё, что вы уже отправили через POST и что всё ещё ожидает в очереди, продолжит выполняться. (См. протокол для объяснения.)

## Что дальше

- [Справочник по HTTP-протоколу](../qwen-serve-protocol.md) — полная спецификация маршрутов с кодами состояния
- [Руководство пользователя режима демона](../../users/qwen-serve.md) — документация для операторов
- Исходный код: `packages/sdk-typescript/src/daemon/`
