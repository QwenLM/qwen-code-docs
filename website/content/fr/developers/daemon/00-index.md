# Documentation développeur du daemon

Ceci est la documentation technique destinée aux développeurs pour le **mode daemon de qwen-code** : le daemon HTTP `qwen serve`, le package `@qwen-code/acp-bridge`, le pool de transports MCP par workspace, la médiation des permissions multi-clients, le schéma d'événements typés du daemon v1, le client daemon du SDK TypeScript, et les adaptateurs qui se connectent au daemon.

Elle complète, sans les remplacer, les documentations existantes suivantes :

| Documentation existante                                                                  | Public cible            | Source de référence pour                                   |
| ---------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                 | Opérateurs              | Démarrage rapide utilisateur, flags, modèle de menace      |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                 | Implémenteurs du protocole | Catalogue des routes HTTP, formats des requêtes/réponses, codes d'erreur |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)     | Utilisateurs du SDK     | Guide complet de bout en bout en TypeScript                |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                               | Auteurs d'adaptateurs   | Documents de conception des adaptateurs clients hérités    |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                       | Auteurs d'adaptateurs   | Notes de conception des adaptateurs clients                |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)         | Mainteneurs F2          | Conception du pool de transports MCP par workspace v2.2    |

Si vous souhaitez **démarrer un daemon et l'utiliser**, lisez d'abord `qwen-serve.md`. Si vous souhaitez **développer un client basé sur le wire format**, lisez `qwen-serve-protocol.md`. Si vous souhaitez **comprendre, étendre ou déboguer le fonctionnement interne du daemon**, lisez cette documentation.

## Ordre de lecture

Choisissez le parcours qui correspond à votre objectif :

- **Démarrer et vérifier un daemon en premier** : `20 -> 17 -> 19`.
- **Nouveau contributeur** : `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Ajouter un nouvel adaptateur client** : `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Travailler sur le pool MCP ou le budget** : `01 -> 03 -> 05 -> 06`.
- **Travailler sur les permissions** : `01 -> 03 -> 04 -> 12`.
- **Déboguer un daemon en production** : `19 -> 18 -> 17 -> 20`.

## Liste des documents

### Fondations

- [`01-architecture.md`](./01-architecture.md) - architecture système, topologie des processus, carte des packages, et les sept diagrammes de séquence de haut niveau.

### Cœur du serveur

- [`02-serve-runtime.md`](./02-serve-runtime.md) - bootstrap `runQwenServe`, application Express, chaîne de middlewares, arrêt gracieux.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - fonctionnement interne du package `@qwen-code/acp-bridge`, multiplexage de sessions, fabrique de canaux, création du processus enfant ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, quatre politiques, invariant de timeout N1, sentinelle d'annulation.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), entrées du pool, index inversé, redémarrage, vidange.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, modes (`off`/`warn`/`enforce`), hystérésis, fusion des lots refusés.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - sandbox `WorkspaceFileSystem`, politique de chemins, audit, contrat `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - création / attachement / chargement / reprise, `X-Qwen-Client-Id`, heartbeat, eviction, métadonnées.
- [`09-event-schema.md`](./09-event-schema.md) - schéma d'événements typés v1 : les 47 types d'événements connus avec leurs payloads, réducteurs, compatibilité vers l'avant.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, IDs monotones, relecture en anneau, `Last-Event-ID`, backpressure pour les clients lents, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - registre de capacités, version du protocole, version du schéma, annonce conditionnelle.
- [`12-auth-security.md`](./12-auth-security.md) - middleware bearer, liste blanche d'hôtes, refus CORS, barrière de mutation, `--require-auth`, exemption de `/health`, device flow.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - SDK TypeScript : `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, parseur SSE, réducteurs d'événements, couche de transcription `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - couche de transcription UI partagée et relation avec l'adaptateur daemon CLI TUI hérité.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - base partagée `DaemonChannelBridge` plus les adaptateurs par canal pour DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, application stricte du loopback uniquement, pont webview.

### Annexes de référence

- [`17-configuration.md`](./17-configuration.md) - variables d'environnement, flags CLI, clés `settings.json` qui affectent le daemon.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - erreurs typées par couche avec remédiation.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, recettes de débogage, lacunes de télémétrie.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - chemin de démarrage le plus court, vérifications curl, carte des routes, et recettes d'invocation intégrées.

## Glossaire

- **ACP** - Agent Client Protocol. JSON-RPC sur stdio utilisé entre le bridge du daemon et le processus enfant ACP. Ce n'est pas le protocole HTTP utilisé par les clients pour communiquer avec le daemon.
- **Enfant ACP** - le processus enfant que le daemon crée (`qwen --acp`) pour héberger le runtime de l'agent réel. Le bridge multiplexe un enfant ACP pour de nombreux clients connectés.
- **acp-bridge** - le package `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Gère le multiplexage de sessions, le médiateur de permissions, le bus d'événements et la fabrique de canaux.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Encapsule une `ClientSideConnection` ACP, et gère `requestPermission`, `sendPrompt`, et `cancelSession`.
- **Fabrique de canaux** - stratégie enfichable pour créer ou s'attacher à un enfant ACP. Le `spawnChannel` par défaut exécute `qwen --acp` en tant que sous-processus ; `inMemoryChannel` l'exécute dans le même processus pour les tests.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. La façade de niveau HTTP du SDK TypeScript pour le daemon.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Wrapper limité à la session qui suit le `lastSeenEventId` pour la relecture SSE.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Pub/sub en mémoire par session avec des IDs monotones, un anneau borné, et un backpressure par abonné.
- **F1 / F2 / F3 / F4** - jalons internes suivis dans [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1 : extraction du bridge et `BridgeFileSystem`. F2 : pool de transports MCP par workspace. F3 : médiation des permissions multi-clients. F4 : finalisation du protocole et surfaces du client daemon.
- **MCP** - Model Context Protocol. Les serveurs exposent des outils, des ressources et des prompts ; l'enfant ACP du daemon s'y connecte.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. Pool F2 par workspace partageant un transport MCP par nom de serveur et empreinte de configuration.
- **Politique du médiateur** - une des politiques `first-responder`, `designated`, `consensus`, ou `local-only`. Détermine comment les votes de permission multi-clients sont résolus.
- **ID du client initiateur** - le `X-Qwen-Client-Id` du client qui a initié le prompt demandant actuellement une permission. La politique `designated` n'accepte les votes que de cet ID.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Une entrée dans `McpTransportPool` : un transport MCP, un compteur de références des sessions attachées, et un timer de vidange en cas d'inactivité.
- **Portée de la session** - `single` (une session ACP partagée par tous les clients) ou `thread` (une session par fil de conversation). La valeur par défaut est `single`.
- **SSE** - Server-Sent Events. Le canal d'événements sortants du daemon (`GET /session/:id/events`).
- **Workspace** - le répertoire auquel le daemon a été lié au démarrage (`--workspace` ou `cwd`). Un processus daemon équivaut à un workspace.

## Ancres sources d'implémentation

Utilisez ces ancres pour passer de la documentation au code le plus récent de la branche `main` :

| Surface                             | Ancres d'implémentation                                                                                                                                                                                                                                                | Documentation principale                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bootstrap et assemblage HTTP        | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                                | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| Bridge ACP et multiplexage de sessions | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                               | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| Médiation des permissions           | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                   | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| Pool de transports MCP              | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                             | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| Garde-fous du budget MCP            | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                       | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| Système de fichiers du workspace    | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                        | [`07`](./07-workspace-filesystem.md)                                                                                   |
| Schéma d'événements et writer SSE   | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Resynchronisation des événements    | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                           | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capacités                           | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                       | [`11`](./11-capabilities-versioning.md)                                                                                |
| Authentification et device flow     | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                         | [`12`](./12-auth-security.md)                                                                                          |
| Client daemon du SDK TypeScript     | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                           | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| Couche de transcription UI partagée | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                             | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Canaux et adaptateurs IDE           | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                              | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## Ce qui est intentionnellement hors périmètre

- **Clients daemon des SDK Java / Python** - seul le SDK TypeScript fournit un client daemon aujourd'hui. La doc 13 est spécifique à TypeScript.
- **Détails du produit Web UI** - la couche de transcription partagée et les points d'entrée du daemon pour la Web UI sont couverts ici, mais la disposition de l'UI produit est suivie dans `docs/developers/daemon-ui/` et les notes de conception des adaptateurs.
- **Extension Zed (`packages/zed-extension/`)** - elle lance `qwen --acp` directement sur stdio et contourne le daemon.
- **Hébergement expérimental in-process** - `--no-http-bridge` retombe encore sur le http-bridge aujourd'hui ; un mode serve in-process stable nécessiterait une nouvelle documentation lors de sa sortie.

## Couverture actuelle du mode daemon

### Couverture du cœur du serveur

| Domaine                   | État actuel                                                                                                                                                                      | Documentation principale                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bootstrap / chemin d'écoute | `qwen serve` charge en lazy-loading `runQwenServe`, valide l'auth/workspace/budget/settings, construit une application Express, puis appelle `app.listen` et bloque indéfiniment jusqu'à un signal. | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)      |
| Auth / garde-fous réseau  | Le loopback est par défaut sans bearer ; le non-loopback exige un bearer ; `--require-auth` étend le bearer au loopback et à `/health` ; la liste blanche d'hôtes et le refus CORS par défaut sont actifs. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)              |
| Cycle de vie de la session | `POST /session`, `load`, `resume`, patch de métadonnées, heartbeat, eviction, nettoyage des sessions inactives, limites de prompts en attente, et fermeture gracieuse sont documentés. | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)              |
| Bridge ACP                | Un seul enfant ACP multiplexé par défaut ; `sessionScope` prend en charge `single` et `thread` ; `BridgeFileSystem`, le nom du fichier de contexte, les overrides d'environnement et le timeout d'inactivité du canal sont câblés. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)          |
| Pool / budget MCP         | Le pool MCP par workspace est activé par défaut sauf si `QWEN_SERVE_NO_MCP_POOL=1` ; les événements de garde-fous et la sémantique de redémarrage sont documentés.               | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| Permissions               | Le médiateur F3 prend en charge `first-responder`, `designated`, `consensus`, et `local-only` ; les paramètres invalides échouent explicitement.                                  | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)       |

### Protocole wire

| Domaine          | État actuel                                                                                                                                                                                         | Documentation principale                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Routes HTTP      | Le catalogue des routes se trouve dans `qwen-serve-protocol.md` ; cet ensemble de docs sur le daemon ne fait que le référencer et expliquer la propriété de l'implémentation.                       | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)               |
| Schéma d'événements | `EVENT_SCHEMA_VERSION = 1` ; 47 types d'événements connus ; trames synthétiques sans ID pour les abonnés ; `_meta.serverTimestamp` horodaté par `EventBus.publish()` (avec `formatSseFrame()` en fallback pour les trames synthétiques). | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                       |
| Capacités        | `SERVE_PROTOCOL_VERSION = 'v1'` ; 75 tags enregistrés ; 13 tags conditionnels.                                                                                                                      | [`11`](./11-capabilities-versioning.md)                                                                       |
| Shell de session | `POST /session/:id/shell` existe derrière `--enable-session-shell`, l'auth bearer, et un `X-Qwen-Client-Id` lié à la session ; le tag de capacité est conditionnel.                                  | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| Limitation de débit | Une limite de débit HTTP optionnelle par niveau est exposée par des flags CLI/env et un tag de capacité conditionnel.                                                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                        |
### Clients / SDK

| Domaine                        | État actuel                                                                                                                                                | Documentation principale                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Client daemon du SDK TypeScript | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, le parseur SSE, les réducteurs d'événements, la pré-vérification des fonctionnalités et les exports de transcript UI sont documentés.            | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| Couche de transcript UI partagée   | Le SDK `daemon/ui/*` normalise les événements du daemon en 42 types d'événements sémantiques UI, les réduit en blocs de transcript et fournit des helpers de rendu/conformité. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Consommateur daemon de l'UI Web       | `packages/webui/src/daemon/` consomme le store de transcript du SDK via des providers et des adapters React.                                                         | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / channels / VS Code | Les chemins hérités existent toujours ; la migration vers les primitives de transcript partagées est documentée comme travail de suivi, et non comme un comportement finalisé.                                 | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### Référence et opérations

| Domaine                    | État actuel                                                                                                                                             | Documentation principale                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Configuration           | L'ensemble des flags `qwen serve`, des variables d'environnement, de `settings.json`, de `ServeOptions`, de `BridgeOptions` et des constantes importantes sont regroupés sur une seule page.                   | [`17`](./17-configuration.md)         |
| Démarrage rapide / opérations | Le chemin de démarrage le plus court, les recettes de lancement, les vérifications curl, le comportement d'authentification de la page de démo, la répartition des routes, le comportement d'arrêt et les recettes d'invocation intégrée y sont couverts. | [`20`](./20-quickstart-operations.md) |
| Erreurs                  | Les échecs explicites au démarrage, les erreurs de route, les erreurs de bridge, les erreurs d'EventBus, les erreurs de système de fichiers et les erreurs de médiateur sont résumés avec leurs solutions.        | [`18`](./18-error-taxonomy.md)        |
| Observabilité           | `QWEN_SERVE_DEBUG`, les recettes curl, les événements utiles, les lacunes de télémétrie et les checklists d'investigation sont documentés.                                             | [`19`](./19-observability.md)         |

### Surfaces historiques ou obsolètes

| Surface                                            | Statut                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Brouillon historique pour l'ancien spike `DaemonTuiAdapter` ; l'architecture actuelle de transcript UI partagée se trouve dans la doc 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Adapter expérimental hérité toujours présent dans l'arborescence. Les nouveaux travaux sur l'UI partagée doivent privilégier le SDK `daemon/ui/*`.                 |
| `--no-http-bridge`                                 | Accepté pour des raisons de compatibilité, mais bascule sur le http-bridge en repli et affiche un message sur stderr.                                    |

### Compatibilité ascendante

- Le schéma d'événements v1 est additif. Les nouveaux types d'événements connus doivent être ajoutés à `DAEMON_KNOWN_EVENT_TYPE_VALUES` ; les anciens SDK doivent traiter les types inconnus en assurant la compatibilité ascendante.
- Les tags de capacité sont des contrats de comportement. Un nouveau comportement nécessite un nouveau tag, surtout si les clients peuvent effectuer une pré-vérification avant d'appeler une route.
- `sessionScope: 'thread'` est le découpage actuel par thread de conversation ; évitez de réintroduire l'ancien vocabulaire centré sur le client.
- Les `_meta` de l'enveloppe et les `data._meta` du payload ACP sont distincts. La provenance des appels d'outils se trouve dans le payload ACP ; les horodatages d'émission du serveur se trouvent dans l'enveloppe SSE.

## Provenance de la version

Cet ensemble de documents reflète la surface du mode daemon actuellement fusionnée dans `main`, y compris le travail de suivi issu de [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Il décrit intentionnellement le comportement actuel au lieu des anciens instantanés de planification de la série F.