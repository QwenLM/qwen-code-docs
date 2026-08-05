# Session-Writer-Lease P0a

## Problem

Eine persistierte Session kann aktuell von einem zweiten Qwen-Prozess
geladen werden, während der ursprüngliche Prozess noch einen Turn erzeugt
und aufzeichnet. Beide Recorder cachen dieselbe Parent-UUID. Wenn sie
unabhängig anhängen, erhält das JSONL-Transkript zwei unmarkierte Kinder
von diesem Parent. Resume folgt dem physischen Tail und kann daher die
vollständige Antwort des ersten Prozesses verstecken.

Der Produktionsvorfall hatte exakt diese Reihenfolge: Der ursprüngliche
Prozess zeichnete ein Tool-Ergebnis auf, der Daemon lud diese Session
frisch, der ursprüngliche Prozess zeichnete die verbleibende Tool-Arbeit
und die finale Antwort auf, und der Daemon zeichnete später eine
User-Nachricht unter Verwendung des früheren Tool-Ergebnisses als Parent.

## Scope

P0a etabliert genau einen Cross-Prozess-Writer für jedes
ACP-/Daemon-Paar aus `(runtime base, session ID)` und schützt den
gewöhnlichen linearen Append-Pfad, der an diesem Vorfall beteiligt war. Es
umfasst:

- ein atomares Owner-Token-Lease mit Dead-Process-Recovery;
- einen autoritativen Transkript-Reload nach Lease-Erwerb;
- Owner-, Datei-Identitäts- und Byte-Längen-Fencing bei jedem JSONL-Append;
- Turn-Admission, bevor User-, Cron-, Benachrichtigungs- und
  Teammate-Arbeit startet;
- die Wiederverwendung einer bereits aktiven Session innerhalb eines
  Daemons;
- Owner-Barrier-Reads für Live-Transkript-Replay und
  Desktop-History-Refresh;
- deterministische ACP/HTTP-Konfliktfehler; und
- Lease-Draining und -Freigabe bei Session-Close und fehlgeschlagener
  Initialisierung.

P0a macht Session-Wechsel, Rewind, Branch/Fork,
Arbeitsverzeichnis-Migration, Archiv-/Delete-/Rename-Maintenance oder
Transkript-Reparatur nicht transaktional. Es führt auch keinen
initialisierenden Registry-Eintrag ein, der jedes Same-Daemon-Load/-Resume
gegen Close serialisiert; ein wiederholtes Load verwendet den Owner wieder,
nachdem dieser Owner registriert ist, während der Cross-Prozess-Lease
während der Initialisierung weiterhin einen zweiten Writer ablehnt.
Vollständiges Load/Close-Ergebnis-Coalescing gehört zu P0b. Session-Wechsel
und Persistence-Root-Migration schlagen fail-closed fehl, solange eine
ACP-Config ein Lease besitzt. Die logische Arbeitsverzeichnis-Änderung von
ACP bleibt unterstützt, weil sie den Recorder und SessionService an den
ursprünglichen Persistence-Root gebunden hält. Same-Owner-Rewind lädt über
diesen Config-gepinnten SessionService unter der
Recorder-Schreib-Barriere; Rename und Branch behalten ihre bestehenden
Recorder- oder Flush-vor-Copy-Pfade. Daemon-Archive/Delete und Maintenance
von nicht aktiven Sessions behalten ihre bestehende Semantik. Gleichzeitige
Maintenance von außerhalb des aktiven Owners bleibt nicht unterstützt und
ist Teil der P0b-Grenze. Interaktive und Headless-CLI-Recorder behalten
ihr bestehendes Verhalten ohne Lease, sodass `/clear`, `/resume`,
`/branch` und `/cd` nicht regressieren; sie dürfen dieselbe Session nicht
gleichzeitig mit einem ACP-Owner beschreiben, bis P0b das Protokoll
erweitert.

Das Protokoll ist durch `experimental.sessionWriterLease` gegatet und ist
standardmäßig deaktiviert. Der effektive Wert wird beim Start des
ACP-Kindes von der Bootstrap-Config gesnapshotet und bleibt für jede von
diesem Prozess bediente Session fix; Pro-Session-Settings-Reloads können
ihn nicht ändern. Das Aktivieren erfordert einen Prozessneustart. Das
Setting betrifft nur ACP-/Daemon-Recorder; interaktive und Headless-Recorder
verwenden auch bei aktiviertem Setting weiterhin den Legacy-Pfad.

## Invarianten

1. Höchstens ein kooperierender ACP-Prozess besitzt ein
   Session-Writer-Lease unter einem Runtime-Base.
2. Ein geleaster ACP-Recorder ist inaktiv, bis er das Lease besitzt und das
   Transkript neu geladen hat, während er es hält.
3. Preview-Daten, die vor dem Lease geladen wurden, sind niemals der
   autoritative Tail des Recorders.
4. Jeder geleaste ACP-Append verifiziert den Owner-Token, den Hard State
   des Transkripts und die Byte-Länge. Nur-Zeitstempel-Drift wird nur nach
   stabiler Content-Verifizierung akzeptiert.
5. Ein Ownership- oder Transkript-Integritätsfehler lehnt spätere
   Top-Level-Turns in dieser geleasten ACP-Config dauerhaft ab.
6. Ein Daemon konstruiert nie eine zweite schreibbare Config für eine
   Session, die in diesem Daemon bereits aktiv ist.
7. Ein aktiver Eintrag wird erst entfernt, nachdem sein Recorder gedraint
   und das Lease freigegeben hat.
8. Runtime-Ausgabe-Roots sind pro Config gepinnt, sodass Lock und
   Transkript nicht über verschiedene asynchrone Workspace-Kontexte
   auflösen können.

## Lease-Protokoll

Das Lock wird gespeichert unter:

```text
<runtime base>/tmp/session-writer-locks/<encoded session id>.lock
```

Sein unveränderlicher Record enthält einen zufälligen Owner-Token, PID,
Host, Prozessart, Erwerbszeit, Qwen-Version und (falls verfügbar) eine
stabile OS-Prozessstart-Identität. Linux verwendet die Kernel-Boot-ID plus
die Prozessstart-Ticks, sodass Uhrzeitkorrekturen einen aktiven Owner nicht
als stale erscheinen lassen können. Darwin normalisiert die
Prozessstart-Probe auf die C-Locale und UTC, sodass zwei Prozesse mit
unterschiedlichen Umgebungen dieselbe Identität vergleichen. Die Identität
unterscheidet PID-Wiederverwendung, wenn die Plattform sie zuverlässig
offenlegt. Ein Fremd-Host-Owner und jeder Zustand, dessen Sicherheit nicht
bewiesen werden kann, schlagen fail-closed fehl.

Der Erwerb erzeugt einen vollständig geschriebenen temporären Record und
linkt ihn atomar in den Lock-Namen. Ein gültiger aktiver Owner liefert
`session_writer_conflict` zurück. Ein gültiger toter lokaler Owner kann
umbenannt, erneut geprüft und reklamiert werden. Reclaim-Guards bilden
begrenzte Owner-Generationen, sodass ein anderer Prozess recovern kann,
wenn ein Reclaimer selbst crasht. Ein fehlerhaftes Lock, ein Symlink-Lock
oder ein nicht-reguläres Lock liefert `session_writer_unavailable` zurück,
statt auf Verdacht als stale behandelt zu werden.

Das Lease snapshotet, ob das Transkript existiert, seine Datei-Identität,
Sicherheitsmetadaten, Byte-Länge und einen inkrementellen
In-Memory-SHA-256-Zustand. Änderungen an Existenz, Länge, Device/Inode,
Modus, Owner/Gruppe und Link-Count schlagen fail-closed fehl.
Erzeugungs-, Statusänderungs- und Modifikationszeitstempel sind beratend:
Nur-Zeitstempel-Drift löst eine stabile Voll-Content-Prüfung über ein
Datei-Handle aus und wird nur akzeptiert, wenn der Digest unverändert ist.
Erweiterte Attribute und ACL-Einträge, die den Modus nicht ändern, werden
nicht separat gefingerprintet. Wenn sich eine solche Operation als
Zeitstempel-Drift zeigt, wird sie nach derselben Content-Prüfung
akzeptiert, falls der gesamte Hard State unverändert bleibt; wenn das
Dateisystem keinen beobachteten Zeitstempel-Unterschied offenlegt, wird die
Operation nicht erkannt. `appendJsonLine` wendet dieselbe Prüfung nach dem
Öffnen seines Append-Handles an, führt einen Kandidaten-Digest mit den
bekannten Bytes fort und übernimmt den Digest und den erwarteten Zustand
erst nach einem erfolgreichen durable Append, einer Pfadverifizierung nach
dem Schreiben und einer finalen Owner-Prüfung. Die Neuerstellung eines
Transkripts verwendet exklusive Erzeugung.

Der Erwerb eines bestehenden Transkripts führt eine O(n)-Streaming-Lese aus,
um die Digest-Baseline zu etablieren, mit einem auf 1 MiB begrenzten
Puffer; gewöhnliche Appends bleiben inkrementell. Ein Reconciliation-Scan
erfordert, dass Zeitstempel von seinem Vor-Lese-Zustand bis zu seinem
Nach-Lese-Zustand stabil bleiben, und wiederholt
Nur-Zeitstempel-Instabilität höchstens dreimal. Dieses Stabilitätsintervall
ist nötig, weil ein sequentieller Digest selbst dann mit dem erwarteten
Content übereinstimmen kann, wenn ein nicht kooperierender Writer einen
bereits gelesenen Offset hinter dem Lese-Cursor ändert. Wenn sich die
Zeitstempel weiter ändern, liefert das Lease `session_writer_unavailable`
zurück, statt einen potenziell gerissenen Snapshot zu akzeptieren.

Der inkrementelle Digest ist eine Kompatibilitätsprüfung für aktive
Prozesse, kein persistierter Beweis für zertifizierten Handoff. Ein nicht
kooperierender Writer kann während eines Appends weiterhin ein Präfix
gleicher Länge überschreiben, ohne einen Zeitstempel-Unterschied zu
hinterlassen, der bei einer der Zustandbeobachtungen dieses Prozesses
sichtbar ist. Das Schließen dieser bestehenden Grenze würde einen
bedingungslosen O(n)-Scan nach dem Schreiben erfordern, wiederholte
Appends quadratisch machen und liegt außerhalb von P0a.

## Aktivierung und Close

Wenn das Feature-Gate aktiviert ist, erwirbt eine ACP-`Config.initialize()`
das Lease vor der Initialisierung von Extensions, Hooks, Tools, Modell oder
Scheduler. Während sie das Lease hält, löst sie den Aktiv-/Archivzustand
auf, lädt das aktive Transkript neu, wenn eines existiert, verifiziert,
dass sich das Transkript während des Reloads nicht geändert hat, ersetzt
jede Pre-Lock-Preview und aktiviert den Recorder. ACP-Configs ohne Opt-in
und alle Nicht-ACP-Configs laufen weiterhin über den Legacy-Recorder-Pfad,
ohne dieses P0a-Lease zu erwerben.

Jeder spätere Initialisierungsfehler schließt den Recorder und gibt das
Lease frei. Normaler Shutdown und ACP-Session-Close finalisieren
ausstehende Metadaten, drainen die Recorder-Queue, geben den Owner-Token
frei und entfernen erst dann den aktiven Session-Eintrag. Cleanup ist
identitätsgeprüft, sodass eine fehlgeschlagene ältere Initialisierung
keinen neueren Eintrag mit derselben ID schließen kann. Acquire-Cleanup
verwendet die Single-Flight-Exakt-Record-Freigabe des Lease; ein terminaler
Fehler behält das primäre Lock, spätere Freigabeaufrufe beobachten denselben
Fehler statt einen zweiten Rename zu versuchen, und ein anderer Writer
bleibt gefenced bis zur Prozess-Exit-Recovery. Eine endgültige Verweigerung
des Kindes lässt die Session aktiv, sodass Close erneut versucht werden
kann. Close-Draining ist begrenzt; ein Timeout oder Transportfehler hat ein
unbekanntes Ergebnis, daher terminiert die Bridge den geteilten ACP-Channel
und seine prozesseigenen Leases werden als stale wiederherstellbar. Andere
Sessions auf diesem Channel werden von derselben Recovery-Aktion ebenfalls
gereapt.

## Fehlervertrag

| Art                          | JSON-RPC | HTTP | Bedeutung                                               |
| ---------------------------- | -------: | ---: | ------------------------------------------------------- |
| `session_writer_conflict`    | `-32020` |  409 | Ein anderer aktiver Prozess besitzt die Session.        |
| `session_writer_lost`        | `-32021` |  409 | Diese Config besitzt ihren Lock nicht mehr.             |
| `session_transcript_changed` | `-32022` |  409 | Das JSONL hat sich außerhalb der erwarteten Append-Sequenz geändert. |
| `session_writer_unavailable` | `-32023` |  503 | Ownership konnte nicht sicher verifiziert werden.       |

Externe Responses verwenden feste Meldungen und `errorKind`; sie legen PID,
Host, Owner-Token, Lock-Pfad oder Transkript-Pfad nicht offen.

Ein Symlink- oder nicht-regulärer Transkript-Pfad ohne vorherige
Reguläre-Datei-Baseline ist `session_writer_unavailable`. Sobald ein Lease
eine Reguläre-Datei-Baseline etabliert hat, ist das Ersetzen dieses Pfades
durch einen Symlink oder eine andere nicht-reguläre Datei eine externe
Transkript-Ersetzung und wird als `session_transcript_changed`
klassifiziert.

## Kompatibilität und Rollout

Das Protokoll koordiniert nur ACP-Writer, die das Feature aktiviert haben.
Deployment und Rollback müssen alte ACP-/Daemon-Writer-Prozesse drainen,
bevor das Setting aktiviert oder deaktiviert wird. Mixed-Version- oder
Mixed-Konfigurations-ACP-Betrieb ist nicht sicher, weil ein Legacy-Writer
das Lock ignoriert. Gleichzeitiger interaktiver oder Headless-Zugriff auf
dieselbe persistierte Session bleibt außerhalb von P0a und wird bis P0b
nicht unterstützt.

Das Runtime-Dateisystem muss Hard-Links im selben Verzeichnis mit atomarem
No-Replace-Verhalten unterstützen. Wenn diese Voraussetzung nicht verfügbar
ist, schlägt der Erwerb fail-closed mit `session_writer_unavailable` fehl.

Bestehende gebranchte Transkripte werden nicht automatisch repariert. P0a
verhindert nach dem Rollout einen neuen Stale-Load-Branch; Reparatur und
explizite Branch-Semantik bleiben separate Arbeit.

## Verifikation

Die Unit-Abdeckung testet die Default-off- und expliziten Opt-in-Gates,
Lock-Contention, Dead-Owner- und Crashed-Reclaimer-Recovery, fehlerhafte
und nicht-reguläre Locks, gleichzeitige Owner-Token-Freigabe, begrenzte
Freigabe-Prechecks, terminale Cleanup-Fehler, trunkierte und extern
geänderte Transkripte, Nur-Zeitstempel-Reconciliation, Ersetzung gleicher
Länge in-place und atomar, Sicherheitsmetadaten-Änderungen,
UTF-8-Byte-Buchhaltung, Recorder-Aktivierung/Fencing/Close, autoritativen
Reload, Initialisierungs-Cleanup, Runtime-Root-Pinning, Turn-Admission,
Same-Daemon-Replay-Wiederverwendung, Kompatibilität bei deaktivierter
Aufzeichnung, Legacy-Recorder-Verhalten des interaktiven Modus und
Fehler-Sanitization. Die Darwin-Abdeckung verifiziert außerdem, dass
Prozesse mit unterschiedlichen Zeitzonen dieselbe Owner-Identität ableiten.
Die PID-Wiederverwendungsbehandlung ist implementiert, wird aber nicht als
Test-Evidenz beansprucht, weil die Prozessstart-Probe plattformabhängig
ist.

Mit aktiviertem Feature-Gate stellt eine echte Zwei-Prozess-Regression das
Vorfall-Timing nach: Prozess A hält den Writer nach einem Tool-Ergebnis-Tail,
Prozess B wird abgelehnt, bevor er als Writer lädt, A hängt seine finale
Antwort an und schließt, und B erwirbt dann, lädt diese finale Antwort neu
und hängt den nächsten User-Record mit der finalen Antwort als Parent an.

Die Desktop-Abdeckung verifiziert, dass ein Writer-Konflikt dem Nutzer
angezeigt wird, statt die angefragte persistierte Session stillschweigend
durch eine frische Session zu ersetzen. Der Live-History-Refresh läuft über
die Schreib-Barriere des Owners und den Config-gepinnten SessionService,
auch nach einem logischen `/cd`.
