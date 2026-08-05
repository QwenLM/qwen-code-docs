# Tâches de mémoire d'espace de travail du démon — Mémoire gérée sans session

> **Statut** : Proposé — implémentation dans la [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (branche `codex/sessionless-daemon-remember`), pas encore fusionnée.

---

## 1. Énoncé du problème

Le système de mémoire gérée du démon (auto-extraction, agent de rêve) nécessitait auparavant une session de chat active pour écrire des mémoires. Cela posait deux problèmes :

1. **L'interface des paramètres ne peut pas écrire de mémoires** — le panneau de paramètres du web-shell doit sauvegarder des faits fournis par l'utilisateur (par ex. "toujours utiliser le mode strict de TypeScript") sans créer ni polluer une session de chat visible.
2. **Pollution de la liste des sessions** — créer une session jetable juste pour exécuter une commande `/remember` ajoute du bruit à la liste des sessions et perturbe les utilisateurs qui voient des sessions fantômes qu'ils n'ont jamais ouvertes.

La solution est une **API de tâches de mémoire au niveau de l'espace de travail sans session** qui met en file d'attente les tâches remember, forget et dream, les exécute sans créer de session visible, et expose le statut via du polling.

---

## 2. Vue d'ensemble de la conception

```
┌──────────────┐  POST /workspace/memory/{task}      ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/{task}/:id  │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemory*
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     {task}')            │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → remember / forget /  │
                                                     │    dream core logic     │
                                                     └─────────────────────────┘
```

Propriétés clés :

- **Aucune session requise** — le bridge garantit que le processus enfant ACP est lancé, mais ne crée, ne charge ni ne reprend de session ACP.
- **Exécution sérielle** — les tâches s'exécutent une par une via une file de chaînes de promesses (promise-chain lane), empêchant les écritures concurrentes sur le système de fichiers de la mémoire gérée.
- **Caché** — remember/dream s'exécutent via des agents cachés et forget utilise une configuration de mémoire cachée ; aucune de ces opérations ne crée de sessions visibles.
- **Annoncé dans les capacités** — `workspace_memory_remember`, `workspace_memory_forget` et `workspace_memory_dream` dans la réponse `/capabilities` du démon. Remember annonce également `modes: ['workspace', 'clean']`.

---

## 3. Points de terminaison de l'API

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
| ------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | oui    | Le fait à mémoriser. Max 64 Kio (longueur en octets UTF-8).                                                 |
| `contextMode` | `string` | non    | `"workspace"` (par défaut) — l'agent voit le contexte de mémoire de l'espace de travail. `"clean"` — l'agent ne voit aucune mémoire utilisateur préalable. |

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
| 400    | `invalid_content`            | Contenu manquant, vide ou trop volumineux       |
| 400    | `invalid_context_mode`       | Valeur contextMode non reconnue                 |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id non enregistré auprès du bridge|
| 409    | `managed_memory_unavailable` | Mémoire gérée non configurée pour l'espace de travail |
| 429    | `remember_queue_full`        | 16 tâches en attente déjà en file d'attente     |
| 500    | `remember_failed`            | La vérification de disponibilité a échoué de manière inattendue |

### 3.2 `GET /workspace/memory/remember/:taskId`

Récupère le statut de la tâche via polling.

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
| 404    | `remember_task_not_found` | La tâche n'existe pas ou appartient à un autre client|

---

### 3.3 `POST /workspace/memory/forget`

Met en file d'attente une tâche forget. Le démon sélectionne les entrées de mémoire automatique gérée correspondantes et les supprime sans créer de session.

**Requête :**

```json
{
  "query": "old preference"
}
```

| Champ   | Type     | Requis | Description                                                             |
| ------- | -------- | ------ | ----------------------------------------------------------------------- |
| `query` | `string` | oui    | Description en langage naturel à oublier. Max 64 Kio (longueur en octets UTF-8). |

La réponse initiale est `202 Accepted` avec un id de tâche `forget-...`. Interroge `GET /workspace/memory/forget/:taskId` via polling jusqu'à l'état terminal.

**Résultat terminé (completed) :**

```json
{
  "summary": "Forgot 1 memory entry.",
  "removedEntries": [
    {
      "topic": "project",
      "summary": "old preference",
      "filePath": "/path/to/memory.md"
    }
  ],
  "touchedTopics": ["project"],
  "touchedScopes": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

Récupère le statut de la tâche forget via polling. La structure correspond à celle du polling des tâches remember, à l'exception qu'il n'y a pas de champ `contextMode` et que les échecs terminaux utilisent `forget_task_not_found` pour les ids de tâches inconnus ou non autorisés.

### 3.5 `POST /workspace/memory/dream`

Met en file d'attente une tâche dream. Le démon exécute le flux de compaction de rêve de la mémoire automatique gérée sans créer de session.

**Requête :** objet JSON vide ou pas de corps (body).

La réponse initiale est `202 Accepted` avec un id de tâche `dream-...`. Interroge `GET /workspace/memory/dream/:taskId` via polling jusqu'à l'état terminal.

**Résultat terminé (completed) :**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

Récupère le statut de la tâche dream via polling. La structure correspond à celle du polling des tâches remember, à l'exception qu'il n'y a pas de champ `contextMode` et que les échecs terminaux utilisent `dream_task_not_found` pour les ids de tâches inconnus ou non autorisés.

---

## 4. Cycle de vie des tâches

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
- **running** — l'appel au bridge est en cours ; l'agent forké est en cours d'exécution.
- **completed** — l'agent a terminé avec succès ; `result` est rempli.
- **failed** — l'agent a levé une exception ou a expiré (timed out) ; `error` est rempli.

La file stocke jusqu'à **1000 tâches** au total (les tâches terminales sont évincées en FIFO lorsque la limite est atteinte). Au maximum **16 tâches** peuvent être en attente (queued + running) à tout moment. Les tâches forget et dream partagent une limite plus petite de **8 tâches en attente** afin qu'une maintenance manuelle par à-coups ne puisse pas consommer tous les emplacements nécessaires au travail automatique de remember.

---

## 5. Détails d'implémentation

### 5.1 File de tâches sérielle (`WorkspaceRememberTaskLane`)

Situé dans `packages/cli/src/serve/workspace-remember.ts`. Maintient une `Map<taskId, TaskRecord>` et une seule chaîne de promesses (`this.tail`). Chaque `enqueue()` ajoute une fonction `run` qui :

1. Définit le statut à `running`.
2. Appelle la méthode correspondante du bridge : `runWorkspaceMemoryRemember`, `runWorkspaceMemoryForget` ou `runWorkspaceMemoryDream`.
3. En cas de succès : définit le statut à `completed`, remplit `result` et publie un événement `memory_changed` lorsque la tâche a effectivement modifié la mémoire gérée.
4. En cas d'échec : définit le statut à `failed` et remplit `error` avec un code d'erreur public stable.

La file garantit une sérialisation stricte : une seule tâche de mémoire d'espace de travail s'exécute à la fois, empêchant les écritures concurrentes sur le système de fichiers de la mémoire gérée.

### 5.2 Couche Bridge (`HttpAcpBridge`)

Méthodes de mémoire d'espace de travail ajoutées à `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`) :

- `isWorkspaceMemoryRememberAvailable()` — appelle la méthode étendue `qwen/control/workspace/memory/remember/availability` sur le processus enfant. Retourne un `boolean`. Utilisé pour un échec rapide (fast-fail) `409` avant la mise en file d'attente.
- `runWorkspaceMemoryRemember(request)` — appelle la méthode étendue `qwen/control/workspace/memory/remember`. Expire après **300 s** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). Ne crée ni ne charge de session.
- `runWorkspaceMemoryForget(request)` — appelle la méthode étendue `qwen/control/workspace/memory/forget` et utilise le même délai d'expiration du bridge. Ne crée ni ne charge de session.
- `runWorkspaceMemoryDream()` — appelle la méthode étendue `qwen/control/workspace/memory/dream` et utilise le même délai d'expiration du bridge. Ne crée ni ne charge de session.

Ces méthodes appellent `ensureChannel()` (en lançant le processus enfant ACP si nécessaire) et redémarrent le minuteur d'inactivité ensuite si aucune session n'est active.
### 5.3 Exécution enfant ACP (`QwenAgent.extMethod`)

Dans `packages/cli/src/acp-integration/acpAgent.ts`, le gestionnaire pour
`workspaceMemoryRemember`, `workspaceMemoryForget` et `workspaceMemoryDream` :

1. Valide les entrées spécifiques à la tâche (`content`/`contextMode` pour remember,
   `query` pour forget).
2. Vérifie `config.isManagedMemoryAvailable()`.
3. Appelle l'opération principale correspondante avec un signal d'abandon de **295 s**
   (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — légèrement inférieur au timeout du bridge
   pour garantir que l'enfant abandonne avant le filet de sécurité du bridge). Pour forget,
   le signal est transmis via `MemoryManager.forget`, la sélection, la requête côté modèle
   et les mutations du système de fichiers au moment de l'application.

### 5.4 Logique principale de Remember (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()` :

1. Construit un prompt système de mémoire propre à partir de l'index de mémoire gérée du projet.
2. Supprime éventuellement la mémoire utilisateur précédente (si `contextMode === 'clean'`).
3. Crée un `memoryScopedAgentConfig` qui restreint les E/S de fichiers aux répertoires de mémoire uniquement.
4. Exécute un **agent headless forké** (`runForkedAgent`) avec :
   - Nom : `managed-auto-memory-remember`
   - Outils : `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Tours max : 6
   - Temps max : 5 minutes
5. Valide que tous les fichiers touchés se trouvent dans les chemins de mémoire autorisés
   (`classifyTouchedScopes`). Lève `remember_path_escape` si l'agent a écrit
   en dehors des répertoires de mémoire.
6. Reconstruit les index de mémoire pour tous les scopes touchés.
7. Retourne `{ summary, filesTouched, touchedScopes }`.

### 5.5 Configuration de l'agent à scope mémoire (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` crée un wrapper `Config` à permissions restreintes qui :

- **Outils d'écriture** (`write_file`, `edit`) : autorisés uniquement dans la racine
  auto-memory du projet ou la racine user memory (`~/.qwen/memories`).
- **Outils de lecture** (`read_file`, `grep`, `ls`) : lorsque `restrictReadsToMemoryPaths`
  est vrai, autorisés uniquement dans les répertoires de mémoire.
- **Shell** : désactivé par défaut ; si activé, seules les commandes en lecture seule sont autorisées.
- Résout les liens symboliques pour empêcher les échappements de chemin (path-traversal).

---

## 6. Événements

### `memory_changed` (scope : `managed`)

Publié sur le flux d'événements SSE du daemon (`GET /session/:id/events`) en tant
qu'événement `memory_changed` avec `scope: 'managed'` lorsqu'une tâche de mémoire de workspace
se termine avec succès et modifie effectivement la mémoire gérée. Les clients abonnés
au flux d'événements par session reçoivent cette notification.

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

| Champ           | Type        | Description                                                                               |
| --------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `scope`         | `"managed"` | Permet de distinguer des événements `memory_changed` basés sur des fichiers               |
| `source`        | `string`    | `"workspace_memory_remember"`, `"workspace_memory_forget"` ou `"workspace_memory_dream"`  |
| `taskId`        | `string`    | Est en corrélation avec la tâche retournée par POST                                       |
| `touchedScopes` | `string[]`  | Quels scopes de mémoire gérée ont changé : `"user"`, `"project"`                          |

L'`originatorClientId` (s'il est fourni au moment du POST) est attaché à l'enveloppe
de l'événement afin que le bus d'événements puisse le router vers le client d'origine.

---

## 7. Gestion des erreurs

### Codes d'erreur

| Code                         | Origine               | Signification                                                |
| ---------------------------- | --------------------- | ------------------------------------------------------------ |
| `invalid_content`            | Route HTTP            | Contenu manquant, vide ou dépasse 64 KiB                     |
| `invalid_context_mode`       | Route HTTP            | contextMode différent de `"workspace"` ou `"clean"`          |
| `invalid_query`              | Route HTTP            | Requête forget manquante, vide ou dépasse 64 KiB             |
| `invalid_client_id`          | Route HTTP            | En-tête Client-Id absent de l'ensemble connu du bridge       |
| `managed_memory_unavailable` | Bridge / enfant ACP   | Workspace non configuré pour la mémoire gérée                |
| `remember_queue_full`        | Task lane             | Limite de 16 tâches en attente atteinte                      |
| `remember_path_escape`       | Logique principale de remember | L'agent a écrit dans un chemin en dehors des répertoires de mémoire gérée |
| `remember_failed`            | Catch-all             | Échec d'agent non classé, timeout ou erreur interne          |
| `remember_task_not_found`    | Route HTTP            | GET pour un ID de tâche inconnu ou non autorisé              |
| `forget_task_not_found`      | Route HTTP            | GET pour un ID de tâche forget inconnu ou non autorisé       |
| `dream_task_not_found`       | Route HTTP            | GET pour un ID de tâche dream inconnu ou non autorisé        |

### Chaîne de timeouts

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

L'enfant abandonne avant que le bridge n'expire, garantissant qu'une erreur propre se propage
plutôt qu'un timeout au niveau du transport.

---

## 8. Intégration SDK

### SDK TypeScript (`@qwen-code/sdk-typescript`)

Méthodes de mémoire de workspace sur `DaemonClient` :

```typescript
// Mettre en file d'attente une tâche remember
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Sonder jusqu'à l'état terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### Normalisation des événements UI

Le normaliseur du SDK mappe l'événement SSE brut `memory_changed` (avec
`scope: 'managed'`) vers un `DaemonUiWorkspaceMemoryChangedEvent` :

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Cela étend le type d'événement `workspace.memory.changed` existant, qui
ne portait auparavant que `scope: 'workspace' | 'global'` pour les écritures QWEN.md
basées sur des fichiers.

---

## 9. Justification de la conception

### Pourquoi sans session ?

La commande slash `/remember` dans le CLI fonctionne déjà au sein d'une session. Mais l'UI des paramètres et les appelants SDK programmatiques ne devraient pas avoir besoin de créer une session juste pour persister un fait. Une session implique un historique de conversation, un suivi des tours et une visibilité dans la liste des sessions — aucune de ces choses ne s'applique à une écriture de mémoire de type fire-and-forget.

### Pourquoi une exécution sérielle ?

Le système de mémoire gérée stocke les faits dans des fichiers markdown avec des index. Des écritures concurrentes provenant de plusieurs tâches remember pourraient corrompre les index ou produire des conflits de fusion. Une lane mono-thread est la solution correcte la plus simple.

### Pourquoi une file de tâches (et non synchrone) ?

Les écritures de mémoire impliquent un agent LLM qui décide _où_ et _comment_ stocker le fait (choix entre le scope user et project, choix du bon fichier, formatage). Cela prend de 2 à 30 secondes. Une requête HTTP synchrone expirerait ou bloquerait le client. Le modèle de file d'attente asynchrone + polling garde le contrat HTTP simple et permet aux clients d'afficher une UI de progression.

### Pourquoi `contextMode` ?

- `"workspace"` (par défaut) — l'agent remember voit les mémoires existantes comme contexte, ce qui lui permet de dédupliquer ou de mettre à jour les entrées existantes.
- `"clean"` — l'agent ne voit aucune mémoire utilisateur précédente, ce qui est utile lorsque l'appelant souhaite forcer une nouvelle écriture sans logique de déduplication (par ex. import en masse).

### Pourquoi restreindre les lectures aux chemins de mémoire ?

L'agent remember ne devrait lire/écrire que dans les répertoires de mémoire gérée. Cela empêche un scénario d'injection de prompt où un `content` conçu spécialement tromperait l'agent pour qu'il lise des fichiers de projet sensibles et les fuite dans les entrées de mémoire.