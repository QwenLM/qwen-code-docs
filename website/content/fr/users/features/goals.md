# Goals

Un Goal maintient Qwen Code en activité à travers les tours jusqu'à ce qu'une condition déclarée soit remplie. Définissez-en un avec `/goal <objective>` ; après chaque tour, un vérificateur indépendant examine la transcription, et la session continue jusqu'à ce que l'objectif soit vérifié comme terminé, vérifié comme bloqué, mis en pause ou effacé.

## Commandes

| Commande                 | Comportement                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `/goal`                  | Afficher le Goal actuel et son statut.                          |
| `/goal <objective>`      | Créer un Goal, ou remplacer celui actif.                        |
| `/goal set <objective>`  | Identique au précédent, sous forme explicite.                   |
| `/goal edit <objective>` | Réviser le libellé du Goal actif sans recommencer depuis le début. |
| `/goal pause` / `resume` | Arrêter ou continuer la boucle sans perdre le Goal.             |
| `/goal clear`            | Supprimer le Goal.                                              |
| `/goal-draft <intent>`   | Faire rédiger l'objectif pour vous avant de le définir (ci-dessous). |

Créer, modifier ou reprendre un Goal nécessite un workspace de confiance (`/trust`). L'utilisation headless est couverte dans [Mode Headless](./headless.md#run-a-persistent-goal).

## Comment un Goal est évalué

Le vérificateur n'exécute jamais de commandes ni ne lit de fichiers de lui-même. Il ne voit que ce qui est déjà dans la transcription :

- Les sorties visibles de l'assistant et les résultats d'outils comptent comme des preuves. Le texte de l'objectif, vos prompts et le raisonnement caché du modèle ne comptent pas.
- Du texte affiché prouve seulement que du texte a été affiché. Une affirmation selon laquelle des tests passent, qu'un fichier a été modifié ou qu'une remote est mise à jour nécessite le résultat d'outil correspondant dans la transcription.
- Une affirmation selon laquelle vous avez confirmé, choisi ou approuvé quelque chose nécessite un vrai message de votre part ; le vérificateur rejette les propositions qui le supposent.
- Lorsque la preuve est absente, le verdict est « pas encore », pas « terminé ». Une condition que personne ne peut étayer maintient la boucle en activité jusqu'à ce qu'une limite l'arrête.

L'objectif doit donc amener l'agent à produire des preuves : exécuter la vérification nommée et montrer la sortie décisive.

## Rédiger un bon objectif

Incorpérez ces éléments dans l'objectif, dans cet ordre :

| Partie       | Quoi écrire                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Outcome:`   | Une phrase : ce qui est vrai lorsque c'est terminé.                                                                                   |
| `Done when:` | Vérifications binaires numérotées. Au moins une nomme une commande et son code de sortie ou sa ligne de sortie attendue, et demande que cette ligne soit collée. |
| `Must not:`  | Fichiers à ne pas toucher, tests ou seuils à ne pas affaiblir, actions irréversibles (push, delete, publish) à ne pas effectuer.      |
| `Budget:`    | Quand abandonner : « stop as blocked after 20 turns » ou une limite de temps.                                                         |
| `On block:`  | Quoi signaler en cas de blocage, et quelle décision un humain doit prendre.                                                           |
| `Context:`   | Uniquement les faits que l'agent ne peut pas trouver dans le workspace : branche, environnement, décisions antérieures.                |

Limitez-vous à un seul objectif et environ 1 200 caractères. `/goal set` et `/goal edit` fusionnent les sauts de ligne en espaces, numérotez donc les éléments plutôt que de compter sur les retours à la ligne.

| Faible                     | Pourquoi ça échoue                                        | Plus solide                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| make checkout faster       | Pas de seuil, pas de vérification.                        | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| clean up the auth module   | « Clean » n'a pas de preuve.                              | Demandez ce qui serait observable : zéro warning lint dans `src/auth`, un seuil de couverture, un nombre de fichiers.                                                                                                                     |
| ship the release           | Irréversible, et nécessite une décision humaine.          | Restreignez à un état pré-release vérifiable (le tag existe, `npm run release:dry-run` sort avec 0) et mettez « do not publish » dans `Must not`.                                                                                        |
| after I confirm the design | Le vérificateur ne peut pas voir une confirmation qui n'a jamais eu lieu. | Déplacez-le dans `On block:` comme la décision qu'un humain doit prendre.                                                                                                                                                                |

## Laissez `/goal-draft` le rédiger

`/goal-draft <ce que vous voulez faire>` est un skill intégré qui fait ce qui précède pour vous. Il vérifie si la requête est bien un Goal, lit le workspace pour trouver les vraies commandes de test et de lint au lieu de deviner, pose au maximum une série de questions à choix multiples lorsque la réponse modifie la vérification ou le périmètre, rédige l'objectif dans le format ci-dessus, exécute l'auto-vérification, et affiche une ligne `/goal set …` que vous pouvez exécuter telle quelle. Il ne démarre jamais le travail lui-même et ne définit jamais le Goal en votre nom.

Passez un objectif existant pour le renforcer : `/goal-draft all tests pass and the lint is clean`.

Le skill est configuré pour être en lecture seule, et seuls ses outils non mutatifs sont auto-approuvés (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` n'est volontairement pas auto-approuvé, donc sa boîte de dialogue de questions est affichée avant que le skill ne rédige à partir de vos réponses. Comme les autres skills intégrés, un skill de projet ou personnel nommé `goal-draft` le remplace, et `skills.disabled` peut le désactiver. Consultez [Skills](./skills.md) pour savoir comment les skills intégrés sont découverts.
