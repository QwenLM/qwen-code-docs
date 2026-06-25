# Documentation développeur du démon

Ceci est la documentation technique destinée aux développeurs pour le **mode démon de qwen-code** : le démon HTTP `qwen serve`, le paquet `@qwen-code/acp-bridge`, le pool de transport MCP limité à l’espace de travail, la médiation d’autorisations multi-client, le schéma d’événements typé du démon v1, le client SDK TypeScript du démon et les adaptateurs qui se connectent au démon.

Elle complète, sans les remplacer, les documents existants suivants :

| Document existant                                                                     | Public              | Source de vérité pour                                       |
| ------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                              | Opérateurs          | Guide de démarrage utilisateur, options, modèle de menace   |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                              | Implémenteurs du protocole | Catalogue des routes HTTP, formes requête/réponse, codes d’erreur |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)  | Utilisateurs du SDK  | Procédure pas à pas TypeScript de bout en bout             |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                            | Auteurs d’adaptateurs | Documents de conception des adaptateurs clients existants   |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                    | Auteurs d’adaptateurs | Notes de conception des adaptateurs clients                 |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)      | Mainteneurs F2       | Conception du pool de transport MCP v2.2 de l’espace de travail |

Si vous voulez **lancer un démon et l’utiliser**, lisez d’abord `qwen-serve.md`. Si vous voulez **construire un client basé sur le format filaire**, lisez `qwen-serve-protocol.md`. Si vous voulez **comprendre, étendre ou déboguer les internes du démon**, lisez cet ensemble.

## Ordre de lecture

Choisissez le chemin qui correspond à votre objectif :

- **Lancer et vérifier un démon d’abord** : `20 -> 17 -> 19`.
- **Nouveau contributeur** : `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Ajouter un nouvel adaptateur client** : `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Travailler sur le pool MCP ou le budget** : `01 -> 03 -> 05 -> 06`.
- **Travailler sur les permissions** : `01 -> 03 -> 04 -> 12`.
- **Déboguer un démon en production** : `19 -> 18 -> 17 -> 20`.

## Ensemble de documents

### Fondation

- [`01-architecture.md`](./01-architecture.md) – architecture du système, topologie des processus, carte des paquets et les sept diagrammes de séquence de haut niveau.

### Cœur du serveur

- [`02-serve-runtime.md`](./02-serve-runtime.md) – amorçage de `runQwenServe`, application Express, chaîne de middleware, arrêt gracieux.
- [`03-acp-bridge.md`](./03-acp-bridge.md) – internes du paquet `@qwen-code/acp-bridge`, multiplexage de session, fabrique de canaux, création de processus enfant ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) – `MultiClientPermissionMediator`, quatre politiques, invariant du délai N1, sentinelle d’annulation.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) – `McpTransportPool` (F2), entrées du pool, index inversé, redémarrage, vidange.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) – `WorkspaceMcpBudget`, modes (`off`/`warn`/`enforce`), hystérésis, regroupement des refus.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) – bac à sable `WorkspaceFileSystem`, politique de chemin, audit, contrat `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) – création / attachement / chargement / reprise, `X-Qwen-Client-Id`, battement cardiaque, éviction, métadonnées.
- [`09-event-schema.md`](./09-event-schema.md) – schéma d’événements typé v1 : les 43 types d’événements connus avec leurs charges utiles, réducteurs, compatibilité ascendante.
- [`10-event-bus.md`](./10-event-bus.md) – `EventBus`, identifiants monotones, rejeu circulaire, `Last-Event-ID`, contre-pression client lent, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) – registre des capacités, version du protocole, version du schéma, annonce conditionnelle.
- [`12-auth-security.md`](./12-auth-security.md) – middleware Bearer, liste blanche d’hôtes, refus CORS, porte de mutation, `--require-auth`, exemption `/health`, flux d’appareil.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) – SDK TypeScript : `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, analyseur SSE, réducteurs d’événements, couche de transcription `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) – couche de transcription UI partagée et relation avec l’adaptateur de démon TUI CLI existant.
- [`15-channel-adapters.md`](./15-channel-adapters.md) – `DaemonChannelBridge` base partagée plus adaptateurs par canal : DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) – `DaemonIdeConnection`, application de boucle locale uniquement, pont webview.

### Annexes de référence

- [`17-configuration.md`](./17-configuration.md) – variables d’environnement, options CLI, clés `settings.json` qui affectent le démon.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) – erreurs typées par couche avec remédiation.
- [`19-observability.md`](./19-observability.md) – `QWEN_SERVE_DEBUG`, recettes de débogage, lacunes de télémétrie.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) – chemin de démarrage le plus court, vérifications avec curl, carte des routes et recettes d’invocation intégrées.
## Glossaire

- **ACP** - Protocole client agent. JSON-RPC sur stdio échangé entre le bridge daemon et le processus enfant ACP. Il ne s'agit pas du protocole HTTP que les clients utilisent contre le daemon.
- **Enfant ACP** - le processus enfant que le daemon lance (`qwen --acp`) pour héberger le runtime agent réel. Le bridge multiplexe un seul enfant ACP entre plusieurs clients connectés.
- **Pont ACP** - le package `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Gère le multiplexage des sessions, le médiateur de permissions, le bus d'événements et la fabrique de canaux.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Enveloppe une `ClientSideConnection` ACP et gère `requestPermission`, `sendPrompt` et `cancelSession`.
- **Fabrique de canaux** - stratégie enfichable pour lancer ou se connecter à un enfant ACP. Le `spawnChannel` par défaut exécute `qwen --acp` en tant que sous-processus ; `inMemoryChannel` l'exécute dans le même processus pour les tests.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. La couche HTTP de haut niveau du SDK TypeScript pour interagir avec le daemon.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Wrapper limité à une session qui suit `lastSeenEventId` pour la relecture SSE.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Publication/abonnement en mémoire par session avec des identifiants monotones, un anneau limité et une contre-pression par abonné.
- **F1 / F2 / F3 / F4** - jalons internes suivis dans [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1 : extraction du pont et `BridgeFileSystem`. F2 : pool de transport MCP limité à l'espace de travail. F3 : médiation de permissions multi-client. F4 : achèvement du protocole et surfaces client du daemon.
- **MCP** - Protocole de contexte de modèle. Les serveurs exposent des outils, des ressources et des invites ; l'enfant ACP du daemon s'y connecte.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. Pool limité à l'espace de travail F2 partageant un transport MCP par nom de serveur et empreinte de configuration.
- **Stratégie du médiateur** - une de `first-responder`, `designated`, `consensus` ou `local-only`. Décide comment les votes de permissions multi-client sont résolus.
- **Identifiant du client initiateur** - le `X-Qwen-Client-Id` du client qui a lancé l'invite demandant actuellement une permission. La stratégie `designated` accepte uniquement les votes de cet identifiant.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Une entrée dans `McpTransportPool` : un transport MCP, un compteur de références des sessions attachées et un minuteur de vidange inactif.
- **Portée de session** - `single` (une session ACP partagée par tous les clients) ou `thread` (une session par fil de conversation). La valeur par défaut est `single`.
- **SSE** - Événements envoyés par le serveur. Le canal d'événements sortant du daemon (`GET /session/:id/events`).
- **Espace de travail** - le répertoire auquel le daemon a été lié au démarrage (`--workspace` ou `cwd`). Un processus daemon équivaut à un espace de travail.

## Points d'ancrage des sources d'implémentation

Utilisez ces points d'ancrage lorsque vous passez de la documentation au code `main` le plus récent :

| Surface                                     | Points d'ancrage de l'implémentation                                                                                                                                                                                                                                    | Documentation principale                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Bootstrap et assemblage HTTP                | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                                        | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                  |
| Pont ACP et multiplexage de sessions        | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                                   | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                         |
| Médiation des permissions                   | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                     | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                   |
| Pool de transport MCP                       | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                               | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                             |
| Garde-fous de budget MCP                    | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                         | [`06`](./06-mcp-budget-guardrails.md)                                                                                 |
| Système de fichiers de l'espace de travail  | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                          | [`07`](./07-workspace-filesystem.md)                                                                                  |
| Schéma d'événements et rédacteur SSE        | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId`                 | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| Resynchronisation des événements            | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                               | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| Capacités                                   | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                         | [`11`](./11-capabilities-versioning.md)                                                                               |
| Authentification et flux d'appareil         | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                           | [`12`](./12-auth-security.md)                                                                                         |
| Client daemon SDK TypeScript                | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                             | [`13`](./13-sdk-daemon-client.md)                                                                                     |
| Couche de transcription partagée de l'interface | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                                | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Canaux et adaptateurs IDE                   | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                                | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                  |
## Ce qui est intentionnellement hors du périmètre

- **Clients démons Java / Python SDK** - seul le SDK TypeScript fournit un client démon aujourd'hui. Le doc 13 est réservé à TypeScript.
- **Détails du produit UI Web** - la couche de transcription partagée et les points d'entrée du démon UI Web sont couverts ici, mais la disposition de l'interface produit est suivie dans `docs/developers/daemon-ui/` et les notes de conception des adaptateurs.
- **Extension Zed (`packages/zed-extension/`)** - elle lance `qwen --acp` via stdio directement et contourne le démon.
- **Hébergement expérimental in-process** - `--no-http-bridge` retombe encore sur http-bridge aujourd'hui ; un mode de service in-process stable nécessiterait de nouveaux docs quand il arrivera.

## Couverture actuelle du mode démon

### Cœur du serveur

| Domaine                          | État actuel                                                                                                                                                                                        | Documentation principale                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Amorçage / chemin d'écoute       | `qwen serve` charge paresseusement `runQwenServe`, valide auth/espace de travail/budget/paramètres, construit une application Express, puis appelle `app.listen` et se bloque à jamais jusqu'au signal. | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)           |
| Auth / garde-fous réseau         | Loopback par défaut sans bearer ; non-loopback nécessite bearer ; `--require-auth` étend bearer à loopback et à `/health` ; une liste blanche d'hôtes et un refus CORS par défaut sont actifs.        | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                   |
| Cycle de vie des sessions        | `POST /session`, `load`, `resume`, patch de métadonnées, heartbeat, éviction, récupération des inactifs, limites d'attente de prompt et fermeture gracieuse sont documentés.                         | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                   |
| Pont ACP                         | Par défaut, un seul enfant ACP multiplexé ; `sessionScope` prend en charge `single` et `thread` ; `BridgeFileSystem`, nom de fichier de contexte, surcharges d'env et timeout inactif du canal sont câblés. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)               |
| Pool MCP / budget                | Pool MCP de l'espace de travail activé par défaut sauf si `QWEN_SERVE_NO_MCP_POOL=1` ; les événements de garde-fou et les sémantiques de redémarrage sont documentés.                               | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)      |
| Permissions                      | Le médiateur F3 prend en charge `first-responder`, `designated`, `consensus` et `local-only` ; les paramètres invalides échouent explicitement.                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)            |

### Protocole filaire

| Domaine               | État actuel                                                                                                                                                                          | Documentation principale                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Routes HTTP           | Le catalogue des routes se trouve dans `qwen-serve-protocol.md` ; cet ensemble démon ne fait que le référencer et explique la propriété de l'implémentation.                           | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                          |
| Schéma d'événements   | `EVENT_SCHEMA_VERSION = 1` ; 43 types d'événements connus ; trames synthétiques d'abonnés sans id ; `_meta.serverTimestamp` estampillé à la limite d'écriture SSE.                    | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                  |
| Capacités             | `SERVE_PROTOCOL_VERSION = 'v1'` ; 67 tags enregistrés ; 10 tags conditionnels.                                                                                                       | [`11`](./11-capabilities-versioning.md)                                                                                  |
| Shell de session      | `POST /session/:id/shell` existe derrière `--enable-session-shell`, auth bearer, et `X-Qwen-Client-Id` lié à la session ; le tag de capacité est conditionnel.                       | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)            |
| Limitation de débit    | Une limitation de débit HTTP optionnelle par niveau est exposée par les indicateurs CLI/env et un tag de capacité conditionnel.                                                       | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                                   |

### Clients / SDK

| Domaine                             | État actuel                                                                                                                                                                     | Documentation principale                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client démon SDK TypeScript         | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, analyseur SSE, réducteurs d'événements, pré-vérification de fonctionnalités et exports d'interface utilisateur sont documentés. | [`13`](./13-sdk-daemon-client.md)                                                                                                                         |
| Couche d'interface utilisateur partagée | SDK `daemon/ui/*` normalise les événements du démon en 37 types d'événements sémantiques UI, les réduit en blocs de transcription et fournit des helpers de rendu/conformité.       | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)             |
| Consommateur UI Web du démon        | `packages/webui/src/daemon/` consomme le magasin de transcription SDK via des fournisseurs React et des adaptateurs.                                                             | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                             |
| CLI TUI / canaux / VS Code          | Les chemins hérités existent encore ; la migration vers des primitives de transcription partagées est documentée comme travail de suivi, pas comme comportement terminé.          | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                     |
### Référence et opérations

| Domaine                  | État actuel                                                                                                                                                                | Documentation principale                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Configuration            | Tous les drapeaux `qwen serve`, variables d'environnement, `settings.json`, `ServeOptions`, `BridgeOptions` et constantes importantes sont regroupés dans une seule page. | [`17`](./17-configuration.md)           |
| Démarrage rapide / opérations | Chemin de démarrage le plus court, recettes de lancement, vérifications curl, comportement d'authentification de la page de démonstration, séparation des routes, comportement d'arrêt et recettes d'invocation intégrées sont couverts. | [`20`](./20-quickstart-operations.md)   |
| Erreurs                  | Échecs explicites au démarrage, erreurs de route, erreurs de pont, erreurs EventBus, erreurs de système de fichiers et erreurs de médiateur sont résumées avec des mesures correctives. | [`18`](./18-error-taxonomy.md)          |
| Observabilité            | `QWEN_SERVE_DEBUG`, recettes curl, événements utiles, lacunes de télémétrie et listes de contrôle d'investigation sont documentés.                                          | [`19`](./19-observability.md)           |

### Surfaces historiques ou obsolètes

| Surface                                            | Statut                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Brouillon historique pour le pic `DaemonTuiAdapter` ; l'architecture actuelle du transcript UI partagé est dans le doc 14.              |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Adaptateur expérimental hérité toujours dans l'arborescence. Les nouveaux travaux UI partagés devraient préférer le SDK `daemon/ui/*`.    |
| `--no-http-bridge`                                 | Accepté pour compatibilité mais revient à http-bridge et affiche stderr.                                                                |

### Compatibilité ascendante

- Le schéma d'événement v1 est additif. Les nouveaux types d'événements connus doivent être ajoutés à `DAEMON_KNOWN_EVENT_TYPE_VALUES` ; les anciens SDK doivent traiter les types inconnus comme compatibles ascendants.
- Les balises de capacité sont des contrats de comportement. Un nouveau comportement nécessite une nouvelle balise, surtout si les clients pourraient le pré-valider avant d'appeler une route.
- `sessionScope: 'thread'` est la séparation actuelle par fil de conversation ; évitez de réintroduire une terminologie antérieure basée sur le client.
- `_meta` de l'enveloppe et `data._meta` de la charge utile ACP sont distincts. La provenance des appels d'outils réside dans la charge utile ACP ; les horodatages d'émission du serveur résident dans l'enveloppe SSE.

## Provenance de la version

Cet ensemble de documents reflète la surface du mode démon actuellement fusionné dans `main`, y compris le travail de suivi de [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Il décrit intentionnellement le comportement actuel plutôt que les instantanés de planification antérieurs de la série F.
