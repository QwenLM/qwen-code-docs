# Retrait des runtimes de workspace du démon

## Contexte

L'enregistrement de workspaces au runtime et l'enregistrement persistant sont déjà disponibles, mais oublier un enregistrement persistant ne décharge pas le bridge actif, le montage ACP, l'état d'admission des sessions, ni la lane mémoire. Cette conception ajoute un retrait à chaud synchrone des runtimes secondaires tout en préservant l'API existante d'oubli d'enregistrement.

## Périmètre et invariants

- Seuls les runtimes secondaires enregistrés dynamiquement et restaurés depuis la persistance sont retirables. Le workspace primaire et chaque runtime `--workspace` sont statiques.
- `DELETE /workspaces/:workspace` supprime le runtime et tous les alias persistants connus. Cette opération ne supprime jamais les fichiers, les paramètres, les transcriptions, les archives ou toute autre donnée de projet du workspace.
- Le retrait sans forçage est observationnel : si le runtime figé présente de l'activité, chaque garde est levé en rollback et la requête renvoie `409 workspace_busy`. Le retrait forcé termine cette activité.
- La persistance est validée avant le nettoyage destructif. Un échec du store restaure le runtime actif. Les échecs de nettoyage après validation du store ne peuvent pas annuler l'opération par rollback et utilisent l'arrêt synchrone du bridge comme solution de repli.
- Un cwd supprimé reste réservé jusqu'à la fin du nettoyage, puis peut être enregistré à nouveau avec un nouveau bridge, un nouveau dispatcher ACP, un nouveau registre de connexions et une nouvelle lane mémoire.

## Protocole

Les démons de production annoncent `workspace_runtime_removal` lorsque le contrôleur de retrait est installé. Les lignes de workspace des capacités ajoutent le champ optionnel `removable` ; les anciens clients et démons restent compatibles.

`DELETE /workspaces/:workspace` utilise le sélecteur existant workspace-id-ou-cwd-canonique et accepte un corps JSON optionnel contenant un booléen `force`. En cas de succès, la réponse renvoie l'identité retirée, si le forçage a été demandé, si un alias persistant a été supprimé, et le snapshot final d'activité après drain. Une requête sans forçage déjà visiblement occupée peut renvoyer un snapshot antérieur au drain sans figer brièvement le runtime. L'`DELETE /workspace-registrations/:id` existant reste uniquement un oubli.

## Cycle de vie

Le registre suit les runtimes actifs, en drain et retirés. La résolution publique ne voit que les runtimes actifs ; la résolution de gestion conserve les runtimes en drain pour le signalement de conflits et la réservation de cwd.

Le retrait prend d'abord un snapshot rapide d'activité. Il marque ensuite de manière synchrone le registre comme en drain, ferme l'admission des sessions par workspace, et draine le montage ACP et la lane mémoire. Le snapshot final lit les réservations de sessions en attente avant les comptes de bridges actifs, afin qu'une transition réservation-vers-session ne puisse pas paraître inactive. Une requête occupée sans forçage inverse les gardes. Sinon, tous les IDs d'enregistrement connus sont supprimés atomiquement, le travail mémoire en file est mis en échec, le lanceur de sous-session et le bridge sont arrêtés, le montage ACP est détruit, les index de propriété sont effacés, et l'entrée du registre est finalisée.

Le nettoyage des runtimes est mémorisé par identité de runtime, et non par cwd, afin qu'un runtime ultérieur enregistré sur le même chemin ne puisse pas réutiliser une ancienne promesse de nettoyage. L'arrêt du démon scelle les opérations de gestion, attend leur convergence, arrête les lanceurs, puis utilise le même chemin de démantèlement du bridge pour les runtimes gérés restants.

## Identité de persistance

La restauration enregistre l'ID de chaque chemin stocké brut avant canonisation. Plusieurs alias bruts qui se résolvent en un seul runtime sont conservés comme un seul ensemble d'IDs, y compris les alias masqués par un workspace explicite de démarrage. Le retrait supprime cet ensemble plus l'ID d'enregistrement canonique sous un seul lock de store, sans modifier le schéma.

## UI

Le Web Shell n'expose le retrait que lorsque le tag de fonctionnalité et `removable: true` sont tous deux présents. L'action reste disponible pour les workspaces non fiables. La première confirmation effectue une requête sans forçage ; `workspace_busy` rend les comptes d'activité et propose le retrait forcé. Le forçage est désactivé lorsque la session courante appartient au workspace cible. En cas de succès, les capacités et les listes de sessions sont réconciliées, avec un retour au workspace primaire si nécessaire.

## Analyse des échecs et de la compatibilité

Les déconnexions de clients et les timeouts du SDK n'annulent pas le nettoyage côté serveur. Les opérations concurrentes d'ajout, de promotion de persistance et de retrait sont sérialisées par cwd canonique. L'arrêt rejette les nouvelles opérations de gestion avec `daemon_shutting_down` et attend le travail déjà commencé. Les anciens clients ignorent le champ de capacité et la fonctionnalité optionnels ; les anciens démons continuent de produire un `DaemonHttpError` normal pour la route manquante.

Le groupe de workers de canal à portée de workspace fournit l'activité et le démantèlement via un adaptateur fin. Le drain bloque le rechargement et le routage des webhooks pour le workspace cible ; le retrait validé arrête et désenregistre uniquement ce worker, afin que le statut du démon et les métadonnées du pidfile convergent sans affecter les autres workspaces.

## Vérification

La couverture unitaire cible les transitions d'état du registre et le nettoyage des propriétaires, le rollback du drain d'admission, la suppression par lot des alias, le comportement des routes occupé/forçage/échec-de-store, l'idempotence de la raison d'arrêt du bridge, l'annulation de la lane mémoire, l'encodage des requêtes du SDK, et les gardes de fonctionnalité et de forçage du Web Shell. Le plan E2E se trouve dans `.qwen/e2e-tests/workspace-runtime-removal.md`.
