# Qwen Code Companion Plugin: Schnittstellenspezifikation

> Letzte Aktualisierung: 15. September 2025

Dieses Dokument definiert den Vertrag für den Bau eines Begleit-Plugins, um den IDE-Modus von Qwen Code zu ermöglichen. Für VS Code werden diese Funktionen (native Differenzierung, Kontextbewusstsein) durch die offizielle Erweiterung bereitgestellt ([Marktplatz](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Mitwirkende, die ähnliche Funktionalitäten in andere Editoren wie JetBrains IDEs, Sublime Text usw. bringen möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transportschicht: MCP über HTTP

Das Plugin **MUSS** einen lokalen HTTP-Server ausführen, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein gültiger MCP-Server sein. Wir empfehlen die Verwendung eines vorhandenen MCP-SDKs für Ihre Sprache, falls verfügbar.
- **Endpunkt:** Der Server sollte einen einzelnen Endpunkt (z. B. `/mcp`) für alle MCP-Kommunikationen bereitstellen.
- **Port:** Der Server **MUSS** auf einem dynamisch zugewiesenen Port lauschen (d. h. auf Port `0` lauschen).

### 2. Erkennungsmechanismus: Die Lock-Datei

Damit Qwen Code sich verbinden kann, muss es den Port erkennen, den Ihr Server verwendet. Das Plugin **MUSS** dies durch Erstellen einer "Lock-Datei" und Setzen der Port-Umgebungsvariable ermöglichen.

- **Wie die CLI die Datei findet:** Die CLI liest den Port von `QWEN_CODE_IDE_SERVER_PORT` und liest dann `~/.qwen/ide/<PORT>.lock`. (Es gibt Legacy-Fallbacks für ältere Erweiterungen; siehe Hinweis unten.)
- **Dateispeicherort:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `~/.qwen/ide/`. Ihr Plugin muss dieses Verzeichnis erstellen, falls es nicht existiert.
- **Dateibenennungskonvention:** Der Dateiname ist entscheidend und **MUSS** dem folgenden Muster entsprechen:
  `<PORT>.lock`
  - `<PORT>`: Der Port, auf dem Ihr MCP-Server lauscht.
- **Dateiinhalt & Workspace-Validierung:** Die Datei **MUSS** ein JSON-Objekt mit folgender Struktur enthalten:

  ```json
  {
    "port": 12345,
    "workspacePath": "/pfad/zu/projekt1:/pfad/zu/projekt2",
    "authToken": "ein-sehr-geheimer-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (Zahl, erforderlich): Der Port des MCP-Servers.
  - `workspacePath` (Zeichenkette, erforderlich): Eine Liste aller geöffneten Workspace-Stammpfade, getrennt durch den betriebssystemspezifischen Pfadseparator (`:` für Linux/macOS, `;` für Windows). Die CLI verwendet diesen Pfad, um sicherzustellen, dass sie im gleichen Projektordner ausgeführt wird, der in der IDE geöffnet ist. Wenn das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Ihr Plugin **MUSS** den/die korrekten, absoluten Pfad(e) zum/den Stammverzeichnis(se) des/den geöffneten Workspaces liefern.
  - `authToken` (Zeichenkette, erforderlich): Ein geheimer Token zur Sicherung der Verbindung. Die CLI wird diesen Token in einem `Authorization: Bearer <token>`-Header bei allen Anfragen einfügen.
  - `ppid` (Zahl, erforderlich): Die übergeordnete Prozess-ID des IDE-Prozesses.
  - `ideName` (Zeichenkette, erforderlich): Ein benutzerfreundlicher Name für die IDE (z.B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Zur Sicherung der Verbindung **MUSS** das Plugin einen eindeutigen, geheimen Token generieren und ihn in die Erkennungsdatei einfügen. Die CLI wird diesen Token dann im `Authorization`-Header für alle Anfragen an den MCP-Server einfügen (z.B. `Authorization: Bearer ein-sehr-geheimer-token`). Ihr Server **MUSS** diesen Token bei jeder Anfrage validieren und alle nicht autorisierten Anfragen ablehnen.
- **Umgebungsvariablen (erforderlich):** Ihr Plugin **MUSS** `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal setzen, damit die CLI die richtige `<PORT>.lock`-Datei finden kann.

**Legacy-Hinweis:** Für Erweiterungen älter als v0.5.1 kann Qwen Code als Fallback auf JSON-Dateien im System-Temporärverzeichnis zurückgreifen, die `qwen-code-ide-server-<PID>.json` oder `qwen-code-ide-server-<PORT>.json` heißen. Neue Integrationen sollten sich nicht auf diese Legacy-Dateien verlassen.

## II. Die Context-Schnittstelle

Um Context-Awareness zu ermöglichen, **KANN** das Plugin der CLI Echtzeit-Informationen über die Aktivität des Benutzers in der IDE bereitstellen.

### `ide/contextUpdate` Benachrichtigung

Das Plugin **KANN** eine `ide/contextUpdate` [Benachrichtigung](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, wann immer sich der Kontext des Benutzers ändert.

- **Auslösende Ereignisse:** Diese Benachrichtigung sollte (mit einer empfohlenen Entprellung von 50ms) gesendet werden, wenn:
  - Eine Datei geöffnet, geschlossen oder fokussiert wird.
  - Die Cursorposition oder Textauswahl des Benutzers in der aktiven Datei sich ändert.
- **Nutzlast (`IdeContext`):** Die Benachrichtigungsparameter **MÜSSEN** ein `IdeContext`-Objekt sein:

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
    // Unix-Zeitstempel der letzten Fokussierung (zur Reihenfolgebestimmung)
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

  **Hinweis:** Die `openFiles`-Liste sollte nur Dateien enthalten, die auf dem Datenträger existieren. Virtuelle Dateien (z.B. ungespeicherte Dateien ohne Pfad, Editor-Einstellungsseiten) **MÜSSEN** ausgeschlossen werden.

### Wie die CLI diesen Kontext verwendet

Nachdem das `IdeContext`-Objekt empfangen wurde, führt die CLI mehrere Normalisierungs- und Kürzungs-Schritte durch, bevor die Informationen an das Modell gesendet werden.

- **Dateireihenfolge:** Die CLI verwendet das `timestamp`-Feld, um die zuletzt verwendeten Dateien zu ermitteln. Sie sortiert die `openFiles`-Liste basierend auf diesem Wert. Daher **MUSS** Ihr Plugin einen genauen Unix-Zeitstempel für den Zeitpunkt bereitstellen, an dem eine Datei zuletzt den Fokus hatte.
- **Aktive Datei:** Die CLI betrachtet nur die jeweils neueste Datei (nach der Sortierung) als "aktive" Datei. Sie wird das `isActive`-Flag aller anderen Dateien ignorieren und deren `cursor`- und `selectedText`-Felder leeren. Ihr Plugin sollte sich darauf konzentrieren, `isActive: true` zu setzen und Cursor-/Auswahl-Details nur für die aktuell fokussierte Datei bereitzustellen.
- **Kürzung:** Um Token-Limits zu verwalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den `selectedText` (auf 16 KB).

Während die CLI die endgültige Kürzung durchführt, wird dringend empfohlen, dass Ihr Plugin ebenfalls die Menge des gesendeten Kontexts begrenzt.

## III. Die Diffing-Schnittstelle

Um interaktive Code-Änderungen zu ermöglichen, **KANN** das Plugin eine Diffing-Schnittstelle bereitstellen. Dies erlaubt es der CLI, die IDE dazu aufzufordern, eine Diff-Ansicht zu öffnen, die vorgeschlagene Änderungen an einer Datei anzeigt. Der Benutzer kann diese Änderungen dann innerhalb der IDE überprüfen, bearbeiten und letztendlich akzeptieren oder ablehnen.

### `openDiff`-Tool

Das Plugin **MUSS** ein `openDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine bearbeitbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Anfrage (`OpenDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das `arguments`-Feld innerhalb der `params` der Anfrage **MUSS** ein `OpenDiffRequest`-Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // Der absolute Pfad zur Datei, die differenziert werden soll.
    filePath: string;
    // Der vorgeschlagene neue Inhalt für die Datei.
    newContent: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUSS** unverzüglich ein `CallToolResult` zurückgeben, um die Anfrage zu bestätigen und zu melden, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geöffnet wurde, **MUSS** die Antwort leeren Inhalt enthalten (z. B. `content: []`).
  - Bei Fehler: Wenn ein Fehler die Öffnung der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array mit einer Beschreibung des Fehlers beinhalten.

  Das tatsächliche Ergebnis des Diffs (Akzeptanz oder Ablehnung) wird asynchron über Benachrichtigungen kommuniziert.

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
  - Bei Erfolg: Wenn die Diff-Ansicht erfolgreich geschlossen wurde, **MUSS** die Antwort einen einzelnen **TextContent**-Block im Inhaltsarray enthalten, der den endgültigen Inhalt der Datei vor dem Schließen enthält.
  - Bei Fehler: Wenn ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUSS** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array mit einer Beschreibung des Fehlers enthalten.

### `ide/diffAccepted` Benachrichtigung

Wenn der Benutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf einen „Anwenden“- oder „Speichern“-Button), **MUSS** das Plugin eine `ide/diffAccepted`-Benachrichtigung an die CLI senden.

- **Nutzlast:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad und den endgültigen Inhalt der Datei enthalten. Der Inhalt kann sich vom ursprünglichen `newContent` unterscheiden, wenn der Benutzer manuelle Änderungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die diffed wurde.
    filePath: string;
    // Der vollständige Inhalt der Datei nach der Annahme.
    content: string;
  }
  ```

### `ide/diffRejected` Benachrichtigung

Wenn der Benutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne Akzeptieren), **MUSS** das Plugin eine `ide/diffRejected`-Benachrichtigung an die CLI senden.

- **Nutzlast:** Die Benachrichtigungsparameter **MÜSSEN** den Dateipfad des abgelehnten Diffs enthalten.

  ```typescript
  {
    // Der absolute Pfad zur Datei, die diffed wurde.
    filePath: string;
  }
  ```

## IV. Die Lebenszyklus-Schnittstelle

Das Plugin **MUSST** seine Ressourcen und die Discovery-Datei korrekt basierend auf dem IDE-Lebenszyklus verwalten.

- **Bei Aktivierung (IDE-Start/Plugin aktiviert):**
  1.  Starten Sie den MCP-Server.
  2.  Erstellen Sie die Discovery-Datei.
- **Bei Deaktivierung (IDE-Abschaltung/Plugin deaktiviert):**
  1.  Stoppen Sie den MCP-Server.
  2.  Löschen Sie die Discovery-Datei.