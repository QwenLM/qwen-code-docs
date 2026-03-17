# Vertrauenswürdige Ordner

Die Funktion „Vertrauenswürdige Ordner“ ist eine Sicherheitseinstellung, mit der Sie steuern können, für welche Projekte die vollständigen Funktionen von Qwen Code verfügbar sind. Sie verhindert das Ausführen potenziell schädlichen Codes, indem Sie vor dem Laden projektspezifischer Konfigurationen durch die CLI zur Genehmigung eines Ordners aufgefordert werden.

## Aktivieren der Funktion

Die Funktion „Vertrauenswürdige Ordner“ ist **standardmäßig deaktiviert**. Um sie zu nutzen, müssen Sie sie zunächst in Ihren Einstellungen aktivieren.

Fügen Sie die folgende Konfiguration in Ihre benutzerspezifische Datei `settings.json` ein:

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

Sobald die Funktion aktiviert ist, wird beim ersten Ausführen von Qwen Code aus einem Ordner automatisch ein Dialogfeld angezeigt, in dem Sie eine Auswahl treffen müssen:

- **Ordner vertrauen**: Gewährt dem aktuellen Ordner (z. B. `my-project`) uneingeschränktes Vertrauen.  
- **Übergeordneten Ordner vertrauen**: Gewährt Vertrauen für das übergeordnete Verzeichnis (z. B. `safe-projects`), wodurch automatisch auch alle darin enthaltenen Unterverzeichnisse vertraut werden. Dies ist nützlich, wenn Sie alle Ihre sicheren Projekte an einem Ort speichern.  
- **Nicht vertrauen**: Markiert den Ordner als nicht vertrauenswürdig. Die CLI arbeitet dann im eingeschränkten „Sicherheitsmodus“.

Ihre Auswahl wird in einer zentralen Datei gespeichert (`~/.qwen/trustedFolders.json`), sodass Sie pro Ordner nur einmal gefragt werden.

## Warum Vertrauen wichtig ist: Die Auswirkungen eines nicht vertrauenswürdigen Arbeitsbereichs

Wenn ein Ordner **nicht vertrauenswürdig** ist, wird Qwen Code im eingeschränkten „Sicherheitsmodus“ ausgeführt, um Sie zu schützen. In diesem Modus sind folgende Funktionen deaktiviert:

1.  **Arbeitsbereichseinstellungen werden ignoriert**: Die CLI lädt **nicht** die Datei `.qwen/settings.json` aus dem Projekt. Dadurch wird das Laden benutzerdefinierter Tools und anderer potenziell gefährlicher Konfigurationen verhindert.

2.  **Umgebungsvariablen werden ignoriert**: Die CLI lädt **keine** `.env`-Dateien aus dem Projekt.

3.  **Erweiterungsverwaltung ist eingeschränkt**: Sie können **keine Erweiterungen installieren, aktualisieren oder deinstallieren**.

4.  **Automatische Tool-Akzeptanz ist deaktiviert**: Sie werden immer vor der Ausführung eines Tools gefragt, auch wenn Sie die automatische Akzeptanz global aktiviert haben.

5.  **Automatisches Laden von Speicherinhalten ist deaktiviert**: Die CLI lädt keine Dateien automatisch in den Kontext aus Verzeichnissen, die in den lokalen Einstellungen angegeben sind.

Wenn Sie einem Ordner Vertrauen schenken, wird die volle Funktionalität von Qwen Code für diesen Arbeitsbereich freigegeben.

## Verwalten Ihrer Vertrauenseinstellungen

Falls Sie eine Entscheidung ändern oder alle Ihre Einstellungen anzeigen möchten, haben Sie mehrere Möglichkeiten:

- **Vertrauenseinstellung des aktuellen Ordners ändern**: Führen Sie den Befehl `/permissions` über die Befehlszeilenschnittstelle (CLI) aus. Daraufhin wird der gleiche interaktive Dialog angezeigt, mit dem Sie die Vertrauensstufe für den aktuellen Ordner ändern können.

- **Alle Vertrauensregeln anzeigen**: Um eine vollständige Liste aller vertrauenswürdigen und nicht vertrauenswürdigen Ordnerregeln anzuzeigen, können Sie den Inhalt der Datei `~/.qwen/trustedFolders.json` in Ihrem Home-Verzeichnis einsehen.

## Der Vertrauensprüfungsprozess (Fortgeschritten)

Für fortgeschrittene Benutzer ist es hilfreich, die genaue Reihenfolge der Schritte bei der Bestimmung des Vertrauens zu kennen:

1.  **IDE-Vertrauenssignal**: Wenn Sie die [IDE-Integration](../ide-integration/ide-integration) verwenden, fragt die CLI zunächst die IDE ab, ob der Workspace als vertrauenswürdig eingestuft ist. Die Antwort der IDE hat höchste Priorität.

2.  **Lokale Vertrauensdatei**: Falls keine Verbindung zur IDE besteht, prüft die CLI die zentrale Datei `~/.qwen/trustedFolders.json`.