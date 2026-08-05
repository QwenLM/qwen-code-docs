# Daemon-Multi-Workspace-Session-Rewind und -Shell

## Status

Finales Implementierungsdesign. Dieses Dokument ersetzt die
Phase-2a-Primary-only-Aussage für Live-Session-Rewind-Snapshots, Rewind und
Shell.

## Problem

Der Daemon exponiert Singular-Session-APIs, während ein Multi-Workspace-Daemon
eine Bridge pro Workspace-Runtime besitzt. Die meisten Live-Session-Routen
lösen bereits den Session-Owner auf, aber Rewind-Snapshots, Rewind und Shell
waren weiterhin an die primäre Bridge gebunden oder lehnten einen sekundären
Owner ab. Dadurch war eine gültige Live-Sekundär-Session für Clients nicht von
einer nicht unterstützten Route zu unterscheiden.

## Entscheidung

Die Singular-REST-API behalten und die besitzende Live-Runtime bei jedem
Request auflösen:

- `GET /session/:id/rewind/snapshots` verwendet Owner-bewusstes Read-Routing.
- `POST /session/:id/rewind` und `POST /session/:id/shell` verwenden
  Owner-bewusstes Mutable-Routing und den geteilten
  Session-Archive-Coordinator.
- SDK-Rewind-Aufrufe wählen immer direktes REST, auch wenn der Client mit
  ACP-Transport konfiguriert ist. Dies bewahrt das strikte REST-Mutations-Gate.
- SDK-Shell behält seinen konfigurierten Transport. Der Default-REST-Transport
  erhält Owner-Routing; ein Workspace-qualifizierter ACP-Client behält
  `_qwen/session/shell`.
- Es wird keine Workspace-qualifizierte Session-REST-API, keine
  ACP-Rewind-Methode, keine Core-Änderung, keine ACP-Kind-Änderung und keine
  FileHistory-Migration eingeführt.

## Ownership und Autorisierung

Die Workspace-Registry durchsucht alle Live-Bridge-Zusammenfassungen nach der
Session-Id. Genau ein vertrauenswürdiger Owner dispatched an diese Runtime.
Kein Owner gibt `404 session_not_found` zurück; ein nicht vertrauenswürdiger
Owner gibt `403 untrusted_workspace` zurück; mehrere Owner geben
`500 ambiguous_session_owner` zurück. Alle drei Ergebnisse treten auf, bevor
die Ziel-Bridge-Operation läuft. Persistierte Sessions müssen zuerst in eine
Runtime geladen oder resumed werden.

Rewind und Shell behalten `mutate({ strict: true })`. Shell verlangt
zusätzlich effektive Shell-Aktivierung, eine gültige Session-gebundene
Client-Id und einen nicht-leeren Befehl. Rewind leitet eine optionale
Client-Id weiter und akzeptiert `rewindFiles` nur, wenn weggelassen oder
boolean. Weglassen bedeutet `true`; jeder andere JSON-Typ gibt
`400 invalid_rewind_files_flag` zurück.

## Verhaltenstrennungen

Shell startet im cwd des besitzenden Session-Workspaces und ist keine
Filesystem-Pfad-Sandbox. Rewind stellt nur Snapshots wieder her, die für
`edit` und `write_file` aufgezeichnet wurden. Es macht keine Shell-, Git-,
Skript- oder manuellen Änderungen rückgängig. Die Datei-Wiederherstellung ist
best-effort: die Konversation möglicherweise bereits rewound, wenn die
Response `rewound: false` mit `filesFailed[]` meldet. Aktive Prompts behalten
`409 session_busy` und `Retry-After: 5`; ungültige Ziele behalten
`400 invalid_rewind_target`. Die WebShell fragt weiterhin `rewindFiles: false`
an.

Das bestehende `~/.qwen/file-history/<sessionId>`-Layout ist unverändert. Eine
Live-UUID-Kollision scheitert daher fail-closed über Owner-Mehrdeutigkeit,
statt die primäre Runtime auszuwählen.

## Capabilities

`multi_workspace_session_rewind` wird nur beworben, solange mehr als eine
Runtime existiert. `multi_workspace_session_shell` erfordert zusätzlich
effektive Session-Shell-Aktivierung, was sowohl den Enable-Flag als auch einen
konfigurierten Token bedeutet.

Client-Preflight ist additiv:

- Primary-Rewind: `session_rewind`.
- Secondary-Rewind: `session_rewind` und
  `multi_workspace_session_rewind`.
- Primary-Shell: `session_shell_command`.
- Secondary-Shell: `session_shell_command` und
  `multi_workspace_session_shell`.

ACP-native Clients verwenden initialize `_qwen.methods`; der Daemon bewirbt
keine ACP-Rewind-Vendor-Methode.

## Verifikation

Unit-Coverage fixiert Owner-Dispatch, null Aufrufe an nicht besitzende
Bridges, Trust- und Mehrdeutigkeitsfehler, strikte Validierungsreihenfolge,
`rewindFiles`-Semantik, SDK-REST-Fallback, unveränderten Shell-Transport,
bedingtes Capability-Advertising und das Fehlen von ACP-Rewind-Mappings.
ACP-Workspace-Tests behalten die Invariante, dass eine A-Verbindung eine
B-Session nicht bedienen kann, während eine Workspace-qualifizierte B-Shell
gelingt.

Das E2E-Szenario erzeugt eine Session und verfolgte Edits in Workspace B,
verifiziert, dass Snapshots und Shell-cwd B-scoped sind, prüft beide
Rewind-Datei-Modi, beweist, dass eine Shell-erzeugte Datei Rewind überlebt,
und zeichnet Busy-, Teil-Wiederherstellungs- und
Nicht-vertrauenswürdiger-Sekundär-Ergebnisse auf.
