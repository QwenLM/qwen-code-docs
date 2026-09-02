# DaemonClient-Kurzanleitung (TypeScript)

Ein minimales End-to-End-Beispiel: Starte einen `qwen serve`-Daemon in einem anderen Terminal und steuere ihn dann über ein Node-Skript mit dem `DaemonClient` des SDK. Siehe auch: [Daemon-Modus-Benutzerhandbuch](../../users/qwen-serve.md) und [HTTP-Protokollreferenz](../qwen-serve-protocol.md).

## Einrichtung

In einem Terminal:

```bash
qwen serve --port 4170 \
  --workspace /path/to/project-a \
  --workspace /path/to/project-b
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/project-a)
```

Jeder `--workspace`-Wert muss ein absolutes Verzeichnis sein. Der erste Start-Workspace ist primär und bleibt die Kompatibilitäts-Standardvorgabe für Requests, die `cwd` weglassen; `/capabilities.workspaces[]` ist der Katalog, den Clients verwenden sollten, wenn sie eine Runtime explizit auswählen.

In einem anderen:

```bash
npm install @qwen-code/sdk
```

## Hallo Daemon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): Wenn `token` weggelassen wird, greift DaemonClient
  // automatisch auf `process.env.QWEN_SERVER_TOKEN` zurück – dieselbe Umgebungsvariable,
  // auf die auch das `--token`-CLI-Flag des Daemons zurückfällt. Entweder:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # einmalig
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # benutzerverwaltete Datei
  //   const client = new DaemonClient({ baseUrl: '...' });
  // ODER explizit übergeben, wenn du einen anderen Umgebungsvariablen-Namen hast:
  //   token: process.env.MY_TOKEN,
});

// 1. Bestätigen, dass wir den Daemon erreichen können, UI auf seine Funktionen prüfen
//    und einen vertrauenswürdigen Workspace aus dem beworbenen Katalog auswählen.
const caps = await client.capabilities();
console.log('Daemon-Funktionen:', caps.features);
const selectedWorkspace =
  caps.workspaces?.find(
    (workspace) => workspace.trusted && !workspace.primary,
  ) ?? caps.workspaces?.find((workspace) => workspace.trusted);
if (!selectedWorkspace) throw new Error('Kein vertrauenswürdiger Workspace verfügbar');
console.log('Ausgewählter Workspace:', selectedWorkspace.id, selectedWorkspace.cwd);

// 2. Innerhalb dieser Runtime erzeugen oder anhängen. Das SDK mappt `workspaceCwd`
//    auf das Wire-level POST /session `cwd`-Feld. Es wegzulassen ist nur erlaubt,
//    wenn der Caller absichtlich den Legacy-Primär-Standard will.
const session = await client.createOrAttachSession({
  workspaceCwd: selectedWorkspace.cwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Ereignisstrom abonnieren. `lastEventId: 0` übergeben, damit der Daemon
//    alles vom Start der Session an wiederholt – ohne entsteht ein TOCTOU-Fenster
//    zwischen dem Zurückgeben des Iterators durch `subscribeEvents()` und der
//    tatsächlichen Öffnung der zugrunde liegenden SSE-Verbindung (ein Fetch-Roundtrip),
//    in dem ein schnell startender Agent Ereignisse aussenden kann, die in den
//    Session-Ring-Puffer gelangen, aber nicht an einen frischen Abonnenten ohne Cursor
//    gestreamt werden. `lastEventId: 0` lässt den Wiederholungspuffer diese Lücke
//    abdecken (und jede spätere Wiederverbindung – siehe unten).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Prompt senden und auf Abschluss warten. (Hinweis zur Reihenfolge: Selbst wenn
//    `prompt()` vor dem Abschluss des SSE-Handshakes feuert, garantiert
//    `lastEventId: 0` aus Schritt 3, dass jedes Ereignis im Iterator landet.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Fasse src/main.ts in einem Satz zusammen.' }],
});
console.log('Stop-Grund:', result.stopReason);

// 5. Abonnement beenden, damit das Skript beenden kann.
abort.abort();
await subscription;

function handleEvent(event: DaemonEvent): void {
  switch (event.type) {
    case 'session_update': {
      const data = event.data as {
        sessionUpdate: string;
        content?: { text?: string };
      };
      if (data.sessionUpdate === 'agent_message_chunk' && data.content?.text) {
        process.stdout.write(data.content.text);
      }
      break;
    }
    case 'permission_request':
      // Siehe „Abstimmung über Berechtigungen" unten für First-Responder-Semantik.
      console.log('\n[Berechtigung erforderlich]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[Berechtigung erteilt]', event.data);
      break;
    case 'session_died':
      console.error('\n[Agent abgestürzt]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## Workspace-Datei-Helpers

Datei-Routen sind workspace-bezogen, nicht session-bezogen. Binde einen qualifizierten Helper
an die ausgewählte Workspace-ID, damit jeder Request innerhalb dieser Runtime bleibt:

```ts
const selected = client.workspaceById(selectedWorkspace.id);
const file = await selected.readWorkspaceFile('src/main.ts');

const updated = await selected.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` ist SHA-256 über die rohen Bytes auf der Festplatte. `mode: "replace"` und
`editWorkspaceFile()` erfordern es, damit veraltete Clients keine Datei überschreiben, die sie nicht gerade gelesen haben. Schreiben/Bearbeiten akzeptiert den Token-losen Trusted-Loopback-Primary-Listener; nicht vertrauenswürdige Deployments erfordern Bearer- oder Pairing-Credentials.

## Wiederverbindung mit `Last-Event-ID`

Wenn dein Client-Prozess mitten in einer Session neu startet, wiederhole verpasste Ereignisse:

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // Fortsetzen ab nach dieser ID; undefined = nur live
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

Der Daemon speichert die letzten 8000 Ereignisse pro Session in einem Ringpuffer; Lücken jenseits dieses Fensters können nicht erneut zugestellt werden.

## Abstimmung über Berechtigungen

Wenn der Agent um Erlaubnis zur Ausführung eines Tools bittet, sieht jeder verbundene Client das `permission_request`-Ereignis. **Der erste Antwortende gewinnt** – sobald ein Client abgestimmt hat, erhalten die anderen einen `404`, wenn sie versuchen, über dieselbe `requestId` abzustimmen.

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Wähle die gewünschte Option – `proceed_once`, `allow` usw.
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Ein anderer Client hat zuerst abgestimmt; nichts zu tun.');
  }
  break;
}
```

## Gemeinsame Session-Zusammenarbeit

Zwei Clients, die auf **denselben Daemon-Workspace** zeigen, landen in derselben Session, wenn sie den Standard-`sessionScope: 'single'` verwenden. Für einen Single-Workspace-Daemon, der als `qwen serve --workspace /work/repo` (oder `cd /work/repo && qwen serve`) gestartet wurde, verbinden sich beide Clients mit diesem primären Workspace:

```ts
// Daemon wurde als `qwen serve --workspace /work/repo` gestartet, daher
// ist `caps.workspaceCwd === '/work/repo'` für beide Clients.

// Client A (z. B. ein IDE-Plugin)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false – A hat den Agent gestartet

// Client B (z. B. ein Web-UI auf demselben Rechner)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true – B ist zu A's Session beigetreten
console.log(a.sessionId === b.sessionId); // true
```

Beide Clients sehen denselben `session_update`-/`permission_request`-Stream. Beide können einen Prompt senden; sie werden FIFO-queued gemäß der „ein aktiver Prompt pro Session"-Garantie des Agents.

## Workspace-Konflikt

Wenn `workspaceCwd` nicht mit einem registrierten beworbenen Workspace übereinstimmt, lehnt `createOrAttachSession` mit `DaemonHttpError` ab, der Status `400` und einen strukturierten Body trägt. Ein registrierter, aber nicht vertrauenswürdiger Secondary gibt stattdessen `403 untrusted_workspace` zurück und darf nicht gegen primär retried werden:

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.createOrAttachSession({ workspaceCwd: '/some/other/project' });
} catch (err) {
  if (err instanceof DaemonHttpError && err.status === 400) {
    const body = err.body as {
      code?: string;
      boundWorkspace?: string;
      requestedWorkspace?: string;
    };
    if (body.code === 'workspace_mismatch') {
      console.error(
        `Workspace ${body.requestedWorkspace} ist nicht registriert. ` +
          `Aktualisiere Capabilities und wähle einen beworbenen Workspace, ` +
          `oder registriere ihn vor dem erneuten Versuch.`,
      );
    }
  }
}
```

Retry nach einem Konflikt nicht gegen den primären Workspace. Aktualisiere `/capabilities`, wähle den beabsichtigten Eintrag aus `workspaces[]`, oder registriere einen geeigneten dynamischen Workspace über `POST /workspaces`. Verwende separate Daemons nur, wenn Authentifizierung, Rate-Limit- oder Prozess-Fehlerschranken ebenfalls unabhängig sein müssen.

## Authentifizierung

Wenn der Daemon mit einem Token gestartet wurde (jede Nicht-Loopback-Bindung erfordert einen):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK-Umgebungsfallback (PR 27, v0.16-alpha)** – `DaemonClient` liest `QWEN_SERVER_TOKEN` automatisch aus der Umgebung, wenn `token` weggelassen wird, und spiegelt damit das eigene `--token`-CLI-Fallback des Daemons wider. Wenn deine Shell also `export QWEN_SERVER_TOKEN=...` gesetzt hat, ist dies äquivalent zu obigem:

```ts
// Gleicher Effekt wie token: process.env.QWEN_SERVER_TOKEN, aber ohne Boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

Der Fallback entfernt führende/nachfolgende Leerzeichen (praktisch für `export QWEN_SERVER_TOKEN="$(cat token.txt)"`, wo `cat` einen Zeilenumbruch hinzufügt) und behandelt leere / nur-Whitespace-Werte als nicht gesetzt (ein veraltetes `export QWEN_SERVER_TOKEN=""` sendet nicht versehentlich `Authorization: Bearer ` ohne Token). Der Fallback wird einmal bei der Konstruktion ausgeführt; spätere `process.env`-Mutationen wirken sich nicht auf bereits erstellte Clients aus. Browser-Bundles (z. B. über `@qwen-code/webui`) erhalten sauber `undefined`, da `globalThis.process` dort nicht existiert.

Falsche/fehlende Tokens geben `401` mit einem einheitlichen Body zurück – das SDK wirft `DaemonHttpError` bei jedem 4xx/5xx von einem Route-Handler.

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Daemon-Fehler ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## Einen laufenden Prompt abbrechen

Wenn dein Benutzer Esc drückt:

```ts
await client.cancel(session.sessionId);
// Im Ereignisstrom siehst du den Prompt mit stopReason: "cancelled" aufgelöst.
```

Cancel baut nur den **aktiven** Prompt ab – alles, was du bereits per POST gesendet hast und das noch dahinter in der Warteschlange steht, wird weiter ausgeführt. (Siehe Protokollreferenz für die Begründung.)

## Nächste Schritte

- [HTTP-Protokollreferenz](../qwen-serve-protocol.md) – vollständige Routenspezifikation mit Statuscodes
- [Daemon-Modus-Benutzerhandbuch](../../users/qwen-serve.md) – betreiberseitige Dokumentation
- Quelle: `packages/sdk-typescript/src/daemon/`
