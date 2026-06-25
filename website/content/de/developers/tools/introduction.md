# Qwen Code Werkzeuge

Qwen Code enthält integrierte Werkzeuge, die das Modell verwendet, um mit Ihrer lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Werkzeuge erweitern die Fähigkeiten der CLI, sodass sie über die Textgenerierung hinausgehen und bei einer Vielzahl von Aufgaben unterstützen kann.

## Überblick über Qwen Code Werkzeuge

Im Kontext von Qwen Code sind Werkzeuge spezifische Funktionen oder Module, deren Ausführung das Modell anfordern kann. Wenn Sie das Modell beispielsweise bitten, „Den Inhalt von `my_document.txt` zusammenzufassen“, wird es wahrscheinlich die Notwendigkeit erkennen, diese Datei zu lesen, und die Ausführung des Werkzeugs `read_file` anfordern.

Die Kernkomponente (`packages/core`) verwaltet diese Werkzeuge, präsentiert deren Definitionen (Schemata) dem Modell, führt sie bei Anforderung aus und gibt die Ergebnisse an das Modell zurück, das sie dann zu einer für den Benutzer verständlichen Antwort weiterverarbeitet.

Diese Werkzeuge bieten die folgenden Fähigkeiten:

- **Zugriff auf lokale Informationen:** Werkzeuge ermöglichen dem Modell den Zugriff auf Ihr lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Ausführen von Befehlen:** Mit Werkzeugen wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsmaßnahmen und Benutzerbestätigung).
- **Interaktion mit dem Web:** Werkzeuge können Inhalte von URLs abrufen.
- **Durchführen von Aktionen:** Werkzeuge können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf Ihrem System ausführen (wiederum normalerweise mit Sicherheitsvorkehrungen).
- **Verankern von Antworten:** Durch die Verwendung von Werkzeugen zum Abrufen von Echtzeit- oder spezifischen lokalen Daten können Antworten genauer, relevanter und in Ihrem tatsächlichen Kontext verankert sein.

## Verwendung von Qwen Code Werkzeugen

Um Qwen Code Werkzeuge zu verwenden, geben Sie eine Eingabeaufforderung an die CLI. Der Prozess läuft wie folgt ab:

1.  Sie geben eine Eingabeaufforderung an die CLI.
2.  Die CLI sendet die Eingabeaufforderung an den Kern.
3.  Der Kern sendet zusammen mit Ihrer Eingabeaufforderung und dem Gesprächsverlauf eine Liste der verfügbaren Werkzeuge und deren Beschreibungen/Schemata an die konfigurierte Modell-API.
4.  Das Modell analysiert Ihre Anfrage. Wenn es feststellt, dass ein Werkzeug benötigt wird, enthält seine Antwort eine Anforderung zur Ausführung eines bestimmten Werkzeugs mit bestimmten Parametern.
5.  Der Kern erhält diese Werkzeuganforderung, validiert sie und führt das Werkzeug (oft nach Benutzerbestätigung bei sensiblen Vorgängen) aus.
6.  Die Ausgabe des Werkzeugs wird an das Modell zurückgesendet.
7.  Das Modell verwendet die Ausgabe des Werkzeugs, um seine endgültige Antwort zu formulieren, die dann über den Kern an die CLI zurückgesendet und Ihnen angezeigt wird.

Normalerweise werden in der CLI Nachrichten angezeigt, die darauf hinweisen, wann ein Werkzeug aufgerufen wird und ob es erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Werkzeuge, insbesondere solche, die Ihr Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), sind aus Sicherheitsgründen konzipiert. Qwen Code wird in der Regel:

- **Bestätigung anfordern:** Fordert Sie vor der Ausführung potenziell sensibler Vorgänge zur Bestätigung auf und zeigt Ihnen an, welche Aktion ausgeführt werden soll.
- **Sandboxing nutzen:** Alle Werkzeuge unterliegen den durch Sandboxing durchgesetzten Einschränkungen (siehe [Sandboxing in Qwen Code](./sandbox.md)). Das bedeutet, dass bei Betrieb in einer Sandbox alle Werkzeuge (einschließlich MCP-Server), die Sie verwenden möchten, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die ausführbare Datei `npx` im Docker-Image der Sandbox installiert sein oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, Bestätigungsaufforderungen immer sorgfältig zu prüfen, bevor Sie ein Werkzeug ausführen lassen.

## Erfahren Sie mehr über die Werkzeuge von Qwen Code

Die integrierten Werkzeuge von Qwen Code können grob wie folgt kategorisiert werden:

- **[Dateisystem-Werkzeuge](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Durchsuchen usw.).
- **[Shell-Werkzeug](./shell.md) (`run_shell_command`):** Zum Ausführen von Shell-Befehlen.
- **[Monitor-Werkzeug](./monitor.md) (`monitor`):** Zum Ausführen von langlebigen Shell-Befehlen, deren Ausgabe als Hintergrundaufgaben-Benachrichtigungen gestreamt wird.
- **[Web-Fetch-Werkzeug](./web-fetch.md) (`web_fetch`):** Zum Abrufen von Inhalten von URLs.
- **[Todo-Write-Werkzeug](./todo-write.md) (`todo_write`):** Zum Erstellen und Verwalten strukturierter Aufgabenlisten während Codierungssitzungen.
- **[Agent-Werkzeug](./task.md) (`agent`):** Zum Delegieren komplexer Aufgaben an spezialisierte Unteragenten.
- **[Exit-Plan-Mode-Werkzeug](./exit-plan-mode.md) (`exit_plan_mode`):** Zum Beenden des Plan-Modus und Fortfahren mit der Implementierung.

Darüber hinaus integrieren diese Werkzeuge:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP-Benutzerleitfaden](../../users/features/mcp.md)**: Konfigurieren Sie MCP-Server und verwalten Sie sie von Qwen Code aus.
  - **[Web-Suche über MCP](./web-search.md)**: Stellen Sie über MCP eine Verbindung zu Websuchdiensten (Bailian, Tavily, GLM) her.
- **[Sandboxing](./sandbox.md)**: Sandboxing isoliert das Modell und seine Änderungen von Ihrer Umgebung, um potenzielle Risiken zu verringern.
