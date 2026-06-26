# Conception du Fork Subagent

> Sous-agent fork implicite qui hérite du contexte complet de la conversation parente et partage le cache de prompt pour une exécution parallèle économique.

## Aperçu

Lorsque l'outil Agent est appelé sans `subagent_type`, il déclenche un **fork** implicite — un sous-agent en arrière-plan qui hérite de l'historique de la conversation parente, du prompt système et des définitions d'outils. Le fork utilise `CacheSafeParams` pour garantir que ses requêtes API partagent le même préfixe que celles du parent, permettant ainsi des hits sur le cache de prompt DashScope.

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

Configuration d'agent synthétique, non enregistrée dans `builtInAgents`. Possède un `systemPrompt` de repli mais utilise en pratique le prompt système rendu du parent via `generationConfigOverride`.

### 2. Intégration CacheSafeParams (`agent.ts` + `forkedQuery.ts`)

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

L'`extraHistory` du fork doit se terminer par un message du modèle pour maintenir l'alternance utilisateur/modèle de l'API Gemini lorsque `agent-headless` envoie le `task_prompt`.

Trois cas :

| L'historique parent se termine par | Construction de extraHistory                                              | task_prompt                    |
| ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| `model` (sans appels de fonction)  | `[...rawHistory]` (inchangé)                                              | `buildChildMessage(directive)` |
| `model` (avec appels de fonction)  | `[...rawHistory, model(clone), user(responses+directive), model(ack)]`    | `'Begin.'`                     |
| `user` (inhabituel)                | `rawHistory.slice(0, -1)` (supprimer le dernier user)                     | `buildChildMessage(directive)` |

### 4. Prévention des forks récursifs (`forkSubagent.ts`)

`isInForkChild()` scanne l'historique de la conversation à la recherche de la balise `<fork-boilerplate>`. Si trouvée, la tentative de fork est rejetée avec un message d'erreur.

### 5. Exécution en arrière-plan (`agent.ts`)

Le fork utilise `void executeSubagent()` (lance et oublie) et retourne immédiatement `FORK_PLACEHOLDER_RESULT` au parent. Les erreurs de la tâche en arrière-plan sont capturées, journalisées et reflétées dans l'état d'affichage.

## Flux de données

```
1. Le modèle appelle l'outil Agent (sans subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: construit extraHistory à partir de getHistory(true) du parent
5. agent.ts: construit forkTaskPrompt (directive ou 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — arrière-plan
8. agent.ts: retourne FORK_PLACEHOLDER_RESULT au parent immédiatement
9. Arrière-plan :
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — utilise la generationConfig du parent (cache partagé)
   c. runReasoningLoop() — utilise les déclarations d'outils du parent
   d. Le fork exécute les outils, produit un résultat
   e. updateDisplay() avec le statut final
```

## Dégradation progressive

Si `getCacheSafeParams()` retourne null (premier tour, pas encore d'historique), le fork utilise comme fallback :

- `FORK_AGENT.systemPrompt` pour l'instruction système
- `prepareTools()` pour les déclarations d'outils

Cela garantit que le fork fonctionne toujours, même sans partage de cache.

## Fichiers

| Fichier                                              | Rôle                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | Configuration de FORK_AGENT, buildForkedMessages(), isInForkChild(), buildChildMessage()   |
| `packages/core/src/tools/agent.ts`                   | Chemin fork : récupération de CacheSafeParams, construction de extraHistory, exécution en arrière-plan |
| `packages/core/src/agents/runtime/agent-headless.ts` | Options de execute() : generationConfigOverride, toolsOverride                             |
| `packages/core/src/agents/runtime/agent-core.ts`     | CreateChatOptions.generationConfigOverride                                                 |
| `packages/core/src/followup/forkedQuery.ts`          | Infrastructure CacheSafeParams (existante, sans changements)                               |