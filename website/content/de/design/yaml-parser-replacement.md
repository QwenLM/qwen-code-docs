# YAML-Parser-Ersatz — Rechercheergebnisse

Internes Designdokument zum Ersetzen des handgeschriebenen, 192 Zeilen langen YAML-Parsers unter
`packages/core/src/utils/yaml-parser.ts` durch eine echte Bibliothek, damit die verzögerten
`mcpServers`- und `hooks`-Felder aus dem Declarative-Agent-Schema von Claude Code sicher einen
Roundtrip durch Subagent-/Skill-/Converter-Codepfade absolvieren können.

Begleitdokument zu [`docs/design/declarative-agents-port.md`](./declarative-agents-port.md).
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Voraussetzung für
den Follow-up zu [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Phase 0 — Überprüfte Quellen

| Quelle                                                  | Version / Datum                          | Warum maßgeblich                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | älterer CC-Snapshot (pre-2.1.168)        | direkte Quelle — 15-Zeilen-Wrapper, der die Bibliothek benennt                                                                |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | derselbe Snapshot                        | direkte Quelle — 370-Zeilen-Frontmatter-Splitter + 2-Pass-Recovery                                                            |
| `/private/tmp/cc-2.1.168/claude.strings`                | extrahiert aus CC 2.1.168                | maßgeblich für das aktuelle Verhalten — Strings enthalten obfuskierte Symbolnamen, aber auch das JSON-Schema und Fehlertext   |
| `packages/core/src/utils/yaml-parser.ts` (dieses Repo)  | HEAD von `lazzy/gifted-hamilton-684741`  | der zu ersetzende Parser                                                                                                      |
| Live-`node -e`-Proben gegen `yaml@2.8.1` in diesem Tree | 2026-06-08                               | empirisches Sicherheitsverhalten — Anchors, Merge-Keys, `!!js/function`, Billion-Laughs, `maxAliasCount` (Ergebnisse inline in Phase 4) |

Vertrauensstufen: **C** durch direkte Beweise bestätigt; **I** aus mehreren bestätigten Fakten abgeleitet; **O** offene Frage.

## Phase 1 — Welche YAML-Bibliothek verwendet CC?

**Antwort: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), NICHT
`js-yaml`.** Bestätigt durch wörtliches Lesen von `~/code/claude-code/src/utils/yaml.ts`:

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
- **API**: Top-Level `.parse(input)`. Verwendet das Standard-Schema des Pakets (welches
  YAML 1.2 `core` ist — JSON-Superset, keine JS-Erweiterungen). **C**
- **Bun-Shortcut**: Bei der Ausführung unter Bun verwendet CC `Bun.YAML.parse()`, um
  das Bündeln von ~270 KB YAML-Parser zu vermeiden. **C** Nicht relevant für qwen-code
  (wir zielen nicht auf die Bun-Laufzeitumgebung ab).
- **Schema-Modus**: Wird in CC nirgends explizit gesetzt. Verlässt sich auf das
  Standardverhalten des `yaml`-Pakets sowie auf die Zod-Validierung auf Consumer-Ebene
  (`DL7`, `gS8`, `TKO`/`_u` gemäß `docs/design/declarative-agents-port.md`). **C**

### Warum `yaml` statt `js-yaml`

| Dimension                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Standard-Schema          | `DEFAULT_SAFE_SCHEMA` (seit 4.x) — sicher; ältere Versionen hatten `DEFAULT_FULL_SCHEMA` mit JS | `core` (YAML 1.2 Spec) — nur JSON-Typen             |
| `!!js/function` Tag      | In 4.x NICHT unterstützt (war in 3.x)                                                      | Nie unterstützt                                      |
| Billion-Laughs-Schutz    | Keine (manuelle Verantwortung)                                                             | Eingebauter `maxAliasCount: 100` Standard            |
| Merge-Keys (`<<`)        | Unterstützt (muss über `MERGE_SCHEMA` oder Filterung abgewählt werden)                     | Standardmäßig deaktiviert, Opt-in via `{ merge: true }` |
| Bereits eine qwen-code-Dependency? | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓ (bereits importiert von `skill-manager`) |

Beide sind im Jahr 2026 vernünftige Wahlmöglichkeiten, aber **die ursprüngliche Aufgabenstellung
empfahl `js-yaml`'s `FAILSAFE_SCHEMA` / `CORE_SCHEMA`**. Wir weichen aus drei konkreten Gründen
von dieser Empfehlung ab:

1. **CC-Parität**. Der ganze Zweck der Portierung des CC-Frontmatter-Schemas ist es,
   Benutzern zu ermöglichen, eine CC-Agent-Datei in `.qwen/agents/` abzulegen und sie
   identisch parsen zu lassen. Die Verwendung desselben Parsers, den CC verwendet, minimiert
   Abweichungen bei YAML-Konstrukten in Edge-Cases (Multi-Doc-Streams, Flow- vs. Block-Scalars, Tag-Handling).
2. **`yaml` ist bereits ein direkter User in `skill-manager.ts`** — siehe
   `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Die Standardisierung auf `yaml` eliminiert einen von zwei doppelten YAML-Stacks im
   selben Paket. **C** (Grep-Ergebnis in Phase 6 dokumentiert).
3. **Sicherere Defaults als `js-yaml`**. Das eingebaute `maxAliasCount` von `yaml` blockiert
   Billion-Laughs ohne manuelle Konfiguration; Merge-Keys sind standardmäßig deaktiviert;
   beliebige Tags werden zu Literal-Strings mit einer `YAMLWarning`, anstatt
   aufrufbare Resolver auszulösen. Empirische Beweise in Phase 4.

Wenn ein zukünftiger Maintainer die `yaml`-Dependency droppen und auf `js-yaml` vereinheitlichen möchte,
ist die Migration mechanisch: Ersetze `yaml.parse` / `yaml.stringify`
durch `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`. Die
beiden Bibliotheken stimmen bei der Ausgabe für das 100%-Subset überein, das CC und qwen-code
tatsächlich verwenden (Key-Value-Paare, Listen, verschachtelte Maps, skalare Booleans/Numbers).
Diese Entscheidung sollte separat verfolgt werden, falls sie aufkommt.

## Phase 2 — Frontmatter-Parsing-Pipeline (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` ist 370 Zeilen lang. Wichtige
Erkenntnisse:

| Schritt                | Logik                                                                                                                     | Quelle                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Delimiter-Match        | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — öffnet bei Spalte 0, Body ist non-greedy, schließendes `---` muss auf einer eigenen Zeile stehen | `frontmatterParser.ts:~123` (Zeilennummern aus altem Snapshot; als ungefähr betrachten) **C**                 |
| Pass-1-Parse           | Rufe `parseYaml(body)` auf. Bei Erfolg → gebe geparstes Objekt + Content-Rest zurück.                                     | dieselbe Datei, Anfang des Try-Blocks **C**                                                                   |
| Pass-2-Recovery        | Bei `YAMLException`, gehe Zeilen durch, quote automatisch Werte, die wie Dates/Colons/Specials aussehen, retry `parseYaml` einmal. | Zeilen ~85–121 im alten Snapshot **C** (`tab → 2 spaces`-Normalisierung, ISO-Date-Heuristik, Colon-Trap)      |
| Failure-Fallthrough    | Beide Passes fehlgeschlagen → logge via `logForDebugging`, gebe `{ data: {}, content: text }` zurück. Agent wird mit leerem Frontmatter geladen. | Ende der Funktion **C**                                                                                       |
| Telemetrie             | Weiter upstream verpackt — `tengu_frontmatter_shadow_unknown_key` / `_mismatch`-Events feuern von `ug5.agent` (Ig5-Schema) | `claude.strings:308120`, `309074`, `309076` (querverwiesen in `docs/design/declarative-agents-port.md` Phase 1) |

**Implikation für qwen-code**: Wir müssen die 2-Pass-Recovery NICHT klonen.
Der `subagent-manager.ts` von qwen-code erzwingt bereits eine striktere "Throw on malformed
frontmatter at top level"-Semantik für seinen Loader (siehe `parseSubagentContent`),
und die 2-Pass-Recovery ist speziell dafür da, alte manuell bearbeitete CC
Agent-Dateien zu verzeihen. Die Portierung einer strikteren Haltung ist in Ordnung; wir müssen nur **nicht den
gesamten Loader crashen lassen**, wenn verschachtelte Felder fehlerhaft sind. Siehe Phase 5 für das
Warn-and-Drop-Verhalten.

## Phase 3 — Verschachtelte Validierung via Zod (CC)

Die relevanten CC-Validatoren gemäß `docs/design/declarative-agents-port.md` Phase 1 +
Binär-Strings-Cross-Check:

### `mcpServers` (CC-Symbol `gS8` / JSON-Shadow `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // server name reference
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (aus `claude.strings:124–135` Ref) ist eine
**discriminated union** über `type`:

| `type`             | Erforderliche Felder                     | Hinweise                                           |
| ------------------ | ---------------------------------------- | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]`     | Plus `env?: Record<string,string>`, `cwd?: string` |
| `"sse"`            | `url: string`                            | Plus `headers?: Record<string,string>`             |
| `"http"`           | `url: string`                            | Plus `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                            | qwen-code-Parität unbekannt — aufschieben bis benötigt |
| `"sdk"`            | variiert                                 | Interne CC-Nutzung; wir müssen NICHT unterstützen  |
| `"claudeai-proxy"` | variiert                                 | Interne CC-Nutzung; wir müssen NICHT unterstützen  |

**Für qwen-code v1**: Validiere als `Record<string, unknown>` (tolerant
im DL7-Stil), und lass die nachgelagerte Zusammenführung in `Config.getMcpServers()` die
Struktur-Konvertierung übernehmen. `qwen-code` hat bereits eine `MCPServerConfig`-Klasse mit
`type`-Diskriminierung — wir verwenden diesen Konverter wieder, anstatt das
Zod-Schema zu duplizieren. Siehe Phase 4 des Runtime-Wiring-Plans in
`docs/design/declarative-agents-port.md`.

### `hooks` (CC-Symbol `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (discriminated union on `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

Die Hook-Event-Keys gemäß dem Strings-Cross-Check sind dieselben, die qwen-code
bereits unterstützt: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — plus ein paar qwen-exklusive Events (`TodoCreated`, `TodoCompleted`),
die CC nicht hat.

**Für qwen-code v1**: Validiere als `Record<string, unknown>` (tolerant), dann
übergib an die bestehenden `SessionHooksManager`-Validatoren von qwen-code, die
bereits die `HookDefinition[]`-Form pro Event implementieren (siehe
`packages/core/src/hooks/types.ts:207–211` gemäß dem Phase-1-Runtime-Mapping).

### Warum beide Validatoren auf der `Ig5`-Shadow-Ebene `z.unknown()` sind

`Ig5` ist das **Telemetrie-Shadow-Schema** — es feuert
`tengu_frontmatter_shadow_unknown_key`-Events, wenn ein YAML-Key nicht im
bekannten Set ist, und `_mismatch`-Events, wenn ein bekannter Key den falschen Typ hat. Es
verwendet absichtlich `z.unknown()` für `mcpServers` und `hooks`, weil
**`Ig5` zur PARSE-Zeit läuft** und für jede Inline-mcpServers-Spec falsche Mismatch-Events auslösen würde. Die eigentliche Validierung wird delegiert an:

- `gS8` (für `mcpServers`) — aufgerufen **zum Agent-Registrierungszeitpunkt** von
  `DL7` pro-Item `safeParse`
- `TKO` (für `hooks`) — aufgerufen **zum Hook-Feuerungszeitpunkt** von `_u().safeParse`
Diese **Lazy Validation** ist das Modell, das qwen-code nachahmen sollte: Halte den Frontmatter-Parser permissiv (TS-Äquivalent zu `z.unknown()`), validiere erst bei der Verwendung. Der Versuch, den vollständigen Zod-Baum in `SubagentConfig` vorzuziehen, würde uns zwingen, auch qwens `MCPServerConfig`-Klasse und den `HookDefinition`-Typ in eine Ebene zu importieren, in der sie derzeit nicht existieren, und würde uns zwingen, Fake-Validatoren für `type: 'sdk'` / `type: 'claudeai-proxy'` zu erfinden, die wir eigentlich gar nicht unterstützen.

## Phase 4 — Sicherheitsprofil

Empirische Überprüfung der `yaml@2.8.1`-Standardwerte in diesem qwen-code-Tree:

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

→ Der `!!js/function`-Tag wird NICHT ausgeführt. Der Wert wird in den **Literal-String** `"function(){}"` aufgelöst (kein aufrufbares Funktionsobjekt) und gibt eine nicht-fatale `YAMLWarning` aus. Ein Angreifer kann auf diesem Weg keine RCE erreichen. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ Alias-Expansion / Billion Laughs wird **standardmäßig ABGELEHNT**. Die Bibliothek wird mit `maxAliasCount: 100` ausgeliefert (das fehlgeschlagene Parsing zählt 1+10+100 = 111 Aliase). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ Der Merge-Key (`<<`) wird standardmäßig als **Literal-Key-String** geparst, NICHT expandiert. Der `<<`-Parser ist über `{ merge: true }` optional aktivierbar. Wir werden ihn NICHT aktivieren. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC-förmige verschachtelte `mcpServers` werden korrekt in tief verschachtelte Objekte/Arrays geparst. **C**

### Sicherheitsübersicht

| Vektor | `yaml@2.8.1`-Standard | Aktion in qwen-code erforderlich |
| ------------------------------ | --------------------------------- | ------------------------------------------------------ |
| Beliebige JS-Ausführung | Unmöglich — kein eval | Keine |
| `!!js/function`-Tag | Wird zu Literal-String + Warning | Keine |
| Billion laughs | Abgelehnt (`maxAliasCount: 100`) | Keine — Standard beibehalten |
| Merge-Keys (`<<`) | Wird als Literal-Key behandelt | Keine — Standard beibehalten (NICHT `merge: true` übergeben) |
| Anker / Aliase (normale Nutzung) | Erlaubt, nützlich für CC-förmige Daten | Keine |
| Beliebige unbekannte Tags | String + `YAMLWarning` | Optional: Warnings an einen Logger umleiten (siehe Phase 6) |

**Fazit**: Das Standardverhalten des `yaml`-Pakets ist bereits sicherer als das, was die ursprüngliche Aufgabenbeschreibung über das `FAILSAFE_SCHEMA` von `js-yaml` gefordert hat. Es ist kein Schema-Lockdown-Aufruf erforderlich.

## Phase 5 — Recovery-Semantik

CC wählt auf jeder Ebene ein **graceful warn-and-drop**-Verhalten:

1. YAML-Parser wirft Fehler → Frontmatter-Parser loggt + gibt `{}` zurück (leere Daten)
2. Feld hat die falsche Form (z. B. `mcpServers: "this is a string"`) → `safeParse` schlägt fehl → Feld wird aus der ausgegebenen Konfiguration entfernt
3. Feld hat _fast_ die falsche Form (z. B. ein einzelnes `mcpServers`-Element ist ein String, wenn das Schema ein Objekt erwartet) → `safeParse` pro Element verwirft nur dieses Element und behält den Rest

qwen-code implementiert bereits das warn-and-drop-Verhalten pro Feld für `permissionMode`, `maxTurns`, `color`, `effort` (siehe `packages/core/src/subagents/agent-frontmatter-schema.ts`). Wir erweitern dieses Muster auf `mcpServers` und `hooks`.

Was wir NICHT von CC klonen:

- **2-Pass-YAML-Recovery mit Auto-Quoting**. Das ist totes Gewicht für qwen-code — wir sind ein neues Projekt, es gibt keine alten, manuell bearbeiteten Frontmatter-Dateien, die wir verzeihen müssten. Ein klarer Fehler ist nützlicher als eine erratene Neuinterpretation.
- **`tengu_*`-Telemetrie-Events**. Ersetzt durch qwen-codes eigenen Logger / die Telemetrie-Ebene, die der Rest des Loaders verwendet.

## Phase 6 — Empfehlung für qwen-code

### Bibliothekswahl

- **`yaml@^2.8.1` verwenden** (bereits eine transitive Abhängigkeit — zu einer direkten `packages/core/package.json`-Abhängigkeit hochstufen, damit wir bei strengeren Auflösungsmodi nicht brechen; ermöglicht uns außerdem, die Major-Version zu pinnen).
- **Standard-Schema verwenden** (`core`), kein Schema-Flag.
- **Nicht** `{ merge: true }` übergeben. Keine Nicht-Standard-Option aktivieren.
- Für deterministische Stringify-Ausgabe (Test-Snapshots) `{ lineWidth: 0, defaultStringType: 'PLAIN' }` an `yaml.stringify` übergeben, damit die Bibliothek lange Zeilen nicht umbricht oder willkürlich basierend auf der Inhaltslänge auf Block-Scalar-Quoting umschaltet.

### Zu erhaltende API-Oberfläche

Die aktuelle `packages/core/src/utils/yaml-parser.ts` exportiert:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

Der Ersatz behält beide Signaturen **identisch** bei, sodass die 5 Aufrufer (`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`, `skill-manager.ts`, `skill-load.ts`) und der `index.ts`-Re-Export keine Änderungen an den Aufrufstellen erfordern.

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

**Warum Nicht-Objekt-Top-Level in `{}` umwandeln**: Jeder bestehende Aufrufer erwartet ein Record. Eine YAML-Datei, die zu `null` (leere Datei), `["foo"]` (eine Liste) oder `"hello"` (ein bloßer Skalar) geparst wird, würde derzeit das nachgelagerte Destructuring zum Absturz bringen. Die Rückgabe von `{}` bewahrt das Verhalten des alten, handgeschriebenen Parsers bei denselben Eingaben. Dies als bewusste Schutzmaßnahme in einem einzeiligen Kommentar dokumentieren.

### Aufrufer, die keine Änderungen benötigen

| Datei | Nutzung | Kompatibel? |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core/src/index.ts:360` | re-exportiert `*` aus yaml-parser | ja — dieselben Namen |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify` | ja |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify` | ja — Round-Trip ist jetzt sicher für `mcpServers` + `hooks` (siehe Phase 3) |
| `packages/core/src/utils/rulesDiscovery.ts:20` | `parse as parseYaml` | ja |
| `packages/core/src/skills/skill-manager.ts:13` | `parse as parseYaml` (und separat `import * as yaml from 'yaml'`) | ja — und der doppelte `import * as yaml` kann in einem Follow-up entfernt werden |
| `packages/core/src/skills/skill-load.ts:11` | `parse as parseYaml` | ja |

### Erforderliche Test-Fixtures

Drei konkrete YAML-Snippets, bei denen der aktuelle handgeschriebene Parser fehlschlägt und die der Ersatz verarbeiten muss (eines pro verschachtelter Form):

```yaml
# Fixture 1 — mcpServers (record of records)
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
# Fixture 2 — hooks (record of arrays of records, two levels of nesting under the event name)
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
# Fixture 3 — mixed shallow + deep, plus everything PR #4842 already supports
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

`packages/core/src/utils/yaml-parser.test.ts` enthält unten 2 "Pin-Tests" (Zeilen 200–227) mit dem Titel `known limitations — nested YAML (pin until js-yaml lands)`. Der Ersatz MUSS diese in positive Nested-Parsing-Assertions umwandeln:

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

Diese beiden Assertions plus die drei obigen Fixtures sind das **Acceptance Gate** für Phase 2 des Implementierungsplans. Alles andere (Escaping-Edge-Cases, gequotete vs. ungequotete Booleans, numerische Strings) ist Regression-Coverage aus der bestehenden Test-Suite und sollte unverändert durchlaufen.

### Round-Trip-Paritätsprüfung

Der bestehende Test `should maintain round-trip integrity for escaped strings` (Zeilen 111-129) testet 7 Strings durch `stringify → parse`. Das Standard-`stringify` von `yaml` erzeugt eine leicht andere Ausgabe als der handgeschriebene Formatter (in manchen Fällen aggressiveres Quoting, andere Escape-Sequenzen). Zwei akzeptable Ergebnisse:

1. **Die Test-Fixtures anpassen**, um das Verhalten unter dem neuen Parser zu asserten — die Round-Trip-Eigenschaft (`parse(stringify(x)) === x`) ist entscheidend, nicht die byte-identische YAML-Ausgabe.
2. **Die byte-identischen Assertions beibehalten** und sie sichtbar fehlschlagen lassen, dann aktualisieren, um die Ausgabe von `yaml` wortwörtlich widerzuspiegeln. Einfacher im Diff zu reviewen.

Empfehlung: **Option 1** — die Assertions auf property-based umstellen (`expect(parse(stringify(obj))).toEqual(obj)`), da eine byte-identische YAML-Ausgabe kein dokumentierter Vertrag des Moduls ist.

### Breaking Changes für Aufrufer — keine erwartet, aber verifizieren

- `subagent-manager.ts` serialisiert das geparste Objekt für den `saveSubagent`-Pfad zurück nach YAML. Mit dem neuen Parser werden `mcpServers` und `hooks` sauber round-trippen. `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` in `claude-converter.ts` (Phase 3 der Implementierung) aktualisieren, um diese beiden Feldnamen zu entfernen.
- `skill-manager.ts` importiert `yaml` bereits direkt (getrennt vom handgeschriebenen Parser). Sobald `yaml-parser.ts` ebenfalls `yaml` verwendet, kann der doppelte Import als kleines Follow-up entfernt werden — hier nicht im Scope.
### Migrationsrisiko

Niedrig. Alle 5 Aufrufer destrukturieren ein `Record<string, unknown>` – gleicher Rückgabetyp. Die 2 absichtlichen "Garbles"-Pin-Tests sind die einzigen erwarteten Fehler; sie sind bekannt und wir schalten sie absichtlich um. Eine breitere Regressionsabdeckung liefern die bestehenden Test-Suites in `packages/core/src/subagents/`, `packages/core/src/skills/` und `packages/core/src/extension/`.

## Offene Fragen

| #   | Frage                                                                                                                                              | Blockierend?                                                               | Lösungsweg                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Benötigt `yaml.parse` einen expliziten Logger, um `YAMLWarning` (z. B. `Unresolved tag`) an den Logger von qwen-code statt an `process.emitWarning` umzuleiten?  | Nein – zurückstellen                                                              | Falls die Logs in der CI zu laut werden, `{ logLevel: 'silent' }` oder einen benutzerdefinierten `onWarning`-Callback durchreichen. Für v1 nicht kritisch.                                                      |
| Q2  | Soll `parse()` für YAML mit leerem String / Null-Dokument weiterhin `{}` zurückgeben oder einen Fehler werfen?                                                             | Nein – aktuelles Verhalten beibehalten                                          | Die aktuelle manuelle Implementierung gibt `{}` zurück; das behalten wir bei. Füge einen Regressionstest hinzu, der diese Entscheidung festschreibt.                                                                               |
| Q3  | Wenn `mcpServers` auf der obersten Ebene fehlerhaft ist (z. B. `mcpServers: "string"`), soll der gesamte Agent nicht geladen werden oder soll er geladen werden, wobei dieses Feld verworfen wird? | Ja – bestimmt die Warn-and-Drop-Vorgehensweise in Phase 3 der Implementierung | **Lösung**: Feld verwerfen, Console-Warning ausgeben (Übereinstimmung mit CC `DL7` gemäß Phase 3 von `docs/design/declarative-agents-port.md`).                                  |
| Q4  | Wie Q3, aber für `hooks`: das Feld, das Event oder nur den einzelnen Matcher verwerfen?                                                                | Ja – bestimmt die Warn-and-Drop-Vorgehensweise                                  | **Lösung**: Das gesamte `hooks`-Feld bei Fehlern in der Top-Level-Struktur verwerfen. Granularität pro Event / pro Matcher wird auf einen zukünftigen PR verschoben, falls ein echter Nutzer Bedarf anmeldet. |
| Q5  | Gilt die `Bun.YAML.parse`-Abkürzung aus dem CC-Helper für qwen-code?                                                                               | Nein                                                                      | qwen-code zielt nicht auf die Bun-Laufzeit ab. Überspringen.                                                                                                                            |

---

**Status**: Recherche abgeschlossen, bereit zur Implementierung von Phase 2 (Ersetzen von
`yaml-parser.ts`) und Phase 3 (erneutes Bereitstellen von `mcpServers` + `hooks` auf
`SubagentConfig`) gemäß `docs/design/declarative-agents-port.md`.