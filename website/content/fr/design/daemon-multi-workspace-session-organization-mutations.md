# Mutations d'organisation des sessions multi-workspaces

## Résumé

Ajouter `PATCH /workspaces/:workspace/session/:id/organization` comme mutation
d'organisation de session qualifiée par workspace.

La route applique les changements d'épingle, de groupe et de couleur au
magasin d'organisation des sessions possédé par le workspace sélectionné. Elle
étend la surface REST plurielle existante sans modifier les capacités, les
schémas de requête ou de réponse, ACP, ni le comportement de l'UI.

## Problème

Les lectures de session qualifiées par workspace ciblent déjà le workspace
sélectionné. `GET /workspaces/:workspace/sessions` peut renvoyer des sessions
persistées, archivées et live depuis un runtime non primaire fiable et peut
appliquer des vues organisées et des filtres de groupe contre le magasin
d'organisation de ce runtime.

La seule mutation d'organisation aujourd'hui est
`PATCH /session/:id/organization`. Cette route historique est réservée au
workspace primaire. Par conséquent, un client peut lire l'état d'organisation
d'un workspace secondaire mais ne peut pas le mettre à jour via la surface
REST qualifiée par workspace correspondante.

## Décision

Enregistrer `PATCH /workspaces/:workspace/session/:id/organization` à côté des
autres routes de stockage de session qualifiées par workspace.

Le sélecteur `:workspace` se résout exactement comme les routes plurielles
existantes :

1. Correspondance avec un id exact de workspace enregistré.
2. Sinon, décoder et canonicaliser un sélecteur de cwd absolu.
3. Renvoyer l'erreur existante de workspace inconnu si aucun des deux ne
   résout.

Le runtime sélectionné est le périmètre complet de l'opération. La recherche
de session, la validation de groupe, la mutation d'organisation et la
persistance utilisent tous le cwd de workspace et les magasins de ce runtime.
Le gestionnaire ne retombe jamais sur le runtime primaire ni ne cherche dans
un autre workspace enregistré.

## Flux de données

1. La requête passe les middlewares normaux d'hôte, bearer et JSON du démon.
2. La route plurielle résout `:workspace` vers un runtime enregistré.
3. La porte de confiance des mutations plurielles exige que ce runtime soit
   fiable.
4. Le runtime cible recherche `:id` dans son magasin persisté actif, son
   magasin persisté archivé, ou son bridge live.
5. Le corps de la requête passe la validation existante des requêtes
   d'organisation.
6. Si `groupId` est présent et non nul, le magasin de groupes du runtime
   cible valide ce groupe.
7. Le magasin d'organisation du runtime cible applique `isPinned`, `groupId`
   et `color` avec la sémantique existante.
8. La route renvoie la même réponse d'organisation que la mutation
   historique.

Les sessions actives persistées, les sessions archivées persistées, et les
sessions live uniquement correspondantes sont des cibles valides.
L'organisation reste un état sidecar : la mutation ne réécrit pas le JSONL de
la transcription ni ne modifie l'heure de modification de la transcription.

## Confiance et ordre des erreurs

Les conventions des routes plurielles déterminent l'ordre observable :

1. Un sélecteur de workspace inconnu renvoie la réponse existante
   `400 { code: "workspace_mismatch" }`.
2. Un workspace connu mais non fiable renvoie
   `403 { code: "untrusted_workspace" }` avant que l'existence d'une session
   ou d'un groupe ne soit divulguée.
3. Une session absente des ensembles actif, archivé et live du runtime
   sélectionné renvoie le `404` existant de session introuvable.
4. Des champs de mise à jour d'organisation invalides renvoient l'erreur de
   validation d'organisation existante après que la session cible fiable a été
   trouvée.
5. Un id de groupe non nul absent du magasin de groupes du runtime
   sélectionné renvoie `404 { code: "group_not_found" }`.
6. Un sidecar d'organisation illisible renvoie
   `500 { code: "session_organization_store_unreadable" }`.

Les conflits d'archive et de suppression conservent les erreurs existantes du
coordinateur d'archives.

Il n'y a aucun fallback inter-workspaces à aucune étape d'erreur. Une session
ou un groupe qui n'existe que dans le workspace primaire reste inconnu
lorsqu'un workspace secondaire est sélectionné, et vice versa.

## Compatibilité historique

`PATCH /session/:id/organization` conserve son comportement actuel réservé au
primaire, y compris sa porte de mutation, sa validation, sa recherche, sa
persistance, ses formes d'erreur, et son schéma de réponse. Les clients
existants conservent donc le même routage et le même comportement d'ids en
double.

Les clients n'utilisent la mutation plurielle qu'après que
`session_organization` et `workspace_qualified_rest_core` sont tous deux
annoncés. Aucun nouveau tag de capacité n'est introduit.

## Comportement ACP

Le dispatch ACP ne change pas. Le dispatcher qualifié opère déjà sur
`rt.bridge` et `rt.workspaceCwd`, de sorte que les actions de session ACP
qualifiées par workspace sont déjà liées au runtime sélectionné. Ce changement
se limite à la mutation d'organisation REST qui manquait à la surface
plurielle.

## Concurrence et verrous des magasins

`SessionOrganizationService` utilise son verrou existant par sidecar
uniquement pour sérialiser les opérations de lecture-modification-écriture de
groupes et d'organisation de sessions contre ce même sidecar. Le coordinateur
d'archives existant coordonne les mises à jour d'organisation avec les
transitions d'archive et de suppression. Cette route n'ajoute aucun verrou à
l'échelle du démon ni aucune nouvelle transaction ou garantie d'atomicité
inter-services.

## Tests et acceptation

Les tests automatisés et la stratégie d'acceptation E2E réelle couvrent
ensemble :

- Les sélecteurs d'id de workspace et de cwd canonique encodé pour URL
  atteignent le même runtime.
- Un workspace secondaire fiable peut muter l'organisation des sessions
  actives persistées, archivées persistées et live uniquement.
- L'épinglage, le groupement, le dégroupement, et les mises à jour de couleur
  prise en charge ou `null` renvoient la forme de réponse existante.
- Les listes organisées et les filtres d'épinglés/groupes reflètent la
  mutation.
- L'état d'organisation survit au redémarrage du démon pour les sessions
  persistées.
- Une mutation secondaire ne modifie pas l'état d'organisation du workspace
  primaire.
- La route historique reste réservée au primaire et renvoie `404` pour une
  session qui n'existe que dans un workspace secondaire.
- Les workspaces connus non fiables renvoient `403` avant toute recherche de
  session ou de groupe.
- Les sélecteurs inconnus, les sessions inconnues à portée cible, et les
  groupes inconnus à portée cible renvoient leurs erreurs existantes sans
  fallback inter-workspaces.

L'acceptation inclut également le build, le typecheck, les tests de routes et
SDK ciblés, et une passe E2E couvrant deux workspaces fiables plus les cas
négatifs de confiance et de sélecteur.

## Non-objectifs explicites

Ce changement n'introduit aucun tag de capacité ni changement de payload de
capacité, aucun changement de schéma de requête ou de réponse, aucun
changement de comportement ACP, et aucun changement d'UI. Il ne rend pas la
route historique consciente du multi-workspaces, n'ajoute pas la découverte de
sessions inter-workspaces, et ne modifie pas la sémantique des archives, des
listes, des groupes, ni des transcriptions.
