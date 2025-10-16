# IDE-Integration

Qwen Code kann in deine IDE integriert werden, um ein nahtloseres und kontextbezogenes Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, deinen Workspace besser zu verstehen und leistungsstarke Funktionen wie native Diff-Ansicht direkt im Editor zu aktivieren.

Derzeit ist nur [Visual Studio Code](https://code.visualstudio.com/) und andere Editoren, die VS Code-Erweiterungen unterstützen, kompatibel.

## Funktionen

- **Workspace-Kontext:** Die CLI erhält automatisch Informationen über deinen Workspace, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt geöffneten Dateien** in deinem Workspace.
  - Deine aktuelle Cursor-Position.
  - Jeden ausgewählten Text (bis zu einem Limit von 16 KB; längere Selektionen werden gekürzt).

- **Native Diff-Ansicht:** Wenn Qwen Code-Änderungen vorschlägt, kannst du die Änderungen direkt in der nativen Diff-Ansicht deiner IDE betrachten. So kannst du die vorgeschlagenen Änderungen nahtlos überprüfen, bearbeiten und entweder annehmen oder ablehnen.

- **VS Code Commands:** Du kannst direkt über die VS Code Command Palette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) auf die Funktionen von Qwen Code zugreifen:
  - `Qwen Code: Run`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Accept Diff`: Übernimmt die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Close Diff Editor`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: View Third-Party Notices`: Zeigt die Third-Party-Hinweise für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatischer Hinweis (empfohlen)

Wenn du Qwen Code in einem unterstützten Editor ausführst, erkennt es automatisch deine Umgebung und fordert dich auf, eine Verbindung herzustellen. Wenn du mit "Ja" antwortest, wird automatisch das notwendige Setup ausgeführt, einschließlich der Installation der Companion-Erweiterung und Aktivierung der Verbindung.

### 2. Manuelle Installation über CLI

Falls du den Hinweis zuvor abgelehnt hast oder die Erweiterung manuell installieren möchtest, kannst du folgenden Befehl innerhalb von Qwen Code ausführen:

```
/ide install
```

Dadurch wird die richtige Erweiterung für deine IDE gefunden und installiert.

### 3. Manuelle Installation aus einem Marketplace

Du kannst die Extension auch direkt aus einem Marketplace installieren.

- **Für Visual Studio Code:** Installiere sie über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code Forks:** Um Forks von VS Code zu unterstützen, ist die Extension auch im [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Befolge die Anweisungen deines Editors, um Extensions aus diesem Registry zu installieren.

> HINWEIS:
> Die „Qwen Code Companion“-Extension kann weiter unten in den Suchergebnissen erscheinen. Wenn du sie nicht sofort findest, versuche nach unten zu scrollen oder nach „Neu veröffentlicht“ zu sortieren.
>
> Nach der manuellen Installation der Extension musst du `/ide enable` in der CLI ausführen, um die Integration zu aktivieren.

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

Wenn die Verbindung aktiviert ist, versucht Qwen Code automatisch, sich mit der IDE-Erweiterung zu verbinden.

### Status prüfen

Um den Verbindungsstatus zu überprüfen und den Kontext anzuzeigen, den die CLI von der IDE erhalten hat, führe folgenden Befehl aus:

```
/ide status
```

Falls eine Verbindung besteht, zeigt dieser Befehl die verbundene IDE sowie eine Liste der zuletzt geöffneten Dateien an, die der CLI bekannt sind.

(Hinweis: Die Dateiliste ist auf 10 zuletzt verwendete Dateien innerhalb deines Workspaces beschränkt und enthält nur lokale Dateien auf der Festplatte.)

### Arbeiten mit Diffs

Wenn du das Qwen-Modell bittest, eine Datei zu ändern, kann es direkt eine Diff-Ansicht in deinem Editor öffnen.

**Um einen Diff zu akzeptieren**, kannst du eine der folgenden Aktionen durchführen:

- Klicke auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichere die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffne die Befehlspalette und führe **Qwen Code: Accept Diff** aus.
- Antworte mit `yes` in der CLI, wenn du dazu aufgefordert wirst.

**Um einen Diff abzulehnen**, kannst du:

- Klicke auf das **'x'-Symbol** in der Titelleiste des Diff-Editors.
- Schließe den Diff-Editor-Tab.
- Öffne die Befehlspalette und führe **Qwen Code: Close Diff Editor** aus.
- Antworte mit `no` in der CLI, wenn du dazu aufgefordert wirst.

Du kannst auch **die vorgeschlagenen Änderungen direkt in der Diff-Ansicht anpassen**, bevor du sie akzeptierst.

Falls du in der CLI „Yes, allow always“ auswählst, werden die Änderungen nicht mehr im IDE angezeigt, da sie dann automatisch akzeptiert werden.

## Verwendung mit Sandboxing

Wenn du Qwen Code innerhalb einer Sandbox verwendest, beachte bitte Folgendes:

- **Unter macOS:** Die IDE-Integration benötigt Netzwerkzugriff, um mit der IDE-Begleiter-Erweiterung zu kommunizieren. Du musst ein Seatbelt-Profil verwenden, das den Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn du Qwen Code innerhalb eines Docker- (oder Podman-) Containers ausführst, kann die IDE-Integration sich weiterhin mit der VS Code-Erweiterung verbinden, die auf deinem Host-Rechner läuft. Der CLI ist so konfiguriert, dass er automatisch den IDE-Server unter `host.docker.internal` findet. Normalerweise ist keine spezielle Konfiguration erforderlich, aber du solltest sicherstellen, dass dein Docker-Netzwerksetup Verbindungen vom Container zum Host zulässt.

## Fehlerbehebung

Falls Probleme bei der IDE-Integration auftreten, findest du hier einige häufige Fehlermeldungen und deren Lösungen.

### Verbindungsfehler

- **Nachricht:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die erforderlichen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um sich mit der IDE zu verbinden. Das bedeutet in der Regel, dass die IDE-Begleitererweiterung nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1.  Stelle sicher, dass du die Erweiterung **Qwen Code Companion** in deiner IDE installiert hast und diese aktiviert ist.
    2.  Öffne ein neues Terminalfenster in deiner IDE, damit die richtige Umgebung übernommen wird.

- **Nachricht:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zum IDE-Begleiter wurde unerwartet unterbrochen.
  - **Lösung:** Führe `/ide enable` aus, um eine erneute Verbindung herzustellen. Falls das Problem weiterhin besteht, öffne ein neues Terminalfenster oder starte deine IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI befindet sich außerhalb des Ordners oder Workspaces, den du in deiner IDE geöffnet hast.
  - **Lösung:** Wechsle mit `cd` in das Verzeichnis, das in deiner IDE geöffnet ist, und starte die CLI neu.

- **Meldung:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Ursache:** Du hast keinen Workspace in deiner IDE geöffnet.
  - **Lösung:** Öffne einen Workspace in deiner IDE und starte die CLI neu.

### Allgemeine Fehler

- **Meldung:** `IDE-Integration wird in deiner aktuellen Umgebung nicht unterstützt. Um diese Funktion zu nutzen, führe Qwen Code in einer der folgenden unterstützten IDEs aus: [Liste der IDEs]`
  - **Ursache:** Du führst Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führe Qwen Code über das integrierte Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `Es ist kein Installer für die IDE verfügbar. Bitte installiere die Qwen Code Companion-Erweiterung manuell über den Marketplace.`
  - **Ursache:** Du hast `/ide install` ausgeführt, aber die CLI verfügt nicht über einen automatisierten Installer für deine spezifische IDE.
  - **Lösung:** Öffne den Erweiterungs-Marketplace deiner IDE, suche nach „Qwen Code Companion“ und installiere sie manuell.