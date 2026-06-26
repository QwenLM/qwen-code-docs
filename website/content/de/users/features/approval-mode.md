# Genehmigungsmodus

Qwen Code bietet fünf verschiedene Berechtigungsmodi, mit denen Sie flexibel steuern können, wie die KI basierend auf Aufgabenkomplexität und Risikostufe mit Ihrem Code und System interagiert.

## Vergleich der Berechtigungsmodi

| Modus                  | Dateibearbeitung              | Shell-Befehle                 | Am besten geeignet für                                                                                  | Risikostufe |
| ---------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **Plan**               | ❌ Nur schreibgeschützte Analyse | ❌ Werden nicht ausgeführt    | • Code-Erkundung <br>• Planung komplexer Änderungen <br>• Sicheres Code-Review                            | Niedrigste  |
| **Ask Permissions**    | ✅ Manuelle Genehmigung erforderlich | ✅ Manuelle Genehmigung erforderlich | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Team-Zusammenarbeit <br>• Lernen und Lehren    | Niedrig     |
| **Auto-Edit**          | ✅ Automatisch genehmigt      | ❌ Manuelle Genehmigung erforderlich | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Code-Verbesserungen <br>• Sichere Automatisierung  | Mittel      |
| **Auto**               | ✅ Klassifikator-bewertet     | ✅ Klassifikator-bewertet     | • Lange autonome Sitzungen <br>• Wenn Auto-Edit zu vorsichtig, aber YOLO zu riskant ist                 | Mittel      |
| **YOLO**               | ✅ Automatisch genehmigt      | ✅ Automatisch genehmigt      | • Vertraute persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Batch-Verarbeitungsaufgaben    | Höchste     |

> [!NOTE]
>
> Der Modus, der zuvor **Default** hieß, wurde in **Ask Permissions** umbenannt, um sein Verhalten besser zu beschreiben. Der zugrunde liegende Konfigurationswert (`tools.approvalMode: "default"`) und der Befehl `/approval-mode default` bleiben aus Gründen der Abwärtskompatibilität unverändert.

### Kurzreferenz

- **Beginnen Sie im Plan Mode**: Ideal, um zu verstehen, bevor Sie Änderungen vornehmen
- **Arbeiten Sie im Ask Permissions Mode**: Die ausgewogene Wahl für die meisten Entwicklungsarbeiten
- **Wechseln Sie zu Auto-Edit**: Wenn Sie viele sichere Code-Änderungen vornehmen
- **Probieren Sie den Auto Mode**: Wenn Sie weniger Unterbrechungen wünschen, aber dennoch Sicherheit bei Shell-Befehlen und Netzwerkaufrufen – ein LLM-Klassifikator bewertet jeden Aufruf
- **Verwenden Sie YOLO sparsam**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Sie können während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) schnell durch die Modi wechseln. Die Statusleiste des Terminals zeigt Ihren aktuellen Modus an, sodass Sie stets wissen, welche Berechtigungen Qwen Code hat.

> Die Zyklusreihenfolge ist: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Verwenden Sie den Plan Mode für sichere Code-Analyse

Der Plan Mode weist Qwen Code an, einen Plan zu erstellen, indem er die Codebasis mit **schreibgeschützten** Operationen analysiert. Dies ist ideal, um Codebasen zu erkunden, komplexe Änderungen zu planen oder Code sicher zu überprüfen.

### Wann Sie den Plan Mode verwenden sollten

- **Mehrschrittige Implementierung**: Wenn Ihre Funktion Änderungen an vielen Dateien erfordert
- **Code-Erkundung**: Wenn Sie die Codebasis gründlich untersuchen möchten, bevor Sie etwas ändern
- **Interaktive Entwicklung**: Wenn Sie die Richtung mit Qwen Code iterieren möchten

### So verwenden Sie den Plan Mode

**Plan Mode während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) in den Plan Mode wechseln, indem Sie durch die Berechtigungsmodi blättern.

Wenn Sie sich im Normalmodus befinden, wechselt **Shift+Tab** (oder **Tab** unter Windows) zuerst in den `auto-edits` Modus, erkennbar an `⏵⏵ accept edits on` am unteren Rand des Terminals. Ein weiteres **Shift+Tab** (oder **Tab** unter Windows) wechselt in den Plan Mode, erkennbar an `⏸ plan mode`.

**Den `/plan` Befehl verwenden**

Der `/plan` Befehl bietet eine schnelle Abkürzung zum Betreten und Verlassen des Plan Mode:

Reguläre Planungsanfragen wechseln nicht automatisch den Modus. Wenn Sie den schreibgeschützten Plan Mode Workflow wünschen, verwenden Sie `/plan`, das Tastaturkürzel oder setzen Sie den Genehmigungsmodus explizit auf `plan`.

```bash
/plan                          # Plan Mode betreten
/plan refactor the auth module # Plan Mode betreten und mit der Planung beginnen
/plan exit                     # Plan Mode verlassen, vorherigen Modus wiederherstellen
```

Wenn Sie den Plan Mode mit `/plan exit` verlassen, wird Ihr vorheriger Genehmigungsmodus automatisch wiederhergestellt (z. B. wenn Sie vor dem Betreten des Plan Mode im Auto-Edit waren, kehren Sie zu Auto-Edit zurück).

**Eine neue Sitzung im Plan Mode starten**

Um eine neue Sitzung im Plan Mode zu starten, verwenden Sie `/approval-mode` und wählen dann `plan`

```bash
/approval-mode
```

**„Headless"-Abfragen im Plan Mode ausführen**

Sie können eine Abfrage auch direkt mit `-p` oder `prompt` im Plan Mode ausführen:

```bash
qwen --prompt "What is machine learning?"
```

### Beispiel: Planung eines komplexen Refactorings

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code wechselt in den Plan Mode und analysiert die aktuelle Implementierung, um einen umfassenden Plan zu erstellen. Verfeinern Sie ihn mit Folgefragen:

```
What about backward compatibility?
How should we handle database migration?
```

### Plan Mode als Standard konfigurieren

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Verwenden Sie den Ask Permissions Mode für kontrollierte Interaktion

Der Ask Permissions Mode ist die Standardmethode, um mit Qwen Code zu arbeiten. In diesem Modus behalten Sie die volle Kontrolle über alle potenziell riskanten Operationen – Qwen Code wird vor jeder Dateiänderung oder Shell-Befehlsausführung um Ihre Genehmigung bitten.

### Wann Sie den Ask Permissions Mode verwenden sollten

- **Neu in einer Codebasis**: Wenn Sie ein unbekanntes Projekt erkunden und besonders vorsichtig sein möchten
- **Kritische Systeme**: Wenn Sie an Produktionscode, Infrastruktur oder sensiblen Daten arbeiten
- **Lernen und Lehren**: Wenn Sie jeden Schritt verstehen möchten, den Qwen Code unternimmt
- **Team-Zusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik umfassen

### So verwenden Sie den Ask Permissions Mode

**Ask Permissions Mode während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) in den Ask Permissions Mode wechseln, indem Sie durch die Berechtigungsmodi blättern. Wenn Sie sich in einem anderen Modus befinden, führt das Drücken von **Shift+Tab** (oder **Tab** unter Windows) schließlich zurück zum Ask Permissions Mode, erkennbar am Fehlen eines Modus-Indikators am unteren Rand des Terminals.

**Eine neue Sitzung im Ask Permissions Mode starten**

Der Ask Permissions Mode ist der anfängliche Modus beim Start von Qwen Code. Wenn Sie den Modus geändert haben und zurück zum Ask Permissions Mode möchten, verwenden Sie:

```
/approval-mode default
```

**„Headless"-Abfragen im Ask Permissions Mode ausführen**

Bei der Ausführung von headless-Befehlen ist Ask Permissions Mode das Standardverhalten. Sie können es explizit angeben mit:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Beispiel: Sicheres Implementieren einer Funktion

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code analysiert Ihre Codebasis und schlägt einen Plan vor. Anschließend wird vor jedem Schritt um Genehmigung gebeten:

1. Neue Dateien erstellen (Controller, Modelle, Migrationen)
2. Vorhandene Dateien ändern (neue Spalten hinzufügen, APIs aktualisieren)
3. Shell-Befehle ausführen (Datenbankmigrationen, Abhängigkeitsinstallation)

Sie können jede vorgeschlagene Änderung einzeln prüfen und genehmigen oder ablehnen.

### Ask Permissions Mode als Standard konfigurieren

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto-Edits Mode

Der Auto-Edit Mode weist Qwen Code an, Dateibearbeitungen automatisch zu genehmigen, während für Shell-Befehle eine manuelle Genehmigung erforderlich ist. Dies ist ideal, um Entwicklungsabläufe zu beschleunigen und gleichzeitig die Systemsicherheit zu gewährleisten.

Zu den automatisch genehmigten Bearbeitungswerkzeugen gehören `edit`, `write_file` und `notebook_edit`.

### Wann Sie den Auto-Accept-Edits Mode verwenden sollten

- **Tägliche Entwicklung**: Ideal für die meisten Codierungsaufgaben
- **Sichere Automatisierung**: Erlaubt der KI, Code zu ändern, während die versehentliche Ausführung gefährlicher Befehle verhindert wird
- **Team-Zusammenarbeit**: Verwenden Sie ihn in gemeinsamen Projekten, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### So wechseln Sie in diesen Modus

```
# Wechseln per Befehl
/approval-mode auto-edit

# Oder Tastaturkürzel verwenden
Shift+Tab (oder Tab unter Windows) # Wechseln aus anderen Modi
```

### Beispiel-Workflow

1. Sie bitten Qwen Code, eine Funktion zu refaktorisieren
2. Die KI analysiert den Code und schlägt Änderungen vor
3. **Automatisch** werden alle Dateiänderungen ohne Bestätigung übernommen
4. Wenn Tests ausgeführt werden müssen, wird **um Genehmigung gebeten**, `npm test` auszuführen

## 4. Auto Mode – Klassifikatorgesteuerte Genehmigung

Der Auto Mode liegt zwischen Auto-Edit und YOLO. Ein LLM-Klassifikator bewertet jeden
Shell-Befehl, Netzwerkaufruf und jede Bearbeitung außerhalb des Arbeitsbereichs und genehmigt
diejenigen automatisch, die er als sicher einstuft, während riskante blockiert werden.
Die meisten schreibgeschützten Operationen und Bearbeitungen innerhalb des Arbeitsbereichs überspringen den Klassifikator aus Geschwindigkeitsgründen.

Die vollständige Referenz finden Sie unter [auto-mode.md](./auto-mode.md) (Hinweise
zur Konfiguration, Fehlerbehebung, FAQ).

### Wann Sie den Auto Mode verwenden sollten

- **Lange autonome Sitzungen**: Wenn der Ask Permissions Mode zu oft unterbricht, aber
  YOLO zu riskant ist.
- **Vertraute Projekte**: Interne Codebasen, in denen der Agent weiterarbeiten soll,
  aber Sie dennoch eine Sicherheitsvorkehrung gegen destruktive Shell-Befehle und
  ausgehende Netzwerkaufrufe wünschen.
- **Headless- / geplante Ausführungen**: Wenn Auto-Edit nicht ausreicht (der Agent
  muss auch Shell-Befehle ausführen), aber Sie Sicherheit vor `rm -rf /`,
  `curl ... | sh`, Credential-Exfiltration usw. wünschen.

### So verwenden Sie den Auto Mode

**Auto Mode während einer Sitzung aktivieren**

Drücken Sie **Shift+Tab** (oder **Tab** unter Windows), um in den Auto Mode zu wechseln. Die
Statusleiste zeigt den aktiven Modus an.

**Den Befehl `/approval-mode` verwenden**

```
/approval-mode auto
```

Beim ersten Betreten des Auto Mode wird eine Informationsmeldung angezeigt, die erklärt, wie er
funktioniert. Der Hinweis erscheint danach nicht wieder.

**Eine neue Sitzung im Auto Mode starten**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Was der Auto Mode automatisch genehmigt vs. blockiert

Der Klassifikator neigt dazu, bei Unsicherheit zu blockieren. Standardmäßig:

- **Automatisch genehmigt**: Schreibgeschützte Befehle (ls, cat, git status, grep, find),
  Paketinstallation im aktuellen Arbeitsverzeichnis, Build-/Testbefehle, Dateibearbeitungen innerhalb des
  Arbeitsbereichs, rein lokale Operationen.
- **Blockiert**: Irreversible Zerstörung (rm -rf /, fdisk, mkfs),
  Codeausführung von externen Quellen (curl | sh, eval von Remote-Inhalten),
  Credential-Exfiltration, unbefugte Persistenz (.bashrc-Änderungen,
  crontab), Sicherheitsschwächung, Force-Push auf main/master.

Sie können die Bewertung des Klassifikators über natürlichsprachliche Hinweise in
settings.json anpassen. Siehe [auto-mode.md](./auto-mode.md#configuring-hints).

### Sicherheitsvorkehrungen

- **Harte Regeln bleiben in Kraft**: `permissions.deny`-Regeln blockieren Aktionen,
  bevor der Klassifikator überhaupt läuft.
- **Zu weit gefasste Erlaubnisregeln werden im Auto Mode deaktiviert**: Z. B.
  `permissions.allow: ["Bash"]` (jeden Shell-Befehl erlauben) umgeht den
  Klassifikator; beim Betreten des Auto Mode werden solche Regeln vorübergehend deaktiviert, damit der
  Klassifikator seine Arbeit tun kann. Die Regeln werden beim Verlassen des Auto
  Mode wiederhergestellt. Einstellungen auf der Festplatte werden nie geändert.
- **Fail-Closed**: Wenn die Klassifikator-API nicht erreichbar ist, wird die Aktion
  blockiert, anstatt erlaubt. Nach zwei aufeinanderfolgenden nicht verfügbaren Aufrufen
  wird der nächste Werkzeugaufruf auf manuelle Genehmigung zurückgesetzt.
- **Schleifenschutz**: Nach drei aufeinanderfolgenden Richtlinienblockaden wird der nächste Aufruf
  ebenfalls auf manuelle Genehmigung zurückgesetzt, damit der Agent nicht in einer
  Sackgasse stecken bleibt.

### Beispiel

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code nimmt die Dateibearbeitungen vor (Bearbeitungen innerhalb des Arbeitsbereichs überspringen den Klassifikator),
führt `npm test` aus (vom Klassifikator als sicher eingestuft) und zeigt eine Blockade an, falls es
jemals etwas Riskantes versucht, wie `rm -rf /Users/me/.aws`. Sie können den Grund
inline einsehen und entscheiden, ob Sie für diesen Schritt in den Ask Permissions Mode wechseln.

### Auto Mode als Standard konfigurieren

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
    },
  },
}
```

## 5. YOLO Mode – Vollautomatisierung

Der YOLO Mode gewährt Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Werkzeugaufrufe, einschließlich Dateibearbeitung und Shell-Befehle.

### Wann Sie den YOLO Mode verwenden sollten

- **Automatisierte Skripte**: Ausführung vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatisierte Ausführung in kontrollierten Umgebungen
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **Verwenden Sie den YOLO Mode mit Vorsicht**: Die KI kann jeden Befehl mit Ihren Terminalberechtigungen ausführen. Stellen Sie sicher:
>
> 1. Sie vertrauen der aktuellen Codebasis
> 2. Sie verstehen alle Aktionen, die die KI ausführen wird
> 3. Wichtige Dateien sind gesichert oder in der Versionskontrolle committet

### So aktivieren Sie den YOLO Mode

```
# Vorübergehend aktivieren (nur für aktuelle Sitzung)
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
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### Beispiel für einen automatisierten Workflow

```bash
# Vollautomatisierte Refactoring-Aufgabe
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Ohne menschliches Eingreifen wird die KI:
# 1. Testbefehle ausführen (automatisch genehmigt)
# 2. Fehlgeschlagene Testfälle korrigieren (Dateien automatisch bearbeiten)
# 3. Git-Commit ausführen (automatisch genehmigt)
```

## Moduswechsel & Konfiguration

### Tastaturkürzel zum Wechseln

Während einer Qwen Code Sitzung verwenden Sie **Shift+Tab** (oder **Tab** unter Windows), um schnell durch die fünf Modi zu blättern:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### Dauerhafte Konfiguration

```
// Projektebene: ./.qwen/settings.json
// Benutzerebene: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // oder "plan", "default", "auto", "yolo"
  }
}
```

### Modus-Verwendungsempfehlungen

1. **Neu in der Codebasis**: Beginnen Sie mit **Plan Mode** für eine sichere Erkundung
2. **Tägliche Entwicklungsaufgaben**: Verwenden Sie **Auto-Accept-Edits** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Verwenden Sie **YOLO Mode** in kontrollierten Umgebungen für vollständige Automatisierung
4. **Komplexes Refactoring**: Verwenden Sie zuerst **Plan Mode** für eine detaillierte Planung, wechseln Sie dann für die Ausführung in den geeigneten Modus