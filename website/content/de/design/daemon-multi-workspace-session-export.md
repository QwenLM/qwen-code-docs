# Workspace-qualifizierter Session-Export

## Zusammenfassung

Issue #6378 verlangt, dass Clients eine persistierte Session aus einem
explizit gewählten registrierten Workspace exportieren können. Die bestehende
Route `GET /session/:id/export` ist bewusst an den primären Workspace
gebunden, sodass ihre Wiederverwendung für eine sekundäre Session entweder
`404` zurückgibt oder das falsche Transkript auswählen kann, wenn dieselbe
Session-Id in mehr als einem Workspace existiert.

Diese Änderung fügt
`GET /workspaces/:workspace/session/:id/export?format=html|md|json|jsonl`,
die `workspace_session_export`-Capability, eine passende
`WorkspaceDaemonClient`-Methode und begleitende Dokumentation hinzu. Die
Legacy-Route bleibt Primary-gebunden.

## Vertrag

Der Workspace-Selector folgt der bestehenden Plural-Routen-Regel: zuerst die
exakte registrierte Workspace-Id, dann ein URL-kodiertes absolutes cwd nach
Kanonisierung. Die gewählte Runtime muss vertrauenswürdig sein. Auflösung und
Trust-Prüfungen erfolgen vor der Session- oder Formatvalidierung.

Die Route liest nur die aktiven persistierten JSONL des gewählten Workspaces.
Sie durchsucht keinen anderen Workspace, fällt nicht auf Primary zurück, löst
keinen live Owner auf, startet kein ACP, hängt keinen Client an und lädt keine
Workspace-Settings. Archivierte Sessions bleiben weiterhin nicht verfügbar.
Der Erfolg verwendet denselben Formatter, dieselbe Dateinamen-Sanitisierung,
denselben MIME-Typ, dieselbe Cache-Policy und dieselben Attachment-Header wie
die Legacy-Export-Route.

Fehler behalten die bestehenden Export-/Speicherformen bei, mit
`400 workspace_mismatch`, `403 untrusted_workspace`,
`400 invalid_export_format`, `404 session_not_found` und den bestehenden
`409 session_archived`-, `session_archiving`- und
`session_conflict`-Verträgen.

## Capability und Kompatibilität

`workspace_session_export` ist eine bedingungslose v1-Capability, weil die
Plural-Route auch für einen vertrauenswürdigen Single-Workspace-Primary
nützlich ist, der per Id oder cwd gewählt wird. Trust wird weiterhin pro
Request ausgewertet. Der neue Tag ist unabhängig von
`multi_workspace_sessions` und kann nicht aus `session_export` oder
`workspace_qualified_rest_core` abgeleitet werden; veröffentlichte Daemons
bewerben beide älteren Tags, implementieren diese Route aber nicht.

Direkte SDK-Caller erhalten den normalen HTTP-Fehler, wenn sie die neue
Methode gegen einen älteren Daemon aufrufen. Die WebShell-Integration liegt
außerhalb dieser Änderung, sodass ihr bestehendes Primary-only-Export-Verhalten
unverändert bleibt.

## Nebenläufigkeit und Sicherheit

Der Export behält das bestehende geteilte Archive-Coordinator-Lock, gekeyed
nach Session-Id, sodass Archive und Delete die Datei während des Replays weder
verschieben noch entfernen können. Der Coordinator bleibt konservativ global:
Identische Ids in verschiedenen Workspaces können serialisiert werden, obwohl
ihre Dateien unabhängig sind. Das Umbenennen aller Archive-/Delete-Lock-Keys
liegt außerhalb dieser Änderung.

Anders als der begrenzte persistierte Transkript-Pager materialisiert der
volle Export das vollständige Transkript und ist für einen nicht
vertrauenswürdigen sekundären Workspace nicht verfügbar. Der bestehende
vertrauenswürdige Export erhält kein neues Response-Größen-Budget; ein
Workspace-spezifisches Limit hinzuzufügen würde die Plural- und
Legacy-Formatverträge auseinanderlaufen lassen. Daemon-Bearer-Authentifizierung,
die Default-GET-Read-Rate-Stufe und Pro-Request-Workspace-Trust-Prüfungen
gelten weiterhin.

Runtime-Entfernungs-Races verwenden die bei der Request-Auflösung gewählte
Runtime. Entfernung löscht keinen Transkript-Speicher, daher benötigt der
Export keinen Runtime-Lease und hält kein ACP-Kind am Leben.

## SDK und Observability

`WorkspaceDaemonClient.exportSession` verwendet die bestehenden
Export-Ergebnis- und Formattypen wieder und nutzt immer natives REST, auch
wenn der Eltern-Client einen ACP-Transport hat. Der geteilte Request-Helfer
bewahrt Token, Client-Identität, Timeout, Fehler-Parsing, Content-Type und
Attachment-Dateinamen-Verhalten.

Die Daemon-Telemetrie normalisiert den neuen Pfad als
`GET /workspaces/:workspace/session/:id/export`, dekodiert die Session-Id und
verwendet die Middleware-Workspace-Auflösung für den gewählten Workspace-Hash.

## Abgelehnte Alternativen

- Den Singular-Export nach live Owner zu routen scheitert bei inaktiven
  persistierten Sessions und macht den Besitz nach einem Neustart mehrdeutig.
- Eine `cwd`-Query zur Legacy-Route hinzuzufügen ändert einen
  Primary-only-Kompatibilitätsvertrag und ist weniger konsistent als
  bestehende Plural-Workspace-Routen.
- Bei einem Miss auf Primary zurückzufallen kann die Session eines anderen
  Workspaces exportieren, wenn Ids kollidieren.
- Nicht vertrauenswürdigen vollen Export zu erlauben würde die begrenzte
  Read-Policy umgehen, die für den persistierten Transkript-Pager entworfen
  wurde.

## Verifikation

Tests decken Capability-Advertising, Id-/cwd-Selectors, Same-Id-Isolation,
jedes Format, Response-Header, Trust- und Archiv-Grenzen, fehlende/unbekannte
Ziele, das Ausbleiben von Bridge-Aktivität, Telemetrie-Zuordnung,
SDK-Transport und -Kodierung sowie Archive-/Delete-Koordination ab. Die
End-to-End-Verifikation verwendet isolierte Runtime- und
Workspace-Verzeichnisse mit deterministischen persistierten Transkripten.
