---
title: 'Plan Mode Shell Routing and Exact One-Off Approval'
date: '2026-07-17'
status: 'implemented'
---

# Routage Shell du mode plan et approbation unique exacte

## Problème

Le mode plan a historiquement traité la forme de la confirmation comme un
indicateur du caractère lecture-seule d'un outil. C'est insuffisant pour
`run_shell_command` et `monitor` : les deux outils peuvent représenter des
programmes shell lecture-seule, modifiant l'état, ou inconnus du parseur,
tandis que les règles de permission, les hooks, les hôtes ACP, stream-json,
la TUI, les teammates et les bridges en arrière-plan peuvent tous résoudre la
même approbation par des chemins différents.

La frontière de sécurité doit distinguer une écriture connue d'une commande
inconnue sans faire de `unknown` un moyen de contourner le mode plan. Une
approbation doit aussi rester liée à la requête exacte du modèle qui a
produit le prompt ; un changement de mode ultérieur, un changement de
politique de permission, une réécriture par l'hôte, une modification par
l'éditeur ou une réponse en concurrence ne doit pas la réutiliser.

Cette conception dépend du classifieur shell à trois états fusionné dans
#7053.

## Objectifs

- Appliquer une seule politique de routage aux appels Shell et Monitor
  initiés par le modèle dans Core et ACP.
- Exécuter sans nouveau prompt spécifique au plan uniquement les commandes
  classées `read-only`.
- Bloquer les commandes classées `write` avant que les hooks de confirmation
  ou les hôtes ne puissent les approuver.
- Permettre `unknown` uniquement via une confirmation exacte et à usage
  unique tout en gardant le mode plan actif.
- Préserver un deny explicite du PermissionManager sur chaque route
  spécifique au plan.
- Véhiculer les avertissements et les choix réellement permis à travers la
  TUI, ACP, stream-json, dual-output, les teammates, les sous-agents et les
  bridges en arrière-plan.
- Ne pas modifier le comportement du plan hors Shell et les sémantiques
  explicites de sortie du plan.

## Non-objectifs

- Modifier le cycle de vie de la porte du plan ou injecter un nouveau rappel
  pendant un tour ACP déjà en cours.
- Gouverner les entrées shell `!command` saisies par l'utilisateur.
- Ajouter un type de confirmation, un paramètre, un cache, un feature flag ou
  une capacité one-off persistante.
- Modifier les outils de requête spécifiques à DataWorks.
- Faire fournir par la spéculation une surface d'approbation interactive.

## Modèle de menace

L'actif protégé est le système de fichiers de l'utilisateur, les processus,
l'état visible sur le réseau, l'état du dépôt et la frontière du mode
d'approbation pendant que le mode plan est actif. Les entrées non fiables
incluent les arguments d'outils du modèle, la syntaxe shell que le parseur ne
peut pas prouver sûre, les `updatedInput` renvoyés par les hooks, les IDs
d'options ACP, les réécritures d'hôte stream-json, les callbacks d'édition
IDE, les réponses de teammates/en arrière-plan, et les réponses dupliquées
d'hôtes attachés simultanément.

Les attaques pertinentes sont :

- utiliser une règle allow ou un bridge de type YOLO pour contourner le mode
  plan ;
- déguiser une écriture connue avec un wrapper pour qu'elle atteigne un
  chemin plus faible ;
- approuver une commande et exécuter une requête modifiée ou une invocation
  validée ;
- quitter le mode plan puis y revenir pendant qu'un ancien prompt reste
  visible ;
- ajouter une règle deny après l'affichage du prompt mais avant la
  consommation de l'approbation ;
- forger une option persistante ou de modification non proposée ;
- approuver deux fois via la TUI, l'entrée distante, l'IDE ou les bridges en
  arrière-plan ;
- utiliser l'approbation persistante d'un appel frère pour auto-approuver
  l'appel Plan Shell.

## Politique de routage

L'évaluation L3/L4 du PermissionManager reste l'autorité pour le deny dur.
Après cette décision et la porte teammate requise par le plan, le routage
Plan Shell classe la commande validée.

| Classification | PM deny | PM allow             | PM ask/default       | Aucun hôte d'approbation                          |
| -------------- | ------- | -------------------- | -------------------- | ------------------------------------------------ |
| `read-only`    | deny    | exécution            | prompt unique exact  | deny quand le prompt PM ordinaire ne peut pas être affiché |
| `write`        | deny    | blocage plan         | blocage plan         | blocage plan                                     |
| `unknown`      | deny    | prompt unique exact  | prompt unique exact  | refus sûr pour le plan                           |

La classification de Monitor utilise
`normalizeMonitorCommand(command).safetyCommand` ; la classification de Shell
utilise la chaîne de commande originale de l'invocation validée. La
spéculation ne s'exécute que lorsque le résultat à trois états est exactement
`read-only` ; `write`, `unknown`, un échec du parseur et une entrée vide
s'arrêtent à la frontière de la spéculation.

## Capacité d'invocation exacte

La classification crée un snapshot immuable contenant :

- les arguments originaux de la requête d'outil ;
- les paramètres de l'invocation validée ;
- la révision courante du mode d'approbation ;
- le contexte de vérification du PermissionManager, y compris le répertoire
  de travail effectif Shell/Monitor ;
- la commande Shell ou Monitor brute utilisée pour l'affichage.

Core et ACP clonent l'invocation Plan Shell/Monitor avant la classification
afin que l'entrée brute visible par l'hôte ne puisse pas conserver un alias
vers les paramètres exécutables. Quand le modèle omet `directory`, ce clone
est aussi lié au répertoire de travail courant de la session. La requête
originale reste inchangée, tandis que l'exécution ne suit plus une
délocalisation de répertoire ultérieure du démon/ACP ou une mutation de
l'objet requête après que l'approbation a été consommée.

Le planificateur valide ce snapshot après la classification, avant
l'affichage de la confirmation et avant la consommation d'une confirmation.
La validation exige :

- une requête live et non annulée ;
- le mode plan avec la même révision, de sorte que Plan → autre mode → Plan
  invalide le prompt ;
- une égalité profonde des arguments de la requête et des paramètres de
  l'invocation validée ;
- le même répertoire de travail effectif lorsque l'invocation repose sur le
  répertoire ambiant de la session ;
- une évaluation courante réussie du PermissionManager qui ne renvoie pas
  `deny`.

Des changements ultérieurs en `allow`, `ask` ou `default` ne reroutent pas un
prompt déjà sélectionné. Une exception du PermissionManager échoue en fail
closed. Une fois la validation finale réussie, la capacité est consommée ; un
changement ultérieur de mode ou de règle ne révoque pas l'invocation déjà
consommée.

Seuls `ProceedOnce` et `Cancel` sont acceptés. `updatedInput` n'est accepté
que s'il est profondément égal à la requête snapshotée. `newContent` n'est
jamais accepté. Une approbation réussie transmet un payload vide à l'outil,
afin que les réponses, les règles de permission ou les métadonnées visibles
uniquement par l'hôte ne puissent pas devenir une permission durable. Les
résultats invalides deviennent `Cancel` avec le message d'approbation
obsolète.

La fermeture de confirmation de Core revendique la réponse de manière
synchrone avant son premier `await`. Les réponses concurrentes de la TUI, de
l'entrée distante, des teammates, de l'IDE ou de l'arrière-plan ne peuvent
donc pas consommer la capacité deux fois. Les confirmations d'édition Plan
Shell n'entrent jamais dans le chemin d'auto-diff IDE, et les approbations
persistantes frères sautent les confirmations marquées `hideAlwaysAllow`.

## Présentation de la confirmation

Chaque prompt Plan Shell masque l'approbation persistante. Les confirmations
inconnues ajoutent :

> Le mode plan n'a pas pu déterminer si cette commande shell est
> lecture-seule. L'approbation ne s'applique qu'une seule fois à cette
> invocation exacte ; elle peut modifier l'état du système, et le mode plan
> restera actif.

Les confirmations d'édition inconnues masquent aussi les actions de
modification et ajoutent la commande brute comme second avertissement tout en
conservant le diff. La TUI rend les avertissements d'édition au-dessus du
diff et réserve leur hauteur enveloppée afin que les options restent visibles
sur les petits terminaux. ACP envoie les avertissements avant le contenu du
diff ou du plan. Stream-json et dual-output incluent les avertissements dans
leur champ `permission_suggestions` existant.

ACP et les bridges de sous-agents imbriqués valident l'ID d'option renvoyé
par rapport aux options exactes envoyées à l'hôte. La sortie du plan conserve
ses quatre choix spéciaux existants car ces choix ont réellement été envoyés.
Les options manquantes, forgées, masquées ou malformées échouent en fail
closed.

Les événements teammate portent des détails de confirmation sans callback en
option. Stream-json les utilise pour les avertissements tandis que le
planificateur Core du teammate reste le validateur final de l'invocation
exacte. Le YOLO headless annule une confirmation hors plan marquée
`hideAlwaysAllow` car aucune surface d'avertissement interactive n'existe.
L'approbation en arrière-plan ne convertit jamais un résultat persistant non
proposé en `ProceedOnce` ; les résultats persistants hors plan annulent,
tandis que la confirmation du plan conserve uniquement son choix
`ProceedAlways` réel.

## Messages d'échec

Les écritures connues, les surfaces d'approbation inconnues indisponibles et
les approbations obsolètes utilisent les messages fixes du plan
d'implémentation. Ces messages indiquent délibérément que le mode plan reste
actif et interdisent de retenter les écritures connues via des wrappers ou de
l'obfuscation.

## Alternatives rejetées

- **Traiter unknown comme write.** Plus simple, mais bloque des
  investigations nécessaires lorsque le parseur ne peut pas modéliser une
  commande par ailleurs légitime.
- **Traiter unknown comme read-only après un allow PM.** Une règle allow
  n'est pas une preuve de comportement lecture-seule et effacerait la
  frontière du plan.
- **Persister une règle allow après une approbation inconnue.** Le résultat
  du classifieur et la requête exacte sont transitoires ; la persistance
  autoriserait une commande future plus large.
- **Réutiliser l'acceptation de diff IDE.** Les callbacks IDE peuvent changer
  le contenu et entrer en concurrence avec la surface d'avertissement, ils ne
  peuvent donc pas consommer en sécurité une capacité shell exacte.
- **Valider uniquement les arguments bruts de la requête.** Les
  constructeurs d'outils normalisent et valident l'entrée ; les formes brute
  et exécutable doivent toutes deux rester liées.
- **Valider uniquement à la création du prompt.** Le mode et l'état des
  permissions peuvent changer pendant qu'un prompt est visible.
- **Ajouter un type de confirmation dédié ou un feature flag.** Les formes
  de confirmation existantes et les champs d'avertissement suffisent et
  gardent le changement plus petit.

## Vérification

La couverture unitaire exerce la classification de la politique, les
snapshots, l'annulation, les changements de révision et d'arguments, les
deny/erreur du PermissionManager, la décoration des avertissements, la
désinfection des payloads, le routage Core, la propriété des réponses
dupliquées, l'auto-approbation frère, le comportement des éditions sed
enveloppées, la parité Monitor, la spéculation, les options et
avertissements ACP, le SubagentTracker, le stream-json teammate, la
normalisation en arrière-plan, dual-output, le layout TUI et le libellé des
prompts.

La validation manuelle utilise un workspace Git jetable contenant un fichier
d'exemple et couvre ces cas :

1. En mode plan, vérifier que `git status` s'exécute, que
   `touch changed.txt` est bloqué, et qu'une commande inconnue telle que
   `python -c 'print(1)'` n'offre qu'une approbation unique et l'annulation
   avant de redemander lors de son invocation suivante.
2. Exécuter une édition enveloppée dans une confirmation compacte étroite et
   vérifier que la commande brute, l'avertissement, le contexte du diff, la
   question et les choix disponibles restent visibles tandis que la
   modification et l'approbation persistante restent indisponibles.
3. Changer la révision du mode plan ou le répertoire de travail pendant
   qu'une approbation est en attente, renvoyer des payloads d'approbation
   modifiés ou non proposés, et envoyer des réponses dupliquées ou tardives ;
   vérifier que chaque chemin annule sans exécution.
4. Répéter les cas lecture-seule, écriture et inconnu via Monitor, ACP,
   stream-json, les teammates imbriqués et l'exécution en arrière-plan ;
   vérifier que chaque surface utilise la même classification et le même
   comportement fail closed.
