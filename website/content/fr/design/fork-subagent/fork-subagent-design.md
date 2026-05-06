# Conception du sous-agent Fork

> Sous-agent fork implicite qui hérite du contexte de conversation complet du parent et partage le cache de prompt pour une exécution parallèle des tâches optimisée en termes de coût.

## Vue d'ensemble

Lorsque l'outil Agent est appelé sans `subagent_type`, il déclenche un **fork** implicite : un sous-agent en arrière-plan qui hérite de l'historique de conversation, du prompt système et des définitions d'outils du parent. Le fork utilise `CacheSafeParams` pour garantir que ses requêtes API partagent le même préfixe que celles du parent, permettant ainsi des hits dans le cache de prompt DashScope.

## Architecture

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## Composants clés

### 1. FORK_AGENT (`forkSubagent.ts`)

Configuration d'agent synthétique, non enregistrée dans `builtInAgents`. Dispose d'un `systemPrompt` de secours, mais utilise en pratique le prompt système rendu du parent via `generationConfigOverride`.

### 2. Intégration de CacheSafeParams (`agent.ts` + `forkedQuery.ts`)

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

### 3. Construction de l'historique (`agent.ts` + `forkSubagent.ts`)

L'`extraHistory` du fork doit se terminer par un message du modèle pour respecter l'alternance user/model de l'API Gemini lorsque `agent-headless` envoie le `task_prompt`.

Trois cas :

| Fin de l'historique du parent | Construction de `extraHistory` | `task_prompt` |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model` (sans appels de fonction) | `[...rawHistory]` (inchangé) | `buildChildMessage(directive)` |
| `model` (avec appels de fonction) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'` |
| `user` (cas inhabituel) | `rawHistory.slice(0, -1)` (supprime le dernier user) | `buildChildMessage(directive)` |

### 4. Prévention des forks récursifs (`forkSubagent.ts`)

`isInForkChild()` parcourt l'historique de conversation à la recherche de la balise `<fork-boilerplate>`. Si elle est trouvée, la tentative de fork est rejetée avec un message d'erreur.

### 5. Exécution en arrière-plan (`agent.ts`)

Le fork utilise `void executeSubagent()` (fire-and-forget) et retourne immédiatement `FORK_PLACEHOLDER_RESULT` au parent. Les erreurs survenant dans la tâche en arrière-plan sont interceptées, journalisées et reflétées dans l'état d'affichage.

## Flux de données

```
1. Le modèle appelle l'outil Agent (sans `subagent_type`)
2. agent.ts : import de `forkSubagent.js`
3. agent.ts : `getCacheSafeParams()` → `forkGenerationConfig` + `forkToolsOverride`
4. agent.ts : construction de `extraHistory` à partir de `getHistory(true)` du parent
5. agent.ts : construction de `forkTaskPrompt` (directive ou `'Begin.'`)
6. agent.ts : `createAgentHeadless(FORK_AGENT, ...)`
7. agent.ts : `void executeSubagent()` — arrière-plan
8. agent.ts : retour immédiat de `FORK_PLACEHOLDER_RESULT` au parent
9. Arrière-plan :
   a. `AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})`
   b. `AgentCore.createChat()` — utilise le `generationConfig` du parent (cache partagé)
   c. `runReasoningLoop()` — utilise les déclarations d'outils du parent
   d. Le fork exécute les outils et produit un résultat
   e. `updateDisplay()` avec le statut final
```

## Dégradation gracieuse

Si `getCacheSafeParams()` renvoie `null` (premier tour, aucun historique), le fork utilise les valeurs de secours suivantes :

- `FORK_AGENT.systemPrompt` pour l'instruction système
- `prepareTools()` pour les déclarations d'outils

Cela garantit que le fork fonctionne toujours, même sans partage de cache.

## Fichiers

| Fichier | Rôle |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts` | Configuration de `FORK_AGENT`, `buildForkedMessages()`, `isInForkChild()`, `buildChildMessage()` |
| `packages/core/src/tools/agent.ts` | Chemin du fork : récupération de `CacheSafeParams`, construction de `extraHistory`, exécution en arrière-plan |
| `packages/core/src/agents/runtime/agent-headless.ts` | Options de `execute()` : `generationConfigOverride`, `toolsOverride` |
| `packages/core/src/agents/runtime/agent-core.ts` | `CreateChatOptions.generationConfigOverride` |
| `packages/core/src/followup/forkedQuery.ts` | Infrastructure `CacheSafeParams` (existante, aucune modification) |