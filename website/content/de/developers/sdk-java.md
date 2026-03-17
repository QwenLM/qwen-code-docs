# Qwen Code Java SDK

Das Qwen Code Java SDK ist ein experimentelles Mindest-SDK für den programmatischen Zugriff auf die Funktionen von Qwen Code. Es stellt eine Java-Schnittstelle zum Austausch mit der Qwen Code-Befehlszeilenschnittstelle (CLI) bereit und ermöglicht Entwicklern, Qwen Code-Funktionen in ihre Java-Anwendungen zu integrieren.

## Voraussetzungen

- Java >= 1.8
- Maven >= 3.6.0 (zum Kompilieren aus dem Quellcode)
- qwen-code >= 0.5.0

### Abhängigkeiten

- **Protokollierung**: ch.qos.logback:logback-classic
- **Hilfsfunktionen**: org.apache.commons:commons-lang3
- **JSON-Verarbeitung**: com.alibaba.fastjson2:fastjson2
- **Tests**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Fügen Sie die folgende Abhängigkeit zu Ihrer Maven-Datei `pom.xml` hinzu:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Oder bei Verwendung von Gradle fügen Sie die Abhängigkeit zu Ihrer Datei `build.gradle` hinzu:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Kompilieren und Ausführen

### Build-Befehle

```bash

# Projekt kompilieren
mvn compile

# Tests ausführen
mvn test

# JAR-Paket erstellen
mvn package

# In das lokale Repository installieren
mvn install

## Schnellstart

Die einfachste Möglichkeit, das SDK zu verwenden, ist die Methode `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Für erweiterte Anwendungsfälle mit benutzerdefinierten Transportoptionen:

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

    List<String> result = QwenCodeCli.simpleQuery("Wer bist du und welche Fähigkeiten besitzt du?", options);
    result.forEach(logger::info);
}
```

Für die Verarbeitung von Streaming-Inhalten mit benutzerdefinierten Content-Consumern:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("Wer bist du und welche Fähigkeiten besitzt du?",
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
                    logger.info("Tool-Aufruf empfangen: {} mit Argumenten: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Tool-Ergebnis empfangen: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Weiterer Inhalt empfangen: {}", other);
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

Weitere Beispiele finden Sie unter `src/test/java/com/alibaba/qwen/code/cli/example`.

## Architektur

Das SDK folgt einer geschichteten Architektur:

- **API-Schicht**: Stellt die zentralen Einstiegspunkte über die Klasse `QwenCodeCli` bereit, mit einfachen statischen Methoden für die grundlegende Nutzung  
- **Sitzungsschicht**: Verwaltet Kommunikationssitzungen mit der Qwen Code CLI über die Klasse `Session`  
- **Transport-Schicht**: Verantwortlich für den Kommunikationsmechanismus zwischen SDK und CLI-Prozess (derzeit wird ein Prozess-basierter Transport über `ProcessTransport` verwendet)  
- **Protokoll-Schicht**: Definiert Datenstrukturen für die Kommunikation basierend auf dem CLI-Protokoll  
- **Hilfsfunktionen (Utils)**: Allgemeine Hilfsfunktionen für nebenläufige Ausführung, Timeout-Handling und Fehlerbehandlung  

## Wichtige Funktionen

### Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools sind standardmäßig verboten, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` freigegeben. Lese-Only-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Alle Schreib-Tools werden blockiert; die KI wird angewiesen, zunächst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungs-Tools (z. B. `edit`, `write_file`) werden automatisch freigegeben, während alle anderen Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch und ohne Bestätigung ausgeführt.

### Sitzungsereignis-Consumer und Assistenten-Inhalts-Consumer

Das SDK stellt zwei zentrale Schnittstellen zur Verarbeitung von Ereignissen und Inhalten aus der CLI bereit:

#### Schnittstelle `SessionEventConsumers`

Die Schnittstelle `SessionEventConsumers` stellt Callbacks für verschiedene Nachrichtentypen während einer Sitzung bereit:

- `onSystemMessage`: Verarbeitet Systemnachrichten von der CLI (empfängt `Session` und `SDKSystemMessage`)
- `onResultMessage`: Verarbeitet Ergebnisnachrichten von der CLI (empfängt `Session` und `SDKResultMessage`)
- `onAssistantMessage`: Verarbeitet Assistentennachrichten (KI-Antworten) (empfängt `Session` und `SDKAssistantMessage`)
- `onPartialAssistantMessage`: Verarbeitet teilweise Assistentennachrichten während des Streamings (empfängt `Session` und `SDKPartialAssistantMessage`)
- `onUserMessage`: Verarbeitet Benachrichtigungen vom Benutzer (empfängt `Session` und `SDKUserMessage`)
- `onOtherMessage`: Verarbeitet andere Nachrichtentypen (empfängt `Session` und eine Zeichenfolge als Nachricht)
- `onControlResponse`: Verarbeitet Steuerungsantworten (empfängt `Session` und `CLIControlResponse`)
- `onControlRequest`: Verarbeitet Steuerungsanfragen (empfängt `Session` und `CLIControlRequest`, gibt `CLIControlResponse` zurück)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (empfängt `Session` und `CLIControlRequest<CLIControlPermissionRequest>`, gibt `Behavior` zurück)

#### `AssistantContentConsumers`-Schnittstelle

Die Schnittstelle `AssistantContentConsumers` verarbeitet verschiedene Inhaltsarten innerhalb von Assistenten-Nachrichten:

- `onText`: Verarbeitet Textinhalte (empfängt `Session` und `TextAssistantContent`)
- `onThinking`: Verarbeitet Denkinhalte (empfängt `Session` und `ThingkingAssistantContent`)
- `onToolUse`: Verarbeitet Tool-Aufrufe (empfängt `Session` und `ToolUseAssistantContent`)
- `onToolResult`: Verarbeitet Tool-Ergebnisse (empfängt `Session` und `ToolResultAssistantContent`)
- `onOtherContent`: Verarbeitet andere Inhaltsarten (empfängt `Session` und `AssistantContent`)
- `onUsage`: Verarbeitet Nutzungsdaten (empfängt `Session` und `AssistantUsage`)
- `onPermissionRequest`: Verarbeitet Berechtigungsanfragen (empfängt `Session` und `CLIControlPermissionRequest`, gibt `Behavior` zurück)
- `onOtherControlRequest`: Verarbeitet andere Steuerungsanfragen (empfängt `Session` und `ControlRequestPayload`, gibt `ControlResponsePayload` zurück)

#### Beziehung zwischen den Schnittstellen

**Wichtiger Hinweis zur Ereignishierarchie:**

- `SessionEventConsumers` ist der **hochgradige** Ereignisprozessor, der verschiedene Nachrichtentypen verarbeitet (System-, Assistenten-, Benutzer-Nachrichten usw.).
- `AssistantContentConsumers` ist der **niedriggradige** Inhaltsprozessor, der verschiedene Inhaltstypen innerhalb von Assistenten-Nachrichten verarbeitet (Text, Tools, Denkprozesse usw.).

**Beziehung zwischen den Prozessoren:**

- `SessionEventConsumers` → `AssistantContentConsumers` (`SessionEventConsumers` verwendet `AssistantContentConsumers`, um Inhalte innerhalb von Assistenten-Nachrichten zu verarbeiten.)

**Beziehungen bei der Ableitung von Ereignissen:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Beziehungen bei Ereignis-Timeouts:**

Jede Ereignishandler-Methode besitzt eine entsprechende Timeout-Methode, mit der das Timeout-Verhalten für dieses spezifische Ereignis angepasst werden kann:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Für `AssistantContentConsumers`-Timeout-Methoden:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Standard-Timeout-Werte:**

- Standard-Timeout für `SessionEventSimpleConsumers`: 180 Sekunden (`Timeout.TIMEOUT_180_SECONDS`)
- Standard-Timeout für `AssistantContentSimpleConsumers`: 60 Sekunden (`Timeout.TIMEOUT_60_SECONDS`)

**Anforderungen an die Timeout-Hierarchie:**

Für einen korrekten Betrieb müssen folgende Timeout-Beziehungen eingehalten werden:

- Der Rückgabewert von `onAssistantMessageTimeout` muss größer sein als die Rückgabewerte von `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` und `onOtherContentTimeout`.
- Der Rückgabewert von `onControlRequestTimeout` muss größer sein als die Rückgabewerte von `onPermissionRequestTimeout` und `onOtherControlRequestTimeout`.

### Transportoptionen

Die Klasse `TransportOptions` ermöglicht die Konfiguration der Kommunikation des SDK mit der Qwen Code-CLI:

- `pathToQwenExecutable`: Pfad zur ausführbaren Datei der Qwen Code-CLI  
- `cwd`: Arbeitsverzeichnis für den CLI-Prozess  
- `model`: KI-Modell, das für die Sitzung verwendet werden soll  
- `permissionMode`: Berechtigungsmodus, der die Ausführung von Tools steuert  
- `env`: Umgebungsvariablen, die an den CLI-Prozess übergeben werden  
- `maxSessionTurns`: Begrenzt die Anzahl der Gesprächsrunden innerhalb einer Sitzung  
- `coreTools`: Liste der Kern-Tools, die der KI zur Verfügung stehen sollen  
- `excludeTools`: Liste der Tools, die der KI nicht zur Verfügung gestellt werden sollen  
- `allowedTools`: Liste der Tools, die vorab ohne zusätzliche Bestätigung genutzt werden dürfen  
- `authType`: Authentifizierungstyp für die Sitzung  
- `includePartialMessages`: Aktiviert den Empfang partieller Nachrichten während des Streamings von Antworten  
- `turnTimeout`: Timeout für eine vollständige Gesprächsrunde  
- `messageTimeout`: Timeout für einzelne Nachrichten innerhalb einer Gesprächsrunde  
- `resumeSessionId`: ID einer vorherigen Sitzung, die fortgesetzt werden soll  
- `otherOptions`: Zusätzliche Befehlszeilenoptionen, die an die CLI übergeben werden

### Sitzungssteuerungsfunktionen

- **Sitzungserstellung**: Verwenden Sie `QwenCodeCli.newSession()`, um eine neue Sitzung mit benutzerdefinierten Optionen zu erstellen.
- **Sitzungsverwaltung**: Die Klasse `Session` stellt Methoden zum Senden von Eingabeaufforderungen, zum Verarbeiten von Antworten und zum Verwalten des Sitzungszustands bereit.
- **Sitzungsaufräumung**: Schließen Sie Sitzungen stets mit `session.close()`, um den CLI-Prozess ordnungsgemäß zu beenden.
- **Sitzungswiederaufnahme**: Verwenden Sie `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.
- **Sitzungsunterbrechung**: Verwenden Sie `session.interrupt()`, um eine aktuell ausgeführte Eingabeaufforderung zu unterbrechen.
- **Dynamisches Modellwechseln**: Verwenden Sie `session.setModel()`, um das Modell während einer Sitzung zu wechseln.
- **Dynamisches Wechseln des Berechtigungsmodus**: Verwenden Sie `session.setPermissionMode()`, um den Berechtigungsmodus während einer Sitzung zu ändern.

### Konfiguration des Threadpools

Das SDK verwendet einen Threadpool zur Verwaltung gleichzeitiger Operationen mit der folgenden Standardkonfiguration:

- **Kern-Threadanzahl**: 30 Threads  
- **Maximale Threadanzahl**: 100 Threads  
- **Keep-Alive-Zeit**: 60 Sekunden  
- **Warteschlangenkapazität**: 300 Aufgaben (mit `LinkedBlockingQueue`)  
- **Threadbenennung**: `qwen_code_cli-pool-{number}`  
- **Daemon-Threads**: `false`  
- **Handler für abgelehnte Ausführungen**: `CallerRunsPolicy`

## Fehlerbehandlung

Das SDK stellt spezifische Ausnahmetypen für verschiedene Fehlerfälle bereit:

- `SessionControlException`: Wird ausgelöst, wenn ein Problem mit der Sitzungssteuerung auftritt (Erstellung, Initialisierung usw.).  
- `SessionSendPromptException`: Wird ausgelöst, wenn beim Senden einer Eingabeaufforderung oder beim Empfangen einer Antwort ein Problem auftritt.  
- `SessionClosedException`: Wird ausgelöst, wenn versucht wird, eine bereits geschlossene Sitzung zu verwenden.

## FAQ / Fehlerbehebung

### F: Muss die Qwen CLI separat installiert werden?

A: Ja, es ist mindestens Qwen CLI 0.5.5 erforderlich.

### F: Welche Java-Versionen werden unterstützt?

A: Das SDK erfordert Java 1.8 oder höher.

### F: Wie behandle ich lang andauernde Anfragen?

A: Das SDK enthält Timeout-Hilfsfunktionen. Sie können Timeouts mithilfe der Klasse `Timeout` in `TransportOptions` konfigurieren.

### F: Warum werden einige Tools nicht ausgeführt?

A: Dies liegt wahrscheinlich an den Berechtigungseinstellungen. Überprüfen Sie Ihre Berechtigungsmoduseinstellungen und erwägen Sie die Verwendung von `allowedTools`, um bestimmte Tools vorab freizugeben.

### F: Wie kann ich eine vorherige Sitzung fortsetzen?

A: Verwenden Sie die Methode `setResumeSessionId()` in `TransportOptions`, um eine vorherige Sitzung fortzusetzen.

### F: Kann ich die Umgebung für den CLI-Prozess anpassen?

A: Ja, verwenden Sie die Methode `setEnv()` in `TransportOptions`, um Umgebungsvariablen an den CLI-Prozess zu übergeben.

## Lizenz

Apache-2.0 – Einzelheiten finden Sie in der [LIZENZ](./LICENSE).