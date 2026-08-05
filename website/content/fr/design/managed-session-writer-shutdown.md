# Arrêt du writer de session managé

## Problème

Un remplacement managé de `qwen serve` peut démarrer sur un nouveau nom
d'hôte alors que l'ancien enfant ACP possède encore un verrou de writer de
session. Un verrou v1 d'hôte étranger ne peut pas être prouvé obsolète, donc
le remplacement renvoie correctement `session_writer_conflict`. Une
réclamation par nom d'hôte ou par âge permettrait à deux Pods en vie
d'écrire la même transcription.

## Périmètre

Ce P0 fait en sorte que l'arrêt coopératif managé libère les verrous de
writer avant l'échéance SIGKILL du parent. Il n'ajoute ni enregistrement de
transfert scellé, ni revendication de prise de contrôle, ni TTL ni vol par
nom d'hôte, ni fencing de plateforme, ni bail de maintenance, ni récupération
automatique après un SIGKILL, un blocage de la boucle d'événements ou un
échec de stockage. Les verrous historiques d'hôte étranger exigent toujours
un fence de writer externe et un nettoyage manuel.

Seul un enfant ACP qui valide la capacité parent privée existante utilise le
chemin managé. L'ACP autonome conserve son arrêt existant et son comportement
de récupération d'owner obsolète local. L'acquisition managé ne réclame
jamais un verrou existant à partir de la visibilité du PID, car les espaces
de noms PID des conteneurs rendent cette preuve non sûre.

## Terminal du writer

La fermeture du writer est single-flight et ferme l'admission publique de
l'enregistrement de manière synchrone. La fermeture normale finalise les
métadonnées avant de fermer et attend le travail accepté. La fermeture rapide
managée n'attend pas un tour de modèle actif et n'ajoute pas d'enregistrement
de finalisation supplémentaire ; elle draine uniquement le travail de
l'enregistreur accepté avant la coupure.

Un échec de flush scelle le writer et est tout de même rapporté après une
tentative de libération à owner exact, préservant le contrat de fermeture
existant. Un échec de propriété ou de libération conserve le verrou primaire
sauf si la libération a déjà été validée. La seule validation de libération
est un renommage dans le même répertoire du verrou primaire `P` vers un
chemin de retraite `R` unique à l'owner. L'ancien owner ne peut nettoyer que
son `R` exact ; il ne retente jamais le renommage primaire ni ne touche au
`P` d'un successeur. L'arrêt managé émet un avertissement visible par
l'opérateur avec les chemins de verrou candidats lorsque le terminal du
writer échoue. Le nettoyage manuel n'est sûr qu'après vérification que le
writer précédent ne s'exécute plus.

## Arrêt ACP managé

La première action d'arrêt ferme la création de session et l'admission des
tours, et prend un snapshot des instances Config actives, en initialisation
et à nettoyage différé capables d'un writer. Tous les terminaux de writer
démarrent avant le premier await et s'exécutent en parallèle. Les hooks
SessionEnd s'exécutent après la phase writer, tandis que les ressources
Config sont encore disponibles. Le nettoyage des ressources s'exécute ensuite
avec le temps restant.

L'enfant sort avec zéro uniquement lorsque chaque terminal de writer est
propre. Un verrou peut avoir été libéré alors qu'un nettoyage ultérieur de
hook ou de ressource rend encore l'arrêt global impropre.

## Quiescence des ressources Config

L'arrêt du writer et l'arrêt des ressources Config sont des terminaux
séparés. La fermeture du writer démarre toujours avant le premier await de
l'arrêt managé. Le nettoyage des ressources rejoint ensuite tout
`Config.initialize()` en cours avant d'inspecter et d'arrêter les ressources,
de sorte que l'initialisation ne puisse pas créer un watcher, un registre
d'outils ou un gestionnaire MCP après que le nettoyage a déjà rendu la main.

L'initialisation de Config est scellée dès que l'arrêt démarre, et le
nettoyage des ressources est single-flight au travers de l'arrêt managé et du
nettoyage concurrent sur échec de requête. L'appel `shutdown(options)`
complet n'est pas single-flight car les options de writer et de télémétrie
restent spécifiques à l'appel.

Une Config incomplètement initialisée démarre la libération à owner exact dès
que son bail en attente est exposé, avant de rejoindre l'initialisation. Les
lectures de snapshot de transcription observent cette libération entre les
chunks et s'arrêtent sans publier un enregistreur tardif. Une Config
initialisée avec succès conserve l'ordre normal de finalisation, flush et
fermeture. La jonction de l'initialisation n'a pas de délai local : expirer
l'attente laisserait l'initialisation sous-jacente s'exécuter et
réintroduirait la création tardive de ressources. L'échéance du processus
démon reste la limite dure, après que la libération du writer en attente a
déjà réussi ou échoué explicitement.

## Cycle de vie du processus parent

Chaque handle de démon possède un registre de processus partagé par les
fabriques de canaux de workspace primaires, secondaires et dynamiques. La
réservation de spawn et le sceau d'arrêt rivalisent de manière synchrone. Un
spawn réussi est attaché au registre dans le même tour.

Une erreur avant l'événement `spawn` de Node sans PID est `no_process` ;
après confirmation du spawn, seul un `exit` brut prouve la récupération. Un
échec de construction de canal après le spawn SIGKILL immédiatement l'enfant
non publié et rejoint le terminal du canal avant de renvoyer l'erreur de
construction. Après qu'une fabrique de canal a rendu la main, le bridge
possède le canal avant de construire ou publier son ChannelInfo complet.

L'arrêt du démon utilise une seule chronologie monotone de registre de
processus : SIGTERM à `t0`, arrêt impropre stable si l'enfant sort non nul
ou par signal, SIGKILL à `t0 + 5s` et échec `not_reaped` stable à
`t0 + 10s`. Une sortie à zéro est l'acquittement coopératif du terminal de
writer de l'enfant managé ; la sortie brute seule prouve uniquement la
récupération. Les échéances du registre ne redémarrent jamais, et une sortie
brute tardive ne peut pas faire passer son terminal échoué à un succès. Le
démon conserve son chemin de retry existant pour un worker de canal managé
indépendamment qui devient récupérable plus tard ; un tel retry rejoint le
même terminal établi de registre de processus ACP plutôt que de démarrer une
nouvelle chronologie d'arrêt ACP.

L'échéance parent ne s'étend volontairement pas pour correspondre aux budgets
des hooks SessionEnd, de l'initialisation de Config ou du nettoyage MCP, car
la fenêtre de terminaison de la plateforme peut être plus courte et hors du
contrôle du démon. Ces phases après le writer utilisent le temps restant
après la libération du writer et peuvent être interrompues, produisant une
sortie de démon impropre sans restaurer le verrou de writer libéré. Seule une
sortie de worker de canal non confirmée maintient le démon en vie pour une
seconde tentative d'arrêt gracieux ; les autres échecs ACP ou de bridge
sortent non nul dès le premier signal.

## Compatibilité et déploiement

La capacité privée et les payloads ACP/REST publics ne changent pas. Une
fabrique ChannelFactory asynchrone personnalisée n'est couverte qu'après
qu'elle a résolu un AcpChannel ; la fabrique managée par défaut est couverte
à partir de la réservation de spawn.

L'exploitation de writer en versions mixtes reste non prise en charge. Le
déploiement et le rollback doivent drainer les anciens writers ACP avant que
le remplacement n'accepte des sessions.

## Vérification

La vérification doit distinguer :

1. verrou libéré et arrêt complet du démon propre ;
2. verrou libéré mais un nettoyage ultérieur rend l'arrêt impropre ; et
3. verrou conservé, le successeur reçoit un 409 et une récupération manuelle
   reste nécessaire.

La couverture déterministe requise inclut l'échec de flush, l'erreur de
renommage après effet, l'acquisition par un successeur, le passage de la
fermeture normale à rapide, l'acquisition à chaque limite de coupure, l'échec
de spawn asynchrone `ENOENT`, l'erreur après spawn, la construction partielle
de canal, la sortie de canal pré-résolu avec une réponse initialize en mémoire
tampon, les courses D1/D2 et de sortie brute, la sortie tardive, les deux
signaux, l'arrêt parallèle multi-runtime, l'arrêt pendant l'initialisation de
Config, le nettoyage concurrent de Config, l'initialisation après admission
d'arrêt, l'ACP autonome et les garde-fous de déploiement en versions mixtes.
