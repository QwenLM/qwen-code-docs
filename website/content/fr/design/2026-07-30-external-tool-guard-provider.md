# Provider de garde d'outil externe pour ACP managé

Statut : design d'implémentation
Issue de suivi : https://github.com/QwenLM/qwen-code/issues/8102
Dépend de : https://github.com/QwenLM/qwen-code/pull/8032

## Problème et périmètre

Qwen Code prend déjà en charge les règles de permission et les hooks, mais ces
mécanismes ne donnent pas à un déploiement managé de `qwen serve` une décision
obligatoire, externe et vérifiable par machine immédiatement avant chaque
exécuteur d'outil. La PR #8032 ajoute ce callback de frontière d'exécuteur. Ce
changement relie le callback à un petit provider externe pour les déploiements
ACP managés.

Le périmètre est intentionnellement une seule décision :

> Étant donné l'identité de session et de prompt possédée par le runtime, le
> label de corrélation d'appel d'outil accepté par le runtime, le nom d'outil
> canonique et les arguments finaux, cette invocation peut-elle s'exécuter
> maintenant ?

Ce changement n'ajoute pas de protocole de tâche, de callback de résultat, de
service d'observateur/relecture, de remplacement général des hooks, ni de
couche d'autorisation pour les APIs explicites de contrôle/gestion du démon.
Il ne rend pas non plus déterministe l'implémentation d'un outil autorisé et
ne sandboxe pas le comportement d'une commande que le provider a choisi
d'autoriser.

## Contrat de sécurité

- L'activation se fait uniquement au démarrage du processus : `off` (défaut)
  ou `required`.
- En mode `off`, aucun provider n'est construit, aucun RPC de provider n'est
  effectué et aucune capacité n'est annoncée. Aucune des nouvelles entrées
  n'étant présente, le comportement du CLI autonome / ACP ordinaire est
  inchangé. La variable d'environnement de token réservée est quand même
  purgée des environnements d'exécution descendants si elle est définie.
- En mode `required`, le démarrage du démon effectue un handshake authentifié
  et versionné. Une configuration manquante ou invalide et un provider
  indisponible ou incompatible font échouer le démarrage du démon.
- Chaque invocation de premier niveau prise en charge qui passe les gates de
  permission et de `PreToolUse` existantes et atteint la frontière d'exécution
  finale effectue exactement une requête `prepare` bornée. Un refus de
  permission/hook antérieur n'effectue aucune requête de provider. Il n'y a
  pas de retry. Timeout, annulation, échec de transport, réponse malformée,
  incompatibilité d'identité ou refus explicite empêchent l'exécuteur de
  s'exécuter.
- L'ordre hérité de la PR #8032 est la gestion des permissions, les hooks
  `PreToolUse`, puis cette Garde, puis l'exécuteur cible. La Garde n'autorise
  que l'exécuteur d'outil cible ; elle n'autorise ni ne sandboxe le
  comportement des hooks. Les déploiements managés qui exigent une frontière
  sur tous les effets doivent désactiver les hooks ou les gouverner
  indépendamment en leur faisant confiance.
- Les actions de slash command sont résolues avant l'ordonnancement du
  modèle/des outils et ne sont pas des invocations de Tool Guard. Certaines
  commandes intégrées peuvent modifier directement des fichiers ou des
  réglages. À l'exception des entrées d'agent imbriqué explicitement rejetées
  ci-dessous, ce changement ne classifie pas les slash commands ; les hôtes
  managés doivent rejeter l'entrée par slash command ou désactiver les
  commandes non approuvées avec `slashCommands.disabled` /
  `--disabled-slash-commands`.
- Les identifiants du provider restent dans le processus `qwen serve`. Ils ne
  sont jamais copiés dans l'environnement de l'enfant ACP, du worker de canal,
  du sous-processus d'outil, du serveur MCP, du hook ou du sous-agent. Le CLI
  capture et supprime le token ambiant avant que les snapshots
  d'environnement du runtime soient figés.
- La requête de garde enfant-vers-parent utilise le canal ACP privé existant.
  Le bridge ne l'accepte que pour une session possédée par ce canal et
  uniquement quand son ID de prompt est égal à l'ID de prompt actif du bridge.
- Chaque canal ACP doit acquitter `required-v1` dans sa réponse initialize,
  prouvant que l'enfant a consommé le marqueur privé et installé le callback
  d'exécuteur. Un acquittement manquant ou incompatible rejette le canal avant
  que toute Session puisse être créée.
- L'ACP managé ne démarre pas le runtime interactif de
  spéculation-de-suggestions. Si un embedding atteint indépendamment le chemin
  de spéculation de la PR #8032, le même callback reste requis avant l'apply.
- V1 ne prend en charge que les invocations d'outil de premier niveau
  effectuées pendant un Prompt managé actif au premier plan. `agent`,
  `workflow`, `create_sub_session`, `send_message`, le point d'entrée direct
  `/fork` et les contrôles remember/dream de mémoire de workspace adossés à un
  agent sont rejetés avant qu'ils puissent démarrer, reprendre ou déléguer à
  un AgentCore/Session indépendant. Les tours automatiques/cron et les agents
  en arrière-plan restaurés ne portent aucun contexte de Prompt managé actif,
  de sorte que leurs outils gardés échouent en mode fermé.
- Une invocation shell de premier niveau avec `is_background=true`, ou une
  invocation `monitor`, reste une invocation gardée unique : le provider voit
  ses arguments finaux et peut la refuser. La Garde n'autorise pas en
  continu le processus lancé et n'ajoute pas de nouveau protocole d'audit de
  complétion de processus. Les politiques managées qui exigent une complétion
  au premier plan doivent refuser ces formes d'arguments/d'outil.
- Une erreur de transport MCP gardée est traitée comme un résultat ambigu et
  n'est pas reconnectée/rejouée automatiquement. L'autorisation précédente ne
  peut pas autoriser une seconde tentative d'exécution.
- Les événements existants de cycle de vie d'outil `session/update` d'ACP
  restent la source d'observation de l'exécution. La requête de provider et
  ces événements se corrèlent par `sessionId`, `promptId` et `toolCallId`.

La force de l'identité est délibérément explicite :

- `sessionId` est généré et possédé par le démon/la Session ACP ;
- `promptId` est généré par le démon et réattaché après que les métadonnées de
  l'appelant sont retirées ;
- `toolCallId` est un label de corrélation accepté par le runtime. Il peut
  provenir de l'appel d'outil du modèle, donc ce n'est ni un sujet
  d'authentification ni une clé d'idempotence autonome ;
- `requestId` est généré par `qwen serve` pour l'unique RPC de provider. C'est
  l'identifiant d'opération de décision du provider, mais les événements de
  cycle de vie existants se corrèlent avec le tuple complet
  `(sessionId, promptId, toolCallId)`.

## Configuration

```bash
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Règles :

- `--external-tool-guard-mode` accepte `off|required` et vaut `off` par
  défaut.
- `required` exige un endpoint HTTP(S) loopback limité à l'origine et un
  token non vide d'au plus 8192 unités de code UTF-16 sans caractères de
  contrôle depuis `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN`.
- L'userinfo, la query, le fragment et les chemins non racine de l'endpoint
  sont rejetés.
- `localhost` est épinglé par le client à `127.0.0.1` (avec un SNI
  `localhost` pour HTTPS) ; il n'est jamais résolu via le DNS ambiant ou la
  configuration de proxy.
- Le timeout est un entier de 100 à 30000 ms. La valeur par défaut est
  3000 ms.
- Un endpoint et un token sans `mode=required` n'activent pas de provider. Le
  token réservé est quand même consommé et purgé plutôt qu'exposé aux outils.

## Flux de données runtime

```mermaid
sequenceDiagram
    participant Host as "DataAgent / opérateur"
    participant Serve as "qwen serve"
    participant Guard as "Garde externe"
    participant ACP as "qwen --acp privé"
    participant Exec as "Exécuteur d'outil"

    Host->>Serve: "démarrer avec mode=required"
    Serve->>Guard: "POST /v1/handshake (Bearer token)"
    Guard-->>Serve: "version + nonce + capacité prepare"
    Serve->>ACP: "spawn ; capacité ACP privée + marqueur required"
    ACP-->>Serve: "acquittement initialize : required-v1"
    Host->>Serve: "prompt"
    Serve->>ACP: "prompt + sessionId/promptId possédés par le runtime"
    ACP->>ACP: "gates permission + PreToolUse"
    ACP->>Serve: "extMethod privée prepare(sessionId,promptId,toolCallId,name,args)"
    Serve->>Serve: "vérifier la session possédée + le prompt actif"
    Serve->>Guard: "POST /v1/prepare (exactement une fois)"
    Guard-->>Serve: "allow ou deny"
    Serve-->>ACP: "décision"
    alt "allow"
        ACP->>Exec: "exécuter l'invocation finale"
        ACP-->>Serve: "événement terminal tool_call_update existant"
    else "deny / unknown / timeout / cancel"
        ACP-->>Serve: "événement terminal EXECUTION_DENIED/cancelled existant"
    end
```

## Contrat de wire

Tous les corps utilisent du JSON UTF-8 et `Content-Type: application/json`.
Les requêtes utilisent `Authorization: Bearer <token>`. Les redirections ne
sont pas suivies. Les corps de réponse sont bornés avant le parsing JSON. Une
requête sérialisée ne peut pas dépasser 1 MiB, une réponse ne peut pas
dépasser 64 KiB, et une raison de refus ne peut pas dépasser 500 unités de
code UTF-16 ni contenir de caractères de contrôle.

Les arguments d'outil finaux sont des données applicatives et peuvent contenir
du code source, des chemins, des requêtes ou des identifiants fournis à un
outil. Le provider doit les traiter comme sensibles et ne doit pas les
persister sans discernement sous prétexte que le transport est loopback.

Requête de handshake :

```json
{
  "protocolVersion": 1,
  "nonce": "runtime-random-value",
  "client": "qwen-code"
}
```

Réponse de handshake :

```json
{
  "protocolVersion": 1,
  "nonce": "same-runtime-random-value",
  "capabilities": { "prepare": true }
}
```

Requête de préparation :

```json
{
  "protocolVersion": 1,
  "requestId": "runtime-random-value",
  "sessionId": "runtime-owned-session-id",
  "promptId": "runtime-owned-prompt-id",
  "toolCallId": "runtime-accepted-tool-call-correlation-id",
  "toolName": "canonical_tool_name",
  "arguments": { "final": "tool arguments" }
}
```

Réponse d'autorisation :

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": true
}
```

Réponse de refus :

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": false,
  "reason": "Safe user-visible policy reason"
}
```

Les champs inconnus, les versions/nonces/ID de requête erronés, les booléens
invalides, les corps surdimensionnés et les raisons de refus non sûres sont
des échecs de protocole et donc des refus.

## Carte d'implémentation source

| Préoccupation                                                                     | Point d'implémentation                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Flags CLI, capture du token et purge du bootstrap non-serve                 | `packages/cli/src/commands/serve.ts`, `packages/cli/src/cli.ts`                     |
| Options embarquées publiques                                                     | `packages/cli/src/serve/types.ts`                                                   |
| Validation de la config, client HTTP loopback, handshake, parsing des réponses        | `packages/cli/src/serve/external-tool-guard-provider.ts`                            |
| Construction du provider, handshake de démarrage, câblage des capacités et du bridge         | `packages/cli/src/serve/run-qwen-serve.ts`                                          |
| Ext-method privée partagée et types de gestionnaire                                 | `packages/acp-bridge/src/status.ts`, `bridgeOptions.ts`                             |
| Validation session-possédée / prompt-actif                                    | `packages/acp-bridge/src/bridgeClient.ts`                                           |
| Injection dans le bridge                                                            | `packages/acp-bridge/src/bridge.ts`                                                 |
| Capture du marqueur privé requis, purge du token et préservation du relaunch | `packages/cli/src/gemini.tsx`                                                       |
| Injection de Config par session et callback enfant                             | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/cli/src/config/config.ts` |
| Acquittement enfant requis et admission côté parent                    | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/acp-bridge/src/bridge.ts` |
| Contexte runtime à la frontière de l'exécuteur                                        | `packages/core/src/core/tool-invocation-guard.ts` et les trois points d'appel de la PR #8032 |
| Annonce conditionnelle de la fonctionnalité                                           | `packages/cli/src/serve/capabilities.ts`                                            |

## Compatibilité et comportement en cas d'échec

| Déploiement                                             | Comportement attendu                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `qwen` interactif/headless                            | Comportement d'exécution existant inchangé quand les nouvelles entrées sont absentes |
| `qwen --acp` lancé par un IDE                        | Pas de provider ; marqueur privé absent                               |
| `qwen serve` sans nouveaux flags                         | Pas de provider, pas de capacité, comportement actuel de préchauffage/retry       |
| `qwen serve`, endpoint/token présents, mode omis/off | Pas de provider/capacité ; le token réservé est purgé des enfants |
| `qwen serve`, required, provider valide                 | Capacité annoncée ; chaque outil de premier niveau pris en charge est gardé |
| `qwen serve`, required, config/handshake invalide       | Le listener ne démarre pas                                          |
| Required, l'enfant n'acquitte pas la Garde installée   | Le canal ACP est rejeté avant la création de la Session                  |
| Provider required échoue pendant un tour                  | L'invocation devient refusée ; le compteur d'exécuteurs reste à zéro           |
| Required, entrée AgentCore imbriquée/cachée non prise en charge    | Rejetée localement avant que l'exécution imbriquée ne démarre                  |
| Required, la réponse MCP est perdue/la connexion se ferme       | La première tentative échoue ; pas de reconnexion ni de rejeu automatiques            |

La capacité est `external_tool_guard` et n'est annoncée que quand le mode
required a terminé son handshake de démarrage.

## Plan de vérification

Les tests unitaires et de contrat doivent prouver :

1. la validation stricte de l'endpoint/config ;
2. le handshake authentifié, la validation de nonce/version/schéma et les
   limites de corps ;
3. l'autorisation, le refus explicite, le timeout, l'abandon, l'échec de
   connexion et la réponse malformée, sans retry ;
4. BridgeClient rejette une session inconnue et une identité de prompt
   obsolète avant d'appeler le provider ;
5. le défaut off ne crée aucun provider et n'annonce aucune capacité ;
6. le token n'entre jamais dans l'environnement effectif de l'enfant ACP ;
7. le marqueur required survit au chemin de relaunch existant mais est
   supprimé avant que les outils puissent hériter de l'environnement du
   processus ACP ;
8. le mode required injecte le callback dans la Config de chaque session ACP
   live ;
9. chaque canal ACP required doit acquitter le callback installé avant la
   création de la Session ;
10. l'ACP managé ne démarre pas la spéculation de suggestions, et un chemin de
    spéculation invoqué séparément exige toujours le callback avant l'apply ;
11. `agent`, `workflow`, `create_sub_session`, `send_message`, `/fork` direct
    imbriqués/déléguants et les contrôles de mémoire de workspace adossés à un
    agent sont rejetés, tandis que les tours automatiques/arrière-plan sans le
    contexte de Prompt actif échouent en mode fermé ;
12. une erreur de connexion MCP gardée effectue un seul appel sans
    reconnexion/rejeu ;
13. un cas de bout en bout d'ACP managé fait correspondre le
    `sessionId/promptId/toolCallId` du provider aux événements de
    démarrage/terminal existants et prouve que le compteur d'exécuteurs est un
    pour allow et zéro pour deny/échec.

Exécuter les tests ciblés des packages, le build/typecheck/lint du dépôt et la
suite E2E du démon. Le rapport de PR enregistre les commandes et les résultats
exacts.

## Non-objectifs et suites

- Transport par socket de domaine Unix ; v1 utilise un endpoint HTTP(S)
  loopback limité à l'origine.
- Rejeu de décision côté provider ou re-soumission idempotente ; Qwen Code
  n'envoie aucun retry.
- Lignée d'exécution imbriquée/déléguée (`agent`, `workflow`,
  `create_sub_session`, `send_message`, `/fork`), contrôles de mémoire de
  workspace adossés à un agent, et un futur protocole de Garde conscient des
  tentatives. V1 rejette ces points d'entrée d'agent imbriqués/cachés plutôt
  que de revendiquer une corrélation non prise en charge.
- Rapport de résultats ou stockage d'audit dans Qwen Code. Le provider et
  DataAgent possèdent leurs enregistrements d'audit ; Qwen Code fournit des
  clés de corrélation stables et les événements de cycle de vie existants.
- Autorisation continue ou nouveau contrat de résultat terminal pour un
  processus shell/monitor en arrière-plan après son démarrage gardé. Les
  providers peuvent rejeter ces invocations à partir de leur nom d'outil final
  et de leurs arguments.
- API Task métier, approbation de plan, octrois ou politique spécifique à
  DataAgent.
- Autorisation ou sandboxing des implémentations de hooks. `PreToolUse`
  s'exécute avant cette Garde d'exécuteur selon le contrat de la PR #8032.
- Autorisation des actions de slash command. Elles s'exécutent avant
  l'ordonnanceur d'outils ; les hôtes managés qui ont besoin d'une frontière
  sur tous les effets doivent rejeter l'entrée par slash command ou maintenir
  une liste de refus de déploiement stricte en dehors de cette fonctionnalité.
- Inspection sémantique ou sandboxing d'une implémentation d'outil ou d'une
  commande shell autorisée. Le provider décide sur le nom canonique et les
  arguments finaux ; un déploiement managé doit combiner cette décision avec
  sa politique d'outils et sa frontière d'isolation existantes.
- Autorisation des opérations explicites de contrôle REST/ACP du démon ;
  celles-ci restent régies par l'authentification et les contrats d'API
  existants du démon.
