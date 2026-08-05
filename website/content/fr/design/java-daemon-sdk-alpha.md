# Java daemon SDK 0.1.0-alpha

## Statut

Ce document définit le premier transport démon de l'artefact existant
`com.alibaba:qwencode-sdk`. Il est volontairement indépendant de
l'implémentation stdio legacy sous `com.alibaba.qwen.code.cli`.

## Objectifs

- Ajouter une API Java 11 pour `qwen serve` sans créer un autre artefact
  Maven.
- Livrer les événements streamés de texte, de réflexion, d'outil, d'usage, de
  permission et bruts dans l'ordre du démon.
- Renvoyer le texte du prompt uniquement après un événement terminal fiable
  correspondant.
- Reprendre un stream de prompt depuis le watermark d'admission sans trou de
  relecture ni livraison dupliquée à l'observateur.
- Rendre explicites les résultats de mutation ambigus et les résultats de
  prompt incomplets.
- Garder bornés les threads, streams, sessions et tentatives de détachement
  possédés par le client.

## Surface publique

`DaemonClient` possède les ressources HTTP et worker, lit les capacités et
crée les sessions. La création de session utilise par défaut
`sessionScope=thread`. L'observation bloquante des prompts utilise un pool de
workers borné configurable plutôt qu'un exécuteur global ou non borné.
Le minuteur partagé ne distribue que les actions de surveillance. La fermeture
de stream SSE potentiellement bloquante s'exécute sur un pool borné séparé
dimensionné à la limite de concurrence des prompts, afin qu'une fermeture
bloquée ne puisse pas retarder l'échéance ou la surveillance d'inactivité
d'une autre session. Chaque prompt admis réserve une capacité bornée de
nettoyage de stream jusqu'à ce que sa tâche finale de fermeture se termine. Un
prompt publie son terminal une fois son emplacement de prompt libéré, alors que
son propre stream se ferme encore, de sorte que cette capacité permet un
nettoyage drainé par emplacement de prompt ; une continuation terminale peut
démarrer le prompt suivant même à la limite de concurrence. Les fermetures qui
restent bloquées au-delà de cette marge peuvent encore faire échouer un appel
`startPrompt` ultérieur avec `DaemonClientCapacityException`, mais elles ne
peuvent pas rejeter silencieusement une fermeture déclenchée par échéance ni
faire croître le travail de nettoyage sans limite.

`DaemonSessionClient` possède une session démon et admet au plus un prompt
local à la fois. `startPrompt` renvoie un `PromptCall` immédiatement. Ses
futures d'admission et terminale sont indépendantes, de sorte qu'un appelant
peut distinguer « le démon a accepté ce prompt » de « le tour s'est terminé
de manière fiable ».
Les continuations des futures d'admission et terminale sont distribuées via un
exécuteur séparé possédé par le client, afin que les continuations
utilisateur ne puissent pas retarder l'observation SSE, son délai local ou la
capacité de transport des prompts. La complétion exceptionnelle suit le même
chemin. La capacité de publication est bornée par rapport à
`maximumConcurrentPrompts` ; les continuations qui restent bloquées peuvent
donc faire échouer un appel `startPrompt` ultérieur avec
`DaemonClientCapacityException` au lieu de créer des threads ou du travail en
file d'attente sans limite.

Une complétion indéterminée n'est pas une limite de réutilisation de session.
Après que l'admission devient inconnue ou qu'un prompt admis se termine de
manière indéterminée, le client de session rejette définitivement les prompts
suivants même si le nettoyage local du stream réussit.
Un délai d'observation local est publié sans attendre indéfiniment la
fermeture du stream ; le nettoyage continue de manière asynchrone et conserve
une capacité client bornée jusqu'à sa fin. Les appelants ferment ou
détruisent la session affectée.

`PromptObserver` reçoit des callbacks typés et l'événement brut. Les callbacks
s'exécutent en série sur un thread démon possédé par le client. Un curseur
d'événement n'avance qu'après que tous les callbacks applicables renvoient
avec succès. Les callbacks doivent donc revenir rapidement, ne doivent pas
attendre le même `PromptCall` et ne doivent pas fermer ni détruire la même
session depuis un callback. Répondre à une permission depuis son callback est
pris en charge ; la méthode de réponse renvoie `false` quand le démon rapporte
que la requête a déjà été résolue ou n'est plus en attente.

`promptText` est un raccourci au-dessus de `startPrompt`. Il collecte
uniquement le texte assistant, applique une limite d'octets UTF-8 et renvoie
un `PromptTextResult` uniquement pour un `turn_complete` correspondant. Un
`turn_error` reste un terminal fiable mais est rapporté comme
`PromptTurnException` ; tout résultat sans terminal fiable est rapporté comme
`PromptOutcomeIndeterminateException` avec le texte partiel explicitement
incomplet lorsqu'il est disponible.

L'encodage Fastjson2 et le décodage strict Jackson Core sont des détails
d'implémentation. Le décodage rejette le JSON non standard et les clés
d'objet dupliquées. Les valeurs JSON brutes publiques utilisent des `Map`,
`List`, scalaires et valeurs nulles Java.

La sélection du modèle à la création n'est volontairement pas exposée dans
cette alpha. Le démon maintient une nouvelle session en vie sur le modèle par
défaut lorsque `modelServiceId` est rejeté et rapporte le rejet uniquement via
un événement SSE émis avant la réponse de création. L'abonnement par prompt
démarre depuis le watermark d'admission plus tardif, il ne peut donc pas
prouver que le modèle demandé a été sélectionné sans ajouter un cycle de vie
séparé d'événements de session.

Avant la création de session, le SDK exige que le démon annonce REST et
`session_scope_override` ; il refuse les mutations quand un démon plus ancien
pourrait ignorer silencieusement le scope demandé. Tant qu'une session reste
ouverte, le SDK envoie une nouvelle mutation de heartbeat une fois par
intervalle configuré (une minute par défaut) uniquement si le démon annonce
`client_heartbeat`, et s'arrête lors du détachement ou de la destruction.
Chaque heartbeat a l'échéance normale de requête finie et n'est pas retenté ;
régler l'intervalle à zéro désactive le keepalive automatique.
De même, un prompt portant `deadlineMs` est rejeté avant l'admission sauf si
le démon annonce `prompt_absolute_deadline`, afin qu'une échéance côté serveur
demandée ne puisse pas être ignorée silencieusement. Le délai d'observation
local reste indépendant et est toujours appliqué par le SDK.

## Flux sur le fil

1. Envoyer un unique `POST /session/:id/prompt` non retenté.
2. Exiger `202` et valider `{promptId,lastEventId,eventEpoch?}`.
3. Ouvrir `GET /session/:id/events` avec `Last-Event-ID` réglé sur le
   watermark et `X-Qwen-Event-Epoch` réglé quand le démon a fourni un epoch.
4. Rejouer et observer uniquement les événements corrélés à ce prompt, tout en
   traitant les trames d'échec au niveau session comme fatales.
5. S'arrêter uniquement sur un `turn_complete` ou `turn_error` correspondant.

Cet abonnement par prompt couvre les événements de contenu et terminaux émis
avant que la réponse `202` n'atteigne le client. Il n'exige ni cache de prompt
inconnu ni pompe de session longue durée.

## Contrat de transport

Le `HttpClient` du JDK utilise HTTP/1.1 et ne suit jamais les redirections.
Chaque requête envoie des en-têtes `Accept` JSON ou event-stream,
l'authentification bearer lorsqu'elle est configurée, et le
`X-Qwen-Client-Id` délivré par le démon après la création de session.
SSE envoie en plus `Accept-Encoding: identity`, `Cache-Control: no-cache` et
`Last-Event-ID`. Lorsqu'il est disponible, `X-Qwen-Event-Epoch` voyage avec ce
curseur. Le client l'initialise depuis l'admission du prompt, l'apprend depuis
un en-tête de réponse SSE validé pour la compatibilité, conserve une valeur
connue quand une réponse omet l'en-tête, et fail closed si la valeur change
pendant l'observation du prompt.

Les corps JSON finis et d'erreur sont consommés par un abonné borné et mis en
course contre l'échéance de la requête via `sendAsync` ; la réception des
en-têtes de réponse ne termine pas cette échéance. Les corps SSE en échec sont
bornés séparément par le plus court des budgets de requête et d'observation du
prompt.

Le parseur SSE accepte le cadrage LF et CRLF, les commentaires et plusieurs
lignes `data:`. Le décodage UTF-8 est strict. Les trames, les noms
d'événement, la version d'enveloppe, les ID numériques et la cohérence des ID
SSE/enveloppe sont validés. Une trame mal formée, un trou d'ID,
`state_resync_required`, la mort de la session, un échec de l'observateur, un
délai d'inactivité ou l'épuisement des reconnexions échouent fail closed.

Les ID inférieurs ou égaux au curseur validé sont des doublons et ne sont pas
livrés. Le prochain événement numérique doit être exactement `cursor + 1`. Les
événements synthétiques sans ID ne sont acceptés que pour les trames de
contrôle documentées du démon et ne déplacent pas le curseur ; un événement de
contenu ou terminal sans ID échoue fail closed.
L'implémentation reconnecte uniquement le GET SSE, en utilisant un backoff
exponentiel borné à gigue totale, la directive SSE `retry` après une
déconnexion du stream, et `Retry-After` sur les réponses HTTP retentables. Les
mutations ne sont jamais retentées automatiquement.

## Résultats ambigus et terminaux

Si le transport du prompt échoue après l'envoi sans un `202` validé, ou
renvoie HTTP 408 ou 5xx, la future d'admission échoue avec
`PromptAdmissionUnknownException` ; le SDK ne réenvoie jamais le prompt. La
création de session applique la même classification conservatrice via
`SessionCreationOutcomeUnknownException`. Les permissions, annulations,
heartbeats, détachements et suppressions appliquent la même classification,
car une réponse intermédiaire ne prouve pas que le démon a rejeté la mutation.
Le détachement utilise le plus spécifique `DetachOutcomeUnknownException`.
Chaque mutation est tentée au plus une fois par invocation de méthode.

Seuls un `turn_complete` et un `turn_error` correspondants sont terminaux. Les
événements de file d'attente et `prompt_cancelled` sont indicatifs. Un délai
local arrête l'observation mais n'annule pas automatiquement le tour du démon.
Une annulation coopérative du démon se termine comme `turn_complete` avec
`stopReason=cancelled`, tandis qu'un échec d'agent ou de provider pendant
l'annulation peut produire `turn_error`.
`promptText()` renvoie le résultat complet et fait remonter le terminal
d'erreur comme `PromptTurnException` ; les appelants doivent attendre le
terminal dans les deux cas.
Lorsque l'annulation, l'échéance, le démontage ou la stabilisation de l'agent
sont en course, le latch exactement-une-fois du démon publie le premier
terminal formel et supprime les candidats ultérieurs. Le SDK traite donc le
terminal reçu comme faisant autorité au lieu de déduire un résultat de la
dernière mutation de contrôle qu'il a envoyée.

`close()` est localement idempotent, arrête l'observation locale et tente le
détachement au plus une fois. Une réponse de détachement perdue n'est pas
retentée. `destroySession()` est la seule API qui émet `DELETE /session/:id` ;
elle peut être appelée après le détachement.

## Compatibilité et non-objectifs

L'artefact entier exige désormais Java 11. Les utilisateurs de Java 8 doivent
rester sur `0.0.3-alpha`. L'API stdio reste compatible au niveau source mais
s'exécute désormais sur Java 11 et obtient le logging via `slf4j-api` ; les
applications choisissent leur propre provider SLF4J car Logback est réservé
aux tests.

Le démon compatible est le build qwen-code publié depuis la même révision de
source que le SDK. Il contient le registre de détachement par client de
#7386, la garantie terminale par epoch de #7400, les epochs de curseur
d'événement sûrs au redémarrage de #7458, ainsi que l'annulation d'admission
acquittée de cette version et la barrière de drainage FIFO des annulations. Le
commit #7400 seul peut encore acquitter une annulation avant l'envoi à l'agent
sans arrêter le prompt admis, ou laisser une annulation non acquittée au scope
de session atteindre un successeur en file d'attente.
L'enfant ACP embarqué gère la requête d'annulation interne du démon via un
unique handshake acquitté conscient de l'admission. Un enfant ACP
personnalisé conforme aux standards qui n'implémente pas cette extension
reçoit à la place une unique notification standard `session/cancel`. Le démon
n'annonce pas de capacité distinguant ces implémentations avec le même
ensemble de fonctionnalités REST/SSE, donc le SDK ne peut pas négocier ce
minimum à l'exécution et échoue fail closed quand un terminal formel est
absent.

Le handshake attend volontairement que l'appel de prompt ciblé se stabilise
avant que la FIFO puisse distribuer son successeur. Ajouter un délai
uniquement basé sur l'acquittement permettrait à une annulation tardive au
scope de session d'atteindre ce successeur et casserait la garantie d'ordre.
Par conséquent, un provider, un outil ou une intégration personnalisée qui
ignore son `AbortSignal` indéfiniment peut laisser le résultat de la mutation
d'annulation inconnu et la session inutilisable. Récupérer un enfant ACP
partagé coincé sans terminer les sessions sœurs exige une isolation runtime
plus forte et sort de cette alpha.

L'alpha détecte un changement d'epoch d'événement pendant un prompt observé et
échoue fail closed, mais ne promet pas une exécution exactement-une-fois au
travers des redémarrages du démon, une récupération automatique d'epoch, un
snapshot/resync, des curseurs persistés ou une véritable annulation ciblée par
ID de prompt. Elle n'expose pas non plus la sélection du modèle à la création
tant que le démon ne peut pas renvoyer un résultat définitif ou que le SDK ne
possède pas un cycle de vie d'événements de session depuis `Last-Event-ID: 0`.
Une création ambiguë peut laisser une session démon que l'appelant ne peut ni
identifier ni détacher jusqu'au nettoyage côté démon. Ces cas exigent des
contrats de démon plus forts.

## Vérification

Les tests unitaires utilisent un serveur HTTP in-process pour injecter la
fragmentation SSE, la livraison lente ligne par ligne, la relecture, les
doublons, les trous, les ID de prompt en conflit, les données d'événement
futures opaques, la relecture de watermark, les déconnexions, les réponses
compressées, les corps finis bloqués, la propagation et l'incohérence d'epoch
d'événement, la resynchronisation, les échecs d'observateur, l'absence de
terminal et les réponses de mutation ambiguës. Les tests de cycle de vie
couvrent l'admission d'un prompt local unique, la sérialisation
admission/fermeture, un terminal d'échéance suivi d'une réutilisation de
session, une complétion annulée, l'ordre des terminaux de démontage, le texte
borné, le heartbeat automatique, la fermeture idempotente, l'identité client
du détachement, le détachement unique et la destruction explicite.

La CI compile et teste sur Java 11, 17 et 21 sur Linux, avec une couverture de
smoke Java 21 sur macOS et Windows. La CI Linux et le workflow de release
protégé exécutent un E2E contre un véritable processus `qwen serve` avec un
workspace temporaire et un stub de modèle.
