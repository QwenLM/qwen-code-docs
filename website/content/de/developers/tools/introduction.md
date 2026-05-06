# Qwen Code Tools

Qwen Code enthält integrierte Tools, die das Modell verwendet, um mit deiner lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Tools erweitern die Funktionen der CLI und ermöglichen es ihr, über die reine Textgenerierung hinauszugehen und bei einer Vielzahl von Aufgaben zu unterstützen.

## Übersicht der Qwen Code Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, deren Ausführung das Modell anfordern kann. Wenn du das Modell beispielsweise bittest, „den Inhalt von `my_document.txt` zusammenzufassen“, wird es wahrscheinlich erkennen, dass diese Datei gelesen werden muss, und die Ausführung des `read_file`-Tools anfordern.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, stellt dem Modell ihre Definitionen (Schemas) bereit, führt sie bei Anfrage aus und gibt die Ergebnisse an das Modell zurück, um sie weiter zu einer nutzerorientierten Antwort zu verarbeiten.

Diese Tools bieten folgende Funktionen:

- **Auf lokale Informationen zugreifen:** Tools ermöglichen dem Modell den Zugriff auf dein lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Befehle ausführen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsmaßnahmen und Benutzerbestätigung).
- **Mit dem Web interagieren:** Tools können Inhalte von URLs abrufen.
- **Aktionen ausführen:** Tools können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf deinem System durchführen (ebenfalls in der Regel mit Sicherheitsvorkehrungen).
- **Antworten verankern:** Durch den Einsatz von Tools zum Abrufen von Echtzeit- oder spezifischen lokalen Daten können Antworten präziser, relevanter und besser in deinem tatsächlichen Kontext verankert sein.

## So verwendest du Qwen Code Tools

Um Qwen Code Tools zu verwenden, gib einen Prompt in die CLI ein. Der Ablauf ist wie folgt:

1.  Du gibst einen Prompt in die CLI ein.
2.  Die CLI leitet den Prompt an die Kernkomponente weiter.
3.  Die Kernkomponente sendet zusammen mit deinem Prompt und dem Gesprächsverlauf eine Liste der verfügbaren Tools sowie deren Beschreibungen/Schemas an die konfigurierte Modell-API.
4.  Das Modell analysiert deine Anfrage. Wenn es feststellt, dass ein Tool benötigt wird, enthält seine Antwort eine Anfrage zur Ausführung eines bestimmten Tools mit bestimmten Parametern.
5.  Die Kernkomponente empfängt diese Tool-Anfrage, validiert sie und führt das Tool aus (häufig nach einer Benutzerbestätigung bei sensiblen Operationen).
6.  Die Ausgabe des Tools wird zurück an das Modell gesendet.
7.  Das Modell verwendet die Tool-Ausgabe, um seine finale Antwort zu formulieren, die dann über die Kernkomponente zurück an die CLI gesendet und dir angezeigt wird.

In der CLI siehst du Meldungen, die anzeigen, wann ein Tool aufgerufen wird und ob es erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools, insbesondere solche, die dein Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), sind mit Fokus auf Sicherheit konzipiert. Qwen Code wird in der Regel:

- **Bestätigung anfordern:** Dich vor der Ausführung potenziell sensibler Operationen um Bestätigung bitten und dir anzeigen, welche Aktion durchgeführt werden soll.
- **Sandboxing nutzen:** Alle Tools unterliegen den durch Sandboxing erzwungenen Einschränkungen (siehe [Sandboxing in Qwen Code](../sandbox.md)). Das bedeutet, dass im Sandbox-Betrieb alle Tools (einschließlich MCP-Server), die du verwenden möchtest, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die `npx`-Binärdatei im Docker-Image der Sandbox installiert oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, Bestätigungsabfragen immer sorgfältig zu prüfen, bevor du ein Tool fortfahren lässt.

## Weitere Informationen zu den Qwen Code Tools

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[File System Tools](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Suchen usw.).
- **[Shell Tool](./shell.md) (`run_shell_command`):** Für die Ausführung von Shell-Befehlen.
- **[Web Fetch Tool](./web-fetch.md) (`web_fetch`):** Für das Abrufen von Inhalten von URLs.
- **[Multi-File Read Tool](./multi-file.md) (`read_many_files`):** Ein spezialisiertes Tool zum Lesen von Inhalten aus mehreren Dateien oder Verzeichnissen, das häufig vom `@`-Befehl verwendet wird.
- **[Memory Tool](./memory.md) (`save_memory`):** Zum Speichern und Abrufen von Informationen über Sitzungen hinweg.
- **[Todo Write Tool](./todo-write.md) (`todo_write`):** Zum Erstellen und Verwalten strukturierter Aufgabenlisten während Coding-Sessions.
- **[Task Tool](./task.md) (`task`):** Zum Delegieren komplexer Aufgaben an spezialisierte Subagenten.
- **[Exit Plan Mode Tool](./exit-plan-mode.md) (`exit_plan_mode`):** Zum Beenden des Planungsmodus und Fortfahren mit der Implementierung.

Zusätzlich integrieren diese Tools:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP Quick Start Guide](../mcp-quick-start.md)**: Starte in 5 Minuten mit MCP anhand praktischer Beispiele
  - **[MCP Example Configurations](../mcp-example-configs.md)**: Sofort einsatzbereite Konfigurationen für gängige Szenarien
  - **[Web Search via MCP](./web-search.md)**: Verbinde dich über MCP mit Websuchdiensten (Bailian, Tavily, GLM)
  - **[MCP Testing & Validation](../mcp-testing-validation.md)**: Teste und validiere deine MCP-Server-Setups
- **[Sandboxing](../sandbox.md)**: Sandboxing isoliert das Modell und seine Änderungen von deiner Umgebung, um potenzielle Risiken zu minimieren.