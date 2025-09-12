# IDE-Integration

Qwen Code kann in deine IDE integriert werden, um ein nahtloseres und kontextbezogenes Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, deinen Workspace besser zu verstehen und leistungsstarke Funktionen wie native Diff-Ansichten direkt im Editor zu aktivieren.

Derzeit wird als einzige IDE [Visual Studio Code](https://code.visualstudio.com/) sowie andere Editoren unterstützt, die VS Code-Erweiterungen nutzen können.

## Funktionen

- **Workspace-Kontext:** Die CLI erhält automatisch Informationen über deinen Workspace, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt geöffneten Dateien** in deinem Workspace.
  - Deine aktuelle Cursor-Position.
  - Jeden Text, den du ausgewählt hast (bis zu einem Limit von 16 KB; längere Selektionen werden gekürzt).

- **Native Diff-Ansicht:** Wenn Qwen Code-Änderungen vorschlägt, kannst du die Änderungen direkt in der nativen Diff-Ansicht deiner IDE betrachten. So kannst du die vorgeschlagenen Änderungen nahtlos überprüfen, bearbeiten und entweder annehmen oder ablehnen.

- **VS Code Commands:** Du kannst direkt über die VS Code Command Palette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) auf die Funktionen von Qwen Code zugreifen:
  - `Qwen Code: Run`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Accept Diff`: Übernimmt die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Close Diff Editor`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: View Third-Party Notices`: Zeigt die Drittanbieter-Hinweise für die Erweiterung an.

## Installation und Setup

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatischer Hinweis (empfohlen)

Wenn du Qwen Code in einem unterstützten Editor ausführst, erkennt es automatisch deine Umgebung und fordert dich auf, eine Verbindung herzustellen. Wenn du mit "Ja" antwortest, wird das notwendige Setup automatisch ausgeführt, einschließlich der Installation der Companion-Erweiterung und der Aktivierung der Verbindung.

### 2. Manuelle Installation über CLI

Falls du die Aufforderung zuvor abgelehnt hast oder die Erweiterung manuell installieren möchtest, kannst du den folgenden Befehl innerhalb von Qwen Code ausführen:

```
/ide install
```

Dadurch wird die richtige Erweiterung für deine IDE gefunden und installiert.

### 3. Manuelle Installation aus einem Marketplace

Du kannst die Extension auch direkt aus einem Marketplace installieren.

- **Für Visual Studio Code:** Installiere sie über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code Forks:** Um Forks von VS Code zu unterstützen, ist die Extension auch im [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Befolge die Anweisungen deines Editors, um Extensions aus diesem Registry zu installieren.

Nach jeder Installationsmethode wird empfohlen, ein neues Terminal-Fenster zu öffnen, um sicherzustellen, dass die Integration korrekt aktiviert wird. Sobald die Installation abgeschlossen ist, kannst du `/ide enable` verwenden, um dich zu verbinden.

## Verwendung

### Aktivierung und Deaktivierung

Du kannst die IDE-Integration direkt über die CLI steuern:

- Um die Verbindung zur IDE zu aktivieren, führe folgenden Befehl aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führe folgenden Befehl aus:
  ```
  /ide disable
  ```

Wenn die Verbindung aktiviert ist, wird Qwen Code automatisch versuchen, sich mit der IDE-Companion-Erweiterung zu verbinden.

### Status prüfen

Um den Verbindungsstatus zu überprüfen und den Kontext anzuzeigen, den die CLI von der IDE erhalten hat, führe folgenden Befehl aus:

```
/ide status
```

Falls eine Verbindung besteht, zeigt dieser Befehl die IDE an, mit der die Verbindung besteht, sowie eine Liste der zuletzt geöffneten Dateien, die bekannt sind.

(Hinweis: Die Dateiliste ist auf 10 zuletzt geöffnete Dateien innerhalb deines Workspaces beschränkt und enthält nur lokale Dateien auf der Festplatte.)

### Arbeiten mit Diffs

Wenn du Gemini bittest, eine Datei zu ändern, kann es direkt eine Diff-Ansicht in deinem Editor öffnen.

**Um einen Diff zu akzeptieren**, kannst du eine der folgenden Aktionen durchführen:

- Klicke auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichere die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffne die Command Palette und führe **Qwen Code: Accept Diff** aus.
- Antworte mit `yes` in der CLI, wenn du dazu aufgefordert wirst.

**Um einen Diff abzulehnen**, kannst du:

- Klicke auf das **'x'-Symbol** in der Titelleiste des Diff-Editors.
- Schließe den Diff-Editor-Tab.
- Öffne die Command Palette und führe **Qwen Code: Close Diff Editor** aus.
- Antworte mit `no` in der CLI, wenn du dazu aufgefordert wirst.

Du kannst auch **die vorgeschlagenen Änderungen direkt in der Diff-Ansicht anpassen**, bevor du sie akzeptierst.

Wenn du in der CLI „Yes, allow always“ auswählst, werden die Änderungen nicht mehr im IDE angezeigt, da sie dann automatisch akzeptiert werden.

## Verwendung mit Sandboxing

Wenn du Qwen Code innerhalb einer Sandbox verwendest, beachte bitte Folgendes:

- **Unter macOS:** Die IDE-Integration benötigt Netzwerkzugriff, um mit der IDE-Begleiter-Erweiterung zu kommunizieren. Du musst ein Seatbelt-Profil verwenden, das den Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn du Qwen Code innerhalb eines Docker- (oder Podman-) Containers ausführst, kann die IDE-Integration dennoch eine Verbindung zur VS Code-Erweiterung auf deinem Host-Rechner herstellen. Die CLI ist so konfiguriert, dass sie automatisch den IDE-Server unter `host.docker.internal` findet. Normalerweise ist keine spezielle Konfiguration erforderlich, aber du solltest sicherstellen, dass dein Docker-Netzwerksetup Verbindungen vom Container zum Host zulässt.

## Fehlerbehebung

Falls Probleme mit der IDE-Integration auftreten, findest du hier einige häufige Fehlermeldungen und deren Lösungen.

### Verbindungsfehler

- **Nachricht:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die notwendigen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um sich mit der IDE zu verbinden. Das bedeutet in der Regel, dass die IDE-Begleiter-Extension nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1.  Stelle sicher, dass du die **Qwen Code Companion**-Extension in deiner IDE installiert hast und diese aktiviert ist.
    2.  Öffne ein neues Terminalfenster in deiner IDE, um sicherzustellen, dass die korrekten Umgebungsvariablen übernommen werden.

- **Nachricht:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zum IDE-Begleiter wurde unerwartet unterbrochen.
  - **Lösung:** Führe `/ide enable` aus, um eine erneute Verbindung herzustellen. Falls das Problem weiterhin besteht, öffne ein neues Terminalfenster oder starte deine IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI befindet sich außerhalb des Ordners oder Workspaces, der in deiner IDE geöffnet ist.
  - **Lösung:** Wechsle mit `cd` in das Verzeichnis, das in deiner IDE geöffnet ist, und starte die CLI neu.

- **Meldung:** `🔴 Disconnected: To use this feature, please open a single workspace folder in [IDE Name] and try again.`
  - **Ursache:** Du hast entweder mehrere Workspace-Ordner in deiner IDE geöffnet oder es ist überhaupt kein Ordner geöffnet. Die IDE-Integration benötigt einen einzelnen Root-Workspace-Ordner, um korrekt zu funktionieren.
  - **Lösung:** Öffne einen einzelnen Projektordner in deiner IDE und starte die CLI neu.

### Allgemeine Fehler

- **Meldung:** `IDE-Integration wird in Ihrer aktuellen Umgebung nicht unterstützt. Um diese Funktion zu nutzen, führen Sie Qwen Code in einer der folgenden unterstützten IDEs aus: [Liste der IDEs]`
  - **Ursache:** Sie führen Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führen Sie Qwen Code aus dem integrierten Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `Für [IDE Name] ist kein Installer verfügbar. Bitte installieren Sie den IDE-Companion manuell über den Marketplace der IDE.`
  - **Ursache:** Sie haben `/ide install` ausgeführt, aber die CLI verfügt über keinen automatisierten Installer für Ihre spezifische IDE.
  - **Lösung:** Öffnen Sie den Extension-Marketplace Ihrer IDE, suchen Sie nach "Qwen Code Companion" und installieren Sie die Erweiterung manuell.