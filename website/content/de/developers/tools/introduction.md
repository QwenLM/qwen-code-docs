# Qwen Code Tools

Qwen Code enthält integrierte Tools, die das Modell verwendet, um mit deiner lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Tools erweitern die Funktionen der CLI und ermöglichen es ihr, über die reine Textgenerierung hinauszugehen und bei einer Vielzahl von Aufgaben zu unterstützen.

## Überblick über die Qwen Code Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, deren Ausführung das Modell anfordern kann. Wenn du das Modell beispielsweise aufforderst, „Fasse den Inhalt von `my_document.txt` zusammen“, erkennt es wahrscheinlich die Notwendigkeit, diese Datei zu lesen, und fordert die Ausführung des `read_file`-Tools an.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, stellt dem Modell ihre Definitionen (Schemas) bereit, führt sie auf Anfrage aus und gibt die Ergebnisse an das Modell zurück, damit es sie zu einer nutzerorientierten Antwort weiterverarbeiten kann.

Diese Tools bieten folgende Funktionen:

- **Zugriff auf lokale Informationen:** Tools ermöglichen dem Modell den Zugriff auf dein lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Befehle ausführen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsvorkehrungen und Bestätigung durch den Nutzer).
- **Mit dem Web interagieren:** Tools können Inhalte von URLs abrufen.
- **Aktionen ausführen:** Tools können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf deinem System durchführen (ebenfalls in der Regel mit Sicherheitsvorkehrungen).
- **Antworten kontextualisieren:** Durch den Einsatz von Tools zum Abrufen von Echtzeit- oder spezifischen lokalen Daten können Antworten genauer, relevanter und besser in deinen tatsächlichen Kontext eingebettet sein.

## So verwendest du die Qwen Code Tools

Um die Qwen Code Tools zu verwenden, gib einen Prompt in die CLI ein. Der Ablauf ist wie folgt:

1.  Du gibst einen Prompt in die CLI ein.
2.  Die CLI leitet den Prompt an den Core weiter.
3.  Der Core sendet zusammen mit deinem Prompt und dem Gesprächsverlauf eine Liste der verfügbaren Tools sowie deren Beschreibungen/Schemas an die konfigurierte Modell-API.
4.  Das Modell analysiert deine Anfrage. Wenn es feststellt, dass ein Tool benötigt wird, enthält seine Antwort eine Anfrage zur Ausführung eines bestimmten Tools mit bestimmten Parametern.
5.  Der Core empfängt diese Tool-Anfrage, validiert sie und führt das Tool aus (häufig nach Bestätigung durch den Nutzer bei sensiblen Operationen).
6.  Die Ausgabe des Tools wird an das Modell zurückgesendet.
7.  Das Modell nutzt die Ausgabe des Tools, um seine finale Antwort zu formulieren, die dann über den Core zurück an die CLI gesendet und dir angezeigt wird.

In der CLI siehst du typischerweise Meldungen, die anzeigen, wann ein Tool aufgerufen wird und ob es erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools, insbesondere solche, die dein Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), sind mit Blick auf die Sicherheit konzipiert. Qwen Code wird in der Regel:

- **Bestätigung erfordern:** Dich vor der Ausführung potenziell sensibler Operationen abfragen und dir anzeigen, welche Aktion durchgeführt werden soll.
- **Sandboxing nutzen:** Alle Tools unterliegen den durch Sandboxing erzwungenen Einschränkungen (siehe [Sandboxing in Qwen Code](../sandbox.md)). Das bedeutet, dass im Sandbox-Betrieb alle Tools (einschließlich MCP-Server), die du verwenden möchtest, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die `npx`-Binärdatei im Docker-Image der Sandbox installiert oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, Bestätigungsabfragen immer sorgfältig zu prüfen, bevor du ein Tool fortfahren lässt.

## Weitere Informationen zu den Qwen Code Tools

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[File System Tools](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Suchen usw.).
- **[Shell Tool](./shell.md) (`run_shell_command`):** Zum Ausführen von Shell-Befehlen.
- **[Web Fetch Tool](./web-fetch.md) (`web_fetch`):** Zum Abrufen von Inhalten von URLs.
- **[Web Search Tool](./web-search.md) (`web_search`):** Für die Websuche.
- **[Multi-File Read Tool](./multi-file.md) (`read_many_files`):** Ein spezialisiertes Tool zum Lesen von Inhalten aus mehreren Dateien oder Verzeichnissen, das häufig vom `@`-Befehl verwendet wird.
- **[Memory Tool](./memory.md) (`save_memory`):** Zum Speichern und Abrufen von Informationen über Sitzungen hinweg.
- **[Todo Write Tool](./todo-write.md) (`todo_write`):** Zum Erstellen und Verwalten strukturierter Aufgabenlisten während Coding-Sessions.
- **[Task Tool](./task.md) (`task`):** Zum Delegieren komplexer Aufgaben an spezialisierte Subagenten.
- **[Exit Plan Mode Tool](./exit-plan-mode.md) (`exit_plan_mode`):** Zum Verlassen des Planungsmodus und Fortfahren mit der Implementierung.

Zusätzlich integrieren diese Tools:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP Quick Start Guide](../mcp-quick-start.md)**: Erste Schritte mit MCP in 5 Minuten anhand praktischer Beispiele
  - **[MCP Example Configurations](../mcp-example-configs.md)**: Sofort einsatzbereite Konfigurationen für gängige Szenarien
  - **[MCP Testing & Validation](../mcp-testing-validation.md)**: Teste und validiere deine MCP-Server-Setups
- **[Sandboxing](../sandbox.md)**: Sandboxing isoliert das Modell und seine Änderungen von deiner Umgebung, um potenzielle Risiken zu minimieren.