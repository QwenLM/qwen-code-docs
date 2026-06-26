# Async Memory Recall — Спецификация дизайна

**Дата:** 2026-05-15
**Статус:** Утверждено
**Связанные задачи:** #3761, #3759
**Связанные PR:** #3814, #3866

---

## Проблема

`relevanceSelector.ts` использует `AbortSignal.timeout(1_000)` (добавлен в #3866). При холодном старте первого сеанса qwen3.5-flash в среднем занимает ~908 мс — что постоянно достигает порога в 1 с. Внешний дедлайн в 2,5 с в `resolveAutoMemoryWithDeadline` означает, что каждый UserQuery может блокироваться до 2,5 с, даже если recall всегда завершается неудачей.

Коренная причина: основной путь запроса главного агента `await` ожидает результат recall перед отправкой модели. Любая задержка в боковом запросе recall напрямую увеличивает видимую пользователем задержку.

---

## Дизайн

### Основная идея

Запускать recall при UserQuery и никогда не ожидать его. Использовать результат в двух оппортунистических точках — какая сработает первой:

1. **Точка потребления UserQuery** — синхронная проверка `settledAt !== null` непосредственно перед `turn.run()`. Нулевое ожидание: если уже завершён — используем, если нет — пропускаем.
2. **Точка внедрения ToolResult** — та же проверка на каждом обороте ToolResult. Внедряет память как `system-reminder`, **добавленный после** частей functionResponse в `requestToSend`, предоставляя модели контекст памяти перед следующим ответом. (Добавить, а не вставить в начало: API Qwen требует, чтобы functionResponse следовал сразу за functionCall модели — см. существующий пропуск `hasPendingToolCall` в IDE-контексте по той же причине.)

Это соответствует шаблону, используемому в upstream Claude Code (`startRelevantMemoryPrefetch` / опрос `settledAt` в `query.ts`).

---

## Структуры данных

### Новый тип `MemoryPrefetchHandle` (в `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Устанавливается promise.finally(). null до завершения promise. */
  settledAt: number | null;
  /** true после того, как память внедрена — предотвращает двойное внедрение. */
  consumed: boolean;
  controller: AbortController;
};
```

### Изменение поля в `GeminiClient`

| Удалить                                                       | Добавить                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## Изменения

### 1. `client.ts` — удалить `resolveAutoMemoryWithDeadline`

Удалить функцию полностью. Она заменяется механизмом флага `settledAt`.

### 2. `client.ts` — путь запуска UserQuery

Заменить вызов `resolveAutoMemoryWithDeadline` на:

```typescript
// Прерываем любой выполняющийся prefetch от предыдущего UserQuery перед установкой
// нового handle (предотвращает зависшие боковые запросы, если пользователь снова вводит текст
// до завершения recall).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Пробрасываем сигнал вызывающего кода в контроллер prefetch, чтобы отмена пользователем
// (Ctrl-C / Esc) соответствующего оборота также завершала боковой запрос recall.
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// нет await — продолжается немедленно
```

### 3. `client.ts` — точка потребления UserQuery (заменяет `await relevantAutoMemoryPromise`)

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // уже завершён, возвращается немедленно
  if (result.prompt) {
    // unshift, не push: размещаем память в начале systemReminders, чтобы
    // она была первой в блоке system-reminder на оборотах UserQuery. (На оборотах
    // ToolResult, наоборот, добавляется в конец requestToSend, чтобы сохранить
    // пару functionCall / functionResponse — см. ниже.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — точка внедрения ToolResult (новая)

После сборки `requestToSend`, перед `turn.run()`, добавить:

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // Добавляем в конец (не в начало), чтобы части functionResponse оставались первыми
      // и пара functionCall/functionResponse модели
      // не нарушалась на нативном пути Gemini.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — пути очистки

Handle освобождается двумя различными механизмами:

**5 мест с прерыванием и очисткой** (prefetch ещё выполняется, прерываем контроллер перед удалением ссылки). Заменить `pendingRecallAbortController?.abort()` + `= undefined` на:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Места: `resetChat()`, досрочный выход `MaxSessionTurns`, досрочный выход `boundedTurns=0`, досрочный выход `SessionTokenLimitExceeded`, досрочный выход управления арены. Сам путь запуска также выполняет такое прерывание-и-замену, когда новый UserQuery поступает во время выполнения предыдущего prefetch.

**2 места только с очисткой** (prefetch уже завершён, и мы его потребляем — контроллер прерывать не нужно, просто удаляем ссылку):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Места: точка потребления UserQuery, точка внедрения ToolResult.

### 6. `relevanceSelector.ts` — удалить `AbortSignal.timeout(1_000)`

Удалить комбинированный `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` и передавать напрямую `callerAbortSignal`.

---

## Сравнение поведения

| Сценарий                                     | До                              | После                                                 |
| -------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| recall завершается до подготовки модели      | внедрение на UserQuery, ~0 ожидания | внедрение на UserQuery, ~0 ожидания                   |
| recall медленный (холодный старт)            | блокировка до 2,5 с             | пропуск UserQuery, внедрение на первом ToolResult     |
| recall истекает по таймауту (1 с)            | прерывание, пустой результат, без памяти | нет жёсткого таймаута; внедрение, когда завершится   |
| нет вызовов инструментов, recall медленный   | блокировка до 2,5 с, затем пропуск | пропуск UserQuery, нет возможности ToolResult — пропуск |
| пользователь отправляет 2-е сообщение до завершения recall | 2-й recall гоняется за 1-м handle | 1-й handle прерывается, когда 2-й UserQuery запускает новый handle |

---

## Вне области рассмотрения

- Изменение формата внедрения памяти с `system-reminder` на вложение `tool-result` (стиль CC)
- Шлюз пропуска по бюджету байт на сессию
- Шлюз пропуска для запросов из одного слова