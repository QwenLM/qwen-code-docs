# Channel-Worker-Startfehler-Meldung

## Kontext

[Issue #6909](https://github.com/QwenLM/qwen-code/issues/6909) identifiziert eine Diagnose-Lücke in Daemon-verwalteten Channels. Eine `connect()`-Ablehnung eines Adapters wird vom Worker geloggt, aber der Worker meldet danach nur ready oder exited mit `No channels connected.`. Supervisor, dynamische Control-API, SDK und CLI verlieren daher den umsetzbaren Provider-Fehler.

Diese Änderung trägt begrenzte, sanitisierte `connect()`-Fehler über die Worker-Startgrenze. Sie ändert nicht das Konfigurations-Parsing, das Laden von Extensions, die Adapter-Konstruktion, das Fail-fast-Verhalten des Daemon-Boots oder die Post-Start-Fehlerhistorie.

## Verhalten

- Wenn sich mindestens ein gewählter Adapter verbindet, wird der Worker ready. Sein aktueller Snapshot enthält die fehlgeschlagenen Channel-Namen und Gründe, und dynamisches Aktivieren gibt weiterhin Erfolg mit `partial: true` zurück.
- Wenn jeder Adapter während eines dynamischen Aktivierens, Ersetzens oder Reloads fehlschlägt, gibt der Request `502 channel_worker_start_failed` mit den versuchten Fehlschlägen zurück. `state` beschreibt den aktuellen Zustand nach dem Rollback; die versuchten Fehlschläge werden nicht in diesen Zustand persistiert.
- Wenn jeder Adapter während des Daemon-Boots fehlschlägt, bleibt der Start fail-fast. Weil der Daemon-Listener nicht verfügbar bleibt, wird kein späteres GET versprochen.
- Eine neue Worker-Generation löscht Startfehler der vorherigen Generation.

Nur `connect()`-Ablehnungen erzeugen diese Records. `phase` ist aktuell `connect`; das SDK verbreitert es bewusst zu `string`, damit eine zukünftig additive Phase keine brechende Typänderung erfordert. `code`-Werte von Adaptern sind diagnostisch und keine stabile Adapter-übergreifende Taxonomie.

## Vertrag

Ein aktueller Worker-Snapshot darf enthalten:

```ts
interface ChannelStartupFailure {
  channel: string;
  phase: 'connect';
  code?: string;
  message: string;
}

interface ChannelWorkerSnapshot {
  startupFailures?: ChannelStartupFailure[];
  startupFailuresTruncated?: boolean;
}
```

Ein dynamischer Startfehler darf zusätzlich Fehlschläge enthalten, die mit dem vertrauenswürdigen Supervisor-Workspace annotiert sind:

```ts
interface ChannelStartupAttemptFailure extends ChannelStartupFailure {
  workspaceCwd: string;
}
```

Der bestehende Top-Level-Fehlerstring, die Rollback-Felder und der Zustand bleiben kompatibel. Alle neuen Felder sind optional.

## IPC und Lebenszyklus

Das Kind sendet eine `channel_startup_failure`-Nachricht aus jedem `connect()`-Catch und wartet auf `channel_startup_report_ack`, bevor es den nächsten Adapter versucht. Der Elternprozess validiert, sanitisiert, speichert und bestätigt dann erst das Element. Der Sende-Callback ist nicht die Persistenzgrenze: Er beweist nur, dass Node die Nachricht akzeptiert hat, während der ACK beweist, dass der Supervisor sie verarbeitet hat, bevor der Worker synchron exiten kann.

Es werden höchstens 64 Fehlschläge übertragen. Fehlschlag 65 erzeugt einen `channel_startup_failures_truncated`-Marker, der ebenfalls bestätigt wird; spätere Fehlschläge bleiben nur auf stderr. Nur ein Report ist outstanding, daher braucht der ACK keinen Request-Bezeichner.

Fehlerhafte, überlange, außer Reihenfolge kommende oder unbestätigbare Startprotokoll-Nachrichten lassen den begrenzten Start fehlschlagen und terminieren das Kind. Fremde unbekannte IPC-Nachrichten behalten ihr bestehendes Verhalten. Das bestehende Ready-Schema und seine Validierung sind bewusst unverändert.

Jeder terminale Pfad vor Ready wickelt bereits akzeptierte Fehlschläge in `ChannelWorkerStartupError`. Reconcile- und Manager-Fehler klonen diese Details, während Cleanup- oder Wiederherstellungsprobleme separat als `rollbackError` erhalten bleiben. Der Workspace wird aus der Supervisor-Konfiguration hinzugefügt, nie aus dem Kind-IPC.

## Sicherheit und Grenzen

Worker und Supervisor normalisieren beide Steuer- und unsichtbare Zeichen, redigieren exakt den Daemon-Token und sensible Umgebungswerte, wenden generische Credential-Regeln an und kürzen nach Unicode-Code-Point. Die HTTP-Response für dynamische Fehler und die CLI-Anzeigegrenzen validieren erneut, wenden generische Redaktion an, begrenzen die Ausgabe und ignorieren fehlerhafte Einträge.

Die Limits sind 64 Fehlschläge, 128 Code-Points für channel, 64 für code und 512 für message. Fehlerobjekte und Snapshots werden an Ownership-Grenzen geklont, um zu verhindern, dass Caller den Supervisor-Zustand mutieren.

## Abgelehnte Alternativen

- stderr im Supervisor zu lesen ist mehrdeutig, koppelt Verhalten an Log-Prosa und kann keine zuverlässige Channel-Zuordnung liefern.
- Nur auf den `process.send()`-Callback zu warten, raced weiterhin den synchronen Worker-Exit.
- Einen letzten fehlgeschlagenen Versuch zu persistieren würde die Lebenszyklus-Semantik ändern und überlappt die separate Last-Error/Historie-Arbeit; dynamische Fehlschläge leben stattdessen nur in der fehlgeschlagenen Response.
- Auth-/Netzwerk-/Config-Kategorien zu erfinden, würde eine instabile Taxonomie über Adapter hinweg erzeugen. Die Implementierung behält nur einen vom Adapter gelieferten String oder endlichen numerischen Code.

## Verifikation

Unit-Coverage übt ACK-Reihenfolge, Alle/Teilweise-Fehlschlag, Abbruch- und Timeout-Pfade, fehlerhafte Protokolleingabe, ACK-Fehler, sicheren Exception-Zugriff, exakte und generische Redaktion, tiefe Kopien, Generations-Reset, 64/65-Trunkierung, Rollback-Propagation, HTTP-Validierung, SDK-Exporte und CLI-Formatierung. Der echte Plugin-Example-Integrationstest nutzt einen lokal allokierten und dann geschlossenen Port, um ein deterministisches `ECONNREFUSED` ohne externe Credentials oder Netzwerkabhängigkeiten zu erzeugen.
