# Design: clientId Self-Heal bei `invalid_client_id` (DaemonSessionClient)

- **Datum:** 2026-06-24
- **Komponente:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Abhängig von:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **gemerged** (`84745d0f0`)
- **Status:** Implementiert (auf Basis des gemergten #5784)

## Problem

Nach einem Daemon-Neustart (oder Session-Reload) wird die In-Memory-Client-Registrierung des Daemons gelöscht. Ein Frontend, das noch eine ältere, vom Server zugewiesene `clientId` hält, sendet `POST /session/:id/prompt` mit dieser veralteten ID. Die `resolveTrustedClientId`-Funktion der Bridge erkennt diese nicht und lehnt den Prompt mit `InvalidClientIdError` ab.

Beobachteter Produktionsvorfall (Trace `a76a31fe…`, Daemon-Log 15:24): Der Prompt wurde von `client_d019b847` gesendet, während die Session unter einer anderen ID `client_ac36fac9` (neu)geladen worden war, sodass der Prompt-sendende Client nie registriert wurde. Die UI blieb unbegrenzt auf "处理中" stehen, da der Fehler nie als finales Turn-Event an die UI kommuniziert wurde.

PR #5784 behebt die _Surfacing_-Hälfte: `invalid_client_id` wird jetzt bei der **Zulassung (Admission)** geworfen, sodass `POST /session/:id/prompt` einen synchronen `400 invalid_client_id` (ohne `promptId`) zurückgibt, anstatt `202` und danach einen stillen asynchronen Fehler. Dieses Design fügt die _Self-Heal_-Hälfte hinzu: Wenn das SDK diesen `400`-Fehler erhält, registriert es sich erneut, um eine frische `clientId` zu erhalten, und wiederholt den Prompt einmalig, sodass der Turn fortgesetzt wird, ohne dass der Benutzer ihn manuell erneut senden muss.

## Umfang

Enthalten (nur SDK, `DaemonSessionClient`):

- Erkennung von `invalid_client_id` beim Prompt-Admission-Aufruf.
- Erneute Registrierung des Clients für die (bereits wiederhergestellte) Session, um eine frische, vom Server zugewiesene `clientId` zu erhalten.
- Erneuter Versuch des Prompts **einmalig** mit der neuen `clientId`.

Ausdrücklich ausgeschlossen (YAGNI):

- SSE-Stream-Reconnection – bleibt in der bestehenden Verantwortung der App-Schicht (die Dataworks-App besitzt bereits die `reloadSession`/Reconnect-Logik). `invalid_client_id` tritt nur beim Admission-Aufruf auf, niemals beim SSE-Warten.
- Self-Heal für andere `clientId`-haltige Methoden (`btw`, `shell`, Mid-Turn-Nachricht, `cancel`, `heartbeat`). Nur `prompt()` führt Self-Heal aus.
- Persistierung der `clientId` über Daemon-Neustarts hinweg.

## Wichtige Invarianten (gegen den Quellcode verifiziert)

1. **Retry ist sicher, da `invalid_client_id` eine Ablehnung zum Admission-Zeitpunkt ist.** `resolveTrustedClientId` wird innerhalb von `bridge.sendPrompt` _vor_ der Registrierung des Turns und _vor_ der Ausgabe von `202` durch die Route ausgeführt. Mit PR #5784 wirft dies synchron → `400` vor der Akzeptanz → der Prompt **wurde nie ausgeführt**. Ein Retry kann daher die Nachricht des Benutzers nicht doppelt ausführen. Diese Invariante ist die gesamte Grundlage für die Sicherheit des Retries; sie hängt von #5784 ab.

2. **`registerClient` wirft niemals eine Exception und liefert immer eine gültige ID.** Für eine unbekannte `requestedClientId` fällt es auf `createClientId()` zurück und gibt eine frische `client_<uuid>` zurück. Nur `resolveTrustedClientId` (verwendet von prompt/cancel/…) wirft eine Exception. Daher gibt ein `load`/`resume`-Aufruf immer eine verwendbare `clientId` zurück.

3. **Die Restore-Antwort enthält immer die registrierte `clientId`.** Sowohl der Fast-Path für vorhandene Einträge als auch der Cold-Restore-Pfad setzen `clientId: registerClient(entry, req.clientId)` in der Antwort. (Der Hinweis "echoed back only when the caller supplied a clientId" in `types.ts` gilt für `HeartbeatResult`, nicht für Restore.)

4. **Kein Netto-Leak von Attachs im Neustart-Szenario, und die Korrektheit von `close()` verbessert sich.** `resumeSession` führt `attachCount++` aus. Der referenzgezählte Dekrement ist `/detach` → `detachClient` (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` → `closeSessionImpl` ist **Destroy-All**: Es validiert die `clientId` über `resolveTrustedClientId` und baut dann die Session ab (`byId.delete`), wobei `attachCount` ebenfalls verworfen wird. Ein Daemon-Neustart löscht den Attach vor dem Neustart; `reattach()` stellt genau einen Attach wieder her, und ein späteres `close()`/Neustart baut alles ab – kein Netto-Leak. Beachte, dass `closeSessionImpl` die `clientId` ebenfalls validiert, sodass vor dieser Änderung ein `close()` nach dem Neustart mit einer veralteten ID selbst `InvalidClientIdError` werfen würde; nach einem durch den Prompt ausgelösten `reattach()` ist `this.clientId` gültig, sodass `close()` erfolgreich ist. (`close()` selbst wird nicht per Self-Heal repariert – nicht im Umfang – profitiert aber indirekt.)

5. **Die Änderung ist ohne PR #5784 wirkungslos.** Ein Daemon vor #5784 gibt `202` und danach einen asynchronen Fehler zurück, niemals `400 invalid_client_id`, sodass das Prädikat niemals übereinstimmt und Self-Heal niemals ausgelöst wird. Unbedenklicher No-Op.

## Design

Alle Änderungen sind auf `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` beschränkt.

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

Erfordert den Import von `DaemonHttpError` aus `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — Single-Flight

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

`this.session` ist eine Shallow Copy und `DaemonSession.clientId` ist nicht `readonly`, daher ist eine In-Place-Mutation gültig. `resume` (nicht `load`) wird verwendet, da wir nur eine erneute Registrierung benötigen, kein History-Replay.

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

### 4. Integration in `prompt()`

Nur den Admission-Netzwerkaufruf auf beiden Pfaden wrappen; `reservePromptSlot`/`releaseAdmission` außerhalb des Wrappers belassen, sodass der lokale Slot einmalig reserviert und über den Retry hinweg wiederverwendet wird:

- Blockierender Pfad (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Nicht-blockierender Pfad:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` wird **innerhalb** der Closure gelesen, sodass der Retry die aktualisierte ID übernimmt. Alles nach der Admission (die `_pendingPrompts`-Registrierung und das SSE-Turn-Event-Matching anhand der `promptId`) bleibt unverändert; das SSE-Abonnement ist an die `sessionId` gebunden, übersteht also die `clientId`-Änderung.

## Fehlerbehandlung

- Nicht-`invalid_client_id`-Fehler (z. B. `500`, `SessionNotFoundError`, `DaemonPendingPromptLimitError`): werden sofort propagiert, kein `reattach`.
- `reattach()`-Fehler (Session wirklich gelöscht, Netzwerk): wird propagiert – der Benutzer sieht einen echten Fehler, anstatt dass der Vorgang hängt.
- Retry aufgebraucht (Retry ebenfalls `invalid_client_id`): wird propagiert; auf einen Retry begrenzt, keine Schleife.
- `AbortSignal`: Der gewrappte `prompt`/`promptNonBlocking`-Aufruf nutzt `throwIfAborted()` beim Eintritt, sodass ein Retry nach einem Abbruch `AbortError` wirft. (`resumeSession` hat keinen Signal-Parameter; ein laufendes `reattach` ist nicht abbrechbar – akzeptabel, da es sich um einen einzelnen, kurzen Aufruf handelt.)

## Bekannte Einschränkungen

- **Seltener Edge-Case bei individueller Eviction:** Wenn eine `clientId` evictet wird, während die Session im Speicher am Leben bleibt (Leak-Revocation / `client_evicted`), fügt `reattach()` einen zusätzlichen Attach (`attachCount++`) ohne passendes `/detach` hinzu. Da `close()` Destroy-All ist, besteht das einzige Leak-Fenster in einer Session, die ohne explizites `close()` aufgegeben und dann durch den festsitzenden `attachCount` (auf eine Session begrenzt) vor der Idle-GC bewahrt wird. Der realistische Vorfall ist der Daemon-Neustart-Fall, der sauber abläuft. Dokumentiert, anstatt eine spezielle Lösung dafür zu entwickeln.

## Testing (TDD)

Verwende das bestehende `recordingFetch`-Harness in `packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, das über einen echten `DaemonClient` nach URL abfängt (testet das echte `failOnError` → `DaemonHttpError`-Mapping).

1. **Non-Blocking Self-Heal:** Erster `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`; `POST /session/s-1/resume` → frische `clientId: 'client-2'`; zweiter Prompt → `202`. Assert: Prompt wird resolved, der zweite Prompt-Request trägt `x-qwen-client-id: client-2`, Resume einmalig aufgerufen.
2. **Blocking Self-Heal** (`subscriptionActive` false): dasselbe, über den blockierenden `prompt`-Pfad (`200`/`202`+Turn-Complete beim Retry).
3. **Retry begrenzt:** Prompt → `400 invalid_client_id` zweimal → der Fehler wird propagiert (Assert: Resume einmalig aufgerufen, Fehler ist `DaemonHttpError` invalid_client_id).
4. **Nicht-invalid-Fehler wird nicht retried:** Prompt → `500` → wird sofort propagiert, `resume` wird **nie** aufgerufen.
5. **Reattach-Fehler wird propagiert:** Prompt → `400 invalid_client_id`; Resume → `404`/`500` → dieser Fehler wird propagiert.
6. **Single-Flight:** Zwei gleichzeitige `prompt()`-Aufrufe erhalten beide `400 invalid_client_id` → `resume` wird exakt einmal aufgerufen; beide Retries verwenden die neue ID.