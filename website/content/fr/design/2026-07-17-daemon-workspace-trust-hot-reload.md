# Rechargement à chaud de la confiance des workspaces du démon

## Statut

Implémenté pour QwenLM/qwen-code#6378.

## Problème

Le démon évalue actuellement la confiance des workspaces lors de la construction
d'un `WorkspaceRuntime`. `GET /workspace/trust` rapporte ce snapshot et
`POST /workspace/trust/request` publie uniquement `trust_change_requested`.
Modifier `trustedFolders.json`, la confiance IDE ou le paramètre de confiance
des dossiers utilisateur/système ne reconstruit pas le runtime, donc les
paramètres, l'environnement, le système de fichiers, les sessions ACP, MCP,
les extensions, les workers de canal et le travail planifié restent sur
l'ancienne frontière de confiance jusqu'au redémarrage du démon.

La confiance ne peut pas être mise à jour sur place. La fabrique de système de
fichiers, le bridge, les paramètres, l'environnement, le montage ACP et
plusieurs gestionnaires à portée de workspace capturent leurs entrées de
runtime lors de la construction.

## Invariants de sécurité

1. Une diminution de la confiance ferme la garde de génération du runtime
   affecté avant la première étape asynchrone de drain. Aucun nouvel effet de
   bord privilégié ne peut commencer après ce point.
2. Une garde de génération fermée ne rouvre jamais. Un remplaçant reçoit une
   nouvelle garde et un identifiant de génération strictement croissant.
3. Une révocation échouée ne restaure jamais le runtime fiable précédent.
4. Des paramètres système/utilisateur malformés ou illisibles échouent en fail
   closed. Un fichier de dossiers fiables malformé ou illisible échoue en fail
   closed lorsque la confiance par fichier est requise, mais est sans
   importance lorsque la confiance par dossier est désactivée ou que la
   confiance IDE a déjà résolu le workspace primaire.
5. Les propriétaires de session en transition, bloqués ou obsolètes ne
   retombent jamais sur le runtime primaire.
6. Chaque chemin d'activation de runtime valide la révision de la politique
   immédiatement avant sa publication.

## Politique de confiance

Le démon utilise un chargeur de politique sans effet de bord qui lit uniquement
les overrides système, les paramètres utilisateur, les défauts système, la
confiance IDE et `trustedFolders.json`. Les paramètres de workspace et les
fichiers d'environnement de projet sont exclus de l'évaluation de la
politique. La précédence existante des règles de confiance et le comportement
de comparaison de chemins sont préservés.

Le chargeur produit un snapshot sémantique immuable. Un workspace matérialise
ce snapshot en un booléen de confiance opérationnel et une liste de racines
autorisées. Seul un changement de matérialisation reconstruit un runtime. Les
changements de source seuls font avancer la révision de politique appliquée
sans reconstruction.

Le système de fichiers primaire conserve le comportement existant de
multi-root IDE fiable. Lorsqu'une racine secondaire est retirée de la liste de
racines autorisées du primaire, les générations secondaire et primaire sont
toutes deux fermées avant que l'une ou l'autre soit drainée.

Le moniteur relit les entrées de la politique une fois par seconde et publie
uniquement lorsque leur hachage sémantique change. Les écritures de dossiers
fiables depuis l'IDE et depuis le même processus déclenchent aussi une lecture
immédiate. `/workspace/reload` et l'enregistrement dynamique de workspace
demandent explicitement une réconciliation.

Les écritures de dossiers fiables acquièrent `proper-lockfile`, relisent sous
le verrou, préservent les commentaires et remplacent atomiquement un fichier
régulier en mode 0600 sans suivre les liens symboliques. Un fichier malformé
n'est pas réécrit silencieusement.

## Propriété du runtime

Le registre possède des objets `WorkspaceEntry` stables. Une entrée active
référence un `RuntimeGeneration` immuable, qui possède le runtime et sa garde
de génération. L'identité du workspace, les métadonnées d'enregistrement
persistant et l'état de la politique appliquée vivent sur l'entrée, pas sur la
génération. La construction et le nettoyage du runtime restent coordonnés par
l'hôte du démon.

Les routes de plan de données qualifiées par workspace résolvent leur runtime
au moment de la requête. Les routes primaires qui conservent des chemins à
l'échelle du processus utilisent des délégués live vers le runtime courant.
Les mutations REST privilégiées capturent la garde de génération et la
revérifient à leur frontière de commit. ACP, Voice, les workers de canal et
l'admission des sessions utilisent leurs mécanismes de drain existants. Le
statut de confiance et l'inventaire du démon lisent les entrées stables sans
acquérir de runtime.

L'index des propriétaires de session est conscient des générations. La
création et la restauration de session enregistrent la propriété
explicitement, et le remplacement de runtime invalide l'ancienne propriété. Le
scan existant des bridges actifs reste un chemin de réparation de
compatibilité pour les sessions antérieures à l'indexation.

Le nettoyage du runtime arrête le bridge et les canaux enfants, l'état Voice,
les sous-sessions, les montages ACP, les workers de canal, le keepalive
planifié et l'état git. Les gestionnaires possédés par le runtime remplaçant
sont reconstruits avec des entrées fraîches de paramètres, d'environnement,
de système de fichiers, de confiance, de politique et de cache. Les verrous de
chemins partagés et la télémétrie de processus survivent au remplacement car
ils ne portent aucune capacité de workspace.

## Réconciliation

La réconciliation de la confiance et la publication du runtime partagent une
seule porte de topologie du démon ; l'ajout et le rechargement de workspace
demandent une réconciliation à travers cette porte après leur propre
opération. Les snapshots de confiance sont coalescés afin que la dernière
révision observée soit appliquée avant que l'appelant soit libéré. L'arrêt
stoppe le moniteur et attend la porte de topologie avant de prendre son
snapshot de nettoyage.

Pour une diminution de confiance, le contrôleur ferme de manière synchrone
toutes les générations affectées avant le premier drain asynchrone, ferme les
chemins d'admission, détruit l'ancien runtime, construit un runtime frais,
revérifie la révision de la politique, et installe la nouvelle génération
d'entrée et le montage ACP. Les chemins d'arrêt existants du bridge et d'ACP
fournissent un nettoyage borné ou forcé. Un candidat obsolète est détruit et
reconstruit.

Un octroi utilise le même remplacement destructif. S'il échoue, le contrôleur
tente un nouveau runtime non fiable et rapporte la révision configurée comme
en échec jusqu'à ce qu'une réconciliation ultérieure réussisse. Si le
confinement du runtime ne peut pas être confirmé, l'entrée reste bloquée et la
santé profonde est dégradée ; les autres workspaces restent disponibles.

## Protocole

L'endpoint uniquement-requête reste uniquement-requête. Le statut de confiance
v1 reste la vue de compatibilité par défaut. Les clients demandent la v2 avec
`statusVersion=2` ; les anciens serveurs peuvent renvoyer la v1. La V2 sépare
la politique configurée de l'état effectif du runtime et rapporte `stable`,
`applying` ou `failed`, une révision opaque et un code d'erreur stable. Le
démon annonce `workspace_trust_hot_reload` uniquement après que le routage
primaire et secondaire utilise la résolution consciente des générations.

Aucun bus d'événements appliqués fiable n'est introduit. Le statut GET est la
source de vérité. Une requête de changement de confiance exige une génération
active pour publier l'événement existant ; sinon elle renvoie un 503
réessayable.

## Non-objectifs

- L'approbation directe de la confiance à distance.
- Les doubles runtimes sans interruption ou la migration de sessions.
- Les identifiants de génération publics.
- Les reconstructions parallèles de runtime.
- La reconstruction de l'application Express complète.
- Le changement des sémantiques de confiance du CLI autonome.
