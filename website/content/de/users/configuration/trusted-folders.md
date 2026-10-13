# Vertrauenswürdige Ordner

Die Funktion „Vertrauenswürdige Ordner“ ist eine Sicherheitseinstellung, mit der Sie steuern können, welche Projekte die vollen Fähigkeiten des Qwen Code nutzen dürfen. Sie verhindert, dass potenziell schädlicher Code ausgeführt wird, indem Sie einen Ordner genehmigen müssen, bevor die CLI projektspezifische Konfigurationen daraus lädt.

## Aktivieren der Funktion

Die Funktion „Vertrauenswürdige Ordner“ ist standardmäßig **deaktiviert**. Um sie zu nutzen, müssen Sie sie zuerst in Ihren Einstellungen aktivieren.

Fügen Sie Folgendes zu Ihrer Benutzer-`settings.json`-Datei hinzu:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## So funktioniert's: Der Vertrauensdialog

Sobald die Funktion aktiviert ist, erscheint beim ersten Ausführen des Qwen Code aus einem Ordner automatisch ein Dialog, der Sie auffordert, eine Entscheidung zu treffen:

- **Ordner vertrauen**: Gewährt dem aktuellen Ordner (z. B. `mein-projekt`) volles Vertrauen.
- **Übergeordneten Ordner vertrauen**: Gewährt dem übergeordneten Verzeichnis (z. B. `sichere-projekte`) Vertrauen, wodurch automatisch alle Unterverzeichnisse als vertrauenswürdig gelten. Dies ist nützlich, wenn Sie alle Ihre sicheren Projekte an einem Ort aufbewahren.
- **Nicht vertrauen**: Markiert den Ordner als nicht vertrauenswürdig. Die CLI arbeitet dann im eingeschränkten „Sicheren Modus“.

Ihre Wahl wird in einer zentralen Datei (`~/.qwen/trustedFolders.json`) gespeichert, sodass Sie nur einmal pro Ordner gefragt werden.

Die Funktion ist fail-closed: Bis Sie eine Entscheidung treffen, gilt ein Ordner als **nicht vertrauenswürdig**, nicht als standardmäßig vertrauenswürdig. Wenn diese Datei fehlt – ein neuer Rechner, ein wiederhergestelltes Home-Verzeichnis, ein synchronisiertes Dotfiles-Setup – beginnt jeder Ordner, für den kein vorrangiges Signal entscheidet (siehe „Der Vertrauensprüfungsprozess (Erweitert)“ unten), als nicht vertrauenswürdig, einschließlich zuvor vertrauenswürdiger Ordner. Wenn eine Vertrauensprüfung die Dateiregeln erreicht, ist eine nicht lesbare Datei, ungültige JSONC-Syntax oder ein Nicht-Objekt-Dokument ein harter Konfigurationsfehler. Ein fehlgeschlagener Cache-Ladevorgang veranlasst die CLI, mit „Please fix the configuration file and try again.“ zu stoppen, und die v1-Vertrauensprüfungen des Daemons antworten mit `500 trusted_folders_invalid`; eine frühere IDE-Vertrauensentscheidung kann diese dateibasierten Prüfungen umgehen. Der Grant-Writer validiert die Datei weiterhin, bevor er eine Regel persistiert. Reparieren oder entfernen Sie die Datei manuell und starten Sie dann den Daemon neu, um den fehlgeschlagenen Ladevorgang zu bereinigen. Kommentare und abschließende Kommata werden akzeptiert. Ungültige Trust-Level-Werte werden vom Grant-Writer und v2-Policy-Reader erkannt, aber nicht vom Legacy-v1-Reader validiert; v2 meldet Policy-Fehler als `200` mit `configured.state: "error"`. Eine Datei, die nach dem Cache-Ladevorgang ungültig wird, kann stattdessen beim Grant-Schreiben mit `500 internal_error` fehlschlagen oder bei der Policy-Verifizierung nach dem Schreiben mit `409 trust_grant_ineffective`.

## Warum Vertrauen wichtig ist: Auswirkungen eines nicht vertrauenswürdigen Arbeitsbereichs

Wenn ein Ordner **nicht vertrauenswürdig** ist, arbeitet der Qwen Code im eingeschränkten „Sicheren Modus“, um Sie zu schützen. In diesem Modus sind folgende Funktionen deaktiviert:

1.  **Arbeitsbereichseinstellungen werden ignoriert**: Die CLI lädt die `.qwen/settings.json`-Datei des Projekts **nicht**. Dadurch wird das Laden von benutzerdefinierten Tools und anderen potenziell gefährlichen Konfigurationen verhindert.

2.  **Umgebungsvariablen werden ignoriert**: Die CLI lädt **keine** `.env`-Dateien aus dem Projekt.

3.  **Erweiterungsverwaltung ist eingeschränkt**: Sie können **keine** Erweiterungen installieren, aktualisieren oder deinstallieren.

4.  **Automatische Bestätigung von Tools ist deaktiviert**: Sie werden immer gefragt, bevor ein Tool ausgeführt wird, selbst wenn Sie die automatische Bestätigung global aktiviert haben.

5.  **Automatisches Laden des Arbeitsspeichers ist deaktiviert**: Die CLI lädt keine Dateien automatisch in den Kontext aus Verzeichnissen, die in lokalen Einstellungen festgelegt wurden.

Das Gewähren von Vertrauen für einen Ordner schaltet die volle Funktionalität des Qwen Code für diesen Arbeitsbereich frei.

## Verwalten Ihrer Vertrauenseinstellungen

Wenn Sie eine Entscheidung ändern oder alle Ihre Einstellungen einsehen möchten, haben Sie mehrere Möglichkeiten:

- **Vertrauensstatus des aktuellen Ordners ändern**: Führen Sie den Befehl `/permissions` in der CLI aus. Daraufhin wird derselbe interaktive Dialog angezeigt, in dem Sie die Vertrauensstufe für den aktuellen Ordner ändern können.

- **Einem Arbeitsbereich über die WebShell vertrauen**: Öffnen Sie die Arbeitsbereichsübersicht und verwenden Sie die Aktion **Trust** für einen nicht vertrauenswürdigen Arbeitsbereich. Dies zeichnet dieselbe Entscheidung auf, ohne ein Terminal zu benötigen – dies ist der Rückweg, wenn jeder Arbeitsbereich als nicht vertrauenswürdig angezeigt wurde, weil keine Regel sie entschieden hat. Die Aktion erscheint nur, wenn der verbundene Daemon `workspace_trust_grant` ankündigt, was nur dort geschieht, wo Trust-Hot-Reload die Entscheidung auf die laufende Runtime anwendet – ein Daemon, der die Grant-Routen ohne Hot-Reload bereitstellt, blendet die Aktion aus. Dort aktualisiert ein über die eigene API dieses Daemons aufgezeichneter Grant die Vertrauensdatei und den v1-Vertrauensstatus sofort, aber startup-gebundene Runtime-Gates erfordern einen Neustart. Eine von einem separaten Terminalprozess oder einer Dateibearbeitung aufgezeichnete Entscheidung ist für den zwischengespeicherten v1-Status des Daemons nicht sofort sichtbar; starten Sie den Daemon neu, um sie zu laden. Wenn die Aktion verfügbar ist, wird der Arbeitsbereich vertrauenswürdig, sobald der Daemon seine Runtime neu aufgebaut hat, was einen Moment dauert.

- **Alle Vertrauensregeln anzeigen**: Um eine vollständige Liste aller Ihrer vertrauenswürdigen und nicht vertrauenswürdigen Ordnerregeln zu sehen, können Sie den Inhalt der Datei `~/.qwen/trustedFolders.json` in Ihrem Home-Verzeichnis einsehen.

## Der Vertrauensprüfungsprozess (Erweitert)

Für fortgeschrittene Benutzer ist es hilfreich, die genaue Reihenfolge der Vorgänge zu kennen, wie Vertrauen bestimmt wird:

1.  **IDE-Vertrauenssignal**: Wenn Sie die [IDE-Integration](../ide-integration/ide-integration) verwenden, fragt die CLI zuerst die IDE, ob der Arbeitsbereich vertrauenswürdig ist. Die Antwort der IDE hat höchste Priorität.

2.  **Lokale Vertrauensdatei**: Wenn keine IDE verbunden ist, prüft die CLI die zentrale Datei `~/.qwen/trustedFolders.json`.