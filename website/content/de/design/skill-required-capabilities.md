# Design für erforderliche Skill-Capabilities

Status: Design-Notiz; dieser PR verfolgt Option B und belässt
`required-capabilities` als zukünftigen Vorschlag.

## Kontext

Web Shell kann benutzerdefinierte Fenced Code Blocks über seinen Markdown-Renderer rendern. Der
Vorschlag für den Chart-Renderer verwendet einen `echarts-fulldata` Fenced Code Block, damit das
Modell eine vollständige ECharts-Option und einen Dataset-Payload zurückgeben kann, den Web Shell
als interaktives Diagramm rendert.

Dieser Output-Contract ist nur in Clients nützlich, die ihn rendern können. In der CLI,
bei ACP-Clients oder auf jeder anderen Oberfläche ohne passenden Renderer würde dieselbe Antwort
als großer Code-Block und nicht als Diagramm erscheinen.

Der ursprüngliche Vorschlag für die gebündelte Chart-Skill verließ sich auf Formulierungen, um dem
Modell mitzuteilen, dass das Format für Web Shell gedacht ist. Dies ist eine weiche Absicherung.
Wenn die Skill in einer Nicht-Web-Shell-Session verfügbar gemacht wird, kann das Modell immer noch
ein Ausgabeformat wählen, das der Client nicht rendern kann.

Für den aktuellen PR behält Qwen Code den Renderer-Extension-Point in Web Shell bei, bündelt aber
`qwencode-viz` nicht im Core. Das Web-Shell-Paket enthält eine kopierbare, nicht automatisch
geladene Skill-Vorlage, und Hosts sollten diese Skill nur installieren oder injizieren, wenn sie
auch einen `echarts-fulldata`-Renderer registrieren.

## Problem

Qwen Code benötigt einen klaren Weg, um zu entscheiden, ob eine Host-spezifische Skill dem Modell
und den Benutzern angezeigt werden soll.

Für `qwencode-viz` lautet die konkrete Frage:

- Sollte der Core ein generisches `required-capabilities` Skill-Metadatenfeld unterstützen?
- Oder sollte `qwencode-viz` gar keine im Core gebündelte Skill sein, sondern nur von
  Web-Shell-Clients bereitgestellt werden, die sie installieren oder injizieren?

## Ziele

- Verhindern, dass Renderer-spezifische Skills verfügbar gemacht werden, wenn der aktuelle Client
  ihren Output-Contract nicht erfüllen kann.
- Startup-Skill-Reminder, explizite Skill-Aktivierung, Slash-Command-Discovery und Skill-Validierung
  konsistent halten.
- Vermeiden, `qwencode-viz` als Sonderfall hart zu codieren.
- Bestehendes Skill-Verhalten beibehalten, wenn keine Capability-Anforderung deklariert ist.
- Das Design erweiterbar halten für zukünftige Host-Capabilities, nicht nur für ECharts.

## Nicht-Ziele

- Implementierung des ECharts-Renderers selbst.
- Neugestaltung der gesamten Client/Server-Capability-Verhandlung.
- Ändern der Semantik bestehender Skill-Frontmatter.
- Lösen von Multi-Client-Shared-Session-Capability-Änderungen in der ersten Version.

## Aktuelle verwandte Mechanismen

Die Codebasis verfügt bereits über mehrere Sichtbarkeitskontrollen, aber keine davon repräsentiert
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

Es gibt kein bestehendes `required-capabilities` oder äquivalentes Skill-Frontmatter. Das
Hinzufügen wäre ein neuer Skill-Contract.

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

Wenn der aktuelle Client/Session nicht alle aufgeführten Capabilities bewirbt, wird die Skill als
nicht verfügbar behandelt.

### Capability-Benennung

Namespaced String-Capabilities verwenden:

```text
markdown.codeBlock.echarts-fulldata
```

Dies hält das Feld generisch, während der Contract präzise bleibt:

- `markdown`: Die Capability gehört zu gerendertem Markdown.
- `codeBlock`: Die Capability gilt für das Rendering von Fenced Code Blocks.
- `echarts-fulldata`: Die spezifische vom Renderer unterstützte Language/Info-String.

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

Stelle einen Helper auf `Config` bereit, zum Beispiel:

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

Dann den Check zentralisieren:

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Filterpunkte

Der Capability-Filter sollte angewendet werden, bevor Skills entweder dem Modell oder dem Benutzer
verfügbar gemacht werden:

- `collectAvailableSkillEntries` in `packages/core/src/tools/skill-utils.ts` sollte Skills
  überspringen, deren erforderliche Capabilities fehlen. Dies hält Startup-Skill-Reminder,
  Delta-Reminder, `SkillTool`-Validierung und modell-aufrufbare Aktivierung abgestimmt.
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

Dies macht die Capability-Deklaration stabil, selbst wenn der Renderer-Callback benutzerdefinierte
Logik, Fallbacks oder mehrere unterstützte Sprachen enthält.

### Daemon- und ACP-Propagation

Für gehostete oder Daemon-basierte Sessions muss das Client-Capability-Set den Core erreichen,
bevor Skills geladen oder aufgelistet werden. Eine minimale Version kann Capabilities beim Erstellen
einer Session übergeben:

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

Der Daemon-Bridge-, SDK- und ACP-Session-Erstellungs-Flow kann dies als Session-scoped Config
speichern.

In der ersten Version können Capabilities Session-scoped sein. Wenn mehrere Clients mit derselben
Session verbunden sind, sollte das Verhalten so dokumentiert werden, dass die Capabilities aus der
Session-Erstellungszeit verwendet werden.

### Vorteile

- Behält `qwencode-viz` als eine kanonische gebündelte Skill.
- Verhindert, dass Host-spezifische Output-Contracts in nicht unterstützte Clients durchsickern.
- Schafft einen wiederverwendbaren Mechanismus für zukünftige Renderer-spezifische oder
  Host-spezifische Skills.
- Macht die Abhängigkeit explizit und testbar.

### Nachteile

- Fügt ein neues übergreifendes Skill-Metadatenfeld hinzu.
- Erfordert die Verdrahtung von Client/Session-Capabilities über Web-Shell-, Daemon-, SDK- und
  ACP-Oberflächen.
- Benötigt sorgfältige Dokumentation für das Shared-Session-Verhalten.
- Könnte mehr Mechanik sein als nötig, wenn `qwencode-viz` die einzige erwartete
  Capability-gated Skill ist.

## Option B: Vom Client bereitgestellte Skill

Kein generisches `required-capabilities`-Feld hinzufügen. Stattdessen `qwencode-viz` nicht im Core
bündeln. Der Web-Shell-Client oder jeder Client, der den Renderer unterstützt, stellt die Skill
selbst bereit.

Mögliche Distributionsmodelle:

- Der Web-Shell-Host installiert `.qwen/skills/qwencode-viz/SKILL.md`.
- Das Web-Shell-Paket liefert eine optionale, nicht automatisch geladene Skill-Vorlage, die ein
  Host kopieren oder installieren kann, wenn das Chart-Rendering aktiviert ist.
- Die Web-Shell-Integration liefert ein Extension-Skill-Paket.
- Die Web-Shell-Integration injiziert äquivalente Modell-Anweisungen nur, wenn ihr Chart-Renderer
  aktiviert ist.

In diesem Modell ist die Skill nur verfügbar, weil der rendernde Client sich entschieden hat, sie
bereitzustellen.

### Vorteile

- Minimale Core-Änderung.
- Kein neuer globaler Skill-Metadaten-Contract.
- Die Capability-Verfügbarkeit liegt natürlich bei dem Client, der den Renderer implementiert.
- Vermeidet Daemon- oder ACP-Verdrahtung, es sei denn, der Client hat bereits einen
  Skill-Injektionsmechanismus.

### Nachteile

- Keine kanonische gebündelte Skill, es sei denn, alle Clients kopieren denselben Inhalt.
- Mehr Aufwand für jeden Web-Shell-Integrator.
- Benutzer, die zwischen Clients wechseln, sehen möglicherweise eine inkonsistente
  Skill-Verfügbarkeit.
- Schafft keine allgemeine Absicherung für zukünftige Host-spezifische Skills.
- Schwerer im Core zu testen, da die Verfügbarkeit von externer Installation oder Injektion
  abhängt.

## Empfehlung

Für diesen PR Option B verwenden.

Das hält das Core-Skill-System unverändert und vermeidet es, `echarts-fulldata`-Anweisungen in
nicht unterstützten Clients verfügbar zu machen. Der Web-Shell-Renderer-Hook bleibt nützlich für
jeden Host-eigenen Block-Renderer, während chart-spezifische Modell-Anweisungen zu einem
expliziten Host-Opt-in werden.

Langfristig sollte dies als Produkt/API-Boundary-Entscheidung diskutiert werden.

Option A wählen, wenn die Maintainer erwarten, dass Qwen Code im Laufe der Zeit mehr
Client-gerenderte Output-Contracts unterstützt. In diesem Fall ist `required-capabilities` ein
kleiner allgemeiner Contract, der die Skill-Verfügbarkeit über CLI, Web Shell, ACP und zukünftige
Clients hinweg zuverlässig hält.

Option B wählen, wenn erwartet wird, dass `qwencode-viz` eine reine Web-Shell-Erweiterung bleibt
und die Maintainer nicht möchten, dass Core-Skills von Client-Rendering-Features abhängen. In
diesem Fall sollte die aktuelle gebündelte Skill aus dem Core entfernt und von Web-Shell-Clients
bereitgestellt werden, die `echarts-fulldata` unterstützen.

Die empfohlene zukünftige Standardeinstellung ist Option A nur, wenn die Maintainer damit
einverstanden sind, Client/Session-Capabilities Teil des Skill-Systems zu machen. Andernfalls
Host-Renderer-Skills im Besitz des Clients belassen.

## Offene Fragen

- Sollten Capabilities Session-scoped, Request-scoped oder Client-scoped sein?
- Sollten fehlende Capabilities benutzer-aufrufbare Befehle ausblenden oder nur die
  modell-aufrufbare Skill-Aktivierung?
- Sollten Capability-Namen Freiform-Strings sein oder gegen eine bekannte Registry validiert
  werden?
- Sollten nicht verfügbare Skills vollständig vor `/skills` versteckt oder als deaktiviert mit
  einer Begründung angezeigt werden?
- Sollte es ein manuelles Override für Benutzer geben, die absichtlich rohe `echarts-fulldata`-Blöcke
  in nicht unterstützten Clients ausgeben möchten?
- Sollte das Feld `required-capabilities`, `requires-capabilities` oder `client-capabilities`
  heißen?

## Validierungsplan

Wenn Option A implementiert wird, Tests hinzufügen für:

- Frontmatter-Parsing in beiden Skill-Parsing-Pfaden.
- `collectAvailableSkillEntries`, das eine Skill ausblendet, wenn Capabilities fehlen.
- Dieselbe Skill, die erscheint, wenn Capabilities vorhanden sind.
- Interaktion mit `paths`, `skills.disabled` und `disable-model-invocation`.
- `BundledSkillLoader`- und `SkillCommandLoader`-Befehlssichtbarkeit.
- Web-Shell-Mapping von unterstützten Code-Block-Sprachen zu Client-Capabilities.
- Daemon- oder ACP-Session-Erstellung, die das Capability-Set beibehält.
- Bestehende Integrationstests für gebündelte Skills, um sicherzustellen, dass Skills ohne
  `required-capabilities` unverändert bleiben.

## Migration

Bestehende Skills benötigen keine Migration, da das neue Feld optional ist.

Für den aktuellen Option-B-Pfad die Chart-Skill aus den im Core gebündelten Skills entfernen. Die
Web-Shell-Paketvorlage darf nicht automatisch vom Core geladen werden; Hosts opten ein, indem sie
sie installieren oder injizieren.

Wenn Option A akzeptiert wird, hinzufügen:

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

zu einer zukünftigen gebündelten `qwencode-viz`.

Wenn Option B akzeptiert wird, die Chart-Skill aus den im Core gebündelten Skills entfernen und
dokumentieren, wie Web-Shell-Clients sie installieren oder injizieren können, wenn sie einen
`echarts-fulldata`-Renderer registrieren.