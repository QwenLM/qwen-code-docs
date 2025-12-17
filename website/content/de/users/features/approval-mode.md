# Genehmigungsmodus

Qwen Code bietet drei verschiedene Berechtigungsmodi, mit denen Sie flexibel steuern können, wie KI mit Ihrem Code und System interagiert, basierend auf der Aufgabenkomplexität und dem Risikoniveau.

## Vergleich der Berechtigungsmodi

| Modus          | Dateibearbeitung            | Shell-Befehle               | Am besten geeignet für                                                                                | Risikoniveau |
| -------------- | --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| **Plan**​      | ❌ Nur Lesezugriff          | ❌ Nicht ausgeführt         | • Code-Exploration <br>• Planung komplexer Änderungen <br>• Sichere Code-Überprüfung                 | Niedrigste   |
| **Default**​   | ✅ Manuelle Genehmigung erforderlich | ✅ Manuelle Genehmigung erforderlich | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Teamzusammenarbeit <br>• Lernen und Lehren | Niedrig      |
| **Auto-Edit**​ | ✅ Automatisch genehmigt    | ❌ Manuelle Genehmigung erforderlich | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Codeverbesserungen <br>• Sichere Automatisierung | Mittel       |
| **YOLO**​      | ✅ Automatisch genehmigt    | ✅ Automatisch genehmigt    | • Vertrauenswürdige persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Stapelverarbeitungsaufgaben | Höchstes     |

### Kurzreferenzhandbuch

- **Im Planmodus starten**: Ideal, um vor dem Ändern die Zusammenhänge zu verstehen
- **Im Standardmodus arbeiten**: Die ausgewogene Wahl für den Großteil der Entwicklungsarbeit
- **Zum Auto-Edit wechseln**: Wenn viele sichere Codeänderungen durchgeführt werden
- **YOLO nur sparsam nutzen**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Du kannst während einer Sitzung mit **Umschalt+Tab** schnell zwischen den Modi wechseln. In der Statusleiste des Terminals wird der aktuelle Modus angezeigt, sodass du jederzeit weißt, welche Berechtigungen Qwen Code hat.

## 1. Verwende den Planmodus für sichere Codeanalyse

Der Planmodus weist Qwen Code an, einen Plan zu erstellen, indem die Codebasis mit **schreibgeschützten** Operationen analysiert wird. Dies eignet sich perfekt zum Erkunden von Codebasen, Planen komplexer Änderungen oder Sicherem Überprüfen von Code.

### Wann den Plan-Modus verwenden

- **Mehrschrittige Implementierung**: Wenn dein Feature Änderungen in vielen Dateien erfordert
- **Code-Erkundung**: Wenn du die Codebasis gründlich recherchieren möchtest, bevor du etwas änderst
- **Interaktive Entwicklung**: Wenn du die Richtung iterativ mit Qwen Code entwickeln möchtest

### So verwenden Sie den Planmodus

**Planmodus während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Umschalt+Tab** zwischen den Berechtigungsmodi wechseln und so in den Planmodus gelangen.

Wenn Sie sich im Normalmodus befinden, schaltet **Umschalt+Tab** zunächst in den `auto-edits`-Modus um, was durch `⏵⏵ accept edits on` am unteren Rand des Terminals angezeigt wird. Ein weiteres Drücken von **Umschalt+Tab** schaltet dann in den Planmodus um, gekennzeichnet durch `⏸ plan mode`.

**Eine neue Sitzung im Planmodus starten**

Um eine neue Sitzung im Planmodus zu starten, verwenden Sie `/approval-mode` und wählen dann `plan` aus:

```bash
/approval-mode
```

**"Headless"-Abfragen im Planmodus ausführen**

Sie können auch direkt eine Abfrage im Planmodus mit `-p` oder `prompt` ausführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Beispiel: Planen einer komplexen Refaktorisierung

```bash
/approval-mode plan
```

```
Ich muss unser Authentifizierungssystem umstellen, um OAuth2 zu verwenden. Erstelle einen detaillierten Migrationsplan.
```

Qwen Code analysiert die aktuelle Implementierung und erstellt einen umfassenden Plan. Verfeinere ihn mit Folgeanfragen:

```
Was ist mit der Abwärtskompatibilität?
Wie sollen wir die Datenbankmigration handhaben?
```

### Planmodus als Standard konfigurieren

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Standardmodus für kontrollierte Interaktion verwenden

Der Standardmodus ist die übliche Art, mit Qwen Code zu arbeiten. In diesem Modus behältst du die vollständige Kontrolle über alle potenziell riskanten Operationen – Qwen Code fordert deine Genehmigung an, bevor Dateiänderungen vorgenommen oder Shell-Befehle ausgeführt werden.

### Wann der Standardmodus verwendet wird

- **Neu in einer Codebasis**: Wenn du ein unbekanntes Projekt erkundest und besonders vorsichtig sein möchtest
- **Kritische Systeme**: Wenn du an Produktionscode, Infrastruktur oder sensiblen Daten arbeitest
- **Lernen und Lehren**: Wenn du jeden Schritt verstehen möchtest, den Qwen Code ausführt
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik betreffen

### So verwenden Sie den Standardmodus

**Standardmodus während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Umschalt+Tab**​ durch die Berechtigungsmodi wechseln. Wenn Sie sich in einem anderen Modus befinden, führt das Drücken von **Umschalt+Tab**​ schließlich wieder zum Standardmodus, was durch das Fehlen eines Modusindikators am unteren Rand des Terminals angezeigt wird.

**Eine neue Sitzung im Standardmodus starten**

Der Standardmodus ist der ursprüngliche Modus beim Starten von Qwen Code. Wenn Sie die Modi gewechselt haben und zum Standardmodus zurückkehren möchten, verwenden Sie:

```
/approval-mode default
```

**„Headless“-Abfragen im Standardmodus ausführen**

Beim Ausführen von Headless-Befehlen ist der Standardmodus das Standardverhalten. Sie können ihn explizit angeben mit:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Beispiel: Sichere Implementierung eines Features

```
/approval-mode default
```

```
Ich muss Benutzerprofilbilder zu unserer Anwendung hinzufügen. Die Bilder sollten in einem S3-Bucket gespeichert und die URLs in der Datenbank gespeichert werden.
```

Qwen Code analysiert Ihre Codebasis und schlägt einen Plan vor. Es wird dann um Genehmigung bitten, bevor:

1. Neue Dateien erstellt werden (Controller, Modelle, Migrationen)
2. Bestehende Dateien geändert werden (Hinzufügen neuer Spalten, Aktualisieren von APIs)
3. Shell-Befehle ausgeführt werden (Datenbankmigrationen, Installation von Abhängigkeiten)

Sie können jede vorgeschlagene Änderung einzeln überprüfen und genehmigen oder ablehnen.

### Standardmodus als Standard konfigurieren

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Auto-Edit-Modus

Der Auto-Edit-Modus weist Qwen Code an, Dateiänderungen automatisch zu genehmigen, während eine manuelle Genehmigung für Shell-Befehle erforderlich ist. Dies ist ideal, um Entwicklungsworkflows zu beschleunigen und gleichzeitig die Systemsicherheit zu gewährleisten.

### Wann sollte der Auto-Accept-Edits-Modus verwendet werden?

- **Tägliche Entwicklung**: Ideal für die meisten Codieraufgaben
- **Sichere Automatisierung**: Ermöglicht es der KI, Code zu ändern, während das versehentliche Ausführen gefährlicher Befehle verhindert wird
- **Teamzusammenarbeit**: Verwendung in gemeinsamen Projekten, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### Wie wechselt man in diesen Modus?

```

# Wechseln über Befehl
/approval-mode auto-edit

# Oder Tastenkombination verwenden
Shift+Tab  # Zwischen anderen Modi wechseln
```

### Beispielworkflow

1. Sie bitten Qwen Code, eine Funktion umzugestalten
2. Die KI analysiert den Code und schlägt Änderungen vor
3. **Wendet automatisch** alle Dateiänderungen ohne Bestätigung an
4. Falls Tests ausgeführt werden müssen, **fordert es eine Genehmigung** an, um `npm test` auszuführen

## 4. YOLO-Modus – Vollautomatik

Der YOLO-Modus gewährt Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Toolaufrufe, einschließlich Dateibearbeitung und Shell-Befehlen.

### Wann YOLO-Modus verwenden

- **Automatisierte Skripte**: Ausführen vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatische Ausführung in kontrollierten Umgebungen
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **YOLO-Modus mit Vorsicht verwenden**: KI kann jeden Befehl mit Ihren Terminalberechtigungen ausführen. Stellen Sie sicher:
>
> 1. Sie vertrauen der aktuellen Codebasis
> 2. Sie verstehen alle Aktionen, die die KI durchführen wird
> 3. Wichtige Dateien sind gesichert oder in der Versionskontrolle committet

### YOLO-Modus aktivieren

```

# Temporär aktivieren (nur aktuelle Sitzung)
/approval-mode yolo

# Als Projektstandard festlegen
/approval-mode yolo --project

# Als globalen Benutzerstandard festlegen
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

# Vollautomatisierte Refactoring-Aufgabe
qwen --prompt "Führe die Testsuite aus, behebe alle fehlgeschlagenen Tests und commite anschließend die Änderungen"

# Ohne menschliches Eingreifen wird die KI:

# 1. Testbefehle ausführen (automatisch genehmigt)

# 2. Fehlgeschlagene Testfälle beheben (Dateien automatisch bearbeiten)

# 3. Git-Commit ausführen (automatisch genehmigt)
```

## Moduswechsel & Konfiguration

### Tastenkombination zum Wechseln

Während einer Qwen Code-Sitzung kannst du mit **Umschalt+Tab**​ schnell zwischen den drei Modi wechseln:

```
Standardmodus → Auto-Bearbeitungsmodus → YOLO-Modus → Planungsmodus → Standardmodus
```

### Dauerhafte Konfiguration

```
// Projektebene: ./.qwen/settings.json
// Benutzerebene: ~/.qwen/settings.json
{
  "permissions": {
    "defaultMode": "auto-edit",  // oder "plan" oder "yolo"
    "confirmShellCommands": true,
    "confirmFileEdits": true
  }
}
```

### Empfehlungen zur Verwendung der Modi

1. **Neu im Codebase**: Beginne mit dem **Plan-Modus** für sichere Erkundung
2. **Tägliche Entwicklungsaufgaben**: Verwende **Auto-Accept Edits** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Verwende den **YOLO-Modus** in kontrollierten Umgebungen für vollständige Automatisierung
4. **Komplexe Refaktorierungen**: Verwende zuerst den **Plan-Modus** für detaillierte Planung, dann wechsle zum geeigneten Modus für die Ausführung