# Agent-Fähigkeiten

> Erstellen, verwalten und teilen Sie Fähigkeiten, um die Funktionalität von Qwen Code zu erweitern.

Diese Anleitung zeigt Ihnen, wie Sie Agent-Fähigkeiten in **Qwen Code** erstellen, verwenden und verwalten. Fähigkeiten sind modulare Funktionen, die die Effektivität des Modells durch organisierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Schnellstart](../quickstart.md))

## Was sind Agent-Fähigkeiten?

Agent-Fähigkeiten bündeln Expertise in auffindbaren Funktionen. Jede Fähigkeit besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Vorlagen.

### Wie Skills aufgerufen werden

Skills werden **modellseitig aufgerufen** – das Modell entscheidet eigenständig, wann es sie basierend auf Ihrer Anfrage und der Beschreibung des Skills verwenden soll. Dies unterscheidet sich von Slash-Befehlen, die **benutzerseitig aufgerufen** werden (Sie geben explizit `/befehl` ein).

Wenn Sie einen Skill explizit aufrufen möchten, verwenden Sie den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Nutzen Sie die Autovervollständigung, um verfügbare Skills und deren Beschreibungen zu durchsuchen.

### Vorteile

- Erweitern Sie Qwen Code für Ihre Workflows
- Teilen Sie Fachwissen innerhalb Ihres Teams über Git
- Reduzieren Sie wiederholte Eingaben
- Kombinieren Sie mehrere Skills für komplexe Aufgaben

## Einen Skill erstellen

Skills werden als Verzeichnisse gespeichert, die eine `SKILL.md`-Datei enthalten.

### Persönliche Skills

Persönliche Skills sind in allen Ihren Projekten verfügbar. Speichern Sie sie in `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/mein-skill-name
```

Verwenden Sie persönliche Skills für:

- Ihre individuellen Workflows und Präferenzen
- Skills, die Sie entwickeln
- Persönliche Produktivitätshelfer

### Projektfähigkeiten

Projektfähigkeiten werden mit deinem Team geteilt. Speichere sie im Ordner `.qwen/skills/` innerhalb deines Projekts:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Verwende Projektfähigkeiten für:

- Team-Workflows und Konventionen
- Projekt-spezifisches Fachwissen
- Gemeinsame Hilfsmittel und Skripte

Projektfähigkeiten können in git eingecheckt werden und stehen so automatisch für Teamkollegen zur Verfügung.

## Schreibe `SKILL.md`

Erstelle eine Datei `SKILL.md` mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Kurze Beschreibung dessen, was diese Fähigkeit tut und wann sie verwendet werden soll
---

# Dein Fähigkeitsname

## Anweisungen
Stelle klare, schrittweise Anleitungen für Qwen Code bereit.

## Beispiele
Zeige konkrete Beispiele für die Verwendung dieser Fähigkeit.
```

### Feldanforderungen

Qwen Code überprüft derzeit, dass:

- `name` eine nicht leere Zeichenkette ist
- `description` eine nicht leere Zeichenkette ist

Empfohlene Konventionen (noch nicht streng erzwungen):

- Verwenden Sie Kleinbuchstaben, Zahlen und Bindestriche in `name`
- Machen Sie `description` spezifisch: Fügen Sie sowohl **was** die Skill tut als auch **wann** sie verwendet werden soll hinzu (Schlüsselwörter, die Benutzer natürlich erwähnen werden)

## Unterstützende Dateien hinzufügen

Erstellen Sie zusätzliche Dateien neben `SKILL.md`:

```text
my-skill/
├── SKILL.md (erforderlich)
├── reference.md (optionale Dokumentation)
├── examples.md (optionale Beispiele)
├── scripts/
│   └── helper.py (optionales Hilfsprogramm)
└── templates/
    └── template.txt (optionale Vorlage)
```

Verweisen Sie auf diese Dateien aus `SKILL.md` heraus:

````markdown
Für fortgeschrittene Nutzung siehe [reference.md](reference.md).

Führen Sie das Hilfsskript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code entdeckt Skills aus:

- Persönliche Skills: `~/.qwen/skills/`
- Projektskills: `.qwen/skills/`
- Erweiterungsskills: Von installierten Erweiterungen bereitgestellte Skills

### Erweiterungsskills

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und Projektskills.

Erweiterungsskills werden automatisch erkannt und geladen, sobald die Erweiterung installiert und aktiviert ist.

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

# Inhalt eines bestimmten Skills anzeigen
cat ~/.qwen/skills/mein-skill/SKILL.md
```

## Einen Skill testen

Nachdem Sie einen Skill erstellt haben, testen Sie ihn, indem Sie Fragen stellen, die zu Ihrer Beschreibung passen.

Beispiel: Wenn Ihre Beschreibung „PDF-Dateien“ erwähnt:

```text
Können Sie mir helfen, Text aus dieser PDF zu extrahieren?
```

Das Modell entscheidet eigenständig, Ihren Skill zu verwenden, wenn er zur Anfrage passt – Sie müssen ihn nicht explizit aufrufen.

## Einen Skill debuggen

Wenn Qwen Code Ihren Skill nicht verwendet, überprüfen Sie diese häufigen Probleme:

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

- Persönliche Skills: `~/.qwen/skills/<skill-name>/SKILL.md`
- Projektskills: `.qwen/skills/<skill-name>/SKILL.md`

```bash

# Persönlich
ls ~/.qwen/skills/mein-skill/SKILL.md

# Projekt
ls .qwen/skills/mein-skill/SKILL.md
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

Führen Sie Qwen Code im Debug-Modus aus, um Fehler beim Laden von Skills anzuzeigen:

```bash
qwen --debug
```

## Skills mit Ihrem Team teilen

Sie können Skills über Projekt-Repositories teilen:

1. Fügen Sie den Skill unter `.qwen/skills/` hinzu
2. Committen und pushen
3. Teamkollegen ziehen die Änderungen

```bash
git add .qwen/skills/
git commit -m "Team-Skill für PDF-Verarbeitung hinzufügen"
git push
```

## Einen Skill aktualisieren

Bearbeiten Sie `SKILL.md` direkt:

```bash

# Persönlicher Skill
code ~/.qwen/skills/mein-skill/SKILL.md

# Projekt-Skill
code .qwen/skills/mein-skill/SKILL.md
```

Änderungen werden beim nächsten Start von Qwen Code wirksam. Wenn Qwen Code bereits läuft, starten Sie es neu, um die Aktualisierungen zu laden.

## Einen Skill entfernen

Löschen Sie das Skill-Verzeichnis:

```bash
```

# Persönlich
rm -rf ~/.qwen/skills/my-skill

# Projekt
rm -rf .qwen/skills/my-skill
git commit -m "Ungenutzte Skill entfernen"
```

## Best Practices

### Skills fokussiert halten

Eine Skill sollte eine einzelne Fähigkeit abdecken:

- Fokussiert: "PDF-Formular ausfüllen", "Excel-Analyse", "Git Commit-Nachrichten"
- Zu breit: "Dokumentverarbeitung" (in kleinere Skills aufteilen)

### Klare Beschreibungen schreiben

Hilf dem Modell herauszufinden, wann Skills verwendet werden sollen, indem du spezifische Auslöser einfügst:

```yaml
description: Analysiere Excel-Arbeitsmappen, erstelle Pivot-Tabellen und generiere Diagramme. Verwende dies bei der Arbeit mit Excel-Dateien, Tabellenkalkulationen oder .xlsx-Daten.
```

### Mit deinem Team testen

- Aktiviert sich die Skill wie erwartet?
- Sind die Anweisungen verständlich?
- Gibt es fehlende Beispiele oder Sonderfälle?