# Strukturierte Ausgabe (`--json-schema`) — Design

Dieses Dokument beschreibt die Implementierungsentscheidungen hinter der `--json-schema`-Headless-Funktion. Die benutzerseitige Verwendung befindet sich in [`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Ziel

Bei Headless-Aufrufen (`qwen -p`, über Pipe weitergeleitete Standardeingabe oder positionsbasiertes Prompt) kann der Aufrufer die endgültige Antwort des Modells auf ein benutzerdefiniertes JSON-Schema einschränken und die validierte Nutzlast als maschinenlesbare Ausgabe bereitstellen, die Skripte und nachgelagerte Tools direkt verwenden können. Die beiläufige Prosa des Modells während der Planung ist erlaubt, aber der Durchlauf muss mit einer Nutzlast enden, die dem Schema entspricht, nicht mit Freitext.

## Ansatz: synthetisches Tool, dessen Parameterschema mit dem Benutzerschema identisch ist

Wenn `--json-schema` gesetzt ist, registriert `Config.createToolRegistry` ein synthetisches `structured_output`-Tool ([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)). Dessen `parametersJsonSchema` ist genau das Schema, das der Benutzer übergeben hat; seine `execute()`-Methode gibt eine Stopp-Nachricht `llmContent` zurück. Die Tool-Call-Infrastruktur validiert Argumente bereits clientseitig gegen `parametersJsonSchema` (über Ajv in `BaseDeclarativeTool.build()`), sodass "das Modell hat eine Antwort zurückgegeben, die dem Schema entspricht" darauf reduziert wird "das Modell hat erfolgreich `structured_output` aufgerufen".

Daraus ergeben sich drei Eigenschaften von selbst:

1. **Kein eigenständiger Validierungspfad.** Das auf Ajv basierende `validateToolParams` läuft bereits innerhalb von `BaseDeclarativeTool.build()` und lehnt nicht konforme Argumente ab, bevor `execute()` überhaupt ausgeführt wird.
2. **Standardmäßiges Wiederholungsverhalten.** Ein Validierungsfehler wird dem Modell als Tool-Call-Fehler angezeigt, genauso wie Fehler bei Argumenten anderer Tools. Das Modell sieht die Ajv-Nachricht und kann sich im nächsten Durchlauf korrigieren.
3. **Anbieterunabhängig.** Gemini, OpenAI und Anthropic serialisieren Tool-Parameter-Schemata alle auf die gleiche Weise (über die `DeclarativeTool`-Abstraktion); das synthetische Tool passt in alle drei.

Das Tool wird mit `alwaysLoad: true` registriert, damit die ToolSearch-On-Demand-Ladeinfrastruktur (eingeführt in #3589 – hält die exponierte Toolfläche klein, indem selten genutzte Tools hinter einen Suchbefehl verschoben werden und ihre vollständigen Schemas nur dann bereitgestellt werden, wenn das Modell danach fragt) es niemals vor dem Modell versteckt. Ohne dieses Flag wüsste das Modell nicht, dass der terminale Vertrag existiert.

## Validierungspipeline zur Analysezeit

`resolveJsonSchemaArg(raw)` in [`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) führt vier Prüfungen durch, bevor das Schema `Config.createToolRegistry` erreicht:

1. **Quellenauflösung.** Akzeptiert entweder ein Inline-JSON-Literal oder `@path/to/file`. Die `@path`-Form führt zuerst ein `stat` auf den aufgelösten Pfad aus, lehnt nicht reguläre Dateien ab (FIFOs, Zeichengeräte, Verzeichnisse), begrenzt die Größe auf 4 MiB und gibt bei einem JSON-Parse-Fehler eine generische Fehlermeldung aus (kein Dateiinhalt-Präfix in stderr).
2. **JSON-Form.** Das geparste Ergebnis muss ein Nicht-Array-Objekt sein – Primitive, Booleans und Arrays werden mit einer klaren Nachricht abgelehnt.
3. **Wurzel akzeptiert Objekte** – [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts). Funktionsaufruf-APIs übergeben immer Objekte als Tool-Argumente; ein Wurzelschema wie `{type: "array"}` würde ein unbrauchbares Tool registrieren. Die Prüfung behandelt `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, `if`/`then`/`else` und `$ref` auf Wurzelebene.
4. **Strenges Ajv-Kompilieren** – [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts). Eine dedizierte Ajv-Instanz mit `strictSchema: true` deckt Tippfehler wie `propertees` auf, die der nachsichtige Laufzeitvalidator stillschweigend ignorieren würde.

### Grenzen von `schemaRootAcceptsObject`

Die Prüfung ist bewusst als Best-Effort-Ansatz konzipiert. Sie erfasst die eindeutigen Fälle, in denen niemals ein Objekt akzeptiert werden kann, und verschiebt alles, was eine Analyse der gesamten Schema-Erfüllbarkeit erfordert, zur Laufzeit an Ajv.

**Entscheidung zur Analysezeit:**

| Muster                                                      | Ergebnis                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `type` vorhanden, enthält kein `"object"`                   | ablehnen                                                       |
| `type: ["object", "null"]` usw.                             | akzeptieren                                                    |
| `const`: Nicht-Objekt-Wert                                  | ablehnen                                                       |
| `enum`: keine Objekt-Member (inkl. leer)                    | ablehnen                                                       |
| `anyOf`/`oneOf`: leeres Array                               | ablehnen                                                       |
| `anyOf`/`oneOf`: kein Zweig erlaubt Objekt                  | ablehnen                                                       |
| `allOf`: ein Zweig ist `false` oder lehnt Objekt ab        | ablehnen                                                       |
| Wurzel-`$ref` (mit oder ohne Geschwister-`type`)            | ablehnen                                                       |
| `not`: nackt `{type: "object"}` (keine verengenden Schlüsselwörter) | ablehnen                                                       |
| `not`: `{type: "object", required: […], …}` usw.           | akzeptieren (verengende Schlüsselwörter lassen einige Objekte erfüllbar; verschieben) |
| `if: true` + `then` lehnt Objekt ab                         | ablehnen                                                       |
| `if: false` + `else` lehnt Objekt ab                        | ablehnen                                                       |

**Zur Laufzeit an Ajv verschoben:**

- `$ref` innerhalb von `anyOf`/`oneOf`/`allOf`-Zweigen (undurchsichtig – die lokale `$ref`-Auflösung würde Zyklen-Erkennung, JSON-Pointer-Escapes und die Unterscheidung von `$defs` und `definitions` erfordern; der Aufwand überwiegt den Nutzen für eine Best-Effort-Prüfung zur Analysezeit).
- `if`, dessen Wert ein Objektschema ist (nur gegen einen Kandidatenwert entscheidbar).
- Negierte `anyOf`/`oneOf`/`const`-Muster, die komplexer sind als `not.type`.
- Beliebige `pattern`-ReDoS-Exposition (benutzergeliefert; das Bedrohungsmodell ist eng, da das Flag ein CLI-Argument und keine Netzwerkeingabe ist).

Der Ausstiegspfad `maxSessionTurns` hängt einen `--json-schema`-spezifischen Hinweis an, der Benutzer auf das häufige Symptom eines feststeckenden Durchlaufs (Modell hat niemals `structured_output` aufgerufen) und seine zwei wahrscheinlichen Ursachen hinweist (Tool durch Berechtigungen verweigert / Schema nicht erfüllbar), sodass der Laufzeit-Durchfall benutzersichtbare Diagnosen hat.

## Laufzeit: Durchlaufdisposition

`packages/cli/src/nonInteractiveCli.ts` behandelt die Laufzeitdisposition. Die Details zur strukturierten Ausgabe:

### Vor-Scan + Geschwisterunterdrückung

Wenn das Modell `structured_output` zusammen mit anderen Tools im selben Assistenten-Durchlauf ausgibt, ist der synthetische Aufruf der finale Vertrag. Der Vor-Scan in `processToolCallBatch` filtert `requestsToExecute` auf **nur** `structured_output`-Aufrufe, sodass nebenwirkende Geschwister (`write_file`, `run_shell_command`, `edit`, …) niemals ausgeführt werden.

Beispiel-Batches (wenn `--json-schema` aktiv ist):

| Vom Modell ausgegeben                                       | Verhalten                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                     | `write_file` wird übersprungen. `structured_output` validiert, Durchlauf endet.                                                                                                                                                                                                                                  |
| `[structured_output(bad-args), structured_output(good)]`    | Erste schlägt bei Ajv-Validierung fehl; zweite erfolgreich. Durchlauf endet mit den Argumenten des zweiten Aufrufs.                                                                                                                                                                                              |
| `[structured_output(bad-args), write_file(…)]`              | `structured_output(bad)` schlägt fehl. `write_file` wird ebenfalls übersprungen (es wurde vorab unterdrückt). Das Modell sieht beides: Ajvs Fehlermeldung für den strukturierten Aufruf und ein synthetisiertes `"Skipped: …"`-tool_result für den Nebenwirkungsaufruf. Im nächsten Durchlauf kann das Modell beide erneut ausgeben oder nur den strukturierten Aufruf korrigieren. |
| `[other_tool_a, other_tool_b]` (kein `structured_output`)  | Vor-Scan ist inaktiv. Beide Tools laufen normal; der Durchlauf wird NICHT beendet.                                                                                                                                                                                                                               |

Der synthetisierte "Skipped:"-Body hat zwei Varianten:

- **Erfolgspfad** (ein strukturierter Aufruf hat den Vertrag in diesem Durchlauf erfasst): `"Skipped: this turn's structured_output contract took precedence as the terminal output."` – kurz, da die Sitzung sofort beendet wird und kein Konsument (Modell oder SDK) darauf reagiert.
- **Wiederholungspfad** (kein strukturierter Aufruf erfasst, das Modell bekommt einen weiteren Durchlauf): fügt `"Re-issue this call in a separate turn if needed."` hinzu – dies ist der einzige vom Modell beeinflussbare Fall.

### Hauptdurchlauf / Drain-Durchlauf-Parität

`processToolCallBatch(batchRequests, setModelOverride)` ist innerhalb von `runNonInteractive` definiert und wird von beiden aufgerufen:

- Der Hauptdurchlauf-Schleife (am Anfang der Funktion).
- `drainOneItem` (Cron-Prompt / Hintergrundaufgaben-Benachrichtigungs-Antwortschleife).

Der Drain-Durchlauf ist wichtig, da `structured_output` für die gesamte Sitzung registriert ist, sodass ein Cron-Job oder eine Benachrichtigungsantwort das Tool MÖGLICHERWEISE ebenfalls auslösen. Der Helfer behandelt beide Aufrufstellen zum Zeitpunkt des Aufrufs identisch; die einzige aufrufstellenspezifische Bindung ist, in welche `modelOverride`-Variable geschrieben wird – übergeben als Setter.

Der **Ablauf nach dem Helfer** unterscheidet sich zwischen den beiden Stellen: Der Hauptdurchlauf-Pfad ruft direkt `return emitStructuredSuccess()` auf, während der Drain-Durchlauf-Pfad eine Zwei-Sprung-Terminierung erfordert (`processToolCallBatch` erfasst das Ergebnis in der closureskopierten `structuredSubmission`; `drainLocalQueue` prüft es, um die Drain-Schleife zu stoppen, dann prüft die Holdback-Schleife es, um auszubrechen und `emitStructuredSuccess` aufzurufen). Beide konvergieren auf denselben terminalen Block, aber die zusätzliche Indirektion im Drain-Pfad ist tragend – ohne sie würde die Drain-Schleife nach der Erfassung des strukturierten Ergebnisses weiterhin in der Warteschlange befindliche Elemente verarbeiten.

### Terminalblock für strukturierten Erfolg

`emitStructuredSuccess()` (ebenfalls innerhalb von `runNonInteractive` definiert) ist der gemeinsame Pfad "wir haben einen gültigen Aufruf erhalten, herunterfahren":

1. `registry.abortAll()` bricht laufende Hintergrundagenten ab – der Vertrag zur strukturierten Ausgabe ist einmalig und sollte nicht mit `task_notification`s in den terminalen Sendevorgang konkurrieren.
2. Begrenztes Holdback (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms), damit die natürlichen Abbruchhandler der gerade abgebrochenen Agenten die Möglichkeit haben, ihre terminale `task_notification` zu senden und in `localQueue` zu platzieren. Die Schleifenbedingung ist `Date.now() < deadline && registry.hasUnfinalizedTasks()`, sodass die Wartezeit sofort endet, wenn nichts in Bearbeitung ist (typischer Pfad) und niemals länger als die Obergrenze blockiert. Die 500-ms-Grenze ist eine Best-Effort-Lösung – verwaiste `task_started`-Ereignisse bleiben unter Last möglich, wenn der Abbruchhandler eines bestimmten Agenten das Budget überschreitet. Die Schleife ruft **nicht** das Abbruchsignal ab: Ein während des Holdbacks oder während des nachfolgenden Sendepfads empfangenes SIGINT wird das bereits erfasste Ergebnis nicht kurzschließen. Ohne das Holdback würden Stream-JSON-Konsumenten routinemäßig `task_started`-Ereignisse ohne passende `task_notification` sehen.
3. `flushQueuedNotificationsToSdk(localQueue)` leert alles, was noch in der Warteschlange ist.
4. `finalizeOneShotMonitors()` (idempotent – kann zweimal aufgerufen werden; der Drain-Durchlauf-Pfad hat es bereits aufgerufen).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Fehlerpfade

| Ursache                                                           | Exit-Code                     | Oberfläche                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modell gibt nur Klartext aus                                      | 1                             | Fehler mit Durchlaufanzahl + abgeschnittene `Output preview`.                                                                                                                                                                                                                       |
| Modell ruft `structured_output` nie für `maxSessionTurns` auf     | 53                            | `Reached max session turns` + `--json-schema`-Hinweis auf das häufige Symptom eines feststeckenden Durchlaufs und seine zwei wahrscheinlichen Ursachen.                                                                                                                              |
| Validierung schlägt wiederholt fehl                                | (letztendlich 53 via max-turns) | Jeder Fehler wird dem Modell im nächsten Durchlauf mit der Ajv-Nachricht angezeigt.                                                                                                                                                                                                 |
| Abbruch / SIGINT                                                  | 130                           | Abbruchpfad. Normalerweise wird kein strukturiertes Ergebnis gesendet, aber die Holdback-Schleife von `emitStructuredSuccess()` ruft das Abbruchsignal nicht ab – ein SIGINT, das nach der Erfassung, aber vor/während des stdout-Sendens eintrifft, kann das Ergebnis dennoch ausgeben. Der Exit-Code ist das zuverlässige Signal. |

## Ausgabeformat

Die Adapter-Pipeline in [`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts) behandelt das Vorhandensein von `structuredResult` (erkannt über `'structuredResult' in options`, nicht `!== undefined`, sodass der Vertrag erhalten bleibt, selbst wenn das Modell `structured_output` ohne Argumente unter einem leeren Schema aufgerufen hat):

- `result` wird auf `JSON.stringify(payload)` erzwungen – überschreibt jede Freitext-Zusammenfassung, die der Adapter angesammelt hat.
- Ein Feld `structured_result` auf oberster Ebene enthält das Rohobjekt für Konsumenten, die die stringifizierte Form nicht erneut parsen möchten.
- `undefined`-Nutzlasten werden auf `null` normalisiert (als literal JSON `null` in beiden Feldern dargestellt), sodass das Feld nicht stillschweigend verschwinden kann. In der Praxis wird dieser Fallback selten erreicht: Upstream wendet `turn.ts` `(fnCall.args || {})` an, bevor es die Übermittlung speichert, sodass ein Null-Argument-Aufruf gegen ein leeres Schema als `{}` landet und auf stdout als `{}` angezeigt wird, nicht als `null`. Der Schritt `?? null` dient als Verteidigung in der Tiefe für den strengen `undefined`-Fall.

Der TEXT-Modus schreibt nur das Feld `result` + Zeilenumbruch nach stdout (jede beiläufige Assistenten-Prosa, die während des Durchlaufs angesammelt wurde, wird verworfen – nicht nach stderr gespiegelt). Der JSON-Modus gibt das vollständige Ereignisprotokoll als JSON-Array aus; `structured_result` befindet sich im letzten Element mit `type: "result"` dieses Arrays, nicht auf Dokumentstamme Ebene. Der Stream-JSON-Modus gibt jede Nachricht als eigene Zeile im JSONL-Format aus; die abschließende `result`-Zeile trägt `structured_result`.

## Datenschutz: Oberflächenübergreifende Schwärzung

Die über `structured_output` übermittelten Argumente SIND die strukturierte Nutzlast. Im Erfolgspfad befinden sie sich bereits auf stdout; bei Wiederholungen aufgrund von Validierungsfehlern erreichen sie möglicherweise nie stdout. In beiden Fällen ist das Persistieren auf dauerhaften geräteinternen Oberflächen (oder das Exportieren außerhalb des Geräts über Telemetrie) eine Duplizierung, die die Nutzlast in langlebigeren Speicher durchsickern lässt, als der Benutzer gewünscht hat. Die Schwärzungsregel lautet daher "niemals Argumente dieses synthetischen Tools persistieren, unabhängig vom Ergebnis", nicht nur "deduplizieren, was bereits auf stdout ist".

Zwei Oberflächen müssen schwärzen, und beide teilen dieselbe Platzhalterkonstante [`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts):

- `ToolCallEvent.function_args` (Telemetrie) – betrifft OTLP-Exporte, QwenLogger, UI-Telemetrie und den Chat-Aufzeichnungs-UI-Ereignisspiegel.
- `redactStructuredOutputArgsForRecording` (verwendet von `recordAssistantTurn` in `geminiChat.ts`) – betrifft die Chat-Aufzeichnungs-JSONL auf der Festplatte unter `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`. Wiederholungen bei Validierungsfehlern landen ebenfalls hier – die Argumente jeder Wiederholung erhalten denselben Platzhalter.

Die gemeinsame Konstante verhindert Abweichungen zwischen den beiden Oberflächen. Tool-Call-Metriken (Dauer, Erfolg, Entscheidung) bleiben erhalten.

Hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) werden absichtlich **nicht** geschwärzt – sie erhalten das rohe `tool_input`, da der Hook-Vertrag lautet "sehen, was das Tool sieht." Dies ist im Datenschutzabschnitt der Benutzerdokumentation als Hinweis "Hooks sehen rohe Argumente" dokumentiert, damit Betreiber nach `tool_name` filtern oder eine Schwärzung auf Hook-Seite hinzufügen können, bevor `--json-schema` gegen sensible Daten ausgeführt wird.

Die Schwärzung ist absichtlich auf **geräteinterne** Persistierungsoberflächen beschränkt (Telemetrie-Exporte + Chat-Aufzeichnungs-JSONL). Das Schema selbst reist bei jeder Anfrage weiterhin zum Modellanbieter als der `parameters`-Block der `structured_output`-Funktionsdeklaration – eine anbieterseitige Schwärzung ist nicht möglich, da das Modell das Schema benötigt, um den Tool-Call-Vertrag zu erfüllen. Der Datenschutzabschnitt der Benutzerdokumentation warnt Benutzer, `enum`/`const`/`default`/`examples`/`description`-Nutzlasten aus demselben Grund frei von Geheimnissen zu halten.

## Berechtigungssteuerung

`structured_output` ist bewusst von `PermissionManager.CORE_TOOLS` ausgeschlossen (der Menge von Tools, die der `--core-tools`-Zulassungsliste unterliegen) – zusammen mit den anderen synthetischen Tools (`agent`, `exit_plan_mode`, `ask_user_question`, `task_stop`, `send_message`). Dynamisch entdeckte Tools (`skill`, MCP) sind eine separate Ausschlusskategorie, die die Zulassungsliste ebenfalls aus nicht zusammenhängenden Gründen umgeht. Das synthetische Tool existiert nur, wenn `--json-schema` gesetzt ist; das Hinzufügen zur Zulassungslistenlogik würde bedeuten, dass `--core-tools read_file --json-schema X` den terminalen Vertrag stillschweigend fallen lässt.

Explizite `permissions.deny`-Regeln und `--exclude-tools`-Einstellungen gelten weiterhin über `PermissionManager.evaluate` → `isToolEnabled`. Beide verwenden denselben Ablehnungsmechanismus und beide verhindern die Registrierung – die Tool-Deklaration wird aus dem Registry entfernt, sodass das Modell das Tool nie sieht. Das typische Ergebnis ist, dass das Modell in Klartext antwortet (Exit 1). Wenn das Modell durch andere Tools schleift, ohne Text zu erzeugen, erreicht es irgendwann `maxSessionTurns` (Exit 53) und der `--json-schema`-Hinweis in `handleMaxTurnsExceededError` sagt dem Benutzer, wo er suchen soll.
**`--bare`-Interaktion.** Der Bare-Modus umgeht die Brücke zwischen Einstellungen und CLI-Konfiguration: `packages/cli/src/config/config.ts` erstellt `mergedDeny` als `[...(bareMode ? [] : settings.permissions.deny), ...]`, sodass Deny-Regeln auf Einstellungsebene (sowie `tools.exclude`) unter `--bare` ignoriert werden. `--exclude-tools` auf Argumentebene wird hingegen bedingungslos in `mergedDeny` angehängt, es bleibt also wirksam. Das synthetische Tool wird unabhängig davon registriert (gesteuert durch `jsonSchema`, nicht durch die Deny-Liste), daher wird ein reiner Einstellungs-Deny von `structured_output` unter `--bare` stillschweigend ignoriert, während das Tool weiterhin aufrufbar bleibt.

## Subagent-Kontexte

`Config.createToolRegistry` akzeptiert eine Option `forSubAgent: true`, die die synthetische Registrierung unterdrückt. Subagent-Überschreibungen nutzen die übergeordnete Config über Prototyp-Delegation (`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`), und `this.jsonSchema` vererbt sich über die Prototyp-Kette fort. Ohne das Flag würde das synthetische Tool auch im Registry des Subagenten registriert werden, und ein Subagent, der es aufruft, würde das „session ends now“-llmContent erhalten – aber nur die Haupt-/Drain-Schleifen von `runNonInteractive` erkennen das als terminal, sodass der Subagent weiterlaufen und Tokens für ein Tool verschwenden würde, dessen Vertrag seine Schleife nicht erfüllen kann.

> **Anmerkung für Maintainer.** Diese Unterdrückung hängt am einzelnen Aufrufpfad über `createToolRegistry(forSubAgent: true)`. Jeder zukünftige Subagenten-Spawn-Mechanismus, der diesen Pfad umgeht, wird das synthetische Tool in das Registry des Subagenten durchsickern lassen und den Fehlermodus „unendlicher Tokenverbrauch“ wieder einführen. Die komplementäre Absicherung wäre eine Runtime-Prüfung innerhalb von `syntheticOutput.execute()`, die einen `fatalError` (oder ein No-op) zurückgibt, wenn sie aus einem Subagenten-Kontext aufgerufen wird. Implementieren Sie eine solche Prüfung, falls ein zweiter Leckpfad auftaucht.

## MCP-Schattenwerkzeug-Sicherung

`tool-registry.ts:registerTool` prüft die lazy `factories`-Map auf Namenskollisionen, nicht nur die eager `tools`-Map. Wenn ein MCP-Server ein Tool entdeckt, das buchstäblich `structured_output` heißt, greift auch für Factory-Kollisionen der Pfad der automatischen Qualifikation, der für eager-Tool-Kollisionen existiert: Das MCP-Tool wird in `mcp__<server>__structured_output` umbenannt, und die synthetische Factory behält den nackten Namen. Ohne diese Sicherung könnte ein MCP-Server stillschweigend den Structured-Output-Vertrag kapern.

## Kompatibilitätstabelle

| Kombination                                                         | Status                   | Begründung                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (oder stdin, oder positional)                | Unterstützt              | Primärer Headless-Pfad.                                                                                                           |
| `--json-schema` + `--output-format text` (Standard)                 | Unterstützt              | `JSON.stringify(payload)` + Newline.                                                                                              |
| `--json-schema` + `--output-format json` / `stream-json`            | Unterstützt              | Das Feld `structured_result` trägt das rohe Objekt.                                                                              |
| `--json-schema` + `--bare`                                          | Unterstützt              | `--bare` schränkt das Registry auf `read_file`, `edit`, `run_shell_command` ein; das synthetische Tool wird neben dieser minimalen Menge registriert. |
| `--json-schema` + `-i`                                              | Zur Parse-Zeit abgelehnt | Die TUI hat keinen terminalen Vertrag für das synthetische Tool.                                                                 |
| `--json-schema` + `--input-format stream-json`                      | Zur Parse-Zeit abgelehnt | Single-Shot-Vertrag vs. langlebiges Protokoll.                                                                                     |
| `--json-schema` + `--acp` / `--experimental-acp`                    | Zur Parse-Zeit abgelehnt | ACP-Schleife ist unabhängig.                                                                                                       |
| `--json-schema` + `--prompt-interactive`                            | Zur Parse-Zeit abgelehnt | Gleich wie `-i`.                                                                                                                    |
| `--json-schema` + kein Prompt + keine gepipedte stdin               | Zur Parse-Zeit abgelehnt | Headless erfordert einen Prompt.                                                                                                    |

## Alternativen betrachtet

**Schema-bewusstes Antwort-Prompting (kein synthetisches Tool).** Das Modell auffordern, „mit JSON passend zu diesem Schema“ über den System-Prompt zu antworten, und dann die letzte Assistant-Nachricht parsen. Abgelehnt, da das Modell keine syntaktische Garantie hat – die Ausgabe könnte mit Codeblöcken versehen, mit Plauderei eingeleitet oder Felder halluzinieren. Die Tool-Call-Validierung wird von der Function-Calling-Ebene vor `execute()` erzwungen, was eine harte syntaktische + semantische Sicherung bietet.

**OpenAIs `response_format: {type: "json_schema", …}`.** Anbieter-spezifisch; würde parallele Implementierungen für Gemini und Anthropic erfordern. Der synthetische Tool-Ansatz ist anbieterunabhängig.

**structured_output an den Anfang des Batches sortieren statt filtern.** Lässt nebenläufige Tools ausführen, wenn der strukturierte Aufruf die Validierung nicht besteht. Abgelehnt, da der Vertrag für `--json-schema` „produziere strukturierte Ausgabe“ lautet – wenn das Modell in diesem Modus ist, sind nebeneffektbehaftete Geschwister wahrscheinlich ein Fehler. Sie vollständig zu unterdrücken ist sicherer; das Modell sieht ein „Skipped:“-tool_result und kann sie in einem separaten Durchlauf erneut ausgeben.

**Lokale `$ref`-Auflösung innerhalb von `schemaRootAcceptsObject`.** Würde Schemas wie `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` zur Parse-Zeit abfangen. Vorerst abgelehnt, da der Aufwand (Zyklenerkennung, JSON-Pointer-Syntax, `$defs` vs. `definitions`, partielle Pointer, entfernte Referenzen) den Nutzen überwiegt; der Hinweis `maxSessionTurns` verweist Benutzer bereits auf „Schema ist nicht erfüllbar“ als wahrscheinliche Ursache.

## Offene Arbeiten

- Schema-bewusste Antwortvalidierung könnte eine `pattern`-basierte ReDoS-Absicherung erhalten, wenn echte Nutzer auf katastrophale Backtracking-Muster in `--json-schema`-Argumenten stoßen.
- SDK-Protokollerweiterungen (Python / TypeScript / Java SDKs, die ein typisiertes `structured_result`-Feld freigeben) – separat verfolgen; [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (am 2026-05-11 geschlossen, nicht gemergt) deckte diesen Umfang ab, bevor die CLI/Core-Arbeit landete, und wurde abgelöst.

## Dateiindex

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`, `schemaRootAcceptsObject`, yargs-`.check`-Mutex-Regeln.
- `packages/cli/src/gemini.tsx` — TUI-Sicherung, Exit-Code-Infrastruktur.
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`, `emitStructuredSuccess`, `suppressedOutputBody`, Fehlerpfad für Klartext.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — `structuredResult` → `result` + `structured_result`-Envelope.
- `packages/core/src/config/config.ts` — Registrierung mit `registerStructuredOutputIfRequested`, `forSubAgent`-Überspringen.
- `packages/core/src/tools/syntheticOutput.ts` — Synthetisches Tool + `STRUCTURED_OUTPUT_REDACTED_ARGS`-Platzhalter.
- `packages/core/src/tools/tool-registry.ts` — Factory-Kollisions-Umbenennung für MCP-Schattenwerkzeuge.
- `packages/core/src/telemetry/types.ts` — `function_args`-Schwärzung.
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict` mit strikter Ajv-Instanz.
- `packages/cli/src/utils/errors.ts` — `handleMaxTurnsExceededError`'s `--json-schema`-Hinweis.