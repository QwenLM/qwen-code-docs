# Häufige Arbeitsabläufe

> Erfahren Sie mehr über gängige Arbeitsabläufe mit Qwen Code.

Jede Aufgabe in diesem Dokument enthält klare Anweisungen, Beispielbefehle und Best Practices, um Ihnen zu helfen, das Beste aus Qwen Code herauszuholen.

## Neue Codebasen verstehen

### Schnellen Überblick über die Codebasis erhalten

Angenommen, Sie sind gerade einem neuen Projekt beigetreten und müssen dessen Struktur schnell erfassen.

**1. Wechseln Sie in das Stammverzeichnis des Projekts**

```bash
cd /pfad/zum/projekt
```

**2. Starten Sie Qwen Code**

```bash
qwen
```

**3. Fordern Sie eine Übersicht auf hoher Ebene an**

```
Geben Sie mir einen Überblick über diese Codebasis.
```

**4. Vertiefen Sie Ihr Verständnis spezifischer Komponenten**

```
Erklären Sie die hier verwendeten zentralen Architekturmuster.
```

```
Welche sind die wichtigsten Datenmodelle?
```

```
Wie wird die Authentifizierung gehandhabt?
```

> [!tip]
>
> - Beginnen Sie mit allgemeinen Fragen und gehen Sie dann schrittweise auf spezifische Bereiche ein.
> - Fragen Sie nach den im Projekt verwendeten Codierkonventionen und -mustern.
> - Fordern Sie ein Glossar projekt-spezifischer Begriffe an.

### Relevante Code finden

Angenommen, Sie müssen Code zu einer bestimmten Funktion oder einem bestimmten Feature lokalisieren.

**1. Fordern Sie Qwen Code auf, die relevanten Dateien zu finden**

```
finde die Dateien, die die Benutzerauthentifizierung verarbeiten
```

**2. Holen Sie sich Kontext zu der Interaktion der Komponenten**

```
wie arbeiten diese Authentifizierungsdateien zusammen?
```

**3. Verstehen Sie den Ablauf der Ausführung**

```
verfolge den Login-Prozess von der Oberfläche bis zur Datenbank
```

> [!tip]
>
> - Seien Sie präzise bezüglich dessen, wonach Sie suchen  
> - Verwenden Sie die Fachsprache des Projekts

## Fehler effizient beheben

Angenommen, Sie erhalten eine Fehlermeldung und müssen deren Ursache finden und beheben.

**1. Teilen Sie den Fehler mit Qwen Code**

```
Ich erhalte eine Fehlermeldung, wenn ich „npm test“ ausführe.
```

**2. Fordern Sie Korrekturvorschläge an**

```
Schlagen Sie einige Möglichkeiten vor, das @ts-ignore in user.ts zu beheben.
```

**3. Wenden Sie die Korrektur an**

```
Aktualisieren Sie user.ts, um die von Ihnen vorgeschlagene Nullprüfung hinzuzufügen.
```

> [!tip]
>
> - Geben Sie Qwen Code den Befehl an, mit dem sich das Problem reproduzieren lässt, und geben Sie ggf. einen Stack-Trace an.
> - Beschreiben Sie alle Schritte zur Reproduktion des Fehlers.
> - Informieren Sie Qwen Code darüber, ob der Fehler gelegentlich oder regelmäßig auftritt.

## Code refaktorieren

Angenommen, Sie müssen alten Code aktualisieren, um moderne Muster und Best Practices zu nutzen.

**1. Veralteten Code für die Refaktorisierung identifizieren**

```
veraltete API-Nutzung in unserer Codebasis finden
```

**2. Vorschläge für die Refaktorisierung einholen**

```
Vorschläge für die Refaktorisierung von utils.js unter Verwendung moderner JavaScript-Features erhalten
```

**3. Die Änderungen sicher anwenden**

```
utils.js so refaktorisieren, dass ES2024-Features genutzt werden, wobei das Verhalten unverändert bleibt
```

**4. Die Refaktorisierung überprüfen**

```
Tests für den refaktorierten Code ausführen
```

> [!tip]
>
> - Fordern Sie Qwen Code auf, die Vorteile des modernen Ansatzes zu erläutern.
> - Fordern Sie gegebenenfalls sicherheitsorientierte Änderungen an, die die Abwärtskompatibilität bewahren.
> - Führen Sie die Refaktorisierung in kleinen, testbaren Schritten durch.

## Spezialisierte Untergefährten verwenden

Angenommen, Sie möchten spezialisierte KI-Untergefährten einsetzen, um bestimmte Aufgaben effektiver zu bewältigen.

**1. Verfügbare Untergefährten anzeigen**

```
/agents
```

Damit werden alle verfügbaren Untergefährten angezeigt und Sie können neue erstellen.

**2. Untergefährten automatisch nutzen**

Qwen Code delegiert geeignete Aufgaben automatisch an spezialisierte Untergefährten:

```
Überprüfe meine jüngsten Codeänderungen auf Sicherheitsprobleme.
```

```
Führe alle Tests aus und behebe etwaige Fehler.
```

**3. Explizit bestimmte Untergefährten anfordern**

```
Nutze den Untergefährten „code-reviewer“, um das Authentifizierungsmodul zu prüfen.
```

```
Lass den Untergefährten „debugger“ untersuchen, warum Benutzer sich nicht anmelden können.
```

**4. Benutzerdefinierte Untergefährten für Ihren Workflow erstellen**

```
/agents
```

Wählen Sie dann „Erstellen“ und folgen Sie den Anweisungen, um Folgendes zu definieren:

- Eine eindeutige Kennung, die den Zweck des Untergefährten beschreibt (z. B. `code-reviewer`, `api-designer`).
- Wann Qwen Code diesen Untergefährten einsetzen soll.
- Welche Tools er nutzen darf.
- Einen System-Prompt, der die Rolle und das Verhalten des Untergefährten beschreibt.

> [!tip]
>
> - Erstellen Sie projektbezogene Untergefährten in `.qwen/agents/`, um sie mit dem Team zu teilen.
> - Verwenden Sie aussagekräftige Felder `description`, um eine automatische Delegation zu ermöglichen.
> - Beschränken Sie den Tool-Zugriff auf das, was jeder Untergefährte tatsächlich benötigt.
> - Erfahren Sie mehr über [Untergefährten](./features/sub-agents).
> - Erfahren Sie mehr über [Genehmigungsmodus](./features/approval-mode)

## Mit Tests arbeiten

Angenommen, Sie müssen Tests für nicht abgedeckten Code hinzufügen.

**1. Nicht getesteten Code identifizieren**

```
Suche nach Funktionen in NotificationsService.swift, die nicht durch Tests abgedeckt sind.
```

**2. Testgerüst generieren**

```
Füge Tests für den Benachrichtigungsdienst hinzu.
```

**3. Sinnvolle Testfälle hinzufügen**

```
Füge Testfälle für Randbedingungen im Benachrichtigungsdienst hinzu.
```

**4. Tests ausführen und überprüfen**

```
Führe die neuen Tests aus und behebe alle Fehler.
```

Qwen Code kann Tests generieren, die sich an die bestehenden Muster und Konventionen Ihres Projekts halten. Wenn Sie Tests anfordern, geben Sie präzise an, welches Verhalten Sie überprüfen möchten. Qwen Code analysiert Ihre vorhandenen Testdateien, um Stil, verwendete Frameworks und bereits eingesetzte Assertionsmuster zu übernehmen.

Für eine umfassende Abdeckung können Sie Qwen Code auffordern, Randfälle zu identifizieren, die Ihnen möglicherweise entgangen sind. Qwen Code analysiert Ihre Codepfade und schlägt Tests für Fehlerzustände, Grenzwerte und unerwartete Eingaben vor, die leicht übersehen werden können.

## Pull Requests erstellen

Angenommen, Sie müssen für Ihre Änderungen einen gut dokumentierten Pull Request erstellen.

**1. Fassen Sie Ihre Änderungen zusammen**

```
fassen Sie die von mir am Authentifizierungsmodul vorgenommenen Änderungen zusammen
```

**2. Erstellen Sie mit Qwen Code einen Pull Request**

```
erstellen Sie einen PR
```

**3. Überprüfen und verfeinern Sie den Pull Request**

```
verbessern Sie die PR-Beschreibung mit weiterem Kontext zu den Sicherheitsverbesserungen
```

**4. Fügen Sie Testdetails hinzu**

```
fügen Sie Informationen darüber hinzu, wie diese Änderungen getestet wurden
```

> [!tip]
>
> - Fordern Sie Qwen Code direkt auf, einen Pull Request für Sie zu erstellen.
> - Überprüfen Sie den von Qwen Code generierten Pull Request, bevor Sie ihn einreichen.
> - Fordern Sie Qwen Code auf, potenzielle Risiken oder Aspekte, die berücksichtigt werden müssen, hervorzuheben.

## Dokumentation bearbeiten

Angenommen, Sie müssen die Dokumentation Ihres Codes ergänzen oder aktualisieren.

**1. Nicht dokumentierten Code identifizieren**

```
Finde Funktionen im Authentifizierungsmodul ohne ordnungsgemäße JSDoc-Kommentare
```

**2. Dokumentation generieren**

```
Füge JSDoc-Kommentare zu den nicht dokumentierten Funktionen in auth.js hinzu
```

**3. Überprüfen und verbessern**

```
Verbessere die generierte Dokumentation mit zusätzlichen Kontextinformationen und Beispielen
```

**4. Dokumentation überprüfen**

```
Überprüfe, ob die Dokumentation unseren Projektstandards entspricht
```

> [!tip]
>
> - Geben Sie den gewünschten Dokumentationsstil an (z. B. JSDoc, Docstrings usw.)
> - Fordern Sie Beispiele in der Dokumentation an
> - Fordern Sie Dokumentation für öffentliche APIs, Schnittstellen und komplexe Logik an

## Referenzdateien und -verzeichnisse

Verwenden Sie `@`, um Dateien oder Verzeichnisse schnell einzubinden, ohne auf das Lesen durch Qwen Code warten zu müssen.

**1. Eine einzelne Datei referenzieren**

```
Erklären Sie die Logik in @src/utils/auth.js
```

Dadurch wird der gesamte Inhalt der Datei in die Konversation eingefügt.

**2. Ein Verzeichnis referenzieren**

```
Wie ist die Struktur von @src/components?
```

Dadurch wird eine Auflistung des Verzeichnisses mit Informationen zu den enthaltenen Dateien bereitgestellt.

**3. MCP-Ressourcen referenzieren**

```
Zeigen Sie mir die Daten aus @github: repos/owner/repo/issues
```

Dadurch werden Daten von verbundenen MCP-Servern im Format `@server: Ressource` abgerufen. Weitere Details finden Sie unter [MCP](./features/mcp).

> [!tip]
>
> - Dateipfade können relativ oder absolut sein  
> - Bei `@`-Dateireferenzen werden die Dateien `QWEN.md` im Verzeichnis der referenzierten Datei sowie in allen übergeordneten Verzeichnissen zum Kontext hinzugefügt  
> - Bei Verzeichnisreferenzen wird eine Liste der Dateien angezeigt, nicht deren Inhalte  
> - Sie können mehrere Dateien in einer einzigen Nachricht referenzieren (z. B. „`@file 1.js` und `@file 2.js`“)

## Vorherige Konversationen fortsetzen

Angenommen, Sie arbeiten gerade an einer Aufgabe mit Qwen Code und müssen diese zu einem späteren Zeitpunkt in einer neuen Sitzung fortsetzen.

Qwen Code bietet zwei Optionen, um vorherige Konversationen fortzusetzen:

- `--continue`, um automatisch die zuletzt begonnene Konversation fortzusetzen  
- `--resume`, um einen interaktiven Konversationsauswähler anzuzeigen

**1. Fortsetzen der zuletzt begonnenen Konversation**

```bash
qwen --continue
```

Damit wird unverzüglich die zuletzt begonnene Konversation ohne weitere Eingabeaufforderung fortgesetzt.

**2. Fortsetzen im nicht-interaktiven Modus**

```bash
qwen --continue --p "Setze meine Aufgabe fort"
```

Verwenden Sie `--print` zusammen mit `--continue`, um die zuletzt begonnene Konversation im nicht-interaktiven Modus fortzusetzen – ideal für Skripte oder Automatisierungsaufgaben.

**3. Anzeigen des Konversationsauswählers**

```bash
qwen --resume
```

Dadurch wird ein interaktiver Konversationsauswähler mit einer übersichtlichen Listenansicht angezeigt, die folgende Informationen enthält:

- Zusammenfassung der Sitzung (oder die ursprüngliche Eingabeaufforderung)  
- Metadaten: verstrichene Zeit, Nachrichtenzahl und Git-Branch  

Navigieren Sie mit den Pfeiltasten und drücken Sie die Eingabetaste, um eine Konversation auszuwählen. Drücken Sie Escape, um den Auswähler zu verlassen.

> [!tip]
>
> - Der Verlauf der Konversationen wird lokal auf Ihrem Rechner gespeichert.  
> - Verwenden Sie `--continue`, um schnell auf Ihre zuletzt begonnene Konversation zuzugreifen.  
> - Verwenden Sie `--resume`, wenn Sie eine bestimmte frühere Konversation auswählen müssen.  
> - Beim Fortsetzen sehen Sie den gesamten Konversationsverlauf, bevor Sie fortfahren.  
> - Die fortgesetzte Konversation startet mit demselben Modell und derselben Konfiguration wie die ursprüngliche.  
>
> **So funktioniert es**:  
>
> 1. **Konversationsspeicherung**: Alle Konversationen werden automatisch lokal mit ihrem vollständigen Nachrichtenverlauf gespeichert.  
> 2. **Nachrichtendeserialisierung**: Beim Fortsetzen wird der gesamte Nachrichtenverlauf wiederhergestellt, um den Kontext zu bewahren.  
> 3. **Zustand der Tools**: Die Nutzung von Tools und deren Ergebnisse aus der vorherigen Konversation bleiben erhalten.  
> 4. **Kontextwiederherstellung**: Die Konversation wird mit dem gesamten vorherigen Kontext fortgesetzt.  
>
> **Beispiele**:  
>
> ```bash
> # Fortsetzen der zuletzt begonnenen Konversation
> qwen --continue
>
> # Fortsetzen der zuletzt begonnenen Konversation mit einer spezifischen Eingabeaufforderung
> qwen --continue --p "Zeig mir unseren Fortschritt"
>
> # Anzeigen des Konversationsauswählers
> qwen --resume
>
> # Fortsetzen der zuletzt begonnenen Konversation im nicht-interaktiven Modus
> qwen --continue --p "Führe die Tests erneut aus"
> ```

## Parallel laufende Qwen-Code-Sitzungen mit Git-Arbeitsbäumen ausführen

Angenommen, Sie müssen gleichzeitig an mehreren Aufgaben arbeiten und dabei eine vollständige Code-Isolation zwischen den einzelnen Qwen-Code-Instanzen sicherstellen.

**1. Git-Arbeitsbäume verstehen**

Git-Arbeitsbäume ermöglichen es Ihnen, mehrere Branches desselben Repositorys in separaten Verzeichnissen auszuchecken. Jeder Arbeitsbaum verfügt über ein eigenes Arbeitsverzeichnis mit isolierten Dateien, teilt sich jedoch die gleiche Git-Historie. Weitere Informationen finden Sie in der [offiziellen Git-Arbeitsbaum-Dokumentation](https://git-scm.com/docs/git-worktree).

**2. Einen neuen Arbeitsbaum erstellen**

```bash

# Erstellen Sie einen neuen Arbeitsbaum mit einem neuen Branch
git worktree add ../project-feature-a -b feature-a

# Oder erstellen Sie einen Arbeitsbaum mit einem vorhandenen Branch
git worktree add ../project-bugfix bugfix-123
```

Dadurch wird ein neues Verzeichnis mit einer separaten Arbeitskopie Ihres Repositorys erstellt.

**3. Qwen Code in jedem Arbeitsbaum ausführen**

```bash

# Wechseln Sie in Ihren Arbeitsbaum
cd ../project-feature-a

# Qwen Code in dieser isolierten Umgebung ausführen  
qwen  

**4. Qwen Code in einem anderen Worktree ausführen**  

```bash  
cd ../project-bugfix  
qwen  
```  

**5. Ihre Worktrees verwalten**  

```bash  

# Alle Worktrees auflisten  
git worktree list  
```

# Ein Worktree entfernen, sobald es nicht mehr benötigt wird
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Jeder Worktree verfügt über einen eigenen, unabhängigen Dateizustand – ideal für parallele Qwen Code-Sitzungen.
> - Änderungen in einem Worktree wirken sich nicht auf andere aus, sodass sich verschiedene Qwen Code-Instanzen nicht gegenseitig beeinträchtigen.
> - Alle Worktrees teilen dieselbe Git-Historie und dieselben Remote-Verbindungen.
> - Für langlaufende Aufgaben kann Qwen Code in einem Worktree arbeiten, während Sie parallel in einem anderen weiterentwickeln.
> - Verwenden Sie aussagekräftige Verzeichnisnamen, um auf einen Blick zu erkennen, für welche Aufgabe jeweils ein Worktree vorgesehen ist.
> - Denken Sie daran, Ihre Entwicklungsumgebung in jedem neuen Worktree gemäß der Projekt-Setup-Anleitung zu initialisieren. Je nach Technologie-Stack kann dies beinhalten:
>   - JavaScript-Projekte: Installation der Abhängigkeiten (`npm install`, `yarn`)
>   - Python-Projekte: Einrichtung einer virtuellen Umgebung oder Installation über Paketmanager
>   - Andere Sprachen: Befolgung des standardmäßigen Setup-Prozesses Ihres Projekts

## Qwen Code als Unix-ähnliches Hilfsprogramm verwenden

### Fügen Sie Qwen Code in Ihren Verifizierungsprozess ein

Angenommen, Sie möchten Qwen Code als Linter oder Code-Reviewer verwenden.

**Fügen Sie Qwen Code Ihrem Build-Skript hinzu:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'Sie sind ein Linter. Bitte prüfen Sie die Änderungen im Vergleich zu main und melden Sie alle Probleme im Zusammenhang mit Tippfehlern. Geben Sie den Dateinamen und die Zeilennummer in einer Zeile an und eine Beschreibung des Problems in der nächsten Zeile. Geben Sie keinen weiteren Text aus.'"
    }
}
```

> [!tip]
>
> - Verwenden Sie Qwen Code für automatisierte Code-Reviews in Ihrer CI/CD-Pipeline.
> - Passen Sie die Aufforderung (Prompt) an, um spezifische, für Ihr Projekt relevante Probleme zu überprüfen.
> - Erwägen Sie die Erstellung mehrerer Skripte für verschiedene Arten von Verifikationen.

### Daten ein- und ausleiten

Angenommen, Sie möchten Daten an Qwen Code übergeben und strukturierte Daten als Antwort erhalten.

**Daten über Qwen Code leiten:**

```bash
cat build-error.txt | qwen -p 'erklären Sie prägnant die Ursache dieses Build-Fehlers' > output.txt
```

> [!tip]
>
> - Verwenden Sie Pipes, um Qwen Code in bestehende Shell-Skripte zu integrieren.
> - Kombinieren Sie Qwen Code mit anderen Unix-Werkzeugen für leistungsstarke Workflows.
> - Erwägen Sie die Verwendung von `--output-format` für strukturierte Ausgabe.

### Ausgabeformat steuern

Angenommen, Sie benötigen die Ausgabe von Qwen Code in einem bestimmten Format – insbesondere dann, wenn Sie Qwen Code in Skripte oder andere Tools integrieren.

**1. Textformat verwenden (Standard)**

```bash
cat data.txt | qwen -p 'fassen Sie diese Daten zusammen' --output-format text > summary.txt
```

Dadurch wird ausschließlich die einfache Textantwort von Qwen Code ausgegeben (Standardverhalten).

**2. JSON-Format verwenden**

```bash
cat code.py | qwen -p 'analysieren Sie diesen Code auf Fehler' --output-format json > analysis.json
```

Dadurch wird ein JSON-Array mit Nachrichten ausgegeben, das Metadaten wie Kosten und Dauer enthält.

**3. Stream-basiertes JSON-Format verwenden**

```bash
cat log.txt | qwen -p 'parsen Sie diese Logdatei nach Fehlern' --output-format stream-json
```

Dadurch werden JSON-Objekte in Echtzeit ausgegeben, während Qwen Code die Anfrage verarbeitet. Jede Nachricht ist ein gültiges JSON-Objekt; die gesamte Ausgabe ist jedoch nicht gültiges JSON, falls die einzelnen Objekte konkateniert werden.

> [!tip]
>
> - Verwenden Sie `--output-format text`, wenn Sie für eine einfache Integration lediglich die Antwort von Qwen Code benötigen.
> - Verwenden Sie `--output-format json`, wenn Sie den vollständigen Verlaufsprotokoll der Konversation benötigen.
> - Verwenden Sie `--output-format stream-json`, um jede Antwort in der Konversation in Echtzeit auszugeben.

## Stellen Sie Qwen Code Fragen zu seinen Fähigkeiten

Qwen Code verfügt über integrierten Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Einschränkungen beantworten.

### Beispiel-Fragen

```
Kann Qwen Code Pull Requests erstellen?
```

```
Wie behandelt Qwen Code Berechtigungen?
```

```
Welche Slash-Befehle stehen zur Verfügung?
```

```
Wie verwende ich MCP mit Qwen Code?
```

```
Wie konfiguriere ich Qwen Code für Amazon Bedrock?
```

```
Welche Einschränkungen hat Qwen Code?
```

> [!note]
>
> Qwen Code liefert zu diesen Fragen dokumentationsbasierte Antworten. Für ausführbare Beispiele und praktische Demonstrationen siehe die jeweiligen Workflow-Abschnitte oben.

> [!tip]
>
> - Qwen Code hat stets Zugriff auf die aktuellste Qwen Code-Dokumentation – unabhängig von der verwendeten Version  
> - Stellen Sie gezielte Fragen, um detaillierte Antworten zu erhalten  
> - Qwen Code kann komplexe Funktionen wie die MCP-Integration, Unternehmenskonfigurationen und erweiterte Workflows erklären