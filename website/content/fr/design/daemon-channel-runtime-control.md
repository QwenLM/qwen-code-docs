# Contrôle du runtime des canaux du démon

## Résumé

Ajouter un contrôle d'état désiré au runtime pour les workers de canal gérés
par le démon. Un démon peut démarrer sans `--channel`, puis activer,
remplacer, inspecter, recharger et arrêter sa sélection de canaux sans
redémarrer le démon. Les changements au runtime ne sont pas persistés ; le
prochain démarrage du démon suit toujours `--channel`.

La couche de contrôle se situe au-dessus de l'implémentation des workers
groupés par workspace. Elle possède la sélection validée, sérialise les
mutations de cycle de vie, préserve le bail du service de canaux détenu par
serve, et ne réconcilie que les groupes de workspaces dont la sélection
ordonnée a changé.

## Contrat public

`GET /workspace/channel` renvoie la sélection validée, une éventuelle
sélection en attente, la transition en cours, et des snapshots des workers
annotés par workspace.

`PUT /workspace/channel` accepte :

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

ou `{ "selection": { "mode": "all" } }`. Les sélections nommées sont rognées
et dédupliquées sans tri. Une sélection vide est invalide. `all` reste réservé
au workspace primaire en mode multi-workspaces.

`DELETE /workspace/channel` désactive de façon idempotente la sélection du
runtime. `POST /workspace/channel/reload` reste disponible et relit les
paramètres pour la sélection validée. Les mutations utilisent la porte stricte
du bearer token.

La capacité `channel_control` annonce la ressource. `channel_reload` continue
d'être annoncée uniquement tant que le gestionnaire possède une sélection
validée et rechargeable.

## Cycle de vie

Le gestionnaire expose des snapshots immuables et envoie toutes les mutations
à travers une unique lane FIFO. Une mise à jour de sélection vérifie au
préalable la propriété et la confiance du workspace avant d'arrêter les
workers. Les entrées de workspace inchangées sont conservées. Les entrées
modifiées et retirées s'arrêtent avant que les remplaçantes ne démarrent,
tandis que le démon conserve le bail global du service de canaux.

Si un remplacement échoue, le gestionnaire tente d'arrêter les entrées
nouvellement démarrées et de redémarrer les entrées précédentes. Les clients
inspectent `rolledBack`, `rollbackError` et `state`, car le nettoyage ou la
restauration peut aussi échouer. Un échec d'observation de la sortie de
l'enfant après SIGKILL est un échec d'arrêt dur : le superviseur conserve la
référence de l'enfant, le gestionnaire conserve le bail du service, et aucun
remplaçant n'est lancé.

Les callbacks des workers portent une génération. Les callbacks provenant
d'entrées remplacées peuvent journaliser, mais ne peuvent pas mettre à jour le
pidfile actuel ni l'état de routage. Un commit réussi échange ensemble la
sélection, la configuration des webhooks et la map des workers, puis réécrit
le snapshot complet du pidfile.

Une connexion partielle d'adaptateur préserve le comportement existant : un
worker est ready lorsqu'au moins un canal demandé se connecte. Les résultats
de contrôle rapportent `partial`, et le statut du démon continue d'émettre
`channel_worker_partial_connect`.

## Compatibilité

Le `--channel` au démarrage utilise le même gestionnaire tout en conservant la
réservation du bail avant écoute et le comportement ready avant succès. Sans
`--channel`, le démon ne réserve pas le service de canaux ni ne charge le
runtime lourd des canaux avant la première mutation au runtime.

Le `runtime.channelWorker` historique, le `runtime.channelWorkers` groupé, les
champs du pidfile, `qwen channel start` autonome et `qwen channel reload`
restent compatibles. Le nouveau contrôle CLI est exposé via `qwen channel set`,
plus des variantes distantes d'arrêt et de statut des canaux.
