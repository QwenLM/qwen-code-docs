# Befehle

Dieses Dokument enthält eine detaillierte Liste aller von Qwen Code unterstützten Befehle und hilft Ihnen dabei, Sitzungen effizient zu verwalten, die Benutzeroberfläche anzupassen und deren Verhalten zu steuern.

Qwen Code-Befehle werden durch spezifische Präfixe ausgelöst und fallen in drei Kategorien:

| Präfixtyp                  | Funktionsbeschreibung                               | Typischer Anwendungsfall                                         |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Schrägstrich-Befehle (`/`) | Meta-Ebene zur Steuerung von Qwen Code selbst       | Verwaltung von Sitzungen, Änderung von Einstellungen, Hilfeabruf |
| At-Befehle (`@`)           | Schnelle Einbindung lokalen Dateiinhalts ins Gespräch | Analyse bestimmter Dateien oder Code unter Verzeichnissen durch KI ermöglichen |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell            | Ausführung von Systembefehlen wie `git status`, `ls`, etc.       |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sitzungen zu verwalten, die Benutzeroberfläche zu steuern und grundlegendes Verhalten zu definieren.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen Ihnen dabei, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl      | Beschreibung                                              | Verwendungsbeispiele                 |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analysiert das aktuelle Verzeichnis und erstellt eine initiale Kontextdatei | `/init`                              |
| `/summary`  | Erstellt eine Projekts Zusammenfassung basierend auf dem Gesprächsverlauf | `/summary`                           |
| `/compress` | Ersetzt den Chatverlauf durch eine Zusammenfassung, um Tokens zu sparen | `/compress`                          |
| `/resume`   | Setzt eine vorherige Gesprächssitzung fort                | `/resume`                            |
| `/restore`  | Stellt Dateien in den Zustand vor der Tool-Ausführung wieder her | `/restore` (Liste) oder `/restore <ID>` |

### 1.2 Schnittstelle und Arbeitsbereichssteuerung

Befehle zum Anpassen der Oberflächenerscheinung und der Arbeitsumgebung.

| Befehl       | Beschreibung                                                     | Verwendungsbeispiele          |
| ------------ | ---------------------------------------------------------------- | ----------------------------- |
| `/clear`     | Inhalt des Terminalbildschirms löschen                           | `/clear` (Tastenkürzel: `Strg+L`) |
| `/theme`     | Visuelles Theme von Qwen Code ändern                             | `/theme`                      |
| `/vim`       | Vim-Bearbeitungsmodus für den Eingabebereich ein-/ausschalten    | `/vim`                        |
| `/directory` | Arbeitsbereich mit Unterstützung für mehrere Verzeichnisse verwalten | `/dir add ./src,./tests`      |
| `/editor`    | Dialog öffnen, um unterstützten Editor auszuwählen               | `/editor`                     |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                          | Verwendungsbeispiele         |
| --------------------- | ------------------------------------- | ---------------------------- |
| `/language`           | Spracheinstellungen anzeigen oder ändern | `/language`                  |
| → `ui [Sprache]`      | Oberflächensprache festlegen          | `/language ui de-DE`         |
| → `output [Sprache]`  | LLM-Ausgabesprache festlegen          | `/language output German`    |

- Verfügbare eingebaute Oberflächensprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese`, usw.

### 1.4 Werkzeug- und Modellverwaltung

Befehle zur Verwaltung von KI-Werkzeugen und -Modellen.

| Befehl           | Beschreibung                                  | Beispielanwendungen                          |
| ---------------- | --------------------------------------------- | -------------------------------------------- |
| `/mcp`           | Konfigurierte MCP-Server und Werkzeuge auflisten | `/mcp`, `/mcp desc`                          |
| `/tools`         | Aktuell verfügbare Werkzeugliste anzeigen     | `/tools`, `/tools desc`                      |
| `/skills`        | Verfügbare Skills auflisten und ausführen     | `/skills`, `/skills <Name>`                  |
| `/approval-mode` | Genehmigungsmodus für Werkzeugnutzung ändern  | `/approval-mode <Modus (auto-edit)> --project` |
| →`plan`          | Nur Analyse, keine Ausführung                 | Sichere Überprüfung                          |
| →`default`       | Genehmigung für Änderungen erforderlich       | Tägliche Nutzung                             |
| →`auto-edit`     | Änderungen automatisch genehmigen             | Vertraute Umgebung                           |
| →`yolo`          | Alles automatisch genehmigen                  | Schnelle Prototypenerstellung                |
| `/model`         | Im aktuellen Sitzung verwendeten Modell wechseln | `/model`                                     |
| `/extensions`    | Alle aktiven Erweiterungen in der aktuellen Sitzung auflisten | `/extensions`                                |
| `/memory`        | Anweisungskontext der KI verwalten            | `/memory add Wichtige Information`           |

### 1.5 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zum Durchführen von Systemeinstellungen.

| Befehl      | Beschreibung                                                         | Verwendungsbeispiele             |
| ----------- | -------------------------------------------------------------------- | -------------------------------- |
| `/help`     | Hilfegrundlagen für verfügbare Befehle anzeigen                      | `/help` oder `/?`                |
| `/about`    | Versionsinformationen anzeigen                                       | `/about`                         |
| `/stats`    | Detaillierte Statistiken für die aktuelle Sitzung anzeigen           | `/stats`                         |
| `/settings` | Einstellungseditor öffnen                                            | `/settings`                      |
| `/auth`     | Authentifizierungsmethode ändern                                     | `/auth`                          |
| `/bug`      | Problem bezüglich Qwen Code melden                                   | `/bug Button click unresponsive` |
| `/copy`     | Letzten Ausgabekontext in Zwischenablage kopieren                    | `/copy`                          |
| `/quit`     | Qwen Code sofort beenden                                             | `/quit` oder `/exit`             |

### 1.6 Häufige Tastenkürzel

| Tastenkürzel       | Funktion                | Hinweis                |
| ------------------ | ----------------------- | ---------------------- |
| `Strg/cmd+L`       | Bildschirm löschen      | Äquivalent zu `/clear` |
| `Strg/cmd+T`       | Werkzeugbeschreibung umschalten | MCP-Werkzeugverwaltung |
| `Strg/cmd+C`×2     | Beendigungsbestätigung  | Sicherer Beendigungsmechanismus |
| `Strg/cmd+Z`       | Eingabe rückgängig machen | Textbearbeitung        |
| `Strg/cmd+Umschalt+Z` | Eingabe wiederholen   | Textbearbeitung        |

## 2. @-Befehle (Einführung von Dateien)

@-Befehle werden verwendet, um schnell Inhalte aus lokalen Dateien oder Verzeichnissen in die Konversation einzufügen.

| Befehlsformat        | Beschreibung                                            | Beispiele                                               |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `@<Dateipfad>`       | Fügt den Inhalt der angegebenen Datei ein               | `@src/main.py Bitte erkläre diesen Code`                |
| `@<Verzeichnispfad>` | Liesst rekursiv alle Textdateien im Verzeichnis ein     | `@docs/ Fasse den Inhalt dieses Dokuments zusammen`     |
| Eigenständiges `@`   | Wird verwendet, wenn das Symbol `@` selbst besprochen wird | `@ Wofür wird dieses Symbol in der Programmierung verwendet?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z.B. `@Meine\ Dokumente/datei.txt`)

## 3. Ausrufezeichen-Befehle (`!`) - Ausführung von Shell-Befehlen

Ausrufezeichen-Befehle ermöglichen es Ihnen, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat        | Beschreibung                                                                 | Beispiele                              |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `!<Shell-Befehl>`   | Befehl in einer Unter-Shell ausführen                                      | `!ls -la`, `!git status`               |
| Eigenständiges `!`   | Shell-Modus wechseln, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabe) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Befehle, die über `!` ausgeführt werden, setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichern Sie häufig verwendete Prompts als Shortcut-Befehle, um die Arbeits-effizienz zu verbessern und Konsistenz sicherzustellen.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Wenn TOML-Dateien erkannt werden, wird eine automatische Migrationsaufforderung angezeigt.

### Schnellübersicht

| Funktion         | Beschreibung                               | Vorteile                               | Priorität | Anwendbare Szenarien                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | --------- | ---------------------------------------------------- |
| Namensraum       | Unterverzeichnis erstellt Doppelpunkt-Befehle | Bessere Befehlsorganisation           |           |                                                      |
| Globale Befehle  | `~/.qwen/commands/`                        | In allen Projekten verfügbar           | Niedrig   | Persönlich häufig genutzte Befehle, projektübergreifende Nutzung |
| Projekt-Befehle  | `<Projekt-Wurzelverzeichnis>/.qwen/commands/` | Projektspezifisch, versionskontrollierbar | Hoch    | Teilen innerhalb des Teams, projektspezifische Befehle |

Prioritätsregeln: Projekt-Befehle > Benutzer-Befehle (Projekt-Befehl wird verwendet, wenn Namen identisch sind)

### Namensregeln für Befehle

#### Dateipfad-zu-Befehlsnamen-Zuordnungstabelle

| Dateispeicherort                           | Generierter Befehl | Beispielaufruf        |
| ------------------------------------------ | ------------------ | --------------------- |
| `~/.qwen/commands/test.md`                 | `/test`            | `/test Parameter`     |
| `<Projekt>/.qwen/commands/git/commit.md`   | `/git:commit`      | `/git:commit Nachricht` |

Namensregeln: Pfadseparator (`/` oder `\`) werden in Doppelpunkt (`:`) umgewandelt

### Markdown-Dateiformat-Spezifikation (Empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Ihr Prompt-Inhalt hier.
Verwenden Sie {{args}} für Parameterinjektion.
```

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                   |
| ------------- | ------------ | ------------------------------------------ | ------------------------------------------ |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description: Code-Analyse-Tool`           |
| Prompt-Inhalt | Erforderlich | An den Modell gesendeter Prompt-Inhalt     | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (Veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird weiterhin unterstützt, aber in einer zukünftigen Version entfernt. Bitte migrieren Sie zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                                | Beispiel                                   |
| ------------- | ------------ | ------------------------------------------- | ------------------------------------------ |
| `prompt`      | Erforderlich | Anfrageinhalt, der an das Modell gesendet wird | `prompt = "Bitte analysiere den Code: {{args}}"` |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Werkzeug zur Code-Analyse"` |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode         | Syntax             | Anwendbare Szenarien                 | Sicherheitsfunktionen                  |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbezogene Injektion    | `{{args}}`         | Benötigt präzise Parameterkontrolle  | Automatisches Shell-Escaping           |
| Standardparameterverarbeitung| Keine besondere Markierung | Einfache Befehle, Parameteranfügung | Ohne Änderungen anhängen               |
| Shell-Befehlsinjektion       | `!{command}`       | Benötigt dynamischen Inhalt          | Ausführungsbestätigung erforderlich    |

#### 1. Kontextabhängige Injection (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode         | Tatsächlicher Effekt     |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Rohe Injection   | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Führe `grep "hello" .` aus |

#### 2. Standardmäßige Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                 | Beispiel                                     |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| Hat Parameter    | An das Ende der Aufforderung anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd Parameter` → Ursprüngliche Aufforderung + Parameter |
| Keine Parameter  | Aufforderung so senden, wie sie ist                  | `/cmd` → Ursprüngliche Aufforderung          |

🚀 Dynamische Inhaltsinjektion

| Injektionsart           | Syntax         | Verarbeitungsreihenfolge | Zweck                                |
| ----------------------- | -------------- | ------------------------ | ------------------------------------ |
| Dateiinhalt             | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien einfügen   |
| Shell-Befehle           | `!{Befehl}`    | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse einfügen |
| Parameterersetzung      | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter einfügen           |

#### 3. Ausführung von Shell-Befehlen (`!{...}`)

| Vorgang                         | Benutzerinteraktion  |
| ------------------------------- | -------------------- |
| 1. Befehl und Parameter parsen  | -                    |
| 2. Automatisches Shell-Escaping | -                    |
| 3. Bestätigungsdialog anzeigen  | ✅ Benutzerbestätigung |
| 4. Befehl ausführen             | -                    |
| 5. Ausgabe in Prompt einfügen   | -                    |

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

#### 4. Dateiinhaltsinjektion (`@{...}`)

| Dateityp     | Unterstützungstatus  | Verarbeitungsmethode        |
| ------------ | -------------------- | --------------------------- |
| Textdateien  | ✅ Vollständige Unterstützung | Inhalt direkt injizieren    |
| Bilder/PDF   | ✅ Multimodale Unterstützung | Kodieren und injizieren     |
| Binärdateien | ⚠️ Eingeschränkte Unterstützung | Kann übersprungen oder gekürzt werden |
| Verzeichnis  | ✅ Rekursive Injektion | .gitignore-Regeln befolgen  |

Beispiel: Code-Review-Befehl

```markdown
---
description: Code-Review basierend auf Best Practices
---

Überprüfe {{args}}, Referenzstandards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Tabelle zur Erstellung von „Pure Function Refactoring“-Befehlen

| Vorgang                       | Befehl/Code                               |
| ----------------------------- | ----------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Befehlsdatei erstellen     | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Befehlsinhalt bearbeiten   | Siehe vollständigen Code unten.           |
| 4. Befehl testen              | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Code zu reiner Funktion umgestalten
---

Bitte analysieren Sie den Code im aktuellen Kontext und gestalten Sie ihn als reine Funktion neu.
Anforderungen:

1. Stellen Sie den überarbeiteten Code bereit
2. Erklären Sie die wesentlichen Änderungen und die Implementierung der Merkmale einer reinen Funktion
3. Funktion unverändert lassen
```

### Zusammenfassung bewährter Methoden für benutzerdefinierte Befehle

#### Empfehlungen zur Befehlsstruktur-Tabelle

| Praxispunkte         | Empfohlener Ansatz                  | Vermeiden                                   |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Befehlsbenennung     | Namensräume für Organisation nutzen | Zu generische Namen vermeiden               |
| Parameterverarbeitung| `{{args}}` klar verwenden           | Standard-Anhängen verlassen (leicht zu verwechseln) |
| Fehlerbehandlung     | Shell-Fehlerausgabe nutzen          | Ausführungsfehler ignorieren                |
| Dateiorganisation    | Nach Funktion in Verzeichnissen organisieren | Alle Befehle im Root-Verzeichnis        |
| Beschreibungsfeld    | Immer klare Beschreibung angeben    | Auf automatisch generierte Beschreibung verlassen |

#### Sicherheitsfunktionen Erinnerungstabelle

| Sicherheitsmechanismus | Schutzwirkung              | Benutzeroperation      |
| ---------------------- | -------------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Befehlsinjektion| Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet versehentliche Ausführung | Dialogbestätigung    |
| Fehlerberichterstattung| Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |