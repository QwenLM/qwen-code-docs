# Häufige Workflows

> Erfahren Sie mehr über häufige Workflows mit Qwen Code.

Jede Aufgabe in diesem Dokument enthält klare Anweisungen, Beispielbefehle und Best Practices, um Qwen Code optimal zu nutzen.

## Neue Codebasen verstehen

### Schnellen Überblick über die Codebasis erhalten

Angenommen, Sie sind gerade einem neuen Projekt beigetreten und möchten dessen Struktur schnell verstehen.

**1. Navigieren Sie zum Stammverzeichnis des Projekts**

```bash
cd /path/to/project
```

**2. Starten Sie Qwen Code**

```bash
qwen
```

**3. Fragen Sie nach einer allgemeinen Übersicht**

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
> - Beginnen Sie mit allgemeinen Fragen und grenzen Sie dann auf spezifische Bereiche ein
> - Fragen Sie nach Codierungskonventionen und verwendeten Mustern im Projekt
> - Fordern Sie ein Glossar projektspezifischer Begriffe an

### Relevanten Code finden

Angenommen, Sie müssen Code zu einer bestimmten Funktion oder Funktionalität lokalisieren.

**1. Bitten Sie Qwen Code, relevante Dateien zu finden**

```
find the files that handle user authentication
```

**2. Holen Sie sich Kontext, wie Komponenten interagieren**

```
how do these authentication files work together?
```

**3. Verstehen Sie den Ausführungsablauf**

```
trace the login process from front-end to database
```

> [!tip]
>
> - Seien Sie spezifisch, wonach Sie suchen
> - Verwenden Sie die domänenspezifische Sprache des Projekts

## Fehler effizient beheben

Angenommen, Sie haben eine Fehlermeldung erhalten und müssen die Quelle finden und beheben.

**1. Teilen Sie den Fehler Qwen Code mit**

```
I'm seeing an error when I run npm test
```

**2. Bitten Sie um Lösungsvorschläge**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. Wenden Sie die Lösung an**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - Teilen Sie Qwen Code den Befehl mit, um das Problem zu reproduzieren und einen Stacktrace zu erhalten
> - Erwähnen Sie alle Schritte zur Reproduktion des Fehlers
> - Lassen Sie Qwen Code wissen, ob der Fehler sporadisch oder konsistent auftritt

## Code umstrukturieren

Angenommen, Sie müssen alten Code aktualisieren, um moderne Muster und Praktiken zu verwenden.

**1. Identifizieren Sie Legacy-Code für die Umstrukturierung**

```
find deprecated API usage in our codebase
```

**2. Holen Sie sich Empfehlungen zur Umstrukturierung**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. Wenden Sie die Änderungen sicher an**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. Überprüfen Sie die Umstrukturierung**

```
run tests for the refactored code
```

> [!tip]
>
> - Bitten Sie Qwen Code, die Vorteile des modernen Ansatzes zu erklären
> - Fordern Sie an, dass Änderungen bei Bedarf abwärtskompatibel bleiben
> - Führen Sie die Umstrukturierung in kleinen, testbaren Schritten durch

## Spezialisierte Subagenten verwenden

Angenommen, Sie möchten spezialisierte KI-Subagenten einsetzen, um bestimmte Aufgaben effektiver zu erledigen.

**1. Verfügbare Subagenten anzeigen**

```
/agents
```

Dies zeigt alle verfügbaren Subagenten an und ermöglicht das Erstellen neuer.

**2. Subagenten automatisch verwenden**

Qwen Code delegiert passende Aufgaben automatisch an spezialisierte Subagenten:

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. Explizit bestimmte Subagenten anfordern**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. Benutzerdefinierte Subagenten für Ihren Workflow erstellen**

```
/agents
```

Wählen Sie dann „create" und folgen Sie den Anweisungen, um Folgendes zu definieren:

- Eine eindeutige Kennung, die den Zweck des Subagenten beschreibt (z. B. `code-reviewer`, `api-designer`).
- Wann Qwen Code diesen Agenten verwenden soll
- Auf welche Tools er Zugriff hat
- Einen System-Prompt, der die Rolle und das Verhalten des Agenten beschreibt

> [!tip]
>
> - Erstellen Sie projektspezifische Subagenten in `.qwen/agents/` zur Freigabe im Team
> - Verwenden Sie aussagekräftige `description`-Felder, um die automatische Delegierung zu ermöglichen
> - Beschränken Sie den Tool-Zugriff auf das, was jeder Subagent tatsächlich benötigt
> - Erfahren Sie mehr über [Sub Agents](./features/sub-agents)
> - Erfahren Sie mehr über [Approval Mode](./features/approval-mode)

## Mit Tests arbeiten

Angenommen, Sie müssen Tests für nicht abgedeckten Code hinzufügen.

**1. Nicht getesteten Code identifizieren**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. Testgerüst generieren**

```
add tests for the notification service
```

**3. Sinnvolle Testfälle hinzufügen**

```
add test cases for edge conditions in the notification service
```

**4. Tests ausführen und überprüfen**

```
run the new tests and fix any failures
```

Qwen Code kann Tests generieren, die den vorhandenen Mustern und Konventionen Ihres Projekts folgen. Wenn Sie Tests anfordern, geben Sie genau an, welches Verhalten Sie überprüfen möchten. Qwen Code untersucht Ihre vorhandenen Testdateien, um den Stil, die Frameworks und die Assertions-Muster anzupassen, die bereits verwendet werden.

Für eine umfassende Abdeckung bitten Sie Qwen Code, Grenzfälle zu identifizieren, die Sie möglicherweise übersehen haben. Qwen Code kann Ihre Codepfade analysieren und Tests für Fehlerbedingungen, Grenzwerte und unerwartete Eingaben vorschlagen, die leicht übersehen werden.

## Pull Requests erstellen

Angenommen, Sie müssen einen gut dokumentierten Pull Request für Ihre Änderungen erstellen.

**1. Fassen Sie Ihre Änderungen zusammen**

```
summarize the changes I've made to the authentication module
```

**2. Pull Request mit Qwen Code generieren**

```
create a pr
```

**3. Überprüfen und verfeinern**

```
enhance the PR description with more context about the security improvements
```

**4. Testdetails hinzufügen**

```
add information about how these changes were tested
```

> [!tip]
>
> - Bitten Sie Qwen Code direkt, einen PR für Sie zu erstellen
> - Überprüfen Sie den von Qwen Code generierten PR vor dem Absenden
> - Bitten Sie Qwen Code, potenzielle Risiken oder Überlegungen hervorzuheben

## Dokumentation verwalten

Angenommen, Sie müssen Dokumentation für Ihren Code hinzufügen oder aktualisieren.

**1. Nicht dokumentierten Code identifizieren**

```
find functions without proper JSDoc comments in the auth module
```

**2. Dokumentation generieren**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. Überprüfen und verbessern**

```
improve the generated documentation with more context and examples
```

**4. Dokumentation überprüfen**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - Geben Sie den gewünschten Dokumentationsstil an (JSDoc, Docstrings usw.)
> - Bitten Sie um Beispiele in der Dokumentation
> - Fordern Sie Dokumentation für öffentliche APIs, Schnittstellen und komplexe Logik an

## Dateien und Verzeichnisse referenzieren

Verwenden Sie `@`, um schnell Dateien oder Verzeichnisse einzubeziehen, ohne darauf zu warten, dass Qwen Code sie liest.

**1. Einzelne Datei referenzieren**

```
Explain the logic in @src/utils/auth.js
```

Dadurch wird der vollständige Inhalt der Datei in die Unterhaltung aufgenommen.

**2. Verzeichnis referenzieren**

```
What's the structure of @src/components?
```

Dies liefert eine Verzeichnisauflistung mit Dateiinformationen.

**3. MCP-Ressourcen referenzieren**

```
Show me the data from @github: repos/owner/repo/issues
```

Dies ruft Daten von verbundenen MCP-Servern im Format @server: resource ab. Siehe [MCP](./features/mcp) für Details.

> [!tip]
>
> - Dateipfade können relativ oder absolut sein
> - @-Dateiverweise fügen `QWEN.md` im Verzeichnis der Datei und in übergeordneten Verzeichnissen zum Kontext hinzu
> - Verzeichnisverweise zeigen Dateilisten, nicht Inhalte an
> - Sie können mehrere Dateien in einer einzelnen Nachricht referenzieren (z. B. „`@file 1.js` und `@file 2.js`")

## Vorherige Unterhaltungen fortsetzen

Angenommen, Sie haben an einer Aufgabe mit Qwen Code gearbeitet und müssen in einer späteren Sitzung dort weitermachen, wo Sie aufgehört haben.

Qwen Code bietet zwei Optionen zum Fortsetzen vorheriger Unterhaltungen:

- `--continue`, um die letzte Unterhaltung automatisch fortzusetzen
- `--resume`, um einen Unterhaltungsauswahl anzuzeigen

**1. Die letzte Unterhaltung fortsetzen**

```bash
qwen --continue
```

Dadurch wird Ihre letzte Unterhaltung sofort ohne Rückfragen fortgesetzt.

**2. Im nicht-interaktiven Modus fortsetzen**

```bash
qwen --continue -p "Continue with my task"
```

Verwenden Sie `-p` (oder `--prompt`) mit `--continue`, um die letzte Unterhaltung im nicht-interaktiven Modus fortzusetzen – ideal für Skripte oder Automatisierungen.

**3. Unterhaltungsauswahl anzeigen**

```bash
qwen --resume
```

Dies zeigt einen interaktiven Unterhaltungsauswähler mit einer übersichtlichen Listenansicht, die Folgendes anzeigt:

- Sitzungszusammenfassung (oder initialer Prompt)
- Metadaten: vergangene Zeit, Nachrichtenanzahl und Git-Branch

Navigieren Sie mit den Pfeiltasten und drücken Sie die Eingabetaste, um eine Unterhaltung auszuwählen. Drücken Sie Esc, um zu beenden.

> [!tip]
>
> - Der Unterhaltungsverlauf wird lokal auf Ihrem Rechner gespeichert
> - Verwenden Sie `--continue` für schnellen Zugriff auf Ihre letzte Unterhaltung
> - Verwenden Sie `--resume`, wenn Sie eine bestimmte frühere Unterhaltung auswählen müssen
> - Beim Fortsetzen sehen Sie den gesamten Unterhaltungsverlauf, bevor Sie weitermachen
> - Die fortgesetzte Unterhaltung beginnt mit demselben Modell und derselben Konfiguration wie die ursprüngliche
>
> **So funktioniert es**:
>
> 1. **Speicherung der Unterhaltung**: Alle Unterhaltungen werden automatisch lokal mit ihrem vollständigen Nachrichtenverlauf gespeichert
> 2. **Nachrichtendeserialisierung**: Beim Fortsetzen wird der gesamte Nachrichtenverlauf wiederhergestellt, um den Kontext zu erhalten
> 3. **Tool-Zustand**: Die Tool-Nutzung und -Ergebnisse der vorherigen Unterhaltung bleiben erhalten
> 4. **Kontextwiederherstellung**: Die Unterhaltung wird mit dem gesamten vorherigen Kontext fortgesetzt
>
> **Beispiele**:
>
> ```bash
> # Letzte Unterhaltung fortsetzen
> qwen --continue
>
> # Letzte Unterhaltung mit einem bestimmten Prompt fortsetzen
> qwen --continue -p "Show me our progress"
>
> # Unterhaltungsauswahl anzeigen
> qwen --resume
>
> # Letzte Unterhaltung im nicht-interaktiven Modus fortsetzen
> qwen --continue -p "Run the tests again"
> ```

## Parallele Qwen Code-Sitzungen mit Git Worktrees ausführen

Angenommen, Sie müssen gleichzeitig an mehreren Aufgaben arbeiten, mit vollständiger Code-Isolation zwischen den Qwen Code-Instanzen.

**1. Git Worktrees verstehen**

Git Worktrees ermöglichen es Ihnen, mehrere Branches desselben Repositorys in separate Verzeichnisse auszuchecken. Jeder Worktree hat sein eigenes Arbeitsverzeichnis mit isolierten Dateien, während die Git-Historie gemeinsam genutzt wird. Erfahren Sie mehr in der [offiziellen Git Worktree-Dokumentation](https://git-scm.com/docs/git-worktree).

**2. Einen neuen Worktree erstellen**

```bash
# Neuen Worktree mit einem neuen Branch erstellen
git worktree add ../project-feature-a -b feature-a

# Oder Worktree mit einem vorhandenen Branch erstellen
git worktree add ../project-bugfix bugfix-123
```

Dies erstellt ein neues Verzeichnis mit einer separaten Arbeitskopie Ihres Repositorys.

**3. Qwen Code in jedem Worktree ausführen**

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

# Worktree entfernen, wenn fertig
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Jeder Worktree hat seinen eigenen unabhängigen Dateizustand, perfekt für parallele Qwen Code-Sitzungen
> - Änderungen in einem Worktree wirken sich nicht auf andere aus und verhindern, dass sich Qwen Code-Instanzen gegenseitig stören
> - Alle Worktrees teilen sich die gleiche Git-Historie und Remote-Verbindungen
> - Für langlebige Aufgaben können Sie Qwen Code in einem Worktree arbeiten lassen, während Sie in einem anderen entwickeln
> - Verwenden Sie aussagekräftige Verzeichnisnamen, um leicht zu identifizieren, für welche Aufgabe jeder Worktree bestimmt ist
> - Denken Sie daran, Ihre Entwicklungsumgebung in jedem neuen Worktree gemäß der Einrichtung Ihres Projekts zu initialisieren. Abhängig von Ihrem Stack kann dies Folgendes umfassen:
>   - JavaScript-Projekte: Abhängigkeiten installieren (`npm install`, `yarn`)
>   - Python-Projekte: Virtuelle Umgebungen einrichten oder mit Paketmanagern installieren
>   - Andere Sprachen: Dem standardmäßigen Einrichtungsprozess Ihres Projekts folgen

## Qwen Code als Unix-artiges Dienstprogramm verwenden

### Qwen Code in Ihren Überprüfungsprozess einbinden

Angenommen, Sie möchten Qwen Code als Linter oder Code-Reviewer verwenden.

**Qwen Code zu Ihrem Build-Skript hinzufügen:**

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
> - Passen Sie den Prompt an, um nach bestimmten für Ihr Projekt relevanten Problemen zu suchen
> - Erwägen Sie, mehrere Skripte für verschiedene Arten der Überprüfung zu erstellen

### Ein- und Ausgabe per Pipe

Angenommen, Sie möchten Daten in Qwen Code einlesen und strukturierte Daten zurückerhalten.

**Daten durch Qwen Code pingen:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Verwenden Sie Pipes, um Qwen Code in vorhandene Shell-Skripte zu integrieren
> - Kombinieren Sie mit anderen Unix-Tools für leistungsstarke Workflows
> - Erwägen Sie die Verwendung von --output-format für strukturierte Ausgaben

### Ausgabeformat steuern

Angenommen, Sie benötigen die Ausgabe von Qwen Code in einem bestimmten Format, insbesondere wenn Sie Qwen Code in Skripte oder andere Tools integrieren.

**1. Textformat (Standard) verwenden**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Dies gibt nur die reine Textantwort von Qwen Code aus (Standardverhalten).

**2. JSON-Format verwenden**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Dies gibt ein JSON-Array von Nachrichten mit Metadaten wie Kosten und Dauer aus.

**3. Streaming-JSON-Format verwenden**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Dies gibt eine Reihe von JSON-Objekten in Echtzeit aus, während Qwen Code die Anfrage verarbeitet. Jede Nachricht ist ein gültiges JSON-Objekt, aber die gesamte Ausgabe ist bei Verkettung kein gültiges JSON.

> [!tip]
>
> - Verwenden Sie `--output-format text` für einfache Integrationen, bei denen Sie nur die Antwort von Qwen Code benötigen
> - Verwenden Sie `--output-format json`, wenn Sie das vollständige Unterhaltungsprotokoll benötigen
> - Verwenden Sie `--output-format stream-json` für Echtzeitausgabe jedes Unterhaltungsschrittes

## Qwen Code nach seinen Fähigkeiten fragen

Qwen Code hat integrierten Zugriff auf seine Dokumentation und kann Fragen zu seinen eigenen Funktionen und Einschränkungen beantworten.

### Beispiel-Fragen

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> Qwen Code liefert dokumentationsbasierte Antworten auf diese Fragen. Ausführbare Beispiele und praktische Demonstrationen finden Sie in den entsprechenden Workflow-Abschnitten oben.

> [!tip]
>
> - Qwen Code hat immer Zugriff auf die neueste Qwen Code-Dokumentation, unabhängig von der von Ihnen verwendeten Version
> - Stellen Sie spezifische Fragen, um detaillierte Antworten zu erhalten
> - Qwen Code kann komplexe Funktionen wie MCP-Integration, Enterprise-Konfigurationen und erweiterte Workflows erklären