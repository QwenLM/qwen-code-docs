# Vertrauenswürdige Ordner

Die Funktion „Vertrauenswürdige Ordner“ ist eine Sicherheitseinstellung, die Ihnen Kontrolle darüber gibt, welche Projekte die vollen Funktionen von Qwen Code nutzen dürfen. Sie verhindert das Ausführen potenziell bösartigen Codes, indem sie Sie auffordert, einen Ordner zu genehmigen, bevor die CLI projektspezifische Konfigurationen daraus lädt.

## Aktivieren der Funktion

Die Funktion „Vertrauenswürdige Ordner“ ist **standardmäßig deaktiviert**. Um sie zu verwenden, müssen Sie sie zunächst in Ihren Einstellungen aktivieren.

Fügen Sie Folgendes zu Ihrer benutzerdefinierten `settings.json`-Datei hinzu:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## So funktioniert es: Der Vertrauensdialog

Sobald das Feature aktiviert ist, wird beim ersten Ausführen von Qwen Code aus einem Ordner heraus automatisch ein Dialog angezeigt, der dich auffordert, eine Auswahl zu treffen:

- **Ordner vertrauen**: Gewährt volles Vertrauen für den aktuellen Ordner (z. B. `my-project`).
- **Übergeordneten Ordner vertrauen**: Gewährt Vertrauen für das übergeordnete Verzeichnis (z. B. `safe-projects`), wodurch automatisch auch alle darin enthaltenen Unterordner vertraut werden. Dies ist nützlich, wenn du alle deine sicheren Projekte an einem Ort aufbewahrst.
- **Nicht vertrauen**: Markiert den Ordner als nicht vertrauenswürdig. Die CLI arbeitet dann im eingeschränkten „sicheren Modus“.

Deine Auswahl wird in einer zentralen Datei gespeichert (`~/.qwen/trustedFolders.json`), sodass du pro Ordner nur einmal gefragt wirst.

## Warum Vertrauen wichtig ist: Die Auswirkungen eines nicht vertrauenswürdigen Arbeitsbereichs

Wenn ein Ordner **nicht vertrauenswürdig** ist, wird Qwen Code in einem eingeschränkten „sicheren Modus“ ausgeführt, um Sie zu schützen. In diesem Modus sind die folgenden Funktionen deaktiviert:

1.  **Arbeitsbereichseinstellungen werden ignoriert**: Die CLI lädt **nicht** die Datei `.qwen/settings.json` aus dem Projekt. Dadurch wird das Laden von benutzerdefinierten Tools und anderen potenziell gefährlichen Konfigurationen verhindert.

2.  **Umgebungsvariablen werden ignoriert**: Die CLI lädt **keine** `.env`-Dateien aus dem Projekt.

3.  **Erweiterungsverwaltung ist eingeschränkt**: Sie können **keine Erweiterungen installieren, aktualisieren oder deinstallieren**.

4.  **Automatische Tool-Bestätigung ist deaktiviert**: Sie erhalten immer eine Aufforderung, bevor ein Tool ausgeführt wird, selbst wenn die automatische Bestätigung global aktiviert ist.

5.  **Automatisches Laden des Speichers ist deaktiviert**: Die CLI lädt keine Dateien automatisch in den Kontext aus Verzeichnissen, die in den lokalen Einstellungen angegeben sind.

Das Erteilen von Vertrauen für einen Ordner entsperrt die vollständige Funktionalität von Qwen Code für diesen Arbeitsbereich.

## Verwalten Ihrer Vertrauenseinstellungen

Wenn Sie eine Entscheidung ändern oder alle Ihre Einstellungen einsehen möchten, haben Sie mehrere Optionen:

- **Vertrauen des aktuellen Ordners ändern**: Führen Sie den Befehl `/permissions` innerhalb der CLI aus. Daraufhin wird derselbe interaktive Dialog angezeigt, in dem Sie das Vertrauensniveau für den aktuellen Ordner ändern können.

- **Alle Vertrauensregeln anzeigen**: Um eine vollständige Liste aller vertrauten und nicht vertrauten Ordnerregeln einzusehen, können Sie den Inhalt der Datei `~/.qwen/trustedFolders.json` in Ihrem Home-Verzeichnis prüfen.

## Der Vertrauensprüfungsprozess (Erweitert)

Für fortgeschrittene Benutzer ist es hilfreich, die genaue Reihenfolge der Vorgänge zu kennen, nach der das Vertrauen bestimmt wird:

1.  **IDE-Vertrauenssignal**: Wenn Sie die [IDE-Integration](/users/ide-integration/ide-integration) verwenden, fragt die CLI zunächst die IDE, ob der Arbeitsbereich vertrauenswürdig ist. Die Antwort der IDE hat höchste Priorität.

2.  **Lokale Vertrauensdatei**: Wenn die IDE nicht verbunden ist, prüft die CLI die zentrale Datei `~/.qwen/trustedFolders.json`.