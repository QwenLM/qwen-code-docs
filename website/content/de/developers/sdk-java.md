# Qwen Code Java SDK

Das Qwen Code Java SDK ist ein minimales experimentelles SDK für den programmatischen Zugriff auf die Qwen Code-Funktionalität. Es bietet eine Java-Schnittstelle zur Interaktion mit der Qwen Code CLI, sodass Entwickler Qwen Code-Funktionen in ihre Java-Anwendungen integrieren können.

## Requirements

- Java >= 1.8
- Maven >= 3.6.0 (für das Erstellen aus dem Quellcode)
- qwen-code >= 0.5.0

### Dependencies

- **Logging**: ch.qos.logback:logback-classic
- **Utilities**: org.apache.commons:commons-lang3
- **JSON Processing**: com.alibaba.fastjson2:fastjson2
- **Testing**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Fügen Sie die folgende Abhängigkeit zu Ihrer Maven `pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Oder fügen Sie bei Verwendung von Gradle Folgendes zu Ihrer `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Building and Running

### Build Commands

```bash
# Compile the project
mvn compile

# Run tests
mvn test

# Package the JAR
mvn package

# Install to local repository
mvn install
```

## Quick Start

Der einfachste Weg, das SDK zu nutzen, ist die Methode `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Für fortgeschrittenere Anwendungen mit benutzerdefinierten Transportoptionen:

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

Für die Streaming-Content-Verarbeitung mit benutzerdefinierten Content-Consumern:

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

Weitere Beispiele finden Sie unter src/test/java/com/alibaba/qwen/code/cli/example

## Architecture

Das SDK folgt einer mehrschichtigen Architektur:

- **API Layer**: Bietet die Haupteinstiegspunkte über die Klasse `QwenCodeCli` mit einfachen statischen Methoden für die grundlegende Nutzung
- **Session Layer**: Verwaltet Kommunikationssitzungen mit der Qwen Code CLI über die Klasse `Session`
- **Transport Layer**: Handhabt den Kommunikationsmechanismus zwischen dem SDK und dem CLI-Prozess (derzeit über Prozess-Transport mittels `ProcessTransport`)
- **Protocol Layer**: Definiert Datenstrukturen für die Kommunikation basierend auf dem CLI-Protokoll
- **Utils**: Allgemeine Hilfsprogramme für parallele Ausführung, Timeout-Handling und Fehlermanagement

## Key Features

### Permission Modes

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:
- **`default`**: Schreibwerkzeuge werden verweigert, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Schreibgeschützte Werkzeuge werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreibwerkzeuge und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Genehmigt Bearbeitungswerkzeuge (`edit`, `write_file`, `notebook_edit`) automatisch, während andere Werkzeuge eine Bestätigung erfordern.
- **`yolo`**: Alle Werkzeuge werden automatisch ohne Bestätigung ausgeführt.

### Verbraucher von Sitzungsereignissen und Verbraucher von Assistenteninhalten

Das SDK bietet zwei wichtige Schnittstellen für die Verarbeitung von Ereignissen und Inhalten von der CLI:

#### SessionEventConsumers-Schnittstelle

Die `SessionEventConsumers`-Schnittstelle bietet Callbacks für verschiedene Arten von Nachrichten während einer Sitzung:

- `onSystemMessage`: Behandelt Systemnachrichten von der CLI (erhält Session und SDKSystemMessage)
- `onResultMessage`: Behandelt Ergebnismeldungen von der CLI (erhält Session und SDKResultMessage)
- `onAssistantMessage`: Behandelt Assistentennachrichten (KI-Antworten) (erhält Session und SDKAssistantMessage)
- `onPartialAssistantMessage`: Behandelt partielle Assistentennachrichten während des Streamings (erhält Session und SDKPartialAssistantMessage)
- `onUserMessage`: Behandelt Benutzernachrichten (erhält Session und SDKUserMessage)
- `onOtherMessage`: Behandelt andere Arten von Nachrichten (erhält Session und String-Nachricht)
- `onControlResponse`: Behandelt Steuerungsantworten (erhält Session und CLIControlResponse)
- `onControlRequest`: Behandelt Steuerungsanfragen (erhält Session und CLIControlRequest, gibt CLIControlResponse zurück)
- `onPermissionRequest`: Behandelt Berechtigungsanfragen (erhält Session und CLIControlRequest<CLIControlPermissionRequest>, gibt Behavior zurück)

#### AssistantContentConsumers-Schnittstelle

Die `AssistantContentConsumers`-Schnittstelle behandelt verschiedene Arten von Inhalten innerhalb von Assistentennachrichten:

- `onText`: Behandelt Textinhalte (erhält Session und TextAssistantContent)
- `onThinking`: Behandelt Denkinhalte (erhält Session und ThinkingAssistantContent)
- `onToolUse`: Behandelt Werkzeugnutzungsinhalte (erhält Session und ToolUseAssistantContent)
- `onToolResult`: Behandelt Werkzeugergebnisinhalte (erhält Session und ToolResultAssistantContent)
- `onOtherContent`: Behandelt andere Inhaltstypen (erhält Session und AssistantContent)
- `onUsage`: Behandelt Nutzungsinformationen (erhält Session und AssistantUsage)
- `onPermissionRequest`: Behandelt Berechtigungsanfragen (erhält Session und CLIControlPermissionRequest, gibt Behavior zurück)
- `onOtherControlRequest`: Behandelt andere Steuerungsanfragen (erhält Session und ControlRequestPayload, gibt ControlResponsePayload zurück)

#### Beziehung zwischen den Schnittstellen

**Wichtiger Hinweis zur Ereignishierarchie:**

- `SessionEventConsumers` ist der **übergeordnete** Ereignisprozessor, der verschiedene Nachrichtentypen (System, Assistent, Benutzer usw.) verarbeitet.
- `AssistantContentConsumers` ist der **untergeordnete** Inhaltsprozessor, der verschiedene Inhaltstypen innerhalb von Assistentennachrichten (Text, Werkzeuge, Denken usw.) verarbeitet.

**Prozessorbeziehung:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers verwendet AssistantContentConsumers, um Inhalte innerhalb von Assistentennachrichten zu verarbeiten)

**Ableitungsbeziehungen von Ereignissen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Timeout-Beziehungen von Ereignissen:**

Jede Ereignisbehandlungsmethode hat eine entsprechende Timeout-Methode, die eine Anpassung des Timeout-Verhaltens für dieses spezifische Ereignis ermöglicht:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Für die Timeout-Methoden von AssistantContentConsumers:

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

- Der Rückgabewert von `onAssistantMessageTimeout` sollte größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`.
- Der Rückgabewert von `onControlRequestTimeout` sollte größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`.
### Transportoptionen

Die `TransportOptions`-Klasse ermöglicht die Konfiguration der Kommunikation des SDKs mit der Qwen Code CLI:

- `pathToQwenExecutable`: Pfad zur ausführbaren Datei der Qwen Code CLI
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess
- `model`: KI-Modell, das für die Sitzung verwendet werden soll
- `permissionMode`: Berechtigungsmodus, der die Werkzeugausführung steuert
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden sollen
- `maxSessionTurns`: Begrenzt die Anzahl der Gesprächswechsel in einer Sitzung
- `coreTools`: Liste der Kernwerkzeuge, die der KI zur Verfügung stehen sollen
- `excludeTools`: Liste der Werkzeuge, die von der Verfügbarkeit für die KI ausgeschlossen werden sollen
- `allowedTools`: Liste der Werkzeuge, die für die Verwendung ohne zusätzliche Bestätigung vorab genehmigt sind
- `authType`: Authentifizierungstyp für die Sitzung
- `includePartialMessages`: Aktiviert den Empfang von Teilnachrichten während Streaming-Antworten
- `turnTimeout`: Zeitüberschreitung für einen vollständigen Gesprächswechsel
- `messageTimeout`: Zeitüberschreitung für einzelne Nachrichten innerhalb eines Wechsels
- `resumeSessionId`: ID einer vorherigen Sitzung, die fortgesetzt werden soll
- `otherOptions`: Zusätzliche Befehlszeilenoptionen, die an die CLI übergeben werden sollen

### Funktionen zur Sitzungssteuerung

- **Sitzungserstellung**: Verwenden Sie `QwenCodeCli.newSession()`, um eine neue Sitzung mit benutzerdefinierten Optionen zu erstellen.
- **Sitzungsverwaltung**: Die `Session`-Klasse bietet Methoden zum Senden von Eingabeaufforderungen, Verarbeiten von Antworten und Verwalten des Sitzungsstatus.
- **Sitzungsbereinigung**: Schließen Sie Sitzungen immer mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden.
- **Sitzungsfortsetzung**: Verwenden Sie `setResumeSessionId()` in `TransportOptions`, um eine frühere Sitzung fortzusetzen.
- **Sitzungsunterbrechung**: Verwenden Sie `session.interrupt()`, um eine aktuell laufende Eingabeaufforderung zu unterbrechen.
- **Dynamischer Modellwechsel**: Verwenden Sie `session.setModel()`, um das Modell während einer Sitzung zu ändern.
- **Dynamischer Berechtigungsmoduswechsel**: Verwenden Sie `session.setPermissionMode()`, um den Berechtigungsmodus während einer Sitzung zu ändern.

### Thread-Pool-Konfiguration

Das SDK verwendet einen Thread-Pool zur Verwaltung gleichzeitiger Operationen mit der folgenden Standardkonfiguration:

- **Kerngröße des Thread-Pools**: 30 Threads
- **Maximale Poolgröße**: 100 Threads
- **Keep-Alive-Zeit**: 60 Sekunden
- **Warteschlangenkapazität**: 300 Aufgaben (mittels LinkedBlockingQueue)
- **Thread-Benennung**: "qwen_code_cli-pool-{number}"
- **Daemon-Threads**: false
- **Behandlung abgelehnter Ausführung**: CallerRunsPolicy

## Fehlerbehandlung

Das SDK bietet spezifische Ausnahmetypen für verschiedene Fehlerszenarien:

- `SessionControlException`: Wird ausgelöst, wenn ein Problem mit der Sitzungssteuerung (Erstellung, Initialisierung usw.) vorliegt.
- `SessionSendPromptException`: Wird ausgelöst, wenn ein Problem beim Senden einer Eingabeaufforderung oder beim Empfangen einer Antwort auftritt.
- `SessionClosedException`: Wird ausgelöst, wenn versucht wird, eine geschlossene Sitzung zu verwenden.

## FAQ / Fehlerbehebung

### F: Muss ich die Qwen CLI separat installieren?

A: Ja, es wird Qwen CLI 0.5.5 oder höher benötigt.

### F: Welche Java-Versionen werden unterstützt?

A: Das SDK erfordert Java 1.8 oder höher.

### F: Wie behandle ich langlaufende Anfragen?

A: Das SDK enthält Zeitüberschreitungshilfsprogramme. Sie können Zeitüberschreitungen mit der `Timeout`-Klasse in `TransportOptions` konfigurieren.

### F: Warum werden einige Werkzeuge nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungsmodi. Überprüfen Sie Ihre Berechtigungsmoduseinstellungen und erwägen Sie die Verwendung von `allowedTools`, um bestimmte Werkzeuge vorab zu genehmigen.

### F: Wie setze ich eine vorherige Sitzung fort?

A: Verwenden Sie die Methode `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwenden Sie die Methode `setEnv()` in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 – siehe [LICENSE](../../LICENSE) für Details.
