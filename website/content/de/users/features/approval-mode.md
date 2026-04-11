# Genehmigungsmodus

Qwen Code bietet vier verschiedene Berechtigungsmodi, mit denen du flexibel steuern kannst, wie die KI mit deinem Code und System interagiert – abhängig von der Komplexität der Aufgabe und dem Risikolevel.

## Vergleich der Berechtigungsmodi

| Modus           | Dateibearbeitung                | Shell-Befehle              | Ideal für                                                                                               | Risikolevel |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**​      | ❌ Nur Lesezugriff/Analyse  | ❌ Nicht ausgeführt             | • Code-Exploration <br>• Planung komplexer Änderungen <br>• Sicheres Code-Review                               | Niedrigstes     |
| **Default**​   | ✅ Manuelle Bestätigung erforderlich | ✅ Manuelle Bestätigung erforderlich | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Teamzusammenarbeit <br>• Lernen und Lehren | Niedrig        |
| **Auto-Edit**​ | ✅ Automatisch bestätigt            | ❌ Manuelle Bestätigung erforderlich | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Code-Verbesserungen <br>• Sichere Automatisierung                | Mittel     |
| **YOLO**​      | ✅ Automatisch bestätigt            | ✅ Automatisch bestätigt            | • Vertrauenswürdige persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Batch-Verarbeitungsaufgaben                 | Höchstes    |

### Kurzübersicht

- **Starte im Plan-Modus**: Ideal, um den Code zu verstehen, bevor Änderungen vorgenommen werden
- **Arbeite im Default-Modus**: Die ausgewogene Wahl für die meisten Entwicklungsaufgaben
- **Wechsle zu Auto-Edit**: Wenn du viele sichere Code-Änderungen vornimmst
- **Nutze YOLO sparsam**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Du kannst während einer Sitzung schnell zwischen den Modi wechseln, indem du **Shift+Tab** (oder **Tab** unter Windows) drückst. Die Statusleiste des Terminals zeigt deinen aktuellen Modus an, sodass du immer weißt, welche Berechtigungen Qwen Code hat.

## 1. Nutze den Plan-Modus für sichere Code-Analysen

Der Plan-Modus weist Qwen Code an, einen Plan zu erstellen, indem die Codebase mit **Lesezugriff** analysiert wird. Ideal zum Erkunden von Codebasen, Planen komplexer Änderungen oder sicheren Code-Reviews.

### Wann du den Plan-Modus nutzen solltest

- **Mehrstufige Implementierung**: Wenn dein Feature Änderungen an vielen Dateien erfordert
- **Code-Exploration**: Wenn du die Codebase gründlich erforschen möchtest, bevor du etwas änderst
- **Interaktive Entwicklung**: Wenn du die Richtung gemeinsam mit Qwen Code iterativ anpassen möchtest

### So nutzt du den Plan-Modus

**Aktiviere den Plan-Modus während einer Sitzung**

Du kannst während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) durch die Berechtigungsmodi wechseln und so in den Plan-Modus gelangen.

Befindest du dich im Normalmodus, wechselt **Shift+Tab** (oder **Tab** unter Windows) zunächst in den `auto-edits`-Modus, erkennbar an `⏵⏵ accept edits on` am unteren Rand des Terminals. Ein erneutes Drücken von **Shift+Tab** (oder **Tab** unter Windows) wechselt in den Plan-Modus, angezeigt durch `⏸ plan mode`.

**Verwende den `/plan`-Befehl**

Der `/plan`-Befehl bietet eine schnelle Möglichkeit, den Plan-Modus zu aktivieren und zu verlassen:

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

Wenn du den Plan-Modus mit `/plan exit` verlässt, wird dein vorheriger Genehmigungsmodus automatisch wiederhergestellt (z. B. kehrst du zu Auto-Edit zurück, wenn du dich vor dem Plan-Modus in diesem Modus befunden hast).

**Starte eine neue Sitzung im Plan-Modus**

Um eine neue Sitzung im Plan-Modus zu starten, verwende `/approval-mode` und wähle anschließend `plan` aus.

```bash
/approval-mode
```

**Führe „headless“-Abfragen im Plan-Modus aus**

Du kannst eine Abfrage im Plan-Modus auch direkt mit `-p` oder `prompt` ausführen:

```bash
qwen --prompt "What is machine learning?"
```

### Beispiel: Planung eines komplexen Refactorings

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code wechselt in den Plan-Modus und analysiert die aktuelle Implementierung, um einen umfassenden Plan zu erstellen. Verfeinere ihn mit Folgefragen:

```
What about backward compatibility?
How should we handle database migration?
```

### Konfiguriere den Plan-Modus als Standard

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Nutze den Default-Modus für kontrollierte Interaktion

Der Default-Modus ist die Standardarbeitsweise mit Qwen Code. In diesem Modus behältst du die volle Kontrolle über alle potenziell riskanten Operationen – Qwen Code fragt vor jeder Dateiänderung oder Ausführung von Shell-Befehlen nach deiner Bestätigung.

### Wann du den Default-Modus nutzen solltest

- **Neu in einer Codebase**: Wenn du ein unbekanntes Projekt erkundest und besonders vorsichtig sein möchtest
- **Kritische Systeme**: Wenn du an Produktionscode, Infrastruktur oder sensiblen Daten arbeitest
- **Lernen und Lehren**: Wenn du jeden Schritt nachvollziehen möchtest, den Qwen Code unternimmt
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebase arbeiten
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik betreffen

### So nutzt du den Default-Modus

**Aktiviere den Default-Modus während einer Sitzung**

Du kannst während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) durch die Berechtigungsmodi wechseln und so in den Default-Modus gelangen. Befindest du dich in einem anderen Modus, führt wiederholtes Drücken von **Shift+Tab** (oder **Tab** unter Windows) schließlich zurück zum Default-Modus, erkennbar daran, dass am unteren Rand des Terminals kein Modus-Indikator angezeigt wird.

**Starte eine neue Sitzung im Default-Modus**

Der Default-Modus ist der Startmodus beim Öffnen von Qwen Code. Wenn du den Modus gewechselt hast und zum Default-Modus zurückkehren möchtest, verwende:

```
/approval-mode default
```

**Führe „headless“-Abfragen im Default-Modus aus**

Bei der Ausführung von Headless-Befehlen ist der Default-Modus das Standardverhalten. Du kannst ihn explizit angeben mit:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Beispiel: Sichere Implementierung eines Features

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code analysiert deine Codebase und schlägt einen Plan vor. Anschließend fragt er vor folgenden Schritten um Bestätigung:

1. Erstellen neuer Dateien (Controller, Modelle, Migrationen)
2. Ändern bestehender Dateien (Hinzufügen neuer Spalten, Aktualisieren von APIs)
3. Ausführen von Shell-Befehlen (Datenbank-Migrationen, Installation von Abhängigkeiten)

Du kannst jede vorgeschlagene Änderung prüfen und einzeln genehmigen oder ablehnen.

### Konfiguriere den Default-Modus als Standard

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Auto-Edit-Modus

Der Auto-Edit-Modus weist Qwen Code an, Dateiänderungen automatisch zu bestätigen, während Shell-Befehle weiterhin manuell genehmigt werden müssen. Ideal, um Entwicklungs-Workflows zu beschleunigen und gleichzeitig die Systemsicherheit zu wahren.

### Wann du den Auto-Edit-Modus nutzen solltest

- **Tägliche Entwicklung**: Ideal für die meisten Coding-Aufgaben
- **Sichere Automatisierung**: Ermöglicht der KI, Code zu ändern, während die versehentliche Ausführung gefährlicher Befehle verhindert wird
- **Teamzusammenarbeit**: Nutze ihn in gemeinsamen Projekten, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### So wechselst du in diesen Modus

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### Workflow-Beispiel

1. Du bittest Qwen Code, eine Funktion zu refactoren
2. Die KI analysiert den Code und schlägt Änderungen vor
3. **Automatische** Anwendung aller Dateiänderungen ohne Bestätigung
4. Falls Tests ausgeführt werden müssen, **fordert sie eine Bestätigung** zur Ausführung von `npm test` an

## 4. YOLO-Modus – Vollautomatisierung

Der YOLO-Modus gewährt Qwen Code die höchsten Berechtigungen und bestätigt alle Tool-Aufrufe automatisch, einschließlich Dateiänderungen und Shell-Befehlen.

### Wann du den YOLO-Modus nutzen solltest

- **Automatisierte Skripte**: Ausführung vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatisierte Ausführung in kontrollierten Umgebungen
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **Nutze den YOLO-Modus mit Vorsicht**: Die KI kann jeden Befehl mit den Berechtigungen deines Terminals ausführen. Stelle sicher:
>
> 1. Du vertraust der aktuellen Codebase
> 2. Du verstehst alle Aktionen, die die KI ausführen wird
> 3. Wichtige Dateien gesichert oder in die Versionskontrolle eingecheckt sind

### So aktivierst du den YOLO-Modus

```
# Temporarily enable (current session only)
/approval-mode yolo

# Set as project default
/approval-mode yolo --project

# Set as user global default
/approval-mode yolo --user
```

### Konfigurationsbeispiel

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "yolo",
"confirmShellCommands": false,
"confirmFileEdits": false
  }
}
```

### Beispiel für einen automatisierten Workflow

```bash
# Fully automated refactoring task
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Without human intervention, AI will:
# 1. Run test commands (auto-approved)
# 2. Fix failed test cases (auto-edit files)
# 3. Execute git commit (auto-approved)
```

## Moduswechsel & Konfiguration

### Wechsel per Tastenkürzel

Während einer Qwen Code-Sitzung kannst du mit **Shift+Tab** (oder **Tab** unter Windows) schnell durch die vier Modi wechseln:

```
Default Mode → Auto-Edit Mode → YOLO Mode → Plan Mode → Default Mode
```

### Persistente Konfiguration

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "permissions": {
"defaultMode": "auto-edit",  // or "plan" or "yolo"
"confirmShellCommands": true,
"confirmFileEdits": true
  }
}
```

### Empfehlungen zur Modusnutzung

1. **Neu in der Codebase**: Starte mit dem **Plan-Modus** für eine sichere Exploration
2. **Tägliche Entwicklungsaufgaben**: Nutze **Auto-Edit** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Nutze den **YOLO-Modus** in kontrollierten Umgebungen für Vollautomatisierung
4. **Komplexes Refactoring**: Nutze zuerst den **Plan-Modus** für eine detaillierte Planung und wechsle dann für die Ausführung in den passenden Modus