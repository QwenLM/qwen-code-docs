# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle, die dir helfen, Sitzungen effizient zu verwalten, die Benutzeroberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden über bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ | Funktionsbeschreibung | Typischer Anwendungsfall |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Slash-Befehle (`/`) | Steuerung von Qwen Code auf Meta-Ebene | Sitzungen verwalten, Einstellungen ändern, Hilfe erhalten |
| At-Befehle (`@`) | Schnelles Einfügen lokaler Dateiinhalte in den Konversationsverlauf | Ermöglicht der KI, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell | Ausführen von Systembefehlen wie `git status`, `ls` usw. |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sitzungen, die Benutzeroberfläche und das Grundverhalten zu verwalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen dir, den Arbeitsfortschritt zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init` | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen | `/init` |
| `/summary` | Projektzusammenfassung basierend auf dem Konversationsverlauf generieren | `/summary` |
| `/compress` | Chat-Verlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress` oder `/summarize` |
| `/compress-fast` | Schnelle Komprimierung ohne KI – entfernt alte Tool-Ausgaben und Denkprozesse | `/compress-fast` |
| `/resume` | Eine vorherige Konversationssitzung fortsetzen | `/resume` oder `/continue` |
| `/recap` | Jetzt eine einzeilige Sitzungsübersicht generieren | `/recap` |
| `/restore` | Projektdateien auf den Checkpoint vor der Ausführung eines Tool-Aufrufs zurücksetzen | `/restore` (Liste) oder `/restore <ID>` |
| `/delete` | Eine vorherige Sitzung löschen | `/delete` |
| `/branch` | Die aktuelle Konversation in eine neue Sitzung abspalten | `/branch` |
| `/fork` | Einen Hintergrund-Agenten erzeugen, der die gesamte Konversation erbt | `/fork <directive>` |
| `/rewind` | Konversation auf einen vorherigen Schritt zurückspulen | `/rewind` oder `/rollback` |
| `/export` | Sitzungsverlauf in eine Datei exportieren | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename` | Die aktuelle Sitzung umbenennen oder taggen | `/rename My Feature` oder `/tag` |

> [!note]
>
> `/summarize` ist ein Alias für `/compress` (es komprimiert den Chat-Verlauf – eine destruktive Operation). Um stattdessen eine nicht-destruktive Projektzusammenfassung zu generieren, verwende `/summary`.

### 1.2 Benutzeroberflächen- und Workspace-Steuerung

Befehle zum Anpassen der Benutzeroberfläche und der Arbeitsumgebung.

| Befehl | Beschreibung | Nutzungsbeispiele |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear` | Konversationsverlauf löschen und Kontext freigeben | `/clear`, `/reset`, `/new` |
| `/context` | Aufschlüsselung der Kontextfenster-Nutzung anzeigen | `/context` |
| → `detail` | Kontextnutzung nach Element aufgeschlüsselt anzeigen | `/context detail` |
| `/history` | Anzeigeeinstellungen und Sichtbarkeit des Verlaufs steuern | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff` | Öffnet einen interaktiven Diff-Viewer, der uncommitted Änderungen und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversationsturns zu wechseln, ↑/↓, um durch Dateien zu blättern | `/diff` |
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
| `/skills` | Verfügbare Skills auflisten und ausführen | `/skills`, `/skills <name>` |
| `/plan` | In den Plan-Modus wechseln oder ihn verlassen | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | Den Tool-Freigabemodus ändern (nur aktuelle Sitzung) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | Nur Analyse, keine Ausführung (sichere Überprüfung) | `/approval-mode plan` |
| → `default` | Freigabe für Änderungen erforderlich (tägliche Nutzung) | `/approval-mode default` |
| → `auto-edit` | Änderungen automatisch freigeben (vertrauenswürdige Umgebung) | `/approval-mode auto-edit` |
| → `auto` | Vom Classifier bewertete Freigabe (autonom) | `/approval-mode auto` |
| → `yolo` | Alles automatisch freigeben (schnelles Prototyping) | `/approval-mode yolo` |
| `/model` | In der aktuellen Sitzung verwendetes Modell wechseln | `/model`, `/model <model-id>` (sofortiger Wechsel) |
| `/model --fast` | Ein leichteres Modell für Prompt-Vorschläge festlegen | `/model --fast qwen3-coder-flash` |
| `/model --voice` | Das für die Sprachtranskription verwendete Modell festlegen | `/model --voice <model-id>` |
| `/model --vision` | Das Vision-Bridge-Modell festlegen, das verwendet wird, um Bilder für ein reines Text-Hauptmodell zu transkribieren | `/model --vision <model-id>` |
| `/effort` | Reasoning-Aufwand für denkfähige Modelle festlegen | `/effort` (öffnet Picker), `/effort high` (low/medium/high/xhigh/max; wird je nach Provider gemappt und begrenzt) |
| `/extensions` | Extensions verwalten | `/extensions list`, `/extensions manage` |
| → `list` | Installierte Extensions auflisten | `/extensions list` |
| → `manage` | Installierte Extensions verwalten (interaktiv) | `/extensions manage` |
| → `explore` | Extensions-Seite im Browser öffnen | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | Eine Extension aus einem Git-Repo oder Pfad installieren | `/extensions install <repo-or-path>` |
| `/memory` | Dialog des Memory Managers öffnen | `/memory` |
| `/remember` | Einen dauerhaften Memory speichern | `/remember Prefer terse responses` |
| `/forget` | Passende Einträge aus der Auto-Memory entfernen | `/forget <query>` |
| `/dream` | Auto-Memory-Konsolidierung manuell ausführen | `/dream` |
| `/hooks` | Qwen Code-Hooks verwalten | `/hooks`, `/hooks list` |
| `/permissions` | Berechtigungsregeln verwalten | `/permissions` |
| `/agents` | Subagenten verwalten | `/agents manage`, `/agents create` |
| `/arena` | Arena-Sitzungen verwalten | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (Alias `choose`) |
| `/goal` | Ein Ziel festlegen – weiterarbeiten, bis die Bedingung erfüllt ist | `/goal <condition>`, `/goal clear` |
| `/tasks` | Hintergrundtasks auflisten | `/tasks` |
| `/workflows` | Workflow-Ausführungen inspizieren | `/workflows`, `/workflows <runId>` |
| `/lsp` | LSP-Server-Status anzeigen | `/lsp` |
| `/trust` | Einstellungen für die Ordner-Vertrauenswürdigkeit verwalten | `/trust` |

> [!warning]
>
> Installiere Extensions (`/extensions install`) nur aus Quellen, denen du vertraust. Extensions können MCP-Server, Skills und Befehle bündeln, die mit denselben Berechtigungen wie Qwen Code selbst ausgeführt werden – sie können auf deine Dateien, API-Keys und Konversationsdaten zugreifen. `/extensions install` fordert keine Bestätigung an.

> [!warning]
>
> Die Freigabemodi `auto-edit`, `auto` und `yolo` umgehen die Freigabeaufforderungen für Tool-Ausführungen. Im `yolo`-Modus werden alle Aktionen – einschließlich Shell-Befehlen, Dateischreibvorgängen und Netzwerkanfragen – ohne Bestätigung ausgeführt. Verwende diese Modi nur in vertrauenswürdigen, isolierten oder wegwerfbaren Umgebungen.

> [!note]
>
> `/workflows`, `/lsp` und `/trust` werden nur registriert, wenn die jeweilige Funktion aktiviert ist – über die Umgebungsvariable `QWEN_CODE_ENABLE_WORKFLOWS=1`, den CLI-Flag `--experimental-lsp` bzw. die Einstellung `security.folderTrust.enabled`. Wenn sie deaktiviert sind, werden sie nicht angezeigt und melden einen unbekannten Befehl.

### 1.5 Integrierte Skills

Diese Befehle rufen mitgelieferte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review` | Codeänderungen mit 9 parallelen Review-Agenten überprüfen | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop` | Einen Prompt nach einem wiederkehrenden Zeitplan ausführen | `/loop 5m check the build` |
| `/simplify` | Kürzliche Änderungen überprüfen und sichere Bereinigungsänderungen direkt anwenden | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Fragen zur Nutzung und Konfiguration von Qwen Code beantworten | `/qc-helper how do I configure MCP?` |

Siehe [Code Review](./code-review.md) für die vollständige `/review`-Dokumentation.

### 1.6 Nebenfrage (`/btw`)

Der `/btw`-Befehl ermöglicht es dir, schnelle Nebenfragen zu stellen, ohne den Hauptkonversationsfluss zu unterbrechen oder zu beeinträchtigen.

| Befehl | Beschreibung |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Eine schnelle Nebenfrage stellen |
| `?btw <your question>` | Alternative Syntax für Nebenfragen |

**Funktionsweise:**

- Die Nebenfrage wird als separater API-Call mit aktuellem Konversationskontext gesendet (bis zu den letzten 20 Nachrichten)
- Die Antwort wird über dem Composer angezeigt – du kannst während des Wartens weiterschreiben
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Antwort auf die Nebenfrage wird **nicht** Teil des Hauptkonversationsverlaufs
- Antworten werden mit voller Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)
**Tastenkombinationen (Interaktiver Modus):**

| Tastenkombination    | Aktion                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Abbrechen (während des Ladens) oder ausblenden (nach Abschluss) |
| `Space` oder `Enter` | Antwort ausblenden (wenn die Eingabe leer ist)      |
| `Ctrl+C` oder `Ctrl+D` | Eine laufende Nebenfrage abbrechen                |

**Beispiel:**

```
(Während sich die Hauptkonversation um das Refactoring von Code dreht)

> /btw Was ist der Unterschied zwischen let und var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw Was ist der Unterschied zwischen    │
  │     let und var in JavaScript?           │
  │                                          │
  │ + Wird beantwortet...                    │
  │ Drücke Escape, Ctrl+C oder Ctrl+D zum    │
  │ Abbrechen                                │
  ╰──────────────────────────────────────────╯
  > (Composer bleibt aktiv — weitertippen)

(Nachdem die Antwort eingetroffen ist)

  ╭──────────────────────────────────────────╮
  │ /btw Was ist der Unterschied zwischen    │
  │     let und var in JavaScript?           │
  │                                          │
  │ `let` ist blockweit gültig, während      │
  │ `var` funktionsweit gültig ist. `let`    │
  │ wurde in ES6 eingeführt und verhält sich │
  │ beim Hoisting anders.                    │
  │                                          │
  │ Drücke Space, Enter oder Escape zum      │
  │ Ausblenden                               │
  ╰──────────────────────────────────────────╯
  > (Composer weiterhin aktiv)
```

**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                      |
| -------------------- | ---------------------------------------------- |
| Interaktiv           | Zeigt den obigen Composer mit Markdown-Rendering an |
| Nicht-interaktiv     | Gibt Textergebnis zurück: `btw> question\nanswer` |
| ACP (Agent Protocol) | Gibt den `stream_messages` Async-Generator zurück |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne deine Hauptaufgabe zu unterbrechen. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu überprüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Session Recap (`/recap`)

Der Befehl `/recap` erstellt eine kurze "Wo du stehengeblieben bist"-Zusammenfassung der aktuellen Session, damit du eine alte Konversation fortsetzen kannst, ohne durch seitenlange Historie scrollen zu müssen.

| Befehl   | Beschreibung                             |
| -------- | ---------------------------------------- |
| `/recap` | Generiert und zeigt eine einzeilige Session-Zusammenfassung an |

**Funktionsweise:**

- Verwendet das konfigurierte Fast Model (Einstellung `fastModel`), falls verfügbar, und fällt andernfalls auf das Haupt-Sessionsmodell zurück. Ein kleines, günstiges Modell reicht für eine Zusammenfassung aus.
- Die aktuelle Konversation (bis zu 30 Nachrichten, nur Text — Tool-Aufrufe und Tool-Antworten werden herausgefiltert) wird mit einem strikten System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in gedimmter Farbe mit einem `❯`-Präfix gerendert, damit sie sich von echten Assistant-Antworten abhebt.
- Verweigert die Ausführung mit einem Inline-Fehler, wenn ein Model-Turn gerade läuft oder ein anderer Befehl verarbeitet wird. Wenn keine brauchbare Konversation vorhanden ist oder die zugrunde liegende Generierung fehlschlägt, zeigt `/recap` eine kurze Info-Nachricht anstelle einer Zusammenfassung an – der manuelle Befehl antwortet immer mit irgendetwas.

**Auto-Trigger bei Rückkehr aus der Abwesenheit:**

Wenn das Terminal für **mehr als 5 Minuten** den Fokus verliert und wieder fokussiert wird, wird automatisch eine Zusammenfassung generiert und angezeigt (nur, wenn keine Modellantwort läuft; andernfalls wartet es, bis der aktuelle Turn abgeschlossen ist, und wird dann ausgelöst). Im Gegensatz zum manuellen Befehl ist der Auto-Trigger bei Fehlern völlig still: Wenn die Generierung fehlschlägt oder es nichts zusammenzufassen gibt, wird keine Nachricht zum Verlauf hinzugefügt. Gesteuert wird dies durch die Einstellung `general.showSessionRecap` (Standard: `false`); der manuelle Befehl `/recap` funktioniert immer, unabhängig von dieser Einstellung.

**Beispiel:**

```
> /recap

❯ Refactoring von loopDetectionService.ts zur Behebung des Long-Session-OOM,
  verursacht durch unbegrenzte streamContentHistory und contentStats. Der
  nächste Schritt ist die Implementierung von Option B (LRU Sliding Window
  mit FNV-1a), vorbehaltlich der Bestätigung.
```

> [!tip]
>
> Konfiguriere ein Fast Model über `/model --fast <model>` (z. B. `qwen3-coder-flash`), um `/recap` schnell und kostengünstig zu machen. Setze `general.showSessionRecap` auf `true`, um den Auto-Trigger zu aktivieren; der manuelle Befehl `/recap` funktioniert immer, unabhängig von dieser Einstellung.

### 1.8 Diff Viewer (`/diff`)

Der Befehl `/diff` öffnet einen interaktiven Diff-Viewer, der uncommitted Changes und Per-Turn-Diffs anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um durch Dateien zu navigieren, und Enter, um Inline-Diffs anzuzeigen.

**Funktionsweise:**

Im interaktiven Modus öffnet `/diff` einen Dialog mit einem **Source Picker** am oberen Rand:

- **Current** — Working Tree vs HEAD (`git diff HEAD`). Zeigt alle uncommitted Changes an, einschließlich staged, unstaged und untracked Dateien.
- **T1, T2, T3, …** — Per-Turn-Diffs, ein Tab pro Model-Turn, der Dateien geändert hat. Die neuesten Turns werden zuerst angezeigt. Jeder Tab zeigt eine Vorschau des ursprünglichen Prompts als Kontext.

Die Dateiliste zeigt dateispezifische Statistiken (hinzugefügte/entfernte Zeilen) mit Tags für spezielle Zustände (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Drücke Enter auf einer Datei, um deren Inline-Diff mit syntaxhervorgehobenen Hunks anzuzeigen.

Per-Turn-Diffs erfordern, dass File Checkpointing aktiviert ist (im interaktiven Modus standardmäßig eingeschaltet). Wenn File Checkpointing deaktiviert ist, ist nur die "Current"-Quelle verfügbar.

**Tastenkombinationen:**

| Taste     | Aktion                                    |
| --------- | ----------------------------------------- |
| `←` / `→` | Zwischen Quellen wechseln (Current / T1 / T2…) |
| `↑` / `↓` | Dateiliste navigieren                     |
| `j` / `k` | Dateiliste navigieren (Vim-Style)         |
| Enter     | Inline-Diff für ausgewählte Datei anzeigen |
| `←` / Esc | Von der Inline-Diff-Ansicht zur Dateiliste zurückkehren |
| Esc       | Dialog schließen                          |

**Beispiel:**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 Dateien +45 -12 ┐
│                                                                      │
│ ◀ Current · T3 · T2 · T1 ▶                                          │
│                                                                      │
│ › src/utils/parser.ts                               +30 -8           │
│   src/utils/parser.test.ts                          +12 -2           │
│   README.md                                         +3 -2            │
│                                                                      │
│ ←/→ Quelle · ↑/↓ Datei · Enter Ansicht · Esc Schließen               │
└──────────────────────────────────────────────────────────────────────┘
```

**Nicht-interaktiver Modus:**

Im Headless-Modus (`--prompt`) oder in nicht-interaktiven Kontexten gibt `/diff` eine Plain-Text-Zusammenfassung des Working Tree vs HEAD aus. Die Per-Turn-Navigation ist nicht verfügbar.

```
3 Dateien geändert, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zum Vornehmen von Systemeinstellungen.

| Befehl           | Beschreibung                                                                                                               | Nutzungsbeispiele                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/help`          | Zeigt Hilfeinformationen für verfügbare Befehle an                                                                         | `/help` oder `/?`                                                                   |
| `/status`        | Zeigt Versionsinformationen an                                                                                             | `/status` oder `/about`                                                             |
| `/status paths`  | Zeigt aktuelle Session-Datei- und Log-Pfade an                                                                             | `/status paths`                                                                     |
| `/stats`         | Öffnet das interaktive Dashboard für Nutzungsstatistiken (Tabs Session, Activity und Efficiency)                           | `/stats` oder `/usage`                                                              |
| `/stats model`   | Zeigt Token-Aufschlüsselung und geschätzte Kosten pro Modell an                                                            | `/stats model`                                                                      |
| `/stats tools`   | Zeigt Aufrufzahlen pro Tool an                                                                                             | `/stats tools`                                                                      |
| `/stats skills`  | Zeigt Aufrufzahlen pro Skill für die aktuelle Live-Session an (nur live; schließt sessionübergreifende tägliche/monatliche Aktivität aus) | `/stats skills`                                                                     |
| `/stats daily`   | Zeigt tägliche Token-Nutzungsstatistiken an                                                                                | `/stats daily` (Alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Zeigt monatliche Token-Nutzungsstatistiken an                                                                              | `/stats monthly` (Alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exportiert Nutzungsstatistiken nach CSV oder JSON                                                                          | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Öffnet den Einstellungs-Editor                                                                                             | `/settings`                                                                         |
| `/auth`          | Ändert die Authentifizierungsmethode                                                                                       | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Führt Installations- und Umgebungsdagnostik aus                                                                            | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Zeigt aktuelle Prozess-Speicherdiagnostik an                                                                               | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Zeichnet ein CPU-Profil für die Chrome DevTools-Analyse auf                                                                | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Setzt das Standalone-CLI-Binary auf die vorherige Version zurück (nur bei Standalone-Installationen; für den Konversationsverlauf verwende `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Öffnet die vollständige Qwen Code-Dokumentation im Browser                                                                 | `/docs`                                                                             |
| `/ide`           | Verwaltet die IDE-Integration                                                                                              | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Generiert Programmier-Insights aus dem Chat-Verlauf                                                                        | `/insight`                                                                          |
| `/setup-github`  | Richtet GitHub Actions ein                                                                                                 | `/setup-github`                                                                     |
| `/bug`           | Reicht ein Issue zu Qwen Code ein                                                                                          | `/bug Button click unresponsive`                                                    |
| `/copy`          | Kopiert in die Zwischenablage: Antwort (N-letzte), Code (nach Sprache), LaTeX oder Mermaid                                 | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Beendet Qwen Code sofort                                                                                                   | `/quit` oder `/exit`                                                                |

> [!warning]
>
> `/doctor memory --snapshot` schreibt einen V8-Heap-Snapshot, der Prompts, Dateiinhalte, API-Keys und Tool-Ergebnisse der aktuellen Session enthalten kann. Überprüfe die Datei, bevor du sie teilst.

### 1.10 Allgemeine Tastenkombinationen

| Tastenkombination  | Funktion                | Hinweis                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Bildschirm löschen      | Löscht nur den sichtbaren Bildschirm (setzt die Session nicht zurück wie `/clear`) |
| `Ctrl/cmd+T`       | Tool-Beschreibung umschalten | MCP-Tool-Verwaltung                                                    |
| `Ctrl/cmd+C`×2     | Beenden bestätigen      | Sicherer Beenden-Mechanismus                                              |
| `Ctrl/cmd+Z`       | Eingabe rückgängig machen | Textbearbeitung                                                         |
| `Ctrl/cmd+Shift+Z` | Eingabe wiederherstellen | Textbearbeitung                                                          |

### 1.11 Authentifizierungsbefehle

Verwende `/auth` innerhalb einer Qwen Code-Session, um die Authentifizierung zu konfigurieren. Verwende `/doctor`, um den aktuellen Authentifizierungs- und Umgebungsstatus zu überprüfen.

| Befehl    | Beschreibung                                                           |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | Konfiguriert die Authentifizierung interaktiv (Aliase: `/connect`, `/login`) |
| `/doctor` | Zeigt Authentifizierungs- und Umgebungsprüfungen an                    |

> [!note]
>
> Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Legacy-Aufrufe wie `qwen auth status` geben einen Entfernungshinweis mit Migrationsanleitung aus. Siehe die Seite [Authentication](../configuration/auth) für alle Details.

## 2. @-Befehle (Dateien einbinden)

@-Befehle werden verwendet, um lokale Datei- oder Verzeichnisinhalte schnell zur Konversation hinzuzufügen.

| Befehlsformat       | Beschreibung                             | Beispiele                                      |
| ------------------- | ---------------------------------------- | ---------------------------------------------- |
| `@<file path>`      | Injiziert den Inhalt der angegebenen Datei | `@src/main.py Please explain this code`        |
| `@<directory path>` | Liest rekursiv alle Textdateien im Verzeichnis | `@docs/ Summarize content of this document`    |
| Alleinstehendes `@` | Wird verwendet, wenn das `@`-Symbol selbst thematisiert wird | `@ What is this symbol used for in programming?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@My\ Documents/file.txt`)

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat      | Beschreibung                                                     | Beispiele                            |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `!<shell command>` | Führt Befehl in einer Sub-Shell aus                              | `!ls -la`, `!git status`             |
| Alleinstehendes `!` | Wechselt in den Shell-Modus, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(enter) → Befehl eingeben → `!`(exit) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichere häufig verwendete Prompts als Shortcut-Befehle, um die Arbeitseffizienz zu steigern und Konsistenz sicherzustellen.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist deprecated, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Schneller Überblick

| Funktion         | Beschreibung                             | Vorteile                               | Priorität | Anwendungsfälle                                  |
| ---------------- | ---------------------------------------- | -------------------------------------- | --------- | ------------------------------------------------ |
| Namespace        | Unterverzeichnis erstellt doppelpunkt-benannte Befehle | Bessere Befehlsorganisation            |           |                                                  |
| Globale Befehle  | `~/.qwen/commands/`                      | In allen Projekten verfügbar           | Niedrig   | Persönlich häufig verwendete Befehle, projektübergreifende Nutzung |
| Projektbefehle   | `<project root directory>/.qwen/commands/` | Projektspezifisch, versionierbar     | Hoch      | Team-Sharing, projektspezifische Befehle         |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (Projektbefehl wird verwendet, wenn die Namen identisch sind)

### Befehlsbenennungsregeln

#### Zuordnungstabelle: Dateipfad zu Befehlsname

| Dateispeicherort                       | Generierter Befehl | Beispielaufruf        |
| -------------------------------------- | ------------------ | --------------------- |
| `~/.qwen/commands/test.md`             | `/test`            | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`    | `/git:commit Nachricht` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) wird in einen Doppelpunkt (`:`) umgewandelt.

### Markdown-Dateiformat-Spezifikation (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (in /help angezeigt)
---

Dein Prompt-Inhalt hier.
Verwende {{args}} für die Parameter-Injektion.
```

| Feld          | Erforderlich | Beschreibung                           | Beispiel                                   |
| ------------- | ------------ | -------------------------------------- | ------------------------------------------ |
| `description` | Optional     | Befehlsbeschreibung (in /help angezeigt) | `description: Code analysis tool`          |
| Prompt-Inhalt | Erforderlich | An das Modell gesendeter Prompt-Inhalt | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (Deprecated)

> [!warning]
>
> **Deprecated:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                           | Beispiel                                   |
| ------------- | ------------ | -------------------------------------- | ------------------------------------------ |
| `prompt`      | Erforderlich | An das Modell gesendeter Prompt-Inhalt | `prompt = "Please analyze code: {{args}}"` |
| `description` | Optional     | Befehlsbeschreibung (in /help angezeigt) | `description = "Code analysis tool"`       |
### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode           | Syntax             | Anwendungsfälle                      | Sicherheitsmerkmale                    |
| ------------------------------ | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbewusste Injektion      | `{{args}}`         | Präzise Parametersteuerung erforderlich | Automatisches Shell-Escaping           |
| Standard-Parameterverarbeitung | Keine besondere Markierung | Einfache Befehle, Parameter anhängen | Unverändert anhängen                   |
| Shell-Befehlsinjektion         | `!{command}`       | Dynamische Inhalte erforderlich      | Bestätigung der Ausführung vorher erforderlich |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode         | Tatsächlicher Effekt       |
| ---------------- | --------------------------------------- | --------------------- | -------------------------- |
| Raw-Injektion    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`      |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Führt `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                   | Beispiel                                       |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Parameter vorhanden | An das Ende des Prompts anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Ursprünglicher Prompt + Parameter |
| Keine Parameter  | Prompt unverändert senden                              | `/cmd` → Ursprünglicher Prompt                 |

🚀 Dynamische Content-Injektion

| Injektionstyp        | Syntax         | Verarbeitungsreihenfolge | Zweck                            |
| -------------------- | -------------- | ------------------------ | -------------------------------- |
| Dateiinhalt          | `@{file path}` | Wird zuerst verarbeitet  | Statische Referenzdateien injizieren |
| Shell-Befehle        | `!{command}`   | Wird danach verarbeitet  | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung   | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter injizieren     |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                           | Benutzerinteraktion  |
| --------------------------------- | -------------------- |
| 1. Befehl und Parameter parsen    | -                    |
| 2. Automatisches Shell-Escaping   | -                    |
| 3. Bestätigungsdialog anzeigen    | ✅ Benutzerbestätigung |
| 4. Befehl ausführen               | -                    |
| 5. Ausgabe in Prompt injizieren   | -                    |

Beispiel: Git-Commit-Message-Generierung

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

| Dateityp     | Unterstützungsstatus   | Verarbeitungsmethode      |
| ------------ | ---------------------- | ------------------------- |
| Textdateien  | ✅ Voll unterstützt    | Inhalt direkt injizieren  |
| Bilder/PDF   | ✅ Multimodale Unterstützung | Kodieren und injizieren |
| Binärdateien | ⚠️ Eingeschränkte Unterstützung | Können übersprungen oder gekürzt werden |
| Verzeichnis  | ✅ Rekursive Injektion | Folgt .gitignore-Regeln   |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Erstellungsschritte für den "Pure Function Refactoring"-Befehl

| Vorgang                     | Befehl/Code                               |
| --------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen   | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten | Siehe den vollständigen Code unten.       |
| 4. Befehl testen            | `@file.js` → `/refactor:pure`             |

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

#### Empfehlungen für das Befehlsdesign

| Wichtige Aspekte     | Empfohlene Vorgehensweise             | Vermeiden                                 |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| Befehlsbenennung     | Namespaces zur Organisation verwenden | Zu allgemeine Namen vermeiden             |
| Parameterverarbeitung| `{{args}}` explizit verwenden         | Sich auf das Standard-Anhängen verlassen (leicht verwirrend) |
| Fehlerbehandlung     | Shell-Fehlerausgabe nutzen            | Ausführungsfehler ignorieren              |
| Dateiorganisation    | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Root-Verzeichnis      |
| Beschreibungsfeld    | Immer eine klare Beschreibung angeben | Sich auf die automatisch generierte Beschreibung verlassen |

#### Erinnerung an Sicherheitsmerkmale

| Sicherheitsmechanismus | Schutzwirkung                | Benutzeraktion         |
| ---------------------- | ---------------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Befehlsinjektion  | Automatische Verarbeitung |
| Ausführungsbestätigung | Verhindert versehentliche Ausführung | Bestätigung über Dialog |
| Fehlerberichterstattung| Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |

## 5. CLI-Subbefehle

Diese Befehle werden in der Shell als `qwen <subcommand>` ausgeführt, bevor eine interaktive Sitzung gestartet wird.

### Sitzungsverwaltung

| Befehl               | Beschreibung                        | Anwendungsbeispiele                                          |
| -------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | Listet aktuelle Konversationssitzungen auf | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Listet deine aktuellen Qwen Code-Sitzungen mit Metadaten auf.

**Flags:**

| Flag      | Typ     | Standard | Beschreibung                                  |
| --------- | ------- | -------- | --------------------------------------------- |
| `--json`  | boolean | `false`  | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile) |
| `--limit` | Zahl    | `20`     | Maximale Anzahl der anzuzeigenden Sitzungen   |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: SESSION ID, STARTED (UTC-Zeitstempel), TITLE, BRANCH, PROMPT.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus. Jede Zeile ist ein JSON-Objekt mit den folgenden Feldern:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

Der "has more sessions"-Hinweis wird über stderr ausgegeben, sodass das Piping zu jq sicher bleibt.

**Beispiele:**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```