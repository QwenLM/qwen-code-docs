# Guidage en cours de tour du mode plan et frontière d'entrée

## Problème

`enter_plan_mode` change le mode d'approbation pendant qu'un tour du modèle
est encore en cours de traitement. Avant ce changement, une invocation
réussie ne renvoyait qu'une phrase courte, donc le modèle ne recevait les
contraintes complètes du mode plan qu'à un tour ultérieur. Les appels
d'outils frères de la même réponse du modèle pouvaient aussi s'exécuter de
part et d'autre de la transition de mode : les appels avant l'entrée
s'exécutaient sous le mode précédent, tandis que les appels après
s'exécutaient une fois le mode plan actif sans être replanifiés contre la
nouvelle frontière.

## Contrat

Une invocation de `enter_plan_mode` réussie ou déjà active renvoie le même
rappel complet produit par `getPlanModeSystemReminder()`. Les sessions SDK
reçoivent la variante spécifique au SDK. L'entrée YOLO non sollicitée, les
échecs de transition et le rejet par un sous-agent ou un teammate conservent
leurs résultats existants car aucune transition de mode plan n'a eu lieu.

Lorsqu'un lot exécutable après déduplication contient plus d'un appel et que
l'un des appels est `enter_plan_mode`, le premier appel d'entrée est une
frontière d'exécution. Seul cet appel est éligible à l'exécution. Tous les
autres frères exécutables, qu'ils soient apparus avant ou après l'entrée,
reçoivent une réponse terminale `EXECUTION_DENIED` demandant au modèle de
réessayer au tour suivant après avoir observé le nouveau mode d'approbation.
Un échec de l'entrée ou un succès idempotent ne libère pas les frères.

Les décisions terminales existantes sont prioritaires. La détection de boucle
rejette d'abord tout le lot. Les réponses de provider dupliquées sont émises
à leurs positions d'origine mais ne sont pas des frères exécutables. En mode
structured-output, le pré-scan structured-output existant reste terminal et
supprime `enter_plan_mode` avec les autres appels non structurés.

`exit_plan_mode` n'est pas une frontière d'exécution dans ce changement. Son
approbation utilisateur explicite et ses protections contre le contexte
obsolète sont indépendantes.

## Intégration

Le planificateur du cœur applique la frontière après la déduplication des IDs
d'appel et la résolution des noms canoniques, avant les vérifications de
permission, la recherche dans le registre, les hooks ou la construction des
invocations. Les appels sautés ne demandent donc pas de permissions ni
n'exécutent les hooks par outil. Ils restent des résultats de lot terminaux
afin que le callback de complétion existant, l'enregistrement, la télémétrie
et le chemin d'audit `PostToolBatch` observent une réponse complète pour
chaque ID d'appel accepté. Les vues de générateur de contenu spécifiques à
chaque runtime sont nettoyées avec les autres résultats terminaux.

ACP applique la même politique après le traitement des boucles et des
providers dupliqués et avant l'exécution de ses lots séquentiels ou Agent.
Les réponses dupliquées restent ordonnées. ACP n'introduit pas de hook
`PostToolBatch` car ce chemin n'en prend intentionnellement pas en charge.

Le mode headless applique la politique après le filtrage des doublons et du
structured-output. Les appels sautés sont émis et renvoyés comme résultats
d'outil refusés dans leur ordre d'origine, mais ne consomment pas le budget
`--max-tool-calls`. L'entrée elle-même suit le budget et le comportement
d'annulation normaux.

## Préservation de la sortie

Le rappel est une politique de cycle de vie, pas un payload d'outil ordinaire.
`enter_plan_mode` déclare une limite de sortie par outil infinie, est exempté
de la porte de déversement de persistance du planificateur, et n'est pas
candidat au déchargement agrégé de lot. Ces trois protections empêchent la
politique d'être tronquée, remplacée par un pointeur de fichier ou réduite à
un aperçu avant le prochain tour du modèle.

## Validation

La couverture unitaire vérifie les rappels DEFAULT et SDK exacts, le succès
et l'entrée idempotente, la sélection de la première entrée, le refus des
frères des deux côtés, l'ordre des providers dupliqués, la comptabilisation
du budget headless, la préservation du rappel complet sous des seuils de
sortie volontairement minuscules, la visibilité `PostToolBatch` et le
nettoyage des vues du runtime. Les suites existantes du planificateur, d'ACP
et du headless couvrent les comportements environnants de permission, de
boucle, de duplication, de structured-output et d'annulation.

La validation sur hôte géré doit confirmer que le client ACP reçoit un
résultat pour chaque appel d'outil et que la prochaine requête du modèle
contient le rappel complet plus les réponses de refus des frères. Cette
validation nécessite un build déployé et un ID de session d'hôte ; elle n'est
pas simulée en modifiant le routage de production dans cette PR.
