# Асинхронное извлечение памяти — Спецификация дизайна

**Дата:** 2026-05-15
**Статус:** Утверждено
**Связанные задачи:** #3761, #3759
**Связанные PR:** #3814, #3866

---

## Проблема

`relevanceSelector.ts` использует `AbortSignal.timeout(1_000)` (введено в #3866). При холодных стартах первой сессии qwen3.5-flash в среднем занимает ~908 мс — стабильно попадает в порог 1 с. Внешний дедлайн 2,5 с в `resolveAutoMemoryWithDeadline` означает, что каждый UserQuery может блокироваться до 2,5 с, даже если извлечение всегда завершается неудачей.

Основная причина: основной агентский путь запроса `await`ит результат извлечения перед отправкой модели. Любая медлительность побочного запроса на извлечение напрямую увеличивает видимую пользователем задержку.

---

## Проектирование

### Основная идея

Запускать извлечение при UserQuery и никогда не `await`ить его. Использовать результат в двух оппортунистических точках — сработает та, которая первой выполнится:

1. **Точка потребления UserQuery** — синхронная проверка `settledAt !== null` непосредственно перед `turn.run()`. Нулевое ожидание: если уже выполнился — используем; если нет — пропускаем.
2. **Точка внедрения ToolResult** — та же проверка на каждом такте ToolResult. Внедряет память как `system-reminder`, **добавленный после** частей `functionResponse` в `requestToSend`, предоставляя модели контекст памяти перед следующим ответом. (Добавление, а не вставка в начало: API Qwen требует, чтобы `functionResponse` следовал сразу за `functionCall` модели — см. существующий пропуск `hasPendingToolCall` для контекста IDE по той же причине.)

Это соответствует шаблону, используемому upstream в Claude Code (`startRelevantMemoryPrefetch` / опрос `settledAt` в `query.ts`).

---

## Структуры данных

### Новый тип `MemoryPrefetchHandle` (в `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Устанавливается через promise.finally(). null, пока promise не завершится. */
  settledAt: number | null;
  /** true после внедрения памяти — предотвращает двойное внедрение. */
  consumed: boolean;
  controller: AbortController;
};
```

### Изменение поля в `GeminiClient`

| Удалено                                                       | Добавлено                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `pendingRecallAbortController: AbortController \| undefined`  | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined`   |

---

## Изменения

### 1. `client.ts` — удалить `resolveAutoMemoryWithDeadline`

Полностью удалить эту функцию. Она заменяется механизмом флага `settledAt`.

### 2. `client.ts` — путь запуска UserQuery

Заменить вызов `resolveAutoMemoryWithDeadline` на:

```typescript
// Прерываем любое выполняющееся предварительное извлечение от предыдущего UserQuery
// перед установкой нового дескриптора (предотвращает осиротевшие побочные запросы,
// когда пользователь вводит снова до завершения извлечения).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Передаём сигнал вызывающей стороны в контроллер предварительного извлечения,
// чтобы отмена пользователем (Ctrl-C / Esc) родительского такта также завершила
// побочный запрос на извлечение.
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
      debugLogger.warn('Управляемое предварительное извлечение автоматической памяти не удалось.', error);
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
// нет await — продолжаем немедленно
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
  const result = await prefetchHandle.promise; // уже выполнился, возвращается мгновенно
  if (result.prompt) {
    // unshift, не push: память должна оставаться в начале systemReminders,
    // чтобы она возглавляла блок system-reminder на тактах UserQuery.
    // (На тактах ToolResult, наоборот, добавляется в конец requestToSend для
    // сохранения пар functionCall / functionResponse — см. ниже.)
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
      // и парное соответствие functionCall / functionResponse модели
      // не нарушалось на нативном пути Gemini.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```
### 5. `client.ts` — очистка путей

Дескриптор освобождается двумя различными механизмами:

**5 мест для прерывания и очистки** (предварительная выборка всё ещё ожидает выполнения, прервите контроллер перед удалением ссылки). Замените `pendingRecallAbortController?.abort()` + `= undefined` на:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Места: `resetChat()`, ранний возврат `MaxSessionTurns`, ранний возврат `boundedTurns=0`, ранний возврат `SessionTokenLimitExceeded`, ранний возврат сигнала управления Arena. Сам путь срабатывания также выполняет это прерывание и замену, когда новый UserQuery поступает, пока предыдущая предварительная выборка ещё выполняется.

**2 места только для очистки** (предварительная выборка уже завершена, и мы её потребляем — нет контроллера для прерывания, просто удалите ссылку):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Места: точка потребления UserQuery, точка вставки ToolResult.

### 6. `relevanceSelector.ts` — удалите `AbortSignal.timeout(1_000)`

Удалите объединённый `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` и передавайте напрямую `callerAbortSignal`.

---

## Сравнение поведения

| Сценарий                                     | До                         | После                                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| вызов завершается до подготовки модели           | вставка в UserQuery, ~0 ожидания   | вставка в UserQuery, ~0 ожидания                           |
| медленный вызов (холодный старт)                     | блокировка до 2,5 с              | пропуск UserQuery, вставка при первом ToolResult             |
| истечение времени вызова (1 с)                       | прерывание, пустой результат, без памяти | нет жёсткого тайм-аута; вставка после завершения               |
| нет вызовов инструментов, медленный вызов                   | блокировка до 2,5 с, затем пропуск   | пропуск UserQuery, нет возможности ToolResult — промах       |
| пользователь отправляет 2-е сообщение до завершения вызова | второй вызов соревнуется с первым дескриптором    | первый дескриптор прерван, когда второй UserQuery запускает новый дескриптор |

---

## Вне рамок

- Изменение формата внедрения памяти с `system-reminder` на вложение `tool-result` (стиль CC)
- Проходной шлюз бюджета байтов на сессию
- Проходной шлюз для однословных подсказок
