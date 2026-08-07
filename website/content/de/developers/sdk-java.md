# Qwen Code Java SDK

Das Qwen Code Java SDK bietet einen empfohlenen Daemon-Transport für `qwen serve` und behält die experimentelle Legacy-stdio-API für die Kompatibilität bei. Beide APIs werden im selben `com.alibaba:qwencode-sdk`-Artifact ausgeliefert.

## Voraussetzungen

- Java >= 11 für `0.1.0-alpha`
- Maven >= 3.9.2 beim Bauen oder Veröffentlichen dieses SDK aus dem Quellcode
- Ein kompatibler `qwen serve` für die Daemon-API oder qwen-code >= 0.5.0 für die Legacy-stdio-API

### Abhängigkeiten

- **Logging-API**: org.slf4j:slf4j-api (wähle einen SLF4J-Provider in deiner Anwendung)
- **Hilfsbibliotheken**: org.apache.commons:commons-lang3
- **JSON-Verarbeitung**: Fastjson2 für die Kodierung und Jackson Core für striktes Decoding
- **Tests**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Füge die folgende Abhängigkeit zu deiner Maven-`pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

Oder bei Verwendung von Gradle, füge es zu deiner `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
```

## Bauen und Ausführen

### Build-Befehle

```bash
# Projekt kompilieren
mvn compile

# Tests ausführen
mvn test

# JAR paketieren
mvn package

# In lokales Repository installieren
mvn install
```

### Real-Daemon-E2E aus dem Quellcode

Führe die Real-Daemon-Java-Integrationstests vom Repository-Root aus, nachdem du sowohl die Workspaces als auch das Root-CLI-Bundle gebaut hast:

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

`npm run build` allein aktualisiert `dist/cli.js` nicht; das E2E-Harness startet dieses Bundle und schlägt mit einem eindeutigen Voraussetzungsfehler fehl, wenn es fehlt.

## Empfohlene Daemon-API

Starte `qwen serve` und erstelle dann eine unabhängige, Thread-gebundene Session. `promptText` kehrt erst zurück, wenn ein passendes `turn_complete` empfangen wurde; unvollständige Streams schlagen mit `PromptOutcomeIndeterminateException` fehl, anstatt Teiltext als Erfolg zurückzugeben.

Verwende für die von `0.1.0-alpha` vorausgesetzten Lifecycle-Garantien den qwen-code-Build, der aus derselben Quell-Revision wie das SDK veröffentlicht wurde. Der Daemon muss das idempotente, pro-Client-Detach-Ledger aus [#7386](https://github.com/QwenLM/qwen-code/pull/7386), die pro-Epoch-Terminal-Garantie aus [#7400](https://github.com/QwenLM/qwen-code/pull/7400) sowie die in diesem Release enthaltene Admission-Cancellation und FIFO-Cancel-Drain-Fence enthalten. Der #7400-Commit allein reicht nicht aus: Ein Daemon mit derselben Wire kann Cancel quittieren, bevor der Agent dispatched wird, ohne den admitted-Prompt zu stoppen, oder ein nicht quittiertes, sessionweites Cancel an einen nachfolgenden Prompt in der Warteschlange weiterleiten. Der mitgelieferte ACP-Child verwendet eine quittierte, Admission-bewusste Cancellation-Handshake; ein benutzerdefinierter, standardkonformer ACP-Child ohne diese Erweiterung erhält eine Standard-`session/cancel`-Benachrichtigung. Die Feature-Verhandlung kann ältere Daemon-Builds mit derselben Wire nicht unterscheiden, daher schlägt das SDK fail-closed zu, anstatt Teilausgaben als Erfolg zu melden.

Die mitgelieferte Cancellation-Handshake wartet bewusst darauf, dass der betroffene Prompt-Call abgeschlossen wird, bevor der Daemon seinen nachfolgenden Prompt dispatched. Es gibt keinen Timeout, der lediglich die Cancellation quittiert: Dies könnte dazu führen, dass ein verspätetes, sessionweites Cancel den nächsten Prompt erreicht. Wenn ein Provider, ein Tool oder eine benutzerdefinierte Integration sein `AbortSignal` unbegrenzt ignoriert, kann die Cancel-Mutation daher ergebnisoffen bleiben und diese Session darf nicht wiederverwendet werden. Betrachte ein formales Prompt-Terminal, das innerhalb der Beobachtungsgrenzen des Aufrufers empfangen wurde, als maßgeblich; andernfalls schließe oder zerstöre die Session, wenn die Beobachtung fehlschlägt. Die Wiederherstellung eines blockierten, gemeinsam genutzten ACP-Childs ohne Beeinträchtigung seiner Geschwister-Sessions erfordert eine stärkere Runtime-Isolation und liegt außerhalb dieses Alpha-Vertrags.

```java
import com.alibaba.qwen.code.daemon.DaemonClient;
import com.alibaba.qwen.code.daemon.DaemonSessionClient;
import com.alibaba.qwen.code.daemon.PromptTextResult;
import java.net.URI;

try (DaemonClient daemon = DaemonClient.builder()
        .baseUri(URI.create("http://127.0.0.1:4170"))
        .build();
     DaemonSessionClient session = daemon.createSession()) {
    PromptTextResult result = session.promptText("Explain this repository");
    System.out.println(result.getText());
}
```

Wenn `qwen serve` Authentifizierung erfordert, füge
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))` zum `DaemonClient`-Builder
hinzu. Das SDK sendet das Bearer-Token bei REST- und SSE-Anfragen und setzt es
niemals in die URL.

Verwende `startPrompt` mit einem `PromptObserver`, wenn du geordnete Text-, Thought-, Tool-, Usage-, Permission- und Raw-Event-Callbacks benötigst. Seine `acceptanceFuture()`- und `completionFuture()`-Sichten legen Daemon-Admission und das zuverlässige Turn-Terminal separat offen. `respondToPermission()` gibt `false` zurück, wenn die Anfrage bereits aufgelöst wurde oder nicht mehr ausstehend ist. Das Abbrechen der Future-Sichten bricht nicht den Daemon-Prompt ab; verwende `cancelActivePrompt()` für die Daemon-Cancel-Operation auf Session-Ebene und warte weiterhin auf das passende Terminal. Eine kooperative Cancellation wird mit `turn_complete` und `stopReason=cancelled` abgeschlossen; `promptText()` gibt sein `PromptTextResult` zurück, daher müssen Aufrufer, die Cancellation unterscheiden, `result.getTerminal().getStopReason()` prüfen. Wenn der Agent oder Provider während der Cancellation fehlschlägt, kann der Daemon stattdessen `turn_error` veröffentlichen, wodurch `promptText()` eine `PromptTurnException` wirft.

Wenn Cancellation, Deadline, Teardown oder Agent-Settlement konkurrieren, veröffentlicht das Exactly-once-Latch des Daemons das erste formale Terminal und unterdrückt spätere Kandidaten. Verzweige immer anhand des empfangenen Terminals selbst; die letzte vom Client gesendete Control-Mutation bestimmt nicht den Terminal-Typ oder Fehlercode.

Der SSE-Transport sendet `Accept-Encoding: identity` und `Last-Event-ID`, validiert Framing und Event-IDs, dedupliziert Replays und verbindet nur das SSE-GET erneut. Prompt- und andere Mutations-Anfragen werden niemals automatisch wiederholt. HTTP-408- und 5xx-Antworten auf Prompt-Admission, Session-Erstellung, Permission, Cancel, Heartbeat, Detach oder Delete werden als ergebnisoffen gemeldet, da sie nicht beweisen, dass der Daemon die Mutation abgelehnt hat. Endliche Antwort-Bodys und SSE-Beobachtung haben unabhängige Deadlines.

Die Modellauswahl zum Erstellungszeitpunkt wird von der Java-Daemon-SDK-API in dieser Alpha absichtlich nicht bereitgestellt. Der Daemon meldet eine abgelehnte `modelServiceId` nur als SSE-Event, das vor der Create-Antwort emittiert wird, während dieses SDK seinen Stream ab dem späteren Prompt-Admission-Wasserzeichen öffnet. Bis der Daemon ein eindeutiges Create-Ergebnis zurückgibt oder das SDK eine eigene Session-Event-Subscription ab `Last-Event-ID: 0` besitzt, verwende das konfigurierte Standardmodell des Daemons.

`PromptRequest.Builder.deadline(Duration)` fordert eine vom Daemon durchgesetzte Prompt-Deadline und wird nur akzeptiert, wenn der Daemon `prompt_absolute_deadline` bewirbt; andernfalls schlägt das SDK vor dem Senden des Prompts fehl. Der Wert muss zwischen 1 und 2.147.483.647 Millisekunden liegen, entsprechend dem Node-Timer-Bereich des Daemons. Dies ist getrennt von `observationTimeout(Duration)`, das nur die lokale SSE-Beobachtung begrenzt und niemals eine Cancel-Mutation sendet.

Vor dem Erstellen einer Session verlangt das SDK, dass der Daemon den REST-Transport und `session_scope_override` bewirbt; dies verhindert, dass ein älterer Daemon den angeforderten `thread`-Scope stillschweigend ignoriert und den Client mit einer gemeinsamen Session verbindet. Wenn `client_heartbeat` beworben wird, sendet eine offene Session jede Minute einen neuen Heartbeat, damit der Daemon einen ansonsten inaktiven Client nicht aufräumt. Setze `heartbeatInterval(Duration.ZERO)` im `DaemonClient`-Builder, um dieses Verhalten zu deaktivieren, oder wähle ein anderes positives Intervall. Ein Heartbeat wird niemals wiederholt; der nächste geplante Heartbeat ist ein separater Keepalive. Die Prompt-Beobachtung ist standardmäßig auf 32 gleichzeitige Prompts pro Client begrenzt und kann mit `maximumConcurrentPrompts` angepasst werden. Admission- und Terminal-Future-Callbacks laufen abseits der Transport-Worker; blockierte Callbacks verbrauchen begrenzte Publikationskapazität. Die SSE-Stream-Bereinigung ist ebenfalls begrenzt, und ein blockiertes Schließen behält seine Bereinigungs-Reservierung. Beide Bedingungen können dazu führen, dass ein späteres `startPrompt` mit `DaemonClientCapacityException` fehlschlägt, anstatt einen Timeout-Close zu verwerfen oder Threads und Warteschlangenarbeit unbegrenzt zu vergrößern.

Ein unbestimmter Abschluss ist eine Ergebnisgrenze, keine Session-Wiederverwendungsgrenze. Nach `PromptAdmissionUnknownException` oder `PromptOutcomeIndeterminateException` lehnt dieser `DaemonSessionClient` weitere Prompts dauerhaft ab, selbst wenn die lokale Stream-Bereinigung später erfolgreich ist; schließe oder zerstöre stattdessen die Session. Ein Beobachtungs-Timeout wird veröffentlicht, ohne endlos auf einen blockierten Stream-Close zu warten, während die Bereinigung asynchron fortgesetzt wird und bis zum Abschluss begrenzte Client-Kapazität beansprucht.

## Legacy-stdio-API

Die bestehende `com.alibaba.qwen.code.cli`-API bleibt verfügbar:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Für erweiterte Nutzung mit benutzerdefinierten Transportoptionen:

```java
public static void runTransportOptionsExample() {
    TransportOptions options = new TransportOptions()
            .setModel("qwen3-coder-flash")
            .setPermissionMode(PermissionMode.AUTO_EDIT)
            .setCwd("./")
            .setEnv(new HashMap<String, String>() {{put("CUSTOM_VAR", "value");}})
            .setIncludePartialMessages(true)
            .setTurnTimeout(new Timeout(120L, TimeUnit.SECONDS))
            .setMessageTimeout(new Timeout(90L, TimeUnit.SECONDS))
            .setAllowedTools(Arrays.asList("read_file", "write_file", "list_directory"));

    List<String> result = QwenCodeCli.simpleQuery("who are you, what are your capabilities?", options);
    result.forEach(logger::info);
}
```

Für die Behandlung von Streaming-Inhalten mit benutzerdefinierten Content-Consumern:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThinkingAssistantContent thinkingAssistantContent) {
                    logger.info("Thinking content received: {}", thinkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Tool use content received: {} with arguments: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Tool result content received: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Other content received: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Usage information received: Input tokens: {}, Output tokens: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Streaming example completed.");
}
```

Weitere Beispiele siehe src/test/java/com/alibaba/qwen/code/cli/example

## Java-11-Migration und Alpha-Einschränkungen

`0.1.0-alpha` erhöht die Mindest-Java-Version für das gesamte Artifact von 8 auf 11. Java-8-Anwendungen müssen bei `0.0.3-alpha` bleiben. Logback ist keine Runtime-Abhängigkeit mehr; füge den SLF4J-Provider hinzu, den deine Anwendung verwendet.

Diese Alpha schlägt absichtlich fail-closed zu, wenn sie kein Prompt-Terminal nachweisen kann. Sie garantiert keine Exactly-once-Ausführung über Daemon-Neustarts hinweg, keine automatische Epoch-Wiederherstellung, kein Snapshot/Resync, keine persistenten Cursor und keine echte, auf Prompt-IDs gezielte Cancellation. `prompt_cancelled` und Queue-Events sind informativ; nur passende `turn_complete` und `turn_error` sind terminal.

Wenn die Session-Erstellung ein mehrdeutiges Transportergebnis hat, kann der Daemon eine Session behalten, deren ID den Aufrufer nie erreicht hat. Das SDK wiederholt die Erstellung nicht und kann diese unbekannte Session nicht abtrennen; das Daemon-seitige Lifecycle-Reaping ist die Wiederherstellungsgrenze.

## Architektur

Das Artifact enthält zwei isolierte Implementierungen:

- **Daemon-API**: `DaemonClient` und `DaemonSessionClient` verwenden REST-Mutationen sowie resumierbares SSE und besitzen begrenzte HTTP-, Prompt-, Wartungs- und Timer-Ressourcen.
- **Legacy-stdio-API**: `QwenCodeCli`, `Session` und `ProcessTransport` verwalten einen Kind-CLI-Prozess mit den bestehenden CLI-Protokoll-DTOs und Hilfsprogrammen.

Die Daemon-Implementierung verwendet nicht den Legacy-Prozesstransport, das Legacy-Session-Modell, Legacy-DTOs oder den globalen Executor erneut.

## Legacy-stdio-Features

### Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden verweigert, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Genehmigt Edit-Tools (`edit`, `write_file`, `notebook_edit`) automatisch, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Session-Event-Consumer und Assistant-Content-Consumer

Das SDK bietet zwei Schlüsselschnittstellen zur Behandlung von Events und Inhalten aus dem CLI:

#### SessionEventConsumers-Interface

Das `SessionEventConsumers`-Interface bietet Callbacks für verschiedene Nachrichtentypen während einer Session:

- `onSystemMessage`: Behandelt Systemnachrichten aus dem CLI (empfängt Session und SDKSystemMessage)
- `onResultMessage`: Behandelt Ergebnisnachrichten aus dem CLI (empfängt Session und SDKResultMessage)
- `onAssistantMessage`: Behandelt Assistant-Nachrichten (KI-Antworten) (empfängt Session und SDKAssistantMessage)
- `onPartialAssistantMessage`: Behandelt partielle Assistant-Nachrichten beim Streaming (empfängt Session und SDKPartialAssistantMessage)
- `onUserMessage`: Behandelt Benutzernachrichten (empfängt Session und SDKUserMessage)
- `onOtherMessage`: Behandelt andere Nachrichtentypen (empfängt Session und String-Nachricht)
- `onControlResponse`: Behandelt Control-Antworten (empfängt Session und CLIControlResponse)
- `onControlRequest`: Behandelt Control-Anfragen (empfängt Session und CLIControlRequest, gibt CLIControlResponse zurück)
- `onPermissionRequest`: Behandelt Berechtigungsanfragen (empfängt Session und CLIControlRequest<CLIControlPermissionRequest>, gibt Behavior zurück)

#### AssistantContentConsumers-Interface

Das `AssistantContentConsumers`-Interface behandelt verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten:

- `onText`: Behandelt Textinhalte (empfängt Session und TextAssistantContent)
- `onThinking`: Behandelt Thinking-Inhalte (empfängt Session und ThinkingAssistantContent)
- `onToolUse`: Behandelt Tool-Use-Inhalte (empfängt Session und ToolUseAssistantContent)
- `onToolResult`: Behandelt Tool-Result-Inhalte (empfängt Session und ToolResultAssistantContent)
- `onOtherContent`: Behandelt andere Inhaltstypen (empfängt Session und AssistantContent)
- `onUsage`: Behandelt Nutzungsinformationen (empfängt Session und AssistantUsage)
- `onPermissionRequest`: Behandelt Berechtigungsanfragen (empfängt Session und CLIControlPermissionRequest, gibt Behavior zurück)
- `onOtherControlRequest`: Behandelt andere Control-Anfragen (empfängt Session und ControlRequestPayload, gibt ControlResponsePayload zurück)

#### Beziehung zwischen den Interfaces

**Wichtiger Hinweis zur Event-Hierarchie:**

- `SessionEventConsumers` ist der **High-Level**-Event-Prozessor, der verschiedene Nachrichtentypen verarbeitet (System, Assistant, Benutzer usw.)
- `AssistantContentConsumers` ist der **Low-Level**-Content-Prozessor, der verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten verarbeitet (Text, Tools, Thinking usw.)

**Prozessor-Beziehung:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers verwendet AssistantContentConsumers zur Verarbeitung von Inhalten innerhalb von Assistant-Nachrichten)

**Event-Ableitungs-Beziehungen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Event-Timeout-Beziehungen:**

Jede Event-Handler-Methode hat eine entsprechende Timeout-Methode, die es ermöglicht, das Timeout-Verhalten für dieses spezifische Event anzupassen:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Für AssistantContentConsumers-Timeout-Methoden:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Standard-Timeout-Werte:**

- `SessionEventSimpleConsumers`-Standard-Timeout: 180 Sekunden (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers`-Standard-Timeout: 60 Sekunden (Timeout.TIMEOUT_60_SECONDS)

**Timeout-Hierarchie-Anforderungen:**

Für den ordnungsgemäßen Betrieb sollten die folgenden Timeout-Beziehungen eingehalten werden:

- Der Rückgabewert von `onAssistantMessageTimeout` sollte größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`
- Der Rückgabewert von `onControlRequestTimeout` sollte größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`

### Transportoptionen

Die `TransportOptions`-Klasse ermöglicht die Konfiguration, wie das SDK mit dem Qwen Code CLI kommuniziert:

- `pathToQwenExecutable`: Pfad zur ausführbaren Qwen Code CLI-Datei
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess
- `model`: KI-Modell, das für die Session verwendet werden soll
- `permissionMode`: Berechtigungsmodus, der die Tool-Ausführung steuert
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden
- `maxSessionTurns`: Begrenzt die Anzahl der Konversations-Turns in einer Session
- `coreTools`: Liste der Core-Tools, die der KI zur Verfügung stehen sollen
- `excludeTools`: Liste der Tools, die der KI nicht zur Verfügung stehen sollen
- `allowedTools`: Liste der Tools, die ohne zusätzliche Bestätigung vorab genehmigt sind
- `authType`: Authentifizierungstyp, der für die Session verwendet werden soll
- `includePartialMessages`: Aktiviert den Empfang partieller Nachrichten bei Streaming-Antworten
- `turnTimeout`: Timeout für einen vollständigen Konversations-Turn
- `messageTimeout`: Timeout für einzelne Nachrichten innerhalb eines Turns
- `resumeSessionId`: ID einer vorherigen Session, die fortgesetzt werden soll
- `otherOptions`: Zusätzliche Befehlszeilenoptionen, die an das CLI übergeben werden

### Session-Control-Features

- **Session-Erstellung**: Verwende `QwenCodeCli.newSession()`, um eine neue Session mit benutzerdefinierten Optionen zu erstellen
- **Session-Verwaltung**: Die `Session`-Klasse bietet Methoden zum Senden von Prompts, zur Behandlung von Antworten und zur Verwaltung des Session-Zustands
- **Session-Bereinigung**: Schließe Sessions immer mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden
- **Session-Fortsetzung**: Verwende `setResumeSessionId()` in `TransportOptions`, um eine vorherige Session fortzusetzen
- **Session-Unterbrechung**: Verwende `session.interrupt()`, um einen aktuell laufenden Prompt zu unterbrechen
- **Dynamischer Modellwechsel**: Verwende `session.setModel()`, um das Modell während einer Session zu wechseln
- **Dynamischer Berechtigungsmodus-Wechsel**: Verwende `session.setPermissionMode()`, um den Berechtigungsmodus während einer Session zu ändern

### Thread-Pool-Konfiguration

Das SDK verwendet einen Thread-Pool zur Verwaltung gleichzeitiger Operationen mit folgender Standardkonfiguration:

- **Core Pool Size**: 30 Threads
- **Maximum Pool Size**: 100 Threads
- **Keep-Alive Time**: 60 Sekunden
- **Queue-Kapazität**: 300 Tasks (mit LinkedBlockingQueue)
- **Thread-Benennung**: "qwen_code_cli-pool-{number}"
- **Daemon-Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## Fehlerbehandlung

Das SDK bietet spezifische Exception-Typen für verschiedene Fehlerszenarien:

- `SessionControlException`: Wird geworfen, wenn ein Problem mit der Session-Steuerung auftritt (Erstellung, Initialisierung usw.)
- `SessionSendPromptException`: Wird geworfen, wenn ein Problem beim Senden eines Prompts oder Empfangen einer Antwort auftritt
- `SessionClosedException`: Wird geworfen, wenn versucht wird, eine geschlossene Session zu verwenden

## FAQ / Fehlerbehebung

### F: Muss ich das Qwen-CLI separat installieren?

A: Ja. Die Daemon-API erfordert einen kompatiblen `qwen serve`; die Legacy-stdio-API
erfordert qwen-code 0.5.0 oder höher.

### F: Welche Java-Versionen werden unterstützt?

A: `0.1.0-alpha` erfordert Java 11 oder höher. Java-8-Benutzer müssen bei `0.0.3-alpha` bleiben.

### F: Wie gehe ich mit langlaufenden Anfragen um?

A: Das SDK enthält Timeout-Hilfsprogramme. Du kannst Timeouts mit der `Timeout`-Klasse in `TransportOptions` konfigurieren.

### F: Warum werden manche Tools nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungsmodi. Überprüfe deine Berechtigungsmodus-Einstellungen und erwäge die Verwendung von `allowedTools`, um bestimmte Tools vorab zu genehmigen.

### F: Wie setze ich eine vorherige Session fort?

A: Verwende die `setResumeSessionId()`-Methode in `TransportOptions`, um eine vorherige Session fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwende die `setEnv()`-Methode in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 - siehe [LICENSE](../../LICENSE) für Details.
