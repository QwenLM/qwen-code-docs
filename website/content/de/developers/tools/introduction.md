# Qwen-Code-Tools

Qwen Code enthält integrierte Tools, die das Modell nutzt, um mit Ihrer lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Tools erweitern die Funktionalität der CLI und ermöglichen es ihr, über reine Textgenerierung hinauszugehen sowie bei einer breiten Palette von Aufgaben zu unterstützen.

## Übersicht über die Qwen Code-Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, die das Modell anfordern kann, um sie auszuführen. Wenn Sie beispielsweise das Modell auffordern, „den Inhalt von `my_document.txt` zusammenzufassen“, erkennt es wahrscheinlich die Notwendigkeit, diese Datei zu lesen, und fordert die Ausführung des Tools `read_file` an.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, stellt ihre Definitionen (Schemas) dem Modell zur Verfügung, führt sie bei Anforderung aus und gibt die Ergebnisse an das Modell zurück, damit dieses sie weiterverarbeitet und eine Antwort für den Benutzer generiert.

Diese Tools bieten folgende Funktionen:

- **Zugriff auf lokale Informationen:** Tools ermöglichen es dem Modell, auf Ihr lokales Dateisystem zuzugreifen, Dateiinhalte zu lesen, Verzeichnisse aufzulisten usw.
- **Ausführung von Befehlen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (unter Einhaltung angemessener Sicherheitsvorkehrungen und nach vorheriger Bestätigung durch den Benutzer).
- **Interaktion mit dem Web:** Tools können Inhalte von URLs abrufen.
- **Ausführung von Aktionen:** Tools können Dateien ändern, neue Dateien erstellen oder andere Aktionen auf Ihrem System durchführen (in der Regel wiederum unter Einhaltung entsprechender Schutzmaßnahmen).
- **Fundierung von Antworten:** Durch den Einsatz von Tools zum Abrufen aktueller oder spezifischer lokaler Daten werden Antworten genauer, relevanter und stärker an Ihren konkreten Kontext angepasst.

## So verwenden Sie die Qwen-Code-Tools

Um die Qwen-Code-Tools zu nutzen, übergeben Sie eine Eingabeaufforderung (Prompt) an die CLI. Der Ablauf funktioniert wie folgt:

1.  Sie geben eine Eingabeaufforderung an die CLI weiter.
2.  Die CLI sendet die Eingabeaufforderung an den Core.
3.  Der Core sendet zusammen mit Ihrer Eingabeaufforderung und dem Gesprächsverlauf eine Liste der verfügbaren Tools sowie deren Beschreibungen bzw. Schemas an die konfigurierte Modell-API.
4.  Das Modell analysiert Ihre Anfrage. Falls es feststellt, dass ein Tool benötigt wird, enthält seine Antwort eine Aufforderung zur Ausführung eines bestimmten Tools mit bestimmten Parametern.
5.  Der Core empfängt diese Tool-Aufforderung, validiert sie und führt das Tool aus – oft nach einer Bestätigung durch den Benutzer bei sensiblen Operationen.
6.  Die Ausgabe des Tools wird an das Modell zurückgesendet.
7.  Das Modell nutzt die Tool-Ausgabe, um seine endgültige Antwort zu formulieren, die dann über den Core an die CLI weitergeleitet und Ihnen angezeigt wird.

In der Regel sehen Sie in der CLI Nachrichten, die anzeigen, wann ein Tool aufgerufen wird und ob der Aufruf erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools – insbesondere solche, die Ihr Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`) – sind mit Blick auf die Sicherheit konzipiert. Qwen Code verhält sich in der Regel wie folgt:

- **Erfordert eine Bestätigung:** Vor der Ausführung potenziell sensibler Operationen wird Sie zur Bestätigung aufgefordert und Ihnen angezeigt, welche Aktion gerade ausgeführt werden soll.  
- **Nutzt Sandboxing:** Alle Tools unterliegen den durch Sandboxing auferlegten Einschränkungen (siehe [Sandboxing in Qwen Code](../sandbox.md)). Das bedeutet, dass alle Tools (einschließlich MCP-Server), die Sie innerhalb einer Sandbox nutzen möchten, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die ausführbare Datei `npx` entweder im Docker-Image der Sandbox installiert sein oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist stets wichtig, Bestätigungsanfragen sorgfältig zu prüfen, bevor Sie einem Tool die Fortsetzung erlauben.

## Erfahren Sie mehr über die Tools von Qwen Code

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[Dateisystem-Tools](./file-system.md)**: Zum Arbeiten mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Durchsuchen usw.).
- **[Shell-Tool](./shell.md) (`run_shell_command`)**: Zum Ausführen von Shell-Befehlen.
- **[Web-Fetch-Tool](./web-fetch.md) (`web_fetch`)**: Zum Abrufen von Inhalten von URLs.
- **[Web-Such-Tool](./web-search.md) (`web_search`)**: Zum Durchsuchen des Internets.
- **[Multi-File-Read-Tool](./multi-file.md) (`read_many_files`)**: Ein spezialisiertes Tool zum Lesen von Inhalten aus mehreren Dateien oder Verzeichnissen, das häufig vom `@`-Befehl verwendet wird.
- **[Memory-Tool](./memory.md) (`save_memory`)**: Zum Speichern und Abrufen von Informationen über mehrere Sitzungen hinweg.
- **[Todo-Write-Tool](./todo-write.md) (`todo_write`)**: Zum Erstellen und Verwalten strukturierter Aufgabenlisten während der Codiersitzungen.
- **[Task-Tool](./task.md) (`task`)**: Zum Delegieren komplexer Aufgaben an spezialisierte Unterautoren.
- **[Exit-Plan-Mode-Tool](./exit-plan-mode.md) (`exit_plan_mode`)**: Zum Verlassen des Planungsmodus und Fortsetzen der Implementierung.

Zusätzlich umfassen diese Tools:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP-Schnellstartanleitung](../mcp-quick-start.md)**: Starten Sie innerhalb von 5 Minuten mit praktischen Beispielen in MCP durch.
  - **[MCP-Beispielkonfigurationen](../mcp-example-configs.md)**: Sofort einsatzbereite Konfigurationen für gängige Szenarien.
  - **[MCP-Test- und Validierungshandbuch](../mcp-testing-validation.md)**: Testen und validieren Sie Ihre MCP-Server-Konfigurationen.
- **[Sandboxing](../sandbox.md)**: Sandboxing isoliert das Modell und dessen Änderungen von Ihrer Umgebung, um potenzielle Risiken zu verringern.