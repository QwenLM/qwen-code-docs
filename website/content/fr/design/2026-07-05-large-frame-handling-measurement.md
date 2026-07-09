# Mesure du traitement des grandes trames de pipe

## Résumé

Cette PR est une étape de mesure et de conception pour les grandes trames de pipe ACP de `qwen serve`. Elle ne modifie pas les payloads des pipes, les limites de trames, le comportement de l'EventBus, le comportement du SDK, les champs de protocole publics, les flags CLI, les paramètres de requête HTTP, ni les capacités annoncées.

L'objectif immédiat est de collecter des attributions de faible cardinalité pour les messages de pipe NDJSON de taille excessive, afin que la prochaine conception du sidecar puisse utiliser les distributions réelles de `pipe.message_bytes` au lieu de seuils estimés.

## Limites actuelles

Le pipe enfant ACP n'a actuellement aucune limite d'octets par trame. Les métriques existantes du démon enregistrent `pipe.message_bytes` avec uniquement l'attribut `direction`, ce qui est intentionnellement de faible cardinalité mais ne permet pas d'expliquer quelles familles de payloads provoquent de grandes trames.

Les lecteurs SSE du SDK disposent déjà d'une limite de tampon distincte de 16 MiB pour la diffusion vers le navigateur/flux d'événements. Cette limite ne borne pas la taille des trames du pipe du démon vers l'enfant et n'explique pas les sources des trames du pipe.

La relecture en masse de session a actuellement une limite de 10 000 mises à jour. Elle n'a pas de limite en octets, de sorte qu'un nombre borné de grandes mises à jour peut toujours créer une grande trame de réponse.

## Forme de la mesure

Le nouvel observateur NDJSON interne reçoit `{ direction, bytes, message }` après qu'un message a été lu ou écrit avec succès dans le pipe. Les hooks d'octets existants ne reçoivent toujours que `bytes`, préservant ainsi le chemin de métrique actuel.

Le démon enregistre les compteurs, totaux, maximums, métriques d'histogramme et champs de statut existants du pipe pour chaque trame. L'attribution des grandes trames s'exécute uniquement lorsque `bytes >= 256 * 1024`.

Les logs des grandes trames sont échantillonnés avec une fenêtre par processus démon de 50 enregistrements par 60 secondes. Les comptes d'échantillons supprimés sont attachés au prochain log de grande trame enregistré.

Les champs journalisés sont restreints à une attribution peu sensible : direction, taille en octets, seuil, type de message JSON-RPC, méthode, classe source, nombre de mises à jour, nombre de mises à jour résumées et stratégie lorsque plafonné, type de mise à jour de session, marqueur de mise à jour de session mixte, nom de l'outil, provenance de l'outil, type de sortie brute, maxima textuels en octets superficiels pour le contenu et la sortie brute, octets approximatifs bornés de sortie brute non textuelle plus un marqueur plafonné, et compteurs de suppression de limite de débit. Les payloads, les IDs de session, les IDs client, les chemins de fichiers, les prompts et les sorties brutes des outils ne sont pas journalisés.

L'histogramme reste de faible cardinalité et ne conserve que `direction` ; des champs tels que la méthode, le nom de l'outil, la mise à jour de session et la classe source ne sont pas ajoutés en tant qu'attributs de métrique.

## Classes sources

L'observateur utilise uniquement les classes sources qui peuvent être prouvées à partir de la forme de la trame :

- `session_update_notification` : une notification `session/update` avec `params.update`.
- `load_session_bulk_replay_response` : une réponse JSON-RPC portant `_meta["qwen.session.loadReplay"]`.
- `load_updates_response` : une réponse JSON-RPC portant `result.updates` ainsi que des marqueurs de réponse de chargement de mises à jour.
- `jsonrpc_request` : toute autre requête ou notification JSON-RPC avec une méthode.
- `jsonrpc_response` : toute autre réponse JSON-RPC.
- `unknown` : tout le reste.

La couche de pipe ne peut pas distinguer de manière fiable les trames `session/update` en direct de celles rejouées, cette mesure n'émet donc pas de champ d'attribution `live` ou `replay`.

## Candidats sidecar pour la prochaine phase

La cible probable du sidecar est la sortie volumineuse des outils transportée par `tool_call_update`, en particulier le texte dans `content[]` et `rawOutput`. Une implémentation ultérieure devrait conserver un petit aperçu réseau ou un stub dans la mise à jour tout en plaçant le corps complet dans un sidecar géré par le démon.

Les métadonnées doivent transiter via `_meta` afin que les anciens clients les ignorent et que les nouveaux clients puissent choisir de résoudre le contenu du sidecar. Le contrat du sidecar doit définir le cycle de vie, le contrôle d'accès, le nettoyage, les seuils en octets, le comportement de repli et l'UX client avant l'implémentation.

La relecture en masse et `qwen/session/loadUpdates` nécessitent un traitement séparé car une réponse peut être volumineuse en raison de nombreuses mises à jour moyennes ou de quelques grandes mises à jour. Les champs de mesure incluent `updateCount`, `summarizedUpdateCount`, `summarizedUpdateStrategy`, `maxContentTextBytes`, `maxRawOutputTextBytes`, `maxRawOutputApproxBytes` et `maxRawOutputApproxBytesCapped` pour séparer ces cas sans parcourir des tableaux de mises à jour non bornés ou sans matérialiser de grandes sorties brutes non textuelles. Lorsque les tableaux de mises à jour dépassent le budget de résumé, les champs max sont calculés à partir d'un échantillon déterministe préfixe-plus-suffixe plutôt que d'une analyse complète.

## Non-objectifs

Cette PR n'implémente pas le stockage sidecar, le transfert de fichiers temporaires, les limites de trames, les limites en octets du ring de relecture, l'élagage par compaction, les limites en octets de l'EventBus, ni les limites en octets du tampon de liaison HTTP ACP.

Cette PR n'ajoute pas de paramètre de requête `?maxFrameBytes` ou `?maxQueuedBytes`, de flag CLI, d'option SDK, ni de capacité. Le budget mémoire et transport du démon ne doit pas être augmenté par des clients arbitraires.

Cette PR ne modifie pas les schémas d'événements publics. Tout futur protocole sidecar doit être additif et faire l'objet d'une revue séparée.