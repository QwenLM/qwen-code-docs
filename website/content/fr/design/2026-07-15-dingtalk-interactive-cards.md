# Cartes interactives DingTalk

## Statut

Contrat d'implémentation final pour [#6443](https://github.com/QwenLM/qwen-code/issues/6443). Ce document fixe la frontière d'implémentation, le contrat de payload, la propriété de l'état, le comportement de dégradation et les critères d'acceptation suivis par l'implémentation runtime associée.

## Motivation

Le canal DingTalk peut déjà livrer du Markdown, recevoir les événements de cycle de vie des tâches, relayer les demandes de permission et annuler un prompt actif. Il ne fournit pas de carte de statut d'exécution in-place, d'action Stop d'exécution exacte, ni de carte formulaire capable de renvoyer des réponses structurées `ask_user_question` à la requête d'origine.

La conception ajoute ces interactions DingTalk sans apprendre les templates et payloads de callback DingTalk au modèle, aux outils, au schéma ACP ou aux autres adaptateurs de canal.

## Chapitre 1 : Architecture cible

![Architecture des cartes interactives DingTalk](./assets/dingtalk-interactive-cards-architecture.png)

![Compatibilité et dégradation des adaptateurs de canal](./assets/dingtalk-interactive-cards-other-im-impact.png)

![Frontière d'extension future des adaptateurs IM](./assets/dingtalk-interactive-cards-other-im-extension.png)

L'architecture comporte quatre couches de propriété :

1. Le core et ACP continuent de posséder les questions sémantiques et la résolution des permissions.
2. `ChannelBase` possède l'enregistrement des requêtes en attente, le règlement et l'annulation d'exécution exacte.
3. L'adaptateur DingTalk possède la présentation des cartes, le routage des callbacks, les registres, l'idempotence et la dégradation.
4. Le Card OpenAPI de DingTalk possède la livraison, les mises à jour en streaming, les mises à jour d'instance et le transport des callbacks.

Il existe deux types de cartes, et non un cycle de vie générique unique de carte :

| Carte                 | Objet métier                            | Protocole DingTalk                                       | Cycle de vie local                                                           |
| --------------------- | --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Carte de statut en streaming | Un segment de sortie visible      | `createAndDeliver`, `/card/streaming`, `/card/instances` | `running`, `completed`, `failed`, `stopped`, `cancelled`                     |
| Carte formulaire à callback  | Une requête de question utilisateur détenue par le canal | `createAndDeliver`, callback de carte, `/card/instances` | `pending`, `submitted`, `cancelled`, `expired`, `resolved_outside_presenter` |

Elles partagent l'authentification et l'entrée des callbacks, mais conservent des registres et des machines d'état indépendants.

## Capacités existantes réutilisées — aucun changement

- `ask_user_question` définit déjà les questions, les options et le comportement de sélection multiple.
- Les métadonnées de permission ACP identifient une interaction de question utilisateur et préservent les questions.
- Les permissions en attente ont déjà des IDs de requête et un chemin de réponse à usage unique.
- `ChannelBase` prend déjà en charge plusieurs demandes de permission en attente pour le même chat.
- Les événements de cycle de vie des tâches exposent déjà `started`, les chunks de texte, les appels d'outils, `completed`, `failed` et `cancelled`.
- L'annulation du prompt actif alimente déjà `/cancel`.
- DingTalk dispose déjà de la connectivité Stream et d'une entrée générique de callbacks descendants.
- Les surfaces CLI/TUI, Web et IDE rendent déjà nativement les questions utilisateur.

## Contraintes sources vérifiées

Les contraintes comportementales ci-dessous ont été revérifiées par rapport à `origin/main` pendant l'implémentation :

- `packages/channels/base/src/ChannelBase.ts` enregistre chaque permission en attente, y compris sa requête et son index de chat, avant de formater ou d'envoyer le prompt Markdown existant. Le même registre prend en charge plusieurs requêtes dans un même chat et alimente le lookup de `/approve`, `/approve-always` et `/deny`.
- `packages/channels/base/src/ChannelAgentBridge.ts` inclut le résultat de la permission dans `PermissionResolvedEvent`. `packages/channels/base/src/AcpBridge.ts` émet cet événement de manière synchrone avant qu'un répondeur réussi ne renvoie, tandis que `packages/channels/base/src/DaemonChannelBridge.ts` conserve un mapping des requêtes ayant reçu une réponse et peut émettre l'événement plus tard.
- `packages/core/src/tools/askUserQuestion.ts` autorise une à quatre questions. La `permission_request` live porte les questions ordonnées mais ne garantit pas une `answerKey` prête au rendu sur chacune. `packages/acp-bridge/src/bridgeClient.ts` ajoute des clés de réponse basées sur l'index uniquement à son snapshot de statut d'interaction en attente. La couture du canal doit donc dériver les mêmes clés `String(index)` lorsqu'elle normalise la requête live.
- La session ACP consomme un `answers: Record<string, string>` de premier niveau en plus du résultat de la permission. Les réponses à sélection multiple restent des chaînes jointes par virgule-et-espace pour la compatibilité avec les clients TUI et Web existants.
- Les commandes génériques de permission soumettent un résultat d'option ou d'annulation, et non des réponses structurées. Approuver un `ask_user_question` via le chemin actuel du canal le reprend donc avec une carte de réponses vide et produit `No valid answers were provided.` Le chemin présenté par carte ne doit pas réutiliser `/approve`.
- Lorsque plusieurs requêtes sont en attente, la réponse d'ambiguïté existante liste déjà les IDs et les titres des requêtes ; la conception n'ajoute donc pas un autre champ de carte uniquement pour la désambiguïsation des commandes.

## Impact des changements et frontière d'implémentation

Les labels dans ce document sont normatifs :

- **Changement requis — couche partagée du canal** signifie que l'implémentation modifie `ChannelBase` ou les types publics détenus par le canal.
- **Changement DingTalk seul** signifie qu'aucun autre adaptateur ne lit la configuration ni ne participe à la machine d'état.
- **Aucun changement** signifie que le contrat et le comportement runtime existants restent la référence.

| Couche ou surface                                                                                 | Impact                               | Travail requis                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/channels/base/src/ChannelBase.ts`                                                     | Changement requis — canal partagé    | Ajouter l'identité d'exécution, l'annulation d'exécution exacte, la normalisation des questions sémantiques, le règlement de la présentation et le traitement des commandes de questions structurées. |
| `packages/channels/base/src/types.ts` et exports                                                | Changement requis — canal partagé    | Ajouter les types d'entrée sémantique plus `runId` et `owner` publics optionnels de cycle de vie ; les événements surveillés émis par `ChannelBase` remplissent toujours les deux.      |
| `packages/channels/dingtalk`                                                                    | Changement DingTalk seul             | Ajouter la configuration des cartes, l'accès au Card OpenAPI, le parsing des callbacks, les vérifications de propriétaire, deux registres, des projections coalescées bornées, la dégradation et les tests. |
| Ce document de conception                                                                       | Changement requis — documentation seule | Consigner les contrats finaux de payload, propriété, impact des changements, cycle de vie, dégradation et acceptation.                                                                |
| Assets d'architecture                                                                           | Documentation seule                  | Montrer la chaîne runtime, la matrice de compatibilité et de dégradation, et la frontière d'extension future des adaptateurs sans introduire de champs de plateforme dans le contrat partagé. |
| `packages/core`, `ask_user_question` et `ToolConfirmationPayload`                               | Aucun changement                     | Continuer de produire les questions sémantiques et de consommer `answers`.                                                                                                               |
| Session d'agent ACP, schéma ACP, `acp-bridge`, médiateur de permissions, routes du démon et SDK du démon | Aucun changement              | Continuer de porter `toolCall`, les options de permission, les résultats et `answers` de premier niveau.                                                                                 |
| `ChannelAgentBridge`, `AcpBridge`, `DaemonChannelBridge`, worker du démon et `SessionRouter`    | Aucun changement                     | Continuer de relayer les demandes de permission complètes, de router selon le `sessionId` propriétaire et de renvoyer les réponses de permission. Aucun événement de bridge `userQuestionRequest` séparé n'est introduit. |
| Clients CLI/TUI, Web/Desktop, IDE, SDK                                                          | Aucun changement                     | Continuer d'utiliser leurs UI de question natives et leurs transports de permission existants.                                                                                           |
| Adaptateurs Feishu, WeCom, QQ, Telegram, Weixin et plugin                                       | Aucun changement direct              | Héritent du résultat de présentation `unsupported` par défaut et conservent le Markdown et les commandes de permission existants. Leur incapacité connue à renvoyer des réponses structurées du canal reste explicite. |

Le `runId` et l'`owner` publics optionnels de cycle de vie évitent de forcer les adaptateurs tiers ou les fixtures de test qui synthétisent des événements de cycle de vie à changer immédiatement. `runId` n'est pas optionnel à l'intérieur de `ChannelBase` : chaque prompt détenu par le canal en a un, et chaque événement de cycle de vie émis pour ce prompt l'inclut. Un prompt entrant surveillé porte également le propriétaire normalisé du canal ; les prompts de boucle et de webhook l'omettent volontairement. DingTalk ne crée aucune carte interactive si l'identité requise est absente.

## Couture d'entrée utilisateur neutre du canal — changement partagé du canal

`ChannelBase` gagne un hook de présentation sémantique avec trois résultats explicites :

```ts
type UserInputPresentationResult =
  | { kind: 'presented' }
  | { kind: 'handled' }
  | { kind: 'unsupported' };

type UserInputSettlementReason =
  | 'resolved_outside_presenter'
  | 'cancelled'
  | 'run_cancelled';

type ChannelUserInputResponse = RequestPermissionResponse & {
  answers?: Record<string, string>;
};

interface ChannelUserQuestion {
  answerKey: string;
  header: string;
  question: string;
  options: Array<{
    label: string;
    description: string;
  }>;
  multiSelect: boolean;
}

interface ChannelPromptOwner {
  kind: 'channel_user';
  id: string;
}

interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  questions: ChannelUserQuestion[];
  submitOptionId: string;
  onSettled(listener: (reason: UserInputSettlementReason) => void): () => void;
  respond(response: ChannelUserInputResponse): Promise<boolean>;
}

protected presentUserInputRequest(
  context: ChannelUserInputRequestContext,
): Promise<UserInputPresentationResult>;
```

`onSettled` est un abonnement typé à usage unique plutôt qu'un `AbortSignal`, dont le `reason` public est `any`. `ChannelBase` est le seul rédacteur du règlement ; il appelle chaque listener avec un `UserInputSettlementReason`, et la fonction renvoyée ne désenregistre que ce listener. Le `ChannelPromptOwner` partagé est volontairement neutre de l'adaptateur : il identifie l'utilisateur humain du canal qui a démarré l'exécution sans exposer les payloads de callback DingTalk ni les noms de champs d'identité. Le contexte ne contient ni ID de template, ni ID d'action, ni `outTrackId`, ni objet de bridge mutable. `submitOptionId` est l'option de permission d'origine annoncée comme `allow_once` ; par compatibilité avec les producteurs actuels, une option dont l'ID est `proceed_once` et dont `kind` est absent est traitée de la même façon. L'adaptateur n'invente jamais un ID d'option.

### Reconnaissance des requêtes sémantiques

`ChannelBase` possède un unique normaliseur afin que les adaptateurs ne réinterprètent pas indépendamment le payload ACP :

1. Le discriminateur canonique est `toolCall._meta.qwenInteractionKind === 'user_question'`.
2. Les questions canoniques proviennent de `toolCall._meta.qwenQuestions`.
3. Pour les producteurs plus anciens, `toolCall.rawInput.questions` n'est accepté que lorsque le nom d'outil canonique ou le type d'outil identifie également `AskUserQuestion`. Un autre outil qui accepte par hasard un argument `questions` n'est pas une entrée utilisateur sémantique.
4. Le normaliseur valide une à quatre questions ordonnées, normalise un `multiSelect` omis à `false` et attribue `answerKey: String(index)`.
5. Une requête canonique mal formée n'est pas rendue partiellement. Elle suit le chemin existant des permissions non prises en charge et enregistre un diagnostic structuré sans journaliser les réponses aux questions.

Le hook est inséré après que la permission en attente et son contrôleur de règlement sont stockés, mais avant le formateur et l'envoyeur de permission existants :

```text
stocker PendingPermission + contrôleur de règlement
active = ActivePrompt surveillé actuel détenu par le canal pour event.sessionId
normaliser la question sémantique + l'option allow_once compatible
si question valide et active avec runId + submitOptionId :
  construire le contexte depuis active et les questions normalisées
  result = presentUserInputRequest(context)
  presented   -> marquer l'entrée structurée comme présentée, garder en attente et renvoyer
  handled     -> valide uniquement si l'adaptateur a invoqué context.respond de manière synchrone
  unsupported -> continuer
formater et envoyer le message de permission existant
```

La fermeture `respond` est la seule opération de règlement visible par l'adaptateur. Elle lie l'ID de requête, relaie la réponse complète à travers le bridge existant et effectue le même nettoyage de mise en attente sur les chemins `true`, `false` et exception. `ChannelBase` enregistre s'il a été invoqué avant que le hook de présentation ne se résolve. `handled` sans cette invocation est une violation de contrat et retombe sur le message de permission existant ; ce n'est pas une seconde manière de laisser une requête en attente.

Chaque chemin qui supprime une permission en attente règle le contrôleur exactement une fois. Cela inclut les commandes de permission, le répondeur du contexte, le `permissionResolved` du démon, le nettoyage de session, l'annulation de tâche et le remplacement du bridge. Une annulation d'exécution connue localement règle avec `run_cancelled` avant qu'un résultat de bridge replié ultérieur ne puisse l'écraser. Un `permissionResolved` indépendant avec un résultat annulé, ou avec l'option de rejet d'origine, devient le `cancelled` neutre ; un autre résultat ou un résultat manquant devient `resolved_outside_presenter`. Le bridge ne préserve pas assez d'information de cause pour déduire un timeout d'un refus ou d'un nettoyage, donc cette classification n'étiquette jamais une annulation inconnue comme `expired` et ne devine jamais quel client a répondu. Le timer de question local à DingTalk possède la projection distincte `expired` avant d'appeler le répondeur.

Le hook n'est éligible que pour l'`ActivePrompt` surveillé actuel détenu par le canal. `loopPrompt === true` est inéligible ; cela exclut à la fois les tâches de boucle planifiées et les producteurs de webhook, dont les IDs de message et les expéditeurs sont synthétiques plutôt que des entrées DingTalk humaines. Lorsqu'aucun prompt actif éligible, `runId` et propriétaire n'existent, `ChannelBase` ne construit pas le contexte et n'invoque pas le hook ; il traite la présentation comme `unsupported` et continue le chemin de permission existant. L'adaptateur exige indépendamment le même enregistrement réel de propriété de message entrant DingTalk pour l'exécution. Une exécution démarrée par le CLI, le Web, l'IDE, le SDK, un autre client, une boucle ou un webhook ne crée donc aucune des interactions liées aux cartes. La conception initiale n'ajoute pas de fédération d'identité inter-clients.

Le hook par défaut renvoie `unsupported`. Les autres adaptateurs IM conservent donc leur formatage de permission et leurs commandes actuels.

## Identité d'exécution exacte et annulation — changement partagé du canal

Chaque invocation de prompt crée un `runId` opaque unique et le stocke sur l'`ActivePrompt` correspondant. Ce n'est pas la génération de cycle de vie du démon, qui change pour les opérations de cycle de vie de session plutôt que pour chaque prompt.

`ChannelTaskLifecycleBase` expose `runId?: string` et `owner?: ChannelPromptOwner` pour la compatibilité de source. `ChannelBase` inclut l'ID d'exécution concret sur chaque événement `started`, `text_chunk`, `tool_call` et terminal qu'il émet. Les prompts surveillés incluent le même propriétaire sur chaque événement ; les prompts de boucle et de webhook l'omettent. Un consommateur qui reçoit un événement sans l'identité requise peut continuer son comportement existant mais ne peut pas créer d'action de carte.

Un callback Stop de carte de statut porte ce `runId` dans un nouveau point d'entrée protégé d'annulation d'exécution exacte de `ChannelBase`. La méthode lit une fois le prompt actif courant et vérifie atomiquement l'ID attendu avant d'entrer dans le chemin d'annulation existant. Un prompt actif manquant ou un ID manquant, échu ou discordant renvoie `false` ; le chemin lié à la carte ne retombe jamais sur l'annulation de session seule. Le comportement existant de `/cancel` reste à portée de session et inchangé.

La séquence Stop acceptée est :

1. Valider le propriétaire du callback et l'identité de la carte.
2. Revendiquer de manière synchrone le callback live courant avant la première opération asynchrone.
3. Demander à `ChannelBase` d'annuler exactement l'exécution attendue.
4. Si l'annulation renvoie `true`, bloquer les nouveaux chunks de carte de statut, fermer le streaming et valider la présentation Stopped.
5. Si l'annulation renvoie `false` et que le même enregistrement est toujours courant et non terminal, libérer la revendication, garder la carte active et autoriser un retry.

La revendication est un verrou local à l'adaptateur pour les opérations en cours, et non un état de cycle de vie. Un résultat asynchrone ne peut mettre à jour ou libérer que le même enregistrement toujours courant et non terminal ; un timeout, un règlement ou un événement de cycle de vie terminal qui gagne pendant l'attente ne peut pas être écrasé. Cela empêche une ancienne carte d'annuler un prompt plus récent, empêche les callbacks dupliqués de se concurrencer, et évite de revendiquer le succès avant que l'annulation ne réussisse sans ajouter un état public `processing`.

## Actions de carte réservées au propriétaire — changement DingTalk seul

L'autorisation des actions de carte est plus stricte que l'autorisation des messages de session partagée. Stop, submit et cancel sont toujours réservés au propriétaire quel que soit le `sessionScope`.

Au moment du message entrant, DingTalk préfère déjà `senderStaffId` et retombe sur `senderId` pour l'expéditeur de l'enveloppe. Avant de transmettre un vrai tour entrant à `ChannelBase`, l'adaptateur enregistre `messageId -> DingTalkOwnerKey`. La map suit le plafond existant des messages entrants de 1 000 entrées. Un événement de cycle de vie `started` correspondant consomme et supprime ce mapping, crée un enregistrement local à DingTalk d'exécution/statut, et lie le même `runId` généré par le canal au propriétaire typé. Les IDs de message de boucle et de webhook n'entrent jamais dans la map. Le nettoyage d'une exécution terminale supprime l'enregistrement d'exécution/statut après avoir finalisé ses questions. Le routeur de callbacks normalise le `userId`, `senderStaffId` ou `senderId` du callback dans le même domaine typé et exige une correspondance exacte. Si aucune identité comparable n'est disponible, l'action échoue en fail closed.

Un callback d'utilisateur étranger est accusé de réception mais ne peut pas modifier une exécution, une demande de permission ou une carte. Lorsque la carte live appartient à un groupe, le contrôleur renvoie la cible de groupe d'origine avec le résultat `forbidden` et l'adaptateur envoie une notification générique « seul le propriétaire de la tâche peut opérer cette carte » à ce groupe après l'ACK du callback. Cette notification utilise directement le chemin sortant des messages de groupe : elle n'est pas convertie en message entrant et n'entre jamais dans le contexte de l'agent. Une notification échouée est journalisée et ne retombe pas sur le règlement de permission, la modification de carte ou la livraison à l'agent. Le feedback interdit sur carte directe conserve le chemin existant de message direct.

`ignored` reste distinct de `forbidden`. Les callbacks dupliqués, échus, mal formés et non reconnus sont accusés de réception et écartés en sécurité sans feedback de groupe, empêchant des callbacks répétés ou falsifiés d'inonder un groupe. La distinction est un traitement interne à l'adaptateur des callbacks, et non un état de carte DingTalk visible.

## Implémentation locale à DingTalk — changement DingTalk seul

Seul l'adaptateur DingTalk lit `interactiveCards` et enregistre le sujet de callback de carte. Il possède :

- Un client Card OpenAPI authentifié partagé qui applique le timeout fixe de requête de 10 secondes aux deux types de cartes.
- Une map bornée des propriétaires d'entrées réelles.
- Un registre d'exécution/statut indexé par `runId`, avec un `outTrackId` optionnel de carte de statut.
- Un registre de cartes de question indexé par `requestId` et `outTrackId`.
- Un routeur de callbacks validant le propriétaire.
- Des rédacteurs coalescés par carte, des revendications transitoires en cours et des pierres tombales terminales bornées.
- Le fallback local à DingTalk et le rapport d'erreur structuré.

La présentation des questions est à portée de `sessionId + owner.id`. Différents utilisateurs et sessions peuvent posséder des cartes live indépendamment. Si la même exécution a déjà une question native en attente dans cette portée, une autre requête renvoie `unsupported` : `ChannelBase` garde la première carte en état de recevoir une réponse et envoie la seconde requête via le fallback de permission texte existant. Il n'expire pas la première carte ni ne synthétise une réponse de permission. La terminaison de l'exécution expire ou annule toujours chaque carte possédée par cette exécution.

## Cycle de vie de la carte de statut en streaming — changement DingTalk seul

La carte de statut représente un segment de sortie visible à l'intérieur d'une exécution détenue par le canal. Les exécutions initiées par le CLI, le Web, l'IDE, le SDK ou un autre client peuvent toujours affecter l'état de session partagé, mais elles ne créent pas de carte de statut DingTalk.

La création et le streaming suivent le protocole de cartes en streaming de DingTalk :

1. Appeler `createAndDeliver` avec un `outTrackId` unique et `flowStatus=2` initial.
2. Ouvrir le streaming avec une mise à jour complète vide en utilisant `isFull=true`, `isFinalize=false` et `isError=false`.
3. Accumuler la sortie du modèle localement et envoyer des snapshots complets coalescés via `/card/streaming`.
4. Envoyer les variables de template à basse fréquence telles que le texte de statut via `/card/instances` avec `updateCardDataByKey=true`.

Les chunks bruts ne deviennent jamais une requête réseau chacun. Chaque enregistrement de statut autorise au plus une écriture Card OpenAPI en cours et un snapshot complet en attente remplaçable. Un intervalle fixe de flush minimum de 500 ms coalesce les chunks plus récents dans ce snapshot en attente. Le contenu visible est plafonné à 20 000 caractères ; le débordement supprime le contenu le plus ancien et insère un marqueur de troncature plutôt que de faire croître la mémoire. Chaque appel Card OpenAPI a un timeout de 10 secondes. Un timeout ou un échec intermédiaire enregistre une erreur structurée, arrête les écritures de streaming ultérieures pour cette carte, et conserve le dernier texte borné pour le chemin de livraison finale attendu.

Les cartes de statut sont paresseuses et à portée de segment. Une question directe ne crée aucune carte de statut. Le texte avant une question ferme son segment avant que la carte de question ne soit présentée, et un texte de continuation ultérieur ouvre un nouveau segment :

```text
premier texte visible -> running
running -> completed
running -> failed
running -> stopped | cancelled
règlement de la question + texte ultérieur -> un nouveau segment running
```

Le cycle de vie du core reste `cancelled` ; aucun événement `stopped` n'est introduit. Une annulation avec la raison `cancel_command` peut être présentée comme « Stopped » dans DingTalk, tandis que les autres raisons d'annulation peuvent être présentées comme « Cancelled ».

Pour `blockStreaming !== 'on'`, DingTalk surcharge la couture existante attendue `onResponseComplete()`. Cette méthode consomme le dernier texte accumulé, annule un timer de flush en attente, attend l'unique écriture en cours dans son timeout, effectue la mise à jour finale d'instance completed, et retombe sur l'envoyeur Markdown existant si la création ou la finalisation de la carte n'a pas réussi. `ChannelBase` n'émet donc `completed` qu'après la fin d'un chemin de livraison attendu. Aucun nouveau hook de livraison terminal partagé n'est ajouté.

Lorsque `blockStreaming === 'on'`, DingTalk ne crée pas de carte de statut et ne consomme pas les chunks bruts de cycle de vie pour la livraison par carte ; le `BlockStreamer` existant reste le seul chemin de livraison de réponse. Les cartes de question restent indépendamment éligibles. `onTaskLifecycle` enregistre les causes terminales et peut effectuer des projections best-effort failed/cancelled, mais il n'est pas traité comme une garantie de livraison attendue.

Les mises à jour terminales de carte de statut suivent un ordre borné unique :

1. Arrêter d'accepter les nouveaux chunks de streaming, annuler le timer de flush et replier le snapshot unique en attente dans le contenu final borné au lieu de rejouer chaque chunk d'origine.
2. Si le streaming était ouvert, le fermer avec `isFinalize=true`.
3. Assainir les marqueurs d'image locaux non résolus afin qu'une annulation terminale ne puisse pas exposer un chemin du système de fichiers.
4. Valider le contenu final, le contenu copiable, le texte de statut et `flowStatus=3` avec une seule mise à jour `/card/instances`.

Completed, failed et cancelled sont tous projetés vers `flowStatus=3` de DingTalk ; le contenu final et le texte de statut les distinguent. Une fois terminal, le rédacteur par `outTrackId` rejette les mises à jour de streaming tardives.

## Cycle de vie de la carte formulaire à callback — changement DingTalk seul

La carte de question représente une demande de permission contenant le tableau complet de questions normalisées. Le schéma de l'outil autorise une à quatre questions.

Chaque enregistrement en attente contient :

- `requestId`, `outTrackId` et `runId`.
- L'ensemble complet ordonné des questions et ses clés de réponse.
- Le `submitOptionId` annoncé d'origine.
- L'identité typée du propriétaire.
- Le répondeur à usage unique d'origine.
- Les abonnements de timeout et de règlement.
- L'état local `reserved`, `pending` ou `claimed` ; la terminaison
  remplace l'enregistrement par une pierre tombale compacte.

Le cycle de vie suit la dernière discipline de course de livraison d'OpenClaw sans
copier sa persistance ni la continuation par message synthétique :

```text
reserved   inséré et abonné avant createAndDeliver
pending    activé uniquement après une livraison réussie tout en étant encore reserved
claimed    revendiqué atomiquement par un callback valide
terminal   le premier règlement gagne ; le payload live est compacté
```

Si le règlement ou l'annulation d'exécution rend un enregistrement `reserved` terminal alors que
`createAndDeliver` est en cours, une livraison réussie ultérieure ne peut pas le réactiver.
L'adaptateur désactive cette carte livrée en best-effort et renvoie sans
appeler à nouveau le répondeur.

L'ordre des callbacks fait autorité :

1. Localiser l'enregistrement par `outTrackId` et corréler la requête et l'exécution.
2. Parser le payload de soumission ou d'annulation sans modifier l'enregistrement.
3. Valider le propriétaire de l'action.
4. Pour la soumission, rejeter chaque clé de réponse de formulaire qui n'est pas présente dans l'ensemble de questions normalisées stocké.
5. Revendiquer atomiquement l'enregistrement `pending` courant comme `claimed` avant la première opération asynchrone.
6. Accuser réception du callback immédiatement. Les callbacks invalides, dupliqués, échus et à propriétaire étranger sont également accusés de réception exactement une fois après leurs vérifications synchrones.
7. Appeler le répondeur d'origine.
8. Si le même enregistrement est toujours courant et non terminal, finaliser et projeter la carte depuis le résultat du répondeur.

La soumission encode le formulaire en utilisant le contrat inter-clients existant :

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "<advertised allow_once option>"
  },
  "answers": {
    "0": "Beijing staging",
    "1": "Logs, Metrics"
  }
}
```

Les valeurs de sélection unique et les entrées personnalisées sont des chaînes. Les valeurs de sélection multiple sont jointes avec `", "` pour correspondre au comportement actuel du TUI et du Web. L'annulation n'envoie qu'un résultat annulé ou rejeté annoncé, sans réponses. L'adaptateur n'envoie jamais de prompt synthétique ni de message entrant.

La carte n'affiche jamais le succès de soumission avant que le répondeur n'accepte la réponse :

| Événement                          | État local                     | Projection de la carte                                                  |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Le répondeur de soumission renvoie `true` | `submitted`             | Soumise et désactivée                                                  |
| Le répondeur d'annulation renvoie `true`  | `cancelled`             | Annulée et désactivée                                                  |
| `respond(...) === false`           | `expired`                      | `card_status=expired` non interactive, « Question no longer available » |
| `respond(...)` lève une exception  | `expired`                      | Projection d'échec non interactive, désactivée et non retentable       |
| Règlement indépendant non-annulation | `resolved_outside_presenter` | `card_status=expired` non interactive, « Resolved outside this card »  |
| Annulation repliée indépendante    | `cancelled`                    | `card_status=cancelled` non interactive, « Cancelled » neutre          |
| Timeout                            | `expired`                      | Expirée et désactivée                                                  |
| Requête ou exécution détruite      | `cancelled`                    | Annulée ou Stopped et désactivée                                       |
| Callback dupliqué ou tardif        | État terminal existant         | Accusé de réception et ignoré                                          |
| Règlement sur un enregistrement terminal | État terminal existant    | Ignoré à travers la pierre tombale terminale                           |

L'état local `resolved_outside_presenter` n'est atteint que depuis un événement de règlement indépendant non-annulation, et non déduit d'un résultat de répondeur `false`. `false` signifie seulement que la réponse de permission n'a pas été acceptée : le mapping de requête peut être absent, sa session peut avoir disparu, ou une autre surface peut déjà avoir gagné. Les deux cas utilisent donc la projection `expired` non interactive sans revendiquer une annulation par l'utilisateur.

Le bridge du démon existant consomme le mapping requête-vers-session lorsque `respondToPermission()` lève une exception, et `ChannelBase` supprime la requête en attente sur le même chemin. Un `permissionResolved` ultérieur du démon n'est plus un signal de nettoyage fiable car le bridge peut le rejeter comme requête inconnue. DingTalk journalise donc l'échec, supprime son enregistrement en attente, conserve la pierre tombale terminale et effectue immédiatement une projection de non-succès best-effort. Il ne libère pas la revendication ni ne promet de retry de callback.

`AcpBridge` émet `permissionResolved` de manière synchrone avant qu'un `respondToPermission()` réussi ne renvoie. Pendant que la revendication du répondeur DingTalk est en cours, l'adaptateur diffère donc la projection de règlement correspondante jusqu'à ce que le résultat du répondeur et l'action de callback soient connus. Une soumission acceptée devient `submitted` ; une annulation acceptée devient `cancelled` ; `false` et les exceptions utilisent les lignes terminales ci-dessus. Un règlement reçu sans revendication locale de répondeur suit les lignes sensibles au résultat ci-dessus. Le bridge du démon émet son règlement réussi plus tard, après avoir conservé un mapping de requête ayant reçu une réponse ; si la carte est déjà terminale, la pierre tombale ignore cet événement. Le timer local à DingTalk finalise d'abord la carte live comme `expired` puis appelle le répondeur, afin que l'annulation repliée du bridge ne puisse pas la ré-étiqueter. Une annulation d'exécution connue localement finalise de même comme `run_cancelled` avant le nettoyage du bridge. Les annulations repliées inconnues restent le `cancelled` neutre. Cette arbitration réutilise la revendication transitoire et n'ajoute aucun état public de traitement, file de retry ou taxonomie d'erreur.

Une mise à jour d'instance est une projection UI, et non la transaction de permission. Si le répondeur réussit mais que la mise à jour de carte ultérieure échoue, la permission reste résolue, l'enregistrement local reste terminal, les callbacks dupliqués restent rejetés, et l'adaptateur journalise la projection UI échouée.

Contrairement à l'implémentation de référence OpenClaw, Qwen Code n'injecte pas de message entrant synthétique. Il répond directement à la demande de permission d'origine. Une seconde requête dans la même exécution live utilise le fallback texte et laisse la première carte native en état de recevoir une réponse.

## Configuration et templates intégrés — changement DingTalk seul

La configuration de capacité est locale à DingTalk. Elle est parsée par l'adaptateur DingTalk et n'ajoute pas de concept de carte inter-canaux à `ChannelConfig` :

```json
{
  "interactiveCards": {
    "enabled": true,
    "statusCard": {
      "enabled": true
    },
    "questionCard": {
      "enabled": true,
      "timeoutMs": 270000
    }
  }
}
```

La durée de vie effective des questions est la plus petite entre le timeout configuré et la durée de vie de la permission de l'hôte.

Les IDs de template sont des assets intégrés du canal DingTalk, et non une configuration utilisateur. Le plugin de référence utilise ces IDs avec les propres identifiants DingTalk du bot installé ; ils ne sont pas traités comme des ressources détenues par l'AppKey du dépôt de référence :

- Carte de statut : `675cde2f-f526-40cb-b828-f5b2b57b8b77.schema`
- Carte de question : `c2a6355b-9724-4f7e-9653-d33fcb3311bb.schema`

La conception n'ajoute ni configuration de template fournie par l'utilisateur ni vérification de santé au démarrage. Un rejet OpenAPI de première utilisation est une erreur structurée explicite contenant l'ID de template et le code d'erreur DingTalk, puis entre dans le chemin de dégradation documenté.

Preuves du contrat d'assets intégrés et du flux de callback :

- [soimy/openclaw-channel-dingtalk#583](https://github.com/soimy/openclaw-channel-dingtalk/pull/583) est fusionné et consigne la livraison de carte sur appareil réel, le callback de soumission, le callback d'annulation et la vérification de continuation de tâche.
- [soimy/openclaw-channel-dingtalk#585](https://github.com/soimy/openclaw-channel-dingtalk/pull/585) est fusionné, livre l'asset final de template de carte de question, et a été approuvé par le mainteneur.
- [OpenClaw main à `a8fb6f80e7`](https://github.com/soimy/openclaw-channel-dingtalk/commit/a8fb6f80e7360ce0ffee2d4a8007951bd85b23a4) fournit la référence actuelle reserve/activate/claim/terminal de course de livraison.

Ces sources fournissent des preuves Card OpenAPI, template et concurrence. Qwen Code ne copie pas leur outil séparé, `AsyncLocalStorage`, le store de cycle de vie persistant, la réinjection par message synthétique, la supersession de questions, la vérification de propriétaire fail-open, ni le timing d'ACK après attente des callbacks.

## Comportement de dégradation — changement DingTalk seul

La conception initiale n'ajoute pas de file de retry en arrière-plan et ne conserve pas d'état persistant `presentation_failed`.

| Situation                                           | Comportement                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte de statut désactivée ou création/mise à jour finale échouée | Utiliser la livraison de réponse Markdown attendue existante et enregistrer une erreur structurée de carte. Un échec de mise à jour intermédiaire arrête les écritures de streaming ultérieures et préserve le texte borné pour la livraison finale. |
| Carte de statut livrée mais échec d'ouverture du streaming | Désactiver la carte vide en best-effort, arrêter les écritures de carte pour l'exécution, et utiliser la livraison de réponse Markdown attendue existante.                                   |
| `blockStreaming === 'on'`                           | Sauter la carte de statut ; conserver le chemin de livraison existant du `BlockStreamer`. Les cartes de question restent indépendamment éligibles.                                               |
| Carte de question créée                             | Renvoyer `presented` ; garder la permission d'origine en attente.                                                                                                                                |
| La même exécution a déjà une question native en attente | Renvoyer `unsupported` pour la requête la plus récente ; garder la première carte active et utiliser le fallback de permission texte existant pour la requête la plus récente.             |
| Carte de question désactivée ou création échouée    | Envoyer un Markdown sémantique lisible, indiquer que la question a été annulée et peut être retentée, annuler la requête d'origine, renvoyer `handled`, et journaliser l'échec tenant compte du template. |
| Aucune exécution active courante détenue par le canal | Traiter la présentation comme `unsupported` ; sauter les deux cartes DingTalk et préserver le chemin de permission existant.                                                                    |
| L'annulation d'exécution exacte renvoie `false`     | Libérer la revendication transitoire uniquement si le même enregistrement reste courant et non terminal ; garder la carte de statut active afin que Stop puisse être retenté.                    |
| Le répondeur de question renvoie `false`            | Terminer avec la projection annulée existante et un message neutre « Permission no longer pending ».                                                                                             |
| Le répondeur de question lève une exception         | Supprimer l'enregistrement en attente, terminer l'enregistrement revendiqué comme annulé, conserver une pierre tombale, projeter immédiatement le non-succès, et ne pas annoncer de retry de callback. |
| Un autre chemin résout en premier                   | Lorsqu'aucune revendication locale de répondeur n'est en cours, classifier une annulation repliée comme `cancelled` neutre ; utiliser `resolved_outside_presenter` uniquement pour un résultat non-annulation. |
| Requête/exécution détruite                          | Régler comme annulation de requête/exécution ; projeter la carte comme annulée ou Stopped.                                                                                                       |
| Un autre adaptateur IM possède la session           | Renvoyer `unsupported` et préserver son message de permission et ses commandes existants.                                                                                                        |
| Permission ordinaire                                | Garder `/approve`, `/approve-always` et `/deny` inchangés.                                                                                                                                       |

Pour une question présentée par carte, `/approve` et `/approve-always` restent reconnus mais n'appellent pas le répondeur ; ils indiquent à l'utilisateur de soumettre via la carte car l'approbation ne peut pas fournir l'objet `answers` requis. `/deny [requestId]` reste une porte de sortie car le rejet est déjà complet sans réponses. `ChannelBase` exige que l'expéditeur de la commande corresponde à l'expéditeur du prompt d'origine, puis route le rejet à travers le même répondeur de contexte à usage unique afin que le règlement de carte, le nettoyage du registre et la sémantique premier-répondeur-gagnant restent intacts. Les requêtes ambiguës conservent le prompt existant d'ID de requête explicite. Les autres permissions et adaptateurs conservent leur comportement de commande actuel. La conception initiale ne promet pas de retry automatique de callback.

## Impact sur les clients — les clients existants restent inchangés

| Client ou surface                                        | Impact               | Comportement après cette proposition                                                   |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| Exécution détenue par le canal DingTalk                    | Changement DingTalk seul | Créer et mettre à jour la carte de statut en streaming.                           |
| Requête de question détenue par le canal DingTalk          | Changement DingTalk seul | Présenter la carte formulaire à callback ou le fallback sémantique local à DingTalk. |
| Requête routée DingTalk sans exécution active détenue par le canal | Aucun changement de comportement | Aucune carte DingTalk ; préserver le chemin de permission existant.      |
| CLI/TUI                                                    | Aucun changement     | Continuer d'utiliser le dialogue de question natif.                                   |
| Web/Desktop                                                | Aucun changement     | Continuer d'utiliser le composant de question natif et le transport d'action existant. |
| IDE/ACP                                                    | Aucun changement     | Continuer d'utiliser l'UI de question ACP native ; aucun changement de schéma.        |
| SDK et clients ACP personnalisés                           | Aucun changement     | Continuer d'utiliser le protocole existant de demande et de réponse de permission.    |
| Autres adaptateurs IM                                      | Aucun changement direct | Héritent de `unsupported` ; conservent leur comportement de permission actuel et leur limitation connue. |
| Permissions ordinaires                                     | Aucun changement     | Garder l'UI d'approbation et les commandes existantes sur chaque client.              |

La résolution des permissions reste premier-répondeur-gagnant. La revendication transitoire DingTalk sérialise uniquement les callbacks pour une carte et arbitre un règlement correspondant qui arrive pendant son appel de répondeur ; elle ne remplace pas le règlement partagé. Si un règlement indépendant arrive sans revendication locale, DingTalk classifie son résultat sans revendiquer quel client a répondu. Si le répondeur de carte renvoie `true`, l'action de callback sélectionne `submitted` ou `cancelled`, et un `permissionResolved` correspondant est un nettoyage plutôt qu'une preuve qu'une autre surface a gagné.

## Critères d'acceptation de l'implémentation

L'implémentation n'est terminée que lorsque le comportement suivant est couvert. Ces tests exercent les couches modifiées ; les suites inchangées du core, ACP, démon, Web, IDE et autres adaptateurs ne sont pas du travail de fonctionnalité pour cette proposition.

### Tests du canal partagé — changement requis

- Chaque prompt détenu par le canal obtient un `runId` unique ; tous les événements de cycle de vie pour ce prompt portent le même ID, et un prompt ultérieur dans la même session obtient un ID différent.
- L'annulation d'exécution exacte ne réussit que pour l'ID courant. Les IDs manquants, échus et discordants renvoient `false` et ne retombent jamais sur l'annulation de session seule.
- Le normaliseur sémantique accepte le `_meta.qwenInteractionKind` canonique plus `_meta.qwenQuestions`, attribue des clés de réponse chaîne ordonnées, et normalise un `multiSelect` manquant à `false`.
- Le chemin de compatibilité accepte `rawInput.questions` uniquement pour un outil AskUserQuestion identifié et ne classe pas à tort un autre outil avec un argument `questions`.
- La normalisation de l'option de soumission accepte `kind: allow_once` et l'option legacy actuelle `proceed_once` sans `kind`, et n'invente jamais un ID d'option.
- `presented`, `handled` et `unsupported` suivent chacun leur comportement déclaré de propriété de la mise en attente.
- Les prompts de boucle et de webhook sont inéligibles à la présentation de carte sémantique même s'ils émettent des événements de cycle de vie ordinaires.
- Une question présentée par carte ne peut pas être approuvée par `/approve` ou `/approve-always` ; `/deny [requestId]` réservé au propriétaire utilise le même répondeur à usage unique, tandis que les permissions ordinaires conservent toutes les commandes.
- Les listeners de règlement ne reçoivent que des valeurs typées `UserInputSettlementReason` ; une annulation d'exécution connue localement gagne sur une annulation de bridge repliée ultérieure.
- La réponse directe, le `permissionResolved` externe, le timeout, l'annulation, la mort de la session, le remplacement du bridge et l'échec d'envoi règlent et suppriment l'enregistrement en attente exactement une fois.

### Tests de l'adaptateur DingTalk — changement DingTalk seul

- Un véritable événement DingTalk `started` humain lie une exécution éligible depuis son message entrant et son propriétaire ; les IDs de message synthétiques, inconnus, de boucle et de webhook ne créent aucune exécution ni carte éligible.
- Avec le bloc de streaming désactivé, une carte de statut coalesce les chunks avec au plus une écriture en cours et un snapshot borné en attente ; la livraison completed attend la finalisation et retombe sur le Markdown. Avec le bloc de streaming activé, aucune carte de statut n'est créée et la livraison par blocs existante reste la référence.
- Stop valide le propriétaire et l'identité de la carte, revendique une fois, annule uniquement le `runId` correspondant, rejette les doublons, et ne reste retentable qu'après un résultat `false` non terminal.
- Une demande de permission crée une carte de question contenant toutes les questions et leurs clés de réponse ordonnées ; une seconde requête dans la même exécution retombe sur le texte tandis que la première carte reste interactive, et différents utilisateurs et sessions restent indépendants.
- Une question est réservée avant la livraison, activée uniquement si elle est encore live après la livraison, et ne ressuscite jamais après un règlement en cours ou une annulation d'exécution.
- La soumission sélectionne l'option `allow_once` annoncée d'origine, encode les réponses uniques, à sélection multiple et personnalisées comme `Record<string, string>`, et résout directement la requête d'origine.
- Une soumission contenant une clé de réponse hors de l'ensemble de questions normalisées stocké est rejetée avant que le répondeur ne soit appelé.
- Le transport du callback est accusé de réception exactement une fois après le parsing, la corrélation, l'autorisation et la revendication synchrones, et avant toute attente de répondeur ou de Card OpenAPI.
- La soumission, l'annulation, le timeout, l'annulation d'exécution, la destruction de requête, la résolution externe, le callback dupliqué, le `false` du répondeur, l'exception du répondeur et l'échec de projection de carte utilisent tous `finalizeQuestion`, effacent l'ensemble de mise en attente au niveau exécution, et ne rouvrent jamais un enregistrement terminal.
- Un utilisateur de callback étranger ou non identifiable échoue en fail closed et ne peut modifier aucun des deux registres.
- Le contenu en streaming, la durée Card OpenAPI et les pierres tombales terminales obéissent à leurs bornes fixes de taille/temps ; les enregistrements terminaux ne contiennent ni répondeur, ni réponses, ni questions, ni timers, ni abonnements, ni contenu en file.
- La désactivation des cartes ou le rejet d'un template suit le chemin de dégradation de statut ou de question documenté sans exposer le JSON brut de la requête.

### Vérification E2E du reviewer — comportement DingTalk modifié

- Sur un véritable client DingTalk, vérifier la création de carte de statut, le streaming ordonné, et les projections de complétion, d'échec et d'annulation.
- Vérifier qu'une action Stop annule exactement son exécution active et qu'une ancienne carte ne peut pas annuler une exécution plus récente dans la même session.
- Vérifier les cartes à une et plusieurs questions, la sélection unique, la sélection multiple, l'entrée personnalisée, l'annulation, le timeout et la continuation de tâche avec les réponses soumises.
- Attacher le Web ou l'IDE à la même session du démon, résoudre la question là-bas en premier, et vérifier que la carte DingTalk devient non interactive sans revendiquer que DingTalk l'a soumise.
- Désactiver chaque type de carte indépendamment et vérifier le comportement Markdown documenté et la poursuite de l'exécution de la tâche ou l'annulation de la question.
- Avec `blockStreaming=on`, vérifier que la réponse par blocs existante reste la référence tandis que les cartes de question peuvent toujours être soumises avec succès.

## Chapitre 2 : Impact actuel sur les autres adaptateurs IM — aucun changement direct

Le hook partagé est une couture opt-in, et non un déploiement du comportement DingTalk. Les adaptateurs Feishu, QQ, Telegram, WeCom, Weixin et plugin ne lisent pas la configuration DingTalk, les IDs de template, les actions de callback ni les états de carte. Leur formatage de permission et leurs commandes existants restent inchangés.

La limitation existante reste explicite : `/approve` ne peut pas porter les réponses d'`ask_user_question`. Cette proposition n'annule pas silencieusement les questions et n'expose pas le JSON brut de la requête sur les autres adaptateurs IM.

## Chapitre 3 : Plan d'extension future — aucun changement dans cette proposition

Un futur adaptateur IM peut explicitement surcharger le hook sémantique pour une requête liée à son propre `ActivePrompt` courant. Un adaptateur renvoyant `presented` doit posséder sa présentation de plateforme, son parser de callback ou de réponse structurée, son registre de mise en attente, ses vérifications de propriétaire et d'exécution, son timeout, son règlement sensible à la cause, son idempotence et sa réponse directe à la requête d'origine. Il ne doit pas injecter un message utilisateur synthétique simplement pour reprendre l'exécution.

Chaque adaptateur doit opter via un changement séparé afin que sa capacité spécifique à la plateforme et sa propriété d'état puissent être examinées indépendamment.

## Risques et limites de périmètre

La première implémentation est volontairement locale au démon. Les registres live de cartes en attente sont liés à la durée de vie du processus ; la récupération sûre aux redémarrages et le routage de callbacks multi-instances non sticky nécessitent une conception de persistance séparée. Un enregistrement terminal est compacté pour ne contenir que la corrélation de callback, l'état terminal et les métadonnées d'expiration, conservé 10 minutes pour la relivraison de callback, et stocké dans des maps ordonnées par insertion plafonnées à 1 000 entrées par type de carte. L'expiration et l'éviction de l'entrée la plus ancienne le récupèrent ; aucun répondeur, payload de question, payload de réponse, timer, abonnement ou contenu en file ne survit à la terminaison.

Cette implémentation n'ajoute ni propriété d'exécution inter-clients ni mapping d'identité, ni protocole de réponse texte inter-canaux, ni parsing de réponse libre, ni injection de message synthétique, ni framework général de cartes inter-canaux, ni système de retry de callback, ni nouvelle machine d'état de traitement/erreur.
