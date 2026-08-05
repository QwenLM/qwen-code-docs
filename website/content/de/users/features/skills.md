# Agent Skills

> Erstelle, verwalte und teile Skills, um die Funktionen von Qwen Code zu erweitern.

Dieser Leitfaden zeigt dir, wie du Agent Skills in **Qwen Code** erstellst, verwendest und verwaltest. Skills sind modulare Fähigkeiten, die die Effektivität des Modells durch strukturierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Quickstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills bündeln Fachwissen in auffindbare Fähigkeiten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf laden kann, sowie optionalen unterstützenden Dateien wie Skripten und Templates.

### Wie Skills aufgerufen werden

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann es sie basierend auf deiner Anfrage und der Skill-Beschreibung verwendet. Dies unterscheidet sich von Slash-Commands, die **vom Benutzer aufgerufen** werden (du tippst explizit `/command` ein).

Wenn du einen Skill explizit aufrufen möchtest, tippe ihn als Slash-Command mit dem Namen des Skills ein:

```bash
/<skill-name>
```

Tippe `/`, um die Autovervollständigung zu nutzen und verfügbare Skills zusammen mit ihren Beschreibungen zu durchsuchen. Der Befehl `/skills` öffnet das Skills-Panel, in dem du Skills interaktiv durchsuchen, suchen, ein- und ausschalten sowie starten kannst.

> **Hinweis:** Wenn du einen Skill zuvor mit `/skills <skill-name>` ausgeführt hast, öffnet diese Syntax jetzt nur noch das Skills-Panel und ignoriert das nachfolgende Argument. Verwende `/<skill-name>`, um einen Skill direkt auszuführen.

### Vorteile

- Erweitere Qwen Code für deine Workflows
- Teile Fachwissen über git mit deinem Team
- Reduziere wiederholtes Prompting
- Kombiniere mehrere Skills für komplexe Aufgaben

## Einen Skill erstellen

Skills werden als Verzeichnisse gespeichert, die eine `SKILL.md`-Datei enthalten.

### Persönliche Skills

Persönliche Skills sind in allen deinen Projekten verfügbar. Speichere sie in `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Verwende persönliche Skills für:

- Deine individuellen Workflows und Präferenzen
- Skills, die du entwickelst
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

Projekt-Skills können in git eingecheckt werden und stehen Teammitgliedern dann automatisch zur Verfügung.

## `SKILL.md` schreiben

Erstelle eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Dein Skill-Name

## Anweisungen
Gib klare, Schritt-für-Schritt-Anleitungen für Qwen Code.

## Beispiele
Zeige konkrete Beispiele für die Verwendung dieses Skills.
```

### Feldanforderungen

Qwen Code validiert derzeit, dass:

- `name` ist ein nicht-leerer String, der `/^[\p{L}\p{N}_:.-]+$/u` entspricht – Unicode-Buchstaben und -Ziffern (CJK / Kyrillisch / lateinische Akzente sind alle OK), sowie `_`, `:`, `.`, `-`. Leerzeichen, Schrägstriche, Klammern und andere strukturell unsichere Zeichen werden beim Parsen abgelehnt.
- `description` ist ein nicht-leerer String
- `priority` ist optional. Wenn vorhanden, muss es eine endliche Zahl sein. Höhere Werte werden nur in der `/skills`-Liste früher sortiert – die Slash-Command-Autovervollständigung (Tippen von `/`) und die Ansicht für benutzerdefinierte Befehle `/help` bleiben alphabetisch, sodass ein Skill mit hoher Priorität niemals integrierte Befehle neu ordnet. Weggelassene oder ungültige Werte werden als nicht gesetzt behandelt, was sich wie `0` verhält.

Empfohlene Konventionen:

- Bevorzuge ASCII-Kleinbuchstaben mit Bindestrichen für teilbare Namen (z. B. `tsx-helper`)
- Mache `description` spezifisch: Gib sowohl an, **was** der Skill tut, als auch, **wann** er verwendet werden soll (Schlüsselwörter, die Benutzer natürlich erwähnen werden)
- Verwende `priority` sparsam für Skills, die zuverlässig vor der standardmäßigen alphabetischen Reihenfolge in `/skills` erscheinen sollen. Negative Prioritäten sind erlaubt und werden unter nicht gesetzten Skills sortiert.

### Optional: Einen Skill auf Dateipfade beschränken (`paths:`)

Für Skills, die nur für bestimmte Teile einer Codebase relevant sind, füge eine `paths:`-Liste von Glob-Mustern hinzu. Der Skill bleibt aus der Liste der verfügbaren Skills des Modells ausgeschlossen, bis ein Tool-Aufruf eine passende Datei berührt:

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
- Ein pfadbeschränkter Skill **bleibt für den Rest der Sitzung aktiviert**, sobald eine passende Datei berührt wurde. Eine neue Sitzung oder ein `refreshCache`, der durch das Bearbeiten einer Skill-Datei ausgelöst wird, setzt die Aktivierungen zurück.
- `paths:` beschränkt nur die **Modell**-Erkennung und nur auf der SkillTool-Listenebene. Sofern nicht `user-invocable: false` gesetzt ist, kannst du einen pfadbeschränkten Skill immer selbst über `/<skill-name>` oder den `/skills`-Picker aufrufen – dieser Benutzerpfad führt den Skill-Body unabhängig vom Aktivierungszustand aus. Die Modellseite bleibt jedoch beschränkt, bis eine passende Datei berührt wird: Ein Slash-Aufruf schaltet die modellseitige Aktivierung **nicht** frei. Wenn du also möchtest, dass das Modell an deinen Aufruf anknüpft (selbst `Skill { skill: ... }` aufruft), greife zuerst auch auf eine Datei zu, die den `paths:` des Skills entspricht.
- Die Kombination von `paths:` mit `disable-model-invocation: true` ist erlaubt, aber die Beschränkung hat keinen Effekt – der Skill ist ohnehin vor dem Modell verborgen, sodass die Pfadaktivierung ihn niemals anzeigt.

### Optional: Benutzer- und Modellaufrufe steuern

Skills sind standardmäßig vom Benutzer aufrufbar. Um einen Skill vor der direkten Slash-Command-Nutzung zu verbergen, während er für den Modellaufruf verfügbar bleibt, setze `user-invocable: false`:

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

Dies entfernt den Skill aus dem `/<skill-name>`-Aufruf und den `/skills`-Picker-Ergebnissen. Es verbirgt den Skill nicht vor dem Modell.

Um einen Skill vor dem Modellaufruf zu verbergen, während der direkte Benutzeraufruf verfügbar bleibt, setze `disable-model-invocation: true`:

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

Du kannst beide Felder kombinieren, aber dann ist der Skill über die normalen Benutzer- oder Modellaufrufpfade nicht erreichbar.

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

Verweise auf diese Dateien aus `SKILL.md`:

````markdown
Für fortgeschrittene Verwendung siehe [reference.md](./reference.md).

Führe das Helper-Skript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code entdeckt Skills aus:

- Persönliche Skills: `~/.qwen/skills/`
- Projekt-Skills: `.qwen/skills/`
- Extension-Skills: Skills, die von installierten Extensions bereitgestellt werden

### Extension-Skills

Extensions können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Extension aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Extension gespeichert und folgen demselben Format wie persönliche Skills und Projekt-Skills.

Extension-Skills werden automatisch erkannt und geladen, wenn die Extension installiert und aktiviert ist.

Um zu sehen, welche Extensions Skills bereitstellen, überprüfe die `qwen-extension.json`-Datei der Extension auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, frage direkt bei Qwen Code nach:

```text
Welche Skills sind verfügbar?
```

> **Achtung – Modell- vs. Benutzeransicht.** Wenn du das Modell fragst, werden nur Skills angezeigt, die das Modell aktuell sehen kann. Wenn ein Skill `paths:` verwendet (siehe "Optional: Einen Skill auf Dateipfade beschränken" weiter oben), bleibt er aus dieser Liste ausgeschlossen, bis eine passende Datei berührt wurde. Der Slash-Command `/skills` zeigt Skills an, die du direkt aufrufen kannst; Skills mit `user-invocable: false` bleiben auf der Festplatte sichtbar und sind möglicherweise weiterhin für das Modell sichtbar.

Oder durchsuche die vom Benutzer aufrufbare Liste mit dem Slash-Command (einschließlich pfadbeschränkter Skills, die noch nicht aktiviert wurden):

```text
/skills
```

Oder inspiziere das Dateisystem:

```bash
# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projekt-Skills auflisten (wenn in einem Projektverzeichnis)
ls .qwen/skills/

# Inhalt eines bestimmten Skills anzeigen
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Einen Skill testen

Teste einen Skill nach der Erstellung, indem du Fragen stellst, die deiner Beschreibung entsprechen.

Beispiel: Wenn deine Beschreibung "PDF-Dateien" erwähnt:

```text
Kannst du mir helfen, Text aus dieser PDF zu extrahieren?
```

Das Modell entscheidet autonom, deinen Skill zu verwenden, wenn er zur Anfrage passt – du musst ihn nicht explizit aufrufen.

## Einen Skill debuggen

Wenn Qwen Code deinen Skill nicht verwendet, überprüfe diese häufigen Probleme:

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

### YAML-Syntax überprüfen

Ungültiges YAML verhindert, dass die Skill-Metadaten korrekt geladen werden.

```bash
cat SKILL.md | head -n 15
```

Stelle sicher:

- Öffnende `---` in Zeile 1
- Schließende `---` vor dem Markdown-Inhalt
- Gültige YAML-Syntax (keine Tabs, korrekte Einrückung)

### Fehler anzeigen

Starte Qwen Code im Debug-Modus, um Fehler beim Laden von Skills zu sehen:

```bash
qwen --debug
```

## Skills mit deinem Team teilen

Du kannst Skills über Projekt-Repositories teilen:

1. Füge den Skill unter `.qwen/skills/` hinzu
2. Committen und pushen
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

Änderungen werden beim nächsten Start von Qwen Code wirksam. Wenn Qwen Code bereits läuft, starte es neu, um die Updates zu laden.

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

Ein Skill sollte eine einzige Fähigkeit abdecken:

- Fokussiert: "PDF-Formulare ausfüllen", "Excel-Analyse", "Git-Commit-Nachrichten"
- Zu breit: "Dokumentenverarbeitung" (in kleinere Skills aufteilen)

### Schreibe klare Beschreibungen

Hilf dem Modell zu erkennen, wann Skills verwendet werden sollen, indem du spezifische Trigger einfügst:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste mit deinem Team

- Aktiviert sich der Skill wie erwartet?
- Sind die Anweisungen klar?
- Fehlen Beispiele oder Edge Cases?