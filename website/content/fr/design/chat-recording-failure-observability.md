# Observabilité des échecs d'enregistrement de chat

## Contexte

`ChatRecordingService` cesse définitivement d'accepter les écritures après son premier échec d'écriture JSONL asynchrone. La transcription reste un préfixe valide, mais sans signal séparé, les utilisateurs et les clients distants peuvent supposer à tort que les messages ultérieurs sont toujours enregistrés.

## Cycle de vie principal

`Config.onChatRecordingFailure()` est la frontière d'abonnement locale au processus. Chaque enregistreur créé par un `Config` transmet son premier échec d'écriture asynchrone à un snapshot des listeners enregistrés. L'événement porte l'ID de session de l'enregistrement en échec et une `Error` normalisée ; les échecs de listener sont isolés de la promise de l'écrivain. Les abonnements survivent au remplacement de l'enregistreur et sont retirés indépendamment par leurs disposers. `Config.shutdown()` maintient les listeners en vie pendant la finalisation et le flush des enregistreurs, puis les efface.

Les échecs synchrones de création du fichier de conversation n'émettent pas l'événement, car l'enregistreur n'est pas entré dans son état d'échec permanent et un appel ultérieur peut retenter. Un enregistreur en échec émet une fois ; les descendants ignorés, les ajouts ultérieurs et les flushs répétés n'émettent plus.

## Surfaces CLI locales

Le TUI et la sortie texte affichent un avertissement générique exploitable, sans chemins de système de fichiers, valeurs errno ni erreur sous-jacente. JSON, stream-json et la double sortie émettent un message `system/session_recording_degraded` dont l'ID de session de premier niveau et celui du payload proviennent tous deux de l'événement d'échec plutôt que de la session `Config` en cours.

La sortie structurée one-shot finalise l'enregistreur et attend jusqu'à deux secondes son flush avant d'émettre le résultat terminal. Les sessions stream-json de longue durée s'abonnent une fois, effectuent un flush entre les tours sans finaliser, et ne finalisent qu'à l'arrêt de la session. Un timeout préserve la réactivité et n'annule pas l'écriture sous-jacente.

## Protocole du démon et état live durable

L'enfant ACP envoie `qwen/notify/session/recording-degraded` avec la version 1 du protocole, l'ID de session affecté et `reason: "write_failed"`. Le bridge valide le payload, publie `session_recording_degraded` et marque l'entrée de session live comme dégradée. Les notifications arrivant avant l'enregistrement de l'entrée utilisent le buffer borné d'événements précoces existant ; le drain du buffer met à jour à la fois le ring de relecture et l'état de l'entrée.

`session_snapshot.recordingDegraded` préserve l'état après que l'événement live a quitté le ring de relecture. C'est un état uniquement en mémoire du démon : un redémarrage du démon crée un nouvel enregistreur et démarre en bonne santé. L'événement est additif sous `EVENT_SCHEMA_VERSION = 1` ; aucun changement de capacité n'est requis.

## SDK et WebUI

Le SDK valide l'événement live et le champ de snapshot optionnel. Le reducer de session traite l'événement live comme une mise à jour sticky sûre pour la resynchronisation. Un champ de snapshot présent fait autorité, tandis qu'un champ absent préserve l'état pour la compatibilité avec les démons plus anciens.

Le normaliseur de l'UI mappe chacune des deux représentations dégradées vers la même erreur d'enregistrement récupérable. Le WebUI utilise l'ID de notification explicite `daemon.session_recording_degraded:<sessionId>` afin qu'un événement rejoué suivi d'un snapshot soit idempotent. Ignorer une notification retire l'instance courante ; un snapshot ultérieur peut faire réapparaître le risque toujours actif.

## Frontière de fermeture

Les chemins de fermeture stricts qui exigent un flush réussi maintiennent l'entrée du démon en vie lorsque le flush échoue, afin que l'événement reste livrable. L'ordre de fermeture best-effort existant est inchangé : si son EventBus est déjà fermé lorsqu'un échec tardif est découvert, seul le journal de debug conserve cet échec.

## Non-objectifs

Cette conception ne retente pas les écritures, ne récupère pas un enregistreur dégradé, ne modifie ni le contenu JSONL ni les liens parents, n'ajoute pas de fsync, n'expose pas les erreurs brutes du système de fichiers et ne coordonne pas les écrivains concurrents entre processus.
