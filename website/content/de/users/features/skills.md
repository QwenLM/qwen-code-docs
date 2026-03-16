# Agent-Fähigkeiten

> Erstellen, verwalten und teilen Sie Fähigkeiten (Skills), um die Funktionalität von Qwen Code zu erweitern.

In dieser Anleitung erfahren Sie, wie Sie Agent-Fähigkeiten in **Qwen Code** erstellen, nutzen und verwalten. Fähigkeiten sind modulare Funktionen, die die Leistungsfähigkeit des Modells durch strukturierte Ordner mit Anweisungen (und optional Skripten oder Ressourcen) erweitern.

## Voraussetzungen

- Qwen Code (aktuelle Version)
- Grundlegende Vertrautheit mit Qwen Code ([Schnellstart](../quickstart.md))

## Was sind Agent-Fähigkeiten?

Agent-Fähigkeiten bündeln Fachwissen in auffindbare Funktionen. Jede Fähigkeit besteht aus einer `SKILL.md`-Datei mit Anweisungen, die das Modell bei Bedarf lädt, sowie optionalen unterstützenden Dateien wie Skripten und Vorlagen.

### Aufruf von Skills

Skills werden **vom Modell aufgerufen** – das Modell entscheidet autonom, wann sie basierend auf Ihrer Anfrage und der Beschreibung des Skills eingesetzt werden. Dies unterscheidet sich von Slash-Befehlen, die **vom Benutzer aufgerufen** werden (Sie geben explizit `/Befehl` ein).

Wenn Sie einen Skill explizit aufrufen möchten, verwenden Sie den Slash-Befehl `/skills`:

```bash
/skills <skill-name>
```

Nutzen Sie die Autovervollständigung, um verfügbare Skills und deren Beschreibungen einzusehen.

### Vorteile

- Erweitern Sie Qwen Code für Ihre individuellen Workflows.
- Teilen Sie Ihr Fachwissen über Git mit Ihrem Team.
- Reduzieren Sie wiederholte Prompting-Aufgaben.
- Kombinieren Sie mehrere Skills für komplexe Aufgaben.

## Erstellen eines Skills

Skills werden als Verzeichnisse gespeichert, die eine Datei `SKILL.md` enthalten.

### Persönliche Skills

Persönliche Skills stehen in allen Ihren Projekten zur Verfügung. Speichern Sie sie unter `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Verwenden Sie persönliche Skills für:

- Ihre individuellen Workflows und Präferenzen
- Skills, an denen Sie gerade arbeiten
- Persönliche Produktivitätshilfen

### Projektfähigkeiten

Projektfähigkeiten werden mit Ihrem Team geteilt. Speichern Sie sie im Verzeichnis `.qwen/skills/` Ihres Projekts:

```bash
mkdir -p .qwen/skills/meine-faehigkeit
```

Verwenden Sie Projektfähigkeiten für:

- Team-Workflows und Konventionen
- Projektbezogene Fachkenntnisse
- Gemeinsam genutzte Hilfsprogramme und Skripte

Projektfähigkeiten können in Git commited werden und stehen Ihren Teammitgliedern automatisch zur Verfügung.

## Erstellen Sie `SKILL.md`

Erstellen Sie eine Datei `SKILL.md` mit YAML-Frontmatter und Markdown-Inhalt:

```yaml
---
name: ihre-faehigkeit
description: Kurze Beschreibung dessen, was diese Fähigkeit leistet und wann sie eingesetzt werden sollte
---

# Ihr Fähigkeitsname

## Anleitung
Geben Sie klare, schrittweise Anweisungen für Qwen Code.

## Beispiele
Zeigen Sie konkrete Beispiele für die Verwendung dieser Fähigkeit.

### Feldanforderungen

Qwen Code überprüft derzeit Folgendes:

- `name` ist eine nichtleere Zeichenkette.
- `description` ist eine nichtleere Zeichenkette.

Empfohlene Konventionen (derzeit noch nicht streng durchgesetzt):

- Verwenden Sie in `name` ausschließlich Kleinbuchstaben, Ziffern und Bindestriche.
- Formulieren Sie `description` präzise: Geben Sie sowohl an, **was** der Skill tut, als auch **wann** er eingesetzt werden soll (Schlüsselbegriffe, die Benutzer natürlicherweise verwenden).

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
Für fortgeschrittene Anwendungsfälle siehe [reference.md](reference.md).

Führen Sie das Hilfsprogramm aus:

```bash
python scripts/helper.py input.txt
```
````

## Verfügbare Skills anzeigen

Qwen Code erkennt Skills aus folgenden Quellen:

- Persönliche Skills: `~/.qwen/skills/`
- Projekt-Skills: `.qwen/skills/`
- Erweiterungs-Skills: Skills, die von installierten Erweiterungen bereitgestellt werden

### Erweiterungs-Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, die verfügbar werden, sobald die Erweiterung aktiviert ist. Diese Skills werden im `skills/`-Verzeichnis der Erweiterung gespeichert und folgen demselben Format wie persönliche und Projekt-Skills.

Erweiterungs-Skills werden automatisch erkannt und geladen, sobald die Erweiterung installiert und aktiviert ist.

Um herauszufinden, welche Erweiterungen Skills bereitstellen, prüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein Feld `skills`.

Um die verfügbaren Skills anzuzeigen, fragen Sie Qwen Code direkt:

```text
Welche Skills sind verfügbar?
```

Oder durchsuchen Sie das Dateisystem:

```bash

# Persönliche Skills auflisten
ls ~/.qwen/skills/

# Projekt-Skills auflisten (sofern sich im Projektverzeichnis)
ls .qwen/skills/

# Inhalt eines bestimmten Skills anzeigen
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Eine Skill testen

Nachdem Sie eine Skill erstellt haben, testen Sie sie, indem Sie Fragen stellen, die Ihrer Beschreibung entsprechen.

Beispiel: Wenn Ihre Beschreibung „PDF-Dateien“ erwähnt:

```text
Können Sie mir helfen, Text aus dieser PDF-Datei zu extrahieren?
```

Das Modell entscheidet autonom, ob es Ihre Skill verwendet – eine explizite Aufruf ist nicht erforderlich.

## Eine Skill debuggen

Falls Qwen Code Ihre Skill nicht verwendet, prüfen Sie diese häufigen Ursachen:

### Machen Sie die Beschreibung spezifisch

Zu vage:

```yaml
description: Hilft bei Dokumenten
```

Spezifisch:

```yaml
description: Extrahiert Text und Tabellen aus PDF-Dateien, füllt Formulare aus und führt Dokumente zusammen. Verwenden Sie diese Skill bei der Arbeit mit PDF-Dateien, Formularen oder der Extraktion von Dokumenteninhalten.
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

### YAML-Syntax überprüfen

Ungültiges YAML verhindert das korrekte Laden der Skill-Metadaten.

```bash
cat SKILL.md | head -n 15
```

Stellen Sie sicher, dass:

- Die öffnende Zeile `---` in Zeile 1 steht,
- Die schließende Zeile `---` vor dem eigentlichen Markdown-Inhalt steht,
- Die YAML-Syntax gültig ist (keine Tabulatoren, korrekte Einrückung).

### Fehler anzeigen

Führen Sie Qwen Code im Debug-Modus aus, um Fehler beim Laden von Skills anzuzeigen:

```bash
qwen --debug
```

## Skills mit Ihrem Team teilen

Sie können Skills über Projekt-Repositorys teilen:

1. Fügen Sie den Skill unter `.qwen/skills/` hinzu.
2. Committen und pushen Sie die Änderungen.
3. Ihre Teamkollegen ziehen die Änderungen ab.

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

# Projektskill
code .qwen/skills/my-skill/SKILL.md
```

Die Änderungen werden beim nächsten Start von Qwen Code wirksam. Falls Qwen Code bereits läuft, starten Sie es neu, um die Aktualisierungen zu laden.

## Einen Skill entfernen

Löschen Sie das Skill-Verzeichnis:

# Persönlich
rm -rf ~/.qwen/skills/mein-skill

# Projekt
rm -rf .qwen/skills/mein-skill
git commit -m "Unbenutzte Skill entfernen"
```

## Best Practices

### Skills fokussiert halten

Eine Skill sollte genau eine Funktionalität abdecken:

- Fokussiert: „PDF-Formulare ausfüllen“, „Excel-Analyse“, „Git-Commit-Nachrichten erstellen“
- Zu umfassend: „Dokumentverarbeitung“ (stattdessen in kleinere Skills aufteilen)

### Klare Beschreibungen verfassen

Unterstützen Sie das Modell dabei, den richtigen Zeitpunkt für den Einsatz einer Skill zu erkennen, indem Sie konkrete Auslöser in die Beschreibung einbeziehen:

```yaml
description: Analysiere Excel-Arbeitsblätter, erstelle Pivot-Tabellen und generiere Diagramme. Verwende diese Skill bei der Arbeit mit Excel-Dateien, Tabellenkalkulationen oder .xlsx-Daten.
```

### Mit Ihrem Team testen

- Wird die Skill zum erwarteten Zeitpunkt aktiviert?
- Sind die Anweisungen verständlich?
- Fehlen Beispiele oder sind Randfälle nicht abgedeckt?