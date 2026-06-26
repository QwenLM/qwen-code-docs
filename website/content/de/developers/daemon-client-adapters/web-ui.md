# Daemon Web UI Adapter

## Ziel

Web-Chat- und Web-Terminal-Clients sollen `qwen serve` über die
Daemon-HTTP/SSE-APIs nutzen und ein clientseitiges Transkript rendern. Native lokale TUI-,
Kanal- und IDE-Integrationen behalten vorerst ihre bestehenden Standardpfade.

## Gemeinsamer UI-Vertrag

Verwende die Daemon-UI-Exporte des TypeScript-SDKs als gemeinsame Grenze:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

Die Aufteilung ist:

- `DaemonClient` behandelt Daemon-HTTP-Routen.
- `DaemonSessionClient` verwaltet die Sitzungserstellung/-anbindung und SSE-Wiedergabe.
- `normalizeDaemonEvent()` wandelt Daemon-Wire-Ereignisse in UI-Ereignisse um.
- `createDaemonTranscriptStore()` reduziert UI-Ereignisse zu Transkriptblöcken.

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

Der Provider erstellt oder bindet eine Daemon-Sitzung an, abonniert SSE, behält die
letzte Ereignis-ID auf `DaemonSessionClient` und verbindet den Stream standardmäßig neu.
Aufrufer können dies mit `autoReconnect={false}` für Tests oder benutzerdefinierte
Verbindungsverwaltung deaktivieren.

## Browser-Bereitstellungsformen

### Same-Origin Local POC

Eine vom Daemon bereitgestellte Seite kann den Daemon direkt aufrufen, da die Seite und die API
einen gemeinsamen Ursprung haben. Dies ist die bevorzugte frühe POC-Form für lokale Web-Chat- und
Web-Terminal-Validierung.

### Remote Web Chat / Web Terminal

Eine produktive Remote-Web-App sollte normalerweise mit einem Backend-for-Frontend (BFF) kommunizieren. Das
BFF verwaltet die Daemon-URL, das Token, das Workspace-Routing und die Sitzungsmetadaten und
leitet dann browser-sichere App-Ereignisse an den Browser weiter. Dies hält Bearer-Token aus dem
Browser-Speicher heraus und ermöglicht der Bereitstellung zu entscheiden, welchen Daemon/Workspace ein Benutzer
erreichen darf.

### Lokaler Browser gegen lokalen Daemon

Ein separater lokaler Entwicklungsserver ist Cross-Origin zu `qwen serve`; er muss entweder
Daemon-Routen über denselben Ursprung proxen oder vom Daemon bereitgestellt werden. Der
Daemon lehnt absichtlich beliebige Browser-`Origin`-Anfragen ab.

## Rendering-Verantwortlichkeiten

Das gemeinsame Transkriptmodell ist semantisch, nicht visuell. UI-Clients entscheiden, wie sie
rendern:

- Benutzer- und Assistenten-Nachrichtenblöcke
- zusammengeklappte Gedankenblöcke
- Tool-Statuskarten
- Shell-Ausgabeblöcke
- Berechtigungsanfrage-Steuerelemente
- Status-/Fehler-/Debug-Blöcke

Das Web-Terminal ist ein browser-nativer semantischer Renderer. Es sollte sich wie ein
Terminal anfühlen mit Monospace-Layout, Scrollback, Eingabeaufforderung, Tastenkombinationen und
Streaming-Blöcken, ist aber kein reiner PTY-Proxy und erfordert kein serverseitiges
Ink-Rendering.

## Merge-Sicherheit

- Die native `qwen` TUI bleibt direkt und unverändert.
- `--acp`, Kanal- und IDE-Pfade bleiben standardmäßig unverändert.
- Der SDK-UI-Kern ist additiv.
- Die WebUI-React-Bindung ist optional und läuft nur in Clients, die sie importieren.
- Entfernter Daemon-TUI-Spike-Code sollte nicht als Produktmigration behandelt werden.

## Nacharbeiten

- Füge einen vom Daemon bereitgestellten lokalen `/web` POC oder eine äquivalente Same-Origin-Web-App hinzu.
- Entwickle erstklassige Chat- und Terminal-Renderer auf Basis der Transkriptblöcke.
- Füge detailliertere typisierte Ereignisse nur dort hinzu, wo vorhandene Daemon-Ereignisse für stabiles Browser-UI-Verhalten zu niedrigstufig sind.
- Ziehe ein dediziertes `@qwen-code/daemon-ui-core`-Paket in Betracht, wenn Nicht-SDK-Nutzer den UI-Kern als unabhängige Abhängigkeit benötigen.