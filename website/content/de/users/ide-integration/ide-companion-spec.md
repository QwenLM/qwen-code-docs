# Qwen Code Companion Plugin: Schnittstellenspezifikation

> Zuletzt aktualisiert: 15. September 2025

Dieses Dokument definiert den Vertrag für die Entwicklung eines Companion-Plugins, um den IDE-Modus von Qwen Code zu aktivieren. Für VS Code werden diese Funktionen (natives Diffing, Kontextbewusstsein) durch die offizielle Erweiterung bereitgestellt ([Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Mitwirkende, die ähnliche Funktionen für andere Editoren wie JetBrains IDEs, Sublime Text usw. bereitstellen möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transportschicht: MCP über HTTP

Das Plugin **MUSS** einen lokalen HTTP-Server ausführen, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein gültiger MCP-Server sein. Wir empfehlen, ein vorhandenes MCP-SDK für Ihre bevorzugte Sprache zu verwenden, falls verfügbar.
- **Endpunkt:** Der Server sollte einen einzelnen Endpunkt (z. B. `/mcp`) für die gesamte MCP-Kommunikation bereitstellen.
- **Port:** Der Server **MUSS** auf einem dynamisch zugewiesenen Port lauschen (d. h. auf Port `0`).

### 2. Entdeckungsmechanismus: Die Lock-Datei

Damit Qwen Code eine Verbindung herstellen kann, muss es den Port ermitteln, den Ihr Server verwendet. Das Plugin **MUSS** dies ermöglichen, indem es eine „Lock-Datei“ erstellt und die Port-Umgebungsvariable setzt.

- **Wie die CLI die Datei findet:** Die CLI liest den Port aus `QWEN_CODE_IDE_SERVER_PORT` und dann `~/.qwen/ide/<PORT>.lock`. (Für ältere Erweiterungen existieren Legacy-Fallbacks; siehe Hinweis unten.)
- **Dateispeicherort:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `~/.qwen/ide/`. Ihr Plugin muss dieses Verzeichnis erstellen, falls es nicht existiert.
- **Namenskonvention der Datei:** Der Dateiname ist entscheidend und **MUSS** dem folgenden Muster folgen:
  `<PORT>.lock`
  - `<PORT>`: Der Port, auf dem Ihr MCP-Server lauscht.
- **Dateiinhalt und Workspace-Validierung:** Die Datei **MUSS** ein JSON-Objekt mit der folgenden Struktur enthalten:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (Zahl, erforderlich): Der Port des MCP-Servers.
  - `workspacePath` (Zeichenkette, erforderlich): Eine Liste aller geöffneten Workspace-Root-Pfade, getrennt durch den betriebssystemspezifischen Pfadtrenner (`:` für Linux/macOS, `;` für Windows). Die CLI verwendet diesen Pfad, um sicherzustellen, dass sie im selben Projektordner ausgeführt wird, der in der IDE geöffnet ist. Wenn das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Ihr Plugin **MUSS** die korrekten, absoluten Pfade zu den Wurzeln der geöffneten Workspaces bereitstellen.
  - `authToken` (Zeichenkette, erforderlich): Ein geheimer Token zur Sicherung der Verbindung. Die CLI wird diesen Token in einem `Authorization: Bearer <token>`-Header bei allen Anfragen mitsenden.
  - `ppid` (Zahl, erforderlich): Die Parent-Prozess-ID des IDE-Prozesses.
  - `ideName` (Zeichenkette, erforderlich): Ein benutzerfreundlicher Name für die IDE (z. B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Um die Verbindung zu sichern, **MUSS** das Plugin einen eindeutigen, geheimen Token generieren und in der Discovery-Datei ablegen. Die CLI wird diesen Token dann im `Authorization`-Header für alle Anfragen an den MCP-Server mitsenden (z. B. `Authorization: Bearer a-very-secret-token`). Ihr Server **MUSS** diesen Token bei jeder Anfrage validieren und nicht autorisierte ablehnen.
- **Umgebungsvariablen (erforderlich):** Ihr Plugin **MUSS** `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal setzen, damit die CLI die korrekte `<PORT>.lock`-Datei finden kann.

**Legacy-Hinweis:** Für Erweiterungen älter als v0.5.1 kann Qwen Code auf das Lesen von JSON-Dateien im temporären Systemverzeichnis namens `qwen-code-ide-server-<PID>.json` oder `qwen-code-ide-server-<PORT>.json` zurückgreifen. Neue Integrationen sollten sich nicht auf diese Legacy-Dateien verlassen.

## II. Die Kontextschnittstelle

Um Kontextbewusstsein zu ermöglichen, **KANN** das Plugin der CLI Echtzeitinformationen über die Aktivität des Benutzers in der IDE bereitstellen.

### `ide/contextUpdate`-Benachrichtigung

Das Plugin **KANN** eine `ide/contextUpdate`-[Benachrichtigung](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, wenn sich der Kontext des Benutzers ändert.

- **Auslösende Ereignisse:** Diese Benachrichtigung sollte (mit einem empfohlenen Debounce von 50 ms) gesendet werden, wenn:
  - Eine Datei geöffnet, geschlossen oder fokussiert wird.
  - Die Cursorposition oder Textauswahl des Benutzers in der aktiven Datei sich ändert.
- **Payload (`IdeContext`):** Die Benachrichtigungsparameter **MÜSSEN** ein `IdeContext`-Objekt sein:

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
    // Unix-Zeitstempel des letzten Fokus (für Sortierung)
    timestamp: number;
    // true, wenn dies die aktuell fokussierte Datei ist
    isActive?: boolean;
    cursor?: {
      // 1-basierte Zeilennummer
      line: number;
      // 1-basiertes Zeichen
      character: number;
    };
    // Der aktuell vom Benutzer ausgewählte Text
    selectedText?: string;
  }
  ```

  **Hinweis:** Die Liste `openFiles` sollte nur Dateien enthalten, die auf der Festplatte existieren. Virtuelle Dateien (z. B. ungespeicherte Dateien ohne Pfad, Editor-Einstellungsseiten) **MÜSSEN** ausgeschlossen werden.

### Wie die CLI diesen Kontext verwendet

Nach Erhalt des `IdeContext`-Objekts führt die CLI mehrere Normalisierungs- und Kürzungsschritte durch, bevor die Informationen an das Modell gesendet werden.

- **Dateisortierung:** Die CLI verwendet das Feld `timestamp`, um die zuletzt verwendeten Dateien zu bestimmen. Sie sortiert die Liste `openFiles` basierend auf diesem Wert. Daher **MUSS** Ihr Plugin einen genauen Unix-Zeitstempel dafür bereitstellen, wann eine Datei zuletzt fokussiert wurde.
- **Aktive Datei:** Die CLI betrachtet nur die aktuellste Datei (nach Sortierung) als „aktive“ Datei. Sie ignoriert das Flag `isActive` bei allen anderen Dateien und löscht deren Felder `cursor` und `selectedText`. Ihr Plugin sollte sich darauf konzentrieren, `isActive: true` zu setzen und Cursor-/Auswahldetails nur für die aktuell fokussierte Datei bereitzustellen.
- **Kürzung:** Um Token-Limits zu verwalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den `selectedText` (auf 16 KB).

Obwohl die CLI die endgültige Kürzung übernimmt, wird dringend empfohlen, dass Ihr Plugin ebenfalls die Menge des gesendeten Kontexts begrenzt.

## III. Die Diffing-Schnittstelle

Um interaktive Code-Änderungen zu ermöglichen, **KANN** das Plugin eine Diffing-Schnittstelle bereitstellen. Dies erlaubt der CLI, die IDE aufzufordern, eine Diff-Ansicht zu öffnen, die vorgeschlagene Änderungen an einer Datei anzeigt. Der Benutzer kann diese Änderungen dann direkt in der IDE überprüfen, bearbeiten und letztendlich akzeptieren oder ablehnen.

### `openDiff`-Tool

Das Plugin **MUSS** ein `openDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine modifizierbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Anfrage (`OpenDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das Feld `arguments` innerhalb der `params` der Anfrage **MUSS** ein `OpenDiffRequest`-Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // Der absolute Pfad zur Datei, für die ein Diff geöffnet werden soll.
    filePath: string;
    // Der vorgeschlagene neue Inhalt der Datei.
    newContent: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** sofort ein `CallToolResult` zurückgeben, um die Anfrage zu bestätigen und zu melden, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geöffnet wurde, **MUSS** die Antwort leeren Inhalt enthalten (d. h. `content: []`).
  - Bei Fehler: Wenn ein Fehler das Öffnen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array, der den Fehler beschreibt.

  Das tatsächliche Ergebnis des Diffs (Annahme oder Ablehnung) wird asynchron über Benachrichtigungen übermittelt.

### `closeDiff`-Tool

Das Plugin **MUSS** ein `closeDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine geöffnete Diff-Ansicht für eine bestimmte Datei zu schließen.
- **Anfrage (`CloseDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das Feld `arguments` innerhalb der `params` der Anfrage **MUSS** ein `CloseDiffRequest`-Objekt sein.

  ```typescript
  interface CloseDiffRequest {
    // Der absolute Pfad zur Datei, deren Diff-Ansicht geschlossen werden soll.
    filePath: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** ein `CallToolResult` zurückgeben.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geschlossen wurde, **MUSS** die Antwort einen einzelnen **TextContent**-Block im `content`-Array enthalten, der den endgültigen Inhalt der Datei vor dem Schließen enthält.
  - Bei Fehler: Wenn ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array, der den Fehler beschreibt.

### `ide/diffAccepted`-Benachrichtigung

Wenn der Benutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf „Anwenden“ oder „Speichern“), **MUSS** das Plugin eine `ide/diffAccepted`-Benachrichtigung an die CLI senden.

- **Payload:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad und den endgültigen Inhalt der Datei enthalten. Der Inhalt kann sich vom ursprünglichen `newContent` unterscheiden, wenn der Benutzer manuelle Bearbeitungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // Der absolute Pfad zur Datei, für die ein Diff geöffnet wurde.
    filePath: string;
    // Der vollständige Inhalt der Datei nach der Annahme.
    content: string;
  }
  ```

### `ide/diffRejected`-Benachrichtigung

Wenn der Benutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne Annahme), **MUSS** das Plugin eine `ide/diffRejected`-Benachrichtigung an die CLI senden.

- **Payload:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad des abgelehnten Diffs enthalten.

  ```typescript
  {
    // Der absolute Pfad zur Datei, für die ein Diff geöffnet wurde.
    filePath: string;
  }
  ```

## IV. Die Lebenszyklus-Schnittstelle

Das Plugin **MUSS** seine Ressourcen und die Discovery-Datei basierend auf dem Lebenszyklus der IDE korrekt verwalten.

- **Bei Aktivierung (IDE-Start/Plugin aktiviert):**
  1.  Starten Sie den MCP-Server.
  2.  Erstellen Sie die Discovery-Datei.
- **Bei Deaktivierung (IDE-Shutdown/Plugin deaktiviert):**
  1.  Stoppen Sie den MCP-Server.
  2.  Löschen Sie die Discovery-Datei.