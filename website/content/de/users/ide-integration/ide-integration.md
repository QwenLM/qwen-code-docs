# IDE-Integration

Qwen Code kann in Ihre IDE integriert werden, um ein nahtloseres und kontextbewussteres Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, Ihren Arbeitsbereich besser zu verstehen, und ermöglicht leistungsstarke Funktionen wie natives In-Editor-Diffing.

Derzeit wird nur [Visual Studio Code](https://code.visualstudio.com/) sowie andere Editoren, die VS Code-Erweiterungen unterstützen, unterstützt. Informationen zum Unterstützen anderer Editoren finden Sie in der [IDE Companion Extension Spec](../ide-integration/ide-companion-spec).

## Funktionen

- **Arbeitsbereichskontext:** Die CLI erhält automatisch Kenntnis über Ihren Arbeitsbereich, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt geöffneten Dateien** in Ihrem Arbeitsbereich.
  - Ihre aktive Cursorposition.
  - Jeden von Ihnen ausgewählten Text (maximal 16 KB; längere Auswahlen werden abgeschnitten).

- **Natives Diffing:** Wenn Qwen Code-Änderungen vorschlägt, können Sie die Änderungen direkt im nativen Diff-Viewer Ihrer IDE anzeigen. So können Sie die vorgeschlagenen Änderungen nahtlos überprüfen, bearbeiten und annehmen oder ablehnen.

- **VS Code-Befehle:** Sie können auf Qwen Code-Funktionen direkt über die VS Code-Befehlspalette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) zugreifen:
  - `Qwen Code: Ausführen`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Diff annehmen`: Übernimmt die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Diff-Editor schließen`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: Drittanbieter-Hinweise anzeigen`: Zeigt die Drittanbieter-Hinweise für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatische Aufforderung (empfohlen)

Wenn Sie Qwen Code in einem unterstützten Editor ausführen, erkennt das Programm automatisch Ihre Umgebung und fordert Sie auf, eine Verbindung herzustellen. Wenn Sie mit „Ja“ antworten, wird die erforderliche Einrichtung automatisch durchgeführt, einschließlich der Installation der Companion-Erweiterung und der Aktivierung der Verbindung.

### 2. Manuelle Installation über die CLI

Wenn Sie die Aufforderung zuvor abgelehnt haben oder die Erweiterung manuell installieren möchten, können Sie den folgenden Befehl in Qwen Code ausführen:

```
/ide install
```

Dieser Befehl findet die richtige Erweiterung für Ihre IDE und installiert sie.

### 3. Manuelle Installation über einen Marketplace

Sie können die Erweiterung auch direkt über einen Marketplace installieren.

- **Für Visual Studio Code:** Installation über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code-Forks:** Um Forks von VS Code zu unterstützen, wird die Erweiterung auch im [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Befolgen Sie die Anweisungen Ihres Editors zur Installation von Erweiterungen aus diesem Registry.

> [!NOTE]
> Die Erweiterung „Qwen Code Companion“ wird möglicherweise weiter unten in den Suchergebnissen angezeigt. Wenn Sie sie nicht sofort sehen, versuchen Sie, nach unten zu scrollen oder nach „Neu veröffentlicht“ zu sortieren.
>
> Nach der manuellen Installation der Erweiterung müssen Sie in der CLI `/ide enable` ausführen, um die Integration zu aktivieren.

## Verwendung

### Aktivieren und Deaktivieren

Sie können die IDE-Integration über die CLI steuern:

- Um die Verbindung zur IDE zu aktivieren, führen Sie aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führen Sie aus:
  ```
  /ide disable
  ```

Wenn die Integration aktiviert ist, versucht Qwen Code automatisch, eine Verbindung zur IDE-Companion-Erweiterung herzustellen.

### Status überprüfen

Um den Verbindungsstatus und den von der IDE empfangenen Kontext zu überprüfen, führen Sie aus:

```
/ide status
```

Wenn eine Verbindung besteht, zeigt dieser Befehl die verbundene IDE und eine Liste der zuletzt geöffneten Dateien an, die bekannt sind.

(Hinweis: Die Dateiliste ist auf die 10 zuletzt im Arbeitsbereich geöffneten Dateien beschränkt und enthält nur lokale Dateien auf der Festplatte.)

### Arbeiten mit Diffs

Wenn Sie das Qwen-Modell bitten, eine Datei zu ändern, kann es eine Diff-Ansicht direkt in Ihrem Editor öffnen.

**Um ein Diff anzunehmen**, können Sie eine der folgenden Aktionen ausführen:

- Klicken Sie auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichern Sie die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffnen Sie die Befehlspalette und führen Sie **Qwen Code: Diff annehmen** aus.
- Antworten Sie in der CLI mit `yes`, wenn Sie dazu aufgefordert werden.

**Um ein Diff abzulehnen**, können Sie:

- Klicken Sie auf das **'x'-Symbol** in der Titelleiste des Diff-Editors.
- Schließen Sie den Tab des Diff-Editors.
- Öffnen Sie die Befehlspalette und führen Sie **Qwen Code: Diff-Editor schließen** aus.
- Antworten Sie in der CLI mit `no`, wenn Sie dazu aufgefordert werden.

Sie können die **vorgeschlagenen Änderungen auch direkt in der Diff-Ansicht bearbeiten**, bevor Sie sie annehmen.

Wenn Sie in der CLI „Ja, immer erlauben“ auswählen, werden Änderungen nicht mehr in der IDE angezeigt, da sie automatisch akzeptiert werden.

## Verwendung mit Sandboxing

Wenn Sie Qwen Code in einer Sandbox verwenden, beachten Sie Folgendes:

- **Auf macOS:** Die IDE-Integration benötigt Netzwerkzugriff, um mit der IDE-Companion-Erweiterung zu kommunizieren. Sie müssen ein Seatbelt-Profil verwenden, das Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn Sie Qwen Code in einem Docker- (oder Podman-) Container ausführen, kann die IDE-Integration dennoch eine Verbindung zur VS Code-Erweiterung auf Ihrem Host-Rechner herstellen. Die CLI ist so konfiguriert, dass sie den IDE-Server automatisch unter `host.docker.internal` findet. Normalerweise ist keine spezielle Konfiguration erforderlich, aber Sie müssen möglicherweise sicherstellen, dass Ihre Docker-Netzwerkkonfiguration Verbindungen vom Container zum Host zulässt.

## Fehlerbehebung

Wenn Probleme mit der IDE-Integration auftreten, finden Sie hier einige häufige Fehlermeldungen und deren Behebung.

### Verbindungsfehler

- **Meldung:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die erforderlichen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um eine Verbindung zur IDE herzustellen. Dies bedeutet normalerweise, dass die IDE-Companion-Erweiterung nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1.  Stellen Sie sicher, dass Sie die **Qwen Code Companion**-Erweiterung in Ihrer IDE installiert haben und sie aktiviert ist.
    2.  Öffnen Sie ein neues Terminal-Fenster in Ihrer IDE, um sicherzustellen, dass es die korrekte Umgebung übernimmt.

- **Meldung:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zur IDE-Companion-Erweiterung wurde unterbrochen.
  - **Lösung:** Führen Sie `/ide enable` aus, um eine erneute Verbindung zu versuchen. Wenn das Problem weiterhin besteht, öffnen Sie ein neues Terminal-Fenster oder starten Sie Ihre IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI liegt außerhalb des Ordners oder Arbeitsbereichs, den Sie in Ihrer IDE geöffnet haben.
  - **Lösung:** Wechseln Sie mit `cd` in dasselbe Verzeichnis, das in Ihrer IDE geöffnet ist, und starten Sie die CLI neu.

- **Meldung:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Ursache:** In Ihrer IDE ist kein Arbeitsbereich geöffnet.
  - **Lösung:** Öffnen Sie einen Arbeitsbereich in Ihrer IDE und starten Sie die CLI neu.

### Allgemeine Fehler

- **Meldung:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Ursache:** Sie führen Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führen Sie Qwen Code im integrierten Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Ursache:** Sie haben `/ide install` ausgeführt, aber die CLI verfügt über keinen automatischen Installer für Ihre spezifische IDE.
  - **Lösung:** Öffnen Sie den Erweiterungs-Marketplace Ihrer IDE, suchen Sie nach „Qwen Code Companion“ und installieren Sie es manuell.