# ACP-Preheat-Vertrag und Kompatibilität

## Kontext

Der Daemon stellt `POST /workspace/acp/preheat` und
`GET /workspace/acp/status` bereit, aber veröffentlichte Clients können diese
Routen nicht über `/capabilities` entdecken. Das TypeScript-SDK sendet beide
Aufrufe außerdem standardmäßig über seinen aktiven ACP-Transport, obwohl es
sich um Daemon-REST-Control-Plane-Routen handelt. Schließlich löscht ein
HTTP-Waiter, der in einen Timeout läuft, aktuell den geteilten Preheat-Promise
des Workspace-Service, während die darunterliegende Channel-Initialisierung
weiterläuft.

Diese Änderung macht die bestehenden Routen des primären Workspaces
auffindbar und zuverlässig. Sie führt keinen dauerhaften Readiness-Zustand ein
und verschiebt die Barriere der ersten Session nicht. Eine Session bleibt die
autoritative Operation: Preheat und Session-Erstellung verschmelzen über die
geteilte Channel-Initialisierung der Bridge, und die Session-Erstellung
revalidiert den Channel nach jedem Point-in-Time-Status oder jeder
Preheat-Response.

## Capabilities und Scope

Der Daemon kündigt zwei Always-on-v1-Capability-Tags an:

- `workspace_acp_preheat` für `POST /workspace/acp/preheat`
- `workspace_acp_status` für `GET /workspace/acp/status`

Jedes Tag bedeutet, dass der benannte Routenvertrag existiert. Kein Tag sagt
aus, dass der ACP-Channel gerade live ist. Die Routen bleiben singulär und auf
den primären Workspace beschränkt. Clients dürfen sie nicht für einen
sekundären Workspace nutzen oder von einem sekundären Workspace auf die
primäre Runtime zurückfallen.

Workspace-qualifiziertes ACP-Warmup erfordert separate Ownership-, Trust-,
Drain- und Ressourcenlimit-Semantik und liegt außerhalb dieser Änderung.

## Response-Semantik

`GET /workspace/acp/status` liefert einen Point-in-Time-Snapshot:

```ts
{
  channelLive: boolean;
}
```

`POST /workspace/acp/preheat` behält seine bestehende Response-Form:

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

Die folgenden Invarianten gelten:

- `ready` entspricht immer `channelLive`.
- Ein Live-Snapshot liefert `ready: true` ohne `reason` oder `error`.
- Ein Waiter-Timeout liefert `reason: 'timeout'` nur, wenn der Channel beim
  Aufbau der Response immer noch nicht live ist.
- Eine fehlgeschlagene Initialisierung oder ein abgeschlossenes Preheat, das
  keinen Live-Channel erzeugt hat, liefert `reason: 'error'`.
- `durationMs` ist eine endliche, nicht negative Ganzzahl, gemessen mit einer
  monotonen Uhr. Es ist die verstrichene Zeit des aktuellen HTTP-Aufrufs,
  nicht die Lebensdauer einer geteilten Initialisierung, der sich der Aufruf
  möglicherweise angeschlossen hat.
- Client-sichtbarer Fehlertext ist stabil und sanitisiert. Detaillierte
  Kindprozess-Fehler bleiben in den Daemon-Logs.

Operativer Timeout und Initialisierungsfehler nutzen weiterhin HTTP 200, damit
bestehende Clients das Ergebnis inspizieren können. Ungültige Eingabe,
Authentifizierung, Rate Limit und Startfehler der deferred Runtime behalten
ihre bestehenden HTTP-Fehlerverträge.

## Parallelitäts- und Fehlerverhalten

Der Workspace-Service hält einen geteilten Preheat-Promise, bis dieser Promise
settled. Jeder Request raced denselben Promise gegen seinen eigenen Timeout.
Ein Waiter-Timeout beendet nur diesen Request; er cancelt weder die
Bridge-Operation noch löscht er den geteilten Promise. Settlement löscht den
Promise nur, wenn seine Identität noch mit der aktuellen geteilten Operation
übereinstimmt, sodass ein älterer Abschluss einen neueren Versuch nicht
löschen kann.

Sobald die geteilte Operation settled ist, darf ein späterer Request erneut
versuchen, wenn der Channel nicht live ist. Ein Channel, der nach einer
erfolgreichen Response exited, ist nicht durch einen Lease abgedeckt: Status
meldet den neuen Snapshot, und die nächste Session oder das nächste Preheat
startet einen neuen Channel.

## Client-Kompatibilität

Das TypeScript-SDK sendet beide Routen über seinen REST-Fetch-Pfad, unabhängig
vom konfigurierten ACP-Transport. Es ruft Capabilities nicht automatisch ab;
Caller entscheiden, wann sie preflighten.

Das Web UI nutzt die Routen nur in seinem deferred Bootstrap-Flow ohne Session.
Es verlangt `workspace_acp_preheat`, gatet die optionale
Status-Optimierung auf `workspace_acp_status` und verlangt, dass der effektive
Workspace exakt mit `capabilities.workspaceCwd` übereinstimmt. Ein exakter
Vergleich kann ein Preheat für eine alternative Schreibweise des primären
Pfads konservativ überspringen, aber er kann nicht die falsche Runtime wärmen.

Wenn ein älterer Daemon die Capabilities auslässt, stellt das Web UI keine
ACP-Status- oder Preheat-Requests, und die erste Session folgt dem bestehenden
Lazy-Initialisierungspfad. Ein Preheat-Fehler bleibt Best-Effort und kann
Verbindungs- oder Session-Erstellung nicht fehlschlagen lassen.

## Nicht-Ziele

- Preheat vor der ersten Session abwarten
- Preheat im Daemon- oder Web-UI-Start weiter nach vorne ziehen
- Readiness-Lease, Generation, Token oder Protokollversions-Bump
- Geteilte Channel-Initialisierung canceln, wenn ein HTTP-Waiter in den
  Timeout läuft
- Workspace-qualifizierte ACP-Preheat- oder Status-Routen
- Eine Latenzverbesserung durch diese reine Vertragsänderung behaupten
