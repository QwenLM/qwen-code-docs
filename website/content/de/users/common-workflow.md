# Gängige Workflows

> Erfahren Sie mehr über gängige Workflows mit Qwen Code.

Jede Aufgabe in diesem Dokument enthält klare Anweisungen, Beispielbefehle und Best Practices, um Ihnen zu helfen, das Beste aus Qwen Code herauszuholen.

## Neue Codebasen verstehen

### Schneller Überblick über die Codebasis erhalten

Angenommen, Sie sind einem neuen Projekt beigetreten und müssen sich schnell mit dessen Struktur vertraut machen.

**1. Navigieren Sie zum Stammverzeichnis des Projekts**

```bash
cd /path/to/project
```

**2. Starten Sie Qwen Code**

```bash
qwen
```

**3. Fragen Sie nach einer Übersicht auf hoher Ebene**

```
give me an overview of this codebase
```

**4. Tauchen Sie tiefer in spezifische Komponenten ein**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - Beginnen Sie mit allgemeinen Fragen und grenzen Sie diese dann auf spezifische Bereiche ein
> - Fragen Sie nach den im Projekt verwendeten Codierungsrichtlinien und Mustern
> - Bitten Sie um ein Glossar der projektspezifischen Begriffe

### Relevanten Code finden

Angenommen, du musst Code zu einer bestimmten Funktion oder Funktionalität lokalisieren.

**1. Frage Qwen Code, relevante Dateien zu finden**

```
finde die Dateien, die die Benutzerauthentifizierung behandeln
```

**2. Kontext darüber erhalten, wie Komponenten zusammenarbeiten**

```
wie arbeiten diese Authentifizierungsdateien zusammen?
```

**3. Den Ausführungsfluss verstehen**

```
verfolge den Anmeldevorgang vom Frontend bis zur Datenbank
```

> [!tip]
>
> - Sei spezifisch, was du suchst
> - Verwende die Domänensprache des Projekts

## Fehler effizient beheben

Angenommen, Sie sind auf eine Fehlermeldung gestoßen und müssen deren Ursache finden und beheben.

**1. Teilen Sie den Fehler mit Qwen Code**

```
Ich erhalte einen Fehler, wenn ich npm test ausführe
```

**2. Bitten Sie um Vorschläge zur Behebung**

```
schlage ein paar Möglichkeiten vor, um das @ts-ignore in user.ts zu beheben
```

**3. Wenden Sie die Korrektur an**

```
aktualisiere user.ts, um die von dir vorgeschlagene Null-Prüfung hinzuzufügen
```

> [!tip]
>
> - Teilen Sie Qwen Code den Befehl mit, um das Problem zu reproduzieren und eine Stack-Trace zu erhalten
> - Erwähnen Sie alle Schritte zur Reproduktion des Fehlers
> - Informieren Sie Qwen Code, ob der Fehler sporadisch oder konstant auftritt

## Code refactoren

Angenommen, du musst alten Code aktualisieren, um moderne Muster und Praktiken zu verwenden.

**1. Legacy-Code für das Refactoring identifizieren**

```
veraltete API-Nutzung in unserer Codebasis finden
```

**2. Refactoring-Empfehlungen einholen**

```
vorschlagen, wie utils.js refactored werden kann, um moderne JavaScript-Funktionen zu nutzen
```

**3. Die Änderungen sicher anwenden**

```
utils.js refactoren, um ES2024-Funktionen zu nutzen, während das gleiche Verhalten beibehalten wird
```

**4. Das Refactoring verifizieren**

```
Tests für den refactored Code ausführen
```

> [!tip]
>
> - Qwen Code bitten, die Vorteile des modernen Ansatzes zu erklären
> - Anfragen, dass Änderungen bei Bedarf die Abwärtskompatibilität beibehalten
> - Refactoring in kleinen, testbaren Schritten durchführen

## Spezialisierte Sub-Agenten verwenden

Angenommen, Sie möchten spezialisierte KI-Sub-Agenten nutzen, um bestimmte Aufgaben effektiver zu bearbeiten.

**1. Verfügbare Sub-Agenten anzeigen**

```
/agents
```

Dies zeigt alle verfügbaren Sub-Agenten an und ermöglicht das Erstellen neuer.

**2. Sub-Agenten automatisch verwenden**

Qwen Code delegiert automatisch geeignete Aufgaben an spezialisierte Sub-Agenten:

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. Explizit bestimmte Sub-Agenten anfordern**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. Benutzerdefinierte Sub-Agenten für Ihren Workflow erstellen**

```
/agents
```

Wählen Sie dann „create“ und folgen Sie den Anweisungen, um Folgendes festzulegen:

- Eine eindeutige Kennung, die den Zweck des Sub-Agenten beschreibt (z. B. `code-reviewer`, `api-designer`).
- Wann Qwen Code diesen Agenten verwenden soll
- Welche Tools er zugreifen kann
- Ein System-Prompt, der die Rolle und das Verhalten des Agenten beschreibt

> [!tip]
>
> - Erstellen Sie projektspezifische Sub-Agenten in `.qwen/agents/` für die gemeinsame Nutzung im Team
> - Verwenden Sie aussagekräftige `description`-Felder, um die automatische Delegation zu aktivieren
> - Beschränken Sie den Tool-Zugriff auf das, was jeder Sub-Agent tatsächlich benötigt
> - Erfahren Sie mehr über [Sub-Agenten](../users/features/sub-agents)
> - Erfahren Sie mehr über den [Genehmigungsmodus](../users/features/approval-mode)

## Mit Tests arbeiten

Angenommen, du musst Tests für nicht abgedeckten Code hinzufügen.

**1. Nicht getesteten Code identifizieren**

```
finde Funktionen in NotificationsService.swift, die nicht durch Tests abgedeckt sind
```

**2. Testgerüst generieren**

```
füge Tests für den Benachrichtigungsdienst hinzu
```

**3. Aussagekräftige Testfälle hinzufügen**

```
füge Testfälle für Randbedingungen im Benachrichtigungsdienst hinzu
```

**4. Tests ausführen und überprüfen**

```
führe die neuen Tests aus und behebe alle Fehler
```

Qwen Code kann Tests generieren, die den bestehenden Mustern und Konventionen deines Projekts folgen. Sei beim Anfordern von Tests konkret bezüglich des Verhaltens, das du überprüfen möchtest. Qwen Code untersucht deine vorhandenen Testdateien, um den Stil, die Frameworks und die Assertion-Muster zu erkennen, die bereits verwendet werden.

Für eine umfassende Abdeckung kannst du Qwen Code bitten, Randfälle zu identifizieren, die dir möglicherweise entgangen sind. Qwen Code kann deine Codepfade analysieren und Tests für Fehlerbedingungen, Grenzwerte und unerwartete Eingaben vorschlagen, die leicht übersehen werden können.

## Pull Requests erstellen

Angenommen, Sie müssen einen gut dokumentierten Pull Request für Ihre Änderungen erstellen.

**1. Fassen Sie Ihre Änderungen zusammen**

```
fasse die Änderungen zusammen, die ich am Authentifizierungsmodul vorgenommen habe
```

**2. Erstellen Sie einen Pull Request mit Qwen Code**

```
erstelle einen PR
```

**3. Überprüfen und verfeinern**

```
verbessere die PR-Beschreibung mit weiterem Kontext zu den Sicherheitsverbesserungen
```

**4. Testdetails hinzufügen**

```
füge Informationen darüber hinzu, wie diese Änderungen getestet wurden
```

> [!tip]
>
> - Bitten Sie Qwen Code direkt, einen PR für Sie zu erstellen
> - Überprüfen Sie den von Qwen Code generierten PR vor dem Einreichen
> - Bitten Sie Qwen Code, potenzielle Risiken oder Überlegungen hervorzuheben

## Dokumentation bearbeiten

Angenommen, du musst die Dokumentation für deinen Code hinzufügen oder aktualisieren.

**1. Nicht dokumentierten Code identifizieren**

```
finde Funktionen ohne ordnungsgemäße JSDoc-Kommentare im Auth-Modul
```

**2. Dokumentation generieren**

```
füge JSDoc-Kommentare zu den nicht dokumentierten Funktionen in auth.js hinzu
```

**3. Überprüfen und verbessern**

```
verbessere die generierte Dokumentation mit mehr Kontext und Beispielen
```

**4. Dokumentation verifizieren**

```
prüfe, ob die Dokumentation unseren Projektstandards entspricht
```

> [!tip]
>
> - Gib den gewünschten Dokumentationsstil an (JSDoc, docstrings usw.)
> - Bitte um Beispiele in der Dokumentation
> - Fordere Dokumentation für öffentliche APIs, Schnittstellen und komplexe Logik an

## Referenzdateien und -verzeichnisse

Verwenden Sie `@`, um schnell Dateien oder Verzeichnisse einzubeziehen, ohne auf das Lesen durch Qwen Code warten zu müssen.

**1. Eine einzelne Datei referenzieren**

```
Erkläre die Logik in @src/utils/auth.js
```

Dies fügt den vollständigen Inhalt der Datei in die Konversation ein.

**2. Ein Verzeichnis referenzieren**

```
Wie sieht die Struktur von @src/components aus?
```

Dies liefert eine Verzeichnisliste mit Dateiinformationen.

**3. MCP-Ressourcen referenzieren**

```
Zeige mir die Daten von @github: repos/owner/repo/issues
```

Dies ruft Daten von verbundenen MCP-Servern im Format @server: Ressource ab. Weitere Informationen finden Sie unter [MCP](../users/features/mcp).

> [!tip]
>
> - Dateipfade können relativ oder absolut sein
> - @-Dateireferenzen fügen `QWEN.md` im Verzeichnis der Datei und den übergeordneten Verzeichnissen zum Kontext hinzu
> - Verzeichnisreferenzen zeigen Dateilisten, nicht deren Inhalte
> - Sie können mehrere Dateien in einer einzigen Nachricht referenzieren (z. B. "`@file 1.js` und `@file 2.js`")

## Vorherige Gespräche fortsetzen

Angenommen, du hast bereits an einer Aufgabe mit Qwen Code gearbeitet und möchtest zu einem späteren Zeitpunkt dort weitermachen, wo du aufgehört hast.

Qwen Code bietet zwei Optionen, um vorherige Gespräche fortzusetzen:

- `--continue`, um automatisch das letzte Gespräch fortzusetzen
- `--resume`, um eine Auswahl der Gespräche anzuzeigen

**1. Das letzte Gespräch fortsetzen**

```bash
qwen --continue
```

Dies setzt unmittelbar dein zuletzt geführtes Gespräch ohne weitere Eingaben fort.

**2. Im nicht-interaktiven Modus fortfahren**

```bash
qwen --continue --p "Continue with my task"
```

Verwende `--print` zusammen mit `--continue`, um das letzte Gespräch im nicht-interaktiven Modus fortzusetzen – ideal für Skripte oder Automatisierungen.

**3. Gesprächsauswahl anzeigen**

```bash
qwen --resume
```

Dies zeigt eine interaktive Liste vergangener Gespräche mit folgenden Informationen an:

- Zusammenfassung der Sitzung (oder erste Eingabeaufforderung)
- Metadaten: verstrichene Zeit, Anzahl der Nachrichten und Git-Branch

Navigiere mithilfe der Pfeiltasten und drücke die Eingabetaste, um ein Gespräch auszuwählen. Drücke Escape, um den Vorgang abzubrechen.

> [!tip]
>
> - Der Gesprächsverlauf wird lokal auf deinem Gerät gespeichert
> - Verwende `--continue`, um schnell auf das letzte Gespräch zuzugreifen
> - Nutze `--resume`, wenn du ein bestimmtes früheres Gespräch auswählen willst
> - Beim Fortsetzen siehst du den vollständigen bisherigen Verlauf des Gesprächs
> - Das fortgesetzte Gespräch beginnt mit dem gleichen Modell und der gleichen Konfiguration wie das ursprüngliche Gespräch
>
> **So funktioniert es**:
>
> 1. **Speicherung von Gesprächen**: Alle Gespräche werden automatisch lokal mit vollständigem Nachrichtenverlauf gespeichert
> 2. **Wiederherstellung von Nachrichten**: Beim Fortsetzen wird der gesamte Nachrichtenverlauf wiederhergestellt, um den Kontext zu bewahren
> 3. **Zustand von Tools**: Die Nutzung und Ergebnisse von Tools aus dem vorherigen Gespräch bleiben erhalten
> 4. **Kontextwiederherstellung**: Das Gespräch wird mit allen vorherigen Kontextinformationen fortgesetzt
>
> **Beispiele**:
>
> ```bash
> # Letztes Gespräch fortsetzen
> qwen --continue
>
> # Letztes Gespräch mit spezifischer Aufforderung fortsetzen
> qwen --continue --p "Show me our progress"
>
> # Gesprächsauswahl anzeigen
> qwen --resume
>
> # Letztes Gespräch im nicht-interaktiven Modus fortsetzen
> qwen --continue --p "Run the tests again"
> ```

## Parallele Qwen Code-Sitzungen mit Git-Worktrees ausführen

Angenommen, Sie müssen gleichzeitig an mehreren Aufgaben arbeiten und dabei eine vollständige Code-Isolation zwischen den Qwen Code-Instanzen gewährleisten.

**1. Verstehen Sie Git-Worktrees**

Git-Worktrees ermöglichen es Ihnen, mehrere Branches aus demselben Repository in separaten Verzeichnissen auszuchecken. Jeder Worktree verfügt über sein eigenes Arbeitsverzeichnis mit isolierten Dateien, teilt sich jedoch dieselbe Git-Historie. Erfahren Sie mehr in der [offiziellen Git-Worktree-Dokumentation](https://git-scm.com/docs/git-worktree).

**2. Erstellen Sie einen neuen Worktree**

```bash

# Erstellen Sie einen neuen Worktree mit einem neuen Branch
git worktree add ../project-feature-a -b feature-a

# Oder erstellen Sie einen Worktree mit einem bestehenden Branch
git worktree add ../project-bugfix bugfix-123
```

Dadurch wird ein neues Verzeichnis mit einer separaten Arbeitskopie Ihres Repositories erstellt.

**3. Führen Sie Qwen Code in jedem Worktree aus**

```bash

# Navigieren Sie zu Ihrem Worktree
cd ../project-feature-a

# Qwen Code in dieser isolierten Umgebung ausführen
qwen
```

**4. Qwen Code in einem anderen Worktree ausführen**

```bash
cd ../project-bugfix
qwen
```

**5. Ihre Worktrees verwalten**

```bash

# Alle Worktrees auflisten
git worktree list

```markdown
# Entferne einen Worktree nach Abschluss der Arbeit
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Jeder Worktree hat seinen eigenen unabhängigen Dateizustand, was ihn perfekt für parallele Qwen Code-Sitzungen macht
> - Änderungen in einem Worktree beeinflussen andere nicht, wodurch Qwen Code-Instanzen sich nicht gegenseitig stören
> - Alle Worktrees teilen sich denselben Git-Verlauf und dieselben Remote-Verbindungen
> - Für lang laufende Aufgaben kannst du Qwen Code in einem Worktree arbeiten lassen, während du die Entwicklung in einem anderen fortsetzt
> - Verwende beschreibende Verzeichnisnamen, um leicht zu erkennen, wofür jeder Worktree gedacht ist
> - Denke daran, deine Entwicklungsumgebung in jedem neuen Worktree entsprechend dem Setup deines Projekts zu initialisieren. Abhängig von deinem Stack kann dies Folgendes beinhalten:
>   - JavaScript-Projekte: Ausführen der Abhängigkeitsinstallation (`npm install`, `yarn`)
>   - Python-Projekte: Einrichten von virtuellen Umgebungen oder Installation mit Paketmanagern
>   - Andere Sprachen: Befolgen des Standard-Setup-Prozesses deines Projekts
```

## Qwen Code als Unix-ähnliches Dienstprogramm verwenden

### Qwen Code in Ihren Verifizierungsprozess integrieren

Angenommen, Sie möchten Qwen Code als Linter oder Code-Reviewer verwenden.

**Fügen Sie Qwen Code Ihrem Build-Skript hinzu:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - Verwenden Sie Qwen Code für automatisierte Code-Reviews in Ihrer CI/CD-Pipeline
> - Passen Sie den Prompt an, um spezifische Probleme zu prüfen, die für Ihr Projekt relevant sind
> - Erwägen Sie das Erstellen mehrerer Skripte für verschiedene Arten der Verifizierung

### Pipe rein, Pipe raus

Angenommen, Sie möchten Daten in Qwen Code einlesen und strukturierte Daten zurück erhalten.

**Daten durch Qwen Code leiten:**

```bash
cat build-error.txt | qwen -p 'erkläre knapp die Hauptursache dieses Build-Fehlers' > output.txt
```

> [!tip]
>
> - Verwenden Sie Pipes, um Qwen-Code in bestehende Shell-Skripte zu integrieren
> - Kombinieren Sie es mit anderen Unix-Tools für leistungsstarke Workflows
> - Erwägen Sie die Verwendung von --output-format für strukturierte Ausgaben

### Ausgabeformat steuern

Angenommen, du benötigst die Ausgabe von Qwen Code in einem bestimmten Format, insbesondere wenn du Qwen Code in Skripte oder andere Tools integrierst.

**1. Textformat verwenden (Standard)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Dies gibt nur die Klartext-Antwort von Qwen Code aus (Standardverhalten).

**2. JSON-Format verwenden**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Dies gibt ein JSON-Array mit Nachrichten und Metadaten wie Kosten und Dauer aus.

**3. Streaming-JSON-Format verwenden**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Dies gibt eine Reihe von JSON-Objekten in Echtzeit aus, während Qwen Code die Anfrage verarbeitet. Jede Nachricht ist ein gültiges JSON-Objekt, aber die gesamte Ausgabe ist nicht gültig, wenn sie verkettet wird.

> [!tip]
>
> - Verwende `--output-format text` für einfache Integrationen, bei denen du nur die Antwort von Qwen Code benötigst
> - Verwende `--output-format json`, wenn du das vollständige Konversationsprotokoll benötigst
> - Verwende `--output-format stream-json` für die Echtzeitausgabe jedes Konversationsschritts

## Qwen Code nach seinen Fähigkeiten fragen

Qwen Code hat integrierten Zugriff auf seine Dokumentation und kann Fragen zu seinen eigenen Funktionen und Einschränkungen beantworten.

### Beispiel-Fragen

```
Kann Qwen Code Pull Requests erstellen?
```

```
Wie geht Qwen Code mit Berechtigungen um?
```

```
Welche Slash-Befehle sind verfügbar?
```

```
Wie verwende ich MCP mit Qwen Code?
```

```
Wie konfiguriere ich Qwen Code für Amazon Bedrock?
```

```
Was sind die Einschränkungen von Qwen Code?
```

> [!note]
>
> Qwen Code liefert dokumentationsbasierte Antworten auf diese Fragen. Für ausführbare Beispiele und praktische Demonstrationen siehe die entsprechenden Workflow-Abschnitte oben.

> [!tip]
>
> - Qwen Code hat immer Zugriff auf die neueste Qwen Code-Dokumentation, unabhängig von der Version, die du verwendest
> - Stelle spezifische Fragen, um detaillierte Antworten zu erhalten
> - Qwen Code kann komplexe Funktionen wie MCP-Integration, Unternehmenskonfigurationen und erweiterte Workflows erklären