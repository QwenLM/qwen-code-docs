# Genehmigungsmodus

Qwen Code bietet fünf verschiedene Berechtigungsmodi, mit denen Sie flexibel steuern können, wie KI mit Ihrem Code und System interagiert – abgestimmt auf Aufgabenkomplexität und Risikograd.

## Vergleich der Berechtigungsmodi

| Modus                 | Dateibearbeitung             | Shell-Befehle                | Am besten geeignet                                                                                     | Risikograd |
| --------------------- | ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**              | ❌ Nur Leseanalyse           | ❌ Nicht ausgeführt          | • Code-Erkundung <br>• Planung komplexer Änderungen <br>• Sicheres Code-Review                        | Niedrigst  |
| **Berechtigungen**    | ✅ Manuelle Genehmigung nötig | ✅ Manuelle Genehmigung nötig | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Teamzusammenarbeit <br>• Lernen und Lehren   | Niedrig    |
| **Auto-Bearbeitung**  | ✅ Automatisch genehmigt     | ❌ Manuelle Genehmigung nötig | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Codeverbesserungen <br>• Sichere Automatisierung  | Mittel     |
| **Auto**              | ✅ Vom Klassifizierer bewertet | ✅ Vom Klassifizierer bewertet | • Lange autonome Sitzungen <br>• Wenn Auto-Bearbeitung zu vorsichtig, aber YOLO zu riskant ist          | Mittel     |
| **YOLO**              | ✅ Automatisch genehmigt     | ✅ Automatisch genehmigt     | • Vertraute persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Batch-Verarbeitungsaufgaben   | Höchst     |

> [!NOTE]
>
> Der zuvor **Standard** genannte Modus wurde zur besseren Beschreibung seines Verhaltens in **Berechtigungen** umbenannt. Der zugrunde liegende Konfigurationswert (`tools.approvalMode: "default"`) und der Befehl `/approval-mode default` bleiben aus Gründen der Rückwärtskompatibilität unverändert.

### Kurzanleitung

- **Im Plan-Modus starten**: Ideal zum Verstehen vor Änderungen
- **Im Berechtigungen-Modus arbeiten**: Die ausgewogene Wahl für die meisten Entwicklungsarbeiten
- **Zu Auto-Bearbeitung wechseln**: Wenn Sie viele sichere Codeänderungen vornehmen
- **Auto-Modus ausprobieren**: Wenn Sie weniger Unterbrechungen wünschen, aber dennoch Sicherheit bei Shell-Befehlen und Netzwerkaufrufen möchten – ein LLM-Klassifizierer bewertet jeden Aufruf
- **YOLO sparsam einsetzen**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Sie können während einer Sitzung schnell mit **Umschalt+Tab** (oder **Tab** unter Windows) durch die Modi wechseln. Die Statusleiste des Terminals zeigt Ihren aktuellen Modus an, sodass Sie immer wissen, welche Berechtigungen Qwen Code hat.

> Die Reihenfolge des Durchlaufs ist: **Plan → Berechtigungen → Auto-Bearbeitung → Auto → YOLO → Plan → ...**

## 1. Plan-Modus für sichere Code-Analyse verwenden

Der Plan-Modus weist Qwen Code an, einen Plan zu erstellen, indem die Codebasis mit **schreibgeschützten** Operationen analysiert wird. Perfekt zum Erkunden von Codebasen, Planen komplexer Änderungen oder sicheren Code-Reviews.

### Wann sollte der Plan-Modus verwendet werden?

- **Mehrschritt-Implementierung**: Wenn Ihre Funktion Änderungen an vielen Dateien erfordert
- **Code-Erkundung**: Wenn Sie die Codebasis vor Änderungen gründlich untersuchen möchten
- **Interaktive Entwicklung**: Wenn Sie die Richtung mit Qwen Code iterativ entwickeln möchten

### So verwenden Sie den Plan-Modus

**Plan-Modus während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Umschalt+Tab** (oder **Tab** unter Windows) in den Plan-Modus wechseln, indem Sie durch die Berechtigungsmodi blättern.

Wenn Sie sich im Normalmodus befinden, wechselt **Umschalt+Tab** (oder **Tab** unter Windows) zuerst in den Auto-Bearbeitung-Modus, angezeigt durch `⏵⏵ edits annehmen` am unteren Bildschirmrand des Terminals. Ein weiteres **Umschalt+Tab** (oder **Tab** unter Windows) wechselt in den Plan-Modus, angezeigt durch `⏸ Plan-Modus`.

**Den Befehl `/plan` verwenden**

Der Befehl `/plan` bietet eine schnelle Abkürzung zum Betreten und Verlassen des Plan-Modus:

Normale Planungsanfragen wechseln den Modus nicht von selbst. Wenn Sie den schreibgeschützten Plan-Modus-Workflow wünschen, verwenden Sie `/plan`, die Tastenkombination oder setzen Sie den Genehmigungsmodus explizit auf `plan`.

```bash
/plan                          # Plan-Modus betreten
/plan refactor the auth module # Plan-Modus betreten und Planung starten
/plan exit                     # Plan-Modus verlassen, vorherigen Modus wiederherstellen
```

Wenn Sie den Plan-Modus mit `/plan exit` verlassen, wird Ihr vorheriger Genehmigungsmodus automatisch wiederhergestellt (z. B. wenn Sie vor dem Betreten des Plan-Modus im Auto-Bearbeitung-Modus waren, kehren Sie zu Auto-Bearbeitung zurück).

**Eine neue Sitzung im Plan-Modus starten**

Um eine neue Sitzung im Plan-Modus zu starten, verwenden Sie `/approval-mode` und wählen Sie dann `plan` aus.

```bash
/approval-mode
```

**"Headless"-Abfragen im Plan-Modus ausführen**

Sie können eine Abfrage im Plan-Modus auch direkt mit `-p` oder `prompt` ausführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Beispiel: Planung einer komplexen Umstrukturierung

```bash
/plan Ich muss unser Authentifizierungssystem auf OAuth2 umstellen. Erstelle einen detaillierten Migrationsplan.
```

Qwen Code wechselt in den Plan-Modus und analysiert die aktuelle Implementierung, um einen umfassenden Plan zu erstellen. Verfeinern Sie ihn mit Nachfragen:

```
Was ist mit Rückwärtskompatibilität?
Wie sollen wir die Datenbankmigration handhaben?
```
### Plan-Modus als Standard konfigurieren

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Ask Permissions Mode für kontrollierte Interaktion verwenden

Ask Permissions Mode ist die Standardmethode, um mit Qwen Code zu arbeiten. In diesem Modus behalten Sie die volle Kontrolle über alle potenziell riskanten Vorgänge – Qwen Code wird Sie um Ihre Zustimmung bitten, bevor Dateiänderungen vorgenommen oder Shell-Befehle ausgeführt werden.

### Wann Ask Permissions Mode verwendet werden sollte

- **Neu in einer Codebasis**: Wenn Sie ein unbekanntes Projekt erkunden und besonders vorsichtig sein möchten
- **Kritische Systeme**: Bei der Arbeit an Produktionscode, Infrastruktur oder sensiblen Daten
- **Lernen und Lehren**: Wenn Sie jeden Schritt verstehen möchten, den Qwen Code unternimmt
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten
- **Komplexe Vorgänge**: Wenn die Änderungen mehrere Dateien oder komplexe Logik umfassen

### So verwenden Sie Ask Permissions Mode

**Ask Permissions Mode während einer Sitzung aktivieren**

Sie können während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) durch die Berechtigungsmodi wechseln, um in den Ask Permissions Mode zu gelangen. Wenn Sie sich in einem anderen Modus befinden, gelangen Sie durch wiederholtes Drücken von **Shift+Tab** (oder **Tab** unter Windows) schließlich zurück in den Ask Permissions Mode, der durch das Fehlen eines Modusindikators am unteren Rand des Terminals angezeigt wird.

**Eine neue Sitzung im Ask Permissions Mode starten**

Ask Permissions Mode ist der anfängliche Modus beim Start von Qwen Code. Wenn Sie den Modus geändert haben und zu Ask Permissions Mode zurückkehren möchten, verwenden Sie:

```
/approval-mode default
```

**„Headless“-Abfragen im Ask Permissions Mode ausführen**

Bei der Ausführung von Headless-Befehlen ist Ask Permissions Mode das Standardverhalten. Sie können es explizit angeben mit:

```
qwen --prompt "Analysiere diesen Code auf potenzielle Fehler"
```

### Beispiel: Sicheres Implementieren einer Funktion

```
/approval-mode default
```

```
Ich muss Benutzerprofilbilder zu unserer Anwendung hinzufügen. Die Bilder sollten in einem S3-Bucket gespeichert und die URLs in der Datenbank abgelegt werden.
```

Qwen Code analysiert Ihre Codebasis und schlägt einen Plan vor. Anschließend wird es Sie um Zustimmung bitten, bevor:

1. Neue Dateien erstellt werden (Controller, Modelle, Migrationen)
2. Vorhandene Dateien geändert werden (Hinzufügen neuer Spalten, Aktualisieren von APIs)
3. Shell-Befehle ausgeführt werden (Datenbankmigrationen, Abhängigkeitsinstallation)

Sie können jede vorgeschlagene Änderung überprüfen und einzeln genehmigen oder ablehnen.

### Ask Permissions Mode als Standard konfigurieren

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto Edits Mode

Auto-Edit Mode weist Qwen Code an, Dateibearbeitungen automatisch zu genehmigen, während für Shell-Befehle eine manuelle Genehmigung erforderlich ist – ideal, um Entwicklungsabläufe zu beschleunigen und gleichzeitig die Systemsicherheit zu gewährleisten.

Automatisch genehmigte Bearbeitungswerkzeuge sind `edit`, `write_file` und `notebook_edit`.

### Wann Auto-Accept Edits Mode verwendet werden sollte

- **Tägliche Entwicklung**: Ideal für die meisten Programmieraufgaben
- **Sichere Automatisierung**: Erlaubt der KI, Code zu ändern, während die versehentliche Ausführung gefährlicher Befehle verhindert wird
- **Teamzusammenarbeit**: In gemeinsamen Projekten verwenden, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### So wechseln Sie in diesen Modus

```
# Über Befehl wechseln
/approval-mode auto-edit

# Oder Tastenkürzel verwenden
Shift+Tab (oder Tab unter Windows) # Von anderen Modi wechseln
```

### Beispiel Arbeitsablauf

1. Sie bitten Qwen Code, eine Funktion umzugestalten
2. Die KI analysiert den Code und schlägt Änderungen vor
3. **Automatisch** werden alle Dateiänderungen ohne Bestätigung angewendet
4. Wenn Tests ausgeführt werden müssen, wird um **Zustimmung** zur Ausführung von `npm test` gebeten

## 4. Auto Mode – Klassifikator-gesteuerte Genehmigung

Auto Mode liegt zwischen Auto-Edit und YOLO. Ein LLM-Klassifikator bewertet jeden
Shell-Befehl, Netzwerkaufruf und jede außerhalb des Workspace vorgenommene Bearbeitung und genehmigt
automatisch diejenigen, die er als sicher einstuft, während riskante blockiert werden. Die meisten
schreibgeschützten Vorgänge und Bearbeitungen innerhalb des Workspace überspringen den Klassifikator aus
Geschwindigkeitsgründen.

Siehe [auto-mode.md](./auto-mode.md) für die vollständige Referenz (Hints-Konfiguration,
Fehlerbehebung, FAQ).

### Wann Auto Mode verwendet werden sollte

- **Lange autonome Sitzungen**: Wenn Ask Permissions Mode zu oft unterbricht, aber
  YOLO zu riskant ist.
- **Vertrauenswürdige Projekte**: Interne Codebasen, bei denen der Agent weiterarbeiten
  soll, aber dennoch eine Absicherung gegen destruktive Shell-Befehle und
  ausgehende Netzwerkaufrufe gewünscht wird.
- **Headless / geplante Ausführungen**: Wenn Auto-Edit nicht ausreicht (der Agent
  muss auch Shell-Befehle ausführen), aber Sicherheit bei `rm -rf /`,
  `curl ... | sh`, Credential-Exfiltration usw. gewünscht wird.

### So verwenden Sie Auto Mode

**Auto Mode während einer Sitzung aktivieren**

Drücken Sie **Shift+Tab** (oder **Tab** unter Windows), um in den Auto Mode zu wechseln. Die
Statusleiste zeigt den aktiven Modus an.

**Den Befehl `/approval-mode` verwenden**

```
/approval-mode auto
```

Beim ersten Betreten von Auto Mode erklärt eine Informationsmeldung, wie er
funktioniert. Der Hinweis erscheint nicht erneut.

**Eine neue Sitzung im Auto Mode starten**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Was Auto Mode automatisch genehmigt vs. blockiert

Der Klassifikator tendiert dazu, bei Unsicherheit zu blockieren. Standardeinstellungen:
- **Automatisch genehmigt**: Nur-Lese-Befehle (ls, cat, git status, grep, find),
  Paketinstallation im aktuellen Arbeitsverzeichnis, Build-/Testbefehle, Dateibearbeitungen innerhalb des
  Arbeitsbereichs, lokale Operationen.
- **Blockiert**: irreversible Zerstörung (rm -rf /, fdisk, mkfs),
  Code-Ausführung von extern (curl | sh, eval von Remote-Inhalten),
  Abgreifen von Anmeldedaten, unbefugte Persistenz (.bashrc-Änderungen,
  crontab), Sicherheitsschwächung, Force-Push auf main/master.

Sie können die Bewertung des Klassifikators über natürlichsprachliche Hinweise in
settings.json anpassen. Siehe [auto-mode.md](./auto-mode.md#configuring-hints).

### Sicherheitsleitplanken

- **Harte Regeln bleiben in Kraft**: `permissions.deny`-Regeln blockieren Aktionen,
  bevor der Klassifikator überhaupt läuft.
- **Zu weit gefasste Erlaubnisregeln werden im Auto-Modus entfernt**: z.B.
  `permissions.allow: ["Bash"]` (jeden Shell-Befehl erlauben) würde den Klassifikator
  aushebeln; beim Betreten des Auto-Modus werden solche Regeln vorübergehend deaktiviert, damit der
  Klassifikator seine Aufgabe erfüllen kann. Die Regeln werden beim Verlassen des Auto-
  Modus wiederhergestellt. Die Einstellungen auf der Festplatte werden nie geändert.
- **Fail-closed**: Wenn die Klassifikator-API nicht erreichbar ist, wird die Aktion
  blockiert anstatt erlaubt. Nach zwei aufeinanderfolgenden nicht erreichbaren Aufrufen,
  fällt der nächste Tool-Aufruf auf manuelle Genehmigung zurück.
- **Schleifenwächter**: Nach drei aufeinanderfolgenden Richtlinienblocks fällt der nächste
  Aufruf ebenfalls auf manuelle Genehmigung zurück, damit der Agent nicht in einer Endlosschleife
  auf einem toten Pfad stecken bleibt.

### Beispiel

```
/approval-mode auto
Refaktorieren Sie das Auth-Modul, um OAuth2 zu verwenden. Führen Sie anschließend die vollständige Testsuite aus.
```

Qwen Code führt die Dateibearbeitungen durch (Bearbeitungen im Arbeitsbereich überspringen den Klassifikator),
führt `npm test` aus (vom Klassifikator als sicher eingestuft) und zeigt einen Block an, falls es jemals
etwas Riskantes versucht wie `rm -rf /Users/me/.aws`. Sie können den Grund
inline einsehen und entscheiden, ob Sie für diesen Schritt in den "Ask Permissions"-Modus wechseln möchten.

### Auto-Modus als Standard konfigurieren

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Ausführen von pytest, mypy und ruff in diesem Python-Repo"],
        "deny": ["Jeder Netzwerkaufruf an intranet.example.com"],
      },
      "environment": ["Open-Source-Monorepo; Commits sind signiert"],
    },
  },
}
```

## 5. YOLO-Modus – Vollständige Automatisierung

Der YOLO-Modus gewährt Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Tool-Aufrufe, einschließlich Dateibearbeitung und Shell-Befehle.

### Wann der YOLO-Modus verwendet werden sollte

- **Automatisierte Skripte**: Ausführung vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatisierte Ausführung in kontrollierten Umgebungen
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **YOLO-Modus mit Vorsicht verwenden**: KI kann jeden Befehl mit Ihren Terminal-Berechtigungen ausführen. Stellen Sie sicher:
>
> 1. Sie vertrauen der aktuellen Codebasis
> 2. Sie verstehen alle Aktionen, die die KI ausführen wird
> 3. Wichtige Dateien sind gesichert oder in der Versionsverwaltung committet

### So aktivieren Sie den YOLO-Modus

```
# Vorübergehend aktivieren (nur für die aktuelle Sitzung)
/approval-mode yolo

# Als Projektstandard setzen
/approval-mode yolo --project

# Als globalen Benutzerstandard setzen
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
# Vollständig automatisierte Refaktorierungsaufgabe
qwen --prompt "Führen Sie die Testsuite aus, beheben Sie alle fehlschlagenden Tests und committen Sie dann die Änderungen"

# Ohne menschliches Eingreifen wird die KI:
# 1. Testbefehle ausführen (automatisch genehmigt)
# 2. Fehlgeschlagene Testfälle beheben (Dateien automatisch bearbeiten)
# 3. Git-Commit ausführen (automatisch genehmigt)
```

## Moduswechsel & Konfiguration

### Tastaturkürzel zum Wechseln

Während einer Qwen Code-Sitzung können Sie mit **Umschalt+Tab** (oder **Tab** unter Windows) schnell durch die fünf Modi wechseln:

```
Plan-Modus → Ask Permissions-Modus → Auto-Edit-Modus → Auto-Modus → YOLO-Modus → Plan-Modus
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

### Empfehlungen zur Modusnutzung

1. **Neu in der Codebasis**: Beginnen Sie mit dem **Plan-Modus** für sichere Erkundung
2. **Tägliche Entwicklungsaufgaben**: Verwenden Sie **Auto-Accept Edits** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Verwenden Sie den **YOLO-Modus** in kontrollierten Umgebungen für vollständige Automatisierung
4. **Komplexe Refaktorierung**: Verwenden Sie zuerst den **Plan-Modus** für eine detaillierte Planung, wechseln Sie dann für die Ausführung in den passenden Modus
