# IDE-Integration

Qwen Code kann in Ihre IDE integriert werden, um ein nahtloseres und kontextbewussteres Erlebnis zu bieten. Diese Integration ermöglicht es der CLI, Ihren Arbeitsbereich besser zu verstehen, und aktiviert leistungsstarke Funktionen wie native Diff-Ansichten direkt im Editor.

Derzeit wird ausschließlich [Visual Studio Code](https://code.visualstudio.com/) sowie andere Editoren, die VS Code-Erweiterungen unterstützen, unterstützt. Um Unterstützung für weitere Editoren zu implementieren, siehe die [IDE Companion Extension Spec](../ide-integration/ide-companion-spec).

## Funktionen

- **Arbeitsbereichskontext:** Die CLI erkennt automatisch Ihren Arbeitsbereich, um relevantere und genauere Antworten zu liefern. Dieser Kontext umfasst:
  - Die **10 zuletzt geöffneten Dateien** in Ihrem Arbeitsbereich.
  - Ihre aktuelle Cursorposition.
  - Jeglichen ausgewählten Text (maximal 16 KB; längere Auswahl wird abgeschnitten).

- **Native Diff-Ansicht:** Wenn Qwen Codeänderungen vorschlägt, können Sie die Änderungen direkt im nativen Diff-Viewer Ihrer IDE anzeigen. So können Sie die vorgeschlagenen Änderungen problemlos überprüfen, bearbeiten sowie akzeptieren oder ablehnen.

- **VS Code-Befehle:** Sie können auf Qwen Code-Funktionen direkt über die VS Code-Befehlspalette zugreifen (`Cmd+Shift+P` oder `Ctrl+Shift+P`):
  - `Qwen Code: Ausführen`: Startet eine neue Qwen Code-Sitzung im integrierten Terminal.
  - `Qwen Code: Diff akzeptieren`: Akzeptiert die Änderungen im aktiven Diff-Editor.
  - `Qwen Code: Diff-Editor schließen`: Lehnt die Änderungen ab und schließt den aktiven Diff-Editor.
  - `Qwen Code: Hinweise zu Drittanbieter-Software anzeigen`: Zeigt die Hinweise zu Drittanbieter-Software für die Erweiterung an.

## Installation und Einrichtung

Es gibt drei Möglichkeiten, die IDE-Integration einzurichten:

### 1. Automatische Aufforderung (empfohlen)

Wenn Sie Qwen Code innerhalb eines unterstützten Editors ausführen, erkennt es automatisch Ihre Umgebung und fordert Sie zur Verbindung auf. Wenn Sie „Ja“ antworten, wird die erforderliche Einrichtung automatisch durchgeführt – dazu gehört die Installation der Begleiterweiterung und die Aktivierung der Verbindung.

### 2. Manuelle Installation über die Befehlszeile (CLI)

Falls Sie die Aufforderung zuvor abgelehnt haben oder die Erweiterung manuell installieren möchten, führen Sie den folgenden Befehl in Qwen Code aus:

```
/ide install
```

Damit wird die passende Erweiterung für Ihre IDE ermittelt und installiert.

### 3. Manuelle Installation über einen Marktplatz

Sie können die Erweiterung auch direkt über einen Marktplatz installieren.

- **Für Visual Studio Code:** Installieren Sie sie über den [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Für VS Code-Forks:** Um Forks von VS Code zu unterstützen, ist die Erweiterung zudem im [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) veröffentlicht. Befolgen Sie die Anweisungen Ihres Editors zum Installieren von Erweiterungen aus diesem Registry.

> NOTE:
> Die Erweiterung „Qwen Code Companion“ kann weiter unten in den Suchergebnissen erscheinen. Falls Sie sie nicht sofort sehen, versuchen Sie, nach unten zu scrollen oder nach „Kürzlich veröffentlicht“ zu sortieren.
>
> Nach der manuellen Installation der Erweiterung müssen Sie den Befehl `/ide enable` in der CLI ausführen, um die Integration zu aktivieren.

## Verwendung

### Aktivieren und Deaktivieren

Sie können die IDE-Integration über die Befehlszeilenschnittstelle steuern:

- Um die Verbindung zur IDE zu aktivieren, führen Sie aus:
  ```
  /ide enable
  ```
- Um die Verbindung zu deaktivieren, führen Sie aus:
  ```
  /ide disable
  ```

Wenn die Integration aktiviert ist, versucht Qwen Code automatisch, eine Verbindung zur IDE-Begleitererweiterung herzustellen.

### Status überprüfen

Um den Verbindungsstatus zu überprüfen und den Kontext anzuzeigen, den die CLI von der IDE empfangen hat, führen Sie aus:

```
/ide status
```

Falls eine Verbindung besteht, zeigt dieser Befehl die verbundene IDE sowie eine Liste der zuletzt geöffneten Dateien an, die der CLI bekannt sind.

(Hinweis: Die Dateiliste ist auf die zuletzt zugegriffenen 10 Dateien innerhalb Ihres Arbeitsbereichs beschränkt und enthält ausschließlich lokale Dateien auf dem Datenträger.)

### Mit Diffs arbeiten

Wenn Sie das Qwen-Modell auffordern, eine Datei zu ändern, kann es direkt in Ihrem Editor eine Diff-Ansicht öffnen.

**Um einen Diff anzunehmen**, können Sie eine der folgenden Aktionen durchführen:

- Klicken Sie auf das **Häkchen-Symbol** in der Titelleiste des Diff-Editors.
- Speichern Sie die Datei (z. B. mit `Cmd+S` oder `Ctrl+S`).
- Öffnen Sie die Befehlspalette und führen Sie **Qwen Code: Diff akzeptieren** aus.
- Antworten Sie in der CLI bei entsprechender Aufforderung mit `yes`.

**Um einen Diff abzulehnen**, können Sie Folgendes tun:

- Klicken Sie auf das **„x“-Symbol** in der Titelleiste des Diff-Editors.
- Schließen Sie den Tab des Diff-Editors.
- Öffnen Sie die Befehlspalette und führen Sie **Qwen Code: Diff-Editor schließen** aus.
- Antworten Sie in der CLI bei entsprechender Aufforderung mit `no`.

Sie können die vorgeschlagenen Änderungen zudem **direkt in der Diff-Ansicht bearbeiten**, bevor Sie sie akzeptieren.

Wenn Sie in der CLI „Ja, immer erlauben“ auswählen, werden Änderungen nicht mehr in der IDE angezeigt, da sie automatisch akzeptiert werden.

## Verwendung mit Sandbox

Wenn Sie Qwen Code innerhalb einer Sandbox verwenden, beachten Sie bitte Folgendes:

- **Unter macOS:** Die IDE-Integration erfordert Netzwerkzugriff, um mit der IDE-Begleitererweiterung zu kommunizieren. Sie müssen ein Seatbelt-Profil verwenden, das Netzwerkzugriff zulässt.
- **In einem Docker-Container:** Wenn Sie Qwen Code innerhalb eines Docker- (oder Podman-)Containers ausführen, kann die IDE-Integration dennoch eine Verbindung zur VS Code-Erweiterung herstellen, die auf Ihrem Host-System läuft. Die CLI ist so konfiguriert, dass sie den IDE-Server automatisch unter `host.docker.internal` findet. In der Regel ist keine besondere Konfiguration erforderlich, allerdings müssen Sie möglicherweise sicherstellen, dass Ihre Docker-Netzwerkkonfiguration Verbindungen vom Container zum Host zulässt.

## Problembehandlung

Falls bei der IDE-Integration Probleme auftreten, finden Sie hier einige häufige Fehlermeldungen sowie deren Lösung.

### Verbindungsfehler

- **Meldung:** `🔴 Getrennt: Verbindung zur IDE-Begleitererweiterung für [IDE-Name] fehlgeschlagen. Stellen Sie sicher, dass die Erweiterung ausgeführt wird, und versuchen Sie, Ihr Terminal neu zu starten. Um die Erweiterung zu installieren, führen Sie `/ide install` aus.`
  - **Ursache:** Qwen Code konnte die erforderlichen Umgebungsvariablen (`QWEN_CODE_IDE_WORKSPACE_PATH` oder `QWEN_CODE_IDE_SERVER_PORT`) nicht finden, um eine Verbindung zur IDE herzustellen. Dies bedeutet in der Regel, dass die IDE-Begleitererweiterung nicht ausgeführt wird oder nicht korrekt initialisiert wurde.
  - **Lösung:**
    1.  Stellen Sie sicher, dass Sie die Erweiterung **Qwen Code Companion** in Ihrer IDE installiert und aktiviert haben.
    2.  Öffnen Sie ein neues Terminalfenster in Ihrer IDE, um sicherzustellen, dass es die richtigen Umgebungsvariablen übernimmt.

- **Meldung:** `🔴 Getrennt: IDE-Verbindungsfehler. Die Verbindung ging unerwartet verloren. Versuchen Sie, sich erneut zu verbinden, indem Sie `/ide enable` ausführen.`
  - **Ursache:** Die Verbindung zur IDE-Begleitererweiterung ging verloren.
  - **Lösung:** Führen Sie `/ide enable` aus, um erneut eine Verbindung herzustellen. Wenn das Problem weiterhin besteht, öffnen Sie ein neues Terminalfenster oder starten Sie Ihre IDE neu.

### Konfigurationsfehler

- **Meldung:** `🔴 Getrennt: Verzeichnis stimmt nicht überein. Qwen Code wird an einem anderen Ort ausgeführt als der in [IDE-Name] geöffnete Arbeitsbereich. Bitte führen Sie die CLI aus demselben Verzeichnis wie dem Stammordner Ihres Projekts aus.`
  - **Ursache:** Das aktuelle Arbeitsverzeichnis der CLI liegt außerhalb des Ordners oder Arbeitsbereichs, den Sie in Ihrer IDE geöffnet haben.
  - **Lösung:** Wechseln Sie mit `cd` in dasselbe Verzeichnis, das in Ihrer IDE geöffnet ist, und starten Sie die CLI neu.

- **Meldung:** `🔴 Getrennt: Um diese Funktion nutzen zu können, öffnen Sie bitte einen Arbeitsbereichsordner in [IDE-Name] und versuchen Sie es erneut.`
  - **Ursache:** In Ihrer IDE ist kein Arbeitsbereich geöffnet.
  - **Lösung:** Öffnen Sie einen Arbeitsbereich in Ihrer IDE und starten Sie die CLI neu.

### Allgemeine Fehler

- **Meldung:** `Die IDE-Integration wird in Ihrer aktuellen Umgebung nicht unterstützt. Um diese Funktion zu nutzen, führen Sie Qwen Code in einer der unterstützten IDEs aus: [Liste der IDEs]`
  - **Ursache:** Sie führen Qwen Code in einem Terminal oder einer Umgebung aus, die keine unterstützte IDE ist.
  - **Lösung:** Führen Sie Qwen Code über das integrierte Terminal einer unterstützten IDE wie VS Code aus.

- **Meldung:** `Für diese IDE ist kein Installationsprogramm verfügbar. Bitte installieren Sie die Erweiterung „Qwen Code Companion“ manuell über den Marktplatz.`
  - **Ursache:** Sie haben `/ide install` ausgeführt, aber die CLI verfügt über keinen automatisierten Installer für Ihre spezifische IDE.
  - **Lösung:** Öffnen Sie den Erweiterungsmarktplatz Ihrer IDE, suchen Sie nach „Qwen Code Companion“ und installieren Sie die Erweiterung manuell.