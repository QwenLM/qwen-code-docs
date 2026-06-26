# Migration vers `@qwen-code/sdk/daemon` v2

La PR #4328 a mis en place la couche UI du démon v1. La PR #4353 (cette PR) déploie la v2 avec
sept commits de fonctionnalités additives. Ce guide explique d'abord les changements pour
les auteurs d'adaptateurs de chat web et de terminal web. Les mainteneurs natifs de TUI local, de canal et d'IDE
pourront réutiliser les mêmes primitives plus tard, mais ces chemins de produits par défaut
ne sont pas migrés par cette PR.

## En résumé pour les consommateurs existants

**Aucune rupture de compatibilité.** Chaque commit de cette PR est additif :

- Les champs v1 fonctionnent toujours (`createdAt` conservé comme alias `@deprecated` pour
  `clientReceivedAt`)
- Le normaliseur v1 traite toujours les 13 mêmes types d'événements de la même manière
- Le réducteur v1 produit toujours les mêmes blocs pour les événements de chat
- La nouvelle API est optionnelle via des paramètres et des helpers supplémentaires

La PR peut être fusionnée sans modification du côté consommateur. **L'adoption des
nouvelles fonctionnalités est incrémentale.**

## Ordre d'adoption recommandé

Pour chaque adaptateur, par ordre de rapport effort/valeur :

### 1. Ordonnancement : passer la clé de tri de `createdAt` à `eventId`

**Avant :**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Après :**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Pourquoi :** `eventId` est monotone côté démon ; survit à une réexécution SSE après reconnexion.
`createdAt` dépend de l'horloge client et se décale lors d'une réexécution.

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

**Pourquoi :** Plusieurs clients voient un « il y a X minutes » cohérent seulement quand les deux
lisent l'horloge du démon. Le rendu via `formatBlockTimestamp` gère le fuseau horaire et
la locale.

**Remarque :** Le démon doit apposer `_meta.serverTimestamp` sur les enveloppes pour
que cela prenne effet. Le SDK est prêt pour la rétrocompatibilité ; utilise
`clientReceivedAt` en secours jusqu'alors.

### 3. Écouter les nouveaux types d'événements — choisir le sous-ensemble à afficher

Les 16 nouveaux types d'événements (session-meta, workspace, auth) ne poussent pas
de blocs de transcription. Ce sont des observations de canal secondaire. Chaque adaptateur choisit ceux à remonter :

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
    // ... etc, n'activer que ce dont votre UI a besoin
  }
}
```

Ou utiliser des sélecteurs pour les canaux secondaires reflétés dans l'état :

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

Pour le SSR HTML :

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

Ajoutez dans la suite de tests de votre adaptateur :

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('l\'adaptateur projette correctement le corpus UI du démon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Cela exécutera votre adaptateur sur 10 scénarios de fixtures et signalera toute
dérive de projection avant qu'elle n'atteigne les utilisateurs.

### 6. Répartition des icônes d'outils via `provenance`

**Avant** (correspondance de chaîne sur `toolName`) :

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**Après** (provenance typée issue de PR-A) :

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
Le SDK a une heuristique de secours de nommage `mcp__<server>__<tool>` — fonctionne dès aujourd'hui même lorsque le daemon n'explicite pas la provenance.

### 7. Catégorisation des erreurs via `errorKind`

**Avant** (regex sur le texte) :

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Après** (enum fermé de PR-A) :

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

**Remarque** : Le daemon doit écrire `data.errorKind` sur session_died / stream_error pour que cela soit renseigné. Le SDK le lit déjà.

### 8. Gestion de l'annulation — déjà automatique

Dans la v1, les invites annulées laissaient les blocs d'outils en cours tourner indéfiniment. Dans la v2 (PR-E), `propagateCancellationToInFlightTools` s'exécute automatiquement sur `assistant.done.reason === 'cancelled'`. Les enfants du sous-agent sont annulés en même temps que leur parent.

**Aucune modification d'adaptateur nécessaire** — vos spinners se résoudront correctement.

### 8a. Imbrication des sous-agents — option pour un rendu imbriqué (PR-K)

Les blocs d'outils invoqués dans une délégation de sous-agent portent désormais `parentToolCallId`, `subagentType` et (lorsque le parent est dans l'état) `parentBlockId`. Les adaptateurs peuvent opter pour un rendu imbriqué :

**Avant** (liste plate, les appels de sous-agent sont visuellement indiscernables du niveau supérieur) :

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

**Aucune modification d'adaptateur n'est nécessaire si vous préférez la vue plate** — les nouveaux champs sont additifs et ignorés par le code qui ne les lit pas.

### 9. Taxonomie des aperçus d'outils — choisir un sous-ensemble à afficher avec des composants personnalisés

PR-D + PR-F apportent 13 types d'aperçus :

- 4 de type fichier : `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 de type contenu : `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 de contrôle : `ask_user_question`, `command`
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
    // ... ou utiliser le repli :
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Les adaptateurs sans composants personnalisés pour les 13 types peuvent utiliser le repli `daemonToolPreviewToMarkdown` du SDK pour tout type non pris en charge.

## Vérification de rétrocompatibilité

| Préoccupation                                                | Statut                                        |
| ------------------------------------------------------------ | --------------------------------------------- |
| Lectures existantes de `block.createdAt`                     | ✅ fonctionne toujours (alias pour `clientReceivedAt`) |
| Gestion des événements du reducer existant                   | ✅ inchangé pour les types d'événements v1     |
| Sites d'appel `daemonTranscriptToUnifiedMessages(blocks)`    | ✅ le nouveau paramètre options est facultatif |
| Consommateurs existants de `selectTranscriptBlocks`          | ✅ inchangé                                    |
| Nouveaux types d'événements dans le reducer v1               | ✅ sans effet, `lastEventId` continue d'avancer |

## Références croisées

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [README de l'UI du daemon](./README.md) — documentation complète de l'API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR de base avec couche de transcription d'interface partagée
