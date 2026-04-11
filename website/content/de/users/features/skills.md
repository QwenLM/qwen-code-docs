# Agent Skills

> Erstelle, verwalte und teile Skills, um die Funktionen von Qwen Code zu erweitern.

Diese Anleitung zeigt dir, wie du Agent Skills in **Qwen Code** erstellst, verwendest und verwaltest. Skills sind modulare Funktionen, die die Effektivität des Modells durch strukturierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Quickstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills bündeln Fachwissen in auffindbare Funktionen. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Templates.

### So werden Skills aufgerufen

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann es sie basierend auf deiner Anfrage und der Skill-Beschreibung verwendet. Das unterscheidet sich von Slash-Befehlen, die **vom Nutzer aufgerufen** werden (du gibst explizit `/command` ein).

Wenn du einen Skill explizit aufrufen möchtest, verwende den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Verwende die Autovervollständigung, um verfügbare Skills und Beschreibungen zu durchsuchen.

### Vorteile

- Erweitere Qwen Code für deine Workflows
- Teile Fachwissen über git im gesamten Team
- Reduziere wiederholtes Prompting
- Kombiniere mehrere Skills für komplexe Aufgaben

## Einen Skill erstellen

Skills werden als Verzeichnisse gespeichert, die eine `SKILL.md`-Datei enthalten.

### Persönliche Skills

Persönliche Skills stehen projektübergreifend zur Verfügung. Speichere sie unter `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Verwende persönliche Skills für:

- Deine individuellen Workflows und Einstellungen
- Skills, die du gerade entwickelst
- Persönliche Produktivitätshelfer

### Projekt-Skills

Projekt-Skills werden mit deinem Team geteilt. Speichere sie in `.qwen/skills/` innerhalb deines Projekts:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Verwende Projekt-Skills für:

- Team-Workflows und Konventionen
- Projektspezifisches Fachwissen
- Gemeinsam genutzte Utilities und Skripte

Projekt-Skills können in git eingecheckt werden und stehen Teammitgliedern automatisch zur Verfügung.

## `SKILL.md` schreiben

Erstelle eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: dein-skill-name
description: Kurze Beschreibung, was dieser Skill tut und wann er verwendet werden soll
---

# Dein Skill-Name

## Anweisungen
Gib klare, schrittweise Anleitungen für Qwen Code.

## Beispiele
Zeige konkrete Beispiele für die Verwendung dieses Skills.
```

### Feldanforderungen

Qwen Code validiert derzeit, dass:

- `name` ein nicht-leerer String ist
- `description` ein nicht-leerer String ist

Empfohlene Konventionen (noch nicht strikt erzwungen):

- Verwende Kleinbuchstaben, Zahlen und Bindestriche in `name`
- Mache `description` spezifisch: Gib sowohl an, **was** der Skill tut, als auch **wann** er verwendet werden soll (Schlüsselwörter, die Nutzer natürlich erwähnen werden)

## Unterstützende Dateien hinzufügen

Erstelle zusätzliche Dateien neben `SKILL.md`:

```text
my-skill/
├── SKILL.md (required)
├── reference.md (optional documentation)
├── examples.md (optional examples)
├── scripts/
│   └── helper.py (optional utility)
└── templates/
    └── template.txt (optional template)
```

Verweise in `SKILL.md` auf diese Dateien:

````markdown
Für die erweiterte Nutzung siehe [reference.md](reference.md).

Führe das Helper-Skript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code erkennt Skills aus:

- Persönliche Skills: `~/.qwen/skills/`
- Projekt-Skills: `.qwen/skills/`
- Extension-Skills: Skills, die von installierten Erweiterungen bereitgestellt werden

### Extension-Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, sobald die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen demselben Format wie persönliche und Projekt-Skills.

Extension-Skills werden automatisch erkannt und geladen, wenn die Erweiterung installiert und aktiviert ist.

Um zu sehen, welche Erweiterungen Skills bereitstellen, prüfe die `qwen-extension.json`-Datei der Erweiterung auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, frage Qwen Code direkt:

```text
What Skills are available?
```

Oder prüfe das Dateisystem:

```bash
# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projekt-Skills auflisten (falls du dich in einem Projektverzeichnis befindest)
ls .qwen/skills/

# Inhalt eines bestimmten Skills anzeigen
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Einen Skill testen

Nachdem du einen Skill erstellt hast, teste ihn, indem du Fragen stellst, die zu deiner Beschreibung passen.

Beispiel: Wenn deine Beschreibung "PDF-Dateien" erwähnt:

```text
Can you help me extract text from this PDF?
```

Das Modell entscheidet autonom, deinen Skill zu verwenden, wenn er zur Anfrage passt – du musst ihn nicht explizit aufrufen.

## Einen Skill debuggen

Wenn Qwen Code deinen Skill nicht verwendet, prüfe diese häufigen Probleme:

### Mache die Beschreibung spezifisch

Zu vage:

```yaml
description: Helps with documents
```

Spezifisch:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Dateipfad überprüfen

- Persönliche Skills: `~/.qwen/skills/<skill-name>/SKILL.md`
- Projekt-Skills: `.qwen/skills/<skill-name>/SKILL.md`

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

Stelle sicher, dass:

- Öffnendes `---` in Zeile 1
- Schließendes `---` vor dem Markdown-Inhalt
- Gültige YAML-Syntax (keine Tabs, korrekte Einrückung)

### Fehler anzeigen

Starte Qwen Code im Debug-Modus, um Fehler beim Laden von Skills zu sehen:

```bash
qwen --debug
```

## Skills mit deinem Team teilen

Du kannst Skills über Projekt-Repositories teilen:

1. Füge den Skill unter `.qwen/skills/` hinzu
2. Erstelle einen Commit und pushe
3. Teammitglieder pullen die Änderungen

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Einen Skill aktualisieren

Bearbeite `SKILL.md` direkt:

```bash
# Persönlicher Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Projekt-Skill
code .qwen/skills/my-skill/SKILL.md
```

Die Änderungen werden wirksam, wenn du Qwen Code das nächste Mal startest. Falls Qwen Code bereits läuft, starte es neu, um die Updates zu laden.

## Einen Skill entfernen

Lösche das Skill-Verzeichnis:

```bash
# Persönlich
rm -rf ~/.qwen/skills/my-skill

# Projekt
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Best Practices

### Halte Skills fokussiert

Ein Skill sollte genau eine Fähigkeit abdecken:

- Fokussiert: "PDF-Formulare ausfüllen", "Excel-Analyse", "Git-Commit-Nachrichten"
- Zu breit: "Dokumentenverarbeitung" (in kleinere Skills aufteilen)

### Schreibe klare Beschreibungen

Hilf dem Modell zu erkennen, wann es Skills verwenden soll, indem du spezifische Trigger einfügst:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste mit deinem Team

- Wird der Skill wie erwartet aktiviert?
- Sind die Anweisungen klar?
- Fehlen Beispiele oder Edge Cases?