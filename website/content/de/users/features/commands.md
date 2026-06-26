# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle und hilft Ihnen, Sitzungen effizient zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden über bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ                     | Funktionsbeschreibung                                     | Typischer Anwendungsfall                                             |
| ------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Slash-Befehle (`/`)            | Meta-Steuerung von Qwen Code selbst                       | Sitzungen verwalten, Einstellungen ändern, Hilfe erhalten            |
| At-Befehle (`@`)               | Lokalen Dateiinhalt schnell ins Gespräch einfügen         | KI erlauben, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`)   | Direkte Interaktion mit der System-Shell                  | Systembefehle wie `git status`, `ls` usw. ausführen                  |

## 1. Slash-Befehle (`/`)

Slash-Befehle dienen der Verwaltung von Qwen Code-Sitzungen, der Oberfläche und dem grundlegenden Verhalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen Ihnen, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl           | Beschreibung                                                              | Anwendungsbeispiele                                             |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/init`          | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen     | `/init`                                                         |
| `/summary`       | Projektzusammenfassung basierend auf dem Gesprächsverlauf generieren      | `/summary`                                                      |
| `/compress`      | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen           | `/compress` oder `/summarize`                                   |
| `/compress-fast` | Schnelle Komprimierung ohne KI – entfernt alte Tool-Ausgaben und Denkprozesse | `/compress-fast`                                              |
| `/resume`        | Eine vorherige Gesprächssitzung fortsetzen                                | `/resume` oder `/continue`                                      |
| `/recap`         | Sofort eine einzeilige Sitzungszusammenfassung generieren                 | `/recap`                                                        |
| `/restore`       | Projektdateien auf den Prüfpunkt vor einem Tool-Aufruf zurücksetzen       | `/restore` (auflisten) oder `/restore <ID>`                     |
| `/delete`        | Eine vorherige Sitzung löschen                                            | `/delete`                                                       |
| `/branch`        | Das aktuelle Gespräch in eine neue Sitzung aufteilen                      | `/branch`                                                       |
| `/fork`          | Einen Hintergrund-Agenten erzeugen, der das gesamte Gespräch erbt         | `/fork <Anweisung>`                                             |
| `/rewind`        | Gespräch auf einen vorherigen Schritt zurückspulen                        | `/rewind` oder `/rollback`                                      |
| `/export`        | Sitzungsverlauf in eine Datei exportieren                                 | `/export html`, `/export md`, `/export json`, `/export jsonl`   |
| `/rename`        | Aktuelle Sitzung umbenennen oder taggen                                   | `/rename My Feature` oder `/tag`                                |

> [!note]
>
> `/summarize` ist ein Alias für `/compress` (es komprimiert den Chatverlauf – ein destruktiver Vorgang). Verwenden Sie stattdessen `/summary`, um eine nicht-destruktive Projektzusammenfassung zu generieren.

### 1.2 Oberflächen- und Arbeitsbereichssteuerung

Befehle zum Anpassen des Oberflächenerscheinungsbilds und der Arbeitsumgebung.

| Befehl               | Beschreibung                                                                                                                                                                           | Anwendungsbeispiele                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/clear`             | Gesprächsverlauf löschen und Kontext freigeben                                                                                                                                         | `/clear`, `/reset`, `/new`                                                         |
| `/context`           | Aufschlüsselung der Kontextfensternutzung anzeigen                                                                                                                                     | `/context`                                                                         |
| → `detail`           | Aufschlüsselung der Nutzung pro Element anzeigen                                                                                                                                       | `/context detail`                                                                  |
| `/history`           | Anzeigeeinstellungen und Sichtbarkeit des Verlaufs steuern                                                                                                                             | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`  |
| `/diff`              | Interaktiven Diff-Viewer öffnen, der nicht-committete Änderungen und Änderungen pro Durchlauf anzeigt. ←/→ zum Wechseln zwischen aktuellem Git-Diff und einzelnen Gesprächsdurchläufen, ↑/↓ zum Durchblättern von Dateien | `/diff`                                                                       |
| `/theme`             | Visuelles Theme von Qwen Code ändern                                                                                                                                                   | `/theme`                                                                           |
| `/vim`               | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten                                                                                                                               | `/vim`                                                                             |
| `/voice`             | Spracheingabe umschalten                                                                                                                                                               | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`               |
| `/directory`         | Multi-Verzeichnis-Unterstützung für den Arbeitsbereich verwalten                                                                                                                       | `/dir add ./src,./tests`, `/dir show`                                              |
| `/cd`                | Diese Sitzung in ein neues Arbeitsverzeichnis verschieben                                                                                                                              | `/cd ../other-project`                                                             |
| `/editor`            | Dialog zum Auswählen eines unterstützten Editors öffnen                                                                                                                                | `/editor`                                                                          |
| `/statusline`        | Interaktiven [Statuszeilen](./status-line.md)-Voreinstellungsdialog öffnen                                                                                                             | `/statusline`                                                                      |
| `/statusline <text>` | Eine Befehlsmodus-[Statuszeile](./status-line.md) per Agent generieren                                                                                                                 | `/statusline show model and git branch`                                            |
| `/terminal-setup`    | Terminal-Tastenkombinationen für mehrzeilige Eingabe konfigurieren                                                                                                                     | `/terminal-setup`                                                                  |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                        | Anwendungsbeispiele            |
| --------------------- | ----------------------------------- | ------------------------------ |
| `/language`           | Spracheinstellungen anzeigen/ändern | `/language`                    |
| → `ui [language]`     | Sprache der Benutzeroberfläche setzen | `/language ui zh-CN`         |
| → `output [language]` | Ausgabesprache des LLM setzen       | `/language output Chinese`     |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch), `ja-JP` (Japanisch), `pt-BR` (Portugiesisch – Brasilien), `fr-FR` (Französisch), `ca-ES` (Katalanisch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und -Modellen.

| Befehl           | Beschreibung                                           | Anwendungsbeispiele                                                                                               |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `/mcp`           | Konfigurierte MCP-Server und -Tools auflisten          | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                                |
| `/import-config` | MCP-Server aus Claude-Konfigurationen importieren      | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project`        |
| `/tools`         | Aktuell verfügbare Tool-Liste anzeigen                 | `/tools`, `/tools desc`                                                                                           |
| `/skills`        | Verfügbare Skills auflisten und ausführen              | `/skills`, `/skills <name>`                                                                                       |
| `/plan`          | In den Planmodus wechseln oder den Planmodus verlassen | `/plan`, `/plan <task>`, `/plan exit`                                                                             |
| `/approval-mode` | Genehmigungsmodus für Tools ändern (nur aktuelle Sitzung) | `/approval-mode`, `/approval-mode auto-edit`                                                                    |
| → `plan`         | Nur Analyse, keine Ausführung (sichere Überprüfung)    | `/approval-mode plan`                                                                                             |
| → `default`      | Genehmigung für Bearbeitungen erforderlich (tägliche Nutzung) | `/approval-mode default`                                                                                  |
| → `auto-edit`    | Bearbeitungen automatisch genehmigen (vertrauenswürdige Umgebung) | `/approval-mode auto-edit`                                                                             |
| → `auto`         | Vom Klassifikator bewertete Genehmigung (autonom)      | `/approval-mode auto`                                                                                             |
| → `yolo`         | Alles automatisch genehmigen (schnelles Prototyping)   | `/approval-mode yolo`                                                                                             |
| `/model`         | In der aktuellen Sitzung verwendetes Modell wechseln   | `/model`, `/model <model-id>` (sofort wechseln)                                                                   |
| `/model --fast`  | Ein leichteres Modell für Eingabevorschläge festlegen  | `/model --fast qwen3-coder-flash`                                                                                 |
| `/model --voice` | Das für die Spracherkennung verwendete Modell festlegen | `/model --voice <model-id>`                                                                                       |
| `/extensions`    | Erweiterungen verwalten                                | `/extensions list`, `/extensions manage`                                                                          |
| → `list`         | Installierte Erweiterungen auflisten                   | `/extensions list`                                                                                                |
| → `manage`       | Installierte Erweiterungen verwalten (interaktiv)      | `/extensions manage`                                                                                              |
| → `explore`      | Erweiterungsseite im Browser öffnen                    | `/extensions explore <Gemini\|ClaudeCode>`                                                                        |
| → `install`      | Eine Erweiterung aus einem Git-Repo oder Pfad installieren | `/extensions install <repo-or-path>`                                                                          |
| `/memory`        | Den Memory-Manager-Dialog öffnen                       | `/memory`                                                                                                         |
| `/remember`      | Einen dauerhaften Speicher speichern                   | `/remember Prefer terse responses`                                                                                |
| `/forget`        | Passende Einträge aus dem automatischen Speicher entfernen | `/forget <query>`                                                                                             |
| `/dream`         | Automatische Speicherkonsolidierung manuell ausführen  | `/dream`                                                                                                          |
| `/hooks`         | Qwen Code-Hooks verwalten                              | `/hooks`, `/hooks list`                                                                                           |
| `/permissions`   | Berechtigungsregeln verwalten                          | `/permissions`                                                                                                    |
| `/agents`        | Unter-Agenten verwalten                                | `/agents manage`, `/agents create`                                                                                |
| `/arena`         | Arena-Sitzungen verwalten                              | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (Alias `choose`)                                  |
| `/goal`          | Ein Ziel setzen – weiterarbeiten, bis die Bedingung erfüllt ist | `/goal <condition>`, `/goal clear`                                                                         |
| `/tasks`         | Hintergrundaufgaben auflisten                          | `/tasks`                                                                                                          |
| `/workflows`     | Workflow-Ausführungen überprüfen                       | `/workflows`, `/workflows <runId>`                                                                                |
| `/lsp`           | LSP-Server-Status anzeigen                             | `/lsp`                                                                                                            |
| `/trust`         | Vertrauenseinstellungen für Ordner verwalten            | `/trust`                                                                                                          |

> [!warning]
>
> Installieren Sie Erweiterungen (`/extensions install`) nur aus Quellen, denen Sie vertrauen. Erweiterungen können MCP-Server, Skills und Befehle bündeln, die mit denselben Berechtigungen wie Qwen Code selbst ausgeführt werden – sie können auf Ihre Dateien, API-Schlüssel und Gesprächsdaten zugreifen. `/extensions install` fragt nicht nach einer Bestätigung.

> [!warning]
>
> Die Genehmigungsmodi `auto-edit`, `auto` und `yolo` umgehen Genehmigungsaufforderungen für Tool-Ausführungen. Im `yolo`-Modus werden alle Aktionen – einschließlich Shell-Befehle, Dateischreibvorgänge und Netzwerkanfragen – ohne Bestätigung ausgeführt. Verwenden Sie diese Modi nur in vertrauenswürdigen, isolierten oder wegwerfbaren Umgebungen.

> [!note]
>
> `/workflows`, `/lsp` und `/trust` werden nur registriert, wenn die entsprechende Funktion aktiviert ist – über die Umgebungsvariable `QWEN_CODE_ENABLE_WORKFLOWS=1`, das CLI-Flag `--experimental-lsp` und die Einstellung `security.folderTrust.enabled`. Sind sie deaktiviert, werden sie nicht angezeigt und melden einen unbekannten Befehl.

### 1.5 Integrierte Skills

Diese Befehle rufen gebündelte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl       | Beschreibung                                                              | Anwendungsbeispiele                                       |
| ------------ | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/review`    | Code-Änderungen mit 5 parallelen Agenten + deterministischer Analyse überprüfen | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Eine Eingabeaufforderung nach einem wiederkehrenden Zeitplan ausführen    | `/loop 5m check the build`                               |
| `/simplify`  | Aktuelle Änderungen überprüfen und sichere Bereinigungsbearbeitungen direkt anwenden | `/simplify`, `/simplify focus on duplication`   |
| `/qc-helper` | Fragen zur Nutzung und Konfiguration von Qwen Code beantworten            | `/qc-helper how do I configure MCP?`                     |

Vollständige Dokumentation zu `/review` finden Sie unter [Code Review](./code-review.md).

### 1.6 Nebenläufige Frage (`/btw`)

Der Befehl `/btw` ermöglicht es Ihnen, kurze Fragen nebenbei zu stellen, ohne den Hauptgesprächsfluss zu unterbrechen oder zu beeinflussen.

| Befehl                 | Beschreibung                           |
| ---------------------- | --------------------------------------- |
| `/btw <Ihre Frage>`    | Eine kurze Frage nebenbei stellen       |
| `?btw <Ihre Frage>`    | Alternative Syntax für Nebenbei-Fragen  |

**Funktionsweise:**

- Die Nebenbei-Frage wird als separater API-Aufruf mit dem aktuellen Gesprächskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird über dem Composer angezeigt – Sie können während des Wartens weiter tippen
- Das Hauptgespräch wird **nicht blockiert** – es läuft unabhängig weiter
- Die Antwort der Nebenbei-Frage wird **nicht** Teil des Hauptgesprächsverlaufs
- Antworten werden mit vollständiger Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)

**Tastaturkürzel (Interaktiver Modus):**

| Kürzel               | Aktion                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Abbrechen (während des Ladens) oder verwerfen (nach Abschluss) |
| `Leertaste` oder `Enter` | Antwort verwerfen (wenn die Eingabe leer ist)          |
| `Strg+C` oder `Strg+D` | Eine laufende Nebenbei-Frage abbrechen               |

**Beispiel:**

```
(Während das Hauptgespräch über das Refactoring von Code handelt)

> /btw Was ist der Unterschied zwischen let und var in JavaScript?

  ╭────────────────────────────────────────────────────────╮
  │ /btw Was ist der Unterschied zwischen let und var     │
  │     in JavaScript?                                    │
  │                                                       │
  │ + Antwort wird erstellt...                            │
  │ Drücken Sie Escape, Strg+C oder Strg+D zum Abbrechen  │
  ╰────────────────────────────────────────────────────────╯
  > (Composer bleibt aktiv – tippen Sie weiter)

(Nachdem die Antwort eingetroffen ist)

  ╭────────────────────────────────────────────────────────╮
  │ /btw Was ist der Unterschied zwischen let und var     │
  │     in JavaScript?                                    │
  │                                                       │
  │ `let` ist blockbezogen, während `var`                  │
  │ funktionsbezogen ist. `let` wurde in ES6 eingeführt    │
  │ und hoisted nicht auf die gleiche Weise.               │
  │                                                       │
  │ Drücken Sie Leertaste, Enter oder Escape zum Verwerfen│
  ╰────────────────────────────────────────────────────────╯
  > (Composer noch aktiv)
```
**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| Interaktiv           | Zeigt oberhalb des Composers mit Markdown-Rendering an                    |
| Nicht-interaktiv     | Gibt Textergebnis zurück: `btw> Frage\nAntwort`                           |
| ACP (Agentenprotokoll) | Gibt `stream_messages` asynchronen Generator zurück                     |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne deine Hauptaufgabe zu unterbrechen. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu überprüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Sitzungszusammenfassung (`/recap`)

Der Befehl `/recap` erzeugt eine kurze Zusammenfassung des aktuellen Stands der Sitzung, sodass du eine alte Unterhaltung fortsetzen kannst, ohne seitenweise durch den Verlauf scrollen zu müssen.

| Befehl    | Beschreibung                                            |
| --------- | ------------------------------------------------------- |
| `/recap`  | Erzeugt eine einzeilige Sitzungszusammenfassung und zeigt sie an |

**Funktionsweise:**

- Verwendet das konfigurierte schnelle Modell (`fastModel`-Einstellung), falls verfügbar, andernfalls wird auf das Hauptsitzungsmodell zurückgegriffen. Ein kleines, günstiges Modell reicht für eine Zusammenfassung aus.
- Der aktuelle Gesprächsverlauf (maximal 30 Nachrichten, nur Text – Tool-Aufrufe und Tool-Antworten werden herausgefiltert) wird mit einem knappen System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in gedimmter Farbe mit einem `❯`-Präfix dargestellt, damit sie sich von echten Assistentenantworten abhebt.
- Falls gerade eine Modell-Antwort läuft oder ein anderer Befehl verarbeitet wird, erscheint eine Inline-Fehlermeldung. Wenn kein brauchbarer Gesprächsverlauf vorliegt oder die Generierung fehlschlägt, zeigt `/recap` stattdessen eine kurze Info-Nachricht an – der manuelle Befehl gibt immer eine Rückmeldung.

**Automatische Auslösung bei Rückkehr aus Abwesenheit:**

Wenn das Terminal für **5+ Minuten** in den Hintergrund gerät und wieder fokussiert wird, wird eine Zusammenfassung automatisch generiert und angezeigt (nur wenn keine Modell-Antwort läuft; andernfalls wird gewartet, bis der aktuelle Durchgang beendet ist, und dann ausgelöst). Im Gegensatz zum manuellen Befehl ist die automatische Auslösung bei Fehlern vollständig still: Wenn die Generierung fehlschlägt oder nichts zusammenzufassen ist, wird keine Nachricht zum Verlauf hinzugefügt. Gesteuert durch die Einstellung `general.showSessionRecap` (Standard: `false`); der manuelle Befehl `/recap` funktioniert unabhängig von dieser Einstellung immer.

**Beispiel:**

```
> /recap

❯ Refactoring von loopDetectionService.ts zur Behebung von OOM-Problemen bei langen Sitzungen,
  verursacht durch unbegrenzte streamContentHistory und contentStats. Der nächste Schritt ist die
  Implementierung von Option B (LRU-Sliding-Window mit FNV-1a) – noch ausstehend.
```

> [!tip]
>
> Konfiguriere ein schnelles Modell über `/model --fast <model>` (z. B. `qwen3-coder-flash`), um `/recap` schnell und günstig zu machen. Setze `general.showSessionRecap` auf `true`, um die automatische Auslösung zu aktivieren; der manuelle Befehl `/recap` funktioniert unabhängig von dieser Einstellung immer.

### 1.8 Diff-Viewer (`/diff`)

Der Befehl `/diff` öffnet einen interaktiven Diff-Viewer, der nicht committete Änderungen sowie Diff-Ansichten pro Durchgang anzeigt. Verwende ←/→, um zwischen dem aktuellen Git-Diff und einzelnen Gesprächsdurchgängen zu wechseln, ↑/↓, um durch die Dateien zu blättern, und Enter, um Inline-Diffs anzuzeigen.

**Funktionsweise:**

Im interaktiven Modus öffnet `/diff` einen Dialog mit einem **Quellen-Auswahlfeld** oben:

- **Aktuell** — Arbeitsverzeichnis vs. HEAD (`git diff HEAD`). Zeigt alle nicht committeten Änderungen, einschließlich gestageter, ungestageter und nicht verfolgter Dateien.
- **T1, T2, T3, …** — Diff-Ansichten pro Durchgang, ein Tab pro Modell-Durchgang, der Dateien geändert hat. Die neuesten Durchgänge erscheinen zuerst. Jeder Tab zeigt einen Vorschautext des ursprünglichen Prompts für den Kontext.

Die Dateiliste zeigt Dateistatistiken (hinzugefügte/entfernte Zeilen) mit Tags für besondere Zustände (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Drücke Enter auf einer Datei, um ihr Inline-Diff mit syntax-hervorgehobenen Hunk-Abschnitten anzuzeigen.

Diff-Ansichten pro Durchgang erfordern, dass die Datei-Checkpointing aktiviert ist (im interaktiven Modus standardmäßig eingeschaltet). Wenn die Datei-Checkpointing deaktiviert ist, ist nur die Quelle „Aktuell" verfügbar.

**Tastaturkürzel:**

| Taste         | Aktion                                                  |
| ------------- | ------------------------------------------------------- |
| `←` / `→`     | Zwischen Quellen wechseln (Aktuell / T1 / T2…)          |
| `↑` / `↓`     | Dateiliste navigieren                                   |
| `j` / `k`     | Dateiliste navigieren (vim-artig)                       |
| Enter         | Inline-Diff für ausgewählte Datei anzeigen              |
| `←` / Esc     | Von Inline-Diff zurück zur Dateiliste                   |
| Esc           | Dialog schließen                                        |

**Beispiel:**

```
┌ /diff · Durchgang 3 „refactor the auth middleware" ──── 3 Dateien +45 -12 ┐
│                                                                             │
│ ◀ Aktuell · T3 · T2 · T1 ▶                                                 │
│                                                                             │
│ › src/utils/parser.ts                              +30 -8                   │
│   src/utils/parser.test.ts                         +12 -2                   │
│   README.md                                        +3 -2                    │
│                                                                             │
│ ←/→ Quelle · ↑/↓ Datei · Enter anzeigen · Esc schließen                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Nicht-interaktiver Modus:**

Im Headless-Modus (`--prompt`) oder in nicht-interaktiven Kontexten gibt `/diff` eine reine Textzusammenfassung des Arbeitsverzeichnisses vs. HEAD aus. Eine Navigation pro Durchgang ist nicht verfügbar.

```
3 Dateien geändert, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zur Systemkonfiguration.

| Befehl            | Beschreibung                                                                                                                 | Verwendungsbeispiele                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/help`           | Hilfeinformationen zu verfügbaren Befehlen anzeigen                                                                          | `/help` oder `/?`                                                                 |
| `/status`         | Versionsinformationen anzeigen                                                                                               | `/status` oder `/about`                                                           |
| `/status paths`   | Aktuelle Sitzungsdatei- und Log-Pfade anzeigen                                                                               | `/status paths`                                                                   |
| `/stats`          | Interaktives Nutzungsstatistik-Dashboard öffnen (Registerkarten: Sitzung, Aktivität und Effizienz)                           | `/stats` oder `/usage`                                                            |
| `/stats model`    | Token-Aufschlüsselung pro Modell und geschätzte Kosten anzeigen                                                              | `/stats model`                                                                    |
| `/stats tools`    | Aufrufzahlen pro Tool anzeigen                                                                                               | `/stats tools`                                                                    |
| `/stats skills`   | Aufrufzahlen pro Skill für die aktuelle Live-Sitzung anzeigen (nur live; schließt sitzungsübergreifende tägliche/monatliche Aktivität aus) | `/stats skills`                                                         |
| `/stats daily`    | Tägliche Token-Nutzungsstatistik anzeigen                                                                                    | `/stats daily` (Alias `day`), `/stats day [YYYY-MM-DD]`                           |
| `/stats monthly`  | Monatliche Token-Nutzungsstatistik anzeigen                                                                                  | `/stats monthly` (Alias `month`), `/stats month [YYYY-MM]`                        |
| `/stats export`   | Nutzungsstatistiken als CSV oder JSON exportieren                                                                            | `/stats export <daily\|monthly> [Datum\|Monat] [--format csv\|json] [--output Pfad]` |
| `/settings`       | Einstellungen-Editor öffnen                                                                                                  | `/settings`                                                                       |
| `/auth`           | Authentifizierungsmethode ändern                                                                                             | `/auth`, `/connect`, `/login`                                                     |
| `/doctor`         | Installations- und Umgebungsdiagnose durchführen                                                                             | `/doctor`, `/doctor memory`                                                       |
| → `memory`        | Aktuelle Prozessspeicherdiagnose anzeigen                                                                                    | `/doctor memory [--json] [--sample] [--snapshot]`                                 |
| → `cpu-profile`   | CPU-Profil für Chrome DevTools-Analyse aufzeichnen                                                                           | `/doctor cpu-profile [--duration <Sekunden>]`                                     |
| → `rollback`      | Standalone-CLI-Binärdatei auf die vorherige Version zurücksetzen (nur Standalone-Installationen; für Gesprächsverlauf `/rewind` verwenden) | `/doctor rollback`                                                      |
| `/docs`           | Vollständige Qwen Code-Dokumentation im Browser öffnen                                                                       | `/docs`                                                                           |
| `/ide`            | IDE-Integration verwalten                                                                                                    | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                      |
| `/insight`        | Programmiereinblicke aus dem Gesprächsverlauf generieren                                                                     | `/insight`                                                                        |
| `/setup-github`   | GitHub Actions einrichten                                                                                                    | `/setup-github`                                                                   |
| `/bug`            | Problem zu Qwen Code melden                                                                                                  | `/bug Button-Klick reagiert nicht`                                                |
| `/copy`           | In die Zwischenablage kopieren: Antwort (Nth-letzte), Code (nach Sprache), LaTeX oder Mermaid                                | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                |
| `/quit`           | Qwen Code sofort beenden                                                                                                     | `/quit` oder `/exit`                                                              |

> [!warning]
>
> `/doctor memory --snapshot` schreibt einen V8-Heap-Snapshot, der Prompts, Dateiinhalte, API-Keys und Tool-Ergebnisse der aktuellen Sitzung enthalten kann. Prüfe die Datei, bevor du sie teilst.

### 1.10 Allgemeine Tastaturkürzel

| Tastenkombination | Funktion                | Hinweis                                                                 |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| `Strg/cmd+L`      | Bildschirm löschen      | Löscht nur den sichtbaren Bildschirm (setzt die Sitzung nicht zurück wie `/clear`) |
| `Strg/cmd+T`      | Tool-Beschreibung umschalten | MCP-Toolverwaltung                                                   |
| `Strg/cmd+C`×2    | Beenden bestätigen      | Sicheres Beenden                                                        |
| `Strg/cmd+Z`      | Eingabe rückgängig      | Textbearbeitung                                                         |
| `Strg/cmd+Umschalt+Z` | Eingabe wiederherstellen | Textbearbeitung                                                     |

### 1.11 Authentifizierungsbefehle

Verwende `/auth` innerhalb einer Qwen Code-Sitzung, um die Authentifizierung zu konfigurieren. Verwende `/doctor`, um den aktuellen Authentifizierungs- und Umgebungsstatus zu überprüfen.

| Befehl     | Beschreibung                                                                 |
| ---------- | ---------------------------------------------------------------------------- |
| `/auth`    | Authentifizierung interaktiv konfigurieren (Aliase: `/connect`, `/login`)    |
| `/doctor`  | Authentifizierungs- und Umgebungsprüfungen anzeigen                          |

> [!note]
>
> Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Legacy-Aufrufe wie `qwen auth status` geben einen Hinweis zur Entfernung mit Migrationsanleitung aus. Vollständige Details findest du auf der Seite [Authentifizierung](../configuration/auth).

## 2. @-Befehle (Dateien einfügen)

@-Befehle werden verwendet, um schnell den Inhalt lokaler Dateien oder Verzeichnisse zum Gespräch hinzuzufügen.

| Befehlsformat            | Beschreibung                                          | Beispiele                                                     |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------- |
| `@<Dateipfad>`            | Inhalt der angegebenen Datei einfügen                 | `@src/main.py Bitte erkläre diesen Code`                      |
| `@<Verzeichnispfad>`     | Alle Textdateien im Verzeichnis rekursiv einlesen     | `@docs/ Fasse den Inhalt dieses Dokuments zusammen`           |
| Alleinstehendes `@`      | Wird verwendet, wenn das `@`-Symbol selbst besprochen wird | `@ Wofür wird dieses Symbol in der Programmierung verwendet?` |

Hinweis: Leerzeichen in Pfaden müssen mit Backslash maskiert werden (z. B. `@Meine\ Dokumente/datei.txt`)

## 3. Ausrufezeichen-Befehle (`!`) – Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt in Qwen Code auszuführen.

| Befehlsformat            | Beschreibung                                                      | Beispiele                                 |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| `!<Shell-Befehl>`        | Befehl in einer Sub-Shell ausführen                               | `!ls -la`, `!git status`                 |
| Alleinstehendes `!`      | Shell-Modus wechseln; jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Enter) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichere häufig verwendete Prompts als Abkürzungsbefehle, um die Arbeitseffizienz zu steigern und Konsistenz zu gewährleisten.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird ein automatischer Migrationshinweis angezeigt.

### Kurzübersicht

| Funktion         | Beschreibung                                    | Vorteile                               | Priorität | Anwendungsszenarien                                      |
| ---------------- | ----------------------------------------------- | -------------------------------------- | --------- | -------------------------------------------------------- |
| Namensraum       | Unterverzeichnis erstellt Doppelpunkt-Befehle    | Bessere Befehlsorganisation            |           |                                                         |
| Globale Befehle  | `~/.qwen/commands/`                             | In allen Projekten verfügbar           | Niedrig   | Persönliche häufig verwendete Befehle, projektübergreifend |
| Projekt-Befehle  | `<Projektstammverzeichnis>/.qwen/commands/`     | Projektspezifisch, versionierbar       | Hoch      | Team-Sharing, projektspezifische Befehle                 |

Prioritätsregel: Projekt-Befehle > Benutzer-Befehle (bei gleichem Namen wird der Projektbefehl verwendet)

### Befehlsnamensregeln

#### Zuordnung von Dateipfad zu Befehlsnamen

| Dateispeicherort                          | Erzeugter Befehl  | Beispielaufruf            |
| ----------------------------------------- | ----------------- | ------------------------- |
| `~/.qwen/commands/test.md`                | `/test`           | `/test Parameter`         |
| `<Projekt>/.qwen/commands/git/commit.md`  | `/git:commit`     | `/git:commit Nachricht`   |

Namensregel: Pfadtrenner (`/` oder `\`) wird durch Doppelpunkt (`:`) ersetzt.

### Markdown-Dateiformat (empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Dein Prompt-Inhalt hier.
Verwende {{args}} für die Parameter-Injektion.
```

| Feld         | Erforderlich | Beschreibung                          | Beispiel                                  |
| ------------ | ------------ | ------------------------------------- | ----------------------------------------- |
| `description`| Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description: Code-Analyse-Tool`        |
| Prompt-Text  | Erforderlich | An das Modell gesendeter Prompt-Inhalt | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird noch unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld         | Erforderlich | Beschreibung                          | Beispiel                                    |
| ------------ | ------------ | ------------------------------------- | ------------------------------------------- |
| `prompt`     | Erforderlich | An das Modell gesendeter Prompt-Inhalt | `prompt = "Bitte analysiere den Code: {{args}}"` |
| `description`| Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code-Analyse-Tool"`       |

### Parameter-Verarbeitungsmechanismus

| Verarbeitungsmethode            | Syntax              | Anwendungsszenarien                 | Sicherheitsfunktionen                      |
| ------------------------------- | ------------------- | ----------------------------------- | ------------------------------------------ |
| Kontextbewusste Injektion       | `{{args}}`          | Präzise Parametersteuerung nötig    | Automatisches Shell-Escaping               |
| Standard-Parameterverarbeitung  | Keine besondere Markierung | Einfache Befehle, Parameter anhängen | Anhängen ohne Änderungen                  |
| Shell-Befehls-Injektion         | `!{command}`        | Dynamischer Inhalt nötig            | Bestätigung vor Ausführung erforderlich    |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario              | TOML-Konfiguration                       | Aufrufmethode           | Tatsächliche Wirkung           |
| --------------------- | ---------------------------------------- | ----------------------- | ------------------------------ |
| Rohe Injektion        | `prompt = "Behebung: {{args}}"`          | `/fix "Button Problem"` | `Behebung: "Button Problem"`   |
| In Shell-Befehl       | `prompt = "Suche: !{grep {{args}} .}"`   | `/search "hallo"`       | Führt `grep "hallo" .` aus     |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                                  | Beispiel                                                     |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Mit Parametern   | Am Ende des Prompts anhängen (getrennt durch zwei Zeilenumbrüche)     | `/cmd Parameter` → Original-Prompt + Parameter               |
| Ohne Parameter   | Prompt unverändert senden                                             | `/cmd` → Original-Prompt                                     |
🚀 Dynamische Inhaltsinjektion

| Injektionstyp         | Syntax             | Verarbeitungsreihenfolge | Zweck                               |
| --------------------- | ------------------ | ------------------------ | ----------------------------------- |
| Dateiinhalt           | `@{file path}`     | Zuerst verarbeitet       | Statische Referenzdateien einfügen  |
| Shell-Befehle         | `!{command}`       | In der Mitte verarbeitet | Dynamische Ausführungsergebnisse einfügen |
| Parameterersetzung    | `{{args}}`         | Zuletzt verarbeitet      | Benutzerparameter einfügen          |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                        | Benutzerinteraktion     |
| ------------------------------ | ----------------------- |
| 1. Befehl und Parameter parsen | -                       |
| 2. Automatisches Shell-Escaping| -                       |
| 3. Bestätigungsdialog anzeigen | ✅ Benutzerbestätigung  |
| 4. Befehl ausführen            | -                       |
| 5. Ausgabe in Prompt einfügen  | -                       |

Beispiel: Generierung von Git-Commit-Nachrichten

````markdown
---
description: Generiere eine Commit-Nachricht basierend auf den gestagten Änderungen
---

Bitte generiere eine Commit-Nachricht basierend auf folgendem Diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhalt-Injektion (`@{...}`)

| Dateityp     | Unterstützungsstatus      | Verarbeitungsmethode           |
| ------------ | ------------------------- | ------------------------------ |
| Textdateien  | ✅ Volle Unterstützung    | Inhalt direkt einfügen         |
| Bilder/PDF   | ✅ Multimodale Unterstützung | Kodieren und einfügen        |
| Binärdateien | ⚠️ Eingeschränkte Unterstützung | Kann übersprungen oder abgeschnitten werden |
| Verzeichnis  | ✅ Rekursive Injektion    | Befolgt .gitignore-Regeln      |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Überprüfe {{args}}, Referenzstandards:

@{docs/code-standards.md}
```

### Praxisbeispiel zur Erstellung

#### Tabelle der Erstellungsschritte für den Befehl „Pure Function Refactoring“

| Vorgang                      | Befehl/Code                              |
| ---------------------------- | ---------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`    |
| 2. Befehlsdatei erstellen    | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten  | Siehe vollständigen Code unten.          |
| 4. Befehl testen             | `@file.js` → `/refactor:pure`            |

```markdown
---
description: Code zu einer reinen Funktion umgestalten
---

Bitte analysiere den Code im aktuellen Kontext und gestalte ihn zu einer reinen Funktion um.
Anforderungen:

1. Umgestalteten Code bereitstellen
2. Wichtige Änderungen und die Implementierung der Eigenschaften einer reinen Funktion erklären
3. Funktion unverändert lassen
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Tabelle mit Empfehlungen zum Befehlsdesign

| Praktiken           | Empfohlener Ansatz                    | Vermeiden                                    |
| ------------------- | ------------------------------------- | -------------------------------------------- |
| Befehlsbenennung    | Namensräume zur Organisation verwenden | Zu allgemeine Namen vermeiden                |
| Parameterverarbeitung | Deutlich `{{args}}` verwenden         | Auf Standardanhängung verlassen (leicht zu verwechseln) |
| Fehlerbehandlung    | Shell-Fehlerausgabe nutzen            | Ausführungsfehler ignorieren                 |
| Dateiorganisation   | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Wurzelverzeichnis          |
| Beschreibungsfeld   | Immer eine klare Beschreibung angeben | Auf automatisch generierte Beschreibung verlassen |

#### Tabelle der Sicherheitsfunktionen

| Sicherheitsmechanismus | Schutzwirkung                     | Benutzeraktion              |
| ---------------------- | --------------------------------- | --------------------------- |
| Shell-Escaping         | Verhindert Befehlsinjektion       | Automatische Verarbeitung   |
| Ausführungsbestätigung | Vermeidet versehentliche Ausführung | Dialogbestätigung         |
| Fehlerberichterstattung | Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |

## 5. CLI-Unterbefehle

Diese Befehle werden von der Shell als `qwen <unterbefehl>` ausgeführt, bevor eine interaktive Sitzung gestartet wird.

### Sitzungsverwaltung

| Befehl                 | Beschreibung                         | Anwendungsbeispiele                                        |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `qwen sessions list`   | Letzte Konversationssitzungen auflisten | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Listet Ihre letzten Qwen Code-Sitzungen mit Metadaten auf.

**Flags:**

| Flag      | Typ     | Standard | Beschreibung                                            |
| --------- | ------- | -------- | -------------------------------------------------------- |
| `--json`  | boolean | `false`  | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile)       |
| `--limit` | number  | `20`     | Maximale Anzahl anzuzeigender Sitzungen                  |

**Für Menschen lesbare Ausgabe (Standard):**

Eine Tabelle mit Spalten: SESSION ID, STARTED (UTC-Zeitstempel), TITLE, BRANCH, PROMPT.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus. Jede Zeile ist ein JSON-Objekt mit Feldern:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

Der Hinweis „has more sessions“ wird über stderr ausgegeben, sodass das Weiterleiten an `jq` sicher bleibt.

**Beispiele:**

```bash
# Die letzten 20 Sitzungen anzeigen (Standard)
qwen sessions list

# Die letzten 50 Sitzungen anzeigen
qwen sessions list --limit 50

# Als JSON für Skripte ausgeben
qwen sessions list --json | jq .
```