# Migration vers `@qwen-code/sdk/daemon` v2

La PR #4328 a livré la couche UI du daemon v1. La PR #4353 (cette PR) livre la v2 avec sept commits de fonctionnalités additives. Ce guide parcourt les changements pour les auteurs d'adaptateurs de chat web et de terminal web en premier. Les responsables du TUI natif local, du canal et de l'IDE peuvent réutiliser les mêmes primitives plus tard, mais ces chemins de produit par défaut ne sont pas migrés par cette PR.

## TL;DR pour les consommateurs existants

**Pas de breaking changes.** Chaque commit de cette PR est additif :

- Les champs v1 fonctionnent toujours (`createdAt` conservé comme alias `@deprecated` pour `clientReceivedAt`)
- Le normaliseur v1 mappe toujours les mêmes 13 types d'événements de la même manière
- Le réducteur v1 produit toujours les mêmes blocs pour les événements de chat
- La nouvelle API est opt-in via des paramètres supplémentaires et des helpers

Cette PR peut être fusionnée sans aucun changement côté consommateur. **L'adoption des nouvelles fonctionnalités est incrémentale.**

## Ordre d'adoption recommandé

Pour chaque adaptateur, dans l'ordre du rapport effort/valeur :

### 1. Ordonnancement : passer de la clé de tri `createdAt` à `eventId`

**Avant :**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Après :**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Pourquoi** : `eventId` est monotone par rapport au daemon ; survit à la relecture SSE après reconnexion. `createdAt` est l'horloge du client et se décale lors de la relecture.

### 2. Affichage : remplacer `createdAt` par `serverTimestamp ?? clientReceivedAt`

**Avant :**

```tsx
<TimeLabel ms={block.createdAt} />
```

**Après :**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Pourquoi** : Plusieurs clients voient un « il y a X minutes » cohérent seulement lorsque les deux lisent l'horloge du daemon. Le rendu avec `formatBlockTimestamp` gère le fuseau horaire et la locale.

**Note** : Le daemon doit timbrer `_meta.serverTimestamp` sur les enveloppes pour que cela prenne effet. Le SDK est prêt pour la rétrocompatibilité ; il revient à `clientReceivedAt` jusque-là.

### 3. Écouter les nouveaux types d'événements — choisir le sous-ensemble à afficher

Les 16 nouveaux types d'événements (session-meta, workspace, auth) ne poussent pas de blocs de transcription. Ce sont des observations de canal latéral. Chaque adaptateur choisit ceux à afficher :

```ts
// Dans votre consommateur SSE
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Ensuite dans votre UI
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `Les serveurs MCP approchent du budget : ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... etc, optez pour ce dont votre UI a besoin
  }
}
```

Ou utilisez des selecteurs pour les canaux latéraux reflétés dans l'état :

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // reflété depuis approval_mode.changed
const currentTool = selectCurrentTool(state); // outil en cours d'exécution
```

### 4. Contrat de rendu : utiliser `daemonBlockToMarkdown` (ou HTML / plainText)

**Avant** (chaque adaptateur fait sa propre projection) :

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `Vous : ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... etc
  }
}
```

**Après** (déléguer au SDK) :

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Pour le HTML SSR :

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

Pour le texte brut :

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. Test de conformité

Ajoutez à la suite de tests de votre adaptateur :

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('l\'adaptateur projette correctement le corpus UI du daemon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Cela exécutera votre adaptateur sur 10 scénarios de fixtures et signalera toute dérive de projection avant qu'elle n'atteigne les utilisateurs.

### 6. Répartition des icônes d'outil via `provenance`

**Avant** (correspondance de chaîne sur toolName) :

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**Après** (provenance typée de PR-A) :

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```

Le SDK dispose d'une heuristique de repli de nommage `mcp__<server>__<tool>` — fonctionne dès maintenant même si le daemon ne timbre pas explicitement la provenance.

### 7. Catégorisation des erreurs via `errorKind`

**Avant** (regex sur le texte) :

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Après** (enum fermée de PR-A) :

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**Note** : Le daemon doit timbrer `data.errorKind` sur les événements session_died / stream_error pour que cela soit peuplé. Le SDK le lit déjà.

### 8. Gestion de l'annulation — déjà automatique

Dans v1, les prompts annulés laissaient les blocs d'outils en cours tourner indéfiniment.
Dans v2 (PR-E), `propagateCancellationToInFlightTools` s'exécute automatiquement sur `assistant.done.reason === 'cancelled'`. Les enfants du sous-agent sont annulés en même temps que leur parent.

**Aucune modification d'adaptateur nécessaire** — vos spinners se résoudront correctement.

### 8a. Imbrication de sous-agents — opt-in pour le rendu imbriqué (PR-K)

Les blocs d'outils invoqués dans une délégation de sous-agent portent désormais `parentToolCallId`, `subagentType`, et (lorsque le parent est dans l'état) `parentBlockId`. Les adaptateurs peuvent opter pour le rendu imbriqué :

**Avant** (liste plate, les appels de sous-agent sont visuellement indiscernables des appels de premier niveau) :

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**Après** (rendu récursif imbriqué) :

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**Aucune modification d'adaptateur nécessaire si vous préférez la vue plate** — les nouveaux champs sont additifs et ignorés par le code qui ne les lit pas.

### 9. Taxonomie des aperçus d'outils — choisir le sous-ensemble à afficher avec des composants personnalisés

PR-D + PR-F apportent 13 types d'aperçus :

- 4 de type fichier : `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 de type contenu : `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 de type contrôle : `ask_user_question`, `command`
- 2 génériques : `key_value`, `generic`

Chaque adaptateur dispatche sur `preview.kind` :

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... ou revenir au cas par défaut :
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Les adaptateurs sans composants personnalisés pour les 13 types peuvent se rabattre sur `daemonToolPreviewToMarkdown` du SDK pour tout type non traité.

## Liste de vérification de rétrocompatibilité

| Point                                                | Statut                                        |
| ---------------------------------------------------- | --------------------------------------------- |
| Lectures existantes de `block.createdAt`             | ✅ fonctionne toujours (alias pour `clientReceivedAt`) |
| Gestion des événements du réducteur existant           | ✅ inchangé pour les types d'événements v1               |
| Sites d'appel de `daemonTranscriptToUnifiedMessages(blocks)` | ✅ le nouveau paramètre d'options est facultatif |
| Consommateurs existants de `selectTranscriptBlocks`  | ✅ inchangé                                  |
| Nouveaux types d'événements dans le réducteur v1     | ✅ no-op, `lastEventId` avance toujours       |

## Références croisées

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [README du Daemon UI](./README.md) — Référence complète de l'API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR de base avec la couche de transcription UI partagée