# Agent Skills

> Skills erstellen, verwalten und teilen, um die Fähigkeiten von Qwen Code zu erweitern.

Diese Anleitung zeigt, wie Sie Agent Skills in **Qwen Code** erstellen, verwenden und verwalten. Skills sind modulare Fähigkeiten, die die Effektivität des Modells durch strukturierte Ordner mit Anweisungen (und optional Skripten/Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Quickstart](../quickstart.md))

## Was sind Agent Skills?

Agent Skills bündeln Fachwissen in auffindbare Fähigkeiten. Jeder Skill besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Relevanz laden kann, plus optionalen Hilfsdateien wie Skripten und Vorlagen.

### Wie Skills aufgerufen werden

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann sie basierend auf Ihrer Anfrage und der Skill-Beschreibung verwendet werden. Dies unterscheidet sich von Slash-Befehlen, die **vom Benutzer aufgerufen** werden (Sie geben explizit `/befehl` ein).

Wenn Sie einen Skill explizit aufrufen möchten, verwenden Sie den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Nutzen Sie die Autovervollständigung, um verfügbare Skills und deren Beschreibungen zu durchsuchen.

### Vorteile

- Qwen Code für Ihre Arbeitsabläufe erweitern
- Fachwissen im Team über Git teilen
- Wiederholtes Prompting reduzieren
- Mehrere Skills für komplexe Aufgaben kombinieren

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

Projekt-Skills können in Git eingecheckt werden und werden automatisch für Teammitglieder verfügbar.

## `SKILL.md` schreiben

Erstellen Sie eine `SKILL.md`-Datei mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: your-skill-name
description: Kurze Beschreibung, was dieser Skill tut und wann er verwendet werden soll
priority: 10
---

# Ihr Skill-Name

## Anweisungen
Geben Sie klare, schrittweise Anleitungen für Qwen Code.

## Beispiele
Zeigen Sie konkrete Beispiele zur Verwendung dieses Skills.
```

### Feldanforderungen

Qwen Code validiert derzeit Folgendes:

- `name` ist ein nicht leerer String, der mit dem regulären Ausdruck `/^[\p{L}\p{N}_:.-]+$/u` übereinstimmt – Unicode-Buchstaben und -Ziffern (CJK / Kyrillisch / akzentuiertes Latein usw.) sowie `_`, `:`, `.`, `-`. Leerzeichen, Schrägstriche, Klammern und andere strukturell unsichere Zeichen werden beim Parsen abgewiesen.
- `description` ist ein nicht leerer String.
- `priority` ist optional. Wenn vorhanden, muss es eine endliche Zahl sein. Höhere Werte werden in der `/skills`-Auflistung weiter oben sortiert – die Slash-Befehl-Vervollständigung (Tippen von `/`) und die `/help`-Ansicht für benutzerdefinierte Befehle bleiben alphabetisch, sodass ein Skill mit hoher Priorität keine integrierten Befehle umordnet. Fehlende oder ungültige Werte werden als nicht gesetzt behandelt, was sich wie `0` verhält.

Empfohlene Konventionen:

- Bevorzugen Sie Kleinbuchstaben und ASCII mit Bindestrichen für teilbare Namen (z. B. `tsx-helper`)
- Machen Sie die `description` spezifisch: Geben Sie sowohl **was** der Skill tut als auch **wann** er verwendet werden soll (Schlüsselwörter, die Benutzer natürlich erwähnen)
- Verwenden Sie `priority` sparsam für Skills, die in `/skills` zuverlässig vor der standardmäßigen alphabetischen Reihenfolge erscheinen sollen. Negative Prioritäten sind erlaubt und werden unter nicht gesetzten Skills sortiert.

### Optional: Skill an Dateipfade binden (`paths:`)

Für Skills, die nur für bestimmte Teile einer Codebasis relevant sind, fügen Sie eine `paths:`-Liste mit Glob-Mustern hinzu. Der Skill bleibt aus der Liste der verfügbaren Skills des Modells heraus, bis ein Tool-Aufruf eine passende Datei berührt:

```yaml
---
name: tsx-helper
description: React TSX-Komponenten-Helfer
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Hinweise:

- Glob-Muster werden relativ zum Projektstammverzeichnis mit [picomatch](https://github.com/micromatch/picomatch) abgeglichen; Dateien außerhalb des Projektstammverzeichnisses lösen nie eine Aktivierung aus.
- Ein pfadgebundener Skill bleibt **für den Rest der Sitzung aktiviert**, sobald eine passende Datei berührt wurde. Eine neue Sitzung oder ein durch Bearbeiten einer Skill-Datei ausgelöster `refreshCache` setzt Aktivierungen zurück.
- `paths:` schränkt nur die **Modell**-Erkennung ein, und zwar nur auf der Ebene der SkillTool-Liste. Sofern nicht `user-invocable: false` gesetzt ist, können Sie einen pfadgebundenen Skill jederzeit selbst über `/<skill-name>` oder die `/skills`-Auswahl aufrufen – dieser Benutzerpfad führt den Skill-Text unabhängig vom Aktivierungsstatus aus. Auf der Modellseite bleibt die Einschränkung jedoch bestehen, bis eine passende Datei berührt wird: Ein Slash-Aufruf entsperrt **nicht** die Modellseiten-Aktivierung. Wenn Sie also möchten, dass das Modell auf Ihren Aufruf aufbaut (selbst `Skill { skill: ... }` aufruft), greifen Sie zuerst auf eine Datei zu, die den `paths:` des Skills entspricht.
- Die Kombination von `paths:` mit `disable-model-invocation: true` ist erlaubt, aber die Einschränkung hat keine Wirkung – der Skill ist dem Modell ohnehin verborgen, sodass die Pfadaktivierung ihn nicht anzeigt.

### Optional: Benutzer- und Modellaufruf steuern

Skills sind standardmäßig benutzeraufrufbar. Um einen Skill vor der direkten Slash-Befehl-Verwendung zu verbergen, ihn aber für den Modellaufruf verfügbar zu halten, setzen Sie `user-invocable: false`:

```yaml
---
name: model-only-helper
description: Helfer, den das Modell bei Bedarf aufrufen kann
user-invocable: false
---
```

Dies entfernt den Skill aus dem `/<skill-name>`-Aufruf und den `/skills`-Picker-Ergebnissen. Es verbirgt den Skill nicht vor dem Modell.

Um einen Skill vor dem Modellaufruf zu verbergen, aber die direkte Benutzerinvokation verfügbar zu halten, setzen Sie `disable-model-invocation: true`:

```yaml
---
name: manual-helper
description: Helfer, den Sie manuell aufrufen
disable-model-invocation: true
---
```

Sie können beide Felder kombinieren, aber dann ist der Skill weder über die normalen Benutzer- noch über die Modellaufrufpfade erreichbar.

## Hilfsdateien hinzufügen

Erstellen Sie zusätzliche Dateien neben der `SKILL.md`:

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

Verweisen Sie in der `SKILL.md` auf diese Dateien:

````markdown
Für fortgeschrittene Nutzung siehe [reference.md](reference.md).

Führen Sie das Hilfsskript aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code erkennt Skills aus:

- Persönlichen Skills: `~/.qwen/skills/`
- Projekt-Skills: `.qwen/skills/`
- Erweiterungs-Skills: Skills, die von installierten Erweiterungen bereitgestellt werden

### Erweiterungs-Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und Projekt-Skills.

Erweiterungs-Skills werden automatisch erkannt und geladen, wenn die Erweiterung installiert und aktiviert ist.

Um zu sehen, welche Erweiterungen Skills bereitstellen, prüfen Sie die `qwen-extension.json`-Datei der Erweiterung auf ein `skills`-Feld.

Um verfügbare Skills anzuzeigen, fragen Sie Qwen Code direkt:

```text
Welche Skills sind verfügbar?
```

> **Achtung – Modell- vs. Benutzeransicht.** Wenn Sie das Modell fragen, werden nur Skills angezeigt, die das Modell derzeit sehen kann. Wenn ein Skill `paths:` verwendet (siehe „Optional: Skill an Dateipfade binden" oben), bleibt er so lange aus dieser Auflistung heraus, bis eine passende Datei berührt wurde. Der Slash-Befehl `/skills` zeigt Skills an, die Sie direkt aufrufen können; Skills mit `user-invocable: false` bleiben auf der Festplatte sichtbar und können für das Modell weiterhin sichtbar sein.

Oder durchsuchen Sie die benutzeraufrufbare Liste mit dem Slash-Befehl (einschließlich pfadgebundener Skills, die noch nicht aktiviert wurden):

```text
/skills
```

Oder überprüfen Sie das Dateisystem:

```bash
# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projekt-Skills auflisten (wenn in einem Projektverzeichnis)
ls .qwen/skills/

# Inhalt eines bestimmten Skills anzeigen
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Einen Skill testen

Nachdem Sie einen Skill erstellt haben, testen Sie ihn, indem Sie Fragen stellen, die zu Ihrer Beschreibung passen.

Beispiel: Wenn Ihre Beschreibung „PDF-Dateien" erwähnt:

```text
Kannst du mir helfen, Text aus diesem PDF zu extrahieren?
```

Das Modell entscheidet autonom, Ihren Skill zu verwenden, wenn er zur Anfrage passt – Sie müssen ihn nicht explizit aufrufen.

## Einen Skill debuggen

Wenn Qwen Code Ihren Skill nicht verwendet, überprüfen Sie diese häufigen Probleme:

### Beschreibung spezifisch machen

Zu vage:

```yaml
description: Hilft bei Dokumenten
```

Spezifisch:

```yaml
description: Text und Tabellen aus PDF-Dateien extrahieren, Formulare ausfüllen, Dokumente zusammenführen. Verwenden bei der Arbeit mit PDFs, Formularen oder Dokumentenextraktion.
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

Sie können Skills über Projekt-Repositorys teilen:

1. Fügen Sie den Skill unter `.qwen/skills/` hinzu
2. Committen und pushen Sie
3. Teammitglieder pullen die Änderungen

```bash
git add .qwen/skills/
git commit -m "Team-Skill für PDF-Verarbeitung hinzugefügt"
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

Änderungen werden beim nächsten Start von Qwen Code wirksam. Wenn Qwen Code bereits läuft, starten Sie es neu, um die Aktualisierungen zu laden.

## Einen Skill entfernen

Löschen Sie das Skill-Verzeichnis:

```bash
# Persönlich
rm -rf ~/.qwen/skills/my-skill

# Projekt
rm -rf .qwen/skills/my-skill
git commit -m "Nicht verwendeten Skill entfernt"
```

## Best Practices

### Skills fokussiert halten

Ein Skill sollte eine Fähigkeit adressieren:

- Fokussiert: „PDF-Formular ausfüllen", „Excel-Analyse", „Git-Commit-Nachrichten"
- Zu breit: „Dokumentenverarbeitung" (in kleinere Skills aufteilen)

### Klare Beschreibungen schreiben

Helfen Sie dem Modell, den richtigen Zeitpunkt für die Verwendung von Skills zu erkennen, indem Sie spezifische Auslöser angeben:

```yaml
description: Excel-Tabellen analysieren, Pivot-Tabellen erstellen und Diagramme generieren. Verwenden bei der Arbeit mit Excel-Dateien, Tabellenkalkulationen oder .xlsx-Daten.
```

### Mit Ihrem Team testen

- Wird der Skill wie erwartet aktiviert?
- Sind die Anweisungen klar?
- Fehlen Beispiele oder Randfälle?