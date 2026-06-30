# Daemon Workspace Remember — Ingestion de mémoire sans session

> **Statut** : Proposé — implémentation dans la [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (branche `codex/sessionless-daemon-remember`), pas encore fusionnée.

---

## 1. Énoncé du problème

Le système de mémoire gérée du daemon (auto-extraction, dream agent) nécessitait auparavant une session de chat active pour écrire des mémoires. Cela posait deux problèmes :

1. **L'interface des paramètres ne peut pas écrire de mémoires** — le panneau de paramètres du web-shell doit pouvoir sauvegarder des faits fournis par l'utilisateur (par ex. "toujours utiliser le mode strict de TypeScript") sans créer ni polluer une session de chat visible.
2. **Pollution de la liste des sessions** — créer une session jetable juste pour exécuter une commande `/remember` ajoute du bruit à la liste des sessions et perturbe les utilisateurs qui voient des sessions fantômes qu'ils n'ont jamais ouvertes.

La solution est un **endpoint remember au niveau du workspace sans session** qui met en file d'attente les tâches d'écriture de mémoire, les exécute via un fork `AgentHeadless` caché (aucune session créée), et expose le statut via du polling.

---

## 2. Aperçu de la conception

```
┌──────────────┐  POST /workspace/memory/remember   ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/remember/:id │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemoryRemember()
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     remember')          │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → runManagedRemember-  │
                                                     │    ByAgent (forked)     │
                                                     └─────────────────────────┘
```

Propriétés clés :

- **Aucune session requise** — le bridge garantit le lancement du processus enfant ACP sans créer, charger ni reprendre de session ACP.
- **Exécution sérielle** — les tâches s'exécutent une à la fois via une file de promesses chaînées, empêchant les écritures concurrentes sur le système de fichiers de la mémoire gérée.
- **Caché** — l'agent forké s'exécute avec `name: 'managed-auto-memory-remember'` et est invisible dans la liste des sessions.
- **Annoncé comme capacité** — `workspace_memory_remember` dans la réponse `/capabilities` du daemon, avec les `modes` pris en charge : `['workspace', 'clean']`.

---

## 3. Endpoints de l'API

### 3.1 `POST /workspace/memory/remember`

Met en file d'attente une nouvelle tâche remember.

**Requête :**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Champ         | Type     | Requis | Description                                                                                                 |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | oui      | Le fait à mémoriser. Max 64 KiB (longueur en octets UTF-8).                                                       |
| `contextMode` | `string` | non       | `"workspace"` (par défaut) — l'agent voit le contexte de la mémoire du workspace. `"clean"` — l'agent ne voit aucune mémoire utilisateur préalable. |

**En-têtes :**

- `Authorization: Bearer <token>` (requis)
- `X-Qwen-Client-Id: <clientId>` (optionnel — limite la visibilité de la tâche)

**Réponse `202 Accepted` :**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**Réponses d'erreur :**

| Statut | Code                         | Condition                                       |
| ------ | ---------------------------- | ----------------------------------------------- |
| 400    | `invalid_content`            | Contenu manquant, vide ou trop volumineux            |
| 400    | `invalid_context_mode`       | Valeur contextMode non reconnue                  |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id non enregistré auprès du bridge |
| 409    | `managed_memory_unavailable` | Mémoire gérée non configurée pour le workspace     |
| 429    | `remember_queue_full`        | 16 tâches en attente déjà en file d'attente                 |
| 500    | `remember_failed`            | La vérification de disponibilité a levé une erreur inattendue           |

### 3.2 `GET /workspace/memory/remember/:taskId`

Récupère le statut de la tâche par polling.

**En-têtes :**

- `Authorization: Bearer <token>` (requis)
- `X-Qwen-Client-Id: <clientId>` (optionnel — doit correspondre à l'initiateur pour voir la tâche)

**Réponse `200 OK` (queued/running) :**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "result": null,
  "error": null
}
```

- `status` sera `"queued"` ou `"running"` selon que la tâche a commencé son exécution ou non.
- `result` : présent (non nul) uniquement lorsque `status === "completed"`.
- `error` : présent (non nul) uniquement lorsque `status === "failed"`.

**Réponse `200 OK` (completed) :**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "completed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:05.000Z",
  "result": {
    "summary": "Saved dark-mode preference to user memory.",
    "filesTouched": ["~/.qwen/memories/user/user.md"],
    "touchedScopes": ["user"]
  }
}
```

**Réponse `200 OK` (failed) :**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "failed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:03.000Z",
  "error": {
    "code": "remember_path_escape",
    "message": "Remember agent touched a path outside managed memory."
  }
}
```

**Réponses d'erreur :**

| Statut | Code                      | Condition                                            |
| ------ | ------------------------- | ---------------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id non enregistré                      |
| 404    | `remember_task_not_found` | La tâche n'existe pas ou appartient à un autre client |

---

## 4. Cycle de vie de la tâche

```
            enqueue()
               │
               ▼
  ┌─────────────────────┐
  │       queued         │   (awaiting serial lane slot)
  └──────────┬──────────┘
             │  lane picks up
             ▼
  ┌─────────────────────┐
  │       running        │   (bridge.runWorkspaceMemoryRemember in progress)
  └──────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐    ┌──────────┐
│ completed│    │  failed  │
└──────────┘    └──────────┘
```

- **queued** — la tâche est créée et attend dans la file sérielle.
- **running** — l'appel au bridge est en cours ; l'agent forké s'exécute.
- **completed** — l'agent a terminé avec succès ; `result` est rempli.
- **failed** — l'agent a levé une erreur ou a expiré (timeout) ; `error` est rempli.

La file stocke jusqu'à **1000 tâches** au total (les tâches terminales sont évincées en FIFO lorsque la limite est atteinte). Au maximum **16 tâches** peuvent être en attente (queued + running) à tout moment.

---

## 5. Détails d'implémentation

### 5.1 File de tâches sérielle (`WorkspaceRememberTaskLane`)

Située dans `packages/cli/src/serve/workspace-remember.ts`. Elle maintient une `Map<taskId, TaskRecord>` et une seule chaîne de promesses (`this.tail`). Chaque `enqueue()` ajoute une fonction `run` qui :

1. Définit le statut à `running`.
2. Appelle `bridge.runWorkspaceMemoryRemember({ content, contextMode })`.
3. En cas de succès : définit le statut à `completed`, remplit `result`, publie l'événement `memory_changed`.
4. En cas d'échec : définit le statut à `failed`, remplit `error` avec un code d'erreur public stable.

La file garantit une sérialisation stricte : une seule tâche remember s'exécute à la fois, empêchant les écritures concurrentes sur le système de fichiers de la mémoire gérée.

### 5.2 Couche Bridge (`HttpAcpBridge`)

Deux méthodes ajoutées à `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`) :

- `isWorkspaceMemoryRememberAvailable()` — appelle l'ext-method `qwen/control/workspace/memory/remember/availability` sur l'enfant. Retourne un `boolean`. Utilisé pour un échec rapide (fast-fail) `409` avant la mise en file d'attente.
- `runWorkspaceMemoryRemember(request)` — appelle l'ext-method `qwen/control/workspace/memory/remember`. Expire après **300 s** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). Ne crée ni ne charge de session.

Les deux méthodes appellent `ensureChannel()` (lançant le processus enfant ACP si nécessaire) et redémarrent le minuteur d'inactivité ensuite si aucune session n'est active.

### 5.3 Exécution de l'enfant ACP (`QwenAgent.extMethod`)

Dans `packages/cli/src/acp-integration/acpAgent.ts`, le gestionnaire pour `workspaceMemoryRemember` :

1. Valide `content` (chaîne non vide, ≤64 KiB) et `contextMode`.
2. Vérifie `config.isManagedMemoryAvailable()`.
3. Appelle `runManagedRememberByAgent()` avec un signal d'annulation de **295 s** (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — légèrement inférieur au timeout du bridge pour garantir que l'enfant s'annule avant la limite du bridge).

### 5.4 Logique Remember principale (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()` :

1. Construit un prompt système de mémoire propre à partir de l'index de mémoire gérée du projet.
2. Supprime éventuellement la mémoire utilisateur précédente (si `contextMode === 'clean'`).
3. Crée une `memoryScopedAgentConfig` qui restreint les E/S de fichiers aux seuls répertoires de mémoire.
4. Exécute un **agent headless forké** (`runForkedAgent`) avec :
   - Nom : `managed-auto-memory-remember`
   - Outils : `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Tours max : 6
   - Temps max : 5 minutes
5. Valide que tous les fichiers touchés se trouvent dans les chemins de mémoire autorisés (`classifyTouchedScopes`). Lève une erreur `remember_path_escape` si l'agent a écrit en dehors des répertoires de mémoire.
6. Reconstruit les index de mémoire pour tous les scopes touchés.
7. Retourne `{ summary, filesTouched, touchedScopes }`.

### 5.5 Configuration de l'agent à scope mémoire (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` crée un wrapper `Config` à permissions restreintes qui :

- **Outils d'écriture** (`write_file`, `edit`) : autorisés uniquement dans la racine auto-memory du projet ou la racine de mémoire utilisateur (`~/.qwen/memories`).
- **Outils de lecture** (`read_file`, `grep`, `ls`) : lorsque `restrictReadsToMemoryPaths` est vrai, autorisés uniquement dans les répertoires de mémoire.
- **Shell** : désactivé par défaut ; si activé, seules les commandes en lecture seule sont autorisées.
- Résout les liens symboliques pour empêcher les évasions par path-traversal.

---

## 6. Événements

### `memory_changed` (scope: `managed`)

Publié sur le flux d'événements SSE du daemon (`GET /session/:id/events`) en tant qu'événement `memory_changed` avec `scope: 'managed'` lorsqu'une tâche remember se termine avec succès. Les clients abonnés au flux d'événements par session reçoivent cette notification.

**Payload :**

```json
{
  "type": "memory_changed",
  "data": {
    "scope": "managed",
    "source": "workspace_memory_remember",
    "taskId": "remember-a1b2c3d4-...",
    "touchedScopes": ["user", "project"]
  }
}
```

| Champ           | Type        | Description                                             |
| --------------- | ----------- | ------------------------------------------------------- |
| `scope`         | `"managed"` | Discrimine par rapport aux événements `memory_changed` basés sur des fichiers   |
| `source`        | `string`    | Toujours `"workspace_memory_remember"` pour cette fonctionnalité   |
| `taskId`        | `string`    | Corrélé à la tâche retournée par POST               |
| `touchedScopes` | `string[]`  | Quels scopes de mémoire ont été écrits : `"user"`, `"project"` |

Le `originatorClientId` (s'il est fourni au moment du POST) est attaché à l'enveloppe de l'événement afin que le bus d'événements puisse le router vers le client d'origine.

---

## 7. Gestion des erreurs

### Codes d'erreur

| Code                         | Origine              | Signification                                                |
| ---------------------------- | ------------------- | ------------------------------------------------------ |
| `invalid_content`            | Route HTTP          | Contenu manquant, vide ou dépasse 64 KiB              |
| `invalid_context_mode`       | Route HTTP          | contextMode différent de `"workspace"` ou `"clean"`             |
| `invalid_client_id`          | Route HTTP          | En-tête Client-Id absent de l'ensemble connu du bridge             |
| `managed_memory_unavailable` | Bridge / enfant ACP  | Workspace non configuré pour la mémoire gérée            |
| `remember_queue_full`        | File de tâches           | Limite de 16 tâches en attente atteinte                         |
| `remember_path_escape`       | Logique Remember principale | L'agent a écrit dans un chemin en dehors des répertoires de mémoire gérée      |
| `remember_failed`            | Catch-all           | Échec d'agent non classé, timeout ou erreur interne |
| `remember_task_not_found`    | Route HTTP          | GET pour un ID de tâche inconnu ou non autorisé                |

### Chaîne de timeout

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

L'enfant s'annule avant que le bridge n'expire, garantissant qu'une erreur propre se propage plutôt qu'un timeout au niveau du transport.

---

## 8. Intégration au SDK

### SDK TypeScript (`@qwen-code/sdk-typescript`)

Deux nouvelles méthodes sur `DaemonClient` :

```typescript
// Queue a remember task
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Poll until terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'
```

### Normalisation des événements UI

Le normaliseur du SDK mappe l'événement SSE brut `memory_changed` (avec `scope: 'managed'`) vers un `DaemonUiWorkspaceMemoryChangedEvent` :

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Cela étend le type d'événement existant `workspace.memory.changed`, qui ne portait auparavant que `scope: 'workspace' | 'global'` pour les écritures de QWEN.md basées sur des fichiers.

---

## 9. Justification de la conception

### Pourquoi sans session ?

La commande slash `/remember` dans le CLI fonctionne déjà au sein d'une session. Mais l'interface des paramètres et les appelants programmatiques du SDK ne devraient pas avoir à créer une session juste pour persister un fait. Une session implique un historique de conversation, un suivi des tours et une visibilité dans la liste des sessions — ce qui ne s'applique pas à une écriture de mémoire de type fire-and-forget.

### Pourquoi une exécution sérielle ?

Le système de mémoire gérée stocke les faits dans des fichiers markdown avec des index. Des écritures concurrentes provenant de plusieurs tâches remember pourraient corrompre les index ou produire des conflits de fusion. Une file mono-threadée est la solution correcte la plus simple.

### Pourquoi une file de tâches (et non synchrone) ?

Les écritures de mémoire impliquent un agent LLM qui décide _où_ et _comment_ stocker le fait (choix entre le scope utilisateur et projet, choix du bon fichier, formatage). Cela prend de 2 à 30 secondes. Une requête HTTP synchrone expirerait ou bloquerait le client. Le modèle file asynchrone + polling garde le contrat HTTP simple et permet aux clients d'afficher une UI de progression.

### Pourquoi contextMode ?

- `"workspace"` (par défaut) — l'agent remember voit les mémoires existantes comme contexte, ce qui lui permet de dédupliquer ou de mettre à jour les entrées existantes.
- `"clean"` — l'agent ne voit aucune mémoire utilisateur préalable, utile lorsque l'appelant souhaite forcer une nouvelle écriture sans logique de déduplication (par ex. import en masse).

### Pourquoi restreindre les lectures aux chemins de mémoire ?

L'agent remember ne doit lire/écrire que dans les répertoires de mémoire gérée. Cela empêche un scénario d'injection de prompt où un `content` conçu spécialement tromperait l'agent pour qu'il lise des fichiers de projet sensibles et les fuite dans les entrées de mémoire.