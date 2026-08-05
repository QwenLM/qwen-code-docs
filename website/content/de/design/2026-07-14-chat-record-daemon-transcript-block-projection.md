# Shared Projection Kernel from Append-only ChatRecords to DaemonTranscriptBlocks

## Dokumentstatus

- Status: Implementiert
- Datum: 2026-07-14
- Implementierungsdatum: 2026-07-15
- Geltungsbereich: core, acp-bridge, cli, sdk-typescript, web-shell
- Eingabe: Append-only-Unknown-Records, die bereits vom Aufrufer aus JSONL geparst wurden
- Ausgabe: eine `DaemonTranscriptBlock`-Projektion mit Diagnose- und Vollständigkeitsinformationen

## Fazit

Implementierungsergebnis: Record-Aufbereitung, die ACP-Replay-Maschine, reine Live-/Replay-Builder, der CLI-Adapter, Provenienz-bewusste Compaction, der SDK-Normalizer/Reducer und die Opt-in-SDK-Fassade sind alle gelandet. Das Standard-Daemon-Browser-Bundle bleibt innerhalb seines 151-KiB-Budgets; das minifizierte Transcript-Browser-Bundle beträgt 67.730 Bytes. Die separaten Daemon- und Daemon/Transcript-Artefakte umfassen zusammen 222.335 Bytes, während ein Artefakt, das beide importiert, 222.722 Bytes misst. Die zusätzlichen 387 Bytes sind Overhead für Combined-Module-Wrapper, daher sollten Aufrufer den Transcript-Subpfad als explizite Opt-in-Kosten behandeln. Synchrone Performance-Baselines und Web-Worker-Empfehlungen sind im SDK-README dokumentiert.

Web-Aufrufer verwenden einen separaten Opt-in-SDK-Subpfad:

    import {
      projectChatRecordsToDaemonTranscript,
      type ChatRecordTranscriptProjection,
    } from "@qwen-code/sdk/daemon/transcript";

    const projection = projectChatRecordsToDaemonTranscript(records);
    const { blocks, diagnostics, complete, truncated } = projection;

Diese synchrone Funktion startet weder den Daemon noch Express noch einen ACP-Kindprozess; sie greift nicht auf Dateisystem, Netzwerk, DOM oder Browser-Storage zu; und sie parst keinen JSONL-Text. Sie akzeptiert rohe Append-only-Records nach `JSON.parse` und führt intern aus:

    runtime validation
      -> active leaf selection
      -> parentUuid chain reconstruction
      -> same-UUID fragment aggregation
      -> persisted transcript replay
      -> SessionUpdate normalization
      -> DaemonTranscriptBlock projection

Die geteilte Implementierung ist in drei tiefe Module mit expliziter Verantwortung aufgeteilt:

    packages/core/src/utils/transcript-records.ts
      -> package export @qwen-code/qwen-code-core/transcriptRecords
      -> browser-safe record preparation
      -> active chain, aggregation, gaps, diagnostics

    packages/acp-bridge/src/transcript-replay.ts
      -> browser-safe replay machine
      -> shared pure SessionUpdate builders

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
      -> SDK adapter
      -> normalizer/reducer/finalize
      -> public projection interface

Die `HistoryReplayer` der CLI und die Live-`MessageEmitter`, `ToolCallEmitter` und `PlanEmitter` verwenden alle die reinen Update-Builder aus acp-bridge wieder. Das verhindert Drift, indem es nicht bloß von „CLI versus Web" zu „Live versus Replay" wechselt: Record-Interpretation und Update-Konstruktion haben jeweils eine einzige Implementierung.

Der SDK-Adapter wrapt dieselben `SessionUpdate`-Werte als ID-lose `DaemonEvent`-Werte, verwendet den bestehenden `normalizeDaemonEvent` und den Transcript-Reducer wieder und liefert letztlich `blocks`, `diagnostics`, `complete` und `truncated` zurück.

## Hintergrund

Das Zielszenario ist das Read-only-Rendering in der WebShell von persistiertem JSONL, das von `qwen -p` erzeugt wurde, zum Beispiel:

    /root/.qwen/projects/-root--qwen-workspace/chats/<session-id>.jsonl

Der Browser hat die Dateiinhalte bereits über einen Host, einen File-Picker oder einen anderen vertrauenswürdigen Lesepfad erhalten und ist dafür verantwortlich, den JSONL-Text in Unknown-Records zu parsen. Der vollständige Pfad danach ist:

    parsed append-only records
      -> shared record preparation
      -> shared transcript replay
      -> DaemonTranscriptBlock projection
      -> WebShellTranscript

Aufrufer müssen weder den `parentUuid`-Baum, noch den aktiven Ast nach einem Rewind, noch Append-Fragmente mit derselben UUID, Session-Artefakt-Records oder History-Lücken verstehen. Diese Persistenzsemantik den Aufrufern zu überlassen würde ein flaches Modul erzeugen: Die Oberfläche erschiene als einzelne Funktion, aber um sie korrekt zu nutzen, müssten Aufrufer das Wissen von `SessionService` reimplementieren.

Dieses Design verwendet nicht `compactedReplay`. Das ist das begrenzte In-Memory-Recovery-Fenster, das der Daemon für Live-Sessions pflegt; dieses Dienstprogramm verarbeitet persistierte Records, die vom Aufrufer explizit geliefert werden. Die Offline-Projektion hat standardmäßig kein Blockanzahl-Limit, behält aber das Sicherheitslimit für einen einzelnen Textblock und meldet jede verlustbehaftete Verarbeitung explizit über `diagnostics` und `truncated`.

## Bestehende Baseline: Wie der Daemon `/load` JSONL abspielt

Der aktuelle Response-Mode-`/load` übergibt JSONL nicht direkt an das SDK. Der vollständige Pfad ist:

    SessionService.loadSession
      -> JSONL parse
      -> last non-artifact leaf
      -> buildOrderedUuidChain
      -> same-UUID aggregateRecords
      -> ResumedSessionData.conversation.messages

    QwenAgent.loadSession
      -> collectHistoryReplayUpdates
      -> HistoryReplayer
      -> MessageEmitter / ToolCallEmitter / PlanEmitter
      -> SessionUpdate[] in LOAD_REPLAY_META_KEY

    acp-bridge restoreSession
      -> extractLoadReplayResponse
      -> BridgeClient.seedSessionUpdates
      -> prepareSessionUpdateFrames
      -> EventBus.seedReplayEvents
      -> compactedReplay + liveJournal

    DaemonSessionClient.load
      -> replaySnapshot
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> DaemonTranscriptState.blocks

Die erste Hälfte des Stream-Mode-`/load` wird weiterhin vom `HistoryReplayer` erzeugt; die Updates gelangen als ACP-Notifications in den wartenden Restore-`EventBus`, statt in die Load-Antwort aufgenommen zu werden. Beide Modi durchlaufen letztlich dieselbe Bridge-Frame-Aufbereitung, denselben Normalizer und denselben Reducer.

Die aktuelle Implementierung hat drei Verzweigungen, die konvergieren müssen:

- `SessionService` und `SessionTranscriptReader` haben jeweils ihre eigene `aggregateRecords`-Implementierung.
- `SessionService` wählt den letzten Nicht-Artefakt-Record als Leaf, während `SessionTranscriptReader` aktuell den letzten strukturell gültigen Record wählt. Ihre Semantik unterscheidet sich, wenn zufällig ein Artefakt am Ende der Datei steht.
- JSONL-Replay hängt von CLI-Emitter-Klassen ab, daher kann der Browser es nicht wiederverwenden, ohne `Config` und die Node-Runtime hereinzuziehen.

Dieses Design erzeugt keinen separaten JSONL-zu-Blocks-Shortcut. Stattdessen extrahiert es die browser-sichere Record-Aufbereitung und die `SessionUpdate`-Konstruktion aus dem Pfad oben und verwendet dann weiterhin das bestehende Normalisierungs-/Reduktions-Endstück des Daemons.

## Ziele

- Eine synchrone, In-Memory-, browser-sichere Funktion bereitstellen, die rohe geparste Records auf ein Transkript projiziert.
- Active-Chain-Auswahl, Same-UUID-Aggregation und History-Lücken in einem Record-Aufbereitungsmodul konsolidieren.
- CLI-Replay, Daemon-Load und Web-Offline-Projektion dazu bringen, Record-Interpretation und `SessionUpdate`-Konstruktionsregeln zu teilen.
- Live-Emitter und Replay-Maschine dazu bringen, reine Update-Builder zu teilen, um die Live-/Replay-Lokalität zu bewahren.
- Zeitstempel, Quell-Record-Identität, Part-Reihenfolge, Tool-Start/Ergebnis-Korrelation, Paginierungszustand und EOF-Dangling-Cleanup erhalten.
- Eine deterministische Projektion für identische Eingabe erzeugen, mit deterministischen Fallbacks für Felder, die nicht von der aktuellen `Config` abhängen.
- Persistiertes JSON als nicht vertrauenswürdige Eingabe behandeln und Aufruferfehler, behebbare Korruption und vorwärtskompatible unbekannte Werte unterscheiden.
- Strukturierte Diagnostik für jeden Skip, jede Mehrdeutigkeit und jede Trunkierung ausgeben; niemals eine Teilprojektion als vollständig präsentieren.

## Nicht-Ziele

- Dateien lesen oder JSONL-Text parsen.
- `EventBus`, SSE-Cursors, `Last-Event-ID` oder `compactedReplay` simulieren.
- Nicht persistierte Live-only-Blöcke wie permission, shell, user_shell oder cancellation aus Records ableiten.
- Den Node-only-Reader des Cores, Provider-Typen oder die vollständige Runtime in das Browser-Bundle ziehen.
- Die eindeutige Wiederherstellung paralleler Tool-Calls mit demselben Namen garantieren, wenn keine persistierte Call-ID vorhanden ist.
- Den Session-Artefakt-Store zurückgeben; Artefakte bleiben ein separater Side-Channel.
- Die gesamte CLI-Emitter-Klassenhierarchie in ein geteiltes Blatt verschieben; nur reine Update-Builder werden geteilt.

## Architektur

### 1. Record-Aufbereitungsmodul

Die Record-Aufbereitung gehört dem Persisted-Session-Modell des Cores. Es wird ein browser-sicherer Blatt-Export hinzugefügt:

    packages/core/src/utils/transcript-records.ts
      -> @qwen-code/qwen-code-core/transcriptRecords

Dieses Modul:

- führt eine Runtime-Validierung von Unknown-Records durch;
- wählt einen expliziten `leafUuid` oder als Standard den letzten gültigen Nicht-Artefakt-Konversations-Record;
- wandert vom Leaf über `parentUuid` zur Wurzel;
- stoppt bei einem fehlenden Parent, ohne eine frühere Insel anzuschließen, und erzeugt eine `HistoryGap`;
- aggregiert Fragmente mit derselben UUID in der Reihenfolge der aktiven Kette;
- verwendet die Feld-Zusammenführungsregeln, die aktuell von `SessionService` verwendet werden;
- identifiziert Zyklen, widersprüchliche `parentUuid`-Werte, korrupte Records und übersprungene Artefakt-Records; und
- liefert neue Top-Level-Records und Part-Arrays zurück, ohne die Eingabe zu verändern. Validierte verschachtelte Payloads werden als readonly-Werte wiederverwendet, statt sie nutzlos tiefzuklonen.

Vollständige Arrays und Streaming-Indizes werden unterschiedlich gelesen, daher teilen sie dieselben semantischen Primitive, statt den `SessionTranscriptReader` zu zwingen, die gesamte Datei in den Speicher zu laden:

    validateTranscriptRecord
    isTranscriptConversationRecord
    selectTranscriptLeaf
    walkTranscriptUuidChain(lookup)
    aggregateTranscriptRecordFragments

`prepareTranscriptRecords` komponiert diese Primitive für rohe Arrays. `SessionService` verwendet die komponierte Funktion direkt. `SessionTranscriptReader` behält seinen Byte-Offset-Index und paginierte Lesevorgänge, verwendet aber denselben Classifier, denselben Lookup-basierten Ketten-Walker und denselben Aggregator. Das bestehende `buildOrderedUuidChain` wird in diese Implementierung gefaltet und darf nicht als zweiter Walk bestehen bleiben.

Dies entfernt sowohl die zwei `aggregateRecords`-Implementierungen als auch die semantische Abweichung des Readers, wenn ein Artefakt der letzte Record ist, ohne seinen Streaming-Index oder paginierte Lesevorgänge zu opfern.

Dieses Blatt darf nur browser-sichere Typen und reine Funktionen importieren. Es darf nicht `fs`, `path`, `Buffer`, die Klasse `ChatRecordingService` oder Provider-Runtime-Code importieren.

Der Core hat aktuell keine Exports-Map. Die Implementierung muss die Exporte für das Root, `transcriptRecords`, `package.json` und die bestehenden `./dist/*`-Deep-Imports explizit bewahren. Das Hinzufügen eines Browser-Blatts darf nicht versehentlich die `@qwen-code/qwen-code-core/dist/...`-Pfade schließen, die im Repository als kompatibel dokumentiert sind.

### 2. Transcript-Replay-Modul

Die `SessionUpdate`-Semantik gehört zu ACP, daher leben die Replay-Maschine und die reinen Update-Builder in:

    packages/acp-bridge/src/transcript-replay.ts
      -> @qwen-code/acp-bridge/transcriptReplay

Dieses Modul verbirgt:

- Record-Typ/Subtyp-Dispatch;
- Message-Part-Reihenfolge;
- Text-, Thought-, Bild- und Function-Call-Konvertierung;
- Tool-Start/Ergebnis/Dangling-Zustand;
- Todo/Plan, Diff/Content, Usage und Provenance;
- Notification-, Cron-, Mid-Turn-Message- und Slash-Command-Ergebnisse;
- Quell-Record-Metadaten; und
- Paginierungs-Replay-Zustand.

Dieses Modul zu löschen würde die Komplexität über CLI-Replay, Live-Emitter und SDK-Projektion umverteilen, daher besteht es den Deletion-Test und hat ausreichende Tiefe.

### 3. Geteilte Update-Builder

Die Replay-Maschine dupliziert nicht die bestehenden Update-Konstruktionsregeln in `MessageEmitter`, `ToolCallEmitter` und `PlanEmitter`. Das acp-bridge-Blatt stellt reine Builder bereit, die nur von Adaptern verwendet werden, wie zum Beispiel:

    createUserMessageUpdate
    createAgentMessageUpdate
    createAgentThoughtUpdate
    createUsageUpdate
    createToolCallStartUpdate
    createToolCallResultUpdate
    createPlanUpdate

Die Builder akzeptieren nur strukturierte Parameter und liefern `SessionUpdate` zurück. Sie greifen nicht auf `Config`, Registries, i18n oder das Netzwerk zu.

CLI-Live-Emitter:

    runtime input
      -> CLI metadata adapter
      -> shared builder
      -> sendUpdate

`HistoryReplayer`:

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> sendUpdate

SDK-Offline-Projektion:

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> id-less DaemonEvent
      -> normalizer/reducer

Diff-Previews, Todo-Extraktion, Tool-Content-Transformation, Usage-zu-Plan-Reihenfolge und Provenance-Fallbacks müssen in den geteilten Buildern oder ihren privaten Helfern leben. Live-Emitter behalten nur das asynchrone Senden und die Runtime-Anreicherung.

### 4. SDK-Projektionsadapter

Die SDK-Fassade lebt in einem separaten Opt-in-Einstieg:

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
    packages/sdk-typescript/src/daemon/transcript.ts
    @qwen-code/sdk/daemon/transcript

Sie verwendet den Daemon-UI-Normalizer und -Reducer wieder, gelangt aber nicht in das Standard-`@qwen-code/sdk/daemon`-Browser-Bundle. Aufrufer müssen nur das SDK installieren und hängen nicht direkt von Core- oder acp-bridge-Subpfaden ab.

## Browser-sichere Paket-Seams

Zwei interne Blatt-Exporte werden hinzugefügt:

    @qwen-code/qwen-code-core/transcriptRecords
    @qwen-code/acp-bridge/transcriptReplay

Randbedingungen:

- Keine Node-Builtin-Imports zur Laufzeit.
- Kein Zugriff auf `process`, `Buffer`, das DOM oder Storage.
- Bevorzugt Type-only-Imports für Provider- und ACP-Pakete.
- Der SDK-Transcript-Einstieg inlinet die Implementierung in das veröffentlichte Bundle.
- Die veröffentlichten `.d.ts` des SDK müssen die öffentlichen Eingabe-/Projektionstypen inlinen und dürfen keinen acp-bridge-Subpfad referenzieren, der nur als Dev-Dependency existiert.
- Node-Builtin-Guards für die Core-, acp-bridge- und SDK-Transcript-Bundles hinzufügen.

## Record-Aufbereitungsschnittstelle

Die öffentliche SDK-Fassade akzeptiert `readonly unknown[]`. Nach interner Validierung erzeugt das Core-Blatt:

    export interface TranscriptRecordInput {
      readonly uuid: string;
      readonly parentUuid: string | null;
      readonly sessionId: string;
      readonly timestamp?: string;
      readonly type: "user" | "assistant" | "tool_result" | "system";
      readonly subtype?: string;
      readonly message?: {
        readonly role?: string;
        readonly parts?: readonly unknown[];
      };
      readonly usageMetadata?: unknown;
      readonly toolCallResult?: unknown;
      readonly systemPayload?: unknown;
    }

    export interface TranscriptReplayGapInput {
      readonly childUuid: string;
      readonly missingParentUuid: string;
    }

    export interface PreparedTranscriptRecords {
      readonly sessionId?: string;
      readonly records: readonly TranscriptRecordInput[];
      readonly gaps: readonly TranscriptReplayGapInput[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
    }

### Validierungspolitik

Fatal Aufruferfehler werfen `TranscriptProjectionInputError` direkt und liefern kein Teilergebnis:

    export type TranscriptProjectionInputErrorCode =
      | "invalid_records"
      | "invalid_max_blocks"
      | "leaf_not_found"
      | "mixed_session_ids";

    export class TranscriptProjectionInputError extends TypeError {
      readonly code: TranscriptProjectionInputErrorCode;
    }

- `records` ist kein Array.
- `options.maxBlocks` ist keine positive sichere Ganzzahl.
- Ein expliziter `leafUuid` existiert nicht.
- Zwei oder mehr strukturell gültige, unterschiedliche `sessionId`-Werte werden in einer Projektion gemischt.

Der SDK-Einstieg exportiert diesen Fehler konsistent. Der interne Validierungsfehler des Cores wird an der Fassadengrenze gemappt, damit keine interne Paketklasse in das öffentliche `.d.ts` leakt. Abgesehen von diesen Fällen darf ein einzelner fehlerhafter Record nicht dazu führen, dass die gesamte Projektion wirft.

Wenn ein einzelner Record oder eine verschachtelte Payload fehlerhaft ist, wird wiederherstellbare Historie wo immer möglich erhalten und eine Diagnose emittiert:

- Nicht-Objekte, Records ohne UUID, ungültige `parentUuid`-Werte und unbekannte Record-Typen überspringen.
- Records mit ungültigem Zeitstempel behalten, aber für diese Records `serverTimestamp` weglassen.
- Bei widersprüchlichen `parentUuid`-Werten unter Fragmenten mit duplizierter UUID das erste Fragment behalten und den Konflikt melden.
- Die Kette stoppen und eine Lücke melden, wenn ein `parentUuid` fehlt.
- Die Kette stoppen und einen Zyklus melden, wenn `parentUuid`-Werte einen Zyklus bilden.
- Einen fehlerhaften Part eines erkannten Kind überspringen und die Projektion als unvollständig markieren.
- Unbekannte vorwärtskompatible Subtyps/Parts überspringen und eine Warnung statt eines Wurfs emittieren.
- Erkannte System-Subtyps überspringen, die keinen Transkript-Content erzeugen, wie `chat_compression`, `ui_telemetry`, `file_history_snapshot` und Artefakt-Records, entsprechend der bestehenden Semantik, ohne `complete` zu beeinflussen.

Leere Eingabe liefert leere `blocks` mit `complete` gesetzt auf `true`. Reine Artefakt-Eingabe liefert ebenfalls ein leeres Transkript, mit einer informativen Diagnose.

Ein expliziter `leafUuid` muss auf einen Konversations-Record zeigen. Nur auf einen Artefakt-Record zu matchen ist äquivalent dazu, dass das Leaf nicht existiert. Artefakt-Records gelangen nicht in die UUID-Kette und nehmen nicht an Duplicate-Parent-Konflikterkennung teil.

### Diagnostik

    export interface TranscriptProjectionDiagnostic {
      readonly code: string;
      readonly severity: "info" | "warning" | "error";
      readonly message: string;
      readonly affectsCompleteness: boolean;
      readonly recordIndex?: number;
      readonly recordId?: string;
      readonly path?: string;
    }

Diagnose-Meldungen dürfen keine unredigierten Argumente, Ergebnisse, Tokens oder Credentials enthalten. Aufrufer sollten auf `code` verzweigen; `message` ist nur für Logging und Standardpräsentation.

`projection.complete` bedeutet:

- keine Diagnose hat `affectsCompleteness` auf `true` gesetzt;
- keine Block- oder Text-Trunkierung ist aufgetreten;
- die Replay-Abschließung wurde abgeschlossen; und
- keine mehrdeutige Tool-Korrelation ist aufgetreten.

Die erste Version stabilisiert mindestens die folgenden Diagnose-Codes. Codes sind ein Kompatibilitätsvertrag; Meldungen sind es nicht.

| code                            | affectsCompleteness | Bedeutung                                       |
| ------------------------------- | ------------------- | --------------------------------------------- |
| invalid_record                  | true                | Ein gesamter Record wurde übersprungen                  |
| invalid_timestamp               | false               | Content wurde ohne historische Zeit behalten  |
| conflicting_parent_uuid         | true                | Same-UUID-Fragmente haben widersprüchliche Parents  |
| history_gap                     | true                | Der aktiven Kette fehlt ein Parent          |
| parent_cycle                    | true                | Die aktive Kette enthält einen Zyklus             |
| malformed_part                  | true                | Ein erkannter fehlerhafter Part wurde übersprungen       |
| unknown_record_or_part          | true                | Eine unbekannte Erweiterung kann sichtbare Daten enthalten |
| ambiguous_tool_call_correlation | true                | Ein Tool-Ergebnis kann nicht eindeutig korreliert werden   |
| missing_tool_result             | true                | Ein Tool-Call hat kein persistiertes Ergebnis           |
| presentation_fallback           | false               | Presentation-Adapter fehlgeschlagen; Fallback verwendet    |
| transcript_blocks_truncated     | true                | `maxBlocks` hat ältere Blöcke entfernt              |
| transcript_text_truncated       | true                | Ein Textblock hat das Zeichenlimit überschritten     |

Reine Artefakt-Eingabe darf eine informative Diagnose verwenden, ohne `complete` zu beeinflussen. Das spätere Hinzufügen eines Codes darf die `affectsCompleteness`-Semantik eines bestehenden Codes nicht ändern.

## Replay-Emissions-Schnittstelle

Die geteilte Schicht emittiert vollständige `SessionUpdate`-Werte und bewahrt die Projektions-Provenance:

    import type { SessionUpdate } from "@agentclientprotocol/sdk";

    export interface TranscriptReplayEmission {
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
      readonly emissionOrdinal: number;
      readonly update: SessionUpdate;
    }

Eine Emission entspricht einer Record-Projektion, daher behält die äußere Form einen singulären `sourceRecordId`. Beim Schreiben in `SessionUpdate` wird daraus ein Einelement-`sourceRecordIds`-Array für sicheres Zusammenführen durch nachfolgende Compaction-/Upsert-Operationen.

    export interface TranscriptReplayUsageState {
      readonly promptTokens: number;
      readonly cachedTokens: number;
      readonly candidateTokens: number;
      readonly apiTimeMs: number;
    }

    export interface PendingTranscriptToolCall {
      readonly callId: string;
      readonly toolName: string;
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
    }

    export interface TranscriptReplayStateV1 {
      readonly v: 1;
      readonly pendingToolCalls: readonly PendingTranscriptToolCall[];
      readonly cumulativeUsage: TranscriptReplayUsageState;
    }

    export interface TranscriptReplayMachineOptions {
      readonly initialState?: TranscriptReplayStateV1;
      readonly gaps?: readonly TranscriptReplayGapInput[];
      readonly presentation?: TranscriptReplayPresentationAdapter;
      readonly onDiagnostic?: (
        diagnostic: TranscriptProjectionDiagnostic,
      ) => void;
    }

Der Replay-Zustand muss versioniert sein, und `snapshot` liefert eine abgetrennte Kopie zurück. Fehlerhafte Pending-Einträge in `initialState` werden mit einer Diagnose herausgefiltert; ungültige oder nicht endliche Usage wird mit einer Diagnose auf null zurückgesetzt. Eine unbekannte Zustandsversion wird direkt zurückgewiesen, um zu vermeiden, dass die Paginierung mit falschem Zustand fortgesetzt wird.

Aus Kompatibilitätsgründen mit vor der Auslieferung ausgestellten Transkript-Cursors wird Legacy-Zustand ohne `v` direkt auf v1 befördert, wenn er strikt der aktuellen `{ pendingToolCalls, cumulativeUsage }`-Form entspricht. Ein explizites unbekanntes `v` wird weiterhin zurückgewiesen. Der Legacy-Zweig parst nur diese eine veröffentlichte Form und entwickelt sich nicht zu einem zweiten Zustands-Schema weiter.

## Inkrementelle Replay-Maschine

    export interface TranscriptReplayMachine {
      project(
        record: TranscriptRecordInput,
      ): Iterable<TranscriptReplayEmission>;
      finalize(): Iterable<TranscriptReplayEmission>;
      snapshot(): TranscriptReplayStateV1;
    }

    export function createTranscriptReplayMachine(
      options?: TranscriptReplayMachineOptions,
    ): TranscriptReplayMachine;

`project` liefert einen lazy Iterator zurück. Die CLI wartet unmittelbar nach Erhalt jeder Emission auf `sendUpdate` und fordert die nächste Emission erst an, nachdem das Senden erfolgreich war. Zustandsänderungen nach einem `yield` des Generators werden daher erst committet, nachdem das vorherige Senden erfolgreich war.

Die Schnittstelle muss diese Iterations-Randbedingungen explizit dokumentieren:

- Adapter müssen jeden von `project` zurückgegebenen Wert vollständig iterieren.
- Nachdem eine gewöhnliche Emission nicht gesendet werden konnte, den aktuellen Record und alle nachfolgenden Records stoppen.
- Das aktuelle Timing für das Entfernen eines Pending-Tool-Ergebnisses beibehalten.
- Einen Tool-Start erst dann zu Pending hinzufügen, nachdem er erfolgreich gesendet wurde.
- Usage committen, bevor der zugehörige Plan-Builder kumulierte Werte liest.
- `finalize` ist idempotent; sein zweiter Aufruf liefert einen leeren Iterator zurück.
- Der CLI-Adapter für `finalize` muss Sende-Fehler einzeln abfangen, weiter versuchen, das verbleibende Dangling-Cleanup durchzuführen, und den ersten Cleanup-Fehler behalten.
- Weiterhin `AggregateError` verwenden, wenn sowohl ein Replay-Fehler als auch ein Cleanup-Fehler existieren.

Der SDK-Adapter hat keinen externen asynchronen Sende-Fehler und kann jeden Iterator vollständig konsumieren.

## Tool-Call-Korrelation

Call-Ids folgen dieser Priorität:

1. Eine explizit persistierte Id in `functionCall.id`, `toolCallResult.callId` oder `functionResponse.id`.
2. Wenn ein Start keine explizite Id hat, eine stabile synthetische Id mit einem reservierten Präfix erzeugen, die Quell-Record-UUID und Part-Index enthält.
3. Wenn ein Ergebnis keine explizite Id hat, es nur korrelieren, wenn genau ein Pending-Call denselben Namen hat.
4. Wenn kein Pending-Call oder mehrere Pending-Calls diesen Namen haben, nicht raten. Eine unabhängige synthetische Ergebnis-Id erzeugen und eine `ambiguous_tool_call_correlation`-Diagnose emittieren.
5. Nicht korrelierte Starts während `finalize` als Dangling-Tools behandeln.

Synthetische Ids verwenden den Präfix `qwen-replay-tool:`. Die Maschine prüft sie auf Kollisionen mit expliziten Ids und früheren synthetischen Ids und hängt bei Kollision einen stabilen Occurrence-Suffix an.

Ein stabiler Fallback garantiert nur deterministische Identität; er kann keine korrekte Korrelation garantieren, wenn Informationen fehlen.

## Quell-Record-Provenance

Die Record-Identität muss durch CLI, Daemon und SDK wandern, statt nur auf der äußeren Emission zu existieren. Ein Textblock stammt üblicherweise aus einem Record, während ein Tool-Block sowohl Start- als auch Ergebnis-Records absorbiert, daher verwenden Wire-Events und Blöcke ein geordnetes, dedupliziertes Array. Replay-Builder fügen dies zu `SessionUpdate._meta` hinzu:

    {
      qwenTranscript: {
        sourceRecordIds: ["..."]
      },
      timestamp: 1783958400000
    }

Randbedingungen:

- `sourceRecordIds` sind keine `EventBus`-Ids und dürfen nicht in `event.id` geschrieben werden oder an `Last-Event-ID` teilnehmen.
- `sourceTimestamp` am Adapter-Seam in einen endlichen Epoch-Wert in Millisekunden konvertieren und weiterhin das bestehende `timestamp`-Feld wiederverwenden.
- Eine History-Gap-Emission verwendet `[gap.childUuid]` und den Zeitstempel des Child-Records.
- Live-Emitter ohne Persisted-Record-Kontext schreiben kein `qwenTranscript`.
- Der Normalizer befördert `sourceRecordIds` aus `qwenTranscript` und entfernt dann das interne Transportobjekt aus den Präsentations-Metadaten.
- Optionales readonly `sourceRecordIds` zu `DaemonUiEventBase` und `DaemonTranscriptBlockBase` hinzufügen.
- Der Reducer führt Text/Thought/Bild nur zusammen, wenn `sourceRecordIds` gleich sind und alle anderen Merge-Bedingungen erfüllt sind.
- Tool-Blöcke werden weiterhin per `toolCallId` upserted und `sourceRecordIds` in Event-Reihenfolge vereinigt. Plan- und andere Upsert-Blöcke verwenden dieselbe Stable-Union-Regel.
- Der Text-Slot-Key der Compaction-Engine enthält ebenfalls `sourceRecordIds`, um Merges über Record-Grenzen hinweg zu verhindern.
- Wenn die Compaction-Engine dieselbe `toolCallId` zusammenführt, muss sie `qwenTranscript.sourceRecordIds` stabil vereinigen; Ergebnis-Metadaten dürfen die Start-Provenance nicht überschreiben.
- `sourceRecordIds` mit struktureller Gleichheit und `Map` vergleichen und indizieren, nicht mit einem unescapten Delimiter-Join, der es einer bösartigen UUID erlauben würde, Key-Kollisionen zu verursachen.
- Live-Events ohne `qwenTranscript` behalten das aktuelle Compaction-Verhalten.

Dies bewahrt identische Record-Segmentierung für beide Daemon-`/load`-Modi und die Offline-Projektion, sodass Konformitätstests keinen test-only `activeRecordId`-Kontext benötigen.

## Adapter-Seam für mutable Präsentationsdaten

    export interface TranscriptReplayPresentationAdapter {
      resolveToolMetadata(
        toolName: string,
        args: Readonly<Record<string, unknown>>,
      ): TranscriptReplayToolMetadata;

      formatHistoryGap(gap: TranscriptReplayGapInput): string;
    }

- Der CLI-Adapter verwendet die aktuelle `Config`/Tool-Registry, um Titel, Kind und Locations aufzulösen, und verwendet CLI-i18n, um History-Lücken zu formatieren.
- Der Browser-Adapter verwendet deterministische Fallbacks: Der Titel ist der Tool-Name plus ein persistiertes Beschreibungs-Argument, das Kind ist `other`, Locations sind leer, und History-Lücken verwenden festen SDK-Text.

Wenn der Adapter wirft, verwendet die Replay-Maschine einen deterministischen Fallback und emittiert eine Diagnose, statt zuzulassen, dass die Präsentationsanreicherung das gesamte Transkript beendet.

Provenance, Todo/Diff/Content, Usage und Call-Korrelation gehören nicht an diesen Seam und müssen von der geteilten Implementierung entschieden werden.

## CLI-Adapter

`HistoryReplayer` behält seine bestehende Aufrufschnittstelle, wird aber auf einen asynchronen Adapter reduziert:

    prepared records
      -> seed replay state
      -> machine.project(record)
      -> await sendUpdate(emission.update) in order
      -> machine.finalize() when requested
      -> copy machine.snapshot()
      -> clear active replay context

Das folgende Verhalten bleibt in der CLI:

- `Config`/Tool-Registry-Anreicherung;
- lokalisierter CLI-History-Lücken-Text;
- `messageRewriter.interceptUpdate`;
- asynchrone `sendUpdate`-Fehlerbehandlung;
- Kombination von Replay-Fehlern und Dangling-Cleanup-Fehlern in einem `AggregateError`; und
- Live-only-Goals, Stop-Hooks und andere nicht persistierte Events.

Load-, paginierte Transkript- und Export-Pfade müssen dieselbe Record-Aufbereitung und Replay-Maschine verwenden, damit dasselbe JSONL nicht über verschiedene Einstiegspunkte unterschiedliche `SessionUpdate`-Werte erzeugt.

## SDK-Transkript-Schnittstelle

    export interface ChatRecordTranscriptOptions {
      readonly leafUuid?: string;
      readonly maxBlocks?: number;
    }

    export interface ChatRecordTranscriptProjection {
      readonly blocks: readonly DaemonTranscriptBlock[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
      readonly complete: boolean;
      readonly truncated: boolean;
    }

    export function projectChatRecordsToDaemonTranscript(
      records: readonly unknown[],
      options?: ChatRecordTranscriptOptions,
    ): ChatRecordTranscriptProjection;

Wenn `options.maxBlocks` weggelassen wird, kürzt die Offline-Projektion die Blockanzahl nicht. Ein expliziter Wert muss eine positive sichere Ganzzahl sein. Wenn gekürzt wird:

- ist `truncated` `true`;
- ist `complete` `false`;
- enthalten `diagnostics` `transcript_blocks_truncated`; und
- folgen Tool-, Permission- und Parent-Indizes weiterhin den sicheren Cleanup-Regeln des Reducers.

Der Offline-Adapter übergibt explizit `Number.MAX_SAFE_INTEGER` als Standard. Er ändert weder `DEFAULT_MAX_BLOCKS` für das Online-`createDaemonTranscriptState` noch legt er `Infinity` in den Reducer-Zustand.

Der Event-Pfad des SDK-Adapters ist:

    TranscriptReplayEmission
      -> id-less DaemonEvent(type = session_update)
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> finalizeOfflineDaemonTranscriptState
      -> ChatRecordTranscriptProjection

Events haben keine Id, weil sie nicht vom `EventBus` stammen. `sourceTimestamp` wird zu `serverTimestamp`, und `sourceRecordIds` bleiben separate Projektions-Provenance.

Der Offline-Adapter verwendet eine feste Reducer-Uhr von `0`, damit `Date.now` nicht in beobachtbare Felder gelangt. Dieselbe Eingabe, dieselben Optionen und derselbe Presentation-Adapter müssen eine tiefengleiche Projektion erzeugen; `serverTimestamp` repräsentiert die tatsächliche historische Zeit.

Das neue private `finalizeOfflineDaemonTranscriptState` führt nur Cleanup für die Offline-Projektion durch und wird nicht aus dem Standard-Daemon-Einstieg exportiert:

- `streaming` aktiver Assistant-/Thought-Blöcke auf `false` setzen;
- aktive Text-Pointer leeren;
- kein Wire-Event und keinen sichtbaren Block erfinden; und
- abgeschlossene Tool-Status nicht ändern.

Ein einzelner Textblock verwendet weiterhin das Sicherheits-Zeichenlimit des SDK. Wenn eine Zeichen-Trunkierung auftritt, muss der Diagnose-Hook des Reducers `transcript_text_truncated` melden und `truncated=true` sowie `complete=false` setzen; er darf sich nicht nur auf ein sichtbares `[truncated]`-Suffix verlassen.

Um Block-/Text-Trunkierung beobachtbar zu machen, wird `DaemonTranscriptReducerOptions` ein optionales `onTruncation(detail)` hinzugefügt. Das Detail enthält mindestens das Kind, die Block-Id und, falls vorhanden, `sourceRecordIds`. Gewöhnliche Stores übergeben diesen Callback nicht; der Offline-Adapter sammelt Details und dedupliziert sie zu Projektions-Diagnosen. Trunkierung nicht durch Scannen nach `[truncated]` ableiten, denn Benutzertext kann dasselbe Suffix enthalten.

## Sicherheit bei nicht vertrauenswürdigen Identifiern

UUIDs, Call-Ids und Parent-Ids in Offline-Eingaben sind nicht vertrauenswürdige Strings. Vor der Integration werden diese Transkript-Reducer-Indizes auf `Map` oder null-prototype Objekte umgestellt:

- `blockIndexById`;
- `toolBlockByCallId`;
- `permissionBlockByRequestId`;
- `activeAssistantBlockByParent`;
- `activeThoughtBlockByParent`; und
- getrimmte Notification-Maps.

Tests müssen `__proto__`, `constructor`, `prototype`, `toString` und überlange Ids abdecken, um sicherzustellen, dass sie Lookup, Parent-Child-Beziehungen oder Trimming-Cleanup nicht brechen können.

## Artefakte

Der Tool-Ergebnis-Builder darf persistierte Artefakte weiterhin in `SessionUpdate`-Metadaten ablegen, damit der Artefakt-Side-Channel der Daemon-Bridge sie nutzen kann. `DaemonTranscriptBlock` hat jedoch kein Artefakt-Feld, und die SDK-Offline-Projektion liefert keinen Artefakt-Store zurück.

Die Konformität wird daher in zwei Schichten geteilt:

- `SessionUpdate`-Konformität schließt Artefakte ein.
- `DaemonTranscriptBlock`-Konformität ignoriert den Artefakt-Side-Channel explizit.

Wenn `WebShellTranscript` in Zukunft Artefakt-Cards benötigt, wird eine separate Artefakt-Projektion hinzugefügt, statt Artefakte in Transkript-Blöcke zu schmuggeln.

## Konsistenzvertrag

### Stark konsistentes Verhalten

CLI-Replay und SDK-Offline-Projektion teilen die Maschine, daher muss Folgendes übereinstimmen:

- aktive Kette und Same-UUID-Aggregation;
- Record-/Subtyp-Filterung und Update-Reihenfolge;
- unterstützte Message-Text-/Thought-/Bild-Formen und Part-Reihenfolge;
- Tool-Call-Ids und Start/Ergebnis/Dangling-Zustand;
- Todo/Plan, Diff/Content und rohe Ein-/Ausgabe;
- Usage, Task-Ausführungs-Usage und Plan-Stat-Reihenfolge;
- Einfügepositionen von Notification, Cron, Mid-Turn-Message, Slash-Command und Lücke; und
- Zeitstempel, `sourceRecordIds` und Replay-Diagnostik.

Live-Emitter und Replay-Maschine teilen Update-Builder, daher müssen Felder in `SessionUpdate`, die für dasselbe semantische Event erzeugt werden, übereinstimmen.

### Explizit erlaubte Adapter-Unterschiede

- Tool-Titel, Kind und Locations, berechnet aus der aktuellen `Config`/Tool-Registry der CLI.
- History-Lücken-Text in der aktuellen Locale der CLI.
- Abgeleitete Messages, die durch CLI-Message-Rewriting hinzugefügt werden.
- Der Artefakt-Side-Channel.
- Live-only-Permission-, Shell-, Cancellation- und Session-Events.

Wenn das Produkt feldweise identische Tool-Metadaten verlangt, müssen Replay-Metadaten zum Zeitpunkt der Tool-Call-Aufzeichnung persistiert werden und „persistierter Wert zuerst, deterministischer Fallback" folgen. Historische Wahrheit darf nicht aus der aktuellen Registry neu berechnet werden.

## Konformitätstests

Die Tests haben sechs Schichten:

1. Core-Record-Aufbereitungs-Golden-Tests: rohe Append-only-Fixtures auf aktive Kette, Aggregation, Lücken und Diagnostik.
2. acp-bridge-Builder-Tests: Live-/Replay-Eingaben behaupten vollständige `SessionUpdate`-Werte.
3. Replay-Maschinen-/Compaction-Tests: Reihenfolge, versionierter Zustand, Paginierung, synthetische Ids, mehrdeutige Korrelation, Abschließung und Beibehaltung von `sourceRecordIds` während Text-/Tool-Compaction.
4. CLI-Adapter-Regressions-Tests: asynchrones Senden, Message-Rewriting, teilweises Fehlschlagen, Dangling-Cleanup und `AggregateError`.
5. SDK-Projektions-Tests: ID-lose Events, `sourceRecordIds`, Normalisierung, Record-Segmentierung, Trunkierung, bösartige Identifier und deterministische Blöcke.
6. Paketübergreifende Konformität: derselbe rohe Fixture durchläuft echtes CLI-Replay und SDK-Offline-Projektion.

Paketübergreifende Pfade:

    raw records
      -> SDK projectChatRecordsToDaemonTranscript
      -> sdkProjection

    raw records
      -> shared record preparation
      -> CLI HistoryReplayer
      -> captured SessionUpdate with qwenTranscript metadata
      -> SDK normalizer/reducer/finalize
      -> cliProjection

Tiefengleichheit auf der kanonischen Projektion prüfen. Der Kanonisierer darf nur explizit erlaubte Adapter-Unterschiede ignorieren; er darf `sourceRecordIds`, Zeitstempel, Tool-Status, Diagnostik oder Trunkierung nicht entfernen.

Außerdem Daemon-Integrations-Fixtures hinzufügen, die verifizieren, dass das behaltene Replay von Response-Mode- und Stream-Mode-`/load` mit der Offline-Projektion übereinstimmt, wenn keine Fenster-Trunkierung auftritt. Tests müssen eine nachfolgende Turn-Grenze überschreiten, um die Bridge-/Compaction-Beibehaltung von `qwenTranscript`-Metadaten und Zeitstempeln abzudecken.

## Integration mit WebShellTranscript

    import { useMemo } from "react";
    import {
      projectChatRecordsToDaemonTranscript,
    } from "@qwen-code/sdk/daemon/transcript";
    import { WebShellTranscript } from "@qwen-code/web-shell";

    function ReadonlyHistory({ records }: { records: readonly unknown[] }) {
      const projection = useMemo(
        () => projectChatRecordsToDaemonTranscript(records),
        [records],
      );

      return (
        <>
          {projection.complete ? null : (
            <TranscriptDiagnostics diagnostics={projection.diagnostics} />
          )}
          <WebShellTranscript blocks={projection.blocks} />
        </>
      );
    }

Das SDK besitzt Datenaufbereitung und Projektion; die WebShell besitzt nur Read-only-Rendering. `WebShellTranscript` fügt kein `records`-Prop hinzu und startet weder Provider noch Session noch Netzwerkverbindung.

## Synchroner Performance-Vertrag

Die öffentliche Fassade ist eine synchrone O(records + parts)-Projektion und scannt die gesamte Eingabe, selbst wenn ein explizites `maxBlocks` letztlich nur die letzten Blöcke behält. `maxBlocks` begrenzt den Ausgabe-Speicher, nicht die Berechnung.

Vor der Implementierung werden Zeit- und Peak-Speicher-Baselines mit kleinen, mittleren und großen realen Fixtures etabliert und das empfohlene Main-Thread-Limit in der SDK-Dokumentation dokumentiert. Hosts oberhalb dieses Limits sollten dieselbe browser-sichere Schnittstelle in einem Web Worker aufrufen und die Projektion an den Main-Thread übergeben.

Die erste Version fügt keinen separaten Async-/Worker-Wrapper hinzu. Dieser Adapter wird überdacht, nachdem ein zweiter realer Aufrufer auftaucht, um einen falschen Seam mit nur einem Adapter zu vermeiden.

## Bundle- und Publishing-Randbedingungen

Der Konverter gelangt nicht in das Standard-`@qwen-code/sdk/daemon`-Bundle. Dieser Paket-Export wird hinzugefügt:

    "./daemon/transcript": {
      "types": "./dist/daemon/transcript.d.ts",
      "import": "./dist/daemon/transcript.js",
      "require": "./dist/daemon/transcript.cjs"
    }

Build-Anforderungen:

- Separate Browser-ESM- und Node-CJS-Bundles.
- Ein separater Node-Builtin-Guard.
- Ein separates Größen-Budget, bei dem Baseline-Commit und Messbefehl dokumentiert sind.
- Öffentliche `.d.ts`-Dateien leaken keine Core-/acp-bridge-Dev-Dependencies.
- Duplizierten Code in einem Beispiel-Build messen, der sowohl `daemon` als auch `daemon/transcript` importiert.
- Für Browser-Sicherheit nicht auf das Importieren des Paket-Roots oder auf zufälliges Tree-Shaking angewiesen sein.

Das Standard-Daemon-Budget von 151 KiB erhöht sich für dieses Feature nicht.

## Migrationsreihenfolge

1. Das browser-sichere Transcript-Record-Aufbereitungsblatt zum Core hinzufügen und `SessionService` sowie `SessionTranscriptReader` dazu bringen, Klassifikation, Leaf-Auswahl, Ketten-Walk und Aggregation zu teilen.
2. Reine `SessionUpdate`-Builder zu acp-bridge hinzufügen und Live-Emitter schrittweise darauf migrieren.
3. Die Replay-Maschine und Golden-Tests hinzufügen.
4. `HistoryReplayer` in einen CLI-Adapter umwandeln und dabei seine bestehende Aufrufschnittstelle und Fehlersemantik bewahren.
5. `qwenTranscript`-Metadaten hinzufügen und die Verarbeitung von `sourceRecordIds` in Bridge, Compaction, Normalizer und Reducer erweitern.
6. Die Reducer-Indizes für nicht vertrauenswürdige Identifier und die Trunkierungs-Diagnostik härten.
7. Die Opt-in-`daemon/transcript`-Fassade und separate Publishing-Artefakte zum SDK hinzufügen.
8. Paketübergreifende Konformität und Daemon-Integrations-Fixtures hinzufügen.
9. Die Read-only-Seite der WebShell mit `projection.blocks` verbinden und Diagnostik anzeigen.

Bei jedem Schritt werden bestehende Consumer migriert, bevor die alte Implementierung gelöscht wird, damit keine Phase zwei aktive Regel-Sets für Kette, Aggregation oder Update-Builder gleichzeitig hat.

## Geschätzte Codegröße

- Core-Record-Aufbereitung und Migration von zwei bestehenden Consumern: ungefähr 180–280 Zeilen Produktionscode.
- acp-bridge-Builder und Replay-Maschine: ungefähr 400–550 Zeilen.
- CLI-`HistoryReplayer`-Adapter: ungefähr 60–100 Zeilen.
- SDK-Projektions-Fassade, Identität und Diagnostik-Glue: ungefähr 140–220 Zeilen.
- Reducer-Sicherheits-/Trunkierungs-Unterstützung: ungefähr 60–120 Zeilen.
- Der Rest sind überwiegend Fixtures, Regressions-Tests und Konformitätstests.

Dies ist eine paketübergreifende Core-Änderung. Ein Maintainer muss den Umfang unter dem Core-Triage-Gate des Repositories bestätigen, bevor implementiert wird. Doppelte Aggregation oder Update-Builder sollten nicht beibehalten werden, nur um die Zeilenzahl zu reduzieren.

## Verlustbehafteter Geltungsbereich

Die Projektion kann nur Informationen wiederherstellen, die in Records vorhanden sind. Das Folgende ist explizit nicht wiederherstellbar oder potenziell verlustbehaftet:

- Live-only-Blöcke wie permission, shell, user_shell und prompt_cancelled;
- der Session-Artefakt-Store;
- historische Wahrheit für die aktuelle `Config`/Registry/Locale;
- nicht unterstützte binäre/Audio/fileData;
- altes Sidechain-Subagent-Nesting ohne `parentToolCallId`;
- exakte Korrelation, wenn explizite Call-Ids fehlen und mehrere gleichnamige Tools pending sind;
- Content nach dem Sicherheits-Zeichenlimit eines einzelnen Textblocks;
- ältere Blöcke, die durch ein explizit vom Aufrufer übergebenes `maxBlocks` entfernt wurden; und
- Content, der wegen korrupter Eingabe, unbekannter Erweiterungen oder einer kaputten Kette übersprungen wurde.

Jeder Fall, der die Vollständigkeit beeinflusst, muss eine Diagnose emittieren und `complete=false` setzen. Jeder tatsächliche Trim muss außerdem `truncated=true` setzen.
