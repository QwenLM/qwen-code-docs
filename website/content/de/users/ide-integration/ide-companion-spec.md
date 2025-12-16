# Qwen Code Companion Plugin: Schnittstellenspezifikation

> Zuletzt aktualisiert: 15. September 2025

Dieses Dokument definiert den Vertrag für die Erstellung eines Begleit-Plugins zur Aktivierung des IDE-Modus von Qwen Code. Für VS Code werden diese Funktionen (natives Diffing, Kontextbewusstsein) durch die offizielle Erweiterung bereitgestellt ([Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Mitwirkende, die ähnliche Funktionalitäten für andere Editoren wie JetBrains IDEs, Sublime Text usw. bereitstellen möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transportschicht: MCP über HTTP

Das Plugin **MUSS** einen lokalen HTTP-Server ausführen, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein gültiger MCP-Server sein. Wir empfehlen, falls verfügbar, ein vorhandenes MCP-SDK für Ihre gewählte Sprache zu verwenden.
- **Endpunkt:** Der Server sollte einen einzigen Endpunkt (z. B. `/mcp`) für die gesamte MCP-Kommunikation bereitstellen.
- **Port:** Der Server **MUSS** auf einem dynamisch zugewiesenen Port lauschen (d. h. auf Port `0` lauschen).

### 2. Erkennungsmechanismus: Die Port-Datei

Damit Qwen Code eine Verbindung herstellen kann, muss es erkennen, in welcher IDE-Instanz es ausgeführt wird und welchen Port Ihr Server verwendet. Das Plugin **MUSS** dies unterstützen, indem es eine „Erkennungsdatei“ erstellt.

- **Wie die CLI die Datei findet:** Die CLI ermittelt die Prozess-ID (PID) der IDE, in der sie ausgeführt wird, indem sie den Prozessbaum durchläuft. Anschließend sucht sie nach einer Erkennungsdatei, deren Name diese PID enthält.
- **Speicherort der Datei:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `os.tmpdir()/qwen/ide/`. Ihr Plugin muss dieses Verzeichnis erstellen, falls es nicht bereits existiert.
- **Namenskonvention für die Datei:** Der Dateiname ist entscheidend und **MUSS** dem folgenden Muster entsprechen:
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}`: Die Prozess-ID des übergeordneten IDE-Prozesses. Ihr Plugin muss diese PID ermitteln und im Dateinamen verwenden.
  - `${PORT}`: Der Port, auf dem Ihr MCP-Server lauscht.
- **Dateiinhalt & Arbeitsbereichsvalidierung:** Die Datei **MUSS** ein JSON-Objekt mit folgender Struktur enthalten:

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
  - `workspacePath` (Zeichenkette, erforderlich): Eine Liste aller geöffneten Arbeitsbereichs-Wurzelpfade, getrennt durch das betriebssystemspezifische Pfadtrennzeichen (`:` für Linux/macOS, `;` für Windows). Die CLI nutzt diesen Pfad, um sicherzustellen, dass sie im gleichen Projektordner ausgeführt wird, der auch in der IDE geöffnet ist. Wenn das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Ihr Plugin **MUSS** die korrekten, absoluten Pfade zu den Wurzelverzeichnissen der geöffneten Arbeitsbereiche bereitstellen.
  - `authToken` (Zeichenkette, erforderlich): Ein geheimer Token zur Absicherung der Verbindung. Die CLI fügt diesen Token in einen `Authorization: Bearer <token>` Header aller Anfragen ein.
  - `ideInfo` (Objekt, erforderlich): Informationen über die IDE.
    - `name` (Zeichenkette, erforderlich): Ein kurzer, kleingeschriebener Bezeichner für die IDE (z. B. `vscode`, `jetbrains`).
    - `displayName` (Zeichenkette, erforderlich): Ein benutzerfreundlicher Name für die IDE (z. B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Zur Sicherung der Verbindung **MUSS** das Plugin einen eindeutigen, geheimen Token generieren und ihn in die Erkennungsdatei einfügen. Die CLI fügt diesen Token dann in den `Authorization`-Header aller Anfragen an den MCP-Server ein (z. B. `Authorization: Bearer a-very-secret-token`). Ihr Server **MUSS** diesen Token bei jeder Anfrage validieren und alle nicht autorisierten Anfragen ablehnen.
- **Entscheidungshilfe durch Umgebungsvariablen (empfohlen):** Für ein zuverlässiges Erlebnis **SOLLTE** Ihr Plugin sowohl die Erkennungsdatei erstellen als auch die Umgebungsvariable `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal setzen. Die Datei dient als primärer Erkennungsmechanismus, aber die Umgebungsvariable ist entscheidend zur Auflösung von Mehrdeutigkeiten. Wenn ein Benutzer mehrere IDE-Fenster für denselben Arbeitsbereich geöffnet hat, verwendet die CLI die Variable `QWEN_CODE_IDE_SERVER_PORT`, um das richtige Fenster und dessen Server zu identifizieren und sich damit zu verbinden.

## II. Das Kontext-Interface

Um Kontextbewusstsein zu ermöglichen, **KANN** das Plugin die CLI mit Echtzeit-Informationen über die Aktivität des Benutzers in der IDE versorgen.

### `ide/contextUpdate`-Benachrichtigung

Das Plugin **KANN** eine `ide/contextUpdate`-[Benachrichtigung](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, sobald sich der Kontext des Benutzers ändert.

- **Auslösende Ereignisse:** Diese Benachrichtigung sollte gesendet werden (mit einem empfohlenen Debounce von 50 ms), wenn:
  - Eine Datei geöffnet, geschlossen oder fokussiert wird.
  - Die Cursorposition oder Textauswahl des Benutzers in der aktiven Datei sich ändert.
- **Nutzdaten (`IdeContext`):** Die Parameter der Benachrichtigung **MÜSSEN** ein `IdeContext`-Objekt sein:

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
    // Zuletzt fokussierter Unix-Zeitstempel (zur Sortierung)
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

  **Hinweis:** Die Liste `openFiles` sollte nur Dateien enthalten, die auf der Festplatte existieren. Virtuelle Dateien (z. B. ungespeicherte Dateien ohne Pfad, Einstellungsseiten des Editors) **MÜSSEN** ausgeschlossen werden.

### Wie die CLI diesen Kontext verwendet

Nach Erhalt des `IdeContext`-Objekts führt die CLI mehrere Normalisierungs- und Kürzungsschritte durch, bevor die Informationen an das Modell gesendet werden.

- **Dateianordnung:** Die CLI verwendet das Feld `timestamp`, um die zuletzt verwendeten Dateien zu bestimmen. Sie sortiert die Liste `openFiles` basierend auf diesem Wert. Daher **MUSS** Ihr Plugin einen genauen Unix-Zeitstempel dafür bereitstellen, wann eine Datei zuletzt fokussiert war.
- **Aktive Datei:** Die CLI betrachtet nur die neueste Datei (nach der Sortierung) als „aktive“ Datei. Sie ignoriert das Flag `isActive` für alle anderen Dateien und löscht deren Felder `cursor` und `selectedText`. Ihr Plugin sollte sich darauf konzentrieren, `isActive: true` zu setzen und Cursor-/Auswahldetails nur für die aktuell fokussierte Datei bereitzustellen.
- **Kürzung:** Um die Token-Begrenzungen einzuhalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den `selectedText` (auf 16 KB).

Obwohl die CLI die endgültige Kürzung übernimmt, wird dringend empfohlen, dass Ihr Plugin auch die Menge des gesendeten Kontexts begrenzt.

## III. Die Diffing-Schnittstelle

Um interaktive Code-Änderungen zu ermöglichen, **KANN** das Plugin eine Diffing-Schnittstelle bereitstellen. Dies erlaubt es der CLI, vom IDE ein Diff-Ansicht zu öffnen, welche die vorgeschlagenen Änderungen an einer Datei anzeigt. Der Benutzer kann diese Änderungen dann direkt innerhalb des IDE überprüfen, bearbeiten und letztendlich akzeptieren oder ablehnen.

### `openDiff`-Tool

Das Plugin **MUSS** ein `openDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine änderbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Anfrage (`OpenDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das `arguments`-Feld innerhalb der `params` der Anfrage **MUSS** ein `OpenDiffRequest`-Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // Der absolute Pfad zur Datei, die verglichen werden soll.
    filePath: string;
    // Der vorgeschlagene neue Inhalt der Datei.
    newContent: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** sofort ein `CallToolResult` zurückgeben, um die Anfrage zu bestätigen und zu melden, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geöffnet wurde, **MUSS** die Antwort leeren Inhalt enthalten (d. h. `content: []`).
  - Bei Fehler: Falls ein Fehler das Öffnen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array mit einer Beschreibung des Fehlers beinhalten.

  Das tatsächliche Ergebnis des Diffs (Annahme oder Ablehnung) wird asynchron über Benachrichtigungen kommuniziert.

### `closeDiff`-Tool

Das Plugin **MUSS** ein `closeDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine geöffnete Diff-Ansicht für eine bestimmte Datei zu schließen.
- **Anfrage (`CloseDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das `arguments`-Feld innerhalb der `params` der Anfrage **MUSS** ein `CloseDiffRequest`-Objekt sein.

  ```typescript
  interface CloseDiffRequest {
    // Der absolute Pfad zur Datei, deren Diff-Ansicht geschlossen werden soll.
    filePath: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** ein `CallToolResult` zurückgeben.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geschlossen wurde, **MUSS** die Antwort einen einzelnen **TextContent**-Block im Inhaltsarray enthalten, der den endgültigen Inhalt der Datei vor dem Schließen enthält.
  - Bei Fehler: Wenn ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array mit einer Beschreibung des Fehlers beinhalten.

### `ide/diffAccepted`-Benachrichtigung

Wenn der Benutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf eine Schaltfläche wie „Anwenden“ oder „Speichern“), **MUSS** das Plugin eine `ide/diffAccepted`-Benachrichtigung an die CLI senden.

- **Nutzdaten:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad und den endgültigen Inhalt der Datei enthalten. Der Inhalt kann sich von dem ursprünglichen `newContent` unterscheiden, wenn der Benutzer manuelle Änderungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die verglichen wurde.
    filePath: string;
    // Der vollständige Inhalt der Datei nach der Annahme.
    content: string;
  }
  ```

### `ide/diffRejected`-Benachrichtigung

Wenn der Benutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne Annahme), **MUSS** das Plugin eine `ide/diffRejected`-Benachrichtigung an die CLI senden.

- **Nutzdaten:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad des abgelehnten Diffs enthalten.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die verglichen wurde.
    filePath: string;
  }
  ```

## IV. Die Lifecycle-Schnittstelle

Das Plugin **MUSS** seine Ressourcen und die Discovery-Datei korrekt basierend auf dem Lifecycle der IDE verwalten.

- **Bei Aktivierung (Start der IDE / Plugin aktiviert):**
  1.  Starte den MCP-Server.
  2.  Erstelle die Discovery-Datei.
- **Bei Deaktivierung (Beenden der IDE / Plugin deaktiviert):**
  1.  Stoppe den MCP-Server.
  2.  Lösche die Discovery-Datei.