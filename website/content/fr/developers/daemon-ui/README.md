# Guide du développeur SDK Daemon UI

Le sous-chemin `@qwen-code/sdk/daemon` fournit des primitives UI partagées pour les clients daemon. La cible d'adoption actuelle est le chat web et le terminal web ; les intégrations natives locales TUI, les canaux et les IDE conservent leurs chemins par défaut existants pendant que le contrat UI du daemon se stabilise. Ce guide couvre la surface d'API introduite par la PR #4353 (la unification de suivi de la couche de transcription UI partagée de la PR #4328).

## Modèle en trois couches

```
Daemon SSE wire (NDJSON envelopes)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← your renderer plugs here
```

- **Normaliseur** : prend les enveloppes SSE brutes du daemon, retourne des événements UI typés
- **Réducteur** : accumule les événements dans une machine d'état de transcription
- **Aides de rendu** : projette les blocs d'état en chaînes rendables

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

// Read state from any subscriber
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Taxonomie des événements (28+ types)

`DaemonUiEvent` est une union discriminée de tous les événements destinés à l'UI :

### Événements de flux de chat

| Événement                        | Quand                                                  |
| -------------------------------- | ------------------------------------------------------ |
| `user.text.delta`                | Un morceau de message utilisateur arrive du daemon     |
| `assistant.text.delta`           | Morceau de streaming de l'assistant                    |
| `assistant.done`                 | Fin de prompt (résolution de sendPrompt)               |
| `thought.text.delta`             | Morceau de raisonnement de l'agent                     |
| `tool.update`                    | Cycle de vie d'appel d'outil (en cours / terminé / annulé) |
| `shell.output`                   | Morceau stdout/stderr d'outil shell                    |
| `permission.request`             | L'outil nécessite une autorisation utilisateur          |
| `permission.resolved`            | Décision de permission arrivée                         |
| `model.changed`                  | Modèle de session changé                               |
| `status` / `debug` / `error`    | Blocs de statut / debug / erreur                       |

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
| `workspace.tool.toggled`                   | Outil intégré activé / désactivé       |
| `workspace.initialized`                    | `qwen init` terminé                    |
| `workspace.mcp.budget_warning`             | Nombre d'enfants MCP approchant la limite |
| `workspace.mcp.child_refused`              | Serveur MCP refusé pour cause de budget |
| `workspace.mcp.server_restarted`           | Redémarrage manuel MCP réussi          |
| `workspace.mcp.server_restart_refused`     | Redémarrage manuel bloqué              |

### Événements de flux d'appareil d'authentification (PR-A, Vague 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Chacun porte le `deviceFlowId` du daemon. Les événements échoués portent un `errorKind` (enum fermé — voir `KNOWN_DEVICE_FLOW_ERROR_KINDS` exporté depuis `@qwen-code/sdk/daemon` pour la liste canonique, actuellement : `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

### Contrat de rendu (PR-D)

Trois helpers de projection, un helper d'aperçu. Tous discriminent sur `block.kind` ou `preview.kind` :
```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Livre de recettes : convertir une transcription en Markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Livre de recettes : convertir en HTML assaini pour le SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Pipeline en deux étapes : Markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Ou utilisez le moteur de rendu HTML conservateur intégré (pas d’analyse Markdown, simple échappement HTML) :

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Livre de recettes : copier-coller en texte brut

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Taxonomie des aperçus d’outils (13 types)

| Type                   | Surface                                         |
| ---------------------- | ----------------------------------------------- |
| `ask_user_question`    | Question à choix multiples avec options         |
| `command`              | Commande de type Bash + répertoire courant      |
| `file_diff`            | Modification de fichier avec oldText/newText ou correctif |
| `file_read`            | Chemin + plage de lignes optionnelle            |
| `web_fetch`            | URL + méthode HTTP                              |
| `mcp_invocation`       | Serveur MCP + outil + résumé des arguments      |
| `code_block`           | Extrait de code étiqueté par langage            |
| `search`               | Requête + nombre de résultats + meilleurs résultats |
| `tabular`              | Colonnes + lignes (limité à 50, troncature signalée) |
| `image_generation`     | Prompt + URL de miniature optionnelle           |
| `subagent_delegation`  | Nom de l’agent + tâche                          |
| `key_value`            | Lignes génériques étiquette/valeur              |
| `generic`              | Résumé de repli                                |

Chacun dispose d’une projection `daemonToolPreviewToMarkdown`. Des moteurs de rendu personnalisés peuvent répartir sur `preview.kind` pour un affichage riche par type (diff de fichier avec coloration syntaxique, badge de serveur MCP, miniature d’image, etc.).

## Sélecteurs d’état (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // trié par identifiant monotone du démon

// PR-K — imbrication des sous-agents
selectSubagentChildBlocks(state, parentToolCallId); // uniquement les enfants directs
isSubagentChildBlock(block); // garde de type : cet outil a-t-il été invoqué dans un sous-agent ?
```

`currentToolCallId` est automatiquement maintenu par le réducteur :

- Défini lorsqu’un outil passe en statut en cours (`running` / `in_progress` / `pending` / `confirming`)
- Effacé lorsque l’outil entre dans un statut terminal (`completed` / `failed` / `cancelled` / etc.)
- Les statuts inconnus le laissent inchangé (compatibilité ascendante)

## Propagation d’annulation (PR-E)

Lorsque `assistant.done.reason === 'cancelled'`, le réducteur parcourt chaque bloc d’outil en cours et force son statut à `'cancelled'`. Le démon ne garantit pas un `tool_call_update` terminal pour chaque outil en cours lorsque l’invite parente est annulée — cette propagation empêche les spinners de l’interface de tourner indéfiniment.

Les enfants des sous-agents sont annulés en même temps que leur parent car l’annulation itère sur chaque bloc d’outil en cours dans `toolBlockByCallId`, pas seulement sur le pointeur courant.

## Imbrication des sous-agents (PR-K)

Lorsque l’agent principal délègue à un sous-agent (l’outil `Task`, ou équivalent), le démon estampille `parentToolCallId` et `subagentType` sur les appels d’outils **enfants** via `tool_call._meta`. Le réducteur lit les deux et :

- Reflète `parentToolCallId` + `subagentType` sur `DaemonToolTranscriptBlock`
- Résout `parentBlockId` (l’`id` du bloc de transcription parent) lorsque le bloc parent est déjà dans l’état ; sinon le laisse `undefined` et le remplit ultérieurement lorsque le bloc parent apparaît

L’arrivée dans le désordre (enfant avant parent) est traitée de manière transparente. Un enfant dont le parent est rogné par `maxBlocks` conserve `parentToolCallId` pour les requêtes des sélecteurs, mais `parentBlockId` est mis à null (l’identifiant pendant ne pourrait plus être résolu via `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Afficher un bloc d’outil parent, puis parcourir les enfants :
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

// Ou filtrer niveau supérieur vs. imbriqué au moment du rendu :
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```
`selectSubagentChildBlocks` retourne uniquement les enfants **directs**. Parcourez
récursivement pour afficher les sous-agents imbriqués (un sous-agent dans un
sous-agent). Le démon n'émet pas de cycles, mais les moteurs d'affichage remontant via
`parentBlockId` doivent toujours les détecter de manière défensive (par ex., limite de profondeur ou
ensemble visité).

Les auto-références (`parentToolCallId === toolCallId`) sont supprimées par le
normalisateur avant d'atteindre le réducteur.

## Sémantique temporelle (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // Clé de tri PRIMAIRE — monotone du démon
  serverTimestamp?: number; // Affichage PRÉFÉRÉ — autoritaire du démon
  clientReceivedAt: number; // SOLUTION DE RECHANGE — horloge locale
  createdAt: number; // @deprecated alias pour clientReceivedAt
}
```

**Trier toujours par `eventId`** (utiliser `selectTranscriptBlocksOrderedByEventId`)
lors de l'affichage de longues sessions. Le curseur monotone du démon est conservé
lors de la relecture SSE après reconnexion ; les horloges des clients ne le sont pas.

**Toujours formater les horodatages d'affichage à partir de `serverTimestamp`** (avec
repli sur `clientReceivedAt`). Plusieurs clients visualisant la même session
voient le même « il y a 5 minutes » uniquement lorsque les deux lisent depuis l'horloge du démon.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Conformité de l'adaptateur (PR-G)

Validez que votre adaptateur projette le corpus de référence du SDK vers une sortie
sémantiquement équivalente :

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('mon adaptateur est conforme au corpus UI du démon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

Le corpus de fixtures (`DAEMON_UI_CONFORMANCE_FIXTURES`) couvre le chat, le cycle de vie
des outils, les modifications de fichiers, MCP, les permissions, les avertissements de budget MCP, l'annulation,
la rédaction de charges utiles malformées, OAuth, les mises à jour de commandes et l'imbrication de
sous-agents. (Le nombre est dérivable à l'exécution — lisez
`DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Indépendant du format** — votre adaptateur peut générer de l'ANSI / HTML / markdown /
JSX ; le framework vérifie uniquement le contenu sémantique via `expectedContains` et
`expectedAbsent`.

## Catégorisation des erreurs (PR-A)

`DaemonUiErrorEvent.errorKind` est une énumération fermée propagée depuis la
taxonomie d'erreurs typées du démon (lorsque le démon l'ajoute) :

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Les moteurs d'affichage doivent se baser sur `errorKind` pour des affordances actionnables :

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Se réauthentifier</button>;
    case 'missing_file':   return <button>Choisir un fichier</button>;
    case 'blocked_egress': return <span>Réseau bloqué — vérifier le proxy</span>;
    default:               return null;
  }
}
```

## Répartition de la provenance des outils (PR-A)

`DaemonUiToolUpdateEvent.provenance` est une énumération fermée (`builtin` / `mcp` /
`subagent` / `unknown`). Avec `serverId?: string` lorsque `mcp`. Utilisez-la pour la
répartition des icônes et le marquage :

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

Le SDK dispose d'une heuristique de repli de nommage `mcp__<server>__<tool>` — même
lorsque le démon n'ajoute pas explicitement la provenance, les outils MCP sont détectables.

## Principes de rétrocompatibilité

Chaque couche du SDK UI du démon suit le **principe de rétrocompatibilité** :
les valeurs inconnues NE lèvent PAS d'exception ; elles se dégradent gracieusement.

- Types d'événements de démon inconnus → événement `debug` avec le nom de type brut
- Statut d'outil inconnu → `currentToolCallId` laissé inchangé (pas d'effacement)
- Type d'erreur inconnu → `errorKind` non défini (le moteur d'affichage se replie sur le texte)
- serverTimestamp manquant → repli sur `clientReceivedAt`
- Forme non reconnue de l'aperçu → type `generic` avec `summary`

Cela signifie que **le SDK peut être livré avant l'émission du démon**. L'heuristique de
provenance des outils de PR-A, l'extraction d'horodatage à trois emplacements de PR-B, et la
préservation des statuts inconnus de PR-E sont tous des exemples de « prêt quand le démon envoie ;
sûr quand il ne le fait pas ».

## Références croisées

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR de base avec la couche de transcription UI partagée
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — cette PR (suivi unifié de complétude)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — proposition du mode démon
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — tracker d'implémentation Mode B v0.16
