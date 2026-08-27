# Strukturierte Ausgabe (`--json-schema`)

Schränken Sie die endgültige Antwort des Modells auf ein von Ihnen bereitgestelltes JSON-Schema ein. Qwen Code registriert ein synthetisches Terminal-Tool, das das Modell aufrufen muss, parst die Argumente des Aufrufs anhand Ihres Schemas und gibt die validierte Nutzlast auf stdout aus (oder im JSON-/stream-json-Ergebnisumschlag). Der erste gültige Aufruf beendet den Durchlauf.

Nur im kopflosen Modus – funktioniert mit `qwen -p`, einem positionsabhängigen Prompt oder einem über stdin weitergeleiteten Prompt.

## Quick Start

```bash
qwen --prompt "Summarize the changes in HEAD with risk_level" \
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

Die Zeile besteht genau aus der JSON-stringifizierten Nutzlast + Zeilenumbruch – kein Umschlag, kein Ereignisprotokoll. Leiten Sie es direkt in `jq` oder einen anderen Verbraucher weiter.

Im **Text**-Modus ist stdout bei Erfolg für die JSON-Nutzlast reserviert und bei Fehlschlag leer; Fehlermeldungen und Protokollzeilen gehen nach stderr. Dadurch sind `$(qwen --json-schema …) || exit 1`-Erfassungsmuster im Textmodus sicher – Fehler landen auf stderr, nicht in der erfassten Variable vermischt. Die beiläufige Prosa des Modells während der Planung wird **nicht** auf stderr gespiegelt – der Textmodus verwirft sie; greifen Sie zu `--output-format json` oder `stream-json`, wenn Sie sie sehen müssen.

In `--output-format json` und `stream-json` wird die Fehlerergebnismeldung auf **stdout** zusammen mit dem Erfolgspfad ausgegeben (als letztes Element des JSON-Arrays oder als abschließende `result`-Zeile im JSONL-Stream). Nicht alle Fehlermodi geben ein Ergebnis auf stdout aus – max-session-turns (Exit 53) und Signalunterbrechungen (Exit 130) beenden nur mit stderr-Ausgabe. Überprüfen Sie zuerst den Exit-Code; `is_error` im Ergebnisobjekt disambiguiert innerhalb der Teilmenge von Fehlern, die ein Ergebnisereignis erzeugen.

> **Leeres Schema:** Die Übergabe von `{}` produziert `{}` (ein leeres JSON-Objekt) auf stdout. Das Modell ruft `structured_output` ohne Argumente auf; der vorgelagerte Argumentnormalisierungspfad wandelt den leeren Funktionsaufruf in eine leere Objekt-Nutzlast um, die die Validierung gegen das leere Schema besteht und unverändert ausgegeben wird.

## Schema bereitstellen

Zwei äquivalente Formen:

```bash
# Inline JSON-Literal
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Aus einer Datei lesen
qwen -p "…" --json-schema @./schemas/summary.json
```

Die `@path`-Form expandiert `~`, normalisiert den Pfad und liest die Datei mit `utf8`-Kodierung.

> **Latenznote:** Erfolgreiche Durchläufe verursachen eine Verzögerung beim Herunterfahren, **begrenzt auf ~500 ms**, während laufende Hintergrundagenten ihre letzten Benachrichtigungen leeren, bevor das Ergebnis ausgegeben wird. Die Verzögerung wird frühzeitig beendet, wenn keine Hintergrundaufgaben anstehen, sodass einfache Durchläufe es kaum bemerken; Batch-Pipelines, die hunderte `--json-schema`-Aufrufe an ausgelastete Agenten verteilen, sollten diese Obergrenze einkalkulieren.

> **Sicherheitshinweis:** Schemas können benutzergelieferte reguläre Ausdrücke in `pattern`-Schlüsselwörtern enthalten. Ajv kompiliert diese mit der ECMAScript-Regex-Engine, die anfällig für katastrophales Backtracking ist. Da Tool-Argumente immer Objekte sind, feuert das `pattern`-Schlüsselwort nur innerhalb von String-Eigenschaften – ein bösartiges Schema wie `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}` kann die CLI aufhängen, wenn das Modell einen mäßig langen passenden Wert liefert. Führen Sie `--json-schema` nur mit Schemas aus Quellen aus, denen Sie vertrauen.

Validierung zur Parse-Zeit:

- Die Datei muss eine reguläre Datei sein (keine FIFOs, Zeichengeräte oder Verzeichnisse).
- Die Dateigröße ist auf 4 MiB begrenzt. Reale JSON-Schemas liegen weit darunter; Dateien mit mehreren MiB deuten fast immer auf einen falschen Pfad hin.
- Das Schema muss gültiges JSON sein. Bei `@path`-Eingabe ist der Parse-Fehler generisch ("Inhalt von `<path>` ist kein gültiges JSON") und gibt nicht das SyntaxError-Detail wieder, sodass ein umschließender Prozess, der stderr anzeigt, keinen Präfix des Dateiinhalts aus dem Fehler lesen kann.
- Das Schema muss unter der strengen Ajv-Konfiguration kompilieren – Tippfehler wie `propertees` werden angezeigt, aber spezifikationskonforme Muster (z. B. `required` ohne Auflistung jedes Schlüssels in `properties`) werden akzeptiert.
- Die Schema-Wurzel muss objekttypisierte Werte akzeptieren. Funktionsaufruf-APIs (Gemini, OpenAI, Anthropic) erfordern alle, dass Tool-Argumente JSON-Objekte sind, daher würde eine Nicht-Objekt-Wurzel ein unbrauchbares Tool registrieren.

Die Wurzel-Akzeptanzprüfung durchläuft `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not` und `if`/`then`/`else` (bestmöglich für die entscheidbaren Fälle). Im Zweifelsfall delegiert sie zur Laufzeit an Ajv.

> **Root `$ref` wird zurückgewiesen** durch die Parse-Zeit-Prüfung. Wenn Ihr Schema eine Definition über `$ref` wiederverwendet, verpacken Sie es in `allOf`:
>
> ```jsonc
// Abgelehnt:
{ "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }

// Akzeptiert (Wurzel akzeptiert Objekte über den allOf-Zweig):
{ "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `$ref` innerhalb von `anyOf` / `oneOf` / `allOf` wird zur Laufzeit an Ajv delegiert, daher besteht die verpackte Form die Wurzel-Akzeptanzprüfung.

## Ausgabeform nach Format

| `--output-format` | Was auf stdout ausgegeben wird                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (Standard) | `JSON.stringify(payload) + "\n"` — eine Zeile, das validierte Objekt.                                                                                                                                                            |
| `json`            | Ein einzelnes JSON-**Array** von Nachrichtenobjekten (das vollständige Ereignisprotokoll). Das letzte Element ist die `type: "result"`-Nachricht, die sowohl `result` (`JSON.stringify(payload)`) als auch `structured_result` (das Rohobjekt) trägt. |
| `stream-json`     | Jedes Ereignis in einer eigenen Zeile als JSONL. Die abschließende `result`-Zeile trägt `result` (stringifiziert) und `structured_result` (Rohobjekt).                                                                             |

In beiden JSON-Formaten ist es vorzuziehen, `structured_result` gegenüber `result` zu lesen, wenn Sie das Objekt möchten; `result` ist die stringifizierte Form, die für Verbraucher bereitgestellt wird, die in diesem Feld immer einen String erwarten. Für `--output-format json` lesen Sie das letzte Element des Arrays und extrahieren `structured_result` daraus (z. B. `jq '.[-1].structured_result'`); für `stream-json` lesen Sie die letzte `type: "result"`-Zeile im Stream.

## Einschränkungen

| Kombination                                       | Verhalten                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`   | Wird zur Parse-Zeit zurückgewiesen. Die Nachricht "session ends now" des synthetischen Tools hat keinen Terminator in der TUI-Schleife.                                                                                                           |
| `--json-schema` + `--input-format stream-json`    | Wird zur Parse-Zeit zurückgewiesen. Der Einmal-Tool-Vertrag ist inkompatibel mit dem langlebigen stream-json-Eingabeprotokoll.                                                                                                                    |
| `--json-schema` + `--acp` / `--experimental-acp`  | Wird zur Parse-Zeit zurückgewiesen. ACP führt eine eigene Runden-Schleife, die den synthetischen Tool-Vertrag nicht beachtet.                                                                                                                    |
| `--json-schema` ohne Prompt und ohne gepipedes stdin | Wird zur Parse-Zeit zurückgewiesen. Der kopflose Modus benötigt einen Prompt – übergeben Sie `-p`, ein positionsabhängiges Argument oder pipen Sie einen.                                                                                       |
| `--bare` + `--json-schema`                        | Unterstützt. Das synthetische Tool wird neben den drei Bare-Tools (`read_file`, `edit`, `run_shell_command`) registriert.                                                                                                                         |
| `--json-schema` innerhalb eines Subagenten         | Tool wird NICHT registriert. Nur die Haupt-/Drain-Runden des obersten Durchlaufs beachten den Tool-Vertrag; ein Subagent, der das Tool aufruft, würde "session ends now" erhalten und dann weiterlaufen, da seine Schleife keinen Terminator hat. |

## Wiederholungs- und Fehlermodi

> **Kostennote.** Zwei Dinge vervielfachen den Tokenverbrauch in einem `--json-schema`-Durchlauf, beide bedenkenswert:
>
> - **Schema in jeder Runde eingebettet.** Das Schema wird als `parameters`-Block der Funktionsdeklaration `structured_output` bei jeder Modellanfrage mitgeliefert, nicht nur bei der ersten. Große Schemas (bis zum 4 MiB Parse-Limit) erhöhen proportional die Eingabe-Token pro Runde für den gesamten Durchlauf.
> - **Jeder Validierungswiederholungsversuch ist eine vollständige Modellrunde.** Ein Schema, das das Modell wiederholt verfehlt, wird pro Fehlschlag multipliziert (Anfrage + Inferenz + Antwort). Halten Sie die Schemas begrenzt genug, um das Modell zu führen, und einfach genug, um es beim ersten Versuch zu treffen; erhöhen Sie `--max-session-turns`, wenn Wiederholungen erwartet werden.

Die Sitzung endet beim ersten gültigen Aufruf. Bis dahin:

- **Argumente bestehen Validierung nicht.** `structured_output` gibt einen Tool-Ergebnis-Fehler mit Ajvs Nachricht zurück, das Modell sieht ihn in der nächsten Runde und kann die Argumente korrigieren und erneut aufrufen.
- **Modell ruft ein Tool mit Seiteneffekten in derselben Runde wie `structured_output` auf.** Der Vorab-Scan unterdrückt das Geschwister – es wird nie ausgeführt, unabhängig davon, ob der strukturierte Aufruf letztendlich validiert. Die beiden Pfade teilen sich auf, was das Modell als nächstes sieht:
  - **Validierung erfolgreich:** Der Durchlauf endet sofort, und das Modell bekommt nie eine weitere Runde – das unterdrückte Geschwister wird stillschweigend verworfen.
  - **Validierung fehlgeschlagen:** Das Modell bekommt eine weitere Runde und sieht ein synthetisiertes "Skipped:" `tool_result` für den unterdrückten Aufruf, damit es diesen Aufruf in einer **separaten Runde** (ohne `structured_output`) erneut ausführen kann.
- **Modell gibt reinen Text aus, statt `structured_output` aufzurufen.** Exit-Code `1`. Die Fehlermeldung enthält die Rundenanzahl und eine abgeschnittene Vorschau der Modellausgabe, damit Sie sehen, was es tatsächlich gesagt hat.
- **Durchlauf erreicht `maxSessionTurns`.** Exit-Code `53`. Standard-Exit "Maximale Sitzungsrunden erreicht", plus ein `--json-schema`-spezifischer Hinweis, der auf die drei häufigsten Ursachen für hängende Durchläufe verweist: Modell hat das Tool nie aufgerufen, `structured_output` wird durch Berechtigungsregeln verweigert oder das Schema ist unerfüllbar.
- **Durchlauf wird unterbrochen (SIGINT / Ctrl-C).** Exit-Code `130`. Das strukturierte Ergebnis wird normalerweise nicht ausgegeben, aber die Herunterfahrverzögerung prüft das Abbruchsignal nicht, daher kann ein SIGINT, das nach einem erfolgreichen Aufruf eintrifft, aber bevor das Ergebnis stdout erreicht, dennoch auf stdout landen. Behandeln Sie den Exit-Code als Quelle der Wahrheit.

## Datenschutz

Die Argumente, die Sie über `structured_output` einreichen, SIND die strukturierte Nutzlast – bereits auf stdout ausgegeben. Um zu vermeiden, dass dieselbe Nutzlast ein zweites Mal auf geräteseitigen Oberflächen gespeichert wird, die möglicherweise vom Gerät exportiert werden, werden Argumente mit dem Platzhalter `{ __redacted: 'structured_output payload (see stdout result)' }` geschwärzt auf:

- Dem `ToolCallEvent`-Telemetriepfad (OTLP-Exporte, QwenLogger, ui-telemetry-Stream, Chat-Aufzeichnungs-UI-Ereignisspiegel).
- Der auf der Festplatte gespeicherten Chat-Aufzeichnungs-JSONL unter `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` (wieder in den Modellkontext eingespeist bei `--continue` / `--resume`), einschließlich jedes Validierungsfehler-Wiederholungsversuchs.

Tool-Aufruf-Metriken (Dauer, Erfolg, Entscheidung) und umgebende Ereignismetadaten bleiben erhalten.

> **Schema wird an den Modellanbieter gesendet.** Die Schwärzung betrifft nur die _Aufrufargumente_ auf lokalen Oberflächen. Das Schema selbst reist bei jeder Modellanfrage als `parameters`-Block der Funktionsdeklaration `structured_output` mit – daher erreichen alle Literalwerte, die Sie darin platzieren (`enum`, `const`, `default`, `examples`, `description`, `$comment` usw.), den Anbieter im Klartext, genau wie der Prompt-Text. Schemas sollten Form und Einschränkungen beschreiben; behandeln Sie sie als öffentlich gegenüber dem Anbieter und halten Sie Geheimnisse, Kundendaten und andere sensible Nutzlasten aus dem Schema-Körper heraus.

> **Hooks sehen rohe Argumente.** Die oben beschriebene Schwärzung gilt nur für Telemetrie und Chat-Aufzeichnung. `PreToolUse`-, `PostToolUse`- und `PostToolUseFailure`-Hooks (einschließlich HTTP-Hooks, die Nutzlasten vom Gerät weiterleiten können) erhalten das ungeschwärzte `tool_input` für `structured_output`, da der Hook-Vertrag besagt: "Sehen, was das Tool sieht." Wenn Sie catch-all-Hooks im Audit-Stil betreiben, deaktivieren Sie sie entweder für `structured_output` (filtern Sie nach `tool_name`) oder fügen Sie eine hook-seitige Schwärzung hinzu, bevor Sie `--json-schema` gegen sensible Daten ausführen.

## Sitzungswiederaufnahme (`--continue` / `--resume`)

`--json-schema` ist ein Pro-Durchlauf-Flag, keine Pro-Sitzung-Eigenschaft. Das synthetische Tool wird registriert, wenn die CLI ihre Argumente parst. Daher:

- Übergeben Sie `--json-schema` bei jedem `--continue` / `--resume` erneut, bei dem der Tool-Vertrag gelten soll. Dasselbe Schema wie im ursprünglichen Durchlauf ist die sichere Voreinstellung – ein Schema-Wechsel mitten in der Sitzung ist erlaubt, ändert aber den Vertrag, an den das Modell gebunden ist.
- Wenn Sie `--continue` ohne `--json-schema` verwenden, ist der wiederaufgenommene Durchlauf eine gewöhnliche kopflose Sitzung: `structured_output` existiert einfach nicht als Tool, und das Modell antwortet in freiem Text.
- Der `__redacted`-Platzhalter in der wiederaufgenommenen Chat-Aufzeichnung beeinträchtigt die Wiederaufnahmefähigkeit in der Praxis nicht. Ein erfolgreicher `structured_output`-Aufruf beendet die Sitzung sofort, daher sind die einzigen geschwärzten Argumente, die ein wiederaufgenommener Durchlauf sehen könnte, von fehlgeschlagenen Versuchen. Das Modell hat immer noch den Ajv-Validierungsfehler jedes Versuchs im aufgezeichneten `tool_result` und das Live-Parameterschema (neu registriert von `--json-schema`), was für einen Wiederholungsversuch ausreicht.

## Berechtigungssteuerung

`structured_output` umgeht absichtlich die `--core-tools`-Whitelist: Das Tool existiert nur, wenn `--json-schema` gesetzt ist, daher würde sein Ausschluss den Durchlauf ohne Tool-Vertrag lassen.

Explizite `permissions.deny`-Regeln und `--exclude-tools`-Einstellungen WERDEN wirksam – beide verwenden denselben Verweigerungsmechanismus und verhindern beide, dass `structured_output` registriert wird, sodass das Modell die Tool-Deklaration nie sieht. Das typische Ergebnis ist, dass das Modell in Klartext antwortet (Exit 1). Wenn das Modell durch andere Tools schleift, ohne jemals Text zu produzieren, wird es irgendwann `maxSessionTurns` erreichen (Exit 53), und der `--json-schema`-Hinweis in der Fehlermeldung sagt Ihnen, wo Sie suchen müssen.

> **`--bare`-Einschränkung.** Der Bare-Modus ignoriert die meisten von Einstellungen abgeleiteten Eingaben, einschließlich `permissions.deny` auf Einstellungsebene und `tools.exclude`. Das synthetische Tool bleibt registriert, daher wird eine reine Einstellungsverweigerung von `structured_output` unter `--bare` stillschweigend nichts bewirken. `--exclude-tools structured_output` auf Argumentebene gilt weiterhin im Bare-Modus – verwenden Sie das Flag anstelle von Einstellungen, wenn Sie einen Bare-Durchlauf einschränken müssen.

## Konflikt mit MCP-Tools

Wenn ein MCP-Server ein Tool registriert, das buchstäblich `structured_output` heißt, benennt die Tool-Registrierungskollisionsprüfung das MCP-Tool in `mcp__<server-name>__structured_output` um, sodass das synthetische Tool den nackten Namen behält. Das vom Benutzer bereitgestellte Schema ist immer das, was das Modell sieht.

## Beispiel: Steuern eines mehrschrittigen Durchlaufs basierend auf der strukturierten Ausgabe

```bash
RESULT=$(qwen --prompt "Audit this diff and rate its risk." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "High-risk diff; pausing pipeline." >&2
  exit 2
fi
```

## Siehe auch

- [Kopfloser Modus](headless.md) – der `-p`-basierte Ablauf, auf dem `--json-schema` aufbaut.
- [Duale Ausgabe](dual-output.md) – zeichnet einen JSON-Ereignis-Beleg neben der TUI auf (ein anderer Ansatz für maschinenlesbare Ausgabe; erfordert kein `--json-schema`).