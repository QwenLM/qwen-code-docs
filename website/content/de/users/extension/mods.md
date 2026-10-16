# Experimentelle Mods

Qwen Code kann eine kleine Teilmenge der Claude Code Mod API in Headless-Sessions ausführen.
Dieses Feature ist opt-in und erfordert einen vertrauenswürdigen Workspace sowie eine aktivierte Claude- oder
native Qwen-Erweiterung. Agent Plugins v1-Pakete ignorieren weiterhin Hooks.

Füge diese Einstellung zu deinen Qwen-Einstellungen hinzu:

```json
{
  "experimental": { "mods": true }
}
```

Erstelle ein Plugin-Verzeichnis mit diesen Dateien:

```text
hello-mod/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.js
```

`.claude-plugin/plugin.json`:

```json
{ "name": "hello-mod", "version": "1.0.0" }
```

`hooks/hooks.json` (Modulpfade sind relativ zu dieser Datei):

```json
{ "modules": ["./register.js"] }
```

`hooks/register.js`:

```javascript
let calls = 0;

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hello',
      description: 'Say hello without a model request',
    });
    return next(e);
  });

  on('command.run', { command: 'hello' }, ($, e) => ({
    text: `Hello ${e.args || 'world'}! Call ${++calls}.`,
  }));

  on('session.end', ($, e, next) => {
    $.ui.log(`Finished ${e.sessionId}`, { to: 'debug' });
    return next(e);
  });
}
```

Installiere das Plugin und führe seinen Befehl aus:

```bash
qwen extensions install ./hello-mod --consent
qwen -p '/hello Qwen' --output-format json
```

Die normale CLI-Authentifizierungskonfiguration ist beim Start weiterhin erforderlich. Der Mod-
Befehl selbst stellt keine Modellanfrage. Text-, JSON- und Stream-JSON-Headless-Ausgabe
werden unterstützt. Ein Stream-JSON-Prozess behält Modulvariablen zwischen Turns.

## Unterstützte Teilmenge

| Oberfläche    | Verhalten                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packaging  | Ein `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` oder `.cts` ESM-Entry; relative statische Imports und Re-Exports innerhalb des installierten Plugins                                                        |
| Entry      | `register(on, options)`; asynchrone Registrierung wird abgewartet; typisierte Nicht-Secret-Optionen werden kopiert und tief eingefroren                                                                           |
| Lifecycle  | Alle Module registrieren sich vor der initialen `session.start`-Kette; `session.end` bei Exit und Conversation-Replacement; Clear/Resume laden Module nicht neu                                   |
| Commands   | Registrierung während `session.start` mit Name, Description und optionalem ArgumentHint; Abfangen registrierter Mod-Befehle über Plugins hinweg; Rückgabe von `{text}` oder `{}`                            |
| Tools      | Abfangen bestehender Main-Session-Tools mit `tool.call`; Inspizieren und Einschränken nativer Permission-Entscheidungen mit `tool.check`                                                              |
| Middleware | Patterns und rekursive Matcher; explizites, wiederholbares `next(e)`; `.catch` und pro-Plugin-Fehlerwiederherstellung; eingefrorene Eingabe und Host-Identität                                               |
| API events | `command.register`- und `ui.log`-Aufrufe durchlaufen die Middleware-Kette mit vom Host gelieferter Origin                                                                                       |
| Logging    | `$.ui.log` gibt void zurück und stellt Lieferung in Warteschlange; Transkript-Logs verwenden stderr im Textmodus oder `system/ui_log` in JSON-Modi; Debug-Logs bleiben im Debug-Logger; keines wird Model-Input |
| Isolation  | Separate QuickJS-Umgebung pro Plugin innerhalb eines Session-Workers; keine Node-, Filesystem- oder Network-APIs; Speicher-, Stack-, Source/Output- und Ausführungslimits                                 |

Dies ist eine unterstützte Teilmenge, keine vollständige Kompatibilität mit bestehenden Claude Mods.
JSX/TSX, Runtime-Package-Imports, Built-in-Command-Abfangen, Tool-Registrierung und aktive `$.tool`-APIs, Context,
State/Store, Rendering, Streaming-Events und Hot-Reload sind nicht implementiert.
Befehle können noch nicht `context`, `exitCode` oder Engine-Referenzen zurückgeben.

Zwei Mods können nicht denselben Befehlsnamen registrieren: die spätere Registrierung wird abgelehnt.
Ein Konflikt mit einem Qwen-Built-in-Befehl verwendet weiterhin Qwens Befehl-Konfliktrichtlinie:
der Erweiterungsbefehl wird zu `extensionName.commandName` umbenannt. Deaktivierte Slash-
Befehlsnamen werden gegen den resultierenden Namen gematcht.

## Middleware und Recovery

Patterns wählen aus `session.start`, `session.end`, `command.run`,
`command.register`, `ui.log`, `tool.call` und `tool.check`. Verwende einen exakten Namen, einen Präfix wie `command.*`,
`*`, oder eine einzelne Negation wie `!session.*`. Andere konkrete Events und die
Patterns `!*` und `!!...` werden abgelehnt.

Matcher sind partielle Objekte. Alle angegebenen Felder müssen matchen; Arrays sind
Alternativen, verschachtelte Objekte matchen ihre eigenen Felder, und reguläre Ausdrücke
testen die String-Darstellung des Feldes. Matcher werden während der Registrierung kopiert.
Sie erlauben höchstens acht Ebenen und 256 Knoten. Stateful `g`/`y`-Regexes und verschachtelte
Quantifiers werden abgelehnt; Regex-Inputs länger als 65.536 Zeichen matchen
konservativ und überlassen die Entscheidung dem Hook. Verschachtelte Objekte sind Daten, nicht
Operatoren wie `startsWith`.

Ein exaktes Event kann eine Registrierung ohne Matcher und mehrere
Registrierungen mit Matchern haben, einschließlich gleicher Matcher. Jedes Wildcard- oder negierte
Pattern kann einmal registriert werden. Innerhalb eines Plugins bestimmt die Registrierungsreihenfolge
die Kette; Consumer laufen vor ihren deklarierten Dependency-Providern. Ein Handler
kann früh antworten, auch bei `session.start`, und verhindert, dass spätere Handler
laufen. Nur Befehl-`args` können bei `command.run` umgeschrieben werden; Lifecycle- und
Befehls-Identitätsfelder bleiben fixiert.

## Tool-Abfangen

`tool.call` empfängt die Qwen-Tool-Argumente als flache Felder neben `tool`
und `tool_use_id`. Namen, Argument-Schemas und Output-Records verwenden Qwens native
Verträge, daher kann ein für Claude's Built-in-Tools geschriebener Mod Anpassung benötigen.
Es gibt kein separates `tool.result`-Event; inspiziere oder ändere den von
`await next(e)` zurückgegebenen Wert:

```javascript
export function register(on) {
  on('tool.call', { tool: 'write_file' }, async ($, e, next) => {
    if (!e.file_path.endsWith('.txt'))
      return { deny: 'Only text files are allowed' };
    return next({ ...e, content: e.content.trim() });
  });

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e);
    if (e.tool === 'run_shell_command') {
      return { decision: 'deny', reason: 'Shell is disabled by this Mod' };
    }
    return verdict;
  });
}
```

Jedes normale `tool.call`-Next startet einen frischen nativen Tool-Versuch: Validierung,
klassische Hooks, Permissions, Genehmigungen und Invocation-Guards gelten weiterhin.
Zusätzliche Versuche zählen gegen `--max-tool-calls`; Catch-Replay fügt keinen
Versuch hinzu. Sessions mit Tool-Middleware serialisieren Tool-Aufrufe, einschließlich paralleler
Next-Aufrufe, da umgeschriebene Argumente Side-Effects einführen können. Ein Root-
Aufruf erlaubt höchstens 64 native Versuche und 32 ausstehende Host-Operationen.
Das 60-Sekunden-Root-Limit beinhaltet native Ausführung und Wartezeit auf
Genehmigung. Rückkehr bevor ein ausstehendes Next abgeschlossen ist, bricht diese Arbeit ab und
wartet auf deren Abschluss.

`tool.check` empfängt `{tool, input, tool_use_id}` nach nativer Validierung und
klassischen Input-Umschreibungen. Alle Felder sind fixiert. Sein Next gibt ein deklaratives
`{decision: 'allow' | 'ask' | 'deny', reason?}` zurück, ohne das Tool auszuführen.
Qwen mergt die Antwort restriktiv: ein Mod kann ein natives Deny oder
Ask nicht zu Allow upgraden. Ein Mod-Ask folgt dem bestehenden Entscheidungsfluss des aktuellen Genehmigungsmodus; erforderliche menschliche Interaktion und klassische erzwungene Asks bleiben maßgeblich.
Dies ist absichtlich strenger als Claude's Consumer-Permission-Overrides.
Wenn ein nativer PermissionRequest-Hook die Argumente neu aufbaut, werden sie erneut geprüft.
Ein vom Mod verfasster `rule`, `hook` oder `ceiling` kann keine Host-Permissions erstellen.

Gib `{deny: reason}` zurück zum Blockieren, oder `{result: value}` zum Liefern eines JSON-Ergebnisses
ohne Ausführung. Natives Next gibt `{ref, result, text, isError?}` zurück.
`result` ist der native Funktionsantwort-Record, typischerweise `{output: ...}` oder
`{error: ...}`. Eine zurückgegebene Ref mit unverändertem Result behält die Originalausgabe,
einschließlich Bilder und Output-Metadaten; Änderung von Text- oder Error-Flags
neben dieser Referenz ändert sie nicht. Host-Ausführungsfakten bleiben über alle Versuche hinweg erhalten, auch wenn ein früheres Ergebnis gewählt wird. Um den Output zu ändern,
gib ein neues Result zurück:
`{result: {output: 'Replacement text'}}`. Records mit nur String-
`output`/`error`-Feldern behalten diese Form; anderes JSON wird vollständig in einen
`output`-String serialisiert, sodass native Output-Budgets weiterhin gelten. Der Host besitzt die
Funktionsantwort: JSON wird nie als IDs, Media-Parts oder Ausführungsfakten interpretiert.
Unbekannte Refs und `isReadOnly`-Claims gewähren keine Provenienz. Ergebnisse, die zu groß für
die Mod-Payload sind, enthalten einen Omission-Hinweis und eine Ref; Rückgabe dieses Paares
unverändert bewahrt die vollständige native Antwort.

Native Errors, Genehmigungsanforderungen und Abbruch können nicht in
erfolgreiche Ausführung umgewandelt werden durch Änderung des Mod-Ergebnisses. Eine Verweigerung nach Next kann
die Effekte eines Tools nicht rückgängig machen: Qwen meldet, dass das Tool bereits lief. Dasselbe gilt,
wenn ein früherer Versuch lief und ein späterer Versuch verweigert wurde. Context-Injection
und Request-Metadaten werden nicht unterstützt.

Tool-Identität, Invocation-IDs, Consent und Host-Metadaten sind fixiert. Native
Argumentnamen, die mit `tool`, `tool_use_id`, `agentId`, `consent`,
`requestMeta` oder `$shadowed` kollidieren, werden in einem vom Host erstellten, fixierten `$shadowed`-
Record aufbewahrt und für die Ausführung wiederhergestellt. Gültige deferred `tool_call`-Anfragen legen
den Namen und die Argumente des aufgelösten Ziels offen, während die nativen Permission-Gates des Wrappers erhalten bleiben. Ungültige Wrapper, unbekannte Tools, Fixed-Policy-Aufrufe und das
synthetische `structured_output`-Terminal-Tool bleiben auf ihren ursprünglichen Pfaden.
`tool_search` und `search_memory` bleiben ebenfalls nativ, damit vom Gast verfasste Ergebnisse nicht
ihre nativen Output-Budget-Ausnahmen erben können.
Goal-Tool-Aufrufe behalten ebenfalls den nativen Pfad: diese Stufe erlaubt keine vom Mod verfassten
Ergebnisse, die als externe Beweise in einen Goal-Katalog gelangen.
Child-Agents und verschachtelte Code-Mode-Scheduler erben diese Middleware nicht.

## Befehl-Recovery

```javascript
export function register(on) {
  on('command.run', { command: /^hello/ }, async ($, e, next) => {
    const result = await next({ ...e, args: e.args.trim() });
    return { text: `[wrapped] ${result.text || ''}` };
  }).catch(($, e, next) => next(e));
}
```

Normales `next` führt bei jedem Aufruf Downstream aus. Die Registrierungen eines Plugins bilden
eine Schicht, die sich einen Failure-Record und ein Zeitbudget teilen. Bei einem Throw, Timeout oder
ungültigen Ergebnis werden seine Catches in Registrierungsreihenfolge versucht, bis einer eine
nicht-undefined-Antwort zurückgibt oder `next` aufruft. Ein Catch, der undefined zurückgibt oder wirft,
ohne `next` aufzurufen, erlaubt dem nächsten passenden Catch, zu laufen. Wie in Claude Code
2.1.296 beendet eine ungültige Antwort oder ein Fehlschlag nach `next` die Catch-Auswahl und verwendet
den geteilten Fallback-Record; er versucht keine späteren Catches. `next.called` im Catch
bedeutet, dass das Plugin in das nächste Plugin übergetreten ist, bevor die Recovery begann, nicht nur
in eine andere eigene Registrierung.

Wenn das Plugin bereits Downstream aufgerufen hat, wartet die Recovery auf und replayt den letzten
gestarteten Aufruf, einschließlich seiner Zurückweisung, ignoriert Replay-Argumente. Wenn es nicht hatte,
führt das erste `next` des Catch Downstream einmal aus und spätere Aufrufe replayen ihn. Ein
fehlgeschlagener Catch verwendet denselben Record. Ohne einen erfolgreichen Catch wird das Plugin
übersprungen oder sein aufgezeichnetes Ergebnis beibehalten. Ein registrierter Befehl, den niemand beantwortet,
schlägt explizit fehl; er wird nicht an das Modell gesendet.

`next` legt `event`, `is(pattern)`, eingefrorene `origin`, `signal` und einen frischen eingefrorenen
`budget`-Snapshot mit `ms` und `remainingMs` offen. Catch empfängt zusätzlich `called`
und `error.kind` (`throw`, `timeout` oder `re-entry`). Engine-Events verwenden Origin
`{ plugin: 'engine', tier: 'core' }`; Mod-API-Events identifizieren das aufrufende Plugin
mit Tier `user`. Managed-Tier-`next.to`, Tracing und benutzerdefinierte Namespace-`lent`-
Recovery sind nicht verfügbar.

API-Events beginnen am Kettenkopf. Ihr Input ist die Befehlsspezifikation oder
der `{text, to}`-Log-Payload. Gib `next(e)`, `{value}` zum Antworten, oder `{deny: reason}`
zurück, um den API-Aufruf abzulehnen. Sofortige Selbst-Reentry überspringt diese Registrierung; aktive
Vorfahren-Registrierungen können ihren Catch verwenden. Re-Entry-Catch kann `next` nicht aufrufen,
und sein `next` verwendet das Original-Event einmal. `ui.log` bleibt eine Void-Benachrichtigung:
`await $.ui.log(...)` wartet nicht auf Interceptoren. Die Headless-Grenze drainet
wartende Benachrichtigungen vor der Rückgabe des Outputs.

Eine normale Plugin-Schicht hat 10 Sekunden eigene Zeit, exklusive Wartezeit auf
Cross-Plugin-`next` oder API-Aufrufe. Wartende Void-`ui.log`-Benachrichtigungen pausieren nicht
das Budget des Aufrufers. Catch und Re-Entry-Recovery verwenden ein Ein-Sekunden-Budget.
Re-Entry-Dispatch teilt dieses kürzere Budget mit anderen Registrierungen in
diesem Plugin. Qwen begrenzt zusätzlich jeden Root-Dispatch auf 60 Sekunden und jedes
ununterbrochene Gast-Ausführungsslice auf 10 Sekunden. Alle `session.end`-Arbeiten teilen sich
1,5 Sekunden. Ein äußerer Handler, der früh fertig wird, gibt ausstehende Downstream-
Arbeit auf; Abbruch startet niemals eine Fallback-Operation. Behaltene Next/API-Funktionen
können keine Arbeit ausführen, nachdem ihre Invocation endet. Ein Worker, der Abbruch nicht innerhalb von 250 Millisekunden bestätigen kann, wird terminiert, was eine neue Session erfordert.

Es gibt höchstens 32 Mod-Umgebungen, 64 registrierte Befehle, 128 Registrierungen
pro Plugin und 4.096 Root/API-Event-Ketten pro Root-Aufruf. Durchreichen durch ein anderes
Plugin verbraucht kein zusätzliches Event. Jede Umgebung hat ein 64 MiB
Speicherlimit. Logs und Nachrichten-Payloads sind ebenfalls begrenzt. Registrierungs-, Kompilierungs-
und Konfigurationsfehler lehnen weiterhin die Initialisierung ab; gewöhnlicher Hook-Fehler
kann sich erholen, ohne den Modulzustand zurückzusetzen. Gast-Promise-Jobs laufen nur, während ein
Host-Request aktiv ist, einschließlich seines wartenden Benachrichtigungs-Drains.

Mods laufen nicht in TUI, ACP, Managed/SSH, Sandbox oder Session-Agent-Entry-Points in
dieser Version. Safe Mode, Bare Mode und `disableAllHooks` verhindern ebenfalls das Laden.
Starte neu nach Änderung von Plugin-Code, Optionen oder Erweiterungsaktivierung. Ein bereits geladener
Befehl prüft jedes beteiligte Plugin vor der Ausführung erneut und verweigert eine geänderte
oder deaktivierte Middleware-Kette. Externe Einstellungsänderungen werden nach Neustart wirksam.
Native Qwen-Erweiterungen mit einem absoluten oder externen Hooks-Manifest-Pfad verwenden weiterhin
nur den klassischen Hook-Loader. Claude-Hooks-Pfade, die Konvertierung bereits ignoriert,
weil sie absolut oder außerhalb der Erweiterung sind, werden auch von der
Mod-Entdeckung übersprungen. Mod-Manifeste müssen relative Pfade innerhalb der Erweiterung sein.

## TypeScript und relative Imports

Ändere den Hooks-Entry zu `./register.ts`, um TypeScript zu verwenden. Imports und
Re-Exports können relative Pfade, erweiterungslose Pfade, Verzeichnis-`index`-Dateien
oder JavaScript-Schreibweisen von TypeScript-Dateien verwenden (`./helper.js` kann zu
`helper.ts` auflösen). Exakte Dateien gewinnen. Als nächstes kommen `.js` → `.ts`, `.mjs` → `.mts`, und
`.cjs` → `.cts`-Substitutionen, gefolgt von `.ts`, `.js`, `.mjs`, `.cjs`, `.mts`,
`.cts`-Kandidaten, wobei jede Datei und dann ihr Verzeichnis-Index versucht wird. Alle sechs
Suffixe verwenden ESM, einschließlich `.cjs` und `.cts`. Modul-Zyklen und geteilter importierter
Zustand innerhalb eines Plugins werden unterstützt.

Kompilierung verwendet feste Optionen innerhalb des abbrechbaren Workers; sie type-checkt nicht
oder lädt `tsconfig.json`, Package-Resolver oder Build-Plugins. Type-only
Imports, einschließlich Typen aus `claude-code`, werden gelöscht. Runtime-Value-Imports
aus `claude-code` benötigen APIs außerhalb dieser Teilmenge und werden abgelehnt, ebenso wie
Package/Node/URL-Imports, dynamische Imports, `require`, JSX und importierte Top-Level-
`await`. Gast-Code wird weiterhin nur in QuickJS ausgeführt.

## Plugin-Optionen

Deklariere `userConfig` im Plugin-Manifest:

```json
{
  "name": "hello-mod",
  "version": "1.0.0",
  "userConfig": {
    "greeting": {
      "type": "string",
      "title": "Greeting",
      "description": "Greeting used by /hello",
      "default": "Hello"
    }
  }
}
```

Setze Optionen in User- oder System-Settings, dann lies `options.greeting` aus dem
zweiten Argument zu `register`:

```json
{
  "experimental": { "mods": true },
  "pluginConfigs": {
    "hello-mod": { "options": { "greeting": "Welcome" } }
  }
}
```

Felder erfordern `type`, `title` und `description`. Unterstützte Typen sind `string`,
`number`, `boolean`, `directory` und `file`. Optionale Constraints umfassen
`required`, `default`, numerische `min`/`max`, String-`multiple` und String-
`options`-Auswahlmöglichkeiten. Datei- und Verzeichniswerte sind Strings, ohne Existenzprüfung
oder hinzugefügten Filesystem-Zugriff. `sensitive: true` wird explizit nicht unterstützt,
auch wenn ein Default angegeben ist; es gibt keine Secret-Speicherung oder Config-UI.

Qwen verwendet SystemDefaults → User → System-Präzedenz, mergt individuelle Options-
Schlüssel. Workspace-Einstellungen werden ignoriert, auch in vertrauenswürdigen Workspaces. Qwen mappt
Erweiterungen ohne Marketplace-Provenienz auf die Inline-Identität. Sie akzeptieren
`name` und `name @inline`; letzteres gewinnt innerhalb jeder Einstellungsquelle.
Marketplace-Plugins verwenden ihre tatsächliche `name @marketplace`-Identität. Eine höhere
Prioritätsquelle gewinnt über jeden lokalen Alias von einer niedrigeren Prioritätsquelle.

Wie in der inspizierten Claude-Implementierung werden fehlende optionale Werte zu `''`,
außer sie haben Defaults; optionales `''` umgeht auch Typprüfungen. Erforderliche
Werte lehnen fehlende oder `''` ab, während `false` und `0` gültig bleiben. Ungültige gespeicherte
String-Auswahlmöglichkeiten fallen auf Defaults zurück. Bei einem nichtleeren Schema werden unbekannte Options-
Schlüssel ebenfalls durchgereicht, begrenzt auf Strings, Zahlen, Booleans oder String-Arrays.
Ein abwesendes oder leeres Schema erhält `{}`. Optionen bleiben bis zum Neustart eingefroren.

## Installierte Dependencies

Manifest-`dependencies` akzeptiert Plugin-Namen, `name @marketplace` oder Objekte
wie `{ "name": "base", "marketplace": "team", "version": "^1.0.0" }`.
Bloße Namen beziehen sich auf den Marketplace des Consumers. Ein installiertes Inline-Plugin mit
demselben Namen kann eine Marketplace-Dependency überschreiben, ohne Versionsprüfung.
Andernfalls werden Versionsbereiche gegen die Manifest-Version der installierten Erweiterung geprüft.
Gewöhnliche Erweiterungen ohne Mods können Dependencies erfüllen.
Ihre transitiven Dependencies werden geprüft, wenn sie von einem ausgewählten Mod erreichbar sind;
Dependency-Deklarationen nicht verwandter gewöhnlicher Erweiterungen nehmen nicht teil.

Dependencies müssen bereits installiert, aktiviert und für diesen Aufruf ausgewählt sein.
Qwen holt, installiert oder aktiviert sie nicht automatisch. Ausgewählte Mods werden
in stabiler Consumer-vor-Dependency-Reihenfolge für direkte Dependencies
zwischen Mods registriert; gewöhnliche Provider sind keine Registrierungs-Knoten. Jeder Mod hat ein
separates Realm; Events durchlaufen ihre Handler in dieser Reihenfolge, was
Cross-Plugin-Abfangen ohne gemeinsame Modulvariablen ermöglicht.

Fehlende, mehrdeutige, inkompatible oder zyklische Dependencies lehnen den Start ab, bevor
irgendein Mod-Worker startet. Ungültige Mod-Optionen lehnen ebenfalls den Start ab. Dies unterscheidet sich
von Claude's selektiver Dependency-Degradierung und Zyklus-Reihenfolge-Fallback; Qwen
behält die Whole-Session-Startup-Failure-Policy der experimentellen Teilmenge.

## Ressourcenlimits

Der Reader akzeptiert reguläre Dateien bis zu 256 KiB innerhalb der installierten Erweiterung und
lehnt symbolische Links innerhalb dieses Roots ab. Graphen sind auf 64 Dateien, 1 MiB
Input und 1 MiB kompilierten Code begrenzt. Diese Grenzen und Symlink-Ablehnung sind
strenger als Claude's. Jeder Gast hat ein 64 MiB Speicherlimit und 1 MiB Stack-Limit.
Die oben beschriebenen Ausführungsbudgets beinhalten ein 60-Sekunden-Startup-Limit für alle
Worker-Initialisierung, Kompilierung und Startup-Hooks zusammen. Das Gast-Speicher-
Limit deckt nicht den Host-Speicher des Compilers ab.

Die Author-API basiert auf Claude Code 2.1.296-Deklarationen und der
[offiziellen Mod-Dokumentation](https://code.claude.com/docs/en/plugins/mods/create).