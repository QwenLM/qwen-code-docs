# Agent Skills (Experimentell)

> Erstellen, verwalten und teilen Sie Skills, um die Fähigkeiten von Qwen Code zu erweitern.

Diese Anleitung zeigt Ihnen, wie Sie Agent Skills in **Qwen Code** erstellen, verwenden und verwalten. Skills sind modulare Fähigkeiten, die die Effektivität des Modells durch organisierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

> [!note]
>
> Skills sind derzeit **experimentell** und müssen mit `--experimental-skills` aktiviert werden.

## Voraussetzungen

- Qwen Code (aktuelle Version)

## So aktivieren Sie

### Über CLI-Flag

```bash
qwen --experimental-skills
```

### Über settings.json

Fügen Sie Ihrer `~/.qwen/settings.json` oder der Projekt-`.qwen/settings.json` hinzu:

```json
{
  "tools": {
    "experimental": {
      "skills": true
    }
  }
}
```

- Grundlegende Vertrautheit mit Qwen Code ([Schnellstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills verpacken Expertise in auffindbare Fähigkeiten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Vorlagen.

### Wie Skills aufgerufen werden

Skills werden **modellseitig aufgerufen** – das Modell entscheidet eigenständig, wann es diese basierend auf Ihrer Anfrage und der Beschreibung des Skills verwendet. Dies unterscheidet sich von Slash-Befehlen, die **vom Benutzer aufgerufen** werden (Sie geben explizit `/befehl` ein).

Wenn Sie einen Skill explizit aufrufen möchten, verwenden Sie den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Der Befehl `/skills` ist nur verfügbar, wenn Sie mit `--experimental-skills` arbeiten. Nutzen Sie die Autovervollständigung, um verfügbare Skills und deren Beschreibungen zu durchsuchen.

### Vorteile

- Erweitern Sie Qwen Code für Ihre Workflows
- Teilen Sie Expertise innerhalb Ihres Teams über Git
- Reduzieren Sie wiederholte Eingaben/Aufforderungen
- Kombinieren Sie mehrere Skills für komplexe Aufgaben

## Eine Skill erstellen

Skills werden als Verzeichnisse gespeichert, die eine `SKILL.md`-Datei enthalten.

### Persönliche Skills

Persönliche Skills sind in allen Ihren Projekten verfügbar. Speichern Sie sie in `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/mein-skill-name
```

Verwenden Sie persönliche Skills für:

- Ihre individuellen Workflows und Präferenzen
- Experimentelle Skills, die Sie entwickeln
- Persönliche Produktivitätshelfer

### Projektspezifische Skills

Projektspezifische Skills werden mit Ihrem Team geteilt. Speichern Sie sie in `.qwen/skills/` innerhalb Ihres Projekts:

```bash
mkdir -p .qwen/skills/mein-skill-name
```

Verwenden Sie projektspezifische Skills für:

- Team-Workflows und Konventionen
- Projektspezifisches Fachwissen
- Gemeinsame Hilfsmittel und Skripte

Projektspezifische Skills können in Git eingecheckt werden und stehen so automatisch Ihren Teamkollegen zur Verfügung.

## `SKILL.md` schreiben

Erstellen Sie eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: Ihr-Skill-Name
description: Kurze Beschreibung dessen, was dieser Skill tut und wann er verwendet werden soll
---

# Ihr Skill-Name

## Anweisungen
Geben Sie klare, schrittweise Anleitungen für Qwen Code an.

## Beispiele
Zeigen Sie konkrete Beispiele zur Verwendung dieser Fähigkeit.
```

### Feldanforderungen

Qwen Code überprüft derzeit Folgendes:

- `name` ist eine nicht leere Zeichenkette
- `description` ist eine nicht leere Zeichenkette

Empfohlene Konventionen (noch nicht streng erzwungen):

- Verwenden Sie Kleinbuchstaben, Zahlen und Bindestriche in `name`
- Machen Sie `description` spezifisch: Fügen Sie sowohl **was** die Fähigkeit tut als auch **wann** sie verwendet werden soll hinzu (Schlüsselwörter, die Benutzer natürlich erwähnen werden)

## Unterstützende Dateien hinzufügen

Erstellen Sie zusätzliche Dateien neben `SKILL.md`:

```text
meine-faehigkeit/
├── SKILL.md (erforderlich)
├── reference.md (optionale Dokumentation)
├── examples.md (optionale Beispiele)
├── scripts/
│   └── helper.py (optionales Hilfsprogramm)
└── templates/
    └── template.txt (optionale Vorlage)
```

Verweisen Sie auf diese Dateien aus `SKILL.md`:

````markdown
Für fortgeschrittene Nutzung siehe [reference.md](reference.md).

Führen Sie das Hilfsskript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Wenn `--experimental-skills` aktiviert ist, entdeckt Qwen Code Skills aus:

- Persönliche Skills: `~/.qwen/skills/`
- Projektskills: `.qwen/skills/`
- Erweiterungsskills: Von installierten Erweiterungen bereitgestellte Skills

### Erweiterungsskills

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und projektspezifische Skills.

Erweiterungsskills werden automatisch erkannt und geladen, wenn:

- Die Erweiterung installiert und aktiviert ist
- Das Flag `--experimental-skills` aktiviert ist

Um zu sehen, welche Erweiterungen Skills bereitstellen, überprüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, fragen Sie Qwen Code direkt:

```text
Welche Skills sind verfügbar?
```

Oder prüfen Sie das Dateisystem:

```bash

# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projektskills auflisten (wenn sich im Projektverzeichnis)
ls .qwen/skills/
```

# Inhalt einer bestimmten Fähigkeit anzeigen
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Eine Fähigkeit testen

Nach dem Erstellen einer Fähigkeit testen Sie sie, indem Sie Fragen stellen, die zu Ihrer Beschreibung passen.

Beispiel: Wenn Ihre Beschreibung „PDF-Dateien“ erwähnt:

```text
Können Sie mir helfen, Text aus dieser PDF zu extrahieren?
```

Das Modell entscheidet autonom, ob Ihre Fähigkeit verwendet werden soll, wenn sie zur Anfrage passt – Sie müssen sie nicht explizit aufrufen.

## Eine Fähigkeit debuggen

Wenn Qwen Code Ihre Fähigkeit nicht verwendet, überprüfen Sie diese häufigen Probleme:

### Machen Sie die Beschreibung spezifisch

Zu vage:

```yaml
description: Helfe bei Dokumenten
```

Spezifisch:

```yaml
description: Extrahiere Text und Tabellen aus PDF-Dateien, fülle Formulare aus, fusioniere Dokumente. Verwenden Sie dies beim Arbeiten mit PDFs, Formularen oder Dokumentextraktion.
```

### Überprüfen Sie den Dateipfad

- Persönliche Fähigkeiten: `~/.qwen/skills/<fähigkeits-name>/SKILL.md`
- Projekt-Fähigkeiten: `.qwen/skills/<fähigkeits-name>/SKILL.md`

```bash

# Persönlich
ls ~/.qwen/skills/my-skill/SKILL.md

# Projekt
ls .qwen/skills/my-skill/SKILL.md
```

### YAML-Syntax prüfen

Ungültiges YAML verhindert, dass die Skill-Metadaten korrekt geladen werden.

```bash
cat SKILL.md | head -n 15
```

Stellen Sie sicher:

- Öffnende `---` in Zeile 1
- Schließende `---` vor Markdown-Inhalt
- Gültige YAML-Syntax (keine Tabs, korrekte Einrückung)

### Fehler anzeigen

Führen Sie Qwen Code im Debug-Modus aus, um Fehler beim Laden von Skills zu sehen:

```bash
qwen --experimental-skills --debug
```

## Skills mit Ihrem Team teilen

Sie können Skills über Projekt-Repositories teilen:

1. Fügen Sie den Skill unter `.qwen/skills/` hinzu
2. Committen und pushen Sie
3. Teamkollegen ziehen die Änderungen und führen sie mit `--experimental-skills` aus

```bash
git add .qwen/skills/
git commit -m "Team-Skill für PDF-Verarbeitung hinzufügen"
git push
```

## Einen Skill aktualisieren

Bearbeiten Sie `SKILL.md` direkt:

```bash

# Persönlicher Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Projekt-Skill
code .qwen/skills/my-skill/SKILL.md
```

Änderungen werden wirksam, sobald Sie Qwen Code das nächste Mal starten. Falls Qwen Code bereits läuft, starten Sie es neu, um die Updates zu laden.

## Einen Skill entfernen

Löschen Sie das Skill-Verzeichnis:

```bash
# Persönlich
rm -rf ~/.qwen/skills/my-skill

# Projekt
rm -rf .qwen/skills/my-skill
git commit -m "Unbenutzten Skill entfernen"
```

## Best Practices

### Skills fokussiert halten

Ein Skill sollte eine einzelne Fähigkeit abdecken:

- Fokussiert: „PDF-Formulare ausfüllen“, „Excel-Analyse“, „Git Commit-Nachrichten“
- Zu breit: „Dokumentverarbeitung“ (in kleinere Skills aufteilen)

### Klare Beschreibungen schreiben

Helfen Sie dem Modell herauszufinden, wann Skills verwendet werden sollen, indem Sie spezifische Auslöser einbeziehen:

```yaml
description: Analysiert Excel-Arbeitsmappen, erstellt Pivot-Tabellen und generiert Diagramme. Verwenden Sie dies bei der Arbeit mit Excel-Dateien, Arbeitsblättern oder .xlsx-Daten.
```

### Mit Ihrem Team testen

- Aktiviert sich der Skill wie erwartet?
- Sind die Anweisungen verständlich?
- Gibt es fehlende Beispiele oder Sonderfälle?