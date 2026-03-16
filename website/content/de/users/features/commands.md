# Befehle

In diesem Dokument werden alle von Qwen Code unterstützten Befehle beschrieben, um Ihnen eine effiziente Verwaltung von Sitzungen, eine Anpassung der Benutzeroberfläche und eine Steuerung des Verhaltens zu ermöglichen.

Qwen-Code-Befehle werden über spezifische Präfixe ausgelöst und fallen in drei Kategorien:

| Präfix-Typ                 | Funktionsbeschreibung                               | Typischer Anwendungsfall                                         |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Schrägstrich-Befehle (`/`) | Meta-Ebene-Steuerelemente für Qwen Code selbst      | Verwalten von Sitzungen, Ändern von Einstellungen, Hilfe abrufen |
| At-Befehle (`@`)           | Schnelles Einbetten lokaler Dateiinhalte in die Konversation | Ermöglichen der KI, angegebene Dateien oder Code unter Verzeichnissen zu analysieren |
| Ausrufezeichen-Befehle (`!`) | Direkte Interaktion mit der System-Shell            | Ausführen von Systembefehlen wie `git status`, `ls` usw.         |

## 1. Schrägstrich-Befehle (`/`)

Schrägstrich-Befehle dienen der Verwaltung von Qwen Code-Sitzungen, der Benutzeroberfläche und des grundlegenden Verhaltens.

### 1.1 Sitzungs- und Projektverwaltung

Mit diesen Befehlen können Sie Ihren Arbeitsfortschritt speichern, wiederherstellen und zusammenfassen.

| Befehl       | Beschreibung                                                         | Beispielhafte Verwendung                     |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------- |
| `/init`      | Analysiert das aktuelle Verzeichnis und erstellt eine initiale Kontextdatei | `/init`                                      |
| `/summary`   | Erstellt eine Projektzusammenfassung basierend auf dem Gesprächsverlauf     | `/summary`                                   |
| `/compress`  | Ersetzt den Chatverlauf durch eine Zusammenfassung, um Token zu sparen     | `/compress`                                  |
| `/resume`    | Setzt eine vorherige Gesprächssitzung fort                                 | `/resume`                                    |
| `/restore`   | Stellt Dateien in den Zustand vor der Ausführung eines Tools wieder her     | `/restore` (Liste) oder `/restore <ID>` |

### 1.2 Schnittstelle und Arbeitsbereichskontrolle

Befehle zum Anpassen des Erscheinungsbilds der Benutzeroberfläche und der Arbeitsumgebung.

| Befehl         | Beschreibung                                      | Beispielhafte Verwendung             |
| -------------- | ------------------------------------------------- | -------------------------------------- |
| `/clear`       | Inhalte des Terminalbildschirms löschen           | `/clear` (Tastenkürzel: `Strg+L`)     |
| `/theme`       | Visuelles Thema von Qwen Code ändern              | `/theme`                             |
| `/vim`         | Vim-Bearbeitungsmodus im Eingabebereich umschalten | `/vim`                               |
| `/directory`   | Arbeitsbereich mit Unterstützung für mehrere Verzeichnisse verwalten | `/dir add ./src,./tests` |
| `/editor`      | Dialog zum Auswählen eines unterstützten Editors öffnen | `/editor`                      |

### 1.3 Spracheinstellungen

Befehle speziell zur Steuerung der Benutzeroberflächen- und Ausgabesprache.

| Befehl                  | Beschreibung                          | Beispielhafte Verwendung      |
| ----------------------- | --------------------------------------- | ----------------------------- |
| `/language`             | Spracheinstellungen anzeigen oder ändern | `/language`                   |
| → `ui [Sprache]`        | Sprache der Benutzeroberfläche festlegen | `/language ui zh-CN`          |
| → `output [Sprache]`    | Ausgabesprache des LLM festlegen       | `/language output Chinese`    |

- Verfügbare integrierte Benutzeroberflächensprachen: `zh-CN` (vereinfachtes Chinesisch), `en-US` (Englisch), `ru-RU` (Russisch), `de-DE` (Deutsch)  
- Beispiele für Ausgabesprachen: `Chinese`, `English`, `Japanese`, usw.

### 1.4 Verwaltung von Tools und Modellen

Befehle zur Verwaltung von KI-Tools und -Modellen.

| Befehl             | Beschreibung                                                  | Beispielhafte Nutzung                                   |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| `/mcp`             | Liste der konfigurierten MCP-Server und -Tools                | `/mcp`, `/mcp desc`                                     |
| `/tools`           | Zeigt die derzeit verfügbare Liste an Tools an                | `/tools`, `/tools desc`                                 |
| `/skills`          | Listet verfügbare Skills auf und führt sie aus                | `/skills`, `/skills <Name>`                             |
| `/approval-mode`   | Ändert den Genehmigungsmodus für die Tool-Nutzung             | `/approval-mode <Modus (auto-edit)> --project`         |
| →`plan`            | Nur Analyse, keine Ausführung                                  | Sichere Überprüfung                                     |
| →`default`         | Erfordert eine Genehmigung für Änderungen                     | Tägliche Nutzung                                        |
| →`auto-edit`       | Genehmigt Änderungen automatisch                              | Vertrauenswürdige Umgebung                              |
| →`yolo`            | Genehmigt alle Aktionen automatisch                           | Schnelles Prototyping                                   |
| `/model`           | Wechselt das im aktuellen Sitzung verwendete Modell          | `/model`                                                |
| `/extensions`      | Listet alle aktiven Erweiterungen in der aktuellen Sitzung auf | `/extensions`                                           |
| `/memory`          | Verwaltet den Anweisungskontext der KI                        | `/memory add Wichtige Informationen`                    |

### 1.5 Informationen, Einstellungen und Hilfe

Befehle zum Abrufen von Informationen und zum Durchführen von Systemeinstellungen.

| Befehl       | Beschreibung                                             | Beispielhafte Verwendung                     |
| ------------ | -------------------------------------------------------- | -------------------------------------------- |
| `/help`      | Zeigt Hilfetexte für verfügbare Befehle an               | `/help` oder `/?`                            |
| `/about`     | Zeigt Versionsinformationen an                           | `/about`                                     |
| `/stats`     | Zeigt detaillierte Statistiken für die aktuelle Sitzung an | `/stats`                                     |
| `/settings`  | Öffnet den Einstellungseditor                            | `/settings`                                  |
| `/auth`      | Ändert die Authentifizierungsmethode                     | `/auth`                                      |
| `/bug`       | Sendet ein Problem zu Qwen Code ein                      | `/bug Button-Klick reagiert nicht`           |
| `/copy`      | Kopiert den letzten Ausgabetext in die Zwischenablage    | `/copy`                                      |
| `/quit`      | Beendet Qwen Code sofort                                 | `/quit` oder `/exit`                         |

### 1.6 Häufig verwendete Tastenkombinationen

| Tastenkombination  | Funktion                | Hinweis                     |
| ------------------ | ----------------------- | --------------------------- |
| `Strg/Befehl+L`    | Bildschirm löschen      | Entspricht `/clear`         |
| `Strg/Befehl+T`    | Beschreibung der Tools umschalten | MCP-Tool-Verwaltung     |
| `Strg/Befehl+C`×2  | Beenden bestätigen      | Sichere Beendigungsmechanik |
| `Strg/Befehl+Z`    | Eingabe rückgängig machen | Textbearbeitung             |
| `Strg/Befehl+Umschalt+Z` | Eingabe wiederherstellen | Textbearbeitung         |

## 2. @-Befehle (Dateien einbinden)

Mit @-Befehlen können Sie schnell Inhalte lokaler Dateien oder Verzeichnisse in die Konversation einfügen.

| Befehlsformat         | Beschreibung                                              | Beispiele                                                    |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `@<Dateipfad>`        | Fügt den Inhalt der angegebenen Datei ein                 | `@src/main.py Bitte erläutern Sie diesen Code`              |
| `@<Verzeichnispfad>`  | Liest rekursiv alle Textdateien im Verzeichnis ein        | `@docs/ Fassen Sie den Inhalt dieses Dokuments zusammen`    |
| Eigenständiges `@`    | Wird verwendet, wenn das Symbol `@` selbst thematisiert wird | `@ Wofür wird dieses Symbol in der Programmierung verwendet?` |

Hinweis: Leerzeichen in Pfaden müssen mit einem umgekehrten Schrägstrich maskiert werden (z. B. `@My\ Documents/datei.txt`).

## 3. Ausrufezeichen-Befehle (`!`) – Ausführung von Shell-Befehlen

Ausrufezeichen-Befehle ermöglichen die direkte Ausführung von Systembefehlen innerhalb von Qwen Code.

| Befehlsformat       | Beschreibung                                                                 | Beispiele                              |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `!<Shell-Befehl>`   | Führt den Befehl in einer Unter-Shell aus                                    | `!ls -la`, `!git status`               |
| Einzelnes `!`       | Wechselt in den Shell-Modus; jede Eingabe wird direkt als Shell-Befehl ausgeführt | `!`(Eingabetaste) → Befehl eingeben → `!`(beenden) |

Umgebungsvariablen: Befehle, die über `!` ausgeführt werden, setzen die Umgebungsvariable `QWEN_CODE=1`.

## 4. Benutzerdefinierte Befehle

Speichern Sie häufig verwendete Eingabeaufforderungen als Tastenkombinationsbefehle, um die Arbeitseffizienz zu steigern und Konsistenz sicherzustellen.

> [!note]
>
> Benutzerdefinierte Befehle verwenden jetzt das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt. Bei Erkennung von TOML-Dateien wird automatisch eine Migrationsaufforderung angezeigt.

### Schnellübersicht

| Funktion          | Beschreibung                                      | Vorteile                                   | Priorität | Anwendungsszenarien                                          |
| ----------------- | ------------------------------------------------- | ------------------------------------------ | --------- | ------------------------------------------------------------- |
| Namespace         | Unterverzeichnis erzeugt Doppelpunkt-benannte Befehle | Bessere Befehlsorganisation                |           |                                                               |
| Globale Befehle   | `~/.qwen/commands/`                               | In allen Projekten verfügbar               | Niedrig   | Persönlich häufig genutzte Befehle, Nutzung über Projekte hinweg |
| Projektbefehle    | `<Projekt-Stammverzeichnis>/.qwen/commands/`      | Projektspezifisch, versionskontrollierbar | Hoch      | Team-Sharing, projektspezifische Befehle                      |

Prioritätsregeln: Projektbefehle > Benutzerbefehle (bei Namenskonflikten wird der Projektbefehl verwendet)

### Namensregeln für Befehle

#### Zuordnungstabelle: Dateipfad → Befehlsname

| Dateispeicherort                              | Generierter Befehl | Beispielaufruf         |
| --------------------------------------------- | ------------------ | ---------------------- |
| `~/.qwen/commands/test.md`                    | `/test`            | `/test Parameter`      |
| `<project>/.qwen/commands/git/commit.md`      | `/git:commit`      | `/git:commit Nachricht` |

Namensregeln: Trennzeichen im Pfad (`/` oder `\`) werden in einen Doppelpunkt (`:`) umgewandelt

### Markdown-Dateiformat-Spezifikation (empfohlen)

Benutzerdefinierte Befehle verwenden Markdown-Dateien mit optionalem YAML-Frontmatter:

```markdown
---
description: Optionale Beschreibung (wird in /help angezeigt)
---

Ihr Prompt-Inhalt hier.
Verwenden Sie `{{args}}` für die Parameterinjektion.
```

| Feld            | Erforderlich | Beschreibung                                      | Beispiel                                     |
| --------------- | ------------ | ------------------------------------------------- | -------------------------------------------- |
| `description`   | Optional     | Befehlsbeschreibung (wird in `/help` angezeigt)  | `description: Werkzeug zur Codeanalyse`      |
| Prompt-Inhalt   | Erforderlich | Der an das Modell gesendete Prompt-Inhalt         | Beliebiger Markdown-Inhalt nach dem Frontmatter |

### TOML-Dateiformat (veraltet)

> [!warning]
>
> **Veraltet:** Das TOML-Format wird derzeit noch unterstützt, wird aber in einer zukünftigen Version entfernt. Bitte migrieren Sie zum Markdown-Format.

| Feld          | Erforderlich | Beschreibung                               | Beispiel                                   |
| ------------- | ------------ | ------------------------------------------ | ------------------------------------------ |
| `prompt`      | Erforderlich | Die an das Modell gesendete Prompt-Inhalte | `prompt = "Bitte analysiere den Code: {{args}}"` |
| `description` | Optional     | Befehlsbeschreibung (wird in `/help` angezeigt) | `description = "Werkzeug zur Codeanalyse"` |

### Parameterverarbeitungsmechanismus

| Verarbeitungsmethode           | Syntax             | Anwendungsfälle                      | Sicherheitsfunktionen                  |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Kontextbewusste Injection      | `{{args}}`         | Präzise Parametersteuerung erforderlich | Automatisches Shell-Escaping           |
| Standardparameterverarbeitung | Keine besondere Markierung | Einfache Befehle, Parameteranfügung  | Anhängen ohne Änderung                 |
| Shell-Befehlsinjektion         | `!{command}`       | Dynamischer Inhalt erforderlich      | Ausführung nur nach Bestätigung möglich |

#### 1. Kontextbezogene Injection (`{{args}}`)

| Szenario         | TOML-Konfiguration                      | Aufrufmethode         | Tatsächliche Wirkung            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------------- |
| Roh-Insertion    | `prompt = "Fix: {{args}}"`              | `/fix "Button-Probleme"` | `Fix: "Button-Probleme"`        |
| In Shell-Befehl  | `prompt = "Suche: !{grep {{args}} .}"` | `/search "hallo"`     | Führt `grep "hallo" .` aus      |

#### 2. Standardverarbeitung von Parametern

| Eingabesituation | Verarbeitungsmethode                                      | Beispiel                                        |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Mit Parametern   | Am Ende der Aufforderung anhängen (durch zwei Zeilenumbrüche getrennt) | `/cmd Parameter` → Ursprüngliche Aufforderung + Parameter |
| Ohne Parameter   | Aufforderung unverändert senden                           | `/cmd` → Ursprüngliche Aufforderung              |

🚀 Dynamische Inhaltsinjektion

| Injektionstyp         | Syntax         | Verarbeitungsreihenfolge | Zweck                                  |
| --------------------- | -------------- | ------------------------ | -------------------------------------- |
| Dateiinhalt           | `@{Dateipfad}` | Wird zuerst verarbeitet  | Statische Referenzdateien einfügen    |
| Shell-Befehle         | `!{Befehl}`    | Wird in der Mitte verarbeitet | Ergebnisse dynamischer Ausführungen einfügen |
| Parameterersetzung    | `{{args}}`     | Wird zuletzt verarbeitet | Benutzerparameter einfügen             |

#### 3. Ausführung von Shell-Befehlen (`!{...}`)

| Vorgang                             | Benutzerinteraktion     |
| ----------------------------------- | ----------------------- |
| 1. Parsen des Befehls und der Parameter | –                       |
| 2. Automatisches Shell-Escaping     | –                       |
| 3. Anzeigen des Bestätigungsdialogs | ✅ Benutzerbestätigung  |
| 4. Ausführen des Befehls            | –                       |
| 5. Einbetten der Ausgabe in die Eingabeaufforderung | –                       |

Beispiel: Generierung einer Git-Commit-Nachricht

````markdown
---
description: Generiere eine Commit-Nachricht basierend auf den gestageten Änderungen
---

Bitte generiere eine Commit-Nachricht basierend auf dem folgenden Diff:

```diff
!{git diff --staged}
```
````

#### 4. Dateiinhaltseinbindung (`@{...}`)

| Dateityp       | Unterstützungsstatus     | Verarbeitungsmethode              |
| -------------- | ------------------------ | --------------------------------- |
| Textdateien    | ✅ Vollständige Unterstützung | Inhalte werden direkt eingebunden |
| Bilder/PDF     | ✅ Multimodale Unterstützung | Codierung und Einbindung          |
| Binärdateien   | ⚠️ Eingeschränkte Unterstützung | Können übersprungen oder abgeschnitten werden |
| Verzeichnis    | ✅ Rekursive Einbindung  | Beachtung der `.gitignore`-Regeln |

Beispiel: Befehl für die Codeüberprüfung

```markdown
---
description: Codeüberprüfung basierend auf Best Practices
---

Überprüfe {{args}} unter Bezugnahme auf folgende Standards:

@{docs/code-standards.md}
```

### Praktisches Erstellungsbeispiel

#### Schritte zur Erstellung des Befehls „Pure Function Refactoring“

| Vorgang                         | Befehl/Code                                   |
| --------------------------------- | --------------------------------------------- |
| 1. Verzeichnisstruktur erstellen  | `mkdir -p ~/.qwen/commands/refactor`          |
| 2. Befehlsdatei erstellen         | `touch ~/.qwen/commands/refactor/pure.md`     |
| 3. Befehlsinhalt bearbeiten       | Siehe vollständiger Code unten.               |
| 4. Befehl testen                  | `@file.js` → `/refactor:pure`                 |

```markdown
---
description: Refaktoriert Code in eine reine Funktion
---

Analysieren Sie den Code im aktuellen Kontext und refaktorisieren Sie ihn zu einer reinen Funktion.  
Anforderungen:

1. Geben Sie den refaktorisierten Code an.  
2. Erläutern Sie die wesentlichen Änderungen sowie die Umsetzung der Merkmale einer reinen Funktion.  
3. Behalten Sie die Funktionalität der ursprünglichen Funktion bei.
```

### Zusammenfassung bewährter Methoden für benutzerdefinierte Befehle

#### Empfehlungen für das Command-Design – Tabelle

| Praxisaspekte         | Empfohlener Ansatz                  | Vermeiden                                   |
| --------------------- | ----------------------------------- | ------------------------------------------- |
| Benennung von Commands | Namespaces zur Strukturierung nutzen | Übermäßig generische Namen verwenden       |
| Parameterverarbeitung | `{{args}}` explizit verwenden       | Auf die Standard-Anhängung vertrauen (leicht zu verwechseln) |
| Fehlerbehandlung      | Shell-Fehlerausgabe nutzen          | Ausführungsfehler ignorieren                |
| Dateiorganisation     | Nach Funktion in Verzeichnissen organisieren | Alle Commands im Stammverzeichnis ablegen   |
| Beschreibungsfeld     | Stets eine klare Beschreibung angeben | Auf automatisch generierte Beschreibungen vertrauen |

#### Sicherheitsfunktionen – Übersichtstabelle

| Sicherheitsmechanismus     | Schutzwirkung                   | Benutzeraktion             |
| -------------------------- | --------------------------------- | ---------------------------- |
| Shell-Escaping             | Verhindert Command-Injection      | Automatische Verarbeitung    |
| Ausführungsbestätigung     | Vermeidet versehentliche Ausführung | Dialog zur Bestätigung       |
| Fehlerberichterstattung    | Hilft bei der Diagnose von Problemen | Anzeigen der Fehlerinformationen |