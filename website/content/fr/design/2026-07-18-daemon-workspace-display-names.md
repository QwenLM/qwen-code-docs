# Noms d'affichage des workspaces du démon

## Objectif

Permettre aux clients du démon et du SDK TypeScript d'attacher un nom
d'affichage lisible optionnel à un workspace enregistré sans changer
l'identité ni le routage du workspace. Permettre aux utilisateurs du Web
Shell de définir ce nom lors de l'ajout d'un workspace et de le voir dans la
liste des workspaces. Permettre aux clients API de mettre à jour ou d'effacer
les métadonnées de présentation d'un workspace actif.

## Contrat

- Les entrées de `workspaces[]` ajoutent une métadonnée `displayName`
  optionnelle.
- `POST /workspaces` accepte un `displayName` optionnel lors de
  l'enregistrement ou de la promotion persistante d'un workspace secondaire.
- `PATCH /workspaces/:workspace` est l'endpoint de mise à jour du workspace.
  La forme actuelle de sa requête est `{ displayName: string | null }` ;
  `null` efface le nom.
- `POST /workspaces`, `PATCH /workspaces/:workspace` et les listings
  d'enregistrement persistant renvoient le nom d'affichage effectif lorsqu'il
  existe.
- `workspace_display_name` annonce le contrat. Le SDK TypeScript expose
  l'option d'enregistrement et `updateWorkspace()`.
- Lorsque la capacité est annoncée, la boîte de dialogue d'ajout de workspace
  du Web Shell accepte un nom d'affichage optionnel et l'utilise pour les
  labels de workspace.

`id` et `cwd` restent les seuls sélecteurs de workspace. Un nom d'affichage
n'est jamais utilisé pour la recherche et n'a pas besoin d'être unique.

## Runtime et persistance

Le runtime possède le nom d'affichage effectif. Mettre à jour n'importe quel
workspace actif modifie cette métadonnée du runtime. Lorsque le runtime a des
identités d'enregistrement persistant correspondantes, la même mise à jour
est écrite atomiquement sur toutes ; sinon la mise à jour reste locale au
processus. Les workspaces locaux au processus perdent le runtime et son nom à
l'arrêt du démon et ne dépendent jamais du store d'enregistrement pour les
mises à jour de nom d'affichage.

Le fichier d'enregistrement existant en schéma v1 conserve sa forme
`workspaces: string[]` et ajoute un objet `displayNames` optionnel indexé par
l'identifiant d'enregistrement stable existant. Les mises à jour réutilisent
le verrou existant du store, la relecture sous verrou et l'écriture atomique.
Les démons plus anciens ignorent le champ additif, et les démons plus récents
continuent de lire les fichiers qui ne le contiennent pas. Supprimer un
enregistrement supprime aussi son entrée de nom d'affichage.

## Validation et échecs

Les noms d'affichage de workspace sont limités à 256 caractères une fois les
espaces environnants rognés. Les caractères de contrôle C0 internes et DEL
sont rejetés ; un résultat vide est traité comme une absence de nom. Une
entrée invalide renvoie `400 invalid_display_name` avant tout travail sur le
système de fichiers ou le runtime. Les noms d'affichage en double sont
autorisés.

Lorsqu'un workspace local au processus est persisté pour la première fois,
l'écriture dans le store d'enregistrement se termine avant que le nom
d'affichage persisté soit exposé sur le runtime. De même, un PATCH met à jour
les enregistrements persistants correspondants avant d'exposer la nouvelle
valeur du runtime, afin qu'un échec ordinaire du store laisse le runtime
inchangé.

## Compatibilité

Chaque changement de protocole est additif dans le protocole v1. Les anciens
SDK ignorent `displayName` ; les SDK plus récents le typent comme optionnel
et continuent de fonctionner avec les démons plus anciens qui omettent à la
fois le champ et le tag de capacité. Le Web Shell masque les contrôles de nom
d'affichage lorsque le tag de capacité est absent.

## Vérification

- Les tests du store d'enregistrement couvrent les fichiers legacy, les noms
  initiaux, la validation, les mises à jour atomiques d'alias, la
  restauration au redémarrage et le nettoyage à la suppression.
- Les tests de gestion des workspaces couvrent la création locale au
  processus et persistante, la mise à jour/l'effacement, les erreurs de
  persistance et la promotion idempotente.
- Les tests de capacité/statut et de SDK couvrent le champ additif, les
  formes de requête, `updateWorkspace()` et l'annonce de
  `workspace_display_name`.
- Les tests du Web Shell couvrent l'entrée optionnelle, la transmission de
  l'option du SDK et le fallback du label. Des captures d'écran du navigateur
  vérifient le véritable formulaire d'ajout de workspace et le label de barre
  latérale qui en résulte.
- La vérification manuelle de bout en bout couvre l'enregistrement local au
  processus et la restauration au redémarrage persistant.

Formulaire d'ajout de workspace rempli :

![Workspace display-name form](../assets/workspace-display-name-web-shell.jpg)

Workspace créé affiché par son nom d'affichage :

![Workspace display-name result](../assets/workspace-display-name-web-shell-result.jpg)
