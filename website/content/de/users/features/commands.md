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

| Befehl | Beschreibung | Nutzungsbeispiele |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear` | Konversationsverlauf löschen und Kontext freigeben | `/clear`, `/reset`, `/new` |
| `/context` | Aufschlüsselung der Kontextfenster-Nutzung anzeigen | `/context` |
| → `detail` | Aufschlüsselung der Kontextnutzung pro Element anzeigen | `/context detail` |
| `/history` | Einstellungen für die Verlaufsanzeige und Sichtbarkeit steuern | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff` | Öffnet einen interaktiven Diff-Viewer, der uncommitted Änderungen und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um Dateien zu durchsuchen | `/diff` |
| `/log` | Öffnet einen Commit-Verlauf-Viewer für den Workspace (nur Web Shell) | `/log` |
| `/theme` | Visuelles Theme von Qwen Code ändern | `/theme` |
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

| Befehl | Beschreibung | Nutzungsbeispiele |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | Konfigurierte MCP-Server und -Tools auflisten | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | MCP-Server aus Claude-Konfigurationen importieren | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | Aktuell verfügbare Tool-Liste anzeigen | `/tools`, `/tools desc` |
| `/skills` | Das Skills-Panel öffnen, um Skills zu durchsuchen, zu suchen, umzuschalten und zu starten | `/skills`, `/<skill-name>` |
| `/learn` | Einen wiederverwendbaren Projekt-Skill aus einer Datei, einem Verzeichnis, einer URL, einem Video oder Text erstellen | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment` |
| `/curator` | Inaktive Projekt-Auto-Skills inspizieren, pinnen, archivieren oder wiederherstellen | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>` |
| `/plan` | In den Plan-Modus wechseln oder den Plan-Modus beenden | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | Den Genehmigungsmodus ändern (nur aktuelle Sitzung) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | Nur Analyse, keine Ausführung (sichere Überprüfung) | `/approval-mode plan` |
| → `default` | Genehmigung für Änderungen erforderlich (tägliche Nutzung) | `/approval-mode default` |
| → `auto-edit` | Änderungen automatisch genehmigen (vertrauenswürdige Umgebung) | `/approval-mode auto-edit` |
| → `auto` | Vom Classifier bewertete Genehmigung (autonom) | `/approval-mode auto` |
| → `yolo` | Alles automatisch genehmigen (schnelles Prototyping) | `/approval-mode yolo` |
| `/peers` | Zurückgehaltene Peer-Nachrichten prüfen; vertrauenswürdige Controller verwalten | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>` |
| `/model` | In der aktuellen Sitzung verwendetes Modell wechseln | `/model`, `/model <model-id>` (sofortiger Wechsel) |
| `/model --fast` | Ein leichteres Modell für Prompt-Vorschläge festlegen | `/model --fast qwen3-coder-flash` |
| `/model --voice` | Das für die Sprachtranskription verwendete Modell festlegen | `/model --voice <model-id>` |
| `/model --vision` | Das Vision-Bridge-Modell festlegen, das verwendet wird, um Bilder für ein reines Text-Hauptmodell zu transkribieren | `/model --vision <model-id>` |
| `/model --compaction` | Das für die Chat-Komprimierung verwendete Modell festlegen | `/model --compaction <model-id>`, `/model --compaction clear` |
| `/model --image` | Ein Modell mit Bildgenerierungsfähigkeit für das integrierte Bildgenerierungs-Tool festlegen | `/model --image <model-id>` |
| `/effort` | Reasoning-Aufwand für denkfähige Modelle festlegen | `/effort` (öffnet Picker), `/effort high` (low/medium/high/xhigh/max; wird je nach Provider gemappt und begrenzt) |
| `/output-style` | Wähle den Ausgabestil, der bestimmt, wie Antworten formuliert werden | `/output-style` (öffnet Picker), `/output-style Concise`, `/output-style default` (kein Stil) |
| `/extensions` | Extensions verwalten | `/extensions list`, `/extensions manage` |
| → `list` | Installierte Extensions auflisten | `/extensions list` |
| → `manage` | Installierte Extensions verwalten (interaktiv) | `/extensions manage` |
| → `explore` | Extensions-Seite im Browser öffnen | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | Eine Extension aus einem Git-Repo oder Pfad installieren | `/extensions install <repo-or-path>` |
| `/memory` | Den Memory-Manager-Dialog öffnen | `/memory` |
| `/remember` | Einen dauerhaften Memory-Eintrag speichern | `/remember Prefer terse responses` |
| `/forget` | Passende Einträge aus dem Auto-Memory entfernen | `/forget <query>` |
| `/dream` | Auto-Memory-Konsolidierung manuell ausführen | `/dream` |
| `/hooks` | Qwen Code-Hooks verwalten | `/hooks`, `/hooks list` |
| `/reload-plugins` | Extension-Änderungen (Befehle, Skills, Agenten, Hooks, MCP/LSP-Server) von der Festplatte neu laden | `/reload-plugins` |
| `/permissions` | Berechtigungsregeln verwalten | `/permissions` |
| `/agents` | Subagenten verwalten | `/agents manage`, `/agents create` |
| `/arena` | Arena-Sitzungen verwalten | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (Alias `choose`) |
| `/goal` | Ein Ziel festlegen – weiterarbeiten, bis ein Verifizierer es bestätigt (siehe [Goals](./goals.md)) | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear` |
| `/tasks` | Hintergrundtasks auflisten | `/tasks` |
| `/workflows` | Workflow-Ausführungen inspizieren; einen Hintergrundlauf kooperativ pausieren/fortsetzen | `/workflows`, `/workflows <runId>`, `/workflows p <runId>` |
| `/lsp` | LSP-Server-Status anzeigen | `/lsp` |
| `/trust` | Einstellungen für die Ordner-Vertrauenswürdigkeit verwalten | `/trust` |
> [!warning]
>
> Installiere Erweiterungen (`/extensions install`) nur aus Quellen, denen du vertraust. Erweiterungen können MCP-Server, Skills und Commands bündeln, die mit denselben Berechtigungen wie Qwen Code selbst ausgeführt werden – sie können auf deine Dateien, API-Keys und Konversationsdaten zugreifen. `/extensions install` fordert keine Bestätigung an.

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

| Befehl       | Beschreibung                                                | Anwendungsbeispiele                               |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Multi-Agent-Code-Review (12 parallele Agenten bei hohem Aufwand) | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | Read-only-Worker und einen optionalen Worktree-Writer koordinieren | `/coordinate investigate and fix the authentication regression`           |
| `/loop`      | Einen Prompt nach einem wiederkehrenden Zeitplan ausführen  | `/loop 5m check the build`                        |
| `/goal-draft` | Eine vage Intention in ein überprüfbares `/goal`-Ziel verwandeln | `/goal-draft make the auth tests pass`            |
| `/simplify`  | Kürzliche Änderungen prüfen und sichere Bereinigungs-Edits direkt anwenden | `/simplify`, `/simplify focus on duplication`     |
| `/qc-helper` | Beantwortet Fragen zur Nutzung und Konfiguration von Qwen Code | `/qc-helper how do I configure MCP?`              |

Siehe [Code Review](./code-review.md) für die vollständige `/review`-Dokumentation.

### 1.6 Zwischenfrage (`/btw`)

Der Befehl `/btw` ermöglicht es dir, schnelle Zwischenfragen zu stellen, ohne den Hauptkonversationsfluss zu unterbrechen oder zu beeinträchtigen.

| Befehl                 | Beschreibung                          |
| ---------------------- | ------------------------------------- |
| `/btw <deine frage>`   | Eine schnelle Zwischenfrage stellen   |
| `?btw <deine frage>`   | Alternative Syntax für Zwischenfragen |

**Funktionsweise:**

- Die Zwischenfrage wird als separater API-Call mit aktuellem Konversationskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird über dem Composer angezeigt – du kannst während des Wartens weiterschreiben
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Antwort auf die Zwischenfrage wird **nicht** Teil des Hauptkonversationsverlaufs
- Antworten werden mit voller Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)

**Tastenkürzel (Interaktiver Modus):**

| Tastenkürzel           | Aktion                                                |
| -------------------- | --------------------------------------------------- |
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
| ACP (Agent Protocol) | Gibt `stream_messages` Async-Generator zurück |

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

Der Befehl `/recap` erstellt eine kurze "Wo du stehengeblieben bist"-Zusammenfassung der aktuellen Session, damit du eine alte Konversation fortsetzen kannst, ohne seitenweise durch den Verlauf scrollen zu müssen.

| Befehl   | Beschreibung                               |
| -------- | ------------------------------------------ |
| `/recap` | Generiert und zeigt eine einzeilige Session-Zusammenfassung |

**Funktionsweise:**

- Verwendet das konfigurierte Fast Model (Einstellung `fastModel`), falls verfügbar, und fällt andernfalls auf das Haupt-Sessionsmodell zurück. Ein kleines, günstiges Modell reicht für ein Recap völlig aus.
- Die aktuelle Konversation (bis zu 30 Nachrichten, nur Text – Tool-Calls und Tool-Antworten werden herausgefiltert) wird mit einem strikten System-Prompt an das Modell gesendet.
- Das Recap wird in gedimmter Farbe mit einem `❯`-Präfix gerendert, damit es sich von echten Assistant-Antworten abhebt.
- Lehnt mit einem Inline-Fehler ab, wenn ein Model-Turn gerade läuft oder ein anderer Befehl verarbeitet wird. Wenn keine nutzbare Konversation vorhanden ist oder die zugrunde liegende Generierung fehlschlägt, zeigt `/recap` eine kurze Info-Nachricht anstelle eines Recaps – der manuelle Befehl antwortet immer mit irgendetwas.

**Auto-Trigger bei Rückkehr aus Abwesenheit:**

Wenn das Terminal für **mehr als 5 Minuten** den Fokus verliert und wieder fokussiert wird, wird automatisch ein Recap generiert und angezeigt (nur, wenn gerade keine Modellantwort läuft; andernfalls wartet es, bis der aktuelle Turn abgeschlossen ist, und wird dann ausgelöst). Im Gegensatz zum manuellen Befehl ist der Auto-Trigger bei Fehlern völlig still: Wenn die Generierung fehlschlägt oder es nichts zusammenzufassen gibt, wird keine Nachricht zum Verlauf hinzugefügt. Gesteuert wird dies durch die Einstellung `general.showSessionRecap` (Standard: `false`); der manuelle Befehl `/recap` funktioniert immer, unabhängig von dieser Einstellung.

**Beispiel:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Konfiguriere ein Fast Model über `/model --fast <model>` (z. B. `qwen3-coder-flash`), um `/recap` schnell und kostengünstig zu machen. Setze `general.showSessionRecap` auf `true`, um den Auto-Trigger zu aktivieren; der manuelle Befehl `/recap` funktioniert immer, unabhängig von dieser Einstellung.

### 1.9 Diff Viewer (`/diff`)

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

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt in Qwen Code auszuführen.

| Befehlsformat     | Beschreibung                                                        | Beispiele                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Befehl in einer Sub-Shell ausführen                                       | `!ls -la`, `!git status`               |
| Standalone `!`     | Shell-Modus umschalten, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabe) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

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

### Markdown-Dateiformat-Spezifikation (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Dein Prompt-Inhalt hier.
Verwende {{args}} für die Parameter-Injektion.
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
| 1. Befehl und Parameter parsen | -                    |
| 2. Automatisches Shell-Escaping     | -                    |
| 3. Bestätigungsdialog anzeigen     | ✅ Benutzerbestätigung |
| 4. Befehl ausführen              | -                    |
| 5. Ausgabe in Prompt injizieren      | -                    |

Beispiel: Git-Commit-Message-Generierung

````markdown
---
description: Generiert eine Commit-Message basierend auf gestageten Änderungen
---

Bitte generiere eine Commit-Message basierend auf dem folgenden Diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhalt-Injektion (`@{...}`)

| Dateityp    | Support-Status         | Verarbeitungsmethode           |
| ------------ | ---------------------- | --------------------------- |
| Textdateien   | ✅ Voller Support        | Inhalt direkt injizieren     |
| Bilder/PDF   | ✅ Multimodaler Support | Kodieren und injizieren           |
| Binärdateien | ⚠️ Eingeschränkter Support     | Können übersprungen oder gekürzt werden |
| Verzeichnis    | ✅ Rekursive Injektion | Folgt den .gitignore-Regeln     |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Reviewe {{args}}, Referenzstandards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Schrittetabelle für die Erstellung des "Pure Function Refactoring"-Befehls

| Vorgang                     | Befehl/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten       | Siehe den vollständigen Code unten.         |
| 4. Befehl testen               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Code in eine Pure Function refaktorisieren
---

Bitte analysiere den Code im aktuellen Kontext und refaktoriere ihn zu einer Pure Function.
Anforderungen:

1. Refaktorisierten Code bereitstellen
2. Wichtige Änderungen und die Implementierung der Pure-Function-Charakteristika erklären
3. Funktion unverändert lassen
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Empfehlungstabelle für das Befehlsdesign

| Praxispunkte      | Empfohlener Ansatz                | Vermeiden                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Befehlsbenennung       | Namespaces zur Organisation verwenden     | Übermäßig generische Namen vermeiden                  |
| Parameterverarbeitung | `{{args}}` explizit verwenden              | Sich auf das Standard-Anhängen verlassen (leicht verwirrend) |
| Fehlerbehandlung       | Shell-Fehlerausgabe nutzen          | Ausführungsfehler ignorieren                    |
| Dateiorganisation    | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Stammverzeichnis              |
| Beschreibungsfeld    | Immer eine klare Beschreibung angeben    | Sich auf automatisch generierte Beschreibungen verlassen          |
#### Zusammenfassung der Sicherheitsfunktionen

| Sicherheitsmechanismus   | Schutzwirkung                | Benutzeraktion           |
| ------------------------ | ---------------------------- | ------------------------ |
| Shell Escaping           | Verhindert Command Injection | Automatische Verarbeitung|
| Ausführungsbestätigung   | Verhindert versehentliche Ausführung | Bestätigung im Dialog  |
| Fehlerausgabe            | Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |

## 5. CLI-Subbefehle

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
# Zeigt die letzten 20 Sitzungen an (Standard)
qwen sessions list

# Zeigt die letzten 50 Sitzungen an
qwen sessions list --limit 50

# Ausgabe als JSON für Skripte
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

Zeigt die interaktiven Qwen Code-Sitzungen an, die gerade auf diesem
Rechner laufen. `sessions list` durchsucht gespeicherte Transkripte ("woran
habe ich gearbeitet"); dies durchsucht das Live-Prozess-Register ("was läuft
gerade"). Zurückgelassene Records einer beendeten Sitzung werden beim
Auffinden bereinigt. Headless-Sitzungen (`qwen -p`) registrieren sich nicht
im Live-Prozess-Register und werden daher nicht angezeigt.

**Flags:**

| Flag     | Typ     | Standardwert | Beschreibung                                  |
| -------- | ------- | ------------ | --------------------------------------------- |
| `--json` | boolean | `false`      | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile) |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: NAME, KIND, PID, AGE, DIRECTORY.

KIND beschreibt, was die Session registriert hat – `tui` für jemanden an einem Terminal, `external` für ein Programm, das gar keine Qwen Code-Session ist (ein Voice-Frontend, ein Relay), und `headless` oder `serve` für eine Session, die von einem anderen Programm gesteuert wird. Mehrere `serve`- oder `headless`-Zeilen können sich eine PID teilen: ein `qwen --acp`-Kind hostet alle seine Sessions in einem Prozess – `serve`, wenn der Daemon es gespawnt hat, `headless`, wenn ein Client es direkt steuert – und jede davon registriert sich separat. Es ist ein Self-Report, wie NAME und DIRECTORY: jedes Feld hier wurde von dem Prozess geschrieben, den es beschreibt, und nichts darüber, was eine Session tun darf, hängt davon ab. Siehe [Cross-Session Protocol](./cross-session-protocol.md) für das Record-Format und wie man ein eigenes Programm registriert.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus, neueste Sitzung zuerst. Jede Zeile ist ein
JSON-Objekt mit den folgenden Feldern:

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (wenn Peer-Messaging verfügbar ist)
```

Nichts anderes wird auf stdout geschrieben – eine leere Auflistung gibt
überhaupt nichts aus – daher ist `qwen sessions ps --json | jq .` sicher
zum Skripten.

JSON-Ausgabe sind Rohdaten: Feldwerte werden genau wie aufgezeichnet
ausgegeben, ohne Terminal-Sanitization. Behandle sie als Daten und
sanitiere sie vor dem Rendern in einem Terminal.

**Beispiele:**

```bash
# Zeigt die anderen Live-Sitzungen
qwen sessions ps

# Welche Verzeichnisse sind gerade belegt?
# Hinweis: `jq -r` gibt den rohen aufgezeichneten Wert in deinem Terminal
# aus (siehe Rohdaten-Hinweis oben); pipe durch einen Sanitizer, wenn der
# Pfad nicht vertrauenswürdig ist.
qwen sessions ps --json | jq -r .cwd
```

## 6. Nachrichten an eine andere laufende Session senden

Zwei interaktive Sessions auf demselben Rechner können sich gegenseitig
Nachrichten senden. Die Funktion ist experimentell und **standardmäßig
ausgeschaltet**; aktiviere sie in `settings.json` und starte neu:

```json
{ "agents": { "crossSessionMessaging": true } }
```

Sobald aktiviert, kann das Modell in einer Session die anderen mit
`list_agents` entdecken – jede erscheint unter `sessions` mit dem `name`,
den `qwen sessions ps --json` aufzeichnet (die Tabellenansicht kann lange
Namen abschneiden) – und eine mit `send_message` adressieren, wobei
dieser Name als `to` verwendet wird. Wenn zwei Sessions denselben Namen
teilen, zeigt `list_agents` jede mit einem kurzen `[ref]` an, und der
Send-Vorgang muss dieses einbeziehen (`name [ref]`); ein bloßer Name, der
beides bedeuten könnte, wird abgelehnt, statt geraten.
`list_agents` meldet auch den eigenen Namen der Session unter `self`, und
`to: "*"` bedeutet weiterhin "meine Agent-Team-Mitglieder" und erreicht
nie andere Sessions.

Eine Nachricht kommt in der anderen Session als von einer anderen Session
kommend an, nicht vom Benutzer, und trägt keine deiner Autorität dort:
Die empfangende Session handelt nur innerhalb ihrer eigenen
Berechtigungseinstellungen. Ihr Benutzer kann entscheiden, was mit
eingehenden Nachrichten geschieht, mittels
`agents.crossSessionInbound` (`accept`, `hold` oder `refuse`). Wenn nicht
gesetzt, wird eine Nachricht nur zugestellt, wenn beide Sessions in
derselben Review-Klasse sind: beide überprüfen jede Aktion (Default- oder
Plan-Modus), oder beide sind in einem Modus, der einige Aktionen ohne
Review pro Aktion anwendet (auto-edit, auto oder yolo). Eine Nachricht
von einer Session in der anderen Klasse, oder von einem Absender, der
nicht angibt, in welcher Klasse er sich befindet, wird zur Überprüfung
zurückgehalten – in beide Richtungen. Eine Session, die jede Aktion
überprüft, hält eine Nachricht von einer zurück, die es nicht tut, denn
diese Nachricht wurde von einem Modell geschrieben, das niemand
beobachtete, und die Prompts pro Aktion bewachen Aktionen, nicht wozu
die Session überredet wird. Zurückgehaltene Nachrichten werden mit
`/peers` in der empfangenden Session aufgelistet und freigegeben, und
eine Nachricht, die nur wegen unterschiedlicher Modi zurückgehalten
wurde, wird automatisch freigegeben, sobald sie übereinstimmen.

Ein Repository kann darin geöffnete Sessions vorsichtiger machen, nie
weniger: Eine Workspace-`.qwen/settings.json` kann
`agents.crossSessionInbound` auf `hold` oder `refuse` setzen, oder
`agents.crossSessionMessaging` auf `false`, und dieser Wert gewinnt über
einem lockereren in deinen Benutzereinstellungen. Ein Workspace-Wert,
der deine Einstellung lockern würde (`accept`, oder `true` für den
Schalter), wird mit einer Warnung ignoriert, und ein Wert, den die CLI
nicht erkennt, hält jede Nachricht, wenn er der effektive Wert ist.
Systemeinstellungen überschreiben all dies, wie bei jeder Einstellung.

Eine Zurückhaltung wartet nicht ewig. Eine Nachricht, über die niemand
entscheidet, läuft nach `agents.crossSessionHeldExpiry` ab – `1m`,
`5m`, `10m` oder `never`, standardmäßig fünf Minuten – und der sendenden
Session wird mitgeteilt, dass keine Entscheidung getroffen wurde. Eine
Verkürzung der Einstellung gilt auch für bereits wartende Nachrichten.

Wenn die Session ihren Posteingang nicht binden kann – das
Runtime-Verzeichnis fehlt, gehört einem anderen Benutzer oder ist
schreibgeschützt, wie in einem Container – versucht sie zuerst ein
privates Verzeichnis unter dem Temp-Verzeichnis, und nur wenn das
ebenfalls fehlschlägt, startet sie ohne. Wenn das passiert, meldet die
Session dies beim Start, und `/peers` wiederholt den Grund und was zu
ändern ist (normalerweise `XDG_RUNTIME_DIR` oder `TMPDIR`).

Zwei Sessions können auch dieselbe Posteingangsadresse auflösen, denn
die Adresse ist nach Prozess-ID gekeyt, und Prozess-IDs wiederholen sich
über Container, die ein Runtime-Verzeichnis teilen. Die zweitstartende
Session nimmt eine benachbarte Adresse, statt die gerade verwendete zu
übernehmen, sodass keine unerreichbar wird. Peers sind davon
unbetroffen: Sie lesen die Adresse einer Session aus der
Session-Registry, statt sie abzuleiten.

Der `send_message`-Aufruf bestätigt nur, dass die Nachricht an die
andere Session übergeben wurde. Was daraus wurde, kommt später als
Quittung: Wenn sie zurückgehalten, abgelehnt, verweigert, abgelaufen
oder falsch adressiert war (die Adresse hat den Besitzer gewechselt –
liste die Agenten erneut auf) – oder nach einer Zurückhaltung
freigegeben – erscheint ein Hinweis im Transkript der sendenden Session
(`Message to <name>: …`). Abgelehnt, verweigert und verworfen sind drei unterschiedliche
Antworten: Abgelehnt bedeutet, dass jemand die Nachricht überprüft und
nein gesagt hat, verweigert bedeutet, dass `agents.crossSessionInbound`
dieser Session `refuse` ist und niemand sie überhaupt gesehen hat, und
verworfen bedeutet, dass ihr Posteingang die Nachricht vor alledem
abgewiesen hat (siehe unten). Der erste Verwurf wird sofort beantwortet
und die restlichen werden alle paar Sekunden in eine Quittung
zusammengefasst, die jeweils die Nachrichten nennt, für die sie steht,
sodass eine Serie davon nur eine Handvoll Zeilen kostet statt eine pro
Nachricht. Das Modell, das sie gesendet hat, wird nicht informiert; wenn
die andere Session antwortet, kommt die Antwort als
Cross-Session-Nachricht an.

### Flood-Schutz

Eine Session akzeptiert bis zu 30 Nachrichten auf einmal von einem
Absender und danach eine alle zwei Sekunden, sowie bis zu 32 auf einmal
von allen Absendern zusammen und danach eine pro Sekunde. Das zweite
Limit existiert, weil ein Absender sich selbst benennt: Rotieren des
Namens bringt eine frische Zuteilung vom ersten Limit, aber nicht vom
zweiten. Es liegt knapp über dem ersten, weil jede akzeptierte Nachricht
eine Quittung erzeugt, und eine Session kann nur so viele davon
gleichzeitig verschicken. Eine Nachricht von einer anderen Session, die
die vorherige Nachricht desselben Absenders Wort für Wort innerhalb von
30 Sekunden wiederholt, wird ebenfalls abgewiesen – ein Modell, das auf
einem Satz schleift, prägt jedes Mal eine frische Nachrichten-ID, also
fängt es der Text ab. Nachrichten von einem Skript, das die Session
gestartet hat, und von einem vertrauenswürdigen Controller sind von der
Wiederholungsprüfung ausgenommen, denn ein Hook, der dieselbe Zeile
zweimal meldet, meldet zwei Fakten, und eine Person, die zweimal
„continue" sagt, meint es zweimal; beide unterliegen weiterhin den
Ratenlimits. Schließlich wird eine Nachricht, die akzeptiert wird, aber
nicht gequeut werden kann, weil die Session bereits 50 wartende hat,
ebenfalls abgewiesen.

Eine Nachricht, die auf diese Weise abgewiesen wird, wird niemals
zurückgehalten, niemals dem Modell gezeigt, und hinterlässt keinen
Record, sodass der Absender es später erneut versuchen und landen kann.
Die empfangende Session meldet dies in ihrem Transkript höchstens einmal
pro Minute pro Absender, mit einem Zähler für das, wofür die Zeile
steht. Die sendende Session bekommt eine Quittung, die jede Nachricht
nennt, die der Burst gekostet hat, und ihr Transkript sagt, sie soll das
noch Relevante in eine spätere Nachricht zusammenfassen, statt erneut zu
senden.

Die sendende Seite wartet nicht, um es herauszufinden. Jede Session
verfolgt, was sie an jede Adresse gesendet hat, und verweigert einen
Send, den der Empfänger verwerfen würde, sodass das Modell gesagt
bekommt, es soll batchen, bevor die Nachricht geschrieben wird, statt
danach – und der Empfänger gibt niemals eine Verbindung für eine
Nachricht aus, die er abweisen würde.

### Posteingang-Authentifizierung und skriptete Injektion

Der Posteingang jeder Session erfordert ein Session-spezifisches Token:
Eine Verbindung muss es in ihrer ersten Zeile präsentieren, bevor eine
Nachricht gelesen wird, und Sessions tauschen Token automatisch über
dieselben Registry-Einträge aus, durch die sie sich gegenseitig
entdecken. Sessions von einem Build ohne Token-Support können von einem
neueren empfangen, aber ihre Sendungen an dieses werden verworfen.

Eine Session exportiert ihre eigene Posteingangsadresse und ein Token an
Kindprozesse als `QWEN_CODE_MESSAGING_SOCKET` und
`QWEN_CODE_MESSAGING_TOKEN`, sodass ein Skript oder Hook, den die
Session ausführt, eine Nachricht zurück in sie senden kann. Dies ist ein
zweites, _Kind_-Token, das nirgendwo veröffentlicht wird: Nur Prozesse,
die die Session gestartet hat, können es halten, sodass eine Nachricht,
die damit ankommt, als eigene der Session erkannt wird, statt als die
einer anderen Session.

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

Gib jeder Injektion eine frische `msgId`. Das empfangende Gate merkt
sich die IDs, die es bereits verarbeitet hat, sodass ein Hook, der eine
wiederverwendet, beim ersten Mal zugestellt und bei jedem weiteren Lauf
still dedupliziert wird.

Eine injizierte Nachricht durchläuft immer noch das eingehende Gate und
wird als nicht vom Benutzer kommend markiert, aber das Gate weiß, dass
sie vom eigenen Prozess der Session kam: Unter dem
Modus-Übereinstimmungs-Standard wird sie ohne Überprüfung zugestellt
(ein Peer in derselben Position würde zurückgehalten), während ein
explizites `agents.crossSessionInbound` von `hold` oder `refuse` dafür
gilt wie für alles andere. Das Modell sieht sie als
`<cross_session_message from="own process" origin="own-process">` mit
einem Hinweis, dass sie von einem Skript oder Hook stammt, den die
Session ausgeführt hat, nicht vom Benutzer.

### Vertrauenswürdige Controller

Die Regel oben hält eine Nachricht von jedem Absender zurück, der nicht
angibt, in welcher Review-Klasse er sich befindet, und ein Programm, das
keine Qwen Code-Session ist, hat keine zu sagen. Das ist die richtige
Voreinstellung für einen Fremden, aber nicht für ein Programm, das du
gewählt hast: Ein Voice-Frontend, eine Diktierbrücke, ein
Automatisierungs-Daemon, der deine eigenen Anweisungen weiterleitet,
würde jede Nachricht parken, und jede einzelne manuell zu genehmigen
macht den Sinn zunichte.

Du gewährst einem solchen Programm die Zustellung, indem du ein Token
für es erstellst:

```bash
qwen sessions controllers add --label voice-bridge
```

Das Token wird einmal ausgegeben und nirgendwo gespeichert: Die Datei
unter deinem Qwen-Home enthält nur seinen SHA-256-Hash, sodass nichts,
was diese Datei später liest, das Token präsentieren kann. Trage es in
die eigene Konfiguration des Controllers ein, wenn der Befehl es
ausgibt.

Ein Controller präsentiert das Token wie jeder andere Absender – als
erste Zeile der Verbindung – und nimmt den Socket-Pfad aus der
Session-Registry (`qwen sessions ps --json` gibt einen Datensatz pro
Live-Session aus, `ipcPath` ist die Adresse):

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

Eine Nachricht, die mit einem gewährten Token ankommt, wird ohne Review
pro Nachricht zugestellt, unabhängig davon, in welcher Review-Klasse
sich jede Seite befindet – aber sie weicht weiterhin einer expliziten
Einstellung: Ein `agents.crossSessionInbound` von `hold` parkt sie wie
alles andere, und `refuse` weist sie ab. Grants gehören zu deinem
Qwen-Home statt zu einer Session, sodass ein Controller die Sessions
erreicht, die du ausführst, und Sessions lesen die Datei bei jeder
Verbindung neu: Ein Token zu erstellen oder zu widerrufen, wird bei der
nächsten Verbindung wirksam, ohne dass etwas neu gestartet werden muss.

```bash
qwen sessions controllers list          # IDs, Labels, wann sie hinzugefügt wurden
qwen sessions controllers remove c_1a2b # eines widerrufen
```

`/peers controllers` und `/peers revoke <id>` tun dasselbe innerhalb
einer Session. Eine Nachricht, die durch einen Grant kam, wird als
`Message from a trusted controller (voice-bridge)` angezeigt, und
erscheint in `/peers` als `[controller] voice-bridge`, wenn eine
`hold`-Einstellung sie geparkt hat.

Das Modell sieht eine solche Nachricht als
`<cross_session_message from="controller" origin="controller" controller="voice-bridge">`,
mit einem Hinweis, dass sie deine eigenen Anweisungen weiterleitet – und
dieselben zwei Verbote, die für jeden anderen Ursprung gelten: Sie darf
nicht Berechtigungseinstellungen, QWEN.md oder Konfiguration bearbeiten,
weil die Nachricht es verlangt, und sie darf die Nachricht nicht als
deine Genehmigung eines ausstehenden Bestätigungs-Prompts behandeln. Ein
Controller kann sagen, was als nächstes zu tun ist; er kann keinen
Prompt in deinem Namen beantworten.

Jeder, der das Token hält, kann als dieser Controller senden, behandle
es also wie jede andere Anmeldeinformation: Gib es einem Programm, halte
es aus geteilter Konfiguration heraus, und widerrufe es, wenn das
Programm fertig ist.

### Sessions, die ein Programm über ACP steuert

Jedes `qwen --acp`-Kind registriert jede Session, die es hostet – als
`serve`, wenn der Daemon den Prozess gespawnt hat, als `headless`, wenn
ein Editor oder ein anderer Client `qwen --acp` direkt steuert – und die
Session erscheint in `qwen sessions ps` und im `list_agents` einer
anderen Session wie jede andere. Sie kann senden: ihr Modell kann
`send_message` aufrufen, um ein Terminal zu erreichen, das du offen hast.
Mehrere davon teilen sich einen Prozess und einen Posteingang, also muss
ein Absender die Session benennen, die er meint – jede Qwen Code-Session
tut das automatisch.

Nachrichten, die _an_ eine solche gesendet werden, werden abgelehnt
statt zurückgehalten. Zurückhaltung ist eine Frage an einen Menschen,
und niemand beobachtet eine Liste zurückgehaltener Nachrichten für eine
gesteuerte Session; ein Absender wird stattdessen sofort benachrichtigt,
statt ein Ablaufen abzuwarten. Wo eine zurückgehaltene Nachricht für
diese Sessions auftauchen sollte, ist noch nicht geklärt.

Eine Session registriert sich nur, solange ihre eigenen Einstellungen
`agents.crossSessionMessaging` aktiviert haben. Mit ausgeschaltetem
bleibt sie unsichtbar, denn der einzige Grund, eine Session aufzulisten,
die niemand ansprechen kann, wäre, eine Adresse zu bewerben, die
niemals antwortet.

### Programme, die keine Qwen Code-Sessions sind

Alles oben funktioniert zwischen Sessions, aber nichts davon ist
spezifisch für eine. Ein Programm, das einen Registry-Eintrag für sich
selbst schreibt und einen Posteingang auf dieselbe Weise bindet, wird
von `qwen sessions ps` und von `list_agents` aufgelistet, kann namentlich
von `send_message` adressiert werden, und empfängt Zustellquittungen für
das, was es sendet – ein Voice-Frontend, ein Relay, ein Build-Watcher. Es
sollte `kind: "external"` aufzeichnen, damit eine Auflistung sagen kann,
was es ist.

[Cross-Session Protocol](./cross-session-protocol.md) ist der Vertrag,
um eines zu schreiben: das Record-Schema und wie Liveness beurteilt
wird, die Socket-Pfade und das Framing, die Auth-Zeile, jedes
Frame-Feld, die Quittungs-Zustände und ihre Übergänge, und was ein
Empfänger mit einer Nachricht tut, bevor sein Modell sie sieht.

Ein Node-Programm muss nichts davon von Hand schreiben:
` @qwen-code/sdk/peer` implementiert den Vertrag. `PeerEndpoint.start({ name })`
publiziert den Record und bindet den Posteingang, `list()` und `send()` adressieren
Sessions nach Name, und `onMessage` empfängt, was sie senden.