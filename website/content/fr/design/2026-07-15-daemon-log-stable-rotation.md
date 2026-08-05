# Journaux du démon stables et bornés

- **Statut :** Implémenté
- **Date :** 2026-07-15
- **Périmètre :** journalisation fichier de `qwen serve`, propriété du cycle de vie, admission des journaux d'accès, statut du démon et miroir de statut du SDK TypeScript

## Décision

Chaque espace de nommage de journal runtime a un seul chemin actif stable :

```text
${runtimeBaseDir}/debug/daemon/daemon.log
```

Les redémarrages normaux ajoutent à ce chemin. La politique fixe est :

| Limite                                |        Valeur |
| ------------------------------------- | -----------: |
| Fichier actif                         |       10 MiB |
| Archives par famille                  |            4 |
| Enregistrement de fichier rendu       |      256 KiB |
| Payload de fichier accepté mais non réglé |        4 MiB |
| Bail stable échu/mise à jour          |  60 s / 10 s |
| Budget d'acquisition stable/maintenance | 1 s / 250 ms |
| Budget de fermeture du logger public  |          2 s |

Ces valeurs ne sont volontairement ni des flags CLI, ni des variables d'environnement, ni des paramètres. Une famille stable saine occupe au plus environ 50 MiB. Conserver la famille fallback inactive la plus récente amène l'espace de nommage convergé à environ 100 MiB. Les propriétaires fallback actifs ou pas encore échus ne sont jamais supprimés ; l'usage temporaire peut donc croître avec le nombre de démons potentiellement actifs.

Chaque démarrage génère un `runId` aléatoire de 128 bits. Chaque enregistrement de fichier commence par un contexte immuable de `runId` et de PID du démon. Le contexte de l'appelant ne peut pas remplacer ces valeurs. Stderr conserve le formatage et l'ordre des champs existants.

## Espace de nommage et propriété

Le répertoire de journal configuré est l'espace de nommage de propriété et de rétention. Le workspace, le port d'écoute et le PID ne sont pas des identités de stockage : un démon peut héberger plusieurs workspaces, le port zéro est dynamique, les ports peuvent avancer en cas de conflit, et les démons embarqués peuvent partager un PID.

La famille stable est détenue par un bail `proper-lockfile` à vie. Un prétendant qui ne peut pas l'acquérir écrit dans :

```text
debug/daemon/runs/run-<32-hex-runId>/daemon.log
```

Il détient le `.owner.lock` de cette famille pendant toute sa durée de vie et ne promeut jamais dans la famille stable pendant l'exécution. La bannière de démarrage et le statut complet du démon font autorité pour le chemin choisi. `runs/recent-fallback` n'est qu'un indice de découverte validé.

L'allocation et le nettoyage des fallbacks sont sérialisés par `runs/.maintenance.lock`. Le nettoyage conserve chaque famille propriétaire occupée et au plus une famille inactive. Il préfère un localisateur valide, puis le mtime le plus récent du journal actif, puis le nom de base comme départage déterministe. Une erreur de nettoyage hors lock ou une suppression échouée rejette l'allocation, afin qu'un espace de nommage endommagé n'accumule pas un nouveau répertoire à chaque démarrage.

Une fermeture propre du fallback acquiert la propriété de maintenance, libère son bail de propriétaire, conserve la famille courante, supprime les autres familles inactives et répare le localisateur. Si la propriété de maintenance est indisponible, la fermeture libère uniquement le bail de propriétaire et laisse la réparation à un démarrage ultérieur.

## Disposition du système de fichiers

```text
debug/daemon/
├── daemon.log
├── latest -> daemon.log
├── .stable-writer.lock/
├── archive/
│   └── daemon-000000000001-20260715T031415926Z-a1b2c3d4.log
└── runs/
    ├── .maintenance.lock/
    ├── recent-fallback
    └── run-6a45c211000000000000000000000000/
        ├── .owner.lock/
        ├── daemon.log
        └── archive/
```

Seuls les fichiers d'archive réguliers correspondant strictement participent à la rétention. Les fichiers legacy `serve-<pid>.log` et `serve-<pid>-<workspaceHash>.log` ne sont ni migrés ni supprimés.

Les nouveaux répertoires utilisent le mode `0700` ; les nouveaux journaux actifs et les fichiers temporaires de localisateur utilisent `0600`. Les permissions des objets existants ne sont pas réécrites. `latest` n'est mis à jour que par un propriétaire stable réussi et reste en best-effort lorsque les liens symboliques sont indisponibles.

## Enregistrements de fichier et file

Les enregistrements de fichier sont tronqués sur une frontière UTF-8 valide. Le dernier enregistrement, incluant un marqueur de nombre d'octets d'origine et une nouvelle ligne, fait au plus 256 KiB. Sa copie sur stderr n'est pas tronquée.

Une file de Promises préserve l'ordre des mutations de fichier. Les octets d'enregistrement acceptés mais non réglés sont comptabilisés de manière synchrone. Un enregistrement qui ferait dépasser la file de plus de 4 MiB perd uniquement sa copie fichier ; le logger incrémente `droppedRecords` et `droppedBytes` et avertit une fois pour cet épisode de débordement.

Après le retour de la capacité, l'enregistrement de l'appelant suivant est précédé d'un avertissement fichier seul nommé `daemon file log records dropped`. Il rapporte les totaux non rapportés d'enregistrements et d'octets et n'y contribue pas récursivement. La fermeture effectue une dernière tentative après avoir vidé la file.

Chaque tâche de la file capture son propre échec et libère sa comptabilisation d'octets en attente dans un `finally` ; la queue partagée ne reste jamais rejetée. Si un ajout actif est rejeté, son résultat est inconnu : le logger enregistre `write_failed`, arrête toute mutation fichier ultérieure pour cette exécution, et ne déclare pas l'enregistrement échoué comme une perte exacte. Les enregistrements ultérieurs volontairement sautés sont comptés.

Une compromission de bail arrête de même immédiatement les nouvelles mutations fichier. Une seule opération système de fichiers déjà démarrée peut se terminer, mais aucun ajout, rotation ou suppression ultérieur ne démarre à travers cette famille.

## Transaction de rotation

Avant qu'un enregistrement ne fasse dépasser 10 MiB au fichier actif, le logger :

1. vérifie que `archive/` est un répertoire réel, sans lien symbolique ;
2. supprime les archives générées les plus anciennes jusqu'à n'en conserver que trois au plus ;
3. choisit un nom inexistant contenant une génération à 12 chiffres, un horodatage UTC et un suffixe aléatoire ;
4. renomme atomiquement le chemin actif vers ce nom d'archive ;
5. ajoute l'enregistrement déclencheur dans un nouveau `daemon.log` avec le mode `0600` ; et
6. valide l'état de taille et de génération en mémoire.

Ainsi, une famille produite par cette implémentation a au plus un fichier actif et quatre archives. Si l'ajout au nouveau fichier actif échoue, le fichier actif précédent reste complet dans l'archive la plus récente.

Une validation d'archive, un élagage, un nommage ou un échec de renommage abandonne l'enregistrement plutôt que de laisser le fichier actif dépasser 10 MiB. La rotation est retentée au plus une fois par 60 secondes, tandis que des enregistrements plus petits qui tiennent encore peuvent continuer. Il n'y a pas de protocole spécial de suppression-et-réessai ENOSPC/EDQUOT ni de rollback par troncature d'un ajout rejeté, car aucun des deux ne peut prouver l'état résultant du fichier.

L'initialisation lit la taille réelle du fichier actif. Si son dernier octet n'est pas une nouvelle ligne et que l'enregistrement de démarrage ne le fait pas tourner d'abord, le logger insère une nouvelle ligne et marque l'enregistrement de démarrage avec `previousTailIncomplete=true`. Si la sonde de démarrage stable ne peut pas écrire en sécurité, elle libère le bail stable et tente une famille fallback. Une sonde fallback échouée aboutit à une journalisation dégradée sur stderr seul.

## État du logger et cycle de vie

```ts
type DaemonLogMode = 'stable' | 'fallback' | 'stderr-only';
type DaemonLogHealth = 'ok' | 'degraded';
type DaemonLogIssue =
  | 'init_failed'
  | 'rotation_failed'
  | 'retention_failed'
  | 'queue_overflow'
  | 'write_failed'
  | 'lease_compromised';
```

`getStatus()` renvoie l'identité de l'exécution, le mode, la santé, les problèmes ordonnés et les compteurs de perte. `QWEN_DAEMON_LOG_FILE=0|false|off|no` renvoie un logger stderr-only sain sans accéder au système de fichiers : `info`, `warn` et `error` écrivent toujours sur stderr, tandis que `raw` reste fichier seul et ne fait donc rien.

`close()` est idempotent et ne rejette pas. Il arrête de manière synchrone d'accepter les copies fichier, tandis que les appels structurés sur stderr restent utilisables. Son finaliseur en arrière-plan vide la file, tente le résumé final des pertes, effectue le nettoyage des fallbacks et libère le bail à vie. La Promise publique attend au plus deux secondes ; un timeout ne libère pas le bail en avance, et le finaliseur reste actif jusqu'à ce que les I/O démarrés se terminent. `flush()` conserve sa sémantique non bornée de snapshot de file. Les chemins forcés des signaux et les échecs retentables de fermeture de ressources lui imposent une course contre 250 ms.

La propriété du logger passe par :

```text
startup -> published handle -> terminal close
       \-> startup signal -> terminal close
```

Une fermeture interne avant la publication du handle draine les ressources du démon sans attendre la file du logger, puis laisse le logger au propriétaire extérieur de l'erreur de démarrage. Ce propriétaire enregistre `daemon startup failed` et le ferme. Une fermeture terminale publiée ou détenue par un signal scelle la journalisation des accès, enregistre `daemon stopped` et ferme le logger même lorsque l'arrêt des ressources renvoie une erreur non retentable ; l'erreur de ressource d'origine reste l'erreur renvoyée. Les écritures diagnostiques terminales sont en best-effort afin qu'un stderr indisponible ne puisse pas remplacer l'échec d'origine ni sauter le nettoyage du logger. Un échec retentable de worker de canal/bail de service garde le logger ouvert, utilise le flush borné ci-dessus et n'enregistre pas `daemon stopped`.

## Admission des journaux d'accès

Chaque application Express du runtime possède un token bucket à espace constant avec un burst de 60 et un remplissage de 2 enregistrements/seconde, mesuré avec une horloge monotone. Un recul d'horloge ne fait jamais reculer la ligne de base du remplissage. Les exclusions pour health, heartbeat et succès SSE sont inchangées.

La route, l'ID de session et la première occurrence brute de `x-qwen-client-id` sont plafonnés à 2 KiB, 256 octets et 256 octets sur des frontières UTF-8. Les valeurs tronquées portent un champ de contexte du nombre d'octets d'origine. Utiliser le premier en-tête brut évite que des en-têtes dupliqués fusionnés ne deviennent une nouvelle source de cardinalité.

Lorsqu'aucun token n'est disponible, seuls cinq compteurs fixes sont conservés : 2xx, 3xx, 4xx, 5xx et autre. Lors de la récupération, un résumé WARN `access logs suppressed` consomme le token suivant avant tout enregistrement individuel. Si c'était le seul token, la requête courante rejoint le résumé suivant. L'arrêt scelle le contrôleur après le drain normal du listener ou l'échéance secondaire, émet un résumé final, ignore les callbacks d'achèvement tardifs, puis enregistre `daemon stopped`.

La limitation de débit n'affecte que les diagnostics ; elle ne modifie jamais le résultat HTTP. Les enregistrements individuels supprimés n'atteignent ni stderr ni le fichier, tandis que les résumés atteignent les deux.

## Statut du démon et SDK

Chaque réponse de statut prend un snapshot du logger. Les réponses de résumé et complètes peuvent contenir :

- `daemon.runId`
- `daemon.logMode`
- `daemon.logHealth`

Les réponses complètes peuvent en plus contenir `daemon.logPath`, `daemon.logIssues`, `daemon.logDroppedRecords` et `daemon.logDroppedBytes`. Une journalisation dégradée ajoute un avertissement de premier niveau `daemon_log_degraded` sans chemin au rollup existant. Le SDK TypeScript reflète les champs optionnels et les unions fermées. Aucun tag de capacité ni mise à niveau de client n'est requis.

L'opt-out rapporte `stderr-only/ok` ; la contention stable ordinaire rapporte `fallback/ok` ; un échec d'initialisation du système de fichiers rapporte une journalisation dégradée avec `init_failed`.

## Frontières opérationnelles et de compatibilité

- Utiliser des répertoires runtime séparés pour des espaces de nommage de rétention ou d'audit indépendants.
- Sur macOS/Linux, utiliser `tail -F daemon.log` ; sur toutes les plateformes, les visionneurs doivent rouvrir le chemin après rotation.
- Ne pas configurer un logrotate externe pour modifier `daemon.log`. Le copier ou l'expédier est sûr ; le renommer, le tronquer ou le supprimer casse le modèle de taille en mémoire.
- Il n'y a pas d'expiration par âge, de compression, de durabilité fsync, ni de borne absolue pendant les tempêtes de démons concurrents ou de redémarrages après crash dans la fenêtre d'échéance.
- La falsification par le même utilisateur, la prise de contrôle erronée sur échéance, les appels système qui ne reviennent jamais, les pertes de puissance soudaines et les lecteurs Windows qui empêchent le renommage sont gérés par dégradation sûre, et non par des protocoles spécifiques à la plateforme de no-follow, fsync ou admission de processus.
- Le downgrade reste possible ; les anciennes versions reprennent simplement la création de fichiers nommés par PID.

## Stratégie de vérification

La couverture unitaire inclut le formatage, le contexte fichier immuable, la réutilisation stable, la troncature UTF-8, les bornes de rotation, les queues incomplètes, les résumés de débordement de file, les ajouts empoisonnés, les baux compromis actifs et après libération, la fermeture bornée et les flushes retentés, la concurrence stable/fallback, la rétention des fallbacks, le refus de nettoyage, les échecs de diagnostic du cycle de vie, l'admission des tokens d'accès, le scellement à l'arrêt, les snapshots de statut, les espaces de nommage runtime de test isolés et la surface de types du SDK.

La vérification au niveau processus utilise un bundle construit et un répertoire runtime isolé pour la réutilisation au redémarrage, la rotation à seuil réel, la concurrence stable/fallback, la libération de bail par signal, le comportement de la fenêtre d'échéance SIGKILL, l'agrégation des accès, la préservation des fichiers legacy et l'opt-out sans accès au système de fichiers. La matrice de plateformes CI doit exercer les chemins actifs directs sur macOS, Linux et Windows ; Windows vérifie en plus la dégradation sûre lorsqu'un lecteur empêche le renommage actif/archive.
