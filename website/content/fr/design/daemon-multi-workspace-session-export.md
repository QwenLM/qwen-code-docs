# Export de sessions qualifié par workspace

## Résumé

L'issue #6378 exige que les clients puissent exporter une session persistée
depuis un workspace enregistré explicitement sélectionné. La route existante
`GET /session/:id/export` est intentionnellement liée au workspace primaire,
de sorte que la réutiliser pour une session secondaire renvoie soit `404`,
soit peut sélectionner la mauvaise transcription lorsque le même id de session
existe dans plusieurs workspaces.

Ce changement ajoute
`GET /workspaces/:workspace/session/:id/export?format=html|md|json|jsonl`, la
capacité `workspace_session_export`, une méthode `WorkspaceDaemonClient`
correspondante, et la documentation associée. La route historique reste liée
au primaire.

## Contrat

Le sélecteur de workspace suit la règle existante des routes plurielles :
d'abord l'id exact d'un workspace enregistré, puis un cwd absolu encodé pour
URL après canonicalisation. Le runtime sélectionné doit être fiable. La
résolution et les vérifications de confiance ont lieu avant la validation de
la session ou du format.

La route ne lit que le JSONL persisté actif du workspace sélectionné. Elle ne
cherche pas dans un autre workspace, ne retombe pas sur le primaire, ne résout
pas un propriétaire live, ne démarre pas ACP, n'attache pas de client, et ne
charge pas les paramètres du workspace. Les sessions archivées restent
indisponibles. Le succès utilise le même formateur, la même sanitisation de
nom de fichier, le même type MIME, la même politique de cache, et les mêmes
en-têtes de pièce jointe que la route d'export historique.

Les erreurs conservent les formes existantes d'export/stockage, avec
`400 workspace_mismatch`, `403 untrusted_workspace`,
`400 invalid_export_format`, `404 session_not_found`, et les contrats
existants `409 session_archived`, `session_archiving` et `session_conflict`.

## Capacité et compatibilité

`workspace_session_export` est une capacité v1 inconditionnelle, car la route
plurielle est utile pour un primaire fiable à workspace unique sélectionné par
id ou cwd. La confiance est tout de même évaluée par requête. Le nouveau tag
est indépendant de `multi_workspace_sessions` et ne peut pas être déduit de
`session_export` ou de `workspace_qualified_rest_core` ; les démons publiés
annoncent les deux anciens tags mais n'implémentent pas cette route.

Les appelants SDK directs reçoivent l'erreur HTTP normale lorsqu'ils appellent
la nouvelle méthode contre un démon plus ancien. L'intégration du Web Shell
est hors de ce changement, donc son comportement d'export existant réservé au
primaire reste inchangé.

## Concurrence et sécurité

L'export conserve le verrou existant du coordinateur d'archives partagé,
indexé par id de session, de sorte que l'archive et la suppression ne peuvent
pas déplacer ni retirer le fichier pendant la relecture. Le coordinateur reste
prudemment global : des ids identiques dans des workspaces différents peuvent
être sérialisés même si leurs fichiers sont indépendants. Renommer toutes les
clés de verrou d'archive/suppression est hors de ce changement.

Contrairement au pager borné des transcriptions persistées, l'export complet
matérialise la transcription complète et n'est pas disponible pour un
workspace secondaire non fiable. L'export fiable existant n'a pas de nouveau
budget de taille de réponse ; ajouter une limite spécifique au workspace
ferait diverger les contrats de format pluriel et historique.
L'authentification bearer du démon, le palier de taux de lecture GET par
défaut, et les vérifications de confiance par requête continuent de
s'appliquer.

Les courses avec le retrait de runtime utilisent le runtime sélectionné au
moment de la résolution de la requête. Le retrait ne supprime pas le stockage
des transcriptions, donc l'export n'a pas besoin de bail de runtime et ne
maintient pas un enfant ACP en vie.

## SDK et observabilité

`WorkspaceDaemonClient.exportSession` réutilise les types existants de
résultat et de format d'export et utilise toujours le REST natif, y compris
lorsque le client parent dispose d'un transport ACP. Le helper de requête
partagé préserve le token, l'identité du client, le timeout, l'analyse des
erreurs, le type de contenu, et le comportement du nom de fichier de la pièce
jointe.

La télémétrie du démon normalise le nouveau chemin en
`GET /workspaces/:workspace/session/:id/export`, décode l'id de session, et
utilise la résolution de workspace du middleware pour le hash du workspace
sélectionné.

## Alternatives rejetées

- Router l'export singulier par propriétaire live échoue pour les sessions
  persistées inactives et rend la propriété ambiguë après un redémarrage.
- Ajouter un query `cwd` à la route historique modifie un contrat de
  compatibilité réservé au primaire et est moins cohérent que les routes
  plurielles de workspace existantes.
- Retomber sur le primaire en cas d'absence peut exporter la session d'un
  autre workspace lorsque les ids entrent en collision.
- Autoriser l'export complet non fiable contournerait la politique de lecture
  bornée conçue pour le pager des transcriptions persistées.

## Vérification

Les tests couvrent l'annonce de la capacité, les sélecteurs id/cwd,
l'isolation à id identique, tous les formats, les en-têtes de réponse, les
frontières de confiance et d'archives, les cibles absentes/inconnues,
l'absence d'activité du bridge, l'attribution de télémétrie, le transport et
l'encodage SDK, et la coordination archive/suppression. La vérification de
bout en bout utilise des répertoires de runtime et de workspace isolés avec
des transcriptions persistées déterministes.
