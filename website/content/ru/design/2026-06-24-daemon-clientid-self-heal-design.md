# Дизайн: самовосстановление clientId при `invalid_client_id` (DaemonSessionClient)

- **Дата:** 2026-06-24
- **Компонент:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Зависит от:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **смержен** (`84745d0f0`)
- **Статус:** Реализовано (построено на основе смерженного #5784)

## Проблема

После перезапуска демона (или перезагрузки сессии) регистрация клиентов в памяти демона очищается. Фронтенд, который все еще хранит старый назначенный сервером `clientId`, отправит `POST /session/:id/prompt` с этим устаревшим id. Метод `resolveTrustedClientId` в bridge не распознает его и отклоняет промпт с ошибкой `InvalidClientIdError`.

Зафиксированный производственный инцидент (trace `a76a31fe…`, лог демона 15:24): промпт был отправлен от `client_d019b847`, в то время как сессия была (пере)загружена под другим id `client_ac36fac9`, поэтому клиент, отправивший промпт, никогда не был зарегистрирован. UI бесконечно отображал статус «处理中», поскольку сбой не был передан как терминальное событие хода.

PR #5784 исправляет половину задачи, связанную с _отображением_ ошибки: `invalid_client_id` теперь выбрасывается на **этапе допуска**, поэтому `POST /session/:id/prompt` возвращает синхронный ответ `400 invalid_client_id` (без `promptId`) вместо `202` с последующим тихим асинхронным сбоем. Данный дизайн добавляет вторую половину — _самовосстановление_: когда SDK получает этот `400`, он повторно регистрируется для получения нового `clientId` и повторяет отправку промпта один раз, чтобы ход продолжился без необходимости повторной отправки пользователем.

## Область применения

В области применения (только SDK, `DaemonSessionClient`):

- Обнаружение `invalid_client_id` при вызове допуска промпта.
- Повторная регистрация клиента в (уже восстановленной) сессии для получения нового назначенного сервером `clientId`.
- Повторная отправка промпта **один раз** с новым `clientId`.

Явно вне области применения (YAGNI):

- Переподключение SSE-потока — остается существующей обязанностью слоя приложения (приложение dataworks уже владеет логикой `reloadSession`/переподключения). `invalid_client_id` проявляется только при вызове допуска, никогда при ожидании SSE.
- Самовосстановление для других методов, использующих `clientId` (`btw`, `shell`, сообщение в середине хода, `cancel`, `heartbeat`). Самовосстановление работает только для `prompt()`.
- Сохранение `clientId` между перезапусками демона.

## Ключевые инварианты (проверено по исходному коду)

1. **Повторная попытка безопасна, потому что `invalid_client_id` — это отклонение на этапе допуска.** `resolveTrustedClientId` выполняется внутри `bridge.sendPrompt` _до_ регистрации хода и до того, как роутер вернет `202`. С PR #5784 это выбрасывает исключение синхронно → `400` до принятия → промпт **никогда не выполняется**. Следовательно, повторная попытка не может привести к двойному выполнению сообщения пользователя. Этот инвариант является всей основой безопасности повторной попытки; он зависит от #5784.

2. **`registerClient` никогда не выбрасывает исключение и всегда возвращает валидный id.** Для неизвестного `requestedClientId` он переходит к `createClientId()` и возвращает новый `client_<uuid>`. Исключение выбрасывает только `resolveTrustedClientId` (используется в prompt/cancel/…). Поэтому вызов `load`/`resume` всегда возвращает пригодный для использования `clientId`.

3. **Ответ при восстановлении всегда содержит зарегистрированный `clientId`.** И быстрый путь для существующей записи, и путь холодного восстановления устанавливают `clientId: registerClient(entry, req.clientId)` в ответе. (Примечание "возвращается только если вызывающий код передал clientId" в `types.ts` относится к `HeartbeatResult`, а не к восстановлению.)

4. **Отсутствие чистых утечек attach в сценарии перезапуска, а также повышение корректности `close()`.** `resumeSession` выполняет `attachCount++`. Уменьшение счетчика ссылок происходит через `/detach` → `detachClient` (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` → `closeSessionImpl` работает по принципу **уничтожить всё**: он валидирует clientId через `resolveTrustedClientId`, а затем разрушает сессию (`byId.delete`), сбрасывая вместе с ней `attachCount`. Перезапуск демона очищает attach до перезапуска; `reattach()` восстанавливает ровно один attach, а последующий `close()`/перезапуск уничтожает всё целиком — чистых утечек нет. Обратите внимание, что `closeSessionImpl` также валидирует clientId, поэтому до этого изменения `close()` после перезапуска с устаревшим id сам бы выбрасывал `InvalidClientIdError`; после `reattach()`, вызванного промптом, `this.clientId` становится валидным, и `close()` успешно завершается. (Сам `close()` не подвержен самовосстановлению — это вне области применения — но получает косвенную выгоду.)

5. **Изменение инертно без PR #5784.** Демон до версии #5784 возвращает `202` с последующим асинхронным сбоем, но никогда `400 invalid_client_id`, поэтому предикат никогда не срабатывает и самовосстановление не запускается. Безопасная холостая операция (no-op).

## Дизайн

Все изменения ограничены файлом `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`.

### 1. `isInvalidClientId(err): boolean`

```ts
function isInvalidClientId(err: unknown): boolean {
  return (
    err instanceof DaemonHttpError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { code?: unknown }).code === 'invalid_client_id'
  );
}
```

Требуется импорт `DaemonHttpError` из `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — single-flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Coalesce concurrent prompts that all observed invalid_client_id so we
  // re-register exactly once (avoids orphaning extra clientIds / attachCount).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Pass no clientId so the bridge issues a fresh registration instead of
    // validating the stale one. Pass workspaceCwd explicitly: restoreSession
    // calls resolveWorkspaceKey(req.workspaceCwd) before the existing-entry
    // fast path, and that helper throws on a non-absolute/undefined path.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // only refresh clientId; leave the SSE
                                      // cursor (lastSeenEventId) and state alone
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` — это поверхностная копия, а `DaemonSession.clientId` не является `readonly`, поэтому мутация на месте допустима. Используется `resume` (а не `load`), потому что нам нужна только повторная регистрация, а не воспроизведение истории.

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non-invalid_client_id: propagate
    await this.reattach();                  // may throw → propagate
    return await fn();                      // retry exactly once; if it throws
                                            // again (incl. invalid_client_id),
                                            // propagate — no loop
  }
}
```

### 4. Интеграция в `prompt()`

Оберните только сетевой вызов допуска на обоих путях; оставьте `reservePromptSlot`/`releaseAdmission` вне обертки, чтобы локальный слот резервировался один раз и переиспользовался при повторной попытке:

- Блокирующий путь (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Неблокирующий путь:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` считывается **внутри** замыкания, поэтому при повторной попытке подхватывается обновленный id. Всё, что происходит после допуска (регистрация `_pendingPrompts` и сопоставление событий хода SSE по `promptId`), остается без изменений; подписка SSE привязана к `sessionId`, поэтому она переживает изменение `clientId`.

## Обработка ошибок

- Ошибки, отличные от `invalid_client_id` (например, `500`, `SessionNotFoundError`, `DaemonPendingPromptLimitError`): пробрасываются немедленно, без `reattach`.
- Сбой `reattach()` (сессия действительно удалена, проблемы с сетью): пробрасывается — пользователь видит реальную ошибку вместо зависания.
- Исчерпание попыток (повторная попытка также вернула `invalid_client_id`): пробрасывается; ограничено одной повторной попыткой, без цикла.
- `AbortSignal`: обернутые вызовы `prompt`/`promptNonBlocking` вызывают `throwIfAborted()` при входе, поэтому повторная попытка после прерывания выбрасывает `AbortError`. (`resumeSession` не имеет параметра signal; выполняющийся `reattach` нельзя прервать — это приемлемо, так как это один короткий вызов.)

## Известные ограничения

- **Редкий пограничный случай с индивидуальным вытеснением:** если `clientId` вытесняется, пока сессия остается активной в памяти (отзыв при утечке / `client_evicted`), `reattach()` добавляет лишний attach (`attachCount++`) без соответствующего `/detach`. Поскольку `close()` работает по принципу "уничтожить всё", единственное окно утечки — это сессия, которая была заброшена без явного `close()` и затем защищена от idle-GC застрявшим `attachCount` (ограничено одной сессией). Реалистичный инцидент — это случай перезапуска демона, который обрабатывается чисто. Задокументировано, а не спроектировано для обхода.

## Тестирование (TDD)

Используйте существующий харнесс `recordingFetch` в `packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, перехватывая запросы по URL через реальный `DaemonClient` (который задействует реальный маппинг `failOnError` → `DaemonHttpError`).

1. **Неблокирующее самовосстановление:** первый `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`; `POST /session/s-1/resume` → новый `clientId: 'client-2'`; второй промпт → `202`. Утверждение: промпт успешно завершается, второй запрос промпта содержит `x-qwen-client-id: client-2`, resume вызван один раз.
2. **Блокирующее самовосстановление** (`subscriptionActive` false): то же самое, через блокирующий путь `prompt` (`200`/`202` + завершение хода при повторной попытке).
3. **Ограничение повторных попыток:** промпт → `400 invalid_client_id` дважды → ошибка пробрасывается (утверждение: resume вызван один раз, ошибка — `DaemonHttpError` invalid_client_id).
4. **Невалидные ошибки не повторяются:** промпт → `500` → пробрасывается немедленно, `resume` **никогда** не вызывается.
5. **Проброс сбоя reattach:** промпт → `400 invalid_client_id`; resume → `404`/`500` → эта ошибка пробрасывается.
6. **Single-flight:** два одновременных вызова `prompt()` оба получают `400 invalid_client_id` → `resume` вызывается ровно один раз; обе повторные попытки используют новый id.