# Strukturierte Ausgabe (`--json-schema`) — Design

Dieses Dokument hält die Implementierungsentscheidungen hinter dem Headless-Feature `--json-schema` fest. Die benutzerseitige Verwendung befindet sich in [`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Ziel

Bei Headless-Ausführungen (`qwen -p`, per Pipe weitergeleitete Standardeingabe oder positionsbezogener Prompt) soll es dem Aufrufer ermöglicht werden, die endgültige Antwort des Modells auf ein vom Benutzer bereitgestelltes JSON-Schema zu beschränken und die validierte Nutzlast als maschinenlesbare Ausgabe bereitzustellen, die von Skripten und nachgelagerten Tools direkt verarbeitet werden kann. Die gelegentliche Prosa des Modells während der Planung ist erlaubt, aber die Ausführung muss mit einer Nutzlast enden, die dem Schema entspricht, nicht mit Freitext.

## Ansatz: Synthetisches Tool, dessen Parameterschema das Benutzerschema ist

Wenn `--json-schema` gesetzt ist, registriert `Config.createToolRegistry` ein synthetisches Tool `structured_output` ([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)). Sein `parametersJsonSchema` ist genau das vom Benutzer übergebene Schema; seine `execute()`-Methode gibt eine Stopp-Nachricht `llmContent` zurück. Die Tool-Call-Infrastruktur validiert bereits Argumente gegen `parametersJsonSchema` clientseitig (über Ajv in `BaseDeclarativeTool.build()`), sodass sich „das Modell hat eine antwortkonforme Antwort zurückgegeben“ auf „das Modell hat erfolgreich `structured_output` aufgerufen“ reduziert.

Daraus ergeben sich drei Eigenschaften von selbst:

1. **Kein eigener Validierungspfad.** Die auf Ajv basierende `validateToolParams` läuft bereits innerhalb von `BaseDeclarativeTool.build()` und lehnt nicht konforme Argumente ab, bevor `execute()` überhaupt ausgelöst wird.
2. **Standard-Wiederholungsverhalten.** Ein Validierungsfehler wird dem Modell als Tool-Call-Fehler angezeigt, genauso wie bei Argumentfehlern jedes anderen Tools. Das Modell sieht die Ajv-Nachricht und kann sich im nächsten Durchlauf korrigieren.
3. **Anbieterunabhängig.** Gemini, OpenAI und Anthropic serialisieren Tool-Parameter-Schemata auf die gleiche Weise (über die `DeclarativeTool`-Abstraktion); das synthetische Tool fügt sich in alle drei ein.

Das Tool wird mit `alwaysLoad: true` registriert, sodass die On-Demand-Lade-Infrastruktur von ToolSearch (eingeführt in #3589 – hält die verfügbare Tool-Oberfläche klein, indem selten genutzte Tools hinter einem Suchaufruf zurückgestellt werden und ihre vollständigen Schemas nur dann bereitgestellt werden, wenn das Modell danach fragt) es niemals vor dem Modell verbirgt. Ohne dieses Flag wüsste das Modell nicht, dass der terminale Vertrag existiert.

## Validierungspipeline zur Parse-Zeit

`resolveJsonSchemaArg(raw)` in [`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) führt vier Prüfungen durch, bevor das Schema `Config.createToolRegistry` erreicht:

1. **Quellauflösung.** Akzeptiert entweder ein Inline-JSON-Literal oder `@path/to/file`. Die `@path`-Form führt zuerst ein `stat` auf den aufgelösten Pfad aus, lehnt nicht-reguläre Dateien (FIFOs, Zeichengeräte, Verzeichnisse) ab, begrenzt die Größe auf 4 MiB und gibt bei JSON-Parse-Fehlern eine generische Fehlermeldung aus (kein Dateiinhalts-Präfix in stderr).
2. **JSON-Form.** Das geparste Ergebnis muss ein Nicht-Array-Objekt sein – Primitive, Booleans und Arrays werden mit einer klaren Nachricht abgelehnt.
3. **Root akzeptiert Objekte** — [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts). Funktionsaufruf-APIs übergeben immer Objekte als Tool-Argumente; ein Root-Schema wie `{type: "array"}` würde ein unbrauchbares Tool registrieren. Der Durchlauf behandelt `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, `if` / `then` / `else` und Root `$ref`.
4. **Strenges Ajv-Kompilieren** — [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts). Eine dedizierte Ajv-Instanz mit `strictSchema: true` deckt Tippfehler wie `propertees` auf, die der nachsichtige Laufzeit-Validator stillschweigend schlucken würde.

### Grenzen von `schemaRootAcceptsObject`

Der Durchlauf ist bewusst so gut wie möglich. Er fängt die eindeutigen Fälle „dies kann niemals ein Objekt akzeptieren“ ab und verschiebt alles, was eine Analyse der gesamten Schemaerfüllbarkeit erfordert, zur Laufzeit an Ajv.

**Zur Parse-Zeit entschieden:**

| Muster                                                         | Ergebnis                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `type` vorhanden, enthält nicht `"object"`                     | ablehnen                                                                                     |
| `type: ["object", "null"]` usw.                                | akzeptieren                                                                                  |
| `const`: Nicht-Objekt-Wert                                     | ablehnen                                                                                     |
| `enum`: keine Objekt-Mitglieder (einschließlich leer)          | ablehnen                                                                                     |
| `anyOf`/`oneOf`: leeres Array                                  | ablehnen                                                                                     |
| `anyOf`/`oneOf`: kein Zweig akzeptiert Objekt                  | ablehnen                                                                                     |
| `allOf`: ein Zweig ist `false` oder lehnt Objekt ab            | ablehnen                                                                                     |
| Root `$ref` (mit oder ohne Geschwister-`type`)                 | ablehnen                                                                                     |
| `not`: nacktes `{type: "object"}` (keine einschränkenden Schlüsselwörter) | ablehnen                                                                                     |
| `not`: `{type: "object", required: […], …}` usw.               | akzeptieren (einschränkende Schlüsselwörter lassen einige Objekte erfüllbar; verschieben)   |
| `if: true` + `then` lehnt Objekt ab                            | ablehnen                                                                                     |
| `if: false` + `else` lehnt Objekt ab                           | ablehnen                                                                                     |
**Zur Laufzeit an Ajv delegiert:**

- `$ref` innerhalb von `anyOf` / `oneOf` / `allOf`-Ästen (undurchsichtig – eine lokale
  `$ref`-Auflösung würde Zyklenerkennung, JSON-Pointer-Escape-Sequenzen
  und die Behandlung von `$defs` vs. `definitions` erfordern; der Aufwand
  übersteigt den Nutzen für eine parsezeitliche Best-Effort-Prüfung).
- `if`, dessen Wert ein Objekt-Schema ist (nur gegen einen
  Kandidatenwert entscheidbar).
- Negierte `anyOf` / `oneOf` / `const`-Muster, die komplexer sind als
  `not.type`.
- Beliebige `pattern`-ReDoS-Exposition (vom Benutzer bereitgestellt; das Bedrohungsmodell
  ist eng, da das Flag ein CLI-Argument und keine Netzwerkeingabe ist).

Der `maxSessionTurns`-Ausgangspfad hängt einen `--json-schema`-spezifischen
Hinweis an, der auf das häufige Problem des „Steckenbleibens" hinweist (Modell hat `structured_output`
nie aufgerufen) und dessen zwei wahrscheinliche Ursachen (Tool durch Berechtigungen verweigert / Schema nicht erfüllbar), sodass der Laufzeit-Durchfall
für den Benutzer sichtbare Diagnoseinformationen liefert.

## Laufzeit: Turn-Dispatch

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
behandelt den Laufzeit-Dispatch. Die Strukturierte-Ausgabe-Spezifika:

### Vorab-Scan + Geschwister-Unterdrückung

Wenn das Modell `structured_output` zusammen mit anderen Tools im selben
Assistenten-Turn ausgibt, ist der synthetische Aufruf der finale Vertrag. Der
Vorab-Scan in `processToolCallBatch` filtert `requestsToExecute` so, dass
**nur** `structured_output`-Aufrufe übrig bleiben, sodass nebenwirkungsbehaftete Geschwister
(`write_file`, `run_shell_command`, `edit`, …) nie ausgeführt werden.

Beispiel-Batches (wenn `--json-schema` aktiv ist):

| Modell gibt aus                                             | Verhalten                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                     | `write_file` wird übersprungen. `structured_output` validiert, Ausführung endet.                                                                                                                                                                                                                                                                                              |
| `[structured_output(schlechte-args), structured_output(gut)]` | Erster schlägt bei Ajv-Validierung fehl; zweiter hat Erfolg. Ausführung endet mit den Argumenten des zweiten Aufrufs.                                                                                                                                                                                                                                                        |
| `[structured_output(schlechte-args), write_file(…)]`          | `structured_output(schlecht)` schlägt fehl. `write_file` wird ebenfalls übersprungen (es wurde bereits vorher unterdrückt). Das Modell sieht beides: Ajvs Fehlermeldung für den strukturierten Aufruf und ein synthetisiertes `"Übersprungen: …"` tool_result für den Nebenwirkungsaufruf. Im nächsten Turn kann das Modell beide erneut ausgeben oder nur den strukturierten Aufruf korrigieren. |
| `[anderes_tool_a, anderes_tool_b]` (kein `structured_output`) | Vorab-Scan ist inaktiv. Beide Tools laufen normal; die Ausführung wird NICHT beendet.                                                                                                                                                                                                                                                                                          |

Der synthetisierte „Übersprungen:“-Text hat zwei Varianten:

- **Erfolgspfad** (ein strukturierter Aufruf hat den Vertrag in diesem Turn übernommen):
  `"Übersprungen: der structured_output-Vertrag dieses Turns hatte Vorrang als
die terminale Ausgabe."` – kurz, da die Sitzung sofort endet und kein Konsument (Modell oder SDK) darauf reagiert.
- **Wiederholungspfad** (kein strukturierter Aufruf übernommen, das Modell bekommt einen weiteren
  Turn): fügt `"Geben Sie diesen Aufruf bei Bedarf in einem separaten Turn erneut aus."` hinzu – das ist der einzige für das Modell handhabbare Fall.

### Haupt-Turn / Drain-Turn Gleichheit

`processToolCallBatch(batchRequests, setModelOverride)` wird
innerhalb von `runNonInteractive` definiert und von beiden Seiten aufgerufen:

- Der Haupt-Turn-Schleife (am Anfang der Funktion).
- `drainOneItem` (Cron-Prompt / Hintergrundaufgaben-Benachrichtigungsantwort-Schleife).

Der Drain-Turn ist wichtig, da `structured_output` für die gesamte Sitzung registriert ist,
sodass ein Cron-Job oder eine Benachrichtigungsantwort das Tool MÖGLICHERWEISE ebenfalls
auslösen. Der Helfer behandelt beide Aufrufstellen zum Zeitpunkt des Aufrufs identisch;
die einzige aufrufstellenspezifische Bindung ist, welche
`modelOverride`-Variable beschrieben werden soll – als Setter übergeben.

Der **Abbruchablauf nach dem Helfer** unterscheidet sich zwischen den beiden Stellen:
der Haupt-Turn-Pfad ruft direkt `return emitStructuredSuccess()` auf,
während der Drain-Turn-Pfad einen zweistufigen Abbruch erfordert
(`processToolCallBatch` erfasst das Ergebnis in der closureskopierten
`structuredSubmission`; `drainLocalQueue` prüft dies, um die Drain-Schleife zu stoppen,
dann prüft die Halte-Schleife dies, um auszubrechen und
`emitStructuredSuccess` aufzurufen). Beide laufen auf denselben terminalen Block hinaus,
aber die zusätzliche Indirektion im Drain-Pfad ist tragend –
ohne sie würde die Drain-Schleife nach der Erfassung des strukturierten Ergebnisses
weiterhin in die Warteschlange gestellte Elemente verarbeiten.
### Strukturierter Erfolgs-Terminalblock

`emitStructuredSuccess()` (ebenfalls definiert innerhalb von `runNonInteractive`) ist der gemeinsame Pfad für „gültigen Aufruf erhalten, System herunterfahren“:

1. `registry.abortAll()` bricht laufende Hintergrund-Agents ab – der Vertrag für strukturierte Ausgaben ist nur einmalig und soll keine `task_notification`-Rennen in die Terminalausgabe verursachen.
2. Begrenzte Verzögerung (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms), damit die natürlichen Cancel-Handler der gerade abgebrochenen Agents die Chance haben, ihre terminale `task_notification` zu senden und in `localQueue` zu landen. Die Schleifenbedingung ist `Date.now() < deadline && registry.hasUnfinalizedTasks()`, sodass die Wartezeit sofort endet, wenn nichts mehr läuft (typischer Pfad) und niemals länger als das Limit blockiert. Die 500-ms-Obergrenze ist eine Best-Effort-Maßnahme – verwaiste `task_started`-Ereignisse bleiben unter Last möglich, wenn der Abbruch-Handler eines bestimmten Agents das Budget überschreitet. Die Schleife **pollt** das Abbruchsignal **nicht**: Ein während der Verzögerung oder während des folgenden Ausgabepfads empfangenes SIGINT wird das bereits erfasste Ergebnis nicht vorzeitig beenden. Ohne die Verzögerung würden Stream-JSON-Consumer regelmäßig `task_started`-Ereignisse ohne zugehörige `task_notification` sehen.
3. `flushQueuedNotificationsToSdk(localQueue)` entleert alle noch in der Warteschlange befindlichen Benachrichtigungen.
4. `finalizeOneShotMonitors()` (idempotent – sicheres zweimaliges Aufrufen; der Drain-Turn-Pfad hat es bereits aufgerufen).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Fehlerpfade

| Ursache                                                          | Exit-Code | Ausgabe                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modell gibt nur reinen Text aus                                  | 1         | Fehler mit Turn-Anzahl + abgeschnittener `Output-Vorschau`.                                                                                                                                                                                                                        |
| Modell ruft `structured_output` für `maxSessionTurns` Turns nicht auf | 53        | `Maximale Anzahl an Session-Turns erreicht` + `--json-schema`-Hinweis, der auf das häufige Problem des hängenden Laufs und seine zwei wahrscheinlichen Ursachen verweist.                                                                                                             |
| Validierung schlägt wiederholt fehl                               | (irgendwann 53 via max-turns) | Jeder Fehler wird dem Modell im nächsten Turn mit der Ajv-Nachricht mitgeteilt.                                                                                                                                                                                                          |
| Abbruch / SIGINT                                                  | 130       | Abbruchpfad. Normalerweise wird kein strukturiertes Ergebnis ausgegeben, aber die Holdback-Schleife von `emitStructuredSuccess()` pollt das Abbruchsignal nicht – ein SIGINT, das nach der Erfassung, aber vor/während der stdout-Ausgabe eintrifft, kann das Ergebnis dennoch ausgeben. Der Exit-Code ist das zuverlässige Signal. |

## Ausgabe-Envelope

Die Adapter-Pipeline in
[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
behandelt das Vorhandensein von `structuredResult` (erfasst via `'structuredResult' in options`,
nicht `!== undefined`, sodass der Vertrag auch dann gewahrt bleibt, wenn das Modell
`structured_output` ohne Argumente unter einem leeren Schema aufgerufen hat):

- `result` wird zu `JSON.stringify(payload)` gezwungen – überschreibt damit jede
  vom Adapter angesammelte Freitext-Zusammenfassung.
- Ein Top-Level-Feld `structured_result` enthält das rohe Objekt für
  Consumer, die die stringifizierte Form nicht erneut parsen möchten.
- `undefined`-Payloads werden zu `null` normalisiert (in beiden Feldern als literal `null` im JSON dargestellt), damit das Feld nicht still verschwinden kann.
  In der Praxis wird dieser Fallback selten erreicht: vorgelagert wendet `turn.ts`
  `(fnCall.args || {})` an, bevor die Übermittlung gespeichert wird, sodass ein
  Aufruf ohne Argumente bei einem leeren Schema als `{}` landet und auf stdout als
  `{}` erscheint, nicht als `null`. Der Schritt `?? null` ist eine Defence-in-Depth-Maßnahme
  für den strikten `undefined`-Fall.

Der TEXT-Modus schreibt nur das Feld `result` plus Zeilenumbruch nach stdout (jegliche
beiläufige Assistant-Prosa, die während des Laufs angesammelt wurde, wird verworfen –
nicht nach stderr gespiegelt). Der JSON-Modus gibt das vollständige Ereignisprotokoll als
JSON-Array aus; `structured_result` befindet sich im finalen Element vom Typ `"result"`
dieses Arrays, nicht auf Dokumentebene. Der Stream-JSON-Modus gibt jede Nachricht
als eigene Zeile im JSONL-Format aus; die abschließende `result`-Zeile trägt `structured_result`.
## Datenschutz: Schwärzung über mehrere Speicherorte hinweg

Die über `structured_output` übergebenen Argumente SIND die strukturierte Nutzlast.
Im Erfolgsfall landen sie bereits auf stdout; bei Wiederholungen aufgrund von Validierungsfehlern
erreichen sie möglicherweise nie stdout. In beiden Fällen ist das Speichern
auf dauerhaften geräteinternen Medien (oder der Export vom Gerät
via Telemetrie) eine Duplizierung, die die Nutzlast in einen langlebigeren
Speicher einbringt, als vom Benutzer gewünscht. Die Schwärzungsregel lautet
daher "niemals Argumente dieses synthetischen Tools persistieren, unabhängig
vom Ergebnis", nicht nur "keine Duplikate von dem, was bereits auf stdout ist."

Zwei Speicherorte müssen schwärzen, und beide verwenden denselben Platzhalter-Konstanten
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts):

- `ToolCallEvent.function_args` (Telemetrie) – deckt OTLP-Exporte,
  QwenLogger, ui-telemetry und den Chat-Aufzeichnungs-UI-Event-Spiegel ab.
- `redactStructuredOutputArgsForRecording` (verwendet von
  `recordAssistantTurn` in `geminiChat.ts`) – deckt die plattenbasierte
  Chat-Aufzeichnungs-JSONL unter
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` ab.
  Auch Wiederholungen aufgrund von Validierungsfehlern landen hier – die Argumente
  jeder Wiederholung erhalten denselben Platzhalter.

Die gemeinsame Konstante verhindert Drift zwischen den beiden Speicherorten. Tool-Call-
Metriken (Dauer, Erfolg, Entscheidung) bleiben erhalten.

Hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) werden bewusst
**nicht** geschwärzt – sie erhalten das rohe `tool_input`,
weil der Hook-Vertrag lautet "sehen, was das Tool sieht". Dies ist
im Benutzerdokumentation-Abschnitt Datenschutz als Hinweis "Hooks sehen rohe Argumente"
dokumentiert, damit Administratoren nach `tool_name` filtern oder eine
hook-seitige Schwärzung hinzufügen können, bevor `--json-schema` gegen sensible
Daten ausgeführt wird.

Die Schwärzung ist bewusst auf **geräteinterne** Persistenz-
Speicherorte beschränkt (Telemetrie-Exporte + Chat-Aufzeichnungs-JSONL).
Das Schema selbst reist weiterhin bei jeder Anfrage zum Modellanbieter
als `parameters`-Block der `structured_output`-Funktionsdeklaration –
eine anbieterseitige Schwärzung ist nicht möglich, da das Modell das Schema
benötigt, um den Tool-Call-Vertrag zu erfüllen. Der Datenschutzabschnitt der
Benutzerdokumentation warnt Benutzer aus demselben Grund davor,
`enum` / `const` / `default` / `examples` / `description`-Nutzlasten
frei von Geheimnissen zu halten.

## Berechtigungssteuerung

`structured_output` ist bewusst von
`PermissionManager.CORE_TOOLS` (die Menge der Tools, die der
`--core-tools`-Erlaubnisliste unterliegen) ausgeschlossen –
ebenso wie die anderen synthetischen Tools (`agent`, `exit_plan_mode`,
`ask_user_question`, `task_stop`, `send_message`). Dynamisch erkannte
Tools (`skill`, MCP) bilden eine separate Ausschlusskategorie, die die
Erlaubnisliste aus anderen Gründen ebenfalls umgeht. Das synthetische Tool
existiert nur, wenn `--json-schema` gesetzt ist; würde man es zur
Erlaubnislisten-Mechanik hinzufügen, würde `--core-tools read_file --json-schema X`
den Endgerät-Vertrag stillschweigend fallen lassen.

Explizite `permissions.deny`-Regeln und `--exclude-tools`-Einstellungen
greifen weiterhin über `PermissionManager.evaluate` → `isToolEnabled`. Beide
verwenden denselben Verweigerungsmechanismus und verhindern beide die Registrierung –
die Tool-Deklaration wird aus dem Register entfernt, sodass das Modell das Tool nie sieht.
Das typische Ergebnis ist, dass das Modell in Klartext antwortet (Exit 1).
Wenn das Modell durch andere Tools schleift, ohne Text zu produzieren, erreicht es
schließlich `maxSessionTurns` (Exit 53) und der `--json-schema`-Hinweis in
`handleMaxTurnsExceededError` teilt dem Benutzer mit, wo er suchen soll.

**`--bare`-Interaktion.** Der Bare-Modus umgeht die Brücke von Einstellungen zur
CLI-Konfiguration: `packages/cli/src/config/config.ts` baut
`mergedDeny` als `[...(bareMode ? [] : settings.permissions.deny), ...]` auf,
sodass Verweigerungen auf Einstellungsebene (und `tools.exclude`) unter
`--bare` fallen gelassen werden. `--exclude-tools` auf Argumentebene wird
bedingungslos an `mergedDeny` angehängt, sodass es weiterhin greift. Das synthetische Tool
wird unabhängig von all dem registriert (gesteuert durch `jsonSchema`, nicht durch
die Verweigerungsliste), sodass eine rein einstellungsbasierte Verweigerung von
`structured_output` unter `--bare` stillschweigend wirkungslos bleibt, während das Tool
weiterhin aufrufbar ist.

## Unter-Agent-Kontexte

`Config.createToolRegistry` akzeptiert eine `forSubAgent: true`-Option, die
die synthetische Registrierung unterdrückt. Subagent-Override nutzen die
übergeordnete Config via Prototypen-Delegation (`createApprovalModeOverride` /
`buildSubagentContextOverride` → `Object.create(base)`), und
`this.jsonSchema` vererbt sich durch die Prototypenkette. Ohne das Flag
würde das synthetische Tool auch im Register des Subagents registriert,
und ein Subagent, der es aufruft, würde den llmContent "Sitzung endet jetzt"
erhalten – aber nur die Haupt- / Drain-Schleifen von `runNonInteractive`
erkennen dies als Endsignal, sodass der Subagent weiterlaufen und Token
für ein Tool verbrauchen würde, dessen Vertrag seine Schleife nicht erfüllen kann.

> **Hinweis für Entwickler.** Diese Unterdrückung hängt am einzigen Aufrufpfad
> durch `createToolRegistry(forSubAgent: true)`. Jeder zukünftige
> Subagent-Erzeugungsmechanismus, der diesen Pfad umgeht, wird das synthetische Tool
> in das Register des Subagents einbringen und den Fehlermodus des ewigen
> Token-Verbrauchs wieder einführen. Der ausfallsichere Komplementärschutz wäre
> eine Laufzeitprüfung innerhalb von `syntheticOutput.execute()`, die bei
> Aufruf aus einem Subagent-Kontext einen `fatalError` (oder No-Op) zurückgibt.
> Implementieren Sie einen, wenn ein zweiter Leckpfad auftritt.
## MCP Shadow-Tool-Guard

`tool-registry.ts:registerTool` prüft die lazy `factories`-Map auf
Namenskollisionen, nicht nur die eager `tools`-Map. Wenn ein MCP-Server
ein Tool namens `structured_output` findet, wird der
Auto-Qualifikationspfad, der für eager-Tool-Kollisionen existiert, auch
für Factory-Kollisionen ausgelöst: Das MCP-Tool wird in
`mcp__<server>__structured_output` umbenannt und die synthetische Factory
behält den Bare-Namen. Ohne diesen Guard könnte ein MCP-Server den
Structured-Output-Vertrag stillschweigend kapern.

## Kompatibilitätsmatrix

| Kombination                                              | Status                 | Begründung                                                                                                                             |
| -------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (oder stdin, oder positional)     | Unterstützt            | Primärer Headless-Pfad.                                                                                                                |
| `--json-schema` + `--output-format text` (Standard)      | Unterstützt            | `JSON.stringify(payload)` + Newline.                                                                                                   |
| `--json-schema` + `--output-format json` / `stream-json` | Unterstützt            | Das Feld `structured_result` enthält das rohe Objekt.                                                                                  |
| `--json-schema` + `--bare`                               | Unterstützt            | `--bare` schränkt das Registry auf `read_file`, `edit`, `run_shell_command` ein; das synthetische Tool wird zusammen mit dieser Minimalmenge registriert. |
| `--json-schema` + `-i`                                   | Zum Parse-Zeitpunkt abgelehnt | Die TUI hat keinen Terminal-Vertrag für das synthetische Tool.                                                                         |
| `--json-schema` + `--input-format stream-json`           | Zum Parse-Zeitpunkt abgelehnt | Single-Shot-Vertrag vs. langlebiges Protokoll.                                                                                         |
| `--json-schema` + `--acp` / `--experimental-acp`         | Zum Parse-Zeitpunkt abgelehnt | ACP-Schleife ist unabhängig.                                                                                                           |
| `--json-schema` + `--prompt-interactive`                 | Zum Parse-Zeitpunkt abgelehnt | Gleich wie `-i`.                                                                                                                       |
| `--json-schema` + kein Prompt + keine gepipte stdin      | Zum Parse-Zeitpunkt abgelehnt | Headless erfordert einen Prompt.                                                                                                       |

## Alternativüberlegungen

**Schema-bewusste Antwortaufforderung (kein synthetisches Tool).** Das
Modell über den System-Prompt bitten, „mit JSON, das diesem Schema
entspricht“ zu antworten, und die letzte Assistentennachricht parsen.
Abgelehnt, weil das Modell keine syntaktische Garantie hat – die Ausgabe
könnte in Codeblöcken stehen, von Geplapper umgeben sein oder Felder
halluzinieren. Die Tool-Call-Validierung wird von der Function-Calling-
Ebene vor `execute()` erzwungen, was eine harte syntaktische +
semantische Absicherung bietet.

**OpenAIs `response_format: {type: "json_schema", …}`.** Anbieter-
spezifisch; würde parallele Implementierungen für Gemini und
Anthropic erfordern. Der synthetische Tool-Ansatz ist anbieterunabhängig.

**Structured_output an den Anfang des Batches verschieben, anstatt zu
filtern.** Lässt nebenwirkungsbehaftete Geschwister laufen, wenn der
strukturierte Aufruf die Validierung nicht besteht. Abgelehnt, weil der
Vertrag für `--json-schema` „strukturierte Ausgabe produzieren“ ist –
wenn das Modell in diesem Modus ist, sind Geschwister-Nebenwirkungen
wahrscheinlich ein Fehler. Sie vollständig zu unterdrücken ist sicherer;
das Modell sieht ein „Übersprungen:“-Tool-Ergebnis und kann sie in einem
separaten Durchlauf erneut ausgeben.

**Lokale `$ref`-Auflösung in `schemaRootAcceptsObject`.** Würde Schemas
wie `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` zum Parse-Zeitpunkt
erkennen. Vorerst abgelehnt, weil der Aufwand (Zyklenerkennung, JSON-
Pointer-Syntax, `$defs` vs. `definitions`, partielle Pointer, entfernte
Referenzen) den Nutzen überwiegt; der `maxSessionTurns`-Hinweis weist
Benutzer bereits auf „Schema ist nicht erfüllbar“ als wahrscheinliche
Ursache hin.

## Offene Arbeiten

- Die Schema-bewusste Antwortvalidierung könnte einen `pattern`-basierten
  ReDoS-Schutz erhalten, wenn echte Benutzer auf katastrophale
  Backtracking-Muster in `--json-schema`-Argumenten stoßen.
- SDK-Protokollerweiterungen (Python-/TypeScript-/Java-SDKs, die ein
  typisiertes `structured_result`-Feld exponieren) – separat verfolgen;
  [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (am
  2026-05-11 geschlossen, ungemergt) deckte diesen Umfang ab, bevor die
  CLI/Core-Arbeit einging und wurde abgelöst.
## Dateiindex

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`, `schemaRootAcceptsObject`, yargs `.check` Mutex-Regeln.
- `packages/cli/src/gemini.tsx` — TUI-Guard, Exit-Code-Infrastruktur.
- `packages/cli/src/nonInteractiveCli.ts` —
  `processToolCallBatch`, `emitStructuredSuccess`,
  `suppressedOutputBody`, Plain-Text-Fehlerpfad.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` —
  `structuredResult` → `result` + `structured_result`-Envelope.
- `packages/core/src/config/config.ts` — Registrierung mit
  `registerStructuredOutputIfRequested`, `forSubAgent` überspringen.
- `packages/core/src/tools/syntheticOutput.ts` — synthetisches Tool +
  Platzhalter `STRUCTURED_OUTPUT_REDACTED_ARGS`.
- `packages/core/src/tools/tool-registry.ts` — Factory-Collision-Umbenennung
  für MCP-Schatten-Tools.
- `packages/core/src/telemetry/types.ts` — Schwärzung von `function_args`.
- `packages/core/src/core/geminiChat.ts` —
  `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict`
  mit strenger Ajv-Instanz.
- `packages/cli/src/utils/errors.ts` —
  Hinweis `--json-schema` von `handleMaxTurnsExceededError`.
