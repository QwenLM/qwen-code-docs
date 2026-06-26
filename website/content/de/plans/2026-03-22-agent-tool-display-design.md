# Implementierungsplan für die Agent-Tool-Anzeige

> **Für Claude:** ERFORDERLICHE SUB-FÄHIGKEIT: Verwende superpowers:executing-plans, um diesen Plan Aufgabe für Aufgabe umzusetzen.

**Ziel:** Füge eine dedizierte VSCode/Web-UI-Anzeige für Agent-Tool-Ausführungen hinzu, sodass Fortschritte von Subagenten, Zusammenfassungen und Fehler aus strukturiertem `rawOutput` gerendert werden, anstatt auf die generische Tool-Karte zurückzufallen.

**Architektur:** Bewahre ACP `rawOutput` durch die VSCode-Session/Update-Pipeline in `ToolCallData`, dann lasse den gemeinsamen Web-UI-Router `task_execution`-Payloads erkennen und eine dedizierte `AgentToolCall`-Komponente rendern. Halte die Änderung gemeinsam in `packages/webui`, sodass VSCode und `ChatViewer` abgestimmt bleiben.

**Tech Stack:** TypeScript, React, Vitest, shared `@qwen-code/webui` tool-call components.

### Aufgabe 1: Das fehlschlagende Datenflussverhalten festlegen

**Dateien:**

- Ändern: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Erstellen: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Schritt 1: Schreibe die fehlschlagenden Tests**

- Füge einen Session-Handler-Test hinzu, der bestätigt, dass `tool_call_update` `rawOutput` weiterleitet, wenn ACP einen `task_execution`-Payload sendet.
- Füge einen Hook-Test hinzu, der bestätigt, dass `useToolCalls` `rawOutput` für einen Agent-Tool-Aufruf speichert und aktualisiert.

**Schritt 2: Führe den Test aus, um zu überprüfen, dass er fehlschlägt**

Führe aus: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Erwartet: Fehlschläge, da `rawOutput` in der aktuellen Handler/Hook-Pipeline nicht erhalten bleibt.

### Aufgabe 2: Das fehlschlagende Renderer-Verhalten festlegen

**Dateien:**

- Erstellen: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Schritt 1: Schreibe den fehlschlagenden Test**

- Rendere den gerouteten Tool-Aufruf mit `kind: 'other'` plus `rawOutput.type === 'task_execution'`.
- Bestätige, dass die Aufgabenbeschreibung, das aktive Kind-Tool, die Zusammenfassung und der Fehlergrund aus einer dedizierten Agent-Anzeige statt aus generischer Textausgabe stammen.

**Schritt 2: Führe den Test aus, um zu überprüfen, dass er fehlschlägt**

Führe aus: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Erwartet: Fehlschlag, weil der Router nur auf `kind` prüft und keine dedizierte Agent-Komponente existiert.

### Aufgabe 3: Strukturierte Agentenausgabe durchgängig erhalten

**Dateien:**

- Ändern: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Ändern: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Ändern: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Ändern: `packages/webui/src/components/toolcalls/shared/types.ts`

**Schritt 1: Implementiere die minimalen Datenmodell-Änderungen**

- Füge optionales `rawOutput` zu den VSCode-Session/Webview-Tool-Call-Typen hinzu.
- Leite `rawOutput` in `QwenSessionUpdateHandler` weiter.
- Speichere/führe `rawOutput` in `useToolCalls` zusammen.
- Mache `rawOutput` in den gemeinsamen Web-UI-Tool-Call-Datentypen verfügbar.

**Schritt 2: Führe die fokussierten Tests aus**

Führe aus: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Erwartet: Bestanden.

### Aufgabe 4: Die gemeinsame Agent-Tool-Call-UI hinzufügen

**Dateien:**

- Erstellen: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Ändern: `packages/webui/src/components/toolcalls/index.ts`
- Ändern: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Ändern: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Schritt 1: Implementiere den minimalen Renderer**

- Füge eine Abfrage für `rawOutput.type === 'task_execution'` hinzu.
- Zeige die Aufgabenbeschreibung als Kopfzeile.
- Zeige Agent-Name + Status, aktuell laufende Kind-Tools, Abschlusszusammenfassung und Fehler-/Abbruchgrund.
- Halte das Layout kompatibel mit mehreren parallelen Agent-Karten, indem jeder Tool-Aufruf unabhängig gerendert wird.

**Schritt 2: Führe den fokussierten Renderer-Test aus**

Führe aus: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Erwartet: Bestanden.

### Aufgabe 5: Die integrierte Oberfläche verifizieren

**Dateien:**

- Ändern: `packages/webui/src/index.ts`

**Schritt 1: Exportiere die neue gemeinsame Komponente falls nötig**

- Exportiere alle neuen Komponenten/Typen erneut, die von VSCode oder `ChatViewer` benötigt werden.

**Schritt 2: Führe die Paketverifizierung aus**

Führe aus: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Führe aus: `npm run check-types --workspace=packages/vscode-ide-companion`
Führe aus: `npm run typecheck --workspace=packages/webui`

Erwartet: Alle gezielten Tests und Typprüfungen bestehen.