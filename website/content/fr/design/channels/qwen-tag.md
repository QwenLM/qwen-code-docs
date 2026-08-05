# RFC : "qwen tag" — un agent persistant, multijoueur et résident de canal pour qwen-code (DingTalk en priorité)

> **Registre de décisions historique.** La prémisse de ce brouillon d'un processus par
> workspace / d'un démon par workspace est remplacée. Les canaux nommés gérés par
> le démon sont désormais regroupés par workspace propriétaire avec un worker par
> runtime propriétaire ; `--channel all` reste limité au primaire. Le token global
> unique et l'absence d'identité par humain demeurent des limitations actuelles.
> Voir [`../daemon-multi-workspace-hardening.md`](../daemon-multi-workspace-hardening.md).

**Statut :** Brouillon historique (v2)
**Date :** 2026-06-25
**Auteur :** (qwen-code)

---

## Journal des modifications (v1 → v2)

Cette révision clôture toutes les décisions ouvertes de la v1 (désormais **Décisions résolues**, §9) et corrige sept défauts de justification/cohérence soulevés lors de la revue. Les deux changements structurels majeurs :

- **OD-1 n'est plus une condition bloquante — c'est une architecture actée.** La phase 0 est livrée sur le chemin actuel de `AcpBridge` ; **la phase 1+ migre l'hébergement des canaux dans le démon `qwen serve`** (via `DaemonChannelBridge` / un exécuteur de canal du démon) pour réutiliser la `promptQueue` FIFO par session, le `MultiClientPermissionMediator`, l'`eventBus`, `/workspace/memory` et le rate-limit. Chaque section qui indiquait précédemment "OD-1 ouverte / bloque tout" est désormais considérée comme décidée, et l'engagement envers le démon est propagé dans les §1, §4, §5, §6.1, §6.2, §6.3, §6.4 et §7.
- **Le chemin de déclenchement proactif est repensé pour le chemin du démon sur lequel il s'exécutera réellement.** Le `dispatchProactive` de la v1 a été écrit pour la sémantique de `AcpBridge` (`sessionQueues` côté canal). Avec la migration vers le démon, `DaemonChannelBridge.prompt()` **lève une exception `Prompt already in flight`** en cas de chevauchement (`DaemonChannelBridge.ts:257-261`) au lieu de mettre en file d'attente. La v2 sérialise les prompts proactifs via `ChannelBase.sessionQueues` pour **les deux** variantes, afin que la garde de levée d'exception ne soit jamais déclenchée, et énonce explicitement l'invariant d'annulation impossible (§6.2).

Résolutions et correctifs intégrés :

- **OD-2** décidée : un processus par workspace/canal.
- **OD-3** décidée : `first-responder` en phase 1 + un seul `clientId` au niveau du canal ; `consensus`/`designated` en phase 2 après l'existence d'un registre `senderId→clientId` + cycle de vie ; refus automatique des outils à haut risque lors des tours proactifs.
- **OD-4** décidée : dans un groupe partagé (thread), `/clear` nécessite un `confirm` explicite et est restreint à `config.allowedUsers` lorsque cette liste est définie ; `/status` en lecture seule. (Un `/clear-channel` avec un tiret n'est pas analysable par la grammaire des slash commands ; une véritable porte de propriétaire par membre attend le modèle d'identité — OD-3/OD-11.)
- **OD-5** décidée : correction du JSDoc obsolète `types.ts:42` vers `'steer'` ; le profil du groupe de tags définit explicitement `dispatchMode: 'followup'`.
- **OD-6** décidée : préfixe `[senderName]` par tour, **non** conditionné par `instructedSessions` ; **un nouveau champ optionnel `alreadyPrefixed` dans `Envelope`** pour que la réentrée synthétique en mode `collect` ignore le re-préfixage. (Corrige l'affirmation de la v1 "pas de nouveau champ envelope" — Correctif #2.)
- **OD-7** résolue en utilisant des faits vérifiés sur l'API DingTalk (§6.2/§6.5), les éléments à faible confiance sont toujours signalés.
- **OD-8** décidée : le planificateur de la passerelle/du démon est le **seul** propriétaire des crons ; une session de tag ne démarre **pas** son cron `Session` en session ; les deux stores de cron vivent sur des chemins disjoints, donc une collision n'est possible que si les deux planificateurs s'exécutent pour les mêmes tâches.
- **OD-9** décidée : agrégation "org" par processus + fenêtres par canal, la plus stricte l'emporte, fenêtre quotidienne fixe ; la v1 estime les tokens côté canal et lit le chemin d'utilisation du démon une fois hébergé par le démon.
- **OD-10** décidée : ajout d'un scope `channel` (+`channelKey`) à `writeContextFile.ts` ; channel-base obtient l'écriture/lecture via un **callback de couche CLI injecté via `ChannelBaseOptions`** (pas de dépendance `channel-base → core`) ; emplacement global utilisateur `~/.qwen/channels/memory/`.
- **OD-11** décidée : `senderName` uniquement à titre indicatif ; `clientId` est le seul principal de sécurité ; anneau d'audit en mémoire + un fichier de suivi `~/.qwen` en ajout uniquement.
- **OD-12** décidée : exigence de `--require-auth` + token pour tout déploiement supporté par un démon non-loopback.

Correctifs de justification au-delà des résolutions OD :

- **Correctif #1 — concurrence du chemin de déclenchement proactif** repensée pour le chemin du démon (§6.2), avec l'invariant d'annulation impossible appliqué à la fois à la variante `AcpBridge` de la phase 0 et à la variante démon de la phase 1+.
- **Correctif #2 — contradiction interne** supprimée : le §6.1/G2 n'affirme plus "pas de nouveau champ envelope" ; il reconnaît l'unique champ `alreadyPrefixed`.
- **Correctif #3 — câblage de la mémoire conçu** (§6.3) : la modification exacte de `ChannelBaseOptions` (callbacks `readChannelMemory`/`writeChannelMemory`) et qui les construit/injecte dans `start.ts`, avec la lecture de bootstrap une fois par session réutilisant la condition `instructedSessions`.
- **Correctif #4 — flag de capacité `canColdSend` conçu** (§6.2) : où il est déclaré, comment DingTalk/Feishu le définissent, et comment le planificateur échoue bruyamment.
- **Correctif #5 — clarification des stores disjoints de l'OD-8** (§6.2) : le store de la passerelle et le store `Session` sont des chemins différents ; le seul risque de collision est qu'une session de tag exécute également un cron en session — fermé par la condition de l'OD-8.
- **Correctif #6 — application du budget estimé** (§6.4) : une estimation peut WARN/alert mais ne doit jamais rejeter fermement (hard-decline) un prompt utilisateur ; rejet ferme uniquement sur les chiffres d'utilisation réels du démon.
- **Correctif #7 — attribution de l'audit sous `followup`** (§6.4) : transporter le `senderId` _avec_ le prompt mis en file d'attente afin qu'un appel d'outil/permission soit attribué au tour en cours d'exécution, et non à l'expéditeur le plus récemment mis en file d'attente.

Les faits vérifiés de la v1 (topologie AcpBridge, auto-approbation AcpBridge, `sendMessage` abstrait, scopes, valeurs par défaut du parser) sont préservés sans modification.

---

## 1. Résumé

**"qwen tag"** est un agent qwen-code partagé qui vit à l'intérieur d'un canal de chat — un groupe DingTalk en priorité, Feishu en second — et que n'importe quel membre de ce canal invoque en le `@`-mentionnant. Une fois invoqué, il exécute la boucle complète de l'agent qwen-code (outils, modifications de fichiers, shell, MCP) sur un workspace lié, diffuse son travail dans le canal au fur et à mesure, **se souvient du canal à travers les tours et les redémarrages**, et peut agir **de manière proactive ou selon une planification** sans attendre qu'on le lui demande. Cela reflète le format de Claude Tag — un seul agent multijoueur persistant qui est _résident_ de la salle plutôt qu'un bot de DM 1:1 — mais il est entièrement construit sur la pile d'adaptateurs de canal existante de qwen-code (`qwen channel start`, `packages/channels/*`) et le démon `qwen serve`, et non sur un nouveau service hébergé.

Le cadrage délibéré de ce RFC est que **la moitié réactive du format est déjà largement livrée, et que la moitié proactive/mémoire ne l'est pas.** Les pièces qui rendent difficile un agent de _réponse_ de style Claude Tag — un processus de longue durée qui multiplexe les sessions, un transport d'agent qui préserve l'invariant d'un prompt par session, le routage de sessions multijoueur, le contrôle d'accès par canal, le rendu de cartes en streaming et la persistance durable des sessions — existent déjà et sont utilisées par les adaptateurs de canal actuels. Ce qui _manque_ est un ensemble de capacités bien délimitées qui transforment un bot de réponse réactif en un agent résident : l'attribution de l'expéditeur dans les sessions partagées, un chemin de sortie proactif/planifié, la mémoire par salle et la gouvernance multijoueur. Ce RFC cadre cette lacune en **quatre domaines de construction** et les spécifie à travers les phases 0 à 2.

> Note sur les "80%" : les brouillons précédents présentaient cela comme "~80% livrés". Ce chiffre est invérifiable et exagère la situation — le moteur proactif entier (Domaine de construction 2) et la mémoire par salle (Domaine de construction 3) sont entièrement nouveaux, et sur DingTalk spécifiquement, il n'y a _aucun_ chemin d'initiation sortante. Nous le présentons plutôt ainsi : "le chemin réactif est construit ; les chemins proactif et mémoire ne le sont pas."

### Un fait topologique qui contraint l'ensemble du RFC

Il existe **deux manières distinctes de connecter un adaptateur de canal à un agent qwen**, dans **deux processus différents**, et les confondre est l'erreur la plus courante dans les brouillons précédents :

- **`qwen channel start <name>` (le chemin de livraison).** `start.ts` construit **`new AcpBridge(bridgeOpts)`** (`start.ts:213,268,356,435`), et `AcpBridge.start()` **lance un processus enfant** `node <cliEntryPath> --acp` (`AcpBridge.ts:53-70`), communiquant en ACP via NDJSON sur **stdio**. Cet enfant est un _agent autonome_, pas le démon HTTP `qwen serve`. Dans cette topologie, il n'y a **pas de démon HTTP, pas de route `/workspace/memory`, pas de `MultiClientPermissionMediator`, pas d'anneau de relecture `eventBus`, et pas de `promptQueue` du démon** — tout cela vit dans `packages/acp-bridge` + `packages/cli/src/serve`, que `qwen channel start` n'instancie jamais. La sérialisation des prompts se fait ici entièrement **côté canal** par `ChannelBase` (mutex `activePrompts` à `ChannelBase.ts:356-391` + chaîne `sessionQueues` à `:394-470`) et par l'invariant propre à l'enfant d'un prompt par session en ACP. `AcpBridge.requestPermission` **auto-approuve chaque appel d'outil** (`AcpBridge.ts:108-118`).
- **`qwen serve` + `DaemonChannelBridge` (hébergé par le démon).** `DaemonChannelBridge` (`packages/channels/base/src/DaemonChannelBridge.ts`) est un bridge in-process dont la `sessionFactory` produit des objets `Session` du démon. Ce chemin exécute les canaux à l'intérieur du démon et hérite ainsi de la `promptQueue` FIFO d'`acp-bridge` (`bridge.ts:232,2855,3082`), du `MultiClientPermissionMediator`, de l'`eventBus` et des routes HTTP. **`qwen channel start` ne l'instancie pas aujourd'hui** (zéro référence dans `start.ts`). Un point sensible qui façonne la conception proactive : `DaemonChannelBridge.prompt()` **ne met pas en file d'attente — il lève une exception `Prompt already in flight`** en cas de chevauchement (`DaemonChannelBridge.ts:257-261`) ; la `promptQueue` FIFO qu'il atteint finalement se trouve côté démon/acp-bridge, _derrière_ cette garde de levée d'exception in-process. Le moteur proactif doit donc sérialiser au niveau de la couche canal (§6.2).

**Architecture actée (anciennement OD-1, désormais décidée) :** la mécanique du démon multi-client est réutilisée en **migrant l'hébergement des canaux dans le démon `qwen serve`** à partir de la phase 1.

- La **phase 0** est livrée sur le chemin actuel de `AcpBridge` (l'injection d'identité n'a besoin ni des routes HTTP ni du médiateur).
- La **phase 1+** exécute les canaux sous le démon `qwen serve` (via `DaemonChannelBridge` ou un exécuteur de canal du démon), car le moteur proactif, la persistance de la mémoire par salle et la gouvernance ont tous besoin de la durabilité, des routes, de la `promptQueue`, du médiateur et de l'event bus du démon.

Ce n'est plus "ouvert" ou "bloquant" : le câblage de la phase 0 ajoute le chemin d'attachement `DaemonChannelBridge` (ou un flag `--daemon <url>`) afin que la migration soit disponible dès le début de la phase 1. Le planificateur détenu par la passerelle (§6.2) est conçu pour être **neutre à la migration** afin qu'il s'exécute de manière identique avant et après la bascule.

### Ce qu'est "qwen tag" concrètement

Un déploiement "qwen tag" est un processus d'agent unique lié à un workspace, plus un adaptateur `qwen channel start dingtalk`, configuré de sorte qu'un groupe entier partage **une** session d'agent. Deux **concepts de scope distincts** doivent s'aligner :

1. **Scope de routage de canal** (`ChannelConfig.sessionScope`, consommé par `SessionRouter.routingKey()`) : décide comment les messages entrants sont mappés à une clé de routage. Pour un tag, cela doit être `'thread'` afin que tout le groupe partage une seule clé de routage (`channel:(threadId||chatId)`, `SessionRouter.ts:53`). **La valeur par défaut du parser est `'user'`, pas `'thread'`** (`config-utils.ts:91-92`), la recette du tag doit donc le définir explicitement.
2. **Scope de session Bridge/ACP** (`sessionScope` de `DaemonChannelBridge` / `acp-bridge`) : décide comment le démon partage une session ACP sous-jacente. `DaemonChannelBridge.newSession()` définit cela par défaut à `'thread'` (`DaemonChannelBridge.ts:229,240`) ; le chemin in-process d'`acp-bridge` a pour valeur par défaut `'single'` (`bridge.ts:709`). C'est un **paramètre distinct** du scope de routage de canal, et il n'est _pas_ sur le chemin de `qwen channel start` (`AcpBridge.newSession(cwd)` ne prend que `cwd`, `AcpBridge.ts:131`).

Une fois ceux-ci en place :

- **Un agent par salle, invoqué par mention.** `GroupGate` applique `requireMention` (par défaut `true`, `GroupGate.ts:49`), l'agent reste donc silencieux jusqu'à ce qu'il soit `@`-mentionné ou qu'il s'agisse d'une réponse au bot (`GroupGate.ts:51`). La clé multijoueur est `sessionScope: 'thread'`, mappée à `channel:(threadId||chatId)` (`SessionRouter.ts:50-53`), de sorte que chaque membre réutilise le même `sessionId` quel que soit l'expéditeur.
- **Véritable travail multi-étapes avec des outils.** Les messages entrants deviennent des prompts via `ChannelBase.handleInbound()`, qui construit `promptText` à partir du texte du message, du contexte de citation de réponse, des chemins de fichiers joints et (une fois par session) de `config.instructions` (`ChannelBase.ts:316-347`), puis distribue via `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` (`ChannelBase.ts:425` — `promptText` est un argument positionnel ; l'objet options ne porte que les champs d'image).
- **Diffuse son travail dans la salle.** Les adaptateurs rendent la sortie incrémentale sous forme de cartes natives de la plateforme (création/mise à jour/finalisation Feishu, `markdown.ts` ; découpage markdown DingTalk, `DingtalkAdapter.ts:144-169`).
- **Se souvient du canal.** `SessionRouter.persist()` / `restoreSessions()` stockent durablement `sessionId`, la cible et `cwd` et se réhydratent via `bridge.loadSession()` à travers les redémarrages (`SessionRouter.ts:168-244`) ; la mémoire du workspace (`QWEN.md` / `~/.qwen/QWEN.md`) est lue/écrite via `GET` / `POST /workspace/memory` (`workspace-memory.ts`). Cette mémoire a un scope workspace/global, pas par salle — voir le Domaine de construction 3.
- **Peut agir de manière proactive / selon une planification.** C'est la moitié qui n'existe _pas_ encore de bout en bout et qui est au cœur de la phase 1.
---

## 2. Motivation

L'infrastructure dont un agent _réponse_ multijoueur résident a normalement besoin est déjà en place dans ce dépôt. Le travail réellement manquant se répartit en quatre axes de développement.

| Capacité requise par le format Tag | Déjà présente (référence)                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processus long et multi-session | `AcpBridge` engendre un processus enfant `--acp` de longue durée (`AcpBridge.ts:53-70`) ; le chemin du démon ajoute une FIFO `promptQueue` par session (`bridge.ts:232,2855,3082`) |
| Routage multijoueur "une salle, une session" | Portée `'thread'` de `SessionRouter` (`SessionRouter.ts:53`), surcharge par canal `setChannelScope()` (`SessionRouter.ts:40`) |
| Sémantique d'invocation par mention | `requireMention` de `GroupGate` par défaut à `true` (`GroupGate.ts:49-52`) |
| Contrôle d'accès + intégration (onboarding) | Allowlist de `SenderGate` + flux de code d'appairage ; les portes sont appliquées groupe puis expéditeur (`ChannelBase.ts:240-252`) |
| Mapping de session durable entre les redémarrages | Persistance de `SessionRouter` (`SessionRouter.ts:168-244`) |
| Lecture/écriture de la mémoire de l'espace de travail | `GET` / `POST /workspace/memory` (`workspace-memory.ts`) ; portées workspace et global uniquement ; démon uniquement |
| Contrôle des permissions multi-acteurs + audit (démon uniquement) | Quatre politiques de `MultiClientPermissionMediator` incl. le quorum `consensus` (`permissionMediator.ts:621-637`) ; anneau d'audit de permissions séparé (`permission-audit.ts`) |
| Authentification, limitation de débit, sécurité de boucle locale (démon uniquement) | Bearer token global (`auth.ts:259-266`) + limitation de débit par paliers selon clientId/IP (`rate-limit.ts`) |
| Primitive de push en session (tâches en arrière-plan) | File de notifications de `Session` + `setNotificationCallback()` alimente les tâches en arrière-plan/moniteur/shell dans la session ouverte (`Session.ts:688-689,2638-2668`) ; `isIdle()` en tient compte (`Session.ts:777`) |
| Diffusion sur la plateforme (DingTalk + Feishu) | Adaptateurs fonctionnels avec cartes en streaming, médias, réactions (`DingtalkAdapter.ts`, `FeishuAdapter.ts`) |

Étant donné que la phase 1+ s'exécute sous le démon (architecture actée, §1), les lignes ci-dessus spécifiques au démon deviennent des capacités disponibles pour le moteur proactif, la persistance de la mémoire et la gouvernance — et non plus de simples "objectifs si nous migrons".

Les quatre axes de développement, détaillés dans la §6 :

1. **Configuration + identité pour _déclarer_ un tag (Phase 0).** Une recette de configuration documentée — `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` — ainsi que le **manque d'attribution de l'expéditeur** : `handleInbound()` n'injecte délibérément **pas** `senderName` dans `promptText` (`ChannelBase.ts:316-347` ; `senderName` est utilisé uniquement pour le contrôle d'accès dans `ChannelBase.ts:246`). Dans une session `'thread'` partagée, l'agent ne peut pas savoir _qui_ parle. La Phase 0 injecte un marqueur d'expéditeur, de la même manière que le contexte de citation de réponse l'est déjà (`ChannelBase.ts:318`).
2. **Un moteur proactif / d'initiation sortante (Phase 1).** Aujourd'hui, il n'y a **aucun chemin proactif à la limite du canal** : `ChannelBase.sendMessage()` est abstrait (`ChannelBase.ts:81`) et n'est invoqué que depuis une réponse. Sur DingTalk, `sendMessage()` ne peut répondre que via un `sessionWebhook` de courte durée mis en cache par `conversationId` à la réception (`DingtalkAdapter.ts:134-142`), de sorte qu'un **groupe froid ne peut pas être contacté du tout** (`DingtalkAdapter.ts:137-141` retourne silencieusement). La Phase 1 ajoute un planificateur résidant dans le démon et un chemin d'envoi proactif pour DingTalk.
3. **Mémoire résidente par canal + récupération (Phase 2, partie mémoire).** La mémoire de l'espace de travail est **globale à l'espace de travail, et non par salle** : `POST /workspace/memory` n'accepte que `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`) et c'est une **route de mutation à authentification stricte** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). Un tag qui "se souvient de _ce_ canal" a besoin d'un espace de noms de mémoire par salle.
4. **Gouvernance + sécurité multijoueur (Phase 2, partie gouvernance).** Politique de permissions adaptée aux groupes, garde-fous pour les actions proactives et audit forensique, en s'appuyant sur la mécanique existante au niveau `clientId` (et non au niveau de l'identité humaine).

---

## 3. Objectifs et Non-Objectifs

### Objectifs

- **G1 — Documenter et livrer la configuration "tag"** sur DingTalk : une recette `channels.dingtalk` copier-coller (avec `sessionScope: 'thread'` explicite, `groupPolicy: 'allowlist'` avec l'ID du groupe listé, `requireMention: true`, `instructions`, et un `dispatchMode` choisi délibérément) produisant un agent multijoueur résident fonctionnel, en réutilisant `parseChannelConfig()` et les portes existantes. La recette doit souligner la distinction entre la portée de routage et la portée ACP, et le fait que la valeur par défaut `'user'` du parseur doit être surchargée.
- **G2 — Attribution de l'expéditeur dans les sessions partagées.** Injecter un marqueur d'expéditeur par message dans `promptText` afin que l'agent puisse distinguer les intervenants dans un groupe à portée `'thread'`, sans casser l'injection de `instructions` une fois par session suivie par `instructedSessions` (`ChannelBase.ts:344-346`). Le marqueur est **par message** (l'intervenant change à chaque tour) et ne doit PAS être conditionné par `instructedSessions`. Cela nécessite **un nouveau champ optionnel `Envelope`, `alreadyPrefixed`** (`types.ts`), afin que la réentrée synthétique en mode `collect` ne double-préfixe pas — voir §6.1. (La v1 décrivait à tort cela comme "format uniquement, pas de nouveau champ".)
- **G3 — Un moteur proactif.** Un mécanisme pour (a) initier une sortie vers un canal qui n'a pas envoyé de message récemment, et (b) se déclencher selon une planification indépendante de toute session interactive ouverte, en livrant via le chemin de notification par session existant lorsque c'est possible — y compris l'API d'envoi proactif de DingTalk et un stockage persisté de `openConversationId`, avec un propriétaire défini pour le rafraîchissement du token. Doit respecter l'invariant ACP d'un prompt par session (NG6) en sérialisant via `ChannelBase.sessionQueues` (ne jamais annuler un tour humain avec `steer`), sous les deux topologies.
- **G4 — Mémoire résidente par canal.** Un espace de noms de mémoire par salle et un chemin de récupération superposés à la mécanique existante de `/workspace/memory` et au mécanisme `instructions`. La conception ajoute une nouvelle portée `channel` (+`channelKey`) à `writeContextFile.ts` et y accède depuis `channel-base` via un **callback de couche CLI injecté via `ChannelBaseOptions`** (pas de dépendance `channel-base → core`).
- **G5 — Gouvernance multijoueur.** Politique de permissions adaptée aux groupes, garde-fous pour les actions proactives et audit, en s'appuyant sur `MultiClientPermissionMediator` et l'anneau d'audit des permissions. Doit tenir compte du fait que les votes sont attribués au `clientId`, et non à l'identité humaine, et que dans une seule session `'thread'` partagée, chaque membre du groupe est le _même_ client démon.
- **G6 — Parité Feishu** pour tout ce qui concerne G1–G5, traité comme un suivi. Le `tenant_access_token` stable de Feishu prend déjà en charge les envois proactifs vers n'importe quel chat avec juste un `chatId` (`FeishuAdapter.ts:622-651`), donc Feishu n'a besoin d'_aucune_ nouvelle API d'envoi pour G3 — seulement le mécanisme de réveil/planification au niveau du démon. Feishu déclare `canColdSend = true`.
- **G7 — Réutiliser plutôt que réinventer.** Chaque axe de développement étend un mécanisme existant (portes, routeur, bridge, médiateur, routes de mémoire, chemin de notification en session, cron) plutôt que d'introduire un sous-système parallèle.

### Non-Objectifs

- **NG1 — Pas de SaaS hébergé et multi-tenant.** Un démon peut héberger plusieurs runtimes de workspace isolés, mais il n'en a pas moins un token global au processus, un limiteur de débit, un listener et un rayon de faute uniques. Il n'y a pas de plan de contrôle central ni de frontière d'autorisation par humain.
- **NG2 — Pas d'identité par humain, de facturation ou de budgets de coûts dans cette RFC.** Le modèle d'identité du démon est un **bearer token global unique** (`auth.ts:259-266`) et une attribution au niveau `clientId` dans tout le bus d'événements et l'audit des permissions. Nous ajoutons des _marqueurs d'expéditeur dans les prompts_ (G2) mais n'introduisons **pas** de principaux authentifiés par utilisateur, de quotas par utilisateur ou de suivi des coûts. Les marqueurs d'expéditeur sont du texte de prompt à titre indicatif, pas une limite d'authentification — chaque membre du groupe partage les identifiants de l'unique espace de travail du démon, et dans une session `'thread'` partagée, il est le _même_ `clientId` de démon.
- **NG3 — La passerelle multi-identités de la Phase 3 est hors sujet** ici, mentionnée uniquement comme indication pour l'avenir. Cette RFC couvre les Phases 0 à 2.
- **NG4 — Feishu est secondaire, pas co-principal.** DingTalk est l'implémentation de référence et la source de tous les exemples détaillés.
- **NG5 — Slack et les autres plateformes occidentales sont hors sujet.** Les types de canaux enregistrés sont `telegram`, `weixin`, `dingtalk`, `feishu` et `qq` (`channel-registry.ts:10-14`) ; aucun adaptateur Slack n'existe.
- **NG6 — Ne pas modifier l'invariant ACP d'un prompt par session.** Un prompt planifié/proactif est simplement une autre entrée dans les `sessionQueues` du canal ; il ne peut pas s'exécuter en concurrence avec un tour utilisateur sur la même session, et ne peut pas en annuler un.
- **NG7 — Pas de nouveau moteur de stockage de mémoire à l'échelle du chat.** La mémoire résidente par canal (G4) superpose un _espace de noms_ aux fichiers `QWEN.md`/`AGENTS.md` existants basés sur des fichiers ; pas de base de données vectorielle ni de base de données par salle.

---

## 4. Évaluation de l'état actuel

Construit (B), partiel (P), manquant (M). "Fichier" cite le symbole de référence. "Topologie" indique si la capacité existe sur le chemin du canal `AcpBridge` (A), le chemin du démon `qwen serve` (D), ou les deux — et, étant donné que la Phase 1+ est actée pour s'exécuter sous le démon, une note "→D" indique là où la migration est ce qui débloque la capacité.

| Capacité | qwen-code aujourd'hui (fichier / symbole) | Topologie | Écart | Taille |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Routage une-salle-une-session | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`) | A+D | La portée par défaut est `'user'` (`config-utils.ts:91-92`) ; l'opérateur doit définir `'thread'` | Config (S) |
| Invocation par mention | `GroupGate.requireMention` par défaut à `true` (`GroupGate.ts:49-52`) | A+D | Aucun — déjà correct | — |
| Contrôle d'accès / intégration | Allowlist de `SenderGate` + appairage (`ChannelBase.ts:240-252`) | A+D | Aucun | — |
| Mapping de session durable | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`) | A+D | Aucun | — |
| **Attribution de l'expéditeur dans le prompt** | `handleInbound()` construit promptText sans `senderName` (`ChannelBase.ts:316-347`) | A+D | `senderName` jamais injecté ; l'agent ne peut pas savoir qui a parlé ; nécessite le nouveau `Envelope.alreadyPrefixed` | Code (S) |
| Sérialisation des prompts | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`) ; `promptQueue` du démon (`bridge.ts:2855`) | A (canal) / D (démon) | `DaemonChannelBridge.prompt()` LÈVE UNE ERREUR en cas de chevauchement (`:257-261`) — le moteur proactif doit sérialiser côté canal ; `dispatchMode` par défaut `'steer'` annule les pairs (`:354,371-379`) | Config + Code (S) |
| **Initiation sortante / envoi proactif** | `ChannelBase.sendMessage()` abstrait (`:81`) ; webhook uniquement pour DingTalk (`DingtalkAdapter.ts:134-142`) | A+D | Pas de point d'extension proactif ; groupe froid DingTalk impossible à contacter ; nécessite le flag de capacité `canColdSend` | Code (L) |
| **Planificateur au niveau du démon** | Cron est à portée session (`Session.ts:667-668`), meurt sur `dispose()` (`:790-812`) | A+D (passerelle) → D (réutilisation audit/file) | Pas de point de terminaison de planificateur de démon dans `serve/` ou `channels/` ; le planificateur de la passerelle est le seul propriétaire (OD-8) | Code (L) |
| Primitive de push en session | `setNotificationCallback` (`Session.ts:2638-2668`) | A+D | Livre uniquement dans une session _active_ ; ne peut pas réveiller une session récupérée | (réutilisation) |
| **Mémoire par salle** | Portées `/workspace/memory` `workspace\|global` (`workspace-memory.ts:118-125`) | D uniquement | Pas de portée chat/canal ; nouvelle portée `channel` + callback de couche CLI (pas de dépendance core) | Code (M) |
| Vote de permissions multi-acteurs | 4 politiques de `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`) | D (hérité Phase 1+) | `AcpBridge` approuve automatiquement (`AcpBridge.ts:108-118`) ; les votes sont par `clientId`, un client par canal | Code (L) |
| Piste d'audit | FIFO 512 de `PermissionAuditRing` (`permission-audit.ts`) | D + anneau côté canal | Pas de `senderId` humain ; en mémoire, perdu au redémarrage ; suivi en ajout seul dans `~/.qwen` | Code (M) |
| **Budget token / coût** | aucun (la limitation de débit est uniquement basée sur le nombre de requêtes, `rate-limit.ts`) | registre côté canal + utilisation D | Pas de compteur de dépenses ; estimations v1 (indicatives), débit réel uniquement lorsqu'hébergé par le démon | Code (M) |
| Portée outil/MCP par canal | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`) ; filtre d'autorisation MCP (`:3327-3333`) | par `Config` | Pas de chemin d'argument de spawn du canal vers l'enfant `--acp` (AcpBridge) ; `Config` par démon une fois hébergé | Code (M) |
| Envoi proactif DingTalk | non implémenté (uniquement `robot/emotion`, `messageFiles/download`) | A+D | Nouveau point de terminaison + `openConversationId` persisté + rafraîchissement du token (contrat vérifié, §6.2) | Code (L) |
| Envoi proactif Feishu | `sendMessage()` via `tenant_access_token` (`FeishuAdapter.ts:622-676`) | A+D | Aucun — `canColdSend = true` | — |
Légende des tailles : S = configuration/petit code, M = un module + changement d'interface, L = changement multi-packages ou nouveau sous-système.

---

## 5. Architecture

`qwen tag` n'est **pas un nouveau runtime**. Il s'agit de quatre couches fines greffées sur la pile d'adaptateurs existante. La couche de base fournit déjà un agent capable de multiplayer, exécutant des outils, équipé de MCP et accessible via un canal de chat. Les quatre nouvelles couches comblent 1:1 les lacunes suivantes : (1) **qui parle** — l'identité de l'expéditeur n'atteint jamais le prompt ; (2) **agir sans prompt** — pas de chemin d'initiation sortant, le cron en session meurt avec la session ; (3) **se souvenir du canal** — la mémoire est globale au workspace ; (4) **gouverner un cerveau partagé** — l'authentification repose sur un token global unique, sans budget par canal.

Chaque couche ci-dessous indique la topologie qu'elle suppose (voir §1). Le **découpage acté** : Phase 0 sur `AcpBridge` ; Phase 1+ sur le daemon `qwen serve` via `DaemonChannelBridge`.

### Couche de base (existante) — topologie `qwen channel start` (Phase 0)

```
                              one host, one workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (stream client,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks map by     │ ◀────────────── │    policy/allowlist)             │ │
│  │  conversationId)     │   text/markdown │  2 SenderGate.check (pairing)    │ │
│  │  sendMessage()       │                 │  3 slash / "!" commands          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expires,       │  5 dispatchMode (steer default)  │ │
│        │  per inbound msg only)          └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (crash recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NOT the HTTP daemon)    │ │
│                                         │  spawns child `node <cli> --acp`   │ │
│                                         │  ClientSideConnection over stdio    │ │
│                                         │  requestPermission AUTO-APPROVES    │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ child agent process (`--acp`)           │
                                          │  one prompt-in-flight per ACP session   │
                                          │  in-session cron (Session.ts) — DISABLED│
                                          │  for tag sessions (OD-8); MCP, tools.   │
                                          │  NO promptQueue/eventBus/mediator       │
                                          └─────────────────────────────────────────┘
```

### Topologie hébergée par le daemon (Phase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              one host, one workspace, ONE daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (channels hosted IN the daemon)                  │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, serialization)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proactive group-send                       │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() THROWS on overlap (:257-261)  ││
│  │ (gateway-owned,    │ dispatchProa- │  → so all prompts MUST arrive serialized││
│  │  sole cron owner)  │ ctive via     │     via sessionQueues                   ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ in-process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend flips true once the proactive-send path ships (§6.2).
```

Invariants clés sur lesquels nous nous appuyons (vérifiés) :

- **Le scope du thread est la clé du multiplayer.** `routingKey()` retourne `${channelName}:${threadId || chatId}` sous `'thread'` (`SessionRouter.ts:53`) ; `resolve()` réutilise la clé (`:79-83`). Le scope par défaut est `'user'` (`:25`) ; `qwen channel start` définit le scope par canal via `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) dans le chemin multi-canal, ou via le constructeur `ChannelBase` depuis `config.sessionScope` (`ChannelBase.ts:62-64`) dans le chemin mono-canal. **Le multiplayer nécessite que l'opérateur définisse `sessionScope: "thread"`.**
- **Sérialisation des prompts.** Sur `AcpBridge`, `newSession(cwd)` ne prend que `cwd` (`AcpBridge.ts:131`) et `AcpBridge.prompt()` n'a pas de garde de concurrence — la sérialisation est le `dispatchMode` de `ChannelBase` : `collect` met en buffer (`:361-370,445-463`), `steer` annule le prompt en cours (`:371-379`), `followup` s'enchaîne sur `sessionQueues` (`:381-383,394-470`). Le **défaut runtime est `'steer'`** (`:354`) ; le JSDoc de `types.ts:42` indique `'collect'` — **obsolète ; la v2 le corrige en `'steer'` (OD-5).** Sur le chemin du daemon, `DaemonChannelBridge.prompt()` **lève une exception** en cas de chevauchement (`:257-261`) ; la `promptQueue` FIFO du daemon (`bridge.ts:2855,3082`) se trouve _derrière_ ce garde-fou. Conséquence (critique pour §6.2) : tous les prompts — humains et proactifs — doivent atteindre `bridge.prompt()` déjà sérialisés par `ChannelBase.sessionQueues`.
- **`sendMessage` est abstrait.** `ChannelBase.sendMessage()` est `abstract` (`:81`) ; `DingtalkAdapter.sendMessage()` (`:134-170`) envoie via un `sessionWebhook` par `conversationId` mis en cache uniquement à la réception (`:516-517`) et expirant — un groupe froid n'a pas de webhook en cache et l'appel **retourne silencieusement** (`:137-141`).
- **Invariants du daemon hérités en Phase 1+.** `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`), l'anneau de rejeu de l'`eventBus` (`eventBus.ts:92`), la `promptQueue` FIFO par `SessionEntry` (`bridge.ts:2855-3082`) deviennent disponibles une fois que les canaux sont hébergés sous `qwen serve` (acté, §1).

### Les quatre nouvelles couches

```
            ┌───────────── governance (Layer 4) ─────────────┐
            │  per-channel turn/cost budget gate              │
            │  proactive allowlist, quiet hours, kill switch  │
            └───────────────────────┬─────────────────────────┘
                                     │ wraps all inbound + outbound
 inbound  ┌──────────────────────────▼─────────────────────────┐  outbound
 ───────▶ │  identity injection (Layer 1)                       │ ────────▶
          │  prefix promptText with speaker + channel context   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  channel memory (Layer 3)                           │
          │  per-channel fragment, injected at session start;    │
          │  persisted via CLI-layer callback (core helper)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  proactive engine (Layer 2)                         │
          │  gateway scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() w/ cold-group fallback      │
          └─────────────────────────────────────────────────────┘
```

**Couche 1 — Injection d'identité.** _Topologie : les deux ; ne nécessite pas de daemon._ `handleInbound()` ne met jamais `senderName` dans `promptText` (`ChannelBase.ts:246` ne le lit que pour `SenderGate.check()` ; `Envelope.senderName` existe dans `types.ts:69`). Conception : un point d'injection conditionné par la config dans `handleInbound()`, après le préfixe `referencedText` (`:316-319`), conditionné par `envelope.isGroup`, plus un nouveau flag `Envelope.alreadyPrefixed` pour la réentrée de `collect`. Détaillé en §6.1.

**Couche 2 — Moteur proactif.** _Topologie : scheduler appartenant à la gateway, neutre pour la migration ; s'exécute sous le daemon Phase 1+._ Le cron en session meurt lors du `dispose()` (`Session.ts:790-803`) ; il n'y a pas de point de terminaison de scheduler pour le daemon. `DingtalkAdapter.sendMessage()` ne peut pas atteindre un groupe froid (`:137-141`). Conception : un scheduler résidant dans la gateway qui injecte une exécution (fire) via `ChannelBase.sessionQueues` (jamais `steer`) et route la complétion vers `channel.pushProactive()`. Détaillé en §6.2.

**Couche 3 — Mémoire du canal.** _Topologie : chemin de persistance via callback de la couche CLI ; injection côté canal._ La mémoire est uniquement globale au workspace (`workspace-memory.ts:86-303`). Conception : un fragment de mémoire par canal injecté au démarrage de la session (réutilisation du gate `instructions` une fois par session) plus un nouveau scope `channel` sur le chemin d'écriture, atteint depuis `channel-base` via des callbacks injectés (pas de dépendance `channel-base → core`). Détaillé en §6.3.

**Couche 4 — Gouvernance.** _Topologie : wrapper de gate côté canal ; rate-limiter côté daemon Phase 1+._ Le daemon possède un bearer token global unique (`auth.ts:259-266`), un rate limiting par `clientId`/IP, et pas de budget par canal. Conception : un `ChannelGovernor`/`BudgetLedger` enveloppant `handleInbound()` et le scheduler. Détaillé en §6.4.

### Data-flow 1 — `@qwen` entrant dans un thread de groupe

Ce flux est identique dans sa forme sur les deux topologies ; la seule différence réside dans l'emplacement de la sérialisation et de la permission. Sur `AcpBridge` (Phase 0), la sérialisation est `ChannelBase.sessionQueues` et la permission est auto-approuvée par le child ; sur le daemon (Phase 1+), la sérialisation est _toujours_ `ChannelBase.sessionQueues` (le garde-fou du daemon ne se déclenche jamais car la couche canal a déjà sérialisé) et la permission transite par `MultiClientPermissionMediator`.

1. **DingTalk → adaptateur.** Un membre poste "@qwen summarize today's incidents". Le client stream délivre `DingTalkMessageData` avec `conversationId`, `sessionWebhook`, l'expéditeur, `isInAtList`. `DingtalkAdapter` met en cache `webhooks.set(conversationId, sessionWebhook)` (`:516-517`) et émet une `Envelope` avec `isGroup:true`, `isMentioned:true`, `chatId = conversationId`.
2. **Governor (L4).** `ChannelGovernor`/`BudgetLedger.admit()` vérifie le budget de tours/coûts du canal (consultatif jusqu'à ce qu'une utilisation réelle soit disponible, §6.4) et le kill switch. Hard kill / limite explicite avec des chiffres réels → decline-and-reply ; un dépassement de seuil basé uniquement sur une estimation → WARN, jamais de hard-decline (Fix #6).
3. **Gates.** `GroupGate.check()` passe (la mention satisfait le `requireMention:true` par défaut) ; `SenderGate.check()` passe (`:246`).
4. **Routing.** `router.resolve(...)` calcule `dingtalk:<conversationId>` sous le scope `'thread'` (**nécessite `sessionScope:"thread"`**), et retourne le `sessionId` de groupe partagé. `persist()` l'enregistre.
5. **Memory (L3) + identity (L1).** Au premier tour, la mémoire par canal + `config.instructions` sont préfixées une seule fois (`instructedSessions`, `:344-347`). L'injection d'identité préfixe `[Alice]` à chaque message.
6. **Capture de l'attribution.** Le `senderId`/`senderName` résolu est enregistré **sur l'élément de la file** transporté dans `sessionQueues` (Fix #7), et non joint ultérieurement par timestamp.
7. **Dispatch.** Le profil tag définit `followup` (jamais `steer`) ; le message concurrent de Bob s'enchaîne sur `sessionQueues` (`:394-470`).
8. **Bridge.** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` transite via stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) ou vers la session du daemon (`DaemonChannelBridge.prompt`) — atteint uniquement lorsque le tour précédent a vidé `activePrompts`, de sorte que le garde-fou du daemon (`:257-261`) n'est jamais déclenché.
9. **Stream back.** `textChunk` → `onChunk` (`:416-422`) ; `onResponseComplete → DingtalkAdapter.sendMessage()` utilise le `sessionWebhook` en cache (groupe chaud).
### Flux de données 2 — push proactif planifié vers un groupe froid

1. **Déclenchement du planificateur.** Le `ChannelCronScheduler` résidant dans la passerelle se réveille à 09:00 pour `daily-standup → dingtalk:<convA>`. Il ne s'agit pas du cron en session (désactivé pour les sessions de tag, OD-8/§6.2 ; et de toute façon mort une fois la session nettoyée — `dispose()` vide la `cronQueue`, `Session.ts:790-803`).
2. **Gouverneur (L4).** Vérifie la liste blanche proactive et les heures de silence (source de fuseau horaire explicite). Hors fenêtre / non autorisé → ignore + log. Le planificateur vérifie `adapter.canColdSend` avant de tenter la livraison ; si c'est faux, il **échoue bruyamment** (logs + enregistre `lastError`), et ne fait jamais un no-op silencieux (Fix #4).
3. **Enveloppe synthétique.** `senderId:'__cron__'`, `chatId: convA`, `isGroup:true`, `isMentioned:true`, pas de `messageId`. Le prompt synthétique porte sa propre attribution (`createdBy`) sur l'élément de la file d'attente.
4. **Sérialiser, ne jamais interrompre.** `dispatchProactive` s'enchaîne sur `ChannelBase.sessionQueues` et attend tout tour humain en cours (`activePrompts.get(sessionId)?.done`). Il n'appelle **jamais** `steer`/`cancelSession`, et n'appelle **jamais** `bridge.prompt()` tant que `activePrompts` est détenu — ainsi, l'erreur `Prompt already in flight` du daemon (`:257-261`) ne peut pas se déclencher (§6.2, Fix #1).
5. **Envoi au groupe froid.** `pushProactive(convA, text)` trouve `webhooks.get(convA)` indéfini et bascule sur le nouveau chemin proactif : `openConversationId` persisté, nouveau token d'identifiants d'application, POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` avec `robotCode = config.clientId`, `msgKey:'sampleMarkdown'`, `msgParam` (une _chaîne_ JSON). (Sur Feishu, l'étape 5 est l'existant `sendMessage()` via `tenant_access_token` ; `canColdSend = true`.)
6. **Budget + audit.** Le tour proactif consomme le bucket de budget du canal (débit indicatif jusqu'à ce que l'utilisation hébergée par le daemon soit disponible) ; enregistré avec `createdBy` comme identité d'origine et `originatorClientId` au niveau du transport (aucune identité humaine inventée, `eventBus.ts:60`).

### Pourquoi cette forme (réutiliser plutôt qu'inventer)

Chaque nouvelle couche s'attache à une jonction existante : l'identité au niveau de la construction du `promptText`, le proactif sur `sessionQueues` + `pushProactive()`, la mémoire sur la mécanique `instructions`/`writeContextFile`, la gouvernance comme wrapper sur la chaîne de gate. Le seul **prérequis structurel** — la réutilisation de la mécanique du daemon par les couches 2 à 4 — est satisfait par la migration du daemon actée (§1) : la phase 0 est livrée sur `AcpBridge` ; la phase 1+ s'exécute sous `qwen serve`.

---

## 6. Conception détaillée

### 6.1 Multijoueur & Identité (Zone de construction 1)

Un "tag qwen" vit dans un chat de groupe. Chaque membre parle au _même_ agent, qui doit (a) maintenir une conversation partagée pour l'ensemble du canal, (b) savoir _qui_ parle à chaque tour, (c) ne pas laisser le message d'un membre détruire la tâche en cours d'un autre, et (d) idéalement demander l'approbation du _groupe_ pour les appels d'outils risqués. qwen-code dispose aujourd'hui des primitives pour (a)–(c) ; (d) relève du travail de la phase 1+ hébergée par le daemon (migration actée, §1).

#### Session partagée par le groupe : `sessionScope: 'thread'`

Sous `'thread'`, le `senderId` est retiré de la clé de routage, ainsi chaque membre résout vers un seul `sessionId` (`SessionRouter.ts:53,72-92`) — ce qui fait de l'agent une entité partagée et résidente du canal, plutôt que N bots privés.

- **Portée par canal, pas un basculement global.** La valeur par défaut du routeur est `'user'` (`:25`) et celle de la configuration du canal est `'user'` (`config-utils.ts:91-92`). Les MPs et les canaux mono-utilisateur restent en `'user'`. Le profil du tag définit `sessionScope: 'thread'` dans `settings.json`, appliqué par canal via `setChannelScope()` (multi-canal, `start.ts:361-362`) ou le constructeur `ChannelBase` (mono-canal, `ChannelBase.ts:62-64`).
- **Stabilité de `threadId`/`chatId` pour DingTalk.** L'adaptateur DingTalk ne définit jamais `Envelope.threadId` (`DingtalkAdapter.ts:541-551`), donc `routingKey()` utilise le fallback `threadId || chatId` vers `chatId`, regroupant un groupe en une seule session par `chatId` (comportement souhaité). **Mise en garde :** `chatId = conversationId || sessionWebhook` (`:534`). Pour les vrais messages de groupe, `conversationId` est présent et stable ; si un message arrive sans cela, `chatId` bascule sur l'URL _expirante_ `sessionWebhook` et la clé du thread se déstabilise. Le profil traite un `conversationId` manquant comme une erreur fatale (abandon du message), et non comme une clé silencieuse sur le webhook.

La persistance couvre la récupération après crash (`SessionRouter.ts:168-244`) : un redémarrage du daemon rattache le groupe à la même session partagée via `bridge.loadSession()`.

#### Nouveau risque : `/clear` et `/status` à portée de thread s'appliquent à tout le canal

Le gestionnaire partagé de `/clear` appelle `router.removeSession(this.name, senderId, chatId)` (`ChannelBase.ts:147-152`) et `/status` appelle `router.hasSession(...)` (`:203-208`) ; les deux passent par `routingKey()`, qui **ignore `senderId` sous `'thread'`**. Ainsi, le `/clear` d'un seul membre efface la session partagée pour l'ensemble du canal et réinitialise `instructedSessions` — un véritable piège (footgun) qui réinitialise tout le monde d'un seul clic.

**Résolu (OD-4) :** dans un **groupe partagé (thread)**, `/clear` (et ses alias) nécessitent un token `confirm` explicite et sont restreints à `config.allowedUsers` lorsque cette liste est définie ; sinon, ils effacent directement (les MPs et les groupes par utilisateur ne touchent que la session de l'appelant, aucune gate n'est donc nécessaire). La commande conserve le nom `/clear` car le parseur de slash n'accepte que `[a-zA-Z0-9_]` (un `/clear-channel` avec un tiret serait parsé comme `clear` + arg `-channel`) ; le `confirm` explicite sert d'indicateur de destruction. Une véritable gate de propriétaire par membre (distinguant les admins des membres indépendamment de la liste blanche du chat) attend le modèle d'identité (OD-3/OD-11). **`/status` reste en lecture seule** sur la session partagée.

#### La lacune d'attribution de l'expéditeur et le correctif

`handleInbound()` construit `promptText` à partir de `envelope.text`, du préfixe de citation `referencedText`, des chemins de pièces jointes, et de `config.instructions` une fois par session (`ChannelBase.ts:315-347`) ; `envelope.senderName` n'est lu que pour `SenderGate.check()` (`:246`). Dans un groupe `'thread'`, l'agent voit un flux non différencié.

**Correctif (OD-6) — préfixe `[senderName]` pour les tours de groupe, en haut de la construction du prompt (`:315-316`), à chaque tour :**

```ts
let promptText = envelope.text;

// Attribution multijoueur : dans une session partagée par thread, taguer chaque tour avec
// l'intervenant. Ignorer les sessions 1:1 (l'expéditeur est invariant). Doit se déclencher
// à CHAQUE tour — non conditionné par instructedSessions (l'intervenant change à chaque
// message). Le flag alreadyPrefixed permet à la réentrée synthétique en mode collect
// de sauter cette étape.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **Conditionner sur `envelope.isGroup`** (`types.ts:75`), pas sur la portée.
- **Préfixer avant `referencedText`** pour que l'ordre soit `[Alice] [Replying to: "..."] <text>`.
- **Utiliser `senderName`, pas `senderId`.** Sur DingTalk, `senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`), jamais vide ; la chaîne `senderId → 'unknown'` est défensive.
- **Risque de double préfixe en mode `collect`, résolu par un nouveau champ.** La réentrée coalescée construit une `syntheticEnvelope` dont le `text` est la chaîne coalescée déjà préfixée et rentre dans `handleInbound()` (`:449-462`), ce qui ajouterait le préfixe **une seconde fois**. **La v2 ajoute un nouveau champ optionnel `Envelope`, `alreadyPrefixed?: boolean` (`types.ts`)** ; l'enveloppe synthétique `collect` le définit à `true`, et l'étape de préfixe ci-dessus est sautée lorsqu'il est défini. (Cela corrige l'affirmation de la v1 selon laquelle le changement est "uniquement de format, pas de nouveau champ d'enveloppe" — Fix #2. C'est le seul nouveau champ d'enveloppe introduit par cette RFC ; le protocole bridge/ACP reste inchangé.)

#### `dispatchMode` par défaut du groupe : `steer` → `followup`

`steer` (valeur par défaut à l'exécution, `:354`) annule le prompt en cours via `bridge.cancelSession()` (`:371-379`). Dans un groupe partagé, si Bob envoie quoi que ce soit pendant que l'agent travaille sur la requête d'Alice, `steer` _annule la tâche d'Alice_ — un déni de service accidentel. **Le profil du tag définit `dispatchMode: 'followup'`** afin que le message de Bob soit mis en file d'attente derrière la tâche d'Alice (`sessionQueues` FIFO, `:381-383,394-470`). Définissez-le sur le profil du groupe (`groups["*"].dispatchMode = "followup"`), et non en inversant la valeur par défaut globale — les MPs conservent l'UX d'auto-interruption de `steer`. **Aucun changement de code requis** au-delà d'une valeur par défaut de profil documentée ; la v2 **corrige le JSDoc obsolète `types.ts:42` vers `'steer'`** pour que le code et le commentaire correspondent (OD-5). `collect` est acceptable pour les groupes à très fort trafic (limite la profondeur de la file d'attente) au prix d'un flou d'attribution.

Parce que le profil du tag est **toujours `followup` (jamais `steer`)** pour les groupes, le moteur proactif hérite d'un invariant propre : il n'y a pas de course entre steer et proactif, car aucun chemin dans un groupe de tag n'annule un prompt en cours. Cet invariant est réaffirmé et appliqué dans la §6.2.

#### Handoff — "reprendre là où la dernière personne s'est arrêtée"

Avec `'thread'` + les préfixes `[senderName]` + `followup`, le handoff _est_ le comportement par défaut : la session conserve l'historique complet multi-intervenants. Deux ajouts ergonomiques : une commande **`/who`** en lecture seule (via `protected registerCommand(name, handler)`, `:141-143` — pas la map privée `commands`) rapportant le `sessionId`/`cwd`/résumé de tâche actif ; et un rattachement idempotent au redémarrage (déjà couvert par `restoreSessions()`).

#### Approbations multi-membres — phasage (OD-3, décidé)

L'intention est bonne : les appels d'outils risqués devraient être approuvables par le groupe, et qwen-code fournit `MultiClientPermissionMediator` avec quatre politiques (`permissionMediator.ts:348,621-637`). **Mais rien de tout cela n'est accessible depuis le canal sur le chemin `AcpBridge` de la phase 0 :**

1. **`qwen channel start` câble `AcpBridge`, dont le `requestPermission` approuve automatiquement** chaque requête (`AcpBridge.ts:108-118`). Aucune invite d'approbation.
2. Le médiateur réside dans la couche de service HTTP du daemon. Le seul bridge de canal capable de gérer les permissions est `DaemonChannelBridge` (`respondToPermission`, `:346-374`) — atteint une fois que la phase 1 migre l'hébergement du canal dans le daemon (acté, §1).
3. `config.approvalMode` est un **champ mort** — parsé (`config-utils.ts:94`) et typé (`types.ts:36`) mais lu par aucun adaptateur ou bridge.

**Phasage décidé :**

- **Phase 0 :** pas d'approbations de groupe. Contrôler le risque avec la liste blanche des expéditeurs + `requireMention` + un jeu d'outils agent conservateur. Ne pas prétendre que `approvalMode` fait quoi que ce soit.
- **Phase 1 :** le canal s'exécute sur le chemin daemon-bridge (migration actée) ; afficher `permission_request` sous forme de carte DingTalk ; livrer **`first-responder` avec un seul `clientId` au niveau du canal** (l'appui de n'importe quel membre autorisé résout ; attribution à la granularité du canal). Ne nécessite pas de map `senderId → clientId`. **Refuser automatiquement les outils à haut risque sur les tours proactifs** (un tour d'origine `__cron__` ne peut pas répondre à une invite de permission).
- **Phase 2 :** ajouter `consensus`/`designated` par membre une fois que le mapping `senderId → clientId` et le cycle de vie de `clientId` (nettoyage, limites de refcount) existent. Note : un `clientId` synthétique par `senderId` fait croître la map de refcount `clientIds` de manière illimitée et doit être nettoyé.

#### Résumé des changements concrets (Zone de construction 1)

| Changement | Où | Type |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| Le profil du groupe définit `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config        |
| Traiter le `conversationId` DingTalk manquant comme une erreur                        | `DingtalkAdapter.ts` ~`:534`                             | Code (S)      |
| Préfixe `[senderName]` pour les tours de groupe                                   | `ChannelBase.handleInbound` ~`:316`                      | Code (S)      |
| Nouveau champ optionnel `Envelope.alreadyPrefixed`                           | `types.ts` (Envelope)                                    | Code (S)      |
| Définir `alreadyPrefixed` sur la réentrée synthétique `collect`                   | `ChannelBase.ts:449-462`                                 | Code (S)      |
| `/clear confirm` + gate de liste blanche dans les groupes partagés ; `/status` en lecture seule | commandes partagées (`:147-217`)                             | Code (S)      |
| Le profil du groupe définit `dispatchMode: 'followup'`                           | `groups["*"]` dans `settings.json`                         | Config        |
| Corriger le JSDoc obsolète `dispatchMode` → `'steer'`                              | `types.ts:42`                                            | Correction de commentaire   |
| Commande de handoff `/who`                                                  | `registerCommand` (`:141`)                               | Code (S)      |
| La migration daemon-bridge remplace l'auto-approbation `AcpBridge`               | hébergement `DaemonChannelBridge` (acté)                | Phase 1 (L)   |
| Vote d'approbation par membre + carte DingTalk                              | nouveau câblage de bridge + `respondToPermission`              | Phase 1/2 (L) |
### 6.2 Moteur proactif : planificateur + push sortant (LE CŒUR)

#### Décision : un planificateur appartenant à la passerelle, neutre vis-à-vis de la migration

**Adoptez un planificateur qui réside dans le processus de la passerelle `qwen channel start`.** La passerelle possède le `SessionRouter` (avec la récupération via `restoreSessions()` — `start.ts:275,444`), détient chaque instance d'adaptateur et son bridge, et est le seul endroit où `ChannelBase.pushProactive()` (et la méthode abstraite sous-jacente `sendMessage()`, `:81`) peut être invoqué. L'agent (qu'il s'agisse de l'enfant `--acp` lancé dans la Phase 0 ou de la session du démon dans la Phase 1+) reste un pur exécuteur de prompts : le planificateur se déclenche en mettant en file d'attente dans `ChannelBase.sessionQueues`, qui n'appelle `bridge.prompt()` qu'une fois le tour précédent terminé — **pas de nouvelle méthode bridge, pas de canal inverse, pas de route de push du démon.**

> **Note sur la topologie (architecture actée).** Le planificateur est **neutre vis-à-vis de la migration par construction** : il sérialise via `ChannelBase.sessionQueues` quel que soit le bridge sous-jacent. Dans la Phase 0, il pilote `AcpBridge.prompt()` via stdio ; dans la Phase 1+, il pilote `DaemonChannelBridge.prompt()` (hébergé par le démon). Étant donné que l'audit `eventBus` du démon et la `promptQueue` FIFO sont requis pour la gouvernance de la Phase 1+, le canal s'exécute sous `qwen serve` à partir de la Phase 1 — mais la logique propre du planificateur ne change pas à la frontière de la migration.

Pourquoi pas les alternatives :

- **Cron dans `Session` :** rejeté — `cronQueue`/`cronProcessing` résident dans la `Session` en cours de processus (`Session.ts:667-668`), ne se déclenchent que lorsqu'une session est ouverte, et meurent lors du `dispose()` lors de la récupération pour inactivité de 30 min (`:790-812`). C'est exactement l'échec que le planificateur de la passerelle évite. **De plus, le planificateur de la passerelle est le SEUL propriétaire du cron (OD-8) : une session tag ne démarre jamais son cron en session** (mécanisme de filtrage ci-dessous).
- **Processus autonome :** rejeté — un second processus de longue durée dupliquant les identifiants DingTalk, incapable de réutiliser le `SessionRouter` en cours de processus et le bridge déjà attaché.

#### Composants et emplacement

| Composant                          | Fichier                                                                     | Responsabilité                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (nouveau)                  | Table de tâches durable, JSON sibling de `sessions.json`. `atomicWriteJSON` (`atomicFileWrite.ts:385`) + `Mutex` `async-mutex` par fichier.                                            |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (nouveau)              | Unique `setTimeout` réarmé (timer-wheel-of-one) ; prochain déclenchement via `nextFireTime` ; rattrapage au redémarrage ; tick de réconciliateur toutes les 60s. Un par passerelle ; seul propriétaire du cron. |
| Primitives Cron                    | `packages/core/src/utils/cronParser.ts` (réutilisation)                     | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`). Ne pas réimplémenter.                                                                                                         |
| `dispatchProactive`                | `ChannelBase.ts` (extension)                                                | Injecter un déclenchement via `sessionQueues` ; attendre le `activePrompts.get(sessionId)?.done` de tout tour humain en cours ; jamais de `steer` ; ne jamais appeler `bridge.prompt()` tant que `activePrompts` est détenu. |
| `pushProactive`                    | `ChannelBase.ts` (extension ; défaut de base = `sendMessage`) + surcharge DingTalk | Livraison sortante ; surcharges DingTalk pour les groupes froids. Contrôlé par la capacité `canColdSend`.                                                                              |
| `canColdSend`                      | Propriété `ChannelBase` (défaut `false`)                                    | Drapeau de capacité que le planificateur vérifie avant un envoi à froid ; DingTalk passe à `true` une fois que le chemin de l'API proactive est déployé ; Feishu est à `true`.         |
| Envoi proactif DingTalk            | `packages/channels/dingtalk/src/proactive.ts` (nouveau) + `DingtalkAdapter.ts` | Envoi de messages proactifs en groupe via `robotCode` + `openConversationId` stocké (contrat VÉRIFIÉ ci-dessous).                                                                      |
| Câblage                            | `start.ts` (extension de `startSingle`/`startAll`)                          | Construire + démarrer le planificateur après `router.restoreSessions()` (`:275,444`) ; transmettre le drapeau `isTagSession` dans la construction de la session (OD-8).                |
| Outil `/schedule` + `schedule_task`| `ChannelBase.handleInbound()` (extension, après les filtres `:240-252`)     | Commande déterministe d'abord ; outil du modèle ensuite.                                                                                                                               |

#### Drapeau de capacité `canColdSend` (Correctif #4)

Le critère MVP multiplateforme (« la même tâche s'exécute sur DingTalk et Feishu ») nécessite un drapeau de capacité afin que le planificateur puisse raisonner sur l'accessibilité au lieu de la découvrir par un échec silencieux.

- **Déclaré comme une propriété sur `ChannelBase` :** `protected readonly canColdSend: boolean = false;`. (Placé sur la classe de base, et non sur un registre `ChannelPlugin` séparé, car le planificateur détient déjà l'instance de l'adaptateur et `pushProactive`/`sendMessage` sont des méthodes d'instance — co-localiser le drapeau avec la méthode qu'il protège les maintient dans un seul type.)
- **DingTalk :** `canColdSend = false` jusqu'à ce que le chemin d'envoi proactif (`proactive.ts`) soit déployé et qu'un `openConversationId` utilisable soit persisté ; passe à `true` une fois `pushProactive` implémenté. Tant que c'est `false`, DingTalk peut toujours répondre aux tours chauds (webhook) — `canColdSend` ne régit que la livraison vers les _groupes froids_.
- **Feishu :** `canColdSend = true` (envoi proactif natif via `tenant_access_token`, `FeishuAdapter.ts:622-676`).
- **Le planificateur échoue bruyamment :** avant de délivrer un déclenchement, le planificateur vérifie `adapter.canColdSend`. Si `false`, il ne tente **pas** `pushProactive` ; il journalise une erreur visible par l'opérateur, définit `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`, l'affiche dans `/schedule list`, et (selon la politique) incrémente `consecutiveFailures`. Il ne fait jamais de no-op silencieux.

#### Stores cron disjoints + la barrière OD-8 (Correctif #5)

Il existe deux chemins de persistance des crons, et **ils résident sur des chemins de système de fichiers disjoints**, de sorte qu'ils ne peuvent jamais lire ou écrire les mêmes tâches :

- **Store de la passerelle (nouveau) :** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — global au canal, sibling de `sessionsPath()` (`start.ts:56-58`), propriété de l'utilisateur, en dehors de l'arbre de travail.
- **Store de session (existant) :** le cron `Session` par session utilise un répertoire **haché par projet** `~/.qwen/tmp/<hash>/scheduled_tasks.json` (`cronTasksFile.ts:1-9`).

Étant donné que les chemins sont disjoints, la seule façon qu'une tâche durable se déclenche en double est si une **session tag exécute également son cron `Session` en session** en plus du planificateur de la passerelle. **OD-8 ferme cette porte :** le planificateur de la passerelle est le seul propriétaire du cron ; une session hébergée par le canal (« tag ») ne démarre **pas** son cron en session.

**Mécanisme de filtrage — comment une session apprend qu'elle est une session tag.** Une session tag est construite avec un drapeau explicite transmis depuis l'hôte du canal :

- Sur le chemin du démon Phase 1+, `DaemonChannelSessionFactory` reçoit déjà un sac d'options structuré (`{ workspaceCwd, modelServiceId, sessionScope }`, `DaemonChannelBridge.ts:226-241`). Ajoutez `isTagSession: true` à ce sac ; la `Session` du démon le lit à la construction et **ignore `startCronScheduler()`** (le site d'appel qui armerait autrement `cronQueue`, `Session.ts:667-668`). La disposition efface déjà le cron lors de la récupération (`:790-803`), donc une session tag ne l'arme simplement jamais.
- Sur le chemin `AcpBridge` de la Phase 0, l'agent enfant ne doit pas non plus armer le cron en session pour un espace de travail tag ; transmettez le même drapeau via une option de spawn `--acp` (un nouveau champ `AcpBridgeOptions` transmis en tant que drapeau dans `Config`). Jusqu'à ce que cette transmission du drapeau soit implémentée, la Phase 0 n'enregistre simplement aucune tâche cron en session (la commande `/schedule` cible le store de la passerelle), il n'y a donc rien qui puisse se déclencher en double.

Cela rend le risque restant purement opérationnel : « ne pas exécuter les deux planificateurs pour les mêmes tâches » — et la barrière garantit qu'une session tag ne démarre jamais le second.

#### Schéma du store durable et récupération au redémarrage

Le schéma est parallèle à `DurableCronTask` (`cronTasksFile.ts:19-26` : `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — le champ est `cron`, **et non** `cronExpr`) :

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // mirrors SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // "__cron__" for system jobs
    chatId: string; // DingTalk openConversationId — the DURABLE cold-group id
    threadId?: string;
  };
  cwd: string; // validated == bound workspace on load
  cron: string; // 5-field (parseCron) OR "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId; advisory under single-token model; carried into the fire's attribution
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // auto-disable after N (e.g. 5)
}
```

Écriture via `atomicWriteJSON` sous un `Mutex` `async-mutex` par fichier. **Récupération au redémarrage** dans `start.ts` _après_ `router.restoreSessions()` (`:275`/`:444`) :

1. `bridge.start()` → `restoreSessions()` recharge `sessions.json` et `bridge.loadSession()` par entrée.
2. `store.load()` ; supprime les entrées dont `cwd !== boundWorkspace`.
3. `scheduler.start()` : calcule `nextFireTime(job.cron, new Date())` pour chaque tâche activée. **Politique de déclenchement manqué (décision RFC) : les tâches récurrentes en retard pendant l'arrêt se déclenchent une fois immédiatement puis reprennent — ne rejouent jamais un backlog** (un déluge de backlog dans un groupe actif est un incident de spam). Les tâches uniques dans le passé se déclenchent une fois puis sont supprimées. `cronScheduler.ts` distingue `{ kind: 'catch-up'; ids }` (récurrent) de `{ kind: 'missed'; tasks }` (tâches uniques, confirmation d'abord) à `:81-89,608-707` ; nous adoptons la fusion en une seule pour les récurrentes.
4. Armez un unique `setTimeout` pour la tâche la plus proche ; réarmez après chaque déclenchement. Ajoutez un tick de réconciliateur toutes les 60s (précédent : `lockProbeTimer`, `cronScheduler.ts:229,507-538`) recalculant à partir de `Date.now()` pour absorber le décalage d'horloge lors de la suspension/reprise — n'accumulez jamais les intervalles.

#### Chemin de déclenchement : injection dans la session de groupe PARTAGÉE (Correctif #1 — le plus important)

L'invariant d'un prompt actif par session diffère selon la topologie et le `dispatchProactive` de la v1 s'est trompé pour le chemin du démon :

- **Phase 0 (`AcpBridge`) :** `AcpBridge.prompt()` (`:147-180`) n'a **pas de garde de concurrence propre** ; la seule sérialisation est `ChannelBase.sessionQueues`/`activePrompts` (`:29-35,394,466`) et la session ACP propre à l'enfant `--acp`.
- **Phase 1+ (`DaemonChannelBridge`) :** `DaemonChannelBridge.prompt()` **lève une exception `Prompt already in flight`** lorsque `activePrompts.has(sessionId)` (`:257-261`) — il ne met **pas** en file d'attente. La `promptQueue` FIFO (`bridge.ts:2855,3082`) est côté démon/acp-bridge, _derrière_ ce garde de levée d'exception en cours de processus. Ainsi, appeler `DaemonChannelBridge.prompt()` alors qu'un tour humain est actif **lève une exception** au lieu d'attendre.

**La refonte (correcte sous les deux topologies) : ne jamais appeler `bridge.prompt()` tant qu'un tour est en cours ; sérialiser au niveau du canal via `sessionQueues`, en attendant d'abord `activePrompts`.** Étant donné que `sessionQueues` enchaîne l'exécution proactive _après_ la résolution de l'exécution précédente, au moment où `bridge.prompt()` est invoqué, `activePrompts.get(sessionId)` est libre — ainsi, sur le chemin du démon, le garde de levée d'exception n'est jamais déclenché, et sur le chemin `AcpBridge`, le `prompt()` non gardé ne se chevauche jamais non plus.
```ts
// ChannelBase.ts — réutilise les propriétés privées sessionQueues/activePrompts (:29-35).
// Fonctionne de manière identique pour AcpBridge (Phase 0) et DaemonChannelBridge (Phase 1+) :
// la chaîne garantit que bridge.prompt() s'exécute uniquement après que le tour précédent soit terminé,
// de sorte que l'erreur `Prompt already in flight` de DaemonChannelBridge (:257-261) ne peut pas se déclencher.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // attend la fin d'un tour humain — n'annule jamais via steer (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // ce n'est qu'à ce moment que activePrompts est vide
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**Invariant : un tour proactif n'est jamais annulable par un tour humain ultérieur, et n'annule jamais un tour humain.** Application, énoncée pour les deux variantes :

- **Pas d'annulation proactif→humain :** `dispatchProactive` n'appelle jamais `steer`/`cancelSession`. Il se contente d'attendre (`await`) `activePrompts.get(sessionId)?.done` puis s'ajoute à la file d'attente derrière.
- **Pas d'annulation humain→proactif :** le profil du groupe de tags est **`followup` (jamais `steer`)** (§6.1). Puisque `steer` est le seul `dispatchMode` qui appelle `bridge.cancelSession()` (`:371-379`), et que les groupes de tags ne le sélectionnent jamais, un tour humain entrant peut seulement s'enchaîner _derrière_ un tour proactif en cours via `sessionQueues` — il ne peut pas l'annuler. (Sur le chemin du daemon, `DaemonChannelBridge.cancelSession` (`:332`) n'est atteint que depuis la branche `steer`, qui est exclue pour les groupes de tags.)
- **Protection contre les erreurs jamais déclenchée :** sur les deux chemins, `bridge.prompt()` est invoqué uniquement à la fin de la chaîne `sessionQueues`, après que l'exécution précédente soit résolue et (pour les tours humains) que `activePrompts` soit vidé — de sorte que l'erreur de chevauchement de `DaemonChannelBridge` (`:257-261`) est structurellement inatteignable pour le trafic des tags.

Lors du déclenchement :

1. **Résoudre la session partagée** via `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)` (`SessionRouter.ts:72`). `'thread'` → un seul `sessionId` pour tout le groupe, ainsi le déclenchement s'inscrit dans le contexte visible par les humains. Si la session restaurée a été perdue, `resolve()` en crée et persiste une nouvelle.
2. **Mettre en file d'attente, jamais préempter** (followup via `sessionQueues`). Délibérément pas `steer`.
3. **Marqueur + attribution (Fix #7).** Préfixer `[Scheduled task "<label>" set by <createdBy>]\n`. L'identité `createdBy` est **portée par l'exécution en file d'attente**, et non jointe par un horodatage ultérieurement, de sorte que tout appel d'outil/permission levé lors de ce déclenchement est attribué à _ce_ tour proactif (§6.4).
4. **Capture + push.** `dispatchProactive` renvoie le texte de complétion ; le planificateur vérifie `adapter.canColdSend`, puis appelle `channel.pushProactive(target.chatId, text)` (échec bruyant si `false`).

#### Push de groupe à froid sur DingTalk

**Limitation vérifiée :** `DingtalkAdapter.sendMessage()` envoie uniquement via le `sessionWebhook` mis en cache par `conversationId` (`:84,134-142`), rempli uniquement lors de la réception (`:505-517`). Groupe à froid → retour silencieux (`:137-141`).

**Correctif — `pushProactive` via l'API DingTalk 主动消息 群发 (contrat désormais VÉRIFIÉ, OD-7 résolu).** La forme de l'appel est également précédée dans le dépôt (`emotionApi` fait des POST vers `api.dingtalk.com/v1.0/robot/...` avec l'en-tête `x-acs-dingtalk-access-token` et le corps `{ robotCode, openConversationId, ... }`, `:188-197`).

**Endpoint et paramètres vérifiés** (voir §6.5 pour les notes complètes sur les sources ; confiance notée par élément) :

- **Endpoint :** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(confiance élevée ; doc officielle d'envoi + aliyun ask/559227)_.
- **`robotCode`** (REQUIS, string) : l'identifiant du robot lors de son installation dans le groupe ; même espace de valeurs que `appKey` pour les robots internes à l'entreprise → utiliser `config.clientId` (`:184,435`). Pas de nouveau credential. _(confiance élevée)_
- **`openConversationId`** (REQUIS, string) : l'identifiant de conversation ouverte préfixé par `cid` du groupe cible ; les codes d'erreur `miss.openConversationId`/`invalid.openConversationId` confirment qu'il est requis et validé. Persister dans `ChannelCronJob.target.chatId` — stable entre les redémarrages, contrairement à `sessionWebhook`. _(confiance élevée)_
- **`msgKey`** (REQUIS, string) : clé du modèle de message ; **`'sampleMarkdown'`** pour le markdown (`'sampleText'` pour le texte brut). _(confiance élevée ; doc sur les types de messages + aliyun ask/585232)_
- **`msgParam`** (REQUIS, **une _chaîne_ encodée en JSON**, pas un objet imbriqué) : pour `sampleMarkdown`, la chaîne est `"{\"title\":\"<titre d'aperçu>\",\"text\":\"<corps markdown, max ~5000 caractères>\"}"`. _(confiance élevée ; champs title/text markdown de la doc sur les types de messages, exemple de texte verbatim de aliyun ask/585232)_
- **`coolAppCode`** (OPTIONNEL) : uniquement lorsque le robot est installé en tant qu'application cool de groupe (群聊酷应用) ; non requis pour un simple robot d'application interne à l'entreprise. _(confiance moyenne)_
- **`conversationId` == `openConversationId` ?** Pour le callback @-standard de groupe, **considérer le `conversationId` du callback (préfixé par cid) comme directement utilisable en tant que `openConversationId`** — corroboré par des sources communautaires + format `cid` correspondant. **Signalé (confiance moyenne) :** la documentation officielle ne contient pas de phrase verbatim les équivalant pour un robot standard (non cool-app). Le chemin garanti par la doc est l'API de conversion `chatId → openConversationId` (ou sa capture depuis l'API de création de groupe / le JSAPI `chooseChat` / un callback d'application cool qui délivre directement `openConversationId`+`coolAppCode`). **Règle de repli :** si un envoi renvoie `invalid.openConversationId`, utiliser l'API de conversion `chatId → openConversationId`.

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // confiance élevée

async pushProactive(chatId: string, text: string): Promise<void> {        // surcharge de DingtalkAdapter
  const token = await this.tokenManager.get();        // rafraîchi indépendamment du cycle de vie de connexion du SDK
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* rafraîchir une fois ; sinon définir lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // réutiliser le chunker SI le budget de longueur du modèle correspond
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam est une STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // si invalid.openConversationId → convertir via l'API chatId, réessayer
  }
}
```

`sendMessage()` devient : essayer d'abord le `sessionWebhook` en cache (peu coûteux, pas de consommation de token) ; sinon, se rabattre sur `pushProactive()`. **Valeur par défaut de base** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`, donc **Feishu n'a pas besoin de surcharge** (`FeishuAdapter.sendMessage()` effectue déjà des envois proactifs vers n'importe quel `chatId` avec un `tenant_access_token` stable, `:622-676` ; `canColdSend = true`). DingTalk est le seul adaptateur divergent — l'asymétrie DingTalk-first. Le flag `canColdSend` (ci-dessus) permet au moteur d'**échouer bruyamment** sur un adaptateur purement réactif au lieu d'ignorer silencieusement l'erreur.

**Contraintes de déploiement strictes (hors code) :** le bot de l'organisation doit être (a) un bot interne à l'entreprise publié, (b) autorisé avec la permission de message de groupe proactif, (c) membre du groupe cible (installé via une application cool de groupe / application interne à l'entreprise / application tierce, détenant son `robotCode`) _(confiance élevée qu'une permission doit être activée ; confiance élevée que bot installé + robotCode sont des prérequis)_, (d) avoir son `openConversationId` enregistré. Nous persistons le `conversationId` la première fois que le bot voit _n'importe quel_ message entrant dans un groupe, donc "à froid" = _inactif_, et non _jamais vu_ ; un groupe véritablement jamais vu ne peut pas recevoir de push jusqu'à ce que son `openConversationId` soit obtenu via l'API de conversion (limite stricte). **Modification requise de l'adaptateur :** aujourd'hui, seul le `sessionWebhook` est mis en cache (`:516-517`) ; nous devons également persister le `conversationId` (stockage recommandé : un fichier séparé `~/.qwen/channels/dingtalk-groups.json`, découplé de la durée de vie de la session afin que les groupes à froid et les cron sans session active soient représentables).

> **TOUJOURS SIGNALÉ (faible confiance) — garder visible selon OD-7 :** (1) le **code/nom d'affichage exact du point de permission** pour "envoyer proactivement un message de groupe" dans la console 权限管理 de l'application DingTalk n'est pas figé par la doc — DingTalk l'affiche sous la 权限管理 de l'application comme une permission d'envoi de message/robot (généralement la famille robot-message, par ex. `qyapi_robot_sendmsg` / 企业机器人发送消息权限) ; confirmer dans la console, ne pas affirmer le code de manière stricte. (2) La phrase officielle unique et faisant autorité équivalant le `conversationId` du callback à `openConversationId` pour un robot standard (non cool-app) n'a pas été trouvée verbatim lors de cette session — raccourci à forte probabilité, mais le chemin d'obtention garanti par la doc est l'API de conversion `chatId → openConversationId`. Les pages de la plateforme ouverte DingTalk sont rendues en JS et n'ont pas pu être entièrement scrapées lors de cette session ; les faits sur l'endpoint/les paramètres/le token ont été recoupés via le miroir de doc apifox et les Q&R des développeurs Aliyun citant les exemples de requêtes officiels.

#### Cycle de vie de l'authentification et des tokens (vérifié ; le risque critique de faisabilité)

**En-tête d'authentification (confiance élevée).** Tous les appels v1.0 (y compris `groupMessages/send`) transmettent le token dans l'en-tête de requête `x-acs-dingtalk-access-token: <accessToken>` ainsi que `Content-Type: application/json` — exactement l'en-tête que `emotionApi()` (`:188-207`) et `downloadMedia()` (`media.ts:36-43`) utilisent déjà.

**Obtention du token (confiance élevée).** Application interne à l'entreprise, style v1.0 : `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` avec le corps JSON `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`. (L'équivalent legacy `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` renvoie `{access_token, expires_in:7200}`, mais ce token legacy est pour les anciens endpoints `oapi` ; pour les API v1.0 de `api.dingtalk.com`, utilisez le `accessToken` v1.0 dans l'en-tête `x-acs-dingtalk-access-token`.)

**Expiration et mise en cache (confiance élevée).** Les tokens expirent au bout de **7200 s (~2 h)** et DOIVENT être récupérés à nouveau après expiration ; dans la fenêtre de validité, les récupérations répétées renvoient le même token et le renouvellent. **Mettre en cache par application ; ne pas appeler l'endpoint de token à chaque requête** (les appels fréquents sont limités).

**Pourquoi c'est le risque critique.** Le SDK Stream récupère l'`access_token` **une seule fois au moment de la connexion** via `GET .../gettoken` dans `getEndpoint()` (`client.mjs:85-87`) et **ne le rafraîchit jamais** ; `getAccessToken()` renvoie la valeur en cache (`DingtalkAdapter.ts:172-174`). `autoReconnect` ne récupère le token que lors de la _fermeture_ du socket (`client.mjs:157-163`) — un socket stable et de longue durée conserve un token obsolète après le TTL de ~2 h, et tout envoi proactif (ainsi que les chemins emotion/media existants) échoue silencieusement une fois qu'il expire. **La fonctionnalité proactive doit gérer le rafraîchissement du token :** un `tokenManager` qui récupère via l'endpoint v1.0 `oauth2/accessToken` via un timer (avant l'expiration de ~2 h) et/ou sur un 401, mettant en cache par application indépendamment du cycle de vie de connexion du SDK (OD-7). C'est l'échec le plus probable du type "fonctionne dans la démo, meurt après 2 heures".

**Limites de débit (vérifiées, confiance mixte — garder signalé) :** (1) concurrence de l'API côté serveur par application ~20 QPS sur DingTalk Standard, avec un quota mensuel d'API ouverte ~10 000/mois (Professionnel ~500k, Dédié ~5M) _(confiance moyenne-élevée)_. (2) Une limite fréquemment citée de **20 messages/minute → ~10 min de throttle** par robot est documentée pour les **robots webhook de groupe personnalisés** ; elle est couramment appliquée comme guide pratique pour le chemin d'envoi du robot d'application d'organisation, mais n'a **pas** été explicitement confirmée sur la page `groupMessages/send` lors de cette session — **considérez le chiffre exact de 20/min pour `groupMessages/send` avec une confiance faible/moyenne.** De plus : ne pas sur-appeler l'endpoint de token (throttle séparé). Le planificateur doit limiter le débit de ses propres envois de manière conservatrice et se retirer en cas de réponses de throttle.

#### Instructions permanentes (demandes récurrentes en NL → stockage → consommation)

Capture à deux niveaux dans `handleInbound()` après le passage des portes (`:240-252`) : une commande explicite **`/schedule "0 9 * * 1-5" post the open PR list`** (analysée avec `parseCron`, sans aller-retour modèle), et un outil modèle de Phase 2 `schedule_task(cron, prompt, recurring, label)`. Les deux appellent `store.add({...})` → persistance → `scheduler.reschedule(job)`, puis répondent dans le canal. `/schedule list|cancel <id>|disable <id>` lit/écrit dans le store. **Persistance en échec fermé :** refuser d'accuser réception de `/schedule` si l'écriture lève une erreur.
#### Modes de défaillance

- **Passerelle indisponible au moment du déclenchement :** la récupération regroupe les déclenchements récurrents en retard en un seul rattrapage ; les déclenchements uniques passés s'exécutent une fois puis sont supprimés.
- **Crash de l'agent en cours de déclenchement :** `bridge.prompt()` rejette ; `attachDisconnectHandler` (`start.ts:241,403`) relance (Phase 0) / le démon se rattache (Phase 1+). Le planificateur définit `lastError`, n'horodate pas `lastFiredAt` pour les récurrents → relancé. Au moins une fois ; la clé de déclenchement arrondie à la minute + `lastFiredAt` déduplique.
- **Session nettoyée / échec de `loadSession` :** `resolve()` crée une nouvelle session (la transcription du groupe est perdue ; les instructions permanentes doivent être autonomes). La mémoire du canal (§6.3) constitue le plancher de récupération.
- **L'adaptateur ne peut pas envoyer à froid (`canColdSend=false`) :** le planificateur journalise et enregistre `lastError`, affiché dans `/schedule list` ; jamais silencieux.
- **Push de groupe à froid vers un groupe supprimé ou dont les permissions ont été révoquées :** non-2xx → `lastError` ; `invalid.openConversationId` → tentative de conversion `chatId → openConversationId` + nouvelle tentative une fois.
- **Token expiré :** `tokenManager` rafraîchit une fois + backoff ; `consecutiveFailures` ≥ N → désactivation automatique avec un enregistrement visible par l'opérateur.
- **Deux passerelles sur un même workspace :** `checkDuplicateInstance()` (`start.ts:170-179`) garantit l'instance unique ; enregistre également un token de verrouillage dans `cron.json`.

### 6.3 Mémoire et apprentissage à l'échelle du canal (Build Area 3)

Un tag doit _se souvenir du groupe au fil du temps_ sans fuite vers un groupe frère. Aujourd'hui, la mémoire de qwen-code est **globale au workspace** : pas d'axe chat/canal/groupe/session.

> **Faits sur la topologie / les dépendances (Fix #3).** Deux contraintes strictes façonnent le câblage : (1) Dans la topologie `AcpBridge` par défaut, il n'y a **pas de démon `qwen serve` ni de route `POST /workspace/memory`** — l'enfant `--acp` n'a pas de client HTTP ; même après la migration vers le démon Phase 1+, la route de mémoire est **exclusivement pour le démon et en auth stricte** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). (2) `@qwen-code/channel-base` dépend uniquement de `@agentclientprotocol/sdk` (`packages/channels/base/package.json`), **et non** de `@qwen-code/qwen-code-core`, donc `ChannelBase` **ne peut pas** `import { writeWorkspaceContextFile }`. La conception corrigée écrit/lit donc la mémoire du canal **in-process via le helper principal, atteint depuis `channel-base` via des callbacks injectés par la couche CLI** (`packages/cli`, qui _peut_ dépendre de core) — pas via HTTP, et pas en ajoutant une dépendance core à `channel-base`.

#### État actuel : deux scopes, aucun par conversation

`POST /workspace/memory` accepte uniquement `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`), résolu via `resolveContextFilePath()` (`writeContextFile.ts:223-240`) : `workspace → <root>/QWEN.md`, `global → ~/.qwen/QWEN.md`. Le mode append se replie sous `## Qwen Added Memories` (`MEMORY_SECTION_HEADER`, `const.ts:29`) ; un mutex par fichier avec un délai de 30s sérialise les écritures (`writeContextFile.ts:48-57,159-162`) ; le writer refuse un fichier existant > 16 Mo en append (`MAX_EXISTING_FILE_BYTES`, `:255`). La route est en **auth stricte** (`deps.mutate({ strict: true })`, `:114`) — elle refuse même en loopback sans token. Conséquence : chaque groupe sur un workspace partage un seul `QWEN.md`.

#### Conception : un scope de mémoire `channel` indexé par `(channelName, chatId)`

L'unité d'isolation est la **cible de routage**, pas la session (les sessions sont nettoyées en cas d'inactivité, `DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30 min, `run-qwen-serve.ts:94`). La clé existe déjà : `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`). Pour la mémoire de groupe, l'indexation se fait sur `(channelName, chatId)`.

**Structure de stockage** reflète l'arborescence existante `~/.qwen/channels/` :

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitize : rejeter /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, pas de collision/échappement
        QWEN.md                     # "apprentissage au fil du temps" à l'échelle du groupe
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

Le nom de fichier respecte `getCurrentGeminiMdFilename()` (`const.ts:49`). Cela maintient la mémoire du canal en dehors de l'arbre de travail, en dehors du workspace lié, et en dehors du chemin de découverte hiérarchique de `QWEN.md` (afin qu'elle ne fuite jamais entre les groupes).

#### Chemin d'écriture (étendre le helper core, ne pas le forker)

Dans `packages/core/src/memory/writeContextFile.ts` :

- Étendre `WriteContextFileScope` (`:80`) de `'workspace' | 'global'` pour ajouter `'channel'`.
- Étendre `WriteContextFileOptions` (`:83-97`) avec `channelKey?: { channelName: string; chatId: string }` ; valider la présence quand `scope === 'channel'` (imiter la garde de chemin absolu `:142-146`). `projectRoot` reste requis par l'interface — passer `config.cwd` même s'il n'est pas utilisé pour le scope channel.
- Dans `resolveContextFilePath()` (`:223-240`), ajouter une branche `channel` retournant `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())`. **La signature actuelle de la fonction est `(scope, projectRoot)` — elle doit gagner un paramètre `channelKey`** (fonction privée, changement local). Le mutex par fichier utilise comme clé le chemin résolu, permettant ainsi à deux groupes d'écrire de manière concurrente sans contention.

**Le changement exact de `ChannelBaseOptions` + qui l'injecte (Fix #3).** `channel-base` ne peut pas importer core, donc la couche CLI fournit la lecture/écriture sous forme de callbacks. Étendre le sac d'options (`ChannelBase.ts:9-12` — l'interface réelle aujourd'hui est juste `{ router?: SessionRouter; proxy?: string }` ; `config` et `bridge` sont des **arguments positionnels du constructeur** à `:40-46`, pas des membres du sac). Le sac contient déjà `router` :

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (AUCUNE nouvelle dépendance core)
export interface ChannelBaseOptions {
  // ...membres existants aujourd'hui : router?: SessionRouter; proxy?: string
  /** Lit la mémoire distillée de ce canal ; null si aucune pour l'instant. Injecté par la couche CLI. */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** Ajoute/remplace la mémoire de ce canal. Injecté par la couche CLI. */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**Qui les construit et les injecte :** `packages/cli/src/commands/channel/start.ts` (qui dépend de core). Quand `start.ts` construit le sac d'options pour chaque adaptateur, il capture (closure) le `writeWorkspaceContextFile` de core / le helper de lecture et résout le `(channelName, chatId)` approuvé par le serveur depuis `router.getTarget(sessionId)` (`SessionRouter.ts:94`) — l'adaptateur ne fournit jamais le `chatId` depuis le réseau :

```ts
// packages/cli/src/commands/channel/start.ts — couche CLI (PEUT dépendre de core)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config & bridge sont des arguments positionnels de createChannel(name, config, bridge, baseOpts) — pas des membres du sac
  readChannelMemory: (target) =>
    readChannelContextFile({
      channelKey: { channelName: target.channelName, chatId: target.chatId },
    }),
  writeChannelMemory: (target, content, mode) =>
    writeWorkspaceContextFile({
      scope: 'channel',
      channelKey: { channelName: target.channelName, chatId: target.chatId },
      mode,
      content,
      projectRoot: config.cwd, // projectRoot inutilisé pour le scope channel mais requis par l'interface
    }),
};
// l'adaptateur est créé positionnellement avec le sac en dernier : plugin.createChannel(name, config, bridge, baseOpts)
```

L'adaptateur ne touche jamais au système de fichiers et `channel-base` ne gagne aucune nouvelle dépendance. (Alternative démon Phase 2 : une route scopée `POST /channel/:sessionId/memory` qui résout `channelKey` côté serveur ; elle ne peut pas réutiliser `POST /workspace/memory`, qui valide strictement `scope ∈ {workspace, global}` et transmet un `projectRoot` fixe, `:118-125,185-190`. À reporter jusqu'à ce que le moteur proactif ait déjà besoin de lookups `sessionId → target` côté démon.)

**Fan-out d'événements.** `publishWorkspaceEvent` se trouve sur le `AcpSessionBridge` **côté démon** (`bridge.ts:3610`), pas côté canal. Sous `AcpBridge` (Phase 0), il n'y a **pas** d'événement `memory_changed` (et aucun n'est nécessaire — un seul processus possède l'écriture et la lecture). Sous la topologie démon, `publishWorkspaceEvent` diffuse vers **tous** les bus de session actifs sans distinction (`bridge.ts:3649-3675`) ; `BridgeEvent.data` est de forme libre (`eventBus.ts:51`) donc un événement `memory_changed` _peut_ porter `{ scope:'channel', channelName, chatId }`, mais un **filtrage côté abonné** est requis — l'éditeur ne peut pas scopér la livraison.

#### Chemin de lecture (mémoire → prompt) — bootstrap une fois par session réutilisant `instructedSessions`

Étendre le bloc `instructions` une fois par session (`ChannelBase.ts:343-347`, conditionné par `instructedSessions`) : au premier message d'une session dont la cible a `(channelName, chatId)`, appeler le `readChannelMemory(target)` injecté et préfixer son résultat à côté de `config.instructions`, puis marquer la session dans `instructedSessions` exactement comme aujourd'hui. Parce que le scope `'thread'` partage un seul `sessionId`, cela charge la mémoire **une fois par durée de vie de la session** (la même porte qui empêche déjà de réinjecter `config.instructions`). Aucune dépendance core n'est ajoutée — la lecture passe par le callback injecté. La mémoire du canal n'est **jamais** sur le chemin de découverte hiérarchique ; elle est injectée par session via ce hook.

```ts
// ChannelBase.handleInbound() — bootstrap au premier tour (réutilise instructedSessions)
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target depuis router.getTarget(sessionId)
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### Relation avec la persistance/restauration de SessionRouter et la transcription

| Couche | Persiste | Durée de vie | Propriétaire |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Transcription de session | Tours de conversation ACP | Jusqu'au nettoyage / `/clear confirm` / redémarrage | `Session` (l'agent) |
| Persistance `SessionRouter` | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | À travers le redémarrage du bridge, via `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Mémoire du canal (nouveau)** | Faits durables distillés sur le groupe | Indéfinie | `~/.qwen/channels/memory/` |

Quand `restoreSessions()` échoue à recharger une session (`:196`), la transcription est perdue mais le `QWEN.md` du groupe est intact — la lecture de bootstrap réhydrate la connaissance de l'agent au message suivant. **La mémoire du canal est le plancher de récupération pour la transcription.** "L'apprentissage au fil du temps" est une boucle de _distillation_, pas de la persistance brute de la transcription : l'agent (ou une tâche déclenchée) résume périodiquement les faits saillants dans le `QWEN.md` du groupe en mode append.

#### Isolation, taille et phases

L'isolation se maintient au niveau du chemin (`sales` et `eng` résolvent vers différents répertoires/fichiers/mutex `hash(chatId)`) tant que le chemin d'écriture porte toujours le `chatId` approuvé par le serveur. C'est une isolation de **contenu**, pas une limite d'authentification (le processus a toujours un seul token global, pas d'identité par utilisateur). Pour une isolation stricte des tenants, exécuter un processus par workspace/tenant (OD-2).

Garde-fous de taille (réutiliser la mécanique existante) : la limite de 16 Mo pour les fichiers existants en append est héritée gratuitement (mapper `WorkspaceMemoryFileTooLargeError` à un "la mémoire du groupe est pleine, exécutez une passe de compaction" visible par l'utilisateur) ; une route Phase 2 réutilise la limite de 1 Mo par écriture (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`) ; la compaction en mode replace (`writeContextFile.ts:202-211`) est la réponse à long terme à la croissance illimitée.

- **Phase 0/1 :** ajouter le scope `channel` + `channelKey` à `writeContextFile.ts` ; livrer `~/.qwen/channels/memory/` + `meta.json` ; câbler les callbacks `readChannelMemory`/`writeChannelMemory` de la couche CLI via `ChannelBaseOptions` et la lecture de bootstrap ci-dessus. Pas de nouvelle route HTTP, pas de dépendance `channel-base → core`.
- **Phase 2 :** ajouter la route scopée `POST /channel/:sessionId/memory` (topologie démon) et `memory_changed` avec filtrage côté abonné ; ajouter un déclencheur de distillation et une CLI `qwen channel memory <name> <chatId>`. **Contrainte de distillation :** le cron est scopé à la session et meurt lors de `dispose()` (`Session.ts:791,799-803,1056`) ; la distillation doit se déclencher pendant qu'une session est active — à la fin d'un tour, sur un `/remember` explicite, ou sur une session maintenue chaude — jamais depuis un planificateur d'arrière-plan indépendant.
### 6.4 Gouvernance : Budgets de tokens et journal d'audit (Zone de build 4)

Un agent résidant dans un canal, que n'importe quel membre peut piloter — et qui peut agir de manière proactive — a besoin de limites de dépenses, d'une piste d'audit enregistrant _qui_ a demandé _quoi_, et d'une isolation par identité. qwen-code fournit trois des quatre primitives : `rate-limit.ts` (token buckets par clé), l'anneau `permission-audit.ts`, et `MultiClientPermissionMediator`. Cette zone les compose et comble les lacunes (pas de budget de coûts nulle part ; aucune ligne d'audit ne porte d'expéditeur humain). Principe directeur : **rejeter, ne pas tronquer** — mais, selon le Fix #6, un budget _estimé_ ne rejette jamais de manière stricte un prompt utilisateur ; il émet seulement un WARN.

#### Quel processus assure la gouvernance ?

| Déploiement                                          | Bridge                                                  | Quelle mécanique de `serve/` est disponible                                                            |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 — `qwen channel start` / `AcpBridge`**    | lance son propre processus enfant stdio `--acp` (`start.ts:213,356`) | **Aucune.** Pas de serveur Express, pas de `rate-limit.ts`, pas de routes HTTP, pas d'anneau `permission-audit.ts`. |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | canaux hébergés dans le daemon                           | Tout `serve/` : utilisation réelle, médiateur, rate-limit, anneau d'audit, routes.                          |

Résolution : **l'admission de budget + le rejet résident dans `@qwen-code/channel-base`** (le point de contrôle commun `ChannelBase.handleInbound()`), dans un nouveau **`packages/channels/base/src/BudgetLedger.ts`** — _pas_ `serve/budget.ts`, car le processus de canal de la Phase 0 ne charge jamais `serve/`, et la couche de canal est le seul endroit disposant du contexte d'expéditeur humain. **L'audit + l'attribution** trouvent également leur origine dans la couche de canal. Sur le chemin du daemon de la Phase 1+, le registre lit l'utilisation réelle et est _de plus_ exposé via une route ; sur le chemin de la Phase 0, il estime et est exposé via une commande de canal (`/audit`).

#### Où la gouvernance s'attache aujourd'hui (et les lacunes)

| Préoccupation                     | Mécanisme existant                                                                                                                                                    | Lacune                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Limitation du débit des requêtes     | token buckets par `(clientId\|ip)`, 3 niveaux (`rate-limit.ts`)                                                                                                         | Pas de tokens/coûts, seulement le nombre de requêtes ; `serve/` uniquement                                |
| Journal des décisions après coup | anneau FIFO borné, 5 types d'enregistrements (`permission-audit.ts`)                                                                                                             | Pas de `senderId` humain, seulement `clientId` ; pas de route GET ; anneau détenu par fermeture (`:17-25`) |
| Approbation réelle par action    | quatre politiques + quorum de consensus (`permissionMediator.ts:621-637`)                                                                                                    | Votes attribués au `clientId`, pas à l'humain ; un canal = un client          |
| Portée des outils/données par canal | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`) ; `getPermissionsAllow()` (`:3158`) ; `getPermissionsDeny()` (`:3182`) ; filtre d'autorisation MCP (`:3327-3333`) | La portée est par `Config`/processus ; pas de chemin d'argument de spawn vers l'enfant `--acp`          |

Deux faits structurels : (1) **le daemon n'a pas d'identité humaine** (`BridgeEvent.originatorClientId`, chaque `PermissionVote.clientId` sont des identifiants de transport ; `senderName` ne survit que jusqu'à `SenderGate.check()`), donc toute corrélation humain↦`clientId`↦`sessionId` doit être établie à la limite du canal ; (2) **l'authentification et le rate-limit sont globaux au daemon** (jeton bearer unique `auth.ts:259-266` ; rate-limit avec pour clé `(clientId, ip)`), donc la gouvernance par canal doit trouver son origine dans l'adaptateur.

#### Budgets de tokens et de coûts — un nouveau `BudgetLedger`, consultatif jusqu'à ce qu'une utilisation réelle existe (Fix #6)

**D'où vient l'utilisation — mise en garde (OD-9).** Un budget de tokens ne peut débiter des chiffres _réels_ qu'une fois que le modèle signale l'utilisation. En session, `Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) stocke `usageMetadata.promptTokenCount` dans `lastPromptTokenCount`, **écrasé à chaque tour** — _pas_ un compteur de facturation cumulatif. Sur le chemin `AcpBridge` de la Phase 0, le flux ACP `session/update` ne transporte pas de `usageMetadata`, donc **la v1 ne peut pas débiter de comptes de tokens réels** à cet endroit. Sur le chemin du daemon de la Phase 1+, le daemon observe l'utilisation en processus et _peut_ débiter de manière précise.

**Règle d'application (Fix #6 — fondamental) :**

- **Les budgets estimés sont uniquement CONSULTATIFS.** Lorsque le seul chiffre disponible est une estimation côté canal (nombre de caractères prompt+réponse ÷ une constante de caractères par token), le registre **WARN/alerte** aux seuils et peut attacher un avertissement à la réponse — il **ne rejette jamais de manière stricte un prompt utilisateur**. Une estimation faux-positif ne doit pas faire taire une véritable demande utilisateur.
- **Rejet STRICT uniquement sur des chiffres réels.** Un budget peut _rejeter_ un prompt (rejeter-et-ne-pas-tronquer) **uniquement** lorsque la source de débit est le chemin d'utilisation réel du daemon (daemon hébergé en Phase 1+). Jusqu'à là, le budget est de l'observabilité + de l'alerte, pas une barrière.

Cela rend le budget de la v1 honnête : il avertit tôt partout, et applique des limites strictes exactement là où les chiffres sont fiables.

**Module `BudgetLedger.ts`**, modélisé sur `rate-limit.ts` (factory, Map-of-buckets avec GC, overflow fail-open) :

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × per-model rate
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => advisory; 'daemon' => may hard-decline
export interface BudgetLedger {
  // allowed=false only when source==='daemon'; estimates return allowed=true + warn flags
  admit(key: string): {
    allowed: boolean;
    spent: number;
    limit: number;
    advisory: boolean;
  };
  debit(
    key: string,
    amount: number,
    unit: BudgetUnit,
    source: UsageSource,
  ): void; // fires threshold alerts
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **Sémantique d'héritage par défaut + rollup org strict-gagne (OD-9).** `admit(key)` résout la fenêtre effective avec le fallback de style `GroupGate` `channel → '*' → built-in`. Un prompt doit passer **à la fois** la fenêtre par canal et le **rollup "org" par processus** (strict-gagne, débiter les deux). "org" = _le rollup de ce processus unique_ ; un vrai plafond org multi-processus nécessite un store partagé (hors scope). **Fenêtre quotidienne fixe.**
- **Alertes 75 %/95 %.** `debit()` déclenche `onAlert` une fois par seuil et par fenêtre, en utilisant l'idiome d'hystérésis de l'event-bus (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`). **Poster l'alerte est un envoi proactif** — une dépendance forte à la Zone de build 2 (mise en garde sur les groupes froids DingTalk ; Feishu poste librement). Dégradation vers "attacher l'avertissement à la prochaine réponse" lorsqu'aucun canal proactif n'existe.
- **Rejeter-et-ne-pas-tronquer (uniquement quand `source==='daemon'`).** Vérifié à l'admission, _avant_ `bridge.prompt()` (`:425`). Sur une utilisation réelle `!allowed`, l'adaptateur appelle `sendMessage(chatId, refusal)` et retourne — il **n'entre pas** dans le chemin steer/cancel, donc un prompt en cours se termine et le _suivant_ est rejeté. Sur une estimation, `allowed` est toujours vrai (consultatif).
- **Coût (`usd`)** multiplie les tokens par une table de taux par modèle fournie par l'opérateur (qwen-code est multi-modèle ; pas de prix unique). Entrée manquante → repli vers `tokens` + avertissement unique.
- **Config.** `ChannelConfig` (`types.ts:27-51`) gagne `budget?: { unit; limit; windowMs; reset? }`, analysé par `parseChannelConfig`. Sur le chemin du daemon, `ServeOptions` gagne `--budget-org-daily`/`--budget-unit`, et `daemon-status.ts` (qui rapporte déjà `rateLimit`, `:295-297`) gagne un bloc `budget` parallèle.

#### Journal d'audit — `senderId` humain transporté avec le tour (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`, FIFO 512) est le bon substrat, mais chaque ligne est indexée par `clientId`. **Conception — une liaison expéditeur↦tour côté canal** (`RequestAttributionRing.ts`, même forme FIFO).

**La jointure naïve par timestamp est fausse sous `followup` (Fix #7).** La v1 proposait de joindre une ligne de permission à "la ligne d'attribution la plus récente pour ce `sessionId` dont le `recordedAtMs` précède le `issuedAtMs` de la permission." Sous `followup`, plusieurs expéditeurs font la file d'attente sur **un** `sessionId` via `sessionQueues` ; l'expéditeur le plus récemment _mis en file d'attente_ n'est fréquemment **pas** celui dont le tour est en cours d'_exécution_ lorsque l'appel d'outil/la permission se déclenche. La jointure par timestamp attribue donc systématiquement de manière erronée.

**Correctif : transporter le `senderId` AVEC le prompt mis en file d'attente.** Lorsque `handleInbound()` met en file d'attente sur `sessionQueues` (et lorsque le planificateur met en file d'attente un déclenchement proactif), l'élément de la file / le contexte de tour synthétique transporte son propre `{ senderId, senderName, requestSeq }`. L'attribution pour tout appel d'outil/permission soulevé pendant un tour est lue depuis **le tour en cours d'exécution** (la tête de la FIFO), et non depuis un scan par timestamp. Concrètement : la chaîne `sessionQueues` estampille un `currentTurnAttribution.set(sessionId, {senderId, ...})` par tour au moment où l'exécution atteint la tête (juste avant `bridge.prompt()`), et l'efface lorsque l'exécution se résout ; les lignes d'audit lisent cette map. Les déclenchements proactifs estampillent `createdBy` de la même manière (§6.2 étape 3). C'est exact pour le tour en cours d'exécution et immunisé contre l'ordre de mise en file d'attente.

Ajouter un sixième type de ligne **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** à l'admission, afin que l'audit réponde à "qui a démarré cette tâche" même pour un travail en lecture seule. L'union `PermissionAuditEntry` (`:57-104`) est **fermée** et les consommateurs switchent sur `kind`, donc l'élargir (ou ajouter un anneau frère) touche chaque consommateur.

**Chemin de requête.** Daemon Phase 1+ : ajouter `GET /workspace/audit` (bearer + `createMutationGate` strict, `auth.ts:356`), exposant l'anneau hors de la fermeture du bridge (la doc d'en-tête du fichier anticipe cela, `:22-25`). `AcpBridge` Phase 0 : une commande de canal `/audit` via `sendMessage`. **Durabilité :** l'anneau contient 512 entrées en mémoire, **perdues au redémarrage** — une limitation connue de la v1 ; le suivi (OD-11) persiste un **audit joint en append-only vers `~/.qwen`**.

**Les votants du consensus ne sont pas des humains.** `votersAtIssue` sont des `clientId` estampillés par le daemon, et un canal = un `clientId`, donc le "consensus" prêt à l'emploi dans un groupe DingTalk est un consensus entre _clients du daemon_. Le vote au niveau humain nécessite un registre d'approbateurs enregistrés mappant `senderId` → un vote distinct — l'exigence OD-3 Phase 2, pas une fonctionnalité résolue.

#### Isolation des outils et des données par identité

1. **Autorisation/refus d'outils par canal.** `Config` supporte `coreTools`/`allowedTools`/`excludeTools` (`:727-729`), exposés via `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()`. (Il n'y a **pas** de `getAllowedTools()`/`getBlockedTools()`.) En Phase 0, le chemin `AcpBridge` lance un enfant par canal, mais `AcpBridgeOptions` ne transporte que `{ cliEntryPath, cwd, model }` (`:17-21`) et `start()` ne transmet que `--acp`+`--model` (`:56-63`). Fournir une portée par canal nécessite de NOUVEAUX champs `AcpBridgeOptions`, de NOUVEAUX flags `--acp` dans `Config`, ainsi que de nouveaux champs `ChannelConfig`. Sur le chemin du daemon de la Phase 1+, il y a une `Config` par daemon, donc la portée est par daemon (par workspace, OD-2) plutôt que par enfant de canal.
2. **Portée MCP par canal.** `Config.getMcpServers()` filtre par `allowedMcpServers` (`:3327-3333`), défini à la construction. Ajouter `allowMcpServers?: string[]` à `ChannelConfig`, intégré dans le même chemin d'arguments de spawn (ou le tableau `mcpServers` que `AcpBridge.newSession()` transmet — codé en dur `[]` à `:133`).
3. **`sessionScope` comme limite de données.** `'thread'` fait qu'un groupe partage un working tree/contexte ; l'isolation inter-_canaux_ est appliquée par des clés de routage dans l'espace de noms `channelName`. Par expéditeur au sein d'un groupe `'thread'` n'est _pas_ isolé par conception.
**Limite assumée :** l'authentification repose sur un unique token global au daemon sans principal par utilisateur, l'isolation se fait donc par **canal** et non par personne. Une véritable isolation des outils par personne nécessite la Phase 3.

#### Chemin d'admission

```
DingTalk entrant
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existant :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NOUVEAU]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (PAS dans steer/cancel)
            ↳ source==='estimate': allowed toujours true → WARN uniquement (Fix #6)
     3. mise en file d'attente dans sessionQueues AVEC {senderId, senderName, requestSeq}  [NOUVEAU — Fix #7]
        + task.requested row
     4. en tête de file FIFO, horodater currentTurnAttribution → bridge.prompt(...)   [existant :425]
            ↳ tool call → permission (auto-approuvé sur AcpBridge Phase 0 ; médiateur sur daemon Phase 1+)
                ↳ la ligne d'audit lit currentTurnAttribution[sessionId]  (le tour EN COURS D'EXÉCUTION)
     5. à la fin : utilisation connue (daemon) ou estimée (AcpBridge) → budget.debit(..., source)  [NOUVEAU]
            ↳ la publication de l'alerte 75%/95% est proactive → dépend du Build Area 2
```

Dépendances strictes à signaler : (1) le débit réel des tokens (et donc le refus strict) nécessite le chemin d'utilisation du daemon de la Phase 1+ — jusqu'à là, les budgets sont indicatifs (Fix #6) ; (2) les alertes de budget proactives nécessitent le Build Area 2 ; (3) le vote de consensus au niveau humain et l'attribution d'audit au niveau humain nécessitent le registre des approbateurs enregistrés OD-3.

### 6.5 Plateforme DingTalk (principale) + suivi Feishu

> **Note de câblage (architecture actée).** Phase 0 : `qwen channel start` construit `AcpBridge` (`start.ts:213,350` ; `AcpBridge.ts:38`), qui lance `node <cli> --acp` et expose `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) ; le scope de session est géré par `SessionRouter`, et non par le bridge. Phase 1+ : les canaux sont hébergés sous `qwen serve` via `DaemonChannelBridge` (ses valeurs par défaut `'thread'` à `:229,240` ; son throw en cas de chevauchement à `:257-261`). La migration est actée, pas optionnelle (§1).

#### Le problème d'expiration du sessionWebhook

Le mode Stream de DingTalk fournit chaque message entrant avec un `sessionWebhook` à courte durée de vie ; l'adaptateur le met en cache avec pour clé `conversationId` (`:84`, rempli dans `onMessage()` `:517`), et `sendMessage()` (`:134-170`) le recherche, journalisant `No webhook for chatId` et retournant silencieusement s'il est absent (`:137-141`). Deux faits fatals pour une utilisation proactive : (1) le webhook **expire** (le type SDK `RobotMessageBase` contient `sessionWebhookExpiredTime`, `constants.d.ts:13`, mais l'interface `DingTalkMessageData` de l'adaptateur l'omet et ne le lit jamais — un webhook en cache peut être obsolète même pendant la fenêtre active) ; (2) la map n'est remplie **que** par le trafic entrant, donc un groupe froid n'a aucune entrée.

#### Push de groupe froid via l'API de message proactif du robot (主动消息) — VÉRIFIÉ (OD-7)

La solution est l'API de message proactif du bot DingTalk — **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _(point de terminaison vérifié haut)_. Contrairement au webhook, il est adressé par un **`openConversationId`** durable _(vérifié haut)_, s'authentifie avec l'en-tête **`x-acs-dingtalk-access-token`** _(vérifié haut — déjà utilisé par `emotionApi()` `:188-207` et `downloadMedia()` `media.ts:36-43`)_, et porte le **`robotCode`** du bot _(vérifié haut ; = `config.clientId`, `:184,435`)_. Le corps est une paire `msgKey`/`msgParam` _(vérifié haut)_ où **`msgParam` est lui-même une chaîne encodée en JSON** (et non un objet imbriqué), par ex. pour `msgKey:'sampleMarkdown'` :

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // id de groupe durable (à partir du conversationId entrant ; convertir si invalide)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<titre de l'aperçu>\",\"text\":\"# hi\\n...markdown ≤ ~5000 caractères\"}",
}
```

Il s'agit d'une **nouvelle méthode aux côtés de `sendMessage()`**, et non d'une modification de celle-ci (esquisse au §6.2). `ChannelBase.sendMessage()` reste abstrait (`:81`) ; le moteur proactif a besoin de la nouvelle interface de sortie `pushProactive?(target, text)` — entièrement nouvelle et la livraison centrale de la plateforme. **`vérifié [haut] selon la doc officielle d'envoi + aliyun ask/559227, ask/585232 + doc sur les types de message`** pour le point de terminaison/les paramètres/la forme de `msgParam`.

**Prérequis de permission :** une permission de robot/message "envoyer un message de chat de groupe proactif" doit être accordée à l'application interne à l'entreprise avant que `groupMessages/send` ne fonctionne (la doc d'envoi liste ce prérequis) _(vérifié haut qu'une permission doit être activée)_. **TOUJOURS SIGNALÉ (faible confiance) :** le nom d'affichage/code exact du point de permission n'est pas figé d'après les docs de cette session — la console DingTalk l'affiche sous la section 权限管理 de l'application comme une permission d'envoi de robot/message (généralement la famille robot-message, par ex. `qyapi_robot_sendmsg` / 企业机器人发送消息权限) ; confirmer dans la console, ne **pas** hard-coder le code. L'adaptateur doit journaliser `resp.status` + le corps en cas de `!resp.ok`/throw — le bloc catch vide actuel de `emotionApi` (`:214-216`) est l'anti-pattern qui masquerait une mauvaise configuration de permission manquante.

#### Acquisition et persistance de l'openConversationId

Deux sources : (1) **récolte depuis l'entrant** — chaque message porte un `conversationId` (`:506`), transmis en tant que `openConversationId` à l'API emotion (`:197`) ; persistez-le dès que nous le voyons. **`vérifié [moyen] selon aliyun ask/559227, ask/585233 + format 'cid' correspondant`** que le `conversationId` du callback (préfixé par cid) est utilisable directement comme `openConversationId` pour le callback standard de groupe @. **TOUJOURS SIGNALÉ :** aucune phrase officielle textuelle ne les équivaut pour un robot non-cool-app ; le chemin d'obtention garanti par la doc est l'**API de conversion `chatId → openConversationId`** (`obtain-group-openconversationid`), ou la capture depuis l'API de création de groupe / le JSAPI `chooseChat`, ou un callback cool-app (qui délivre `openConversationId`+`coolAppCode` directement). **Fallback :** en cas d'`invalid.openConversationId`, convertir via l'API `chatId` et réessayer. (2) **événements bot-ajouté-au-groupe** via `registerAllEventListener` (`client.mjs:58-61`) : les événements circulent de `onEvent → onEventReceived` sous le `topic:'*'` par défaut (`client.mjs:14-19,241-254`), tandis que l'adaptateur n'installe que le _callback_ du robot (`:107`), donc les événements d'org/bot sont actuellement reçus et ignorés dans le no-op par défaut (`client.mjs:35-37`). Le topic de l'événement et le champ `openConversationId` au moment de l'installation sont **non vérifiés** — ne pas hard-coder un nom d'événement.

**Persistance.** Utilisez un store **séparé `~/.qwen/channels/dingtalk-groups.json`**, et non la cible `SessionRouter` : l'ID de groupe doit survivre à n'importe quelle session (le push de groupe froid piloté par cron se déclenche sans session active), et une `PersistedEntry` n'existe qu'une fois qu'une session a été créée pour la clé de routage — coupler l'identité du groupe à la durée de vie de la session laisse les groupes froids non représentés.

#### Le scope multijoueur est opt-in, pas par défaut

Le scope `'thread'` (`:53`) est ce qui donne un agent partagé par groupe, mais `parseChannelConfig()` définit par défaut `sessionScope` à `'user'` (`config-utils.ts:91-92`), ce qui donne des sessions _par membre_. L'opérateur doit définir explicitement `sessionScope: 'thread'`. Une fois défini, deux conséquences multijoueur s'appliquent : (a) le `dispatchMode: 'steer'` par défaut **annule** le travail en cours lorsqu'un membre envoie un message (`:371-379`) — le profil de tag définit `'followup'` (§6.1) ; (b) le manque d'attribution de l'expéditeur (§6.1).

#### Analyse des @ entrants

Le gating de groupe fonctionne : `GroupGate` utilise `envelope.isMentioned`, défini à partir de `data.isInAtList` (`:520`). Le nettoyage du texte supprime uniquement le **premier** `@token` (`:527-529`), de manière positionnelle et non basée sur l'identité — `@qwen @alice` est correct, mais une mention humaine en premier supprimerait celle de l'humain. Un suivi de durcissement supprime par le propre `chatbotUserId` du bot. Le contexte de réponse/citation est extrait (`extractQuotedContext()`, `:272-298`), avec `isReplyToBot` calculé par rapport à `chatbotUserId` (`:280,292`), et `referencedText` injecté sous la forme `[Replying to: "…"]` (`ChannelBase.ts:317-319`). **L'attribution de l'expéditeur est fermée au §6.1** via le préfixe `[senderName]`.

#### Rendu Markdown / carte

`markdown.ts` effectue déjà la normalisation de plateforme que le chemin proactif réutilise : transit des tableaux markdown, découpage en chunks à 3800 caractères avec équilibrage des fences (`splitChunks()` ; `CHUNK_LIMIT=3800`), et extraction du titre découpé à 20 caractères avec fallback `'Reply'` (`extractTitle()`). La réutilisation est **conditionnelle** au fait que le template `sampleMarkdown` accepte le même sous-ensemble markdown et un corps jusqu'à **~5000 caractères** _(vérifié haut — doc sur les types de message)_ ; gardez `CHUNK_LIMIT` ≤ ce budget. Les cartes interactives en streaming (le chemin `TOPIC_CARD`, `constants.d.ts:4`) — l'analogue de la carte en streaming de Feishu — sont **hors scope** pour le jalon principal ; le proactif v1 est basé sur des messages markdown.

#### Suivi Feishu (concis)

Feishu est en avance sur exactement l'axe qui compte : **l'envoi proactif est natif** (`sendMessage(chatId, text)` vers n'importe quel `chat_id`, `:622-676` — pas de problème de groupe froid ; `canColdSend = true`), **`tenant_access_token` stable** avec un rafraîchissement suivant l'expiration (`refreshToken()`, `:581-620` — le travail dont DingTalk a encore besoin), **abonnement aux événements flexible** (WebSocket ou webhook HMAC, `:146-176`), et **cartes en streaming de première classe** (`markdown.ts`, `:742-792`). **Mais les problèmes partagés de `ChannelBase`/`SessionRouter` — scope `'thread'` en opt-in, annulation de `dispatchMode`, attribution de l'expéditeur manquante, la nouvelle interface de sortie — s'appliquent identiquement à Feishu.** Feishu résout _l'accessibilité_, pas _qui-a-dit-quoi_ ni _un-membre-annule-un-autre_. Le portage du moteur proactif vers Feishu réutilise directement le `sendMessage()` existant (le `pushProactive` de base par défaut) ; le seul nouveau travail sur la plateforme consiste à mapper le groupe cible du moteur sur un `chat_id` persisté et à optionnellement router via le chemin de la carte en streaming.

---

## 7. Déploiement progressif (Phase 0–2) et MVP

Chaque phase est fusionnable indépendamment, se termine par une version démontrable, et est conditionnée par des critères d'acceptation explicites. La **Phase 0** fait se comporter la stack existante comme un agent résident partagé — configuration plus quelques petits changements de code, sur `AcpBridge`. La **Phase 1** migre l'hébergement des canaux dans `qwen serve` (architecture actée) et ajoute le moteur proactif ainsi que la boucle fermée unique du MVP. La **Phase 2** ajoute la mémoire de canal, les budgets et l'audit.

### Topologie : migration du daemon actée (anciennement OD-1)

La décision est **prise**, pas en attente : la Phase 0 est livrée sur `AcpBridge` ; **la Phase 1+ exécute les canaux sous `qwen serve`** (via `DaemonChannelBridge` ou un runner de canal daemon), car la persistance de la mémoire par salle, le médiateur de permissions, l'audit de l'event-bus, la `promptQueue` FIFO et les routes de requêtes de budget/audit veulent tous le daemon. Le scheduler appartenant à la gateway (§6.2) est **neutre à la migration** — il sérialise via `ChannelBase.sessionQueues` quel que soit le bridge — il est donc livré en Phase 1 et n'est pas affecté par le basculement. **Le câblage de la Phase 0 ajoute le chemin d'attachement `DaemonChannelBridge` (ou un flag `--daemon <url>`)** afin que la migration soit une étape de configuration à la limite de la Phase 1, et non une réécriture. Notez le bord tranchant autour duquel le scheduler est conçu : `DaemonChannelBridge.prompt()` ne met **pas** en file d'attente — il _lève_ `Prompt already in flight` en cas de chevauchement (`:257-261`) ; la `promptQueue` FIFO du daemon est côté acp-bridge (`bridge.ts:2855,3082`) ; la sérialisation côté canal est `ChannelBase.sessionQueues` (`:394`), ce qui explique pourquoi le moteur proactif n'appelle jamais `prompt()` pendant qu'un tour est actif (§6.2, Fix #1).

### Phase 0 — Configuration + Injection d'identité (sur `AcpBridge`)

**Objectif.** Un groupe DingTalk où n'importe quel membre `@`-mentionne le bot, chaque membre partage une seule session, l'agent sait qui parle, et une tâche en cours n'est pas détruite par le suivi d'un coéquipier.

**0.1 — Le profil de configuration "qwen tag"** (principalement `settings.json`) :

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multijoueur : TOUT le groupe partage UN SEUL sessionId. routingKey → `${name}:${threadId||chatId}` (:53).
    // DingTalk ne définit AUCUN threadId (:541-551) → la clé retombe sur chatId = conversationId||sessionWebhook (:534).
    // Un message sans conversationId aurait pour clé le webhook TRANSITOIRE — à traiter comme une erreur fatale.
    "sessionScope": "thread",

    // groupPolicy a pour valeur par défaut "disabled" (GroupGate :13 ; config-utils :98) — DOIT être défini sinon tous les msgs de groupe sont ignorés.
    // En mode allowlist, "*" N'EST PAS un wildcard d'appartenance (GroupGate :42) ; listez chaque chatId. "*" fournit uniquement les VALEURS PAR DÉFAUT.
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "Vous êtes l'agent d'ingénierie partagé de l'équipe dans ce groupe DingTalk...",
  },
}
```
Notes liées à la vérité terrain : `requireMention` a pour valeur par défaut `true` (`GroupGate.ts:49`) ; `sessionScope` a pour valeur par défaut `'user'` (`config-utils.ts:92`) — `'thread'` constitue l'ensemble du mécanisme multijoueur ; la valeur par défaut du groupe pour `dispatchMode` doit être `'followup'` (et non `'steer'` au runtime, `:354`).

**0.2 — Attribution de l'expéditeur.** Le préfixe `[senderName]` à la racine de `promptText` (`ChannelBase.ts:316`), conditionné par `isGroup`, **se déclenche à chaque tour** (non conditionné par `instructedSessions`), avec le **nouveau flag `Envelope.alreadyPrefixed`** qui protège la réentrée de `collect`. Voir §6.1.

**0.3 — Réconciliation de `dispatchMode`.** Définir explicitement le `dispatchMode` par groupe ; corriger le JSDoc obsolète de `types.ts:42` (`'collect'` → `'steer'`) afin que le code et le commentaire correspondent (OD-5).

**Fichiers modifiés (Phase 0).** `start.ts` (ajout du chemin d'attachement optionnel `DaemonChannelBridge` pour que la migration engagée de la Phase 1 soit à un flag près) ; `ChannelBase.ts` (racine `senderName` + protection `alreadyPrefixed` + confirmation `/clear` + porte d'allowlist + `/who`) ; `types.ts` (nouveau champ `Envelope.alreadyPrefixed` + correction JSDoc) ; `docs/` (la recette + les pièges à éviter).

**Critères d'acceptation.**

- [ ] Deux membres `@`-mentionnent le bot ; les deux résolvent vers le **même** `sessionId` (assertion via les maps de `SessionRouter`) ; la clé de routage est `team-eng:<conversationId>`, et non une URL de webhook.
- [ ] L'agent utilise l'attribution de l'expéditeur (`[senderName]` présent pour les groupes, absent pour le 1:1) ; la réentrée de `collect` ne double pas le préfixe (assertion du chemin `alreadyPrefixed`).
- [ ] Un message de groupe sans mention est ignoré (raison `mention_required`) ; un groupe non autorisé est ignoré (`not_allowlisted`).
- [ ] Avec `dispatchMode: 'followup'`, le message du membre B pendant la tâche du membre A n'annule pas A ; le message de B s'exécute après A.
- [ ] Dans un groupe partagé (thread), `/clear` nécessite `confirm` et est restreint à `config.allowedUsers` lorsqu'il est défini (pas de réinitialisation libre) ; `/status` reste en lecture seule.
- [ ] Tests unitaires au niveau des hooks (pas de tests UI avec `wait(ms)`) : égalité des clés de routage entre les expéditeurs ; présence du préfixe promptText pour `isGroup` true vs false ; saut de `alreadyPrefixed`.

### Phase 1 — Migration du Daemon + Moteur Proactif + la Boucle Fermée du MVP

**Définition du MVP.** Une **boucle fermée unique de digest planifié** : un opérateur enregistre une tâche de type cron pour un canal ; au déclenchement, la passerelle résout la session du canal limitée au thread, exécute un prompt avec des outils, et **publie le résultat dans le canal froid de manière non sollicitée**. Une tâche, un canal, un chemin de livraison. Les comportements plus riches sont hors du périmètre du MVP.

**Migration engagée.** La Phase 1 héberge les canaux sous `qwen serve` via `DaemonChannelBridge` (décision OD-1), héritant de la `promptQueue` FIFO, du médiateur, de l'eventBus et des routes. Le moteur proactif est décrit en §6.2 (planificateur détenu par la passerelle, neutre vis-à-vis de la migration ; `dispatchProactive` sérialisé via `sessionQueues` ; fallback d'envoi à froid DingTalk via l'API vérifiée `groupMessages/send` ; rafraîchissement du `tokenManager` ; flag de capacité `canColdSend`). Trois faits rendent cela non trivial : aujourd'hui, cron est limité à la session et meurt lors du dispose (fermé par la porte de propriétaire unique OD-8) ; DingTalk ne peut pas envoyer de message à un groupe froid (fermé par l'API proactive vérifiée + `openConversationId` persisté) ; et le prompt proactif doit être sérialisé via `sessionQueues` et ne doit **jamais** appeler `bridge.prompt()` pendant que `activePrompts` est détenu — sinon `DaemonChannelBridge` lève `Prompt already in flight` (`:257-261`).

**Packages modifiés.** `ChannelCronStore.ts`/`ChannelCronScheduler.ts` (nouveau, channel-base) ; `cronParser.ts` (réutilisation) ; `ChannelBase.ts` (`dispatchProactive`, `pushProactive`, flag `canColdSend`, `/schedule`) ; `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts` (nouvel envoi à froid + `openConversationId` persisté + `tokenManager`) ; `FeishuAdapter.ts` (aucun changement ; adaptateur de référence capable de proactivité, `canColdSend = true`) ; `start.ts` (hébergement sous le daemon ; construction + démarrage du planificateur après `restoreSessions()` ; intégration de `isTagSession` dans la construction de la session pour que le cron en session soit désactivé — OD-8) ; construction de session (sauter `startCronScheduler()` pour les sessions tag, `Session.ts:667-668`).

**Critères d'acceptation.**

- [ ] Les canaux s'exécutent sous `qwen serve` (hébergés par le daemon) ; un appel d'outil fait surface une `permission_request` (médiateur accessible), confirmant la migration.
- [ ] Un opérateur enregistre une tâche de digest ; elle persiste après un redémarrage de la passerelle (rechargée depuis `~/.qwen/channels/cron.json`).
- [ ] Lorsque la tâche se déclenche avec **aucune session ouverte**, la passerelle résout la session limitée au thread, exécute le prompt avec des outils, et livre le résultat dans le groupe DingTalk inactif via le chemin d'envoi à froid — prouvant ainsi la livraison vers un groupe froid. Le moteur **échoue bruyamment** (logs, enregistre `lastError`, ne fait pas de no-op silencieux) si `canColdSend = false`.
- [ ] La même tâche livre sur Feishu via `tenant_access_token`, prouvant l'abstraction `canColdSend`.
- [ ] Une tâche qui se déclenche ne viole pas la règle d'un prompt par session : si un membre est en pleine conversation, le prompt proactif est mis en file d'attente derrière via `sessionQueues` (await `activePrompts.get(sessionId)?.done`), n'annule jamais via `steer`, et ne déclenche jamais l'exception de chevauchement de `DaemonChannelBridge`.
- [ ] Un tour proactif n'est pas annulable par un tour humain ultérieur (les groupes tag sont en `followup`, jamais en `steer`).
- [ ] Le `tokenManager` rafraîchit le `accessToken` v1.0 avant l'expiration d'environ 2 h et sur 401, de sorte qu'un envoi après que le socket est ouvert depuis > 2 h réussit toujours.
- [ ] Pas de double déclenchement pour aucune tâche durable : le planificateur de la passerelle est le seul propriétaire ; une session tag n'arme pas son cron en session (OD-8) ; les deux stores sont sur des chemins disjoints.
- [ ] La suppression de la tâche arrête les déclenchements futurs.
- [ ] Tests au niveau des hooks/services (planificateur face à une fausse horloge ; envoi à froid face à un client HTTP mocké) — pas de `wait(ms)`.

### Phase 2 — Mémoire de Canal + Budgets de Tokens + Journal d'Audit

**2.1 — Mémoire à l'échelle du canal** (§6.3) : ajouter le scope `'channel'` + `channelKey` à `writeContextFile.ts` (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`) ; livrer `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` ; câbler les callbacks `readChannelMemory`/`writeChannelMemory` de la couche CLI via `ChannelBaseOptions` + bootstrap de lecture en réutilisant `instructedSessions`. Route daemon de la Phase 2 `POST /channel/:sessionId/memory` uniquement sous la topologie daemon.

**2.2 — Budgets de tokens par canal** (§6.4) : `BudgetLedger.ts` indexé par canal, **consultatif (WARN uniquement) sur l'estimation côté canal, refus strict uniquement sur l'utilisation réelle du daemon** (Fix #6/OD-9) ; agrégation org par processus + fenêtres par canal, le plus strict l'emporte, fenêtre quotidienne fixe ; alertes à 75 %/95 % (dépendance de l'envoi proactif).

**2.3 — Journal d'audit** (§6.4) : `RequestAttributionRing` + ligne `task.requested` ; **attribution portée avec le tour en cours d'exécution (`currentTurnAttribution` par tour), et non une jointure par timestamp** (Fix #7) ; commande `GET /workspace/audit` (daemon) ou `/audit` du canal. FIFO en mémoire de 512, perdu au redémarrage (limitation v1 connue ; suivi en ajout uniquement dans `~/.qwen`, OD-11).

**Fichiers modifiés.** `writeContextFile.ts`, `workspace-memory.ts` (validation de scope + GET walker, chemin daemon) ; `BudgetLedger.ts`, `RequestAttributionRing.ts` (channel-base) ; `permission-audit.ts` (source du pattern) / nouveau `channel-audit.ts` (daemon) ; `ChannelBase.ts` (portage de `senderId`/`senderName` sur les tours en file d'attente + `currentTurnAttribution` ; hooks de budget) ; `server.ts` (montage des routes après `express.json` `:2025`, porte des mutations avec `mutate({ strict: true })`).

**Critères d'acceptation.**

- [ ] `scope: 'channel'` écrit dans `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md` ; deux groupes obtiennent des fichiers **indépendants** ; le `QWEN.md` de l'espace de travail partagé est intact ; l'écriture passe par le callback injecté (pas de dépendance `channel-base → core`).
- [ ] L'ajout à la mémoire du canal est idempotent sous concurrence (mutex par fichier) et émet `memory_changed` uniquement lors d'une mutation réelle (chemin daemon ; filtrage côté abonné).
- [ ] Sur le chemin **daemon**, après qu'un canal dépasse sa limite de fenêtre d'utilisation réelle, le prochain prompt entrant est refusé (et non tronqué) et les tâches proactives sont mises en pause ; les compteurs sont réinitialisés au roulement de la fenêtre quotidienne ; les budgets sont indépendants par canal. Sur un chemin **estimation uniquement**, le budget émet un WARN mais ne refuse jamais strictement (Fix #6).
- [ ] Un appel d'outil/permission levé pendant que le tour en file d'attente de l'expéditeur A s'exécute est attribué à **A**, même si B a été mis en file d'attente plus tard sous `followup` (Fix #7).
- [ ] Chaque déclenchement proactif, écriture de mémoire de canal et événement de budget atterrit dans l'anneau d'audit avec un `senderId`/`senderName` au meilleur effort, lisible via la surface d'audit, et **non** diffusé sur le bus SSE.
- [ ] Tests unitaires d'anneau/route/résolveur (éviction FIFO, résolution de chemin de scope, mathématiques de seuil de budget, attribution du tour en cours d'exécution) — pas de tests UI/timing.

### Limite de phase et perspective

Les phases 0→1→2 sont additives : multijoueur + identité (sur `AcpBridge`) → migration du daemon + MVP proactif → mémoire + budgets + audit. La **passerelle multi-identité de la Phase 3** (identités/identifiants de bot distincts par canal, véritables principaux par utilisateur, tokens par canal) est _hors périmètre_, c'est la prochaine étape naturelle qui lève les contraintes de token global unique / un espace de travail par daemon. Même au sein des phases 0 à 2, "qwen tag" nécessite **un processus agent par espace de travail** (OD-2) ; un déploiement servant plusieurs dépôts exécute plusieurs processus.

---

## 8. qwen tag vs Claude Tag (compromis)

Claude Tag est un agent hébergé et multi-tenant : Anthropic opère le runtime, l'identité et la mesure par utilisateur ; l'application de canal est un client léger. `qwen tag` est l'inverse — il s'exécute sur une infrastructure contrôlée par l'opérateur au-dessus des adaptateurs de qwen-code. Cette inversion est toute la proposition de valeur et toute la surface de risque.

### Où qwen l'emporte

- **Open / auto-hébergé, les données restent en interne.** L'agent s'exécute localement — via stdio dans la Phase 0 (`AcpBridge.start()` exécute `node <cli> --acp`), en processus sous `qwen serve` à partir de la Phase 1 — jamais via une API de fournisseur. Le contenu des dépôts, le trafic des modèles et les transcriptions restent sur les hôtes de l'opérateur. Claude Tag ne peut pas prétendre à cela.
- **MCP / n'importe quel outil.** Sur-ensemble strict de la surface d'outils d'un agent hébergé fermé.
- **Vote de permission par action — _une capacité de la Phase 1+ une fois hébergé par le daemon_.** qwen-code fournit `MultiClientPermissionMediator` (quatre politiques, quorum de consensus `floor(M/2)+1`, anneau d'audit séparé). Véritablement un différenciateur — **inaccessible sur le chemin `AcpBridge` de la Phase 0** (`requestPermission` auto-approuve, `:108-118`), accessible une fois que la Phase 1 héberge les canaux dans le daemon ; même là, les votes sont indexés par `clientId` et un canal est un _seul_ client jusqu'à ce que le registre OD-3 arrive. Le champ mort `ChannelConfig.approvalMode` (`types.ts:36`) confirme que c'était prévu mais absent.
- **État durable et inspectable.** Persistance de `SessionRouter`, fichiers `QWEN.md`/`AGENTS.md` en texte clair, et (daemon, Phase 1+) un anneau de relecture Last-Event-ID. Rien d'opaque.

### Où il diverge et doit compenser

1. **Espace de travail unique + token global unique + pas d'identité humaine.** Un processus lie un espace de travail ; multi-espaces de travail = N processus (OD-2). Le token global unique s'applique au _daemon HTTP_ ; le chemin de canal `AcpBridge` de la Phase 0 n'a pas de surface HTTP et pas de token (sa limite est `SenderGate`/`GroupGate`). Pas d'identité humaine nulle part — `senderName` est uniquement du texte de prompt à titre indicatif (OD-11). _Compensation :_ un processus par espace de travail/équipe ; injecter l'attribution de l'expéditeur au niveau de la couche canal ; garder `clientId` comme limite de sécurité ; exiger `--require-auth` + token sur tout daemon non-loopback (OD-12).
2. **Messagerie proactive / canal froid non uniforme.** Réponse réactive uniquement sur DingTalk (`sessionWebhook` expirant) ; Feishu envoie librement via `tenant_access_token`. _Compensation :_ envoi de groupe proactif vérifié de la Phase 1 sur `openConversationId` persisté (DingTalk, `canColdSend` passe à true) ; Feishu n'en a pas besoin.
3. **Le planificateur est limité à la session, pas au daemon.** Cron meurt sur `dispose()` lors du ramassage des inactifs à 30 min. _Compensation :_ planificateur détenu par la passerelle (§6.2) — longue durée de vie, survit au ramassage, seul propriétaire du cron (OD-8).
4. **La mémoire est globale à l'espace de travail, pas par canal.** _Compensation :_ un processus par canal (zéro code) ou le scope `channel` de la Phase 2 (OD-10).
5. **Multi-identité / vrai multi-tenant hors périmètre** (Phase 3). Modélisé comme multi-processus dans les phases 0 à 2.
### Risques et mesures d'atténuation

| #   | Risque                                                                                                                                               | Sévérité | Mesure d'atténuation                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Les appels d'outils de la pile de canaux sont **approuvés automatiquement** sur le chemin `AcpBridge` de la Phase 0 (`AcpBridge.ts:108-118`) — un canal compromis peut exécuter n'importe quel outil sans contrôle. | Élevée   | La migration du daemon de la Phase 1, désormais actée, introduit le médiateur ; en attendant, restreindre le jeu d'outils + l'hôte de confiance.                    |
| R2  | La fuite du token global unique du daemon octroie un accès complet au workspace (chemin du daemon HTTP ; le chemin `AcpBridge` n'a pas de token).     | Élevée   | Loopback par défaut + contrôle bearer ; `--require-auth` sur non-loopback (OD-12) ; hôte de confiance ; rotation via redémarrage ; contrôler les outils destructeurs derrière `consensus` une fois connectés. |
| R3  | Le mode par défaut de `dispatchMode` `'steer'` annule le travail en cours sur le message de n'importe quel membre (le JSDoc indiquait `'collect'`, désormais corrigé en `'steer'`, `types.ts:42`). | Élevée   | Les groupes de tags définissent `'followup'` ; JSDoc réconcilié (OD-5).                                                                                             |
| R4  | Absence d'attribution de l'expéditeur → l'agent confond les intervenants.                                                                            | Élevée   | Injection de `[senderName]` en Phase 0 pour les tours de groupe (+ `alreadyPrefixed`, OD-6).                                                                        |
| R5  | La proactivité sur les cold-groups / webhooks expirés de DingTalk échoue silencieusement (`:137-141`).                                               | Moyenne  | Phase 1 : envoi de groupe proactif vérifié sur `openConversationId` persisté ; `canColdSend` en mode fail-loud ; afficher les dégradations.                         |
| R6  | Le cron/notification s'arrête lors du reap de session (30 min, `run-qwen-serve.ts:94`) ; nécessite également un chemin sortant (R5).                 | Moyenne  | Scheduler appartenant à la passerelle (§6.2) ; contrôle de propriétaire unique OD-8.                                                                                |
| R7  | `requireMention` à true → les messages de groupe non mentionnés sont ignorés silencieusement (`GroupGate.ts:51-52`).                                 | Faible/Moyenne | Conserver la valeur par défaut ; documenter ; indice optionnel sur le premier message.                                                                              |
| R8  | La mémoire partagée du workspace contamine les groupes colocalisés.                                                                                  | Moyenne  | Un processus par canal ou scope `channel` de la Phase 2 (OD-10).                                                                                                    |
| R9  | La limite de débit (rate-limit) est par `clientId`/IP, et non par utilisateur (chemin du daemon) ; le chemin `AcpBridge` n'en a pas.                 | Faible   | Acceptable pour le single-tenant ; la mesure par utilisateur est en Phase 3.                                                                                        |
| R10 | L'ensemble des votants du consensus est figé (snapshot) au moment de la requête ; aujourd'hui, les membres du canal ne sont pas des `clientId` distincts. | Faible   | OD-3 : `first-responder` Phase 1 ; résoudre le mappage `senderId`→vote avant le consensus.                                                                          |
| R11 | Le SDK DingTalk ne rafraîchit jamais le token d'accès (valable ~2 h) sauf à la fermeture du socket — les fonctionnalités proactives/émotions/médias échouent silencieusement. | Élevée   | `tokenManager` appartenant à la fonctionnalité proactive, rafraîchissement via le point de terminaison v1.0 `oauth2/accessToken` (§6.2, vérifié).                   |
| R12 | Un déclenchement proactif appelant `DaemonChannelBridge.prompt()` pendant un tour humain **lèverait une exception** `Prompt already in flight` (`:257-261`). | Élevée   | `dispatchProactive` sérialise via `sessionQueues` et attend `activePrompts` avant `bridge.prompt()` — la garde de throw est structurellement inatteignable (Fix #1, §6.2). |
| R13 | Un faux positif du budget estimé pourrait refuser un prompt utilisateur légitime.                                                                    | Moyenne  | Les estimations émettent uniquement des WARN ; refus catégorique (hard-decline) uniquement sur une utilisation réelle du daemon (Fix #6, §6.4).                     |
| R14 | La mise en file d'attente `followup` attribue incorrectement les appels d'outils à l'expéditeur mis en file le plus récemment.                       | Moyenne  | Conserver le `senderId` sur le tour mis en file ; l'audit lit le tour en cours d'exécution (Fix #7, §6.4).                                                          |

---

## 9. Décisions résolues

Toutes les décisions ouvertes (Open Decisions) de la v1 sont résolues ci-dessous avec leur réponse choisie. Les **seuls éléments véritablement encore ouverts** sont des détails de l'API DingTalk à faible niveau de confiance sous OD-7, mentionnés dans la dernière ligne.

| ID                        | Question                                                                                       | **Décision**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | Migrer l'hébergement des canaux dans `qwen serve` pour la Phase 1+, ou rester sur `AcpBridge` ? | **RÉSOLU — Migrer.** La Phase 0 est livrée sur `AcpBridge` ; **la Phase 1+ héberge les canaux sous `qwen serve` via `DaemonChannelBridge` / un runner de canal daemon**, héritant de la `promptQueue` FIFO, du `MultiClientPermissionMediator`, de l'`eventBus`, de `/workspace/memory` et du rate-limit. La Phase 0 ajoute le chemin d'attachement (ou `--daemon <url>`) afin que la bascule soit une simple étape de configuration. Le scheduler de la passerelle (§6.2) est neutre vis-à-vis de la migration. Ce n'est plus une condition bloquante — architecture actée.                                                                                                                                                                                                                                                |
| **OD-2**                  | Unité de déploiement = un processus par workspace/canal ?                                      | **RÉSOLU — Oui.** Un processus par workspace/canal : mémoire par canal + isolation des secrets, limitant le périmètre d'impact du token global unique. La colocalisation de plusieurs canaux est une préoccupation de la Phase 3 (nécessite le scope `channel` + le gouverneur).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **OD-3**                  | Politique de permissions pour un tag multijoueur (un canal = un `clientId` daemon) ?           | **RÉSOLU — Phase 1 : `first-responder` avec un seul `clientId` au niveau du canal** (n'importe quel membre autorisé résout ; attribution à la granularité du canal ; pas de mappage `senderId→clientId`). **Phase 2 : `consensus`/`designated`** une fois qu'un registre `senderId→clientId` + un cycle de vie (reaping, limites de refcount) existent. **Refus automatique des outils à haut risque sur les tours proactifs.**                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | Les `/clear`/`/status` à l'échelle du thread s'appliquent à l'ensemble du canal.               | **RÉSOLU — dans un groupe partagé (thread), `/clear` nécessite `confirm` et est restreint à `config.allowedUsers` lorsqu'il est défini** (un `/clear-channel` avec un tiret n'est pas analysable ; un contrôle de propriétaire par membre est reporté au modèle d'identité, OD-3/OD-11) ; `/status` reste en lecture seule sur la session partagée.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | Incohérence de la valeur par défaut de `dispatchMode` (JSDoc `'collect'` vs runtime `'steer'`). | **RÉSOLU — Corriger le JSDoc dans `types.ts:42` à `'steer'`** (correspond au runtime) ; le profil du groupe de tags définit explicitement `dispatchMode: 'followup'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **OD-6**                  | Format du marqueur d'expéditeur + double-préfixe `collect`.                                    | **RÉSOLU — Préfixe `[senderName]` par tour, NON contrôlé par `instructedSessions`**, plus **UN nouveau champ optionnel `alreadyPrefixed` dans `Envelope`** (`types.ts`) afin que la réentrée synthétique en mode `collect` ignore le re-préfixage. (Corrige l'affirmation de la v1 "pas de nouveau champ".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | Envoi proactif DingTalk : point de terminaison/permission, équivalence de `openConversationId`, rafraîchissement du token. | **RÉSOLU avec des faits vérifiés (§6.2/§6.5) :** point de terminaison `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(élevé)_ ; corps `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(élevé)_ ; en-tête d'authentification `x-acs-dingtalk-access-token` avec un token v1.0 `oauth2/accessToken`, TTL ~7200 s, mis en cache et rafraîchi par un `tokenManager` appartenant à la fonctionnalité _(élevé)_ ; persistance de `openConversationId` dans `~/.qwen/channels/dingtalk-groups.json` ; callback `conversationId`≈`openConversationId` _(moyen ; repli sur l'API de conversion `chatId→openConversationId` en cas d'`invalid.openConversationId`)_. **Reste ouvert (faible confiance) : code/nom d'affichage exact du point de permission ; phrase d'équivalence officielle textuelle ; si le throttle de 20/min s'applique à `groupMessages/send`.** |
| **OD-8**                  | Double déclenchement de cron entre les schedulers de la passerelle et de session.              | **RÉSOLU — Le scheduler de la passerelle est le SEUL propriétaire du cron.** Une session hébergée par un canal (tag) ne démarre **pas** son cron `Session` en session ; elle apprend qu'il s'agit d'une session tag via un flag `isTagSession` transmis depuis l'hôte du canal lors de la construction de la session (sac d'options `DaemonChannelSessionFactory` Phase 1+ ; une option de spawn `--acp` Phase 0), ce qui ignore `startCronScheduler()` (`Session.ts:667-668`). Les deux stockages de cron sont sur des **chemins disjoints** (passerelle `~/.qwen/channels/cron.json` vs session `~/.qwen/tmp/<hash>/scheduled_tasks.json`), donc le seul risque de collision est d'exécuter les deux schedulers pour les mêmes tâches — éliminé par le contrôle.                                                                                                                                                                                     |
| **OD-9**                  | Scope du budget de tokens, source de vérité, fenêtre.                                          | **RÉSOLU — Agrégation "org" par processus + fenêtres par canal, le plus strict l'emporte, fenêtre quotidienne fixe.** La v1 estime les tokens côté canal (conseillé, WARN uniquement — ne refuse jamais catégoriquement, Fix #6) et lit le **chemin d'utilisation du daemon** pour un débit précis (et un refus catégorique) une fois hébergé par le daemon.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Namespacing de la mémoire par room + autorité d'écriture.                                      | **RÉSOLU — Ajouter un scope `channel` (+`channelKey`) à `writeContextFile.ts` ; channel-base obtient l'écriture/lecture via un callback de couche CLI injecté via `ChannelBaseOptions` (`readChannelMemory`/`writeChannelMemory`) — AUCUNE dépendance `channel-base → core`.** Emplacement global utilisateur `~/.qwen/channels/memory/`. L'agent ajoute via une intention `save_memory` ; la lecture d'amorçage réutilise le contrôle `instructedSessions`.                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | Modèle d'identité humaine + durabilité de l'audit.                                             | **RÉSOLU — `senderName` est uniquement informatif ; `clientId` reste le seul principal de sécurité.** Attribution au meilleur effort portée par le tour en cours d'exécution (Fix #7) ; **anneau d'audit FIFO 512 en mémoire + un fichier de suivi `~/.qwen` en ajout uniquement (append-only)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | Renforcement du token pour les déploiements daemon sur non-loopback.                           | **RÉSOLU — Exiger `--require-auth` + token pour tout déploiement daemon sur non-loopback.** Loopback uniquement est réservé au développement ; `--require-auth` est la posture par défaut documentée (`run-qwen-serve.ts` impose déjà le token sur non-loopback).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OUVERT (seul restant)** | Détails de l'API DingTalk à faible niveau de confiance sous OD-7.                              | **TOUJOURS OUVERT — vérifier dans la console / par rapport à la documentation en ligne avant de coder :** (1) code/nom d'affichage exact du point de permission pour "envoyer proactivement un message de groupe" (faible) ; (2) phrase officielle faisant autorité équivalant le callback `conversationId` à `openConversationId` pour un robot standard non-cool-app (moyen ; le chemin garanti par la doc est l'API de conversion `chatId→openConversationId`) ; (3) si la limite "20 messages/minute → throttle d'environ 10 min" s'applique textuellement à `groupMessages/send` (faible/moyen — documenté pour les robots webhook personnalisés, non confirmé sur la page d'envoi orgapp).                                                                                                                                                                                                                                                            |
---

## 10. Risques et mesures d'atténuation

Voir le tableau consolidé au §8. Les risques critiques, par ordre de priorité :

1. **R1 — auto-approve sur le chemin du canal de la Phase 0.** Jusqu'à ce que la migration du daemon de la Phase 1, prévue pour implémenter le transport médié, soit déployée, un agent résident du canal exécute _n'importe quel_ outil sans protection. C'est la faille de sécurité la plus importante ; à atténuer avec un ensemble d'outils conservateur + un hôte de confiance jusqu'à la Phase 1.
2. **R12 — exception de chevauchement proactif.** L'appel à `DaemonChannelBridge.prompt()` pendant un tour humain lève l'exception `Prompt already in flight` (`:257-261`). Corrigé en sérialisant via `sessionQueues` (Fix #1) — la pièce maîtresse du §6.2.
3. **R11 — expiration du token DingTalk.** Le problème "fonctionne dans la démo, meurt après 2 heures". La fonctionnalité proactive possède un `tokenManager` (point de terminaison v1.0 vérifié, TTL ~7200 s) avant le déploiement de toute fonctionnalité de longue durée.
4. **R5 — échec silencieux des groupes froids DingTalk.** La sortie proactive vers des groupes inactifs est impossible sans le chemin d'envoi vérifié ; `canColdSend` échoue de manière explicite plutôt que d'être ignoré.
5. **R3 — annulation de `steer` dans les groupes.** Un DoS accidentel en multijoueur avec le comportement par défaut du runtime ; le profil de tag définit `followup`.
6. **R13/R14 — faux positifs de budget et mauvaise attribution.** Les estimations émettent uniquement des WARN (Fix #6) ; l'attribution est portée par le tour en cours d'exécution (Fix #7).
7. **R8 — contamination croisée de la mémoire partagée.** Un processus par canal est la mesure d'atténuation sans code ; le scope `channel` est la réponse colocalisée.

Chaque risque est associé à une phase : R1/R3/R4 sont Phase 0–1, R5/R6/R11/R12 sont Phase 1, R8/R13/R14 et les risques d'audit/budget sont Phase 2.

---

## 11. Annexe : Index des fichiers et symboles

### Base des canaux (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), scope par défaut `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), construction du prompt (`:316-347`), appel `bridge.prompt()` (`:425`), gates (`:240-252`), résolution de `dispatchMode` (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), `sendMessage()` abstrait (`:81`), `registerCommand()` (`:141-143`), routeur du constructeur (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — spawn `--acp` (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), auto-approve `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), objet d'options de la fabrique de session (`:226-241`), garde `activePrompts` / **lève `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), événements de permission (`:557-633`).
- `GroupGate.ts` — `requireMention` par défaut à true (`:49`), appartenance (`:42`), filtrage des mentions (`:51-52`), chaîne de repli (`:48`), politique par défaut `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + pairing (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), JSDoc de `dispatchMode` corrigé pour `'steer'` (`:42`), `senderName` (`:69`), nouveau champ `alreadyPrefixed`, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — map `webhooks` (`:84`), `sendMessage()` (`:134-170`, retour sans webhook `:137-141`), cache de webhook (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, anti-pattern catch vide `:214-216`), robotCode média (`:435`), `conversationId` entrant (`:506`), suppression des mentions (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), pas de `threadId` (`:541-551`).
- `proactive.ts` (nouveau) — `sendGroupMessage()` vers `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` chaîne JSON), `tokenManager` (v1.0 `oauth2/accessToken`, TTL ~7200 s, timer + refresh 401), repli de conversion `chatId→openConversationId`.
- `markdown.ts` — passage des tableaux, `splitChunks()`, `CHUNK_LIMIT=3800` (≤ au budget `sampleMarkdown` de ~5000 caractères), `extractTitle()`, `normalizeDingTalkMarkdown()`.
- `media.ts` — header `downloadMedia` (`:39`), body `:42`.
- SDK : `client.mjs` gettoken (`:85-87`), reconnect (`:157-163`), séparation événement/callback (`:14-19,35-37,58-61,241-257`) ; `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` proactif (`:622-676`, point de terminaison `:651` ; `canColdSend = true`), `refreshToken()` (`:581-620`), modes `connect()` (`:146-176`), `updateCard()` (`:742-792`), déduplication de l'ingestion (`:1633-1870`).
- `markdown.ts` — contenu de carte schema-v2 (`:69-189`), `splitChunks()` (`:198-256`).

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +branche `channel` + param `channelKey`), mutex par fichier (`:48-57,159-162`), garde de chemin absolu (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), mode replace (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), chemin haché par projet (`:1-9`).
- `Session.ts` — déclarations des champs `cronQueue`/`cronProcessing` (`:667-668`), `startCronScheduler()` (`:758`, ignoré pour les sessions de tag selon OD-8), clear cron `dispose()` (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — `promptQueue` FIFO par `SessionEntry` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` libre (`:51`), `originatorClientId` (`:60`), seuils d'hystérésis (`:101-103`), ring de replay (`:92`).
- `permissionMediator.ts` — quatre politiques + quorum de consensus (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), union d'entrées fermées (`:57-104`), doc d'en-tête anticipant une surface GET (`:22-25`).
- `rate-limit.ts` — token buckets par `(clientId|ip)` ; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — bearer token global (`:259-266`), `createMutationGate` strict (`:356`).
- `workspace-memory.ts` — scopes `workspace|global` (`:118-125`), mutation strict-auth (`:114`), limite par écriture `MAX_MEMORY_CONTENT_BYTES` (`:79`), `projectRoot` fixe transmis (`:185-190`).

### Commandes de canal CLI (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), construction `AcpBridge` (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), gestionnaire de déconnexion (`:241,403`) ; chemin d'attachement du daemon Phase 1+ ; injection au niveau CLI de `readChannelMemory`/`writeChannelMemory`.
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope par défaut `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), types de canaux (`:10-14`).