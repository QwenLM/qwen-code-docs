# DaemonClient-Schnellstart (TypeScript)

Ein minimales End-to-End-Beispiel: Starten Sie einen `qwen serve`-Daemon in einem anderen Terminal und steuern Sie ihn über ein Node-Skript mit dem `DaemonClient` des SDKs. Siehe auch: [Daemon-Modus-Benutzerhandbuch](../../users/qwen-serve.md) und [HTTP-Protokoll-Referenz](../qwen-serve-protocol.md).

## Einrichtung

In einem Terminal:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve hört auf http://127.0.0.1:4170 (Modus=http-bridge, Arbeitsverzeichnis=/path/to/your-project)
```

Gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 bindet sich jeder Daemon beim Start an ein Arbeitsverzeichnis (das aktuelle `cwd` oder überschreibbar mit `--workspace /path/to/dir`). Der gebundene Pfad des Daemons wird unter `/capabilities.workspaceCwd` bekannt gegeben, sodass Clients eine Vorabprüfung durchführen und `cwd` bei `POST /session` weglassen können.

In einem anderen Terminal:

```bash
npm install @qwen-code/sdk
```

## Hallo Daemon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): Wenn `token` weggelassen wird, greift DaemonClient
  // automatisch auf `process.env.QWEN_SERVER_TOKEN` zurück – dieselbe
  // Umgebungsvariable, auf die auch das `--token`-CLI-Flag des Daemons
  // zurückfällt. Also entweder:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # einmalig
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # benutzerverwaltete Datei
  //   const client = new DaemonClient({ baseUrl: '...' });
  // ODER explizit übergeben, wenn Sie einen anderen Umgebungsvariablennamen haben:
  //   token: process.env.MY_TOKEN,
});

// 1. Bestätigen, dass wir den Daemon erreichen können, Benutzeroberfläche auf seinen
//    Funktionen basieren und das gebundene Arbeitsverzeichnis des Daemons auslesen (#3803 §02).
const caps = await client.capabilities();
console.log('Daemon-Funktionen:', caps.features);
console.log('Daemon-Arbeitsverzeichnis:', caps.workspaceCwd); // kanonischer gebundener Pfad

// 2. Eine Sitzung erzeugen oder wiederherstellen. Zwei gleichwertige Varianten:
//    (a) `workspaceCwd: caps.workspaceCwd` übergeben, um explizit zu sein, oder
//    (b) `workspaceCwd` ganz weglassen – das SDK sendet dann kein `cwd`-Feld,
//        und die Daemon-Route fällt auf ihr gebundenes Arbeitsverzeichnis zurück.
//        Variante (b) ist prägnant, setzt aber voraus, dass Sie darauf vertrauen,
//        dass `caps.workspaceCwd` das ist, was Sie beabsichtigt haben.
//    Ein nicht leeres `workspaceCwd`, das nicht zum gebundenen Pfad des Daemons
//    kanonisiert, führt zu `400 workspace_mismatch` (siehe „Arbeitsverzeichnis-Konflikt“ unten).
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`Sitzung=${session.sessionId} wiederhergestellt=${session.attached}`);

// 3. Den Ereignisstrom abonnieren. `lastEventId: 0` übergeben, damit der Daemon
//    alle Ereignisse seit Sitzungsbeginn wiederholt – ohne dies gibt es ein
//    TOCTOU-Fenster zwischen dem Abruf des Iterators mit `subscribeEvents()`
//    und dem tatsächlichen Öffnen der zugrunde liegenden SSE-Verbindung
//    (ein HTTP-Roundtrip), in dem ein schnell startender Agent Ereignisse
//    aussenden kann, die zwar in den sitzungsspezifischen Ringpuffer gehen,
//    aber nicht an einen frischen Abonnenten ohne Cursor gestreamt werden.
//    `lastEventId: 0` deckt dieses Fenster mit dem Wiedergabepuffer ab
//    (und später auch jede Wiederverbindung – siehe unten).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Eine Aufforderung senden und warten, bis die Antwort vollständig ist.
//    (Hinweis zur Reihenfolge: Selbst wenn `prompt()` vor dem Abschluss
//    des SSE-Handshakes aufgerufen wird, stellt `lastEventId: 0` aus Schritt 3
//    sicher, dass jedes Ereignis im Iterator landet.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Fasse src/main.ts in einem Satz zusammen.' }],
});
console.log('Stoppgrund:', result.stopReason);

// 5. Das Abonnement auflösen, damit das Skript beendet werden kann.
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
      // Siehe „Abstimmen über Berechtigungen“ unten für die Semantik des Erstantworters.
      console.log('\n[Berechtigung erforderlich]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[Berechtigung erteilt/verweigert]', event.data);
      break;
    case 'session_died':
      console.error('\n[Agent abgestürzt]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## Arbeitsverzeichnis-Dateihilfen

Dateioperationen sind auf das Arbeitsverzeichnis bezogen, nicht auf die Sitzung, daher befinden sie sich direkt auf dem `DaemonClient`:

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
`expectedHash` ist der SHA-256-Hash über die rohen Bytes auf der Festplatte. `mode: "replace"` und `editWorkspaceFile()` benötigen ihn, damit veraltete Clients keine Datei überschreiben, die sie nicht gerade gelesen haben. Schreiben/Bearbeiten erfordert auch bei Loopback die Konfiguration eines Bearer-Tokens; starten Sie den Daemon mit `--token` oder `QWEN_SERVER_TOKEN`, bevor Sie diese Funktionen nutzen.

## Neuverbinden mit `Last-Event-ID`

Wenn Ihr Client-Prozess mitten in einer Sitzung neu startet, spielen Sie verpasste Ereignisse nach:

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // Fortsetzen ab dieser ID; undefined = nur Live-Ereignisse
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

Der Daemon behält die letzten 8000 Ereignisse pro Sitzung in einem Ringpuffer; Lücken außerhalb dieses Fensters können nicht erneut zugestellt werden.

## Abstimmung über Berechtigungen

Wenn der Agent um Erlaubnis zur Ausführung eines Tools bittet, sieht jeder verbundene Client das Ereignis `permission_request`. **Der erste Antwortende gewinnt** – sobald ein Client abstimmt, erhalten die anderen `404`, wenn sie versuchen, über dieselbe `requestId` abzustimmen.

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Wählen Sie eine beliebige Option – `proceed_once`, `allow`, etc.
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

## Gemeinsame Sitzungen – Zusammenarbeit

Zwei Clients, die auf **denselben Daemon** zeigen, landen in derselben Sitzung. Gemäß #3803 §02 ist jeder Daemon beim Start an EINEN Workspace gebunden, sodass der als `qwen serve --workspace /work/repo` (oder `cd /work/repo && qwen serve`) gestartete Daemon von beiden Clients verwendet wird:

```ts
// Der Daemon wurde als `qwen serve --workspace /work/repo` gestartet, also
// ist `caps.workspaceCwd === '/work/repo'` für beide Clients.

// Client A (z. B. ein IDE-Plugin)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false – A hat den Agenten erzeugt

// Client B (z. B. eine Weboberfläche auf derselben Maschine)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true – B ist A's Sitzung beigetreten
console.log(a.sessionId === b.sessionId); // true
```

Beide Clients sehen denselben `session_update`/`permission_request`-Stream. Jeder kann eine Eingabeaufforderung senden; sie werden per FIFO-Warteschlange gemäß der Garantie des Agenten „eine aktive Eingabe pro Sitzung“ verarbeitet.

## Workspace-Konflikte

Wenn `workspaceCwd` nicht mit dem gebundenen Workspace des Daemons übereinstimmt, lehnt `createOrAttachSession` mit `DaemonHttpError` ab, der den Status `400` und einen strukturierten Body trägt:

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
          `für diesen Workspace oder leiten Sie zum richtigen weiter.`,
      );
    }
  }
}
```

Multi-Workspace-Bereitstellungen führen einen Daemon pro Workspace auf separaten Ports aus – es gibt kein Intra-Daemon-Routing gemäß §02. Ein Orchestrator (oder der Startmechanismus des Benutzers) wählt den richtigen Daemon basierend auf dem Projekt aus, mit dem der Client kommunizieren möchte.

## Authentifizierung

Wenn der Daemon mit einem Token gestartet wurde (jede Nicht-Loopback-Bindung erfordert eines):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK-Umgebungsfallback (PR 27, v0.16-alpha)** – `DaemonClient` liest automatisch `QWEN_SERVER_TOKEN` aus der Umgebung, wenn `token` weggelassen wird, und spiegelt damit den eigenen `--token`-CLI-Fallback des Daemons wider. Wenn Ihre Shell also `export QWEN_SERVER_TOKEN=...` gesetzt hat, ist Folgendes äquivalent zu obigem:

```ts
// Gleicher Effekt wie token: process.env.QWEN_SERVER_TOKEN, aber ohne den Boilerplate-Code.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

Der Fallback entfernt führende/nachfolgende Leerzeichen (praktisch für `export QWEN_SERVER_TOKEN="$(cat token.txt)"` wenn `cat` einen Zeilenumbruch hinzufügt) und behandelt leere oder nur aus Leerzeichen bestehende Werte als nicht gesetzt (ein alter `export QWEN_SERVER_TOKEN=""` wird nicht versehentlich `Authorization: Bearer ` ohne Token senden). Der Fallback wird einmalig bei der Konstruktion ausgeführt; spätere Änderungen an `process.env` beeinflussen bereits erstellte Clients nicht. Browser-Bundles (z. B. über `@qwen-code/webui`) erhalten sauber `undefined`, da `globalThis.process` dort nicht existiert.

Falsche/fehlende Token geben `401` mit einem einheitlichen Body zurück – das SDK wirft `DaemonHttpError` bei jedem 4xx/5xx von einem Routen-Handler.
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

## Ein laufendes Prompt abbrechen

Wenn Ihr Benutzer die Esc-Taste drückt:

```ts
await client.cancel(session.sessionId);
// Im Event-Stream sehen Sie, dass das Prompt mit stopReason: "cancelled" aufgelöst wird.
```

Cancel fährt nur das **aktive** Prompt herunter – alles, was Sie bereits per POST gesendet haben und sich noch in der Warteschlange dahinter befindet, wird weiterhin ausgeführt. (Siehe Protokollreferenz für die Begründung.)

## Weiterführende Themen

- [HTTP-Protokollreferenz](../qwen-serve-protocol.md) — vollständige Routenspezifikation mit Statuscodes
- [Benutzerhandbuch für den Daemon-Modus](../../users/qwen-serve.md) — Dokumentation für Betreiber
- Quelle: `packages/sdk-typescript/src/daemon/`
```
