# ACP Extension Watcher: First-Session-Messung


Diese Änderung überspringt den interaktiven Extension-File-Watcher in ACP-Prozessen. Der Daemon besitzt bereits seinen Resource-Refresh-Lifecycle. Interaktive Terminal-Sessions konstruieren den Watcher weiterhin. Dies ist die erste Stufe der First-Session-Optimierung; sie etabliert **keine** erste neue Session unter 500 ms.

## Änderung und Herkunft

Die Basis ist der Main-Commit `2985fef4e9b9393601141c16031b2ba039181158`; der gemessene Kandidat ist der Watcher-only-Commit `2aadc4b127ec24074e0e5ddfd402e978a0c43f5d`. Die Produktionsänderung ist ein zusätzlicher ACP-Mode-Guard. Sowohl `--acp` als auch `--experimental-acp` sind abgedeckt, zusammen mit einer Kontrolle, die den Watcher für den interaktiven Modus konstruiert. Keine Core-Initialisierung, Resource-Selection, Prompt, Authentifizierung, MCP-Policy oder Preheat-Implementierungsänderungen sind enthalten.

Beide Bundles verwenden CLI-Version 0.27.2. Das aufrufende TypeScript-Paket ist ` @qwen-code/sdk` **0.1.32**. Paketversion und SDK-Entry-Hashes wurden vor und nach jedem Lauf aufgezeichnet. Vollständige Baseline-, Kandidaten- und kompilierte-SDK-File-Tree-Digests wurden ebenfalls eingefroren und um die Messungskohorte herum geprüft. Der Kandidat wurde in einem unabhängigen Worktree mit der gepinnten pnpm 11.24.0 Lockfile-Installation, dem vollständigen Build, Typecheck und Bundle gebaut.

## Workload und Timing-Grenze

Die private installierte Workload enthält 31 Resources: 14 Extension-Suites und 17 Standalone-Skills, mit 90 benutzerdefinierten Skills, 3.944 Dateien und 81.931.741 Bytes. Jede Sample materialisiert das vollständige gleiche Resource-Inventar auf einem case-sensitiven lokalen Dateisystem. Resource-Namen, Quelldateien, Business-Content, Manifests, lokale Pfade, Identifier und Roh-Logs bleiben privat. Nur aggregierte Zählungen und Timings werden hier veröffentlicht.

Das Profil bewahrt Hooks und setzt die MCP-Allowlist auf eine leere Liste. Es sendet keinen Prompt, keine Model-Anfrage und keinen Business-Tool-Aufruf und verbindet sich nicht mit konfigurierten externen MCP-Servern. Der installierte native Aktivierungszustand wird während der nicht getimten Fixture-Vorbereitung geseedet. Dies stellt einen **bereits installierten und aktivierten** Resource-Satz dar, mit einem frischen Prozess und frischem Session-Zustand; es wird nicht behauptet, dass alle Resource-abgeleiteten Caches leer sind. Fixture-Erstellung, Dateikopieren, natives Aktivierungs-Seeding, Bundle-Build und SDK-Modul-Import sind abgeschlossen, bevor eine der Uhren startet.

Jede Sample hat ein frisches HOME, Runtime-Verzeichnis, TMPDIR, Persisted-Session-Root und ein initial leeres Node-Compile-Cache-Verzeichnis. Der Daemon wird über seinen echten eingebetteten HTTP-Bridge-Entry-Point mit `preheatBridge: false` gestartet. Der Treiber wartet auf `runtimeReady` und verifiziert dann null Business-Sessions und keinen Live-ACP-Channel vor seinem ersten SDK-Aufruf. Es gibt keine HTTP-Readiness- oder Capabilities-Anfrage vor diesem Aufruf. Eine frische UUID fordert einen neuen Thread an; das Ergebnis muss sie mit `attached: false` echoen. Zwei weitere frische UUID-Aufrufe validieren das Subsequent-Session-Verhalten.

Die Ready-Request-Grenze wird vor der SDK-Client-Konstruktion und der Caller-UUID-Generierung beobachtet; beide liegen außerhalb der primären Create-Uhr.

Die primäre Uhr umschließt das vollständige `await client.createOrAttachSession(...)`: Capability-Discovery, den Session-POST, Response-JSON-Parsing und SDK-Identity-Validierung. Die erste HTTP-Anfrage ist `GET /capabilities`; ihre Dauer allein ist **keine** New-Session-Messung. Request-Datensätze behalten die tatsächliche Sequenz für alle drei Aufrufe; bei späteren Aufrufen darf nicht angenommen werden, dass Capability-Prüfungen weggelassen werden.

Der Bericht legt auch den Session-POST, den Daemon-Prozess-Spawn bis zur Daemon-Ready-Request-Grenze und den Daemon-Spawn bis zum ersten abgeschlossenen SDK-Ergebnis offen. Das Warten auf den Daemon erzeugt keinen ACP-Prozess: Jeder aufgezeichnete ACP-Spawn muss erfolgen, nachdem sowohl der SDK-Aufruf startet als auch die erste HTTP-Anfrage. Der Daemon-Status muss Preheat `not_scheduled` melden. Kein CPU-Profiler, expliziter Compile-Cache-Flush, deaktivierter Child-Compile-Cache, künstlicher Sleep oder Startup-Probe erscheint in formalen Samples.

## Formale Ergebnisse

**Der erste vollständige SDK-Create fällt im Median von 1096,1 ms auf 772,9 ms: 323,2 ms / 29,48 % niedriger. Der Kandidat bleibt in jeder Sample über 500 ms.**

Alle folgenden Werte sind Millisekunden, gezeigt als Median (Minimum–Maximum), mit acht unabhängigen First-Sessions pro Bedingung. Beide Bedingungen schließen 8/8 Versuche ab und erzeugen 24/24 neue Sessions. Keine formale Sample wird ausgeschlossen.

| Uhr                                 |               Baseline |          Nur Watcher |
| ------------------------------------- | ---------------------: | ---------------------: |
| Erster vollständiger SDK-Create (primär)   | 1096.1 (1078.3–1129.3) |    772.9 (758.4–824.1) |
| Erster Session-POST + JSON             | 1075.7 (1058.8–1109.2) |    754.1 (739.3–798.5) |
| Daemon-Spawn → beobachteter Listener      |    336.7 (322.5–341.5) |    329.2 (323.1–358.5) |
| Daemon-Spawn → Ready-Request-Grenze |    630.6 (618.7–644.5) |    605.3 (591.8–621.0) |
| Daemon-Spawn → erstes SDK-Ergebnis       | 1731.0 (1709.6–1748.0) | 1384.5 (1355.5–1427.0) |
| Erster Capabilities-GET + JSON         |       18.7 (17.7–28.1) |       18.3 (18.1–25.1) |
| Erste HTTP → ACP-Spawn                |       14.2 (13.9–22.3) |       14.2 (14.1–24.6) |
| Zweiter vollständiger SDK-Create            |       71.1 (65.1–79.6) |       74.0 (65.2–80.0) |
| Dritter vollständiger SDK-Create             |       56.9 (53.7–63.7) |       54.4 (53.4–56.6) |

First-Create-Samples nach gepaarten Runden:

| Runde | Baseline | Nur Watcher |
| ----- | -------: | -----------: |
| 1     |   1098.5 |        758.4 |
| 2     |   1078.3 |        771.1 |
| 3     |   1129.3 |        807.8 |
| 4     |   1110.2 |        760.1 |
| 5     |   1082.6 |        767.9 |
| 6     |   1089.2 |        774.8 |
| 7     |   1093.7 |        789.0 |
| 8     |   1110.5 |        824.1 |

Die [öffentliche numerische Zusammenfassung](./acp-extension-watcher-results.json) enthält jede formale Sample, Mittelwerte, Mediane, Bereiche, Compile/Build-Tree-Digests und Pass/Fail-Zählungen. Sie ist aus einer expliziten Allowlist konstruiert; sie enthält kein privates Resource-Inventar, Quellinhalte, lokale Pfade, UUIDs, Tokens oder Roh-Logs.

Eine frühere Kohorte mit sechs Versuchen wurde abgebrochen, als ihr temporäres Fixture-Volume keinen Speicherplatz mehr hatte (fünf abgeschlossene Samples und ein Session-Initialisierungsfehler). Die Fehler-Logs enthalten `ENOSPC` bei der Runtime-Verzeichniserstellung. Alle sechs Prozesse schlossen normal; die gesamte Kohorte, einschließlich ihrer abgeschlossenen Timings, wird ausgeschlossen. Ein größeres unabhängiges case-sensitives Volume und sechzehn völlig frische Fixtures wurden vor dem Neustart der formalen Kohorte vorbereitet. Die fehlgeschlagenen Beweise werden lokal aufbewahrt; sie werden nicht stillschweigend erneut in die Ergebnisse aufgenommen.

Acht gepaarte Runden liefen seriell in alternierender A/B- dann B/A-Reihenfolge. Alle Fixtures wurden vor dem exklusiven Messfenster vorbereitet. Kein Build, Fixture-Kopieren, anderer Benchmark oder Test lief gleichzeitig unter dieser Aufgabe. Der OS-Datei-Cache wurde nicht geleert; dies sind Messungen mit frischem Prozess und frischer Session auf einem Host, keine Cold-Disk-Messungen. Acht Samples pro Bedingung sind zu wenige, um eine Produktions-Tail-Latency-Garantie zu etablieren.

Host: macOS 26.6.2, arm64; Node.js v26.7.0. Diese lokale isolierte Rekonstruktion verwendet das private Vorproduktions-Installationsinventar; sie ist keine Produktions- oder Live-Vorproduktions-Latency-Messung. Das 500-ms-Ziel gilt für den ersten vollständigen SDK-Create und bleibt Folgearbeit über diesen PR hinaus.

## Funktionale Verifizierung und Grenzen

Separate funktionale Läufe vergleichen eingefrorene Baseline- und Nur-Watcher-Bundles mit dem gleichen vollständigen installierten Inventar. Sie sind keine Mitglieder der formalen Timing-Kohorte: Health- und Helper-Aufrufe gehen einigen funktionalen Prüfungen voraus.

- Beide Bedingungen bestehen 41/41 External-Change-Assertions und 18/18 Aktivierungs/Lifecycle-Assertions.
- Alle acht Helper-Snapshots, acht Existing-Session-Menüs nach dem Helper, acht neu erstellte Session-Menüs und elf Lifecycle-Snapshots stimmen nach Fixture-Pfad- und UUID-Übereinstimmung überein.
- Normale Reads bewahren beobachtete Propagationsunterschiede: vollständige Workspace-Skill-Envelopes stimmen in 29/32 Samples überein, Skill-Inhalte in 31/32 und Existing-Session-Befehlslisten in 31/32. Ein atomarer Replacement erscheint bei einer Beobachtung früher im Kandidaten; Dateineuerstellung erscheint kurz früher in der Baseline. Spätere Samples oder der normale Helper konvergieren. Extension-Skill-Edits/Restores bleiben in beiden Bedingungen während des drei Sekunden Beobachtungsfensters alt und werden nach dem Helper korrekt.
- Beide Seiten emittieren acht öffentliche SSE-Events mit der gleichen Type/Phase-Sequenz. Die ersten sieben korrespondierenden Payloads stimmen überein; das letzte Reload-Payload aktualisiert die gleichen neun Sessions mit einer anderen Abschlussreihenfolge. Die ursprüngliche Array-Reihenfolge wird beim Prüfen der Gleichheit beibehalten.
- New-Session-Antworten unterscheiden sich naturgemäß in UUID, Erstellungszeit und Client-Identität. Andere Antwortfelder stimmen überein; die tatsächliche Erstellung wird unabhängig durch UUID-Echo und `attached: false` bestätigt.

Nur Fixture- und Bundle-Roots, von diesen Roots abgeleitete Workspace-Identifier und UUID-Übereinstimmung werden normalisiert. Für den separat berichteten Workspace-Skill-Business-Vergleich werden Beobachtungs-Timestamp und -Alter ausgeschlossen; Roh-Envelopes bleiben intakt. Cache-Veraltetheit, Refresh-Flags, Aktivierungszustand, Generation, alle Skill/Befehlsfelder und die ursprüngliche Array-Reihenfolge werden nicht gelöscht, um Gleichheit herzustellen. Diese Beobachtungen beweisen keine identische Propagations-Latency oder byte-identische normale Reads.

Jede funktionale Gruppe erhält eine normale Close-Bestätigung und beendet sich mit Code null, keinem Signal und keinem erzwungenen Fallback. Eine abschließende scoped OS-Beobachtung findet keinen übereinstimmenden Benchmark-Prozess. Formale Timing-Samples erzwingen separat ihre eigene normale Close-Bestätigung, Null-Exit-Status, kein erzwungenes Fallback und das Verschwinden jeder aufgezeichneten ACP-Child-PID.

Die fokussierte CLI-Unit-Suite besteht **129/129**, mit vollständigem Build, Typecheck, Bundle, Changed-File-ESLint und Prettier-Prüfungen bestanden. Die interaktive Watcher-Konstruktion wird durch eine Unit-Kontrolle verifiziert; ein interaktiver Terminal-UI-End-to-End-Lauf, Windows, Linux, Model-Ausführung, Hooks die auf Prompts ausgeführt werden, und externes MCP-Verhalten liegen außerhalb dieser Validierung.

## Reproduzieren mit öffentlichen synthetischen Resources

Der öffentliche Generator erstellt generische Resources ohne Lesen oder Exportieren der privaten Installation. Er verwendet 14 Suites, 17 Standalone-Skills und 90 Skill-Manifeste, aber seine Bytes, Verzeichnisformen, Standalone-Skill-Platzierungen, Hook-Definitionen und Aktivierungsvorbereitungen unterscheiden sich. Seine Timings können die Prozedur reproduzieren und Skalierungsverhalten aufzeigen; sie können die Private-Workload-Zahlen oben nicht reproduzieren oder ersetzen.

Baue eine eingefrorene Baseline und einen eingefrorenen Kandidaten aus ihren jeweiligen Commits mit `corepack pnpm install --frozen-lockfile`, `npm run build` und `npm run bundle`. Die öffentliche Reproduktion wurde mit Node.js v26.7.0 geprüft. Halte den SDK-Build fixiert, stoppe Builds und Resource-Kopieren vor dem Messen und wechsle die beiden Bundles seriell. Führe von diesem Checkout eine Sample pro frischem Ausgabeverzeichnis aus:

```sh
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-a /absolute/frozen-baseline/dist
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-b /absolute/frozen-candidate/dist

node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-a/fixture.json
node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-b/fixture.json
```

Bereite alle frischen Fixtures vor der Messungskohorte vor. Ein frischer synthetischer Smoke schließt alle drei Creates und die No-Preheat-, Identity-, Close-, Child-Exit- und Recorded-Input-Hash-Prüfungen ab. Er validiert die Prozedur und steuert keine Sample zu den privaten Ergebnissen bei. Jeder Lauf gibt eine pfadfreie numerisch/boolesche Zusammenfassung aus und bewahrt detaillierte lokale Beweise am angeforderten Ausgabeort. Die synthetischen Resources enthalten keinen SessionStart-Hook; es wird kein Prompt gesendet, daher werden die verfassten UserPromptSubmit-Hooks nicht ausgeführt. Verwende mindestens acht verschachtelte Paare, behalte Fehlschläge, inspiziere jede Preheat/Session/Spawn/Close-Assertion und melde alle Uhren. Commite keine lokal generierten Fixture-Trees oder Rohergebnisse.

Wenn eine aufgezeichnete ACP-PID nach dem Shutdown noch existiert, markiert der öffentliche Runner das Ergebnis als fehlgeschlagen und zeichnet einen Cleanup-Fehler für manuelle Inspektion auf. PID-Reuse verhindert den Nachweis der Prozessidentität, daher ist die automatische Terminierung auf den eigenen Wrapper-Prozess-Handle beschränkt.

Die verbleibende Sub-500-ms-Arbeit muss die nach dem ersten SDK-Aufruf durchgeführte Initialisierung reduzieren, mit der gleichen No-Preheat-Grenze und funktionalen Prüfungen. Sie ist absichtlich von dieser Ein-Zeilen-Watcher-Änderung getrennt.
