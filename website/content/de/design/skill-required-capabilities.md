# Design für erforderliche Skill-Capabilities

Status: Design-Notiz; dieser PR setzt Option B um und lässt
`required-capabilities` als zukünftigen Vorschlag offen.

## Kontext

Web Shell kann benutzerdefinierte Fenced Code Blocks über seinen Markdown-Renderer rendern. Der
Vorschlag für den Chart-Renderer verwendet einen `echarts-fulldata` Fenced Code Block, damit das
Modell eine vollständige ECharts-Option und einen Dataset-Payload zurückgeben kann, den Web Shell
als interaktives Chart rendert.

Dieser Output-Contract ist nur in Clients nützlich, die ihn rendern können. In der CLI,
bei ACP-Clients oder jeder anderen Oberfläche ohne passenden Renderer würde dieselbe Antwort
als großer Code-Block und nicht als Chart erscheinen.

Der ursprüngliche Vorschlag für die gebündelte Chart-Skill verließ sich auf Formulierungen, um dem
Modell mitzuteilen, dass das Format für Web Shell gedacht ist. Dies ist ein Soft Guard. Wenn die Skill
in einer Nicht-Web-Shell-Session verfügbar gemacht wird, kann das Modell immer noch ein Output-Format
wählen, das der Client nicht rendern kann.

Für den aktuellen PR behält Qwen Code den Renderer-Extension-Point in Web Shell bei, bündelt aber
`qwencode-viz` nicht im Core. Das Web-Shell-Paket enthält eine kopierbare, nicht automatisch
geladene Skill-Vorlage, und Hosts sollten diese Skill nur installieren oder injizieren, wenn sie
auch einen `echarts-fulldata`-Renderer registrieren.

## Problem

Qwen Code benötigt eine klare Möglichkeit zu entscheiden, ob eine host-spezifische Skill
dem Modell und den Benutzern angezeigt werden soll.

Für `qwencode-viz` lautet die konkrete Frage:

- Sollte der Core ein generisches `required-capabilities` Skill-Metadatenfeld unterstützen?
- Oder sollte `qwencode-viz` gar keine im Core gebündelte Skill sein, sondern nur von
  Web-Shell-Clients bereitgestellt werden, die sie installieren oder injizieren?

## Ziele

- Verhindern, dass renderer-spezifische Skills verfügbar gemacht werden, wenn der aktuelle Client
  ihren Output-Contract nicht erfüllen kann.
- Startup-Skill-Reminder, explizite Skill-Aktivierung, Slash-Command-Discovery und Skill-Validierung
  konsistent halten.
- Vermeiden, `qwencode-viz` als Sonderfall hart zu codieren.
- Bestehendes Skill-Verhalten beibehalten, wenn keine Capability-Anforderung deklariert ist.
- Das Design erweiterbar halten für zukünftige Host-Capabilities, nicht nur für ECharts.

## Nicht-Ziele

- Die Implementierung des ECharts-Renderers selbst.
- Neugestaltung der gesamten Client/Server-Capability-Verhandlung.
- Änderung der Semantik bestehender Skill-Frontmatter.
- Lösung von Capability-Änderungen in Multi-Client-Shared-Sessions in der ersten Version.

## Aktuelle verwandte Mechanismen

Die Codebase verfügt bereits über mehrere Sichtbarkeitskontrollen, aber keine davon repräsentiert
Client-Rendering-Capabilities:

- `disable-model-invocation`: Verhindert, dass eine Skill automatisch vom Modell aufgerufen wird.
- `user-invocable`: Steuert, ob eine gebündelte Skill als Befehl verfügbar ist.
- `paths`: Begrenzt die Skill-Verfügbarkeit auf passende Workspace-Pfade.
- `skills.disabled`: Deaktiviert konfigurierte Skills.
- `allowedTools`: Wird derzeit vom Laden gebündelter Skills verwendet, um Cron-orientierte Skills
  auszublenden, wenn Cron-Tools nicht verfügbar sind.
- Slash-Command `supportedModes`: Filtert Befehle nach Ausführungsmodus.
- Daemon- und ACP-Capability-Objekte: Beschreiben Protokoll- oder Client-Support, sind aber derzeit
  nicht mit der Skill-Verfügbarkeit verbunden.

Es gibt kein bestehendes `required-capabilities` oder äquivalentes Skill-Frontmatter.
Das Hinzufügen wäre ein neuer Skill-Contract.

## Option A: `required-capabilities` hinzufügen

Ein generisches Skill-Frontmatter-Feld hinzufügen:

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

Wenn der aktuelle Client/Session nicht alle aufgeführten Capabilities bewirbt, wird die
Skill als nicht verfügbar behandelt.

### Capability-Benennung

Namespaced String-Capabilities verwenden:

```text
markdown.codeBlock.echarts-fulldata
```

Dies hält das Feld generisch, während der Contract präzise bleibt:

- `markdown`: Die Capability gehört zu gerendertem Markdown.
- `codeBlock`: Die Capability gilt für das Rendering von Fenced Code Blocks.
- `echarts-fulldata`: Der spezifische vom Renderer unterstützte Language/Info-String.

Zukünftige Beispiele könnten sein:

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Skill-Metadaten

Füge `requiredCapabilities?: string[]` zur Skill-Konfiguration hinzu, nachdem der
Frontmatter-Schlüssel `required-capabilities` geparst wurde.

Beide Skill-Parsing-Pfade sollten das Feld verstehen:

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

Das Feld sollte optional sein. Fehlend oder leer bedeutet, dass die Skill keine
Client-Capability-Anforderung hat.

### Runtime-Capability-Quelle

Client/Session-Capabilities zur Runtime-Konfiguration hinzufügen:

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

Einen Helper auf `Config` bereitstellen, zum Beispiel:

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

Dann die Prüfung zentralisieren:

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Filterungspunkte

Der Capability-Filter sollte angewendet werden, bevor Skills entweder dem Modell oder
dem Benutzer verfügbar gemacht werden:

- `collectAvailableSkillEntries` in `packages/core/src/tools/skill-utils.ts`
  sollte Skills überspringen, deren erforderliche Capabilities fehlen. Dies hält
  Startup-Skill-Reminder, Delta-Reminder, `SkillTool`-Validierung und modell-aufrufbare
  Aktivierung synchron.
- `BundledSkillLoader` sollte nicht verfügbare gebündelte Skills überspringen, wenn
  benutzerzugängliche Befehle erstellt werden.
- `SkillCommandLoader` sollte nicht verfügbare Dateisystem-Skills überspringen, wenn
  benutzerzugängliche Befehle erstellt werden.

Die wichtige Invariante ist, dass eine vor dem Modell versteckte Skill nicht weiterhin als
aufrufbarer Befehl erscheinen sollte, es sei denn, das Projekt unterstützt absichtlich ein
manuelles Override.

### Web-Shell-Registrierung

Web Shell sollte Renderer-Support explizit bewerben, anstatt sich auf das Vorhandensein eines
undurchsichtigen `renderCodeBlock`-Callbacks zu verlassen.

Zum Beispiel:

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

Der Web-Shell-Client kann das auf Folgendes mappen:

```text
markdown.codeBlock.echarts-fulldata
```

Dies macht die Capability-Deklaration stabil, selbst wenn der Renderer-Callback
benutzerdefinierte Logik, Fallbacks oder mehrere unterstützte Sprachen enthält.

### Daemon- und ACP-Propagation

Für gehostete oder Daemon-basierte Sessions muss das Client-Capability-Set den Core erreichen,
bevor Skills geladen oder aufgelistet werden. Eine minimale Version kann Capabilities beim
Erstellen einer Session übergeben:

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

Der Daemon-Bridge-, SDK- und ACP-Session-Erstellungs-Flow kann dies als
session-scoped Konfiguration speichern.

In der ersten Version können Capabilities session-scoped sein. Wenn mehrere Clients
mit derselben Session verbunden sind, sollte das Verhalten so dokumentiert werden, dass
die Capabilities aus der Session-Erstellungszeit verwendet werden.

### Vorteile

- Hält `qwencode-viz` als eine kanonische gebündelte Skill.
- Verhindert, dass host-spezifische Output-Contracts in nicht unterstützte Clients
  durchsickern.
- Schafft einen wiederverwendbaren Mechanismus für zukünftige renderer-spezifische oder
  host-spezifische Skills.
- Macht die Abhängigkeit explizit und testbar.

### Nachteile

- Fügt ein neues übergreifendes Skill-Metadatenfeld hinzu.
- Erfordert das Durchreichen von Client/Session-Capabilities über Web-Shell-, Daemon-, SDK- und
  ACP-Oberflächen.
- Benötigt sorgfältige Dokumentation für das Shared-Session-Verhalten.
- Könnte mehr Mechanik sein als nötig, wenn `qwencode-viz` die einzige erwartete
  capability-gegate Skill ist.

## Option B: Vom Client bereitgestellte Skill

Kein generisches `required-capabilities`-Feld hinzufügen. Stattdessen `qwencode-viz` nicht im
Core bündeln. Der Web-Shell-Client oder jeder Client, der den Renderer unterstützt, stellt die
Skill selbst bereit.

Mögliche Verteilungsmodelle:

- Der Web-Shell-Host installiert `.qwen/skills/qwencode-viz/SKILL.md`.
- Das Web-Shell-Paket liefert eine optionale, nicht automatisch geladene Skill-Vorlage mit, die ein
  Host kopieren oder installieren kann, wenn das Chart-Rendering aktiviert ist.
- Die Web-Shell-Integration liefert ein Extension-Skill-Paket mit.
- Die Web-Shell-Integration injiziert äquivalente Modell-Anweisungen nur, wenn ihr
  Chart-Renderer aktiviert ist.

In diesem Modell ist die Skill nur verfügbar, weil der rendernde Client sich entschieden hat,
sie bereitzustellen.

### Web-Shell-Host-Integration

Ein Web-Shell-Host, der Chart-Output möchte, sollte sich für beide Hälften des Contracts
entscheiden:

1. Einen `echarts-fulldata` Markdown-Code-Block-Renderer registrieren.
2. Die passende Chart-Skill aus
   `packages/web-shell/docs/examples/qwencode-viz/SKILL.md` bereitstellen.

Zum Beispiel:

```tsx
import * as echarts from 'echarts';
import {
  WebShellWithProviders,
  createEchartsFullDataRenderer,
} from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={{
    renderCodeBlock: createEchartsFullDataRenderer({
      loadEcharts: () => echarts,
      resolveDataRef: async (ref, meta) =>
        loadControlledChartDataset(ref, meta),
    }),
  }}
/>;
```

In dieser Renderer-Konfiguration ermöglicht `loadEcharts` dem Host, die genehmigte ECharts-Runtime
bereitzustellen, entweder als statischen Import oder als lazy-loaded Modul. `resolveDataRef` wird
nur für `data.kind="ref"` Chart-Blöcke verwendet; es ist die host-eigene Bridge von einer für das
Modell sichtbaren Datenreferenz zu einem vertrauenswürdigen Dataset. Das für das Modell sichtbare
Envelope-Format wird durch die optionale Skill-Vorlage in
`packages/web-shell/docs/examples/qwencode-viz/SKILL.md` beschrieben; die rendererseitige
Validierung befindet sich in
`packages/web-shell/client/components/messages/EchartsFullDataBlock.tsx`.

Die Skill-Datei sollte nur von Hosts installiert oder injiziert werden, die diese Registrierung
vornehmen. Eine einfache dateibasierte Integration kann Folgendes kopieren:

```text
packages/web-shell/docs/examples/qwencode-viz/SKILL.md
```

in das Workspace- oder Benutzer-Skill-Verzeichnis, zum Beispiel:

```text
.qwen/skills/qwencode-viz/SKILL.md
```

Eine Integration mit eigener Skill-Verteilungsschicht kann stattdessen dieselbe Datei als
kanonischen Quellinhalt laden und über diese Schicht verfügbar machen. In beiden Fällen lädt
der Core die Skill nicht automatisch; der Host ist für die Aktivierung verantwortlich, da der
Host den Renderer besitzt.

Für `data.kind="ref"` Envelopes validiert der eingebaute Renderer, dass `data.ref` eine
normalisierte `artifact://`- oder `session-file://`-Referenz verwendet, bevor er die
host-gesteuerte `resolveDataRef(ref, meta)`-Implementierung aufruft. Der Renderer parst den
Block außerdem als JSON und bereinigt die ECharts-Option vor dem Rendern; er wertet kein vom
Modell bereitgestelltes JavaScript aus, ruft keine beliebigen URLs ab und liest auch keine
lokalen Dateien selbst. Ein benutzerdefinierter Renderer sollte dieselbe Aufteilung beibehalten:
Zuerst die JSON/Ref/Option-Validierung auf Renderer-Ebene, zweitens die host-eigene
Artifact-Auflösung.

Ein Daemon-gestützter Host kann die Workspace-File-API als ein Artifact-Backend behandeln.
Zum Beispiel kann der Host Chart-Artifacts in einem kontrollierten Workspace-Verzeichnis wie
`.qwen/artifacts/` persistieren, für das Modell sichtbare Referenzen wie
`artifact://chart-data/orders.csv` verfügbar machen und sie über den Daemon
`GET /file?path=.qwen/artifacts/chart-data/orders.csv` auflösen. Dies behält `artifact://` als
öffentlichen Chart-Contract bei, während es der ersten Implementierung ermöglicht,
Daemon-Workspace-Dateien wiederzuverwenden.

Der Resolver muss dennoch das Artifact-Root erzwingen, bevor er den Daemon aufruft:

```tsx
const ARTIFACT_ROOT = '.qwen/artifacts/';
const MAX_CHART_DATA_BYTES = 256 * 1024;

async function resolveDataRef(
  ref: string,
  meta: { format?: string; dimensions?: string[] },
) {
  const artifactPrefix = 'artifact://';
  if (!ref.startsWith(artifactPrefix)) {
    throw new Error(`Unsupported chart data ref: ${ref}`);
  }

  const artifactPath = ref.slice(artifactPrefix.length);
  if (
    artifactPath.length === 0 ||
    artifactPath.startsWith('/') ||
    artifactPath.includes('\\') ||
    artifactPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid chart data ref: ${ref}`);
  }

  const url = new URL('/file', daemonBaseUrl);
  url.searchParams.set('path', `${ARTIFACT_ROOT}${artifactPath}`);
  url.searchParams.set('maxBytes', String(MAX_CHART_DATA_BYTES));

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to read chart data: ${response.status}`);
  }

  const file = (await response.json()) as { content: string };
  return meta.format === 'csv'
    ? parseCsvAsArrayRows(file.content, meta.dimensions)
    : JSON.parse(file.content);
}
```
Dieses Beispiel bildet absichtlich nur normalisierte `artifact://`-Pfade unter
`.qwen/artifacts/` ab. Wenn ein Host später Artefakte in einen Object Storage oder einen
sitzungsbezogenen Artefakt-Dienst verschiebt, muss nur `resolveDataRef` geändert werden; der
für das Modell sichtbare `echarts-fulldata`-Block kann weiterhin dieselbe Referenz-Struktur verwenden.

### Vorteile

- Minimale Änderungen am Core.
- Kein neuer globaler Skill-Metadaten-Contract.
- Die Verfügbarkeit von Capabilities liegt naturgemäß beim Client, der den
  Renderer implementiert.
- Vermeidet Daemon- oder ACP-Infrastruktur, es sei denn, der Client verfügt bereits über einen
  Skill-Injection-Mechanismus.

### Nachteile

- Kein kanonischer mitgelieferter Skill, es sei denn, alle Clients kopieren denselben Inhalt.
- Höherer Aufwand für jeden Web-Shell-Integrator.
- Benutzer, die zwischen Clients wechseln, sehen möglicherweise eine inkonsistente Skill-Verfügbarkeit.
- Schafft keine allgemeine Absicherung für zukünftige host-spezifische Skills.
- Im Core schwerer zu testen, da die Verfügbarkeit von einer externen Installation
  oder Injection abhängt.

## Empfehlung

Verwende für diesen PR Option B.

Das hält das Core-Skill-System unverändert und vermeidet es,
`echarts-fulldata`-Anweisungen in nicht unterstützten Clients offenzulegen. Der Web-Shell-Renderer-
Hook bleibt für jeden vom Host betriebenen Block-Renderer nützlich, während diagrammspezifische
Modell-Anweisungen zu einem expliziten Opt-in des Hosts werden.

Langfristig sollte dies als Entscheidung über die Produkt-/API-Grenzen diskutiert werden.

Wähle Option A, wenn die Maintainer erwarten, dass Qwen Code im Laufe der Zeit mehr client-gerenderte
Output-Contracts unterstützt. In diesem Fall ist `required-capabilities` ein kleiner,
allgemeiner Contract, der die Skill-Verfügbarkeit über CLI, Web Shell, ACP
und zukünftige Clients hinweg konsistent hält.

Wähle Option B, wenn `qwencode-viz` voraussichtlich eine reine Web-Shell-
Erweiterung bleibt und die Maintainer nicht möchten, dass Core-Skills von Client-Rendering-
Funktionen abhängen. In diesem Fall sollte der aktuelle mitgelieferte Skill aus dem Core entfernt
und von Web-Shell-Clients bereitgestellt werden, die `echarts-fulldata` unterstützen.

Die empfohlene zukünftige Standardeinstellung ist Option A nur, wenn die Maintainer damit einverstanden sind,
Client-/Sitzungs-Capabilities Teil des Skill-Systems werden zu lassen. Andernfalls sollten
Host-Renderer-Skills in Client-Verwaltung bleiben.

## Offene Fragen

- Sollen Capabilities Session-, Request- oder Client-spezifisch sein?
- Sollen fehlende Capabilities benutzeraufrufbare Befehle ausblenden oder nur die
  modellaufrufbare Skill-Aktivierung ausblenden?
- Sollen Capability-Namen Freiform-Strings sein oder gegen eine bekannte
  Registry validiert werden?
- Sollen nicht verfügbare Skills vollständig vor `/skills` ausgeblendet oder als
  deaktiviert mit einer Begründung angezeigt werden?
- Sollte es ein manuelles Override für Benutzer geben, die absichtlich rohe
  `echarts-fulldata`-Blöcke in nicht unterstützten Clients ausgeben möchten?
- Sollte das Feld `required-capabilities`, `requires-capabilities` oder
  `client-capabilities` heißen?

## Validierungsplan

Wenn Option A implementiert wird, füge Tests hinzu für:

- Frontmatter-Parsing in beiden Skill-Parsing-Pfaden.
- `collectAvailableSkillEntries`, das einen Skill ausblendet, wenn Capabilities fehlen.
- Dasselbe Skill, das angezeigt wird, wenn Capabilities vorhanden sind.
- Interaktion mit `paths`, `skills.disabled` und `disable-model-invocation`.
- Befehlssichtbarkeit von `BundledSkillLoader` und `SkillCommandLoader`.
- Web-Shell-Mapping von unterstützten Codeblock-Sprachen zu Client-Capabilities.
- Daemon- oder ACP-Session-Erstellung, die das Capability-Set beibehält.
- Bestehende Integrationstests für mitgelieferte Skills, um sicherzustellen, dass Skills ohne
  `required-capabilities` unverändert bleiben.

## Migration

Bestehende Skills erfordern keine Migration, da das neue Feld optional ist.

Für den aktuellen Option-B-Pfad entferne den Chart-Skill aus den im Core mitgelieferten Skills.
Das Web-Shell-Paket-Template darf nicht automatisch vom Core geladen werden; Hosts
aktivieren es explizit, indem sie es installieren oder injizieren.

Wenn Option A akzeptiert wird, füge:

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

zu einem zukünftigen mitgelieferten `qwencode-viz` hinzu.

Wenn Option B akzeptiert wird, entferne den Chart-Skill aus den im Core mitgelieferten Skills und
dokumentiere, wie Web-Shell-Clients ihn installieren oder injizieren können, wenn sie einen
`echarts-fulldata`-Renderer registrieren.