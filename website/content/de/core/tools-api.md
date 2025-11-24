# Qwen Code Core: Tools API

Der Qwen Code Core (`packages/core`) bietet ein robustes System zum Definieren, Registrieren und Ausführen von Tools. Diese Tools erweitern die Fähigkeiten des Modells, sodass es mit der lokalen Umgebung interagieren, Webinhalte abrufen und verschiedene Aktionen jenseits der einfachen Textgenerierung durchführen kann.

## Kernkonzepte

- **Tool (`tools.ts`)**: Ein Interface und eine Basisklasse (`BaseTool`), die den Vertrag für alle Tools definiert. Jedes Tool muss folgende Eigenschaften haben:
  - `name`: Ein eindeutiger interner Name (wird in API-Aufrufen an das Modell verwendet).
  - `displayName`: Ein benutzerfreundlicher Name.
  - `description`: Eine klare Erklärung dessen, was das Tool tut – diese wird dem Modell zur Verfügung gestellt.
  - `parameterSchema`: Ein JSON-Schema, das die Parameter beschreibt, die das Tool akzeptiert. Dies ist entscheidend dafür, dass das Modell weiß, wie es das Tool korrekt aufrufen kann.
  - `validateToolParams()`: Eine Methode zur Validierung eingehender Parameter.
  - `getDescription()`: Eine Methode, um eine menschenlesbare Beschreibung dessen bereitzustellen, was das Tool mit bestimmten Parametern tun wird – vor der Ausführung.
  - `shouldConfirmExecute()`: Eine Methode, um festzustellen, ob eine Bestätigung durch den Benutzer vor der Ausführung erforderlich ist (z. B. bei potenziell destruktiven Operationen).
  - `execute()`: Die Kernmethode, die die Aktion des Tools ausführt und ein `ToolResult` zurückgibt.

- **`ToolResult` (`tools.ts`)**: Ein Interface, das die Struktur des Ergebnisses einer Toolausführung definiert:
  - `llmContent`: Der faktische Inhalt, der in den Verlauf aufgenommen wird, der an das LLM zurückgesendet wird, um Kontext zu liefern. Kann ein einfacher String oder ein `PartListUnion` (ein Array aus `Part`-Objekten und Strings) für Rich Content sein.
  - `returnDisplay`: Ein benutzerfreundlicher String (häufig Markdown) oder ein spezielles Objekt (wie `FileDiff`) zur Darstellung in der CLI.

- **Rückgabe von Rich Content**: Tools sind nicht darauf beschränkt, einfachen Text zurückzugeben. Der `llmContent` kann ein `PartListUnion` sein – also ein Array, das sowohl `Part`-Objekte (für Bilder, Audio usw.) als auch `string`s enthalten kann. Dadurch kann eine einzelne Toolausführung mehrere Rich-Content-Elemente zurückgeben.

- **Tool Registry (`tool-registry.ts`)**: Eine Klasse (`ToolRegistry`), die folgende Aufgaben übernimmt:
  - **Registrierung von Tools**: Hält eine Sammlung aller verfügbaren Built-in-Tools (z. B. `ListFiles`, `ReadFile`).
  - **Entdecken von Tools**: Kann auch dynamisch Tools entdecken:
    - **Befehlsbasierte Entdeckung**: Wenn `tools.toolDiscoveryCommand` in den Einstellungen konfiguriert ist, wird dieser Befehl ausgeführt. Es wird erwartet, dass er JSON ausgibt, das benutzerdefinierte Tools beschreibt – diese werden dann als `DiscoveredTool`-Instanzen registriert.
    - **MCP-basierte Entdeckung**: Wenn `mcp.mcpServerCommand` konfiguriert ist, kann sich die Registry mit einem Model Context Protocol (MCP)-Server verbinden, um Tools abzurufen und zu registrieren (`DiscoveredMCPTool`).
  - **Bereitstellung von Schemas**: Stellt die `FunctionDeclaration`-Schemas aller registrierten Tools für das Modell bereit, damit es weiß, welche Tools verfügbar sind und wie sie verwendet werden.
  - **Abrufen von Tools**: Ermöglicht es dem Kernsystem, ein bestimmtes Tool anhand seines Namens zur Ausführung abzurufen.

## Integrierte Tools

Der Core enthält eine Sammlung vordefinierter Tools, die sich üblicherweise in `packages/core/src/tools/` befinden. Dazu gehören:

- **File System Tools:**
  - `ListFiles` (`ls.ts`): Listet den Inhalt eines Verzeichnisses auf.
  - `ReadFile` (`read-file.ts`): Liest den Inhalt einer einzelnen Datei. Akzeptiert einen `absolute_path` Parameter, der ein absoluter Pfad sein muss.
  - `WriteFile` (`write-file.ts`): Schreibt Inhalte in eine Datei.
  - `ReadManyFiles` (`read-many-files.ts`): Liest und verknüpft Inhalte aus mehreren Dateien oder Glob-Patterns (verwendet vom `@` Befehl in der CLI).
  - `Grep` (`grep.ts`): Sucht nach Mustern in Dateien.
  - `Glob` (`glob.ts`): Findet Dateien anhand von Glob-Patterns.
  - `Edit` (`edit.ts`): Führt Änderungen direkt in Dateien durch (benötigt oft eine Bestätigung).
- **Execution Tools:**
  - `Shell` (`shell.ts`): Führt beliebige Shell-Befehle aus (erfordert sorgfältiges Sandboxing und Nutzerbestätigung).
- **Web Tools:**
  - `WebFetch` (`web-fetch.ts`): Ruft Inhalte von einer URL ab.
  - `WebSearch` (`web-search.ts`): Führt eine Websuche durch.
- **Memory Tools:**
  - `SaveMemory` (`memoryTool.ts`): Interagiert mit dem Gedächtnis des KI-Modells.
- **Planning Tools:**
  - `Task` (`task.ts`): Delegiert Aufgaben an spezialisierte Subagenten.
  - `TodoWrite` (`todoWrite.ts`): Erstellt und verwaltet eine strukturierte To-do-Liste.
  - `ExitPlanMode` (`exitPlanMode.ts`): Beendet den Planungsmodus und kehrt zum Normalbetrieb zurück.

Jedes dieser Tools erweitert `BaseTool` und implementiert die erforderlichen Methoden für seine jeweilige Funktionalität.

## Ablauf der Tool-Ausführung

1.  **Modell-Anfrage:** Das Modell entscheidet auf Basis des Benutzerprompts und der bereitgestellten Tool-Schemas, ein Tool zu verwenden, und gibt einen `FunctionCall`-Teil in seiner Antwort zurück, der den Tool-Namen und die Argumente angibt.
2.  **Core erhält Anfrage:** Der Core parst diesen `FunctionCall`.
3.  **Tool-Abruf:** Er sucht das angeforderte Tool in der `ToolRegistry`.
4.  **Parameter-Validierung:** Die Methode `validateToolParams()` des Tools wird aufgerufen.
5.  **Bestätigung (falls erforderlich):**
    - Die Methode `shouldConfirmExecute()` des Tools wird aufgerufen.
    - Falls diese Details zur Bestätigung zurückgibt, kommuniziert der Core dies an die CLI zurück, welche den Benutzer dann zur Eingabe auffordert.
    - Die Entscheidung des Benutzers (z. B. fortfahren, abbrechen) wird an den Core gesendet.
6.  **Ausführung:** Wenn validiert und bestätigt (oder keine Bestätigung nötig), ruft der Core die Methode `execute()` des Tools mit den übergebenen Argumenten sowie einem `AbortSignal` (für mögliche Abbrüche) auf.
7.  **Ergebnisverarbeitung:** Der `ToolResult` aus `execute()` wird vom Core entgegengenommen.
8.  **Antwort an das Modell:** Der `llmContent` aus dem `ToolResult` wird als `FunctionResponse` verpackt und an das Modell gesendet, damit es seine benutzerseitige Antwort fortsetzen kann.
9.  **Anzeige für den Benutzer:** Der `returnDisplay` aus dem `ToolResult` wird an die CLI gesendet, um dem Benutzer anzuzeigen, was das Tool ausgeführt hat.

## Erweitern mit benutzerdefinierten Tools

Auch wenn die direkte programmatische Registrierung neuer Tools durch Benutzer nicht explizit als primärer Workflow in den bereitgestellten Dateien für typische Endbenutzer beschrieben ist, unterstützt die Architektur Erweiterungen über:

- **Befehlsbasierte Erkennung:** Fortgeschrittene Benutzer oder Projektadministratoren können einen `tools.toolDiscoveryCommand` in der `settings.json` definieren. Dieser Befehl sollte bei Ausführung durch den Core ein JSON-Array von `FunctionDeclaration`-Objekten ausgeben. Der Core stellt diese dann als `DiscoveredTool`-Instanzen zur Verfügung. Der entsprechende `tools.toolCallCommand` ist dann dafür verantwortlich, diese benutzerdefinierten Tools tatsächlich auszuführen.
- **MCP Server:** Für komplexere Szenarien können ein oder mehrere MCP-Server eingerichtet und über die Einstellung `mcpServers` in der `settings.json` konfiguriert werden. Der Core kann dann Tools erkennen und nutzen, die von diesen Servern bereitgestellt werden. Wie bereits erwähnt: Wenn Sie mehrere MCP-Server verwenden, werden die Tool-Namen mit dem Servernamen aus Ihrer Konfiguration vorangestellt (z. B. `serverAlias__actualToolName`).

Dieses Tool-System bietet eine flexible und leistungsstarke Möglichkeit, die Fähigkeiten des Modells zu erweitern und macht Qwen Code zu einem vielseitigen Assistenten für eine breite Palette von Aufgaben.