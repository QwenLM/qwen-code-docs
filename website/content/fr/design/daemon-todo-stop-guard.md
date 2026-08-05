# Garde d'arrêt des todos du démon

## Problème

Les clients du démon et d'ACP peuvent maintenir une session en vie après la
fin d'un tour de modèle. Lorsque le modèle vient d'écrire une liste Todo de
premier niveau non terminée, un arrêt naturel du modèle peut laisser la
requête du démon incomplète alors que la session possède assez d'état fiable
pour continuer. Le client n'a actuellement aucun moyen borné et intégré de
distinguer ce cas d'un tour terminé ordinaire.

Ce design ajoute une garde d'arrêt opt-in réservée au démon. Elle ne modifie
délibérément ni le TUI, ni l'outil Todo de Core, ni la boucle d'agent
générale.

## Configuration et frontière de sécurité

`experimental.todoStopGuard` est `false` par défaut, nécessite un
redémarrage et n'est pas affiché dans la boîte de dialogue des paramètres du
TUI. La garde est forcée à désactivée en mode sans échec, en mode nu et en
mode d'approbation `plan`. `disableAllHooks` ne désactive pas la garde
intégrée car ce n'est pas un hook externe.

Chaque étape de continuation automatique ininterrompue peut créer au plus
deux flux supplémentaires du modèle primaire. Un message utilisateur en cours
de tour démarre explicitement une nouvelle étape à deux tentatives car c'est
une nouvelle entrée utilisateur, tandis que les nouvelles tentatives /
continuations et les résultats d'arrière-plan conservent le budget de
l'étape courante. Les vérifications de permission existantes, l'annulation,
les limites de tokens, la protection contre les boucles, les périodes de
grâce ACP et les limites de ressources du démon restent faisant autorité. En
particulier, un client déconnecté n'implique jamais une approbation de
permission.

## État fiable

Le `Session` du CLI possède une petite machine à états
`DaemonTodoStopGuard` en mémoire. Elle stocke si la chaîne de travail
courante est armée, le dernier nombre d'éléments non terminés, les
tentatives de continuation validées, l'état de suspension / de prompt en
file, et si l'épuisement a déjà été signalé. La session prend séparément un
snapshot des IDs des agents d'arrière-plan, des shells, des moniteurs et des
wakeups au début d'une chaîne de travail, y compris les notifications
terminales et les wakeups déjà en file à cette frontière.

Seul un résultat réussi de `TodoWriteTool.execute()` de premier niveau avec
l'enveloppe structurée `{ type: 'todo_list', todos: [...] }` peut armer la
garde. L'observation a lieu après l'exécution de l'outil et le calcul du
statut, avant les hooks `PostToolUse` de la session. Les arguments,
l'historique rejoué, l'état du disque, les appels d'outil échoués ou en
double, les listes Todo de sous-agents et les outils découverts qui masquent
le nom de wire `todo_write` ne sont pas fiables. Le résultat réussi le plus
récent remplace le comptage ; une liste vide ou entièrement terminée
désarme la garde immédiatement. Le désarmement empêche une autre continuation
par arrêt naturel ; il ne tronque pas une boucle d'outil déjà ouverte par un
flux de garde validé.

Un nouveau prompt utilisateur ordinaire démarre une chaîne de travail non
armée et réinitialise sa baseline d'arrière-plan. Il ne peut pas hériter de
l'activation d'une requête antérieure même si l'état Todo reste en mémoire.
La nouvelle tentative / continuation fiable conserve la chaîne de travail
uniquement tant qu'un état de garde fiable non terminé existe encore ; après
un événement de cycle de vie effaçant la confiance, elle démarre avec une
nouvelle baseline d'arrière-plan et doit s'armer à nouveau. Un message
utilisateur en cours de tour conserve son activation et démarre une nouvelle
étape à deux tentatives. Cela signifie que la borne dure est de deux flux
automatiques consécutifs sans nouvelle entrée utilisateur, et non deux flux
sur toute la durée de vie d'une chaîne de travail. Les tours cron et de
notification peuvent établir leur propre chaîne via une écriture Todo de
premier niveau réussie ; lorsqu'ils traitent des résultats d'arrière-plan
pour une chaîne armée, ils conservent le budget de cette chaîne. Un résultat
d'arrière-plan lié est aussi une continuation fiable qui efface une pause de
nouvelle tentative API/réseau sans effacer une suspension dure.

La garde n'est pas persistée. Le rewind et la restauration de l'historique
effacent la confiance, tout comme le branchement/fork, un changement réussi
de répertoire de travail, une nouvelle session, la restauration depuis le
disque et le redémarrage du démon ou de l'agent. Un attachement live d'un
client à la même session conserve l'état en mémoire ; changer de modèle ou
de mode d'approbation autre que Plan ne démarre pas en soi une nouvelle
chaîne de travail. Une invalidation de cycle de vie bloque aussi les
résultats d'outil tardifs du tour live remplacé pour qu'ils ne réarment pas
la garde ; le prochain prompt indépendant ou tour automatique établit une
nouvelle frontière. Les files automatiques différées sont libérées une fois
qu'un prompt de premier plan invalidé se stabilise, y compris lorsque ce
prompt se termine par un chemin d'erreur.

## Ordre d'arrêt

La garde ne participe qu'à un arrêt naturel du modèle. Lorsqu'elle est
active, la session applique cet ordre :

1. Drainer les messages utilisateur en cours de tour. S'il en existe,
   ignorer les hooks Stop et la garde, réinitialiser le budget de la garde
   et exécuter la continuation utilisateur dans la boucle courante.
2. Si le FIFO du démon contient un prompt complet et non abandonné, terminer
   la requête courante et marquer l'ancienne chaîne comme en attente de ce
   prompt. Une requête en file annulée ne peut pas laisser plus tard une
   activité d'arrière-plan ranimer l'ancienne chaîne. Lorsque le dernier
   prompt en file est abandonné, le bridge indique explicitement à la
   session live de terminer la garde en attente et de libérer les files
   automatiques non liées. Si un même drain observe à la fois un message en
   cours de tour et un prompt complet en file, le message en cours de tour
   s'exécute en premier et la priorité FIFO reste en vigueur même si cette
   continuation termine la liste Todo ou arrête durement la garde.
3. Sur les tours de premier plan, évaluer les hooks Stop externes existants
   avec leur plafond et leur sémantique d'erreur existants.
4. Évaluer la garde uniquement lorsqu'elle est armée, non suspendue ni en
   attente d'un prompt en file, possède des éléments non terminés, est hors
   du mode d'approbation `plan` et n'a aucune entrée d'arrière-plan
   pertinente.
5. Si un hook externe et la garde bloquent le même arrêt, combiner leurs
   raisons en un seul appel de modèle de continuation. Leurs compteurs
   restent indépendants.

Une entrée d'arrière-plan pertinente est un agent d'arrière-plan, un shell,
un moniteur ou un `@wakeup` encore live dont l'ID n'était pas dans la
baseline de la chaîne de travail, plus les notifications ou wakeups en file
avec la même relation. Le travail d'arrière-plan et les tâches cron
ordinaires hérités d'une requête plus ancienne ne bloquent pas une nouvelle
requête. Les tours automatiques cron/notification n'exécutent que la garde
intégrée ; ils n'introduisent pas d'appels de hook Stop externe. Un résultat
lié conserve le budget courant, tandis qu'une notification d'ancienne tâche
ou un tour cron ordinaire est différé jusqu'à ce que la chaîne active ne
puisse plus reprendre, puis démarre une chaîne indépendante non armée. Les
déclenchements cron récurrents différés non liés sont fusionnés par tâche et
bornés afin qu'une dépendance d'arrière-plan bloquée ne puisse pas faire
croître la file sans limite. Les suggestions de suivi du démon sont aussi
supprimées tant qu'une chaîne de garde peut encore reprendre ou qu'un prompt
FIFO complet est prioritaire, afin que le travail non terminé ne déclenche
pas un appel de modèle de suggestion concurrent.

Les chemins terminaux durs suspendent la chaîne de travail courante :
annulation par l'utilisateur ou par permission, `PostToolUse.shouldStop`,
protection contre les boucles ou les appels répétés, limites de tokens et
plafond des hooks Stop externes. Les erreurs API et réseau préservent l'état
pour une nouvelle tentative / continuation fiable explicite.

## Continuations et observabilité

La première continuation de la garde envoie :

> [Todo Stop Guard] N todo item(s) are still pending or in progress. Continue executing the current task now. Do not ask the user whether to continue. If progress requires user input, use the structured question or permission flow. If progress depends on external state, report the blocker explicitly.

La seconde envoie aussi :

> This is the final automatic continuation. Before ending, either complete/update the todos or report the completed progress and the exact blocker.

Le compteur n'est validé qu'après que `responseStream` est renvoyé avec
succès. Une annulation, un échec de compaction ou un rejet de tokens avant ce
point ne consomme pas de tentative ; un échec de flux ultérieur en consomme
une. Le texte libre de blocage n'est pas analysé. Un échec de compaction
suspend cette chaîne de garde afin qu'elle ne puisse pas laisser des files
automatiques bloquées derrière une nouvelle tentative inaccessible ;
lorsqu'un hook Stop externe était fusionné, sa raison peut encore continuer
sous la sémantique existante du hook. Le budget compte chaque flux de modèle
primaire attribuable à la garde, y compris un suivi qui envoie les résultats
d'outil du flux de garde précédent. Si le second flux renvoie d'autres
appels d'outil, la session exécute et préserve leurs résultats mais n'ouvre
pas de troisième flux attribuable à la garde. Si le premier flux termine
tous les Todos via un appel d'outil, la tentative restante peut envoyer le
résultat d'outil sans autre prompt de Todos non terminés afin que le modèle
puisse finir sa réponse. L'entrée en cours de tour prend plutôt en charge
cet envoi de résultat d'outil et devient prioritaire sans consommer la
tentative de garde restante. Lorsque ce flux était fusionné avec un hook Stop
externe, la boucle d'outil existante du hook peut encore envoyer ces
résultats sans autre prompt ou tentative de garde ; activer la garde ne doit
pas tronquer une continuation de hook externe.

Chaque continuation validée émet un `agent_message_chunk` discret rejouable
avec `_meta.source = 'todo_stop_guard'` et la tentative, le nombre maximal
de tentatives et le nombre non terminé. L'épuisement émet de manière
similaire :

> [Todo Stop Guard] Automatic continuation stopped after 2 attempts; N todo item(s) remain unfinished.

Le texte des Todos n'est jamais inclus dans la télémétrie de la garde. Les
métadonnées d'usage normales comptabilisent toujours les appels
supplémentaires. La compaction de relecture préserve les événements de garde
qui portent à la fois `qwenDiscreteMessage` et la source de la garde, de
manière indépendante, afin de ne pas fusionner les tentatives ni rejeter
leurs métadonnées par tentative après que l'anneau d'événements live a
dépassé sa capacité.

## Compatibilité du bridge

`craft/drainMidTurnQueue` ajoute un champ optionnel `hasQueuedPrompt`. Le
bridge le définit uniquement lorsque sa liste de prompts en attente contient
une entrée complète dont l'état est `queued` et dont le signal d'abandon
n'est pas abandonné. Les anciens clients Desktop/canal peuvent omettre le
champ ; la session traite l'omission comme `false`. Si le drain expire, les
réponses tardives peuvent restaurer les contenus de message, mais leur
snapshot de prompt en file est rejeté car il peut déjà être obsolète.

Le comportement de déconnexion REST/SSE et l'anneau d'événements restent
inchangés. ACP HTTP conserve sa période de grâce de dix secondes et son
chemin de relecture existants ; l'expiration de la grâce et la fermeture /
annulation explicite conservent leur comportement de terminaison actuel.

## Vérification

Les tests unitaires couvrent l'activation stricte, les réinitialisations de
cycle de vie, la suspension, la sémantique de budget et de validation de
flux, le signalement de file du bridge, les portes de configuration, la
fusion des hooks Stop et les chemins terminaux. Les tests de concurrence
couvrent la priorité FIFO des prompts, la récupération de drain tardif,
l'isolation de la baseline d'arrière-plan et les tours automatiques. Le test
E2E du démon couvre l'admission de prompt sans abonné SSE et la relecture
ultérieure sur l'anneau des tentatives bornées. Les régressions existantes
du transport ACP couvrent la reconnexion dans la fenêtre de grâce,
l'expiration de la grâce et les allers-retours de permission ; le plan E2E
manuel exerce aussi ces chemins avec la garde armée. Avec le paramètre
désactivé, les comportements existants des hooks Stop, de cron, des
notifications et des prompts doivent rester inchangés.
