# Enregistrement persistant des workspaces du démon

## Objectif

Les workspaces ajoutés depuis le Web Shell survivent à un redémarrage du processus `qwen serve`
lorsque le démon est relancé avec le même workspace primaire et le même `QWEN_HOME`.

## Propriété de l'état

L'enregistrement dynamique de workspaces est une configuration privée de l'utilisateur pour le démon,
ni une configuration de projet, ni une sortie runtime jetable. Les enregistrements sont
stockés sous :

```text
${QWEN_HOME:-~/.qwen}/daemon/workspaces/<primary-scope-sha256>.json
```

Le hash de scope est le SHA-256 complet du chemin canonique du workspace primaire
(mis en minuscules sous Windows). Le fichier répète le chemin primaire afin qu'un scope erroné ou
corrompu soit rejeté plutôt qu'appliqué silencieusement.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/repo/main",
  "workspaces": ["/repo/service-a"]
}
```

Seuls les chemins secondaires canoniques sont stockés. La confiance, l'environnement, les ids de workspace,
les sessions et les erreurs runtime sont redérivés à chaque démarrage du démon.

## Cycle de vie

Le démon de production lit le petit fichier d'enregistrement après avoir résolu et
canonisé le workspace primaire. Les chemins stockés valides sont fusionnés après les entrées explicites `--workspace`. Les entrées explicites font autorité : un chemin explicite mal formé
ou indisponible reste une erreur de démarrage, tandis qu'un chemin stocké indisponible
est ignoré avec un avertissement et conservé sur le disque pour un redémarrage ultérieur.

Les chemins récupérés entrent dans la boucle normale de construction des runtimes secondaires avant
que `WorkspaceRegistry` et les surfaces Express/ACP ne soient assemblées. Cela garde
les capacités, les montages ACP qualifiés par workspace, l'agrégation de statut et la
limite totale de sessions par défaut cohérents avec l'ensemble de runtimes restauré.

Pour les ajouts locaux au processus après l'assemblage de l'application, les routes ACP qualifiées par workspace
restent montées tant qu'un registre existe et créent un montage secondaire de confiance
paresseusement à la première utilisation. Cela évite qu'un snapshot de démarrage à workspace unique ne
rende inutilisable un enregistrement Web Shell ultérieur jusqu'au redémarrage.

`POST /workspaces` accepte `persist: true`. Une requête persistante réussie n'est
pas confirmée tant que la mise à jour du fichier d'enregistrement ne s'est pas terminée avec succès.
Répéter une requête persistante pour un workspace déjà actif promeut ou confirme son
enregistrement stocké et réussit de manière idempotente. Les appelants existants qui omettent
`persist` conservent le comportement actuel local au processus.

`GET /workspace-registrations` expose l'ensemble stocké désiré pour la gestion.
`DELETE /workspace-registrations/:id` oublie un enregistrement stocké ; un runtime actif
reste actif jusqu'au redémarrage. Le workspace primaire ne peut jamais être stocké
ou oublié via cette surface.

## Comportement de sécurité et d'échec

- Le store est limité à 24 chemins secondaires, chacun ne dépassant pas la limite du démon
  pour les chemins de workspace.
- Les lectures rejettent les liens symboliques, les fichiers non réguliers, les fichiers surdimensionnés, le JSON mal formé,
  les versions de schéma inconnues et les inadéquations de scope primaire.
- Les écritures utilisent un mutex in-process, un lock inter-processus et le helper partagé d'écriture
  atomique de fichiers, avec le mode `0600` et sans suivi des liens symboliques.
- Les stores corrompus ne sont jamais traités comme vides par les chemins de mutation, ce qui empêche
  un ajout ultérieur d'écraser des données récupérables.
- La confiance persistée est volontairement absente ; les workspaces restaurés passent par le
  calcul actuel des dossiers de confiance.
- Les entrées stockées manquantes, inaccessibles, imbriquées ou dépassant la limite active sont
  ignorées sans supprimer l'entrée désirée. Les entrées dupliquées rendent
  le store invalide et ne sont jamais réécrites implicitement.

## Compatibilité

La capacité additive `persistent_workspace_registration` annonce le nouveau
contrat. L'option de requête du SDK et le champ de réponse `persisted` sont additifs.
`runQwenServe` possède la restauration automatique au démarrage. Les embeddings directs `createServeApp`
ne gagnent les routes de gestion de la persistance que lorsqu'un store d'enregistrement
est explicitement fourni, et restent responsables de restaurer leur registre de workspaces
injecté avant la création de l'application.

## Frontière de suivi

Le retrait à chaud reste séparé : oublier un enregistrement affecte le prochain
redémarrage mais ne termine pas les sessions ni ne détruit un bridge de workspace actif.
