# Qwen Code Java SDK

Das Qwen Code Java SDK ist ein minimales, experimentelles SDK für den programmatischen Zugriff auf Qwen Code-Funktionen. Es bietet eine Java-Schnittstelle zur Interaktion mit der Qwen Code CLI und ermöglicht es Entwicklern, Qwen Code-Funktionen in ihre Java-Anwendungen zu integrieren.

## Anforderungen

- Java >= 1.8
- Maven >= 3.6.0 (zum Erstellen aus dem Quellcode)
- qwen-code >= 0.5.0

### Abhängigkeiten

- **Logging**: ch.qos.logback:logback-classic
- **Hilfsklassen**: org.apache.commons:commons-lang3
- **JSON-Verarbeitung**: com.alibaba.fastjson2:fastjson2
- **Tests**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Füge die folgende Abhängigkeit zu deiner Maven `pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Oder füge bei Verwendung von Gradle Folgendes zu deiner `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Erstellen und Ausführen

### Build-Befehle

```bash
# Projekt kompilieren
mvn compile

# Tests ausführen
mvn test

# JAR paketieren
mvn package

# Im lokalen Repository installieren
mvn install
```

## Schnellstart

Der einfachste Weg, das SDK zu verwenden, ist die `QwenCodeCli.simpleQuery()`-Methode:

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

Für die Verarbeitung von Streaming-Inhalten mit benutzerdefinierten Content-Consumern:

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

Weitere Beispiele findest du unter `src/test/java/com/alibaba/qwen/code/cli/example`.

## Architektur

Das SDK folgt einer schichtbasierten Architektur:

- **API-Schicht**: Bietet die Haupteinstiegspunkte über die `QwenCodeCli`-Klasse mit einfachen statischen Methoden für die grundlegende Nutzung
- **Session-Schicht**: Verwaltet Kommunikationssitzungen mit der Qwen Code CLI über die `Session`-Klasse
- **Transport-Schicht**: Handhabt den Kommunikationsmechanismus zwischen dem SDK und dem CLI-Prozess (derzeit über Prozess-Transport via `ProcessTransport`)
- **Protokoll-Schicht**: Definiert Datenstrukturen für die Kommunikation basierend auf dem CLI-Protokoll
- **Utils**: Allgemeine Hilfsklassen für parallele Ausführung, Timeout-Verwaltung und Fehlerbehandlung

## Hauptfunktionen

### Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden abgelehnt, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist die KI an, zunächst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungs-Tools (`edit`, `write_file`) werden automatisch genehmigt, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Session-Event-Consumer und Assistant-Content-Consumer

Das SDK bietet zwei zentrale Schnittstellen zur Verarbeitung von Events und Inhalten der CLI:

#### SessionEventConsumers-Schnittstelle

Die `SessionEventConsumers`-Schnittstelle bietet Callbacks für verschiedene Nachrichtentypen während einer Session:

- `onSystemMessage`: Verarbeitet Systemnachrichten der CLI (erhält Session und SDKSystemMessage)
- `onResultMessage`: Verarbeitet Ergebnisnachrichten der CLI (erhält Session und SDKResultMessage)
- `onAssistantMessage`: Verarbeitet Assistant-Nachrichten (KI-Antworten) (erhält Session und SDKAssistantMessage)
- `onPartialAssistantMessage`: Verarbeitet partielle Assistant-Nachrichten während des Streamings (erhält Session und SDKPartialAssistantMessage)
- `onUserMessage`: Verarbeitet Benutzernachrichten (erhält Session und SDKUserMessage)
- `onOtherMessage`: Verarbeitet andere Nachrichtentypen (erhält Session und String-Nachricht)
- `onControlResponse`: Verarbeitet Steuerungsantworten (erhält Session und CLIControlResponse)
- `onControlRequest`: Verarbeitet Steuerungsanfragen (erhält Session und CLIControlRequest, gibt CLIControlResponse zurück)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (erhält Session und CLIControlRequest<CLIControlPermissionRequest>, gibt Behavior zurück)

#### AssistantContentConsumers-Schnittstelle

Die `AssistantContentConsumers`-Schnittstelle verarbeitet verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten:

- `onText`: Verarbeitet Textinhalte (erhält Session und TextAssistantContent)
- `onThinking`: Verarbeitet Denk-Inhalte (erhält Session und ThinkingAssistantContent)
- `onToolUse`: Verarbeitet Tool-Nutzungsinhalte (erhält Session und ToolUseAssistantContent)
- `onToolResult`: Verarbeitet Tool-Ergebnisinhalte (erhält Session und ToolResultAssistantContent)
- `onOtherContent`: Verarbeitet andere Inhaltstypen (erhält Session und AssistantContent)
- `onUsage`: Verarbeitet Nutzungsinformationen (erhält Session und AssistantUsage)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (erhält Session und CLIControlPermissionRequest, gibt Behavior zurück)
- `onOtherControlRequest`: Verarbeitet andere Steuerungsanfragen (erhält Session und ControlRequestPayload, gibt ControlResponsePayload zurück)

#### Beziehung zwischen den Schnittstellen

**Wichtiger Hinweis zur Event-Hierarchie:**

- `SessionEventConsumers` ist der **High-Level**-Event-Prozessor, der verschiedene Nachrichtentypen (System, Assistant, Benutzer usw.) verarbeitet
- `AssistantContentConsumers` ist der **Low-Level**-Inhaltsprozessor, der verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten (Text, Tools, Denken usw.) verarbeitet

**Verarbeiter-Beziehung:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers verwendet AssistantContentConsumers zur Verarbeitung von Inhalten innerhalb von Assistant-Nachrichten)

**Event-Ableitungsbeziehungen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Event-Timeout-Beziehungen:**

Jede Event-Handler-Methode verfügt über eine entsprechende Timeout-Methode, die das Timeout-Verhalten für dieses spezifische Event anpassbar macht:

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

- `SessionEventSimpleConsumers` Standard-Timeout: 180 Sekunden (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` Standard-Timeout: 60 Sekunden (Timeout.TIMEOUT_60_SECONDS)

**Anforderungen an die Timeout-Hierarchie:**

Für einen ordnungsgemäßen Betrieb sollten die folgenden Timeout-Beziehungen eingehalten werden:

- Der Rückgabewert von `onAssistantMessageTimeout` sollte größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`
- Der Rückgabewert von `onControlRequestTimeout` sollte größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`

### Transportoptionen

Die `TransportOptions`-Klasse ermöglicht die Konfiguration der Kommunikation zwischen dem SDK und der Qwen Code CLI:

- `pathToQwenExecutable`: Pfad zur ausführbaren Datei der Qwen Code CLI
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess
- `model`: Für die Session zu verwendendes KI-Modell
- `permissionMode`: Berechtigungsmodus, der die Tool-Ausführung steuert
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden
- `maxSessionTurns`: Begrenzt die Anzahl der Konversationsrunden in einer Session
- `coreTools`: Liste der Kern-Tools, die der KI zur Verfügung stehen sollen
- `excludeTools`: Liste der Tools, die der KI nicht zur Verfügung stehen sollen
- `allowedTools`: Liste der Tools, die ohne zusätzliche Bestätigung vorab genehmigt sind
- `authType`: Für die Session zu verwendender Authentifizierungstyp
- `includePartialMessages`: Aktiviert den Empfang partieller Nachrichten während Streaming-Antworten
- `turnTimeout`: Timeout für eine vollständige Konversationsrunde
- `messageTimeout`: Timeout für einzelne Nachrichten innerhalb einer Runde
- `resumeSessionId`: ID einer vorherigen Session, die fortgesetzt werden soll
- `otherOptions`: Zusätzliche Befehlszeilenoptionen, die an die CLI übergeben werden

### Session-Steuerungsfunktionen

- **Session-Erstellung**: Verwende `QwenCodeCli.newSession()`, um eine neue Session mit benutzerdefinierten Optionen zu erstellen
- **Session-Verwaltung**: Die `Session`-Klasse bietet Methoden zum Senden von Prompts, Verarbeiten von Antworten und Verwalten des Session-Status
- **Session-Bereinigung**: Schließe Sessions immer mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden
- **Session-Fortsetzung**: Verwende `setResumeSessionId()` in `TransportOptions`, um eine vorherige Session fortzusetzen
- **Session-Unterbrechung**: Verwende `session.interrupt()`, um einen aktuell laufenden Prompt zu unterbrechen
- **Dynamisches Modellwechseln**: Verwende `session.setModel()`, um das Modell während einer Session zu ändern
- **Dynamisches Wechseln des Berechtigungsmodus**: Verwende `session.setPermissionMode()`, um den Berechtigungsmodus während einer Session zu ändern

### Thread-Pool-Konfiguration

Das SDK verwendet einen Thread-Pool zur Verwaltung paralleler Operationen mit folgender Standardkonfiguration:

- **Core Pool Size**: 30 Threads
- **Maximum Pool Size**: 100 Threads
- **Keep-Alive Time**: 60 Sekunden
- **Queue Capacity**: 300 Tasks (unter Verwendung von LinkedBlockingQueue)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## Fehlerbehandlung

Das SDK bietet spezifische Exception-Typen für verschiedene Fehlerszenarien:

- `SessionControlException`: Wird ausgelöst, wenn ein Problem mit der Session-Steuerung (Erstellung, Initialisierung usw.) vorliegt
- `SessionSendPromptException`: Wird ausgelöst, wenn ein Problem beim Senden eines Prompts oder Empfangen einer Antwort vorliegt
- `SessionClosedException`: Wird ausgelöst, wenn versucht wird, eine geschlossene Session zu verwenden

## FAQ / Fehlerbehebung

### F: Muss die Qwen CLI separat installiert werden?

A: Ja, es ist Qwen CLI 0.5.5 oder höher erforderlich.

### F: Welche Java-Versionen werden unterstützt?

A: Das SDK erfordert Java 1.8 oder höher.

### F: Wie gehe ich mit lang laufenden Anfragen um?

A: Das SDK enthält Timeout-Hilfsklassen. Du kannst Timeouts über die `Timeout`-Klasse in `TransportOptions` konfigurieren.

### F: Warum werden einige Tools nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungsmodi. Überprüfe deine Einstellungen für den Berechtigungsmodus und erwäge die Verwendung von `allowedTools`, um bestimmte Tools vorab zu genehmigen.

### F: Wie setze ich eine vorherige Session fort?

A: Verwende die `setResumeSessionId()`-Methode in `TransportOptions`, um eine vorherige Session fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwende die `setEnv()`-Methode in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 – Details findest du in der [LICENSE](./LICENSE).