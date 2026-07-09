# Moniteur de pression mémoire

## Problème

Les sessions Qwen Code de longue durée peuvent accumuler de la mémoire via des résultats d'outils volumineux, des lectures de fichiers répétées, l'historique des discussions et des allocations natives/externes. Avant cette modification, le package principal disposait de diagnostics et d'un nettoyage lors de la réinitialisation de session, mais d'aucune réponse à l'exécution lorsque la pression mémoire augmentait pendant l'exécution normale des outils.

La lacune spécifique au cache la plus critique concerne `FileReadCache` : il possède déjà une taille FIFO bornée, mais il n'avait pas de mécanisme d'éviction basé sur le temps. Cela signifie qu'une session peut conserver des métadonnées de lecture de fichier inactives jusqu'à ce que la limite stricte d'entrées soit atteinte, même lorsque le processus est sous pression mémoire.

## Objectifs

- Ajouter une vérification de la pression mémoire à faible surcoût après l'exécution d'un outil.
- Privilégier un nettoyage ciblé avant un nettoyage destructif.
- Respecter les limites de mémoire des conteneurs lorsque les fichiers de limite de mémoire cgroup v2 ou cgroup v1 sont disponibles.
- Réagir à la pression sur le heap V8 avant un OOM du heap JavaScript sur les hôtes à haute capacité mémoire.
- Garder les instances `Config` des sous-agents ou à portée isolées du nettoyage de la session parente.
- Rendre le comportement configurable via des variables d'environnement sans ajouter de nouvelle interface de paramètres destinée à l'utilisateur.

## Non-objectifs

- Ne pas ajouter de boucle de polling en arrière-plan.
- Ne pas faire du GC explicite le comportement par défaut ; il ne s'exécute que lorsqu'il est activé et que Node a été démarré avec `--expose-gc`.
- Ne pas modifier la sémantique d'application des lectures antérieures. L'éviction du cache peut supprimer d'anciennes métadonnées, mais elle ne doit pas affaiblir les vérifications de fichiers obsolètes pour les entrées conservées.

## Conception

`Config.initialize()` crée un `MemoryPressureMonitor` par `Config` initialisée. `getMemoryPressureMonitor()` reproduit le modèle d'isolation `Object.create` existant de `getFileReadCache()` : lorsqu'une configuration enfant est créée par délégation de prototype, le getter installe à la demande son propre moniteur lié à cette configuration enfant.

`CoreToolScheduler.executeSingleToolCall()` appelle `scheduleCheck()` dans son bloc `finally` après avoir terminé le span de l'outil. `scheduleCheck()` regroupe les appels multiples dans le même tour de boucle d'événements avec `queueMicrotask`, afin que les lots d'outils de type lecture simultanés n'exécutent pas une vérification de mémoire par résultat d'outil.

Le moniteur utilise le plus fort des deux signaux de pression :

- RSS divisé par une limite de mémoire de processus effective. Préférer cgroup v2 `/sys/fs/cgroup/memory.max` lorsqu'il s'agit d'une valeur positive finie ; revenir à cgroup v1 `/sys/fs/cgroup/memory/memory.limit_in_bytes`, puis à `os.totalmem()` dans le cas contraire. Les valeurs sentinelles énormes "unlimited" de cgroup v1 sont ignorées.
- `heapUsed` de V8 divisé par `getHeapStatistics().heap_size_limit`.

L'utilisation des deux signaux est importante car les conteneurs échouent généralement par dépassement de la limite RSS/cgroup, tandis que les machines locales à haute capacité mémoire peuvent atteindre un OOM du heap V8 bien avant que le RSS ne représente une grande fraction de la mémoire totale du système.

Les seuils par défaut sont intentionnellement suffisamment conservateurs pour réagir avant que le OOM killer de l'OS ou du conteneur n'agisse :

- `softPressureRatio = 0.50`
- `hardPressureRatio = 0.65`
- `criticalRatio = 0.80`
- `cleanupCooldownMs = 5000`
- `enableExplicitGC = false`

Variables d'environnement de substitution :

- `QWEN_MEMORY_PRESSURE_SOFT`
- `QWEN_MEMORY_PRESSURE_HARD`
- `QWEN_MEMORY_PRESSURE_CRITICAL`
- `QWEN_MEMORY_ENABLE_GC=1`

Les ratios invalides reviennent aux valeurs par défaut. Les ratios valides doivent être ordonnés comme `soft < hard < critical`, avec une borne inférieure soft de `0.3` et une borne supérieure critical de `0.98`. Les variables d'environnement de ratio sont analysées strictement avec `Number()`, de sorte que des valeurs comme `0.8extra` sont rejetées au lieu d'être partiellement acceptées. Une configuration invalide de la pression mémoire via variables d'environnement écrit un avertissement visible sur stderr et dans le journal de débogage avant de revenir aux valeurs par défaut.

## Politique de nettoyage

Les niveaux de pression correspondent à un nettoyage de plus en plus agressif :

- `soft` : évincer les entrées obsolètes de `FileReadCache` qui n'ont pas été consultées depuis 60 minutes.
- `hard` : évincer les entrées du cache qui n'ont pas été consultées depuis 30 minutes.
- `critical` : vider le cache de lecture de fichiers et déclencher optionnellement `global.gc()`.

Le moniteur ne force intentionnellement pas la compaction des discussions. La compaction peut appeler le backend du modèle et réécrire l'état actif de la discussion, elle ne doit donc être déclenchée que depuis un site d'appel capable de se coordonner en toute sécurité avec la boucle de conversation.

Le nettoyage est de type "fire-and-forget" depuis le planificateur, mais le moniteur protège les étapes de nettoyage avec `cleanupInProgress` et un horodatage de cooldown. Un nettoyage à plus haute pression peut contourner le cooldown et se mettre en file d'attente derrière un nettoyage à plus basse pression en cours, afin qu'une vérification `critical` ne soit pas perdue pendant qu'un nettoyage `soft` se termine. Après un nettoyage réussi, il enregistre un delta de RSS sur `setImmediate()`, mais le mouvement du RSS est purement diagnostique : V8 et libc peuvent conserver des pages libérées même lorsque les objets JavaScript sont devenus éligibles au ramasse-miettes. Les échecs consécutifs comptabilisent les exceptions des étapes de nettoyage, et non un RSS inchangé, et le compteur est réinitialisé lors d'une nouvelle session. Si trois tentatives de nettoyage réussies d'affilée libèrent moins de 1 % de RSS, le moniteur émet `memory-cleanup-ineffective` comme signal diagnostique sans pour autant considérer l'étape de nettoyage elle-même comme échouée.

## Couverture des tests

L'implémentation est couverte par :

- les tests de validation des seuils ;
- les tests d'analyse de la configuration d'environnement, de repli, d'avertissement visible et de GC explicite ;
- les tests de classification de la pression utilisant un `process.memoryUsage()` mocké ;
- le comportement de cgroup v2 `memory.max` et de cgroup v1 `memory.limit_in_bytes` ;
- le comportement de la limite du heap V8 ;
- le regroupement de `scheduleCheck()` ;
- l'intégration du planificateur qui invoque `scheduleCheck()` après l'exécution de l'outil ;
- les actions de nettoyage soft et critical ;
- la comptabilisation des échecs de nettoyage pour les étapes de nettoyage ayant levé des exceptions ;
- l'isolation des exceptions de l'écouteur de nettoyage et les diagnostics de nettoyage inefficace ;
- l'isolation du moniteur de `Config` enfant via `Object.create` ;
- le comportement de `FileReadCache.evictNotAccessedSince()`.

## Risques et compromis

- Le RSS peut rester stable après le nettoyage car V8 ou libc peuvent conserver la mémoire libérée. Les deltas de RSS sont journalisés, mais un RSS inchangé ne compte pas comme un échec de nettoyage.
- L'éviction du cache de lecture de fichiers basée sur le temps peut réduire les accès rapides pour les anciens fichiers, mais elle préserve les entrées récemment actives et ne s'exécute qu'en cas de pression mémoire.