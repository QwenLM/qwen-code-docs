# SDK UI Démon — Guide du développeur

Le sous-chemin `@qwen-code/sdk/daemon` fournit des primitives UI partagées pour les clients démon. La cible d'adoption actuelle est le web chat et le terminal web ; les intégrations natives TUI locale, canal et IDE conservent leurs chemins par défaut pendant que le contrat UI démon se stabilise. Ce guide couvre la surface API introduite par la PR #4353 (le suivi unifié de la couche de transcription UI partagée de la PR #4328).

## Modèle à trois couches

```
Daemon SSE wire (enveloppes NDJSON)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← votre moteur de rendu se branche ici
```

- **Normalisateur** : prend les enveloppes SSE brutes du démon, retourne des événements UI typés
- **Réducteur** : accumule les événements dans une machine à états de transcription
- **Aides de rendu** : projette les blocs d'état en chaînes affichables

## Démarrage rapide

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// Lire l'état depuis n'importe quel abonné
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Taxonomie des événements (28+ types)

`DaemonUiEvent` est une union discriminée de tous les événements orientés UI :

### Événements de flux de chat

| Événement                    | Quand                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `user.text.delta`            | Un fragment de message utilisateur arrive du démon      |
| `assistant.text.delta`       | Fragment de flux de l'assistant                        |
| `assistant.done`             | Complétion d'invite (depuis la résolution de sendPrompt)|
| `thought.text.delta`         | Fragment de raisonnement de l'agent                    |
| `tool.update`                | Cycle de vie d'un appel d'outil (en cours / terminé / annulé) |
| `shell.output`               | Fragment stdout/stderr de l'outil shell                |
| `permission.request`         | L'outil a besoin d'autorisation utilisateur            |
| `permission.resolved`        | Décision d'autorisation arrivée                        |
| `model.changed`              | Modèle de session changé                               |
| `status` / `debug` / `error` | Blocs de statut / débogage / erreur                    |

### Événements de métadonnées de session (PR-A)

| Événement                           | Quand                                             |
| ----------------------------------- | ------------------------------------------------- |
| `session.metadata.changed`          | Titre de session / nom d'affichage mis à jour     |
| `session.approval_mode.changed`     | Mode basculé (plan / default / yolo / auto-edit)  |
| `session.available_commands`        | Liste des commandes slash actualisée              |

### Événements d'espace de travail (PR-A, Vague 3-4)

| Événement                                  | Quand                                  |
| ------------------------------------------ | -------------------------------------- |
| `workspace.memory.changed`                 | QWEN.md / fichier mémoire modifié      |
| `workspace.agent.changed`                  | Sous-agent créé / mis à jour / supprimé |
| `workspace.tool.toggled`                   | Outil intégré activé / désactivé        |
| `workspace.initialized`                    | `qwen init` terminé                    |
| `workspace.mcp.budget_warning`             | Nombre d'enfants MCP approchant la limite |
| `workspace.mcp.child_refused`              | Serveur MCP refusé à cause du budget    |
| `workspace.mcp.server_restarted`           | Redémarrage manuel MCP réussi           |
| `workspace.mcp.server_restart_refused`     | Redémarrage manuel bloqué               |

### Événements de flux d'appareil d'authentification (PR-A, Vague 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Chacun porte le `deviceFlowId` du démon. Les événements échoués portent une `errorKind` énumération fermée (voir `KNOWN_DEVICE_FLOW_ERROR_KINDS` exporté depuis `@qwen-code/sdk/daemon` pour la liste canonique, actuellement : `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Contrat de rendu (PR-D)

Trois fonctions de projection, une fonction d'aperçu. Toutes discriminent sur `block.kind` ou `preview.kind` :

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Recette : afficher une transcription en Markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Recette : afficher en HTML assaini pour SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Pipeline en deux étapes : markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Ou utilisez le moteur de rendu HTML conservateur intégré (pas d'analyse markdown, seulement échappement HTML) :

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Recette : copier-coller en texte brut

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Taxonomie des aperçus d'outils (13 types)

| Type                  | Surface                                           |
| --------------------- | ------------------------------------------------- |
| `ask_user_question`   | Question à choix multiples avec options           |
| `command`             | Commande de style bash + cwd                      |
| `file_diff`           | Modification de fichier avec oldText/newText ou correctif |
| `file_read`           | Chemin + plage de lignes optionnelle              |
| `web_fetch`           | URL + méthode HTTP                                |
| `mcp_invocation`      | Serveur MCP + outil + résumé des arguments        |
| `code_block`          | Extrait de code avec langage                      |
| `search`              | Requête + nombre de résultats + meilleurs résultats |
| `tabular`             | Colonnes + lignes (limité à 50, troncature signalée) |
| `image_generation`    | Invite + URL miniature optionnelle                |
| `subagent_delegation` | Nom d'agent + tâche                              |
| `key_value`           | Lignes génériques étiquette/valeur                |
| `generic`             | Résumé de secours                                 |

Chacun a une projection `daemonToolPreviewToMarkdown`. Les moteurs de rendu personnalisés peuvent dispatcher sur `preview.kind` pour un affichage riche par type (diff de fichier avec coloration syntaxique, badge de serveur MCP, miniature d'image, etc.).

## Sélecteurs d'état (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // trié par id monotone du démon

// PR-K — imbrication de sous-agents
selectSubagentChildBlocks(state, parentToolCallId); // uniquement les enfants directs
isSubagentChildBlock(block); // garde de type : cet outil a-t-il été invoqué dans un sous-agent ?
```

`currentToolCallId` est automatiquement maintenu par le réducteur :

- Défini lorsqu'un outil entre en statut en vol (`running` / `in_progress` / `pending` / `confirming`)
- Effacé lorsque l'outil entre en statut terminal (`completed` / `failed` / `cancelled` / etc.)
- Les statuts inconnus le laissent inchangé (compatibilité future)

## Propagation d'annulation (PR-E)

Quand `assistant.done.reason === 'cancelled'`, le réducteur parcourt chaque bloc d'outil en vol et force son statut à `'cancelled'`. Le démon ne garantit pas un `tool_call_update` terminal pour chaque outil en vol lorsque l'invite parente est annulée — cette propagation empêche les spinners UI de tourner indéfiniment.

Les enfants de sous-agents sont annulés avec leur parent car l'annulation itère sur chaque bloc d'outil en vol dans `toolBlockByCallId`, pas seulement le pointeur courant.

## Imbrication de sous-agents (PR-K)

Lorsque l'agent principal délègue à un sous-agent (l'outil `Task`, ou équivalent), le démon appose `parentToolCallId` et `subagentType` sur les appels d'outil **enfant** via `tool_call._meta`. Le réducteur lit les deux et :

- Reflete `parentToolCallId` + `subagentType` sur `DaemonToolTranscriptBlock`
- Résout `parentBlockId` (l'`id` du bloc de transcription parent) lorsque le bloc parent est déjà dans l'état ; sinon le laisse `undefined` et le remplit plus tard lorsque le bloc parent apparaît

L'arrivée dans le désordre (enfant avant parent) est gérée de manière transparente. Un enfant dont le parent est rogné par `maxBlocks` conserve `parentToolCallId` pour les requêtes de sélecteur, mais `parentBlockId` est nullifié (l'id orphelin ne résoudrait plus via `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Afficher un bloc d'outil parent, puis parcourir les enfants :
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// Ou filtrer niveau supérieur vs imbriqué au moment du rendu :
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` retourne uniquement les enfants **directs**. Parcourez récursivement pour afficher les sous-agents imbriqués (un sous-agent dans un sous-agent). Le démon n'émet pas de cycles, mais les moteurs de rendu remontant via `parentBlockId` devraient quand même les détecter défensivement (par exemple, limite de profondeur ou ensemble visité).

Les auto-références (`parentToolCallId === toolCallId`) sont supprimées par le normalisateur avant d'atteindre le réducteur.

## Sémantique temporelle (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // CLÉ DE TRI PRIMAIRE — monotone du démon
  serverTimestamp?: number; // AFFICHAGE PRÉFÉRÉ — faisant autorité côté démon
  clientReceivedAt: number; // SOLUTION DE SECOURS — horloge locale
  createdAt: number; // @deprecated alias de clientReceivedAt
}
```

**Triez toujours par `eventId`** (utilisez `selectTranscriptBlocksOrderedByEventId`) lors de l'affichage de longues sessions. Le curseur monotone du démon est préservé lors de la relecture SSE après reconnexion ; les horloges client ne le sont pas.

**Formatez toujours les horodatages d'affichage à partir de `serverTimestamp`** (avec repli sur `clientReceivedAt`). Plusieurs clients visualisant la même session voient le même « il y a 5 minutes » seulement s'ils lisent tous l'horloge du démon.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'fr-FR',
  timeZone: 'Europe/Paris',
  timeStyle: 'short',
});
```

## Conformité de l'adaptateur (PR-G)

Validez que votre adaptateur projette le corpus de référence du SDK vers une sortie sémantiquement équivalente :

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('mon adaptateur est conforme au corpus UI démon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

Le corpus de fixtures (`DAEMON_UI_CONFORMANCE_FIXTURES`) couvre le chat, le cycle de vie des outils, les modifications de fichiers, MCP, les permissions, l'avertissement de budget MCP, l'annulation, le masquage de charges utiles malformées, OAuth, les mises à jour de commandes et l'imbrication de sous-agents. (Le nombre est dérivable à l'exécution — lisez `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Indépendant du format** — votre adaptateur peut afficher en ANSI / HTML / markdown / JSX ; le framework vérifie uniquement le contenu sémantique via `expectedContains` et `expectedAbsent`.

## Catégorisation des erreurs (PR-A)

`DaemonUiErrorEvent.errorKind` est une énumération fermée propagée depuis la taxonomie d'erreurs typées du démon (lorsque le démon l'appose) :

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Les moteurs de rendu doivent bifurquer sur `errorKind` pour des affordances actionnables :

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Ré-authentifier</button>;
    case 'missing_file':   return <button>Choisir un fichier</button>;
    case 'blocked_egress': return <span>Réseau bloqué — vérifier le proxy</span>;
    default:               return null;
  }
}
```

## Dispatch de provenance d'outil (PR-A)

`DaemonUiToolUpdateEvent.provenance` est une énumération fermée (`builtin` / `mcp` / `subagent` / `unknown`). Avec `serverId?: string` quand `mcp`. Utilisez-la pour le dispatch d'icônes et les badges :

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

Le SDK a une heuristique de repli de nommage `mcp__<server>__<tool>` — même lorsque le démon n'appose pas explicitement la provenance, les outils MCP sont détectables.

## Principes de compatibilité future

Chaque couche du SDK UI démon suit le **principe de compatibilité future** : les valeurs inconnues NE lèvent PAS d'exception ; elles dégradent gracieusement.

- Types d'événements démon inconnus → événement `debug` avec le nom du type brut
- Statut d'outil inconnu → `currentToolCallId` laissé inchangé (pas d'effacement)
- Type d'erreur inconnu → `errorKind` undefined (le moteur de rendu se replie sur le texte)
- serverTimestamp manquant → repli sur `clientReceivedAt`
- Forme d'aperçu non reconnue → type `generic` avec `summary`

Cela signifie que le **SDK peut être livré avant l'émission du démon**. L'heuristique de provenance d'outil de PR-A, l'extraction d'horodatage à trois emplacements de PR-B, et la préservation de statut inconnu de PR-E sont tous des exemples de « prêt quand le démon envoie ; sûr quand il ne le fait pas. »

## Références croisées

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR de base avec la couche de transcription UI partagée
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — cette PR (suivi d'exhaustivité unifié)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — proposition de mode démon
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — tracker d'implémentation Mode B v0.16