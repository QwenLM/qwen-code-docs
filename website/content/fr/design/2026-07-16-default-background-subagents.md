# Sous-agents en arrière-plan par défaut

## Résumé

Les sous-agents one-shot de premier niveau devraient s'exécuter en arrière-plan par défaut. Les appelants
qui ont besoin d'un résultat inline peuvent s'en exclure avec `run_in_background: false`.
Les lancements de sous-agents imbriqués et les lancements épinglés à un `working_dir` détenu par l'appelant
restent des opérations au premier plan, car le cycle de vie actuel de l'arrière-plan ne peut pas
renvoyer les résultats à ces appelants en sécurité. Les forks et les coéquipiers nommés des Agent Teams
conservent leur comportement existant.

## Motivation

L'outil Agent prend déjà en charge l'exécution en arrière-plan pour les consommateurs interactifs,
headless et SDK, mais les appelants doivent actuellement la demander avec
`run_in_background: true` ou sélectionner un agent déclaré avec `background: true`.
Cela fait que la délégation ordinaire bloque le parent par défaut, même lorsque le parent
pourrait continuer un travail indépendant. Faire de l'exécution en arrière-plan le défaut au niveau supérieur
correspond mieux aux directives de délégation parallèle de l'outil, tout en conservant
une porte de sortie explicite vers le premier plan pour le travail dépendant du résultat.

## Objectifs

- Exécuter les sous-agents one-shot de premier niveau en arrière-plan lorsque
  `run_in_background` est omis.
- Préserver `run_in_background: false` comme opt-out explicite vers le premier plan.
- Préserver les chemins existants de notification de complétion, d'annulation, de concurrence,
  de permission, de transcription et d'attente headless.
- Garder les formes de lancement non sûres ou non prises en charge sur leur chemin premier plan existant.
- Documenter l'impact de compatibilité pour les skills et les appelants qui exigent un
  résultat inline.

## Non-objectifs

- L'exécution en arrière-plan des lancements de sous-agents imbriqués.
- L'exécution en arrière-plan dans un `working_dir` détenu par l'appelant.
- Des changements à l'héritage de contexte des forks ou au cycle de vie des forks.
- Des changements au comportement des coéquipiers nommés des Agent Teams.
- Un nouveau paramètre global pour la valeur par défaut.
- La refonte du routage des notifications d'arrière-plan ou de la propriété des tâches.

## Comportement

Le runtime résout l'exécution des sous-agents one-shot dans cet ordre :

1. Un coéquipier nommé d'Agent Teams utilise le chemin coéquipier existant.
2. Un fork valide de premier niveau utilise le chemin fork détaché existant.
3. Un sous-agent ordinaire imbriqué s'exécute au premier plan, même si l'arrière-plan a été
   demandé, afin que son résultat soit renvoyé à l'appelant imbriqué.
4. Un sous-agent ordinaire avec `working_dir` et sans défaut d'arrière-plan configuré
   s'exécute au premier plan, car l'appelant possède le cycle de vie de ce worktree.
   Une requête d'arrière-plan explicite ou configurée reste invalide.
5. Pour tout autre sous-agent ordinaire de premier niveau :
   - `run_in_background: false` s'exécute au premier plan.
   - `run_in_background: true` s'exécute en arrière-plan.
   - un `run_in_background` omis s'exécute en arrière-plan.

La frontmatter `background: true` existante au niveau de l'agent reste acceptée pour
compatibilité. Elle n'est plus nécessaire pour obtenir le nouveau défaut de premier niveau.
Une valeur explicite `run_in_background: false` dans l'appel d'outil est prioritaire et
sélectionne le chemin premier plan.

## Implémentation

La décision de dispatch reste dans l'outil Agent afin que chaque consommateur reçoive le
même comportement. La décision d'arrière-plan doit distinguer trois concepts :

- si l'appelant s'est explicitement exclu ;
- si le lancement est de premier niveau ;
- si la forme du lancement peut se détacher en sécurité.

L'implémentation doit réutiliser la branche arrière-plan existante plutôt que d'ajouter
un second chemin de lancement. Le texte du schéma de l'outil et les directives d'usage destinées au modèle
doivent décrire l'arrière-plan comme le défaut et indiquer aux appelants de passer
`run_in_background: false` lorsqu'ils ont besoin du résultat inline.

L'exception `working_dir` doit être résolue avant la garde d'incompatibilité existante.
Un paramètre d'arrière-plan omis ne doit pas transformer en erreurs des lancements de review
épinglés précédemment valides. Un `run_in_background: true` explicite ou un agent
configuré avec `background: true` reste incompatible avec `working_dir`,
préservant la vérification de sécurité existante.

## Flux de résultat

Un lancement en arrière-plan par défaut renvoie immédiatement au parent la réponse existante
de lancement en arrière-plan. La tâche détachée reste enregistrée dans le registre existant
des tâches en arrière-plan. Lorsqu'elle se termine, le registre émet la notification existante
de complétion, d'échec ou d'annulation, et le parent traite le résultat dans un tour ultérieur. Aucun nouveau format de message ni événement SDK n'est introduit.

Les opt-outs vers le premier plan continuent par la branche synchrone existante et renvoient
le résultat assaini du sous-agent inline.

## Documentation

Le guide utilisateur des sous-agents doit indiquer que les sous-agents one-shot nommés s'exécutent
en arrière-plan par défaut au niveau supérieur et expliquer
`run_in_background: false`. La comparaison avec les forks doit se concentrer sur l'héritage
de contexte et la sémantique des résultats, plutôt que d'affirmer que tous les sous-agents nommés
bloquent le parent.

## Tests

La couverture unitaire doit vérifier :

- qu'un sous-agent ordinaire de premier niveau avec un flag omis se lance en
  arrière-plan ;
- que `run_in_background: false` renvoie le résultat inline ;
- que `run_in_background: true` conserve le comportement existant en arrière-plan ;
- qu'un lancement imbriqué avec un flag omis ou true reste au premier plan ;
- qu'un lancement `working_dir` avec un flag omis reste au premier plan ;
- qu'une requête explicite d'arrière-plan avec `working_dir` reste rejetée ;
- que le comportement des forks et des coéquipiers nommés reste inchangé ;
- que le schéma de l'outil et les directives d'usage annoncent le nouveau défaut et l'opt-out.

Les tests existants qui exercent intentionnellement la branche premier plan doivent passer
`run_in_background: false` afin que leur attente soit explicite. Le fichier de tests ciblés de l'outil
Agent, le build et le typecheck sont requis avant la soumission. Une vérification E2E interactive
manuelle doit confirmer qu'une délégation normale rend la main immédiatement et livre ensuite
une notification de complétion, tandis qu'une délégation explicite au premier plan bloque et renvoie son résultat inline.

## Risques et compatibilité

Le changement casse le comportement pour les prompts, les skills et les appelants
programmatiques qui omettent le flag et supposent que la réponse de l'outil Agent contient le
résultat du sous-agent. Ces appelants doivent passer `run_in_background: false`.

L'exécution en arrière-plan par défaut peut aussi augmenter le travail concurrent. Les limites
globales de concurrence et la mise en file existantes restent les garde-fous de contrôle. Le traitement
des permissions, l'arrêt et l'attente headless utilisent déjà le cycle de vie établi des tâches
en arrière-plan et ne sont pas modifiés par cette conception.
