# Qwen Code Companion-Plugin: Schnittstellenspezifikation

> Zuletzt aktualisiert: 15. September 2025

Dieses Dokument definiert den Vertrag für die Entwicklung eines Companion-Plugins, um den IDE-Modus von Qwen Code zu aktivieren. Für VS Code werden diese Funktionen (native Differenzierung, Kontextbewusstsein) durch die offizielle Erweiterung bereitgestellt ([Marktplatz](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Diese Spezifikation richtet sich an Entwickler, die ähnliche Funktionalität in andere Editoren wie JetBrains-IDEs, Sublime Text usw. integrieren möchten.

## I. Die Kommunikationsschnittstelle

Qwen Code und das IDE-Plugin kommunizieren über einen lokalen Kommunikationskanal.

### 1. Transportschicht: MCP über HTTP

Das Plugin **MUST** einen lokalen HTTP-Server ausführen, der das **Model Context Protocol (MCP)** implementiert.

- **Protokoll:** Der Server muss ein gültiger MCP-Server sein. Wir empfehlen, falls verfügbar, ein bestehendes MCP-SDK für Ihre bevorzugte Programmiersprache zu verwenden.
- **Endpunkt:** Der Server sollte einen einzelnen Endpunkt (z. B. `/mcp`) für alle MCP-Kommunikation bereitstellen.
- **Port:** Der Server **MUST** an einem dynamisch zugewiesenen Port lauschen (d. h. an Port `0` lauschen).

### 2. Erkennungsmechanismus: Die Sperredatei

Damit Qwen Code eine Verbindung herstellen kann, muss es den Port ermitteln, den Ihr Server verwendet. Das Plugin **MUSSTE** dies durch Erstellen einer „Sperredatei“ und Festlegen der Umgebungsvariablen für den Port ermöglichen.

- **So findet die CLI die Datei:** Die CLI liest den Port aus `QWEN_CODE_IDE_SERVER_PORT` und liest anschließend `~/.qwen/ide/<PORT>.lock`. (Für ältere Erweiterungen existieren veraltete Fallback-Mechanismen; siehe Hinweis unten.)
- **Dateispeicherort:** Die Datei muss in einem bestimmten Verzeichnis erstellt werden: `~/.qwen/ide/`. Ihr Plugin muss dieses Verzeichnis ggf. selbst anlegen.
- **Namenskonvention für die Datei:** Der Dateiname ist entscheidend und **MUSSTE** dem folgenden Muster entsprechen:
  `<PORT>.lock`
  - `<PORT>`: Der Port, auf dem Ihr MCP-Server lauscht.
- **Dateiinhalt und Arbeitsbereichsvalidierung:** Die Datei **MUSSTE** ein JSON-Objekt mit folgender Struktur enthalten:

  ```json
  {
    "port": 12345,
    "workspacePath": "/pfad/zu/projekt1:/pfad/zu/projekt2",
    "authToken": "ein-sehr-geheimes-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (Zahl, erforderlich): Der Port des MCP-Servers.
  - `workspacePath` (Zeichenkette, erforderlich): Eine Liste aller geöffneten Arbeitsbereichs-Stammverzeichnisse, getrennt durch den betriebssystemspezifischen Pfadtrenner (`:` unter Linux/macOS, `;` unter Windows). Die CLI nutzt diesen Pfad, um sicherzustellen, dass sie im selben Projektordner ausgeführt wird, der im IDE geöffnet ist. Falls das aktuelle Arbeitsverzeichnis der CLI kein Unterverzeichnis von `workspacePath` ist, wird die Verbindung abgelehnt. Ihr Plugin **MUSSTE** den korrekten, absoluten Pfad bzw. die korrekten absoluten Pfade zum Stammverzeichnis des bzw. der geöffneten Arbeitsbereiche angeben.
  - `authToken` (Zeichenkette, erforderlich): Ein geheimes Token zur Absicherung der Verbindung. Die CLI fügt dieses Token in allen Anfragen im Header `Authorization: Bearer <token>` hinzu.
  - `ppid` (Zahl, erforderlich): Die Prozess-ID des übergeordneten IDE-Prozesses.
  - `ideName` (Zeichenkette, erforderlich): Ein benutzerfreundlicher Name für die IDE (z. B. `VS Code`, `JetBrains IDE`).

- **Authentifizierung:** Um die Verbindung abzusichern, **MUSSTE** das Plugin ein eindeutiges, geheimes Token generieren und in der Erkennungsdatei speichern. Die CLI fügt dieses Token dann im `Authorization`-Header aller Anfragen an den MCP-Server ein (z. B. `Authorization: Bearer ein-sehr-geheimes-token`). Ihr Server **MUSSTE** dieses Token bei jeder Anfrage validieren und alle nicht autorisierten Anfragen ablehnen.
- **Umgebungsvariablen (erforderlich):** Ihr Plugin **MUSSTE** `QWEN_CODE_IDE_SERVER_PORT` im integrierten Terminal festlegen, damit die CLI die richtige `<PORT>.lock`-Datei finden kann.

**Hinweis zu veralteten Mechanismen:** Für Erweiterungen älter als v0.5.1 kann Qwen Code alternativ JSON-Dateien im Systemtemporärverzeichnis mit den Namen `qwen-code-ide-server-<PID>.json` oder `qwen-code-ide-server-<PORT>.json` lesen. Neue Integrationen sollten sich nicht auf diese veralteten Dateien verlassen.

## II. Die Kontext-Schnittstelle

Um Kontextbewusstsein zu ermöglichen, **KANN** das Plugin der CLI Echtzeitinformationen über die Aktivität des Benutzers in der IDE bereitstellen.

### `ide/contextUpdate`-Benachrichtigung

Das Plugin **KANN** eine `ide/contextUpdate`-[Benachrichtigung](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) an die CLI senden, sobald sich der Kontext des Benutzers ändert.

- **Auslösende Ereignisse:** Diese Benachrichtigung sollte (mit einer empfohlenen Entprellzeit von 50 ms) gesendet werden, wenn:
  - Eine Datei geöffnet, geschlossen oder fokussiert wird.
  - Die Cursorposition oder die Textauswahl des Benutzers in der aktiven Datei sich ändert.
- **Nutzlast (`IdeContext`):** Die Parameter der Benachrichtigung **MÜSSEN** ein `IdeContext`-Objekt sein:

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
    // Zeitstempel des letzten Fokus (Unix-Zeitstempel, für Sortierung)
    timestamp: number;
    // True, wenn es sich um die derzeit fokussierte Datei handelt
    isActive?: boolean;
    cursor?: {
      // Zeilennummer (basierend auf 1)
      line: number;
      // Zeichennummer (basierend auf 1)
      character: number;
    };
    // Der vom Benutzer aktuell ausgewählte Text
    selectedText?: string;
  }
  ```

  **Hinweis:** Die Liste `openFiles` darf nur Dateien enthalten, die tatsächlich auf der Festplatte existieren. Virtuelle Dateien (z. B. nicht gespeicherte Dateien ohne Pfad, Einstellungsseiten des Editors) **DÜRFEN NICHT** enthalten sein.

### So nutzt die CLI diesen Kontext

Nachdem das `IdeContext`-Objekt empfangen wurde, führt die CLI mehrere Normalisierungs- und Kürzungsschritte durch, bevor die Informationen an das Modell gesendet werden.

- **Dateireihenfolge:** Die CLI verwendet das Feld `timestamp`, um die zuletzt verwendeten Dateien zu ermitteln. Sie sortiert die Liste `openFiles` entsprechend diesem Wert. Daher **MUSST** dein Plugin einen genauen Unix-Zeitstempel für den Zeitpunkt angeben, zu dem eine Datei zuletzt fokussiert wurde.
- **Aktive Datei:** Die CLI betrachtet nur die zuletzt sortierte Datei als „aktive“ Datei. Sie ignoriert das Flag `isActive` bei allen anderen Dateien und löscht deren Felder `cursor` und `selectedText`. Dein Plugin sollte sich darauf konzentrieren, `isActive: true` sowie Cursor- und Auswahlinformationen ausschließlich für die derzeit fokussierte Datei anzugeben.
- **Kürzung:** Um Token-Begrenzungen einzuhalten, kürzt die CLI sowohl die Dateiliste (auf 10 Dateien) als auch den Inhalt von `selectedText` (auf 16 KB).

Obwohl die CLI die endgültige Kürzung übernimmt, wird dringend empfohlen, dass dein Plugin ebenfalls die Menge des gesendeten Kontexts begrenzt.

## III. Die Diff-Schnittstelle

Um interaktive Codeänderungen zu ermöglichen, **KANN** das Plugin eine Diff-Schnittstelle bereitstellen. Dadurch kann die CLI anfordern, dass die IDE eine Diff-Ansicht öffnet, in der die vorgeschlagenen Änderungen an einer Datei angezeigt werden. Der Benutzer kann diese Änderungen dann direkt innerhalb der IDE überprüfen, bearbeiten und letztlich akzeptieren oder ablehnen.

### `openDiff`-Tool

Das Plugin **MUST** ein `openDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine bearbeitbare Diff-Ansicht für eine bestimmte Datei zu öffnen.
- **Anfrage (`OpenDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das Feld `arguments` innerhalb des `params` der Anfrage **MUST** ein `OpenDiffRequest`-Objekt sein.

  ```typescript
  interface OpenDiffRequest {
    // Der absolute Pfad zur Datei, für die ein Diff erstellt werden soll.
    filePath: string;
    // Der vorgeschlagene neue Inhalt der Datei.
    newContent: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUST** unverzüglich eine `CallToolResult`-Antwort zurückgeben, um die Anfrage zu bestätigen und mitzuteilen, ob die Diff-Ansicht erfolgreich geöffnet wurde.
  - Bei Erfolg: Falls die Diff-Ansicht erfolgreich geöffnet wurde, **MUST** die Antwort leeren Inhalt enthalten (d. h. `content: []`).
  - Bei Fehlschlag: Falls ein Fehler verhindert hat, dass die Diff-Ansicht geöffnet wird, **MUST** die Antwort `isError: true` enthalten und einen `TextContent`-Block im `content`-Array mit einer Beschreibung des Fehlers enthalten.

  Das tatsächliche Ergebnis des Diffs (Annahme oder Ablehnung) wird asynchron über Benachrichtigungen kommuniziert.

### `closeDiff`-Tool

Das Plugin **MUST** ein `closeDiff`-Tool auf seinem MCP-Server registrieren.

- **Beschreibung:** Dieses Tool weist die IDE an, eine geöffnete Diff-Ansicht für eine bestimmte Datei zu schließen.
- **Anfrage (`CloseDiffRequest`):** Das Tool wird über eine `tools/call`-Anfrage aufgerufen. Das Feld `arguments` innerhalb des Felds `params` der Anfrage **MUST** ein Objekt vom Typ `CloseDiffRequest` sein.

  ```typescript
  interface CloseDiffRequest {
    // Der absolute Pfad zur Datei, deren Diff-Ansicht geschlossen werden soll.
    filePath: string;
  }
  ```

- **Antwort (`CallToolResult`):** Das Tool **MUST** ein `CallToolResult` zurückgeben.
  - Bei Erfolg: Falls die Diff-Ansicht erfolgreich geschlossen wurde, **MUST** die Antwort einen einzelnen **TextContent**-Block im Inhaltsarray enthalten, der den endgültigen Inhalt der Datei vor dem Schließen enthält.
  - Bei Fehlschlag: Falls ein Fehler das Schließen der Diff-Ansicht verhindert hat, **MUST** die Antwort `isError: true` enthalten und einen `TextContent`-Block im Feld `content` mit einer Beschreibung des Fehlers enthalten.

### `ide/diffAccepted`-Benachrichtigung

Wenn der Benutzer die Änderungen in einer Diff-Ansicht akzeptiert (z. B. durch Klicken auf eine Schaltfläche „Anwenden“ oder „Speichern“), **MUST** das Plugin eine `ide/diffAccepted`-Benachrichtigung an die CLI senden.

- **Nutzenlast:** Die Benachrichtigungsparameter **MUST** den Dateipfad und den endgültigen Inhalt der Datei enthalten. Der Inhalt kann sich vom ursprünglichen `newContent` unterscheiden, falls der Benutzer manuelle Änderungen in der Diff-Ansicht vorgenommen hat.

  ```typescript
  {
    // Der absolute Pfad zur Datei, für die der Diff-Vergleich durchgeführt wurde.
    filePath: string;
    // Der vollständige Inhalt der Datei nach der Akzeptanz.
    content: string;
  }
  ```

### `ide/diffRejected`-Benachrichtigung

Wenn der Benutzer die Änderungen ablehnt (z. B. durch Schließen der Diff-Ansicht ohne vorherige Akzeptanz), **MUST** das Plugin eine `ide/diffRejected`-Benachrichtigung an die CLI senden.

- **Nutzenlast:** Die Benachrichtigungsparameter **MUST** den Dateipfad der abgelehnten Diff enthalten.

  ```typescript
  {
    // Der absolute Pfad zur Datei, für die der Diff-Vergleich durchgeführt wurde.
    filePath: string;
  }
  ```

## IV. Die Lebenszyklus-Schnittstelle

Das Plugin **MUSST** seine Ressourcen und die Discovery-Datei korrekt entsprechend dem Lebenszyklus der IDE verwalten.

- **Bei Aktivierung (Start der IDE/Aktivierung des Plugins):**
  1.  Starten Sie den MCP-Server.
  2.  Erstellen Sie die Discovery-Datei.
- **Bei Deaktivierung (Beenden der IDE/Deaktivierung des Plugins):**
  1.  Beenden Sie den MCP-Server.
  2.  Löschen Sie die Discovery-Datei.