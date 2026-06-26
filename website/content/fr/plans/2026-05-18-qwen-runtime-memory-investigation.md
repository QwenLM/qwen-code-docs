# Plan d'investigation de l'utilisation mémoire de Qwen Code

Date : 2026-05-18

## Contexte

Les benchmarks locaux montrent que Qwen Code utilise significativement plus de RSS
d'arborescence de processus que Claude Code pour des tâches CLI non interactives
similaires. La dernière matrice de cinq cas a révélé que Qwen Code culminait autour
de `0,83-1,04 Gio` tandis que Claude Code restait autour de `0,27-0,36 Gio`.

Ce document propose une direction d'investigation et d'optimisation préliminaire. Il
n'a pas pour but de revendiquer une cause racine définitive pour l'instant. L'objectif
immédiat est de rendre l'écart mémoire révisable, reproductible et explicable à l'aide
de diagnostics internes.

## Progrès accomplis jusqu'à présent

L'investigation a atteint le stade de la preuve et de la direction :

- Une matrice locale reproductible a été construite pour la revue de petites PR, la
  navigation dans le code et les charges de travail synthétiques de diff.
- Qwen Code a été comparé sur plusieurs modèles.
- Qwen Code et Claude Code ont été comparés sur les mêmes formes de tâches lorsque
  des points d'accès de modèles équivalents étaient disponibles.
- L'écart de RSS observé est suffisamment cohérent pour justifier des diagnostics
  d'exécution plus poussés.
- Les travaux amont connexes ont été cartographiés afin que cet effort puisse
  s'appuyer sur les suivis existants de `/doctor memory` et de diagnostics mémoire.

L'investigation n'a pas encore atteint le stade de la cause racine définitive car
le RSS de processus externe ne peut pas montrer si la mémoire conservée est le tas
V8, la mémoire native, les modules chargés, l'historique actif, les résultats
d'outils ou l'état d'assemblage des requêtes.

## Preuves actuelles

Le rapport de benchmark compagnon est :

- `docs/e2e-tests/2026-05-18-qwen-memory-benchmark-report.md`

Les principales preuves sont :

- L'écart de RSS Qwen-vs-Claude s'est reproduit sur la revue de petites PR, la
  navigation dans le code et les charges de travail synthétiques de diff.
- L'écart s'est reproduit avec à la fois `pai/glm-5` et `qwen3.6-plus`.
- Qwen Code a utilisé plus de tokens que Claude Code dans chaque cellule de la
  matrice testée.
- Une grande taille de diff n'a pas produit d'augmentation linéaire propre de la
  mémoire, ce qui suggère que les chemins de base et de sortie bornée/tronquée
  importent plus que les octets bruts du diff seuls.

## Travaux connexes

Des travaux amont pertinents existent déjà :

| Élément   | Statut                | Rôle dans le travail mémoire                                                                                         |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `#4180`   | PR fusionnée          | Ajoute les diagnostics de base `/doctor memory`. Il s'agit de la première tranche d'instrumentation.                 |
| `#4181`   | issue ouverte, pas de PR | Ajoute l'interprétation et la classification de pression pour `/doctor memory`.                                    |
| `#4182`   | issue ouverte, pas de PR | Ajoute une sortie structurée `/doctor memory --json` et des statistiques de session sécurisées.                      |
| `#4183`   | issue ouverte, pas de PR | Ajoute des snapshots de tas optionnels et des diagnostics de chronologie mémoire bornée.                            |
| `#4184`   | issue ouverte, pas de PR | Ajoute des diagnostics de rétention de résultats d'outils volumineux et conçoit une mitigation par déchargement/aperçu. |
| `#4127`   | PR ouverte, conflictuelle | Ajoute des filets de sécurité de pression de tas pour la prévention OOM en session longue. Mitigation utile, insuffisante pour l'attribution. |
| `#4168`   | PR ouverte            | Redessine les seuils d'auto-compactage. Utile pour la pression de contexte, insuffisant pour l'analyse de l'empreinte au moment des tâches. |
| `#4172`   | PR ouverte            | Découple le rappel automatique de mémoire du chemin de requête principal. Utile pour la latence/blocage, pas une preuve directe de RSS. |
| `#4188`   | PR fusionnée          | Borne les caches de build/test pour éviter les OOM dans les exécutions de tests parallèles. Important mais distinct des benchmarks d'exécution. |

Cette investigation doit s'appuyer sur cette direction plutôt que d'attendre que
tous les issues de suivi soient résolus.

La plupart du travail restant est d'abord axé sur l'instrumentation. Les issues de
diagnostic ouverts sont conçus pour rendre les rapports mémoire explicables avant
de tenter une correction d'exécution. Les PR de mitigation ouvertes peuvent réduire
certains chemins OOM, mais elles n'expliquent pas encore pourquoi des tâches CLI non
interactives courtes culminent régulièrement près de `1 Gio`.

## Pourquoi cette ébauche commence par de la documentation

Cette ébauche commence intentionnellement par des preuves de benchmark et un plan
d'investigation plutôt que d'inclure une modification de code d'exécution.

Raisons :

1. L'objectif actuel est de rendre le problème de performance et la direction visibles,
   pas de revendiquer une correction du jour au lendemain.
2. Ajouter instrumentation et optimisation dans la même PR rendrait la révision plus
   difficile car cela mélange mesure, diagnostic et changements de comportement.
3. Le benchmark existant soutient déjà la nécessité de diagnostics plus poussés.
4. La prochaine PR peut être plus étroite et plus facile à valider : diagnostics
   uniquement, puis réexécution de la même matrice et comparaison des métriques
   internes.

La prochaine PR d'implémentation doit ajouter les compteurs et points de chronologie
manquants, puis réexécuter la matrice de benchmark. Ce n'est qu'après cela qu'une
PR d'optimisation ciblée devrait tenter de réduire la mémoire.

## Inférence de travail

Les données actuelles pointent davantage vers un problème d'exécution/chemin de
Qwen Code que vers un problème de fournisseur de modèle.

L'inférence la plus forte actuelle est :

> Qwen Code semble avoir une empreinte d'exécution de tâche CLI non interactive
> élevée, probablement amplifiée par une gestion plus lourde du contexte, des
> résultats d'outils et de session. La zone problématique probable est le runtime
> CLI et le chemin de données de l'agent, pas le modèle sélectionné seul.

Plus précisément, les preuves écartent « trop d'appels d'outils » comme cause
principale. Les nombres d'appels d'outils étaient similaires entre les CLI, et
Claude utilisait parfois plus de tours ou d'appels d'outils tout en maintenant
un RSS plus faible. Le problème le plus plausible est que Qwen Code initialise
ou conserve un état plus lourd pour la même tâche CLI non interactive courte,
puis amplifie cette empreinte d'exécution avec des données de contexte, de
résultats d'outils, de sorties sauvegardées ou d'historique de session plus
volumineuses.

Les compartiments les plus probables sont :

1. **Coût de démarrage/exécution du processus et des modules** : Qwen Code peut
   initialiser plus de runtime, d'outils, d'infrastructure d'interface/session ou
   de mécanismes de fournisseur que nécessaire pour les tâches CLI non interactives.
2. **Assemblage du contexte et de l'historique** : Qwen Code peut conserver ou
   construire un contexte plus volumineux orienté modèle que Claude Code pour la
   même forme de tâche.
3. **Rétention des résultats d'outils** : des résultats d'outils volumineux ou
   répétés peuvent être conservés dans l'historique actif, l'historique de
   l'interface, l'enregistrement de chat ou les chemins de récupération de sortie
   sauvegardée.
4. **Amplification par sous-agent et sortie sauvegardée** : les tests précédents
   avec de grandes PR ont montré une récupération de sortie sauvegardée et une
   activité de sous-agent, ce qui peut ajouter de la pression mémoire et de tokens.
5. **Processus enfants MCP** : le rapport de diagnostic compagnon a révélé que les
   serveurs MCP (ex. chrome-devtools) contribuent à hauteur d'environ `350 Mio` au
   RSS d'arborescence de processus. Cela gonfle les chiffres absolus mais représente
   une surcharge constante indépendante de la durée de session.
6. **Répartition mémoire native versus tas JS** : le RSS externe ne peut pas
   déterminer si la pression provient du tas V8, des tampons natifs, des modules
   chargés ou des données conservées.

Ceci est délibérément formulé comme une inférence. La prochaine étape consiste à
ajouter suffisamment de mesures internes pour confirmer ou infirmer chaque
compartiment.

## Périmètre proposé de l'ébauche de PR

La première ébauche de PR doit être axée sur les preuves et les diagnostics :

1. Valider le rapport de benchmark et le plan d'investigation.
2. Ajouter ou étendre la sortie de diagnostic locale afin que Qwen Code puisse
   rapporter :
   - les statistiques du tas V8 et des espaces du tas ;
   - la répartition RSS vs tas ;
   - le nombre de messages de session et la taille approximative conservée ;
   - le nombre de résultats d'outils, la taille totale conservée et la plus grande
     taille de résultat conservé ;
   - les compteurs de troncature et de récupération de sortie sauvegardée ;
   - l'activité des sous-agents/de l'arborescence des processus lorsque disponible.
3. Réexécuter la matrice existante avec :
   - la version publiée actuelle de Qwen Code ;
   - la branche `main` actuelle ;
   - la branche diagnostics uniquement ;
   - la branche d'optimisation candidate.
4. Utiliser ces mesures pour choisir une petite cible d'optimisation.

La première PR doit éviter de mélanger plusieurs optimisations non liées. Elle doit
rester soit uniquement documentaire, soit ajouter du code de diagnostic uniquement.
Une PR séparée doit porter la première réduction mémoire d'exécution une fois la
cause clarifiée.

## Directions d'optimisation candidates

Ce sont des candidates, pas des conclusions :

1. **Rétention bornée des sorties d'outils** : stocker les sorties volumineuses en
   dehors du chemin chaud et ne conserver dans l'historique actif que l'aperçu, les
   métadonnées et les pointeurs de récupération.
2. **Chargement paresseux non interactif** : éviter d'initialiser les sous-systèmes
   réservés à l'interface TUI ou interactive lors de l'exécution de tâches CLI non
   interactives.
3. **Limites de l'historique de session/interface** : dégrader les éléments
   d'historique anciens ou lourds en entrées de transcript compactes.
4. **Comptabilité d'assemblage de contexte** : mesurer et limiter les résultats
   d'outils volumineux avant la construction de la requête modèle.
5. **Comptabilité des sous-agents** : exposer le cycle de vie et l'impact mémoire
   des sous-agents dans les diagnostics.

Claude Code et OpenAI Codex (l'agent CLI de codage d'OpenAI) doivent être utilisés
comme références de conception pour la séparation des diagnostics, la rétention
bornée des sorties et le chargement paresseux de l'historique. L'implémentation
doit toujours suivre l'architecture et les tests propres à Qwen Code.

## Plan de validation

L'investigation doit conserver la même matrice de benchmark afin que les résultats
avant/après restent comparables :

- revue de petite PR
- navigation dans le code
- diff synthétique d'environ 100 Kio
- diff synthétique d'environ 1 Mio
- diff synthétique d'environ 5 Mio

Pour chaque exécution, enregistrer :

- pic de RSS d'arborescence de processus
- pic de RSS du processus racine
- pic du tas V8
- résumé des espaces de tas
- durée
- tours
- nombre de tokens
- nombre d'appels d'outils
- plus grand résultat d'outil conservé
- taille totale des résultats d'outils conservés
- nombre d'éléments de session/historique
- nombre de sous-agents

La condition minimale de succès pour une correction candidate n'est pas simplement
« le RSS a baissé ». Elle doit également identifier quelle métrique interne a changé
et pourquoi.

## Prochaine PR candidate

La prochaine PR doit être axée uniquement sur les diagnostics et doit éviter de
modifier le comportement d'exécution. Une tranche utile minimale ajouterait :

- la comptabilité de la taille d'entrée des requêtes modèle ;
- la comptabilité de la taille du prompt système et du schéma d'outils ;
- le nombre de messages conservés et la taille approximative en caractères ;
- le nombre de résultats d'outils conservés, la taille totale et la taille du plus
  grand élément ;
- des échantillons de cycle de vie autour du démarrage, de la première assemblée de
  requête, de l'exécution d'outil, de la complétion en streaming, de la compression
  et de la réponse finale ;
- des échantillons de mémoire de processus incluant RSS, tas utilisé, tas total,
  mémoire externe et statistiques d'espaces de tas.

Après son déploiement local, réexécuter la même matrice de modèles Qwen et
comparer :

- la version publiée de Qwen Code ;
- la branche `main` actuelle ;
- la branche diagnostics uniquement ;
- la branche d'optimisation candidate.

## Non-objectifs

Cette ébauche ne prétend pas que :

- toute la pression mémoire est causée par la sortie des outils ;
- une seule PR ouverte existante résoudra l'empreinte observée au moment des tâches ;
- les différences entre fournisseurs de modèles sont sans importance dans tous les
  environnements ;
- des mesures locales sur une seule exécution sont suffisantes pour des affirmations
  de performance de niveau release.

L'affirmation visée est plus restreinte : Qwen Code montre un écart de RSS local
cohérent dans les charges de travail testées, et le projet a besoin de diagnostics
internes pour expliquer et réduire cet écart.