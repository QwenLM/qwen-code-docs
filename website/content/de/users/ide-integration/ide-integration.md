# IDE-Integration

Qwen Code lässt sich in deine IDE integrieren, um ein nahtloseres und kontextbewussteres Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, deinen Workspace besser zu verstehen und leistungsstarke Funktionen wie natives Diffing direkt im Editor zu aktivieren.

Derzeit ist die einzige unterstützte IDE [Visual Studio Code](https://code.visualstudio.com/) sowie andere Editoren, die VS Code-Erweiterungen unterstützen. Informationen zum Hinzufügen von Unterstützung für andere Editoren findest du in der [IDE Companion Extension Spec](../ide-integration/ide-companion-spec).

## Funktionen

- **Workspace-Kontext:** Die CLI erkennt automatisch deinen Workspace, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt geöffneten Dateien** in deinem Workspace.
  - Deine aktuelle Cursorposition.
  - Jeglichen markierten Text (bis zu einem Limit von 16 KB; längere Markierungen werden abgeschnitten).

- **Natives Diffing:** Wenn Qwen Code-Änderungen vorschlägt, kannst du die Änderungen direkt im nativen Diff-Viewer deiner IDE anzeigen. So kannst du die vorgeschlagenen Änderungen nahtlos prüfen, bearbeiten sowie annehmen oder ablehnen.

- **VS Code-Befehle:** Du kannst auf Qwen Code-Funktionen direkt über die VS Code-Befehlspalette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) zugreifen:
  - `Qwen Code: Run`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Accept Diff`: Übernimmt die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Close Diff Editor`: Verwirft die Änderungen und schließt den aktiven Diff-Editor.
  - `Qwen Code: ViewThird-Party Notices`: Zeigt die Drittanbieter-Hinweise für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatischer Hinweis (Empfohlen)

Wenn du Qwen Code in einem unterstützten Editor ausführst, erkennt es automatisch deine Umgebung und fordert dich zur Verbindung auf. Wenn du mit „Ja“ antwortest, wird das erforderliche Setup automatisch ausgeführt. Dazu gehören die Installation der Companion-Erweiterung und die Aktivierung der Verbindung.

### 2. Manuelle Installation über die CLI

Falls du die Eingabeaufforderung zuvor abgelehnt hast oder die Erweiterung manuell installieren möchtest, kannst du folgenden Befehl innerhalb von Qwen Code ausführen:

```
/ide install
```

Dadurch wird die passende Erweiterung für deine IDE gefunden und installiert.

### 3. Manuelle Installation über einen Marketplace

Du kannst die Erweiterung auch direkt über einen Marketplace installieren.

- **Für Visual Studio Code:** Installation über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code-Forks:** Zur Unterstützung von VS Code-Forks ist die Erweiterung auch in der [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Folge den Anweisungen deines Editors, um Erweiterungen aus dieser Registry zu installieren.

> [!note]
> Die Erweiterung „Qwen Code Companion“ wird in den Suchergebnissen möglicherweise weiter unten angezeigt. Wenn du sie nicht sofort siehst, versuche, nach unten zu scrollen oder nach „Neu veröffentlicht“ zu sortieren.
>
> Nach der manuellen Installation der Erweiterung musst du `/ide enable` in der CLI ausführen, um die Integration zu aktivieren.

## Verwendung

### Aktivieren und Deaktivieren

Du kannst die IDE-Integration direkt über die CLI steuern:

- Um die Verbindung zur IDE zu aktivieren, führe aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führe aus:
  ```
  /ide disable
  ```

Wenn die Integration aktiviert ist, versucht Qwen Code automatisch, eine Verbindung zur IDE-Companion-Erweiterung herzustellen.

### Status prüfen

Um den Verbindungsstatus zu prüfen und den Kontext anzuzeigen, den die CLI von der IDE erhalten hat, führe aus:

```
/ide status
```

Bei bestehender Verbindung zeigt dieser Befehl die verbundene IDE sowie eine Liste der zuletzt geöffneten Dateien an, die der CLI bekannt sind.

(Hinweis: Die Dateiliste ist auf 10 zuletzt geöffnete Dateien innerhalb deines Workspaces beschränkt und enthält nur lokale Dateien auf der Festplatte.)

### Arbeiten mit Diffs

Wenn du das Qwen-Modell bittest, eine Datei zu ändern, kann es eine Diff-Ansicht direkt in deinem Editor öffnen.

**Um einen Diff zu übernehmen**, kannst du eine der folgenden Aktionen ausführen:

- Klicke auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichere die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffne die Befehlspalette und führe **Qwen Code: Accept Diff** aus.
- Antworte in der CLI bei entsprechender Aufforderung mit `yes`.

**Um einen Diff abzulehnen**, kannst du:

- Auf das **'x'-Symbol** in der Titelleiste des Diff-Editors klicken.
- Den Tab des Diff-Editors schließen.
- Die Befehlspalette öffnen und **Qwen Code: Close Diff Editor** ausführen.
- In der CLI bei entsprechender Aufforderung mit `no` antworten.

Du kannst die vorgeschlagenen Änderungen auch **direkt in der Diff-Ansicht bearbeiten**, bevor du sie übernimmst.

Wenn du in der CLI „Ja, immer erlauben“ auswählst, werden Änderungen nicht mehr in der IDE angezeigt, da sie automatisch übernommen werden.

## Verwendung mit Sandboxing

Wenn du Qwen Code innerhalb einer Sandbox verwendest, beachte bitte Folgendes:

- **Unter macOS:** Die IDE-Integration benötigt Netzwerkzugriff, um mit der IDE-Companion-Erweiterung zu kommunizieren. Du musst ein Seatbelt-Profil verwenden, das Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn du Qwen Code in einem Docker- (oder Podman-) Container ausführst, kann die IDE-Integration weiterhin eine Verbindung zur VS Code-Erweiterung auf deinem Host-Rechner herstellen. Die CLI ist so konfiguriert, dass sie den IDE-Server automatisch unter `host.docker.internal` findet. In der Regel ist keine spezielle Konfiguration erforderlich, du solltest jedoch sicherstellen, dass dein Docker-Netzwerksetup Verbindungen vom Container zum Host zulässt.

## Fehlerbehebung

Falls du Probleme mit der IDE-Integration hast, findest du hier einige häufige Fehlermeldungen und deren Lösungen.

### Verbindungsfehler

- **Meldung:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die erforderlichen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um eine Verbindung zur IDE herzustellen. Dies bedeutet in der Regel, dass die IDE-Companion-Erweiterung nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1. Stelle sicher, dass du die Erweiterung **Qwen Code Companion** in deiner IDE installiert und aktiviert hast.
    2. Öffne ein neues Terminalfenster in deiner IDE, um sicherzustellen, dass die korrekte Umgebung geladen wird.

- **Meldung:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zur IDE-Companion-Erweiterung wurde unerwartet getrennt.
  - **Lösung:** Führe `/ide enable` aus, um die Verbindung wiederherzustellen. Falls das Problem weiterhin besteht, öffne ein neues Terminalfenster oder starte deine IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI befindet sich außerhalb des in deiner IDE geöffneten Ordners oder Workspaces.
  - **Lösung:** Wechsle mit `cd` in dasselbe Verzeichnis, das in deiner IDE geöffnet ist, und starte die CLI neu.

- **Meldung:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Ursache:** In deiner IDE ist kein Workspace geöffnet.
  - **Lösung:** Öffne einen Workspace in deiner IDE und starte die CLI neu.

### Allgemeine Fehler

- **Meldung:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Ursache:** Du führst Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führe Qwen Code über das integrierte Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Ursache:** Du hast `/ide install` ausgeführt, aber die CLI verfügt über keinen automatisierten Installer für deine spezifische IDE.
  - **Lösung:** Öffne den Erweiterungs-Markplace deiner IDE, suche nach „Qwen Code Companion“ und installiere die Erweiterung manuell.