# Qwen Code Java SDK

Das Qwen Code Java SDK ist ein minimales experimentelles SDK für den programmatischen Zugriff auf die Funktionalität von Qwen Code. Es bietet eine Java-Schnittstelle zur Interaktion mit der Qwen Code CLI und ermöglicht es Entwicklern, Qwen Code-Funktionalitäten in ihre Java-Anwendungen zu integrieren.

## Anforderungen

- Java >= 1.8
- Maven >= 3.6.0 (für das Erstellen aus dem Quellcode)
- qwen-code >= 0.5.0

### Abhängigkeiten

- **Protokollierung**: ch.qos.logback:logback-classic
- **Hilfsprogramme**: org.apache.commons:commons-lang3
- **JSON-Verarbeitung**: com.alibaba.fastjson2:fastjson2
- **Tests**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Fügen Sie die folgende Abhängigkeit zu Ihrer Maven `pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Oder, falls Sie Gradle verwenden, fügen Sie zu Ihrer `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Bauen und Ausführen

### Build-Befehle

```bash
# Projekt kompilieren
mvn compile

# Tests ausführen
mvn test

# JAR packen
mvn package

# In lokales Repository installieren
mvn install
```

## Kurzstart

Der einfachste Weg, das SDK zu nutzen, ist die Methode `QwenCodeCli.simpleQuery()`:

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

Weitere Beispiele finden Sie unter `src/test/java/com/alibaba/qwen/code/cli/example`.

## Architektur

Das SDK folgt einer mehrschichtigen Architektur:

- **API-Schicht**: Stellt die Haupteinstiegspunkte über die Klasse `QwenCodeCli` mit einfachen statischen Methoden für die grundlegende Nutzung bereit.
- **Session-Schicht**: Verwaltet Kommunikationssitzungen mit der Qwen Code CLI über die Klasse `Session`.
- **Transport-Schicht**: Handhabt den Kommunikationsmechanismus zwischen dem SDK und dem CLI-Prozess (derzeit mittels Prozess-Transport über `ProcessTransport`).
- **Protokoll-Schicht**: Definiert Datenstrukturen für die Kommunikation basierend auf dem CLI-Protokoll.
- **Utils**: Gemeinsame Hilfsprogramme für nebenläufige Ausführung, Timeout-Behandlung und Fehlerverwaltung.

## Hauptfunktionen

### Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Werkzeugausführung:

- **`default`**: Schreib-Werkzeuge werden verweigert, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Schreibgeschützte Werkzeuge werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Werkzeuge und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Genehmigt automatisch Bearbeitungswerkzeuge (`edit`, `write_file`, `notebook_edit`), während andere Werkzeuge eine Bestätigung erfordern.
- **`yolo`**: Alle Werkzeuge werden automatisch ohne Bestätigung ausgeführt.

### Session-Event-Consumer und Assistant-Content-Consumer

Das SDK bietet zwei zentrale Schnittstellen zur Behandlung von Ereignissen und Inhalten aus der CLI:

#### Schnittstelle `SessionEventConsumers`

Die Schnittstelle `SessionEventConsumers` bietet Callbacks für verschiedene Nachrichtentypen während einer Sitzung:

- `onSystemMessage`: Behandelt Systemnachrichten von der CLI (erhält Session und SDKSystemMessage)
- `onResultMessage`: Behandelt Ergebnisnachrichten von der CLI (erhält Session und SDKResultMessage)
- `onAssistantMessage`: Behandelt Assistant-Nachrichten (KI-Antworten) (erhält Session und SDKAssistantMessage)
- `onPartialAssistantMessage`: Behandelt partielle Assistant-Nachrichten während des Streamings (erhält Session und SDKPartialAssistantMessage)
- `onUserMessage`: Behandelt Benutzernachrichten (erhält Session und SDKUserMessage)
- `onOtherMessage`: Behandelt andere Nachrichtentypen (erhält Session und String-Nachricht)
- `onControlResponse`: Behandelt Steuerungsantworten (erhält Session und CLIControlResponse)
- `onControlRequest`: Behandelt Steuerungsanfragen (erhält Session und CLIControlRequest, gibt CLIControlResponse zurück)
- `onPermissionRequest`: Behandelt Berechtigungsanfragen (erhält Session und CLIControlRequest<CLIControlPermissionRequest>, gibt Behavior zurück)

#### Schnittstelle `AssistantContentConsumers`

Die Schnittstelle `AssistantContentConsumers` behandelt verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten:

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

- `SessionEventConsumers` ist der **High-Level**-Ereignisprozessor, der verschiedene Nachrichtentypen (System, Assistant, Benutzer usw.) behandelt.
- `AssistantContentConsumers` ist der **Low-Level**-Inhaltsprozessor, der verschiedene Inhaltstypen innerhalb von Assistant-Nachrichten behandelt (Text, Werkzeuge, Denken usw.).

**Prozessor-Beziehung:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers verwendet AssistantContentConsumers, um Inhalte innerhalb von Assistant-Nachrichten zu verarbeiten)

**Ereignisableitungsbeziehungen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Ereignis-Timeout-Beziehungen:**

Jede Ereignisbehandlungsmethode hat eine entsprechende Timeout-Methode, die eine Anpassung des Timeout-Verhaltens für dieses spezifische Ereignis ermöglicht:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Für die Timeout-Methoden von `AssistantContentConsumers`:

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

Für einen ordnungsgemäßen Betrieb sollten die folgenden Timeout-Beziehungen eingehalten werden:

- Der Rückgabewert von `onAssistantMessageTimeout` sollte größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`.
- Der Rückgabewert von `onControlRequestTimeout` sollte größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`.

### Transportoptionen

Die Klasse `TransportOptions` ermöglicht die Konfiguration der Kommunikation zwischen dem SDK und der Qwen Code CLI:

- `pathToQwenExecutable`: Pfad zur ausführbaren Datei der Qwen Code CLI
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess
- `model`: KI-Modell, das für die Sitzung verwendet werden soll
- `permissionMode`: Berechtigungsmodus, der die Werkzeugausführung steuert
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden
- `maxSessionTurns`: Begrenzt die Anzahl der Gesprächswechsel in einer Sitzung
- `coreTools`: Liste der Kernwerkzeuge, die der KI zur Verfügung stehen sollen
- `excludeTools`: Liste der Werkzeuge, die von der Verfügbarkeit für die KI ausgeschlossen werden sollen
- `allowedTools`: Liste der Werkzeuge, die vorab ohne zusätzliche Bestätigung genehmigt sind
- `authType`: Authentifizierungstyp für die Sitzung
- `includePartialMessages`: Aktiviert den Empfang von Teilmeldungen während des Streamings von Antworten
- `turnTimeout`: Timeout für einen vollständigen Gesprächswechsel
- `messageTimeout`: Timeout für einzelne Nachrichten innerhalb eines Wechsels
- `resumeSessionId`: ID einer vorherigen Sitzung, die fortgesetzt werden soll
- `otherOptions`: Zusätzliche Befehlszeilenoptionen für die CLI

### Sitzungssteuerungsfunktionen

- **Sitzungserstellung**: Verwenden Sie `QwenCodeCli.newSession()`, um eine neue Sitzung mit benutzerdefinierten Optionen zu erstellen.
- **Sitzungsverwaltung**: Die Klasse `Session` bietet Methoden zum Senden von Prompts, Behandeln von Antworten und Verwalten des Sitzungszustands.
- **Sitzungsbereinigung**: Schließen Sie Sitzungen immer mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden.
- **Sitzungswiederaufnahme**: Verwenden Sie `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.
- **Sitzungsunterbrechung**: Verwenden Sie `session.interrupt()`, um einen aktuell laufenden Prompt zu unterbrechen.
- **Dynamischer Modellwechsel**: Verwenden Sie `session.setModel()`, um das Modell während einer Sitzung zu ändern.
- **Dynamischer Berechtigungsmoduswechsel**: Verwenden Sie `session.setPermissionMode()`, um den Berechtigungsmodus während einer Sitzung zu ändern.

### Thread-Pool-Konfiguration

Das SDK verwendet einen Thread-Pool zur Verwaltung nebenläufiger Operationen mit der folgenden Standardkonfiguration:

- **Core-Pool-Größe**: 30 Threads
- **Maximale Pool-Größe**: 100 Threads
- **Keep-Alive-Zeit**: 60 Sekunden
- **Warteschlangenkapazität**: 300 Aufgaben (unter Verwendung von LinkedBlockingQueue)
- **Thread-Benennung**: "qwen_code_cli-pool-{number}"
- **Daemon-Threads**: false
- **Abgelehnter Ausführungs-Handler**: CallerRunsPolicy

## Fehlerbehandlung

Das SDK bietet spezifische Ausnahmetypen für verschiedene Fehlerszenarien:

- `SessionControlException`: Wird ausgelöst, wenn ein Problem mit der Sitzungssteuerung vorliegt (Erstellung, Initialisierung usw.)
- `SessionSendPromptException`: Wird ausgelöst, wenn ein Problem beim Senden eines Prompts oder Empfangen einer Antwort auftritt
- `SessionClosedException`: Wird ausgelöst, wenn versucht wird, eine geschlossene Sitzung zu verwenden

## FAQ / Fehlerbehebung

### F: Muss ich die Qwen CLI separat installieren?

A: Ja, es wird Qwen CLI 0.5.5 oder höher benötigt.

### F: Welche Java-Versionen werden unterstützt?

A: Das SDK benötigt Java 1.8 oder höher.

### F: Wie behandle ich langlaufende Anfragen?

A: Das SDK enthält Timeout-Hilfsprogramme. Sie können Timeouts über die Klasse `Timeout` in `TransportOptions` konfigurieren.

### F: Warum werden einige Werkzeuge nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungsmodi. Überprüfen Sie Ihre Berechtigungsmoduseinstellungen und erwägen Sie die Verwendung von `allowedTools`, um bestimmte Werkzeuge vorab zu genehmigen.

### F: Wie kann ich eine vorherige Sitzung fortsetzen?

A: Verwenden Sie die Methode `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwenden Sie die Methode `setEnv()` in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 – siehe [LICENSE](../../LICENSE) für Details.