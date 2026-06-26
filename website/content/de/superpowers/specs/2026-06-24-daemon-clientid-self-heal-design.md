# Entwurf: clientId self-heal bei `invalid_client_id` (DaemonSessionClient)

- **Datum:** 2026-06-24
- **Komponente:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Hängt ab von:** PR #5784 („fix(daemon): Reject stale prompt client admission") — **gemerged** (`84745d0f0`)
- **Status:** Implementiert (auf der gemergten #5784-Basis erstellt)

## Problem

Nach einem Daemon-Neustart (oder Sitzungsneuladen) wird die Client-Registrierung
im Arbeitsspeicher des Daemons gelöscht. Ein Frontend, das immer noch eine ältere
vom Server zugewiesene `clientId` besitzt, sendet `POST /session/:id/prompt`
mit dieser veralteten ID. Die `resolveTrustedClientId` der Bridge erkennt diese
nicht und lehnt den Prompt mit `InvalidClientIdError` ab.

Beobachteter Produktionsvorfall (Trace `a76a31fe…`, Daemon-Log 15:24): der Prompt
wurde von `client_d019b847` gesendet, während die Sitzung unter einer anderen ID
`client_ac36fac9` (neu)geladen wurde, sodass der sendende Client nie registriert
war. Die UI blieb dauerhaft in „处理中", da der Fehler nie als terminales
Turn-Ereignis gemeldet wurde.

PR #5784 behebt die _Meldungs_-Hälfte: `invalid_client_id` wird nun **zum Zeitpunkt
der Zulassung** geworfen, sodass `POST /session/:id/prompt` einen synchronen
`400 invalid_client_id` (ohne `promptId`) zurückgibt, statt `202` mit
stillem asynchronem Fehlschlag. Dieser Entwurf fügt die _Self-Heal_-Hälfte hinzu:
Wenn das SDK diesen `400` empfängt, registriert es sich erneut, um eine frische
`clientId` zu erhalten, und wiederholt den Prompt einmalig, sodass der Turn
fortgesetzt wird, ohne dass der Benutzer manuell erneut senden muss.

## Umfang

Im Umfang (nur SDK, `DaemonSessionClient`):

- Erkennung von `invalid_client_id` beim Aufruf der Prompt-Zulassung.
- Erneute Registrierung des Clients bei der (bereits wiederhergestellten) Sitzung,
  um eine frische, vom Server zugewiesene `clientId` zu erhalten.
- Einmalige Wiederholung des Prompts mit der neuen `clientId`.

Explizit nicht im Umfang (YAGNI):

- SSE-Stream-Wiederverbindung – bleibt die bestehende Verantwortung der
  Anwendungsschicht (die Dataworks-App besitzt bereits die `reloadSession`/Reconnect-
  Logik). `invalid_client_id` tritt nur beim Zulassungsaufruf auf, nie beim
  SSE-Wartevorgang.
- Self-Heal für andere Methoden, die `clientId` verwenden (`btw`, `shell`,
  Mid-Turn-Nachricht, `cancel`, `heartbeat`). Nur `prompt()` heilt sich selbst.
- Persistieren von `clientId` über Daemon-Neustarts hinweg.

## Wichtige Invarianten (gegen Quellcode verifiziert)

1. **Wiederholung ist sicher, da `invalid_client_id` eine Ablehnung zum
   Zulassungszeitpunkt ist.** `resolveTrustedClientId` läuft innerhalb von
   `bridge.sendPrompt` _bevor_ der Turn registriert wird und bevor die Route `202`
   ausgibt. Mit PR #5784 wird dies synchron geworfen → `400` vor der Annahme →
   der Prompt **wurde nie ausgeführt**. Eine Wiederholung kann daher die
   Benutzernachricht nicht doppelt ausführen. Diese Invariante ist die gesamte
   Grundlage dafür, dass die Wiederholung sicher ist; sie hängt von #5784 ab.

2. **`registerClient` wirft nie einen Fehler und liefert immer eine gültige ID.**
   Für eine unbekannte `requestedClientId` fällt es auf `createClientId()` zurück
   und gibt eine frische `client_<uuid>` zurück. Nur `resolveTrustedClientId`
   (verwendet von Prompt/Cancel/…) wirft Fehler. Daher liefert ein `load`/`resume`-
   Aufruf immer eine verwendbare `clientId`.

3. **Die Wiederherstellungsantwort enthält immer die registrierte `clientId`.**
   Sowohl der Schnellpfad bei vorhandenem Eintrag als auch der Kalt-Wiederherstellungs-
   Pfad setzen `clientId: registerClient(entry, req.clientId)` in die Antwort. (Der
   Hinweis „wird nur zurückgesendet, wenn der Aufrufer eine clientId angegeben hat"
   in `types.ts` bezieht sich auf `HeartbeatResult`, nicht auf die Wiederherstellung.)

4. **Kein Netto-Attach-Leck im Neustartszenario, und Korrektheit von `close()`
   verbessert sich.** `resumeSession` führt `attachCount++` aus. Die referenzierte
   Dekrementierung erfolgt über `/detach` → `detachClient` (`attachCount--` +
   `unregisterClient`). `close()` → `DELETE /session/:id` → `closeSessionImpl`
   ist **Alle-zerstören**: es validiert die clientId via `resolveTrustedClientId`
   und reißt dann die Sitzung ab (`byId.delete`), wobei `attachCount` verworfen wird.
   Ein Daemon-Neustart löscht das Pre-Neustart-Attach; `reattach()` stellt genau
   ein Attach wieder her, und ein späteres `close()`/Neustart reißt alles ab –
   kein Netto-Leck. Beachte: `closeSessionImpl` validiert ebenfalls die clientId,
   sodass vor dieser Änderung ein `close()` nach Neustart mit einer veralteten ID
   selbst `InvalidClientIdError` geworfen hätte; nach einem Prompt-ausgelösten
   `reattach()` ist `this.clientId` gültig, also funktioniert `close()`. (`close()`
   heilt sich nicht selbst – nicht im Umfang – profitiert aber indirekt.)

5. **Die Änderung ist ohne PR #5784 wirkungslos.** Ein Daemon vor #5784 gibt
   `202` mit stillem asynchronem Fehlschlag zurück, niemals `400 invalid_client_id`,
   sodass das Prädikat nie zutrifft und Self-Heal nie ausgelöst wird. Harmlose
   Nulloperation.

## Entwurf

Alle Änderungen sind auf
`packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` beschränkt.

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

Erfordert Import von `DaemonHttpError` aus `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — Single-Flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Zusammenführen gleichzeitiger Prompts, die alle invalid_client_id beobachtet
  // haben, sodass wir genau einmal neu registrieren (vermeidet orphanierte
  // zusätzliche clientIds / attachCount).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Keine clientId übergeben, damit die Bridge eine frische Registrierung
    // ausstellt, anstatt die veraltete zu validieren. workspaceCwd explizit
    // angeben: restoreSession ruft resolveWorkspaceKey(req.workspaceCwd) vor
    // dem Schnellpfad bei vorhandenem Eintrag auf, und dieser Helper wirft
    // bei einem nicht-absoluten/undefinierten Pfad einen Fehler.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // nur clientId aktualisieren; SSE-Cursor
                                      // (lastSeenEventId) und Zustand unverändert lassen
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` ist eine flache Kopie und `DaemonSession.clientId` ist nicht
`readonly`, daher ist die In-Place-Mutation gültig. Es wird `resume` (nicht `load`)
verwendet, da wir nur eine erneute Registrierung benötigen, keine
Verlaufswiedergabe.

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non-invalid_client_id: weiterleiten
    await this.reattach();                  // kann Fehler werfen → weiterleiten
    return await fn();                      // genau einmal wiederholen; falls es
                                            // erneut fehlschlägt (inkl.
                                            // invalid_client_id), weiterleiten –
                                            // keine Schleife
  }
}
```

### 4. Einbindung in `prompt()`

Nur den Zulassungs-Netzwerkaufruf auf beiden Pfaden umschließen;
`reservePromptSlot`/`releaseAdmission` außerhalb des Wrappers lassen, sodass der
lokale Slot einmal reserviert und bei der Wiederholung wiederverwendet wird:

- Blockierender Pfad (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Nicht blockierender Pfad:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` wird **innerhalb** des Closures gelesen, sodass die Wiederholung
die aktualisierte ID verwendet. Alles nach der Zulassung (die `_pendingPrompts`-
Registrierung und das SSE-Turn-Ereignis-Matching per `promptId`) bleibt unverändert;
das SSE-Abonnement ist per `sessionId` gebunden, überlebt also die `clientId`-Änderung.

## Fehlerbehandlung

- Nicht-`invalid_client_id`-Fehler (z. B. `500`, `SessionNotFoundError`,
  `DaemonPendingPromptLimitError`): sofort weitergeleitet, kein `reattach`.
- Fehlschlag von `reattach()` (Sitzung wirklich verschwunden, Netzwerk):
  weitergeleitet – der Benutzer sieht einen echten Fehler statt eines Hängers.
- Wiederholung erschöpft (Wiederholung ebenfalls `invalid_client_id`):
  weitergeleitet; auf eine Wiederholung begrenzt, keine Schleife.
- `AbortSignal`: Der umschlossene `prompt`/`promptNonBlocking`-Aufruf ruft
  `throwIfAborted()` beim Eintritt auf, sodass eine Wiederholung nach Abbruch
  `AbortError` wirft. (`resumeSession` hat keinen Signal-Parameter; ein laufendes
  `reattach` ist nicht abbrechbar – akzeptabel, es ist ein einzelner kurzer Aufruf.)

## Bekannte Einschränkungen

- **Seltene Einzel-Eviction-Kante:** Wenn eine `clientId` verdrängt wird, während
  die Sitzung im Speicher aktiv bleibt (Leak-Revocation / `client_evicted`), fügt
  `reattach()` ein zusätzliches Attach hinzu (`attachCount++`) ohne passendes
  `/detach`. Da `close()` „Alle-zerstören" ist, ist das einzige Leck-Fenster eine
  Sitzung, die ohne explizites `close()` aufgegeben wird und dann durch den
  feststeckenden `attachCount` (auf eine Sitzung begrenzt) vor der Idle-Garbage-
  Collection bewahrt wird. Das realistische Szenario ist der Daemon-Neustart,
  der sauber ist. Dokumentiert, ohne dafür konstruierte Lösung.

## Testen (TDD)

Verwende die vorhandene `recordingFetch`-Testhilfe in
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts` und interceptiere
über URL durch einen echten `DaemonClient` (durchläuft die echte
`failOnError`-→`DaemonHttpError`-Abbildung).

1. **Nicht blockierender Self-Heal:** erster `POST /session/s-1/prompt` → `400
{code:'invalid_client_id'}`; `POST /session/s-1/resume` → frische
   `clientId: 'client-2'`; zweiter Prompt → `202`. Assert: Prompt wird
   aufgelöst, der zweite Prompt-Request trägt `x-qwen-client-id: client-2`,
   `resume` genau einmal aufgerufen.
2. **Blockierender Self-Heal** (`subscriptionActive` false): Gleicher Ablauf
   über den blockierenden `prompt`-Pfad (`200`/`202`+Turn-abgeschlossen bei
   Wiederholung).
3. **Wiederholung begrenzt:** Prompt → `400 invalid_client_id` zweimal → der
   Fehler wird weitergeleitet (Assert: `resume` einmal aufgerufen, Fehler ist
   `DaemonHttpError` invalid_client_id).
4. **Nicht-invalid-Fehler nicht wiederholt:** Prompt → `500` → sofort
   weitergeleitet, `resume` **nie** aufgerufen.
5. **Fehlschlag von `reattach` wird weitergeleitet:** Prompt → `400
   invalid_client_id`; `resume` → `404`/`500` → dieser Fehler wird
   weitergeleitet.
6. **Single-Flight:** Zwei gleichzeitige `prompt()`-Aufrufe erhalten beide
   `400 invalid_client_id` → `resume` genau einmal aufgerufen; beide
   Wiederholungen verwenden die neue ID.