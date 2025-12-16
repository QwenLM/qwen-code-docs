# IDE-Integration

Qwen Code kann in Ihre IDE integriert werden, um ein nahtloseres und kontextbezogenes Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, Ihren Arbeitsbereich besser zu verstehen und leistungsstarke Funktionen wie native Diff-Ansichten im Editor zu aktivieren.

Derzeit wird ausschließlich [Visual Studio Code](https://code.visualstudio.com/) und andere Editoren, die VS Code-Erweiterungen unterstützen, unterstützt. Informationen zum Aufbau der Unterstützung für andere Editoren finden Sie in der [IDE Companion Extension Spec](/users/ide-integration/ide-companion-spec).

## Funktionen

- **Arbeitsbereich-Kontext:** Die CLI erhält automatisch Kenntnis von deinem Arbeitsbereich, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt aufgerufenen Dateien** in deinem Arbeitsbereich.
  - Deine aktive Cursor-Position.
  - Jeden Text, den du ausgewählt hast (bis zu einem Limit von 16 KB; längere Auswahl wird gekürzt).

- **Native Diff-Anzeige:** Wenn Qwen Code-Änderungen vorschlägt, kannst du die Änderungen direkt im nativen Diff-Viewer deiner IDE anzeigen lassen. So kannst du die vorgeschlagenen Änderungen nahtlos überprüfen, bearbeiten und akzeptieren oder ablehnen.

- **VS Code-Befehle:** Du kannst direkt über die VS Code-Befehlspalette (`Cmd+Shift+P` oder `Ctrl+Shift+P`) auf die Funktionen von Qwen Code zugreifen:
  - `Qwen Code: Run`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Accept Diff`: Akzeptiert die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Close Diff Editor`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: View Third-Party Notices`: Zeigt die Hinweise zu Drittanbieter-Lizenzen für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatischer Hinweis (Empfohlen)

Wenn Sie Qwen Code in einem unterstützten Editor ausführen, wird Ihre Umgebung automatisch erkannt und Sie werden aufgefordert, eine Verbindung herzustellen. Wenn Sie mit "Ja" antworten, wird die notwendige Einrichtung automatisch durchgeführt, einschließlich der Installation der Begleiterweiterung und der Aktivierung der Verbindung.

### 2. Manuelle Installation über CLI

Falls Sie die Aufforderung zuvor abgelehnt haben oder die Erweiterung manuell installieren möchten, können Sie den folgenden Befehl innerhalb von Qwen Code ausführen:

```
/ide install
```

Dadurch wird die richtige Erweiterung für Ihre IDE gefunden und installiert.

### 3. Manuelle Installation aus einem Marketplace

Sie können die Erweiterung auch direkt aus einem Marketplace installieren.

- **Für Visual Studio Code:** Installieren Sie sie über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code-Forks:** Um Forks von VS Code zu unterstützen, wird die Erweiterung auch im [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Befolgen Sie die Anweisungen Ihres Editors, um Erweiterungen aus diesem Registry zu installieren.

> HINWEIS:
> Die Erweiterung „Qwen Code Companion“ kann sich am Ende der Suchergebnisse befinden. Wenn Sie sie nicht sofort sehen, versuchen Sie, nach unten zu scrollen oder nach „Neu veröffentlicht“ zu sortieren.
>
> Nach der manuellen Installation der Erweiterung müssen Sie `/ide enable` in der CLI ausführen, um die Integration zu aktivieren.

## Verwendung

### Aktivierung und Deaktivierung

Sie können die IDE-Integration über die CLI steuern:

- Um die Verbindung zur IDE zu aktivieren, führen Sie aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führen Sie aus:
  ```
  /ide disable
  ```

Wenn aktiviert, wird Qwen Code automatisch versuchen, sich mit der IDE-Erweiterung zu verbinden.

### Status prüfen

Um den Verbindungsstatus zu prüfen und den Kontext anzuzeigen, den die CLI von der IDE erhalten hat, führen Sie aus:

```
/ide status
```

Falls verbunden, zeigt dieser Befehl die IDE an, mit der die Verbindung besteht, sowie eine Liste der zuletzt geöffneten Dateien, die bekannt sind.

(Hinweis: Die Dateiliste ist auf 10 zuletzt verwendete Dateien innerhalb Ihres Arbeitsbereichs beschränkt und enthält nur lokale Dateien auf dem Datenträger.)

### Arbeiten mit Diffs

Wenn du das Qwen-Modell bittest, eine Datei zu ändern, kann es direkt eine Diff-Ansicht in deinem Editor öffnen.

**Um ein Diff zu akzeptieren**, kannst du eine der folgenden Aktionen durchführen:

- Klicke auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichere die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffne die Befehlspalette und führe **Qwen Code: Accept Diff** aus.
- Antworte mit `yes` in der CLI, wenn du dazu aufgefordert wirst.

**Um ein Diff abzulehnen**, kannst du:

- Klicke auf das **'x'-Symbol** in der Titelleiste des Diff-Editors.
- Schließe den Diff-Editor-Tab.
- Öffne die Befehlspalette und führe **Qwen Code: Close Diff Editor** aus.
- Antworte mit `no` in der CLI, wenn du dazu aufgefordert wirst.

Du kannst auch **die vorgeschlagenen Änderungen direkt in der Diff-Ansicht bearbeiten**, bevor du sie akzeptierst.

Wenn du in der CLI „Yes, allow always“ auswählst, werden die Änderungen nicht mehr im IDE angezeigt, da sie automatisch akzeptiert werden.

## Verwendung mit Sandboxing

Wenn Sie Qwen Code innerhalb einer Sandbox verwenden, beachten Sie bitte Folgendes:

- **Unter macOS:** Die IDE-Integration benötigt Netzwerkzugriff, um mit der IDE-Begleiter-Erweiterung zu kommunizieren. Sie müssen ein Seatbelt-Profil verwenden, das den Netzwerkzugriff erlaubt.
- **In einem Docker-Container:** Wenn Sie Qwen Code innerhalb eines Docker-(oder Podman-)Containers ausführen, kann die IDE-Integration sich weiterhin mit der VS Code-Erweiterung verbinden, die auf Ihrem Host-Rechner läuft. Die CLI ist so konfiguriert, dass sie automatisch den IDE-Server unter `host.docker.internal` findet. Normalerweise ist keine besondere Konfiguration erforderlich, aber Sie sollten sicherstellen, dass Ihre Docker-Netzwerkeinstellungen Verbindungen vom Container zum Host zulassen.

## Fehlerbehebung

Falls Probleme bei der IDE-Integration auftreten, finden Sie hier einige häufige Fehlermeldungen und deren Lösungen.

### Verbindungsfehler

- **Nachricht:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Ursache:** Qwen Code konnte die erforderlichen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um eine Verbindung zur IDE herzustellen. Dies bedeutet in der Regel, dass die IDE-Begleitererweiterung nicht läuft oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1. Stellen Sie sicher, dass Sie die Erweiterung **Qwen Code Companion** in Ihrer IDE installiert haben und diese aktiviert ist.
    2. Öffnen Sie ein neues Terminalfenster in Ihrer IDE, um sicherzustellen, dass die richtige Umgebung übernommen wird.

- **Nachricht:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Ursache:** Die Verbindung zum IDE-Begleiter wurde unterbrochen.
  - **Lösung:** Führen Sie `/ide enable` aus, um eine erneute Verbindung zu versuchen. Falls das Problem weiterhin besteht, öffnen Sie ein neues Terminalfenster oder starten Ihre IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Verbindung getrennt: Ordner stimmen nicht überein. Qwen Code wird an einem anderen Speicherort ausgeführt als der geöffnete Arbeitsbereich in [IDE Name]. Bitte führen Sie die CLI aus demselben Verzeichnis wie Ihr Projektstammverzeichnis aus.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI befindet sich außerhalb des Ordners oder Arbeitsbereichs, den Sie in Ihrer IDE geöffnet haben.
  - **Lösung:** Wechseln Sie mit `cd` in dasselbe Verzeichnis, das in Ihrer IDE geöffnet ist, und starten Sie die CLI neu.

- **Meldung:** `🔴 Verbindung getrennt: Um diese Funktion zu nutzen, öffnen Sie bitte einen Arbeitsbereichsordner in [IDE Name] und versuchen Sie es erneut.`
  - **Ursache:** In Ihrer IDE ist kein Arbeitsbereich geöffnet.
  - **Lösung:** Öffnen Sie einen Arbeitsbereich in Ihrer IDE und starten Sie die CLI neu.

### Allgemeine Fehler

- **Meldung:** `Die IDE-Integration wird in Ihrer aktuellen Umgebung nicht unterstützt. Um diese Funktion zu nutzen, führen Sie Qwen Code in einer der folgenden unterstützten IDEs aus: [Liste der IDEs]`
  - **Ursache:** Sie führen Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führen Sie Qwen Code über das integrierte Terminal einer unterstützten IDE wie z. B. VS Code aus.

- **Meldung:** `Für die IDE ist kein Installer verfügbar. Bitte installieren Sie die Qwen Code Companion-Erweiterung manuell über den Marketplace.`
  - **Ursache:** Sie haben `/ide install` ausgeführt, aber die CLI verfügt nicht über einen automatisierten Installer für Ihre spezifische IDE.
  - **Lösung:** Öffnen Sie den Erweiterungs-Marketplace Ihrer IDE, suchen Sie nach „Qwen Code Companion“ und installieren Sie die Erweiterung manuell.