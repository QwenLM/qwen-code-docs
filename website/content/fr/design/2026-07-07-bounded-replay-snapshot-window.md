# Fenêtre de relecture de snapshots bornée

## Problème

Les sessions live du démon conservent actuellement l'historique de relecture en mémoire afin que `POST /session/:id/load` puisse injecter la relecture pour les clients qui s'attachent alors que la session existe déjà. Cette rétention de relecture doit être bornée indépendamment de l'anneau SSE : la restauration en mode response peut semer en masse de grandes mises à jour historiques, et les tours live terminés peuvent s'accumuler indéfiniment dans les sessions de longue durée.

L'historique des sessions sur disque reste la source de référence pour la transcription complète. PR-1 borne uniquement la fenêtre de relecture live en mémoire du démon ; il n'ajoute pas d'endpoint de transcription complète.

## Objectifs

- Limiter les événements de relecture retenus par octets sérialisés et par session live, avec une valeur par défaut de 4 MiB et un rejet des configurations invalides au démarrage.
- Appliquer la limite à la fois aux segments de relecture des tours live terminés et à la relecture historique restaurée en mode response ou en mode stream.
- Préserver la forme wire existante du snapshot : `compactedReplay`, `liveJournal` et `lastEventId`.
- Conserver au moins un événement de relecture réel ou un segment de tour live terminé, même lorsque cette unité unique dépasse la limite.
- Signaler la troncature avec un marqueur `history_truncated` sans id au début de `compactedReplay`.
- Traiter `history_truncated` comme un simple statut. Il ne doit pas déclencher `state_resync_required`, des boucles de rechargement, ni une repersistance dans la fenêtre de relecture.

## Non-objectifs

- ~~Pas de limite sur un tour live unique en cours dans PR-1 ; `liveJournal` continue de contenir le tour actif jusqu'à une frontière.~~ Ajouté par DAEMON-009 (PR #7622) : `liveJournal` est désormais limité par `maxJournalEvents` (10 000 par défaut) et `maxJournalBytes` (8 MiB par défaut), configurables via `--max-journal-events` / `--max-journal-bytes`.
- Pas de limite sur le nombre de tours. Les comptes de tours ne sont diagnostiques que lorsque le moteur peut compter exactement les segments de tours terminés abandonnés.
- Pas de tag de fonctionnalité `/capabilities` pour cet événement additif. La limite résolue est exposée dans le statut du démon.
- Pas d'endpoint de transcription complète. PR-2 doit concevoir des lectures de transcription paginées ou en streaming et ne doit pas exposer de réponse en tableau complet en une seule fois.

## Conception

`TurnBoundaryCompactionEngine` stocke la relecture retenue sous forme de segments ordonnés plutôt que d'un tableau plat non borné. Un tour live terminé constitue un segment. La relecture de restauration/semis en masse est stockée sous forme de segments au niveau des événements, afin que les événements de restauration les plus anciens puissent être écartés indépendamment lorsque la limite d'octets est dépassée.

Le dimensionnement réutilise la sémantique de dimensionnement JSON sûre de l'EventBus. Un échec de dimensionnement journalise des diagnostics et compte cet événement comme zéro octet, afin que les chemins de publication et de semis conservent leur contrat de ne jamais lever d'exception.

Lorsque `replayBytes > maxReplayBytes`, le moteur abandonne les segments les plus anciens tant qu'il reste plus d'un segment. Il incrémente `truncatedEvents`, et n'incrémente `truncatedTurns` que pour les segments de tours live abandonnés. `snapshot()` aplatit les segments retenus et ajoute en tête :

```json
{
  "type": "history_truncated",
  "data": {
    "reason": "replay_window_exceeded",
    "truncatedEvents": 12,
    "retainedEvents": 8,
    "maxBytes": 4194304,
    "truncatedTurns": 3,
    "fullTranscriptAvailable": true
  }
}
```

Le marqueur est synthétique et sans id. Il est exclu de la comptabilisation des octets et de la rétention transitoire de la relecture. `ingest()`, `seed(snapshot)` et `seedReplayEvents()` le filtrent tous, afin que le chargement d'un snapshot borné ne puisse pas cumuler des marqueurs.

`EventBus.seedReplayEvents()` attribue des ids et des horodatages aux événements de relecture de restauration, appelle la méthode de semis dédiée du moteur de compaction et vide l'anneau SSE comme auparavant. Cela empêche la relecture de restauration en masse d'être ajoutée à `liveJournal`.

Le câblage CLI transmet une seule limite résolue à travers yargs, le parseur fast-path, `ServeOptions`, le câblage du serveur, `BridgeOptions`, le statut du bridge et le rendu du statut du démon. Les valeurs invalides (`0`, négatives, non entières, `NaN`, `Infinity`, ou supérieures à 256 MiB) échouent en fail closed.

Le SDK et la WebUI connaissent `history_truncated`, valident son payload, le projettent dans les compteurs du view-state et le statut de la transcription, et rendent une ligne de statut terminale. L'événement n'est pas un événement inconnu/de debug et ne fait pas partie du gating de resynchronisation.

## Notes d'audit

Round 1 : une limite portant uniquement sur les tours live terminés est insuffisante, car la restauration en mode response peut semer une grande relecture historique sans frontières live. La conception ajoute donc `seedReplayEvents()` et des segments historiques au niveau des événements.

Round 2 : réutiliser `state_resync_required` pour la troncature créerait des boucles de rechargement, car `/load` continuerait de renvoyer la même fenêtre bornée. La conception utilise un marqueur de statut distinct qui ne définit jamais `awaitingResync`.

Round 3 : une limite sur le nombre de tours ne borne pas la mémoire lorsqu'un tour contient une grande sortie d'outil. PR-1 utilise une application basée uniquement sur les octets et laisse la limitation du tour actif hors périmètre.

Round 4 : renvoyer la transcription complète sous forme de tableau recréerait le même problème de pic mémoire au moment de la requête. PR-2 est explicitement contraint à la pagination ou au streaming.

Round 5 : une relecture vide après troncature ferait perdre aux clients tout état visible. Le moteur préserve le segment le plus récent même s'il est surdimensionné.

## Plan de vérification

- Tester unitairement le découpage des tours live, le découpage du semis de restauration, le placement du marqueur, le filtrage du marqueur transitoire, la rétention du dernier segment surdimensionné, l'échec de dimensionnement sûr et le comportement de ne jamais lever d'exception de l'EventBus.
- Tester unitairement la restauration en mode response du bridge et le comportement de chargement des sessions live avec la fenêtre bornée.
- Tester unitairement le parsing CLI, le parsing fast-path, la validation de runQwenServe, le câblage du bridge serveur et les limites du statut du démon.
- Tester unitairement la validation des événements connus du SDK, l'état du reducer, le normalisateur d'UI, le statut de la transcription, le rendu terminal et l'injection de relecture de la WebUI.
- Conserver la vérification finale sur `npm run build`, `npm run typecheck` et `npm run lint`.
