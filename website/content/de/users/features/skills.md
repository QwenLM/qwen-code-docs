---
description: "Erstellen, verwalten und teilen Sie Qwen Code Agent Skills, um wiederkehrende Abläufe als modulare Fähigkeiten nutzbar zu machen und Trefferquoten zu erhöhen."
---

# Agent Skills

> Erstelle, verwalte und teile Skills, um die Funktionen von Qwen Code zu erweitern.

Diese Anleitung zeigt dir, wie du Agent Skills in **Qwen Code** erstellst, verwendest und verwaltest. Skills sind modulare Fähigkeiten, die die Effektivität des Modells durch strukturierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Quickstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills bündeln Fachwissen in auffindbare Fähigkeiten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Templates.

### Wie Skills aufgerufen werden

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann es sie basierend auf deiner Anfrage und der Skill-Beschreibung verwendet. Das unterscheidet sich von Slash-Befehlen, die **vom Benutzer aufgerufen** werden (du tippst explizit `/command`).

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

Persönliche Skills sind in all deinen Projekten verfügbar. Speichere sie unter `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Verwende persönliche Skills für:

- Deine individuellen Workflows und Präferenzen
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
- Geteilte Utilities und Skripte

Projekt-Skills können in git eingecheckt werden und sind automatisch für Teammitglieder verfügbar.

## `SKILL.md` schreiben

Erstelle eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Feldanforderungen

Qwen Code validiert aktuell, dass:

- `name` ist eine nicht-leere Zeichenkette, die `/^[\p{L}\p{N}_:.-]+$/u` entspricht – Unicode-Buchstaben und Ziffern (CJK / Kyrillisch / akzentuiertes Latein sind alle OK), plus `_`, `:`, `.`, `-`. Leerzeichen, Schrägstriche, Klammern und andere strukturell unsichere Zeichen werden beim Parsen abgelehnt.
- `description` ist eine nicht-leere Zeichenkette

Empfohlene Konventionen:

- Bevorzuge für teilbare Namen lowercase ASCII mit Bindestrichen (z. B. `tsx-helper`)
- Mache `description` spezifisch: Nenne sowohl **was** der Skill tut als auch **wann** er verwendet werden soll (Schlüsselwörter, die Nutzer natürlich erwähnen werden)

### Optional: Skill auf Dateipfade beschränken (`paths:`)

Für Skills, die nur für bestimmte Teile einer Codebase relevant sind, füge eine `paths:`-Liste mit Glob-Patterns hinzu. Der Skill bleibt aus der Liste der verfügbaren Skills des Modells ausgeblendet, bis ein Tool-Aufruf eine passende Datei berührt:

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Hinweise:

- Globs werden relativ zum Projekt-Root mit [picomatch](https://github.com/micromatch/picomatch) abgeglichen; Dateien außerhalb des Projekt-Roots lösen niemals eine Aktivierung aus.
- Ein pfadbeschränkter Skill **bleibt für den Rest der Sitzung aktiviert**, sobald eine passende Datei berührt wird. Eine neue Sitzung oder ein `refreshCache`, der durch das Bearbeiten einer Skill-Datei ausgelöst wird, setzt die Aktivierungen zurück.
- `paths:` beschränkt nur die **Modell**-Erkennung und nur auf der Ebene der SkillTool-Liste. Du kannst einen pfadbeschränkten Skill immer selbst über `/<skill-name>` oder den `/skills`-Picker aufrufen – dieser Benutzerpfad führt den Skill-Body unabhängig vom Aktivierungsstatus aus. Die Modellseite bleibt jedoch beschränkt, bis eine passende Datei berührt wird: Ein Slash-Aufruf schaltet die modellseitige Aktivierung **nicht** frei. Wenn du also möchtest, dass das Modell an deinen Aufruf anknüpft (selbst `Skill { skill: ... }` aufruft), greife zuerst auf eine Datei zu, die den `paths:` des Skills entspricht.
- Die Kombination von `paths:` mit `disable-model-invocation: true` ist erlaubt, hat aber keine Auswirkung auf die Beschränkung – der Skill ist ohnehin vor dem Modell verborgen, daher wird er durch die Pfadaktivierung nie beworben.

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
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code erkennt Skills aus:

- Persönliche Skills: `~/.qwen/skills/`
- Projekt-Skills: `.qwen/skills/`
- Extension-Skills: Skills, die von installierten Extensions bereitgestellt werden

### Extension-Skills

Extensions können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Extension aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Extension gespeichert und folgen demselben Format wie persönliche und Projekt-Skills.

Extension-Skills werden automatisch erkannt und geladen, wenn die Extension installiert und aktiviert ist.

Um zu sehen, welche Extensions Skills bereitstellen, prüfe die `qwen-extension.json`-Datei der Extension auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, frage Qwen Code direkt:

```text
What Skills are available?
```

> **Hinweis – Modell- vs. Benutzeransicht.** Wenn du das Modell fragst, werden nur Skills angezeigt, die das Modell aktuell sehen kann. Wenn ein Skill `paths:` verwendet (siehe „Optional: Skill auf Dateipfade beschränken“ oben), bleibt er aus dieser Liste ausgeblendet, bis eine passende Datei berührt wurde. Der vollständige Satz ist für dich immer über den Slash-Befehl `/skills` und auf der Festplatte sichtbar.

Oder durchsuche die vollständige Liste mit dem Slash-Befehl (zeigt immer jeden Skill an, einschließlich pfadbeschränkter, die noch nicht aktiviert wurden):

```text
/skills
```

Oder prüfe das Dateisystem:

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Einen Skill testen

Nach dem Erstellen eines Skills teste ihn, indem du Fragen stellst, die zu deiner Beschreibung passen.

Beispiel: Wenn deine Beschreibung „PDF-Dateien“ erwähnt:

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
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
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
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

Änderungen werden wirksam, wenn du Qwen Code das nächste Mal startest. Wenn Qwen Code bereits läuft, starte es neu, um die Updates zu laden.

## Einen Skill entfernen

Lösche das Skill-Verzeichnis:

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Best Practices

### Halte Skills fokussiert

Ein Skill sollte genau eine Fähigkeit abdecken:

- Fokussiert: „PDF-Formulare ausfüllen“, „Excel-Analyse“, „Git-Commit-Messages“
- Zu breit: „Dokumentenverarbeitung“ (in kleinere Skills aufteilen)

### Schreibe klare Beschreibungen

Hilf dem Modell zu erkennen, wann Skills verwendet werden sollen, indem du spezifische Trigger einbaust:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste mit deinem Team

- Wird der Skill aktiviert, wenn erwartet?
- Sind die Anweisungen klar?
- Fehlen Beispiele oder Edge Cases?