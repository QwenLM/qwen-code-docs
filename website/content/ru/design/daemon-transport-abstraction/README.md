# Уровень абстракции DaemonTransport

> Целевая ветка: `main`. Автор: arnoo.gao. Дата: 2026-06-12. Статус: **Design v4 — review**.
> Принцип «сначала дизайн» в рамках репозитория: этот документ появляется до PR с реализацией.

---

## 0. Кратко

`DaemonClient` жёстко завязан на REST+SSE. Сторонние интеграции, желающие использовать ACP WebSocket, вынуждены форкать стек провайдера (~8 файлов). Это предложение добавляет **интерфейс `DaemonTransport`** с методами `fetch` + `subscribeEvents`, а также автоопределение и откат во время выполнения, что позволяет подключать транспорты с **нулевыми ломающими изменениями**.

**Общий объём изменений: ~1300 строк** в одном PR. Существующие потребители не затрагиваются — `new DaemonClient({ baseUrl, token })` = текущее поведение.

---

## 1. Предыстория

### 1.1 Текущая архитектура

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← жёстко закодировано
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 открытых методов, каждый из которых строит REST URL и ветвится по HTTP статусам. `fetch` уже можно внедрить через `DaemonClientOptions.fetch`, но `subscribeEvents` содержит встроенную логику SSE (проверка content-type, парсинг SSE, таймаут соединения), которую нельзя заменить одной лишь инъекцией fetch.

### 1.2 Проблема для сторонних разработчиков

Когда сторонний разработчик (например, `agent-web`) создаёт `AcpSessionProvider` для использования WebSocket вместо REST+SSE:

- **Если заменить** `DaemonSessionProvider`: компоненты, читающие `DaemonStoreContext` (например, TerminalView), теряют контекст → краш.
- **Если оставить оба провайдера**: два источника событий, два хранилища, рассинхронизация.
- **Если внедрять события** в SDK store: `DaemonSessionProvider` также подписывается на SSE внутренне → дублирование событий.

**Коренная причина**: смена транспорта требует замены провайдера, потому что `subscribeEvents` в `DaemonClient` жёстко привязан к SSE.

### 1.3 Цель

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → отображает URL+verb в JSON-RPC через WS
  └─ transport.subscribeEvents → демультиплексирует WS уведомления → DaemonEvent
```

Один провайдер, одно хранилище, транспорт — внутренняя деталь. Сторонние разработчики передают `transport` в `DaemonClient`; всё остальное работает без изменений.

---

## 2. Дизайн

### 2.1 Интерфейс

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = без таймаута. undefined = значение по умолчанию транспорта.
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
   * - Response ДОЛЖЕН поддерживать .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status ДОЛЖЕН быть точным HTTP статус-кодом
   *   (200, 201, 202, 204, 404, и т.д.)
   * - Тела ошибок ДОЛЖНЫ сохранять структурированную форму демона
   * - Вызывается без предварительной настройки; транспорт обрабатывает инициализацию
   *   внутренне (ленивая инициализация / отложенная инициализация)
   * - Выбрасывает DaemonTransportClosedError, когда соединение мертво
   * - При прерывании через init.signal: для запросов prompt транспорт ДОЛЖЕН
   *   отменить выполняющийся prompt на проводе (WS: отправить session/cancel
   *   RPC; HTTP: прервать fetch). Для обычных запросов прерывание только
   *   отклоняет/отменяет ожидающий запрос без побочных эффектов.
   *   Ожидающий ответ отклоняется с AbortError.
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
   * - События с id ДОЛЖНЫ иметь монотонные целочисленные id; синтетические/терминальные
   *   фреймы (например, stream_error) МОГУТ опускать id (DaemonEvent.id опционален)
   * - ДОЛЖНЫ доставляться ВСЕ типы событий (сессия + рабочее пространство) в одном потоке
   * - Прерывание сигнала ДОЛЖНО останавливать только этот генератор, НЕ соединение
   * - Когда соединение умирает, все ожидающие генераторы ДОЛЖНЫ выбрасывать
   *   DaemonTransportClosedError (транспорт хранит ссылки на генераторы)
   * - ДОЛЖЕН применять connectTimeoutMs только к фазе соединения
   * - Транспорт ДОЛЖЕН объявить, поддерживается ли воспроизведение по lastEventId;
   *   если нет, потребитель ДОЛЖЕН использовать session/load для полной ресинхронизации
   *   при переподключении
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Идентификатор транспорта для исчерпывающего переключения. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Поддерживает ли этот транспорт воспроизведение на основе Last-Event-ID
   *  при переподключении. Если false, потребитель ДОЛЖЕН использовать session/load
   *  для полной ресинхронизации. */
  readonly supportsReplay: boolean;

  /** false после потери соединения или вызова dispose(). */
  readonly connected: boolean;

  /** Идемпотентный демонтаж. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Почему два метода (fetch + subscribeEvents), а не только fetch

`subscribeEvents` имеет принципиально различную семантику провода в зависимости от транспорта:

| Транспорт | Механизм провода                                                   |
| --------- | ------------------------------------------------------------------ |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP  | `GET /acp` (SSE в рамках сессии) → развёртывание JSON-RPC уведомления |
| ACP WS    | Демультиплексирование уведомлений из общего сокета по sessionId     |

Форсирование этих механизмов через «отверстие» формы fetch требует повторного кодирования/декодирования SSE (WS → фальшивый SSE текст → `parseSseStream` → DaemonEvent) — расточительно и ненадёжно.

Все остальные 66 методов работают через `fetch`, потому что они следуют семантике запрос→ответ независимо от транспорта.

### 2.3 Почему на уровне fetch, а не dispatch методов

67 методов DaemonClient содержат ветвление по HTTP для каждого метода:

- `prompt()`: проверка 202 vs 200
- `deleteWorkspaceAgent()`: 204 vs 404 с анализом тела
- `respondToPermission()`: 200 vs 404 для обнаружения состояния гонки
- 6 методов обходят `fetchWithTimeout`, вызывая `_fetch` напрямую

Интерфейс уровня dispatch методов (`request<T>(method, params)`) заставит дублировать всю эту логику в каждом транспорте. Уровень fetch оставляет DaemonClient без изменений.

### 2.4 Изменения в DaemonClient (~40 строк)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Сохранено
  fetchTimeoutMs?: number; // Сохранено
  transport?: DaemonTransport; // НОВОЕ — опциональное переопределение
}
```

Внутренние изменения:

- Конструктор: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: делегирование в `this.transport.fetch(url, init, { timeout })`
- 6 мест прямого вызова `this._fetch` (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): замена на
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: исчерпывающий switch по `this.transport.type`:
  - `'rest'`: делегирование в `this.transport.subscribeEvents(sessionId, opts)`
  - default: то же делегирование (каждый транспорт обрабатывает свой формат провода)
- Удаление поля `private _fetch` (заменено транспортом)

### 2.5 Точка внедрения провайдера

`DaemonWorkspaceProvider` и `DaemonSessionProvider` оба конструируют `DaemonClient` внутри. Чтобы сторонние разработчики могли внедрить транспорт, не обходя провайдер:

```typescript
// DaemonWorkspaceProvider — добавить опциональное свойство transport
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // НОВОЕ — передаётся в DaemonClient
  // ...остальные свойства
}

// DaemonSessionProvider — наследует из контекста рабочего пространства
// Свойство transport не нужно; читается из контекста рабочего пространства
```

Когда `transport` предоставлен, провайдер передаёт его в `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Когда опущен: текущее поведение (REST+SSE). ~5 строк изменений в провайдере.

### 2.5 RestSseTransport (~80 строк)

Оборачивает `globalThis.fetch` + извлекает текущую SSE логику из `DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE поддерживает Last-Event-ID
  readonly connected = true; // REST не сохраняет состояние

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Текущая логика DaemonClient.subscribeEvents перенесена сюда:
    // - построение URL из this.baseUrl + sessionId
    // - установка заголовка Authorization из this.token
    // - таймаут соединения из opts.connectTimeoutMs
    // - fetch → проверка content-type → parseSseStream → yield
  }

  dispose() {} // нет операции
}
```

### 2.6 Внутренности ACP транспортов

**AcpWsTransport** (~400-600 строк):

- Ленивая инициализация: первый вызов `fetch` открывает WS + отправляет `initialize`
- Таблица отображения URL→JSON-RPC: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Мультиплексор запросов: `Map<id, {resolve, reject}>` для ожидающих запросов
- `subscribeEvents`: фильтрация общего потока уведомлений по sessionId
- `connected`: отслеживает readyState WS
- `supportsReplay`: false (WS не имеет Last-Event-ID; потребитель должен использовать `session/load`)
- Синтезирует объекты `Response` с корректными `.status`/`.json()`/`.text()`

**AcpHttpTransport** (~800-1000 строк):

- Ленивая инициализация: первый вызов `fetch` отправляет `POST /acp {initialize}`
- Управляет SSE потоками в рамках соединения и сессии внутренне
- То же отображение URL→JSON-RPC + корреляция запросов
- `supportsReplay`: true (SSE сессии поддерживает Last-Event-ID)

### 2.7 Автоопределение транспорта

Сервер сообщает поддерживаемые транспорты в `GET /capabilities`:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...остальные поля возможностей...
}
```

SDK предоставляет одноразовую статическую фабрику:

```typescript
// Зондирование один раз до рендера React, никогда не переключается во время сессии
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Возвращает наилучший доступный: acp-ws > acp-http > rest (запасной вариант)
```

Реализация:

1. `GET /capabilities` → прочитать массив `transports`
2. Если `acp-ws` в списке → попробовать WS upgrade; при успехе вернуть `AcpWsTransport`
3. Если WS не удался или нет в списке → попробовать `acp-http`; при успехе вернуть `AcpHttpTransport`
4. Запасной вариант → `RestSseTransport`

Никакие существующие API не затрагиваются: `GET /capabilities` добавляет новое поле (аддитивно), существующие потребители игнорируют неизвестные поля.

### 2.8 Откат во время выполнения (WS → REST при отключении)

Когда не-REST транспорт отключается во время сессии:

```
AcpWsTransport (connected=true)
  │
  ├── WS разрывается (сеть, перезапуск сервера, таймаут бездействия)
  │
  ├── connected = false
  ├── Все ожидающие вызовы fetch() → отклоняются с DaemonTransportClosedError
  ├── Все генераторы subscribeEvents → выбрасывают DaemonTransportClosedError
  │
  └── Потребитель (Provider / сторонний код) обнаруживает отключение:
        1. Создаёт новый RestSseTransport (гарантированно работает, если демон запущен)
        2. Создаёт новый DaemonClient({ transport: newTransport })
        3. Для каждой активной сессии: session/load для повторного присоединения
        4. Возобновляет подписку на события
```

**Ключевое ограничение**: откат во время выполнения — **управляется потребителем, а не внутренним механизмом транспорта**. Транспорт не переключает протоколы молча — он громко сообщает об ошибке (`DaemonTransportClosedError`), и потребитель решает, нужно ли перестраиваться.

Обоснование:

- WS teardown уничтожает все принадлежащие сессии на стороне сервера (`registry.delete` → `conn.destroy`). Молчаливое переключение скрыло бы эту потерю данных.
- `session/load` повторно присоединяется к существующей bridge-сессии (транскрипты сохраняются), но выполняющийся prompt прерывается. Потребитель должен обработать это явно (повторная попытка или отображение пользователю).
- Восстановления `Last-Event-ID` между транспортами пока нет (Фаза 4). События между отключением и переподключением могут быть потеряны. Потребитель должен запросить полную ресинхронизацию состояния через `session/load` (которая воспроизводит историю).

**AutoReconnectTransport** (~150 строк, опциональная обёртка):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // При DaemonTransportClosedError от внутреннего транспорта:
  // 1. Попытаться заново создать предпочитаемый транспорт
  // 2. Если предпочитаемый не удаётся, откатиться к REST
  // 3. Переинициализировать соединение
  // Вызывающий код всё равно должен выполнить session/load — эта обёртка
  // обрабатывает только переподключение на уровне транспорта, не сессии.
}
```

Эта обёртка опциональна. Существующие потребители, не желающие авто-переподключения, просто ловят `DaemonTransportClosedError` и обрабатывают его самостоятельно.

**Влияние на существующую функциональность**: нулевое. Весь код автоопределения и отката является аддитивным и опциональным. `new DaemonClient({ baseUrl, token })` без `transport` = текущее REST поведение, без автоопределения, без логики отката.

---

## 3. Аудит ломающих изменений

### Вердикт: нулевые ломающие изменения

| Публичное API                          | Изменение                                 | Ломающее? |
| -------------------------------------- | ----------------------------------------- | :-------: |
| `new DaemonClient({ baseUrl, token })` | Без изменений                             |    ❌     |
| `DaemonClientOptions.*`                | Все сохранены, добавлен `transport`       |    ❌     |
| `DaemonHttpError`                      | Без изменений                             |    ❌     |
| `DaemonSessionClient`                  | Нулевые изменения (делегирует в DaemonClient) | ❌     |
| Все экспортируемые типы (100+)         | Без изменений                             |    ❌     |

### Влияние на каждого потребителя

| Потребитель                       | Влияние                                  |
| -------------------------------- | ---------------------------------------- |
| webui (25 файлов)                | Нулевые изменения в коде                 |
| web-shell (4 файла)              | Нулевые изменения в коде                 |
| vscode-ide-companion (1 файл)    | Нулевые изменения в коде                 |
| Сторонние разработчики           | Нулевые для REST; передают `transport` для ACP |

---

## 4. Дизайн-решения

| Решение                                               | Обоснование                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` на транспорте, а не только `fetch`  | Повторное кодирование SSE через fetch расточительно и ненадёжно                                                                                                      |
| `connected: boolean` на транспорте                    | Цикл переподключения провайдера должен различать «транспорт мёртв» и «временная 500»                                                                                |
| Ленивая инициализация (не явный `connect()`)          | Сохраняет синхронность конструирования DaemonClient; конструктору `RestSseTransport` по умолчанию не нужна инициализация                                             |
| Автоопределение одноразовое, не посреди сессии        | `negotiate()` зондирует один раз при запуске; откат во время выполнения управляется потребителем через `DaemonTransportClosedError`, а не молчаливым внутренним переключением |
| Нет предварительной таксономии ошибок                 | ACP транспорты отображают ошибки в эквивалентные HTTP-статусы внутренне; `DaemonHttpError` работает как есть                                                        |
| Провайдер получает свойство `transport`               | `DaemonWorkspaceProvider` получает опциональное свойство `transport` (~5 строк), передаётся в конструктор `DaemonClient`. Сторонние разработчики устанавливают это свойство; его пропуск = текущее REST поведение |

---

## 5. Рассмотренные альтернативы

### 5.1 Кастомная инъекция fetch (без нового интерфейса)

Передать `fetch` на основе WS через существующий `DaemonClientOptions.fetch`.

**Отклонено**: `subscribeEvents` проверяет `content-type: text/event-stream` и использует `parseSseStream`. Кастомный fetch должен перекодировать WS фреймы в SSE текст, затем SDK декодирует их обратно — расточительный круговорот кодирования-декодирования. Кроме того, `capabilities()` и `initialize` имеют разные формы ответа, требующие слоя отображения форматов.

### 5.2 Полный формальный интерфейс (4 PR, ~2750 строк)

Таксономия ошибок → Интерфейс → AcpHttp → AcpWs как отдельные PR.

**Отклонено**: переусложнение. Таксономия ошибок не нужна (ACP транспорты могут отображать ошибки в эквивалентные HTTP-статусы). Отдельные PR увеличивают затраты на переключение контекста ревью для одной целостной абстракции.

### 5.3 Двойной провайдер с BridgeContext

Параллельные `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`.

**Отклонено**: вызывает рассинхронизацию хранилищ, требует ~8 файлов, не может работать без изменений в SDK.

---

## 6. План реализации (один PR)

Все изменения в одном PR. Примерно ~1300 строк всего.

| Файл                                                              | Изменение                                                                  | Строки   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | Интерфейс + типы + `DaemonTransportClosedError` + фабрика `negotiate()`   | ~110     |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | Оборачивает `globalThis.fetch` + SSE логика, извлечённая из DaemonClient   | ~80      |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WS мультиплексор + отображение URL→JSON-RPC + корреляция запросов         | ~400     |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + управление SSE соединения/сессии                              | ~300     |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | Отображение JSON-RPC уведомления → DaemonEvent                            | ~150     |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | Опциональная обёртка: переподключение + откат                             | ~150     |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | Конструктор + 6 мест `_fetch` + переписывание subscribeEvents              | ~40 net  |
| `packages/sdk-typescript/src/daemon/index.ts`                     | Экспорт новых типов                                                       | ~10      |
| `packages/cli/src/serve/server.ts`                                | Добавить поле `transports` в `GET /capabilities`                          | ~5       |
| `packages/sdk-typescript/src/daemon/types.ts`                     | Добавить `transports` в тип `DaemonCapabilities`                          | ~3       |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | Добавить опциональное свойство `transport`, передать в `DaemonClient`     | ~5       |
| Тесты                                                             | Модульные + интеграционные тесты транспорта                               | ~200     |

**Обратная совместимость**: `new DaemonClient({ baseUrl, token })` без `transport` = идентичное REST+SSE поведение. Все существующие тесты проходят без изменений.

---

## 7. Верификация

1. **Обратная совместимость**: `npm run test` в sdk-typescript и webui — нулевые изменения в тестах. `new DaemonClient({ baseUrl, token })` = идентичное поведение.
2. **Извлечение RestSseTransport**: побитово эквивалентное SSE поведение подтверждено существующим набором тестов.
3. **AcpWsTransport**: интеграционный тест с подключением к реальному демону через WS. Проверить:
   - `subscribeEvents` выдаёт те же формы `DaemonEvent`, что и REST SSE
   - Ветвление prompt 202/200 работает с синтезированным Response
   - Голосование за разрешение проходит корректно
   - `connected` переходит в `false` при падении WS
   - Сигнал прерывания на prompt → WS отправляет RPC session/cancel
4. **AcpHttpTransport**: та же верификация, что для WS, но через HTTP+SSE.
5. **Автоопределение**: `negotiate()` возвращает лучший транспорт; откат к REST при ошибке WS.
6. **Откат во время выполнения**: `AutoReconnectTransport` перехватывает `DaemonTransportClosedError`, перестраивает транспорт, потребитель вызывает `session/load` для ресинхронизации.
7. **Провайдер**: `DaemonWorkspaceProvider` со свойством `transport` — ChatView и TerminalView оба читают из единого хранилища.
8. **End-to-end**: сторонний разработчик передаёт `transport={new AcpWsTransport(url, token)}` в `DaemonWorkspaceProvider`. Все SDK-хуки и хранилище транскриптов работают без изменений.
---

## 8. Риски

| Риск                                    | Смягчение                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Поддержка таблицы сопоставления URL→JSON-RPC | Таблица находится вместе с транспортом; изменения маршрутов демона требуют обновления транспорта                        |
| Точность синтезированного ответа ACP WS | Предоставьте вспомогательную функцию `syntheticResponse(status, json)`; задокументируйте контракт (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Монотонность `DaemonEvent.id` для WS    | Уведомления JSON-RPC сервера ACP содержат идентификатор события; транспорт предоставляет его напрямую                    |
| Ответ 202 vs 200 для WS                 | Транспорт преобразует JSON-RPC ответ → 200 с телом результата (блокирующий путь); события по-прежнему поступают через `subscribeEvents` |
| Обнаружение разрыва соединения WS       | `connected: boolean` + `DaemonTransportClosedError` выбрасывается из `fetch`                                             |