# Hook SessionDelete

## Objectif

Notifier un hook de l'utilisateur après qu'une session explicitement
sélectionnée a été supprimée.

## Contrat

- `SessionDelete` s'exécute après que `SessionService.removeSession` ou
  `removeSessions` rapporte qu'une transcription a été supprimée.
- Le hook est fire-and-forget. Sa sortie et son échec ne peuvent pas annuler
  ni retarder une suppression terminée.
- Le payload contient les champs de hook normaux du runtime de hooks plus
  `deleted_session_id`. Le runtime de hooks possède la configuration des
  hooks ; la session supprimée peut être inactive et n'a pas de runtime de
  hooks live.
- Le flux interactif `/delete` et la méthode d'extension explicite
  `deleteSession` d'ACP émettent l'événement. Le nettoyage, le rollback,
  l'archivage, la fermeture et la suppression par lot REST du démon ne
  l'émettent pas.

## Justification

`SessionEnd` décrit le cycle de vie d'une conversation active. La suppression
définitive est un travail de cycle de vie du stockage et peut cibler une
transcription inactive ; elle a donc besoin d'un événement et d'un
identifiant séparés. L'exécuter uniquement après le succès empêche les hooks
de laisser des flux de fermeture et de suppression partiellement terminés.

La suppression REST du démon n'a ni `Config` ni propriétaire `HookSystem`
dans le processus qui supprime les transcriptions. Brancher ce chemin
nécessiterait un contrat d'exécution de hooks de workspace explicite, plutôt
que de reconstruire les hooks en mémoire d'une session supprimée. C'est
intentionnellement hors du périmètre de ce changement.
