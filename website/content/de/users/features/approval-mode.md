# Approval-Modus

Qwen Code bietet fünf verschiedene Berechtigungsmodi, mit denen du flexibel steuern kannst, wie die KI basierend auf der Aufgabenkomplexität und dem Risikolevel mit deinem Code und System interagiert.

## Vergleich der Berechtigungsmodi

| Modus                 | Datei-Bearbeitung                | Shell-Befehle              | Am besten geeignet für                                                                                               | Risikolevel |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**            | ❌ Nur Read-only-Analyse  | ❌ Werden nicht ausgeführt             | • Code-Exploration <br>• Planung komplexer Änderungen <br>• Sicheres Code-Review                               | Niedrigstes     |
| **Ask Permissions** | ✅ Manuelle Genehmigung erforderlich | ✅ Manuelle Genehmigung erforderlich | • Neue/unbekannte Codebasen <br>• Kritische Systeme <br>• Teamzusammenarbeit <br>• Lernen und Lehren | Niedrig        |
| **Auto-Edit**       | ✅ Automatisch genehmigt            | ❌ Manuelle Genehmigung erforderlich | • Tägliche Entwicklungsaufgaben <br>• Refactoring und Code-Verbesserungen <br>• Sichere Automatisierung                | Mittel     |
| **Auto**            | ✅ Vom Classifier bewertet     | ✅ Vom Classifier bewertet     | • Lange autonome Sitzungen <br>• Wenn Auto-Edit zu vorsichtig, aber YOLO zu riskant ist                  | Mittel     |
| **YOLO**            | ✅ Automatisch genehmigt            | ✅ Automatisch genehmigt            | • Vertrauenswürdige persönliche Projekte <br>• Automatisierte Skripte/CI/CD <br>• Batch-Verarbeitungsaufgaben                 | Höchstes    |

> [!NOTE]
>
> Der Modus, der zuvor **Default** hieß, wurde in **Ask Permissions** umbenannt, um sein Verhalten besser zu beschreiben. Der zugrunde liegende Konfigurationswert (`tools.approvalMode: "default"`) und der Befehl `/approval-mode default` bleiben aus Gründen der Abwärtskompatibilität unverändert.

### Kurzübersicht

- **Im Plan-Modus starten**: Ideal, um den Code zu verstehen, bevor Änderungen vorgenommen werden
- **Im Ask Permissions-Modus arbeiten**: Die ausgewogene Wahl für die meisten Entwicklungsaufgaben
- **Zu Auto-Edit wechseln**: Wenn du viele sichere Codeänderungen vornimmst
- **Auto-Modus ausprobieren**: Wenn du weniger Unterbrechungen möchtest, aber dennoch Sicherheit bei Shell-Befehlen und Netzwerkaufrufen brauchst – ein LLM-Classifier bewertet jeden Aufruf
- **YOLO sparsam einsetzen**: Nur für vertrauenswürdige Automatisierung in kontrollierten Umgebungen

> [!tip]
>
> Du kannst während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) schnell durch die Modi wechseln. Die Terminal-Statusleiste zeigt deinen aktuellen Modus an, sodass du immer weißt, welche Berechtigungen Qwen Code hat.

> Die Reihenfolge des Zyklus ist: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Plan-Modus für sichere Code-Analyse verwenden

Der Plan-Modus weist Qwen Code an, einen Plan zu erstellen, indem die Codebasis mit **Read-only**-Operationen analysiert wird. Dies ist ideal für die Exploration von Codebasen, die Planung komplexer Änderungen oder das sichere Reviewen von Code.

### Wann du den Plan-Modus verwenden solltest

- **Mehrstufige Implementierung**: Wenn dein Feature Änderungen an vielen Dateien erfordert
- **Code-Exploration**: Wenn du die Codebasis gründlich untersuchen möchtest, bevor du etwas änderst
- **Interaktive Entwicklung**: Wenn du die Richtung zusammen mit Qwen Code iterativ entwickeln möchtest

### Wie du den Plan-Modus verwendest

**Plan-Modus während einer Sitzung aktivieren**

Du kannst während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) in den Plan-Modus wechseln, um durch die Berechtigungsmodi zu zyklisieren.

Wenn du dich im Normal-Modus befindest, wechselt **Shift+Tab** (oder **Tab** unter Windows) zuerst in den `auto-edits`-Modus, was durch `⏵⏵ accept edits on` am unteren Rand des Terminals angezeigt wird. Ein erneutes Drücken von **Shift+Tab** (oder **Tab** unter Windows) wechselt in den Plan-Modus, angezeigt durch `⏸ plan mode`.

**Den `/plan`-Befehl verwenden**

Der `/plan`-Befehl bietet eine schnelle Verknüpfung zum Ein- und Ausschalten des Plan-Modus:

Normale Planungsanfragen wechseln nicht automatisch den Modus. Wenn du den Read-only-Workflow des Plan-Modus möchtest, verwende `/plan`, das Tastaturkürzel oder setze den Approval-Modus explizit auf `plan`.

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

Wenn du den Plan-Modus mit `/plan exit` verlässt, wird dein vorheriger Approval-Modus automatisch wiederhergestellt (wenn du z. B. vor dem Wechsel in den Plan-Modus im Auto-Edit-Modus warst, kehrst du zu Auto-Edit zurück).

**Eine neue Sitzung im Plan-Modus starten**

Um eine neue Sitzung im Plan-Modus zu starten, verwende `/approval-mode` und wähle dann `plan`

```bash
/approval-mode
```

**"Headless"-Abfragen im Plan-Modus ausführen**

Du kannst eine Abfrage im Plan-Modus auch direkt mit `-p` oder `prompt` ausführen:

```bash
qwen --prompt "What is machine learning?"
```

### Beispiel: Planung eines komplexen Refactorings

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code wechselt in den Plan-Modus und analysiert die aktuelle Implementierung, um einen umfassenden Plan zu erstellen. Verfeinere ihn mit Folgeanfragen:

```
What about backward compatibility?
How should we handle database migration?
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

## 2. Ask Permissions-Modus für kontrollierte Interaktion verwenden

Der Ask Permissions-Modus ist der Standardweg, um mit Qwen Code zu arbeiten. In diesem Modus behältst du die volle Kontrolle über alle potenziell riskanten Operationen – Qwen Code wird vor jeder Dateiänderung oder Ausführung von Shell-Befehlen um deine Genehmigung bitten.

### Wann du den Ask Permissions-Modus verwenden solltest

- **Neu in einer Codebasis**: Wenn du ein unbekanntes Projekt erkundest und besonders vorsichtig sein möchtest
- **Kritische Systeme**: Wenn du an Produktionscode, Infrastruktur oder sensiblen Daten arbeitest
- **Lernen und Lehren**: Wenn du jeden Schritt verstehen möchtest, den Qwen Code unternimmt
- **Teamzusammenarbeit**: Wenn mehrere Personen an derselben Codebasis arbeiten
- **Komplexe Operationen**: Wenn die Änderungen mehrere Dateien oder komplexe Logik umfassen

### Wie du den Ask Permissions-Modus verwendest

**Ask Permissions-Modus während einer Sitzung aktivieren**

Du kannst während einer Sitzung mit **Shift+Tab** (oder **Tab** unter Windows) in den Ask Permissions-Modus wechseln, um durch die Berechtigungsmodi zu zyklisieren. Wenn du dich in einem anderen Modus befindest, führt das Drücken von **Shift+Tab** (oder **Tab** unter Windows) schließlich zurück zum Ask Permissions-Modus, was durch das Fehlen eines Modus-Indikators am unteren Rand des Terminals angezeigt wird.

**Eine neue Sitzung im Ask Permissions-Modus starten**

Der Ask Permissions-Modus ist der Anfangsmodus, wenn du Qwen Code startest. Wenn du die Modi gewechselt hast und zum Ask Permissions-Modus zurückkehren möchtest, verwende:

```
/approval-mode default
```

**"Headless"-Abfragen im Ask Permissions-Modus ausführen**

Beim Ausführen von Headless-Befehlen ist der Ask Permissions-Modus das Standardverhalten. Du kannst ihn explizit angeben mit:

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

Qwen Code analysiert deine Codebasis und schlägt einen Plan vor. Es wird dann um Genehmigung bitten, bevor:

1. Neue Dateien erstellt werden (Controller, Modelle, Migrationen)
2. Bestehende Dateien geändert werden (neue Spalten hinzufügen, APIs aktualisieren)
3. Shell-Befehle ausgeführt werden (Datenbankmigrationen, Installation von Abhängigkeiten)

Du kannst jede vorgeschlagene Änderung überprüfen und einzeln genehmigen oder ablehnen.

### Ask Permissions-Modus als Standard konfigurieren

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto-Edit-Modus

Der Auto-Edit-Modus weist Qwen Code an, Dateiänderungen automatisch zu genehmigen, während für Shell-Befehle eine manuelle Genehmigung erforderlich ist. Dies ist ideal, um Entwicklungs-Workflows zu beschleunigen und gleichzeitig die Systemsicherheit zu gewährleisten.

Zu den automatisch genehmigten Edit-Tools gehören `edit`, `write_file` und `notebook_edit`.

### Wann du den Auto-Accept Edits-Modus verwenden solltest

- **Tägliche Entwicklung**: Ideal für die meisten Coding-Aufgaben
- **Sichere Automatisierung**: Ermöglicht der KI, Code zu ändern, während die versehentliche Ausführung gefährlicher Befehle verhindert wird
- **Teamzusammenarbeit**: In gemeinsamen Projekten verwenden, um unbeabsichtigte Auswirkungen auf andere zu vermeiden

### Wie du in diesen Modus wechselst

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### Workflow-Beispiel

1. Du bittest Qwen Code, eine Funktion zu refactoren
2. Die KI analysiert den Code und schlägt Änderungen vor
3. Wendet **automatisch** alle Dateiänderungen ohne Bestätigung an
4. Wenn Tests ausgeführt werden müssen, **fordert sie eine Genehmigung** an, um `npm test` auszuführen

## 4. Auto-Modus – Classifier-gesteuerte Genehmigung

Der Auto-Modus liegt zwischen Auto-Edit und YOLO. Ein LLM-Classifier bewertet jeden Shell-Befehl, Netzwerkaufruf und jede Bearbeitung außerhalb des Workspaces und genehmigt diejenigen automatisch, die er als sicher einstuft, während er riskante blockiert. Die meisten Read-only-Operationen und Bearbeitungen innerhalb des Workspaces überspringen den Classifier, um die Geschwindigkeit zu erhöhen.

Siehe [auto-mode.md](./auto-mode.md) für die vollständige Referenz (Hints-Konfiguration, Troubleshooting, FAQ).

### Wann du den Auto-Modus verwenden solltest

- **Lange autonome Sitzungen**: Wenn der Ask Permissions-Modus zu oft unterbricht, aber YOLO zu riskant ist.
- **Vertrauenswürdige Projekte**: Interne Codebasen, bei denen der Agent weiterarbeiten soll, aber du dennoch eine Sicherheitsbarriere für destruktive Shell-Befehle und ausgehende Netzwerkaufrufe möchtest.
- **Headless-/geplante Ausführungen**: Wenn Auto-Edit nicht ausreicht (der Agent auch Shell-Befehle ausführen muss), du aber Sicherheit bei `rm -rf /`, `curl ... | sh`, Credential-Exfiltration usw. möchtest.

### Wie du den Auto-Modus verwendest

**Auto-Modus während einer Sitzung aktivieren**

Drücke **Shift+Tab** (oder **Tab** unter Windows), um in den Auto-Modus zu wechseln. Die Statusleiste zeigt den aktiven Modus an.

**Den `/approval-mode`-Befehl verwenden**

```
/approval-mode auto
```

Wenn du den Auto-Modus zum ersten Mal aktivierst, erklärt eine Informationsmeldung, wie er funktioniert. Diese Meldung wird nicht erneut angezeigt.

**Eine neue Sitzung im Auto-Modus starten**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Was der Auto-Modus automatisch genehmigt vs. blockiert

Der Classifier ist bei Unsicherheit eher auf Blockieren ausgerichtet. Standardeinstellungen:

- **Automatisch genehmigt**: Read-only-Befehle (ls, cat, git status, grep, find), Paketinstallation im cwd, Build-/Test-Befehle, Dateiänderungen innerhalb des Workspaces, rein lokale Operationen.
- **Blockiert**: Irreversible Zerstörung (rm -rf /, fdisk, mkfs), Ausführung von externem Code (curl | sh, eval von Remote-Inhalten), Credential-Exfiltration, unbefugte Persistenz (.bashrc-Änderungen, crontab), Schwächung der Sicherheit, Force-Push auf main/master.

Du kannst das Urteil des Classifiers über Natural-Language-Hints in der settings.json anpassen. Siehe [auto-mode.md](./auto-mode.md#configuring-hints).

### Sicherheitsvorkehrungen

- **Harte Regeln bleiben in Kraft**: `permissions.deny`-Regeln blockieren Aktionen, bevor der Classifier überhaupt ausgeführt wird.
- **Zu weit gefasste Allow-Regeln werden im Auto-Modus entfernt**: z. B. `permissions.allow: ["Bash"]` (jeden Shell-Befehl erlauben) umgeht den Classifier; das Aktivieren des Auto-Modus deaktiviert solche Regeln vorübergehend, damit der Classifier seine Arbeit tun kann. Die Regeln werden wiederhergestellt, wenn du den Auto-Modus verlässt. Einstellungen auf der Festplatte werden niemals geändert.
- **Fail-closed**: Wenn die Classifier-API nicht erreichbar ist, wird die Aktion blockiert und nicht erlaubt. Nach zwei aufeinanderfolgenden nicht verfügbaren Aufrufen fällt der nächste Tool-Aufruf auf die manuelle Genehmigung zurück.
- **Loop-Guard**: Nach drei aufeinanderfolgenden Policy-Blockierungen fällt auch der nächste Aufruf auf die manuelle Genehmigung zurück, damit der Agent nicht in einem Sackgassen-Ansatz stecken bleibt.

### Beispiel

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code nimmt die Dateiänderungen vor (Bearbeitungen im Workspace überspringen den Classifier), führt `npm test` aus (Classifier stuft es als sicher ein) und zeigt eine Blockierung an, wenn es jemals etwas Riskantes wie `rm -rf /Users/me/.aws` versucht. Du kannst den Grund inline überprüfen und entscheiden, ob du für diesen Schritt in den Ask Permissions-Modus wechseln möchtest.

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
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
      // Optional: route ALL shell commands (including read-only ones like
      // ls, cat) through the classifier for defense-in-depth.
      // "classifyAllShell": true,
    },
  },
}
```

## 5. YOLO-Modus – Vollständige Automatisierung

Der YOLO-Modus gewährt Qwen Code die höchsten Berechtigungen und genehmigt automatisch alle Tool-Aufrufe, einschließlich Dateiänderungen und Shell-Befehle.

### Wann du den YOLO-Modus verwenden solltest

- **Automatisierte Skripte**: Ausführen vordefinierter automatisierter Aufgaben
- **CI/CD-Pipelines**: Automatisierte Ausführung in kontrollierten Umgebungen
- **Persönliche Projekte**: Schnelle Iteration in vollständig vertrauenswürdigen Umgebungen
- **Batch-Verarbeitung**: Aufgaben, die mehrstufige Befehlsketten erfordern

> [!warning]
>
> **Verwende den YOLO-Modus mit Vorsicht**: Die KI kann jeden Befehl mit deinen Terminalberechtigungen ausführen. Stelle sicher:
>
> 1. Du der aktuellen Codebasis vertraust
> 2. Du alle Aktionen verstehst, die die KI ausführen wird
> 3. Wichtige Dateien gesichert oder in die Versionskontrolle committet sind

### Wie du den YOLO-Modus aktivierst

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
  "tools": {
    "approvalMode": "yolo"
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

### Wechsel per Tastaturkürzel

Während einer Qwen Code-Sitzung kannst du mit **Shift+Tab** (oder **Tab** unter Windows) schnell durch die fünf Modi wechseln:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### Persistente Konfiguration

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // or "plan", "default", "auto", "yolo"
  }
}
```

### Empfehlungen zur Modusnutzung

1. **Neu in der Codebasis**: Starte mit dem **Plan-Modus** zur sicheren Exploration
2. **Tägliche Entwicklungsaufgaben**: Verwende **Auto-Accept Edits** (Standardmodus), effizient und sicher
3. **Automatisierte Skripte**: Verwende den **YOLO-Modus** in kontrollierten Umgebungen für vollständige Automatisierung
4. **Komplexes Refactoring**: Verwende zuerst den **Plan-Modus** für die detaillierte Planung und wechsle dann zum entsprechenden Modus für die Ausführung