# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle, die dir helfen, Sitzungen effizient zu verwalten, die Benutzeroberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden über bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ | Funktionsbeschreibung | Typischer Anwendungsfall |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Slash-Befehle (`/`) | Steuerung von Qwen Code auf Meta-Ebene | Sitzungsverwaltung, Einstellungen ändern, Hilfe erhalten |
| At-Befehle (`@`) | Schnelles Einfügen lokaler Dateiinhalte in den Konversationsverlauf | Ermöglicht der KI die Analyse bestimmter Dateien oder von Code in Verzeichnissen |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell | Ausführen von Systembefehlen wie `git status`, `ls` usw. |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sitzungen, die Benutzeroberfläche und das Grundverhalten zu verwalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen dir, den Arbeitsfortschritt zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init` | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen | `/init` |
| `/summary` | Projektzusammenfassung basierend auf dem Konversationsverlauf generieren | `/summary` oder `/summary docs/my-summary.md` |
| `/compress` | Chat-Verlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress` oder `/summarize` |
| `/compress-fast` | Schnelle Komprimierung ohne KI – entfernt alte Tool-Ausgaben und Denkprozesse | `/compress-fast` |
| `/resume` | Eine vorherige Konversationssitzung fortsetzen | `/resume` oder `/continue` |
| `/recap` | Jetzt eine einzeilige Sitzungsübersicht generieren | `/recap` |
| `/restore` | Projektdateien auf den Checkpoint vor der Ausführung eines Tool-Aufrufs zurücksetzen | `/restore` (Liste) oder `/restore <ID>` |
| `/delete` | Eine vorherige Sitzung löschen | `/delete` |
| `/branch` | Die aktuelle Konversation in eine neue Sitzung abspalten | `/branch` |
| `/fork` | Einen Hintergrund-Agenten erzeugen, der die gesamte Konversation erbt | `/fork <directive>` |
| `/rewind` | Konversation auf einen vorherigen Turn zurückspulen | `/rewind` oder `/rollback` |
| `/export` | Sitzungsverlauf in eine Datei exportieren | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename` | Die aktuelle Sitzung umbenennen oder taggen | `/rename My Feature` oder `/tag` |
| `/commit`        | Erstellen eines Git-Commits mit einer KI-generierten Nachricht           | `/commit` oder `/commit only stage the parser changes`          |

> [!note]
>
> Das Öffnen eines HTML-Exports lädt den Renderer und das Stylesheet für genau diese Qwen Code-Version von `unpkg.com`. Wenn die Version nicht veröffentlicht wurde oder eines der beiden Assets nicht erreichbar ist, zeigt die Datei einen Ladefehler an. Markdown-, JSON- und JSONL-Exporte bleiben eigenständig.

> [!note]
>
> `/summarize` ist ein Alias für `/compress` (es komprimiert den Chat-Verlauf – eine destruktive Operation). Um stattdessen eine nicht-destruktive Projektzusammenfassung zu generieren, verwende `/summary`.

> [!note]
>
> `/summary` akzeptiert ein optionales `[path]`-Argument, um die Zusammenfassung an einem benutzerdefinierten Speicherort innerhalb des Projekt-Roots zu speichern. Ohne Argument wird sie unter `.qwen/PROJECT_SUMMARY.md` gespeichert. Zusammenfassungen mit benutzerdefiniertem Pfad werden vom Welcome-Back-Flow (`ui.enableWelcomeBack`) nicht erkannt, der nur den Standardpfad `.qwen/PROJECT_SUMMARY.md` liest.

### 1.2 Benutzeroberflächen- und Workspace-Steuerung

Befehle zum Anpassen der Benutzeroberfläche und der Arbeitsumgebung.

| Befehl               | Beschreibung                                                                                                                                                                      | Verwendungsbeispiele                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear` | Konversationsverlauf löschen und Kontext freigeben | `/clear`, `/reset`, `/new` |
| `/context` | Aufschlüsselung der Kontextfenster-Nutzung anzeigen | `/context` |
| → `detail` | Aufschlüsselung der Kontextnutzung pro Element anzeigen | `/context detail` |
| `/history` | Einstellungen für die Verlaufsanzeige und Sichtbarkeit steuern | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff` | Öffnet einen interaktiven Diff-Viewer, der uncommitted Änderungen und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um Dateien zu durchsuchen | `/diff` |
| `/log` | Öffnet einen Commit-Verlauf-Viewer für den Workspace (nur Web Shell) | `/log` |
| `/theme`             | Ändern des visuellen Themas von Qwen Code                                                                                                                                         | `/theme`                                                                          |
| `/vim` | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten | `/vim` |
| `/voice` | Spracheingabe per Diktat umschalten | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status` |
| `/directory` | Workspace mit Unterstützung für mehrere Verzeichnisse verwalten | `/dir add ./src,./tests`, `/dir show` |
| `/cd` | Diese Sitzung in ein neues Arbeitsverzeichnis verschieben | `/cd ../other-project` |
| `/editor` | Dialog zur Auswahl eines unterstützten Editors öffnen | `/editor` |
| `/statusline` | Interaktiven Preset-Dialog für die [Statusleiste](./status-line.md) öffnen | `/statusline` |
| `/statusline <text>` | Eine [Statusleiste](./status-line.md) im Befehlsmodus über einen Agenten generieren | `/statusline show model and git branch` |
| `/terminal-setup` | Terminal-Tastenkürzel für mehrzeilige Eingaben konfigurieren | `/terminal-setup` |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Sprachen für Benutzeroberfläche und Ausgabe.

| Befehl | Beschreibung | Nutzungsbeispiele |
| --------------------- | -------------------------------- | -------------------------- |
| `/language` | Spracheinstellungen anzeigen oder ändern | `/language` |
| → `ui [language]` | Sprache der Benutzeroberfläche festlegen | `/language ui zh-CN` |
| → `output [language]` | Ausgabesprache des LLM festlegen | `/language output Chinese` |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch), `ja-JP` (Japanisch), `pt-BR` (Portugiesisch - Brasilien), `fr-FR` (Französisch), `ca-ES` (Katalanisch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und -Modellen.

| Befehl                | Beschreibung                                                                                      | Verwendungsbeispiele                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `/mcp`                | Auflisten konfigurierter MCP-Server und Tools                                                     | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                         |
| `/import-config`      | Importieren von MCP-Servern aus Claude-Konfigurationen                                            | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`              | Anzeigen der aktuell verfügbaren Tool-Liste                                                       | `/tools`, `/tools desc`                                                                                   |
| `/skills`             | Öffnen des Skills-Panels zum Durchsuchen, Suchen, Umschalten und Starten von Skills                | `/skills`, `/<skill-name>`                                                                                |
| `/learn`              | Erstellen eines wiederverwendbaren Projekt-Skills aus einer Datei, einem Verzeichnis, einer URL, einem Video oder Text | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment`                        |
| `/curator`            | Überprüfen, Pinnen, Archivieren oder Wiederherstellen inaktiver automatischer Projekt-Skills       | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>`          |
| `/plan`               | Wechseln in den Planungsmodus oder Beenden des Planungsmodus                                       | `/plan`, `/plan <task>`, `/plan exit`                                                                     |
| `/approval-mode`      | Ändern des Tool-Genehmigungsmodus (nur aktuelle Sitzung)                                          | `/approval-mode`, `/approval-mode auto-edit`                                                              |
| → `plan`              | Nur Analyse, keine Ausführung (sichere Überprüfung)                                               | `/approval-mode plan`                                                                                     |
| → `default`           | Genehmigung für Bearbeitungen erforderlich (tägliche Nutzung)                                     | `/approval-mode default`                                                                                  |
| → `auto-edit`         | Automatische Genehmigung von Bearbeitungen (vertrauenswürdiges Umgebung)                          | `/approval-mode auto-edit`                                                                                |
| → `auto`              | Genehmigung durch Klassifizierungsbewertung (autonom)                                             | `/approval-mode auto`                                                                                     |
| → `yolo`              | Alles automatisch genehmigen (schnelles Prototyping)                                              | `/approval-mode yolo`                                                                                     |
| `/peers`              | Überprüfen angehaltener Peer-Nachrichten; Verwalten vertrauenswürdiger Controller                  | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>`             |
| `/model`              | Wechseln des in der aktuellen Sitzung verwendeten Modells                                         | `/model`, `/model <model-id>` (sofortiger Wechsel)                                                        |
| `/model --fast`       | Festlegen eines leichteren Modells für Prompt-Vorschläge                                          | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice`      | Legt das Modell für die Sprachtranskription fest                                                       | `/model --voice <model-id>`                                                                               |
| `/model --vision`     | Legt das Vision-Bridge-Modell fest, das Bilder für ein rein textbasiertes Hauptmodell transkribiert                 | `/model --vision <model-id>`                                                                              |
| `/model --compaction` | Legt das Modell für die Chat-Komprimierung fest                                                          | `/model --compaction <model-id>`, `/model --compaction clear`                                             |
| `/model --image`      | Legt ein bildgenerierungsfähiges Modell für das integrierte Bildgenerierungstool fest                     | `/model --image <model-id>`                                                                               |
| `/effort`             | Legt den Reasoning-Aufwand für denkfähige Modelle fest                                                 | `/effort` (öffnet Auswahl), `/effort high` (low/medium/high/xhigh/max; wird pro Anbieter zugeordnet & begrenzt)       |
| `/output-style`       | Wählt den Ausgabestil aus, der bestimmt, wie Antworten geschrieben werden                                    | `/output-style` (öffnet Auswahl), `/output-style Concise`, `/output-style default` (kein Stil)               |
| `/extensions`         | Verwaltet Erweiterungen                                                                                | `/extensions list`, `/extensions manage`                                                                  |
| → `list`              | Listet installierte Erweiterungen auf                                                                        | `/extensions list`                                                                                        |
| → `manage`            | Verwaltet installierte Erweiterungen (interaktiv)                                                        | `/extensions manage`                                                                                      |
| → `explore`           | Öffnet die Erweiterungsseite im Browser                                                                  | `/extensions explore <Gemini\|ClaudeCode>`                                                                |
| → `install`           | Installiert eine Erweiterung aus einem Git-Repo oder Pfad                                                     | `/extensions install <repo-or-path>`                                                                      |
| `/memory`             | Öffnet den Memory-Manager-Dialog                                                                   | `/memory`                                                                                                 |
| `/remember`           | Speichert einen dauerhaften Speicher                                                                        | `/remember Prefer terse responses`                                                                        |
| `/forget`             | Entfernt passende Einträge aus dem Auto-Speicher                                                         | `/forget <query>`                                                                                         |
| `/dream`              | Führt die Konsolidierung des Auto-Speichers manuell durch                                                           | `/dream`                                                                                                  |
| `/hooks`              | Verwaltet Qwen Code Hooks                                                                           | `/hooks`, `/hooks list`                                                                                   |
| `/reload-plugins`     | Lädt Änderungen an Erweiterungen (Befehle, Skills, Agents, Workflows, Hooks, MCP/LSP-Server) von der Disk neu | `/reload-plugins`                                                                                         |
| `/permissions`        | Verwaltet Berechtigungsregeln                                                                          | `/permissions`                                                                                            |
| `/agents`             | Verwaltet Subagents                                                                                 | `/agents manage`, `/agents create`                                                                        |
| `/arena`              | Verwaltet Arena-Sitzungen                                                                            | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (Alias `choose`)                          |
| `/goal`               | Ziel setzen — weiterarbeiten, bis ein Verifizierer es bestätigt (siehe [Ziele](./goals.md))                 | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear`               |
| `/tasks`              | Hintergrund-Tasks auflisten                                                                            | `/tasks`                                                                                                  |
| `/workflows`          | Workflow-Ausführungen inspizieren; eine Hintergrund-Ausführung kooperativ pausieren/fortsetzen                               | `/workflows`, `/workflows <runId>`, `/workflows p <runId>`                                                |
| `/lsp`                | LSP-Serverstatus anzeigen                                                                           | `/lsp`                                                                                                    |
| `/trust`              | Einstellungen für Ordnervertrauen verwalten                                                                     | `/trust`                                                                                                  |

> [!warning]
>
> Installieren Sie nur Erweiterungen (`/extensions install`) aus vertrauenswürdigen Quellen. Erweiterungen können MCP-Server, Skills und Befehle bündeln, die mit denselben Berechtigungen wie Qwen Code selbst ausgeführt werden — sie haben Zugriff auf Ihre Dateien, API-Schlüssel und Konversationsdaten. Sie können auch Workflow-Skripte enthalten, die in der Workflow-Sandbox ohne direkten Datei- oder Shell-Zugriff ausgeführt werden, über die von ihnen gestarteten Subagents handeln und die Genehmigung des Workflow-Tools durchlaufen. `/extensions install` fragt nicht nach Bestätigung.

> [!warning]
>
> Die Genehmigungsmodi `auto-edit`, `auto` und `yolo` umgehen die Genehmigungsabfragen für Tool-Ausführungen. Im `yolo`-Modus werden alle Aktionen – einschließlich Shell-Befehle, Datei-Schreibvorgänge und Netzwerkanfragen – ohne Bestätigung ausgeführt. Verwende diese Modi nur in vertrauenswürdigen, isolierten (sandboxed) oder wegwerfbaren Umgebungen.

> [!note]
>
> `/workflows`, `/lsp` und `/trust` werden nur registriert, wenn die jeweilige Funktion aktiviert ist – über die user/system-scoped Einstellung `tools.workflowsEnabled` oder die Umgebungsvariable `QWEN_CODE_ENABLE_WORKFLOWS=1`, das CLI-Flag `--experimental-lsp` bzw. die Einstellung `security.folderTrust.enabled`. Workspace-Werte für `tools.workflowsEnabled` werden ignoriert. Wenn sie deaktiviert sind, werden sie nicht angezeigt und melden einen unbekannten Befehl. Ebenso werden `/dream` und `/forget` nur registriert, wenn verwaltetes Auto-Memory verfügbar ist; andernfalls werden sie nicht angezeigt.

> [!note]
>
> Ein Skill aus einer installierten Extension ist ebenfalls ein Slash-Befehl, und sein Name trägt seinen Owner: `/rust:pdf`, nicht `/pdf`. Die bloße Form ist kein Alias – wenn ein anderer Skill `pdf` heißt, führt `/pdf` stattdessen diesen Skill aus. `slashCommands.disabled` blockiert einen solchen Befehl unter beiden Schreibweisen, sodass ein Eintrag, der geschrieben wurde, bevor der Name den Owner trug, weiterhin zuschlägt. Siehe [How extension Skills are named](./skills.md#how-extension-skills-are-named).

### 1.5 Integrierte Skills

Diese Befehle rufen gebündelte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl       | Beschreibung                                                   | Verwendungsbeispiele                                                                            |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/review`     | Multi-Agenten-Code-Review (12 parallele Agenten bei hohem Aufwand)   | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low`                 |
| `/coordinate` | Koordiniert schreibgeschützte Worker und einen optionalen Worktree-Writer | `/coordinate investigate and fix the authentication regression`                           |
| `/loop`       | Führt einen Prompt nach einem wiederkehrenden Zeitplan aus                          | `/loop 5m check the build`                                                                |
| `/goal-draft` | Wandelt eine vage Absicht in ein verifizierbares `/goal`-Ziel um    | `/goal-draft make the auth tests pass`                                                    |
| `/autofix-pr` | Überwacht einen PR und behebt CI-Fehler, Review-Feedback und Konflikte      | `/autofix-pr 123`, `/autofix-pr 123 --once`, `/autofix-pr resume`, `/autofix-pr stop 123` |
| `/simplify`   | Überprüft kürzliche Änderungen und wendet sichere Aufräum-Bearbeitungen direkt an   | `/simplify`, `/simplify focus on duplication`                                             |
| `/qc-helper`  | Beantwortet Fragen zur Nutzung und Konfiguration von Qwen Code      | `/qc-helper how do I configure MCP?`                                                      |

Siehe [Code Review](./code-review.md) für vollständige `/review`-Dokumentation und [Autofix a Pull Request](./autofix-pr.md) für `/autofix-pr`.

### 1.6 Zwischenfrage (`/btw`)

Der Befehl `/btw` ermöglicht es dir, schnelle Zwischenfragen zu stellen, ohne den Hauptkonversationsfluss zu unterbrechen oder zu beeinträchtigen.

| Befehl                 | Beschreibung                          |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Stellt eine kurze Nebenfrage             |
| `?btw <your question>` | Alternative Syntax für Nebenfragen |

**Funktionsweise:**

- Die Zwischenfrage wird als separater API-Call mit aktuellem Konversationskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird über dem Composer angezeigt – du kannst während des Wartens weiterschreiben
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Antwort auf die Zwischenfrage wird **nicht** Teil des Hauptkonversationsverlaufs
- Antworten werden mit voller Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)

**Tastenkürzel (Interaktiver Modus):**

| Tastenkürzel           | Aktion                                                |
| -------------------- | -------------------------------------------------------- |
| `Escape`             | Abbrechen (während des Ladens) oder Ausblenden (nach Abschluss) |
| `Space` oder `Enter` | Antwort ausblenden (wenn die Eingabe leer ist)      |
| `Ctrl+C` oder `Ctrl+D` | Eine laufende Zwischenfrage abbrechen               |

**Beispiel:**

```
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                    |
| -------------------- | -------------------------------------------- |
| Interactive          | Wird über dem Composer mit Markdown-Rendering angezeigt |
| Non-interactive      | Gibt Textergebnis zurück: `btw> question\nanswer` |
| ACP (Agent Protocol) | Gibt stream_messages async generator zurück      |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne deine Hauptaufgabe aus dem Blick zu verlieren. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu überprüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Second Opinion (`/advisor`)

Der Befehl `/advisor` führt eine unabhängige, schreibgeschützte Überprüfung der bisherigen Konversation durch und gibt eine strukturierte Second Opinion zurück – ohne die Aufgabe auszuführen oder die Hauptkonversation zu unterbrechen.

| Befehl             | Beschreibung                             |
| ------------------ | ---------------------------------------- |
| `/advisor`         | Überprüft die obige Konversation         |
| `/advisor <focus>` | Fokussiert die Überprüfung auf ein bestimmtes Anliegen |

**Funktionsweise:**

- Die Überprüfung wird als separater, einstufiger API-Aufruf mit aktuellem Konversationskontext gesendet (bis zu den letzten 40 Nachrichten)
- Das Reviewer-Modell **kann keine Tools ausführen** – Tools werden auf Request-Ebene entfernt (derselbe Mechanismus wie bei `/btw`), sodass die Überprüfung niemals Code schreibt oder Befehle ausführt; jeder Anspruch muss im sichtbaren Transkript begründet sein
- Die Hauptkonversation wird **nicht** unterbrochen; die Überprüfung wird nur dir angezeigt
- Die Überprüfung wird als gerahmter Markdown-Block mit vier festen Abschnitten dargestellt – **Verdict**, **Risks**, **Missing evidence** und **Recommendation** – unter einem `/advisor · <model>`-Header, der das aufgelöste Reviewer-Modell nennt
- Im Gegensatz zu `/btw`, das Fire-and-Forget ist und die Sitzung benutzbar lässt, blockiert `/advisor` die Eingabe, bis die Überprüfung zurückkehrt; über ein volles Kontextfenster mit einem starken Reviewer kann dies Dutzende von Sekunden dauern
- Standardmäßig wird das Hauptmodell verwendet; setze [`advisorModel`](../configuration/settings.md#advisormodel), um die Überprüfung an ein anderes (typischerweise stärkeres) Modell weiterzuleiten – das aktuelle Transkript wird an dieses Modell gesendet, auch wenn es einen anderen Provider verwendet

**Beispiel:**

```
> /advisor is my fix for the null check actually correct?

  Consulting advisor...

  ╭──────────────────────────────────────────────────────╮
  │ /advisor · qwen3-max                                 │
  │                                                      │
  │ Verdict                                              │
  │ The approach is sound, but the edge case at line 42  │
  │ is unverified.                                       │
  │                                                      │
  │ Risks                                                │
  │  - The fix assumes the config is always loaded; a    │
  │    startup race could leave it null.                 │
  │                                                      │
  │ Missing evidence                                     │
  │  - No test exercises the null-config path in the     │
  │    visible transcript.                               │
  │                                                      │
  │ Recommendation                                       │
  │ Add a focused unit test for the null-config branch   │
  │ before merging.                                      │
  ╰──────────────────────────────────────────────────────╯
```

Die Überprüfung wird in einem gerahmten Block gerendert, dessen Header das aufgelöste Reviewer-Modell nennt. Ein unbekanntes `advisorModel` wird nicht im Voraus validiert – wenn der Provider es ablehnt, meldet `/advisor` den Fehler, also überprüfe den Modellnamen; nur nicht auflösbare Alias-Selektoren (z. B. `fast` ohne konfiguriertes Fast-Modell) fallen auf das Hauptmodell zurück. Advisor-Anfragen verwenden keine konfigurierten Modell-Fallbacks.

**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                                |
| -------------------- | -------------------------------------------------------- |
| Interactive          | Rendert die vierabschnittige Überprüfung in der Konversation |
| ACP (Agent Protocol) | Gibt die Überprüfung als Nachrichtenergebnis zurück      |

> [!tip]
>
> Verwende `/advisor` für eine Second Opinion, bevor du dich auf eine Richtung festlegst – es ist besonders nützlich, um fehlerhafte Annahmen, ungeprüfte Behauptungen oder riskante nächste Schritte zu erkennen. Konfiguriere `advisorModel`, um die Überprüfung von einem anderen Modell als dem der Hauptkonversation zu erhalten.

> [!note]
>
> `advisorModel` wird nur in den Einstellungen gesetzt; im Gegensatz zu `fastModel` und `visionModel` hat es noch kein `/model`-Flag-Gegenstück.

### 1.8 Session Recap (`/recap`)

Der Befehl `/recap` erzeugt eine kurze "Wo du aufgehört hast"-Zusammenfassung der aktuellen Sitzung, damit du eine alte Konversation fortsetzen kannst, ohne durch Seiten von Verlauf zu scrollen.

| Befehl  | Beschreibung                                |
| -------- | ------------------------------------------ |
| `/recap` | Generiert und zeigt eine einzeilige Session-Zusammenfassung |

**Funktionsweise:**

- Verwendet das konfigurierte schnelle Modell (Einstellung `fastModel`), wenn verfügbar, und fällt auf das Haupt-Sitzungsmodell zurück. Ein kleines, günstiges Modell reicht für eine Zusammenfassung aus.
- Die jüngste Konversation (bis zu 30 Nachrichten, nur Text – Tool-Aufrufe und Tool-Antworten werden herausgefiltert) wird mit einem prägnanten System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in gedämpfter Farbe mit dem Präfix `❯` dargestellt, um sich von echten Assistentenantworten abzuheben.
- Lehnt mit einer Inline-Fehlermeldung ab, wenn ein Modell-Durchlauf läuft oder ein anderer Befehl verarbeitet wird. Wenn keine nutzbare Konversation vorhanden ist oder die zugrunde liegende Generierung fehlschlägt, zeigt `/recap` stattdessen eine kurze Info-Nachricht anstelle einer Zusammenfassung – der manuelle Befehl antwortet immer mit etwas.

**Automatische Auslösung bei Rückkehr nach Abwesenheit:**

Wenn das Terminal **5+ Minuten** lang unscharf war und wieder fokussiert wird, wird automatisch eine Zusammenfassung generiert und angezeigt (nur wenn keine Modellantwort läuft; sonst wartet sie, bis der aktuelle Durchlauf beendet ist, und feuert dann). Im Gegensatz zum manuellen Befehl ist der automatische Auslöser bei Fehlern vollständig still: Wenn die Generierung Fehler wirft oder nichts zusammengefasst werden kann, wird kein Eintrag zur Historie hinzugefügt. Gesteuert durch die Einstellung `general.showSessionRecap` (Standard: `false`); der manuelle Befehl `/recap` funktioniert unabhängig von dieser Einstellung immer.

**Beispiel:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Konfiguriere ein schnelles Modell über `/model --fast <model>` (z. B. `qwen3-coder-flash`), um `/recap` schnell und günstig zu machen. Setze `general.showSessionRecap` auf `true`, um den automatischen Auslöser zu aktivieren; der manuelle Befehl `/recap` funktioniert unabhängig von dieser Einstellung immer.

### 1.9 Diff-Viewer (`/diff`)

Der Befehl `/diff` öffnet einen interaktiven Diff-Viewer, der uncommitted Änderungen und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um durch Dateien zu navigieren, und Enter, um Inline-Diffs anzuzeigen.

**Funktionsweise:**

Im interaktiven Modus öffnet `/diff` einen Dialog mit einem **Source Picker** am oberen Rand:

- **Current** – Working Tree vs. HEAD (`git diff HEAD`). Zeigt alle uncommitted Änderungen an, einschließlich staged, unstaged und untracked Dateien.
- **T1, T2, T3, …** – Diffs pro Turn, ein Tab pro Model-Turn, der Dateien geändert hat. Die neuesten Turns werden zuerst angezeigt. Jeder Tab zeigt eine Vorschau des ursprünglichen Prompts als Kontext.

Die Dateiliste zeigt dateispezifische Statistiken (hinzugefügte/entfernte Zeilen) mit Tags für spezielle Zustände (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Drücke Enter auf einer Datei, um ihren Inline-Diff mit syntaxhervorgehobenen Hunks anzuzeigen.

Diffs pro Turn erfordern, dass File Checkpointing aktiviert ist (im interaktiven Modus standardmäßig eingeschaltet). Wenn File Checkpointing deaktiviert ist, ist nur die Quelle "Current" verfügbar.

**Tastenkürzel:**

| Taste     | Aktion                                      |
| --------- | ------------------------------------------- |
| `←` / `→` | Zwischen Quellen wechseln (Current / T1 / T2…) |
| `↑` / `↓` | Durch Dateiliste navigieren                 |
| `j` / `k` | Durch Dateiliste navigieren (Vim-Style)     |
| Enter     | Inline-Diff für ausgewählte Datei anzeigen  |
| `←` / Esc | Von der Inline-Diff-Ansicht zur Dateiliste zurückkehren |
| Esc       | Dialog schließen                            |

**Beispiel:**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Nicht-interaktiver Modus:**

In Headless- (`--prompt`) oder nicht-interaktiven Kontexten gibt `/diff` eine Plain-Text-Zusammenfassung des Working Tree vs. HEAD aus. Die Navigation pro Turn ist nicht verfügbar.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

**Web Shell:** In der Web-Shell-UI (`qwen serve`) öffnet `/diff` einen grafischen Diff-Dialog. Eine Tab-Leiste oben ermöglicht das Umschalten zwischen der **Changes**-Ansicht und der **History**-Ansicht (`/log`).

#### History Viewer (`/log`) — nur Web Shell

Der Befehl `/log` öffnet einen Commit-Verlauf-Browser für den aktuellen Workspace. Er ist nur in der Web-Shell-UI verfügbar; die CLI/TUI hat diesen Befehl nicht.

**Funktionsweise:**

`/log` öffnet einen Dialog, der Commits in umgekehrter chronologischer Reihenfolge auflistet (neueste zuerst). Jede Zeile zeigt:

- Kurze SHA (Monospace, mit Kopier-Button für die volle SHA)
- Commit-Subject (einzeilig)
- Autorname und relative Zeit (z. B. "2h ago")
- Branch/Tag-Ref-Labels, falls vorhanden
- Ein Merge-Icon (⎇) für Merge-Commits

Klicke auf eine Commit-Zeile, um ihre Details on demand zu erweitern:

- Vollständiger Commit-Message-Body
- Dateiänderungsstatistiken (geänderte Dateien, hinzugefügte/entfernte Zeilen, Aufschlüsselung pro Datei)

Verwende **Load more** unten, um die nächste Seite mit Commits abzurufen (50 pro Seite).

**Beispiel:**

```
┌─ History ──────────────────────────── 50 commits ─ ✕ ┐
│                                                       │
│  a1b2c3d  feat(cli): add --json flag        2h ago   │
│           wenshao                                    │
│                                                       │
│  e4f5g6h  fix(core): handle null config     5h ago   │
│           dev · main  v1.2.0                         │
│                                                       │
│ ▼ 789abcd  refactor: simplify parser        1d ago   │
│   ┌─────────────────────────────────────────────┐    │
│   │  Broke the monolithic parse() into smaller  │    │
│   │  functions for readability.                 │    │
│   │                                             │    │
│   │  3 files · +45 −12                          │    │
│   │   +30 −8   src/parser.ts                    │    │
│   │   +10 −2   src/utils.ts                     │    │
│   │   +5  −2   test/parser.test.ts              │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│              [ Load more ]                            │
└───────────────────────────────────────────────────────┘
```

> [!note]
>
> `/log` erfordert ein Git-Repository als Workspace. Wenn der Workspace kein Git-Repository ist oder keine Commits hat, zeigt der Dialog eine Platzhalter-Nachricht an.

### 1.10 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und Vornehmen von Systemeinstellungen.

| Befehl           | Beschreibung                                                                                                                   | Anwendungsbeispiele                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | Zeigt Hilfeinformationen für verfügbare Befehle an                                                                             | `/help` oder `/?`                                                                   |
| `/status`        | Zeigt Versionsinformationen an                                                                                                 | `/status` oder `/about`                                                             |
| `/status paths`  | Zeigt die Datei- und Log-Pfade der aktuellen Session an                                                                        | `/status paths`                                                                     |
| `/stats`         | Öffnet das interaktive Nutzungsstatistik-Dashboard (Tabs Session, Activity und Efficiency)                                     | `/stats` oder `/usage`                                                              |
| `/stats model`   | Zeigt die Token-Aufschlüsselung pro Modell und die geschätzten Kosten an                                                       | `/stats model`                                                                      |
| `/stats tools`   | Zeigt die Aufrufzahlen pro Tool an                                                                                             | `/stats tools`                                                                      |
| `/stats skills`  | Zeigt die Aufrufzahlen pro Skill für die aktuelle Live-Session an (nur live; schließt sessionübergreifende tägliche/monatliche Aktivität aus) | `/stats skills`                                                                     |
| `/stats daily`   | Zeigt die tägliche Token-Nutzungsstatistik an                                                                                  | `/stats daily` (Alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Zeigt die monatliche Token-Nutzungsstatistik an                                                                                | `/stats monthly` (Alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exportiert Nutzungsstatistiken nach CSV oder JSON                                                                              | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Öffnet den Einstellungs-Editor                                                                                                 | `/settings`                                                                         |
| `/config`        | Ruft jede Einstellung über den Dot-Path-Key ab oder setzt sie (schreibt in die Benutzereinstellungen)                          | `/config` (alle auflisten), `/config <key>`, `/config <key>=<value>`                 |
| `/auth`          | Ändert die Authentifizierungsmethode                                                                                           | `/auth`, `/connect`, `/login`                                                       |
| `/logout`        | Abmelden vom aktiven Qwen Subscription-Konto (verfügbar mit Qwen Subscription-Anmeldung)                                      | `/logout`                                                                           |
| `/upgrade`       | Qwen-Abonnementpläne öffnen (verfügbar mit Qwen Subscription-Anmeldung)                                                          | `/upgrade`                                                                          |
| `/doctor`        | Führt Installations- und Umgebungsdiagnosen aus                                                                                | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Zeigt die aktuelle Prozess-Speicherdiagnose an                                                                                 | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Erstellt ein CPU-Profil für die Chrome DevTools-Analyse                                                                        | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Setzt das Standalone-CLI-Binary auf die vorherige Version zurück (nur bei Standalone-Installationen; für den Konversationsverlauf verwende `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Öffnet die vollständige Qwen Code-Dokumentation im Browser                                                                     | `/docs`                                                                             |
| `/ide`           | Verwaltet die IDE-Integration                                                                                                  | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Generiert Programmier-Insights aus dem Chat-Verlauf                                                                            | `/insight`                                                                          |
| `/setup-github`  | Richtet GitHub Actions ein                                                                                                     | `/setup-github`                                                                     |
| `/bug`           | Reicht ein Issue zu Qwen Code ein                                                                                              | `/bug Button click unresponsive`                                                    |
| `/copy`          | Kopiert in die Zwischenablage: Antwort (N-letzte), Code (nach Sprache), LaTeX oder Mermaid                                     | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Beendet Qwen Code sofort                                                                                                       | `/quit` oder `/exit`                                                                |

> [!warning]
>
> `/doctor memory --snapshot` schreibt einen V8-Heap-Snapshot, der Prompts, Dateiinhalte, API-Keys und Tool-Ergebnisse der aktuellen Sitzung enthalten kann. Überprüfe die Datei, bevor du sie teilst.

> [!note]
>
> `/config` liest und schreibt einzelne Einstellungen über Dot-Path-Keys (z. B. `general.vimMode`) und ergänzt den interaktiven `/settings`-Editor. Die Ausführung von `/config` ohne Argument (oder mit `--help`) listet jeden setzbaren Key mit seinem Typ und aktuellen Wert auf. `/config <key>` gibt den aktuellen Wert aus – außer bei booleschen Keys, wo der Wert umgeschaltet wird. `/config <key>=<value>` setzt den Wert. Änderungen werden in die Benutzereinstellungen (`~/.qwen/settings.json`) geschrieben. Nur `boolean`-, `string`-, `number`- und `enum`-Einstellungen können auf diese Weise geändert werden – `array`- und `object`-Einstellungen müssen direkt in der `settings.json` bearbeitet werden. Sensible Werte (API-Keys, Tokens, Base-URLs) werden in der Ausgabe maskiert, und das Setzen von `tools.approvalMode` auf `yolo` ist blockiert.

### 1.11 Häufige Shortcuts

| Shortcut           | Funktion                | Hinweis                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Bildschirm löschen            | Löscht nur den sichtbaren Bildschirm (setzt die Sitzung nicht zurück wie `/clear`) |
| `Ctrl/cmd+T`       | Tool-Beschreibung umschalten | MCP-Tool-Verwaltung                                                       |
| `Ctrl/cmd+C`×2     | Beenden bestätigen       | Sicherer Beenden-Mechanismus                                                     |
| `Ctrl/cmd+Z`       | Eingabe rückgängig machen              | Textbearbeitung                                                              |
| `Ctrl/cmd+Shift+Z` | Eingabe wiederherstellen              | Textbearbeitung                                                              |

### 1.12 Authentifizierungs-Befehle

Verwende `/auth` innerhalb einer Qwen Code-Sitzung, um die Authentifizierung zu konfigurieren. Verwende `/doctor`, um den aktuellen Authentifizierungs- und Umgebungsstatus zu überprüfen.

| Befehl   | Beschreibung                                                            |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | Authentifizierung interaktiv konfigurieren (Aliase: `/connect`, `/login`) |
| `/doctor` | Authentifizierungs- und Umgebungsprüfungen anzeigen                             |

> [!note]
>
> Der eigenständige `qwen auth` CLI-Befehl wurde entfernt. Legacy-Aufrufe wie `qwen auth status` geben einen Entfernungshinweis mit Migrationsanleitung aus. Siehe die Seite [Authentication](../configuration/auth) für vollständige Details.

## 2. @-Befehle (Dateien einbinden)

@-Befehle werden verwendet, um lokale Datei- oder Verzeichnisinhalte schnell zur Konversation hinzuzufügen.

| Befehlsformat      | Beschreibung                                  | Beispiele                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Inhalt der angegebenen Datei einfügen             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Rekursives Lesen aller Textdateien im Verzeichnis | `@docs/ Summarize content of this document`      |
| Standalone `@`      | Wird verwendet, wenn das `@`-Symbol selbst thematisiert wird       | `@ What is this symbol used for in programming?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@My\ Documents/file.txt`)

In der interaktiven Eingabeaufforderung unterstützt die Vervollständigung von `@` Unicode-Dateinamen, einschließlich Emojis. Emojis an anderer Stelle in der Eingabeaufforderung ändern nicht den für die Vervollständigung verwendeten Dateipfad.

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt in Qwen Code auszuführen.

| Befehlsformat     | Beschreibung                                                        | Beispiele                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Befehl in einer Sub-Shell ausführen                                       | `!ls -la`, `!git status`               |
| Standalone `!`     | Shell-Modus umschalten, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabe) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle [#4-custom-commands]

Speichere häufig verwendete Prompts als Shortcut-Befehle, um die Arbeitseffizienz zu steigern und Konsistenz sicherzustellen.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist deprecated, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Schneller Überblick

| Funktion         | Beschreibung                                | Vorteile                             | Priorität | Anwendungsfälle                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt doppelpunkt-benannte Befehle  | Bessere Befehlsorganisation            |          |                                                      |
| Globale Befehle  | `~/.qwen/commands/`                        | In allen Projekten verfügbar              | Niedrig      | Persönlich häufig verwendete Befehle, projektübergreifende Nutzung |
| Projekt-Befehle | `<project root directory>/.qwen/commands/` | Projektspezifisch, versionierbar | Hoch     | Team-Sharing, projektspezifische Befehle              |

Prioritätsregeln: Projekt-Befehle > Benutzer-Befehle (Projekt-Befehl wird verwendet, wenn die Namen identisch sind)

### Regeln für die Befehlsbenennung

#### Zuordnungstabelle: Dateipfad zu Befehlsname

| Dateispeicherort                            | Generierter Befehl | Beispielaufruf          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) wird in einen Doppelpunkt (`:`) umgewandelt

### Markdown-Dateiformatspezifikation (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| Feld         | Erforderlich | Beschreibung                              | Beispiel                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | Optional | Befehlsbeschreibung (wird in /help angezeigt) | `description: Code analysis tool`          |
| Prompt-Body   | Erforderlich | Prompt-Inhalt, der an das Modell gesendet wird             | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (Deprecated)

> [!warning]
>
> **Deprecated:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld         | Erforderlich | Beschreibung                              | Beispiel                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Erforderlich | Prompt-Inhalt, der an das Modell gesendet wird             | `prompt = "Please analyze code: {{args}}"` |
| `description` | Optional | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code analysis tool"`       |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode            | Syntax             | Anwendungsfälle                 | Sicherheitsfunktionen                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbewusste Injektion      | `{{args}}`         | Präzise Parametersteuerung erforderlich       | Automatisches Shell-Escaping               |
| Standard-Parameterverarbeitung | Keine spezielle Markierung | Einfache Befehle, Parameter anhängen | Unverändert anhängen                           |
| Shell-Befehlsinjektion      | `!{command}`       | Dynamische Inhalte erforderlich                 | Bestätigung der Ausführung vorher erforderlich |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode           | Tatsächliche Auswirkung            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Raw-Injektion    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| In Shell-Befehl | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Führt `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                      | Beispiel                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Hat Parameter  | An das Ende des Prompts anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Original-Prompt + Parameter |
| Keine Parameter   | Prompt unverändert senden                                      | `/cmd` → Original-Prompt                       |

🚀 Dynamische Content-Injektion

| Injektionstyp        | Syntax         | Verarbeitungsreihenfolge    | Zweck                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Dateiinhalt          | `@{file path}` | Wird zuerst verarbeitet     | Statische Referenzdateien injizieren    |
| Shell-Befehle        | `!{command}`   | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung | `{{args}}`     | Wird zuletzt verarbeitet      | Benutzerparameter injizieren           |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                       | Benutzerinteraktion     |
| ------------------------------- | -------------------- |
| 1. Befehl und Parameter analysieren | -                    |
| 2. Automatische Shell-Escapierung     | -                    |
| 3. Bestätigungsdialog anzeigen     | ✅ Benutzerbestätigung |
| 4. Befehl ausführen              | -                    |
| 5. Ausgabe in Eingabeaufforderung injizieren      | -                    |

Beispiel: Git-Commit-Nachrichtengenerierung

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhalt-Injektion (`@{...}`)

| Dateityp    | Unterstützungsstatus         | Verarbeitungsmethode           |
| ------------ | ---------------------- | --------------------------- |
| Textdateien   | ✅ Vollständige Unterstützung        | Inhalt direkt injizieren     |
| Bilder/PDF   | ✅ Multimodale Unterstützung | Kodieren und injizieren           |
| Binärdateien | ⚠️ Begrenzte Unterstützung     | Kann übersprungen oder gekürzt werden |
| Verzeichnis    | ✅ Rekursive Injektion | Folgt .gitignore-Regeln     |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Schritte-Tabelle zur Erstellung des "Pure Function Refactoring"-Befehls

| Vorgang                     | Befehl/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten       | Siehe den vollständigen Code unten.         |
| 4. Befehl testen               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Tabelle der Empfehlungen zur Befehlsgestaltung

| Praxispunkte      | Empfohlener Ansatz                | Zu vermeiden                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Befehlsbenennung       | Namensräume zur Organisation verwenden     | Übermäßig generische Namen vermeiden                  |
| Parameterverarbeitung | `{{args}}` explizit verwenden              | Sich auf das Standard-Anhängen verlassen (leicht verwirrend) |
| Fehlerbehandlung       | Shell-Fehlerausgabe nutzen          | Ausführungsfehler ignorieren                    |
| Dateiorganisation    | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Wurzelverzeichnis              |
| Beschreibungsfeld    | Immer klare Beschreibung bereitstellen    | Auf automatisch generierte Beschreibung verlassen          |

#### Erinnerungstabelle zu Sicherheitsfunktionen

| Sicherheitsmechanismus     | Schutzwirkung          | Benutzeraktion         |
| ---------------------- | -------------------------- | ---------------------- |
| Shell-Escapierung         | Verhindert Befehlsinjektion  | Automatische Verarbeitung   |
| Ausführungsbestätigung | Vermeiden versehentlicher Ausführung | Dialog-Bestätigung    |
| Fehlerberichterstattung        | Hilft bei der Diagnose von Problemen       | Anzeige von Fehlerinformationen |

## 5. CLI-Unterbefehle

Diese Befehle werden in der Shell als `qwen <subcommand>` ausgeführt, bevor eine interaktive Sitzung gestartet wird.

### Sitzungsverwaltung

| Befehl               | Beschreibung                                 | Anwendungsbeispiele                                            |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `qwen sessions list` | Zeigt die letzten Konversationssitzungen an  | `qwen sessions list`, `qwen sessions list --json --limit 50` |
| `qwen sessions ps`   | Zeigt aktuell laufende interaktive Sitzungen | `qwen sessions ps`, `qwen sessions ps --json`                |
| `qwen sessions controllers` | Vertrauenswürdige Controller-Tokens verwalten | `qwen sessions controllers add --label <name>`, `qwen sessions controllers list` |

#### `qwen sessions list`

Zeigt deine letzten Qwen Code-Sitzungen mit Metadaten an.

**Flags:**

| Flag      | Typ     | Standardwert | Beschreibung                                  |
| --------- | ------- | ------------ | --------------------------------------------- |
| `--json`  | boolean | `false`      | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile) |
| `--limit` | number  | `20`         | Maximale Anzahl der anzuzeigenden Sitzungen   |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: SESSION ID, STARTED (UTC-Zeitstempel), TITLE, BRANCH, PROMPT.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus. Jede Zeile ist ein JSON-Objekt mit den folgenden Feldern:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

Der Hinweis "has more sessions" wird über stderr ausgegeben, sodass das Piping zu `jq` sicher bleibt.

**Beispiele:**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

Listet die Qwen Code Sitzungsdatensätze auf, die auf diesem Rechner sichtbar sind. `sessions list` durchsucht gespeicherte Transkripte ("woran habe ich gearbeitet"). Dieser Befehl zeigt sowohl die Live-Prozess-Registrierung als auch Agent View-Datensätze, die mit `managed` markiert sind. Datensätze, die von einer beendeten Sitzung übrig geblieben sind, werden aus der Registrierung entfernt, sobald sie gefunden werden. Ein verwalteter Datensatz ist eine persistente Buchführung, kein Beweis dafür, dass sein Worker noch lebt. Eine einmalige `qwen -p`-Ausführung registriert sich nie und wird nicht angezeigt.

**Flags:**

| Flag     | Typ    | Standard | Beschreibung                                     |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile) |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: NAME, KIND, PID, AGE, DIRECTORY.

KIND gibt an, was die Sitzung registriert hat — `tui` für jemanden am Terminal, `external` für ein Programm, das gar keine Qwen Code Sitzung ist (eine Voice-Oberfläche, ein Relay), und `headless` oder `serve` für eine Sitzung, die von einem anderen Programm gesteuert wird. Mehrere `serve`- oder `headless`-Zeilen können sich eine PID teilen: Ein `qwen --acp`-Kind hostet alle seine Sitzungen in einem Prozess — `serve` wenn der Daemon es gestartet hat, `headless` wenn ein Client es direkt steuert — und jede davon registriert sich separat, wenn Peer-Messaging aktiv ist. Eine gehostete Sitzung registriert sich hier nicht, wenn ihre eigene Umgebung sie im Bare- oder Safe-Modus startet. Die `--bare` eines Daemons erreicht die gehosteten Sitzungen nicht (`QWEN_CODE_SIMPLE` wird aus der Kind-Umgebung entfernt); ein geerbtes `QWEN_CODE_SAFE_MODE` tut dies jedoch und hält diese gehosteten Sitzungen aus dieser Auflistung heraus. Es ist eine Selbstauskunft, wie NAME und DIRECTORY: Jedes Feld hier wurde von dem Prozess geschrieben, den es beschreibt, und nichts darüber, was eine Sitzung tun darf, hängt davon ab. Ein Agent View-Datensatz, der mit `managed` markiert ist, verwendet `managed` für KIND und `-` für PID und AGE. Er bleibt eine separate Zeile, wenn dieselbe Sitzung auch einen Live-Registrierungsdatensatz hat. Siehe [Cross-Session Protocol](./cross-session-protocol.md) für das Datensatzformat und dafür, wie du ein eigenes Programm registrierst.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus, wobei verwaltete Datensätze zuerst kommen. Registrierungsdatensätze behalten ihr bestehendes Format:

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (when peer messaging is available)
```

Eine verwaltete Aufzeichnung enthält nur quellengestützte Daten:

```
sessionId, cwd, managed: true
```

Nichts anderes wird auf stdout geschrieben – eine leere Liste druckt gar nichts – daher ist `qwen sessions ps --json | jq .` sicher für Skripting geeignet. Wenn der Supervisor-Store nicht gelesen werden kann, werden Registrierungsdatensätze trotzdem ausgegeben und der Grund wird auf stderr geschrieben.

JSON-Ausgabe ist Rohdaten: Feldwerte werden genau so ausgegeben, wie sie aufgezeichnet wurden, ohne Terminal-Bereinigung. Behandle sie als Daten und bereinige sie vor der Darstellung im Terminal.

**Beispiele:**

```bash
# Show the other live sessions
qwen sessions ps

# Which directories have a visible session record?
# Note: `jq -r` renders the raw recorded value in your terminal (see the
# raw-data note above); pipe through a sanitizer if the path is untrusted.
qwen sessions ps --json | jq -r .cwd
```

## 6. Messaging einer anderen laufenden Sitzung [#6-messaging-another-running-session]

Zwei interaktive Sitzungen auf demselben Rechner können sich gegenseitig Nachrichten senden. Die Funktion ist **standardmäßig aktiviert**, aber `--bare` und `--safe-mode` deaktivieren sie unabhängig von der Einstellung. Mit einem lauschenden Posteingang ist eine Sitzung für andere Sitzungen desselben Benutzers auf dem Rechner auffindbar, und was sie senden, durchläuft die unten stehenden Prüfregeln, bevor das Modell irgendetwas davon sieht. Um Peer-Erkennung und Messaging zu deaktivieren, schalte es in `settings.json` aus und starte neu:

```json
{ "agents": { "crossSessionMessaging": false } }
```

Eine interaktive Sitzung mit deaktiviertem Peer-Messaging kann weiterhin in `qwen sessions ps` erscheinen, hat aber keinen `ipcPath` und ist kein erreichbarer Peer in `list_agents`. Die OpenTUI-Oberfläche bindet ebenfalls keinen Peer-Posteingang; das Aktivieren der Einstellung allein macht sie nicht nachrichtenfähig.

Bei aktivierter Nachrichtenübermittlung kann das Modell in einer Sitzung die anderen mit `list_agents` entdecken — jeder erscheint unter `sessions` mit dem `name`, den `qwen sessions ps --json` aufzeichnet (die Tabellenansicht kann lange Namen kürzen) — und adressiert einen mit `send_message` unter Verwendung dieses Namens als `to`. Wenn zwei Sitzungen denselben Namen teilen, zeigt `list_agents` jeden mit einem kurzen `[ref]` an, und die Sendung muss diesen enthalten (`name [ref]`); ein bloßer Name, der beide meinen könnte, wird abgelehnt statt geraten. `list_agents` meldet auch den eigenen Namen der Sitzung unter `self`, und `to: "*"` bedeutet weiterhin "meine Agent Team-Mitglieder" und erreicht niemals andere Sitzungen.

Eine Nachricht trifft in der anderen Sitzung markiert als von einer anderen Sitzung kommend ein, nicht von deren Benutzer, und trägt dort keine Ihrer Berechtigungen: Die empfangende Sitzung handelt nur innerhalb ihrer eigenen Berechtigungseinstellungen darauf. Ihr Benutzer kann mit `agents.crossSessionInbound` (`accept`, `hold` oder `refuse`) wählen, was mit eingehenden Nachrichten geschieht. Wenn nicht festgelegt, wird eine Nachricht nur zugestellt, wenn sich beide Sitzungen in derselben Prüfklasse befinden: Beide prüfen noch jede Aktion (Standard- oder Planmodus), oder beide sind in einem Modus, der einige Aktionen ohne Einzelprüfung anwendet (auto-edit, auto oder yolo). Eine Nachricht aus einer Sitzung der anderen Klasse oder von einem Absender, der seine Klasse nicht angibt, wird zur Prüfung zurückgehalten — in beide Richtungen. Eine Sitzung, die jede Aktion prüft, hält eine Nachricht von einer zurück, die dies nicht tut, weil diese Nachricht von einem Modell geschrieben wurde, das niemand beobachtete, und die Einzelaktions-Prompts schützen Aktionen, nicht das, wozu die Sitzung überredet wird. Zurückgehaltene Nachrichten werden in der empfangenden Sitzung mit `/peers` aufgelistet und freigegeben, und eine Nachricht, die nur wegen unterschiedlicher Modi zurückgehalten wurde, wird automatisch freigegeben, sobald sie übereinstimmen.

Ein Repository kann Sitzungen, die darin geöffnet werden, vorsichtiger machen, niemals weniger: Ein Workspace-`.qwen/settings.json` kann `agents.crossSessionInbound` auf `hold` oder `refuse` setzen, oder `agents.crossSessionMessaging` auf `false`, und dieser Wert hat Vorrang vor einem lockereren in Ihren Benutzereinstellungen. Ein Workspace-Wert, der einen vom Operator gesetzten Wert lockern würde (`accept`, oder `true` für den Schalter, wenn ein Benutzer- oder Systembereich ihn auf `false` gesetzt hat), wird mit einer Warnung ignoriert; ein Workspace-`true`, bei dem nichts anderes den Schalter gesetzt hat, wiederholt lediglich den Standardwert und wird stillschweigend verworfen. Ein Wert, den die CLI nicht erkennt, hält jede Nachricht zurück, wann immer er der wirksame Wert ist. Systemeinstellungen setzen all dies außer Kraft, wie bei jeder Einstellung.

Ein Rückhalt wartet nicht ewig. Eine Nachricht, über die niemand entscheidet, verfällt nach `agents.crossSessionHeldExpiry` — `1m`, `5m`, `10m` oder `never`, standardmäßig fünf Minuten — und der sendenden Sitzung wird mitgeteilt, dass keine Entscheidung erging. Das Verkürzen der Einstellung gilt auch für bereits wartende Nachrichten.

Wenn die Sitzung ihren Posteingang nicht binden kann — das Laufzeitverzeichnis fehlt, gehört einem anderen Benutzer oder ist schreibgeschützt, wie es in einem Container sein kann — versucht sie zuerst ein privates Verzeichnis unter dem Temp-Verzeichnis, und startet nur dann ohne eines, wenn auch das fehlschlägt. Wenn dies passiert, teilt die Sitzung dies beim Start mit, und `/peers` wiederholt den Grund und was zu ändern ist (normalerweise `XDG_RUNTIME_DIR` oder `TMPDIR`).

Zwei Sitzungen können auch dieselbe Posteingangsadresse auflösen, da die Adresse nach Prozess-ID indiziert ist und Prozess-IDs sich über Container hinweg wiederholen, die ein Laufzeitverzeichnis teilen. Die zweite startende Sitzung nimmt stattdessen eine benachbarte Adresse, um die belegte nicht zu übernehmen, sodass keine unerreichbar wird. Peers sind unaffected: Sie lesen die Adresse einer Sitzung aus der Sitzungsregistrierung, statt sie abzuleiten.

Der `send_message`-Aufruf bestätigt nur, dass die Nachricht an die andere Sitzung übergeben wurde. Was daraus wurde, kommt später als Beleg: Wenn sie zurückgehalten, abgelehnt, verweigert, verworfen, verfallen oder falsch adressiert war (die Adresse wechselte die Hände — listen Sie die Agents erneut auf) — oder nach einem Rückhalt freigegeben wurde — erscheint ein Hinweis im Transkript der sendenden Sitzung (`Message to <name>: …`). Abgelehnt, verweigert und verworfen sind drei verschiedene Antworten: abgelehnt bedeutet, dass jemand die Nachricht prüfte und nein sagte, verweigert bedeutet, dass der `agents.crossSessionInbound` dieser Sitzung `refuse` ist und niemand sie überhaupt sah, und verworfen bedeutet, dass ihr Posteingang die Nachricht vor alledem abwies (siehe unten). Der erste Verwurf wird sofort beantwortet und die übrigen werden alle paar Sekunden in einen Beleg zusammengefasst, der jeweils die Nachrichten nennt, für die er steht, sodass eine Serie davon einige Zeilen kostet statt eine pro Stück. Dem Modell, das sie sandte, wird nichts gesagt; wenn die andere Sitzung antwortet, kommt die Antwort als sitzungsübergreifende Nachricht.

### Schutz gegen Überflutung

Eine Sitzung akzeptiert bis zu 30 Nachrichten gleichzeitig von einem Absender und dann eine alle zwei Sekunden sowie bis zu 32 gleichzeitig von allen Absendern zusammen und dann eine pro Sekunde. Das zweite Limit existiert, weil sich ein Absender selbst benennt: Durch das Rotieren dieses Namens erhält man ein neues Kontingent für das erste Limit, aber nicht für das zweite. Es liegt knapp über dem ersten, da jede akzeptierte Nachricht eine Empfangsbestätigung auslöst und eine Sitzung nur eine begrenzte Anzahl solcher Bestätigungen gleichzeitig senden kann. Eine Nachricht aus einer anderen Sitzung, die die vorherige Nachricht desselben Absenders innerhalb von 30 Sekunden wortwörtlich wiederholt, wird ebenfalls abgewiesen – ein Modell, das in einer Schleife bei einem Satz hängt, erzeugt jedes Mal eine neue Nachrichten-ID, daher ist der Text entscheidend für die Erkennung. Nachrichten von einem Skript, das die Sitzung gestartet hat, und von einem vertrauenswürdigen Controller sind von der Wiederholungsprüfung ausgenommen, da ein Hook, der dieselbe Zeile zweimal meldet, zwei Fakten meldet, und wenn eine Person zweimal "continue" sagt, meint sie es auch zweimal; beide unterliegen weiterhin den Ratenlimits. Schließlich wird auch eine Nachricht abgewiesen, die zwar akzeptiert wurde, aber nicht in die Warteschlange gestellt werden kann, weil die Sitzung bereits 50 wartende Nachrichten enthält.

Eine auf diese Weise abgewiesene Nachricht wird niemals gespeichert, niemals dem Modell angezeigt und hinterlässt keine Aufzeichnung, sodass der Absender es später erneut versuchen und Erfolg haben kann. Die empfangende Sitzung vermerkt dies höchstens einmal pro Minute pro Absender in ihrem Transkript, mit einer Zählung dessen, wofür diese Zeile steht. Die sendende Sitzung erhält eine Empfangsbestätigung, die jede Nachricht auflistet, die der Burst gekostet hat, und ihr Transkript weist an, was noch relevant ist, in einer späteren Nachricht zusammenzufassen, anstatt sie erneut zu senden.

Die sendende Seite wartet nicht auf eine Rückmeldung. Jede Sitzung verfolgt, was sie an jede Adresse gesendet hat, und lehnt einen Sendevorgang ab, den der Empfänger verwerfen würde, sodass das Modell angewiesen wird, Nachrichten zu bündeln, bevor die Nachricht geschrieben wird, und nicht danach – und der Empfänger verwendet niemals eine Verbindung für eine Nachricht, die er ohnehin ablehnen würde.

### Inbox-Authentifizierung und skriptgesteuerte Injektion

Der Posteingang jeder Sitzung erfordert ein sitzungsspezifisches Token: Eine Verbindung muss es in ihrer ersten Zeile angeben, bevor irgendeine Nachricht gelesen wird, und Sitzungen tauschen Tokens automatisch über dieselben Registrierungsdatensätze aus, über die sie sich gegenseitig entdecken. Sitzungen aus einem Build ohne Token-Unterstützung können von einer neueren Sitzung empfangen, aber ihre Sendeversuche an diese werden verworfen.

Eine Sitzung exportiert ihre eigene Posteingangsadresse und ein Token als Kindprozesse unter `QWEN_CODE_MESSAGING_SOCKET` und `QWEN_CODE_MESSAGING_TOKEN`, sodass ein Skript oder Hook, den die Sitzung ausführt, eine Nachricht zurücksenden kann. Dies ist ein zweites, _Kind_-Token, das nirgendwo veröffentlicht wird: Nur Prozesse, die die Sitzung gestartet hat, können es besitzen, sodass eine Nachricht, die damit eintrifft, als eigene Nachricht der Sitzung erkannt wird und nicht als Nachricht einer anderen Sitzung.

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

Geben Sie jeder Injektion eine neue `msgId`. Das empfangende Gate merkt sich die IDs, die es bereits bearbeitet hat, sodass ein Hook, der eine ID wiederverwendet, beim ersten Mal zugestellt und bei jedem weiteren Lauf stillschweigend dedupliziert wird. Die Wiederholung desselben _Textes_ ist in Ordnung – die oben genannte Wiederholungsprüfung gilt nicht für die eigenen Prozesse einer Sitzung –, aber die Ratenlimits gelten weiterhin, sodass ein Hook in einer Schleife wie jeder andere Flood verworfen wird.

Eine injizierte Nachricht durchläuft weiterhin das eingehende Gate und wird als nicht vom Benutzer stammend markiert, aber das Gate weiß, dass sie vom eigenen Prozess der Sitzung stammt: Unter der Standard-Einstellung zur Modus-Parität wird sie ohne Überprüfung zugestellt (ein Peer in derselben Position würde angehalten), während eine explizite `agents.crossSessionInbound` von `hold` oder `refuse` darauf angewendet wird wie auf alles andere. Das Modell sieht sie als `<cross_session_message from="own process" origin="own-process">` mit einem Hinweis, dass sie von einem Skript oder Hook stammt, den die Sitzung ausgeführt hat, und nicht vom Benutzer.

### Vertrauenswürdige Controller [#trusted-controllers]

Die obige Regel hält eine Nachricht von jedem Absender an, der nicht angibt, welcher Überprüfungsklasse er angehört, und ein Programm, das keine Qwen Code-Sitzung ist, hat keine solche Angabe. Das ist der richtige Standard für einen Fremden, aber nicht für ein Programm, das Sie ausgewählt haben: Ein Sprach-Frontend, eine Diktierbrücke, ein Automatisierungs-Daemon, der Ihre eigenen Anweisungen weiterleitet, würde jede Nachricht parken lassen, und jede einzelne manuell zu genehmigen, widerspricht dem Zweck.

Sie gewähren einem solchen Programm Zustellung, indem Sie ihm ein Token ausstellen:

```bash
qwen sessions controllers add --label voice-bridge
```

Das Token wird einmal gedruckt und nirgends gespeichert: Die Datei unter Ihrem Qwen-Home-Basisverzeichnis behält nur seinen SHA-256-Hash, sodass nichts, das diese Datei später liest, das Token präsentieren kann. Fügen Sie es in die Konfiguration des Controllers selbst ein, wenn der Befehl es druckt.

Ein Controller präsentiert das Token so wie jeder andere Absender – als erste Zeile der Verbindung – und bezieht den Socket-Pfad aus der Sitzungsregistrierung (`qwen sessions ps --json` druckt einen Datensatz pro aktiver Sitzung, wobei `ipcPath` die Adresse ist):

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

Eine Nachricht, die auf einem gewährten Token eintrifft, wird ohne nachrichtenspezifische Überprüfung zugestellt, unabhängig davon, in welcher Überprüfungsklasse sich beide Seiten befinden – aber sie weicht dennoch einer expliziten Einstellung: Ein `agents.crossSessionInbound` von `hold` parkt sie wie alles andere, und `refuse` weist sie ab. Gewährung gehören zu Ihrem Qwen-Home-Basisverzeichnis und nicht zu einer einzelnen Sitzung, sodass ein Controller jede Sitzung erreicht, die Sie ausführen, und Sitzungen lesen die Datei bei jeder Verbindung neu: Das Ausstellen oder Widerrufen einer Gewährung tritt bei der nächsten Verbindung in Kraft, ohne dass etwas neu gestartet werden muss.

```bash
qwen sessions controllers list          # ids, labels, when they were added
qwen sessions controllers remove c_1a2b # revoke one
```

`/peers controllers` und `/peers revoke <id>` tun dasselbe innerhalb einer Sitzung. Eine Nachricht, die über eine Berechtigung empfangen wurde, wird als `Message from a trusted controller (voice-bridge)` angezeigt und erscheint in `/peers` als `[controller] voice-bridge`, wenn eine `hold`-Einstellung sie geparkt hat.

Das Modell sieht eine solche Nachricht als `<cross_session_message from="controller" origin="controller" controller="voice-bridge">` mit dem Hinweis, dass sie Ihre eigenen Anweisungen weiterleitet – und es gelten dieselben beiden Verbote wie für alle anderen Ursprünge: Es darf keine Berechtigungseinstellungen, QWEN.md oder Konfigurationen bearbeiten, nur weil die Nachricht dies verlangt, und es darf die Nachricht nicht so behandeln, als hätten Sie eine ausstehende Bestätigungsanfrage genehmigt. Ein Controller kann sagen, was als Nächstes zu tun ist; er kann aber nicht eine Anfrage an Ihrer Stelle beantworten.

Jeder, der das Token besitzt, kann als dieser Controller senden, daher sollte es wie jedes andere Zugangsdatum behandelt werden: Übergeben Sie es nur einem Programm, halten Sie es aus geteilten Konfigurationen fern und widerrufen Sie es, wenn das Programm fertig ist.

### Sitzungen, die von einem Programm über ACP gesteuert werden

Jedes `qwen --acp`-Kind registriert jede von ihm gehostete Sitzung – als `serve`, wenn der Daemon den Prozess gestartet hat, als `headless`, wenn ein Editor oder ein anderer Client `qwen --acp` direkt steuert – und die Sitzung erscheint in `qwen sessions ps` und im `list_agents` einer anderen Sitzung wie jede andere auch. Sie kann senden: Ihr Modell kann `send_message` aufrufen, um ein Terminal zu erreichen, das Sie geöffnet haben. Mehrere davon teilen sich einen Prozess und einen Posteingang, daher muss ein Absender die gemeinte Sitzung benennen – jede Qwen Code-Sitzung tut dies automatisch.

Nachrichten, die _an_ eine solche Sitzung gesendet werden, werden abgelehnt statt gehalten. Das Halten ist eine Frage an eine Person, und niemand beobachtet eine Liste gehaltener Nachrichten im Auftrag einer gesteuerten Sitzung; ein Absender wird sofort informiert, statt auf einen Ablauf zu warten. Wo eine gehaltene Nachricht für diese Sitzungen erscheinen sollte, ist noch nicht geklärt.

Eine Sitzung registriert sich, es sei denn, ihre eigenen Einstellungen schalten `agents.crossSessionMessaging` aus, oder sie wurde mit `--bare` oder `--safe-mode` gestartet – diese schalten die Messaging-Funktion unabhängig von der Einstellung aus. Wenn deaktiviert, bleibt sie unsichtbar, denn der einzige Grund, eine Sitzung aufzulisten, die niemand anschreiben kann, wäre, eine Adresse zu bewerben, die nie antwortet.

### Programme, die keine Qwen Code-Sitzungen sind

Alles oben Genannte funktioniert zwischen Sitzungen, aber nichts davon ist spezifisch für eine Sitzung. Ein Programm, das einen Registrierungseintrag für sich selbst schreibt und einen Posteingang auf dieselbe Weise bindet, wird von `qwen sessions ps` und von `list_agents` aufgelistet, kann von `send_message` aus namentlich angesprochen werden und erhält Zustellbestätigungen für das, was es sendet – eine Sprachfront-End, ein Relay, ein Build-Watcher. Es sollte `kind: "external"` erfassen, damit eine Auflistung angeben kann, was es ist.

[Cross-Session Protocol](./cross-session-protocol.md) ist der Vertrag für die Implementierung eines solchen Programms: das Datenschema und wie die Aktivität beurteilt wird, die Socket-Pfade und das Framing, die Authentifizierungszeile, jedes Frame-Feld, die Zustände der Bestätigungen und deren Übergänge sowie was ein Empfänger mit einer Nachricht tut, bevor sein Modell sie sieht.

Ein Node-Programm muss nichts davon manuell implementieren: `@qwen-code/sdk/peer` setzt den Vertrag um. `PeerEndpoint.start({ name })` veröffentlicht den Eintrag und bindet den Posteingang, `list()` und `send()` adressieren Sitzungen nach Namen, und `onMessage` empfängt, was sie senden.
