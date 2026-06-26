# Проект: самовосстановление `clientId` при ошибке `invalid_client_id` (DaemonSessionClient)

- **Дата:** 2026-06-24
- **Компонент:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Зависит от:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **слит** (`84745d0f0`)
- **Статус:** Реализовано (построено на основе слитого PR #5784)

## Проблема

После перезапуска демона (или перезагрузки сессии) внутрипроцессная регистрация клиента в демоне очищается. Фронтенд, который всё ещё хранит старый `clientId`, назначенный сервером, отправит `POST /session/:id/prompt` с этим устаревшим идентификатором. `resolveTrustedClientId` в bridge не распознаёт его и отклоняет запрос с ошибкой `InvalidClientIdError`.

Наблюдался производственный инцидент (trace `a76a31fe…`, лог демона 15:24): prompt был отправлен от `client_d019b847`, в то время как сессия была (пере)загружена под другим идентификатором `client_ac36fac9`, поэтому клиент, отправляющий prompt, никогда не был зарегистрирован. UI оставался в состоянии "处理中" бесконечно, так как сбой никогда не отображался как терминальное событие оборота.

PR #5784 исправляет половину _отображения_: `invalid_client_id` теперь выбрасывается на **этапе admission**, так что `POST /session/:id/prompt` возвращает синхронную ошибку `400 invalid_client_id` (без `promptId`) вместо `202`, за которым следует тихий асинхронный сбой. Данный проект добавляет половину _самовосстановления_: когда SDK получает этот `400`, он повторно регистрируется, чтобы получить свежий `clientId`, и один раз повторяет отправку prompt, так что оборот продолжается без необходимости ручной повторной отправки пользователем.

## Область применения

Входит в область (только SDK, `DaemonSessionClient`):

- Обнаружение `invalid_client_id` при вызове admission prompt.
- Повторная регистрация клиента в (уже восстановленной) сессии для получения нового `clientId`, назначенного сервером.
- Повтор prompt **один раз** с новым `clientId`.

Явно не входит в область (YAGNI):

- Переподключение SSE-потока — остаётся существующей ответственностью уровня приложения (приложение dataworks уже управляет логикой `reloadSession`/reconnect). `invalid_client_id` появляется только при вызове admission, никогда при ожидании SSE.
- Самовосстановление для других методов, использующих `clientId` (`btw`, `shell`, сообщение в середине оборота, `cancel`, `heartbeat`). Самовосстанавливается только `prompt()`.
- Сохранение `clientId` между перезапусками демона.

## Ключевые инварианты (проверено по исходному коду)

1. **Повтор безопасен, потому что `invalid_client_id` — это отклонение на этапе admission.** `resolveTrustedClientId` выполняется внутри `bridge.sendPrompt` _до_ регистрации оборота и до того, как маршрут отправляет `202`. С PR #5784 это выбрасывается синхронно → `400` до принятия → prompt **никогда не выполнялся**. Поэтому повтор не может выполнить сообщение пользователя дважды. Этот инвариант — вся основа безопасности повтора; он зависит от #5784.

2. **`registerClient` никогда не выбрасывает ошибку и всегда возвращает валидный id.** Для неизвестного `requestedClientId` он переходит к `createClientId()` и возвращает свежий `client_<uuid>>. Только `resolveTrustedClientId` (используемый prompt/cancel/…) выбрасывает. Поэтому вызов `load`/`resume` всегда возвращает рабочий `clientId`.

3. **Ответ на восстановление всегда содержит зарегистрированный `clientId`.** Как быстрый путь для существующей записи, так и путь холодного восстановления устанавливают `clientId: registerClient(entry, req.clientId)` в ответе. (Примечание "отражается обратно, только если вызывающий указал clientId" в `types.ts` относится к `HeartbeatResult`, а не к restore.)

4. **Нет утечки attach при перезапуске, и корректность `close()` улучшается.** `resumeSession` делает `attachCount++`. Уменьшение счётчика — `/detach` → `detachClient` (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` → `closeSessionImpl` — **уничтожить всё**: он проверяет clientId через `resolveTrustedClientId` и затем разрушает сессию (`byId.delete`), отбрасывая `attachCount`. Перезапуск демона стирает attach до перезапуска; `reattach()` устанавливает ровно один attach, а последующий `close()`/перезапуск всё уничтожает — нет чистой утечки. Обратите внимание: `closeSessionImpl` также проверяет clientId, поэтому до этого изменения вызов `close()` после перезапуска с устаревшим id сам бы выбросил `InvalidClientIdError`; после `reattach()`, вызванного prompt, `this.clientId` становится валидным, так что `close()` успешен. (`close()` не самовосстанавливается — вне области — но получает косвенную выгоду.)

5. **Изменение инертно без PR #5784.** Демон до #5784 возвращает `202` с последующим асинхронным сбоем, никогда не `400 invalid_client_id`, поэтому предикат никогда не срабатывает и самовосстановление не запускается. Безвредная пустая операция.

## Проектирование

Все изменения ограничены файлом
`packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`.

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

### 2. `reattach(): Promise<void>` — с объединением конкурентных вызовов

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

`this.session` — это поверхностная копия, и `DaemonSession.clientId` не является `readonly`, поэтому мутация на месте допустима. Используется `resume` (не `load`), потому что нужна только повторная регистрация, а не воспроизведение истории.

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

Обернуть только сетевой вызов admission на обоих путях; оставить `reservePromptSlot`/`releaseAdmission` вне обёртки, чтобы локальный слот резервировался один раз и использовался повторно при повторе:

- Блокирующий путь (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Неблокирующий путь:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` читается **внутри** замыкания, так что повтор использует обновлённый id. Всё после admission (регистрация `_pendingPrompts` и сопоставление событий SSE по `promptId`) остаётся без изменений; подписка SSE привязана к `sessionId`, поэтому она переживает изменение `clientId`.

## Обработка ошибок

- Ошибки, отличные от `invalid_client_id` (например, `500`, `SessionNotFoundError`,
  `DaemonPendingPromptLimitError`): немедленно пробрасываются, без `reattach`.
- Сбой `reattach()` (сессия действительно удалена, сетевые проблемы): пробрасывается — пользователь видит реальную ошибку вместо зависания.
- Исчерпание повтора (повтор также `invalid_client_id`): пробрасывается; ограничено одним повтором, без цикла.
- `AbortSignal`: обёрнутый вызов `prompt`/`promptNonBlocking` при входе вызывает `throwIfAborted()`, поэтому повтор после прерывания выбрасывает `AbortError`. (`resumeSession` не имеет параметра сигнала; выполняемый `reattach` не может быть прерван — приемлемо, это один короткий вызов.)

## Известные ограничения

- **Редкий случай индивидуального вытеснения:** если `clientId` вытесняется, пока сессия остаётся в памяти (отзыв утечки / `client_evicted`), `reattach()` добавляет дополнительный attach (`attachCount++`) без соответствующего `/detach`. Поскольку `close()` — уничтожение всего, единственное окно утечки — это сессия, которая была оставлена без явного `close()` и затем не удалена сборщиком мусора из-за застрявшего `attachCount` (ограничено одной сессией). Реалистичный инцидент — это случай перезапуска демона, который корректен. Задокументировано, а не исправлено инженерными методами.

## Тестирование (TDD)

Используйте существующий harness `recordingFetch` в
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, перехватывая запросы по URL через реальный `DaemonClient` (использует реальное отображение `failOnError` → `DaemonHttpError`).

1. **Неблокирующее самовосстановление:** первый `POST /session/s-1/prompt` → `400
{code:'invalid_client_id'}`; `POST /session/s-1/resume` → свежий
   `clientId: 'client-2'`; второй prompt → `202`. Утверждение: prompt разрешается, второй запрос prompt содержит заголовок `x-qwen-client-id: client-2`, resume вызван один раз.
2. **Блокирующее самовосстановление** (`subscriptionActive` false): то же самое, через блокирующий путь `prompt` (`200`/`202`+завершение оборота при повторе).
3. **Повтор ограничен:** prompt → `400 invalid_client_id` дважды → ошибка пробрасывается (утверждение: resume вызван один раз, ошибка — `DaemonHttpError` invalid_client_id).
4. **Ошибка, не связанная с invalid, не повторяется:** prompt → `500` → немедленно пробрасывается, `resume` **никогда** не вызван.
5. **Сбой reattach пробрасывается:** prompt → `400 invalid_client_id`; resume → `404`/`500` → эта ошибка пробрасывается.
6. **Объединение конкурентных вызовов:** два одновременных вызова `prompt()` оба получают `400 invalid_client_id` → `resume` вызывается ровно один раз; оба повтора используют новый id.