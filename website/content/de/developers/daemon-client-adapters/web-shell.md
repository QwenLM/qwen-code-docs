# WebShell-Daemon-Adapter

## Ziel

Web-Chat- und Web-Terminal-Clients sollten `qwen serve` über die
Daemon-HTTP/SSE-APIs konsumieren und ein clientseitiges Transkript rendern. Native lokale TUI-,
Channel- und IDE-Integrationen behalten vorerst ihre bestehenden Standardpfade.

## Gemeinsamer UI-Vertrag

Verwende die TypeScript-SDK-Daemon-UI-Exports als gemeinsame Grenze:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

Die Aufteilung ist:

- `DaemonClient` verarbeitet Daemon-HTTP-Routen.
- `DaemonSessionClient` verwaltet Session-Erstellung/Anhängen und SSE-Replay.
- `normalizeDaemonEvent()` konvertiert Daemon-Wire-Events in UI-Events.
- `createDaemonTranscriptStore()` reduziert UI-Events in Transkript-Blöcke.

React-Clients können das von WebShell exportierte Binding verwenden:

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
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
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

Der Provider erstellt oder hängt eine Daemon-Session an, abonniert SSE, speichert die letzte Event-ID
auf dem `DaemonSessionClient` und verbindet den Stream standardmäßig erneut. Caller können dies
mit `autoReconnect={false}` für Tests oder benutzerdefiniertes Verbindungsmanagement deaktivieren.

## Browser-Deployment-Formen

### Same-Origin lokaler POC

Eine vom Daemon bereitgestellte Seite kann den Daemon direkt aufrufen, da Seite und API eine
Origin teilen. Dies ist die bevorzugte frühe POC-Form für die Validierung von lokalem Web-Chat und
Web-Terminal.

### Remote-Web-Chat / Web-Terminal

Eine produktive Remote-Web-App sollte normalerweise mit einem Backend-for-Frontend kommunizieren. Das
BFF verwaltet Daemon-URL, Token, Workspace-Routing und Session-Metadaten und
leitet browser-sichere App-Events an den Browser weiter. Dies hält Bearer-Tokens aus dem
Browser-Speicher heraus und lässt das Deployment entscheiden, welchen Daemon/Workspace ein Benutzer
erreichen darf.

### Lokaler Browser gegen lokalen Daemon

Ein separater lokaler Dev-Server ist cross-origin zu `qwen serve`; er muss entweder
Daemon-Routen durch die gleiche Origin proxyen oder vom Daemon bereitgestellt werden. Der
Daemon weist willkürliche Browser-Origin-Anfragen absichtlich zurück.

## Rendering-Verantwortlichkeiten

Das gemeinsame Transkript-Modell ist semantisch, nicht visuell. UI-Clients entscheiden, wie sie
rendern:

- Benutzer- und Assistenten-Nachrichtenblöcke
- eingeklappte Thought-Blöcke
- Tool-Statuskarten
- Shell-Ausgabeblöcke
- Genehmigungsanfrage-Steuerelemente
- Status-/Fehler-/Debug-Blöcke

Das Web-Terminal ist ein browser-nativer semantischer Renderer. Es sollte terminalähnlich aussehen und
sich so anfühlen, mit Monospace-Layout, Scrollback, Prompt-Eingabe, Shortcuts und
Streaming-Blöcken, aber es ist kein roher PTY-Proxy und erfordert kein serverseitiges
Ink-Rendering.

## Merge-Sicherheit

- Die native `qwen`-TUI bleibt direkt und unverändert.
- `--acp`-, Channel- und IDE-Pfade bleiben standardmäßig unverändert.
- Der SDK-UI-Kern ist additiv.
- Das WebShell-React-Binding ist optional und läuft nur in Clients, die es
  importieren.
- Entfernter Daemon-TUI-Spike-Code sollte nicht als Produktmigration behandelt werden.

## Nachfolgende Schritte

- Das Verhalten des vom Daemon bereitgestellten WebShells und des eingebetteten IDE-Hosts abgestimmt
  halten.
- Erstklassige Chat- und Terminal-Renderer weiter auf Transkript-Blöcken
  aufbauen.
- Reichhaltigere typisierte Events nur dort hinzufügen, wo bestehende Daemon-Events für stabiles
  Browser-UI-Verhalten zu niedrig sind.
- Ein dediziertes ` @qwen-code/daemon-ui-core`-Paket in Betracht ziehen, wenn Nicht-SDK-Consumer
  den UI-Kern als unabhängige Abhängigkeit benötigen.
