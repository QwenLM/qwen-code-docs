# Read-only-Session-Katalog für nicht vertrauenswürdige Workspaces

## Zusammenfassung

Multi-Workspace-Daemons stellen einen schmalen Read-only-Katalog für
registrierte Nicht-Primary-Workspaces bereit, deren Trust-State beim Start
`false` ist. Der Katalog enthält persistierte Session-Zusammenfassungen und
das Session-Organisations-Sidecar. Er hängt sich nicht an eine Session an,
startet kein ACP-Child, mergt keinen Live-Runtime-State und interpretiert
keine projekt-kontrollierten Capability-Definitionen.

Dies ist eine Routen-Allowlist, keine Workspace-ACL. Ein Client, der den
Bearer-Token des Daemons besitzt, kann die erlaubten Daten jedes
registrierten Workspaces lesen. Trust gatet weiterhin Ausführung und
Mutationen; er erzeugt keinen separaten Authentifizierungs-Principal.

## Sicherheitsinvarianten

Jeder neu erlaubte Read-Pfad für nicht vertrauenswürdige Workspaces muss alle
diese Bedingungen erfüllen:

- Rufe nicht `loadSettings()` oder einen Settings-Migrations-/Reparatur-Pfad
  auf.
- Erzeuge, repariere, schreibe nicht um und modifiziere auch sonst keinen
  Storage.
- Unterdrücke Datei-basiertes Debug-Logging, während der Katalog-Reader aktiv
  ist, damit ein fehlerhafter Record nicht als Read-Nebeneffekt ein Debug-Log
  erzeugen oder anhängen kann.
- Rufe nicht `ensureChannel()` oder einen anderen ACP-Child-Start-Pfad auf.
- Frage den Live-Bridge-State der nicht vertrauenswürdigen Runtime nicht ab
  und merge ihn nicht.
- Führe keine externen Kommandos aus.
- Entdecke oder parse keine Workspace-Agenten, Skills, Hooks,
  MCP-Konfiguration oder andere projekt-kontrollierte
  Capability-Definitionen.

Die Implementation erzwingt die Live-State-Grenze mit einer internen
`mergeLive: false`-Read-Policy auf allen Session-Listen-Formen: default,
organized und nach `parentSessionId` gefiltert. Dieselbe Async-Read-Grenze
unterdrückt nur Datei-basiertes Debug-Logging für nicht vertrauenswürdige
Katalog-Reads; vertrauenswürdige Requests und Logging außerhalb dieser Grenze
bleiben unverändert. Fehlender Storage erzeugt einen leeren Katalog, und
fehlerhafte Einträge folgen dem bestehenden Best-effort-Read-Verhalten, ohne
Dateien zu reparieren.

## Routen-Matrix

Die Tabelle beschreibt einen nicht vertrauenswürdigen sekundären Workspace,
sofern nicht anders vermerkt.

| Oberfläche                                    | Ergebnis            | Datenquelle und Constraints                                                             |
| --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `GET /workspace/:id/sessions`                 | 200                 | Nur persistierte Session-Dateien; Id oder kodierter kanonischer cwd-Selector            |
| `GET /workspaces/:workspace/sessions`         | 200                 | Derselbe Persisted-only-Katalog                                                         |
| `GET /workspace/:id/session-groups`           | 200                 | Nur Organisations-Sidecar; beliebige registrierte Id oder kodiertes cwd                 |
| `GET /workspaces/:workspace/session-groups`   | 200                 | Nur Organisations-Sidecar                                                               |
| Datei-Read, bytes, stat, list, glob           | Bestehendes Verhalten | Bestehende Filesystem-Read-Policy bleibt unverändert                                  |
| Workspace-Trust-GET/-Request                  | Bestehendes Verhalten | Bestehende Trust-Konfigurations-Semantik bleibt unverändert                           |
| `/capabilities`, `/daemon/status`             | Bestehendes Verhalten | Bestehende Daemon-Diagnostik bleibt unverändert                                       |
| Plural-Session-/Gruppen-Mutationen            | 403                 | Mutations-Trust-Gate bleibt unverändert                                                 |
| Singular-Gruppen-Mutationen                   | Bestehendes Verhalten | Bleiben Primary-only; sekundäre Selectoren schlagen fail-closed fehl                  |
| Settings, permissions, providers              | 403                 | Das Laden von Settings kann Dateien migrieren, sichern oder reparieren                  |
| Memory                                        | 403                 | Die aktuelle Antwort enthält globale Memory-Pfade statt einer Workspace-only-Projektion |
| Env                                           | 403                 | Legt das Vorhandensein von Credentials sowie Proxy-/Host-Diagnostik offen               |
| Preflight                                     | 403                 | Kann git, npm, ripgrep oder andere Probes ausführen                                     |
| MCP, tools, hooks                             | 403                 | An Live-Bridge-State oder Projektkonfiguration gekoppelt                                |
| Skills, agents                                | 403                 | Entdeckt und parst projekt-kontrollierte Definitionen                                   |
| Transcript                                    | 403                 | Der aktuelle Pfad kann ACP starten, und die Cursor-Initialisierung kann einen HMAC-Key schreiben |
| Export, session status/context/tasks          | 403                 | Keine Workspace-qualifizierte Persisted-only-Implementation                             |
| ACP HTTP/WebSocket, voice, channels           | Abgelehnt           | Ausführungs-, Prozess- oder langlebige Runtime-Capabilities                             |

Unbekannte absolute, verschachtelte oder nicht registrierte
Workspace-Selectoren schlagen weiterhin fail-closed mit der bestehenden
`400 workspace_mismatch`-Response fehl. Ein fehlerhafter Legacy-Singular-Selector
behält seine bestehende `400`-Validierungsnachricht. In keinem der beiden
Fälle wird auf den primären Workspace zurückgefallen. Plural-Routen geben für
einen nicht vertrauenswürdigen primären Workspace weiterhin
`403 untrusted_workspace` zurück. Singular-Primary-Routen behalten ihr
bestehendes Kompatibilitätsverhalten.

## Session-Katalog-Semantik

Der Persisted-only-Modus behält das bestehende Verhalten für `archiveState`,
`view=organized`, `group`, `parentSessionId`, Cursor und Page-Size. Er
befüllt pending interactions, Turn-Fehler oder Client-State nie aus der
Live-Runtime; bestehende Persisted-Summary-Defaults wie `clientCount: 0` und
`hasActivePrompt: false` bleiben Wire-kompatibel. Er ruft nie
`bridge.listWorkspaceSessions()` auf.

Vertrauenswürdige sekundäre und primäre Workspaces behalten den bestehenden
Persisted-/Live-Merge. Es wird keine Route, kein Wire-Feld, kein Schema und
kein Capability-Tag hinzugefügt: Ältere Clients verarbeiten weiterhin `403`,
während die gebündelte WebShell die neue `200`-Response konsumiert, wenn sie
mit dem Daemon ausgeliefert wird.

## WebShell-Verhalten

Ein nicht vertrauenswürdiger sekundärer Workspace bleibt expandierbar und
wird sowohl mit `untrusted` als auch mit `read-only` gekennzeichnet. Das
Expandieren führt einen Katalog-Read aus. Eine `reloadToken`-Änderung führt
einen weiteren Read aus, aber der übliche Zehn-Sekunden-Poll ist
deaktiviert, weil dieser Daemon in diesem Workspace keine Sessions erzeugen
kann.

Das Expandieren selektiert oder aktiviert den Workspace nicht. Persistierte
Sessions werden als nicht interaktive Zeilen mit `role="note"` und einem
zugänglichen Namen gerendert, der den Session-Namen, das Datum und eine
Erklärung enthält, dass der Workspace vertrauenswürdig sein muss, bevor eine
Session geöffnet werden kann. Die Zeile bindet keine Maus- oder
Tastaturaktivierung und erhält kein Active-Session-Styling. Das Verhalten
vertrauenswürdiger Workspaces bleibt unverändert. Ein nicht
vertrauenswürdiger Primary bleibt deaktiviert, bis ein separates
Primary-Safe-Mode-Design vorliegt.

## Fehler- und Kompatibilitätsverhalten

- Fehlender Session- oder Organisations-Storage gibt einen leeren Katalog
  zurück.
- Unparsbare und Nicht-Objekt-JSONL-Records werden vom bestehenden
  Session-Reader übersprungen. Diese Änderung fügt keine Schema-Validierung
  für strukturell ungültige Objekt-Records hinzu.
- Ein unlesbares Organisations-Sidecar gibt die bestehende leere Read-View
  und Warnung zurück; Reads reparieren es nicht.
- WebShell-Request-Fehler behalten den bestehenden Empty State und die
  Konsolen-Warnung.
- Der Trust-GET beobachtet weiterhin die aktuelle Trust-Konfiguration auf der
  Festplatte und teilt Aufrufern mit, dass Runtime-Änderungen einen Neustart
  erfordern. Er wird in dieser Änderung nicht in einen Boot-Snapshot
  umgewandelt.

## Zurückgestellte Arbeit

- Ein nebeneffektfreier Settings- und Trust-Snapshot-Loader.
- Eine Workspace-only-Memory-Projektion.
- Environment- und Konfigurations-Inspektion mit Redaction.
- Ein Skills- und Agenten-Inventar, das Projektdefinitionen nicht parst.
- Ein Daemon-lokaler Transkript-Reader, der weder ACP startet noch einen
  Cursor-HMAC-Key initialisiert, sowie ein wirklich Read-only-Session-Viewer.
- Dynamisches Anwenden von Trust, Runtime-Rebuild und
  Workspace-Entfernung/Draining.
