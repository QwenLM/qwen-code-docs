# Conception implémentable de l'API Session Artifacts du daemon Qwen-Code

> Documents d'entrée : premier brouillon de l'API daemon session artifacts et brouillon v1 de la conception des artifacts.
>
> Ligne de base du code source : code actuel de qwen-code.  
> Objectif : concevoir une API session artifacts implémentable, vérifiable et aux limites bien définies, en s'appuyant sur les capacités existantes du Daemon / ACP / SSE / SDK / hooks / extension.

## 1. Conclusions de la conception

Il est recommandé de définir un artifact comme suit :

> **Référence structurée à un artefact explicitement enregistré dans une session, que l'utilisateur peut réutiliser, cliquer, prévisualiser, télécharger ou partager. Les modifications de code source ordinaires ne sont pas des artifacts ; elles relèvent de l'historique des file change / diff / patch.**

Cette définition couvre à la fois les fichiers et les URL non liées à des fichiers. L'important n'est pas qu'il s'agisse d'un fichier physique, mais qu'il soit explicitement déclaré comme « artefact » par le système. Le panneau Artifacts doit afficher les outputs de la session, et non tout ce sur quoi l'agent a interagi.

Les capacités complètes recommandées pour la V1 incluent :

- capability : `session_artifacts`
- API de snapshot d'artifact : `GET /session/:id/artifacts`
- événement de modification d'artifact : `artifact_changed`
- métadonnées du résultat de l'outil : `ToolResult.artifacts?: ToolArtifact[]`
- métadonnées structurées d'artifact pour `ArtifactTool`
- index mémoire du bridge : `SessionArtifactStore`
- méthodes SDK : `DaemonClient.listSessionArtifacts()`, `DaemonSessionClient.artifacts()`
- outil léger appelable par le modèle/skill/agent : `record_artifact`
- artifacts en sortie de hook : `hookSpecificOutput.artifacts`
- API d'injection manuelle par le client : `POST /session/:id/artifacts`
- API de suppression explicite par le client : `DELETE /session/:id/artifacts/:artifactId`
- méthode SDK : `DaemonSessionClient.addArtifact()`
- méthode SDK : `DaemonSessionClient.removeArtifact()`
- modèle de référence pour le stockage managed / published

Pour garder la V1 maîtrisable, il n'est pas recommandé d'implémenter dans la V1 :

- scan du workspace
- intégration automatique des `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` ordinaires dans les artifacts
- extraction automatique des URL en texte brut
- extraction automatique des chemins/URL dans le stdout du shell
- retour du contenu de l'artifact
- historique des versions d'artifact
- restauration persistante des artifacts
- base de données / OSS / sandbox iframe dynamique

## 2. Un lien compte-t-il comme un artifact ?

### 2.1 Conclusion

**Oui, mais il doit s'agir d'un « link artifact déclaratif ».**

Par exemple, les éléments suivants devraient compter comme des artifacts :

- URL de détail de table de la plateforme de données interne construite par un skill à partir d'un ID de ressource.
- Pages de détail de tâche, de monitoring, de trace ou de lineage construites par un agent à partir d'un ID de ressource.
- URL de dashboard / notebook / report renvoyées par un outil MCP.
- URL HTML publiée par `ArtifactTool`.
- URL explicitement ajoutées par l'utilisateur ou le client dans la zone des artifacts de la session.

Les éléments suivants ne devraient pas être considérés comme des artifacts par défaut :

- Tout lien markdown arbitraire dans une réponse ordinaire de l'assistant.
- URL de page web lue par `web_fetch`.
- URL apparaissant accidentellement dans la sortie de grep/shell.
- Liens vers des ressources citées, documents ou références.

Critères principaux :

| Type | Intégré aux artifacts | Raison |
| ------------------------------- | -----------------: | ---------------------------------------- |
| Modification de code source ordinaire |                 Non | Relève du file change / diff, pas d'un artefact réutilisable  |
| Fichier de workspace généré explicitement enregistré |                 Oui | Outputs réutilisables tels que report / HTML / PDF / image |
| URL HTML publiée par ArtifactTool    |                 Oui | Explicitement publiée par l'outil                             |
| URL de détail métier construite par un skill selon des règles  | Oui, mais doit être explicitement enregistré | L'utilisateur a besoin d'un clic persistant dans le panneau de droite                     |
| Liens de référence ordinaires dans la réponse de l'assistant  |                 Non | Trop de bruit, risque élevé de faux positifs                         |
| URL apparaissant dans le stdout du shell       |                 Non | Sémantique non fiable                               |
| URL requêtées par web_fetch          |                 Non | Il s'agit d'une entrée/source, pas d'un artefact                  |

### 2.2 Sémantique produit du Link Artifact

Un link artifact n'est pas du « contenu web », mais une « entrée de ressource ». Il doit apparaître comme un élément cliquable dans le panneau des artifacts à droite :

- Titre : Détails de la ressource de profil utilisateur
- Sous-titre : internal data platform / prod
- Type : link
- Hôte URL : platform.example.com
- Source : `ToolResult.artifacts` / `ArtifactTool` / `record_artifact` / hook / client

Le client ouvre l'URL lors du clic ; le daemon ne lit, ne valide et ne pré-rend pas cette URL.

## 3. Ligne de base actuelle du code

### 3.1 Daemon REST et capability

Code source associé :

- `packages/cli/src/serve/server.ts`
- `packages/cli/src/serve/capabilities.ts`
- `docs/developers/qwen-serve-protocol.md`

État actuel :

- `/capabilities` renvoie `features`, le client doit conditionner l'UI sur le feature gate.
- Les interfaces d'état en lecture seule au niveau de la session adoptent le style REST :
  - `GET /session/:id/status`
  - `GET /session/:id/context`
  - `GET /session/:id/tasks`
  - `GET /session/:id/events`
- Les capabilities sont enregistrées dans `SERVE_CAPABILITY_REGISTRY`.

Conception :

- Nouvelle feature : `session_artifacts`
- Nouvelle route : `GET /session/:id/artifacts`
- Nouvelle route de mutation pour l'injection manuelle : `POST /session/:id/artifacts`

### 3.2 Session EventBus

Code source associé :

- `packages/acp-bridge/src/eventBus.ts`
- `packages/acp-bridge/src/bridge.ts`
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/sdk-typescript/src/daemon/events.ts`

État actuel :

- Chaque session active possède son propre `EventBus`.
- L'`EventBus` prend en charge l'ID, un ring de replay borné, `Last-Event-ID` et la backpressure.
- Le SDK maintient une liste d'événements connus.

Conception :

- Les mises à jour en temps réel des artifacts réutilisent l'endpoint existant `/session/:id/events`.
- Nouveau type d'événement : `artifact_changed`
- Le client utilise un snapshot lors de sa première connexion, puis des événements incrémentaux ; il récupère à nouveau un snapshot après une déconnexion.

### 3.3 Tool Result et ArtifactTool

Code source associé :

- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/artifact/artifact-tool.ts`
- `packages/cli/src/acp-integration/session/Session.ts`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`

État actuel :

- `ToolResult` contient actuellement `llmContent`, `returnDisplay`, `resultFilePaths?`, `error?`.
- `ArtifactTool` peut déjà publier du HTML et renvoyer une URL, mais ne possède pas de métadonnées d'artifact structurées.
- Le champ `_meta` de `ToolCallEmitter.emitResult()` dispose déjà d'un espace d'extension.

Conception :

- Ajouter `ToolResult.artifacts?: ToolArtifact[]`.
- Remplir `artifacts` en cas de succès de `ArtifactTool`.
- `ToolCallEmitter.emitResult()` place les artifacts dans `_meta.artifacts`.
- Le `BridgeClient` consomme `_meta.artifacts` et les écrit dans le store d'artifacts de session.

### 3.4 État actuel des Hooks / Extensions / Plugins

Code source associé :

- `packages/core/src/hooks/types.ts`
- `packages/core/src/core/toolHookTriggers.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/sessionHooksManager.ts`
- `packages/core/src/hooks/registerSkillHooks.ts`
- `packages/core/src/extension/extensionManager.ts`
- `docs/developers/channel-plugins.md`

Capacités actuellement disponibles :

- Les événements de hook incluent `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop`, etc.
- Les types de hooks incluent command, HTTP, function, prompt.
- Le stdout des hooks de type command prend en charge `HookOutput` au format JSON.
- La réponse des hooks HTTP prend en charge `HookOutput` au format JSON.
- Les hooks de session peuvent être enregistrés à l'exécution via `SessionHooksManager`.
- Le frontmatter des skills peut enregistrer des hooks command/HTTP au niveau de la session.
- Les extensions peuvent fournir des commands, skills, hooks, serveurs MCP, channels.
- Les plugins de channel servent principalement à l'adaptation des plateformes de messagerie ; ils peuvent observer les tool call / response chunk, mais ne constituent pas un canal d'injection d'artifacts pour le daemon.

Lacunes actuelles :

- La sortie de hook ne contient que des champs génériques tels que `additionalContext`, `decision`, `stopReason`.
- Il n'existe actuellement pas de `hookSpecificOutput.artifacts` standard.
- Le daemon ne dispose actuellement que des interfaces d'état `GET /workspace/hooks` et `GET /session/:id/hooks`, sans route pour « l'injection proactive d'artifacts par un hook ».

Conclusion :

- Les hooks/extensions sont d'excellents points d'entrée pour les artifacts personnalisés, mais le schéma de sortie des hooks doit être étendu.
- Il n'est pas recommandé d'utiliser les plugins de channel comme canal principal d'injection d'artifacts ; ils conviennent à l'affichage sur des plateformes de chat externes, mais pas à la maintenance de l'index des artifacts de session du daemon.

## 4. Conception de l'API

### 4.1 Capability

Ajout :

```json
"session_artifacts"
```

Le client n'affiche le panneau des artifacts et n'appelle les API associées que s'il voit cette feature.

### 4.2 List Artifacts

```http
GET /session/:id/artifacts
```

Réponse :

```json
{
  "v": 1,
  "sessionId": "session-123",
  "artifacts": [
    {
      "id": "a1b2c3d4e5f6",
      "kind": "link",
      "storage": "external_url",
      "title": "用户画像资源详情",
      "description": "内部数据平台资源详情页",
      "url": "https://platform.example.com/resources/user-profile",
      "mimeType": "text/html",
      "status": "available",
      "source": "tool",
      "toolCallId": "call_abc",
      "toolName": "artifact",
      "createdAt": "2026-06-26T10:00:00.000Z",
      "updatedAt": "2026-06-26T10:00:00.000Z",
      "metadata": {
        "resourceType": "data_platform_resource",
        "env": "prod"
      }
    }
  ]
}
```

### 4.3 Événement Artifact Changed

Via l'endpoint existant :

```http
GET /session/:id/events
```

Nouvel événement :

```json
{
  "v": 1,
  "type": "artifact_changed",
  "data": {
    "sessionId": "session-123",
    "change": {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "用户画像资源详情",
        "description": "内部数据平台资源详情页",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "status": "available",
        "source": "tool",
        "toolCallId": "call_abc",
        "toolName": "artifact",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "data_platform_resource",
          "env": "prod"
        }
      }
    }
  }
}
```

`change.action` :

- `created`
- `updated`
- `removed`

La V1 génère principalement `created` / `updated` ; les scénarios d'eviction ou de suppression explicite génèrent `removed`.

`artifact_changed.data.change.artifact` contient l'objet `DaemonSessionArtifact` complet lors des actions `created` / `updated` / `removed`, avec une forme identique à un élément individuel de `GET /session/:id/artifacts` ; l'événement `removed` contient le dernier artifact complet avant sa suppression. `removed` doit inclure un `reason`, dont les valeurs en V1 sont `eviction` ou `explicit`. Cela permet à l'UI en temps réel d'appliquer directement l'événement sans avoir à effectuer un GET après chaque événement. En cas de déconnexion du client, de perte d'événement ou de réception d'un type d'événement inconnu, le client utilise `GET /session/:id/artifacts` pour une synchronisation par snapshot.

### 4.4 Insertion manuelle par le client

En tant que point d'entrée d'enregistrement explicite par le client pour la V1 :

```http
POST /session/:id/artifacts
```

Utilisation :

- Ajout manuel d'un link artifact personnalisé par la WebUI/l'IDE/un client externe.
- Insertion de ressources dans le panneau des artifacts à droite par la couche d'extension ou d'intégration, sans passer par un appel d'outil du modèle.

Requête :

```json
{
  "kind": "link",
  "storage": "external_url",
  "title": "任务详情",
  "description": "调度任务 task_123 的详情页",
  "url": "https://ops.example.com/tasks/task_123",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "scheduler_task"
  }
}
```

Réponse :

```json
{
  "v": 1,
  "sessionId": "session-123",
  "changes": [
    {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "任务详情",
        "description": "调度任务 task_123 的详情页",
        "url": "https://ops.example.com/tasks/task_123",
        "mimeType": "text/html",
        "status": "available",
        "source": "client",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    }
  ]
}
```

Chaque élément de `changes` doit être publié de manière synchrone sous forme d'événement SSE `artifact_changed`. Ainsi, même si un seul POST déclenche un upsert et une eviction, le client reçoit l'incrément complet des `created`/`updated` ainsi que des `removed`. Si, au cours d'une même mutation, plusieurs entrées sont fusionnées vers une même identité, une seule modification finale ne peut être produite dans `changes`. L'ordre de publication des événements est une contrainte protocolaire : publier d'abord les `created` / `updated` dans l'ordre de `changes[]`, puis les `removed`, afin d'éviter que l'image locale du client n'entre brièvement dans un état qui n'a jamais existé côté serveur.

Réponse d'erreur :

```json
{
  "v": 1,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "url must use http or https",
    "field": "url"
  }
}
```

Codes d'état :

- `400 VALIDATION_FAILED` : échec de la validation des champs, par exemple plusieurs primary locators, schéma d'URL non pris en charge, métadonnées dépassant la limite.
- `401 UNAUTHORIZED` / `403 FORBIDDEN` : échec de la validation du mutation gate ou du bearer token.
- `404 SESSION_NOT_FOUND` : la session n'existe pas.

### 4.5 Suppression par le client

En tant que point d'entrée de suppression explicite pour la V1 :

```http
DELETE /session/:id/artifacts/:artifactId
```

Sémantique :

- Supprime uniquement cet artifact du store d'artifacts de la session active actuelle.
- Ne supprime pas les fichiers du workspace, les fichiers managed ou les URL distantes.
- En cas de succès, renvoie un `DaemonSessionArtifactMutationResult` contenant une modification avec `action: 'removed'` et `reason: 'explicit'`.
- Si l'artifact n'existe déjà pas, le DELETE est toujours traité comme un succès idempotent, renvoyant `200` et un `changes: []` vide, sans publier d'événement SSE.
- Publie de manière synchrone l'événement SSE `artifact_changed` correspondant.

Les réponses d'erreur réutilisent l'enveloppe de la section 4.4 ; si la session n'existe pas, elle renvoie toujours `404 SESSION_NOT_FOUND`.

Sécurité :

- Il s'agit d'une route de mutation, le mutation gate existant doit être utilisé.
- Seuls les daemons dotés d'un bearer token autorisent les appels par des clients distants.
- Ne lit pas l'URL.
- N'ouvre pas automatiquement l'URL.

### 4.6 Périmètre de publication et compatibilité de la V1

Après son intégration, la V1 doit être publiée en tant que capacité complète de gestion des artifacts de session pour une phase de test, et non comme une interface inachevée. La boucle minimale pour une capacité complète est la suivante :

- Le client détecte la fonctionnalité via la capability `session_artifacts`.
- Le daemon fournit le snapshot `GET /session/:id/artifacts`.
- Le daemon publie les incrémentations `artifact_changed` via le flux d'événements existant.
- Les quatre types de points d'entrée (`ArtifactTool` / `ToolResult.artifacts`, `record_artifact`, artifacts de hook, POST client) alimentent le même store.
- Le DELETE client permet de supprimer explicitement les artifacts enregistrés par erreur du store actif.
- Le store exécute de manière unifiée la validation, la normalisation, la déduplication d'identité et l'eviction par soft reservation.
- Le SDK peut effectuer des opérations list/add/remove et reconnaître l'événement `artifact_changed`.

Il est recommandé de publier d'abord cette version pour des tests sous une forme expérimentale et conditionnée par une capability. Le terme « expérimental » signifie ici que l'implémentation et l'UI peuvent continuer à être affinées, mais pas que le protocole peut être cassé arbitrairement : les champs et la sémantique des événements déjà exposés au client doivent évoluer selon les règles de compatibilité suivantes.

Extensions futures non breaking :

- Ajout de champs optionnels sur l'artifact de réponse.
- Ajout de nouveaux littéraux pour `kind` / `status` / `source` / `storage`, mais le SDK typé doit déclarer ces champs comme des unions ouvertes, et le client doit tolérer les valeurs inconnues : un `kind` inconnu est traité comme `other`, un `status` inconnu s'affiche comme un état inconnu sans bloquer l'affichage de la liste, une `source` inconnue est traitée comme une source non groupée, un `storage` inconnu n'est affiché que de manière conservatrice via l'`url` / `workspacePath` disponible.
- Ajout de nouvelles routes, par exemple `GET /session/:id/artifacts/:artifactId`, route de preview, route de pin.
- Ajout de nouveaux types d'événements, mais la sémantique existante de `artifact_changed` reste inchangée.
- Ajout de nouvelles capabilities, par exemple `session_artifacts_preview`, `session_artifacts_persistence`.
- Ajustement des valeurs par défaut internes de la soft reservation, tant que la limite globale et la sémantique de l'événement d'eviction ne cassent pas les clients existants.

Modifications breaking nécessitant une nouvelle capability ou une nouvelle version :

- Modification des règles d'identité entraînant le changement de l'ID d'artifact pour une même URL/un même chemin.
- Transformation d'un champ optionnel existant en champ obligatoire.
- Suppression ou renommage de champs existants.
- Modification de la sémantique de `created` / `updated` / `removed` pour `artifact_changed.data.change.action`.
- Modification de la forme de l'enveloppe de `GET /session/:id/artifacts`.
- Faire en sorte que les liens textuels ordinaires de l'assistant ou les modifications de fichiers ordinaires entrent par défaut dans la liste des artifacts.
## 5. Modèle de données

### 5.1 Types du SDK public

```ts
type OpenStringUnion<T extends string> = T | (string & {});

export type DaemonSessionArtifactKind = OpenStringUnion<
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other'
>;

export type DaemonSessionArtifactStatus = OpenStringUnion<
  'available' | 'missing'
>;

export type DaemonSessionArtifactSource = OpenStringUnion<
  'tool' | 'hook' | 'client'
>;

export type DaemonSessionArtifactStorage = OpenStringUnion<
  'workspace' | 'managed' | 'external_url' | 'published'
>;

export interface DaemonSessionArtifact {
  id: string;
  kind: DaemonSessionArtifactKind;
  storage: DaemonSessionArtifactStorage;
  title: string;
  description?: string;
  status: DaemonSessionArtifactStatus;
  source: DaemonSessionArtifactSource;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DaemonSessionArtifactsEnvelope {
  v: 1;
  sessionId: string;
  artifacts: DaemonSessionArtifact[];
}

export interface DaemonArtifactChangedData {
  sessionId: string;
  change: DaemonSessionArtifactChange;
}

export interface DaemonSessionArtifactChange {
  action: 'created' | 'updated' | 'removed';
  artifactId: string;
  artifact?: DaemonSessionArtifact;
  reason?: 'eviction' | 'explicit';
}

export interface DaemonSessionArtifactMutationResult {
  v: 1;
  sessionId: string;
  changes: DaemonSessionArtifactChange[];
}
```

### 5.2 Types Core ToolArtifact

```ts
export type ToolArtifactKind =
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other';

export type ToolArtifactStorage =
  | 'workspace'
  | 'managed'
  | 'external_url'
  | 'published';

export interface ToolArtifact {
  kind?: ToolArtifactKind;
  storage?: ToolArtifactStorage;
  title: string;
  description?: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

L'ensemble des littéraux connus pour `ToolArtifactKind` / `ToolArtifactStorage` doit avoir une seule et unique source d'implémentation, afin d'éviter toute dérive manuelle entre le core, l'acp-bridge et le SDK. Approche recommandée :

- Définir les tuples constants `TOOL_ARTIFACT_KINDS` / `TOOL_ARTIFACT_STORAGES` dans le core, et exporter `ToolArtifactKind` / `ToolArtifactStorage`.
- L'acp-bridge réutilise les types du core comme ensemble connu pour la validation des entrées, et déclare les types publics du daemon comme une projection de protocole de ce même ensemble de valeurs.
- Le SDK ne doit pas réécrire une seconde union connue ; il réexporte les littéraux connus via les types de protocole exportés par l'acp-bridge ou les `.d.ts` générés au moment du build, puis enveloppe les types orientés réponse avec une union ouverte pour tolérer les nouvelles valeurs retournées par le daemon à l'avenir.
- Ajouter un test de round-trip kind/storage pour garantir que les littéraux connus font des allers-retours cohérents entre l'entrée du core, le store du bridge et la sortie du SDK ; ajouter également un test de fallback pour les valeurs inconnues du SDK afin de garantir la tolérance aux erreurs à l'exécution de l'union ouverte.

Et étendre avec :

```ts
export interface ToolResult {
  llmContent: unknown;
  returnDisplay: unknown;
  resultFilePaths?: string[];
  artifacts?: ToolArtifact[];
  error?: unknown;
}
```

### 5.3 Règles de complétion de l'entrée vers l'Artifact public

`ToolArtifact` est la forme d'entrée retournée par les outils, `SessionArtifactInput` est la forme d'entrée interne unifiée pour toutes les entrées avant d'entrer dans le store, et `DaemonSessionArtifact` est la forme retournée vers l'extérieur. Toutes les entrées doivent d'abord être converties en `SessionArtifactInput`, puis les champs publics sont complétés par le `SessionArtifactStore`.

```ts
export interface SessionArtifactInput extends ToolArtifact {
  source: 'tool' | 'hook' | 'client';
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  trustedPublisher?: true;
  receivedSeq?: number;
}
```

`trustedPublisher` est un flag d'entrée interne au bridge/store, ce n'est pas un champ définissable dans le schéma public ou par le client/hook. Dans les déploiements daemon/ACP de la V1, le sous-processus `qwen --acp` est lancé par le daemon et s'exécute sous le même utilisateur ; par conséquent, l'implémentation actuelle considère la mise à jour de session `ArtifactTool` complétée (`tool_call_update`, `status: 'completed'`, `_meta.toolName: 'artifact'`) comme le seul signal de trusted publisher. Ce signal n'est pas lu depuis le payload de l'artifact lui-même, et n'est pas accessible pour les POST client, les notifications de hook, `record_artifact` ou d'autres résultats d'outils.

Si à l'avenir on prend en charge les sandboxes distants, les participants ACP multiples ou les agents hors du domaine de confiance, il faudra ajouter une identité de publisher transport / in-process infalsifiable, puis remplacer ce signal de confiance V1 ; d'ici là, ne considérez pas `trustedPublisher` / `source` / `storage` dans le payload comme une base d'autorisation.

Règles de conversion de la source :

- `ArtifactTool` / publisher daemon : le BridgeClient ajoute uniquement `source: 'tool'`, `toolCallId`, `toolName` sur la mise à jour de session `ArtifactTool` complétée, et définit `trustedPublisher: true` via une option interne.
- Autres `ToolResult.artifacts` : copier les champs `ToolArtifact`, ajouter `source: 'tool'`, `toolCallId`, `toolName`, mais ne pas définir `trustedPublisher`.
- `record_artifact` : entre en tant que source d'outil, ajoute de même `source: 'tool'`, `toolCallId`, `toolName: 'record_artifact'`, mais `storage: 'published'` n'est pas autorisé, et `trustedPublisher` ne peut pas être défini.
- hook : copier les artifacts de sortie du hook, ajouter `source: 'hook'`, `hookName`, `extensionId` ; si le hook peut obtenir le contexte de l'outil déclencheur, il peut aussi ajouter `toolCallId` / `toolName`. Le Bridge doit dériver `source: 'hook'` du contexte de transport et ne doit pas faire confiance au champ `source` du payload.
- POST client : copier le body, ajouter `source: 'client'`, `clientId`, `storage: 'published'` n'est pas autorisé, et `trustedPublisher` ne peut pas être défini.
- `receivedSeq` : attribué par le bridge/store à la réception de l'entrée avec une valeur monotone croissante, utilisé pour un ordonnancement déterministe au sein d'un même lot ; les entrées externes ne peuvent pas spécifier ce champ.
- Le BridgeClient ne doit pas déduire `trustedPublisher` à partir des champs `source`, `storage`, `managedId`, `url`, `trustedPublisher` ou autres champs `_meta.artifacts[*]` dans le payload de l'artifact. La seule exception en V1 est le signal de mise à jour de session `ArtifactTool` complétée mentionné ci-dessus.

Règles de complétion :

- `id` : généré par le hash d'identité de la section 7.
- `source` : déterminé par le contexte d'entrée, `tool` pour les résultats d'outil / ArtifactTool, `hook` pour les hooks, `client` pour les POST client.
- `toolCallId` / `toolName` : ajoutés par le contexte de l'appel d'outil ; non remplis s'ils sont absents pour les entrées hook/client.
- `hookName` / `extensionId` / `clientId` : ajoutés si le contexte est disponible, utilisés pour l'audit et le regroupement dans l'UI.
- `createdAt` : écrit lors du premier upsert.
- `updatedAt` : rafraîchi à chaque upsert.
- `status` : lors de l'upsert d'un artifact workspace, on effectue un stat best-effort ; s'il existe et que la vérification de confinement réussit, il est `available`, s'il n'existe pas ou s'il y a une évasion de lien symbolique, il est `missing` ; pour les artifacts managed / URL en V1, aucun stat local n'est effectué, ils sont toujours `available`.
- Valeurs par défaut de `storage` :
  - `workspace` si `workspacePath` est présent.
  - Si `storage: 'published'` est présent, il doit provenir d'un `trustedPublisher`, sinon la validation échoue.
  - `managed` si `managedId` est présent et qu'il n'y a pas de `url`.
  - `external_url` si `url` est présent.
  - Les résultats publiés par `ArtifactTool` utilisent explicitement `published`.
- Valeurs par défaut de `kind` :
  - `html` si `storage: 'published'` et qu'aucun `kind` explicite n'est défini.
  - `link` si `url` est présent et qu'il n'y a pas de `workspacePath`.
  - Si `workspacePath` est présent, déduit par extension : `.html` -> `html`, extensions d'images -> `image`, extensions de vidéos -> `video`, extensions d'audio -> `audio`, `.pdf` -> `pdf`, `.ipynb` -> `notebook`, sinon `file`.
  - `other` si cela ne peut pas être déduit.

### 5.4 Contraintes des champs

- `workspacePath` n'est exposé à l'extérieur que pour les fichiers à l'intérieur du workspace, et doit être un chemin relatif au workspace.
- `managedId` est une référence à un artefact géré par le daemon/qwen-home, ce ne peut pas être un chemin absolu local.
- `url` n'accepte que les URL explicitement enregistrées ou les URL publiées par ArtifactTool.
- `workspacePath`, `managedId`, `url` : un et un seul primary locator doit être présent ; la V1 rejette les entrées normales portant plusieurs primary locateurs simultanément, afin d'éviter qu'une même ressource logique génère plusieurs identités selon les différents champs.
- La seule exception est le `storage: 'published'` de confiance : `url` est le primary locator, `managedId` peut être retourné ensemble comme référence gérée optionnelle pour de futurs téléchargements/aperçus ; dans ce cas, l'identité est calculée uniquement sur `url`, `managedId` ne participe pas à l'identité. Cette exception n'accepte que les entrées internes avec `trustedPublisher: true`.
- Les outils standards ne doivent pas retourner `~/.qwen`, `/tmp` ou d'autres chemins absolus locaux comme `workspacePath`.
- `title` est obligatoire, sa longueur après trim doit être de 1 à 200 caractères, les caractères de contrôle ASCII ne sont pas autorisés ; c'est du texte brut, il ne porte pas de sémantique HTML ou markdown.
- `description` est un texte brut d'assistance pour l'UI, il n'entre pas dans le contexte du modèle.
- `description` peut contenir au maximum 1000 caractères après trim, les caractères de contrôle ASCII ne sont pas autorisés, et il ne porte pas de sémantique HTML ou markdown.
- `metadata` doit être un petit objet, seules les valeurs primitives sont autorisées.
- `metadata` ne doit pas contenir de secrets, tokens, cookies ou clés privées de signature.
- `sizeBytes` est best-effort.
- `DaemonSessionArtifactsEnvelope` ne retourne pas le `workspaceCwd` absolu de l'hôte ; le client s'appuie uniquement sur des chemins relatifs comme `workspacePath` et sur le champ `storage` pour l'affichage.

## 6. Sources de collecte des artifacts

### 6.1 Point d'entrée des sorties de fichiers

La V1 ne dérive pas automatiquement d'artifacts à partir des outils d'édition de fichiers standards.

Non dérivés automatiquement :

- `ToolNames.WRITE_FILE`
- `ToolNames.EDIT`
- `ToolNames.NOTEBOOK_EDIT`
- `read_file`
- `grep_search`
- `glob`
- `list_directory`
- `web_fetch`
- `run_shell_command`

Raisons :

- L'édition de code source standard, les modifications de configuration et les corrections de tests relèvent de l'historique des changements de fichiers / diffs / patches.
- Placer automatiquement chaque édition de source dans le panneau des artifacts générerait beaucoup de bruit.
- La zone des artifacts à droite devrait être réservée aux sorties de session réutilisables, prévisualisables, téléchargeables ou partageables.

Conditions pour qu'un fichier entre dans le store d'artifacts :

- Le résultat de l'outil retourne explicitement `ToolResult.artifacts`.
- Sortie publiée par `ArtifactTool`.
- Enregistrement explicite via `record_artifact` / hook / POST client en V1.
- Si à l'avenir une dérivation pratique est nécessaire, seuls les fichiers de sortie générés seront autorisés, et le résultat de l'outil ou des métadonnées structurées devront être marqués comme artifact ; ne pas déduire par défaut à partir de `WRITE_FILE` / `EDIT` standards.

Exemples de sorties générées :

- rapports : `.html`, `.pdf`, `.md`
- médias : `.png`, `.jpg`, `.mp4`, `.mp3`
- bureautique/données : `.xlsx`, `.docx`, `.pptx`, `.csv`
- notebooks : `.ipynb` générés en tant que livrables

Même pour les notebooks, il faut distinguer "l'édition d'un fichier source notebook existant" et "la génération d'un artifact notebook pour que l'utilisateur le consulte/télécharge".

### 6.2 ArtifactTool

Après une publication réussie, `ArtifactTool` retourne :

```ts
artifacts: [
  {
    kind: 'html',
    storage: 'published',
    title,
    url,
    managedId,
    mimeType: 'text/html',
  },
];
```

Conserver les `llmContent`, `returnDisplay`, `resultFilePaths` existants pour garantir la compatibilité.

Le publisher local actuel de `ArtifactTool` peut écrire le contenu dans le répertoire géré sous qwen home, et retourner une URL `file://` ou distante. L'API d'artifacts du daemon ne doit pas exposer le chemin absolu local de qwen home comme `workspacePath` ; il doit utiliser :

- `storage: 'published'`
- `url` : l'URL accessible publiée, qui est aussi le primary locator de l'artifact publié
- `managedId` : référence gérée interne optionnelle, ne participe pas à l'identité
- Le BridgeClient définit `trustedPublisher: true` via une option interne sur la mise à jour de session `ArtifactTool` complétée. Le Bridge ne doit pas déduire ce flag à partir des paramètres du modèle, du payload du hook, du body du POST client ou des champs `_meta.artifacts[*]` standards.

Si à l'avenir on veut permettre au client daemon de télécharger ou de prévisualiser le contenu géré, il faudra ajouter une route d'artifact géré dédiée, plutôt que d'insérer le chemin absolu local dans l'artifact public.

### 6.3 Outil record_artifact

En tant que point d'entrée d'enregistrement explicite pour les modèles/skills en V1, ajout d'un outil intégré léger :

```ts
ToolNames.RECORD_ARTIFACT = 'record_artifact';
```

Utilisations :

- Enregistrement explicite d'artifacts non liés à des fichiers par le modèle.
- Les skills / agent.md peuvent demander au modèle d'appeler cet outil après avoir construit une URL métier.
- Chaque appel n'enregistre qu'un seul artifact ; l'enregistrement en lot est effectué par le modèle en appelant l'outil plusieurs fois, afin d'éviter les ambiguïtés de feedback de succès/échec partiel dans un seul appel d'outil.
- Ne fait pas de requêtes réseau.
- N'écrit pas de fichiers dans le workspace.
- Écrit uniquement dans l'index des artifacts de session.

Paramètres :

```ts
interface RecordArtifactParams {
  title: string;
  description?: string;
  kind?: ToolArtifactKind;
  storage?: Exclude<ToolArtifactStorage, 'published'>;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Exemple :

```json
{
  "title": "用户画像资源详情",
  "description": "内部数据平台生产环境资源详情页",
  "kind": "link",
  "storage": "external_url",
  "url": "https://platform.example.com/resources/user-profile?env=prod",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "data_platform_resource",
    "env": "prod"
  }
}
```

Retourne :

```ts
return {
  llmContent: {
    recorded: true,
    title: params.title,
    location: params.workspacePath ?? params.managedId ?? params.url,
    note: 'The daemon will expose the assigned artifact id through artifact_changed and list APIs.',
  },
  returnDisplay: 'Recorded artifact: 用户画像资源详情',
  artifacts: [params],
};
```

`record_artifact` effectue une validation au niveau des paramètres avant de retourner ; en cas d'échec, il retourne une erreur d'outil et ne produit pas de `ToolResult.artifacts`. Comme un seul appel ne concerne qu'un seul artifact, la V1 n'a pas besoin de définir de succès partiel en lot. L'`id` attribué par le serveur est généré par le store du daemon et exposé au client via `artifact_changed` / `GET /session/:id/artifacts`.

`record_artifact` n'accepte pas `storage: 'published'`, ni l'exception publiée `url + managedId`. Les modèles/skills ne peuvent enregistrer que des artifacts workspace, managed ou external URL ; les artifacts de type publié doivent provenir d'ArtifactTool / du publisher daemon.

Recommandations d'autorisation :

- Il n'est pas recommandé de l'enregistrer par défaut dans toutes les sessions ; il doit être soumis à un feature-gate, ou activé explicitement par un skill/une extension.
- S'il est activé, il peut être autorisé par défaut (`allow`), car il ne modifie que les métadonnées de l'UI de session.
- Les URL ne s'ouvrent pas automatiquement.
- Le client affiche l'hôte, permettant à l'utilisateur d'identifier la cible avant de cliquer.
- Si à l'avenir `file://` est autorisé, seuls les fichiers à l'intérieur du workspace devront être autorisés ; la V1 ne recommande pas que `record_artifact` accepte les URL `file://`.
- Comme pour les hooks/POST client, il doit passer par la validation unifiée des artifacts.

### 6.4 Artifacts de sortie des hooks

Extension du point d'entrée d'enregistrement explicite pour les hooks/extensions en V1. Les hooks actuels prennent déjà en charge command/HTTP/function/prompt, et les hooks command/HTTP peuvent retourner un `HookOutput` JSON. Il est recommandé d'étendre `hookSpecificOutput` :

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "调度任务详情",
        "url": "https://ops.example.com/task/task_123",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    ]
  }
}
```

Cas d'utilisation appropriés :

- Le hook PostToolUse observe la sortie d'un MCP/outil et construit une URL métier selon les règles de l'organisation.
- Les extensions fournissent des hooks pour injecter des URL de ressources internes à l'entreprise dans la zone des artifacts à droite.
- Le frontmatter du skill enregistre un hook PostToolUse pour enregistrer automatiquement des artifacts pendant la durée de vie du skill.
- Après l'échec d'un outil, le hook PostToolUse enregistre une trace d'erreur, un tableau de bord d'exécution échouée ou un lien de dépannage.
- Les artifacts PostToolBatch ne sont intégrés que s'il existe un véritable point d'appel PostToolBatch à l'exécution et si les résultats peuvent être envoyés au bridge daemon ; la session principale daemon ACP V1 ne suppose pas que ce canal existe.

Modifications de code requises :

- `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `mergeWithOrLogic()` dans `packages/core/src/hooks/hookAggregator.ts` doit ajouter une logique de concaténation pour `artifacts`, au lieu d'utiliser la logique last-writer-wins actuelle de `hookSpecificOutput`.
- Ajouter `artifacts?: ToolArtifact[]` à `PostToolUseHookResult` / `PostToolBatchHookResult` dans `packages/core/src/core/toolHookTriggers.ts`.
- `firePostToolUseHook()` retourne `artifacts?: ToolArtifact[]`.
- `firePostToolBatchHook()` retourne `artifacts?: ToolArtifact[]`.
- `packages/core/src/core/coreToolScheduler.ts` doit être inclus dans le plan d'implémentation, car c'est le point d'appel de `firePostToolBatchHook()` et il possède également un chemin indépendant pour `firePostToolUseHook()`.
- Extraire un helper partagé `collectHookArtifacts()` ou équivalent, pour que les deux chemins PostToolUse de `coreToolScheduler.ts` et de l'ACP `Session.ts` réutilisent la même logique préalable d'extraction / validation, évitant ainsi toute dérive de comportement entre les deux.
- `Session.runTool()` collecte les artifacts de résultat d'outil et les artifacts de hook, mais les deux utilisent des transports différents : les artifacts de résultat d'outil proviennent uniquement des résultats d'outil retournés avec succès ; les artifacts de hook ne dépendent pas du succès de l'outil, le chemin d'échec peut également entrer dans le store.
- Dans l'ACP `Session.runTool()`, les artifacts portés par les résultats d'outils réussis continuent d'être attachés à `tool_call_update._meta.artifacts` ; les artifacts retournés par les hooks PostToolUse / PostToolUseFailure sont envoyés séparément et de manière unifiée via `client.extNotification('qwen/notify/session/artifact-event', payload)`. Cette notification doit être attendue de manière synchrone après la collecte des artifacts du hook ; un échec d'envoi enregistre uniquement un warning et ne modifie pas le résultat d'échec/succès de l'outil d'origine ; ce lot d'artifacts de hook n'entre pas dans le store du daemon, la V1 ne fait pas de retry persistant.
- Les artifacts de hook suivent la même validation que `record_artifact` / POST client : schéma d'URL, confinement du chemin du workspace, taille/type des métadonnées.
- Lorsque les artifacts de niveau batch n'ont pas d'appel d'outil unique, `qwen/notify/session/artifact-event` ne peut être utilisé que si l'exécution est déjà capable d'envoyer une `extNotification` ACP au bridge.
Payload `qwen/notify/session/artifact-event` :

```json
{
  "artifacts": [
    {
      "kind": "link",
      "storage": "external_url",
      "title": "批处理任务详情",
      "url": "https://ops.example.com/task/batch_123",
      "mimeType": "text/html"
    }
  ],
  "source": "hook",
  "hookEventName": "PostToolBatch",
  "hookName": "task-artifacts",
  "extensionId": "example-extension"
}
```

Conventions de transport :

- `qwen/notify/session/artifact-event` est une `extNotification` ACP, pas un événement SSE, ni une route HTTP côté client.
- Le format wire réutilise les conventions de notification `qwen/notify/session/*` existantes ; par exemple, le modèle de démultiplexage (demux) de notification de session déjà présent dans le bridge.
- L'expéditeur doit être un runtime ou un bridge d'extension déjà présent dans le canal de session ACP et capable d'envoyer des `extNotification`. `Session.ts` d'ACP peut envoyer cette notification ; `coreToolScheduler.ts` ne peut pas envoyer cette notification directement à la session principale du daemon.
- `BridgeClient` démultiplexe (demux) par nom de notification dans la branche de traitement `extNotification` existante : lorsqu'il intercepte `qwen/notify/session/artifact-event`, il lit le payload, le convertit en `SessionArtifactInput[]`, puis l'envoie dans le pipeline d'ingestion unifié.
- Le bridge doit dériver `source: 'hook'` à partir du contexte de transport de la notification ; la `source` dans le payload ne sert que d'indication de compatibilité. Si la source du payload est incohérente avec le contexte de transport, le bridge la remplace par `hook` et enregistre un log debug/warning. Le payload de notification ne peut pas définir `trustedPublisher` ; s'il contient `storage: 'published'`, il est traité comme une entrée non fiable (untrusted input) ayant échoué à la validation.

Remarque : `qwen/notify/session/artifact-event` n'est qu'une enveloppe de transport pour les artifacts explicites et ne doit pas créer un deuxième pipeline de store/validation/déduplication. `BridgeClient` doit convertir `_meta.artifacts`, les artifacts de hook et `artifact-event.artifacts` dans le même `SessionArtifactInput[]`, en appelant le même `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`, et en réutilisant la même logique de validation, normalisation, enrichissement, eviction et publication de `artifact_changed`. La session principale ACP n'a actuellement pas de callsite pour `PostToolBatch` ; le batch hook de `coreToolScheduler.ts` ne doit pas être considéré comme la source par défaut pour le panneau d'artifacts du daemon. Pour prendre en charge les batch artifacts de la session principale du daemon à l'avenir, de véritables points d'appel et des tests devront d'abord être ajoutés. Les runtimes non-ACP ne peuvent pas déclarer la prise en charge des artifacts de hook du daemon s'ils n'ont pas de sink de notification d'artifacts.

### 6.5 Insertion directe par le Client / l'Extension

Pour les scénarios où l'on ne souhaite pas que le modèle appelle un outil, on fournit :

```http
POST /session/:id/artifacts
```

Adapté pour :

- Les plugins d'IDE ajoutant l'URL de prévisualisation actuellement ouverte à la zone des artifacts.
- Les utilisateurs de WebUI ajoutant manuellement un lien de ressource.
- Les plugins de canal ou les intégrations externes enregistrant des ressources de plateforme au cours d'une tâche.

Différences avec la sortie de hook :

- La sortie de hook est adaptée à l'interne de la chaîne d'exécution de l'agent.
- La route POST est adaptée aux clients daemon / UI / intégrations externes.
- Le corps (body) POST doit subir une validation d'artifact unifiée ; les chemins absolus locaux arbitraires ou les schémas d'URL non pris en charge ne sont pas autorisés.

## 7. Store et déduplication

Identité de l'artifact :

- Fichier workspace : `sessionId + ':workspace:' + normalizedWorkspacePath`
- Fichier managed : `sessionId + ':managed:' + normalizedManagedId`
- URL external / published : `sessionId + ':url:' + identityUrl`

L'identité décrit uniquement l'emplacement de la ressource et n'inclut pas la `source`. Les enregistrements d'un même URL ou chemin par un outil, un hook ou un client sont fusionnés en un seul artifact pour éviter d'afficher la même ressource en double dans le panneau de droite. V1 ne maintient pas de `provenance[]`, de niveau de confiance ou de classe de rétention ; le premier enregistrement réussi détient les champs d'affichage et d'audit de source de cet artifact, les enregistrements ultérieurs de même identité exprimant simplement "la même ressource a été observée à nouveau".

L'entrée doit contenir un et un seul champ de localisation :

- `workspacePath`
- `managedId`
- `url`

Si l'entrée contient plusieurs localisateurs primaires (primary locator), V1 la rejette directement au lieu d'essayer de deviner l'identité par ordre de priorité. Cela évite qu'un artifact soit d'abord dédupliqué par `workspacePath`, puis par `url`, ce qui créerait des doublons.

`storage: 'published'` est la seule exception : il doit contenir `url` comme localisateur primaire, et peut éventuellement contenir `managedId` comme référence managed. L'identité published est toujours calculée par `url` ; `managedId` sert uniquement pour les téléchargements/prévisualisations futurs et ne participe pas à la déduplication. Cette exception n'accepte que les entrées avec l'attribut interne `trustedPublisher: true` ; les hooks, les POST clients, `record_artifact` ou les outils standards renvoyant `storage: 'published'` sont traités comme des échecs de validation.

ID public :

- Utilise les 12 premiers caractères du sha256 de l'identité.

### 7.1 Normalisation

`normalizedWorkspacePath` :

- L'entrée doit être un chemin relatif au workspace (workspace-relative path) ; si un chemin absolu est fourni à l'entrée, on tente d'abord de le convertir en chemin relatif au workspace, sinon on le rejette.
- Utilise `path.resolve(workspaceCwd, input)` pour obtenir le chemin absolu.
- Vérifie que le chemin résolu (resolved path) se trouve bien dans le workspace : `path.relative(workspaceCwd, resolved)` ne doit pas commencer par `..` et ne doit pas être un chemin absolu.
- Si la cible existe déjà, utilise `fs.realpath` pour vérifier que la cible finale du symlink se trouve toujours dans le workspace ; rejette si le symlink pointe en dehors du workspace.
- Si la cible n'existe pas, l'enregistrement (registration) peut conserver cet artifact, mais son `status` initial doit être `missing` ; il ne faut pas sauter la vérification de confinement du symlink sous prétexte que `realpath` a échoué. Lors du rafraîchissement TTL GET ultérieur, la même vérification de confinement + realpath doit être réexécutée.
- Si lors du rafraîchissement on découvre que le chemin est devenu un symlink pointant hors du workspace, l'artifact est conservé mais son `status` passe à `missing`, et le `sizeBytes` best-effort est effacé ; V1 ne rapportera jamais ce chemin comme `available`.
- La sortie utilise uniformément des slashes POSIX et supprime le `./` initial.
- Pas de normalisation de la casse ; même si le système de fichiers par défaut de macOS est insensible à la casse, l'identité fait toujours la distinction au niveau de la chaîne de caractères pour éviter les incohérences de comportement multiplateforme.

`normalizedManagedId` :

- L'entrée est d'abord débarrassée des espaces ASCII (trim ASCII whitespace).
- Après le trim, elle ne doit pas être vide et sa longueur ne doit pas dépasser 200 caractères.
- Rejette les caractères de contrôle ASCII.
- Rejette `/`, `\`, `..` ; n'autorise pas l'expression de hiérarchie de chemin ou de sémantique de chemin absolu local.
- Pas de normalisation de la casse, l'identité fait la distinction au niveau de la chaîne de caractères.
- Le `managedId` public renvoie la valeur normalisée.

`identityUrl` et `url` :

- Utilise le parseur WHATWG `new URL(input)`, les vérifications souples comme `startsWith('http')` sur les chaînes de caractères sont interdites.
- À l'exception des URL published de confiance (trusted) de `ArtifactTool`, les artifacts de lien (link) standards n'autorisent que `http:` / `https:`.
- Le champ `url` conserve l'URL nettoyée et cliquable pour que le client puisse l'ouvrir ; ne réécris pas l'identité en URL cliquable.
- L'identité est calculée séparément via l'`identityUrl` interne et n'est pas renvoyée en tant que champ public.
- Le scheme et le host sont en minuscules.
- Normalisation des ports par défaut : `https:443` / `http:80` ne sont pas conservés.
- Conserve le fragment ; dans les SPA routées par hash, le fragment peut faire partie de l'identité de la ressource.
- Conserve l'ordre original des paramètres de requête (query) ; certaines plateformes sont sensibles à l'ordre des query, V1 ne trie pas les query.
- Rejette ou efface `username` / `password`, ne stocke pas les informations utilisateur (userinfo) de l'URL dans le store d'artifacts.

Comportement de déduplication :

- Premier enregistrement : `created`
- Réenregistrement de la même identité : `updated`
- `createdAt` reste inchangé.
- `updatedAt` est mis à jour, mais ne participe pas au tri d'eviction.
- Au sein d'un même `upsertMany()`, les entrées sont d'abord fusionnées par identité ; le propriétaire d'une même identité est déterminé par l'entrée ayant le plus petit `receivedSeq`, ou par l'ordre du tableau d'entrées si `receivedSeq` est absent. `BridgeClient` ne doit pas fusionner de manière désordonnée les artifacts de différents événements de transport ; si la fusion est nécessaire, il faut d'abord attribuer un `receivedSeq` puis trier. Chaque identité finale ne produit qu'un seul changement dans `changes[]`. Si cette identité n'existait pas avant ce lot, il s'agit de `created`, sinon de `updated`.
- Les champs d'affichage `title`, `description`, `source`, `toolCallId`, `toolName`, `hookName`, `extensionId`, `clientId` suivent la règle du premier rédacteur gagnant (first-writer-wins) et ne sont pas écrasés par les entrées ultérieures de même identité.
- Les champs du corps de la ressource autorisent une mise à niveau sécurisée : lorsqu'une identité de même URL passe de `external_url` à `published`, il est possible de mettre à jour `storage`, d'ajouter `managedId`, de mettre à jour `kind` / `mimeType` / `sizeBytes`, et d'autoriser le publisher à écraser `title` / `description`, évitant ainsi qu'un titre de lien placeholder masque définitivement la véritable publication. Cette mise à niveau n'accepte que les entrées `storage: 'published'` avec l'attribut interne `trustedPublisher: true`.
- Il est autorisé de compléter un `managedId` vide pour en faire une référence managed published ; un `managedId` existant n'est pas écrasé par des entrées standards ultérieures.
- `status` et `sizeBytes` sont des champs dérivés best-effort du daemon et peuvent être rafraîchis lors du stat du workspace ou de l'enrichissement de l'artifact published.
- `metadata` conserve le petit objet validé lors du premier enregistrement ; pour les entrées ultérieures de même identité, seules celles avec `source: 'tool'` ou `source: 'client'` peuvent effectuer un enrichissement contrôlé : ajout de clés inexistantes uniquement, sans écraser les clés existantes, avec une revalidation primitive-only et de la taille totale de 4 Ko après fusion. L'enrichissement des metadata par un hook pour un artifact existant est ignoré par défaut. Si la limite est dépassée après fusion, seul l'enrichissement de metadata de cette opération est abandonné avec un log warning, les autres mises à niveau sécurisées de l'artifact pouvant se poursuivre.
- Un POST client de même identité n'écrase pas les champs d'affichage et ne modifie pas `retentionSource` ; il se contente de mettre l'attribut interne `clientRetained` à `true` pour exprimer l'intention de rétention manuelle par l'utilisateur.
- L'implémentation doit traiter de manière synchrone au sein d'un seul `SessionArtifactStore.upsertMany()` pour éviter les conditions de course (race conditions) de type lecture-modification-écriture asynchrone.

Champs internes du store :

- `retentionSource` : la `source` du premier enregistrement réussi, attribuée à la création, et qui ne change pas ensuite avec les POST clients ou les upsert répétés.
- `clientRetained` : booléen, initialement à `source === 'client'` ; passe à `true` lorsque n'importe quel POST client passant par la mutation gate atteint la même identité. `clientRetained` ne modifie pas les champs d'affichage et ne migre pas le bucket `retentionSource`.
- `insertSeq` : numéro de séquence monotone croissant dans le store, attribué une seule fois lors de la création de l'artifact et jamais rafraîchi.
- `receivedSeq` : ordre de réception des entrées, utilisé uniquement pour le coalescing déterministe au sein d'un même lot, et non renvoyé en tant que champ public.

Quotas et politique de rétention :

- Maximum 200 artifacts par session.
- V1 utilise une réservation de source souple (soft source reservation), la réservation étant attribuée selon la `retentionSource` interne :
  - `tool` : 100
  - `client` : 50
  - `hook` : 50
- La réservation est un quota de rétention minimum, pas une limite stricte ; les quotas inutilisés peuvent être empruntés par d'autres sources, jusqu'à la limite globale de 200.
- Lorsque la création de nouveaux artifacts fait dépasser le total de 200, les candidats à l'eviction sont sélectionnés dans l'ordre suivant. Les artifacts nouvellement créés dans le lot `upsertMany()` n'entrent pas par défaut dans le pool de candidats ; l'eviction sélectionne d'abord les candidats uniquement parmi les artifacts existant avant le début de ce lot. Ainsi, un artifact missing nouvellement enregistré dans ce lot peut évincer un ancien artifact encore live dans un store plein, ce qui est le choix fait par V1 pour garantir la visibilité des artifacts explicites actuels.
  1. Priorité à l'éviction des artifacts avec `status: 'missing'` et `clientRetained === false`.
  2. Ensuite, éviction des artifacts avec `clientRetained === false` parmi les sources dont le nombre de `retentionSource` dépasse la réservation.
  3. Puis éviction des artifacts les plus anciens avec `clientRetained === false`.
  4. Si tous les artifacts ont `clientRetained === true`, éviction de l'artifact client-retained le plus ancien.
- Avant d'utiliser la priorité `missing` en cache pour l'eviction, il faut effectuer un rafraîchissement de statut / vérification de confinement best-effort sur les artifacts workspace sur le point d'être candidats ; s'il passe à `available` après rafraîchissement, il ne faut plus le considérer comme missing pour une eviction prioritaire. En cas d'échec du rafraîchissement, l'état en cache original est conservé.
- `clientRetained` est une préférence d'éviction en dernier recours, pas un pin infini, et ne dépasse pas la limite globale de 200 ni la réservation souple. Lorsque tous les artifacts sont client-retained, l'éviction se fait toujours sur l'artifact client-retained le plus ancien.
- Si, après avoir évincé les anciens artifacts, les artifacts nouvellement créés de ce lot dépassent encore la capacité restante, le store doit conserver les N premières nouvelles identités selon l'ordre `receivedSeq` / ordre d'entrée avant de générer `changes[]`, abandonner les entrées excédentaires de ce lot et enregistrer un warning/diagnostic. Les nouvelles entrées abandonnées n'entrent pas dans le store et ne produisent pas de changement `created` ou `removed` ; ainsi, au sein d'une même mutation, une même identité ne sera pas `created` puis `removed`.
- Le tri "le plus ancien" utilise `(createdAt, insertSeq)`, `insertSeq` étant le numéro de séquence monotone croissant interne au store, utilisé pour stabiliser les égalités (tiebreaker) pour les entrées de la même milliseconde ou du même lot.
- Le réenregistrement de la même identité rafraîchit `updatedAt`, mais l'eviction ne regarde pas `updatedAt` ; ainsi, d'autres sources ne peuvent pas maintenir un ancien artifact dans l'ensemble de rétention par des réenregistrements à haute fréquence.
- Renvoie par ordre croissant de `createdAt`.
- L'éviction doit envoyer `artifact_changed` / `removed` pour chaque artifact supprimé. V1 ne fournit pas d'autres événements d'éviction.
- Les valeurs de réservation, `retentionSource`, `clientRetained` et `insertSeq` sont des détails d'implémentation de V1, pas des champs du protocole wire ; les valeurs par défaut pourront être ajustées ultérieurement sans modifier la forme de l'API, ou des quotas par producteur plus fins pourront être ajoutés.

### 7.2 Limites du cycle de vie V1

Le store V1 est un index en mémoire pour les sessions de bridge actives (live) :

- Les artifacts ne sont pas restaurés après le redémarrage du bridge/de la session.
- Après la reconnexion d'un client SSE suite à une déconnexion, il doit relancer un `GET /session/:id/artifacts` pour effectuer une synchronisation par snapshot.
- V1 n'exige pas d'événement `artifacts_reset` supplémentaire ; si un mode d'exécution est pris en charge ultérieurement où la session continue d'exister mais le store d'artifacts est vidé, un événement `artifacts_reset` ou un événement équivalent de snapshot-invalidated sera ajouté.
- La restauration historique, la persistance inter-processus et la relecture de chargement de session appartiennent aux phases ultérieures.

## 8. Chaîne d'implémentation interne

Les phases suivantes représentent l'ordre de mise en œuvre technique d'une capacité V1 complète et unique, et ne signifient pas une division en plusieurs versions pour l'extérieur. Les PR d'implémentation peuvent être découpées par phase, mais la base de conception une fois fusionnées est une capacité complète d'artifacts de session.

### 8.1 Phase A : core types et ArtifactTool

Modifications :

- `packages/core/src/tools/tools.ts`
  - Ajout de `ToolArtifactKind`, `ToolArtifactStorage`, `ToolArtifact`.
  - Extension de `ToolResult.artifacts?`.
- `packages/core/src/tools/artifact/artifact-tool.ts`
  - Remplissage de `artifacts` après une publication réussie.
  - Utilisation de `storage: 'published'`, sans exposer les chemins locaux de qwen home en tant que `workspacePath`.

La phase A intègre d'abord `ToolResult.artifacts` et `ArtifactTool` ; `record_artifact` est intégré dans la phase D, mais fait toujours partie de la même capacité V1 complète.

### 8.2 Phase B : métadonnées de session cli ACP

Modifications :

- `packages/cli/src/acp-integration/session/types.ts`
  - `ToolCallResultParams.artifacts?`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`
  - `_meta.artifacts = params.artifacts`
- `packages/cli/src/acp-integration/session/Session.ts`
  - Collecte de `toolResult.artifacts` après le succès de l'outil.
  - Les artifacts du hook PostToolUse sont collectés indépendamment du succès/échec de l'outil, pour servir de artifacts de diagnostic d'échec (error trace / dashboard, etc.).
  - Les artifacts du hook sur le chemin d'échec ne doivent pas dépendre des métadonnées de résultat de succès ; si nécessaire, appeler directement l'ingestion d'artifacts du bridge.
  - Ne pas dériver automatiquement d'artifacts à partir des `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` standards.
  - Transmettre à `emitResult()`.

### 8.3 Phase C-1 : store et événements acp-bridge

Ajouts :

- `packages/acp-bridge/src/sessionArtifacts.ts`
  - Types
  - normalize
  - validation
  - id/hash
  - `SessionArtifactStore`

Ajout à l'entrée de session du bridge :

```ts
artifacts: SessionArtifactStore;
```

Ajout à l'interface du bridge :

```ts
getSessionArtifacts(sessionId: string): SessionArtifactsEnvelope;
addSessionArtifacts(
  sessionId: string,
  artifacts: SessionArtifactInput[],
): DaemonSessionArtifactMutationResult;
removeSessionArtifact(
  sessionId: string,
  artifactId: string,
): DaemonSessionArtifactMutationResult;
```

BridgeClient :

- Extrait les artifacts depuis `session_update/tool_call_update._meta.artifacts`.
- Extrait les artifacts de notification explicite depuis `qwen/notify/session/artifact-event`.
- Toutes les entrées sont converties dans le même `SessionArtifactInput[]`.
- Attribue `source` et `receivedSeq` en fonction du contexte de transport. `trustedPublisher` est attribué uniquement par l'option d'ingestion côté bridge des mises à jour de session `ArtifactTool` complétées ; `BridgeClient` ne doit pas le déduire à partir des champs du payload d'artifact ou du contenu standard de `_meta.artifacts`.
- Appel unifié à `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`, ne pas créer un deuxième système de validation ou de déduplication pour les artifacts de notification.
- `upsertMany()` renvoie un `DaemonSessionArtifactMutationResult`, contenant les changements created/updated ainsi que les changements removed générés par l'eviction.
- Publie `artifact_changed` pour chaque changement, en publiant d'abord created/updated, puis removed.
- `removeSessionArtifact()` supprime l'artifact du store, renvoie un changement removed avec `reason: 'explicit'`, et publie `artifact_changed`.

### 8.4 Phase C-2 : API de service de snapshot

Modifications :

- `packages/cli/src/serve/capabilities.ts`
  - Ajout de `session_artifacts`.
- `packages/cli/src/serve/server.ts`
  - Ajout de `GET /session/:id/artifacts`.
  - Ajout de `DELETE /session/:id/artifacts/:artifactId`.

Comportement de GET :

- Si la session n'existe pas : 404 existant.
- S'il n'y a pas d'artifacts : renvoie un tableau vide.
- L'artifact workspace maintient un cache de statut interne, par exemple `lastStatAt`, `lastKnownSizeBytes`, `lastKnownStatus`.
- Effectue un stat best-effort lors de l'upsert.
- GET utilise le cache par défaut ; ne rafraîchit selon le TTL (par exemple 5-30 secondes) que lorsque `lastStatAt` est expiré, en limitant le nombre de stats simultanés. Lors du rafraîchissement, il faut réexécuter le confinement workspace et la vérification de symlink realpath de la section 7.1.
- En cas d'échec du stat : GET renvoie `status: 'missing'`, sans supprimer l'artifact.
- Si le stat réussit et que la vérification de confinement / realpath est toujours valide : si le cache était précédemment `missing`, GET renvoie `status: 'available'`.
- Si le rafraîchissement détecte une évasion de symlink (symlink escape) ou un échec de confinement workspace, GET renvoie `status: 'missing'` et ne renvoie pas de nouveau `sizeBytes`.
- GET peut rafraîchir silencieusement le cache de statut, mais ne doit pas publier `artifact_changed` en raison d'une requête de lecture ; le statut V1 est à cohérence finale pour les clients SSE.
- Si des événements de statut en temps réel sont nécessaires ultérieurement, ils doivent être publiés par un rafraîchissement en arrière-plan ou une mutation de rafraîchissement explicite via `artifact_changed` / `updated`, et ne pas être placés sur le chemin de lecture à chaud (hot read path) de GET.
- Les artifacts managed / URL ne sondent pas les chemins locaux et renvoient toujours `status: 'available'`.

### 8.5 Phase C-3 : prise en charge de la liste/événements SDK
Modifications :

- `packages/sdk-typescript/src/daemon/types.ts`
  - Ajout du type `artifact`.
- `packages/sdk-typescript/src/daemon/events.ts`
  - Ajout de l'événement connu `artifact_changed`.
- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
  - `listSessionArtifacts(sessionId, opts?, clientId?)`
  - `addSessionArtifact(sessionId, artifact, clientId?)`
  - `removeSessionArtifact(sessionId, artifactId, clientId?)`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
  - `artifacts(opts?)`
  - `addArtifact(artifact)`
  - `removeArtifact(artifactId)`
- `packages/sdk-typescript/src/index.ts`
  - Export des types.

Le `add` singulier du SDK est mappé à la mutation plurielle du bridge : `addSessionArtifact(a)` est encapsulé dans `addSessionArtifacts(sessionId, [a])`, retournant le `DaemonSessionArtifactMutationResult` complet, sans ignorer les changements `removed` générés par l'éviction.

### 8.6 Phase D: record_artifact explicit registration

Modifications :

- `packages/core/src/tools/tool-names.ts`
  - Ajout de `RECORD_ARTIFACT: 'record_artifact'`.
- Nouveau fichier `packages/core/src/tools/record-artifact.ts`
  - Implémentation de `RecordArtifactTool`.
  - Les paramètres utilisent `workspacePath` / `managedId` / `url`, les chemins absolus locaux arbitraires ne sont pas acceptés.
  - `storage: 'published'` ou l'exception `url + managedId` published ne sont pas acceptés.
  - Sortie `ToolResult.artifacts`, en réutilisant le pipeline V1 store/event/list.
- `Config.createToolRegistry`
  - Enregistrement avec feature-gating ou opt-in skill/extension, pour éviter d'ajouter des outils visibles par le modèle à toutes les sessions.

### 8.7 Phase E: hook artifacts explicit registration

Modifications :

- `packages/core/src/hooks/types.ts`
  - `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `packages/core/src/hooks/hookAggregator.ts`
  - `mergeWithOrLogic()` concatène les `artifacts` de plusieurs hooks, au lieu d'appliquer la règle du last-writer-wins.
- `packages/core/src/core/toolHookTriggers.ts`
  - Ajout de `artifacts?: ToolArtifact[]` à `PostToolUseHookResult` / `PostToolBatchHookResult`.
- `packages/core/src/core/coreToolScheduler.ts`
  - Couvre le chemin de propagation des artifacts PostToolUse / PostToolBatch du core scheduler.
- `packages/cli/src/acp-integration/session/Session.ts`
  - Couvre le chemin de propagation des artifacts PostToolUse de la session ACP.
- Les deux chemins PostToolUse réutilisent le même helper de collecte d'artifacts de hook.
- La session ACP V1 ne déclare pas la prise en charge des artifacts PostToolBatch ; si le produit exige des artifacts batch pour la session principale du daemon, un callsite PostToolBatch réel doit être ajouté dans ACP Session, au lieu de s'appuyer sur le chemin de session principale non-daemon de `coreToolScheduler.ts`.
- Les autres runtimes disposant déjà d'une notification d'artifact au niveau du batch peuvent l'envoyer au bridge via `qwen/notify/session/artifact-event`.
- BridgeClient extrait les artifacts au niveau du batch depuis `qwen/notify/session/artifact-event`, en utilisant la même validation et le même upsert.

### 8.8 Phase F: client POST / SDK add explicit registration

Modifications :

- `packages/cli/src/serve/server.ts`
  - Ajout de `POST /session/:id/artifacts`, utilisant `mutate({ strict: true })`.
  - Ajout de `DELETE /session/:id/artifacts/:artifactId`, utilisant `mutate({ strict: true })`.
  - Validation du body.
  - La source est définie sur `client`.
  - Conversion en `SessionArtifactInput[]` à élément unique, appel de `addSessionArtifacts()` du bridge.
  - POST n'accepte pas `storage: 'published'` ni `trustedPublisher`.
  - DELETE appelle `removeSessionArtifact()` du bridge ; si l'artifact n'existe pas, retourne un `changes[]` vide sans publier de SSE.
  - Publication de `artifact_changed`, d'abord created/updated, puis removed.
- L'ajout d'artifact ne crée pas de nouvelle mutation bridge au singulier ; tous les nouveaux points d'entrée passent par `addSessionArtifacts()` / `upsertMany()`, évitant ainsi la dérive des comportements de validation, de coalescence et d'éviction. La suppression d'artifact utilise `removeSessionArtifact()` distinct, car elle supprime par l'artifact id attribué par le serveur, sans participer à la validation d'input / coalescence d'identité.

- Ajouts au SDK :
  - `DaemonClient.addSessionArtifact(sessionId, artifact, clientId?)`
  - `DaemonSessionClient.addArtifact(artifact)`
  - `DaemonClient.removeSessionArtifact(sessionId, artifactId, clientId?)`
  - `DaemonSessionClient.removeArtifact(artifactId)`

## 9. Limites de sécurité

### 9.1 URL

- Les artifacts de type link standard n'autorisent que `http:` / `https:`.
- Doit être analysé avec WHATWG `new URL(input)` et vérifier `parsed.protocol`, les vérifications basées sur les préfixes de chaîne sont interdites.
- Rejeter ou effacer `parsed.username` / `parsed.password` avant le stockage, pour éviter les fuites d'identifiants URL.
- `record_artifact` / hook / client POST n'autorisent pas `file://`.
- L'URL published `file://` retournée par `ArtifactTool` reste une exception, car elle provient d'une publication autorisée ; dans les scénarios de daemon distant, l'URL `https:` de l'éditeur distant doit être privilégiée.
- Le Daemon ne fetch pas les URL.
- Le Client affiche le host.
- Les URL ne s'ouvrent pas automatiquement.
- Le Client ne doit pas remplir automatiquement les external URL dans `<img>`, `<video>`, `<audio>`, `iframe` ou des éléments de prévisualisation similaires déclenchant des requêtes réseau, sous prétexte que `kind: 'image' | 'video' | 'audio' | 'html'`. En V1, pour les external URL, seules l'icône, le titre, le host et un point d'entrée cliquable sont affichés ; la prévisualisation distante nécessite un clic explicite de l'utilisateur ou doit être activée ultérieurement via une capability de prévisualisation dédiée et une stratégie de sandbox.
- Le Client doit afficher un avertissement ou bloquer les adresses de réseau privé telles que loopback, RFC 1918, link-local, metadata service, etc. ; le Daemon V1 ne résout pas les DNS et n'assume pas le jugement final de la protection SSRF.

### 9.2 Path

- Seuls les `workspacePath` sont retournés vers l'extérieur, ils doivent être des chemins relatifs au workspace.
- Les chemins en dehors du workspace ne sont pas exposés en tant que file artifacts.
- Si `record_artifact` / hook / client POST reçoivent un `workspacePath`, il doit se trouver à l'intérieur du workspace.
- L'algorithme de validation est détaillé dans la section 7.1 : vérification de containment avec `path.resolve` + `path.relative`, puis vérification d'échappement de symlink avec `fs.realpath` si la cible existe ; si la cible n'existe pas, l'artifact peut entrer dans le store, mais doit être marqué comme `missing`, et les GET/status refresh ultérieurs relanceront la même validation.
- Refuser les échappements `..`, les échappements de chemins absolus, les symlinks pointant hors du workspace, ainsi que les chemins externes locaux tels que `~/.qwen`, `/tmp`, etc.
- `managedId` ne peut référencer que le stockage géré par le daemon ; après trim, il ne peut pas être vide, et les séparateurs de chemin, `..`, caractères de contrôle et sémantiques de chemins absolus locaux sont refusés.

### 9.3 Metadata

- Taille limitée, par exemple pas plus de 4 Ko après JSON stringify.
- Seules les valeurs primitives sont autorisées.
- Les objets/tableaux imbriqués ne sont pas autorisés, pour éviter de complexifier l'UI et la persistance.
- Ne pas y placer de secrets, tokens, cookies, signed URLs, clés privées ou identifiants d'accès.
- Si les valeurs string des metadata sont affichées par l'UI, elles doivent être rendues ou échappées en tant que texte brut non fiable ; les metadata ne sont pas un point d'extension HTML/markdown.
- La V1 ne fournit pas de champs sans consommateur tels que `visibility`, `sensitivity`, `expiresAt`, `sourceId`, etc. ; la visibilité des artifacts est fixée à la sémantique session-local actuelle.
- Les dimensions d'audit sont portées par le `source` / `toolCallId` / `toolName` / `hookName` / `extensionId` / `clientId` du premier déclarant, ainsi que `createdAt` et `updatedAt`.
- Les déclarations ultérieures pour la même identité n'écrasent par défaut pas les champs d'affichage du premier déclarant ; la seule exception est la mise à niveau trusted `external_url -> published` définie dans la section 7, où l'éditeur peut écraser `title` / `description`. Les metadata n'autorisent que l'enrichissement contrôlé défini dans la section 7, pour éviter l'injection de metadata provenant de sources croisées.

### 9.4 Text Fields

- `title` / `description` sont du texte brut (plain text), pas du HTML, ni du markdown.
- La validation du Daemon doit appliquer des limites de longueur, le trim, et refuser les caractères de contrôle ASCII ; ne pas utiliser de listes noires de sous-chaînes comme limite de sécurité XSS.
- Pour tous les champs textuels susceptibles d'entrer dans l'UI, y compris `title`, `description`, valeurs string des `metadata`, `toolName`, `hookName`, `extensionId`, `clientId`, le client doit les rendre ou les échapper en HTML en tant que texte non fiable, l'insertion directe via `innerHTML` est interdite.

### 9.5 Anti-spam

- Maximum 200 artifacts par session.
- La soft reservation est par défaut `tool: 100`, `client: 50`, `hook: 50`, le quota inutilisé pouvant être emprunté par d'autres sources.
- `record_artifact` n'enregistre qu'un seul artifact par tool call.
- `POST /session/:id/artifacts` passe par le rate limit / mutation gate existant.
- L'éviction doit envoyer les événements `artifact_changed` / `removed` un par un.
- Le Client peut regrouper ou réduire par source/toolName.

### 9.6 Validation Diagnostics

- En cas d'échec de validation des paramètres de `record_artifact`, une erreur d'outil est retournée, aucun artifact n'est produit.
- En cas d'échec de validation du body de `POST /session/:id/artifacts`, un 400 est retourné.
- Un artifact malformé individuel dans `_meta.artifacts`, les hook artifacts ou `artifact-event` ne doit pas casser l'événement tool/session d'origine ; le bridge doit ignorer cet artifact et enregistrer un log de niveau warning.
- Le log warning doit contenir au moins le sessionId, la source, toolName / hookName / extensionId / clientId, le champ en échec et la raison ; ne pas enregistrer les valeurs de metadata de type secret.
- Le log debug peut enregistrer le payload de l'artifact rejeté après masquage et tronquage de la longueur.
- Si l'infrastructure telemetry/metrics existante est disponible, ajouter un compteur de rejet de validation, étiqueté par source et raison ; si aucune métrique n'est disponible pour le moment, les logs constituent l'exigence minimale de la V1.

## 10. Limite avec les « liens standard »

Le panneau des artifacts à droite affiche uniquement les artifacts déclaratifs ; le corps du chat peut toujours afficher des liens standard.

Raisons de ne pas faire d'extraction automatique :

- Les liens de documentation, de référence et de débogage dans les réponses standard risquent d'envahir massivement la zone des artifacts.
- Les URL peuvent être des exemples, des modèles, des ébauches ou des sorties d'erreur.
- L'extraction automatique empêcherait le modèle de contrôler "quels liens méritent d'être utilisés ultérieurement par l'utilisateur".
- En termes de sécurité, l'enregistrement explicite facilite le marquage de la source et les avertissements de l'UI.

Si le métier a un besoin fort d'extraire des URL du texte, cela doit être une UX optionnelle côté Client :

- Affichage uniquement à proximité du corps du chat.
- Ne pas entrer dans le daemon artifact store.
- Ne pas déclencher `artifact_changed`.

## 11. Utilisation par les Skill / Agent

Une fois la V1 avec `record_artifact` fournie, le skill ou agent.md peut indiquer :

```md
Lorsque vous construisez une URL de ressource métier consultable par l'utilisateur à partir des résultats d'un outil, appelez l'outil record_artifact pour l'enregistrer.

Règles d'enregistrement :

- title utilise le nom lisible par un humain de la ressource.
- kind utilise link.
- storage utilise external_url.
- url utilise l'URL finale cliquable.
- metadata.resourceType indique le type de ressource, par exemple data_platform_resource, scheduler_task.
- N'enregistrez pas les liens de documentation de référence standard en tant qu'artifacts.
```

Après l'exécution par le modèle :

1. Appeler l'outil métier pour obtenir l'ID de ressource, l'ID de tâche, l'ID de nœud.
2. Construire l'URL selon les règles du skill.
3. Appeler `record_artifact`.
4. Le lien apparaît dans la zone des artifacts à droite du Daemon.

Cette approche ne nécessite pas d'écrire des hooks dans le skill, ni de code d'extension/plugin, et convient parfaitement à la majorité des règles métier.

## 12. Utilisation par les Hook / Extension

Une fois les hook artifacts fournis en V1, l'extension peut fournir un hook PostToolUse dans `qwen-extension.json` ou `hooks/hooks.json` :

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__data_platform__get_resource",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/table-artifact.js"
          }
        ]
      }
    ]
  }
}
```

La substitution de variables extension/hook de qwen-code actuelle prend toujours en charge `${CLAUDE_PLUGIN_ROOT}` ; si une nouvelle variable root spécifique à qwen est introduite ultérieurement, l'exemple pourra migrer en même temps que l'implémentation.

stdout du script :

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "用户画像资源详情",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "data_platform_resource"
        }
      }
    ]
  }
}
```

Cela convient aux plugins d'entreprise : la logique de "comment construire l'URL métier à partir des résultats de l'outil" est figée dans l'extension, plutôt que d'être écrite dans chaque prompt.

## 13. Plan de test

### 13.1 Phase A core

Couverture :

- Compilation du type `ToolResult.artifacts`.
- `ArtifactTool` retourne avec succès un artifact html avec `storage: 'published'`.
- `ArtifactTool` n'expose pas le chemin absolu local de qwen home en tant que `workspacePath`.
- Les règles d'inférence par défaut de `ToolArtifact.kind` / `storage` sont couvertes par des tests unitaires.

Commandes :

```bash
cd packages/core && npx vitest run src/tools/artifact/artifact-tool.test.ts
```

### 13.2 Phase B cli session

Couverture :

- `ToolCallEmitter.emitResult()` génère `_meta.artifacts`.
- `toolResult.artifacts` est passé à `emitResult()`.
- La mise à jour de session `ArtifactTool` terminée définira l'interne `trustedPublisher: true` via l'option d'ingestion côté bridge ; `record_artifact`, les autres résultats d'outils, les payloads de hook et les POST client ne le définiront pas, et BridgeClient ne peut pas non plus le déduire via les champs du payload de l'artifact.
- Les modifications de code source standard avec `write_file/edit/notebook_edit` ne génèrent pas automatiquement d'artifact.
- `read_file/grep/glob/shell` ne génèrent pas d'artifact.
- En cas d'échec de l'outil, les artifacts du résultat d'outil en échec ne sont pas collectés ; les artifacts de diagnostic retournés explicitement par le hook PostToolUse peuvent toujours entrer dans le store.
- Les artifacts de hook du chemin d'échec ne dépendent pas du `_meta.artifacts` du résultat réussi.

Commandes :

```bash
cd packages/cli && npx vitest run src/acp-integration/session/emitters/ToolCallEmitter.test.ts
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

### 13.3 Phase C-1 acp-bridge

Couverture :

- `SessionArtifactStore` created/updated/removed.
- Enrichissement de `ToolArtifact` vers `DaemonSessionArtifact`.
- `SessionArtifactInput` est le type d'entrée interne unifié pour tous les points d'entrée.
- Inférence par défaut de `kind` / `storage`, couvrant published->html, html/image/video/audio/pdf/notebook/file.
- Déduplication de l'identité workspacePath / managedId / URL, et l'identité ne contient pas la source ; l'enregistrement de la même ressource depuis des sources différentes sera fusionné en un seul artifact.
- Les artifacts standard portant plusieurs primary locators simultanément sont rejetés ; seul `trustedPublisher: true` avec `storage: 'published'` autorise `url + managedId`, l'identité étant alors basée uniquement sur `url`.
- La falsification de `storage: 'published'` par un hook, un POST client, `record_artifact` ou un résultat d'outil standard sera rejetée ou ignorée avec un log warning.
- Normalisation de managedId : trim, rejet des valeurs vides, rejet des séparateurs de chemin, rejet de `..`, rejet des caractères de contrôle, pas de repli de casse.
- Validation d'URL : scheme/host en minuscules, normalisation du port par défaut, conservation du fragment, conservation de l'ordre des query, rejet/suppression des userinfo.
- `url` sauvegarde l'URL cliquable nettoyée, l'identité utilise l'`identityUrl` interne, les deux ne sont pas mélangés.
- Validation de chemin : `../../etc/passwd`, chemins absolus hors du workspace, échappement de symlink sont tous rejetés ; les chemins inexistants entrant dans le store sont marqués `missing`, le rafraîchissement TTL GET relance la vérification de containment / realpath.
- Validation de Title/description : limite de longueur, trim, rejet des caractères de contrôle, texte brut, rejet des payloads HTML/script évidents.
- Validation des Metadata : limite de taille, primitives uniquement, rejet des objets/tableaux imbriqués.
- L'upsert pour la même identité applique la règle du first-writer-wins pour les champs d'affichage et les champs de source.
- L'identité de même URL prend en charge la mise à niveau du corps de la ressource trusted `external_url -> published`, complétant `managedId` / `kind` / `mimeType`, et autorisant l'éditeur à écraser les `title` / `description` d'espace réservé.
- Les metadata ultérieures de tool/client ne peuvent qu'ajouter des clés manquantes, sans pouvoir écraser les clés existantes, la fusion devant satisfaire à nouveau les contraintes de 4 Ko et de primitives uniquement.
- L'enrichissement ultérieur des metadata par hook est ignoré par défaut.
- Les identités en double dans le même lot déterminent le propriétaire selon l'ordre de `receivedSeq` / du tableau d'entrée, et ne produisent qu'un seul changement final dans `changes[]`.
- `retentionSource` est attribué à la création et n'est pas rafraîchi ; `clientRetained` est séparé de `retentionSource` ; `insertSeq` est attribué à la création et n'est pas rafraîchi.
- Éviction par soft reservation : le quota inutilisé peut être emprunté, les `missing` sont supprimés en priorité, les `client-retained` sont supprimés en dernier, tri stable par `createdAt + insertSeq`, et envoi d'un événement removed avec `reason: 'eviction'` un par un.
- Avant d'utiliser la priorité `missing` pour l'éviction, l'état des artifacts workspace candidats est rafraîchi, évitant qu'un cache `missing` obsolète ne supprime en priorité des fichiers déjà restaurés.
- L'éviction ne supprimera pas en priorité les artifacts `missing` créés dans le lot actuel ; si le lot actuel dépasse lui-même la capacité restante, les nouvelles entrées du lot en excès sont supprimées avant de produire des changements et des diagnostics sont enregistrés, ne produisant pas de `created` + `removed` pour la même identité.
- `clientRetained` ne dépasse pas la limite globale de 200 ; en cas de `client-retained` total, les éléments les plus anciens sont tout de même supprimés.
- Un artifact malformé générera un log warning / des diagnostics, sans affecter l'événement d'origine.
- `_meta.artifacts` est écrit dans le store.
- `artifact_changed` est publié.
- `upsertMany()` / `addSessionArtifacts()` retournent un `DaemonSessionArtifactMutationResult` contenant les changements d'éviction.
- `removeSessionArtifact()` retourne un changement removed avec `reason: 'explicit'`.

Commandes :

```bash
cd packages/acp-bridge && npx vitest run src/sessionArtifacts.test.ts
cd packages/acp-bridge && npx vitest run src/bridgeClient.test.ts
```
### 13.4 Phase C-2 serve

Couverture :

- `/capabilities` inclut `session_artifacts`.
- `GET /session/:id/artifacts` renvoie une liste vide.
- Renvoie une enveloppe lorsqu'il y a des artifacts.
- L'enveloppe ne renvoie pas le `workspaceCwd` absolu de l'hôte.
- Renvoie les erreurs existantes pour une session inconnue.
- Lors du rafraîchissement du TTL GET d'un artifact workspace, stat best-effort ; renvoie `status: 'missing'` si le fichier est absent, et `status: 'available'` une fois le fichier restauré.
- Le rafraîchissement du TTL GET refait la vérification de containment workspace / realpath du symlink ; une évasion de symlink renvoie `missing`.
- Le rafraîchissement du statut GET ne publie pas `artifact_changed` ; pas de stat local pour les artifacts managed / URL.
- GET utilise le cache de statut / TTL pour éviter de faire un stat synchrone sur tous les artifacts à chaque lecture à chaud.

Commande :

```bash
cd packages/cli && npx vitest run src/serve/server.test.ts
```

### 13.5 Phase C-3 SDK

Couverture :

- La route `listSessionArtifacts()` est correcte.
- Narrowing de l'événement connu `artifact_changed` ; l'artifact de l'événement est un `DaemonSessionArtifact` complet.
- Les nouveaux types sont exportés dans l'index public.
- Le type enum de réponse public est une union ouverte ; le client a un fallback pour les kind/status/source/storage inconnus.
- L'ajout singulier du SDK encapsule l'ajout pluriel du bridge et renvoie le résultat de mutation complet ; la suppression du SDK appelle la route DELETE.

Commandes :

```bash
cd packages/sdk-typescript && npx vitest run src/daemon/DaemonClient.test.ts
cd packages/sdk-typescript && npx vitest run src/daemon/events.test.ts
```

### 13.6 Phase D/E/F explicit registration tests

`record_artifact` :

- Valide title / workspacePath / managedId / url.
- N'autorise pas un `workspacePath + managedId + url` vide, et n'autorise pas non plus la transmission de plusieurs primary locators en même temps pour une entrée standard.
- N'autorise pas `storage: 'published'`.
- N'autorise pas les schémas d'URL non pris en charge.
- Les userinfo d'URL sont rejetés ou supprimés.
- Renvoie `ToolResult.artifacts`.
- `llmContent` renvoie un résultat d'enregistrement structuré ; un seul artifact est enregistré par appel d'outil.

hook artifacts :

- `HookOutput.hookSpecificOutput.artifacts` entre dans `PostToolUseHookResult` / `PostToolBatchHookResult` via `createHookOutput()` et `toolHookTriggers.ts`.
- `mergeWithOrLogic()` de `hookAggregator.ts` concatène les artifacts de plusieurs hooks.
- Les deux chemins de `coreToolScheduler.ts` et de `Session.ts` (ACP) peuvent propager les artifacts PostToolUse.
- Les deux chemins PostToolUse réutilisent un helper partagé de collection d'artifacts de hook.
- La session principale ACP ne déclare pas de artifacts PostToolBatch ; si de véritables callsites sont ajoutés ultérieurement, ils devront être couverts par des tests unitaires.
- Les artifacts des hooks PostToolUse / PostToolUseFailure entrent dans le bridge séparément via la extNotification `qwen/notify/session/artifact-event`, sans dépendre de `_meta.artifacts` d'un tool result réussi.
- Les runtimes ayant déjà une batch notification peuvent être écrits dans le store via `qwen/notify/session/artifact-event`.
- Les artifacts de hook passent par la même validation que les autres points d'entrée.
- Le `source` du payload du hook est dérivé par le bridge selon le contexte de transport ; il ne peut pas falsifier une source d'outil ou un éditeur de confiance.
- Les artifacts error/dashboard renvoyés par le hook en cas d'échec de l'outil peuvent toujours entrer dans le store.

client POST / SDK add :

- `POST /session/:id/artifacts` upsert avec succès.
- `POST` renvoie `DaemonSessionArtifactMutationResult`, incluant les changements created/updated ainsi que les eviction removed.
- Lorsque `POST` déclenche un upsert + eviction, vérifie que chaque élément de `changes[]` est publié de manière synchrone en tant qu'événement SSE `artifact_changed`, et que created/updated précède removed.
- `POST` est rejeté en cas de non-autorisation / d'absence de mutation token.
- `POST` renvoie 400 pour les chemins en dehors du workspace, les path traversals et les évasions de symlink.
- `POST` renvoie une enveloppe d'erreur structurée pour `storage: 'published'`, les primary locators multiples et les métadonnées dépassant la limite.
- `POST` écrit via un chemin unique `addSessionArtifacts()` du bridge.
- Le body de `DaemonClient.addSessionArtifact()` est correct.
- `DELETE /session/:id/artifacts/:artifactId` renvoie un changement removed avec `reason: 'explicit'` lorsqu'il correspond, et publie l'événement SSE correspondant, sans supprimer le fichier ou l'URL sous-jacent.
- `DELETE /session/:id/artifacts/:artifactId` renvoie de manière idempotente un `changes[]` vide lorsqu'il ne correspond pas, sans publier d'événement SSE.

### 13.7 Tests d'intégration inter-packages

Couverture de la chaîne complète :

1. L'outil renvoie `ToolResult.artifacts`.
2. `ToolCallEmitter` écrit `_meta.artifacts`.
3. `BridgeClient` extrait les artifacts de l'événement.
4. `SessionArtifactStore` valide / normalise / upsert.
5. SSE envoie `artifact_changed`.
6. `GET /session/:id/artifacts` renvoie le même artifact.
7. Après une reconnexion du client, le rechargement du snapshot permet de restaurer l'état mémoire actuel.
8. Remplir les artifacts jusqu'à la limite supérieure, puis ajouter un nouvel artifact, vérifier que le SSE contient à la fois l'événement created et l'événement removed avec `reason: 'eviction'`, puis vérifier que GET ne renvoie que l'état après élagage.

### 13.8 Validation manuelle

Scénario A : Artifacts de fichiers

1. ArtifactTool publie `lineage.html`.
2. `GET /session/:id/artifacts` renvoie un artifact html avec `storage: 'published'`.
3. SSE reçoit `artifact_changed`.

Scénario B : L'édition de code source standard n'entre pas dans la zone des artifacts

1. L'agent modifie un fichier source.
2. Le changement de fichier / diff apparaît normalement.
3. La liste des artifacts ne change pas.

Scénario C : Artifacts de liens métier explicites

1. Le skill demande au modèle de composer une URL de détails de ressources internes.
2. Le modèle appelle `record_artifact`.
3. Un artifact de lien apparaît dans la zone des artifacts à droite.

Scénario D : Artifacts de hook

1. L'extension enregistre un hook PostToolUse.
2. Le hook renvoie des artifacts en fonction de la sortie de l'outil.
3. Un artifact de source de hook apparaît dans la zone des artifacts à droite.

Scénario E : Les liens standard n'entrent pas dans la zone des artifacts

1. L'assistant répond avec un lien markdown.
2. La liste des artifacts ne change pas.

## 14. Critères d'acceptation

Une fois la capacité complète V1 implémentée, au minimum :

- La feature `session_artifacts` existe.
- `GET /session/:id/artifacts` est disponible.
- L'événement `artifact_changed` est disponible.
- `ArtifactTool` génère un artifact html published.
- `ToolResult.artifacts` peut entrer dans le daemon artifact store.
- `record_artifact` peut enregistrer des artifacts de lien / workspace, et l'enregistrement est feature-gated ou opt-in.
- Les hooks peuvent injecter des artifacts via `hookSpecificOutput.artifacts`, et les artifacts de plusieurs hooks sont concaténés.
- Le client peut injecter des artifacts via `POST /session/:id/artifacts`.
- Le client peut supprimer explicitement les artifacts mal enregistrés via `DELETE /session/:id/artifacts/:artifactId`.
- Les `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` standard n'entrent pas automatiquement dans la liste des artifacts.
- Les URL de texte standard de l'assistant n'entrent pas dans la liste des artifacts.
- Le SDK peut lister/ajouter/supprimer des artifacts et peut reconnaître `artifact_changed`.
- La suppression du SDK mappe correctement le résultat vide idempotent pour les artifacts inexistants.
- Les limites de sécurité de workspacePath / URL / metadata sont couvertes par des tests unitaires.
- La normalisation de managedId est couverte par des tests unitaires.
- Les cas first-writer-wins pour la même identité, la mise à niveau published, l'enrichissement contrôlé des métadonnées et l'éviction par soft reservation sont couverts par des tests unitaires.
- L'éviction notifie le client de la suppression une par une.
- Les échecs de validation génèrent des warning logs / diagnostics.
- Les trois points d'entrée hook/client/record_artifact passent par la même validation.
- `npm run build && npm run typecheck` réussit.

## 15. Ordre de déploiement recommandé

Pour la V1 en interne, il est recommandé d'implémenter dans l'ordre suivant ; il s'agit d'un planning d'ingénierie, pas d'une décomposition des capacités :

1. `ToolArtifact` + `ToolResult.artifacts?`
2. `ArtifactTool` structured artifacts
3. `ToolCallEmitter._meta.artifacts`
4. `Session.runTool()` ne collecte que `toolResult.artifacts`
5. `SessionArtifactStore` validation / normalize / enrichment / upsert
6. BridgeClient consomme `_meta.artifacts`
7. `GET /session/:id/artifacts`
8. Types SDK list/event
9. `RecordArtifactTool`
10. hook output artifacts
11. `qwen/notify/session/artifact-event`
12. `POST /session/:id/artifacts`
13. SDK addArtifact
14. Complément des références de stockage managed / published
15. Documentation du protocole et tests

## 16. Feuille de route ultérieure

Phase 2 : Restauration de l'historique

- Les artifacts sont écrits dans les métadonnées d'enregistrement du chat.
- HistoryReplayer rejoue les artifacts.
- La liste des artifacts peut être restaurée après `session/load`.

Phase 3 : Détails et aperçu

- `GET /session/:id/artifacts/:artifactId`
- Métadonnées d'aperçu.
- Stratégies d'aperçu pour les images/PDF/HTML.

Phase 4 : Aperçu dynamique sécurisé

- Origine sandbox indépendante.
- Sandbox iframe.
- Shim HTML/React artifact.

Phase 5 : Stockage à long terme

- OSS/MinIO.
- Politique de rétention.
- Épinglage/suppression/historique des versions.

## 17. Résumé

Un lien peut être un artifact, mais il doit être enregistré explicitement. La zone des artifacts à droite ne doit pas collecter automatiquement tous les liens textuels.

La V1 est une capacité complète pour l'extérieur, composée en interne d'un store unifié et de quatre types de points d'entrée :

1. **Point d'entrée outil** : `ToolResult.artifacts` / `ArtifactTool` produit des métadonnées d'artifact structurées.
2. **Point d'entrée modèle/skill** : L'outil `record_artifact`.
3. **Point d'entrée hook/extension** : `hookSpecificOutput.artifacts`.
4. **Point d'entrée client** : `POST /session/:id/artifacts`.

Tous ces points d'entrée aboutissent finalement au même `SessionArtifactStore`, sont interrogés via le même `GET /session/:id/artifacts` et mettent à jour l'interface utilisateur via le même événement SSE `artifact_changed`. Cela permet de couvrir les produits métier tels que les liens, les fichiers, le HTML, les images, les vidéos, tout en gardant le protocole simple, les sources claires et les limites contrôlables. La limite la plus importante est la suivante : les artifacts sont des outputs de session déclarés, et non une collection de toutes les éditions de fichiers standard ou de tous les liens standard.