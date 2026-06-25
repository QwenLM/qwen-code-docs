# Daemon-Web-UI-Adapter

## Ziel

Web-Chat- und Web-Terminal-Clients sollten `qwen serve` über die Daemon-HTTP/SSE-APIs konsumieren und ein clientseitiges Transkript rendern. Native lokale TUI-, Kanal- und IDE-Integrationen behalten vorerst ihre bestehenden Standardpfade.

## Gemeinsamer UI-Vertrag

Verwenden Sie die TypeScript-SDK-Daemon-UI-Exporte als gemeinsame Schnittstelle:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

Die Aufteilung ist:

- `DaemonClient` behandelt die Daemon-HTTP-Routen.
- `DaemonSessionClient` verwaltet die Sitzungserstellung/-anbindung und die SSE-Wiedergabe.
- `normalizeDaemonEvent()` konvertiert Daemon-Wire-Ereignisse in UI-Ereignisse.
- `createDaemonTranscriptStore()` reduziert UI-Ereignisse auf Transkript-Blöcke.

React-Clients können die optionale `@qwen-code/webui`-Bindung verwenden:

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

Minimale React-Struktur:

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

Der Provider erstellt oder bindet eine Daemon-Sitzung an, abonniert SSE, behält die letzte Ereignis-ID in `DaemonSessionClient` und stellt die Verbindung zum Stream standardmäßig wieder her. Aufrufer können dies mit `autoReconnect={false}` für Tests oder benutzerdefiniertes Verbindungsmanagement deaktivieren.

## Browser-Bereitstellungsformen

### Same-Origin-Lokaler-POC

Eine vom Daemon bereitgestellte Seite kann den Daemon direkt aufrufen, da die Seite und die API eine Herkunft teilen. Dies ist die bevorzugte frühe POC-Form für lokale Web-Chat- und Web-Terminal-Validierung.

### Remote-Web-Chat / Web-Terminal

Eine produktive Remote-Web-App sollte normalerweise mit einem Backend-for-Frontend kommunizieren. Das BFF besitzt die Daemon-URL, Token, Workspace-Routing und Sitzungsmetadaten und leitet dann browsersichere App-Ereignisse an den Browser weiter. Dadurch bleiben Bearer-Token außerhalb des Browser-Speichers und die Bereitstellung kann entscheiden, auf welchen Daemon/Workspace ein Benutzer zugreifen darf.

### Lokaler Browser gegen lokalen Daemon

Ein separater lokaler Entwicklungsserver hat eine andere Herkunft als `qwen serve`; er muss entweder Daemon-Routen über dieselbe Herkunft proxen oder vom Daemon bereitgestellt werden. Der Daemon lehnt willkürliche Browser-`Origin`-Anfragen absichtlich ab.

## Rendering-Verantwortlichkeiten

Das gemeinsame Transkriptmodell ist semantisch, nicht visuell. UI-Clients entscheiden, wie sie rendern:

- Benutzer- und Assistenten-Nachrichtenblöcke
- zusammengeklappte Gedankenblöcke
- Werkzeugstatuskarten
- Shell-Ausgabeblöcke
- Berechtigungsanfrage-Steuerelemente
- Status-/Fehler-/Debug-Blöcke

Das Web-Terminal ist ein browser-nativer semantischer Renderer. Es sollte sich terminalähnlich anfühlen mit Monospace-Layout, Scrollback, Prompt-Eingabe, Tastenkürzeln und Streaming-Blöcken, ist aber kein reiner PTY-Proxy und erfordert kein serverseitiges Ink-Rendering.

## Zusammenführungssicherheit

- Das native `qwen`-TUI bleibt direkt und unverändert.
- `--acp`-, Kanal- und IDE-Pfade bleiben standardmäßig unverändert.
- Der SDK-UI-Kern ist additiv.
- Die WebUI-React-Bindung ist optional und läuft nur in Clients, die sie importieren.
- Entfernter Daemon-TUI-Spike-Code sollte nicht als Produktmigration behandelt werden.

## Weitere Schritte

- Fügen Sie einen daemon-bereitgestellten lokalen `/web`-POC oder eine gleichwertige Same-Origin-Web-App hinzu.
- Erstellen Sie erstklassige Chat- und Terminal-Renderer auf Basis von Transkript-Blöcken.
- Fügen Sie umfangreichere typisierte Ereignisse nur hinzu, wo bestehende Daemon-Ereignisse für ein stabiles Browser-UI-Verhalten zu niedrigstufig sind.
- Erwägen Sie ein dediziertes `@qwen-code/daemon-ui-core`-Paket, wenn Nicht-SDK-Konsumenten den UI-Kern als unabhängige Abhängigkeit benötigen.
