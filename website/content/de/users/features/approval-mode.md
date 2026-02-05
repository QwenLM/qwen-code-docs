# Genehmigungsmodus

Qwen Code bietet drei verschiedene Berechtigungsmodi, mit denen Sie basierend auf der Aufgabenkomplexität und dem Risikostandard flexibel steuern können, wie KI mit Ihrem Code und System interagiert.

## Vergleich der Berechtigungsmodi

| Modus          | Dateibearbeitung            | Shell-Befehle               | Am besten geeignet für                                                                                 | Risikostufe |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**​      | ❌ Nur Leseanalyse          | ❌ Wird nicht ausgeführt    | • Code-Exploration <br>• Planung komplexer Änderungen <br>• Sichere Code-Reviews                       | Niedrigste |
| **Default**​   | ✅ Manuelle Genehmigung erforderlich | ✅ Manuelle Genehmigung erforderlich | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Team-Zusammenarbeit <br>• Lernen und Lehren | Niedrig |
| **Auto-Edit**​ | ✅ Automatisch genehmigt    | ❌ Manuelle Genehmigung erforderlich | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Code-Verbesserungen <br>• Sichere Automatisierung | Mittel |
| **YOLO**​      | ✅ Automatisch genehmigt    | ✅ Automatisch genehmigt    | • Vertrauenswürdige persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Stapelverarbeitungsaufgaben | Höchste |

### Kurzreferenz

- **Im Planmodus starten**: Ideal, um vor Änderungen ein Verständnis zu bekommen
- **Im Standardmodus arbeiten**: Die ausgewogene Wahl für die meisten Entwicklungsarbeiten
- **Zum Auto-Edit wechseln**: Wenn Sie viele sichere Codeänderungen vornehmen
- **YOLO sparsam nutzen**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Sie können während einer Sitzung schnell zwischen den Modi wechseln, indem Sie **Umschalt+Tab** (oder **Tab** unter Windows) verwenden. Die Statusleiste des Terminals zeigt Ihren aktuellen Modus an, sodass Sie stets wissen, welche Berechtigungen Qwen Code hat.

## 1. Nutzen Sie den Planmodus für eine sichere Codeanalyse

Der Planmodus weist Qwen Code an, einen Plan zu erstellen, indem es die Codebasis mit **schreibgeschützten** Operationen analysiert – ideal zum Erkunden von Codebasen, Planen komplexer Änderungen oder sicheren Überprüfen von Code.

### Wann Sie den Plan-Modus verwenden sollten

- **Mehrschrittige Implementierung**: Wenn Ihre Funktion Änderungen an vielen Dateien erfordert
- **Code-Exploration**: Wenn Sie den Code gründlich erforschen möchten, bevor Sie etwas ändern
- **Interaktive Entwicklung**: Wenn Sie mit Qwen Code iterativ an der Richtung arbeiten möchten

### So verwenden Sie den Plan-Modus

**Plan-Modus während einer Sitzung aktivieren**

Sie können während einer Sitzung in den Plan-Modus wechseln, indem Sie **Umschalt+Tab** (oder **Tab** unter Windows) verwenden, um durch die Berechtigungsmodi zu schalten.

Wenn Sie sich im Normalmodus befinden, wechselt **Umschalt+Tab** (oder **Tab** unter Windows) zunächst in den `auto-edits`-Modus, gekennzeichnet durch `⏵⏵ accept edits on` am unteren Rand des Terminals. Ein anschließendes **Umschalt+Tab** (oder **Tab** unter Windows) wechselt in den Plan-Modus, gekennzeichnet durch `⏸ plan mode`.

**Eine neue Sitzung im Plan-Modus starten**

Um eine neue Sitzung im Plan-Modus zu starten, verwenden Sie `/approval-mode` und wählen dann `plan` aus

```bash
/approval-mode
```

**„Headless“-Abfragen im Plan-Modus ausführen**

Sie können eine Abfrage auch direkt im Plan-Modus mit `-p` oder `prompt` ausführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Beispiel: Planen einer komplexen Refaktorisierung

```bash
/approval-mode plan
```

```
Ich muss unser Authentifizierungssystem so umgestalten, dass es OAuth2 verwendet. Erstellen Sie einen detaillierten Migrationsplan.
```

Qwen Code analysiert die aktuelle Implementierung und erstellt einen umfassenden Plan. Verfeinern Sie diesen mit Folgeanfragen:

```
Wie sieht es mit der Abwärtskompatibilität aus?
Wie sollten wir das Datenbank-Migration handhaben?
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

## 2. Verwenden Sie den Standardmodus für kontrollierte Interaktion

Der Standardmodus ist die übliche Arbeitsweise mit Qwen Code. In diesem Modus behalten Sie die vollständige Kontrolle über alle potenziell riskanten Vorgänge – Qwen Code bittet um Ihre Genehmigung, bevor Dateiänderungen vorgenommen oder Shell-Befehle ausgeführt werden.

### Wann Sie den Standardmodus verwenden sollten

- **Neu in einem Codebase**: Wenn Sie ein unbekanntes Projekt erkunden und besonders vorsichtig sein möchten
- **Kritische Systeme**: Wenn Sie an Produktionscode, Infrastruktur oder sensiblen Daten arbeiten
- **Lernen und Lehren**: Wenn Sie jeden Schritt verstehen möchten, den Qwen Code ausführt
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik betreffen

### So verwenden Sie den Standardmodus

**Standardmodus während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Umschalt+Tab** (oder **Tab** unter Windows) in den Standardmodus wechseln, um durch die Berechtigungsmodi zu blättern. Wenn Sie sich in einem anderen Modus befinden, gelangen Sie durch Drücken von **Umschalt+Tab** (oder **Tab** unter Windows) schließlich wieder zum Standardmodus, der dadurch gekennzeichnet ist, dass am unteren Rand des Terminals kein Modus-Indikator angezeigt wird.

**Eine neue Sitzung im Standardmodus starten**

Der Standardmodus ist der Ausgangsmodus, wenn Sie Qwen Code starten. Falls Sie den Modus geändert haben und zum Standardmodus zurückkehren möchten, verwenden Sie:

```
/approval-mode default
```

**„Headless“-Abfragen im Standardmodus ausführen**

Beim Ausführen von Headless-Befehlen ist das Standardverhalten der Standardmodus. Sie können ihn explizit wie folgt angeben:

```
qwen --prompt "Analysiere diesen Code auf potenzielle Fehler"
```

### Beispiel: Sichere Implementierung einer Funktion

```
/approval-mode default
```

```
Ich muss Profilbilder der Benutzer zu unserer Anwendung hinzufügen. Die Bilder sollen in einem S3-Bucket gespeichert und die URLs in der Datenbank abgelegt werden.
```

Qwen Code analysiert Ihren Codebestand und schlägt einen Plan vor. Danach bittet es um Genehmigung vor:

1. Erstellen neuer Dateien (Controller, Modelle, Migrationen)
2. Ändern bestehender Dateien (Hinzufügen neuer Spalten, Aktualisieren von APIs)
3. Ausführen von Shell-Befehlen (Datenbank-Migrationen, Installation von Abhängigkeiten)

Sie können jede vorgeschlagene Änderung einzeln überprüfen und genehmigen oder ablehnen.

### Standardmodus als Voreinstellung konfigurieren

```bash
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

## 3. Automatische Bearbeitungsmodi

Der Automatische-Bearbeitungsmodus weist Qwen Code an, Dateiänderungen automatisch zu genehmigen, während für Shell-Befehle eine manuelle Genehmigung erforderlich ist. Dies ist ideal, um Entwicklungsworkflows zu beschleunigen, während die System-Sicherheit gewahrt bleibt.

### Wann Sie den Auto-Accept-Edits-Modus verwenden sollten

- **Tägliche Entwicklung**: Ideal für die meisten Codierungsarbeiten
- **Sichere Automatisierung**: Erlaubt der KI, Code zu ändern, während versehentliche Ausführung gefährlicher Befehle verhindert wird
- **Teamzusammenarbeit**: Verwenden Sie ihn in gemeinsamen Projekten, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### So schalten Sie in diesen Modus um

```

# Umschaltung über Befehl
/approval-mode auto-edit

# Oder verwenden Sie die Tastenkombination
Shift+Tab (oder Tab unter Windows) # Von anderen Modi wechseln
```

### Beispielablauf

1. Sie bitten Qwen Code, eine Funktion umzustrukturieren
2. Die KI analysiert den Code und schlägt Änderungen vor
3. **Automatisch**​ werden alle Dateiänderungen ohne Bestätigung angewendet
4. Falls Tests ausgeführt werden müssen, wird um **Genehmigung**​ gebeten, um `npm test` auszuführen

## 4. YOLO-Modus – Vollständige Automatisierung

Im YOLO-Modus erhält Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Tool-Aufrufe einschließlich Dateibearbeitung und Shell-Befehle.

### Wann YOLO-Modus verwenden

- **Automatisierte Skripte**: Ausführen vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatische Ausführung in kontrollierten Umgebungen
- **Private Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **YOLO-Modus mit Vorsicht verwenden**: KI kann jeden Befehl mit Ihren Terminal-Berechtigungen ausführen. Stellen Sie sicher:
>
> 1. Sie vertrauen dem aktuellen Code-Basis
> 2. Sie verstehen alle Aktionen, die die KI durchführen wird
> 3. Wichtige Dateien gesichert oder im Versionskontrollsystem committet sind

### So aktivieren Sie den YOLO-Modus

```

# Temporär aktivieren (nur aktuelle Sitzung)
/approval-mode yolo

# Als Projektstandard festlegen
/approval-mode yolo --project

# Als Benutzer-Globalstandard festlegen
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

### Beispiel für automatisierten Workflow

```bash

# Vollautomatische Refactoring-Aufgabe
qwen --prompt "Test-Suite ausführen, alle fehlschlagenden Tests beheben und dann Änderungen committen"

# Ohne menschliches Eingreifen wird KI:

# 1. Testbefehle ausführen (Auto-genehmigt)

# 2. Fehlgeschlagene Testfälle beheben (Auto-Dateiänderungen)

# 3. Git-Commit ausführen (Auto-genehmigt)
```

## Moduswechsel & Konfiguration

### Tastaturkürzel-Wechsel

Während einer Qwen Code-Sitzung verwenden Sie **Umschalt+Tab**​ (oder **Tab** unter Windows), um schnell zwischen den drei Modi zu wechseln:

```
Standardmodus → Auto-Edit-Modus → YOLO-Modus → Plan-Modus → Standardmodus
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

### Modus-Nutzungsempfehlungen

1. **Neu im Codebase**: Beginnen Sie mit **Plan-Modus** für sichere Exploration
2. **Tägliche Entwicklungsarbeiten**: Verwenden Sie **Auto-Accept Edits** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Verwenden Sie **YOLO-Modus** in kontrollierten Umgebungen für vollständige Automatisierung
4. **Komplexe Refactorings**: Verwenden Sie zunächst den **Plan-Modus** für detaillierte Planung, danach wechseln Sie zum geeigneten Modus für die Ausführung