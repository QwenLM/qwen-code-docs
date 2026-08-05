# Export de sessions archivées qualifiées par workspace

## Résumé

Le démon peut exporter des sessions persistées actives depuis un workspace
enregistré sélectionné, mais les transcriptions archivées restent inaccessibles
tant qu'elles ne sont pas déplacées vers le stockage actif. Ce changement ajoute
un export d'archives en lecture seule sans modifier le comportement de l'export
actif ni la machine à états des archives.

Le protocole ajoute
`GET /workspaces/:workspace/session/:id/archive/export?format=html|md|json|jsonl`,
la capacité inconditionnelle `workspace_archived_session_export`, et
`WorkspaceDaemonClient.exportArchivedSession`. La route et la capacité sont
distinctes de celles de l'export actif afin qu'un démon plus ancien ne puisse
pas ignorer l'intention d'archive et renvoyer une transcription active portant
le même id.

## Contrat

Le sélecteur se résout d'abord comme un id de workspace enregistré exact, puis
comme un cwd canonique absolu encodé pour URL. Le runtime sélectionné doit être
fiable ; les vérifications de sélecteur et de confiance précèdent la validation
de la session et du format.

Seul le `chats/archive/<id>.jsonl` du workspace sélectionné est éligible. La
route n'analyse pas le stockage actif ni un autre workspace, ne retombe pas sur
le primaire, ne résout pas un propriétaire live, n'appelle pas de bridge, ne
démarre pas ACP, n'attache pas de client et ne charge pas les paramètres. Les
sessions uniquement actives renvoient `409 session_not_archived`, les sessions
absentes renvoient `404 session_not_found`, des fichiers simultanément actifs
et archivés renvoient `409 session_conflict`, et les transitions renvoient
`409 session_archiving`.

## Réutilisation et concurrence

`SessionService.loadArchivedSession` est la seule nouvelle surface de
consommation du cœur. Elle délègue à la même logique privée de reconstruction
que `loadSession` tout en lisant le chemin archivé ; les appelants existants
de load/resume restent uniquement actifs. Le démon réutilise les collecteurs
d'export, formateurs, en-têtes de réponse et l'analyseur de pièces jointes SDK
existants, de sorte que les exports archivés et actifs ont un comportement de
format identique. Avant la reconstruction, le chargeur archives uniquement
applique la limite existante d'indexation de transcription de 256 Mio et
renvoie `413 transcript_too_large` au-delà. L'export actif conserve son contrat
sans limite tel que livré.

L'export détient le bail partagé existant du `SessionArchiveCoordinator` pour
la vérification complète de l'emplacement, la reconstruction de la
transcription et l'opération de formatage. Archive, unarchive et delete
conservent des baux exclusifs, donc une transition démarre soit avant l'export
et le rejette, soit après la libération du bail partagé. Le coordinateur reste
indexé prudemment par id de session, tous workspaces confondus.

## Compatibilité et vérification

La route d'export du workspace actif, la capacité `workspace_session_export`,
l'export primaire historique, les mutations d'archives et l'agencement de
persistance sont inchangés. Les appelants SDK directs reçoivent l'erreur HTTP
normale lorsque la nouvelle méthode cible un démon plus ancien.

Les tests couvrent l'annonce de la capacité, les sélecteurs par id et par cwd,
tous les formats, les métadonnées de pièces jointes, les états
actif/absent/conflit/transition, la priorité de la confiance, l'isolation par
workspace à id identique, l'absence d'activité du bridge, les deux directions
de verrouillage, la reconstruction archivée du cœur, l'attribution de
télémétrie, et le transport SDK REST natif. Les tests de taille acceptent la
limite archivée exacte et rejettent un fichier creux d'un octet au-dessus
avant la matérialisation de la transcription.
