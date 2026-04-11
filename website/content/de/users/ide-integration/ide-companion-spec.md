# Qwen Code Companion Plugin: Schnittstellenspezifikation

> Zuletzt aktualisiert: 15. September 2025

Dieses Dokument definiert den Vertrag für die Entwicklung eines Companion-Plugins, um den IDE-Modus von Qwen Code zu aktivieren. Für VS Code werden diese Funktionen (natives Diffing, Kontextbewusstsein) von der offiziellen Extension bereitgestellt ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Contributoren, die ähnliche Funktionen in andere Editoren wie JetBrains IDEs, Sublime Text usw. integrieren möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transportschicht: MCP über HTTP

Das Plugin **MUSS** einen lokalen HTTP-Server ausführen, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein valider MCP-Server sein. Wir empfehlen die Verwendung eines bestehenden MCP SDK für deine bevorzugte Programmiersprache, falls verfügbar.
- **Endpoint:** Der Server sollte einen einzigen Endpoint (z. B. `/mcp`) für die gesamte MCP-Kommunikation bereitstellen.
- **Port:** Der Server **MUSS** auf einem dynamisch zugewiesenen Port lauschen (d. h. Port `0` verwenden).

### 2. Discovery-Mechanismus: Die Lock-Datei

Damit sich Qwen Code verbinden kann, muss es den Port deines Servers ermitteln. Das Plugin **MUSS** dies ermöglichen, indem es eine „Lock-Datei“ erstellt und die Port-Umgebungsvariable setzt.

- **Wie die CLI die Datei findet:** Die CLI liest den Port aus `QWEN_CODE_IDE_SERVER_PORT` und anschließend `~/.qwen/ide/<PORT>.lock`. (Es gibt Legacy-Fallbacks für ältere Extensions; siehe Hinweis unten.)
- **Dateipfad:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `~/.qwen/ide/`. Dein Plugin muss dieses Verzeichnis erstellen, falls es noch nicht existiert.
- **Namenskonvention:** Der Dateiname ist entscheidend und **MUSS** folgendem Muster entsprechen:
  `<PORT>.lock`
  - `<PORT>`: Der Port, auf dem dein MCP-Server lauscht.
- **Dateiinhalt & Workspace-Validierung:** Die Datei **MUSS** ein JSON-Objekt mit folgender Struktur enthalten:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, required): Der Port des MCP-Servers.
  - `workspacePath` (string, required): Eine Liste aller offenen Workspace-Root-Pfade, getrennt durch das betriebssystemspezifische Pfadtrennzeichen (`:` für Linux/macOS, `;` für Windows). Die CLI verwendet diesen Pfad, um sicherzustellen, dass sie im selben Projektordner ausgeführt wird, der in der IDE geöffnet ist. Wenn das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Dein Plugin **MUSS** den korrekten absoluten Pfad (oder die Pfade) zum Root des offenen Workspaces bereitstellen.
  - `authToken` (string, required): Ein geheimer Token zur Absicherung der Verbindung. Die CLI fügt diesen Token bei allen Anfragen in einen `Authorization: Bearer <token>`-Header ein.
  - `ppid` (number, required): Die Parent-Process-ID des IDE-Prozesses.
  - `ideName` (string, required): Ein benutzerfreundlicher Name für die IDE (z. B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Um die Verbindung abzusichern, **MUSS** das Plugin einen einzigartigen, geheimen Token generieren und in die Discovery-Datei aufnehmen. Die CLI fügt diesen Token anschließend in den `Authorization`-Header aller Anfragen an den MCP-Server ein (z. B. `Authorization: Bearer a-very-secret-token`). Dein Server **MUSS** diesen Token bei jeder Anfrage validieren und nicht autorisierte Anfragen ablehnen.
- **Umgebungsvariablen (Required):** Dein Plugin **MUSS** `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal setzen, damit die CLI die korrekte `<PORT>.lock`-Datei finden kann.

**Legacy-Hinweis:** Bei Extensions älter als v0.5.1 kann Qwen Code auf das Lesen von JSON-Dateien im System-Temp-Verzeichnis mit den Namen `qwen-code-ide-server-<PID>.json` oder `qwen-code-ide-server-<PORT>.json` zurückgreifen. Neue Integrationen sollten sich nicht auf diese Legacy-Dateien verlassen.

## II. Die Kontextschnittstelle

Um Kontextbewusstsein zu ermöglichen, **KANN** das Plugin der CLI Echtzeitinformationen über die Aktivitäten des Nutzers in der IDE bereitstellen.

### `ide/contextUpdate` Notification

Das Plugin **KANN** eine `ide/contextUpdate` [Notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, sobald sich der Kontext des Nutzers ändert.

- **Auslösende Ereignisse:** Diese Notification sollte gesendet werden (empfohlenes Debouncing von 50 ms), wenn:
  - eine Datei geöffnet, geschlossen oder fokussiert wird.
  - sich die Cursorposition oder die Textauswahl des Nutzers in der aktiven Datei ändert.
- **Payload (`IdeContext`):** Die Parameter der Notification **MÜSSEN** ein `IdeContext`-Objekt sein:

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absolute path to the file
    path: string;
    // Last focused Unix timestamp (for ordering)
    timestamp: number;
    // True if this is the currently focused file
    isActive?: boolean;
    cursor?: {
      // 1-based line number
      line: number;
      // 1-based character number
      character: number;
    };
    // The text currently selected by the user
    selectedText?: string;
  }
  ```

  **Hinweis:** Die `openFiles`-Liste sollte nur Dateien enthalten, die tatsächlich auf der Festplatte existieren. Virtuelle Dateien (z. B. ungespeicherte Dateien ohne Pfad, Editor-Einstellungsseiten) **MÜSSEN** ausgeschlossen werden.

### Wie die CLI diesen Kontext verwendet

Nach dem Empfang des `IdeContext`-Objekts führt die CLI mehrere Normalisierungs- und Kürzungsschritte durch, bevor sie die Informationen an das Modell sendet.

- **Dateisortierung:** Die CLI verwendet das `timestamp`-Feld, um die zuletzt verwendeten Dateien zu ermitteln. Sie sortiert die `openFiles`-Liste basierend auf diesem Wert. Daher **MUSS** dein Plugin einen genauen Unix-Timestamp für den Zeitpunkt des letzten Fokus einer Datei bereitstellen.
- **Aktive Datei:** Die CLI betrachtet nur die neueste Datei (nach der Sortierung) als „aktive“ Datei. Sie ignoriert das `isActive`-Flag bei allen anderen Dateien und leert deren `cursor`- und `selectedText`-Felder. Dein Plugin sollte sich darauf konzentrieren, `isActive: true` zu setzen und Cursor-/Auswahldetails nur für die aktuell fokussierte Datei bereitzustellen.
- **Kürzung (Truncation):** Um Token-Limits einzuhalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den `selectedText` (auf 16 KB).

Obwohl die CLI die finale Kürzung übernimmt, wird dringend empfohlen, dass auch dein Plugin die Menge des gesendeten Kontexts begrenzt.

## III. Die Diffing-Schnittstelle

Um interaktive Code-Änderungen zu ermöglichen, **KANN** das Plugin eine Diffing-Schnittstelle bereitstellen. Dies erlaubt der CLI, die IDE aufzufordern, eine Diff-Ansicht zu öffnen, die vorgeschlagene Änderungen an einer Datei anzeigt. Der Nutzer kann diese Änderungen dann direkt in der IDE prüfen, bearbeiten und schließlich akzeptieren oder ablehnen.

### `openDiff` Tool

Das Plugin **MUSS** ein `openDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine bearbeitbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Request (`OpenDiffRequest`):** Das Tool wird über einen `tools/call`-Request aufgerufen. Das `arguments`-Feld innerhalb der `params` des Requests **MUSS** ein `OpenDiffRequest`-Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **Response (`CallToolResult`):** Das Tool **MUSS** sofort ein `CallToolResult` zurückgeben, um den Request zu bestätigen und zu melden, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geöffnet wurde, **MUSS** die Response einen leeren Inhalt enthalten (d. h. `content: []`).
  - Bei Fehler: Wenn ein Fehler das Öffnen der Diff-Ansicht verhindert hat, **MUSS** die Response `isError: true` enthalten und einen `TextContent`-Block im `content`-Array beinhalten, der den Fehler beschreibt.

  Das tatsächliche Ergebnis des Diffs (Akzeptanz oder Ablehnung) wird asynchron über Notifications kommuniziert.

### `closeDiff` Tool

Das Plugin **MUSS** ein `closeDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine geöffnete Diff-Ansicht für eine bestimmte Datei zu schließen.
- **Request (`CloseDiffRequest`):** Das Tool wird über einen `tools/call`-Request aufgerufen. Das `arguments`-Feld innerhalb der `params` des Requests **MUSS** ein `CloseDiffRequest`-Objekt sein.

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **Response (`CallToolResult`):** Das Tool **MUSS** ein `CallToolResult` zurückgeben.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geschlossen wurde, **MUSS** die Response einen einzelnen **TextContent**-Block im Content-Array enthalten, der den finalen Inhalt der Datei vor dem Schließen beinhaltet.
  - Bei Fehler: Wenn ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUSS** die Response `isError: true` enthalten und einen `TextContent`-Block im `content`-Array beinhalten, der den Fehler beschreibt.

### `ide/diffAccepted` Notification

Wenn der Nutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf „Apply“ oder „Save“), **MUSS** das Plugin eine `ide/diffAccepted`-Notification an die CLI senden.

- **Payload:** Die Parameter der Notification **MÜSSEN** den Dateipfad und den finalen Inhalt der Datei enthalten. Der Inhalt kann vom ursprünglichen `newContent` abweichen, wenn der Nutzer manuelle Änderungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### `ide/diffRejected` Notification

Wenn der Nutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne Akzeptieren), **MUSS** das Plugin eine `ide/diffRejected`-Notification an die CLI senden.

- **Payload:** Die Parameter der Notification **MÜSSEN** den Dateipfad des abgelehnten Diffs enthalten.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. Die Lifecycle-Schnittstelle

Das Plugin **MUSS** seine Ressourcen und die Discovery-Datei korrekt basierend auf dem Lifecycle der IDE verwalten.

- **Bei Aktivierung (IDE-Start/Plugin aktiviert):**
  1.  Starte den MCP-Server.
  2.  Erstelle die Discovery-Datei.
- **Bei Deaktivierung (IDE-Shutdown/Plugin deaktiviert):**
  1.  Stoppe den MCP-Server.
  2.  Lösche die Discovery-Datei.