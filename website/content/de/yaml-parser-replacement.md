# YAML-Parser-Ersatz — Forschungsergebnisse

Internes Design-Dokument für den Austausch des selbstgeschriebenen 192-zeiligen YAML-Parsers unter
`packages/core/src/utils/yaml-parser.ts` durch eine richtige Bibliothek, damit die verschobenen
Felder `mcpServers` und `hooks` aus dem deklarativen Agenten-Schema von Claude Code sicher durch
Subagent-/Skill-/Converter-Codepfade roundtrippen können.

Begleitdokument zu [`docs/declarative-agents-port.md`](./declarative-agents-port.md).
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Voraussetzung für
das Follow-up zu [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Phase 0 — Quellen verifiziert

| Quelle                                                 | Version / Datum                   | Warum autoritativ                                                                                                         |
| ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | älterer CC-Snapshot (pre-2.1.168) | direkte Quelle — 15-zeiliger Wrapper, der die Bibliothek benennt                                                          |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | gleicher Snapshot                 | direkte Quelle — 370-zeiliger Frontmatter-Splitter + 2-Pass-Wiederherstellung                                              |
| `/private/tmp/cc-2.1.168/claude.strings`                | extrahiert aus CC 2.1.168         | autoritativ für aktuelles Verhalten — Strings enthalten obfuskierte Symbolnamen, aber auch das JSON-Schema und Fehlermeldungen |
| `packages/core/src/utils/yaml-parser.ts` (dieses Repo) | HEAD von `lazzy/gifted-hamilton-684741` | der zu ersetzende Parser                                                                                                |
| live `node -e`-Tests gegen `yaml@2.8.1` in diesem Baum | 2026-06-08                        | empirisches Sicherheitsverhalten — Anker, Merge-Keys, `!!js/function`, Billion-Laughs, `maxAliasCount` (Ergebnisse inline in Phase 4) |

Vertrauenslabel: **C** durch direkte Evidenz bestätigt; **I** aus mehreren bestätigten Fakten abgeleitet; **O** offene Frage.

## Phase 1 — Welche YAML-Bibliothek verwendet CC?

**Antwort: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), NICHT
`js-yaml`.** Bestätigt durch direktes Lesen von `~/code/claude-code/src/utils/yaml.ts`:

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **Bibliothek**: `yaml` npm-Paket. **C**
- **API**: top-level `.parse(input)`. Verwendet das Standard-Schema des Pakets (YAML 1.2 `core` — JSON-Superset, keine JS-Erweiterungen). **C**
- **Bun-Abkürzung**: unter Bun verwendet CC `Bun.YAML.parse()`, um das Bündeln von ~270 KB YAML-Parser zu vermeiden. **C** Für Qwen Code nicht relevant (wir zielen nicht auf Bun-Laufzeit).
- **Schema-Modus**: nirgends in CC explizit gesetzt. Verlässt sich auf das Standardverhalten des `yaml`-Pakets plus zod-Validierung in der Consumer-Schicht (`DL7`, `gS8`, `TKO`/`_u` laut `docs/declarative-agents-port.md`). **C**

### Warum `yaml` und nicht `js-yaml`

| Dimension                | `js-yaml` 4.x                                                                                    | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Standard-Schema          | `DEFAULT_SAFE_SCHEMA` (seit 4.x) — sicher; ältere Versionen hatten `DEFAULT_FULL_SCHEMA` mit JS | `core` (YAML 1.2-Spezifikation) — nur JSON-Typen     |
| `!!js/function`-Tag      | In 4.x NICHT unterstützt (war in 3.x)                                                            | Nie unterstützt                                       |
| Billion-Laughs-Schutz    | Keiner (manuelle Verantwortung)                                                                  | Eingebauter `maxAliasCount: 100` Standard            |
| Merge-Keys (`<<`)        | Unterstützt (opt-out via `MERGE_SCHEMA` oder Filtern)                                            | Standardmäßig deaktiviert, opt-in via `{ merge: true }`|
| Bereits eine Qwen-Code-Abhängigkeit? | `js-yaml@4.1.1` ✓                                                                         | `yaml@2.8.1` ✓ (bereits von `skill-manager` importiert) |

Beides sind vernünftige Optionen im Jahr 2026, aber **die ursprüngliche Aufgabenbeschreibung empfahl
`js-yaml`s `FAILSAFE_SCHEMA` / `CORE_SCHEMA`**. Wir weichen aus drei konkreten Gründen davon ab:

1. **CC-Parität**. Der ganze Sinn der Portierung von CCs Frontmatter-Schema ist es,
   dass Benutzer eine CC-Agentendatei in `.qwen/agents/` ablegen können und diese
   identisch geparst wird. Die Verwendung desselben Parsers wie CC minimiert Abweichungen bei
   exotischen YAML-Konstrukten (Multi-Dokument-Streams, Flow vs. Block-Skalare, Tag-Behandlung).
2. **`yaml` wird bereits direkt innerhalb von `skill-manager.ts` verwendet** —
   siehe `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Die Vereinheitlichung auf `yaml` eliminiert einen von zwei doppelten YAML-Stacks im
   selben Paket. **C** (Grep-Ergebnis dokumentiert in Phase 6).
3. **Sicherere Standardeinstellungen als `js-yaml`**. `yaml`s eingebautes `maxAliasCount` blockiert
   Billion-Laughs ohne manuelle Konfiguration; Merge-Keys sind standardmäßig deaktiviert;
   beliebige Tags werden zu Literal-Strings mit einer `YAMLWarning`, anstatt aufrufbare
   Resolver zu triggern. Empirische Belege in Phase 4.

Wenn ein zukünftiger Maintainer die `yaml`-Abhängigkeit entfernen und auf `js-yaml`
vereinheitlichen möchte, ist die Migration mechanisch: ersetze `yaml.parse` / `yaml.stringify`
durch `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`.
Die beiden Bibliotheken stimmen in der Ausgabe für die 100%-Teilmenge überein, die CC und Qwen Code
tatsächlich verwenden (Key-Value-Paare, Listen, verschachtelte Maps, skalare Booleans/Zahlen).
Verfolge diese Entscheidung separat, falls sie aufkommt.

## Phase 2 — Frontmatter-Parsing-Pipeline (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` hat 370 Zeilen. Wichtige Erkenntnisse:

| Schritt                | Logik                                                                                                                     | Quelle                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Delimiter-Match        | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — öffnet bei Spalte 0, Body ist nicht-gierig, schließendes `---` muss auf eigener Zeile sein | `frontmatterParser.ts:~123` (Zeilennummern aus altem Snapshot; ungefähre Angabe) **C**               |
| Pass-1-Parsing         | Aufruf von `parseYaml(body)`. Bei Erfolg → geparstes Objekt + restlicher Content zurückgeben.                              | gleiche Datei, oberer try-Block **C**                                                                 |
| Pass-2-Wiederherstellung | Bei `YAMLException` Zeilen durchgehen, Werte, die wie Datumsangaben/Doppelpunkte/Sonderzeichen aussehen, automatisch in Anführungszeichen setzen, `parseYaml` einmal wiederholen. | Zeilen ~85–121 im alten Snapshot **C** (`Tab → 2 Leerzeichen`-Normalisierung, ISO-Datum-Heuristik, Doppelpunkt-Falle) |
| Fehlerfall-Durchgriff   | Beide Durchläufe fehlgeschlagen → Loggen via `logForDebugging`, Rückgabe von `{ data: {}, content: text }`. Agent wird mit leerem Frontmatter geladen. | Ende der Funktion **C**                                                                               |
| Telemetrie              | Weiter oben eingewickelt — `tengu_frontmatter_shadow_unknown_key` / `_mismatch`-Events feuern von `ug5.agent` (Ig5-Schema) | `claude.strings:308120`, `309074`, `309076` (gegenreferenziert in `docs/declarative-agents-port.md` Phase 1) |

**Implikation für Qwen Code**: Wir müssen die 2-Pass-Wiederherstellung NICHT nachbauen.
`subagent-manager.ts` von Qwen Code erzwingt bereits strengeres „Werfen bei fehlerhaftem Frontmatter
auf oberster Ebene" für seinen Loader (siehe `parseSubagentContent`),
und die 2-Pass-Wiederherstellung dient speziell dazu, alte handbearbeitete CC-Agentendateien zu verzeihen.
Eine strengere Haltung zu übernehmen ist in Ordnung; wir müssen nur **den gesamten Loader nicht zum Absturz bringen**,
wenn verschachtelte Felder fehlerhaft sind. Siehe Phase 5 für die Warnen-und-Verwerfen-Haltung.

## Phase 3 — Verschachtelte Validierung via zod (CC)

Die relevanten CC-Validatoren laut `docs/declarative-agents-port.md` Phase 1 +
Binary-Strings-Cross-Check:

### `mcpServers` (CC-Symbol `gS8` / JSON-Schatten `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // Servername-Referenz
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (aus `claude.strings:124–135` Referenz) ist eine
diskriminierte Union über `type`:

| `type`             | Erforderliche Felder                | Anmerkungen                                        |
| ------------------ | ----------------------------------- | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]`| Plus `env?: Record<string,string>`, `cwd?: string`  |
| `"sse"`            | `url: string`                       | Plus `headers?: Record<string,string>`             |
| `"http"`           | `url: string`                       | Plus `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                       | Qwen-Code-Parität unbekannt — verschieben bis benötigt|
| `"sdk"`            | variiert                            | Interne CC-Nutzung; wir müssen NICHT unterstützen  |
| `"claudeai-proxy"` | variiert                            | Interne CC-Nutzung; wir müssen NICHT unterstützen  |

**Für Qwen Code v1**: Validieren als `Record<string, unknown>` (großzügig
DL7-artig), und die nachgelagerte Zusammenführung in `Config.getMcpServers()` soll
die Typkoerzision übernehmen. Qwen Code hat bereits eine `MCPServerConfig`-Klasse mit
`type`-Diskriminierung — wir verwenden diesen Converter wieder, anstatt das zod-Schema zu duplizieren.
Siehe Phase 4 des Runtime-Wiring-Plans in `docs/declarative-agents-port.md`.

### `hooks` (CC-Symbol `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (diskriminierte Union auf `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

Die Hook-Event-Keys laut Strings-Cross-Check sind dieselbe Menge, die Qwen Code
bereits unterstützt: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — plus einige Qwen-spezifische Events (`TodoCreated`, `TodoCompleted`),
die CC nicht hat.

**Für Qwen Code v1**: Validieren als `Record<string, unknown>` (großzügig), dann
an die bestehenden `SessionHooksManager`-Validatoren von Qwen Code übergeben, die
bereits die `HookDefinition[]`-Form pro Event implementieren (siehe
`packages/core/src/hooks/types.ts:207–211` gemäß Phase-1-Runtime-Mapping).

### Warum beide Validatoren auf Ig5-Schattenebene `z.unknown()` sind

`Ig5` ist das **Telemetrie-Schatten-Schema** — es feuert
`tengu_frontmatter_shadow_unknown_key`-Events, wenn ein YAML-Key nicht in der
bekannten Menge ist, und `_mismatch`-Events, wenn ein bekannter Key den falschen Typ hat. Es
verwendet bewusst `z.unknown()` für `mcpServers` und `hooks`, weil
**`Ig5` ZUR PARSE-ZEIT läuft** und sonst fälschliche Mismatch-Events für
jede Inline-mcpServers-Spezifikation auslösen würde. Die eigentliche Validierung ist delegiert an:

- `gS8` (für `mcpServers`) — wird **bei der Agentenregistrierung** von
  `DL7` per-item `safeParse` aufgerufen
- `TKO` (für `hooks`) — wird **beim Auslösen von Hooks** von `_u().safeParse` aufgerufen

Diese **lazy Validierung** ist das Vorbild, das Qwen Code nachahmen sollte: den Frontmatter-Parser
permissiv halten (`z.unknown()`-Äquivalent in TS), am Verwendungspunkt validieren.
Der Versuch, den vollen zod-Baum in `SubagentConfig` nach vorne zu bringen, würde uns
zwingen, auch die `MCPServerConfig`-Klasse von Qwen und den `HookDefinition`-Typ in eine
Ebene zu importieren, in der sie derzeit nicht leben, und würde erfordern, dass wir
fiktive Validatoren für `type: 'sdk'` / `type: 'claudeai-proxy'` erfinden, die wir
nicht tatsächlich unterstützen.

## Phase 4 — Sicherheitslage

Empirische Überprüfung der `yaml@2.8.1`-Standardeinstellungen in diesem Qwen-Code-Baum:

### Testergebnisse

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ Standard-Schema ist `'core'` (YAML 1.2 JSON-Superset). **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ `!!js/function`-Tag wird NICHT ausgeführt. Der Wert wird zum **Literal-String**
`"function(){}"` aufgelöst (kein aufrufbares Funktionsobjekt) und gibt eine
nicht-fatale `YAMLWarning` aus. Ein Angreifer kann keine RCE über diesen Vektor erreichen. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ Alias-Expansion / Billion-Laughs wird **standardmäßig** ABGELEHNT. Die Bibliothek
ist mit `maxAliasCount: 100` ausgeliefert (der fehlgeschlagene Parse zählt 1+10+100 = 111
Aliase). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ Merge-Key (`<<`) wird standardmäßig als **Literal-Key-String** geparst, NICHT
expandiert. Der `<<`-Parser ist opt-in via `{ merge: true }`. Wir werden ihn NICHT aktivieren. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC-förmige verschachtelte mcpServers parsen korrekt zu tief verschachteltem
Objekt/Array. **C**

### Sicherheitszusammenfassung

| Vektor                         | `yaml@2.8.1` Standard             | Maßnahme in Qwen Code notwendig                     |
| ------------------------------ | --------------------------------- | --------------------------------------------------- |
| Beliebige JS-Ausführung        | Unmöglich — kein eval              | Keine                                                |
| `!!js/function`-Tag            | Wird zu Literal-String + Warning  | Keine                                                |
| Billion Laughs                 | Abgelehnt (`maxAliasCount: 100`)  | Keine — Standard beibehalten                         |
| Merge-Keys (`<<`)              | Als Literal-Key behandelt         | Keine — Standard beibehalten (NICHT `merge: true` übergeben) |
| Anker / Aliase (normale Nutzung)| Erlaubt, nützlich für CC-förmige Daten | Keine                                                |
| Beliebige unbekannte Tags      | String + `YAMLWarning`            | Optional: Warnungen an einen Logger umleiten (siehe Phase 6) |

**Fazit**: Das Standardverhalten des `yaml`-Pakets ist bereits sicherer als das, was die ursprüngliche
Aufgabenbeschreibung via `js-yaml`s `FAILSAFE_SCHEMA` verlangt hat. Kein Schema-Lockdown erforderlich.

## Phase 5 — Wiederherstellungssemantik

CC wählt eine **gnädige Warnen-und-Verwerfen**-Haltung auf jeder Ebene:

1. YAML-Parser wirft → Frontmatter-Parser loggt + gibt `{}` (leere Daten) zurück
2. Feld hat falsche Form (z.B. `mcpServers: "this is a string"`) → `safeParse`
   schlägt fehl → Feld wird aus der ausgegebenen Konfiguration entfernt
3. Feld hat _fast_ falsche Form (z.B. einzelnes `mcpServers`-Element ist ein
   String, wenn das Schema ein Objekt erwartet) → per-item `safeParse` verwirft nur
   dieses Element, behält die restlichen

Qwen Code implementiert bereits die pro-Feld Warnen-und-Verwerfen-Haltung für
`permissionMode`, `maxTurns`, `color`, `effort` (siehe
`packages/core/src/subagents/agent-frontmatter-schema.ts`). Wir erweitern das gleiche Muster auf `mcpServers` und `hooks`.

Was wir NICHT von CC übernehmen:

- **2-Pass-YAML-Wiederherstellung mit automatischen Anführungszeichen**. Das ist Ballast für
  Qwen Code — wir sind ein neues Projekt, keine alten handbearbeiteten Frontmatter-Dateien
  zu verzeihen. Ein sauberer Fehler ist nützlicher als eine geratene Neuinterpretation.
- **`tengu_*`-Telemetrie-Events**. Ersetzt durch den eigenen Logger von Qwen Code /
  der Telemetrieschicht, die der Rest des Loaders verwendet.

## Phase 6 — Empfehlung für Qwen Code

### Bibliothekswahl

- **`yaml@^2.8.1` verwenden** (bereits transitiv → zu einer direkten
  Abhängigkeit in `packages/core/package.json` befördern, damit wir unter strengeren Auflösungsmodi
  nicht brechen; ermöglicht auch das Pinnen des Major).
- **Standardschema (`core`) verwenden**, kein Schema-Flag.
- **Nicht** `{ merge: true }` übergeben. Keine nicht-standardmäßige Option aktivieren.
- Für deterministische Stringify-Ausgabe (Testsnapshots) übergebe
  `{ lineWidth: 0, defaultStringType: 'PLAIN' }` an `yaml.stringify`, damit die
  Bibliothek keine langen Zeilen umbricht oder willkürlich auf Block-Skalar-Zitierung
  basierend auf Inhaltslänge umschaltet.

### API-Oberfläche beibehalten

Aktuelle Exporte von `packages/core/src/utils/yaml-parser.ts`:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

Der Ersatz behält beide Signaturen **identisch** bei, sodass die 5 Aufrufer
(`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`,
`skill-manager.ts`, `skill-load.ts`) und der Re-Export in `index.ts` keine
Änderungen an der Aufrufstelle erfordern.

Implementierungsskizze:

```ts
import * as yaml from 'yaml';

export function parse(yamlString: string): Record<string, unknown> {
  const parsed = yaml.parse(yamlString);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string {
  return yaml.stringify(obj, {
    lineWidth: options?.lineWidth ?? 0,
    minContentWidth: options?.minContentWidth ?? 20,
  });
}
```

**Warum Nicht-Objekt-Toplevels zu `{}` zwingen**: Jeder vorhandene Aufrufer nimmt ein
Record an. Eine YAML-Datei, die zu `null` (leere Datei), `["foo"]` (eine Liste)
oder `"hello"` (ein bloßer Skalar) geparst wird, würde derzeit nachgelagerte Destrukturierungen
zum Absturz bringen. Die Rückgabe von `{}` bewahrt das Verhalten des alten selbstgeschriebenen Parsers
bei denselben Eingaben. Dokumentiere dies als bewusste Schutzmaßnahme in einem einzeiligen Kommentar.

### Aufrufer, die keine Änderungen benötigen

| Datei                                               | Nutzung                                                              | Kompatibel?                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/index.ts:360`                    | re-exportiert `*` aus yaml-parser                                    | ja — gleiche Namen                                                      |
| `packages/core/src/subagents/subagent-manager.ts:15`| `parse`, `stringify`                                                 | ja                                                                      |
| `packages/core/src/extension/claude-converter.ts:26`| `parse`, `stringify`                                                 | ja — Roundtrip ist jetzt sicher für `mcpServers` + `hooks` (siehe Phase 3)|
| `packages/core/src/utils/rulesDiscovery.ts:20`      | `parse as parseYaml`                                                 | ja                                                                      |
| `packages/core/src/skills/skill-manager.ts:13`      | `parse as parseYaml` (und separat `import * as yaml from 'yaml'`)    | ja — und das doppelte `import * as yaml` kann in einem Follow-up entfernt werden|
| `packages/core/src/skills/skill-load.ts:11`         | `parse as parseYaml`                                                 | ja                                                                      |
### Benötigte Test-Fixtures

Drei konkrete YAML-Ausschnitte, die der aktuelle eigenentwickelte Parser nicht verarbeiten kann
und die der Ersatz beherrschen muss (einer pro verschachtelter Form):

```yaml
# Fixture 1 — mcpServers (Record of Records)
mcpServers:
  filesystem:
    type: stdio
    command: node
    args:
      - /path/to/server.js
    env:
      DEBUG: '1'
  github:
    type: http
    url: https://mcp.example.com/github
    headers:
      Authorization: 'Bearer xxx'
```

```yaml
# Fixture 2 — hooks (Record of Arrays of Records, zwei Verschachtelungsebenen unter dem Event-Namen)
hooks:
  PreToolUse:
    - matcher: 'Read|Write'
      hooks:
        - type: command
          command: echo before
          timeout: 5000
  PostToolUse:
    - matcher: '*'
      hooks:
        - type: command
          command: echo after
```

```yaml
# Fixture 3 — gemischt flach + tief, plus alles, was PR #4842 bereits unterstützt
name: agent-x
description: test
permissionMode: acceptEdits
maxTurns: 5
color: cyan
tools:
  - Read
  - Write
mcpServers:
  filesystem:
    type: stdio
    command: node
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: log
```

### Tests, die geändert werden müssen

`packages/core/src/utils/yaml-parser.test.ts` enthält 2 „Pin-Tests“ am
Ende (Zeilen 200–227) mit dem Titel `known limitations — nested YAML (pin until
js-yaml lands)`. Der Ersatz **MUSS** diese in positive
Form von geschachtelten Parsing-Assertions umwandeln:

```ts
it('parses array-of-records', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('parses record-of-records', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

Diese beiden Assertions plus die drei obigen Fixtures sind das **Akzeptanzkriterium**
für Phase 2 des Implementierungsplans. Alles andere (Escape-Sonderfälle,
quotierte vs. unquotierte Booleans, numerische Strings) ist Regression­sabdeckung
aus der bestehenden Testsuite und sollte unverändert bestehen bleiben.

### Round-Trip-Paritätsprüfung

Der bestehende Test `should maintain round-trip integrity for escaped strings`
(Zeile 111-129) prüft 7 Strings mit `stringify → parse`. Die Standard-
`stringify`-Methode von `yaml` erzeugt eine etwas andere Ausgabe als der
eigenentwickelte Formatierer (aggressiveres Quotieren in manchen Fällen,
andere Escape-Sequenzen). Zwei akzeptable Ergebnisse:

1. **Test-Fixtures anpassen**, um das Verhalten unter dem neuen Parser zu prüfen
   — die Round-Trip-Eigenschaft (`parse(stringify(x)) === x`) ist das Wesentliche,
   nicht byteidentische YAML-Ausgabe.
2. **Die byteidentischen Assertions beibehalten** und sie sichtbar fehlschlagen lassen,
   dann auf die exakte Ausgabe von `yaml` aktualisieren. Einfachere Diff-Prüfung.

Empfehlung: **Option 1** — die Assertions in eigenschaftsbasierte Prüfungen ändern
(`expect(parse(stringify(obj))).toEqual(obj)`), da byteidentische YAML-Ausgabe
kein dokumentierter Vertrag des Moduls ist.

### Breaking Changes für Aufrufer — keine erwartet, aber verifizieren

- `subagent-manager.ts` serialisiert das geparste Objekt zurück zu YAML für den
  `saveSubagent`-Pfad. Mit dem neuen Parser werden `mcpServers` und `hooks`
  sauber round-trippen. `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` in
  `claude-converter.ts` (Phase 3 der Implementierung) aktualisieren, um diese
  beiden Feldnamen zu entfernen.
- `skill-manager.ts` importiert `yaml` bereits direkt (getrennt vom
  eigenentwickelten Parser). Sobald `yaml-parser.ts` auch `yaml` verwendet,
  kann der doppelte Import als kleiner Folge-Änderung entfernt werden —
  hier nicht im Scope.

### Migrationsrisiko

Niedrig. Die 5 Aufrufer destructuren alle ein `Record<string, unknown>` — gleicher
Rückgabetyp. Die beiden absichtlichen „garbles“-Pin-Tests sind die einzigen
erwarteten Fehlschläge; sie sind bekannt und wir ändern sie absichtlich um.
Breitere Regression­sabdeckung bieten die bestehenden Test-Suiten in
`packages/core/src/subagents/`,
`packages/core/src/skills/` und
`packages/core/src/extension/`.

## Offene Fragen

| #   | Frage                                                                                                                                              | Blockierend?                                                           | Lösungsweg                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Braucht `yaml.parse` einen expliziten Logger, um `YAMLWarning` (z.B. `Unresolved tag`) an den Logger von qwen-code umzuleiten, statt `process.emitWarning`? | Nein — verschieben                                                     | Falls Logs in CI zu laut werden, `{ logLevel: 'silent' }` oder einen eigenen `onWarning`-Callback einbauen. Nicht kritisch für v1.                                 |
| Q2  | Soll `parse()` weiterhin `{}` für leere Strings / Null-Dokumente zurückgeben, oder einen Fehler werfen?                                                | Nein — aktuelles Verhalten beibehalten                                  | Der aktuelle eigenentwickelte Parser gibt `{}` zurück; das behalten wir. Einen Regressionstest zur Fixierung der Wahl hinzufügen.                                   |
| Q3  | Wenn `mcpServers` auf oberster Ebene fehlerhaft ist (z.B. `mcpServers: "string"`), soll der gesamte Agent nicht laden, oder das Feld weglassen?         | Ja — bestimmt die Warn-und-Weglass-Strategie in Phase 3 der Implementierung | **Lösung**: Feld weglassen, eine Konsolenwarnung ausgeben (Parität mit CC `DL7` gemäß Phase 3 von `docs/declarative-agents-port.md`).                              |
| Q4  | Gleiche Frage wie Q3, aber für `hooks`: Soll das ganze Feld, das Event oder nur der einzelne Matcher weggelassen werden?                              | Ja — bestimmt die Warn-und-Weglass-Strategie                             | **Lösung**: Bei Fehler auf oberster Ebene das gesamte `hooks`-Feld weglassen. Die Granularität pro Event / Matcher wird in einen zukünftigen PR verschoben, falls ein echter Nutzer dies benötigt. |
| Q5  | Ist die `Bun.YAML.parse`-Abkürzung aus dem CC-Helfer für qwen-code relevant?                                                                       | Nein                                                                    | qwen-code zielt nicht auf die Bun-Laufzeit ab. Überspringen.                                                                                                       |

---

**Status**: Recherche abgeschlossen, bereit zur Implementierung von Phase 2 (Ersetzen von
`yaml-parser.ts`) und Phase 3 (Wiederherstellen von `mcpServers` + `hooks` auf
`SubagentConfig`) gemäß `docs/declarative-agents-port.md`.