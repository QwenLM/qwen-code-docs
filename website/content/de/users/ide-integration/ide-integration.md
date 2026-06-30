# IDE-Integration

Qwen Code kann in deine IDE integriert werden, um ein nahtloseres und kontextbewussteres Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, deinen Workspace besser zu verstehen, und aktiviert leistungsstarke Funktionen wie natives Diffing direkt im Editor.

Derzeit ist die einzige unterstützte IDE [Visual Studio Code](https://code.visualstudio.com/) sowie andere Editoren, die VS-Code-Erweiterungen unterstützen. Um Support für andere Editoren zu entwickeln, siehe die [IDE Companion Extension Spec](../ide-integration/ide-companion-spec).

## Funktionen

- **Workspace-Kontext:** Die CLI erhält automatisch Kenntnis über deinen Workspace, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt aufgerufenen Dateien** in deinem Workspace.
  - Deine aktive Cursor-Position.
  - Jeglicher von dir markierter Text (bis zu einem Limit von 16 KB; längere Markierungen werden abgeschnitten).

- **Natives Diffing:** Wenn Qwen Code-Änderungen vorschlägt, kannst du die Änderungen direkt im nativen Diff-Viewer deiner IDE ansehen. So kannst du die vorgeschlagenen Änderungen nahtlos überprüfen, bearbeiten und akzeptieren oder ablehnen.

- **VS-Code-Befehle:** Du kannst auf Qwen-Code-Funktionen direkt über die VS-Code-Befehlspalette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) zugreifen:
  - `Qwen Code: Run`: Startet eine neue Qwen-Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Accept Diff`: Akzeptiert die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Close Diff Editor`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: View Third-Party Notices`: Zeigt die Third-Party-Hinweise für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatische Aufforderung (Empfohlen)

Wenn du Qwen Code in einem unterstützten Editor ausführst, erkennt er automatisch deine Umgebung und fordert dich auf, eine Verbindung herzustellen. Wenn du mit "Yes" antwortest, wird das notwendige Setup automatisch ausgeführt, was die Installation der Companion-Erweiterung und die Aktivierung der Verbindung umfasst.

### 2. Manuelle Installation über die CLI

Wenn du die Aufforderung zuvor abgelehnt hast oder die Erweiterung manuell installieren möchtest, kannst du den folgenden Befehl in Qwen Code ausführen:

```
/ide install
```

Dadurch wird die richtige Erweiterung für deine IDE gefunden und installiert.

### 3. Manuelle Installation aus einem Marketplace

Du kannst die Erweiterung auch direkt aus einem Marketplace installieren.

- **Für Visual Studio Code:** Installiere sie aus dem [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS-Code-Forks:** Um Forks von VS Code zu unterstützen, wird die Erweiterung auch in der [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Folge den Anweisungen deines Editors, um Erweiterungen aus dieser Registry zu installieren.

> [!note]
> Die Erweiterung "Qwen Code Companion" erscheint möglicherweise weiter unten in den Suchergebnissen. Wenn du sie nicht sofort siehst, versuche nach unten zu scrollen oder nach "Newly Published" zu sortieren.
>
> Nach der manuellen Installation der Erweiterung musst du `/ide enable` in der CLI ausführen, um die Integration zu aktivieren.

## Verwendung

### Aktivieren und Deaktivieren

Du kannst die IDE-Integration über die CLI steuern:

- Um die Verbindung zur IDE zu aktivieren, führe aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führe aus:
  ```
  /ide disable
  ```

Wenn aktiviert, versucht Qwen Code automatisch, eine Verbindung zur IDE-Companion-Erweiterung herzustellen.

### Status überprüfen

Um den Verbindungsstatus zu überprüfen und den Kontext zu sehen, den die CLI von der IDE erhalten hat, führe aus:

```
/ide status
```

Wenn eine Verbindung besteht, zeigt dieser Befehl die IDE, mit der er verbunden ist, und eine Liste der zuletzt geöffneten Dateien, die ihm bekannt sind.

(Hinweis: Die Dateiliste ist auf 10 zuletzt aufgerufene Dateien in deinem Workspace beschränkt und enthält nur lokale Dateien auf der Festplatte.)

### Arbeiten mit Diffs

Wenn du das Qwen-Modell bittest, eine Datei zu ändern, kann es eine Diff-Ansicht direkt in deinem Editor öffnen.

**Um ein Diff zu akzeptieren**, kannst du eine der folgenden Aktionen ausführen:

- Klicke auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichere die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffne die Befehlspalette und führe **Qwen Code: Accept Diff** aus.
- Antworte in der CLI mit `yes`, wenn du dazu aufgefordert wirst.

**Um ein Diff abzulehnen**, kannst du:

- Klicke auf das **'x'-Symbol** in der Titelleiste des Diff-Editors.
- Schließe den Diff-Editor-Tab.
- Öffne die Befehlspalette und führe **Qwen Code: Close Diff Editor** aus.
- Antworte in der CLI mit `no`, wenn du dazu aufgefordert wirst.

Du kannst die **vorgeschlagenen Änderungen** auch direkt in der Diff-Ansicht anpassen, bevor du sie akzeptierst.

Wenn du in der CLI 'Yes, allow always' auswählst, werden Änderungen nicht mehr in der IDE angezeigt, da sie automatisch akzeptiert werden.

## Verwendung mit Sandboxing

Wenn du Qwen Code in einer Sandbox verwendest, beachte bitte Folgendes:

- **Unter macOS:** Die IDE-Integration erfordert Netzwerkzugriff, um mit der IDE-Companion-Erweiterung zu kommunizieren. Du musst ein Seatbelt-Profil verwenden, das Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn du Qwen Code in einem Docker- (oder Podman-) Container ausführst, kann die IDE-Integration weiterhin eine Verbindung zur VS-Code-Erweiterung herstellen, die auf deinem Host-Rechner läuft. Die CLI ist so konfiguriert, dass sie den IDE-Server automatisch auf `host.docker.internal` findet. Normalerweise ist keine spezielle Konfiguration erforderlich, aber du musst möglicherweise sicherstellen, dass dein Docker-Netzwerk-Setup Verbindungen vom Container zum Host zulässt.

## Fehlerbehebung

Wenn du auf Probleme mit der IDE-Integration stößt, findest du hier einige häufige Fehlermeldungen und deren Lösungen.

### Verbindungsfehler

- **Meldung:** `● Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die notwendigen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um eine Verbindung zur IDE herzustellen. Dies bedeutet normalerweise, dass die IDE-Companion-Erweiterung nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1.  Stelle sicher, dass du die Erweiterung **Qwen Code Companion** in deiner IDE installiert und aktiviert hast.
    2.  Öffne ein neues Terminalfenster in deiner IDE, um sicherzustellen, dass die korrekte Umgebung übernommen wird.

- **Meldung:** `● Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zum IDE-Companion wurde unterbrochen.
  - **Lösung:** Führe `/ide enable` aus, um eine erneute Verbindung herzustellen. Wenn das Problem weiterhin besteht, öffne ein neues Terminalfenster oder starte deine IDE neu.

### Konfigurationsfehler

- **Meldung:** `● Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI befindet sich außerhalb des Ordners oder Workspaces, den du in deiner IDE geöffnet hast.
  - **Lösung:** Wechsle mit `cd` in dasselbe Verzeichnis, das in deiner IDE geöffnet ist, und starte die CLI neu.

- **Meldung:** `● Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Ursache:** Du hast keinen Workspace in deiner IDE geöffnet.
  - **Lösung:** Öffne einen Workspace in deiner IDE und starte die CLI neu.

### Allgemeine Fehler

- **Meldung:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Ursache:** Du führst Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führe Qwen Code über das integrierte Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Ursache:** Du hast `/ide install` ausgeführt, aber die CLI verfügt über keinen automatisierten Installer für deine spezifische IDE.
  - **Lösung:** Öffne den Erweiterungs-Marketplace deiner IDE, suche nach "Qwen Code Companion" und installiere die Erweiterung manuell.