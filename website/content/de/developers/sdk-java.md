# Qwen Code Java SDK

Das Qwen Code Java SDK ist ein experimentelles Mindest-SDK für den programmatischen Zugriff auf die Qwen Code-Funktionalitäten. Es bietet eine Java-Schnittstelle zur Interaktion mit der Qwen Code CLI und ermöglicht es Entwicklern, Qwen Code-Funktionen in ihre Java-Anwendungen zu integrieren.

## Voraussetzungen

- Java >= 1.8
- Maven >= 3.6.0 (zum Kompilieren aus dem Quellcode)
- qwen-code >= 0.5.0

### Abhängigkeiten

- **Logging**: ch.qos.logback:logback-classic
- **Utilities**: org.apache.commons:commons-lang3
- **JSON-Verarbeitung**: com.alibaba.fastjson2:fastjson2
- **Tests**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Fügen Sie folgende Abhängigkeit zu Ihrer Maven-Datei `pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Oder falls Sie Gradle verwenden, fügen Sie dies zu Ihrer `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Erstellen und Ausführen

### Build-Befehle

```bash

```markdown
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

Die einfachste Möglichkeit, das SDK zu verwenden, ist über die Methode `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Für fortgeschrittene Verwendung mit benutzerdefinierten Transportoptionen:

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
                    logger.info("Textinhalt empfangen: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Denkinhalt empfangen: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Werkzeugnutzungsinhalt empfangen: {} mit Argumenten: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Werkzeugergebnisinhalt empfangen: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Anderer Inhalt empfangen: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Nutzungsinformationen empfangen: Eingabetokens: {}, Ausgabetokens: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Streaming-Beispiel abgeschlossen.");
}
```

Weitere Beispiele finden Sie unter src/test/java/com/alibaba/qwen/code/cli/example

## Architektur

Das SDK folgt einer Schichtenarchitektur:

- **API-Schicht**: Stellt die Haupt-Einstiegspunkte über die Klasse `QwenCodeCli` mit einfachen statischen Methoden für die grundlegende Verwendung bereit
- **Session-Schicht**: Verwaltet Kommunikationssitzungen mit der Qwen Code CLI über die Klasse `Session`
- **Transport-Schicht**: Behandelt den Kommunikationsmechanismus zwischen dem SDK und dem CLI-Prozess (aktuell mittels Prozesstransport über `ProcessTransport`)
- **Protokoll-Schicht**: Definiert Datenstrukturen für die Kommunikation basierend auf dem CLI-Protokoll
- **Utils**: Gemeinsame Hilfsfunktionen für parallele Ausführung, Timeout-Behandlung und Fehlermanagement

## Wichtige Funktionen

### Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreibende Tools werden verweigert, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle schreibenden Tools und weist die KI an, zunächst einen Plan vorzustellen.
- **`auto-edit`**: Bearbeitungstools (edit, write_file) werden automatisch genehmigt, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Session-Ereignis-Consumer und Assistenten-Inhalts-Consumer

Das SDK stellt zwei wichtige Schnittstellen für die Verarbeitung von Ereignissen und Inhalten aus der CLI bereit:

#### SessionEventConsumers Interface

Das `SessionEventConsumers`-Interface stellt Callbacks für verschiedene Arten von Nachrichten während einer Sitzung bereit:

- `onSystemMessage`: Verarbeitet Systemnachrichten der CLI (erhält Session und SDKSystemMessage)
- `onResultMessage`: Verarbeitet Ergebnisnachrichten der CLI (erhält Session und SDKResultMessage)
- `onAssistantMessage`: Verarbeitet Assistentennachrichten (KI-Antworten) (erhält Session und SDKAssistantMessage)
- `onPartialAssistantMessage`: Verarbeitet teilweise Assistentennachrichten während des Streamings (erhält Session und SDKPartialAssistantMessage)
- `onUserMessage`: Verarbeitet Benutzernachrichten (erhält Session und SDKUserMessage)
- `onOtherMessage`: Verarbeitet andere Arten von Nachrichten (erhält Session und String-Nachricht)
- `onControlResponse`: Verarbeitet Steuerungsantworten (erhält Session und CLIControlResponse)
- `onControlRequest`: Verarbeitet Steuerungsanfragen (erhält Session und CLIControlRequest, gibt CLIControlResponse zurück)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (erhält Session und CLIControlRequest<CLIControlPermissionRequest>, gibt Behavior zurück)

#### AssistantContentConsumers-Schnittstelle

Die `AssistantContentConsumers`-Schnittstelle verarbeitet verschiedene Arten von Inhalten innerhalb von Assistentennachrichten:

- `onText`: Verarbeitet Textinhalte (erhält Session und TextAssistantContent)
- `onThinking`: Verarbeitet Denkinhalte (erhält Session und ThingkingAssistantContent)
- `onToolUse`: Verarbeitet Werkzeugnutzungsinhalte (erhält Session und ToolUseAssistantContent)
- `onToolResult`: Verarbeitet Werkzeugergebnis-Inhalte (erhält Session und ToolResultAssistantContent)
- `onOtherContent`: Verarbeitet andere Inhaltstypen (erhält Session und AssistantContent)
- `onUsage`: Verarbeitet Nutzungsinformationen (erhält Session und AssistantUsage)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (erhält Session und CLIControlPermissionRequest, gibt Behavior zurück)
- `onOtherControlRequest`: Verarbeitet andere Steuerungsanfragen (erhält Session und ControlRequestPayload, gibt ControlResponsePayload zurück)

#### Beziehung zwischen den Schnittstellen

**Wichtiger Hinweis zur Ereignishierarchie:**

- `SessionEventConsumers` ist der **hochstufige** Ereignisprozessor, der verschiedene Nachrichtentypen verarbeitet (System, Assistent, Benutzer usw.)
- `AssistantContentConsumers` ist der **niedrigstufige** Inhaltsprozessor, der verschiedene Arten von Inhalten innerhalb von Assistentennachrichten verarbeitet (Text, Tools, Denken usw.)

**Prozessorbeziehung:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers verwendet AssistantContentConsumers zur Verarbeitung von Inhalten innerhalb von Assistentennachrichten)

**Ereignis-Ableitungsbeziehungen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Ereignis-Timeout-Beziehungen:**

Jede Ereignis-Handler-Methode hat eine entsprechende Timeout-Methode, die es ermöglicht, das Timeout-Verhalten für dieses spezifische Ereignis anzupassen:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Für AssistantContentConsumers Timeout-Methoden:

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

**Timeout-Hierarchie-Anforderungen:**

Für einen ordnungsgemäßen Betrieb sollten folgende Timeout-Beziehungen eingehalten werden:

- Der Rückgabewert von `onAssistantMessageTimeout` sollte größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`
- Der Rückgabewert von `onControlRequestTimeout` sollte größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`

### Transport-Optionen

Die Klasse `TransportOptions` ermöglicht die Konfiguration der Kommunikation des SDKs mit der Qwen Code CLI:

- `pathToQwenExecutable`: Pfad zur ausführbaren Qwen Code CLI-Datei
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess
- `model`: KI-Modell, das für die Sitzung verwendet werden soll
- `permissionMode`: Berechtigungsmodus, der die Tool-Ausführung steuert
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden sollen
- `maxSessionTurns`: Begrenzt die Anzahl der Gesprächsrunden in einer Sitzung
- `coreTools`: Liste der Kern-Tools, die der KI zur Verfügung stehen sollen
- `excludeTools`: Liste der Tools, die für die KI nicht verfügbar sein sollen
- `allowedTools`: Liste der Tools, die vorab zur Nutzung ohne zusätzliche Bestätigung genehmigt sind
- `authType`: Authentifizierungstyp, der für die Sitzung verwendet werden soll
- `includePartialMessages`: Aktiviert den Empfang teilweiser Nachrichten während Stream-Antworten
- `skillsEnable`: Aktiviert oder deaktiviert die Skills-Funktionalität für die Sitzung
- `turnTimeout`: Timeout für eine vollständige Gesprächsrunde
- `messageTimeout`: Timeout für einzelne Nachrichten innerhalb einer Runde
- `resumeSessionId`: ID einer vorherigen Sitzung, die fortgesetzt werden soll
- `otherOptions`: Zusätzliche Befehlszeilenoptionen, die an die CLI übergeben werden sollen

### Sitzungssteuerungsfunktionen

- **Sitzungserstellung**: Verwenden Sie `QwenCodeCli.newSession()`, um eine neue Sitzung mit benutzerdefinierten Optionen zu erstellen
- **Sitzungsverwaltung**: Die `Session`-Klasse bietet Methoden zum Senden von Prompts, Behandeln von Antworten und Verwalten des Sitzungszustands
- **Sitzungsbereinigung**: Schließen Sie Sitzungen immer mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden
- **Sitzungswiederaufnahme**: Verwenden Sie `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen
- **Sitzungsunterbrechung**: Verwenden Sie `session.interrupt()`, um ein aktuell laufendes Prompt zu unterbrechen
- **Dynamischer Modellwechsel**: Verwenden Sie `session.setModel()`, um das Modell während einer Sitzung zu ändern
- **Dynamischer Berechtigungsmoduswechsel**: Verwenden Sie `session.setPermissionMode()`, um den Berechtigungsmodus während einer Sitzung zu ändern

### Thread-Pool-Konfiguration

Das SDK verwendet einen Thread-Pool zur Verwaltung gleichzeitiger Operationen mit der folgenden Standardkonfiguration:

- **Kern-Poolgröße**: 30 Threads
- **Maximale Poolgröße**: 100 Threads
- **Keep-Alive-Zeit**: 60 Sekunden
- **Warteschlangenkapazität**: 300 Aufgaben (unter Verwendung von LinkedBlockingQueue)
- **Thread-Benennung**: "qwen_code_cli-pool-{nummer}"
- **Daemon-Threads**: false
- **Behandlung abgelehnter Ausführungen**: CallerRunsPolicy

## Fehlerbehandlung

Das SDK stellt spezifische Ausnahmetypen für verschiedene Fehlerszenarien bereit:

- `SessionControlException`: Wird ausgelöst, wenn ein Problem mit der Sitzungssteuerung vorliegt (Erstellung, Initialisierung usw.)
- `SessionSendPromptException`: Wird ausgelöst, wenn ein Problem beim Senden einer Eingabeaufforderung oder beim Empfangen einer Antwort vorliegt
- `SessionClosedException`: Wird ausgelöst, wenn versucht wird, eine geschlossene Sitzung zu verwenden

## FAQ / Fehlerbehebung

### F: Muss ich die Qwen CLI separat installieren?

A: Ja, erfordert Qwen CLI 0.5.5 oder höher.

### F: Welche Java-Versionen werden unterstützt?

A: Das SDK erfordert Java 1.8 oder höher.

### F: Wie gehe ich mit lang laufenden Anfragen um?

A: Das SDK enthält Timeouthilfsprogramme. Sie können Timeouts mithilfe der Klasse `Timeout` in `TransportOptions` konfigurieren.

### F: Warum werden einige Tools nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungsmodi. Überprüfen Sie Ihre Berechtigungseinstellungen und erwägen Sie die Verwendung von `allowedTools`, um bestimmte Tools vorab zu genehmigen.

### F: Wie kann ich eine vorherige Sitzung fortsetzen?

A: Verwenden Sie die Methode `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwenden Sie die Methode `setEnv()` in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 – siehe [LIZENZ](./LICENSE) für Details.