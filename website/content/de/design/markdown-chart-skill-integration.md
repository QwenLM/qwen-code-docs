# Markdown-Chart-Skill-Integration

Status: akzeptiert

## Integrationsvertrag

Qwen Code WebShell besitzt die Rendering-Seite des Vertrags:

- `@qwen-code/web-shell` enthält den `markdown-chart`-Renderer und die
  ECharts-Runtime.
- Hosts installieren den kanonischen
  [`markdown-chart`-Skill](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart),
  damit das Modell renderbare Chart-Blöcke emittiert.
- Qwen Code Core bündelt oder injiziert den Skill nicht. Ein Projekt kann ihn
  unter `.qwen/skills/markdown-chart/SKILL.md` installieren;
  User-Level-Skill-Installation wird ebenfalls unterstützt.

Für die normale `data.kind="inline"`-Ausgabe, die der Skill erzeugt, benötigt
der WebShell-Host keinen Chart-spezifischen Code:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## Referenzierte Daten

Wenn der Host echte kontrollierte Datasets für den Skill freilegt und
`data.kind="ref"` erlaubt, stellt er `resolveDataRef` über eine eigene
Registry bereit:

```tsx
import {
  createMarkdownChartRegistry,
  WebShellWithProviders,
} from '@qwen-code/web-shell';

const chartRegistry = createMarkdownChartRegistry({
  resolveDataRef: async (ref, context) =>
    loadControlledChartDataset(ref, context),
});
const markdown = { chart: { registry: chartRegistry } };

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={markdown}
/>;
```

Der Renderer holt niemals selbst eine Ref oder liest einen lokalen Pfad.
`resolveDataRef` ist die Host-eigene Grenze von einer modell-sichtbaren
Referenz zu einem vertrauenswürdigen Dataset. Die Default-Registry
akzeptiert normalisierte `artifact://`- und `session-file://`-Refs, parst den
Block als JSON, validiert die Option und übergibt dann die normalisierte Ref
plus deklariertes Format und Dimensionen an den Resolver. Resolver-Wartezeiten
sind auf 30 Sekunden begrenzt. Halte `markdown`-, `chart`- und
`labels`-Overrides referenziell stabil, während Charts gemountet sind.

## Streaming-Verhalten

Der geteilte React-Adapter unterscheidet einen geschlossenen Chart-Zaun vom
aktiven nicht terminierten Tail-Zaun:

- Ein geschlossener `markdown-chart`-Block rendert sofort und bleibt
  gemountet, während späterer Antworttext streamt, auch wenn der Zaun in
  einem Blockquote steht.
- Nur der aktive nicht terminierte Chart-Zaun zeigt den Ladezustand.

## Scope

- Der Skill definiert den Modell-Ausgabevertrag; er lädt den Renderer nicht.
- WebShell definiert den Rendering-Vertrag; sie installiert den Skill nicht
  automatisch.
- Keine Daemon-, ACP- oder Client-Capability-Aushandlungs-Änderung ist
  erforderlich.
- Es wird kein automatischer Netzwerk- oder Dateisystemzugriff eingeführt.
