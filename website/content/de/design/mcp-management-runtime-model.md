# MCP-Management-Runtime-Modell

Die MCP-Konfiguration ist die dauerhafte Source-of-Truth. Jede CLI- oder
Web-Session besitzt weiterhin eine unabhängige MCP-Runtime, damit die CLI
nicht von einem Workspace-Management-Prozess abhängt.

Die Web-Management-Seite darf eine optionale Management-Runtime für Status-
und Management-Operationen erzeugen. Konfigurationsändernde Operationen
persistieren zuerst und reconcilen dann jede Live-Runtime im selben
ACP-Prozess. Eine spätere Session lädt die persistierte Konfiguration normal.

Der Management-Status wird vom Client-Manager der Management-Runtime gelesen,
nicht aus der prozessweiten Kompatibilitäts-Status-Map. Die
Kompatibilitäts-Map bleibt für bestehende CLI-Consumer unverändert.
Shared-Pool-Reconnects starten den Pool-Eintrag neu; Nicht-Pool-Reconnects
entdecken den Server in jeder Live-Runtime neu.

Die Server-Herkunft bleibt getrennt: User-Settings, Workspace-Settings,
Projekt-`.mcp.json` und Extensions. Das Deaktivieren von Projekt- oder
Workspace-Servern schreibt den Ausschluss in Workspace-lokale Settings, ohne
die geteilte Projektdatei zu ändern.
