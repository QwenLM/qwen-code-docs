# Fork-Subagent-Design

> Impliziter Fork-Subagent, der den vollständigen Konversationskontext des übergeordneten Agents übernimmt und den Prompt-Cache teilt, um eine kosteneffiziente parallele Aufgabenausführung zu ermöglichen.

## Übersicht

Wenn das Agent-Tool ohne `subagent_type` aufgerufen wird, löst es einen impliziten **Fork** aus – einen Hintergrund-Subagenten, der den Konversationsverlauf, den System-Prompt und die Tool-Definitionen des übergeordneten Agents übernimmt. Der Fork verwendet `CacheSafeParams`, um sicherzustellen, dass seine API-Anfragen denselben Präfix wie die des übergeordneten Agents teilen, wodurch DashScope-Prompt-Cache-Treffer ermöglicht werden.

## Architektur

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## Wichtige Komponenten

### 1. FORK_AGENT (`forkSubagent.ts`)

Synthetische Agent-Konfiguration, die nicht in `builtInAgents` registriert ist. Besitzt einen Fallback-`systemPrompt`, verwendet in der Praxis jedoch den gerenderten System-Prompt des übergeordneten Agents über `generationConfigOverride`.

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

### 3. History Construction (`agent.ts` + `forkSubagent.ts`)

Die `extraHistory` des Forks muss mit einer Model-Nachricht enden, um die User/Model-Alternierung der Gemini-API beizubehalten, wenn `agent-headless` den `task_prompt` sendet.

Drei Fälle:

| Verlauf des übergeordneten Agents endet mit | Konstruktion von `extraHistory`                                              | `task_prompt`                    |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model` (ohne Function Calls)   | `[...rawHistory]` (unverändert)                                          | `buildChildMessage(directive)` |
| `model` (mit Function Calls) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user` (ungewöhnlich)              | `rawHistory.slice(0, -1)` (letzten User-Eintrag entfernen)                         | `buildChildMessage(directive)` |

### 4. Recursive Fork Prevention (`forkSubagent.ts`)

`isInForkChild()` durchsucht den Konversationsverlauf nach dem `<fork-boilerplate>`-Tag. Wird es gefunden, wird der Fork-Versuch mit einer Fehlermeldung abgelehnt.

### 5. Background Execution (`agent.ts`)

Der Fork verwendet `void executeSubagent()` (Fire-and-Forget) und gibt `FORK_PLACEHOLDER_RESULT` sofort an den übergeordneten Agent zurück. Fehler im Hintergrundtask werden abgefangen, protokolliert und im Anzeigestatus berücksichtigt.

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

Wenn `getCacheSafeParams()` null zurückgibt (erster Turn, noch kein Verlauf vorhanden), greift der Fork auf Folgendes zurück:

- `FORK_AGENT.systemPrompt` für die Systemanweisung
- `prepareTools()` für die Tool-Deklarationen

Dies stellt sicher, dass der Fork immer funktioniert, auch ohne Cache-Sharing.

## Dateien

| Datei                                                 | Rolle                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | FORK_AGENT-Konfiguration, `buildForkedMessages()`, `isInForkChild()`, `buildChildMessage()`        |
| `packages/core/src/tools/agent.ts`                   | Fork-Pfad: Abruf von `CacheSafeParams`, Konstruktion von `extraHistory`, Hintergrundausführung |
| `packages/core/src/agents/runtime/agent-headless.ts` | `execute()`-Optionen: `generationConfigOverride`, `toolsOverride`                            |
| `packages/core/src/agents/runtime/agent-core.ts`     | `CreateChatOptions.generationConfigOverride`                                            |
| `packages/core/src/followup/forkedQuery.ts`          | `CacheSafeParams`-Infrastruktur (bestehend, keine Änderungen)                                 |