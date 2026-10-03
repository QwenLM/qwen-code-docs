# Récupération opérateur pour Workspace hébergé


N'utilisez cette procédure que pour un worker local-process durable Linux sur l'hôte d'origine dont une capture Hosted Shell incomplète a conservé un bail de Workspace. Un redémarrage entre `prepare` et `complete` ne lève pas le fence ; l'opérateur doit tout de même vérifier que tous les writers potentiels sont arrêtés et ne peuvent pas redémarrer, puis soumettre la preuve avec `complete`. La récupération rend le Workspace physique disponible pour de nouvelles Sessions. Elle ne termine pas, ne relance pas et ne certifie pas l'appel Shell d'origine.

La commande de maintenance est fournie sous la forme de `qwen-managed-agent-server-*-operator-recovery.jar`. Exécutez-la sur l'hôte worker d'origine en tant que compte OS de service, en utilisant les paramètres de base de données du service, la clé d'identifiants Runtime et `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`. Définissez `QWEN_MANAGED_AGENT_RUNTIME_DURABLE_LOCAL_PROCESS=true`, `QWEN_MANAGED_AGENT_RUNTIME_PROVISIONER=local-process` et `QWEN_MANAGED_AGENT_RUNTIME_OPERATOR_RECOVERY_ENABLED=true` pour ce processus de maintenance. Gardez privés l'environnement de base de données et les identifiants. Appliquez la migration de base de données du service avant d'exécuter la commande. La commande ne démarre pas d'écouteur HTTP, de planificateur ni de worker.

1. Trouvez le `runtime.runtimeBindingId` et la `runtime.generation` de l'exécution concernée. Si l'enregistrement d'exécution n'est pas disponible, un DBA autorisé peut utiliser une requête en lecture seule sur `qwen_runtime_binding` pour le `tenant_id` et le `workspace_id` concernés afin de lister `binding_id`, `runtime_generation` et `binding_state` ; examinez chaque candidat et n'utilisez que celui dont le bail détenu et la capture Shell correspondent. Exécutez `java -jar qwen-managed-agent-server-*-operator-recovery.jar inspect <bindingId> <generation>`. Notez la `holderKey` retournée, la Session Runtime, l'appel Shell, le `captureStatus` et le `captureReason`. La récupération nécessite un résultat Shell `producer_lost` sauvegardé et un bail de Workspace exact et encore détenu. Un worker legacy non supporté, une identité d'enregistrement manquante ou un holder manquant ne peuvent pas être réparés en créant des enregistrements d'identité de remplacement.
2. Exécutez `java -jar qwen-managed-agent-server-*-operator-recovery.jar prepare <bindingId> <generation> <holderKey> '<raison de l incident>'`. Sauvegardez la `recoveryId` retournée. Un binding actif ou bloqué par une récupération est clôturé comme `OPERATOR_RECOVERY` ; un binding déjà LOST reste LOST et est exclu du scan de récupération en arrière-plan. Aucun bail de Workspace n'est libéré. Répéter avec le même compte OS de service et la même raison est sans danger. Un compte enregistré différent, une raison, une génération ou un holder différent est rejeté. Enregistrez l'opérateur humain séparément dans l'enregistrement d'incident ; `operator_id` identifie le compte OS exécutant la commande.
3. Arrêtez le worker d'origine et inspectez **tous** les writers possibles vers le Workspace, y compris les enfants détachés et les superviseurs externes. Empêchez le worker d'origine et les writers d'être redémarrés. Confirmez qu'ils se sont arrêtés. La mort d'un groupe de processus, la fin de flux d'un pipe, le temps écoulé et la perte du PID parent ne suffisent pas à eux seuls. Si cela ne peut pas être établi, arrêtez-vous ici et laissez le Workspace clôturé.
4. Créez un fichier JSON UTF-8 régulier (non symlink) d'au plus 8 Kio directement dans le répertoire privé d'état Runtime, en mode `0600`, avec exactement ces champs (remplacez les valeurs d'exemple) :

   ```json
   {
     "version": 1,
     "recoveryId": "<recoveryId>",
     "verifiedAt": "2026-09-29T03:00:00Z",
     "method": "host inspection",
     "actions": "Stopped worker and detached writers; disabled their external restart source; verified no writer remains",
     "restartPrevention": true
   }
   ```

   `verifiedAt` doit être une heure de vérification UTC réelle, pas antérieure à `prepare` et pas plus de cinq minutes en avance sur l'horloge de l'hôte de maintenance. Enregistrez les étapes concrètes et la source de prévention de redémarrage ; n'écrivez jamais l'instruction avant d'avoir terminé ces vérifications. Gardez le fichier et l'enregistrement d'incident privés.

5. Exécutez `java -jar qwen-managed-agent-server-*-operator-recovery.jar complete <recoveryId> <absoluteEvidenceFile>`. La commande vérifie l'identité de worker enregistrée exacte et, sur le même démarrage, son absence ; après un redémarrage de l'hôte d'origine, elle vérifie l'identité de démarrage modifiée. Elle transforme ensuite l'enregistrement en pierre tombale, persiste l'instruction immuable et ne revendique que le holder d'origine. Elle peut être retentée avec le **même fichier** après un crash ou une panne temporaire de base de données. Une instruction modifiée est rejetée. La sortie en cas de succès est `completed`.

Après la complétion, démarrez une **nouvelle** Session et vérifiez qu'elle peut utiliser le Workspace. Examinez le tour d'origine séparément : sa sortie partielle et ses effets incertains restent incertains, et aucun appel Shell n'est rejoué. Ne videz pas manuellement les tables SQL ni les fichiers d'enregistrement pour contourner un refus. Si l'enregistrement d'origine est absent ou corrompu, ou si le worker provient d'un mode éphémère plus ancien, cette procédure n'est pas supportée ; escaladez avec la preuve préservée plutôt que de la fabriquer.

Le logiciel peut vérifier l'identité du worker enregistré et le holder SQL exact, mais il ne peut pas prouver que des descendants échappés arbitraires se sont arrêtés. L'instruction de l'opérateur est la limite de confiance pour ce fait.
