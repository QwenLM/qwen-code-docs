# Agent Skills (Experimentell)

> Erstellen, verwalten und teilen Sie Skills, um die Fähigkeiten von Qwen Code zu erweitern.

Diese Anleitung zeigt Ihnen, wie Sie Agent Skills in **Qwen Code** erstellen, verwenden und verwalten. Skills sind modulare Fähigkeiten, die die Effektivität des Modells durch organisierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

> [!note]
>
> Skills sind derzeit **experimentell** und müssen mit `--experimental-skills` aktiviert werden.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Ausführung mit aktiviertem experimentellem Flag:

```bash
qwen --experimental-skills
```

- Grundlegende Vertrautheit mit Qwen Code ([Schnellstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills verpacken Expertise in auffindbare Fähigkeiten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Vorlagen.

### Wie Skills aufgerufen werden

Skills werden **modellseitig aufgerufen** — das Modell entscheidet autonom, wann es sie basierend auf Ihrer Anfrage und der Beschreibung des Skills verwendet. Dies unterscheidet sich von Slash-Befehlen, die **benutzerseitig aufgerufen** werden (Sie geben explizit `/befehl` ein).

### Vorteile

- Erweitern Sie Qwen Code für Ihre Workflows
- Teilen Sie Fachwissen in Ihrem Team über Git
- Reduzieren Sie wiederholte Aufforderungen
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
- Experimentelle Skills, die Sie entwickeln
- Persönliche Produktivitätshelfer

### Projektfähigkeiten

Projektfähigkeiten werden mit deinem Team geteilt. Speichere sie in `.qwen/skills/` innerhalb deines Projekts:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Verwende Projektfähigkeiten für:

- Team-Workflows und Konventionen
- Projektspezifisches Fachwissen
- Gemeinsame Hilfsmittel und Skripte

Projektfähigkeiten können in git eingecheckt werden und stehen Teamkollegen automatisch zur Verfügung.

## Schreibe `SKILL.md`

Erstelle eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Kurze Beschreibung dessen, was diese Fähigkeit tut und wann sie verwendet werden soll
---

# Dein Fähigkeitsname

## Anweisungen
Stelle klare, Schritt-für-Schritt-Anleitungen für Qwen Code bereit.

## Beispiele
Zeige konkrete Beispiele für die Verwendung dieser Fähigkeit.
```

### Feldanforderungen

Qwen Code validiert derzeit, dass:

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

Verweisen Sie auf diese Dateien aus `SKILL.md`:

````markdown
Für fortgeschrittene Nutzung siehe [reference.md](reference.md).

Führen Sie das Hilfskript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Wenn `--experimental-skills` aktiviert ist, entdeckt Qwen Code Skills aus:

- Persönlichen Skills: `~/.qwen/skills/`
- Projektskills: `.qwen/skills/`

Um verfügbare Skills anzuzeigen, fragen Sie Qwen Code direkt:

```text
Welche Skills sind verfügbar?
```

Oder überprüfen Sie das Dateisystem:

```bash

# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projektskills auflisten (wenn in einem Projektverzeichnis)
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

Das Modell entscheidet autonom, ob Ihr Skill verwendet wird, wenn er zur Anfrage passt – Sie müssen ihn nicht explizit aufrufen.

## Einen Skill debuggen

Wenn Qwen Code Ihren Skill nicht verwendet, überprüfen Sie diese häufigen Probleme:

### Machen Sie die Beschreibung spezifisch

Zu ungenau:

```yaml
description: Hilft bei Dokumenten
```

Spezifisch:

```yaml
description: Extrahiert Text und Tabellen aus PDF-Dateien, füllt Formulare aus, fusioniert Dokumente. Verwenden Sie dies, wenn Sie mit PDFs, Formularen oder Dokumentenextraktion arbeiten.
```

### Überprüfen Sie den Dateipfad

- Persönliche Skills: `~/.qwen/skills/<skill-name>/SKILL.md`
- Projekt-Skills: `.qwen/skills/<skill-name>/SKILL.md`

```bash

# Persönlich
ls ~/.qwen/skills/my-skill/SKILL.md

# Projekt
ls .qwen/skills/my-skill/SKILL.md
```

### Überprüfen Sie die YAML-Syntax

Ungültiges YAML verhindert, dass die Skill-Metadaten korrekt geladen werden.

```bash
cat SKILL.md | head -n 15
```

Stellen Sie sicher:

- Öffnendes `---` in Zeile 1
- Schließendes `---` vor Markdown-Inhalt
- Gültige YAML-Syntax (keine Tabs, korrekte Einrückung)

### Fehler anzeigen

Führen Sie Qwen Code im Debug-Modus aus, um Skill-Ladefehler anzuzeigen:

```bash
qwen --experimental-skills --debug
```

## Teilen Sie Skills mit Ihrem Team

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

Änderungen werden beim nächsten Start von Qwen Code wirksam. Wenn Qwen Code bereits läuft, starten Sie es neu, um die Updates zu laden.

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

### Halten Sie Skills fokussiert

Ein Skill sollte eine einzige Fähigkeit abdecken:

- Fokussiert: „PDF-Formularausfüllung“, „Excel-Analyse“, „Git-Commit-Nachrichten“
- Zu breit: „Dokumentverarbeitung“ (in kleinere Skills aufteilen)

### Klare Beschreibungen schreiben

Helfen Sie dem Modell zu erkennen, wann Skills verwendet werden sollen, indem Sie spezifische Auslöser einfügen:

```yaml
description: Analysieren Sie Excel-Tabellenkalkulationen, erstellen Sie Pivot-Tabellen und generieren Sie Diagramme. Verwenden Sie dies, wenn Sie mit Excel-Dateien, Tabellenkalkulationen oder .xlsx-Daten arbeiten.
```

### Mit Ihrem Team testen

- Aktiviert sich der Skill wie erwartet?
- Sind die Anweisungen klar verständlich?
- Gibt es fehlende Beispiele oder Sonderfälle?