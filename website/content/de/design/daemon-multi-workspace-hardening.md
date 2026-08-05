# Daemon-Multi-Workspace-Härtungsbasislinie

Status: aktuelle Implementierungs-Baseline und Review-Vertrag für Issue
[#6378](https://github.com/QwenLM/qwen-code/issues/6378). Dieses Dokument
schließt die Härtungsphase ab; es ist keine Roadmap für das Hinzufügen neuer
Daemon-Features.

## Ownership-Modell

Jede Daemon-Route und jede nachgelagerte Operation gehört zu genau einer
dieser Ownership-Klassen:

| Ownership           | Bedeutung                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prozess-global      | Eine Listener-/Prozess-Ressource, die von jeder Runtime geteilt wird, wie Authentifizierung, HTTP-Rate-Limits, Verbindungslimits, Metriken und Shutdown.                                                       |
| Legacy-primary      | Eine Kompatibilitätsroute, deren Vertrag bewusst auf die primäre Runtime abzielt. Das Weglassen eines Workspace-Selectors ist keine Erlaubnis, einen anderen Owner zu erraten.                                  |
| Workspace-qualifiziert | Eine Route löst zuerst eine explizite Workspace-Id auf, dann eine kodierte kanonische absolute cwd, und dispatched nur an diese gewählte Runtime.                                                            |
| Live-Session-Owner  | Eine Singular-Live-Session-Route scannt registrierte Runtimes nach der eindeutigen Bridge, der die Session gehört, und dispatched nur dorthin.                                                                  |
| Persistierter-Workspace | Eine Route löst den Workspace auf, bevor sie seinen persistierten Session- oder Organisationsspeicher liest; sie darf eine deklarierte Read-only-Oberfläche für einen nicht vertrauenswürdigen sekundären Runtime exponieren, ohne ACP zu starten. |

Der primäre Workspace ist die erste Startup-Runtime und der
Kompatibilitäts-Default für Routen, die diesen Fallback explizit
dokumentieren. Er ist kein generischer Fallback, wenn die Auflösung
fehlschlägt.

## Fehlersemantik

| Zustand                       | Erforderliches Verhalten                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unbekannter Workspace oder Session | Fail-closed mit der stabilen Mismatch-/Not-found-Antwort der Route. Nicht gegen Primary proben oder ausführen.                                                                                                                                                            |
| Nicht vertrauenswürdiger Workspace | Runtime-gestützte Ausführung und Mutation ablehnen. Ein nicht vertrauenswürdiger sekundärer Runtime darf nur explizit dokumentierte Read-only-Oberflächen nutzen, einschließlich begrenzter Filesystem- und persistierter Katalog-/Transkript-Reads, ohne ACP zu starten oder Reparaturzustand zu schreiben. Legacy-Primary-Preheat autorisiert keine Requests. |
| Mehrdeutiger Live-Session-Owner | Server-Fehler zurückgeben, weil nicht sicher dispatched werden kann. Auf keiner Bridge ausführen.                                                                                                                                                                          |
| Bootstrappende Runtime        | Prozess-globale Liveness reaktionsfähig halten; Runtime-gestützte Arbeit wartet oder meldet den deklarierten Startfehler. Deep Health gibt `503` mit einem Grund zurück, solange die Aggregation nicht verfügbar ist.                                                          |
| Drainende Runtime             | Neue Arbeit mit der stabilen Draining-Antwort verweigern. Eine nicht erzwungene Entfernung rollt mit `workspace_busy` zurück, wenn Aktivität existiert; eine erzwungene Entfernung erbittet Terminierung und begrenztes Cleanup aktiver Ressourcen. Die Runtime verbleibt im daemon-globalen Accounting, bis die Entfernung abgeschlossen ist. |
| Entfernte Runtime             | Als unbekannt behandeln. Sie muss aus Capabilities, Routing und Health-Aggregation verschwinden, bevor derselbe Workspace wieder hinzugefügt werden kann. Cleanup nach dem Persistenz-Commit-Punkt ist best-effort; Fehler werden geloggt und stellen kein Routing wieder her. |

## Invarianten

- Die Workspace-Auflösung fällt nie auf Primary zurück nach einem Ergebnis
  unbekannt, nicht vertrauenswürdig, mehrdeutig, drainend oder entfernt.
- Workspace-Ids haben Vorrang vor kodierten cwd-Selectors. Cwd-Selectors
  müssen absolut sein und auf eine registrierte Runtime kanonisieren.
- Jede aktive Workspace-Runtime besitzt ihren Environment-Snapshot, ihre
  Bridge, Workspace-Services, Filesystem-/Trust-Grenze, ihren Voice-Zustand
  und ihre ACP-/MCP-Ressourcengrenze. Die Produktion versucht, die primäre
  Bridge aus Kompatibilitätsgründen vorzuwärmen, und retryt bei erster
  Nutzung nach einem Preheat-Fehler. Ein vertrauenswürdiger sekundärer
  Runtime startet sein ACP-Kind on demand und besitzt, wenn
  `mcp_workspace_pool` aktiviert ist, den Pool innerhalb dieses Kindes; ein
  nicht vertrauenswürdiger sekundärer Runtime darf keines von beiden
  starten. Primary-Preheat umgeht keine Routen-Trust-Gates. Ein
  prozess-globaler Voice-Coordinator erzwingt die geteilte Admission-Obergrenze,
  während er Leases nach besitzender Runtime verfolgt. Umgebungsschlüssel mit
  gleichem Namen dürfen Runtimes nicht überqueren, und ein Workspace-Overlay
  darf die Elternprozess-Umgebung nicht mutieren.
- Ein einzelner Daemon-Token authentifiziert den Prozess; er ist keine
  Pro-Workspace-ACL. HTTP-Rate-Limits, Listener-Obergrenzen,
  Gesamt-Session-Admission, Metriken, Shutdown und der Prozess-Fehler-Auswirkungsradius
  sind ebenfalls daemon-global.
- Wenn `mcp_workspace_pool` beworben wird, werden MCP-Transporte und
  Budget-Accounting von Sessions innerhalb einer Workspace-Runtime geteilt,
  nie über Runtimes hinweg. Ohne den Tag müssen Clients den Legacy-Pro-Session-Manager
  und den Status `scope: 'session'` akzeptieren.
- Explizite Startup-/Statische Runtimes, einschließlich Primary, sind nicht
  entfernbar. Dynamische oder persistierte sekundäre Runtimes folgen den
  Lebenszyklusregeln Hinzufügen, Drainen, Entfernen und erneutes Hinzufügen.
  Drainende Runtimes bleiben für daemon-globales Health sichtbar, bis die
  logische Entfernung abgeschlossen ist. Erzwungene Entfernung bricht aktive
  Ressourcen ab und führt begrenztes Best-effort-Teardown durch; ein
  Cleanup-Timeout wird geloggt, statt die logische Entfernung zurückzurollen.
- Shallow `GET /health` bleibt exakt `200 {"status":"ok"}`. Deep Health
  aggregiert aktive und drainende Runtimes, gibt ein `503` mit Grund für
  Bootstrap- oder Aggregationsfehler zurück und exponiert nie
  Workspace-Pfade. Siehe
  [daemon-global deep health](./daemon-global-deep-health.md), implementiert
  durch [PR #6961](https://github.com/QwenLM/qwen-code/pull/6961).

## Review-Vertrag

Für jede neue oder geänderte Daemon-Route müssen Reviewer die
Ownership-Klasse benennen und den Request durch Environment, Bridge, Service,
Filesystem, Trust und Fehlerbehandlung verfolgen. Eine Route ist
unvollständig, wenn ein nachgelagerter Konsument nach fehlgeschlagener
Ownership-Auflösung stillschweigend Primary-Zustand nutzen kann.

Review-Feststellungen werden wie folgt klassifiziert:

- Regressionsfehler bei Korrektheit, Sicherheit, Datenverlust, Isolation oder
  Fail-open gehören in die Härtung und blockieren die betroffene Änderung.
- Ein neues Capability oder die Migration eines bewusst Primary-only-Vertrags
  erhält ein separates Issue und Design; es erweitert diesen Abschluss nicht.
- Ein Refactor ohne konkreten Defekt tritt nicht in den Härtungsumfang ein.

Nach ungefähr fünf Review-Runden sollten nur noch Korrektheit-, Sicherheit-,
Datenverlust- und Regressionskorrekturen einen aktiven Härtungs-PR erweitern.
Andere gültige Vorschläge werden als Follow-ups aufgezeichnet, damit der
Schirm nicht auf unbestimmte Zeit offen bleibt.

## Explizite aktuelle Grenzen

- `POST /session/:id/branch`, `POST /session/:id/fork` und
  `POST /session/:id/cd` bleiben Legacy-primary für eine sekundär-besessene
  Live-Session und geben `non_primary_session_route_not_supported` zurück.
- Benannte Daemon-verwaltete Channels werden nach besitzendem Workspace
  gruppiert und fahren einen Worker pro besitzender Runtime. `--channel all`
  bleibt bewusst Primary-only.
- Der Daemon bietet keine Pro-Workspace-Authentifizierung, kein
  Pro-Workspace-Rate-Limiting und keine Prozess-Fehler-Isolation. Deploye
  separate Daemons, wenn diese Grenzen erforderlich sind.

## Ausstiegsregel

Diese Baseline, ihre Vertragstests, die Routen-/Environment-Guards und
daemonweites Deep Health sind der feste Abschluss für #6378.
Branch-/Fork-Routing und `cd`-Semantik bleiben unabhängige Feature-Arbeit.
Nachdem die Abschluss-PRs gelandet sind, sollten zukünftige
Review-Feststellungen als fokussierte Issues eingereicht werden, statt einen
unbegrenzten Härtungs-Eimer wiederzueröffnen.
