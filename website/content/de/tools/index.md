# Qwen Code Tools

Qwen Code enthält integrierte Tools, die das Modell verwendet, um mit deiner lokalen Umgebung zu interagieren, Informationen abzurufen und Aktionen auszuführen. Diese Tools erweitern die Fähigkeiten der CLI und ermöglichen es, über die reine Textgenerierung hinauszugehen und bei einer Vielzahl von Aufgaben zu unterstützen.

## Überblick über Qwen Code Tools

Im Kontext von Qwen Code sind Tools spezifische Funktionen oder Module, die das Modell anfordern kann, um ausgeführt zu werden. Wenn du zum Beispiel das Modell bittest, „die Inhalte von `my_document.txt` zu zusammenzufassen“, wird es wahrscheinlich erkennen, dass es diese Datei lesen muss, und anschließend das `read_file`-Tool anfordern.

Die Kernkomponente (`packages/core`) verwaltet diese Tools, stellt deren Definitionen (Schemas) dem Modell zur Verfügung, führt sie bei Anforderung aus und gibt die Ergebnisse an das Modell zurück, damit diese in eine benutzerfreundliche Antwort weiterverarbeitet werden können.

Diese Tools bieten folgende Funktionen:

- **Zugriff auf lokale Informationen:** Tools ermöglichen dem Modell den Zugriff auf dein lokales Dateisystem, das Lesen von Dateiinhalten, das Auflisten von Verzeichnissen usw.
- **Ausführen von Befehlen:** Mit Tools wie `run_shell_command` kann das Modell Shell-Befehle ausführen (mit entsprechenden Sicherheitsmaßnahmen und Benutzerbestätigung).
- **Interaktion mit dem Web:** Tools können Inhalte von URLs abrufen.
- **Aktionen durchführen:** Tools können Dateien ändern, neue Dateien schreiben oder andere Aktionen auf deinem System ausführen (in der Regel mit Sicherheitsvorkehrungen).
- **Antworten kontextbasiert gestalten:** Durch den Einsatz von Tools, um Echtzeit- oder lokale Daten abzurufen, können die Antworten präziser, relevanter und besser an deinen tatsächlichen Kontext angepasst sein.

## Wie man Qwen Code Tools verwendet

Um die Qwen Code Tools zu verwenden, gib einen Prompt an die CLI weiter. Der Prozess funktioniert wie folgt:

1. Du gibst einen Prompt an die CLI ein.
2. Die CLI sendet den Prompt an den Core.
3. Der Core sendet zusammen mit deinem Prompt und dem Konversationsverlauf eine Liste der verfügbaren Tools sowie deren Beschreibungen/Schemas an die konfigurierte Model API.
4. Das Modell analysiert deine Anfrage. Falls es feststellt, dass ein Tool benötigt wird, enthält seine Antwort eine Anforderung zur Ausführung eines bestimmten Tools mit spezifischen Parametern.
5. Der Core empfängt diese Tool-Anfrage, validiert sie und führt das Tool aus (häufig nach einer Bestätigung durch den Benutzer bei sensiblen Operationen).
6. Die Ausgabe des Tools wird zurück an das Modell gesendet.
7. Das Modell verwendet die Tool-Ausgabe, um seine endgültige Antwort zu formulieren, welche dann über den Core an die CLI zurückgesendet und dir angezeigt wird.

In der Regel wirst du in der CLI Meldungen sehen, die anzeigen, wann ein Tool aufgerufen wird und ob der Aufruf erfolgreich war oder fehlgeschlagen ist.

## Sicherheit und Bestätigung

Viele Tools, insbesondere solche, die dein Dateisystem ändern oder Befehle ausführen können (`write_file`, `edit`, `run_shell_command`), sind mit Sicherheit im Hinterkopf entwickelt. Qwen Code wird typischerweise:

- **Bestätigung erfordern:** Dich vor dem Ausführen potenziell sensibler Operationen um Bestätigung bitten und dir zeigen, welche Aktion als nächstes durchgeführt wird.
- **Sandboxing nutzen:** Alle Tools unterliegen Einschränkungen, die durch Sandboxing erzwungen werden (siehe [Sandboxing in Qwen Code](../sandbox.md)). Das bedeutet, dass bei der Ausführung in einer Sandbox alle Tools (einschließlich MCP-Server), die du verwenden möchtest, _innerhalb_ der Sandbox-Umgebung verfügbar sein müssen. Um beispielsweise einen MCP-Server über `npx` auszuführen, muss die `npx`-Executable innerhalb des Docker-Images der Sandbox installiert oder in der `sandbox-exec`-Umgebung verfügbar sein.

Es ist wichtig, die Bestätigungsdialoge stets sorgfältig zu prüfen, bevor du einem Tool erlaubst fortzufahren.

## Erfahre mehr über Qwen Codes Tools

Die integrierten Tools von Qwen Code lassen sich grob wie folgt kategorisieren:

- **[File System Tools](./file-system.md):** Für die Interaktion mit Dateien und Verzeichnissen (Lesen, Schreiben, Auflisten, Suchen, etc.).
- **[Shell Tool](./shell.md) (`run_shell_command`):** Zum Ausführen von Shell-Befehlen.
- **[Web Fetch Tool](./web-fetch.md) (`web_fetch`):** Zum Abrufen von Inhalten von URLs.
- **[Web Search Tool](./web-search.md) (`web_search`):** Zum Durchsuchen des Webs.
- **[Multi-File Read Tool](./multi-file.md) (`read_many_files`):** Ein spezialisiertes Tool zum Lesen von Inhalten aus mehreren Dateien oder Verzeichnissen, häufig verwendet vom `@` Befehl.
- **[Memory Tool](./memory.md) (`save_memory`):** Zum Speichern und Abrufen von Informationen über mehrere Sitzungen hinweg.

Zusätzlich integrieren diese Tools:

- **[MCP servers](./mcp-server.md)**: MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.
- **[Sandboxing](../sandbox.md)**: Sandboxing isoliert das Modell und dessen Änderungen von deiner Umgebung, um potenzielle Risiken zu reduzieren.