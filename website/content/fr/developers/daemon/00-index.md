# Documentation développeur du Daemon

Ceci est la documentation technique orientée développeur pour le **mode daemon de qwen-code** : le daemon HTTP `qwen serve`, le paquet `@qwen-code/acp-bridge`, le pool de transports MCP à portée d'espace de travail, la médiation de permissions multi-client, le schéma d'événements typés v1, le client TypeScript SDK du daemon, et les adaptateurs qui se connectent au daemon.

Elle complète, sans les remplacer, les documents existants suivants :

| Document existant                                                                                 | Public cible           | Source de vérité pour                                          |
| ------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                          | Opérateurs             | Démarrage rapide utilisateur, flags, modèle de menace          |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                          | Implémenteurs de protocole | Catalogue des routes HTTP, formes requête/réponse, codes d'erreur |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)              | Utilisateurs du SDK    | Parcours TypeScript de bout en bout                            |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                                        | Auteurs d'adaptateurs  | Documentation de conception des adaptateurs clients historiques |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                                | Auteurs d'adaptateurs  | Notes de conception des adaptateurs clients                    |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)                  | Mainteneurs F2         | Conception du pool de transports MCP de l'espace de travail v2.2 |

Si vous voulez **démarrer un daemon et l'utiliser**, lisez d'abord `qwen-serve.md`. Si vous voulez **construire un client contre le format sur le fil**, lisez `qwen-serve-protocol.md`. Si vous voulez **comprendre, étendre ou déboguer les internes du daemon**, lisez cet ensemble.

## Ordre de lecture

Choisissez le chemin qui correspond à votre objectif :

- **Démarrer et vérifier un daemon en premier** : `20 -> 17 -> 19`.
- **Nouveau contributeur** : `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Ajouter un nouvel adaptateur client** : `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Travailler sur le pool MCP ou le budget** : `01 -> 03 -> 05 -> 06`.
- **Travailler sur les permissions** : `01 -> 03 -> 04 -> 12`.
- **Déboguer un daemon de production** : `19 -> 18 -> 17 -> 20`.

## Ensemble de documents

### Fondation

- [`01-architecture.md`](./01-architecture.md) — architecture système, topologie des processus, carte des paquets, et les sept diagrammes de séquence de haut niveau.

### Cœur du serveur

- [`02-serve-runtime.md`](./02-serve-runtime.md) — amorçage de `runQwenServe`, application Express, chaîne de middlewares, arrêt gracieux.
- [`03-acp-bridge.md`](./03-acp-bridge.md) — internes du paquet `@qwen-code/acp-bridge`, multiplexage de sessions, fabrique de canaux, lancement de l'enfant ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) — `MultiClientPermissionMediator`, quatre politiques, invariant N1 timeout, sentinelle d'annulation.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) — `McpTransportPool` (F2), entrées du pool, index inversé, redémarrage, vidage.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) — `WorkspaceMcpBudget`, modes (`off`/`warn`/`enforce`), hystérésis, regroupement des refus.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) — bac à sable `WorkspaceFileSystem`, politique de chemins, audit, contrat `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) — créer / attacher / charger / reprendre, `X-Qwen-Client-Id`, pulsation, éviction, métadonnées.
- [`09-event-schema.md`](./09-event-schema.md) — schéma d'événements typés v1 : les 43 types d'événements connus avec charges utiles, réducteurs, compatibilité ascendante.
- [`10-event-bus.md`](./10-event-bus.md) — `EventBus`, IDs monotones, rejeu circulaire, `Last-Event-ID`, contre-pression client lent, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) — registre de capacités, version de protocole, version de schéma, annonce conditionnelle.
- [`12-auth-security.md`](./12-auth-security.md) — middleware bearer, liste blanche d'hôtes, refus CORS, porte de mutation, `--require-auth`, exemption `/health`, flux d'appareil.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) — SDK TypeScript : `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, analyseur SSE, réducteurs d'événements, couche de transcription `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) — couche de transcription UI partagée et relation avec l'adaptateur daemon TUI CLI historique.
- [`15-channel-adapters.md`](./15-channel-adapters.md) — base partagée `DaemonChannelBridge` plus adaptateurs par canal : DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) — `DaemonIdeConnection`, application loopback uniquement, pont webview.

### Annexes de référence

- [`17-configuration.md`](./17-configuration.md) — variables d'environnement, flags CLI, clés `settings.json` qui affectent le daemon.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) — erreurs typées par couche avec remédiation.
- [`19-observability.md`](./19-observability.md) — `QWEN_SERVE_DEBUG`, recettes de débogage, lacunes de télémétrie.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) — chemin de démarrage le plus court, vérifications avec curl, carte des routes et recettes d'invocation embarquées.

## Glossaire

- **ACP** — Agent Client Protocol. JSON-RPC sur stdio échangé entre le pont du daemon et le processus enfant ACP. Ce n'est pas le protocole HTTP que les clients utilisent contre le daemon.
- **Enfant ACP** — le processus enfant que le daemon lance (`qwen --acp`) pour héberger l'exécution réelle de l'agent. Le pont multiplexe un seul enfant ACP entre plusieurs clients connectés.
- **acp-bridge** — le paquet `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Possède le multiplexage de sessions, le médiateur de permissions, le bus d'événements et la fabrique de canaux.
- **BridgeClient** — `packages/acp-bridge/src/bridgeClient.ts`. Enveloppe une `ClientSideConnection` ACP et gère `requestPermission`, `sendPrompt` et `cancelSession`.
- **Fabrique de canaux** — stratégie enfichable pour lancer ou attacher un enfant ACP. Le `spawnChannel` par défaut exécute `qwen --acp` comme sous-processus ; `inMemoryChannel` l'exécute en mémoire pour les tests.
- **DaemonClient** — `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Façade HTTP du SDK TypeScript au niveau du daemon.
- **DaemonSessionClient** — `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Enveloppe au niveau session qui suit `lastSeenEventId` pour le rejeu SSE.
- **EventBus** — `packages/acp-bridge/src/eventBus.ts`. Pub/sous mémoire par session avec IDs monotones, un anneau borné et une contre-pression par abonné.
- **F1 / F2 / F3 / F4** — jalons internes suivis dans [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1 : extraction du pont et `BridgeFileSystem`. F2 : pool de transports MCP à portée d'espace de travail. F3 : médiation de permissions multi-client. F4 : achèvement du protocole et surfaces client du daemon.
- **MCP** — Model Context Protocol. Les serveurs exposent des outils, ressources et invites ; l'enfant ACP du daemon s'y connecte.
- **McpTransportPool** — `packages/core/src/tools/mcp-transport-pool.ts`. Pool F2 à portée d'espace de travail partageant un transport MCP par nom de serveur et empreinte de configuration.
- **Politique du médiateur** — une parmi `first-responder`, `designated`, `consensus` ou `local-only`. Décide comment les votes de permission multi-client sont résolus.
- **Identifiant client d'origine** — le `X-Qwen-Client-Id` du client qui a initié l'invite demandant actuellement une permission. La politique `designated` n'accepte les votes que de cet identifiant.
- **PoolEntry** — `packages/core/src/tools/mcp-pool-entry.ts`. Une entrée dans `McpTransportPool` : un transport MCP, un compteur de références des sessions attachées et un minuteur de vidage inactif.
- **Portée de session** — `single` (une session ACP partagée par tous les clients) ou `thread` (une session par fil de conversation). La valeur par défaut est `single`.
- **SSE** — Server-Sent Events. Canal d'événements sortant du daemon (`GET /session/:id/events`).
- **Espace de travail** — le répertoire auquel le daemon a été lié au démarrage (`--workspace` ou `cwd`). Un processus daemon équivaut à un espace de travail.

## Ancres d'implémentation source

Utilisez ces ancres pour passer de la documentation au code `main` le plus récent :

| Surface                                     | Ancres d'implémentation                                                                                                                                                                                                                                   | Documentation principale                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Amorçage et assemblage HTTP                 | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                  |
| Pont ACP et multiplexage de sessions        | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                    | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                         |
| Médiation de permissions                    | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                   |
| Pool de transports MCP                      | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                             |
| Garde-fous du budget MCP                    | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                          | [`06`](./06-mcp-budget-guardrails.md)                                                                                 |
| Système de fichiers de l'espace de travail  | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                           | [`07`](./07-workspace-filesystem.md)                                                                                  |
| Schéma d'événements et écrivain SSE         | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| Resynchronisation d'événements              | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| Capacités                                   | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                          | [`11`](./11-capabilities-versioning.md)                                                                               |
| Authentification et flux d'appareil         | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                            | [`12`](./12-auth-security.md)                                                                                         |
| Client daemon du SDK TypeScript             | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                              | [`13`](./13-sdk-daemon-client.md)                                                                                     |
| Couche de transcription UI partagée         | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Adaptateurs de canaux et IDE                | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                 | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                  |

## Ce qui est intentionnellement hors de portée

- **Clients daemon SDK Java / Python** — seul le SDK TypeScript fournit aujourd'hui un client daemon. Le document 13 est exclusivement TypeScript.
- **Détails du produit Web UI** — la couche de transcription partagée et les points d'entrée du daemon Web UI sont couverts ici, mais la disposition du produit UI est suivie dans `docs/developers/daemon-ui/` et les notes de conception des adaptateurs.
- **Extension Zed (`packages/zed-extension/`)** — elle lance `qwen --acp` directement via stdio et contourne le daemon.
- **Hébergement expérimental en mémoire** — `--no-http-bridge` revient encore au http-bridge aujourd'hui ; un mode serve stable en mémoire nécessiterait une nouvelle documentation quand il arrivera.

## Couverture actuelle du mode daemon

### Couverture du cœur du serveur

| Domaine                        | État actuel                                                                                                                                                                 | Documentation principale                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Amorçage / chemin d'écoute     | `qwen serve` charge paresseusement `runQwenServe`, valide auth/espace de travail/budget/paramètres, construit une application Express, puis appelle `app.listen` et bloque pour toujours jusqu'au signal. | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)            |
| Authentification / garde-fous réseau | Loopback par défaut sans bearer ; non-loopback nécessite bearer ; `--require-auth` étend le bearer à loopback et `/health` ; la liste blanche d'hôtes et le refus CORS par défaut sont actifs. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                    |
| Cycle de vie des sessions      | `POST /session`, `load`, `resume`, mise à jour des métadonnées, pulsation, éviction, nettoyage inactif, limites d'invites en attente et fermeture gracieuse sont documentés. | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                    |
| Pont ACP                       | Un seul enfant ACP multiplexé par défaut ; `sessionScope` prend en charge `single` et `thread` ; `BridgeFileSystem`, nom de fichier de contexte, surcharges d'environnement et délai d'inactivité du canal sont câblés. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)                |
| Pool MCP / budget              | Le pool MCP de l'espace de travail est activé par défaut sauf si `QWEN_SERVE_NO_MCP_POOL=1` ; les événements de garde-fou et la sémantique de redémarrage sont documentés.                     | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)       |
| Permissions                    | Le médiateur F3 prend en charge `first-responder`, `designated`, `consensus` et `local-only` ; les paramètres invalides échouent explicitement.                                             | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)             |

### Protocole filaire

| Domaine          | État actuel                                                                                                                                                   | Documentation principale                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Routes HTTP      | Le catalogue des routes se trouve dans `qwen-serve-protocol.md` ; cet ensemble du daemon ne fait que le référencer et expliquer la propriété d'implémentation. | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                       |
| Schéma d'événements | `EVENT_SCHEMA_VERSION = 1` ; 43 types d'événements connus ; trames synthétiques d'abonné sans id ; `_meta.serverTimestamp` estampillé à la limite d'écriture SSE. | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| Capacités        | `SERVE_PROTOCOL_VERSION = 'v1'` ; 67 balises enregistrées ; 10 balises conditionnelles.                                                                       | [`11`](./11-capabilities-versioning.md)                                                                               |
| Shell de session | `POST /session/:id/shell` existe derrière `--enable-session-shell`, auth bearer, et `X-Qwen-Client-Id` lié à la session ; la balise de capacité est conditionnelle. | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)         |
| Limitation de débit | Limitation de débit HTTP optionnelle par niveau est exposée par les flags CLI/env et une balise de capacité conditionnelle.                                      | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                                |

### Clients / SDK

| Domaine                         | État actuel                                                                                                                                                         | Documentation principale                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client daemon du SDK TypeScript | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, analyseur SSE, réducteurs d'événements, pré-vérification des fonctionnalités et exports de transcription UI sont documentés. | [`13`](./13-sdk-daemon-client.md)                                                                                                                                                 |
| Couche de transcription UI partagée | Le SDK `daemon/ui/*` normalise les événements du daemon en 37 types d'événements UI sémantiques, les réduit en blocs de transcription et fournit des helpers de rendu/conformité. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)                                     |
| Consommateur daemon Web UI      | `packages/webui/src/daemon/` consomme le magasin de transcription du SDK à travers des fournisseurs React et des adaptateurs.                                               | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                                                     |
| CLI TUI / canaux / VS Code      | Les chemins historiques existent encore ; la migration vers les primitives de transcription partagées est documentée comme travail de suivi, pas comme comportement achevé. | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                                             |
### Référence et opérations

| Domaine                  | État actuel                                                                                                                                                                  | Documentation principale            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Configuration            | L'ensemble des flags `qwen serve`, variables d'environnement, `settings.json`, `ServeOptions`, `BridgeOptions` et constantes importantes est rassemblé sur une seule page.   | [`17`](./17-configuration.md)       |
| Démarrage rapide / opérations | Parcours de démarrage le plus court, recettes de lancement, vérifications curl, comportement d'authentification de la page de démonstration, répartition des routes, comportement d'arrêt et recettes d'appels intégrées sont couverts. | [`20`](./20-quickstart-operations.md) |
| Erreurs                  | Les pannes explicites au démarrage, les erreurs de route, les erreurs de pont, les erreurs EventBus, les erreurs du système de fichiers et les erreurs du médiateur sont résumées avec remédiation. | [`18`](./18-error-taxonomy.md)      |
| Observabilité            | `QWEN_SERVE_DEBUG`, recettes curl, événements utiles, lacunes de télémétrie et listes de vérification d'investigation sont documentés. | [`19`](./19-observability.md)       |

### Surfaces historiques ou obsolètes

| Surface                                            | Statut                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Brouillon historique pour l'ancien prototype `DaemonTuiAdapter` ; l'architecture actuelle des transcriptions partagées de l'interface se trouve dans le doc 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Adaptateur expérimental hérité toujours présent dans l'arborescence. Pour les nouveaux travaux d'interface partagée, privilégier le SDK `daemon/ui/*`. |
| `--no-http-bridge`                                 | Accepté pour compatibilité mais se rabat sur le pont HTTP et imprime sur stderr.                                                    |

### Compatibilité ascendante

- Le schéma d'événements v1 est additif. Les nouveaux types d'événements connus doivent être ajoutés à `DAEMON_KNOWN_EVENT_TYPE_VALUES` ; les anciens SDK doivent traiter les types inconnus comme étant rétrocompatibles.
- Les balises de capacité sont des contrats de comportement. Un nouveau comportement nécessite une nouvelle balise, surtout si les clients peuvent l'utiliser en pré-vérification avant d'appeler une route.
- `sessionScope: 'thread'` est la répartition actuelle par fil de conversation ; évitez de réintroduire les anciens termes à portée client.
- `_meta` de l'enveloppe et `data._meta` de la charge utile ACP sont distincts. La provenance des appels d'outils réside dans la charge utile ACP ; les horodatages d'émission du serveur se trouvent sur l'enveloppe SSE.

## Provenance de la version

Cet ensemble de documents reflète la surface du mode démon actuellement fusionnée dans `main`, y compris les travaux de suivi de [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Il décrit intentionnellement le comportement actuel plutôt que les anciens instantanés de planification de la série F.