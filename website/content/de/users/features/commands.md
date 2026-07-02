# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle, die dir helfen, Sessions effizient zu verwalten, die Benutzeroberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden über bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ | Funktionsbeschreibung | Typischer Anwendungsfall |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Slash-Befehle (`/`) | Steuerung von Qwen Code auf Meta-Ebene | Sessions verwalten, Einstellungen ändern, Hilfe erhalten |
| At-Befehle (`@`) | Lokale Dateiinhalte schnell in den Konversationsverlauf einfügen | Der KI erlauben, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell | Ausführen von Systembefehlen wie `git status`, `ls` usw. |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sessions, die Benutzeroberfläche und das Grundverhalten zu verwalten.

### 1.1 Session- und Projektverwaltung

Diese Befehle helfen dir, den Arbeitsfortschritt zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init` | Analysiert das aktuelle Verzeichnis und erstellt die initiale Kontextdatei | `/init` |
| `/summary` | Generiert eine Projektzusammenfassung basierend auf dem Konversationsverlauf | `/summary` |
| `/compress` | Ersetzt den Chat-Verlauf durch eine Zusammenfassung, um Tokens zu sparen | `/compress` oder `/summarize` |
| `/compress-fast` | Schnelle Komprimierung ohne KI – entfernt alte Tool-Ausgaben und Denkprozesse | `/compress-fast` |
| `/resume` | Setzt eine vorherige Konversations-Session fort | `/resume` oder `/continue` |
| `/recap` | Generiert jetzt eine einzeilige Session-Zusammenfassung | `/recap` |
| `/restore` | Setzt Projektdateien auf den Checkpoint vor der Ausführung eines Tool-Aufrufs zurück | `/restore` (Liste) oder `/restore <ID>` |
| `/delete` | Löscht eine vorherige Session | `/delete` |
| `/branch` | Forkt die aktuelle Konversation in eine neue Session | `/branch` |
| `/fork` | Startet einen Hintergrund-Agenten, der die gesamte Konversation erbt | `/fork <directive>` |
| `/rewind` | Spult die Konversation zu einem vorherigen Turn zurück | `/rewind` oder `/rollback` |
| `/export` | Exportiert den Session-Verlauf in eine Datei | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename` | Benennt die aktuelle Session um oder versieht sie mit einem Tag | `/rename My Feature` oder `/tag` |

> [!note]
>
> `/summarize` ist ein Alias für `/compress` (es komprimiert den Chat-Verlauf – eine destruktive Operation). Um stattdessen eine nicht-destruktive Projektzusammenfassung zu generieren, verwende `/summary`.

### 1.2 Benutzeroberflächen- und Workspace-Steuerung

Befehle zum Anpassen der Benutzeroberfläche und der Arbeitsumgebung.

| Befehl | Beschreibung | Nutzungsbeispiele |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear` | Löscht den Konversationsverlauf und gibt Kontext frei | `/clear`, `/reset`, `/new` |
| `/context` | Zeigt die Aufschlüsselung der Kontextfenster-Nutzung an | `/context` |
| → `detail` | Zeigt die detaillierte Aufschlüsselung der Kontextnutzung pro Element an | `/context detail` |
| `/history` | Steuert die Anzeigeeinstellungen und Sichtbarkeit des Verlaufs | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff` | Öffnet einen interaktiven Diff-Viewer, der uncommitted Changes und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um Dateien zu durchsuchen | `/diff` |
| `/theme` | Ändert das visuelle Theme von Qwen Code | `/theme` |
| `/vim` | Schaltet den Vim-Bearbeitungsmodus für den Eingabebereich ein/aus | `/vim` |
| `/voice` | Schaltet die Spracheingabe per Diktat um | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status` |
| `/directory` | Verwaltet den Workspace mit Unterstützung für mehrere Verzeichnisse | `/dir add ./src,./tests`, `/dir show` |
| `/cd` | Verschiebt diese Session in ein neues Arbeitsverzeichnis | `/cd ../other-project` |
| `/editor` | Öffnet einen Dialog zur Auswahl eines unterstützten Editors | `/editor` |
| `/statusline` | Öffnet den interaktiven [Statuszeilen](./status-line.md)-Preset-Dialog | `/statusline` |
| `/statusline <text>` | Generiert über den Agenten eine [Statuszeile](./status-line.md) im Befehlsmodus | `/statusline show model and git branch` |
| `/terminal-setup` | Konfiguriert Terminal-Tastenkürzel für mehrzeilige Eingaben | `/terminal-setup` |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Benutzeroberflächen- und Ausgabesprache.

| Befehl | Beschreibung | Nutzungsbeispiele |
| --------------------- | -------------------------------- | -------------------------- |
| `/language` | Spracheinstellungen anzeigen oder ändern | `/language` |
| → `ui [language]` | UI-Sprache festlegen | `/language ui zh-CN` |
| → `output [language]` | Ausgabesprache des LLM festlegen | `/language output Chinese` |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch), `ja-JP` (Japanisch), `pt-BR` (Portugiesisch - Brasilien), `fr-FR` (Französisch), `ca-ES` (Katalanisch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und -Modellen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | Listet konfigurierte MCP-Server und -Tools auf | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | Importiert MCP-Server aus Claude-Konfigurationen | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | Zeigt die Liste der aktuell verfügbaren Tools an | `/tools`, `/tools desc` |
| `/skills` | Listet verfügbare Skills auf und führt sie aus | `/skills`, `/skills <name>` |
| `/plan` | Wechselt in den Plan-Modus oder beendet ihn | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | Ändert den Tool-Freigabemodus (nur für die aktuelle Session) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | Nur Analyse, keine Ausführung (sicheres Review) | `/approval-mode plan` |
| → `default` | Erfordert Freigabe für Edits (tägliche Nutzung) | `/approval-mode default` |
| → `auto-edit` | Edits automatisch freigeben (vertrauenswürdige Umgebung) | `/approval-mode auto-edit` |
| → `auto` | Classifier-basierte Freigabe (autonom) | `/approval-mode auto` |
| → `yolo` | Alles automatisch freigeben (schnelles Prototyping) | `/approval-mode yolo` |
| `/model` | Wechselt das in der aktuellen Session verwendete Modell | `/model`, `/model <model-id>` (sofortiger Wechsel) |
| `/model --fast` | Legt ein leichteres Modell für Prompt-Vorschläge fest | `/model --fast qwen3-coder-flash` |
| `/model --voice` | Legt das Modell für die Sprachtranskription fest | `/model --voice <model-id>` |
| `/model --vision` | Legt das Vision-Bridge-Modell fest, das verwendet wird, um Bilder für ein reines Text-Hauptmodell zu transkribieren | `/model --vision <model-id>` |
| `/effort` | Legt den Reasoning-Effort für Modelle mit Thinking-Fähigkeit fest | `/effort` (öffnet Picker), `/effort high` (low/medium/high/xhigh/max; wird je nach Provider gemappt und begrenzt) |
| `/extensions` | Verwaltet Extensions | `/extensions list`, `/extensions manage` |
| → `list` | Listet installierte Extensions auf | `/extensions list` |
| → `manage` | Verwaltet installierte Extensions (interaktiv) | `/extensions manage` |
| → `explore` | Öffnet die Extensions-Seite im Browser | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | Installiert eine Extension aus einem Git-Repo oder Pfad | `/extensions install <repo-or-path>` |
| `/memory` | Öffnet den Memory-Manager-Dialog | `/memory` |
| `/remember` | Speichert einen dauerhaften Memory-Eintrag | `/remember Prefer terse responses` |
| `/forget` | Entfernt passende Einträge aus dem Auto-Memory | `/forget <query>` |
| `/dream` | Führt manuell die Auto-Memory-Konsolidierung aus | `/dream` |
| `/hooks` | Verwaltet Qwen Code-Hooks | `/hooks`, `/hooks list` |
| `/permissions` | Verwaltet Berechtigungsregeln | `/permissions` |
| `/agents` | Verwaltet Subagenten | `/agents manage`, `/agents create` |
| `/arena` | Verwaltet Arena-Sessions | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (Alias `choose`) |
| `/goal` | Setzt ein Ziel – arbeitet weiter, bis die Bedingung erfüllt ist | `/goal <condition>`, `/goal clear` |
| `/tasks` | Listet Hintergrund-Tasks auf | `/tasks` |
| `/workflows` | Inspiziert Workflow-Ausführungen | `/workflows`, `/workflows <runId>` |
| `/lsp` | Zeigt den LSP-Server-Status an | `/lsp` |
| `/trust` | Verwaltet die Ordner-Vertrauenseinstellungen | `/trust` |

> [!warning]
>
> Installiere Extensions (`/extensions install`) nur aus Quellen, denen du vertraust. Extensions können MCP-Server, Skills und Befehle bündeln, die mit denselben Berechtigungen wie Qwen Code selbst ausgeführt werden – sie können auf deine Dateien, API-Keys und Konversationsdaten zugreifen. `/extensions install` fordert keine Bestätigung an.

> [!warning]
>
> Die Freigabemodi `auto-edit`, `auto` und `yolo` umgehen die Freigabe-Prompts für Tool-Ausführungen. Im `yolo`-Modus werden alle Aktionen – einschließlich Shell-Befehlen, Datei-Schreibvorgängen und Netzwerkanfragen – ohne Bestätigung ausgeführt. Verwende diese Modi nur in vertrauenswürdigen, sandboxed oder wegwerfbaren Umgebungen.

> [!note]
>
> `/workflows`, `/lsp` und `/trust` werden nur registriert, wenn die jeweilige Funktion aktiviert ist – über die Umgebungsvariable `QWEN_CODE_ENABLE_WORKFLOWS=1`, das CLI-Flag `--experimental-lsp` bzw. die Einstellung `security.folderTrust.enabled`. Wenn sie deaktiviert sind, werden sie nicht angezeigt und melden einen unbekannten Befehl.

### 1.5 Integrierte Skills

Diese Befehle rufen mitgelieferte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl | Beschreibung | Nutzungsbeispiele |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review` | Reviewt Code-Änderungen mit 9 parallelen Review-Agenten | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop` | Führt einen Prompt nach einem wiederkehrenden Zeitplan aus | `/loop 5m check the build` |
| `/simplify` | Reviewt recente Änderungen und wendet sichere Cleanup-Edits direkt an | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Beantwortet Fragen zur Nutzung und Konfiguration von Qwen Code | `/qc-helper how do I configure MCP?` |

Siehe [Code Review](./code-review.md) für die vollständige `/review`-Dokumentation.

### 1.6 Side Question (`/btw`)

Der Befehl `/btw` ermöglicht es dir, schnelle Side Questions zu stellen, ohne den Haupt-Konversationsfluss zu unterbrechen oder zu beeinträchtigen.

| Befehl | Beschreibung |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Stellt eine schnelle Side Question |
| `?btw <your question>` | Alternative Syntax für Side Questions |

**Funktionsweise:**

- Die Side Question wird als separater API-Call mit dem aktuellen Konversationskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird über dem Composer angezeigt – du kannst weiter tippen, während du wartest
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Side-Question-Antwort wird **nicht** Teil des Haupt-Konversationsverlaufs
- Antworten werden mit voller Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)
**Tastenkombinationen (Interaktiver Modus):**

| Tastenkombination    | Aktion                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Abbrechen (während des Ladens) oder ausblenden (nach Abschluss) |
| `Leertaste` oder `Enter`   | Antwort ausblenden (wenn die Eingabe leer ist)            |
| `Strg+C` oder `Strg+D` | Eine laufende Nebenfrage abbrechen                   |

**Beispiel:**

```
(Während sich die Hauptkonversation um das Refactoring von Code dreht)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Wird beantwortet...                    │
  │ Zum Abbrechen Escape, Strg+C oder Strg+D │
  │ drücken                                  │
  ╰──────────────────────────────────────────╯
  > (Composer bleibt aktiv — weitertippen)

(Nachdem die Antwort eingetroffen ist)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` ist blockweit gültig, während      │
  │ `var` funktionsweit gültig ist. `let`    │
  │ wurde in ES6 eingeführt und verhält sich │
  │ beim Hoisting anders.                    │
  │                                          │
  │ Zum Ausblenden Leertaste, Enter oder     │
  │ Escape drücken                           │
  ╰──────────────────────────────────────────╯
  > (Composer weiterhin aktiv)
```

**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                     |
| -------------------- | -------------------------------------------- |
| Interaktiv          | Zeigt über dem Composer mit Markdown-Rendering an |
| Nicht-interaktiv      | Gibt Textergebnis zurück: `btw> question\nanswer` |
| ACP (Agent Protocol) | Gibt asynchronen Generator für stream_messages zurück      |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne deine Hauptaufgabe zu unterbrechen. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu überprüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Session Recap (`/recap`)

Der Befehl `/recap` generiert eine kurze "Wo du stehengeblieben bist"-Zusammenfassung der
aktuellen Session, damit du eine alte Konversation fortsetzen kannst, ohne seitenweise
durch den Verlauf zu scrollen.

| Befehl  | Beschreibung                                |
| -------- | ------------------------------------------ |
| `/recap` | Generiert und zeigt eine einzeilige Session-Zusammenfassung |

**So funktioniert es:**

- Verwendet das konfigurierte schnelle Modell (`fastModel`-Einstellung), falls verfügbar, und fällt
  andernfalls auf das Haupt-Sessionsmodell zurück. Ein kleines, günstiges Modell reicht für eine Zusammenfassung aus.
- Die aktuelle Konversation (bis zu 30 Nachrichten, nur Text — Tool-Aufrufe und Tool-
  Antworten werden herausgefiltert) wird mit einem knappen System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in gedimmter Farbe mit einem `❯`-Präfix dargestellt, damit sie sich
  von echten Assistant-Antworten abhebt.
- Lehnt mit einer Inline-Fehlermeldung ab, wenn ein Modell-Turn läuft oder ein anderer Befehl
  verarbeitet wird. Wenn keine nutzbare Konversation vorhanden ist oder die zugrunde liegende
  Generierung fehlschlägt, zeigt `/recap` eine kurze Info-Nachricht anstelle einer Zusammenfassung —
  der manuelle Befehl antwortet immer mit irgendetwas.

**Auto-Trigger bei Rückkehr aus Abwesenheit:**

Wenn das Terminal für **5+ Minuten** den Fokus verliert und wieder fokussiert wird, wird eine Zusammenfassung
automatisch generiert und angezeigt (nur, wenn keine Modellantwort läuft;
andernfalls wartet es, bis der aktuelle Turn abgeschlossen ist, und wird dann ausgelöst).
Im Gegensatz zum manuellen Befehl ist der Auto-Trigger bei Fehlern völlig still: Wenn
die Generierung fehlerhaft ist oder es nichts zusammenzufassen gibt, wird keine Nachricht zum
Verlauf hinzugefügt. Gesteuert durch die Einstellung `general.showSessionRecap`
(Standard: `false`); der manuelle Befehl `/recap` funktioniert immer, unabhängig von
dieser Einstellung.

**Beispiel:**

```
> /recap

❯ Refactoring von loopDetectionService.ts, um den OOM bei langen Sessions zu beheben,
  der durch unbegrenztes streamContentHistory und contentStats verursacht wird. Der
  nächste Schritt ist die Implementierung von Option B (LRU-Sliding-Window mit FNV-1a),
  vorbehaltlich der Bestätigung.
```

> [!tip]
>
> Konfiguriere ein schnelles Modell über `/model --fast <model>` (z. B.
> `qwen3-coder-flash`), um `/recap` schnell und kostengünstig zu machen. Setze
> `general.showSessionRecap` auf `true`, um den Auto-Trigger zu aktivieren; der
> manuelle Befehl `/recap` funktioniert immer, unabhängig von dieser Einstellung.

### 1.8 Diff Viewer (`/diff`)

Der Befehl `/diff` öffnet einen interaktiven Diff-Viewer, der uncommitted Changes und Diffs pro Turn anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Konversations-Turns zu wechseln, ↑/↓, um durch Dateien zu navigieren, und Enter, um Inline-Diffs anzuzeigen.

**So funktioniert es:**

Im interaktiven Modus öffnet `/diff` einen Dialog mit einem **Source Picker** oben:

- **Current** — Working Tree vs HEAD (`git diff HEAD`). Zeigt alle uncommitted Changes an, einschließlich staged, unstaged und untracked Dateien.
- **T1, T2, T3, …** — Diffs pro Turn, ein Tab pro Modell-Turn, der Dateien geändert hat. Die neuesten Turns erscheinen zuerst. Jeder Tab zeigt eine Vorschau des ursprünglichen Prompts als Kontext.

Die Dateiliste zeigt dateibezogene Statistiken (hinzugefügte/entfernte Zeilen) mit Tags für spezielle Zustände (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Drücke Enter auf einer Datei, um ihren Inline-Diff mit syntaxhervorgehobenen Hunks anzuzeigen.

Diffs pro Turn erfordern, dass File Checkpointing aktiviert ist (im interaktiven Modus standardmäßig eingeschaltet). Wenn File Checkpointing deaktiviert ist, ist nur die Quelle "Current" verfügbar.

**Tastenkombinationen:**

| Taste     | Aktion                                      |
| --------- | ------------------------------------------- |
| `←` / `→` | Zwischen Quellen wechseln (Current / T1 / T2…) |
| `↑` / `↓` | Dateiliste navigieren                          |
| `j` / `k` | Dateiliste navigieren (Vim-Stil)              |
| Enter     | Inline-Diff für ausgewählte Datei anzeigen          |
| `←` / Esc | Zurück zur Dateiliste aus der Inline-Diff-Ansicht   |
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

In Headless- (`--prompt`) oder nicht-interaktiven Kontexten gibt `/diff` eine Plain-Text-Zusammenfassung des Working Tree vs HEAD aus. Die Navigation pro Turn ist nicht verfügbar.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und Vornehmen von Systemeinstellungen.

| Befehl          | Beschreibung                                                                                                                    | Nutzungsbeispiele                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | Hilfeinformationen für verfügbare Befehle anzeigen                                                                                | `/help` oder `/?`                                                                     |
| `/status`        | Versionsinformationen anzeigen                                                                                                    | `/status` oder `/about`                                                               |
| `/status paths`  | Pfade der aktuellen Session-Datei und Logs anzeigen                                                                                     | `/status paths`                                                                     |
| `/stats`         | Interaktives Dashboard für Nutzungsstatistiken öffnen (Tabs Session, Activity und Efficiency)                                       | `/stats` oder `/usage`                                                                |
| `/stats model`   | Token-Aufschlüsselung pro Modell und geschätzte Kosten anzeigen                                                                              | `/stats model`                                                                      |
| `/stats tools`   | Aufrufzahlen pro Tool anzeigen                                                                                                      | `/stats tools`                                                                      |
| `/stats skills`  | Aufrufzahlen pro Skill für die aktuelle Live-Session anzeigen (nur live; schließt sessionsübergreifende tägliche/monatliche Aktivität aus)             | `/stats skills`                                                                     |
| `/stats daily`   | Tägliche Token-Nutzungsstatistiken anzeigen                                                                                              | `/stats daily` (Alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Monatliche Token-Nutzungsstatistiken anzeigen                                                                                            | `/stats monthly` (Alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Nutzungsstatistiken nach CSV oder JSON exportieren                                                                                         | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Einstellungs-Editor öffnen                                                                                                           | `/settings`                                                                         |
| `/config`        | Beliebige Einstellung über Dot-Path-Key abrufen oder setzen (schreibt in Benutzereinstellungen)                                                              | `/config` (alle auflisten), `/config <key>`, `/config <key>=<value>`                      |
| `/auth`          | Authentifizierungsmethode ändern                                                                                                   | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Installations- und Umgebungsdiagnostics ausführen                                                                                   | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Speicher-Diagnostics des aktuellen Prozesses anzeigen                                                                                        | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | CPU-Profil für Chrome DevTools-Analyse aufzeichnen                                                                              | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Die Standalone-CLI-Binary auf die vorherige Version zurücksetzen (nur bei Standalone-Installationen; für Konversationsverlauf verwende `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Vollständige Qwen Code Dokumentation im Browser öffnen                                                                                   | `/docs`                                                                             |
| `/ide`           | IDE-Integration verwalten                                                                                                         | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Programmier-Insights aus dem Chat-Verlauf generieren                                                                                | `/insight`                                                                          |
| `/setup-github`  | GitHub Actions einrichten                                                                                                          | `/setup-github`                                                                     |
| `/bug`           | Issue zu Qwen Code melden                                                                                                   | `/bug Button click unresponsive`                                                    |
| `/copy`          | In Zwischenablage kopieren: Antwort (N-letzte), Code (nach Sprache), LaTeX oder Mermaid                                                         | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Qwen Code sofort beenden                                                                                                     | `/quit` oder `/exit`                                                                  |

> [!warning]
>
> `/doctor memory --snapshot` schreibt einen V8-Heap-Snapshot, der Prompts, Dateiinhalte, API-Keys und Tool-Ergebnisse der aktuellen Session enthalten kann. Überprüfe die Datei, bevor du sie teilst.

> [!note]
>
> `/config` liest und schreibt einzelne Einstellungen über Dot-Path-Keys (z. B. `general.vimMode`) und ergänzt den interaktiven `/settings`-Editor. Die Ausführung von `/config` ohne Argument (oder `--help`) listet jeden setzbaren Key mit seinem Typ und aktuellen Wert auf. `/config <key>` gibt den aktuellen Wert aus — außer bei booleschen Keys, wo es den Wert umschaltet. `/config <key>=<value>` setzt den Wert. Änderungen werden in die Benutzereinstellungen (`~/.qwen/settings.json`) geschrieben. Nur `boolean`, `string`, `number` und `enum` Einstellungen können auf diese Weise geändert werden — `array` und `object` Einstellungen müssen direkt in `settings.json` bearbeitet werden. Sensible Werte (API-Keys, Tokens, Base-URLs) werden in der Ausgabe maskiert, und das Setzen von `tools.approvalMode` auf `yolo` ist blockiert.

### 1.10 Allgemeine Tastenkombinationen

| Tastenkombination    | Funktion                | Hinweis                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Strg/cmd+L`       | Bildschirm löschen            | Löscht nur den sichtbaren Bildschirm (setzt die Session nicht zurück wie `/clear`) |
| `Strg/cmd+T`       | Tool-Beschreibung umschalten | MCP-Tool-Verwaltung                                                       |
| `Strg/cmd+C`×2     | Beenden-Bestätigung       | Sicherer Beenden-Mechanismus                                                     |
| `Strg/cmd+Z`       | Eingabe rückgängig machen              | Textbearbeitung                                                              |
| `Strg/cmd+Shift+Z` | Eingabe wiederherstellen              | Textbearbeitung                                                              |

### 1.11 Authentifizierungsbefehle

Verwende `/auth` innerhalb einer Qwen Code Session, um die Authentifizierung zu konfigurieren. Verwende `/doctor`, um den aktuellen Authentifizierungs- und Umgebungsstatus zu überprüfen.

| Befehl  | Beschreibung                                                            |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | Authentifizierung interaktiv konfigurieren (Aliase: `/connect`, `/login`) |
| `/doctor` | Authentifizierungs- und Umgebungsprüfungen anzeigen                             |

> [!note]
>
> Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Legacy-Aufrufe wie `qwen auth status` geben einen Entfernungshinweis mit Migrationsanleitung aus. Siehe die Seite [Authentication](../configuration/auth) für alle Details.

## 2. @-Befehle (Dateien einbinden)

@-Befehle werden verwendet, um schnell lokale Datei- oder Verzeichnisinhalte zur Konversation hinzuzufügen.

| Befehlsformat      | Beschreibung                                  | Beispiele                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Inhalt der angegebenen Datei einfügen             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Alle Textdateien im Verzeichnis rekursiv lesen | `@docs/ Summarize content of this document`      |
| Alleinstehendes `@`      | Wird verwendet, wenn das @-Symbol selbst besprochen wird       | `@ What is this symbol used for in programming?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@My\ Documents/file.txt`)

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat     | Beschreibung                                                        | Beispiele                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Befehl in Sub-Shell ausführen                                       | `!ls -la`, `!git status`               |
| Alleinstehendes `!`     | In den Shell-Modus wechseln, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabetaste) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichere häufig verwendete Prompts als Shortcut-Befehle, um die Arbeitseffizienz zu steigern und Konsistenz sicherzustellen.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Schneller Überblick

| Funktion         | Beschreibung                                | Vorteile                             | Priorität | Anwendungsfälle                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt doppelpunkt-benannte Befehle  | Bessere Befehlsorganisation            |          |                                                      |
| Globale Befehle  | `~/.qwen/commands/`                        | In allen Projekten verfügbar              | Niedrig      | Persönlich häufig genutzte Befehle, projektübergreifende Nutzung |
| Projektbefehle | `<project root directory>/.qwen/commands/` | Projektspezifisch, versionierbar | Hoch     | Team-Sharing, projektspezifische Befehle              |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (Projektbefehl wird verwendet, wenn die Namen gleich sind)

### Regeln für die Befehlsbenennung

#### Zuordnungstabelle von Dateipfad zu Befehlsname

| Dateispeicherort                            | Generierter Befehl | Beispielaufruf          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) wird in Doppelpunkt (`:`) umgewandelt

### Markdown-Dateiformat-Spezifikation (Empfohlen)

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
| `description` | Optional | Befehlsbeschreibung (in /help angezeigt) | `description: Code analysis tool`          |
| Prompt-Body   | Erforderlich | Prompt-Inhalt, der an das Modell gesendet wird             | Beliebiger Markdown-Inhalt nach dem Frontmatter |
### TOML-Dateiformat (Veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld | Erforderlich | Beschreibung | Beispiel |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt` | Erforderlich | Prompt-Inhalt, der an das Modell gesendet wird | `prompt = "Please analyze code: {{args}}"` |
| `description` | Optional | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code analysis tool"` |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode | Syntax | Anwendungsfälle | Sicherheitsfunktionen |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbewusste Injektion | `{{args}}` | Präzise Parametersteuerung erforderlich | Automatisches Shell-Escaping |
| Standard-Parameterverarbeitung | Keine spezielle Markierung | Einfache Befehle, Parameter anhängen | Unverändert anhängen |
| Shell-Befehlsinjektion | `!{command}` | Dynamische Inhalte erforderlich | Bestätigung vor der Ausführung erforderlich |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario | TOML-Konfiguration | Aufrufmethode | Tatsächliche Auswirkung |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Rohe Injektion | `prompt = "Fix: {{args}}"` | `/fix "Button issue"` | `Fix: "Button issue"` |
| In Shell-Befehl | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"` | Führt `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode | Beispiel |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Mit Parametern | An das Ende des Prompts anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Ursprünglicher Prompt + Parameter |
| Ohne Parameter | Prompt unverändert senden | `/cmd` → Ursprünglicher Prompt |

🚀 Dynamische Inhaltsinjektion

| Injektionstyp | Syntax | Verarbeitungsreihenfolge | Zweck |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Dateiinhalt | `@{file path}` | Wird zuerst verarbeitet | Statische Referenzdateien injizieren |
| Shell-Befehle | `!{command}` | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung | `{{args}}` | Wird zuletzt verarbeitet | Benutzerparameter injizieren |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang | Benutzerinteraktion |
| ------------------------------- | -------------------- |
| 1. Befehl und Parameter parsen | - |
| 2. Automatisches Shell-Escaping | - |
| 3. Bestätigungsdialog anzeigen | ✅ Benutzerbestätigung |
| 4. Befehl ausführen | - |
| 5. Ausgabe in Prompt injizieren | - |

Beispiel: Git-Commit-Nachricht generieren

````markdown
---
description: Generiert eine Commit-Nachricht basierend auf gestageten Änderungen
---

Bitte generiere eine Commit-Nachricht basierend auf dem folgenden Diff:

```diff
!{git diff --staged}
```
````

#### 4. Injektion von Dateiinhalten (`@{...}`)

| Dateityp | Support-Status | Verarbeitungsmethode |
| ------------ | ---------------------- | --------------------------- |
| Textdateien | ✅ Vollständige Unterstützung | Inhalt direkt injizieren |
| Bilder/PDF | ✅ Multimodale Unterstützung | Kodieren und injizieren |
| Binärdateien | ⚠️ Eingeschränkte Unterstützung | Werden möglicherweise übersprungen oder gekürzt |
| Verzeichnis | ✅ Rekursive Injektion | Folgt den .gitignore-Regeln |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Führe ein Review für {{args}} durch, Referenzstandards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Schritte zur Erstellung des Befehls "Pure Function Refactoring"

| Vorgang | Befehl/Code |
| ----------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor` |
| 2. Befehlsdatei erstellen | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten | Siehe den vollständigen Code unten. |
| 4. Befehl testen | `@file.js` → `/refactor:pure` |

```markdown
---
description: Code in eine pure Funktion refactoren
---

Bitte analysiere den Code im aktuellen Kontext und refactore ihn in eine pure Funktion.
Anforderungen:

1. Refactored Code bereitstellen
2. Wichtige Änderungen und die Implementierung der Pure-Function-Charakteristika erklären
3. Funktion unverändert lassen
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Empfehlungen für das Befehlsdesign

| Praxispunkte | Empfohlener Ansatz | Vermeiden |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Befehlsbenennung | Namespaces zur Organisation verwenden | Übermäßig generische Namen vermeiden |
| Parameterverarbeitung | `{{args}}` explizit verwenden | Sich auf das Standard-Anhängen verlassen (leicht verwirrend) |
| Fehlerbehandlung | Shell-Fehlerausgaben nutzen | Ausführungsfehler ignorieren |
| Dateiorganisation | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Stammverzeichnis |
| Beschreibungsfeld | Immer eine klare Beschreibung angeben | Sich auf automatisch generierte Beschreibungen verlassen |

#### Erinnerung an Sicherheitsfunktionen

| Sicherheitsmechanismus | Schutzwirkung | Benutzeraktion |
| ---------------------- | -------------------------- | ---------------------- |
| Shell-Escaping | Verhindert Command Injection | Automatische Verarbeitung |
| Ausführungsbestätigung | Verhindert versehentliche Ausführung | Bestätigung im Dialog |
| Fehlerberichterstattung | Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |

## 5. CLI-Subbefehle

Diese Befehle werden in der Shell als `qwen <subcommand>` ausgeführt, bevor eine interaktive Sitzung gestartet wird.

### Sitzungsverwaltung

| Befehl | Beschreibung | Nutzungsbeispiele |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | Listet kürzliche Konversationssitzungen auf | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Listet deine kürzlichen Qwen Code-Sitzungen mit Metadaten auf.

**Flags:**

| Flag | Typ | Standard | Beschreibung |
| --------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile) |
| `--limit` | number | `20` | Maximale Anzahl der anzuzeigenden Sitzungen |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: SESSION ID, STARTED (UTC-Zeitstempel), TITLE, BRANCH, PROMPT.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus. Jede Zeile ist ein JSON-Objekt mit den folgenden Feldern:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

Der "has more sessions"-Hinweis wird über stderr ausgegeben, sodass das Piping zu `jq` sicher bleibt.

**Beispiele:**

```bash
# Zeigt die letzten 20 Sitzungen an (Standard)
qwen sessions list

# Zeigt die letzten 50 Sitzungen an
qwen sessions list --limit 50

# Ausgabe als JSON für Skripte
qwen sessions list --json | jq .
```