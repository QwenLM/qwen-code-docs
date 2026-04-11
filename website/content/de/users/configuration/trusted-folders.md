# Vertrauenswürdige Ordner

Die Funktion „Vertrauenswürdige Ordner“ ist eine Sicherheitseinstellung, mit der du kontrollieren kannst, welche Projekte die vollständigen Funktionen von Qwen Code nutzen dürfen. Sie verhindert die Ausführung von potenziell schädlichem Code, indem sie dich auffordert, einen Ordner zu genehmigen, bevor die CLI projektspezifische Konfigurationen daraus lädt.

## Aktivieren der Funktion

Die Funktion „Vertrauenswürdige Ordner“ ist **standardmäßig deaktiviert**. Um sie zu nutzen, musst du sie zunächst in deinen Einstellungen aktivieren.

Füge Folgendes zu deiner `settings.json`-Datei im Benutzerverzeichnis hinzu:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## Funktionsweise: Der Vertrauensdialog

Sobald die Funktion aktiviert ist, erscheint beim ersten Start von Qwen Code aus einem Ordner automatisch ein Dialog, in dem du eine Auswahl treffen musst:

- **Ordner vertrauen**: Gewährt dem aktuellen Ordner (z. B. `my-project`) volles Vertrauen.
- **Übergeordnetem Ordner vertrauen**: Gewährt dem übergeordneten Verzeichnis (z. B. `safe-projects`) Vertrauen, wodurch automatisch auch alle Unterverzeichnisse als vertrauenswürdig eingestuft werden. Dies ist nützlich, wenn du alle deine sicheren Projekte an einem Ort speicherst.
- **Nicht vertrauen**: Markiert den Ordner als nicht vertrauenswürdig. Die CLI arbeitet dann in einem eingeschränkten „Sicherer Modus“.

Deine Auswahl wird in einer zentralen Datei (`~/.qwen/trustedFolders.json`) gespeichert, sodass du pro Ordner nur einmal gefragt wirst.

## Warum Vertrauen wichtig ist: Auswirkungen eines nicht vertrauenswürdigen Workspaces

Wenn ein Ordner als **nicht vertrauenswürdig** eingestuft ist, führt Qwen Code zum Schutz einen eingeschränkten „Sicherer Modus“ aus. In diesem Modus sind folgende Funktionen deaktiviert:

1.  **Workspace-Einstellungen werden ignoriert**: Die CLI lädt die `.qwen/settings.json`-Datei aus dem Projekt **nicht**. Dies verhindert das Laden benutzerdefinierter Tools und anderer potenziell gefährlicher Konfigurationen.

2.  **Umgebungsvariablen werden ignoriert**: Die CLI lädt keine `.env`-Dateien aus dem Projekt.

3.  **Erweiterungsverwaltung ist eingeschränkt**: Du kannst Erweiterungen **nicht installieren, aktualisieren oder deinstallieren**.

4.  **Automatische Tool-Akzeptanz ist deaktiviert**: Du wirst vor der Ausführung jedes Tools immer zur Bestätigung aufgefordert, selbst wenn die automatische Akzeptanz global aktiviert ist.

5.  **Automatisches Memory-Laden ist deaktiviert**: Die CLI lädt Dateien nicht automatisch aus in lokalen Einstellungen angegebenen Verzeichnissen in den Kontext.

Wenn du einem Ordner vertraust, wird die volle Funktionalität von Qwen Code für diesen Workspace freigeschaltet.

## Verwalten deiner Vertrauenseinstellungen

Wenn du eine Entscheidung ändern oder alle deine Einstellungen einsehen möchtest, hast du folgende Möglichkeiten:

- **Vertrauensstufe des aktuellen Ordners ändern**: Führe den Befehl `/permissions` innerhalb der CLI aus. Dadurch wird derselbe interaktive Dialog geöffnet, in dem du die Vertrauensstufe für den aktuellen Ordner ändern kannst.

- **Alle Vertrauensregeln anzeigen**: Um eine vollständige Liste aller Regeln für vertrauenswürdige und nicht vertrauenswürdige Ordner einzusehen, kannst du den Inhalt der Datei `~/.qwen/trustedFolders.json` in deinem Home-Verzeichnis überprüfen.

## Der Vertrauensprüfungsprozess (Fortgeschritten)

Für fortgeschrittene Nutzer ist es hilfreich, die genaue Reihenfolge zu kennen, in der die Vertrauenswürdigkeit ermittelt wird:

1.  **IDE-Vertrauenssignal**: Wenn du die [IDE-Integration](../ide-integration/ide-integration) verwendest, fragt die CLI zunächst die IDE, ob der Workspace als vertrauenswürdig eingestuft ist. Die Antwort der IDE hat die höchste Priorität.

2.  **Lokale Vertrauensdatei**: Wenn keine Verbindung zur IDE besteht, prüft die CLI die zentrale Datei `~/.qwen/trustedFolders.json`.