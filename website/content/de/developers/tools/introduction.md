# Qwen Code Tools

Qwen Code enthält integrierte Tools, die das Modell verwendet, um mit Ihrer lokalen Umgebung zu interagieren, auf Informationen zuzugreifen und Aktionen auszuführen. Diese Tools erweitern die Fähigkeiten der CLI und ermöglichen es, über die reine Textgenerierung hinauszugehen und bei einer Vielzahl von Aufgaben zu unterstützen.

## Übersicht über Qwen Code-Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, die das Modell anfordern kann, um ausgeführt zu werden. Wenn du das Modell zum Beispiel bittest, „die Inhalte von `my_document.txt` zusammenzufassen“, wird es wahrscheinlich erkennen, dass es diese Datei lesen muss, und anschließend das `read_file`-Tool ausführen wollen.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, stellt deren Definitionen (Schemas) dem Modell zur Verfügung, führt sie bei Anforderung aus und gibt die Ergebnisse an das Modell zurück, damit diese weiter verarbeitet und in eine benutzerfreundliche Antwort umgewandelt werden können.

Diese Tools bieten folgende Möglichkeiten:

- **Zugriff auf lokale Informationen:** Tools ermöglichen dem Modell den Zugriff auf dein lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Befehle ausführen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsmaßnahmen und Benutzerbestätigung).
- **Interaktion mit dem Web:** Tools können Inhalte von URLs abrufen.
- **Aktionen durchführen:** Tools können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf deinem System durchführen (auch hier typischerweise mit Schutzmechanismen).
- **Antworten kontextualisieren:** Durch den Einsatz von Tools, um Echtzeit- oder spezifische lokale Daten abzurufen, können Antworten präziser, relevanter und besser an deinen tatsächlichen Kontext angepasst sein.

## Verwendung der Qwen Code-Tools

Um die Qwen Code-Tools zu verwenden, gib einen Prompt an die CLI weiter. Der Ablauf funktioniert wie folgt:

1. Du übergibst einen Prompt an die CLI.
2. Die CLI sendet den Prompt an den Core.
3. Der Core sendet zusammen mit deinem Prompt und dem Konversationsverlauf eine Liste der verfügbaren Tools sowie deren Beschreibungen/Schemas an die konfigurierte Modell-API.
4. Das Modell analysiert deine Anfrage. Falls festgestellt wird, dass ein Tool benötigt wird, enthält seine Antwort eine Anforderung zur Ausführung eines bestimmten Tools mit spezifischen Parametern.
5. Der Core empfängt diese Tool-Anforderung, validiert sie und führt das Tool aus (häufig nach einer Bestätigung durch den Benutzer bei sensiblen Vorgängen).
6. Die Ausgabe des Tools wird zurück an das Modell gesendet.
7. Das Modell verwendet die Tool-Ausgabe, um seine endgültige Antwort zu formulieren, welche dann über den Core an die CLI zurückgesendet und dir angezeigt wird.

In der Regel wirst du in der CLI Nachrichten sehen, die anzeigen, wann ein Tool aufgerufen wird und ob es erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools, insbesondere solche, die Ihr Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), sind mit Bedacht auf Sicherheit entworfen. Qwen Code wird typischerweise:

- **Bestätigung erfordern:** Sie werden vor dem Ausführen potenziell sensibler Operationen gefragt und sehen, welche Aktion als nächstes durchgeführt wird.
- **Sandboxing nutzen:** Alle Tools unterliegen Einschränkungen, die durch Sandboxing erzwungen werden (siehe [Sandboxing in Qwen Code](../sandbox.md)). Das bedeutet, dass bei der Ausführung innerhalb einer Sandbox alle Tools (einschließlich MCP-Server), die Sie verwenden möchten, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` zu starten, muss die `npx`-Executable innerhalb des Docker-Images der Sandbox installiert oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, Bestätigungsdialoge stets sorgfältig zu prüfen, bevor Sie einem Tool erlauben fortzufahren.

## Erfahren Sie mehr über die Tools von Qwen Code

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[Dateisystem-Tools](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Suchen usw.).
- **[Shell-Tool](./shell.md) (`run_shell_command`):** Zum Ausführen von Shell-Befehlen.
- **[Web-Fetch-Tool](./web-fetch.md) (`web_fetch`):** Zum Abrufen von Inhalten von URLs.
- **[Websuch-Tool](./web-search.md) (`web_search`):** Zum Durchsuchen des Webs.
- **[Multi-File-Read-Tool](./multi-file.md) (`read_many_files`):** Ein spezialisiertes Tool zum Lesen von Inhalten aus mehreren Dateien oder Verzeichnissen, häufig verwendet vom `@`-Befehl.
- **[Speicher-Tool](./memory.md) (`save_memory`):** Zum Speichern und Abrufen von Informationen über Sitzungen hinweg.
- **[Todo-Write-Tool](./todo-write.md) (`todo_write`):** Zum Erstellen und Verwalten strukturierter Aufgabenlisten während Codiersitzungen.
- **[Task-Tool](./task.md) (`task`):** Zum Delegieren komplexer Aufgaben an spezialisierte Subagenten.
- **[Exit-Plan-Mode-Tool](./exit-plan-mode.md) (`exit_plan_mode`):** Zum Verlassen des Planmodus und Fortfahren mit der Implementierung.

Zusätzlich integrieren diese Tools:

- **[MCP-Server](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.
  - **[MCP-Schnellstart-Anleitung](../mcp-quick-start.md)**: Starten Sie in 5 Minuten mit praktischen Beispielen mit MCP
  - **[MCP-Beispielkonfigurationen](../mcp-example-configs.md)**: Sofort einsatzbereite Konfigurationen für gängige Szenarien
  - **[MCP-Testing & Validierung](../mcp-testing-validation.md)**: Testen und validieren Sie Ihre MCP-Server-Einrichtungen
- **[Sandboxing](../sandbox.md)**: Sandboxing isoliert das Modell und dessen Änderungen von Ihrer Umgebung, um potenzielle Risiken zu reduzieren.