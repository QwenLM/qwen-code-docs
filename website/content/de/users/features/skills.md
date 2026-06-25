# Agent-Fähigkeiten

> Erstellen, verwalten und teilen Sie Fähigkeiten (Skills), um die Möglichkeiten von Qwen Code zu erweitern.

Diese Anleitung zeigt, wie Sie Agent-Fähigkeiten in **Qwen Code** erstellen, verwenden und verwalten. Skills sind modulare Funktionalitäten, die die Effektivität des Modells durch organisierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Schnellstart](../quickstart.md))

## Was sind Agent-Fähigkeiten (Skills)?

Agent-Fähigkeiten verpacken Fachwissen in auffindbare Funktionalitäten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Relevanz laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Vorlagen.

### Wie Skills aufgerufen werden

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann sie basierend auf Ihrer Anfrage und der Skill-Beschreibung verwendet werden. Dies unterscheidet sich von Slash-Befehlen, die **vom Benutzer aufgerufen** werden (Sie geben explizit `/command` ein).

Wenn Sie einen Skill explizit aufrufen möchten, verwenden Sie den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Nutzen Sie die Autovervollständigung, um verfügbare Skills und Beschreibungen zu durchsuchen.

### Vorteile

- Erweitern Sie Qwen Code für Ihre Arbeitsabläufe
- Teilen Sie Fachwissen teamweit über Git
- Reduzieren Sie wiederholte Eingabeaufforderungen
- Kombinieren Sie mehrere Skills für komplexe Aufgaben

## Einen Skill erstellen

Skills werden als Verzeichnisse gespeichert, die eine `SKILL.md`-Datei enthalten.

### Persönliche Skills

Persönliche Skills sind in allen Ihren Projekten verfügbar. Speichern Sie sie in `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/mein-skill-name
```

Verwenden Sie persönliche Skills für:

- Ihre individuellen Arbeitsabläufe und Präferenzen
- Skills, die Sie entwickeln
- Persönliche Produktivitätshelfer

### Projekt-Skills

Projekt-Skills werden mit Ihrem Team geteilt. Speichern Sie sie in `.qwen/skills/` innerhalb Ihres Projekts:

```bash
mkdir -p .qwen/skills/mein-skill-name
```

Verwenden Sie Projekt-Skills für:

- Team-Workflows und Konventionen
- Projektspezifisches Fachwissen
- Gemeinsame Hilfsprogramme und Skripte

Projekt-Skills können in Git eingecheckt werden und stehen Teammitgliedern automatisch zur Verfügung.

## `SKILL.md` schreiben

Erstellen Sie eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Feldanforderungen

Qwen Code validiert derzeit, dass:

- `name` ein nicht-leerer String ist, der mit `/^[\p{L}\p{N}_:.-]+$/u` übereinstimmt – Unicode-Buchstaben und Ziffern (CJK / Kyrillisch / akzentuiertes Latein alle OK), plus `_`, `:`, `.`, `-`. Leerzeichen, Schrägstriche, Klammern und andere strukturell unsichere Zeichen werden beim Parsen zurückgewiesen.
- `description` ein nicht-leerer String ist
- `priority` optional ist. Falls vorhanden, muss es eine endliche Zahl sein. Höhere Werte sortieren in der `/skills`-Liste weiter oben – die Slash-Befehl-Vervollständigung (Eingabe von `/`) und die `/help`-Ansicht benutzerdefinierter Befehle bleiben alphabetisch, sodass ein Skill mit hoher Priorität keine eingebauten Befehle umordnet. Fehlende oder ungültige Werte werden als nicht gesetzt behandelt, was sich wie `0` verhält.

Empfohlene Konventionen:

- Bevorzugen Sie für teilbare Namen Kleinbuchstaben mit Bindestrichen (z. B. `tsx-helper`)
- Machen Sie die `description` spezifisch: Geben Sie sowohl **was** der Skill tut als auch **wann** er verwendet werden soll (Schlüsselwörter, die Benutzer natürlicherweise erwähnen)
- Verwenden Sie `priority` sparsam für Skills, die zuverlässig vor der standardmäßigen alphabetischen Reihenfolge in `/skills` erscheinen sollen. Negative Prioritäten sind erlaubt und sortieren unter nicht gesetzten Skills.

### Optional: Einen Skill auf Dateipfade beschränken (`paths:`)

Für Skills, die nur für bestimmte Teile einer Codebasis relevant sind, fügen Sie eine `paths:`-Liste mit Glob-Mustern hinzu. Der Skill bleibt aus der Liste der verfügbaren Skills des Modells heraus, bis ein Tool-Aufruf eine passende Datei berührt:

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

- Globs werden relativ zum Projektstamm mit [picomatch](https://github.com/micromatch/picomatch) abgeglichen; Dateien außerhalb des Projektstamms lösen nie eine Aktivierung aus.
- Ein pfadbeschränkter Skill **bleibt für den Rest der Sitzung aktiviert**, sobald eine passende Datei berührt wurde. Eine neue Sitzung oder ein `refreshCache`, ausgelöst durch Bearbeiten einer Skill-Datei, setzt Aktivierungen zurück.
- `paths:` beschränkt nur die **Modell**-Auffindung, und zwar nur auf der SkillTool-Ebene. Sofern nicht `user-invocable: false` gesetzt ist, können Sie einen pfadbeschränkten Skill jederzeit selbst über `/<skill-name>` oder die `/skills`-Auswahl aufrufen – dieser Benutzerpfad führt den Skill-Body unabhängig vom Aktivierungszustand aus. Die Modellseite bleibt jedoch beschränkt, bis eine passende Datei berührt wird: Ein Slash-Aufruf **entsperrt nicht** die Modellseite. Wenn Sie also möchten, dass das Modell auf Ihren Aufruf aufbaut (selbst `Skill { skill: ... }` aufruft), greifen Sie zuerst auf eine Datei zu, die den `paths:` des Skills entspricht.
- Die Kombination von `paths:` mit `disable-model-invocation: true` ist erlaubt, aber die Beschränkung hat keine Wirkung – der Skill ist ohnehin vor dem Modell verborgen, sodass die Pfadaktivierung ihn nie bewirbt.
### Optional: Steuerung von Benutzer- und Modellaufrufen

Skills sind standardmäßig vom Benutzer aufrufbar. Um ein Skill vor der direkten Verwendung per Slash-Befehl zu verbergen, es aber für den Modellaufruf verfügbar zu halten, setzen Sie `user-invocable: false`:

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

Dies entfernt das Skill aus der Aufrufung per `/<skill-name>` und den Ergebnissen der `/skills`-Auswahl. Es verbirgt das Skill nicht vor dem Modell.

Um ein Skill vor dem Modellaufruf zu verbergen, während der direkte Benutzeraufruf verfügbar bleibt, setzen Sie `disable-model-invocation: true`:

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

Sie können beide Felder kombinieren, aber dann ist das Skill weder über die normalen Benutzer- noch über die Modellaufrufpfade erreichbar.

## Hinzufügen von unterstützenden Dateien

Erstellen Sie zusätzliche Dateien neben `SKILL.md`:

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

Verweisen Sie in `SKILL.md` auf diese Dateien:

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code findet Skills in folgenden Quellen:

- Personal Skills: `~/.qwen/skills/`
- Project Skills: `.qwen/skills/`
- Extension Skills: Skills provided by installed extensions

### Skills von Erweiterungen

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und Projekt-Skills.

Skills von Erweiterungen werden automatisch erkannt und geladen, wenn die Erweiterung installiert und aktiviert ist.

Um zu sehen, welche Erweiterungen Skills bereitstellen, prüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, fragen Sie Qwen Code direkt:

```text
What Skills are available?
```

> **Achtung — Modell- vs. Benutzeransicht.** Die Frage an das Modell zeigt nur Skills an, die das Modell derzeit sehen kann. Wenn ein Skill `paths:` verwendet (siehe „Optional: ein Skill auf Dateipfade beschränken" oben), bleibt es aus dieser Auflistung heraus, bis eine passende Datei berührt wurde. Der Slash-Befehl `/skills` zeigt Skills an, die Sie direkt aufrufen können; Skills mit `user-invocable: false` bleiben auf der Festplatte sichtbar und sind möglicherweise weiterhin für das Modell sichtbar.

Oder durchsuchen Sie die benutzeraufrufbare Liste mit dem Slash-Befehl (einschließlich pfadgebundener Skills, die noch nicht aktiviert wurden):

```text
/skills
```

Oder durchsuchen Sie das Dateisystem:

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Testen eines Skills

Nachdem Sie ein Skill erstellt haben, testen Sie es, indem Sie Fragen stellen, die Ihrer Beschreibung entsprechen.

Beispiel: Wenn Ihre Beschreibung „PDF-Dateien" erwähnt:

```text
Can you help me extract text from this PDF?
```

Das Modell entscheidet autonom, Ihr Skill zu verwenden, wenn es mit der Anfrage übereinstimmt — Sie müssen es nicht explizit aufrufen.

## Fehlerbehebung bei einem Skill

Wenn Qwen Code Ihr Skill nicht verwendet, überprüfen Sie diese häufigsten Probleme:

### Beschreibung präzise formulieren

Zu vage:

```yaml
description: Helps with documents
```

Präzise:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Dateipfad überprüfen

- Personal Skills: `~/.qwen/skills/<skill-name>/SKILL.md`
- Project Skills: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### YAML-Syntax prüfen

Ungültiges YAML verhindert das korrekte Laden der Skill-Metadaten.

```bash
cat SKILL.md | head -n 15
```

Stellen Sie sicher:

- Öffnendes `---` in Zeile 1
- Schließendes `---` vor dem Markdown-Inhalt
- Gültige YAML-Syntax (keine Tabs, korrekte Einrückung)

### Fehler anzeigen

Führen Sie Qwen Code im Debug-Modus aus, um Fehler beim Laden von Skills zu sehen:

```bash
qwen --debug
```

## Skills mit Ihrem Team teilen

Sie können Skills über Projekt-Repositories teilen:

1. Fügen Sie das Skill unter `.qwen/skills/` hinzu
2. Committen und pushen Sie
3. Teammitglieder ziehen die Änderungen

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Aktualisieren eines Skills

Bearbeiten Sie `SKILL.md` direkt:

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

Änderungen werden beim nächsten Start von Qwen Code wirksam. Wenn Qwen Code bereits läuft, starten Sie es neu, um die Aktualisierungen zu laden.

## Entfernen eines Skills

Löschen Sie das Skill-Verzeichnis:

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Bewährte Methoden

### Skills fokussiert halten

Ein Skill sollte eine Fähigkeit abdecken:

- Fokussiert: „PDF-Formularausfüllen", „Excel-Analyse", „Git-Commit-Nachrichten"
- Zu breit: „Dokumentenverarbeitung" (in kleinere Skills aufteilen)
### Klare Beschreibungen verfassen

Helfen Sie dem Modell zu erkennen, wann Skills verwendet werden sollen, indem Sie spezifische Auslöser einfügen:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Mit Ihrem Team testen

- Wird der Skill wie erwartet aktiviert?
- Sind die Anweisungen klar?
- Fehlen Beispiele oder Grenzfälle?
