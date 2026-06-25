# Strukturierte Ausgabe (`--json-schema`)

Schränken Sie die finale Antwort des Modells auf ein von Ihnen bereitgestelltes JSON-Schema ein. Qwen
Code registriert ein synthetisches Terminal-Tool, das das Modell aufrufen muss, parst die Argumente des
Aufrufs anhand Ihres Schemas und stellt die validierte Nutzlast auf der Standardausgabe (oder im
JSON-/Stream-JSON-Ergebnis-Envelope) bereit. Der erste gültige Aufruf beendet den Durchlauf.

Nur im Headless-Modus – funktioniert mit `qwen -p`, einem Positions-Prompt oder einem über stdin
gepipeten Prompt.

## Schnellstart

```bash
qwen --prompt "Fassen Sie die Änderungen in HEAD mit Risikostufe zusammen" \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary":    { "type": "string" },
      "risk_level": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["summary", "risk_level"],
    "additionalProperties": false
  }'
```

Ausgabe auf stdout (Standard `--output-format text`):

```json
{ "summary": "…", "risk_level": "low" }
```

Die Zeile besteht exakt aus der JSON-stringifizierten Nutzlast + Zeilenumbruch – kein
Envelope, kein Ereignisprotokoll. Leiten Sie sie direkt in `jq` oder einen anderen Konsumenten weiter.

Im **Text**-Modus ist stdout bei Erfolg für die JSON-Nutzlast reserviert und bei Fehlschlag leer;
Fehlermeldungen und Logzeilen gehen nach stderr. Dadurch sind Capture-Patterns wie
`$(qwen --json-schema …) || exit 1` im Textmodus sicher – Fehler landen in stderr, nicht in der
erfassten Variable vermischt. Die beiläufige Prosa des Modells während der Planung wird **nicht** auf
stderr gespiegelt – der Textmodus verwirft sie; greifen Sie zu
`--output-format json` oder `stream-json`, wenn Sie sie sehen müssen.

In `--output-format json` und `stream-json` wird die Fehlerergebnismeldung auf **stdout**
zusammen mit dem Erfolgspfad ausgegeben (als letztes Element des JSON-Arrays oder als abschließende
`result`-Zeile im JSONL-Stream). Nicht alle Fehlermodi geben ein Ergebnis auf stdout aus –
maximale Sitzungsdurchläufe (Exit 53) und Signalunterbrechungen (Exit 130) beenden nur mit
stderr-Ausgabe. Prüfen Sie zuerst den Exit-Code; `is_error` auf dem Ergebnisobjekt
disambiguiert innerhalb der Teilmenge der Fehler, die tatsächlich ein Ergebnisereignis produzieren.

> **Leeres Schema:** Die Übergabe von `{}` erzeugt `{}` (ein leeres JSON-Objekt)
> auf stdout. Das Modell ruft `structured_output` ohne Argumente auf;
> der vorgelagerte Argument-Normalisierungspfad wandelt den leeren Funktionsaufruf
> in eine leere Objekt-Nutzlast um, die die Validierung gegen das leere Schema besteht
> und unverändert ausgegeben wird.

## Schema bereitstellen

Zwei äquivalente Formen:

```bash
# Inline-JSON-Literal
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Aus einer Datei lesen
qwen -p "…" --json-schema @./schemas/summary.json
```

Die `@path`-Form expandiert `~`, normalisiert den Pfad und liest die Datei
mit `utf8`-Kodierung.

> **Hinweis zur Latenz:** Erfolgreiche Durchläufe haben eine Verzögerung beim Herunterfahren,
> **begrenzt auf ~500 ms**, während laufende Hintergrund-Agenten ihre finalen Benachrichtigungen
> spülen, bevor das Ergebnis ausgegeben wird. Die Verzögerung wird frühzeitig beendet, wenn keine
> Hintergrundtasks ausstehen, sodass einfache Durchläufe sie kaum bemerken; Batch-Pipelines, die
> Hunderte von `--json-schema`-Aufrufen gegen ausgelastete Agenten ausführen, sollten diese
> Obergrenze einplanen.

> **Sicherheitshinweis:** Schemas können benutzerdefinierte reguläre Ausdrücke in `pattern`-Schlüsselwörtern enthalten.
> Ajv kompiliert diese mit der ECMAScript-Regex-Engine, die anfällig für katastrophales Backtracking ist.
> Da Tool-Argumente immer Objekte sind, feuert das `pattern`-Schlüsselwort nur innerhalb von String-Eigenschaften –
> ein bösartiges Schema wie
> `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`
> kann die CLI aufhängen, wenn das Modell einen mäßig langen passenden Wert liefert.
> Verwenden Sie `--json-schema` nur mit Schemas aus vertrauenswürdigen Quellen.

Validierung zur Parse-Zeit:

- Die Datei muss eine reguläre Datei sein (keine FIFOs, Zeichengeräte oder Verzeichnisse).
- Die Dateigröße ist auf 4 MiB begrenzt. Reale JSON-Schemas liegen weit darunter;
  mehrere MiB große Dateien deuten fast immer auf einen falschen Pfad hin.
- Das Schema muss gültiges JSON sein. Bei `@path`-Eingabe ist die Parse-Fehlermeldung
  generisch ("Inhalt von `<path>` ist kein gültiges JSON"), statt das SyntaxError-Detail
  zu wiederholen, sodass ein umschließender Prozess, der stderr ausgibt, kein Präfix des
  Dateiinhalts aus dem Fehler lesen kann.
- Das Schema muss unter der strengen Ajv-Konfiguration kompilieren –
  Tippfehler wie `propertees` werden angezeigt, aber spezifikationsgültige Muster
  (z. B. `required` ohne Auflistung jedes Schlüssels in `properties`) werden akzeptiert.
- Die Schema-Wurzel muss objekttypisierte Werte akzeptieren. Funktionsaufruf-APIs
  (Gemini, OpenAI, Anthropic) erfordern alle, dass Tool-Argumente JSON-Objekte sind,
  daher würde eine Nicht-Objekt-Wurzel ein unbenutzbares Tool registrieren.

Die Wurzel-Akzeptanzprüfung durchläuft `type`, `const`, `enum`, `anyOf`,
`oneOf`, `allOf`, `not` und `if`/`then`/`else` (bestmöglich für die entscheidbaren Fälle).
Im Zweifelsfall delegiert sie zur Laufzeit an Ajv.

> **Wurzel-`$ref` wird abgelehnt** durch die Parse-Zeit-Prüfung. Wenn Ihr Schema
> eine Definition über `$ref` wiederverwendet, umschließen Sie es mit `allOf`:
>
> ```jsonc
> // Abgelehnt:
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // Akzeptiert (Wurzel akzeptiert Objekte über den allOf-Zweig):
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `$ref` innerhalb von `anyOf` / `oneOf` / `allOf` wird zur Laufzeit an Ajv
> delegiert, daher besteht die umschlossene Form die Wurzel-Akzeptanzprüfung.
## Form der Ausgabe pro Format

| `--output-format` | Was nach stdout geht                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (Standard) | `JSON.stringify(payload) + "\n"` – eine Zeile, das validierte Objekt.                                                                                                                                                  |
| `json`            | Ein einzelnes JSON **Array** von Nachrichtenobjekten (das vollständige Ereignisprotokoll). Das letzte Element ist die Nachricht `type: "result"`, die sowohl `result` (`JSON.stringify(payload)`) als auch `structured_result` (das rohe Objekt) enthält. |
| `stream-json`     | Jedes Ereignis als eigene Zeile im JSONL-Format. Die abschließende Zeile `result` enthält `result` (stringifiziert) und `structured_result` (rohes Objekt).                                                     |

In beiden JSON-Formaten sollte `structured_result` gegenüber `result` bevorzugt werden, wenn das Objekt gewünscht wird; `result` ist die stringifizierte Form, die für Konsumenten bereitgestellt wird, die in diesem Feld immer einen String erwarten. Bei `--output-format json` lesen Sie das letzte Element des Arrays und extrahieren `structured_result` daraus (z. B. `jq '.[-1].structured_result'`); bei `stream-json` lesen Sie die letzte `type: "result"`-Zeile im Stream.

## Einschränkungen

| Kombination                                      | Verhalten                                                                                                                                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`   | Wird beim Parsen abgelehnt. Die Meldung „session ends now“ des synthetischen Tools hat keinen Abschluss in der TUI-Schleife.                                                                                                                   |
| `--json-schema` + `--input-format stream-json`    | Wird beim Parsen abgelehnt. Der Single-Shot-Terminalvertrag ist mit dem langlebigen Stream-json-Eingabeprotokoll nicht kompatibel.                                                                                                    |
| `--json-schema` + `--acp` / `--experimental-acp`  | Wird beim Parsen abgelehnt. ACP führt eine eigene Runden-Schleife, die den Terminalvertrag des synthetischen Tools nicht berücksichtigt.                                                                                                                  |
| `--json-schema` ohne Prompt und ohne gepiptes stdin | Wird beim Parsen abgelehnt. Der Headless-Modus benötigt einen Prompt – übergeben Sie `-p`, ein Positionsargument oder pipen Sie einen ein.                                                                                                                     |
| `--bare` + `--json-schema`                        | Unterstützt. Das synthetische Tool wird zusammen mit den drei Basis-Tools (`read_file`, `edit`, `run_shell_command`) registriert.                                                                                                             |
| `--json-schema` innerhalb eines Subagenten        | Tool wird NICHT registriert. Nur die Haupt-/Drain-Runden des Top-Level-Laufs halten den Terminalvertrag ein; ein Subagent, der das Tool aufruft, würde „session ends now“ erhalten und dann weiterlaufen, weil seine Schleife keinen Abschluss hat. |

## Wiederholungen und Fehlermodi

> **Kostenhinweis.** Zwei Faktoren vervielfachen den Tokenverbrauch in einem `--json-schema`-Durchlauf, beide sind planenswert:
>
> - **Schema in jeder Runde eingebettet.** Das Schema wird als `parameters`-Block der `structured_output`-Funktionsdeklaration bei jeder Modellanfrage mitgesendet, nicht nur bei der ersten. Große Schemata (bis zur 4-MiB-Parsing-Grenze) erhöhen proportional die Anzahl der Eingabe-Tokens pro Runde für den gesamten Durchlauf.
> - **Jeder Validierungs-Wiederholungsversuch ist eine vollständige Modellrunde.** Ein Schema, das das Modell wiederholt verfehlt, wird pro Fehlschlag multipliziert (Anfrage + Inferenz + Antwort). Halten Sie die Schemata ausreichend eingeschränkt, um das Modell zu führen, und einfach genug, um es beim ersten Mal zu treffen; erhöhen Sie `--max-session-turns`, wenn Wiederholungen erwartet werden.

Die Sitzung endet beim ersten gültigen Aufruf. Bis dahin gelten folgende Fälle:

- **Arg-Validierung fehlschlägt.** `structured_output` gibt einen Tool-Ergebnis-Fehler mit der Ajv-Meldung zurück, das Modell sieht dies in der nächsten Runde und kann die Argumente korrigieren und erneut aufrufen.
- **Modell ruft ein Nebenwirkungen-Tool in derselben Runde wie `structured_output` auf.** Die Vorab-Prüfung unterdrückt das Geschwister-Tool – es wird nie ausgeführt, unabhängig davon, ob der strukturierte Aufruf letztlich validiert. Die beiden Pfade teilen sich auf, je nachdem, was das Modell als nächstes sieht:
  - **Validierung erfolgreich:** Der Lauf endet sofort, und das Modell erhält keine weitere Runde – das unterdrückte Geschwister-Tool wird stillschweigend verworfen.
  - **Validierung fehlschlägt:** Das Modell erhält eine weitere Runde und sieht ein synthetisiertes „Skipped:“-`tool_result` für den unterdrückten Aufruf, sodass es diesen in einer **separaten Runde** (ohne `structured_output`) erneut ausführen kann.
- **Modell gibt reinen Text aus, anstatt `structured_output` aufzurufen.** Exit-Code `1`. Die Fehlermeldung enthält die Rundenanzahl und eine abgeschnittene Vorschau der Modellausgabe, damit Sie sehen, was das Modell tatsächlich gesagt hat.
- **Lauf erreicht `maxSessionTurns`.** Exit-Code `53`. Standardmäßiger „Reached max session turns“-Exit, plus ein `--json-schema`-spezifischer Hinweis, der auf die drei häufigen Ursachen für hängengebliebene Läufe hinweist: Das Modell hat das Tool nie aufgerufen, `structured_output` wird durch Berechtigungsregeln verweigert, oder das Schema ist nicht erfüllbar.
- **Lauf wird unterbrochen (SIGINT / Strg-C).** Exit-Code `130`. Das strukturierte Ergebnis wird normalerweise nicht ausgegeben, aber die Shutdown-Holdback-Schleife prüft das Abbruchsignal nicht, so dass ein SIGINT, der nach der erfolgreichen Erfassung eines Aufrufs, aber bevor das Ergebnis stdout erreicht, eintrifft, möglicherweise noch auf stdout landet. Betrachten Sie den Exit-Code als Quelle der Wahrheit.
## Datenschutz

Die über `structured_output` übergebenen Argumente SIND die strukturierte Nutzlast — bereits auf stdout ausgegeben. Um zu vermeiden, dass dieselbe Nutzlast ein zweites Mal in geräteinterne Oberflächen geschrieben wird, die möglicherweise vom Gerät exportiert werden, werden Argumente mit dem Platzhalter `{ __redacted: 'structured_output payload (see stdout result)' }` geschwärzt in:

- Der Telemetrie von `ToolCallEvent` (OTLP-Exports, QwenLogger, ui-telemetry-Stream, chat-recording-UI-Ereignisspiegelung).
- Der Chat-Aufzeichnungs-JSONL auf der Festplatte unter `~/.qwen/projects/<bereinigtes-cwd>/chats/<sessionId>.jsonl` (wird bei `--continue` / `--resume` erneut in den Modellkontext eingespeist), einschließlich jedes Validierungsfehler-Wiederholungsversuchs.

Tool-Call-Metriken (Dauer, Erfolg, Entscheidung) und umgebende Ereignismetadaten bleiben erhalten.

> **Schema wird an den Modellanbieter gesendet.** Die Schwärzung betrifft nur die _Aufrufargumente_ auf lokalen Oberflächen. Das Schema selbst wird bei jeder Modellanfrage als `parameters`-Block der `structured_output`-Funktionsdeklaration mitgesendet – daher erreichen alle Literalwerte, die Sie darin ablegen (`enum`, `const`, `default`, `examples`, `description`, `$comment` usw.), den Anbieter im Klartext, genau wie der Prompt-Text. Schemata sollten Form und Einschränkungen beschreiben; behandeln Sie sie als öffentlich gegenüber dem Anbieter und halten Sie Geheimnisse, Kundendaten und andere sensible Nutzlasten aus dem Schema heraus.

> **Hooks sehen rohe Argumente.** Die oben beschriebene Schwärzung gilt nur für Telemetrie und Chat-Aufzeichnung. `PreToolUse`, `PostToolUse` und `PostToolUseFailure`-Hooks (einschließlich HTTP-Hooks, die Nutzlasten geräteextern weiterleiten können) erhalten das ungeschwärzte `tool_input` für `structured_output`, da der Hook-Vertrag lautet: „sehe, was das Tool sieht." Wenn Sie Audit-artige Catch-all-Hooks betreiben, deaktivieren Sie diese entweder für `structured_output` (Filtern nach `tool_name`) oder fügen Sie eine hook-seitige Schwärzung hinzu, bevor Sie `--json-schema` auf sensible Daten anwenden.

## Sitzungswiederaufnahme (`--continue` / `--resume`)

`--json-schema` ist ein pro-Lauf-Flag, keine pro-Sitzung-Eigenschaft. Das synthetische Tool wird registriert, wenn die CLI ihre Argumente parst, also:

- Geben Sie `--json-schema` bei jedem `--continue` / `--resume` erneut an, für das der Endgerätevertrag gelten soll. Das gleiche Schema wie beim ursprünglichen Lauf ist die sichere Voreinstellung – ein Schemawechsel während der Sitzung ist erlaubt, ändert aber den Vertrag, an den das Modell gebunden ist.
- Wenn Sie `--continue` ohne `--json-schema` ausführen, ist der fortgesetzte Lauf eine normale kopflose Sitzung: `structured_output` existiert einfach nicht als Tool, und das Modell antwortet in Freitext.
- Der `__redacted`-Platzhalter in der fortgesetzten Chat-Aufzeichnung beeinträchtigt die Wiederaufnahmefähigkeit in der Praxis nicht. Ein erfolgreicher `structured_output`-Aufruf beendet die Sitzung sofort, sodass ein fortgesetzter Lauf nur geschwärzte Argumente von fehlgeschlagenen Versuchen sehen kann. Das Modell hat immer noch den Ajv-Validierungsfehler jedes Versuchs im aufgezeichneten `tool_result` und das aktive Parameter-Schema (neu registriert von `--json-schema`), was für einen erneuten Versuch ausreicht.

## Berechtigungssteuerung

`structured_output` umgeht bewusst die `--core-tools`-Positivliste: Das Tool existiert nur, wenn `--json-schema` gesetzt ist, sodass ein Ausschluss den Lauf ohne Endgerätevertrag lassen würde.

Explizite `permissions.deny`-Regeln und `--exclude-tools`-Einstellungen WIRKEN jedoch – beide verwenden denselben Ablehnungsmechanismus und verhindern beide die Registrierung von `structured_output`, sodass das Modell die Tool-Deklaration nie sieht. Das typische Ergebnis ist, dass das Modell in Klartext antwortet (Exit 1). Wenn das Modell durch andere Tools schleift, ohne jemals Text zu produzieren, erreicht es irgendwann `maxSessionTurns` (Exit 53), und der `--json-schema`-Hinweis in der Fehlermeldung zeigt Ihnen, wo Sie suchen müssen.

> **`--bare`-Besonderheit.** Der Bare-Modus ignoriert die meisten aus Einstellungen abgeleiteten Eingaben, einschließlich `permissions.deny` und `tools.exclude` aus den Einstellungen. Das synthetische Tool bleibt registriert, sodass ein ausschließlich auf Einstellungen basiertes Verweigern von `structured_output` unter `--bare` stillschweigend wirkungslos bleibt. `--exclude-tools structured_output` auf Argumentebene gilt auch im Bare-Modus – verwenden Sie das Flag statt der Einstellungen, wenn Sie einen Bare-Lauf absichern müssen.

## Konflikt mit MCP-Tools

Wenn ein MCP-Server ein Tool mit dem Namen `structured_output` registriert, benennt die Tool-Registry-Kollisionsprüfung das MCP-Tool in `mcp__<servername>__structured_output` um, sodass das synthetische Tool den nackten Namen behält. Das vom Benutzer bereitgestellte Schema ist immer das, was das Modell sieht.

## Beispiel: Absicherung eines mehrstufigen Laufs auf Basis der strukturierten Ausgabe

```bash
RESULT=$(qwen --prompt "Prüfe diesen Diff und bewerte sein Risiko." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "Diff mit hohem Risiko; Pipeline angehalten." >&2
  exit 2
fi
```

## Siehe auch

- [Headless Mode](headless.md) — der `-p`-basierte Ablauf, auf dem `--json-schema` aufbaut.
- [Dual Output](dual-output.md) — zeichnet einen JSON-Ereignis-Seitenwagen parallel zur TUI auf (ein anderer Ansatz für maschinenlesbare Ausgabe; benötigt kein `--json-schema`).
