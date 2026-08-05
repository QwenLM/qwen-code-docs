# Heartbeat des commandes silencieuses

Date : 2026-07-14
Statut : implémenté

## Problème

Une commande shell au premier plan qui ne produit aucune sortie n'émet aucun événement entre le spawn et la stabilisation. Dans une utilisation interactive du TUI, ce n'est pas un problème — le spinner continue de tourner — mais pour les consommateurs headless (les passerelles ACP comme DataAgent, les pipelines `--output-format stream-json`), la session devient complètement silencieuse pendant toute la durée de la commande. Une passerelle qui surveille le flux d'événements ne peut pas distinguer « une sonde SQL de 165 secondes est toujours en cours » de « la chaîne d'exécution est morte », et les commandes silencieuses de longue durée sont rapportées par les utilisateurs comme un blocage de l'agent.

Le diagnostic en production d'une telle session (session DataAgent `77255d98`, tâche de 41 minutes, environ 32 minutes passées dans des attentes d'outils) a identifié le signal de présence manquant comme l'un des trois correctifs P0 de fiabilité, aux côtés de la sémantique des timeouts shell (PR 1, changement séparé) et d'une garde d'arrêt des todos (PR 3).

Implémentation de référence : Claude Code sonde le fichier de sortie chaque seconde et invoque son callback de progression même lorsque le contenu est vide, puis expose aux consommateurs du SDK des événements `tool_progress` throttlés au payload minimal. La progression n'entre jamais dans le contexte du modèle.

## Objectifs

- Pendant qu'une commande shell au premier plan est silencieuse, émettre périodiquement un signal de présence structuré vers les consommateurs qui en ont besoin (clients ACP, stream-json).
- Ne porter que des statistiques — temps écoulé, ancienneté de la sortie, comptes de lignes/octets, timeout effectif. Jamais la sortie de la commande.
- Ne jamais entrer dans le contexte du modèle ; ne jamais perturber l'affichage de la sortie live des consommateurs interactifs.

## Non-objectifs

- Le passage automatique en arrière-plan sur timeout (suivi séparément comme élément P1).
- Le streaming de la sortie live des commandes vers les clients ACP (trames `content`).
- Le relais de `mcp_tool_progress` MCP au-dessus d'ACP, la propagation des heartbeats des sous-agents dans `AgentResultDisplay`, ou les améliorations d'affichage du TUI — tous des suivis.

## Conception

### Forme de l'événement

`ShellProgressData` rejoint l'union `ToolResultDisplay` dans `packages/core/src/tools/tools.ts`, en miroir du précédent existant `McpToolProgressData`, avec une garde exportée partagée `isShellProgressData` :

```ts
interface ShellProgressData {
  type: 'shell_progress';
  elapsedMs: number; // monotone, depuis le spawn après initialisation du PTY
  lastOutputAgeMs?: number; // ancienneté monotone de la dernière sortie ; absent = aucune encore
  totalLines?: number; // chemin PTY/AnsiOutput uniquement
  totalBytes?: number; // chemin PTY/AnsiOutput uniquement
  timeoutMs?: number; // timeout effectif incluant le défaut de 120s ; absent lorsque désactivé
}
```

Les durées sont monotones (deltas de `performance.now()`), afin que les corrections NTP ne puissent pas les décaler ; `lastOutputAgeMs` est une ancienneté plutôt qu'un horodatage d'époque pour la même raison.

### Producteur

`ShellToolInvocation.execute()` démarre un `setInterval` après l'obtention du handle d'exécution (afin que le temps d'import dynamique du PTY ne puisse pas produire un heartbeat pour un processus qui n'existe pas) et uniquement lorsqu'un callback `updateOutput` est présent. À chaque tick, un heartbeat est émis si et seulement si aucune mise à jour d'affichage ne s'est déclenchée pendant un intervalle complet — la vérification réutilise l'état de throttle existant `lastUpdateTime`, afin que les commandes avec une sortie fluide n'émettent jamais de heartbeat. Le timer est effacé aux mêmes trois endroits que les timers existants de flush final et d'avertissement de timeout : le catch du throw du service, le `finally` du résultat et `onAbort` (après un abort, un signal « toujours en cours » pendant la fenêtre entre le kill et la stabilisation serait un mensonge).

L'intervalle provient de `tools.shell.heartbeatIntervalMs` (settings → config CLI → `ConfigParameters` du core → `getShellHeartbeatIntervalMs()`, la même chaîne que `defaultTimeoutMs`), avec une valeur par défaut de 10 000 ms ; `0` désactive.

### Consommateurs

| Consommateur                           | Comportement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| liveOutputCallback de `CoreToolScheduler` | Relaye les heartbeats vers `outputUpdateHandler` mais saute le remplacement du liveOutput et la notification de mise à jour — un objet de statistiques ne doit pas vider la vue live accumulée.                                                                                                                                                                                                                                                                                                                                            |
| `useReactToolScheduler` (TUI)          | Ignore les heartbeats ; le TUI affiche déjà un spinner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `agent-core` (runtime des sous-agents) | Ignore les heartbeats ; en diffuser un écraserait les `liveOutputs` de la vue du sous-agent.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Session.runTool` d'ACP                | Passe un callback de mise à jour dans `invocation.execute()`. Les heartbeats deviennent des trames fire-and-forget, méta-seules, `tool_call_update { status: 'in_progress', _meta: { toolName, shellProgress } }`. Une porte `toolSettled` définie au moment où `execute()` renvoie (y compris en levant une exception) abandonne un tick en course avec le chemin de stabilisation, afin que le client ne puisse jamais observer `in_progress` après `completed`. Le nombre de heartbeats et l'ancienneté de la dernière sortie sont enregistrés comme attributs de span `shell.heartbeat_count` / `shell.last_output_age_ms` sur le span existant d'exécution d'outil. |
| stream-json                            | `createToolProgressHandler` relaye les heartbeats via le pipeline existant `emitToolProgress` (événements de flux `tool_progress`, contrôlés par `--include-partial-messages`). `ToolProgressStreamEvent.content` est élargi à `McpToolProgressData \| ShellProgressData`.                                                                                                                                                                                                                                                                  |
| `QwenAgent` desktop                    | Saute les mises à jour `status: in_progress` dans `handleToolCallUpdate` — il convertissait auparavant chaque `tool_call_update` en un `tool_result` terminal, ce qui aurait terminé prématurément la commande avec un résultat vide dès le premier heartbeat.                                                                                                                                                                                                                                                                           |
| `DaemonChannelBridge` des channels     | Abandonne les trames `in_progress` sans kind au lieu de les marquer comme mal formées (`tool_call_update` y exige un `kind`, que les heartbeats méta-seuls ne portent pas).                                                                                                                                                                                                                                                                                                                                                               |
| normalisateur de l'UI du démon web-shell | Abandonne les trames de heartbeat — en normaliser une écraserait le titre lisible du bloc d'outil avec le nom d'outil nu dérivé de `_meta.toolName`.                                                                                                                                                                                                                                                                                                                                                                                     |

Le `ToolCallUpdate` d'ACP définit tous les champs sauf l'id comme optionnels et `_meta` comme le point d'extensibilité, donc les clients conformes au protocole ignorent les nouvelles trames. Ce contrat ne s'applique toutefois pas de lui-même : un passage en revue complet des consommateurs de `tool_call_update` dans le dépôt en a trouvé trois qui géraient mal les trames (agent desktop, bridge de canal du démon, normalisateur web-shell — corrigés ci-dessus, chacun avec un test de régression), tandis que le reste (compagnon VS Code, compaction acp-bridge, export de session, adaptateur TUI du démon) fusionne de manière conditionnelle et est sûr face aux heartbeats tel quel. Sur le chemin de demande de permission (qui aujourd'hui n'émet aucune notification de démarrage), un heartbeat peut être la première mise à jour qu'un client voit pour un appel d'outil — le même contrat de séquençage que les mises à jour existantes completed-only.

### Pourquoi pas ShellExecutionService

Le service donnerait un `lastOutputAt` légèrement plus précis, mais la couche outil observe déjà chaque événement de sortie, et placer le timer là aurait impliqué de le gérer à travers les cycles de vie PTY/child_process/promote tandis que le PR 1 retravaille simultanément la sémantique pré-abort du même fichier. Le shell `!` côté utilisateur n'a pas besoin de heartbeats, donc rien n'est perdu.

## Vérification

- Unitaire : cadence/forme/nettoyage du producteur (fake timers incluant `performance`), relais du scheduler sans remplacement du liveOutput, rétention du hook TUI, trames méta-seules ACP + porte des heartbeats tardifs, forme des événements stream-json et porte partial-messages.
- E2E stream-json : `sleep 15` a produit `tool_progress` avec `{type:'shell_progress', elapsedMs:10001, timeoutMs:30000}` et sans champs de statistiques de sortie.
- E2E ACP (JSON-RPC stdio) : `tool_call` → heartbeat `tool_call_update` (méta-seul, 10 s) → `completed`, sans `in_progress` final.
- TUI (tmux) : une commande silencieuse affiche le spinner/ligne de temps écoulé normal ; aucune fuite JSON en cours d'exécution ni dans la transcription finale.
