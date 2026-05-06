# Implementierungsplan für die Agent-Tool-Anzeige

> **Für Claude:** ERFORDERLICHE SUB-SKILL: Verwende `superpowers:executing-plans`, um diesen Plan Schritt für Schritt umzusetzen.

**Ziel:** Füge eine dedizierte VSCode/Web-UI-Anzeige für Agent-Tool-Ausführungen hinzu, damit Fortschritt, Zusammenfassungen und Fehler von Subagenten aus strukturiertem `rawOutput` gerendert werden, anstatt auf die generische Tool-Karte zurückzufallen.

**Architektur:** Bewahre ACP-`rawOutput` durch die VSCode-Session/Update-Pipeline in `ToolCallData`. Lass dann den gemeinsamen Web-UI-Router `task_execution`-Payloads erkennen und eine dedizierte `AgentToolCall`-Komponente rendern. Halte die Änderung in `packages/webui` gemeinsam, damit VSCode und `ChatViewer` synchron bleiben.

**Tech Stack:** TypeScript, React, Vitest, gemeinsame `@qwen-code/webui` Tool-Call-Komponenten.

### Task 1: Failing Data-Flow-Verhalten absichern

**Dateien:**

- Ändern: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Erstellen: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Schritt 1: Failing Tests schreiben**

- Füge einen Session-Handler-Test hinzu, der bestätigt, dass `tool_call_update` `rawOutput` weiterleitet, wenn ACP ein `task_execution`-Payload sendet.
- Füge einen Hook-Test hinzu, der bestätigt, dass `useToolCalls` `rawOutput` für einen Agent-Tool-Call speichert und aktualisiert.

**Schritt 2: Test ausführen, um das Fehlschlagen zu verifizieren**

Ausführen: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Erwartet: Fehler, da `rawOutput` in der aktuellen Handler/Hook-Pipeline nicht erhalten bleibt.

### Task 2: Failing Renderer-Verhalten absichern

**Dateien:**

- Erstellen: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Schritt 1: Failing Test schreiben**

- Rendere den gerouteten Tool-Call mit `kind: 'other'` sowie `rawOutput.type === 'task_execution'`.
- Bestätige, dass Aufgabenbeschreibung, aktives Child-Tool, Zusammenfassung und Fehlergrund aus einer dedizierten Agent-Anzeige statt aus generischer Textausgabe gerendert werden.

**Schritt 2: Test ausführen, um das Fehlschlagen zu verifizieren**

Ausführen: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Erwartet: Fehler, da der Router nur auf `kind` prüft und keine dedizierte Agent-Komponente existiert.

### Task 3: Strukturierte Agent-Ausgabe End-to-End erhalten

**Dateien:**

- Ändern: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Ändern: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Ändern: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Ändern: `packages/webui/src/components/toolcalls/shared/types.ts`

**Schritt 1: Minimale Änderungen am Datenmodell implementieren**

- Füge optionales `rawOutput` zu den VSCode-Session/Webview-Tool-Call-Typen hinzu.
- Leite `rawOutput` in `QwenSessionUpdateHandler` weiter.
- Speichere/merge `rawOutput` in `useToolCalls`.
- Mache `rawOutput` in den gemeinsamen Web-UI-Tool-Call-Datentypen verfügbar.

**Schritt 2: Fokussierte Tests ausführen**

Ausführen: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Erwartet: Erfolgreich.

### Task 4: Gemeinsame Agent-Tool-Call-UI hinzufügen

**Dateien:**

- Erstellen: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Ändern: `packages/webui/src/components/toolcalls/index.ts`
- Ändern: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Ändern: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Schritt 1: Minimalen Renderer implementieren**

- Füge eine Guard-Bedingung für `rawOutput.type === 'task_execution'` hinzu.
- Rendere die Aufgabenbeschreibung als Header.
- Zeige Agent-Name + Status, aktuell laufende Child-Tools, Abschluss-Zusammenfassung sowie Fehler-/Abbruchgrund an.
- Halte das Layout kompatibel mit mehreren parallelen Agent-Karten, indem jeder Tool-Call unabhängig gerendert wird.

**Schritt 2: Fokussierten Renderer-Test ausführen**

Ausführen: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Erwartet: Erfolgreich.

### Task 5: Integrierte Oberfläche verifizieren

**Dateien:**

- Ändern: `packages/webui/src/index.ts`

**Schritt 1: Neue gemeinsame Komponente bei Bedarf exportieren**

- Re-exportiere alle neuen Komponenten/Typen, die von VSCode oder `ChatViewer` benötigt werden.

**Schritt 2: Package-Verifizierung ausführen**

Ausführen: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Ausführen: `npm run check-types --workspace=packages/vscode-ide-companion`
Ausführen: `npm run typecheck --workspace=packages/webui`

Erwartet: Alle gezielten Tests und Typechecks sind erfolgreich.