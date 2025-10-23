# Vertrauenswürdige Ordner

Die Funktion "Vertrauenswürdige Ordner" ist eine Sicherheitseinstellung, die dir Kontrolle darüber gibt, welche Projekte die vollen Funktionen von Qwen Code nutzen dürfen. Sie verhindert, dass potenziell schädlicher Code ausgeführt wird, indem du einen Ordner bestätigen musst, bevor die CLI projekt-spezifische Konfigurationen daraus lädt.

## Aktivieren der Funktion

Die Funktion "Vertrauenswürdige Ordner" ist standardmäßig **deaktiviert**. Um sie zu verwenden, musst du sie zunächst in deinen Einstellungen aktivieren.

Füge Folgendes zu deiner `settings.json`-Datei hinzu:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## So funktioniert es: Der Trust-Dialog

Sobald das Feature aktiviert ist, wird beim ersten Ausführen von Qwen Code aus einem Ordner heraus automatisch ein Dialog angezeigt, der dich auffordert, eine Auswahl zu treffen:

- **Trust folder**: Gewährt volles Vertrauen für den aktuellen Ordner (z. B. `my-project`).
- **Trust parent folder**: Gewährt Vertrauen für das übergeordnete Verzeichnis (z. B. `safe-projects`), wodurch automatisch auch alle darin enthaltenen Unterordner vertraut werden. Das ist nützlich, wenn du alle deine sicheren Projekte an einem Ort speicherst.
- **Don't trust**: Markiert den Ordner als nicht vertrauenswürdig. Die CLI arbeitet dann im eingeschränkten „Safe Mode“.

Deine Auswahl wird in einer zentralen Datei gespeichert (`~/.qwen/trustedFolders.json`), sodass du pro Ordner nur einmal danach gefragt wirst.

## Warum Vertrauen wichtig ist: Die Auswirkungen eines nicht vertrauenswürdigen Arbeitsbereichs

Wenn ein Ordner **nicht vertrauenswürdig** ist, wird Qwen Code in einem eingeschränkten „Safe Mode“ ausgeführt, um dich zu schützen. In diesem Modus sind die folgenden Funktionen deaktiviert:

1.  **Workspace-Einstellungen werden ignoriert**: Die CLI lädt **nicht** die Datei `.qwen/settings.json` aus dem Projekt. Dadurch wird verhindert, dass benutzerdefinierte Tools und andere potenziell gefährliche Konfigurationen geladen werden.

2.  **Umgebungsvariablen werden ignoriert**: Die CLI lädt **keine** `.env`-Dateien aus dem Projekt.

3.  **Erweiterungsverwaltung ist eingeschränkt**: Du kannst **keine Erweiterungen installieren, aktualisieren oder deinstallieren**.

4.  **Automatische Tool-Genehmigung ist deaktiviert**: Vor der Ausführung jedes Tools erscheint eine Rückfrage, selbst wenn du die automatische Genehmigung global aktiviert hast.

5.  **Automatisches Laden des Speichers ist deaktiviert**: Die CLI lädt keine Dateien automatisch in den Kontext aus Verzeichnissen, die in den lokalen Einstellungen angegeben sind.

Wenn du einem Ordner vertraust, wird die volle Funktionalität von Qwen Code für diesen Workspace freigeschaltet.

## Verwalten deiner Trust-Einstellungen

Wenn du eine Entscheidung ändern oder alle deine Einstellungen einsehen möchtest, hast du mehrere Optionen:

- **Trust des aktuellen Ordners ändern**: Führe den Befehl `/permissions` innerhalb der CLI aus. Es öffnet sich derselbe interaktive Dialog, in dem du das Trust-Level für den aktuellen Ordner ändern kannst.

- **Alle Trust-Regeln anzeigen**: Um eine vollständige Liste aller vertrauten und nicht vertrauten Ordnerregeln zu sehen, kannst du den Inhalt der Datei `~/.qwen/trustedFolders.json` in deinem Home-Verzeichnis prüfen.

## Der Trust-Check-Prozess (Fortgeschritten)

Für fortgeschrittene Benutzer ist es hilfreich, die genaue Reihenfolge zu kennen, nach der der Trust-Status ermittelt wird:

1.  **IDE Trust-Signal**: Wenn du die [IDE-Integration](./ide-integration.md) verwendest, fragt die CLI zunächst die IDE, ob der Workspace als vertrauenswürdig eingestuft ist. Die Antwort der IDE hat höchste Priorität.

2.  **Lokale Trust-Datei**: Wenn keine Verbindung zur IDE besteht, prüft die CLI die zentrale Datei `~/.qwen/trustedFolders.json`.