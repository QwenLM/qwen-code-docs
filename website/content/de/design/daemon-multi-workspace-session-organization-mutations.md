# Multi-Workspace-Session-Organisations-Mutationen

## Zusammenfassung

Fügt `PATCH /workspaces/:workspace/session/:id/organization` als
Workspace-qualifizierte Session-Organisations-Mutation hinzu.

Die Route wendet Pin-, Gruppen- und Farbänderungen auf den
Session-Organisationsspeicher an, der dem gewählten Workspace gehört. Sie
erweitert die bestehende Plural-REST-Oberfläche, ohne Capabilities, Request-
oder Response-Schemata, ACP oder UI-Verhalten zu ändern.

## Problem

Workspace-qualifizierte Session-Reads adressieren bereits den gewählten
Workspace. `GET /workspaces/:workspace/sessions` kann persistierte,
archivierte und Live-Sessions von einer vertrauenswürdigen Non-Primary-Runtime
zurückgeben und kann Organized-Views und Gruppenfilter gegen den
Organisationsspeicher dieser Runtime anwenden.

Die einzige Organisations-Mutation heute ist
`PATCH /session/:id/organization`. Diese Legacy-Route ist
Primary-Workspace-only. Folglich kann ein Client den Organisationszustand für
einen sekundären Workspace lesen, aber nicht über die passende
Workspace-qualifizierte REST-Oberfläche aktualisieren.

## Entscheidung

`PATCH /workspaces/:workspace/session/:id/organization` neben den anderen
Workspace-qualifizierten Session-Speicher-Routen registrieren.

Der `:workspace`-Selector löst exakt wie die bestehenden Plural-Routen auf:

1. Eine exakte registrierte Workspace-Id matchen.
2. Andernfalls einen absoluten cwd-Selector dekodieren und kanonisieren.
3. Den bestehenden Unknown-Workspace-Fehler zurückgeben, wenn keines auflöst.

Die gewählte Runtime ist der vollständige Scope der Operation. Session-Lookup,
Gruppenvalidierung, Organisations-Mutation und Persistenz verwenden alle das
Workspace-cwd und die Stores dieser Runtime. Der Handler fällt nie auf die
primäre Runtime zurück und durchsucht keinen anderen registrierten Workspace.

## Datenfluss

1. Der Request durchläuft die normale Host-, Bearer- und JSON-Middleware des
   Daemons.
2. Die Plural-Route löst `:workspace` auf eine registrierte Runtime auf.
3. Das Plural-Mutations-Trust-Gate verlangt, dass diese Runtime
   vertrauenswürdig ist.
4. Die Ziel-Runtime prüft `:id` in ihrem aktiven persistierten Store,
   archivierten persistierten Store oder ihrer Live-Bridge.
5. Der Request-Body durchläuft die bestehende
   Organisations-Request-Validierung.
6. Wenn `groupId` vorhanden und nicht null ist, validiert der Gruppen-Store
   der Ziel-Runtime diese Gruppe.
7. Der Organisationsspeicher der Ziel-Runtime wendet `isPinned`, `groupId`
   und `color` mit der bestehenden Semantik an.
8. Die Route gibt dieselbe Organisations-Response wie die Legacy-Mutation
   zurück.

Persistierte aktive Sessions, persistierte archivierte Sessions und passende
Live-only-Sessions sind gültige Ziele. Organisation bleibt Sidecar-Zustand:
Die Mutation schreibt weder Transkript-JSONL um noch ändert sie die
Transkript-Änderungszeit.

## Trust- und Fehlerreihenfolge

Plural-Routen-Konventionen bestimmen die beobachtbare Reihenfolge:

1. Ein unbekannter Workspace-Selector gibt die bestehende
   `400 { code: "workspace_mismatch" }`-Response zurück.
2. Ein bekannter, aber nicht vertrauenswürdiger Workspace gibt
   `403 { code: "untrusted_workspace" }` zurück, bevor die Existenz einer
   Session oder Gruppe offengelegt wird.
3. Eine Session, die in den aktiven, archivierten und Live-Mengen der
   gewählten Runtime fehlt, gibt das bestehende Session-not-found-`404`
   zurück.
4. Ungültige Organisations-Update-Felder geben den bestehenden
   Organisations-Validierungsfehler zurück, nachdem die vertrauenswürdige
   Ziel-Session gefunden wurde.
5. Eine nicht-null-Gruppen-Id, die im Gruppen-Store der gewählten Runtime
   fehlt, gibt `404 { code: "group_not_found" }` zurück.
6. Ein unlesbares Organisations-Sidecar gibt
   `500 { code: "session_organization_store_unreadable" }` zurück.

Archive- und Delete-Konflikte behalten die bestehenden
Archive-Coordinator-Fehler.

Es gibt in keiner Fehlerstufe einen Workspace-übergreifenden Fallback. Eine
Session oder Gruppe, die nur im primären Workspace existiert, bleibt
unbekannt, wenn ein sekundärer Workspace gewählt ist, und umgekehrt.

## Legacy-Kompatibilität

`PATCH /session/:id/organization` behält sein aktuelles Primary-only-Verhalten
bei, einschließlich Mutations-Gate, Validierung, Lookup, Persistenz,
Fehlerformen und Response-Schema. Bestehende Clients behalten daher dasselbe
Routing- und Duplicate-Id-Verhalten.

Clients verwenden die Plural-Mutation erst, nachdem sowohl
`session_organization` als auch `workspace_qualified_rest_core` beworben
werden. Es wird kein neuer Capability-Tag eingeführt.

## ACP-Verhalten

ACP-Dispatch ändert sich nicht. Der qualifizierte Dispatcher arbeitet bereits
auf `rt.bridge` und `rt.workspaceCwd`, sodass Workspace-qualifizierte
ACP-Session-Aktionen bereits an die gewählte Runtime gebunden sind. Diese
Änderung beschränkt sich auf die REST-Organisations-Mutation, die auf der
Plural-Oberfläche fehlte.

## Nebenläufigkeit und Store-Locks

`SessionOrganizationService` verwendet sein bestehendes Pro-Sidecar-Lock nur,
um Gruppen- und Session-Organisations-Read-Modify-Write-Operationen gegen
dasselbe Sidecar zu serialisieren. Der bestehende Archive-Coordinator
koordiniert Organisations-Updates mit Archive- und Delete-Übergängen. Diese
Route fügt kein daemonweites Lock und keine neue Service-übergreifende
Transaktion oder Atomaritätsgarantie hinzu.

## Testen und Akzeptanz

Die automatisierten Tests und die echte E2E-Akzeptanzstrategie decken
gemeinsam ab:

- Workspace-Id- und URL-kodierte kanonische cwd-Selectors erreichen dieselbe
  Runtime.
- Ein vertrauenswürdiger sekundärer Workspace kann die Organisation für aktive
  persistierte, archivierte persistierte und Live-only-Sessions mutieren.
- Pinnen, Gruppieren, Entgruppieren und unterstützte Farb- oder `null`-Updates
  geben die bestehende Response-Form zurück.
- Organisierte Listen und Pin-/Gruppenfilter spiegeln die Mutation wider.
- Der Organisationszustand überlebt Daemon-Neustarts für persistierte
  Sessions.
- Eine sekundäre Mutation ändert nicht den Organisationszustand des primären
  Workspaces.
- Die Legacy-Route bleibt Primary-only und gibt `404` für eine Session zurück,
  die nur in einem sekundären Workspace existiert.
- Bekannte nicht vertrauenswürdige Workspaces geben `403` vor dem Session-
  oder Gruppen-Lookup zurück.
- Unbekannte Selectors, unbekannte Ziel-scoped Sessions und unbekannte
  Ziel-scoped Gruppen geben ihre bestehenden Fehler ohne
  Workspace-übergreifenden Fallback zurück.

Die Akzeptanz umfasst zudem Build, Typecheck, fokussierte Routen- und
SDK-Tests sowie einen E2E-Durchlauf, der zwei vertrauenswürdige Workspaces
plus negative Trust- und Selector-Fälle abdeckt.

## Explizite Nicht-Ziele

Diese Änderung führt keinen Capability-Tag oder
Capability-Payload-Änderung ein, keine Request- oder Response-Schema-Änderung,
keine ACP-Verhaltensänderung und keine UI-Änderung. Sie macht die Legacy-Route
nicht Multi-Workspace-fähig, fügt keine Workspace-übergreifende
Session-Discovery hinzu und ändert keine Archiv-, Listen-, Gruppen- oder
Transkript-Semantik.
