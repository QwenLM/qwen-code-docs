---
description: "Meistern Sie Qwen Code Befehle: Slash Commands, At Commands und Shell Commands für Sitzungen, Dateikontext und produktivere KI-Coding-Abläufe."
---

# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle und hilft dir, Sitzungen effizient zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden durch bestimmte Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ                 | Funktionsbeschreibung                                 | Typischer Anwendungsfall                                           |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Slash-Befehle (`/`)        | Steuerung von Qwen Code auf Meta-Ebene                | Sitzungen verwalten, Einstellungen ändern, Hilfe erhalten          |
| At-Befehle (`@`)           | Lokalen Dateiinhalt schnell in die Konversation einfügen | Ermöglicht der KI, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell              | Ausführen von Systembefehlen wie `git status`, `ls` usw.           |

## 1. Slash-Befehle (`/`)

Slash-Befehle dienen zur Verwaltung von Qwen Code-Sitzungen, der Oberfläche und des Grundverhaltens.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen dir, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl      | Beschreibung                                                | Anwendungsbeispiele                    |
| ----------- | ----------------------------------------------------------- | -------------------------------------- |
| `/init`     | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen | `/init`                                |
| `/summary`  | Projektzusammenfassung basierend auf dem Konversationsverlauf generieren | `/summary`                             |
| `/compress` | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                            |
| `/resume`   | Vorherige Konversationssitzung fortsetzen                   | `/resume`                              |
| `/recap`    | Jetzt eine einzeilige Sitzungszusammenfassung generieren    | `/recap`                               |
| `/restore`  | Dateien auf den Zustand vor der Tool-Ausführung zurücksetzen | `/restore` (Liste) oder `/restore <ID>` |

### 1.2 Oberflächen- und Workspace-Steuerung

Befehle zum Anpassen der Oberflächendarstellung und der Arbeitsumgebung.

| Befehl       | Beschreibung                               | Anwendungsbeispiele             |
| ------------ | ------------------------------------------ | ------------------------------- |
| `/clear`     | Terminalbildschirm leeren                  | `/clear` (Shortcut: `Strg+L`)   |
| `/context`   | Aufschlüsselung der Kontextfensternutzung anzeigen | `/context`                      |
| → `detail`   | Aufschlüsselung der Kontextnutzung pro Element anzeigen | `/context detail`               |
| `/theme`     | Visuelles Qwen Code-Theme ändern           | `/theme`                        |
| `/vim`       | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten | `/vim`                          |
| `/directory` | Workspace für Multi-Directory-Unterstützung verwalten | `/dir add ./src,./tests`        |
| `/editor`    | Dialog zur Auswahl eines unterstützten Editors öffnen | `/editor`                       |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                       | Anwendungsbeispiele          |
| --------------------- | ---------------------------------- | ---------------------------- |
| `/language`           | Spracheinstellungen anzeigen oder ändern | `/language`                  |
| → `ui [Sprache]`      | Sprache der UI-Oberfläche festlegen | `/language ui zh-CN`         |
| → `output [Sprache]`  | Ausgabesprache des LLM festlegen   | `/language output Chinese`   |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und Modellen.

| Befehl           | Beschreibung                                    | Anwendungsbeispiele                             |
| ---------------- | ----------------------------------------------- | ----------------------------------------------- |
| `/mcp`           | Konfigurierte MCP-Server und Tools auflisten    | `/mcp`, `/mcp desc`                             |
| `/tools`         | Aktuell verfügbare Tool-Liste anzeigen          | `/tools`, `/tools desc`                         |
| `/skills`        | Verfügbare Skills auflisten und ausführen       | `/skills`, `/skills <name>`                     |
| `/plan`          | In den Plan-Modus wechseln oder diesen beenden  | `/plan`, `/plan <task>`, `/plan exit`           |
| `/approval-mode` | Genehmigungsmodus für die Tool-Nutzung ändern   | `/approval-mode <mode (auto-edit)> --project`   |
| →`plan`          | Nur Analyse, keine Ausführung                   | Sichere Überprüfung                             |
| →`default`       | Genehmigung für Änderungen erforderlich         | Tägliche Nutzung                                |
| →`auto-edit`     | Änderungen automatisch genehmigen               | Vertrauenswürdige Umgebung                      |
| →`yolo`          | Alles automatisch genehmigen                    | Schnelles Prototyping                           |
| `/model`         | In der aktuellen Sitzung verwendetes Modell wechseln | `/model`                                      |
| `/model --fast`  | Ein leichteres Modell für Prompt-Vorschläge festlegen | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | Alle aktiven Erweiterungen in der aktuellen Sitzung auflisten | `/extensions`                                 |
| `/memory`        | Memory-Manager-Dialog öffnen                    | `/memory`                                       |
| `/remember`      | Ein dauerhaftes Memory speichern                | `/remember Prefer terse responses`              |
| `/forget`        | Passende Einträge aus dem Auto-Memory entfernen | `/forget <query>`                               |
| `/dream`         | Auto-Memory-Konsolidierung manuell ausführen    | `/dream`                                        |

### 1.5 Integrierte Skills

Diese Befehle rufen gebündelte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl       | Beschreibung                                                          | Anwendungsbeispiele                                   |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `/review`    | Code-Änderungen mit 5 parallelen Agents + deterministischer Analyse prüfen | `/review`, `/review 123`, `/review 123 --comment`     |
| `/loop`      | Einen Prompt nach einem wiederkehrenden Zeitplan ausführen            | `/loop 5m check the build`                            |
| `/qc-helper` | Fragen zur Nutzung und Konfiguration von Qwen Code beantworten        | `/qc-helper how do I configure MCP?`                  |

Die vollständige Dokumentation zu `/review` findest du unter [Code Review](./code-review.md).

### 1.6 Nebenfrage (`/btw`)

Der Befehl `/btw` ermöglicht es dir, schnelle Nebenfragen zu stellen, ohne den Hauptkonversationsfluss zu unterbrechen oder zu beeinflussen.

| Befehl                 | Beschreibung                          |
| ---------------------- | ------------------------------------- |
| `/btw <deine Frage>`   | Eine schnelle Nebenfrage stellen      |
| `?btw <deine Frage>`   | Alternative Syntax für Nebenfragen    |

**Funktionsweise:**

- Die Nebenfrage wird als separater API-Aufruf mit dem aktuellen Konversationskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird oberhalb des Composers angezeigt – du kannst während des Wartens weiter tippen
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Antwort auf die Nebenfrage wird **nicht** Teil des Hauptkonversationsverlaufs
- Antworten werden mit voller Markdown-Unterstützung gerendert (Code-Blöcke, Listen, Tabellen usw.)

**Tastenkürzel (Interaktiver Modus):**

| Tastenkürzel           | Aktion                                              |
| ---------------------- | --------------------------------------------------- |
| `Escape`               | Abbrechen (während des Ladens) oder schließen (nach Abschluss) |
| `Leertaste` oder `Enter` | Antwort schließen (wenn die Eingabe leer ist)       |
| `Strg+C` oder `Strg+D` | Eine laufende Nebenfrage abbrechen                  |

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

| Modus                  | Verhalten                                      |
| ---------------------- | ---------------------------------------------- |
| Interaktiv             | Zeigt oberhalb des Composers mit Markdown-Rendering |
| Nicht-interaktiv       | Gibt Textergebnis zurück: `btw> question\nanswer` |
| ACP (Agent Protocol)   | Gibt `stream_messages` async generator zurück  |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne von deiner Hauptaufgabe abzukommen. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu prüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Sitzungszusammenfassung (`/recap`)

Der Befehl `/recap` generiert eine kurze Zusammenfassung des aktuellen Stands („wo du aufgehört hast“) der aktuellen Sitzung, sodass du eine alte Konversation fortsetzen kannst, ohne seitenweise im Verlauf zurückscrollen zu müssen.

| Befehl   | Beschreibung                                 |
| -------- | -------------------------------------------- |
| `/recap` | Einzeilige Sitzungszusammenfassung generieren und anzeigen |

**Funktionsweise:**

- Verwendet das konfigurierte schnelle Modell (`fastModel`-Einstellung), falls verfügbar, und fällt andernfalls auf das Hauptsitzungsmodell zurück. Ein kleines, günstiges Modell reicht für eine Zusammenfassung aus.
- Die aktuelle Konversation (bis zu 30 Nachrichten, nur Text – Tool-Aufrufe und Tool-Antworten werden herausgefiltert) wird mit einem strengen System-Prompt an das Modell gesendet.
- Die Zusammenfassung wird in abgedunkelter Farbe mit einem `❯`-Präfix gerendert, um sie von echten Assistant-Antworten abzugrenzen.
- Verweigert die Ausführung mit einem Inline-Fehler, wenn ein Modell-Turn läuft oder ein anderer Befehl verarbeitet wird. Wenn es keine nutzbare Konversation gibt oder die zugrunde liegende Generierung fehlschlägt, zeigt `/recap` stattdessen eine kurze Info-Meldung an – der manuelle Befehl antwortet immer mit etwas.

**Automatischer Trigger bei Rückkehr nach Abwesenheit:**

Wenn das Terminal für **5+ Minuten** unscharf ist und wieder fokussiert wird, wird automatisch eine Zusammenfassung generiert und angezeigt (nur wenn keine Modellantwort läuft; andernfalls wartet es, bis der aktuelle Turn abgeschlossen ist, und feuert dann). Im Gegensatz zum manuellen Befehl ist der Auto-Trigger bei Fehlern vollständig stumm: Wenn Generierungsfehler auftreten oder nichts zusammenzufassen ist, wird keine Nachricht zum Verlauf hinzugefügt. Gesteuert durch die `general.showSessionRecap`-Einstellung (Standard: `true`); der manuelle `/recap`-Befehl funktioniert unabhängig von dieser Einstellung immer.

**Beispiel:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Konfiguriere ein schnelles Modell über `/model --fast <Modell>` (z. B. `qwen3-coder-flash`), um `/recap` schnell und kostengünstig zu machen. Setze `general.showSessionRecap` auf `false`, um den Auto-Trigger zu deaktivieren, während der manuelle Befehl verfügbar bleibt.

### 1.8 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und Durchführen von Systemeinstellungen.

| Befehl      | Beschreibung                                      | Anwendungsbeispiele                |
| ----------- | ------------------------------------------------- | ---------------------------------- |
| `/help`     | Hilfeinformationen für verfügbare Befehle anzeigen | `/help` oder `/?`                  |
| `/about`    | Versionsinformationen anzeigen                    | `/about`                           |
| `/stats`    | Detaillierte Statistiken für die aktuelle Sitzung anzeigen | `/stats`                           |
| `/settings` | Einstellungseditor öffnen                         | `/settings`                        |
| `/auth`     | Authentifizierungsmethode ändern                  | `/auth`                            |
| `/bug`      | Problem bezüglich Qwen Code melden                | `/bug Button click unresponsive`   |
| `/copy`     | Inhalt der letzten Ausgabe in die Zwischenablage kopieren | `/copy`                            |
| `/quit`     | Qwen Code sofort beenden                          | `/quit` oder `/exit`               |

### 1.9 Häufige Tastenkürzel

| Tastenkürzel         | Funktion                  | Hinweis                  |
| -------------------- | ------------------------- | ------------------------ |
| `Strg/Cmd+L`         | Bildschirm leeren         | Entspricht `/clear`      |
| `Strg/Cmd+T`         | Tool-Beschreibung ein-/ausblenden | MCP-Tool-Verwaltung      |
| `Strg/Cmd+C`×2       | Beenden bestätigen        | Sicherer Beendigungsmechanismus |
| `Strg/Cmd+Z`         | Eingabe rückgängig machen | Textbearbeitung          |
| `Strg/Cmd+Shift+Z`   | Eingabe wiederherstellen  | Textbearbeitung          |

### 1.10 CLI-Auth-Subcommands

Zusätzlich zum `/auth`-Slash-Befehl innerhalb der Sitzung bietet Qwen Code eigenständige CLI-Subcommands zur Verwaltung der Authentifizierung direkt über das Terminal:

| Befehl                                               | Beschreibung                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `qwen auth`                                          | Interaktives Authentifizierungs-Setup                         |
| `qwen auth coding-plan`                              | Authentifizierung mit Alibaba Cloud Coding Plan               |
| `qwen auth coding-plan --region china --key sk-sp-…` | Nicht-interaktives Coding-Plan-Setup (für Skripte)            |
| `qwen auth api-key`                                  | Authentifizierung mit einem API-Key                           |
| `qwen auth qwen-oauth`                               | ~~Authentifizierung mit Qwen OAuth~~ (eingestellt am 2026-04-15) |
| `qwen auth status`                                   | Aktuellen Authentifizierungsstatus anzeigen                   |

> [!tip]
>
> Diese Befehle werden außerhalb einer Qwen Code-Sitzung ausgeführt. Verwende sie, um die Authentifizierung vor dem Start einer Sitzung oder in Skripten und CI-Umgebungen zu konfigurieren. Vollständige Details findest du auf der Seite [Authentication](../configuration/auth).

## 2. @-Befehle (Dateien einfügen)

@-Befehle werden verwendet, um schnell lokalen Datei- oder Verzeichnisinhalt zur Konversation hinzuzufügen.

| Befehlsformat       | Beschreibung                                   | Beispiele                                        |
| ------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `@<Dateipfad>`      | Inhalt der angegebenen Datei einfügen          | `@src/main.py Please explain this code`          |
| `@<Verzeichnispfad>` | Alle Textdateien im Verzeichnis rekursiv lesen | `@docs/ Summarize content of this document`      |
| Eigenständiges `@`  | Wird verwendet, wenn das `@`-Symbol selbst diskutiert wird | `@ What is this symbol used for in programming?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash escaped werden (z. B. `@My\ Documents/file.txt`)

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es dir, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat      | Beschreibung                                                         | Beispiele                              |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------- |
| `!<Shell-Befehl>`  | Befehl in einer Sub-Shell ausführen                                  | `!ls -la`, `!git status`               |
| Eigenständiges `!` | Shell-Modus wechseln, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Enter) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Über `!` ausgeführte Befehle setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichere häufig verwendete Prompts als Shortcut-Befehle, um die Arbeitseffizienz zu steigern und Konsistenz zu gewährleisten.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird ein automatischer Migrationshinweis angezeigt.

### Schneller Überblick

| Funktion         | Beschreibung                                 | Vorteile                               | Priorität | Anwendungsszenarien                                |
| ---------------- | -------------------------------------------- | -------------------------------------- | --------- | -------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt Befehle mit Doppelpunkt-Namen | Bessere Befehlsorganisation            |           |                                                    |
| Globale Befehle  | `~/.qwen/commands/`                          | In allen Projekten verfügbar           | Niedrig   | Persönliche, häufig genutzte Befehle, projektübergreifende Nutzung |
| Projektbefehle   | `<Projekt-Root-Verzeichnis>/.qwen/commands/` | Projektspezifisch, versionierbar       | Hoch      | Team-Sharing, projektspezifische Befehle           |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (bei gleichen Namen wird der Projektbefehl verwendet)

### Befehlsbenennungsregeln

#### Zuordnungstabelle: Dateipfad zu Befehlsname

| Dateispeicherort                         | Generierter Befehl | Beispielaufruf        |
| ---------------------------------------- | ------------------ | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`            | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`      | `/git:commit Message` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) wird in einen Doppelpunkt (`:`) umgewandelt

### Markdown-Dateiformat-Spezifikation (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                     |
| ------------- | ------------ | ------------------------------------------ | -------------------------------------------- |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description: Code analysis tool`            |
| Prompt-Body   | Erforderlich | An das Modell gesendeter Prompt-Inhalt     | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (Veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                     |
| ------------- | ------------ | ------------------------------------------ | -------------------------------------------- |
| `prompt`      | Erforderlich | An das Modell gesendeter Prompt-Inhalt     | `prompt = "Please analyze code: {{args}}"`   |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code analysis tool"`         |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode       | Syntax             | Anwendbare Szenarien                 | Sicherheitsmerkmale                    |
| -------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbewusste Injektion  | `{{args}}`         | Präzise Parametersteuerung erforderlich | Automatisches Shell-Escaping           |
| Standard-Parameterverarbeitung | Keine spezielle Markierung | Einfache Befehle, Parameter-Anhängen | Wird unverändert angehängt             |
| Shell-Befehlsinjektion     | `!{command}`       | Dynamischer Inhalt erforderlich      | Erfordert Bestätigung vor Ausführung   |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode           | Tatsächlicher Effekt       |
| ---------------- | --------------------------------------- | ----------------------- | -------------------------- |
| Roh-Injektion    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"`   | `Fix: "Button issue"`      |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`       | Führt `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                     | Beispiel                                       |
| ---------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Hat Parameter    | An das Ende des Prompts anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Originaler Prompt + Parameter |
| Keine Parameter  | Prompt unverändert senden                                | `/cmd` → Originaler Prompt                     |

🚀 Dynamische Inhaltsinjektion

| Injektionstyp         | Syntax         | Verarbeitungsreihenfolge | Zweck                          |
| --------------------- | -------------- | ------------------------ | ------------------------------ |
| Dateiinhalt           | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien injizieren |
| Shell-Befehle         | `!{command}`   | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung    | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter injizieren   |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                       | Benutzerinteraktion  |
| ----------------------------- | -------------------- |
| 1. Befehl und Parameter parsen | -                    |
| 2. Automatisches Shell-Escaping | -                    |
| 3. Bestätigungsdialog anzeigen | ✅ Benutzerbestätigung |
| 4. Befehl ausführen           | -                    |
| 5. Ausgabe in Prompt injizieren | -                    |

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

| Dateityp     | Support-Status         | Verarbeitungsmethode        |
| ------------ | ---------------------- | --------------------------- |
| Textdateien  | ✅ Voll unterstützt    | Inhalt direkt injizieren    |
| Bilder/PDF   | ✅ Multi-Modal unterstützt | Kodieren und injizieren     |
| Binärdateien | ⚠️ Eingeschränkt unterstützt | Kann übersprungen oder gekürzt werden |
| Verzeichnis  | ✅ Rekursive Injektion | Folgt .gitignore-Regeln     |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Praktisches Erstellungbeispiel

#### Tabelle: Erstellungsschritte für den Befehl „Pure Function Refactoring“

| Vorgang                     | Befehl/Code                               |
| --------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen   | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten | Siehe vollständigen Code unten.           |
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

#### Tabelle: Empfehlungen zum Befehlsdesign

| Praxispunkte         | Empfohlener Ansatz                | Vermeiden                                   |
| -------------------- | --------------------------------- | ------------------------------------------- |
| Befehlsbenennung     | Namespaces zur Organisation verwenden | Zu generische Namen vermeiden               |
| Parameterverarbeitung | Explizit `{{args}}` verwenden     | Auf Standard-Anhängen verlassen (verwirrend) |
| Fehlerbehandlung     | Shell-Fehlerausgabe nutzen        | Ausführungsfehler ignorieren                |
| Dateiorganisation    | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Root-Verzeichnis            |
| Beschreibungsfeld    | Immer eine klare Beschreibung angeben | Auf automatisch generierte Beschreibung verlassen |

#### Tabelle: Erinnerung an Sicherheitsmerkmale

| Sicherheitsmechanismus | Schutzwirkung          | Benutzeraktion         |
| ---------------------- | ---------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Command Injection | Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet unbeabsichtigte Ausführung | Dialogbestätigung      |
| Fehlerberichterstattung | Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |