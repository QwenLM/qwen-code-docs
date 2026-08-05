# Bail de writer pour la maintenance des sessions du démon

## Problème

Le démon peut supprimer, archiver ou désarchiver une transcription persistée
après que son propriétaire ACP en cours de processus a été fermé. Un autre
processus du démon peut toujours posséder la même transcription, donc le
coordinateur d'archives en cours de processus seul n'empêche pas le démon
d'entrer en conflit avec un writer externe.

Le chemin de transcription et le chemin du verrou de writer doivent aussi
être résolus depuis le même runtime de workspace. Un repli sur le runtime
primaire du démon peut modifier un workspace tout en vérifiant un verrou dans
un autre.

## Périmètre

Ce changement couvre la maintenance possédée par le démon :

- Les requêtes REST et ACP de suppression, d'archivage et de désarchivage
- Le nettoyage des déconnexions et des orphelins
- Le rollback des tâches planifiées et le nettoyage des keepalive
- L'arrêt du démon pendant qu'une maintenance est déjà en cours

Il n'ajoute pas d'expiration de bail, de heartbeat, de récupération basée sur
le nom d'hôte, de vol automatique, de déverrouillage forcé ni de migration du
schéma de verrou. Les writers qui ne participent pas au protocole de bail
nécessitent toujours une barrière de writer unique au niveau de la
plateforme.

## Liaison du stockage au runtime

Chaque `WorkspaceRuntime` résout un répertoire de base absolu de runtime de
sessions à la création. La résolution conserve la priorité existante :

1. `QWEN_RUNTIME_DIR`
2. `advanced.runtimeOutputDir`, résolu relativement au workspace
3. Le répertoire runtime normal de Qwen

Le répertoire résolu est stocké sur le runtime et injecté en tant que
`QWEN_RUNTIME_DIR` dans chaque enfant ACP géré. Le rechargement de
l'environnement peut mettre à jour d'autres valeurs mais préserve cette
valeur figée, car changer `runtimeOutputDir` nécessite un redémarrage du
runtime.

Les opérations parentes du démon qui listent, lisent, exportent, organisent
ou maintiennent des sessions s'exécutent dans le contexte de stockage du
runtime sélectionné. Les échecs de résolution de runtime ne retombent pas sur
le runtime primaire.

## API de bail

`SessionService.acquireSessionWriterLease()` dérive à la fois la racine du
verrou de writer et le chemin de transcription actif depuis l'instance
`Storage` fixe du service. Les appelants ne fournissent que l'ID de session,
le type de processus, la version et la politique de récupération. Les IDs de
session invalides sont rejetés avant que le répertoire de verrou ne soit
touché.

La maintenance du démon utilise toujours `processKind: 'daemon'` et
`reclaimPolicy: 'never'`. Le schéma de verrou existant, la clé,
l'enregistrement de propriétaire et le protocole d'acquisition/libération
restent inchangés.

## Protocole de maintenance

Chaque session est traitée indépendamment :

1. Entrer dans le coordinateur d'archives exclusif par session du démon.
2. Fermer le propriétaire local. L'archivage exige une fermeture de l'agent ;
   la suppression utilise la fermeture rapide normale. L'absence de
   propriétaire local est autorisée.
3. Classifier l'état persisté et préserver les résultats existants
   non-trouvé et idempotents sans créer de verrou.
4. Acquérir le bail de writer du démon.
5. Reclassifier tout en détenant le bail.
6. Vérifier la propriété et l'empreinte de la transcription, puis effectuer
   une seule mutation.
7. Libérer le bail avec vérification du token de propriétaire.

Les requêtes par lot peuvent traiter les sessions indépendantes en parallèle,
mais un worker détient au plus un bail inter-processus et n'attend jamais
tout en détenant plusieurs baux.

Une mutation échouée reste l'erreur signalée lorsque la libération réussit.
Un échec de libération ou de propriété est l'erreur sûre vis-à-vis de
l'extérieur même si la mutation a également échoué. Les journaux enregistrent
le workspace, la session, l'action, le type d'erreur et si la mutation de la
transcription a atteint le disque ; ils n'incluent jamais les tokens de
propriétaire ni les chemins de verrou. La réconciliation des tâches
planifiées suit la mutation réelle de la transcription, et non le succès
ultérieur de la libération du bail.

Le nettoyage des orphelins ferme d'abord le propriétaire local et respecte
`requireZeroAttaches`. Un propriétaire nouvellement attaché empêche donc la
suppression. Le nettoyage des créations tardives attend la fermeture avant
d'acquérir le bail et de supprimer la transcription.

## Arrêt

`SessionArchiveCoordinator.sealMaintenanceAndWait()` rejette de manière
synchrone toute nouvelle maintenance exclusive et attend les opérations
exclusives déjà admises. Les lectures de transcription partagées ne sont pas
incluses, de sorte qu'une longue exportation ne consomme pas le budget
d'arrêt. REST renvoie `503 daemon_draining` ; ACP renvoie une erreur de
serveur JSON-RPC avec `data.errorKind = daemon_draining`.

L'arrêt du démon scelle la maintenance avant le démantèlement des
enfants/processus et ne se termine qu'après que les baux de maintenance
admis ont été libérés.

## Compatibilité et déploiement

Les formes des réponses par lot et l'idempotence existante
d'archivage/suppression/désarchivage restent inchangées. Les conflits locaux
`session_archiving` de pré-vérification (levés par `assertNotTransitioning`
avant l'admission) apparaissent toujours comme un `409` au niveau de la
requête. Les conflits levés dans la porte d'admission sont signalés par
session dans le corps de réponse `200` (`errors[]`), de manière identique
pour l'archivage, le désarchivage et la suppression. Les writers à versions
mixtes ne sont pas sûrs, donc le déploiement et le rollback doivent drainer
l'ancien démon et les processus ACP gérés avant de démarrer la nouvelle
version.

## Vérification

Les tests utilisent de vraies racines de runtime temporaires pour la
contention de writer et l'isolation des racines, couvrent les changements
d'état entre les classifications initiale et verrouillée, et vérifient la
fermeture, la mutation, la libération, la réconciliation des tâches
planifiées et l'ordre d'arrêt. Les tests unitaires couvrent aussi les IDs
invalides, les IDs en double, les conflits actif/archivé, les échecs de
libération de bail, le réattachement d'orphelins et la rédaction des
journaux. Les tests des paquets concernés, le build et le typecheck sont
requis avant le merge.
