# Уровень абстракции DaemonTransport

> Целевая ветка: `main`. Автор: arnoo.gao. Дата: 12.06.2026. Статус: **Дизайн v4 — рецензия**.
> Рабочий процесс «сначала дизайн, затем PR»: этот документ публикуется до реализации PR.

---

## 0. TL;DR

`DaemonClient` жёстко завязывает REST+SSE. Сторонние интеграции, желающие использовать ACP WebSocket, вынуждены форкать стек провайдера (~8 файлов). Это предложение добавляет **интерфейс `DaemonTransport`** с методами `fetch` + `subscribeEvents`, а также автоопределение и механизм отката во время выполнения, позволяя подключать транспорты **без обратно несовместимых изменений**.

**Общий объём изменений: ~1300 строк** в одном PR реализации. Существующие потребители не затрагиваются — `new DaemonClient({ baseUrl, token })` продолжает работать как раньше.

---

## 1. Предпосылки

### 1.1 Текущая архитектура

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← жёстко закодировано
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 публичных методов, каждый из которых строит URL-адреса REST и ветвится по кодам состояния HTTP. `fetch` уже можно внедрить через `DaemonClientOptions.fetch`, но `subscribeEvents` содержит встроенную логику, специфичную для SSE (проверка типа содержимого, синтаксический анализ SSE, тайм-аут фазы подключения), которую невозможно заменить одним лишь внедрением `fetch`.

### 1.2 Проблема для сторонних разработчиков

Когда сторонний разработчик (например, `agent-web`) создаёт `AcpSessionProvider` для использования WebSocket вместо REST+SSE:

- **Если он заменяет** `DaemonSessionProvider`: компоненты, читающие `DaemonStoreContext` (например, TerminalView), теряют свой контекст → падение.
- **Если он оставляет оба провайдера**: два источника событий, два хранилища, рассинхронизация.
- **Если он внедряет события** в хранилище SDK: `DaemonSessionProvider` также подписывается на SSE внутри → дублирование событий.

**Основная причина**: смена транспорта требует замены провайдера, потому что `subscribeEvents` в `DaemonClient` жёстко завязан на SSE.

### 1.3 Цель

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → отображает URL+глагол в JSON-RPC через WS
  └─ transport.subscribeEvents → демультиплексирует уведомления WS → DaemonEvent
```

Один провайдер, одно хранилище, транспорт — внутренняя деталь. Сторонние разработчики передают `transport` в `DaemonClient`; всё остальное работает без изменений.

---

## 2. Дизайн

### 2.1 Интерфейс

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = без тайм-аута; undefined = значение по умолчанию для транспорта.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Отправить запрос и вернуть Response.
   *
   * Контракт:
   * - Response ОБЯЗАН поддерживать .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status ОБЯЗАН содержать точный код состояния HTTP
   *   (200, 201, 202, 204, 404 и т.д.)
   * - Тела ошибок ОБЯЗАНЫ сохранять структурированную форму демона
   * - Вызов не требует предварительной настройки; транспорт обрабатывает
   *   инициализацию внутри (отложенная инициализация / шаблон
   *   «инициализировать один раз»)
   * - Выбрасывает DaemonTransportClosedError, когда соединение разорвано
   * - Когда init.signal прерывается: для запросов с подсказкой (prompt)
   *   транспорт ОБЯЗАН отменить выполняющуюся подсказку на линии
   *   (WS: отправить session/cancel RPC; HTTP: прервать fetch).
   *   Для обычных запросов прерывание просто отклоняет/отменяет
   *   ожидающий запрос без побочных эффектов. Ожидающий ответ
   *   отклоняется с AbortError.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * Подписаться на события сессии.
   *
   * Контракт:
   * - События с id ОБЯЗАНЫ иметь монотонно возрастающие целочисленные
   *   id; синтетические/терминальные кадры (например, stream_error)
   *   МОГУТ опускать id (DaemonEvent.id опционален)
   * - ОБЯЗАН доставлять ВСЕ типы событий (сессия + рабочее пространство)
   *   в одном потоке
   * - Прерывание сигнала ОБЯЗАНО остановить только этот генератор,
   *   НЕ соединение
   * - Когда соединение разрывается, все ожидающие генераторы ОБЯЗАНЫ
   *   выбрасывать DaemonTransportClosedError (транспорт хранит
   *   ссылки на генераторы)
   * - ОБЯЗАН применять connectTimeoutMs только к фазе подключения
   * - Транспорт ОБЯЗАН объявить, поддерживается ли воспроизведение
   *   по lastEventId; если нет, потребитель ОБЯЗАН использовать
   *   session/load для полной ресинхронизации при переподключении
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Идентификация транспорта для исчерпывающего перебора. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Поддерживает ли этот транспорт воспроизведение на основе
   *  Last-Event-ID при переподключении.
   *  Если false, потребитель ОБЯЗАН использовать session/load
   *  для полной ресинхронизации. */
  readonly supportsReplay: boolean;

  /** false после разрыва соединения или вызова dispose(). */
  readonly connected: boolean;

  /** Идемпотентное завершение работы. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Почему два метода (fetch + subscribeEvents), а не только fetch

`subscribeEvents` имеет принципиально другую семантику канала в зависимости от транспорта:

| Транспорт | Механизм канала                                                  |
| --------- | ---------------------------------------------------------------- |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP  | `GET /acp` (SSE в рамках сессии) → развёртка уведомления JSON-RPC |
| ACP WS    | Демультиплексирование уведомлений из общего сокета по sessionId  |
Принудительное проталкивание через абстракцию fetch требует перекодирования SSE туда и обратно (WS → фиктивный SSE-текст → `parseSseStream` → DaemonEvent) — расточительно и хрупко.

Все остальные 66 методов работают через `fetch`, потому что они следуют семантике запрос → ответ независимо от транспорта.

### 2.3 Почему на уровне fetch, а не диспетчеризация методов

67 методов DaemonClient содержат ветвление HTTP-логики для каждого метода:

- `prompt()`: проверка статуса 202 vs 200
- `deleteWorkspaceAgent()`: 204 vs 404 с проверкой тела ответа
- `respondToPermission()`: 200 vs 404 для обнаружения состояний гонки
- 6 методов обходят `fetchWithTimeout`, вызывая `_fetch` напрямую

Интерфейс с диспетчеризацией методов (`request<T>(method, params)`) вынуждает дублировать всю эту логику в каждом транспорте. Уровень fetch оставляет DaemonClient неизменным.

### 2.4 Изменения в DaemonClient (~40 строк)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Kept
  fetchTimeoutMs?: number; // Kept
  transport?: DaemonTransport; // NEW — optional override
}
```

Внутренние изменения:

- Конструктор: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: делегирование в `this.transport.fetch(url, init, { timeout })`
- 6 мест с прямым вызовом `this._fetch` (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): заменить на
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: исчерпывающий switch по `this.transport.type`:
  - `'rest'`: делегирование в `this.transport.subscribeEvents(sessionId, opts)`
  - default: то же делегирование (каждый транспорт обрабатывает свой собственный формат передачи)
- Удалить поле `private _fetch` (заменено на transport)

### 2.5 Точка внедрения провайдера

`DaemonWorkspaceProvider` и `DaemonSessionProvider` обе создают `DaemonClient` внутри себя. Чтобы дать возможность третьим сторонам внедрить транспорт, не обходя провайдер:

```typescript
// DaemonWorkspaceProvider — add optional transport prop
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NEW — forwarded to DaemonClient
  // ...existing props
}

// DaemonSessionProvider — inherit from workspace context
// No transport prop needed; reads from workspace context
```

Если `transport` указан, провайдер передаёт его в `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Если опущен: текущее поведение (REST+SSE). ~5 строк изменений в провайдере.

### 2.5 RestSseTransport (~80 строк)

Оборачивает `globalThis.fetch` + извлекает текущую SSE-логику из `DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE supports Last-Event-ID
  readonly connected = true; // REST is stateless

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Current DaemonClient.subscribeEvents logic moved here:
    // - build URL from this.baseUrl + sessionId
    // - set Authorization header from this.token
    // - connect-phase timeout from opts.connectTimeoutMs
    // - fetch → validate content-type → parseSseStream → yield
  }

  dispose() {} // no-op
}
```

### 2.6 Внутренности ACP-транспортов

**AcpWsTransport** (~400–600 строк):

- Ленивая инициализация: первый вызов `fetch` открывает WS + отправляет `initialize`
- Таблица отображения URL→JSON-RPC: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Мультиплексор запросов: `Map<id, {resolve, reject}>` для ожидающих запросов
- `subscribeEvents`: фильтрация общего потока уведомлений по sessionId
- `connected`: отслеживает состояние readyState WebSocket
- `supportsReplay`: false (у WS нет Last-Event-ID; потребитель должен выполнить `session/load`)
- Синтезирует объекты `Response` с корректными `.status` / `.json()` / `.text()`

**AcpHttpTransport** (~800–1000 строк):

- Ленивая инициализация: первый вызов `fetch` отправляет `POST /acp {initialize}`
- Управляет SSE-потоками в рамках соединения и в рамках сессии
- Та же схема URL→JSON-RPC + корреляция запросов
- `supportsReplay`: true (сессионный SSE поддерживает Last-Event-ID)

### 2.7 Автоопределение транспорта

Сервер объявляет поддерживаемые транспорты в `GET /capabilities`:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...existing capabilities fields...
}
```

SDK предоставляет одноразовую статическую фабрику:

```typescript
// Probe once before React render, never switches mid-session
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Returns best available: acp-ws > acp-http > rest (fallback)
```

Реализация:

1. `GET /capabilities` → чтение массива `transports`
2. Если `acp-ws` в списке → попытка WS-апгрейда; при успехе вернуть `AcpWsTransport`
3. Если WS не удалось или отсутствует в списке → попытка `acp-http`; при успехе вернуть `AcpHttpTransport`
4. Запасной вариант → `RestSseTransport`

Ни один существующий API не затронут: `GET /capabilities` добавляет новое поле (аддитивно), существующие потребители игнорируют неизвестные поля.
### 2.8 Запасной вариант выполнения (WS → REST при отключении)

Когда не-REST транспорт отключается во время активной сессии:

```
AcpWsTransport (connected=true)
  │
  ├── WS падает (сеть, перезапуск сервера, тайм-аут бездействия)
  │
  ├── connected = false
  ├── Все ожидающие вызовы fetch() → отклоняются с DaemonTransportClosedError
  ├── Все генераторы subscribeEvents → выбрасывают DaemonTransportClosedError
  │
  └── Потребитель (Provider / третья сторона) обнаруживает отключение:
        1. Создать новый RestSseTransport (гарантированно работает, если демон запущен)
        2. Создать новый DaemonClient({ transport: newTransport })
        3. Для каждой активной сессии: session/load для повторного подключения
        4. Возобновить подписку на события
```

**Ключевое ограничение**: запасной вариант выполняется **потребителем, а не внутри транспорта**.
Транспорт не переключает протоколы незаметно — он громко сообщает об ошибке
(`DaemonTransportClosedError`), а потребитель решает, нужно ли перестраивать соединение.

Обоснование:

- При завершении WS все принадлежащие сессии уничтожаются на стороне сервера (`registry.delete` →
  `conn.destroy`). Незаметное переключение скрыло бы эту потерю данных.
- `session/load` повторно подключается к существующей сессии моста (транскрипты
  сохраняются), но текущий запрос (prompt in flight) прерывается. Потребитель должен
  явно обработать это (повторить запрос или показать пользователю).
- Возобновление через `Last-Event-ID` между транспортами пока не поддерживается (Фаза 4). События между
  отключением и повторным подключением могут быть потеряны. Потребителю следует запросить полную
  синхронизацию состояния через `session/load` (которая воспроизводит историю).

**AutoReconnectTransport** (~150 строк, опциональная обёртка):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // При получении DaemonTransportClosedError от внутреннего транспорта:
  // 1. Попытаться воссоздать предпочтительный транспорт
  // 2. Если предпочтительный не удаётся, переключиться на REST
  // 3. Инициализировать соединение заново
  // Вызывающему коду всё равно нужно выполнить session/load — эта обёртка
  // обрабатывает только переподключение на уровне транспорта, не сессии.
}
```

Эта обёртка используется по желанию. Существующие потребители, которые не хотят авто-переподключения,
просто ловят `DaemonTransportClosedError` и обрабатывают его самостоятельно.

**Влияние на существующую функциональность**: нулевое. Весь код автоопределения и запасных вариантов
является дополнительным и опциональным. `new DaemonClient({ baseUrl, token })` без
`transport` = текущее поведение REST, без автоопределения и логики запасных вариантов.

---

## 3. Аудит обратно несовместимых изменений

### Вердикт: нулевое количество обратно несовместимых изменений

| Публичный API                            | Изменение                                   | Обратно несовместимо? |
| ---------------------------------------- | ------------------------------------------- | :------------------: |
| `new DaemonClient({ baseUrl, token })`    | Без изменений                               |         ❌           |
| `DaemonClientOptions.*`                   | Все сохранены, добавлен `transport`         |         ❌           |
| `DaemonHttpError`                         | Без изменений                               |         ❌           |
| `DaemonSessionClient`                     | Ноль изменений (делегирует DaemonClient)    |         ❌           |
| Все экспортируемые типы (100+)            | Без изменений                               |         ❌           |

### Влияние на каждого потребителя

| Потребитель                     | Влияние                                  |
| ------------------------------ | ---------------------------------------- |
| webui (25 файлов)              | Ноль изменений в коде                    |
| web-shell (4 файла)            | Ноль изменений в коде                    |
| vscode-ide-companion (1 файл)  | Ноль изменений в коде                    |
| Третьи стороны                 | Ноль изменений для REST; передать `transport` для ACP |

---

## 4. Проектные решения

| Решение                                               | Обоснование                                                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` на транспорте, а не только `fetch`  | Перекодирование SSE через fetch расточительно и ненадёжно                                                                                                                           |
| `connected: boolean` на транспорте                     | Циклу переподключения Provider нужно различать «транспорт мёртв» и «временная ошибка 500»                                                                                              |
| Ленивая инициализация (без явного `connect()`)         | Сохраняет синхронность конструктора DaemonClient; стандартный `new RestSseTransport()` не требует инициализации                                                                     |
| Автоопределение выполняется один раз, а не во время сессии | `negotiate()` проверяет один раз при запуске; запасной вариант выполнения управляется потребителем через `DaemonTransportClosedError`, а не незаметным внутренним переключением    |
| Отсутствие предварительной таксономии ошибок          | Транспорты ACP внутренне отображают ошибки в эквивалентные HTTP-статусы; `DaemonHttpError` работает как есть                                                                       |
| Provider получает свойство `transport`                | `DaemonWorkspaceProvider` получает опциональное свойство `transport` (~5 строк), которое передаётся конструктору `DaemonClient`. Третьи стороны устанавливают это свойство; его отсутствие = текущее поведение REST |
## 5. Рассмотренные альтернативы

### 5.1 Пользовательская инъекция fetch (без нового интерфейса)

Передача WS-основанного `fetch` через существующий `DaemonClientOptions.fetch`.

**Отвергнуто**: `subscribeEvents` проверяет `content-type: text/event-stream` и
использует `parseSseStream`. Пользовательский fetch должен перекодировать WS-фреймы обратно в SSE-текст, а затем SDK декодирует их — это избыточный цикл кодирования-декодирования.
Кроме того, `capabilities()` и `initialize` имеют разные формы ответа, требующие слоя преобразования форматов.

### 5.2 Полный формальный интерфейс (4 PR, ~2750 строк)

Таксономия ошибок → Интерфейс → AcpHttp → AcpWs в виде отдельных PR.

**Отвергнуто**: избыточно. Таксономия ошибок не нужна (транспорты ACP могут
отображаться на эквивалентные коды статуса HTTP). Отдельные PR увеличивают затраты на переключение контекста ревью для единой целостной абстракции.

### 5.3 Двойной провайдер с BridgeContext

Параллельные `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`.

**Отвергнуто**: приводит к рассинхронизации хранилища, требует ~8 файлов, не может работать без изменений в SDK.

---

## 6. План реализации (один PR)

Все изменения вносятся в один PR. Оценочно ~1300 строк всего.

| Файл                                                                  | Изменение                                                                              | Строк    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`               | Интерфейс + типы + `DaemonTransportClosedError` + фабрика `negotiate()`                | ~110     |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`              | Оборачивает `globalThis.fetch` + логика SSE, извлечённая из DaemonClient               | ~80      |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`                | WS-мультиплексор + отображение URL→JSON-RPC + корреляция запросов                      | ~400     |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`              | POST /acp + управление SSE подключения/сессии                                          | ~300     |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`          | Отображение JSON-RPC уведомлений → DaemonEvent                                         | ~150     |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`        | Опциональная обёртка: переподключение + откат                                          | ~150     |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`                  | Конструктор + 6 мест `_fetch` + переработка `subscribeEvents`                          | ~40 нетто |
| `packages/sdk-typescript/src/daemon/index.ts`                         | Экспорт новых типов                                                                    | ~10      |
| `packages/cli/src/serve/server.ts`                                    | Добавление поля `transports` в `GET /capabilities`                                     | ~5       |
| `packages/sdk-typescript/src/daemon/types.ts`                         | Добавление `transports` в тип `DaemonCapabilities`                                     | ~3       |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx`     | Добавление опционального пропа `transport`, передача в `DaemonClient`                  | ~5       |
| Тесты                                                                 | Модульные + интеграционные тесты транспортов                                           | ~200     |

**Обратная совместимость**: `new DaemonClient({ baseUrl, token })` без
`transport` = идентичное поведение REST+SSE. Все существующие тесты проходят без изменений.

---

## 7. Верификация

1. **Обратная совместимость**: `npm run test` для sdk-typescript и webui — никаких
   изменений в тестах не требуется. `new DaemonClient({ baseUrl, token })` = идентичное поведение.
2. **Извлечение RestSseTransport**: побитово эквивалентное поведение SSE подтверждено
   существующим набором тестов.
3. **AcpWsTransport**: интеграционный тест с подключением к реальному демону через WS. Проверить:
   - `subscribeEvents` выдаёт те же формы `DaemonEvent`, что и REST SSE
   - ветвление prompt 202/200 работает с синтезированным Response
   - голосование разрешений корректно проходит в обе стороны
   - `connected` переходит в `false` при разрыве WS
   - сигнал отмены на prompt → WS отправляет RPC session/cancel
4. **AcpHttpTransport**: та же верификация, что и для WS, но через HTTP+SSE.
5. **Автоопределение**: `negotiate()` возвращает лучший транспорт; откат к REST при сбое WS.
6. **Откат во время выполнения**: `AutoReconnectTransport` ловит `DaemonTransportClosedError`,
   перестраивает транспорт, потребитель вызывает `session/load` для ресинхронизации.
7. **Провайдер**: `DaemonWorkspaceProvider` с пропом `transport` — ChatView и
   TerminalView оба читают из единого хранилища.
8. **Сквозной сценарий**: Сторонний разработчик передаёт `transport={new AcpWsTransport(url, token)}`
   в `DaemonWorkspaceProvider`. Все SDK-хуки и хранилище транскрипта работают без изменений.

---

## 8. Риски

| Риск                                                        | Смягчение                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Поддержка таблицы отображения URL→JSON-RPC                   | Таблица размещена вместе с транспортом; изменение маршрутов демона требует обновления транспорта                                     |
| Точность синтезированного Response ACP WS                    | Предоставить вспомогательную функцию `syntheticResponse(status, json)`; документировать контракт (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Монотонность `DaemonEvent.id` для WS                         | JSON-RPC уведомления ACP-сервера содержат идентификатор события; транспорт отображает его напрямую                                  |
| Prompt 202 против 200 для WS                                 | Транспорт отображает JSON-RPC ответ → 200 с телом результата (блокирующий путь); события всё ещё поступают через `subscribeEvents`  |
| Обнаружение разрыва WS-соединения                            | `connected: boolean` + `DaemonTransportClosedError`, возбуждаемое из `fetch`                                                        |
