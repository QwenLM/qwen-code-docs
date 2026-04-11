# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle und hilft dir, Sitzungen effizient zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern.

Die Befehle von Qwen Code werden über bestimmte Präfixe ausgelöst und lassen sich in drei Kategorien einteilen:

| Präfix-Typ                 | Funktionsbeschreibung                                 | Typischer Anwendungsfall                                           |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Slash-Befehle (`/`)        | Steuerung von Qwen Code auf Meta-Ebene                | Sitzungen verwalten, Einstellungen ändern, Hilfe erhalten          |
| At-Befehle (`@`)           | Lokalen Dateiinhalt schnell in die Konversation einfügen | Ermöglicht der KI, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell              | Ausführen von Systembefehlen wie `git status`, `ls` usw.           |

## 1. Slash-Befehle (`/`)

Slash-Befehle dienen zur Verwaltung von Qwen Code-Sitzungen, der Oberfläche und des Grundverhaltens.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen dir, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl      | Beschreibung                                                | Verwendungsbeispiele                 |
| ----------- | ----------------------------------------------------------- | ------------------------------------ |
| `/init`     | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen | `/init`                              |
| `/summary`  | Projektzusammenfassung basierend auf dem Konversationsverlauf generieren | `/summary`                           |
| `/compress` | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                          |
| `/resume`   | Vorherige Konversationssitzung fortsetzen                   | `/resume`                            |
| `/restore`  | Dateien auf den Zustand vor der Tool-Ausführung zurücksetzen | `/restore` (Liste) oder `/restore <ID>` |

### 1.2 Oberflächen- und Workspace-Steuerung

Befehle zum Anpassen des Erscheinungsbilds der Oberfläche und der Arbeitsumgebung.

| Befehl       | Beschreibung                               | Verwendungsbeispiele              |
| ------------ | ------------------------------------------ | --------------------------------- |
| `/clear`     | Terminalbildschirm leeren                  | `/clear` (Shortcut: `Ctrl+L`)     |
| `/context`   | Aufschlüsselung der Kontextfensternutzung anzeigen | `/context`                    |
| → `detail`   | Aufschlüsselung der Kontextnutzung pro Element anzeigen | `/context detail`             |
| `/theme`     | Visuelles Theme von Qwen Code ändern       | `/theme`                          |
| `/vim`       | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten | `/vim`                        |
| `/directory` | Workspace mit Unterstützung für mehrere Verzeichnisse verwalten | `/dir add ./src,./tests`      |
| `/editor`    | Dialog zur Auswahl eines unterstützten Editors öffnen | `/editor`                     |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                       | Verwendungsbeispiele           |
| --------------------- | ---------------------------------- | ------------------------------ |
| `/language`           | Spracheinstellungen anzeigen oder ändern | `/language`                |
| → `ui [Sprache]`      | Sprache der UI-Oberfläche festlegen | `/language ui zh-CN`       |
| → `output [Sprache]`  | Ausgabesprache des LLM festlegen   | `/language output Chinese` |

- Verfügbare integrierte UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese` usw.

### 1.4 Tool- und Modellverwaltung

Befehle zur Verwaltung von KI-Tools und Modellen.

| Befehl           | Beschreibung                                    | Verwendungsbeispiele                              |
| ---------------- | ----------------------------------------------- | ------------------------------------------------- |
| `/mcp`           | Konfigurierte MCP-Server und Tools auflisten    | `/mcp`, `/mcp desc`                               |
| `/tools`         | Aktuell verfügbare Tool-Liste anzeigen          | `/tools`, `/tools desc`                           |
| `/skills`        | Verfügbare Skills auflisten und ausführen       | `/skills`, `/skills <name>`                       |
| `/plan`          | In den Plan-Modus wechseln oder diesen verlassen | `/plan`, `/plan <task>`, `/plan exit`             |
| `/approval-mode` | Genehmigungsmodus für die Tool-Nutzung ändern   | `/approval-mode <mode (auto-edit)> --project`     |
| →`plan`          | Nur Analyse, keine Ausführung                   | Sichere Überprüfung                               |
| →`default`       | Genehmigung für Änderungen erforderlich         | Tägliche Nutzung                                  |
| →`auto-edit`     | Änderungen automatisch genehmigen               | Vertrauenswürdige Umgebung                        |
| →`yolo`          | Alles automatisch genehmigen                    | Schnelles Prototyping                             |
| `/model`         | Im aktuellen Sitzung verwendetes Modell wechseln | `/model`                                          |
| `/model --fast`  | Ein leichteres Modell für Prompt-Vorschläge festlegen | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | Alle aktiven Erweiterungen in der aktuellen Sitzung auflisten | `/extensions`                                 |
| `/memory`        | Instruktionskontext der KI verwalten            | `/memory add Wichtige Info`                       |

### 1.5 Integrierte Skills

Diese Befehle rufen gebündelte Skills auf, die spezialisierte Workflows bereitstellen.

| Befehl       | Beschreibung                                                          | Verwendungsbeispiele                                    |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `/review`    | Code-Änderungen mit 5 parallelen Agents + deterministischer Analyse prüfen | `/review`, `/review 123`, `/review 123 --comment`       |
| `/loop`      | Einen Prompt nach einem wiederkehrenden Zeitplan ausführen            | `/loop 5m check the build`                              |
| `/qc-helper` | Fragen zur Nutzung und Konfiguration von Qwen Code beantworten        | `/qc-helper how do I configure MCP?`                    |

Die vollständige Dokumentation zu `/review` findest du unter [Code Review](./code-review.md).

### 1.6 Nebenfrage (`/btw`)

Der Befehl `/btw` ermöglicht es dir, schnelle Nebenfragen zu stellen, ohne den Hauptkonversationsfluss zu unterbrechen oder zu beeinflussen.

| Befehl                 | Beschreibung                          |
| ---------------------- | ------------------------------------- |
| `/btw <deine Frage>`   | Schnelle Nebenfrage stellen           |
| `?btw <deine Frage>`   | Alternative Syntax für Nebenfragen    |

**Funktionsweise:**

- Die Nebenfrage wird als separater API-Aufruf mit dem aktuellen Konversationskontext (bis zu den letzten 20 Nachrichten) gesendet
- Die Antwort wird oberhalb des Composers angezeigt – du kannst während des Wartens weiter tippen
- Die Hauptkonversation wird **nicht blockiert** – sie läuft unabhängig weiter
- Die Antwort auf die Nebenfrage wird **nicht** Teil des Hauptkonversationsverlaufs
- Antworten werden mit vollständiger Markdown-Unterstützung gerendert (Codeblöcke, Listen, Tabellen usw.)

**Tastenkürzel (Interaktiver Modus):**

| Tastenkürzel           | Aktion                                              |
| ---------------------- | --------------------------------------------------- |
| `Escape`               | Abbrechen (während des Ladens) oder schließen (nach Abschluss) |
| `Space` oder `Enter`   | Antwort schließen (wenn die Eingabe leer ist)       |
| `Ctrl+C` oder `Ctrl+D` | Laufende Nebenfrage abbrechen                       |

**Beispiel:**

```
(Während die Hauptkonversation das Refactoring von Code behandelt)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(Nachdem die Antwort eingetroffen ist)

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

| Modus                | Verhalten                                      |
| -------------------- | ---------------------------------------------- |
| Interaktiv           | Wird oberhalb des Composers mit Markdown-Rendering angezeigt |
| Nicht-interaktiv     | Gibt Textergebnis zurück: `btw> question\nanswer` |
| ACP (Agent Protocol) | Gibt `stream_messages` async generator zurück  |

> [!tip]
>
> Verwende `/btw`, wenn du eine schnelle Antwort benötigst, ohne von deiner Hauptaufgabe abzukommen. Es ist besonders nützlich, um Konzepte zu klären, Fakten zu prüfen oder schnelle Erklärungen zu erhalten, während du dich auf deinen primären Workflow konzentrierst.

### 1.7 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zum Vornehmen von Systemeinstellungen.

| Befehl      | Beschreibung                                      | Verwendungsbeispiele                 |
| ----------- | ------------------------------------------------- | ------------------------------------ |
| `/help`     | Hilfeinformationen für verfügbare Befehle anzeigen | `/help` oder `/?`                    |
| `/about`    | Versionsinformationen anzeigen                    | `/about`                             |
| `/stats`    | Detaillierte Statistiken für die aktuelle Sitzung anzeigen | `/stats`                             |
| `/settings` | Einstellungseditor öffnen                         | `/settings`                          |
| `/auth`     | Authentifizierungsmethode ändern                  | `/auth`                              |
| `/bug`      | Problem bezüglich Qwen Code melden                | `/bug Button click unresponsive`     |
| `/copy`     | Letzte Ausgabe in die Zwischenablage kopieren     | `/copy`                              |
| `/quit`     | Qwen Code sofort beenden                          | `/quit` oder `/exit`                 |

### 1.8 Häufige Tastenkürzel

| Tastenkürzel         | Funktion                  | Hinweis                  |
| -------------------- | ------------------------- | ------------------------ |
| `Ctrl/cmd+L`         | Bildschirm leeren         | Entspricht `/clear`      |
| `Ctrl/cmd+T`         | Tool-Beschreibung ein-/ausblenden | MCP-Tool-Verwaltung      |
| `Ctrl/cmd+C`×2       | Beenden bestätigen        | Sicherer Beendigungsmechanismus |
| `Ctrl/cmd+Z`         | Eingabe rückgängig machen | Textbearbeitung          |
| `Ctrl/cmd+Shift+Z`   | Eingabe wiederherstellen  | Textbearbeitung          |

### 1.9 CLI-Auth-Unterbefehle

Zusätzlich zum `/auth`-Slash-Befehl innerhalb der Sitzung bietet Qwen Code eigenständige CLI-Unterbefehle zur direkten Verwaltung der Authentifizierung über das Terminal:

| Befehl                                               | Beschreibung                                      |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Interaktives Authentifizierungs-Setup             |
| `qwen auth qwen-oauth`                               | Authentifizierung mit Qwen OAuth                  |
| `qwen auth coding-plan`                              | Authentifizierung mit Alibaba Cloud Coding Plan   |
| `qwen auth coding-plan --region china --key sk-sp-…` | Nicht-interaktives Coding-Plan-Setup (für Skripte) |
| `qwen auth status`                                   | Aktuellen Authentifizierungsstatus anzeigen       |

> [!tip]
>
> Diese Befehle werden außerhalb einer Qwen Code-Sitzung ausgeführt. Verwende sie, um die Authentifizierung vor dem Start einer Sitzung oder in Skripten und CI-Umgebungen zu konfigurieren. Vollständige Details findest du auf der Seite [Authentication](../configuration/auth).

## 2. @-Befehle (Dateien einfügen)

@-Befehle werden verwendet, um schnell lokalen Datei- oder Verzeichnisinhalt zur Konversation hinzuzufügen.

| Befehlsformat       | Beschreibung                                   | Beispiele                                        |
| ------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `@<Dateipfad>`      | Inhalt der angegebenen Datei einfügen          | `@src/main.py Please explain this code`          |
| `@<Verzeichnispfad>`| Alle Textdateien im Verzeichnis rekursiv lesen | `@docs/ Summarize content of this document`      |
| Eigenständiges `@`  | Wird verwendet, wenn das `@`-Symbol selbst diskutiert wird | `@ What is this symbol used for in programming?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@My\ Documents/file.txt`)

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
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Schneller Überblick

| Funktion         | Beschreibung                                 | Vorteile                               | Priorität | Anwendungsszenarien                                |
| ---------------- | -------------------------------------------- | -------------------------------------- | --------- | -------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt Befehle mit Doppelpunkt-Namen | Bessere Befehlsorganisation            |           |                                                    |
| Globale Befehle  | `~/.qwen/commands/`                          | In allen Projekten verfügbar           | Niedrig   | Persönliche, häufig genutzte Befehle, projektübergreifende Nutzung |
| Projektbefehle   | `<Projekt-Root-Verzeichnis>/.qwen/commands/` | Projektspezifisch, versionierbar       | Hoch      | Team-Sharing, projektspezifische Befehle           |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (bei gleichen Namen wird der Projektbefehl verwendet)

### Regeln für die Befehlsbenennung

#### Zuordnungstabelle: Dateipfad zu Befehlsname

| Dateispeicherort                         | Generierter Befehl | Beispielaufruf        |
| ---------------------------------------- | ------------------ | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`            | `/test Parameter`     |
| `<Projekt>/.qwen/commands/git/commit.md` | `/git:commit`      | `/git:commit Nachricht` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) wird in einen Doppelpunkt (`:`) umgewandelt

### Spezifikation für das Markdown-Dateiformat (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Dein Prompt-Inhalt hier.
Verwende {{args}} für die Parameterinjektion.
```

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                     |
| ------------- | ------------ | ------------------------------------------ | -------------------------------------------- |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description: Code-Analyse-Tool`             |
| Prompt-Body   | Erforderlich | An das Modell gesendeter Prompt-Inhalt     | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (Veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migriere zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                     |
| ------------- | ------------ | ------------------------------------------ | -------------------------------------------- |
| `prompt`      | Erforderlich | An das Modell gesendeter Prompt-Inhalt     | `prompt = "Please analyze code: {{args}}"`   |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code-Analyse-Tool"`          |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode       | Syntax             | Anwendungsszenarien                | Sicherheitsmerkmale                 |
| -------------------------- | ------------------ | ---------------------------------- | ----------------------------------- |
| Kontextbewusste Injektion  | `{{args}}`         | Präzise Parametersteuerung erforderlich | Automatisches Shell-Escaping        |
| Standard-Parameterverarbeitung | Keine spezielle Markierung | Einfache Befehle, Parameter-Anhängung | Wird unverändert angehängt          |
| Shell-Befehlsinjektion     | `!{command}`       | Dynamischer Inhalt erforderlich    | Vorherige Ausführungsbestätigung erforderlich |

#### 1. Kontextbewusste Injektion (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode         | Tatsächlicher Effekt       |
| ---------------- | --------------------------------------- | --------------------- | -------------------------- |
| Rohe Injektion   | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`      |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Führt `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                   | Beispiel                                       |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Mit Parametern   | Wird am Ende des Prompts angehängt (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Ursprünglicher Prompt + Parameter |
| Ohne Parameter   | Prompt wird unverändert gesendet                       | `/cmd` → Ursprünglicher Prompt                 |

🚀 Dynamische Inhaltsinjektion

| Injektionstyp         | Syntax         | Verarbeitungsreihenfolge | Zweck                          |
| --------------------- | -------------- | ------------------------ | ------------------------------ |
| Dateiinhalt           | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien injizieren |
| Shell-Befehle         | `!{command}`   | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse injizieren |
| Parameterersetzung    | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter injizieren   |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Operation                       | Benutzerinteraktion  |
| ------------------------------- | -------------------- |
| 1. Befehl und Parameter parsen  | -                    |
| 2. Automatisches Shell-Escaping | -                    |
| 3. Bestätigungsdialog anzeigen  | ✅ Benutzerbestätigung |
| 4. Befehl ausführen             | -                    |
| 5. Ausgabe in Prompt injizieren | -                    |

Beispiel: Generierung von Git-Commit-Nachrichten

````markdown
---
description: Commit-Nachricht basierend auf gestagten Änderungen generieren
---

Bitte generiere eine Commit-Nachricht basierend auf folgendem Diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhalt-Injektion (`@{...}`)

| Dateityp     | Support-Status         | Verarbeitungsmethode        |
| ------------ | ---------------------- | --------------------------- |
| Textdateien  | ✅ Vollständig unterstützt | Inhalt direkt injizieren    |
| Bilder/PDF   | ✅ Multi-Modal unterstützt | Kodieren und injizieren     |
| Binärdateien | ⚠️ Eingeschränkt unterstützt | Kann übersprungen oder abgeschnitten werden |
| Verzeichnis  | ✅ Rekursive Injektion | Befolgt .gitignore-Regeln   |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Überprüfe {{args}}, Referenzstandards:

@{docs/code-standards.md}
```

### Praktisches Erstellungbeispiel

#### Tabelle: Schritte zur Erstellung des Befehls "Pure Function Refactoring"

| Operation                     | Befehl/Code                               |
| ----------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen     | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten   | Siehe den vollständigen Code unten.       |
| 4. Befehl testen              | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Code zu reiner Funktion refactoren
---

Bitte analysiere den Code im aktuellen Kontext und refactore ihn zu einer reinen Funktion.
Anforderungen:

1. Liefere den refactorten Code
2. Erkläre die wichtigsten Änderungen und die Implementierung der Merkmale reiner Funktionen
3. Erhalte die Funktionalität der Funktion unverändert
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Tabelle: Empfehlungen zum Befehlsdesign

| Praxispunkte       | Empfohlener Ansatz                | Vermeiden                                   |
| ------------------ | --------------------------------- | ------------------------------------------- |
| Befehlsbenennung   | Namespaces zur Organisation verwenden | Vermeide zu generische Namen                |
| Parameterverarbeitung | Verwende explizit `{{args}}`      | Verlasse dich auf das Standard-Anhängen (kann verwirren) |
| Fehlerbehandlung   | Nutze Shell-Fehlerausgaben        | Ignoriere Ausführungsfehler nicht           |
| Dateiorganisation  | Organisiere nach Funktion in Verzeichnissen | Alle Befehle im Root-Verzeichnis            |
| Beschreibungsfeld  | Gib immer eine klare Beschreibung an | Verlasse dich nicht auf automatisch generierte Beschreibungen |

#### Tabelle: Erinnerung an Sicherheitsfunktionen

| Sicherheitsmechanismus | Schutzwirkung          | Benutzeroperation      |
| ---------------------- | ---------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Command Injection | Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet unbeabsichtigte Ausführung | Dialogbestätigung      |
| Fehlerberichterstattung | Hilft bei der Fehlerdiagnose | Fehlerinformationen anzeigen |