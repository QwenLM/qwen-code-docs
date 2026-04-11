# Häufige Workflows

> Erfahre mehr über häufige Workflows mit Qwen Code.

Jede Aufgabe in diesem Dokument enthält klare Anweisungen, Beispielbefehle und Best Practices, damit du das Maximum aus Qwen Code herausholen kannst.

## Neue Codebases verstehen

### Schnellen Überblick über eine Codebase erhalten

Angenommen, du bist gerade einem neuen Projekt beigetreten und musst dessen Struktur schnell verstehen.

**1. Zum Projektstammverzeichnis navigieren**

```bash
cd /path/to/project
```

**2. Qwen Code starten**

```bash
qwen
```

**3. Nach einem Überblick auf hoher Ebene fragen**

```
give me an overview of this codebase
```

**4. Tiefer in bestimmte Komponenten eintauchen**

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
> - Beginne mit allgemeinen Fragen und grenze dann auf bestimmte Bereiche ein
> - Frage nach den im Projekt verwendeten Coding-Konventionen und Patterns
> - Bitte um ein Glossar projektspezifischer Begriffe

### Relevanten Code finden

Angenommen, du musst Code finden, der sich auf ein bestimmtes Feature oder eine bestimmte Funktionalität bezieht.

**1. Qwen Code bitten, relevante Dateien zu finden**

```
find the files that handle user authentication
```

**2. Kontext dazu erhalten, wie Komponenten interagieren**

```
how do these authentication files work together?
```

**3. Den Ausführungsfluss verstehen**

```
trace the login process from front-end to database
```

> [!tip]
>
> - Sei präzise bei der Beschreibung, wonach du suchst
> - Verwende die Domänensprache des Projekts

## Bugs effizient beheben

Angenommen, du bist auf eine Fehlermeldung gestoßen und musst deren Ursache finden und beheben.

**1. Den Fehler mit Qwen Code teilen**

```
I'm seeing an error when I run npm test
```

**2. Nach Empfehlungen zur Fehlerbehebung fragen**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. Den Fix anwenden**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - Gib Qwen Code den Befehl an, um das Problem zu reproduzieren und einen Stack Trace zu erhalten
> - Erwähne alle Schritte zur Reproduktion des Fehlers
> - Teile Qwen Code mit, ob der Fehler intermittierend oder konsistent auftritt

## Code refactoren

Angenommen, du musst alten Code aktualisieren, um moderne Patterns und Practices zu verwenden.

**1. Legacy-Code für das Refactoring identifizieren**

```
find deprecated API usage in our codebase
```

**2. Refactoring-Empfehlungen erhalten**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. Die Änderungen sicher anwenden**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. Das Refactoring verifizieren**

```
run tests for the refactored code
```

> [!tip]
>
> - Bitte Qwen Code, die Vorteile des modernen Ansatzes zu erklären
> - Fordere an, dass Änderungen bei Bedarf die Abwärtskompatibilität wahren
> - Führe das Refactoring in kleinen, testbaren Schritten durch

## Spezialisierte Subagents verwenden

Angenommen, du möchtest spezialisierte KI-Subagents verwenden, um bestimmte Aufgaben effektiver zu erledigen.

**1. Verfügbare Subagents anzeigen**

```
/agents
```

Dies zeigt alle verfügbaren Subagents an und ermöglicht dir, neue zu erstellen.

**2. Subagents automatisch verwenden**

Qwen Code delegiert geeignete Aufgaben automatisch an spezialisierte Subagents:

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. Spezifische Subagents explizit anfordern**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. Eigene Subagents für deinen Workflow erstellen**

```
/agents
```

Wähle dann „create“ aus und folge den Eingabeaufforderungen, um Folgendes zu definieren:

- Eine eindeutige Kennung, die den Zweck des Subagents beschreibt (z. B. `code-reviewer`, `api-designer`).
- Wann Qwen Code diesen Agent verwenden soll
- Auf welche Tools er zugreifen kann
- Ein System-Prompt, der die Rolle und das Verhalten des Agents beschreibt

> [!tip]
>
> - Erstelle projektspezifische Subagents in `.qwen/agents/` für die Teamfreigabe
> - Verwende aussagekräftige `description`-Felder, um die automatische Delegierung zu ermöglichen
> - Beschränke den Tool-Zugriff auf das, was jeder Subagent tatsächlich benötigt
> - Erfahre mehr über [Sub Agents](./features/sub-agents)
> - Erfahre mehr über [Approval Mode](./features/approval-mode)

## Mit Tests arbeiten

Angenommen, du musst Tests für nicht abgedeckten Code hinzufügen.

**1. Ungetesteten Code identifizieren**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. Test-Grundgerüst generieren**

```
add tests for the notification service
```

**3. Aussagekräftige Testfälle hinzufügen**

```
add test cases for edge conditions in the notification service
```

**4. Tests ausführen und verifizieren**

```
run the new tests and fix any failures
```

Qwen Code kann Tests generieren, die den bestehenden Patterns und Konventionen deines Projekts folgen. Wenn du nach Tests fragst, sei präzise, welches Verhalten du verifizieren möchtest. Qwen Code prüft deine vorhandenen Testdateien, um Stil, Frameworks und Assertion-Patterns abzugleichen, die bereits verwendet werden.

Für eine umfassende Abdeckung bitte Qwen Code, Edge Cases zu identifizieren, die du übersehen haben könntest. Qwen Code kann deine Code-Pfade analysieren und Tests für Fehlerbedingungen, Grenzwerte und unerwartete Eingaben vorschlagen, die leicht übersehen werden.

## Pull Requests erstellen

Angenommen, du musst einen gut dokumentierten Pull Request für deine Änderungen erstellen.

**1. Deine Änderungen zusammenfassen**

```
summarize the changes I've made to the authentication module
```

**2. Einen Pull Request mit Qwen Code generieren**

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
> - Bitte Qwen Code direkt, einen PR für dich zu erstellen
> - Überprüfe den von Qwen Code generierten PR vor dem Absenden
> - Bitte Qwen Code, potenzielle Risiken oder Überlegungen hervorzuheben

## Dokumentation verwalten

Angenommen, du musst Dokumentation für deinen Code hinzufügen oder aktualisieren.

**1. Undokumentierten Code identifizieren**

```
find functions without proper JSDoc comments in the auth module
```

**2. Dokumentation generieren**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. Überprüfen und erweitern**

```
improve the generated documentation with more context and examples
```

**4. Dokumentation verifizieren**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - Gib den gewünschten Dokumentationsstil an (JSDoc, Docstrings usw.)
> - Bitte um Beispiele in der Dokumentation
> - Fordere Dokumentation für öffentliche APIs, Interfaces und komplexe Logik an

## Dateien und Verzeichnisse referenzieren

Verwende `@`, um Dateien oder Verzeichnisse schnell einzubinden, ohne darauf zu warten, dass Qwen Code sie liest.

**1. Eine einzelne Datei referenzieren**

```
Explain the logic in @src/utils/auth.js
```

Dies bindet den vollständigen Inhalt der Datei in die Konversation ein.

**2. Ein Verzeichnis referenzieren**

```
What's the structure of @src/components?
```

Dies liefert eine Verzeichnisauflistung mit Dateiinformationen.

**3. MCP-Ressourcen referenzieren**

```
Show me the data from @github: repos/owner/repo/issues
```

Dies ruft Daten von verbundenen MCP-Servern im Format `@server: resource` ab. Details findest du unter [MCP](./features/mcp).

> [!tip]
>
> - Dateipfade können relativ oder absolut sein
> - `@`-Dateireferenzen fügen `QWEN.md` im Verzeichnis der Datei und in übergeordneten Verzeichnissen zum Kontext hinzu
> - Verzeichnisreferenzen zeigen Dateilisten, nicht Inhalte
> - Du kannst mehrere Dateien in einer einzigen Nachricht referenzieren (z. B. "`@file 1.js` und `@file 2.js`")

## Frühere Konversationen fortsetzen

Angenommen, du hast an einer Aufgabe mit Qwen Code gearbeitet und musst in einer späteren Sitzung dort weitermachen, wo du aufgehört hast.

Qwen Code bietet zwei Optionen zum Fortsetzen früherer Konversationen:

- `--continue`, um die zuletzt geführte Konversation automatisch fortzusetzen
- `--resume`, um einen Konversationsauswahl-Dialog anzuzeigen

**1. Die zuletzt geführte Konversation fortsetzen**

```bash
qwen --continue
```

Dies setzt deine zuletzt geführte Konversation sofort ohne weitere Eingabeaufforderungen fort.

**2. Im nicht-interaktiven Modus fortsetzen**

```bash
qwen --continue --p "Continue with my task"
```

Verwende `--print` mit `--continue`, um die zuletzt geführte Konversation im nicht-interaktiven Modus fortzusetzen – ideal für Skripte oder Automatisierung.

**3. Konversationsauswahl anzeigen**

```bash
qwen --resume
```

Dies zeigt einen interaktiven Konversationsauswahl-Dialog mit einer übersichtlichen Listenansicht an, die Folgendes enthält:

- Sitzungszusammenfassung (oder ursprünglicher Prompt)
- Metadaten: verstrichene Zeit, Anzahl der Nachrichten und Git-Branch

Verwende die Pfeiltasten zur Navigation und drücke Enter, um eine Konversation auszuwählen. Drücke Esc zum Beenden.

> [!tip]
>
> - Der Konversationsverlauf wird lokal auf deinem Rechner gespeichert
> - Verwende `--continue` für schnellen Zugriff auf deine zuletzt geführte Konversation
> - Verwende `--resume`, wenn du eine bestimmte frühere Konversation auswählen musst
> - Beim Fortsetzen siehst du den gesamten Konversationsverlauf, bevor du fortfährst
> - Die fortgesetzte Konversation startet mit demselben Modell und derselben Konfiguration wie das Original
>
> **So funktioniert es**:
>
> 1. **Konversationsspeicherung**: Alle Konversationen werden automatisch lokal mit ihrem vollständigen Nachrichtenverlauf gespeichert
> 2. **Nachrichten-Deserialisierung**: Beim Fortsetzen wird der gesamte Nachrichtenverlauf wiederhergestellt, um den Kontext zu erhalten
> 3. **Tool-Status**: Tool-Nutzung und Ergebnisse aus der vorherigen Konversation bleiben erhalten
> 4. **Kontextwiederherstellung**: Die Konversation wird mit dem gesamten vorherigen Kontext fortgesetzt
>
> **Beispiele**:
>
> ```bash
> # Continue most recent conversation
> qwen --continue
>
> # Continue most recent conversation with a specific prompt
> qwen --continue --p "Show me our progress"
>
> # Show conversation picker
> qwen --resume
>
> # Continue most recent conversation in non-interactive mode
> qwen --continue --p "Run the tests again"
> ```

## Parallele Qwen Code-Sitzungen mit Git Worktrees ausführen

Angenommen, du musst gleichzeitig an mehreren Aufgaben arbeiten und dabei eine vollständige Code-Isolierung zwischen Qwen Code-Instanzen gewährleisten.

**1. Git Worktrees verstehen**

Git Worktrees ermöglichen es dir, mehrere Branches aus demselben Repository in separate Verzeichnisse auszuchecken. Jeder Worktree verfügt über ein eigenes Arbeitsverzeichnis mit isolierten Dateien, teilt sich aber denselben Git-Verlauf. Weitere Informationen findest du in der [offiziellen Git Worktree-Dokumentation](https://git-scm.com/docs/git-worktree).

**2. Einen neuen Worktree erstellen**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

Dies erstellt ein neues Verzeichnis mit einer separaten Arbeitskopie deines Repositorys.

**3. Qwen Code in jedem Worktree ausführen**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. Qwen Code in einem anderen Worktree ausführen**

```bash
cd ../project-bugfix
qwen
```

**5. Deine Worktrees verwalten**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Jeder Worktree hat seinen eigenen unabhängigen Dateistatus, was ihn ideal für parallele Qwen Code-Sitzungen macht
> - Änderungen in einem Worktree wirken sich nicht auf andere aus, sodass sich Qwen Code-Instanzen nicht gegenseitig stören
> - Alle Worktrees teilen sich denselben Git-Verlauf und dieselben Remote-Verbindungen
> - Bei langlaufenden Aufgaben kann Qwen Code in einem Worktree arbeiten, während du in einem anderen mit der Entwicklung fortfährst
> - Verwende aussagekräftige Verzeichnisnamen, um leicht zu erkennen, für welche Aufgabe jeder Worktree gedacht ist
> - Denke daran, deine Entwicklungsumgebung in jedem neuen Worktree gemäß deinem Projekt-Setup zu initialisieren. Abhängig von deinem Stack kann dies Folgendes umfassen:
>   - JavaScript-Projekte: Ausführen der Dependency-Installation (`npm install`, `yarn`)
>   - Python-Projekte: Einrichten virtueller Umgebungen oder Installation mit Paketmanagern
>   - Andere Sprachen: Befolgen des standardmäßigen Setup-Prozesses deines Projekts

## Qwen Code als Unix-ähnliches Utility verwenden

### Qwen Code zu deinem Verifizierungsprozess hinzufügen

Angenommen, du möchtest Qwen Code als Linter oder Code-Reviewer verwenden.

**Qwen Code zu deinem Build-Skript hinzufügen:**

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
> - Verwende Qwen Code für automatisierte Code-Reviews in deiner CI/CD-Pipeline
> - Passe den Prompt an, um auf projektspezifische Probleme zu prüfen
> - Erwäge, mehrere Skripte für verschiedene Verifizierungsarten zu erstellen

### Daten pipen

Angenommen, du möchtest Daten an Qwen Code pipen und strukturierte Daten zurückerhalten.

**Daten durch Qwen Code pipen:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Verwende Pipes, um Qwen Code in bestehende Shell-Skripte zu integrieren
> - Kombiniere es mit anderen Unix-Tools für leistungsstarke Workflows
> - Erwäge die Verwendung von `--output-format` für strukturierte Ausgaben

### Ausgabeformat steuern

Angenommen, du benötigst die Ausgabe von Qwen Code in einem bestimmten Format, insbesondere bei der Integration in Skripte oder andere Tools.

**1. Textformat verwenden (Standard)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Dies gibt nur die Klartext-Antwort von Qwen Code aus (Standardverhalten).

**2. JSON-Format verwenden**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Dies gibt ein JSON-Array von Nachrichten mit Metadaten aus, einschließlich Kosten und Dauer.

**3. Streaming-JSON-Format verwenden**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Dies gibt eine Reihe von JSON-Objekten in Echtzeit aus, während Qwen Code die Anfrage verarbeitet. Jede Nachricht ist ein gültiges JSON-Objekt, aber die gesamte Ausgabe ist kein gültiges JSON, wenn sie verkettet wird.

> [!tip]
>
> - Verwende `--output-format text` für einfache Integrationen, bei denen du nur die Antwort von Qwen Code benötigst
> - Verwende `--output-format json`, wenn du das vollständige Konversationsprotokoll benötigst
> - Verwende `--output-format stream-json` für die Echtzeitausgabe jedes Konversationsschritts

## Qwen Code nach seinen Fähigkeiten fragen

Qwen Code verfügt über integrierten Zugriff auf seine Dokumentation und kann Fragen zu seinen eigenen Features und Einschränkungen beantworten.

### Beispielfragen

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
> Qwen Code liefert dokumentationsbasierte Antworten auf diese Fragen. Für ausführbare Beispiele und praktische Demonstrationen verweise auf die spezifischen Workflow-Abschnitte oben.

> [!tip]
>
> - Qwen Code hat immer Zugriff auf die neueste Qwen Code-Dokumentation, unabhängig von der verwendeten Version
> - Stelle spezifische Fragen, um detaillierte Antworten zu erhalten
> - Qwen Code kann komplexe Features wie MCP-Integration, Enterprise-Konfigurationen und erweiterte Workflows erklären