# Speculation Engine Design

> Exécute de manière spéculative la suggestion acceptée avant que l'utilisateur ne confirme, en utilisant l'isolation de fichiers par copie sur écriture. Les résultats apparaissent instantanément lorsque l'utilisateur appuie sur Tab.

## Aperçu

Lorsqu'une suggestion d'invite est affichée, le **speculation engine** commence immédiatement à l'exécuter en arrière-plan en utilisant un GeminiChat forké. Les écritures de fichiers sont redirigées vers un répertoire temporaire d'overlay. Si l'utilisateur accepte la suggestion, les fichiers de l'overlay sont copiés dans le système de fichiers réel et la conversation spéculée est injectée dans l'historique principal du chat. Si l'utilisateur tape autre chose, la spéculation est abandonnée et l'overlay est nettoyé.

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

## Copy-on-Write Overlay

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

## Sécurité du Tool Gate

| Tool                                                       | Action   | Condition                                    |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | Chemins de lecture résolus via l'overlay     |
| edit, write_file                                           | redirect | Uniquement en mode auto-edit / yolo approval |
| edit, write_file                                           | boundary | En mode par défaut / plan approval           |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` retourne true  |
| shell                                                      | boundary | Commandes non read-only                      |
| web_fetch, web_search                                      | boundary | Les requêtes réseau nécessitent le consentement de l'utilisateur |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | Impossible d'interagir avec l'utilisateur pendant la spéculation |
| Outils inconnus / MCP                                      | boundary | Valeur par défaut sécurisée                  |

### Réécriture des chemins

- **Outils d'écriture** : `rewritePathArgs()` redirige `file_path` vers l'overlay via `overlayFs.redirectWrite()`
- **Outils de lecture** : `resolveReadPaths()` redirige `file_path` vers l'overlay via `overlayFs.resolveReadPath()` si le fichier a déjà été écrit
- **Échec de la réécriture** : Traité comme une boundary (par exemple, un chemin absolu en dehors du cwd lève une erreur dans `redirectWrite`)

## Gestion des limites

Lorsqu'une limite est atteinte en cours de tour :

1. Les appels d'outils déjà exécutés sont conservés (suivi basé sur l'index, pas sur le nom)
2. Les appels de fonction non exécutés sont retirés du message du modèle
3. Les réponses partielles des outils sont ajoutées à l'historique
4. `ensureToolResultPairing()` valide l'intégrité avant l'injection

## Suggestion en pipeline

Après la fin de la spéculation (sans limite), un second appel LLM génère la suggestion **suivante** :

```
Contexte : conversation originale + "commit this" + messages spéculés
→ LLM prédit : "push it"
→ Stocké dans state.pipelinedSuggestion
→ Lors de l'acceptation : setPromptSuggestion("push it") — apparaît instantanément
```

Cela permet des workflows Tab-Tab-Tab où chaque acceptation affiche immédiatement l'étape suivante.

La suggestion en pipeline réutilise la constante exportée `SUGGESTION_PROMPT` du fichier `suggestionGenerator.ts` (pas une copie locale) pour garantir une qualité constante avec les suggestions initiales.

## Modèle rapide

`startSpeculation` accepte un paramètre optionnel `options.model`, transmis via `runSpeculativeLoop` et `generatePipelinedSuggestion` à `runForkedQuery`. Configuré via le paramètre `fastModel` de haut niveau (vide = utilise le modèle principal). Le même `fastModel` est utilisé pour toutes les tâches en arrière-plan : génération de suggestions, spéculation et suggestions en pipeline. Défini via `/model --fast <name>` ou `settings.json`.

## Rendu de l'interface utilisateur

Lorsque la spéculation se termine, `acceptSpeculation` affiche les résultats via `historyManager.addItem()` :

- **Messages utilisateur** : affichés comme des éléments de type `'user'`
- **Texte du modèle** : affichés comme des éléments de type `'gemini'`
- **Appels d'outils** : affichés comme des éléments de type `'tool_group'` avec des entrées structurées `IndividualToolCallDisplay` (nom de l'outil, description de l'argument, texte du résultat, statut)

Cela montre à l'utilisateur l'intégralité de la sortie de spéculation, y compris les détails des appels d'outils, et pas seulement du texte brut.

## Requête forké (partage de cache)

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
- Historique tronqué à 40 entrées ; `createForkedChat` utilise des copies superficielles (les paramètres sont déjà des instantanés clonés en profondeur)
- Mode réflexion explicitement désactivé (`thinkingConfig: { includeThoughts: false }`) — les tokens de raisonnement ne sont pas nécessaires pour la spéculation et gaspilleraient du coût et de la latence. Cela n'affecte pas la correspondance du préfixe de cache (déterminée par systemInstruction + tools + history uniquement)
- Détection de version via comparaison `JSON.stringify` de systemInstruction + tools

### Mécanisme de cache

DashScope active déjà la mise en cache du préfixe via :

- L'en-tête `X-DashScope-CacheControl: enable`
- Les annotations `cache_control: { type: 'ephemeral' }` sur les messages et les outils

Le `GeminiChat` forké utilise un `generationConfig` identique (y compris les outils) et le même préfixe d'historique, donc le mécanisme de cache existant de DashScope produit automatiquement des hits de cache.

## Constantes

| Constante                 | Valeur | Description                              |
| ------------------------ | ------ | ----------------------------------------- |
| MAX_SPECULATION_TURNS    | 20     | Nombre maximal d'allers-retours API       |
| MAX_SPECULATION_MESSAGES | 100    | Nombre maximal de messages dans l'historique spéculé |
| SUGGESTION_DELAY_MS      | 300    | Délai avant d'afficher la suggestion      |
| ACCEPT_DEBOUNCE_MS       | 100    | Verrouillage anti-rebond pour les acceptations rapides |
| MAX_HISTORY_FOR_CACHE    | 40     | Entrées d'historique sauvegardées dans CacheSafeParams |

## Structure des fichiers

```
packages/core/src/followup/
├── followupState.ts          # Contrôleur d'état indépendant du framework
├── suggestionGenerator.ts    # Génération de suggestions par LLM + 12 règles de filtrage
├── forkedQuery.ts            # Infrastructure de requête forké sensible au cache
├── overlayFs.ts              # Système de fichiers overlay copy-on-write
├── speculationToolGate.ts    # Application des limites des outils
├── speculation.ts            # Moteur de spéculation (start/accept/abort)
└── index.ts                  # Exportations du module
```