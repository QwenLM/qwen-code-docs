# Genehmigungsmodus

Qwen Code bietet drei verschiedene Berechtigungsmodi, mit denen Sie flexibel steuern können, wie die KI mit Ihrem Code und Ihrem System interagiert – abhängig von der Komplexität der Aufgabe und dem Risikograd.

## Berechtigungsmodi im Vergleich

| Modus         | Dateibearbeitung               | Shell-Befehle                  | Geeignet für                                                                                           | Risikostufe |
| -------------- | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| **Plan**       | ❌ Nur lesezugriffsbasierte Analyse | ❌ Wird nicht ausgeführt         | • Code-Exploration <br>• Planung komplexer Änderungen <br>• Sichere Code-Reviews                     | Niedrigst   |
| **Standard**   | ✅ Manuelle Genehmigung erforderlich | ✅ Manuelle Genehmigung erforderlich | • Neue oder unbekannte Codebasen <br>• Kritische Systeme <br>• Teamzusammenarbeit <br>• Lernen und Lehren | Niedrig     |
| **Auto-Edit**  | ✅ Automatisch genehmigt       | ❌ Manuelle Genehmigung erforderlich | • Tägliche Entwicklungsarbeiten <br>• Refactoring und Code-Verbesserungen <br>• Sichere Automatisierung | Mittel      |
| **YOLO**       | ✅ Automatisch genehmigt       | ✅ Automatisch genehmigt       | • Vertrauenswürdige persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Stapelverarbeitungsaufgaben | Höchst      |

### Kurzreferenz

- **Beginnen Sie im Planungsmodus**: Ideal, um den Code zunächst zu verstehen, bevor Sie Änderungen vornehmen  
- **Arbeiten Sie im Standardmodus**: Die ausgewogene Wahl für die meisten Entwicklungsarbeiten  
- **Wechseln Sie in den Automatischen Bearbeitungsmodus**: Wenn Sie viele sichere Codeänderungen vornehmen  
- **Verwenden Sie YOLO sparsam**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen  

> [!tip]  
>  
> Sie können während einer Sitzung mithilfe von **Umschalt+Tab** (bzw. **Tab** unter Windows) schnell zwischen den Modi wechseln. Die Statusleiste des Terminals zeigt Ihren aktuellen Modus an, sodass Sie stets wissen, welche Berechtigungen Qwen Code besitzt.  

## 1. Verwenden Sie den Planungsmodus für eine sichere Codeanalyse  

Der Planungsmodus weist Qwen Code an, einen Plan zu erstellen, indem die Codebasis ausschließlich mit **schreibgeschützten** Operationen analysiert wird. Dies ist ideal, um Codebasen zu erkunden, komplexe Änderungen zu planen oder Code sicher zu überprüfen.

### Wann Plan-Modus verwenden?

- **Mehrschrittige Implementierung**: Wenn Ihre Funktion Änderungen an vielen Dateien erfordert  
- **Code-Erkundung**: Wenn Sie die Codebasis gründlich erforschen möchten, bevor Sie etwas ändern  
- **Interaktive Entwicklung**: Wenn Sie gemeinsam mit Qwen Code schrittweise die Richtung Ihrer Arbeit verfeinern möchten

### So verwenden Sie den Plan-Modus

**Aktivieren Sie den Plan-Modus während einer Sitzung**

Sie können während einer Sitzung in den Plan-Modus wechseln, indem Sie **Umschalt+Tab** (oder **Tab** unter Windows) drücken, um die Berechtigungsmodi zu durchlaufen.

Befinden Sie sich im Normalmodus, wechselt **Umschalt+Tab** (oder **Tab** unter Windows) zunächst in den `auto-edits`-Modus, der am unteren Rand des Terminals mit `⏵⏵ Änderungen automatisch akzeptieren` angezeigt wird. Ein weiterer Tastendruck auf **Umschalt+Tab** (oder **Tab** unter Windows) aktiviert den Plan-Modus, der am unteren Rand des Terminals mit `⏸ Plan-Modus` gekennzeichnet ist.

**Starten Sie eine neue Sitzung im Plan-Modus**

Um eine neue Sitzung direkt im Plan-Modus zu starten, geben Sie `/approval-mode` ein und wählen dann `plan` aus:

```bash
/approval-mode
```

**Führen Sie „headless“-Abfragen im Plan-Modus aus**

Sie können eine Abfrage auch direkt im Plan-Modus mit der Option `-p` oder `--prompt` ausführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Beispiel: Planung einer komplexen Refaktorisierung

```bash
/approval-mode plan
```

```
Ich muss unser Authentifizierungssystem so umgestalten, dass es OAuth2 verwendet. Erstelle einen detaillierten Migrationsplan.
```

Qwen Code analysiert die aktuelle Implementierung und erstellt einen umfassenden Plan. Verfeinern Sie diesen mit anschließenden Fragen:

```
Wie sieht es mit der Abwärtskompatibilität aus?
Wie sollen wir die Datenbankmigration durchführen?
```

### Plan-Modus als Standardmodus konfigurieren

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Standardmodus für kontrollierte Interaktion verwenden

Der Standardmodus ist die übliche Arbeitsweise mit Qwen Code. In diesem Modus behalten Sie die volle Kontrolle über alle potenziell riskanten Operationen – Qwen Code fordert vor jeder Dateiänderung oder Ausführung von Shell-Befehlen Ihre ausdrückliche Zustimmung an.

### Wann Sie den Standardmodus verwenden sollten

- **Neu in einem Codebasen**: Wenn Sie ein unbekanntes Projekt erkunden und besonders vorsichtig sein möchten  
- **Kritische Systeme**: Wenn Sie an Produktionscode, Infrastruktur oder sensiblen Daten arbeiten  
- **Lernen und Lehren**: Wenn Sie jeden Schritt nachvollziehen möchten, den Qwen Code ausführt  
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten  
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik betreffen

### So verwenden Sie den Standardmodus

**Aktivieren Sie den Standardmodus während einer Sitzung**

Sie können während einer Sitzung mit **Umschalt+Tab** (oder **Tab** unter Windows) zwischen den Berechtigungsmodi wechseln. Befinden Sie sich in einem anderen Modus, führt das wiederholte Drücken von **Umschalt+Tab** (bzw. **Tab** unter Windows) schließlich wieder zum Standardmodus zurück – dieser ist daran zu erkennen, dass am unteren Rand des Terminals kein Modus-Indikator angezeigt wird.

**Starten Sie eine neue Sitzung im Standardmodus**

Der Standardmodus ist der anfängliche Modus beim Start von Qwen Code. Falls Sie den Modus geändert haben und zum Standardmodus zurückkehren möchten, verwenden Sie:

```
/approval-mode default
```

**Führen Sie „headless“-Abfragen im Standardmodus aus**

Bei der Ausführung von „headless“-Befehlen ist der Standardmodus das Standardverhalten. Sie können ihn explizit wie folgt angeben:

```
qwen --prompt "Analysiere diesen Code auf potenzielle Fehler"
```

### Beispiel: Sichere Implementierung einer Funktion

```
/approval-mode default
```

```
Ich muss Profilbilder für Benutzer zu unserer Anwendung hinzufügen. Die Bilder sollen in einem S3-Bucket gespeichert und die URLs in der Datenbank abgelegt werden.
```

Qwen Code analysiert Ihren Codebestand und schlägt einen Plan vor. Vor der Ausführung führt Qwen Code dann eine Genehmigungsanfrage durch für:

1. Das Erstellen neuer Dateien (Controller, Modelle, Migrationen)
2. Das Ändern bestehender Dateien (Hinzufügen neuer Spalten, Aktualisieren von APIs)
3. Das Ausführen beliebiger Shell-Befehle (Datenbankmigrationen, Installation von Abhängigkeiten)

Sie können jede vorgeschlagene Änderung einzeln prüfen und separat genehmigen oder ablehnen.

### Standardmodus als Vorgabe konfigurieren

```bash
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

## 3. Automatische-Bearbeitungen-Modus

Der Automatische-Bearbeitungen-Modus weist Qwen Code an, Dateiänderungen automatisch zu genehmigen, während für Shell-Befehle weiterhin eine manuelle Genehmigung erforderlich ist. Dieser Modus eignet sich ideal, um Entwicklungsworkflows zu beschleunigen, ohne die Systemsicherheit zu beeinträchtigen.

### Wann Sie den Modus „Automatische Annahme von Änderungen“ verwenden sollten

- **Tägliche Entwicklung**: Ideal für die meisten Programmieraufgaben  
- **Sichere Automatisierung**: Ermöglicht es der KI, Code zu ändern, verhindert jedoch versehentliche Ausführung gefährlicher Befehle  
- **Teamzusammenarbeit**: Verwenden Sie diesen Modus in gemeinsamen Projekten, um unbeabsichtigte Auswirkungen auf andere Teammitglieder zu vermeiden  

### So wechseln Sie in diesen Modus

```

# Wechseln über Befehl
/approval-mode auto-edit

# Oder verwenden Sie die Tastenkombination
Shift+Tab (bzw. Tab unter Windows) # Wechseln von anderen Modi aus
```

### Beispielablauf

1. Sie bitten Qwen Code, eine Funktion umzustrukturieren  
2. Die KI analysiert den Code und schlägt Änderungen vor  
3. **Automatisch** werden alle Dateiänderungen ohne Bestätigung angewendet  
4. Falls Tests ausgeführt werden müssen, fordert die KI **ausdrücklich die Zustimmung** zur Ausführung von `npm test` an  

## 4. YOLO-Modus – Vollständige Automatisierung  

Der YOLO-Modus gewährt Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Tool-Aufrufe – einschließlich Dateibearbeitung und Shell-Befehlen.

### Wann YOLO-Modus verwenden

- **Automatisierte Skripte**: Ausführung vordefinierter automatisierter Aufgaben  
- **CI/CD-Pipelines**: Automatisierte Ausführung in kontrollierten Umgebungen  
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen  
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern  

> [!warning]  
>   
> **Verwenden Sie den YOLO-Modus mit Vorsicht**: Die KI kann jeden Befehl mit Ihren Terminalberechtigungen ausführen. Stellen Sie daher sicher:  
>   
> 1. Sie vertrauen dem aktuellen Codebasis  
> 2. Sie verstehen alle Aktionen, die die KI durchführen wird  
> 3. Wichtige Dateien sind gesichert oder in der Versionskontrolle commited  

### So aktivieren Sie den YOLO-Modus  

```  

# Temporäre Aktivierung (nur für die aktuelle Sitzung)  
/approval-mode yolo  

# Als Projektstandard festlegen  
/approval-mode yolo --project  

# Als globaler Benutzerstandard festlegen  
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

```

# Vollautomatisierte Refactoring-Aufgabe  
qwen --prompt „Führe die Testsuite aus, behebe alle fehlschlagenden Tests und übermittle die Änderungen“

# Ohne menschliches Eingreifen führt die KI folgende Schritte aus:

# 1. Ausführen der Testbefehle (automatisch genehmigt)

# 2. Beheben fehlschlagender Testfälle (automatische Dateibearbeitung)

# 3. Ausführen des Git-Commits (automatisch genehmigt)  
```

## Moduswechsel und Konfiguration

### Tastenkürzel für den Moduswechsel

Während einer Qwen Code-Sitzung können Sie mit **Umschalt+Tab** (bzw. **Tab** unter Windows) schnell zwischen den drei Modi wechseln:

```
Standardmodus → Automatische-Bearbeitung-Modus → YOLO-Modus → Planungsmodus → Standardmodus
```

### Dauerhafte Konfiguration

```
// Projektspezifisch: ./.qwen/settings.json  
// Benutzerspezifisch: ~/.qwen/settings.json  
{  
  "permissions": {  
    "defaultMode": "auto-edit",  // oder "plan" oder "yolo"  
    "confirmShellCommands": true,  
    "confirmFileEdits": true  
  }  
}
```

### Empfehlungen zur Modusnutzung

1. **Neu im Codebase**: Beginnen Sie mit dem **Plan-Modus**, um sicher zu erkunden  
2. **Tägliche Entwicklungsarbeiten**: Verwenden Sie **Auto-Accept-Edits** (Standardmodus) – effizient und sicher  
3. **Automatisierte Skripte**: Verwenden Sie den **YOLO-Modus** in kontrollierten Umgebungen für vollständige Automatisierung  
4. **Komplexe Refactorings**: Nutzen Sie zunächst den **Plan-Modus**, um detailliert zu planen, und wechseln Sie dann in den geeigneten Modus zur Ausführung