# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle und hilft Ihnen, Sitzungen effizient zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden durch bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ                | Funktionsbeschreibung                                | Typischer Anwendungsfall                                         |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Slash-Befehle (`/`)       | Meta-Steuerung von Qwen Code selbst                  | Sitzungen verwalten, Einstellungen ändern, Hilfe erhalten        |
| At-Befehle (`@`)          | Lokalen Dateiinhalt schnell in die Konversation einfügen | Ermöglicht der KI, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell             | Ausführen von Systembefehlen wie `git status`, `ls` usw.         |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sitzungen, die Oberfläche und das grundlegende Verhalten zu verwalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen Ihnen, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl          | Beschreibung                                                              | Anwendungsbeispiele                                             |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/init`         | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen     | `/init`                                                         |
| `/summary`      | Projektzusammenfassung basierend auf Konversationsverlauf generieren      | `/summary`                                                      |
| `/compress`     | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen           | `/compress`                                                     |
| `/compress-fast`| Schnelle Komprimierung ohne KI – entfernt alte Tool-Ausgaben und Denkteile | `/compress-fast`                                                |
| `/resume`       | Eine vorherige Konversationssitzung fortsetzen                            | `/resume`                                                       |
| `/recap`        | Jetzt ein einzeiliges Sitzungs-Recap erstellen                            | `/recap`                                                        |
| `/restore`      | Projektdateien auf den Prüfpunkt vor der Ausführung eines Tool-Aufrufs zurücksetzen | `/restore` (Liste) oder `/restore <ID>`                  |
| `/delete`       | Eine vorherige Sitzung löschen                                            | `/delete`                                                       |
| `/branch`       | Die aktuelle Konversation in eine neue Sitzung abzweigen                  | `/branch`                                                       |
| `/fork`         | Einen Hintergrundagenten erzeugen, der die gesamte Konversation erbt      | `/fork <Anweisung>`                                             |
| `/rewind`       | Konversation zu einer vorherigen Runde zurückspulen                       | `/rewind` oder `/rollback`                                      |
| `/export`       | Sitzungsverlauf in Datei exportieren                                      | `/export html`, `/export md`, `/export json`, `/export jsonl`   |
| `/rename`       | Aktuelle Sitzung umbenennen oder markieren                                | `/rename My Feature` oder `/tag`                                |

### 1.2 Oberflächen- und Arbeitsbereichssteuerung

Befehle zum Anpassen des Oberflächenerscheinungsbilds und der Arbeitsumgebung.

| Befehl                 | Beschreibung                                                                                                                                                                       | Anwendungsbeispiele                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/clear`               | Terminalbildschirminhalt löschen                                                                                                                                                    | `/clear` (Shortcut: `Strg+L`)                                                      |
| `/context`             | Aufschlüsselung der Context-Window-Nutzung anzeigen                                                                                                                                 | `/context`                                                                         |
| → `detail`             | Aufschlüsselung der Context-Nutzung pro Element anzeigen                                                                                                                            | `/context detail`                                                                  |
| `/history`             | Einstellungen zur Anzeige des Verlaufs und Sichtbarkeit steuern                                                                                                                     | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`  |
| `/diff`                | Einen interaktiven Diff-Viewer öffnen, der unbestätigte Änderungen und rundenbezogene Diffs anzeigt. Verwenden Sie ←/→, um zwischen aktuellem Git-Diff und einzelnen Konversationsrunden zu wechseln, ↑/↓ zum Durchblättern von Dateien | `/diff`                                                                            |
| `/theme`               | Visuelles Theme von Qwen Code ändern                                                                                                                                               | `/theme`                                                                           |
| `/vim`                 | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten                                                                                                                            | `/vim`                                                                             |
| `/voice`               | Sprachdiktateingabe umschalten                                                                                                                                                      | `/voice`, `/voice status`                                                          |
| `/directory`           | Arbeitsbereich mit Unterstützung für mehrere Verzeichnisse verwalten                                                                                                                | `/dir add ./src,./tests`                                                           |
| `/cd`                  | Diese Sitzung in ein neues Arbeitsverzeichnis verschieben                                                                                                                           | `/cd ../other-project`                                                             |
| `/editor`              | Dialog zum Auswählen eines unterstützten Editors öffnen                                                                                                                             | `/editor`                                                                          |
| `/statusline`          | Interaktiven Dialog für Statuszeilen-Voreinstellungen öffnen                                                                                                                        | `/statusline`                                                                      |
| `/statusline <text>`   | Eine Statuszeile im Befehlsmodus über den Agenten generieren                                                                                                                        | `/statusline show model and git branch`                                            |
| `/terminal-setup`      | Terminal-Tastenkombinationen für mehrzeilige Eingabe konfigurieren | `/terminal-setup`    | Terminal-Tastenkombinationen für mehrzeilige Eingabe konfigurieren                                                                                                                                | `/terminal-setup`    | Terminal-Tastenkombinationen für mehrzeilige Eingabe konfigurieren                                                                                                                                | `/terminal-setup`    | Terminal-Tastenkombinationen für mehrzeilige Eingabe konfigurieren
### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl              | Beschreibung                          | Beispiele                      |
| ------------------- | ------------------------------------- | ------------------------------ |
| `/language`         | Spracheinstellungen anzeigen oder ändern | `/language`                    |
| → `ui [Sprache]`    | UI-Oberflächensprache festlegen       | `/language ui de-DE`           |
| → `output [Sprache]`| LLM-Ausgabesprache festlegen          | `/language output Deutsch`     |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch), `ja-JP` (Japanisch), `pt-BR` (Portugiesisch – Brasilien), `fr-FR` (Französisch), `ca-ES` (Katalanisch)
- Beispiele für Ausgabesprachen: `Chinesisch`, `Englisch`, `Japanisch` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und -Modellen.

| Befehl            | Beschreibung                                        | Beispiele                                                                        |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/mcp`            | Konfigurierte MCP-Server und -Tools auflisten       | `/mcp`, `/mcp desc`                                                              |
| `/import-config`  | MCP-Server aus Claude-Konfigurationen importieren   | `/import-config claude-code`, `/import-config claude-desktop --scope project`    |
| `/tools`          | Derzeit verfügbare Tool-Liste anzeigen              | `/tools`, `/tools desc`                                                          |
| `/skills`         | Verfügbare Skills auflisten und ausführen           | `/skills`, `/skills <Name>`                                                      |
| `/plan`           | In den Planmodus wechseln oder Planmodus verlassen  | `/plan`, `/plan <Aufgabe>`, `/plan exit`                                         |
| `/approval-mode`  | Genehmigungsmodus für die Tool-Nutzung ändern       | `/approval-mode <Modus (auto-edit)> --project`                                   |
| →`plan`           | Nur Analyse, keine Ausführung                       | Sichere Überprüfung                                                              |
| →`default`        | Genehmigung für Bearbeitungen erforderlich          | Tägliche Nutzung                                                                 |
| →`auto-edit`      | Bearbeitungen automatisch genehmigen                | Vertrauenswürdige Umgebung                                                        |
| →`auto`           | Klassifizierungsgesteuerte Genehmigung              | Autonome Sitzungen mit Sicherheitsvorkehrungen                                   |
| →`yolo`           | Alle automatisch genehmigen                         | Schnelles Prototyping                                                             |
| `/model`          | In aktueller Sitzung verwendetes Modell wechseln    | `/model`, `/model <Modell-ID>` (sofortiger Wechsel)                              |
| `/model --fast`   | Ein leichteres Modell für Eingabehilfe-Vorschläge   | `/model --fast qwen3-coder-flash`                                                |
| `/model --voice`  | Das für Spracherkennung verwendete Modell setzen    | `/model --voice <Modell-ID>`                                                     |
| `/extensions`     | Alle aktiven Erweiterungen in der aktuellen Sitzung auflisten | `/extensions`                                                         |
| `/memory`         | Den Memory-Manager-Dialog öffnen                    | `/memory`                                                                        |
| `/remember`       | Einen dauerhaften Memory speichern                  | `/remember Bevorzuge knappe Antworten`                                           |
| `/forget`         | Passende Einträge aus dem automatischen Memory entfernen | `/forget <Suchbegriff>`                                                    |
| `/dream`          | Automatische Memory-Konsolidierung manuell ausführen | `/dream`                                                                         |
| `/hooks`          | Qwen Code Hooks verwalten                           | `/hooks`, `/hooks list`                                                          |
| `/permissions`    | Berechtigungsregeln verwalten                       | `/permissions`                                                                   |
| `/agents`         | Unteragenten verwalten                              | `/agents manage`, `/agents create`                                               |
| `/arena`          | Arena-Sitzungen verwalten                           | `/arena start`, `/arena status`                                                  |
| `/goal`           | Ein Ziel setzen – weiterarbeiten, bis Bedingung erfüllt ist | `/goal <Bedingung>`, `/goal clear`                                        |
| `/tasks`          | Hintergrundaufgaben auflisten                       | `/tasks`                                                                         |
| `/workflows`      | Workflow-Ausführungen einsehen                      | `/workflows`, `/workflows <Ausführungs-ID>`                                      |
| `/lsp`            | LSP-Serverstatus anzeigen                           | `/lsp`                                                                           |
| `/trust`          | Ordnervertrauenseinstellungen verwalten             | `/trust`                                                                         |
### 1.5 Integrierte Fähigkeiten

Diese Befehle rufen gebündelte Fähigkeiten auf, die spezialisierte Arbeitsabläufe bereitstellen.

| Befehl        | Beschreibung                                                         | Beispiele zur Verwendung                      |
| ------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| `/review`     | Code-Änderungen mit 5 parallelen Agents + deterministischer Analyse prüfen | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`       | Eine Aufforderung in einem wiederkehrenden Zeitplan ausführen        | `/loop 5m check the build`                    |
| `/simplify`   | Kürzliche Änderungen prüfen und sichere Bereinigungen direkt anwenden | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper`  | Fragen zur Verwendung und Konfiguration von Qwen Code beantworten    | `/qc-helper how do I configure MCP?`          |

Siehe [Code Review](./code-review.md) für die vollständige `/review`-Dokumentation.

### 1.6 Seitenfrage (`/btw`)

Der Befehl `/btw` ermöglicht es Ihnen, schnelle Nebenfragen zu stellen, ohne den Hauptgesprächsfluss zu unterbrechen oder zu beeinflussen.

| Befehl                   | Beschreibung                           |
| ------------------------ | -------------------------------------- |
| `/btw <Ihre Frage>`      | Eine schnelle Nebenfrage stellen       |
| `?btw <Ihre Frage>`      | Alternative Syntax für Nebenfragen     |

**So funktioniert es:**

- Die Nebenfrage wird als separater API-Aufruf mit dem aktuellen Gesprächskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird oberhalb des Composer angezeigt — Sie können während des Wartens weiter tippen
- Das Hauptgespräch wird **nicht blockiert** — es läuft unabhängig weiter
- Die Antwort der Nebenfrage wird **nicht** Teil des Hauptgesprächsverlaufs
- Antworten werden mit vollständiger Markdown-Unterstützung dargestellt (Codeblöcke, Listen, Tabellen etc.)

**Tastaturkürzel (Interaktiver Modus):**

| Kürzel               | Aktion                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Abbrechen (während des Ladens) oder schließen (nach Fertigstellung) |
| `Space` oder `Enter` | Antwort schließen (wenn das Eingabefeld leer ist)   |
| `Ctrl+C` oder `Ctrl+D` | Eine laufende Nebenfrage abbrechen                  |

**Beispiel:**

```
(Während das Hauptgespräch über das Refactoring von Code läuft)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Antwort wird...                           │
  │ Drücken Sie Escape, Ctrl+C oder Ctrl+D zum   │
  │ Abbrechen                                      │
  ╰──────────────────────────────────────────╯
  > (Composer bleibt aktiv — weiter tippen)

(Nachdem die Antwort eingetroffen ist)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` ist blockbezogen, während `var`    │
  │ funktionsbezogen ist. `let` wurde       │
  │ in ES6 eingeführt und hoisted nicht auf │
  │ dieselbe Weise.                         │
  │                                          │
  │ Drücken Sie Space, Enter oder Escape zum │
  │ Schließen                                │
  ╰──────────────────────────────────────────╯
  > (Composer noch aktiv)
```

**Unterstützte Ausführungsmodi:**

| Modus                | Verhalten                                     |
| -------------------- | --------------------------------------------- |
| Interaktiv           | Wird oberhalb des Composer mit Markdown-Rendering angezeigt |
| Nicht interaktiv     | Gibt Text-Ergebnis zurück: `btw> frage\nantwort` |
| ACP (Agent Protocol) | Gibt `stream_messages` asynchronen Generator zurück |

> [!tip]
>
> Verwenden Sie `/btw`, wenn Sie eine schnelle Antwort benötigen, ohne Ihre Hauptaufgabe zu unterbrechen. Dies ist besonders nützlich, um Konzepte zu klären, Fakten zu überprüfen oder schnelle Erklärungen zu erhalten, während Sie sich auf Ihren primären Arbeitsablauf konzentrieren.

### 1.7 Sitzungszusammenfassung (`/recap`)

Der Befehl `/recap` erstellt eine kurze Zusammenfassung „Wo Sie aufgehört haben"
der aktuellen Sitzung, damit Sie ein altes Gespräch wieder aufnehmen können,
ohne durch Seiten voller Verlauf scrollen zu müssen.

| Befehl    | Beschreibung                                    |
| --------- | ----------------------------------------------- |
| `/recap`  | Einzeilige Sitzungszusammenfassung erstellen und anzeigen |

**So funktioniert es:**

- Verwendet das konfigurierte schnelle Modell (`fastModel`-Einstellung), falls
  verfügbar, andernfalls das Hauptsitzungsmodell. Ein kleines, günstiges Modell
  reicht für eine Zusammenfassung aus.
- Der aktuelle Gesprächsverlauf (bis zu 30 Nachrichten, nur Text — Tool-Aufrufe
  und Tool-Antworten werden herausgefiltert) wird zusammen mit einem knappen
  System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in gedämpfter Farbe mit einem `❯`-Präfix dargestellt,
  sodass sie sich von echten Assistentenantworten abhebt.
- Verweigert mit einem Inline-Fehler, wenn eine Modellrunde läuft oder ein
  anderer Befehl verarbeitet wird. Wenn kein brauchbarer Gesprächsverlauf
  vorhanden ist oder die zugrundeliegende Generierung fehlschlägt, zeigt
  `/recap` stattdessen eine kurze Info-Nachricht an — der manuelle Befehl
  antwortet immer mit etwas.
**Automatischer Trigger bei Rückkehr aus Abwesenheit:**

Wenn das Terminal für **5+ Minuten** in den Hintergrund gerückt ist und wieder fokussiert wird, wird automatisch eine Zusammenfassung erstellt und angezeigt (nur wenn keine Modellantwort läuft; sonst wird gewartet, bis die aktuelle Runde beendet ist, und dann ausgelöst). Anders als der manuelle Befehl ist der automatische Trigger bei Fehlern völlig still: Wenn die Generierung fehlschlägt oder es nichts zusammenzufassen gibt, wird keine Nachricht zum Verlauf hinzugefügt. Gesteuert durch die Einstellung `general.showSessionRecap` (Standard: `false`); der manuelle Befehl `/recap` funktioniert immer unabhängig von dieser Einstellung.

**Beispiel:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Konfiguriere ein schnelles Modell via `/model --fast <model>` (z.B. `qwen3-coder-flash`), um `/recap` schnell und günstig zu machen. Setze `general.showSessionRecap` auf `true`, um den automatischen Trigger zu aktivieren; der manuelle Befehl `/recap` funktioniert immer unabhängig von dieser Einstellung.

### 1.8 Diff Viewer (`/diff`)

Der Befehl `/diff` öffnet einen interaktiven Diff-Viewer, der uncommittete Änderungen und Änderungen pro Runde anzeigt. Verwende ←/→ zum Wechseln zwischen dem aktuellen Git-Diff und einzelnen Konversationsrunden, ↑/↓ zum Durchblättern der Dateien und Enter zum Anzeigen von Inline-Diffs.

**Funktionsweise:**

Im interaktiven Modus öffnet `/diff` einen Dialog mit einer **Quellenauswahl** oben:

- **Current** — Arbeitsbaum vs HEAD (`git diff HEAD`). Zeigt alle uncommitteten Änderungen an, einschließlich gestagter, ungestagter und nicht verfolgter Dateien.
- **T1, T2, T3, …** — Änderungen pro Runde, ein Tab pro Modellrunde, die Dateien geändert hat. Die letzten Runden erscheinen zuerst. Jeder Tab zeigt eine Vorschau des ursprünglichen Prompts als Kontext.

Die Dateiliste zeigt dateispezifische Statistiken (hinzugefügte/entfernte Zeilen) mit Tags für besondere Status (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Drücke Enter auf einer Datei, um deren Inline-Diff mit syntax-hervorgehobenen Hunks anzuzeigen.

Änderungen pro Runde erfordern, dass Datei-Checkpointing aktiviert ist (standardmäßig im interaktiven Modus eingeschaltet). Wenn Datei-Checkpointing deaktiviert ist, ist nur die Quelle „Current“ verfügbar.

**Tastaturkürzel:**

| Taste       | Aktion                                                |
| ----------- | ----------------------------------------------------- |
| `←` / `→`   | Zwischen Quellen wechseln (Current / T1 / T2…)        |
| `↑` / `↓`   | Dateiliste navigieren                                 |
| `j` / `k`   | Dateiliste navigieren (vim-Stil)                      |
| Enter       | Inline-Diff für ausgewählte Datei anzeigen            |
| `←` / Esc   | Zurück zur Dateiliste aus der Inline-Diff-Ansicht     |
| Esc         | Dialog schließen                                      |

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

In headless (`--prompt`) oder nicht-interaktiven Kontexten gibt `/diff` eine Klartext-Zusammenfassung des Arbeitsbaums gegenüber HEAD aus. Die Navigation pro Runde ist nicht verfügbar.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zur Vornahme von Systemeinstellungen.

| Befehl          | Beschreibung                                                                                                                                                                                                                                                                                      | Anwendungsbeispiele            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `/help`         | Hilfeinformationen für verfügbare Befehle anzeigen                                                                                                                                                                                                                                                 | `/help` oder `/?`              |
| `/status`       | Versionsinformationen anzeigen                                                                                                                                                                                                                                                                    | `/status` oder `/about`        |
| `/status paths` | Aktuelle Sitzungsdatei- und Log-Pfade anzeigen                                                                                                                                                                                                                                                    | `/status paths`                |
| `/stats`        | Interaktives Nutzungsstatistik-Dashboard öffnen mit drei Tabs: Session (Live-Metriken), Activity (Heatmap, Token-Trend, Projekt-Ranking) und Efficiency (Cache-Rate, Tool-Rangliste, Modellvergleich). Verwende Tab zum Wechseln der Tabs, r zum Durchlaufen der Zeiträume, ←→ zum Blättern durch Monate, Esc zum Schließen. | `/stats`                       |
| `/stats model`  | Pro-Modell-Token-Aufschlüsselung und geschätzte Kosten anzeigen                                                                                                                                                                                                                                   | `/stats model`                 |
| `/stats tools`  | Anzahl der Tool-Aufrufe pro Tool anzeigen                                                                                                                                                                                                                                                         | `/stats tools`                 |
| `/stats skills` | Anzahl der Skill-Aufrufe pro Skill für die aktive Live-Sitzung anzeigen. Dies beinhaltet keine sitzungsübergreifende tägliche/monatliche Aktivität.                                                                                                                                                | `/stats skills`                |
| `/settings`     | Einstellungseditor öffnen                                                                                                                                                                                                                                                                         | `/settings`                    |
| `/auth`         | Authentifizierungsmethode ändern                                                                                                                                                                                                                                                                  | `/auth`                        |
| `/doctor`       | Installations- und Umgebungsdiagnose ausführen                                                                                                                                                                                                                                                    | `/doctor`, `/doctor memory`    |
| `/docs`         | Vollständige Qwen Code-Dokumentation im Browser öffnen                                                                                                                                                                                                                                            | `/docs`                        |
| `/ide`          | IDE-Integration verwalten                                                                                                                                                                                                                                                                         | `/ide status`, `/ide install`  |
| `/insight`      | Programmiereinblicke aus dem Chatverlauf generieren                                                                                                                                                                                                                                               | `/insight`                     |
| `/setup-github` | GitHub Actions einrichten                                                                                                                                                                                                                                                                         | `/setup-github`                |
| `/bug`          | Problem zu Qwen Code einreichen                                                                                                                                                                                                                                                                   | `/bug Button click unresponsive` |
| `/copy`         | KI-Ausgabe in die Zwischenablage kopieren (`/copy N` = n.-letzte KI-Nachricht)                                                                                                                                                                                                                    | `/copy` oder `/copy 2`         |
| `/quit`         | Qwen Code sofort beenden                                                                                                                                                                                                                                                                          | `/quit` oder `/exit`           |
### 1.10 Häufige Tastenkürzel

| Tastenkürzel        | Funktion                    | Hinweis                          |
| ------------------- | --------------------------- | -------------------------------- |
| `Ctrl/cmd+L`        | Bildschirm leeren           | Entspricht `/clear`              |
| `Ctrl/cmd+T`        | Tool-Beschreibung umschalten | MCP-Toolverwaltung               |
| `Ctrl/cmd+C`×2      | Bestätigung zum Beenden     | Sicherer Beendigungsmechanismus  |
| `Ctrl/cmd+Z`        | Eingabe rückgängig machen   | Textbearbeitung                  |
| `Ctrl/cmd+Shift+Z`  | Eingabe wiederherstellen    | Textbearbeitung                  |

### 1.11 Authentifizierungsbefehle

Verwenden Sie `/auth` in einer Qwen Code-Sitzung, um die Authentifizierung zu konfigurieren. Verwenden Sie `/doctor`, um den aktuellen Authentifizierungs- und Umgebungsstatus zu überprüfen.

| Befehl     | Beschreibung                                |
| ---------- | ------------------------------------------- |
| `/auth`    | Authentifizierung interaktiv konfigurieren  |
| `/doctor`  | Authentifizierungs- und Umgebungsprüfungen anzeigen |

> [!note]
>
> Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Alte Aufrufe wie `qwen auth status` geben eine Entfernungsmeldung mit Migrationshinweisen aus. Weitere Informationen finden Sie auf der Seite [Authentifizierung](../configuration/auth).

## 2. @-Befehle (Dateien einfügen)

@-Befehle werden verwendet, um schnell lokale Datei- oder Verzeichnisinhalte in die Konversation einzufügen.

| Befehlsformat         | Beschreibung                                        | Beispiele                                                  |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `@<Dateipfad>`        | Inhalt der angegebenen Datei einfügen               | `@src/main.py Bitte erklären Sie diesen Code`              |
| `@<Verzeichnispfad>`  | Alle Textdateien im Verzeichnis rekursiv einlesen   | `@docs/ Fassen Sie den Inhalt dieses Dokuments zusammen`   |
| Eigenständiges `@`    | Wird verwendet, wenn das `@`-Symbol selbst besprochen wird | `@ Wofür wird dieses Symbol in der Programmierung verwendet?` |

Hinweis: Leerzeichen in Pfaden müssen mit Backslash maskiert werden (z. B. `@My\ Documents/file.txt`).

## 3. Ausrufezeichen-Befehle (`!`) – Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen die direkte Ausführung von Systembefehlen in Qwen Code.

| Befehlsformat         | Beschreibung                                                           | Beispiele                      |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `!<Shell-Befehl>`     | Befehl in einer Sub-Shell ausführen                                    | `!ls -la`, `!git status`       |
| Eigenständiges `!`    | In den Shell-Modus wechseln; jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!` (Eingabe) → Befehl eingeben → `!` (beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichern Sie häufig verwendete Prompts als Kurzbefehle, um die Arbeitseffizienz zu verbessern und Konsistenz zu gewährleisten.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Kurzer Überblick

| Funktion            | Beschreibung                                      | Vorteile                        | Priorität | Anwendungsszenarien                                    |
| ------------------- | ------------------------------------------------- | ------------------------------- | --------- | ------------------------------------------------------ |
| Namespace           | Unterverzeichnis erstellt durch Doppelpunkt getrennte Befehle | Bessere Befehlsorganisation      |           |                                                        |
| Globale Befehle     | `~/.qwen/commands/`                               | In allen Projekten verfügbar    | Niedrig   | Persönliche häufig verwendete Befehle, projektübergreifende Nutzung |
| Projektbefehle      | `<Projektstammverzeichnis>/.qwen/commands/`        | Projektspezifisch, versionierbar | Hoch      | Teilen im Team, projektspezifische Befehle             |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (Projektbefehl wird verwendet, wenn Namen gleich sind)

### Befehlsbenennungsregeln

#### Zuordnungstabelle Dateipfad zu Befehlsname

| Dateispeicherort                                 | Generierter Befehl | Beispielaufruf          |
| ------------------------------------------------ | ------------------ | ----------------------- |
| `~/.qwen/commands/test.md`                       | `/test`            | `/test Parameter`       |
| `<Projekt>/.qwen/commands/git/commit.md`         | `/git:commit`      | `/git:commit Message`   |

Benennungsregeln: Pfadseparator (`/` oder `\`) wird in Doppelpunkt (`:`) umgewandelt.

### Markdown-Dateiformatspezifikation (empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Ihr Prompt-Inhalt hier.
Verwenden Sie {{args}} für die Parametereinfügung.
```

| Feld         | Erforderlich | Beschreibung                                     | Beispiel                               |
| ------------ | ------------ | ------------------------------------------------ | -------------------------------------- |
| `description`| Optional     | Befehlsbeschreibung (wird in /help angezeigt)    | `description: Code-Analyse-Tool`       |
| Prompt-Text  | Erforderlich | An das Modell gesendeter Prompt-Inhalt           | Beliebiger Markdown-Inhalt nach dem Frontmatter |
### TOML-Dateiformat (veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migrieren Sie zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                    |
| ------------- | ------------ | ------------------------------------------ | ------------------------------------------- |
| `prompt`      | Erforderlich | An das Modell gesendeter Prompt-Inhalt     | `prompt = "Bitte analysieren Sie Code: {{args}}"` |
| `description` | Optional     | Befehlsbeschreibung (angezeigt in /help)   | `description = "Code-Analyse-Tool"`       |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode            | Syntax             | Anwendungsszenarien                  | Sicherheitsfunktionen                      |
| ------------------------------ | ------------------ | ------------------------------------ | ------------------------------------------ |
| Kontextbewusste Injektion      | `{{args}}`         | Benötigt präzise Parametersteuerung | Automatisches Shell-Escaping               |
| Standard-Parameterverarbeitung | Keine spezielle Markierung | Einfache Befehle, Parameter anhängen | Wie angegeben anhängen                    |
| Shell-Befehlsinjektion         | `!{command}`       | Benötigt dynamische Inhalte          | Ausführungsbestätigung vorab erforderlich |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario            | TOML-Konfiguration                      | Aufrufmethode         | Tatsächliche Wirkung          |
| ------------------- | ---------------------------------------- | --------------------- | ----------------------------- |
| Rohe Injektion      | `prompt = "Beheben: {{args}}"`              | `/beheben "Button-Problem"` | `Beheben: "Button-Problem"`    |
| In Shell-Befehl     | `prompt = "Suchen: !{grep {{args}} .}"` | `/suchen "hello"`     | Führe `grep "hello" ."` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation   | Verarbeitungsmethode                                      | Beispiel                                        |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------- |
| Mit Parametern     | An das Ende des Prompts anhängen (durch zwei Zeilenumbrüche getrennt) | `/befehl parameter` → Ursprünglicher Prompt + Parameter |
| Keine Parameter    | Prompt wie gesendet                                      | `/befehl` → Ursprünglicher Prompt                        |

🚀 Dynamische Injektion

| Injektionstyp          | Syntax         | Verarbeitungsreihenfolge | Zweck                             |
| ---------------------- | -------------- | ------------------------ | --------------------------------- |
| Dateiinhalt            | `@{dateipfad}` | Zuerst verarbeitet       | Statische Referenzdateien injizieren |
| Shell-Befehle          | `!{befehl}`    | In der Mitte verarbeitet | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung     | `{{args}}`     | Zuletzt verarbeitet      | Benutzerparameter injizieren          |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                       | Benutzerinteraktion     |
| ----------------------------- | ----------------------- |
| 1. Befehl und Parameter parsen | -                       |
| 2. Automatisches Shell-Escaping | -                       |
| 3. Bestätigungsdialog anzeigen | ✅ Benutzerbestätigung |
| 4. Befehl ausführen            | -                       |
| 5. Ausgabe in Prompt injizieren | -                       |

Beispiel: Generierung von Git-Commit-Nachrichten

````markdown
---
description: Generiere Commit-Nachricht basierend auf gestagten Änderungen
---

Bitte generieren Sie eine Commit-Nachricht basierend auf folgendem Diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhaltsinjektion (`@{...}`)

| Dateityp     | Unterstützungsstatus     | Verarbeitungsmethode       |
| ------------ | ------------------------ | -------------------------- |
| Textdateien  | ✅ Vollständig unterstützt | Inhalt direkt einfügen     |
| Bilder/PDFs  | ✅ Multimodal unterstützt | Kodieren und einfügen      |
| Binärdateien | ⚠️ Eingeschränkt unterstützt | Kann übersprungen oder abgeschnitten werden |
| Verzeichnis  | ✅ Rekursive Injektion    | .gitignore-Regeln befolgen |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Überprüfen Sie {{args}}, Referenzstandards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Schritte zur Erstellung des Befehls "Reine Funktion umgestalten"

| Vorgang                       | Befehl/Code                              |
| ----------------------------- | ---------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`     |
| 2. Befehlsdatei erstellen     | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten   | Siehe vollständigen Code unten.          |
| 4. Befehl testen              | `@file.js` → `/refactor:pure`            |

```markdown
---
description: Code zu reiner Funktion umgestalten
---

Bitte analysieren Sie den Code im aktuellen Kontext und gestalten Sie ihn zu einer reinen Funktion um.
Anforderungen:

1. Refaktorisierten Code bereitstellen
2. Wesentliche Änderungen und Umsetzung der reinen Funktion erklären
3. Funktion unverändert lassen
```
### Zusammenfassung Best Practices für benutzerdefinierte Befehle

#### Tabelle mit Empfehlungen zum Befehlsdesign

| Praxis-Punkte         | Empfohlener Ansatz                | Zu vermeiden                              |
| --------------------- | -------------------------------- | ----------------------------------------- |
| Befehlsbenennung      | Namespaces zur Organisation nutzen | Zu allgemeine Namen vermeiden             |
| Parameterverarbeitung | `{{args}}` deutlich verwenden    | Auf Standard-Anhängen verlassen (leicht zu verwechseln) |
| Fehlerbehandlung      | Shell-Fehlerausgabe nutzen       | Ausführungsfehler ignorieren              |
| Dateiorganisation     | Funktionale Ordnerstruktur       | Alle Befehle im Wurzelverzeichnis         |
| Beschreibungsfeld     | Klare Beschreibung angeben       | Auf automatisch generierte Beschreibung verlassen |

#### Tabelle zur Erinnerung an Sicherheitsfunktionen

| Sicherheitsmechanismus | Schutzwirkung                 | Benutzeraktion            |
| ---------------------- | ----------------------------- | ------------------------- |
| Shell-Escaping         | Verhindert Befehlsinjektion   | Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet versehentliche Ausführung | Dialogbestätigung    |
| Fehlerberichterstattung | Hilft bei der Diagnose        | Fehlerinformationen anzeigen |

## 5. CLI-Unterbefehle

Diese Befehle werden in der Shell als `qwen <unterbefehl>` ausgeführt, bevor eine interaktive Sitzung gestartet wird.

### Sitzungsverwaltung

| Befehl                | Beschreibung                            | Anwendungsbeispiele                                      |
| --------------------- | --------------------------------------- | -------------------------------------------------------- |
| `qwen sessions list` | Listet aktuelle Chat-Sitzungen auf      | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Listet Ihre letzten Qwen Code-Sitzungen mit Metadaten auf.

**Flags:**

| Flag      | Typ    | Standard | Beschreibung                                             |
| --------- | ------ | -------- | -------------------------------------------------------- |
| `--json`  | boolesch | `false` | Ausgabe als JSON Lines (ein JSON-Objekt pro Zeile)        |
| `--limit` | Zahl   | `20`     | Maximale Anzahl der anzuzeigenden Sitzungen               |

**Menschenlesbare Ausgabe (Standard):**

Eine Tabelle mit den Spalten: SITZUNGS-ID, GESTARTET (UTC-Zeitstempel), TITEL, BRANCH, PROMPT.

**JSON-Ausgabe (`--json`):**

Gibt JSON Lines auf stdout aus. Jede Zeile ist ein JSON-Objekt mit den Feldern:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

Der Hinweis „has more sessions“ wird via stderr ausgegeben, sodass das Piping an `jq` sicher bleibt.

**Beispiele:**

```bash
# Letzte 20 Sitzungen anzeigen (Standard)
qwen sessions list

# Letzte 50 Sitzungen anzeigen
qwen sessions list --limit 50

# Ausgabe als JSON für Skripte
qwen sessions list --json | jq .
```
