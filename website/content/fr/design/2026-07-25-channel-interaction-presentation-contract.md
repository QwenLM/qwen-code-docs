# Contrat de présentation des interactions de canal

## Statut

Contrat indépendant du canal implémenté pour la PR #6930. La projection
spécifique à DingTalk et les détails opérationnels restent dans
`2026-07-15-dingtalk-interactive-cards.md`.

## Problème

L'implémentation précédente créait une carte de statut DingTalk sur
l'événement `started` au niveau du run. Si le modèle appelait ensuite
`ask_user_question`, l'adaptateur créait une seconde carte formulaire et
passait la première carte à `Waiting for input`. L'utilisateur voyait deux
cartes actives même quand le modèle n'avait produit aucune réponse visible.

Ce n'est pas une race de rendu DingTalk. C'est une erreur de propriété :

- un événement au niveau du run est traité comme un événement de sortie
  visible ;
- la présentation de la sortie et celle de l'entrée sont des machines à états
  d'adaptateur indépendantes ;
- il n'existe aucune définition partagée d'un segment de sortie visible ;
- une demande d'entrée ne termine pas la présentation de sortie active.

Corriger uniquement la suppression ou le rappel de carte DingTalk préserverait
l'erreur de propriété et ne donnerait ni à Feishu ni aux futurs adaptateurs IM
un contrat d'interaction stable.

## Objectifs

- Créer une présentation de sortie uniquement quand il y a une sortie visible
  par l'utilisateur.
- Laisser une carte d'entrée native devenir la seule présentation active quand
  le modèle demande une entrée avant d'avoir produit une sortie visible.
- Mettre à jour une carte d'entrée en place jusqu'à son état terminal ; ne pas
  la supprimer pendant le cycle de vie normal.
- Reprendre le contexte de permission et de modèle d'origine sans injecter de
  message utilisateur synthétique.
- Donner à chaque segment de sortie et à chaque demande d'entrée une
  corrélation exacte de run, de session, de cible et de propriétaire.
- Laisser DingTalk, Feishu et les futurs adaptateurs IM opter pour la même
  sémantique sans partager les APIs de cartes de plateforme ni les schémas de
  templates.
- Préserver le comportement existant des adaptateurs qui n'optent pas pour ce
  contrat.

## Non-objectifs

- Une API générique multiplateforme `createCard`, `updateCard` ou
  `deleteCard`.
- Le parsing de texte libre comme substitut à l'entrée structurée native.
- Exiger que chaque IM prenne en charge la sortie en streaming, les
  formulaires ou les boutons.
- Déplacer les handles de plateforme DingTalk ou Feishu dans `ChannelBase`.
- Persister les callbacks live au-delà des redémarrages de processus.
- Modifier Core, ACP ou le contrat de réponse de `ask_user_question`.
- Refactoriser l'implémentation existante des cartes Feishu dans le correctif
  DingTalk.

## Principes de design

### Sémantique partagée, projection locale

`ChannelBase` possède le contexte, l'ordonnancement et la sémantique de
règlement. Un adaptateur IM possède le rendu natif, le transport des
callbacks, les handles de plateforme, le throttling et les échecs de
projection.

La couche partagée ne fait jamais référence à des cartes. Elle fait référence
à :

- un run de prompt ;
- un segment de sortie visible ;
- une demande d'entrée structurée ;
- l'issue terminale de ces objets.

### Le contexte est capturé, jamais redécouvert

La chaîne de corrélation faisant autorité est :

```text
SessionTarget(chatId/threadId) -> sessionId -> runId -> segmentId/requestId
```

L'adaptateur capture cette chaîne quand il crée une présentation native. Un
callback résout l'enregistrement capturé. Il ne doit pas rechercher la
dernière carte, le dernier run ou la dernière session d'un chat.

`SessionTarget.threadId` reste la partition de thread quand une plateforme en
expose une. Les plateformes sans sémantique de thread utilisent `chatId`. Les
callbacks de plateforme ne dérivent pas indépendamment une nouvelle cible.

### Transactions et projections sont séparées

La réponse de permission est la transaction. Une mise à jour de carte est une
projection UI. Une réponse de permission réussie n'est jamais annulée parce
que la mise à jour de carte native ultérieure a échoué.

## Modèle sémantique partagé

### Run de prompt

Un `runId` identifie une exécution de prompt possédée par le Channel. Il
conserve les règles existantes d'annulation et de propriétaire du run exact.

L'événement de cycle de vie `started` signifie que le run a été accepté. Il
n'ouvre pas de présentation de sortie.

### Segment de sortie

Un segment de sortie est une séquence contiguë de texte d'assistant visible
par l'utilisateur à l'intérieur d'un run. `ChannelBase` alloue un `segmentId`
opaque uniquement quand le premier texte visible de ce segment arrive.

Un segment se termine au premier des événements suivants :

- une frontière de réponse ;
- la présentation d'une demande d'entrée structurée ;
- une remise de réponse finale réussie ;
- l'échec du run ;
- l'annulation du run.

Après qu'une demande d'entrée structurée est réglée, un texte ultérieur du
même run ouvre un nouveau segment avec un nouveau `segmentId`. Il ne rouvre ni
n'écrase jamais le segment d'avant la question.

### Demande d'entrée

Un `requestId` identifie une demande de permission `ask_user_question`
d'origine en attente. Une demande peut contenir toutes les questions
normalisées de cet appel d'outil. La propriété de la présentation est limitée
par `sessionId + owner.id`. Différents utilisateurs ou sessions peuvent avoir
des présentations d'entrée live simultanément. À l'intérieur d'un run, une
seconde demande dans le même scope retourne `unsupported`, garde la première
présentation native en état de recevoir une réponse et utilise le fallback de
permission texte existant.

La machine à états d'entrée interne à l'adaptateur est :

```text
reserved -> pending -> claimed -> terminal
```

C'est un arbitrage de callback, pas un état de carte de plateforme. DingTalk
n'expose que `pending`, `submitted`, `cancelled` et `expired` : une soumission
acceptée correspond à `submitted`, une annulation acceptée par l'utilisateur
correspond à `cancelled`, et un timeout, une résolution externe ou un répondeur
indisponible correspond à `expired`. Chaque transition terminale met à jour en
place la présentation d'entrée native existante et ne la supprime jamais.

Le label de règlement partagé est `resolved_outside_presenter`. Le contrat est
partagé par les formulaires natifs et les autres surfaces d'interaction, afin
qu'un nom spécifique à une plateforme ne devienne pas une API publique.

## Contrat partagé

Les hooks existants restent la surface d'extension. Ils reçoivent un contexte
sémantique renforcé plutôt que des opérations de plateforme.

```ts
interface ChannelOutputSegmentContext {
  channelName: string;
  sessionId: string;
  runId: string;
  segmentId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  messageId?: string;
}

type ChannelOutputSegmentEndReason =
  | 'response_boundary'
  | 'input_requested'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Les hooks de chunk et de complétion gagnent un argument de contexte final
optionnel pour la compatibilité de source. La terminaison de segment utilise
un hook dédié afin que les adaptateurs puissent distinguer les frontières de
réponse des demandes d'entrée et des causes terminales :

```ts
protected onResponseChunk(
  chatId: string,
  chunk: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): void;

protected onOutputSegmentEnd(
  chatId: string,
  sessionId: string,
  segment: ChannelOutputSegmentContext,
  reason: ChannelOutputSegmentEndReason,
): void | Promise<void>;

protected onResponseBoundary(
  chatId: string,
  sessionId: string,
): void | Promise<void>;

protected onResponseComplete(
  chatId: string,
  text: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): Promise<void>;
```

Les overrides existants qui acceptent moins d'arguments restent valides et
inchangés. `ChannelBase` fournit toujours le contexte de segment aux hooks de
réponse pour un run possédé par le Channel avec surveillance, et appelle
`onOutputSegmentEnd` chaque fois que ce segment se ferme. Son implémentation
par défaut ne délègue que `response_boundary` au hook legacy
`onResponseBoundary`. Les chemins loop, webhook et legacy synthétiques restent
inéligibles à la présentation d'interaction native.

`ChannelUserInputRequestContext` conserve son répondeur de demande et son
abonnement de règlement existants. Il porte en plus le scope d'interaction
capturé :

```ts
interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  precedingSegmentId?: string;
  // questions normalisées existantes, option de soumission, onSettled et respond
}
```

Son union de raisons de règlement utilise `resolved_outside_presenter`,
`cancelled` et `run_cancelled`.

Avant d'invoquer `presentUserInputRequest`, `ChannelBase` ferme l'identité de
segment partagée et passe son ID comme `precedingSegmentId`, mais ne projette
pas de frontière de réponse de plateforme. Un adaptateur compatible ferme sa
propre présentation avec `input_requested` avant de présenter l'entrée native.
Cela empêche les adaptateurs non compatibles d'effacer ou de modifier d'une
autre manière leur état de streaming existant. La fermeture est idempotente,
de sorte qu'un événement de frontière de réponse de plateforme qui arrive en
premier ou plus tard ne peut pas fermer deux segments différents.

Aucun flag de capacité partagé n'est requis. La capacité est exprimée par le
comportement :

- les hooks de sortie sont optionnels et correspondent par défaut à la remise
  existante ;
- `presentUserInputRequest` retourne `unsupported` quand l'entrée structurée
  native est indisponible ;
- la configuration spécifique à la plateforme reste à l'intérieur de
  l'adaptateur.

Cela évite les combinaisons invalides de booléens globaux et permet à un
adaptateur de prendre en charge la sortie en streaming sans les formulaires,
ou les formulaires sans la sortie en streaming.

## Contrat de présentateur à l'intérieur de chaque adaptateur

Un adaptateur peut composer un présentateur interne plutôt que d'ajouter un
état de plateforme à sa classe d'adaptateur principale. Ce présentateur
possède :

- `segmentId -> handle de sortie natif` ;
- `requestId/outTrackId/messageId -> handle d'entrée natif` ;
- une file de projection sérialisée par `runId` ;
- des snapshots de sortie limités et une coalescence des mises à jour ;
- la validation du propriétaire des callbacks et des revendications one-shot ;
- des timeouts d'API native et une journalisation des erreurs ;
- des pierres tombales terminales compactes.

La file de projection par run garantit cet ordre :

```text
terminer l'ancien segment de sortie
  -> créer la présentation d'entrée
  -> mettre à jour l'état terminal de l'entrée
  -> créer le segment de sortie suivant à son premier texte visible
```

Les ajouts de sortie intermédiaires mettent en file un snapshot complet
remplaçable et ne bloquent pas la génération du modèle. La frontière, la
présentation d'entrée et la remise finale rejoignent la même file afin de ne
pas pouvoir dépasser des écritures antérieures.

## Séquences d'interaction requises

### Réponse normale

```text
run started
  -> pas de sortie native
premier texte visible
  -> allouer segment-1
  -> créer paresseusement la présentation de sortie native
chunks ultérieurs
  -> mettre à jour segment-1
run completed
  -> mettre à jour segment-1 en place vers completed
```

Si un provider retourne une réponse finale sans émettre de chunks, la remise
finale alloue le segment et crée une présentation de sortie completed unique.

### Question directe

```text
run started
  -> pas de sortie native
demande ask_user_question
  -> créer la présentation d'entrée request-1
```

Aucun segment de sortie n'existe, donc l'utilisateur ne voit que la
présentation d'entrée. Pendant qu'elle est en attente, il n'y a pas de
présentation de statut de run séparée. L'état en attente de la présentation
d'entrée est l'indication visible que le run attend l'utilisateur.

### Texte suivi d'une question

```text
premier texte visible
  -> créer la présentation de sortie segment-1
demande ask_user_question
  -> compléter segment-1 en place
  -> créer la présentation d'entrée request-1
```

La sortie complétée reste dans l'historique de conversation, mais seule la
présentation d'entrée est active.

### Soumission de question et continuation

```text
callback valide
  -> corréler request-1 et valider le propriétaire
  -> revendiquer request-1 atomiquement
  -> acquitter le callback
  -> répondre à la permission d'origine
  -> mettre à jour request-1 en place vers submitted
prochain texte visible du modèle dans le même run
  -> allouer segment-2
  -> créer une nouvelle présentation de sortie
```

La réponse reprend le contexte de modèle d'origine. L'adaptateur n'injecte pas
de message entrant synthétique.

### Questions concurrentes

Au plus une présentation d'entrée native est active pour le même
`sessionId + owner.id + runId`. Une seconde demande dans ce scope retourne
`unsupported` ; `ChannelBase` envoie son fallback texte sémantique pendant que
la première présentation native reste valide. Cela évite une demande en
attente inatteignable sans synthétiser d'annulation ni de message entrant. Les
différents utilisateurs et sessions restent indépendants, et la terminaison du
run ferme toutes les présentations possédées par ce run.

## Projection DingTalk

Le présentateur DingTalk correspond :

- un segment de sortie à une instance de template de carte de statut ;
- une demande d'entrée à une instance de template de carte de question.

Changements par rapport à l'implémentation actuelle :

- ne pas créer de carte de statut sur `started` ;
- la créer sur le premier chunk ou la réponse finale d'un segment ;
- indexer les enregistrements de statut par `segmentId`, tout en conservant
  `runId` pour Stop ;
- fermer le segment actif avant de créer une carte de question ;
- garder la première carte de question active quand le même run demande une
  autre question et laisser la demande la plus récente utiliser le fallback
  texte ;
- ne jamais passer une ancienne carte de statut à `Waiting for input` ;
- mettre à jour la carte de question en place vers submitted, cancelled,
  expired ou résolu externe ;
- créer une nouvelle carte de statut uniquement quand le texte post-soumission
  commence.

Le chemin normal ne rappelle ni ne supprime aucune des deux cartes. Si une
remise native partiellement échouée laisse un orphelin inutilisable qui ne
peut pas être mis à jour, le nettoyage de plateforme peut le supprimer ou le
rappeler comme chemin d'erreur de dernier recours ; ce n'est pas une
transition d'état métier.

L'action Stop reste liée au `runId` exact et au propriétaire capturés par le
segment. Stopper depuis n'importe quel segment de sortie live n'annule que ce
run. Un segment historique terminal ne peut pas stopper un run ultérieur.

L'action Cancel de la carte de question résout la demande d'entrée d'origine
comme annulée. La sémantique d'annulation existante de `ask_user_question`
décide alors si le run se termine ; l'adaptateur n'émet pas de seconde
annulation à l'échelle de la session.

La première projection de métadonnées est délibérément limitée au modèle
configuré et au temps réel écoulé. DingTalk lit le modèle optionnel depuis la
configuration de Channel existante et rend une ligne évolutive telle que
`Running · qwen3.7-max · 12s`. Il rafraîchit la valeur écoulée quand le flux
coalescé existant de texte de modèle est purgé et que la seconde affichée a
changé, de sorte que le statut ajoute au plus une mise à jour par seconde sans
timer indépendant. Une réflexion silencieuse ou une exécution d'outil n'avance
donc pas le compteur visible avant la prochaine purge de texte. La mise à jour
terminale écrit toujours la valeur écoulée exacte, par exemple
`Stopped · qwen3.7-max · 18s`. Si la configuration de Channel ne sélectionne
pas de modèle, la ligne omet le modèle plutôt que d'en déduire un.

Cet incrément n'expose pas l'utilisation de tokens. Des comptes de tokens
exacts par tour ne sont pas présents dans le bridge de Channel actuel ni dans
le contrat de cycle de vie, et une estimation dérivée du texte visible serait
trompeuse. Un changement ultérieur pourra ajouter des métadonnées de tokens
uniquement après que le runtime partagé fournit un snapshot faisant autorité
par tour. Des métadonnées manquantes ne retardent ni ne modifient jamais
l'état du segment.

## Extension Feishu

L'implémentation Feishu existante crée déjà paresseusement des cartes de
streaming sur les chunks de réponse et peut mettre à jour ou supprimer un
message interactif. Elle n'a pas besoin d'être modifiée dans le correctif
DingTalk.

Un changement d'interaction Feishu ultérieur peut adopter les mêmes contextes :

- `segmentId` remplace la propriété implicite par `inboundMsgId` pour les
  cartes de sortie ;
- `runId` continue de protéger Stop contre l'annulation d'un run plus récent ;
- un formulaire interactif natif ou des boutons implémentent
  `presentUserInputRequest` ;
- le callback résout le `requestId` capturé, pas la dernière carte du chat ;
- le même message d'entrée est patché vers son état terminal ;
- les types de champs non pris en charge retournent `unsupported` ou annulent
  avec un échec lisible local à la plateforme plutôt que de parser du texte
  arbitraire.

Telegram, WeCom, Weixin, QQ et les adaptateurs de plugin peuvent consommer
indépendamment les contextes de sortie, les contextes d'entrée, les deux ou
aucun. Les hooks par défaut préservent leur comportement actuel.

## Règles d'échec et de dégradation

| Échec                                                  | Comportement requis                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| La création de la présentation de sortie échoue                       | Conserver le texte limité et utiliser le chemin de remise de texte attendu existant.                                                                            |
| La mise à jour de sortie intermédiaire échoue                         | Arrêter le streaming natif ultérieur pour ce segment ; préserver le texte final pour le fallback.                                                               |
| La mise à jour terminale de sortie échoue                             | Envoyer le texte final via le fallback existant et marquer la projection native comme indisponible.                                                       |
| La présentation d'entrée retourne `unsupported`                 | Utiliser le message de permission sémantique existant ; ne pas parser une réponse libre ultérieure.                                                             |
| La création d'entrée native échoue après opt-in                 | Informer l'utilisateur que la question native a échoué, annuler la demande d'origine et permettre un retry explicite.                                             |
| La réponse de permission réussit mais la mise à jour de la carte d'entrée échoue | Garder la permission résolue, conserver une pierre tombale terminale et journaliser l'échec de projection.                                                      |
| Le callback est dupliqué, périmé, étranger ou malformé      | Acquitter après validation synchrone et n'effectuer aucun changement d'état.                                                                              |
| Le run se termine avec des entrées en attente                             | Mettre à jour ces présentations d'entrée en place vers cancelled.                                                                                         |
| Le processus redémarre avec des cartes live                         | Traiter les callbacks comme n'étant plus en attente et mettre à jour vers expired/unavailable quand la corrélation de plateforme le permet. La récupération persistante est un travail séparé. |

## Limites d'état et de ressources

- Le contenu de sortie reste limité à 20 000 caractères visibles par segment.
- Chaque segment autorise une écriture native en cours et un snapshot en
  attente remplaçable.
- Les appels d'API native conservent des timeouts explicites.
- Les maps de run, segment, demande et callback live restent ordonnées par
  insertion et limitées.
- Les pierres tombales terminales ne contiennent que la corrélation et l'état
  terminal ; elles ne conservent ni répondeurs, ni questions, ni réponses, ni
  timers, ni contenu.
- Tout le nettoyage vérifie l'identité exacte des objets afin qu'une
  complétion asynchrone tardive ne puisse pas modifier un enregistrement plus
  récent de la même session.

## Plan de migration

Le correctif doit rester petit et ordonné :

1. Ajouter le contexte de segment de sortie et les frontières de segment
   idempotentes à `ChannelBase`, en préservant les signatures de hooks
   existantes via des paramètres de fin optionnels.
2. Ajouter des tests partagés pour l'allocation paresseuse de segment,
   l'ordre des frontières, les questions directes, les segments de
   continuation, les questions concurrentes et l'isolation des contextes.
3. Remplacer le contrôleur de statut à portée de run de DingTalk par un
   présentateur de run qui possède des enregistrements de sortie à portée de
   segment et des enregistrements d'entrée à portée de demande.
4. Supprimer la création eager de carte de statut et la projection
   `Waiting for input`.
5. Conserver les champs V2 de contenu final et la logique de règlement des
   questions structurées existants.
6. Vérifier DingTalk sur appareil réel avec les scénarios de question directe,
   texte-puis-question, continuation de soumission, Stop, timeout et échec.
7. Laisser le code de production Feishu inchangé ; n'ajouter de la preuve de
   compatibilité que si le changement de signature partagée l'exige.

Le correctif local ne peut être commité qu'après que l'acceptation sur
appareil réel correspond aux séquences ci-dessus. Il reste non poussé jusqu'à
approbation explicite.

## Critères d'acceptation

### Channel partagé

- `started` n'alloue jamais de segment de sortie.
- Le premier texte visible alloue exactement un ID de segment.
- Une frontière de réponse ou une demande d'entrée ferme ce segment exactement
  une fois.
- Le texte après le règlement de la question reçoit un ID de segment différent
  dans le même run et la même session.
- La corrélation de `chatId/threadId`, session, run, demande, segment et
  propriétaire ne peut pas croiser entre contextes concurrents.
- Les adaptateurs existants sans prise en charge d'interaction conservent leur
  comportement.

### DingTalk

- Un `ask_user_question` direct affiche une carte de question et aucune carte
  de statut.
- Une carte de question est mise à jour en place à la soumission, l'annulation,
  l'expiration et la résolution externe.
- Une seconde question dans le même run utilise le fallback texte pendant que
  la première carte native reste en état de recevoir une réponse.
- Les différents utilisateurs et sessions conservent des cartes de question
  live indépendantes.
- Le texte avant une question reste dans une carte de statut historique
  complétée.
- Le texte après soumission apparaît dans une nouvelle carte de statut.
- Aucune carte de statut n'affiche `Waiting for input`.
- Stop n'annule que le run capturé exact.
- Le contenu final complété reste visible via les champs V2 `blockList`,
  `content` et `copy_content`.

### Compatibilité inter-IM

- Feishu compile et ses tests de streaming de carte et de Stop existants
  restent verts sans adopter le nouveau présentateur.
- Un adaptateur peut implémenter l'entrée native sans sortie en streaming.
- Un adaptateur peut implémenter la sortie en streaming sans entrée native.
- Un adaptateur ne prenant en charge aucun des deux hérite du comportement
  texte existant.

## Résumé de la décision

L'abstraction partagée est un contrat de présentation d'interaction, pas un
framework de cartes. `ChannelBase` possède le contexte et la sémantique de
segment/demande. Chaque IM possède son présentateur natif. Les cartes de
sortie sont paresseuses et à portée de segment ; les cartes d'entrée sont à
portée de demande et mises à jour en place. Cela supprime le comportement de
double carte active de DingTalk tout en offrant à Feishu et aux futurs
adaptateurs un chemin d'extension stable et indépendant de la plateforme.
