# DaemonClient-Kurzanleitung (TypeScript)

Ein minimales End-to-End-Beispiel: Starten Sie einen `qwen serve`-Daemon in einem anderen Terminal und steuern Sie ihn dann über ein Node-Skript mit dem `DaemonClient` des SDK. Siehe auch: [Daemon-Modus-Benutzerhandbuch](../../users/qwen-serve.md) und [HTTP-Protokollreferenz](../qwen-serve-protocol.md).

## Einrichtung

In einem Terminal:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve hört auf http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

Gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 bindet sich jeder Daemon beim Start an einen Workspace (das aktuelle `cwd` oder überschreibbar mit `--workspace /path/to/dir`). Der gebundene Pfad des Daemons wird unter `/capabilities.workspaceCwd` bekannt gegeben, sodass Clients einen Pre-Flight-Check durchführen und `cwd` bei `POST /session` weglassen können.

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
  // ODER explizit übergeben, wenn Sie einen anderen Umgebungsvariablen-Namen haben:
  //   token: process.env.MY_TOKEN,
});

// 1. Bestätigen, dass wir den Daemon erreichen können, UI auf seine Funktionen prüfen
//    und den gebundenen Workspace des Daemons auslesen (#3803 §02).
const caps = await client.capabilities();
console.log('Daemon-Funktionen:', caps.features);
console.log('Daemon-Workspace:', caps.workspaceCwd); // kanonischer gebundener Pfad

// 2. Session erzeugen oder anhängen. Zwei gleichwertige Formen:
//    (a) `workspaceCwd: caps.workspaceCwd` explizit übergeben, oder
//    (b) `workspaceCwd` ganz weglassen – das SDK sendet dann kein `cwd`-Feld
//        und die Daemon-Route fällt auf ihren gebundenen Workspace zurück.
//        Form (b) ist prägnant, setzt aber voraus, dass Sie `caps.workspaceCwd`
//        als das vertrauen, was Sie beabsichtigt haben.
//    Ein nicht-leeres `workspaceCwd`, das nicht zum gebundenen Pfad des Daemons
//    kanonisiert, ergibt `400 workspace_mismatch` (siehe „Workspace-Konflikt" unten).
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
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

## Workspace-Datei-Hilfsfunktionen

Datei-Routen sind workspace-bezogen, nicht session-bezogen, daher befinden sie sich direkt auf `DaemonClient`:

```ts
const file = await client.readWorkspaceFile('src/main.ts');

const updated = await client.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` ist SHA-256 über die rohen Bytes auf der Festplatte. `mode: "replace"` und `editWorkspaceFile()` erfordern es, damit veraltete Clients keine Datei überschreiben, die sie nicht gerade gelesen haben. Schreiben/Bearbeiten erfordert auch bei Loopback die Konfiguration eines Bearer-Tokens; starten Sie den Daemon mit `--token` oder `QWEN_SERVER_TOKEN`, bevor Sie diese verwenden.

## Wiederverbindung mit `Last-Event-ID`

Wenn Ihr Client-Prozess mitten in einer Session neu startet, können Sie verpasste Ereignisse wiederholen:

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
  // Wählen Sie die gewünschte Option – `proceed_once`, `allow` usw.
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

Zwei Clients, die auf **denselben Daemon** zeigen, landen in derselben Session. Gemäß #3803 §02 ist jeder Daemon beim Start an EINEN Workspace gebunden, sodass der Daemon, der als `qwen serve --workspace /work/repo` (oder `cd /work/repo && qwen serve`) gestartet wurde, der ist, mit dem beide Clients verbinden:

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

Wenn `workspaceCwd` nicht mit dem gebundenen Workspace des Daemons übereinstimmt, lehnt `createOrAttachSession` mit `DaemonHttpError` ab, der Status `400` und einen strukturierten Body trägt:

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
        `Dieser Daemon ist an ${body.boundWorkspace} gebunden, ` +
          `nicht an ${body.requestedWorkspace}. Starten Sie einen separaten Daemon ` +
          `für diesen Workspace oder routen Sie zum richtigen.`,
      );
    }
  }
}
```

Multi-Workspace-Bereitstellungen führen einen Daemon pro Workspace auf separaten Ports aus – es gibt kein Intra-Daemon-Routing gemäß §02. Ein Orchestrator (oder der Launcher des Benutzers) wählt den richtigen Daemon basierend auf dem Projekt aus, mit dem der Client kommunizieren möchte.

## Authentifizierung

Wenn der Daemon mit einem Token gestartet wurde (jede Nicht-Loopback-Bindung erfordert einen):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK-Umgebungsfallback (PR 27, v0.16-alpha)** – `DaemonClient` liest `QWEN_SERVER_TOKEN` automatisch aus der Umgebung, wenn `token` weggelassen wird, und spiegelt damit das eigene `--token`-CLI-Fallback des Daemons wider. Wenn Ihre Shell also `export QWEN_SERVER_TOKEN=...` gesetzt hat, ist dies äquivalent zu obigem:

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

Wenn Ihr Benutzer Esc drückt:

```ts
await client.cancel(session.sessionId);
// Im Ereignisstrom sehen Sie den Prompt mit stopReason: "cancelled" aufgelöst.
```

Cancel beendet nur den **aktiven** Prompt – alles, was Sie bereits per POST gesendet haben und das noch dahinter in der Warteschlange steht, wird weiter ausgeführt. (Siehe Protokollreferenz für die Begründung.)

## Nächste Schritte

- [HTTP-Protokollreferenz](../qwen-serve-protocol.md) – vollständige Routenspezifikation mit Statuscodes
- [Daemon-Modus-Benutzerhandbuch](../../users/qwen-serve.md) – betreiberseitige Dokumentation
- Quelle: `packages/sdk-typescript/src/daemon/`