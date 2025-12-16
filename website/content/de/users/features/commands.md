# Befehle

Dieses Dokument beschreibt alle von Qwen Code unterstützten Befehle und hilft Ihnen dabei, Sitzungen effizient zu verwalten, die Benutzeroberfläche anzupassen und das Verhalten zu steuern.

Qwen Code-Befehle werden durch spezifische Präfixe ausgelöst und lassen sich in drei Kategorien unterteilen:

| Präfix-Typ                 | Funktionsbeschreibung                              | Typischer Anwendungsfall                                           |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Schrägstrich-Befehle (`/`) | Metasteuerebene für Qwen Code selbst               | Verwaltung von Sitzungen, Änderung von Einstellungen, Hilfe abrufen |
| At-Befehle (`@`)           | Schnelles Einfügen lokaler Dateiinhalte im Gespräch | Ermöglicht der KI, bestimmte Dateien oder Code in Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell         | Ausführen von Systembefehlen wie `git status`, `ls`, usw.          |

## 1. Schrägstrich-Befehle (`/`)

Schrägstrich-Befehle werden verwendet, um Qwen Code-Sitzungen, die Benutzeroberfläche und das grundlegende Verhalten zu verwalten.

### 1.1 Sitzungs- und Projektverwaltung

Diese Befehle helfen Ihnen dabei, den Arbeitsfortschritt zu speichern, wiederherzustellen und zusammenzufassen.

| Befehl      | Beschreibung                                              | Anwendungsbeispiele                  |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/summary`  | Projektzusammenfassung basierend auf dem Gesprächsverlauf erstellen | `/summary`                           |
| `/compress` | Chat-Verlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                          |
| `/restore`  | Dateien in den Zustand vor der Tool-Ausführung zurückversetzen | `/restore` (Liste) oder `/restore <ID>` |
| `/init`     | Aktuelles Verzeichnis analysieren und initiale Kontextdatei erstellen | `/init`                              |

### 1.2 Schnittstelle und Arbeitsbereich-Kontrolle

Befehle zum Anpassen des Erscheinungsbilds der Benutzeroberfläche und der Arbeitsumgebung.

| Befehl       | Beschreibung                                 | Verwendungsbeispiele         |
| ------------ | -------------------------------------------- | ---------------------------- |
| `/clear`     | Inhalt des Terminalbildschirms löschen        | `/clear` (Tastenkürzel: `Strg+L`) |
| `/theme`     | Visuelles Theme von Qwen Code ändern          | `/theme`                     |
| `/vim`       | Vim-Bearbeitungsmodus im Eingabebereich ein-/ausschalten | `/vim`                       |
| `/directory` | Mehrverzeichnis-Unterstützung für Arbeitsbereich verwalten | `/dir add ./src,./tests`     |
| `/editor`    | Dialog öffnen, um einen unterstützten Editor auszuwählen | `/editor`                    |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Oberflächen- und Ausgabesprache.

| Befehl                | Beschreibung                     | Verwendungsbeispiele       |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Spracheinstellungen anzeigen oder ändern | `/language`                |
| → `ui [Sprache]`      | Sprache der Benutzeroberfläche festlegen | `/language ui zh-CN`       |
| → `output [Sprache]`  | Sprache der LLM-Ausgabe festlegen | `/language output Chinese` |

- Verfügbare UI-Sprachen: `zh-CN` (Vereinfachtes Chinesisch), `en-US` (Englisch)
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese`, usw.

### 1.4 Werkzeug- und Modellverwaltung

Befehle zur Verwaltung von KI-Werkzeugen und -Modellen.

| Befehl           | Beschreibung                                    | Anwendungsbeispiele                           |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Auflisten konfigurierter MCP-Server und Werkzeuge | `/mcp`, `/mcp desc`                           |
| `/tools`         | Anzeigen der aktuell verfügbaren Werkzeugliste  | `/tools`, `/tools desc`                       |
| `/approval-mode` | Ändern des Genehmigungsmodus für Werkzeugnutzung | `/approval-mode <Modus (auto-edit)> --project` |
| →`plan`          | Nur Analyse, keine Ausführung                   | Sichere Überprüfung                           |
| →`default`       | Genehmigung für Änderungen erforderlich         | Tägliche Nutzung                              |
| →`auto-edit`     | Änderungen automatisch genehmigen               | Vertrauenswürdige Umgebung                    |
| →`yolo`          | Alles automatisch genehmigen                    | Schneller Prototyp                            |
| `/model`         | Wechseln des in der aktuellen Sitzung verwendeten Modells | `/model`                                      |
| `/extensions`    | Auflisten aller aktiven Erweiterungen in der aktuellen Sitzung | `/extensions`                                 |
| `/memory`        | Verwalten des Anweisungskontexts der KI         | `/memory add Wichtige Information`            |

### 1.5 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und Durchführen von Systemeinstellungen.

| Befehl          | Beschreibung                                      | Verwendungsbeispiele                              |
| --------------- | ------------------------------------------------- | ------------------------------------------------- |
| `/help`         | Hilfeinformationen für verfügbare Befehle anzeigen | `/help` oder `/?`                                 |
| `/about`        | Versionsinformationen anzeigen                     | `/about`                                          |
| `/stats`        | Detaillierte Statistiken der aktuellen Sitzung anzeigen | `/stats`                                          |
| `/settings`     | Einstellungseditor öffnen                          | `/settings`                                       |
| `/auth`         | Authentifizierungsmethode ändern                   | `/auth`                                           |
| `/bug`          | Problem zu Qwen Code melden                        | `/bug Button click unresponsive`                  |
| `/copy`         | Letzten Ausgabedaten in die Zwischenablage kopieren | `/copy`                                           |
| `/quit-confirm` | Bestätigungsdialog vor dem Beenden anzeigen        | `/quit-confirm` (Tastenkürzel: `Strg+C` zweimal drücken) |
| `/quit`         | Qwen Code sofort beenden                           | `/quit` oder `/exit`                              |

### 1.6 Häufige Tastenkombinationen

| Tastenkombination  | Funktion                 | Hinweis                  |
| ------------------ | ------------------------ | ------------------------ |
| `Strg/cmd+L`       | Bildschirm löschen       | Entspricht `/clear`      |
| `Strg/cmd+T`       | Tool-Beschreibung ein/aus| MCP-Tool-Verwaltung      |
| `Strg/cmd+C`×2     | Beendigungsbestätigung   | Sicheres Beenden         |
| `Strg/cmd+Z`       | Eingabe rückgängig       | Textbearbeitung          |
| `Strg/cmd+Umschalt+Z` | Eingabe wiederherstellen | Textbearbeitung          |

## 2. @-Befehle (Einfügen von Dateien)

@-Befehle werden verwendet, um schnell Inhalte lokaler Dateien oder Verzeichnisse in die Konversation einzufügen.

| Befehlsformat       | Beschreibung                                 | Beispiele                                        |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<Dateipfad>`      | Inhalt der angegebenen Datei einfügen        | `@src/main.py Bitte erkläre diesen Code`         |
| `@<Verzeichnispfad>`| Rekursiv alle Textdateien im Verzeichnis lesen | `@docs/ Fasse den Inhalt dieses Dokuments zusammen` |
| Einzelnes `@`       | Wird verwendet, wenn das `@`-Symbol selbst besprochen wird | `@ Wofür wird dieses Symbol in der Programmierung verwendet?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@Meine\ Dokumente/Datei.txt`)

## 3. Ausrufezeichen-Befehle (`!`) - Shell-Befehlsausführung

Ausrufezeichen-Befehle ermöglichen es Ihnen, Systembefehle direkt innerhalb von Qwen Code auszuführen.

| Befehlsformat      | Beschreibung                                                       | Beispiele                              |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<Shell-Befehl>`  | Befehl in einer Sub-Shell ausführen                                | `!ls -la`, `!git status`               |
| Einzelnes `!`      | Shell-Modus wechseln, jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabe) → Befehl eingeben → `!`(Beenden) |

Umgebungsvariablen: Befehle, die über `!` ausgeführt werden, setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichern Sie häufig verwendete Prompts als Kurzbefehle, um die Arbeitseffizienz zu steigern und Konsistenz zu gewährleisten.

### Schneller Überblick

| Funktion         | Beschreibung                                | Vorteile                             | Priorität | Anwendungsszenarien                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Unterverzeichnis erstellt doppelpunktbenannte Befehle  | Bessere Befehlsorganisation            |          |                                                      |
| Globale Befehle  | `~/.qwen/commands/`                        | In allen Projekten verfügbar              | Niedrig  | Häufig verwendete persönliche Befehle, projektnutzungsübergreifend |
| Projekt-Befehle | `<Projekt-Stammverzeichnis>/.qwen/commands/` | Projektspezifisch, versionskontrollierbar | Hoch     | Teilen im Team, projektspezifische Befehle              |

Prioritätsregeln: Projekt-Befehle > Benutzerbefehle (Projekt-Befehl wird verwendet, wenn Namen identisch sind)

### Befehlsbenennungsregeln

#### Zuordnungstabelle von Dateipfad zu Befehlsname

| Dateispeicherort            | Generierter Befehl | Beispielaufruf        |
| --------------------------- | ------------------ | --------------------- |
| `~/.qwen/commands/test.toml` | `/test`            | `/test Parameter`     |
| `<project>/git/commit.toml`  | `/git:commit`      | `/git:commit Message` |

Benennungsregeln: Pfadtrennzeichen (`/` oder `\`) werden in Doppelpunkt (`:`) umgewandelt

### Spezifikation des TOML-Dateiformats

| Feld         | Erforderlich | Beschreibung                                 | Beispiel                                     |
| ------------ | ------------ | ------------------------------------------- | ------------------------------------------- |
| `prompt`     | Erforderlich | Aufforderungsinhalt, der an das Modell gesendet wird | `prompt = "Bitte analysiere den Code: {{args}}"` |
| `description`| Optional     | Befehlsbeschreibung (wird in /help angezeigt) | `description = "Code-Analysewerkzeug"`       |

### Parameter-Verarbeitungsmechanismus

| Verarbeitungsmethode              | Syntax             | Anwendungsszenarien                  | Sicherheitsfunktionen                   |
| --------------------------------- | ------------------ | ------------------------------------ | --------------------------------------- |
| Kontextabhängige Injektion        | `{{args}}`         | Präzise Parameterkontrolle benötigt  | Automatisches Shell-Escaping            |
| Standardparameterverarbeitung     | Keine besondere Kennzeichnung | Einfache Befehle, Parameteranfügung | Unverändert anhängen                    |
| Shell-Befehlsinjektion            | `!{command}`       | Dynamische Inhalte benötigt          | Ausführungsbestätigung vor erforderlich |

#### 1. Kontextabhängige Injektion (`{{args}}`)

| Szenario         | TOML-Konfiguration                     | Aufrufmethode          | Tatsächlicher Effekt     |
| ---------------- | -------------------------------------- | ---------------------- | ------------------------ |
| Rohinjektion     | `prompt = "Fix: {{args}}"`             | `/fix "Button issue"`  | `Fix: "Button issue"`    |
| In Shell-Befehl  | `prompt = "Search: !{grep {{args}} .}"`| `/search "hello"`      | Führt `grep "hello" .` aus |

#### 2. Standardparameterverarbeitung

| Eingabesituation | Verarbeitungsmethode                                    | Beispiel                                       |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Mit Parameter    | Anhängen ans Ende der Eingabeaufforderung (durch zwei Zeilenumbrüche getrennt) | `/cmd parameter` → Ursprüngliche Eingabeaufforderung + Parameter |
| Ohne Parameter   | Eingabeaufforderung unverändert senden                  | `/cmd` → Ursprüngliche Eingabeaufforderung    |

🚀 Dynamische Inhaltsinjektion

| Injektionsart         | Syntax         | Verarbeitungsreihenfolge | Zweck                              |
| --------------------- | -------------- | ------------------------ | ---------------------------------- |
| Dateiinhalt           | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien einfügen |
| Shell-Befehle         | `!{Befehl}`    | Wird mittig verarbeitet  | Dynamische Ausführungsergebnisse einfügen |
| Parameterersetzung    | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter einfügen         |

#### 3. Ausführung von Shell-Befehlen (`!{...}`)

| Operation                          | Benutzerinteraktion     |
| ---------------------------------- | ----------------------- |
| 1. Befehl und Parameter parsen    | -                       |
| 2. Automatisches Shell-Escaping   | -                       |
| 3. Bestätigungsdialog anzeigen    | ✅ Benutzerbestätigung  |
| 4. Befehl ausführen               | -                       |
| 5. Ausgabe in Prompt einfügen     | -                       |

Beispiel: Generierung von Git-Commit-Nachrichten

```

# git/commit.toml
description = "Commit-Nachricht basierend auf bereitgestellten Änderungen generieren"
prompt = """
Bitte generiere eine Commit-Nachricht basierend auf dem folgenden Diff:
diff
!{git diff --staged}
"""
```

#### 4. Dateiinhalts-Injektion (`@{...}`)

| Dateityp     | Unterstützung          | Verarbeitungsmethode        |
| ------------ | ---------------------- | --------------------------- |
| Textdateien  | ✅ Vollständig         | Inhalt direkt injizieren    |
| Bilder/PDF   | ✅ Multimodal          | Kodieren und injizieren     |
| Binärdateien | ⚠️ Eingeschränkt      | Können übersprungen oder abgeschnitten werden |
| Verzeichnis  | ✅ Rekursive Injektion | Folgt den .gitignore-Regeln |

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

#### Tabelle der Schritte zur Erstellung des Befehls „Pure Function Refactoring“

| Vorgang                       | Befehl/Code                                 |
| ----------------------------- | ------------------------------------------- |
| 1. Verzeichnisstruktur anlegen | `mkdir -p ~/.qwen/commands/refactor`        |
| 2. Befehlsdatei erstellen     | `touch ~/.qwen/commands/refactor/pure.toml` |
| 3. Befehlsinhalt bearbeiten   | Siehe vollständigen Code unten.             |
| 4. Befehl testen              | `@file.js` → `/refactor:pure`               |

```# ~/.qwen/commands/refactor/pure.toml
description = "Refactor code to pure function"
prompt = """
	Please analyze code in current context, refactor to pure function.
	Requirements:
		1. Provide refactored code
		2. Explain key changes and pure function characteristic implementation
		3. Maintain function unchanged
	"""
```

### Zusammenfassung der Best Practices für benutzerdefinierte Befehle

#### Tabelle mit Empfehlungen für die Befehlsentwicklung

| Praxisbereiche         | Empfohlener Ansatz                     | Vermeiden                                    |
| ---------------------- | -------------------------------------- | -------------------------------------------- |
| Befehlsbenennung       | Namespaces zur Organisation verwenden   | Übermäßig generische Namen vermeiden         |
| Parameterverarbeitung  | `{{args}}` klar verwenden              | Auf Standardanfügung verlassen (leicht verwirrend) |
| Fehlerbehandlung       | Shell-Fehlerausgabe nutzen             | Ausführungsfehler ignorieren                 |
| Dateiorganisation      | Nach Funktionen in Verzeichnisse ordnen | Alle Befehle im Stammverzeichnis             |
| Beschreibungsfeld      | Immer eine klare Beschreibung angeben   | Auf automatisch generierte Beschreibung verlassen |

#### Sicherheitsfunktionen – Erinnerungstabelle

| Sicherheitsmechanismus | Schutzwirkung             | Benutzeraktion         |
| ---------------------- | ------------------------- | ---------------------- |
| Shell-Escaping         | Verhindert Command Injection | Automatische Verarbeitung |
| Ausführungsbestätigung | Vermeidet versehentliche Ausführung | Dialogbestätigung      |
| Fehlerberichterstattung | Hilft bei der Diagnose von Problemen | Fehlerinformationen anzeigen |