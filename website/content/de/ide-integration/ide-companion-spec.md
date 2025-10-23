# Qwen Code Companion Plugin: Interface Specification

> Zuletzt aktualisiert: 15. September 2025

Dieses Dokument definiert den Vertrag für die Erstellung eines Companion-Plugins, um den IDE-Modus von Qwen Code zu aktivieren. Für VS Code werden diese Funktionen (native Diffing, Kontextbewusstsein) durch die offizielle Erweiterung bereitgestellt ([Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Mitwirkende, die ähnliche Funktionalitäten für andere Editoren wie JetBrains IDEs, Sublime Text usw. bereitstellen möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transport Layer: MCP über HTTP

Das Plugin **MUSS** einen lokalen HTTP-Server betreiben, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein gültiger MCP-Server sein. Wir empfehlen, falls verfügbar, ein bestehendes MCP-SDK für die jeweilige Sprache zu verwenden.
- **Endpunkt:** Der Server sollte einen einzigen Endpunkt (z. B. `/mcp`) für die gesamte MCP-Kommunikation bereitstellen.
- **Port:** Der Server **MUSS** auf einem dynamisch zugewiesenen Port lauschen (d. h. auf Port `0` lauschen).

### 2. Discovery-Mechanismus: Die Port-Datei

Damit Qwen Code sich verbinden kann, muss es zunächst herausfinden, in welcher IDE-Instanz es läuft und auf welchem Port dein Server aktiv ist. Das Plugin **muss** dies durch das Erstellen einer sogenannten „Discovery-Datei“ ermöglichen.

- **Wie die CLI die Datei findet:** Die CLI ermittelt die Prozess-ID (PID) der IDE, in der sie läuft, indem sie den Prozessbaum durchläuft. Anschließend sucht sie nach einer Discovery-Datei, deren Name diese PID enthält.
- **Speicherort der Datei:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `os.tmpdir()/qwen/ide/`. Dein Plugin muss dieses Verzeichnis ggf. selbst anlegen, falls es noch nicht existiert.
- **Namenskonvention der Datei:** Der Dateiname ist entscheidend und **muss** folgendem Muster entsprechen:
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}`: Die Prozess-ID des übergeordneten IDE-Prozesses. Dein Plugin muss diese PID ermitteln und im Dateinamen verwenden.
  - `${PORT}`: Der Port, auf dem dein MCP-Server läuft.
- **Dateiinhalt & Workspace-Validierung:** Die Datei **muss** ein JSON-Objekt mit folgender Struktur enthalten:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port` (Zahl, erforderlich): Der Port des MCP-Servers.
  - `workspacePath` (String, erforderlich): Eine Liste aller geöffneten Workspace-Root-Pfade, getrennt durch das betriebssystemspezifische Pfadtrennzeichen (`:` für Linux/macOS, `;` für Windows). Die CLI nutzt diesen Pfad, um sicherzustellen, dass sie im gleichen Projektordner läuft wie die IDE. Wenn das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Dein Plugin **muss** die korrekten, absoluten Pfade zu den Root-Verzeichnissen der offenen Workspaces bereitstellen.
  - `authToken` (String, erforderlich): Ein geheimer Token zur Absicherung der Verbindung. Die CLI wird diesen Token in einem `Authorization: Bearer <token>` Header bei allen Requests mitsenden.
  - `ideInfo` (Objekt, erforderlich): Informationen zur IDE.
    - `name` (String, erforderlich): Ein kurzer, kleingeschriebener Bezeichner für die IDE (z. B. `vscode`, `jetbrains`).
    - `displayName` (String, erforderlich): Ein benutzerfreundlicher Name für die IDE (z. B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Um die Verbindung abzusichern, **muss** das Plugin einen eindeutigen, geheimen Token generieren und diesen in die Discovery-Datei eintragen. Die CLI wird diesen Token in den `Authorization` Header aller Requests an den MCP-Server einfügen (z. B. `Authorization: Bearer a-very-secret-token`). Dein Server **muss** diesen Token bei jedem Request validieren und nicht autorisierte Anfragen ablehnen.
- **Tie-Breaking mit Umgebungsvariablen (empfohlen):** Für ein zuverlässiges Verhalten **sollte** dein Plugin sowohl die Discovery-Datei erstellen als auch die Umgebungsvariable `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal setzen. Die Datei dient als primärer Discovery-Mechanismus, die Umgebungsvariable ist jedoch entscheidend für die eindeutige Zuordnung. Wenn ein Benutzer mehrere IDE-Fenster für denselben Workspace geöffnet hat, nutzt die CLI die `QWEN_CODE_IDE_SERVER_PORT` Variable, um den korrekten Server des jeweiligen Fensters zu identifizieren und sich mit ihm zu verbinden.

## II. Das Context Interface

Um Context Awareness zu ermöglichen, **KANN** das Plugin die CLI mit Echtzeit-Informationen über die Aktivität des Benutzers in der IDE versorgen.

### `ide/contextUpdate` Notification

Das Plugin **KANN** eine `ide/contextUpdate` [Notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, sobald sich der Kontext des Benutzers ändert.

- **Auslösende Ereignisse:** Diese Notification sollte gesendet werden (mit einem empfohlenen Debounce von 50 ms), wenn:
  - Eine Datei geöffnet, geschlossen oder fokussiert wird.
  - Die Cursorposition oder Textauswahl des Benutzers in der aktiven Datei sich ändert.
- **Payload (`IdeContext`):** Die Parameter der Notification **MÜSSEN** ein `IdeContext`-Objekt sein:

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absoluter Pfad zur Datei
    path: string;
    // Zeitstempel des letzten Fokus (für Sortierung)
    timestamp: number;
    // True, wenn dies die aktuell fokussierte Datei ist
    isActive?: boolean;
    cursor?: {
      // 1-basierte Zeilennummer
      line: number;
      // 1-basierte Zeichennummer
      character: number;
    };
    // Der vom Benutzer aktuell ausgewählte Text
    selectedText?: string;
  }
  ```

  **Hinweis:** Die Liste `openFiles` sollte nur Dateien enthalten, die auf der Festplatte existieren. Virtuelle Dateien (z. B. ungespeicherte Dateien ohne Pfad, Einstellungsseiten des Editors) **MÜSSEN** ausgeschlossen werden.

### Wie die CLI diesen Kontext verwendet

Nach Erhalt des `IdeContext`-Objekts führt die CLI mehrere Normalisierungs- und Kürzungsschritte durch, bevor die Informationen an das Modell gesendet werden.

- **Dateisortierung:** Die CLI verwendet das Feld `timestamp`, um die zuletzt verwendeten Dateien zu bestimmen. Sie sortiert die Liste `openFiles` basierend auf diesem Wert. Daher **MUSS** dein Plugin einen genauen Unix-Zeitstempel dafür bereitstellen, wann eine Datei zuletzt fokussiert war.
- **Aktive Datei:** Die CLI betrachtet nur die neueste Datei (nach der Sortierung) als "aktive" Datei. Sie ignoriert das Flag `isActive` aller anderen Dateien und löscht deren Felder `cursor` und `selectedText`. Dein Plugin sollte sich darauf konzentrieren, `isActive: true` zu setzen und Cursor-/Auswahldetails nur für die aktuell fokussierte Datei bereitzustellen.
- **Kürzung:** Um die Token-Limits einzuhalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den `selectedText` (auf 16 KB).

Auch wenn die CLI die endgültige Kürzung übernimmt, wird dringend empfohlen, dass dein Plugin ebenfalls die Menge des gesendeten Kontexts begrenzt.

## III. Das Diffing-Interface

Um interaktive Code-Änderungen zu ermöglichen, **KANN** das Plugin ein Diffing-Interface bereitstellen. Dies erlaubt es der CLI, vom IDE ein Diff-View zu öffnen, welches vorgeschlagene Änderungen an einer Datei anzeigt. Der Benutzer kann diese Änderungen dann direkt im IDE überprüfen, bearbeiten und letztendlich akzeptieren oder ablehnen.

### `openDiff` Tool

Das Plugin **MUSS** ein `openDiff` Tool auf seinem MCP Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine modifizierbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Anfrage (`OpenDiffRequest`):** Das Tool wird über eine `tools/call` Anfrage aufgerufen. Das `arguments` Feld innerhalb der `params` der Anfrage **MUSS** ein `OpenDiffRequest` Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // Der absolute Pfad zur Datei, die verglichen werden soll.
    filePath: string;
    // Der vorgeschlagene neue Inhalt der Datei.
    newContent: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** sofort ein `CallToolResult` zurückgeben, um die Anfrage zu bestätigen und zu melden, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geöffnet wurde, **MUSS** die Antwort leeren Inhalt enthalten (d.h. `content: []`).
  - Bei Fehler: Falls ein Fehler das Öffnen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent` Block im `content` Array mit einer Beschreibung des Fehlers beinhalten.

  Das tatsächliche Ergebnis des Diffs (Annahme oder Ablehnung) wird asynchron über Notifications kommuniziert.

### `closeDiff` Tool

Das Plugin **MUSS** ein `closeDiff` Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine offene Diff-Ansicht für eine bestimmte Datei zu schließen.
- **Anfrage (`CloseDiffRequest`):** Das Tool wird über eine `tools/call` Anfrage aufgerufen. Das `arguments` Feld innerhalb der `params` der Anfrage **MUSS** ein `CloseDiffRequest` Objekt sein.

  ```typescript
  interface CloseDiffRequest {
    // Der absolute Pfad zur Datei, deren Diff-Ansicht geschlossen werden soll.
    filePath: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** ein `CallToolResult` zurückgeben.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geschlossen wurde, **MUSS** die Antwort einen einzelnen **TextContent** Block im `content` Array enthalten, der den finalen Inhalt der Datei vor dem Schließen enthält.
  - Bei Fehler: Wenn ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent` Block im `content` Array mit einer Beschreibung des Fehlers beinhalten.

### `ide/diffAccepted` Notification

Wenn der Benutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf einen „Apply“- oder „Save“-Button), **MUST** das Plugin eine `ide/diffAccepted` Notification an die CLI senden.

- **Payload:** Die Notification-Parameter **MUST** den Dateipfad und den finalen Inhalt der Datei enthalten. Der Inhalt kann sich von dem ursprünglichen `newContent` unterscheiden, wenn der Benutzer manuelle Änderungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die diffed wurde.
    filePath: string;
    // Der vollständige Inhalt der Datei nach der Akzeptanz.
    content: string;
  }
  ```

### `ide/diffRejected` Notification

Wenn der Benutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne Akzeptanz), **MUST** das Plugin eine `ide/diffRejected` Notification an die CLI senden.

- **Payload:** Die Notification-Parameter **MUST** den Dateipfad des abgelehnten Diffs enthalten.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die diffed wurde.
    filePath: string;
  }
  ```

## IV. Das Lifecycle Interface

Das Plugin **MUSS** seine Ressourcen und die Discovery-Datei korrekt basierend auf dem Lifecycle der IDE verwalten.

- **Bei Aktivierung (IDE-Start/Plugin aktiviert):**
  1.  Starte den MCP-Server.
  2.  Erstelle die Discovery-Datei.
- **Bei Deaktivierung (IDE-Shutdown/Plugin deaktiviert):**
  1.  Stoppe den MCP-Server.
  2.  Lösche die Discovery-Datei.