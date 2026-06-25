# Allgemeine Workflows

> Erfahren Sie mehr über gängige Workflows mit Qwen Code.

Jede Aufgabe in diesem Dokument enthält klare Anweisungen, Beispielbefehle und Best Practices, damit Sie das Beste aus Qwen Code herausholen.

## Neue Codebasen verstehen

### Schnellen Überblick über die Codebasis erhalten

Angenommen, Sie sind gerade einem neuen Projekt beigetreten und müssen dessen Struktur schnell verstehen.

**1. Zum Projektstammverzeichnis navigieren**

```bash
cd /pfad/zum/projekt
```

**2. Qwen Code starten**

```bash
qwen
```

**3. Nach einem übergeordneten Überblick fragen**

```
geben Sie mir einen Überblick über diese Codebasis
```

**4. Tiefer in bestimmte Komponenten eintauchen**

```
erklären Sie die wichtigsten Architekturmuster, die hier verwendet werden
```

```
was sind die wichtigsten Datenmodelle?
```

```
wie wird die Authentifizierung gehandhabt?
```

> [!tip]
>
> - Beginnen Sie mit allgemeinen Fragen und grenzen Sie diese dann auf bestimmte Bereiche ein
> - Fragen Sie nach Codierungskonventionen und Mustern, die im Projekt verwendet werden
> - Fordern Sie ein Glossar projektspezifischer Begriffe an

### Relevanten Code finden

Angenommen, Sie müssen Code finden, der zu einer bestimmten Funktion gehört.

**1. Qwen Code bitten, relevante Dateien zu finden**

```
finden Sie die Dateien, die die Benutzerauthentifizierung behandeln
```

**2. Kontext dazu erhalten, wie Komponenten interagieren**

```
wie arbeiten diese Authentifizierungsdateien zusammen?
```

**3. Den Ausführungsfluss verstehen**

```
verfolgen Sie den Anmeldeprozess vom Frontend bis zur Datenbank
```

> [!tip]
>
> - Seien Sie konkret, wonach Sie suchen
> - Verwenden Sie die Fachsprache des Projekts

## Fehler effizient beheben

Angenommen, Sie sind auf eine Fehlermeldung gestoßen und müssen deren Quelle finden und beheben.

**1. Den Fehler mit Qwen Code teilen**

```
Ich sehe einen Fehler, wenn ich npm test ausführe
```

**2. Nach Korrekturvorschlägen fragen**

```
schlagen Sie ein paar Möglichkeiten vor, das @ts-ignore in user.ts zu beheben
```

**3. Die Korrektur anwenden**

```
aktualisieren Sie user.ts mit der von Ihnen vorgeschlagenen Nullprüfung
```

> [!tip]
>
> - Teilen Sie Qwen Code den Befehl mit, um das Problem zu reproduzieren und einen Stacktrace zu erhalten
> - Erwähnen Sie alle Schritte zur Reproduktion des Fehlers
> - Lassen Sie Qwen Code wissen, ob der Fehler sporadisch oder konsistent auftritt

## Code umgestalten (Refactoring)

Angenommen, Sie müssen alten Code aktualisieren, um moderne Muster und Praktiken zu verwenden.

**1. Legacy-Code für die Umgestaltung identifizieren**

```
finden Sie veraltete API-Nutzung in unserer Codebasis
```

**2. Umgestaltungsempfehlungen erhalten**

```
schlagen Sie vor, wie utils.js umgestaltet werden kann, um moderne JavaScript-Funktionen zu nutzen
```

**3. Die Änderungen sicher anwenden**

```
gestalten Sie utils.js um, um ES 2024-Funktionen zu verwenden, während das gleiche Verhalten erhalten bleibt
```

**4. Die Umgestaltung überprüfen**

```
führen Sie Tests für den umgestalteten Code aus
```

> [!tip]
>
> - Bitten Sie Qwen Code, die Vorteile des modernen Ansatzes zu erklären
> - Verlangen Sie, dass Änderungen bei Bedarf die Abwärtskompatibilität wahren
> - Führen Sie die Umgestaltung in kleinen, testbaren Schritten durch

## Spezialisierte Unteragenten verwenden

Angenommen, Sie möchten spezialisierte KI-Unteragenten verwenden, um bestimmte Aufgaben effektiver zu erledigen.

**1. Verfügbare Unteragenten anzeigen**

```
/agents
```

Dies zeigt alle verfügbaren Unteragenten und ermöglicht es Ihnen, neue zu erstellen.

**2. Unteragenten automatisch verwenden**

Qwen Code delegiert geeignete Aufgaben automatisch an spezialisierte Unteragenten:

```
überprüfen Sie meine letzten Codeänderungen auf Sicherheitsprobleme
```

```
führen Sie alle Tests aus und beheben Sie alle Fehlschläge
```

**3. Explizit bestimmte Unteragenten anfordern**

```
verwenden Sie den Unteragenten code-reviewer, um das Auth-Modul zu prüfen
```

```
lassen Sie den Unteragenten debugger untersuchen, warum sich Benutzer nicht anmelden können
```

**4. Benutzerdefinierte Unteragenten für Ihren Workflow erstellen**

```
/agents
```

Wählen Sie dann „create“ und folgen Sie den Anweisungen, um Folgendes zu definieren:

- Eine eindeutige Kennung, die den Zweck des Unteragenten beschreibt (z. B. `code-reviewer`, `api-designer`).
- Wann Qwen Code diesen Agenten verwenden soll
- Auf welche Tools er zugreifen kann
- Einen System-Prompt, der die Rolle und das Verhalten des Agenten beschreibt

> [!tip]
>
> - Erstellen Sie projektspezifische Unteragenten in `.qwen/agents/` für die gemeinsame Nutzung im Team
> - Verwenden Sie aussagekräftige `description`-Felder, um die automatische Delegierung zu ermöglichen
> - Beschränken Sie den Tool-Zugriff auf das, was jeder Unteragent tatsächlich benötigt
> - Erfahren Sie mehr über [Unteragenten](./features/sub-agents)
> - Erfahren Sie mehr über den [Bestätigungsmodus](./features/approval-mode)

## Mit Tests arbeiten

Angenommen, Sie müssen Tests für nicht abgedeckten Code hinzufügen.

**1. Ungetesteten Code identifizieren**

```
finden Sie Funktionen in NotificationsService.swift, die nicht von Tests abgedeckt sind
```

**2. Testgerüst generieren**

```
fügen Sie Tests für den Benachrichtigungsdienst hinzu
```

**3. Sinnvolle Testfälle hinzufügen**

```
fügen Sie Testfälle für Randbedingungen im Benachrichtigungsdienst hinzu
```

**4. Tests ausführen und überprüfen**

```
führen Sie die neuen Tests aus und beheben Sie alle Fehlschläge
```

Qwen Code kann Tests generieren, die den vorhandenen Mustern und Konventionen Ihres Projekts folgen. Wenn Sie nach Tests fragen, geben Sie genau an, welches Verhalten Sie überprüfen möchten. Qwen Code untersucht Ihre vorhandenen Testdateien, um den Stil, die Frameworks und die Assertions-Muster, die bereits verwendet werden, zu übernehmen.

Für eine umfassende Abdeckung bitten Sie Qwen Code, Randfälle zu identifizieren, die Sie möglicherweise übersehen haben. Qwen Code kann Ihre Codepfade analysieren und Tests für Fehlerbedingungen, Grenzwerte und unerwartete Eingaben vorschlagen, die leicht übersehen werden können.
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
> - Überprüfen Sie den generierten PR von Qwen Code, bevor Sie ihn einreichen
> - Bitten Sie Qwen Code, potenzielle Risiken oder Überlegungen hervorzuheben

## Dokumentation verwalten

Angenommen, Sie müssen eine Dokumentation für Ihren Code hinzufügen oder aktualisieren.

**1. Undokumentierten Code identifizieren**

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

Dadurch wird der vollständige Inhalt der Datei in die Konversation aufgenommen.

**2. Verzeichnis referenzieren**

```
What's the structure of @src/components?
```

Dies liefert eine Verzeichnisliste mit Dateiinformationen.

**3. MCP-Ressourcen referenzieren**

```
Show me the data from @github: repos/owner/repo/issues
```

Dies ruft Daten von verbundenen MCP-Servern unter Verwendung des Formats @server: resource ab. Siehe [MCP](./features/mcp) für Details.

> [!tip]
>
> - Dateipfade können relativ oder absolut sein
> - @-Dateiverweise fügen `QWEN.md` im Verzeichnis der Datei und in übergeordneten Verzeichnissen zum Kontext hinzu
> - Verzeichnisverweise zeigen Dateilisten, keine Inhalte
> - Sie können mehrere Dateien in einer einzigen Nachricht referenzieren (z. B. "`@file 1.js` und `@file 2.js`")

## Vorherige Konversationen fortsetzen

Angenommen, Sie haben an einer Aufgabe mit Qwen Code gearbeitet und müssen in einer späteren Sitzung dort weitermachen, wo Sie aufgehört haben.

Qwen Code bietet zwei Optionen zum Fortsetzen vorheriger Konversationen:

- `--continue` zum automatischen Fortsetzen der zuletzt geführten Konversation
- `--resume` zum Anzeigen einer Konversationsauswahl

**1. Die zuletzt geführte Konversation fortsetzen**

```bash
qwen --continue
```

Dies setzt Ihre zuletzt geführte Konversation sofort ohne weitere Eingabeaufforderung fort.

**2. Im nicht-interaktiven Modus fortsetzen**

```bash
qwen --continue -p "Continue with my task"
```

Verwenden Sie `-p` (oder `--prompt`) mit `--continue`, um die zuletzt geführte Konversation im nicht-interaktiven Modus fortzusetzen – ideal für Skripte oder Automatisierung.

**3. Konversationsauswahl anzeigen**

```bash
qwen --resume
```

Dies zeigt einen interaktiven Konversationsauswähler mit einer übersichtlichen Listenansicht, die Folgendes anzeigt:

- Sitzungszusammenfassung (oder ursprüngliche Eingabeaufforderung)
- Metadaten: vergangene Zeit, Nachrichtenanzahl und Git-Branch

Navigieren Sie mit den Pfeiltasten und drücken Sie die Eingabetaste, um eine Konversation auszuwählen. Drücken Sie Esc, um zu beenden.

> [!tip]
>
> - Der Konversationsverlauf wird lokal auf Ihrem Rechner gespeichert
> - Verwenden Sie `--continue` für schnellen Zugriff auf Ihre zuletzt geführte Konversation
> - Verwenden Sie `--resume`, wenn Sie eine bestimmte frühere Konversation auswählen müssen
> - Beim Fortsetzen sehen Sie den gesamten Konversationsverlauf, bevor Sie weitermachen
> - Die fortgesetzte Konversation beginnt mit demselben Modell und derselben Konfiguration wie die ursprüngliche
>
> **So funktioniert es**:
>
> 1. **Konversationsspeicherung**: Alle Konversationen werden automatisch lokal mit ihrem vollständigen Nachrichtenverlauf gespeichert
> 2. **Nachrichtendeserialisierung**: Beim Fortsetzen wird der gesamte Nachrichtenverlauf wiederhergestellt, um den Kontext zu erhalten
> 3. **Werkzeugstatus**: Werkzeugnutzung und Ergebnisse aus der vorherigen Konversation bleiben erhalten
> 4. **Kontextwiederherstellung**: Die Konversation wird mit dem gesamten vorherigen Kontext fortgesetzt
>
> **Beispiele**:
>
> ```bash
> # Zuletzt geführte Konversation fortsetzen
> qwen --continue
>
> # Zuletzt geführte Konversation mit einer bestimmten Eingabeaufforderung fortsetzen
> qwen --continue -p "Show me our progress"
>
> # Konversationsauswahl anzeigen
> qwen --resume
>
> # Zuletzt geführte Konversation im nicht-interaktiven Modus fortsetzen
> qwen --continue -p "Run the tests again"
> ```

## Parallele Qwen Code-Sitzungen mit Git-Worktrees ausführen

Angenommen, Sie müssen gleichzeitig an mehreren Aufgaben mit vollständiger Code-Isolierung zwischen Qwen Code-Instanzen arbeiten.

**1. Git-Worktrees verstehen**

Git-Worktrees ermöglichen es Ihnen, mehrere Branches desselben Repositorys in separate Verzeichnisse auszuchecken. Jeder Worktree hat sein eigenes Arbeitsverzeichnis mit isolierten Dateien, während die Git-Historie gemeinsam genutzt wird. Erfahren Sie mehr in der [offiziellen Git-Worktree-Dokumentation](https://git-scm.com/docs/git-worktree).
**2. Einen neuen Worktree erstellen**

```bash
# Einen neuen Worktree mit einem neuen Branch erstellen
git worktree add ../project-feature-a -b feature-a

# Oder einen Worktree mit einem vorhandenen Branch erstellen
git worktree add ../project-bugfix bugfix-123
```

Dies erstellt ein neues Verzeichnis mit einer separaten Arbeitskopie Ihres Repositorys.

**3. Qwen Code in jedem Worktree ausführen**

```bash
# Zum Worktree navigieren
cd ../project-feature-a

# Qwen Code in dieser isolierten Umgebung ausführen
qwen
```

**4. Qwen Code in einem anderen Worktree ausführen**

```bash
cd ../project-bugfix
qwen
```

**5. Worktrees verwalten**

```bash
# Alle Worktrees auflisten
git worktree list

# Einen Worktree nach Fertigstellung entfernen
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Jeder Worktree besitzt einen eigenen unabhängigen Dateistand, ideal für parallele Qwen Code-Sitzungen
> - Änderungen in einem Worktree wirken sich nicht auf andere aus, sodass Qwen Code-Instanzen sich nicht gegenseitig stören
> - Alle Worktrees teilen sich die gleiche Git-Historie und die gleichen Remote-Verbindungen
> - Bei langlebigen Aufgaben können Sie Qwen Code in einem Worktree arbeiten lassen, während Sie in einem anderen die Entwicklung fortsetzen
> - Verwenden Sie aussagekräftige Verzeichnisnamen, um leicht zu erkennen, für welche Aufgabe jeder Worktree gedacht ist
> - Denken Sie daran, in jedem neuen Worktree Ihre Entwicklungsumgebung entsprechend dem Projektsetup zu initialisieren. Je nach Technologie-Stack kann das Folgendes umfassen:
>   - JavaScript-Projekte: Abhängigkeiten installieren (`npm install`, `yarn`)
>   - Python-Projekte: Virtuelle Umgebungen einrichten oder mit Paketmanagern installieren
>   - Andere Sprachen: Befolgen Sie den üblichen Setup-Prozess Ihres Projekts

## Qwen Code als Unix-ähnliches Werkzeug verwenden

### Qwen Code in Ihren Prüfprozess einbinden

Angenommen, Sie möchten Qwen Code als Linter oder Code-Reviewer einsetzen.

**Qwen Code in Ihr Build-Skript einfügen:**

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
> - Nutzen Sie Qwen Code für automatisierte Code-Reviews in Ihrer CI/CD-Pipeline
> - Passen Sie den Prompt an, um nach spezifischen, für Ihr Projekt relevanten Problemen zu suchen
> - Erwägen Sie die Erstellung mehrerer Skripte für verschiedene Prüfarten

### Einlesen, ausgeben

Angenommen, Sie möchten Daten in Qwen Code hineinleiten und strukturierte Daten zurückerhalten.

**Daten durch Qwen Code leiten:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Verwenden Sie Pipes, um Qwen Code in vorhandene Shell-Skripte zu integrieren
> - Kombinieren Sie es mit anderen Unix-Werkzeugen für leistungsfähige Workflows
> - Ziehen Sie `--output-format` für strukturierte Ausgaben in Betracht

### Ausgabeformat steuern

Angenommen, Sie benötigen die Ausgabe von Qwen Code in einem bestimmten Format – besonders bei der Integration in Skripte oder andere Werkzeuge.

**1. Textformat (Standard)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Dies gibt nur die reine Textantwort von Qwen Code aus (Standardverhalten).

**2. JSON-Format**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Dies gibt ein JSON-Array von Nachrichten mit Metadaten wie Kosten und Dauer aus.

**3. Streaming-JSON-Format**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Dies gibt in Echtzeit eine Reihe von JSON-Objekten aus, während Qwen Code die Anfrage verarbeitet. Jede Nachricht ist ein gültiges JSON-Objekt, aber die gesamte Ausgabe ist bei Aneinanderreihung kein gültiges JSON.

> [!tip]
>
> - Verwenden Sie `--output-format text` für einfache Integrationen, bei denen Sie nur die Antwort von Qwen Code benötigen
> - Verwenden Sie `--output-format json`, wenn Sie das vollständige Konversationsprotokoll benötigen
> - Verwenden Sie `--output-format stream-json` für die Echtzeit-Ausgabe jedes Konversationsschritts

## Qwen Code nach seinen Fähigkeiten fragen

Qwen Code hat integrierten Zugriff auf seine Dokumentation und kann Fragen zu eigenen Funktionen und Einschränkungen beantworten.

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
> - Qwen Code hat immer Zugriff auf die aktuellste Qwen Code-Dokumentation, unabhängig von der von Ihnen verwendeten Version
> - Stellen Sie spezifische Fragen, um detaillierte Antworten zu erhalten
> - Qwen Code kann komplexe Funktionen wie MCP-Integration, Enterprise-Konfigurationen und fortgeschrittene Workflows erklären
