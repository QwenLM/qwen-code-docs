# Fork Subagent Design

> Impliziter Fork-Subagent, der den gesamten Gesprächskontext des übergeordneten Subagents erbt und den Prompt-Cache für eine kosteneffiziente parallele Aufgabenausführung gemeinsam nutzt.

## Übersicht

Wenn das Agent-Tool ohne `subagent_type` aufgerufen wird, löst es einen impliziten **Fork** aus – einen Hintergrund-Subagenten, der die Gesprächsgeschichte, den System-Prompt und die Tool-Definitionen des übergeordneten Subagents erbt. Der Fork verwendet `CacheSafeParams`, um sicherzustellen, dass seine API-Anfragen dasselbe Präfix wie die des übergeordneten Subagents teilen, was DashScope-Prompt-Cache-Treffer ermöglicht.

## Architektur

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## Schlüsselkomponenten

### 1. FORK_AGENT (`forkSubagent.ts`)

Synthetische Agent-Konfiguration, nicht in `builtInAgents` registriert. Hat einen Fallback-`systemPrompt`, verwendet aber in der Praxis den gerenderten System-Prompt des übergeordneten Subagents über `generationConfigOverride`.

### 2. CacheSafeParams Integration (`agent.ts` + `forkedQuery.ts`)

```
agent.ts (fork path)
  │
  ├── getCacheSafeParams()          ← parent's generationConfig snapshot
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← (not used — we build extraHistory instead)
  │
  ├── forkGenerationConfig          ← passed as generationConfigOverride
  └── forkToolsOverride             ← FunctionDeclaration[] extracted from tools
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← parent conversation history
    generationConfigOverride,       ← parent's exact systemInstruction + tools
    toolsOverride,                  ← parent's exact tool declarations
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← bypasses buildChatSystemPrompt()
  })                                   AND skips getInitialChatHistory()
        │                              (extraHistory already has env context)
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ byte-identical to parent's config
```

### 3. Aufbau des Verlaufs (`agent.ts` + `forkSubagent.ts`)

Der `extraHistory` des Forks muss mit einer Modell-Nachricht enden, um die Benutzer/Modell-Abwechslung der Gemini-API beizubehalten, wenn `agent-headless` den `task_prompt` sendet.

Drei Fälle:

| Ende der übergeordneten Geschichte        | Aufbau von extraHistory                                                                 | task_prompt                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| model (keine Funktionsaufrufe)            | `[...rawHistory]` (unverändert)                                                         | `buildChildMessage(directive)` |
| model (mit Funktionsaufrufen)             | `[...rawHistory, model(clone), user(responses+directive), model(ack)]`                  | `'Begin.'`                     |
| user (ungewöhnlich)                       | `rawHistory.slice(0, -1)` (letzten Benutzer entfernen)                                  | `buildChildMessage(directive)` |

### 4. Rekursive Fork-Verhinderung (`forkSubagent.ts`)

`isInForkChild()` durchsucht die Gesprächsgeschichte nach dem `<fork-boilerplate>`-Tag. Wenn gefunden, wird der Fork-Versuch mit einer Fehlermeldung abgelehnt.

### 5. Hintergrundausführung (`agent.ts`)

Der Fork verwendet `void executeSubagent()` (Feuern und Vergessen) und gibt sofort `FORK_PLACEHOLDER_RESULT` an den übergeordneten Subagenten zurück. Fehler in der Hintergrundaufgabe werden abgefangen, protokolliert und im Anzeigestatus widergespiegelt.

## Datenfluss

```
1. Model calls Agent tool (no subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: build extraHistory from parent's getHistory(true)
5. agent.ts: build forkTaskPrompt (directive or 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — background
8. agent.ts: return FORK_PLACEHOLDER_RESULT to parent immediately
9. Background:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — uses parent's generationConfig (cache-shared)
   c. runReasoningLoop() — uses parent's tool declarations
   d. Fork executes tools, produces result
   e. updateDisplay() with final status
```

## Graceful Degradation

Wenn `getCacheSafeParams()` null zurückgibt (erster Durchlauf, noch kein Verlauf), greift der Fork zurück auf:

- `FORK_AGENT.systemPrompt` für die Systemanweisung
- `prepareTools()` für Tool-Deklarationen

Dies stellt sicher, dass der Fork immer funktioniert, auch ohne Cache-Freigabe.

## Dateien

| Datei                                                    | Rolle                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`       | FORK_AGENT-Konfiguration, buildForkedMessages(), isInForkChild(), buildChildMessage()  |
| `packages/core/src/tools/agent.ts`                       | Fork-Pfad: CacheSafeParams-Abfrage, Aufbau von extraHistory, Hintergrundausführung     |
| `packages/core/src/agents/runtime/agent-headless.ts`     | execute()-Optionen: generationConfigOverride, toolsOverride                            |
| `packages/core/src/agents/runtime/agent-core.ts`         | CreateChatOptions.generationConfigOverride                                             |
| `packages/core/src/followup/forkedQuery.ts`              | CacheSafeParams-Infrastruktur (bestehend, keine Änderungen)                            |