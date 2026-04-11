# Conception du moteur de spéculation

> Exécute de manière spéculative la suggestion acceptée avant la confirmation de l'utilisateur, en utilisant l'isolation des fichiers par copie-sur-écriture. Les résultats s'affichent instantanément lorsque l'utilisateur appuie sur Tab.

## Vue d'ensemble

Lorsqu'une suggestion d'invite est affichée, le **moteur de spéculation** commence immédiatement à l'exécuter en arrière-plan à l'aide d'une instance forkée de `GeminiChat`. Les écritures de fichiers sont dirigées vers un répertoire overlay temporaire. Si l'utilisateur accepte la suggestion, les fichiers de l'overlay sont copiés vers le système de fichiers réel et la conversation spéculative est injectée dans l'historique principal du chat. Si l'utilisateur saisit autre chose, la spéculation est interrompue et l'overlay est nettoyé.

## Architecture

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Speculative Loop (max 20 turns, 100 messages)          │  │
│  │                                                         │  │
│  │  Model response                                         │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → allow (+ overlay read) │   │  │
│  │  │  Edit/WriteFile → redirect to overlay            │   │  │
│  │  │    (only in auto-edit/yolo mode)                 │   │  │
│  │  │  Shell → AST check read-only? allow : boundary   │   │  │
│  │  │  WebFetch/WebSearch → boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → boundary               │   │  │
│  │  │  Unknown/MCP → boundary                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool execution: toolRegistry.getTool → build → execute │  │
│  │  (bypasses CoreToolScheduler — gated by toolGate)       │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  On completion → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  User presses Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ YES                      NO (boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Discard speculation    │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Submit query normally  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  User types instead
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — cancel LLM call               │
│  2. overlayFs.cleanup() — delete temp directory              │
│  3. Update speculation state (no telemetry on abort)         │
└──────────────────────────────────────────────────────────────┘
```

## Overlay en copie-sur-écriture

```
Real CWD: /home/user/project/
Overlay:  /tmp/qwen-speculation/12345/a1b2c3d4/

Write to src/app.ts:
  1. Copy /home/user/project/src/app.ts → overlay/src/app.ts (first time only)
  2. Tool writes to overlay/src/app.ts

Read from src/app.ts:
  - If in writtenFiles → read from overlay/src/app.ts
  - Otherwise → read from /home/user/project/src/app.ts

New file (src/new.ts):
  - Create overlay/src/new.ts directly (no original to copy)

Accept:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abort:
  - rm -rf overlay/
```

## Sécurité de la passerelle d'outils

| Outil                                                      | Action   | Condition                                    |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | autoriser | Chemins de lecture résolus via l'overlay     |
| edit, write_file                                           | rediriger | Uniquement en mode d'approbation auto-edit / yolo |
| edit, write_file                                           | limite   | En mode d'approbation par défaut / plan      |
| shell                                                      | autoriser | `isShellCommandReadOnlyAST()` renvoie true   |
| shell                                                      | limite   | Commandes non en lecture seule               |
| web_fetch, web_search                                      | limite   | Les requêtes réseau nécessitent le consentement de l'utilisateur |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | limite   | Impossible d'interagir avec l'utilisateur pendant la spéculation |
| Outils inconnus / MCP                                      | limite   | Valeur par défaut sécurisée                  |

### Réécriture des chemins

- **Outils d'écriture** : `rewritePathArgs()` redirige `file_path` vers l'overlay via `overlayFs.redirectWrite()`
- **Outils de lecture** : `resolveReadPaths()` redirige `file_path` vers l'overlay via `overlayFs.resolveReadPath()` si écrit précédemment
- **Échec de la réécriture** : Traité comme une limite (ex. : un chemin absolu en dehors du cwd lève une exception dans `redirectWrite`)

## Gestion des limites

Lorsqu'une limite est atteinte au milieu d'un tour :

1. Les appels d'outils déjà exécutés sont conservés (suivi par index, et non par nom)
2. Les appels de fonction non exécutés sont supprimés du message du modèle
3. Les réponses partielles des outils sont ajoutées à l'historique
4. `ensureToolResultPairing()` valide l'exhaustivité avant l'injection

## Suggestion en pipeline

Une fois la spéculation terminée (sans limite), un second appel LLM génère la suggestion **suivante** :

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Cela permet des workflows de type Tab-Tab-Tab où chaque acceptation affiche immédiatement l'étape suivante.

La suggestion en pipeline réutilise la constante exportée `SUGGESTION_PROMPT` de `suggestionGenerator.ts` (et non une copie locale) afin de garantir une qualité cohérente avec les suggestions initiales.

## Modèle rapide

`startSpeculation` accepte un paramètre optionnel `options.model`, propagé via `runSpeculativeLoop` et `generatePipelinedSuggestion` jusqu'à `runForkedQuery`. Il est configuré via le paramètre de premier niveau `fastModel` (vide = utiliser le modèle principal). Le même `fastModel` est utilisé pour toutes les tâches en arrière-plan : génération de suggestions, spéculation et suggestions en pipeline. Défini via `/model --fast <name>` ou `settings.json`.

## Rendu de l'interface utilisateur

Lorsque la spéculation est terminée, `acceptSpeculation` affiche les résultats via `historyManager.addItem()` :

- **Messages utilisateur** : affichés sous forme d'éléments `type: 'user'`
- **Texte du modèle** : affichés sous forme d'éléments `type: 'gemini'`
- **Appels d'outils** : affichés sous forme d'éléments `type: 'tool_group'` avec des entrées structurées `IndividualToolCallDisplay` (nom de l'outil, description des arguments, texte du résultat, statut)

Cela permet à l'utilisateur de voir la sortie complète de la spéculation, y compris les détails des appels d'outils, et pas seulement du texte brut.

## Requête forkée (partage du cache)

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- Sauvegardé après chaque tour principal réussi dans `GeminiClient.sendMessageStream()`
- Effacé lors de `startChat()` / `resetChat()` pour éviter les fuites entre sessions
- Historique tronqué à 40 entrées ; `createForkedChat` utilise des copies superficielles (les paramètres sont déjà des snapshots clonés en profondeur)
- Le mode de réflexion est explicitement désactivé (`thinkingConfig: { includeThoughts: false }`) — les tokens de raisonnement ne sont pas nécessaires pour la spéculation et entraîneraient un coût/une latence inutiles. Cela n'affecte pas la correspondance du préfixe de cache (déterminée uniquement par `systemInstruction` + `tools` + `history`)
- Détection de version via une comparaison `JSON.stringify` de `systemInstruction` + `tools`

### Mécanisme de cache

DashScope active déjà la mise en cache par préfixe via :

- l'en-tête `X-DashScope-CacheControl: enable`
- les annotations `cache_control: { type: 'ephemeral' }` sur les messages et les outils

L'instance forkée de `GeminiChat` utilise le même `generationConfig` (y compris les outils) et le même préfixe d'historique, ce qui permet au mécanisme de cache existant de DashScope de générer automatiquement des correspondances de cache.

## Constantes

| Constante                | Valeur | Description                              |
| ------------------------ | ------ | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20     | Nombre maximal d'allers-retours API      |
| MAX_SPECULATION_MESSAGES | 100    | Nombre maximal de messages dans l'historique spéculatif |
| SUGGESTION_DELAY_MS      | 300    | Délai avant l'affichage de la suggestion |
| ACCEPT_DEBOUNCE_MS       | 100    | Verrou anti-rebond pour les acceptations rapides |
| MAX_HISTORY_FOR_CACHE    | 40     | Entrées d'historique sauvegardées dans `CacheSafeParams` |

## Structure des fichiers

```
packages/core/src/followup/
├── followupState.ts          # Contrôleur d'état indépendant du framework
├── suggestionGenerator.ts    # Génération de suggestions basée sur LLM + 12 règles de filtrage
├── forkedQuery.ts            # Infrastructure de requête forkée optimisée pour le cache
├── overlayFs.ts              # Système de fichiers overlay en copie-sur-écriture
├── speculationToolGate.ts    # Application des limites d'outils
├── speculation.ts            # Moteur de spéculation (start/accept/abort)
└── index.ts                  # Exportations du module
```