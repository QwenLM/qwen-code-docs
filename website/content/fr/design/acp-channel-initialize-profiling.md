# Profilage de l'initialize du canal ACP

## Résumé

Le span `channel.initialize` du démon démarre après que l'enfant ACP est spawné
et se termine quand l'enfant retourne sa réponse initialize ACP. Il inclut
donc le démarrage de Node et d'ESM, le bootstrap du CLI, le chargement des
modules ACP, le `Config.initialize()` de bootstrap, la mise en place du
transport et le gestionnaire initialize. Le gestionnaire lui-même ne retourne
que les capacités et n'est pas censé expliquer la latence observée.

Ce design ajoute un profil de démarrage d'enfant fixe et opt-in à la réponse
initialize ACP et copie les durées validées sur le span parent
`channel.initialize` existant. Il ne modifie ni la disponibilité du canal, ni
l'ordre d'initialisation, ni la gestion des échecs, ni le comportement des
sessions.

## Protocole

Le bridge demande la version 1 du profil via les métadonnées de la requête
initialize :

```json
{
  "_meta": {
    "qwen.daemon.channelStartupProfile": { "v": 1 }
  }
}
```

Les enfants compatibles retournent le profil sous la même clé de métadonnées
de réponse de premier niveau. La réponse ne contient que des champs de durée
fixes, un flag d'exhaustivité, l'horodatage temps réel de construction de la
réponse et la durée totale du processus enfant à la réponse. Elle ne contient
jamais de chemins, de noms d'extension, de réglages ou d'autres valeurs
dérivées de l'utilisateur.

Le profil divise le démarrage de l'enfant en phases de premier niveau non
chevauchantes :

- du démarrage du processus à la disponibilité du profileur ;
- l'import des modules Gemini ;
- le parsing des arguments ;
- le chargement des réglages ;
- la construction de Config ;
- l'initialisation applicative générique ;
- l'import des modules ACP ;
- l'initialisation de la Config de bootstrap ;
- la construction du transport ;
- l'exécution du gestionnaire initialize ;
- le temps non attribué entre les phases fixes.

L'initialisation de la Config de bootstrap est découpée en rafraîchissement
initial des extensions, hooks, skills, rafraîchissement final des extensions,
mémoire hiérarchique, registre d'outils, préchauffage des outils et temps
résiduel. La sonde ripgrep est rapportée comme un enfant du temps du registre
d'outils et n'est pas soustraite à nouveau lors du calcul du temps résiduel.
Le temps non attribué de premier niveau inclut aussi l'attente entre la mise
en place du transport et l'arrivée de la requête initialize au gestionnaire de
l'enfant.

Toutes les durées utilisent `performance.now()` et sont arrondies à deux
décimales. L'epoch de construction de la réponse utilise
`performance.timeOrigin` plus le mark de réponse et n'est utilisée que pour
l'estimation optionnelle du transport côté parent.

## Cycle de vie de la collecte

Le CLI initialise dynamiquement le profileur ACP uniquement quand les
arguments bruts contiennent `--acp` ou `--experimental-acp`, avant d'importer
le runtime Gemini. Le profileur stocke le premier horodatage pour une union
finie de noms de marks. Il n'effectue ni E/S de fichier, ni capture de heap,
ni initialisation de télémétrie, ni rétention dynamique d'événements.

L'exutoire d'événements de démarrage du cœur transmet les événements de phase
de Config fixes au profileur ACP uniquement pendant que la Config de bootstrap
ACP est en cours d'initialisation. Cela empêche les initialisations de Config
par session ultérieures de contaminer le profil de démarrage. Les phases de
Config sautées émettent quand même des marks de début et de fin adjacents afin
qu'un démarrage réussi puisse produire un profil complet en mode nu ou sûr.

Le gestionnaire initialize fige le profileur après avoir construit la première
réponse, que l'appelant ait négocié le profil ou non. Des marks manquants
produisent `complete: false` ; la collecte ne retarde ni ne fait jamais
échouer la réponse initialize.

## Enrichissement du span parent

Le bridge valide les métadonnées de réponse avant d'ajouter des attributs
numériques fixes au span `channel.initialize` actif. Les versions de profil
inconnues sont ignorées. Les champs inconnus sont ignorés. Les valeurs connues
doivent être finies, non négatives et au plus égales à 600 secondes. Les
champs connus invalides ou manquants sont omis et rendent le flag
d'exhaustivité effectif faux.

L'estimation optionnelle du transport de la réponse est l'heure de réception
du parent moins l'epoch de construction de la réponse de l'enfant. Elle n'est
enregistrée que si elle est finie, non négative et au plus égale au timeout
d'initialize configuré.

Le parsing du profil et l'enrichissement de télémétrie sont fail-open. Un
profil manquant, malformé ou non pris en charge ne doit pas modifier le succès
d'initialize, la fermeture du canal, le comportement de l'appelant coalescé ni
le comportement de retry. Les nouveaux parents restent compatibles avec les
anciens enfants car les métadonnées ACP sont extensibles ; les nouveaux
enfants ne retournent aucun profil aux anciens parents qui n'ont pas opté
pour ce profil.

## Vérification

Les tests ciblés couvrent l'activation et le figeage du collecteur,
l'arithmétique des phases fixes, la taille du payload, la négociation du
protocole, les profils malformés, l'enrichissement du span, l'isolation des
échecs de télémétrie, l'ordre des événements de Config et la frontière du
bundle du fast path de serve. Le candidat construit en release est comparé à
la base de référence exacte du merge #6907 sur l'hôte représentatif 2C4G avec
des exécutions à froid appariées et alternées avant que toute optimisation
soit sélectionnée.

## Décision d'optimisation P0-B

Le profil P0-A sur 2C4G a attribué 67,3 % du P50 de démarrage de l'enfant au
chargement des modules Gemini et ACP. Les profils CPU ont ensuite montré que
la compilation des modules source était le coût CPU le plus élevé et que le
graphe d'imports statiques d'ACP chargeait Ink, React, React Reconciler et
Yoga alors que l'enfant ACP ne rend pas de TUI.

Les arêtes optionnelles étaient des dépendances UI-only existantes plutôt
qu'un nouveau point d'entrée ACP. La Session ACP importait un classifieur
d'erreurs d'API via un hook React ; la complétion d'extension importait sa
forme de données et sa limite de résultats via un composant de rendu ; le
registre de commandes chargeait statiquement un support UI nécessaire
uniquement quand `/init` demande une confirmation, que le mode d'approbation
passe en mode auto ou que l'historique replié se déplie. L'optimisation sort
les deux helpers de données purs des modules de rendu, rend l'import de type
React uniquement de type et charge les trois dépendances d'action interactive
uniquement quand ces actions s'exécutent.

La réponse initialize ACP, l'ordre de démarrage, l'initialisation de Config,
le contenu du registre de commandes, la gestion des échecs et le comportement
de Session restent inchangés. Une vérification de bundle-metafile suit la
fermeture de sortie statique de l'agent ACP et rejette les entrées Ink, React,
React Reconciler ou Yoga tout en continuant de les autoriser derrière des
imports dynamiques.

La comparaison causale a utilisé des artefacts de release construits depuis le
même commit de main, `af6a9b640c5d9097c5151b8705dd73aee8e180d0`, avec
uniquement cette optimisation appliquée au candidat. Deux exécutions à froid
alternées ont produit 60 paires après un échauffement exclu ; une exécution
préchauffée alternée séparée a produit 30 paires. La seconde exécution à froid
a été démarrée après que la première eut exposé deux blocages de listener
parent côté candidat avant le chemin ACP. Aucun échantillon des deux
exécutions n'a été écarté. Les résultats P50 à froid agrégés étaient :

| Métrique                    | Contrôle apparié | Candidat P0-B |             Variation |
| ------------------------- | --------------: | -------------: | -----------------: |
| Import ACP                |       115,06 ms |       52,00 ms | -63,06 ms (-54,8%) |
| Processus enfant à la réponse |      1102,88 ms |     1041,09 ms |          -61,80 ms |
| `channel.initialize`      |      1098,25 ms |     1035,61 ms |          -62,64 ms |
| Processus à la première Session  |      2046,88 ms |     1980,03 ms |          -66,85 ms |
| Requête de Session à froid      |      1358,95 ms |     1290,23 ms |          -68,72 ms |

Les 60 profils à froid de chaque variante et les 30 profils préchauffés de
chaque variante étaient complets. Chaque exécution s'est terminée proprement,
et les premières Sessions concurrentes, les démarrages avec télémétrie
désactivée et le comportement legacy `single` par défaut ont réussi dans les
deux tours fonctionnels. Dans les données à froid agrégées, le P95 de Session
chaude est passé de 137,53 ms à 104,98 ms, le P95 de première health de
962,99 ms à 824,14 ms et le P95 du RSS de l'arbre de processus de 442,27 MiB
à 435,70 MiB. Dans les données préchauffées, le P50 de Session est passé de
73,90 ms à 73,75 ms et le P95 de 88,38 ms à 76,17 ms.

Des blocages transitoires à l'échelle de l'hôte ont affecté les deux variantes
et ont été conservés. Dans la première exécution de 30 paires, deux blocages
de listener parent du candidat ont fait passer le P95 de première health de
803,82 ms à 1175,67 ms alors que les requêtes health elles-mêmes prenaient
6-11 ms et que le chemin ACP modifié n'avait pas démarré. Le retry de
diagnostic a inversé la direction, avec des P95 de première health
contrôle/candidat de 1522,44/727,64 ms ; l'agrégation des 60 paires
conservées a produit les valeurs ci-dessus. Le merge P0-A exact a aussi été
comparé au candidat comme vérification secondaire de 30 paires et a montré
indépendamment la même réduction d'import ACP et aucune régression P95.

Le candidat de chargement de modules passe donc la gate P0-B : la phase
sélectionnée s'améliore de plus de 30 % et 10 ms, tandis que
`channel.initialize` et le P50 de processus-à-première-Session s'améliorent
tous deux de plus de 10 ms. Les constructeurs de commandes yargs paresseux de
premier niveau ont été rejetés car l'amélioration de leur phase sélectionnée
ne passait pas la gate de 30 %. Le registre d'outils et le préchauffage
restent un design de découplage de descripteurs séparé ; le rafraîchissement
des extensions, la mémoire hiérarchique et le transport étaient trop petits
pour justifier un changement de comportement P0.
