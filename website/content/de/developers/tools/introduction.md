# Qwen Code Tools

Qwen Code enthält integrierte Tools, die das Modell verwendet, um mit deiner lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Tools erweitern die Fähigkeiten der CLI und ermöglichen es ihr, über die reine Textgenerierung hinauszugehen und bei einer Vielzahl von Aufgaben zu helfen.

## Übersicht über die Qwen Code Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, deren Ausführung das Modell anfordern kann. Wenn du das Modell beispielsweise bittest, „den Inhalt von `my_document.txt` zusammenzufassen“, wird es wahrscheinlich erkennen, dass es diese Datei lesen muss, und die Ausführung des `read_file`-Tools anfordern.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, präsentiert dem Modell ihre Definitionen (Schemata), führt sie auf Anfrage aus und gibt die Ergebnisse an das Modell zur weiteren Verarbeitung in eine für den Benutzer bestimmte Antwort zurück.

Diese Tools bieten die folgenden Fähigkeiten:

- **Zugriff auf lokale Informationen:** Tools ermöglichen dem Modell den Zugriff auf dein lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Ausführen von Befehlen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsmaßnahmen und Benutzerbestätigung).
- **Interaktion mit dem Web:** Tools können Inhalte von URLs abrufen.
- **Aktionen durchführen:** Tools können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf deinem System ausführen (auch hier in der Regel mit Schutzmechanismen).
- **Antworten fundieren:** Durch die Verwendung von Tools zum Abrufen von Echtzeit- oder spezifischen lokalen Daten können Antworten genauer, relevanter und in deinem tatsächlichen Kontext fundiert sein.

## So verwendest du Qwen Code Tools

Um Qwen Code Tools zu verwenden, gib einen Prompt an die CLI weiter. Der Ablauf ist wie folgt:

1.  Du gibst einen Prompt an die CLI weiter.
2.  Die CLI sendet den Prompt an den Core.
3.  Der Core sendet zusammen mit deinem Prompt und dem Gesprächsverlauf eine Liste der verfügbaren Tools und deren Beschreibungen/Schemata an die konfigurierte Modell-API.
4.  Das Modell analysiert deine Anfrage. Wenn es feststellt, dass ein Tool benötigt wird, enthält seine Antwort eine Anfrage zur Ausführung eines bestimmten Tools mit bestimmten Parametern.
5.  Der Core empfängt diese Tool-Anfrage, validiert sie und führt (oft nach Benutzerbestätigung bei sensiblen Operationen) das Tool aus.
6.  Die Ausgabe des Tools wird zurück an das Modell gesendet.
7.  Das Modell verwendet die Ausgabe des Tools, um seine endgültige Antwort zu formulieren, die dann über den Core an die CLI zurückgesendet und dir angezeigt wird.

In der CLI siehst du normalerweise Meldungen, die anzeigen, wann ein Tool aufgerufen wird und ob es erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools, insbesondere solche, die dein Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), wurden im Hinblick auf Sicherheit entwickelt. Qwen Code wird in der Regel:

- **Bestätigung anfordern:** Dich vor der Ausführung potenziell sensibler Operationen auffordern und dir anzeigen, welche Aktion ausgeführt werden soll.
- **Sandboxing nutzen:** Alle Tools unterliegen den durch Sandboxing erzwungenen Einschränkungen (siehe [Sandboxing in Qwen Code](./sandbox.md)). Das bedeutet, dass bei der Arbeit in einer Sandbox alle Tools (einschließlich MCP-Server), die du verwenden möchtest, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die ausführbare `npx`-Datei im Docker-Image der Sandbox installiert oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, Bestätigungsaufforderungen immer sorgfältig zu prüfen, bevor du einem Tool die Ausführung erlaubst.

## Erfahre mehr über die Tools von Qwen Code

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[Dateisystem-Tools](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Suchen usw.).
- **[Shell-Tool](./shell.md) (`run_shell_command`):** Zum Ausführen von Shell-Befehlen.
- **[Monitor-Tool](./monitor.md) (`monitor`):** Zum Ausführen langlebiger Shell-Befehle, die die Ausgabe als Hintergrundaufgaben-Benachrichtigungen streamen.
- **[Web-Fetch-Tool](./web-fetch.md) (`web_fetch`):** Zum Abrufen von Inhalten von URLs.
- **[Todo-Write-Tool](./todo-write.md) (`todo_write`):** Zum Erstellen und Verwalten strukturierter Aufgabenlisten während Codierungssitzungen.
- **[Agent-Tool](./task.md) (`agent`):** Zum Delegieren komplexer Aufgaben an spezialisierte Unter-Agents.
- **[Exit-Plan-Mode-Tool](./exit-plan-mode.md) (`exit_plan_mode`):** Zum Verlassen des Planungsmodus und Fortfahren mit der Implementierung.

Darüber hinaus beinhalten diese Tools:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP-Benutzerhandbuch](../../users/features/mcp.md)**: Konfiguriere MCP-Server und verwalte sie über Qwen Code
  - **[Websuche über MCP](./web-search.md)**: Stelle eine Verbindung zu Websuchdiensten (Bailian, Tavily, GLM) über MCP her
- **[Sandboxing](./sandbox.md)**: Sandboxing isoliert das Modell und seine Änderungen von deiner Umgebung, um potenzielle Risiken zu reduzieren.