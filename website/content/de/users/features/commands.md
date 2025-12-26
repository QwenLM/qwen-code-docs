# Befehle

Dieses Dokument enthält alle von Qwen Code unterstützten Befehle und hilft Ihnen dabei, Sitzungen effizient zu verwalten, die Benutzeroberfläche anzupassen und deren Verhalten zu steuern.

Qwen Code-Befehle werden durch spezifische Präfixe ausgelöst und fallen in drei Kategorien:

| Präfixtyp                  | Funktionsbeschreibung                               | Typischer Anwendungsfall                                         |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Slash-Befehle (`/`)        | Meta-Ebene Steuerung von Qwen Code selbst           | Sitzungsverwaltung, Einstellungsanpassung, Hilfe abrufen         |
| At-Befehle (`@`)           | Schnelle Einbindung lokalen Dateiinhalts in die Konversation | KI ermöglichen, angegebene Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell            | Ausführung von Systembefehlen wie `git status`, `ls`, etc.       |

## 1. Slash-Befehle (`/`)

Slash-Befehle werden verwendet, um Qwen Code-Sitzungen, die Benutzeroberfläche und grundlegendes Verhalten zu verwalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen Ihnen dabei, Arbeitsfortschritte zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl      | Beschreibung                                              | Verwendungsbeispiele                 |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analysiert das aktuelle Verzeichnis und erstellt eine initiale Kontextdatei | `/init`                              |
| `/summary`  | Erstellt eine Projektzusammenfassung basierend auf dem Gesprächsverlauf | `/summary`                           |
| `/compress` | Ersetzt den Chatverlauf durch eine Zusammenfassung, um Tokens zu sparen | `/compress`                          |
| `/resume`   | Setzt eine vorherige Gesprächssitzung fort                | `/resume`                            |
| `/restore`  | Stellt Dateien in den Zustand vor der Tool-Ausführung wieder her | `/restore` (Liste) oder `/restore <ID>` |

### 1.2 Interface- und Arbeitsbereichssteuerung

Befehle zum Anpassen der Oberflächenerscheinung und der Arbeitsumgebung.

| Befehl       | Beschreibung                                            | Verwendungsbeispiele          |
| ------------ | ------------------------------------------------------- | ----------------------------- |
| `/clear`     | Inhalt des Terminalbildschirms löschen                  | `/clear` (Tastenkürzel: `Strg+L`) |
| `/theme`     | Visuelles Theme von Qwen Code ändern                    | `/theme`                      |
| `/vim`       | Vim-Bearbeitungsmodus für Eingabebereich ein-/ausschalten | `/vim`                        |
| `/directory` | Arbeitsbereich mit Multi-Verzeichnis-Unterstützung verwalten | `/dir add ./src,./tests`      |
| `/editor`    | Dialog zum Auswählen eines unterstützten Editors öffnen | `/editor`                     |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                     | Verwendungsbeispiele       |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Spracheinstellungen anzeigen oder ändern | `/language`                |
| → `ui [Sprache]`      | Oberflächensprache festlegen     | `/language ui de-DE`       |
| → `output [Sprache]`  | LLM-Ausgabesprache festlegen     | `/language output German`  |

- Verfügbare eingebaute UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Werkzeug- und Modellverwaltung

Befehle zur Verwaltung von KI-Werkzeugen und -Modellen.

| Befehl           | Beschreibung                                  | Verwendungsbeispiele                          |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Konfigurierte MCP-Server und Werkzeuge auflisten | `/mcp`, `/mcp desc`                           |
| `/tools`         | Aktuell verfügbare Werkzeugliste anzeigen     | `/tools`, `/tools desc`                       |
| `/approval-mode` | Genehmigungsmodus für Werkzeugnutzung ändern  | `/approval-mode <Modus (auto-edit)> --project` |
| →`plan`          | Nur Analyse, keine Ausführung                 | Sichere Überprüfung                           |
| →`default`       | Genehmigung für Änderungen erforderlich       | Täglicher Gebrauch                            |
| →`auto-edit`     | Änderungen automatisch genehmigen             | Vertraute Umgebung                            |
| →`yolo`          | Alles automatisch genehmigen                  | Schnelles Prototyping                         |
| `/model`         | Modell wechseln, das in der aktuellen Sitzung verwendet wird | `/model`                                      |
| `/extensions`    | Alle aktiven Erweiterungen in der aktuellen Sitzung auflisten | `/extensions`                                 |
| `/memory`        | Instruktionskontext der KI verwalten          | `/memory add Wichtige Information`            |

### 1.5 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zum Durchführen von Systemeinstellungen.

| Befehl        | Beschreibung                                                         | Verwendungsbeispiele                   |
| ------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `/help`       | Hilfeinformationen für verfügbare Befehle anzeigen                   | `/help` oder `/?`                      |
| `/about`      | Versionsinformationen anzeigen                                       | `/about`                               |
| `/stats`      | Detaillierte Statistiken für die aktuelle Sitzung anzeigen           | `/stats`                               |
| `/settings`   | Einstellungseditor öffnen                                            | `/settings`                            |
| `/auth`       | Authentifizierungsmethode ändern                                     | `/auth`                                |
| `/bug`        | Problem bezüglich Qwen Code melden                                   | `/bug Button click unresponsive`       |
| `/copy`       | Letzten Ausgabecode in die Zwischenablage kopieren                   | `/copy`                                |
| `/quit`       | Qwen Code sofort beenden                                             | `/quit` oder `/exit`                   |

### 1.6 Häufige Tastenkürzel

| Tastenkürzel       | Funktion                | Hinweis                |
| ------------------ | ----------------------- | ---------------------- |
| `Strg/cmd+L`       | Bildschirm löschen      | Äquivalent zu `/clear` |
| `Strg/cmd+T`       | Werkzeugbeschreibung umschalten | MCP-Werkzeugverwaltung |
| `Strg/cmd+C`×2     | Beendigungsbestätigung  | Sicherer Beendigungsmechanismus |
| `Strg/cmd+Z`       | Eingabe rückgängig machen | Textbearbeitung        |
| `Strg/cmd+Umschalt+Z` | Eingabe wiederholen   | Textbearbeitung        |

## 2. @-Befehle (Dateien einfügen)

@-Befehle werden verwendet, um schnell Inhalte lokaler Dateien oder Verzeichnisse in die Konversation einzufügen.

| Befehlsformat        | Beschreibung                                                    | Beispiele                                                        |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@<Dateipfad>`       | Inhalt der angegebenen Datei einfügen                          | `@src/main.py Bitte erkläre diesen Code`                         |
| `@<Verzeichnispfad>` | Rekursiv alle Textdateien im Verzeichnis lesen                 | `@docs/ Fasse den Inhalt dieses Dokuments zusammen`              |
| Alleinstehendes `@`  | Wird verwendet, wenn das Symbol `@` selbst besprochen wird     | `@ Wofür wird dieses Symbol in der Programmierung verwendet?`    |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z.B. `@Meine\ Dokumente/datei.txt`)

## 3. Ausruf-Befehle (`!`) - Shell-Befehlsausführung

Ausruf-Befehle ermöglichen es Ihnen, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat      | Beschreibung                                                     | Beispiele                              |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `!<Shell-Befehl>` | Befehl in einer Sub-Shell ausführen                              | `!ls -la`, `!git status`               |
| Eigenständiges `!` | Shell-Modus wechseln, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabe) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Befehle, die über `!` ausgeführt werden, setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichern Sie häufig verwendete Prompts als Shortcut-Befehle, um die Arbeits-effizienz zu verbessern und Konsistenz zu gewährleisten.

### Schnellübersicht

| Funktion         | Beschreibung                               | Vorteile                               | Priorität | Anwendbare Szenarien                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt Doppelpunkt-Befehle | Bessere Befehlsorganisation            |          |                                                      |
| Globale Befehle  | `~/.qwen/commands/`                        | In allen Projekten verfügbar           | Niedrig  | Persönlich häufig genutzte Befehle, projektübergreifende Nutzung |
| Projekt-Befehle  | `<Projekt-Stammverzeichnis>/.qwen/commands/` | Projektspezifisch, versionskontrollierbar | Hoch     | Team-Sharing, projektspezifische Befehle             |

Prioritätsregeln: Projekt-Befehle > Benutzer-Befehle (Projekt-Befehl wird verwendet, wenn Namen identisch sind)

### Namensregeln für Befehle

#### Dateipfad-zu-Befehlsname-Zuordnungstabelle

| Dateispeicherort             | Generierter Befehl | Beispielaufruf        |
| ---------------------------- | ------------------ | --------------------- |
| `~/.qwen/commands/test.toml` | `/test`            | `/test Parameter`     |
| `<project>/git/commit.toml`  | `/git:commit`      | `/git:commit Message` |

Namensregeln: Pfadseparator (`/` oder `\`) werden in Doppelpunkt (`:`) umgewandelt

### TOML-Dateiformatspezifikation

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                   |
| ------------- | ------------ | ------------------------------------------ | ------------------------------------------ |
| `prompt`      | Erforderlich | Prompt-Inhalt, der an das Modell gesendet wird | `prompt = "Bitte analysiere den Code: {{args}}"` |
| `description` | Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code-Analyse-Tool"`        |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode         | Syntax             | Anwendbare Szenarien                 | Sicherheitsfunktionen                  |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbezogene Injektion    | `{{args}}`         | Benötigt präzise Parameterkontrolle  | Automatisches Shell-Escaping           |
| Standardparameterverarbeitung| Keine besondere Markierung | Einfache Befehle, Parameteranfügung | Wie-is anhängen                        |
| Shell-Befehlsinjektion       | `!{command}`       | Benötigt dynamischen Inhalt          | Ausführungsbestätigung erforderlich    |

#### 1. Kontextabhängige Injection (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode         | Tatsächlicher Effekt     |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Raw Injection    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Führe `grep "hello" .` aus |

#### 2. Standard-Parameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                   | Beispiel                                       |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Hat Parameter    | An das Ende der Eingabeaufforderung anhängen (getrennt durch zwei Zeilenumbrüche) | `/cmd parameter` → Original-Eingabeaufforderung + Parameter |
| Keine Parameter  | Eingabeaufforderung so senden, wie sie ist            | `/cmd` → Original-Eingabeaufforderung          |

🚀 Dynamische Inhaltsinjektion

| Injektionsart         | Syntax         | Verarbeitungsreihenfolge | Zweck                              |
| --------------------- | -------------- | ------------------------ | ---------------------------------- |
| Dateiinhalt           | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien einfügen |
| Shell-Befehle         | `!{Befehl}`    | Wird in der Mitte verarbeitet | Dynamische Ausführungsergebnisse einfügen |
| Parameterersetzung    | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter einfügen         |

#### 3. Shell-Befehlsausführung (`!{...}`)

| Vorgang                         | Benutzerinteraktion  |
| ------------------------------- | -------------------- |
| 1. Befehl und Parameter parsen  | -                    |
| 2. Automatisches Shell-Escaping | -                    |
| 3. Bestätigungsdialog anzeigen  | ✅ Benutzerbestätigung |
| 4. Befehl ausführen             | -                    |
| 5. Ausgabe in Prompt einfügen   | -                    |

Beispiel: Git-Commit-Nachricht-Generierung

```

# git/commit.toml
description = "Commit-Nachricht basierend auf gestagten Änderungen generieren"
prompt = """
Bitte generiere eine Commit-Nachricht basierend auf folgendem Diff:
diff
!{git diff --staged}
"""
```

#### 4. Dateiinhaltsinjektion (`@{...}`)

| Dateityp     | Unterstützungstatus    | Verarbeitungsmethode        |
| ------------ | ---------------------- | --------------------------- |
| Textdateien  | ✅ Vollständige Unterstützung | Inhalt direkt injizieren     |
| Bilder/PDF   | ✅ Multimodale Unterstützung | Kodieren und injizieren       |
| Binärdateien | ⚠️ Eingeschränkte Unterstützung | Kann übersprungen oder gekürzt werden |
| Verzeichnis  | ✅ Rekursive Injektion | .gitignore-Regeln befolgen    |

Beispiel: Code-Review-Befehl

```

# review.toml
description = "Code-Review basierend auf Best Practices"
prompt = """
Review {{args}}, Referenzstandards:

@{docs/code-standards.md}
"""
```

### Praktisches Erstellungsbeispiel

#### Tabelle zur Erstellung von "Pure Function Refactoring"-Befehlen

| Operation                     | Befehl/Code                                 |
| ----------------------------- | ------------------------------------------- |
| 1. Verzeichnisstruktur erstellen | `mkdir -p ~/.qwen/commands/refactor`        |
| 2. Befehlsdatei erstellen     | `touch ~/.qwen/commands/refactor/pure.toml` |
| 3. Befehlsinhalt bearbeiten   | Siehe vollständigen Code unten.             |
| 4. Befehl testen              | `@file.js` → `/refactor:pure`               |

```# ~/.qwen/commands/refactor/pure.toml
description = "Code zu reiner Funktion refaktorisieren"
prompt = """
	Bitte analysiere den Code im aktuellen Kontext und refaktorisiere ihn zu einer reinen Funktion.
	Anforderungen:
		1. Stelle den refaktorisierten Code bereit
		2. Erkläre wesentliche Änderungen und Implementierung der Merkmale reiner Funktionen
		3. Funktion unverändert lassen
	"""
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Empfehlungstabelle für Befehlsdesign

| Praxispunkte         | Empfohlener Ansatz                  | Vermeiden                                   |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Befehlsbenennung     | Verwende Namespaces zur Organisation| Zu allgemeine Namen vermeiden               |
| Parameterverarbeitung| Verwende klar `{{args}}`            | Auf automatisches Anhängen verlassen (leicht zu verwechseln) |
| Fehlerbehandlung     | Nutze Shell-Fehlerausgabe           | Ausführungsfehler ignorieren                |
| Dateiorganisation    | Organisiere nach Funktion in Verzeichnissen | Alle Befehle im Root-Verzeichnis          |
| Beschreibungsfeld    | Immer klare Beschreibung angeben    | Auf automatisch generierte Beschreibung verlassen |

#### Sicherheitsfunktionen Erinnerungstabelle

| Sicherheitsmechanismus | Schutzwirkung              | Benutzeroperation      |
| ---------------------- | -------------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Befehlsinjektion| Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet versehentliche Ausführung | Dialogbestätigung    |
| Fehlerberichterstattung| Hilft bei der Fehlerdiagnose | Fehlerinformationen anzeigen |