# RFC : "qwen tag" — un agent persistant, multijoueur et résident de canal pour qwen-code (DingTalk en priorité)

**Statut :** Brouillon (v2)
**Date :** 2026-06-25
**Auteur :** (qwen-code)

---

## Changelog (v1 → v2)

Cette révision clôture toutes les Open Decisions de la v1 (désormais **Resolved Decisions**, §9) et corrige sept défauts de cohérence et d'exactitude soulevés lors de la revue. Les deux changements structurels majeurs :

- **OD-1 n'est plus une condition bloquante — c'est une architecture actée.** La Phase 0 est livrée sur le chemin `AcpBridge` actuel ; **la Phase 1+ migre l'hébergement des canaux dans le daemon `qwen serve`** (via `DaemonChannelBridge` / un runner de canal daemon) pour réutiliser la `promptQueue` FIFO par session, le `MultiClientPermissionMediator`, l'`eventBus`, `/workspace/memory` et le rate-limit. Chaque section qui indiquait précédemment "OD-1 open / gates everything" est désormais marquée comme décidée, et l'engagement envers le daemon est propagé dans les §1, §4, §5, §6.1, §6.2, §6.3, §6.4 et §7.
- **Le chemin de déclenchement proactif est repensé pour le chemin daemon sur lequel il s'exécutera réellement.** Le `dispatchProactive` de la v1 a été écrit pour la sémantique `AcpBridge` (`sessionQueues` côté canal). Avec la migration vers le daemon, `DaemonChannelBridge.prompt()` **lève `Prompt already in flight`** en cas de chevauchement (`DaemonChannelBridge.ts:257-261`) au lieu de mettre en file d'attente. La v2 sérialise les prompts proactifs via `ChannelBase.sessionQueues` pour **les deux** variantes, afin que la garde de levée d'exception ne soit jamais déclenchée, et énonce explicitement l'invariant d'annulation impossible (§6.2).

Résolutions et correctifs intégrés :

- **OD-2** décidé : un processus par workspace/canal.
- **OD-3** décidé : Phase 1 `first-responder` + un seul `clientId` au niveau du canal ; Phase 2 `consensus`/`designated` après l'existence d'un registre `senderId→clientId` + cycle de vie ; refus automatique des outils à haut risque lors des tours proactifs.
- **OD-4** décidé : dans un groupe partagé (thread), `/clear` nécessite un `confirm` explicite et est restreint à `config.allowedUsers` lorsque cette liste est définie ; `/status` en lecture seule. (Un `/clear-channel` avec un tiret n'est pas analysable par la grammaire slash ; une véritable owner-gate par membre attend le modèle d'identité — OD-3/OD-11.)
- **OD-5** décidé : correction du JSDoc obsolète `types.ts:42` vers `'steer'` ; le profil du groupe tag définit explicitement `dispatchMode: 'followup'`.
- **OD-6** décidé : préfixe `[senderName]` par tour, **non** conditionné par `instructedSessions` ; **un nouveau champ optionnel `Envelope` nommé `alreadyPrefixed`** pour que la réentrée synthétique en mode `collect` ignore le re-préfixage. (Corrige l'affirmation de la v1 "pas de nouveau champ envelope" — Fix #2.)
- **OD-7** résolu en utilisant des faits vérifiés sur l'API DingTalk (§6.2/§6.5), les éléments à faible confiance sont toujours signalés.
- **OD-8** décidé : le scheduler gateway/daemon est le **seul** propriétaire des crons ; une session tag ne démarre **pas** son cron `Session` en session ; les deux stores de cron vivent sur des chemins disjoints, donc une collision n'est possible que si les deux schedulers s'exécutent pour les mêmes jobs.
- **OD-9** décidé : agrégation "org" par processus + fenêtres par canal, le plus strict l'emporte, fenêtre quotidienne fixe ; la v1 estime les tokens côté canal et lit le chemin d'utilisation du daemon une fois hébergé dans le daemon.
- **OD-10** décidé : ajout d'un scope `channel` (+`channelKey`) à `writeContextFile.ts` ; channel-base obtient l'écriture/lecture via un **callback de couche CLI injecté via `ChannelBaseOptions`** (pas de dépendance `channel-base → core`) ; emplacement global utilisateur `~/.qwen/channels/memory/`.
- **OD-11** décidé : `senderName` à titre indicatif uniquement ; `clientId` comme seul principal de sécurité ; anneau d'audit en mémoire + un fichier de suivi `~/.qwen` en ajout uniquement (append-only).
- **OD-12** décidé : exigence de `--require-auth` + token pour tout déploiement supporté par un daemon non-loopback.

Correctifs d'exactitude au-delà des résolutions OD :

- **Fix #1 — concurrence du chemin de déclenchement proactif** repensée pour le chemin daemon (§6.2), avec l'invariant d'annulation impossible appliqué à la fois pour la variante `AcpBridge` de la Phase 0 et la variante daemon de la Phase 1+.
- **Fix #2 — contradiction interne** supprimée : §6.1/G2 n'affirme plus "pas de nouveau champ envelope" ; il reconnaît l'unique champ `alreadyPrefixed`.
- **Fix #3 — câblage de la mémoire conçu** (§6.3) : la modification exacte de `ChannelBaseOptions` (callbacks `readChannelMemory`/`writeChannelMemory`) et qui les construit/injecte dans `start.ts`, avec la lecture de bootstrap une fois par session réutilisant la gate `instructedSessions`.
- **Fix #4 — flag de capacité `canColdSend` conçu** (§6.2) : où il est déclaré, comment DingTalk/Feishu le définissent, et comment le scheduler échoue de manière explicite.
- **Fix #5 — clarification des stores disjoints OD-8** (§6.2) : le store gateway et le store `Session` sont des chemins différents ; le seul risque de collision est qu'une session tag exécute également un cron en session — fermé par la gate OD-8.
- **Fix #6 — application du budget estimé** (§6.4) : une estimation peut WARN/alert mais ne doit jamais hard-decline un prompt utilisateur ; HARD-decline uniquement sur les chiffres d'utilisation réels du daemon.
- **Fix #7 — attribution de l'audit sous `followup`** (§6.4) : transport du `senderId` _avec_ le prompt en file d'attente afin qu'un tool-call/permission soit attribué au tour en cours d'exécution réel, et non à l'expéditeur le plus récemment mis en file d'attente.

Les faits vérifiés de la v1 (topologie AcpBridge, auto-approve AcpBridge, `sendMessage` abstrait, scopes, valeurs par défaut du parser) sont préservés inchangés.

---

## 1. Résumé

**"qwen tag"** est un agent qwen-code partagé qui vit à l'intérieur d'un canal de chat — un groupe DingTalk en priorité, Feishu en second — et que n'importe quel membre de ce canal invoque en le `@`-mentionnant. Une fois invoqué, il exécute la boucle complète de l'agent qwen-code (outils, modifications de fichiers, shell, MCP) sur un workspace lié, diffuse son travail dans le canal au fur et à mesure, **se souvient du canal à travers les tours et les redémarrages**, et peut agir **de manière proactive ou selon une planification** sans attendre qu'on le lui demande. Cela reflète le format Claude Tag — un seul agent multijoueur persistant qui est _résident_ de la salle plutôt qu'un bot de DM 1:1 — mais il est entièrement construit sur la stack d'adaptateurs de canal existante de qwen-code (`qwen channel start`, `packages/channels/*`) et le daemon `qwen serve`, et non sur un nouveau service hébergé.

Le cadrage délibéré de cette RFC est que **la moitié réactive du format est déjà largement livrée, et que la moitié proactive/mémoire ne l'est pas.** Les pièces qui rendent difficile un agent de _réponse_ de style Claude Tag — un processus de longue durée qui multiplexe les sessions, un transport d'agent qui préserve l'invariant d'un prompt par session, le routage de sessions multijoueur, le contrôle d'accès par canal, le rendu de cartes en streaming et la persistance durable des sessions — existent déjà et sont utilisées par les adaptateurs de canal actuels. Ce qui _manque_, c'est un ensemble bien délimité de capacités qui transforment un reply-bot réactif en un agent résident : l'attribution de l'expéditeur dans les sessions partagées, un chemin de sortie proactif/planifié, une mémoire par salle et la gouvernance multijoueur. Cette RFC cadre cette lacune en **quatre domaines de construction** et les spécifie à travers les Phases 0 à 2.

> Note sur les "80%" : les brouillons précédents formulaient cela comme "~80% livré". Ce chiffre est invérifiable et exagère la situation — le moteur proactif entier (Build Area 2) et la mémoire par salle (Build Area 3) sont entièrement nouveaux, et sur DingTalk spécifiquement, il n'y a _aucun_ chemin d'initiation sortante. Nous le formulons plutôt ainsi : "le chemin réactif est construit ; les chemins proactif et mémoire ne le sont pas."

### Un fait topologique qui contraint l'ensemble de la RFC

Il existe **deux manières distinctes de connecter un adaptateur de canal à un agent qwen**, dans **deux processus différents**, et les confondre est l'erreur la plus courante dans les brouillons précédents :

- **`qwen channel start <name>` (le chemin de livraison).** `start.ts` construit **`new AcpBridge(bridgeOpts)`** (`start.ts:213,268,356,435`), et `AcpBridge.start()` **spawn un processus enfant** `node <cliEntryPath> --acp` (`AcpBridge.ts:53-70`), communiquant en ACP sur NDJSON via **stdio**. Cet enfant est un _agent autonome_, pas le daemon HTTP `qwen serve`. Dans cette topologie, il n'y a **pas de daemon HTTP, pas de route `/workspace/memory`, pas de `MultiClientPermissionMediator`, pas d'anneau de rejeu `eventBus`, et pas de `promptQueue` daemon** — tout cela vit dans `packages/acp-bridge` + `packages/cli/src/serve`, que `qwen channel start` n'instancie jamais. La sérialisation des prompts se fait ici entièrement **côté canal** par `ChannelBase` (mutex `activePrompts` à `ChannelBase.ts:356-391` + chaîne `sessionQueues` à `:394-470`) et par l'invariant propre à l'enfant d'un prompt par session ACP. `AcpBridge.requestPermission` **auto-approuve chaque appel d'outil** (`AcpBridge.ts:108-118`).
- **`qwen serve` + `DaemonChannelBridge` (hébergé par le daemon).** `DaemonChannelBridge` (`packages/channels/base/src/DaemonChannelBridge.ts`) est un bridge in-process dont la `sessionFactory` produit des objets `Session` du daemon. Ce chemin exécute les canaux à l'intérieur du daemon et hérite ainsi de la `promptQueue` FIFO d'`acp-bridge` (`bridge.ts:232,2855,3082`), du `MultiClientPermissionMediator`, de l'`eventBus` et des routes HTTP. **`qwen channel start` ne l'instancie pas aujourd'hui** (zéro référence dans `start.ts`). Un point délicat qui façonne la conception proactive : `DaemonChannelBridge.prompt()` **ne met pas en file d'attente — il lève `Prompt already in flight`** en cas de chevauchement (`DaemonChannelBridge.ts:257-261`) ; la `promptQueue` FIFO qu'il atteint finalement est côté daemon/acp-bridge, _derrière_ cette garde de levée in-process. Le moteur proactif doit donc sérialiser au niveau de la couche canal (§6.2).

**Architecture actée (anciennement OD-1, désormais décidée) :** la mécanique daemon multi-clients est réutilisée en **migrant l'hébergement des canaux dans le daemon `qwen serve`** à partir de la Phase 1.

- La **Phase 0** est livrée sur le chemin `AcpBridge` actuel (l'injection d'identité n'a besoin ni des routes HTTP ni du médiateur).
- La **Phase 1+** exécute les canaux sous le daemon `qwen serve` (via `DaemonChannelBridge` ou un runner de canal daemon), car le moteur proactif, la persistance de la mémoire par salle et la gouvernance ont tous besoin de la durabilité, des routes, de la `promptQueue`, du médiateur et de l'event bus du daemon.

Ce n'est plus "ouvert" ou "bloquant" : le câblage de la Phase 0 ajoute le chemin d'attachement `DaemonChannelBridge` (ou un flag `--daemon <url>`) afin que la migration soit disponible dès le début de la Phase 1. Le scheduler appartenant à la gateway (§6.2) est conçu pour être **neutre à la migration** afin qu'il s'exécute de manière identique avant et après la bascule.

### Ce qu'est "qwen tag", concrètement

Un déploiement "qwen tag" est un processus d'agent unique lié à un workspace, plus un adaptateur `qwen channel start dingtalk`, configuré de sorte qu'un groupe entier partage **une** session d'agent. Deux **concepts de scope distincts** doivent s'aligner :

1. **Scope de routage de canal** (`ChannelConfig.sessionScope`, consommé par `SessionRouter.routingKey()`) : décide comment les messages entrants sont mappés à une clé de routage. Pour un tag, cela doit être `'thread'` afin que tout le groupe partage une seule clé de routage (`channel:(threadId||chatId)`, `SessionRouter.ts:53`). **La valeur par défaut du parser est `'user'`, pas `'thread'`** (`config-utils.ts:91-92`), la recette du tag doit donc le définir explicitement.
2. **Scope de session Bridge/ACP** (`sessionScope` de `DaemonChannelBridge` / `acp-bridge`) : décide comment le daemon partage une session ACP sous-jacente. `DaemonChannelBridge.newSession()` définit cela par défaut à `'thread'` (`DaemonChannelBridge.ts:229,240`) ; le chemin in-process d'`acp-bridge` a pour défaut `'single'` (`bridge.ts:709`). C'est un **paramètre distinct** du scope de routage de canal, et n'est _pas_ sur le chemin `qwen channel start` (`AcpBridge.newSession(cwd)` ne prend que `cwd`, `AcpBridge.ts:131`).

Une fois ceux-ci en place :

- **Un agent par salle, invoqué par mention.** `GroupGate` applique `requireMention` (par défaut `true`, `GroupGate.ts:49`), l'agent reste donc silencieux jusqu'à ce qu'il soit `@`-mentionné ou qu'il s'agisse d'une réponse au bot (`GroupGate.ts:51`). La clé multijoueur est `sessionScope: 'thread'`, mappée à `channel:(threadId||chatId)` (`SessionRouter.ts:50-53`), de sorte que chaque membre réutilise le même `sessionId` quel que soit l'expéditeur.
- **Véritable travail multi-étapes avec des outils.** Les messages entrants deviennent des prompts via `ChannelBase.handleInbound()`, qui construit `promptText` à partir du texte du message, du contexte de citation de réponse, des chemins de fichiers joints et (une fois par session) de `config.instructions` (`ChannelBase.ts:316-347`), puis distribue via `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` (`ChannelBase.ts:425` — `promptText` est un arg positionnel ; l'objet options ne porte que les champs d'image).
- **Diffuse son travail dans la salle.** Les adaptateurs rendent la sortie incrémentale sous forme de cartes natives de la plateforme (Feishu create/update/finalize, `markdown.ts` ; chunking markdown DingTalk, `DingtalkAdapter.ts:144-169`).
- **Se souvient du canal.** `SessionRouter.persist()` / `restoreSessions()` stockent durablement `sessionId`, la cible et `cwd` et réhydratent via `bridge.loadSession()` à travers les redémarrages (`SessionRouter.ts:168-244`) ; la mémoire du workspace (`QWEN.md` / `~/.qwen/QWEN.md`) est lue/écrite via `GET` / `POST /workspace/memory` (`workspace-memory.ts`). Cette mémoire est scopée workspace/global, pas par salle — voir Build Area 3.
- **Peut agir de manière proactive / selon une planification.** C'est la moitié qui n'existe _pas_ encore de bout en bout et qui est au cœur de la Phase 1.

---

## 2. Motivation

L'infrastructure qu'un agent de _réponse_ multijoueur résident nécessite normalement est déjà amortie dans ce repo. Le travail véritablement manquant concerne quatre domaines de construction.

| Capacité requise par le format Tag | Déjà présente (réf.) |
| --- | --- |
| Processus de longue durée, multi-session | `AcpBridge` spawn un enfant `--acp` de longue durée (`AcpBridge.ts:53-70`) ; le chemin daemon ajoute une `promptQueue` FIFO par session (`bridge.ts:232,2855,3082`) |
| Routage multijoueur "une salle, une session" | Scope `'thread'` de `SessionRouter` (`SessionRouter.ts:53`), override par canal `setChannelScope()` (`SessionRouter.ts:40`) |
| Sémantique d'invocation par mention | `requireMention` de `GroupGate` par défaut à `true` (`GroupGate.ts:49-52`) |
| Contrôle d'accès + onboarding | Allowlist `SenderGate` + flux de pairing-code ; gates appliquées groupe puis expéditeur (`ChannelBase.ts:240-252`) |
| Mappage de session durable à travers les redémarrages | Persistance de `SessionRouter` (`SessionRouter.ts:168-244`) |
| Lecture/écriture de la mémoire du workspace | `GET` / `POST /workspace/memory` (`workspace-memory.ts`) ; scopes workspace + global uniquement ; daemon uniquement |
| Contrôle des permissions multi-acteurs + audit (daemon uniquement) | Quatre politiques de `MultiClientPermissionMediator` incl. le quorum `consensus` (`permissionMediator.ts:621-637`) ; anneau d'audit de permissions séparé (`permission-audit.ts`) |
| Auth, rate limiting, sécurité loopback (daemon uniquement) | Bearer token global (`auth.ts:259-266`) + rate limit par clientId/IP par paliers (`rate-limit.ts`) |
| Primitive de push en session (tâches en arrière-plan) | File de notification `Session` + `setNotificationCallback()` alimente les tâches en arrière-plan/moniteur/shell dans la session ouverte (`Session.ts:688-689,2638-2668`) ; `isIdle()` en tient compte (`Session.ts:777`) |
| Livraison sur la plateforme (DingTalk + Feishu) | Adaptateurs fonctionnels avec cartes en streaming, médias, réactions (`DingtalkAdapter.ts`, `FeishuAdapter.ts`) |

Parce que la Phase 1+ s'exécute sous le daemon (architecture actée, §1), les lignes daemon uniquement ci-dessus deviennent des capacités disponibles pour le moteur proactif, la persistance de la mémoire et la gouvernance — et non simplement des "cibles si nous migrons".

Les quatre domaines de construction, développés en détail dans le §6 :

1. **Config + identité pour _déclarer_ un tag (Phase 0).** Une recette de configuration documentée — `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` — plus la **lacune d'attribution de l'expéditeur** : `handleInbound()` n'injecte délibérément **pas** `senderName` dans `promptText` (`ChannelBase.ts:316-347` ; `senderName` est utilisé uniquement pour le contrôle d'accès à `ChannelBase.ts:246`). Dans une session partagée `'thread'`, l'agent ne peut pas dire _qui_ parle. La Phase 0 injecte un marqueur d'expéditeur, de la même manière que le contexte de citation de réponse l'est déjà (`ChannelBase.ts:318`).
2. **Un moteur proactif / d'initiation sortante (Phase 1).** Aujourd'hui, il n'y a **aucun chemin proactif à la limite du canal** : `ChannelBase.sendMessage()` est abstrait (`ChannelBase.ts:81`) et n'est jamais invoqué que depuis l'intérieur d'une réponse. Sur DingTalk, `sendMessage()` ne peut répondre que via un `sessionWebhook` de courte durée mis en cache par `conversationId` à l'entrée (`DingtalkAdapter.ts:134-142`), de sorte qu'un **groupe froid ne peut pas être messagé du tout** (`DingtalkAdapter.ts:137-141` retourne silencieusement). La Phase 1 ajoute un scheduler résident dans le daemon et un chemin d'envoi proactif DingTalk.
3. **Mémoire résidente de canal + récupération (Phase 2, moitié mémoire).** La mémoire du workspace est **globale au workspace, pas par salle** : `POST /workspace/memory` n'accepte que `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`) et est une **route de mutation à auth stricte** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). Un tag qui "se souvient de _ce_ canal" a besoin d'un namespace de mémoire par salle.
4. **Gouvernance + sécurité multijoueur (Phase 2, moitié gouvernance).** Politique de permissions adaptée aux groupes, garde-fous pour les actions proactives et audit forensique, s'appuyant sur la mécanique existante au niveau `clientId` (et non au niveau de l'identité humaine).

---

## 3. Objectifs & Non-Objectifs

### Objectifs

- **G1 — Documenter et livrer la configuration "tag"** sur DingTalk : une recette `channels.dingtalk` copier-coller (avec `sessionScope: 'thread'` explicite, `groupPolicy: 'allowlist'` avec l'ID du groupe listé, `requireMention: true`, `instructions` et un `dispatchMode` choisi délibérément) produisant un agent multijoueur résident fonctionnel, en réutilisant `parseChannelConfig()` et les gates existantes. La recette doit souligner la distinction entre scope de routage et scope ACP et le fait que la valeur par défaut du parser `'user'` doit être écrasée.
- **G2 — Attribution de l'expéditeur dans les sessions partagées.** Injecter un marqueur d'expéditeur par message dans `promptText` afin que l'agent puisse distinguer les intervenants dans un groupe scopé `'thread'`, sans casser l'injection de `instructions` une fois par session suivie par `instructedSessions` (`ChannelBase.ts:344-346`). Le marqueur est **par message** (l'intervenant change à chaque tour) et ne doit PAS être conditionné par `instructedSessions`. Cela nécessite **un nouveau champ optionnel `Envelope`, `alreadyPrefixed`** (`types.ts`), afin que la réentrée synthétique en mode `collect` ne double-préfixe pas — voir §6.1. (La v1 décrivait à tort cela comme "format uniquement, pas de nouveau champ".)
- **G3 — Un moteur proactif.** Un mécanisme pour (a) initier une sortie vers un canal qui n'a pas seulement envoyé de message, et (b) se déclencher selon une planification indépendante de toute session interactive ouverte, en livrant via le chemin de notification par session existant lorsque c'est possible — y compris l'API d'envoi proactif DingTalk et un store `openConversationId` persisté, avec un propriétaire de rafraîchissement de token défini. Doit respecter l'invariant ACP d'un prompt par session (NG6) en sérialisant via `ChannelBase.sessionQueues` (ne jamais `steer`-cancel un tour humain), sous les deux topologies.
- **G4 — Mémoire résidente de canal.** Un namespace de mémoire par salle et un chemin de récupération superposés à la mécanique `/workspace/memory` existante et au mécanisme `instructions`. La conception ajoute un nouveau scope `channel` (+`channelKey`) à `writeContextFile.ts` et y accède depuis `channel-base` via un **callback de couche CLI injecté via `ChannelBaseOptions`** (pas de dépendance `channel-base → core`).
- **G5 — Gouvernance multijoueur.** Politique de permissions adaptée aux groupes, garde-fous pour les actions proactives et audit, s'appuyant sur `MultiClientPermissionMediator` et l'anneau d'audit des permissions. Doit tenir compte du fait que les votes sont attribués à `clientId`, et non à l'identité humaine, et que dans une seule session partagée `'thread'`, chaque membre du groupe est le _même_ client daemon.
- **G6 — Parité Feishu** pour tout ce qui concerne G1–G5, traité comme un suivi. Le `tenant_access_token` stable de Feishu prend déjà en charge les envois proactifs vers n'importe quel chat avec juste un `chatId` (`FeishuAdapter.ts:622-651`), donc Feishu n'a besoin d'_aucune_ nouvelle API d'envoi pour G3 — seulement le mécanisme de réveil/planification au niveau du daemon. Feishu déclare `canColdSend = true`.
- **G7 — Réutiliser plutôt que réinventer.** Chaque domaine de construction étend un mécanisme existant (gates, routeur, bridge, médiateur, routes de mémoire, chemin de notification en session, cron) plutôt que d'introduire un sous-système parallèle.
### Hors périmètre

- **NG1 — Pas de SaaS hébergé et multi-tenant.** Un "qwen tag" est un processus agent lié à **un** workspace (`serve.ts:165-171` ; multi-workspace = un daemon par workspace sur des ports séparés). Pas de control plane central.
- **NG2 — Pas d'identité par utilisateur, de facturation ou de budgets de coûts dans cette RFC.** Le modèle d'identité du daemon est un **unique bearer token global** (`auth.ts:259-266`) et une attribution au niveau `clientId` sur l'ensemble de l'event bus et de l'audit des permissions. Nous ajoutons des _marqueurs d'expéditeur dans les prompts_ (G2) mais **n'introduisons pas** de principaux authentifiés par utilisateur, de quotas par utilisateur ou de suivi des coûts. Les marqueurs d'expéditeur sont du texte de prompt informatif, pas une limite d'authentification : chaque membre du groupe partage les identifiants du workspace unique du daemon, et dans une session `'thread'` partagée, il s'agit du _même_ `clientId` de daemon.
- **NG3 — La passerelle multi-identités de la Phase 3 est hors périmètre** ici, mentionnée uniquement comme perspective future. Cette RFC couvre les Phases 0 à 2.
- **NG4 — Feishu est secondaire, pas co-principal.** DingTalk est l'implémentation de référence et la source de tous les exemples détaillés.
- **NG5 — Slack et les autres plateformes occidentales sont hors périmètre.** Les types de canaux enregistrés sont `telegram`, `weixin`, `dingtalk`, `feishu` et `qq` (`channel-registry.ts:10-14`) ; aucun adaptateur Slack n'existe.
- **NG6 — Pas de modification de l'invariant ACP d'un prompt par session.** Un prompt planifié/proactif est simplement une autre entrée dans les `sessionQueues` du canal ; il ne peut pas s'exécuter en concurrence avec un tour utilisateur sur la même session, ni en annuler un.
- **NG7 — Pas de nouveau moteur de stockage mémoire scopé au chat.** La mémoire résidente du canal (G4) ajoute une _gestion des namespaces_ sur les fichiers `QWEN.md`/`AGENTS.md` existants basés sur des fichiers ; pas de base de données vectorielle ni de base de données par salon.

---

## 4. Évaluation de l'état actuel

Construit (B), partiel (P), manquant (M). "File" cite le symbole de référence. "Topology" indique si la capacité existe sur le chemin du canal `AcpBridge` (A), le chemin du daemon `qwen serve` (D), ou les deux — et, puisque la Phase 1+ s'exécutera sous le daemon, une note "→D" indique où la migration est ce qui débloque la capacité.

| Capacité                             | qwen-code aujourd'hui (fichier / symbole)                                                                    | Topologie                              | Écart                                                                                                                                                                           | Envergure         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Routage one-room-one-session           | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                                 | A+D                                   | Le scope par défaut est `'user'` (`config-utils.ts:91-92`) ; l'opérateur doit définir `'thread'`                                                                                             | Config (S)        |
| Invocation par mention                      | `GroupGate.requireMention` par défaut `true` (`GroupGate.ts:49-52`)                                   | A+D                                   | Aucun — déjà correct                                                                                                                                                        | —                 |
| Contrôle d'accès / onboarding            | `SenderGate` allowlist + pairing (`ChannelBase.ts:240-252`)                                        | A+D                                   | Aucun                                                                                                                                                                          | —                 |
| Mapping de session durable                | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                             | A+D                                   | Aucun                                                                                                                                                                          | —                 |
| **Attribution de l'expéditeur dans le prompt**       | `handleInbound()` construit promptText sans `senderName` (`ChannelBase.ts:316-347`)                    | A+D                                   | `senderName` jamais injecté ; l'agent ne peut pas savoir qui a parlé ; nécessite un nouveau `Envelope.alreadyPrefixed`                                                                                 | Code (S)          |
| Sérialisation du prompt                   | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`) ; daemon `promptQueue` (`bridge.ts:2855`)  | A (canal) / D (daemon)              | `DaemonChannelBridge.prompt()` LÈVE UNE ERREUR en cas de chevauchement (`:257-261`) — le moteur proactif doit sérialiser côté canal ; `dispatchMode` par défaut `'steer'` annule les pairs (`:354,371-379`) | Config + Code (S) |
| **Initiation sortante / envoi proactif** | `ChannelBase.sendMessage()` abstrait (`:81`) ; DingTalk webhook uniquement (`DingtalkAdapter.ts:134-142`) | A+D                                   | Pas de point d'extension proactif ; les groupes froids DingTalk ne peuvent pas recevoir de messages ; nécessite le flag de capacité `canColdSend`                                                                                    | Code (L)          |
| **Planificateur au niveau du daemon**             | Le cron est scopé à la session (`Session.ts:667-668`), meurt sur `dispose()` (`:790-812`)                    | A+D (passerelle) → D (réutilisation audit/file) | Pas de point de terminaison de planificateur daemon dans `serve/` ou `channels/` ; le planificateur de la passerelle est le seul propriétaire (OD-8)                                                                               | Code (L)          |
| Primitive de push in-session              | `setNotificationCallback` (`Session.ts:2638-2668`)                                                 | A+D                                   | Livré uniquement dans une session _active_ ; ne peut pas réveiller une session récupérée                                                                                                                  | (réutilisation)           |
| **Mémoire par salon**                    | `/workspace/memory` scope `workspace\|global` (`workspace-memory.ts:118-125`)                     | D uniquement                                | Pas de scope chat/canal ; nouveau scope `channel` + callback au niveau CLI (pas de dépendance core)                                                                                                 | Code (M)          |
| Vote de permissions multi-acteurs          | `MultiClientPermissionMediator` 4 politiques (`permissionMediator.ts:621-637`)                       | D (hérité Phase 1+)                | `AcpBridge` auto-approuve (`AcpBridge.ts:108-118`) ; les votes sont par `clientId`, un client par canal                                                                          | Code (L)          |
| Piste d'audit                            | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                             | D + anneau côté canal                 | Pas de `senderId` humain ; en mémoire, perdu au redémarrage ; suivi en append-only dans `~/.qwen`                                                                                              | Code (M)          |
| **Budget token / coût**                | aucun (le rate-limit est uniquement basé sur le nombre de requêtes, `rate-limit.ts`)                                           | registre côté canal + utilisation D         | Pas de compteur de dépenses ; estimations v1 (informatives), débit réel uniquement lorsque hébergé par le daemon                                                                                                   | Code (M)          |
| Scope outil/MCP par canal             | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`) ; filtre d'allowlist MCP (`:3327-3333`)   | par `Config`                          | Pas de chemin d'argument de spawn du canal vers l'enfant `--acp` (AcpBridge) ; `Config` par daemon une fois hébergé                                                                                  | Code (M)          |
| Envoi proactif DingTalk                | non implémenté (seulement `robot/emotion`, `messageFiles/download`)                                    | A+D                                   | Nouveau point de terminaison + `openConversationId` persisté + rafraîchissement du token (contrat vérifié, §6.2)                                                                                       | Code (L)          |
| Envoi proactif Feishu                  | `sendMessage()` sur `tenant_access_token` (`FeishuAdapter.ts:622-676`)                            | A+D                                   | Aucun — `canColdSend = true`                                                                                                                                                   | —                 |

Légende des envergures : S = config/code mineur, M = module + changement d'interface, L = changement multi-packages ou nouveau sous-système.

---

## 5. Architecture

`qwen tag` **n'est pas un nouveau runtime**. Il s'agit de quatre couches fines greffées sur la pile d'adaptateurs existante. La couche de base fournit déjà un agent capable de fonctionner en multijoueur, exécutant des outils et équipé de MCP, accessible via un canal de chat. Les quatre nouvelles couches correspondent 1:1 aux écarts : (1) **qui parle** — l'identité de l'expéditeur n'atteint jamais le prompt ; (2) **agir sans être sollicité** — pas de chemin d'initiation sortante, le cron in-session meurt avec la session ; (3) **se souvenir du canal** — la mémoire est globale au workspace ; (4) **gouverner un cerveau partagé** — l'authentification est un token global unique, pas de budget par canal.

Chaque couche ci-dessous indique la topologie qu'elle suppose (voir §1). Le **split acté** : Phase 0 sur `AcpBridge` ; Phase 1+ sur le daemon `qwen serve` via `DaemonChannelBridge`.

### Couche de base (existante) — topologie `qwen channel start` (Phase 0)

```
                              un hôte, un workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (client stream,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks mappés    │ ◀────────────── │    politique/allowlist)           │ │
│  │  par conversationId)│   texte/markdown│  2 SenderGate.check (pairing)     │ │
│  │  sendMessage()       │                 │  3 commandes slash / "!"          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expire,         │  5 dispatchMode (steer par défaut)│ │
│        │  msg entrant uniquement)        └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (reprise sur     │ │
│        │                                │           panne)                   │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   événements textChunk /       ┌────────────────▼──────────────────┐ │
│        │   toolCall                     │ AcpBridge (PAS le daemon HTTP)     │ │
│        └─────────────────────────────── │  lance l'enfant node <cli> --acp   │ │
│                                         │  ClientSideConnection sur stdio    │ │
│                                         │  requestPermission AUTO-APPROUVÉ   │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ processus agent enfant (`--acp`)         │
                                          │  un prompt en cours par session ACP      │
                                          │  cron in-session (Session.ts) — DÉSACTIVÉ│
                                          │  pour les sessions tag (OD-8) ; MCP,     │
                                          │  outils. PAS de promptQueue/eventBus/    │
                                          │  mediator                                │
                                          └─────────────────────────────────────────┘
```

### Topologie hébergée par le daemon (Phase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              un hôte, un workspace, UN daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (canaux hébergés DANS le daemon)                 │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, sérialisation)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ envoi groupe proactif                      │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() LÈVE ERREUR si chevauchement  ││
│  │ (passerelle, seul  │ dispatchProa- │  → donc tous les prompts DOIVENT arriver││
│  │  propriétaire cron)│ ctive via     │     sérialisés via sessionQueues        ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ Session in-process       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon : acp-bridge FIFO promptQueue,    ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + routes /channel,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* Le canColdSend de DingTalk passe à true une fois le chemin d'envoi proactif livré (§6.2).
```

Invariants clés sur lesquels nous nous appuyons (vérifiés) :

- **Le scope thread est la clé du multijoueur.** `routingKey()` retourne `${channelName}:${threadId || chatId}` sous `'thread'` (`SessionRouter.ts:53`) ; `resolve()` réutilise la clé (`:79-83`). Le scope par défaut est `'user'` (`:25`) ; `qwen channel start` définit le scope par canal via `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) dans le chemin multi-canal, ou via le constructeur `ChannelBase` depuis `config.sessionScope` (`ChannelBase.ts:62-64`) dans le chemin mono-canal. **Le multijoueur nécessite que l'opérateur définisse `sessionScope: "thread"`.**
- **Sérialisation du prompt.** Sur `AcpBridge`, `newSession(cwd)` ne prend que `cwd` (`AcpBridge.ts:131`) et `AcpBridge.prompt()` n'a pas de garde de concurrence — la sérialisation est le `dispatchMode` de `ChannelBase` : `collect` met en buffer (`:361-370,445-463`), `steer` annule le prompt en cours (`:371-379`), `followup` s'enchaîne sur `sessionQueues` (`:381-383,394-470`). Le **défaut runtime est `'steer'`** (`:354`) ; le JSDoc de `types.ts:42` indique `'collect'` — **obsolète ; la v2 le corrige en `'steer'` (OD-5).** Sur le chemin du daemon, `DaemonChannelBridge.prompt()` **lève une erreur** en cas de chevauchement (`:257-261`) ; le FIFO `promptQueue` du daemon (`bridge.ts:2855,3082`) se trouve _derrière_ ce garde. Conséquence (fondamental pour le §6.2) : tous les prompts — humains et proactifs — doivent atteindre `bridge.prompt()` déjà sérialisés par `ChannelBase.sessionQueues`.
- **`sendMessage` est abstrait.** `ChannelBase.sendMessage()` est `abstract` (`:81`) ; `DingtalkAdapter.sendMessage()` (`:134-170`) envoie via un `sessionWebhook` par `conversationId` mis en cache uniquement à la réception (`:516-517`) et expirant — un groupe froid n'a pas de webhook en cache et l'appel **retourne silencieusement** (`:137-141`).
- **Invariants du daemon hérités en Phase 1+.** `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`), l'anneau de relecture `eventBus` (`eventBus.ts:92`), le FIFO `promptQueue` par `SessionEntry` (`bridge.ts:2855-3082`) deviennent disponibles une fois que les canaux sont hébergés sous `qwen serve` (acté, §1).

### Les quatre nouvelles couches

```
            ┌───────────── gouvernance (Couche 4) ───────────┐
            │  gate budget tour/coût par canal                │
            │  allowlist proactive, heures creuses, kill sw.  │
            └───────────────────────┬─────────────────────────┘
                                     │ encapsule tous les entrants + sortants
 entrant  ┌──────────────────────────▼─────────────────────────┐  sortant
 ───────▶ │  injection d'identité (Couche 1)                    │ ────────▶
          │  préfixe promptText avec orateur + contexte canal   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  mémoire du canal (Couche 3)                        │
          │  fragment par canal, injecté au début de session ;   │
          │  persisté via callback niveau CLI (helper core)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  moteur proactif (Couche 2)                         │
          │  planif. passerelle → sessionQueues → bridge.prompt →│
          │  channel.pushProactive() avec fallback groupe froid  │
          └─────────────────────────────────────────────────────┘
```

**Couche 1 — Injection d'identité.** _Topologie : les deux ; ne nécessite pas de daemon._ `handleInbound()` ne met jamais `senderName` dans `promptText` (`ChannelBase.ts:246` ne le lit que pour `SenderGate.check()` ; `Envelope.senderName` existe dans `types.ts:69`). Conception : un point d'injection conditionné par la config dans `handleInbound()`, après le préfixe `referencedText` (`:316-319`), conditionné à `envelope.isGroup`, plus un nouveau flag `Envelope.alreadyPrefixed` pour la réentrée `collect`. Détaillé au §6.1.

**Couche 2 — Moteur proactif.** _Topologie : planificateur propriété de la passerelle, neutre pour la migration ; s'exécute sous le daemon en Phase 1+._ Le cron in-session meurt sur `dispose()` (`Session.ts:790-803`) ; il n'y a pas de point de terminaison de planificateur daemon. `DingtalkAdapter.sendMessage()` ne peut pas atteindre un groupe froid (`:137-141`). Conception : un planificateur résidant dans la passerelle qui injecte un fire via `ChannelBase.sessionQueues` (jamais `steer`) et route la complétion vers `channel.pushProactive()`. Détaillé au §6.2.

**Couche 3 — Mémoire du canal.** _Topologie : chemin de persistance via callback au niveau CLI ; injection côté canal._ La mémoire est uniquement globale au workspace (`workspace-memory.ts:86-303`). Conception : un fragment de mémoire par canal injecté au démarrage de la session (réutilisation du gate `instructions` une fois par session) plus un nouveau scope `channel` sur le chemin d'écriture, atteint depuis `channel-base` via des callbacks injectés (pas de dépendance `channel-base → core`). Détaillé au §6.3.

**Couche 4 — Gouvernance.** _Topologie : wrapper de gate côté canal ; rate-limiter côté daemon en Phase 1+._ Le daemon a un unique bearer token global (`auth.ts:259-266`), un rate limiting par `clientId`/IP, et pas de budget par canal. Conception : un `ChannelGovernor`/`BudgetLedger` encapsulant `handleInbound()` et le planificateur. Détaillé au §6.4.
### Flux de données 1 — `@qwen` entrant dans un thread de groupe

Ce flux a la même forme sur les deux topologies ; la seule différence réside dans l'emplacement de la sérialisation et de la gestion des permissions. Sur `AcpBridge` (Phase 0), la sérialisation est gérée par `ChannelBase.sessionQueues` et les permissions sont approuvées automatiquement par le processus enfant ; sur le daemon (Phase 1+), la sérialisation est _toujours_ assurée par `ChannelBase.sessionQueues` (la garde de levée d'exception du daemon ne se déclenche jamais car la couche de canal a déjà sérialisé) et les permissions transitent par `MultiClientPermissionMediator`.

1. **DingTalk → adaptateur.** Un membre publie "@qwen summarize today's incidents". Le client de flux délivre `DingTalkMessageData` avec `conversationId`, `sessionWebhook`, l'expéditeur et `isInAtList`. `DingtalkAdapter` met en cache `webhooks.set(conversationId, sessionWebhook)` (`:516-517`) et émet une `Envelope` avec `isGroup:true`, `isMentioned:true`, `chatId = conversationId`.
2. **Governor (L4).** `ChannelGovernor`/`BudgetLedger.admit()` vérifie le budget de tours/coûts du canal (consultatif jusqu'à ce que l'utilisation réelle soit disponible, §6.4) et le coupe-circuit (kill switch). Arrêt forcé / limite explicite avec des chiffres réels → refus et réponse ; estimation uniquement au-delà du seuil → WARN, jamais de refus forcé (Fix #6).
3. **Gates (Portes).** `GroupGate.check()` réussit (la mention satisfait le `requireMention:true` par défaut) ; `SenderGate.check()` réussit (`:246`).
4. **Routage.** `router.resolve(...)` calcule `dingtalk:<conversationId>` sous le scope `'thread'` (**nécessite `sessionScope:"thread"`**), et renvoie le `sessionId` de groupe partagé. `persist()` l'enregistre.
5. **Mémoire (L3) + identité (L1).** Au premier tour, la mémoire par canal + `config.instructions` sont préfixés une seule fois (`instructedSessions`, `:344-347`). L'injection d'identité préfixe `[Alice]` à chaque message.
6. **Capture de l'attribution.** Les `senderId`/`senderName` résolus sont enregistrés **sur l'élément de la file d'attente** transporté dans `sessionQueues` (Fix #7), et non joints ultérieurement par horodatage.
7. **Dispatch (Répartition).** Le profil de tag définit `followup` (jamais `steer`) ; le message simultané de Bob s'enchaîne dans `sessionQueues` (`:394-470`).
8. **Bridge.** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` transmet via stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) ou à la session du daemon (`DaemonChannelBridge.prompt`) — atteint uniquement lorsque le tour précédent a vidé `activePrompts`, de sorte que la garde de levée d'exception du daemon (`:257-261`) n'est jamais déclenchée.
9. **Flux de retour.** `textChunk` → `onChunk` (`:416-422`) ; `onResponseComplete → DingtalkAdapter.sendMessage()` utilise le `sessionWebhook` mis en cache (groupe actif/warm).

### Flux de données 2 — push proactif planifié vers un groupe froid

1. **Déclenchement de la planification.** Le `ChannelCronScheduler` résidant dans la passerelle (gateway) se réveille à 09:00 pour `daily-standup → dingtalk:<convA>`. Il ne s'agit pas du cron en session (désactivé pour les sessions de tag, OD-8/§6.2 ; et de toute façon mort une fois la session récupérée — `dispose()` vide `cronQueue`, `Session.ts:790-803`).
2. **Governor (L4).** Vérifie la liste blanche (allowlist) proactive et les heures de silence (source de fuseau horaire explicite). Hors fenêtre / non autorisé → ignore + log. Le planificateur vérifie `adapter.canColdSend` avant de tenter la livraison ; si c'est faux, il **échoue bruyamment** (logs + enregistre `lastError`), et ne fait jamais un no-op silencieux (Fix #4).
3. **Enveloppe synthétique.** `senderId:'__cron__'`, `chatId: convA`, `isGroup:true`, `isMentioned:true`, pas de `messageId`. Le prompt synthétique porte sa propre attribution (`createdBy`) sur l'élément de la file d'attente.
4. **Sérialiser, ne jamais préempter.** `dispatchProactive` s'enchaîne sur `ChannelBase.sessionQueues` et attend tout tour humain en cours (`activePrompts.get(sessionId)?.done`). Il n'appelle **jamais** `steer`/`cancelSession`, et n'appelle **jamais** `bridge.prompt()` tant que `activePrompts` est détenu — ainsi, l'exception `Prompt already in flight` du daemon (`:257-261`) ne peut pas se déclencher (§6.2, Fix #1).
5. **Envoi au groupe froid.** `pushProactive(convA, text)` trouve `webhooks.get(convA)` indéfini et bascule sur le nouveau chemin proactif : `openConversationId` persisté, nouveau token d'identifiants d'application, POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` avec `robotCode = config.clientId`, `msgKey:'sampleMarkdown'`, `msgParam` (une _chaîne_ JSON). (Sur Feishu, l'étape 5 est le `sendMessage()` existant via `tenant_access_token` ; `canColdSend = true`.)
6. **Budget + audit.** Le tour proactif consomme le compartiment de budget du canal (débit consultatif jusqu'à ce que l'utilisation hébergée par le daemon soit disponible) ; enregistré avec `createdBy` comme identité d'origine et `originatorClientId` au niveau du transport (aucune identité humaine inventée, `eventBus.ts:60`).

### Pourquoi cette forme (réutiliser plutôt qu'inventer)

Chaque nouvelle couche s'attache à une jointure existante : l'identité au niveau de la construction de `promptText`, le proactif au niveau de `sessionQueues` + `pushProactive()`, la mémoire au niveau de la mécanique `instructions`/`writeContextFile`, la gouvernance comme wrapper sur la chaîne de portes (gate chain). L'unique **prérequis structurel** — la réutilisation de la mécanique du daemon par les couches 2 à 4 — est satisfait par la migration du daemon engagée (§1) : la Phase 0 est livrée sur `AcpBridge` ; la Phase 1+ s'exécute sous `qwen serve`.

---

## 6. Conception détaillée

### 6.1 Multijoueur & Identité (Zone de développement 1)

Un "tag qwen" réside dans un chat de groupe. Chaque membre parle au _même_ agent, qui doit (a) maintenir une conversation partagée pour l'ensemble du canal, (b) savoir _qui_ parle à chaque tour, (c) ne pas laisser le message d'un membre détruire la tâche en cours d'un autre, et (d) idéalement demander l'approbation du _groupe_ pour les appels d'outils risqués. qwen-code dispose aujourd'hui de primitives pour (a)–(c) ; (d) est un travail de la Phase 1+ hébergée par le daemon (migration engagée, §1).

#### Session partagée par le groupe : `sessionScope: 'thread'`

Sous `'thread'`, le `senderId` est retiré de la clé de routage, de sorte que chaque membre est résolu vers un seul `sessionId` (`SessionRouter.ts:53,72-92`) — ce qui fait de l'agent une entité partagée et résidente du canal, plutôt que N bots privés.

- **Scope par canal, pas un basculement global.** La valeur par défaut du routeur est `'user'` (`:25`) et celle de la configuration du canal est `'user'` (`config-utils.ts:91-92`). Les MPs (DMs) et les canaux mono-utilisateur restent en `'user'`. Le profil de tag définit `sessionScope: 'thread'` dans `settings.json`, appliqué par canal via `setChannelScope()` (multi-canal, `start.ts:361-362`) ou le constructeur `ChannelBase` (mono-canal, `ChannelBase.ts:62-64`).
- **Stabilité de `threadId`/`chatId` pour DingTalk.** L'adaptateur DingTalk ne définit jamais `Envelope.threadId` (`DingtalkAdapter.ts:541-551`), donc `routingKey()` utilise le fallback `threadId || chatId` vers `chatId`, regroupant un groupe en une seule session par `chatId` (comportement souhaité). **Mise en garde :** `chatId = conversationId || sessionWebhook` (`:534`). Pour les vrais messages de groupe, `conversationId` est présent et stable ; si un message arrive sans cela, `chatId` bascule vers l'URL `sessionWebhook` _expirant_ et la clé du thread se déstabilise. Le profil traite un `conversationId` manquant comme une erreur fatale (abandon du message), et non en basculant silencieusement sur le webhook.

La persistance assure la récupération après crash (`SessionRouter.ts:168-244`) : un redémarrage du daemon rattache le groupe à la même session partagée via `bridge.loadSession()`.

#### Nouveau risque : `/clear` et `/status` à scope thread sont à l'échelle du canal

Le gestionnaire partagé de `/clear` appelle `router.removeSession(this.name, senderId, chatId)` (`ChannelBase.ts:147-152`) et `/status` appelle `router.hasSession(...)` (`:203-208`) ; les deux passent par `routingKey()`, qui **ignore `senderId` sous `'thread'`**. Ainsi, le `/clear` d'un seul membre efface la session partagée pour l'ensemble du canal et réinitialise `instructedSessions` — un piège (footgun) de réinitialisation pour tous en un clic.

**Résolu (OD-4) :** dans un **groupe partagé (thread)**, `/clear` (et ses alias) nécessitent un token `confirm` explicite et sont restreints à `config.allowedUsers` lorsque cette liste est définie ; sinon, ils effacent directement (les MPs et les groupes par utilisateur ne touchent que la session de l'appelant, aucune porte n'est donc nécessaire). La commande conserve le nom `/clear` car le parseur de slash n'accepte que `[a-zA-Z0-9_]` (un `/clear-channel` avec un tiret serait parsé comme `clear` + arg `-channel`) ; le `confirm` explicite sert d'indicateur de destruction. Une véritable porte de propriétaire par membre (distinguant les admins des membres indépendamment de la liste blanche du chat) attend le modèle d'identité (OD-3/OD-11). **`/status` reste en lecture seule** sur la session partagée.

#### La lacune d'attribution de l'expéditeur et sa correction

`handleInbound()` construit `promptText` à partir de `envelope.text`, du préfixe de citation `referencedText`, des chemins de pièces jointes et de `config.instructions` une fois par session (`ChannelBase.ts:315-347`) ; `envelope.senderName` n'est lu que pour `SenderGate.check()` (`:246`). Dans un groupe `'thread'`, l'agent voit un flux non différencié.

**Correction (OD-6) — préfixer `[senderName]` pour les tours de groupe, en haut de la construction du prompt (`:315-316`), à chaque tour :**

```ts
let promptText = envelope.text;

// Multiplayer attribution: in a thread-shared session, tag each turn with the
// speaker. Skip 1:1 sessions (sender is invariant). Must fire EVERY turn —
// not gated by instructedSessions (the speaker changes each message). The
// alreadyPrefixed flag lets collect-mode synthetic re-entry skip this step.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **Conditionner sur `envelope.isGroup`** (`types.ts:75`), et non sur le scope.
- **Préfixer avant `referencedText`** pour que l'ordre de lecture soit `[Alice] [Replying to: "..."] <text>`.
- **Utiliser `senderName`, pas `senderId`.** Sur DingTalk, `senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`), jamais vide ; la chaîne `senderId → 'unknown'` est défensive.
- **Risque de double préfixe en mode `collect`, résolu par un nouveau champ.** La réentrée coalescée construit une `syntheticEnvelope` dont le `text` est la chaîne coalescée déjà préfixée et rentre à nouveau dans `handleInbound()` (`:449-462`), ce qui préfixerait **à nouveau**. **La v2 ajoute un nouveau champ optionnel `Envelope`, `alreadyPrefixed?: boolean` (`types.ts`)** ; l'enveloppe synthétique `collect` le définit à `true`, et l'étape de préfixe ci-dessus est ignorée lorsqu'il est défini. (Cela corrige l'affirmation de la v1 selon laquelle le changement est "format uniquement, pas de nouveau champ d'enveloppe" — Fix #2. C'est le seul nouveau champ d'enveloppe introduit par cette RFC ; le protocole bridge/ACP reste inchangé.)

#### `dispatchMode` par défaut du groupe : `steer` → `followup`

`steer` (valeur par défaut à l'exécution, `:354`) annule le prompt en cours via `bridge.cancelSession()` (`:371-379`). Dans un groupe partagé, si Bob envoie quoi que ce soit pendant que l'agent travaille sur la requête d'Alice, `steer` _annule la tâche d'Alice_ — un déni de service accidentel. **Le profil de tag définit `dispatchMode: 'followup'`** afin que le message de Bob soit mis en file d'attente derrière la tâche d'Alice (`sessionQueues` FIFO, `:381-383,394-470`). Définissez-le sur le profil de groupe (`groups["*"].dispatchMode = "followup"`), et non en inversant la valeur par défaut globale — les MPs conservent l'UX d'auto-interruption de `steer`. **Aucune modification de code requise** au-delà d'une valeur par défaut de profil documentée ; la v2 **corrige le JSDoc obsolète `types.ts:42` vers `'steer'`** pour que le code et le commentaire correspondent (OD-5). `collect` est acceptable pour les groupes à très fort trafic (limite la profondeur de la file d'attente) au prix d'un flou d'attribution.

Parce que le profil de tag est **toujours `followup` (jamais `steer`)** pour les groupes, le moteur proactif hérite d'un invariant propre : il n'y a pas de course entre steer et proactif, car aucun chemin dans un groupe de tag n'annule un prompt en cours. Cet invariant est réaffirmé et appliqué dans la §6.2.

#### Handoff — "reprendre là où la dernière personne s'est arrêtée"

Avec `'thread'` + les préfixes `[senderName]` + `followup`, le handoff _est_ le comportement par défaut : la session conserve l'historique complet multi-locuteurs. Deux ajouts ergonomiques : une commande **`/who`** en lecture seule (via `protected registerCommand(name, handler)`, `:141-143` — et non la map privée `commands`) rapportant le `sessionId`/`cwd`/résumé de tâche actif ; et un rattachement idempotent au redémarrage (déjà couvert par `restoreSessions()`).

#### Approbations multi-membres — phasage (OD-3, décidé)

L'intention est bonne : les appels d'outils risqués devraient être approuvables par le groupe, et qwen-code fournit `MultiClientPermissionMediator` avec quatre politiques (`permissionMediator.ts:348,621-637`). **Mais rien de tout cela n'est accessible depuis le canal sur le chemin `AcpBridge` de la Phase 0 :**

1. **`qwen channel start` câble `AcpBridge`, dont `requestPermission` approuve automatiquement** chaque requête (`AcpBridge.ts:108-118`). Aucune invite d'approbation.
2. Le médiateur réside dans la couche de service HTTP du daemon. Le seul bridge de canal capable de gérer les permissions est `DaemonChannelBridge` (`respondToPermission`, `:346-374`) — atteint une fois que la Phase 1 migre l'hébergement du canal dans le daemon (engagé, §1).
3. `config.approvalMode` est un **champ mort** — parsé (`config-utils.ts:94`) et typé (`types.ts:36`) mais lu par aucun adaptateur ou bridge.

**Phasage décidé :**

- **Phase 0 :** pas d'approbations de groupe. Contrôlez le risque avec la liste blanche des expéditeurs + `requireMention` + un jeu d'outils agent conservateur. Ne prétendez pas que `approvalMode` fait quoi que ce soit.
- **Phase 1 :** le canal s'exécute sur le chemin du bridge daemon (migration engagée) ; afficher `permission_request` sous forme de carte DingTalk ; livrer **`first-responder` avec un seul `clientId` au niveau du canal** (l'appui de n'importe quel membre autorisé résout ; attribution à la granularité du canal). Ne nécessite pas de map `senderId → clientId`. **Refus automatique des outils à haut risque sur les tours proactifs** (un tour d'origine `__cron__` ne peut pas répondre à une invite de permission).
- **Phase 2 :** ajouter `consensus`/`designated` par membre une fois que le mapping `senderId → clientId` et le cycle de vie de `clientId` (récolte, limites de refcount) existent. Note : un `clientId` synthétique par `senderId` fait croître indéfiniment la map de refcount `clientIds` et doit être récolté.

#### Résumé des changements concrets (Zone de développement 1)

| Changement | Emplacement | Type |
| --- | --- | --- |
| Le profil de groupe définit `sessionScope: 'thread'` | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config |
| Traiter le `conversationId` DingTalk manquant comme une erreur | `DingtalkAdapter.ts` ~`:534` | Code (S) |
| Préfixe `[senderName]` pour les tours de groupe | `ChannelBase.handleInbound` ~`:316` | Code (S) |
| Nouveau champ optionnel `Envelope.alreadyPrefixed` | `types.ts` (Envelope) | Code (S) |
| Définir `alreadyPrefixed` sur la réentrée synthétique `collect` | `ChannelBase.ts:449-462` | Code (S) |
| Porte `/clear confirm` + liste blanche dans les groupes partagés ; `/status` en lecture seule | commandes partagées (`:147-217`) | Code (S) |
| Le profil de groupe définit `dispatchMode: 'followup'` | `groups["*"]` dans `settings.json` | Config |
| Correction du JSDoc obsolète `dispatchMode` → `'steer'` | `types.ts:42` | Correction de commentaire |
| Commande de handoff `/who` | `registerCommand` (`:141`) | Code (S) |
| La migration du bridge daemon remplace l'auto-approbation de `AcpBridge` | hébergement `DaemonChannelBridge` (engagé) | Phase 1 (L) |
| Vote d'approbation par membre + carte DingTalk | nouveau câblage de bridge + `respondToPermission` | Phase 1/2 (L) |

### 6.2 Moteur proactif : planificateur + push sortant (LE CŒUR)

#### Décision : un planificateur appartenant à la passerelle, neutre face à la migration

**Adopter un planificateur qui réside dans le processus de la passerelle `qwen channel start`.** La passerelle possède `SessionRouter` (avec la récupération `restoreSessions()` — `start.ts:275,444`), détient chaque instance d'adaptateur et son bridge, et est le seul endroit où `ChannelBase.pushProactive()` (et la méthode abstraite sous-jacente `sendMessage()`, `:81`) peut être invoqué. L'agent (qu'il s'agisse de l'enfant `--acp` lancé en Phase 0 ou de la session du daemon en Phase 1+) reste un pur exécuteur de prompts : le planificateur se déclenche en mettant en file d'attente sur `ChannelBase.sessionQueues`, qui n'appelle `bridge.prompt()` qu'une fois le tour précédent vidé — **pas de nouvelle méthode de bridge, pas de canal inverse, pas de route de push du daemon.**

> **Note sur la topologie (architecture engagée).** Le planificateur est **neutre face à la migration par construction** : il sérialise via `ChannelBase.sessionQueues` quel que soit le bridge sous-jacent. En Phase 0, il pilote `AcpBridge.prompt()` via stdio ; en Phase 1+, il pilote `DaemonChannelBridge.prompt()` (hébergé par le daemon). Parce que l'audit `eventBus` du daemon et la `promptQueue` FIFO sont requis pour la gouvernance de la Phase 1+, le canal s'exécute sous `qwen serve` à partir de la Phase 1 — mais la logique propre du planificateur ne change pas à la frontière de la migration.

Pourquoi pas les alternatives :

- **Cron dans `Session` :** rejeté — `cronQueue`/`cronProcessing` résident dans la `Session` en cours de processus (`Session.ts:667-668`), ne se déclenchent que lorsqu'une session est ouverte, et meurent lors du `dispose()` à la récolte d'inactivité de 30 min (`:790-812`). C'est exactement l'échec que le planificateur de la passerelle évite. **Et le planificateur de la passerelle est le SEUL propriétaire du cron (OD-8) : une session de tag ne démarre jamais son cron en session** (mécanisme de porte ci-dessous).
- **Processus autonome :** rejeté — un deuxième processus de longue durée dupliquant les identifiants DingTalk, incapable de réutiliser le `SessionRouter` en cours de processus et le bridge déjà attaché.

#### Composants et emplacement

| Composant | Fichier | Responsabilité |
| --- | --- | --- |
| `ChannelCronStore` | `packages/channels/base/src/ChannelCronStore.ts` (nouveau) | Table de travaux durable, JSON sibling de `sessions.json`. `atomicWriteJSON` (`atomicFileWrite.ts:385`) + `async-mutex` `Mutex` par fichier. |
| `ChannelCronScheduler` | `packages/channels/base/src/ChannelCronScheduler.ts` (nouveau) | Unique `setTimeout` réarmé (timer-wheel-of-one) ; prochain déclenchement via `nextFireTime` ; rattrapage au redémarrage ; tick de réconciliateur toutes les 60s. Un par passerelle ; seul propriétaire du cron. |
| Primitives Cron | `packages/core/src/utils/cronParser.ts` (réutilisation) | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`). Ne pas réimplémenter. |
| `dispatchProactive` | `ChannelBase.ts` (étendre) | Injecter un déclenchement via `sessionQueues` ; attendre le `activePrompts.get(sessionId)?.done` de tout tour humain en cours ; jamais `steer` ; ne jamais appeler `bridge.prompt()` tant que `activePrompts` est détenu. |
| `pushProactive` | `ChannelBase.ts` (étendre ; défaut de base = `sendMessage`) + override DingTalk | Livraison sortante ; overrides DingTalk pour les groupes froids. Contrôlé par la capacité `canColdSend`. |
| `canColdSend` | Propriété `ChannelBase` (défaut `false`) | Drapeau de capacité que le planificateur vérifie avant un envoi à froid ; DingTalk passe à `true` une fois le chemin d'API proactif livré ; Feishu est à `true`. |
| Envoi proactif DingTalk | `packages/channels/dingtalk/src/proactive.ts` (nouveau) + `DingtalkAdapter.ts` | Envoi de messages proactifs de groupe via `robotCode` + `openConversationId` stocké (contrat VÉRIFIÉ ci-dessous). |
| Câblage | `start.ts` (étendre `startSingle`/`startAll`) | Construire + démarrer le planificateur après `router.restoreSessions()` (`:275,444`) ; transmettre le drapeau `isTagSession` dans la construction de la session (OD-8). |
| Outil `/schedule` + `schedule_task` | `ChannelBase.handleInbound()` (étendre, après les portes `:240-252`) | Commande déterministe d'abord ; outil de modèle ensuite. |
#### Flag de capacité `canColdSend` (Fix #4)

Le critère MVP multiplateforme (« la même tâche s'exécute sur DingTalk et Feishu ») nécessite un flag de capacité afin que le scheduler puisse raisonner sur l'accessibilité au lieu de la découvrir par un échec silencieux.

- **Déclaré comme propriété sur `ChannelBase` :** `protected readonly canColdSend: boolean = false;`. (Placé sur la classe de base, et non sur un registre `ChannelPlugin` séparé, car le scheduler détient déjà l'instance de l'adaptateur et `pushProactive`/`sendMessage` sont des méthodes d'instance — co-localiser le flag avec la méthode qu'il protège les maintient dans un seul type.)
- **DingTalk :** `canColdSend = false` jusqu'à ce que le chemin d'envoi proactif (`proactive.ts`) soit livré et qu'un `openConversationId` utilisable soit persisté ; passe à `true` une fois `pushProactive` implémenté. Tant que c'est `false`, DingTalk peut toujours répondre aux tours chauds (webhook) — `canColdSend` ne régit que la livraison _cold-group_.
- **Feishu :** `canColdSend = true` (envoi proactif natif via `tenant_access_token`, `FeishuAdapter.ts:622-676`).
- **Le scheduler échoue bruyamment (fail-loud) :** avant de délivrer un déclenchement (fire), le scheduler vérifie `adapter.canColdSend`. Si `false`, il ne tente **pas** `pushProactive` ; il loggue une erreur visible par l'opérateur, définit `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`, l'affiche dans `/schedule list`, et (selon la politique) incrémente `consecutiveFailures`. Il ne fait jamais de no-op silencieux.

#### Stores cron disjoints + la porte OD-8 (Fix #5)

Il existe deux chemins de persistance cron, et **ils résident sur des chemins de système de fichiers disjoints**, ils ne peuvent donc jamais lire ou écrire les mêmes tâches :

- **Gateway store (nouveau) :** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — global au canal, voisin de `sessionsPath()` (`start.ts:56-58`), propriété de l'utilisateur, en dehors de l'arbre de travail.
- **Session store (existant) :** le cron `Session` par session utilise un répertoire **haché par projet** `~/.qwen/tmp/<hash>/scheduled_tasks.json` (`cronTasksFile.ts:1-9`).

Parce que les chemins sont disjoints, la seule façon qu'une tâche durable se déclenche en double est si une **session tag exécute également son cron `Session` en session** en plus du scheduler de la gateway. **OD-8 ferme cette porte :** le scheduler de la gateway est le seul propriétaire du cron ; une session hébergée par un canal (« tag ») ne démarre **pas** son cron en session.

**Mécanisme de porte — comment une session apprend qu'elle est une session tag.** Une session tag est construite avec un flag explicite transmis depuis l'hôte du canal :

- Sur le chemin du daemon Phase-1+, `DaemonChannelSessionFactory` reçoit déjà un sac d'options structuré (`{ workspaceCwd, modelServiceId, sessionScope }`, `DaemonChannelBridge.ts:226-241`). Ajoutez `isTagSession: true` à ce sac ; la `Session` du daemon le lit à la construction et **ignore `startCronScheduler()`** (le site d'appel qui armerait autrement `cronQueue`, `Session.ts:667-668`). La suppression efface déjà le cron lors du reap (`:790-803`), donc une session tag ne l'arme simplement jamais.
- Sur le chemin `AcpBridge` de la Phase 0, l'agent enfant ne doit pas non plus armer le cron en session pour un workspace tag ; transmettez le même flag via une option de spawn `--acp` (un nouveau champ `AcpBridgeOptions` transmis en tant que flag dans `Config`). Jusqu'à ce que ce plumbing de flag soit en place, la Phase 0 n'enregistre simplement aucune tâche cron en session (la commande `/schedule` cible le store de la gateway), donc il n'y a rien qui puisse se déclencher en double.

Cela rend le risque restant purement opérationnel : « n'exécutez pas les deux schedulers pour les mêmes tâches » — et la porte garantit qu'une session tag ne démarre jamais le second.

#### Schéma du store durable et récupération au redémarrage

Le schéma est parallèle à `DurableCronTask` (`cronTasksFile.ts:19-26` : `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — le champ est `cron`, **pas** `cronExpr`) :

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
3. `scheduler.start()` : calcule `nextFireTime(job.cron, new Date())` pour chaque tâche activée. **Politique de déclenchement manqué (décision RFC) : les tâches récurrentes en retard pendant l'arrêt se déclenchent une fois immédiatement puis reprennent — ne rejouent jamais un backlog** (une inondation de backlog dans un groupe actif est un incident de spam). Les one-shots dans le passé se déclenchent une fois puis sont supprimés. `cronScheduler.ts` distingue `{ kind: 'catch-up'; ids }` (récurrent) de `{ kind: 'missed'; tasks }` (one-shots, confirmation d'abord) à `:81-89,608-707` ; nous adoptons la fusion en un seul pour les récurrents.
4. Arme un seul `setTimeout` pour la tâche la plus proche ; réarme après chaque déclenchement. Ajoute un tick de réconciliateur de 60s (précédent : `lockProbeTimer`, `cronScheduler.ts:229,507-538`) recalculant à partir de `Date.now()` pour absorber le décalage d'horloge suspend/reprise — n'accumule jamais les intervalles.

#### Chemin de déclenchement : injection dans la session de groupe PARTAGÉE (Fix #1 — le plus important)

L'invariant d'un prompt actif par session diffère selon la topologie et le `dispatchProactive` de la v1 s'est trompé pour le chemin du daemon :

- **Phase 0 (`AcpBridge`) :** `AcpBridge.prompt()` (`:147-180`) n'a **pas de garde de concurrence propre** ; la seule sérialisation est `ChannelBase.sessionQueues`/`activePrompts` (`:29-35,394,466`) et la session ACP propre de l'enfant `--acp`.
- **Phase 1+ (`DaemonChannelBridge`) :** `DaemonChannelBridge.prompt()` **lève `Prompt already in flight`** quand `activePrompts.has(sessionId)` (`:257-261`) — il ne met **pas** en file d'attente. La `promptQueue` FIFO (`bridge.ts:2855,3082`) est côté daemon/acp-bridge, _derrière_ ce garde de levée en processus. Ainsi, appeler `DaemonChannelBridge.prompt()` pendant qu'un tour humain est actif **lève une erreur** au lieu d'attendre.

**La refonte (correcte sous les deux topologies) : ne jamais appeler `bridge.prompt()` pendant qu'un tour est en cours ; sérialiser au niveau de la couche canal via `sessionQueues`, en attendant d'abord `activePrompts`.** Parce que `sessionQueues` enchaîne l'exécution proactive _après_ la résolution de l'exécution précédente, au moment où `bridge.prompt()` est invoqué, `activePrompts.get(sessionId)` est libre — donc sur le chemin du daemon le garde de levée n'est jamais déclenché, et sur le chemin `AcpBridge` le `prompt()` sans garde ne se chevauche jamais non plus.

```ts
// ChannelBase.ts — reuses private sessionQueues/activePrompts (:29-35).
// Works identically for AcpBridge (Phase 0) and DaemonChannelBridge (Phase 1+):
// the chain guarantees bridge.prompt() runs only after the prior turn drains,
// so DaemonChannelBridge's `Prompt already in flight` throw (:257-261) cannot fire.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // wait out a human turn — never steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // only now is activePrompts clear
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**Invariant : un tour proactif n'est jamais annulable par un tour humain ultérieur, et n'annule jamais un tour humain.** Application, énoncée pour les deux variantes :

- **Pas d'annulation proactif→humain :** `dispatchProactive` n'appelle jamais `steer`/`cancelSession`. Il se contente d'`await` `activePrompts.get(sessionId)?.done` puis se met en file d'attente derrière.
- **Pas d'annulation humain→proactif :** le profil du groupe tag est **`followup` (jamais `steer`)** (§6.1). Puisque `steer` est le seul `dispatchMode` qui appelle `bridge.cancelSession()` (`:371-379`), et que les groupes tag ne le sélectionnent jamais, un tour humain entrant peut seulement s'enchaîner _derrière_ un tour proactif en cours via `sessionQueues` — il ne peut pas l'annuler. (Sur le chemin du daemon, `DaemonChannelBridge.cancelSession` (`:332`) n'est atteint que depuis la branche `steer`, qui est exclue pour les groupes tag.)
- **Garde de levée jamais déclenché :** sur les deux chemins, `bridge.prompt()` est invoqué uniquement à la fin de la chaîne `sessionQueues`, après que l'exécution précédente s'est résolue et (pour les tours humains) que `activePrompts` s'est vidé — ainsi, la levée de chevauchement de `DaemonChannelBridge` (`:257-261`) est structurellement inatteignable pour le trafic tag.

Lors du déclenchement :

1. **Résoudre la session partagée** via `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)` (`SessionRouter.ts:72`). `'thread'` → un seul `sessionId` pour tout le groupe, donc le déclenchement atterrit dans le contexte que voient les humains. Si la session restaurée a été supprimée, `resolve()` en crée et persiste une nouvelle.
2. **Mettre en file d'attente, jamais préempter** (followup via `sessionQueues`). Délibérément pas `steer`.
3. **Marqueur + attribution (Fix #7).** Préfixe `[Scheduled task "<label>" set by <createdBy>]\n`. L'identité `createdBy` est **portée par l'exécution en file d'attente**, et non jointe par horodatage plus tard, afin que tout appel d'outil/autorisation soulevé pendant ce déclenchement soit attribué à _ce_ tour proactif (§6.4).
4. **Capture + push.** `dispatchProactive` retourne le texte de complétion ; le scheduler vérifie `adapter.canColdSend`, puis appelle `channel.pushProactive(target.chatId, text)` (fail-loud si `false`).

#### Push cold-group sur DingTalk

**Limitation vérifiée :** `DingtalkAdapter.sendMessage()` envoie uniquement via le `sessionWebhook` mis en cache par `conversationId` (`:84,134-142`), peuplé uniquement en entrée (`:505-517`). Groupe froid (cold group) → retour silencieux (`:137-141`).

**Correctif — `pushProactive` via l'API DingTalk 主动消息 群发 (contrat maintenant VÉRIFIÉ, OD-7 résolu).** La forme d'appel est également précédée dans le dépôt (`emotionApi` fait des POST vers `api.dingtalk.com/v1.0/robot/...` avec l'en-tête `x-acs-dingtalk-access-token` et le corps `{ robotCode, openConversationId, ... }`, `:188-197`).

**Endpoint et paramètres vérifiés** (voir §6.5 pour les notes sources complètes ; confiance notée par élément) :

- **Endpoint :** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(confiance élevée ; doc officielle d'envoi + aliyun ask/559227)_.
- **`robotCode`** (REQUIS, string) : l'identifiant du robot issu de l'installation du robot dans le groupe ; même espace de valeurs que `appKey` pour les robots internes à l'entreprise → utiliser `config.clientId` (`:184,435`). Pas de nouveau credential. _(confiance élevée)_
- **`openConversationId`** (REQUIS, string) : l'identifiant de conversation ouverte préfixé par `cid` du groupe cible ; les codes d'erreur `miss.openConversationId`/`invalid.openConversationId` confirment qu'il est requis et validé. Persister dans `ChannelCronJob.target.chatId` — stable entre les redémarrages, contrairement à `sessionWebhook`. _(confiance élevée)_
- **`msgKey`** (REQUIS, string) : clé du modèle de message ; **`'sampleMarkdown'`** pour le markdown (`'sampleText'` pour le texte brut). _(confiance élevée ; doc message-type + aliyun ask/585232)_
- **`msgParam`** (REQUIS, **une _string_ encodée en JSON**, pas un objet imbriqué) : pour `sampleMarkdown` la string est `"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"`. _(confiance élevée ; champs title/text markdown de la doc message-type, exemple de texte verbatim de aliyun ask/585232)_
- **`coolAppCode`** (OPTIONNEL) : uniquement lorsque le robot est installé en tant que cool app de groupe (群聊酷应用) ; non requis pour un simple robot d'application interne à l'entreprise. _(confiance moyenne)_
- **`conversationId` == `openConversationId` ?** Pour le callback @ de groupe standard, **traiter le `conversationId` du callback (préfixé par cid) comme directement utilisable en tant que `openConversationId`** — corroboré par des sources communautaires + format `cid` correspondant. **Signalé (confiance moyenne) :** les docs officielles ne contiennent pas de phrase verbatim les équivalant pour un robot standard (non cool-app). Le chemin garanti par la doc est l'API de conversion `chatId → openConversationId` (ou sa capture depuis l'API de création de groupe / JSAPI `chooseChat` / un callback cool-app qui délivre `openConversationId`+`coolAppCode` directement). **Règle de fallback :** si un envoi retourne `invalid.openConversationId`, utiliser l'API de conversion `chatId → openConversationId`.

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // verified high

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // refreshed independently of SDK connect lifecycle
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* refresh once; else set lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // reuse chunker IF the template length budget matches
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam is a STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // on invalid.openConversationId → convert via chatId API, retry
  }
}
```

`sendMessage()` devient : essaie d'abord le `sessionWebhook` en cache (peu coûteux, pas de consommation de token) ; sinon fallback sur `pushProactive()`. **Défaut de base** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`, donc **Feishu n'a besoin d'aucun override** (`FeishuAdapter.sendMessage()` fait déjà des envois proactifs vers n'importe quel `chatId` avec un `tenant_access_token` stable, `:622-676` ; `canColdSend = true`). DingTalk est le seul adaptateur divergent — l'asymétrie DingTalk-first. Le flag `canColdSend` (ci-dessus) permet au moteur de **échouer bruyamment (fail loudly)** sur un adaptateur réactif uniquement au lieu de supprimer silencieusement.

**Contraintes de déploiement strictes (pas de code) :** le bot d'org doit être (a) un bot interne à l'entreprise publié, (b) avoir reçu l'autorisation de message de groupe proactif, (c) un membre du groupe cible (installé via cool app de groupe / application interne à l'entreprise / application tierce, détenant son `robotCode`) _(confiance élevée qu'une autorisation doit être activée ; confiance élevée que bot installé + robotCode sont des prérequis)_, (d) avoir son `openConversationId` enregistré. Nous persistons `conversationId` la première fois que le bot voit _n'importe quelle_ entrée dans un groupe, donc « froid » = _inactif_, pas _jamais vu_ ; un groupe vraiment jamais vu ne peut pas recevoir de push jusqu'à ce que son `openConversationId` soit obtenu via l'API de conversion (limite stricte). **Changement d'adaptateur requis :** aujourd'hui seul `sessionWebhook` est mis en cache (`:516-517`) ; nous devons également persister `conversationId` (store recommandé : un `~/.qwen/channels/dingtalk-groups.json` séparé, découplé de la durée de vie de la session afin que les groupes froids et les cron sans session active soient représentables).

> **TOUJOURS SIGNALÉ (faible confiance) — garder visible selon OD-7 :** (1) le **code/nom d'affichage exact du point d'autorisation** pour « envoyer proactivement un message de groupe » dans la console 权限管理 de l'application DingTalk n'est pas épinglé depuis les docs — DingTalk l'affiche sous la 权限管理 de l'application comme une autorisation d'envoi de message/robot (généralement la famille robot-message, par ex. `qyapi_robot_sendmsg` / 企业机器人发送消息权限) ; confirmer dans la console, ne pas affirmer le code de manière stricte. (2) La phrase officielle unique et faisant autorité équivalant le `conversationId` du callback à `openConversationId` pour un robot standard (non cool-app) n'a pas été trouvée verbatim lors de cette session — raccourci à forte probabilité, mais le chemin d'obtention garanti par la doc est l'API de conversion `chatId → openConversationId`. Les pages de la plateforme ouverte DingTalk sont rendues en JS et n'ont pas pu être entièrement scrapées lors de cette session ; les faits endpoint/params/token ont été confirmés de manière croisée via le miroir de doc apifox et le Q&A développeur Aliyun citant les exemples de requêtes officiels.

#### Cycle de vie Auth & token (vérifié ; le risque de faisabilité porteur)

**En-tête Auth (confiance élevée).** Tous les appels v1.0 (y compris `groupMessages/send`) passent le token dans l'en-tête de requête `x-acs-dingtalk-access-token: <accessToken>` plus `Content-Type: application/json` — exactement l'en-tête que `emotionApi()` (`:188-207`) et `downloadMedia()` (`media.ts:36-43`) utilisent déjà.

**Obtention du token (confiance élevée).** Application interne à l'entreprise, style v1.0 : `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` avec le corps JSON `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`. (L'équivalent legacy `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` retourne `{access_token, expires_in:7200}`, mais ce token legacy est pour les anciens endpoints `oapi` ; pour les APIs v1.0 de `api.dingtalk.com` utiliser le `accessToken` v1.0 dans l'en-tête `x-acs-dingtalk-access-token`.)

**Expiration et mise en cache (confiance élevée).** Les tokens expirent en **7200 s (~2 h)** et DOIVENT être re-récupérés après expiration ; dans la fenêtre de validité, les récupérations répétées retournent le même token et le renouvellent. **Mettre en cache par application ; ne pas appeler l'endpoint de token à chaque requête** (les appels fréquents sont throttled).

**Pourquoi c'est le risque porteur.** Le SDK Stream récupère l'`access_token` **une seule fois au moment de la connexion** via `GET .../gettoken` à l'intérieur de `getEndpoint()` (`client.mjs:85-87`) et **ne le rafraîchit jamais** ; `getAccessToken()` retourne la valeur en cache (`DingtalkAdapter.ts:172-174`). `autoReconnect` ne re-récupère que lors de la _fermeture_ du socket (`client.mjs:157-163`) — un socket stable et de longue durée de vie conserve un token obsolète au-delà du TTL de ~2 h, et tout envoi proactif (ainsi que les chemins emotion/media existants) échoue silencieusement une fois qu'il expire. **La fonctionnalité proactive doit posséder le rafraîchissement du token :** un `tokenManager` qui récupère via l'endpoint v1.0 `oauth2/accessToken` sur un timer (avant l'expiration de ~2 h) et/ou sur un 401, mettant en cache par application indépendamment du cycle de vie de connexion du SDK (OD-7). C'est l'échec le plus probable du type « fonctionne dans la démo, meurt après 2 heures ».

**Limites de débit (vérifiées, confiance mixte — garder signalé) :** (1) concurrence de l'API côté serveur par application ~20 QPS sur DingTalk Standard, avec un quota mensuel Open API ~10 000/mois (Professional ~500k, Dedicated ~5M) _(confiance moyenne-élevée)_. (2) Une limite de **20 messages/minute → ~10 min de throttle** par robot fréquemment citée est documentée pour les **robots webhook de groupe personnalisés** ; elle est couramment appliquée comme guide pratique pour le chemin d'envoi du robot orgapp mais n'a **pas** été explicitement confirmée sur la page `groupMessages/send` lors de cette session — **considérer le chiffre exact de 20/min pour `groupMessages/send` avec une confiance faible/moyenne.** De plus : ne pas sur-appeler l'endpoint de token (throttle séparé). Le scheduler doit limiter le débit de ses propres envois de manière conservatrice et battre en retraite (back off) sur les réponses de throttle.

#### Instructions permanentes (demandes récurrentes NL → store → consommation)

Capture à deux niveaux dans `handleInbound()` après le passage des portes (`:240-252`) : une commande explicite **`/schedule "0 9 * * 1-5" post the open PR list`** (analysée avec `parseCron`, pas d'aller-retour modèle), et un outil modèle Phase-2 `schedule_task(cron, prompt, recurring, label)`. Les deux appellent `store.add({...})` → persiste → `scheduler.reschedule(job)`, puis répond dans le canal. `/schedule list|cancel <id>|disable <id>` lit/écrit le store. **Persistance fail-closed :** refuser d'acquitter `/schedule` si l'écriture lève une erreur.

#### Modes de défaillance

- **Gateway down au moment du déclenchement :** la récupération fusionne les déclenchements récurrents en retard en un seul rattrapage ; les one-shots passés se déclenchent une fois puis sont supprimés.
- **Crash de l'agent en plein déclenchement :** `bridge.prompt()` rejette ; `attachDisconnectHandler` (`start.ts:241,403`) re-spawn (Phase 0) / le daemon se rattache (Phase 1+). Le scheduler définit `lastError`, n'horodate pas `lastFiredAt` pour les récurrents → retenté. At-least-once ; clé de déclenchement arrondie à la minute + `lastFiredAt` déduplique.
- **Session reaped / `loadSession` échoue :** `resolve()` crée une nouvelle session (transcript de groupe perdu ; les instructions permanentes doivent être autonomes). La mémoire du canal (§6.3) est le plancher de récupération.
- **L'adaptateur ne peut pas faire de cold-send (`canColdSend=false`) :** le scheduler loggue + enregistre `lastError`, affiché dans `/schedule list` ; jamais silencieux.
- **Push cold-group vers un groupe supprimé/autorisation révoquée :** non-2xx → `lastError` ; `invalid.openConversationId` → tentative de conversion `chatId → openConversationId` + retry une fois.
- **Token expiré :** `tokenManager` rafraîchit une fois + backoff ; `consecutiveFailures` ≥ N → auto-désactivation avec un enregistrement visible par l'opérateur.
- **Deux gateways sur un seul workspace :** `checkDuplicateInstance()` (`start.ts:170-179`) garde l'instance unique ; enregistre de plus un token de verrouillage dans `cron.json`.
### 6.3 Mémoire et apprentissage par canal (Build Area 3)

Un tag doit _se souvenir du groupe dans le temps_ sans fuiter dans un groupe frère. Aujourd'hui, la mémoire de qwen-code est **globale au workspace** : pas d'axe chat/canal/groupe/session.

> **Faits sur la topologie / les dépendances (Fix #3).** Deux contraintes strictes façonnent le câblage : (1) Dans la topologie par défaut `AcpBridge`, il n'y a **pas de daemon `qwen serve` ni de route `POST /workspace/memory`** — l'enfant `--acp` n'a pas de client HTTP ; même après la migration du daemon en Phase 1+, la route de mémoire est **réservée au daemon et en auth stricte** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). (2) `@qwen-code/channel-base` dépend uniquement de `@agentclientprotocol/sdk` (`packages/channels/base/package.json`), **et non** de `@qwen-code/qwen-code-core`, donc `ChannelBase` **ne peut pas** `import { writeWorkspaceContextFile }`. Le design corrigé écrit/lit donc la mémoire du canal **in-process via le helper core, atteint depuis `channel-base` via des callbacks injectées par la couche CLI** (`packages/cli`, qui _peut_ dépendre de core) — et non via HTTP, ni en ajoutant une dépendance core à `channel-base`.

#### État actuel : deux scopes, aucun par conversation

`POST /workspace/memory` accepte uniquement `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`), résolu via `resolveContextFilePath()` (`writeContextFile.ts:223-240`) : `workspace → <root>/QWEN.md`, `global → ~/.qwen/QWEN.md`. Le mode append se replie sous `## Qwen Added Memories` (`MEMORY_SECTION_HEADER`, `const.ts:29`) ; un mutex par fichier avec une deadline de 30s sérialise les écritures (`writeContextFile.ts:48-57,159-162`) ; le writer refuse un fichier existant > 16 Mo en append (`MAX_EXISTING_FILE_BYTES`, `:255`). La route est en **auth stricte** (`deps.mutate({ strict: true })`, `:114`) — elle refuse même en loopback sans token. Conséquence : chaque groupe sur un workspace partage un seul `QWEN.md`.

#### Design : un scope de mémoire `channel` indexé par `(channelName, chatId)`

L'unité d'isolation est la **cible de routage**, pas la session (les sessions sont nettoyées en cas d'inactivité, `DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30 min, `run-qwen-serve.ts:94`). La clé existe déjà : `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`). Pour la mémoire de groupe, on indexe sur `(channelName, chatId)`.

**Le layout de stockage** reflète l'arborescence existante `~/.qwen/channels/` :

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitization : rejeter /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, pas de collision/évasion
        QWEN.md                     # "apprentissage dans le temps" à l'échelle du groupe
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

Le nom de fichier respecte `getCurrentGeminiMdFilename()` (`const.ts:49`). Cela maintient la mémoire du canal en dehors de l'arbre de travail, en dehors du workspace lié, et en dehors du chemin de découverte hiérarchique de `QWEN.md` (afin qu'elle ne fuite jamais entre les groupes).

#### Chemin d'écriture (étendre le helper core, ne pas le forker)

Dans `packages/core/src/memory/writeContextFile.ts` :

- Étendre `WriteContextFileScope` (`:80`) de `'workspace' | 'global'` pour ajouter `'channel'`.
- Étendre `WriteContextFileOptions` (`:83-97`) avec `channelKey?: { channelName: string; chatId: string }` ; valider sa présence quand `scope === 'channel'` (imiter la garde d'absolute-path de `:142-146`). `projectRoot` reste requis par l'interface — passer `config.cwd` même s'il n'est pas utilisé pour le scope channel.
- Dans `resolveContextFilePath()` (`:223-240`), ajouter une branche `channel` retournant `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())`. **La signature actuelle de la fonction est `(scope, projectRoot)` — elle doit gagner un param `channelKey`** (fonction privée, changement local). Le mutex par fichier s'indexe sur le chemin résolu, donc deux groupes peuvent écrire en concurrence sans contention.

**Le changement exact de `ChannelBaseOptions` + qui l'injecte (Fix #3).** `channel-base` ne peut pas importer core, donc la couche CLI fournit la lecture/écriture via des callbacks. Étendre le sac d'options (`ChannelBase.ts:9-12` — la vraie interface aujourd'hui est juste `{ router?: SessionRouter; proxy?: string }` ; `config` et `bridge` sont des **args positionnels du constructeur** à `:40-46`, pas des membres du sac). Le sac porte déjà `router` :

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (PAS de nouvelle dépendance core)
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

**Qui les construit et les injecte :** `packages/cli/src/commands/channel/start.ts` (qui dépend de core). Quand `start.ts` construit le sac d'options pour chaque adaptateur, il capture (closure) le `writeWorkspaceContextFile` de core/le helper de lecture et résout le `(channelName, chatId)` approuvé par le serveur depuis `router.getTarget(sessionId)` (`SessionRouter.ts:94`) — l'adaptateur ne fournit jamais le `chatId` depuis le wire :

```ts
// packages/cli/src/commands/channel/start.ts — couche CLI (PEUT dépendre de core)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config & bridge sont des args positionnels de createChannel(name, config, bridge, baseOpts) — pas des membres du sac
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

L'adaptateur ne touche jamais au système de fichiers et `channel-base` ne gagne aucune nouvelle dépendance. (Alternative daemon Phase 2 : une route scopée `POST /channel/:sessionId/memory` qui résout `channelKey` côté serveur ; elle ne peut pas réutiliser `POST /workspace/memory`, qui valide strictement `scope ∈ {workspace, global}` et transmet un `projectRoot` fixe, `:118-125,185-190`. À reporter jusqu'à ce que le moteur proactif ait déjà besoin de lookups `sessionId → target` côté daemon.)

**Fan-out d'événements.** `publishWorkspaceEvent` se trouve sur le `AcpSessionBridge` **côté daemon** (`bridge.ts:3610`), pas côté canal. Sous `AcpBridge` (Phase 0), il n'y a **pas** d'événement `memory_changed` (et aucun n'est nécessaire — un seul processus possède l'écriture et la lecture). Sous la topologie daemon, `publishWorkspaceEvent` se propage en fan-out à **chaque** bus de session actif sans discrimination (`bridge.ts:3649-3675`) ; `BridgeEvent.data` est de forme libre (`eventBus.ts:51`) donc un événement `memory_changed` _peut_ porter `{ scope:'channel', channelName, chatId }`, mais un **filtrage côté abonné** est requis — le publisher ne peut pas scopér la livraison.

#### Chemin de lecture (mémoire → prompt) — bootstrap une fois par session réutilisant `instructedSessions`

Étendre le bloc `instructions` une fois par session (`ChannelBase.ts:343-347`, conditionné par `instructedSessions`) : au premier message d'une session dont la cible a `(channelName, chatId)`, appeler le `readChannelMemory(target)` injecté et préfixer son résultat à côté de `config.instructions`, puis marquer la session dans `instructedSessions` exactement comme aujourd'hui. Parce que le scope `'thread'` partage un seul `sessionId`, cela charge la mémoire **une fois par durée de vie de la session** (la même porte qui empêche déjà de réinjecter `config.instructions`). Aucune dépendance core n'est ajoutée — la lecture passe par le callback injecté. La mémoire du canal n'est **jamais** sur le chemin de découverte hiérarchique ; elle est injectée par session via ce hook.

```ts
// ChannelBase.handleInbound() — bootstrap du premier tour (réutilise instructedSessions)
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

#### Relation avec le persist/restore de SessionRouter et le transcript

| Couche                   | Persiste                                            | Durée de vie                               | Propriétaire                      |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Transcript de session    | Tours de conversation ACP                           | Jusqu'au nettoyage / `/clear confirm` / redémarrage | `Session` (l'agent)      |
| Persist `SessionRouter`  | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | À travers le redémarrage du bridge, via `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Mémoire de canal (nouveau)** | Faits durables distillés sur le groupe        | Indéfinie                                  | `~/.qwen/channels/memory/`        |

Quand `restoreSessions()` échoue à recharger une session (`:196`), le transcript est perdu mais le `QWEN.md` du groupe est intact — la lecture du bootstrap réhydrate la connaissance de l'agent au message suivant. **La mémoire du canal est le plancher de récupération pour le transcript.** "L'apprentissage dans le temps" est une boucle de _distillation_, pas de la persistance brute de transcript : l'agent (ou une tâche déclenchée) résume périodiquement les faits saillants dans le `QWEN.md` du groupe en mode append.

#### Isolation, taille et phasage

L'isolation tient au niveau du chemin (`sales` et `eng` résolvent vers des répertoires/fichiers/mutex `hash(chatId)` différents) tant que le chemin d'écriture porte toujours le `chatId` approuvé par le serveur. C'est une isolation de **contenu**, pas une frontière d'auth (le processus a toujours un seul token global, pas d'identité par utilisateur). Pour une isolation stricte par tenant, exécutez un processus par workspace/tenant (OD-2).

Garde-fous de taille (réutilisation de la mécanique existante) : le plafond de 16 Mo pour les fichiers existants en append est hérité gratuitement (mapper `WorkspaceMemoryFileTooLargeError` à un "la mémoire du groupe est pleine, lancez une passe de compaction" visible par l'utilisateur) ; une route Phase 2 réutilise le plafond de 1 Mo par écriture (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`) ; la compaction en mode replace (`writeContextFile.ts:202-211`) est la réponse à long terme à la croissance illimitée.

- **Phase 0/1 :** ajouter le scope `channel` + `channelKey` à `writeContextFile.ts` ; livrer `~/.qwen/channels/memory/` + `meta.json` ; câbler les callbacks `readChannelMemory`/`writeChannelMemory` de la couche CLI via `ChannelBaseOptions` et la lecture bootstrap ci-dessus. Pas de nouvelle route HTTP, pas de dépendance `channel-base → core`.
- **Phase 2 :** ajouter la route scopée `POST /channel/:sessionId/memory` (topologie daemon) et `memory_changed` avec filtrage côté abonné ; ajouter un déclencheur de distillation et une CLI `qwen channel memory <name> <chatId>`. **Contrainte de distillation :** le cron est scopé à la session et meurt au `dispose()` (`Session.ts:791,799-803,1056`) ; la distillation doit se déclencher pendant qu'une session est active — à la fin d'un tour, sur un `/remember` explicite, ou sur une session maintenue au chaud — jamais depuis un scheduler d'arrière-plan indépendant.

### 6.4 Gouvernance : Budgets de tokens et journal d'audit (Build Area 4)

Un agent résidant dans un canal que n'importe quel membre peut piloter — et qui peut agir de manière proactive — a besoin de limites de dépenses, d'une piste d'audit enregistrant _qui_ a demandé _quoi_, et d'une isolation par identité. qwen-code fournit trois des quatre primitives : `rate-limit.ts` (token buckets par clé), l'anneau `permission-audit.ts`, et `MultiClientPermissionMediator`. Cette zone les compose et comble les lacunes (pas de budget de coût nulle part ; aucune ligne d'audit ne porte un expéditeur humain). Principe directeur : **refuser, ne pas tronquer** — mais, selon le Fix #6, un budget _estimé_ ne refuse jamais strictement un prompt utilisateur ; il émet seulement un WARN.

#### Quel processus possède la gouvernance ?

| Déploiement                                         | Bridge                                                  | Mécanique `serve/` disponible                                                                   |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 — `qwen channel start` / `AcpBridge`**    | spawn son propre enfant stdio `--acp` (`start.ts:213,356`) | **Aucune.** Pas de serveur Express, pas de `rate-limit.ts`, pas de routes HTTP, pas d'anneau `permission-audit.ts`. |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | canaux hébergés dans le daemon                          | Toute la mécanique `serve/` : usage réel, médiateur, rate-limit, anneau d'audit, routes.        |

Résolution : **l'admission de budget + le refus vivent dans `@qwen-code/channel-base`** (le point de contrôle commun `ChannelBase.handleInbound()`), dans un nouveau **`packages/channels/base/src/BudgetLedger.ts`** — _et non_ `serve/budget.ts`, car le processus de canal Phase 0 ne charge jamais `serve/`, et la couche de canal est le seul endroit avec le contexte d'expéditeur humain. **L'audit + l'attribution** trouvent également leur origine dans la couche de canal. Sur le chemin du daemon Phase 1+, le ledger lit l'usage réel et est _de plus_ exposé via une route ; sur le chemin Phase 0, il estime et est exposé via une commande de canal (`/audit`).

#### Où la gouvernance s'attache aujourd'hui (et les lacunes)

| Préoccupation               | Mécanisme existante                                                                                                                                                | Lacune                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Limitation du taux de requêtes | token buckets par `(clientId\|ip)`, 3 niveaux (`rate-limit.ts`)                                                                                                 | Pas de tokens/coût, seulement le nombre de requêtes ; `serve/` uniquement        |
| Journal de décisions après coup | anneau FIFO borné, 5 types d'enregistrements (`permission-audit.ts`)                                                                                           | Pas de `senderId` humain, seulement `clientId` ; pas de route GET ; anneau détenu par closure (`:17-25`) |
| Approbation réelle par action | quatre politiques + quorum de consensus (`permissionMediator.ts:621-637`)                                                                                        | Votes attribués à `clientId`, pas à l'humain ; un canal = un client              |
| Scope outil/données par canal | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`) ; `getPermissionsAllow()` (`:3158`) ; `getPermissionsDeny()` (`:3182`) ; filtre d'approbation MCP (`:3327-3333`) | Le scope est par `Config`/processus ; pas de chemin d'arg de spawn vers l'enfant `--acp` |

Deux faits structurels : (1) **le daemon n'a pas d'identité humaine** (`BridgeEvent.originatorClientId`, chaque `PermissionVote.clientId` sont des identifiants de transport ; `senderName` ne survit que jusqu'à `SenderGate.check()`), donc toute corrélation humain↦`clientId`↦`sessionId` doit être établie à la frontière du canal ; (2) **l'auth et le rate-limit sont globaux au daemon** (single bearer token `auth.ts:259-266` ; rate-limit indexé sur `(clientId, ip)`), donc la gouvernance par canal doit trouver son origine dans l'adaptateur.

#### Budgets de tokens et de coûts — un nouveau `BudgetLedger`, consultatif jusqu'à l'existence d'un usage réel (Fix #6)

**D'où vient l'usage — mise en garde (OD-9).** Un budget de tokens ne peut débiter que des chiffres _réels_ une fois que le modèle rapporte l'usage. En session, `Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) stocke `usageMetadata.promptTokenCount` dans `lastPromptTokenCount`, **écrasé à chaque tour** — _et non_ un compteur de facturation cumulatif. Sur le chemin `AcpBridge` Phase 0, le flux ACP `session/update` ne porte pas de `usageMetadata`, donc **la v1 ne peut pas débiter de vrais comptes de tokens** ici. Sur le chemin du daemon Phase 1+, le daemon observe l'usage in-process et _peut_ débiter précisément.

**Règle d'application (Fix #6 — critique) :**

- **Les budgets estimés sont CONSULTATIFS uniquement.** Quand le seul chiffre disponible est une estimation côté canal (nombre de caractères prompt+réponse ÷ une constante caractères-par-token), le ledger émet un **WARN/alerte** aux seuils et peut attacher un avertissement à la réponse — il **ne refuse jamais strictement un prompt utilisateur**. Une estimation faux-positif ne doit pas faire taire une vraie demande utilisateur.
- **Refus STRICT uniquement sur des chiffres réels.** Un budget peut _refuser_ un prompt (refus-et-non-troncature) **uniquement** quand la source de débit est le chemin d'usage réel du daemon (daemon hébergé Phase 1+). Jusqu'à là, le budget est de l'observabilité + de l'alerte, pas une porte.

Cela rend le budget v1 honnête : il avertit tôt partout, et applique des limites strictes exactement là où les chiffres sont fiables.

**Module `BudgetLedger.ts`**, modélisé sur `rate-limit.ts` (factory, Map-of-buckets avec GC, overflow fail-open) :

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × taux par modèle
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => consultatif ; 'daemon' => peut refuser strictement
export interface BudgetLedger {
  // allowed=false uniquement quand source==='daemon' ; les estimations retournent allowed=true + drapeaux warn
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
  ): void; // déclenche les alertes de seuil
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **Sémantique d'héritage par défaut + rollup org strictest-wins (OD-9).** `admit(key)` résout la fenêtre effective avec le fallback de style `GroupGate` `channel → '*' → built-in`. Un prompt doit passer **à la fois** la fenêtre par canal et le **rollup "org" par processus** (strictest-wins, débiter les deux). "org" = le rollup de _ce processus unique_ ; un vrai plafond org multi-processus nécessite un store partagé (hors scope). **Fenêtre quotidienne fixe.**
- **Alertes 75%/95%.** `debit()` déclenche `onAlert` une fois par seuil par fenêtre, en utilisant l'idiome d'hystérésis de l'event-bus (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`). **Poster l'alerte est un envoi proactif** — une dépendance stricte à la Build Area 2 (mise en garde sur les groupes froids DingTalk ; Feishu poste librement). Dégrader en "attacher l'avertissement à la prochaine réponse" quand aucun canal proactif n'existe.
- **Refus-et-non-troncature (uniquement quand `source==='daemon'`).** Vérifié à l'admission, _avant_ `bridge.prompt()` (`:425`). Sur un `!allowed` d'usage réel, l'adaptateur appelle `sendMessage(chatId, refusal)` et retourne — il **n'entre pas** dans le chemin steer/cancel, donc un prompt en cours se termine et le _suivant_ est refusé. Sur une estimation, `allowed` est toujours vrai (consultatif).
- **Le coût (`usd`)** multiplie les tokens par une table de taux par modèle fournie par l'opérateur (qwen-code est multi-modèle ; pas de prix unique). Entrée manquante → repli sur `tokens` + avertissement unique.
- **Config.** `ChannelConfig` (`types.ts:27-51`) gagne `budget?: { unit; limit; windowMs; reset? }`, parsé par `parseChannelConfig`. Sur le chemin du daemon, `ServeOptions` gagne `--budget-org-daily`/`--budget-unit`, et `daemon-status.ts` (qui rapporte déjà `rateLimit`, `:295-297`) gagne un bloc `budget` parallèle.
#### Audit log — `senderId` humain transporté avec le tour (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`, FIFO 512) est le bon substrat, mais chaque ligne est indexée par `clientId`. **Design — une liaison sender↦turn côté canal** (`RequestAttributionRing.ts`, même forme FIFO).

**La jointure naïve par timestamp est incorrecte en mode `followup` (Fix #7).** La v1 proposait de joindre une ligne de permission à "la ligne d'attribution la plus récente pour ce `sessionId` dont le `recordedAtMs` précède le `issuedAtMs` de la permission." En mode `followup`, plusieurs senders s'ajoutent à la file d'attente sur **un seul** `sessionId` via `sessionQueues` ; le sender ajouté le plus récemment à la file n'est **souvent pas** celui dont le tour est en cours d'_exécution_ lors du déclenchement de l'appel d'outil/de la permission. La jointure par timestamp attribue donc systématiquement de manière incorrecte.

**Fix : transporter le `senderId` AVEC le prompt mis en file d'attente.** Lorsque `handleInbound()` ajoute à la file `sessionQueues` (et lorsque le planificateur ajoute un déclenchement proactif à la file), l'élément de la file / le contexte de tour synthétique transporte son propre `{ senderId, senderName, requestSeq }`. L'attribution pour tout appel d'outil/permission levé pendant un tour est lue depuis **le tour en cours d'exécution** (la tête de la FIFO), et non depuis un scan par timestamp. Concrètement : la chaîne `sessionQueues` applique un `currentTurnAttribution.set(sessionId, {senderId, ...})` par tour au moment où l'exécution atteint la tête (juste avant `bridge.prompt()`), et l'efface lorsque l'exécution se résout ; les lignes d'audit lisent cette map. Les déclenchements proactifs appliquent `createdBy` de la même manière (§6.2 étape 3). C'est exact pour le tour en cours d'exécution et immunisé contre l'ordre de mise en file d'attente.

Ajoute un sixième type de ligne **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** à l'admission, afin que l'audit réponde à "qui a démarré cette tâche" même pour un travail en lecture seule. L'union `PermissionAuditEntry` (`:57-104`) est **fermée** et les consommateurs font un switch sur `kind`, donc l'élargir (ou ajouter un ring sibling) impacte tous les consommateurs.

**Query path.** Daemon Phase 1+ : ajoute `GET /workspace/audit` (bearer + `createMutationGate` strict, `auth.ts:356`), exposant le ring depuis la closure du bridge (la doc d'en-tête du fichier anticipe cela, `:22-25`). `AcpBridge` Phase 0 : une commande de canal `/audit` via `sendMessage`. **Durabilité :** le ring contient 512 entrées en mémoire, **perdues au redémarrage** — une limitation connue de la v1 ; le suivi (OD-11) persiste un **audit joint append-only dans `~/.qwen`**.

**Les votants du consensus ne sont pas des humains.** `votersAtIssue` sont des `clientId` stampés par le daemon, et un canal = un `clientId`, donc le "consensus" out-of-the-box dans un groupe DingTalk est un consensus entre _clients daemon_. Le vote au niveau humain nécessite une liste d'approbateurs enregistrés mappant `senderId` → un vote distinct — l'exigence de la Phase 2 OD-3, et non une fonctionnalité résolue.

#### Isolation des outils et des données par identité

1. **Allow/deny d'outils par canal.** `Config` supporte `coreTools`/`allowedTools`/`excludeTools` (`:727-729`), exposés via `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()`. (Il n'y a **pas** de `getAllowedTools()`/`getBlockedTools()`.) En Phase 0, le chemin `AcpBridge` spawn un child par canal, mais `AcpBridgeOptions` ne transporte que `{ cliEntryPath, cwd, model }` (`:17-21`) et `start()` ne forward que `--acp`+`--model` (`:56-63`). Fournir un scope par canal nécessite de NOUVEAUX champs `AcpBridgeOptions`, de NOUVEAUX flags `--acp` dans `Config`, ainsi que de nouveaux champs `ChannelConfig`. Sur le chemin du daemon Phase 1+, il y a une `Config` par daemon, donc le scope est par daemon (par workspace, OD-2) plutôt que par child de canal.
2. **Scoping MCP par canal.** `Config.getMcpServers()` filtre par `allowedMcpServers` (`:3327-3333`), défini à la construction. Ajoute `allowMcpServers?: string[]` à `ChannelConfig`, propagé dans le même chemin spawn-arg (ou le tableau `mcpServers` passé par `AcpBridge.newSession()` — hard-codé à `[]` à la ligne `:133`).
3. **`sessionScope` comme limite de données.** `'thread'` fait qu'un groupe partage un seul working tree/contexte ; l'isolation inter-_canaux_ est appliquée par des routing keys namespacées par `channelName`. L'isolation par sender au sein d'un groupe `'thread'` n'est _pas_ prévue par design.

**Limite assumée :** l'auth est un unique token global au daemon sans principal par utilisateur, donc l'isolation est par **canal**, et non par humain. Une véritable isolation des outils par humain nécessite la Phase 3.

#### Chemin d'admission

```
Entrant DingTalk
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existant :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NOUVEAU]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (PAS dans steer/cancel)
            ↳ source==='estimate': allowed toujours true → WARN uniquement (Fix #6)
     3. mise en file d'attente dans sessionQueues AVEC {senderId, senderName, requestSeq}  [NOUVEAU — Fix #7]
        + ligne task.requested
     4. en tête de FIFO, stamp currentTurnAttribution → bridge.prompt(...)   [existant :425]
            ↳ appel d'outil → permission (auto-approuvé sur AcpBridge Phase 0 ; médiateur sur daemon Phase 1+)
                ↳ la ligne d'audit lit currentTurnAttribution[sessionId]  (le tour en EXECUTION)
     5. à la fin : usage connu (daemon) ou estimé (AcpBridge) → budget.debit(..., source)  [NOUVEAU]
            ↳ le post d'alerte 75%/95% est proactif → dépend de Build Area 2
```

Dépendances strictes à signaler : (1) le débit réel des tokens (et donc le refus strict) nécessite le chemin d'usage du daemon Phase 1+ — jusqu'à là, les budgets sont consultatifs (Fix #6) ; (2) les alertes de budget proactives nécessitent Build Area 2 ; (3) le vote de consensus au niveau humain et l'attribution d'audit au niveau humain nécessitent la liste d'approbateurs enregistrés OD-3.

### 6.5 Plateforme DingTalk (principale) + suivi Feishu

> **Note de câblage (architecture actée).** Phase 0 : `qwen channel start` construit `AcpBridge` (`start.ts:213,350` ; `AcpBridge.ts:38`), qui spawn `node <cli> --acp` et expose `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) ; le scoping de session est géré par `SessionRouter`, pas par le bridge. Phase 1+ : les canaux sont hébergés sous `qwen serve` via `DaemonChannelBridge` (ses défauts `'thread'` à `:229,240` ; son throw en cas de chevauchement à `:257-261`). La migration est actée, pas optionnelle (§1).

#### Le problème d'expiration du sessionWebhook

Le mode Stream de DingTalk délivre chaque message entrant avec un `sessionWebhook` à courte durée de vie ; l'adaptateur le met en cache avec pour clé `conversationId` (`:84`, peuplé dans `onMessage()` `:517`), et `sendMessage()` (`:134-170`) le recherche, loggant `No webhook for chatId` et retournant silencieusement s'il est absent (`:137-141`). Deux faits fatals pour l'usage proactif : (1) le webhook **expire** (le type SDK `RobotMessageBase` transporte `sessionWebhookExpiredTime`, `constants.d.ts:13`, mais l'interface `DingTalkMessageData` de l'adaptateur l'omet et ne le lit jamais — un webhook en cache peut être obsolète même pendant la fenêtre active) ; (2) la map est **uniquement** peuplée par le trafic entrant, donc un groupe froid n'a aucune entrée.

#### Push vers les groupes froids via l'API robot proactive-message (主动消息) — VÉRIFIÉ (OD-7)

La solution est l'API bot proactive-message de DingTalk — **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _(endpoint vérifié haut)_. Contrairement au webhook, il est adressé par un **`openConversationId`** durable _(vérifié haut)_, s'authentifie avec le header **`x-acs-dingtalk-access-token`** _(vérifié haut — déjà utilisé par `emotionApi()` `:188-207` et `downloadMedia()` `media.ts:36-43`)_, et transporte le **`robotCode`** du bot _(vérifié haut ; = `config.clientId`, `:184,435`)_. Le body est une paire `msgKey`/`msgParam` _(vérifié haut)_ où **`msgParam` est lui-même une string encodée en JSON** (pas un objet imbriqué), par ex. pour `msgKey:'sampleMarkdown'` :

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // durable group id (from inbound conversationId; convert if invalid)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 chars\"}",
}
```

Il s'agit d'une **nouvelle méthode aux côtés de `sendMessage()`**, pas d'une modification de celle-ci (esquisse dans §6.2). `ChannelBase.sendMessage()` reste abstrait (`:81`) ; le moteur proactif a besoin de la nouvelle seam sortante `pushProactive?(target, text)` — toute nouvelle et la livraison centrale de la plateforme. **`vérifié [haut] selon la doc officielle send + aliyun ask/559227, ask/585232 + doc message-type`** pour la forme endpoint/params/`msgParam`.

**Prérequis de permission :** une permission robot/message "envoyer un message de chat de groupe proactif" doit être accordée à l'application interne à l'entreprise avant que `groupMessages/send` ne fonctionne (la doc send liste ce prérequis) _(vérifié haut qu'une permission doit être activée)_. **TOUJOURS SIGNALÉ (faible confiance) :** le nom d'affichage/code exact du point de permission n'est pas épinglé à partir des docs de cette session — la console DingTalk l'affiche sous 权限管理 de l'app comme une permission d'envoi de message robot (généralement la famille robot-message, par ex. `qyapi_robot_sendmsg` / 企业机器人发送消息权限) ; confirmer dans la console, ne **pas** hard-asserter le code. L'adaptateur doit logger `resp.status` + body sur `!resp.ok`/throw — le empty-catch actuel de `emotionApi` (`:214-216`) est l'anti-pattern qui cacherait une mauvaise configuration de permission manquante.

#### Acquisition et persistance de openConversationId

Deux sources : (1) **récolte depuis l'entrant** — chaque message transporte `conversationId` (`:506`), transmis en tant que `openConversationId` à l'API emotion (`:197`) ; le persister dès qu'on le voit. **`vérifié [moyen] selon aliyun ask/559227, ask/585233 + format 'cid' correspondant`** que le `conversationId` du callback (préfixé par cid) est utilisable directement comme `openConversationId` pour le callback @ de groupe standard. **TOUJOURS SIGNALÉ :** aucune phrase officielle textuelle ne les équivaut pour un robot non-cool-app ; le chemin d'obtention garanti par la doc est l'**API de conversion `chatId → openConversationId`** (`obtain-group-openconversationid`), ou la capture depuis l'API group-create / JSAPI `chooseChat`, ou un callback cool-app (qui délivre `openConversationId`+`coolAppCode` directement). **Fallback :** sur `invalid.openConversationId`, convertir via l'API `chatId` et réessayer. (2) **événements bot-added-to-group** via `registerAllEventListener` (`client.mjs:58-61`) : les événements circulent `onEvent → onEventReceived` sous le `topic:'*'` par défaut (`client.mjs:14-19,241-254`), tandis que l'adaptateur n'installe que le _callback_ robot (`:107`), donc les événements org/bot sont actuellement reçus et jetés dans le no-op par défaut (`client.mjs:35-37`). Le topic de l'événement et le champ `openConversationId` au moment de l'installation sont **non vérifiés** — ne pas hard-coder un nom d'événement.

**Persistance.** Utiliser un store **séparé `~/.qwen/channels/dingtalk-groups.json`**, pas la cible `SessionRouter` : l'ID du groupe doit survivre à n'importe quelle session (le push proactif de groupe froid piloté par cron se déclenche sans session active), et une `PersistedEntry` n'existe qu'une fois qu'une session a été créée pour la routing key — coupler l'identité du groupe à la durée de vie de la session laisse les groupes froids non représentés.

#### Le scope multijoueur est opt-in, pas par défaut

Le scope `'thread'` (`:53`) est ce qui donne un agent partagé par groupe, mais `parseChannelConfig()` définit par défaut `sessionScope` à `'user'` (`config-utils.ts:91-92`), ce qui donne des sessions _par membre_. L'opérateur doit définir explicitement `sessionScope: 'thread'`. Une fois défini, deux conséquences multijoueur s'appliquent : (a) le `dispatchMode: 'steer'` par défaut **annule** le travail en cours lorsque n'importe quel membre envoie un message (`:371-379`) — le profil de tag définit `'followup'` (§6.1) ; (b) le manque d'attribution du sender (§6.1).

#### Parsing @ entrant

Le gating de groupe fonctionne : `GroupGate` utilise `envelope.isMentioned`, défini depuis `data.isInAtList` (`:520`). Le nettoyage du texte retire uniquement le **premier** `@token` (`:527-529`), positionnel et non basé sur l'identité — `@qwen @alice` est correct, mais une mention humaine en premier retirerait celle de l'humain. Un suivi de durcissement retire par le propre `chatbotUserId` du bot. Le contexte de réponse/citation est extrait (`extractQuotedContext()`, `:272-298`), avec `isReplyToBot` calculé par rapport à `chatbotUserId` (`:280,292`), et `referencedText` injecté en tant que `[Replying to: "…"]` (`ChannelBase.ts:317-319`). **L'attribution du sender est close dans §6.1** via le préfixe `[senderName]`.

#### Rendu Markdown / card

`markdown.ts` fait déjà la normalisation de plateforme que le chemin proactif réutilise : tables → texte pipe (`convertTables()`, `:44-80`), chunking à 3800 caractères avec équilibrage des fences (`splitChunks()`, `:84-188` ; `CHUNK_LIMIT=3800`, `:10`), extraction du titre découpée à 20 caractères avec fallback `'Reply'` (`extractTitle()`, `:190-195`). La réutilisation est **conditionnelle** au fait que le template `sampleMarkdown` accepte le même sous-ensemble markdown et un body jusqu'à **~5000 caractères** _(vérifié haut — doc message-type)_ ; garder `CHUNK_LIMIT` ≤ ce budget. Les cards interactives en streaming (le chemin `TOPIC_CARD`, `constants.d.ts:4`) — l'analogue de la card en streaming de Feishu — sont **hors scope** pour le jalon principal ; le proactif v1 est basé sur des messages markdown.

#### Suivi Feishu (concis)

Feishu est en avance sur exactement l'axe qui compte : **l'envoi proactif est natif** (`sendMessage(chatId, text)` vers n'importe quel `chat_id`, `:622-676` — pas de problème de groupe froid ; `canColdSend = true`), **`tenant_access_token` stable** avec refresh suivi par expiration (`refreshToken()`, `:581-620` — le travail dont DingTalk a encore besoin), **subscription d'événements flexible** (WebSocket ou webhook HMAC, `:146-176`), et **cards en streaming de première classe** (`markdown.ts`, `:742-792`). **Mais les problèmes partagés `ChannelBase`/`SessionRouter` — scope `'thread'` opt-in, annulation `dispatchMode`, attribution du sender manquante, la nouvelle seam sortante — s'appliquent identiquement à Feishu.** Feishu résout _l'accessibilité_, pas _qui-a-dit-quoi_ ni _un-membre-annule-l'autre_. Porter le moteur proactif sur Feishu réutilise directement le `sendMessage()` existant (le défaut de base `pushProactive`) ; le seul nouveau travail sur la plateforme consiste à mapper le groupe cible du moteur sur un `chat_id` persisté et optionnellement à router via le chemin de card en streaming.

---

## 7. Déploiement par phases (Phase 0–2) & MVP

Chaque phase est mergeable indépendamment, se termine par une démo, et est conditionnée par des critères d'acceptation explicites. La **Phase 0** fait que la stack existante se comporte comme un agent résident partagé — config plus quelques petits changements de code, sur `AcpBridge`. La **Phase 1** migre l'hébergement des canaux dans `qwen serve` (architecture actée) et ajoute le moteur proactif et la boucle fermée unique du MVP. La **Phase 2** ajoute la mémoire de canal, les budgets et l'audit.

### Topologie : migration daemon actée (anciennement OD-1)

La décision est **prise**, pas en attente : la Phase 0 est livrée sur `AcpBridge` ; **la Phase 1+ exécute les canaux sous `qwen serve`** (via `DaemonChannelBridge` ou un runner de canal daemon), car la persistance de mémoire par room, le médiateur de permissions, l'audit event-bus, la `promptQueue` FIFO et les routes de requête budget/audit veulent tous le daemon. Le planificateur appartenant au gateway (§6.2) est **neutre à la migration** — il sérialise via `ChannelBase.sessionQueues` quel que soit le bridge — il est donc livré en Phase 1 et n'est pas affecté par le basculement. **Le câblage de la Phase 0 ajoute le chemin d'attachement `DaemonChannelBridge` (ou un flag `--daemon <url>`)** afin que la migration soit une étape de configuration à la limite de la Phase 1, pas une réécriture. Noter le point de vigilance autour duquel le planificateur est conçu : `DaemonChannelBridge.prompt()` ne met **pas** en file d'attente — il _throw_ `Prompt already in flight` en cas de chevauchement (`:257-261`) ; la `promptQueue` FIFO du daemon est côté acp-bridge (`bridge.ts:2855,3082`) ; la sérialisation côté canal est `ChannelBase.sessionQueues` (`:394`), c'est pourquoi le moteur proactif n'appelle jamais `prompt()` pendant qu'un tour est actif (§6.2, Fix #1).

### Phase 0 — Config + Injection d'identité (sur AcpBridge)

**Objectif.** Un groupe DingTalk où n'importe quel membre `@`-mentionne le bot, chaque membre partage une seule session, l'agent sait qui parle, et une tâche en cours n'est pas détruite par le follow-up d'un coéquipier.

**0.1 — Le profil de config "qwen tag"** (principalement `settings.json`) :

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multiplayer: WHOLE group shares ONE sessionId. routingKey → `${name}:${threadId||chatId}` (:53).
    // DingTalk sets NO threadId (:541-551) → key falls back to chatId = conversationId||sessionWebhook (:534).
    // A message with no conversationId would key on the TRANSIENT webhook — treat as a hard error.
    "sessionScope": "thread",

    // groupPolicy defaults "disabled" (GroupGate :13; config-utils :98) — MUST be set or all group msgs drop.
    // In allowlist mode, "*" is NOT a membership wildcard (GroupGate :42); list each chatId. "*" supplies DEFAULTS only.
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "You are the team's shared engineering agent in this DingTalk group...",
  },
}
```

Notes liées à la vérité terrain : `requireMention` a pour défaut `true` (`GroupGate.ts:49`) ; `sessionScope` a pour défaut `'user'` (`config-utils.ts:92`) — `'thread'` est l'intégralité du mécanisme multijoueur ; le défaut de groupe `dispatchMode` devrait être `'followup'` (pas le runtime `'steer'`, `:354`).

**0.2 — Attribution du sender.** Le préfixe `[senderName]` au seed `promptText` (`ChannelBase.ts:316`), conditionné par `isGroup`, **déclenché à chaque tour** (non conditionné par `instructedSessions`), avec le **nouveau flag `Envelope.alreadyPrefixed`** gardant la ré-entrée `collect`. Voir §6.1.

**0.3 — Réconciliation de `dispatchMode`.** Définir explicitement le `dispatchMode` par groupe ; corriger la JSDoc obsolète `types.ts:42` (`'collect'` → `'steer'`) pour que le code et le commentaire s'accordent (OD-5).

**Fichiers touchés (Phase 0).** `start.ts` (ajoute le chemin d'attachement optionnel `DaemonChannelBridge` pour que la migration actée de la Phase 1 soit à un flag près) ; `ChannelBase.ts` (seed `senderName` + garde `alreadyPrefixed` + gate confirm+allowlist `/clear` + `/who`) ; `types.ts` (nouveau champ `Envelope.alreadyPrefixed` + fix JSDoc) ; `docs/` (la recette + les pièges).

**Critères d'acceptation.**

- [ ] Deux membres `@`-mentionnent le bot ; les deux résolvent vers le **même** `sessionId` (assert via les maps `SessionRouter`) ; la routing key est `team-eng:<conversationId>`, pas une URL de webhook.
- [ ] L'agent utilise l'attribution du sender (`[senderName]` présent pour le groupe, absent pour le 1:1) ; la ré-entrée `collect` ne double-préfixe pas (assert le chemin `alreadyPrefixed`).
- [ ] Un message de groupe sans mention est drop (raison `mention_required`) ; un groupe non-allowlisté est drop (`not_allowlisted`).
- [ ] Avec `dispatchMode: 'followup'`, le membre B envoyant un message pendant la tâche du membre A n'annule pas A ; le message de B s'exécute après A.
- [ ] Dans un groupe partagé (thread), `/clear` nécessite `confirm` et est restreint à `config.allowedUsers` lorsqu'il est défini (pas un reset libre) ; `/status` reste read-only.
- [ ] Tests unitaires au niveau hook (pas de tests UI `wait(ms)`) : égalité de la routing key entre les senders ; présence du préfixe promptText pour `isGroup` true vs false ; skip `alreadyPrefixed`.

### Phase 1 — Migration Daemon + Moteur Proactif + la Boucle Fermée MVP

**Définition du MVP.** Une **boucle fermée unique de digest planifié** : un opérateur enregistre un job de type cron pour un canal ; au déclenchement, le gateway résout la session au scope thread du canal, exécute un prompt avec des outils, et **poste le résultat dans le canal froid sans y avoir été invité**. Un job, un canal, un chemin de livraison. Un comportement plus riche est hors scope du MVP.

**Migration actée.** La Phase 1 héberge les canaux sous `qwen serve` via `DaemonChannelBridge` (la décision OD-1), héritant de la `promptQueue` FIFO, du médiateur, de l'eventBus et des routes. Le moteur proactif est §6.2 (planificateur appartenant au gateway, neutre à la migration ; `dispatchProactive` sérialisé via `sessionQueues` ; fallback cold-send DingTalk via l'API vérifiée `groupMessages/send` ; refresh `tokenManager` ; flag de capacité `canColdSend`). Trois faits le rendent non trivial : cron aujourd'hui est au scope session et meurt au dispose (clos par la gate sole-owner OD-8) ; DingTalk ne peut pas envoyer de message à un groupe froid (clos par l'API proactive vérifiée + `openConversationId` persisté) ; et le prompt proactif doit sérialiser via `sessionQueues` et ne **jamais** appeler `bridge.prompt()` pendant que `activePrompts` est détenu — sinon `DaemonChannelBridge` throw `Prompt already in flight` (`:257-261`).
**Packages modifiés.** `ChannelCronStore.ts`/`ChannelCronScheduler.ts` (nouveau, channel-base) ; `cronParser.ts` (réutilisation) ; `ChannelBase.ts` (`dispatchProactive`, `pushProactive`, flag `canColdSend`, `/schedule`) ; `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts` (nouveau cold-send + `openConversationId` persisté + `tokenManager`) ; `FeishuAdapter.ts` (aucun changement ; adaptateur de référence capable de proactive, `canColdSend = true`) ; `start.ts` (hébergé sous le daemon ; construction + démarrage du scheduler après `restoreSessions()` ; passage du flag `isTagSession` dans la construction de la session pour désactiver le cron in-session — OD-8) ; construction de session (skip `startCronScheduler()` pour les sessions tag, `Session.ts:667-668`).

**Critères d'acceptation.**

- [ ] Les channels s'exécutent sous `qwen serve` (hébergés par le daemon) ; un appel d'outil fait remonter une `permission_request` (médiateur accessible), confirmant la migration.
- [ ] Un opérateur enregistre une tâche de digest ; elle persiste après un redémarrage du gateway (rechargée depuis `~/.qwen/channels/cron.json`).
- [ ] Lorsque la tâche se déclenche **sans session ouverte**, le gateway résout la session scopée au thread, exécute le prompt avec les outils, et le délivre dans le groupe DingTalk inactif via le chemin cold-send — prouvant ainsi la livraison cold-group. Le moteur **échoue bruyamment** (logs, enregistre `lastError`, ne fait pas de no-op silencieux) si `canColdSend = false`.
- [ ] La même tâche livre sur Feishu via `tenant_access_token`, prouvant l'abstraction `canColdSend`.
- [ ] Une tâche qui se déclenche ne viole pas la règle one-prompt-per-session : si un membre est en pleine conversation, le prompt proactif est mis en file d'attente derrière via `sessionQueues` (await `activePrompts.get(sessionId)?.done`), sans jamais annuler via `steer`, et sans jamais déclencher l'erreur d'overlap de `DaemonChannelBridge`.
- [ ] Un tour proactif n'est pas annulable par un tour humain ultérieur (les groupes tag sont en `followup`, jamais en `steer`).
- [ ] Le `tokenManager` rafraîchit le `accessToken` v1.0 avant son expiration (~2 h) et sur 401, afin qu'un envoi après une ouverture de socket > 2 h réussisse toujours.
- [ ] Pas de double déclenchement pour aucune tâche durable : le scheduler du gateway est le seul propriétaire ; une session tag n'arme pas son cron in-session (OD-8) ; les deux stores sont sur des chemins disjoints.
- [ ] La suppression de la tâche arrête les futurs déclenchements.
- [ ] Tests au niveau hook/service (scheduler face à une fausse horloge ; cold-send face à un client HTTP mocké) — pas de `wait(ms)`.

### Phase 2 — Mémoire des channels + Budgets de tokens + Journal d'audit

**2.1 — Mémoire scopée au channel** (§6.3) : ajout du scope `'channel'` + `channelKey` à `writeContextFile.ts` (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`) ; livraison de `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` ; câblage des callbacks CLI `readChannelMemory`/`writeChannelMemory` via `ChannelBaseOptions` + bootstrap read réutilisant `instructedSessions`. Route daemon Phase-2 `POST /channel/:sessionId/memory` uniquement sous la topologie daemon.

**2.2 — Budgets de tokens par channel** (§6.4) : `BudgetLedger.ts` indexé par channel, **advisory (WARN uniquement) sur l'estimation côté channel, hard-decline uniquement sur l'usage réel du daemon** (Fix #6/OD-9) ; rollup org par processus + fenêtres par channel, le plus strict l'emporte, fenêtre quotidienne fixe ; alertes à 75 %/95 % (dépendance proactive-send).

**2.3 — Journal d'audit** (§6.4) : `RequestAttributionRing` + ligne `task.requested` ; **attribution portée par le tour en cours d'exécution (`currentTurnAttribution` par tour), et non par jointure sur timestamp** (Fix #7) ; commande `GET /workspace/audit` (daemon) ou `/audit` channel. FIFO en mémoire 512, perdu au redémarrage (limitation v1 connue ; suivi append-only dans `~/.qwen`, OD-11).

**Fichiers modifiés.** `writeContextFile.ts`, `workspace-memory.ts` (validation de scope + GET walker, chemin daemon) ; `BudgetLedger.ts`, `RequestAttributionRing.ts` (channel-base) ; `permission-audit.ts` (source du pattern) / nouveau `channel-audit.ts` (daemon) ; `ChannelBase.ts` (propagation de `senderId`/`senderName` sur les tours en file d'attente + `currentTurnAttribution` ; hooks de budget) ; `server.ts` (montage des routes après `express.json` `:2025`, verrouillage des mutations avec `mutate({ strict: true })`).

**Critères d'acceptation.**

- [ ] `scope: 'channel'` écrit dans `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md` ; deux groupes obtiennent des fichiers **indépendants** ; le `QWEN.md` du workspace partagé reste intact ; l'écriture passe par le callback injecté (pas de dépendance `channel-base → core`).
- [ ] L'ajout à la mémoire du channel est idempotent sous concurrence (mutex par fichier) et n'émet `memory_changed` que lors d'une mutation réelle (chemin daemon ; filtrage côté abonné).
- [ ] Sur le chemin **daemon**, après qu'un channel dépasse son plafond de fenêtre d'usage réel, le prochain prompt entrant est refusé (pas tronqué) et les tâches proactives sont mises en pause ; les compteurs sont réinitialisés au roulement de la fenêtre quotidienne ; les budgets sont indépendants par channel. Sur un chemin **estimate-only**, le budget émet un WARN mais ne fait jamais de hard-decline (Fix #6).
- [ ] Un appel d'outil/permission levé pendant l'exécution du tour en file d'attente de l'expéditeur A est attribué à **A**, même si B a été mis en file d'attente plus tard sous `followup` (Fix #7).
- [ ] Chaque déclenchement proactif, écriture de mémoire de channel et événement de budget atterrit dans le ring d'audit avec `senderId`/`senderName` au meilleur effort, lisible via la surface d'audit, et **non** diffusé sur le bus SSE.
- [ ] Tests unitaires Ring/route/resolver (éviction FIFO, résolution de chemin de scope, mathématiques de seuil de budget, attribution du tour en cours d'exécution) — pas de tests UI/timing.

### Limite de phase et perspectives

Les phases 0→1→2 sont additives : multiplayer + identité (sur `AcpBridge`) → migration daemon + MVP proactif → mémoire + budgets + audit. Le **gateway multi-identité de la Phase 3** (identités/credentials de bot distincts par channel, vrais principals par utilisateur, tokens par channel) est _hors scope_, c'est la suite logique qui lève les contraintes de token-global-unique / un-workspace-par-daemon. Même au sein des phases 0–2, "qwen tag" nécessite **un processus agent par workspace** (OD-2) ; un déploiement servant plusieurs repos exécute plusieurs processus.

---

## 8. qwen tag vs Claude Tag (compromis)

Claude Tag est un agent hébergé et multi-tenant : Anthropic opère le runtime, l'identité et le metering par utilisateur ; l'application channel est un client léger. `qwen tag` est l'inverse : il s'exécute sur une infrastructure contrôlée par l'opérateur, au-dessus des adaptateurs de qwen-code. Cette inversion est toute la proposition de valeur et toute la surface de risque.

### Où qwen l'emporte

- **Open / auto-hébergé, les données restent en interne.** L'agent s'exécute localement — via stdio en Phase 0 (`AcpBridge.start()` exécute `node <cli> --acp`), in-process sous `qwen serve` à partir de la Phase 1 — jamais via une API vendor. Le contenu des repos, le trafic des modèles et les transcriptions restent sur les hôtes de l'opérateur. Claude Tag ne peut pas en dire autant.
- **MCP / any-tool.** Sur-ensemble strict de la surface d'outils d'un agent hébergé fermé.
- **Vote de permission par action — _une capacité Phase 1+ une fois hébergé par le daemon_.** qwen-code fournit `MultiClientPermissionMediator` (quatre politiques, quorum de consensus `floor(M/2)+1`, ring d'audit séparé). Un véritable différenciateur — **inaccessible sur le chemin `AcpBridge` de la Phase 0** (`requestPermission` auto-approuve, `:108-118`), accessible une fois que la Phase 1 héberge les channels dans le daemon ; même là, les votes sont indexés par `clientId` et un channel est un _seul_ client jusqu'à ce que le registre OD-3 soit livré. Le champ mort `ChannelConfig.approvalMode` (`types.ts:36`) confirme que c'était prévu mais absent.
- **État durable et inspectable.** Persistance `SessionRouter`, fichiers `QWEN.md`/`AGENTS.md` bruts, et (daemon, Phase 1+) un ring de replay Last-Event-ID. Rien d'opaque.

### Où il diverge et doit compenser

1. **Workspace unique + token global unique + pas d'identité humaine.** Un processus lie un workspace ; multi-workspace = N processus (OD-2). Le token global unique s'applique au _daemon HTTP_ ; le chemin channel `AcpBridge` de la Phase 0 n'a pas de surface HTTP et pas de token (sa limite est `SenderGate`/`GroupGate`). Pas d'identité humaine nulle part — `senderName` est uniquement du texte de prompt à titre indicatif (OD-11). _Compensation :_ un processus par workspace/équipe ; injection de l'attribution de l'expéditeur au niveau du channel ; conservation de `clientId` comme limite de sécurité ; exigence de `--require-auth` + token sur tout daemon non-loopback (OD-12).
2. **Messagerie proactive / cold-channel non uniforme.** Réponse réactive uniquement sur DingTalk (`sessionWebhook` expirant) ; Feishu envoie librement via `tenant_access_token`. _Compensation :_ envoi de groupe proactif vérifié de la Phase 1 sur `openConversationId` persisté (DingTalk, `canColdSend` passe à true) ; Feishu n'en a pas besoin.
3. **Le scheduler est scopé à la session, pas au daemon.** Le cron meurt sur `dispose()` lors du reap après 30 min d'inactivité. _Compensation :_ scheduler possédé par le gateway (§6.2) — longue durée de vie, survit au reap, seul propriétaire du cron (OD-8).
4. **La mémoire est globale au workspace, pas par channel.** _Compensation :_ un processus par channel (zéro code) ou le scope `channel` de la Phase 2 (OD-10).
5. **Multi-identité / vrai multi-tenant hors scope** (Phase 3). Modélisé en multi-processus dans les phases 0–2.

### Risques et atténuations

| #   | Risque                                                                                                                                                   | Sévérité | Atténuation                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Les appels d'outils de la pile de channel sont **auto-approuvés** sur le chemin `AcpBridge` de la Phase 0 (`AcpBridge.ts:108-118`) — un channel qui fuit exécute n'importe quel outil sans barrière. | High     | La migration daemon de la Phase 1, qui est actée, apporte le médiateur ; en attendant, restreindre le jeu d'outils + hôte de confiance.                                                           |
| R2  | La fuite du token global unique du daemon accorde un accès complet au workspace (chemin daemon HTTP ; le chemin `AcpBridge` n'a pas de token).                                    | High     | Loopback par défaut + bearer gate ; `--require-auth` sur non-loopback (OD-12) ; hôte de confiance ; rotation via redémarrage ; verrouillage des outils destructeurs derrière `consensus` une fois câblé. |
| R3  | Le `'steer'` par défaut de `dispatchMode` annule le travail en cours sur le message de n'importe quel membre (le JSDoc indiquait `'collect'`, maintenant corrigé en `'steer'`, `types.ts:42`).       | High     | Les groupes tag sont configurés sur `'followup'` ; JSDoc réconcilié (OD-5).                                                                                                             |
| R4  | Attribution de l'expéditeur manquante → l'agent confond les intervenants.                                                                                                 | High     | Injection `[senderName]` de la Phase 0 pour les tours de groupe (+ `alreadyPrefixed`, OD-6).                                                                                     |
| R5  | Le proactif cold-group / webhook expiré de DingTalk échoue silencieusement (`:137-141`).                                                                         | Medium   | Envoi de groupe proactif vérifié de la Phase 1 sur `openConversationId` persisté ; `canColdSend` fail-loud ; mise en surface des dégradations.                                           |
| R6  | Le cron/notification meurt lors du reap de session (30 min, `run-qwen-serve.ts:94`) ; nécessite également un chemin sortant (R5).                                             | Medium   | Scheduler possédé par le gateway (§6.2) ; OD-8 gate de propriétaire unique.                                                                                                             |
| R7  | `requireMention` à true → les messages de groupe non mentionnés sont ignorés silencieusement (`GroupGate.ts:51-52`).                                                            | Low/Med  | Conserver la valeur par défaut ; documenter ; indice optionnel sur le premier message.                                                                                                          |
| R8  | La mémoire du workspace partagé contamine les groupes colocalisés.                                                                                           | Medium   | Un processus par channel ou scope `channel` de la Phase 2 (OD-10).                                                                                                       |
| R9  | Le rate-limit est par `clientId`/IP, pas par utilisateur (chemin daemon) ; le chemin `AcpBridge` n'en a pas.                                                                | Low      | Acceptable pour le single-tenant ; le metering par utilisateur est en Phase 3.                                                                                                       |
| R10 | L'ensemble des votants du consensus est photographié au moment de la requête ; les membres du channel ne sont pas des `clientId` distincts aujourd'hui.                                                    | Low      | OD-3 : `first-responder` Phase 1 ; résoudre le mapping `senderId`→vote avant le consensus.                                                                                  |
| R11 | Le SDK DingTalk ne rafraîchit jamais le token d'accès de ~2 h sauf si le socket se ferme — le proactif/émotion/média échoue silencieusement.                                   | High     | `tokenManager` possédé par la fonctionnalité proactive, rafraîchissant via le endpoint v1.0 `oauth2/accessToken` (§6.2, vérifié).                                            |
| R12 | Un déclenchement proactif appelant `DaemonChannelBridge.prompt()` pendant un tour humain **lèverait** l'erreur `Prompt already in flight` (`:257-261`).                     | High     | `dispatchProactive` sérialise via `sessionQueues` et attend `activePrompts` avant `bridge.prompt()` — le throw-guard est structurellement inatteignable (Fix #1, §6.2). |
| R13 | Un faux positif de budget estimé pourrait refuser un prompt utilisateur légitime.                                                                                | Medium   | Les estimations émettent uniquement un WARN ; hard-decline uniquement sur l'usage réel du daemon (Fix #6, §6.4).                                                                                       |
| R14 | La mise en file d'attente `followup` attribue à tort les appels d'outils à l'expéditeur mis en file le plus récemment.                                                                    | Medium   | Propagation du `senderId` sur le tour en file d'attente ; l'audit lit le tour en cours d'exécution (Fix #7, §6.4).                                                                               |

---

## 9. Décisions résolues

Toutes les Open Decisions v1 sont résolues ci-dessous avec leur réponse choisie. Les **seuls éléments véritablement encore ouverts** sont des détails de l'API DingTalk à faible niveau de confiance sous OD-7, mentionnés dans la dernière ligne.

| ID                        | Question                                                                                       | **Décision**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | Migrer l'hébergement des channels dans `qwen serve` pour la Phase 1+, ou rester sur `AcpBridge` ?                | **RÉSOLU — Migrer.** La Phase 0 est livrée sur `AcpBridge` ; **la Phase 1+ héberge les channels sous `qwen serve` via `DaemonChannelBridge` / un runner de channel daemon**, héritant de la `promptQueue` FIFO, de `MultiClientPermissionMediator`, de l'`eventBus`, de `/workspace/memory` et du rate-limit. La Phase 0 ajoute le chemin d'attachement (ou `--daemon <url>`) pour que la bascule soit une étape de configuration. Le scheduler du gateway (§6.2) est neutre vis-à-vis de la migration. Ce n'est plus une gate — architecture actée.                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | Unité de déploiement = un processus par workspace/channel ?                                           | **RÉSOLU — Oui.** Un processus par workspace/channel : mémoire par channel + isolation des secrets, délimitant le rayon d'explosion du token-global-unique. La colocalisation de plusieurs channels est un sujet de la Phase 3 (nécessite le scope `channel` + governor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | Politique de permission pour un tag multiplayer (un channel = un `clientId` daemon) ?                 | **RÉSOLU — Phase 1 : `first-responder` avec un seul `clientId` au niveau du channel** (n'importe quel membre autorisé résout ; attribution à la granularité du channel ; pas de map `senderId→clientId`). **Phase 2 : `consensus`/`designated`** une fois qu'un registre `senderId→clientId` + cycle de vie (reaping, limites de refcount) existe. **Auto-refus des outils à haut risque sur les tours proactifs.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | Les `/clear`/`/status` scopés au thread sont à l'échelle du channel.                                             | **RÉSOLU — dans un groupe partagé (thread), `/clear` nécessite `confirm` et est restreint à `config.allowedUsers` lorsqu'il est défini** (un `/clear-channel` avec tiret n'est pas analysable ; une owner-gate par membre est reportée au modèle d'identité, OD-3/OD-11) ; `/status` reste en lecture seule sur la session partagée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | Incohérence de la valeur par défaut de `dispatchMode` (JSDoc `'collect'` vs runtime `'steer'`).                      | **RÉSOLU — Corriger le JSDoc à `types.ts:42` en `'steer'`** (correspond au runtime) ; le profil de groupe tag définit explicitement `dispatchMode: 'followup'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | Format du marqueur d'expéditeur + double-préfixe `collect`.                                                | **RÉSOLU — Préfixe `[senderName]` par tour, NON conditionné par `instructedSessions`**, plus **UN nouveau champ optionnel `Envelope` nommé `alreadyPrefixed`** (`types.ts`) pour que la ré-entrée synthétique en mode `collect` saute le re-préfixage. (Corrige l'affirmation v1 "pas de nouveau champ".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | Envoi proactif DingTalk : endpoint/permission, équivalence de `openConversationId`, rafraîchissement du token. | **RÉSOLU avec des faits vérifiés (§6.2/§6.5) :** endpoint `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(élevé)_ ; body `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(élevé)_ ; header d'auth `x-acs-dingtalk-access-token` avec un token v1.0 `oauth2/accessToken`, TTL ~7200 s, mis en cache et rafraîchi par un `tokenManager` possédé par la fonctionnalité _(élevé)_ ; persistance de `openConversationId` dans `~/.qwen/channels/dingtalk-groups.json` ; callback `conversationId`≈`openConversationId` _(moyen ; fallback sur l'API de conversion `chatId→openConversationId` en cas de `invalid.openConversationId`)_. **Encore ouvert (faible confiance) : code/nom d'affichage exact du point de permission ; phrase d'équivalence officielle textuelle ; si le throttle de 20/min s'applique à `groupMessages/send`.** |
| **OD-8**                  | Double déclenchement de cron entre les schedulers du gateway et de session.                                       | **RÉSOLU — Le scheduler du gateway est le SEUL propriétaire du cron.** Une session hébergée par un channel (tag) ne démarre **pas** son cron `Session` in-session ; elle apprend qu'elle est une session tag via un flag `isTagSession` propagé depuis l'hôte du channel lors de la construction de la session (sac d'options `DaemonChannelSessionFactory` Phase 1+ ; une option de spawn `--acp` Phase 0), ce qui skip `startCronScheduler()` (`Session.ts:667-668`). Les deux stores de cron sont sur des **chemins disjoints** (gateway `~/.qwen/channels/cron.json` vs session `~/.qwen/tmp/<hash>/scheduled_tasks.json`), donc le seul risque de collision est d'exécuter les deux schedulers pour les mêmes tâches — éliminé par la gate.                                                                                                                                                                                     |
| **OD-9**                  | Scope du budget de tokens, source de vérité, fenêtre.                                                   | **RÉSOLU — Rollup "org" par processus + fenêtres par channel, le plus strict l'emporte, fenêtre quotidienne fixe.** La v1 estime les tokens côté channel (advisory, WARN uniquement — ne fait jamais de hard-decline, Fix #6) et lit le **chemin d'usage du daemon** pour un débit précis (et hard-decline) une fois hébergé par le daemon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Namespacing de la mémoire par room + autorité d'écriture.                                                 | **RÉSOLU — Ajout d'un scope `channel` (+`channelKey`) à `writeContextFile.ts` ; channel-base obtient l'écriture/lecture via un callback de couche CLI injecté via `ChannelBaseOptions` (`readChannelMemory`/`writeChannelMemory`) — PAS de dépendance `channel-base → core`.** Emplacement global utilisateur `~/.qwen/channels/memory/`. L'agent ajoute via une intention `save_memory` ; le bootstrap read réutilise la gate `instructedSessions`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | Modèle d'identité humaine + durabilité de l'audit.                                                       | **RÉSOLU — `senderName` est uniquement à titre indicatif ; `clientId` reste le seul principal de sécurité.** Attribution au meilleur effort portée par le tour en cours d'exécution (Fix #7) ; **ring d'audit FIFO 512 en mémoire + un fichier de suivi append-only dans `~/.qwen`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | Durcissement du token pour les déploiements supportés par un daemon non-loopback.                                    | **RÉSOLU — Exiger `--require-auth` + token pour tout déploiement supporté par un daemon non-loopback.** Loopback uniquement est réservé au dev ; `--require-auth` est la posture par défaut documentée (`run-qwen-serve.ts` applique déjà token-on-non-loopback).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OUVERT (seul restant)** | Détails de l'API DingTalk à faible niveau de confiance sous OD-7.                                                | **TOUJOURS OUVERT — à vérifier dans la console / sur la doc en direct avant de coder :** (1) code/nom d'affichage exact du point de permission pour "envoyer proactivement un message de groupe" (faible) ; (2) phrase officielle faisant autorité équivalant le callback `conversationId` à `openConversationId` pour un robot standard non-cool-app (moyen ; le chemin garanti par la doc est l'API de conversion `chatId→openConversationId`) ; (3) si la limite "20 messages/minute → throttle de ~10 min" s'applique textuellement à `groupMessages/send` (faible/moyen — documenté pour les robots webhook personnalisés, non confirmé sur la page d'envoi orgapp).                                                                                                                                                                                                                                                            |
---

## 10. Risques et atténuations

Voir le tableau consolidé au §8. Les risques critiques, par ordre de priorité :

1. **R1 — auto-approve sur le chemin du canal de la Phase 0.** Jusqu'à ce que la migration du daemon de la Phase 1, qui est prévue, intègre le transport avec médiation, un agent résidant dans un canal exécute _n'importe quel_ outil sans garde-fou. La faille de sécurité la plus importante ; à atténuer avec un ensemble d'outils conservateur + un hôte de confiance jusqu'à la Phase 1.
2. **R12 — exception de chevauchement proactif.** L'appel à `DaemonChannelBridge.prompt()` pendant un tour humain lève l'exception `Prompt already in flight` (`:257-261`). Corrigé en sérialisant via `sessionQueues` (Fix #1) — la pièce maîtresse du §6.2.
3. **R11 — Expiration du token DingTalk.** Le problème "fonctionne dans la démo, meurt après 2 heures". La fonctionnalité proactive possède un `tokenManager` (point de terminaison v1.0 vérifié, TTL ~7200 s) avant le déploiement de toute fonctionnalité de longue durée.
4. **R5 — Échec silencieux des groupes froids DingTalk.** La sortie proactive vers des groupes inactifs est impossible sans le chemin d'envoi vérifié ; `canColdSend` échoue de manière explicite plutôt que d'être ignoré.
5. **R3 — Annulation de `steer` dans les groupes.** Un DoS accidentel en multijoueur sous le comportement par défaut du runtime ; le profil de tag définit `followup`.
6. **R13/R14 — Faux positifs de budget et mauvaise attribution.** Les estimations émettent uniquement un WARN (Fix #6) ; l'attribution est portée par le tour en cours d'exécution (Fix #7).
7. **R8 — Contamination croisée de la mémoire partagée.** Un processus par canal est la mesure d'atténuation sans code ; le scope `channel` est la solution colocalisée.

Chaque risque est associé à une phase : R1/R3/R4 concernent les Phases 0–1, R5/R6/R11/R12 la Phase 1, et R8/R13/R14 ainsi que les risques d'audit/budget la Phase 2.

---

## 11. Annexe : Index des fichiers et symboles

### Base des canaux (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), scope par défaut `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), construction du prompt (`:316-347`), appel à `bridge.prompt()` (`:425`), gates (`:240-252`), résolution de `dispatchMode` (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), `sendMessage()` abstraite (`:81`), `registerCommand()` (`:141-143`), routeur du constructeur (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — spawn `--acp` (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), auto-approve `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), options bag de la factory de session (`:226-241`), garde `activePrompts` / **lève `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), événements de permission (`:557-633`).
- `GroupGate.ts` — `requireMention` par défaut à true (`:49`), membership (`:42`), gating de mention (`:51-52`), chaîne de fallback (`:48`), policy par défaut `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + pairing (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), JSDoc de `dispatchMode` corrigé en `'steer'` (`:42`), `senderName` (`:69`), nouveau champ `alreadyPrefixed`, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — map `webhooks` (`:84`), `sendMessage()` (`:134-170`, return si pas de webhook `:137-141`), cache de webhook (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, anti-pattern empty-catch `:214-216`), media robotCode (`:435`), `conversationId` entrant (`:506`), strip de mention (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), pas de `threadId` (`:541-551`).
- `proactive.ts` (nouveau) — `sendGroupMessage()` vers `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` chaîne JSON), `tokenManager` (v1.0 `oauth2/accessToken`, TTL ~7200 s, timer + refresh 401), fallback de conversion `chatId→openConversationId`.
- `markdown.ts` — `convertTables()` (`:44-80`), `splitChunks()` (`:84-188`), `CHUNK_LIMIT=3800` (`:10` ; ≤ au budget `sampleMarkdown` d'environ 5000 caractères), `extractTitle()` (`:190-195`), `normalizeDingTalkMarkdown()` (`:198-201`).
- `media.ts` — header `downloadMedia` (`:39`), body `:42`.
- SDK : `client.mjs` gettoken (`:85-87`), reconnect (`:157-163`), split event/callback (`:14-19,35-37,58-61,241-257`) ; `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` proactive (`:622-676`, endpoint `:651` ; `canColdSend = true`), `refreshToken()` (`:581-620`), modes de `connect()` (`:146-176`), `updateCard()` (`:742-792`), déduplication de l'ingest (`:1633-1870`).
- `markdown.ts` — contenu de carte schema-v2 (`:69-189`), `splitChunks()` (`:198-256`).

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +branche `channel` + paramètre `channelKey`), mutex par fichier (`:48-57,159-162`), garde de chemin absolu (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), mode replace (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), chemin haché par projet (`:1-9`).
- `Session.ts` — déclarations des champs `cronQueue`/`cronProcessing` (`:667-668`), `startCronScheduler()` (`:758`, ignoré pour les sessions de tag selon OD-8), clear cron de `dispose()` (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — `promptQueue` FIFO par `SessionEntry` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` free-form (`:51`), `originatorClientId` (`:60`), seuils d'hystérésis (`:101-103`), replay ring (`:92`).
- `permissionMediator.ts` — quatre policies + quorum de consensus (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), union d'entrées fermées (`:57-104`), doc d'en-tête anticipant une surface GET (`:22-25`).
- `rate-limit.ts` — token buckets par `(clientId|ip)` ; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — bearer token global (`:259-266`), `createMutationGate` strict (`:356`).
- `workspace-memory.ts` — scopes `workspace|global` (`:118-125`), mutate strict-auth (`:114`), limite par écriture `MAX_MEMORY_CONTENT_BYTES` (`:79`), forward de `projectRoot` fixe (`:185-190`).

### Commandes de canal CLI (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), construction de `AcpBridge` (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), handler de déconnexion (`:241,403`) ; chemin d'attachement du daemon Phase 1+ ; injection au niveau CLI de `readChannelMemory`/`writeChannelMemory`.
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope par défaut `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), types de canal (`:10-14`).