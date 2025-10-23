# Qwen Code Core: Tools API

Der Qwen Code Core (`packages/core`) bietet ein robustes System zum Definieren, Registrieren und Ausführen von Tools. Diese Tools erweitern die Fähigkeiten des Modells, sodass es mit der lokalen Umgebung interagieren, Webinhalte abrufen und verschiedene Aktionen jenseits der einfachen Textgenerierung durchführen kann.

## Core Concepts

- **Tool (`tools.ts`)**: Ein Interface und eine Basisklasse (`BaseTool`), die den Vertrag für alle Tools definiert. Jedes Tool muss folgende Eigenschaften haben:
  - `name`: Ein eindeutiger interner Name (wird in API-Aufrufen an das Modell verwendet).
  - `displayName`: Ein benutzerfreundlicher Name.
  - `description`: Eine klare Erklärung dessen, was das Tool tut – diese wird dem Modell zur Verfügung gestellt.
  - `parameterSchema`: Ein JSON-Schema, das die Parameter definiert, die das Tool akzeptiert. Dies ist entscheidend, damit das Modell weiß, wie es das Tool korrekt aufrufen kann.
  - `validateToolParams()`: Eine Methode zur Validierung eingehender Parameter.
  - `getDescription()`: Eine Methode, die eine menschenlesbare Beschreibung liefert, was das Tool mit bestimmten Parametern vor der Ausführung tun wird.
  - `shouldConfirmExecute()`: Eine Methode, um festzustellen, ob eine Bestätigung durch den Benutzer vor der Ausführung erforderlich ist (z. B. bei potenziell destruktiven Operationen).
  - `execute()`: Die Kernmethode, die die Aktion des Tools ausführt und ein `ToolResult` zurückgibt.

- **`ToolResult` (`tools.ts`)**: Ein Interface, das die Struktur des Ergebnisses einer Toolausführung definiert:
  - `llmContent`: Der faktische Inhalt, der in den Verlauf aufgenommen wird, der an das LLM zurückgesendet wird, um Kontext bereitzustellen. Dies kann ein einfacher String oder ein `PartListUnion` (ein Array aus `Part`-Objekten und Strings) für Rich Content sein.
  - `returnDisplay`: Ein benutzerfreundlicher String (häufig Markdown) oder ein spezielles Objekt (wie `FileDiff`) zur Anzeige in der CLI.

- **Rich Content zurückgeben**: Tools sind nicht darauf beschränkt, einfachen Text zurückzugeben. Der `llmContent` kann ein `PartListUnion` sein – also ein Array, das sowohl `Part`-Objekte (für Bilder, Audio usw.) als auch `string`s enthalten kann. Dadurch kann eine einzelne Toolausführung mehrere Rich Content-Elemente zurückgeben.

- **Tool Registry (`tool-registry.ts`)**: Eine Klasse (`ToolRegistry`), die folgende Aufgaben übernimmt:
  - **Tools registrieren**: Hält eine Sammlung aller verfügbaren Built-in-Tools (z. B. `ReadFileTool`, `ShellTool`).
  - **Tools entdecken**: Kann auch dynamisch Tools entdecken:
    - **Befehlsbasierte Entdeckung**: Wenn `tools.toolDiscoveryCommand` in den Einstellungen konfiguriert ist, wird dieser Befehl ausgeführt. Es wird erwartet, dass er JSON ausgibt, das benutzerdefinierte Tools beschreibt, die dann als `DiscoveredTool`-Instanzen registriert werden.
    - **MCP-basierte Entdeckung**: Wenn `mcp.mcpServerCommand` konfiguriert ist, kann die Registry sich mit einem Model Context Protocol (MCP)-Server verbinden, um Tools aufzulisten und zu registrieren (`DiscoveredMCPTool`).
  - **Schemas bereitstellen**: Stellt die `FunctionDeclaration`-Schemas aller registrierten Tools für das Modell bereit, damit es weiß, welche Tools verfügbar sind und wie sie verwendet werden.
  - **Tools abrufen**: Ermöglicht es dem Core, ein bestimmtes Tool anhand des Namens zur Ausführung abzurufen.

## Built-in Tools

Der Core enthält eine Sammlung vordefinierter Tools, die sich typischerweise in `packages/core/src/tools/` befinden. Dazu gehören:

- **File System Tools:**
  - `LSTool` (`ls.ts`): Listet den Inhalt eines Verzeichnisses auf.
  - `ReadFileTool` (`read-file.ts`): Liest den Inhalt einer einzelnen Datei. Akzeptiert einen `absolute_path`-Parameter, der ein absoluter Pfad sein muss.
  - `WriteFileTool` (`write-file.ts`): Schreibt Inhalte in eine Datei.
  - `GrepTool` (`grep.ts`): Sucht nach Mustern in Dateien.
  - `GlobTool` (`glob.ts`): Findet Dateien anhand von Glob-Patterns.
  - `EditTool` (`edit.ts`): Führt Änderungen direkt in Dateien durch (oft mit Bestätigungsabfrage).
  - `ReadManyFilesTool` (`read-many-files.ts`): Liest und verknüpft Inhalte aus mehreren Dateien oder Glob-Patterns (verwendet vom `@`-Befehl in der CLI).
- **Execution Tools:**
  - `ShellTool` (`shell.ts`): Führt beliebige Shell-Befehle aus (erfordert sorgfältige Sandbox-Konfiguration und Nutzerbestätigung).
- **Web Tools:**
  - `WebFetchTool` (`web-fetch.ts`): Ruft Inhalte von einer URL ab.
  - `WebSearchTool` (`web-search.ts`): Führt eine Websuche durch.
- **Memory Tools:**
  - `MemoryTool` (`memoryTool.ts`): Interagiert mit dem Gedächtnis des KI-Modells.

Jedes dieser Tools erweitert `BaseTool` und implementiert die erforderlichen Methoden für seine jeweilige Funktionalität.

## Tool Execution Flow

1.  **Model Request:** Das Modell entscheidet auf Basis des User-Prompts und der bereitgestellten Tool-Schemas, ein Tool zu verwenden, und gibt einen `FunctionCall`-Teil in seiner Response zurück, der den Tool-Namen und die Argumente angibt.
2.  **Core empfängt Request:** Das Core parsed diesen `FunctionCall`.
3.  **Tool-Abruf:** Es sucht das angeforderte Tool in der `ToolRegistry`.
4.  **Parameter-Validierung:** Die `validateToolParams()`-Methode des Tools wird aufgerufen.
5.  **Bestätigung (falls nötig):**
    - Die `shouldConfirmExecute()`-Methode des Tools wird aufgerufen.
    - Falls diese Details zur Bestätigung zurückgibt, kommuniziert das Core dies zurück an die CLI, welche den User dann zur Eingabe auffordert.
    - Die Entscheidung des Users (z. B. fortfahren, abbrechen) wird an das Core zurückgesendet.
6.  **Ausführung:** Falls validiert und bestätigt (oder keine Bestätigung nötig), ruft das Core die `execute()`-Methode des Tools mit den übergebenen Argumenten und einem `AbortSignal` (für mögliche Abbrüche) auf.
7.  **Ergebnisverarbeitung:** Das `ToolResult` aus `execute()` wird vom Core entgegengenommen.
8.  **Antwort an das Modell:** Der `llmContent` aus dem `ToolResult` wird als `FunctionResponse` verpackt und an das Modell gesendet, damit es mit der Generierung einer nutzerseitigen Antwort fortfahren kann.
9.  **Anzeige für den User:** Das `returnDisplay` aus dem `ToolResult` wird an die CLI gesendet, um dem User anzuzeigen, was das Tool ausgeführt hat.

## Erweitern mit Custom Tools

Auch wenn die direkte programmatische Registrierung neuer Tools durch Benutzer nicht explizit als primärer Workflow in den bereitgestellten Dateien für typische Endnutzer beschrieben ist, unterstützt die Architektur die Erweiterung durch:

- **Command-basierte Discovery:** Fortgeschrittene Benutzer oder Projektadministratoren können einen `tools.toolDiscoveryCommand` in der `settings.json` definieren. Dieser Befehl sollte bei Ausführung durch den Core ein JSON-Array von `FunctionDeclaration`-Objekten ausgeben. Der Core stellt diese dann als `DiscoveredTool`-Instanzen zur Verfügung. Der entsprechende `tools.toolCallCommand` ist dann dafür verantwortlich, diese Custom Tools tatsächlich auszuführen.
- **MCP Server:** Für komplexere Szenarien können ein oder mehrere MCP-Server eingerichtet und über die `mcpServers`-Einstellung in der `settings.json` konfiguriert werden. Der Core kann dann Tools erkennen und nutzen, die von diesen Servern bereitgestellt werden. Wie bereits erwähnt: Wenn mehrere MCP-Server verwendet werden, werden die Tool-Namen mit dem Server-Alias aus der Konfiguration vorangestellt (z. B. `serverAlias__actualToolName`).

Dieses Tool-System bietet eine flexible und leistungsstarke Möglichkeit, die Fähigkeiten des Modells zu erweitern und macht Qwen Code zu einem vielseitigen Assistenten für eine breite Palette von Aufgaben.